// _test_testline.mjs — เทส sim flow โดยตรงผ่าน handleEvent (เหมือน route /admin/api/testline/event)
import "dotenv/config";
import mongoose from "mongoose";
import { setSimSink } from "../services/lineService.js";
import { getChatMode, _debugShiftExpiry, exitChatMode } from "../services/chatMode.js";
import { handleEvent } from "../routes/webhook.js";
import { User } from "../models/User.js";

const SIM_UID = "TESTLINE-SIM-USER";
const SIM_TOKEN = "testline-sim";

async function send(text) {
  const captured = [];
  setSimSink((kind, args) => {
    const isSim = args.replyToken === SIM_TOKEN || args.to === SIM_UID || args.userId === SIM_UID;
    if (!isSim) return false;
    if (kind === "profile") return { displayName: "ลูกค้าทดสอบ (sim)", pictureUrl: "" };
    if (kind === "loading") return true;
    captured.push({ kind, messages: args.messages || [] });
    return true;
  });
  try {
    await handleEvent({
      type: "message", replyToken: SIM_TOKEN,
      source: { type: "user", userId: SIM_UID },
      message: { type: "text", id: `sim-${Date.now()}`, text },
      timestamp: Date.now(),
    });
  } finally { setSimSink(null); }
  const sess = getChatMode(SIM_UID);
  const msgs = captured.flatMap(c => c.messages.map(m => m.text || `[${m.type}]`));
  console.log(`\n>>> "${text}"`);
  msgs.forEach(m => console.log(`   BOT: ${m.slice(0, 180).replace(/\n/g, " / ")}`));
  console.log(`   MODE: ${sess ? sess.mode + ` (เหลือ ${Math.round((sess.until - Date.now()) / 1000)}s)` : "ปกติ"}`);
}

await mongoose.connect(process.env.MONGODB_URI);
await User.findOneAndUpdate({ lineUserId: SIM_UID },
  { $set: { isRegistered: true, displayName: "ลูกค้าทดสอบ (sim)" }, $setOnInsert: { firstSeenAt: new Date() } },
  { upsert: true });

// 1) เข้าโหมดแชท → greeting
await send("คุยกับบอท");
// 2) ถามอิสระในโหมด → Python ตอบ
await send("ช่วงนี้ recovery เป็นไงบ้าง");
// 3) ออกโหมดด้วยเมนูอื่น → flow เดิมทำงาน
await send("วิธีใช้งาน");
// 4) เข้า food mode
await send("โภชนาการอาหาร");
// 5) ข้ามเวลา 6 นาที → หมดอายุ → ข้อความถัดไปกลับ flow เดิม
await send("คุยกับบอท");
_debugShiftExpiry(SIM_UID, 6 * 60_000);
await send("สวัสดีครับ ทักทายหลังหมดเวลา");
// cleanup
exitChatMode(SIM_UID);
await mongoose.disconnect();
console.log("\nDONE");
