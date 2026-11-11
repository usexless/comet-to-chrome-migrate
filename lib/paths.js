// Profile paths for Comet (source) and Chrome (target).
'use strict';
const path = require('node:path');
const os = require('node:os');

const LOCALAPPDATA = path.join(os.homedir(), 'AppData', 'Local');

const COMET = {
  exe: 'C:\\Program Files\\Perplexity\\Comet\\Application\\comet.exe',
  userData: path.join(LOCALAPPDATA, 'Perplexity', 'Comet', 'User Data'),
  profile: 'Default',
};
COMET.cookies = path.join(COMET.userData, COMET.profile, 'Network', 'Cookies');
COMET.loginData = path.join(COMET.userData, COMET.profile, 'Login Data');
COMET.history = path.join(COMET.userData, COMET.profile, 'History');
COMET.webData = path.join(COMET.userData, COMET.profile, 'Web Data');
COMET.localState = path.join(COMET.userData, 'Local State');

const CHROME = {
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  userData: path.join(LOCALAPPDATA, 'Google', 'Chrome', 'User Data'),
  profile: 'Default',
};
CHROME.cookies = path.join(CHROME.userData, CHROME.profile, 'Network', 'Cookies');
CHROME.loginData = path.join(CHROME.userData, CHROME.profile, 'Login Data');
CHROME.history = path.join(CHROME.userData, CHROME.profile, 'History');
CHROME.webData = path.join(CHROME.userData, CHROME.profile, 'Web Data');
CHROME.localState = path.join(CHROME.userData, 'Local State');

// Backups land outside the tool folder so the shipped folder stays clean.
const BACKUP_ROOT = path.join(LOCALAPPDATA, 'comet-chrome-migrate', 'backup');

module.exports = { COMET, CHROME, BACKUP_ROOT };
