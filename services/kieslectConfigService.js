import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "../config/kieslectConfig.json");

const DEFAULT_CONFIG = {
  enableKieslectPattern: true,
  showRecoveryGauge: true,
  showBodyLoadGauge: true,
  badgeText: "KIESLECT HEALTH & RECOVERY",
  recoveryThresholds: {
    low: 40,
    medium: 70
  },
  colors: {
    recoveryLow: "#DC2626",
    recoveryMedium: "#CA8A04",
    recoveryHigh: "#16A34A",
    bodyLoadColor: "#0284C7",
    bgBadge: "#FEE2E2",
    borderBadge: "#FCA5A5"
  },
  enableLowRecoveryAlert: true,
  lowRecoveryAlertMessage: "⚠️ แจ้งเตือนสภาวะร่างกาย (Kieslect Health): วันนี้ค่าการฟื้นตัว (Recovery) ของคุณ {nickname} อยู่ที่ {recoveryPercent}% ซึ่งอยู่ในระดับต่ำ แนะนำให้ลดกิจกรรมหนัก พักผ่อนให้เพียงพอ และดื่มน้ำมากขึ้นนะคะ 💧😴"
};

let cachedConfig = null;

export function getKieslectConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf8");
      cachedConfig = {
        ...DEFAULT_CONFIG,
        ...JSON.parse(data),
        recoveryThresholds: { ...DEFAULT_CONFIG.recoveryThresholds, ...(JSON.parse(data).recoveryThresholds || {}) },
        colors: { ...DEFAULT_CONFIG.colors, ...(JSON.parse(data).colors || {}) }
      };
      return cachedConfig;
    }
  } catch (err) {
    console.error("[kieslectConfigService] Read error, falling back to default:", err.message);
  }

  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

export function saveKieslectConfig(newConfig) {
  try {
    const updated = {
      ...DEFAULT_CONFIG,
      ...newConfig,
      recoveryThresholds: { ...DEFAULT_CONFIG.recoveryThresholds, ...(newConfig.recoveryThresholds || {}) },
      colors: { ...DEFAULT_CONFIG.colors, ...(newConfig.colors || {}) }
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    cachedConfig = updated;
    return { ok: true, config: updated };
  } catch (err) {
    console.error("[kieslectConfigService] Save error:", err.message);
    return { ok: false, error: err.message };
  }
}
