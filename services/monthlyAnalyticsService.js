// services/monthlyAnalyticsService.js
// ระบบรวมข้อมูลและวิเคราะห์แนวโน้มสุขภาพรายเดือน (Monthly Health Trend Analytics)
// นำประวัติรายงาน 3 ภาพรายสัปดาห์ (Weekly Reports) มารวมและประมวลผลเป็นภาพใหญ่ 30 วัน

import { Request, REQUEST_STATUS } from "../models/Request.js";
import { User } from "../models/User.js";
import { MonthlyAuditFeedback } from "../models/MonthlyAuditFeedback.js";
import { logAiUsage } from "./aiUsageLogger.js";

// ═══════════════════════════════════════════════════════════════════
// 1. AI PROMPT: ระบบวิเคราะห์ภาพรวมสุขภาพรายเดือน (30 วัน)
// ═══════════════════════════════════════════════════════════════════
const MONTHLY_SYSTEM_PROMPT = `คุณเป็นหัวหน้าผู้เชี่ยวชาญด้านเวชศาสตร์สุขภาพและการฟื้นฟูร่างกาย (Chief AI Health Intelligence & Longevity Coach) สำหรับจัดทำ "รายงานวิเคราะห์แนวโน้มสุขภาพรายเดือน (Monthly Health Trend Report)"

ระบบจะส่งข้อมูลสุขภาพที่สรุปมาจากการวัด 4 สัปดาห์ (ในรอบ 30 วัน) ซึ่งประกอบด้วย 3 มิติหลัก:
1. Body Load & Activity (ภาระร่างกาย, โซนหัวใจ, การใช้พลังงาน)
2. Recovery & Autonomic Nervous System (การฟื้นตัว %, HRV, อัตราเต้นของหัวใจขณะพัก Resting HR)
3. Sleep Architecture & Quality (คุณภาพการนอน %, ระยะเวลาหลับลึก Deep Sleep, REM, ความสม่ำเสมอ Consistency, หนี้การนอน Sleep Debt)

ภารกิจของคุณ:
1. ประเมินภาพรวมสุขภาพ 30 วัน (Macro Health Evaluation)
2. วิเคราะห์พัฒนาการสัปดาห์ต่อสัปดาห์ (Week 1 -> Week 2 -> Week 3 -> Week 4)
3. ตรวจจับสัญญาณเตือน เช่น ภาวะล้าสะสม (Overreaching/Overtraining), ความเครียดเรื้อรัง (Chronic Stress จาก HRV ดิ่ง), หรือหนี้การนอนสะสม
4. สรุปความสำเร็จ (Key Achievements) และวางแผนพัฒนาสุขภาพสำหรับเดือนถัดไป (Next Month Action Plan) 3 ข้อที่ปฏิบัติได้จริง

กฎสำคัญ:
- ตอบกลับเป็น JSON เท่านั้น ห้ามมี markdown code block ห้ามมีข้อความเกริ่นนำ
- ใช้น้ำเสียงผู้เชี่ยวชาญหญิง สุภาพ อบอุ่น อ่อนหวาน น่าเชื่อถือ ลงท้ายประโยคด้วย "ค่ะ" หรือ "นะคะ" เสมอ
- เรียกผู้ใช้ว่า "คุณ<ชื่อเล่น>" เสมอ
- ห้ามใช้คำบอกเวลาประจำวัน เช่น "วันนี้", "เมื่อคืน" ให้ใช้บริบทของ "ในรอบเดือนนี้", "สัปดาห์ที่ 1-4" หรือ "ตลอด 30 วันที่ผ่านมา"

รูปแบบ JSON ที่ต้องส่งกลับ:
{
  "monthlyScore": number (0-100 คะแนนสุขภาพภาพรวมประจำเดือน),
  "monthlyStatus": "string สถานะ เช่น 'ยอดเยี่ยมและสมดุล', 'ฟื้นตัวได้ดี', 'ควรปรับลดความล้าสะสม'",
  "statusBadgeColor": "#10B981" | "#F59E0B" | "#EF4444" | "#6366F1",
  "executiveSummary": "string สรุปภาพรวมสุขภาพประจำเดือน 3-4 ประโยค ภาษาไทย สละสลวย อบอุ่น ชัดเจน อ้างอิงทิศทาง 4 สัปดาห์",
  "weeklyProgression": [
    {
      "weekNumber": 1,
      "label": "สัปดาห์ที่ 1",
      "status": "string บรรยายสั้น 1 บรรทัด",
      "highlight": "string ข้อสังเกตเด่น"
    },
    {
      "weekNumber": 2,
      "label": "สัปดาห์ที่ 2",
      "status": "string",
      "highlight": "string"
    },
    {
      "weekNumber": 3,
      "label": "สัปดาห์ที่ 3",
      "status": "string",
      "highlight": "string"
    },
    {
      "weekNumber": 4,
      "label": "สัปดาห์ที่ 4",
      "status": "string",
      "highlight": "string"
    }
  ],
  "macroPillars": {
    "activityLoad": {
      "score": number (0-100),
      "analysis": "string บทวิเคราะห์ภาระร่างกายและการออกกำลังกายในรอบเดือน 2-3 ประโยค",
      "status": "string"
    },
    "recoveryNervous": {
      "score": number (0-100),
      "analysis": "string บทวิเคราะห์การฟื้นตัวและแนวโน้ม HRV/Resting HR 2-3 ประโยค",
      "status": "string"
    },
    "sleepArchitecture": {
      "score": number (0-100),
      "analysis": "string บทวิเคราะห์คุณภาพการนอน โครงสร้างหลับลึกและความสม่ำเสมอ 2-3 ประโยค",
      "status": "string"
    }
  },
  "keyAchievements": [
    "string จุดเด่นหรือพฤติกรรมสุขภาพที่ดีเยี่ยมในเดือนนี้ ข้อที่ 1",
    "string ข้อที่ 2",
    "string ข้อที่ 3"
  ],
  "nextMonthActionPlan": [
    "string แผนปฏิบัติการพัฒนาตนเองสำหรับเดือนหน้า ข้อที่ 1 (ระบุวิธีทำที่ชัดเจน)",
    "string ข้อที่ 2",
    "string ข้อที่ 3"
  ]
}`;

// ═══════════════════════════════════════════════════════════════════
// 2. DATA AGGREGATOR: รวบรวมข้อมูล Requests ของผู้ใช้จริงในรอบ 30 วัน
// ═══════════════════════════════════════════════════════════════════

export async function aggregateUserMonthlyData(lineUserId, options = {}) {
  const limitWeeks = options.weeks || 4;

  const user = await User.findOne({ lineUserId }).lean();
  if (!user) {
    throw new Error(`ไม่พบข้อมูลผู้ใช้ lineUserId: ${lineUserId}`);
  }

  // ดึง Requests รายสัปดาห์ที่มี aiResult สมบูรณ์ ย้อนหลังสุด 4 รายการ
  const requests = await Request.find({
    lineUserId,
    status: { $in: [REQUEST_STATUS.SENT, "sent", "completed"] },
    aiResult: { $exists: true, $ne: null },
  })
    .sort({ createdAt: -1 })
    .limit(limitWeeks)
    .lean();

  if (requests.length === 0) {
    return {
      hasData: false,
      user: {
        lineUserId: user.lineUserId,
        displayName: user.displayName || "ผู้ใช้งาน",
        nickname: user.nickname || "",
      },
      message: "ผู้ใช้รายนี้ยังไม่มีประวัติการวิเคราะห์รายงานรายสัปดาห์ในระบบ",
      weeksData: [],
    };
  }

  // เรียงลำดับจากเก่าไปใหม่ (Week 1 -> Week 4)
  const sortedReqs = [...requests].reverse();

  const weeksData = sortedReqs.map((req, idx) => {
    const ai = req.aiResult || {};
    const ov = ai.overview || {};
    const act = ai.activity || {};
    const slp = ai.sleep || {};

    const blToday = Number(act.bodyLoadToday ?? ov.bodyLoad ?? 6.5);
    const recPct = Number(act.recoveryPercent ?? ov.recoveryPercent ?? 70);
    const slpPct = Number(slp.qualityPercent ?? ov.sleepQualityPercent ?? 80);
    const hrv = parseFloat(String(act.hrvToday || "45").replace(/[^0-9.]/g, "")) || 45;
    const rhr = parseFloat(String(act.rhrToday || "60").replace(/[^0-9.]/g, "")) || 60;
    const deepPct = Number(slp.stageDeepPercent ?? 15);
    const consistencyPct = Number(slp.consistencyPercent ?? 70);

    return {
      weekIndex: idx + 1,
      label: `สัปดาห์ที่ ${idx + 1}`,
      dateStr: req.createdAt ? new Date(req.createdAt).toLocaleDateString("th-TH") : `W${idx + 1}`,
      bodyLoad: Math.round(blToday * 10) / 10,
      recoveryPercent: Math.round(recPct),
      sleepQualityPercent: Math.round(slpPct),
      hrvMs: Math.round(hrv),
      restingHrBpm: Math.round(rhr),
      deepSleepPercent: Math.round(deepPct),
      sleepConsistencyPercent: Math.round(consistencyPct),
      sleepDuration: slp.durationToday || "7:00 ชม.",
      steps: act.stepsToday || "-",
      notes: ov.summary || "",
    };
  });

  // คำนวณค่าสถิติเฉลี่ยของทั้งเดือน
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0);
  const avgBodyLoad = avg(weeksData.map((w) => w.bodyLoad));
  const avgRecovery = Math.round(avg(weeksData.map((w) => w.recoveryPercent)));
  const avgSleep = Math.round(avg(weeksData.map((w) => w.sleepQualityPercent)));
  const avgHrv = Math.round(avg(weeksData.map((w) => w.hrvMs)));
  const avgRhr = Math.round(avg(weeksData.map((w) => w.restingHrBpm)));

  return {
    hasData: true,
    user: {
      lineUserId: user.lineUserId,
      displayName: user.displayName || "ผู้ใช้งาน",
      nickname: user.nickname || "สุขภาพดี",
      gender: user.gender || "unspecified",
    },
    totalWeeksFound: weeksData.length,
    monthlyAverages: {
      avgBodyLoad,
      avgRecovery,
      avgSleep,
      avgHrv,
      avgRhr,
    },
    weeksData,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 3. MOCK SCENARIO BUILDER: จำลองเคสทดสอบ 4 สัปดาห์
// ═══════════════════════════════════════════════════════════════════

export function generateMockMonthlyData(scenarioKey = "balanced") {
  const scenarios = {
    balanced: {
      name: "เคสที่ 1: สุขภาพสมดุลดีเยี่ยม (Balanced & Thriving)",
      description: "ออกกำลังกายสม่ำเสมอ การฟื้นตัวคงที่ และคุณภาพการนอนหลับเฉลี่ยอยู่ในเกณฑ์ดีตลอดเดือน",
      user: { displayName: "คุณสมาร์ท สุขภาพดี", nickname: "สมาร์ท", gender: "male" },
      weeksData: [
        { weekIndex: 1, label: "สัปดาห์ที่ 1", bodyLoad: 6.8, recoveryPercent: 72, sleepQualityPercent: 88, hrvMs: 48, restingHrBpm: 58, deepSleepPercent: 18, sleepConsistencyPercent: 75, sleepDuration: "7:15 ชม.", steps: "6,200", notes: "เริ่มต้นเดือนด้วยความสม่ำเสมอ" },
        { weekIndex: 2, label: "สัปดาห์ที่ 2", bodyLoad: 7.2, recoveryPercent: 75, sleepQualityPercent: 90, hrvMs: 50, restingHrBpm: 57, deepSleepPercent: 19, sleepConsistencyPercent: 80, sleepDuration: "7:30 ชม.", steps: "7,100", notes: "เพิ่มระดับกิจกรรมเล็กน้อย ร่างกายปรับตัวได้ดี" },
        { weekIndex: 3, label: "สัปดาห์ที่ 3", bodyLoad: 6.5, recoveryPercent: 78, sleepQualityPercent: 92, hrvMs: 52, restingHrBpm: 56, deepSleepPercent: 21, sleepConsistencyPercent: 82, sleepDuration: "7:40 ชม.", steps: "5,900", notes: "เน้นการฟื้นฟู ร่างกายสดชื่น" },
        { weekIndex: 4, label: "สัปดาห์ที่ 4", bodyLoad: 6.9, recoveryPercent: 80, sleepQualityPercent: 91, hrvMs: 53, restingHrBpm: 55, deepSleepPercent: 20, sleepConsistencyPercent: 85, sleepDuration: "7:35 ชม.", steps: "6,800", notes: "ปิดท้ายเดือนด้วยสมดุลระดับสูง" },
      ],
    },
    overreaching: {
      name: "เคสที่ 2: ภาวะล้าสะสม (Overreaching / Training Strain)",
      description: "ออกกำลังกายและ Body Load พุ่งสูงต่อเนื่องในสัปดาห์ 3-4 แต่ Recovery และ HRV ดิ่งลง เสี่ยงเจ็บป่วย",
      user: { displayName: "คุณแชมป์ สายฟิต", nickname: "แชมป์", gender: "male" },
      weeksData: [
        { weekIndex: 1, label: "สัปดาห์ที่ 1", bodyLoad: 6.5, recoveryPercent: 75, sleepQualityPercent: 86, hrvMs: 50, restingHrBpm: 56, deepSleepPercent: 18, sleepConsistencyPercent: 78, sleepDuration: "7:20 ชม.", steps: "6,500", notes: "ร่างกายพร้อมสมบูรณ์" },
        { weekIndex: 2, label: "สัปดาห์ที่ 2", bodyLoad: 8.5, recoveryPercent: 68, sleepQualityPercent: 80, hrvMs: 44, restingHrBpm: 60, deepSleepPercent: 15, sleepConsistencyPercent: 70, sleepDuration: "6:50 ชม.", steps: "9,800", notes: "เพิ่มการฝึกอย่างหนัก" },
        { weekIndex: 3, label: "สัปดาห์ที่ 3", bodyLoad: 11.2, recoveryPercent: 51, sleepQualityPercent: 69, hrvMs: 38, restingHrBpm: 65, deepSleepPercent: 12, sleepConsistencyPercent: 62, sleepDuration: "6:10 ชม.", steps: "13,200", notes: "โหลดสะสมสูงมาก อัตราเต้นหัวใจพักเริ่มสูงขึ้น" },
        { weekIndex: 4, label: "สัปดาห์ที่ 4", bodyLoad: 10.8, recoveryPercent: 46, sleepQualityPercent: 64, hrvMs: 34, restingHrBpm: 68, deepSleepPercent: 10, sleepConsistencyPercent: 55, sleepDuration: "5:45 ชม.", steps: "12,000", notes: "มีภาวะล้าสะสมชัดเจน HRV ต่ำ ควรให้เวลาฟื้นฟูด่วน" },
      ],
    },
    recovery_journey: {
      name: "เคสที่ 3: เส้นทางการฟื้นฟูสุขภาพ (Recovery & Sleep Repair)",
      description: "สัปดาห์แรกทรุดโทรมจากความเครียดและนอนน้อย แต่ปรับพฤติกรรมจนสุขภาพไต่ระดับดีขึ้นอย่างเห็นได้ชัด",
      user: { displayName: "คุณริน ผู้ปรับพฤติกรรม", nickname: "ริน", gender: "female" },
      weeksData: [
        { weekIndex: 1, label: "สัปดาห์ที่ 1", bodyLoad: 8.9, recoveryPercent: 42, sleepQualityPercent: 58, hrvMs: 32, restingHrBpm: 69, deepSleepPercent: 9, sleepConsistencyPercent: 45, sleepDuration: "5:15 ชม.", steps: "4,200", notes: "งานหนัก นอนดึก อ่อนเพลียสะสม" },
        { weekIndex: 2, label: "สัปดาห์ที่ 2", bodyLoad: 6.4, recoveryPercent: 58, sleepQualityPercent: 70, hrvMs: 39, restingHrBpm: 64, deepSleepPercent: 14, sleepConsistencyPercent: 62, sleepDuration: "6:30 ชม.", steps: "5,100", notes: "เริ่มจัดเวลาเข้านอนเร็วขึ้น ร่างกายเริ่มตอบสนอง" },
        { weekIndex: 3, label: "สัปดาห์ที่ 3", bodyLoad: 5.8, recoveryPercent: 69, sleepQualityPercent: 82, hrvMs: 46, restingHrBpm: 60, deepSleepPercent: 17, sleepConsistencyPercent: 74, sleepDuration: "7:10 ชม.", steps: "5,800", notes: "คุณภาพการนอนดีขึ้นอย่างเห็นได้ชัด หลับลึกเพิ่มขึ้น" },
        { weekIndex: 4, label: "สัปดาห์ที่ 4", bodyLoad: 6.2, recoveryPercent: 76, sleepQualityPercent: 89, hrvMs: 51, restingHrBpm: 57, deepSleepPercent: 19, sleepConsistencyPercent: 82, sleepDuration: "7:30 ชม.", steps: "6,400", notes: "การฟื้นตัวสมบูรณ์แบบ HRV กลับสู่เกณฑ์ดีเยี่ยม" },
      ],
    },
    sleep_inconsistent: {
      name: "เคสที่ 4: นอนไม่สม่ำเสมอ (Sleep Inconsistency / Social Jetlag)",
      description: "เวลานอนเหวี่ยงไปมา วันธรรมดานอนน้อย เสาร์-อาทิตย์นอนชดเชย ส่งผลต่อความสดชื่นระยะยาว",
      user: { displayName: "คุณนนท์ ตารางเหวี่ยง", nickname: "นนท์", gender: "male" },
      weeksData: [
        { weekIndex: 1, label: "สัปดาห์ที่ 1", bodyLoad: 7.0, recoveryPercent: 62, sleepQualityPercent: 74, hrvMs: 44, restingHrBpm: 61, deepSleepPercent: 14, sleepConsistencyPercent: 52, sleepDuration: "6:40 ชม.", steps: "5,800", notes: "เข้านอนไม่ตรงเวลา" },
        { weekIndex: 2, label: "สัปดาห์ที่ 2", bodyLoad: 6.8, recoveryPercent: 59, sleepQualityPercent: 71, hrvMs: 42, restingHrBpm: 63, deepSleepPercent: 12, sleepConsistencyPercent: 48, sleepDuration: "6:15 ชม.", steps: "6,100", notes: "Social Jetlag เวลานอนเสาร์-อาทิตย์ต่างจากธรรมดา 3 ชม." },
        { weekIndex: 3, label: "สัปดาห์ที่ 3", bodyLoad: 7.4, recoveryPercent: 64, sleepQualityPercent: 76, hrvMs: 43, restingHrBpm: 62, deepSleepPercent: 15, sleepConsistencyPercent: 54, sleepDuration: "6:50 ชม.", steps: "5,900", notes: "ประสิทธิภาพการนอนปานกลาง" },
        { weekIndex: 4, label: "สัปดาห์ที่ 4", bodyLoad: 7.1, recoveryPercent: 61, sleepQualityPercent: 73, hrvMs: 41, restingHrBpm: 64, deepSleepPercent: 13, sleepConsistencyPercent: 50, sleepDuration: "6:30 ชม.", steps: "6,300", notes: "ควรเร่งปรับความสม่ำเสมอของเวลาเข้านอน" },
      ],
    },
  };

  const selected = scenarios[scenarioKey] || scenarios.balanced;
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0);

  return {
    scenarioKey,
    name: selected.name,
    description: selected.description,
    user: selected.user,
    totalWeeksFound: 4,
    monthlyAverages: {
      avgBodyLoad: avg(selected.weeksData.map((w) => w.bodyLoad)),
      avgRecovery: Math.round(avg(selected.weeksData.map((w) => w.recoveryPercent))),
      avgSleep: Math.round(avg(selected.weeksData.map((w) => w.sleepQualityPercent))),
      avgHrv: Math.round(avg(selected.weeksData.map((w) => w.hrvMs))),
      avgRhr: Math.round(avg(selected.weeksData.map((w) => w.restingHrBpm))),
    },
    weeksData: selected.weeksData,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 4. AI ANALYZER: สั่ง AI วิเคราะห์ข้อมูล 4 สัปดาห์เชิงลึก
// ═══════════════════════════════════════════════════════════════════

function sanitizeFeminineResponse(parsed) {
  if (!parsed || typeof parsed !== "object") return parsed;
  const sanitizeText = (txt) => {
    if (typeof txt !== "string") return txt;
    return txt
      .replace(/ครับ/g, "ค่ะ")
      .replace(/นะครับ/g, "นะคะ")
      .replace(/ผม/g, "ระบบ")
      .replace(/วันนี้/g, "ในรอบเดือนนี้");
  };

  if (parsed.executiveSummary) parsed.executiveSummary = sanitizeText(parsed.executiveSummary);
  if (parsed.macroPillars) {
    for (const k of Object.keys(parsed.macroPillars)) {
      if (parsed.macroPillars[k]?.analysis) {
        parsed.macroPillars[k].analysis = sanitizeText(parsed.macroPillars[k].analysis);
      }
    }
  }
  if (Array.isArray(parsed.keyAchievements)) {
    parsed.keyAchievements = parsed.keyAchievements.map(sanitizeText);
  }
  if (Array.isArray(parsed.nextMonthActionPlan)) {
    parsed.nextMonthActionPlan = parsed.nextMonthActionPlan.map(sanitizeText);
  }
  return parsed;
}

async function analyzeMonthlyDataWithGeminiDirect(promptContent, modelName, userNickname, startTime) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("ไม่พบ GEMINI_API_KEY ใน .env");

  const cleanModel = (modelName || "").replace(/^gemini-direct:/, "").replace(/^google\//, "");
  const primaryModel = cleanModel.startsWith("gemini-") ? cleanModel : "gemini-3.8-flash";
  const candidateList = [primaryModel, "gemini-2.5-flash", "gemini-flash-latest"].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  let lastError = null;
  for (const targetModel of candidateList) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`,
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
                  { text: `${MONTHLY_SYSTEM_PROMPT}\n\n${promptContent}` },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 5000,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      const durationMs = Date.now() - startTime;
      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[monthlyAnalyticsService] Direct Gemini ${targetModel} status ${response.status}:`, errText);
        lastError = new Error(`Google Gemini Direct API Error (${response.status}): ${errText}`);
        continue;
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleanJson = rawText.replace(/```json|```/g, "").trim();
      const parsed = sanitizeFeminineResponse(JSON.parse(cleanJson));

      const promptTokens = data.usageMetadata?.promptTokenCount || 0;
      const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = data.usageMetadata?.totalTokenCount || (promptTokens + completionTokens);

      logAiUsage({
        provider: "gemini",
        model: targetModel,
        operation: "monthly_health_analysis",
        source: "monthlyAnalyticsService",
        user: `คุณ${userNickname}`,
        reference: "admin_monthly_lab",
        duration_ms: durationMs,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        status: "success",
      });

      return {
        ok: true,
        data: parsed,
        meta: {
          model: `gemini/${targetModel}`,
          provider: "google-direct",
          durationMs,
          tokens: totalTokens,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Gemini direct failed on all models");
}

export async function analyzeMonthlyDataWithAi(monthlySummaryData, userProfile = {}, preferredModel = null) {
  const startTime = Date.now();
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const defaultModel = process.env.OPENROUTER_MODEL || "google/gemini-3.8-flash";
  const model = preferredModel || defaultModel;

  const userNickname = userProfile.nickname || monthlySummaryData.user?.nickname || "สุขภาพดี";
  const userGender = userProfile.gender || monthlySummaryData.user?.gender || "ไม่ระบุ";

  const promptContent = `
ข้อมูลผู้ใช้งาน:
- ชื่อเล่น: คุณ${userNickname}
- เพศ: ${userGender}

ข้อมูลสถิติสุขภาพตลอด 4 สัปดาห์ (30 วัน):
${JSON.stringify(monthlySummaryData, null, 2)}

กรุณาวิเคราะห์แนวโน้มสุขภาพรายเดือนอย่างละเอียด และตอบกลับเป็น JSON ตามโครงสร้างที่ระบุไว้ใน System Prompt อย่างเคร่งครัดค่ะ
`;

  // 1. Direct Google Gemini request (เช่น gemini-direct:gemini-3.8-flash)
  if (model.startsWith("gemini-direct:") || model.startsWith("gemini:")) {
    if (geminiKey) {
      try {
        return await analyzeMonthlyDataWithGeminiDirect(promptContent, model, userNickname, startTime);
      } catch (err) {
        console.error("[monthlyAnalyticsService] Gemini direct error:", err.message);
        return generateDeterministicMonthlyAnalysis(monthlySummaryData, userProfile);
      }
    }
  }

  // 2. OpenRouter request
  if (openRouterKey) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openRouterKey}`,
          "HTTP-Referer": process.env.PUBLIC_BASE_URL || "https://biokoop.app",
          "X-Title": "Biokoop Monthly Health Analytics Lab",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: MONTHLY_SYSTEM_PROMPT },
            { role: "user", content: promptContent },
          ],
          temperature: 0.2,
          max_tokens: 6000,
          response_format: { type: "json_object" },
        }),
      });

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        const errText = await response.text();
        console.error("[monthlyAnalyticsService] OpenRouter API Error:", errText);
        if (geminiKey) {
          console.warn("[monthlyAnalyticsService] Falling back to Direct Gemini API after OpenRouter error...");
          try {
            return await analyzeMonthlyDataWithGeminiDirect(promptContent, "gemini-3.8-flash", userNickname, startTime);
          } catch (geminiErr) {
            console.error("[monthlyAnalyticsService] Fallback to Gemini Direct also failed:", geminiErr.message);
          }
        }
        return generateDeterministicMonthlyAnalysis(monthlySummaryData, userProfile);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || "";
      const cleanJson = rawContent.replace(/```json|```/g, "").trim();
      const parsed = sanitizeFeminineResponse(JSON.parse(cleanJson));

      logAiUsage({
        provider: "openrouter",
        model: `openrouter/${model}`,
        operation: "monthly_health_analysis",
        source: "monthlyAnalyticsService",
        user: `คุณ${userNickname}`,
        reference: "admin_monthly_lab",
        duration_ms: durationMs,
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        status: "success",
      });

      return {
        ok: true,
        data: parsed,
        meta: {
          model: `openrouter/${model}`,
          provider: "openrouter",
          durationMs,
          tokens: data.usage?.total_tokens || 0,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      console.error("[monthlyAnalyticsService] OpenRouter Exception:", err.message);
      if (geminiKey) {
        console.warn("[monthlyAnalyticsService] Falling back to Direct Gemini API after exception...");
        try {
          return await analyzeMonthlyDataWithGeminiDirect(promptContent, "gemini-3.8-flash", userNickname, startTime);
        } catch (geminiErr) {
          console.error("[monthlyAnalyticsService] Fallback to Gemini Direct also failed:", geminiErr.message);
        }
      }
      return generateDeterministicMonthlyAnalysis(monthlySummaryData, userProfile);
    }
  }

  // 3. If no OpenRouter key, try Gemini Direct
  if (geminiKey) {
    try {
      return await analyzeMonthlyDataWithGeminiDirect(promptContent, "gemini-3.8-flash", userNickname, startTime);
    } catch (err) {
      console.error("[monthlyAnalyticsService] Gemini direct fallback error:", err.message);
    }
  }

  // 4. Deterministic fallback
  console.warn("[monthlyAnalyticsService] No API keys available, generating deterministic monthly analysis");
  return generateDeterministicMonthlyAnalysis(monthlySummaryData, userProfile);
}

// Fallback Deterministic Generator ในกรณีไม่มี API key หรือ API ขัดข้อง
function generateDeterministicMonthlyAnalysis(monthlyData, userProfile = {}) {
  const nickname = userProfile.nickname || monthlyData.user?.nickname || "คุณ";
  const avg = monthlyData.monthlyAverages || {};

  const score = Math.min(100, Math.max(50, Math.round((avg.avgRecovery * 0.4 + avg.avgSleep * 0.4 + (10 - Math.min(avg.avgBodyLoad, 10)) * 2))));

  return {
    ok: true,
    data: {
      monthlyScore: score,
      monthlyStatus: score >= 80 ? "ยอดเยี่ยมและสมดุลดี" : score >= 65 ? "อยู่ในเกณฑ์ดี มีแนวโน้มพัฒนา" : "ควรเพิ่มเวลาพักฟื้น",
      statusBadgeColor: score >= 80 ? "#10B981" : score >= 65 ? "#6366F1" : "#F59E0B",
      executiveSummary: `ตลอดทั้งเดือนนี้ สุขภาพโดยรวมของคุณ${nickname} มีการรักษาระดับการฟื้นตัวเฉลี่ยที่ ${avg.avgRecovery}% และคุณภาพการนอนหลับเฉลี่ย ${avg.avgSleep}% ค่ะ ภาพรวมภาระร่างกายและการพักผ่อนมีความสมดุลสม่ำเสมอ แนะนำรักษาวินัยการนอนและจังหวะการออกกำลังกายต่อเนื่องนะคะ`,
      weeklyProgression: (monthlyData.weeksData || []).map((w) => ({
        weekNumber: w.weekIndex,
        label: w.label,
        status: `Body Load ${w.bodyLoad} • ฟื้นตัว ${w.recoveryPercent}%`,
        highlight: w.notes || `การนอนหลับมีคุณภาพ ${w.sleepQualityPercent}%`,
      })),
      macroPillars: {
        activityLoad: {
          score: Math.min(100, Math.round(avg.avgBodyLoad * 12)),
          analysis: `ตลอด 4 สัปดาห์ ระดับ Body Load เฉลี่ยอยู่ที่ ${avg.avgBodyLoad} จัดว่าอยู่ในช่วงที่เหมาะสม ไม่หักโหมจนเกินไปค่ะ`,
          status: "สมดุลดี",
        },
        recoveryNervous: {
          score: avg.avgRecovery,
          analysis: `อัตราการฟื้นตัวเฉลี่ย ${avg.avgRecovery}% และ HRV เฉลี่ย ${avg.avgHrv} ms แสดงว่าระบบประสาทพาราซิมพาเทติกทำงานได้สม่ำเสมอค่ะ`,
          status: "ฟื้นตัวดี",
        },
        sleepArchitecture: {
          score: avg.avgSleep,
          analysis: `คุณภาพการนอนเฉลี่ย ${avg.avgSleep}% ช่วยให้ร่างกายได้ซ่อมแซมส่วนที่สึกหรออย่างเต็มที่ค่ะ`,
          status: "มีคุณภาพ",
        },
      },
      keyAchievements: [
        `รักษาระดับการฟื้นตัวเฉลี่ยทั้งเดือนได้สูงถึง ${avg.avgRecovery}%`,
        `คุณภาพการนอนหลับอยู่ในเกณฑ์ดีต่อเนื่องเฉลี่ย ${avg.avgSleep}%`,
        `คุมภาระร่างกายในโซนที่ปลอดภัย ไม่เกิดภาวะล้าสะสม`,
      ],
      nextMonthActionPlan: [
        "รักษาเวลาเข้านอนและตื่นนอนให้ตรงเวลาเดิมในทุกวัน เพื่อเพิ่มความสม่ำเสมอของการนอน",
        "ออกกำลังกายใน Heart Rate Zone 1-2 สัปดาห์ละ 120-150 นาที เพื่อกระตุ้นระบบเผาผลาญ",
        "ยืดเหยียดกล้ามเนื้อและผ่อนคลายความตึงเครียด 10 นาทีก่อนนอนในทุกคืน",
      ],
    },
    meta: {
      model: "deterministic-analytics-engine",
      durationMs: 45,
      tokens: 0,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// 5. AUDIT & FEEDBACK: บันทึกการประเมินผลของแอดมินสำหรับเทรน AI
// ═══════════════════════════════════════════════════════════════════

export async function saveMonthlyAuditFeedback(feedbackData = {}) {
  try {
    const item = await MonthlyAuditFeedback.create(feedbackData);
    return { ok: true, item };
  } catch (err) {
    console.error("[monthlyAnalyticsService] Save audit error:", err);
    return { ok: false, error: err.message };
  }
}

export async function getMonthlyAuditHistory() {
  try {
    return await MonthlyAuditFeedback.find().sort({ createdAt: -1 }).limit(100).lean();
  } catch (err) {
    console.error("[monthlyAnalyticsService] Read audit error:", err);
    return [];
  }
}
