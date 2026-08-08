import { analyzeImage, validateAiResult } from "./services/aiService.js";
import zlib from "zlib";
import { promisify } from "util";
import "dotenv/config";

const deflate = promisify(zlib.deflate);

// สร้าง PNG buffer แบบ pure JS ไม่ต้องใช้ library เพิ่ม
async function buildPNG(width = 200, height = 200) {
  function crc32(buf) {
    const t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ t[(c ^ buf[i]) & 0xff];
    return (c ^ 0xffffffff) >>> 0;
  }

  function mkChunk(type, data) {
    const typeB = Buffer.from(type, "ascii");
    const lenB = Buffer.alloc(4);
    lenB.writeUInt32BE(data.length, 0);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])), 0);
    return Buffer.concat([lenB, typeB, data, crcB]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB

  // สร้าง pixels สีน้ำเงินเข้ม (สี theme sleep)
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter = None
    for (let x = 0; x < width; x++) {
      raw.push(26, 26, 46); // dark blue
    }
  }
  const compressed = await deflate(Buffer.from(raw));

  return Buffer.concat([
    sig,
    mkChunk("IHDR", ihdr),
    mkChunk("IDAT", compressed),
    mkChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function runTest() {
  console.log("=== Biokoop System Test ===\n");

  // ── Test 1: Server ──
  process.stdout.write("🔍 Test 1: Server health... ");
  try {
    const res = await fetch("http://localhost:4040");
    const text = await res.text();
    console.log(`✅ HTTP ${res.status} ("${text}")`);
  } catch (e) {
    console.log(`❌ ${e.message}`);
  }

  // ── Test 2: Gemini AI ──
  console.log("\n🔍 Test 2: Gemini AI วิเคราะห์รูป...");
  try {
    const imgBuf = await buildPNG(200, 200);
    console.log(`   รูปขนาด: ${imgBuf.length} bytes (${(imgBuf.length / 1024).toFixed(1)} KB)`);

    const result = await analyzeImage(imgBuf, "image/png");

    if (result.ok) {
      console.log(`✅ AI ตอบกลับสำเร็จ`);
      console.log(`   detected  : ${result.data.detected}`);
      console.log(`   confidence: ${result.data.confidence}`);
      console.log(`   notes     : ${result.data.notes || "-"}`);
      if (result.data.result) {
        const r = result.data.result;
        console.log(`   score     : ${r.score ?? "-"}`);
        console.log(`   grade     : ${r.grade ?? "-"}`);
        console.log(`   sleepTime : ${r.sleepTime ?? "-"}`);
        console.log(`   aiSummary : ${r.aiSummary ?? "-"}`);
      }

      // ── Test 3: Validation ──
      console.log("\n🔍 Test 3: Business validation...");
      const v = validateAiResult(result.data, 0.7);
      if (v.valid) {
        console.log("✅ ผ่าน (confidence สูงพอ + detected)");
      } else {
        console.log(`⚠️  ${v.problems.join(", ")}`);
        console.log("   (ปกติสำหรับรูปจำลอง — รูปจริงจาก smartwatch จะผ่าน)");
      }
    } else {
      console.log(`⚠️  AI parse error: ${result.error}`);
    }
  } catch (e) {
    console.log(`❌ ${e.message}`);
  }

  // ── Test 4: ngrok ──
  console.log("\n🔍 Test 4: ngrok tunnel...");
  try {
    const url = process.env.PUBLIC_BASE_URL;
    const r = await fetch(url, {
      headers: { "ngrok-skip-browser-warning": "1" },
      signal: AbortSignal.timeout(8000),
    });
    console.log(`✅ ${url} → HTTP ${r.status}`);
  } catch (e) {
    console.log(`❌ ${e.message}`);
  }

  console.log("\n=== Test เสร็จสิ้น ===");
}

runTest().catch(console.error);
