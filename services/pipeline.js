import { User } from "../models/User.js";
import { Request, REQUEST_STATUS } from "../models/Request.js";
import { logStep } from "../models/RequestLog.js";
import { getGradeForScore } from "./gradeConfigService.js";
import {
  getImageContent,
  getProfile,
  replyImage,
  replyText,
  pushImage,
  pushText,
  pushHealthAdviceFlex,
  sendResultCardWithShare,
  showLoadingAnimation,
} from "./lineService.js";
import { analyzeImageWithCrossCheck, validateAiResult } from "./aiService.js";
import { composeCard, optimizeCardPng, optimizeImageForAi } from "./imageService.js";
import { saveImage } from "./storageService.js";
import { sendAdminAlert } from "./alertService.js";

const CONFIDENCE_THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD || 0.7);
const MIN_IMAGE_BYTES = 5 * 1024; // กันไฟล์เล็กผิดปกติ/เสีย

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
  };
}

// เรียกจาก webhook handler แบบไม่ await (ทำงานเบื้องหลังหลังตอบ 200 แล้ว)
export async function processImageMessage({ lineUserId, messageId, replyToken }) {
  await acquireSlot();
  let request;
  const startTime = Date.now();
  try {
    console.log(`[pipeline] ⚡ เริ่มสปีดประมวลผลรูป messageId=${messageId} (Active Jobs: ${activeJobs}/${MAX_CONCURRENT_JOBS}, Queue: ${jobQueue.length})`);

    // 1. ตอบกลับผู้ใช้ทันทีภายใน 1 วินาทีแรกด้วย replyToken ให้ผู้ใช้ทราบว่าระบบได้รับภาพแล้ว
    replyText(
      replyToken,
      "ได้รับรูปภาพแล้วค่ะ 📸 ระบบกำลังวิเคราะห์ข้อมูลด้วย AI สรุปผลให้อย่างละเอียด กรุณารอสักครู่นะคะ... ⏳",
      lineUserId
    ).catch(() => {});

    // เปิดสัญลักษณ์สปินเนอร์ Loading บนหน้าจอแชท LINE ของผู้ใช้
    showLoadingAnimation(lineUserId, 20).catch(() => {});

    // 2. ดึงรูปภาพจาก LINE และอัปเดต User Profile แบบทำคู่ขนาน (Parallel)
    const [imageBuffer, user] = await Promise.all([
      getImageContent(messageId),
      getProfile(lineUserId).then((prof) => User.touch(lineUserId, prof)).catch(() => null),
    ]);

    console.log(`[pipeline] ⚡ ดึงรูปสำเร็จ (${(imageBuffer.length / 1024).toFixed(1)} KB) ใน ${Date.now() - startTime}ms`);

    // สร้าง Request Record พร้อมผูกข้อมูล IMEI / Order ID ของผู้ใช้ไว้ในบันทึกคำขอ
    request = new Request({
      lineUserId,
      status: REQUEST_STATUS.ANALYZING,
      imei: user?.imei || "",
      orderSn: user?.orderSn || "",
      orderId: user?.orderId || "",
      verifiedIdentifier: user?.verifiedIdentifier || "",
    });
    request.save().catch(() => {});

    // 3. Optimize รูปภาพก่อนส่ง AI (ย่อขนาด ปรับ JPEG) + ส่ง AI วิเคราะห์ + เซฟรูปต้นฉบับลง GridFS
    console.log(`[pipeline] ⚡ Optimize รูปภาพและส่ง AI วิเคราะห์...`);
    const optimizedImageBuffer = await optimizeImageForAi(imageBuffer);

    const [origId, aiResponse] = await Promise.all([
      saveImage("original_images", imageBuffer, `${messageId}.jpg`, "image/jpeg").catch((err) => {
        console.error("[pipeline] saveImage(original_images) error:", err);
        return null;
      }),
      analyzeImageWithCrossCheck(optimizedImageBuffer, "image/jpeg", user || {}),
    ]);

    if (origId) {
      request.originalImageId = origId;
    }

    // บันทึกการใช้งาน token ของ Gemini ไว้เสมอไม่ว่าผลจะสำเร็จหรือไม่ (เสียโควต้าไปแล้ว)
    if (aiResponse.model) request.aiModel = aiResponse.model;
    if (aiResponse.usage) {
      request.promptTokens = aiResponse.usage.promptTokens;
      request.completionTokens = aiResponse.usage.completionTokens;
      request.totalTokens = aiResponse.usage.totalTokens;
    }

    if (!aiResponse.ok || !aiResponse.data?.detected) {
      console.warn(`[pipeline] ⚠️ AI วิเคราะห์ไม่สำเร็จหรือรูปไม่ชัด:`, aiResponse.error || aiResponse.data?.notes);
      request.status = REQUEST_STATUS.FAILED;
      request.errorMessage = aiResponse.data?.notes || aiResponse.error || "AI ตรวจไม่พบข้อมูลการนอน";
      request.save().catch(() => {});
      const noteMsg = aiResponse.data?.notes || "ขออภัยค่ะ ระบบไม่สามารถอ่านข้อมูลผลการนอนจากภาพนี้ได้ชัดเจนพอ กรุณาลองถ่ายภาพหรือส่งภาพหน้าจอ Smart Watch ใหม่อีกครั้งนะคะ 🌿";
      await pushText(lineUserId, noteMsg).catch(() => {});
      return;
    }

    // 4. ส่ง Flex Message สรุปร่างกายและบทวิเคราะห์เชิงลึกหาผู้ใช้ทันทีที่ AI ประมวลผลเสร็จ (ผู้ใช้ได้รับข้อความใน ~2-3 วินาที)
    const aiResult = aiResponse.data?.result || {};
    if (aiResult.healthAdvice || aiResult.aiSummary) {
      pushHealthAdviceFlex(lineUserId, aiResult).catch((err) =>
        console.warn("[pipeline] pushHealthAdviceFlex error:", err.message)
      );
    }
    console.log(`[pipeline] ⚡ AI วิเคราะห์สำเร็จใน ${Date.now() - startTime}ms (ส่งข้อความแนะนำแล้ว)`);

    // 5. ประกอบรูปการ์ด Infographic และบีบอัดขนาดไฟล์ก่อนเซฟลง GridFS
    const cardData = mapAiResultToCardData(aiResponse.data.result);
    const rawPngBuffer = composeCard(cardData);
    const pngBuffer = await optimizeCardPng(rawPngBuffer);

    // เซฟรูปลง GridFS
    const resultImageId = await saveImage(
      "results",
      pngBuffer,
      `${request._id}-result.png`,
      "image/png"
    );

    const imageUrl = `${process.env.PUBLIC_BASE_URL}/results/${resultImageId}.png`;

    // ส่งรูปการ์ดผลลัพธ์พร้อมปุ่มแชร์และ Quick Reply ตามหลังมาติดๆ
    await sendResultCardWithShare(lineUserId, imageUrl);
    console.log(`[pipeline] 🚀 ส่งรูปการ์ดเรียบร้อย! (ใช้เวลาทั้งหมด ${Date.now() - startTime}ms)`);

    await logStep({
      requestId: request._id,
      lineUserId,
      step: "line_push",
      status: "success",
      data: { imageUrl },
    });

    // บันทึกสถานะเสร็จสิ้นในฉากหลัง (หากติดธง needsReview ให้ตั้งเป็น NEEDS_REVIEW)
    request.status = aiResponse.needsReview ? REQUEST_STATUS.NEEDS_REVIEW : REQUEST_STATUS.SENT;
    request.aiResult = aiResponse.data?.result;
    request.resultImageId = resultImageId;
    request.completedAt = new Date();
    request.save().catch(() => {});

    // เก็บแอป/แบรนด์ Smart Watch ที่ AI ตรวจจับได้ล่าสุดไว้ที่โปรไฟล์ผู้ใช้ เพื่อดูสถิติสินค้า/แอปที่ลูกค้าใช้งาน
    if (aiResult.appName) {
      User.findOneAndUpdate(
        { lineUserId },
        { $set: { lastDetectedApp: aiResult.appName, lastDetectedAppAt: new Date() } }
      ).catch(() => {});
    }
  } catch (err) {
    console.error("[pipeline] error:", err);
    const isQuotaError = err.message?.includes("429") || err.message?.includes("โควต้า") || err.message?.includes("RESOURCE_EXHAUSTED");
    const userMsg = isQuotaError
      ? "ขออภัยค่ะ ขณะนี้ระบบ AI มีผู้ใช้งานเป็นจำนวนมาก กรุณารอสักครู่แล้วส่งภาพใหม่อีกครั้งนะคะ 🌿"
      : "ขออภัยค่ะ เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองส่งภาพใหม่อีกครั้งนะคะ";

    await pushText(lineUserId, userMsg).catch(() => {});

    // ส่งการแจ้งเตือนหา Admin เมื่อเกิดวิกฤต (เช่น โควต้าเต็ม)
    sendAdminAlert({
      key: isQuotaError ? "GEMINI_QUOTA_EXCEEDED" : "PIPELINE_ERROR",
      title: isQuotaError ? "Gemini API Rate Limit / โควต้าเต็ม" : "Pipeline Processing Error",
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
    releaseSlot();
  }
}


// เลือกใช้ Reply API ถ้ายังทันเวลา ไม่งั้นสลับไป Push API พร้อม log ทั้งสองแบบ
async function safeReplyOrPush(replyToken, lineUserId, text) {
  try {
    await replyText(replyToken, text, lineUserId);
    await logStep({ lineUserId, step: "line_reply", status: "success", data: { text } });
  } catch (err) {
    try {
      await pushText(lineUserId, text);
      await logStep({ lineUserId, step: "line_push", status: "success", data: { text } });
    } catch (pushErr) {
      await logStep({
        lineUserId,
        step: "line_push",
        status: "failed",
        errorDetail: pushErr.message,
      });
    }
  }
}

async function safeReplyOrPushImage(replyToken, lineUserId, imageUrl, request) {
  try {
    await replyImage(replyToken, imageUrl, lineUserId);
    await logStep({
      requestId: request._id,
      lineUserId,
      step: "line_reply",
      status: "success",
      data: { imageUrl },
    });
  } catch (err) {
    try {
      await pushImage(lineUserId, imageUrl);
      await logStep({
        requestId: request._id,
        lineUserId,
        step: "line_push",
        status: "success",
        data: { imageUrl },
      });
    } catch (pushErr) {
      await logStep({
        requestId: request._id,
        lineUserId,
        step: "line_push",
        status: "failed",
        errorDetail: pushErr.message,
      });
      throw pushErr; // ส่งไม่สำเร็จทั้งคู่ ให้ pipeline หลัก mark เป็น failed
    }
  }
}

// แปลงผลจาก AI ให้ตรงกับ parameter ของ renderBiokoopCard
function mapAiResultToCardData(r = {}) {
  const score = typeof r.score === "number" && r.score > 0 ? r.score : 78; // fallback score สวยงามหาก AI ไม่คืนค่า
  const gradeInfo = getGradeForScore(score);
  const grade = gradeInfo.grade || r.grade || "B";
  const headline = gradeInfo.headline || r.headline || "";
  const tips = gradeInfo.tips || r.tips || "";
  const aiSummary = r.aiSummary || gradeInfo.summary || "";

  return {
    appName: r.appName || "Smart Watch",
    headline: headline,
    tips: tips,
    score: score,
    grade: grade,
    stars: Math.round((score / 100) * 5),
    sleepTime: r.sleepTime || "ไม่มีข้อมูล",
    sleepTimeRange: r.sleepTimeRange || "",
    sleepEfficiency: r.sleepEfficiency || "ไม่มีข้อมูล",
    avgHeartRate: r.avgHeartRate || "ไม่มีข้อมูล",
    hrv: r.hrv || "ไม่มีข้อมูล",
    spo2: r.spo2 || "ไม่มีข้อมูล",
    aiSummary: aiSummary,
    deepSleep: { value: r.deepSleepTime || "-", percent: r.deepSleepPercent ?? 0 },
    lightSleep: { value: r.lightSleepTime || "-", percent: r.lightSleepPercent ?? 0 },
    remSleep: { value: r.remSleepTime || "-", percent: r.remSleepPercent ?? 0 },
    restlessness: { value: "-" },
    awake: { value: r.awakeTime || "-", percent: r.awakePercent ?? 0 },
  };
}
