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
    brandLabel: "biokoop 🔴⚪⚫",
    title: "ลงทะเบียนผู้ใช้งาน",
    bodyText: "ยินดีต้อนรับค่ะ! เพื่อให้ระบบสามารถบันทึกข้อมูลและวิเคราะห์ผลได้อย่างแม่นยำ กรุณาลงทะเบียนข้อมูลส่วนตัวสั้นๆ ก่อนเริ่มส่งภาพนะคะ",
    buttonLabel: "📝 กดที่นี่เพื่อลงทะเบียน",
    // ข้อความสำหรับคนที่ลงทะเบียนไปแล้ว (แสดงแทนชุดข้างบนเมื่อกดปุ่ม/พิมพ์ "ลงทะเบียน" ซ้ำ)
    editTitle: "แก้ไขข้อมูลผู้ใช้งาน",
    editBodyText: "คุณลงทะเบียนกับ biokoop ไว้แล้วค่ะ กดปุ่มด้านล่างเพื่อแก้ไขข้อมูลส่วนตัวของคุณได้เลยนะคะ",
    editButtonLabel: "📝 กดที่นี่เพื่อแก้ไขข้อมูล",
    bgColor: "#FFFFFF",
    brandColor: "#DC2626",
    titleColor: "#111111",
    bodyTextColor: "#374151",
    buttonColor: "#DC2626"
  },
  autoReplies: {
    greeting: "สวัสดีค่ะ! ยินดีต้อนรับสู่ biokoop 🔴⚪⚫\n\nหากต้องการวิเคราะห์ผลสุขภาพ กดปุ่ม \"เลือกภาพเพื่อวิเคราะห์\" ในเมนูเพื่อเลือกรูปภาพจากแกลเลอรีได้เลยค่ะ",
    contact: "💬 ติดต่อสอบถามทีมงาน biokoop\n\nพิมพ์ข้อความสอบถามไว้ในแชทนี้ได้เลย ทีมงานจะรีบตอบกลับให้เร็วที่สุดค่ะ",
    sendPhotoReady: "🖼️ พร้อมวิเคราะห์เทรนด์สุขภาพรายสัปดาห์แล้วค่ะ!\n\nส่งภาพ Screenshot จากแอป Kieslect ให้ครบ 3 หน้านี้เข้ามาในแชทได้เลย (ลำดับไหนก็ได้ค่ะ)\n1) Body Load\n2) Recovery\n3) Sleep Quality\n\nเมื่อครบ 3 รูป AI จะวิเคราะห์และส่งรายงาน 3 หน้าให้ทันทีค่ะ",
    noResult: "ยังไม่มีผลลัพธ์ล่าสุดค่ะ ส่งภาพ Screenshot จากแอป Kieslect ครบ 3 หน้า (Body Load / Recovery / Sleep Quality) เพื่อเริ่มวิเคราะห์รายงานรายสัปดาห์ได้เลยนะคะ 🌿",
    textFallback: "ระบบได้รับข้อความของคุณเรียบร้อยแล้วค่ะ 😊\n\nหากต้องการรายงานสุขภาพรายสัปดาห์ กรุณาส่งภาพ Screenshot จากแอป Kieslect ครบ 3 หน้า (Body Load / Recovery / Sleep Quality) เข้ามาในแชทได้เลยนะคะ"
  },
  howToPrompt: {
    brandLabel: "AI Health Assistant",
    title: "📖 วิธีใช้งาน biokoop",
    step1: "แตะเมนู \"เลือกภาพเพื่อวิเคราะห์\" ด้านล่างเพื่อเปิดแกลเลอรีรูปภาพทันที",
    step2: "ส่งภาพ Screenshot จากแอป Kieslect ครบ 3 หน้า: Body Load, Recovery และ Sleep Quality (ลำดับไหนก็ได้)",
    step3: "รอสักครู่ AI จะวิเคราะห์เทรนด์ 7 วัน และส่งรายงานสุขภาพรายสัปดาห์ 3 หน้ากลับมาให้อัตโนมัติค่ะ",
    footerNote: "กด \"ผลลัพธ์ล่าสุด\" เพื่อดูรายงานล่าสุดของคุณอีกครั้งได้ตลอดเวลาค่ะ",
    buttonLabel: "📸 เลือกภาพเพื่อวิเคราะห์",
    bgColor: "#FFFFFF",
    brandColor: "#DC2626",
    titleColor: "#111111",
    bodyTextColor: "#374151"
  },
  welcomePrompt: {
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
