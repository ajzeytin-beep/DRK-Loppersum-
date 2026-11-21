// Jahresabschluss: Bestände je Konto und Bereich, Einnahmen/Ausgaben nach Kategorien, alle Buchungen – zum Drucken
import { CONFIG } from "../../js/config.js";
import { icon } from "../../js/icons.js";
import { data } from "./api.js";
import { esc, money, moneyPlain, dateDE, yearOf, years, balance, effect, totals, accountName, memberName, memberById, AREAS, KINDS, downloadCsv } from "./util.js";

export function render(el, { params }) {
  const year = Number(params.get("jahr")) || new Date().getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const yb = data.bookings.filter((b) => yearOf(b.booking_date) === year).sort((a, b) => (a.booking_date < b.booking_date ? -1 : a.booking_date > b.booking_date ? 1 : a.id - b.id));
  const accs = data.accounts.filter((a) => a.active || yb.some((b) => b.account_id === a.id || b.to_account_id === a.id) || balance({ accountId: a.id, until: to }) !== 0);

  const areaBlock = (area) => {
    const ab = yb.filter((b) => b.area === area);
    const lines = accs.map((a) => {
      const mine = ab.filter((b) => b.account_id === a.id || b.to_account_id === a.id);
      const inc = mine.filter((b) => b.kind === "einnahme").reduce((s, b) => s + b.amount_cents, 0);
      const exp = mine.filter((b) => b.kind === "ausgabe").reduce((s, b) => s + b.amount_cents, 0);
      const tr = mine.filter((b) => b.kind === "umbuchung").reduce((s, b) => s + effect(b, a.id), 0);
      const start = balance({ accountId: a.id, area, before: from });
      return { a, start, inc, exp, tr, end: start + inc - exp + tr };
    });
    const sum = lines.reduce((s, l) => ({ start: s.start + l.start, inc: s.inc + l.inc, exp: s.exp + l.exp, tr: s.tr + l.tr, end: s.end + l.end }), { start: 0, inc: 0, exp: 0, tr: 0, end: 0 });
    const cats = (kind) => {
      const m = new Map();
      for (const b of ab.filter((x) => x.kind === kind)) m.set(b.category || "Ohne Kategorie", (m.get(b.category || "Ohne Kategorie") || 0) + b.amount_cents);
      return [...m].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
    };
    const catTable = (title, list, cls) => `<div><h3>${title}</h3>${list.length ? `<table class="report"><tbody>${list.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num ${cls}">${money(v)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted small">keine</p>`}</div>`;
    return `<section class="card report-card">
      <h2>${AREAS[area]}</h2>
      <div class="table-wrap"><table class="report">
        <thead><tr><th>Konto</th><th class="num">Bestand 01.01.</th><th class="num">Einnahmen</th><th class="num">Ausgaben</th><th class="num">Umbuchungen</th><th class="num">Bestand 31.12.</th></tr></thead>
        <tbody>${lines.map((l) => `<tr><td>${esc(l.a.name)}</td><td class="num">${money(l.start)}</td><td class="num good">${money(l.inc)}</td><td class="num bad">${money(l.exp)}</td><td class="num">${money(l.tr)}</td><td class="num"><strong>${money(l.end)}</strong></td></tr>`).join("")}</tbody>
        <tfoot><tr><th>Summe</th><th class="num">${money(sum.start)}</th><th class="num">${money(sum.inc)}</th><th class="num">${money(sum.exp)}</th><th class="num">${money(sum.tr)}</th><th class="num">${money(sum.end)}</th></tr></tfoot>
      </table></div>
      <p class="result-line">Ergebnis ${year}: <strong class="${sum.inc - sum.exp < 0 ? "bad" : "good"}">${money(sum.inc - sum.exp)}</strong> <span class="muted small">(Einnahmen minus Ausgaben)</span></p>
      <div class="grid-2 cats">${catTable("Einnahmen nach Kategorie", cats("einnahme"), "good")}${catTable("Ausgaben nach Kategorie", cats("ausgabe"), "bad")}</div>
    </section>`;
  };

  const all = totals(yb);
  const nums = data.bookings.filter((b) => b.year === year).sort((a, b) => a.seq - b.seq);
  const open = nums.length ? `Nr. ${nums[0].number} bis ${nums[nums.length - 1].number}` : "–";
  const missing = yb.filter((b) => !b.receipt_path && !b.storno_of && b.kind !== "umbuchung").length;

  el.innerHTML = `
    <div class="page-head head-row no-print">
      <div><h1>Jahresabschluss</h1><p class="muted">Zum Ausdrucken oder als PDF speichern (im Druckdialog „Als PDF sichern“).</p></div>
      <div class="head-actions">
        <label class="inline">Jahr <select id="year">${years().map((y) => `<option ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select></label>
        <button class="btn btn-primary" id="print">${icon("printer")} Drucken / PDF</button>
        <button class="btn btn-ghost" id="csv">${icon("download")} CSV</button>
      </div>
    </div>
    <div class="print-head">
      <img src="../assets/logo-ov.png" alt="" onerror="this.remove()">
      <div><h1>Kassenbericht ${year}</h1><p>${esc(CONFIG.orgName)} · Zeitraum 01.01.${year} – 31.12.${year} · erstellt am ${dateDE(new Date().toISOString().slice(0, 10))}</p></div>
    </div>
    <div class="kpis kpis-3">
      <div class="kpi">${icon("download")}<div><span>Einnahmen gesamt</span><strong class="good">${money(all.inc)}</strong></div></div>
      <div class="kpi">${icon("upload")}<div><span>Ausgaben gesamt</span><strong class="bad">${money(all.exp)}</strong></div></div>
      <div class="kpi">${icon("check")}<div><span>Ergebnis</span><strong>${money(all.net)}</strong></div></div>
      <div class="kpi">${icon("file")}<div><span>Buchungen</span><strong>${yb.length}</strong><span>${esc(open)}${missing ? ` · ${missing} ohne Beleg` : ""}</span></div></div>
    </div>
    ${areaBlock("getraenke")}
    ${areaBlock("verein")}
    <section class="card report-card">
      <h2>Alle Buchungen ${year}</h2>
      ${yb.length ? `<div class="table-wrap"><table class="report small-table">
        <thead><tr><th>Nr.</th><th>Datum</th><th>Bereich</th><th>Konto</th><th>Verwendungszweck</th><th class="num">Einnahme</th><th class="num">Ausgabe</th></tr></thead>
        <tbody>${yb.map((b) => `<tr class="${b.cancelled_by ? "is-cancelled" : b.storno_of ? "is-storno" : ""}"><td>${esc(b.number)}${b.receipt_path ? "" : b.kind === "umbuchung" || b.storno_of ? "" : " *"}</td><td>${dateDE(b.booking_date)}</td><td>${AREAS[b.area]}</td>
          <td>${esc(b.to_account_id ? `${accountName(b.account_id)} → ${accountName(b.to_account_id)}` : accountName(b.account_id))}</td>
          <td>${esc(b.purpose)}${b.category ? ` <span class="muted">(${esc(b.category)})</span>` : ""}${b.cancelled_by ? " [storniert]" : ""}</td>
          <td class="num">${b.kind === "einnahme" ? money(b.amount_cents) : b.kind === "umbuchung" ? `↔ ${money(b.amount_cents)}` : ""}</td>
          <td class="num">${b.kind === "ausgabe" ? money(b.amount_cents) : ""}</td></tr>`).join("")}</tbody>
      </table></div>${missing ? `<p class="muted small">* ohne digitalen Beleg</p>` : ""}` : `<p class="muted">Keine Buchungen in diesem Jahr.</p>`}
    </section>
    <section class="signatures">
      <div><span></span>Ort, Datum</div><div><span></span>Kassenwart</div><div><span></span>Kassenprüfer</div><div><span></span>Kassenprüfer</div>
    </section>`;

  el.querySelector("#year").onchange = (e) => { location.hash = `#/abschluss?jahr=${e.target.value}`; };
  el.querySelector("#print").onclick = () => window.print();
  el.querySelector("#csv").onclick = () => downloadCsv(`Kassenbericht-${year}.csv`, [
    ["Belegnummer", "Datum", "Bereich", "Art", "Konto", "Zielkonto", "Verwendungszweck", "Kategorie", "Mitglied", "Einnahme", "Ausgabe", "Storno"],
    ...yb.map((b) => [
      b.number, dateDE(b.booking_date), AREAS[b.area], KINDS[b.kind], accountName(b.account_id), b.to_account_id ? accountName(b.to_account_id) : "",
      b.purpose, b.category || "", memberName(memberById(b.member_id)),
      b.kind === "einnahme" ? moneyPlain(b.amount_cents) : "", b.kind === "ausgabe" ? moneyPlain(b.amount_cents) : "",
      b.cancelled_by ? "storniert" : b.storno_of ? "Storno" : "",
    ]),
  ]);
}
