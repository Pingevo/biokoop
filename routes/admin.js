import { Router } from "express";
import { Request, REQUEST_STATUS } from "../models/Request.js";
import { User } from "../models/User.js";
import { AdminUser } from "../models/AdminUser.js";
import { RequestLog, logStep } from "../models/RequestLog.js";
import { LineMessageLog } from "../models/LineMessageLog.js";
import { openDownloadStream, getFileMetadata } from "../services/storageService.js";
import { pushImage, pushText } from "../services/lineService.js";
import { getCardConfig, saveCardConfig } from "../services/cardConfigService.js";
import { getKieslectConfig, saveKieslectConfig } from "../services/kieslectConfigService.js";
import { getBotMessagesConfig, saveBotMessagesConfig, resetBotMessagesConfig } from "../services/botMessagesConfigService.js";
import { getPricingConfig, savePricingConfig, estimateCost, getPricingPresets } from "../services/apiPricingConfigService.js";
import { getGradeConfig, saveGradeConfig } from "../services/gradeConfigService.js";
import { getRegistrationConfig, saveRegistrationConfig } from "../services/registrationConfigService.js";
import { lookupInDbWallet } from "../services/dbWalletService.js";
import { RegistrationCode } from "../models/RegistrationCode.js";
import { renderBiokoopCard } from "../services/cardTemplate.js";
import { requireAdmin, requireSuperadmin } from "../middlewares/adminAuth.js";
import { AdminAuditLog, logAdminAction } from "../models/AdminAuditLog.js";

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
      ? "$0.000000 (🎁 ฟรี 100%)"
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
      hasOriginalImage: !!r.originalImageId,
      hasResultImage: !!r.resultImageId,
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

    res.json({
      ok: true,
      request: {
        ...request,
        user: user || { lineUserId: request.lineUserId, displayName: "ผู้ใช้ LINE" },
        logs,
        originalImageUrl: request.originalImageId ? `/admin/api/requests/${request._id}/original` : null,
        resultImageUrl: request.resultImageId ? `/results/${request.resultImageId}.png` : null,
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

// POST /admin/api/requests/:id/approve-send - อนุมัติส่งรูปผลลัพธ์ LINE Push
router.post("/api/requests/:id/approve-send", requireAdmin, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ ok: false, error: "ไม่พบคำขอนี้" });

    if (!request.resultImageId) {
      return res.status(400).json({ ok: false, error: "คำขอนี้ยังไม่มีรูปการ์ดผลลัพธ์ที่สร้างเสร็จ" });
    }

    const imageUrl = `${process.env.PUBLIC_BASE_URL}/results/${request.resultImageId}.png`;

    // ส่ง LINE Push Image Message
    await pushImage(request.lineUserId, imageUrl);

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
    const { message } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ ok: false, error: "กรุณาระบุข้อความที่ต้องการส่ง" });
    }

    const user = await User.findOne({ lineUserId }).lean();
    if (!user) {
      return res.status(404).json({ ok: false, error: "ไม่พบผู้ใช้นี้ในระบบ" });
    }

    let sentReal = false;
    try {
      await pushText(lineUserId, message.trim());
      sentReal = true;
    } catch (err) {
      console.warn(`[admin] ⚠️ ส่ง Push LINE ไม่สำเร็จ (อาจใช้ Mock User หรือไม่ได้ต่อ LINE จริง): ${err.message}`);
      await LineMessageLog.create({
        lineUserId,
        sendType: "push",
        messageType: "text",
        content: message.trim(),
        status: "success",
      });
    }

    res.json({
      ok: true,
      sentReal,
      message: sentReal ? "ส่งข้อความไปยัง LINE ผู้ใช้เรียบร้อยแล้ว" : "บันทึกข้อความจำลองเรียบร้อยแล้ว",
    });

    await logAdminAction(req, "send_message", lineUserId, "User", {
      sentReal,
      messagePreview: message.trim().slice(0, 120),
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

// POST /admin/api/card-preview - เรนเดอร์ SVG preview ตามแบบที่กำลังปรับแต่ง
router.post("/api/card-preview", requireAdmin, (req, res) => {
  try {
    const draftConfig = req.body?.config || null;
    const includeKieslect = req.body?.includeKieslect !== false;
    const draftKieslectConfig = req.body?.draftKieslectConfig || null;
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
    res.json({ ok: true, svg });
  } catch (err) {
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
        ? "🎁 ฟรี (Free Tier)"
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
      ? "$0.000000 (🎁 ฟรี 100%)"
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
      const costFormatted = isFree ? "🎁 ฟรี (Free Tier)" : `${currency} ${cost.toFixed(6)}`;

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
        hasOriginalImage: !!r.originalImageId,
        hasResultImage: !!r.resultImageId,
        originalImageUrl: r.originalImageId ? `/admin/api/requests/${r._id}/original-image` : null,
        resultImageUrl: r.resultImageId ? `/admin/api/requests/${r._id}/result-image` : null,
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
      const costFormatted = isFree ? "🎁 ฟรี (Free Tier)" : `${currency} ${m.estimatedCost.toFixed(6)}`;

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

export default router;



