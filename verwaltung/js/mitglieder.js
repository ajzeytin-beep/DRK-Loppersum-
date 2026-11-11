// Mitgliederliste: Name, Adresse, Geburtstag, Eintritt, Getränkepauschale – mit Import und Export
import { icon } from "../../js/icons.js";
import * as api from "./api.js";
import { ctx, data } from "./api.js";
import { esc, money, moneyInput, moneyPlain, parseMoney, dateDE, age, drinksPaid, drinksStatus, periodsEnabled, periodOf, feeLabel, PERIODS, MONTHS, memberName, memberById, downloadCsv, confirmDialog, toast, busy } from "./util.js";
import { readMembersFile, downloadTemplate } from "./importer.js";

const yearsSince = (iso) => (iso ? age(iso) : null);

export function renderList(el, { params }) {
  const status = params.get("status") || "aktiv";
  const q = (params.get("q") || "").toLowerCase();
  const year = Number(params.get("jahr")) || new Date().getFullYear();
  const list = data.members
    .filter((m) => (status === "alle" ? true : status === "aktiv" ? !m.exit_date : !!m.exit_date))
    .filter((m) => !q || [m.first_name, m.last_name, m.street, m.city, m.zip, m.email, m.phone].join(" ").toLowerCase().includes(q));
  const fee = (m) => m.drinks_fee_cents || 0;
  const withFee = list.filter((m) => fee(m) > 0);
  const openCount = withFee.filter((m) => drinksStatus(m, year).open > 0).length;

  el.innerHTML = `
    <div class="page-head head-row">
      <div><h1>Mitglieder</h1><p class="muted">${list.length} ${status === "ausgetreten" ? "ausgetreten" : status === "alle" ? "insgesamt" : "aktiv"} · Getränkepauschale ${year}: ${withFee.length - openCount} bezahlt, ${openCount} offen</p></div>
      <div class="head-actions">
        ${ctx.canWrite ? `<a class="btn btn-primary" href="#/mitglied/neu">${icon("plus")} Mitglied</a><a class="btn btn-secondary" href="#/import">${icon("upload")} Import</a>` : ""}
        <button class="btn btn-ghost" id="csv">${icon("download")} Export</button>
      </div>
    </div>
    <form class="card filters" id="mf">
      <label>Status<select name="status">
        <option value="aktiv" ${status === "aktiv" ? "selected" : ""}>Aktive</option>
        <option value="ausgetreten" ${status === "ausgetreten" ? "selected" : ""}>Ausgetretene</option>
        <option value="alle" ${status === "alle" ? "selected" : ""}>Alle</option></select></label>
      <label>Pauschale für<select name="jahr">${[0, 1, 2].map((d) => new Date().getFullYear() - d).map((y) => `<option ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select></label>
      <label class="grow">Suche<input name="q" type="search" value="${esc(params.get("q") || "")}" placeholder="Name, Ort, E-Mail"></label>
    </form>
    <div class="card">
      ${list.length ? `<div class="table-wrap"><table class="book members">
        <thead><tr><th>Name</th><th>Adresse</th><th>Geburtstag</th><th>Eintritt</th><th>Getränkepauschale ${year}</th></tr></thead>
        <tbody>${list.map((m) => {
          const s = drinksStatus(m, year);
          const monthly = s.period === "monat";
          const paidText = monthly ? (s.paidUntil ? `bezahlt bis ${MONTHS[s.paidUntil - 1]}` : "noch nichts bezahlt") : `bezahlt ${money(s.paid)}`;
          const kassieren = ctx.canWrite ? ` <a class="btn btn-secondary btn-sm" href="#/buchung?mitglied=${m.id}&pauschale=${year}" data-stop>kassieren</a>` : "";
          const state = !s.fee ? `<span class="muted">–</span>`
            : s.open <= 0 ? `<span class="tag tag-ok">${s.due || s.paid ? paidText : "nichts fällig"}</span>${monthly && s.due > 0 && s.paidUntil !== 12 ? kassieren : ""}`
            : `<span class="tag tag-red">offen ${money(s.open)}${monthly ? ` (${Math.round(s.open / s.fee)} Mon.)` : ""}</span>${kassieren}`;
          const feeInfo = s.fee ? `<span class="muted small" style="display:block">${feeLabel(m)}</span>` : "";
          return `<tr data-id="${m.id}" class="${m.exit_date ? "is-storno" : ""}">
            <td class="purpose"><strong>${esc(m.last_name)}${m.last_name && m.first_name ? ", " : ""}${esc(m.first_name)}</strong>${m.exit_date ? `<span class="muted small">ausgetreten ${dateDE(m.exit_date)}</span>` : ""}</td>
            <td data-label="Adresse">${esc([m.street, [m.zip, m.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")) || `<span class="muted">–</span>`}</td>
            <td data-label="Geburtstag">${m.birthday ? `${dateDE(m.birthday)} <span class="muted small">(${age(m.birthday)})</span>` : `<span class="muted">–</span>`}</td>
            <td data-label="Eintritt">${m.entry_date ? `${dateDE(m.entry_date)} <span class="muted small">(${yearsSince(m.entry_date)} J.)</span>` : `<span class="muted">–</span>`}</td>
            <td data-label="Pauschale">${state}${feeInfo}</td>
          </tr>`;
        }).join("")}</tbody></table></div>`
        : `<p class="muted">Keine Mitglieder gefunden.${ctx.canWrite && !data.members.length ? ` Lege das erste Mitglied an oder <a class="link" href="#/import">importiere eine Liste</a>.` : ""}</p>`}
    </div>`;

  const form = el.querySelector("#mf");
  const apply = () => {
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (v) p.set(k, v);
    history.replaceState(null, "", `#/mitglieder?${p}`);
    renderList(el, { params: p });
    const i = el.querySelector("[name=q]");
    if (p.get("q")) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  };
  form.onchange = apply;
  let timer;
  form.q.oninput = () => { clearTimeout(timer); timer = setTimeout(apply, 350); };
  form.onsubmit = (e) => { e.preventDefault(); apply(); };
  el.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = (e) => {
    if (e.target.closest("[data-stop]")) return;
    location.hash = `#/mitglied/${tr.dataset.id}`;
  }));
  el.querySelector("#csv").onclick = () => exportCsv(list, year);
}

function exportCsv(list, year) {
  downloadCsv(`Mitglieder-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["Nachname", "Vorname", "Straße", "PLZ", "Ort", "Geburtstag", "Alter", "Eintrittsdatum", "Austrittsdatum", "Getränkepauschale", "Zeitraum", `Bezahlt ${year}`, `Offen ${year}`, "Telefon", "E-Mail", "Bemerkung"],
    ...list.map((m) => [
      m.last_name, m.first_name, m.street || "", m.zip || "", m.city || "", dateDE(m.birthday), m.birthday ? age(m.birthday) : "",
      dateDE(m.entry_date), dateDE(m.exit_date), m.drinks_fee_cents ? moneyPlain(m.drinks_fee_cents) : "", m.drinks_fee_cents ? PERIODS[periodOf(m)] : "",
      m.drinks_fee_cents ? moneyPlain(drinksPaid(m.id, year)) : "", m.drinks_fee_cents ? moneyPlain(drinksStatus(m, year).open) : "", m.phone || "", m.email || "", m.note || "",
    ]),
  ]);
}

/* ---------------- Mitglied bearbeiten ---------------- */

export function renderForm(el, { arg }) {
  const isNew = arg === "neu";
  const m = isNew ? { drinks_fee_cents: data.settings.drinks_fee_cents || null, drinks_period: data.settings.drinks_period || "jahr" } : memberById(Number(arg));
  if (!m) { el.innerHTML = `<div class="card"><p>Mitglied nicht gefunden.</p><a class="link" href="#/mitglieder">Zur Liste</a></div>`; return; }
  const ro = !ctx.canWrite;
  const v = (k) => esc(m[k] ?? "");
  const hist = isNew ? [] : data.bookings.filter((b) => b.member_id === m.id).sort((a, b) => (a.booking_date < b.booking_date ? 1 : -1));

  el.innerHTML = `
    <div class="page-head"><a class="link small" href="#/mitglieder">← Mitglieder</a><h1>${isNew ? "Neues Mitglied" : esc(memberName(m))}</h1></div>
    <form class="card form" id="mform">
      <fieldset ${ro ? "disabled" : ""} class="plain">
      <div class="field-row">
        <label>Vorname<input name="first_name" maxlength="60" value="${v("first_name")}" autocomplete="off"></label>
        <label>Nachname<input name="last_name" maxlength="60" required value="${v("last_name")}" autocomplete="off"></label>
      </div>
      <label>Straße und Hausnummer<input name="street" maxlength="100" value="${v("street")}"></label>
      <div class="field-row">
        <label class="w-zip">PLZ<input name="zip" maxlength="10" inputmode="numeric" value="${v("zip")}"></label>
        <label>Ort<input name="city" maxlength="60" value="${v("city")}"></label>
      </div>
      <div class="field-row">
        <label>Geburtstag<input type="date" name="birthday" value="${v("birthday")}"></label>
        <label>Eintrittsdatum<input type="date" name="entry_date" value="${v("entry_date")}"></label>
      </div>
      <div class="field-row">
        <div class="fee-row">
          <label>Getränkepauschale in € <span class="muted small">(leer = keine)</span><input name="drinks" inputmode="decimal" placeholder="0,00" value="${esc(moneyInput(m.drinks_fee_cents))}"></label>
          ${periodsEnabled() ? `<label>Zeitraum<select name="period">${Object.entries(PERIODS).map(([k, l]) => `<option value="${k}" ${periodOf(m) === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : `<span class="muted small">pro Jahr</span>`}
        </div>
        <label>Austrittsdatum <span class="muted small">(nur bei Austritt)</span><input type="date" name="exit_date" value="${v("exit_date")}"></label>
      </div>
      <div class="field-row">
        <label>Telefon<input name="phone" type="tel" maxlength="40" value="${v("phone")}"></label>
        <label>E-Mail<input name="email" type="email" maxlength="100" value="${v("email")}"></label>
      </div>
      <label>Bemerkung<textarea name="note" rows="2" maxlength="500">${v("note")}</textarea></label>
      </fieldset>
      <p class="form-error" hidden></p>
      ${ro ? "" : `<div class="form-actions">
        <button class="btn btn-primary btn-lg">${icon("check")} Speichern</button>
        ${isNew ? "" : `<button type="button" class="btn btn-danger-ghost" id="del">Löschen</button>`}
      </div>`}
    </form>
    ${isNew ? "" : `<div class="card"><div class="card-head"><h2>Buchungen dieses Mitglieds</h2>
      ${ctx.canWrite && m.drinks_fee_cents ? `<a class="btn btn-secondary btn-sm" href="#/buchung?mitglied=${m.id}">${icon("plus")} Pauschale kassieren</a>` : ""}</div>
      ${hist.length ? `<ul class="mini-list">${hist.map((b) => `<li><a href="#/kasse?q=${encodeURIComponent(b.number)}&jahr=${b.booking_date.slice(0, 4)}"><span class="nr">${esc(b.number)}</span><span class="grow"><strong>${esc(b.purpose)}</strong><span class="muted small">${dateDE(b.booking_date)}</span></span><strong>${money(b.amount_cents)}</strong></a></li>`).join("")}</ul>` : `<p class="muted">Noch keine.</p>`}</div>`}`;

  if (ro) return;
  const f = el.querySelector("#mform");
  const err = f.querySelector(".form-error");
  f.addEventListener("input", () => f.classList.add("dirty"));
  f.onsubmit = async (e) => {
    e.preventDefault();
    err.hidden = true;
    const drinks = f.drinks.value.trim() ? parseMoney(f.drinks.value) : null;
    if (f.drinks.value.trim() && (drinks == null || drinks < 0)) { err.textContent = "Bitte einen gültigen Betrag für die Getränkepauschale eingeben."; err.hidden = false; return; }
    const t = (k) => f[k].value.trim() || null;
    const row = {
      first_name: f.first_name.value.trim(), last_name: f.last_name.value.trim(),
      street: t("street"), zip: t("zip"), city: t("city"),
      birthday: t("birthday"), entry_date: t("entry_date"), exit_date: t("exit_date"),
      drinks_fee_cents: drinks || null, phone: t("phone"), email: t("email"), note: t("note"),
      updated_at: new Date().toISOString(),
    };
    if (f.period) row.drinks_period = f.period.value;
    const ok = await busy(e.submitter, async () => {
      if (isNew) await api.insert("vw_members", row); else await api.update("vw_members", m.id, row);
      return true;
    });
    if (!ok) return;
    f.classList.remove("dirty");
    await api.reload();
    toast(isNew ? "Mitglied angelegt" : "Gespeichert");
    location.hash = "#/mitglieder";
  };
  el.querySelector("#del")?.addEventListener("click", async (e) => {
    const yes = await confirmDialog("Mitglied löschen?",
      `${memberName(m)} wird endgültig gelöscht. Buchungen bleiben im Kassenbuch erhalten. Tipp: Bei einem Austritt besser das Austrittsdatum eintragen.`,
      "Endgültig löschen", "btn-danger-ghost");
    if (!yes) return;
    const ok = await busy(e.currentTarget, async () => { await api.remove("vw_members", m.id); return true; });
    if (!ok) return;
    await api.reload();
    toast("Mitglied gelöscht");
    location.hash = "#/mitglieder";
  });
}

/* ---------------- Import ---------------- */

export function renderImport(el) {
  if (!ctx.canWrite) { location.hash = "#/mitglieder"; return; }
  el.innerHTML = `
    <div class="page-head"><a class="link small" href="#/mitglieder">← Mitglieder</a><h1>Mitglieder importieren</h1>
      <p class="muted">Excel-Datei (.xlsx) oder CSV hochladen. Die Spalten werden an den Überschriften erkannt, z. B. Vorname, Nachname, Straße, PLZ, Ort, Geburtstag, Eintrittsdatum, Getränkepauschale.</p></div>
    <div class="card">
      <div class="photo-actions">
        <label class="btn btn-primary file-btn">${icon("upload")} Datei wählen<input type="file" id="file" accept=".xlsx,.xls,.csv,.ods,.txt" hidden></label>
        <button class="btn btn-ghost" id="tpl">${icon("download")} Vorlage herunterladen</button>
      </div>
      <p class="muted small">Getränkepauschale: Betrag (z. B. 60,00) oder „ja“/„nein“. Bei „ja“ gilt der Standardbetrag aus „Konten“ (${money(data.settings.drinks_fee_cents)}${periodsEnabled() ? ` ${PERIODS[data.settings.drinks_period || "jahr"]}` : ""}). Optional eine Spalte „Zeitraum“ mit „Monat“ oder „Jahr“.</p>
    </div>
    <div id="preview"></div>`;
  el.querySelector("#tpl").onclick = downloadTemplate;
  el.querySelector("#file").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const box = el.querySelector("#preview");
    box.innerHTML = `<div class="card"><div class="loader"></div></div>`;
    let res;
    try { res = await readMembersFile(file, data.settings.drinks_fee_cents, periodsEnabled() ? data.settings.drinks_period || "jahr" : null); } catch (ex) {
      box.innerHTML = `<div class="card"><p class="form-error">${esc(ex.message)}</p></div>`;
      return;
    }
    const key = (m) => `${m.first_name}|${m.last_name}|${m.birthday || ""}`.toLowerCase();
    const existing = new Set(data.members.map(key));
    const dupes = res.rows.filter((r) => existing.has(key(r))).length;
    box.innerHTML = `<div class="card">
      <div class="card-head"><h2>Vorschau: ${res.rows.length} Mitglieder</h2></div>
      <p class="muted small">Erkannte Spalten: ${esc(res.columns.join(", "))}${res.skipped ? ` · ${res.skipped} Zeilen ohne Namen übersprungen` : ""}${dupes ? ` · <strong>${dupes} sind schon vorhanden</strong> (gleicher Name und Geburtstag)` : ""}</p>
      <div class="table-wrap"><table class="book members"><thead><tr><th>Name</th><th>Adresse</th><th>Geburtstag</th><th>Eintritt</th><th>Pauschale</th></tr></thead>
      <tbody>${res.rows.slice(0, 200).map((m) => `<tr class="${existing.has(key(m)) ? "is-storno" : ""}"><td class="purpose"><strong>${esc(m.last_name)}, ${esc(m.first_name)}</strong></td>
        <td data-label="Adresse">${esc([m.street, [m.zip, m.city].filter(Boolean).join(" ")].filter(Boolean).join(", "))}</td>
        <td data-label="Geburtstag">${dateDE(m.birthday)}</td><td data-label="Eintritt">${dateDE(m.entry_date)}</td>
        <td data-label="Pauschale">${m.drinks_fee_cents != null ? feeLabel(m) : "–"}</td></tr>`).join("")}</tbody></table></div>
      ${res.rows.length > 200 ? `<p class="muted small">… und ${res.rows.length - 200} weitere</p>` : ""}
      <label class="check" ${dupes ? "" : "hidden"}><input type="checkbox" id="skip" checked> <span>Bereits vorhandene überspringen</span></label>
      <div class="form-actions"><button class="btn btn-primary btn-lg" id="go" ${res.rows.length ? "" : "disabled"}>${icon("check")} Importieren</button></div>
    </div>`;
    box.querySelector("#go").onclick = async (ev) => {
      const skip = box.querySelector("#skip").checked;
      const rows = skip ? res.rows.filter((r) => !existing.has(key(r))) : res.rows;
      if (!rows.length) return toast("Nichts zu importieren – alle sind schon vorhanden.");
      const ok = await busy(ev.currentTarget, async () => {
        for (let i = 0; i < rows.length; i += 200) await api.insert("vw_members", rows.slice(i, i + 200));
        return true;
      });
      if (!ok) return;
      await api.reload();
      toast(`${rows.length} Mitglieder importiert`);
      location.hash = "#/mitglieder";
    };
  };
}

