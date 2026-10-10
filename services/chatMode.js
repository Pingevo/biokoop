// chatMode.js — state โหมดคุยกับบอท/โภชนาการ ต่อ lineUserId (in-memory)
// TTL 15 นาทีต่ออายุทุกกิจกรรม — restart แล้วหลุดโหมด = กลับ flow เดิม (ปลอดภัยกว่า)
import { randomUUID } from "node:crypto";

const TTL_MS = 15 * 60 * 1000;
const modes = new Map(); // lineUserId -> { mode: 'chat'|'food', until: number, lastQuestion: string }

export const CHAT_ENTER_TEXT = "คุยกับบอท";
export const FOOD_ENTER_TEXT = "โภชนาการอาหาร";

export function enterChatMode(lineUserId, mode = "chat") {
  modes.set(lineUserId, {
    mode,
    until: Date.now() + TTL_MS,
    lastQuestion: "",
    sessionId: randomUUID().slice(0, 12), // ผูกกับ /chat เพื่อให้จำบทสนทนาในโหมดนี้ได้
  });
}

export function getChatMode(lineUserId) {
  const s = modes.get(lineUserId);
  if (!s) return null;
  if (s.until <= Date.now()) { modes.delete(lineUserId); return null; }
  return s;
}

export function touchChatMode(lineUserId, lastQuestion) {
  const s = getChatMode(lineUserId);
  if (!s) return null;
  s.until = Date.now() + TTL_MS;
  if (lastQuestion !== undefined) s.lastQuestion = lastQuestion;
  return s;
}

export function exitChatMode(lineUserId) {
  modes.delete(lineUserId);
}

// เทสจากหน้า /testline — ดันเวลาหมดอายุย้อนหลัง (sim เท่านั้น)
export function _debugShiftExpiry(lineUserId, msBack) {
  const s = modes.get(lineUserId);
  if (s) s.until -= msBack;
}
