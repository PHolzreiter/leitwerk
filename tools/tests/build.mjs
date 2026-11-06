import fs from "node:fs";
import path from "node:path";
// Lokaler Testbuild (statt vite): esbuild bündelt src/main.ts nach <out>/assets
// esbuild: aus dem Repo (node_modules) oder über ESBUILD=/pfad/zu/esbuild/lib/main.js
import { fileURLToPath, pathToFileURL } from "node:url";
const esbuild = await import(process.env.ESBUILD ? pathToFileURL(process.env.ESBUILD).href : "esbuild");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = process.argv[2];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "assets"), { recursive: true });
const raw = {
  name: "raw",
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, "")), namespace: "raw" }));
    b.onLoad({ filter: /.*/, namespace: "raw" }, (a) => ({ contents: fs.readFileSync(a.path, "utf8"), loader: "text" }));
  },
};
// ?url: Datei nach assets kopieren, Pfad zurückgeben (wie Vite)
const url = {
  name: "url",
  setup(b) {
    b.onResolve({ filter: /\?url$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?url$/, "")), namespace: "url" }));
    b.onLoad({ filter: /.*/, namespace: "url" }, (a) => {
      const name = path.basename(a.path);
      fs.copyFileSync(a.path, path.join(out, "assets", name));
      return { contents: `export default ${JSON.stringify("/assets/" + name)};`, loader: "js" };
    });
  },
};
// Ersatz für Pakete, die im Testbuild nicht installiert sind (CI baut mit den echten)
const ersatz = {
  name: "ersatz",
  setup(b) {
    const fehlt = (m) => !fs.existsSync(path.join(root, "node_modules", m));
    b.onResolve({ filter: /^(qrcode-generator|@tauri-apps\/plugin-global-shortcut)$/ }, (a) => (fehlt(a.path) ? { path: a.path, namespace: "ersatz" } : undefined));
    b.onLoad({ filter: /.*/, namespace: "ersatz" }, (a) => ({
      contents: a.path === "qrcode-generator"
        ? "export default function qrcode(){let d='';return {addData(s){d=s},make(){},getModuleCount(){return 21},isDark(r,c){return (r*7+c*3+d.length)%3===0},createSvgTag(){return '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"84\" height=\"84\"></svg>'},createDataURL(){return 'data:image/gif;base64,R0lGODlhAQABAAAAACw='}}}"
        : "export async function register(){} export async function unregister(){} export async function unregisterAll(){} export async function isRegistered(){return false}",
      loader: "js",
    }));
  },
};
const r = await esbuild.build({
  entryPoints: [path.join(root, "src/main.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  outdir: path.join(out, "assets"),
  entryNames: "index",
  plugins: [raw, url, ersatz],
  loader: { ".png": "dataurl", ".svg": "dataurl", ".glb": "file", ".woff": "file", ".woff2": "file" },
  sourcemap: "inline",
  nodePaths: [path.join(root, "node_modules")],
  logLevel: "warning",
  define: { "import.meta.env.DEV": "false" },
});
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(/<script type="module" src="\/src\/main.ts"><\/script>/, '<link rel="stylesheet" href="/assets/index.css"><script type="module" src="/assets/index.js"></script>');
fs.writeFileSync(path.join(out, "index.html"), html);
if (fs.existsSync(path.join(root, "public"))) fs.cpSync(path.join(root, "public"), out, { recursive: true });
console.log("ok", r.errors.length, "Fehler");
