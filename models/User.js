import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    lineUserId: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, default: "" },
    pictureUrl: { type: String, default: "" },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    totalRequests: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "blocked"], default: "active" },
    // ข้อมูลการลงทะเบียน
    isRegistered: { type: Boolean, default: false, index: true },
    registeredAt: { type: Date },
    nickname: { type: String, default: "" },
    birthdate: { type: Date },
    phone: { type: String, default: "" },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    gender: {
      type: String,
      enum: ["male", "female", "other", "unspecified"],
      default: "unspecified",
    },
    province: { type: String, default: "" },
    // การยินยอมตาม PDPA (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล) — เก็บหลักฐานเวลาที่กดยินยอมไว้ด้วยเพื่อการตรวจสอบย้อนหลัง
    pdpaConsent: { type: Boolean, default: false },
    pdpaConsentAt: { type: Date },
  },
  { timestamps: true }
);

// หา user เดิม หรือสร้างใหม่ถ้ายังไม่มี พร้อมอัพเดต lastSeenAt/totalRequests
userSchema.statics.touch = async function (lineUserId, profile = {}) {
  const update = {
    $set: { lastSeenAt: new Date() },
    $setOnInsert: { firstSeenAt: new Date() },
    $inc: { totalRequests: 1 },
  };
  if (profile.displayName) update.$set.displayName = profile.displayName;
  if (profile.pictureUrl) update.$set.pictureUrl = profile.pictureUrl;

  return this.findOneAndUpdate({ lineUserId }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
};

export const User = mongoose.model("User", userSchema);
