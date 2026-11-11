// Mitglieder aus Excel (.xlsx/.xls) oder CSV übernehmen.
// Die Spalten werden anhand der Überschriften erkannt, Reihenfolge und Groß-/Kleinschreibung sind egal.
import { parseDate, parseMoney, downloadCsv } from "./util.js";

const XLSX_URL = new URL("../vendor/xlsx.full.min.js", import.meta.url).href;

const COLUMNS = {
  full_name: ["vollständiger name", "name, vorname", "nachname, vorname", "vor- und nachname", "mitglied"],
  last_name: ["nachname", "familienname", "name"],
  first_name: ["vorname", "rufname"],
  street: ["straße", "strasse", "str", "adresse", "anschrift", "straße und hausnummer", "hausnummer"],
  zip: ["plz", "postleitzahl"],
  city: ["ort", "wohnort", "stadt"],
  birthday: ["geburtstag", "geburtsdatum", "geb", "geboren", "geb.datum", "geb. am"],
  entry_date: ["eintritt", "eintrittsdatum", "mitglied seit", "eingetreten", "beitritt", "beitrittsdatum"],
  exit_date: ["austritt", "austrittsdatum", "ausgetreten"],
  drinks: ["getränkepauschale", "getraenkepauschale", "pauschale", "getränke", "getraenke"],
  phone: ["telefon", "tel", "handy", "mobil", "telefonnummer"],
  email: ["e-mail", "email", "mail"],
  note: ["bemerkung", "notiz", "notizen", "hinweis", "info"],
};

const norm = (s) => String(s ?? "").toLowerCase().replace(/[_:]/g, " ").replace(/\s+/g, " ").trim();

function mapHeaders(headers) {
  const map = {};
  const used = new Set();
  // Erst exakte Überschriften, dann Überschriften, die so anfangen (z. B. „Geburtsdatum (TT.MM.JJJJ)“)
  for (const exact of [true, false]) {
    headers.forEach((h, i) => {
      const n = norm(h);
      if (!n || used.has(i)) return;
      for (const [field, names] of Object.entries(COLUMNS)) {
        if (map[field] != null) continue;
        if (exact ? names.includes(n) : names.some((x) => x.length > 3 && n.startsWith(x))) { map[field] = i; used.add(i); break; }
      }
    });
  }
  // Nur eine Spalte „Name“ und keine „Vorname“-Spalte → vollständiger Name
  if (map.last_name != null && map.first_name == null && norm(headers[map.last_name]) === "name") {
    map.full_name = map.last_name;
    delete map.last_name;
  }
  return map;
}

function splitName(full) {
  const s = String(full ?? "").trim().replace(/\s+/g, " ");
  if (!s) return ["", ""];
  if (s.includes(",")) {
    const [last, first] = s.split(",").map((x) => x.trim());
    return [first || "", last || ""];
  }
  const parts = s.split(" ");
  const last = parts.pop();
  return [parts.join(" "), last];
}

function drinksValue(v, defaultFee) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v > 0 ? Math.round(v * 100) : null;
  const s = String(v).trim().toLowerCase();
  if (["nein", "n", "no", "0", "-", "keine", "false"].includes(s)) return null;
  const m = parseMoney(s);
  if (m != null) return m > 0 ? m : null;
  if (["ja", "j", "x", "yes", "true", "✓", "✔"].includes(s)) return defaultFee || 0;
  return null;
}

async function loadXlsx() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = XLSX_URL;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Excel-Leser konnte nicht geladen werden."));
    document.head.append(s);
  });
  return window.XLSX;
}

// Liefert { rows: [Mitglied …], skipped, columns: [erkannte Felder] }
export async function readMembersFile(file, defaultFee = 0) {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  let wb;
  if (/\.csv$|\.txt$/i.test(file.name)) {
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
    wb = XLSX.read(text.replace(/^﻿/, ""), { type: "string", raw: true, FS: detectSeparator(text) });
  } else {
    wb = XLSX.read(buf, { type: "array", cellDates: true });
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  // Überschriftenzeile suchen (die erste Zeile mit mindestens zwei erkannten Spalten)
  let headIdx = table.findIndex((r) => Object.keys(mapHeaders(r)).length >= 2);
  if (headIdx < 0) throw new Error("Keine passenden Spaltenüberschriften gefunden. Nutze am besten die Vorlage.");
  const map = mapHeaders(table[headIdx]);
  const get = (r, f) => (map[f] == null ? "" : r[map[f]]);
  const rows = [];
  let skipped = 0;
  for (const r of table.slice(headIdx + 1)) {
    if (!r.some((c) => String(c).trim() !== "")) continue;
    let first = String(get(r, "first_name") ?? "").trim();
    let last = String(get(r, "last_name") ?? "").trim();
    if (!first && !last && map.full_name != null) [first, last] = splitName(get(r, "full_name"));
    if (!first && !last) { skipped++; continue; }
    const txt = (f) => String(get(r, f) ?? "").trim() || null;
    rows.push({
      first_name: first.slice(0, 60),
      last_name: last.slice(0, 60),
      street: txt("street"),
      zip: txt("zip"),
      city: txt("city"),
      birthday: parseDate(get(r, "birthday")),
      entry_date: parseDate(get(r, "entry_date")),
      exit_date: parseDate(get(r, "exit_date")),
      drinks_fee_cents: drinksValue(get(r, "drinks"), defaultFee),
      phone: txt("phone"),
      email: txt("email"),
      note: txt("note"),
    });
  }
  return { rows, skipped, columns: Object.keys(map) };
}

function detectSeparator(text) {
  const first = text.split(/\r?\n/)[0] || "";
  const count = (c) => first.split(c).length - 1;
  return [";", ",", "\t"].sort((a, b) => count(b) - count(a))[0];
}

export function downloadTemplate() {
  downloadCsv("Vorlage-Mitglieder.csv", [
    ["Vorname", "Nachname", "Straße", "PLZ", "Ort", "Geburtstag", "Eintrittsdatum", "Getränkepauschale", "Telefon", "E-Mail", "Bemerkung"],
    ["Max", "Mustermann", "Hauptstraße 1", "26736", "Krummhörn", "01.02.1980", "15.03.2010", "60,00", "", "", ""],
    ["Erika", "Musterfrau", "Am Deich 7", "26736", "Krummhörn", "24.12.1975", "01.01.2001", "nein", "", "", ""],
  ]);
}
