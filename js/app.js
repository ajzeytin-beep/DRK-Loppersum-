import { CONFIG } from "./config.js";
import * as store from "./store.js";
import { DATA, loadData, topicLabel } from "./data.js";
import { renderItem, answerText, esc, shuffle } from "./quiz.js";
import * as sync from "./sync.js";
import { renderInstructor, isAdmin, hasPin, setupPin, verifyPin, resetAdmin, adminLogout } from "./instructor.js";
import { icon } from "./icons.js";

const view = document.getElementById("view");
let timer = null;

/* ---------------- Hilfsfunktionen ---------------- */

const pctText = (x) => `${Math.round((x || 0) * 100)} %`;

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function ring(value, size = 120, label = "") {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return `<svg class="ring" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${Math.round(v * 100)} Prozent">
    <circle cx="60" cy="60" r="${r}" class="ring-bg"/>
    <circle cx="60" cy="60" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - v)).toFixed(1)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="${label ? 62 : 68}" text-anchor="middle" class="ring-text">${Math.round(v * 100)}%</text>
    ${label ? `<text x="60" y="82" text-anchor="middle" class="ring-label">${esc(label)}</text>` : ""}
  </svg>`;
}

const bar = (value, cls = "") => `<div class="bar ${cls}"><span style="width:${Math.round((value || 0) * 100)}%"></span></div>`;
const rateClass = (r) => (r == null ? "" : r >= 0.8 ? "good" : r >= 0.6 ? "mid" : "bad");

const logos = () =>
  `<img src="assets/logo-drk.png" alt="DRK" class="logo" onerror="this.remove()"><img src="assets/logo-ov.png" alt="DRK OV Loppersum" class="logo" onerror="this.remove()">`;

function clearTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

/* ---------------- Statistik ---------------- */

function levelStats(level) {
  const items = DATA.items.filter((i) => i.level === level);
  const p = store.getState().progress;
  const mastered = items.filter((i) => p[i.id]?.last === true).length;
  const seen = items.filter((i) => p[i.id]).length;
  return { total: items.length, mastered, seen, pct: items.length ? mastered / items.length : 0 };
}

function isUnlocked(level) {
  if (level <= 1 || store.getState().settings.unlockAll) return true;
  return levelStats(level - 1).pct >= CONFIG.unlockThreshold;
}

function topicStats() {
  const m = {};
  for (const h of store.getState().history) {
    const t = (m[h.topic] ||= { id: h.topic, n: 0, c: 0 });
    t.n++;
    if (h.correct) t.c++;
  }
  return Object.values(m).map((t) => ({ ...t, rate: t.c / t.n }));
}

function dueItems() {
  const p = store.getState().progress;
  const now = Date.now();
  return DATA.items.filter((i) => i.level <= 4 && isUnlocked(i.level) && p[i.id] && p[i.id].due <= now);
}

function nextLevel() {
  for (let l = 1; l <= 4; l++) if (isUnlocked(l) && levelStats(l).pct < CONFIG.unlockThreshold) return l;
  return 4;
}

function pickItems(pool, n) {
  const p = store.getState().progress;
  const now = Date.now();
  const score = (i) => {
    const x = p[i.id];
    if (!x) return 1 + Math.random();
    if (x.last === false) return Math.random();
    if (x.due <= now) return 2 + Math.random();
    return 3 + Math.random();
  };
  return shuffle(pool.map((i) => [score(i), i]).sort((a, b) => a[0] - b[0]).slice(0, n).map((x) => x[1]));
}

/* ---------------- Navigation ---------------- */

const NAV = [
  { href: "#/", label: "Dashboard", icon: "home" },
  { href: "#/wiederholen", label: "Wiederholen", icon: "repeat" },
  { href: "#/pruefung", label: "Prüfung", icon: "award" },
  { href: "#/merkkarten", label: "Merkkarten", icon: "cards" },
  { href: "#/ausbilder", label: "Ausbilder", icon: "users", desktopOnly: true, adminOnly: true },
  { href: "#/profil", label: "Profil", icon: "user" },
];

// Ausbilder ohne Teilnehmer-Anmeldung sehen nur ihren Bereich
const ADMIN_NAV = [
  { href: "#/ausbilder", label: "Ausbilder", icon: "users" },
  { href: "#/merkkarten", label: "Merkkarten", icon: "cards" },
];

function renderNav() {
  const hash = location.hash || "#/";
  const learner = Boolean(store.getState().profile);
  const items = learner ? NAV.filter((n) => !n.adminOnly || isAdmin()) : ADMIN_NAV;
  const isActive = (href) =>
    href === "#/" ? hash === "#/" || hash.startsWith("#/lernen") || hash.startsWith("#/thema") : hash.startsWith(href);
  const link = (n) => `<a href="${n.href}" class="${isActive(n.href) ? "active" : ""}">${icon(n.icon)}<span>${n.label}</span></a>`;
  document.getElementById("nav").innerHTML = items.map(link).join("");
  const bottom = learner ? items.filter((n) => !n.desktopOnly) : [...items, { href: "#/abmelden", label: "Abmelden", icon: "logout" }];
  document.getElementById("bottom-nav").innerHTML = bottom.map(link).join("");
  document.getElementById("bottom-nav").style.gridTemplateColumns = `repeat(${bottom.length}, 1fr)`;
  renderSyncStatus();
}

function renderSyncStatus() {
  const el = document.getElementById("sync-status");
  const p = store.getState().profile;
  if (!p) {
    el.innerHTML = isAdmin()
      ? `<div class="me">${icon("shield")}<div><strong>Ausbilder</strong><span>angemeldet</span></div></div>
         <a class="logout-link" href="#/abmelden">${icon("logout")} Abmelden</a>`
      : "";
    return;
  }
  let status = "";
  if (p.courseCode && p.joined && sync.backendEnabled()) {
    const pending = sync.pendingCount();
    status = pending ? `${pending} Antworten noch nicht übertragen` : "Fortschritt übertragen";
  } else if (p.courseCode) {
    status = "Offline – Export unter Profil";
  }
  el.innerHTML = `
    <div class="me">${icon("user")}<div><strong>${esc(p.name)}</strong>
    ${p.courseCode ? `<span>Kurs ${esc(p.courseCode)}</span><span class="small">${status}</span>` : "<span>Teilnehmer · ohne Kurs</span>"}</div></div>
    <a class="logout-link" href="#/abmelden">${icon("logout")} Abmelden</a>`;
}

function logoutAll() {
  sync.flush();
  store.logout();
  adminLogout();
  location.hash = "#/start";
}

const ROUTES = [
  [/^#\/?$/, () => dashboard()],
  [/^#\/start(?:\/(teilnehmer|ausbilder))?$/, (m) => loginView(m[1] || "teilnehmer")],
  [/^#\/abmelden$/, () => logoutAll()],
  [/^#\/lernen\/([1-4])$/, (m) => learnLevel(Number(m[1]))],
  [/^#\/thema\/([\w-]+)$/, (m) => topicTraining(m[1])],
  [/^#\/wiederholen$/, () => review()],
  [/^#\/pruefung$/, () => examIntro()],
  [/^#\/merkkarten$/, () => cardsView()],
  [/^#\/ausbilder$/, () => renderInstructor(view)],
  [/^#\/profil$/, () => profileView()],
];

// Seiten, die ohne Teilnehmer-Anmeldung erreichbar sind
const PUBLIC = [/^#\/start/, /^#\/abmelden$/, /^#\/ausbilder$/];
const ADMIN_PUBLIC = [/^#\/merkkarten$/];

function route() {
  clearTimer();
  const hash = location.hash || "#/";
  const learner = Boolean(store.getState().profile);
  const allowed = learner || PUBLIC.some((r) => r.test(hash)) || (isAdmin() && ADMIN_PUBLIC.some((r) => r.test(hash)));
  if (!allowed) {
    location.hash = isAdmin() ? "#/ausbilder" : "#/start";
    return;
  }
  for (const [re, fn] of ROUTES) {
    const m = hash.match(re);
    if (m) {
      document.body.classList.remove("in-session", "auth");
      fn(m);
      renderNav();
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = "#/";
}

/* ---------------- Anmeldung & Profil ---------------- */

function profileForm(p, submitLabel) {
  return `
    <form id="profile-form" class="form">
      <label>Dein Vorname oder Spitzname
        <input name="name" required maxlength="40" autocomplete="given-name" value="${esc(p?.name || "")}">
      </label>
      <label><span>Kurscode <span class="muted">(optional – bekommst du von deinem Ausbilder)</span></span>
        <input name="code" maxlength="20" autocomplete="off" autocapitalize="characters" value="${esc(p?.courseCode || "")}">
      </label>
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-lg">${submitLabel}</button>
    </form>`;
}

function bindProfileForm(onDone) {
  const form = document.getElementById("profile-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = form.querySelector(".form-error");
    const btn = form.querySelector("button");
    const name = form.name.value.trim();
    const code = form.code.value.trim().toUpperCase();
    const prev = store.getState().profile;
    // Gleicher Name + Kurscode schon auf diesem Gerät? Dann diesen Lernstand fortsetzen.
    if (!prev) {
      const existing = store.findProfile(name, code || null);
      if (existing && store.switchTo(existing.id)) {
        sync.flush().then(renderSyncStatus);
        onDone();
        return;
      }
    }
    const id = prev?.id || uuid();
    let joined = false;
    let courseName = null;
    err.hidden = true;
    if (code && sync.backendEnabled()) {
      btn.disabled = true;
      try {
        const res = await sync.joinCourse(code, id, name);
        joined = true;
        courseName = res?.name || null;
      } catch (ex) {
        err.textContent = `Kurs konnte nicht verbunden werden: ${ex.message}. Prüfe den Code oder lass das Feld leer.`;
        err.hidden = false;
        btn.disabled = false;
        return;
      }
    }
    const st = store.getState();
    if (prev && prev.courseCode !== code) st.syncedCount = 0;
    store.setProfile({ id, name, courseCode: code || null, joined, courseName });
    sync.flush().then(renderSyncStatus);
    onDone();
  });
}

function loginView(tab) {
  // Bereits angemeldet? Direkt weiter.
  if (tab === "teilnehmer" && store.getState().profile) { location.hash = "#/"; return; }
  if (tab === "ausbilder" && isAdmin()) { location.hash = "#/ausbilder"; return; }
  document.body.classList.add("auth");

  view.innerHTML = `
    <div class="auth-wrap">
      <div class="card auth-card">
        <div class="auth-logo"><img src="assets/logo-ov.png" alt="DRK OV Loppersum" onerror="this.remove()"></div>
        <h1>Sani-Trainer</h1>
        <p class="muted auth-sub">${esc(CONFIG.orgName)} · Sanitätsausbildung</p>
        <nav class="seg" aria-label="Anmeldung als">
          <a href="#/start/teilnehmer" class="${tab === "teilnehmer" ? "active" : ""}" ${tab === "teilnehmer" ? 'aria-current="page"' : ""}>${icon("user")} Teilnehmer</a>
          <a href="#/start/ausbilder" class="${tab === "ausbilder" ? "active" : ""}" ${tab === "ausbilder" ? 'aria-current="page"' : ""}>${icon("shield")} Ausbilder</a>
        </nav>
        <div id="auth-body"></div>
      </div>
    </div>`;
  const body = view.querySelector("#auth-body");
  tab === "ausbilder" ? adminLogin(body) : learnerLogin(body);
}

function learnerLogin(body) {
  const profiles = store.listProfiles();
  body.innerHTML = `
    ${profiles.length ? `
      <h2 class="auth-h">Weiterlernen</h2>
      <ul class="profile-list">${profiles.map((p) => `
        <li>
          <button class="profile-pick" data-id="${esc(p.id)}">
            <span class="avatar">${esc(p.name.trim().charAt(0).toUpperCase())}</span>
            <span class="pp-text"><strong>${esc(p.name)}</strong><span class="small muted">${p.courseCode ? `Kurs ${esc(p.courseCode)}` : "ohne Kurs"}</span></span>
            ${icon("login")}
          </button>
          <button class="profile-del" data-del="${esc(p.id)}" title="${esc(p.name)} von diesem Gerät entfernen" aria-label="${esc(p.name)} von diesem Gerät entfernen">✕</button>
        </li>`).join("")}</ul>
      <div class="divider"><span>oder neu anmelden</span></div>` : `
      <p class="lead auth-lead">Moin! Vom Erste-Hilfe-Kurs zum Sanitätsdienst – lerne Schritt für Schritt alles für den Abschluss des Lehrgangs.</p>`}
    ${profileForm(null, `${icon("login")} Anmelden`)}
    <p class="small muted auth-note">Dein Lernstand wird auf diesem Gerät gespeichert. Mit Kurscode sieht dein Ausbilder deinen Namen, deine Antworten und Prüfungsergebnisse – damit er dich gezielt unterstützen kann.</p>`;
  bindProfileForm(() => { location.hash = "#/"; });
  body.querySelectorAll(".profile-pick").forEach((b) => b.addEventListener("click", () => {
    if (store.switchTo(b.dataset.id)) { sync.flush(); location.hash = "#/"; }
  }));
  body.querySelectorAll(".profile-del").forEach((b) => b.addEventListener("click", () => {
    const p = profiles.find((x) => x.id === b.dataset.del);
    if (p && confirm(`${p.name} von diesem Gerät entfernen?\n\nDer Lernstand auf diesem Gerät wird gelöscht. Exportiere ihn vorher, falls du ihn noch brauchst.`)) {
      store.removeProfile(p.id);
      learnerLogin(body);
    }
  }));
  if (!profiles.length) body.querySelector("input[name=name]").focus();
}

function adminLogin(body) {
  if (!crypto?.subtle) {
    body.innerHTML = '<p class="form-error">Die Ausbilder-Anmeldung braucht eine sichere Verbindung (https). Bitte die App über den offiziellen Link öffnen.</p>';
    return;
  }
  const first = !hasPin();
  body.innerHTML = `
    <form class="form" id="admin-form">
      ${first
        ? `<p class="muted auth-lead"><strong>Ersteinrichtung:</strong> Lege eine Ausbilder-PIN für dieses Gerät fest. Sie schützt den Ausbilder-Bereich und die gespeicherten Auswertungen. Mindestens 4 Zeichen – besser 6 oder mehr.</p>
           <label>Neue PIN<input name="pin" type="password" autocomplete="new-password" minlength="4" maxlength="64" required></label>
           <label>PIN wiederholen<input name="pin2" type="password" autocomplete="new-password" minlength="4" maxlength="64" required></label>`
        : `<p class="muted auth-lead">Melde dich mit deiner Ausbilder-PIN an.</p>
           <label>Ausbilder-PIN<input name="pin" type="password" autocomplete="current-password" maxlength="64" required></label>`}
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-lg">${icon("login")} ${first ? "PIN speichern & anmelden" : "Anmelden"}</button>
      ${first ? "" : '<button type="button" class="btn btn-ghost btn-sm" id="forgot">PIN vergessen?</button>'}
    </form>
    <p class="small muted auth-note">Die PIN gilt nur für dieses Gerät. Auswertungen bleiben lokal gespeichert.</p>`;
  const f = body.querySelector("#admin-form");
  const err = f.querySelector(".form-error");
  const btn = f.querySelector(".btn-primary");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    if (first && f.pin.value !== f.pin2.value) { err.textContent = "Die beiden Eingaben stimmen nicht überein."; err.hidden = false; return; }
    btn.disabled = true;
    const res = first ? (await setupPin(f.pin.value), { ok: true }) : await verifyPin(f.pin.value);
    btn.disabled = false;
    if (res.ok) { location.hash = "#/ausbilder"; return; }
    err.textContent = res.error;
    err.hidden = false;
    f.pin.value = "";
    f.pin.focus();
  });
  f.querySelector("#forgot")?.addEventListener("click", () => {
    if (confirm("PIN zurücksetzen?\n\nAus Sicherheitsgründen werden dabei auch alle auf diesem Gerät gespeicherten Auswertungen gelöscht. Die Teilnehmenden können dir ihre Exportdateien danach einfach erneut schicken.")) {
      resetAdmin();
      adminLogin(body);
    }
  });
  f.pin.focus();
}

function profileView() {
  const st = store.getState();
  view.innerHTML = `
    <div class="page-head"><h1>Profil & Einstellungen</h1></div>
    <div class="grid-2">
      <section class="card">
        <h2>Deine Angaben</h2>
        ${profileForm(st.profile, "Speichern")}
        <p class="form-ok small" hidden>Gespeichert ✓</p>
      </section>
      <section class="card">
        <h2>Fortschritt teilen</h2>
        ${sync.backendEnabled() && st.profile?.joined
          ? `<p class="muted">Dein Fortschritt wird automatisch an den Kurs <strong>${esc(st.profile.courseName || st.profile.courseCode)}</strong> übertragen.</p>
             <button class="btn btn-secondary" id="sync-now">${icon("cloud")} Jetzt übertragen</button>
             <p class="small muted" id="sync-msg">${st.lastSync ? `Zuletzt: ${new Date(st.lastSync).toLocaleString("de-DE")}` : ""}</p>`
          : `<p class="muted">Lade deinen Lernstand als Datei herunter und schick sie deinem Ausbilder (z. B. per Messenger oder E-Mail).</p>`}
        <button class="btn btn-secondary" id="export">${icon("download")} Lernstand exportieren</button>
        <hr>
        <h2>Lernpfad</h2>
        <label class="switch"><input type="checkbox" id="unlock" ${st.settings.unlockAll ? "checked" : ""}><span></span> Alle Stufen freischalten</label>
        <p class="small muted">Normalerweise wird eine Stufe freigeschaltet, wenn du ${Math.round(CONFIG.unlockThreshold * 100)} % der vorherigen sicher beherrschst.</p>
        <hr>
        <h2>Zurücksetzen</h2>
        <button class="btn btn-danger-ghost" id="reset">Lernstand löschen</button>
        <hr>
        <div class="invite-actions">
          <a class="btn btn-secondary" href="#/abmelden">${icon("logout")} Abmelden</a>
          <a class="link" href="#/start/ausbilder">${icon("shield")} Ausbilder-Anmeldung</a>
        </div>
      </section>
    </div>`;
  bindProfileForm(() => {
    view.querySelector(".form-ok").hidden = false;
    renderNav();
  });
  view.querySelector("#export").addEventListener("click", () => {
    const data = store.exportData();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    const safe = (st.profile?.name || "teilnehmer").replace(/[^\wäöüÄÖÜß-]+/g, "_");
    a.href = URL.createObjectURL(blob);
    a.download = `sani-trainer_${safe}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  view.querySelector("#sync-now")?.addEventListener("click", async () => {
    const msg = view.querySelector("#sync-msg");
    msg.textContent = "Übertrage …";
    const r = await sync.flush();
    msg.textContent = r.error ? `Fehler: ${r.error}` : "Alles übertragen ✓";
    renderSyncStatus();
  });
  view.querySelector("#unlock").addEventListener("change", (e) => store.setSetting("unlockAll", e.target.checked));
  view.querySelector("#reset").addEventListener("click", () => {
    if (confirm("Wirklich den gesamten Lernstand auf diesem Gerät löschen?")) {
      store.resetProgress();
      location.hash = "#/";
    }
  });
}

/* ---------------- Dashboard ---------------- */

function dashboard() {
  const st = store.getState();
  const p = st.progress;
  const learnItems = DATA.items;
  const mastered = learnItems.filter((i) => p[i.id]?.last === true).length;
  const total = learnItems.length ? mastered / learnItems.length : 0;
  const answered = st.history.length;
  const correct = st.history.filter((h) => h.correct).length;
  const rate = answered ? correct / answered : null;
  const due = dueItems().length;
  const next = nextLevel();
  const weak = topicStats().filter((t) => t.n >= 3).sort((a, b) => a.rate - b.rate).slice(0, 5);
  const bestExam = st.exams.reduce((m, e) => Math.max(m, e.score / e.total), 0);
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Moin" : hour < 18 ? "Moin" : "Moin moin";

  const levelCard = (lv) => {
    if (lv.level === 5) {
      const open = isUnlocked(5);
      return `
        <a class="level-card ${open ? "" : "locked"} exam" href="#/pruefung">
          <div class="level-num">${open ? icon("award") : icon("lock")}</div>
          <div class="level-body">
            <h3>${esc(lv.title)}</h3><p>${esc(lv.description)}</p>
            ${st.exams.length ? `<div class="level-foot"><span>Bestes Ergebnis</span><strong>${pctText(bestExam)}</strong></div>${bar(bestExam)}` : `<div class="level-foot"><span>${open ? "Bereit, wenn du es bist" : "Schalte Stufe 4 frei"}</span></div>`}
          </div>
        </a>`;
    }
    const s = levelStats(lv.level);
    const open = isUnlocked(lv.level);
    const done = s.pct >= CONFIG.unlockThreshold;
    return `
      <a class="level-card ${open ? "" : "locked"} ${done ? "done" : ""} ${lv.level === next && open && !done ? "current" : ""}" href="${open ? `#/lernen/${lv.level}` : "#/"}" ${open ? "" : 'aria-disabled="true"'}>
        <div class="level-num">${open ? (done ? icon("check") : lv.level) : icon("lock")}</div>
        <div class="level-body">
          <h3>${esc(lv.title)}</h3><p>${esc(lv.description)}</p>
          <div class="level-foot"><span>${s.mastered} / ${s.total} sicher</span><strong>${pctText(s.pct)}</strong></div>
          ${bar(s.pct)}
        </div>
      </a>`;
  };

  view.innerHTML = `
    <section class="hero">
      <div class="hero-text">
        <span class="eyebrow">${esc(CONFIG.orgName)} · Sanitätsausbildung</span>
        <h1>${greet}, ${esc(st.profile.name)}!</h1>
        <p class="lead">${answered === 0
          ? "Starte mit der Auffrischung deiner Erste-Hilfe-Kenntnisse – danach geht es Schritt für Schritt Richtung Sanitätsdienst."
          : `Weiter geht’s mit <strong>Stufe ${next}: ${esc(DATA.levels[next - 1].title)}</strong>.`}</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="#/lernen/${next}">${icon("play")} ${answered === 0 ? "Jetzt starten" : "Weiterlernen"}</a>
          ${due ? `<a class="btn btn-secondary btn-lg" href="#/wiederholen">${icon("repeat")} ${due} fällig</a>` : ""}
        </div>
      </div>
      <div class="hero-ring">${ring(total, 150, "gesamt")}</div>
    </section>

    <section class="kpis">
      <div class="kpi">${icon("list")}<div><span>Beantwortet</span><strong>${answered}</strong></div></div>
      <div class="kpi">${icon("target")}<div><span>Trefferquote</span><strong>${rate == null ? "–" : pctText(rate)}</strong></div></div>
      <div class="kpi">${icon("repeat")}<div><span>Wiederholung fällig</span><strong>${due}</strong></div></div>
      <div class="kpi">${icon("award")}<div><span>Prüfungen bestanden</span><strong>${st.exams.filter((e) => e.passed).length} / ${st.exams.length}</strong></div></div>
    </section>

    <h2 class="section-title">Dein Lernpfad</h2>
    <section class="levels">${DATA.levels.map(levelCard).join("")}</section>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Deine Schwachstellen</h2><span class="muted small">Tippe zum gezielten Üben</span></div>
        ${weak.length
          ? `<ul class="topic-list">${weak.map((t) => `
              <li><a href="#/thema/${t.id}">
                <div class="topic-row"><span>${esc(topicLabel(t.id))}</span><strong class="${rateClass(t.rate)}">${pctText(t.rate)}</strong></div>
                ${bar(t.rate, rateClass(t.rate))}
              </a></li>`).join("")}</ul>`
          : `<p class="muted">Sobald du ein paar Fragen beantwortet hast, siehst du hier, welche Themen du noch üben solltest.</p>`}
      </section>
      <section class="card">
        <div class="card-head"><h2>Alle Themen</h2></div>
        <div class="chips">${DATA.topics.map((t) => `<a class="chip" href="#/thema/${t.id}">${esc(t.label)}</a>`).join("")}</div>
      </section>
    </div>`;
}

/* ---------------- Lernsitzungen ---------------- */

function sessionShell(title, idx, total, extra = "") {
  return `
    <div class="session">
      <div class="session-head">
        <a href="#/" class="btn btn-ghost btn-sm">✕ Beenden</a>
        <div class="session-title"><strong>${esc(title)}</strong><span class="muted">${Math.min(idx + 1, total)} / ${total}</span></div>
        ${extra}
      </div>
      <div class="progress-line"><span style="width:${(idx / total) * 100}%"></span></div>
      <div id="qhost"></div>
    </div>`;
}

function runSession({ title, items, mode, again }) {
  if (!items.length) {
    view.innerHTML = `<div class="empty card"><h2>Nichts zu tun 🎉</h2><p class="muted">Hier gibt es gerade keine Fragen für dich.</p><a class="btn btn-primary" href="#/">Zum Dashboard</a></div>`;
    return;
  }
  document.body.classList.add("in-session");
  const results = [];
  let idx = 0;
  const next = () => {
    if (idx >= items.length) return sessionResult(title, results, again);
    const item = items[idx];
    view.innerHTML = sessionShell(title, idx, items.length);
    renderItem(view.querySelector("#qhost"), item, {
      feedback: true,
      onComplete: (correct, steps) => {
        store.recordItem(item, correct, mode, steps);
        results.push({ item, correct, steps });
      },
      onNext: () => { idx++; next(); window.scrollTo(0, 0); },
    });
  };
  next();
}

function reviewList(results) {
  const wrong = results.filter((r) => !r.correct);
  if (!wrong.length) return "";
  return `
    <section class="card">
      <h2>Das solltest du dir nochmal ansehen</h2>
      <ul class="review-list">${wrong.map(({ item, steps }) => {
        if (item.type === "case") {
          return `<li><span class="tag tag-red">Fall</span> <strong>${esc(item.title)}</strong>
            <ul>${item.steps.map((s, k) => (steps?.[k] ? "" : `<li><em>${esc(s.question)}</em><br><span class="ok-text">✓ ${esc(answerText(s))}</span>${s.explanation ? `<p class="small muted">${esc(s.explanation)}</p>` : ""}</li>`)).join("")}</ul></li>`;
        }
        return `<li><strong>${esc(item.question)}</strong><br><span class="ok-text">✓ ${esc(answerText(item))}</span>${item.explanation ? `<p class="small muted">${esc(item.explanation)}</p>` : ""}</li>`;
      }).join("")}</ul>
    </section>`;
}

function sessionResult(title, results, again) {
  document.body.classList.remove("in-session");
  const ok = results.filter((r) => r.correct).length;
  const v = results.length ? ok / results.length : 0;
  sync.flush().then(renderSyncStatus);
  view.innerHTML = `
    <section class="card result">
      ${ring(v, 140)}
      <div>
        <h1>${v >= 0.8 ? "Stark!" : v >= 0.5 ? "Gut gemacht!" : "Dranbleiben!"}</h1>
        <p class="lead">${esc(title)}: ${ok} von ${results.length} richtig.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="again">${icon("repeat")} Noch eine Runde</button>
          <a class="btn btn-secondary" href="#/">Zum Dashboard</a>
        </div>
      </div>
    </section>
    ${reviewList(results)}`;
  view.querySelector("#again").addEventListener("click", again);
}

function learnLevel(level) {
  if (!isUnlocked(level)) { location.hash = "#/"; return; }
  const lv = DATA.levels[level - 1];
  const pool = DATA.items.filter((i) => i.level === level);
  const size = level === 4 ? Math.min(4, pool.length) : CONFIG.sessionSize;
  const start = () => runSession({ title: `Stufe ${level}: ${lv.title}`, items: pickItems(pool, size), mode: "learn", again: start });
  start();
}

function topicTraining(topic) {
  const pool = DATA.items.filter((i) => isUnlocked(i.level) && (i.topic === topic || (i.type === "case" && i.steps.some((s) => s.topic === topic))));
  const start = () => runSession({ title: `Thema: ${topicLabel(topic)}`, items: pickItems(pool, CONFIG.sessionSize), mode: "topic", again: start });
  start();
}

function review() {
  const due = dueItems();
  if (!due.length) {
    view.innerHTML = `
      <div class="page-head"><h1>Wiederholen</h1></div>
      <div class="empty card">${icon("check", "icon icon-xl")}
        <h2>Alles erledigt!</h2>
        <p class="muted">Gerade ist nichts zur Wiederholung fällig. Fragen, die du falsch beantwortet hast, kommen hier automatisch wieder – und richtige in immer größeren Abständen, damit du sie dauerhaft behältst.</p>
        <a class="btn btn-primary" href="#/lernen/${nextLevel()}">Weiterlernen</a>
      </div>`;
    return;
  }
  const start = () => runSession({ title: "Wiederholung", items: pickItems(dueItems(), CONFIG.sessionSize), mode: "review", again: start });
  start();
}

/* ---------------- Prüfungssimulation ---------------- */

function examIntro() {
  const st = store.getState();
  const open = isUnlocked(5);
  view.innerHTML = `
    <div class="page-head"><h1>Prüfungssimulation</h1><p class="muted">Wie im Abschlusstest: gemischte Fragen aus allen Stufen, ohne Lösungen zwischendurch, mit Zeitlimit.</p></div>
    <div class="grid-2">
      <section class="card">
        <ul class="facts">
          <li>${icon("list")} <span><strong>${CONFIG.exam.questions}</strong> Aufgaben inkl. Fallbeispiele</span></li>
          <li>${icon("clock")} <span><strong>${CONFIG.exam.minutes}</strong> Minuten Zeit</span></li>
          <li>${icon("target")} <span>Bestanden ab <strong>${CONFIG.exam.passPercent} %</strong> der Punkte</span></li>
        </ul>
        ${open
          ? `<button class="btn btn-primary btn-lg" id="start-exam">${icon("play")} Prüfung starten</button>`
          : `<p class="notice">${icon("lock")} Die Prüfungssimulation wird freigeschaltet, wenn du Stufe 4 zu ${Math.round(CONFIG.unlockThreshold * 100)} % sicher beherrschst.</p>`}
      </section>
      <section class="card">
        <h2>Bisherige Ergebnisse</h2>
        ${st.exams.length
          ? `<ul class="exam-list">${[...st.exams].reverse().slice(0, 8).map((e) => `
              <li><span>${new Date(e.at).toLocaleDateString("de-DE")}</span><strong class="${e.passed ? "good" : "bad"}">${Math.round((e.score / e.total) * 100)} %</strong><span class="tag ${e.passed ? "tag-ok" : "tag-red"}">${e.passed ? "bestanden" : "nicht bestanden"}</span></li>`).join("")}</ul>`
          : '<p class="muted">Noch keine Prüfung abgelegt.</p>'}
      </section>
    </div>`;
  view.querySelector("#start-exam")?.addEventListener("click", startExam);
}

function startExam() {
  const pool = DATA.items.filter((i) => i.level <= 4);
  const cases = shuffle(pool.filter((i) => i.type === "case")).slice(0, 3);
  const singles = shuffle(pool.filter((i) => i.type !== "case")).slice(0, CONFIG.exam.questions - cases.length);
  const items = shuffle([...singles, ...cases]);
  const answers = [];
  const deadline = Date.now() + CONFIG.exam.minutes * 60000;
  let idx = 0;
  let finished = false;
  document.body.classList.add("in-session");

  const fmt = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimer();
    document.body.classList.remove("in-session");
    let score = 0;
    let total = 0;
    items.forEach((item, k) => {
      const points = item.type === "case" ? item.steps.length : 1;
      total += points;
      const a = answers[k];
      if (a) score += a.steps.filter(Boolean).length;
    });
    const passed = score / total >= CONFIG.exam.passPercent / 100;
    store.recordExam({ score, total, passed });
    sync.flush().then(renderSyncStatus);
    const results = items.map((item, k) => answers[k] || { item, correct: false, steps: [] });
    const unanswered = items.length - answers.length;
    view.innerHTML = `
      <section class="card result">
        ${ring(score / total, 140)}
        <div>
          <span class="tag ${passed ? "tag-ok" : "tag-red"}">${passed ? "Bestanden" : "Nicht bestanden"}</span>
          <h1>${score} von ${total} Punkten</h1>
          <p class="lead">${passed ? "Sehr gut – du bist auf einem guten Weg zum Sanitätsdienst!" : `Zum Bestehen brauchst du ${CONFIG.exam.passPercent} %. Schau dir unten an, was noch fehlt, und übe gezielt.`}
          ${unanswered ? `<br><span class="small muted">${unanswered} Aufgabe(n) wegen Zeitablauf nicht beantwortet.</span>` : ""}</p>
          <div class="hero-actions">
            <button class="btn btn-primary" id="again">${icon("repeat")} Neue Prüfung</button>
            <a class="btn btn-secondary" href="#/">Zum Dashboard</a>
          </div>
        </div>
      </section>
      ${reviewList(results)}`;
    view.querySelector("#again").addEventListener("click", startExam);
  };

  const next = () => {
    if (idx >= items.length) return finish();
    const item = items[idx];
    view.innerHTML = sessionShell("Prüfungssimulation", idx, items.length, `<div class="timer" id="timer">${icon("clock")}<span>${fmt(deadline - Date.now())}</span></div>`);
    renderItem(view.querySelector("#qhost"), item, {
      feedback: false,
      onComplete: (correct, steps) => {
        store.recordItem(item, correct, "exam", steps);
        answers[idx] = { item, correct, steps };
      },
      onNext: () => { idx++; next(); window.scrollTo(0, 0); },
    });
  };

  clearTimer();
  timer = setInterval(() => {
    const left = deadline - Date.now();
    const t = document.querySelector("#timer span");
    if (t) t.textContent = fmt(left);
    document.getElementById("timer")?.classList.toggle("warn", left < 5 * 60000);
    if (left <= 0) finish();
  }, 1000);
  next();
}

/* ---------------- Merkkarten ---------------- */

function cardsView() {
  view.innerHTML = `
    <div class="page-head"><h1>Merkkarten</h1><p class="muted">Die wichtigsten Werte und Schemata zum schnellen Nachschlagen.</p></div>
    <section class="memo-grid">${DATA.cards.map((c) => `
      <article class="card memo">
        <h2>${esc(c.title)}</h2>
        ${c.rows ? `<table class="memo-table">${c.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>` : ""}
        ${c.items ? `<ul class="memo-list">${c.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        ${c.note ? `<p class="small muted">${esc(c.note)}</p>` : ""}
      </article>`).join("")}
    </section>`;
}

/* ---------------- Start ---------------- */

async function init() {
  try {
    await loadData();
  } catch (e) {
    view.innerHTML = `<div class="card empty"><h2>Fehler beim Laden</h2><p class="muted">${esc(e.message)}</p></div>`;
    return;
  }
  document.body.classList.remove("loading");
  window.addEventListener("hashchange", route);
  window.addEventListener("online", () => sync.flush().then(renderSyncStatus));
  route();
  sync.flush().then(renderSyncStatus);
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
