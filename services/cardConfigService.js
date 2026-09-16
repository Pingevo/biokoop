// cardConfigService.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "../config/cardConfig.json");

const DEFAULT_CONFIG = {
  canvasWidth: 1024,
  canvasHeight: 1536,
  colors: {
    navyDark: "#111111",
    greenAccent: "#DC2626",
    grayText: "#475569",
    grayLight: "#94A3B8",
    green: "#DC2626",
    greenDark: "#000000",
    greenLight: "#FEE2E2",
    greenBorder: "#FCA5A5",
    purple: "#7C3AED",
    purpleLight: "#F3E8FF",
    red: "#EF4444",
    redLight: "#FEE2E2",
    cyan: "#0284C7",
    cyanLight: "#E0F2FE",
    cyanBorder: "#38BDF8",
    blue: "#2563EB",
    blueLight: "#EFF6FF",
    yellow: "#CA8A04",
    yellowLight: "#FEF9C3",
    yellowBorder: "#FDE047",
    deepSleepBg: "#3730A3",
    lightSleepBg: "#3B82F6",
    remBg: "#E0F2FE",
    restlessBg: "#10B981",
    awakeBg: "#EF4444",
    bgCream: "#FFFFFF",
    cardBg: "#FFFFFF",
    border: "#E2E8F0",
    white: "#FFFFFF"
  },
  textLabels: {
    headerSubtitle: "MORNING HEALTH CARD",
    headerSubtext: "คุณภาพการนอนที่ดี ช่วยสร้างรากฐานที่แข็งแรงให้กับวันของคุณ",
    sleepCompTitle: "องค์ประกอบการนอน",
    activitiesTitle: "วันนี้เหมาะกับ",
    tipsTitle: "TIPS"
  },
  sections: [
    { id: "header", name: "ZONE 1 - HEADER & TITLE", visible: true },
    { id: "stats", name: "ZONE 2 - STAT ROW 3 คอลัมน์", visible: true },
    { id: "kieslectRecovery", name: "ZONE KIESLECT - RECOVERY & BODY LOAD WIDGET", visible: true },
    { id: "aiSummary", name: "ZONE 3 - AI SUMMARY BOX", visible: true },
    { id: "sleepComp", name: "ZONE 4 & 5 - องค์ประกอบการนอน & HYPNOGRAM CHART", visible: true },
    { id: "activities", name: "ZONE 6 - วันนี้เหมาะกับ", visible: true },
    { id: "tips", name: "ZONE 7 - TIPS BOX", visible: true }
  ],
  disclaimer: "หมายเหตุ: ข้อมูลจากอุปกรณ์สวมใส่ใช้สำหรับการติดตามสุขภาพทั่วไป ไม่สามารถใช้แทนคำแนะนำจากผู้เชี่ยวชาญได้",
  weeklyConfig: {
    brandTitle: "BIOKOOP",
    headerSubtitle: "AI HEALTH INTELLIGENCE",
    headerSubtext: "วิเคราะห์ภาพรวมการฟื้นตัว ภาระร่างกาย และคุณภาพการนอนหลับ",
    footerQuote: "“เข้าใจร่างกายวันนี้ เพื่อพรุ่งนี้ที่ดีกว่า”",
    footerSub: "AI HEALTH INTELLIGENCE",
    colors: {
      ink: "#0B0F19",
      sub: "#1E293B",
      border: "#CBD5E1",
      cardBg: "#FFFFFF",
      blue: "#0284C7",
      green: "#15803D",
      purple: "#7C3AED"
    },
    visibility: {
      showHeroImage: true,
      showBodyLoadTrend: true,
      showAiInsights: true,
      showRecoveryTrend: true,
      showActivityGuide: true,
      showHypnogram: true,
      showSleepTips: true
    }
  }
};

let cachedConfig = null;

export function getCardConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(data);
      cachedConfig = {
        ...DEFAULT_CONFIG,
        ...parsed,
        colors: { ...DEFAULT_CONFIG.colors, ...(parsed.colors || {}) },
        textLabels: { ...DEFAULT_CONFIG.textLabels, ...(parsed.textLabels || {}) },
        weeklyConfig: {
          ...DEFAULT_CONFIG.weeklyConfig,
          ...(parsed.weeklyConfig || {}),
          colors: { ...DEFAULT_CONFIG.weeklyConfig.colors, ...(parsed.weeklyConfig?.colors || {}) },
          visibility: { ...DEFAULT_CONFIG.weeklyConfig.visibility, ...(parsed.weeklyConfig?.visibility || {}) }
        }
      };
      return cachedConfig;
    }
  } catch (err) {
    console.error("[cardConfigService] Read error, falling back to default:", err.message);
  }

  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

export function saveCardConfig(newConfig) {
  try {
    const updated = {
      ...DEFAULT_CONFIG,
      ...newConfig,
      colors: { ...DEFAULT_CONFIG.colors, ...(newConfig.colors || {}) },
      textLabels: { ...DEFAULT_CONFIG.textLabels, ...(newConfig.textLabels || {}) },
      weeklyConfig: {
        ...DEFAULT_CONFIG.weeklyConfig,
        ...(newConfig.weeklyConfig || {}),
        colors: { ...DEFAULT_CONFIG.weeklyConfig.colors, ...(newConfig.weeklyConfig?.colors || {}) },
        visibility: { ...DEFAULT_CONFIG.weeklyConfig.visibility, ...(newConfig.weeklyConfig?.visibility || {}) }
      }
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    cachedConfig = updated;
    return { ok: true, config: updated };
  } catch (err) {
    console.error("[cardConfigService] Save error:", err.message);
    return { ok: false, error: err.message };
  }
}
