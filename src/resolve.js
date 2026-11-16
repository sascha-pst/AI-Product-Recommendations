// Study v2: both conditions use the same frozen Engine A content.
export const STUDY_ID = 'ai-disclosure-v1';
export const ARMS = {
  '1': { content: 'A', label: 'standard', text: 'Recommended' },
  '2': { content: 'A', label: 'ai', text: 'Recommended by AI' },
};
export function hashToUnit(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h / 0x100000000;
}
export function resolveView(recs, { rid, arm, scenario }) {
  if (!rid || !ARMS[arm] || scenario !== 'commute' || !recs.scenarios[scenario]) {
    throw new Error('A valid respondent ID, assigned arm (1 or 2), and commute scenario are required.');
  }
  const sc = recs.scenarios[scenario];
  const picks = sc.engines.A.map(p => ({ ...p, product: { id: p.product_id, ...recs.products[p.product_id] } }));
  const ids = new Set(picks.map(p => p.product_id));
  return {
    public: {
      rid, arm, scenario, study_id: STUDY_ID, assigned: {},
      label_key: ARMS[arm].label, label_text: ARMS[arm].text,
      title: sc.title, brief: sc.brief, budget_usd: sc.budget_usd,
      picks: picks.map(({product,rank,match_score,rationale}) => ({product,rank,match_score,rationale})),
      others: sc.all_in_budget.filter(id => !ids.has(id)).map(id => ({id,...recs.products[id]})),
      stimuli_version: recs.stimuli_version, sample_data: recs.sample_data,
    },
    server: {content_source: 'A'},
  };
}
export const EVENT_TYPES = new Set(['page_view','details_open','details_close','browse_all','choose_start','choose_cancel','card_dwell','page_hide']);
