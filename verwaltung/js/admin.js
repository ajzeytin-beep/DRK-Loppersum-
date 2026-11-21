// Konten (Barkasse/Bank) und Einstellungen · Zugänge freigeben und entfernen (nur Admin)
import { CONFIG } from "../../js/config.js";
import { icon } from "../../js/icons.js";
import * as api from "./api.js";
import { ctx, data } from "./api.js";
import { esc, money, moneyInput, parseMoney, dateDE, balance, periodsEnabled, PERIODS, ACCOUNT_KINDS, AREAS, ROLES, dialog, confirmDialog, toast, busy } from "./util.js";
import { route } from "./main.js";

/* ---------------- Konten ---------------- */

export function renderAccounts(el) {
  const used = (id) => data.bookings.some((b) => b.account_id === id || b.to_account_id === id);
  el.innerHTML = `
    <div class="page-head head-row">
      <div><h1>Konten</h1><p class="muted">Barkassen und Bankkonten. Jede Buchung gehört zu einem Konto und zu einem Bereich (Getränkekasse oder Verein).</p></div>
      ${ctx.canWrite ? `<div class="head-actions"><button class="btn btn-primary" id="add">${icon("plus")} Konto anlegen</button></div>` : ""}
    </div>
    <div class="acc-grid">
      ${data.accounts.map((a) => `
        <div class="card acc-card ${a.active ? "" : "inactive"}">
          <div class="acc-top">${icon(a.kind === "bank" ? "bank" : "wallet")}<div><strong>${esc(a.name)}</strong>
            <span class="muted small">${ACCOUNT_KINDS[a.kind]}${a.active ? "" : " · deaktiviert"}</span></div></div>
          ${a.kind === "bank" ? `<p class="small mono">${a.iban ? esc(a.iban) : `<span class="muted">IBAN noch nicht eingetragen</span>`}${a.bank ? `<br><span class="muted">${esc(a.bank)}</span>` : ""}</p>` : ""}
          <div class="acc-total">${money(balance({ accountId: a.id }))}</div>
          <div class="acc-split">
            <span>${AREAS.getraenke}<strong>${money(balance({ accountId: a.id, area: "getraenke" }))}</strong></span>
            <span>${AREAS.verein}<strong>${money(balance({ accountId: a.id, area: "verein" }))}</strong></span>
          </div>
          ${ctx.canWrite ? `<div class="acc-actions">
            <button class="btn btn-secondary btn-sm" data-edit="${a.id}">${icon("edit")} Bearbeiten</button>
            ${used(a.id) ? "" : `<button class="btn btn-danger-ghost btn-sm" data-del="${a.id}">Löschen</button>`}
          </div>` : ""}
        </div>`).join("")}
    </div>
    ${ctx.canWrite ? `<form class="card form narrow" id="settings">
      <h2>Getränkepauschale</h2>
      <p class="muted small">Standard für neue Mitglieder und den Import. Bei jedem Mitglied lässt sich Betrag und Zeitraum einzeln ändern.</p>
      <div class="fee-row">
        <label>Standardbetrag in €<input name="fee" inputmode="decimal" value="${esc(moneyInput(data.settings.drinks_fee_cents))}" placeholder="0,00"></label>
        ${periodsEnabled() ? `<label>Zeitraum<select name="period">${Object.entries(PERIODS).map(([k, l]) => `<option value="${k}" ${(data.settings.drinks_period || "jahr") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>`
          : `<p class="form-error small">Für „pro Monat“ bitte einmal supabase/update-6.sql in Supabase ausführen. Bis dahin gilt: pro Jahr.</p>`}
      </div>
      <button class="btn btn-primary">Speichern</button>
    </form>` : ""}`;

  el.querySelector("#add")?.addEventListener("click", () => editAccount(null));
  el.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => editAccount(data.accounts.find((a) => a.id === Number(b.dataset.edit)))));
  el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    const a = data.accounts.find((x) => x.id === Number(b.dataset.del));
    if (!(await confirmDialog("Konto löschen?", `„${a.name}“ wird gelöscht.`, "Löschen", "btn-danger-ghost"))) return;
    const ok = await busy(b, async () => { await api.remove("vw_accounts", a.id); return true; });
    if (!ok) return;
    await api.reload();
    toast("Konto gelöscht");
    route();
  }));
  el.querySelector("#settings")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fee = e.target.fee.value.trim() ? parseMoney(e.target.fee.value) : 0;
    if (fee == null || fee < 0) return toast("Bitte einen gültigen Betrag eingeben.", "error");
    const ok = await busy(e.submitter, async () => { await api.update("vw_settings", 1, { drinks_fee_cents: fee, ...(e.target.period ? { drinks_period: e.target.period.value } : {}), updated_at: new Date().toISOString() }); return true; });
    if (!ok) return;
    await api.reload();
    toast("Gespeichert");
  });
}

async function editAccount(a) {
  const isNew = !a;
  const used = !isNew && data.bookings.some((b) => b.account_id === a.id || b.to_account_id === a.id);
  a ||= { name: "", kind: "bank", iban: "", bank: "", start_getraenke_cents: 0, start_verein_cents: 0, active: true };
  const values = await dialog({
    title: isNew ? "Konto anlegen" : `${a.name} bearbeiten`,
    html: `<div class="form">
      <label>Name<input name="name" required maxlength="60" value="${esc(a.name)}" placeholder="z. B. Barkasse Getränke, Sparkasse"></label>
      <label>Art<select name="kind">${Object.entries(ACCOUNT_KINDS).map(([k, v]) => `<option value="${k}" ${k === a.kind ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="bank-only">IBAN / Kontonummer <span class="muted small">(kann später eingetragen werden)</span><input name="iban" maxlength="40" value="${esc(a.iban || "")}" autocapitalize="characters"></label>
      <label class="bank-only">Bank<input name="bank" maxlength="60" value="${esc(a.bank || "")}"></label>
      <fieldset class="plain" ${used ? "disabled" : ""}>
        <p class="lbl">Anfangsbestand beim Start der App ${used ? `<span class="muted small">(nicht mehr änderbar, weil es Buchungen gibt)</span>` : ""}</p>
        <div class="field-row">
          <label>${AREAS.getraenke} €<input name="sg" inputmode="decimal" value="${esc(moneyInput(a.start_getraenke_cents))}"></label>
          <label>${AREAS.verein} €<input name="sv" inputmode="decimal" value="${esc(moneyInput(a.start_verein_cents))}"></label>
        </div>
      </fieldset>
      ${isNew ? "" : `<label class="check"><input type="checkbox" name="active" ${a.active ? "checked" : ""}> <span>Aktiv (deaktivierte Konten erscheinen nicht mehr bei neuen Buchungen)</span></label>`}
    </div>`,
    buttons: [{ label: "Abbrechen", value: null, validate: false }, {
      label: "Speichern", cls: "btn-primary",
      value: (d) => {
        const q = (n) => d.querySelector(`[name=${n}]`);
        return { name: q("name").value.trim(), kind: q("kind").value, iban: q("iban").value.replace(/\s+/g, " ").trim().toUpperCase() || null, bank: q("bank").value.trim() || null, sg: q("sg").value, sv: q("sv").value, active: isNew ? true : q("active").checked };
      },
    }],
    onOpen: (d) => {
      const sync = () => d.querySelectorAll(".bank-only").forEach((x) => (x.hidden = d.querySelector("[name=kind]").value !== "bank"));
      d.querySelector("[name=kind]").onchange = sync;
      sync();
    },
  });
  if (!values) return;
  const row = { name: values.name, kind: values.kind, iban: values.kind === "bank" ? values.iban : null, bank: values.kind === "bank" ? values.bank : null, active: values.active };
  if (!used) {
    const sg = values.sg.trim() ? parseMoney(values.sg) : 0;
    const sv = values.sv.trim() ? parseMoney(values.sv) : 0;
    if (sg == null || sv == null) return toast("Bitte gültige Beträge für den Anfangsbestand eingeben.", "error");
    Object.assign(row, { start_getraenke_cents: sg, start_verein_cents: sv });
  }
  const ok = await busy(null, async () => {
    if (isNew) await api.insert("vw_accounts", row); else await api.update("vw_accounts", a.id, row);
    return true;
  });
  if (!ok) return;
  await api.reload();
  toast(isNew ? "Konto angelegt" : "Gespeichert");
  route();
}

/* ---------------- Zugänge (Admin) ---------------- */

const regLink = () => `${CONFIG.appUrl || location.origin + "/"}verwaltung/`;

export async function renderUsers(el) {
  if (!ctx.isAdmin) { location.hash = "#/"; return; }
  el.innerHTML = `<div class="page-head"><h1>Zugänge</h1></div><div class="card"><div class="loader"></div></div>`;
  const users = await api.listUsers();
  const pending = users.filter((u) => u.role === "pending");
  const active = users.filter((u) => u.role !== "pending");
  const roleBtns = (u) => ["kassenwart", "vorsitz", "pruefer", "admin"].map((r) => `<button class="btn ${r === "kassenwart" ? "btn-primary" : "btn-secondary"} btn-sm" data-role="${r}" data-id="${u.id}">Als ${ROLES[r].replace(" (nur lesen)", "")}</button>`).join("");

  el.innerHTML = `
    <div class="page-head"><h1>Zugänge</h1>
      <p class="muted">Kassenwart, Vorsitz und Kassenprüfer registrieren sich mit ihrer eigenen E-Mail-Adresse. Du gibst sie hier frei. Wird jemand neu gewählt, gibst du die neue Person frei und entfernst den alten Zugang.</p></div>
    <div class="card">
      <div class="card-head"><h2>Neue Anfragen ${pending.length ? `<span class="tag tag-red">${pending.length}</span>` : ""}</h2></div>
      ${pending.length ? `<ul class="user-list">${pending.map((u) => `<li>
        <div class="grow"><strong>${esc(u.name || "Ohne Namen")}</strong><span class="muted small">${esc(u.email)} · seit ${dateDE(u.created_at.slice(0, 10))}</span></div>
        <div class="btn-row">${roleBtns(u)}<button class="btn btn-danger-ghost btn-sm" data-remove="${u.id}">Ablehnen</button></div></li>`).join("")}</ul>`
        : `<p class="muted">Keine offenen Anfragen.</p>`}
    </div>
    <div class="card">
      <div class="card-head"><h2>Freigegeben</h2></div>
      <ul class="user-list">${active.map((u) => `<li>
        <div class="grow"><strong>${esc(u.name || "Ohne Namen")}${u.me ? " (du)" : ""}</strong><span class="muted small">${esc(u.email)}${u.approved_at ? ` · freigegeben ${dateDE(u.approved_at.slice(0, 10))}` : ""}</span></div>
        <div class="btn-row">${u.me ? `<span class="tag">${ROLES[u.role]}</span>` : `
          <select data-change="${u.id}" aria-label="Rolle">${["kassenwart", "vorsitz", "pruefer", "admin"].map((r) => `<option value="${r}" ${r === u.role ? "selected" : ""}>${ROLES[r]}</option>`).join("")}</select>
          <button class="btn btn-danger-ghost btn-sm" data-remove="${u.id}">Zugang entfernen</button>`}</div></li>`).join("")}</ul>
    </div>
    <div class="card">
      <h2>Link zum Registrieren</h2>
      <p class="muted small">Diesen Link an den neuen Kassenwart oder Vorsitz schicken. Dort auf „Zugang beantragen“ tippen.</p>
      <div class="copy-row"><input readonly value="${esc(regLink())}"><button class="btn btn-secondary" id="copy">Kopieren</button>
      ${navigator.share ? `<button class="btn btn-secondary" id="share">Teilen</button>` : ""}</div>
    </div>`;

  const find = (id) => users.find((u) => u.id === id);
  el.querySelectorAll("[data-role]").forEach((b) => (b.onclick = async () => {
    const ok = await busy(b, async () => { await api.setRole(b.dataset.id, b.dataset.role); return true; });
    if (ok) { toast(`${find(b.dataset.id).name || find(b.dataset.id).email} ist freigegeben als ${ROLES[b.dataset.role]}`); renderUsers(el); }
  }));
  el.querySelectorAll("[data-change]").forEach((s) => (s.onchange = async () => {
    const ok = await busy(null, async () => { await api.setRole(s.dataset.change, s.value); return true; });
    if (ok) toast("Rolle geändert"); else renderUsers(el);
  }));
  el.querySelectorAll("[data-remove]").forEach((b) => (b.onclick = async () => {
    const u = find(b.dataset.remove);
    const yes = await confirmDialog(u.role === "pending" ? "Anfrage ablehnen?" : "Zugang entfernen?",
      `${u.name || u.email} hat danach keinen Zugriff mehr auf die Verwaltung. Buchungen dieser Person bleiben erhalten.`, u.role === "pending" ? "Ablehnen" : "Entfernen", "btn-danger-ghost");
    if (!yes) return;
    const ok = await busy(b, async () => { await api.removeUser(u.id); return true; });
    if (ok) { toast("Zugang entfernt"); renderUsers(el); }
  }));
  el.querySelector("#copy").onclick = async () => {
    try { await navigator.clipboard.writeText(regLink()); toast("Link kopiert"); } catch { el.querySelector(".copy-row input").select(); }
  };
  el.querySelector("#share")?.addEventListener("click", () => navigator.share({ title: "Vereinsverwaltung DRK OV Loppersum", text: "Hier kannst du deinen Zugang zur Vereinsverwaltung beantragen:", url: regLink() }).catch(() => {}));
}
