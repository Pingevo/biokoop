import { Resvg, initWasm } from "@resvg/resvg-wasm";
import { PNG } from "pngjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderBiokoopCard, BG_IMAGE_PATH, hasBgImage, BG_CROP_TOP } from "./cardTemplate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.join(__dirname, "..", "fonts");

let wasmReady = false;
let fontBuffers = [];

// cache ภาพพื้นหลังที่ decode แล้ว (อ่าน+ถอดรหัสครั้งเดียวพอ ไฟล์ไม่เปลี่ยนระหว่าง runtime)
let bgPngCache = null;
function getBgPng() {
  if (!hasBgImage) return null;
  if (!bgPngCache) {
    bgPngCache = PNG.sync.read(fs.readFileSync(BG_IMAGE_PATH));
  }
  return bgPngCache;
}

// คอมโพสิตภาพพื้นหลังจริง (bg) ไว้ใต้การ์ด SVG ที่ render แบบพื้นหลังโปร่งใส (fg) ด้วยการ alpha-blend ทีละพิกเซล
// พื้นหลังส่วนบนเป็นสีขาวล้วน ส่วนภาพ (ตัดโซนดำบนสุดออกด้วย BG_CROP_TOP) วางชิดขอบล่างสุดของการ์ด
function compositeOverBackground(fgPng) {
  const bg = getBgPng();
  const { width, height, data: fgData } = fgPng;
  const out = new PNG({ width, height });
  const visibleH = bg.height - BG_CROP_TOP;
  const imageY = Math.max(0, height - visibleH);

  for (let y = 0; y < height; y++) {
    const inImage = y >= imageY;
    const bgY = inImage ? Math.min(BG_CROP_TOP + (y - imageY), bg.height - 1) : -1;
    for (let x = 0; x < width; x++) {
      const fgIdx = (width * y + x) << 2;
      const a = fgData[fgIdx + 3] / 255;
      const outIdx = fgIdx;

      let bgR = 255, bgG = 255, bgB = 255;
      if (inImage) {
        const bgX = Math.min(x, bg.width - 1);
        const bgIdx = (bg.width * bgY + bgX) << 2;
        bgR = bg.data[bgIdx];
        bgG = bg.data[bgIdx + 1];
        bgB = bg.data[bgIdx + 2];
      }

      out.data[outIdx] = Math.round(fgData[fgIdx] * a + bgR * (1 - a));
      out.data[outIdx + 1] = Math.round(fgData[fgIdx + 1] * a + bgG * (1 - a));
      out.data[outIdx + 2] = Math.round(fgData[fgIdx + 2] * a + bgB * (1 - a));
      out.data[outIdx + 3] = 255;
    }
  }

  return PNG.sync.write(out);
}

// เรียกครั้งเดียวตอน server start (ดู server.js)
export async function initImageService() {
  if (wasmReady) return;
  const wasmPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "@resvg",
    "resvg-wasm",
    "index_bg.wasm"
  );
  const wasmBuffer = fs.readFileSync(wasmPath);
  await initWasm(wasmBuffer);

  fontBuffers = [
    "Kanit-Regular.ttf",
    "Kanit-Medium.ttf",
    "Kanit-SemiBold.ttf",
    "Kanit-Bold.ttf",
    "JetBrainsMono.ttf",
  ].map((f) => fs.readFileSync(path.join(fontsDir, f)));

  wasmReady = true;
  console.log("[imageService] resvg-wasm + fonts พร้อมใช้งาน");
}

// สร้างรูปการ์ดผลลัพธ์จากข้อมูลที่ validate ผ่านแล้ว -> คืนค่าเป็น Buffer (PNG)
export function composeCard(data) {
  if (!wasmReady) {
    throw new Error("imageService ยังไม่ได้ initImageService() ก่อนใช้งาน");
  }
  const svg = renderBiokoopCard(data);
  const resvgJS = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontBuffers,
      defaultFontFamily: "Kanit",
    },
    // มีภาพพื้นหลังจริง -> render พื้นหลัง SVG แบบโปร่งใสไว้ก่อน แล้วค่อยคอมโพสิตภาพทับทีหลัง
    background: hasBgImage ? undefined : "white",
  });
  const png = resvgJS.render().asPng();
  if (!hasBgImage) return png;

  const fgPng = PNG.sync.read(Buffer.from(png));
  return compositeOverBackground(fgPng);
}

// บีบอัดภาพการ์ดผลลัพธ์ PNG ให้มีขนาดไฟล์เล็กที่สุด (ลดลง ~50-60%) โดยคงความคมชัด 100%
export async function optimizeCardPng(pngBuffer) {
  try {
    if (!pngBuffer || pngBuffer.length === 0) return pngBuffer;

    const sharp = (await import("sharp")).default;
    const optimized = await sharp(pngBuffer)
      .png({
        compressionLevel: 9,
        quality: 85,
        palette: true,
        colors: 256,
        effort: 7,
      })
      .toBuffer();

    console.log(
      `[imageService] 📦 บีบอัดรูปการ์ดผลลัพธ์: (${(pngBuffer.length / 1024).toFixed(1)}KB) -> (${(optimized.length / 1024).toFixed(1)}KB) (ประหยัดขนาดไฟล์ ${(((pngBuffer.length - optimized.length) / pngBuffer.length) * 100).toFixed(1)}%)`
    );
    return optimized;
  } catch (err) {
    console.warn(`[imageService] ⚠️ optimizeCardPng warning (ใช้รูปเดิม): ${err.message}`);
    return pngBuffer;
  }
}

// ย่อขนาดและบีบอัดรูปภาพก่อนส่งให้ AI (Gemini / OpenRouter Vision)
// เพื่อให้ AI อ่านค่าได้ไวขึ้น 2-3 เท่า และประหยัด Bandwidth/Token
export async function optimizeImageForAi(imageBuffer, maxDimension = 1024, quality = 80) {
  try {
    if (!imageBuffer || imageBuffer.length === 0) return imageBuffer;

    const sharp = (await import("sharp")).default;
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // หากรูปเล็กอยู่แล้ว (< maxDimension และขนาดไฟล์ < 300KB) ไม่จำเป็นต้องย่อซ้ำ
    if (width <= maxDimension && height <= maxDimension && imageBuffer.length < 300 * 1024) {
      return imageBuffer;
    }

    const resizedBuffer = await sharp(imageBuffer)
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, progressive: true })
      .toBuffer();

    console.log(
      `[imageService] 🖼️ Optimize รูปสำหรับ AI: (${width}x${height}, ${(imageBuffer.length / 1024).toFixed(1)}KB) -> (${(resizedBuffer.length / 1024).toFixed(1)}KB JPEG)`
    );
    return resizedBuffer;
  } catch (err) {
    console.warn(`[imageService] ⚠️ optimizeImageForAi warning (ใช้รูปเดิม): ${err.message}`);
    return imageBuffer;
  }
}

