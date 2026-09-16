import { User } from "../models/User.js";
import { Request, REQUEST_STATUS } from "../models/Request.js";
import { logStep } from "../models/RequestLog.js";
import {
  getImageContent,
  getProfile,
  replyText,
  pushText,
  sendWeeklyReportImages,
  showLoadingAnimation,
} from "./lineService.js";
import {
  composeWeeklyReport,
  composeWeeklyCombinedReport,
  optimizeCardPng,
  optimizeImageForAi,
} from "./imageService.js";
import { saveImage } from "./storageService.js";
import { sendAdminAlert } from "./alertService.js";
import { classifyWeeklyImage, analyzeWeeklyImages } from "./aiService.js";

// ─── WEEKLY REPORT BATCHING ───
// ลูกค้าส่งภาพ Screenshot จากแอป Kieslect 3 รูป (Body Load / Recovery / Sleep Quality)
// ระบบบัฟเฟอร์ราย user ไว้ในหน่วยความจำ จำแนกประเภทแต่ละรูปที่ส่งเข้ามา
// ครบทั้ง 3 ประเภทแล้วค่อยวิเคราะห์เทรนด์รายสัปดาห์รวมครั้งเดียว
const WEEKLY_IMAGE_COUNT = 3;
const BATCH_TTL_MS = Number(process.env.WEEKLY_BATCH_TTL_MS || 10 * 60 * 1000); // 10 นาที

// นิยามเช็กลิสต์ 3 หน้า พร้อม label สำหรับแสดงผล
const PAGE_DEFS = [
  { id: "body_load", label: "Body Load", emoji: "🏃" },
  { id: "recovery", label: "Recovery", emoji: "🔋" },
  { id: "sleep_quality", label: "Sleep Quality", emoji: "🌙" },
];

const imageBatches = new Map(); // lineUserId -> { items: [{ messageId, buffer, page }], timer, processing }

function expiryMessage() {
  return (
    `ระบบยังได้รับภาพไม่ครบ 3 หน้าภายในเวลาที่กำหนดค่ะ 🌿\n\n` +
    `หากต้องการรายงานสุขภาพรายสัปดาห์ ส่งภาพ Screenshot จากแอป Kieslect ให้ครบ 3 หน้านี้อีกครั้งได้เลยนะคะ\n` +
    PAGE_DEFS.map((p, i) => `${i + 1}) ${p.emoji} ${p.label}`).join("\n")
  );
}

// สร้างข้อความสถานะเช็กลิสต์: หน้าที่มีแล้ว ✅ / หน้าที่ยังขาด ⬜
function checklistMessage(batch) {
  const have = new Set(batch.items.map((it) => it.page).filter(Boolean));
  const lines = PAGE_DEFS.map((p) => {
    const got = have.has(p.id);
    return `${got ? "✅" : "⬜"} ${p.emoji} ${p.label}${got ? " (มีแล้ว)" : ""}`;
  });
  return lines.join("\n");
}

// สร้างข้อความแจ้งสถานะหลังรับภาพใหม่
function ackMessage(batch) {
  const have = new Set(batch.items.map((it) => it.page).filter(Boolean));
  const missing = PAGE_DEFS.filter((p) => !have.has(p.id));
  const gotCount = have.size;

  let header;
  if (gotCount === 0) {
    header = `ยังไม่สามารถจำแนกภาพนี้ได้ชัดเจนค่ะ 🤔 ลองส่งภาพใหม่อีกครั้งนะคะ`;
  } else if (missing.length === 0) {
    header = `ครบทั้ง 3 หน้าแล้วค่ะ 🤍 กำลังเริ่มวิเคราะห์เทรนด์สุขภาพรายสัปดาห์...`;
  } else {
    header = `ได้รับภาพ ${gotCount} จาก 3 หน้าแล้วค่ะ ✨ ยังขาดอีก ${missing.length} หน้า: ${missing.map((m) => m.label).join(", ")}`;
  }

  return (
    `${header}\n\n` +
    `สถานะการรับภาพ:\n${checklistMessage(batch)}\n\n` +
    (missing.length > 0
      ? `ส่งภาพ Screenshot จากแอป Kieslect ให้ครบทั้ง 3 หน้า (ลำดับไหนก็ได้ค่ะ) เมื่อครบ AI จะวิเคราะห์ให้ทันทีค่ะ`
      : `กรุณารอสักครู่นะคะ ⏳`)
  );
}

// ข้อความแจ้งภาพซ้ำประเภท
function duplicateMessage(pageLabel) {
  return (
    `ภาพนี้เป็นหน้า "${pageLabel}" ซ้ำกับที่มีแล้วค่ะ 😊\n\n` +
    `ระบบจะใช้ภาพแรกที่ส่งมาของแต่ละหน้าไปวิเคราะห์ ไม่ต้องส่งซ้ำนะคะ\n` +
    `ถ้าภาพแรกไม่ชัด ส่งภาพใหม่ที่ชัดกว่ามาแทนได้เลยค่ะ`
  );
}

function expireBatch(lineUserId) {
  const batch = imageBatches.get(lineUserId);
  if (!batch || batch.processing) return;
  imageBatches.delete(lineUserId);
  console.warn(`[pipeline] ⏱️ batch ของ ${lineUserId} หมดอายุ (มี ${batch.items.length}/${WEEKLY_IMAGE_COUNT} รูป)`);
  pushText(lineUserId, expiryMessage()).catch(() => {});
}

// เรียกจาก webhook handler ทุกครั้งที่ผู้ใช้ส่งรูปเข้ามา
export async function queueWeeklyImage({ lineUserId, messageId, replyToken }) {
  let batch = imageBatches.get(lineUserId);

  // กำลังประมวลผลรายงานชุดเดิมอยู่ -> แจ้งให้รอก่อน
  if (batch?.processing) {
    if (replyToken) {
      await replyText(
        replyToken,
        "รายงานชุดก่อนหน้ากำลังประมวลผลอยู่ค่ะ ⏳ กรุณารอผลสักครู่ แล้วค่อยส่งภาพชุดใหม่ได้เลยนะคะ",
        lineUserId
      ).catch(() => {});
    }
    return;
  }

  if (!batch) {
    batch = { items: [], timer: null, processing: false };
    batch.timer = setTimeout(() => expireBatch(lineUserId), BATCH_TTL_MS);
    imageBatches.set(lineUserId, batch);
  }

  // ดึงภาพจาก LINE ก่อน (ป้องกัน content หมดอายุ)
  let imageBuffer;
  try {
    imageBuffer = await getImageContent(messageId);
    console.log(
      `[pipeline] 📥 ดึงรูปของ ${lineUserId} (${(imageBuffer.length / 1024).toFixed(1)} KB, messageId=${messageId})`
    );
  } catch (err) {
    console.error("[pipeline] ดึงรูปจาก LINE ไม่สำเร็จ:", err.message);
    if (replyToken) {
      await replyText(
        replyToken,
        "ขออภัยค่ะ ดึงรูปนี้ไม่สำเร็จ กรุณาส่งรูปนี้ใหม่อีกครั้งนะคะ 📷",
        lineUserId
      ).catch(() => {});
    }
    return;
  }

  // จำแนกประเภทหน้าด้วย AI เร็ว ๆ (1 ครั้งต่อภาพ)
  let page = "unknown";
  try {
    const optimized = await optimizeImageForAi(imageBuffer);
    const result = await classifyWeeklyImage(optimized, "image/jpeg");
    if (result && result.page) page = result.page;
    console.log(`[pipeline] 🏷️ จำแนกภาพของ ${lineUserId}: ${page} (confidence=${result?.confidence ?? "-"})`);
  } catch (err) {
    console.warn(`[pipeline] จำแนกภาพล้มเหลว (${err.message}) — ถือว่า unknown`);
  }

  // ภาพที่จำแนกไม่ได้ -> แจ้งและไม่นับ
  if (page === "unknown") {
    if (replyToken) {
      await replyText(
        replyToken,
        `ไม่สามารถจำแนกภาพนี้ได้ชัดเจนค่ะ 🤔\n\n` +
          `ระบบต้องการภาพ Screenshot จากแอป Kieslect 3 หน้า ได้แก่\n` +
          PAGE_DEFS.map((p, i) => `${i + 1}) ${p.emoji} ${p.label}`).join("\n") +
          `\n\nลองส่งภาพใหม่ที่เป็นหน้าจอแอป Kieslect ชัดๆ อีกครั้งนะคะ`,
        lineUserId
      ).catch(() => {});
    }
    return;
  }

  // ภาพซ้ำประเภท -> แจ้ง ไม่นับซ้ำ (ใช้ภาพแรกของแต่ละประเภท)
  const existing = batch.items.find((it) => it.page === page);
  if (existing) {
    const pageDef = PAGE_DEFS.find((p) => p.id === page);
    if (replyToken) {
      await replyText(replyToken, duplicateMessage(pageDef?.label || page), lineUserId).catch(() => {});
    }
    return;
  }

  // ภาพใหม่ประเภทใหม่ -> เก็บเข้า batch
  batch.items.push({ messageId, buffer: imageBuffer, page });
  const have = new Set(batch.items.map((it) => it.page));
  console.log(`[pipeline] 🧺 batch ของ ${lineUserId}: มีแล้ว ${have.size}/${WEEKLY_IMAGE_COUNT} หน้า (${[...have].join(", ")})`);

  // รีเซ็ต TTL ทุกครั้งที่ได้ภาพใหม่ (ผู้ใช้กำลังส่งอยู่)
  clearTimeout(batch.timer);
  batch.timer = setTimeout(() => expireBatch(lineUserId), BATCH_TTL_MS);

  if (have.size < WEEKLY_IMAGE_COUNT) {
    if (replyToken) {
      await replyText(replyToken, ackMessage(batch), lineUserId).catch(() => {});
    }
    return;
  }

  // ครบทั้ง 3 ประเภทแล้ว -> เริ่มประมวลผล
  clearTimeout(batch.timer);
  batch.processing = true;
  if (replyToken) {
    await replyText(
      replyToken,
      `ครบทั้ง 3 หน้าแล้วค่ะ 🤍 AI กำลังวิเคราะห์เทรนด์สุขภาพรายสัปดาห์ของคุณ กรุณารอสักครู่นะคะ... ⏳`,
      lineUserId
    ).catch(() => {});
  }
  await processWeeklyReport({ lineUserId, batch, replyToken: null });
}

// ─── CONCURRENCY QUEUE SYSTEM ───
const MAX_CONCURRENT_JOBS = Number(process.env.MAX_CONCURRENT_AI_JOBS || 3);
let activeJobs = 0;
const jobQueue = [];

function acquireSlot() {
  if (activeJobs < MAX_CONCURRENT_JOBS) {
    activeJobs++;
    return Promise.resolve();
  }
  return new Promise((resolve) => jobQueue.push(resolve));
}

function releaseSlot() {
  activeJobs--;
  if (jobQueue.length > 0) {
    activeJobs++;
    const next = jobQueue.shift();
    next();
  }
}

export function getQueueStats() {
  return {
    activeJobs,
    queueLength: jobQueue.length,
    maxConcurrent: MAX_CONCURRENT_JOBS,
    activeBatches: imageBatches.size,
  };
}

// ประมวลผลรายงานสุขภาพรายสัปดาห์จากภาพ 3 รูปที่เก็บครบแล้ว
async function processWeeklyReport({ lineUserId, batch, replyToken }) {
  await acquireSlot();
  let request;
  const startTime = Date.now();

  try {
    replyText(
      replyToken,
      "ได้รับรูปครบ 3 รูปแล้วค่ะ 🤍 AI กำลังวิเคราะห์เทรนด์สุขภาพรายสัปดาห์ของคุณ กรุณารอสักครู่นะคะ... ⏳",
      lineUserId
    ).catch(() => {});
    showLoadingAnimation(lineUserId, 45).catch(() => {});

    // จัดลำดับภาพให้คงที่เสมอ: 1) Body Load -> 2) Recovery -> 3) Sleep Quality
    const PAGE_ORDER = { body_load: 0, recovery: 1, sleep_quality: 2 };
    batch.items.sort((a, b) => (PAGE_ORDER[a.page] ?? 99) - (PAGE_ORDER[b.page] ?? 99));

    const [optimizedBuffers, user] = await Promise.all([
      Promise.all(batch.items.map((it) => optimizeImageForAi(it.buffer))),
      getProfile(lineUserId).then((prof) => User.touch(lineUserId, prof)).catch(() => null),
    ]);

    // สร้าง Request Record พร้อมผูกข้อมูล IMEI / Order ID ของผู้ใช้ไว้
    request = new Request({
      lineUserId,
      status: REQUEST_STATUS.ANALYZING,
      reportType: "weekly",
      imei: user?.imei || "",
      orderSn: user?.orderSn || "",
      orderId: user?.orderId || "",
      verifiedIdentifier: user?.verifiedIdentifier || "",
    });
    request.save().catch(() => {});

    // เซฟรูปต้นฉบับทั้ง 3 ลง GridFS + ส่ง AI วิเคราะห์รวมครั้งเดียว
    console.log(`[pipeline] ⚡ เริ่มวิเคราะห์รายสัปดาห์ (${batch.items.length} รูป) ของ ${lineUserId}`);
    const originalImageIds = await Promise.all(
      batch.items.map((it) =>
        saveImage("original_images", it.buffer, `${it.messageId}.jpg`, "image/jpeg").catch((err) => {
          console.error("[pipeline] saveImage(original_images) error:", err);
          return null;
        })
      )
    );

    const aiResponse = await analyzeWeeklyImages(optimizedBuffers, "image/jpeg", user || {});

    request.originalImageIds = originalImageIds.filter(Boolean);
    if (aiResponse.model) request.aiModel = aiResponse.model;
    if (aiResponse.usage) {
      request.promptTokens = aiResponse.usage.promptTokens;
      request.completionTokens = aiResponse.usage.completionTokens;
      request.totalTokens = aiResponse.usage.totalTokens;
    }

    if (!aiResponse.ok || !aiResponse.data?.detected) {
      console.warn(`[pipeline] ⚠️ Weekly AI วิเคราะห์ไม่สำเร็จครบ 3 หน้า:`, aiResponse.error || aiResponse.data?.notes);
      request.status = REQUEST_STATUS.FAILED;
      request.errorMessage = aiResponse.data?.notes || aiResponse.error || "AI อ่านภาพไม่ครบ 3 หน้า";
      request.save().catch(() => {});
      const noteMsg =
        aiResponse.data?.notes ||
        `ขออภัยค่ะ ระบบอ่านข้อมูลจากภาพไม่ครบทั้ง 3 หน้า (Body Load / Recovery / Sleep Quality) กรุณาส่งภาพ Screenshot จากแอป Kieslect ครบทั้ง 3 หน้าอีกครั้งนะคะ 🌿`;
      await pushText(lineUserId, noteMsg).catch(() => {});
      return;
    }

    const aiData = aiResponse.data;
    console.log(`[pipeline] ⚡ Weekly AI วิเคราะห์สำเร็จใน ${Date.now() - startTime}ms (confidence=${aiData.confidence ?? "-"})`);

    // เรนเดอร์รายงาน 3 หน้า (พื้นขาว ไม่มีภาพภูเขา) แล้วบีบอัดขนาดไฟล์
    const { pngBuffers } = composeWeeklyReport(aiData);
    const optimizedPngs = [];
    for (const buf of pngBuffers) {
      optimizedPngs.push(await optimizeCardPng(Buffer.from(buf)));
    }

    // เซฟภาพผลลัพธ์ทั้ง 3 หน้าลง GridFS
    const resultImageIds = [];
    for (let i = 0; i < optimizedPngs.length; i++) {
      const id = await saveImage("results", optimizedPngs[i], `${request._id}-weekly-p${i + 1}.png`, "image/png");
      resultImageIds.push(id);
    }

    // รวมภาพ 3 หน้าเป็น 1 ภาพพาโนรามาแนวนอน (3 คอลัมน์) แล้วเซฟลง GridFS
    let combinedResultImageId = null;
    let combinedImageUrl = null;
    try {
      const combinedPng = await composeWeeklyCombinedReport(optimizedPngs);
      if (combinedPng) {
        const optCombined = await optimizeCardPng(combinedPng);
        combinedResultImageId = await saveImage(
          "results",
          optCombined,
          `${request._id}-weekly-combined.png`,
          "image/png"
        );
        combinedImageUrl = `${process.env.PUBLIC_BASE_URL}/results/${combinedResultImageId}.png`;
        console.log(`[pipeline] 🖼️ สร้างภาพพาโนรามา 3-in-1 สำเร็จ: ${combinedResultImageId}`);
      }
    } catch (combErr) {
      console.warn("[pipeline] composeWeeklyCombinedReport error:", combErr.message);
    }

    const imageUrls = resultImageIds.map((id) => `${process.env.PUBLIC_BASE_URL}/results/${id}.png`);

    // ส่งรายงานสุขภาพ (Flex Carousel + ภาพรวม 1 รูป + รูปเดี่ยว 3 หน้า + ข้อความสรุป) เข้าแชทผู้ใช้
    await sendWeeklyReportImages(lineUserId, imageUrls, aiData, combinedImageUrl);
    console.log(`[pipeline] 🚀 ส่งรายงานรายสัปดาห์เรียบร้อย! (ใช้เวลาทั้งหมด ${Date.now() - startTime}ms)`);

    await logStep({
      requestId: request._id,
      lineUserId,
      step: "line_push",
      status: "success",
      data: { imageUrls, combinedImageUrl },
    });

    request.status = aiResponse.needsReview ? REQUEST_STATUS.NEEDS_REVIEW : REQUEST_STATUS.SENT;
    request.aiResult = aiData;
    request.resultImageIds = resultImageIds;
    if (combinedResultImageId) request.combinedResultImageId = combinedResultImageId;
    request.completedAt = new Date();
    request.save().catch(() => {});

    // เก็บแอป/แบรนด์ Smart Watch ที่ AI ตรวจจับได้ล่าสุดไว้ที่โปรไฟล์ผู้ใช้
    if (aiData.appName) {
      User.findOneAndUpdate(
        { lineUserId },
        { $set: { lastDetectedApp: aiData.appName, lastDetectedAppAt: new Date() } }
      ).catch(() => {});
    }
  } catch (err) {
    console.error("[pipeline] error:", err);
    const isQuotaError =
      err.message?.includes("429") || err.message?.includes("โควต้า") || err.message?.includes("RESOURCE_EXHAUSTED");
    const userMsg = isQuotaError
      ? "ขออภัยค่ะ ขณะนี้ระบบ AI มีผู้ใช้งานเป็นจำนวนมาก กรุณารอสักครู่แล้วส่งภาพใหม่อีกครั้งนะคะ 🌿"
      : "ขออภัยค่ะ เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองส่งภาพใหม่อีกครั้งนะคะ";

    await pushText(lineUserId, userMsg).catch(() => {});

    sendAdminAlert({
      key: isQuotaError ? "GEMINI_QUOTA_EXCEEDED" : "PIPELINE_ERROR",
      title: isQuotaError ? "AI Rate Limit / โควต้าเต็ม" : "Pipeline Processing Error",
      message: `เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพของผู้ใช้ ${lineUserId}`,
      level: isQuotaError ? "CRITICAL" : "WARNING",
      details: err.message,
    }).catch(() => {});

    if (request) {
      request.status = REQUEST_STATUS.FAILED;
      request.errorMessage = err.message;
      request.completedAt = new Date();
      await request.save().catch(() => {});
      await logStep({
        requestId: request._id,
        lineUserId,
        step: "pipeline_error",
        status: "failed",
        errorDetail: err.message,
      }).catch(() => {});
    }
  } finally {
    imageBatches.delete(lineUserId);
    releaseSlot();
  }
}
