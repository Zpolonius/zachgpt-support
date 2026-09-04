/* Bygger en enkelt HTML-fil til dist/artifact.html.
 *
 * Claude-artifacts skal være én selvstændig fil, så CSS og JS inlines her.
 * Kør: node build.mjs
 * Publicér derefter dist/artifact.html som artifact.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

const [html, css, config, data, store, app] = await Promise.all([
  read("./index.html"),
  read("./css/styles.css"),
  read("./js/config.js"),
  read("./js/data.js"),
  read("./js/store.js"),
  read("./js/app.js")
]);

// Artifact-runtimen leverer selv <!doctype>, <head> og <body> — vi sender kun indholdet.
const inner = html
  .replace(/[\s\S]*?<link rel="stylesheet" href="css\/styles\.css">\n<\/head>\n<body>\n/, "")
  .replace(/\n<script src="js\/config\.js"><\/script>[\s\S]*$/, "");

const fonts = [
  '<title>ZachGPT Supportregning</title>',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap">'
].join("\n");

const out = [
  fonts,
  "<style>",
  css.trim(),
  "</style>",
  "",
  inner.trim(),
  "",
  "<script>",
  [config, data, store, app].map((s) => s.trim()).join("\n\n"),
  "</script>",
  ""
].join("\n");

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await writeFile(new URL("./dist/artifact.html", import.meta.url), out);
console.log(`dist/artifact.html — ${(out.length / 1024).toFixed(1)} kB`);
