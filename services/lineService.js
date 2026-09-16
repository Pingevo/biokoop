import { messagingApi, middleware } from "@line/bot-sdk";
import { getBotMessagesConfig } from "./botMessagesConfigService.js";
import { getCardConfig } from "./cardConfigService.js";
import { logLineMessage } from "../models/LineMessageLog.js";

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET || "dummy_secret",
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "dummy_token",
};

export const lineMiddleware = middleware(config);

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});
const blobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.channelAccessToken,
});

// สร้าง badge "🩺 AI HEALTH ASSISTANT" แบบชิปมุมโค้ง ใช้ร่วมกันในหัวการ์ด Flex Message ทุกใบ เพื่อให้หน้าตาสม่ำเสมอทั้งระบบ
function buildBrandBadge(cfg) {
  return {
    type: "box",
    layout: "horizontal",
    justifyContent: "flex-start",
    contents: [
      {
        type: "box",
        layout: "baseline",
        backgroundColor: "#FEF2F2",
        cornerRadius: "20px",
        paddingAll: "6px",
        paddingStart: "12px",
        paddingEnd: "12px",
        contents: [
          { type: "text", text: "🩺", size: "xs", flex: 0 },
          {
            type: "text",
            text: (cfg.brandLabel || "AI HEALTH ASSISTANT").toUpperCase(),
            size: "xs",
            weight: "bold",
            color: cfg.brandColor,
            margin: "xs",
            flex: 0,
          },
        ],
      },
    ],
  };
}

// Helper สำหรับลองส่งซ้ำอัตโนมัติหากเกิดปัญหาสัญญาณอินเทอร์เน็ต/DNS ชั่วคราว (Network Flake / ENOTFOUND / fetch failed)
async function withRetry(fn, retries = 2, delayMs = 600) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isNetworkErr =
        err.code === "ENOTFOUND" ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.message?.includes("fetch failed");

      if (i < retries && isNetworkErr) {
        console.warn(`[lineService] ⚠️ สัญญาณอินเทอร์เน็ต/DNS ขัดข้องชั่วคราว (${err.message}) กำลังลองส่งซ้ำครั้งที่ ${i + 1}/${retries} ใน ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

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

export async function replyTextWithQuickReply(replyToken, text, lineUserId, quickReplyItems = []) {
  try {
    const msg = { type: "text", text };
    if (quickReplyItems.length > 0) {
      msg.quickReply = { items: quickReplyItems };
    }
    const res = await client.replyMessage({
      replyToken,
      messages: [msg],
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

export async function pushFlex(lineUserId, flexMessage) {
  try {
    const res = await withRetry(() =>
      client.pushMessage({
        to: lineUserId,
        messages: [flexMessage],
      })
    );
    logLineMessage({
      lineUserId,
      sendType: "push",
      messageType: "flex",
      content: flexMessage.altText || "Flex Message สรุปสุขภาพ",
      status: "success",
    });
    return res;
  } catch (err) {
    logLineMessage({
      lineUserId,
      sendType: "push",
      messageType: "flex",
      content: flexMessage.altText || "Flex Message สรุปสุขภาพ",
      status: "failed",
      errorDetail: err.message,
    });
    throw err;
  }
}

// ส่ง Flex Message สรุปสุขภาพและบทวิเคราะห์ร่างกายจาก AI
export async function pushHealthAdviceFlex(lineUserId, resultData = {}) {
  const score = typeof resultData.score === "number" && resultData.score > 0 ? resultData.score : 80;
  const grade = resultData.grade || "B";
  const headline = resultData.headline || "ผลสรุปการวิเคราะห์สุขภาพ";
  const summaryText = resultData.aiSummary || resultData.healthAdvice || "ระบบวิเคราะห์เรียบร้อยแล้วค่ะ";
  const tips = resultData.tips || "";

  const cardColors = getCardConfig().colors || {};
  const deepColor = cardColors.deepSleepBg || "#3730A3";
  const lightColor = cardColors.lightSleepBg || "#3B82F6";
  const remColor = cardColors.remBg || "#0EA5E9";
  const accentColor = cardColors.greenAccent || "#DC2626";

  let badgeBg = "#16A34A";
  if (score < 60) badgeBg = "#DC2626";
  else if (score < 75) badgeBg = "#CA8A04";

  const bodyContents = [
    // แถวหัว: คะแนน + หัวข้อสรุป
    {
      type: "box",
      layout: "horizontal",
      alignItems: "center",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: badgeBg,
          cornerRadius: "12px",
          paddingAll: "sm",
          width: "70px",
          justifyContent: "center",
          alignItems: "center",
          contents: [
            {
              type: "text",
              text: `${score}`,
              weight: "bold",
              color: "#FFFFFF",
              size: "xl",
              align: "center",
            },
            {
              type: "text",
              text: `เกรด ${grade}`,
              color: "#FFFFFF",
              size: "xxs",
              align: "center",
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          contents: [
            {
              type: "text",
              text: headline,
              weight: "bold",
              size: "md",
              color: "#111111",
              wrap: true,
            },
            {
              type: "text",
              text: "biokoop Health Report",
              size: "xs",
              color: "#6B7280",
              margin: "xs",
            },
          ],
        },
      ],
    },
  ];

  // แถวสถิติย่อย: เวลานอน / นอนหลับจริง / ประสิทธิภาพ / RECOVERY / หัวใจ (แสดงเฉพาะค่าที่มีข้อมูลจริง)
  const soundVal = resultData.soundSleepTime || resultData.soundSleep;
  const quickStats = [
    { icon: "🛌", label: "เวลานอนรวม", value: resultData.sleepTime },
    { icon: "✨", label: "นอนหลับจริง", value: soundVal },
    { icon: "⚡", label: "ประสิทธิภาพ", value: resultData.sleepEfficiency },
    { icon: "🔋", label: "RECOVERY", value: resultData.recoveryPercent != null ? `${resultData.recoveryPercent}%` : null },
    { icon: "❤️", label: "หัวใจเฉลี่ย", value: resultData.avgHeartRate },
  ].filter((s) => s.value && s.value !== "ไม่มีข้อมูล" && s.value !== "-");

  if (quickStats.length > 0) {
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      margin: "lg",
      backgroundColor: "#F8FAFC",
      cornerRadius: "10px",
      paddingAll: "md",
      contents: quickStats.map((s) => ({
        type: "box",
        layout: "vertical",
        flex: 1,
        alignItems: "center",
        contents: [
          { type: "text", text: `${s.icon} ${s.label}`, size: "xxs", color: "#6B7280", align: "center" },
          { type: "text", text: s.value, size: "sm", weight: "bold", color: "#111111", align: "center", margin: "xs", wrap: true },
        ],
      })),
    });
  }

  // แถบสัดส่วนการนอน (Deep / Light / REM)
  const deepPct = Number(resultData.deepSleepPercent) || 0;
  const lightPct = Number(resultData.lightSleepPercent) || 0;
  const remPct = Number(resultData.remSleepPercent) || 0;
  const compositionTotal = deepPct + lightPct + remPct;

  if (compositionTotal > 0) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      margin: "lg",
      contents: [
        {
          type: "text",
          text: "🌙 สัดส่วนการนอน",
          size: "xs",
          weight: "bold",
          color: "#374151",
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          height: "8px",
          cornerRadius: "4px",
          contents: [
            { type: "box", layout: "vertical", backgroundColor: deepColor, width: `${deepPct}%`, contents: [] },
            { type: "box", layout: "vertical", backgroundColor: lightColor, width: `${lightPct}%`, contents: [] },
            { type: "box", layout: "vertical", backgroundColor: remColor, width: `${remPct}%`, contents: [] },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "xs",
          contents: [
            { type: "text", text: `● หลับลึก ${deepPct}%`, size: "xxs", color: deepColor, flex: 1 },
            { type: "text", text: `● หลับตื้น ${lightPct}%`, size: "xxs", color: lightColor, flex: 1, align: "center" },
            { type: "text", text: `● REM ${remPct}%`, size: "xxs", color: remColor, flex: 1, align: "end" },
          ],
        },
      ],
    });
  }

  bodyContents.push(
    { type: "separator", margin: "lg", color: "#F3F4F6" },
    {
      type: "box",
      layout: "vertical",
      margin: "lg",
      contents: [
        {
          type: "text",
          text: "📋 สรุปภาพรวม",
          weight: "bold",
          size: "xs",
          color: accentColor,
        },
        {
          type: "text",
          text: summaryText,
          wrap: true,
          size: "sm",
          color: "#374151",
          margin: "sm",
        },
      ],
    }
  );

  if (tips) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      backgroundColor: "#FEF2F2",
      cornerRadius: "8px",
      paddingAll: "md",
      contents: [
        {
          type: "text",
          text: `💡 คำแนะนำวันนี้:\n${tips}`,
          wrap: true,
          size: "xs",
          color: "#991B1B",
        },
      ],
    });
  }

  const flexMessage = {
    type: "flex",
    altText: `🩺 ผลสรุปร่างกาย: ${headline} (คะแนน ${score})`,
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
            color: accentColor,
            size: "xs",
          },
          {
            type: "text",
            text: "🩺 รายงานสรุปสุขภาพร่างกาย",
            weight: "bold",
            color: "#111111",
            size: "lg",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FFFFFF",
        paddingAll: "lg",
        contents: bodyContents,
      },
    },
  };

  try {
    return await pushFlex(lineUserId, flexMessage);
  } catch (err) {
    console.warn("[lineService] pushHealthAdviceFlex warning, falling back to pushText:", err.message);
    return await pushText(lineUserId, resultData.healthAdvice || summaryText);
  }
}

// ส่งภาพการ์ดผลลัพธ์ (Image Message) 1 ข้อความ พร้อม Quick Reply สำหรับกดแชร์/เลือกรูป (ประหยัดโควต้าข้อความ 100%)
export async function sendResultCardWithShare(lineUserId, imageUrl, replyToken = null) {
  const shareText = encodeURIComponent(
    `ดูผลวิเคราะห์สุขภาพ biokoop ของฉัน 🔴⚪⚫\n${imageUrl}`
  );
  const shareUrl = `https://line.me/R/msg/text/?${shareText}`;

  const imageMsg = {
    type: "image",
    originalContentUrl: imageUrl,
    previewImageUrl: imageUrl,
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "uri",
            label: "📲 แชร์ให้เพื่อน",
            uri: shareUrl,
          },
        },
        {
          type: "action",
          action: {
            type: "cameraRoll",
            label: "📸 เลือกภาพวิเคราะห์",
          },
        },
        {
          type: "action",
          action: {
            type: "message",
            label: "📊 ผลลัพธ์ล่าสุด",
            text: "ผลลัพธ์ล่าสุด",
          },
        },
      ],
    },
  };

  if (replyToken) {
    try {
      const res = await withRetry(() =>
        client.replyMessage({
          replyToken,
          messages: [imageMsg],
        })
      );
      logLineMessage({
        lineUserId,
        sendType: "reply",
        messageType: "image",
        content: imageUrl,
        status: "success",
      });
      return res;
    } catch (err) {
      console.warn("[lineService] replyMessage image failed, falling back to push:", err.message);
    }
  }

  try {
    const res = await withRetry(() =>
      client.pushMessage({
        to: lineUserId,
        messages: [imageMsg],
      })
    );
    logLineMessage({
      lineUserId,
      sendType: "push",
      messageType: "image",
      content: imageUrl,
      status: "success",
    });
    return res;
  } catch (err) {
    logLineMessage({
      lineUserId,
      sendType: "push",
      messageType: "image",
      content: imageUrl,
      status: "failed",
      errorDetail: err.message,
    });
    throw err;
  }
}

// สร้าง Flex Message Carousel สำหรับเลื่อนปัดดูรายงานสุขภาพ 3 หน้าในแนวนอน (พร้อมการ์ดภาพรวม 3-in-1 แผ่นเดียว)
export function buildWeeklyReportCarouselFlex(imageUrls = [], aiData = null, combinedImageUrl = null) {
  const pageMeta = [
    {
      title: "หน้าที่ 1 • ภาพรวมสุขภาพ",
      subTitle: "Overview & Health Trend",
      badgeColor: "#3B82F6",
      summary: aiData?.overview?.summary || "ภาพรวมภาระร่างกาย การฟื้นตัว และการนอนหลับสัปดาห์นี้",
    },
    {
      title: "หน้าที่ 2 • กิจกรรม & การฟื้นตัว",
      subTitle: "Activity & Recovery",
      badgeColor: "#16A34A",
      summary: aiData?.activity?.aiInsight || "การออกกำลังกาย โซนหัวใจ และสมดุลการฟื้นฟูของร่างกาย",
    },
    {
      title: "หน้าที่ 3 • คุณภาพการนอนหลับ",
      subTitle: "Sleep Analytics",
      badgeColor: "#8B5CF6",
      summary: aiData?.sleep?.aiInsight || "ประสิทธิภาพการนอนหลับ และสัดส่วนระยะหลับลึก-ตื่น",
    },
  ];

  const bubbles = [];

  // การ์ดที่ 1: ภาพรวม 3-in-1 แผ่นเดียว (ถ้ามี)
  if (combinedImageUrl) {
    const shareCombinedText = encodeURIComponent(
      `ดูรายงานสุขภาพ biokoop ภาพรวม 3-in-1 แผ่นเดียว 🔴⚪⚫\n${combinedImageUrl}`
    );
    const shareCombinedUrl = `https://line.me/R/msg/text/?${shareCombinedText}`;

    bubbles.push({
      type: "bubble",
      size: "giga",
      hero: {
        type: "image",
        url: combinedImageUrl,
        size: "full",
        aspectRatio: "3076:1798",
        aspectMode: "fit",
        backgroundColor: "#FFFFFF",
        action: {
          type: "uri",
          label: "ดูรูปเต็ม",
          uri: combinedImageUrl,
        },
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        paddingTop: "12px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "🖼️ ภาพรวม 3-in-1 แผ่นเดียว",
                weight: "bold",
                size: "sm",
                color: "#0F172A",
                flex: 1,
              },
              {
                type: "text",
                text: "Panoramic",
                weight: "bold",
                size: "xs",
                color: "#16A34A",
                align: "end",
              },
            ],
          },
          {
            type: "text",
            text: "ครบทั้งภาพรวม กิจกรรม และการนอนในรูปเดียว",
            size: "xxs",
            color: "#64748B",
            weight: "bold",
            margin: "xs",
          },
          {
            type: "text",
            text: "เหมาะสำหรับบันทึกลงอัลบั้มมือถือ หรือแชร์ต่อให้เพื่อนในแผ่นเดียวค่ะ",
            size: "xs",
            color: "#475569",
            wrap: true,
            maxLines: 2,
            margin: "sm",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        paddingAll: "14px",
        paddingTop: "0px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#0F172A",
            height: "sm",
            action: {
              type: "uri",
              label: "🔍 ดูภาพรวมแผ่นเดียว",
              uri: combinedImageUrl,
            },
            flex: 2,
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "uri",
              label: "📲 แชร์",
              uri: shareCombinedUrl,
            },
            flex: 1,
          },
        ],
      },
    });
  }

  // การ์ดหน้าที่ 1, 2, 3
  imageUrls.slice(0, 3).forEach((url, idx) => {
    const meta = pageMeta[idx] || {
      title: `หน้าที่ ${idx + 1}`,
      subTitle: "Health Report",
      badgeColor: "#3B82F6",
      summary: "",
    };

    const shareText = encodeURIComponent(
      `ดูรายงานสุขภาพ biokoop (${meta.title}) 🔴⚪⚫\n${url}`
    );
    const shareUrl = `https://line.me/R/msg/text/?${shareText}`;

    bubbles.push({
      type: "bubble",
      size: "giga",
      hero: {
        type: "image",
        url: url,
        size: "full",
        aspectRatio: "1024:1450",
        aspectMode: "fit",
        backgroundColor: "#FFFFFF",
        action: {
          type: "uri",
          label: "ดูรูปเต็ม",
          uri: url,
        },
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        paddingTop: "12px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: meta.title,
                weight: "bold",
                size: "sm",
                color: "#0F172A",
                flex: 1,
              },
              {
                type: "text",
                text: `${idx + 1}/3`,
                weight: "bold",
                size: "xs",
                color: "#94A3B8",
                align: "end",
              },
            ],
          },
          {
            type: "text",
            text: meta.subTitle,
            size: "xxs",
            color: meta.badgeColor,
            weight: "bold",
            margin: "xs",
          },
          ...(meta.summary
            ? [
                {
                  type: "text",
                  text: meta.summary,
                  size: "xs",
                  color: "#475569",
                  wrap: true,
                  maxLines: 2,
                  margin: "sm",
                },
              ]
            : []),
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        paddingAll: "14px",
        paddingTop: "0px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: meta.badgeColor,
            height: "sm",
            action: {
              type: "uri",
              label: "🔍 ดูรูปเต็ม",
              uri: url,
            },
            flex: 2,
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "uri",
              label: "📲 แชร์",
              uri: shareUrl,
            },
            flex: 1,
          },
        ],
      },
    });
  });

  return {
    type: "flex",
    altText: "📊 รายงานเทรนด์สุขภาพรายสัปดาห์ (เลื่อนปัดซ้าย-ขวาเพื่อดูรายงาน)",
    contents: {
      type: "carousel",
      contents: bubbles,
    },
  };
}

// ส่งรายงานสุขภาพรายสัปดาห์ (รองรับทั้ง Flex Carousel, ภาพรวม 3-in-1 และรูปเดี่ยว 3 หน้า) พร้อมข้อความสรุปและ Quick Reply
export async function sendWeeklyReportImages(lineUserId, imageUrls, aiData = null, combinedImageUrl = null) {
  const displayMode = (process.env.WEEKLY_REPORT_DISPLAY_MODE || "both").toLowerCase();
  const shareTarget = combinedImageUrl || imageUrls[0] || "";
  const shareText = encodeURIComponent(
    `ดูรายงานสุขภาพรายสัปดาห์ biokoop ของฉัน 🔴⚪⚫\n${shareTarget}`
  );
  const shareUrl = `https://line.me/R/msg/text/?${shareText}`;

  const ov = aiData?.overview || {};
  const metricLine = [
    ov.bodyLoad != null ? `Body Load ${ov.bodyLoad}` : null,
    ov.recoveryPercent != null ? `Recovery ${Math.round(ov.recoveryPercent)}%` : null,
    ov.sleepQualityPercent != null ? `Sleep ${Math.round(ov.sleepQualityPercent)}%` : null,
  ].filter(Boolean).join(" • ");

  const summaryMsg = {
    type: "text",
    text:
      `📊 รายงานเทรนด์สุขภาพรายสัปดาห์ของคุณพร้อมแล้วค่ะ\n` +
      (metricLine ? `${metricLine}\n\n` : "\n") +
      `${ov.summary ? ov.summary : "เลื่อนดูสไลด์รายงาน หรือบันทึกภาพแผ่นเดียวด้านบนได้เลยค่ะ"}\n\n` +
      `🖼️ แผ่นที่ 1 ภาพรวม 3-in-1 • หรือดูแยก 3 หน้าด้านล่างได้นะคะ`,
    quickReply: {
      items: [
        {
          type: "action",
          action: { type: "uri", label: "📲 แชร์ให้เพื่อน", uri: shareUrl },
        },
        {
          type: "action",
          action: { type: "cameraRoll", label: "📸 วิเคราะห์สัปดาห์ใหม่" },
        },
        {
          type: "action",
          action: { type: "message", label: "📊 ผลลัพธ์ล่าสุด", text: "ผลลัพธ์ล่าสุด" },
        },
      ],
    },
  };

  const carouselFlex = buildWeeklyReportCarouselFlex(imageUrls, aiData, combinedImageUrl);
  const combinedImageMsg = combinedImageUrl
    ? {
        type: "image",
        originalContentUrl: combinedImageUrl,
        previewImageUrl: combinedImageUrl,
      }
    : null;

  const imageMessages = imageUrls.slice(0, 3).map((u) => ({
    type: "image",
    originalContentUrl: u,
    previewImageUrl: u,
  }));

  let allMessages = [];
  if (displayMode === "carousel") {
    allMessages = [carouselFlex, summaryMsg];
  } else if (displayMode === "images") {
    allMessages = [...(combinedImageMsg ? [combinedImageMsg] : []), ...imageMessages, summaryMsg];
  } else if (displayMode === "combined_only") {
    allMessages = [...(combinedImageMsg ? [combinedImageMsg] : []), summaryMsg];
  } else {
    // "both" (ค่าเริ่มต้น): ส่งทั้งสไลด์ Carousel, ภาพรวมแผ่นเดียว (3-in-1), ภาพแยก 3 หน้า และข้อความสรุป
    allMessages = [
      carouselFlex,
      ...(combinedImageMsg ? [combinedImageMsg] : []),
      ...imageMessages,
      summaryMsg,
    ];
  }

  // LINE Push Message อนุญาตไม่เกิน 5 ข้อความต่อ 1 API call
  // หากมีเกิน 5 ข้อความ ให้แบ่งส่งเป็นชุดละไม่เกิน 4 ข้อความ
  const chunks = [];
  for (let i = 0; i < allMessages.length; i += 4) {
    chunks.push(allMessages.slice(i, i + 4));
  }

  try {
    for (const chunk of chunks) {
      await withRetry(() =>
        client.pushMessage({
          to: lineUserId,
          messages: chunk,
        })
      );
    }
    for (const u of imageUrls) {
      logLineMessage({ lineUserId, sendType: "push", messageType: "image", content: u, status: "success" });
    }
    if (combinedImageUrl) {
      logLineMessage({ lineUserId, sendType: "push", messageType: "image", content: combinedImageUrl, status: "success" });
    }
    return { ok: true };
  } catch (err) {
    logLineMessage({
      lineUserId,
      sendType: "push",
      messageType: "image",
      content: imageUrls.join(" "),
      status: "failed",
      errorDetail: err.message,
    });
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
          buildBrandBadge(cfg),
          {
            type: "text",
            text: title,
            weight: "bold",
            color: cfg.titleColor,
            size: "xl",
            margin: "md",
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

// ส่ง Flex Message ต้อนรับผู้ใช้เมื่อกดแอดเพื่อนครั้งแรก (follow event) พร้อม Quick Reply
export async function replyWelcomePrompt(replyToken, lineUserId, isAlreadyRegistered = false) {
  const registerUrl = `${process.env.PUBLIC_BASE_URL}/register?userId=${lineUserId}`;
  const cfg = getBotMessagesConfig().welcomePrompt || {
    brandLabel: "biokoop 🔴⚪⚫",
    title: "👋 ยินดีต้อนรับสู่ biokoop!",
    subtitle: "AI Health Assistant",
    bodyText: "ผู้ช่วยวิเคราะห์และแปลผลตรวจสุขภาพอัตโนมัติด้วย AI 🌿\n\n✨ สรุปผลรวดเร็วและแม่นยำ\n📊 แปลงค่าซับซ้อนเป็นคะแนนและกราฟเข้าใจง่าย\n🔒 ปลอดภัย เป็นส่วนตัว",
    buttonLabel: "📝 ลงทะเบียนเริ่มต้นใช้งาน",
    bgColor: "#FFFFFF",
    brandColor: "#DC2626",
    titleColor: "#111111",
    bodyTextColor: "#374151",
    buttonColor: "#DC2626"
  };

  const quickReply = {
    items: [
      {
        type: "action",
        action: {
          type: "message",
          label: "📖 วิธีใช้งาน",
          text: "วิธีใช้งาน",
        },
      },
      {
        type: "action",
        action: {
          type: "cameraRoll",
          label: "📸 เลือกภาพวิเคราะห์",
        },
      },
      {
        type: "action",
        action: {
          type: "message",
          label: "💬 ติดต่อสอบถาม",
          text: "ติดต่อสอบถาม",
        },
      },
    ],
  };

  if (isAlreadyRegistered) {
    const textMsg = {
      type: "text",
      text: `ยินดีต้อนรับกลับสู่ biokoop 🔴⚪⚫ อีกครั้งค่ะ!\n\nคุณสามารถแตะเมนู "เลือกภาพเพื่อวิเคราะห์" ด้านล่างเพื่อเริ่มส่งภาพผลตรวจสุขภาพได้ทันทีเลยนะคะ 😊`,
      quickReply,
    };
    try {
      const res = await client.replyMessage({
        replyToken,
        messages: [textMsg],
      });
      logLineMessage({ lineUserId, sendType: "reply", messageType: "text", content: "Welcome back message", status: "success" });
      return res;
    } catch (err) {
      logLineMessage({ lineUserId, sendType: "reply", messageType: "text", content: "Welcome back message", status: "failed", errorDetail: err.message });
      throw err;
    }
  }

  const flexMessage = {
    type: "flex",
    altText: "👋 ยินดีต้อนรับสู่ biokoop 🔴⚪⚫",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: cfg.bgColor,
        paddingAll: "lg",
        contents: [
          buildBrandBadge(cfg),
          {
            type: "text",
            text: cfg.title,
            weight: "bold",
            color: cfg.titleColor,
            size: "xl",
            margin: "md",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: cfg.bgColor,
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: cfg.bodyText,
            wrap: true,
            color: cfg.bodyTextColor,
            size: "sm",
            margin: "none",
          },
        ],
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
              label: cfg.buttonLabel,
              uri: registerUrl,
            },
            style: "primary",
            color: cfg.buttonColor,
            height: "sm",
          },
        ],
      },
    },
    quickReply,
  };

  try {
    const res = await client.replyMessage({
      replyToken,
      messages: [flexMessage],
    });
    logLineMessage({ lineUserId, sendType: "reply", messageType: "flex", content: "Flex Message ต้อนรับแอดเพื่อนครั้งแรก", status: "success" });
    return res;
  } catch (err) {
    logLineMessage({ lineUserId, sendType: "reply", messageType: "flex", content: "Flex Message ต้อนรับแอดเพื่อนครั้งแรก", status: "failed", errorDetail: err.message });
    throw err;
  }
}

// ส่ง Flex Message วิธีใช้งาน biokoop แบบขั้นตอน 1-2-3 พร้อมปุ่มลัดไปเลือกภาพวิเคราะห์
export async function replyHowToPrompt(replyToken, lineUserId) {
  const cfg = getBotMessagesConfig().howToPrompt;
  const howToImageUrl = `${process.env.PUBLIC_BASE_URL || ""}/assets/howto-hero.png`;

  const stepRow = (number, text) => ({
    type: "box",
    layout: "horizontal",
    spacing: "md",
    margin: "md",
    contents: [
      {
        type: "box",
        layout: "vertical",
        width: "24px",
        height: "24px",
        cornerRadius: "12px",
        backgroundColor: cfg.brandColor,
        justifyContent: "center",
        alignItems: "center",
        contents: [
          {
            type: "text",
            text: String(number),
            color: "#FFFFFF",
            size: "xs",
            weight: "bold",
            align: "center",
          },
        ],
      },
      {
        type: "text",
        text,
        wrap: true,
        color: cfg.bodyTextColor,
        size: "sm",
        flex: 1,
      },
    ],
  });

  const bodyContents = [
    stepRow(1, cfg.step1),
    stepRow(2, cfg.step2),
    stepRow(3, cfg.step3),
  ];

  if (cfg.footerNote) {
    bodyContents.push({
      type: "text",
      text: cfg.footerNote,
      wrap: true,
      color: "#94A3B8",
      size: "xs",
      margin: "lg",
    });
  }

  const flexMessage = {
    type: "flex",
    altText: "📖 วิธีใช้งาน biokoop",
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
            type: "box",
            layout: "baseline",
            backgroundColor: "#FEF2F2",
            cornerRadius: "20px",
            paddingAll: "6px",
            paddingStart: "12px",
            paddingEnd: "12px",
            contents: [
              { type: "text", text: "🩺", size: "xs", flex: 0 },
              { type: "text", text: "AI HEALTH ASSISTANT", size: "xs", weight: "bold", color: "#DC2626", margin: "xs", flex: 0 },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            alignItems: "center",
            contents: [
              { type: "text", text: "📖", size: "xxl", flex: 0 },
              { type: "text", text: "วิธีใช้งาน biokoop", weight: "bold", size: "xl", color: "#111111", margin: "md", flex: 0 },
            ],
          },
        ],
      },
      body: {
        type: "box",
        layout: "horizontal",
        backgroundColor: "#FFFFFF",
        paddingAll: "lg",
        spacing: "lg",
        contents: [
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            justifyContent: "center",
            contents: bodyContents,
          },
          {
            type: "image",
            url: howToImageUrl,
            size: "xs",
            aspectRatio: "1:1",
            aspectMode: "fit",
            flex: 0,
            gravity: "center",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FFFFFF",
        paddingAll: "lg",
        contents: [
          {
            type: "button",
            action: {
              type: "message",
              label: "📸 เลือกภาพเพื่อวิเคราะห์",
              text: "เลือกภาพเพื่อวิเคราะห์",
            },
            style: "primary",
            color: "#DC2626",
            height: "sm",
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
    logLineMessage({ lineUserId, sendType: "reply", messageType: "flex", content: "Flex Message วิธีใช้งาน", status: "success" });
    return res;
  } catch (err) {
    logLineMessage({ lineUserId, sendType: "reply", messageType: "flex", content: "Flex Message วิธีใช้งาน", status: "failed", errorDetail: err.message });
    throw err;
  }
}



