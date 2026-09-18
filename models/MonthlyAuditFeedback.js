import mongoose from "mongoose";

const monthlyAuditFeedbackSchema = new mongoose.Schema(
  {
    scenarioOrUser: { type: String, default: "Unknown" },
    rating: { type: Number, default: 5, min: 1, max: 5 },
    comment: { type: String, default: "" },
    aiScore: { type: Number, default: 0 },
    aiStatus: { type: String, default: "" },
    correctedSummary: { type: String, default: "" },
    reviewedBy: { type: String, default: "admin" },
    monthlyData: { type: mongoose.Schema.Types.Mixed },
    aiResult: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

monthlyAuditFeedbackSchema.index({ createdAt: -1 });

export const MonthlyAuditFeedback = mongoose.model("MonthlyAuditFeedback", monthlyAuditFeedbackSchema);
