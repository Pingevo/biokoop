// foodCardTemplate.js — SVG การ์ดผลวิเคราะห์โภชนาการอาหาร (โทนเดียวกับ weeklyReportTemplate)
// input: { menu, items:[{name,gram,kcal,carb,protein,fat}], total:{gram,kcal,carb,protein,fat,satFat,unsatFat,sugar,sodium,fiber}, note }
import { DEFAULT_WEEKLY_THEME } from "./weeklyReportTemplate.js";

const T = DEFAULT_WEEKLY_THEME;
const W = 1024;
const PAD = 56;

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)))
  ? "–" : Number(v).toLocaleString("en-US");

export function renderFoodCardSvg(d) {
  const items = Array.isArray(d?.items) ? d.items.filter((x) => x && x.name) : [];
  const t = d?.total || {};
  const menu = d?.menu || "อาหารในรูป";

  const rowH = 62;
  const headH = 60;
  const tableTop = 246;
  const tableW = W - PAD * 2;
  const tableH = headH + items.length * rowH + rowH; // + แถวรวม
  const chipsY = tableTop + tableH + 40;
  const chipsH = 128;
  const noteY = chipsY + chipsH + 44;
  const noteLines = d?.note ? [String(d.note)] : [];
  const H = noteY + noteLines.length * 40 + 96;

  // คอลัมน์ตาราง (x ขวาสุดของแต่ละคอลัมน์ตัวเลข)
  const cx = {
    name: PAD + 24,
    gram: 520, kcal: 640, carb: 760, protein: 880, fat: PAD + tableW - 24,
  };
  const tableRight = PAD + tableW;

  const th = (x, label, anchor = "end") =>
    `<text x="${x}" y="${tableTop + 39}" text-anchor="${anchor}" font-family="Kanit" font-weight="600" font-size="22" fill="#FFFFFF">${label}</text>`;

  const itemRows = items.map((it, i) => {
    const y = tableTop + headH + i * rowH;
    const cy = y + 40;
    const bg = i % 2 ? `<rect x="${PAD}" y="${y}" width="${tableW}" height="${rowH}" fill="${T.lightBg}"/>` : "";
    const td = (x, v, anchor = "end") =>
      `<text x="${x}" y="${cy}" text-anchor="${anchor}" font-family="Kanit" font-weight="400" font-size="24" fill="${T.sub}">${num(v)}</text>`;
    return `${bg}
<text x="${cx.name}" y="${cy}" font-family="Kanit" font-weight="500" font-size="24" fill="${T.ink}">${esc(it.name)}</text>
${td(cx.gram, it.gram)}${td(cx.kcal, it.kcal)}${td(cx.carb, it.carb)}${td(cx.protein, it.protein)}${td(cx.fat, it.fat)}`;
  }).join("\n");

  const totY = tableTop + headH + items.length * rowH;
  const totCy = totY + 41;
  const tt = (x, v, anchor = "end") =>
    `<text x="${x}" y="${totCy}" text-anchor="${anchor}" font-family="Kanit" font-weight="700" font-size="24" fill="${T.ink}">${num(v)}</text>`;

  const chipDefs = [
    ["ไขมันอิ่มตัว", t.satFat, "g"],
    ["ไขมันไม่อิ่มตัว", t.unsatFat, "g"],
    ["น้ำตาล", t.sugar, "g"],
    ["โซเดียม", t.sodium, "mg"],
    ["ใยอาหาร", t.fiber, "g"],
  ];
  const chipGap = 16;
  const chipW = (tableW - chipGap * (chipDefs.length - 1)) / chipDefs.length;
  const chips = chipDefs.map(([label, v, u], i) => {
    const x = PAD + i * (chipW + chipGap);
    return `<rect x="${x}" y="${chipsY}" width="${chipW}" height="${chipsH}" rx="16" fill="${T.lightBg}" stroke="${T.border}" stroke-width="1.5"/>
<text x="${x + chipW / 2}" y="${chipsY + 40}" text-anchor="middle" font-family="Kanit" font-weight="500" font-size="20" fill="${T.muted}">${label}</text>
<text x="${x + chipW / 2}" y="${chipsY + 92}" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="30" fill="${T.ink}">${num(v)}<tspan font-size="20" font-weight="500" fill="${T.faint}"> ${u}</tspan></text>`;
  }).join("\n");

  const noteSvg = noteLines.map((l, i) =>
    `<text x="${PAD}" y="${noteY + 10 + i * 40}" font-family="Kanit" font-weight="400" font-size="24" fill="${T.sub}">${esc(l)}</text>`
  ).join("\n");
  const footY = noteY + noteLines.length * 40 + 34;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#FFFFFF"/>
<rect x="0" y="0" width="${W}" height="10" fill="${T.amber}"/>

<!-- header -->
<text x="${PAD}" y="86" font-family="Kanit" font-weight="600" font-size="22" fill="${T.faint}" letter-spacing="3">BIOKOOP · NUTRITION ANALYSIS</text>
<circle cx="${PAD + 32}" cy="132" r="30" fill="${T.amber}"/>
<g transform="translate(${PAD + 32}, 132)">
<line x1="-9" y1="-4" x2="-9" y2="14" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>
<path d="M-14 -14v8c0 3.4 10 3.4 10 0v-8" fill="none" stroke="#fff" stroke-width="3.4"/>
<line x1="-9" y1="-14" x2="-9" y2="-6" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
<circle cx="8" cy="0" r="11" fill="none" stroke="#fff" stroke-width="3.4"/>
<circle cx="8" cy="0" r="5.6" fill="none" stroke="#fff" stroke-width="2.6"/>
</g>
<text x="${PAD + 78}" y="146" font-family="Kanit" font-weight="800" font-size="50" fill="${T.ink}">${esc(menu)}</text>
<text x="${W - PAD}" y="146" text-anchor="end" font-family="Kanit" font-weight="800" font-size="46" fill="${T.amber}">${num(t.kcal)}<tspan font-size="26" font-weight="600" fill="${T.faint}"> kcal</tspan></text>
<line x1="${PAD}" y1="190" x2="${W - PAD}" y2="190" stroke="${T.border}" stroke-width="2"/>
<text x="${PAD}" y="222" font-family="Kanit" font-weight="500" font-size="22" fill="${T.muted}">ส่วนประกอบรายชิ้น — ประเมินน้ำหนักเทียบขนาดมาตรฐาน</text>

<!-- ตารางวัตถุดิบ -->
<rect x="${PAD}" y="${tableTop}" width="${tableW}" height="${headH}" rx="14" fill="${T.ink}"/>
<rect x="${PAD}" y="${tableTop + headH - 16}" width="${tableW}" height="16" fill="${T.ink}"/>
${th(cx.name, "วัตถุดิบ", "start")}${th(cx.gram, "กรัม")}${th(cx.kcal, "kcal")}${th(cx.carb, "carb")}${th(cx.protein, "protein")}${th(cx.fat, "fat")}
${itemRows}
<rect x="${PAD}" y="${totY}" width="${tableW}" height="${rowH}" fill="${T.amberLight}"/>
<text x="${cx.name}" y="${totCy}" font-family="Kanit" font-weight="700" font-size="24" fill="${T.ink}">รวมทั้งจาน</text>
${tt(cx.gram, t.gram)}${tt(cx.kcal, t.kcal)}${tt(cx.carb, t.carb)}${tt(cx.protein, t.protein)}${tt(cx.fat, t.fat)}
<rect x="${PAD}" y="${tableTop}" width="${tableW}" height="${tableH}" rx="14" fill="none" stroke="${T.border}" stroke-width="2"/>

<!-- chips สารอาหารย่อย -->
${chips}

<!-- footer -->
${noteSvg}
<text x="${PAD}" y="${footY}" font-family="Kanit" font-weight="400" font-size="20" fill="${T.faint}">(ประเมินจากภาพเทียบขนาดมาตรฐาน — ค่าจริงอาจต่างเล็กน้อย)</text>
<text x="${W - PAD}" y="${footY}" text-anchor="end" font-family="Kanit" font-weight="600" font-size="20" fill="${T.faint}">biokoop × Kieslect</text>
</svg>`;
}
