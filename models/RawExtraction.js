import mongoose from "mongoose";

// RawExtraction — ผลสกัดข้อมูลดิบทั้งหมดจากภาพ Kieslect 3 รูป (fire-and-forget flow)
// แยกจาก Request.aiResult โดยสิ้นเชิง — flow หลักไม่เคยอ่าน/ใช้ collection นี้
const rawExtractionSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "Request", index: true },
    lineUserId: { type: String, index: true },
    // ช่วงวันที่ "ของข้อมูล" (ไม่ใช่วันที่สกัด) — resolve จาก request.createdAt + rawResult.days
    // ใช้ตอบคำถาม chatbot ว่า record นี้ครอบคลุมวันไหนบ้าง (รองรับช่วงซ้อนทับจากลูกค้าส่งถี่)
    weekOf: { type: Date, default: null, index: true },
    dataFrom: { type: Date, default: null },
    dataTo: { type: Date, default: null },
    model: { type: String, default: "" },
    keyId: { type: mongoose.Schema.Types.ObjectId, ref: "LlmKey" },
    keyLabel: { type: String, default: "" },
    imageCount: { type: Number, default: 0 },
    status: { type: String, enum: ["success", "failed"], default: "failed", index: true },
    rawResult: { type: mongoose.Schema.Types.Mixed }, // JSON เต็มที่ AI สกัดมา
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    errorMessage: { type: String, default: "" },
  },
  { timestamps: true }
);

rawExtractionSchema.index({ createdAt: -1 });
rawExtractionSchema.index({ lineUserId: 1, createdAt: -1 });
rawExtractionSchema.index({ lineUserId: 1, dataTo: -1 });

export const RawExtraction = mongoose.model("RawExtraction", rawExtractionSchema);
