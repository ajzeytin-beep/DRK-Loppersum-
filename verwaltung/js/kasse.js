// Kassenbuch: Liste mit laufendem Saldo, Buchung erfassen (auch per Foto), Storno, Belege
import { icon } from "../../js/icons.js";
import * as api from "./api.js";
import { ctx, data } from "./api.js";
import * as ocr from "./ocr.js";
import {
  esc, money, moneyPlain, moneyInput, parseMoney, dateDE, today, yearOf, years, effect, balance, totals, nextNumber,
  accountName, memberName, memberById, AREAS, KINDS, CATEGORIES, downloadCsv, dialog, promptDialog, toast, busy,
} from "./util.js";
import { route } from "./main.js";

const LAST_ACCOUNT = "vw-last-account";
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignorieren */ } },
};

/* ---------------- Kassenbuch ---------------- */

export function renderBook(el, { params }) {
  const f = {
    jahr: params.get("jahr") || String(new Date().getFullYear()),
    bereich: params.get("bereich") || "",
    konto: params.get("konto") || "",
    art: params.get("art") || "",
    q: params.get("q") || "",
  };
  const accountId = f.konto ? Number(f.konto) : null;
  const area = f.bereich || null;
  const year = f.jahr === "alle" ? null : Number(f.jahr);

  // Saldo über den gewählten Bereich/das Konto; Art und Suche blenden nur Zeilen aus
  const scope = data.bookings
    .filter((b) => (!area || b.area === area) && (year == null || yearOf(b.booking_date) === year))
    .filter((b) => accountId == null || b.account_id === accountId || b.to_account_id === accountId)
    .sort((a, b) => (a.booking_date < b.booking_date ? -1 : a.booking_date > b.booking_date ? 1 : a.id - b.id));
  const start = year == null ? balance({ accountId, area, before: "0000-01-01" }) : balance({ accountId, area, before: `${year}-01-01` });
  let saldo = start;
  const q = f.q.toLowerCase();
  const rows = [];
  for (const b of scope) {
    saldo += effect(b, accountId);
    if (f.art && b.kind !== f.art) continue;
    if (q && ![b.number, b.purpose, b.category, memberName(memberById(b.member_id)), moneyPlain(b.amount_cents)].join(" ").toLowerCase().includes(q)) continue;
    rows.push({ b, saldo });
  }
  const t = totals(rows.map((r) => r.b));

  const opt = (val, label, cur) => `<option value="${esc(val)}" ${String(cur) === String(val) ? "selected" : ""}>${esc(label)}</option>`;
  el.innerHTML = `
    <div class="page-head head-row">
      <div><h1>Kassenbuch</h1><p class="muted">${area ? AREAS[area] : "Getränkekasse und Verein"} · ${accountId ? esc(accountName(accountId)) : "alle Konten"} · ${year ?? "alle Jahre"}</p></div>
      <div class="head-actions">
        ${ctx.canWrite ? `<a class="btn btn-primary" href="#/buchung?foto=1">${icon("camera")} Beleg fotografieren</a><a class="btn btn-secondary" href="#/buchung">${icon("plus")} Buchung</a>` : ""}
      </div>
    </div>
    <form class="card filters" id="filters">
      <label>Jahr<select name="jahr">${years().map((y) => opt(y, y, f.jahr)).join("")}${opt("alle", "Alle Jahre", f.jahr)}</select></label>
      <label>Bereich<select name="bereich">${opt("", "Alle", f.bereich)}${opt("getraenke", AREAS.getraenke, f.bereich)}${opt("verein", AREAS.verein, f.bereich)}</select></label>
      <label>Konto<select name="konto">${opt("", "Alle Konten", f.konto)}${data.accounts.map((a) => opt(a.id, a.name, f.konto)).join("")}</select></label>
      <label>Art<select name="art">${opt("", "Alle", f.art)}${Object.entries(KINDS).map(([k, v]) => opt(k, v, f.art)).join("")}</select></label>
      <label class="grow">Suche<input name="q" type="search" value="${esc(f.q)}" placeholder="Nr., Zweck, Mitglied, Betrag"></label>
    </form>

    <div class="kpis kpis-3">
      <div class="kpi">${icon("wallet")}<div><span>Anfangsbestand${year ? ` 01.01.${year}` : ""}</span><strong>${money(start)}</strong></div></div>
      <div class="kpi">${icon("download")}<div><span>Einnahmen</span><strong class="good">${money(t.inc)}</strong></div></div>
      <div class="kpi">${icon("upload")}<div><span>Ausgaben</span><strong class="bad">${money(t.exp)}</strong></div></div>
      <div class="kpi">${icon("check")}<div><span>${year && year < new Date().getFullYear() ? `Endbestand 31.12.${year}` : "Bestand jetzt"}</span><strong>${money(saldo)}</strong></div></div>
    </div>

    <div class="card book-card">
      <div class="card-head"><h2>${rows.length} Buchung${rows.length === 1 ? "" : "en"}</h2>
        <button class="btn btn-ghost btn-sm" id="csv">${icon("download")} CSV / Excel</button></div>
      ${rows.length ? `<div class="table-wrap"><table class="book">
        <thead><tr><th>Nr.</th><th>Datum</th><th>Verwendungszweck</th><th class="num">Einnahme</th><th class="num">Ausgabe</th><th class="num">Saldo</th></tr></thead>
        <tbody>${rows.map(({ b, saldo: s }) => bookRow(b, s, accountId)).join("")}</tbody>
      </table></div>` : `<p class="muted">Keine Buchungen für diese Auswahl.</p>`}
    </div>`;

  const form = el.querySelector("#filters");
  const apply = () => {
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (v && !(k === "jahr" && v === String(new Date().getFullYear()))) p.set(k, v);
    const h = `#/kasse${p.toString() ? `?${p}` : ""}`;
    history.replaceState(null, "", h);
    renderBook(el, { params: p });
    if (f.q !== (p.get("q") || "")) { const i = el.querySelector("[name=q]"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  };
  form.onchange = apply;
  let timer;
  form.q.oninput = () => { clearTimeout(timer); timer = setTimeout(apply, 350); };
  form.onsubmit = (e) => { e.preventDefault(); apply(); };
  el.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => showBooking(Number(tr.dataset.id))));
  el.querySelector("#csv")?.addEventListener("click", () => exportCsv(rows, accountId, `Kassenbuch-${year ?? "alle"}${area ? `-${area}` : ""}.csv`));
}

function bookRow(b, s, accountId) {
  const e = effect(b, accountId);
  const transfer = b.kind === "umbuchung";
  let inc = "", exp = "";
  if (transfer) {
    if (e > 0) inc = money(e);
    else if (e < 0) exp = money(-e);
  } else if (b.kind === "einnahme") inc = money(b.amount_cents);
  else exp = money(b.amount_cents);
  const m = memberById(b.member_id);
  const meta = [
    AREAS[b.area],
    transfer ? `${accountName(b.account_id)} → ${accountName(b.to_account_id)}` : accountName(b.account_id),
    b.category, m ? memberName(m) : null,
  ].filter(Boolean).map(esc).join(" · ");
  return `<tr data-id="${b.id}" class="${b.cancelled_by ? "is-cancelled" : b.storno_of ? "is-storno" : ""}">
    <td class="nr" data-label="Nr.">${esc(b.number)}${b.receipt_path ? ` <span title="Beleg vorhanden" class="clip">📎</span>` : ""}</td>
    <td data-label="Datum">${dateDE(b.booking_date)}</td>
    <td class="purpose"><strong>${esc(b.purpose)}</strong>
      ${b.cancelled_by ? ` <span class="tag tag-red">storniert</span>` : ""}${b.storno_of ? ` <span class="tag tag-red">Storno</span>` : ""}${transfer ? ` <span class="tag">${icon("swap")} Umbuchung ${money(Math.abs(b.amount_cents))}</span>` : ""}
      <span class="muted small">${meta}</span></td>
    <td class="num good" data-label="Einnahme">${inc}</td>
    <td class="num bad" data-label="Ausgabe">${exp}</td>
    <td class="num saldo ${s < 0 ? "bad" : ""}" data-label="Saldo">${money(s)}</td>
  </tr>`;
}

function exportCsv(rows, accountId, name) {
  downloadCsv(name, [
    ["Belegnummer", "Datum", "Bereich", "Art", "Konto", "Zielkonto", "Verwendungszweck", "Kategorie", "Mitglied", "Einnahme", "Ausgabe", "Saldo", "Storno", "Beleg", "Gebucht von", "Gebucht am"],
    ...rows.map(({ b, saldo }) => {
      const e = effect(b, accountId);
      const inc = b.kind === "einnahme" ? b.amount_cents : b.kind === "umbuchung" && e > 0 ? e : null;
      const exp = b.kind === "ausgabe" ? b.amount_cents : b.kind === "umbuchung" && e < 0 ? -e : null;
      return [
        b.number, dateDE(b.booking_date), AREAS[b.area], KINDS[b.kind], accountName(b.account_id), b.to_account_id ? accountName(b.to_account_id) : "",
        b.purpose, b.category || "", memberName(memberById(b.member_id)),
        inc == null ? "" : moneyPlain(inc), exp == null ? "" : moneyPlain(exp), moneyPlain(saldo),
        b.cancelled_by ? "storniert" : b.storno_of ? "Storno" : "", b.receipt_path ? "ja" : "", b.created_by_name || "", dateDE(b.created_at.slice(0, 10)),
      ];
    }),
  ]);
}

// Kurzliste für die Übersicht
export function miniList(list) {
  if (!list.length) return `<p class="muted">Noch keine Buchungen.</p>`;
  return `<ul class="mini-list">${list.map((b) => {
    const sign = b.kind === "einnahme" ? 1 : b.kind === "ausgabe" ? -1 : 0;
    return `<li><a href="#/kasse?q=${encodeURIComponent(b.number)}&jahr=${yearOf(b.booking_date)}">
      <span class="nr">${esc(b.number)}</span>
      <span class="grow"><strong>${esc(b.purpose)}</strong><span class="muted small">${dateDE(b.booking_date)} · ${AREAS[b.area]}</span></span>
      <strong class="${sign > 0 ? "good" : sign < 0 ? "bad" : ""}">${sign < 0 ? "−" : sign > 0 ? "+" : "↔"}${money(Math.abs(b.amount_cents))}</strong></a></li>`;
  }).join("")}</ul>`;
}

/* ---------------- Einzelne Buchung ---------------- */

async function showBooking(id) {
  const b = data.bookings.find((x) => x.id === id);
  if (!b) return;
  const m = memberById(b.member_id);
  const ref = (bid) => data.bookings.find((x) => x.id === bid)?.number || "";
  const rows = [
    ["Belegnummer", b.number],
    ["Datum", dateDE(b.booking_date)],
    ["Art", KINDS[b.kind]],
    ["Bereich", AREAS[b.area]],
    ["Konto", b.to_account_id ? `${accountName(b.account_id)} → ${accountName(b.to_account_id)}` : accountName(b.account_id)],
    ["Betrag", money(b.amount_cents)],
    ["Verwendungszweck", b.purpose],
    ["Kategorie", b.category || "–"],
    ["Mitglied", m ? memberName(m) : "–"],
    ["Gebucht von", `${b.created_by_name || "–"} am ${dateDE(b.created_at.slice(0, 10))}`],
    ...(b.cancelled_by ? [["Storniert durch", ref(b.cancelled_by)]] : []),
    ...(b.storno_of ? [["Storno zu", ref(b.storno_of)]] : []),
  ];
  const canCancel = ctx.canWrite && !b.cancelled_by && !b.storno_of;
  const buttons = [{ label: "Schließen", value: null }];
  if (ctx.canWrite) buttons.unshift({ label: b.receipt_path ? "Beleg ersetzen" : "Beleg nachreichen", value: "receipt", validate: false });
  if (canCancel) buttons.unshift({ label: "Stornieren", cls: "btn-danger-ghost", value: "cancel", validate: false });
  const action = await dialog({
    title: `Buchung ${b.number}`,
    html: `<dl class="detail">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${b.receipt_path ? `<div class="receipt-view" id="rv"><div class="loader"></div></div>` : `<p class="muted small">Kein Beleg hinterlegt.</p>`}`,
    buttons,
    wide: true,
    onOpen: async (d) => {
      if (!b.receipt_path) return;
      const box = d.querySelector("#rv");
      try {
        const url = await api.receiptUrl(b.receipt_path);
        box.innerHTML = /\.pdf$/i.test(b.receipt_path)
          ? `<a class="btn btn-secondary" href="${url}" target="_blank" rel="noopener">${icon("file")} PDF öffnen</a>`
          : `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Beleg ${esc(b.number)}"></a>`;
      } catch (e) {
        box.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
      }
    },
  });
  if (action === "cancel") return cancel(b);
  if (action === "receipt") return attachReceipt(b);
}

async function cancel(b) {
  const reason = await promptDialog(
    `Buchung ${b.number} stornieren`,
    `Es wird eine Gegenbuchung über ${money(-b.amount_cents)} mit dem heutigen Datum und einer neuen Belegnummer angelegt. Die ursprüngliche Buchung bleibt sichtbar. Grund:`,
    { label: "Stornieren", placeholder: "z. B. Betrag falsch eingegeben" },
  );
  if (!reason) return;
  const r = await busy(null, () => api.cancelBooking(b.id, reason));
  if (!r) return;
  await api.reload();
  toast(`Storniert – Gegenbuchung ${r.number}`);
  route();
}

async function attachReceipt(b) {
  const file = await pickFile("image/*,application/pdf");
  if (!file) return;
  const ok = await busy(null, async () => {
    const { blob, ext } = await prepareUpload(file);
    const path = await api.uploadReceipt(blob, ext);
    await api.setReceipt(b.id, path);
    return true;
  });
  if (!ok) return;
  await api.reload();
  toast("Beleg gespeichert");
  route();
}

function pickFile(accept, capture) {
  return new Promise((resolve) => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = accept;
    if (capture) i.capture = capture;
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
}

async function prepareUpload(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > 10 * 1024 * 1024) throw new Error("Die PDF-Datei ist zu groß (maximal 10 MB).");
    return { blob: file, ext: "pdf" };
  }
  const img = await ocr.loadImage(file);
  return { blob: await ocr.compress(img), ext: "jpg" };
}

/* ---------------- Buchung erfassen ---------------- */

export function renderForm(el, { params }) {
  if (!ctx.canWrite) { location.hash = "#/kasse"; return; }
  const active = data.accounts.filter((a) => a.active);
  if (!active.length) {
    el.innerHTML = `<div class="card"><h2>Noch kein Konto</h2><p>Lege zuerst eine Barkasse oder ein Bankkonto an.</p><a class="btn btn-primary" href="#/konten">Konten</a></div>`;
    return;
  }
  const last = Number(store.get(LAST_ACCOUNT));
  const pre = {
    kind: params.get("art") || "ausgabe",
    area: params.get("bereich") || "verein",
    date: today(),
    amount: "",
    account: active.some((a) => a.id === last) ? last : active[0].id,
    to: "",
    purpose: "",
    category: "",
    member: "",
  };
  // Getränkepauschale eines Mitglieds kassieren
  const mId = Number(params.get("mitglied"));
  const m = mId ? memberById(mId) : null;
  if (m) {
    const y = Number(params.get("pauschale")) || new Date().getFullYear();
    Object.assign(pre, {
      kind: "einnahme", area: "getraenke", category: "Getränkepauschale", member: m.id,
      amount: moneyInput(m.drinks_fee_cents || data.settings.drinks_fee_cents || null),
      purpose: `Getränkepauschale ${y} – ${memberName(m)}`,
    });
    const bar = active.find((a) => a.kind === "bar");
    if (bar && !active.some((a) => a.id === last && a.kind === "bar")) pre.account = bar.id;
  }

  const seg = (name, options, cur) => `<div class="seg" role="radiogroup">${Object.entries(options).map(([k, v]) =>
    `<label class="${k === cur ? "on" : ""}"><input type="radio" name="${name}" value="${k}" ${k === cur ? "checked" : ""}>${esc(v)}</label>`).join("")}</div>`;
  const accOpts = (cur, skip) => active.filter((a) => a.id !== skip).map((a) => `<option value="${a.id}" ${a.id === cur ? "selected" : ""}>${esc(a.name)}</option>`).join("");
  const members = data.members.filter((x) => !x.exit_date || x.id === pre.member);

  el.innerHTML = `
    <div class="page-head"><h1>Neue Buchung</h1>
      <p class="muted">Die Belegnummer wird beim Speichern vergeben (voraussichtlich <strong>${nextNumber(yearOf(pre.date))}</strong>).</p></div>
    <form class="booking-form" id="bf" autocomplete="off">
      <div class="card photo-card ${params.get("foto") ? "highlight" : ""}">
        <div class="card-head"><h2>${icon("camera")} Beleg</h2><span class="muted small">Foto vom Kassenbon oder der Rechnung</span></div>
        <div class="photo-actions">
          <label class="btn btn-primary file-btn">${icon("camera")} Foto aufnehmen<input type="file" accept="image/*" capture="environment" id="cam" hidden></label>
          <label class="btn btn-secondary file-btn">${icon("file")} Datei oder PDF wählen<input type="file" accept="image/*,application/pdf" id="pick" hidden></label>
        </div>
        <div id="photo" class="photo" hidden></div>
        <div id="ocr-status" hidden><div class="progress-line"><span style="width:0%"></span></div><p class="muted small" id="ocr-text"></p></div>
        <div id="ocr-result" hidden></div>
      </div>

      <div class="card form">
        <div class="field-row">
          <div><span class="lbl">Art</span>${seg("kind", KINDS, pre.kind)}</div>
          <div><span class="lbl">Bereich</span>${seg("area", AREAS, pre.area)}</div>
        </div>
        <div class="field-row">
          <label>Datum<input type="date" name="date" required value="${pre.date}" max="${new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10)}"></label>
          <label>Betrag in €<input name="amount" inputmode="decimal" required placeholder="0,00" value="${esc(pre.amount)}"></label>
        </div>
        <div class="field-row">
          <label><span id="acc-label">${pre.kind === "umbuchung" ? "Von Konto" : "Konto"}</span><select name="account">${accOpts(pre.account)}</select></label>
          <label id="to-wrap" ${pre.kind === "umbuchung" ? "" : "hidden"}>Auf Konto<select name="to">${accOpts(null, pre.account)}</select></label>
        </div>
        <label>Verwendungszweck<input name="purpose" required maxlength="300" value="${esc(pre.purpose)}" placeholder="z. B. Getränke Janssen – Rechnung Nr. 4711"></label>
        <div class="field-row">
          <label>Kategorie<input name="category" list="cats" maxlength="60" value="${esc(pre.category)}" placeholder="optional"><datalist id="cats"></datalist></label>
          <label>Mitglied (optional)<select name="member"><option value="">–</option>${members.map((x) => `<option value="${x.id}" ${x.id === pre.member ? "selected" : ""}>${esc(x.last_name)}, ${esc(x.first_name)}</option>`).join("")}</select></label>
        </div>
        <label class="check" id="verify-wrap" hidden><input type="checkbox" name="verified"> <span>Ich habe alle Angaben mit dem Beleg verglichen.</span></label>
        <p class="form-error" hidden></p>
        <div class="form-actions">
          <button class="btn btn-primary btn-lg" id="save">${icon("check")} Buchung speichern</button>
          <a class="btn btn-ghost" href="#/kasse">Abbrechen</a>
        </div>
      </div>
    </form>`;

  const f = el.querySelector("#bf");
  const err = f.querySelector(".form-error");
  let file = null;
  let ocrUsed = false;

  const updateCats = () => {
    f.querySelector("#cats").innerHTML = CATEGORIES[f.area.value].map((c) => `<option value="${esc(c)}">`).join("");
  };
  const updateKind = () => {
    const t = f.kind.value === "umbuchung";
    el.querySelector("#to-wrap").hidden = !t;
    el.querySelector("#acc-label").textContent = t ? "Von Konto" : "Konto";
    if (t) f.to.innerHTML = accOpts(Number(f.to.value) || null, Number(f.account.value));
  };
  f.querySelectorAll(".seg input").forEach((r) => r.addEventListener("change", () => {
    r.closest(".seg").querySelectorAll("label").forEach((l) => l.classList.toggle("on", l.contains(r)));
    updateCats();
    updateKind();
  }));
  f.account.onchange = updateKind;
  f.date.onchange = () => {
    el.querySelector(".page-head strong").textContent = nextNumber(yearOf(f.date.value || today()));
  };
  f.addEventListener("input", (e) => {
    f.classList.add("dirty");
    e.target.classList?.remove("from-ocr");
  });
  updateCats();

  // Foto / Datei
  const onFile = async (input) => {
    const fl = input.files[0];
    input.value = "";
    if (!fl) return;
    file = fl;
    f.classList.add("dirty");
    const photo = el.querySelector("#photo");
    const result = el.querySelector("#ocr-result");
    result.hidden = true;
    if (fl.type === "application/pdf" || /\.pdf$/i.test(fl.name)) {
      photo.hidden = false;
      photo.innerHTML = `<div class="pdf-chip">${icon("file")} ${esc(fl.name)}</div><button type="button" class="btn btn-ghost btn-sm" id="rm">${icon("x")} Entfernen</button>`;
      result.hidden = false;
      result.innerHTML = `<p class="muted small">Bei PDF-Dateien werden die Angaben nicht automatisch erkannt. Bitte die Felder unten ausfüllen.</p>`;
    } else {
      let img;
      try { img = await ocr.loadImage(fl); } catch (e) { toast(e.message, "error"); file = null; return; }
      photo.hidden = false;
      photo.innerHTML = `<img src="${img.src}" alt="Beleg"><button type="button" class="btn btn-ghost btn-sm" id="rm">${icon("x")} Entfernen</button>`;
      await runOcr(img);
    }
    photo.querySelector("#rm").onclick = () => {
      file = null; ocrUsed = false;
      photo.hidden = true; photo.innerHTML = "";
      result.hidden = true;
      el.querySelector("#verify-wrap").hidden = true;
    };
  };
  el.querySelector("#cam").onchange = (e) => onFile(e.target);
  el.querySelector("#pick").onchange = (e) => onFile(e.target);

  const runOcr = async (img) => {
    const st = el.querySelector("#ocr-status");
    const bar = st.querySelector(".progress-line span");
    const txt = st.querySelector("#ocr-text");
    const result = el.querySelector("#ocr-result");
    st.hidden = false;
    let text;
    try {
      text = await ocr.recognize(img, (p, msg) => { bar.style.width = `${Math.round(p * 100)}%`; txt.textContent = msg; });
    } catch (e) {
      st.hidden = true;
      result.hidden = false;
      result.innerHTML = `<p class="form-error">Texterkennung fehlgeschlagen: ${esc(e.message)}. Bitte die Felder von Hand ausfüllen – das Foto wird trotzdem gespeichert.</p>`;
      return;
    }
    st.hidden = true;
    const r = ocr.parseReceipt(text);
    ocrUsed = true;
    const set = (name, value) => {
      if (value == null || value === "") return false;
      f[name].value = value;
      f[name].classList.add("from-ocr");
      return true;
    };
    const found = [];
    if (set("amount", r.amount_cents != null ? moneyInput(r.amount_cents) : null)) found.push(`Betrag ${money(r.amount_cents)}${r.amountSure ? "" : " (geschätzt)"}`);
    if (set("date", r.date)) { found.push(`Datum ${dateDE(r.date)}`); f.date.dispatchEvent(new Event("change")); }
    if (!f.purpose.value.trim() || f.purpose.classList.contains("from-ocr")) set("purpose", r.purpose);
    if (r.area) f.querySelector(`input[name=area][value=${r.area}]`).click();
    const cat = f.area.value === "getraenke" ? "Getränkeeinkauf" : r.category;
    if (cat && !f.category.value) set("category", cat);
    if (r.vendor) found.push(`Händler ${r.vendor}`);
    if (r.invoice) found.push(`Nr. ${r.invoice}`);
    result.hidden = false;
    result.innerHTML = `
      <div class="ocr-box">
        <strong>${found.length ? "Erkannt:" : "Leider nichts sicher erkannt."}</strong> ${esc(found.join(" · "))}
        <p class="small">Gelb markierte Felder wurden aus dem Foto übernommen. <strong>Bitte alles mit dem Beleg vergleichen</strong> und bei Bedarf korrigieren.</p>
        <details><summary class="small">Erkannter Text</summary><pre>${esc(text.trim() || "(kein Text erkannt)")}</pre></details>
      </div>`;
    el.querySelector("#verify-wrap").hidden = false;
    f.verified.checked = false;
  };

  f.onsubmit = async (e) => {
    e.preventDefault();
    err.hidden = true;
    const amount = parseMoney(f.amount.value);
    const fail = (msg, field) => { err.textContent = msg; err.hidden = false; field?.focus(); };
    if (amount == null || amount <= 0) return fail("Bitte einen gültigen Betrag eingeben, z. B. 12,50.", f.amount);
    if (f.kind.value === "umbuchung" && (!f.to.value || f.to.value === f.account.value)) return fail("Bitte ein anderes Zielkonto wählen.", f.to);
    if (ocrUsed && !f.verified.checked) return fail("Bitte bestätige, dass du die Angaben mit dem Beleg verglichen hast.", f.verified);
    const btn = el.querySelector("#save");
    const res = await busy(btn, async () => {
      let receipt_path = null;
      if (file) {
        btn.textContent = "Beleg wird hochgeladen …";
        const { blob, ext } = await prepareUpload(file);
        receipt_path = await api.uploadReceipt(blob, ext);
      }
      btn.textContent = "Wird gespeichert …";
      return api.addBooking({
        kind: f.kind.value, area: f.area.value, date: f.date.value, amount_cents: amount,
        account_id: Number(f.account.value), to_account_id: f.kind.value === "umbuchung" ? Number(f.to.value) : null,
        purpose: f.purpose.value.trim(), category: f.category.value.trim(),
        member_id: f.member.value ? Number(f.member.value) : null, receipt_path,
      });
    });
    if (!res) return;
    store.set(LAST_ACCOUNT, f.account.value);
    f.classList.remove("dirty");
    await api.reload().catch(() => {});
    el.innerHTML = `<div class="onboarding"><div class="card onboarding-card done-card">
      ${icon("check", "icon icon-xl")}
      <h1>Gebucht</h1>
      <p>Belegnummer</p>
      <div class="big-number">${esc(res.number)}</div>
      <p class="muted small">${file ? "Das Foto ist gespeichert. " : ""}Tipp: Die Nummer auch auf den Papierbeleg schreiben und ihn abheften.</p>
      <div class="center-row">
        <a class="btn btn-primary" href="#/buchung?foto=1" id="again">${icon("camera")} Nächster Beleg</a>
        <a class="btn btn-secondary" href="#/kasse">Zum Kassenbuch</a>
      </div></div></div>`;
    el.querySelector("#again").onclick = (ev) => { ev.preventDefault(); history.replaceState(null, "", "#/buchung?foto=1"); route(); };
  };
}
