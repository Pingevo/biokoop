// registrationConfigService.js
// บริการจัดการการตั้งค่าโหมดการลงทะเบียนผู้ใช้งาน (IMEI / Order SN / Order ID / None)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "../config/registrationConfig.json");

const DEFAULT_CONFIG = {
  mode: "none", // "none" | "imei" | "order_sn" | "order_id" | "any" | "both_imei_and_order"
  isRequired: true,
  preventDuplicate: true,
  whitelistOnly: false,
  verifyWithDbWallet: false,
  customLabel: "",
  helpText: "กรุณาระบุเลขอุปกรณ์หรือคำสั่งซื้อของคุณเพื่อยืนยันการรับบริการ",
  allowedTypes: ["imei", "order_sn", "order_id"],
};

let cachedConfig = null;

/**
 * ดึงค่าคอนฟิกการลงทะเบียน
 */
export function getRegistrationConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      cachedConfig = { ...DEFAULT_CONFIG, ...data };
    } else {
      cachedConfig = { ...DEFAULT_CONFIG };
      saveRegistrationConfig(cachedConfig);
    }
  } catch (err) {
    console.error("[registrationConfigService] Error reading config file:", err.message);
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  return cachedConfig;
}

/**
 * บันทึกค่าคอนฟิกการลงทะเบียน
 */
export function saveRegistrationConfig(newConfig) {
  try {
    const updated = {
      ...DEFAULT_CONFIG,
      ...newConfig,
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    cachedConfig = updated;
    return { ok: true, config: cachedConfig };
  } catch (err) {
    console.error("[registrationConfigService] Error saving config file:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * ตรวจสอบรูปแบบเบื้องต้นของรหัสที่กรอกตามประเภท
 */
export function validateIdentifierFormat(type, code) {
  if (!code || typeof code !== "string") {
    return { valid: false, message: "กรุณาระบุรหัสที่ถูกต้อง" };
  }

  const cleanCode = code.trim();
  if (cleanCode.length < 3) {
    return { valid: false, message: "รหัสสั้นเกินไป กรุณาระบุอย่างน้อย 3 ตัวอักษร" };
  }

  if (type === "imei") {
    // IMEI ปกติเป็นตัวเลข 15 หลัก (หรืออาจมีขีด)
    const digitsOnly = cleanCode.replace(/[^0-9]/g, "");
    if (digitsOnly.length < 10 || digitsOnly.length > 18) {
      return { valid: false, message: "เลข IMEI ควรเป็นตัวเลข 10-18 หลัก" };
    }
  }

  return { valid: true, cleanCode };
}
