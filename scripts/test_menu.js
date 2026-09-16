import fs from "fs";
import path from "path";
import readline from "readline";
import "dotenv/config";
import { analyzeImageWithCrossCheck, validateAiResult } from "../services/aiService.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(questionText) {
  return new Promise((resolve) => {
    rl.question(questionText, (ans) => resolve(ans.trim()));
  });
}

const SAMPLE_IMAGES = [
  { key: "1", title: "รูปตัวอย่าง Biokoop App (7h 15m / Score 72)", path: "./test_biokoop_real.png" },
  { key: "2", title: "รูปตัวอย่าง Kieslect Recovery Pattern", path: "./scratch_card_fixed.png" },
  { key: "3", title: "รูปตัวอย่างคะแนนต่ำ Low Score", path: "./dynamic_audit_low_score.png" },
  { key: "4", title: "รูปตัวอย่าง Nature Card", path: "./test_nature_card.png" },
];

async function runAiTestOnImage(imagePath, nickname = "ทดสอบ", gender = "หญิง") {
  if (!fs.existsSync(imagePath)) {
    console.log(`\n❌ ไม่พบไฟล์รูปภาพที่: ${imagePath}`);
    return;
  }

  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const imageBuffer = fs.readFileSync(imagePath);

  console.log(`\n======================================================`);
  console.log(`🚀 กำลังส่งรูปภาพให้ AI วิเคราะห์: ${path.basename(imagePath)}`);
  console.log(`📦 ขนาด: ${(imageBuffer.length / 1024).toFixed(1)} KB | MIME: ${mimeType}`);
  console.log(`👤 จำลองผู้ใช้: คุณ${nickname} (${gender})`);
  console.log(`======================================================\n`);
  console.log(`⏳ กำลังประมวลผล OCR & วิเคราะห์โครงสร้างการนอน...`);

  const startTime = Date.now();
  try {
    const result = await analyzeImageWithCrossCheck(imageBuffer, mimeType, {
      nickname,
      gender,
      lineUserId: "test_menu_user",
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️ เวลาที่ AI ประมวลผล: ${duration} วินาที\n`);

    if (!result.ok) {
      console.log(`❌ AI วิเคราะห์ไม่สำเร็จ:`, result.error);
      return;
    }

    const { detected, confidence, notes, result: data } = result.data;

    console.log("┌────────────────────────────────────────────────────┐");
    console.log("│         📊 ผลการอ่านค่าจาก AI (Biokoop AI)          │");
    console.log("└────────────────────────────────────────────────────┘");
    console.log(`📱 แอป/อุปกรณ์   : ${data?.appName || "-"}`);
    console.log(`🎯 ความมั่นใจ    : ${(confidence * 100).toFixed(0)}%`);
    console.log(`✨ สถานะการตรวจจับ: ${detected ? "✅ ตรวจพบผลการนอน (Detected)" : "⚠️ ไม่ใช่ผลการนอน"}`);
    
    if (data) {
      console.log(`\n🏆 คะแนน (Score)  : ${data.score ?? "-"} / 100 (เกรด ${data.grade ?? "-"})`);
      console.log(`⏰ เวลานอนรวม     : ${data.sleepTime ?? "-"}`);
      console.log(`⏱️ ช่วงเวลาที่นอน : ${data.sleepTimeRange ?? "-"}`);
      console.log(`🌙 หลับลึก (Deep) : ${data.deepSleepTime ?? "-"} (${data.deepSleepPercent ?? "-"}%)`);
      console.log(`💤 หลับตื้น (Light): ${data.lightSleepTime ?? "-"} (${data.lightSleepPercent ?? "-"}%)`);
      console.log(`⚡ REM           : ${data.remSleepTime ?? "-"} (${data.remSleepPercent ?? "-"}%)`);
      console.log(`👀 ช่วงตื่น (Awake): ${data.awakeTime ?? "-"} (${data.awakePercent ?? "-"}%)`);
      console.log(`❤️ ชีพจรเฉลี่ย     : ${data.avgHeartRate ?? "-"}`);
      console.log(`🔋 การฟื้นตัว      : ${data.recoveryPercent !== null && data.recoveryPercent !== undefined ? data.recoveryPercent + "%" : "-"}`);
      console.log(`📊 Body Load     : ${data.bodyLoad ?? "-"}`);
      console.log(`📈 ประสิทธิภาพ   : ${data.sleepEfficiency ?? "-"}`);
      
      console.log("\n📝 สรุปภาพรวม (AI Summary):");
      console.log(`   "${data.aiSummary || "-"}"`);
      
      console.log("\n💡 เคล็ดลับ (Tips):");
      console.log(`   "${data.tips || "-"}"`);
      
      console.log("\n💬 คำแนะนำสุขภาพ (Health Advice ส่งใน LINE):");
      console.log(data.healthAdvice || "-");
    }

    if (notes) {
      console.log(`\n📌 หมายเหตุ: ${notes}`);
    }

    console.log("\n🔍 ตรวจสอบความถูกต้องทางธุรกิจ (Validation):");
    const v = validateAiResult(result.data, 0.7);
    if (v.valid) {
      console.log("   ✅ ข้อมูลถูกต้องครบถ้วนตามเกณฑ์");
    } else {
      console.log(`   ⚠️ ข้อควรระวัง: ${v.problems.join(", ")}`);
    }

  } catch (err) {
    console.error(`❌ เกิดข้อผิดพลาด:`, err.message);
  }
}

async function showMenu() {
  while (true) {
    console.log("\n=======================================================");
    console.log("         🌸 BIOKOOP AI IMAGE TEST MENU 🌸              ");
    console.log("=======================================================");
    console.log("1. 📷 ทดสอบกับรูปตัวอย่าง Biokoop App (7h 15m / Score 72)");
    console.log("2. ⌚ ทดสอบกับรูปตัวอย่าง Kieslect Recovery Pattern");
    console.log("3. 📉 ทดสอบกับรูปตัวอย่างคะแนนต่ำ (Score 55)");
    console.log("4. 🖼️ ทดสอบกับรูปตัวอย่าง Nature Card");
    console.log("5. 📁 เลือกไฟล์รูปภาพจากเครื่องคอมพิวเตอร์ (พิมพ์ Path เอง)");
    console.log("6. 🌐 ทดสอบความพร้อมของ AI API (API Connection Check)");
    console.log("0. 🚪 ออกจากโปรแกรม");
    console.log("=======================================================");

    const choice = await ask("👉 กรุณาเลือกเมนู (0-6): ");

    if (choice === "0") {
      console.log("\n👋 ขอบคุณที่ใช้งานระบบ biokoop นะคะ สวัสดีค่ะ ✨\n");
      rl.close();
      break;
    } else if (choice === "1") {
      await runAiTestOnImage("./test_biokoop_real.png");
    } else if (choice === "2") {
      await runAiTestOnImage("./scratch_card_fixed.png");
    } else if (choice === "3") {
      await runAiTestOnImage("./dynamic_audit_low_score.png");
    } else if (choice === "4") {
      await runAiTestOnImage("./test_nature_card.png");
    } else if (choice === "5") {
      const customPath = await ask("\n📁 ลากไฟล์มาวาง หรือพิมพ์ Path ของรูปภาพ: ");
      const cleanPath = customPath.replace(/^['"]|['"]$/g, "").trim();
      if (cleanPath) {
        const nickname = (await ask("👤 ชื่อเล่นผู้ใช้ (กด Enter เพื่อใช้ 'ทดสอบ'): ")) || "ทดสอบ";
        await runAiTestOnImage(cleanPath, nickname);
      }
    } else if (choice === "6") {
      console.log("\n🔍 ตรวจสอบการเชื่อมต่อ API Keys ใน .env:");
      console.log(`- GEMINI_API_KEY      : ${process.env.GEMINI_API_KEY ? "✅ ตั้งค่าแล้ว" : "❌ ไม่พบ"}`);
      console.log(`- OPENROUTER_API_KEY  : ${process.env.OPENROUTER_API_KEY ? "✅ ตั้งค่าแล้ว" : "❌ ไม่พบ"}`);
      console.log(`- OPENROUTER_MODEL    : ${process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini"}`);
    } else {
      console.log("⚠️ เมนูไม่ถูกต้อง กรุณาเลือก 0-6 นะคะ");
    }

    await ask("\n🔘 กด Enter เพื่อกลับสู่เมนูหลัก...");
  }
}

showMenu();
