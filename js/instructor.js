// Ausbilder-Bereich: Lernerfolg der Teilnehmenden und Schwächenanalyse.
import { CONFIG } from "./config.js";
import { DATA, topicLabel, findQuestion } from "./data.js";
import { esc } from "./quiz.js";
import * as sync from "./sync.js";
import { icon } from "./icons.js";

const pct = (r) => (r == null ? "–" : `${Math.round(r * 100)} %`);
const rateClass = (r) => (r == null ? "none" : r >= 0.8 ? "good" : r >= 0.6 ? "mid" : "bad");

/* ---------------- PIN-Schutz (pro Gerät) ---------------- */

const PIN_KEY = "sani-trainer-admin";
const DATA_KEY = "sani-trainer-admin-data";
const UNLOCK_KEY = "sani-trainer-admin-unlocked";
const ITERATIONS = 150000;

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignorieren */ } },
};
const unlocked = () => { try { return sessionStorage.getItem(UNLOCK_KEY) === "1"; } catch { return false; } };
const setUnlocked = (v) => { try { v ? sessionStorage.setItem(UNLOCK_KEY, "1") : sessionStorage.removeItem(UNLOCK_KEY); } catch { /* ignorieren */ } };

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hashPin(pin, saltHex, iterations = ITERATIONS) {
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return toHex(bits);
}

async function savePin(pin) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  ls.set(PIN_KEY, { salt, iterations: ITERATIONS, hash: await hashPin(pin, salt), failed: 0, lockedUntil: 0 });
}

export function renderInstructor(view) {
  if (!crypto?.subtle) {
    view.innerHTML = `<section class="card empty"><h2>Nicht verfügbar</h2><p class="muted">Der Ausbilder-Bereich braucht eine sichere Verbindung (https). Bitte die App über den offiziellen Link öffnen.</p></section>`;
    return;
  }
  const cfg = ls.get(PIN_KEY);
  if (!cfg) return renderSetup(view);
  if (!unlocked()) return renderLock(view, cfg);
  renderPanel(view);
}

function pinShell(title, text, fields, button, extra = "") {
  return `
    <div class="onboarding">
      <form class="card onboarding-card form" id="pin-form">
        <div class="lock-icon">${icon("lock")}</div>
        <h1>${title}</h1>
        <p class="muted">${text}</p>
        ${fields}
        <p class="form-error" hidden></p>
        <button class="btn btn-primary btn-lg">${button}</button>
        ${extra}
      </form>
    </div>`;
}

const pinInput = (name, label, auto) =>
  `<label>${label}<input name="${name}" type="password" inputmode="text" autocomplete="${auto}" minlength="4" maxlength="64" required></label>`;

function renderSetup(view, isChange = false) {
  view.innerHTML = pinShell(
    isChange ? "Neue PIN festlegen" : "Ausbilder-PIN festlegen",
    "Die PIN schützt den Ausbilder-Bereich und die gespeicherten Auswertungen auf <strong>diesem Gerät</strong>. Mindestens 4 Zeichen – besser 6 oder mehr, gern auch Buchstaben.",
    pinInput("pin", "PIN", "new-password") + pinInput("pin2", "PIN wiederholen", "new-password"),
    "PIN speichern",
    isChange ? '<a class="link small" href="#/ausbilder" id="cancel">Abbrechen</a>' : "",
  );
  const f = view.querySelector("#pin-form");
  f.querySelector("#cancel")?.addEventListener("click", (e) => { e.preventDefault(); renderPanel(view); });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = f.querySelector(".form-error");
    if (f.pin.value !== f.pin2.value) { err.textContent = "Die beiden Eingaben stimmen nicht überein."; err.hidden = false; return; }
    f.querySelector("button").disabled = true;
    await savePin(f.pin.value);
    setUnlocked(true);
    renderPanel(view);
  });
  f.pin.focus();
}

function renderLock(view, cfg) {
  view.innerHTML = pinShell(
    "Ausbilder-Bereich",
    "Bitte gib deine Ausbilder-PIN ein.",
    pinInput("pin", "PIN", "current-password"),
    "Entsperren",
    '<button type="button" class="btn btn-ghost btn-sm" id="forgot">PIN vergessen?</button>',
  );
  const f = view.querySelector("#pin-form");
  const err = f.querySelector(".form-error");
  const btn = f.querySelector("button[class*=primary]");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const c = ls.get(PIN_KEY);
    const wait = (c.lockedUntil || 0) - Date.now();
    if (wait > 0) { err.textContent = `Zu viele Fehlversuche. Bitte ${Math.ceil(wait / 1000)} Sekunden warten.`; err.hidden = false; return; }
    btn.disabled = true;
    const ok = (await hashPin(f.pin.value, c.salt, c.iterations)) === c.hash;
    btn.disabled = false;
    if (ok) {
      ls.set(PIN_KEY, { ...c, failed: 0, lockedUntil: 0 });
      setUnlocked(true);
      renderPanel(view);
      return;
    }
    const failed = (c.failed || 0) + 1;
    const lockedUntil = failed >= 5 ? Date.now() + 30000 * 2 ** Math.min(failed - 5, 5) : 0;
    ls.set(PIN_KEY, { ...c, failed, lockedUntil });
    err.textContent = lockedUntil ? "PIN falsch. Der Bereich ist vorübergehend gesperrt." : "PIN falsch.";
    err.hidden = false;
    f.pin.value = "";
    f.pin.focus();
  });
  f.querySelector("#forgot").addEventListener("click", () => {
    if (confirm("PIN zurücksetzen?\n\nAus Sicherheitsgründen werden dabei auch alle auf diesem Gerät gespeicherten Auswertungen gelöscht. Die Teilnehmenden können dir ihre Exportdateien danach einfach erneut schicken.")) {
      ls.del(PIN_KEY);
      ls.del(DATA_KEY);
      renderSetup(view);
    }
  });
  f.pin.focus();
}

/* ---------------- Einladen ---------------- */

const appUrl = () => CONFIG.appUrl || `${location.origin}${location.pathname}`;

function inviteText(code) {
  return `Moin! Für unseren Sanitätslehrgang beim ${CONFIG.orgName} gibt es eine Lern-App mit Fragen, Fallbeispielen und Prüfungssimulation:

${appUrl()}

Einfach öffnen und deinen Vornamen eintragen${code ? ` – Kurscode: ${code}` : ""}.
Tipp: Über „Zum Home-Bildschirm“ (iPhone) bzw. „App installieren“ (Android) wird sie zur App und funktioniert auch offline.`;
}

function inviteCard() {
  const code = ls.get("sani-trainer-invite-code") || "";
  return `
    <section class="card invite">
      <div class="invite-qr">
        <img src="assets/qr-code.png" alt="QR-Code zur App" width="200" height="255">
      </div>
      <div class="invite-body">
        <h2>${icon("users")} Teilnehmende einladen</h2>
        <p class="muted small">Teile Link und QR-Code z. B. in der WhatsApp-Gruppe des Lehrgangs – oder zeig den QR-Code am Beamer.</p>
        <label><span>Kurscode <span class="muted">(optional)</span></span>
          <input id="invite-code" maxlength="20" autocomplete="off" autocapitalize="characters" value="${esc(code)}">
        </label>
        <label>Einladungstext
          <textarea id="invite-text" rows="7">${esc(inviteText(code))}</textarea>
        </label>
        <div class="invite-actions">
          <button class="btn btn-primary" id="invite-share">${icon("upload")} Teilen</button>
          <button class="btn btn-secondary" id="invite-copy">Text kopieren</button>
          <a class="btn btn-secondary" href="assets/qr-code.png" download="Sani-Trainer-QR-Code.png">${icon("download")} QR-Code</a>
        </div>
        <p class="small invite-msg" hidden></p>
      </div>
    </section>`;
}

function bindInvite(root) {
  const codeEl = root.querySelector("#invite-code");
  const textEl = root.querySelector("#invite-text");
  const msg = root.querySelector(".invite-msg");
  const say = (t) => { msg.textContent = t; msg.hidden = false; };
  codeEl.addEventListener("input", () => {
    const code = codeEl.value.trim().toUpperCase();
    ls.set("sani-trainer-invite-code", code);
    textEl.value = inviteText(code);
  });
  const copy = async () => {
    try { await navigator.clipboard.writeText(textEl.value); say("Text kopiert ✓ – jetzt z. B. in WhatsApp einfügen."); }
    catch { textEl.select(); say("Bitte den markierten Text kopieren (Strg+C bzw. lange tippen)."); }
  };
  root.querySelector("#invite-copy").addEventListener("click", copy);
  root.querySelector("#invite-share").addEventListener("click", async () => {
    if (!navigator.share) { await copy(); return; }
    const data = { title: "Sani-Trainer", text: textEl.value };
    try {
      const blob = await fetch("assets/qr-code.png").then((r) => r.blob());
      const file = new File([blob], "Sani-Trainer-QR-Code.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) data.files = [file];
    } catch { /* ohne Bild teilen */ }
    try { await navigator.share(data); }
    catch (e) { if (e.name !== "AbortError") await copy(); }
  });
}

/* ---------------- Gespeicherte Auswertung ---------------- */

// Exportdatei -> kompakte Zusammenfassung pro Teilnehmer (nur Zahlen, keine Einzelantworten)
function summarize(name, data) {
  if (data?.format !== "sani-trainer-export") throw new Error(`${name} ist keine Sani-Trainer-Exportdatei`);
  const topics = {};
  const questions = {};
  let last = null;
  for (const h of data.history || []) {
    const t = (topics[h.topic] ||= { n: 0, c: 0 });
    const q = (questions[h.question_id] ||= { n: 0, c: 0 });
    t.n++; q.n++;
    if (h.correct) { t.c++; q.c++; }
    if (!last || h.at > last) last = h.at;
  }
  return {
    id: data.learner?.id || name,
    name: data.learner?.name || "Unbekannt",
    courseCode: data.learner?.courseCode || null,
    exportedAt: data.exportedAt,
    last_seen: last || data.exportedAt,
    topics,
    questions,
    exams: data.exams || [],
  };
}

function storedStats() {
  const store = ls.get(DATA_KEY);
  const list = Object.values(store?.learners || {});
  if (!list.length) return null;
  const questions = {};
  const codes = new Set();
  for (const l of list) {
    if (l.courseCode) codes.add(l.courseCode);
    for (const [id, v] of Object.entries(l.questions || {})) {
      const q = (questions[id] ||= { question_id: id, n: 0, c: 0 });
      q.n += v.n; q.c += v.c;
    }
  }
  return {
    course: { code: [...codes].join(", ") || "–", name: `${list.length} importierte Lernstände` },
    learners: list.sort((a, b) => a.name.localeCompare(b.name, "de")),
    questions: Object.values(questions),
    local: true,
  };
}

/* ---------------- Hauptansicht ---------------- */

function renderPanel(view) {
  view.innerHTML = `
    <div class="page-head stats-head">
      <div>
        <h1>Ausbilder-Bereich</h1>
        <p class="muted">Lernfortschritt der Teilnehmenden auf einen Blick – und wo ihr im Lehrgang nochmal ansetzen solltet.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost btn-sm" id="change-pin">PIN ändern</button>
        <button class="btn btn-secondary btn-sm" id="lock">${icon("lock")} Sperren</button>
      </div>
    </div>
    ${inviteCard()}
    <div class="grid-2">
      ${sync.backendEnabled()
        ? `<form class="card form" id="online-form">
            <h2>${icon("cloud")} Online-Kurs öffnen</h2>
            <label>Kurscode<input name="code" required autocomplete="off" autocapitalize="characters"></label>
            <label>Kurs-PIN<input name="pin" type="password" required autocomplete="current-password"></label>
            <p class="form-error" hidden></p>
            <button class="btn btn-primary">Auswertung laden</button>
          </form>`
        : `<section class="card">
            <h2>${icon("cloud")} Online-Kurs</h2>
            <p class="muted">Die automatische Online-Auswertung ist noch nicht eingerichtet (siehe README, Abschnitt „Ausbilder-Auswertung einrichten“). Bis dahin funktioniert der Import der Exportdateien.</p>
          </section>`}
      <section class="card">
        <h2>${icon("upload")} Exportdateien importieren</h2>
        <p class="muted">Teilnehmende exportieren ihren Lernstand unter „Profil“ und schicken dir die Datei. Du kannst mehrere Dateien auf einmal auswählen. Neue Dateien ersetzen ältere Stände derselben Person – die Auswertung bleibt auf diesem Gerät gespeichert.</p>
        <div class="invite-actions">
          <label class="btn btn-primary file-btn">Dateien auswählen<input type="file" id="import" accept=".json,application/json" multiple hidden></label>
          <button class="btn btn-danger-ghost btn-sm" id="clear-data">Gespeicherte Auswertung löschen</button>
        </div>
        <p class="form-error" id="import-error" hidden></p>
      </section>
    </div>
    <div id="stats"></div>`;

  const statsEl = view.querySelector("#stats");
  bindInvite(view);

  view.querySelector("#lock").addEventListener("click", () => { setUnlocked(false); renderInstructor(view); window.scrollTo(0, 0); });
  view.querySelector("#change-pin").addEventListener("click", () => renderSetup(view, true));

  const showStored = (scroll) => {
    const s = storedStats();
    if (s) renderStats(statsEl, s, scroll);
    else statsEl.innerHTML = "";
    view.querySelector("#clear-data").hidden = !s;
  };
  showStored(false);

  view.querySelector("#clear-data").addEventListener("click", () => {
    if (confirm("Alle auf diesem Gerät gespeicherten Auswertungen löschen?")) { ls.del(DATA_KEY); showStored(false); }
  });

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
      renderStats(statsEl, stats, true);
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
      const files = await Promise.all([...e.target.files].map((f) => f.text().then((t) => summarize(f.name, JSON.parse(t)))));
      const store = ls.get(DATA_KEY) || { learners: {} };
      for (const s of files) {
        const prev = store.learners[s.id];
        if (!prev || (prev.exportedAt || "") <= (s.exportedAt || "")) store.learners[s.id] = s;
      }
      if (!ls.set(DATA_KEY, store)) throw new Error("Speicher voll – bitte ältere Auswertungen löschen");
      showStored(true);
    } catch (ex) {
      err.textContent = `Import fehlgeschlagen: ${ex.message}`;
      err.hidden = false;
    }
    e.target.value = "";
  });
}

function renderStats(el, stats, scroll = true) {
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
  if (scroll) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

