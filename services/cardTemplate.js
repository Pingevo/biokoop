// cardTemplate.js
// การ์ด Biikoop Morning Health Card (Dynamic Re-ordering, Pixel-Perfect Layout & Custom Themes)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getCardConfig } from "./cardConfigService.js";
import { getGradeForScore } from "./gradeConfigService.js";
import { getKieslectConfig } from "./kieslectConfigService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_W = 1024;
const DEFAULT_H = 1536;

// พื้นหลังภาพภูเขา/หมอกยามเช้าจริง (แทน vector backdrop เดิม)
// ฝัง <image> เป็น base64 data URI ไว้เสมอ: เบราว์เซอร์ (admin live preview) render ได้ปกติ
// ส่วน resvg-wasm ฝั่ง server ไม่รองรับ decode raster ใน <image> เลย (ทดสอบแล้วว่างเปล่าเสมอ)
// จึงข้ามไปเฉยๆ (เท่ากับโปร่งใส) แล้วให้ imageService.js คอมโพสิตภาพจริงทับด้วย pngjs แทน
export const BG_IMAGE_PATH = path.join(__dirname, "..", "public", "assets", "backgrounds", "nature-bg.png");
export const hasBgImage = fs.existsSync(BG_IMAGE_PATH);
// ภาพต้นฉบับ 0-480px บนสุดเป็นสีดำสนิท และ 480-700px ยังมืดไล่โทนอยู่ ตัดออกทั้งหมด
// เริ่มพื้นหลังจากช่วงพระอาทิตย์ขึ้น/หมอกสว่าง (~700px) แทน ให้โซนหัวการ์ดเป็นโทนสว่างอ่านตัวหนังสือเข้มได้ชัด
export const BG_CROP_TOP = 700;
let bgImageDataUri = null;
if (hasBgImage) {
  bgImageDataUri = `data:image/png;base64,${fs.readFileSync(BG_IMAGE_PATH).toString("base64")}`;
}

// ฟังก์ชันปรับแต่งข้อความภาษาไทยและลบ Emoji สำหรับเรนเดอร์ใน SVG การ์ด
function prepareTextForSvg(text = "") {
  if (!text) return "";
  let s = String(text);

  // 1. ลบ Emoji และสัญลักษณ์พิเศษที่ไม่รองรับในฟอนต์ Kanit ป้องกันการเกิดรูปกล่องสี่เหลี่ยม ☐
  s = s.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F19A}]/gu, "");

  // 2. ปรับแต่งโครงสร้าง สระอำ (U+0E33) ป้องกันตำแหน่ง Nikhahit + Sara Aa ซ้อนทับตัวอักษรอื่นใน resvg-wasm
  // แปลง (พยัญชนะ) + (วรรณยุกต์ถ้ามี) + ำ -> (พยัญชนะ) + ํ (Nikhahit) + (วรรณยุกต์ถ้ามี) + า (Sara Aa)
  s = s.replace(/([\u0E01-\u0E2E])([\u0E48-\u0E4C])?\u0E33/g, (m, c, t) => {
    return c + "\u0E4D" + (t || "") + "\u0E32";
  });

  return s.trim();
}

function esc(s = "") {
  const prep = prepareTextForSvg(s);
  return String(prep)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// JetBrainsMono ไม่มี glyph ภาษาไทย ถ้าเจอข้อความไทย (เช่น "ไม่มีข้อมูล")
// ต้องสลับไปใช้ Kanit แทน ไม่งั้น resvg จะ fallback/synthesize font จนตัวอักษรทับซ้อนกัน
function valueFont(text) {
  return /[฀-๿]/.test(String(text)) ? "Kanit" : "JetBrainsMono";
}

function currentThaiDate() {
  const d = new Date();
  const m = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// ─── SVG Icon Helpers ───
function circ(cx, cy, r, bg) { return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}"/>`; }

function iMoon(cx, cy, r, col) {
  const s = r * 0.9;
  return `<path d="M ${cx + s * 0.25} ${cy - s} C ${cx - s * 0.75} ${cy - s * 0.8}, ${cx - s * 1.05} ${cy + s * 0.35}, ${cx + s * 0.25} ${cy + s} C ${cx - s * 0.35} ${cy + s * 0.5}, ${cx - s * 0.35} ${cy - s * 0.5}, ${cx + s * 0.25} ${cy - s} Z" fill="${col}"/>`;
}
function iClock(cx, cy, r, col) {
  const sw = r * 0.16;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}"/>
<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r * .55}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>
<line x1="${cx}" y1="${cy}" x2="${cx + r * .4}" y2="${cy}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`;
}
function iBed(cx, cy, r, col) {
  const sw = r * 0.16;
  return `<rect x="${cx - r}" y="${cy - r * .15}" width="${r * 2}" height="${r * .9}" rx="${r * .2}" fill="none" stroke="${col}" stroke-width="${sw}"/>
<line x1="${cx - r}" y1="${cy + r * .75}" x2="${cx - r}" y2="${cy - r * .5}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>
<line x1="${cx + r}" y1="${cy + r * .75}" x2="${cx + r}" y2="${cy + r * .05}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>
<circle cx="${cx - r * .5}" cy="${cy - r * .1}" r="${r * .22}" fill="${col}"/>`;
}
function iHeart(cx, cy, r, col) {
  return `<path d="M${cx} ${cy + r * .7}C${cx - r * 1.3} ${cy - r * .3},${cx - r * .5} ${cy - r * 1.2},${cx} ${cy - r * .4}C${cx + r * .5} ${cy - r * 1.2},${cx + r * 1.3} ${cy - r * .3},${cx} ${cy + r * .7}Z" fill="${col}"/>`;
}
function iPulse(cx, cy, r, col) {
  return `<polyline points="${cx - r},${cy} ${cx - r * .4},${cy} ${cx - r * .15},${cy - r * .9} ${cx + r * .15},${cy + r * .9} ${cx + r * .4},${cy} ${cx + r},${cy}" fill="none" stroke="${col}" stroke-width="${r * .18}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function iO2(cx, cy, r, col) {
  return `<text x="${cx}" y="${cy + r * .35}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="${r * 1.35}" fill="${col}">O₂</text>`;
}
function iSunStar(cx, cy, r, col) {
  let s = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    s += `<line x1="${cx + Math.cos(a) * r * .95}" y1="${cy + Math.sin(a) * r * .95}" x2="${cx + Math.cos(a) * r * 1.35}" y2="${cy + Math.sin(a) * r * 1.35}" stroke="${col}" stroke-width="${r * .15}" stroke-linecap="round"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r * .65}" fill="${col}"/>${s}`;
}
function iCheck(cx, cy, r, C) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.greenLight}" stroke="${C.green}" stroke-width="3.5"/>
<polyline points="${cx - r * .45},${cy} ${cx - r * .1},${cy + r * .42} ${cx + r * .5},${cy - r * .4}" fill="none" stroke="${C.green}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function iBriefcase(cx, cy, r, col) {
  const sw = r * 0.16;
  return `<rect x="${cx - r}" y="${cy - r * .5}" width="${r * 2}" height="${r * 1.3}" rx="${r * .15}" fill="none" stroke="${col}" stroke-width="${sw}"/>
<path d="M${cx - r * .5} ${cy - r * .5}v-${r * .3}a${r * .2} ${r * .2} 0 0 1 ${r * .2}-${r * .2}h${r * .6}a${r * .2} ${r * .2} 0 0 1 ${r * .2} ${r * .2}v${r * .3}" fill="none" stroke="${col}" stroke-width="${sw}"/>`;
}
function iBell(cx, cy, r, col) {
  const sw = r * 0.16;
  return `<path d="M${cx - r * .7} ${cy + r * .3}a${r * .7} ${r * .9} 0 0 1 ${r * 1.4} 0z" fill="none" stroke="${col}" stroke-width="${sw}"/>
<path d="M${cx - r * .75} ${cy + r * .35}h${r * 1.5}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>
<circle cx="${cx}" cy="${cy + r * .75}" r="${r * .15}" fill="${col}"/>`;
}
function iDumbbell(cx, cy, r, col) {
  return `<line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="${col}" stroke-width="${r * .2}" stroke-linecap="round"/>
<line x1="${cx - r}" y1="${cy - r * .5}" x2="${cx - r}" y2="${cy + r * .5}" stroke="${col}" stroke-width="${r * .28}" stroke-linecap="round"/>
<line x1="${cx + r}" y1="${cy - r * .5}" x2="${cx + r}" y2="${cy + r * .5}" stroke="${col}" stroke-width="${r * .28}" stroke-linecap="round"/>`;
}
function iRun(cx, cy, r, col) {
  return `<circle cx="${cx + r * .1}" cy="${cy - r * .9}" r="${r * .25}" fill="${col}"/>
<path d="M${cx - r * .6} ${cy + r}l${r * .5}-${r * .6}l${r * .2}-${r * .5}l${r * .5} ${r * .3}l${r * .4}-${r * .5}" fill="none" stroke="${col}" stroke-width="${r * .22}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function iWalk(cx, cy, r, col) {
  return `<circle cx="${cx}" cy="${cy - r * .9}" r="${r * .25}" fill="${col}"/>
<path d="M${cx - r * .3} ${cy + r}l${r * .2}-${r * 1.3}l${r * .4} ${r * .4}l${r * .3} ${r * .6} M${cx - r * .1} ${cy - r * .3}l-${r * .3} ${r * .5}" fill="none" stroke="${col}" stroke-width="${r * .2}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function iBulb(cx, cy, r, col) {
  return `<circle cx="${cx}" cy="${cy - r * .2}" r="${r * .75}" fill="none" stroke="${col}" stroke-width="${r * .18}"/>
<line x1="${cx - r * .3}" y1="${cy + r * .6}" x2="${cx + r * .3}" y2="${cy + r * .6}" stroke="${col}" stroke-width="${r * .18}" stroke-linecap="round"/>
<line x1="${cx - r * .25}" y1="${cy + r * .95}" x2="${cx + r * .25}" y2="${cy + r * .95}" stroke="${col}" stroke-width="${r * .16}" stroke-linecap="round"/>`;
}
function iCalendar(cx, cy, r, col) {
  const sw = r * 0.16;
  return `<rect x="${cx - r}" y="${cy - r * .7}" width="${r * 2}" height="${r * 1.6}" rx="${r * .15}" fill="none" stroke="${col}" stroke-width="${sw}"/>
<line x1="${cx - r}" y1="${cy - r * .2}" x2="${cx + r}" y2="${cy - r * .2}" stroke="${col}" stroke-width="${r * .14}"/>
<line x1="${cx - r * .5}" y1="${cy - r}" x2="${cx - r * .5}" y2="${cy - r * .5}" stroke="${col}" stroke-width="${r * .14}" stroke-linecap="round"/>
<line x1="${cx + r * .5}" y1="${cy - r}" x2="${cx + r * .5}" y2="${cy - r * .5}" stroke="${col}" stroke-width="${r * .14}" stroke-linecap="round"/>`;
}

function iconCircle(cx, cy, r, bg, iconFn, iconColor) {
  return `${circ(cx, cy, r, bg)}${iconFn(cx, cy, r * 0.5, iconColor)}`;
}

// ─── Rating Star Row ───
function stars(cx, cy, filled, total = 5, sz = 21, C = {}) {
  let o = "";
  const sp = sz * 1.35;
  const sx = cx - ((total - 1) * sp) / 2;
  for (let i = 0; i < total; i++) {
    const x = sx + i * sp;
    const f = i < filled ? C.green : "#E2E8F0";
    const pts = [];
    for (let j = 0; j < 10; j++) {
      const a = (Math.PI / 5) * j - Math.PI / 2;
      const rad = j % 2 === 0 ? sz / 2 : (sz / 2) * 0.45;
      pts.push(`${x + Math.cos(a) * rad},${cy + Math.sin(a) * rad}`);
    }
    o += `<polygon points="${pts.join(" ")}" fill="${f}"/>`;
  }
  return o;
}

// ─── Text Wrap Utility ───
function visualLength(str = "") {
  // ลบสระบน/ล่าง และวรรณยุกต์ไทยที่ไม่กินความกว้างแนวนอนออก ก่อนคำนวณความกว้างตัวอักษร
  const baseOnly = str.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0E4D]/g, "");
  return baseOnly.length;
}

function wrapText(text, x, y, maxW, lh, fs, col, maxLines = 3) {
  const clean = prepareTextForSvg(text);
  const cw = Number(fs) * 0.55; // ความกว้างเฉลี่ยของฟอนต์ Kanit
  const mxc = Math.max(10, Math.floor(maxW / cw));

  // แยกคำตามช่องว่าง หรือสัญลักษณ์
  const rawTokens = clean.split(/(?<=\s)|(?<=[.,!?:;])/);

  // ถ้าเจอคำที่ยาวเกิน mxc (เช่น ข้อความภาษาไทยยาวติดกันโดยไม่มีช่องว่าง) ให้หั่นเป็นชิ้นย่อยๆ ตามตัวอักษร
  const words = [];
  for (const tok of rawTokens) {
    if (visualLength(tok) > mxc) {
      let sub = "";
      for (const ch of tok) {
        if (visualLength(sub + ch) > mxc && sub) {
          words.push(sub);
          sub = ch;
        } else {
          sub += ch;
        }
      }
      if (sub) words.push(sub);
    } else {
      words.push(tok);
    }
  }

  const lines = [];
  let cur = "";

  for (const w of words) {
    if (visualLength(cur + w) > mxc && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur += w;
    }
  }
  if (cur) lines.push(cur.trim());

  // ตัดบรรทัดตาม maxLines และใส่ ... หากมีข้อความเกิน
  const resultLines = lines.slice(0, maxLines);
  if (lines.length > maxLines && resultLines.length > 0) {
    let last = resultLines[resultLines.length - 1];
    if (last.length > mxc - 3) {
      last = last.slice(0, Math.max(0, mxc - 3));
    }
    resultLines[resultLines.length - 1] = last.trim() + "...";
  }

  return resultLines
    .map((l, i) =>
      `<text x="${x}" y="${y + i * Number(lh)}" font-family="Kanit" font-weight="400" font-size="${fs}" fill="${col}">${esc(l)}</text>`
    )
    .join("\n");
}

// ─── ZONE 2: Stat Card Items ───
function leftStat(x, y, iconFn, iconBg, iconCol, label, value, sub, C) {
  return `<g>
  ${iconCircle(x + 32, y + 32, 32, iconBg, iconFn, iconCol)}
  <text x="${x + 78}" y="${y + 24}" font-family="Kanit" font-weight="600" font-size="15" letter-spacing=".5" fill="${C.grayText}">${esc(label)}</text>
  <text x="${x + 78}" y="${y + 58}" font-family="${valueFont(value)}" font-weight="700" font-size="32" fill="${C.navyDark}">${esc(value)}</text>
  ${sub ? `<text x="${x + 78}" y="${y + 83}" font-family="Kanit" font-weight="400" font-size="15" fill="${C.grayText}">${esc(sub)}</text>` : ""}
</g>`;
}

function rightStat(x, y, iconFn, iconBg, iconCol, label, value, sub, hasDot = false, C) {
  return `<g>
  ${iconCircle(x + 26, y + 26, 26, iconBg, iconFn, iconCol)}
  <text x="${x + 62}" y="${y + 20}" font-family="Kanit" font-weight="600" font-size="14.5" fill="${C.grayText}">${esc(label)}</text>
  <text x="${x + 62}" y="${y + 51}" font-family="${valueFont(value)}" font-weight="700" font-size="28" fill="${C.navyDark}">${esc(value)}</text>
  ${sub ? `<text x="${x + 62}" y="${y + 72}" font-family="Kanit" font-weight="400" font-size="14.5" fill="${C.grayText}">${esc(sub)}</text>` : ""}
  ${hasDot ? `<circle cx="${x + 232}" cy="${y + 62}" r="5" fill="${C.green}"/>` : ""}
</g>`;
}

// ─── ZONE 2: Circular Sleep Score Gauge ───
function scoreGauge(cx, cy, r, score, grade, C) {
  const circ2 = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const offset = circ2 * (1 - pct);
  return `
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="20"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.green}" stroke-width="20"
  stroke-dasharray="${circ2}" stroke-dashoffset="${offset}" stroke-linecap="round"
  transform="rotate(-90 ${cx} ${cy})"/>
<text x="${cx}" y="${cy - 65}" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="16" letter-spacing="1" fill="${C.grayText}">SLEEP SCORE</text>
<text x="${cx}" y="${cy + 20}" text-anchor="middle" font-family="JetBrainsMono" font-weight="700" font-size="86" fill="${C.navyDark}">${score}</text>
<text x="${cx}" y="${cy + 56}" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="23" fill="${C.grayText}">/100</text>`;
}

// ─── ZONE 4: Sleep Component Column ───
function sleepComp(x, y, w, iconFn, iconBg, iconCol, label, value, pct, barCol, sublabel, hasDot = false, C) {
  const px = x + 18;
  return `<g>
  ${iconCircle(px, y + 18, 18, iconBg, iconFn, iconCol)}
  <text x="${px + 24}" y="${y + 24}" font-family="Kanit" font-weight="600" font-size="16" fill="${C.navyDark}">${esc(label)}</text>
  <text x="${px}" y="${y + 62}" font-family="${valueFont(value)}" font-weight="700" font-size="27" fill="${C.navyDark}">${esc(value)}</text>
  ${pct !== null ? `<text x="${px}" y="${y + 84}" font-family="Kanit" font-weight="600" font-size="16" fill="${C.grayText}">${pct}%</text>` : ""}
  ${sublabel ? `<text x="${px}" y="${pct !== null ? y + 106 : y + 86}" font-family="Kanit" font-weight="400" font-size="14.5" fill="${C.grayLight}">${esc(sublabel)}</text>` : ""}
  ${barCol ? `<rect x="${px}" y="${y + 116}" width="38" height="6" rx="3" fill="${barCol}"/>` : ""}
  ${hasDot ? `<circle cx="${px + 8}" cy="${y + 119}" r="4.5" fill="${C.red}"/>` : ""}
</g>`;
}

function parseSleepTimes(sleepTimeRange = "") {
  if (!sleepTimeRange || typeof sleepTimeRange !== "string" || !sleepTimeRange.includes("-")) {
    return { startTime: "12:20 AM", midTime: "3:40 AM", endTime: "7:00 AM" };
  }

  const parts = sleepTimeRange.split("-").map((s) => s.trim());
  const startTime = parts[0] || "12:20 AM";
  const endTime = parts[1] || "7:00 AM";

  let midTime = "";
  try {
    const [sH, sM] = startTime.replace(/[^\d:]/g, "").split(":").map(Number);
    const [eH, eM] = endTime.replace(/[^\d:]/g, "").split(":").map(Number);
    if (!isNaN(sH) && !isNaN(eH)) {
      let startMins = sH * 60 + (sM || 0);
      let endMins = eH * 60 + (eM || 0);
      if (endMins <= startMins) endMins += 24 * 60;
      const midMins = Math.floor((startMins + endMins) / 2) % (24 * 60);
      const mH = Math.floor(midMins / 60);
      const mM = midMins % 60;
      const padM = mM < 10 ? `0${mM}` : `${mM}`;
      if (startTime.toUpperCase().includes("AM") || startTime.toUpperCase().includes("PM")) {
        const isPm = mH >= 12;
        const h12 = mH % 12 || 12;
        midTime = `${h12}:${padM} ${isPm ? "PM" : "AM"}`;
      } else {
        const padH = mH < 10 ? `0${mH}` : `${mH}`;
        midTime = `${padH}:${padM}`;
      }
    }
  } catch (e) {
    midTime = "";
  }

  return { startTime, midTime, endTime };
}

// ─── DYNAMIC HYPNOGRAM GENERATOR ───
function generateDynamicHypnogram(data) {
  // หาก AI มีข้อมูล hypnogramSegments ส่งมาโดยตรง ให้ใช้ข้อมูลจริงนั้น
  if (Array.isArray(data.hypnogramSegments) && data.hypnogramSegments.length > 0) {
    const rawSegs = data.hypnogramSegments;
    const totalDuration = rawSegs.reduce((acc, s) => acc + (s.duration || 1), 0);
    let cur = 0;
    const segments = [];
    rawSegs.forEach((seg) => {
      const durPct = (seg.duration || 1) / totalDuration;
      const level = seg.stage === "deep" ? 3 : seg.stage === "rem" ? 1 : 2;
      segments.push({ s: cur, e: Math.min(1.0, cur + durPct), level });
      cur += durPct;
    });
    if (segments.length > 0) segments[segments.length - 1].e = 1.0;
    return { segments, restlessPcts: data.restlessPcts || [0.25, 0.65], awakePcts: data.awakePcts || [0.0, 0.99] };
  }

  // คำนวณอัตราส่วนเปอร์เซ็นต์จริงที่ AI สกัดได้จากภาพ
  const rawDeep = (data.deepSleepPercent || (data.deepSleep && data.deepSleep.percent) || 20);
  const rawLight = (data.lightSleepPercent || (data.lightSleep && data.lightSleep.percent) || 55);
  const rawRem = (data.remSleepPercent || (data.remSleep && data.remSleep.percent) || 20);
  const rawAwake = (data.awakePercent || (data.awake && data.awake.percent) || 5);
  const score = Number(data.score) || 75;

  const total = (rawDeep + rawLight + rawRem) || 100;
  const normDeep = rawDeep / total;
  const normLight = rawLight / total;
  const normRem = rawRem / total;

  // จำลอง วงจรการนอน (Sleep Cycles) 4 รอบโดยปรับสัดส่วนในแต่ละรอบให้ตรงตาม normDeep, normLight, normRem รวมสุทธิ
  const numCycles = 4;
  const cycleW = 1.0 / numCycles;

  const rawSegments = [];
  let cur = 0;

  for (let c = 0; c < numCycles; c++) {
    // ช่วงต้นคืน (c < 2) หลับลึกมากกว่า ช่วงปลายคืน (c >= 2) REM มากกว่า
    const deepWeight = c < 2 ? normDeep * 1.5 : normDeep * 0.5;
    const remWeight = c >= 2 ? normRem * 1.6 : normRem * 0.4;
    const lightWeight = normLight;

    const sumW = deepWeight + remWeight + lightWeight || 1;
    const deepDur = (deepWeight / sumW) * cycleW;
    const remDur = (remWeight / sumW) * cycleW;
    const lightDur = (lightWeight / sumW) * cycleW;
    const halfLight = lightDur / 2;

    if (halfLight > 0.005) {
      rawSegments.push({ s: cur, e: cur + halfLight, level: 2 });
      cur += halfLight;
    }
    if (deepDur > 0.005) {
      rawSegments.push({ s: cur, e: cur + deepDur, level: 3 });
      cur += deepDur;
    }
    if (halfLight > 0.005) {
      rawSegments.push({ s: cur, e: cur + halfLight, level: 2 });
      cur += halfLight;
    }
    if (remDur > 0.005) {
      rawSegments.push({ s: cur, e: cur + remDur, level: 1 });
      cur += remDur;
    }
  }

  if (rawSegments.length > 0) {
    rawSegments[rawSegments.length - 1].e = 1.0;
  }

  // รวมบล็อกที่ต่อเนื่องกันในระดับเดียวกัน
  const segments = [];
  for (const seg of rawSegments) {
    if (segments.length > 0 && segments[segments.length - 1].level === seg.level) {
      segments[segments.length - 1].e = seg.e;
    } else {
      segments.push({ ...seg });
    }
  }

  // คำนวณจุดกระสับกระส่าย (Restless) และตื่น (Awake) จากค่าคะแนนและ % การตื่นจริง
  const restlessCount = Math.max(1, Math.min(8, Math.floor((100 - score) / 10)));
  const seed = (score * 37 + 19) % 100;
  const restlessPcts = [];
  for (let i = 0; i < restlessCount; i++) {
    const p = Number(((seed * 0.13 + i * 0.27 + 0.08) % 0.88 + 0.06).toFixed(3));
    restlessPcts.push(p);
  }

  const awakePcts = [0.0];
  if (rawAwake > 3 || score < 80) {
    awakePcts.push(0.42);
  }
  awakePcts.push(0.99);

  return { segments, restlessPcts, awakePcts };
}

// ─── ZONE 5: HYPNOGRAM CHART ───
function renderHypnogramGraph(x, y, w, h, data = {}, C) {
  const { startTime, midTime, endTime } = parseSleepTimes(data.sleepTimeRange || data.sleepRange);

  const legendItems = [
    { col: C.awakeBg, text: "ตื่น" },
    { col: C.restlessBg, text: "กระสับกระส่าย" },
    { col: C.cyanBorder, text: "REM" },
    { col: C.blue, text: "หลับตื้น" },
    { col: C.deepSleepBg, text: "หลับลึก" },
  ];

  let legendSvg = "";
  legendItems.forEach((it, i) => {
    const ly = y + 8 + i * 24.5;
    legendSvg += `<rect x="${x + 14}" y="${ly}" width="14" height="14" rx="3" fill="${it.col}"/>
<text x="${x + 36}" y="${ly + 12}" font-family="Kanit" font-weight="500" font-size="15" fill="${C.navyDark}">${it.text}</text>`;
  });

  const gx = x + 175;
  const gw = w - 190;
  const gy = y + 10;

  const divLine = `<line x1="${gx - 22}" y1="${y + 12}" x2="${gx - 22}" y2="${y + h - 12}" stroke="#E2E8F0" stroke-width="1"/>`;
  const trackLine = `<line x1="${gx}" y1="${gy + 10}" x2="${gx + gw}" y2="${gy + 10}" stroke="#E2E8F0" stroke-width="1.5"/>`;

  const { segments, restlessPcts, awakePcts } = generateDynamicHypnogram(data);

  let ticksSvg = "";
  restlessPcts.forEach((pct) => {
    const tx = gx + gw * pct;
    ticksSvg += `<line x1="${tx}" y1="${gy + 2}" x2="${tx}" y2="${gy + 18}" stroke="${C.restlessBg}" stroke-width="3" stroke-linecap="round"/>`;
  });
  awakePcts.forEach((pct) => {
    const tx = gx + gw * pct;
    ticksSvg += `<line x1="${tx}" y1="${gy + 2}" x2="${tx}" y2="${gy + 18}" stroke="${C.awakeBg}" stroke-width="3" stroke-linecap="round"/>`;
  });

  let blocksSvg = "";
  let pathD = "";
  segments.forEach((seg, idx) => {
    const sx = gx + gw * seg.s;
    const sw = gw * (seg.e - seg.s);
    let levelY = gy + 46;
    if (seg.level === 3) {
      levelY = gy + 72;
      blocksSvg += `<rect x="${sx}" y="${levelY}" width="${sw}" height="28" rx="6" fill="${C.deepSleepBg}"/>`;
    } else if (seg.level === 2) {
      levelY = gy + 46;
      blocksSvg += `<rect x="${sx}" y="${levelY}" width="${sw}" height="26" rx="6" fill="${C.blue}" stroke="#1D4ED8" stroke-width="1.5"/>`;
    } else if (seg.level === 1) {
      levelY = gy + 22;
      blocksSvg += `<rect x="${sx}" y="${levelY}" width="${sw}" height="24" rx="6" fill="${C.remBg}" stroke="${C.cyanBorder}" stroke-width="2"/>`;
    }

    if (idx === 0) {
      pathD += `M ${sx} ${levelY} L ${sx + sw} ${levelY}`;
    } else {
      pathD += ` L ${sx} ${levelY} L ${sx + sw} ${levelY}`;
    }
  });

  const steppedLine = `<path d="${pathD}" fill="none" stroke="#1D4ED8" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;

  const labelsSvg = `
<text x="${gx}" y="${y + h + 26}" text-anchor="start" font-family="JetBrainsMono" font-weight="600" font-size="16" fill="${C.navyDark}">${esc(startTime)}</text>
<text x="${gx}" y="${y + h + 44}" text-anchor="start" font-family="Kanit" font-weight="400" font-size="14.5" fill="${C.grayText}">เข้านอน</text>

${midTime ? `<text x="${gx + gw * 0.5}" y="${y + h + 26}" text-anchor="middle" font-family="JetBrainsMono" font-weight="600" font-size="16" fill="${C.navyDark}">${esc(midTime)}</text>` : ""}

<text x="${gx + gw}" y="${y + h + 26}" text-anchor="end" font-family="JetBrainsMono" font-weight="600" font-size="16" fill="${C.navyDark}">${esc(endTime)}</text>
<text x="${gx + gw}" y="${y + h + 44}" text-anchor="end" font-family="Kanit" font-weight="400" font-size="14.5" fill="${C.grayText}">ตื่นนอน</text>`;

  return `
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.bgCream}" stroke="${C.border}" stroke-width="1.5"/>
${divLine}
${legendSvg}
${trackLine}
${ticksSvg}
${blocksSvg}
${steppedLine}
${labelsSvg}`;
}

// ─── DYNAMIC ACTIVITIES GENERATOR ───
function getDynamicActivities(data) {
  const score = Number(data.score) || 75;

  if (data.activities && Array.isArray(data.activities) && data.activities.length >= 3) {
    return data.activities;
  }

  if (score >= 80) {
    return [
      { fn: iDumbbell, title: "เวทเทรนนิ่ง", sub: "เพิ่มกล้ามเนื้อ", w: 225 },
      { fn: iRun, title: "คาร์ดิโอ", sub: "ทำได้เต็มที่", w: 215 },
      { fn: iWalk, title: "กิจกรรมกลางแจ้ง", sub: "เดิน วิ่ง ปั่นจักรยาน", w: 240 }
    ];
  } else if (score >= 65) {
    return [
      { fn: iWalk, title: "เดินออกกำลังกาย", sub: "30-45 นาที", w: 225 },
      { fn: iBulb, title: "โยคะ/ยืดเหยียด", sub: "คลายกล้ามเนื้อ", w: 215 },
      { fn: iSunStar, title: "รับแสงแดดยามเช้า", sub: "ปรับนาฬิกาชีวิต", w: 240 }
    ];
  } else {
    return [
      { fn: iBed, title: "พักผ่อนสะสม", sub: "หลีกเลี่ยงงานหนัก", w: 225 },
      { fn: iClock, title: "งีบสั้นๆ 20 นาที", sub: "เติมพลังช่วงบ่าย", w: 215 },
      { fn: iWalk, title: "เดินรับลมเบาๆ", sub: "กระตุ้นความสดชื่น", w: 240 }
    ];
  }
}

// ─── ZONE 6: Activity Pill ───
function actPill(x, y, w, iconFn, label1, label2, C) {
  return `<rect x="${x}" y="${y}" width="${w}" height="66" rx="33" fill="${C.greenLight}" stroke="${C.greenBorder}" stroke-width="1.5"/>
${iconCircle(x + 33, y + 33, 21, C.white, iconFn, C.green)}
<text x="${x + 66}" y="${y + 30}" font-family="Kanit" font-weight="600" font-size="17" fill="${C.navyDark}">${esc(label1)}</text>
<text x="${x + 66}" y="${y + 50}" font-family="Kanit" font-weight="400" font-size="14.5" fill="${C.grayText}">${esc(label2)}</text>`;
}

function hexToRgb(hex) {
  let c = (hex || "#0284C7").replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  if (isNaN(num)) return { r: 2, g: 132, b: 199 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function deriveGradeTheme(hexColor) {
  const { r, g, b } = hexToRgb(hexColor);

  const lr = Math.round(r * 0.12 + 255 * 0.88);
  const lg = Math.round(g * 0.12 + 255 * 0.88);
  const lb = Math.round(b * 0.12 + 255 * 0.88);
  const greenLight = `rgb(${lr}, ${lg}, ${lb})`;

  const br = Math.round(r * 0.35 + 255 * 0.65);
  const bg = Math.round(g * 0.35 + 255 * 0.65);
  const bb = Math.round(b * 0.35 + 255 * 0.65);
  const greenBorder = `rgb(${br}, ${bg}, ${bb})`;

  const dr = Math.round(r * 0.35);
  const dg = Math.round(g * 0.35);
  const db = Math.round(b * 0.35);
  const greenDark = `rgb(${dr}, ${dg}, ${db})`;

  return {
    green: hexColor,
    greenAccent: hexColor,
    greenLight,
    greenBorder,
    greenDark,
  };
}

// ─── MAIN CARD RENDERER ───
export function renderBiokoopCard(data = {}, overrideConfig = null) {
  const cfg = overrideConfig || getCardConfig();
  const W = cfg.canvasWidth || DEFAULT_W;
  const H = cfg.canvasHeight || DEFAULT_H;

  const pad = 50;
  const cw = W - pad * 2; // 924px

  function buildNatureBg(totalH) {
    if (hasBgImage) {
      const visibleH = H - BG_CROP_TOP;
      const imageY = Math.max(0, totalH - visibleH);
      return `<rect x="0" y="0" width="${W}" height="${totalH}" fill="#FFFFFF"/>
<svg x="0" y="${imageY}" width="${W}" height="${totalH - imageY}">
  <image href="${bgImageDataUri}" x="0" y="${-BG_CROP_TOP}" width="${W}" height="${H}"/>
</svg>`;
    }
    return `
<defs>
  <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#F8FAFC"/>
    <stop offset="40%" stop-color="#F1F5F9"/>
    <stop offset="100%" stop-color="#E2E8F0"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${totalH}" fill="url(#skyGrad)"/>`;
  }

  const score = data.score ?? 84;
  const gradeInfo = getGradeForScore(score);
  const grade = data.grade || gradeInfo.grade;

  // Dynamic Theme Palette derived from Grade Score Color
  const gradeColor = gradeInfo.color || cfg.colors.green || "#0284C7";
  const gradeTheme = deriveGradeTheme(gradeColor);
  const C = {
    ...cfg.colors,
    ...gradeTheme,
    ...(overrideConfig && overrideConfig.colors ? overrideConfig.colors : {}),
  };

  const appName = data.appName || "Smart Watch";
  const filledStars = data.stars ?? 4;
  const sleepTime = data.sleepTime ?? "6h 37m";
  const sleepRange = data.sleepTimeRange ?? "12:20 AM - 7:00 AM";
  const ttss = data.timeToSoundSleep ?? "ไม่มีข้อมูล";
  const soundSleep = data.soundSleep ?? "ไม่มีข้อมูล";
  const hr = data.avgHeartRate ?? "ไม่มีข้อมูล";
  const hrv = data.hrv ?? "ไม่มีข้อมูล";
  const spo2 = data.spo2 ?? "ไม่มีข้อมูล";
  const efficiency = data.sleepEfficiency ?? "99%";
  const headline = data.headline || gradeInfo.headline;
  const aiSummary = data.aiSummary ?? gradeInfo.summary;
  const deep = data.deepSleep ?? { value: "1h 26m", percent: 22 };
  const light = data.lightSleep ?? { value: "4h 1m", percent: 60 };
  const rem = data.remSleep ?? { value: "1h 10m", percent: 18 };
  const restless = data.restlessness ?? { value: "14 min", percent: null };
  const awake = data.awake ?? { value: "2 min", percent: null };
  const tips = data.tips || gradeInfo.tips;
  const disclaimer = cfg.disclaimer || "หมายเหตุ: ข้อมูลจากอุปกรณ์สวมใส่ใช้สำหรับการติดตามสุขภาพทั่วไป ไม่สามารถใช้แทนคำแนะนำจากผู้เชี่ยวชาญได้";

  const textLabels = cfg.textLabels || {};
  const brandTitle = textLabels.brandTitle || "Biokoop";
  const headerSubtitle = textLabels.headerSubtitle || "MORNING HEALTH CARD";
  const headerSubtext = textLabels.headerSubtext || "คุณภาพการนอนที่ดี ช่วยสร้างรากฐานที่แข็งแรงให้กับวันของคุณ";
  const sleepCompTitle = textLabels.sleepCompTitle || "องค์ประกอบการนอน";
  const activitiesTitle = textLabels.activitiesTitle || "วันนี้เหมาะกับ";
  const tipsTitle = textLabels.tipsTitle || "TIPS";

  // Dynamic Vertical Stacking for Re-ordered Sections
  let curY = 220;
  const gap = 20;
  let bodySvg = "";

  const leftEnd = pad + 265;
  const rightStart = W - pad - 280;

  const sections = cfg.sections || [
    { id: "header", visible: true },
    { id: "stats", visible: true },
    { id: "aiSummary", visible: true },
    { id: "sleepComp", visible: true },
    { id: "activities", visible: true },
    { id: "tips", visible: true }
  ];

  sections.forEach((sec) => {
    if (sec.visible === false) return;

    if (sec.id === "stats") {
      const statsH = 438;
      const tp = 16; // top inset so icons/text don't touch the card's top edge
      const lp = 16; // left inset so the left-column icon doesn't touch the card's left edge
      bodySvg += `
<!-- ZONE 2 - STAT ROW 3 COLUMNS -->
<rect x="${pad}" y="${curY}" width="${cw}" height="${statsH}" rx="20" fill="${C.cardBg}" stroke="${C.border}" stroke-width="1.5" filter="url(#cardShadow)"/>
<line x1="${leftEnd}" y1="${curY}" x2="${leftEnd}" y2="${curY + statsH}" stroke="${C.border}" stroke-width="1"/>
<line x1="${rightStart}" y1="${curY}" x2="${rightStart}" y2="${curY + statsH}" stroke="${C.border}" stroke-width="1"/>
${leftStat(pad + lp, curY + tp, iMoon, C.purpleLight, C.purple, "SLEEP TIME", sleepTime, sleepRange, C)}
<text x="${pad + lp + 78}" y="${curY + tp + 103}" font-family="Kanit" font-weight="400" font-size="14" fill="${C.grayLight}">เวลานอนรวม</text>
<line x1="${pad}" y1="${curY + tp + 127}" x2="${leftEnd - 10}" y2="${curY + tp + 127}" stroke="#F1F5F9" stroke-width="1"/>
${leftStat(pad + lp, curY + tp + 143, iClock, C.purpleLight, C.purple, "TIME TO SOUND SLEEP", ttss, ttss === "ไม่มีข้อมูล" ? "-" : "", C)}
<line x1="${pad}" y1="${curY + tp + 270}" x2="${leftEnd - 10}" y2="${curY + tp + 270}" stroke="#F1F5F9" stroke-width="1"/>
${leftStat(pad + lp, curY + tp + 286, iBed, C.purpleLight, C.purple, "SOUND SLEEP", soundSleep, soundSleep === "ไม่มีข้อมูล" ? "-" : "", C)}
${scoreGauge(W / 2, curY + tp + 164, 118, score, grade, C)}
${stars(W / 2, curY + tp + 314, filledStars, 5, 20, C)}
<text x="${W / 2}" y="${curY + tp + 349}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="24" fill="${C.green}">ระดับ ${esc(grade)}</text>
<text x="${W / 2}" y="${curY + tp + 373}" text-anchor="middle" font-family="Kanit" font-weight="400" font-size="15" fill="${C.grayText}">(จาก Sleep Score)</text>
${rightStat(rightStart + 10, curY + tp, iHeart, C.redLight, C.red, "SLEEPING HR (AVG)", hr, hr === "ไม่มีข้อมูล" ? "-" : "", false, C)}
<line x1="${rightStart + 10}" y1="${curY + tp + 88}" x2="${W - pad}" y2="${curY + tp + 88}" stroke="#F1F5F9" stroke-width="1"/>
${rightStat(rightStart + 10, curY + tp + 98, iPulse, C.greenLight, C.green, "HRV (AVG)", hrv, hrv === "ไม่มีข้อมูล" ? "-" : "", false, C)}
<line x1="${rightStart + 10}" y1="${curY + tp + 186}" x2="${W - pad}" y2="${curY + tp + 186}" stroke="#F1F5F9" stroke-width="1"/>
${rightStat(rightStart + 10, curY + tp + 196, iO2, C.cyanLight, C.cyan, "SpO2 (AVG)", spo2, spo2 === "ไม่มีข้อมูล" ? "-" : "", false, C)}
<line x1="${rightStart + 10}" y1="${curY + tp + 284}" x2="${W - pad}" y2="${curY + tp + 284}" stroke="#F1F5F9" stroke-width="1"/>
${rightStat(rightStart + 10, curY + tp + 294, iSunStar, C.yellowLight, C.yellow, "SLEEP EFFICIENCY", efficiency, "ประสิทธิภาพการนอน", true, C)}
`;
      curY += statsH + gap;
    } else if (sec.id === "kieslectRecovery") {
      // ─── DYNAMIC KIESLECT RECOVERY & BODY LOAD PATTERN WIDGET ───
      const kieslectCfg = getKieslectConfig();
      if (kieslectCfg.enableKieslectPattern !== false && data.recoveryPercent != null) {
        const recVal = Number(data.recoveryPercent) || 0;
        const bodyLoadVal = data.bodyLoad != null ? Number(data.bodyLoad) : null;
        const showRecovery = kieslectCfg.showRecoveryGauge !== false;
        const showBodyLoad = kieslectCfg.showBodyLoadGauge !== false && bodyLoadVal != null;

        let recColor = kieslectCfg.colors?.recoveryHigh || "#16A34A";
        let statusLabel = "การฟื้นตัวสมบูรณ์";
        if (recVal < (kieslectCfg.recoveryThresholds?.low || 40)) {
          recColor = kieslectCfg.colors?.recoveryLow || "#DC2626";
          statusLabel = "การฟื้นตัวอยู่ในระดับต่ำ";
        } else if (recVal < (kieslectCfg.recoveryThresholds?.medium || 70)) {
          recColor = kieslectCfg.colors?.recoveryMedium || "#CA8A04";
          statusLabel = "การฟื้นตัวระดับปานกลาง";
        }

        const widgetH = 135;
        bodySvg += `
<!-- ZONE KIESLECT - RECOVERY & BODY LOAD -->
<rect x="${pad}" y="${curY}" width="${cw}" height="${widgetH}" rx="20" fill="${C.cardBg}" stroke="${C.border}" stroke-width="1.5" filter="url(#cardShadow)"/>
<rect x="${pad + 24}" y="${curY + 18}" width="260" height="32" rx="8" fill="${kieslectCfg.colors?.bgBadge || '#FEE2E2'}" stroke="${kieslectCfg.colors?.borderBadge || '#FCA5A5'}" stroke-width="1"/>
<text x="${pad + 36}" y="${curY + 39}" font-family="Kanit" font-weight="700" font-size="14" fill="${recColor}">${esc(kieslectCfg.badgeText || 'KIESLECT HEALTH & RECOVERY')}</text>

${showRecovery ? `
<!-- RECOVERY METRIC -->
<text x="${pad + 310}" y="${curY + 40}" font-family="Kanit" font-weight="600" font-size="15" fill="${C.grayText}">RECOVERY</text>
<text x="${pad + 405}" y="${curY + 43}" font-family="JetBrainsMono" font-weight="800" font-size="32" fill="${recColor}">${recVal}%</text>
<text x="${pad + 480}" y="${curY + 41}" font-family="Kanit" font-weight="500" font-size="15" fill="${recColor}">(${esc(statusLabel)})</text>
<!-- RECOVERY PROGRESS BAR -->
<rect x="${pad + 24}" y="${curY + 80}" width="620" height="18" rx="9" fill="#E2E8F0"/>
<rect x="${pad + 24}" y="${curY + 80}" width="${Math.min(620, Math.max(18, (recVal / 100) * 620))}" height="18" rx="9" fill="${recColor}"/>
` : ""}

${showBodyLoad ? `
<!-- BODY LOAD METRIC -->
<line x1="${pad + 670}" y1="${curY + 15}" x2="${pad + 670}" y2="${curY + 120}" stroke="${C.border}" stroke-width="1"/>
<text x="${pad + 695}" y="${curY + 40}" font-family="Kanit" font-weight="600" font-size="15" fill="${C.grayText}">BODY LOAD</text>
<text x="${pad + 695}" y="${curY + 84}" font-family="JetBrainsMono" font-weight="800" font-size="32" fill="${kieslectCfg.colors?.bodyLoadColor || '#0284C7'}">${bodyLoadVal}</text>
<text x="${pad + 765}" y="${curY + 82}" font-family="Kanit" font-weight="500" font-size="14" fill="${C.grayText}">(ความล้าสะสม)</text>
` : ""}
`;
        curY += widgetH + gap;
      }
      const aiH = 200;
      bodySvg += `
<!-- ZONE 3 - AI SUMMARY -->
<rect x="${pad}" y="${curY}" width="${cw}" height="${aiH}" rx="20" fill="${C.cardBg}" stroke="${C.border}" stroke-width="1.5" filter="url(#cardShadow)"/>
${iCheck(pad + 58, curY + 76, 30, C)}
<text x="${pad + 105}" y="${curY + 63}" font-family="Kanit" font-weight="700" font-size="21" letter-spacing="1" fill="${C.green}">AI SUMMARY</text>
${wrapText(aiSummary, pad + 105, curY + 98, cw - 153, 33, "21", C.navyDark)}
`;
      curY += aiH + gap;
    } else if (sec.id === "sleepComp") {
      const compH = 405;
      bodySvg += `
<!-- ZONE 4 & 5 - SLEEP COMPOSITION & HYPNOGRAM CHART -->
<rect x="${pad}" y="${curY}" width="${cw}" height="${compH}" rx="20" fill="${C.cardBg}" stroke="${C.border}" stroke-width="1.5" filter="url(#cardShadow)"/>
<text x="${pad + 28}" y="${curY + 42}" font-family="Kanit" font-weight="700" font-size="26" fill="${C.green}">${esc(sleepCompTitle)}</text>
${sleepComp(pad + 28, curY + 58, 156, iMoon, C.purpleLight, C.purple, "Deep Sleep", deep.value, deep.percent, C.purple, "หลับลึก", false, C)}
<line x1="${pad + 196}" y1="${curY + 58}" x2="${pad + 196}" y2="${curY + 168}" stroke="${C.border}" stroke-width="1"/>
${sleepComp(pad + 210, curY + 58, 156, iBed, C.blueLight, C.blue, "Light Sleep", light.value, light.percent, C.blue, "หลับตื้น", false, C)}
<line x1="${pad + 378}" y1="${curY + 58}" x2="${pad + 378}" y2="${curY + 168}" stroke="${C.border}" stroke-width="1"/>
${sleepComp(pad + 392, curY + 58, 156, iO2, C.cyanLight, C.cyan, "REM Sleep", rem.value, rem.percent, C.cyanBorder, "ช่วง REM", false, C)}
<line x1="${pad + 560}" y1="${curY + 58}" x2="${pad + 560}" y2="${curY + 168}" stroke="${C.border}" stroke-width="1"/>
${sleepComp(pad + 574, curY + 58, 156, iBriefcase, C.greenLight, C.green, "Restlessness", restless.value, null, null, "กระสับกระส่าย", false, C)}
<line x1="${pad + 742}" y1="${curY + 58}" x2="${pad + 742}" y2="${curY + 168}" stroke="${C.border}" stroke-width="1"/>
${sleepComp(pad + 756, curY + 58, 156, iBell, C.redLight, C.red, "Awake", awake.value, null, null, "ตื่นกลางดึก", true, C)}
${renderHypnogramGraph(pad + 28, curY + 196, cw - 56, 138, data, C)}
`;
      curY += compH + gap;
    } else if (sec.id === "activities") {
      const actH = 80;
      const acts = getDynamicActivities(data);
      bodySvg += `
<!-- ZONE 6 - "วันนี้เหมาะกับ" -->
<rect x="${pad}" y="${curY}" width="${cw}" height="${actH}" rx="40" fill="${C.greenLight}" stroke="${C.greenBorder}" stroke-width="1.5"/>
<text x="${pad + 35}" y="${curY + 48}" font-family="Kanit" font-weight="700" font-size="24" fill="${C.green}">${esc(activitiesTitle)}</text>
${actPill(pad + 195, curY + 7, acts[0].w || 225, acts[0].fn, acts[0].title, acts[0].sub, C)}
${actPill(pad + 435, curY + 7, acts[1].w || 215, acts[1].fn, acts[1].title, acts[1].sub, C)}
${actPill(pad + 665, curY + 7, acts[2].w || 240, acts[2].fn, acts[2].title, acts[2].sub, C)}
`;
      curY += actH + gap;
    } else if (sec.id === "tips") {
      const tipsH = 148;
      bodySvg += `
<!-- ZONE 7 - TIPS -->
<rect x="${pad}" y="${curY}" width="${cw}" height="${tipsH}" rx="20" fill="${C.cardBg}" stroke="${C.border}" stroke-width="1.5" filter="url(#cardShadow)"/>
${iBulb(pad + 48, curY + 58, 24, C.yellow)}
<text x="${pad + 90}" y="${curY + 45}" font-family="Kanit" font-weight="700" font-size="23" fill="${C.yellow}">${esc(tipsTitle)}</text>
${wrapText(tips, pad + 90, curY + 82, cw - 130, 36, "23", C.navyDark, 2)}
`;
      curY += tipsH + gap;
    }
  });

  const headerSec = sections.find(s => s.id === "header");
  const isHeaderVisible = headerSec ? headerSec.visible !== false : true;

  const headerSvg = isHeaderVisible ? `
<!-- ZONE 1 - HEADER -->
<text x="${W / 2}" y="64" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="37" fill="${C.navyDark}">${esc(brandTitle)}</text>
<text x="${W / 2}" y="94" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="16" letter-spacing="3" fill="${C.green}">${esc(headerSubtitle)}</text>
<text x="${W / 2}" y="152" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="42" fill="${C.navyDark}">${esc(headline)}</text>
<text x="${W / 2}" y="190" text-anchor="middle" font-family="Kanit" font-weight="400" font-size="19" fill="${C.grayText}">${esc(headerSubtext)}</text>
<rect x="${W - pad - 248}" y="42" width="248" height="78" rx="16" fill="${C.greenLight}" stroke="${C.greenBorder}" stroke-width="1.5"/>
${iCalendar(W - pad - 220, 80, 17, C.green)}
<text x="${W - pad - 192}" y="71" font-family="Kanit" font-weight="600" font-size="16" fill="${C.navyDark}">${esc(currentThaiDate())}</text>
<text x="${W - pad - 192}" y="92" font-family="Kanit" font-weight="400" font-size="13" fill="${C.grayText}">ข้อมูลจากแอปพลิเคชัน</text>
<text x="${W - pad - 192}" y="108" font-family="Kanit" font-weight="600" font-size="13" fill="${C.green}">(${esc(appName)})</text>
` : "";

  const totalH = Math.max(H, curY + 65);
  const footerY = totalH - 56;
  const natureBgSvg = buildNatureBg(totalH);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" width="${W}" height="${totalH}">
<defs>
  <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="110%">
    <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#0F172A" flood-opacity="0.05"/>
  </filter>
</defs>

<!-- CANVAS NATURE BACKDROP & SHADOWS -->
${natureBgSvg}

${headerSvg}
${bodySvg}

<!-- FOOTER -->
<rect x="0" y="${footerY}" width="${W}" height="56" fill="${C.greenDark}"/>
<text x="${W / 2}" y="${footerY + 33}" text-anchor="middle" font-family="Kanit" font-weight="400" font-size="14" fill="${C.white}">${esc(disclaimer)}</text>

</svg>`;
}
