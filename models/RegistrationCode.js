import mongoose from "mongoose";

const registrationCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true, trim: true },
    type: {
      type: String,
      enum: ["imei", "order_sn", "order_id", "any"],
      default: "any",
      index: true,
    },
    status: {
      type: String,
      enum: ["available", "used", "disabled"],
      default: "available",
      index: true,
    },
    usedByLineUserId: { type: String, default: "", index: true },
    usedAt: { type: Date },
    note: { type: String, default: "" },
    batch: { type: String, default: "" },
  },
  { timestamps: true }
);

export const RegistrationCode = mongoose.model("RegistrationCode", registrationCodeSchema);
