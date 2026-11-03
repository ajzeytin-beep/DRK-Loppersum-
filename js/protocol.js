// Protokoll-Übung: SAN-Protokoll zu einem Einsatz ausfüllen und mit der Musterlösung vergleichen.
import { DATA } from "./data.js";
import * as store from "./store.js";
import { esc } from "./quiz.js";
import { icon } from "./icons.js";

const pct = (x) => `${Math.round((x || 0) * 100)} %`;
const VITAL_ROWS = [
  ["time", "Uhrzeit", "text", "hh:mm"],
  ["af", "AF /min", "numeric", ""],
  ["puls", "Puls /min", "numeric", ""],
  ["rr", "RR (mmHg)", "text", "120/80"],
  ["spo2", "SpO₂ (%)", "numeric", ""],
  ["temp", "Temp. (°C)", "decimal", ""],
];

/* ---------------- Übersicht ---------------- */

export function renderProtocolList(view) {
  const p = store.getState().progress;
  view.innerHTML = `
    <div class="page-head">
      <h1>SAN-Protokoll üben</h1>
      <p class="muted">Lies den Einsatz, fülle das Protokoll aus – Kreuze, Messwerte, Zeiten – und vergleiche danach mit der Musterlösung. So sitzt die Dokumentation im echten Sanitätsdienst.</p>
    </div>
    <section class="levels">${DATA.protocol.scenarios.map((s) => {
      const r = p[s.id];
      const done = r?.last === true;
      return `
        <a class="level-card ${done ? "done" : ""}" href="#/protokoll/${s.id}">
          <div class="level-num">${done ? icon("check") : icon("list")}</div>
          <div class="level-body">
            <h3>${esc(s.title)}</h3>
            <p>${esc(s.scenario.slice(0, 110))}…</p>
            <div class="level-foot"><span>${r ? `${r.seen}× geübt` : "Noch nicht geübt"}</span><strong>${r ? (done ? "bestanden" : "nochmal üben") : ""}</strong></div>
          </div>
        </a>`;
    }).join("")}</section>
    <section class="card" style="margin-top:1.25rem">
      <h2>Tipps zum Ausfüllen</h2>
      <ul class="memo-list">
        <li>Uhrzeiten sofort notieren – Aufnahme, Blutstillung/Tourniquet, Messungen, Übergabe.</li>
        <li>Nur ankreuzen, was du wirklich festgestellt oder getan hast. „Unauffällig“ nur, wenn in diesem Abschnitt nichts auffällig ist.</li>
        <li>Messwerte immer mit Uhrzeit – so sieht der Rettungsdienst den Verlauf.</li>
        <li>Bei Verzicht auf Transport: aufklären, Erklärung unterschreiben lassen, Durchschlag aushändigen.</li>
      </ul>
    </section>`;
}

/* ---------------- Übung ---------------- */

export function renderProtocolExercise(view, id) {
  const sc = DATA.protocol.scenarios.find((s) => s.id === id);
  if (!sc) { location.hash = "#/protokoll"; return; }
  const cols = Math.max(3, sc.vitals.length);

  const box = ([bid, label]) =>
    `<label class="pbox" data-box="${bid}"><input type="checkbox" name="${bid}"><span class="pmark"></span><span>${esc(label)}</span></label>`;

  const section = (s) => `
    <section class="card psec tone-${s.tone}" data-sec="${s.id}">
      <h3>${esc(s.title)}</h3>
      ${s.groups.map((g) => `
        <div class="pgroup">
          ${g.label ? `<div class="plabel">${esc(g.label)}</div>` : ""}
          <div class="pboxes">${g.boxes.map(box).join("")}</div>
          ${g.time ? `<label class="pfield">${esc(g.time[1])}<input name="${g.time[0]}" inputmode="numeric" placeholder="hh:mm" maxlength="5"></label>` : ""}
          ${g.number ? `<label class="pfield">${esc(g.number[1])}<input name="${g.number[0]}" inputmode="decimal" maxlength="6"></label>` : ""}
        </div>`).join("")}
      <div class="pnote" hidden></div>
    </section>`;

  const form = DATA.protocol.form;
  const byId = Object.fromEntries(form.map((s) => [s.id, s]));

  view.innerHTML = `
    <div class="session protocol">
      <div class="session-head">
        <a href="#/protokoll" class="btn btn-ghost btn-sm">✕ Beenden</a>
        <div class="session-title"><strong>SAN-Protokoll: ${esc(sc.title)}</strong><span class="muted">Übungsversion</span></div>
      </div>

      <article class="card case">
        <div class="q-meta"><span class="tag tag-red">Einsatz</span><span class="tag">SAN-Protokoll</span></div>
        <h2 class="case-title">${esc(sc.title)}</h2>
        <p class="scenario">${esc(sc.scenario)}</p>
        <ol class="psteps">${sc.steps.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
        <p class="small muted">Fülle das Protokoll unten so aus, wie du es im Einsatz tun würdest. Die Freitextfelder werden nicht bewertet – du siehst danach eine Musterformulierung.</p>
      </article>

      <div id="presult"></div>

      <form id="pform" autocomplete="off">
        <section class="card psec tone-grey">
          <h3>Lage, Notfallgeschehen, Auffindesituation</h3>
          <textarea name="lage" rows="3" placeholder="z. B. Wo? Was ist passiert? Wie habt ihr den Patienten vorgefunden?"></textarea>
          <div class="pmodel" data-model="lage" hidden></div>
        </section>

        ${section(byId.erste)}
        <div class="pgrid">${["ab", "c", "d", "e"].map((k) => section(byId[k])).join("")}</div>

        <section class="card psec tone-blue" data-sec="messwerte">
          <h3>Messwerte</h3>
          <div class="table-wrap">
            <table class="vitals">
              <tbody>${VITAL_ROWS.map(([k, label, mode, ph]) => `
                <tr><th>${label}</th>${Array.from({ length: cols }, (_, i) =>
                  `<td><input name="v_${k}_${i}" inputmode="${mode === "text" ? "text" : mode}" placeholder="${ph}" maxlength="7"></td>`).join("")}</tr>`).join("")}
              </tbody>
            </table>
          </div>
          <div class="pnote" hidden></div>
        </section>

        <div class="pgrid">${["massnahmen", "nachforderung"].map((k) => section(byId[k])).join("")}</div>

        <section class="card psec tone-yellow">
          <h3>Arbeitsdiagnose / Leitsymptom</h3>
          <textarea name="diagnose" rows="2"></textarea>
          <div class="pmodel" data-model="diagnose" hidden></div>
        </section>

        <div class="pgrid">
          <div>
            ${section(byId.uebergabe)}
            <section class="card psec tone-yellow">
              <h3>Übergabe an (wer, Uhrzeit)</h3>
              <input name="uebergabe_an" maxlength="80">
              <div class="pmodel" data-model="uebergabe_an" hidden></div>
            </section>
          </div>
          ${section(byId.erklaerung)}
        </div>

        <div class="q-actions"><button class="btn btn-primary btn-lg" id="pcheck">${icon("check")} Protokoll auswerten</button></div>
      </form>
    </div>`;

  document.body.classList.add("in-session");
  const f = view.querySelector("#pform");

  f.addEventListener("submit", (e) => {
    e.preventDefault();
    evaluate();
  });

  function evaluate() {
    const required = new Set(sc.required);
    const optional = new Set(sc.optional || []);
    let hits = 0; let missed = 0; let wrong = 0;
    const secIssues = {};
    const note = (sec, t) => (secIssues[sec] ||= []).push(t);

    f.querySelectorAll(".pbox").forEach((el) => {
      const idBox = el.dataset.box;
      const checked = el.querySelector("input").checked;
      const sec = el.closest("[data-sec]").dataset.sec;
      el.classList.remove("ok", "bad", "miss", "opt");
      if (required.has(idBox)) {
        if (checked) { hits++; el.classList.add("ok"); } else { missed++; el.classList.add("miss"); note(sec, "fehlt"); }
      } else if (optional.has(idBox)) {
        if (checked) el.classList.add("opt");
      } else if (checked) {
        wrong++; el.classList.add("bad"); note(sec, "zu viel");
      }
      el.querySelector("input").disabled = true;
    });

    // Zahlen und Uhrzeiten
    let fieldHits = 0; let fieldTotal = 0;
    const checkField = (name, expected, normalize) => {
      const input = f.elements[name];
      if (!input) return;
      fieldTotal++;
      const val = normalize(input.value);
      const good = val === normalize(String(expected));
      input.classList.add(good ? "ok" : "bad");
      if (good) fieldHits++;
      else input.insertAdjacentHTML("afterend", `<span class="psol">richtig: ${esc(String(expected))}</span>`);
      input.disabled = true;
    };
    const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? String(n) : ""; };
    const txt = (v) => String(v).trim().replace(/\s+/g, "").replace(".", ":");
    for (const [k, v] of Object.entries(sc.numbers || {})) checkField(k, v, num);
    for (const [k, v] of Object.entries(sc.times || {})) checkField(k, v, txt);
    sc.vitals.forEach((v, i) => {
      for (const [k] of VITAL_ROWS) {
        if (v[k] == null) continue;
        checkField(`v_${k}_${i}`, v[k], k === "time" || k === "rr" ? txt : num);
      }
    });
    f.querySelectorAll("input:not([disabled]), textarea").forEach((el) => { el.readOnly = true; });

    const total = required.size + wrong + fieldTotal;
    const score = total ? (hits + fieldHits) / total : 1;
    const passed = score >= 0.8;
    store.recordItem({ id: sc.id, type: "protocol", topic: "protokoll", level: 4 }, passed, "protocol");

    // Hinweise je Abschnitt
    f.querySelectorAll("[data-sec]").forEach((secEl) => {
      const sid = secEl.dataset.sec;
      const issues = secIssues[sid];
      const n = sc.notes?.[sid];
      const box = secEl.querySelector(".pnote");
      if (!box || (!issues && !n)) return;
      box.hidden = false;
      box.className = `pnote ${issues ? "bad" : "ok"}`;
      box.innerHTML = `${issues ? `<strong>${issues.includes("fehlt") ? "Es fehlt etwas" : ""}${issues.includes("fehlt") && issues.includes("zu viel") ? " · " : ""}${issues.includes("zu viel") ? "Etwas ist zu viel angekreuzt" : ""}</strong>` : "<strong>✓ Passt</strong>"}${n ? `<p>${esc(n)}</p>` : ""}`;
    });
    f.querySelectorAll("[data-model]").forEach((el) => {
      const m = sc.model?.[el.dataset.model];
      if (!m) return;
      el.hidden = false;
      el.innerHTML = `<span class="small muted">Musterformulierung:</span> ${esc(m)}`;
    });
    f.querySelector(".q-actions").innerHTML = `
      <button type="button" class="btn btn-secondary" id="pagain">${icon("repeat")} Nochmal ausfüllen</button>
      <a class="btn btn-primary" href="#/protokoll">Weitere Einsätze</a>`;
    f.querySelector("#pagain").addEventListener("click", () => { renderProtocolExercise(view, id); window.scrollTo(0, 0); });

    const res = view.querySelector("#presult");
    res.innerHTML = `
      <section class="card result presult">
        <div>
          <span class="tag ${passed ? "tag-ok" : "tag-red"}">${passed ? "Gut dokumentiert" : "Nochmal üben"}</span>
          <h2>${pct(score)} richtig</h2>
          <p class="lead">${hits} von ${required.size} nötigen Kreuzen gesetzt · ${missed} fehlen · ${wrong} zu viel · ${fieldHits} von ${fieldTotal} Werten und Zeiten korrekt.</p>
          <div class="plegend">
            <span class="pbox ok"><span class="pmark"></span>richtig angekreuzt</span>
            <span class="pbox miss"><span class="pmark"></span>fehlt</span>
            <span class="pbox bad"><span class="pmark"></span>zu viel</span>
            <span class="pbox opt"><span class="pmark"></span>kann man so machen</span>
          </div>
        </div>
      </section>`;
    res.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
