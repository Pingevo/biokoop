import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { User } from "../models/User.js";
import { RegistrationCode } from "../models/RegistrationCode.js";
import { pushText } from "../services/lineService.js";
import {
  getRegistrationConfig,
  validateIdentifierFormat,
} from "../services/registrationConfigService.js";
import { lookupInDbWallet } from "../services/dbWalletService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// GET /register - เสิร์ฟหน้าเว็บฟอร์มลงทะเบียน
router.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/register.html"));
});

// GET /api/register/config - ดึงคอนฟิกโหมดการลงทะเบียนสำหรับปรับแต่ง UI บนฟอร์ม
router.get("/api/register/config", (req, res) => {
  try {
    const config = getRegistrationConfig();
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/register/user-info - ดึงข้อมูลผู้ใช้เบื้องต้นสำหรับแสดงบนหน้าฟอร์ม
router.get("/api/register/user-info", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ ok: false, error: "Missing userId" });
    }

    const config = getRegistrationConfig();
    const user = await User.findOne({ lineUserId: userId }).lean();

    if (!user) {
      return res.json({
        ok: true,
        config,
        user: { lineUserId: userId, displayName: "ผู้ใช้ LINE", isRegistered: false },
      });
    }

    res.json({
      ok: true,
      config,
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
        imei: user.imei || "",
        orderSn: user.orderSn || "",
        orderId: user.orderId || "",
        verifiedIdentifier: user.verifiedIdentifier || "",
        verifiedIdentifierType: user.verifiedIdentifierType || "",
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
      identifierType, // "imei" | "order_sn" | "order_id"
      identifierValue, // ค่ารหัสที่ระบุ (กรณีโหมดปกติ/เลือกระบุ)
      imeiValue, // ค่า IMEI (กรณีโหมด both_imei_and_order)
      orderValue, // ค่า Order ID/SN (กรณีโหมด both_imei_and_order)
    } = req.body || {};

    const regConfig = getRegistrationConfig();

    // 1. ตรวจสอบฟิลด์พื้นฐานที่จำเป็น (Required fields)
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

    // ตรวจสอบความยินยอมตาม PDPA
    if (pdpaConsent !== true) {
      return res.status(400).json({ ok: false, error: "กรุณายินยอมให้เก็บรวบรวม ใช้ และประมวลผลข้อมูลส่วนบุคคล (PDPA) ก่อนลงทะเบียน" });
    }

    // Helper สำหรับตรวจสอบรหัส 1 ตัว (Validate / Whitelist / DbWallet / Duplicate)
    async function validateSingleCode(codeVal, typeKey, labelName) {
      if (!codeVal || !codeVal.trim()) {
        if (regConfig.isRequired) {
          return { ok: false, error: `กรุณาระบุ ${labelName}` };
        }
        return { ok: true, code: "", walletCheck: null };
      }

      const cleanCode = codeVal.trim();
      const formatCheck = validateIdentifierFormat(typeKey, cleanCode);
      if (!formatCheck.valid) {
        return { ok: false, error: formatCheck.message };
      }

      let walletMatch = null;
      let isVerifiedByWallet = false;
      let isVerifiedByWhitelist = false;

      // 1. ตรวจสอบกับ dbWallet (10 คอลเลกชัน) หากเปิดโหมด verifyWithDbWallet
      if (regConfig.verifyWithDbWallet) {
        const walletCheck = await lookupInDbWallet(cleanCode, typeKey);
        if (walletCheck.found) {
          walletMatch = walletCheck;
          isVerifiedByWallet = true;
        }
      }

      // 2. ตรวจสอบกับ Whitelist Database หากเปิดโหมด whitelistOnly
      if (regConfig.whitelistOnly) {
        const whitelistItem = await RegistrationCode.findOne({
          code: cleanCode,
          status: { $ne: "disabled" },
        });

        if (whitelistItem) {
          isVerifiedByWhitelist = true;
          if (
            regConfig.preventDuplicate &&
            whitelistItem.status === "used" &&
            whitelistItem.usedByLineUserId !== lineUserId
          ) {
            return {
              ok: false,
              error: `${labelName} "${cleanCode}" นี้ถูกใช้ลงทะเบียนไปแล้ว`,
            };
          }
        }
      }

      // 3. ตรวจสอบเงื่อนไขการผ่านการยืนยันตัวตน
      if (regConfig.verifyWithDbWallet && regConfig.whitelistOnly) {
        // หากเปิดทั้ง 2 โหมด -> ผ่านหากพบใน dbWallet หรือ Whitelist อย่างน้อย 1 แห่ง
        if (!isVerifiedByWallet && !isVerifiedByWhitelist) {
          return {
            ok: false,
            error: `${labelName} "${cleanCode}" ไม่ถูกต้อง หรือไม่พบในระบบฐานข้อมูล dbWallet / Whitelist`,
          };
        }
      } else if (regConfig.verifyWithDbWallet && !isVerifiedByWallet) {
        // เปิดเฉพาะ dbWallet -> ต้องพบใน dbWallet
        return {
          ok: false,
          error: `${labelName} "${cleanCode}" ไม่ถูกต้อง หรือไม่พบในระบบ dbWallet ของบริษัท`,
        };
      } else if (regConfig.whitelistOnly && !isVerifiedByWhitelist) {
        // เปิดเฉพาะ Whitelist -> ต้องพบใน Whitelist
        return {
          ok: false,
          error: `${labelName} "${cleanCode}" ไม่ถูกต้อง หรือไม่มีอยู่ในระบบ Whitelist`,
        };
      }

      // ตรวจสอบการใช้ซ้ำใน User collection หากเปิด preventDuplicate
      if (regConfig.preventDuplicate) {
        const dupUser = await User.findOne({
          $or: [{ verifiedIdentifier: cleanCode }, { imei: cleanCode }, { orderSn: cleanCode }, { orderId: cleanCode }],
          lineUserId: { $ne: lineUserId },
        }).lean();

        if (dupUser) {
          return {
            ok: false,
            error: `${labelName} "${cleanCode}" นี้ถูกใช้งานโดยผู้ใส่อื่นแล้ว`,
          };
        }
      }

      return { ok: true, code: cleanCode, walletMatch };
    }

    // 2. ตรวจสอบข้อมูลรหัสยืนยันตาม Config
    let finalImei = "";
    let finalOrder = "";
    let walletMatches = [];
    let targetType = identifierType || "imei";
    let targetCode = (identifierValue || "").trim();

    if (regConfig.mode === "both_imei_and_order") {
      // โหมดบังคับระบุทั้งเลข IMEI และ Order พร้อมกัน
      const imeiInput = (imeiValue || identifierValue || "").trim();
      const orderInput = (orderValue || "").trim();

      const imeiCheck = await validateSingleCode(imeiInput, "imei", "เลข IMEI อุปกรณ์");
      if (!imeiCheck.ok) return res.status(400).json({ ok: false, error: imeiCheck.error });
      finalImei = imeiCheck.code;
      if (imeiCheck.walletMatch) walletMatches.push(imeiCheck.walletMatch);

      const orderCheck = await validateSingleCode(orderInput, "any", "เลข Order ID / Order SN");
      if (!orderCheck.ok) return res.status(400).json({ ok: false, error: orderCheck.error });
      finalOrder = orderCheck.code;
      if (orderCheck.walletMatch) walletMatches.push(orderCheck.walletMatch);
    } else if (regConfig.mode !== "none") {
      // โหมดระบุอย่างใดอย่างหนึ่ง หรือระบุเฉพาะประเภทที่กำหนด
      if (regConfig.mode !== "any") {
        targetType = regConfig.mode;
      }
      const typeLabels = {
        imei: "เลข IMEI อุปกรณ์",
        order_sn: "เลข Order SN",
        order_id: "เลข Order ID",
      };
      const label = typeLabels[targetType] || "รหัสยืนยัน";

      const check = await validateSingleCode(targetCode, targetType, label);
      if (!check.ok) return res.status(400).json({ ok: false, error: check.error });

      if (check.walletMatch) walletMatches.push(check.walletMatch);

      if (targetType === "imei") finalImei = check.code;
      else finalOrder = check.code;
    }

    // 3. เช็คว่าเคยลงทะเบียนมาก่อนหรือไม่
    const existingUser = await User.findOne({ lineUserId }).lean();
    const wasAlreadyRegistered = !!existingUser?.isRegistered;

    // 4. เตรียมข้อมูลอัปเดต MongoDB User
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

    if (finalImei) updateData.imei = finalImei;
    if (finalOrder) updateData.orderId = finalOrder;

    if (walletMatches.length > 0) {
      updateData.verifiedIdentifierSource = walletMatches.map(m => `dbWallet > ${m.collection} (${m.channel})`).join(" | ");
      updateData.dbWalletDetail = walletMatches.length === 1 ? walletMatches[0] : walletMatches;
    } else if (regConfig.whitelistOnly) {
      updateData.verifiedIdentifierSource = "Whitelist Database";
    }


    if (regConfig.mode === "both_imei_and_order") {
      updateData.verifiedIdentifier = `${finalImei} / ${finalOrder}`;
      updateData.verifiedIdentifierType = "both_imei_and_order";
      updateData.verifiedAt = new Date();
    } else if (finalImei || finalOrder) {
      updateData.verifiedIdentifier = finalImei || finalOrder;
      updateData.verifiedIdentifierType = targetType;
      updateData.verifiedAt = new Date();
    }

    if (!wasAlreadyRegistered) {
      updateData.registeredAt = new Date();
    }

    const user = await User.findOneAndUpdate(
      { lineUserId },
      { $set: updateData },
      { upsert: true, new: true }
    );

    // อัปเดตสถิติใน Whitelist collection
    if (targetCode) {
      await RegistrationCode.findOneAndUpdate(
        { code: targetCode },
        {
          $set: {
            status: "used",
            usedByLineUserId: lineUserId,
            usedAt: new Date(),
            type: targetType,
          },
        },
        { upsert: false }
      ).catch(() => {});
    }

    // 5. ส่งข้อความยืนยันความสำเร็จผ่าน LINE Push API
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
