import "dotenv/config";
import express from "express";
import { connectDB } from "./config/db.js";
import { initImageService } from "./services/imageService.js";
import webhookRoute from "./routes/webhook.js";
import resultsRoute from "./routes/results.js";
import adminRoute from "./routes/admin.js";
import registerRoute from "./routes/register.js";

const app = express();

// หมายเหตุ: /webhook ต้องอยู่ก่อน express.json() เพราะ LINE middleware
// ต้องการ raw body สำหรับ verify signature เอง (จัดการอยู่ใน lineMiddleware แล้ว)
app.use("/webhook", webhookRoute);

app.use(express.json());
app.use(express.static("public"));

app.use("/", registerRoute);
app.use("/results", resultsRoute);
app.use("/admin", adminRoute);

app.get("/", (req, res) => {
  res.send("biokoop is running");
});

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  await initImageService();
  app.listen(PORT, () => {
    console.log(`[server] biokoop ทำงานที่ port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[server] เริ่มระบบไม่สำเร็จ:", err);
  process.exit(1);
});
