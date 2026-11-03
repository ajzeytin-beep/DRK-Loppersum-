// Zentrale Einstellungen des Sani-Trainers.
// Für die Online-Auswertung im Ausbilder-Bereich Supabase-URL und Anon-Key eintragen
// (siehe README.md, Abschnitt „Ausbilder-Auswertung einrichten“).
export const CONFIG = {
  appName: "Sani-Trainer",
  orgName: "DRK OV Loppersum",

  supabaseUrl: "",
  supabaseAnonKey: "",

  // Ab diesem Anteil sicher beantworteter Fragen wird die nächste Stufe freigeschaltet.
  unlockThreshold: 0.8,
  // Anzahl Fragen pro Lerneinheit
  sessionSize: 10,
  // Prüfungssimulation (an eure Lehrgangsprüfung anpassen)
  exam: { questions: 30, minutes: 30, passPercent: 75 },
  // Wiederholungsabstände (Karteikasten) in Tagen je Fach
  leitnerDays: [0, 1, 2, 4, 7, 14, 30],
};
