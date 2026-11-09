// Shared by the Worker and the single-file preview: turns (rid, arm, scenario)
// into exactly what one participant sees. The true content source never
// leaves the server except in preview mode.

export function hashToUnit(str) {
  // FNV-1a, stable across runtimes
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0xffffffff;
}

export function resolveView(recs, { rid, arm, scenario }) {
  const arms = recs.arms.arms;
  const scenarioIds = Object.keys(recs.scenarios);
  const assigned = {};
  if (!arms[arm]) {
    arm = String(1 + Math.floor(hashToUnit(rid + ":arm") * 6));
    assigned.arm = true;
  }
  if (!recs.scenarios[scenario]) {
    scenario = scenarioIds[Math.floor(hashToUnit(rid + ":scenario") * scenarioIds.length)];
    assigned.scenario = true;
  }
  const armDef = arms[arm];
  let content = armDef.content;
  if (content === "balanced") content = hashToUnit(rid + ":balanced") < 0.5 ? "H" : "A";

  const sc = recs.scenarios[scenario];
  const picks = sc.engines[content].map((p) => ({
    ...p,
    product: { id: p.product_id, ...recs.products[p.product_id] },
  }));
  const pickIds = new Set(picks.map((p) => p.product_id));
  const others = sc.all_in_budget
    .filter((id) => !pickIds.has(id))
    .map((id) => ({ id, ...recs.products[id] }));

  return {
    public: {
      rid, arm, scenario, assigned,
      label_key: armDef.label,
      label_text: recs.arms.labels[armDef.label],
      title: sc.title, brief: sc.brief, budget_usd: sc.budget_usd,
      picks: picks.map(({ product, rank, match_score, rationale }) => ({ product, rank, match_score, rationale })),
      others,
      stimuli_version: recs.stimuli_version,
      sample_data: recs.sample_data,
    },
    server: { content_source: content },
  };
}

export const EVENT_TYPES = new Set([
  "page_view", "details_open", "details_close", "browse_all", "choose_start",
  "choose_cancel", "choose_confirm", "card_dwell", "page_hide",
]);
