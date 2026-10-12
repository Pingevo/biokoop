import { Router } from "express";
import {
  lineMiddleware,
  replyRegistrationPrompt,
  replyWelcomePrompt,
  replyHowToPrompt,
  replyText,
  replyTextWithQuickReply,
  replyImage,
  sendResultCardWithShare,
  sendWeeklyReportImages,
  getProfile,
  getImageContent,
  pushText,
  pushFlex,
  replyMessages,
  showLoadingAnimation,
} from "../services/lineService.js";
import { queueWeeklyImage } from "../services/pipeline.js";
import { classifyWeeklyImage } from "../services/aiService.js";
import { optimizeImageForAi } from "../services/imageService.js";
import { buildFoodFlex, buildFoodLoadingFlex } from "../services/foodFlexTemplate.js";
import { addIncomingText, draftConfig } from "../services/chatDraftBuffer.js";
import {
  CHAT_ENTER_TEXT,
  FOOD_ENTER_TEXT,
  enterChatMode,
  getChatMode,
  touchChatMode,
  exitChatMode,
} from "../services/chatMode.js";
import { getBotMessagesConfig } from "../services/botMessagesConfigService.js";
import { inSimContext } from "../services/simContext.js";
import { getRegistrationConfig } from "../services/registrationConfigService.js";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Request, REQUEST_STATUS } from "../models/Request.js";
import { RawExtraction } from "../models/RawExtraction.js";
import { logLineMessage } from "../models/LineMessageLog.js";

const router = Router();

router.post("/", (req, res, next) => {
  // บันทึก log การยิงเข้า webhook
  console.log(
    "[webhook] Request received. Signature header:",
    req.headers["x-line-signature"] ? "present" : "missing"
  );

  // ตอบ 200 ทันทีหากเป็นการทดสอบกด Verify (ไม่มี x-line-signature)
  if (!req.headers["x-line-signature"]) {
    return res.status(200).send("OK");
  }

  // เรียก lineMiddleware สำหรับ LINE event จริง
  lineMiddleware(req, res, (err) => {
    if (err) {
      console.warn("[webhook] Signature verification warning:", err.message);
      return res.status(200).send("OK");
    }

    res.status(200).send("OK");

    const events = req.body?.events || [];
    for (const event of events) {
      handleEvent(event).catch((e) => {
        console.error("[webhook] handleEvent error:", e);
      });
    }
  });
});

// แปลง event ที่ผู้ใช้ส่งเข้ามาให้เป็น log entry (ไม่ขัดขวาง flow หลักหากบันทึกไม่สำเร็จ)
function logIncomingEvent(event, lineUserId) {
  if (!lineUserId) return;

  if (event.type === "follow") {
    logLineMessage({ lineUserId, sendType: "incoming", messageType: "follow", content: "ผู้ใช้กดแอดเพื่อน (follow)" });
    return;
  }

  if (event.type !== "message") return;

  const message = event.message || {};
  switch (message.type) {
    case "text":
      logLineMessage({ lineUserId, sendType: "incoming", messageType: "text", content: message.text || "" });
      break;
    case "image":
      logLineMessage({ lineUserId, sendType: "incoming", messageType: "image", content: `[รูปภาพ] messageId: ${message.id}` });
      break;
    case "sticker":
      logLineMessage({ lineUserId, sendType: "incoming", messageType: "sticker", content: `[สติ๊กเกอร์] packageId: ${message.packageId}, stickerId: ${message.stickerId}` });
      break;
    case "file":
      logLineMessage({ lineUserId, sendType: "incoming", messageType: "file", content: `[ไฟล์] ${message.fileName || message.id}` });
      break;
    default:
      logLineMessage({ lineUserId, sendType: "incoming", messageType: "other", content: `[${message.type}] messageId: ${message.id || ""}` });
  }
}

const PY_CHAT_URL = (process.env.PY_CHAT_URL || "http://127.0.0.1:5001").replace(/\/$/, "");

// ยิงข้อความเข้า Python chatbot (:5001) — คืน response เต็ม (answer + meta)
async function askHealthChatbotJson(lineUserId, text, sessionId, images = [], task = null) {
  try {
    const r = await fetch(`${PY_CHAT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineUserId, message: text, sessionId,
        adminUsername: inSimContext() ? "chat-mode-sim" : "chat-mode", images,
        ...(task ? { task } : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    return await r.json();
  } catch {
    return null;
  }
}

// เวอร์ชันเดิม — คืน answer text พร้อมใช้ reply จริง
async function askHealthChatbot(lineUserId, text, sessionId, images = [], task = null) {
  const j = await askHealthChatbotJson(lineUserId, text, sessionId, images, task);
  if (j?.answer) return j.answer;
  const v = await botVoice();
  return `ขออภัย${v.p} ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งนะ${v.p}`;
}

// เสียงบอทตาม persona — ถ้า config ระบุผู้ชาย/ครับ → ผม+ครับ, ไม่งั้น ดิฉัน+ค่ะ (default เดิม)
let _voiceCache = null;
let _voiceAt = 0;
async function botVoice() {
  if (_voiceCache && Date.now() - _voiceAt < 60_000) return _voiceCache;
  let doc = {};
  try {
    doc = (await mongoose.connection.db
      .collection("chatbotconfig").findOne({ _id: "persona" })) || {};
  } catch { /* ใช้ default */ }
  const p = `${doc.persona || ""}`;
  const male = /ผู้ชาย/.test(p) || (p.includes("ครับ") && !/ผู้หญิง|ดิฉัน|ค่ะ/.test(p));
  _voiceCache = {
    botName: (doc.botName || "biokoop").trim() || "biokoop",
    self: male ? "ผม" : "ดิฉัน",
    p: male ? "ครับ" : "ค่ะ",
  };
  _voiceAt = Date.now();
  return _voiceCache;
}

// ทักทายตอนเข้าโหมดแชท — ชื่อบอท+เสียงตาม persona + ทักด้วยชื่อเล่นลูกค้าถ้ามี
async function chatModeGreeting(lineUserId) {
  const v = await botVoice();
  let custName = "";
  try {
    const u = await mongoose.connection.db
      .collection("users").findOne({ lineUserId }, { projection: { nickname: 1 } });
    const n = (u?.nickname || "").trim();
    // ข้ามชื่อที่เป็นของระบบ/เทส (userbot, test, ทดสอบ) — เหมือนฝั่ง Python
    if (n && n !== lineUserId && !/userbot|testline|ทดสอบ|test[_-]?script/i.test(n)) custName = n;
  } catch { /* ไม่มีชื่อก็ทักทั่วไป */ }
  const who = custName ? `คุณ${custName}` : "";
  return `ยินดีให้ความช่วยเหลือ${v.p}${who ? who + " " : " "}😊 ${v.self}${v.botName} ผู้ช่วยดูแลสุขภาพประจำตัวของคุณ\n\n` +
    `ถามเรื่องการนอน Recovery HRV หรือข้อมูลสุขภาพจากนาฬิกา Kieslect ได้เลย${v.p}\n\n` +
    `(โหมดแชทบอท — ถ้าไม่มีการคุยต่อ 15 นาที หรือกดเมนูอื่น ระบบจะกลับสู่โหมดปกติ${v.p})`;
}

// ทักทายตอนเข้าโหมดโภชนาการ — เสียงตาม persona เช่นเดียวกัน
async function foodModeIntro() {
  const v = await botVoice();
  return `เข้าสู่โหมดประเมินโภชนาการอาหาร 🍽️\n\n` +
    `ส่งรูปอาหารมาได้เลย${v.p} — ระบบจะแยกส่วนประกอบเป็นกรัม และบอกพลังงาน โปรตีน คาร์โบไฮเดรต ไขมัน (อิ่มตัว/ไม่อิ่มตัว) เป็นตัวเลขให้\n\n` +
    `(กดเมนูอื่นหรือไม่คุยต่อ 15 นาที เพื่อออกจากโหมดนี้${v.p})`;
}

// prompt โหมดโภชนาการ — บังคับรูปแบบ: ตารางวัตถุดิบรายชิ้น (กรัม+สารอาหาร) + ตารางสรุปรวม ห้ามตอบเป็นช่วง
const FOOD_ANALYSIS_PROMPT =
  `วิเคราะห์อาหารในรูปนี้ ตอบเป็น JSON object เท่านั้น (ห้ามมีข้อความอื่น ห้าม markdown/code fence) ตาม schema นี้:\n` +
  `{"menu":"ชื่ออาหารภาษาไทย","items":[{"name":"ชื่อวัตถุดิบภาษาไทย","qty":1,"unit":null,"gram":0,"kcal":0,"carb":0,"protein":0,"fat":0}],\n` +
  `"total":{"gram":0,"kcal":0,"carb":0,"protein":0,"fat":0,"satFat":0,"unsatFat":0,"sugar":0,"sodium":0,"fiber":0},\n` +
  `"note":"ข้อสังเกตสั้นๆ ภาษาไทย หรือ null"}\n\n` +
  `กฎ:\n` +
  `- แยกทุกอย่างที่เห็นในจาน (ข้าว เนื้อสัตว์ ไข่ ผักแต่ละชนิด ซอส/น้ำมัน) ประเมินน้ำหนักเทียบขนาดจาน/ช้อนมาตรฐาน\n` +
  `- ของที่นับเป็นชิ้นได้ (ไข่ ผลไม้ ของทอดชิ้นๆ เครื่องดื่ม) ให้ใส่ qty=จำนวนชิ้น และ unit=หน่วยนับไทย ("ฟอง","ชิ้น","ลูก","แก้ว","ขวด") เช่น ไข่ต้ม 4 ฟอง → qty:4 unit:"ฟอง" — ของที่ไม่นับชิ้น (ข้าว ซอส ผัก) ให้ qty:1 unit:null\n` +
  `- หน่วย: gram/carb/protein/fat/satFat/unsatFat/sugar/fiber = กรัม, sodium = มิลลิกรัม, kcal = กิโลแคลอรี\n` +
  `- ตัวเลขเดียวเท่านั้นทุกช่อง ห้ามเป็นช่วง ห้ามใช้คำว่า "ประมาณ/ถึง" — ใส่ตัวเลข number เท่านั้นไม่ใส่หน่วยในค่า\n` +
  `- ตัวเลขแต่ละวัตถุดิบรวมกันต้องใกล้เคียงผลรวมทั้งจาน\n` +
  `- ถ้ารูปไม่ใช่อาหารหรือมองไม่ชัดพอประเมิน ให้ตอบ {"error":"เหตุผลสั้นๆ ภาษาไทย"} แทน`;

// debounce ข้อความในโหมดบอท/โภชนาการ — รอลูกค้าพิมพ์จบ (ตาม draft.debounceSeconds)
// แล้วรวมเป็นข้อความเดียวส่ง LLM ตอบครั้งเดียวผ่าน push (replyToken หมดอายุระหว่างรอ)
const modeTextBufs = new Map(); // lineUserId -> { texts[], timer, sessionId, task }

async function queueModeText(lineUserId, text, sess) {
  const cfg = await draftConfig().catch(() => null);
  const delayMs = Math.min(120, Math.max(3, cfg?.debounceSeconds || 10)) * 1000;
  let buf = modeTextBufs.get(lineUserId);
  if (!buf) { buf = { texts: [], timer: null }; modeTextBufs.set(lineUserId, buf); }
  buf.sessionId = sess.sessionId;
  buf.task = sess.mode === "food" ? "food" : null;
  buf.texts.push(text);
  clearTimeout(buf.timer);
  buf.timer = setTimeout(() => flushModeText(lineUserId), delayMs);
  buf.timer.unref?.();
  showLoadingAnimation(lineUserId, 60).catch(() => {}); // จุดหมุน "กำลังคิด" ฟรี — หมุนค้างตอนรอ debounce + AI ตอบ
}

async function flushModeText(lineUserId) {
  const buf = modeTextBufs.get(lineUserId);
  if (!buf) return;
  modeTextBufs.delete(lineUserId);
  clearTimeout(buf.timer);
  const sess = getChatMode(lineUserId);
  if (!sess || sess.sessionId !== buf.sessionId) return; // หลุดโหมด/เปลี่ยน session แล้ว
  const message = buf.texts.join("\n").slice(0, 4000);
  if (!message.trim()) return;
  try {
    const ans = await askHealthChatbot(lineUserId, message, sess.sessionId, [], buf.task);
    touchChatMode(lineUserId, message);
    await pushText(lineUserId, ans).catch((e) =>
      console.error("[webhook] modeReply push error:", e));
  } catch (e) {
    console.error("[webhook] modeReply flush failed:", e.message);
  }
}

// รอ raw extraction ของ request นี้เสร็จก่อนเรียกบอท — ไม่งั้น context ไม่มีข้อมูลชุดใหม่
// poll ทุก 3s สูงสุด timeoutMs; true = เสร็จ, false = ล้มเหลว/หมดเวลา (บอท fallback ตอบจาก aiData)
async function waitExtractionDone(requestId, timeoutMs = 75_000) {
  if (!requestId) return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await RawExtraction.findOne({ requestId }).sort({ createdAt: -1 })
      .select("status").lean().catch(() => null);
    if (st?.status === "success") return true;
    if (st?.status === "failed") return false;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

// ตาข่ายสำรอง: ถ้า python parse พลาดแต่ answer เป็น JSON ล้วน → แปลงเป็น flex แทนแสดงดิบ
function tryParseFoodJson(s) {
  if (!s || typeof s !== "string" || !s.trimStart().startsWith("{")) return null;
  try {
    const d = JSON.parse(s);
    return Array.isArray(d?.items) && d.items.length ? d : null;
  } catch { return null; }
}

// รูปที่ส่งในโหมดบอท: food=ประเมินโภชนาการ | chat=ถ้าเป็น screenshot สุขภาพเข้า pipeline
// สกัดเหมือนเดิมแต่ตอบกลับแบบสนทนา (ไม่ใช่รายงานการ์ด) — รูปอื่นบอทอ่านตอบทั่วไป
async function handleChatModeImage(lineUserId, messageId, replyToken, sess) {
  const rawBuffer = await getImageContent(messageId).catch(() => null);
  if (!rawBuffer) {
    if (replyToken) {
      const v = await botVoice();
      await replyText(replyToken, `ขออภัย${v.p} ดึงรูปไม่สำเร็จ ลองส่งใหม่อีกครั้งนะ${v.p}`, lineUserId).catch(() => {});
    }
    return;
  }
  const optimized = await optimizeImageForAi(rawBuffer).catch(() => rawBuffer);
  const image = [{ data: optimized.toString("base64"), mimeType: "image/jpeg" }];

  if (sess.mode === "food") {
    // ack ทันที (reply ฟรี) + จุดหมุนกำลังคิด — ผลจริงส่งทาง push ตาม pattern flow เดิม
    if (replyToken) {
      await replyMessages(replyToken, [
        { type: "text", text: "ได้รับภาพแล้วค่ะ กำลังประมวลผลภาพให้นะคะ 🍽️" },
        buildFoodLoadingFlex(),
      ], lineUserId).catch((e) => console.error("[webhook] food ack reply error:", e));
    }
    showLoadingAnimation(lineUserId, 60).catch(() => {});
    const j = await askHealthChatbotJson(lineUserId, FOOD_ANALYSIS_PROMPT, sess.sessionId, image, "food");
    touchChatMode(lineUserId);
    const food = j?.meta?.foodData || tryParseFoodJson(j?.answer);
    if (food && Array.isArray(food.items) && food.items.length) {
      try {
        await pushFlex(lineUserId, buildFoodFlex(food));
      } catch (e) {
        console.error("[webhook] food flex push failed:", e);
        const v = await botVoice();
        await pushText(lineUserId, j.answer || `ขออภัย${v.p} ระบบขัดข้องชั่วคราว${v.p}`).catch(() => {});
      }
    } else {
      const v = await botVoice();
      await pushText(lineUserId, j?.answer || `ขออภัย${v.p} ระบบขัดข้องชั่วคราว${v.p}`).catch(() => {});
    }
    return;
  }

  const cls = await classifyWeeklyImage(optimized, "image/jpeg").catch(() => ({ page: "unknown" }));
  if (cls.page !== "unknown" && (cls.confidence ?? 0) >= 0.5) {
    showLoadingAnimation(lineUserId, 45).catch(() => {});
    await queueWeeklyImage({
      lineUserId, messageId, replyToken,
      onComplete: async (aiData, report) => {
        // การ์ดรายงาน flow เดิมไปก่อนเสมอ
        await sendWeeklyReportImages(lineUserId, report?.imageUrls || [], aiData, report?.combinedImageUrl)
          .catch((err) => console.error("[webhook] sendWeeklyReportImages(chat-mode) error:", err));
        // รอ raw extraction เสร็จ — บอทต้องมีข้อมูลชุดใหม่ใน context ถึงตอบคำถามเจาะจงได้
        showLoadingAnimation(lineUserId, 60).catch(() => {});
        const ready = await waitExtractionDone(report?.requestId);
        showLoadingAnimation(lineUserId, 45).catch(() => {});
        const q = sess.lastQuestion;
        sess.lastQuestion = ""; // ใช้แล้วล้าง กันคำถามเก่าติดค้างไป batch ถัดไป
        const prompt =
          `[ระบบ] ลูกค้าเพิ่งส่งภาพ Kieslect ครบ 3 หน้า ระบบวิเคราะห์และสกัดข้อมูล` +
          (ready ? "เสร็จเรียบร้อย — ข้อมูลชุดล่าสุดอยู่ใน context แล้ว" : "แล้ว แต่การสกัดข้อมูลดิบอาจยังไม่เสร็จ ให้ใช้ผลวิเคราะห์ที่แนบนี้เป็นหลัก") +
          `\nผลวิเคราะห์รายงาน: ${JSON.stringify(aiData).slice(0, 6000)}\n` +
          (q
            ? `คำถามที่ลูกค้าถามไว้ก่อนส่งภาพ: "${q}"\n` +
              `→ ตอบคำถามนี้เป็นประเด็นแรกและสำคัญที่สุด ใช้ตัวเลขจริงจากข้อมูลของลูกค้าคำนวณ/เทียบเกณฑ์เพื่อให้คำแนะนำที่เจาะจง แล้วค่อยสรุปภาพรวมของช่วงข้อมูลล่าสุดสั้นๆ ต่อท้าย`
            : `ลูกค้าไม่ได้ถามอะไรค้างไว้ → เล่าผลรายงานให้ฟังแบบสนทนา เน้นจุดที่น่าสนใจที่สุด`);
        const ans = await askHealthChatbot(lineUserId, prompt, sess.sessionId);
        await pushText(lineUserId, ans).catch(() => {});
      },
    });
    touchChatMode(lineUserId);
    return;
  }

  // รูปทั่วไป (ไม่ใช่ Kieslect) — ack "กำลังประมวลผล" + จุดหมุน แล้วค่อย push คำตอบ
  if (replyToken) {
    await replyText(replyToken, "ได้รับภาพแล้วค่ะ กำลังประมวลผลภาพให้นะคะ ⏳", lineUserId).catch(() => {});
  }
  showLoadingAnimation(lineUserId, 45).catch(() => {});
  const ans = await askHealthChatbot(lineUserId, "", sess.sessionId, image);
  touchChatMode(lineUserId);
  await pushText(lineUserId, ans).catch(() => {});
}

export async function handleEvent(event) {
  if (event.type !== "message" && event.type !== "follow") return;

  const lineUserId = event.source?.userId;
  if (!lineUserId) return;

  const replyToken = event.replyToken;

  // บันทึก log ข้อความที่ผู้ใช้ส่งเข้ามา (ทุกประเภท) เพื่อเก็บประวัติการแชทไว้ดูและวิเคราะห์ย้อนหลัง
  logIncomingEvent(event, lineUserId);

  // ค้นหา หรือสร้างโปรไฟล์ผู้ใช้เบื้องต้น
  let user = await User.findOne({ lineUserId });
  if (!user) {
    const profile = await getProfile(lineUserId).catch(() => ({}));
    user = await User.touch(lineUserId, profile);
  }

  // หากเปิดโหมด "no_registration" ให้ถือว่าผู้ใช้ทุกคนพร้อมใช้งานทันทีโดยไม่ต้องลงทะเบียน
  const skipRegistration = getRegistrationConfig().mode === "no_registration";
  const isRegistered = user.isRegistered || skipRegistration;

  // ── FOLLOW EVENT (แอดเพื่อนใหม่ / เลิกติดตามแล้วแอดใหม่) ──
  if (event.type === "follow") {
    if (replyToken) {
      await replyWelcomePrompt(replyToken, lineUserId, isRegistered).catch((err) => {
        console.error("[webhook] replyWelcomePrompt error:", err);
      });
    }
    return;
  }

  const isTextMessage = event.type === "message" && event.message.type === "text";
  const text = isTextMessage ? event.message.text.trim() : "";
  const autoReplies = getBotMessagesConfig().autoReplies;

  // ── คำสั่งจากปุ่ม Rich Menu & คำทักทายทั่วไป ──
  if (isTextMessage) {
    // ── LINE ADMIN COMMANDS ──
    if (
      text.startsWith("/admin") ||
      text.startsWith("!admin") ||
      text === "/stats" ||
      text === "!stats" ||
      text === "/review" ||
      text === "!review"
    ) {
      const adminIds = (process.env.ADMIN_LINE_USER_IDS || "").split(",").map((s) => s.trim());
      const isEnvAdmin = adminIds.includes(lineUserId);

      if (text.startsWith("/admin auth ") || text.startsWith("/admin login ")) {
        const inputPass = text.replace(/^\/admin (auth|login)\s+/, "").trim();
        const adminPass = process.env.ADMIN_PASSWORD || "biokoop2026";
        if (inputPass === adminPass) {
          user.role = "admin";
          await user.save();
          if (replyToken) {
            await replyText(
              replyToken,
              "✅ ยินดีต้อนรับเข้าสู่ระบบ Admin บน LINE เรียบร้อยค่ะ!\nคุณสามารถใช้คำสั่ง:\n- /stats : ดูสถิติระบบ\n- /review : ดูรายการที่รอรีวิว",
              lineUserId
            );
          }
        } else {
          if (replyToken) await replyText(replyToken, "❌ รหัสผ่าน Admin ไม่ถูกต้องค่ะ", lineUserId);
        }
        return;
      }

      if (user.role !== "admin" && !isEnvAdmin) {
        if (replyToken) {
          await replyText(
            replyToken,
            "🔒 คำสั่งนี้สำหรับผู้ดูแลระบบ (Admin) เท่านั้นค่ะ\nพิมพ์ '/admin auth <รหัสผ่าน>' เพื่อยืนยันตัวตน",
            lineUserId
          );
        }
        return;
      }

      if (text === "/stats" || text === "!stats" || text.includes("stats")) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const [totalRequests, needsReview, sentToday, failedToday, totalUsers, activeUsers] = await Promise.all([
          Request.countDocuments({ createdAt: { $gte: startOfDay } }),
          Request.countDocuments({ status: "needs_review" }),
          Request.countDocuments({ status: "sent", createdAt: { $gte: startOfDay } }),
          Request.countDocuments({ status: "failed", createdAt: { $gte: startOfDay } }),
          User.countDocuments(),
          User.countDocuments({ status: "active" }),
        ]);

        const msg =
          `📊 [BIOKOOP ADMIN STATS] 📊\n\n` +
          `📥 คำร้องขอวันนี้: ${totalRequests} รายการ\n` +
          `✅ สำเร็จวันนี้: ${sentToday} รายการ\n` +
          `❌ ล้มเหลววันนี้: ${failedToday} รายการ\n` +
          `⚠️ รอรีวิว (Needs Review): ${needsReview} รายการ\n` +
          `👥 สมาชิกทั้งหมด: ${totalUsers} คน (Active ${activeUsers} คน)`;

        if (replyToken) await replyText(replyToken, msg, lineUserId);
        return;
      }

      if (text === "/review" || text === "!review" || text.includes("review")) {
        const pending = await Request.find({ status: "needs_review" }).sort({ createdAt: -1 }).limit(5);
        if (pending.length === 0) {
          if (replyToken) {
            await replyText(replyToken, "✨ ไม่มีรายการรอตรวจสอบ (Needs Review) ในขณะนี้ค่ะ", lineUserId);
          }
          return;
        }

        let msg = `⚠️ [รายการรอการรีวิว (${pending.length} รายการ)] ⚠️\n\n`;
        pending.forEach((req, idx) => {
          const dateStr = new Date(req.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
          msg += `${idx + 1}. ID: ${req._id}\n   เวลา: ${dateStr}\n   คะแนน: ${req.aiResult?.score ?? "N/A"}\n   โมเดล: ${req.aiModel || "Gemini"}\n   LINE User: ${req.lineUserId}\n\n`;
        });
        msg += `🔗 ตรวจสอบเพิ่มเติมได้ที่ Web Admin Dashboard: ${process.env.PUBLIC_BASE_URL || ""}/admin`;

        if (replyToken) await replyText(replyToken, msg, lineUserId);
        return;
      }

      // Default /admin help
      const helpMsg =
        `🛠️ [BIOKOOP ADMIN COMMANDS] 🛠️\n\n` +
        `- /stats : ดูสถิติการใช้งานและจำนวนคำร้องขอวันนี้\n` +
        `- /review : ดูรายการที่ติดธงรอตรวจสอบ (Needs Review)\n` +
        `- /admin auth <รหัสผ่าน> : ยืนยันสิทธิ์แอดมิน`;
      if (replyToken) await replyText(replyToken, helpMsg, lineUserId);
      return;
    }

    // ── โหมดแชทบอท (Rich Menu "คุยกับบอท" / "โภชนาการอาหาร") ──
    if (text === CHAT_ENTER_TEXT || text === FOOD_ENTER_TEXT) {
      const mode = text === CHAT_ENTER_TEXT ? "chat" : "food";
      if (!isRegistered) {
        if (replyToken) {
          await replyRegistrationPrompt(
            replyToken, lineUserId,
            `กรุณาลงทะเบียนก่อนใช้งาน${mode === "chat" ? "แชทบอท" : "ฟีเจอร์โภชนาการอาหาร"}นะคะ`
          ).catch((err) => console.error("[webhook] replyRegistrationPrompt(mode-enter) error:", err));
        }
        return;
      }
      enterChatMode(lineUserId, mode);
      if (replyToken) {
        const greet = mode === "chat" ? await chatModeGreeting(lineUserId) : await foodModeIntro();
        await replyText(replyToken, greet, lineUserId).catch((err) =>
          console.error("[webhook] replyText(mode-enter) error:", err));
      }
      return;
    }

    // กดปุ่ม Rich Menu อื่น → หลุดโหมดบอททันที แล้วปล่อย flow เดิมทำงานตามปกติ
    // (ข้อความที่พิมพ์เอง รวมถึงทักทาย ไม่หลุดโหมด — ให้บอทตอบ)
    const isMenuText =
      text === "ลงทะเบียน" || text === "ติดต่อสอบถาม" ||
      text === "เลือกภาพเพื่อวิเคราะห์" || text === "ส่งรูปวิเคราะห์" ||
      text === "ผลลัพธ์ล่าสุด" || text === "วิธีใช้งาน";
    if (isMenuText) exitChatMode(lineUserId);

    // อยู่ในโหมดบอท + ข้อความอิสระ → เข้า debounce buffer → รวมตอบครั้งเดียว (ไม่เข้า flow เดิม/draft)
    const chatSess = getChatMode(lineUserId);
    if (chatSess) {
      queueModeText(lineUserId, text, chatSess).catch((err) =>
        console.error("[webhook] modeText buffer error:", err));
      return;
    }

    // 1. คำทักทายทั่วไป (สวัสดี, หวัดดี, hi, hello)
    if (/^(สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hi|hello|hey)/i.test(text)) {
      if (replyToken) {
        if (!isRegistered) {
          await replyRegistrationPrompt(
            replyToken,
            lineUserId,
            "คุณยังไม่ได้ลงทะเบียน กรุณาลงทะเบียนก่อนเริ่มใช้งานนะคะ"
          ).catch((err) =>
            console.error("[webhook] replyRegistrationPrompt(greeting) error:", err)
          );
        } else {
          await replyText(replyToken, autoReplies.greeting, lineUserId).catch((err) =>
            console.error("[webhook] replyText(greeting) error:", err)
          );
        }
      }
      return;
    }

    // 2. ปุ่ม "ลงทะเบียน" (ถ้าลงทะเบียนไปแล้ว ให้แสดงเป็นชุดข้อความ "แก้ไขข้อมูล" แทน)
    if (text === "ลงทะเบียน") {
      if (replyToken) {
        await replyRegistrationPrompt(replyToken, lineUserId, "", isRegistered).catch((err) => {
          console.error("[webhook] replyRegistrationPrompt error:", err);
        });
      }
      return;
    }

    // 3. ปุ่ม "วิธีใช้งาน"
    if (text === "วิธีใช้งาน" || text.includes("ช่วย") || text.includes("help")) {
      if (replyToken) {
        await replyHowToPrompt(replyToken, lineUserId).catch((err) =>
          console.error("[webhook] replyHowToPrompt error:", err)
        );
      }
      return;
    }

    // 4. ปุ่ม "ติดต่อสอบถาม"
    if (text === "ติดต่อสอบถาม") {
      if (replyToken) {
        await replyText(replyToken, autoReplies.contact, lineUserId).catch((err) =>
          console.error("[webhook] replyText(contact) error:", err)
        );
      }
      return;
    }

    // 5. ปุ่ม "เลือกภาพเพื่อวิเคราะห์"
    if (text === "เลือกภาพเพื่อวิเคราะห์" || text === "ส่งรูปวิเคราะห์") {
      if (replyToken) {
        if (!isRegistered) {
          await replyRegistrationPrompt(
            replyToken,
            lineUserId,
            "คุณกดเลือกภาพเพื่อวิเคราะห์ แต่ยังไม่ได้ลงทะเบียน ระบบต้องให้คุณลงทะเบียนก่อนจึงจะบันทึกและวิเคราะห์ผลให้ได้ค่ะ"
          ).catch((err) =>
            console.error("[webhook] replyRegistrationPrompt(send-photo) error:", err)
          );
        } else {
          await replyTextWithQuickReply(
            replyToken,
            autoReplies.sendPhotoReady,
            lineUserId,
            [
              {
                type: "action",
                action: {
                  type: "cameraRoll",
                  label: "📸 เปิดแกลเลอรีเลือกรูป",
                },
              },
            ]
          ).catch((err) =>
            console.error("[webhook] replyText(send-photo) error:", err)
          );
        }
      }
      return;
    }

    // 6. ปุ่ม "ผลลัพธ์ล่าสุด"
    if (text === "ผลลัพธ์ล่าสุด") {
      if (replyToken) {
        if (!isRegistered) {
          await replyRegistrationPrompt(
            replyToken,
            lineUserId,
            "คุณกดดูผลลัพธ์ล่าสุด แต่ระบบยังไม่มีข้อมูลของคุณ เนื่องจากยังไม่ได้ลงทะเบียน กรุณาลงทะเบียนก่อนนะคะ"
          ).catch((err) =>
            console.error("[webhook] replyRegistrationPrompt(latest) error:", err)
          );
        } else {
          const lastRequest = await Request.findOne({
            lineUserId,
            status: REQUEST_STATUS.SENT,
            $or: [
              { resultImageIds: { $exists: true, $not: { $size: 0 } } },
              { resultImageId: { $exists: true } },
            ],
          }).sort({ completedAt: -1, createdAt: -1 });

          const ids =
            Array.isArray(lastRequest?.resultImageIds) && lastRequest.resultImageIds.length
              ? lastRequest.resultImageIds
              : lastRequest?.resultImageId
                ? [lastRequest.resultImageId]
                : [];

          if (ids.length) {
            const imageUrls = ids.map((id) => `${process.env.PUBLIC_BASE_URL}/results/${id}.png`);
            const combinedUrl = lastRequest.combinedResultImageId
              ? `${process.env.PUBLIC_BASE_URL}/results/${lastRequest.combinedResultImageId}.png`
              : null;
            if (imageUrls.length > 1) {
              await sendWeeklyReportImages(lineUserId, imageUrls, lastRequest.aiResult, combinedUrl).catch((err) =>
                console.error("[webhook] sendWeeklyReportImages(latest) error:", err)
              );
            } else {
              await sendResultCardWithShare(lineUserId, imageUrls[0], replyToken).catch((err) =>
                console.error("[webhook] sendResultCardWithShare(latest) error:", err)
              );
            }
          } else {
            await replyText(replyToken, autoReplies.noResult, lineUserId).catch((err) =>
              console.error("[webhook] replyText(no-result) error:", err)
            );
          }
        }
      }
      return;
    }
  }

  // หากผู้ใช้ยังไม่ได้ลงทะเบียน -> ส่ง Flex Message ชวนลงทะเบียนทันที (ข้อความ/รูปอื่นๆ ที่ไม่ใช่ปุ่มเมนู)
  // (ข้ามเงื่อนไขนี้ทั้งหมดหากแอดมินเปิดโหมด "no_registration")
  if (!isRegistered) {
    if (replyToken) {
      await replyRegistrationPrompt(
        replyToken,
        lineUserId,
        "คุณยังไม่ได้ลงทะเบียน กรุณาลงทะเบียนก่อนเริ่มใช้งานนะคะ"
      ).catch((err) => {
        console.error("[webhook] replyRegistrationPrompt error:", err);
      });
    }
    return;
  }

  // ข้อความรูปภาพ -> ส่งเข้า pipeline วิเคราะห์
  if (event.type === "message") {
    const msgType = event.message.type;
    const fileName = (event.message.fileName || "").toLowerCase();
    const isImageFile =
      msgType === "image" ||
      (msgType === "file" &&
        (fileName.endsWith(".jpg") ||
          fileName.endsWith(".jpeg") ||
          fileName.endsWith(".png") ||
          fileName.endsWith(".webp")));

    if (isImageFile) {
      const messageId = event.message.id;
      const sess = getChatMode(lineUserId);
      if (sess) {
        await handleChatModeImage(lineUserId, messageId, replyToken, sess);
      } else {
        await queueWeeklyImage({ lineUserId, messageId, replyToken });
      }
    } else if (msgType === "text" && replyToken) {
      // auto-draft — buffer ข้อความให้บอทเตรียมคำตอบไว้ในหน้า testchatbot (ไม่ส่งเข้า LINE)
      addIncomingText(lineUserId, text).catch((err) =>
        console.error("[webhook] chatDraft error:", err)
      );
      await replyText(replyToken, autoReplies.textFallback, lineUserId).catch((err) =>
        console.error("[webhook] replyText(fallback) error:", err)
      );
    }
  }
}

export default router;
