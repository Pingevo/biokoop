// scripts/test_weekly_ai.js
// ทดสอบวิเคราะห์รายสัปดาห์ end-to-end ด้วยภาพ Screenshot Kieslect จริง 3 ใบ + เรนเดอร์รายงานจริง
// ใช้ API จริง (ต้องมี OPENROUTER_API_KEY หรือ GEMINI_API_KEY ใน .env)

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeWeeklyImages } from "../services/aiService.js";
import { initImageService, composeWeeklyReport, optimizeCardPng } from "../services/imageService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = "C:/Users/Digg/.gemini/antigravity-ide/brain/c910a657-19f0-4994-b38e-d2d2c1b98b3c";
const FILES = [
  "user_kieslect_raw_1.jpg", // Body Load
  "user_kieslect_raw_2.jpg", // Sleep Quality
  "user_kieslect_raw_3.jpg", // Recovery
];

async function main() {
  const buffers = FILES.map((f) => fs.readFileSync(path.join(IMG_DIR, f)));
  console.log(`[test-ai] โหลดภาพ ${buffers.length} รูป:`, buffers.map((b) => `${(b.length / 1024).toFixed(0)}KB`).join(", "));

  console.log("[test-ai] เรียก AI วิเคราะห์รายสัปดาห์...");
  const start = Date.now();
  const resp = await analyzeWeeklyImages(buffers, "image/jpeg", { nickname: "ทดสอบ" });
  console.log(`[test-ai] AI ตอบใน ${Date.now() - start}ms | ok=${resp.ok} | model=${resp.model} | needsReview=${resp.needsReview}`);
  if (!resp.ok) {
    console.error("[test-ai] ❌", resp.error, JSON.stringify(resp.raw ?? "", null, 0).slice(0, 500));
    process.exit(1);
  }

  const d = resp.data;
  console.log("[test-ai] detected:", d.detected, "| foundPages:", JSON.stringify(d.foundPages), "| confidence:", d.confidence);
  console.log("[test-ai] overview:", JSON.stringify({ ...d.overview, summary: (d.overview?.summary || "").slice(0, 60) + "..." }, null, 1));
  console.log("[test-ai] activity.bodyLoadSeries:", JSON.stringify(d.activity?.bodyLoadSeries));
  console.log("[test-ai] sleep.qualitySeries:", JSON.stringify(d.sleep?.qualitySeries));
  console.log("[test-ai] sleep.hoursVsNeededSeries:", JSON.stringify(d.sleep?.hoursVsNeededSeries));
  console.log("[test-ai] sleep.hoursNeededSeries:", JSON.stringify(d.sleep?.hoursNeededSeries));
  console.log("[test-ai] sleep.consistencySeries:", JSON.stringify(d.sleep?.consistencySeries));

  if (!d.detected) {
    console.warn("[test-ai] AI บอกว่าภาพไม่ครบ — notes:", d.notes);
    return;
  }

  console.log("[test-ai] เรนเดอร์รายงาน...");
  await initImageService();
  const { pngBuffers } = composeWeeklyReport(d);
  for (let i = 0; i < pngBuffers.length; i++) {
    const optimized = await optimizeCardPng(Buffer.from(pngBuffers[i]));
    const out = path.join(__dirname, "..", "public", "assets", `tmp_weekly_ai_p${i + 1}.png`);
    fs.writeFileSync(out, optimized);
    console.log(`[test-ai] ✅ ${out} (${(optimized.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error("[test-ai] FAILED:", err.message);
  process.exit(1);
});
