// Start/stop helpers for Chromium-based browsers (Comet, Chrome) + backup.
'use strict';
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { waitForDevToolsPort, connectBrowser } = require('./cdp');

function isRunning(exeName) {
  try {
    const out = execSync(`tasklist /FI "IMAGENAME eq ${exeName}" /NH`, { encoding: 'utf8' });
    return new RegExp(exeName.replace('.', '\\.'), 'i').test(out);
  } catch {
    return false;
  }
}

async function closeGracefully(exeName, timeoutMs = 10000) {
  if (!isRunning(exeName)) return;
  try { execSync(`taskkill /IM ${exeName}`, { stdio: 'ignore' }); } catch { /* ignore */ }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && isRunning(exeName)) await sleep(250);
  if (isRunning(exeName)) {
    try { execSync(`taskkill /IM ${exeName} /F`, { stdio: 'ignore' }); } catch { /* ignore */ }
    await sleep(1000);
  }
  if (isRunning(exeName)) throw new Error(`${exeName} is still running -- aborting.`);
}

// Launches the browser with sync/telemetry/updates disabled so the
// automated window doesn't touch the real profile/account, and connects
// via CDP. Returns { child, browser, close() }.
async function launchWithCdp(exe, userDataDir) {
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  try { fs.rmSync(portFile, { force: true }); } catch { /* ignore */ }

  const child = spawn(exe, [
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check',
    '--window-position=-32000,-32000', '--window-size=800,600',
    '--disable-sync', '--disable-background-networking',
    '--disable-component-update', '--disable-features=Translate,OptimizationHints',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });

  const port = await waitForDevToolsPort(portFile, child);
  if (!port) {
    throw new Error('No DevTools port -- browser failed to start.\n' + stderr.split('\n').slice(-10).join('\n'));
  }
  const { browser, info } = await connectBrowser(port);

  return {
    child,
    browser,
    info,
    async close() {
      await browser.send('Browser.close', {});
      browser.close();
      const exeName = path.basename(exe);
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && isRunning(exeName)) await sleep(250);
      if (isRunning(exeName)) {
        try { execSync(`taskkill /IM ${exeName} /F`, { stdio: 'ignore' }); } catch { /* ignore */ }
      }
      await sleep(1000);
    },
  };
}

function backup(userData, files, backupRoot) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bdir = path.join(backupRoot, ts);
  fs.mkdirSync(bdir, { recursive: true });
  for (const rel of files) {
    const src = path.join(userData, rel);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(bdir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  return bdir;
}

function restore(userData, files, bdir) {
  for (const rel of files) {
    const src = path.join(bdir, rel);
    if (fs.existsSync(src)) {
      const dst = path.join(userData, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }
}

module.exports = { isRunning, closeGracefully, launchWithCdp, backup, restore };
