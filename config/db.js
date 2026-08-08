import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("ไม่พบ MONGODB_URI ใน .env");
  }
  await mongoose.connect(uri);
  console.log("[db] เชื่อมต่อ MongoDB สำเร็จ");
  return mongoose.connection;
}
