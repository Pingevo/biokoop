// scripts/patch_extraction_dates.js
// เติม weekOf/dataFrom/dataTo ให้ RawExtraction เก่าทั้งหมด (ไม่ยิง AI — คำนวณล้วน)
// weekOf = request.createdAt (วันที่ลูกค้าส่งรูป) · dataFrom/dataTo = ช่วงวันจริงจากป้ายวันใต้กราฟ
// รันซ้ำได้ปลอดภัย — ข้าม record ที่มี dataTo แล้ว
import "dotenv/config";
import { connectDB } from "../config/db.js";
import mongoose from "mongoose";
import { RawExtraction } from "../models/RawExtraction.js";
import { Request } from "../models/Request.js";
import { resolveDataRange } from "../services/rawExtractionService.js";

async function main() {
  await connectDB();
  const docs = await RawExtraction.find({ dataTo: null }).select("_id requestId rawResult createdAt").lean();
  console.log(`[patch] extraction ที่ยังไม่มี dataTo: ${docs.length}`);

  const reqIds = docs.map((d) => d.requestId).filter(Boolean);
  const reqs = await Request.find({ _id: { $in: reqIds } }).select("createdAt").lean();
  const reqMap = new Map(reqs.map((r) => [r._id.toString(), r.createdAt]));

  let patched = 0;
  for (const d of docs) {
    const sentAt = reqMap.get(d.requestId?.toString()) || d.createdAt;
    const range = resolveDataRange(d.rawResult?.days, sentAt);
    await RawExtraction.updateOne(
      { _id: d._id },
      { $set: { weekOf: range.weekOf, dataFrom: range.dataFrom, dataTo: range.dataTo } }
    );
    patched++;
    if (patched <= 5 || patched % 20 === 0)
      console.log(`  ${d._id} → ${range.dataFrom.toISOString().slice(0, 10)} → ${range.dataTo.toISOString().slice(0, 10)}`);
  }
  console.log(`[patch] เสร็จ — patched ${patched}/${docs.length}`);
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => { console.error("❌", err); process.exit(1); });
