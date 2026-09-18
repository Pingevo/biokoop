/**
 * AI Quality & Discrepancy Analysis Service
 * บริการตรวจสอบความสมเหตุสมผลและจุดที่ AI อ่านเพี้ยน/ไม่มั่นใจ (Heuristics & Anomaly Detection)
 */

/**
 * ตรวจสอบความสมเหตุสมผลของข้อมูลผลวิเคราะห์รายสัปดาห์ (Weekly Report)
 * @param {Object} weeklyData ข้อมูลที่ AI สกัดได้ (overview, activity, sleep, days, ฯลฯ)
 * @returns {Object} { qualityStatus: 'passed'|'warning'|'error', score: number, anomalies: Array, summary: string }
 */
export function checkWeeklyAnomalies(weeklyData = {}) {
  const anomalies = [];
  const ov = weeklyData.overview || {};
  const act = weeklyData.activity || {};
  const slp = weeklyData.sleep || {};
  const days = Array.isArray(weeklyData.days) ? weeklyData.days : [];
  const foundPages = Array.isArray(weeklyData.foundPages) ? weeklyData.foundPages : [];

  // 1. ตรวจสอบการพบหน้าจอหลัก (Found Pages)
  const requiredPages = [
    { key: "body_load", name: "Body Load" },
    { key: "recovery", name: "Recovery" },
    { key: "sleep_quality", name: "Sleep Quality" },
  ];
  for (const p of requiredPages) {
    const isFound = foundPages.includes(p.key) || foundPages.includes(p.name);
    if (!isFound) {
      anomalies.push({
        field: `foundPages.${p.key}`,
        page: p.name,
        label: `หน้าจอ ${p.name}`,
        severity: "warning",
        readValue: "ไม่พบใน foundPages",
        issue: `ขาดภาพหน้าจอ "${p.name}" หรือ AI จำแนกหน้าจอไม่สำเร็จ`,
        suggestion: `ตรวจสอบว่ามีการแนบภาพหน้า ${p.name} ครบ 3 ใบหรือไม่ค่ะ`,
      });
    }
  }

  // 2. ตรวจสอบสัดส่วนระยะการนอน (Sleep Stage Percentages)
  // Light + Deep + REM + Awake ควรใกล้เคียง 100% (อนุโลม 90% - 108%)
  const light = Number(slp.stageLightPercent);
  const deep = Number(slp.stageDeepPercent);
  const rem = Number(slp.stageRemPercent);
  const awake = Number(slp.stageAwakePercent);

  const stageNumbers = [light, deep, rem, awake].filter(n => Number.isFinite(n) && n > 0);
  if (stageNumbers.length >= 3) {
    const stageSum = (Number.isFinite(light) ? light : 0) +
                     (Number.isFinite(deep) ? deep : 0) +
                     (Number.isFinite(rem) ? rem : 0) +
                     (Number.isFinite(awake) ? awake : 0);

    if (stageSum < 88 || stageSum > 112) {
      anomalies.push({
        field: "sleep.stagePercentages",
        page: "Sleep Quality",
        label: "สัดส่วนระยะการนอน (Sleep Stages)",
        severity: "error",
        readValue: `Light: ${light || 0}%, Deep: ${deep || 0}%, REM: ${rem || 0}%, Awake: ${awake || 0}% (รวม = ${stageSum}%)`,
        issue: `ผลรวมสัดส่วนการนอนหลับได้ ${stageSum}% ซึ่งต่างจาก 100% เกินเกณฑ์ปกติ (ปกติควรอยู่ในช่วง 90-108%)`,
        suggestion: "อาจเกิดจาก AI อ่านตัวเลขเปอร์เซ็นต์ผิด หรือกราฟแท่งมีข้อความซ้อนกันค่ะ",
      });
    }
  }

  // 3. ตรวจสอบความยาวชุดข้อมูลกราฟ 7 วันเทียบกับ days
  if (days.length > 0) {
    const seriesChecks = [
      { name: "bodyLoadSeries", label: "กราฟภาระร่างกาย (Body Load 7 วัน)", series: act.bodyLoadSeries, page: "Body Load" },
      { name: "recoverySeries", label: "กราฟการฟื้นตัว (Recovery 7 วัน)", series: act.recoverySeries, page: "Recovery" },
      { name: "hrvSeries", label: "กราฟ HRV (7 วัน)", series: act.hrvSeries, page: "Recovery" },
      { name: "rhrSeries", label: "กราฟอัตราหัวใจขณะพัก (RHR 7 วัน)", series: act.rhrSeries, page: "Recovery" },
      { name: "qualitySeries", label: "กราฟคุณภาพการนอน (Sleep Quality 7 วัน)", series: slp.qualitySeries, page: "Sleep Quality" },
      { name: "hoursVsNeededSeries", label: "กราฟชั่วโมงนอน (Hours Slept 7 วัน)", series: slp.hoursVsNeededSeries, page: "Sleep Quality" },
    ];

    for (const sc of seriesChecks) {
      if (Array.isArray(sc.series) && sc.series.length > 0) {
        if (sc.series.length !== days.length) {
          anomalies.push({
            field: sc.name,
            page: sc.page,
            label: sc.label,
            severity: "error",
            readValue: `มี ${sc.series.length} ค่า (วันมี ${days.length} วัน)`,
            issue: `จำนวนข้อมูลใน ${sc.label} (${sc.series.length} ค่า) ไม่ตรงกับจำนวนวันที่ตรวจพบ (${days.length} วัน)`,
            suggestion: "อาจมีวันที่หายไปแล้ว AI ไม่ได้เติมค่า null หรือตำแหน่งวันเลื่อนค่ะ",
          });
        }
      }
    }
  }

  // 4. ตรวจสอบค่าสรีรวิทยาหลุดช่วงปกติ (Physiological Bounds)
  // 4.1 Resting Heart Rate (ปกติขณะพัก 35 - 120 bpm)
  const rhrNum = parseNumber(act.rhrToday);
  if (rhrNum !== null) {
    if (rhrNum < 32 || rhrNum > 135) {
      anomalies.push({
        field: "activity.rhrToday",
        page: "Recovery",
        label: "อัตราการเต้นของหัวใจขณะพัก (Resting HR)",
        severity: rhrNum < 25 || rhrNum > 160 ? "error" : "warning",
        readValue: `${act.rhrToday}`,
        issue: `ค่า Resting Heart Rate (${act.rhrToday}) อยู่ผิดปกติสำหรับค่าขณะพักของผู้ใหญ่ (ปกติ 40–100 bpm)`,
        suggestion: "โปรดตรวจสอบว่าอ่านสลับกับ HR สูงสุด หรือตัวเลขในภาพเป็นหน่วยอื่นหรือไม่ค่ะ",
      });
    }
  }

  // 4.2 HRV (ปกติ 10 - 220 ms)
  const hrvNum = parseNumber(act.hrvToday);
  if (hrvNum !== null) {
    if (hrvNum <= 0 || hrvNum > 250) {
      anomalies.push({
        field: "activity.hrvToday",
        page: "Recovery",
        label: "ความแปรปรวนของหัวใจ (HRV)",
        severity: "warning",
        readValue: `${act.hrvToday}`,
        issue: `ค่า HRV (${act.hrvToday}) สูงหรือต่ำผิดปกติ (ปกติ 15–180 ms)`,
        suggestion: "ตรวจสอบตัวเลขในภาพหน้า Recovery อีกครั้งค่ะ",
      });
    }
  }

  // 4.3 Recovery % (0 - 100%)
  const recPct = Number(act.recoveryPercent ?? ov.recoveryPercent);
  if (Number.isFinite(recPct)) {
    if (recPct < 0 || recPct > 100) {
      anomalies.push({
        field: "activity.recoveryPercent",
        page: "Recovery",
        label: "เปอร์เซ็นต์การฟื้นตัว (Recovery %)",
        severity: "error",
        readValue: `${recPct}%`,
        issue: `ค่า Recovery % (${recPct}%) ไม่อยู่ในช่วง 0–100%`,
        suggestion: "AI อาจอ่านตัวเลขติดสัญลักษณ์หรือสับสนกับตัวเลขอื่นในหน้าจอค่ะ",
      });
    }
  }

  // 4.4 Sleep Quality % (0 - 100%)
  const slpPct = Number(slp.qualityPercent ?? ov.sleepQualityPercent);
  if (Number.isFinite(slpPct)) {
    if (slpPct < 0 || slpPct > 100) {
      anomalies.push({
        field: "sleep.qualityPercent",
        page: "Sleep Quality",
        label: "คุณภาพการนอน (Sleep Quality %)",
        severity: "error",
        readValue: `${slpPct}%`,
        issue: `ค่า Sleep Quality (${slpPct}%) ไม่อยู่ในช่วง 0–100%`,
        suggestion: "ตรวจสอบตัวเลขวงแหวนใหญ่ในหน้า Sleep Quality ค่ะ",
      });
    }
  }

  // 4.5 Sleep Efficiency (0 - 100%)
  const effPct = Number(slp.efficiencyPercent);
  if (Number.isFinite(effPct) && (effPct < 0 || effPct > 100)) {
    anomalies.push({
      field: "sleep.efficiencyPercent",
      page: "Sleep Quality",
      label: "ประสิทธิภาพการนอน (Sleep Efficiency %)",
      severity: "error",
      readValue: `${effPct}%`,
      issue: `ค่า Sleep Efficiency (${effPct}%) ไม่อยู่ในช่วง 0–100%`,
      suggestion: "ตรวจสอบตัวเลขประสิทธิภาพการนอนในแอปค่ะ",
    });
  }

  // 4.6 Body Load Today (0 - 30)
  const blNum = Number(act.bodyLoadToday ?? ov.bodyLoad);
  if (Number.isFinite(blNum)) {
    if (blNum < 0 || blNum > 45) {
      anomalies.push({
        field: "activity.bodyLoadToday",
        page: "Body Load",
        label: "ภาระร่างกาย (Body Load Today)",
        severity: "warning",
        readValue: `${blNum}`,
        issue: `ค่า Body Load (${blNum}) สูงเกินเกณฑ์ปกติของสมาร์ทวอทช์ Kieslect (ปกติ 0–20)`,
        suggestion: "ตรวจสอบว่าอ่านจุดทศนิยมผิด เช่น 16.5 เป็น 165 หรือไม่ค่ะ",
      });
    }
  }

  // 5. รายการที่ AI แจ้งเองว่าไม่มั่นใจ (AI-Reported Uncertainties)
  if (Array.isArray(weeklyData.lowConfidenceFields) && weeklyData.lowConfidenceFields.length > 0) {
    for (const item of weeklyData.lowConfidenceFields) {
      anomalies.push({
        field: item.field || "ai.doubt",
        page: item.page || "General",
        label: item.label || item.field || "จุดที่ AI ไม่มั่นใจ",
        severity: item.confidence && item.confidence < 0.5 ? "error" : "warning",
        readValue: item.value ?? "-",
        issue: `AI ระบุว่าไม่มั่นใจ: ${item.reason || "ภาพไม่ชัดเจนหรือตัวเลขเลือนราง"}`,
        suggestion: "โปรดดูภาพต้นฉบับเพื่อยืนยันความถูกต้องค่ะ",
      });
    }
  }

  // 6. ความมั่นใจภาพรวมต่ำ (Overall Confidence < 0.70)
  const confidence = Number(weeklyData.confidence);
  if (Number.isFinite(confidence) && confidence < 0.70) {
    anomalies.push({
      field: "ai.overallConfidence",
      page: "Overview",
      label: "ความมั่นใจภาพรวม (AI Confidence)",
      severity: "warning",
      readValue: `${Math.round(confidence * 100)}%`,
      issue: `AI ให้คะแนนความมั่นใจภาพรวมต่ำ (${Math.round(confidence * 100)}%)`,
      suggestion: "ภาพต้นฉบับอาจมีความละเอียดต่ำ เบลอ หรือไม่ใช่หน้าจอที่มาตรฐานค่ะ",
    });
  }

  // ประเมินสถานะภาพรวม (Overall Status)
  const errorCount = anomalies.filter(a => a.severity === "error").length;
  const warningCount = anomalies.filter(a => a.severity === "warning").length;

  let qualityStatus = "passed";
  if (errorCount > 0) {
    qualityStatus = "error";
  } else if (warningCount > 0) {
    qualityStatus = "warning";
  }

  let summary = "ข้อมูลผ่านการตรวจสอบความสมเหตุสมผล ไม่พบจุดผิดปกติหรืออ่านเพี้ยนค่ะ";
  if (qualityStatus === "error") {
    summary = `ตรวจพบจุดที่อ่านเพี้ยน/ผิดปกติชัดเจน ${errorCount} รายการ และจุดน่าสงสัย ${warningCount} รายการ ควรตรวจสอบก่อนใช้งานค่ะ`;
  } else if (qualityStatus === "warning") {
    summary = `ไม่พบข้อผิดพลาดร้ายแรง แต่มีจุดน่าสงสัย ${warningCount} รายการที่ควรตรวจสอบค่ะ`;
  }

  return {
    qualityStatus, // 'passed' | 'warning' | 'error'
    errorCount,
    warningCount,
    totalAnomalies: anomalies.length,
    anomalies,
    summary,
  };
}

/**
 * ตรวจสอบความสมเหตุสมผลของข้อมูลการ์ดรายวัน (Daily Sleep Card)
 * @param {Object} dailyData { parsedData, confidence, detected }
 * @returns {Object} { qualityStatus: 'passed'|'warning'|'error', score: number, anomalies: Array, summary: string }
 */
export function checkDailyAnomalies(dailyData = {}) {
  const anomalies = [];
  const p = dailyData.parsedData || {};

  // 1. ตรวจสอบคะแนนการนอน (Sleep Score 0 - 100)
  const scoreNum = parseNumber(p.score);
  if (scoreNum !== null && (scoreNum < 0 || scoreNum > 100)) {
    anomalies.push({
      field: "parsedData.score",
      page: "Sleep Score",
      label: "คะแนนการนอน (Sleep Score)",
      severity: "error",
      readValue: `${p.score}`,
      issue: `คะแนนการนอน (${p.score}) ไม่อยู่ในช่วง 0–100`,
      suggestion: "AI อาจอ่านตัวเลขผิดหรืออ่านสลับกับเวลานอนค่ะ",
    });
  }

  // 2. ตรวจสอบผลรวมสัดส่วนระยะการนอน (Deep + Light + REM + Awake)
  const deep = parseNumber(p.deepSleepPercent);
  const light = parseNumber(p.lightSleepPercent);
  const rem = parseNumber(p.remSleepPercent);
  const awake = parseNumber(p.awakePercent);

  const stageList = [deep, light, rem, awake].filter(n => n !== null && n > 0);
  if (stageList.length >= 3) {
    const sum = (deep || 0) + (light || 0) + (rem || 0) + (awake || 0);
    if (sum < 88 || sum > 112) {
      anomalies.push({
        field: "parsedData.sleepStages",
        page: "Sleep Stages",
        label: "สัดส่วนระยะการนอน (Deep/Light/REM)",
        severity: "error",
        readValue: `Deep ${deep || 0}%, Light ${light || 0}%, REM ${rem || 0}%, ตื่น ${awake || 0}% (รวม ${sum}%)`,
        issue: `ผลรวมสัดส่วนระยะการนอนได้ ${sum}% ซึ่งต่างจาก 100% เกินเกณฑ์ปกติ`,
        suggestion: "อาจมีตัวเลขระยะการนอนบางตัวที่อ่านผิดค่ะ",
      });
    }
  }

  // 3. ตรวจสอบอัตราการเต้นหัวใจเฉลี่ย (Avg Heart Rate 35 - 130 bpm)
  const hrNum = parseNumber(p.avgHeartRate);
  if (hrNum !== null && (hrNum < 32 || hrNum > 140)) {
    anomalies.push({
      field: "parsedData.avgHeartRate",
      page: "Heart Rate",
      label: "อัตราการเต้นหัวใจเฉลี่ย (Heart Rate)",
      severity: hrNum < 25 || hrNum > 165 ? "error" : "warning",
      readValue: `${p.avgHeartRate}`,
      issue: `อัตราหัวใจเฉลี่ยขณะนอน (${p.avgHeartRate}) สูงหรือต่ำเกินเกณฑ์ปกติ (ปกติ 40–100 bpm)`,
      suggestion: "ตรวจสอบตัวเลขในรูปภาพอีกครั้งค่ะ",
    });
  }

  // 4. ตรวจสอบ Recovery %
  const recNum = parseNumber(p.recoveryPercent);
  if (recNum !== null && (recNum < 0 || recNum > 100)) {
    anomalies.push({
      field: "parsedData.recoveryPercent",
      page: "Recovery",
      label: "เปอร์เซ็นต์การฟื้นตัว (Recovery %)",
      severity: "error",
      readValue: `${p.recoveryPercent}%`,
      issue: `ค่า Recovery % (${p.recoveryPercent}%) ไม่อยู่ในช่วง 0–100%`,
      suggestion: "ตรวจสอบตัวเลขในหน้าจอค่ะ",
    });
  }

  // 5. ความมั่นใจ AI ต่ำ
  const conf = Number(dailyData.confidence);
  if (Number.isFinite(conf) && conf < 0.70) {
    anomalies.push({
      field: "ai.overallConfidence",
      page: "General",
      label: "ความมั่นใจภาพรวม (AI Confidence)",
      severity: "warning",
      readValue: `${Math.round(conf * 100)}%`,
      issue: `AI ให้คะแนนความมั่นใจต่ำ (${Math.round(conf * 100)}%)`,
      suggestion: "รูปภาพอาจไม่ชัดหรือรูปแบบหน้าจอไม่คุ้นเคยค่ะ",
    });
  }

  const errorCount = anomalies.filter(a => a.severity === "error").length;
  const warningCount = anomalies.filter(a => a.severity === "warning").length;

  let qualityStatus = "passed";
  if (errorCount > 0) {
    qualityStatus = "error";
  } else if (warningCount > 0) {
    qualityStatus = "warning";
  }

  let summary = "ข้อมูลผ่านการตรวจสอบความสมเหตุสมผล ไม่พบจุดอ่านเพี้ยนค่ะ";
  if (qualityStatus === "error") {
    summary = `ตรวจพบจุดอ่านเพี้ยนชัดเจน ${errorCount} รายการ และจุดน่าสงสัย ${warningCount} รายการค่ะ`;
  } else if (qualityStatus === "warning") {
    summary = `มีจุดน่าสงสัย ${warningCount} รายการที่ควรตรวจสอบค่ะ`;
  }

  return {
    qualityStatus,
    errorCount,
    warningCount,
    totalAnomalies: anomalies.length,
    anomalies,
    summary,
  };
}

/**
 * ดึงเฉพาะตัวเลขจากสตริง เช่น "56 bpm" -> 56, "1,420" -> 1420
 */
function parseNumber(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

