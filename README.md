# biokoop

รับรูปภาพจากลูกค้าผ่าน LINE OA → วิเคราะห์ด้วย AI (Gemini Vision) → สร้างการ์ดผลลัพธ์ → ส่งกลับผ่าน LINE

ทดสอบผ่านแล้วว่า:
- `resvg-wasm` compose การ์ดเป็น PNG ได้จริง ไม่มี native module (ปลอดภัยกับ Plesk/Passenger)
- โครงสร้าง schema, validate logic, image compose ทำงานถูกต้องตามที่ทดสอบไว้

## โครงสร้างโปรเจกต์

```
biokoop/
├── server.js              # entrypoint หลัก
├── config/db.js           # เชื่อมต่อ MongoDB
├── models/
│   ├── User.js             # users collection - ติดตามผู้ใช้
│   ├── Request.js          # requests collection - สถานะล่าสุดของแต่ละคำขอ
│   └── RequestLog.js       # request_logs collection - audit trail ทุกขั้นตอน
├── services/
│   ├── lineService.js      # LINE Messaging API (webhook, reply, push, profile)
│   ├── aiService.js        # เรียก Gemini Vision + validate ผลลัพธ์
│   ├── cardTemplate.js     # SVG template ของการ์ดผลลัพธ์ (ธีมขาว-แดง-ดำ)
│   ├── imageService.js     # compose SVG -> PNG ด้วย resvg-wasm
│   ├── storageService.js   # เก็บ/ดึงรูปผ่าน GridFS
│   └── pipeline.js         # รวมทุกขั้นตอนเข้าด้วยกัน (หัวใจของระบบ)
├── routes/
│   ├── webhook.js          # POST /webhook - รับ event จาก LINE
│   └── results.js          # GET /results/:id.png - serve รูปผลลัพธ์
└── fonts/                  # Kanit + JetBrains Mono (ฝังตรงตามที่ทดสอบแล้ว)
```

## ขั้นตอน deploy บน Plesk/Passenger

1. อัพโหลดโปรเจกต์ทั้งหมดขึ้นเซิร์ฟเวอร์ (ยกเว้น `node_modules`)
2. `npm install` บนเซิร์ฟเวอร์ (Plesk จะรันให้อัตโนมัติถ้าตั้ง Node.js App ไว้)
3. คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่าจริงทั้งหมด:
   - `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` จาก LINE Developers Console
   - `MONGODB_URI` (แนะนำ MongoDB Atlas free tier ถ้ายังไม่มี MongoDB บนเซิร์ฟเวอร์)
   - `GEMINI_API_KEY`
   - `PUBLIC_BASE_URL` ต้องเป็น HTTPS URL จริงของโดเมนที่ deploy (LINE ต้องดึงรูปผ่าน URL นี้ได้)
4. ตั้งค่า Startup File เป็น `server.js` ใน Plesk Node.js settings
5. ไปที่ LINE Developers Console → Messaging API → ตั้ง Webhook URL เป็น `https://your-domain.example.com/webhook` แล้วกด Verify
6. ทดสอบส่งรูปจาก LINE OA ของตัวเอง (1:1 chat) ก่อนเปิด public

## จุดที่ต้อง double-check ก่อนเปิด public (ตามที่ตั้งใจไว้)

- [ ] ทดสอบ webhook ตอบ 200 เร็วพอ ไม่โดน LINE ส่ง event ซ้ำ
- [ ] ทดสอบ replyToken หมดอายุ -> ระบบสลับไป Push API ถูกต้อง (ดู `pipeline.js` -> `safeReplyOrPushImage`)
- [ ] ทดสอบเคส AI ตอบ error / confidence ต่ำ -> ต้องไม่ส่งการ์ดที่ผิดออกไปหาลูกค้า (ดู `needs_review` status)
- [ ] เช็คว่า `/results/:id.png` เข้าถึงได้จากอินเทอร์เน็ตจริง ไม่ใช่แค่ localhost
- [ ] เปิด MongoDB query ดู `request_logs` collection ว่าบันทึกครบทุก step ตามที่ต้องการ

## สถานะที่ยังไม่ได้ทำ (รอปรับแต่งต่อ)

- ยังไม่มี admin dashboard/LINE command สำหรับดู `needs_review` และสถิติผู้ใช้ (คุยไว้แล้วว่าจะทำเป็น LINE command ทีหลัง)
- `cardTemplate.js` ยังใช้ mock ตำแหน่ง timeline chart (ต้องคำนวณจากข้อมูลจริงที่ AI ส่งมา)
- `wrapText()` ใน cardTemplate ใช้การประมาณความกว้างตัวอักษรแบบหยาบ ควรทดสอบกับข้อความยาวๆ เพิ่มเติม
- ยังไม่ได้ integrate OpenRouter (โมเดลที่ 2 สำหรับ cross-check) — ตอนนี้ใช้ Gemini ตัวเดียว
