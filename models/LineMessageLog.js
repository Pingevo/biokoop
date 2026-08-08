import mongoose from "mongoose";

const lineMessageLogSchema = new mongoose.Schema(
  {
    lineUserId: { type: String, required: true, index: true },
    sendType: {
      type: String,
      enum: ["reply", "push", "incoming"],
      required: true,
      index: true,
    },
    messageType: {
      type: String,
      enum: ["text", "image", "flex", "flex_image_share", "sticker", "file", "follow", "other"],
      required: true,
      index: true,
    },
    content: { type: String, default: "" },
    status: {
      type: String,
      enum: ["success", "failed"],
      default: "success",
      index: true,
    },
    errorDetail: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

lineMessageLogSchema.index({ createdAt: -1 });

export const LineMessageLog = mongoose.model("LineMessageLog", lineMessageLogSchema);

// Helper สำหรับบันทึก log การส่งข้อความ LINE แบบไม่ขัดขวาง flow หลัก
export async function logLineMessage({
  lineUserId,
  sendType,
  messageType,
  content = "",
  status = "success",
  errorDetail = "",
}) {
  if (!lineUserId) return;
  try {
    await LineMessageLog.create({
      lineUserId,
      sendType,
      messageType,
      content,
      status,
      errorDetail,
    });
  } catch (err) {
    console.error("[logLineMessage] บันทึก log ไม่สำเร็จ:", err.message);
  }
}
