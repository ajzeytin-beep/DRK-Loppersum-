// Belegerkennung: Foto eines Kassenbons oder einer Rechnung → Datum, Betrag, Händler, Rechnungsnummer.
// Die Texterkennung (Tesseract) läuft vollständig auf dem Gerät. Das Foto wird an keinen fremden Dienst geschickt.
// Die erkannten Werte sind nur ein Vorschlag und müssen vor dem Speichern geprüft werden.

const VENDOR = new URL("../vendor/tesseract/", import.meta.url).href;

let loading = null;
function loadLib() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${VENDOR}tesseract.min.js`;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => { loading = null; reject(new Error("Die Texterkennung konnte nicht geladen werden.")); };
    document.head.append(s);
  });
  return loading;
}

/* ---------------- Bild vorbereiten ---------------- */

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Das Bild konnte nicht gelesen werden."));
    img.src = url;
  });
}

// Verkleinert das Foto für den Upload (spart Speicher, bleibt gut lesbar)
export async function compress(img, maxSide = 2000, quality = 0.82) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/jpeg", quality));
}

// Graustufen + Kontrast: verbessert die Erkennung bei Thermopapier
function prepare(img) {
  const maxSide = 2200;
  const scale = Math.min(2, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let min = 255, max = 0;
  const gray = new Uint8ClampedArray(px.length / 4);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    gray[j] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1, max - min);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = ((gray[j] - min) / range) * 255;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  return c;
}

/* ---------------- Texterkennung ---------------- */

export async function recognize(img, onProgress = () => {}) {
  const Tesseract = await loadLib();
  onProgress(0.02, "Texterkennung wird geladen …");
  const worker = await Tesseract.createWorker("deu", 1, {
    workerPath: `${VENDOR}worker.min.js`,
    corePath: `${VENDOR}core`,
    langPath: `${VENDOR}lang`,
    gzip: true,
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(0.1 + m.progress * 0.9, "Text wird erkannt …");
      else if (/load/.test(m.status)) onProgress(0.05, "Texterkennung wird geladen …");
    },
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(prepare(img));
    return data.text || "";
  } finally {
    worker.terminate();
  }
}

/* ---------------- Auswertung des erkannten Texts ---------------- */

const AMOUNT = /(?<![\d.,])(\d{1,3}(?:[.\s]\d{3})*|\d+)\s?[,.]\s?(\d{2})(?!\d)/g;
const TOTAL_WORDS = [
  /zu\s*zahlen/i, /gesamt\s*betrag/i, /end\s*betrag/i, /rechnungs\s*betrag/i, /gesamt\s*summe/i,
  /\bsumme\b/i, /\bgesamt\b/i, /\btotal\b/i, /brutto/i, /zahlbetrag/i, /\bbetrag\b/i,
];
const NOT_TOTAL = /(mwst|ust|steuer|netto|rückgeld|rueckgeld|zurück|gegeben|bar\s*gegeben|tax|rabatt|pfand\s*zurück)/i;

function amountsIn(line) {
  const out = [];
  for (const m of line.matchAll(AMOUNT)) {
    const v = Number(m[1].replace(/[.\s]/g, "")) * 100 + Number(m[2]);
    if (v > 0 && v < 10000000) out.push(v);
  }
  return out;
}

function findTotal(lines) {
  for (const re of TOTAL_WORDS) {
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i]) || NOT_TOTAL.test(lines[i])) continue;
      const here = amountsIn(lines[i]);
      if (here.length) return { cents: Math.max(...here), sure: true };
      const next = lines[i + 1] ? amountsIn(lines[i + 1]) : [];
      if (next.length && !NOT_TOTAL.test(lines[i + 1])) return { cents: Math.max(...next), sure: true };
    }
  }
  // Kein Stichwort gefunden: größter Betrag auf dem Beleg (ohne Zeilen mit „gegeben“, „Rückgeld“ …)
  const all = lines.filter((l) => !NOT_TOTAL.test(l)).flatMap(amountsIn);
  return all.length ? { cents: Math.max(...all), sure: false } : null;
}

function findDate(text) {
  const now = new Date();
  const cands = [];
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4}|\d{2})(?!\d)/g)) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const d = Number(m[1]), mo = Number(m[2]);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) continue;
    if (dt > new Date(now.getTime() + 2 * 86400000) || y < now.getFullYear() - 3) continue;
    cands.push(dt);
  }
  for (const m of text.matchAll(/(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/g)) {
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(dt) && dt <= now) cands.push(dt);
  }
  if (!cands.length) return null;
  const z = (n) => String(n).padStart(2, "0");
  const dt = cands[0];
  return `${dt.getFullYear()}-${z(dt.getMonth() + 1)}-${z(dt.getDate())}`;
}

function findInvoiceNo(text) {
  const m = text.match(/(?:rechnungs?\s*-?\s*(?:nr|nummer)|rechnung\s*nr|re\.?\s*-?\s*nr|beleg\s*-?\s*(?:nr|nummer)|bon\s*-?\s*nr|invoice\s*(?:no|nr)?)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/]{2,20})/i);
  return m ? m[1] : null;
}

const SKIP_VENDOR = /(rechnung|kassenbon|beleg|quittung|kunde|datum|uhrzeit|tel|fax|www|http|@|ust|steuer|str\.|straße|strasse|^\d)/i;
function findVendor(lines) {
  for (const l of lines.slice(0, 8)) {
    const t = l.replace(/[^\p{L}\d&.\-\s']/gu, " ").replace(/\s+/g, " ").trim();
    if (t.length < 3 || SKIP_VENDOR.test(t)) continue;
    if ((t.match(/\p{L}/gu) || []).length < 3) continue;
    return t.slice(0, 60);
  }
  return null;
}

// Erkennt, ob es eher eine Getränke-Rechnung ist (Vorschlag für den Bereich)
const DRINK_WORDS = /(getränk|getraenk|bier|pils|cola|fanta|sprite|wasser|mineral|saft|limo|schorle|kasten|kiste|pfand|wein|sekt|brause|radler)/i;

export function parseReceipt(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const total = findTotal(lines);
  const date = findDate(text);
  const invoice = findInvoiceNo(text);
  const vendor = findVendor(lines);
  const isInvoice = /rechnung/i.test(text);
  return {
    amount_cents: total?.cents ?? null,
    amountSure: total?.sure ?? false,
    date,
    vendor,
    invoice,
    area: DRINK_WORDS.test(text) ? "getraenke" : null,
    purpose: [vendor, isInvoice ? `Rechnung${invoice ? ` Nr. ${invoice}` : ""}` : invoice ? `Beleg ${invoice}` : "Einkauf"].filter(Boolean).join(" – "),
    category: isInvoice ? "Rechnung" : null,
  };
}
