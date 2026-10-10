// Test Question Library — clone Nuttz26 extractions → testchatbotquestionchat, then run all questions
import 'dotenv/config';
import mongoose from 'mongoose';

const SRC_UID = 'Uee963fc47f9def05728a5fedb4ca7502'; // Nuttz26 — 3 ชุด
const TEST_UID = 'testchatbotquestionchat';
const PY = 'http://127.0.0.1:5001/chat';

const SECTIONS = [
  ["qlib-1-sleep", [
    "เมื่อคืนฉันนอนเป็นอย่างไร?",
    "เมื่อคืนฉันนอนกี่ชั่วโมง?",
    "Sleep Quality ของฉันวันนี้เป็นอย่างไร?",
    "Sleep Efficiency ของฉันเป็นอย่างไร?",
    "เมื่อคืนฉันนอนมีประสิทธิภาพแค่ไหน?",
    "ฉันนอนเพียงพอหรือไม่?",
    "เมื่อคืนฉันนอนน้อยกว่าที่ควรหรือไม่?",
    "Sleep Quality ของฉันดีขึ้นหรือแย่ลง?",
    "ช่วง 7 วันที่ผ่านมา ฉันนอนเป็นอย่างไร?",
    "ช่วงนี้คุณภาพการนอนของฉันมีแนวโน้มเป็นอย่างไร?",
    "เวลานอนของฉันสม่ำเสมอไหม?",
    "เวลาตื่นของฉันสม่ำเสมอไหม?",
    "Sleep Consistency ของฉันเป็นอย่างไร?",
    "ช่วงนี้ฉันมี Sleep Debt หรือไม่?",
    "ฉันมี Sleep Debt มากขึ้นหรือลดลง?",
    "Deep Sleep ของฉันเป็นอย่างไร?",
    "สัดส่วนการนอนแต่ละช่วงของฉันเป็นอย่างไร?",
    "คืนไหนฉันนอนดีที่สุด?",
    "คืนไหนฉันนอนแย่ที่สุด?",
    "อะไรคือจุดที่ควรสังเกตจากการนอนของฉัน?",
  ]],
  ["qlib-2-hrv", [
    "วันนี้ HRV ของฉันเป็นอย่างไร?",
    "HRV วันนี้สูงหรือต่ำกว่าช่วงที่ผ่านมา?",
    "HRV ของฉันมีแนวโน้มอย่างไร?",
    "HRV ช่วง 7 วันที่ผ่านมาเป็นอย่างไร?",
    "วันไหน HRV ของฉันดีที่สุด?",
    "วันไหน HRV ของฉันต่ำที่สุด?",
    "ทำไมวันนี้ HRV ถึงเปลี่ยน?",
    "Resting HR วันนี้เป็นอย่างไร?",
    "Resting HR ของฉันสูงหรือต่ำกว่าช่วงที่ผ่านมา?",
    "Resting HR มีแนวโน้มเพิ่มขึ้นหรือลดลง?",
    "วันไหน Resting HR ของฉันสูงที่สุด?",
    "HRV กับ Resting HR ของฉันเปลี่ยนแปลงสัมพันธ์กันอย่างไร?",
    "วันนี้ HRV และ Resting HR บอกอะไรเกี่ยวกับ Recovery ของฉัน?",
  ]],
  ["qlib-3-recovery", [
    "วันนี้ Recovery ของฉันเป็นอย่างไร?",
    "Recovery วันนี้ดีขึ้นหรือแย่ลง?",
    "Recovery ของฉันช่วง 7 วันที่ผ่านมาเป็นอย่างไร?",
    "Recovery มีแนวโน้มเพิ่มขึ้นหรือลดลง?",
    "วันไหน Recovery ของฉันดีที่สุด?",
    "วันไหน Recovery ของฉันต่ำที่สุด?",
    "ทำไมวันนี้ Recovery ถึงต่ำ?",
    "อะไรเป็นปัจจัยที่น่าสังเกตของ Recovery วันนี้?",
    "Recovery ของฉันสัมพันธ์กับการนอนอย่างไร?",
    "Recovery ของฉันสัมพันธ์กับ HRV อย่างไร?",
    "Recovery ของฉันสัมพันธ์กับ Resting HR อย่างไร?",
    "มีอะไรที่อาจส่งผลต่อ Recovery ของฉันจากข้อมูลวันนี้?",
    "วันที่ Recovery ดี ฉันมีข้อมูลอะไรที่แตกต่างจากวันที่ Recovery ต่ำ?",
  ]],
  ["qlib-4-activity", [
    "วันนี้ Activity ของฉันเป็นอย่างไร?",
    "วันนี้ Body Load ของฉันเป็นอย่างไร?",
    "วันนี้ฉันทำกิจกรรมมากหรือน้อย?",
    "วันนี้ฉันเดินกี่ก้าว?",
    "วันนี้ Calories ที่เผาผลาญเป็นอย่างไร?",
    "วันนี้ฉันใช้เวลาอยู่ใน Heart Rate Zone 1–3 เท่าไร?",
    "วันนี้ฉันเข้า Heart Rate Zone 4–5 หรือไม่?",
    "วันนี้ฉันมี Exercise Duration เท่าไร?",
    "Activity ของฉันในช่วง 7 วันที่ผ่านมาเป็นอย่างไร?",
    "Body Load ช่วงนี้สูงหรือต่ำกว่าปกติ?",
    "วันไหนฉันมีกิจกรรมมากที่สุด?",
    "วันไหน Body Load สูงที่สุด?",
    "Activity ของฉันมีแนวโน้มเพิ่มขึ้นหรือลดลง?",
  ]],
  ["qlib-5-cross", [
    "ทำไมวันนี้ Recovery ของฉันต่ำ?",
    "การนอนเมื่อคืนมีผลต่อ Recovery วันนี้อย่างไร?",
    "Sleep Quality กับ Recovery ของฉันสัมพันธ์กันไหม?",
    "HRV กับคุณภาพการนอนของฉันสัมพันธ์กันอย่างไร?",
    "Resting HR กับ Recovery ของฉันมีความสัมพันธ์อย่างไร?",
    "วันที่ฉันนอนน้อย Recovery ของฉันเป็นอย่างไร?",
    "วันที่ Sleep Quality ต่ำ HRV ของฉันเปลี่ยนอย่างไร?",
    "วันที่ Body Load สูง วันถัดไป Recovery เป็นอย่างไร?",
    "Activity ของฉันส่งผลต่อ Recovery อย่างไร?",
    "วันที่ฉันมีกิจกรรมมาก ฉันนอนดีขึ้นหรือแย่ลง?",
    "วันที่ Recovery ดี ฉันมี Pattern อะไร?",
    "วันที่ Recovery ต่ำ ฉันมี Pattern อะไร?",
    "ช่วงนี้มีอะไรเปลี่ยนแปลงในข้อมูลสุขภาพของฉันบ้าง?",
    "มี Pattern อะไรที่น่าสังเกตจากข้อมูลของฉัน?",
    "ข้อมูลทั้ง 3 หน้าบอกอะไรเกี่ยวกับสภาพร่างกายของฉันวันนี้?",
  ]],
  ["qlib-6-trend", [
    "สุขภาพของฉันในช่วง 7 วันที่ผ่านมาเป็นอย่างไร?",
    "สัปดาห์นี้ฉันดีขึ้นหรือแย่ลง?",
    "เทียบกับช่วงก่อนหน้า ฉันเปลี่ยนแปลงอย่างไร?",
    "Metric ไหนของฉันเปลี่ยนแปลงมากที่สุด?",
    "Recovery, HRV และ Sleep ของฉันมีแนวโน้มไปในทิศทางเดียวกันไหม?",
    "ช่วงนี้การนอนของฉันดีขึ้น แต่ Recovery กลับลดลงหรือไม่?",
    "ช่วงนี้ Recovery ดีขึ้นเพราะข้อมูลด้านไหน?",
    "ช่วงนี้มีตัวเลขไหนที่ฉันควรจับตาดู?",
    "วันไหนในสัปดาห์ที่ร่างกายของฉันดูดีที่สุด?",
    "วันไหนในสัปดาห์ที่ข้อมูลของฉันแย่ที่สุด?",
  ]],
  ["qlib-7-coach", [
    "วันนี้ร่างกายฉันดูพร้อมแค่ไหน?",
    "วันนี้ฉันควรพักหรือทำกิจกรรม?",
    "วันนี้ควรลดความหนักของกิจกรรมหรือไม่?",
    "วันนี้ควรให้ความสำคัญกับการพักผ่อนหรือ Activity?",
    "ถ้าอยากให้ Recovery ดีขึ้น ฉันควรโฟกัสอะไร?",
    "ถ้าอยากปรับปรุงการนอน ฉันควรโฟกัสอะไร?",
    "จากข้อมูลช่วงนี้ ฉันควรปรับพฤติกรรมอะไร?",
    "วันนี้มีอะไรที่ฉันควรใส่ใจเป็นพิเศษ?",
    "ถ้าดูจากข้อมูล 7 วันที่ผ่านมา ฉันควรปรับอะไร?",
    "มีอะไรที่ฉันทำได้ดีและควรรักษาไว้?",
    "มีอะไรที่ควรปรับปรุงจากข้อมูลของฉัน?",
  ]],
  ["qlib-8-hero", [
    "วันนี้ร่างกายฉันเป็นอย่างไร?",
    "ทำไมวันนี้ Recovery ของฉันต่ำ?",
    "เมื่อคืนฉันนอนดีไหม?",
    "ช่วงนี้ฉันนอนดีขึ้นหรือแย่ลง?",
    "HRV ของฉันกำลังบอกอะไร?",
    "การนอนเมื่อคืนส่งผลต่อ Recovery วันนี้อย่างไร?",
    "วันที่ฉัน Recovery ดี มีอะไรเหมือนกัน?",
    "ช่วง 7 วันที่ผ่านมา สุขภาพฉันเป็นอย่างไร?",
    "มีอะไรที่ฉันควรจับตาดูจากข้อมูลช่วงนี้?",
    "จากข้อมูลของฉัน วันนี้ฉันควรทำอะไร?",
  ]],
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.db.collection('rawextractions');

  // clone ชุดของ Nuttz26 → testchatbotquestionchat (ข้ามถ้ามีแล้ว)
  const existing = await col.countDocuments({ lineUserId: TEST_UID, status: 'success' });
  if (!existing) {
    const src = await col.find({ lineUserId: SRC_UID, status: 'success' }).toArray();
    for (const d of src) {
      const copy = { ...d, lineUserId: TEST_UID };
      delete copy._id;
      copy.requestId = undefined;
      await col.insertOne(copy);
    }
    console.log(`cloned ${src.length} extractions → ${TEST_UID}`);
  } else {
    console.log(`already have ${existing} extractions for ${TEST_UID}`);
  }

  // ยิงคำถามทีละข้อ แยก session ตามหมวด → testchatbot เห็นเป็น thread แยกอ่านง่าย
  let i = 0, total = SECTIONS.reduce((s, [, q]) => s + q.length, 0);
  for (const [sessionId, questions] of SECTIONS) {
    for (const q of questions) {
      i++;
      const t0 = Date.now();
      try {
        const r = await fetch(PY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineUserId: TEST_UID, message: q, sessionId }),
          signal: AbortSignal.timeout(120_000),
        });
        const j = await r.json();
        console.log(`[${i}/${total}] ${sessionId} | ${q} → ${r.status} | ${(j.answer || j.error || '').slice(0, 90).replace(/\n/g, ' ')} | ${Date.now() - t0}ms`);
      } catch (e) {
        console.log(`[${i}/${total}] ${sessionId} | ${q} → FETCH-ERR ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 400));
    }
  }
  console.log('DONE');
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
