import { CONFIG } from "./config.js";
import * as store from "./store.js";
import { DATA, loadData, topicLabel } from "./data.js";
import { renderItem, answerText, esc, shuffle } from "./quiz.js";
import * as sync from "./sync.js";
import { renderInstructor } from "./instructor.js";
import * as auth from "./auth.js";
import { icon } from "./icons.js";
import { renderProtocolList, renderProtocolExercise } from "./protocol.js";

const view = document.getElementById("view");
let timer = null;

/* ---------------- Hilfsfunktionen ---------------- */

const pctText = (x) => `${Math.round((x || 0) * 100)} %`;

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
  { href: "#/ausbilder", label: "Ausbilder", icon: "users", instructorOnly: true },
  { href: "#/", label: "Dashboard", icon: "home" },
  { href: "#/wiederholen", label: "Wiederholen", icon: "repeat", learnerOnly: true },
  { href: "#/pruefung", label: "Prüfung", icon: "award" },
  { href: "#/merkkarten", label: "Merkkarten", icon: "cards" },
  { href: "#/profil", label: "Profil", icon: "user" },
];

const isAdmin = () => store.getState().profile?.role === "instructor";

function renderNav() {
  const hash = location.hash || "#/";
  const admin = isAdmin();
  const items = NAV.filter((n) => (admin ? !n.learnerOnly : !n.instructorOnly));
  const isActive = (href) =>
    href === "#/" ? hash === "#/" || hash.startsWith("#/lernen") || hash.startsWith("#/thema") || hash.startsWith("#/protokoll") : hash.startsWith(href);
  const link = (n) => `<a href="${n.href}" class="${isActive(n.href) ? "active" : ""}">${icon(n.icon)}<span>${n.label}</span></a>`;
  document.getElementById("nav").innerHTML = items.map(link).join("");
  const bottom = items.slice(0, 5);
  document.getElementById("bottom-nav").innerHTML = bottom.map(link).join("");
  document.getElementById("bottom-nav").style.gridTemplateColumns = `repeat(${bottom.length}, 1fr)`;
  renderSyncStatus();
}

const ROLE_LABEL = { learner: "Teilnehmer", instructor: "Ausbilder", pending: "wartet auf Freigabe", rejected: "gesperrt" };

function renderSyncStatus() {
  const el = document.getElementById("sync-status");
  const p = store.getState().profile;
  if (!p) { el.innerHTML = ""; return; }
  let status = ROLE_LABEL[p.role] || "";
  if (p.role === "learner") {
    const pending = sync.pendingCount();
    status = pending ? `${pending} Antworten werden noch übertragen` : "Fortschritt übertragen";
  }
  el.innerHTML = `
    <div class="me">${icon(p.role === "instructor" ? "shield" : "user")}<div><strong>${esc(p.name)}</strong>
      ${p.courseCode ? `<span>Kurs ${esc(p.courseCode)}</span>` : ""}<span class="small">${esc(status)}</span></div></div>
    <a class="logout-link" href="#/abmelden">${icon("logout")} Abmelden</a>`;
}

async function logoutAll() {
  await Promise.race([sync.flush(), new Promise((r) => setTimeout(r, 3000))]);
  await auth.signOut();
  store.logout();
  location.hash = "#/start";
}

const ROUTES = [
  [/^#\/?$/, () => dashboard()],
  [/^#\/start(?:\/([\w-]+))?$/, (m) => loginView(m[1] || "anmelden")],
  [/^#\/abmelden$/, () => logoutAll()],
  [/^#\/lernen\/([1-4])$/, (m) => learnLevel(Number(m[1]))],
  [/^#\/protokoll$/, () => renderProtocolList(view)],
  [/^#\/protokoll\/([\w-]+)$/, (m) => renderProtocolExercise(view, m[1])],
  [/^#\/thema\/([\w-]+)$/, (m) => topicTraining(m[1])],
  [/^#\/wiederholen$/, () => review()],
  [/^#\/pruefung$/, () => examIntro()],
  [/^#\/merkkarten$/, () => cardsView()],
  [/^#\/ausbilder$/, () => (isAdmin() ? renderInstructor(view) : (location.hash = "#/"))],
  [/^#\/profil$/, () => profileView()],
];

// Rücksprung aus E-Mail-Link (Bestätigung oder „Passwort vergessen“) auswerten
async function processRedirect() {
  const redirect = await auth.handleRedirect();
  if (!redirect) return null;
  if (redirect.error) { loginNotice = redirect.error; location.hash = "#/start/anmelden"; return redirect; }
  try { await sync.refreshAccount(); } catch { /* wird beim nächsten Start erneut versucht */ }
  location.hash = redirect.type === "recovery" ? "#/start/neues-passwort" : isAdmin() ? "#/ausbilder" : "#/";
  return redirect;
}

function route() {
  clearTimer();
  const hash = location.hash || "#/";
  if (/access_token=|error_description=/.test(hash)) { processRedirect(); return; }
  const loggedIn = Boolean(auth.getSession() && store.getState().profile);
  if (!loggedIn && !/^#\/start/.test(hash)) {
    location.hash = "#/start";
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

/* ---------------- Anmeldung ---------------- */

// Kurscode aus dem Einladungslink (…/teilnehmer/?kurs=LOP-2026)
function inviteCode() {
  try { return (new URLSearchParams(location.search).get("kurs") || "").trim().toUpperCase().slice(0, 20); } catch { return ""; }
}

const pwField = (name, label, auto, extra = "") => `
  <label><span>${label}</span>
    <span class="pw-wrap">
      <input name="${name}" type="password" autocomplete="${auto}" required ${extra}>
      <button type="button" class="pw-toggle" aria-label="Passwort anzeigen">${icon("eye")}</button>
    </span>
  </label>`;

function bindPwToggles(root) {
  root.querySelectorAll(".pw-toggle").forEach((b) => b.addEventListener("click", () => {
    const input = b.previousElementSibling;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    b.setAttribute("aria-label", show ? "Passwort verbergen" : "Passwort anzeigen");
    b.classList.toggle("on", show);
  }));
}

let loginNotice = null; // Meldung für die Anmeldeseite (z. B. nach E-Mail-Bestätigung)

// Nach erfolgreicher Anmeldung: Konto laden und passende Startseite öffnen
async function afterLogin() {
  const profile = await sync.refreshAccount();
  if (profile.role === "rejected") {
    await auth.signOut();
    store.logout();
    throw new Error("Dein Konto wurde nicht freigegeben. Bitte wende dich an deinen Ausbilder.");
  }
  sync.flush().then(renderSyncStatus);
  location.hash = profile.role === "instructor" ? "#/ausbilder" : "#/";
}

function loginView(tab) {
  // alte Links (#/start/teilnehmer, #/start/ausbilder) weiter unterstützen
  if (tab === "teilnehmer") tab = inviteCode() ? "registrieren" : "anmelden";
  if (tab === "ausbilder") tab = "anmelden";
  const loggedIn = Boolean(auth.getSession() && store.getState().profile);
  if (loggedIn && tab !== "neues-passwort") { location.hash = isAdmin() ? "#/ausbilder" : "#/"; return; }
  document.body.classList.add("auth");

  if (!sync.backendEnabled()) {
    view.innerHTML = '<div class="auth-wrap"><div class="card auth-card"><p class="form-error">Die Anmeldung ist noch nicht eingerichtet (Supabase-Zugang fehlt in js/config.js).</p></div></div>';
    return;
  }

  const tabs = tab === "anmelden" || tab === "registrieren";
  view.innerHTML = `
    <div class="auth-wrap">
      <div class="card auth-card">
        <div class="auth-logo"><img src="assets/logo-ov.png" alt="DRK OV Loppersum" onerror="this.remove()"></div>
        <h1>Sani-Trainer</h1>
        <p class="muted auth-sub">${esc(CONFIG.orgName)} · Sanitätsausbildung</p>
        ${tabs ? `
          <nav class="seg" aria-label="Anmelden oder registrieren">
            <a href="#/start/anmelden" class="${tab === "anmelden" ? "active" : ""}">${icon("login")} Anmelden</a>
            <a href="#/start/registrieren" class="${tab === "registrieren" ? "active" : ""}">${icon("user")} Registrieren</a>
          </nav>` : ""}
        ${loginNotice ? `<p class="form-ok-box">${esc(loginNotice)}</p>` : ""}
        <div id="auth-body"></div>
      </div>
    </div>`;
  loginNotice = null;
  const body = view.querySelector("#auth-body");
  ({ anmelden: signInForm, registrieren: signUpForm, passwort: forgotForm, "neues-passwort": newPasswordForm }[tab] || signInForm)(body);
  bindPwToggles(body);
}

function formHelpers(f) {
  const err = f.querySelector(".form-error");
  const btn = f.querySelector(".btn-primary");
  const label = btn.innerHTML;
  return {
    busy(on, text = "Bitte warten …") { btn.disabled = on; btn.innerHTML = on ? text : label; },
    fail(msg) { err.textContent = msg; err.hidden = false; },
    clear() { err.hidden = true; },
  };
}

function signInForm(body) {
  body.innerHTML = `
    <form class="form" id="signin">
      <label>E-Mail<input name="email" type="email" autocomplete="email" required maxlength="120"></label>
      ${pwField("password", "Passwort", "current-password")}
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-lg">${icon("login")} Anmelden</button>
      <a class="link-center" href="#/start/passwort">Passwort vergessen?</a>
    </form>
    <p class="small muted auth-note">Noch kein Konto? Wähle oben <strong>„Registrieren“</strong>. Ausbilder melden sich hier genauso an.</p>`;
  const f = body.querySelector("#signin");
  const h = formHelpers(f);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    h.clear();
    h.busy(true, "Anmelden …");
    try {
      await auth.signIn(f.email.value, f.password.value);
      await afterLogin();
    } catch (ex) {
      h.fail(ex.message);
      h.busy(false);
      f.password.value = "";
      f.password.focus();
    }
  });
  f.email.focus();
}

function signUpForm(body) {
  const code = inviteCode();
  body.innerHTML = `
    <form class="form" id="signup">
      <label>Vor- und Nachname<input name="name" required maxlength="40" autocomplete="name"></label>
      <label>E-Mail<input name="email" type="email" autocomplete="email" required maxlength="120"></label>
      ${pwField("password", "Passwort <span class=\"muted\">(mindestens 8 Zeichen)</span>", "new-password", 'minlength="8"')}
      <label><span>Kurscode <span class="muted">(steht in der Einladung deines Ausbilders)</span></span>
        <input name="code" maxlength="20" autocomplete="off" autocapitalize="characters" value="${esc(code)}">
      </label>
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-lg">${icon("user")} Konto erstellen</button>
    </form>
    <p class="small muted auth-note">Nach der Registrierung kannst du sofort lernen. Dein Ausbilder gibt dein Konto frei – ab dann sieht er deinen Namen, deine Antworten und Prüfungsergebnisse, um dich gezielt zu unterstützen.</p>`;
  const f = body.querySelector("#signup");
  const h = formHelpers(f);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    h.clear();
    if (f.password.value.length < 8) { h.fail("Das Passwort muss mindestens 8 Zeichen haben."); return; }
    h.busy(true, "Konto wird erstellt …");
    try {
      const res = await auth.signUp(f.email.value, f.password.value, f.name.value, f.code.value);
      if (res.needsConfirmation) {
        body.innerHTML = `
          <div class="auth-done">
            ${icon("check", "icon icon-xl")}
            <h2>Fast geschafft!</h2>
            <p class="muted">Wir haben dir eine E-Mail an <strong>${esc(f.email.value)}</strong> geschickt. Bitte klicke auf den Link darin, um dein Konto zu bestätigen. Danach kannst du dich anmelden.</p>
            <a class="btn btn-secondary" href="#/start/anmelden">Zur Anmeldung</a>
          </div>`;
        return;
      }
      await afterLogin();
    } catch (ex) {
      h.fail(ex.message);
      h.busy(false);
    }
  });
  f.name.focus();
}

function forgotForm(body) {
  body.innerHTML = `
    <form class="form" id="forgot">
      <h2 class="auth-h2">Passwort vergessen</h2>
      <p class="muted auth-lead">Gib deine E-Mail-Adresse ein. Du bekommst einen Link, mit dem du ein neues Passwort festlegen kannst.</p>
      <label>E-Mail<input name="email" type="email" autocomplete="email" required maxlength="120"></label>
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-lg">Link anfordern</button>
      <a class="link-center" href="#/start/anmelden">Zurück zur Anmeldung</a>
    </form>
    <p class="small muted auth-note">Keine E-Mail bekommen? Schau im Spam-Ordner nach – oder bitte deinen Ausbilder, dir ein neues Passwort zu setzen.</p>`;
  const f = body.querySelector("#forgot");
  const h = formHelpers(f);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    h.clear();
    h.busy(true, "Wird gesendet …");
    try {
      await auth.requestPasswordReset(f.email.value);
      loginNotice = `Falls ein Konto mit ${f.email.value} existiert, ist eine E-Mail unterwegs. Bitte folge dem Link darin.`;
      location.hash = "#/start/anmelden";
    } catch (ex) {
      h.fail(ex.message);
      h.busy(false);
    }
  });
  f.email.focus();
}

function newPasswordForm(body) {
  if (!auth.getSession()) { location.hash = "#/start/passwort"; return; }
  body.innerHTML = `
    <form class="form" id="newpw">
      <h2 class="auth-h2">Neues Passwort festlegen</h2>
      ${pwField("password", "Neues Passwort <span class=\"muted\">(mindestens 8 Zeichen)</span>", "new-password", 'minlength="8"')}
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-lg">Passwort speichern</button>
    </form>`;
  const f = body.querySelector("#newpw");
  const h = formHelpers(f);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    h.clear();
    if (f.password.value.length < 8) { h.fail("Das Passwort muss mindestens 8 Zeichen haben."); return; }
    h.busy(true, "Speichern …");
    try {
      await auth.updatePassword(f.password.value);
      await afterLogin();
    } catch (ex) {
      h.fail(ex.message);
      h.busy(false);
    }
  });
  f.password.focus();
}

/* ---------------- Profil ---------------- */

function profileView() {
  const st = store.getState();
  const p = st.profile;
  let statusHtml;
  if (p.role === "instructor") {
    statusHtml = `<p class="muted">Du bist als <strong>Ausbilder</strong> für den Kurs <strong>${esc(p.courseName || p.courseCode || "–")}</strong> angemeldet.</p>
      <a class="btn btn-secondary" href="#/ausbilder">${icon("users")} Zum Ausbilder-Bereich</a>`;
  } else if (p.role === "learner") {
    statusHtml = `<p class="muted">Dein Konto ist für den Kurs <strong>${esc(p.courseName || p.courseCode)}</strong> freigegeben. Dein Fortschritt wird automatisch übertragen – auch auf andere Geräte, wenn du dich dort anmeldest.</p>
      <button class="btn btn-secondary" id="sync-now">${icon("cloud")} Jetzt übertragen</button>
      <p class="small muted" id="sync-msg">${st.lastSync ? `Zuletzt: ${new Date(st.lastSync).toLocaleString("de-DE")}` : ""}</p>`;
  } else {
    statusHtml = `<p class="notice">${icon("clock")} Dein Konto wartet noch auf die Freigabe durch deinen Ausbilder${p.courseCode ? ` (Kurs ${esc(p.courseCode)})` : ""}. Du kannst trotzdem schon lernen – dein Fortschritt wird nach der Freigabe automatisch übertragen.</p>
      <button class="btn btn-secondary" id="check-status">${icon("repeat")} Status prüfen</button>`;
  }

  view.innerHTML = `
    <div class="page-head"><h1>Profil & Einstellungen</h1></div>
    <div class="grid-2">
      <section class="card">
        <h2>Dein Konto</h2>
        <form class="form" id="name-form">
          <label>Vor- und Nachname<input name="name" required maxlength="40" value="${esc(p.name)}"></label>
          ${p.role === "pending" ? `<label>Kurscode<input name="code" maxlength="20" autocapitalize="characters" value="${esc(p.courseCode || "")}"></label>` : ""}
          <p class="small muted">E-Mail: ${esc(p.email || auth.getUser()?.email || "–")}</p>
          <p class="form-error" hidden></p>
          <button class="btn btn-primary">Speichern</button>
          <p class="form-ok small" hidden>Gespeichert ✓</p>
        </form>
        <hr>
        <h2>Passwort ändern</h2>
        <form class="form" id="pw-form">
          ${pwField("password", "Neues Passwort <span class=\"muted\">(mindestens 8 Zeichen)</span>", "new-password", 'minlength="8"')}
          <p class="form-error" hidden></p>
          <button class="btn btn-secondary">Passwort ändern</button>
          <p class="form-ok small" hidden>Passwort geändert ✓</p>
        </form>
      </section>
      <section class="card">
        <h2>Status</h2>
        ${statusHtml}
        ${p.role !== "instructor" ? `
          <hr>
          <h2>Lernpfad</h2>
          <label class="switch"><input type="checkbox" id="unlock" ${st.settings.unlockAll ? "checked" : ""}><span></span> Alle Stufen freischalten</label>
          <p class="small muted">Normalerweise wird eine Stufe freigeschaltet, wenn du ${Math.round(CONFIG.unlockThreshold * 100)} % der vorherigen sicher beherrschst.</p>` : ""}
        <hr>
        <div class="invite-actions">
          <a class="btn btn-secondary" href="#/abmelden">${icon("logout")} Abmelden</a>
          <button class="btn btn-danger-ghost btn-sm" id="delete-account">Konto löschen</button>
        </div>
      </section>
    </div>`;
  bindPwToggles(view);

  const nameForm = view.querySelector("#name-form");
  nameForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = nameForm.querySelector(".form-error");
    err.hidden = true;
    try {
      await sync.updateMyProfile(nameForm.name.value, nameForm.code?.value || null);
      await sync.refreshAccount();
      nameForm.querySelector(".form-ok").hidden = false;
      renderNav();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  const pwForm = view.querySelector("#pw-form");
  pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = pwForm.querySelector(".form-error");
    err.hidden = true;
    if (pwForm.password.value.length < 8) { err.textContent = "Das Passwort muss mindestens 8 Zeichen haben."; err.hidden = false; return; }
    try {
      await auth.updatePassword(pwForm.password.value);
      pwForm.password.value = "";
      pwForm.querySelector(".form-ok").hidden = false;
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  view.querySelector("#sync-now")?.addEventListener("click", async () => {
    const msg = view.querySelector("#sync-msg");
    msg.textContent = "Übertrage …";
    const r = await sync.flush();
    msg.textContent = r.error ? `Fehler: ${r.error}` : r.skipped ? "Gerade nicht möglich – bist du online?" : "Alles übertragen ✓";
    renderSyncStatus();
  });
  view.querySelector("#check-status")?.addEventListener("click", async () => {
    try { await sync.refreshAccount(); } catch { /* offline */ }
    await sync.flush();
    profileView();
    renderNav();
  });
  view.querySelector("#unlock")?.addEventListener("change", (e) => store.setSetting("unlockAll", e.target.checked));
  view.querySelector("#delete-account").addEventListener("click", async () => {
    if (!confirm("Konto wirklich löschen?\n\nDein Konto und dein gesamter Lernfortschritt werden dauerhaft gelöscht.")) return;
    try {
      await sync.deleteMyAccount();
      await auth.signOut();
      store.logout();
      loginNotice = "Dein Konto wurde gelöscht.";
      location.hash = "#/start";
    } catch (ex) { alert(`Löschen fehlgeschlagen: ${ex.message}`); }
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

  const waiting = st.profile?.role === "pending"
    ? `<p class="notice pending-note">${icon("clock")} <span>Dein Konto wartet noch auf die Freigabe durch deinen Ausbilder. Du kannst schon lernen – dein Fortschritt wird danach automatisch übertragen.</span></p>`
    : "";
  view.innerHTML = `
    ${waiting}
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
    <section class="levels">${DATA.levels.map(levelCard).join("")}
      <a class="level-card protocol-card" href="#/protokoll">
        <div class="level-num">${icon("list")}</div>
        <div class="level-body">
          <h3>SAN-Protokoll üben</h3><p>Einsätze lesen, Protokoll ausfüllen und mit der Musterlösung vergleichen.</p>
          <div class="level-foot"><span>${DATA.protocol.scenarios.filter((x) => p[x.id]?.last === true).length} / ${DATA.protocol.scenarios.length} sicher</span><strong>${icon("play", "icon icon-sm")}</strong></div>
        </div>
      </a>
    </section>

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
    <div class="page-head"><h1>Merkkarten</h1><p class="muted">Die wichtigsten Werte und Schemata zum schnellen Nachschlagen.</p>
      ${store.getState().profile ? `<a class="btn btn-secondary btn-sm" href="#/protokoll">${icon("list")} SAN-Protokoll üben</a>` : ""}</div>
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

  // Rückkehr aus einem E-Mail-Link (Bestätigung oder Passwort vergessen)
  const redirect = sync.backendEnabled() && /access_token=|error_description=/.test(location.hash) ? await auth.handleRedirect() : null;
  if (redirect?.error) loginNotice = redirect.error;

  // Bestehende Sitzung: Konto laden (offline mit dem zuletzt bekannten Stand weiterarbeiten)
  if (auth.getSession()) {
    try {
      await sync.refreshAccount();
      if (store.getState().profile?.role === "rejected") throw new Error("gesperrt");
    } catch (e) {
      const sameUser = store.getState().profile?.id === auth.getUser()?.id;
      if (!navigator.onLine && sameUser) { /* offline weiterlernen */ }
      else if (e.offline && sameUser) { /* Server nicht erreichbar */ }
      else { await auth.signOut(); store.logout(); }
    }
  } else if (store.getState().profile) {
    store.logout(); // Lernstand aus der Zeit vor den Konten – Anmeldung erforderlich
  }

  if (redirect?.type === "recovery") location.hash = "#/start/neues-passwort";
  else if (redirect?.type && auth.getSession()) location.hash = isAdmin() ? "#/ausbilder" : "#/";

  window.addEventListener("hashchange", route);
  window.addEventListener("online", () => sync.flush().then(renderSyncStatus));
  route();
  sync.flush().then(renderSyncStatus);
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
