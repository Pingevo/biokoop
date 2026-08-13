import { AdminUser } from "../models/AdminUser.js";

/**
 * โหลด admin ปัจจุบันจาก session (req.session.adminId) ลงใน req.admin
 * ใช้กับทุก request ในเขต /admin — ถ้าไม่มี session ก็แค่ req.admin = null (ไม่บล็อก)
 */
async function loadAdminUser(req, res, next) {
  if (req.session && req.session.adminId) {
    try {
      const admin = await AdminUser.findById(req.session.adminId);
      if (admin && admin.isActive) {
        req.admin = admin;
        res.locals.currentAdmin = admin;
      } else {
        // admin ถูกลบ/ระงับหลัง login → ทำลาย session ทันที
        delete req.session.adminId;
        req.admin = null;
        res.locals.currentAdmin = null;
      }
    } catch (err) {
      console.error("[adminAuth] loadAdminUser error:", err.message);
      req.admin = null;
    }
  } else {
    req.admin = null;
    res.locals.currentAdmin = null;
  }
  next();
}

function isAjaxRequest(req) {
  return (
    req.xhr ||
    (req.headers.accept && req.headers.accept.includes("application/json")) ||
    req.headers["x-requested-with"] === "XMLHttpRequest"
  );
}

/**
 * Admin Lv.1+ (admin หรือ superadmin) — เข้าถึงได้ทุก endpoint ใน /admin/api
 * ถ้ายังไม่ login: ajax → 401 JSON, browser → redirect ไป /admin/auth
 */
function requireAdmin(req, res, next) {
  if (!req.admin) {
    if (isAjaxRequest(req)) {
      return res
        .status(401)
        .json({ ok: false, error: "กรุณาเข้าสู่ระบบ", redirect: "/admin/auth" });
    }
    return res.redirect("/admin/auth");
  }
  if (req.admin.role !== "admin" && req.admin.role !== "superadmin") {
    if (isAjaxRequest(req)) {
      return res.status(403).json({ ok: false, error: "Forbidden: admin access required" });
    }
    return res.status(403).send("Forbidden: admin access required");
  }
  next();
}

/**
 * Superadmin Lv.2 เท่านั้น — จัดการ admin accounts, audit log พิเศษ, ตั้งค่าระบบ
 */
function requireSuperadmin(req, res, next) {
  if (!req.admin) {
    if (isAjaxRequest(req)) {
      return res
        .status(401)
        .json({ ok: false, error: "กรุณาเข้าสู่ระบบ", redirect: "/admin/auth" });
    }
    return res.redirect("/admin/auth");
  }
  if (req.admin.role !== "superadmin") {
    if (isAjaxRequest(req)) {
      return res.status(403).json({
        ok: false,
        error: "Forbidden: superadmin (Lv.2) access required",
      });
    }
    return res.status(403).send("Forbidden: superadmin (Lv.2) access required");
  }
  next();
}

export { loadAdminUser, requireAdmin, requireSuperadmin, isAjaxRequest };
