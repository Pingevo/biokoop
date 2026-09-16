// scripts/test_weekly_report.js
// ทดสอบเรนเดอร์รายงานสุขภาพรายสัปดาห์ 3 หน้า ด้วยข้อมูลจำลอง (ไม่เรียก AI / ไม่ต้องมี MongoDB)
// วิธีใช้: node scripts/test_weekly_report.js

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initImageService } from "../services/imageService.js";
import { composeWeeklyReport } from "../services/imageService.js";
import { composeWeeklyCombinedReport } from "../services/imageService.js";
import { optimizeCardPng } from "../services/imageService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ข้อมูลจำลองตามหน้าจอ Kieslect (Body Load 6.9 / Recovery 71% / Sleep 98%)
const mockAiData = {
  detected: true,
  appName: "Kieslect App",
  foundPages: ["body_load", "recovery", "sleep_quality"],
  days: ["Sat 05", "Sun 06", "Mon 07", "Tue 08", "Wed 09", "Thu 10", "Fri 11"],
  confidence: 0.94,
  overview: {
    bodyLoad: 6.9,
    bodyLoadLabel: "สมดุลนับตัวล",
    recoveryPercent: 71,
    sleepQualityPercent: 98,
    summary:
      "เมื่อดูจากแนวโน้มการนอนในช่วงนี้ ร่างกายของคุณอยู่ในภาวะพร้อมและสมดุลกว่าเดิมค่ะ คุณสามารถเพิ่มกิจกรรมระดับกลางได้อย่างปลอดภัย และควรรักษาเวลานอนให้คงที่อยู่เสมอนะคะ",
    highlights: [
      "การออกกำลังออกสม่ำเสมอ Zone 1-3",
      "รักษาเวลานอนให้คงที่",
      "ดูแลอารมณ์ให้ผ่อนคลาย ลดความเครียดก่อนนอน",
    ],
    firstSteps: [
      "เดินสบาย ๆ 20 นาที ให้อยู่ใน Zone 1-3",
      "เข้านอนเวลาเดิมทุกวัน เพิ่ม Sleep Consistency",
      "ดื่มน้ำให้เพียงพอและยืดเส้นก่อนนอนสักเล็กน้อย",
    ],
  },
  activity: {
    bodyLoadToday: 6.9,
    bodyLoadStatus: "อยู่ช่วงสมดุล เหมาะกับการเพิ่มเรียกกายระดับกลาง",
    bodyLoadSeries: [7.3, 13.1, 6.1, 7.5, 7.1, 6.0, 6.9],
    hrZone13Today: "0:40",
    hrZone13Compare: "0:25",
    hrZone45Today: "0:00",
    hrZone45Compare: "0:00",
    strengthToday: "0:00",
    strengthCompare: "0:00",
    stepsToday: "4,315",
    stepsCompare: "3,471",
    caloriesToday: "247",
    recoveryPercent: 71,
    recoveryStatus: "อยู่ช่วงเขียว กว่า 30 วัน อยู่ในภาวะกระตุ้นและไม่หนักเกินไป",
    hrvToday: "51 ms",
    hrvCompare: "48",
    rhrToday: "56 bpm",
    rhrCompare: "58",
    sleepPerformanceToday: "98%",
    sleepPerformanceCompare: "78%",
    hrvSeries: [48, 47, 48, 52, 56, 50, 51],
    rhrSeries: [56, 60, 58, 62, 57, 58, 59, 56],
    recoverySeries: [67, 59, 56, 73, 75, 68, 71],
    aiInsight:
      "กิจกรรมในช่วงสัปดาห์นี้ออกแรงปานกลาง (13.1) ทำให้หัวใจทำงานได้ดีและเร่งการฟื้นตัว แต่ช่วงที่ HRV (13.1 สดที่ขึ้นบน) อย่างต่อเนื่อง เมื่อปรับฝึกและพักเพียงพอ Recovery ก็ดีขึ้นตามอย่างต่อเนื่อง",
    tips: "รักษาระดับกิจกรรมไม่ให้หนักนานเกิน และพักนานขึ้นในวันที่ Body Load สูง เพื่อให้ร่างกายฟื้นตัวดียิ่งขึ้นนะคะ",
  },
  sleep: {
    qualityPercent: 98,
    qualityStatus: "อยู่ช่วงเขียว อย่างต่อเนื่อง และสูงที่สุดในรอบ 7 วัน",
    qualitySeries: [73, 59, 84, 82, 84, 88, 98],
    durationToday: "9:08 ชม.",
    durationNote: "(ต้องการ 7:31)",
    efficiencyPercent: 99,
    consistencyPercent: 42,
    highStressPercent: 5,
    stageLightPercent: 71,
    stageDeepPercent: 16,
    stageRemPercent: 13,
    stageNote: "หลับลึกก่อน 1:30 และ REM ก่อน 1:16 ทำให้ร่างกายซ่อมแซมดี",
    restorativeSleep: "2:46 ชม.",
    hoursVsNeededSeries: [6.48, 5.03, 9.2, null, 8.57, 6.85, 6.63],
    hoursNeededSeries: [9.35, 9.08, 10.0, null, 8.07, 8.07, 8.83],
    consistencySeries: [47, 35, 49, null, 40, 53, 61],
    aiInsight:
      "เมื่อคืนคุณนอนลึกกว่าช่วงก่อน การฟื้นฟื้นและประสิทธิภาพการนอนสูง (99%) คุณภาพการนอนดีขึ้นต่อเนื่อง แต่ยังมี Sleep Consistency ต่ำ (42%) เพราะคุณเข้านอนไม่คงที่ ควรนอนเวลาเดิมเพื่อให้ร่างกายจำจังหวะได้แน่นอน",
    tips: "เข้านอนเวลาเดิมและตื่นเวลาเดิมทุกวัน แม้วันหยุดสุดสัปดาห์ก็ตาม เพื่อให้ร่างกายฟื้นตัวได้เต็มที่นะคะ",
  },
  notes: "",
};

async function main() {
  console.log("[test] init image service...");
  await initImageService();

  console.log("[test] compose weekly report...");
  const { data, pngBuffers } = composeWeeklyReport(mockAiData);

  const outDir = path.join(__dirname, "..");
  for (let i = 0; i < pngBuffers.length; i++) {
    const optimized = await optimizeCardPng(Buffer.from(pngBuffers[i]));
    const file = path.join(outDir, `test_weekly_report_p${i + 1}.png`);
    fs.writeFileSync(file, optimized);
    console.log(`[test] ✅ บันทึก ${file} (${(optimized.length / 1024).toFixed(1)} KB)`);
  }

  console.log("[test] compose weekly combined report (3-in-1)...");
  const combinedBuf = await composeWeeklyCombinedReport(pngBuffers);
  if (combinedBuf) {
    const combinedOpt = await optimizeCardPng(combinedBuf);
    const combinedFile = path.join(outDir, "test_weekly_combined.png");
    fs.writeFileSync(combinedFile, combinedOpt);
    console.log(`[test] ✅ บันทึก ${combinedFile} (${(combinedOpt.length / 1024).toFixed(1)} KB)`);
  }

  console.log("[test] เสร็จสิ้น ตรวจไฟล์ test_weekly_report_p1-3.png และ test_weekly_combined.png ด้วยตาเปล่า");
}

main().catch((err) => {
  console.error("[test] FAILED:", err);
  process.exit(1);
});
