# Sani-Trainer · DRK OV Loppersum

Lern-App für Teilnehmende des Sanitätslehrgangs, vom Erste-Hilfe-Wissen bis zum Abschluss.
Die App läuft im Browser jedes Smartphones und lässt sich wie eine App auf dem Startbildschirm installieren.
Nach dem ersten Aufruf funktioniert sie auch **offline**.

## Funktionen

- **Lernpfad in 5 Stufen**
  1. Auffrischung Erste Hilfe
  2. Grundlagen
  3. Notfallbilder
  4. Fallbeispiele Ostfriesland
  5. Prüfungssimulation

  Eine Stufe wird freigeschaltet, sobald 80 % der vorherigen sicher sitzen.
- **Fragetypen:** Einfachauswahl, Mehrfachauswahl, Richtig/Falsch, Reihenfolge und Fallbeispiele in mehreren Schritten.
- **Erklärung zu jeder Antwort.**
- **Karteikasten-Wiederholung:** Falsche Antworten kommen sofort wieder, richtige in wachsenden Abständen.
- **Dashboard** mit Gesamtfortschritt, Trefferquote, fälligen Wiederholungen und den eigenen Schwachstellen. Jedes Thema lässt sich gezielt üben.
- **Prüfungssimulation:** Zeitlimit, Bestehensgrenze, Auswertung am Ende.
- **SAN-Protokoll üben:** Einsatz lesen, digitale Übungsversion des SAN-Protokolls ausfüllen (Kreuze, Messwerte, Zeiten), danach Vergleich mit der Musterlösung und Hinweise je Abschnitt. Dazu Fragen und eine Merkkarte zum Protokoll.
- **Merkkarten:** erste Minute, xABCDE, Vitalwerte, Sauerstoffgabe, SAMPLERS, ZOPS & GIRL, Bodycheck, Tourniquet, Beckenschlinge, BE-FAST, Lagerungen, Reanimation, Neunerregel, Nummern.
- **Konten mit E-Mail und Passwort:** Selbstregistrierung, Freigabe durch Ausbilder, Lernstand auf allen Geräten.
- **Ausbilder-Bereich:** Freigabe neuer Konten, automatische Übersicht über den Lernfortschritt aller Teilnehmenden, schwächste Themen, häufigste Fehler, Heatmap und CSV-Export.

## Inhalte bearbeiten

Alle Fragen liegen als JSON im Ordner `data/`. Zum Ändern braucht es keine Programmierkenntnisse.

| Datei | Inhalt |
|---|---|
| `data/meta.json` | Themen und Stufen |
| `data/level1.json` … `level3.json` | Einzelfragen |
| `data/level4.json` | Fallbeispiele |
| `data/cards.json` | Merkkarten |
| `data/protokoll.json` | Protokoll-Übung: Aufbau des Bogens und Einsätze mit Musterlösung (`required` = muss angekreuzt sein, `optional` = darf angekreuzt sein) |

Beispiel für eine Frage:

```json
{
  "id": "l3-beispiel", "topic": "trauma", "type": "single",
  "question": "Fragetext?",
  "options": ["Antwort A", "Antwort B", "Antwort C"],
  "answer": 0,
  "explanation": "Warum A richtig ist."
}
```

- `type: "multi"` → `answer` ist eine Liste, z. B. `[0, 2]`
- `type: "truefalse"` → `answer` ist `true` oder `false`
- `type: "order"` → statt `options` gibt es `items`, und zwar **in der richtigen Reihenfolge** (die App mischt sie)
- `id` muss eindeutig sein und darf nach dem Start des Kurses nicht mehr geändert werden, sonst passt die Auswertung nicht mehr.

Nach Änderungen in `sw.js` die Versionsnummer (`sani-trainer-v1` → `v2`) erhöhen, damit installierte Apps die neuen Inhalte laden.

> **Wichtig:** Alle Inhalte müssen vor dem Einsatz von einer Ausbilderin oder einem Ausbilder mit den aktuellen Lehrgangsunterlagen eures Landesverbands abgeglichen werden.
> Das gilt vor allem für Kompetenzen wie Sauerstoffgabe oder HWS-Immobilisation und für Grenzwerte.

## Logos

Das Abzeichen des OV Loppersum liegt unter `assets/logo-ov.png`. Daraus sind auch die App-Symbole erzeugt (`assets/icon-192.png`, `assets/icon-512.png`).
Ein zusätzliches DRK-Logo kann als `assets/logo-drk.png` abgelegt werden und erscheint dann automatisch daneben.
Für das Rotkreuz-Zeichen gelten die Regeln zum Schutzzeichen und die CD-Vorgaben des DRK.

## Lokal starten

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Veröffentlichen (GitHub Pages, kostenlos)

1. Im Repository unter **Settings → Pages** als Quelle den Branch `main` mit dem Ordner `/ (root)` wählen.
2. Nach kurzer Zeit ist die App unter `https://<benutzer>.github.io/<repository>/` erreichbar.
3. Diesen Link oder einen QR-Code an die Teilnehmenden geben. Auf dem Handy dann „Zum Startbildschirm hinzufügen“ wählen.

## Anmeldung (Konten mit E-Mail und Passwort)

| Für | Link |
|---|---|
| Teilnehmende (Registrierung) | `https://ajzeytin-beep.github.io/DRK-Loppersum-/teilnehmer/?kurs=KURSCODE` |
| Anmeldung (alle) | `https://ajzeytin-beep.github.io/DRK-Loppersum-/ausbilder/` oder die normale Startadresse |

- **Registrieren:** Teilnehmende legen ein Konto mit Name, E-Mail, Passwort (mindestens 8 Zeichen) und Kurscode an. Über den Einladungslink ist der Kurscode schon ausgefüllt.
- Nach der Registrierung kann man **sofort lernen**. Der Fortschritt wird übertragen, sobald ein Ausbilder das Konto **freigegeben** hat.
- **Anmelden:** Teilnehmende und Ausbilder melden sich gleich an. Ausbilder landen automatisch im Ausbilder-Bereich.
- Der Lernstand liegt auf dem Server. Wer sich auf einem neuen Gerät anmeldet, macht dort weiter. Ohne Internet wird weitergelernt und später übertragen.
- **Passwort vergessen** per E-Mail-Link (siehe Hinweis zum E-Mail-Versand unten). Alternativ setzt ein Ausbilder ein neues Passwort.
- **Profil:** Name und Passwort ändern, abmelden, Konto löschen.

## Ausbilder-Bereich

Nach der Anmeldung siehst du sofort den Stand deines Kurses. Die Ansicht aktualisiert sich jede Minute.

- **Neue Anmeldungen:** Registrierte Konten mit deinem Kurscode (oder ohne gültigen Kurscode) freigeben oder ablehnen. Beim Ablehnen wird das Konto gelöscht.
- **Lernfortschritt** pro Person:
  - Fortschritt in Prozent
  - Stufen 1–4 (grün = geschafft)
  - wo die Person gerade steht
  - Trefferquote, beste Prüfung, zuletzt aktiv
- Pro Person kannst du über 🔒 **ein neues Passwort setzen** oder sie über ✕ **entfernen** (Konto und Lernfortschritt werden gelöscht).
- **Schwächste Themen**, **häufigste Fehler**, Übersicht **Teilnehmende × Themen**, **CSV-Export**.
- **Teilnehmende einladen:** QR-Code und Registrierungslink mit eingebautem Kurscode, Einladungstext, „Teilen“, QR-Code-Download.

## Supabase einrichten

1. Ein Konto auf <https://supabase.com> anlegen und ein Projekt erstellen (Region: Frankfurt / eu-central-1).
2. Im **SQL Editor** nacheinander ausführen:
   1. `supabase/schema.sql`
   2. `supabase/update-1.sql`
   3. `supabase/update-2.sql`
   4. `supabase/update-3.sql`

   Wer schon eingerichtet ist, führt nur die fehlenden Updates aus.
3. Einen Kurs anlegen (eine PIN ist seit Update 2 nicht mehr nötig):

   ```sql
   insert into public.courses (code, name) values ('LOP-2026', 'Sanitätslehrgang OV Loppersum 2026');
   ```

4. Unter **Project Settings → API Keys** die *Project URL* und den *publishable key* in `js/config.js` eintragen.
5. **Authentication → Sign In / Providers → Email:**
   - Email-Anmeldung aktiv lassen.
   - **„Confirm email“ ausschalten**, solange kein eigener E-Mail-Versand eingerichtet ist (siehe unten).
6. **Authentication → URL Configuration:** *Site URL* und *Redirect URLs* auf `https://ajzeytin-beep.github.io/DRK-Loppersum-/` setzen.
7. **Ausbilder eintragen:** In der App registrieren, dann im SQL Editor:

   ```sql
   update public.profiles set role = 'instructor', course_code = 'LOP-2026' where email = 'deine@email.de';
   ```

**E-Mail-Versand:**

- Der eingebaute E-Mail-Versand von Supabase schickt nur an Adressen aus dem eigenen Supabase-Team und nur wenige Mails pro Stunde.
- Damit „Passwort vergessen“ und E-Mail-Bestätigung für alle Teilnehmenden funktionieren, unter **Authentication → Emails → SMTP Settings** einen eigenen Mailserver eintragen, z. B. das Postfach des Ortsvereins oder einen kostenlosen Dienst wie Brevo.
- Bis dahin setzen Ausbilder vergessene Passwörter im Ausbilder-Bereich neu.

**Hinweise:**

- Kostenlose Supabase-Projekte pausieren nach 7 Tagen ohne Nutzung. Im Dashboard lassen sie sich mit einem Klick reaktivieren, die Daten bleiben erhalten.
- Alte Testeinträge aus der Zeit vor den Konten entfernen:

  ```sql
  delete from public.learners where id not in (select id from public.profiles);
  ```

**Datenschutz:**

- Gespeichert werden Name, E-Mail, die beantworteten Fragen mit „richtig/falsch“ und die Prüfungsergebnisse.
- Die Teilnehmenden sollten vorher darüber informiert werden. Sie können ihr Konto im Profil selbst löschen.
- Nach dem Lehrgang den Lernfortschritt des Kurses löschen, dabei bleiben die Konten bestehen:

  ```sql
  delete from public.learners where course_code = 'LOP-2026';
  ```

  Konten entfernt ihr unter **Authentication → Users**.

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt.
Konten über Supabase Auth. Der Lernstand liegt im `localStorage` des Geräts und wird mit Supabase abgeglichen. Ein Service Worker sorgt für die Offline-Nutzung.
Für QR-Codes ist die Bibliothek [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT-Lizenz, Kazuhiko Arase) unter `js/vendor/` eingebunden.
