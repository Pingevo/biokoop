import mongoose from "mongoose";

/**
 * AdminAuditLog — audit trail ของ action ที่ admin/superadmin ทำในหลังบ้าน
 * (Superadmin Lv.2 ดูได้ผ่าน /admin/api/admin-audit)
 */
const adminAuditLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", index: true },
    adminUsername: { type: String, index: true }, // system81_username ตอนทำ action
    adminRole: { type: String, enum: ["admin", "superadmin"] },
    action: {
      type: String,
      required: true,
      index: true,
      // ตัวอย่าง: approve_send | update_status | correct_ai | send_message |
      //          user_block | user_unblock | config_save | config_reset |
      //          admin_role_change | admin_status_change | admin_delete
    },
    target: { type: String, default: "" }, // ID ของสิ่งที่ถูกกระทำ (requestId, lineUserId, adminId, configName)
    targetModel: { type: String, default: "" }, // Request | User | AdminUser | Config
    details: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

adminAuditLogSchema.index({ createdAt: -1 });

export const AdminAuditLog = mongoose.model("AdminAuditLog", adminAuditLogSchema);

/**
 * helper บันทึก action ของ admin จาก request ปัจจุบัน
 * ใช้ใน route ที่มี req.admin (ผ่าน requireAdmin/requireSuperadmin แล้ว)
 */
export async function logAdminAction(req, action, target = "", targetModel = "", details = {}) {
  try {
    if (!req.admin) return;
    await AdminAuditLog.create({
      adminId: req.admin._id,
      adminUsername: req.admin.system81_username,
      adminRole: req.admin.role,
      action,
      target: target ? String(target) : "",
      targetModel,
      details,
      ip: req.ip || req.socket?.remoteAddress || "",
    });
  } catch (err) {
    // audit log พลาดไม่ควรทำให้ request หลักล้ม
    console.error("[logAdminAction] บันทึก audit log ไม่สำเร็จ:", err.message);
  }
}
