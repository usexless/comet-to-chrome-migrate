// Passwort-Transfer Comet -> Chrome. Vollautomatisch, ohne Windows Hello,
// ohne Dialoge, ohne CSV/Klartext-Datei.
//
// Warum das ohne Reauth geht: Chromes "vor dem Ausfuellen erneut
// authentifizieren" haengt auf Windows nur an einem Pref
// (password_manager.biometric_authentication_before_filling, Default: aus).
// Ein normaler Autofill loest also keine Windows-Hello-Abfrage aus. Comet
// bekommt auf der Original-Origin eine eigene Mini-Seite ausgeliefert und
// schreibt das gespeicherte Passwort selbst per Autofill in das Feld. Der Wert
// wird nur im Speicher gehalten und sofort verschluesselt in Chrome abgelegt.
//
// Nebeneffekt: es wird nie etwas in Comets Profil geschrieben (nur eine
// Sicherung angelegt und am Ende geprueft, dass die Zeilenzahl gleich bleibt).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execSync } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { DatabaseSync } = require('node:sqlite');
const { COMET, CHROME } = require('../lib/paths');
const { closeGracefully, isRunning, backup } = require('../lib/browser');
const { CDP, waitForDevToolsPort } = require('../lib/cdp');
const { encryptV10 } = require('../lib/crypto');

const TMP_ROOT = path.join(os.tmpdir(), 'opencode');
const BACKUP_FILES = [
  'Default/Login Data',
  'Default/Login Data-journal',
  'Default/Login Data-wal',
  'Default/Login Data-shm',
];

const FORM = `<!doctype html><meta charset="utf-8"><title>Login</title>
<style>body{margin:0;font:16px sans-serif}input{display:block;width:420px;height:34px;font-size:16px;margin:16px 20px}</style>
<form><input id="u" name="username" autocomplete="username">
<input id="p" name="password" type="password" autocomplete="current-password">
<button type="submit">Login</button></form>`;

const FIELD = `(()=>{const u=document.getElementById('u'),p=document.getElementById('p');
  return {u:(u&&u.value)||'',p:(p&&p.value)||''}})()`;

async function connectPage(port, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return new CDP(page.webSocketDebuggerUrl).connect();
    } catch { /* noch nicht bereit */ }
    await sleep(250);
  }
  throw new Error('kein Page-Target gefunden');
}

async function evalJs(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, userGesture: true });
  if (r.result && r.result.exceptionDetails) throw new Error('JS-Fehler');
  return r.result && r.result.result ? r.result.result.value : undefined;
}

async function tapKey(cdp, vk, key, code) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: vk, key, code, nativeVirtualKeyCode: vk });
  await sleep(120);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: vk, key, code, nativeVirtualKeyCode: vk });
}

// Liefert auf jeder Origin unser Formular aus -- ohne Netzwerk, ohne Redirects.
function serveForm(cdp) {
  const body = Buffer.from(FORM, 'utf8').toString('base64');
  cdp.onEvent((m) => {
    if (m.method !== 'Fetch.requestPaused') return;
    cdp.send('Fetch.fulfillRequest', {
      requestId: m.params.requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
      body,
    }, m.sessionId);
  });
  return cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
}

// Laesst den Browser das gespeicherte Passwort per Autofill-Dropdown
// (Pfeil-runter, Enter) in unser Formular schreiben.
async function autofill(cdp, realm, expectUser, tries = 4) {
  const origin = new URL(realm).origin;
  await cdp.send('Page.navigate', { url: `${origin}/__login__` });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if ((await evalJs(cdp, 'location.origin').catch(() => null)) === origin) break;
    await sleep(150);
  }
  for (let i = 0; i < tries; i++) {
    await evalJs(cdp, "const u=document.getElementById('u'),p=document.getElementById('p');u.value='';p.value='';p.focus();");
    await sleep(700);
    for (let n = 0; n <= i; n++) { await tapKey(cdp, 40, 'ArrowDown', 'ArrowDown'); await sleep(150); }
    await tapKey(cdp, 13, 'Enter', 'Enter');
    await sleep(700);
    const v = await evalJs(cdp, FIELD);
    if (!v || !v.p) continue;
    if (expectUser && v.u !== expectUser) continue;
    return { ok: true, user: v.u, pw: v.p };
  }
  return { ok: false };
}

function readLogins() {
  const db = new DatabaseSync(COMET.loginData, { readOnly: true });
  const q = db.prepare('select * from logins');
  q.setReadBigInts(true);
  const rows = q.all();
  db.close();
  return rows;
}

function loginCount(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  const n = Number(db.prepare('select count(*) c from logins').get().c);
  db.close();
  return n;
}

// Liest die Passwoerter im Speicher. Comet wird dafuer kurz gestartet.
async function extract(log, backupRoot) {
  const rows = readLogins();
  if (!rows.length) { log('Keine gespeicherten Passwoerter in Comet.'); return []; }
  await closeGracefully('comet.exe');

  const bdir = backup(COMET.userData, BACKUP_FILES, backupRoot);
  log(`Backup -> ${bdir}`);

  let cdp = null;
  const out = [];
  try {
    try { fs.rmSync(path.join(COMET.userData, 'DevToolsActivePort'), { force: true }); } catch { /* ignore */ }
    const child = spawn(COMET.exe, [
      '--remote-debugging-port=0',
      '--no-first-run', '--no-default-browser-check',
      '--window-position=-32000,-32000', '--window-size=1000,800',
      '--disable-sync', '--disable-background-networking', '--disable-component-update',
      'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });

    const port = await waitForDevToolsPort(path.join(COMET.userData, 'DevToolsActivePort'), child, 60000);
    if (!port) throw new Error('Comet startet nicht:\n' + stderr.split('\n').slice(-8).join('\n'));
    cdp = await connectPage(port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await serveForm(cdp);

    for (const row of rows) {
      const realm = String(row.signon_realm);
      const user = String(row.username_value || '');
      if (Number(row.blacklisted_by_user)) {
        out.push({ row, ok: false });
        log(`  ${realm}: uebersprungen (als "nie speichern" markiert)`);
        continue;
      }
      const res = await autofill(cdp, realm, user).catch(() => ({ ok: false }));
      out.push({ row, ...res });
      log(`  ${realm}: ${res.ok ? 'gelesen' : 'FEHLGESCHLAGEN'}`);
      await sleep(200);
    }
  } finally {
    try { if (cdp) { await cdp.send('Browser.close', {}); cdp.close(); } } catch { /* ignore */ }
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline && isRunning('comet.exe')) await sleep(250);
    if (isRunning('comet.exe')) { try { execSync('taskkill /IM comet.exe /F', { stdio: 'ignore' }); } catch { /* ignore */ } }
  }
  return out;
}

function writeChrome(entries) {
  const db = new DatabaseSync(CHROME.loginData);
  const cols = db.prepare('pragma table_info(logins)').all().map((c) => c.name).filter((c) => c !== 'id');
  const ins = db.prepare(`insert into logins (${cols.join(',')}) values (${cols.map(() => '?').join(',')})`);
  const del = db.prepare('delete from logins where signon_realm = ? and username_value = ?');

  let inserted = 0;
  let removed = 0;
  for (const e of entries) {
    if (!e.ok) continue;
    const rec = {
      ...e.row,
      password_value: encryptV10(e.pw),
      username_value: e.user || e.row.username_value || '',
    };
    delete rec.id;
    removed += Number(del.run(String(e.row.signon_realm), String(e.row.username_value || '')).changes);
    ins.run(...cols.map((c) => (rec[c] === undefined ? null : rec[c])));
    inserted++;
  }
  db.exec('pragma wal_checkpoint(TRUNCATE)');
  db.close();
  return { inserted, removed };
}

// Prueft in einer Profilkopie, ob Chrome die neuen Eintraege wirklich
// entschluesseln und ausfuellen kann.
async function verify(entries, log) {
  const dir = path.join(TMP_ROOT, `chrome-verify-${process.pid}-${Date.now()}`);
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
  for (const rel of ['Local State', 'Default/Login Data', 'Default/Preferences', 'Default/Secure Preferences']) {
    const src = path.join(CHROME.userData, rel.replace(/\//g, path.sep));
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, rel.replace(/\//g, path.sep)));
  }

  const child = spawn(CHROME.exe, [
    `--user-data-dir=${dir}`, '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check',
    '--window-position=-32000,-32000', '--window-size=1000,800',
    '--disable-sync', '--disable-background-networking', '--disable-component-update',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let cdp = null;
  let matched = 0;
  let total = 0;
  try {
    const port = await waitForDevToolsPort(path.join(dir, 'DevToolsActivePort'), child, 60000);
    if (!port) throw new Error('Chrome startet nicht');
    cdp = await connectPage(port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await serveForm(cdp);
    for (const e of entries) {
      if (!e.ok) continue;
      total++;
      const res = await autofill(cdp, String(e.row.signon_realm), e.user).catch(() => ({ ok: false }));
      const same = res.ok && crypto.timingSafeEqual(
        crypto.createHash('sha256').update(res.pw).digest(),
        crypto.createHash('sha256').update(e.pw).digest()
      );
      if (same) matched++;
    }
  } finally {
    try { if (cdp) { await cdp.send('Browser.close', {}); cdp.close(); } } catch { /* ignore */ }
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline && isRunning('chrome.exe')) await sleep(250);
    if (isRunning('chrome.exe')) { try { execSync('taskkill /IM chrome.exe /F', { stdio: 'ignore' }); } catch { /* ignore */ } }
    await sleep(600);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  log(`Verifikation in Profilkopie: ${matched}/${total} Passwoerter stimmen`);
  return matched === total;
}

async function importPasswords(entries, log, backupRoot) {
  await closeGracefully('chrome.exe');
  const bdir = backup(CHROME.userData, BACKUP_FILES, backupRoot);
  const before = loginCount(CHROME.loginData);
  log(`Chrome-Backup -> ${bdir} (${before} Passwoerter vorher)`);

  const stats = writeChrome(entries);
  const after = loginCount(CHROME.loginData);
  log(`${stats.inserted} Passwoerter geschrieben, ${stats.removed} ersetzt, jetzt ${after} gespeichert`);
  if (after < before) throw new Error('Chrome Login Data ist geschrumpft -- Backup zurueckspielen!');

  return verify(entries, log);
}

module.exports = { extract, importPasswords, BACKUP_FILES };
