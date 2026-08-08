import mongoose from "mongoose";

const REQUEST_STATUSES = [
  "received",
  "quality_failed",
  "analyzing",
  "needs_review",
  "composing",
  "sent",
  "failed",
];

const requestSchema = new mongoose.Schema(
  {
    lineUserId: { type: String, required: true, index: true },
    // ข้อมูลอุปกรณ์ / คำสั่งซื้อของคำขอนี้
    imei: { type: String, default: "", index: true },
    orderSn: { type: String, default: "", index: true },
    orderId: { type: String, default: "", index: true },
    verifiedIdentifier: { type: String, default: "", index: true },
    status: {
      type: String,
      enum: REQUEST_STATUSES,
      default: "received",
      index: true,
    },
    originalImageId: { type: mongoose.Schema.Types.ObjectId }, // GridFS file id
    resultImageId: { type: mongoose.Schema.Types.ObjectId }, // GridFS file id
    replyToken: { type: String },
    aiResult: { type: mongoose.Schema.Types.Mixed }, // ผล validate แล้ว (สำหรับ compose)
    errorMessage: { type: String },
    completedAt: { type: Date },
    // การใช้งาน Gemini API สำหรับหน้า Admin ติดตาม token/ยอดเงิน
    aiModel: { type: String },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    // Ground Truth Feedback สำหรับพัฒนา/Fine-Tune AI
    correctedResult: { type: mongoose.Schema.Types.Mixed },
    correctedBy: { type: String },
    correctedAt: { type: Date },
    isDatasetVerified: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const REQUEST_STATUS = Object.freeze(
  Object.fromEntries(REQUEST_STATUSES.map((s) => [s.toUpperCase(), s]))
);

export const Request = mongoose.model("Request", requestSchema);
