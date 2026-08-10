// apiPricingConfigService.js
// เก็บอัตราค่าบริการต่อ token ของแต่ละโมเดล Gemini (ตั้งค่าโดยแอดมินเอง เพราะราคาจริงเปลี่ยนแปลงได้ตามประกาศของ Google)
// ใช้คำนวณยอดเงินโดยประมาณจากจำนวน token ที่ใช้จริงในแต่ละคำขอ

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "../config/apiPricingConfig.json");

// ราคาเริ่มต้นเป็น 0 ทั้งหมด (ไม่กำหนดเอง เพราะราคาจริงของ Google เปลี่ยนแปลงได้ตลอด) แอดมินต้องกรอกเองในหน้า Admin
const DEFAULT_CONFIG = {
  planMode: "free", // "free" | "paid"
  currency: "USD",
  defaultRates: { inputPer1M: 0, outputPer1M: 0 },
  modelRates: {},
  // โควต้าจำนวนคำขอสูงสุดต่อวัน (Requests Per Day) ของแต่ละโมเดล — ไม่ตั้งค่าเริ่มต้นให้เพราะตัวเลขจริงของ Google
  // เปลี่ยนแปลงได้ตลอดเวลา แอดมินต้องเช็คค่าล่าสุดจาก https://ai.google.dev/gemini-api/docs/rate-limits แล้วกรอกเอง
  dailyQuotaLimits: {}
};

let cachedConfig = null;

export function getPricingConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      cachedConfig = {
        planMode: data.planMode || DEFAULT_CONFIG.planMode,
        currency: data.currency || DEFAULT_CONFIG.currency,
        defaultRates: { ...DEFAULT_CONFIG.defaultRates, ...(data.defaultRates || {}) },
        modelRates: { ...(data.modelRates || {}) },
        dailyQuotaLimits: { ...(data.dailyQuotaLimits || {}) }
      };
      return cachedConfig;
    }
  } catch (err) {
    console.error("[apiPricingConfigService] Read error, falling back to default:", err.message);
  }

  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

export function savePricingConfig(newConfig) {
  try {
    const updated = {
      planMode: newConfig.planMode || DEFAULT_CONFIG.planMode,
      currency: newConfig.currency || DEFAULT_CONFIG.currency,
      defaultRates: { ...DEFAULT_CONFIG.defaultRates, ...(newConfig.defaultRates || {}) },
      modelRates: { ...(newConfig.modelRates || {}) },
      dailyQuotaLimits: { ...(newConfig.dailyQuotaLimits || {}) }
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    cachedConfig = updated;
    return { ok: true, config: updated };
  } catch (err) {
    console.error("[apiPricingConfigService] Save error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ราคามาตรฐานกลางตามประกาศของ Google / OpenRouter (สำหรับให้แอดมินคลิกกดเลือก Preset)
export const OFFICIAL_PRESETS = {
  "gemini-2.5-flash": { name: "Google Gemini 2.5 Flash", inputPer1M: 0.075, outputPer1M: 0.30 },
  "gemini-3.5-flash-lite": { name: "Google Gemini 3.5 Flash Lite", inputPer1M: 0.075, outputPer1M: 0.30 },
  "gemini-3.6-flash": { name: "Google Gemini 3.6 Flash", inputPer1M: 0.15, outputPer1M: 0.60 },
  "openrouter/google/gemini-2.5-flash": { name: "OpenRouter (Gemini 2.5 Flash)", inputPer1M: 0.075, outputPer1M: 0.30 },
  "openrouter/openai/gpt-4o-mini": { name: "OpenRouter (GPT-4o mini)", inputPer1M: 0.15, outputPer1M: 0.60 },
};

export function getPricingPresets() {
  return OFFICIAL_PRESETS;
}

// คำนวณยอดเงินโดยประมาณจาก token (หากเป็นโหมดใช้งานฟรี planMode === "free" คืนค่า 0 ฟรี 100%)
export function estimateCost(modelName, promptTokens, completionTokens) {
  const cfg = getPricingConfig();
  if (cfg.planMode === "free") {
    return 0; // ฟรี 100% สำหรับ Free Tier API Key
  }

  let rates = null;
  if (modelName) {
    if (cfg.modelRates[modelName]) {
      rates = cfg.modelRates[modelName];
    } else {
      const stripped = modelName.replace(/^openrouter\//, "");
      if (cfg.modelRates[stripped]) {
        rates = cfg.modelRates[stripped];
      } else {
        const afterSlash = stripped.split("/").pop();
        if (cfg.modelRates[afterSlash]) {
          rates = cfg.modelRates[afterSlash];
        }
      }
    }
  }

  if (!rates) {
    rates = cfg.defaultRates || { inputPer1M: 0, outputPer1M: 0 };
  }

  const inputCost = (promptTokens / 1_000_000) * (rates.inputPer1M || 0);
  const outputCost = (completionTokens / 1_000_000) * (rates.outputPer1M || 0);
  return inputCost + outputCost;
}

