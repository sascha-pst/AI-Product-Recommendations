import recs from "./recs.json";
import { resolveView, EVENT_TYPES } from "./resolve.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const clean = (v, max = 64) => (typeof v === "string" ? v.slice(0, max).replace(/[^\w\-:.]/g, "") : null);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, stimuli_version: recs.stimuli_version, sample_data: recs.sample_data, db: !!env.DB });
    }

    if (url.pathname === "/api/recs" && request.method === "GET") {
      const rid = clean(url.searchParams.get("rid")) || `anon-${crypto.randomUUID()}`;
      const view = resolveView(recs, {
        rid,
        arm: clean(url.searchParams.get("arm"), 2),
        scenario: clean(url.searchParams.get("scenario"), 32),
      });
      if (env.DB) {
        const v = view.public;
        await env.DB.prepare(
          `INSERT OR IGNORE INTO sessions (rid, scenario, arm, content_source, label, stimuli_version, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        ).bind(v.rid, v.scenario, v.arm, view.server.content_source, v.label_key, v.stimuli_version, Date.now()).run();
      }
      // Preview mode may reveal the true source; never on by default.
      const body = env.ALLOW_PREVIEW === "true" && url.searchParams.get("preview") === "1"
        ? { ...view.public, content_source: view.server.content_source }
        : view.public;
      return json(body);
    }

    if (url.pathname === "/api/event" && request.method === "POST") {
      const text = await request.text();
      if (text.length > 4000) return json({ error: "too large" }, 413);
      let events;
      try {
        const parsed = JSON.parse(text);
        events = Array.isArray(parsed) ? parsed.slice(0, 50) : [parsed];
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const rows = events.filter((e) => EVENT_TYPES.has(e.type)).map((e) => [
        clean(e.rid), clean(e.arm, 2), clean(e.scenario, 32), e.type, clean(e.product_id, 16),
        Number.isFinite(e.value) ? e.value : null, Number.isFinite(e.client_ts) ? e.client_ts : null, Date.now(),
      ]);
      if (env.DB && rows.length) {
        const stmt = env.DB.prepare(
          `INSERT INTO events (rid, arm, scenario, type, product_id, value, client_ts, server_ts)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
        );
        await env.DB.batch(rows.map((r) => stmt.bind(...r)));
      }
      return json({ stored: env.DB ? rows.length : 0 });
    }

    // Static assets (index.html, app.js, styles.css). Allow Qualtrics to frame the page.
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set("content-security-policy", `frame-ancestors 'self' ${env.FRAME_ANCESTORS || "https://*.qualtrics.com"}`);
    out.headers.set("referrer-policy", "no-referrer");
    return out;
  },
};
