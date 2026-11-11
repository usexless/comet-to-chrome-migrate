// Minimal CDP client over the local DevTools WebSocket connection.
'use strict';

class CDP {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.eventHandlers = [];
  }

  // Registriert einen Handler fuer CDP-Events (Methoden ohne id).
  onEvent(handler) {
    this.eventHandlers.push(handler);
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.id && this.pending.has(m.id)) {
          this.pending.get(m.id)(m);
          this.pending.delete(m.id);
        } else if (m.method) {
          for (const h of this.eventHandlers) {
            try { h(m); } catch { /* ignore */ }
          }
        }
      };
      this.ws.onerror = () => reject(new Error('CDP WebSocket error'));
      this.ws.onopen = () => resolve(this);
    });
  }

  send(method, params, sessionId) {
    return new Promise((resolve) => {
      const id = ++this.id;
      this.pending.set(id, resolve);
      const msg = { id, method, params: params || {} };
      if (sessionId) msg.sessionId = sessionId;
      this.ws.send(JSON.stringify(msg));
    });
  }

  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

// Waits until the browser has written its DevTools port file and returns
// the port (or null on timeout/crash).
async function waitForDevToolsPort(portFile, child, timeoutMs = 60000) {
  const { setTimeout: sleep } = require('node:timers/promises');
  const fs = require('node:fs');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(portFile)) {
      try {
        const raw = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
        if (raw[0]) return Number(raw[0]);
      } catch { /* Datei wird gerade geschrieben */ }
    }
    if (child.exitCode !== null) return null;
    await sleep(250);
  }
  return null;
}

async function connectBrowser(port) {
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = await new CDP(ver.webSocketDebuggerUrl).connect();
  return { browser, info: ver };
}

module.exports = { CDP, waitForDevToolsPort, connectBrowser };
