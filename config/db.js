import mongoose from "mongoose";

let walletDbConnection = null;

export async function connectDB() {
  const primaryUri = process.env.MONGODB_URI;
  if (!primaryUri) {
    throw new Error("ไม่พบ MONGODB_URI ใน .env");
  }

  // 1. เชื่อมต่อฐานข้อมูลหลัก (biokoop)
  await mongoose.connect(primaryUri);
  console.log("[db] เชื่อมต่อ MongoDB หลัก (biokoop) สำเร็จ");

  // 2. เชื่อมต่อฐานข้อมูลรอง (dbWallet)
  const walletUri = process.env.MONGODB_WALLET_URI;
  if (walletUri) {
    try {
      walletDbConnection = mongoose.createConnection(walletUri);
      await walletDbConnection.asPromise();
      console.log("[db] เชื่อมต่อ MongoDB รอง (dbWallet) สำเร็จ");
    } catch (err) {
      console.warn("[db] คำเตือน: ไม่สามารถเชื่อมต่อ dbWallet ผ่าน MONGODB_WALLET_URI ได้ (" + err.message + ") สลับไปใช้ useDb fallback");
      walletDbConnection = mongoose.connection.useDb("dbWallet");
    }
  } else {
    walletDbConnection = mongoose.connection.useDb("dbWallet");
  }

  return mongoose.connection;
}

export function getWalletDbConnection() {
  if (walletDbConnection) return walletDbConnection;
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return mongoose.connection.useDb("dbWallet");
  }
  return null;
}
