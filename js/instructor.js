// Ausbilder-Bereich: Anmeldung mit Kurscode + Kurs-PIN (Prüfung auf dem Server)
// und automatische Übersicht über den Lernfortschritt aller Teilnehmenden.
import { CONFIG } from "./config.js";
import { DATA, topicLabel, findQuestion } from "./data.js";
import { esc } from "./quiz.js";
import * as sync from "./sync.js";
import * as store from "./store.js";
import { icon } from "./icons.js";

const pct = (r) => (r == null ? "–" : `${Math.round(r * 100)} %`);
const rateClass = (r) => (r == null ? "none" : r >= 0.8 ? "good" : r >= 0.6 ? "mid" : "bad");

let lastStats = null;
let refreshTimer = null;

// Alte Ausbilder-Sitzungen (Kurscode + PIN) aus früheren Versionen entfernen
try { sessionStorage.removeItem("sani-trainer-admin-session"); } catch { /* ignorieren */ }

/* ---------------- Einladen ---------------- */

const baseUrl = () => CONFIG.appUrl || `${location.origin}${location.pathname}`;
const inviteUrl = (code) => `${baseUrl()}teilnehmer/?kurs=${encodeURIComponent(code)}`;
const adminUrl = () => `${baseUrl()}ausbilder/`;

function inviteText(code) {
  return `Moin! Für unseren Sanitätslehrgang beim ${CONFIG.orgName} gibt es eine Lern-App mit Fragen, Fallbeispielen und Prüfungssimulation:

${inviteUrl(code)}

Einfach öffnen und ein Konto mit Name, E-Mail und Passwort anlegen – der Kurscode ${code} ist über den Link schon ausgefüllt. Ich gebe dein Konto dann frei.
Tipp: Über „Zum Home-Bildschirm“ (iPhone) bzw. „App installieren“ (Android) wird sie zur App und funktioniert auch offline.`;
}

// QR-Code als Bild (mit Logo und Beschriftung) – im Browser erzeugt, damit der Kurscode enthalten ist
async function qrCanvas(url, code) {
  const qr = window.qrcode(0, "H");
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const cell = 12;
  const margin = 2 * cell;
  const W = n * cell + margin * 2;
  const H = W + 150;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#000";
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect(margin + k * cell, margin + r * cell, cell, cell);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "assets/logo-ov.png"; });
    const s = Math.round(W / 4.2);
    g.fillStyle = "#fff";
    g.beginPath(); g.arc(W / 2, W / 2, s / 2 + 8, 0, Math.PI * 2); g.fill();
    g.drawImage(img, W / 2 - s / 2, W / 2 - s / 2, s, s);
  } catch { /* ohne Logo */ }
  g.textAlign = "center";
  g.fillStyle = "#e30613";
  g.font = "bold 44px system-ui, sans-serif";
  g.fillText("Sani-Trainer", W / 2, W + 40);
  g.fillStyle = "#1e1e1e";
  g.font = "bold 28px system-ui, sans-serif";
  g.fillText(`${CONFIG.orgName} · Kurs ${code}`, W / 2, W + 84, W - 30);
  g.fillStyle = "#5a5a5a";
  g.font = "18px system-ui, sans-serif";
  g.fillText(url, W / 2, W + 120, W - 30);
  return c;
}

function inviteCard(code) {
  return `
    <section class="card invite">
      <div class="invite-qr"><canvas id="invite-qr" aria-label="QR-Code zur App mit Kurscode ${esc(code)}"></canvas></div>
      <div class="invite-body">
        <h2>${icon("users")} Teilnehmende einladen</h2>
        <p class="muted small">Über diesen Link oder QR-Code registrieren sich die Teilnehmenden – der Kurscode <strong>${esc(code)}</strong> ist schon eingetragen. Neue Konten erscheinen oben unter „Neue Anmeldungen“ zur Freigabe.</p>
        <label>Einladungstext
          <textarea id="invite-text" rows="7">${esc(inviteText(code))}</textarea>
        </label>
        <div class="invite-actions">
          <button class="btn btn-primary" id="invite-share">${icon("upload")} Teilen</button>
          <button class="btn btn-secondary" id="invite-copy">Text kopieren</button>
          <button class="btn btn-secondary" id="invite-dl">${icon("download")} QR-Code</button>
        </div>
        <p class="small invite-msg" hidden></p>
        <div class="admin-link">
          <span class="small muted">Anmeldung für Ausbilder (auch zum Weitergeben):</span>
          <code>${esc(adminUrl())}</code>
          <button class="btn btn-ghost btn-sm" id="admin-link-copy">Kopieren</button>
        </div>
      </div>
    </section>`;
}

async function bindInvite(root, code) {
  const textEl = root.querySelector("#invite-text");
  const msg = root.querySelector(".invite-msg");
  const say = (t) => { msg.textContent = t; msg.hidden = false; };
  let canvas = null;
  if (window.qrcode) {
    canvas = await qrCanvas(inviteUrl(code), code);
    canvas.id = "invite-qr";
    root.querySelector("#invite-qr")?.replaceWith(canvas);
  }
  const pngBlob = () => new Promise((res) => (canvas ? canvas.toBlob(res, "image/png") : res(null)));
  const fileName = `Sani-Trainer-QR-${code}.png`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(textEl.value); say("Text kopiert ✓ – jetzt z. B. in WhatsApp einfügen."); }
    catch { textEl.select(); say("Bitte den markierten Text kopieren (Strg+C bzw. lange tippen)."); }
  };
  root.querySelector("#invite-copy").addEventListener("click", copy);
  root.querySelector("#admin-link-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(adminUrl()); say("Ausbilder-Link kopiert ✓ – neue Ausbilder registrieren sich und werden einmalig in Supabase als Ausbilder eingetragen (siehe README)."); }
    catch { say(adminUrl()); }
  });
  root.querySelector("#invite-dl").addEventListener("click", async () => {
    const blob = await pngBlob();
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  root.querySelector("#invite-share").addEventListener("click", async () => {
    if (!navigator.share) { await copy(); return; }
    const data = { title: "Sani-Trainer", text: textEl.value };
    const blob = await pngBlob();
    if (blob) {
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) data.files = [file];
    }
    try { await navigator.share(data); }
    catch (e) { if (e.name !== "AbortError") await copy(); }
  });
}

/* ---------------- Hauptansicht ---------------- */

export function renderInstructor(view) {
  clearInterval(refreshTimer);
  const me = store.getState().profile;
  const code = me?.courseCode;

  view.innerHTML = `
    <div class="page-head stats-head">
      <div>
        <span class="eyebrow">Ausbilder-Bereich</span>
        <h1 id="course-title">${esc(me?.courseName || `Kurs ${code || ""}`)}</h1>
        <p class="muted small" id="refresh-info">Lade Daten …</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-secondary btn-sm" id="refresh">${icon("repeat")} Aktualisieren</button>
      </div>
    </div>
    <div id="pending"></div>
    <div id="stats">${lastStats ? "" : '<div class="loader" aria-label="Lädt"></div>'}</div>
    ${code ? inviteCard(code) : '<section class="card"><p class="form-error">Deinem Ausbilder-Konto ist noch kein Kurs zugeordnet (siehe README: „Ausbilder eintragen“).</p></section>'}`;

  const statsEl = view.querySelector("#stats");
  const pendingEl = view.querySelector("#pending");
  const info = view.querySelector("#refresh-info");
  if (code) bindInvite(view, code);

  const load = async () => {
    const btn = view.querySelector("#refresh");
    if (!btn || !document.body.contains(btn)) { clearInterval(refreshTimer); return; } // Seite wurde verlassen
    btn.disabled = true;
    try {
      const [stats, pending] = await Promise.all([sync.courseStats(), sync.pendingRegistrations()]);
      lastStats = stats;
      renderPending(pendingEl, pending, load);
      renderStats(statsEl, stats, load);
      info.textContent = `Kurs ${stats.course?.code || code} · Stand ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr · aktualisiert sich jede Minute`;
    } catch (e) {
      info.textContent = `Aktualisieren fehlgeschlagen: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  };
  if (lastStats) renderStats(statsEl, lastStats, load);
  view.querySelector("#refresh").addEventListener("click", load);
  load();
  refreshTimer = setInterval(() => { if (!document.hidden) load(); }, 60000);
}

/* ---------------- Neue Anmeldungen ---------------- */

function renderPending(el, list, reload) {
  if (!list?.length) { el.innerHTML = ""; return; }
  const fmt = (d) => new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  el.innerHTML = `
    <section class="card pending-card">
      <div class="card-head"><h2>${icon("user")} Neue Anmeldungen <span class="count-badge">${list.length}</span></h2>
        <span class="small muted">Erst nach der Freigabe erscheinen sie in deiner Übersicht</span></div>
      <ul class="pending-list">${list.map((r) => `
        <li data-id="${esc(r.id)}">
          <span class="avatar">${esc((r.name || "?").trim().charAt(0).toUpperCase())}</span>
          <div class="pp-text"><strong>${esc(r.name || "Ohne Namen")}</strong>
            <span class="small muted">${esc(r.email || "")} · ${fmt(r.created_at)}${r.requested_course ? ` · Kurscode ${esc(r.requested_course)}` : " · ohne Kurscode"}</span></div>
          <div class="pending-actions">
            <button class="btn btn-primary btn-sm" data-act="approve">${icon("check")} Freigeben</button>
            <button class="btn btn-ghost btn-sm" data-act="reject">Ablehnen</button>
          </div>
        </li>`).join("")}</ul>
    </section>`;
  el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
    const li = b.closest("li");
    const r = list.find((x) => x.id === li.dataset.id);
    if (b.dataset.act === "reject" && !confirm(`Anmeldung von ${r.name} (${r.email}) ablehnen?\n\nDas Konto wird gelöscht.`)) return;
    li.querySelectorAll("button").forEach((x) => { x.disabled = true; });
    try {
      await (b.dataset.act === "approve" ? sync.approve(r.id) : sync.reject(r.id));
      await reload();
    } catch (e) {
      alert(e.message);
      li.querySelectorAll("button").forEach((x) => { x.disabled = false; });
    }
  }));
}

// Teilnehmer verwalten: Passwort zurücksetzen oder aus dem Kurs entfernen
async function manageLearner(l, action, reload) {
  if (action === "password") {
    const pw = prompt(`Neues Passwort für ${l.name} (mindestens 8 Zeichen):\n\nGib es der Person persönlich weiter – sie kann es danach im Profil ändern.`);
    if (pw == null) return;
    if (pw.length < 8) { alert("Das Passwort muss mindestens 8 Zeichen haben."); return; }
    try { await sync.setLearnerPassword(l.id, pw); alert(`Das Passwort für ${l.name} wurde geändert.`); }
    catch (e) { alert(e.message); }
  } else if (action === "remove") {
    const what = l.account === false ? "Der Eintrag (ohne Konto) und sein Lernfortschritt werden gelöscht." : "Das Konto und der gesamte Lernfortschritt werden gelöscht.";
    if (!confirm(`${l.name} aus dem Kurs entfernen?\n\n${what}`)) return;
    try { await sync.removeLearner(l.id); await reload(); }
    catch (e) {
      alert(/nicht gefunden/.test(e.message)
        ? `${e.message}.\n\nFalls es sich um einen alten Eintrag ohne Konto handelt: Bitte supabase/update-3.sql in Supabase ausführen (siehe README).`
        : e.message);
    }
  }
}

/* ---------------- Auswertung ---------------- */

// Anzahl Fragen je Stufe (Fall-Schritte zählen einzeln, wie auf dem Server)
function levelTotals() {
  const t = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const i of DATA.items) t[i.level] += i.type === "case" ? i.steps.length : 1;
  return t;
}

function relDay(d) {
  if (!d) return "–";
  const date = new Date(d);
  if (new Date().toDateString() === date.toDateString()) return "heute";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  return date.toLocaleDateString("de-DE");
}

function renderStats(el, stats, reload) {
  const totals = levelTotals();
  const allTotal = Object.values(totals).reduce((a, b) => a + b, 0);

  const learners = (stats.learners || []).map((l) => {
    const n = Object.values(l.topics || {}).reduce((s, t) => s + t.n, 0);
    const c = Object.values(l.topics || {}).reduce((s, t) => s + t.c, 0);
    const exams = l.exams || [];
    const best = exams.reduce((m, e) => Math.max(m, e.score / e.total), -1);
    const levels = [1, 2, 3, 4].map((lv) => Math.min(1, (l.mastered?.[lv] || 0) / (totals[lv] || 1)));
    const mastered = [1, 2, 3, 4].reduce((s, lv) => s + Math.min(l.mastered?.[lv] || 0, totals[lv]), 0);
    const current = levels.findIndex((p) => p < CONFIG.unlockThreshold);
    return {
      ...l, n, c, rate: n ? c / n : null, best: best < 0 ? null : best, passed: exams.some((e) => e.passed),
      levels, progress: allTotal ? mastered / allTotal : 0, stage: current === -1 ? 5 : current + 1,
    };
  });

  if (!learners.length) {
    el.innerHTML = `
      <section class="card empty">
        ${icon("users", "icon icon-xl")}
        <h2>Noch keine Teilnehmenden</h2>
        <p class="muted">Lade die Teilnehmenden unten über Link oder QR-Code ein. Neue Konten erscheinen oben unter „Neue Anmeldungen“ – nach deiner Freigabe siehst du hier ihren Lernfortschritt.</p>
      </section>`;
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

  const avgProgress = learners.reduce((s, l) => s + l.progress, 0) / learners.length;
  const activeWeek = learners.filter((l) => l.last_seen && Date.now() - new Date(l.last_seen).getTime() < 7 * 86400000).length;
  const hardest = (stats.questions || [])
    .filter((q) => q.n >= 3)
    .map((q) => ({ ...q, rate: q.c / q.n, q: findQuestion(q.question_id) }))
    .filter((q) => q.q)
    .sort((a, b) => a.rate - b.rate || b.n - a.n)
    .slice(0, 10);
  const stageLabel = (s) => (s === 5 ? "Prüfungsreif" : `Stufe ${s}: ${DATA.levels[s - 1]?.title || ""}`);
  const byProgress = [...learners].sort((a, b) => b.progress - a.progress || a.name.localeCompare(b.name, "de"));
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("de-DE") : "–");
  const progClass = (p) => (p >= 0.8 ? "good" : p >= 0.4 ? "mid" : "bad");

  el.innerHTML = `
    <section class="kpis">
      <div class="kpi">${icon("users")}<div><span>Teilnehmende</span><strong>${learners.length}</strong></div></div>
      <div class="kpi">${icon("pulse")}<div><span>Ø Lernfortschritt</span><strong>${pct(avgProgress)}</strong></div></div>
      <div class="kpi">${icon("clock")}<div><span>Aktiv (7 Tage)</span><strong>${activeWeek} / ${learners.length}</strong></div></div>
      <div class="kpi">${icon("award")}<div><span>Prüfung bestanden</span><strong>${learners.filter((l) => l.passed).length} / ${learners.length}</strong></div></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Lernfortschritt</h2>
        <button class="btn btn-ghost btn-sm" id="csv">${icon("download")} CSV</button>
      </div>
      <div class="table-wrap">
        <table class="progress-table">
          <thead><tr><th>Name</th><th>Fortschritt</th><th>Stufen</th><th>Steht bei</th><th>Trefferquote</th><th>Prüfung</th><th>Zuletzt aktiv</th><th></th></tr></thead>
          <tbody>${byProgress.map((l) => `
            <tr>
              <th>${esc(l.name)}${l.account === false ? ' <span class="tag tag-muted" title="Eintrag aus der Zeit vor den Konten">ohne Konto</span>' : ""}</th>
              <td><div class="pt-bar"><div class="bar ${progClass(l.progress)}"><span style="width:${Math.round(l.progress * 100)}%"></span></div><strong>${pct(l.progress)}</strong></div></td>
              <td><div class="stage-dots">${l.levels.map((p, k) => `<span class="dot-lv ${p >= CONFIG.unlockThreshold ? "done" : p > 0 ? "part" : ""}" title="Stufe ${k + 1}: ${pct(p)} sicher">${k + 1}</span>`).join("")}</div></td>
              <td class="small">${esc(stageLabel(l.stage))}</td>
              <td><span class="${rateClass(l.rate)}">${pct(l.rate)}</span> <span class="small muted">(${l.n})</span></td>
              <td>${l.best == null ? '<span class="muted">–</span>' : `<span class="tag ${l.passed ? "tag-ok" : "tag-red"}">${pct(l.best)}</span>`}</td>
              <td class="small muted">${relDay(l.last_seen)}</td>
              <td class="row-actions">
                ${l.account === false ? "" : `<button class="btn btn-ghost btn-sm" data-learner="${esc(l.id)}" data-act="password" title="Neues Passwort setzen">${icon("lock")}</button>`}
                <button class="btn btn-ghost btn-sm" data-learner="${esc(l.id)}" data-act="remove" title="Aus dem Kurs entfernen">✕</button>
              </td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
      <p class="small muted table-note">Fortschritt = Anteil aller Fragen, deren letzte Antwort richtig war. Eine Stufe gilt ab ${Math.round(CONFIG.unlockThreshold * 100)} % als geschafft (grün).</p>
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
          <thead><tr><th>Name</th><th>Gesamt</th>${DATA.topics.map((t) => `<th title="${esc(t.label)}"><span>${esc(t.short)}</span></th>`).join("")}</tr></thead>
          <tbody>${learners.map((l) => `
            <tr>
              <th>${esc(l.name)}</th>
              <td class="cell ${rateClass(l.rate)}">${pct(l.rate)}<small>${l.n}</small></td>
              ${DATA.topics.map((t) => {
                const v = l.topics?.[t.id];
                const r = v ? v.c / v.n : null;
                return `<td class="cell ${rateClass(r)}" title="${esc(t.label)}: ${v ? `${v.c}/${v.n}` : "keine Daten"}">${v ? Math.round(r * 100) : "·"}</td>`;
              }).join("")}
            </tr>`).join("")}</tbody>
        </table>
      </div>
    </section>`;

  el.querySelectorAll("[data-learner]").forEach((b) => b.addEventListener("click", () => {
    const l = learners.find((x) => x.id === b.dataset.learner);
    if (l) manageLearner(l, b.dataset.act, reload);
  }));

  el.querySelector("#csv").addEventListener("click", () => {
    const head = ["Name", "Fortschritt %", "Steht bei", "Antworten", "Trefferquote %", "Beste Prüfung %", "Bestanden", ...DATA.topics.map((t) => t.label), "Zuletzt aktiv"];
    const rows = byProgress.map((l) => [
      l.name, Math.round(l.progress * 100), stageLabel(l.stage), l.n, l.rate == null ? "" : Math.round(l.rate * 100),
      l.best == null ? "" : Math.round(l.best * 100), l.passed ? "ja" : "nein",
      ...DATA.topics.map((t) => { const v = l.topics?.[t.id]; return v ? Math.round((v.c / v.n) * 100) : ""; }),
      fmtDate(l.last_seen),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `sani-trainer_kurs_${stats.course?.code || "auswertung"}.csv`;
    a.click();
  });
}
