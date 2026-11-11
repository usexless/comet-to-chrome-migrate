# comet-to-chrome-migrate

Move your browser data out of [Comet](https://comet.perplexity.ai/) (Perplexity)
and into Chrome — because Comet offers **import** and no **export** at all.

Not affiliated with Perplexity or Google. It uses internal Chromium mechanisms
(DevTools protocol, Chrome's own encryption format), so: use at your own risk.

**[Landing page](https://usexless.github.io/comet-to-chrome-migrate/)** ·
**[Download](https://github.com/usexless/comet-to-chrome-migrate/releases/latest)**

## What moves over

| Data | How | Automation |
|------|-----|------------|
| Cookies / login sessions | Read over CDP, written into Chrome's cookie DB (v10) | fully automatic |
| Passwords | Autofill extraction in Comet, written into Chrome's `Login Data` | fully automatic |
| History | Merged into Chrome's `History` DB | fully automatic |
| Downloads, search terms | Merged into Chrome's `History` DB | fully automatic |
| Autofill, search engines | Merged into Chrome's `Web Data` DB | fully automatic |

No dialogs, no clicking, no Windows Hello. **No plaintext file is ever
written** — passwords and cookies exist only in memory and end up encrypted in
Chrome's own databases.

## Quick start

1. Install [Node.js](https://nodejs.org/) 22 or newer (no npm packages needed).
2. Start Comet and Chrome once so both profiles exist.
3. Download the [latest release](https://github.com/usexless/comet-to-chrome-migrate/releases/latest)
   and unpack it anywhere.
4. Double-click **`Migrate everything.cmd`**.

Prefer a window? Double-click **`Comet to Chrome.cmd`** and press
**"Migrate everything"** — or migrate the three areas one at a time.

From a terminal:

```bash
node migrate.js cookies      # sessions
node migrate.js passwords    # passwords
node migrate.js history      # history, downloads, search terms, autofill
node migrate.js all          # everything, in that order
```

Both browsers may stay open: the tool closes them gracefully and restarts them
when it needs to.

## How passwords leave without Windows Hello

Two things make this work:

1. Chrome's "re-authenticate before filling" is, on Windows, only a preference
   (`password_manager.biometric_authentication_before_filling`, off by default).
   A normal autofill therefore never triggers a Hello prompt. The forced dialog
   on `chrome://password-manager/settings` is a separate code path and is never
   touched here.
2. Comet is served a tiny login page **on the original origin** via
   `Fetch.fulfillRequest` — no network, no redirects. Focusing the password
   field plus arrow-down and Enter makes Comet itself write the saved password
   into the field.

The value is read in memory and immediately encrypted as a v10 blob with
Chrome's DPAPI key (AES-256-GCM) into Chrome's `Login Data`. Afterwards a
verification run happens in a copy of the profile: Chrome fills the entries
again and the values are compared by SHA-256.

Comet's profile is **not** modified — only backed up.

## How cookies get into Chrome

Chrome refuses to start with `--remote-debugging-port` on the default profile,
so a CDP import is impossible. Instead the tool writes the cookies straight into
Chrome's cookie DB, encrypted with Chrome's own key from `Local State`
(`os_crypt.encrypted_key`, DPAPI).

Important: Chrome's cookie plaintext is `sha256(host_key) || value`. Without
that host binding, Chrome silently drops every cookie on the next start.

Session cookies (`has_expires = 0`) would be deleted the first time Chrome
exits normally, so they are imported with a 30-day expiry instead. Otherwise
every "keep me signed in" would be gone immediately.

## Safety net

- Every affected file from Comet and Chrome is backed up before a run, to
  `%LOCALAPPDATA%\comet-chrome-migrate\backup\<timestamp>\`.
- After the password import, Chrome's `Login Data` is checked for shrinkage;
  if it shrank, the backup is restored and the run aborts.
- After the cookie import, a roundtrip test decrypts one written value and
  compares it with the original.
- Browsers are only started briefly, with sync and background networking
  disabled (`--disable-sync --disable-background-networking
  --disable-component-update`), window off-screen.

## Requirements

- Windows
- [Node.js](https://nodejs.org/) 22+ (uses the built-in `node:sqlite`)
- Comet and Chrome installed, each started at least once

## Limits

- `Default` profile only. Multi-profile setups are not detected.
- Bookmarks are not migrated (Comet has no export for them).
- Password extraction depends on Comet's autofill still behaving; if Perplexity
  changes it, entries are skipped and counted — nothing disappears silently.
- Cookies Chrome interprets differently (e.g. `SameSite=None` without `Secure`)
  may be rejected; failures are logged.

## License

MIT, see [LICENSE](LICENSE).
