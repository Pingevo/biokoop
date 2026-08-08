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
  getProfile,
} from "../services/lineService.js";
import { processImageMessage } from "../services/pipeline.js";
import { getBotMessagesConfig } from "../services/botMessagesConfigService.js";
import { User } from "../models/User.js";
import { Request, REQUEST_STATUS } from "../models/Request.js";
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

async function handleEvent(event) {
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

  // ── FOLLOW EVENT (แอดเพื่อนใหม่ / เลิกติดตามแล้วแอดใหม่) ──
  if (event.type === "follow") {
    if (replyToken) {
      await replyWelcomePrompt(replyToken, lineUserId, user.isRegistered).catch((err) => {
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

    // 1. คำทักทายทั่วไป (สวัสดี, หวัดดี, hi, hello)
    if (/^(สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hi|hello|hey)/i.test(text)) {
      if (replyToken) {
        if (!user.isRegistered) {
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
        await replyRegistrationPrompt(replyToken, lineUserId, "", user.isRegistered).catch((err) => {
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
        if (!user.isRegistered) {
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
        if (!user.isRegistered) {
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
            resultImageId: { $exists: true },
          }).sort({ completedAt: -1, createdAt: -1 });

          if (lastRequest?.resultImageId) {
            const imageUrl = `${process.env.PUBLIC_BASE_URL}/results/${lastRequest.resultImageId}.png`;
            await sendResultCardWithShare(lineUserId, imageUrl, replyToken).catch((err) =>
              console.error("[webhook] sendResultCardWithShare(latest) error:", err)
            );
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
  if (!user.isRegistered) {
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
      await processImageMessage({ lineUserId, messageId, replyToken });
    } else if (msgType === "text" && replyToken) {
      await replyText(replyToken, autoReplies.textFallback, lineUserId).catch((err) =>
        console.error("[webhook] replyText(fallback) error:", err)
      );
    }
  }
}

export default router;
