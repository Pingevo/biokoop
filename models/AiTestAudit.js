import mongoose from "mongoose";

const flaggedFieldSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    fieldLabel: { type: String, default: "" },
    page: { type: String, default: "" },
    readValue: { type: mongoose.Schema.Types.Mixed },
    correctedValue: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String, default: "" },
  },
  { _id: false }
);

const autoAnomalySchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    page: { type: String, default: "" },
    label: { type: String, default: "" },
    severity: { type: String, enum: ["warning", "error", "info"], default: "warning" },
    readValue: { type: mongoose.Schema.Types.Mixed },
    issue: { type: String, default: "" },
    suggestion: { type: String, default: "" },
  },
  { _id: false }
);

const aiTestAuditSchema = new mongoose.Schema(
  {
    testType: { type: String, enum: ["weekly", "daily"], default: "weekly", index: true },
    modelName: { type: String, default: "" },
    confidence: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    imageCount: { type: Number, default: 1 },
    detected: { type: Boolean, default: true },
    foundPages: [{ type: String }],
    qualityStatus: {
      type: String,
      enum: ["passed", "warning", "error"],
      default: "passed",
      index: true,
    },
    autoAnomalies: [autoAnomalySchema],
    adminFeedback: {
      rating: { type: Number, default: 5, min: 1, max: 5 },
      accuracyStatus: {
        type: String,
        enum: ["accurate", "minor_errors", "major_errors", "unusable"],
        default: "accurate",
        index: true,
      },
      flaggedFields: [flaggedFieldSchema],
      notes: { type: String, default: "" },
      adminUser: { type: String, default: "Admin" },
    },
    extractedSnapshot: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

aiTestAuditSchema.index({ createdAt: -1 });

export const AiTestAudit = mongoose.model("AiTestAudit", aiTestAuditSchema);
