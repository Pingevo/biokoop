// extractionQueue.js
// ═══════════════════════════════════════════════════════════════════
// Durable queue สำหรับ raw extraction — กันงานหลุดตอน server restart
// ═══════════════════════════════════════════════════════════════════
// ปัญหาเดิม: pipeline เรียก runRawExtraction แบบ fire-and-forget ในหน่วยความจำ
// ถ้า process ตาย/restart กลางทาง → request เซฟแล้วแต่ไม่มี RawExtraction เลย
//
// แก้: ทุกครั้งที่ต้องสกัด ให้ enqueueExtraction() — สร้าง ExtractionJob ใน Mongo
// ก่อนแล้วค่อยรัน ถ้า process ตาย → job ค้าง running/pending → ตอนบูตกู้กลับมาทำต่อ
// ผลลัพธ์ตัดสินจาก RawExtraction record (service เดิมเขียน doc เสมอ ไม่ throw)
// ═══════════════════════════════════════════════════════════════════

import { ExtractionJob } from "../models/ExtractionJob.js";
import { RawExtraction } from "../models/RawExtraction.js";
import { Request } from "../models/Request.js";
import { User } from "../models/User.js";
import { runRawExtraction, loadRequestImageBuffers } from "./rawExtractionService.js";

const MAX_ATTEMPTS = 3;             // เกินนี้ → failed (backfill script ปิดท้ายอยู่แล้ว)
const RETRY_DELAY_MS = 60_000;      // retry หลัง fail — กัน rate-limit ยิงซ้ำถี่
const DRAIN_INTERVAL_MS = 5 * 60_000; // worker กวาดงาน pending ทุก 5 นาที
const DRAIN_BATCH = 10;

let drainRunning = false;

// pipeline เรียกตัวนี้แทน runRawExtraction ตรงๆ — บันทึก job ก่อนแล้วค่อยยิง (fire & forget)
export async function enqueueExtraction(args) {
  const { requestId, lineUserId } = args;
  try {
    await ExtractionJob.updateOne(
      { requestId },
      { $set: { lineUserId, status: "running", lastError: "", notBefore: null },
        $setOnInsert: { attempts: 0 } },
      { upsert: true }
    );
  } catch (err) {
    // Mongo ล่ม/เขียนไม่ได้ → ยังรัน extraction ได้ตามเดิม (ดีกว่าไม่ทำอะไรเลย)
    console.error("[extractionQueue] บันทึก job ไม่สำเร็จ:", err.message);
  }
  _runAndSettle(args);
}

// รันแล้วตัดสินจาก record — สำเร็จ → done / ไม่สำเร็จ → pending รอ retry
async function _runAndSettle(args) {
  await runRawExtraction(args).catch(() => {});
  await _settle(args.requestId);
}

async function _settle(requestId) {
  try {
    const doc = await RawExtraction.findOne({ requestId })
      .sort({ createdAt: -1 }).select("status errorMessage").lean();
    if (doc?.status === "success") {
      await ExtractionJob.updateOne({ requestId }, { status: "done", lastError: "" });
    } else {
      await ExtractionJob.updateOne(
        { requestId },
        { status: "pending", lastError: (doc?.errorMessage || "no record").slice(0, 300),
          notBefore: new Date(Date.now() + RETRY_DELAY_MS), $inc: { attempts: 1 } }
      );
    }
  } catch (err) {
    console.error("[extractionQueue] settle ไม่สำเร็จ:", err.message);
  }
}

// กวาดงาน pending ที่ถึงเวลา — retry โดยโหลดรูปกลับจาก GridFS (buffer เดิมหายไปแล้ว)
export async function drainExtractionJobs() {
  if (drainRunning) return;
  drainRunning = true;
  try {
    const jobs = await ExtractionJob.find({
      status: "pending",
      attempts: { $lt: MAX_ATTEMPTS },
      $or: [{ notBefore: null }, { notBefore: { $lte: new Date() } }],
    }).sort({ createdAt: 1 }).limit(DRAIN_BATCH).lean();

    for (const job of jobs) {
      const tag = `[extractionQueue] ${job.requestId.toString().slice(-6)}`;
      try {
        // เคยสำเร็จแล้ว (เช่น backfill วิ่งแซง) → ปิด job ทิ้ง
        const done = await RawExtraction.exists({ requestId: job.requestId, status: "success" });
        if (done) {
          await ExtractionJob.updateOne({ _id: job._id }, { status: "done" });
          continue;
        }
        const req = await Request.findById(job.requestId)
          .select("lineUserId reportType originalImageIds originalImageId").lean();
        const imageBuffers = await loadRequestImageBuffers(req);
        const user = await User.findOne({ lineUserId: job.lineUserId })
          .select("nickname displayName").lean();

        console.log(`${tag} retry #${job.attempts + 1} กำลังสกัด…`);
        await runRawExtraction({
          requestId: job.requestId,
          lineUserId: job.lineUserId,
          imageBuffers,
          mimeType: "image/jpeg",
          userDisplayName: user?.nickname ? `คุณ${user.nickname}` : job.lineUserId,
        });
        await _settle(job.requestId);
      } catch (err) {
        const attempts = job.attempts + 1;
        await ExtractionJob.updateOne(
          { _id: job._id },
          { status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
            attempts,
            lastError: String(err.message || err).slice(0, 300),
            notBefore: new Date(Date.now() + RETRY_DELAY_MS) }
        ).catch(() => {});
        console.warn(`${tag} ⚠️ retry ไม่สำเร็จ: ${err.message}`);
      }
    }
  } finally {
    drainRunning = false;
  }
}

// เรียกตอน server start — กู้ job ที่ตายค้างกลาง restart แล้วเปิด worker
export async function startExtractionWorker() {
  try {
    const stale = await ExtractionJob.updateMany(
      { status: "running" }, { status: "pending", notBefore: null }
    );
    if (stale.modifiedCount) {
      console.log(`[extractionQueue] กู้ job ค้างจาก restart: ${stale.modifiedCount} งาน → pending`);
    }
    const pending = await ExtractionJob.countDocuments({ status: "pending" });
    if (pending) console.log(`[extractionQueue] มี job pending ${pending} งาน — เริ่มกวาด`);
  } catch (err) {
    console.error("[extractionQueue] recovery ไม่สำเร็จ:", err.message);
  }
  drainExtractionJobs().catch(() => {});
  const timer = setInterval(() => drainExtractionJobs().catch(() => {}), DRAIN_INTERVAL_MS);
  timer.unref?.();
}
