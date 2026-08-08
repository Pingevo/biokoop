import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "../config/gradeConfig.json");

const DEFAULT_CONFIG = {
  grades: [
    {
      grade: "A",
      label: "ดีเยี่ยม (Excellent)",
      minScore: 85,
      maxScore: 100,
      defaultHeadline: "เมื่อคืนหลับลึกฟื้นตัวได้ดีเยี่ยม! 🌟",
      defaultSummary: "คุณภาพการนอนหลับอยู่ในเกณฑ์ดีเยี่ยม ร่างกายได้รับการฟื้นฟูอย่างสมบูรณ์ อวัยวะและสมองล้างสารพิษเต็มประสิทธิภาพ",
      defaultTips: "รักษาช่วงเวลาเข้านอนและตื่นนอนให้สม่ำเสมอ เพื่อคงคุณภาพการนอนที่ดีตลอดไป",
      color: "#16A34A",
    },
    {
      grade: "B",
      label: "ดี (Good)",
      minScore: 70,
      maxScore: 84,
      defaultHeadline: "การนอนหลับเกณฑ์ดี พร้อมลุยวันใหม่! 🌿",
      defaultSummary: "การนอนโดยรวมมีคุณภาพดี ร่างกายฟื้นตัวพร้อมทำกิจกรรมประจำวัน และซ่อมแซมส่วนที่สึกหรอได้เป็นอย่างดี",
      defaultTips: "ดื่มน้ำให้เพียงพอ 2.5–3 ลิตรต่อวัน และงดเครื่องดื่มกาเฟอีนหลังบ่ายสองเพื่อช่วยให้หลับลึกขึ้น",
      color: "#0284C7",
    },
    {
      grade: "C",
      label: "พอใช้ (Fair)",
      minScore: 55,
      maxScore: 69,
      defaultHeadline: "ร่างกายต้องการการพักผ่อนเพิ่มขึ้น 🌙",
      defaultSummary: "คุณภาพการนอนยังอยู่ในระดับพอใช้ มีช่วงตื่นหรือหลับตื้นค่อนข้างมาก ควรระวังการสะสมของความเหนื่อยล้า",
      defaultTips: "พยายามผ่อนคลายก่อนเข้านอน งดเล่นมือถืออย่างน้อย 30 นาทีก่อนนอนเพื่อเพิ่มคุณภาพการหลับลึก",
      color: "#D97706",
    },
    {
      grade: "D",
      label: "ควรปรับปรุง (Needs Improvement)",
      minScore: 0,
      maxScore: 54,
      defaultHeadline: "เตือนสุขภาพ! ร่างกายพักผ่อนไม่เพียงพอ ⚠️",
      defaultSummary: "คะแนนการนอนอยู่ในระดับต่ำ ร่างกายฟื้นตัวได้ไม่เต็มที่ อาจส่งผลต่อระบบภูมิคุ้มกันและสมาธิระหว่างวัน",
      defaultTips: "ควรเข้านอนให้เร็วขึ้นในคืนนี้ ปรับห้องนอนให้อากาศถ่ายเท มืดสนิท และงดมื้อดึกก่อนนอน",
      color: "#DC2626",
    },
  ],
};

let cachedConfig = null;

export function getGradeConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed?.grades) && parsed.grades.length > 0) {
        cachedConfig = parsed;
        return cachedConfig;
      }
    }
  } catch (err) {
    console.error("[gradeConfigService] Read error, falling back to default:", err.message);
  }

  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

export function saveGradeConfig(newConfig) {
  try {
    if (!newConfig || !Array.isArray(newConfig.grades)) {
      return { ok: false, error: "ข้อมูลเกรดไม่ถูกต้อง (ต้องเป็น array ของ grades)" };
    }

    const updated = {
      grades: newConfig.grades.map((g) => ({
        grade: String(g.grade || "A").toUpperCase(),
        label: String(g.label || ""),
        minScore: Math.max(0, Math.min(100, Number(g.minScore) || 0)),
        maxScore: Math.max(0, Math.min(100, Number(g.maxScore) || 100)),
        defaultHeadline: String(g.defaultHeadline || ""),
        defaultSummary: String(g.defaultSummary || ""),
        defaultTips: String(g.defaultTips || ""),
        color: String(g.color || "#0284C7"),
      })),
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    cachedConfig = updated;
    return { ok: true, config: updated };
  } catch (err) {
    console.error("[gradeConfigService] Save error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ประเมินคะแนน score -> คืนเกรดและคำพูด fallback ที่ตรงกับเกณฑ์
export function getGradeForScore(score = 75) {
  const numScore = Number(score) || 75;
  const config = getGradeConfig();
  const grades = config.grades || DEFAULT_CONFIG.grades;

  // ค้นหาเกรดที่ numScore อยู่ในช่วง [minScore, maxScore]
  const matched = grades.find((g) => numScore >= g.minScore && numScore <= g.maxScore);

  if (matched) {
    return {
      grade: matched.grade,
      label: matched.label,
      headline: matched.defaultHeadline,
      summary: matched.defaultSummary,
      tips: matched.defaultTips,
      color: matched.color,
    };
  }

  // fallback ถ้านอกเหนือช่วง
  const fallback = grades[0] || DEFAULT_CONFIG.grades[0];
  return {
    grade: fallback.grade,
    label: fallback.label,
    headline: fallback.defaultHeadline,
    summary: fallback.defaultSummary,
    tips: fallback.defaultTips,
    color: fallback.color,
  };
}
