// Verlauf, Downloads, Suchbegriffe (History) und Autofill/Suchmaschinen
// (Web Data) von Comet nach Chrome. Es wird nur ergaenzt, nichts ueberschrieben.
// Beide Browser muessen geschlossen sein.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { COMET, CHROME } = require('../lib/paths');
const { closeGracefully, backup } = require('../lib/browser');

const BACKUP_FILES = ['Default/History', 'Default/Web Data'];

function cols(db, table) {
  return db.prepare(`pragma table_info(${table})`).all().map((c) => c.name);
}

function num(db, table) {
  const s = db.prepare(`select count(*) c from ${table}`);
  s.setReadBigInts(true);
  return Number(s.get().c);
}

function mergeHistory(log) {
  const src = new DatabaseSync(COMET.history, { readOnly: true });
  const dst = new DatabaseSync(CHROME.history);
  dst.exec('pragma busy_timeout=10000');

  const urlCols = cols(dst, 'urls').filter((c) => c !== 'id');
  const visitCols = cols(dst, 'visits').filter((c) => c !== 'id' && c !== 'url');
  const zeroVisits = ['from_visit', 'opener_visit', 'originator_visit_id',
    'originator_from_visit', 'originator_opener_visit', 'originator_cache_guid'];

  const before = { urls: num(dst, 'urls'), visits: num(dst, 'visits'), dl: num(dst, 'downloads') };

  const findUrl = dst.prepare('select id from urls where url = ?');
  findUrl.setReadBigInts(true);
  const insUrl = dst.prepare(`insert into urls (${urlCols.join(',')}) values (${urlCols.map(() => '?').join(',')})`);
  const lastId = dst.prepare('select last_insert_rowid() id');

  const sUrls = src.prepare('select * from urls');
  sUrls.setReadBigInts(true);
  const urlMap = new Map();
  let newUrls = 0;

  const sVisits = src.prepare('select * from visits');
  sVisits.setReadBigInts(true);
  const visitsByUrl = new Map();
  for (const v of sVisits.all()) {
    const k = String(v.url);
    if (!visitsByUrl.has(k)) visitsByUrl.set(k, []);
    visitsByUrl.get(k).push(v);
  }

  let newVisits = 0;
  let newDl = 0;
  let newKst = 0;

  dst.exec('begin');
  try {
    for (const u of sUrls.all()) {
      const oldId = String(u.id);
      const existing = findUrl.get(u.url);
      if (existing) { urlMap.set(oldId, existing.id); continue; }
      insUrl.run(...urlCols.map((c) => u[c] ?? null));
      urlMap.set(oldId, BigInt(String(lastId.get().id)));
      newUrls++;
    }

    const insVisit = dst.prepare(
      `insert into visits (url,${visitCols.join(',')}) values (?,${visitCols.map(() => '?').join(',')})`
    );
    // Wiederholte Laeufe sollen keine Besuche doppeln.
    const seenVisits = new Set();
    {
      const q = dst.prepare('select url, visit_time from visits');
      q.setReadBigInts(true);
      for (const r of q.all()) seenVisits.add(`${r.url}|${r.visit_time}`);
    }
    const visitMap = new Map();
    const pending = [];
    for (const [oldUrlId, list] of visitsByUrl) {
      const newUrlId = urlMap.get(oldUrlId);
      if (newUrlId === undefined) continue;
      for (const v of list) {
        const key = `${newUrlId}|${v.visit_time}`;
        if (seenVisits.has(key)) { visitMap.set(String(v.id), 0n); continue; }
        seenVisits.add(key);
        const values = visitCols.map((c) => {
          if (zeroVisits.includes(c)) return typeof v[c] === 'bigint' ? 0n : 0;
          if (c === 'visited_link_id') return 0n;
          return v[c] ?? null;
        });
        insVisit.run(newUrlId, ...values);
        const id = BigInt(String(lastId.get().id));
        visitMap.set(String(v.id), id);
        pending.push({ old: v, id });
        newVisits++;
      }
    }

    const updVisit = dst.prepare(`update visits set from_visit=?, opener_visit=?,
      originator_visit_id=?, originator_from_visit=?, originator_opener_visit=? where id=?`);
    for (const p of pending) {
      const v = p.old;
      const a = visitMap.get(String(v.from_visit)) ?? 0n;
      const b = visitMap.get(String(v.opener_visit)) ?? 0n;
      const c = visitMap.get(String(v.originator_visit_id)) ?? 0n;
      const d = visitMap.get(String(v.originator_from_visit)) ?? 0n;
      const e = visitMap.get(String(v.originator_opener_visit)) ?? 0n;
      if (a || b || c || d || e) updVisit.run(a, b, c, d, e, p.id);
    }

    const dlCols = cols(dst, 'downloads').filter((c) => c !== 'id');
    const sDl = src.prepare('select * from downloads');
    sDl.setReadBigInts(true);
    const knownGuids = new Set(dst.prepare('select guid from downloads').all().map((r) => r.guid));
    const insDl = dst.prepare(`insert into downloads (${dlCols.join(',')}) values (${dlCols.map(() => '?').join(',')})`);
    const insChain = dst.prepare('insert into downloads_url_chains (id, chain_index, url) values (?,?,?)');
    const sChains = src.prepare('select * from downloads_url_chains');
    sChains.setReadBigInts(true);
    const chains = sChains.all();
    for (const dl of sDl.all()) {
      if (dl.guid && knownGuids.has(dl.guid)) continue;
      insDl.run(...dlCols.map((c) => dl[c] ?? null));
      const newId = BigInt(String(lastId.get().id));
      for (const ch of chains.filter((x) => String(x.id) === String(dl.id))) {
        insChain.run(newId, ch.chain_index, ch.url);
      }
      newDl++;
    }

    const kw = cols(dst, 'keyword_search_terms');
    const sKst = src.prepare('select * from keyword_search_terms');
    sKst.setReadBigInts(true);
    const insKst = dst.prepare(`insert into keyword_search_terms (${kw.join(',')}) values (${kw.map(() => '?').join(',')})`);
    const seenTerms = new Set();
    {
      const q = dst.prepare('select url_id, term from keyword_search_terms');
      q.setReadBigInts(true);
      for (const r of q.all()) seenTerms.add(`${r.url_id}|${r.term}`);
    }
    for (const r of sKst.all()) {
      const newUrlId = urlMap.get(String(r.url_id));
      if (newUrlId === undefined) continue;
      const key = `${newUrlId}|${r.term}`;
      if (seenTerms.has(key)) continue;
      seenTerms.add(key);
      insKst.run(r.keyword_id, newUrlId, r.term, r.normalized_term);
      newKst++;
    }

    dst.exec('commit');
  } catch (e) {
    try { dst.exec('rollback'); } catch { /* ignore */ }
    throw e;
  }

  log(`Verlauf: +${newUrls} URLs, +${newVisits} Besuche, +${newDl} Downloads, +${newKst} Suchbegriffe`);
  log(`  Chrome jetzt: ${num(dst, 'urls')} URLs / ${num(dst, 'visits')} Besuche / ${num(dst, 'downloads')} Downloads`);
  src.close();
  dst.close();
}

function mergeWebData(log) {
  const src = new DatabaseSync(COMET.webData, { readOnly: true });
  const dst = new DatabaseSync(CHROME.webData);
  dst.exec('pragma busy_timeout=10000');

  const aCols = cols(dst, 'autofill');
  const known = new Set(dst.prepare('select name, value from autofill').all()
    .map((r) => `${r.name}|${r.value}`));
  const sA = src.prepare('select * from autofill');
  sA.setReadBigInts(true);
  const insA = dst.prepare(`insert or ignore into autofill (${aCols.join(',')}) values (${aCols.map(() => '?').join(',')})`);

  let newA = 0;
  let newK = 0;
  dst.exec('begin');
  try {
    for (const r of sA.all()) {
      if (known.has(`${r.name}|${r.value}`)) continue;
      const res = insA.run(...aCols.map((c) => r[c] ?? null));
      if (Number(res.changes) > 0) { newA++; known.add(`${r.name}|${r.value}`); }
    }
    const kCols = cols(dst, 'keywords').filter((c) => c !== 'id');
    const haveKw = new Set(dst.prepare('select keyword from keywords').all().map((r) => r.keyword));
    const sK = src.prepare('select * from keywords');
    sK.setReadBigInts(true);
    const insK = dst.prepare(`insert or ignore into keywords (${kCols.join(',')}) values (${kCols.map(() => '?').join(',')})`);
    for (const r of sK.all()) {
      if (haveKw.has(r.keyword)) continue;
      const res = insK.run(...kCols.map((c) => r[c] ?? null));
      if (Number(res.changes) > 0) { newK++; haveKw.add(r.keyword); }
    }
    dst.exec('commit');
  } catch (e) {
    try { dst.exec('rollback'); } catch { /* ignore */ }
    throw e;
  }
  log(`Web Data: +${newA} Autofill-Eintraege, +${newK} Suchmaschinen`);
  src.close();
  dst.close();
}

async function migrateHistory(log, backupRoot) {
  for (const exe of ['comet.exe', 'chrome.exe']) await closeGracefully(exe);
  if (!fs.existsSync(COMET.history)) throw new Error(`Comet-Verlauf nicht gefunden (${COMET.history}).`);
  const bdir = backup(CHROME.userData, BACKUP_FILES, backupRoot);
  log(`Chrome-Backup -> ${bdir}`);
  mergeHistory(log);
  if (fs.existsSync(COMET.webData) && fs.existsSync(CHROME.webData)) mergeWebData(log);
}

module.exports = { migrateHistory, BACKUP_FILES };
