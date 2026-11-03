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
- **Merkkarten:** erste Minute, xABCDE, Vitalwerte, Sauerstoffgabe, SAMPLERS, ZOPS & GIRL, Bodycheck, Tourniquet, Beckenschlinge, BE-FAST, Lagerungen, Reanimation, Neunerregel, Nummern.
- **Ausbilder-Bereich:** automatische Übersicht über den Lernfortschritt aller Teilnehmenden, schwächste Themen, häufigste Fehler, Heatmap und CSV-Export.

## Inhalte bearbeiten

Alle Fragen liegen als JSON im Ordner `data/`. Zum Ändern braucht es keine Programmierkenntnisse.

| Datei | Inhalt |
|---|---|
| `data/meta.json` | Themen und Stufen |
| `data/level1.json` … `level3.json` | Einzelfragen |
| `data/level4.json` | Fallbeispiele |
| `data/cards.json` | Merkkarten |

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

## Anmeldung

Die Startseite hat zwei Reiter: **Teilnehmer** und **Ausbilder**.

- **Teilnehmer** melden sich mit Vorname und **Kurscode** an.
  - Über den Einladungslink (`…/?kurs=LOP-2026`) oder den QR-Code ist der Kurscode schon ausgefüllt.
  - Der Lernfortschritt wird **automatisch** an den Kurs übertragen. Ohne Internet wird er gesammelt und später nachgeliefert.
  - Mehrere Personen können dasselbe Gerät nutzen, z. B. ein Tablet im Lehrgang. Jede Person hat ihren eigenen Lernstand.
  - Unter „Weiterlernen“ erscheinen alle Personen auf dem Gerät, ein Tipp genügt.
  - Wer denselben Namen und Kurscode erneut eingibt, macht mit seinem bisherigen Lernstand weiter.
  - **Abmelden** geht über die Seitenleiste oder das Profil.
- **Ausbilder** melden sich mit **Kurscode und Kurs-PIN** an. Die PIN wird auf dem Server geprüft, das funktioniert von jedem Gerät aus.
  - Die Anmeldung gilt, bis man sich abmeldet oder den Browser-Tab schließt.
  - Ausbilder ohne Teilnehmer-Anmeldung sehen nur den Ausbilder-Bereich und die Merkkarten.

## Ausbilder-Bereich

Nach der Anmeldung siehst du sofort den Stand aller Teilnehmenden. Die Ansicht aktualisiert sich jede Minute.

- **Lernfortschritt** pro Person:
  - Fortschritt in Prozent
  - Stufen 1–4 (grün = geschafft)
  - wo die Person gerade steht
  - Trefferquote, beste Prüfung, zuletzt aktiv
- **Schwächste Themen** und **häufigste Fehler** im Kurs, um sie im Unterricht gezielt zu wiederholen.
- **Teilnehmende × Themen** als Übersicht mit Farben.
- **CSV-Export** für Excel.
- **Teilnehmende einladen:** QR-Code und Link mit eingebautem Kurscode, Einladungstext, „Teilen“ (WhatsApp, Signal, E-Mail …) und QR-Code-Download zum Ausdrucken oder für den Beamer.

## Online-Auswertung (Supabase) einrichten

Die Daten liegen in einer kostenlosen Supabase-Datenbank (Region Frankfurt).

1. Ein Konto auf <https://supabase.com> anlegen und ein neues Projekt erstellen (Region: Frankfurt / eu-central-1).
2. Im **SQL Editor** den Inhalt von `supabase/schema.sql` ausführen.
3. Einen Kurs anlegen. Den Befehl dazu findest du am Ende der Datei. Kurscode und Kurs-PIN wählst du selbst, die PIN muss sicher sein.
4. Unter **Project Settings → API Keys** die *Project URL* und den *publishable key* in `js/config.js` eintragen.

**Update für bestehende Datenbanken:** Wurde `schema.sql` vor der Fortschrittsanzeige eingerichtet, einmal `supabase/update-1.sql` im SQL Editor ausführen. Bestehende Daten bleiben erhalten.

**Hinweise:**

- Kostenlose Supabase-Projekte pausieren nach 7 Tagen ohne Nutzung. Im Dashboard lassen sie sich mit einem Klick reaktivieren, die Daten bleiben erhalten.
- Weitere Kurse legt ihr mit demselben Befehl an, mit eigenem Kurscode und eigener PIN.
- Einen Testeintrag entfernt ihr so:

  ```sql
  delete from public.learners where course_code = 'LOP-2026' and display_name = 'Test';
  ```

**Datenschutz:**

- Gespeichert werden nur der Anzeigename (am besten Vorname oder Spitzname), die beantworteten Fragen mit „richtig/falsch“ und die Prüfungsergebnisse.
- Die Teilnehmenden sollten vorher darüber informiert werden.
- Nach dem Lehrgang den Kurs löschen. Damit werden alle zugehörigen Daten entfernt:

  ```sql
  delete from public.courses where code = 'LOP-2026';
  ```

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt.
Der Lernstand liegt im `localStorage` des Geräts und wird an Supabase übertragen. Ein Service Worker sorgt für die Offline-Nutzung.
Für QR-Codes ist die Bibliothek [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT-Lizenz, Kazuhiko Arase) unter `js/vendor/` eingebunden.
