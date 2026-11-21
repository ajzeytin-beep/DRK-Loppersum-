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

## Vereinsverwaltung (Kassenbuch und Mitglieder)

Unter **`https://ajzeytin-beep.github.io/DRK-Loppersum-/verwaltung/`** gibt es eine eigene App für Kassenwart und Vorsitz. Sie lässt sich wie der Sani-Trainer auf dem Startbildschirm installieren (Name „DRK Kasse“).

**Kassenbuch**

- Zwei getrennte Bereiche:
  - **Getränkekasse:** z. B. Getränkepauschale der Mitglieder, Getränkeeinkauf.
  - **Verein:** Rechnungen, Spenden und andere Einnahmen/Ausgaben des Vereins.
- **Konten frei anlegen:** Barkassen und Bankkonten, die IBAN kann später eingetragen werden. Konten ohne Buchungen lassen sich löschen, sonst deaktivieren. Pro Konto gibt es einen Anfangsbestand je Bereich.
- **Belegnummer automatisch und fortlaufend pro Jahr:** `00001-26`, `00002-26` … ab Januar wieder `00001-27`.
- Einnahme, Ausgabe oder **Umbuchung** (z. B. Bargeld zur Bank). Laufender Saldo, Summen und Bestände werden automatisch berechnet.
- **Beleg fotografieren:**
  - Die App liest Betrag, Datum, Händler und Rechnungsnummer aus dem Foto und füllt die Felder vor (gelb markiert).
  - Vor dem Speichern muss bestätigt werden, dass alles mit dem Beleg verglichen wurde.
  - Die Texterkennung läuft komplett auf dem Gerät, das Foto geht an keinen fremden Dienst. Gespeichert wird es verkleinert im Supabase-Speicher.
  - PDFs werden als Beleg gespeichert, aber nicht ausgelesen.
- **Storno statt Löschen:** Buchungen lassen sich nicht ändern oder löschen. Ein Storno legt eine Gegenbuchung mit neuer Nummer an, so bleibt alles für die Kassenprüfung nachvollziehbar.
- Filter nach Jahr, Bereich, Konto, Art und Suchtext. Export als CSV für Excel.
- **Jahresabschluss:** Bestände je Konto und Bereich, Einnahmen und Ausgaben nach Kategorie, alle Buchungen, Unterschriftenfelder. Drucken oder als PDF speichern.

**Mitglieder**

- Felder: Name, Adresse, Geburtstag, Eintrittsdatum, Austrittsdatum, Getränkepauschale pro Jahr, Telefon, E-Mail, Bemerkung.
- Getränkepauschale pro Mitglied wahlweise **pro Monat** oder **pro Jahr**. Der Standard für neue Mitglieder wird unter „Konten“ eingestellt.
- Für jedes Jahr ist zu sehen, was bezahlt und was offen ist. Bei monatlicher Pauschale wird ab dem Eintrittsmonat und bis zum Austritt gerechnet, z. B. „bezahlt bis Oktober“ oder „offen 10,00 € (2 Mon.)“.
- Mit „kassieren“ wird die Pauschale direkt in der Getränkekasse gebucht. Betrag und Monate sind vorausgefüllt.
- In der Übersicht stehen Geburtstage und Jubiläen (alle 5 Jahre) der nächsten 30 Tage.
- **Import** aus Excel (.xlsx) oder CSV, mit Vorschau und Erkennung doppelter Einträge. Eine Vorlage gibt es zum Herunterladen.
- Export als CSV.

**Zugänge und Rollen**

| Rolle | Darf |
|---|---|
| Admin | alles, dazu Zugänge freigeben, ändern und entfernen |
| Kassenwart, Vorsitz | buchen, Mitglieder und Konten bearbeiten |
| Kassenprüfer | alles sehen, nichts ändern |

- Neue Personen öffnen den Link, tippen auf **„Zugang beantragen“** und registrieren sich mit ihrer eigenen E-Mail-Adresse.
- Der Admin gibt sie unter **Zugänge** frei.
- **Neuer Kassenwart gewählt:** Neue Person freigeben und den alten Zugang entfernen. Die Buchungen des alten Kassenwarts bleiben mit seinem Namen erhalten.
- Wer schon ein Konto im Sani-Trainer hat, meldet sich damit an und wird automatisch als Anfrage eingetragen.

**Einrichten**

1. `supabase/update-5.sql` und danach `supabase/update-6.sql` im Supabase **SQL Editor** ausführen. Das legt die Tabellen, die Rechte und den Speicher für Belege (`vw-belege`) an. Update 6 ergänzt die Getränkepauschale pro Monat.
2. Unter `/verwaltung/` registrieren, dann **einmalig** im SQL Editor dich selbst zum Admin machen:

   ```sql
   update public.vw_users set role = 'admin', approved_at = now() where email = 'deine@email.de';
   ```

3. Unter **Konten** die Barkasse(n) und das Bankkonto mit Anfangsbestand eintragen. Den Standardbetrag der Getränkepauschale setzen.
4. Mitglieder anlegen oder importieren.

> Die Daten liegen in derselben Supabase-Datenbank wie der Sani-Trainer, sind aber über eigene Rollen geschützt. Teilnehmende und Ausbilder sehen nichts davon.
> Adressen und Geburtstage sind personenbezogene Daten. Ausgetretene Mitglieder sollten nach Ablauf der Aufbewahrungsfristen gelöscht werden.

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

- **Neue Anmeldungen:** Registrierte Konten mit deinem Kurscode (oder ohne gültigen Kurscode) als Teilnehmer **freigeben**, direkt **als Ausbilder** freigeben oder **ablehnen**. Beim Ablehnen wird das Konto gelöscht.
- **Ausbilder in diesem Kurs:**
  - Liste aller Ausbilder.
  - Anderen kannst du die Ausbilder-Rechte entziehen, dir selbst nicht. So bleibt immer mindestens ein Ausbilder.
  - Teilnehmende machst du in der Tabelle über 🛡 zum Ausbilder.
  - **Neue Ausbilder:** Den Ausbilder-Link schicken, registrieren lassen und unter „Neue Anmeldungen“ auf **„Als Ausbilder“** tippen.
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
   5. `supabase/update-4.sql`
   6. `supabase/update-5.sql` (Vereinsverwaltung)
   7. `supabase/update-6.sql` (Getränkepauschale pro Monat oder Jahr)

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
7. **Ersten Ausbilder eintragen** (nur einmal nötig, weitere Ausbilder gehen danach direkt in der App): In der App registrieren, dann im SQL Editor:

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
In der Vereinsverwaltung sind [tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0) für die Belegerkennung und [SheetJS](https://sheetjs.com) (Apache-2.0) für den Excel-Import unter `verwaltung/vendor/` eingebunden.
Für QR-Codes ist die Bibliothek [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT-Lizenz, Kazuhiko Arase) unter `js/vendor/` eingebunden.
