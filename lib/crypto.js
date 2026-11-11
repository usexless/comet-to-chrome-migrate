// Chromes v10-Verschluesselung (AES-256-GCM mit dem DPAPI-Key aus Local State).
// Passwoerter: Klartext = Passwort.
// Cookies:     Klartext = sha256(host_key) || Wert -- Chrome verwirft Cookies,
//              deren Host-Binding nicht stimmt.
'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let cached = null;

function chromeKey() {
  if (cached) return cached;
  const out = execFileSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'chromekey.ps1'),
  ], { encoding: 'utf8' });
  const key = Buffer.from(out.trim(), 'base64');
  if (key.length !== 32) throw new Error(`Chrome-Key hat ${key.length} statt 32 Bytes`);
  cached = key;
  return key;
}

function encryptV10(plaintext, hostKey) {
  const data = hostKey
    ? Buffer.concat([crypto.createHash('sha256').update(hostKey, 'utf8').digest(), Buffer.from(plaintext, 'utf8')])
    : Buffer.from(plaintext, 'utf8');
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chromeKey(), nonce, { authTagLength: 16 });
  const ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([Buffer.from('v10', 'ascii'), nonce, ct, c.getAuthTag()]);
}

function decryptV10(blob, hostKey) {
  const buf = Buffer.from(blob);
  if (buf.subarray(0, 3).toString('ascii') !== 'v10') throw new Error('kein v10-Blob');
  const nonce = buf.subarray(3, 15);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(15, buf.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', chromeKey(), nonce, { authTagLength: 16 });
  d.setAuthTag(tag);
  const plain = Buffer.concat([d.update(ct), d.final()]);
  if (!hostKey) return plain.toString('utf8');
  const binding = crypto.createHash('sha256').update(hostKey, 'utf8').digest();
  if (!plain.subarray(0, 32).equals(binding)) throw new Error('Host-Binding stimmt nicht');
  return plain.subarray(32).toString('utf8');
}

module.exports = { chromeKey, encryptV10, decryptV10 };
