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
  modelRates: {}
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
        modelRates: { ...(data.modelRates || {}) }
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
      modelRates: { ...(newConfig.modelRates || {}) }
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    cachedConfig = updated;
    return { ok: true, config: updated };
  } catch (err) {
    console.error("[apiPricingConfigService] Save error:", err.message);
    return { ok: false, error: err.message };
  }
}

// คำนวณยอดเงินโดยประมาณจาก token (หากเป็นโหมดใช้งานฟรี planMode === "free" คืนค่า 0 ฟรี 100%)
export function estimateCost(modelName, promptTokens, completionTokens) {
  const cfg = getPricingConfig();
  if (cfg.planMode === "free") {
    return 0; // ฟรี 100% สำหรับ Free Tier API Key
  }
  const rates = (modelName && cfg.modelRates[modelName]) || cfg.defaultRates;
  const inputCost = (promptTokens / 1_000_000) * (rates.inputPer1M || 0);
  const outputCost = (completionTokens / 1_000_000) * (rates.outputPer1M || 0);
  return inputCost + outputCost;
}
