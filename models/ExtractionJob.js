import mongoose from "mongoose";

// Job คิวสกัด raw extraction — durable ทน server restart
// สร้างตอน request ครบ 3 รูป → worker รัน → restart กลางทางกลับมา pending ตอนบูต
const extractionJobSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      required: true,
      unique: true,
      index: true,
    },
    lineUserId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "running", "done", "failed"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
    notBefore: { type: Date, default: null }, // retry หลังเวลานี้ (กัน rate-limit ยิงถี่)
  },
  { timestamps: true }
);

extractionJobSchema.index({ status: 1, notBefore: 1 });

export const ExtractionJob = mongoose.model("ExtractionJob", extractionJobSchema);
