// Builds dist/preview.html: the participant page with the researcher toolbar,
// recommendations inlined, no server needed. For sharing and design review only.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const recs = read("src/recs.json");
const resolve = read("src/resolve.js").replace(/^export /gm, "");
const app = read("public/app.js").replace('const PREVIEW = params.get("preview") === "1";', "const PREVIEW = true;");
const css = read("public/styles.css");
let html = read("public/index.html")
  // function replacers: a string replacement would turn "$$" in the code into "$"
  .replace('<link rel="stylesheet" href="/styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="/app.js"></script>', () =>
    `<script>\n${resolve}\nwindow.__PREVIEW__ = { recs: ${recs}, resolveView };\n</script>\n<script type="module">\n${app}\n</script>`)
  .replace("<title>Pickwise · Earbud recommendations</title>", "<title>Pickwise prototype · researcher preview</title>");

mkdirSync(new URL("../dist", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/preview.html", import.meta.url), html);
console.log("wrote dist/preview.html", html.length, "bytes");
