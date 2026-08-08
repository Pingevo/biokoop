import { Router } from "express";
import crypto from "crypto";
import { Request, REQUEST_STATUS } from "../models/Request.js";
import { User } from "../models/User.js";
import { RequestLog, logStep } from "../models/RequestLog.js";
import { LineMessageLog } from "../models/LineMessageLog.js";
import { openDownloadStream } from "../services/storageService.js";
import { pushImage, pushText } from "../services/lineService.js";
import { getCardConfig, saveCardConfig } from "../services/cardConfigService.js";
import { getBotMessagesConfig, saveBotMessagesConfig } from "../services/botMessagesConfigService.js";
import { getPricingConfig, savePricingConfig, estimateCost } from "../services/apiPricingConfigService.js";
import { getGradeConfig, saveGradeConfig } from "../services/gradeConfigService.js";
import { renderBiokoopCard } from "../services/cardTemplate.js";

const router = Router();

// สร้าง Simple Admin Token ในความทรงจำ
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "biokoop2026";
const STATIC_ADMIN_TOKEN = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest("hex");
const activeTokens = new Set([STATIC_ADMIN_TOKEN]);

function generateToken() {
  activeTokens.add(STATIC_ADMIN_TOKEN);
  return STATIC_ADMIN_TOKEN;
}

// Middleware ตรวจสอบสิทธิ์ Admin
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token =
    (authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null) ||
    req.headers["x-admin-token"] ||
    req.query.token;

  if (!token || (!activeTokens.has(token) && token !== STATIC_ADMIN_TOKEN)) {
    return res.status(401).json({ ok: false, error: "Unauthorized access" });
  }
  next();
}

// POST /admin/api/login
router.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    const token = generateToken();
    return res.json({ ok: true, token });
  }
  return res.status(401).json({ ok: false, error: "รหัสผ่านไม่ถูกต้อง" });
});

// POST /admin/api/logout
router.post("/api/logout", requireAdminAuth, (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : req.headers["x-admin-token"];
  if (token) activeTokens.delete(token);
  res.json({ ok: true });
});

// GET /admin/api/stats
router.get("/api/stats", requireAdminAuth, async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

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
    ]);

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
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/requests
router.get("/api/requests", requireAdminAuth, async (req, res) => {
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
router.get("/api/requests/:id", requireAdminAuth, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id).lean();
    if (!request) return res.status(404).json({ ok: false, error: "ไม่พบคำขอนี้" });

    const user = await User.findOne({ lineUserId: request.lineUserId }).lean();
    const logs = await RequestLog.find({ requestId: request._id })
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      ok: true,
      request: {
        ...request,
        user: user || { lineUserId: request.lineUserId, displayName: "ผู้ใช้ LINE" },
        logs,
        originalImageUrl: request.originalImageId ? `/admin/api/requests/${request._id}/original` : null,
        resultImageUrl: request.resultImageId ? `/results/${request.resultImageId}.png` : null,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/requests/:id/original - ดูรูปภาพต้นฉบับลูกค้า
router.get("/api/requests/:id/original", requireAdminAuth, async (req, res) => {
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
router.post("/api/requests/:id/approve-send", requireAdminAuth, async (req, res) => {
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

    res.json({ ok: true, message: "อนุมัติและส่งรูปภาพผ่าน LINE เรียบร้อยแล้ว" });
  } catch (err) {
    res.status(500).json({ ok: false, error: "ส่ง LINE ไม่สำเร็จ: " + err.message });
  }
});

// POST /admin/api/requests/:id/update-status - ปรับสถานะคำขอด้วยตนเอง
router.post("/api/requests/:id/update-status", requireAdminAuth, async (req, res) => {
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

    res.json({ ok: true, request });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/users
router.get("/api/users", requireAdminAuth, async (req, res) => {
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
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ lastSeenAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      ok: true,
      data: users,
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
router.post("/api/users/:id/status", requireAdminAuth, async (req, res) => {
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

    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/logs - ดู Audit Logs ทั้งหมด
router.get("/api/logs", requireAdminAuth, async (req, res) => {
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
router.get("/api/line-messages", requireAdminAuth, async (req, res) => {
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

    const [todayCount, pushCount, replyCount] = await Promise.all([
      LineMessageLog.countDocuments({ createdAt: { $gte: startOfDay } }),
      LineMessageLog.countDocuments({ sendType: "push" }),
      LineMessageLog.countDocuments({ sendType: "reply" }),
    ]);

    res.json({
      ok: true,
      data: items,
      totals: {
        total,
        todayCount,
        pushCount,
        replyCount,
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

// GET /admin/api/card-config - ดึงการตั้งค่า layout การ์ด
router.get("/api/card-config", requireAdminAuth, (req, res) => {
  const config = getCardConfig();
  res.json({ ok: true, config });
});

// POST /admin/api/card-config - บันทึกการตั้งค่า layout การ์ด
router.post("/api/card-config", requireAdminAuth, (req, res) => {
  const newConfig = req.body;
  const result = saveCardConfig(newConfig);
  if (!result.ok) return res.status(500).json({ ok: false, error: result.error });
  res.json({ ok: true, config: result.config });
});

// POST /admin/api/card-preview - เรนเดอร์ SVG preview ตามแบบที่กำลังปรับแต่ง
router.post("/api/card-preview", requireAdminAuth, (req, res) => {
  try {
    const draftConfig = req.body || {};
    const svg = renderBiokoopCard(
      {
        score: 84,
        grade: "B",
        sleepTime: "6h 37m",
        sleepTimeRange: "22:38 - 06:49",
        sleepEfficiency: "99%",
        aiSummary: "เมื่อคืนคุณนอน 6 ชั่วโมง 37 นาที ได้ Sleep Score 84 และ Sleep Efficiency 99% แสดงว่าช่วงเวลาที่อยู่บนเตียงส่วนใหญ่เป็นเวลานอนจริง การนอนมีทั้งช่วงหลับลึก หลับตื้น และ REM ครบตามที่บันทึกไว้ ร่างกายฟื้นตัวได้ดี พร้อมลุยวันใหม่ครับ",
        deepSleep: { value: "1h 26m", percent: 22 },
        lightSleep: { value: "4h 1m", percent: 60 },
        remSleep: { value: "1h 10m", percent: 18 },
        restlessness: { value: "14 min" },
        awake: { value: "2 min" },
        tips: "ดื่มน้ำให้เพียงพอ 2.5–3 ลิตร และทานโปรตีนให้ครบในแต่ละมื้อ เพื่อการฟื้นฟูที่ดียิ่งขึ้น"
      },
      draftConfig
    );
    res.type("image/svg+xml").send(svg);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin/api/bot-messages-config - ดึงข้อความ/สีที่บอท LINE ใช้ตอบผู้ใช้
router.get("/api/bot-messages-config", requireAdminAuth, (req, res) => {
  const config = getBotMessagesConfig();
  res.json({ ok: true, config });
});

// POST /admin/api/bot-messages-config - บันทึกข้อความ/สีที่บอท LINE ใช้ตอบผู้ใช้
router.post("/api/bot-messages-config", requireAdminAuth, (req, res) => {
  const newConfig = req.body;
  const result = saveBotMessagesConfig(newConfig);
  if (!result.ok) return res.status(500).json({ ok: false, error: result.error });
  res.json({ ok: true, config: result.config });
});

// GET /admin/api/pricing-config - ดึงอัตราค่าบริการต่อ token ของแต่ละโมเดล
router.get("/api/pricing-config", requireAdminAuth, (req, res) => {
  const config = getPricingConfig();
  res.json({ ok: true, config });
});

// POST /admin/api/pricing-config - บันทึกอัตราค่าบริการต่อ token และประเภทแพ็กเกจ (free/paid)
router.post(["/api/pricing-config", "/api/usage-stats/pricing"], requireAdminAuth, (req, res) => {
  const body = req.body || {};
  const newConfig = body.pricing || body;
  const result = savePricingConfig(newConfig);
  if (!result.ok) return res.status(500).json({ ok: false, error: result.error });
  res.json({ ok: true, config: result.config });
});

// GET /admin/api/grade-config - ดึงการตั้งค่าระดับเกรด และช่วงคะแนน
router.get("/api/grade-config", requireAdminAuth, (req, res) => {
  const config = getGradeConfig();
  res.json({ ok: true, config });
});

// POST /admin/api/grade-config - บันทึกการตั้งค่าระดับเกรด และช่วงคะแนน
router.post("/api/grade-config", requireAdminAuth, (req, res) => {
  const newConfig = req.body;
  const result = saveGradeConfig(newConfig);
  if (!result.ok) return res.status(500).json({ ok: false, error: result.error });
  res.json({ ok: true, config: result.config });
});

// GET /admin/api/usage-stats - สรุปการใช้งาน Gemini API (token/ยอดเงินโดยประมาณ) แยกตามผู้ใช้แต่ละคน
router.get("/api/usage-stats", requireAdminAuth, async (req, res) => {
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
      u.modelsUsed = u.byModel.map((m) => m.model);
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
router.get("/api/users/:lineUserId/usage-requests", requireAdminAuth, async (req, res) => {
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

export default router;
