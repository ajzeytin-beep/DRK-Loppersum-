// Hilfsfunktionen: Geld, Datum, Salden, CSV, Dialoge
import { data } from "./api.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const AREAS = { getraenke: "Getränkekasse", verein: "Verein" };
export const KINDS = { einnahme: "Einnahme", ausgabe: "Ausgabe", umbuchung: "Umbuchung" };
export const ACCOUNT_KINDS = { bar: "Barkasse", bank: "Bankkonto" };
export const ROLES = { admin: "Admin", kassenwart: "Kassenwart", vorsitz: "Vorsitz", pruefer: "Kassenprüfer (nur lesen)", pending: "Wartet auf Freigabe" };
export const CATEGORIES = {
  getraenke: ["Getränkepauschale", "Getränkeverkauf", "Getränkeeinkauf", "Pfand", "Sonstiges"],
  verein: ["Rechnung", "Spende", "Zuschuss", "Veranstaltung", "Material", "Verpflegung", "Fahrtkosten", "Gebühren", "Sonstiges"],
};

/* ---------------- Geld ---------------- */

const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
export const money = (cents) => fmt.format((cents || 0) / 100);
export const moneyPlain = (cents) => ((cents || 0) / 100).toFixed(2).replace(".", ",");
export const moneyInput = (cents) => (cents == null ? "" : moneyPlain(cents));

// "12,50" · "12.50" · "1.234,56" · "1,234.56" · "12 €" → Cent
export function parseMoney(str) {
  let s = String(str ?? "").replace(/[€\s]/g, "").replace(/EUR/gi, "");
  if (!s) return null;
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    s = comma > dot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (comma >= 0) {
    s = s.replace(/,(?=.*,)/g, "").replace(",", ".");
  } else if (dot >= 0) {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1 || /^-?\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/* ---------------- Datum ---------------- */

export const today = () => isoDate(new Date());
export function isoDate(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function dateDE(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}
// "31.12.2026" · "31.12.26" · "2026-12-31" · Excel-Seriennummer → "2026-12-31"
export function parseDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return isoDate(v);
  if (typeof v === "number" || /^\d{5}$/.test(String(v).trim())) {
    const d = new Date(Math.round((Number(v) - 25569) * 86400000));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y > (new Date().getFullYear() % 100) + 1 ? 1900 : 2000;
    return valid(y, +m[2], +m[1]);
  }
  return null;
}
function valid(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
export function age(iso, at = new Date()) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  let a = at.getFullYear() - y;
  if (at.getMonth() + 1 < m || (at.getMonth() + 1 === m && at.getDate() < d)) a--;
  return a;
}
export const yearOf = (iso) => Number(String(iso).slice(0, 4));

/* ---------------- Buchungen und Salden ---------------- */

export const accountName = (id) => data.accounts.find((a) => a.id === id)?.name || "–";
export const memberName = (m) => (m ? [m.first_name, m.last_name].filter(Boolean).join(" ") || "Ohne Namen" : "");
export const memberById = (id) => data.members.find((m) => m.id === id);

// Wirkung einer Buchung auf ein Konto (oder auf alle Konten zusammen, wenn accountId fehlt)
export function effect(b, accountId) {
  const a = b.amount_cents;
  if (b.kind === "einnahme") return accountId == null || b.account_id === accountId ? a : 0;
  if (b.kind === "ausgabe") return accountId == null || b.account_id === accountId ? -a : 0;
  if (accountId == null) return 0; // Umbuchung: Geld bleibt im Verein
  if (b.account_id === accountId) return -a;
  if (b.to_account_id === accountId) return a;
  return 0;
}

export const startBalance = (acc, area) =>
  !area ? acc.start_getraenke_cents + acc.start_verein_cents : area === "getraenke" ? acc.start_getraenke_cents : acc.start_verein_cents;

// Stand für Konto/Bereich bis einschließlich Datum (ohne Datum: heute und alles danach)
export function balance({ accountId = null, area = null, until = null, before = null } = {}) {
  const accs = accountId == null ? data.accounts : data.accounts.filter((a) => a.id === accountId);
  let sum = accs.reduce((s, a) => s + startBalance(a, area), 0);
  for (const b of data.bookings) {
    if (area && b.area !== area) continue;
    if (until && b.booking_date > until) continue;
    if (before && b.booking_date >= before) continue;
    sum += effect(b, accountId);
  }
  return sum;
}

// Einnahmen/Ausgaben (ohne Umbuchungen), Stornos sind negativ und gleichen sich aus
export function totals(list) {
  let inc = 0, exp = 0;
  for (const b of list) {
    if (b.kind === "einnahme") inc += b.amount_cents;
    else if (b.kind === "ausgabe") exp += b.amount_cents;
  }
  return { inc, exp, net: inc - exp };
}

export function nextNumber(year = new Date().getFullYear()) {
  const max = data.bookings.filter((b) => b.year === year).reduce((m, b) => Math.max(m, b.seq), 0);
  return `${String(max + 1).padStart(5, "0")}-${String(year % 100).padStart(2, "0")}`;
}

export const years = () => {
  const ys = new Set([new Date().getFullYear(), ...data.bookings.map((b) => b.year)]);
  return [...ys].sort((a, b) => b - a);
};

// Gezahlte Getränkepauschale eines Mitglieds in einem Jahr
export function drinksPaid(memberId, year) {
  return data.bookings
    .filter((b) => b.member_id === memberId && b.area === "getraenke" && b.kind === "einnahme" && b.category === "Getränkepauschale" && yearOf(b.booking_date) === year)
    .reduce((s, b) => s + b.amount_cents, 0);
}

/* ---------------- CSV ---------------- */

export function downloadCsv(filename, rows) {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  download(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}
export function download(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------------- Meldungen und Dialoge ---------------- */

export function toast(msg, type = "ok") {
  let box = document.getElementById("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.append(box); }
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.setAttribute("role", "status");
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.classList.add("out"), type === "error" ? 6000 : 3500);
  setTimeout(() => t.remove(), type === "error" ? 6500 : 4000);
}

// Einfacher Dialog. html = Inhalt, buttons = [{ label, cls, value }]. Liefert den value des Knopfs (oder null).
export function dialog({ title, html = "", buttons = [{ label: "OK", cls: "btn-primary", value: true }], onOpen, wide = false }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = `modal${wide ? " modal-wide" : ""}`;
    d.innerHTML = `<form method="dialog" class="modal-inner">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="btn btn-ghost btn-icon" value="" aria-label="Schließen" formnovalidate>✕</button></div>
      <div class="modal-body">${html}</div>
      <div class="modal-foot">${buttons.map((b, i) => `<button class="btn ${b.cls || "btn-secondary"}" value="${i}" ${b.validate === false ? "formnovalidate" : ""}>${esc(b.label)}</button>`).join("")}</div>
    </form>`;
    document.body.append(d);
    d.addEventListener("close", () => {
      const i = d.returnValue;
      const btn = i === "" || i == null ? null : buttons[Number(i)];
      resolve(btn ? (typeof btn.value === "function" ? btn.value(d) : btn.value) : null);
      setTimeout(() => d.remove(), 0);
    });
    d.showModal();
    onOpen?.(d);
  });
}

export const confirmDialog = (title, text, label = "OK", cls = "btn-primary") =>
  dialog({ title, html: `<p>${esc(text)}</p>`, buttons: [{ label: "Abbrechen", value: false, validate: false }, { label, cls, value: true }] });

export async function promptDialog(title, text, { label = "OK", placeholder = "", value = "", type = "text" } = {}) {
  return dialog({
    title,
    html: `<p>${esc(text)}</p><label><input name="v" type="${type}" required placeholder="${esc(placeholder)}" value="${esc(value)}"></label>`,
    buttons: [{ label: "Abbrechen", value: null, validate: false }, { label, cls: "btn-primary", value: (d) => d.querySelector("[name=v]").value.trim() }],
    onOpen: (d) => d.querySelector("input").focus(),
  });
}

// Knopf während einer Aktion sperren. Fehler werden angezeigt, dann liefert busy() undefined.
export async function busy(btn, fn) {
  const old = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.classList.add("is-busy"); }
  try { return await fn(); }
  catch (e) { toast(e.message, "error"); return undefined; }
  finally { if (btn) { btn.disabled = false; btn.classList.remove("is-busy"); btn.innerHTML = old; } }
}
