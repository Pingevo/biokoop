import { checkWeeklyAnomalies, checkDailyAnomalies } from "../services/aiQualityService.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("=== 1. Testing Normal Weekly Data ===");
const normalWeeklyData = {
  foundPages: ["body_load", "recovery", "sleep_quality"],
  confidence: 0.95,
  days: ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."],
  overview: {
    bodyLoad: 18.5,
    recoveryPercent: 78,
    sleepQualityPercent: 82,
    restingHeartRate: 62,
    summary: "สุขภาพดีสัปดาห์นี้ค่ะ"
  },
  activity: {
    bodyLoadToday: 18.5,
    recoveryPercent: 78,
    series: [12, 14, 18, 15, 20, 22, 18.5],
    recoverySeries: [75, 80, 82, 70, 78, 85, 78]
  },
  sleep: {
    qualityPercent: 82,
    stagePercentages: {
      light: 50,
      deep: 25,
      rem: 20,
      awake: 5
    },
    series: [80, 85, 78, 82, 90, 75, 82]
  }
};

const resNormal = checkWeeklyAnomalies(normalWeeklyData);
console.log("Normal Quality Status:", resNormal.qualityStatus);
console.log("Normal Anomalies Count:", resNormal.anomalies.length);
assert(resNormal.qualityStatus === "passed", "Expected passed status");

console.log("\n=== 2. Testing Abnormal Weekly Data ===");
const abnormalWeeklyData = {
  foundPages: ["body_load"], // Missing recovery and sleep
  confidence: 0.60, // Below 0.7
  days: ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."], // 7 days
  lowConfidenceFields: [
    { field: "restingHeartRate", confidence: 0.45, reason: "ภาพตัวเลขเบลอเล็กน้อย" }
  ],
  overview: {
    bodyLoad: 65, // Out of range (max 45)
    recoveryPercent: 120, // Out of range (max 100)
    restingHeartRate: 185 // Out of range (max 135)
  },
  activity: {
    bodyLoadToday: 65,
    series: [12, 14, 18] // Length 3 != 7 days
  },
  sleep: {
    stagePercentages: {
      light: 20,
      deep: 15,
      rem: 15,
      awake: 5 // Sum = 55% (< 88%)
    }
  }
};

const resAbnormal = checkWeeklyAnomalies(abnormalWeeklyData);
console.log("Abnormal Quality Status:", resAbnormal.qualityStatus);
console.log("Abnormal Warning Count:", resAbnormal.warningCount);
console.log("Abnormal Error Count:", resAbnormal.errorCount);
console.log("Detected Anomalies:");
resAbnormal.anomalies.forEach((a, idx) => {
  console.log(`  ${idx + 1}. [${a.severity.toUpperCase()}] ${a.field}: ${a.issue} (Read: ${a.readValue})`);
});

assert(resAbnormal.qualityStatus === "error", "Expected error status for abnormal data");
assert(resAbnormal.anomalies.length >= 6, "Expected at least 6 anomalies detected");

console.log("\n=== 3. Testing Daily Anomalies ===");
const abnormalDailyData = {
  confidence: 0.55,
  parsedData: {
    deepSleepPercent: 10,
    lightSleepPercent: 20,
    remSleepPercent: 10,
    awakePercent: 5, // Sum = 45%
    avgHeartRate: "165 bpm", // > 140 bpm
    recoveryPercent: 115 // > 100%
  }
};
const resDaily = checkDailyAnomalies(abnormalDailyData);
console.log("Daily Quality Status:", resDaily.qualityStatus);
console.log("Daily Anomalies:");
resDaily.anomalies.forEach((a, idx) => {
  console.log(`  ${idx + 1}. [${a.severity.toUpperCase()}] ${a.field}: ${a.issue} (Read: ${a.readValue})`);
});
assert(resDaily.anomalies.length >= 3, "Expected at least 3 daily anomalies");

console.log("\nAll quality service checks passed successfully! ✨");
