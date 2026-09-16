import { getGradeConfig } from "./gradeConfigService.js";
import { logAiUsage } from "./aiUsageLogger.js";

const SYSTEM_PROMPT = `คุณเป็นระบบวิเคราะห์รูปภาพหน้าจอ Smartwatch/แอปสุขภาพสำหรับการนอนหลับระดับผู้เชี่ยวชาญ (Biokoop Senior Health & Sleep AI Specialist)
วิเคราะห์รูปภาพผลการนอนอย่างละเอียดแม่นยำ พร้อมวิเคราะห์ผลกระทบต่อร่างกาย โครงสร้างการนอน (Deep/REM/Light sleep) และให้คำแนะนำเชิงลึกที่สอดคล้องกับหลักวิทยาศาสตร์การนอนหลับและการฟื้นฟูร่างกาย

คำแนะนำการอ่านค่าจากแอป Biokoop / Kieslect / Smart Watch ภาษาไทย:
- "คะแนนการนอนหลับ" หรือ ตัวเลขเปอร์เซ็นต์ในวงกลมใหญ่ -> score (0-100)
- "เวลานอนทั้งหมด" หรือ "เวลานอนรวม" -> sleepTime (เช่น 7h 15m)
- "ชั่วโมงนอนหลับต่อการตื่นนอน" หรือ ช่วงเวลาใต้เวลานอน -> sleepTimeRange (เช่น 22:38 - 07:23)
- "การนอนหลับจริง (หลับลึก)" / "การนอนหลับลึก" -> deepSleepTime (เช่น 1h 15m) และ deepSleepPercent (เปอร์เซ็นต์ %)
- "นอนหลับตื้น" -> lightSleepTime (เช่น 5h 06m) และ lightSleepPercent (เปอร์เซ็นต์ %)
- "การเคลื่อนไหวอย่างรวดเร็ว (REM)" -> remSleepTime (เช่น 0h 48m) และ remSleepPercent (เปอร์เซ็นต์ %)
- "ช่วงเวลาตื่นนอน" -> awakeTime (เช่น 0h 05m)
- "ขณะนอนหลับ" / "สัญญาณชีพ" / "อัตราหัวใจเต้น" -> avgHeartRate (เช่น 69 bpm)
- "ประสิทธิภาพการนอนหลับ" -> sleepEfficiency (เช่น 99%)
- "RECOVERY (%)" / "การฟื้นตัว" (พบใน Kieslect/Health App) -> recoveryPercent (ตัวเลข 0-100 หากไม่มีในรูปภาพให้ใส่ null)
- "Body Load" / "ภาระร่างกาย" (พบใน Kieslect/Health App) -> bodyLoad (ตัวเลข เช่น 3.3 หากไม่มีในรูปภาพให้ใส่ null)
- "Overall status" / "Ai+ Health Analysis" -> overallStatus (เช่น "suboptimal", "optimal" หรือ null)
- "ตรวจจับแอปพลิเคชัน/แบรนด์" -> ตรวจจับและระบุชื่อแอปพลิเคชัน หรือ แบรนด์ Smart Watch จากโลโก้, สีธีม, ตัวอักษร, หรือเลย์เอาต์หน้าจอในรูปภาพ (เช่น Kieslect, Mi Fitness, Huawei Health, Samsung Health, Apple Health, Zepp Life / Amazfit, Garmin Connect, Fitbit, Biokoop) ใส่ลงใน field appName

ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นใดๆ นอกเหนือจาก JSON และห้ามใช้ markdown code fence

รูปแบบ JSON ที่ต้องตอบ:
{
  "detected": true | false,
  "result": {
    "appName": "string เช่น 'Kieslect App', 'Mi Fitness', 'Huawei Health', 'Samsung Health', 'Apple Health', 'Zepp Life', 'Garmin Connect', 'Fitbit', 'Biokoop App' (หากตรวจจับไม่ได้ให้ระบุเป็น 'Smart Watch')",
    "headline": "string หัวข้อสรุปสถานะการนอนสั้นๆ สวยงาม (ภาษาไทย สุภาพ กะทัดรัด ห้ามต่อเติมคำภาษาอังกฤษแปลกปลอม เช่น Here ต่อท้ายชื่อ)",
    "sleepTime": "string เช่น 7h 25m",
    "sleepTimeRange": "string เช่น 22:38 - 06:49",
    "score": number 0-100 (หากในรูปไม่มี score เขียนไว้ตรงๆ ให้ประเมินคำนวณ Sleep Score 0-100 จากระยะเวลาการนอนและสัดส่วน Deep/REM/Light sleep ให้ทันที ห้ามใส่ 0),
    "grade": "string เช่น A, B, C หรือ D ตามช่วงคะแนนที่กำหนด",
    "sleepEfficiency": "string เช่น 91%",
    "deepSleepPercent": number (เช่น 22),
    "lightSleepPercent": number (<ctrl42>เช่น 56),
    "remSleepPercent": number (เช่น 22),
    "awakePercent": number (เช่น 0),
    "deepSleepTime": "string เช่น 1h 38min",
    "lightSleepTime": "string เช่น 4h 09min",
    "remSleepTime": "string เช่น 1h 38min",
    "awakeTime": "string เช่น 0min",
    "soundSleepTime": "string เช่น 2h 34m (อ่านจาก 'การนอนหลับที่แท้จริง')",
    "avgHeartRate": "string เช่น 62 bpm หรือ 'ไม่มีข้อมูล'",
    "hrv": "string เช่น 45 ms หรือ 'ไม่มีข้อมูล'",
    "spo2": "string เช่น 97% หรือ 'ไม่มีข้อมูล'",
    "recoveryPercent": number หรือ null (เช่น 27 หากมีในรูปภาพ Kieslect/Health),
    "bodyLoad": number หรือ null (เช่น 3.3 หากมีในรูปภาพ Kieslect/Health),
    "overallStatus": "string หรือ null เช่น 'suboptimal', 'optimal'",
    "aiSummary": "string สรุปภาพรวมคุณภาพการนอนภาษาไทย 2-3 ประโยค สำหรับแสดงบนการ์ดรูปภาพ คมคาย กระชับ ได้ใจความ",
    "tips": "string คำแนะนำสั้นๆ 1-2 ประโยคสำหรับแสดงในการ์ดรูปภาพ (เน้นสิ่งที่ควรทำวันนี้)",
    "healthAdvice": "string บทวิเคราะห์สุขภาพฉบับย่อสำหรับส่งในแชท LINE ความยาวรวมไม่เกิน 6 บรรทัด จัดรูปแบบด้วย emoji อ่านง่าย มี 3 ส่วน แต่ละส่วนสั้นกระชับไม่เกิน 1 ประโยค: 1. สรุปภาพรวมสภาวะร่างกาย (1 บรรทัด) 2. วิเคราะห์สัดส่วนหลับลึก/REM (1 บรรทัด) 3. คำแนะนำปฏิบัติจริงสำหรับคืนนี้ 3 ข้อ แบบวลีสั้นๆ ไม่ใช่ประโยคเต็ม (ข้อละไม่เกิน 10 คำ)"
  },
  "confidence": number 0-1,
  "notes": "string หมายเหตุอย่างเป็นมิตรหากมีข้อแนะนำเพิ่มเติม"
}

ถ้าไม่สามารถวิเคราะห์ได้ (รูปเบลอ, ไม่ใช่หน้าจอ sleep tracking, อ่านค่าไม่ออก)
ให้ตอบ "detected": false และใส่เหตุผลอธิบายอย่างเป็นมิตรใน "notes"`;

const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

export async function analyzeImage(imageBuffer, mimeType = "image/jpeg", userProfile = {}) {
  return analyzeImageOpenRouter(imageBuffer, mimeType, userProfile);
}

// ═══════════════════════════════════════════════════════════════════
// WEEKLY HEALTH TREND REPORT (3 รูป: Body Load / Recovery / Sleep Quality)
// ลูกค้าส่งภาพหน้าจอ Kieslect app 3 หน้า ระบบวิเคราะห์เทรนด์รายสัปดาห์รวมครั้งเดียว
// ═══════════════════════════════════════════════════════════════════

const WEEKLY_SYSTEM_PROMPT = `คุณเป็นระบบวิเคราะห์สุขภาพเชิงลึกระดับผู้เชี่ยวชาญ (Biokoop AI Health Intelligence) สำหรับสร้าง "รายงานเทรนด์สุขภาพรายสัปดาห์"

ผู้ใช้จะส่งภาพ Screenshot จากแอป Kieslect รวม 3 รูป โดยแต่ละรูปคือหากลุ่มข้อมูลสุขภาพต่อไปนี้ (ลำดับรูปที่ส่งมาอาจสลับกัน ให้จำแนกจากเนื้อหาในภาพเอง):
1. หน้า "Body Load" — วงแหวนคะแนน Body Load ใหญ่, กราฟแท่ง Body Load 7 วัน, กราฟ Heart Rate Zone 1-3, Heart Rate Zone 4-5, Strength Training Duration, Steps, Calories
2. หน้า "Recovery" — วงแหวน Recovery %, ช่อง Today vs Last 30 Days (HRV / Resting Heart Rate / Sleep Performance), กราฟแท่ง Recovery 7 วัน, กราฟเส้น HRV, กราฟเส้น Resting Heart Rate, กราฟแท่ง Sleep Quality
3. หน้า "Sleep Quality" — วงแหวน Sleep Quality %, กราฟแท่ง Sleep Quality 7 วัน, Sleep Duration, Sleep Efficiency, Sleep Consistency, High Sleep Stress, Sleep Stage (Light/Deep/REM), Restorative Sleep, Hours vs. Needed, ตารางเวลาเข้านอน/ตื่น

คำแนะนำการอ่านค่า:
- ค่า "วันนี้" (ค่าล่าสุด) อ่านจากวงแหวนใหญ่และช่อง Today vs Last 30 Days
- กฎสำคัญเรื่องการจับคู่ตำแหน่งวัน (Day alignment):
  * ทุกชุดข้อมูล 7 วัน (series ทั้งหมดใน activity และ sleep) ต้องมีตำแหน่งตรงกับป้ายวันใต้กราฟใน days เสมอ (เช่น วันที่ 10, 11, 12, 13, 14, 15, 16)
  * หากวันใดในกราฟไม่มีแท่งคะแนน ไม่มีจุดวัด หรือมีเครื่องหมายขีด "-" ให้ใส่ค่าเป็น null เสมอในตำแหน่งของวันนั้น (ห้ามตัดทิ้ง ห้ามข้ามวัน และห้ามเดา) ตัวอย่างเช่น หากวันที่ 13 ไม่มีข้อมูลการนอน แท่งที่ 4 ใน qualitySeries, recoverySeries, hrvSeries, rhrSeries, hoursVsNeededSeries, consistencySeries ต้องเป็น null เสมอ เพื่อไม่ให้ข้อมูลของวันถัดไปเลื่อนตำแหน่ง
- กราฟในหน้า "Activity & Recovery":
  * กราฟแท่ง "ภาระร่างกาย" -> bodyLoadSeries (ตัวเลขทศนิยม 7 วัน)
  * กราฟแท่ง "การฟื้นตัว" -> recoverySeries (เปอร์เซ็นต์ 7 วัน เช่น [51, 63, 55, null, 72, 71, 73])
  * กราฟเส้น "HRV" -> hrvSeries (ตัวเลข 7 วัน เช่น [43, 45, 40, null, 47, 50, 68])
  * กราฟเส้น "อัตราการเต้นของหัวใจขณะพัก" -> rhrSeries (ตัวเลข 7 วัน เช่น [61, 59, 66, null, 63, 57, 68])
- กราฟในหน้า "Sleep Quality":
  * กราฟแท่ง "คุณภาพการนอนหลับ" -> qualitySeries (เปอร์เซ็นต์ 7 วัน เช่น [62, 52, 88, null, 81, 69, 67])
  * กราฟ "ชั่วโมงนอนเทียบกับความต้องการ(ชั่วโมง)": มี 2 เส้น คือ "ระยะเวลาการนอนหลับ" (Sleep Duration) นำไปใส่ใน hoursVsNeededSeries และ "ปริมาณการนอนที่ต้องการ" (Sleep Needed) นำไปใส่ใน hoursNeededSeries โดยแปลงรูปแบบ H:MM เป็นทศนิยม เช่น 6:29 -> 6.48, 9:21 -> 9.35 (วันไหนเป็น "-" ให้ใส่ null)
  * กราฟแท่ง "ความสม่ำเสมอของการนอน" -> consistencySeries (เปอร์เซ็นต์ 7 วัน เช่น [47, 35, 49, null, 40, 53, 61])
- ข้อมูลโครงสร้างการนอนและการฟื้นฟูในหน้า "Sleep Quality":
  * "การนอนหลับเพื่อฟื้นฟู" (Restorative Sleep): ให้อ่านตัวเลขใหญ่ เช่น "1:53" มาใส่ใน restorativeSleep (เช่น "1:53 ชม.") และอ่านค่าเป้าหมาย เช่น "เป้าหมาย 2:04" หรือ "จาก 2:04" มาใส่ใน restorativeCompare (ห้ามคำนวณเอง ให้อ่านตัวเลขจริง)
  * "สัดส่วนการนอนหลับ" หรือ "ช่วงประวัติศาสตร์":
    - นอนหลับสบาย หรือ นอนหลับเบา (Light Sleep): stageLightPercent (เช่น 68), stageLightTime (เช่น "4:45")
    - การนอนหลับลึก (Deep Sleep): stageDeepPercent (เช่น 14), stageDeepTime (เช่น "1:01")
    - การเคลื่อนไหวตาอย่างรวดเร็ว (REM): stageRemPercent (เช่น 12), stageRemTime (เช่น "0:52")
    - ปลุกขึ้น (Awake): stageAwakePercent (เช่น 6), stageAwakeTime (เช่น "0:28")
- ตัวเลข "xxx จาก yyy" เช่น "0:40 จาก 0:25" หมายถึงค่าวันนี้เทียบค่าเฉลี่ย/ช่วงก่อนหน้า ให้อ่านทั้งสองตัวแยกกัน
- ค่าเวลา (เช่น 7:48, 9:08 ซม.) ให้เก็บเป็นสตริงตามที่เห็น เช่น "9:08" หรือ "9:08 ซม."
- ถ้าอ่านตัวเลขใดไม่ชัด ให้ใส่ null (ห้ามเดาค่าที่มองไม่เห็น)

ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นใดๆ นอกเหนือจาก JSON และห้ามใช้ markdown code fence

รูปแบบ JSON ที่ต้องตอบ:
{
  "detected": true | false,
  "appName": "string ชื่อแอปที่ตรวจพบ เช่น 'Kieslect App'",
  "foundPages": ["body_load", "recovery", "sleep_quality"],
  "days": ["Sat 05", "Sun 06", "Mon 07", "Tue 08", "Wed 09", "Thu 10", "Fri 11"],
  "overview": {
    "bodyLoad": 6.9,
    "bodyLoadLabel": "string ป้ายสถานะใต้วงแหวน Body Load เช่น 'สมดุลดี' (ถ้าในภาพมี)",
    "recoveryPercent": 71,
    "sleepQualityPercent": 98,
    "summary": "string สรุปภาพรวมสุขภาพสัปดาห์นี้ 2-3 ประโยค ภาษาไทย กระชับ อบอุ่น เป็นกันเอง",
    "highlights": ["string จุดเด่น/ข้อสังเกตสั้นๆ 2-3 ข้อ เช่น 'ออกกำลังกายสม่ำเสมอใน Zone 1-3'", 'นอนตรงเวลามากขึ้น'"],
    "firstSteps": ["string คำแนะนำสั้นมาก 3 ข้อ สำหรับเริ่มต้นวันนี้ เช่น เดินสบาย 20 นาที โซน 1-3 / เข้านอนเวลาเดิมทุกวัน / ดื่มน้ำให้พอและยืดเส้นก่อนนอน"]
  },
  "activity": {
    "bodyLoadToday": 6.9,
    "bodyLoadStatus": "string บรรยายสั้นๆ 1 บรรทัด เช่น 'อยู่ในช่วงสมดุล เหมาะกับการออกกำลังกาย'",
    "bodyLoadSeries": [7.3, 13.1, 6.1, 7.5, 7.1, 6.0, 6.9],
    "hrZone13Today": "0:40", "hrZone13Compare": "0:25",
    "hrZone45Today": "0:00", "hrZone45Compare": "0:00",
    "strengthToday": "0:00", "strengthCompare": "0:00",
    "stepsToday": "4,315", "stepsCompare": "3,471",
    "caloriesToday": "247",
    "recoveryPercent": 71,
    "recoveryStatus": "string บรรยายสั้นๆ 1 บรรทัด",
    "hrvToday": "51 ms", "hrvCompare": "48",
    "rhrToday": "56 bpm", "rhrCompare": "58",
    "sleepPerformanceToday": "98%", "sleepPerformanceCompare": "78%",
    "hrvSeries": [43, 45, 40, null, 47, 50, 68],
    "rhrSeries": [61, 59, 66, null, 63, 57, 68],
    "recoverySeries": [51, 63, 55, null, 72, 71, 73],
    "aiInsight": "string วิเคราะห์เชิงลึกด้านกิจกรรมและการฟื้นตัว 2-3 ประโยค อ้างอิงตัวเลขจริง เช่น ค่า HRV ที่ดีขึ้นและ Body Load ที่ลดลงส่งผลต่อ Recovery",
    "tips": "string คำแนะนำด้านกิจกรรม 1-2 ประโยค เช่น รักษาสมดุลการฝึกและพัก"
  },
  "sleep": {
    "qualityPercent": 67,
    "qualityStatus": "string บรรยายสั้นๆ 1 บรรทัด เช่น 'คุณภาพการนอนอยู่ในเกณฑ์ดี'",
    "qualitySeries": [62, 52, 88, null, 81, 69, 67],
    "durationToday": "7:06 ชม.",
    "durationNote": "string เช่น 'เกินเป้าหมาย 7:00' (อ่านจากใต้ชื่อ เวลานอนทั้งหมด)",
    "efficiencyPercent": 92,
    "consistencyPercent": 61,
    "highStressPercent": 7,
    "stageLightPercent": 68,
    "stageLightTime": "4:45",
    "stageDeepPercent": 14,
    "stageDeepTime": "1:01",
    "stageRemPercent": 12,
    "stageRemTime": "0:52",
    "stageAwakePercent": 6,
    "stageAwakeTime": "0:28",
    "stageNote": "string สรุปสั้นๆ เกี่ยวกับโครงสร้างการนอน 1 ประโยค",
    "restorativeSleep": "1:53 ชม.",
    "restorativeCompare": "เป้าหมาย 2:04",
    "hoursVsNeededSeries": [6.48, 5.03, 9.2, null, 8.57, 6.85, 6.63],
    "hoursNeededSeries": [9.35, 9.08, 10.0, null, 8.07, 8.07, 8.83],
    "consistencySeries": [47, 35, 49, null, 40, 53, 61],
    "aiInsight": "string วิเคราะห์เชิงลึกด้านการนอน 2-3 ประโยค อ้างอิงตัวเลขจริง เช่น ประสิทธิภาพการนอน 92% และฟื้นตัวได้ดี",
    "tips": "string คำแนะนำด้านการนอน 1-2 ประโยค เช่น เข้านอนเวลาเดิมทุกวัน"
  },
  "confidence": number 0-1,
  "notes": "string หมายเหตุอย่างเป็นมิตรหากมีข้อแนะนำเพิ่มเติม"
}

ถ้าพบภาพไม่ครบ 3 ประเภท (เช่นขาดหน้า Sleep Quality) หรือภาพไม่ใช่หน้าจอแอปสุขภาพ ให้ตอบ "detected": false และระบุใน "foundPages" ว่าพบหน้าอะไรบ้าง และ "notes" บอกว่าขาดหน้าไหน อย่างเป็นมิตร เช่น 'ยังขาดภาพหน้า "Sleep Quality" ค่ะ ลองส่งเพิ่มอีกครั้งนะคะ'

คำแนะนำน้ำเสียง: ใช้น้ำเสียงผู้เชี่ยวชาญหญิงที่พูดจาสุภาพ อบอุ่น ใส่ใจ ในส่วน summary, aiInsight, tips, notes ให้ลงท้ายประโยคด้วย 'ค่ะ', 'นะคะ' เสมอ และหากทราบชื่อเล่นผู้ใช้ ให้เรียกว่า 'คุณ<ชื่อเล่น>'`;

const WEEKLY_MAX_OUTPUT_TOKENS = 3200;
const WEEKLY_CONFIDENCE_THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD || 0.7);

function buildWeeklyPromptText(userProfile = {}) {
  let text = WEEKLY_SYSTEM_PROMPT;
  if (userProfile.nickname) {
    text += `\n\nข้อมูลโปรไฟล์ผู้ใช้งานในระบบ biokoop:\n- ชื่อเล่น: คุณ${userProfile.nickname}\n- เพศ: ${userProfile.gender || "ไม่ระบุ"}\n(ให้เรียกผู้ใช้ว่า 'คุณ${userProfile.nickname}' ในทุกข้อความสรุป/คำแนะนำ)`;
  }
  return text;
}

export function parseWeeklyAiResponse(rawText) {
  if (!rawText) return { ok: false, error: "AI_EMPTY_RESPONSE" };
  const cleaned = String(rawText).replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn(`[aiService] ⚠️ Weekly JSON parse ไม่สำเร็จ: ${String(rawText).slice(0, 200)}`);
    return { ok: false, error: "AI_INVALID_JSON", raw: rawText };
  }

  // ผ่อนปรน schema: ถ้าไม่มี detected แต่มีข้อมูลหลัก ถือว่าพบข้อมูล
  let detected = typeof parsed.detected === "boolean" ? parsed.detected : null;
  if (detected === null) {
    const hasContent = !!(parsed.overview || parsed.activity || parsed.sleep || parsed.result);
    detected = parsed.notes && !hasContent ? false : hasContent;
  }

  // confidence บางโมเดลส่งนอกช่วง/ส่งไม่มา -> clamp หรือใช้ค่าปลายทางกลาง
  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    confidence = detected ? 0.75 : 0.3;
  }

  if (typeof detected !== "boolean") {
    return { ok: false, error: "AI_SCHEMA_MISMATCH", raw: parsed };
  }

  return { ok: true, data: { ...parsed, detected, confidence } };
}

// เช็คค่าขั้นต่ำของผลวิเคราะห์รายสัปดาห์ (ไม่ผูกกับ AI)
export function validateWeeklyResult(weeklyData, confidenceThreshold = 0.7) {
  const problems = [];
  if (!weeklyData.detected) problems.push("AI อ่านภาพ 3 หน้าไม่ครบหรือไม่พบข้อมูล");
  if (typeof weeklyData.confidence !== "number" || weeklyData.confidence < confidenceThreshold) {
    problems.push(`confidence ต่ำกว่าเกณฑ์ (${weeklyData.confidence} < ${confidenceThreshold})`);
  }
  const found = weeklyData.foundPages || [];
  for (const page of ["body_load", "recovery", "sleep_quality"]) {
    if (weeklyData.detected && !found.includes(page)) {
      problems.push(`ขาดข้อมูลหน้า ${page}`);
    }
  }
  return { valid: problems.length === 0, problems };
}

// ─── OpenRouter (หลัก): ส่งรูปทั้ง 3 ใน 1 รีเควสต์ ───
async function analyzeWeeklyImagesOpenRouter(imageBuffers, mimeType = "image/jpeg", userProfile = {}) {
  const startTime = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("ไม่พบ OPENROUTER_API_KEY ใน .env");

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const content = [{ type: "text", text: buildWeeklyPromptText(userProfile) }];
  for (const buf of imageBuffers) {
    content.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${buf.toString("base64")}` } });
  }

  const userDisplayName = userProfile.nickname ? `คุณ${userProfile.nickname}` : (userProfile.lineUserId || "LINE User");
  const referenceTag = userProfile.lineUserId ? `line_user:${userProfile.lineUserId}` : "biokoop_app";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.PUBLIC_BASE_URL || "https://biokoop.app",
      "X-Title": "Biokoop Weekly Report Bot",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      temperature: 0.1,
      max_tokens: WEEKLY_MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
    }),
  });

  const durationMs = Date.now() - startTime;

  if (!response.ok) {
    const errText = await response.text();
    logAiUsage({
      provider: "openrouter",
      model: `openrouter/${model}`,
      operation: "chat.completions",
      source: "analyzeWeeklyImagesOpenRouter",
      user: userDisplayName,
      reference: referenceTag,
      duration_ms: durationMs,
      status: "error",
      http_status: response.status,
      error_message: errText,
    });
    throw new Error(`OpenRouter API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  const usage = {
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
    totalTokens: data.usage?.total_tokens || 0,
  };

  logAiUsage({
    provider: "openrouter",
    model: `openrouter/${model}`,
    operation: "chat.completions",
    source: "analyzeWeeklyImagesOpenRouter",
    user: userDisplayName,
    reference: referenceTag,
    request_id: data.id || undefined,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    cost_usd: data.usage?.cost || data.usage?.total_cost || undefined,
    duration_ms: durationMs,
    status: "success",
    http_status: response.status,
    raw_usage: data.usage || {},
  });

  return { ...parseWeeklyAiResponse(rawText), model: `openrouter/${model}`, usage };
}

// ─── Gemini (สำรอง): ส่งรูปทั้ง 3 ใน 1 รีเควสต์ ───
async function analyzeWeeklyImagesGemini(imageBuffers, mimeType = "image/jpeg", userProfile = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("ไม่พบ GEMINI_API_KEY ใน .env");

  const parts = [{ text: buildWeeklyPromptText(userProfile) }];
  for (const buf of imageBuffers) {
    parts.push({ inline_data: { mime_type: mimeType, data: buf.toString("base64") } });
  }

  const userDisplayName = userProfile.nickname ? `คุณ${userProfile.nickname}` : (userProfile.lineUserId || "LINE User");
  const referenceTag = userProfile.lineUserId ? `line_user:${userProfile.lineUserId}` : "biokoop_app";

  let lastErrorText = "";
  for (const modelName of CANDIDATE_MODELS) {
    const startTime = Date.now();
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: WEEKLY_MAX_OUTPUT_TOKENS,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      const durationMs = Date.now() - startTime;

      if (response.ok) {
        console.log(`[aiService] ⚡ Weekly วิเคราะห์สำเร็จด้วยโมเดล ${modelName}`);
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const usageMeta = data.usageMetadata || {};
        const usage = {
          promptTokens: usageMeta.promptTokenCount || 0,
          completionTokens: usageMeta.candidatesTokenCount || 0,
          totalTokens: usageMeta.totalTokenCount || 0,
        };

        logAiUsage({
          provider: "gemini",
          model: modelName,
          operation: "generateContent",
          source: "analyzeWeeklyImagesGemini",
          user: userDisplayName,
          reference: referenceTag,
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          duration_ms: durationMs,
          status: "success",
          http_status: response.status,
          raw_usage: usageMeta,
        });

        return { ...parseWeeklyAiResponse(rawText), model: modelName, usage };
      }

      lastErrorText = await response.text();
      console.warn(`[aiService] ⚠️ Weekly โมเดล ${modelName} คืนสถานะ ${response.status} สลับโมเดลถัดไป...`);
      logAiUsage({
        provider: "gemini",
        model: modelName,
        operation: "generateContent",
        source: "analyzeWeeklyImagesGemini",
        user: userDisplayName,
        reference: referenceTag,
        duration_ms: durationMs,
        status: "error",
        http_status: response.status,
        error_message: lastErrorText,
      });
    } catch (err) {
      lastErrorText = err.message;
      console.warn(`[aiService] ⚠️ Weekly โมเดล ${modelName} เกิดข้อผิดพลาด: ${err.message} สลับโมเดลถัดไป...`);
      logAiUsage({
        provider: "gemini",
        model: modelName,
        operation: "generateContent",
        source: "analyzeWeeklyImagesGemini",
        user: userDisplayName,
        reference: referenceTag,
        duration_ms: Date.now() - startTime,
        status: "error",
        http_status: 500,
        error_message: err.message,
      });
    }
  }

  throw new Error(`Gemini API error (ทุกโมเดลขัดข้อง): ${lastErrorText}`);
}

// ═══════════════════════════════════════════════════════════════════
// ตัวจำแนกประเภทภาพ Screenshot Kieslect แบบเร็ว (1 รูป -> ประเภท 1 ตัว)
// ใช้สำหรับเช็กลิสต์รับภาพ 3 หน้าก่อนส่งวิเคราะห์รวม
// คืนค่า: "body_load" | "recovery" | "sleep_quality" | "unknown"
// ═══════════════════════════════════════════════════════════════════

const CLASSIFY_PROMPT = `คุณเป็นตัวจำแนกประเภทหน้าจอแอป Kieslect ระดับเร็ว

ดูภาพ Screenshot 1 รูป แล้วระบุว่าเป็นหน้าไหนจาก 3 หน้านี้:
- "body_load" : หน้า Body Load — มีวงแหวนคะแนน Body Load ใหญ่, กราฟแท่ง Body Load 7 วัน, Heart Rate Zone 1-3 / 4-5, Strength Training, Steps, Calories
- "recovery" : หน้า Recovery — มีวงแหวน Recovery %, ช่อง Today vs Last 30 Days (HRV / Resting Heart Rate / Sleep Performance), กราฟเส้น HRV, กราฟเส้น Resting Heart Rate, กราฟแท่ง Recovery
- "sleep_quality" : หน้า Sleep Quality — มีวงแหวน Sleep Quality %, กราฟแท่ง Sleep Quality 7 วัน, Sleep Duration, Sleep Efficiency, Sleep Consistency, Sleep Stage (Light/Deep/REM), Restorative Sleep, Hours vs. Needed

ตอบกลับเป็น JSON เท่านั้น (ห้ามมีข้อความอื่น ห้ามใช้ markdown code fence):
{"page": "body_load" | "recovery" | "sleep_quality" | "unknown", "confidence": number 0-1}

ถ้าภาพไม่ใช่หน้าจอแอป Kieslect หรือดูไม่ออก ให้ตอบ {"page": "unknown", "confidence": 0.2}`;

export async function classifyWeeklyImage(imageBuffer, mimeType = "image/jpeg") {
  // ลอง OpenRouter ก่อน (เร็วและถูก) ถ้าพังลอง Gemini
  try {
    const result = await classifyWeeklyImageOpenRouter(imageBuffer, mimeType);
    if (result) return result;
  } catch (err) {
    console.warn(`[aiService] classify OpenRouter ล้มเหลว (${err.message}) — ลอง Gemini`);
  }
  try {
    return await classifyWeeklyImageGemini(imageBuffer, mimeType);
  } catch (err) {
    console.warn(`[aiService] classify Gemini ล้มเหลว (${err.message}) — คืนค่า unknown`);
    return { page: "unknown", confidence: 0 };
  }
}

async function classifyWeeklyImageOpenRouter(imageBuffer, mimeType = "image/jpeg") {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("ไม่พบ OPENROUTER_API_KEY");
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const imageBase64 = imageBuffer.toString("base64");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.PUBLIC_BASE_URL || "https://biokoop.app",
      "X-Title": "Biokoop Classifier",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: CLASSIFY_PROMPT },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 80,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    logAiUsage({
      provider: "openrouter",
      model: `openrouter/${model}`,
      operation: "chat.completions",
      source: "classifyWeeklyImageOpenRouter",
      duration_ms: 0,
      status: "error",
      http_status: response.status,
      error_message: errText,
    });
    throw new Error(`OpenRouter classify error (${response.status})`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || "";
  logAiUsage({
    provider: "openrouter",
    model: `openrouter/${model}`,
    operation: "chat.completions",
    source: "classifyWeeklyImageOpenRouter",
    prompt_tokens: data.usage?.prompt_tokens || 0,
    completion_tokens: data.usage?.completion_tokens || 0,
    cost_usd: data.usage?.cost || data.usage?.total_cost || undefined,
    duration_ms: 0,
    status: "success",
    http_status: response.status,
    raw_usage: data.usage || {},
  });

  return parseClassifyResponse(rawText);
}

async function classifyWeeklyImageGemini(imageBuffer, mimeType = "image/jpeg") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("ไม่พบ GEMINI_API_KEY");
  const imageBase64 = imageBuffer.toString("base64");

  // ใช้โมเดล flash-lite ตัวแรกที่คุ้นเคยสำหรับงานเล็ก
  const modelName = CANDIDATE_MODELS[0];
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: CLASSIFY_PROMPT },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 80,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    logAiUsage({
      provider: "gemini",
      model: modelName,
      operation: "generateContent",
      source: "classifyWeeklyImageGemini",
      duration_ms: 0,
      status: "error",
      http_status: response.status,
      error_message: errText,
    });
    throw new Error(`Gemini classify error (${response.status})`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const usageMeta = data.usageMetadata || {};
  logAiUsage({
    provider: "gemini",
    model: modelName,
    operation: "generateContent",
    source: "classifyWeeklyImageGemini",
    prompt_tokens: usageMeta.promptTokenCount || 0,
    completion_tokens: usageMeta.candidatesTokenCount || 0,
    duration_ms: 0,
    status: "success",
    http_status: response.status,
    raw_usage: usageMeta,
  });

  return parseClassifyResponse(rawText);
}

function parseClassifyResponse(rawText) {
  if (!rawText) return null;
  const cleaned = String(rawText).replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const valid = ["body_load", "recovery", "sleep_quality", "unknown"];
  const page = valid.includes(parsed.page) ? parsed.page : "unknown";
  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    confidence = page === "unknown" ? 0.2 : 0.75;
  }
  return { page, confidence };
}

// ─── จุดเรียกหลักสำหรับรายงานรายสัปดาห์ (OpenRouter ก่อน, ตกไป Gemini) ───
export async function analyzeWeeklyImages(imageBuffers, mimeType = "image/jpeg", userProfile = {}) {
  if (!Array.isArray(imageBuffers) || imageBuffers.length === 0) {
    throw new Error("analyzeWeeklyImages ต้องการ imageBuffers อย่างน้อย 1 รายการ");
  }
  try {
    const resp = await analyzeWeeklyImagesOpenRouter(imageBuffers, mimeType, userProfile);
    if (resp.ok) {
      const threshold = WEEKLY_CONFIDENCE_THRESHOLD;
      const needsReview = !(resp.data?.confidence >= threshold);
      if (needsReview) {
        console.log(`[aiService] 🔍 Weekly confidence ต่ำ (${resp.data?.confidence ?? 0} < ${threshold}) ติดธง needsReview`);
      }
      return { ...resp, needsReview };
    }
    console.warn(`[aiService] ⚠️ Weekly OpenRouter parse ล้มเหลว (${resp.error}) — ลอง Gemini สำรอง`);
  } catch (err) {
    console.warn(`[aiService] ⚠️ Weekly OpenRouter ล้มเหลว (${err.message}) — ลอง Gemini สำรอง`);
  }
  const resp = await analyzeWeeklyImagesGemini(imageBuffers, mimeType, userProfile);
  const threshold = WEEKLY_CONFIDENCE_THRESHOLD;
  const needsReview = !(resp.ok && resp.data?.confidence >= threshold);
  return { ...resp, needsReview };
}

// ─── GEMINI (สำรอง ไม่ได้ใช้เป็นหลัก) ───
async function analyzeImageGemini(imageBuffer, mimeType = "image/jpeg", userProfile = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("ไม่พบ GEMINI_API_KEY ใน .env");

  const imageBase64 = imageBuffer.toString("base64");

  const gradeConfig = getGradeConfig();
  const gradeRulesText = (gradeConfig.grades || [])
    .map(g => `- คะแนน ${g.minScore}-${g.maxScore}: ได้เกรด ${g.grade} (${g.label}) | แนวทางคำพูด: "${g.defaultHeadline}"`)
    .join("\n");

  let userPromptText = SYSTEM_PROMPT;
  if (gradeRulesText) {
    userPromptText += `\n\nเกณฑ์การประเมินเกรดและคะแนนที่กำหนดโดยระบบ biokoop:\n${gradeRulesText}\nคำแนะนำ: ประเมินเกรด (grade) และใช้แนวทางน้ำเสียงคำพูดให้สอดคล้องกับคะแนน (score) ตามเกณฑ์ด้านบนอย่างเคร่งครัด`;
  }
  if (userProfile && (userProfile.nickname || userProfile.gender)) {
    userPromptText += `\n\nข้อมูลโปรไฟล์ผู้ใช้งานในระบบ biokoop:\n- ชื่อเล่น: ${userProfile.nickname || "ผู้ใช้งาน"}\n- เพศ: ${userProfile.gender || "ไม่ระบุ"}\nคำแนะนำน้ำเสียง: ระบบนี้ใช้บุคลิกและน้ำเสียงผู้หญิง (ผู้เชี่ยวชาญหญิง) ที่พูดจาสุภาพ น่ารัก อ่อนหวาน ใส่ใจ สนิทสนมเป็นกันเอง ในส่วน healthAdvice, aiSummary, tips, notes ให้ระบุชื่อ 'คุณ${userProfile.nickname || "ผู้ใช้งาน"}' และลงท้ายประโยคด้วย 'ค่ะ', 'นะคะ', 'น่า' เสมอ ห้ามใช้คำว่า 'ครับ' หรือ 'นะครับ' เด็ดขาด`;
  } else {
    userPromptText += `\n\nคำแนะนำน้ำเสียง: ระบบนี้ใช้บุคลิกและน้ำเสียงผู้หญิง (ผู้เชี่ยวชาญหญิง) ที่พูดจาสุภาพ น่ารัก อ่อนหวาน ใส่ใจ สนิทสนมเป็นกันเอง ในทุกส่วน (healthAdvice, aiSummary, tips, notes) ให้ลงท้ายประโยคด้วย 'ค่ะ', 'นะคะ', 'น่า' เสมอ ห้ามใช้คำว่า 'ครับ' หรือ 'นะครับ' เด็ดขาด`;
  }

  const userDisplayName = userProfile.nickname ? `คุณ${userProfile.nickname}` : (userProfile.lineUserId || "LINE User");
  const referenceTag = userProfile.lineUserId ? `line_user:${userProfile.lineUserId}` : "biokoop_app";

  let lastErrorText = "";
  for (const modelName of CANDIDATE_MODELS) {
    const startTime = Date.now();
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: userPromptText },
                  { inline_data: { mime_type: mimeType, data: imageBase64 } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1200,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      const durationMs = Date.now() - startTime;

      if (response.ok) {
        console.log(`[aiService] ⚡ วิเคราะห์สำเร็จด้วยโมเดล ${modelName}`);
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const usageMeta = data.usageMetadata || {};
        const usage = {
          promptTokens: usageMeta.promptTokenCount || 0,
          completionTokens: usageMeta.candidatesTokenCount || 0,
          totalTokens: usageMeta.totalTokenCount || 0,
        };

        // บันทึก Log Token ลง AI Usage Hub
        logAiUsage({
          provider: "gemini",
          model: modelName,
          operation: "generateContent",
          source: "analyzeImageGemini",
          user: userDisplayName,
          reference: referenceTag,
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          duration_ms: durationMs,
          status: "success",
          http_status: response.status,
          raw_usage: usageMeta,
        });

        return { ...parseAiResponse(rawText), model: modelName, usage };
      }

      lastErrorText = await response.text();
      console.warn(`[aiService] ⚠️ โมเดล ${modelName} คืนค่าสถานะ ${response.status} สลับไปยังโมเดลถัดไป...`);

      logAiUsage({
        provider: "gemini",
        model: modelName,
        operation: "generateContent",
        source: "analyzeImageGemini",
        user: userDisplayName,
        reference: referenceTag,
        duration_ms: durationMs,
        status: "error",
        http_status: response.status,
        error_message: lastErrorText,
      });

    } catch (err) {
      lastErrorText = err.message;
      console.warn(`[aiService] ⚠️ โมเดล ${modelName} เกิดข้อผิดพลาด: ${err.message} สลับไปยังโมเดลถัดไป...`);

      logAiUsage({
        provider: "gemini",
        model: modelName,
        operation: "generateContent",
        source: "analyzeImageGemini",
        user: userDisplayName,
        reference: referenceTag,
        duration_ms: Date.now() - startTime,
        status: "error",
        http_status: 500,
        error_message: err.message,
      });
    }
  }

  throw new Error(`Gemini API error (ทุกโมเดลในโควต้าขัดข้อง): ${lastErrorText}`);
}

// ─── OPENROUTER (โมเดลที่ 2 สำหรับ CROSS-CHECK หรือ FALLBACK) ───
export async function analyzeImageOpenRouter(imageBuffer, mimeType = "image/jpeg", userProfile = {}) {
  const startTime = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("ไม่พบ OPENROUTER_API_KEY ใน .env");

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const imageBase64 = imageBuffer.toString("base64");

  const gradeConfig = getGradeConfig();
  const gradeRulesText = (gradeConfig.grades || [])
    .map(g => `- คะแนน ${g.minScore}-${g.maxScore}: ได้เกรด ${g.grade} (${g.label})`)
    .join("\n");

  let userPromptText = SYSTEM_PROMPT;
  if (gradeRulesText) {
    userPromptText += `\n\nเกณฑ์การประเมินเกรดและคะแนนที่กำหนดโดยระบบ biokoop:\n${gradeRulesText}`;
  }
  if (userProfile && userProfile.nickname) {
    userPromptText += `\n\nข้อมูลโปรไฟล์ผู้ใช้: ชื่อเล่น คุณ${userProfile.nickname} (ข้อกำหนด: หากระบุชื่อใน headline หรือเนื้อหา ให้ใช้คำว่า 'คุณ${userProfile.nickname}' โดยห้ามต่อเติมคำภาษาอังกฤษแปลกปลอม เช่น Here หรือคำสะกดเกินเด็ดขาด)`;
  }

  const userDisplayName = userProfile.nickname ? `คุณ${userProfile.nickname}` : (userProfile.lineUserId || "LINE User");
  const referenceTag = userProfile.lineUserId ? `line_user:${userProfile.lineUserId}` : "biokoop_app";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.PUBLIC_BASE_URL || "https://biokoop.app",
      "X-Title": "Biokoop Health Bot",
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userPromptText },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  const durationMs = Date.now() - startTime;

  if (!response.ok) {
    const errText = await response.text();

    logAiUsage({
      provider: "openrouter",
      model: `openrouter/${model}`,
      operation: "chat.completions",
      source: "analyzeImageOpenRouter",
      user: userDisplayName,
      reference: referenceTag,
      duration_ms: durationMs,
      status: "error",
      http_status: response.status,
      error_message: errText,
    });

    throw new Error(`OpenRouter API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  const usage = {
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
    totalTokens: data.usage?.total_tokens || 0,
  };

  // บันทึก Log Token ลง AI Usage Hub
  logAiUsage({
    provider: "openrouter",
    model: `openrouter/${model}`,
    operation: "chat.completions",
    source: "analyzeImageOpenRouter",
    user: userDisplayName,
    reference: referenceTag,
    request_id: data.id || undefined,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    cost_usd: data.usage?.cost || data.usage?.total_cost || undefined,
    duration_ms: durationMs,
    status: "success",
    http_status: response.status,
    raw_usage: data.usage || {},
  });

  return { ...parseAiResponse(rawText), model: `openrouter/${model}`, usage };
}

// ─── PRIMARY ANALYSIS (ใช้ OpenRouter เป็นหลัก) ───
export async function analyzeImageWithCrossCheck(imageBuffer, mimeType = "image/jpeg", userProfile = {}) {
  // วิเคราะห์หลักด้วย OpenRouter
  let primaryResponse = await analyzeImageOpenRouter(imageBuffer, mimeType, userProfile);

  const confidenceThreshold = Number(process.env.CONFIDENCE_THRESHOLD || 0.7);

  // หากผลจาก OpenRouter มั่นใจสูงแล้ว ให้คืนค่าได้เลย
  if (primaryResponse.ok && primaryResponse.data?.confidence >= confidenceThreshold) {
    return { ...primaryResponse, needsReview: false };
  }

  console.log(`[aiService] 🔍 ความมั่นใจต่ำกว่า threshold (${primaryResponse.data?.confidence ?? 0} < ${confidenceThreshold}) ติดธง needsReview`);
  return { ...primaryResponse, needsReview: true };
}

export function parseAiResponse(rawText) {
  if (!rawText) {
    return { ok: false, error: "AI_EMPTY_RESPONSE" };
  }

  const cleaned = rawText.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "AI_INVALID_JSON", raw: rawText };
  }

  if (
    typeof parsed.detected !== "boolean" ||
    typeof parsed.confidence !== "number" ||
    parsed.confidence < 0 ||
    parsed.confidence > 1
  ) {
    return { ok: false, error: "AI_SCHEMA_MISMATCH", raw: parsed };
  }

  return { ok: true, data: parsed };
}

// เช็ค business rule เพิ่มเติม (ช่วงค่าที่สมเหตุสมผล) แยกจาก AI โดยสิ้นเชิง
export function validateAiResult(aiData, confidenceThreshold = 0.7) {
  const problems = [];

  if (!aiData.detected) {
    problems.push("AI ตรวจไม่พบข้อมูลที่วิเคราะห์ได้ในรูป");
  }
  if (aiData.confidence < confidenceThreshold) {
    problems.push(`confidence ต่ำกว่าเกณฑ์ (${aiData.confidence} < ${confidenceThreshold})`);
  }

  const r = aiData.result || {};
  if (typeof r.score === "number" && (r.score < 0 || r.score > 100)) {
    problems.push(`score อยู่นอกช่วงที่เป็นไปได้: ${r.score}`);
  }

  return { valid: problems.length === 0, problems };
}

