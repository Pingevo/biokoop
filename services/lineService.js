import { messagingApi, middleware } from "@line/bot-sdk";
import { getBotMessagesConfig } from "./botMessagesConfigService.js";
import { logLineMessage } from "../models/LineMessageLog.js";

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

export const lineMiddleware = middleware(config);

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});
const blobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.channelAccessToken,
});

// ดึงไฟล์รูปจริงจาก LINE ด้วย messageId -> คืนค่าเป็น Buffer
export async function getImageContent(messageId) {
  const res = await blobClient.getMessageContent(messageId);

  // 1. ถ้ารีเทิร์นมาเป็น ArrayBuffer หรือมีเมธอด arrayBuffer()
  if (res instanceof ArrayBuffer) {
    return Buffer.from(res);
  }
  if (typeof res?.arrayBuffer === "function") {
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  // 2. ถ้าเป็น Stream (Node Stream / Web Stream)
  const chunks = [];
  for await (const chunk of res) {
    if (typeof chunk === "number") {
      // กรณี stream ปล่อย byte ทีละตัว
      chunks.push(Buffer.from([chunk]));
    } else if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    } else {
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks);
}

// แสดงอนิเมชันกำลังประมวลผล (Loading Animation) บนหน้าจอแชท LINEของผู้ใช้
export async function showLoadingAnimation(chatId, loadingSeconds = 20) {
  try {
    await client.showLoadingAnimation({
      chatId,
      loadingSeconds,
    });
  } catch (err) {
    console.warn("[lineService] showLoadingAnimation warning:", err.message);
  }
}

// ดึงโปรไฟล์ผู้ใช้ (ชื่อ, รูป) สำหรับเก็บใน users collection
export async function getProfile(lineUserId) {
  try {
    const profile = await client.getProfile(lineUserId);
    return { displayName: profile.displayName, pictureUrl: profile.pictureUrl };
  } catch {
    return {};
  }
}

// ตอบกลับด้วย text แบบเร็ว (ใช้ replyToken ได้ครั้งเดียว, มีอายุสั้น)
export async function replyText(replyToken, text, lineUserId) {
  try {
    const res = await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text }],
    });
    if (lineUserId) {
      logLineMessage({ lineUserId, sendType: "reply", messageType: "text", content: text, status: "success" });
    }
    return res;
  } catch (err) {
    if (lineUserId) {
      logLineMessage({ lineUserId, sendType: "reply", messageType: "text", content: text, status: "failed", errorDetail: err.message });
    }
    throw err;
  }
}

// ตอบกลับด้วยรูปภาพผ่าน replyToken
export async function replyImage(replyToken, imageUrl, lineUserId) {
  try {
    const res = await client.replyMessage({
      replyToken,
      messages: [
        {
          type: "image",
          originalContentUrl: imageUrl,
          previewImageUrl: imageUrl,
        },
      ],
    });
    if (lineUserId) {
      logLineMessage({ lineUserId, sendType: "reply", messageType: "image", content: imageUrl, status: "success" });
    }
    return res;
  } catch (err) {
    if (lineUserId) {
      logLineMessage({ lineUserId, sendType: "reply", messageType: "image", content: imageUrl, status: "failed", errorDetail: err.message });
    }
    throw err;
  }
}

// ส่งรูปภาพผ่าน Push API (ใช้เมื่อ replyToken หมดอายุแล้ว)
export async function pushImage(lineUserId, imageUrl) {
  try {
    const res = await client.pushMessage({
      to: lineUserId,
      messages: [
        {
          type: "image",
          originalContentUrl: imageUrl,
          previewImageUrl: imageUrl,
        },
      ],
    });
    logLineMessage({ lineUserId, sendType: "push", messageType: "image", content: imageUrl, status: "success" });
    return res;
  } catch (err) {
    logLineMessage({ lineUserId, sendType: "push", messageType: "image", content: imageUrl, status: "failed", errorDetail: err.message });
    throw err;
  }
}

export async function pushText(lineUserId, text) {
  try {
    const res = await client.pushMessage({
      to: lineUserId,
      messages: [{ type: "text", text }],
    });
    logLineMessage({ lineUserId, sendType: "push", messageType: "text", content: text, status: "success" });
    return res;
  } catch (err) {
    logLineMessage({ lineUserId, sendType: "push", messageType: "text", content: text, status: "failed", errorDetail: err.message });
    throw err;
  }
}

// ส่ง Flex Message หรือข้อความแนะนำการใช้งาน / ความช่วยเหลือ
export async function replyHelpPrompt(replyToken, lineUserId) {
  const flexMessage = {
    type: "flex",
    altText: "คำแนะนำการใช้งานระบบ biokoop",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FFFFFF",
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: "biokoop 🔴⚪⚫",
            weight: "bold",
            color: "#DC2626",
            size: "sm",
          },
          {
            type: "text",
            text: "💡 วิธีการใช้งานระบบ",
            weight: "bold",
            color: "#111111",
            size: "xl",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FFFFFF",
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: "ยินดีต้อนรับสู่บริการวิเคราะห์ผลตรวจ biokoop ค่ะ คุณสามารถใช้งานง่ายๆ ตามขั้นตอนดังนี้:",
            wrap: true,
            color: "#374151",
            size: "sm",
            margin: "md",
          },
          {
            type: "text",
            text: "1️⃣ ลงทะเบียนข้อมูลผู้ใช้งานผ่านลิงก์ลงทะเบียน\n2️⃣ แตะเมนู \"เลือกภาพเพื่อวิเคราะห์\" เพื่อเลือกรูปภาพผลการตรวจจากแกลเลอรี\n3️⃣ รอรับการ์ดสรุปผลการวิเคราะห์อัตโนมัติภายในไม่กี่วินาที!",
            wrap: true,
            color: "#6B7280",
            size: "sm",
            margin: "md",
          },
        ],
      },
    },
  };

  try {
    const res = await client.replyMessage({
      replyToken,
      messages: [flexMessage],
    });
    if (lineUserId) {
      logLineMessage({ lineUserId, sendType: "reply", messageType: "flex", content: "คำแนะนำการใช้งานระบบ biokoop", status: "success" });
    }
    return res;
  } catch (err) {
    if (lineUserId) {
      logLineMessage({ lineUserId, sendType: "reply", messageType: "flex", content: "คำแนะนำการใช้งานระบบ biokoop", status: "failed", errorDetail: err.message });
    }
    throw err;
  }
}

// ส่ง Flex Message ชวนผู้ใช้กดลงทะเบียนข้อมูล
// reasonText (optional): อธิบายเหตุผลเฉพาะจุดที่ผู้ใช้โดนเด้งมาลงทะเบียน เช่น กดดูผลลัพธ์แต่ยังไม่มีข้อมูลเพราะยังไม่ลงทะเบียน
// isAlreadyRegistered (optional): true ถ้าคนนี้ลงทะเบียนไปแล้ว -> เปลี่ยนข้อความ/ปุ่มเป็นชุด "แก้ไขข้อมูล" แทน
export async function replyRegistrationPrompt(replyToken, lineUserId, reasonText = "", isAlreadyRegistered = false) {
  const registerUrl = `${process.env.PUBLIC_BASE_URL}/register?userId=${lineUserId}`;
  const cfg = getBotMessagesConfig().registrationPrompt;

  const title = isAlreadyRegistered ? cfg.editTitle : cfg.title;
  const bodyText = isAlreadyRegistered ? cfg.editBodyText : cfg.bodyText;
  const buttonLabel = isAlreadyRegistered ? cfg.editButtonLabel : cfg.buttonLabel;

  const bodyContents = [];
  if (reasonText) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#FEF2F2",
      cornerRadius: "8px",
      paddingAll: "sm",
      margin: "none",
      contents: [
        {
          type: "text",
          text: `⚠️ ${reasonText}`,
          wrap: true,
          color: "#B91C1C",
          size: "xs",
          weight: "bold",
        },
      ],
    });
  }
  bodyContents.push({
    type: "text",
    text: bodyText,
    wrap: true,
    color: cfg.bodyTextColor,
    size: "sm",
    margin: reasonText ? "md" : "none",
  });

  const flexMessage = {
    type: "flex",
    altText: isAlreadyRegistered ? "แก้ไขข้อมูลผู้ใช้งาน biokoop" : "กรุณาลงทะเบียนก่อนส่งรูปภาพวิเคราะห์ค่ะ",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: cfg.bgColor,
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: cfg.brandLabel,
            weight: "bold",
            color: cfg.brandColor,
            size: "sm",
          },
          {
            type: "text",
            text: title,
            weight: "bold",
            color: cfg.titleColor,
            size: "xl",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: cfg.bgColor,
        paddingAll: "lg",
        contents: bodyContents,
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: cfg.bgColor,
        paddingAll: "lg",
        contents: [
          {
            type: "button",
            action: {
              type: "uri",
              label: buttonLabel,
              uri: registerUrl,
            },
            style: "primary",
            color: cfg.buttonColor,
            height: "sm",
          },
        ],
      },
    },
  };

  const baseLabel = isAlreadyRegistered ? "Flex แก้ไขข้อมูล" : "Flex Message ชวนลงทะเบียน";
  const summaryContent = reasonText ? `${baseLabel} (${reasonText})` : baseLabel;
  try {
    const res = await client.replyMessage({
      replyToken,
      messages: [flexMessage],
    });
    logLineMessage({ lineUserId, sendType: "reply", messageType: "flex", content: summaryContent, status: "success" });
    return res;
  } catch (err) {
    logLineMessage({ lineUserId, sendType: "reply", messageType: "flex", content: summaryContent, status: "failed", errorDetail: err.message });
    throw err;
  }
}



