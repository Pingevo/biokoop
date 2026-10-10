// seed_userbot.mjs — สร้างลูกค้าทดสอบ "userbot" พร้อม rawextractions ตามสเปก
//   ก.ค.  = ครบทั้งเดือน (รายสัปดาห์ + รายวันทุกวัน)
//   ส.ค.  = ไม่มีข้อมูลเลย
//   ก.ย.  = W1 ครบ / W2 มีช่วงแต่รายวันบางวัน / W3 ไม่มี / W4 มีช่วง รายวันบางวัน
//   ต.ค.  = ครบบ้างไม่ครบบ้าง จนถึง 7 ต.ค. — วันนี้ (8 ต.ค.) ไม่มีข้อมูล
//   ซ้ำ: DUPS = ชุดซ้อนทับวันเดิม ค่าต่างกัน (จำลองลูกค้าส่งรายงานซ้ำ) — สูงสุด 10 ชุด/วัน
// รัน: node scripts/seed_userbot.mjs
import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../models/User.js";

const UID = "userbot";
const BKK = 7 * 3600_000;
const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day) - BKK); // เที่ยงคืน BKK → UTC Date
const WD = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]; // JS getUTCDay: 0=อา

// rng deterministic — ค่าสุ่มคงที่ทุกรัน
const rng = (seed => () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296)(42);
const rint = (a, b) => a + Math.round(rng() * (b - a));
const r1 = (a, b) => Math.round((a + rng() * (b - a)) * 100) / 100;

// สร้าง series ยาว n — mask[i]=true = มีข้อมูลวันนั้น, false = null ทุก field
function makeSeries(n, mask) {
  const gen = (f) => Array.from({ length: n }, (_, i) => (mask[i] ? f() : null));
  return {
    bodyLoad: gen(() => rint(35, 95)),
    recovery: gen(() => rint(45, 98)),
    hrv: gen(() => rint(28, 65)),
    rhr: gen(() => rint(54, 72)),
    sleepQ: gen(() => rint(55, 96)),
    hoursVsNeeded: gen(() => r1(5.2, 8.6)),
    hoursNeeded: gen(() => 8),
    consistency: gen(() => rint(45, 95)),
    steps: gen(() => rint(3000, 14000)),
  };
}

const lastOf = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };
const hhmm = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

function buildRawResult(from, n, mask, s) {
  const labels = Array.from({ length: n }, (_, i) => {
    const dd = new Date(from.getTime() + i * 86400000 + BKK); // +7h → อ่านเป็นเวลา BKK ผ่าน UTC getter
    return `${WD[dd.getUTCDay()]} ${dd.getUTCDate()}`;
  });
  return {
    detected: true,
    appName: "Kieslect App",
    foundPages: ["body_load", "recovery", "sleep_quality"],
    days: labels,
    pages: {
      body_load: {
        rings: { bodyLoad: { value: String(lastOf(s.bodyLoad) ?? "-") } },
        today: { hrZone13: "1:45", hrZone45: "0:28", strength: "0:15", steps: String(lastOf(s.steps) ?? "-") },
        charts: { bodyLoadSeries: s.bodyLoad },
        allVisibleMetrics: [
          { label: "ก้าว", value: String(lastOf(s.steps) ?? "-"), unit: "" },
          { label: "แคลอรี่", value: String(rint(1600, 2600)), unit: "kcal" },
        ],
        otherTexts: ["ภาระร่างกาย", "Kstyle OS"],
      },
      recovery: {
        rings: { recoveryPercent: lastOf(s.recovery) },
        today: { hrv: lastOf(s.hrv), restingHeartRate: lastOf(s.rhr), sleepQualityPercent: lastOf(s.sleepQ) },
        charts: {
          recoverySeries: s.recovery,
          hrvSeries: s.hrv,
          rhrSeries: s.rhr,
          sleepQualitySeries: s.sleepQ,
        },
        allVisibleMetrics: [
          { label: "การฟื้นตัว", value: String(lastOf(s.recovery) ?? "-"), unit: "%" },
          { label: "อัตราการเต้นของหัวใจขณะพัก", value: String(lastOf(s.rhr) ?? "-"), unit: "" },
        ],
        otherTexts: ["การฟื้นตัว", "Kstyle OS"],
      },
      sleep_quality: {
        rings: { qualityPercent: lastOf(s.sleepQ) },
        today: {
          duration: hhmm(lastOf(s.hoursVsNeeded) ?? 7),
          durationNote: "0:00",
          efficiencyPercent: rint(82, 100),
          consistencyPercent: lastOf(s.consistency),
          highStressPercent: rint(0, 12),
        },
        sleepStages: {
          light: { percent: 62, time: "4:20" },
          deep: { percent: 18, time: "1:16" },
          rem: { percent: 15, time: "1:02" },
          awake: { percent: 5, time: "0:21" },
        },
        restorativeSleep: { value: "2:18", compare: "0:00" },
        charts: {
          qualitySeries: s.sleepQ,
          hoursVsNeededSeries: s.hoursVsNeeded,
          hoursNeededSeries: s.hoursNeeded,
          consistencySeries: s.consistency,
        },
        bedtimeWakeTable: [],
        allVisibleMetrics: [
          { label: "เวลานอนทั้งหมด", value: hhmm(lastOf(s.hoursVsNeeded) ?? 7), unit: "" },
          { label: "ประสิทธิภาพการนอนหลับ", value: String(rint(82, 100)), unit: "%" },
        ],
        otherTexts: ["การนอนหลับ", "Kstyle OS"],
      },
    },
    unmappedValues: [],
    lowConfidenceFields: [],
    confidence: 0.95,
    notes: "seed data (userbot) — ข้อมูลทดสอบ ไม่ใช่ของจริง",
  };
}

// recs: [fromDate, nDays, maskOrNull(=ครบทุกวัน)]
const RECS = [
  // ── กรกฎาคม 2026: ครบทั้งเดือน (5 records = 31 วัน) ──
  [d(2026, 7, 1), 7, null], [d(2026, 7, 8), 7, null], [d(2026, 7, 15), 7, null],
  [d(2026, 7, 22), 7, null], [d(2026, 7, 29), 3, null],
  // ── สิงหาคม: ไม่มี ──
  // ── กันยายน ──
  [d(2026, 9, 1), 7, null],                                              // W1 ครบ
  [d(2026, 9, 8), 7, [1, 1, 0, 0, 1, 0, 1]],                             // W2 ช่วงครบ รายวันมีแค่ 8,9,12,14
  // W3 (15-21): ไม่มี
  [d(2026, 9, 22), 7, [1, 0, 1, 1, 0, 0, 1]],                            // W4 ช่วงครบ รายวัน 22,24,25,28
  // ── ตุลาคม ถึงปัจจุบัน (วันนี้ 8 ต.ค. = ไม่มีข้อมูล) ──
  [d(2026, 10, 1), 4, null],                                             // 1-4 ครบ
  [d(2026, 10, 5), 3, [1, 0, 1]],                                        // 5-7 มีช่วง — 6 ต.ค. ไม่มีรายวัน
];

// ชุดซ้อนทับ — [from, nDays, mask, copies] ค่าต่างจากชุดหลัก (rng เดินต่อ) + createdAt ไล่ทีหลัง
const DUPS = [
  [d(2026, 7, 15), 7, null, 2],                                          // จ. 15-21 ก.ค. = รวม 3 ชุด/วัน
  [d(2026, 9, 1), 7, null, 1],                                           // W1 ก.ย. = รวม 2 ชุด/วัน
  [d(2026, 10, 1), 4, null, 9],                                          // ต.ค. 1-4 = รวม 10 ชุด/วัน
];

await mongoose.connect(process.env.MONGODB_URI);
const col = mongoose.connection.db.collection("rawextractions");

// เคลียร์ของเก่าก่อน (idempotent)
const del = await col.deleteMany({ lineUserId: UID });
if (del.deletedCount) console.log(`ลบ extraction เก่าของ ${UID}: ${del.deletedCount} docs`);

let totalDays = 0, coveredDays = 0, recCount = 0;
async function insertRec(from, n, mask, model, createdOffsetMs) {
  const m = mask || Array(n).fill(1);
  const to = new Date(from.getTime() + (n - 1) * 86400000);
  const s = makeSeries(n, m);
  const created = new Date(to.getTime() + 10 * 3600_000 + createdOffsetMs); // ส่งรายงานหลังจบสัปดาห์ ~10 ชม.
  const rr = buildRawResult(from, n, m, s);
  if (model.endsWith("-dup")) rr.notes = `seed data (userbot) — ชุดซ้ำทับวันเดิม ค่าต่างกัน ทดสอบหลาย record/วัน`;
  await col.insertOne({
    lineUserId: UID,
    weekOf: from,
    dataFrom: from,
    dataTo: to,
    model,
    keyLabel: "seed",
    imageCount: 3,
    status: "success",
    rawResult: rr,
    promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0,
    errorMessage: "",
    createdAt: created,
    updatedAt: created,
  });
  const nd = m.filter(Boolean).length;
  totalDays += n; coveredDays += nd; recCount++;
  console.log(`${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}  | รายวัน ${nd}/${n} วัน  [${model}]`);
}

for (const [from, n, mask] of RECS) await insertRec(from, n, mask, "seed-userbot", 0);
for (const [from, n, mask, copies] of DUPS) {
  for (let i = 0; i < copies; i++) {
    await insertRec(from, n, mask, "seed-userbot-dup", (i + 1) * 6 * 3600_000); // ส่งซ้ำทุก 6 ชม.
  }
}

// สร้าง/อัปเดต user ลงทะเบียนแล้ว (ใช้เทส chat mode ได้)
let u = await User.findOne({ lineUserId: UID });
if (!u) u = await User.touch(UID, { displayName: "userbot (ข้อมูลทดสอบ)", pictureUrl: "" });
if (!u.isRegistered) { u.isRegistered = true; await u.save(); }

console.log(`\nเสร็จ — ${UID}: ${recCount} records, ครอบ ${totalDays} วัน-ชุด, มีรายวันจริง ${coveredDays} วัน-ชุด`);
console.log("ก.ค. ครบ 31 วัน (15-21 = 3 ชุด/วัน) | ส.ค. ว่าง | ก.ย. W1 ครบ 2 ชุด/วัน / W2-W4 บางวัน / W3 ว่าง | ต.ค. 1-4 = 10 ชุด/วัน, 5-7 บางส่วน, 8 ต.ค. ไม่มี");
await mongoose.disconnect();
