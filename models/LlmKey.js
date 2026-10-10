import mongoose from "mongoose";

// LlmKey — Gemini API keys สำหรับ flow สกัดข้อมูลดิบ (rawExtractionService) เท่านั้น
// แยกจาก GEMINI_API_KEY ใน .env ที่ใช้กับ flow วิเคราะห์หลักโดยสิ้นเชิง
// key จริงถูก encrypt ด้วย AES-256-GCM ใน llmKeyService — ไม่มี field เก็บ plaintext
const llmKeySchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    provider: { type: String, enum: ["gemini"], default: "gemini" },
    encKey: { type: String, required: true }, // "iv:tag:ciphertext" (base64)
    keyPreview: { type: String, default: "" }, // "••••abcd" — แสดงผลแค่นี้เสมอ
    isActive: { type: Boolean, default: true, index: true },
    // round-robin: เลือก key ที่ lastUsedAt เก่าสุด (null = ยังไม่เคยใช้ ได้คิวก่อน)
    lastUsedAt: { type: Date, default: null },
    useCount: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
    lastUsedModel: { type: String, default: "" },
    createdBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

llmKeySchema.index({ isActive: 1, lastUsedAt: 1 });

export const LlmKey = mongoose.model("LlmKey", llmKeySchema);
