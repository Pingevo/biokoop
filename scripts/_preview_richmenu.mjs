// scripts/_preview_richmenu.mjs
// render ภาพ rich menu เป็นไฟล์ local เท่านั้น — ไม่ยิง LINE API (เทสเท่านั้น)
import "dotenv/config";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderRichMenuImage, RICH_MENU_BUTTONS } from "../services/richMenuTemplate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const wasmPath = path.join(__dirname, "..", "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm");
await initWasm(fs.readFileSync(wasmPath));

const fontsDir = path.join(__dirname, "..", "fonts");
const fontBuffers = ["Kanit-Regular.ttf", "Kanit-Medium.ttf", "Kanit-SemiBold.ttf", "Kanit-Bold.ttf"]
  .map((f) => fs.readFileSync(path.join(fontsDir, f)));

const svg = renderRichMenuImage();
const png = new Resvg(svg, {
  font: { loadSystemFonts: false, fontBuffers, defaultFontFamily: "Kanit" },
  background: "white",
}).render().asPng();

const outPath = path.join(__dirname, "..", "richmenu-preview.png");
fs.writeFileSync(outPath, png);
console.log(`saved ${outPath} (${(png.length / 1024).toFixed(0)} KB)`);
console.log("buttons:", RICH_MENU_BUTTONS.map(b => `${b.label}→"${b.text}"`).join(" | "));
