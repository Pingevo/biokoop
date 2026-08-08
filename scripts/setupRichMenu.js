// scripts/setupRichMenu.js
// สร้าง/อัปเดต Rich Menu ของ biokoop บน LINE OA แล้วตั้งเป็นค่า default ให้ผู้ใช้ทุกคน
// วิธีรัน: node scripts/setupRichMenu.js

import "dotenv/config";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { messagingApi } from "@line/bot-sdk";
import {
  renderRichMenuImage,
  RICH_MENU_WIDTH,
  RICH_MENU_HEIGHT,
  HERO_HEIGHT,
  HERO_BUTTON,
  RICH_MENU_BUTTONS,
} from "../services/richMenuTemplate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!channelAccessToken) {
  console.error("[setupRichMenu] ไม่พบ LINE_CHANNEL_ACCESS_TOKEN ใน .env");
  process.exit(1);
}

const client = new messagingApi.MessagingApiClient({ channelAccessToken });
const blobClient = new messagingApi.MessagingApiBlobClient({ channelAccessToken });

async function renderPng() {
  const wasmPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "@resvg",
    "resvg-wasm",
    "index_bg.wasm"
  );
  await initWasm(fs.readFileSync(wasmPath));

  const fontsDir = path.join(__dirname, "..", "fonts");
  const fontBuffers = [
    "Kanit-Regular.ttf",
    "Kanit-Medium.ttf",
    "Kanit-SemiBold.ttf",
    "Kanit-Bold.ttf",
  ].map((f) => fs.readFileSync(path.join(fontsDir, f)));

  const svg = renderRichMenuImage();
  const resvgJS = new Resvg(svg, {
    font: { loadSystemFonts: false, fontBuffers, defaultFontFamily: "Kanit" },
    background: "white",
  });
  return resvgJS.render().asPng();
}

function buildRichMenuAreas() {
  const colW = Math.floor(RICH_MENU_WIDTH / RICH_MENU_BUTTONS.length);
  const bottomH = RICH_MENU_HEIGHT - HERO_HEIGHT;

  const heroArea = {
    bounds: { x: 0, y: 0, width: RICH_MENU_WIDTH, height: HERO_HEIGHT },
    action: { type: "cameraRoll", label: HERO_BUTTON.label },
  };

  const secondaryAreas = RICH_MENU_BUTTONS.map((btn, i) => ({
    bounds: { x: colW * i, y: HERO_HEIGHT, width: colW, height: bottomH },
    action: { type: "message", label: btn.label, text: btn.text },
  }));

  return [heroArea, ...secondaryAreas];
}

async function main() {
  console.log("[setupRichMenu] กำลัง render ภาพเมนู...");
  const png = await renderPng();

  const outPath = path.join(__dirname, "..", "richmenu-preview.png");
  fs.writeFileSync(outPath, png);
  console.log(`[setupRichMenu] บันทึกภาพตัวอย่างไว้ที่ ${outPath}`);

  console.log("[setupRichMenu] กำลังสร้าง Rich Menu บน LINE...");
  const richMenu = await client.createRichMenu({
    size: { width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT },
    selected: true,
    name: `biokoop-menu-${new Date().toISOString().slice(0, 10)}`,
    chatBarText: "เมนู biokoop",
    areas: buildRichMenuAreas(),
  });
  console.log(`[setupRichMenu] สร้างสำเร็จ richMenuId=${richMenu.richMenuId}`);

  console.log("[setupRichMenu] กำลังอัปโหลดภาพ...");
  await blobClient.setRichMenuImage(
    richMenu.richMenuId,
    new Blob([png], { type: "image/png" })
  );

  console.log("[setupRichMenu] กำลังตั้งเป็นเมนู default ให้ผู้ใช้ทุกคน...");
  await client.setDefaultRichMenu(richMenu.richMenuId);

  console.log("[setupRichMenu] เสร็จสิ้น! Rich Menu ใช้งานได้ทันทีในแชท biokoop");
}

main().catch((err) => {
  console.error("[setupRichMenu] ล้มเหลว:", err);
  process.exit(1);
});
