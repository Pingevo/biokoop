import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { User } from "../models/User.js";
import { pushText } from "../services/lineService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// GET /register - เสิร์ฟหน้าเว็บฟอร์มลงทะเบียน
router.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/register.html"));
});

// GET /api/register/user-info - ดึงข้อมูลผู้ใช้เบื้องต้นสำหรับแสดงบนหน้าฟอร์ม
router.get("/api/register/user-info", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ ok: false, error: "Missing userId" });
    }

    const user = await User.findOne({ lineUserId: userId }).lean();
    if (!user) {
      return res.json({
        ok: true,
        user: { lineUserId: userId, displayName: "ผู้ใช้ LINE", isRegistered: false },
      });
    }

    res.json({
      ok: true,
      user: {
        lineUserId: user.lineUserId,
        displayName: user.displayName,
        pictureUrl: user.pictureUrl,
        isRegistered: user.isRegistered,
        nickname: user.nickname,
        phone: user.phone,
        birthdate: user.birthdate ? user.birthdate.toISOString().split("T")[0] : "",
        firstName: user.firstName,
        lastName: user.lastName,
        gender: user.gender,
        province: user.province,
        pdpaConsent: user.pdpaConsent,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/register - บันทึกข้อมูลการลงทะเบียน
router.post("/api/register", async (req, res) => {
  try {
    const {
      lineUserId,
      nickname,
      birthdate,
      phone,
      firstName,
      lastName,
      gender,
      province,
      pdpaConsent,
    } = req.body || {};

    // 1. ตรวจสอบฟิลด์ที่จำเป็น (Required fields)
    if (!lineUserId || !lineUserId.trim()) {
      return res.status(400).json({ ok: false, error: "ไม่พบรหัสผู้ใช้ LINE (lineUserId)" });
    }
    if (!nickname || !nickname.trim()) {
      return res.status(400).json({ ok: false, error: "กรุณาระบุชื่อเล่น" });
    }
    if (!birthdate || isNaN(new Date(birthdate).getTime())) {
      return res.status(400).json({ ok: false, error: "กรุณาระบุวันเกิดที่ถูกต้อง" });
    }

    // ตรวจสอบเบอร์โทรศัพท์ (อย่างน้อย 9-10 หลัก)
    const cleanPhone = (phone || "").replace(/[^0-9]/g, "");
    if (!cleanPhone || cleanPhone.length < 9 || cleanPhone.length > 10) {
      return res.status(400).json({ ok: false, error: "กรุณาระบุเบอร์โทรศัพท์ 9-10 หลักให้ถูกต้อง" });
    }

    // ต้องยินยอม PDPA ก่อนจึงจะลงทะเบียนและใช้งานระบบได้ (ข้อมูลสุขภาพที่วิเคราะห์เป็นข้อมูลอ่อนไหวตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล)
    if (pdpaConsent !== true) {
      return res.status(400).json({ ok: false, error: "กรุณายินยอมให้เก็บรวบรวม ใช้ และประมวลผลข้อมูลส่วนบุคคล (PDPA) ก่อนลงทะเบียน" });
    }

    // 2. เช็คว่าเคยลงทะเบียนมาก่อนหรือไม่ (เพื่อแยก flow ลงทะเบียนครั้งแรก vs แก้ไขข้อมูล)
    const existingUser = await User.findOne({ lineUserId }).lean();
    const wasAlreadyRegistered = !!existingUser?.isRegistered;

    // 3. อัปเดตข้อมูลการลงทะเบียนลงใน MongoDB
    const updateData = {
      isRegistered: true,
      nickname: nickname.trim(),
      birthdate: new Date(birthdate),
      phone: cleanPhone,
      firstName: (firstName || "").trim(),
      lastName: (lastName || "").trim(),
      gender: ["male", "female", "other", "unspecified"].includes(gender) ? gender : "unspecified",
      province: (province || "").trim(),
      pdpaConsent: true,
      pdpaConsentAt: new Date(),
    };
    // เก็บ registeredAt ไว้เป็นวันที่ลงทะเบียนครั้งแรกเท่านั้น ไม่ให้ถูกเขียนทับตอนแก้ไขข้อมูล
    if (!wasAlreadyRegistered) {
      updateData.registeredAt = new Date();
    }

    const user = await User.findOneAndUpdate(
      { lineUserId },
      { $set: updateData },
      { upsert: true, new: true }
    );

    // 4. ส่งข้อความยืนยันความสำเร็จกลับไปยังผู้ใช้ผ่าน LINE Push API (ข้อความต่างกันระหว่างลงทะเบียนครั้งแรก vs แก้ไขข้อมูล)
    const notifyText = wasAlreadyRegistered
      ? `✅ แก้ไขข้อมูลเรียบร้อยแล้วค่ะ!\nอัปเดตข้อมูลของคุณ "${user.nickname}" เรียบร้อยแล้วนะคะ`
      : `🎉 ลงทะเบียนเรียบร้อยแล้วค่ะ!\nขอบคุณคุณ "${user.nickname}" สำหรับข้อมูลนะคะ\n\n🖼️ คุณสามารถแตะปุ่ม "เลือกภาพเพื่อวิเคราะห์" ในเมนูด้านล่าง เพื่อเลือกรูปภาพจากแกลเลอรีให้ AI เริ่มวิเคราะห์ผลได้ทันทีเลยค่ะ 🌿`;
    pushText(lineUserId, notifyText).catch((err) => {
      console.warn("[register] pushText notification failed:", err.message);
    });

    res.json({
      ok: true,
      message: wasAlreadyRegistered ? "แก้ไขข้อมูลเรียบร้อยแล้ว" : "ลงทะเบียนเรียบร้อยแล้ว",
      wasAlreadyRegistered,
      user,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
