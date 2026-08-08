// richMenuTemplate.js
// สร้าง SVG ภาพพื้นหลังสำหรับ LINE Rich Menu ของ biokoop
// ขนาดมาตรฐาน LINE (large): 2500x1686
// เลย์เอาต์: Hero CTA "ถ่ายภาพวิเคราะห์" ใหญ่สุดด้านบน + เมนูรอง 4 ปุ่มด้านล่าง

export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 1686;
export const HERO_HEIGHT = 985;

// ธีมสีของระบบ biokoop: ขาว / แดง / ดำ (ตามที่ใช้ใน replyRegistrationPrompt)
const C = {
  red: "#dc2626",
  redDeep: "#7f1d1d",
  redLight: "#FEE2E2",
  black: "#09090b",
  black2: "#18181b",
  grayText: "#71717a",
  white: "#FFFFFF",
  whiteDim: "rgba(255,255,255,0.72)",
  border: "#E4E4E7",
};

// ปุ่มหลัก (ใหญ่สุด บนสุด) — เปิดแกลเลอรีเลือกรูปภาพเพื่อวิเคราะห์
export const HERO_BUTTON = {
  text: "เลือกภาพเพื่อวิเคราะห์",
  label: "เลือกภาพเพื่อวิเคราะห์",
};

// ปุ่มเมนูรอง 4 ปุ่ม พร้อม action ที่ LINE จะยิงเป็น message action
// text ต้องตรงกับที่ routes/webhook.js ใช้ตรวจจับคำสั่ง
export const RICH_MENU_BUTTONS = [
  { key: "register", icon: "user", label: "ลงทะเบียน", sub: "แก้ไขข้อมูล", text: "ลงทะเบียน" },
  { key: "howto", icon: "book", label: "วิธีใช้งาน", sub: "เริ่มต้นใช้งาน", text: "วิธีใช้งาน" },
  { key: "latest", icon: "image", label: "ผลลัพธ์ล่าสุด", sub: "ดูการ์ดล่าสุด", text: "ผลลัพธ์ล่าสุด" },
  { key: "contact", icon: "chat", label: "ติดต่อสอบถาม", sub: "แอดมิน biokoop", text: "ติดต่อสอบถาม" },
];

function iUser(cx, cy, r, col) {
  const sw = r * 0.16;
  return `<circle cx="${cx}" cy="${cy - r * 0.35}" r="${r * 0.4}" fill="none" stroke="${col}" stroke-width="${sw}"/>
<path d="M${cx - r * 0.75} ${cy + r * 0.7}a${r * 0.75} ${r * 0.6} 0 0 1 ${r * 1.5} 0" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`;
}

function iBook(cx, cy, r, col) {
  const sw = r * 0.14;
  return `<path d="M${cx} ${cy - r * 0.6}c-${r * 0.3}-${r * 0.25} -${r * 0.7}-${r * 0.3} -${r * 0.95}-${r * 0.15}v${r * 1.3}c${r * 0.25}-${r * 0.15} ${r * 0.65}-${r * 0.1} ${r * 0.95} ${r * 0.15}c${r * 0.3}-${r * 0.25} ${r * 0.7}-${r * 0.3} ${r * 0.95}-${r * 0.15}v-${r * 1.3}c-${r * 0.25}-${r * 0.15} -${r * 0.65}-${r * 0.1} -${r * 0.95} ${r * 0.15}Z" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round"/>
<line x1="${cx}" y1="${cy - r * 0.6}" x2="${cx}" y2="${cy + r * 0.7}" stroke="${col}" stroke-width="${sw}"/>`;
}

function iImage(cx, cy, r, col) {
  const sw = r * 0.14;
  return `<rect x="${cx - r}" y="${cy - r * 0.75}" width="${r * 2}" height="${r * 1.5}" rx="${r * 0.18}" fill="none" stroke="${col}" stroke-width="${sw}"/>
<circle cx="${cx - r * 0.5}" cy="${cy - r * 0.3}" r="${r * 0.18}" fill="${col}"/>
<path d="M${cx - r * 0.85} ${cy + r * 0.55}l${r * 0.55}-${r * 0.6}l${r * 0.4} ${r * 0.4}l${r * 0.5}-${r * 0.55}l${r * 0.55} ${r * 0.75}Z" fill="${col}"/>`;
}

function iChat(cx, cy, r, col) {
  const sw = r * 0.14;
  return `<path d="M${cx - r} ${cy - r * 0.6}h${r * 2}a${r * 0.2} ${r * 0.2} 0 0 1 ${r * 0.2} ${r * 0.2}v${r * 0.9}a${r * 0.2} ${r * 0.2} 0 0 1 -${r * 0.2} ${r * 0.2}h-${r * 1.2}l-${r * 0.4} ${r * 0.4}v-${r * 0.4}h-${r * 0.6}a${r * 0.2} ${r * 0.2} 0 0 1 -${r * 0.2}-${r * 0.2}v-${r * 0.9}a${r * 0.2} ${r * 0.2} 0 0 1 ${r * 0.2}-${r * 0.2}Z" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

function iCamera(cx, cy, r, col) {
  const sw = r * 0.15;
  return `<rect x="${cx - r * 0.35}" y="${cy - r * 0.95}" width="${r * 0.7}" height="${r * 0.32}" rx="${r * 0.08}" fill="${col}"/>
<rect x="${cx - r}" y="${cy - r * 0.65}" width="${r * 2}" height="${r * 1.55}" rx="${r * 0.28}" fill="none" stroke="${col}" stroke-width="${sw}"/>
<circle cx="${cx}" cy="${cy + r * 0.15}" r="${r * 0.48}" fill="none" stroke="${col}" stroke-width="${sw}"/>
<circle cx="${cx}" cy="${cy + r * 0.15}" r="${r * 0.18}" fill="${col}"/>`;
}

function iSparkle(cx, cy, r, col) {
  return `<path d="M${cx} ${cy - r}L${cx + r * 0.28} ${cy - r * 0.28}L${cx + r} ${cy}L${cx + r * 0.28} ${cy + r * 0.28}L${cx} ${cy + r}L${cx - r * 0.28} ${cy + r * 0.28}L${cx - r} ${cy}L${cx - r * 0.28} ${cy - r * 0.28}Z" fill="${col}"/>`;
}

const ICONS = { user: iUser, book: iBook, image: iImage, chat: iChat };

function esc(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// เส้นคลื่นชีพจร (heartbeat/AI data) ตกแต่งพื้นหลัง hero แบบจางๆ
function pulseLine(y, w, col, opacity) {
  const x0 = 0;
  const seg = w / 12;
  let d = `M${x0} ${y}`;
  for (let i = 0; i < 12; i++) {
    const x = x0 + i * seg;
    if (i % 4 === 1) d += ` L${x + seg * 0.25} ${y - 46} L${x + seg * 0.5} ${y + 60} L${x + seg * 0.75} ${y}`;
    else d += ` L${x + seg} ${y}`;
  }
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
}

export function renderRichMenuImage() {
  const W = RICH_MENU_WIDTH;
  const H = RICH_MENU_HEIGHT;
  const heroH = HERO_HEIGHT;

  // ── HERO: ปุ่มถ่ายภาพวิเคราะห์ (ใหญ่สุด, พื้นหลังไล่สีดำ-แดงพร้อมแสงเรือง) ──
  const heroCx = W / 2;
  const camR = 178;
  const camCy = 335;

  const hero = `
<rect x="0" y="0" width="${W}" height="${heroH + 90}" fill="url(#heroGrad)"/>
<circle cx="${W - 260}" cy="120" r="420" fill="url(#glowRed)"/>
<circle cx="230" cy="${heroH - 120}" r="360" fill="url(#glowRed)"/>
${pulseLine(camCy + 460, W, C.white, 0.08)}

<!-- AI badge -->
<rect x="100" y="80" width="540" height="108" rx="54" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
${iSparkle(180, 134, 23, C.white)}
<text x="222" y="150" font-family="Kanit" font-weight="600" font-size="43" fill="${C.white}">AI Health Assistant</text>

<!-- camera icon badge -->
<circle cx="${heroCx}" cy="${camCy}" r="${camR}" fill="url(#camBadge)"/>
${iCamera(heroCx, camCy, camR * 0.5, C.white)}

<text x="${heroCx}" y="${camCy + camR + 122}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="122" fill="${C.white}">${esc(HERO_BUTTON.label)}</text>
<text x="${heroCx}" y="${camCy + camR + 190}" text-anchor="middle" font-family="Kanit" font-weight="400" font-size="52" fill="${C.whiteDim}">เปิดแกลเลอรีเลือกรูปภาพ • AI ประมวลผลอัตโนมัติ</text>

<!-- CTA pill -->
<rect x="${heroCx - 560}" y="${camCy + camR + 238}" width="1120" height="136" rx="68" fill="${C.white}"/>
<text x="${heroCx}" y="${camCy + camR + 322}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="56" fill="${C.red}">แตะตรงนี้เพื่อเลือกภาพจากแกลเลอรี</text>
`;

  // ── เมนูรอง 4 ปุ่ม ──
  const colW = W / RICH_MENU_BUTTONS.length;
  const bottomH = H - heroH;
  const cy = heroH + bottomH * 0.4;
  const r = 160;

  let cols = "";
  RICH_MENU_BUTTONS.forEach((btn, i) => {
    const cx = colW * i + colW / 2;
    const iconFn = ICONS[btn.icon];

    if (i > 0) {
      cols += `<line x1="${colW * i}" y1="${heroH + 40}" x2="${colW * i}" y2="${H - 40}" stroke="${C.border}" stroke-width="3"/>`;
    }

    cols += `
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.redLight}"/>
${iconFn(cx, cy, r * 0.52, C.red)}
<text x="${cx}" y="${cy + r + 84}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="68" fill="${C.black}">${esc(btn.label)}</text>
<text x="${cx}" y="${cy + r + 140}" text-anchor="middle" font-family="Kanit" font-weight="400" font-size="42" fill="${C.grayText}">${esc(btn.sub)}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
  <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${C.black}"/>
    <stop offset="55%" stop-color="${C.black2}"/>
    <stop offset="100%" stop-color="${C.redDeep}"/>
  </linearGradient>
  <radialGradient id="glowRed" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="${C.red}" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="${C.red}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="camBadge" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${C.red}"/>
    <stop offset="100%" stop-color="#991b1b"/>
  </linearGradient>
</defs>

<rect width="${W}" height="${H}" fill="${C.white}"/>
${hero}
<path d="M0 ${heroH - 60} Q ${W / 2} ${heroH + 50} ${W} ${heroH - 60} L${W} ${H} L0 ${H} Z" fill="${C.white}"/>

${cols}
</svg>`;
}
