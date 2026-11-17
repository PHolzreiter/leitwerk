// Live-Ansicht der Piloten-Oberflächen (Paul 17.11.2026): das echte Spiel im Browser (Pilot-Testmodus), dazu Handy- und
// EFB-Seite am selben laufenden Spiel, H145-Daten und CARLS-Anzeige live, X-Plane-Plugin als Bilder.
// Nur eingebaute, neutrale Daten – nie private Dateien (Abfrageschema, Namen) hineinkopieren.
//
//   node tools/live-ansicht/bauen.mjs <ausgabeordner> [xplane-bilder-ordner]
//
// Ergebnis: index.html (Rahmen), app/ (Spiel), geraete/handy.html + geraete/efb.html (mit Brücke), xplane/*.png
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const esbuild = await import(process.env.ESBUILD ? pathToFileURL(process.env.ESBUILD).href : "esbuild");
const hier = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(hier, "../..");
const out = path.resolve(process.argv[2] ?? "live");
const xpQuelle = process.argv[3];
fs.rmSync(out, { recursive: true, force: true });
const app = path.join(out, "app");
fs.mkdirSync(path.join(app, "assets"), { recursive: true });

const raw = {
  name: "raw",
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, "")), namespace: "raw" }));
    b.onLoad({ filter: /.*/, namespace: "raw" }, (a) => ({ contents: fs.readFileSync(a.path, "utf8"), loader: "text" }));
  },
};
// ?url: Datei nach assets kopieren, Pfad relativ zur Seite (app/index.html)
const url = {
  name: "url",
  setup(b) {
    b.onResolve({ filter: /\?url$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?url$/, "")), namespace: "url" }));
    b.onLoad({ filter: /.*/, namespace: "url" }, (a) => {
      const name = path.basename(a.path);
      fs.copyFileSync(a.path, path.join(app, "assets", name));
      return { contents: `export default ${JSON.stringify("assets/" + name)};`, loader: "js" };
    });
  },
};
const ersatz = {
  name: "ersatz",
  setup(b) {
    const fehlt = (m) => !fs.existsSync(path.join(root, "node_modules", m));
    b.onResolve({ filter: /^(qrcode-generator|@tauri-apps\/plugin-global-shortcut)$/ }, (a) => (fehlt(a.path) ? { path: a.path, namespace: "ersatz" } : undefined));
    b.onLoad({ filter: /.*/, namespace: "ersatz" }, (a) => ({
      contents: a.path === "qrcode-generator"
        ? "export default function qrcode(){return {addData(){},make(){},getModuleCount(){return 21},isDark(){return false},createSvgTag(){return '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"84\" height=\"84\"></svg>'},createDataURL(){return 'data:image/gif;base64,R0lGODlhAQABAAAAACw='}}}"
        : "export async function register(){} export async function unregister(){} export async function unregisterAll(){} export async function isRegistered(){return false}",
      loader: "js",
    }));
  },
};
await esbuild.build({
  entryPoints: [path.join(root, "src/main.ts")],
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2022",
  outdir: path.join(app, "assets"),
  entryNames: "index",
  chunkNames: "teil-[hash]",
  plugins: [raw, url, ersatz],
  loader: { ".png": "dataurl", ".svg": "dataurl", ".glb": "file", ".woff": "file", ".woff2": "file" },
  minify: true,
  sourcemap: false,
  nodePaths: [path.join(root, "node_modules")],
  logLevel: "warning",
  define: { "import.meta.env.DEV": "false" },
});
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html
  .replace(/<script type="module" src="\/src\/main.ts"><\/script>/, '<link rel="stylesheet" href="assets/index.css"><script type="module" src="assets/index.js"></script>')
  .replace('href="/favicon.svg"', 'href="favicon.svg"');
fs.writeFileSync(path.join(app, "index.html"), html);
fs.copyFileSync(path.join(root, "public/favicon.svg"), path.join(app, "favicon.svg"));

// Handy und EFB: die echten Seiten, /stand und /befehl gehen an das Spiel im Rahmen (window.__pilot)
const bruecke = fs.readFileSync(path.join(hier, "bruecke.js"), "utf8");
fs.mkdirSync(path.join(out, "geraete"), { recursive: true });
for (const f of ["handy.html", "efb.html"]) {
  const s = fs.readFileSync(path.join(root, "src-tauri/src", f), "utf8");
  const i = s.indexOf("<head>");
  if (i < 0) throw new Error(`${f}: kein <head>`);
  fs.writeFileSync(path.join(out, "geraete", f), s.slice(0, i + 6) + `\n<script>\n${bruecke}\n</script>` + s.slice(i + 6));
}
fs.copyFileSync(path.join(hier, "index.html"), path.join(out, "index.html"));
const version = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.beta.conf.json"), "utf8")).version;
const xp = [];
if (xpQuelle && fs.existsSync(xpQuelle)) {
  fs.mkdirSync(path.join(out, "xplane"), { recursive: true });
  for (const f of fs.readdirSync(xpQuelle).filter((x) => x.endsWith(".png")).sort()) {
    fs.copyFileSync(path.join(xpQuelle, f), path.join(out, "xplane", f));
    xp.push(f);
  }
}
fs.writeFileSync(path.join(out, "stand.js"), `window.LW_STAND = ${JSON.stringify({ version, gebaut: new Date().toISOString(), xplane: xp })};\n`);

// Größen prüfen (eine Datei höchstens 16 MB)
const zu = [];
const geh = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) geh(p);
    else if (fs.statSync(p).size > 15.5 * 1024 * 1024) zu.push(`${path.relative(out, p)} ${(fs.statSync(p).size / 1048576).toFixed(1)} MB`);
  }
};
geh(out);
if (zu.length) {
  console.error("zu groß:", zu.join(", "));
  process.exit(1);
}
console.log("gebaut:", out, version);
