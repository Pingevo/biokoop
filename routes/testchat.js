// routes/testchat.js
// หน้าทดสอบ Health Chatbot + proxy ไป Python FastAPI service (127.0.0.1:5001)
// ทุก route ผ่าน requireAdmin — Python ไม่รับ traffic จากภายนอกโดยตรง
import express from "express";
import mongoose from "mongoose";
import { Readable } from "node:stream";
import { requireAdmin } from "../middlewares/adminAuth.js";
import { addBufferedText, draftConfig } from "../services/chatDraftBuffer.js";
import { runWithSim, setSimImage } from "../services/lineService.js";
import { renderRichMenuImage } from "../services/richMenuTemplate.js";
import sharp from "sharp";
import { getChatMode, _debugShiftExpiry } from "../services/chatMode.js";
import { handleEvent } from "./webhook.js";
import { User } from "../models/User.js";

const router = express.Router();
const PY_CHAT_URL = (process.env.PY_CHAT_URL || "http://127.0.0.1:5001").replace(/\/$/, "");

async function proxyToPython(res, path, options = {}) {
  try {
    const upstream = await fetch(`${PY_CHAT_URL}${path}`, {
      signal: AbortSignal.timeout(90_000),
      ...options,
    });
    const data = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: "เชื่อมต่อ chatbot service ไม่ได้ (Python :5001) — รัน uvicorn ก่อน",
    });
  }
}

// หน้า testchatbot — เข้าได้ผ่าน route นี้ทางเดียว (ผ่าน requireAdmin เสมอ)
router.get("/testchatbot", requireAdmin, (req, res) => {
  res.sendFile("private/testchatbot/index.html", { root: process.cwd() });
});

// หน้าตั้งค่า persona บอท — แก้ชื่อ/บุคลิกที่บอทใช้แทนตัว
router.get("/chatpersona", requireAdmin, (req, res) => {
  res.sendFile("private/chatpersona/index.html", { root: process.cwd() });
});

// หน้า Health Calendar — ปฏิทินวันที่ลูกค้ามีข้อมูลสุขภาพ (จาก rawextractions)
router.get("/healthcalendar", requireAdmin, (req, res) => {
  res.sendFile("private/healthcalendar/index.html", { root: process.cwd() });
});

// หน้าจำลองแชท LINE — รัน logic webhook จริงแต่ reply ทั้งหมดถูกดัก ไม่ยิง LINE (เทสเท่านั้น)
router.get("/testline", requireAdmin, (req, res) => {
  res.sendFile("private/testline/index.html", { root: process.cwd() });
});

// shell รวมหน้าเครื่องมือบอท — sidebar/header โหลดครั้งเดียว เนื้อหาสลับผ่าน iframe (กัน reload ทั้งหน้า)
router.get("/shell", requireAdmin, (req, res) => {
  res.sendFile("private/shell/index.html", { root: process.cwd() });
});

// ── LINE simulator (เฉพาะ text/menu — รูปภาพต้องทดสอบบน LINE จริง) ──
const SIM_REPLY_TOKEN = "testline-sim";
// sim user ปัจจุบัน — สลับได้ผ่าน /testline/user (default เป็น userbot ถ้ามีใน DB)
let simUid = "TESTLINE-SIM-USER";
let simProfile = { displayName: "ลูกค้าทดสอบ (sim)", pictureUrl: "" };

// ให้ user ที่เลือกมี record + ลงทะเบียนแล้ว — โหมดแชทต้องลงทะเบียนก่อนตามสเปก
async function ensureSimUser() {
  await pickDefaultSimUser();
  let u = await User.findOne({ lineUserId: simUid });
  if (!u) {
    u = await User.touch(simUid, { displayName: "ลูกค้าทดสอบ (sim)", pictureUrl: "" });
  }
  if (!u.isRegistered) {
    u.isRegistered = true;
    await u.save();
  }
  simProfile = { displayName: u.displayName || simUid, pictureUrl: u.pictureUrl || "" };
}

// เลือก default ตอน route โดนเรียกครั้งแรก — ถ้า userbot มีอยู่ให้ผูกเลย (ไม่ async-block module load)
let _defaultPicked = false;
async function pickDefaultSimUser() {
  if (_defaultPicked) return;
  _defaultPicked = true;
  try {
    const ub = await User.findOne({ lineUserId: "userbot" }).lean();
    if (ub) {
      simUid = "userbot";
      simProfile = { displayName: ub.displayName || "userbot", pictureUrl: ub.pictureUrl || "" };
    }
  } catch { /* DB ยังไม่พร้อม — ใช้ default */ }
}

const _modeState = () => {
  const s = getChatMode(simUid);
  return s
    ? { active: true, mode: s.mode, remainingSec: Math.max(0, Math.round((s.until - Date.now()) / 1000)) }
    : { active: false };
};

router.get("/admin/api/testline/state", requireAdmin, async (req, res) => {
  await pickDefaultSimUser();
  res.json({ ok: true, simUserId: simUid, simDisplayName: simProfile.displayName, ..._modeState() });
});

// รายชื่อ user ที่ลงทะเบียนแล้ว — ให้หน้า sim เลือกผูก (รวม userbot/sim user)
router.get("/admin/api/testline/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ isRegistered: true })
      .select("lineUserId displayName").sort({ displayName: 1 }).limit(100).lean();
    res.json({ ok: true, users: users.map(u => ({ lineUserId: u.lineUserId, displayName: u.displayName || "" })) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// สลับ sim user — webhook/reply/push ทั้งหมดจะรันในนาม user นี้ (ยังดัก reply เหมือนเดิม)
router.post("/admin/api/testline/user", requireAdmin, async (req, res) => {
  const uid = String(req.body?.lineUserId || "").trim();
  if (!uid) return res.status(400).json({ ok: false, error: "ต้องระบุ lineUserId" });
  try {
    const u = await User.findOne({ lineUserId: uid });
    if (!u) return res.status(404).json({ ok: false, error: `ไม่พบ user "${uid}"` });
    simUid = uid;
    simProfile = { displayName: u.displayName || uid, pictureUrl: u.pictureUrl || "" };
    await ensureSimUser();
    res.json({ ok: true, simUserId: simUid, simDisplayName: simProfile.displayName, ..._modeState() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// poll draft ของ sim user — debounce flush เขียนลง chatmessages session draft-<uid>
// (auto-draft ไม่ได้ยิงเข้า LINE จริง — sim ดึงมาโชว์ให้เห็น buffer ทำงาน)
router.get("/admin/api/testline/drafts", requireAdmin, async (req, res) => {
  const since = Number(req.query.since) || 0;
  try {
    const items = await mongoose.connection.db.collection("chatmessages")
      .find({ sessionId: `draft-${simUid}`, role: "assistant",
              createdAt: { $gt: new Date(since) } })
      .sort({ createdAt: 1 }).limit(50).toArray();
    res.json({ ok: true, items: items.map(m => ({ text: m.text, at: m.createdAt })),
               lateReplies: simLate.splice(0, simLate.length) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// กระโดดเวลา — จำลองว่าเวลาผ่านไป N นาที เพื่อเทส timeout 15 นาทีของโหมดบอท
router.post("/admin/api/testline/skip-time", requireAdmin, (req, res) => {
  const mins = Math.min(60, Math.max(1, Number(req.body?.minutes) || 16));
  _debugShiftExpiry(simUid, mins * 60_000);
  res.json({ ok: true, shiftedMinutes: mins, ..._modeState() });
});

// ภาพ rich menu จริงจาก template (render local เท่านั้น — ไม่อัปโหลดขึ้น LINE)
let _rmPng = null;
router.get("/admin/api/testline/richmenu.png", requireAdmin, async (req, res) => {
  try {
    if (!_rmPng) _rmPng = await sharp(Buffer.from(renderRichMenuImage())).png().toBuffer();
    res.type("image/png").set("cache-control", "no-cache").send(_rmPng);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// queue ข้อความ async ที่มาหลัง event response ตอบไปแล้ว (TTL timer, งานพื้นหลัง) — /drafts poll drain ให้หน้า sim
const simLate = [];

// รัน 1 event ใต้ sim context (ALS ใน lineService) — send ทุกครั้งของ flow นี้ถูกดัก รวม async ที่ยิงทีหลัง
// ข้อความก่อน response → คืนใน replies; ข้อความหลัง response → เข้า simLate ให้ poll หยิบ (ไม่หายเงียบ)
async function runSimEvent(message) {
  await ensureSimUser();
  const captured = [];
  let live = true;
  const sink = (kind, args) => {
    if (kind === "profile") return simProfile;
    if (kind === "loading") return true;
    (live ? captured : simLate).push({ kind, messages: args.messages || [] });
    if (simLate.length > 100) simLate.splice(0, simLate.length - 100);
    return true;
  };
  try {
    await runWithSim({ sink }, () => handleEvent({
      type: "message",
      replyToken: SIM_REPLY_TOKEN,
      source: { type: "user", userId: simUid },
      message,
      timestamp: Date.now(),
    }));
  } finally {
    live = false;
  }
  return captured;
}

// จำลอง event text เข้า webhook จริง — ดัก reply/push ทั้งหมดของ sim user เก็บเป็น array ส่งกลับ
router.post("/admin/api/testline/event", requireAdmin, async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ ok: false, error: "ต้องระบุ text" });
  try {
    const replies = await runSimEvent({ type: "text", id: `sim-${Date.now()}`, text });
    res.json({ ok: true, replies, ..._modeState() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// จำลอง event รูปภาพ — buffer เก็บใน sim map ให้ getImageContent ดึง (pipeline จริงทำงานครบ:
// classify → batch 3 รูป → วิเคราะห์ AI → เขียน GridFS/Request/extraction job เหมือน LINE จริง)
router.post("/admin/api/testline/image", requireAdmin, async (req, res) => {
  const b64 = String(req.body?.data || "");
  if (!b64) return res.status(400).json({ ok: false, error: "ต้องระบุ data (base64)" });
  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
    return res.status(400).json({ ok: false, error: "รูปว่างหรือใหญ่เกิน 10MB" });
  }
  const messageId = `sim-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  setSimImage(messageId, buffer);
  try {
    const replies = await runSimEvent({ type: "image", id: messageId, contentProvider: { type: "line" } });
    res.json({ ok: true, replies, ..._modeState() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const _BKK = "Asia/Bangkok";
const _dateKey = (d) => d.toLocaleDateString("en-CA", { timeZone: _BKK }); // YYYY-MM-DD
const _pick = (arr, i) => (Array.isArray(arr) ? arr[i] ?? null : null);

// รวมวันที่มีข้อมูลของลูกค้าในเดือนที่ขอ — 1 record คลุมหลายวัน (dataFrom→dataTo)
router.get("/admin/api/calendar/month", requireAdmin, async (req, res) => {
  const lineUserId = String(req.query.lineUserId || "").trim();
  const month = String(req.query.month || "").trim(); // YYYY-MM
  if (!lineUserId || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ ok: false, error: "ต้องระบุ lineUserId และ month=YYYY-MM" });
  }
  try {
    const [y, m] = month.split("-").map(Number);
    const monthStart = new Date(Date.UTC(y, m - 1, 1) - 7 * 3600_000);   // เที่ยงคืน BKK ใน UTC
    const monthEnd = new Date(Date.UTC(y, m, 1) - 7 * 3600_000);
    const docs = await mongoose.connection.db.collection("rawextractions")
      .find({
        lineUserId, status: "success",
        dataFrom: { $lt: monthEnd }, dataTo: { $gte: monthStart },
      })
      .project({ dataFrom: 1, dataTo: 1, weekOf: 1, createdAt: 1, imageCount: 1,
                 "rawResult.days": 1, "rawResult.pages": 1 })
      .sort({ dataFrom: 1 }).toArray();

    const days = {};
    for (const d of docs) {
      const rr = d.rawResult || {};
      const labels = Array.isArray(rr.days) ? rr.days : [];
      const pg = rr.pages || {};
      const chB = pg.body_load?.charts || {}, chR = pg.recovery?.charts || {}, chS = pg.sleep_quality?.charts || {};
      // ครอบทุกวันในช่วงข้อมูลจริง (ไม่จำกัด 7 ตาม labels) — series มีแค่ 7 slot
      // แต่ถ้า record ยาวกว่านั้นวันที่เกินยังถือว่ามีข้อมูล (perDay จะ null)
      const n = Math.max(1, labels.length,
        Math.round((d.dataTo - d.dataFrom) / 86400000) + 1);
      for (let i = 0; i < n; i++) {
        const dayDate = new Date(d.dataFrom.getTime() + i * 86400000);
        const key = _dateKey(dayDate);
        if (key < `${month}-01` || key > `${month}-31`) continue;
        const isLast = i === n - 1;
        (days[key] ||= []).push({
          extractionId: String(d._id),
          label: labels[i] || "",
          range: `${_dateKey(d.dataFrom)} → ${_dateKey(d.dataTo)}`,
          isLastDay: isLast, // today/rings = snapshot วันสุดท้ายของ record เท่านั้น
          sentAt: d.createdAt,
          imageCount: d.imageCount || 0,
          perDay: {
            bodyLoad: _pick(chB.bodyLoadSeries, i),
            recovery: _pick(chR.recoverySeries, i),
            hrv: _pick(chR.hrvSeries, i),
            rhr: _pick(chR.rhrSeries, i),
            sleepQuality: _pick(chR.sleepQualitySeries, i) ?? _pick(chS.qualitySeries, i),
            sleepHoursVsNeeded: _pick(chS.hoursVsNeededSeries, i),
            consistency: _pick(chS.consistencySeries, i),
          },
          summary: {
            bodyLoad: pg.body_load?.rings?.bodyLoad?.value ?? null,
            recoveryPct: pg.recovery?.rings?.recoveryPercent ?? null,
            sleepQualityPct: pg.sleep_quality?.rings?.qualityPercent ?? null,
            hrv: pg.recovery?.today?.hrv ?? null,
            rhr: pg.recovery?.today?.restingHeartRate ?? null,
            sleepDuration: pg.sleep_quality?.today?.duration ?? null,
            steps: pg.body_load?.today?.steps ?? null,
          },
        });
      }
    }
    res.json({ ok: true, month, lineUserId, days });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const _personaCol = () => mongoose.connection.db.collection("chatbotconfig");
const _PERSONA_DEFAULTS = {
  botName: "biokoop",
  persona: "ผู้ช่วยดูแลสุขภาพที่เป็นกันเอง สุภาพ อบอุ่น พูดจาสุภาพ ใช้คำลงท้าย \"ครับ/ค่ะ\" ตามบริบท เห็นใจและให้กำลังใจลูกค้าเสมอ",
};
const _DRAFT_DEFAULTS = { enabled: true, debounceSeconds: 20, maxMessages: 5 };
// ระดับ slider persona (1–3, default 2 = กลาง) — Python อ่าน doc เดียวกันแปลงเป็น directive
const _lv = (v) => { const n = Math.round(Number(v)); return [1, 2, 3].includes(n) ? n : 2; };

// อ่าน persona + draft config ปัจจุบัน (ไม่มี → defaults)
router.get("/admin/api/chat/persona", requireAdmin, async (req, res) => {
  try {
    const col = _personaCol();
    const [doc, draft] = await Promise.all([
      col.findOne({ _id: "persona" }), col.findOne({ _id: "draft" })]);
    res.json({ ok: true, botName: doc?.botName || _PERSONA_DEFAULTS.botName,
               persona: doc?.persona || _PERSONA_DEFAULTS.persona,
               friendliness: _lv(doc?.friendliness),
               answerLength: _lv(doc?.answerLength),
               conciseness: _lv(doc?.conciseness),
               draftEnabled: draft?.enabled !== false,
               debounceSeconds: Number.isFinite(draft?.debounceSeconds)
                 ? draft.debounceSeconds : _DRAFT_DEFAULTS.debounceSeconds,
               maxMessages: Number.isFinite(draft?.maxMessages)
                 ? draft.maxMessages : _DRAFT_DEFAULTS.maxMessages,
               updatedBy: doc?.updatedBy || "", updatedAt: doc?.updatedAt || null,
               isDefault: !doc });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// บันทึก persona + draft config — Python/buffer อ่าน doc เดียวกันนี้ (cache 60s)
router.put("/admin/api/chat/persona", requireAdmin, async (req, res) => {
  const botName = String(req.body?.botName || "").trim().slice(0, 60);
  const persona = String(req.body?.persona || "").trim().slice(0, 2000);
  if (!botName || !persona) {
    return res.status(400).json({ ok: false, error: "ต้องระบุชื่อบอทและบุคลิก" });
  }
  const debounceSeconds = Math.min(120, Math.max(5,
    Math.round(Number(req.body?.debounceSeconds) || _DRAFT_DEFAULTS.debounceSeconds)));
  const maxMessages = Math.min(20, Math.max(2,
    Math.round(Number(req.body?.maxMessages) || _DRAFT_DEFAULTS.maxMessages)));
  try {
    const col = _personaCol();
    const by = req.admin?.system81_username || "admin";
    await Promise.all([
      col.updateOne(
        { _id: "persona" },
        { $set: { botName, persona,
                  friendliness: _lv(req.body?.friendliness),
                  answerLength: _lv(req.body?.answerLength),
                  conciseness: _lv(req.body?.conciseness),
                  updatedBy: by, updatedAt: new Date() } },
        { upsert: true }),
      col.updateOne(
        { _id: "draft" },
        { $set: { enabled: req.body?.draftEnabled !== false,
                  debounceSeconds, maxMessages, updatedBy: by, updatedAt: new Date() } },
        { upsert: true }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/admin/api/chat/users", requireAdmin, (req, res) =>
  proxyToPython(res, "/chat/users"));

router.get("/admin/api/chat/sessions", requireAdmin, (req, res) =>
  proxyToPython(res, `/chat/sessions?lineUserId=${encodeURIComponent(req.query.lineUserId || "")}`));

router.get("/admin/api/chat/thread", requireAdmin, (req, res) =>
  proxyToPython(res, `/chat/thread?lineUserId=${encodeURIComponent(req.query.lineUserId || "")}&sessionId=${encodeURIComponent(req.query.sessionId || "")}`));

router.get("/admin/api/chat/messages", requireAdmin, (req, res) =>
  proxyToPython(res, `/chat/messages?sessionId=${encodeURIComponent(req.query.sessionId || "")}`));

// รูปที่แนบในแชท — stream binary จาก Python (ไม่ผ่าน JSON proxy)
router.get("/admin/api/chat/images/:id", requireAdmin, async (req, res) => {
  try {
    const upstream = await fetch(
      `${PY_CHAT_URL}/chat/images/${encodeURIComponent(req.params.id)}`,
      { signal: AbortSignal.timeout(30_000) });
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.set("content-type", ct);
    const cc = upstream.headers.get("cache-control");
    if (cc) res.set("cache-control", cc);
    if (!upstream.ok || !upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch {
    res.status(502).end();
  }
});

// เทส buffer/debounce จากหน้า testchatbot — queue ข้อความเข้า buffer เหมือนแชท LINE จริง
// คืน sessionId + config ให้หน้าเว็บรู้ว่าจะรอ/โหลดผลตอนไหน; คำตอบจริงมาเมื่อ flush (ดูใน thread)
router.post("/admin/api/chat/buffer", requireAdmin, async (req, res) => {
  const { lineUserId, message, sessionId } = req.body || {};
  const text = String(message || "").trim();
  if (!lineUserId || !text) {
    return res.status(400).json({ ok: false, error: "ต้องระบุ lineUserId และ message" });
  }
  try {
    const cfg = await draftConfig();
    if (!cfg.enabled) {
      return res.json({ ok: false, disabled: true,
        error: "Auto-Draft ปิดอยู่ — เปิดได้ที่หน้า Chat Persona" });
    }
    const r = await addBufferedText(String(lineUserId).trim(), sessionId || null, text);
    res.json({ ok: true, queued: true, sessionId: r.sessionId,
               debounceSeconds: r.cfg.debounceSeconds, maxMessages: r.cfg.maxMessages });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/api/chat/ask", requireAdmin, (req, res) => {
  const { lineUserId, message, sessionId, images } = req.body || {};
  const cleanImages = Array.isArray(images)
    ? images.slice(0, 4)
        .filter(im => im && typeof im.data === "string" && im.data)
        .map(im => ({ data: im.data, mimeType: String(im.mimeType || "image/jpeg") }))
    : [];
  if (!lineUserId || (!String(message || "").trim() && !cleanImages.length)) {
    return res.status(400).json({ ok: false, error: "ต้องระบุ lineUserId และ message หรือรูปภาพ" });
  }
  return proxyToPython(res, "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lineUserId: String(lineUserId).trim(),
      message: String(message || "").trim(),
      images: cleanImages,
      sessionId: sessionId || null,
      adminUsername: req.admin?.system81_username || "",
    }),
  });
});

export default router;
