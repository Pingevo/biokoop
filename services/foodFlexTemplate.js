// foodFlexTemplate.js — LINE Flex Message ผลวิเคราะห์โภชนาการอาหาร (เลย์เอาต์เดียวกับ foodCardTemplate)
// input: { menu, items:[{name,qty,unit,gram,kcal,carb,protein,fat}], total:{gram,kcal,carb,protein,fat,satFat,unsatFat,sugar,sodium,fiber}, note }
import { DEFAULT_WEEKLY_THEME } from "./weeklyReportTemplate.js";

const T = DEFAULT_WEEKLY_THEME;

const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)))
  ? "–" : Number(v).toLocaleString("en-US");

const txt = (text, opt = {}) => ({ type: "text", text: String(text ?? ""), ...opt });

// ช่องตัวเลขชิดขวาในตาราง
const td = (v, opt = {}) => txt(num(v), {
  size: "xxs", align: "end", flex: 2, color: T.sub, gravity: "center", ...opt,
});

function itemRow(it, alt) {
  const nameBox = {
    type: "box", layout: "vertical", flex: 5, spacing: "none",
    contents: [txt(it.name, { size: "xs", weight: "bold", color: T.ink, wrap: true })],
  };
  const qty = Number(it.qty);
  const unit = it.unit ? String(it.unit) : "";
  if ((qty > 0 && qty !== 1) || (qty > 0 && unit)) {
    nameBox.contents.push(txt(
      qty > 0 && unit ? `${num(qty)} ${unit}` : (unit || `×${num(qty)}`),
      { size: "xxs", color: T.muted, wrap: true }
    ));
  }
  return {
    type: "box", layout: "horizontal", paddingAll: "8px", spacing: "sm",
    ...(alt ? { backgroundColor: T.lightBg } : {}),
    contents: [nameBox, td(it.gram), td(it.kcal), td(it.carb), td(it.protein), td(it.fat)],
  };
}

function chip(label, value, unit) {
  return {
    type: "box", layout: "vertical", flex: 1, backgroundColor: T.lightBg,
    cornerRadius: "8px", paddingAll: "6px", spacing: "none",
    contents: [
      txt(label, { size: "xxs", color: T.muted, align: "center", wrap: true }),
      txt(`${num(value)}`, { size: "sm", weight: "bold", color: T.ink, align: "center" }),
      txt(unit, { size: "xxs", color: T.faint, align: "center" }),
    ],
  };
}

export function buildFoodFlex(d) {
  const items = Array.isArray(d?.items) ? d.items.filter((x) => x && x.name) : [];
  const t = d?.total || {};
  const menu = d?.menu || "อาหารในรูป";

  const headCell = (label, opt = {}) => txt(label, {
    size: "xxs", color: "#FFFFFF", align: "end", flex: 2, gravity: "center", ...opt,
  });

  const tableHead = {
    type: "box", layout: "horizontal", backgroundColor: T.ink,
    cornerRadius: "8px", paddingAll: "8px", spacing: "sm",
    contents: [
      txt("วัตถุดิบ", { size: "xxs", color: "#FFFFFF", flex: 5, weight: "bold", gravity: "center" }),
      headCell("กรัม"), headCell("แคล"), headCell("คาร์บ"), headCell("โปรตีน"), headCell("ไขมัน"),
    ],
  };

  const totalRow = {
    type: "box", layout: "horizontal", backgroundColor: T.amberLight,
    cornerRadius: "8px", paddingAll: "8px", spacing: "sm",
    contents: [
      txt("รวมทั้งจาน", { size: "xs", weight: "bold", color: T.ink, flex: 5, gravity: "center" }),
      td(t.gram, { weight: "bold", color: T.ink }), td(t.kcal, { weight: "bold", color: T.ink }),
      td(t.carb, { weight: "bold", color: T.ink }), td(t.protein, { weight: "bold", color: T.ink }),
      td(t.fat, { weight: "bold", color: T.ink }),
    ],
  };

  const body = [
    txt("BIOKOOP · วิเคราะห์โภชนาการอาหาร", { size: "xxs", color: T.faint }),
    {
      type: "box", layout: "horizontal", spacing: "md",
      contents: [
        txt(`🍽️ ${menu}`, { size: "lg", weight: "bold", color: T.ink, flex: 1, wrap: true }),
        txt(`${num(t.kcal)}`, { size: "xl", weight: "bold", color: T.amber, align: "end", flex: 0 }),
      ],
    },
    txt("ส่วนประกอบรายชิ้น — ประเมินเทียบขนาดมาตรฐาน", { size: "xxs", color: T.muted }),
    { type: "box", layout: "vertical", spacing: "none", contents: [tableHead, ...items.map((it, i) => itemRow(it, i % 2 === 1)), totalRow] },
    {
      type: "box", layout: "horizontal", spacing: "sm",
      contents: [
        chip("อิ่มตัว", t.satFat, "ก."), chip("ไม่อิ่มตัว", t.unsatFat, "ก."),
        chip("น้ำตาล", t.sugar, "ก."), chip("โซเดียม", t.sodium, "มก."), chip("ใยอาหาร", t.fiber, "ก."),
      ],
    },
  ];

  if (d?.note) {
    body.push(txt(`💬 ${d.note}`, { size: "xs", color: T.sub, wrap: true }));
  }
  body.push({ type: "separator", color: T.border });
  body.push(txt("ประเมินจากภาพเทียบขนาดมาตรฐาน — ค่าจริงอาจต่างเล็กน้อย · biokoop × Kieslect",
    { size: "xxs", color: T.faint, wrap: true }));

  return {
    type: "flex",
    altText: `🍽️ ${menu} — รวมประมาณ ${num(t.kcal)} แคล`,
    contents: {
      type: "bubble",
      size: "mega",
      body: { type: "box", layout: "vertical", paddingAll: "14px", spacing: "sm", contents: body },
    },
  };
}

// bubble "กำลังวิเคราะห์" ส่งทันทีตอนรับรูปโภชนาการ — flex ทำ animation จริงไม่ได้ ใช้สัญลักษณ์โหลด + loading dots ของ LINE คู่กัน
export function buildFoodLoadingFlex() {
  const dot = (bg) => ({
    type: "box", layout: "vertical", width: "10px", height: "10px",
    cornerRadius: "10px", backgroundColor: bg, contents: [],
  });
  return {
    type: "flex",
    altText: "⏳ กำลังวิเคราะห์โภชนาการอาหาร…",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box", layout: "vertical", paddingAll: "16px", spacing: "md",
        contents: [
          txt("BIOKOOP · วิเคราะห์โภชนาการอาหาร", { size: "xxs", color: T.faint }),
          {
            type: "box", layout: "horizontal", spacing: "md",
            contents: [
              txt("🍽️", { size: "3xl", flex: 0, gravity: "center" }),
              {
                type: "box", layout: "vertical", flex: 1, spacing: "xs",
                contents: [
                  txt("กำลังวิเคราะห์ภาพอาหาร", { size: "md", weight: "bold", color: T.ink, wrap: true }),
                  txt("AI กำลังแยกส่วนประกอบและคำนวณค่าโภชนาการให้นะคะ", { size: "xs", color: T.sub, wrap: true }),
                ],
              },
            ],
          },
          {
            type: "box", layout: "vertical", backgroundColor: T.lightBg,
            cornerRadius: "8px", paddingAll: "10px",
            contents: [
              {
                type: "box", layout: "horizontal", spacing: "sm", justifyContent: "center",
                contents: [dot(T.amber), dot("#FBBF24"), dot("#FDE68A")],
              },
            ],
          },
          txt("โดยปกติใช้เวลาไม่กี่วินาทีค่ะ", { size: "xxs", color: T.faint, align: "center" }),
        ],
      },
    },
  };
}
