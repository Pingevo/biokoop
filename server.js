import "dotenv/config";
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import { initImageService } from "./services/imageService.js";
import { loadAdminUser } from "./middlewares/adminAuth.js";
import webhookRoute from "./routes/webhook.js";
import resultsRoute from "./routes/results.js";
import adminRoute from "./routes/admin.js";
import adminAuthRoute from "./routes/adminAuth.js";
import registerRoute from "./routes/register.js";
import healthRoute from "./routes/health.js";

const app = express();

// trust proxy 1 hop — สำคัญมากเมื่ออยู่หลัง reverse proxy (Plesk/Passenger, nginx, ngrok)
// ถ้าไม่ตั้ง: req.ip จะเป็น IP ของ proxy ไม่ใช่ client จริง,
// และ cookie secure: true จะไม่ถูกส่งเพราะ Express เห็นเป็น HTTP (ไม่ใช่ HTTPS)
app.set("trust proxy", 1);

// หมายเหตุ: /webhook ต้องอยู่ก่อน express.json() เพราะ LINE middleware
// ต้องการ raw body สำหรับ verify signature เอง (จัดการอยู่ใน lineMiddleware แล้ว)
app.use("/webhook", webhookRoute);

app.use(express.json());
app.use(express.static("public"));

// Session สำหรับหลังบ้าน admin (login ผ่าน system81 SSO ของ ITSR)
// ใช้ cookie ชื่อ biokoop_admin_sid แยกจาก session อื่น ๆ ถ้ามี
// clientPromise รอให้ mongoose connect เสร็จก่อนแล้วค่อยสร้าง store (เพราะ session middleware
// setup ตอน top-level ก่อน connectDB() ใน start())
const adminSessionClientPromise = mongoose.connection
  .asPromise()
  .then(() => mongoose.connection.getClient());

const SESSION_SECRET = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === "production";

// ใน production ต้องตั้ง SESSION_SECRET เอง (default เป็นค่าไม่ปลอดภัย — ใช้ได้แค่ dev)
if (isProduction && !SESSION_SECRET) {
  console.error(
    "[server] FATAL: ต้องตั้ง SESSION_SECRET ใน .env เมื่อ NODE_ENV=production\n" +
      "สร้างด้วย: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
  process.exit(1);
}

app.use(
  session({
    name: "biokoop_admin_sid",
    secret: SESSION_SECRET || "dev-session-secret-change-me",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      clientPromise: adminSessionClientPromise,
      collectionName: "admin_sessions",
      ttl: 60 * 60 * 24 * 7, // 7 วัน
    }),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 วัน
    },
  })
);

// โหลด admin ปัจจุบันจาก session ใส่ req.admin — ใช้กับทุก request ในเขต /admin
app.use(loadAdminUser);

app.use("/health", healthRoute);
app.use("/", registerRoute);
app.use("/results", resultsRoute);

// /admin/auth — system81 SSO flow (redirect/callback/logout) ต้องอยู่ก่อน /admin เพื่อให้เข้าถึงได้ตอนยังไม่ login
app.use("/admin/auth", adminAuthRoute);
app.use("/admin", adminRoute);

app.get("/", (req, res) => {
  res.send("biokoop is running");
});

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  await initImageService();
  const server = app.listen(PORT, () => {
    console.log(`[server] biokoop ทำงานที่ port ${PORT} (NODE_ENV=${process.env.NODE_ENV || "development"})`);
  });

  // Graceful shutdown — ปิด HTTP server และ MongoDB ก่อน exit เพื่อไม่ให้ request ค้าง
  function shutdown(signal) {
    console.log(`[server] ได้รับ ${signal} — กำลังปิดระบบ...`);
    server.close(() => {
      mongoose.connection.close(false, () => {
        console.log("[server] ปิดระบบเรียบร้อยแล้ว");
        process.exit(0);
      });
    });
    // ถ้าปิดไม่สำเร็จใน 10 วินาที ให้ force exit
    setTimeout(() => {
      console.error("[server] ปิดระบบไม่ทัน — force exit");
      process.exit(1);
    }, 10000).unref();
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("[server] เริ่มระบบไม่สำเร็จ:", err);
  process.exit(1);
});
