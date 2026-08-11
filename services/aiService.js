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

