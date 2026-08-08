import { pushText } from "./lineService.js";

// Cooldown map: key -> timestamp of last sent alert
const alertCooldowns = new Map();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 นาที

/**
 * ส่งการแจ้งเตือนไปยัง LINE Admin เมื่อเกิดเหตุการณ์สำคัญหรือข้อผิดพลาดร้ายแรง
 * @param {Object} options
 * @param {string} options.key - คีย์สำหรับป้องกันการส่งแจ้งเตือนซ้ำซ้อนในเวลาสั้นๆ (e.g. "GEMINI_QUOTA")
 * @param {string} options.title - หัวข้อการแจ้งเตือน
 * @param {string} options.message - รายละเอียดข้อความ
 * @param {"INFO" | "WARNING" | "CRITICAL"} [options.level="WARNING"] - ระดับความรุนแรง
 * @param {string} [options.details] - ข้อมูลเพิ่มเติม / Error stack
 */
export async function sendAdminAlert({ key, title, message, level = "WARNING", details = "" }) {
  const adminIdsStr = process.env.ADMIN_LINE_USER_IDS || "";
  const adminIds = adminIdsStr.split(",").map((s) => s.trim()).filter(Boolean);

  if (adminIds.length === 0) {
    console.warn(`[alertService] ⚠️ มีการแจ้งเตือนเกิดขึ้น แต่ไม่ได้ตั้งค่า ADMIN_LINE_USER_IDS: ${title}`);
    return;
  }

  // เช็ค Cooldown
  if (key) {
    const lastSent = alertCooldowns.get(key) || 0;
    if (Date.now() - lastSent < COOLDOWN_MS) {
      console.log(`[alertService] ⏳ ข้ามการส่งเตือน "${key}" เนื่องจากอยู่ในช่วง Cooldown (ส่งไปแล้วเมื่อ ${Math.round((Date.now() - lastSent) / 1000)}s ที่แล้ว)`);
      return;
    }
    alertCooldowns.set(key, Date.now());
  }

  const icon = level === "CRITICAL" ? "🚨" : level === "WARNING" ? "⚠️" : "ℹ️";
  const nowStr = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });

  let text = `${icon} [BIOKOOP ALERT: ${level}] ${icon}\n\n`;
  text += `📌 เรื่อง: ${title}\n`;
  text += `⏰ เวลา: ${nowStr}\n`;
  text += `📝 รายละเอียด: ${message}\n`;
  if (details) {
    text += `\n🔍 ข้อมูลเชิงลึก: ${details.slice(0, 300)}`;
  }

  for (const adminId of adminIds) {
    try {
      await pushText(adminId, text);
      console.log(`[alertService] 🔔 ส่งแจ้งเตือนหา Admin (${adminId}) เรียบร้อย: ${title}`);
    } catch (err) {
      console.error(`[alertService] ❌ ส่งแจ้งเตือนหา Admin (${adminId}) ไม่สำเร็จ:`, err.message);
    }
  }
}
