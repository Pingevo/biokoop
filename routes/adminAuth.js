import { Router } from "express";
import axios from "axios";
import { AdminUser } from "../models/AdminUser.js";

const router = Router();

function getBaseUrl() {
  // ใน production ต้องตั้ง PUBLIC_BASE_URL เป็น HTTPS URL จริง — ถ้าไม่ตั้ง SSO จะ redirect กลับผิดที่
  const url = (process.env.PUBLIC_BASE_URL || "").trim();
  if (!url) {
    throw new Error(
      "PUBLIC_BASE_URL ไม่ได้ตั้งใน .env — ต้องตั้งเป็น HTTPS URL จริงของเซิร์ฟเวอร์เพื่อให้ system81 SSO redirect กลับมาได้"
    );
  }
  return url.replace(/\/+$/, "");
}

function getSellcenterBaseUrl() {
  return (process.env.SELLCENTER_OAUTH_BASE_URL || "https://data.digital.in.th").replace(/\/+$/, "");
}

function getCallbackUrl() {
  return `${getBaseUrl()}/admin/auth/callback`;
}

function getAppName() {
  return process.env.ADMIN_APP_NAME || "biokoop Admin";
}

// หน้า error แบบ HTML ที่อ่านง่าย มีปุ่ม "ลองใหม่" กลับไปหน้า login
function renderErrorPage(res, status, title, message) {
  res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — biokoop Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, "Segoe UI", "Kanit", "Sarabun", system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: grid; place-items: center; padding: 20px; }
    .card { background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 16px; padding: 32px; max-width: 460px; width: 100%; text-align: center; backdrop-filter: blur(14px); box-shadow: 0 20px 50px rgba(0,0,0,0.4); }
    .icon { font-size: 44px; margin-bottom: 12px; }
    h1 { font-size: 18px; font-weight: 700; margin-bottom: 10px; color: #f8fafc; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 20px; }
    .btn { display: inline-block; background: #0284c7; color: #fff; text-decoration: none; padding: 10px 22px; border-radius: 10px; font-size: 14px; font-weight: 600; transition: background 0.15s; }
    .btn:hover { background: #0369a1; }
    .status { font-size: 11px; color: #64748b; margin-top: 18px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a class="btn" href="/admin/auth">← ลองเข้าสู่ระบบใหม่</a>
    <div class="status">HTTP ${status}</div>
  </div>
</body>
</html>`);
}

// GET /admin/auth — หน้า login (redirect ไป system81 เลย ถ้า login แล้วก็ไป /admin)
router.get("/", (req, res) => {
  if (req.admin && (req.admin.role === "admin" || req.admin.role === "superadmin")) {
    return res.redirect("/admin/");
  }
  // ไม่มีหน้า login ของตัวเอง — ส่งตรงไป system81 (เหมือน isuper-fit)
  return res.redirect("/admin/auth/redirect");
});

// GET /admin/auth/redirect — ส่ง browser ไปหน้า login ของ system81 (ITSR / sellcenter)
router.get("/redirect", (req, res) => {
  try {
    const params = new URLSearchParams({
      redirect_uri: getCallbackUrl(),
      app_name: getAppName(),
      app_logo: `${getBaseUrl()}/icons/favicon.png`,
    });
    res.redirect(`${getSellcenterBaseUrl()}/system81/login?${params.toString()}`);
  } catch (err) {
    console.error("[adminAuth] redirect error:", err.message);
    return renderErrorPage(res, 500, "ตั้งค่าเซิร์ฟเวอร์ไม่ครบ", err.message);
  }
});

// GET /admin/auth/callback — system81 ส่ง token กลับมาที่นี่
router.get("/callback", async (req, res) => {
  const { token, error } = req.query;

  if (error) {
    return renderErrorPage(
      res,
      401,
      "เข้าสู่ระบบไม่สำเร็จ",
      `ITSR ส่ง error กลับมา: ${error}`
    );
  }
  if (!token) {
    return renderErrorPage(
      res,
      401,
      "เข้าสู่ระบบไม่สำเร็จ",
      "ไม่ได้รับ token จาก ITSR กรุณาลองใหม่อีกครั้ง"
    );
  }

  // เรียก /system81/userinfo เพื่อตรวจ token และดึงข้อมูล user
  let userInfo;
  try {
    const userInfoRes = await axios.get(`${getSellcenterBaseUrl()}/system81/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    userInfo = userInfoRes.data && userInfoRes.data.success ? userInfoRes.data.user : null;
  } catch (err) {
    console.error("[adminAuth] userinfo error:", err.message);
    return renderErrorPage(
      res,
      502,
      "เชื่อมต่อ ITSR ไม่สำเร็จ",
      "ไม่สามารถตรวจสอบ token กับ ITSR ได้ กรุณาลองใหม่อีกครั้ง (อาจเป็นเพราะ token หมดอายุ หรือ ITSR มีปัญหาชั่วคราว)"
    );
  }

  if (!userInfo || !userInfo.username) {
    return renderErrorPage(
      res,
      401,
      "Token ไม่ถูกต้อง",
      "ข้อมูลจาก ITSR ไม่ครบถ้วน กรุณาลองเข้าสู่ระบบใหม่"
    );
  }

  // หา/สร้าง admin — กฎ: คนแรกของระบบ → superadmin, @itsr.co.th → admin, อื่นๆ ปฏิเสธ
  let admin;
  try {
    admin = await AdminUser.findOrProvision(userInfo);
  } catch (err) {
    console.error("[adminAuth] provision error:", err.message);
    return renderErrorPage(
      res,
      500,
      "เกิดข้อผิดพลาด",
      "ไม่สามารถเตรียมบัญชีแอดมินได้ กรุณาลองใหม่ หรือติดต่อผู้ดูแลระบบ"
    );
  }

  if (!admin) {
    return renderErrorPage(
      res,
      403,
      "ยังไม่มีสิทธิ์เข้าใช้งาน",
      `บัญชี ITSR <b>${userInfo.username}</b> ยังไม่มีสิทธิ์เข้าถึงระบบแอดมิน<br>กรุณาติดต่อ superadmin เพื่อขออนุมัติ`
    );
  }

  // บันทึกเวลา login ล่าสุด + set session
  admin.lastLoginAt = new Date();
  await admin.save();
  req.session.adminId = admin._id.toString();

  return res.redirect("/admin/");
});

// GET /admin/auth/logout — ทำลาย session แล้วกลับไปหน้า login
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("biokoop_admin_sid");
    return res.redirect("/admin/auth");
  });
});

export default router;
