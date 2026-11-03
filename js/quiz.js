// Darstellung und Auswertung einzelner Fragen und Fallbeispiele.
import { topicLabel } from "./data.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function answerText(q) {
  switch (q.type) {
    case "single": return q.options[q.answer];
    case "multi": return q.answer.map((i) => q.options[i]).join(" · ");
    case "truefalse": return q.answer ? "Richtig" : "Falsch";
    case "order": return q.items.map((t, i) => `${i + 1}. ${t}`).join("  ");
    default: return "";
  }
}

const metaHtml = (item, extra = "") =>
  `<div class="q-meta">${extra}<span class="tag">${esc(topicLabel(item.topic))}</span><span class="tag tag-muted">Stufe ${item.level}</span></div>`;

export function renderItem(host, item, opts) {
  if (item.type !== "case") {
    renderQuestion(host, item, { ...opts, meta: metaHtml(item), onComplete: (c) => opts.onComplete?.(c, [c]) });
    return;
  }
  host.innerHTML = `
    <article class="card case">
      ${metaHtml(item, '<span class="tag tag-red">Fallbeispiel</span>')}
      <h2 class="case-title">${esc(item.title)}</h2>
      <p class="scenario">${esc(item.scenario)}</p>
      <div class="case-steps"></div>
    </article>`;
  const stepsEl = host.querySelector(".case-steps");
  const results = [];
  let i = 0;
  const step = () => {
    const s = item.steps[i];
    const last = i === item.steps.length - 1;
    const wrap = document.createElement("section");
    wrap.className = "case-step";
    wrap.innerHTML = `<div class="step-label">Schritt ${i + 1} von ${item.steps.length}</div>
      ${s.situation ? `<p class="situation">${esc(s.situation)}</p>` : ""}<div class="step-q"></div>`;
    stepsEl.appendChild(wrap);
    renderQuestion(wrap.querySelector(".step-q"), s, {
      feedback: opts.feedback,
      embedded: true,
      nextLabel: last ? "Weiter" : "Fall fortsetzen",
      onComplete: (c) => results.push(c),
      onNext: () => {
        wrap.querySelector(".q-actions")?.remove();
        i++;
        if (i < item.steps.length) {
          step();
          stepsEl.lastElementChild.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          opts.onComplete?.(results.every(Boolean), results);
          opts.onNext?.();
        }
      },
    });
  };
  step();
}

export function renderQuestion(host, q, opts) {
  const { feedback = true, onComplete, onNext, embedded = false, meta = "", nextLabel = "Weiter" } = opts;
  const type = q.type;
  let selected = type === "multi" ? new Set() : null;
  let order = [];
  let options = null;
  let orderItems = null;

  if (type === "single" || type === "multi") options = shuffle(q.options.map((text, i) => ({ text, i })));
  if (type === "truefalse") options = [{ text: "Richtig", i: true }, { text: "Falsch", i: false }];
  if (type === "order") {
    do { orderItems = shuffle(q.items.map((text, i) => ({ text, i }))); }
    while (q.items.length > 1 && orderItems.every((o, k) => o.i === k));
  }

  host.innerHTML = `
    <div class="question ${embedded ? "embedded" : "card"}">
      ${meta}
      <h3 class="q-text">${esc(q.question)}</h3>
      ${type === "multi" ? '<p class="hint">Mehrere Antworten sind richtig – wähle alle passenden aus.</p>' : ""}
      ${type === "order" ? '<p class="hint">Tippe die Schritte in der richtigen Reihenfolge an. Nochmal tippen entfernt sie wieder.</p>' : ""}
      <div class="answers ${type === "truefalse" ? "answers-tf" : ""}"></div>
      <div class="feedback" hidden></div>
      <div class="q-actions"><button class="btn btn-primary" data-act="check" disabled>Antwort prüfen</button></div>
    </div>`;

  const root = host.querySelector(".question");
  const answersEl = root.querySelector(".answers");
  const fb = root.querySelector(".feedback");
  const checkBtn = root.querySelector('[data-act="check"]');
  let answered = false;

  const isSel = (i) => (type === "multi" ? selected.has(i) : selected === i);

  function renderAnswers() {
    if (type === "order") {
      const chosen = order.map((i) => orderItems.find((o) => o.i === i));
      const rest = orderItems.filter((o) => !order.includes(o.i));
      answersEl.innerHTML = `
        <div class="order-chosen">${chosen.length
          ? chosen.map((o, k) => `<button class="opt chosen" data-i="${o.i}"><span class="num">${k + 1}</span><span>${esc(o.text)}</span></button>`).join("")
          : '<div class="order-empty">Deine Reihenfolge erscheint hier</div>'}</div>
        ${rest.length ? `<div class="order-pool">${rest.map((o) => `<button class="opt" data-i="${o.i}"><span class="num">+</span><span>${esc(o.text)}</span></button>`).join("")}</div>` : ""}`;
      checkBtn.disabled = order.length !== orderItems.length;
    } else {
      answersEl.innerHTML = options.map((o, k) => `
        <button class="opt ${isSel(o.i) ? "selected" : ""}" data-k="${k}">
          <span class="${type === "multi" ? "box" : "dot"}"></span><span>${esc(o.text)}</span>
        </button>`).join("");
      checkBtn.disabled = type === "multi" ? selected.size === 0 : selected === null;
    }
  }

  answersEl.addEventListener("click", (e) => {
    if (answered) return;
    const b = e.target.closest(".opt");
    if (!b) return;
    if (type === "order") {
      const i = Number(b.dataset.i);
      order = b.classList.contains("chosen") ? order.filter((x) => x !== i) : [...order, i];
    } else {
      const o = options[Number(b.dataset.k)];
      if (type === "multi") selected.has(o.i) ? selected.delete(o.i) : selected.add(o.i);
      else selected = o.i;
    }
    renderAnswers();
  });

  function evaluate() {
    if (type === "single" || type === "truefalse") return selected === q.answer;
    if (type === "multi") {
      const ans = new Set(q.answer);
      return ans.size === selected.size && [...ans].every((i) => selected.has(i));
    }
    if (type === "order") return order.every((i, k) => i === k);
    return false;
  }

  function showFeedback(correct) {
    if (type === "order") {
      answersEl.querySelectorAll(".order-chosen .opt").forEach((b, k) => b.classList.add(Number(b.dataset.i) === k ? "correct" : "wrong"));
    } else {
      answersEl.querySelectorAll(".opt").forEach((b) => {
        const o = options[Number(b.dataset.k)];
        const right = type === "multi" ? q.answer.includes(o.i) : o.i === q.answer;
        if (right) b.classList.add(isSel(o.i) ? "correct" : "missed");
        else if (isSel(o.i)) b.classList.add("wrong");
        else b.classList.add("dim");
      });
    }
    answersEl.classList.add("locked");
    fb.hidden = false;
    fb.className = `feedback ${correct ? "ok" : "bad"}`;
    fb.innerHTML = `
      <div class="fb-title">${correct ? "✓ Richtig!" : "✗ Leider nicht ganz"}</div>
      ${!correct && type === "order" ? `<ol class="fb-order">${q.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>` : ""}
      ${q.explanation ? `<p>${esc(q.explanation)}</p>` : ""}`;
  }

  checkBtn.addEventListener("click", () => {
    if (answered) {
      checkBtn.disabled = true;
      onNext?.();
      return;
    }
    answered = true;
    const correct = evaluate();
    onComplete?.(correct);
    if (!feedback) {
      answersEl.classList.add("locked");
      onNext?.();
      return;
    }
    showFeedback(correct);
    checkBtn.textContent = nextLabel;
    checkBtn.focus({ preventScroll: true });
  });

  renderAnswers();
}
