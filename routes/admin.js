import fs from "fs";
import path from "path";
import { Router } from "express";
import { Request, REQUEST_STATUS } from "../models/Request.js";
import { User } from "../models/User.js";
import { AdminUser } from "../models/AdminUser.js";
import { RequestLog, logStep } from "../models/RequestLog.js";
import { LineMessageLog } from "../models/LineMessageLog.js";
import { openDownloadStream, getFileMetadata, saveImage } from "../services/storageService.js";
import { pushImage, pushText, sendWeeklyReportImages } from "../services/lineService.js";
import { getCardConfig, saveCardConfig } from "../services/cardConfigService.js";
import { getKieslectConfig, saveKieslectConfig } from "../services/kieslectConfigService.js";
import { getBotMessagesConfig, saveBotMessagesConfig, resetBotMessagesConfig } from "../services/botMessagesConfigService.js";
import { getPricingConfig, savePricingConfig, estimateCost, getPricingPresets } from "../services/apiPricingConfigService.js";
import { getGradeConfig, saveGradeConfig, getGradeForScore } from "../services/gradeConfigService.js";
import { getRegistrationConfig, saveRegistrationConfig } from "../services/registrationConfigService.js";
import { lookupInDbWallet } from "../services/dbWalletService.js";
import { RegistrationCode } from "../models/RegistrationCode.js";
import { renderBiokoopCard } from "../services/cardTemplate.js";
import { analyzeImageWithCrossCheck, validateAiResult, analyzeWeeklyImages, checkWeeklyAnomalies, checkDailyAnomalies } from "../services/aiService.js";
import { initImageService, composeWeeklyReport, composeWeeklyCombinedReport } from "../services/imageService.js";
import { renderWeeklyReportSvgs } from "../services/weeklyReportTemplate.js";
import { requireAdmin, requireSuperadmin } from "../middlewares/adminAuth.js";
import { AdminAuditLog, logAdminAction } from "../models/AdminAuditLog.js";
import { AiTestAudit } from "../models/AiTestAudit.js";
import {
  aggregateUserMonthlyData,
  generateMockMonthlyData,
  analyzeMonthlyDataWithAi,
  saveMonthlyAuditFeedback,
  getMonthlyAuditHistory,
} from "../services/monthlyAnalyticsService.js";

function maskKey(key) {
  if (!key) return "ไม่ได้ตั้งค่า (Not Set)";
  if (key.length <= 8) return "********";
  return key.substring(0, 6) + "..." + key.substring(key.length - 4);
}


const router = Router();

// GET /admin/api/me — ข้อมูล admin ปัจจุบัน (ใช้ตอน SPA เปิดขึ้นมา เช็ค session ยัง live อยู่ไหม)
router.get("/api/me", requireAdmin, (req, res) => {
  res.json({
    ok: true,
    admin: {
      _id: req.admin._id,
      system81_username: req.admin.system81_username,
      email: req.admin.email,
      name: req.admin.name,
      role: req.admin.role,
      lastLoginAt: req.admin.lastLoginAt,
    },
  });
});

// GET /admin/api/stats
router.get("/api/stats", requireAdmin, async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalRequests,
      needsReview,
      sent,
      failed,
      qualityFailed,
      todayRequests,
      totalUsers,
      activeUsers,
      totalLineMessages,
      todayLineMessages,
      pushLineMessages,
      replyLineMessages,
      incomingLineMessages,
      dailyTrendRaw,
      modelBreakdown,
    ] = await Promise.all([
      Request.countDocuments(),
      Request.countDocuments({ status: "needs_review" }),
      Request.countDocuments({ status: "sent" }),
      Request.countDocuments({ status: "failed" }),
      Request.countDocuments({ status: "quality_failed" }),
      Request.countDocuments({ createdAt: { $gte: startOfDay } }),
      User.countDocuments(),
      User.countDocuments({ status: "active" }),
      LineMessageLog.countDocuments(),
      LineMessageLog.countDocuments({ createdAt: { $gte: startOfDay } }),
      LineMessageLog.countDocuments({ sendType: "push" }),
      LineMessageLog.countDocuments({ sendType: "reply" }),
      LineMessageLog.countDocuments({ sendType: "incoming" }),
      Request.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+07:00" } },
            total: { $sum: 1 },
            sent: { $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] } },
            needsReview: { $sum: { $cond: [{ $eq: ["$status", "needs_review"] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Request.aggregate([
        { $match: { totalTokens: { $gt: 0 } } },
        {
          $group: {
            _id: { $ifNull: ["$aiModel", "gemini-3.5-flash-lite"] },
            requestCount: { $sum: 1 },
            totalTokens: { $sum: "$totalTokens" },
            promptTokens: { $sum: "$promptTokens" },
            completionTokens: { $sum: "$completionTokens" },
          },
        },
      ]),
    ]);

    // เติมวันย้อนหลัง 7 วันให้ครบถ้วนเผื่อวันไหนไม่มี request
    const dailyTrendMap = new Map(dailyTrendRaw.map((d) => [d._id, d]));
    const dailyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const entry = dailyTrendMap.get(dateStr) || { _id: dateStr, total: 0, sent: 0, needsReview: 0, failed: 0 };
      dailyTrend.push({
        date: dateStr,
        dayLabel: d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" }),
        total: entry.total,
        sent: entry.sent,
        needsReview: entry.needsReview,
        failed: entry.failed,
      });
    }

    // คำนวณสรุป Token รวมและยอดเงินสะสมทั้งระบบ
    let totalPromptTokensAll = 0;
    let totalCompletionTokensAll = 0;
    let totalTokensAll = 0;
    let totalEstimatedCostAll = 0;

    for (const m of modelBreakdown) {
      totalPromptTokensAll += m.promptTokens || 0;
      totalCompletionTokensAll += m.completionTokens || 0;
      totalTokensAll += m.totalTokens || 0;
      totalEstimatedCostAll += estimateCost(m._id, m.promptTokens || 0, m.completionTokens || 0);
    }

    const pricingConfig = getPricingConfig();
    const isFree = pricingConfig.planMode === "free";
    const currency = pricingConfig.currency || "USD";
    const costFormattedAll = isFree
      ? "$0.000000 (ฟรี 100%)"
      : `${currency} ${totalEstimatedCostAll.toFixed(6)}`;

    const apiKeysStatus = {
      gemini: {
        name: "Google Gemini API Key",
        configured: !!process.env.GEMINI_API_KEY,
        masked: maskKey(process.env.GEMINI_API_KEY),
      },
      openrouter: {
        name: "OpenRouter API Key (Cross-Check)",
        configured: !!process.env.OPENROUTER_API_KEY,
        masked: maskKey(process.env.OPENROUTER_API_KEY),
      },
      lineChannelAccessToken: {
        name: "LINE Channel Access Token",
        configured: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
        masked: maskKey(process.env.LINE_CHANNEL_ACCESS_TOKEN),
      },
      lineChannelSecret: {
        name: "LINE Channel Secret",
        configured: !!process.env.LINE_CHANNEL_SECRET,
        masked: maskKey(process.env.LINE_CHANNEL_SECRET),
      },
    };

    res.json({
      ok: true,
      stats: {
        totalRequests,
        needsReview,
        sent,
        failed,
        qualityFailed,
        todayRequests,
        totalUsers,
        activeUsers,
        totalLineMessages,
        todayLineMessages,
        pushLineMessages,
        replyLineMessages,
        incomingLineMessages,
        dailyTrend,
        modelBreakdown,
        totalPromptTokensAll,
        totalCompletionTokensAll,
        totalTokensAll,
        totalEstimatedCostAll,
        costFormattedAll,
        apiKeysStatus,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/requests
router.get("/api/requests", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const status = req.query.status;
    const search = req.query.search;

    const query = {};
    if (status && status !== "all") {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { lineUserId: { $regex: search, $options: "i" } },
        { errorMessage: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Request.countDocuments(query);
    const requests = await Request.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // ดึง User Profile มาผูกคู่กับ Request เพื่อแสดงผลชื่อ/รูปโปรไฟล์
    const userIds = [...new Set(requests.map((r) => r.lineUserId))];
    const users = await User.find({ lineUserId: { $in: userIds } }).lean();
    const userMap = new Map(users.map((u) => [u.lineUserId, u]));

    const items = requests.map((r) => ({
      ...r,
      user: userMap.get(r.lineUserId) || { lineUserId: r.lineUserId, displayName: "ผู้ใช้ LINE" },
      hasOriginalImage: !!(r.originalImageId || r.originalImageIds?.length),
      hasResultImage: !!(r.resultImageId || r.resultImageIds?.length),
    }));

    res.json({
      ok: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/requests/:id
router.get("/api/requests/:id", requireAdmin, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id).lean();
    if (!request) return res.status(404).json({ ok: false, error: "ไม่พบคำขอนี้" });

    const user = await User.findOne({ lineUserId: request.lineUserId }).lean();
    const logs = await RequestLog.find({ requestId: request._id })
      .sort({ createdAt: 1 })
      .lean();

    const [originalMeta, resultMeta] = await Promise.all([
      request.originalImageId ? getFileMetadata("original_images", request.originalImageId) : null,
      request.resultImageId ? getFileMetadata("results", request.resultImageId) : null,
    ]);

    const originalIds = Array.isArray(request.originalImageIds) && request.originalImageIds.length
      ? request.originalImageIds
      : request.originalImageId ? [request.originalImageId] : [];
    const resultIds = Array.isArray(request.resultImageIds) && request.resultImageIds.length
      ? request.resultImageIds
      : request.resultImageId ? [request.resultImageId] : [];

    res.json({
      ok: true,
      request: {
        ...request,
        user: user || { lineUserId: request.lineUserId, displayName: "ผู้ใช้ LINE" },
        logs,
        originalImageUrl: request.originalImageId ? `/admin/api/requests/${request._id}/original` : null,
        resultImageUrl: request.resultImageId ? `/results/${request.resultImageId}.png` : null,
        originalImageUrls: originalIds.map((_, idx) => `/admin/api/requests/${request._id}/originals/${idx}`),
        resultImageUrls: resultIds.map((id) => `/results/${id}.png`),
        originalFileSize: originalMeta ? originalMeta.length : null,
        resultFileSize: resultMeta ? resultMeta.length : null,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/requests/:id/original - ดูรูปภาพต้นฉบับลูกค้า
router.get("/api/requests/:id/original", requireAdmin, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request || !request.originalImageId) {
      return res.status(404).send("Image not found");
    }
    const stream = openDownloadStream("original_images", request.originalImageId);
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "private, max-age=3600");
    stream.on("error", () => res.status(404).send("Stream error"));
    stream.pipe(res);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /admin/api/requests/:id/originals/:idx - ดูรูปต้นฉบับรายใบของรายงานรายสัปดาห์ (0-2)
router.get("/api/requests/:id/originals/:idx", requireAdmin, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    const idx = parseInt(req.params.idx) || 0;
    const id = request?.originalImageIds?.[idx];
    if (!id) return res.status(404).send("Image not found");
    const stream = openDownloadStream("original_images", id);
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "private, max-age=3600");
    stream.on("error", () => res.status(404).send("Stream error"));
    stream.pipe(res);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /admin/api/requests/:id/approve-send - อนุมัติส่งรูปผลลัพธ์ LINE Push
router.post("/api/requests/:id/approve-send", requireAdmin, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ ok: false, error: "ไม่พบคำขอนี้" });

    const resultIds = Array.isArray(request.resultImageIds) && request.resultImageIds.length
      ? request.resultImageIds
      : request.resultImageId ? [request.resultImageId] : [];

    if (!resultIds.length) {
      return res.status(400).json({ ok: false, error: "คำขอนี้ยังไม่มีรูปการ์ดผลลัพธ์ที่สร้างเสร็จ" });
    }

    const imageUrls = resultIds.map((id) => `${process.env.PUBLIC_BASE_URL}/results/${id}.png`);

    // ส่ง LINE Push (รายสัปดาห์: ภาพ 3 หน้า + สรุป, เดิม: ภาพเดียว)
    if (imageUrls.length > 1) {
      const combinedUrl = request.combinedResultImageId
        ? `${process.env.PUBLIC_BASE_URL}/results/${request.combinedResultImageId}.png`
        : null;
      await sendWeeklyReportImages(request.lineUserId, imageUrls, request.aiResult, combinedUrl);
    } else {
      await pushImage(request.lineUserId, imageUrls[0]);
    }
    const imageUrl = imageUrls.join(" ");

    // บันทึก Log และเปลี่ยนสถานะเป็น SENT
    request.status = REQUEST_STATUS.SENT;
    request.completedAt = new Date();
    await request.save();

    await logStep({
      requestId: request._id,
      lineUserId: request.lineUserId,
      step: "line_push",
      status: "success",
      data: { note: "อนุมัติส่งโดย Admin", imageUrl },
    });

    await logAdminAction(req, "approve_send", request._id, "Request", {
      lineUserId: request.lineUserId,
      imageUrl,
    });

    res.json({ ok: true, message: "อนุมัติและส่งรูปภาพผ่าน LINE เรียบร้อยแล้ว" });
  } catch (err) {
    res.status(500).json({ ok: false, error: "ส่ง LINE ไม่สำเร็จ: " + err.message });
  }
});

// POST /admin/api/requests/:id/update-status - ปรับสถานะคำขอด้วยตนเอง
router.post("/api/requests/:id/update-status", requireAdmin, async (req, res) => {
  try {
    const { status, errorMessage } = req.body;
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ ok: false, error: "ไม่พบคำขอนี้" });

    if (status) request.status = status;
    if (errorMessage !== undefined) request.errorMessage = errorMessage;
    if (["sent", "failed", "quality_failed"].includes(status)) {
      request.completedAt = new Date();
    }

    await request.save();

    await logStep({
      requestId: request._id,
      lineUserId: request.lineUserId,
      step: "validation",
      status: "success",
      data: { note: `Admin เปลี่ยนสถานะเป็น ${status}` },
    });

    await logAdminAction(req, "update_status", request._id, "Request", {
      lineUserId: request.lineUserId,
      newStatus: status,
      errorMessage: errorMessage || null,
    });

    res.json({ ok: true, request });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/users
router.get("/api/users", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search;

    const query = {};
    if (search) {
      query.$or = [
        { displayName: { $regex: search, $options: "i" } },
        { nickname: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { province: { $regex: search, $options: "i" } },
        { lineUserId: { $regex: search, $options: "i" } },
        { imei: { $regex: search, $options: "i" } },
        { orderSn: { $regex: search, $options: "i" } },
        { orderId: { $regex: search, $options: "i" } },
        { verifiedIdentifier: { $regex: search, $options: "i" } },
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ lastSeenAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const formattedUsers = users.map((u) => {
      const isRegistered = !!u.isRegistered;
      const fullName = (u.firstName || u.lastName) ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : (u.nickname || u.displayName || "ผู้ใช้ LINE");
      const birthDateStr = u.birthdate ? new Date(u.birthdate).toISOString().split("T")[0] : "";

      return {
        ...u,
        isRegistered,
        requestCount: u.totalRequests || 0,
        lastActiveAt: u.lastSeenAt || u.updatedAt,
        registration: isRegistered
          ? {
            fullName,
            nickname: u.nickname || "",
            phone: u.phone || "",
            birthDate: birthDateStr,
            province: u.province || "",
            gender: u.gender || "unspecified",
            imei: u.imei || "",
            orderSn: u.orderSn || "",
            orderId: u.orderId || "",
            verifiedIdentifier: u.verifiedIdentifier || "",
            verifiedIdentifierType: u.verifiedIdentifierType || "",
            verifiedIdentifierSource: u.verifiedIdentifierSource || "",
            dbWalletDetail: u.dbWalletDetail || null,
            verifiedAt: u.verifiedAt || null,
          }
          : null,
      };
    });

    res.json({
      ok: true,
      data: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/users/:id/status - บล็อก/เปิดใช้งาน ผู้ใช้
router.post("/api/users/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "blocked"].includes(status)) {
      return res.status(400).json({ ok: false, error: "สถานะไม่ถูกต้อง" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );

    if (!user) return res.status(404).json({ ok: false, error: "ไม่พบผู้ใช้" });

    await logAdminAction(req, status === "blocked" ? "user_block" : "user_unblock", user._id, "User", {
      lineUserId: user.lineUserId,
      newStatus: status,
    });

    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/logs - ดู Audit Logs ทั้งหมด
router.get("/api/logs", requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const step = req.query.step;

    const query = {};
    if (step && step !== "all") query.step = step;

    const logs = await RequestLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ ok: true, data: logs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/line-messages - ดูประวัติการส่งข้อความ LINE ที่ระบบส่งออกทั้งหมดอย่างละเอียด
router.get("/api/line-messages", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const sendType = req.query.sendType;
    const messageType = req.query.messageType;
    const search = req.query.search;

    const query = {};
    if (sendType && sendType !== "all") query.sendType = sendType;
    if (messageType && messageType !== "all") query.messageType = messageType;

    if (search) {
      query.$or = [
        { lineUserId: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
      ];
    }

    const total = await LineMessageLog.countDocuments(query);
    const messages = await LineMessageLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const lineUserIds = [...new Set(messages.map((m) => m.lineUserId))];
    const users = await User.find({ lineUserId: { $in: lineUserIds } }).lean();
    const userMap = new Map(users.map((u) => [u.lineUserId, u]));

    const items = messages.map((m) => ({
      ...m,
      user: userMap.get(m.lineUserId) || { lineUserId: m.lineUserId, displayName: "ผู้ใช้ LINE" },
    }));

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayCount, pushCount, replyCount, incomingCount] = await Promise.all([
      LineMessageLog.countDocuments({ createdAt: { $gte: startOfDay } }),
      LineMessageLog.countDocuments({ sendType: "push" }),
      LineMessageLog.countDocuments({ sendType: "reply" }),
      LineMessageLog.countDocuments({ sendType: "incoming" }),
    ]);

    res.json({
      ok: true,
      data: items,
      totals: {
        total,
        todayCount,
        pushCount,
        replyCount,
        incomingCount,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/users/:lineUserId/chat-history - ดึงประวัติการแชทรายบุคคลสำหรับ Chat Simulator
router.get("/api/users/:lineUserId/chat-history", requireAdmin, async (req, res) => {
  try {
    const { lineUserId } = req.params;
    const user = await User.findOne({ lineUserId }).lean();
    if (!user) {
      return res.status(404).json({ ok: false, error: "ไม่พบผู้ใช้นี้ในระบบ" });
    }

    const [messages, requests] = await Promise.all([
      LineMessageLog.find({ lineUserId }).sort({ createdAt: 1 }).lean(),
      Request.find({ lineUserId }).sort({ createdAt: 1 }).lean(),
    ]);

    res.json({
      ok: true,
      user,
      messages,
      requests,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/users/:lineUserId/send-message - ส่งข้อความทักทาย/ตอบกลับไปยังผู้ใช้ (Simulated / Real Push)
router.post("/api/users/:lineUserId/send-message", requireAdmin, async (req, res) => {
  try {
    const { lineUserId } = req.params;
    const { message, imageBase64 } = req.body || {};
    const text = (message || "").trim();

    if (!text && !imageBase64) {
      return res.status(400).json({ ok: false, error: "กรุณาระบุข้อความหรือแนบรูปภาพที่ต้องการส่ง" });
    }

    const user = await User.findOne({ lineUserId }).lean();
    if (!user) {
      return res.status(404).json({ ok: false, error: "ไม่พบผู้ใช้นี้ในระบบ" });
    }

    if (imageBase64 && !process.env.PUBLIC_BASE_URL) {
      // ไม่ใช่กรณี mock — เป็น misconfiguration จริง (LINE จะปฏิเสธ relative URL) ต้องแจ้ง error ชัดเจน ไม่ใช่ swallow เงียบๆ
      return res.status(500).json({ ok: false, error: "PUBLIC_BASE_URL ไม่ได้ตั้งค่าไว้ ไม่สามารถส่งรูปภาพไปยัง LINE ได้" });
    }

    let sentImage = null; // null = ไม่ได้ส่ง, true = สำเร็จ, false = ล้มเหลว
    let sentText = null;
    let sendError = null;

    if (imageBase64) {
      try {
        const clean = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
        const rawBuffer = Buffer.from(clean, "base64");
        // /results/:id.png เสิร์ฟเป็น Content-Type: image/png เสมอ (ดู routes/results.js) -> แปลงเป็น PNG จริงก่อนเก็บ
        // เพื่อไม่ให้ bytes กับ Content-Type ไม่ตรงกัน (LINE จะโหลดรูปไม่ขึ้นถ้าไฟล์จริงเป็น JPEG แต่ประกาศเป็น PNG)
        const sharp = (await import("sharp")).default;
        const pngBuffer = await sharp(rawBuffer).png().toBuffer();
        const fileId = await saveImage("results", pngBuffer, `admin-chat-${Date.now()}.png`, "image/png");
        const imageUrl = `${process.env.PUBLIC_BASE_URL}/results/${fileId}.png`;
        await pushImage(lineUserId, imageUrl);
        sentImage = true;
      } catch (err) {
        console.warn(`[admin] ⚠️ ส่งรูปภาพ Push LINE ไม่สำเร็จ (อาจใช้ Mock User หรือไม่ได้ต่อ LINE จริง): ${err.message}`);
        sentImage = false;
        sendError = err.message;
      }
    }

    if (text) {
      try {
        await pushText(lineUserId, text);
        sentText = true;
      } catch (err) {
        console.warn(`[admin] ⚠️ ส่งข้อความ Push LINE ไม่สำเร็จ (อาจใช้ Mock User หรือไม่ได้ต่อ LINE จริง): ${err.message}`);
        sentText = false;
        sendError = sendError || err.message;
        await LineMessageLog.create({
          lineUserId,
          sendType: "push",
          messageType: "text",
          content: text,
          status: "success",
        });
      }
    }

    // sentReal = true เฉพาะเมื่อทุกอย่างที่พยายามส่งสำเร็จจริง ไม่ปนกับ mock fallback
    const attempted = [sentImage, sentText].filter(v => v !== null);
    const sentReal = attempted.length > 0 && attempted.every(v => v === true);

    res.json({
      ok: true,
      sentReal,
      sentImage,
      sentText,
      message: sentReal ? "ส่งข้อความไปยัง LINE ผู้ใช้เรียบร้อยแล้ว" : "บันทึกข้อความจำลองเรียบร้อยแล้ว (LINE ส่งไม่สำเร็จบางส่วน หรือทั้งหมด)",
    });

    await logAdminAction(req, "send_message", lineUserId, "User", {
      sentReal,
      sentImage,
      sentText,
      sendError,
      hasImage: !!imageBase64,
      messagePreview: (text || "").slice(0, 120),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/card-config - ดึงการตั้งค่า layout การ์ด
router.get("/api/card-config", requireAdmin, (req, res) => {
  const config = getCardConfig();
  res.json({ ok: true, config });
});

// POST /admin/api/card-config - บันทึกการตั้งค่า layout การ์ด (Superadmin Lv.2 เท่านั้น)
router.post("/api/card-config", requireSuperadmin, (req, res) => {
  const newConfig = req.body.config || req.body;
  const result = saveCardConfig(newConfig);
  if (!result.ok) return res.status(500).json({ ok: false, error: result.error });
  logAdminAction(req, "config_save", "card-config", "Config", { keys: Object.keys(result.config || {}) });
  res.json({ ok: true, config: result.config });
});

// GET /admin/api/kieslect-config - ดึงการตั้งค่า Kieslect Recovery Pattern
router.get("/api/kieslect-config", requireAdmin, (req, res) => {
  const config = getKieslectConfig();
  res.json({ ok: true, config });
});

// POST /admin/api/kieslect-config - บันทึกการตั้งค่า Kieslect Recovery Pattern (Superadmin Lv.2 เท่านั้น)
router.post("/api/kieslect-config", requireSuperadmin, (req, res) => {
  const newConfig = req.body.config || req.body;
  const result = saveKieslectConfig(newConfig);
  if (!result.ok) return res.status(500).json({ ok: false, error: result.error });
  logAdminAction(req, "config_save", "kieslect-config", "Config", { keys: Object.keys(result.config || {}) });
  res.json({ ok: true, config: result.config });
});

// POST /admin/api/card-preview - เรนเดอร์ SVG preview ตามแบบที่กำลังปรับแต่ง (รองรับทั้ง weekly 3 การ์ด และ daily การ์ดรายวัน)
router.post("/api/card-preview", requireAdmin, async (req, res) => {
  try {
    const { mode = "weekly", page = 1, weeklyConfig, config: draftConfig, includeKieslect, draftKieslectConfig } = req.body;

    if (mode === "weekly") {
      const sampleWeeklyData = {
        detected: true,
        appName: "Kieslect App",
        foundPages: ["body_load", "recovery", "sleep_quality"],
        reportDate: "11 ต.ค. 2569",
        days: ["Sat 05", "Sun 06", "Mon 07", "Tue 08", "Wed 09", "Thu 10", "Fri 11"],
        confidence: 0.94,
        overview: {
          bodyLoad: 6.9,
          bodyLoadLabel: "สมดุล เหมาะกับการเพิ่มกิจกรรม",
          recoveryPercent: 71,
          sleepQualityPercent: 98,
          summary:
            "เมื่อดูจากแนวโน้มการนอนในช่วงนี้ ร่างกายของคุณอยู่ในภาวะพร้อมและสมดุลกว่าเดิมค่ะ คุณสามารถเพิ่มกิจกรรมระดับกลางได้อย่างปลอดภัย และควรรักษาเวลานอนให้คงที่อยู่เสมอนะคะ",
          highlights: [
            "การออกกำลังสม่ำเสมอ Zone 1-3",
            "รักษาเวลานอนให้คงที่",
            "ดูแลอารมณ์ให้ผ่อนคลาย ลดความเครียดก่อนนอน",
          ],
          firstSteps: [
            "เดินสบาย ๆ 20 นาที ให้อยู่ใน Zone 1-3",
            "เข้านอนเวลาเดิมทุกวัน เพิ่ม Sleep Consistency",
            "ดื่มน้ำให้เพียงพอและยืดเส้นก่อนนอนสักเล็กน้อย",
          ],
        },
        activity: {
          bodyLoadToday: 6.9,
          bodyLoadStatus: "อยู่ช่วงสมดุล เหมาะกับการเพิ่มกิจกรรมระดับกลาง",
          bodyLoadSeries: [7.3, 13.1, 6.1, 7.5, 7.1, 6.0, 6.9],
          hrZone13Today: "0:40",
          hrZone13Compare: "0:25",
          hrZone45Today: "0:00",
          hrZone45Compare: "0:00",
          strengthToday: "0:00",
          strengthCompare: "0:00",
          stepsToday: "4,315",
          stepsCompare: "3,471",
          caloriesToday: "247",
          recoveryPercent: 71,
          recoveryStatus: "ฟื้นตัวดี อยู่ในเกณฑ์สีเขียวต่อเนื่อง",
          hrvToday: "51 ms",
          hrvCompare: "48",
          rhrToday: "56 bpm",
          rhrCompare: "58",
          sleepPerformanceToday: "98%",
          sleepPerformanceCompare: "78%",
          hrvSeries: [48, 47, 48, 52, 56, 50, 51],
          rhrSeries: [56, 60, 58, 62, 57, 58, 59, 56],
          recoverySeries: [67, 59, 56, 73, 75, 68, 71],
          aiInsight:
            "กิจกรรมในช่วงสัปดาห์นี้ออกแรงปานกลาง ทำให้หัวใจทำงานได้ดีและเร่งการฟื้นตัว เมื่อปรับการพักผ่อนเพียงพอ Recovery ก็ดีขึ้นอย่างต่อเนื่องค่ะ",
          tips: "รักษาระดับกิจกรรมไม่ให้หนักนานเกิน และพักนานขึ้นในวันที่ Body Load สูง เพื่อให้ร่างกายฟื้นตัวดียิ่งขึ้นนะคะ",
        },
        sleep: {
          qualityPercent: 98,
          qualityStatus: "หลับลึกเพียงพอ ฟื้นฟูสมบูรณ์",
          totalDuration: "7 ชม. 38 นาที",
          durationCompare: "7 ชม. 15 นาที",
          restorativeDuration: "4 ชม. 05 นาที",
          restorativeCompare: "3 ชม. 45 นาที",
          sleepConsistency: "91%",
          deepSleep: "1h 55m",
          lightSleep: "4h 15m",
          remSleep: "1h 28m",
          awake: "12m",
          scoreSeries: [82, 85, 88, 92, 94, 95, 98],
          aiInsight:
            "สัดส่วนการนอนหลับลึกและ REM อยู่ในเกณฑ์ยอดเยี่ยม การฟื้นฟูเซลล์สมองและกล้ามเนื้อทำงานได้อย่างเต็มที่ ร่างกายสดชื่นพร้อมสำหรับวันใหม่ค่ะ",
          tips: "งดหน้าจอก่อนเข้านอน 30 นาที และรักษาอุณหภูมิห้องให้อยู่ในระดับ 23-25 องศาเซลเซียส เพื่อคงคุณภาพการนอนหลับลึกระดับนี้นะคะ",
        },
      };

      const cfg = weeklyConfig || getCardConfig()?.weeklyConfig;
      const { svgs } = renderWeeklyReportSvgs(sampleWeeklyData, cfg);

      if (page === "comb") {
        await initImageService();
        const { pngBuffers } = composeWeeklyReport(sampleWeeklyData, cfg);
        let combinedPngBase64 = null;
        try {
          const combBuf = await composeWeeklyCombinedReport(pngBuffers);
          if (combBuf) combinedPngBase64 = `data:image/png;base64,${combBuf.toString("base64")}`;
        } catch (ce) {
          console.error("[card-preview] composeWeeklyCombinedReport error:", ce.message);
        }
        return res.json({ ok: true, mode: "weekly", page: "comb", combinedPngBase64, svgs });
      }

      const pNum = typeof page === "number" ? page : (parseInt(page, 10) || 1);
      const pageIndex = Math.max(0, Math.min(2, pNum - 1));
      const selectedSvg = svgs[pageIndex] || svgs[0];
      return res.json({ ok: true, mode: "weekly", page: pageIndex + 1, svg: selectedSvg, svgs });
    }

    const svg = renderBiokoopCard(
      {
        score: 63,
        grade: "C",
        appName: "Kieslect App",
        sleepTime: "6h 15m",
        sleepTimeRange: "23:15 - 05:30",
        sleepEfficiency: "88%",
        soundSleep: "2h 05m",
        timeToSoundSleep: "20 min",
        avgHeartRate: "69 bpm",
        hrv: "42 ms",
        spo2: "98%",
        aiSummary: "เมื่อคืนคุณนอน 6 ชั่วโมง 15 นาที มีอัตราการฟื้นตัว (Recovery) อยู่ที่ 27% ซึ่งอยู่ในระดับต่ำ แนะนำให้ลดกิจกรรมหนัก พักผ่อนและดื่มน้ำเพิ่มเติมในวันนี้สั้นๆ นะคะ",
        deepSleep: { value: "1h 05m", percent: 17 },
        lightSleep: { value: "4h 10m", percent: 67 },
        remSleep: { value: "1h 00m", percent: 16 },
        restlessness: { value: "20 min" },
        awake: { value: "10 min" },
        recoveryPercent: includeKieslect ? 27 : null,
        bodyLoad: includeKieslect ? 3.3 : null,
        tips: "พักผ่อนเพิ่มเติม ดื่มน้ำให้เพียงพอตลอดวัน และเข้าเข้านอนให้เร็วขึ้นเพื่อเพิ่ม Recovery Rate",
        // ส่ง draftKieslectConfig เพื่อให้ kieslect section ใช้ค่า live จากฟอร์ม
        kieslectConfig: draftKieslectConfig,
      },
      draftConfig
    );
    res.json({ ok: true, mode: "daily", svg });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/test-samples - ดึงรายการรูปตัวอย่างในเครื่องสำหรับทดสอบ
router.get("/api/test-samples", requireAdmin, (req, res) => {
  try {
    const candidateFiles = [
      { id: "test_biokoop_real.png", name: "Biokoop App (7h 15m / Score 72)", path: "./test_biokoop_real.png" },
      { id: "dynamic_audit_low_score.png", name: "Low Score Sample (Score 55)", path: "./dynamic_audit_low_score.png" },
      { id: "scratch_card_fixed.png", name: "Kieslect Recovery Sample", path: "./scratch_card_fixed.png" },
      { id: "test_nature_card.png", name: "Nature Card Sample", path: "./test_nature_card.png" },
    ];
    const available = candidateFiles
      .filter(f => fs.existsSync(f.path))
      .map(f => {
        const buf = fs.readFileSync(f.path);
        return {
          id: f.id,
          name: f.name,
          sizeKb: (buf.length / 1024).toFixed(1),
          dataUri: `data:image/png;base64,${buf.toString("base64")}`,
        };
      });

    // เพิ่มชุดตัวอย่างรายสัปดาห์ 3 ภาพ (Weekly Report Pack)
    if (fs.existsSync("./samples/weekly")) {
      const weeklyFiles = ["kieslect_body_load.jpg", "kieslect_recovery.jpg", "kieslect_sleep_quality.jpg"];
      const packFiles = [];
      for (const wf of weeklyFiles) {
        const fp = `./samples/weekly/${wf}`;
        if (fs.existsSync(fp)) {
          const buf = fs.readFileSync(fp);
          packFiles.push({
            name: wf,
            sizeKb: (buf.length / 1024).toFixed(1),
            dataUri: `data:image/jpeg;base64,${buf.toString("base64")}`,
          });
        }
      }
      if (packFiles.length > 0) {
        available.unshift({
          id: "weekly_kieslect_3pack",
          name: "⭐ ชุดตัวอย่าง Kieslect รายสัปดาห์ (3 ภาพ)",
          isWeeklyPack: true,
          packFiles,
          sizeKb: packFiles.reduce((acc, f) => acc + parseFloat(f.sizeKb), 0).toFixed(1),
        });
      }
    }

    res.json({ ok: true, samples: available });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/test-ai-analyze - ทดสอบส่งรูปภาพให้ AI วิเคราะห์ (รองรับทั้ง 1 รูปภาพ และหลายรูปภาพ/รายงานรายสัปดาห์)
router.post("/api/test-ai-analyze", requireAdmin, async (req, res) => {
  try {
    const { imageBase64, images = [], imagesBase64 = [], mimeType = "image/jpeg", nickname = "ทดสอบ", gender = "หญิง" } = req.body;
    
    // รวมรายการรูปภาพให้เป็นรูปแบบเดียวกัน
    let imageList = [];
    if (Array.isArray(images) && images.length > 0) {
      imageList = images;
    } else if (Array.isArray(imagesBase64) && imagesBase64.length > 0) {
      imageList = imagesBase64.map(b => ({ base64: b, mimeType }));
    } else if (imageBase64) {
      imageList = [{ base64: imageBase64, mimeType }];
    }

    if (imageList.length === 0) {
      return res.status(400).json({ ok: false, error: "กรุณาแนบรูปภาพอย่างน้อย 1 รูปค่ะ" });
    }

    const mockProfile = {
      nickname: nickname || "ทดสอบ",
      gender: gender || "หญิง",
      lineUserId: "admin_test_user",
    };

    // ─── WEEKLY REPORT FLOW (รายงานสุขภาพ 3 หน้า และ 3-in-1 ในแผ่นเดียว) ───
    // รองรับทั้ง 1 รูปภาพ และหลายรูปภาพ (2-3 รูป) จะสร้างรายงาน 3 หน้า และ 3-in-1 เสมอ
    if (req.body.forceMode !== "daily") {
      const imageBuffers = imageList.map(img => {
        const clean = (img.base64 || "").replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
        return Buffer.from(clean, "base64");
      });

      const startTime = Date.now();
      const aiResult = await analyzeWeeklyImages(imageBuffers, mimeType, mockProfile);
      const durationMs = Date.now() - startTime;

      if (!aiResult.ok) {
        return res.json({
          ok: false,
          reportType: "weekly",
          error: aiResult.error || "AI วิเคราะห์รายงานสัปดาห์ไม่สำเร็จ",
          durationMs,
        });
      }

      await initImageService();
      const weeklyData = aiResult.data;
      const { svgs } = renderWeeklyReportSvgs(weeklyData);
      const { pngBuffers } = composeWeeklyReport(weeklyData);

      let combinedPngBase64 = null;
      try {
        const combBuf = await composeWeeklyCombinedReport(pngBuffers);
        if (combBuf) combinedPngBase64 = `data:image/png;base64,${combBuf.toString("base64")}`;
      } catch (ce) {
        console.error("[test-ai] composeWeeklyCombinedReport error:", ce.message);
      }

      const pages = [
        { pageNo: 1, title: "หน้า 1: ภาพรวมสุขภาพ (Overview)", svg: svgs[0], pngBase64: `data:image/png;base64,${pngBuffers[0].toString("base64")}` },
        { pageNo: 2, title: "หน้า 2: กิจกรรมและการฟื้นตัว (Activity & Recovery)", svg: svgs[1], pngBase64: `data:image/png;base64,${pngBuffers[1].toString("base64")}` },
        { pageNo: 3, title: "หน้า 3: คุณภาพการนอนและการพักฟื้น (Sleep Analysis)", svg: svgs[2], pngBase64: `data:image/png;base64,${pngBuffers[2].toString("base64")}` },
      ];

      const qualityCheck = checkWeeklyAnomalies(weeklyData);

      return res.json({
        ok: true,
        reportType: "weekly",
        durationMs,
        aiModel: aiResult.model,
        detected: weeklyData.detected,
        confidence: weeklyData.confidence,
        foundPages: weeklyData.foundPages || [],
        notes: weeklyData.notes,
        data: weeklyData,
        pages,
        combinedPngBase64,
        rawResult: aiResult,
        qualityCheck,
        lowConfidenceFields: weeklyData.lowConfidenceFields || [],
      });
    }

    // ─── DAILY CARD FLOW: เฉพาะกรณีระบุ forceMode === 'daily' เท่านั้น (Legacy Single Card) ───
    const singleBase64 = imageList[0].base64;
    const cleanBase64 = singleBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    const imageBuffer = Buffer.from(cleanBase64, "base64");

    const startTime = Date.now();
    const aiResult = await analyzeImageWithCrossCheck(imageBuffer, mimeType, mockProfile);
    const durationMs = Date.now() - startTime;

    if (!aiResult.ok) {
      return res.json({
        ok: false,
        reportType: "daily",
        error: aiResult.error || "AI วิเคราะห์ไม่สำเร็จ",
        durationMs,
      });
    }

    const aiData = aiResult.data;
    const r = aiData.result || {};
    const score = typeof r.score === "number" && r.score > 0 ? r.score : 75;
    const gradeInfo = getGradeForScore(score);
    const grade = gradeInfo.grade || r.grade || "B";

    const cardData = {
      appName: r.appName || "Smart Watch",
      headline: r.headline || gradeInfo.headline || "",
      tips: r.tips || gradeInfo.tips || "",
      score: score,
      grade: grade,
      stars: Math.round((score / 100) * 5),
      sleepTime: r.sleepTime || "ไม่มีข้อมูล",
      sleepTimeRange: r.sleepTimeRange || "",
      sleepEfficiency: r.sleepEfficiency || "ไม่มีข้อมูล",
      soundSleep: r.soundSleepTime || r.soundSleep || "ไม่มีข้อมูล",
      avgHeartRate: r.avgHeartRate || "ไม่มีข้อมูล",
      hrv: r.hrv || "ไม่มีข้อมูล",
      spo2: r.spo2 || "ไม่มีข้อมูล",
      aiSummary: r.aiSummary || gradeInfo.summary || "",
      deepSleep: { value: r.deepSleepTime || "-", percent: r.deepSleepPercent ?? 0 },
      lightSleep: { value: r.lightSleepTime || "-", percent: r.lightSleepPercent ?? 0 },
      remSleep: { value: r.remSleepTime || "-", percent: r.remSleepPercent ?? 0 },
      restlessness: { value: "-" },
      awake: { value: r.awakeTime || "-", percent: r.awakePercent ?? 0 },
      recoveryPercent: r.recoveryPercent ?? null,
      bodyLoad: r.bodyLoad ?? null,
    };

    let cardSvg = null;
    try {
      cardSvg = renderBiokoopCard(cardData);
    } catch (e) {
      console.error("[test-ai] Card render error:", e);
    }

    const validation = validateAiResult(aiData, 0.7);

    // ตรวจสอบความผิดปกติและความสมเหตุสมผลของการ์ดเดี่ยว
    const qualityCheck = checkDailyAnomalies({
      parsedData: r,
      confidence: aiData.confidence,
      detected: aiData.detected,
    });

    res.json({
      ok: true,
      reportType: "daily",
      durationMs,
      aiModel: aiResult.model,
      detected: aiData.detected,
      confidence: aiData.confidence,
      notes: aiData.notes,
      rawResult: aiData,
      parsedData: r,
      cardData,
      cardSvg,
      validation,
      qualityCheck,
    });
  } catch (err) {
    console.error("[test-ai] Error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/ai-test-audits - บันทึกผลการประเมินการทดสอบ AI และจุดที่แอดมินแจ้งว่าเพี้ยน
router.post("/api/ai-test-audits", requireAdmin, async (req, res) => {
  try {
    const {
      testType = "weekly",
      modelName = "ไม่ทราบโมเดล",
      confidence = 0,
      durationMs = 0,
      imageCount = 1,
      detected = true,
      foundPages = [],
      qualityStatus = "passed",
      autoAnomalies = [],
      adminFeedback = {},
      extractedSnapshot = {},
    } = req.body || {};

    const adminUser = req.session?.adminUser?.username || "Admin";

    const audit = new AiTestAudit({
      testType,
      modelName,
      confidence,
      durationMs,
      imageCount,
      detected,
      foundPages,
      qualityStatus,
      autoAnomalies: Array.isArray(autoAnomalies) ? autoAnomalies : [],
      adminFeedback: {
        rating: Number(adminFeedback.rating) || 5,
        accuracyStatus: adminFeedback.accuracyStatus || "accurate",
        flaggedFields: Array.isArray(adminFeedback.flaggedFields) ? adminFeedback.flaggedFields : [],
        notes: adminFeedback.notes || "",
        adminUser: adminFeedback.adminUser || adminUser,
      },
      extractedSnapshot,
    });

    await audit.save();

    await logAdminAction(req, "save_ai_test_audit", audit._id, "AiTestAudit", {
      testType,
      accuracyStatus: audit.adminFeedback.accuracyStatus,
      flaggedCount: audit.adminFeedback.flaggedFields.length,
      rating: audit.adminFeedback.rating,
    });

    res.json({
      ok: true,
      message: "บันทึกข้อมูลการประเมินและสถิติเรียบร้อยแล้วค่ะ",
      audit,
    });
  } catch (err) {
    console.error("[ai-test-audits] POST Error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/ai-test-audits/stats - สถิติสะสมจุดที่ AI อ่านเพี้ยนและความแม่นยำ
router.get("/api/ai-test-audits/stats", requireAdmin, async (req, res) => {
  try {
    const totalCount = await AiTestAudit.countDocuments();

    // นับตาม accuracyStatus
    const statusCounts = await AiTestAudit.aggregate([
      { $group: { _id: "$adminFeedback.accuracyStatus", count: { $sum: 1 } } }
    ]);
    const statusMap = { accurate: 0, minor_errors: 0, major_errors: 0, unusable: 0 };
    for (const item of statusCounts) {
      if (item._id && statusMap[item._id] !== undefined) {
        statusMap[item._id] = item.count;
      }
    }

    // ค่าความมั่นใจเฉลี่ย และเวลาเฉลี่ย
    const avgStats = await AiTestAudit.aggregate([
      {
        $group: {
          _id: null,
          avgConfidence: { $avg: "$confidence" },
          avgDuration: { $avg: "$durationMs" },
          avgRating: { $avg: "$adminFeedback.rating" },
        }
      }
    ]);
    const avgConfidence = avgStats[0]?.avgConfidence ? Math.round(avgStats[0].avgConfidence * 100) : 0;
    const avgDurationMs = avgStats[0]?.avgDuration ? Math.round(avgStats[0].avgDuration) : 0;
    const avgRating = avgStats[0]?.avgRating ? Number(avgStats[0].avgRating.toFixed(1)) : 0;

    // Top Inaccurate Fields ที่แอดมินแจ้งเพี้ยน (flaggedFields)
    const topFlaggedFields = await AiTestAudit.aggregate([
      { $unwind: "$adminFeedback.flaggedFields" },
      {
        $group: {
          _id: {
            field: "$adminFeedback.flaggedFields.field",
            label: "$adminFeedback.flaggedFields.fieldLabel",
            page: "$adminFeedback.flaggedFields.page",
          },
          count: { $sum: 1 },
          reasons: { $push: "$adminFeedback.flaggedFields.reason" },
          samples: {
            $push: {
              readValue: "$adminFeedback.flaggedFields.readValue",
              correctedValue: "$adminFeedback.flaggedFields.correctedValue",
            }
          }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Top Auto-detected Anomalies
    const topAutoAnomalies = await AiTestAudit.aggregate([
      { $unwind: "$autoAnomalies" },
      {
        $group: {
          _id: {
            field: "$autoAnomalies.field",
            label: "$autoAnomalies.label",
            page: "$autoAnomalies.page",
            severity: "$autoAnomalies.severity",
          },
          count: { $sum: 1 },
          sampleIssues: { $addToSet: "$autoAnomalies.issue" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // รายการทดสอบ 10 รายการล่าสุด
    const recentAudits = await AiTestAudit.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const accurateTotal = statusMap.accurate;
    const accuracyRate = totalCount > 0 ? Math.round((accurateTotal / totalCount) * 100) : 100;

    res.json({
      ok: true,
      stats: {
        totalCount,
        accuracyRate,
        statusMap,
        avgConfidence,
        avgDurationMs,
        avgRating,
        topFlaggedFields: topFlaggedFields.map(f => ({
          field: f._id.field,
          label: f._id.label || f._id.field,
          page: f._id.page || "-",
          count: f.count,
          reasons: f.reasons.filter(Boolean).slice(0, 3),
          samples: f.samples.slice(0, 2),
        })),
        topAutoAnomalies: topAutoAnomalies.map(a => ({
          field: a._id.field,
          label: a._id.label || a._id.field,
          page: a._id.page || "-",
          severity: a._id.severity || "warning",
          count: a.count,
          sampleIssues: a.sampleIssues.slice(0, 2),
        })),
        recentAudits,
      }
    });
  } catch (err) {
    console.error("[ai-test-audits/stats] GET Error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/ai-test-audits - รายการประวัติการประเมิน
router.get("/api/ai-test-audits", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const status = req.query.status;
    const hasFlagged = req.query.hasFlagged === "true";

    const filter = {};
    if (status) filter["adminFeedback.accuracyStatus"] = status;
    if (hasFlagged) filter["adminFeedback.flaggedFields.0"] = { $exists: true };

    const total = await AiTestAudit.countDocuments(filter);
    const audits = await AiTestAudit.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      ok: true,
      audits,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    console.error("[ai-test-audits] GET Error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


// GET /admin/api/bot-messages-config - ดึงข้อความ/สีที่บอท LINE ใช้ตอบผู้ใช้
router.get("/api/bot-messages-config", requireAdmin, (req, res) => {
  const config = getBotMessagesConfig();
  res.json({ ok: true, config });
});

// POST /admin/api/bot-messages-config - บันทึกข้อความ/สีที่บอท LINE ใช้ตอบผู้ใช้ (Superadmin Lv.2 เท่านั้น)
router.post("/api/bot-messages-config", requireSuperadmin, (req, res) => {
  const newConfig = req.body.config || req.body;
  const result = saveBotMessagesConfig(newConfig);
  if (!result.ok) return res.status(500).json({ ok: false, error: result.error });
  logAdminAction(req, "config_save", "bot-messages-config", "Config", { keys: Object.keys(result.config || {}) });
  res.json({ ok: true, config: result.config });
});

// POST /admin/api/bot-messages-config/reset - คืนค่าข้อความบอทกลับเป็นค่าเริ่มต้น (Superadmin Lv.2 เท่านั้น)
router.post("/api/bot-messages-config/reset", requireSuperadmin, (req, res) => {
  const result = resetBotMessagesConfig();
  if (!result.ok) return res.status(500).json({ ok: false, error: result.error });
  logAdminAction(req, "config_reset", "bot-messages-config", "Config", {});
  res.json({ ok: true, config: result.config });
});

// GET /admin/api/pricing-config - ดึงอัตราค่าบริการต่อ token ของแต่ละโมเดล และ Presets
router.get("/api/pricing-config", requireAdmin, (req, res) => {
  const config = getPricingConfig();
  const presets = getPricingPresets();
  res.json({ ok: true, config, presets });
});

// POST /admin/api/pricing-config - บันทึกอัตราค่าบริการต่อ token และประเภทแพ็กเกจ (free/paid) (Superadmin Lv.2 เท่านั้น)
router.post(["/api/pricing-config", "/api/usage-stats/pricing"], requireSuperadmin, (req, res) => {
  const body = req.body || {};
  const newConfig = body.pricing || body;
  const result = savePricingConfig(newConfig);
  if (!result.ok) return res.status(500).json({ ok: false, error: result.error });
  logAdminAction(req, "config_save", "pricing-config", "Config", { planMode: result.config?.planMode });
  res.json({ ok: true, config: result.config });
});

// GET /admin/api/usage-stats/daily-quota - สรุปจำนวนครั้งที่เรียก Gemini API วันนี้ เทียบกับโควต้าต่อวันที่แอดมินตั้งไว้เอง
// หมายเหตุ: Google ไม่มี endpoint ให้เช็คโควต้าคงเหลือแบบเรียลไทม์ ตัวเลข "เหลือ" นี้จึงเป็นการประมาณจาก
// จำนวนคำขอที่ระบบเรียกจริงวันนี้ เทียบกับค่า dailyQuotaLimits ที่แอดมินกรอกเองในหน้าตั้งค่าราคา (ควรเช็คค่าจริงจาก
// https://ai.google.dev/gemini-api/docs/rate-limits เป็นระยะเพราะ Google ปรับเปลี่ยนได้ตลอด)
router.get("/api/usage-stats/daily-quota", requireAdmin, async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayRequests = await Request.find({ createdAt: { $gte: startOfToday } })
      .select("aiModel createdAt")
      .lean();

    const countByModel = {};
    todayRequests.forEach((r) => {
      const model = r.aiModel || "ไม่ระบุโมเดล";
      countByModel[model] = (countByModel[model] || 0) + 1;
    });

    const pricing = getPricingConfig();
    const limits = pricing.dailyQuotaLimits || {};

    // รวมทั้งโมเดลที่มีการเรียกจริงวันนี้ และโมเดลที่แอดมินตั้งโควต้าไว้แต่วันนี้ยังไม่ถูกเรียกเลย (usedToday = 0)
    const allModelNames = new Set([...Object.keys(countByModel), ...Object.keys(limits)]);

    const models = Array.from(allModelNames).map((model) => {
      const usedToday = countByModel[model] || 0;
      const limit = Number(limits[model]) || 0;
      const remaining = limit > 0 ? Math.max(0, limit - usedToday) : null;
      const percentUsed = limit > 0 ? Math.min(100, Number(((usedToday / limit) * 100).toFixed(1))) : null;
      return { model, usedToday, limit: limit > 0 ? limit : null, remaining, percentUsed };
    }).sort((a, b) => b.usedToday - a.usedToday);

    const totalUsedToday = todayRequests.length;
    const totalLimit = Object.values(limits).reduce((sum, v) => sum + (Number(v) || 0), 0);
    const totalRemaining = totalLimit > 0 ? Math.max(0, totalLimit - totalUsedToday) : null;
    const hasAnyLimitSet = Object.keys(limits).some((k) => Number(limits[k]) > 0);

    res.json({
      ok: true,
      data: {
        models,
        totalUsedToday,
        totalLimit: totalLimit > 0 ? totalLimit : null,
        totalRemaining,
        hasAnyLimitSet,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/line-quota - นับถอยหลังและสรุปจำนวนข้อความ LINE คงเหลือ วันนี้ / สัปดาห์นี้ / เดือนนี้
router.get("/api/line-quota", requireAdmin, async (req, res) => {
  try {
    const axios = (await import("axios")).default;
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    let quotaType = "limited";
    let monthlyQuota = 300;
    let monthlyUsage = 0;
    let lineApiOk = false;

    if (token) {
      try {
        const [qRes, cRes] = await Promise.all([
          axios.get("https://api.line.me/v2/bot/message/quota", {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 5000,
          }),
          axios.get("https://api.line.me/v2/bot/message/quota/consumption", {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 5000,
          }),
        ]);
        quotaType = qRes.data?.type || "limited";
        monthlyQuota = qRes.data?.value != null ? qRes.data.value : 300;
        monthlyUsage = cRes.data?.totalUsage != null ? cRes.data.totalUsage : 0;
        lineApiOk = true;
      } catch (lineErr) {
        console.warn("[line-quota] LINE API check error:", lineErr.message);
      }
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = (now.getDay() + 6) % 7; // Mon = 0
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1);
    const weeksRemaining = Math.max(1, Math.ceil(daysRemaining / 7));

    const [todayPush, weekPush, monthPush, todayReplies, monthReplies] = await Promise.all([
      LineMessageLog.countDocuments({ sendType: "push", status: "success", createdAt: { $gte: startOfDay } }),
      LineMessageLog.countDocuments({ sendType: "push", status: "success", createdAt: { $gte: startOfWeek } }),
      LineMessageLog.countDocuments({ sendType: "push", status: "success", createdAt: { $gte: startOfMonth } }),
      LineMessageLog.countDocuments({ sendType: "reply", status: "success", createdAt: { $gte: startOfDay } }),
      LineMessageLog.countDocuments({ sendType: "reply", status: "success", createdAt: { $gte: startOfMonth } }),
    ]);

    const effectiveMonthlyUsage = lineApiOk ? monthlyUsage : monthPush;
    const remainingMonthly = Math.max(0, monthlyQuota - effectiveMonthlyUsage);
    const percentMonthUsed = monthlyQuota > 0 ? Math.min(100, Number(((effectiveMonthlyUsage / monthlyQuota) * 100).toFixed(1))) : 0;

    // คำนวณงบเป้าหมายรายวันและรายสัปดาห์จากโควต้าคงเหลือที่แบ่งตามเวลา
    const dailyTarget = Math.max(1, Math.round(remainingMonthly / daysRemaining));
    const remainingDaily = Math.max(0, dailyTarget - todayPush);

    const weeklyTarget = Math.max(1, Math.round(remainingMonthly / weeksRemaining));
    const remainingWeekly = Math.max(0, weeklyTarget - weekPush);

    res.json({
      ok: true,
      data: {
        lineApiOk,
        quotaType,
        daysInMonth,
        daysRemaining,
        weeksRemaining,
        daily: {
          target: dailyTarget,
          used: todayPush,
          remaining: remainingDaily,
          replies: todayReplies,
        },
        weekly: {
          target: weeklyTarget,
          used: weekPush,
          remaining: remainingWeekly,
        },
        monthly: {
          total: monthlyQuota,
          used: effectiveMonthlyUsage,
          remaining: remainingMonthly,
          percentUsed: percentMonthUsed,
          replies: monthReplies,
        },
      },
    });
  } catch (err) {
    console.error("[line-quota] error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/grade-config - ดึงการตั้งค่าระดับเกรด และช่วงคะแนน
router.get("/api/grade-config", requireAdmin, (req, res) => {
  const config = getGradeConfig();
  res.json({ ok: true, config });
});

// POST /admin/api/grade-config - บันทึกการตั้งค่าระดับเกรด และช่วงคะแนน (Superadmin Lv.2 เท่านั้น)
router.post("/api/grade-config", requireSuperadmin, (req, res) => {
  const newConfig = req.body;
  const result = saveGradeConfig(newConfig);
  if (!result.ok) return res.status(500).json({ ok: false, error: result.error });
  logAdminAction(req, "config_save", "grade-config", "Config", { keys: Object.keys(result.config || {}) });
  res.json({ ok: true, config: result.config });
});

// GET /admin/api/usage-stats - สรุปการใช้งาน Gemini API (token/ยอดเงินโดยประมาณ) แยกตามผู้ใช้แต่ละคน
router.get("/api/usage-stats", requireAdmin, async (req, res) => {
  try {
    const rows = await Request.aggregate([
      { $match: { totalTokens: { $gt: 0 } } },
      {
        $group: {
          _id: { lineUserId: "$lineUserId", aiModel: "$aiModel" },
          requestCount: { $sum: 1 },
          promptTokens: { $sum: "$promptTokens" },
          completionTokens: { $sum: "$completionTokens" },
          totalTokens: { $sum: "$totalTokens" },
        },
      },
    ]);

    const lineUserIds = [...new Set(rows.map((r) => r._id.lineUserId))];
    const users = await User.find({ lineUserId: { $in: lineUserIds } })
      .select("lineUserId displayName nickname pictureUrl")
      .lean();
    const userMap = new Map(users.map((u) => [u.lineUserId, u]));

    const byUser = new Map();
    for (const row of rows) {
      const { lineUserId, aiModel } = row._id;
      const cost = estimateCost(aiModel, row.promptTokens, row.completionTokens);

      if (!byUser.has(lineUserId)) {
        const u = userMap.get(lineUserId);
        byUser.set(lineUserId, {
          lineUserId,
          displayName: u?.displayName || "",
          nickname: u?.nickname || "",
          pictureUrl: u?.pictureUrl || "",
          requestCount: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
          byModel: [],
        });
      }

      const entry = byUser.get(lineUserId);
      entry.requestCount += row.requestCount;
      entry.promptTokens += row.promptTokens;
      entry.completionTokens += row.completionTokens;
      entry.totalTokens += row.totalTokens;
      entry.estimatedCost += cost;
      entry.byModel.push({
        model: aiModel || "ไม่ทราบโมเดล",
        requestCount: row.requestCount,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        estimatedCost: cost,
      });
    }

    const usersList = [...byUser.values()].sort((a, b) => b.estimatedCost - a.estimatedCost);

    const totals = usersList.reduce(
      (acc, u) => {
        acc.requestCount += u.requestCount;
        acc.promptTokens += u.promptTokens;
        acc.completionTokens += u.completionTokens;
        acc.totalTokens += u.totalTokens;
        acc.estimatedCost += u.estimatedCost;
        return acc;
      },
      { requestCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 }
    );

    const pricing = getPricingConfig();
    const currency = pricing.currency || "USD";
    const isFree = pricing.planMode === "free";

    for (const u of usersList) {
      u.estimatedCostFormatted = isFree
        ? "ฟรี (Free Tier)"
        : `${currency} ${u.estimatedCost.toFixed(6)}`;
      u.modelsUsed = [...new Set(u.byModel.map((m) => m.model))];
      u.requestsCount = u.requestCount;
      u.user = {
        displayName: u.displayName,
        nickname: u.nickname,
        pictureUrl: u.pictureUrl,
      };
    }

    totals.totalRequests = totals.requestCount;
    totals.costFormatted = isFree
      ? "$0.000000 (ฟรี 100%)"
      : `${currency} ${totals.estimatedCost.toFixed(6)}`;

    res.json({ ok: true, pricing, currency, isFree, totals, users: usersList });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/users/:lineUserId/usage-requests - ดึงประวัติรายการคำขอและ Token ย่อยของแต่ละคน
router.get("/api/users/:lineUserId/usage-requests", requireAdmin, async (req, res) => {
  try {
    const { lineUserId } = req.params;
    const user = await User.findOne({ lineUserId }).select("displayName nickname pictureUrl lineUserId").lean();

    const requests = await Request.find({ lineUserId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const pricing = getPricingConfig();
    const isFree = pricing.planMode === "free";
    const currency = pricing.currency || "USD";

    const formattedRequests = requests.map((r) => {
      const promptTokens = r.promptTokens || 0;
      const completionTokens = r.completionTokens || 0;
      const totalTokens = r.totalTokens || 0;
      const model = r.aiModel || "gemini-3.5-flash-lite";

      const cost = estimateCost(model, promptTokens, completionTokens);
      const costFormatted = isFree ? "ฟรี (Free Tier)" : `${currency} ${cost.toFixed(6)}`;

      return {
        _id: r._id,
        createdAt: r.createdAt,
        status: r.status,
        aiModel: model,
        promptTokens,
        completionTokens,
        totalTokens,
        cost,
        costFormatted,
        hasOriginalImage: !!(r.originalImageId || r.originalImageIds?.length),
        hasResultImage: !!(r.resultImageId || r.resultImageIds?.length),
        originalImageUrl: (r.originalImageIds?.length || r.originalImageId)
          ? `/admin/api/requests/${r._id}/originals/0`
          : null,
        resultImageUrl: (r.resultImageIds?.length || r.resultImageId)
          ? `/results/${(r.resultImageIds?.[0] || r.resultImageId)}.png`
          : null,
        resultImageUrls: (r.resultImageIds?.length ? r.resultImageIds : r.resultImageId ? [r.resultImageId] : [])
          .map((id) => `/results/${id}.png`),
        reportType: r.reportType || "weekly",
      };
    });

    res.json({
      ok: true,
      user: {
        lineUserId,
        displayName: user?.displayName || "ผู้ใช้ LINE",
        nickname: user?.nickname || "",
        pictureUrl: user?.pictureUrl || "",
      },
      requests: formattedRequests,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/analytics/user-demographics - สรุปวิเคราะห์ข้อมูลส่วนบุคคลของผู้ใช้และข้อมูลสุขภาพไขว้กลุ่มประชากร
router.get("/api/analytics/user-demographics", requireAdmin, async (req, res) => {
  try {
    const now = new Date();

    // 1. ดึงข้อมูล User ทั้งหมดมาประมวลผลทางสถิติประชากรศาสตร์
    const allUsers = await User.find({})
      .select("lineUserId gender birthdate province isRegistered registeredAt createdAt pdpaConsent")
      .lean();

    const totalUsers = allUsers.length;
    const registeredUsers = allUsers.filter((u) => u.isRegistered).length;
    const registrationRate = totalUsers > 0 ? Number(((registeredUsers / totalUsers) * 100).toFixed(1)) : 0;

    // สถิติด้านเพศ (Gender Breakdown)
    const genderCounts = { female: 0, male: 0, other: 0, unspecified: 0 };
    allUsers.forEach((u) => {
      const g = u.gender && genderCounts.hasOwnProperty(u.gender) ? u.gender : "unspecified";
      genderCounts[g]++;
    });

    const genderStats = Object.keys(genderCounts).map((key) => {
      const count = genderCounts[key];
      const percent = totalUsers > 0 ? Number(((count / totalUsers) * 100).toFixed(1)) : 0;
      const labelMap = { female: "หญิง", male: "ชาย", other: "อื่น ๆ", unspecified: "ไม่ระบุ" };
      return { key, label: labelMap[key] || key, count, percent };
    });

    // สถิติด้านช่วงอายุ (Age Groups Breakdown)
    const ageGroups = {
      under18: { label: "ต่ำกว่า 18 ปี", count: 0 },
      "18-24": { label: "18-24 ปี (วัยเรียน/เริ่มทำงาน)", count: 0 },
      "25-34": { label: "25-34 ปี (วัยทำงานหลัก)", count: 0 },
      "35-44": { label: "35-44 ปี (ผู้บริหาร/วัยกลางคน)", count: 0 },
      "45-54": { label: "45-54 ปี (วัยผู้ใหญ่)", count: 0 },
      "55plus": { label: "55 ปีขึ้นไป (วัยเกษียณ/สูงวัย)", count: 0 },
      unspecified: { label: "ไม่ระบุวันเกิด", count: 0 },
    };

    const userAgeMap = new Map(); // lineUserId -> ageGroup Key

    allUsers.forEach((u) => {
      if (!u.birthdate || isNaN(new Date(u.birthdate).getTime())) {
        ageGroups.unspecified.count++;
        userAgeMap.set(u.lineUserId, "unspecified");
        return;
      }

      const birth = new Date(u.birthdate);
      let age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
        age--;
      }

      let groupKey = "unspecified";
      if (age < 18) groupKey = "under18";
      else if (age <= 24) groupKey = "18-24";
      else if (age <= 34) groupKey = "25-34";
      else if (age <= 44) groupKey = "35-44";
      else if (age <= 54) groupKey = "45-54";
      else groupKey = "55plus";

      ageGroups[groupKey].count++;
      userAgeMap.set(u.lineUserId, groupKey);
    });

    const ageStats = Object.keys(ageGroups).map((key) => {
      const entry = ageGroups[key];
      const percent = totalUsers > 0 ? Number(((entry.count / totalUsers) * 100).toFixed(1)) : 0;
      return { key, label: entry.label, count: entry.count, percent };
    });

    // สถิติจังหวัดที่มีผู้ใช้สูงสุด (Top Provinces)
    const provinceCounts = {};
    allUsers.forEach((u) => {
      const p = (u.province || "").trim();
      if (p) {
        provinceCounts[p] = (provinceCounts[p] || 0) + 1;
      }
    });

    const topProvinces = Object.entries(provinceCounts)
      .map(([province, count]) => ({
        province,
        count,
        percent: totalUsers > 0 ? Number(((count / totalUsers) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 2. ดึงข้อมูลคำขอวิเคราะห์การนอน (Requests) เพื่อนำมาทำ Cross-Analysis
    const userGenderMap = new Map(allUsers.map((u) => [u.lineUserId, u.gender || "unspecified"]));

    const requests = await Request.find({ status: { $in: ["sent", "needs_review"] } })
      .select("lineUserId aiResult createdAt")
      .lean();

    // Cross Analysis: Sleep Score & Deep Sleep % by Gender
    const genderSleepStats = {
      female: { totalScore: 0, totalDeepPercent: 0, count: 0 },
      male: { totalScore: 0, totalDeepPercent: 0, count: 0 },
      other: { totalScore: 0, totalDeepPercent: 0, count: 0 },
      unspecified: { totalScore: 0, totalDeepPercent: 0, count: 0 },
    };

    // Cross Analysis: Sleep Score & Deep Sleep % by Age Group
    const ageSleepStats = {
      under18: { totalScore: 0, totalDeepPercent: 0, count: 0 },
      "18-24": { totalScore: 0, totalDeepPercent: 0, count: 0 },
      "25-34": { totalScore: 0, totalDeepPercent: 0, count: 0 },
      "35-44": { totalScore: 0, totalDeepPercent: 0, count: 0 },
      "45-54": { totalScore: 0, totalDeepPercent: 0, count: 0 },
      "55plus": { totalScore: 0, totalDeepPercent: 0, count: 0 },
      unspecified: { totalScore: 0, totalDeepPercent: 0, count: 0 },
    };

    // Smartwatch App / Brand Preference
    const brandCounts = {};

    requests.forEach((r) => {
      const resData = r.aiResult || {};
      const score = Number(resData.score) || 0;
      const deepPercent = Number(resData.deepSleepPercent) || 0;
      const appName = (resData.appName || "Smart Watch").trim();

      if (appName) {
        brandCounts[appName] = (brandCounts[appName] || 0) + 1;
      }

      const gender = userGenderMap.get(r.lineUserId) || "unspecified";
      if (genderSleepStats[gender] && score > 0) {
        genderSleepStats[gender].totalScore += score;
        genderSleepStats[gender].totalDeepPercent += deepPercent;
        genderSleepStats[gender].count++;
      }

      const ageKey = userAgeMap.get(r.lineUserId) || "unspecified";
      if (ageSleepStats[ageKey] && score > 0) {
        ageSleepStats[ageKey].totalScore += score;
        ageSleepStats[ageKey].totalDeepPercent += deepPercent;
        ageSleepStats[ageKey].count++;
      }
    });

    const sleepByGender = Object.keys(genderSleepStats).map((key) => {
      const item = genderSleepStats[key];
      const avgScore = item.count > 0 ? Number((item.totalScore / item.count).toFixed(1)) : 0;
      const avgDeepPercent = item.count > 0 ? Number((item.totalDeepPercent / item.count).toFixed(1)) : 0;
      const labelMap = { female: "หญิง", male: "ชาย", other: "อื่น ๆ", unspecified: "ไม่ระบุ" };
      return { key, label: labelMap[key] || key, sampleCount: item.count, avgScore, avgDeepPercent };
    });

    const sleepByAgeGroup = Object.keys(ageSleepStats).map((key) => {
      const item = ageSleepStats[key];
      const avgScore = item.count > 0 ? Number((item.totalScore / item.count).toFixed(1)) : 0;
      const avgDeepPercent = item.count > 0 ? Number((item.totalDeepPercent / item.count).toFixed(1)) : 0;
      return { key, label: ageGroups[key]?.label || key, sampleCount: item.count, avgScore, avgDeepPercent };
    });

    const totalBrandRequests = Object.values(brandCounts).reduce((a, b) => a + b, 0);
    const topSmartwatchBrands = Object.entries(brandCounts)
      .map(([brand, count]) => ({
        brand,
        count,
        percent: totalBrandRequests > 0 ? Number(((count / totalBrandRequests) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 3. สรุปข้อแนะนำทางการตลาดเชิงรุก (Actionable Marketing Insights)
    const topGender = [...genderStats].sort((a, b) => b.count - a.count)[0];
    const topAge = [...ageStats].filter((a) => a.key !== "unspecified").sort((a, b) => b.count - a.count)[0];
    const topBrand = topSmartwatchBrands[0];

    const marketingInsights = [];
    if (topGender && topGender.count > 0) {
      marketingInsights.push(`กลุ่มผู้ใช้งานหลักคือเพศ${topGender.label} (คิดเป็น ${topGender.percent}% ของผู้ใช้ทั้งหมด)`);
    }
    if (topAge && topAge.count > 0) {
      marketingInsights.push(`กลุ่มช่วงอายุที่ใช้งานสูงสุดคือ ${topAge.label} (${topAge.percent}%)`);
    }
    if (topBrand && topBrand.count > 0) {
      marketingInsights.push(`แบรนด์ Smartwatch/แอป ที่ลูกค้านิยมใช้ส่งวิเคราะห์มากที่สุดคือ "${topBrand.brand}" (${topBrand.percent}%)`);
    }
    if (topProvinces.length > 0) {
      marketingInsights.push(`พื้นที่ที่มีผู้ใช้งานสูงสุดคือจังหวัด ${topProvinces[0].province} (${topProvinces[0].count} คน)`);
    }

    res.json({
      ok: true,
      data: {
        summary: {
          totalUsers,
          registeredUsers,
          registrationRate,
          totalAnalysisRequests: requests.length,
        },
        genderStats,
        ageStats,
        topProvinces,
        sleepByGender,
        sleepByAgeGroup,
        topSmartwatchBrands,
        marketingInsights,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/analytics/ai-evaluation - สรุปประสิทธิภาพและความแม่นยำของ AI แยกตามแบรนด์ Smartwatch และโมเดล
router.get("/api/analytics/ai-evaluation", requireAdmin, async (req, res) => {
  try {
    const allRequests = await Request.find({ status: { $ne: "received" } })
      .select("status aiResult aiModel promptTokens completionTokens totalTokens isDatasetVerified correctedResult createdAt")
      .lean();

    const totalRequestsAnalyzed = allRequests.length;
    const needsReviewCount = allRequests.filter((r) => r.status === "needs_review").length;
    const failedCount = allRequests.filter((r) => r.status === "failed").length;
    const verifiedDatasetCount = allRequests.filter((r) => r.isDatasetVerified).length;
    const needsReviewRate = totalRequestsAnalyzed > 0 ? Number(((needsReviewCount / totalRequestsAnalyzed) * 100).toFixed(1)) : 0;

    // 1. วิเคราะห์ความแม่นยำและความมั่นใจแยกตามแบรนด์ Smartwatch (Brand Evaluation)
    const brandMap = {};
    allRequests.forEach((r) => {
      const resData = r.aiResult || {};
      const brand = (resData.appName || "Smart Watch").trim();

      if (!brandMap[brand]) {
        brandMap[brand] = {
          brand,
          totalCount: 0,
          needsReviewCount: 0,
          failedCount: 0,
          verifiedCount: 0,
          totalScore: 0,
          scoreCount: 0,
        };
      }

      const b = brandMap[brand];
      b.totalCount++;
      if (r.status === "needs_review") b.needsReviewCount++;
      if (r.status === "failed") b.failedCount++;
      if (r.isDatasetVerified) b.verifiedCount++;

      const score = Number(resData.score);
      if (!isNaN(score) && score > 0) {
        b.totalScore += score;
        b.scoreCount++;
      }
    });

    const brandEvaluation = Object.values(brandMap)
      .map((b) => {
        const errorRate = b.totalCount > 0 ? Number((((b.needsReviewCount + b.failedCount) / b.totalCount) * 100).toFixed(1)) : 0;
        const avgScore = b.scoreCount > 0 ? Number((b.totalScore / b.scoreCount).toFixed(1)) : 0;
        return {
          brand: b.brand,
          totalCount: b.totalCount,
          needsReviewCount: b.needsReviewCount,
          failedCount: b.failedCount,
          verifiedCount: b.verifiedCount,
          errorRate,
          avgScore,
        };
      })
      .sort((a, b) => b.totalCount - a.totalCount);

    // 2. วิเคราะห์ประสิทธิภาพการใช้ Token และค่าใช้จ่ายแยกตามรุ่นโมเดล AI (Model Efficiency)
    const modelMap = {};
    allRequests.forEach((r) => {
      const model = r.aiModel || "gemini-3.5-flash-lite";
      if (!modelMap[model]) {
        modelMap[model] = {
          model,
          requestCount: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
        };
      }

      const m = modelMap[model];
      m.requestCount++;
      m.promptTokens += r.promptTokens || 0;
      m.completionTokens += r.completionTokens || 0;
      m.totalTokens += r.totalTokens || 0;
      m.estimatedCost += estimateCost(model, r.promptTokens || 0, r.completionTokens || 0);
    });

    const pricing = getPricingConfig();
    const currency = pricing.currency || "USD";
    const isFree = pricing.planMode === "free";

    const modelEfficiency = Object.values(modelMap).map((m) => {
      const avgPrompt = m.requestCount > 0 ? Math.round(m.promptTokens / m.requestCount) : 0;
      const avgCompletion = m.requestCount > 0 ? Math.round(m.completionTokens / m.requestCount) : 0;
      const avgTotal = m.requestCount > 0 ? Math.round(m.totalTokens / m.requestCount) : 0;
      const costFormatted = isFree ? "ฟรี (Free Tier)" : `${currency} ${m.estimatedCost.toFixed(6)}`;

      return {
        model: m.model,
        requestCount: m.requestCount,
        promptTokens: m.promptTokens,
        completionTokens: m.completionTokens,
        totalTokens: m.totalTokens,
        avgPromptTokens: avgPrompt,
        avgCompletionTokens: avgCompletion,
        avgTotalTokens: avgTotal,
        estimatedCost: m.estimatedCost,
        costFormatted,
      };
    });

    res.json({
      ok: true,
      data: {
        summary: {
          totalRequestsAnalyzed,
          needsReviewCount,
          failedCount,
          needsReviewRate,
          verifiedDatasetCount,
        },
        brandEvaluation,
        modelEfficiency,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/requests/:id/correct-ai - บันทึกข้อมูลที่แอดมินแก้ไขความถูกต้อง (Ground Truth Correction)
router.post("/api/requests/:id/correct-ai", requireAdmin, async (req, res) => {
  try {
    const { correctedResult, adminName } = req.body || {};
    if (!correctedResult || typeof correctedResult !== "object") {
      return res.status(400).json({ ok: false, error: "กรุณาระบุข้อมูล correctedResult ในรูปแบบ Object" });
    }

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ ok: false, error: "ไม่พบคำขอนี้" });

    // รวมข้อมูลเดิมและข้อมูลที่แอดมินแก้ไข
    request.correctedResult = {
      ...(request.aiResult || {}),
      ...correctedResult,
    };
    request.correctedBy = adminName || "Admin";
    request.correctedAt = new Date();
    request.isDatasetVerified = true;

    // หากสถานะเป็น needs_review เปลี่ยนเป็น sent
    if (request.status === "needs_review") {
      request.status = "sent";
    }

    await request.save();

    await logStep({
      requestId: request._id,
      lineUserId: request.lineUserId,
      step: "validation",
      status: "success",
      data: { note: `Admin (${request.correctedBy}) บันทึก Ground Truth Dataset เรียบร้อยแล้ว` },
    });

    await logAdminAction(req, "correct_ai", request._id, "Request", {
      lineUserId: request.lineUserId,
      correctedBy: request.correctedBy,
      fields: Object.keys(correctedResult || {}),
    });

    res.json({
      ok: true,
      message: "บันทึกข้อมูล Ground Truth Dataset เรียบร้อยแล้ว",
      request,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/analytics/export-dataset - ส่งออกคลังข้อมูลสำหรับ Fine-Tuning Vision Model หรือ Few-Shot Prompting
router.get("/api/analytics/export-dataset", requireAdmin, async (req, res) => {
  try {
    const format = req.query.format || "json"; // json | jsonl
    const verifiedOnly = req.query.verifiedOnly === "true";

    const query = verifiedOnly ? { isDatasetVerified: true } : { status: { $in: ["sent", "needs_review"] } };

    const requests = await Request.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const dataset = requests.map((r) => {
      const finalResult = r.correctedResult || r.aiResult || {};
      return {
        id: r._id,
        lineUserId: r.lineUserId,
        aiModel: r.aiModel || "gemini-3.5-flash-lite",
        appName: finalResult.appName || "Smart Watch",
        hasOriginalImage: !!r.originalImageId,
        originalImageUrl: r.originalImageId ? `${process.env.PUBLIC_BASE_URL}/admin/api/requests/${r._id}/original` : null,
        rawAiResult: r.aiResult || null,
        groundTruthResult: r.correctedResult || null,
        isVerified: !!r.isDatasetVerified,
        correctedBy: r.correctedBy || null,
        correctedAt: r.correctedAt || null,
        createdAt: r.createdAt,
      };
    });

    if (format === "jsonl") {
      const jsonlLines = dataset.map((item) => JSON.stringify(item)).join("\n");
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Content-Disposition", `attachment; filename=biokoop_ai_dataset_${Date.now()}.jsonl`);
      return res.send(jsonlLines);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=biokoop_ai_dataset_${Date.now()}.json`);
    res.json({
      ok: true,
      count: dataset.length,
      dataset,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/broadcast/segments - สรุปจำนวนกลุ่มเป้าหมายแต่ละจุดสำหรับส่งบรอดแคสต์
router.get("/api/broadcast/segments", requireAdmin, async (req, res) => {
  try {
    const segments = await getSegmentsSummary();
    res.json({ ok: true, segments });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/broadcast/send - ส่งบรอดแคสต์หาผู้ใช้เจาะจงกลุ่มเป้าหมาย (Broadcast Campaign)
router.post("/api/broadcast/send", requireAdmin, async (req, res) => {
  try {
    const { segmentKey, messageType, text, imageUrl, title } = req.body || {};
    if (!segmentKey) {
      return res.status(400).json({ ok: false, error: "กรุณาระบุกลุ่มเป้าหมาย (segmentKey)" });
    }

    const result = await executeBroadcastCampaign({ segmentKey, messageType, text, imageUrl, title });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── REGISTRATION CONFIG & WHITELIST ENDPOINTS ──

// GET /admin/api/config/registration - ดึงการตั้งค่าโหมดการลงทะเบียน
router.get("/api/config/registration", requireAdmin, (req, res) => {
  try {
    const config = getRegistrationConfig();
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /admin/api/config/registration - อัปเดตการตั้งค่าโหมดการลงทะเบียน (Superadmin Lv.2 เท่านั้น)
router.put("/api/config/registration", requireSuperadmin, (req, res) => {
  try {
    const result = saveRegistrationConfig(req.body);
    if (!result.ok) {
      return res.status(500).json({ ok: false, error: result.error });
    }
    logAdminAction(req, "config_save", "registration-config", "Config", { keys: Object.keys(result.config || {}) });
    res.json({ ok: true, config: result.config, message: "บันทึกการตั้งค่าโหมดการลงทะเบียนเรียบร้อยแล้ว" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/lookup-owner - ค้นหาแบบครบวงจรว่าใครเป็นเจ้าของ IMEI / Order ID นี้
router.get("/api/lookup-owner", requireAdmin, async (req, res) => {
  try {
    const code = (req.query.code || "").trim();
    if (!code) {
      return res.status(400).json({ ok: false, error: "กรุณาระบุรหัส IMEI หรือ Order ID" });
    }

    // 1. ค้นหาผู้ใช้งานใน biokoop
    const userQuery = {
      $or: [
        { imei: code },
        { orderSn: code },
        { orderId: code },
        { verifiedIdentifier: code }
      ]
    };
    const user = await User.findOne(userQuery).lean();

    // 2. ค้นหาใน dbWallet (10 คอลเลกชัน)
    let dbWalletResult = null;
    try {
      dbWalletResult = await lookupInDbWallet(code, "any");
    } catch (e) {
      dbWalletResult = { found: false, error: e.message };
    }

    res.json({
      ok: true,
      code,
      userFound: !!user,
      user: user ? {
        _id: user._id,
        lineUserId: user.lineUserId,
        displayName: user.displayName,
        pictureUrl: user.pictureUrl,
        phone: user.phone || user.registration?.phone || "",
        fullName: (user.firstName || user.lastName) ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : (user.nickname || user.displayName || "ผู้ใช้ LINE"),
        province: user.province || "",
        gender: user.gender || "unspecified",
        totalRequests: user.totalRequests || 0,
        registeredAt: user.verifiedAt || user.createdAt,
        verifiedIdentifierSource: user.verifiedIdentifierSource || ""
      } : null,
      dbWalletResult
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/test-dbwallet-lookup - ทดสอบยิงค้นหารหัสใน dbWallet (9 คอลเลกชัน)
router.post("/api/test-dbwallet-lookup", requireAdmin, async (req, res) => {
  try {
    const { code, type = "any" } = req.body || {};
    if (!code || !code.trim()) {
      return res.status(400).json({ ok: false, error: "กรุณาระบุรหัสที่ต้องการทดสอบค้นหา" });
    }

    const result = await lookupInDbWallet(code.trim(), type);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/registration-codes - ค้นหาและดูรายการ Whitelist Codes
router.get("/api/registration-codes", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { search, type, status } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: "i" } },
        { note: { $regex: search, $options: "i" } },
        { usedByLineUserId: { $regex: search, $options: "i" } },
      ];
    }
    if (type && type !== "all") query.type = type;
    if (status && status !== "all") query.status = status;

    const total = await RegistrationCode.countDocuments(query);
    const codes = await RegistrationCode.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      ok: true,
      codes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/registration-codes - เพิ่มรหัส Whitelist (เดี่ยวหรือ Bulk Import)
router.post("/api/registration-codes", requireAdmin, async (req, res) => {
  try {
    const { codes, rawText, type = "any", note = "", batch = "" } = req.body || {};

    let listToInsert = [];
    if (Array.isArray(codes) && codes.length > 0) {
      listToInsert = codes.map((c) => (typeof c === "string" ? c.trim() : (c.code || "").trim())).filter(Boolean);
    } else if (typeof rawText === "string" && rawText.trim()) {
      listToInsert = rawText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3);
    }

    if (listToInsert.length === 0) {
      return res.status(400).json({ ok: false, error: "กรุณาระบุรหัสอย่างน้อย 1 รายการ" });
    }

    let addedCount = 0;
    let skippedCount = 0;

    for (const codeStr of listToInsert) {
      try {
        await RegistrationCode.create({
          code: codeStr,
          type: ["imei", "order_sn", "order_id", "any"].includes(type) ? type : "any",
          status: "available",
          note,
          batch: batch || `import_${new Date().toISOString().split("T")[0]}`,
        });
        addedCount++;
      } catch (e) {
        skippedCount++; // Duplicate code or format error
      }
    }

    res.json({
      ok: true,
      message: `นำเข้ารหัสเรียบร้อยแล้ว สำเร็จ ${addedCount} รายการ, ข้าม ${skippedCount} รายการ (ซ้ำ/ผิดพลาด)`,
      addedCount,
      skippedCount,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /admin/api/registration-codes/:id - ลบรหัส Whitelist
router.delete("/api/registration-codes/:id", requireAdmin, async (req, res) => {
  try {
    const deleted = await RegistrationCode.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, error: "ไม่พบรหัสที่ต้องการลบ" });
    res.json({ ok: true, message: "ลบรหัสเรียบร้อยแล้ว" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================
// Superadmin (Lv.2) — จัดการ admin accounts + audit log พิเศษ
// =============================================================

// GET /admin/api/admins - รายการ admin ทั้งหมด (Superadmin Lv.2 เท่านั้น)
router.get("/api/admins", requireSuperadmin, async (req, res) => {
  try {
    const admins = await AdminUser.find({})
      .sort({ createdAt: 1 })
      .select("-__v")
      .lean();
    res.json({ ok: true, data: admins, currentAdminId: req.admin._id.toString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/admins/:id/role - เปลี่ยน role ระหว่าง admin ↔ superadmin (Superadmin Lv.2 เท่านั้น)
router.post("/api/admins/:id/role", requireSuperadmin, async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!["admin", "superadmin"].includes(role)) {
      return res.status(400).json({ ok: false, error: "role ต้องเป็น admin หรือ superadmin" });
    }
    if (req.admin._id.toString() === req.params.id) {
      return res.status(400).json({ ok: false, error: "ไม่สามารถเปลี่ยน role ของตัวเองได้" });
    }

    const target = await AdminUser.findById(req.params.id);
    if (!target) return res.status(404).json({ ok: false, error: "ไม่พบ admin นี้" });

    // ป้องกัน superadmin คนสุดท้ายถูกลดขั้นเป็น admin (จะทำให้ระบบไม่มี superadmin เลย)
    if (target.role === "superadmin" && role === "admin") {
      const superadminCount = await AdminUser.countDocuments({ role: "superadmin", isActive: true });
      if (superadminCount <= 1) {
        return res.status(400).json({ ok: false, error: "ไม่สามารถลดขั้น superadmin คนสุดท้ายได้" });
      }
    }

    const oldRole = target.role;
    target.role = role;
    await target.save();

    await logAdminAction(req, "admin_role_change", target._id, "AdminUser", {
      from: oldRole,
      to: role,
      targetUsername: target.system81_username,
    });

    res.json({ ok: true, admin: target });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/admins/:id/status - เปิด/ปิดการใช้งาน admin (Superadmin Lv.2 เท่านั้น)
router.post("/api/admins/:id/status", requireSuperadmin, async (req, res) => {
  try {
    const { isActive } = req.body || {};
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ ok: false, error: "isActive ต้องเป็น true/false" });
    }
    if (req.admin._id.toString() === req.params.id) {
      return res.status(400).json({ ok: false, error: "ไม่สามารถระงับบัญชีตัวเองได้" });
    }

    const target = await AdminUser.findById(req.params.id);
    if (!target) return res.status(404).json({ ok: false, error: "ไม่พบ admin นี้" });

    // ป้องกัน superadmin คนสุดท้ายถูกระงับ
    if (!isActive && target.role === "superadmin") {
      const activeSuperadminCount = await AdminUser.countDocuments({ role: "superadmin", isActive: true });
      if (activeSuperadminCount <= 1) {
        return res.status(400).json({ ok: false, error: "ไม่สามารถระงับ superadmin คนสุดท้ายได้" });
      }
    }

    target.isActive = isActive;
    await target.save();

    await logAdminAction(req, "admin_status_change", target._id, "AdminUser", {
      isActive,
      targetUsername: target.system81_username,
    });

    res.json({ ok: true, admin: target });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /admin/api/admins/:id - ลบ admin ออกจากระบบ (Superadmin Lv.2 เท่านั้น)
router.delete("/api/admins/:id", requireSuperadmin, async (req, res) => {
  try {
    if (req.admin._id.toString() === req.params.id) {
      return res.status(400).json({ ok: false, error: "ไม่สามารถลบบัญชีตัวเองได้" });
    }
    const target = await AdminUser.findById(req.params.id);
    if (!target) return res.status(404).json({ ok: false, error: "ไม่พบ admin นี้" });

    if (target.role === "superadmin") {
      const superadminCount = await AdminUser.countDocuments({ role: "superadmin", isActive: true });
      if (superadminCount <= 1) {
        return res.status(400).json({ ok: false, error: "ไม่สามารถลบ superadmin คนสุดท้ายได้" });
      }
    }

    const targetUsername = target.system81_username;
    await target.deleteOne();

    await logAdminAction(req, "admin_delete", req.params.id, "AdminUser", {
      targetUsername,
    });

    res.json({ ok: true, message: "ลบ admin เรียบร้อยแล้ว" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/admin-audit - audit log พิเศษ ดู action ของ admin ทุกคน (Superadmin Lv.2 เท่านั้น)
router.get("/api/admin-audit", requireSuperadmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const action = req.query.action;
    const adminId = req.query.adminId;
    const search = req.query.search;

    const query = {};
    if (action && action !== "all") query.action = action;
    if (adminId) query.adminId = adminId;
    if (search) {
      query.$or = [
        { adminUsername: { $regex: search, $options: "i" } },
        { action: { $regex: search, $options: "i" } },
        { target: { $regex: search, $options: "i" } },
      ];
    }

    const total = await AdminAuditLog.countDocuments(query);
    const logs = await AdminAuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      ok: true,
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// MONTHLY HEALTH LAB APIs (ห้องวิจัยและทดสอบวิเคราะห์แนวโน้มรายเดือน)
// ═══════════════════════════════════════════════════════════════════

// GET /admin/api/monthly-lab/users - รายชื่อผู้ใช้ที่มีประวัติรายงาน พร้อมจำนวนรายงาน
router.get("/api/monthly-lab/users", requireAdmin, async (req, res) => {
  try {
    const userAgg = await Request.aggregate([
      { $match: { aiResult: { $exists: true, $ne: null } } },
      { $group: { _id: "$lineUserId", count: { $sum: 1 }, latestAt: { $max: "$createdAt" } } },
      { $sort: { count: -1, latestAt: -1 } },
      { $limit: 100 },
    ]);

    const lineUserIds = userAgg.map((u) => u._id);
    const users = await User.find({ lineUserId: { $in: lineUserIds } })
      .select("lineUserId displayName pictureUrl nickname gender")
      .lean();

    const userMap = new Map(users.map((u) => [u.lineUserId, u]));

    const result = userAgg.map((item) => {
      const u = userMap.get(item._id) || {};
      return {
        lineUserId: item._id,
        count: item.count,
        latestAt: item.latestAt,
        displayName: u.displayName || "ผู้ใช้",
        nickname: u.nickname || "",
        pictureUrl: u.pictureUrl || "",
        gender: u.gender || "unspecified",
      };
    });

    res.json({ ok: true, data: result });
  } catch (err) {
    console.error("[monthly-lab] /users error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/monthly-lab/user-data/:lineUserId - รวมข้อมูล 4 สัปดาห์ของผู้ใช้จริง
router.get("/api/monthly-lab/user-data/:lineUserId", requireAdmin, async (req, res) => {
  try {
    const weeks = parseInt(req.query.weeks) || 4;
    const result = await aggregateUserMonthlyData(req.params.lineUserId, { weeks });
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error("[monthly-lab] /user-data error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/monthly-lab/mock-data - ดึงข้อมูลจำลอง 4 สัปดาห์สำหรับเคสทดสอบ
router.get("/api/monthly-lab/mock-data", requireAdmin, (req, res) => {
  try {
    const scenario = req.query.scenario || "balanced";
    const result = generateMockMonthlyData(scenario);
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/monthly-lab/analyze - สั่ง AI วิเคราะห์ข้อมูลสุขภาพรายเดือน
router.post("/api/monthly-lab/analyze", requireAdmin, async (req, res) => {
  try {
    const { monthlyData, userProfile, preferredModel } = req.body || {};
    if (!monthlyData || !monthlyData.weeksData) {
      return res.status(400).json({ ok: false, error: "กรุณาระบุข้อมูลสุขภาพ (monthlyData) สำหรับการวิเคราะห์" });
    }

    const result = await analyzeMonthlyDataWithAi(monthlyData, userProfile || {}, preferredModel);
    logAdminAction(req, "monthly_ai_analyze", "MonthlyHealthLab", "AI Analysis", {
      model: result.meta?.model,
      score: result.data?.monthlyScore,
      weeks: monthlyData.weeksData?.length,
    });

    res.json(result);
  } catch (err) {
    console.error("[monthly-lab] /analyze error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/api/monthly-lab/feedback - บันทึกการประเมินผล/Ground Truth ของแอดมิน
router.post("/api/monthly-lab/feedback", requireAdmin, async (req, res) => {
  try {
    const {
      scenarioOrUser,
      rating,
      comment,
      aiScore,
      aiStatus,
      correctedSummary,
      monthlyData,
      aiResult,
    } = req.body || {};

    const saved = await saveMonthlyAuditFeedback({
      scenarioOrUser: scenarioOrUser || "Unknown",
      rating: Number(rating) || 5,
      comment: comment || "",
      aiScore: Number(aiScore) || 0,
      aiStatus: aiStatus || "",
      correctedSummary: correctedSummary || "",
      reviewedBy: req.session?.adminUser?.username || "admin",
      monthlyData,
      aiResult,
    });

    logAdminAction(req, "monthly_ai_feedback", "MonthlyHealthLab", "Feedback Saved", {
      scenarioOrUser,
      rating,
    });

    res.json(saved);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/monthly-lab/feedbacks - ดึงประวัติการประเมินของแอดมิน
router.get("/api/monthly-lab/feedbacks", requireAdmin, async (req, res) => {
  try {
    const history = await getMonthlyAuditHistory();
    res.json({ ok: true, data: history });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;



