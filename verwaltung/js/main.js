// Vereinsverwaltung DRK OV Loppersum: Anmeldung, Navigation, Übersicht
import { CONFIG } from "../../js/config.js";
import * as auth from "../../js/auth.js";
import { icon } from "../../js/icons.js";
import * as api from "./api.js";
import { ctx, data } from "./api.js";
import { esc, money, dateDE, balance, totals, yearOf, AREAS, ROLES, ACCOUNT_KINDS, memberName, age, busy, toast, drinksStatus } from "./util.js";
import * as kasse from "./kasse.js";
import * as mitglieder from "./mitglieder.js";
import * as abschluss from "./abschluss.js";
import * as admin from "./admin.js";

const view = document.getElementById("view");

const NAV = [
  { id: "uebersicht", label: "Übersicht", icon: "home" },
  { id: "kasse", label: "Kassenbuch", icon: "book" },
  { id: "buchung", label: "Buchen", icon: "plus", write: true },
  { id: "mitglieder", label: "Mitglieder", icon: "users" },
  { id: "abschluss", label: "Jahresabschluss", icon: "printer" },
  { id: "konten", label: "Konten", icon: "bank" },
  { id: "zugaenge", label: "Zugänge", icon: "shield", admin: true },
  { id: "profil", label: "Mein Zugang", icon: "user" },
];
const BOTTOM = ["uebersicht", "kasse", "buchung", "mitglieder", "mehr"];

const ROUTES = {
  uebersicht: renderOverview,
  kasse: kasse.renderBook,
  buchung: kasse.renderForm,
  mitglieder: mitglieder.renderList,
  mitglied: mitglieder.renderForm,
  import: mitglieder.renderImport,
  abschluss: abschluss.render,
  konten: admin.renderAccounts,
  zugaenge: admin.renderUsers,
  profil: renderProfile,
  mehr: renderMore,
};

/* ---------------- Start ---------------- */

async function start() {
  const redirect = await auth.handleRedirect().catch(() => null);
  if (redirect?.error) toast(redirect.error, "error");
  if (redirect?.type === "recovery") return renderNewPassword();
  await enter();
}

async function enter() {
  document.body.classList.remove("loading");
  if (!auth.authEnabled()) return renderMessage("Nicht eingerichtet", "In js/config.js fehlen die Supabase-Angaben.");
  if (!auth.getSession()) return renderLogin();
  try {
    api.setMe(await api.me());
  } catch (e) {
    if (/abgelaufen|Nicht angemeldet|JWT/i.test(e.message)) { await auth.signOut(); return renderLogin(); }
    return renderMessage("Keine Verbindung", e.message, true);
  }
  if (ctx.me.role === "pending") return renderPending();
  try {
    await api.reload();
  } catch (e) {
    return renderMessage("Daten konnten nicht geladen werden", e.message, true);
  }
  document.body.classList.add("signed-in");
  renderNav();
  route();
}

window.addEventListener("hashchange", () => { if (ctx.me && ctx.me.role !== "pending") route(); });

// Klick auf einen Link zur gerade offenen Seite: neu aufbauen (z. B. „Buchen“ nach dem Speichern)
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || !ctx.me || ctx.me.role === "pending") return;
  if (a.getAttribute("href") === location.hash) { e.preventDefault(); route(); }
});

// Nach längerer Pause automatisch neu laden (z. B. wenn Kassenwart und Vorsitz gleichzeitig buchen)
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !ctx.me || ctx.me.role === "pending") return;
  if (Date.now() - data.loadedAt < 60000) return;
  if (document.querySelector("form.dirty, dialog[open]")) return;
  try { await api.reload(); route(); } catch { /* offline – alter Stand bleibt */ }
});

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = h.split("?");
  const [page, ...rest] = path.split("/");
  return { page: page || "uebersicht", arg: rest.join("/"), params: new URLSearchParams(query) };
}

async function route() {
  const { page, arg, params } = parseHash();
  let fn = ROUTES[page] || renderOverview;
  if (NAV.find((n) => n.id === page)?.admin && !ctx.isAdmin) fn = renderOverview;
  if (NAV.find((n) => n.id === page)?.write && !ctx.canWrite) fn = renderOverview;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const id = a.dataset.nav;
    const active = id === page || (id === "mitglieder" && (page === "mitglied" || page === "import")) ||
      (id === "mehr" && ["abschluss", "konten", "zugaenge", "profil", "mehr"].includes(page));
    a.classList.toggle("active", active);
  });
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    await fn(view, { arg, params });
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><h2>Fehler</h2><p class="form-error">${esc(e.message)}</p></div>`;
  }
}

export const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
export { route };

function renderNav() {
  const items = NAV.filter((n) => (!n.admin || ctx.isAdmin) && (!n.write || ctx.canWrite));
  document.getElementById("nav").innerHTML = items.map((n) => `<a href="#/${n.id}" data-nav="${n.id}">${icon(n.icon)}<span>${n.label}</span></a>`).join("");
  const bottom = BOTTOM.filter((id) => id !== "buchung" || ctx.canWrite).map((id) => (id === "mehr" ? { id, label: "Mehr", icon: "more" } : NAV.find((n) => n.id === id)));
  const bn = document.getElementById("bottom-nav");
  bn.style.gridTemplateColumns = `repeat(${bottom.length}, 1fr)`;
  bn.innerHTML = bottom.map((n) => `<a href="#/${n.id}" data-nav="${n.id}" class="${n.id === "buchung" ? "bn-plus" : ""}">${icon(n.icon)}<span>${n.label}</span></a>`).join("");
  document.getElementById("me-box").innerHTML = `<a class="me" href="#/profil">${icon("user")}<div><strong>${esc(ctx.me.name || ctx.me.email)}</strong><span>${esc(ROLES[ctx.me.role] || ctx.me.role)}</span></div></a>`;
}

/* ---------------- Übersicht ---------------- */

function renderOverview(el) {
  const year = new Date().getFullYear();
  const yb = data.bookings.filter((b) => yearOf(b.booking_date) === year);
  const area = (a) => totals(yb.filter((b) => b.area === a));
  const g = area("getraenke");
  const v = area("verein");
  const accs = data.accounts.filter((a) => a.active || balance({ accountId: a.id }) !== 0);

  const members = data.members.filter((m) => !m.exit_date);
  const withFee = members.filter((m) => m.drinks_fee_cents > 0);
  const open = withFee.filter((m) => drinksStatus(m, year).open > 0);

  el.innerHTML = `
    <div class="page-head">
      <span class="eyebrow">Vereinsverwaltung</span>
      <h1>Moin${ctx.me.name ? `, ${esc(ctx.me.name.split(" ")[0])}` : ""}!</h1>
      ${ctx.canWrite ? `<div class="hero-actions">
        <a class="btn btn-primary" href="#/buchung?foto=1">${icon("camera")} Beleg fotografieren</a>
        <a class="btn btn-secondary" href="#/buchung">${icon("plus")} Buchung ohne Foto</a>
      </div>` : `<p class="muted">Du hast Lesezugriff als Kassenprüfer.</p>`}
    </div>

    <h2 class="section-title">Kassenstand heute</h2>
    <div class="acc-grid">
      ${accs.map((a) => `
        <a class="card acc-card" href="#/kasse?konto=${a.id}">
          <div class="acc-top">${icon(a.kind === "bank" ? "bank" : "wallet")}<div><strong>${esc(a.name)}</strong><span class="muted small">${ACCOUNT_KINDS[a.kind]}${a.iban ? ` · ${esc(a.iban)}` : ""}</span></div></div>
          <div class="acc-total ${balance({ accountId: a.id }) < 0 ? "bad" : ""}">${money(balance({ accountId: a.id }))}</div>
          <div class="acc-split">
            <span>${AREAS.getraenke}<strong>${money(balance({ accountId: a.id, area: "getraenke" }))}</strong></span>
            <span>${AREAS.verein}<strong>${money(balance({ accountId: a.id, area: "verein" }))}</strong></span>
          </div>
        </a>`).join("") || `<div class="card"><p class="muted">Noch keine Konten. <a class="link" href="#/konten">Konto anlegen</a></p></div>`}
    </div>

    <h2 class="section-title">${year} bisher</h2>
    <div class="grid-2">
      ${[["getraenke", g], ["verein", v]].map(([k, t]) => `
        <a class="card" href="#/kasse?bereich=${k}&jahr=${year}">
          <div class="card-head"><h2>${AREAS[k]}</h2><span class="tag">${money(balance({ area: k }))} Bestand</span></div>
          <div class="sum-row"><span>Einnahmen</span><strong class="good">${money(t.inc)}</strong></div>
          <div class="sum-row"><span>Ausgaben</span><strong class="bad">${money(t.exp)}</strong></div>
          <div class="sum-row total"><span>Ergebnis</span><strong>${money(t.net)}</strong></div>
        </a>`).join("")}
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h2>Letzte Buchungen</h2><a class="link small" href="#/kasse">Alle</a></div>
        ${kasse.miniList(data.bookings.slice().sort((a, b) => b.id - a.id).slice(0, 6))}
      </div>
      <div class="card">
        <div class="card-head"><h2>Mitglieder</h2><a class="link small" href="#/mitglieder">Alle</a></div>
        <div class="sum-row"><span>Aktive Mitglieder</span><strong>${members.length}</strong></div>
        <div class="sum-row"><span>Getränkepauschale ${year} offen</span><strong class="${open.length ? "mid" : "good"}">${open.length} von ${withFee.length}</strong></div>
        ${upcoming(members)}
      </div>
    </div>`;
}

// Geburtstage und Jubiläen der nächsten 30 Tage
function upcoming(members) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const items = [];
  const next = (iso) => {
    const [, m, d] = iso.split("-").map(Number);
    let dt = new Date(now.getFullYear(), m - 1, d);
    if (dt < now) dt = new Date(now.getFullYear() + 1, m - 1, d);
    return dt;
  };
  for (const m of members) {
    if (m.birthday) {
      const dt = next(m.birthday);
      const days = Math.round((dt - now) / 86400000);
      if (days <= 30) items.push({ days, dt, text: `${esc(memberName(m))} wird ${age(m.birthday, new Date(dt.getTime() + 86400000))}`, ic: "cake" });
    }
    if (m.entry_date) {
      const dt = next(m.entry_date);
      const days = Math.round((dt - now) / 86400000);
      const years = dt.getFullYear() - Number(m.entry_date.slice(0, 4));
      if (days <= 30 && years > 0 && (years % 5 === 0)) items.push({ days, dt, text: `${esc(memberName(m))}: ${years} Jahre Mitglied`, ic: "award" });
    }
  }
  items.sort((a, b) => a.days - b.days);
  if (!items.length) return `<p class="muted small" style="margin-top:1rem">Keine Geburtstage oder Jubiläen in den nächsten 30 Tagen.</p>`;
  return `<h3 style="margin-top:1.25rem">Die nächsten 30 Tage</h3><ul class="plain-list">${items.map((i) =>
    `<li>${icon(i.ic)}<span>${i.text}</span><span class="muted small">${i.days === 0 ? "heute" : i.days === 1 ? "morgen" : dateDE(i.dt.toISOString().slice(0, 10)).slice(0, 6)}</span></li>`).join("")}</ul>`;
}

/* ---------------- Mehr / Profil ---------------- */

function renderMore(el) {
  const items = NAV.filter((n) => !["uebersicht", "kasse", "buchung", "mitglieder"].includes(n.id) && (!n.admin || ctx.isAdmin));
  el.innerHTML = `<div class="page-head"><h1>Mehr</h1></div>
    <div class="more-list">${items.map((n) => `<a class="card more-item" href="#/${n.id}">${icon(n.icon)}<span>${n.label}</span></a>`).join("")}
    <a class="card more-item" href="../">${icon("pulse")}<span>Zum Sani-Trainer</span></a></div>`;
}

function renderProfile(el) {
  el.innerHTML = `
    <div class="page-head"><h1>Mein Zugang</h1><p class="muted">${esc(ctx.me.email)} · ${esc(ROLES[ctx.me.role])}</p></div>
    <div class="grid-2">
      <form class="card form" id="f-name">
        <h2>Name</h2>
        <label>Wird bei deinen Buchungen gespeichert<input name="name" required maxlength="60" value="${esc(ctx.me.name)}"></label>
        <button class="btn btn-primary">Speichern</button>
      </form>
      <form class="card form" id="f-pw">
        <h2>Passwort ändern</h2>
        <label>Neues Passwort<input name="pw" type="password" minlength="8" required autocomplete="new-password"></label>
        <button class="btn btn-primary">Passwort ändern</button>
      </form>
    </div>
    <div class="card"><button class="btn btn-danger-ghost" id="logout">${icon("logout")} Abmelden</button></div>`;
  el.querySelector("#f-name").onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const ok = await busy(e.submitter, () => api.updateMyName(name));
    if (ok) { ctx.me.name = name; renderNav(); toast("Name gespeichert"); }
  };
  el.querySelector("#f-pw").onsubmit = async (e) => {
    e.preventDefault();
    const ok = await busy(e.submitter, async () => { await auth.updatePassword(e.target.pw.value); return true; });
    if (ok) { e.target.reset(); toast("Passwort geändert"); }
  };
  el.querySelector("#logout").onclick = logout;
}

async function logout() {
  await auth.signOut();
  api.setMe(null);
  location.hash = "";
  location.reload();
}

/* ---------------- Anmeldung ---------------- */

function shell(inner) {
  document.body.classList.remove("signed-in");
  view.innerHTML = `<div class="onboarding"><div class="card onboarding-card">
    <div class="onb-logos"><img src="../assets/logo-ov.png" alt="DRK OV Loppersum" class="logo" onerror="this.remove()"></div>
    ${inner}</div></div>`;
}

function renderMessage(title, text, retry = false) {
  shell(`<h1>${esc(title)}</h1><p class="muted" style="text-align:center">${esc(text)}</p>
    ${retry ? `<div class="center-row"><button class="btn btn-primary" id="retry">Erneut versuchen</button> <button class="btn btn-ghost" id="out">Abmelden</button></div>` : ""}`);
  view.querySelector("#retry")?.addEventListener("click", enter);
  view.querySelector("#out")?.addEventListener("click", logout);
}

function renderPending() {
  shell(`<h1>Fast geschafft</h1>
    <p style="text-align:center">Dein Zugang <strong>${esc(ctx.me.email)}</strong> wartet auf die Freigabe durch den Admin.</p>
    <p class="muted small" style="text-align:center">Sobald du freigegeben bist, siehst du hier das Kassenbuch und die Mitgliederliste.</p>
    <div class="center-row"><button class="btn btn-primary" id="retry">Erneut prüfen</button> <button class="btn btn-ghost" id="out">Abmelden</button></div>`);
  view.querySelector("#retry").onclick = (e) => busy(e.currentTarget, enter);
  view.querySelector("#out").onclick = logout;
}

function renderLogin(mode = "login") {
  const titles = { login: "Anmelden", register: "Zugang beantragen", reset: "Passwort vergessen" };
  shell(`
    <h1>Vereinsverwaltung</h1>
    <p class="muted" style="text-align:center">Kassenbuch und Mitgliederliste · ${esc(CONFIG.orgName)}</p>
    <div class="seg" role="tablist">
      <button type="button" data-mode="login" class="${mode === "login" ? "on" : ""}">Anmelden</button>
      <button type="button" data-mode="register" class="${mode === "register" ? "on" : ""}">Zugang beantragen</button>
    </div>
    <form class="form" id="auth-form">
      ${mode === "register" ? `<label>Dein Name<input name="name" required maxlength="60" autocomplete="name"></label>` : ""}
      <label>E-Mail<input name="email" type="email" required autocomplete="email"></label>
      ${mode !== "reset" ? `<label>Passwort${mode === "register" ? " (mindestens 8 Zeichen)" : ""}<input name="pw" type="password" required minlength="${mode === "register" ? 8 : 1}" autocomplete="${mode === "register" ? "new-password" : "current-password"}"></label>` : ""}
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-lg">${titles[mode]}</button>
      ${mode === "login" ? `<button type="button" class="btn btn-ghost" data-mode="reset">Passwort vergessen?</button>` : ""}
      ${mode === "reset" ? `<button type="button" class="btn btn-ghost" data-mode="login">Zurück zur Anmeldung</button>` : ""}
    </form>
    ${mode === "register" ? `<p class="muted small">Nach der Registrierung gibt der Admin deinen Zugang frei. Hast du schon ein Konto im Sani-Trainer, melde dich einfach damit an.</p>` : ""}`);
  view.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => renderLogin(b.dataset.mode)));
  const f = view.querySelector("#auth-form");
  const err = f.querySelector(".form-error");
  f.onsubmit = async (e) => {
    e.preventDefault();
    err.hidden = true;
    const btn = e.submitter;
    btn.disabled = true;
    try {
      if (mode === "login") {
        await auth.signIn(f.email.value, f.pw.value);
        await enter();
      } else if (mode === "register") {
        const r = await auth.signUp(f.email.value, f.pw.value, f.name.value, "", { app: "verwaltung" });
        if (r.needsConfirmation) return renderMessage("E-Mail bestätigen", "Wir haben dir eine E-Mail geschickt. Bitte bestätige deine Adresse und melde dich dann an.");
        await enter();
      } else {
        await auth.requestPasswordReset(f.email.value);
        renderMessage("E-Mail verschickt", "Falls es ein Konto mit dieser Adresse gibt, kommt gleich eine E-Mail mit einem Link zum Zurücksetzen. Alternativ kann der Admin helfen.");
      }
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  };
}

function renderNewPassword() {
  document.body.classList.remove("loading");
  shell(`<h1>Neues Passwort</h1><form class="form" id="np">
    <label>Neues Passwort (mindestens 8 Zeichen)<input name="pw" type="password" minlength="8" required autocomplete="new-password"></label>
    <button class="btn btn-primary btn-lg">Speichern</button></form>`);
  view.querySelector("#np").onsubmit = async (e) => {
    e.preventDefault();
    const ok = await busy(e.submitter, async () => { await auth.updatePassword(e.target.pw.value); return true; });
    if (ok) { toast("Passwort gespeichert"); enter(); }
  };
}

start();
