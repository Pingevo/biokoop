// routes/demo.js — หน้าทดสอบสาธารณะ (ไม่ต้องล็อกอิน)
// รัน logic webhook จริงแต่ reply ทั้งหมดถูกดัก — ไม่มีข้อความ/ข้อมูลใดส่งเข้า LINE จริง
// ทุก request รันในนาม user "userbot" ตายตัว (ใช้ข้อมูล seed เดียวกัน)
import express from "express";
import mongoose from "mongoose";
import { runWithSim, setSimImage } from "../services/lineService.js";
import { renderRichMenuImage } from "../services/richMenuTemplate.js";
import sharp from "sharp";
import { getChatMode, _debugShiftExpiry } from "../services/chatMode.js";
import { handleEvent } from "./webhook.js";
import { User } from "../models/User.js";

const router = express.Router();
const DEMO_UID = "userbot";
const DEMO_REPLY_TOKEN = "demo-sim";
let demoProfile = { displayName: "userbot", pictureUrl: "" };

async function ensureDemoUser() {
  let u = await User.findOne({ lineUserId: DEMO_UID });
  if (!u) {
    u = await User.touch(DEMO_UID, { displayName: "userbot (demo)", pictureUrl: "" });
  }
  if (!u.isRegistered) {
    u.isRegistered = true;
    await u.save();
  }
  demoProfile = { displayName: u.displayName || DEMO_UID, pictureUrl: u.pictureUrl || "" };
}

const _modeState = () => {
  const s = getChatMode(DEMO_UID);
  return s
    ? { active: true, mode: s.mode, remainingSec: Math.max(0, Math.round((s.until - Date.now()) / 1000)) }
    : { active: false };
};

router.get("/demo", (req, res) => {
  res.sendFile("private/demo/index.html", { root: process.cwd() });
});

router.get("/demo/api/state", async (req, res) => {
  await ensureDemoUser();
  res.json({ ok: true, simUserId: DEMO_UID, simDisplayName: demoProfile.displayName, ..._modeState() });
});

// poll draft flush ของ userbot (sessionId = draft-userbot)
router.get("/demo/api/drafts", async (req, res) => {
  const since = Number(req.query.since) || 0;
  try {
    const items = await mongoose.connection.db.collection("chatmessages")
      .find({ sessionId: `draft-${DEMO_UID}`, role: "assistant",
              createdAt: { $gt: new Date(since) } })
      .sort({ createdAt: 1 }).limit(50).toArray();
    res.json({ ok: true, items: items.map(m => ({ text: m.text, at: m.createdAt })),
               lateReplies: demoLate.splice(0, demoLate.length) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// กระโดดเวลา — จำลอง timeout 15 นาทีของโหมดบอท
router.post("/demo/api/skip-time", async (req, res) => {
  const mins = Math.min(60, Math.max(1, Number(req.body?.minutes) || 16));
  _debugShiftExpiry(DEMO_UID, mins * 60_000);
  res.json({ ok: true, shiftedMinutes: mins, ..._modeState() });
});

// ภาพ rich menu จริงจาก template (render local เท่านั้น)
let _rmPng = null;
router.get("/demo/api/richmenu.png", async (req, res) => {
  try {
    if (!_rmPng) _rmPng = await sharp(Buffer.from(renderRichMenuImage())).png().toBuffer();
    res.type("image/png").set("cache-control", "no-cache").send(_rmPng);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// queue ข้อความ async ที่มาหลัง event response (TTL timer, งานพื้นหลัง) — /drafts poll drain ให้หน้า demo
const demoLate = [];

// รัน event ใต้ sim context (ALS) — send ทุกครั้งใน flow นี้ถูกดักเสมอ รวม async ที่ยิงทีหลัง
async function runDemoEvent(req, res, message) {
  try {
    await ensureDemoUser();
    const captured = [];
    let live = true;
    const sink = (kind, args) => {
      if (kind === "profile") return demoProfile;
      if (kind === "loading") return true;
      (live ? captured : demoLate).push({ kind, messages: args.messages || [] });
      if (demoLate.length > 100) demoLate.splice(0, demoLate.length - 100);
      return true;
    };
    try {
      await runWithSim({ sink }, () => handleEvent({
        type: "message",
        replyToken: DEMO_REPLY_TOKEN,
        source: { type: "user", userId: DEMO_UID },
        message,
        timestamp: Date.now(),
      }));
    } finally {
      live = false;
    }
    res.json({ ok: true, replies: captured, ..._modeState() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

router.post("/demo/api/event", async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ ok: false, error: "ต้องระบุ text" });
  return runDemoEvent(req, res, { type: "text", id: `demo-${Date.now()}`, text });
});

router.post("/demo/api/image", async (req, res) => {
  const b64 = String(req.body?.data || "");
  if (!b64) return res.status(400).json({ ok: false, error: "ต้องระบุ data (base64)" });
  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
    return res.status(400).json({ ok: false, error: "รูปว่างหรือใหญ่เกิน 10MB" });
  }
  const messageId = `demo-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  setSimImage(messageId, buffer);
  return runDemoEvent(req, res, { type: "image", id: messageId, contentProvider: { type: "line" } });
});

export default router;
