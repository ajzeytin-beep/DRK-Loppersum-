// Verbindung zur Datenbank (Supabase) für die Vereinsverwaltung.
// Alle Aufrufe laufen mit dem Konto der angemeldeten Person; was sie sehen und ändern darf,
// entscheidet die Datenbank (siehe supabase/update-5.sql).
import { CONFIG } from "../../js/config.js";
import { accessToken } from "../../js/auth.js";

const base = () => CONFIG.supabaseUrl.replace(/\/$/, "");
export const BUCKET = "vw-belege";

function translate(msg = "") {
  const m = String(msg).toLowerCase();
  if (m.includes("vw_bookings_account_id_fkey") || m.includes("vw_bookings_to_account_id_fkey"))
    return "Dieses Konto hat bereits Buchungen und kann deshalb nicht gelöscht werden. Du kannst es stattdessen deaktivieren.";
  if (m.includes("row-level security") || m.includes("permission denied")) return "Keine Berechtigung.";
  if (m.includes("jwt expired") || m.includes("invalid jwt")) return "Die Anmeldung ist abgelaufen. Bitte neu anmelden.";
  if (m.includes("bucket not found")) return "Der Speicher für Belege fehlt. Bitte supabase/update-5.sql ausführen.";
  if (m.includes("could not find the function") || (m.includes("relation") && m.includes("does not exist")))
    return "Die Datenbank ist noch nicht eingerichtet. Bitte supabase/update-5.sql im Supabase SQL Editor ausführen.";
  if (m.includes("payload too large") || m.includes("exceeded the maximum")) return "Die Datei ist zu groß (maximal 10 MB).";
  return msg || "Unbekannter Fehler";
}

async function call(url, { method = "GET", body, headers = {}, raw = false } = {}) {
  const token = await accessToken();
  const isBlob = body instanceof Blob;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        apikey: CONFIG.supabaseAnonKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined && !isBlob ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: isBlob ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Keine Verbindung zum Server. Bitte Internetverbindung prüfen.");
  }
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try { const j = JSON.parse(text); msg = j.message || j.error_description || j.error || text; } catch { /* Text behalten */ }
    const e = new Error(translate(msg || `Fehler ${res.status}`));
    e.status = res.status;
    throw e;
  }
  if (raw) return res;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const rpc = (fn, args = {}) => call(`${base()}/rest/v1/rpc/${fn}`, { method: "POST", body: args });

// Liest alle Zeilen einer Tabelle (seitenweise, falls es mehr als 1000 sind)
export async function selectAll(table, query = "select=*") {
  const out = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const rows = await call(`${base()}/rest/v1/${table}?${query}`, {
      headers: { Range: `${from}-${from + page - 1}`, "Range-Unit": "items" },
    });
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

export const insert = (table, rows) =>
  call(`${base()}/rest/v1/${table}`, { method: "POST", body: rows, headers: { Prefer: "return=representation" } });

export async function update(table, id, patch) {
  const rows = await call(`${base()}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", body: patch, headers: { Prefer: "return=representation" },
  });
  if (!rows?.length) throw new Error("Nicht gespeichert – keine Berechtigung oder Eintrag nicht gefunden.");
  return rows[0];
}

export async function remove(table, id) {
  const rows = await call(`${base()}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE", headers: { Prefer: "return=representation" },
  });
  if (!rows?.length) throw new Error("Nicht gelöscht – keine Berechtigung oder Eintrag nicht gefunden.");
}

/* ---------------- Belege ---------------- */

export async function uploadReceipt(blob, ext) {
  const year = new Date().getFullYear();
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${year}/${id}.${ext}`;
  await call(`${base()}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST", body: blob, headers: { "Content-Type": blob.type || "application/octet-stream", "x-upsert": "false" },
  });
  return path;
}

export async function receiptUrl(path) {
  const res = await call(`${base()}/storage/v1/object/authenticated/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, { raw: true });
  return URL.createObjectURL(await res.blob());
}

/* ---------------- Zugänge ---------------- */

export const me = () => rpc("vw_me");
export const updateMyName = (name) => rpc("vw_update_my_name", { p_name: name });
export const listUsers = () => rpc("vw_list_users");
export const setRole = (id, role) => rpc("vw_set_role", { p_user: id, p_role: role });
export const removeUser = (id) => rpc("vw_remove_user", { p_user: id });

/* ---------------- Kassenbuch ---------------- */

export const addBooking = (b) => rpc("vw_add_booking", { p: b });
export const cancelBooking = (id, reason) => rpc("vw_cancel_booking", { p_id: id, p_reason: reason });
export const setReceipt = (id, path) => rpc("vw_set_receipt", { p_id: id, p_path: path });

/* ---------------- Gemeinsamer Datenstand ---------------- */

export const data = { accounts: [], members: [], bookings: [], settings: { drinks_fee_cents: 0 }, loadedAt: 0 };

export async function reload() {
  const [accounts, members, bookings, settings] = await Promise.all([
    selectAll("vw_accounts", "select=*&order=id"),
    selectAll("vw_members", "select=*&order=last_name,first_name,id"),
    selectAll("vw_bookings", "select=*&order=booking_date,year,seq"),
    selectAll("vw_settings", "select=*"),
  ]);
  Object.assign(data, { accounts, members, bookings, settings: settings[0] || { drinks_fee_cents: 0 }, loadedAt: Date.now() });
  return data;
}

/* ---------------- Angemeldete Person ---------------- */

export const ctx = { me: null, canWrite: false, isAdmin: false };
export function setMe(me) {
  ctx.me = me;
  ctx.isAdmin = me?.role === "admin";
  ctx.canWrite = ["admin", "kassenwart", "vorsitz"].includes(me?.role);
}
