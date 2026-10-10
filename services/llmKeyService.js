// llmKeyService.js
// จัดการ Gemini API keys สำหรับ flow สกัดข้อมูลดิบ (rawExtractionService) เท่านั้น
// - key จริง encrypt ด้วย AES-256-GCM ก่อนลง DB — ไม่มี plaintext หลุดออก API เด็ดขาด
// - เลือก key แบบ round-robin (key1 -> key2 -> key3 -> วน) อ้างอิง lastUsedAt ใน DB
//   ทำให้คิวไม่หลุดแม้ server restart

import crypto from "crypto";
import { LlmKey } from "../models/LlmKey.js";

const ALGO = "aes-256-gcm";

// secret สำหรับ encrypt — ตั้ง LLMKEY_ENCRYPTION_KEY ใน .env แนะนำ
// fallback SESSION_SECRET (มีอยู่แล้ว) เพื่อให้ใช้งานได้ทันทีโดยไม่ต้องเพิ่ม env
function getSecret() {
  const raw =
    process.env.LLMKEY_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    "dev-llmkey-secret-change-me";
  return crypto.createHash("sha256").update(String(raw)).digest();
}

export function encryptKey(plainKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getSecret(), iv);
  const enc = Buffer.concat([cipher.update(String(plainKey), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptKey(encKey) {
  const [ivB64, tagB64, dataB64] = String(encKey).split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("รูปแบบ encKey ไม่ถูกต้อง");
  const decipher = crypto.createDecipheriv(ALGO, getSecret(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

// แสดงผลแค่ 4 ตัวท้ายเสมอ — ห้ามโชว์ key เต็ม
export function maskKeyPreview(plainKey) {
  const s = String(plainKey || "");
  return s.length <= 4 ? "••••" : `••••${s.slice(-4)}`;
}

// แปลง doc เป็น object ปลอดภัยสำหรับส่งออก API (ตัด encKey ทิ้งเสมอ)
// decryptError=true = เข้ารหัสด้วย secret คนละตัว (เช่น ใส่ key ก่อนโหลด env) — ใช้ไม่ได้ ต้องใส่ใหม่
export function toSafeKey(doc) {
  let decryptError = false;
  try {
    decryptKey(doc.encKey);
  } catch {
    decryptError = true;
  }
  return {
    id: String(doc._id),
    label: doc.label,
    provider: doc.provider,
    keyPreview: doc.keyPreview,
    isActive: doc.isActive,
    lastUsedAt: doc.lastUsedAt,
    useCount: doc.useCount,
    failCount: doc.failCount,
    lastError: doc.lastError,
    lastUsedModel: doc.lastUsedModel,
    decryptError,
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listKeys() {
  const docs = await LlmKey.find().sort({ createdAt: 1 }).lean();
  return docs.map(toSafeKey);
}

export async function addKey({ label, key, adminUsername = "" }) {
  const plain = String(key || "").trim();
  if (!label || !label.trim()) return { ok: false, error: "กรุณาระบุชื่อ label" };
  if (plain.length < 10) return { ok: false, error: "API key สั้นเกินไป" };
  if (/\s/.test(plain)) return { ok: false, error: "API key มีช่องว่าง/ขึ้นบรรทัดใหม่ — copy อาจไม่ครบ" };

  const doc = await LlmKey.create({
    label: label.trim(),
    encKey: encryptKey(plain),
    keyPreview: maskKeyPreview(plain),
    isActive: true,
    createdBy: adminUsername,
    updatedBy: adminUsername,
  });
  return { ok: true, key: toSafeKey(doc) };
}

export async function updateKey(id, { label, key, isActive, adminUsername = "" }) {
  const doc = await LlmKey.findById(id);
  if (!doc) return { ok: false, error: "ไม่พบ key นี้" };

  if (label !== undefined) {
    if (!String(label).trim()) return { ok: false, error: "label ห้ามว่าง" };
    doc.label = String(label).trim();
  }
  // ใส่ key ใหม่เท่านั้นที่เข้ารหัสทับ — เว้นว่าง = เก็บของเดิม (ไม่มีทางดู key เดิมย้อน)
  if (key !== undefined && String(key).trim() !== "") {
    const plain = String(key).trim();
    if (plain.length < 10) return { ok: false, error: "API key สั้นเกินไป" };
    if (/\s/.test(plain)) return { ok: false, error: "API key มีช่องว่าง/ขึ้นบรรทัดใหม่ — copy อาจไม่ครบ" };
    doc.encKey = encryptKey(plain);
    doc.keyPreview = maskKeyPreview(plain);
    // credential เปลี่ยน = สถิติพังของใบเก่าไม่เกี่ยวแล้ว — reset ให้เริ่มนับใหม่
    doc.failCount = 0;
    doc.lastError = "";
  }
  if (isActive !== undefined) doc.isActive = !!isActive;
  doc.updatedBy = adminUsername;

  await doc.save();
  return { ok: true, key: toSafeKey(doc) };
}

export async function deleteKey(id) {
  const doc = await LlmKey.findByIdAndDelete(id);
  if (!doc) return { ok: false, error: "ไม่พบ key นี้" };
  return { ok: true };
}

export async function getActiveKeyCount() {
  return LlmKey.countDocuments({ isActive: true });
}

// เลือก key ใบถัดไปแบบ round-robin — atomic findOneAndUpdate กัน 2 job หยิบใบเดียวกัน
// sort lastUsedAt ขึ้น: null (ยังไม่เคยใช้) มาก่อน แล้วไล่ใบเก่าสุดก่อนเสมอ
export async function pickNextKey() {
  return LlmKey.findOneAndUpdate(
    { isActive: true },
    { $set: { lastUsedAt: new Date() }, $inc: { useCount: 1 } },
    { sort: { lastUsedAt: 1 }, new: true }
  );
}

export async function markKeySuccess(keyId, model) {
  await LlmKey.findByIdAndUpdate(keyId, {
    $set: { lastError: "", lastUsedModel: model || "" },
  }).catch(() => {});
}

export async function markKeyFailure(keyId, errMessage) {
  await LlmKey.findByIdAndUpdate(keyId, {
    $inc: { failCount: 1 },
    $set: { lastError: String(errMessage || "").slice(0, 500) },
  }).catch(() => {});
}
