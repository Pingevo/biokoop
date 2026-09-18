// botMessagesConfigService.js
// จัดการค่าตั้งค่าข้อความ/สีที่บอท LINE ใช้ตอบผู้ใช้ (flex message ชวนลงทะเบียน + ข้อความอัตโนมัติต่างๆ)
// รูปแบบเดียวกับ cardConfigService.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "../config/botMessagesConfig.json");

const DEFAULT_CONFIG = {
  registrationPrompt: {
    brandLabel: "KIESLECT × BIOKOOP",
    title: "ลงทะเบียนผู้ใช้งาน",
    bodyText: "ยินดีต้อนรับค่ะ! เพื่อให้ระบบสามารถบันทึกข้อมูลและวิเคราะห์แนวโน้มสุขภาพรายสัปดาห์ได้อย่างแม่นยำ กรุณาลงทะเบียนข้อมูลส่วนตัวสั้นๆ ก่อนเริ่มส่งภาพนะคะ 🌿",
    buttonLabel: "📝 กดที่นี่เพื่อลงทะเบียน",
    // ข้อความสำหรับคนที่ลงทะเบียนไปแล้ว (แสดงแทนชุดข้างบนเมื่อกดปุ่ม/พิมพ์ "ลงทะเบียน" ซ้ำ)
    editTitle: "แก้ไขข้อมูลผู้ใช้งาน",
    editBodyText: "คุณลงทะเบียนกับระบบไว้เรียบร้อยแล้วค่ะ กดปุ่มด้านล่างเพื่อแก้ไขข้อมูลส่วนตัวของคุณได้เลยนะคะ 😊",
    editButtonLabel: "📝 กดที่นี่เพื่อแก้ไขข้อมูล",
    bgColor: "#FFFFFF",
    brandColor: "#DC2626",
    titleColor: "#111111",
    bodyTextColor: "#374151",
    buttonColor: "#DC2626"
  },
  autoReplies: {
    greeting: "สวัสดีค่ะ! ยินดีต้อนรับสู่ Kieslect Biokoop นะคะ 🌿\n\nหากต้องการรับรายงาน Weekly Health Trend Report สามารถส่งภาพ Screenshot จากแอป Kieslect ครบทั้ง 3 ภาพ (Body Load, Recovery, Sleep Quality) เข้ามาในแชทได้ทันทีเลยค่ะ ✨",
    contact: "💬 ติดต่อสอบถามทีมงาน Kieslect Biokoop\n\nพิมพ์ข้อความสอบถามไว้ในแชทนี้ได้เลย ทีมงานจะรีบตอบกลับให้เร็วที่สุดค่ะ",
    sendPhotoReady: "🖼️ พร้อมวิเคราะห์เทรนด์สุขภาพรายสัปดาห์แล้วค่ะ!\n\nส่งภาพ Screenshot จากแอป Kieslect ให้ครบ 3 ภาพนี้เข้ามาในแชทได้เลยค่ะ (ลำดับไหนก็ได้นะคะ)\n1️⃣ Body Load (ภาระร่างกาย)\n2️⃣ Recovery (การฟื้นตัว)\n3️⃣ Sleep Quality (คุณภาพการนอน)\n\nเมื่อส่งครบทั้ง 3 รูปแล้ว AI จะสรุปรายงานเจาะลึก 3 หน้าให้ทันทีค่ะ ✨",
    noResult: "ยังไม่มีผลลัพธ์ล่าสุดค่ะ ส่งภาพ Screenshot จากแอป Kieslect ครบ 3 ภาพ (Body Load, Recovery, Sleep Quality) เพื่อเริ่มวิเคราะห์รายงาน Weekly Health Trend Report ได้เลยนะคะ 🌿",
    textFallback: "ระบบได้รับข้อความของคุณเรียบร้อยแล้วค่ะ 😊\n\nหากต้องการรับรายงานสุขภาพรายสัปดาห์ กรุณาส่งภาพ Screenshot จากแอป Kieslect ครบ 3 ภาพ (Body Load, Recovery, Sleep Quality) เข้ามาในแชทได้เลยนะคะ 🌿"
  },
  howToPrompt: {
    brandLabel: "KIESLECT × BIOKOOP",
    title: "📖 วิธีรับรายงานสุขภาพ 3 ภาพ",
    step1: "แตะเมนู \"เลือกภาพเพื่อวิเคราะห์\" ด้านล่างเพื่อเปิดแกลเลอรีรูปภาพ",
    step2: "ส่งภาพ Screenshot จากแอป Kieslect ครบ 3 ภาพ: Body Load, Recovery และ Sleep Quality (ส่งลำดับไหนก็ได้ค่ะ)",
    step3: "รอสักครู่ AI จะวิเคราะห์เทรนด์ 7 วัน และส่งรายงานสุขภาพรายสัปดาห์ 3 หน้ากลับมาให้อัตโนมัติค่ะ",
    footerNote: "กด \"ผลลัพธ์ล่าสุด\" เพื่อเปิดดูรายงานล่าสุดของคุณอีกครั้งได้ตลอดเวลาค่ะ",
    buttonLabel: "📸 เลือกภาพเพื่อวิเคราะห์",
    bgColor: "#FFFFFF",
    brandColor: "#DC2626",
    titleColor: "#111111",
    bodyTextColor: "#374151"
  },
  welcomePrompt: {
    brandLabel: "KIESLECT × BIOKOOP",
    title: "👋 ยินดีต้อนรับสู่ Kieslect Biokoop!",
    subtitle: "Weekly Health Trend Report (AI)",
    bodyText: "ระบบวิเคราะห์แนวโน้มสุขภาพรายสัปดาห์อัจฉริยะด้วย AI 🌿\n\nเพียงส่งภาพ Screenshot จากแอป Kieslect ครบ 3 ภาพ:\n1️⃣ Body Load (ภาระร่างกาย)\n2️⃣ Recovery (การฟื้นตัว)\n3️⃣ Sleep Quality (คุณภาพการนอน)\n*(ส่งลำดับใดก็ได้ หรือส่งพร้อมกัน 3 รูปได้เลยค่ะ)*\n\n✨ AI จะสรุปรายงานเจาะลึก 3 หน้า พร้อมคำแนะนำเฉพาะบุคคลให้ทันทีค่ะ\n\n📝 เริ่มต้นง่ายๆ เพียงกดลงทะเบียนด้านล่างก่อนส่งภาพนะคะ",
    buttonLabel: "📝 ลงทะเบียนเริ่มต้นใช้งาน",
    bgColor: "#FFFFFF",
    brandColor: "#DC2626",
    titleColor: "#111111",
    bodyTextColor: "#374151",
    buttonColor: "#DC2626"
  }
};

let cachedConfig = null;

export function getBotMessagesConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      cachedConfig = {
        registrationPrompt: { ...DEFAULT_CONFIG.registrationPrompt, ...(data.registrationPrompt || {}) },
        autoReplies: { ...DEFAULT_CONFIG.autoReplies, ...(data.autoReplies || {}) },
        welcomePrompt: { ...DEFAULT_CONFIG.welcomePrompt, ...(data.welcomePrompt || {}) },
        howToPrompt: { ...DEFAULT_CONFIG.howToPrompt, ...(data.howToPrompt || {}) }
      };
      return cachedConfig;
    }
  } catch (err) {
    console.error("[botMessagesConfigService] Read error, falling back to default:", err.message);
  }

  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

export function resetBotMessagesConfig() {
  try {
    const updated = { ...DEFAULT_CONFIG };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    cachedConfig = updated;
    return { ok: true, config: updated };
  } catch (err) {
    console.error("[botMessagesConfigService] Reset error:", err.message);
    return { ok: false, error: err.message };
  }
}

export function saveBotMessagesConfig(newConfig) {
  try {
    const updated = {
      registrationPrompt: { ...DEFAULT_CONFIG.registrationPrompt, ...(newConfig.registrationPrompt || {}) },
      autoReplies: { ...DEFAULT_CONFIG.autoReplies, ...(newConfig.autoReplies || {}) },
      welcomePrompt: { ...DEFAULT_CONFIG.welcomePrompt, ...(newConfig.welcomePrompt || {}) },
      howToPrompt: { ...DEFAULT_CONFIG.howToPrompt, ...(newConfig.howToPrompt || {}) }
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    cachedConfig = updated;
    return { ok: true, config: updated };
  } catch (err) {
    console.error("[botMessagesConfigService] Save error:", err.message);
    return { ok: false, error: err.message };
  }
}
