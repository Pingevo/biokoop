import { Router } from "express";
import mongoose from "mongoose";
import { getQueueStats } from "../services/pipeline.js";

const router = Router();

// ฟังก์ชันแปลง uptime เป็นข้อความภาษาไทยที่อ่านง่าย
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d} วัน`);
  if (h > 0) parts.push(`${h} ชั่วโมง`);
  if (m > 0) parts.push(`${m} นาที`);
  if (s > 0 || parts.length === 0) parts.push(`${s} วินาที`);
  return parts.join(" ");
}

// GET /health หรือ /api/health
router.get(["/", "/api"], (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const isMongoConnected = mongoState === 1;

  // ---- หน่วยความจำ ----
  const memory = process.memoryUsage();
  const heapUsed = memory.heapUsed / 1024 / 1024;
  const heapTotal = memory.heapTotal / 1024 / 1024;
  const rssMB = memory.rss / 1024 / 1024;
  const heapUsedMB = heapUsed.toFixed(2);
  const heapTotalMB = heapTotal.toFixed(2);
  const rssFormatted = rssMB.toFixed(2);
  const memUsagePercent = heapTotal > 0 ? Math.round((heapUsed / heapTotal) * 100) : 0;

  let memStatus;
  if (memUsagePercent >= 90) memStatus = "🔴 วิกฤต — RAM เต็มมาก ควรรีสตาร์ท";
  else if (memUsagePercent >= 70) memStatus = "🟡 ใช้งานสูง — ควรเฝ้าระวัง";
  else memStatus = "🟢 ปกติ";

  // ---- Pipeline Queue ----
  const queueStats = getQueueStats();
  let queueStatus;
  if (queueStats.queueLength >= queueStats.maxConcurrent) {
    queueStatus = `🔴 คิวเต็ม — ${queueStats.queueLength} งานกำลังรอ`;
  } else if (queueStats.queueLength > 0) {
    queueStatus = `🟡 มีคิว — ${queueStats.queueLength} งานกำลังรอ`;
  } else if (queueStats.activeJobs > 0) {
    queueStatus = `🔵 กำลังประมวลผล — ${queueStats.activeJobs}/${queueStats.maxConcurrent} งาน`;
  } else {
    queueStatus = "🟢 ว่าง — ไม่มีงานค้างในคิว";
  }

  // ---- สถานะโดยรวม ----
  const isOk = isMongoConnected;
  const httpStatus = isOk ? 200 : 503;

  const uptimeSeconds = Math.floor(process.uptime());

  // ---- Checklist สรุปรายการ ----
  const checklist = {
    database: isMongoConnected ? "✅ เชื่อมต่อ MongoDB แล้ว" : "❌ MongoDB ขาดการเชื่อมต่อ",
    memory: memUsagePercent < 90 ? "✅ RAM ปกติ" : "⚠️ RAM ใกล้เต็ม",
    pipelineQueue: queueStats.queueLength < queueStats.maxConcurrent ? "✅ คิวปกติ" : "⚠️ คิวเต็ม",
  };

  res.status(httpStatus).json({
    // ---- สถานะโดยรวม ----
    status: isOk ? "ok" : "degraded",
    statusMessage: isOk
      ? "✅ ระบบ biokoop ทำงานปกติทุกส่วน"
      : "⚠️ ระบบมีบางส่วนที่ผิดปกติ — กรุณาตรวจสอบ",
    service: "biokoop",
    timestamp: new Date().toISOString(),

    // ---- เวลา Uptime ----
    uptime: {
      seconds: uptimeSeconds,
      formatted: formatUptime(uptimeSeconds),
      note: "เวลาที่เซิร์ฟเวอร์ทำงานต่อเนื่องโดยไม่รีสตาร์ท",
    },

    // ---- ฐานข้อมูล MongoDB ----
    database: {
      connected: isMongoConnected,
      status: isMongoConnected
        ? "🟢 เชื่อมต่อแล้ว (MongoDB)"
        : "🔴 ขาดการเชื่อมต่อ (MongoDB)",
      readyState: mongoState,
      readyStateLabel: ["ตัดการเชื่อมต่อ", "เชื่อมต่อแล้ว", "กำลังเชื่อมต่อ", "กำลังตัดการเชื่อมต่อ"][mongoState] || "ไม่ทราบสถานะ",
      note: "readyState: 0=ตัดแล้ว, 1=เชื่อมต่อแล้ว, 2=กำลังเชื่อมต่อ, 3=กำลังตัด",
    },

    // ---- หน่วยความจำ (RAM) ----
    memory: {
      heapUsedMB: `${heapUsedMB} MB`,
      heapTotalMB: `${heapTotalMB} MB`,
      rssMB: `${rssFormatted} MB`,
      usagePercent: `${memUsagePercent}%`,
      statusMessage: memStatus,
      note: "heapUsed = RAM ที่ใช้จริง | heapTotal = RAM ที่จองไว้ | rss = RAM ทั้งหมดของโปรเซส",
    },

    // ---- คิวประมวลผลภาพ (Pipeline Queue) ----
    pipelineQueue: {
      activeJobs: queueStats.activeJobs,
      queueLength: queueStats.queueLength,
      maxConcurrent: queueStats.maxConcurrent,
      statusMessage: queueStatus,
      note: `activeJobs = งานที่กำลังรัน | queueLength = งานที่รอคิว | maxConcurrent = งานสูงสุดที่รันพร้อมกันได้ (${queueStats.maxConcurrent} งาน)`,
    },

    // ---- สรุป Checklist ----
    checklist,
  });
});

export default router;
