import mongoose from "mongoose";

const requestLogSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: "Request",
    },
    lineUserId: { type: String, required: true, index: true },
    step: {
      type: String,
      enum: [
        "webhook_received",
        "image_fetched",
        "quality_check",
        "ai_call",
        "ai_response",
        "validation",
        "image_composed",
        "line_reply",
        "line_push",
        "error",
      ],
      required: true,
    },
    status: { type: String, enum: ["success", "failed"], required: true },
    data: { type: mongoose.Schema.Types.Mixed },
    errorDetail: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

requestLogSchema.index({ createdAt: 1 });

export const RequestLog = mongoose.model("RequestLog", requestLogSchema);

// helper เรียกบันทึก log แบบสั้นๆ จากทุกจุดใน pipeline
export async function logStep({
  requestId,
  lineUserId,
  step,
  status,
  data,
  errorDetail,
}) {
  try {
    await RequestLog.create({
      requestId,
      lineUserId,
      step,
      status,
      data,
      errorDetail,
    });
  } catch (err) {
    // การ log พลาดไม่ควรทำให้ pipeline หลักล้ม แค่ print ไว้เฉยๆ
    console.error("[logStep] บันทึก log ไม่สำเร็จ:", err.message);
  }
}
