// Builds public/demo.html: a stakeholder demo with the recommendations inlined.
// It reveals which engine made each pick, so the Worker serves it only when
// ALLOW_PREVIEW is "true" (the staging environment).
import { readFileSync, writeFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const data = JSON.stringify({ recs: JSON.parse(read("src/recs.json")), evals: JSON.parse(read("data/offline_eval.json")) });
const resolve = read("src/resolve.js").replace(/^export /gm, "");
const html = read("demo/demo.template.html")
  // function replacers so "$" sequences in the code survive
  .replace("/*__DATA__*/null", () => data.replace(/</g, "\\u003c"))
  .replace("/*__RESOLVE__*/", () => resolve);

writeFileSync(new URL("../public/demo.html", import.meta.url), html);
console.log("wrote public/demo.html", html.length, "bytes");
