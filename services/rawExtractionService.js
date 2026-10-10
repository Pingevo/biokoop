// rawExtractionService.js
// ═══════════════════════════════════════════════════════════════════
// FLOW ใหม่ — สกัดข้อมูลดิบทั้งหมดจากภาพ Kieslect 3 รูป แบบขนานกับ pipeline หลัก
// กติกา:
//  - fire & forget เท่านั้น: ฟังก์ชันนี้ไม่ throw กลับ และไม่ส่งอะไรกลับหาลูกค้าเด็ดขาด
//    (ไม่มี lineService import — ไม่มีท่อส่งแชท)
//  - ใช้ Gemini โมเดล "ตัวเดียว" ตาม llmExtractConfig — ไม่วน CANDIDATE_MODELS
//  - ใช้ key จาก collection llmkeys เท่านั้น (ไม่แตะ GEMINI_API_KEY ใน .env)
//  - เลือก key แบบ round-robin ต่อ 1 request (key1 -> key2 -> key3 -> วน)
//  - key พัง → failover ไปใบถัดไปในคิว (ข้าม key เท่านั้น ไม่ข้ามโมเดล)
//  - มี semaphore ของตัวเอง ไม่แย่ง MAX_CONCURRENT_AI_JOBS ของงานหลัก
//  - ผลทั้งสำเร็จ/ล้มเหลวเก็บลง collection rawextractions เสมอ
// ═══════════════════════════════════════════════════════════════════

import { RawExtraction } from "../models/RawExtraction.js";
import { Request } from "../models/Request.js";
import { logAiUsage } from "./aiUsageLogger.js";
import { openDownloadStream } from "./storageService.js";
import {
  pickNextKey,
  markKeySuccess,
  markKeyFailure,
  decryptKey,
  getActiveKeyCount,
} from "./llmKeyService.js";
import { getLlmExtractConfig } from "./llmExtractConfigService.js";

// ─── standalone fetch timeout (ไม่แชร์กับ aiService — flow นี้แยกเดี่ยว) ───
async function fetchWithTimeout(url, options = {}, timeoutMs = 75000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timeout หลังจากรอ ${timeoutMs / 1000} วินาที`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── semaphore ของ side-job เอง — จำกัด concurrent extraction ไม่ให้แย่งงานหลัก ───
const SIDE_MAX_CONCURRENT = Number(process.env.RAW_EXTRACT_MAX_CONCURRENT || 2);
let sideActive = 0;
const sideQueue = [];

function acquireSideSlot() {
  if (sideActive < SIDE_MAX_CONCURRENT) {
    sideActive++;
    return Promise.resolve();
  }
  return new Promise((resolve) => sideQueue.push(resolve));
}

function releaseSideSlot() {
  sideActive--;
  if (sideQueue.length > 0) {
    sideActive++;
    sideQueue.shift()();
  }
}

// ─── resolve ช่วงวันที่ของข้อมูลจาก rawResult.days + วันที่ลูกค้าส่ง ───
// ป้ายวันใต้กราฟมีแค่ "ชื่อวันย่อ + เลขวันที่" (ไทย "พ 16" / อังกฤษ "Wed 16") ไม่มีเดือน/ปี
// → anchor ป้ายสุดท้ายให้ตรงวันที่เดียวกันล่าสุดที่ ≤ sentAt (ลูกค้าส่งภาพวันสุดท้ายของช่วง)
// แล้วไล่ย้อนทีละวันครบทุกตำแหน่ง — รองรับข้ามเดือน/ปี และช่วงซ้อนทับ (ส่งถี่กว่า 7 วัน)
const DAY_LABEL_RE = /(\d{1,2})\s*$/;

export function resolveDataRange(dayLabels, sentAt) {
  const fallbackTo = sentAt || new Date();
  const fallback = {
    weekOf: fallbackTo,
    dataFrom: new Date(fallbackTo.getTime() - 6 * 86400000),
    dataTo: fallbackTo,
  };
  if (!Array.isArray(dayLabels) || !dayLabels.length) return fallback;

  const dayNums = dayLabels.map((l) => {
    const m = String(l || "").match(DAY_LABEL_RE);
    return m ? Number(m[1]) : null;
  });
  if (dayNums.some((n) => n === null)) return fallback;

  // หาวันที่ ≤ sentAt ที่ day-of-month == dayNums สุดท้าย (ค้นย้อน ≤ 45 วัน)
  const last = dayNums[dayNums.length - 1];
  const cursor = new Date(fallbackTo);
  cursor.setHours(0, 0, 0, 0);
  let anchor = null;
  for (let i = 0; i <= 45; i++) {
    const d = new Date(cursor.getTime() - i * 86400000);
    if (d.getDate() === last) { anchor = d; break; }
  }
  if (!anchor) return fallback;

  const dataTo = anchor;
  const dataFrom = new Date(anchor.getTime() - (dayNums.length - 1) * 86400000);
  return { weekOf: fallbackTo, dataFrom, dataTo };
}

// ─── PROMPT สกัดทุกค่า ───
const EXTRACTION_PROMPT = `คุณเป็นระบบสกัดข้อมูลดิบ (Raw Health Data Extraction) ระดับสูง จากภาพ Screenshot แอป Kieslect 3 รูป

ภาพที่ส่งมาคือ 3 หน้า (ลำดับอาจสลับกัน ให้จำแนกจากเนื้อหาในภาพเอง):
- "body_load": วงแหวน Body Load, กราฟแท่ง Body Load 7 วัน, Heart Rate Zone 1-3 / 4-5, Strength Training Duration, Steps, Calories
- "recovery": วงแหวน Recovery %, ช่อง Today vs Last 30 Days (HRV / Resting Heart Rate / Sleep Performance), กราฟเส้น HRV, กราฟเส้น Resting Heart Rate, กราฟแท่ง Recovery / Sleep Quality
- "sleep_quality": วงแหวน Sleep Quality %, กราฟแท่ง Sleep Quality 7 วัน, Sleep Duration, Sleep Efficiency, Sleep Consistency, High Sleep Stress, Sleep Stage (Light/Deep/REM/Awake), Restorative Sleep, Hours vs. Needed, ตารางเวลาเข้านอน/ตื่น

ภารกิจ: สกัด "ทุกค่าที่มองเห็นในภาพ" อย่างละเอียด — ห้ามสรุป ห้ามตัดทอน ห้ามเดา
- ค่ารายวัน, ค่าเฉลี่ย, ทุก series กราฟ (พร้อมป้ายวันถ้ามี), การเปรียบเทียบ (วันนี้ vs 30 วัน), หน่วย, ช่วงเวลา, เปอร์เซ็นต์, ระยะเวลา, ข้อความ/หัวข้อทุกบรรทัดบนหน้าจอ
- series 7 วันต้องเรียงตำแหน่งตรงกับป้ายวันใต้กราฟ (วันที่ไม่มีแท่ง/จุดให้ใส่ null ห้ามข้ามตำแหน่ง)
- ค่าที่อ่านไม่ชัดให้ใส่ null และบันทึกใน lowConfidenceFields — ห้ามเดาค่าที่มองไม่เห็น

ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามใช้ markdown code fence:

{
  "detected": true | false,
  "appName": "string ชื่อแอป/แบรนด์ที่ตรวจพบ เช่น 'Kieslect App'",
  "foundPages": ["body_load", "recovery", "sleep_quality"],
  "days": ["ป้ายวันใต้กราฟทั้ง 7 วัน ถ้ามี เช่น 'Sat 05'"],
  "pages": {
    "body_load": {
      "rings": {"bodyLoad": {"value": number|null, "max": number|null, "label": "string ป้ายใต้วงแหวน"}},
      "today": {"hrZone13": "string", "hrZone45": "string", "strength": "string", "steps": "string", "calories": "string"},
      "compare": {"hrZone13": "string", "hrZone45": "string", "strength": "string", "steps": "string"},
      "charts": {"bodyLoadSeries": [number|null x7]},
      "allVisibleMetrics": [{"label": "string ชื่อตามจอ", "value": "string", "unit": "string"}],
      "otherTexts": ["string ข้อความ/หัวข้ออื่นๆ ที่เห็นในหน้า"]
    },
    "recovery": {
      "rings": {"recoveryPercent": number|null},
      "today": {"hrv": "string", "restingHeartRate": "string", "sleepPerformance": "string"},
      "compare": {"hrv": "string", "restingHeartRate": "string", "sleepPerformance": "string"},
      "charts": {"recoverySeries": [], "hrvSeries": [], "rhrSeries": [], "sleepQualitySeries": []},
      "allVisibleMetrics": [{"label": "string", "value": "string", "unit": "string"}],
      "otherTexts": ["string"]
    },
    "sleep_quality": {
      "rings": {"qualityPercent": number|null},
      "today": {"duration": "string", "durationNote": "string", "efficiencyPercent": number|null, "consistencyPercent": number|null, "highStressPercent": number|null},
      "sleepStages": {
        "light": {"percent": number|null, "time": "string"},
        "deep": {"percent": number|null, "time": "string"},
        "rem": {"percent": number|null, "time": "string"},
        "awake": {"percent": number|null, "time": "string"}
      },
      "restorativeSleep": {"value": "string", "compare": "string"},
      "charts": {"qualitySeries": [], "hoursVsNeededSeries": [], "hoursNeededSeries": [], "consistencySeries": []},
      "bedtimeWakeTable": [{"day": "string", "bedtime": "string", "wakeTime": "string"}],
      "allVisibleMetrics": [{"label": "string", "value": "string", "unit": "string"}],
      "otherTexts": ["string"]
    }
  },
  "unmappedValues": [{"page": "string", "rawText": "string ค่าที่เห็นแต่จัดหมวดไม่ได้"}],
  "lowConfidenceFields": [{"field": "string", "page": "string", "value": "string|null", "reason": "string"}],
  "confidence": number 0-1,
  "notes": "string ขาดหน้าไหน/ปัญหาอะไร อย่างเป็นมิตร"
}

ถ้าพบภาพไม่ครบ 3 ประเภท หรือภาพไม่ใช่หน้าจอแอปสุขภาพ ให้ตอบ "detected": false ระบุ foundPages ที่เจอ และอธิบายใน notes`;

const GEMINI_TIMEOUT_MS = 75000;
const MAX_KEY_ATTEMPTS = 5; // failover ข้าม key ได้สูงสุดกี่ใบต่อ 1 request

// ─── ยิง Gemini 1 ครั้งด้วย key ที่ให้มา (โมเดลตาม config — ไม่วนโมเดล) ───
async function callGeminiExtraction({ apiKey, model, imageBuffers, mimeType, maxOutputTokens }) {
  const parts = [{ text: EXTRACTION_PROMPT }];
  for (const buf of imageBuffers) {
    parts.push({ inline_data: { mime_type: mimeType, data: buf.toString("base64") } });
  }

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens,
          responseMimeType: "application/json",
        },
      }),
    },
    GEMINI_TIMEOUT_MS
  );

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Gemini API Error (${response.status}): ${errText.slice(0, 300)}`);
    err.httpStatus = response.status;
    throw err;
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const usageMeta = data.usageMetadata || {};
  return {
    rawText,
    usage: {
      promptTokens: usageMeta.promptTokenCount || 0,
      completionTokens: usageMeta.candidatesTokenCount || 0,
      totalTokens: usageMeta.totalTokenCount || 0,
    },
    rawUsage: usageMeta,
  };
}

// parse JSON แบบผ่อนปรน — ตัด fence, ถ้า parse ไม่ได้เก็บ text ดิบไว้
function parseExtractionText(rawText) {
  const cleaned = String(rawText || "").replace(/```json|```/g, "").trim();
  try {
    return { parsed: JSON.parse(cleaned), unparsed: false };
  } catch {
    return { parsed: { _unparsed: true, text: cleaned.slice(0, 50000) }, unparsed: true };
  }
}

/**
 * จุดเรียกหลัก — fire & forget เท่านั้น
 * ไม่ throw เด็ดขาด: ทุก error ถูกบันทึกลง RawExtraction แล้วจบเงียบๆ
 */
// โหลด buffer รูปต้นฉบับของ request จาก GridFS — ใช้ตอน retry/backfill (ไม่มี buffer ในหน่วยความจำ)
// weekly → originalImageIds[3] ใน "original_images" | legacy → originalImageId เดี่ยว (fallback bucket "originals")
function _gridfsBuffer(bucket, id) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    openDownloadStream(bucket, id)
      .on("data", (c) => chunks.push(c))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);
  });
}

export async function loadRequestImageBuffers(request) {
  if (!request) throw new Error("ไม่พบ request");
  if (request.reportType === "weekly") {
    const ids = request.originalImageIds || [];
    if (ids.length !== 3) throw new Error(`originalImageIds ไม่ครบ (${ids.length}/3) — รูปอาจยังเซฟไม่เสร็จ`);
    return Promise.all(ids.map((id) => _gridfsBuffer("original_images", id)));
  }
  if (!request.originalImageId) throw new Error("ไม่มี originalImageId");
  return [await _gridfsBuffer("original_images", request.originalImageId)
    .catch(() => _gridfsBuffer("originals", request.originalImageId))];
}

export async function runRawExtraction({ requestId, lineUserId, imageBuffers, mimeType = "image/jpeg", userDisplayName }) {
  await acquireSideSlot();
  const startTime = Date.now();
  try {
    const config = getLlmExtractConfig();
    if (!config.enabled) {
      console.log("[rawExtraction] flow ถูกปิดไว้ใน config — ข้าม");
      return;
    }
    if (!Array.isArray(imageBuffers) || imageBuffers.length === 0) return;

    const record = new RawExtraction({
      requestId,
      lineUserId,
      model: config.model,
      imageCount: imageBuffers.length,
      status: "failed",
    });

    const activeKeys = await getActiveKeyCount();
    if (!activeKeys) {
      record.errorMessage = "ไม่มี Gemini key ที่เปิดใช้งาน — เพิ่ม/เปิด key ได้ที่หน้า /llmkey2";
      await record.save().catch(() => {});
      console.warn("[rawExtraction] ไม่มี key active — บันทึก failed record");
      return;
    }

    let lastError = "";
    const attempts = Math.min(activeKeys, MAX_KEY_ATTEMPTS);

    for (let i = 0; i < attempts; i++) {
      const keyDoc = await pickNextKey();
      if (!keyDoc) break;

      record.keyId = keyDoc._id;
      record.keyLabel = keyDoc.label;
      const attemptStart = Date.now();

      try {
        const apiKey = decryptKey(keyDoc.encKey);
        const resp = await callGeminiExtraction({
          apiKey,
          model: config.model,
          imageBuffers,
          mimeType,
          maxOutputTokens: config.maxOutputTokens,
        });

        const { parsed } = parseExtractionText(resp.rawText);
        record.status = "success";
        record.rawResult = parsed;
        // stamp ช่วงวันที่ของข้อมูล (วันที่ลูกค้าส่ง + ป้ายวันใต้กราฟ) — chatbot ใช้ตอบ "ข้อมูลช่วงไหน"
        const reqDoc = await Request.findById(requestId).select("createdAt").lean().catch(() => null);
        const range = resolveDataRange(parsed?.days, reqDoc?.createdAt || new Date());
        record.weekOf = range.weekOf;
        record.dataFrom = range.dataFrom;
        record.dataTo = range.dataTo;
        record.promptTokens = resp.usage.promptTokens;
        record.completionTokens = resp.usage.completionTokens;
        record.totalTokens = resp.usage.totalTokens;
        record.durationMs = Date.now() - startTime;
        await record.save().catch(() => {});
        await markKeySuccess(keyDoc._id, config.model);

        console.log(
          `[rawExtraction] ✅ สกัดสำเร็จ ของ ${lineUserId} (${Date.now() - startTime}ms, model=${config.model}, key="${keyDoc.label}", tokens=${resp.usage.totalTokens})`
        );
        logAiUsage({
          provider: "gemini",
          model: config.model,
          operation: "generateContent",
          source: "rawExtraction",
          user: userDisplayName || lineUserId || "LINE User",
          reference: `line_user:${lineUserId}`,
          prompt_tokens: resp.usage.promptTokens,
          completion_tokens: resp.usage.completionTokens,
          duration_ms: Date.now() - attemptStart,
          status: "success",
          http_status: 200,
          raw_usage: resp.rawUsage,
        });
        return;
      } catch (err) {
        lastError = err.message;
        console.warn(
          `[rawExtraction] ⚠️ key "${keyDoc.label}" ล้มเหลว (${err.message?.slice(0, 120)}) — ลองใบถัดไป [${i + 1}/${attempts}]`
        );
        await markKeyFailure(keyDoc._id, err.message);
        logAiUsage({
          provider: "gemini",
          model: config.model,
          operation: "generateContent",
          source: "rawExtraction",
          user: userDisplayName || lineUserId || "LINE User",
          reference: `line_user:${lineUserId}`,
          duration_ms: Date.now() - attemptStart,
          status: "error",
          http_status: err.httpStatus || 500,
          error_message: err.message,
        });
      }
    }

    record.errorMessage = lastError || `ทุก key (${attempts} ใบ) ใช้งานไม่สำเร็จ`;
    record.durationMs = Date.now() - startTime;
    await record.save().catch(() => {});
    console.error(`[rawExtraction] ❌ สกัดล้มเหลวทุก key ของ ${lineUserId}: ${record.errorMessage?.slice(0, 150)}`);
  } catch (err) {
    // outer safety net — เก็บเป็น failed record แทนที่จะปล่อย throw หลุด
    console.error("[rawExtraction] outer error:", err.message);
    try {
      await RawExtraction.create({
        requestId,
        lineUserId,
        status: "failed",
        errorMessage: `outer: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    } catch {}
  } finally {
    releaseSideSlot();
  }
}
