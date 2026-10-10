// scripts/backfill_raw_extraction.js
// ย้อนสกัด raw extraction ให้ request weekly เก่าที่มีรูปครบ 3 ใบแต่ยังไม่มี RawExtraction
// วิธีใช้:
//   node scripts/backfill_raw_extraction.js            → รันจริงทั้งหมด
//   node scripts/backfill_raw_extraction.js --dry-run  → ดูว่าจะทำกี่อัน ไม่ยิง AI
//   node scripts/backfill_raw_extraction.js --limit 5  → จำกัดจำนวน

import "dotenv/config";
import { connectDB } from "../config/db.js";
import mongoose from "mongoose";
import { runRawExtraction } from "../services/rawExtractionService.js";
import { getLlmExtractConfig } from "../services/llmExtractConfigService.js";
import { RawExtraction } from "../models/RawExtraction.js";
import { Request } from "../models/Request.js";
import { User } from "../models/User.js";
import { openDownloadStream } from "../services/storageService.js";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) || 0 : 0;
const GAP_MS = 4000; // หน่วงระหว่าง call กันชน rate limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gridfsBuffer(bucket, id) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    openDownloadStream(bucket, id)
      .on("data", (c) => chunks.push(c))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);
  });
}

async function main() {
  await connectDB();

  const config = getLlmExtractConfig();
  console.log(`[backfill] config: model=${config.model} enabled=${config.enabled} maxTokens=${config.maxOutputTokens}`);
  if (!config.enabled) {
    console.error("❌ flow สกัดถูกปิดอยู่ (enabled=false) — เปิดใน /llmkey2 ก่อน");
    process.exit(1);
  }

  // request ที่ยังไม่มี extraction — weekly ครบ 3 รูป + legacy รูปเดี่ยว
  const reqs = await Request.find({
    $or: [
      { reportType: "weekly", originalImageIds: { $size: 3 } },
      { reportType: { $ne: "weekly" }, originalImageId: { $exists: true } },
    ],
  })
    .select("_id lineUserId originalImageIds originalImageId createdAt reportType")
    .sort({ createdAt: 1 })
    .lean();
  const doneIds = new Set(
    (await RawExtraction.find().select("requestId").lean()).map((e) => e.requestId?.toString())
  );
  let todo = reqs.filter((r) => !doneIds.has(r._id.toString()));
  const legacyCount = todo.filter((r) => r.reportType !== "weekly").length;
  console.log(`[backfill] requests ทั้งหมด: ${reqs.length} | มี extraction แล้ว: ${reqs.length - todo.length} | จะทำ: ${todo.length} (legacy รูปเดี่ยว ${legacyCount})`);

  if (LIMIT) todo = todo.slice(0, LIMIT);
  if (DRY_RUN) {
    todo.forEach((r) => console.log(`  - ${r._id} | ${r.lineUserId.slice(0, 10)}… | ${r.createdAt}`));
    console.log(`[dry-run] จะสกัด ${todo.length} รายการ — ไม่ได้ยิง AI จริง`);
    await mongoose.connection.close();
    process.exit(0);
  }

  let ok = 0, fail = 0, skip = 0;
  for (let i = 0; i < todo.length; i++) {
    const r = todo[i];
    const tag = `[${i + 1}/${todo.length}] ${r._id.toString().slice(-6)}`;
    try {
      // weekly = originalImageIds[3] ใน original_images | legacy = originalImageId เดี่ยว
      // บางใบอยู่ bucket เก่า "originals" — ลอง original_images ก่อนแล้วค่อย fallback
      let imageBuffers;
      if (r.reportType === "weekly") {
        imageBuffers = await Promise.all(
          r.originalImageIds.map((id) => gridfsBuffer("original_images", id))
        );
      } else {
        imageBuffers = [await gridfsBuffer("original_images", r.originalImageId)
          .catch(() => gridfsBuffer("originals", r.originalImageId))];
      }
      const user = await User.findOne({ lineUserId: r.lineUserId }).select("nickname displayName").lean();
      console.log(`${tag} กำลังสกัด (${r.lineUserId.slice(0, 10)}…)…`);
      await runRawExtraction({
        requestId: r._id,
        lineUserId: r.lineUserId,
        imageBuffers,
        mimeType: "image/jpeg",
        userDisplayName: user?.nickname ? `คุณ${user.nickname}` : r.lineUserId,
      });
      const doc = await RawExtraction.findOne({ requestId: r._id }).sort({ createdAt: -1 }).lean();
      if (doc?.status === "success") {
        ok++;
        console.log(`${tag} ✅ success (${doc.totalTokens} tokens, ${(doc.durationMs / 1000).toFixed(1)}s)`);
      } else {
        fail++;
        console.log(`${tag} ❌ failed: ${doc?.errorMessage || "no record"}`);
      }
    } catch (err) {
      skip++;
      console.log(`${tag} ⚠️ ข้าม — ${err.message}`);
    }
    if (i < todo.length - 1) await sleep(GAP_MS);
  }

  console.log(`\n[backfill] เสร็จ — success: ${ok} | failed: ${fail} | ข้าม (รูปหาย/error): ${skip}`);
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ backfill failed:", err);
  process.exit(1);
});
