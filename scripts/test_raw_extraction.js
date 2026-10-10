// scripts/test_raw_extraction.js
// ทดสอบ flow สกัดข้อมูลดิบด้วยภาพ sample ใน samples/weekly/ — ยิง Gemini จริงผ่าน key ใน DB
// วิธีใช้:  node scripts/test_raw_extraction.js
// ข้อกำหนด: ต้องมี Gemini key เปิดใช้งานอย่างน้อย 1 ใบใน collection llmkeys (เพิ่มผ่านหน้า /llmkey2)

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { runRawExtraction } from "../services/rawExtractionService.js";
import { listKeys, getActiveKeyCount } from "../services/llmKeyService.js";
import { getLlmExtractConfig } from "../services/llmExtractConfigService.js";
import { RawExtraction } from "../models/RawExtraction.js";
import { Request } from "../models/Request.js";
import { saveImage } from "../services/storageService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_DIR = path.join(__dirname, "../samples/weekly");
const SAMPLE_FILES = ["kieslect_body_load.jpg", "kieslect_recovery.jpg", "kieslect_sleep_quality.jpg"];

async function main() {
  await connectDB();

  const keys = await listKeys();
  const activeCount = await getActiveKeyCount();
  console.log(`[test] keys ใน DB: ${keys.length} ใบ (active ${activeCount} ใบ)`);
  keys.forEach((k) =>
    console.log(`  - "${k.label}" ${k.keyPreview} active=${k.isActive} use=${k.useCount} fail=${k.failCount}`)
  );
  if (!activeCount) {
    console.error("\n❌ ไม่มี key ที่เปิดใช้งาน — เพิ่ม key ที่หน้า /llmkey2 ก่อนแล้วค่อยรันใหม่");
    process.exit(1);
  }

  const config = getLlmExtractConfig();
  console.log(`[test] config: model=${config.model} enabled=${config.enabled} maxTokens=${config.maxOutputTokens}`);

  const imageBuffers = SAMPLE_FILES.map((f) => {
    const p = path.join(SAMPLE_DIR, f);
    if (!fs.existsSync(p)) throw new Error(`ไม่พบไฟล์ sample: ${p}`);
    return fs.readFileSync(p);
  });
  console.log(`[test] โหลด sample ${imageBuffers.length} รูป — เริ่มสกัด...`);

  // จำลอง flow จริง: upload รูปต้นฉบับลง GridFS + สร้าง Request จริง → viewer จะโชว์ภาพได้
  const request = new Request({ lineUserId: "TEST_SCRIPT", reportType: "weekly", status: "received" });
  await request.save();
  const originalImageIds = await Promise.all(
    imageBuffers.map((buf, i) => saveImage("original_images", buf, `test-${request._id}-${i}.jpg`, "image/jpeg"))
  );
  request.originalImageIds = originalImageIds;
  await request.save();
  console.log(`[test] สร้าง Request ${request._id} + อัปโหลดรูป ${originalImageIds.length} รูปลง GridFS`);

  await runRawExtraction({
    requestId: request._id,
    lineUserId: "TEST_SCRIPT",
    imageBuffers,
    mimeType: "image/jpeg",
    userDisplayName: "test-script",
  });

  const doc = await RawExtraction.findOne({ requestId: request._id }).lean();
  if (!doc) {
    console.error("❌ ไม่พบ record ใน DB — อาจถูกปิดใน config (enabled=false)");
    process.exit(1);
  }

  console.log(`\n[test] ผลลัพธ์: status=${doc.status} key="${doc.keyLabel}" model=${doc.model}`);
  console.log(`[test] tokens: prompt=${doc.promptTokens} completion=${doc.completionTokens} total=${doc.totalTokens} duration=${doc.durationMs}ms`);
  if (doc.errorMessage) console.log(`[test] error: ${doc.errorMessage}`);

  if (doc.rawResult) {
    const out = path.join(__dirname, "test_raw_extraction_result.json");
    fs.writeFileSync(out, JSON.stringify(doc.rawResult, null, 2), "utf8");
    console.log(`[test] เขียนผลสกัดเต็มลง ${out}`);
    console.log(`[test] detected=${doc.rawResult.detected} foundPages=${JSON.stringify(doc.rawResult.foundPages)}`);
  }

  await mongoose.connection.close();
  process.exit(doc.status === "success" ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ test failed:", err);
  process.exit(1);
});
