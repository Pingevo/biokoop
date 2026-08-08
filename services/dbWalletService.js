// dbWalletService.js
// บริการค้นหาและตรวจสอบเลข IMEI, Order SN และ Order ID จากฐานข้อมูล dbWallet (9 คอลเลกชัน)

import { getWalletDbConnection } from "../config/db.js";

/**
 * ค้นหาข้อมูลรหัสใน dbWallet ข้าม 9 คอลเลกชัน
 * @param {string} code - รหัสที่ผู้ใช้ระบุ (IMEI / Order SN / Order ID)
 * @param {string} type - โหมดการค้นหา ("imei" | "order_sn" | "order_id" | "any")
 * @returns {Promise<{ found: boolean, matchedType?: string, channel?: string, collection?: string, data?: object, message?: string }>}
 */
export async function lookupInDbWallet(code, type = "any") {
  if (!code || typeof code !== "string" && typeof code !== "number" || !String(code).trim()) {
    return { found: false, message: "กรุณาระบุรหัสที่ต้องการค้นหา" };
  }

  const cleanCode = String(code).trim();
  const normalizedCode = cleanCode.replace(/\.0+$/, "");
  const numVal = Number(normalizedCode);

  const candidates = [cleanCode, normalizedCode];
  if (!isNaN(numVal) && normalizedCode.length > 0) {
    candidates.push(numVal);
  }

  const walletDb = getWalletDbConnection();

  if (!walletDb) {
    console.warn("[dbWalletService] ไม่พบการเชื่อมต่อฐานข้อมูล dbWallet");
    return { found: false, message: "ไม่สามารถเชื่อมต่อฐานข้อมูล dbWallet ได้" };
  }

  try {
    // 1. กลุ่มค้นหาเลข IMEI (5 คอลเลกชัน)
    if (type === "imei" || type === "any") {
      const imeiTables = [
        { name: "OpenShopeeImeis", channel: "Shopee", label: "Shopee IMEI" },
        { name: "OpenLazadaImeis", channel: "Lazada", label: "Lazada IMEI" },
        { name: "CenterImeis", channel: "Center", label: "Center IMEI" },
        { name: "StockPickupQueue", channel: "Stock Pickup", label: "คิวเบิกสินค้า" },
        { name: "TiktokImeis", channel: "TikTok Shop", label: "TikTok IMEI" },
      ];

      for (const t of imeiTables) {
        const item = await walletDb.collection(t.name).findOne({ imei: { $in: candidates } });
        if (item) {
          return {
            found: true,
            matchedType: "imei",
            channel: t.channel,
            collection: t.name,
            label: t.label,
            matchedField: "imei",
            data: item,
          };
        }
      }
    }

    // 2. กลุ่มค้นหาเลข Order SN (1 คอลเลกชัน)
    if (type === "order_sn" || type === "any") {
      const item = await walletDb.collection("ShpOrders").findOne({ order_sn: { $in: candidates } });
      if (item) {
        return {
          found: true,
          matchedType: "order_sn",
          channel: "Shopee",
          collection: "ShpOrders",
          label: "Shopee Order SN",
          matchedField: "order_sn",
          data: item,
        };
      }
    }

    // 3. กลุ่มค้นหาเลข Order ID (4 คอลเลกชัน)
    if (type === "order_id" || type === "any") {
      // Lazada: ค้นหาทั้ง order_id และ order_item_id
      const itemLazada = await walletDb.collection("OpenLazadaOrderItems").findOne({
        $or: [
          { order_id: { $in: candidates } },
          { order_item_id: { $in: candidates } }
        ]
      });

      if (itemLazada) {
        return {
          found: true,
          matchedType: "order_id",
          channel: "Lazada",
          collection: "OpenLazadaOrderItems",
          label: "Lazada Order Item",
          matchedField: candidates.includes(itemLazada.order_id) ? "order_id" : "order_item_id",
          data: itemLazada,
        };
      }

      const orderIdTables = [
        { name: "TikOrders", fields: ["id", "order_id"], channel: "TikTok Shop", label: "TikTok Order ID" },
        { name: "TiktokOrders", fields: ["order_id", "id"], channel: "TikTok Shop", label: "TikTok Order ID" },
        { name: "CenterOrders", fields: ["order_id"], channel: "Center", label: "Center Order ID" },
      ];

      for (const t of orderIdTables) {
        const queryOr = t.fields.map(f => ({ [f]: { $in: candidates } }));
        const item = await walletDb.collection(t.name).findOne({ $or: queryOr });
        if (item) {
          return {
            found: true,
            matchedType: "order_id",
            channel: t.channel,
            collection: t.name,
            label: t.label,
            matchedField: t.fields[0],
            data: item,
          };
        }
      }
    }

    return { found: false, message: `ไม่พบรหัส "${cleanCode}" ในฐานข้อมูล dbWallet ทั้ง 10 คอลเลกชัน` };
  } catch (err) {
    console.error("[dbWalletService] Error searching dbWallet:", err.message);
    if (err.message && err.message.includes("not authorized on dbWallet")) {
      return {
        found: false,
        message: "บัญชีผู้ใช้ MongoDB (db_biok) ยังไม่ได้รับอนุญาตสิทธิ์อ่านฐานข้อมูล dbWallet (กรุณาให้ผู้ดูแลเซิร์ฟเวอร์รันคำสั่งมอบสิทธิ์ grantRolesToUser บน MongoDB)",
        isAuthError: true,
      };
    }
    return { found: false, message: "เกิดข้อผิดพลาดขณะค้นหาข้อมูลใน dbWallet: " + err.message };
  }
}
