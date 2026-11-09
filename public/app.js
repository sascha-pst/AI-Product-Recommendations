// Pickwise participant page. Reads ?rid=&arm=&scenario=[&return=][&preview=1],
// shows one arm's recommendations, logs behavior, and reports the choice
// back to Qualtrics (postMessage when framed, redirect when ?return= is set).

const params = new URLSearchParams(location.search);
const PREVIEW = params.get("preview") === "1";
const LOCAL = window.__PREVIEW__; // set only in the single-file preview build
const startedAt = performance.now();
let view = null;
let queue = [];
const dwell = new Map(); // product_id -> ms visible
const visibleSince = new Map();

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------------------------------------------------------------- data
async function loadView(overrides = {}) {
  const q = {
    rid: params.get("rid") || (LOCAL ? "preview-" + Math.random().toString(36).slice(2, 8) : ""),
    arm: params.get("arm") || "",
    scenario: params.get("scenario") || "",
    ...overrides,
  };
  if (LOCAL) {
    const v = LOCAL.resolveView(LOCAL.recs, q);
    return { ...v.public, content_source: v.server.content_source };
  }
  const u = new URL("/api/recs", location.origin);
  Object.entries(q).forEach(([k, v]) => v && u.searchParams.set(k, v));
  if (PREVIEW) u.searchParams.set("preview", "1");
  const res = await fetch(u);
  if (!res.ok) throw new Error("Could not load recommendations");
  return res.json();
}

// ---------------------------------------------------------------- logging
function log(type, extra = {}) {
  const e = { rid: view?.rid, arm: view?.arm, scenario: view?.scenario, type, client_ts: Date.now(), ...extra };
  queue.push(e);
  if (PREVIEW) renderLog(e);
}
function flush(useBeacon = false) {
  if (!queue.length) return;
  const batch = queue.splice(0, 50);
  if (LOCAL) return; // preview build: nothing to send to
  const body = JSON.stringify(batch);
  if (useBeacon && navigator.sendBeacon) navigator.sendBeacon("/api/event", new Blob([body], { type: "application/json" }));
  else fetch("/api/event", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
}
setInterval(flush, 3000);

function closeDwell() {
  const now = performance.now();
  visibleSince.forEach((t, id) => dwell.set(id, (dwell.get(id) || 0) + (now - t)));
  visibleSince.clear();
  dwell.forEach((ms, id) => log("card_dwell", { product_id: id, value: Math.round(ms) }));
  dwell.clear();
}
addEventListener("pagehide", () => {
  if (!view) return;
  closeDwell();
  log("page_hide", { value: Math.round(performance.now() - startedAt) });
  flush(true);
});

const observer = new IntersectionObserver((entries) => {
  const now = performance.now();
  for (const en of entries) {
    const id = en.target.dataset.pid;
    if (en.isIntersecting) visibleSince.set(id, now);
    else if (visibleSince.has(id)) {
      dwell.set(id, (dwell.get(id) || 0) + (now - visibleSince.get(id)));
      visibleSince.delete(id);
    }
  }
}, { threshold: 0.6 });

// ---------------------------------------------------------------- render
const ICONS = {
  human: `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="7" cy="7" r="3"/><circle cx="14" cy="8" r="2.4"/><path d="M1.5 17c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M12 12.3c.6-.2 1.3-.3 2-.3 2.1 0 3.8 1.5 4.3 4.5"/></svg>`,
  ai: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6zM15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>`,
};

function labelBadge() {
  if (!view.label_text) return "";
  const icons = view.label_key === "both" ? ICONS.human + ICONS.ai : ICONS[view.label_key];
  return `<span class="source-badge">${icons}<span>${esc(view.label_text)}</span></span>`;
}

function budIcon(color) {
  return `<svg class="bud" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="6" y="6" width="52" height="52" rx="14" fill="${esc(color)}" opacity=".14"/>
    <circle cx="27" cy="27" r="11" fill="${esc(color)}"/><circle cx="27" cy="27" r="4.5" fill="#fff" opacity=".55"/>
    <rect x="31" y="31" width="7" height="20" rx="3.5" transform="rotate(-35 34.5 41)" fill="${esc(color)}"/></svg>`;
}

function specTable(specs) {
  return `<dl class="specs">${Object.entries(specs).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
}

function render() {
  const app = $("#app");
  app.innerHTML = `
    ${view.sample_data ? `<p class="sample-note">Prototype with sample products. Brands and figures are fictional.</p>` : ""}
    <section class="scenario" aria-labelledby="sc-h">
      <p class="eyebrow">Your situation · ${esc(view.title)}</p>
      <h1 id="sc-h">${esc(view.brief)}</h1>
    </section>
    <section aria-labelledby="picks-h">
      <div class="picks-head">
        <h2 id="picks-h">Top 3 picks for you</h2>
        ${labelBadge()}
      </div>
      <ol class="picks">
        ${view.picks.map((p) => `
          <li class="card" data-pid="${esc(p.product.id)}">
            <div class="card-top">
              ${budIcon(p.product.color)}
              <div class="card-title">
                <span class="rank">#${p.rank}</span>
                <h3>${esc(p.product.name)}</h3>
                <p class="price">$${p.product.price_usd}</p>
              </div>
              <span class="match" title="How well it fits your situation">${p.match_score}% match</span>
            </div>
            <p class="why">${esc(p.rationale)}</p>
            <details data-pid="${esc(p.product.id)}"><summary>Specs</summary>${specTable(p.product.specs)}</details>
            <button class="choose" data-pid="${esc(p.product.id)}" data-rank="${p.rank}">Choose this pair</button>
          </li>`).join("")}
      </ol>
    </section>
    <section class="others">
      <button class="link" id="browse">None of these? Browse all ${view.others.length + view.picks.length} options in your budget</button>
      <ul id="other-list" hidden>
        ${view.others.map((o) => `
          <li class="row" data-pid="${esc(o.id)}">
            ${budIcon(o.color)}
            <div class="row-main"><strong>${esc(o.name)}</strong><span class="price">$${o.price_usd}</span>
              <details data-pid="${esc(o.id)}"><summary>Specs</summary>${specTable(o.specs)}</details></div>
            <button class="choose secondary" data-pid="${esc(o.id)}" data-rank="0">Choose</button>
          </li>`).join("")}
      </ul>
    </section>`;

  app.querySelectorAll(".card").forEach((c) => observer.observe(c));
  app.querySelectorAll("details").forEach((d) => d.addEventListener("toggle", () =>
    log(d.open ? "details_open" : "details_close", { product_id: d.dataset.pid })));
  $("#browse").addEventListener("click", (e) => {
    const list = $("#other-list");
    list.hidden = !list.hidden;
    e.target.setAttribute("aria-expanded", String(!list.hidden));
    if (!list.hidden) log("browse_all");
  });
  app.querySelectorAll("button.choose").forEach((b) => b.addEventListener("click", () => openConfirm(b.dataset.pid, Number(b.dataset.rank))));
}

function productName(pid) {
  return (view.picks.find((p) => p.product.id === pid)?.product || view.others.find((o) => o.id === pid)).name;
}

function openConfirm(pid, rank) {
  log("choose_start", { product_id: pid, value: rank });
  const dlg = $("#confirm");
  dlg.innerHTML = `
    <form method="dialog">
      <h2>Go with the ${esc(productName(pid))}?</h2>
      <p>You can't change this after confirming.</p>
      <div class="dlg-actions">
        <button value="cancel" class="secondary">Keep looking</button>
        <button value="ok" class="choose">Confirm choice</button>
      </div>
    </form>`;
  dlg.onclose = () => (dlg.returnValue === "ok" ? confirmChoice(pid, rank) : log("choose_cancel", { product_id: pid }));
  dlg.showModal();
}

function confirmChoice(pid, rank) {
  const ms = Math.round(performance.now() - startedAt);
  log("choose_confirm", { product_id: pid, value: rank });
  closeDwell();
  flush(true);
  const msg = { source: "rec-engine", type: "choice", rid: view.rid, product_id: pid, rank, from_recs: rank > 0, time_to_choice_ms: ms };
  if (window.parent !== window) window.parent.postMessage(msg, "*");

  const ret = params.get("return");
  $("#app").innerHTML = `<section class="done"><h1>Thanks, your choice is saved.</h1>
    <p>${ret ? "Taking you back to the survey…" : "Continue with the survey below."}</p></section>`;
  if (ret) {
    try {
      const u = new URL(ret);
      if (u.protocol === "https:" && /(^|\.)qualtrics\.com$/.test(u.hostname)) {
        Object.entries({ choice: pid, rank, from_recs: rank > 0 ? 1 : 0, ttc: ms }).forEach(([k, v]) => u.searchParams.set(k, v));
        setTimeout(() => location.assign(u), 600);
      }
    } catch {}
  }
}

// ---------------------------------------------------------------- preview tools
function renderPreviewBar() {
  const bar = $("#preview-bar");
  bar.hidden = false;
  const arms = { 1: "H · human label", 2: "H · AI label", 3: "A · human label", 4: "A · AI label", 5: "Hybrid · both", 6: "Control · no label" };
  const scen = { commute: "Commute", gym: "Workouts", calls: "Work calls" };
  bar.innerHTML = `
    <strong>Researcher preview</strong>
    <label>Arm <select id="pv-arm">${Object.entries(arms).map(([k, v]) => `<option value="${k}" ${k === view.arm ? "selected" : ""}>${k} · ${v}</option>`).join("")}</select></label>
    <label>Scenario <select id="pv-sc">${Object.entries(scen).map(([k, v]) => `<option value="${k}" ${k === view.scenario ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <span class="pv-truth">Content actually from: <b>${{ H: "customer reviews (Engine H)", A: "AI reviewer (Engine A)", HY: "hybrid" }[view.content_source] || "?"}</b></span>
    <details class="pv-log"><summary>Event log</summary><ol id="pv-events"></ol></details>`;
  const reload = async () => {
    view = await loadView({ rid: view.rid, arm: $("#pv-arm").value, scenario: $("#pv-sc").value });
    render(); renderPreviewBar(); log("page_view");
  };
  $("#pv-arm").onchange = reload;
  $("#pv-sc").onchange = reload;
}
function renderLog(e) {
  const ol = $("#pv-events");
  if (!ol) return;
  const li = document.createElement("li");
  li.textContent = `${new Date(e.client_ts).toLocaleTimeString()} ${e.type}${e.product_id ? " " + e.product_id : ""}${e.value != null ? " = " + e.value : ""}`;
  ol.prepend(li);
}

// ---------------------------------------------------------------- boot
(async () => {
  try {
    view = await loadView();
    render();
    if (PREVIEW && view.content_source) renderPreviewBar();
    log("page_view");
    flush();
  } catch (err) {
    $("#app").innerHTML = `<p class="error">Something went wrong loading this page. Please return to the survey and continue.</p>`;
  }
})();
