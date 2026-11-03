// Ausbilder-Bereich: Lernerfolg der Teilnehmenden und Schwächenanalyse.
import { DATA, topicLabel, findQuestion } from "./data.js";
import { esc } from "./quiz.js";
import * as sync from "./sync.js";
import { icon } from "./icons.js";

const pct = (r) => (r == null ? "–" : `${Math.round(r * 100)} %`);
const rateClass = (r) => (r == null ? "none" : r >= 0.8 ? "good" : r >= 0.6 ? "mid" : "bad");

export function renderInstructor(view) {
  view.innerHTML = `
    <div class="page-head">
      <h1>Ausbilder-Bereich</h1>
      <p class="muted">Lernfortschritt der Teilnehmenden auf einen Blick – und wo ihr im Lehrgang nochmal ansetzen solltet.</p>
    </div>
    <div class="grid-2">
      ${sync.backendEnabled()
        ? `<form class="card form" id="online-form">
            <h2>${icon("cloud")} Online-Kurs öffnen</h2>
            <label>Kurscode<input name="code" required autocomplete="off" autocapitalize="characters"></label>
            <label>Ausbilder-PIN<input name="pin" type="password" required autocomplete="current-password"></label>
            <p class="form-error" hidden></p>
            <button class="btn btn-primary">Auswertung laden</button>
          </form>`
        : `<section class="card">
            <h2>${icon("cloud")} Online-Kurs</h2>
            <p class="muted">Die automatische Online-Auswertung ist noch nicht eingerichtet (siehe README, Abschnitt „Ausbilder-Auswertung einrichten“). Bis dahin funktioniert der Import der Exportdateien.</p>
          </section>`}
      <section class="card">
        <h2>${icon("upload")} Exportdateien importieren</h2>
        <p class="muted">Teilnehmende exportieren ihren Lernstand unter „Profil“ und schicken dir die Datei. Du kannst mehrere Dateien auf einmal auswählen.</p>
        <label class="btn btn-secondary file-btn">Dateien auswählen<input type="file" id="import" accept=".json,application/json" multiple hidden></label>
        <p class="form-error" id="import-error" hidden></p>
      </section>
    </div>
    <div id="stats"></div>`;

  const statsEl = view.querySelector("#stats");

  view.querySelector("#online-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = f.querySelector(".form-error");
    const btn = f.querySelector("button");
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Lade …";
    try {
      const stats = await sync.courseStats(f.code.value.trim().toUpperCase(), f.pin.value);
      renderStats(statsEl, stats);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Auswertung laden";
    }
  });

  view.querySelector("#import").addEventListener("change", async (e) => {
    const err = view.querySelector("#import-error");
    err.hidden = true;
    try {
      const files = await Promise.all([...e.target.files].map((f) => f.text().then((t) => ({ name: f.name, data: JSON.parse(t) }))));
      const stats = statsFromExports(files);
      renderStats(statsEl, stats);
    } catch (ex) {
      err.textContent = `Import fehlgeschlagen: ${ex.message}`;
      err.hidden = false;
    }
  });
}

function statsFromExports(files) {
  const learners = new Map();
  for (const { name, data } of files) {
    if (data?.format !== "sani-trainer-export") throw new Error(`${name} ist keine Sani-Trainer-Exportdatei`);
    const id = data.learner?.id || name;
    const prev = learners.get(id);
    if (!prev || prev.exportedAt < data.exportedAt) learners.set(id, data);
  }
  const questions = {};
  const out = [];
  const codes = new Set();
  for (const [id, d] of learners) {
    if (d.learner?.courseCode) codes.add(d.learner.courseCode);
    const topics = {};
    let last = null;
    for (const h of d.history || []) {
      const t = (topics[h.topic] ||= { n: 0, c: 0 });
      t.n++;
      if (h.correct) t.c++;
      const q = (questions[h.question_id] ||= { question_id: h.question_id, n: 0, c: 0 });
      q.n++;
      if (h.correct) q.c++;
      if (!last || h.at > last) last = h.at;
    }
    out.push({ id, name: d.learner?.name || "Unbekannt", last_seen: last || d.exportedAt, topics, exams: d.exams || [] });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return {
    course: { code: [...codes].join(", ") || "–", name: "Import aus Exportdateien" },
    learners: out,
    questions: Object.values(questions),
  };
}

function renderStats(el, stats) {
  const learners = (stats.learners || []).map((l) => {
    const n = Object.values(l.topics || {}).reduce((s, t) => s + t.n, 0);
    const c = Object.values(l.topics || {}).reduce((s, t) => s + t.c, 0);
    const exams = l.exams || [];
    const best = exams.reduce((m, e) => Math.max(m, e.score / e.total), -1);
    return { ...l, n, c, rate: n ? c / n : null, best: best < 0 ? null : best, passed: exams.some((e) => e.passed) };
  });

  if (!learners.length) {
    el.innerHTML = `<section class="card empty"><h2>Noch keine Daten</h2><p class="muted">Im Kurs ${esc(stats.course?.code)} hat noch niemand Fragen beantwortet.</p></section>`;
    return;
  }

  const courseTopics = {};
  for (const l of learners) {
    for (const [t, v] of Object.entries(l.topics || {})) {
      const x = (courseTopics[t] ||= { n: 0, c: 0 });
      x.n += v.n;
      x.c += v.c;
    }
  }
  const topicRows = DATA.topics
    .filter((t) => courseTopics[t.id])
    .map((t) => ({ ...t, rate: courseTopics[t.id].c / courseTopics[t.id].n, n: courseTopics[t.id].n }))
    .sort((a, b) => a.rate - b.rate);

  const totalN = learners.reduce((s, l) => s + l.n, 0);
  const totalC = learners.reduce((s, l) => s + l.c, 0);
  const hardest = (stats.questions || [])
    .filter((q) => q.n >= 3)
    .map((q) => ({ ...q, rate: q.c / q.n, q: findQuestion(q.question_id) }))
    .filter((q) => q.q)
    .sort((a, b) => a.rate - b.rate || b.n - a.n)
    .slice(0, 10);

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("de-DE") : "–");

  el.innerHTML = `
    <div class="page-head stats-head">
      <h2>Kurs ${esc(stats.course?.code)} <span class="muted">· ${esc(stats.course?.name || "")}</span></h2>
      <button class="btn btn-secondary btn-sm" id="csv">${icon("download")} CSV exportieren</button>
    </div>
    <section class="kpis">
      <div class="kpi">${icon("users")}<div><span>Teilnehmende</span><strong>${learners.length}</strong></div></div>
      <div class="kpi">${icon("target")}<div><span>Ø Trefferquote</span><strong>${pct(totalN ? totalC / totalN : null)}</strong></div></div>
      <div class="kpi">${icon("list")}<div><span>Antworten gesamt</span><strong>${totalN}</strong></div></div>
      <div class="kpi">${icon("award")}<div><span>Prüfung bestanden</span><strong>${learners.filter((l) => l.passed).length} / ${learners.length}</strong></div></div>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Schwächste Themen im Kurs</h2><span class="small muted">→ im Unterricht wiederholen</span></div>
        <ul class="topic-list">${topicRows.slice(0, 8).map((t) => `
          <li><div class="topic-row"><span>${esc(t.label)}</span><strong class="${rateClass(t.rate)}">${pct(t.rate)}</strong></div>
          <div class="bar ${rateClass(t.rate)}"><span style="width:${Math.round(t.rate * 100)}%"></span></div></li>`).join("")}</ul>
      </section>
      <section class="card">
        <div class="card-head"><h2>Häufigste Fehler</h2><span class="small muted">min. 3 Antworten</span></div>
        ${hardest.length
          ? `<ol class="hard-list">${hardest.map((h) => `
              <li><div><strong class="${rateClass(h.rate)}">${pct(h.rate)}</strong> <span class="small muted">richtig bei ${h.n} Antworten · ${esc(topicLabel(h.q.topic))}</span></div>
              <div>${h.q.caseTitle ? `<em>${esc(h.q.caseTitle)}:</em> ` : ""}${esc(h.q.question)}</div></li>`).join("")}</ol>`
          : '<p class="muted">Noch nicht genug Daten.</p>'}
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2>Teilnehmende × Themen</h2>
        <div class="legend"><span class="cell good">≥ 80 %</span><span class="cell mid">60–79 %</span><span class="cell bad">&lt; 60 %</span><span class="cell none">keine Daten</span></div>
      </div>
      <div class="table-wrap">
        <table class="heatmap">
          <thead><tr><th>Name</th><th>Gesamt</th><th>Prüfung</th>${DATA.topics.map((t) => `<th title="${esc(t.label)}"><span>${esc(t.short)}</span></th>`).join("")}<th>Aktiv</th></tr></thead>
          <tbody>${learners.map((l) => `
            <tr>
              <th>${esc(l.name)}</th>
              <td class="cell ${rateClass(l.rate)}">${pct(l.rate)}<small>${l.n}</small></td>
              <td class="cell ${l.best == null ? "none" : l.passed ? "good" : "bad"}">${pct(l.best)}</td>
              ${DATA.topics.map((t) => {
                const v = l.topics?.[t.id];
                const r = v ? v.c / v.n : null;
                return `<td class="cell ${rateClass(r)}" title="${esc(t.label)}: ${v ? `${v.c}/${v.n}` : "keine Daten"}">${v ? Math.round(r * 100) : "·"}</td>`;
              }).join("")}
              <td class="small muted">${fmtDate(l.last_seen)}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
    </section>`;

  el.querySelector("#csv").addEventListener("click", () => {
    const head = ["Name", "Antworten", "Trefferquote", "Beste Prüfung", "Bestanden", ...DATA.topics.map((t) => t.label), "Zuletzt aktiv"];
    const rows = learners.map((l) => [
      l.name, l.n, l.rate == null ? "" : Math.round(l.rate * 100), l.best == null ? "" : Math.round(l.best * 100), l.passed ? "ja" : "nein",
      ...DATA.topics.map((t) => { const v = l.topics?.[t.id]; return v ? Math.round((v.c / v.n) * 100) : ""; }),
      fmtDate(l.last_seen),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `sani-trainer_kurs_${stats.course?.code || "auswertung"}.csv`;
    a.click();
  });
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

