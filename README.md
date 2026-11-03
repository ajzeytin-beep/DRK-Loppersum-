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
- **Merkkarten:** Vitalwerte, ABCDE, SAMPLER, BE-FAST, Lagerungen, Reanimation, Neunerregel, Nummern.
- **Ausbilder-Bereich:**
  - Heatmap „Teilnehmende × Themen“
  - schwächste Themen des Kurses
  - häufigste Fehlerfragen
  - CSV-Export

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

Die Logodateien gehören in den Ordner `assets/`:

- `assets/logo-drk.png`
- `assets/logo-ov.png`

Sie erscheinen dann automatisch im Kopfbereich. Ohne Dateien zeigt die App ein neutrales Symbol.
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

## Ausbilder-Bereich

Der Ausbilder-Bereich ist am PC über **„Ausbilder“** in der Seitenleiste erreichbar, am Handy über **Profil → „Zum Ausbilder-Bereich“**.

- **PIN:** Beim ersten Öffnen legst du auf deinem Gerät eine PIN fest. Sie schützt den Bereich und die dort gespeicherten Auswertungen.
  - Nach 5 Fehlversuchen wird der Bereich vorübergehend gesperrt.
  - Mit **„Sperren“** schließt du ihn sofort wieder.
  - **„PIN vergessen?“** löscht die PIN und alle gespeicherten Auswertungen auf diesem Gerät. Die Teilnehmenden schicken dir ihre Dateien dann einfach erneut.
  - Die PIN gilt nur für das jeweilige Gerät. Auf den Handys der Teilnehmenden liegen keine Auswertungen anderer Personen.
- **Teilnehmende einladen:**
  - Die Kachel zeigt QR-Code, Link und einen Einladungstext, in den du optional den Kurscode einträgst.
  - **„Teilen“** öffnet am Handy das Teilen-Menü (WhatsApp, Signal, E-Mail …), am PC wird der Text kopiert.
  - **„QR-Code“** lädt das Bild zum Ausdrucken oder für den Beamer herunter.
- **Auswertung:** Importierte Exportdateien bleiben auf deinem Gerät gespeichert. Neuere Dateien ersetzen ältere Stände derselben Person.

## Ausbilder-Auswertung einrichten

Ohne weitere Einrichtung exportieren die Teilnehmenden ihren Lernstand unter **Profil → Lernstand exportieren** und schicken dir die Datei.
Im **Ausbilder-Bereich** importierst du alle Dateien auf einmal.

Für eine **automatische** Übertragung gibt es eine kostenlose Supabase-Datenbank:

1. Ein Konto auf <https://supabase.com> anlegen und ein neues Projekt erstellen (Region: Frankfurt).
2. Im **SQL Editor** den Inhalt von `supabase/schema.sql` ausführen.
3. Einen Kurs anlegen. Den Befehl dazu findest du am Ende der Datei. Kurscode und PIN wählst du selbst, die PIN muss sicher sein.
4. Unter **Project Settings → API** die *Project URL* und den *anon public key* in `js/config.js` eintragen.
5. Den Teilnehmenden den Kurscode geben. Sie tragen ihn beim ersten Start oder später im Profil ein.
6. Im Ausbilder-Bereich mit Kurscode und PIN die Auswertung öffnen.

**Datenschutz:**

- Gespeichert werden nur der Anzeigename (am besten Vorname oder Spitzname), die beantworteten Fragen mit „richtig/falsch“ und die Prüfungsergebnisse.
- Die Teilnehmenden sollten vorher darüber informiert werden.
- Nach dem Lehrgang den Kurs löschen. Damit werden alle zugehörigen Daten entfernt.

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt und ohne Abhängigkeiten.
Der Lernstand liegt im `localStorage` des Geräts, ein Service Worker sorgt für die Offline-Nutzung.
