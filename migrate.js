#!/usr/bin/env node
// Comet -> Chrome migration.
//
//   node migrate.js cookies     Cookies (login sessions)
//   node migrate.js passwords   Saved passwords
//   node migrate.js history     History, downloads, search terms, autofill
//   node migrate.js all         Everything, in that order
//
// Fully automatic: browsers are closed and restarted by the tool, no dialogs,
// no Windows Hello prompt, no CSV or other plaintext file ever hits the disk.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { COMET, CHROME, BACKUP_ROOT } = require('./lib/paths');

const log = (msg) => console.log(msg);

function checkInstalled() {
  if (!fs.existsSync(COMET.exe)) {
    throw new Error(`Comet not found at ${COMET.exe}`);
  }
  if (!fs.existsSync(CHROME.exe)) {
    throw new Error(`Chrome not found at ${CHROME.exe}`);
  }
  if (!fs.existsSync(COMET.userData) || !fs.existsSync(CHROME.userData)) {
    throw new Error('Comet or Chrome profile directory is missing -- start both browsers once first.');
  }
}

async function runCookies() {
  const { exportCookies, importCookies } = require('./src/cookies');
  const cookies = await exportCookies(log, BACKUP_ROOT);
  await importCookies(cookies, log, BACKUP_ROOT);
}

async function runPasswords() {
  const { extract, importPasswords } = require('./src/passwords');
  const entries = await extract(log, BACKUP_ROOT);
  const ok = entries.filter((e) => e.ok).length;
  log(`${ok}/${entries.length} passwords read from Comet.`);
  if (!ok) {
    log('Nothing to transfer.');
    return;
  }
  const verified = await importPasswords(entries, log, BACKUP_ROOT);
  if (!verified) throw new Error('Passwords written, but the roundtrip check failed.');
}

async function runHistory() {
  const { migrateHistory } = require('./src/history');
  await migrateHistory(log, BACKUP_ROOT);
}

async function main() {
  const cmd = (process.argv[2] || '').toLowerCase();
  if (!['cookies', 'passwords', 'history', 'all'].includes(cmd)) {
    console.log('Usage: node migrate.js <cookies|passwords|history|all>');
    process.exit(1);
  }

  checkInstalled();
  log('Close Comet and Chrome if they are running -- the tool will do it for you.');

  if (cmd === 'cookies') await runCookies();
  else if (cmd === 'passwords') await runPasswords();
  else if (cmd === 'history') await runHistory();
  else {
    await runCookies();
    await runPasswords();
    await runHistory();
  }

  log('');
  log('Done. Backups: ' + BACKUP_ROOT);
}

main().catch((e) => {
  console.error('ERROR: ' + e.message);
  process.exit(1);
});
