// llmExtractConfigService.js
// ค่าตั้งค่าของ flow สกัดข้อมูลดิบ (rawExtractionService) — แก้ได้จากหน้า /llmkey2
// รูปแบบเดียวกับ botMessagesConfigService.js / cardConfigService.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "../config/llmExtractConfig.json");

const DEFAULT_CONFIG = {
  // เปิด/ปิด flow สกัดข้อมูลทั้งระบบ (ปิด = ไม่ยิง AI เลย เงียบๆ)
  enabled: true,
  // โมเดล Gemini ตัวเดียวที่ใช้สกัด — เลือกจากหน้า /llmkey2 (ไม่วนโมเดล)
  model: "gemini-3.1-flash-lite",
  maxOutputTokens: 16000,
  // list โมเดล free-tier ที่โชว์ใน dropdown (อ้างอิง rate limit ของ project)
  availableModels: [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ],
};

let cachedConfig = null;

export function getLlmExtractConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      cachedConfig = { ...DEFAULT_CONFIG, ...data };
      return cachedConfig;
    }
  } catch (err) {
    console.error("[llmExtractConfigService] Read error, falling back to default:", err.message);
  }

  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

export function saveLlmExtractConfig(newConfig) {
  try {
    const updated = {
      enabled: newConfig.enabled !== undefined ? !!newConfig.enabled : DEFAULT_CONFIG.enabled,
      model: String(newConfig.model || DEFAULT_CONFIG.model).trim(),
      maxOutputTokens: Number(newConfig.maxOutputTokens) || DEFAULT_CONFIG.maxOutputTokens,
      availableModels: Array.isArray(newConfig.availableModels) && newConfig.availableModels.length
        ? newConfig.availableModels.map((m) => String(m).trim()).filter(Boolean)
        : [...DEFAULT_CONFIG.availableModels],
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    cachedConfig = updated;
    return { ok: true, config: updated };
  } catch (err) {
    console.error("[llmExtractConfigService] Save error:", err.message);
    return { ok: false, error: err.message };
  }
}
