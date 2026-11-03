// Lädt Themen, Stufen, Fragen und Merkkarten aus /data.
export const DATA = { topics: [], topicMap: {}, levels: [], items: [], byId: {}, cards: [] };

const LEVEL_FILES = ["level1", "level2", "level3", "level4"];

export async function loadData() {
  const get = (f) => fetch(`data/${f}.json`).then((r) => {
    if (!r.ok) throw new Error(`data/${f}.json konnte nicht geladen werden`);
    return r.json();
  });
  const [meta, cards, ...levels] = await Promise.all([get("meta"), get("cards"), ...LEVEL_FILES.map(get)]);
  DATA.topics = meta.topics;
  DATA.levels = meta.levels;
  DATA.cards = cards.cards;
  meta.topics.forEach((t) => { DATA.topicMap[t.id] = t; });
  for (const lv of levels) {
    for (const item of lv.items) {
      item.level = lv.level;
      DATA.items.push(item);
      DATA.byId[item.id] = item;
    }
  }
}

export const topicLabel = (id) => DATA.topicMap[id]?.label ?? id;
export const topicShort = (id) => DATA.topicMap[id]?.short ?? id;

// Findet eine Frage auch für Fall-Schritte ("fall-id#2").
export function findQuestion(qid) {
  const [id, step] = String(qid).split("#");
  const item = DATA.byId[id];
  if (!item) return null;
  if (step && item.type === "case") {
    const s = item.steps[Number(step) - 1];
    return s ? { ...s, caseTitle: item.title, level: item.level, topic: s.topic || item.topic } : null;
  }
  return item;
}
