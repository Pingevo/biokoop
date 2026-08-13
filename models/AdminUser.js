import mongoose from "mongoose";

/**
 * AdminUser — บัญชีแอดมินหลังบ้านที่ login ผ่าน system81 SSO (ITSR / sellcenter).
 * แยกจาก User (LINE users) เพื่อไม่ให้สิทธิ์หลังบ้านปนกับผู้ใช้ LINE ฝั่งหน้าบ้าน.
 *
 * role:
 *   - "admin"      : Admin Lv.1 — ดู/จัดการข้อมูลทั่วไป (requests, users, line-messages)
 *   - "superadmin" : Superadmin Lv.2 — ทุกอย่างที่ admin ทำได้ + จัดการ admin accounts + audit log + ตั้งค่าระบบ
 */
const adminUserSchema = new mongoose.Schema(
  {
    system81_username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    email: { type: String, lowercase: true, trim: true, default: "" },
    name: { type: String, default: "" },
    role: {
      type: String,
      enum: ["admin", "superadmin"],
      default: "admin",
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date },
    provisionedBy: { type: String, default: "auto" }, // "auto" หรือ system81_username ของ superadmin ที่อนุมัติ
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true }
);

// หาหรือสร้าง admin จากข้อมูล system81 userinfo
// กฎ: @itsr.co.th คนแรกของระบบ → superadmin; คนถัดไป → admin (รอ superadmin เลื่อนขั้นถ้าต้องการ)
adminUserSchema.statics.findOrProvision = async function (userInfo) {
  const username = userInfo.username;
  if (!username) return null;

  let admin = await this.findOne({ system81_username: username });
  if (admin) {
    if (!admin.isActive) return null; // โดน superadmin ระงับไว้
    return admin;
  }

  const email = (userInfo.email || username).toString().toLowerCase();
  const totalAdmins = await this.countDocuments({});
  const isFirstAdmin = totalAdmins === 0;
  const autoProvisionDomain = (process.env.AUTO_PROVISION_DOMAIN || "@itsr.co.th")
    .toString()
    .toLowerCase();

  // คนแรกของระบบเป็น superadmin เสมอ (bootstrap); คนถัดไปต้องอยู่ใน auto-provision domain ถึงจะสร้างเป็น admin ได้
  if (!isFirstAdmin && !email.endsWith(autoProvisionDomain)) {
    return null;
  }

  try {
    admin = await this.create({
      system81_username: username,
      email,
      name: userInfo.name || username,
      role: isFirstAdmin ? "superadmin" : "admin",
      isActive: true,
      provisionedBy: "auto",
    });
    return admin;
  } catch (err) {
    // race condition: ถ้ามี 2 request login พร้อมกัน → duplicate key error (unique index)
    // fallback: ดึง record ที่ถูกสร้างโดย request อื่นมาใช้
    if (err.code === 11000 || err.name === "MongoServerError") {
      admin = await this.findOne({ system81_username: username });
      if (admin && admin.isActive) return admin;
    }
    throw err;
  }
};

export const AdminUser = mongoose.model("AdminUser", adminUserSchema);
