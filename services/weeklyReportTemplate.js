// weeklyReportTemplate.js
// รายงานเทรนด์สุขภาพรายสัปดาห์ biokoop แบบ 3 หน้า (Overview / Activity & Recovery / Sleep Analysis)
// และภาพพาโนรามา 3-in-1 ออกแบบตาม Mockup ระดับพรีเมียม (Font ชัด สีสด ตัวเลขใหญ่ แน่นกระชับ สวยงามสมจริง)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// โหลดภาพถ่ายภูเขาพระอาทิตย์ขึ้นเป็น base64 สำหรับ Page 1 Hero
function getHeroBase64() {
  try {
    const heroPath = path.resolve(__dirname, "../public/assets/backgrounds/mountain-hero.jpg");
    if (fs.existsSync(heroPath)) {
      return fs.readFileSync(heroPath).toString("base64");
    }
  } catch (e) {
    console.warn("[weeklyReportTemplate] Warning: Could not load mountain-hero.jpg:", e.message);
  }
  return "";
}

// โหลดโลโก้ KIESLECT และ BIOKOOP เป็น base64 สำหรับ Header และ Footer ให้สมจริงระดับพรีเมียม
let _kieLogoBase64 = null;
let _bioLogoBase64 = null;

function getKieslectLogoBase64() {
  if (_kieLogoBase64 !== null) return _kieLogoBase64;
  try {
    const p = path.resolve(__dirname, "../public/assets/logo/KIESLECT_500.png");
    if (fs.existsSync(p)) {
      _kieLogoBase64 = fs.readFileSync(p).toString("base64");
      return _kieLogoBase64;
    }
  } catch (e) {
    console.warn("[weeklyReportTemplate] Warning: Could not load KIESLECT_500.png:", e.message);
  }
  _kieLogoBase64 = "";
  return _kieLogoBase64;
}

function getBiokoopLogoBase64() {
  if (_bioLogoBase64 !== null) return _bioLogoBase64;
  try {
    const p = path.resolve(__dirname, "../public/assets/logo/BIOKOOP_500.png");
    if (fs.existsSync(p)) {
      _bioLogoBase64 = fs.readFileSync(p).toString("base64");
      return _bioLogoBase64;
    }
  } catch (e) {
    console.warn("[weeklyReportTemplate] Warning: Could not load BIOKOOP_500.png:", e.message);
  }
  _bioLogoBase64 = "";
  return _bioLogoBase64;
}

const W = 1024;
const PAGE_H = 1780; // ความสูงเท่ากันทั้ง 3 หน้า เพื่อต่อภาพ 3-in-1 ได้แนบสนิทไร้รอยต่อ

// ─── Theme Colors ───
export const DEFAULT_WEEKLY_THEME = {
  ink: "#0B0F19",       // ดำสนิท คมชัดสูงสุด
  sub: "#1E293B",       // สีเทาเข้ม คอนทราสต์สูง
  muted: "#334155",     // สีเทาเข้มสำหรับ Label ไม่จาง
  faint: "#475569",     // สีเทาเข้มปานกลาง
  border: "#CBD5E1",    // เส้นขอบคมชัด
  cardBg: "#FFFFFF",
  lightBg: "#F8FAFC",
  blue: "#0284C7",
  blueDark: "#0369A1",
  blueLight: "#E0F2FE",
  blueBar: "#0284C7",   // สีแท่งฟ้าเข้มชัดเจน ไม่ซีด
  green: "#15803D",
  greenSoft: "#16A34A", // สีเขียวสด คมชัด
  greenLight: "#F0FDF4",
  greenBorder: "#BBF7D0",
  purple: "#7C3AED",
  purpleDark: "#6D28D9",
  purpleLight: "#F5F3FF",
  purpleBorder: "#DDD6FE",
  purpleBar: "#7C3AED", // สีแท่งม่วงเข้ม คมชัด ไม่จาง
  amber: "#D97706",
  amberSoft: "#D97706",
  amberLight: "#FEF3C7",
  rose: "#E11D48",
  roseLight: "#FFE4E6",
  deepSleep: "#4338CA",
  lightSleep: "#6366F1",
  remSleep: "#0284C7",
};

export const C = { ...DEFAULT_WEEKLY_THEME };

export const activeWeeklyConfig = {
  brandTitle: "BIOKOOP",
  headerSubtitle: "AI HEALTH INTELLIGENCE",
  headerSubtext: "วิเคราะห์ภาพรวมการฟื้นตัว ภาระร่างกาย และคุณภาพการนอนหลับ",
  footerQuote: "“เข้าใจร่างกายวันนี้ เพื่อพรุ่งนี้ที่ดีกว่า”",
  footerSub: "AI HEALTH INTELLIGENCE",
  visibility: {
    showHeroImage: true,
    showBodyLoadTrend: true,
    showAiInsights: true,
    showRecoveryTrend: true,
    showActivityGuide: true,
    showHypnogram: true,
    showSleepTips: true,
  },
};

export function applyWeeklyConfig(config = {}) {
  if (!config) return;
  if (config.brandTitle) activeWeeklyConfig.brandTitle = config.brandTitle;
  if (config.headerSubtitle) activeWeeklyConfig.headerSubtitle = config.headerSubtitle;
  if (config.headerSubtext) activeWeeklyConfig.headerSubtext = config.headerSubtext;
  if (config.footerQuote) activeWeeklyConfig.footerQuote = config.footerQuote;
  if (config.footerSub) activeWeeklyConfig.footerSub = config.footerSub;
  if (config.visibility) {
    activeWeeklyConfig.visibility = { ...activeWeeklyConfig.visibility, ...config.visibility };
  }
  if (config.colors) {
    Object.assign(C, DEFAULT_WEEKLY_THEME, config.colors);
    if (config.colors.blue) {
      C.blueBar = config.colors.blue;
      C.blueDark = config.colors.blueDark || config.colors.blue;
    }
    if (config.colors.green) {
      C.greenSoft = config.colors.greenSoft || config.colors.green;
    }
    if (config.colors.purple) {
      C.purpleBar = config.colors.purple;
      C.purpleDark = config.colors.purpleDark || config.colors.purple;
    }
  }
}

// ─── Text Utils ───
function prepareTextForSvg(text = "") {
  if (!text) return "";
  let s = String(text);
  s = s.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F19A}]/gu, "");
  s = s.replace(/([\u0E01-\u0E2E])([\u0E48-\u0E4C])?\u0E33/g, (m, c, t) => c + "\u0E4D" + (t || "") + "\u0E32");
  return s.trim();
}

function esc(s = "") {
  const prep = prepareTextForSvg(s);
  return String(prep)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function visualLength(str = "") {
  const baseOnly = str.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0E4D]/g, "");
  let len = 0;
  for (const ch of baseOnly) {
    if (/[0-9]/.test(ch)) len += 0.95;
    else if (/[A-Za-z]/.test(ch)) len += 0.9;
    else if (/[\s:.,-]/.test(ch)) len += 0.5;
    else len += 1.0;
  }
  return len;
}

const thaiSegmenter = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter("th", { granularity: "word" })
  : null;

/**
 * ตัดข้อความขึ้นบรรทัดใหม่อย่างชาญฉลาดโดยตัดตามคำจริง (Intl.Segmenter)
 * ปรับความกว้างอักขระไทยตามจริง ไม่ตัดคำขาด และไม่ล้นกรอบ
 */
export function wrapLines(text, maxWidthPx, fontSizePx) {
  const clean = prepareTextForSvg(text);
  if (!clean) return [];

  const isThai = /[\u0E00-\u0E7F]/.test(clean);
  const cw = Number(fontSizePx) * (isThai ? 0.56 : 0.52);
  const mxc = Math.max(5, Math.floor(maxWidthPx / cw));

  let words = [];
  if (thaiSegmenter) {
    const rawWords = [...thaiSegmenter.segment(clean)].map((s) => s.segment);
    // รวมคำลงท้าย หรือเครื่องหมายวรรคตอนเข้ากับคำก่อนหน้า ไม่ให้ตกบรรทัดเดี่ยวๆ
    for (let i = 0; i < rawWords.length; i++) {
      const w = rawWords[i];
      // ป้องกันการแยกตัวเลข เช่น 22:00, 1-3, 7.5, 98%
      if ((w === ":" || w === "-" || w === "." || w === "/") && words.length > 0 && /\d+$/.test(words[words.length - 1]) && i + 1 < rawWords.length && /^\d+/.test(rawWords[i + 1])) {
        words[words.length - 1] += w + rawWords[i + 1];
        i++;
        continue;
      }
      if ((w === "(" || w === "[" || w === "“" || w === '"') && i + 1 < rawWords.length) {
        rawWords[i + 1] = w + rawWords[i + 1];
      } else if ((w === "คะ" || w === "ค่ะ" || w === "นะคะ" || w === "น่า" || w === ")" || w === "]" || w === "%" || w === "”") && words.length > 0) {
        words[words.length - 1] += w;
      } else {
        words.push(w);
      }
    }
  } else {
    words = clean.split(/(?<=\s)|(?<=[,!?:;])|(?<=\.(?!\d))/);
  }

  const lines = [];
  let cur = "";

  for (const w of words) {
    const nextLen = visualLength(cur + w);
    if (nextLen > mxc && cur.trim()) {
      lines.push(cur.trim());
      cur = w.trimStart();
    } else {
      cur += w;
    }
  }
  if (cur.trim()) {
    lines.push(cur.trim());
  }

  // ป้องกันคำลงท้ายเดี่ยวๆ ในบรรทัดสุดท้าย
  if (lines.length > 1) {
    const last = lines[lines.length - 1];
    if (visualLength(last) <= 4 && (last.includes("คะ") || last.includes("ค่ะ") || last.startsWith(")"))) {
      const prev = lines[lines.length - 2];
      lines[lines.length - 2] = prev + " " + last;
      lines.pop();
    }
  }

  return lines;
}

/**
 * ปรับข้อความสถานะสุขภาพให้กระชับ ชัดเจน ไม่ยาวเกินไป และไม่ถูกตัดคำครึ่งๆ กลางๆ
 */
export function cleanStatusLabel(str, defaultFallback = "ระดับสมดุล", category = "general") {
  if (!str || typeof str !== "string") return defaultFallback;
  const s = str.trim();

  // กำจัดคำเกริ่นนำยาวๆ
  const cleaned = s
    .replace(/^อยู่ในเกณฑ์/g, "")
    .replace(/^อยู่ช่วง/g, "")
    .replace(/^ช่วง/g, "")
    .replace(/^การฟื้นตัวอยู่ใน/g, "")
    .replace(/^การฟื้นตัว/g, "")
    .replace(/^คุณภาพการนอนแสดงถึงอยู่ใน/g, "")
    .replace(/^คุณภาพการนอนแสดงถึง/g, "")
    .replace(/^คุณภาพการนอน/g, "")
    .trim();

  // จัดกลุ่มสถานะตามคำสำคัญ
  if (cleaned.includes("ยอดเยี่ยม") || cleaned.includes("ดีเยี่ยม")) {
    return category === "recovery" ? "ฟื้นตัวดีเยี่ยม" : (category === "sleep" ? "ยอดเยี่ยม" : "ดีเยี่ยม");
  }
  if (cleaned.includes("เขียว") || cleaned.includes("สีเขียว")) {
    return category === "recovery" ? "ฟื้นตัวดี" : (category === "sleep" ? "ยอดเยี่ยม" : "ระดับดี");
  }
  if (cleaned.includes("ดีมาก")) {
    return category === "recovery" ? "ฟื้นตัวดีมาก" : "ดีมาก";
  }
  if (cleaned.includes("ดี") && !cleaned.includes("ไม่ดี")) {
    return category === "recovery" ? "ฟื้นตัวดี" : (category === "sleep" ? "ระดับดี" : "ระดับดี");
  }
  if (cleaned.includes("สมดุล")) {
    return "ระดับสมดุล";
  }
  if (cleaned.includes("ปานกลาง") || cleaned.includes("พอใช้")) {
    return "ระดับปานกลาง";
  }
  if (cleaned.includes("เหลือง") || cleaned.includes("ส้ม")) {
    return "ระดับปานกลาง";
  }
  if (cleaned.includes("แดง")) {
    return category === "recovery" ? "ควรพักฟื้น" : "ควรพักผ่อน";
  }
  if (cleaned.includes("ล้า") || cleaned.includes("พัก") || cleaned.includes("หนัก") || cleaned.includes("เครียด")) {
    return "ควรพักผ่อน";
  }
  if (cleaned.includes("ปรับปรุง") || cleaned.includes("ต่ำ") || cleaned.includes("ไม่เพียงพอ") || cleaned.includes("ฟื้นฟู")) {
    return category === "recovery" ? "ควรพักฟื้น" : "ควรปรับปรุง";
  }

  // หากข้อความกระชับอยู่แล้ว (ไม่เกิน 14 ตัวอักษร)
  if (cleaned.length > 0 && cleaned.length <= 14) {
    return cleaned;
  }

  // ตัดคำภาษาไทยเพื่อหาคำสั้น
  if (thaiSegmenter) {
    const words = [...thaiSegmenter.segment(cleaned)].map((w) => w.segment).filter((w) => w.trim());
    let shortStr = "";
    for (const w of words) {
      if ((shortStr + w).length <= 10) {
        shortStr += w;
      } else {
        break;
      }
    }
    if (shortStr.length >= 2) return shortStr;
  }

  return defaultFallback;
}

function linesSvg(lines, x, y, lh, fs, fill, weight = 400, anchor = "start", maxLines = 99) {
  const shown = lines.slice(0, maxLines);
  return shown
    .map((l, i) => `<text x="${x}" y="${y + i * lh}" font-family="Kanit" font-weight="${weight}" font-size="${fs}" fill="${fill}" text-anchor="${anchor}">${esc(l)}</text>`)
    .join("");
}

function currentThaiDate() {
  const d = new Date();
  const m = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear() + 543}`;
}

const num = (v) => (typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "")) || 0);
const fmt1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const isNum = (v) => typeof v === "number" && !Number.isNaN(v);

// ─── SVG Vector Icons ───
function iRunner(x, y, s, col) {
  return `<g fill="none" stroke="${col}" stroke-width="${s * 0.14}" stroke-linecap="round" stroke-linejoin="round">
<circle cx="${x + s * 0.35}" cy="${y + s * 0.2}" r="${s * 0.12}" fill="${col}" stroke="none"/>
<polyline points="${x + s * 0.14},${y + s * 0.52} ${x + s * 0.42},${y + s * 0.38} ${x + s * 0.62},${y + s * 0.52} ${x + s * 0.86},${y + s * 0.68}"/>
<polyline points="${x + s * 0.42},${y + s * 0.38} ${x + s * 0.34},${y + s * 0.72} ${x + s * 0.16},${y + s * 0.88}"/>
<polyline points="${x + s * 0.62},${y + s * 0.52} ${x + s * 0.52},${y + s * 0.88}"/>
<polyline points="${x + s * 0.34},${y + s * 0.32} ${x + s * 0.56},${y + s * 0.3} ${x + s * 0.74},${y + s * 0.18}"/>
</g>`;
}

function iLeaf(x, y, s, col) {
  return `<path d="M ${x + s * 0.15} ${y + s * 0.85} C ${x + s * 0.1} ${y + s * 0.45}, ${x + s * 0.35} ${y + s * 0.15}, ${x + s * 0.85} ${y + s * 0.15} C ${x + s * 0.85} ${y + s * 0.65}, ${x + s * 0.55} ${y + s * 0.9}, ${x + s * 0.15} ${y + s * 0.85} Z M ${x + s * 0.15} ${y + s * 0.85} C ${x + s * 0.4} ${y + s * 0.6}, ${x + s * 0.6} ${y + s * 0.4}, ${x + s * 0.85} ${y + s * 0.15}" fill="${col}" stroke="${col}" stroke-width="${s * 0.08}" stroke-linecap="round"/>`;
}

function iMoon(x, y, s, col) {
  const cx = x + s * 0.5;
  const cy = y + s * 0.5;
  const r = s * 0.42;
  return `<path d="M ${cx + r * 0.25} ${cy - r * 0.9} A ${r} ${r} 0 1 0 ${cx + r * 0.65} ${cy + r * 0.65} A ${r * 0.78} ${r * 0.78} 0 0 1 ${cx + r * 0.25} ${cy - r * 0.9} Z" fill="${col}"/>`;
}

function iHeart(x, y, s, col) {
  const cx = x + s * 0.5;
  const cy = y + s * 0.46;
  const r = s * 0.42;
  return `<path d="M ${cx} ${cy + r * 0.82} C ${cx - r * 1.3} ${cy - r * 0.2}, ${cx - r * 0.6} ${cy - r * 1.1}, ${cx} ${cy - r * 0.35} C ${cx + r * 0.6} ${cy - r * 1.1}, ${cx + r * 1.3} ${cy - r * 0.2}, ${cx} ${cy + r * 0.82} Z" fill="${col}"/>`;
}

function iPulse(x, y, s, col) {
  const cy = y + s * 0.5;
  return `<polyline points="${x + s * 0.06},${cy} ${x + s * 0.24},${cy} ${x + s * 0.38},${cy - s * 0.38} ${x + s * 0.56},${cy + s * 0.38} ${x + s * 0.68},${cy - s * 0.16} ${x + s * 0.78},${cy} ${x + s * 0.94},${cy}" fill="none" stroke="${col}" stroke-width="${s * 0.15}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function iFlame(x, y, s, col = "#EA580C") {
  const cx = x + s * 0.5;
  const cy = y + s * 0.5;
  return `<path d="M ${cx} ${cy - s * 0.46} C ${cx + s * 0.25} ${cy - s * 0.2} ${cx + s * 0.42} ${cy} ${cx + s * 0.38} ${cy + s * 0.2} C ${cx + s * 0.35} ${cy + s * 0.42} ${cx + s * 0.18} ${cy + s * 0.48} ${cx} ${cy + s * 0.48} C ${cx - s * 0.18} ${cy + s * 0.48} ${cx - s * 0.35} ${cy + s * 0.42} ${cx - s * 0.38} ${cy + s * 0.2} C ${cx - s * 0.42} ${cy} ${cx - s * 0.25} ${cy - s * 0.2} ${cx} ${cy - s * 0.46} Z" fill="${col}"/>
<path d="M ${cx} ${cy + s * 0.44} C ${cx + s * 0.12} ${cy + s * 0.44} ${cx + s * 0.18} ${cy + s * 0.3} ${cx + s * 0.14} ${cy + s * 0.16} C ${cx + s * 0.08} ${cy + s * 0.06} ${cx} ${cy - s * 0.04} C ${cx} ${cy - s * 0.04} ${cx - s * 0.08} ${cy + s * 0.06} ${cx - s * 0.14} ${cy + s * 0.16} C ${cx - s * 0.18} ${cy + s * 0.3} ${cx - s * 0.12} ${cy + s * 0.44} ${cx} ${cy + s * 0.44} Z" fill="#FED7AA"/>`;
}

function iDumbbell(x, y, s, col) {
  const cx = x + s * 0.5;
  const cy = y + s * 0.5;
  const sw = s * 0.14;
  return `<g stroke="${col}" stroke-width="${sw}" stroke-linecap="round">
<line x1="${cx - s * 0.34}" y1="${cy}" x2="${cx + s * 0.34}" y2="${cy}"/>
<line x1="${cx - s * 0.28}" y1="${cy - s * 0.22}" x2="${cx - s * 0.28}" y2="${cy + s * 0.22}"/>
<line x1="${cx - s * 0.18}" y1="${cy - s * 0.16}" x2="${cx - s * 0.18}" y2="${cy + s * 0.16}"/>
<line x1="${cx + s * 0.28}" y1="${cy - s * 0.22}" x2="${cx + s * 0.28}" y2="${cy + s * 0.22}"/>
<line x1="${cx + s * 0.18}" y1="${cy - s * 0.16}" x2="${cx + s * 0.18}" y2="${cy + s * 0.16}"/>
</g>`;
}

function iSteps(x, y, s, col) {
  const cx = x + s * 0.5;
  const cy = y + s * 0.5;
  const r = s * 0.44;
  return `<g fill="${col}">
<ellipse cx="${cx - r * 0.38}" cy="${cy + r * 0.15}" rx="${r * 0.26}" ry="${r * 0.42}" transform="rotate(-15 ${cx - r * 0.38} ${cy + r * 0.15})"/>
<ellipse cx="${cx + r * 0.38}" cy="${cy - r * 0.15}" rx="${r * 0.26}" ry="${r * 0.42}" transform="rotate(-15 ${cx + r * 0.38} ${cy - r * 0.15})"/>
<circle cx="${cx - r * 0.38}" cy="${cy + r * 0.65}" r="${r * 0.14}"/>
<circle cx="${cx + r * 0.38}" cy="${cy + r * 0.35}" r="${r * 0.14}"/>
</g>`;
}

function iClock(x, y, s, col) {
  const cx = x + s * 0.5;
  const cy = y + s * 0.5;
  const r = s * 0.42;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${s * 0.13}"/>
<polyline points="${cx},${cy - r * 0.55} ${cx},${cy} ${cx + r * 0.48},${cy}" fill="none" stroke="${col}" stroke-width="${s * 0.13}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function iCalendar(x, y, s, col) {
  const sw = s * 0.12;
  return `<g fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
<rect x="${x + s * 0.14}" y="${y + s * 0.22}" width="${s * 0.72}" height="${s * 0.64}" rx="${s * 0.12}"/>
<line x1="${x + s * 0.14}" y1="${y + s * 0.44}" x2="${x + s * 0.86}" y2="${y + s * 0.44}"/>
<line x1="${x + s * 0.35}" y1="${y + s * 0.12}" x2="${x + s * 0.35}" y2="${y + s * 0.24}"/>
<line x1="${x + s * 0.65}" y1="${y + s * 0.12}" x2="${x + s * 0.65}" y2="${y + s * 0.24}"/>
<circle cx="${x + s * 0.36}" cy="${y + s * 0.6}" r="${s * 0.04}" fill="${col}"/>
<circle cx="${x + s * 0.50}" cy="${y + s * 0.6}" r="${s * 0.04}" fill="${col}"/>
<circle cx="${x + s * 0.64}" cy="${y + s * 0.6}" r="${s * 0.04}" fill="${col}"/>
<circle cx="${x + s * 0.36}" cy="${y + s * 0.74}" r="${s * 0.04}" fill="${col}"/>
<circle cx="${x + s * 0.50}" cy="${y + s * 0.74}" r="${s * 0.04}" fill="${col}"/>
<circle cx="${x + s * 0.64}" cy="${y + s * 0.74}" r="${s * 0.04}" fill="${col}"/>
</g>`;
}

function iBolt(x, y, s, col) {
  return `<polygon points="${x + s * 0.58},${y + s * 0.06} ${x + s * 0.22},${y + s * 0.52} ${x + s * 0.48},${y + s * 0.52} ${x + s * 0.38},${y + s * 0.94} ${x + s * 0.80},${y + s * 0.44} ${x + s * 0.52},${y + s * 0.44}" fill="${col}"/>`;
}

function iGear(x, y, s, col) {
  const cx = x + s * 0.5;
  const cy = y + s * 0.5;
  const r = s * 0.36;
  return `<g fill="none" stroke="${col}" stroke-width="${s * 0.13}" stroke-linecap="round">
<circle cx="${cx}" cy="${cy}" r="${r}"/>
<circle cx="${cx}" cy="${cy}" r="${r * 0.35}" fill="${col}"/>
<line x1="${cx}" y1="${cy - r * 1.35}" x2="${cx}" y2="${cy + r * 1.35}"/>
<line x1="${cx - r * 1.35}" y1="${cy}" x2="${cx + r * 1.35}" y2="${cy}"/>
<line x1="${cx - r * 0.95}" y1="${cy - r * 0.95}" x2="${cx + r * 0.95}" y2="${cy + r * 0.95}"/>
<line x1="${cx - r * 0.95}" y1="${cy + r * 0.95}" x2="${cx + r * 0.95}" y2="${cy - r * 0.95}"/>
</g>`;
}

function iBulb(x, y, s, col) {
  const cx = x + s * 0.5;
  return `<path d="M ${cx} ${y + s * 0.08} C ${x + s * 0.2} ${y + s * 0.08}, ${x + s * 0.12} ${y + s * 0.3}, ${x + s * 0.2} ${y + s * 0.48} C ${x + s * 0.26} ${y + s * 0.6}, ${x + s * 0.36} ${y + s * 0.66}, ${x + s * 0.38} ${y + s * 0.72} L ${x + s * 0.62} ${y + s * 0.72} C ${x + s * 0.64} ${y + s * 0.66}, ${x + s * 0.74} ${y + s * 0.6}, ${x + s * 0.8} ${y + s * 0.48} C ${x + s * 0.88} ${y + s * 0.3}, ${x + s * 0.8} ${y + s * 0.08}, ${cx} ${y + s * 0.08} Z" fill="${col}"/>
<rect x="${x + s * 0.38}" y="${y + s * 0.76}" width="${s * 0.24}" height="${s * 0.07}" rx="${s * 0.035}" fill="${col}"/>
<rect x="${x + s * 0.42}" y="${y + s * 0.86}" width="${s * 0.16}" height="${s * 0.07}" rx="${s * 0.035}" fill="${col}"/>`;
}

function iBrain(x, y, s, col) {
  const sw = s * 0.12;
  return `<g fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
<path d="M ${x + s * 0.5} ${y + s * 0.16} C ${x + s * 0.4} ${y + s * 0.06}, ${x + s * 0.24} ${y + s * 0.08}, ${x + s * 0.22} ${y + s * 0.2} C ${x + s * 0.1} ${y + s * 0.22}, ${x + s * 0.1} ${y + s * 0.38}, ${x + s * 0.18} ${y + s * 0.46} C ${x + s * 0.1} ${y + s * 0.54}, ${x + s * 0.14} ${y + s * 0.7}, ${x + s * 0.26} ${y + s * 0.72} C ${x + s * 0.3} ${y + s * 0.84}, ${x + s * 0.44} ${y + s * 0.88}, ${x + s * 0.5} ${y + s * 0.82} L ${x + s * 0.5} ${y + s * 0.16} Z"/>
<path d="M ${x + s * 0.5} ${y + s * 0.16} C ${x + s * 0.6} ${y + s * 0.06}, ${x + s * 0.76} ${y + s * 0.08}, ${x + s * 0.78} ${y + s * 0.2} C ${x + s * 0.9} ${y + s * 0.22}, ${x + s * 0.9} ${y + s * 0.38}, ${x + s * 0.82} ${y + s * 0.46} C ${x + s * 0.9} ${y + s * 0.54}, ${x + s * 0.86} ${y + s * 0.7}, ${x + s * 0.74} ${y + s * 0.72} C ${x + s * 0.7} ${y + s * 0.84}, ${x + s * 0.56} ${y + s * 0.88}, ${x + s * 0.5} ${y + s * 0.82}"/>
</g>`;
}

function iWaterDrop(x, y, s, col) {
  const cx = x + s * 0.5;
  const cy = y + s * 0.55;
  return `<path d="M ${cx} ${y + s * 0.1} C ${cx} ${y + s * 0.1}, ${cx + s * 0.38} ${cy + s * 0.12}, ${cx + s * 0.38} ${cy + s * 0.22} C ${cx + s * 0.38} ${cy + s * 0.38}, ${cx + s * 0.21} ${cy + s * 0.42}, ${cx} ${cy + s * 0.42} C ${cx - s * 0.21} ${cy + s * 0.42}, ${cx - s * 0.38} ${cy + s * 0.38}, ${cx - s * 0.38} ${cy + s * 0.22} C ${cx - s * 0.38} ${cy + s * 0.12}, ${cx} ${y + s * 0.1}, ${cx} ${y + s * 0.1} Z" fill="${col}"/>`;
}

function iCheckCircle(x, y, s, col = C.greenSoft) {
  const cx = x + s * 0.5;
  const cy = y + s * 0.5;
  const r = s * 0.46;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}"/>
<polyline points="${cx - r * 0.42},${cy} ${cx - r * 0.1},${cy + r * 0.38} ${cx + r * 0.45},${cy - r * 0.36}" fill="none" stroke="#FFFFFF" stroke-width="${s * 0.14}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function iconBadge(x, y, r, bg, iconFn, iconColor, iconScale = 1) {
  const s = r * 1.15 * iconScale;
  return `<circle cx="${x + r}" cy="${y + r}" r="${r}" fill="${bg}"/>${iconFn(x + r - s / 2, y + r - s / 2, s, iconColor)}`;
}

// ─── Dynamic Value & Trend Calculation Helpers ───

// แปลงสตริงระยะเวลา เช่น "9:08 ชม.", "9:08", "7h 25m", "1h 30min" เป็นจำนวนนาที
export function parseDurationMinutes(durStr) {
  if (!durStr) return 0;
  const s = String(durStr).trim();
  const colonMatch = s.match(/(\d+)\s*:\s*(\d+)/);
  if (colonMatch) {
    return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
  }
  const hMatch = s.match(/(\d+)\s*(?:h|hr|ชม\.?|ซม\.?)/i);
  const mMatch = s.match(/(\d+)\s*(?:m|min|นาที)/i);
  if (hMatch || mMatch) {
    const h = hMatch ? parseInt(hMatch[1], 10) : 0;
    const m = mMatch ? parseInt(mMatch[1], 10) : 0;
    return h * 60 + m;
  }
  const dec = parseFloat(s);
  if (!isNaN(dec) && dec > 0 && dec < 24) {
    return Math.round(dec * 60);
  }
  return 0;
}

// จัดรูปแบบนาทีเป็น "H:MM"
export function fmtMinutesToHm(totalMin) {
  if (!totalMin || isNaN(totalMin) || totalMin <= 0) return "0:00";
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

// แยกตัวเลขจากสตริง เช่น "4,315", "51 ms", "0:40", "98%"
export function parseNumeric(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "").trim();
  const timeM = s.match(/^(\d+)\s*:\s*(\d+)/);
  if (timeM) {
    return parseInt(timeM[1], 10) * 60 + parseInt(timeM[2], 10);
  }
  const numM = s.match(/-?[\d.]+/);
  return numM ? parseFloat(numM[0]) : null;
}

// คำนวณ Trend และสถานะเชิงบวก/ลบอย่างแท้จริงจากตัวเลขวันนี้เทียบค่าเปรียบเทียบ
export function calcTrend(todayVal, compareVal, { higherIsBetter = true } = {}) {
  const t = parseNumeric(todayVal);
  const c = parseNumeric(compareVal);
  if (t == null || c == null || t === c) {
    return { trend: "dot", isPositive: true };
  }
  const isUp = t > c;
  const isPositive = higherIsBetter ? isUp : !isUp;
  return {
    trend: isUp ? "up" : "down",
    isPositive,
  };
}

// แยกหัวข้อและคำอธิบายย่อยจากประโยคคำแนะนำอย่างเป็นธรรมชาติ ไม่ตัดคำขาด
export function parseRecommendationStep(text, fallbackTitle = "", fallbackSub = "") {
  if (!text) return { title: fallbackTitle, sub: fallbackSub };
  let raw = String(text).trim().replace(/สักเล็กน้อย$/g, "").trim();
  
  // รูปแบบมีวงเล็บ เช่น "เข้านอนเวลาเดิมทุกวัน (เพื่อเพิ่ม Sleep Consistency)"
  const parenMatch = raw.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    return { title: parenMatch[1].trim(), sub: parenMatch[2].trim() };
  }

  // รูปแบบมีขีดคั่นคั่นกลางคำ (ต้องมีช่องว่าง ไม่ใช่ขีดช่วงตัวเลขเช่น 1-3)
  const dashMatch = raw.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashMatch) {
    return { title: dashMatch[1].trim(), sub: dashMatch[2].trim() };
  }

  // ถ้าประโยคยาวเกิน 20 ตัวอักษร ให้ตัดประโยคแรกเป็น title และส่วนหลังเป็น sub
  if (raw.length > 20) {
    const splitTokens = ["เพื่อเพิ่ม", "เพื่อ", "เพิ่ม", "ช่วย", "เสริม", "เน้น", "ให้อยู่ใน", "วันละ", "ต่อเนื่อง", "โดย", "และ"];
    for (const tok of splitTokens) {
      const idx = raw.indexOf(tok);
      if (idx >= 6 && idx <= 36) {
        let title = raw.slice(0, idx).trim();
        let sub = raw.slice(idx).trim();
        title = title.replace(/\s+(เพิ่ม|เพื่อ|ช่วย|เสริม|และ|เน้น|โดย)$/, "").trim();
        
        // ถ้า sub ยาวเกิน 32 ตัวอักษร ให้ตัดประโยคขยายความรองออก เพื่อความกระชับ สวยงามในการ์ด ไม่ล้นกรอบ
        if (sub.length > 32) {
          const secondSplit = ["ช่วยให้", "เพื่อ", "และ", "โดย"];
          for (const sTok of secondSplit) {
            const sIdx = sub.indexOf(sTok, 8);
            if (sIdx >= 10 && sIdx <= 30) {
              sub = sub.slice(0, sIdx).trim();
              break;
            }
          }
        }

        return {
          title: title || fallbackTitle,
          sub: sub || fallbackSub,
        };
      }
    }
  }

  return { title: raw, sub: fallbackSub };
}

// วงแหวนเกจขนาดใหญ่ (Ring Gauge) ตัวเลขใหญ่ คมชัดระดับพรีเมียม
function ringGauge(cx, cy, r, sw, pct, color, centerText, centerFs, titleText, statusText, statusCol) {
  const p = Math.max(0, Math.min(100, pct)) / 100;
  const circ = 2 * Math.PI * r;
  const dash = circ * p;
  const gap = circ - dash;
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash} ${gap}" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy + centerFs * 0.36}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="${centerFs}" fill="${C.ink}">${esc(centerText)}</text>
    <text x="${cx}" y="${cy + r + 40}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="26" fill="${C.ink}">${esc(titleText)}</text>
    <text x="${cx}" y="${cy + r + 68}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="19" fill="${statusCol}">${esc(statusText)}</text>
  `;
}

// กราฟแท่ง 7 วัน (Bar Chart) แท่งหนา ตัวเลขใหญ่ คมชัด รองรับแกน Y (ticks) และ Gradient
function barChart(x, y, w, h, values, color, {
  valueFmt = (v) => fmt1(v),
  isLastHighlight = true,
  fixedMax = null,
  showYAxis = false,
  yTicks = null,
  barGrad = null,
  peakGrad = null,
} = {}) {
  const rawVals = values.map((v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v)));
  const validVals = rawVals.filter((v) => v !== null);
  const max = fixedMax ? fixedMax : Math.max(...validVals, 1) * 1.25;

  let yAxisW = 0;
  let chartX = x;
  let chartW = w;
  let out = "";

  if (showYAxis) {
    yAxisW = 34;
    chartX = x + yAxisW;
    chartW = w - yAxisW;
    const ticks = yTicks || [100, 75, 50, 25, 0];
    ticks.forEach((tick) => {
      const ty = y + h - (tick / (fixedMax || max)) * h;
      out += `
        <text x="${chartX - 8}" y="${ty + 4}" text-anchor="end" font-family="Kanit" font-weight="600" font-size="13" fill="#94A3B8">${tick}</text>
        <line x1="${chartX}" y1="${ty}" x2="${chartX + chartW}" y2="${ty}" stroke="#E2E8F0" stroke-width="1.2" stroke-dasharray="3 3"/>
      `;
    });
  } else if (yTicks && yTicks.length) {
    yTicks.forEach((tick) => {
      const ty = y + h - (tick / (fixedMax || max)) * h;
      out += `<line x1="${chartX}" y1="${ty}" x2="${chartX + chartW}" y2="${ty}" stroke="#E2E8F0" stroke-width="1.2" stroke-dasharray="3 3"/>`;
    });
  }

  const n = rawVals.length;
  const slot = chartW / n;
  const bw = Math.min(54, slot * 0.58);

  for (let i = 0; i < n; i++) {
    const v = rawVals[i];
    const bx = chartX + i * slot + (slot - bw) / 2;
    if (v === null) {
      out += `
        <line x1="${(bx + 4).toFixed(1)}" y1="${(y + h - 6).toFixed(1)}" x2="${(bx + bw - 4).toFixed(1)}" y2="${(y + h - 6).toFixed(1)}" stroke="${C.border}" stroke-width="2"/>
        <text x="${(bx + bw / 2).toFixed(1)}" y="${(y + h - 14).toFixed(1)}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="16" fill="${C.muted}">-</text>
      `;
      continue;
    }
    const bh = Math.max(4, (v / (fixedMax || max)) * h);
    const by = y + h - bh;
    const isPeak = validVals.length > 0 && v === Math.max(...validVals);
    const isLast = isLastHighlight && i === n - 1;

    let fillCol = color;
    if (barGrad) {
      fillCol = (isLast || isPeak) && peakGrad ? peakGrad : barGrad;
    } else {
      fillCol = isLast || isPeak ? color : `${color}DD`;
    }

    out += `
      <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw}" height="${bh.toFixed(1)}" rx="6" fill="${fillCol}"/>
      <text x="${(bx + bw / 2).toFixed(1)}" y="${(by - 10).toFixed(1)}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="19" fill="${C.ink}">${esc(valueFmt(v))}</text>
    `;
  }
  return out;
}

// Label วันใต้กราฟ (Day + Date) เช่น "Sat" / "05" - ตัวใหญ่ คมชัด
function dayLabelSvg(labels, x, y, w, highlightLast = true) {
  if (!labels || !labels.length) return "";
  const n = labels.length;
  const slot = w / n;
  let out = "";
  for (let i = 0; i < n; i++) {
    const parts = String(labels[i] || "").split(" ");
    const cx = x + i * slot + slot / 2;
    const isLast = highlightLast && i === n - 1;
    const col = isLast ? C.ink : C.sub;
    const wt = isLast ? 800 : 700;
    if (parts.length === 2) {
      out += `<text x="${cx.toFixed(1)}" y="${y}" text-anchor="middle" font-family="Kanit" font-weight="${wt}" font-size="16" fill="${col}">${esc(parts[0])}</text>`;
      out += `<text x="${cx.toFixed(1)}" y="${y + 18}" text-anchor="middle" font-family="Kanit" font-weight="${wt}" font-size="16" fill="${col}">${esc(parts[1])}</text>`;
    } else {
      out += `<text x="${cx.toFixed(1)}" y="${y}" text-anchor="middle" font-family="Kanit" font-weight="${wt}" font-size="16" fill="${col}">${esc(labels[i])}</text>`;
    }
  }
  return out;
}

// กราฟเส้นเดี่ยว + จุดค่า (Line Chart) เส้นหนา จุดใหญ่ ตัวเลขดำชัด
function lineChart(x, y, w, h, values, { color = C.blue, valueFmt = (v) => String(Math.round(v)) } = {}) {
  const vals = values.filter((v) => isNum(v));
  const raw = values.map((v) => (isNum(v) ? v : null));
  const n = raw.length;
  const px = (i) => x + (w * i) / Math.max(n - 1, 1);

  let out = "";
  [0.3, 0.7].forEach((pct) => {
    const gy = y + h * pct;
    out += `<line x1="${x}" y1="${gy.toFixed(1)}" x2="${x + w}" y2="${gy.toFixed(1)}" stroke="#E2E8F0" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  });

  if (vals.length < 2) {
    raw.forEach((v, i) => {
      const cx = px(i);
      out += `
        <line x1="${(cx - 8).toFixed(1)}" y1="${(y + h - 6).toFixed(1)}" x2="${(cx + 8).toFixed(1)}" y2="${(y + h - 6).toFixed(1)}" stroke="${C.border}" stroke-width="2"/>
        <text x="${cx.toFixed(1)}" y="${(y + h - 12).toFixed(1)}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="14" fill="${C.muted}">-</text>
      `;
    });
    return out;
  }

  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const pad = (max - min) * 0.25 || 2;
  min = Math.max(0, min - pad);
  max += pad * 1.5;
  const py = (v) => y + h - ((v - min) / (max - min)) * h;

  const pts = raw.map((v, i) => (v == null ? null : `${px(i).toFixed(1)},${py(v).toFixed(1)}`));
  let path = "";
  let started = false;
  for (const p of pts) {
    if (p == null) {
      started = false;
      continue;
    }
    path += started ? ` L ${p}` : `M ${p}`;
    started = true;
  }
  out += `<path d="${path}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  raw.forEach((v, i) => {
    const cx = px(i);
    if (v == null) {
      out += `
        <line x1="${(cx - 8).toFixed(1)}" y1="${(y + h - 6).toFixed(1)}" x2="${(cx + 8).toFixed(1)}" y2="${(y + h - 6).toFixed(1)}" stroke="${C.border}" stroke-width="2"/>
        <text x="${cx.toFixed(1)}" y="${(y + h - 12).toFixed(1)}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="14" fill="${C.muted}">-</text>
      `;
      return;
    }
    out += `
      <circle cx="${px(i).toFixed(1)}" cy="${py(v).toFixed(1)}" r="6" fill="#FFFFFF" stroke="${color}" stroke-width="3.5"/>
      <text x="${px(i).toFixed(1)}" y="${(py(v) - 10).toFixed(1)}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="15" fill="${C.ink}">${esc(valueFmt(v))}</text>
    `;
  });
  return out;
}

function fmtHour(h) {
  if (!isNum(h)) return "";
  const totalMin = Math.round(h * 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hrs}:${String(mins).padStart(2, "0")}`;
}

// กราฟเส้นคู่ (Dual Line Chart: Sleep Duration vs Sleep Needed)
function dualLineChart(x, y, w, h, durVals, needVals) {
  const all = [...durVals, ...needVals].filter(isNum);
  if (all.length < 2) return "";
  let min = Math.min(...all);
  let max = Math.max(...all);
  const pad = (max - min) * 0.35 || 1.5;
  min = Math.max(0, min - pad);
  max += pad * 1.8;
  const n = durVals.length;
  const px = (i) => x + (w * i) / (n - 1);
  const py = (v) => y + h - ((v - min) / (max - min)) * h;

  let out = "";
  // Guidelines เส้นประแนวนอน 3 เส้น
  [0.2, 0.5, 0.8].forEach((pct) => {
    const gy = y + h * pct;
    out += `<line x1="${x}" y1="${gy.toFixed(1)}" x2="${x + w}" y2="${gy.toFixed(1)}" stroke="#E2E8F0" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  });

  // Path 1: Duration (Green) - ตัดเส้นหากเป็น null
  let pDur = "";
  let startedDur = false;
  durVals.forEach((v, i) => {
    if (v == null || !isNum(v)) {
      startedDur = false;
      return;
    }
    pDur += startedDur ? ` L ${px(i).toFixed(1)},${py(v).toFixed(1)}` : `M ${px(i).toFixed(1)},${py(v).toFixed(1)}`;
    startedDur = true;
  });

  // Path 2: Needed (Teal / Cyan) - ตัดเส้นหากเป็น null
  let pNeed = "";
  let startedNeed = false;
  needVals.forEach((v, i) => {
    if (v == null || !isNum(v)) {
      startedNeed = false;
      return;
    }
    pNeed += startedNeed ? ` L ${px(i).toFixed(1)},${py(v).toFixed(1)}` : `M ${px(i).toFixed(1)},${py(v).toFixed(1)}`;
    startedNeed = true;
  });

  out += `
    <path d="${pNeed}" fill="none" stroke="#0284C7" stroke-width="2.6" stroke-dasharray="5 4" stroke-linecap="round"/>
    <path d="${pDur}" fill="none" stroke="${C.greenSoft}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  `;

  for (let i = 0; i < n; i++) {
    const dVal = durVals[i];
    const nVal = needVals[i];
    const cx = px(i);

    if ((dVal == null || !isNum(dVal)) && (nVal == null || !isNum(nVal))) {
      out += `
        <line x1="${(cx - 8).toFixed(1)}" y1="${(y + h - 6).toFixed(1)}" x2="${(cx + 8).toFixed(1)}" y2="${(y + h - 6).toFixed(1)}" stroke="${C.border}" stroke-width="2"/>
        <text x="${cx.toFixed(1)}" y="${(y + h - 14).toFixed(1)}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="16" fill="${C.muted}">-</text>
      `;
      continue;
    }

    // Needed point
    if (nVal != null && isNum(nVal)) {
      const cyNeed = py(nVal);
      out += `<circle cx="${cx.toFixed(1)}" cy="${cyNeed.toFixed(1)}" r="4.5" fill="#0284C7"/>`;
      const isDurHigher = isNum(dVal) && dVal >= nVal;
      const needTextY = isDurHigher ? cyNeed + 18 : cyNeed - 10;
      out += `<text x="${cx.toFixed(1)}" y="${needTextY.toFixed(1)}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="13" fill="#0284C7">${fmtHour(nVal)}</text>`;
    }

    // Duration point
    if (dVal != null && isNum(dVal)) {
      const cyDur = py(dVal);
      out += `<circle cx="${cx.toFixed(1)}" cy="${cyDur.toFixed(1)}" r="6" fill="#FFFFFF" stroke="${C.greenSoft}" stroke-width="3.5"/>`;
      const isDurHigher = !isNum(nVal) || dVal >= nVal;
      const durTextY = isDurHigher ? cyDur - 10 : cyDur + 22;
      out += `<text x="${cx.toFixed(1)}" y="${durTextY.toFixed(1)}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="14.5" fill="${C.ink}">${fmtHour(dVal)}</text>`;
    }
  }

  return out;
}

// กราฟแท่งมินิ (Mini Bars) สำหรับ Recovery 7 วัน
function miniBars(x, y, w, h, values, color = C.greenSoft) {
  const validVals = values.filter((v) => isNum(v));
  const max = validVals.length ? Math.max(...validVals, 1) * 1.25 : 100;
  const n = values.length;
  const slot = w / n;
  const bw = Math.min(26, slot * 0.6);
  let out = "";
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const bx = x + i * slot + (slot - bw) / 2;
    if (v == null || !isNum(v)) {
      out += `
        <line x1="${(bx + 2).toFixed(1)}" y1="${(y + h - 6).toFixed(1)}" x2="${(bx + bw - 2).toFixed(1)}" y2="${(y + h - 6).toFixed(1)}" stroke="${C.border}" stroke-width="2"/>
        <text x="${(bx + bw / 2).toFixed(1)}" y="${(y + h - 12).toFixed(1)}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="14" fill="${C.muted}">-</text>
      `;
      continue;
    }
    const bh = (v / max) * h;
    const warn = v < 60;
    out += `
      <rect x="${bx.toFixed(1)}" y="${(y + h - bh).toFixed(1)}" width="${bw}" height="${Math.max(bh, 3).toFixed(1)}" rx="4" fill="${warn ? C.amberSoft : color}"/>
      <text x="${(bx + bw / 2).toFixed(1)}" y="${(y + h - bh - 8).toFixed(1)}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="15" fill="${C.ink}">${Math.round(v)}%</text>
    `;
  }
  return out;
}

// ประมาณความกว้างข้อความเพื่อวางไอคอนลูกศรติดกับตัวเลขอย่างสวยงาม
function estimateTextWidth(str, fs = 28) {
  let w = 0;
  for (const ch of String(str)) {
    if (ch === "%") w += fs * 0.85;
    else if (/[0-9]/.test(ch)) w += fs * 0.60;
    else if (/[A-Za-z]/.test(ch)) w += fs * 0.54;
    else if (/[\u0E00-\u0E7F]/.test(ch)) w += fs * 0.58;
    else if (/[:.\s]/.test(ch)) w += fs * 0.32;
    else w += fs * 0.5;
  }
  return w;
}

// กล่อง Pill Box สำหรับข้อความสรุปเปรียบเทียบมุมขวาบน
function comparisonPillBox(x, y, w, h, textLines) {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#F8FAFC" stroke="${C.border}" stroke-width="1.2"/>`;
  if (textLines.length === 1) {
    out += `<text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="14.5" fill="${C.sub}">${esc(textLines[0])}</text>`;
  } else if (textLines.length >= 2) {
    out += `<text x="${x + w / 2}" y="${y + 26}" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="14" fill="${C.sub}">${esc(textLines[0])}</text>`;
    out += `<text x="${x + w / 2}" y="${y + 48}" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="14" fill="${C.muted}">${esc(textLines[1])}</text>`;
  }
  return out;
}

// การ์ด Metric Tile พร้อมไอคอน ตัวเลขใหญ่ คมชัดระดับพรีเมียม (ขาวคลีน ไอคอนคมชัด ลูกศรติดตัวเลข)
function metricTile(x, y, w, h, { label, value, compare = "", icon = null, accent = C.blue, trend = null, isPositive = true }) {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2"/>`;
  let labelX = x + 16;
  if (icon) {
    out += icon(x + 16, y + 16, 20, accent);
    labelX = x + 44;
  }
  const labelFs = w < 160 ? 13.5 : 15;
  out += `<text x="${labelX}" y="${y + 32}" font-family="Kanit" font-weight="700" font-size="${labelFs}" fill="${C.sub}">${esc(label)}</text>`;
  
  // Value + Dynamic Trend arrow right beside the value
  const valStr = String(value ?? "-");
  const valFs = w < 160 ? 24 : 28;
  const valY = compare ? y + h - 40 : y + h - 32;
  out += `<text x="${x + 16}" y="${valY}" font-family="Kanit" font-weight="800" font-size="${valFs}" fill="${C.ink}">${esc(valStr)}</text>`;
  
  const arrowCol = isPositive ? C.greenSoft : (trend === "up" ? C.amberSoft : "#F59E0B");
  const valW = estimateTextWidth(valStr, valFs);
  const arrowX = Math.min(x + w - 22, x + 16 + valW + 10);
  const arrowY = valY - valFs * 0.32;
  const as = 12;

  if (trend === "up") {
    out += `<polygon points="${arrowX},${arrowY + as * 0.4} ${arrowX + as * 0.5},${arrowY - as * 0.5} ${arrowX + as},${arrowY + as * 0.4}" fill="${arrowCol}"/>`;
  } else if (trend === "down") {
    out += `<polygon points="${arrowX},${arrowY - as * 0.5} ${arrowX + as * 0.5},${arrowY + as * 0.4} ${arrowX + as},${arrowY - as * 0.5}" fill="${arrowCol}"/>`;
  } else if (trend === "dot") {
    out += `<circle cx="${arrowX + 5}" cy="${arrowY}" r="4" fill="${C.faint}"/>`;
  }

  if (compare) {
    out += `<text x="${x + 16}" y="${y + h - 16}" font-family="Kanit" font-weight="600" font-size="13.5" fill="#64748B">${esc(compare)}</text>`;
  }
  return out;
}

// การ์ด 5 Metric Tiles ของ Body Load (Page 2 Card A) ตาม Mockup อ้างอิง
function bodyLoadMetricTile(x, y, w, h, { label1, label2 = "", value, compare = "", icon = null, accent = C.ink, trend = null, isPositive = true }) {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2"/>`;
  const cx = x + w / 2;
  if (label2) {
    out += `<text x="${cx}" y="${y + 19}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="12.5" fill="${C.sub}">${esc(label1)}</text>`;
    out += `<text x="${cx}" y="${y + 33}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="12.5" fill="${C.sub}">${esc(label2)}</text>`;
  } else {
    out += `<text x="${cx}" y="${y + 26}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="13.5" fill="${C.sub}">${esc(label1)}</text>`;
  }

  const iconY = label2 ? y + 43 : y + 36;
  const isize = 18;
  if (icon) {
    const ix = cx - isize / 2;
    out += icon(ix, iconY, isize, accent);
  }

  if (trend === "up") {
    const arrowCol = isPositive ? C.greenSoft : C.amberSoft;
    out += `<polygon points="${cx + 14},${iconY + 14} ${cx + 19},${iconY + 4} ${cx + 24},${iconY + 14}" fill="${arrowCol}"/>`;
  } else if (trend === "down") {
    const arrowCol = isPositive ? C.greenSoft : C.rose;
    out += `<polygon points="${cx + 14},${iconY + 4} ${cx + 19},${iconY + 14} ${cx + 24},${iconY + 4}" fill="${arrowCol}"/>`;
  } else if (trend === "dot") {
    out += `<circle cx="${cx + 18}" cy="${iconY + 9}" r="3.5" fill="#94A3B8"/>`;
  }

  const valStr = String(value ?? "-");
  const valY = compare ? y + h - 34 : y + h - 22;
  out += `<text x="${cx}" y="${valY}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="25" fill="${C.ink}">${esc(valStr)}</text>`;

  if (compare) {
    out += `<text x="${cx}" y="${y + h - 14}" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="12.5" fill="#64748B">${esc(compare)}</text>`;
  }
  return out;
}

// การ์ด Metric Tile พร้อมวงกลมไอคอนพาสเทล (Recovery 3 ใบ & Sleep 4 ใบ) ตาม Mockup
function badgeMetricTile(x, y, w, h, { label, value, compare = "", icon = null, iconBg = "#F1F5F9", iconColor = C.ink, trend = null, isPositive = true, centerLayout = false }) {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2"/>`;
  const valStr = String(value ?? "-");

  if (!centerLayout) {
    const cx = x + 34;
    const cy = y + h / 2;
    const r = 20;
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${iconBg}"/>`;
    if (icon) {
      out += icon(cx - 10, cy - 10, 20, iconColor);
    }
    const tx = x + 66;
    out += `<text x="${tx}" y="${y + 28}" font-family="Kanit" font-weight="700" font-size="14.5" fill="${C.sub}">${esc(label)}</text>`;
    out += `<text x="${tx}" y="${y + 60}" font-family="Kanit" font-weight="800" font-size="28" fill="${C.ink}">${esc(valStr)}</text>`;

    const arrowCol = isPositive ? C.greenSoft : (trend === "up" ? C.amberSoft : C.rose);
    const valW = estimateTextWidth(valStr, 28);
    const arrowX = tx + valW + 8;
    const arrowY = y + 50;
    const as = 12;
    if (trend === "up") {
      out += `<polygon points="${arrowX},${arrowY + as * 0.4} ${arrowX + as * 0.5},${arrowY - as * 0.5} ${arrowX + as},${arrowY + as * 0.4}" fill="${arrowCol}"/>`;
    } else if (trend === "down") {
      out += `<polygon points="${arrowX},${arrowY - as * 0.5} ${arrowX + as * 0.5},${arrowY + as * 0.4} ${arrowX + as},${arrowY - as * 0.5}" fill="${arrowCol}"/>`;
    } else if (trend === "dot") {
      out += `<circle cx="${arrowX + 4}" cy="${arrowY}" r="3.5" fill="#94A3B8"/>`;
    }

    if (compare) {
      out += `<text x="${tx}" y="${y + 82}" font-family="Kanit" font-weight="600" font-size="13" fill="#64748B">${esc(compare)}</text>`;
    }
  } else {
    const cx = x + w / 2;
    out += `<text x="${cx}" y="${y + 24}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="13.5" fill="${C.sub}">${esc(label)}</text>`;
    
    const cy = y + 50;
    const r = 15;
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${iconBg}"/>`;
    if (icon) {
      out += icon(cx - 8, cy - 8, 16, iconColor);
    }

    const valFs = 24;
    const valW = estimateTextWidth(valStr, valFs);
    const arrowCol = isPositive ? C.greenSoft : (trend === "up" ? C.amberSoft : C.rose);
    const as = 11;

    if (trend === "up" || trend === "down") {
      const totalW = valW + 16;
      const startX = cx - totalW / 2;
      out += `<text x="${startX}" y="${y + 88}" font-family="Kanit" font-weight="800" font-size="${valFs}" fill="${C.ink}">${esc(valStr)}</text>`;
      const arrowX = startX + valW + 6;
      const arrowY = y + 79;
      if (trend === "up") {
        out += `<polygon points="${arrowX},${arrowY + as * 0.4} ${arrowX + as * 0.5},${arrowY - as * 0.5} ${arrowX + as},${arrowY + as * 0.4}" fill="${arrowCol}"/>`;
      } else {
        out += `<polygon points="${arrowX},${arrowY - as * 0.5} ${arrowX + as * 0.5},${arrowY + as * 0.4} ${arrowX + as},${arrowY - as * 0.5}" fill="${arrowCol}"/>`;
      }
    } else {
      out += `<text x="${cx}" y="${y + 88}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="${valFs}" fill="${C.ink}">${esc(valStr)}</text>`;
    }

    if (compare) {
      out += `<text x="${cx}" y="${y + 108}" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="12" fill="#64748B">${esc(compare)}</text>`;
    }
  }
  return out;
}

// ─── Data Normalization ───
export function normalizeWeeklyData(aiData = {}) {
  const ov = aiData.overview || {};
  const act = aiData.activity || {};
  const slp = aiData.sleep || {};
  const days = Array.isArray(aiData.days) && aiData.days.length ? aiData.days : null;

  const fallbackDays = () => {
    const th = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      arr.push(`${th[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}`);
    }
    return arr;
  };

  const pickSeries = (s, n = 7) => {
    const arr = (Array.isArray(s) ? s : []).map((v) => (v == null || v === "" ? null : Number(v)));
    return arr.length ? arr.slice(-n) : [];
  };

  // คำนวณค่าสรุปเปรียบเทียบ dynamic เมื่อ AI ไม่ได้ส่ง compare string มา
  const blSeries = pickSeries(act.bodyLoadSeries);
  const blToday = isNum(act.bodyLoadToday) ? act.bodyLoadToday : (blSeries.length ? blSeries[blSeries.length - 1] : 6.9);
  const blMax = blSeries.length ? Math.max(...blSeries.filter(isNum)) : blToday;
  const dynBodyLoadCompare = act.bodyLoadCompare || (blToday < blMax
    ? `ต่ำกว่าวันที่หนักสุดของสัปดาห์ (${fmt1(blMax)}) ร่างกายไม่ล้าสะสม`
    : `อยู่ในระดับสูงสุดของสัปดาห์ (${fmt1(blToday)}) ควรให้เวลาฟื้นตัว`);

  const recSeries = pickSeries(act.recoverySeries, 7);
  const recAvg = recSeries.length ? Math.round(recSeries.reduce((a, b) => a + (b || 0), 0) / recSeries.length) : 70;
  const dynRecoveryCompare = act.recoveryCompare || ((act.recoveryPercent || 71) >= recAvg
    ? `สูงกว่าค่าเฉลี่ยสัปดาห์ (${recAvg}%) ร่างกายฟื้นตัวได้ดี`
    : `ต่ำกว่าค่าเฉลี่ยสัปดาห์ (${recAvg}%) ควรพักผ่อนเพิ่มเติม`);

  const qSeries = pickSeries(slp.qualitySeries);
  const qAvg = qSeries.length ? Math.round(qSeries.reduce((a, b) => a + (b || 0), 0) / qSeries.length) : 80;
  const dynQualityCompare = slp.qualityCompare || ((slp.qualityPercent || 98) >= qAvg
    ? `สูงกว่าค่าเฉลี่ยสัปดาห์ (${qAvg}%) การนอนมีคุณภาพดีต่อเนื่อง`
    : `ต่ำกว่าค่าเฉลี่ยสัปดาห์ (${qAvg}%) ควรปรับสภาพแวดล้อมห้องนอน`);

  const formatCompare = (val) => (val ? `(จาก ${String(val).replace(/^\(จาก\s*|\)$/g, "")})` : "");

  return {
    appName: aiData.appName || "Kieslect App",
    reportDate: currentThaiDate(),
    days: days || fallbackDays(),
    overview: {
      bodyLoad: isNum(ov.bodyLoad) ? ov.bodyLoad : (isNum(act.bodyLoadToday) ? act.bodyLoadToday : 6.9),
      bodyLoadLabel: ov.bodyLoadLabel || act.bodyLoadStatus || "ระดับปานกลาง",
      recoveryPercent: isNum(ov.recoveryPercent) ? ov.recoveryPercent : (isNum(act.recoveryPercent) ? act.recoveryPercent : 71),
      sleepQualityPercent: isNum(ov.sleepQualityPercent) ? ov.sleepQualityPercent : (isNum(slp.qualityPercent) ? slp.qualityPercent : 98),
      summary: ov.summary || "สัปดาห์นี้ร่างกายของคุณมีสมดุลที่ดี ทั้งกิจกรรม การฟื้นตัว และการนอนหลับอยู่ในเกณฑ์ที่น่าพอใจ ควรรักษาความสม่ำเสมอของการออกกำลังกายและการนอนหลับอย่างต่อเนื่องนะคะ",
      highlights: Array.isArray(ov.highlights) && ov.highlights.length ? ov.highlights.filter(Boolean).slice(0, 3) : [
        "รู้ร่างกายของคุณ",
        "เข้าใจแนวโน้มสุขภาพ",
        "ตัดสินใจได้ดีขึ้นในทุกวัน",
      ],
      firstSteps: Array.isArray(ov.firstSteps) && ov.firstSteps.length ? ov.firstSteps.filter(Boolean).slice(0, 3) : [
        "ออกกำลังกายได้ตามปกติ (เน้น Zone 1-3)",
        "รักษาเวลานอนให้สม่ำเสมอ (เพื่อเพิ่ม Sleep Consistency)",
        "ดูแลสมดุลชีวิต (ทั้งกิจกรรม พักผ่อน และโภชนาการ)",
      ],
      headline: ov.headline || "",
    },
    activity: {
      bodyLoadToday: isNum(act.bodyLoadToday) ? act.bodyLoadToday : 6.9,
      bodyLoadStatus: act.bodyLoadStatus || "ระดับปานกลาง",
      bodyLoadCompare: dynBodyLoadCompare,
      bodyLoadSeries: blSeries.length ? blSeries : [7.3, 13.1, 6.1, 7.5, 7.1, 6.0, 6.9],
      hrZone13Today: act.hrZone13Today || "0:00",
      hrZone13Compare: formatCompare(act.hrZone13Compare),
      hrZone45Today: act.hrZone45Today || "0:00",
      hrZone45Compare: formatCompare(act.hrZone45Compare),
      strengthToday: act.strengthToday || "0:00",
      strengthCompare: formatCompare(act.strengthCompare),
      stepsToday: act.stepsToday || "-",
      stepsCompare: formatCompare(act.stepsCompare),
      caloriesToday: act.caloriesToday || "-",
      caloriesCompare: formatCompare(act.caloriesCompare),
      recoveryPercent: isNum(act.recoveryPercent) ? act.recoveryPercent : 71,
      recoveryStatus: act.recoveryStatus || "ดี",
      recoveryCompare: dynRecoveryCompare,
      hrvToday: act.hrvToday || "-",
      hrvCompare: formatCompare(act.hrvCompare),
      rhrToday: act.rhrToday || "-",
      rhrCompare: formatCompare(act.rhrCompare),
      sleepPerformanceToday: act.sleepPerformanceToday || "-",
      sleepPerformanceCompare: formatCompare(act.sleepPerformanceCompare),
      hrvSeries: pickSeries(act.hrvSeries).length ? pickSeries(act.hrvSeries) : [48, 47, 46, 52, 56, 50, 51],
      rhrSeries: pickSeries(act.rhrSeries).length ? pickSeries(act.rhrSeries) : [56, 60, 62, 57, 59, 59, 56],
      recoverySeries: recSeries.length ? recSeries : [67, 59, 56, 73, 75, 65, 71],
      aiInsight: act.aiInsight || "กิจกรรมที่เหมาะสมและการนอนหลับที่มีคุณภาพ ช่วยให้ร่างกายฟื้นตัวได้อย่างเต็มที่ พร้อมสำหรับวันใหม่ค่ะ",
      tips: act.tips || "รักษาระดับกิจกรรมในโซนที่เหมาะสม และหลีกเลี่ยงการเพิ่มความหนักต่อเนื่อง เพื่อให้ร่างกายฟื้นตัวได้อย่างเต็มที่นะคะ",
    },
    sleep: {
      qualityPercent: isNum(slp.qualityPercent) ? slp.qualityPercent : 98,
      qualityStatus: slp.qualityStatus || "ดีมาก",
      qualityCompare: dynQualityCompare,
      qualitySeries: qSeries.length ? qSeries : [73, 59, 84, 82, 84, 88, 98],
      durationToday: slp.durationToday || "8:00 ชม.",
      durationNote: slp.durationNote || "",
      efficiencyPercent: isNum(slp.efficiencyPercent) ? slp.efficiencyPercent : 95,
      consistencyPercent: isNum(slp.consistencyPercent) ? slp.consistencyPercent : 50,
      highStressPercent: isNum(slp.highStressPercent) ? slp.highStressPercent : 5,
      stageLightPercent: isNum(slp.stageLightPercent) ? slp.stageLightPercent : 60,
      stageDeepPercent: isNum(slp.stageDeepPercent) ? slp.stageDeepPercent : 20,
      stageRemPercent: isNum(slp.stageRemPercent) ? slp.stageRemPercent : 20,
      stageLightTime: slp.stageLightTime || "",
      stageDeepTime: slp.stageDeepTime || "",
      stageRemTime: slp.stageRemTime || "",
      stageAwakePercent: isNum(slp.stageAwakePercent) ? slp.stageAwakePercent : null,
      stageAwakeTime: slp.stageAwakeTime || "",
      stageNote: slp.stageNote || "",
      restorativeSleep: slp.restorativeSleep || "2:00 ชม.",
      restorativeCompare: slp.restorativeCompare || "",
      hoursVsNeededSeries: pickSeries(slp.hoursVsNeededSeries).length ? pickSeries(slp.hoursVsNeededSeries) : [7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0],
      hoursNeededSeries: pickSeries(slp.hoursNeededSeries).length ? pickSeries(slp.hoursNeededSeries) : [8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0],
      consistencySeries: pickSeries(slp.consistencySeries).length ? pickSeries(slp.consistencySeries) : [50, 50, 50, 50, 50, 50, 50],
      aiInsight: slp.aiInsight || "การจัดสรรเวลานอนและตื่นให้เป็นเวลาสม่ำเสมอ ช่วยเสริมสร้างประสิทธิภาพการพักผ่อนและการฟื้นฟูของเซลล์ในร่างกายค่ะ",
      tips: slp.tips || "รักษาเวลาเข้านอนและตื่นให้สม่ำเสมอ แม้ในวันหยุด และลดสิ่งรบกวนก่อนนอน เพื่อให้ร่างกายฟื้นตัวได้เต็มที่นะคะ",
    },
  };
}

// ─── Header & Chrome ───
function brandHeaderTop(reportDate, { isTranslucent = false } = {}) {
  const pad = 44;
  const sub = esc(activeWeeklyConfig.headerSubtitle || "AI HEALTH INTELLIGENCE");
  const kieLogo = getKieslectLogoBase64();
  const bioLogo = getBiokoopLogoBase64();

  let brandMarkup = "";
  const lineCol = isTranslucent ? "rgba(148, 163, 184, 0.45)" : C.border;

  if (kieLogo && bioLogo) {
    const kieW = 118;
    const kieH = 27;
    const divX = pad + kieW + 14;
    const bioX = divX + 14;
    const bioW = 144;
    const bioH = 15;
    brandMarkup = `
      <image href="data:image/png;base64,${kieLogo}" x="${pad}" y="28" width="${kieW}" height="${kieH}" preserveAspectRatio="xMinYMid meet"/>
      <line x1="${divX}" y1="26" x2="${divX}" y2="56" stroke="${lineCol}" stroke-width="1.4"/>
      <image href="data:image/png;base64,${bioLogo}" x="${bioX}" y="28" width="${bioW}" height="${bioH}" preserveAspectRatio="xMinYMid meet"/>
      <text x="${bioX + 1}" y="53" font-family="Kanit" font-weight="600" font-size="10" letter-spacing="1.8" fill="${isTranslucent ? '#334155' : C.faint}">${sub}</text>
    `;
  } else {
    const brand = esc(activeWeeklyConfig.brandTitle || "BIOKOOP");
    brandMarkup = `
      <g transform="translate(${pad}, 32)">
        <rect x="0" y="8" width="10" height="10" rx="2" transform="rotate(45 5 13)" fill="${C.rose}"/>
        <text x="18" y="21" font-family="Kanit" font-weight="800" font-size="22" letter-spacing="1.5" fill="${C.ink}">KIESLECT</text>
        <line x1="144" y1="4" x2="144" y2="24" stroke="${lineCol}" stroke-width="1.5"/>
        <text x="160" y="16" font-family="Kanit" font-weight="800" font-size="20" letter-spacing="1" fill="${C.ink}">${brand}</text>
        <text x="160" y="28" font-family="Kanit" font-weight="600" font-size="10" letter-spacing="1.5" fill="${isTranslucent ? '#334155' : C.faint}">${sub}</text>
      </g>
    `;
  }

  return `
    ${brandMarkup}
    <text x="${W - pad}" y="46" text-anchor="end" font-family="Kanit" font-weight="700" font-size="16" fill="${isTranslucent ? '#1E293B' : C.sub}">Health Report</text>
    <text x="${W - pad}" y="68" text-anchor="end" font-family="Kanit" font-weight="600" font-size="15" fill="${isTranslucent ? '#475569' : C.muted}">${esc(reportDate)}</text>
    ${isTranslucent ? "" : `<line x1="${pad}" y1="88" x2="${W - pad}" y2="88" stroke="${lineCol}" stroke-width="1.2"/>`}
  `;
}

function pageHeader(pageNo, titleTh, titleEn, tagline1, tagline2, accent, reportDate) {
  const pad = 44;
  return `
    <rect width="${W}" height="100%" fill="#FFFFFF"/>
    <rect width="${W}" height="6" fill="${accent}"/>
    ${brandHeaderTop(reportDate)}
    
    <!-- Page Title Row -->
    <circle cx="${pad + 24}" cy="132" r="24" fill="${accent}"/>
    <text x="${pad + 24}" y="141" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="26" fill="#FFFFFF">${pageNo}</text>

    <text x="${pad + 64}" y="128" font-family="Kanit" font-weight="800" font-size="26" fill="${C.ink}">${esc(titleTh)}</text>
    <text x="${pad + 64}" y="152" font-family="Kanit" font-weight="700" font-size="14" letter-spacing="1.5" fill="${accent}">${esc(titleEn)}</text>

    <text x="${W - pad}" y="126" text-anchor="end" font-family="Kanit" font-weight="700" font-size="12" letter-spacing="1.2" fill="${C.muted}">${esc(tagline1)}</text>
    <text x="${W - pad}" y="144" text-anchor="end" font-family="Kanit" font-weight="700" font-size="12" letter-spacing="1.2" fill="${C.muted}">${esc(tagline2)}</text>
  `;
}

function svgDoc(body, height = PAGE_H, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" font-family="Kanit">
<defs>
<style>
  text { font-family: 'Kanit', sans-serif; font-variant-numeric: tabular-nums; }
  .tnum { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
</style>
<filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
  <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#0F172A" flood-opacity="0.05"/>
</filter>
<linearGradient id="aiBadgeGrad" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#2563EB"/>
  <stop offset="100%" stop-color="#38BDF8"/>
</linearGradient>
<linearGradient id="heroTextFade" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.94"/>
  <stop offset="38%" stop-color="#FFFFFF" stop-opacity="0.88"/>
  <stop offset="65%" stop-color="#FFFFFF" stop-opacity="0.45"/>
  <stop offset="85%" stop-color="#FFFFFF" stop-opacity="0.12"/>
  <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
<linearGradient id="headerGlassFade" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.80"/>
  <stop offset="60%" stop-color="#FFFFFF" stop-opacity="0.40"/>
  <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
<linearGradient id="heroBottomFade" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="35%" stop-color="#FFFFFF" stop-opacity="0.25"/>
  <stop offset="65%" stop-color="#FFFFFF" stop-opacity="0.70"/>
  <stop offset="90%" stop-color="#FFFFFF" stop-opacity="0.95"/>
  <stop offset="100%" stop-color="#FFFFFF" stop-opacity="1"/>
</linearGradient>
<linearGradient id="purpleBarGrad" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#C4B5FD"/>
  <stop offset="100%" stop-color="#8B5CF6"/>
</linearGradient>
<linearGradient id="purpleBarPeakGrad" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#8B5CF6"/>
  <stop offset="100%" stop-color="#6D28D9"/>
</linearGradient>
<linearGradient id="cyanPurpleGrad" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#A78BFA"/>
  <stop offset="100%" stop-color="#7C3AED"/>
</linearGradient>
<linearGradient id="blueBarGrad" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#38BDF8"/>
  <stop offset="100%" stop-color="#0284C7"/>
</linearGradient>
<linearGradient id="greenBarGrad" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#4ADE80"/>
  <stop offset="100%" stop-color="#16A34A"/>
</linearGradient>
${defs}
</defs>
${body}
</svg>`;
}

// ═══════════════════════════════════════════════════════════
// PAGE 1 — OVERVIEW (ภาพรวมสุขภาพ)
// ═══════════════════════════════════════════════════════════
export function renderWeeklyOverviewPage(d) {
  const pad = 44;
  const cw = W - pad * 2;
  const ov = d.overview;

  let out = `<rect width="${W}" height="100%" fill="#FFFFFF"/>`;

  // 1. Hero Vista Image + Overlay + Typography
  // ภาพวิวละลายกลืนเป็นสีขาว 100% อย่างนุ่มนวลก่อนถึง Card 1 ไร้รอยตัดขาดด้านข้างหรือใต้การ์ด
  const showHero = activeWeeklyConfig.visibility?.showHeroImage !== false;
  const heroBase64 = showHero ? getHeroBase64() : "";
  const card1Y = 570; // Card 1 เริ่มที่ y=570 บนพื้นหลังขาวคลีนบริสุทธิ์
  const card1H = 430;
  const heroH = card1Y; // ภาพวิวและ gradient จบลงที่ y=570 พอดี กลืนเป็นสีขาว 100%

  if (heroBase64) {
    out += `<image href="data:image/jpeg;base64,${heroBase64}" x="0" y="0" width="${W}" height="${heroH}" preserveAspectRatio="xMidYMin slice"/>`;
    // Translucent header glass overlay over mountain sky (fade smoothly to y=120 without hard cut)
    out += `<rect x="0" y="0" width="${W}" height="120" fill="url(#headerGlassFade)"/>`;
  } else {
    out += `<rect x="0" y="0" width="${W}" height="${heroH}" fill="#F8FAFC"/>`;
  }

  // Gradients for text contrast & bottom blend:
  // heroTextFade เริ่มตั้งแต่ y=0 เชื่อมเนียนสนิทกับ header ไม่มีรอยตัดขอบ y=88
  out += `<rect x="0" y="0" width="680" height="${card1Y}" fill="url(#heroTextFade)"/>`;
  // heroBottomFade ไล่เฉดสีขาวเนียนกว้าง 220px (y=350 ถึง 570) สู่สีขาวบริสุทธิ์ 100% ไร้รอยตัดใดๆ
  out += `<rect x="0" y="350" width="${W}" height="${heroH - 350}" fill="url(#heroBottomFade)"/>`;

  // Render header on top of the translucent glass layer
  out += brandHeaderTop(d.reportDate, { isTranslucent: !!heroBase64 });

  // Hero Text (Left side)
  out += `
    <text x="${pad}" y="195" font-family="Kanit" font-weight="800" font-size="48" fill="${C.ink}">ร่างกายของคุณวันนี้</text>
    <text x="${pad}" y="253" font-family="Kanit" font-weight="800" font-size="48" fill="${C.ink}">เป็นอย่างไร?</text>
    <text x="${pad}" y="305" font-family="Kanit" font-weight="500" font-size="20" fill="${C.sub}">มากกว่าตัวเลข คือความเข้าใจที่ช่วยให้คุณ</text>
    <text x="${pad}" y="335" font-family="Kanit" font-weight="500" font-size="20" fill="${C.sub}">ใช้ชีวิตได้ดีขึ้นในทุกวัน</text>
  `;

  // Script Callout + Green Checkmarks (Far Right side over sky) — Dynamic from highlights
  out += `
    <g transform="translate(680, 150)">
      <text x="0" y="0" font-family="'Brush Script MT', 'Segoe Script', cursive, Kanit" font-style="italic" font-weight="700" font-size="25" fill="#0F172A" letter-spacing="0.5" stroke="#FFFFFF" stroke-width="3" paint-order="stroke fill">Small Changes</text>
      <text x="0" y="27" font-family="'Brush Script MT', 'Segoe Script', cursive, Kanit" font-style="italic" font-weight="700" font-size="25" fill="#0F172A" letter-spacing="0.5" stroke="#FFFFFF" stroke-width="3" paint-order="stroke fill">Make a Healthier You</text>
    </g>
  `;
  const checks = Array.isArray(ov.highlights) && ov.highlights.length
    ? ov.highlights.slice(0, 3)
    : [
        "รู้ร่างกายของคุณ",
        "เข้าใจแนวโน้มสุขภาพ",
        "ตัดสินใจได้ดีขึ้นในทุกวัน",
      ];
  let chY = 208;
  checks.forEach((item) => {
    const wrapped = wrapLines(item, 270, 15);
    out += iCheckCircle(680, chY - 14, 22, C.greenSoft);
    if (wrapped.length > 1) {
      out += `<text x="712" y="${chY - 2}" font-family="Kanit" font-weight="600" font-size="14" fill="${C.ink}" stroke="#FFFFFF" stroke-width="3" paint-order="stroke fill">${esc(wrapped[0])}</text>`;
      out += `<text x="712" y="${chY + 16}" font-family="Kanit" font-weight="600" font-size="14" fill="${C.ink}" stroke="#FFFFFF" stroke-width="3" paint-order="stroke fill">${esc(wrapped[1])}</text>`;
      chY += 38;
    } else {
      out += `<text x="712" y="${chY + 3}" font-family="Kanit" font-weight="600" font-size="15" fill="${C.ink}" stroke="#FFFFFF" stroke-width="3" paint-order="stroke fill">${esc(wrapped[0] || item)}</text>`;
      chY += 34;
    }
  });

  // 2. Card: TODAY'S HEALTH OVERVIEW (ภาพรวมสุขภาพวันนี้)
  out += `
    <rect x="${pad}" y="${card1Y}" width="${cw}" height="${card1H}" rx="26" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2" filter="url(#softShadow)"/>
    <text x="${pad + 36}" y="${card1Y + 48}" font-family="Kanit" font-weight="800" font-size="26" fill="${C.ink}">ภาพรวมสุขภาพวันนี้</text>
    <text x="${pad + 36}" y="${card1Y + 76}" font-family="Kanit" font-weight="700" font-size="14" letter-spacing="1.5" fill="${C.muted}">TODAY'S HEALTH OVERVIEW</text>
  `;

  // 3 Gauges: Body Load, Recovery, Sleep Quality — Dynamic status & colors
  const gy = card1Y + 210;
  const r = 78;
  const sw = 18;
  const g1x = pad + cw * 0.18;
  const g2x = pad + cw * 0.50;
  const g3x = pad + cw * 0.82;

  const blVal = isNum(ov.bodyLoad) ? fmt1(ov.bodyLoad) : "6.9";
  const blPct = ((num(blVal) || 6.9) / 15) * 100;
  const recVal = isNum(ov.recoveryPercent) ? `${Math.round(ov.recoveryPercent)}%` : "71%";
  const recPct = num(recVal) || 71;
  const slpVal = isNum(ov.sleepQualityPercent) ? `${Math.round(ov.sleepQualityPercent)}%` : "98%";
  const slpPct = num(slpVal) || 98;

  const shortenGaugeStatus = (str, fallback) => {
    if (!str) return fallback;
    const s = String(str).trim();
    if (s.includes("ดีเยี่ยม")) return "ฟื้นตัวดีเยี่ยม";
    if (s.includes("ดีมาก")) return "ดีมาก";
    if (s.includes("ดี")) return "ระดับดี";
    if (s.includes("สมดุล")) return "ระดับสมดุล";
    if (s.includes("พอใช้") || s.includes("ปานกลาง")) return "ระดับปานกลาง";
    if (s.includes("ล้า") || s.includes("พัก")) return "ควรพักผ่อน";
    const firstWord = s.split(" ")[0];
    return firstWord.length <= 12 ? firstWord : firstWord.slice(0, 11) + "…";
  };

  const blStatus = cleanStatusLabel(ov.bodyLoadLabel, "ระดับปานกลาง", "general");
  const recStatus = cleanStatusLabel(d.activity && d.activity.recoveryStatus, recPct >= 70 ? "ฟื้นตัวดี" : (recPct >= 50 ? "ระดับปานกลาง" : "ต้องฟื้นฟู"), "recovery");
  const recColor = recPct >= 70 ? C.green : (recPct >= 50 ? C.amberSoft : C.rose);

  const slpStatus = cleanStatusLabel(d.sleep && d.sleep.qualityStatus, slpPct >= 85 ? "ดีมาก" : (slpPct >= 70 ? "ระดับดี" : "ระดับปานกลาง"), "sleep");
  const slpColor = slpPct >= 70 ? C.purpleDark : C.amberSoft;

  out += ringGauge(g1x, gy, r, sw, blPct, C.blue, blVal, 62, "ภาระร่างกาย", blStatus, C.blue);
  out += ringGauge(g2x, gy, r, sw, recPct, C.greenSoft, recVal, 62, "Recovery", recStatus, recColor);
  out += ringGauge(g3x, gy, r, sw, slpPct, C.purple, slpVal, 62, "Sleep Quality", slpStatus, slpColor);

  // 3. Card: AI Insight — Dynamic Headline
  const card2Y = card1Y + card1H + 25; // 570 + 430 + 25 = 1025
  let aiHeadline = ov.headline;
  if (!aiHeadline) {
    if (recPct >= 75) {
      aiHeadline = "วันนี้ร่างกายของคุณอยู่ในสภาวะพร้อมและฟื้นตัวได้ดีค่ะ";
    } else if (recPct >= 55) {
      aiHeadline = "วันนี้ร่างกายอยู่ในระดับสมดุล พร้อมทำกิจกรรมทั่วไปค่ะ";
    } else {
      aiHeadline = "วันนี้ร่างกายต้องการการพักผ่อนเพิ่มเติมเพื่อฟื้นฟูค่ะ";
    }
  }

  // ปรับความกว้างข้อความให้สมดุล มีระยะขอบขวาพอดี (~55-60px) ไม่ชิดขอบการ์ดและไม่ห่างเกินไป
  const aiTextW = cw - 130; // 992 - 130 = 862px (ซ้าย pad+82 = 126, ข้อความจบที่ ~980px, การ์ดจบที่ 1036 -> ขอบขวา ~56px สมดุลกำลังดี)
  const headLines = wrapLines(aiHeadline, aiTextW, 24);
  const sumLines = wrapLines(ov.summary, aiTextW, 20);
  const card2H = headLines.length > 1 || sumLines.length > 3 ? 235 : 225;

  out += `
    <rect x="${pad}" y="${card2Y}" width="${cw}" height="${card2H}" rx="24" fill="${C.greenLight}" stroke="${C.greenBorder}" stroke-width="1.2" filter="url(#softShadow)"/>
    
    <!-- AI badge icon -->
    <circle cx="${pad + 44}" cy="${card2Y + 44}" r="24" fill="url(#aiBadgeGrad)"/>
    <text x="${pad + 44}" y="${card2Y + 52}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="20" fill="#FFFFFF">AI</text>

    <text x="${pad + 82}" y="${card2Y + 38}" font-family="Kanit" font-weight="800" font-size="19" fill="#15803D">AI Insight</text>
  `;
  if (headLines.length > 1) {
    out += linesSvg(headLines.slice(0, 2), pad + 82, card2Y + 65, 29, 23.5, C.ink, 800);
    out += linesSvg(sumLines.slice(0, 3), pad + 82, card2Y + 128, 29, 19.5, C.ink, 500);
  } else {
    out += `<text x="${pad + 82}" y="${card2Y + 68}" font-family="Kanit" font-weight="800" font-size="24.5" fill="${C.ink}">${esc(headLines[0] || aiHeadline)}</text>`;
    out += linesSvg(sumLines.slice(0, 4), pad + 82, card2Y + 108, 29, 19.5, C.ink, 500);
  }

  // 4. Section: คำแนะนำสำหรับวันนี้ (3 Cards) — Dynamic from firstSteps
  const recY = card2Y + card2H + 30;
  out += `<text x="${pad}" y="${recY}" font-family="Kanit" font-weight="800" font-size="25" fill="${C.ink}">${esc("คำแนะนำสำหรับวันนี้")}</text>`;

  const pillY = recY + 28;
  const pillGap = 16;
  const pillW = (cw - pillGap * 2) / 3;
  const pillH = 90;

  const rawSteps = Array.isArray(ov.firstSteps) && ov.firstSteps.length ? ov.firstSteps : [];
  const p1Data = parseRecommendationStep(rawSteps[0], "ออกกำลังกายได้ตามปกติ", "เน้น Zone 1–3");
  const p2Data = parseRecommendationStep(rawSteps[1], "รักษาเวลานอนให้สม่ำเสมอ", "เพื่อเพิ่ม Sleep Consistency");
  const p3Data = parseRecommendationStep(rawSteps[2], "ดูแลสมดุลชีวิต", "ทั้งกิจกรรม พักผ่อน และโภชนาการ");

  const pills = [
    { ...p1Data, icon: iRunner, bg: "#DCFCE7", accent: C.greenSoft },
    { ...p2Data, icon: iMoon, bg: "#F3E8FF", accent: C.purple },
    { ...p3Data, icon: iWaterDrop, bg: "#E0F2FE", accent: C.blue },
  ];

  pills.forEach((p, idx) => {
    const px = pad + idx * (pillW + pillGap);
    out += `
      <rect x="${px}" y="${pillY}" width="${pillW}" height="${pillH}" rx="18" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2" filter="url(#softShadow)"/>
    `;
    // Circular pastel icon badge on the left (จัดตำแหน่งให้ลงตัว)
    const iconR = 19;
    const iconCx = px + 30;
    const iconCy = pillY + pillH / 2;
    out += `
      <circle cx="${iconCx}" cy="${iconCy}" r="${iconR}" fill="${p.bg}"/>
      ${p.icon(iconCx - 10, iconCy - 10, 20, p.accent)}
    `;

    // Title & subtitle on the right (เว้นระยะขอบขวาไม่น้อยกว่า 24px ไม่ชิดขอบโค้งมน)
    const tx = px + 58;
    const textW = pillW - 84; // 320 - 84 = 236px (tx + textW = px + 294 -> ขอบขวาเหลือ 26px สวยงาม)
    const titleLines = wrapLines(p.title, textW, 14);
    const subLines = p.sub ? wrapLines(p.sub, textW, 12) : [];

    if (subLines.length > 0) {
      if (titleLines.length === 1 && subLines.length === 1) {
        out += `<text x="${tx}" y="${pillY + 38}" font-family="Kanit" font-weight="700" font-size="14.5" fill="${C.ink}">${esc(titleLines[0])}</text>`;
        out += `<text x="${tx}" y="${pillY + 62}" font-family="Kanit" font-weight="500" font-size="12" fill="${C.muted}">${esc(subLines[0])}</text>`;
      } else if (titleLines.length === 1 && subLines.length >= 2) {
        out += `<text x="${tx}" y="${pillY + 30}" font-family="Kanit" font-weight="700" font-size="14" fill="${C.ink}">${esc(titleLines[0])}</text>`;
        out += `<text x="${tx}" y="${pillY + 50}" font-family="Kanit" font-weight="500" font-size="11.5" fill="${C.muted}">${esc(subLines[0])}</text>`;
        out += `<text x="${tx}" y="${pillY + 68}" font-family="Kanit" font-weight="500" font-size="11.5" fill="${C.muted}">${esc(subLines[1])}</text>`;
      } else {
        out += `<text x="${tx}" y="${pillY + 28}" font-family="Kanit" font-weight="700" font-size="13.5" fill="${C.ink}">${esc(titleLines[0])}</text>`;
        out += `<text x="${tx}" y="${pillY + 46}" font-family="Kanit" font-weight="700" font-size="13.5" fill="${C.ink}">${esc(titleLines[1] || "")}</text>`;
        out += `<text x="${tx}" y="${pillY + 68}" font-family="Kanit" font-weight="500" font-size="11.5" fill="${C.muted}">${esc(subLines[0])}</text>`;
      }
    } else {
      if (titleLines.length > 1) {
        out += `<text x="${tx}" y="${pillY + 38}" font-family="Kanit" font-weight="700" font-size="14.5" fill="${C.ink}">${esc(titleLines[0])}</text>`;
        out += `<text x="${tx}" y="${pillY + 62}" font-family="Kanit" font-weight="700" font-size="14.5" fill="${C.ink}">${esc(titleLines[1])}</text>`;
      } else {
        out += `<text x="${tx}" y="${pillY + 52}" font-family="Kanit" font-weight="700" font-size="15" fill="${C.ink}">${esc(titleLines[0] || p.title)}</text>`;
      }
    }
  });

  // 5. Quote & Brand Footer — วางในตำแหน่งสมดุลสวยงาม
  const quoteY = 1570;
  out += `
    <text x="${W / 2}" y="${quoteY}" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="20" fill="${C.ink}">“ข้อมูลที่เชื่อมโยงกัน ช่วยให้คุณเข้าใจร่างกาย และดูแลตัวเองได้ดีขึ้นในทุกวัน”</text>
    <line x1="${pad}" y1="1630" x2="${W - pad}" y2="1630" stroke="${C.border}" stroke-width="1.2"/>

    <g transform="translate(${pad}, 1675)">
      <rect x="0" y="2" width="12" height="12" rx="2" fill="${C.rose}"/>
      <text x="22" y="14" font-family="Kanit" font-weight="700" font-size="15" fill="${C.sub}">Kieslect ${esc(activeWeeklyConfig.brandTitle || "Biokoop")} | Sport • Health • Smart Living</text>
    </g>
  `;

  return svgDoc(out, PAGE_H);
}

// ═══════════════════════════════════════════════════════════
// PAGE 2 — ACTIVITY & RECOVERY (กิจกรรมและการฟื้นตัวของร่างกาย)
// ═══════════════════════════════════════════════════════════
export function renderWeeklyActivityPage(d) {
  const pad = 44;
  const cw = W - pad * 2;
  const a = d.activity;

  let out = pageHeader(2, "กิจกรรมและการฟื้นตัวของร่างกาย", "ACTIVITY & RECOVERY", "WHAT YOU DO", "SHAPES HOW YOU RECOVER", C.blue, d.reportDate);

  // ── Card A: Body Load ──
  const cardAY = 185;
  const cardAH = 495;
  out += `<rect x="${pad}" y="${cardAY}" width="${cw}" height="${cardAH}" rx="24" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2" filter="url(#softShadow)"/>`;
  out += iconBadge(pad + 24, cardAY + 24, 24, C.blue, iRunner, "#FFFFFF", 1);

  // Dynamic comparison note (up to 2 lines in a rounded pill box)
  const blCompLines = wrapLines(a.bodyLoadCompare, 195, 13.5);
  const pillW = 230;
  const pillH = 68;
  const pillX = pad + cw - pillW - 24;

  out += `
    <text x="${pad + 84}" y="${cardAY + 42}" font-family="Kanit" font-weight="800" font-size="26" fill="${C.ink}">Body Load</text>
    <text x="${pad + 84}" y="${cardAY + 62}" font-family="Kanit" font-weight="500" font-size="14" fill="${C.muted}">วันนี้คุณใช้ร่างกายหนักแค่ไหน</text>
    <text x="${pad + 84}" y="${cardAY + 80}" font-family="Kanit" font-weight="600" font-size="13" fill="${C.blue}">${esc(a.bodyLoadStatus || 'ระดับปานกลาง')}</text>

    <!-- Metric big number (right side, before pill box) -->
    <text x="${pillX - 24}" y="${cardAY + 64}" text-anchor="end" font-family="Kanit" font-weight="800" font-size="52" fill="${C.ink}">${esc(fmt1(a.bodyLoadToday))}</text>
    
    <!-- Far right comparison pill box -->
    ${comparisonPillBox(pillX, cardAY + 22, pillW, pillH, blCompLines)}
  `;

  // 7-day bar chart
  out += `<text x="${pad + 24}" y="${cardAY + 106}" font-family="Kanit" font-weight="800" font-size="18" fill="${C.ink}">Body Load (7 วันย้อนหลัง)</text>`;
  out += barChart(pad + 24, cardAY + 128, cw - 48, 140, a.bodyLoadSeries, C.blueBar, {
    barGrad: "url(#blueBarGrad)",
  });
  out += dayLabelSvg(d.days.slice(-a.bodyLoadSeries.length), pad + 24, cardAY + 294, cw - 48);

  // 5 Metric Tiles — Dynamic trends & positive/negative evaluation
  const tilesRowY = cardAY + 348;
  const tGap = 12;
  const tW = (cw - 48 - tGap * 4) / 5;
  const tH = 118;

  const calVal = a.caloriesToday && a.caloriesToday !== "-" ? a.caloriesToday : "247";
  const calComp = a.caloriesCompare || "";

  const blTiles = [
    { label1: "Heart Rate", label2: "Zone 1-3", value: a.hrZone13Today, compare: a.hrZone13Compare, icon: iHeart, accent: C.rose, trend: null },
    { label1: "Heart Rate", label2: "Zone 4-5", value: a.hrZone45Today, compare: a.hrZone45Compare, icon: iHeart, accent: C.rose, trend: null },
    { label1: "Strength", label2: "Training", value: a.strengthToday, compare: a.strengthCompare, icon: iDumbbell, accent: C.ink, trend: null },
    { label1: "Steps", label2: "", value: a.stepsToday, compare: a.stepsCompare, icon: iSteps, accent: C.blue, trend: "up", isPositive: true },
    { label1: "Calories", label2: "", value: calVal, compare: calComp, icon: iFlame, accent: "#EA580C", trend: "dot" },
  ];
  blTiles.forEach((t, i) => {
    out += bodyLoadMetricTile(pad + 24 + i * (tW + tGap), tilesRowY, tW, tH, t);
  });

  // ── Card B: Recovery ──
  const cardBY = 700;
  const cardBH = 560;
  out += `<rect x="${pad}" y="${cardBY}" width="${cw}" height="${cardBH}" rx="24" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2" filter="url(#softShadow)"/>`;
  out += iconBadge(pad + 24, cardBY + 24, 24, C.greenSoft, iLeaf, "#FFFFFF", 1);

  // Dynamic recovery comparison note (up to 2 lines in a rounded pill box)
  const recCompLines = wrapLines(a.recoveryCompare, 195, 13.5);

  out += `
    <text x="${pad + 84}" y="${cardBY + 42}" font-family="Kanit" font-weight="800" font-size="26" fill="${C.ink}">Recovery</text>
    <text x="${pad + 84}" y="${cardBY + 62}" font-family="Kanit" font-weight="500" font-size="14" fill="${C.muted}">วันนี้ร่างกายฟื้นตัวพร้อมแค่ไหน</text>
    <text x="${pad + 84}" y="${cardBY + 80}" font-family="Kanit" font-weight="600" font-size="13" fill="${C.greenSoft}">${esc(a.recoveryStatus || 'ฟื้นตัวดี')}</text>

    <!-- Metric big number (right side, before pill box) -->
    <text x="${pillX - 24}" y="${cardBY + 64}" text-anchor="end" font-family="Kanit" font-weight="800" font-size="52" fill="${C.greenSoft}">${Math.round(a.recoveryPercent)}%</text>

    <!-- Far right comparison pill box -->
    ${comparisonPillBox(pillX, cardBY + 22, pillW, pillH, recCompLines)}
  `;

  // 3 Metric Tiles: HRV, Resting Heart Rate, Sleep Performance — Dynamic trends & pastel badges
  const recRowY = cardBY + 96;
  const rGap = 16;
  const rW = (cw - 48 - rGap * 2) / 3;
  const rH = 100;

  const hrvTrend = calcTrend(a.hrvToday, a.hrvCompare, { higherIsBetter: true });
  const rhrTrend = calcTrend(a.rhrToday, a.rhrCompare, { higherIsBetter: false }); // อัตราหัวใจพักต่ำลงคือผลดี!
  const slpPerfTrend = calcTrend(a.sleepPerformanceToday, a.sleepPerformanceCompare, { higherIsBetter: true });

  const rTiles = [
    { label: "HRV", value: a.hrvToday, compare: a.hrvCompare, icon: iPulse, iconBg: "#E0F2FE", iconColor: C.blue, trend: hrvTrend.trend, isPositive: hrvTrend.isPositive },
    { label: "Resting Heart Rate", value: a.rhrToday, compare: a.rhrCompare, icon: iHeart, iconBg: "#FFE4E6", iconColor: C.rose, trend: rhrTrend.trend, isPositive: rhrTrend.isPositive },
    { label: "Sleep Performance", value: a.sleepPerformanceToday, compare: a.sleepPerformanceCompare, icon: iMoon, iconBg: "#F3E8FF", iconColor: C.purple, trend: slpPerfTrend.trend, isPositive: slpPerfTrend.isPositive },
  ];
  rTiles.forEach((t, i) => {
    out += badgeMetricTile(pad + 24 + i * (rW + rGap), recRowY, rW, rH, t);
  });

  // 3 Mini Charts
  const chartRowY = recRowY + rH + 30;
  const mH = 135;
  // 1. HRV Line
  out += `<text x="${pad + 24}" y="${chartRowY}" font-family="Kanit" font-weight="800" font-size="17" fill="${C.ink}">HRV (ms)</text>`;
  out += lineChart(pad + 24, chartRowY + 16, rW, mH, a.hrvSeries, { color: C.blue });
  out += dayLabelSvg(d.days.slice(-a.hrvSeries.length), pad + 24, chartRowY + mH + 28, rW);

  // 2. RHR Line
  const x2 = pad + 24 + rW + rGap;
  out += `<text x="${x2}" y="${chartRowY}" font-family="Kanit" font-weight="800" font-size="16" fill="${C.ink}">อัตราการเต้นของหัวใจขณะพัก (bpm)</text>`;
  out += lineChart(x2, chartRowY + 16, rW, mH, a.rhrSeries, { color: C.blueDark });
  out += dayLabelSvg(d.days.slice(-a.rhrSeries.length), x2, chartRowY + mH + 28, rW);

  // 3. Recovery Bar
  const x3 = pad + 24 + (rW + rGap) * 2;
  out += `<text x="${x3}" y="${chartRowY}" font-family="Kanit" font-weight="800" font-size="16" fill="${C.ink}">การฟื้นตัว (%)</text>`;
  out += miniBars(x3, chartRowY + 16, rW, mH, a.recoverySeries, C.greenSoft);
  out += dayLabelSvg(d.days.slice(-a.recoverySeries.length), x3, chartRowY + mH + 28, rW);

  // ── Card C: AI Insight ──
  const cardCY = 1280;
  const cardCH = 160;
  out += `
    <rect x="${pad}" y="${cardCY}" width="${cw}" height="${cardCH}" rx="22" fill="${C.greenLight}" stroke="${C.greenBorder}" stroke-width="1.2" filter="url(#softShadow)"/>
    ${iconBadge(pad + 20, cardCY + 20, 22, C.greenSoft, iBrain, "#FFFFFF", 0.9)}
    <text x="${pad + 74}" y="${cardCY + 38}" font-family="Kanit" font-weight="800" font-size="19" fill="#15803D">AI Insight – Activity &amp; Recovery</text>
  `;
  const actLines = wrapLines(a.aiInsight, cw - 125, 19);
  out += linesSvg(actLines.slice(0, 3), pad + 74, cardCY + 72, 28, 19, C.ink, 500);

  // ── Card D: Tips ──
  const cardDY = 1460;
  const cardDH = 140;
  out += `
    <rect x="${pad}" y="${cardDY}" width="${cw}" height="${cardDH}" rx="22" fill="${C.greenLight}" stroke="${C.greenBorder}" stroke-width="1.2" filter="url(#softShadow)"/>
    ${iconBadge(pad + 20, cardDY + 20, 22, C.greenSoft, iBulb, "#FFFFFF", 0.85)}
    <text x="${pad + 74}" y="${cardDY + 38}" font-family="Kanit" font-weight="800" font-size="19" fill="#15803D">${esc("คำแนะนำ")}</text>
  `;
  const tipLines = wrapLines(a.tips, cw - 125, 19);
  out += linesSvg(tipLines.slice(0, 2), pad + 74, cardDY + 72, 28, 19, C.ink, 500);

  // Footer
  const bioLogo = getBiokoopLogoBase64();
  let footerBrand = "";
  if (bioLogo) {
    footerBrand = `
      <image href="data:image/png;base64,${bioLogo}" x="${W - pad - 120}" y="1704" width="120" height="12.5" preserveAspectRatio="xMaxYMid meet"/>
      <text x="${W - pad}" y="1728" text-anchor="end" font-family="Kanit" font-weight="600" font-size="9.5" letter-spacing="1.5" fill="${C.faint}">${esc(activeWeeklyConfig.footerSub || "AI HEALTH INTELLIGENCE")}</text>
    `;
  } else {
    footerBrand = `
      <g transform="translate(${W - pad}, 1720)">
        <text x="0" y="0" text-anchor="end" font-family="Kanit" font-weight="800" font-size="18" fill="${C.ink}">${esc(activeWeeklyConfig.brandTitle || "BIOKOOP")}</text>
        <text x="0" y="14" text-anchor="end" font-family="Kanit" font-weight="600" font-size="10" letter-spacing="1.5" fill="${C.faint}">${esc(activeWeeklyConfig.footerSub || "AI HEALTH INTELLIGENCE")}</text>
      </g>
    `;
  }

  out += `
    <line x1="${pad}" y1="1640" x2="${W - pad}" y2="1640" stroke="${C.border}" stroke-width="1.2"/>
    <text x="${W / 2}" y="1680" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="20" fill="${C.ink}">${esc(activeWeeklyConfig.footerQuote || "“เข้าใจร่างกายวันนี้ เพื่อพรุ่งนี้ที่ดีกว่า”")}</text>
    ${footerBrand}
  `;

  return svgDoc(out, PAGE_H);
}

// ═══════════════════════════════════════════════════════════
// PAGE 3 — SLEEP ANALYSIS (คุณภาพการนอนและการพักฟื้น)
// ═══════════════════════════════════════════════════════════
export function renderWeeklySleepPage(d) {
  const pad = 44;
  const cw = W - pad * 2;
  const s = d.sleep;

  let out = pageHeader(3, "คุณภาพการนอนและการพักฟื้น", "SLEEP ANALYSIS", "BETTER SLEEP", "A STRONGER YOU", C.purple, d.reportDate);

  // ── Card A: Sleep Quality ──
  const cardAY = 185;
  const cardAH = 495;
  out += `<rect x="${pad}" y="${cardAY}" width="${cw}" height="${cardAH}" rx="24" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2" filter="url(#softShadow)"/>`;
  out += iconBadge(pad + 24, cardAY + 24, 24, C.purple, iMoon, "#FFFFFF", 1);

  // Dynamic comparison note (up to 2 lines in a rounded pill box)
  const qCompLines = wrapLines(s.qualityCompare, 195, 13.5);
  const pillW = 230;
  const pillH = 68;
  const pillX = pad + cw - pillW - 24;

  out += `
    <text x="${pad + 84}" y="${cardAY + 42}" font-family="Kanit" font-weight="800" font-size="26" fill="${C.ink}">Sleep Quality</text>
    <text x="${pad + 84}" y="${cardAY + 66}" font-family="Kanit" font-weight="500" font-size="15" fill="${C.muted}">คุณภาพโดยรวมของการนอน</text>

    <!-- Metric & Status (End-aligned safely before pill box) -->
    <text x="${pillX - 24}" y="${cardAY + 52}" text-anchor="end" font-family="Kanit" font-weight="800" font-size="52" fill="${C.purpleDark}">${Math.round(s.qualityPercent)}%</text>
    <text x="${pillX - 24}" y="${cardAY + 76}" text-anchor="end" font-family="Kanit" font-weight="700" font-size="16" fill="${C.purpleDark}">${esc(cleanStatusLabel(s.qualityStatus, 'ดีมาก', 'sleep'))}</text>

    <!-- Far right comparison pill box -->
    ${comparisonPillBox(pillX, cardAY + 22, pillW, pillH, qCompLines)}
  `;

  // 7-day purple bar chart with Y-axis & Dashed Guidelines
  out += `<text x="${pad + 24}" y="${cardAY + 106}" font-family="Kanit" font-weight="800" font-size="18" fill="${C.ink}">Sleep Quality (7 วันย้อนหลัง)</text>`;
  const yAxisW = 34;
  out += barChart(pad + 24, cardAY + 128, cw - 48, 140, s.qualitySeries, C.purpleBar, {
    valueFmt: (v) => `${Math.round(v)}%`,
    showYAxis: true,
    fixedMax: 100,
    yTicks: [100, 75, 50, 25, 0],
    barGrad: "url(#purpleBarGrad)",
    peakGrad: "url(#purpleBarPeakGrad)",
  });
  out += dayLabelSvg(d.days.slice(-s.qualitySeries.length), pad + 24 + yAxisW, cardAY + 294, cw - 48 - yAxisW);

  // 4 Metric Tiles — Dynamic trends & evaluations
  const tilesRowY = cardAY + 348;
  const tGap = 12;
  const tW = (cw - 48 - tGap * 3) / 4;
  const tH = 120;

  const durTrend = calcTrend(s.durationToday, s.durationNote, { higherIsBetter: true });
  const effTrend = calcTrend(s.efficiencyPercent, 90, { higherIsBetter: true });
  const avgConsistency = s.consistencySeries.length ? (s.consistencySeries.reduce((a, b) => a + (b || 0), 0) / s.consistencySeries.length) : 50;
  const conTrend = calcTrend(s.consistencyPercent, avgConsistency, { higherIsBetter: true });
  const stressTrend = calcTrend(s.highStressPercent, 10, { higherIsBetter: false }); // ความเครียดขณะหลับต่ำคือดี

  const tiles = [
    { label: "Sleep Duration", value: s.durationToday, compare: s.durationNote, icon: iClock, iconBg: "#E0F2FE", iconColor: C.blue, trend: durTrend.trend, isPositive: durTrend.isPositive, centerLayout: true },
    { label: "Sleep Efficiency", value: `${Math.round(s.efficiencyPercent)}%`, compare: "", icon: iGear, iconBg: "#E0F2FE", iconColor: C.blueDark, trend: effTrend.trend, isPositive: effTrend.isPositive, centerLayout: true },
    { label: "Sleep Consistency", value: `${Math.round(s.consistencyPercent)}%`, compare: "", icon: iCalendar, iconBg: "#F3E8FF", iconColor: C.purple, trend: conTrend.trend, isPositive: conTrend.isPositive, centerLayout: true },
    { label: "High Sleep Stress", value: `${Math.round(s.highStressPercent)}%`, compare: "", icon: iBolt, iconBg: "#F3E8FF", iconColor: C.purpleDark, trend: stressTrend.trend, isPositive: stressTrend.isPositive, centerLayout: true },
  ];
  tiles.forEach((t, i) => {
    out += badgeMetricTile(pad + 24 + i * (tW + tGap), tilesRowY, tW, tH, t);
  });

  // ── Card B: Sleep Stage & Restorative Sleep ──
  const cardBY = 700;
  const cardBH = 235;
  out += `<rect x="${pad}" y="${cardBY}" width="${cw}" height="${cardBH}" rx="24" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2" filter="url(#softShadow)"/>`;
  out += `<text x="${pad + 24}" y="${cardBY + 36}" font-family="Kanit" font-weight="800" font-size="19" fill="${C.ink}">สัดส่วนการนอนหลับ (เมื่อคืน)</text>`;

  // Dynamic Sleep Stage Durations calculated from total sleep duration and percentages or direct values
  const totalSleepMin = parseDurationMinutes(s.durationToday) || (8 * 60);
  const totStage = (s.stageLightPercent || 0) + (s.stageDeepPercent || 0) + (s.stageRemPercent || 0) || 100;
  const lightMin = Math.round(totalSleepMin * ((s.stageLightPercent || 0) / totStage));
  const deepMin = Math.round(totalSleepMin * ((s.stageDeepPercent || 0) / totStage));
  const remMin = Math.max(0, totalSleepMin - lightMin - deepMin);
  const lightHm = s.stageLightTime || fmtMinutesToHm(lightMin);
  const deepHm = s.stageDeepTime || fmtMinutesToHm(deepMin);
  const remHm = s.stageRemTime || fmtMinutesToHm(remMin);

  // Segmented Bar (Left)
  const barW = cw - 300;
  const barH = 32;
  const barX = pad + 24;
  const barY = cardBY + 88;
  const wLight = ((s.stageLightPercent || 60) / totStage) * barW;
  const wDeep = ((s.stageDeepPercent || 20) / totStage) * barW;
  const wRem = ((s.stageRemPercent || 20) / totStage) * barW;

  out += `
    <!-- Legend -->
    <g transform="translate(${barX}, ${cardBY + 60})">
      <rect x="0" y="0" width="12" height="12" rx="3" fill="${C.lightSleep}"/>
      <text x="18" y="11" font-family="Kanit" font-weight="700" font-size="15" fill="${C.ink}">นอนหลับเบา ${s.stageLightPercent}%</text>

      <rect x="150" y="0" width="12" height="12" rx="3" fill="${C.deepSleep}"/>
      <text x="168" y="11" font-family="Kanit" font-weight="700" font-size="15" fill="${C.ink}">หลับลึก ${s.stageDeepPercent}%</text>

      <rect x="280" y="0" width="12" height="12" rx="3" fill="${C.remSleep}"/>
      <text x="298" y="11" font-family="Kanit" font-weight="700" font-size="15" fill="${C.ink}">REM ${s.stageRemPercent}%</text>
    </g>

    <!-- Stacked Bar -->
    <rect x="${barX}" y="${barY}" width="${wLight}" height="${barH}" rx="5" fill="${C.lightSleep}"/>
    <rect x="${barX + wLight}" y="${barY}" width="${wDeep}" height="${barH}" fill="${C.deepSleep}"/>
    <rect x="${barX + wLight + wDeep}" y="${barY}" width="${wRem}" height="${barH}" rx="5" fill="${C.remSleep}"/>

    <!-- Times under segments (Dynamic Calculated) -->
    <text x="${(barX + wLight * 0.5).toFixed(1)}" y="${barY + barH + 24}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="18" fill="${C.ink}">${esc(lightHm)}</text>
    <text x="${(barX + wLight + wDeep * 0.5).toFixed(1)}" y="${barY + barH + 24}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="18" fill="${C.ink}">${esc(deepHm)}</text>
    <text x="${(barX + wLight + wDeep + wRem * 0.5).toFixed(1)}" y="${barY + barH + 24}" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="18" fill="${C.ink}">${esc(remHm)}</text>

    <!-- Stage Note / Insight under the stages bar -->
    <text x="${barX}" y="${cardBY + 195}" font-family="Kanit" font-weight="600" font-size="14.5" fill="${C.sub}">${esc(s.stageNote || 'สัดส่วนการนอนหลับลึกและ REM ช่วยฟื้นฟูสมองและกล้ามเนื้อได้ดี')}</text>
  `;

  // Restorative Sleep Box (Right) — Dynamic compare and trend arrow
  const restX = pad + cw - 240;
  const restTrend = calcTrend(s.restorativeSleep, s.restorativeCompare, { higherIsBetter: true });
  const arrowSymbol = restTrend.trend === "up" ? "▲" : (restTrend.trend === "down" ? "▼" : "•");
  const arrowColor = restTrend.isPositive ? C.greenSoft : (restTrend.trend === "up" ? C.amberSoft : C.rose);
  const restVal = String(s.restorativeSleep || "").includes("ชม") ? s.restorativeSleep : `${s.restorativeSleep || "0:00"} ชม.`;
  const restCompareMarkup = s.restorativeCompare
    ? `<text x="${restX + 16}" y="${cardBY + 160}" font-family="Kanit" font-weight="700" font-size="15" fill="${arrowColor}">${esc(s.restorativeCompare)} ${arrowSymbol}</text>`
    : "";

  out += `
    <rect x="${restX}" y="${cardBY + 20}" width="216" height="194" rx="18" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2"/>
    ${iconBadge(restX + 16, cardBY + 36, 18, C.greenLight, iLeaf, C.greenSoft, 0.95)}
    <text x="${restX + 58}" y="${cardBY + 44}" font-family="Kanit" font-weight="800" font-size="15.5" fill="${C.ink}">การนอนหลับเพื่อฟื้นฟู</text>
    <text x="${restX + 58}" y="${cardBY + 60}" font-family="Kanit" font-weight="600" font-size="12" fill="${C.muted}">Restorative Sleep</text>
    <text x="${restX + 16}" y="${cardBY + 104}" font-family="Kanit" font-weight="800" font-size="44" fill="${C.ink}">${esc(restVal)}</text>
    <text x="${restX + 16}" y="${cardBY + 134}" font-family="Kanit" font-weight="700" font-size="15" fill="${C.muted}">(Deep + REM)</text>
    ${restCompareMarkup}
  `;

  // ── Row of 2 Mini Charts: Hours vs Needed & Sleep Consistency ──
  const row2Y = 955;
  const r2W = (cw - 20) / 2;
  const r2H = 300;

  // 1. Hours vs. Needed (Line)
  out += `
    <rect x="${pad}" y="${row2Y}" width="${r2W}" height="${r2H}" rx="24" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2" filter="url(#softShadow)"/>
    <text x="${pad + 24}" y="${row2Y + 36}" font-family="Kanit" font-weight="800" font-size="18" fill="${C.ink}">ชั่วโมงนอนเทียบกับความต้องการ (ชั่วโมง)</text>

    <!-- Legend -->
    <g transform="translate(${pad + 120}, ${row2Y + 54})">
      <rect x="0" y="0" width="10" height="10" rx="2" fill="${C.greenSoft}"/>
      <text x="16" y="9" font-family="Kanit" font-weight="700" font-size="13" fill="${C.sub}">Sleep Duration</text>
      <line x1="114" y1="5" x2="132" y2="5" stroke="#0284C7" stroke-width="2.5" stroke-dasharray="4 3"/>
      <text x="138" y="9" font-family="Kanit" font-weight="700" font-size="13" fill="#0284C7">Sleep Needed</text>
    </g>
  `;
  out += dualLineChart(pad + 20, row2Y + 70, r2W - 40, 130, s.hoursVsNeededSeries, s.hoursNeededSeries);
  out += dayLabelSvg(d.days.slice(-s.hoursVsNeededSeries.length), pad + 20, row2Y + 246, r2W - 40);

  // 2. Sleep Consistency (Bars) — fixedMax: 100 เพื่อสเกลเปอร์เซ็นต์ที่ถูกต้องจริง
  const scX = pad + r2W + 20;
  out += `
    <rect x="${scX}" y="${row2Y}" width="${r2W}" height="${r2H}" rx="24" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2" filter="url(#softShadow)"/>
    <text x="${scX + 24}" y="${row2Y + 36}" font-family="Kanit" font-weight="800" font-size="18" fill="${C.ink}">ความสม่ำเสมอของการนอน (%)</text>
  `;
  out += barChart(scX + 20, row2Y + 70, r2W - 40, 130, s.consistencySeries, C.purpleBar, {
    valueFmt: (v) => `${Math.round(v)}%`,
    fixedMax: 100,
    yTicks: [25, 50, 75, 100],
    barGrad: "url(#cyanPurpleGrad)",
    peakGrad: "url(#purpleBarPeakGrad)",
  });
  out += dayLabelSvg(d.days.slice(-s.consistencySeries.length), scX + 20, row2Y + 246, r2W - 40);

  // ── Card C: AI Insight ──
  const cardCY = 1280;
  const cardCH = 160;
  out += `
    <rect x="${pad}" y="${cardCY}" width="${cw}" height="${cardCH}" rx="22" fill="${C.purpleLight}" stroke="${C.purpleBorder}" stroke-width="1.2" filter="url(#softShadow)"/>
    ${iconBadge(pad + 20, cardCY + 20, 22, C.purpleDark, iBrain, "#FFFFFF", 0.9)}
    <text x="${pad + 74}" y="${cardCY + 38}" font-family="Kanit" font-weight="800" font-size="19" fill="${C.purpleDark}">AI Insight – Sleep</text>
  `;
  const slpLines = wrapLines(s.aiInsight, cw - 125, 19);
  out += linesSvg(slpLines.slice(0, 3), pad + 74, cardCY + 72, 28, 19, C.ink, 500);

  // ── Card D: Tips ──
  const cardDY = 1460;
  const cardDH = 140;
  out += `
    <rect x="${pad}" y="${cardDY}" width="${cw}" height="${cardDH}" rx="22" fill="${C.purpleLight}" stroke="${C.purpleBorder}" stroke-width="1.2" filter="url(#softShadow)"/>
    ${iconBadge(pad + 20, cardDY + 20, 22, C.purpleDark, iBulb, "#FFFFFF", 0.85)}
    <text x="${pad + 74}" y="${cardDY + 38}" font-family="Kanit" font-weight="800" font-size="19" fill="${C.purpleDark}">${esc("คำแนะนำ")}</text>
  `;
  const tipLines = wrapLines(s.tips, cw - 125, 19);
  out += linesSvg(tipLines.slice(0, 2), pad + 74, cardDY + 72, 28, 19, C.ink, 500);

  // Footer
  const bioLogo = getBiokoopLogoBase64();
  let footerBrand = "";
  if (bioLogo) {
    footerBrand = `
      <image href="data:image/png;base64,${bioLogo}" x="${W - pad - 120}" y="1704" width="120" height="12.5" preserveAspectRatio="xMaxYMid meet"/>
      <text x="${W - pad}" y="1728" text-anchor="end" font-family="Kanit" font-weight="600" font-size="9.5" letter-spacing="1.5" fill="${C.faint}">${esc(activeWeeklyConfig.footerSub || "AI HEALTH INTELLIGENCE")}</text>
    `;
  } else {
    footerBrand = `
      <g transform="translate(${W - pad}, 1720)">
        <text x="0" y="0" text-anchor="end" font-family="Kanit" font-weight="800" font-size="18" fill="${C.ink}">${esc(activeWeeklyConfig.brandTitle || "BIOKOOP")}</text>
        <text x="0" y="14" text-anchor="end" font-family="Kanit" font-weight="600" font-size="10" letter-spacing="1.5" fill="${C.faint}">${esc(activeWeeklyConfig.footerSub || "AI HEALTH INTELLIGENCE")}</text>
      </g>
    `;
  }

  out += `
    <line x1="${pad}" y1="1640" x2="${W - pad}" y2="1640" stroke="${C.border}" stroke-width="1.2"/>
    <text x="${W / 2}" y="1680" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="20" fill="${C.ink}">${esc(activeWeeklyConfig.footerQuote || "“เข้าใจร่างกายวันนี้ เพื่อพรุ่งนี้ที่ดีกว่า”")}</text>
    ${footerBrand}
  `;

  return svgDoc(out, PAGE_H);
}

// ═══════════════════════════════════════════════════════════
// EXPORT: เรนเดอร์ 3 หน้า
// ═══════════════════════════════════════════════════════════
export function renderWeeklyReportSvgs(aiData, customConfig = null) {
  if (customConfig) {
    applyWeeklyConfig(customConfig);
  }
  const d = normalizeWeeklyData(aiData);
  return {
    data: d,
    svgs: [renderWeeklyOverviewPage(d), renderWeeklyActivityPage(d), renderWeeklySleepPage(d)],
  };
}
