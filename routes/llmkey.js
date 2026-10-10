// routes/llmkey.js
// หน้า /llmkey2 + API จัดการ Gemini keys ของ flow สกัดข้อมูลดิบ (แยกจาก admin.js เดิมสิ้นเชิง)
// สิทธิ์: ดู list/config = requireAdmin (Lv.1) | เพิ่ม/แก้/ลบ/toggle/เปลี่ยนโมเดล = requireSuperadmin (Lv.2)

import path from "path";
import { fileURLToPath } from "url";
import { Router } from "express";
import { requireAdmin, requireSuperadmin } from "../middlewares/adminAuth.js";
import { AdminAuditLog, logAdminAction } from "../models/AdminAuditLog.js";
import { RawExtraction } from "../models/RawExtraction.js";
import { LlmKey } from "../models/LlmKey.js";
import { Request } from "../models/Request.js";
import { User } from "../models/User.js";
import {
  listKeys,
  addKey,
  updateKey,
  deleteKey,
  decryptKey,
} from "../services/llmKeyService.js";
import {
  getLlmExtractConfig,
  saveLlmExtractConfig,
} from "../services/llmExtractConfigService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ─── หน้าเว็บ /llmkey2 — admin เท่านั้น (ยังไม่ login → redirect SSO เหมือน /admin) ───
// หมายเหตุ: ไฟล์อยู่ใน private/ ไม่ใช่ public/ — express.static เสิร์ฟไม่ถึง
// ทำให้เข้าหน้านี้ได้ผ่าน route นี้ทางเดียว (ผ่าน requireAdmin เสมอ)
router.get("/llmkey2", requireAdmin, (req, res) => {
  res.sendFile("private/llmkey2/index.html", { root: process.cwd() });
});

// ─── หน้า list ผลสกัด /llmkey2/extractions — ตาราง + filter/search/sort (admin เท่านั้น) ───
router.get("/llmkey2/extractions", requireAdmin, (req, res) => {
  res.sendFile("private/llmkey2/extractions.html", { root: process.cwd() });
});

// ─── หน้า viewer รายชิ้น /llmkey2/view/:id — gallery รูป 3 ใบ + ข้อมูลสกัด (admin เท่านั้น) ───
router.get("/llmkey2/view/:id", requireAdmin, (req, res) => {
  res.sendFile("private/llmkey2/view.html", { root: process.cwd() });
});

// ─── GET /admin/api/llm-keys — list keys (masked) + extraction config ───
router.get("/admin/api/llm-keys", requireAdmin, async (req, res) => {
  try {
    const keys = await listKeys();
    res.json({ ok: true, keys, config: getLlmExtractConfig() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /admin/api/llm-keys — เพิ่ม key ใหม่ (superadmin) ───
router.post("/admin/api/llm-keys", requireSuperadmin, async (req, res) => {
  try {
    const { label, key } = req.body || {};
    const result = await addKey({ label, key, adminUsername: req.admin?.system81_username || "" });
    if (!result.ok) return res.status(400).json(result);
    await logAdminAction(req, "llmkey_add", result.key.id, "LlmKey", { label: result.key.label });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /admin/api/llm-keys/:id — แก้ label / เปลี่ยน key / เปิด-ปิด (superadmin) ───
router.patch("/admin/api/llm-keys/:id", requireSuperadmin, async (req, res) => {
  try {
    const { label, key, isActive } = req.body || {};
    const result = await updateKey(req.params.id, {
      label,
      key,
      isActive,
      adminUsername: req.admin?.system81_username || "",
    });
    if (!result.ok) return res.status(400).json(result);
    await logAdminAction(req, "llmkey_update", req.params.id, "LlmKey", {
      label: result.key.label,
      keyReplaced: !!(key && String(key).trim()),
      isActive: result.key.isActive,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /admin/api/llm-keys/:id — ลบ key (superadmin) ───
router.delete("/admin/api/llm-keys/:id", requireSuperadmin, async (req, res) => {
  try {
    const result = await deleteKey(req.params.id);
    if (!result.ok) return res.status(400).json(result);
    await logAdminAction(req, "llmkey_delete", req.params.id, "LlmKey", {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /admin/api/llm-keys/config — เปลี่ยนโมเดล/เปิด-ปิด flow (superadmin) ───
router.put("/admin/api/llm-keys/config", requireSuperadmin, (req, res) => {
  try {
    const result = saveLlmExtractConfig(req.body || {});
    if (!result.ok) return res.status(500).json(result);
    logAdminAction(req, "llm_extract_config_save", "llmExtractConfig", "Config", {
      model: result.config.model,
      enabled: result.config.enabled,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /admin/api/llm-keys/live-models?keyId= — ดึง list โมเดลจริงจาก Gemini API ───
// ใช้ key ที่เก็บไว้ยิง GET /v1beta/models → ได้รายการโมเดลที่ key ใช้ได้จริง
router.get("/admin/api/llm-keys/live-models", requireAdmin, async (req, res) => {
  try {
    const doc = await LlmKey.findById(req.query.keyId);
    if (!doc) return res.status(404).json({ ok: false, error: "ไม่พบ key นี้" });

    const apiKey = decryptKey(doc.encKey);
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200`, {
      headers: { "x-goog-api-key": apiKey },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      await logAdminAction(req, "llmkey_test", doc._id, "LlmKey", {
        label: doc.label,
        ok: false,
        error: `Gemini API ${resp.status}`,
      });
      return res.status(400).json({ ok: false, error: `Gemini API (${resp.status}): ${errText.slice(0, 300)}` });
    }

    const data = await resp.json();
    const models = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => ({
        name: String(m.name || "").replace(/^models\//, ""),
        displayName: m.displayName || "",
      }))
      .filter((m) => m.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    await logAdminAction(req, "llmkey_test", doc._id, "LlmKey", {
      label: doc.label,
      ok: true,
      modelsCount: models.length,
    });
    res.json({ ok: true, models, keyLabel: doc.label });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /admin/api/llmkey-audit — ประวัติการจัดการ key/config/test (superadmin เท่านั้น) ───
router.get("/admin/api/llmkey-audit", requireSuperadmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const query = { action: { $regex: "^llm" } }; // llmkey_* + llm_extract_*
    const [items, total] = await Promise.all([
      AdminAuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AdminAuditLog.countDocuments(query),
    ]);
    res.json({
      ok: true,
      items: items.map((it) => ({
        id: String(it._id),
        createdAt: it.createdAt,
        adminUsername: it.adminUsername,
        adminRole: it.adminRole,
        action: it.action,
        target: it.target,
        details: it.details,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /admin/api/raw-extractions — ผลสกัดล่าสุด + filter/search/sort ───
// query: q (ค้นหาจาก lineUserId หรือชื่อ user), dateFrom, dateTo, sort (createdAt|totalTokens|durationMs), dir (asc|desc)
router.get("/admin/api/raw-extractions", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
    const q = String(req.query.q || "").trim();
    const sortField = ["createdAt", "totalTokens", "durationMs"].includes(req.query.sort)
      ? req.query.sort
      : "createdAt";
    const sortDir = req.query.dir === "asc" ? 1 : -1;

    const query = {};
    // ── filter ช่วงเวลา ──
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : null;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom && !isNaN(dateFrom)) query.createdAt.$gte = dateFrom;
      if (dateTo && !isNaN(dateTo)) {
        // ถ้าส่งมาแค่วันที่ (ไม่มีเวลา) → นับรวมถึงสิ้นวันนั้น
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dateTo))) {
          dateTo.setDate(dateTo.getDate() + 1);
        }
        query.createdAt.$lt = dateTo;
      }
    }
    if (["success", "failed"].includes(req.query.status)) {
      query.status = req.query.status;
    }
    // ── search ชื่อ user / lineUserId (ค้นจาก User collection ด้วย) ──
    if (q) {
      const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      const users = await User.find({
        $or: [{ lineUserId: rx }, { displayName: rx }, { nickname: rx }],
      })
        .select("lineUserId")
        .limit(200)
        .lean();
      const ids = users.map((u) => u.lineUserId);
      query.$or = [{ lineUserId: rx }, ...(ids.length ? [{ lineUserId: { $in: ids } }] : [])];
    }

    const [items, total] = await Promise.all([
      RawExtraction.find(query)
        .sort({ [sortField]: sortDir })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      RawExtraction.countDocuments(query),
    ]);

    // enrich ชื่อ user ให้แต่ละแถว (batch lookup)
    const uidSet = [...new Set(items.map((i) => i.lineUserId).filter(Boolean))];
    const userMap = {};
    if (uidSet.length) {
      const us = await User.find({ lineUserId: { $in: uidSet } })
        .select("lineUserId displayName nickname")
        .lean();
      us.forEach((u) => {
        userMap[u.lineUserId] = u;
      });
    }

    res.json({
      ok: true,
      items: items.map((it) => ({
        id: String(it._id),
        requestId: it.requestId ? String(it.requestId) : "",
        lineUserId: it.lineUserId,
        userName:
          userMap[it.lineUserId]?.nickname || userMap[it.lineUserId]?.displayName || "",
        model: it.model,
        keyLabel: it.keyLabel,
        status: it.status,
        totalTokens: it.totalTokens,
        durationMs: it.durationMs,
        errorMessage: it.errorMessage,
        imageCount: it.imageCount,
        hasResult: !!it.rawResult,
        createdAt: it.createdAt,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /admin/api/raw-extractions/:id/full — ข้อมูลครบสำหรับหน้า viewer ───
// รวม: extraction record + request ที่ผูก (เวลาลูกค้าส่ง, รูป 3 ใบ) + โปรไฟล์ user
router.get("/admin/api/raw-extractions/:id/full", requireAdmin, async (req, res) => {
  try {
    const item = await RawExtraction.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ ok: false, error: "ไม่พบรายการนี้" });

    const request = item.requestId ? await Request.findById(item.requestId).lean() : null;
    const user = item.lineUserId ? await User.findOne({ lineUserId: item.lineUserId }).lean() : null;
    const imageUrls = (request?.originalImageIds || []).map(
      (_, idx) => `/admin/api/requests/${request._id}/originals/${idx}`
    );

    res.json({
      ok: true,
      item,
      request: request
        ? {
            id: String(request._id),
            createdAt: request.createdAt,
            status: request.status,
            reportType: request.reportType,
          }
        : null,
      user: user
        ? {
            displayName: user.displayName || "",
            nickname: user.nickname || "",
            pictureUrl: user.pictureUrl || "",
            lineUserId: user.lineUserId,
          }
        : null,
      imageUrls,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /admin/api/raw-extractions/:id — ดู JSON สกัดเต็มของรายการเดียว ───
router.get("/admin/api/raw-extractions/:id", requireAdmin, async (req, res) => {
  try {
    const item = await RawExtraction.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ ok: false, error: "ไม่พบรายการนี้" });
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
