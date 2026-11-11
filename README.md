# comet-to-chrome-migrate

Zieht Browserdaten von [Comet](https://comet.perplexity.ai/) (Perplexity) nach Chrome —
weil Comet nur **Import** anbietet, aber keinen **Export**.

Kein offizielles Tool von Perplexity oder Google. Inoffiziell, nutzt interne
Chromium-Mechanismen (DevTools-Protokoll, Chromes eigenes
Verschlüsselungsformat). Auf eigene Gefahr.

## Was migriert wird

| Daten                     | Weg                                                        | Automatisierung |
|---------------------------|------------------------------------------------------------|-----------------|
| Cookies / Login-Sitzungen | Lesen per CDP, Schreiben direkt in Chromes Cookie-DB (v10)  | voll automatisch |
| Passwörter                | Autofill-Extraktion in Comet, Schreiben in Chromes Login-DB | voll automatisch |
| Verlauf                   | Merge in Chromes `History`-DB                               | voll automatisch |
| Downloads, Suchbegriffe   | Merge in Chromes `History`-DB                               | voll automatisch |
| Autofill, Suchmaschinen   | Merge in Chromes `Web Data`-DB                              | voll automatisch |

Keine Dialoge, kein Klick, kein Windows Hello. Es wird **keine**
Klartextdatei geschrieben — Passwörter und Cookies existieren nur im
Arbeitsspeicher und liegen danach verschlüsselt in Chromes Datenbanken.

## Wie die Passwörter ohne Windows Hello rausgehen

Zwei Dinge, die das möglich machen:

1. **Chromes „vor dem Ausfüllen erneut authentifizieren“** hängt auf Windows
   nur an einem Pref (`password_manager.biometric_authentication_before_filling`,
   Default: aus). Ein normaler Autofill-Vorgang löst deshalb keine
   Hello-Abfrage aus. Der bei `chrome://password-manager/settings`
   erzwungene Hello-Dialog ist ein separater Pfad und wird hier nie berührt.
2. Comet bekommt auf der **Original-Origin** eine eigene Mini-Loginseite
   ausgeliefert (CDP `Fetch.fulfillRequest`, ohne Netzwerk, ohne Redirects).
   Ein `focus()` auf das Passwortfeld plus Pfeil-runter und Enter lässt Comet
   das gespeicherte Passwort selbst ins Feld schreiben.

Der Wert wird im Speicher gelesen und sofort als v10-Blob mit Chromes
DPAPI-Key (AES-256-GCM) verschlüsselt in Chromes `Login Data` geschrieben.
Danach läuft eine Verifikation in einer Profilkopie: Chrome füllt die
Einträge erneut aus, die Werte werden per SHA-256 verglichen.

Comets Profil wird dabei **nicht** verändert — nur gesichert.

## Wie die Cookies nach Chrome kommen

Chrome startet auf dem Standard-Profil nicht mit `--remote-debugging-port`
(Sicherheitssperre), also kein CDP-Import möglich. Stattdessen schreibt das
Tool die Cookies direkt in Chromes Cookie-DB, verschlüsselt mit Chromes
eigenem Key aus `Local State` (`os_crypt.encrypted_key`, DPAPI).

Wichtig: Chromes Cookie-Klartext ist `sha256(host_key) || wert`. Ohne dieses
Host-Binding verwirft Chrome die Cookies beim nächsten Start.

## Sicherheitsnetz

- Vor jedem Lauf werden die betroffenen Dateien von Comet bzw. Chrome
  gesichert (`%LOCALAPPDATA%\comet-chrome-migrate\backup\<zeitstempel>\`).
- Nach dem Passwort-Import wird geprüft, dass Chromes `Login Data` nicht
  geschrumpft ist; sonst wird das Backup zurückgespielt und abgebrochen.
- Nach dem Cookie-Import: Roundtrip-Test (einen geschriebenen Wert
  entschlüsseln und mit dem Original vergleichen).
- Browser werden nur kurz und mit abgeschaltetem Sync/Update gestartet
  (`--disable-sync --disable-background-networking --disable-component-update`,
  Fenster außerhalb des Bildschirms).

## Voraussetzungen

- Windows
- [Node.js](https://nodejs.org/) 22+ (nutzt `node:sqlite`, keine npm-Pakete)
- Comet und Chrome installiert, beide je einmal gestartet

## Benutzung

**Ein Klick, alles:**

Doppelklick auf **`Alles migrieren.cmd`** — Cookies, Passwörter, Verlauf und
Autofill wandern in einem Durchgang nach Chrome. Fenster bleibt offen, bis
alles durch ist.

**Mit Oberfläche:**

Doppelklick auf **`Comet nach Chrome.cmd`** (oder
`powershell -ExecutionPolicy Bypass -File gui.ps1`) und dann auf
**„Alles migrieren“** klicken. Die drei Einzelknöpfe darunter machen dasselbe
stückweise.

**Kommandozeile:**

```bash
node migrate.js cookies      # Sitzungen
node migrate.js passwords    # Passwörter
node migrate.js history      # Verlauf, Downloads, Suchbegriffe, Autofill
node migrate.js all          # alles nacheinander
```

Die Browser dürfen offen sein — das Tool schließt sie und startet sie
kontrolliert neu.

## Grenzen

- Nur das `Default`-Profil. Multi-Profil-Setups werden nicht erkannt.
- Lesezeichen werden nicht migriert (Comet hat dafür keinen Export).
- Passwort-Extraktion setzt voraus, dass Comets Autofill weiterhin
  funktioniert; bricht Perplexity das Verhalten, werden Einträge
  übersprungen und gezählt — nichts verschwindet still.
- Cookies, die Chrome anders interpretiert (z. B. `SameSite=None` ohne
  `Secure`), können abgelehnt werden; die Zahl der Fehlschläge wird
  protokolliert.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
