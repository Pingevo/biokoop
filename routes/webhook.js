import { Router } from "express";
import {
  lineMiddleware,
  replyRegistrationPrompt,
  replyText,
  replyImage,
  getProfile,
} from "../services/lineService.js";
import { processImageMessage } from "../services/pipeline.js";
import { getBotMessagesConfig } from "../services/botMessagesConfigService.js";
import { User } from "../models/User.js";
import { Request, REQUEST_STATUS } from "../models/Request.js";

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

async function handleEvent(event) {
  if (event.type !== "message" && event.type !== "follow") return;

  const lineUserId = event.source?.userId;
  if (!lineUserId) return;

  const replyToken = event.replyToken;

  // ค้นหา หรือสร้างโปรไฟล์ผู้ใช้เบื้องต้น
  let user = await User.findOne({ lineUserId });
  if (!user) {
    const profile = await getProfile(lineUserId).catch(() => ({}));
    user = await User.touch(lineUserId, profile);
  }

  const isTextMessage = event.type === "message" && event.message.type === "text";
  const text = isTextMessage ? event.message.text.trim() : "";
  const autoReplies = getBotMessagesConfig().autoReplies;

  // ── คำสั่งจากปุ่ม Rich Menu & คำทักทายทั่วไป ──
  if (isTextMessage) {
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
        await replyText(replyToken, autoReplies.howTo, lineUserId).catch((err) =>
          console.error("[webhook] replyText(howto) error:", err)
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
          await replyText(replyToken, autoReplies.sendPhotoReady, lineUserId).catch((err) =>
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
            await replyImage(replyToken, imageUrl, lineUserId).catch((err) =>
              console.error("[webhook] replyImage(latest) error:", err)
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
