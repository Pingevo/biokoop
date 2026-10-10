// services/chatDraftBuffer.js
// Auto-draft debounce buffer ของ health chatbot — แยกจาก imageBatches ของ weekly flow
// แหล่งข้อความ 2 ทาง:
//   1) webhook (ลูกค้าพิมพ์ใน LINE) → addIncomingText → session `draft-<uid>`
//   2) หน้า /testchatbot (แอดมินจำลองการพิมพ์ต่อกัน) → addBufferedText → session ที่แอดมินดูอยู่
// flush รวมข้อความ → POST Python /chat → เก็บใน chatmessages —
// ไม่มีการส่งอะไรกลับเข้า LINE เลย โชว์เฉพาะหน้า /testchatbot
// ตั้งค่าได้ที่หน้า /chatpersona → chatbotconfig doc {_id:'draft'}
import mongoose from "mongoose";

const PY_CHAT_URL = (process.env.PY_CHAT_URL || "http://127.0.0.1:5001").replace(/\/$/, "");
const DRAFT_DEFAULTS = { enabled: true, debounceSeconds: 20, maxMessages: 5 };
const DRAFT_ADMIN = "auto-draft";

const _buffers = new Map(); // key -> { texts: string[], timer, target: {lineUserId, sessionId, adminUsername} }

let _cfgCache = null;
let _cfgAt = 0;

// อ่าน config จาก chatbotconfig (cache 60s — แก้ในหน้า admin แล้วมีผลเร็ว)
async function _config() {
  if (_cfgCache && Date.now() - _cfgAt < 60_000) return _cfgCache;
  const cfg = { ...DRAFT_DEFAULTS };
  try {
    const doc = await mongoose.connection.db
      .collection("chatbotconfig").findOne({ _id: "draft" });
    if (doc) {
      cfg.enabled = doc.enabled !== false;
      if (Number.isFinite(doc.debounceSeconds))
        cfg.debounceSeconds = Math.min(120, Math.max(5, Math.round(doc.debounceSeconds)));
      if (Number.isFinite(doc.maxMessages))
        cfg.maxMessages = Math.min(20, Math.max(2, Math.round(doc.maxMessages)));
    }
  } catch {}
  _cfgCache = cfg;
  _cfgAt = Date.now();
  return cfg;
}

export async function draftConfig() {
  return _config();
}

async function _add(key, text, target) {
  const cfg = await _config();
  if (!cfg.enabled || !text) return cfg;
  let buf = _buffers.get(key);
  if (!buf) {
    buf = { texts: [], timer: null, target };
    _buffers.set(key, buf);
  }
  buf.texts.push(text);
  clearTimeout(buf.timer);
  if (buf.texts.length >= cfg.maxMessages) {
    _flush(key); // ครบจำนวนสูงสุด → ตอบทันทีไม่ต้องรอ
    return cfg;
  }
  buf.timer = setTimeout(() => _flush(key), cfg.debounceSeconds * 1000);
  buf.timer.unref?.();
  return cfg;
}

// webhook เรียกทุกข้อความ text ที่ลูกค้าส่งเข้ามา (ผ่านกรองเมนู/คำสั่งแล้ว)
export async function addIncomingText(lineUserId, text) {
  return _add(`line|${lineUserId}`, text, {
    lineUserId,
    sessionId: `draft-${lineUserId}`, // session เดียวต่อลูกค้า — draft มีความจำต่อเนื่อง
    adminUsername: DRAFT_ADMIN,
  });
}

// หน้า testchatbot — แอดมินจำลองพิมพ์ต่อกัน เข้า session ที่กำลังดู (ไม่มี → buf-<uid>)
// mark เป็น auto-draft เหมือนของจริง เพื่อให้ /chat/thread flag draft=true เหมือนกัน
export async function addBufferedText(lineUserId, sessionId, text) {
  const targetSession = sessionId || `buf-${lineUserId}`;
  await _add(`test|${lineUserId}|${targetSession}`, text, {
    lineUserId, sessionId: targetSession, adminUsername: DRAFT_ADMIN,
  });
  return { sessionId: targetSession, cfg: await _config() };
}

// รวมข้อความ → ให้ Python เตรียมคำตอบเก็บเป็น draft (fire-and-forget)
async function _flush(key) {
  const buf = _buffers.get(key);
  if (!buf) return;
  _buffers.delete(key);
  clearTimeout(buf.timer);
  const message = buf.texts.join("\n").slice(0, 4000);
  if (!message.trim()) return;
  try {
    await fetch(`${PY_CHAT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineUserId: buf.target.lineUserId,
        message,
        sessionId: buf.target.sessionId,
        adminUsername: buf.target.adminUsername,
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    console.error("[chatDraft] flush failed:", err.message);
  }
}

// status สำหรับ debug/health — จำนวน buffer ที่รออยู่ตอนนี้
export function pendingDraftCount() {
  return _buffers.size;
}
