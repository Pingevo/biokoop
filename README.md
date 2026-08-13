# biokoop

รับรูปภาพจากลูกค้าผ่าน LINE OA → วิเคราะห์ด้วย AI (Gemini Vision) → สร้างการ์ดผลลัพธ์ → ส่งกลับผ่าน LINE

ทดสอบผ่านแล้วว่า:
- `resvg-wasm` compose การ์ดเป็น PNG ได้จริง ไม่มี native module (ปลอดภัยกับ Plesk/Passenger)
- โครงสร้าง schema, validate logic, image compose ทำงานถูกต้องตามที่ทดสอบไว้

## โครงสร้างโปรเจกต์

```
biokoop/
├── server.js              # entrypoint หลัก (express + session + trust proxy)
├── config/db.js           # เชื่อมต่อ MongoDB (หลัก + dbWallet)
├── models/
│   ├── User.js             # users collection - ติดตามผู้ใช้ LINE
│   ├── Request.js          # requests collection - สถานะล่าสุดของแต่ละคำขอ
│   ├── RequestLog.js       # request_logs collection - audit trail ทุกขั้นตอนของ pipeline
│   ├── AdminUser.js        # admin หลังบ้าน (login ผ่าน system81 SSO, role admin|superadmin)
│   ├── AdminAuditLog.js    # audit trail ของ action ที่ admin ทำในหลังบ้าน
│   ├── RegistrationCode.js # รหัส whitelist สำหรับลงทะเบียน
│   └── LineMessageLog.js   # ประวัติข้อความ LINE ที่ระบบส่ง/รับ
├── middlewares/
│   └── adminAuth.js        # loadAdminUser + requireAdmin (Lv.1) + requireSuperadmin (Lv.2)
├── services/
│   ├── lineService.js      # LINE Messaging API (webhook, reply, push, profile)
│   ├── aiService.js        # เรียก Gemini Vision + validate ผลลัพธ์
│   ├── cardTemplate.js     # SVG template ของการ์ดผลลัพธ์ (ธีมขาว-แดง-ดำ)
│   ├── imageService.js     # compose SVG -> PNG ด้วย resvg-wasm
│   ├── storageService.js   # เก็บ/ดึงรูปผ่าน GridFS
│   └── pipeline.js         # รวมทุกขั้นตอนเข้าด้วยกัน (หัวใจของระบบ)
├── routes/
│   ├── webhook.js          # POST /webhook - รับ event จาก LINE
│   ├── results.js          # GET /results/:id.png - serve รูปผลลัพธ์
│   ├── admin.js            # /admin/api/* - admin panel API (stats, requests, users, config)
│   ├── adminAuth.js        # /admin/auth/* - system81 SSO flow (redirect/callback/logout)
│   ├── register.js         # หน้าลงทะเบียนผู้ใช้
│   └── health.js           # /health - health check
├── public/
│   ├── admin/index.html    # admin dashboard SPA (v1.1.2)
│   └── register.html       # หน้าลงทะเบียน
└── fonts/                  # Kanit + JetBrains Mono (ฝังตรงตามที่ทดสอบแล้ว)
```

## ระบบหลังบ้าน Admin (v1.1.2)

ระบบหลังบ้าน login ผ่าน **system81 SSO ของ ITSR** (เดียวกับ isuperFIT) — ไม่มี password login แล้ว

### สิทธิ์ 2 ระดับ

| Action | Admin Lv.1 | Superadmin Lv.2 |
|---|---|---|
| ดู stats / requests / users / line-messages / logs / analytics | ✅ | ✅ |
| approve-send / update-status / correct-ai / send-message | ✅ | ✅ |
| block / unblock LINE user | ✅ | ✅ |
| บันทึก config (card / kieslect / bot-messages / pricing / grade / registration) | ❌ ดูได้ | ✅ |
| จัดการ admin accounts (role / status / delete) | ❌ | ✅ |
| ดู audit log แอดมิน | ❌ | ✅ |

### Auto-provision

- บัญชี `@itsr.co.th` **คนแรก** ที่ login ผ่าน SSO → **superadmin (Lv.2)** อัตโนมัติ
- คนถัดไปใน domain `@itsr.co.th` → **admin (Lv.1)** — superadmin เลื่อนขั้นให้ได้ในหน้าจัดการ admin
- บัญชีนอก domain นี้ → ปฏิเสธ (ยังไม่มี flow เพิ่ม admin นอก domain เอง)

### SSO Flow

```
/admin/  →  /admin/auth  →  /admin/auth/redirect
    ↓
ITSR system81 login (https://data.digital.in.th/system81/login)
    ↓ redirect กลับพร้อม token
/admin/auth/callback?token=<jwt>
    ↓ ตรวจ token กับ /system81/userinfo
    ↓ สร้าง/หา AdminUser + set session
/admin/  (เข้าหลังบ้านสำเร็จ)
```

Session เก็บใน MongoDB collection `admin_sessions` (TTL 7 วัน) ใช้ cookie `biokoop_admin_sid` พร้อม `Secure` + `HttpOnly` flag ใน production

## ขั้นตอน deploy บน Plesk/Passenger

1. อัพโหลดโปรเจกต์ทั้งหมดขึ้นเซิร์ฟเวอร์ (ยกเว้น `node_modules`)
2. `npm install` บนเซิร์ฟเวอร์ (Plesk จะรันให้อัตโนมัติถ้าตั้ง Node.js App ไว้)
3. คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่าจริงทั้งหมด:
   - `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` จาก LINE Developers Console
   - `MONGODB_URI` (แนะนำ MongoDB Atlas free tier ถ้ายังไม่มี MongoDB บนเซิร์ฟเวอร์)
   - `GEMINI_API_KEY`
   - `PUBLIC_BASE_URL` ต้องเป็น HTTPS URL จริงของโดเมนที่ deploy (LINE ต้องดึงรูปผ่าน URL นี้ได้ และ system81 SSO ต้อง redirect กลับมาได้)
   - `SESSION_SECRET` สุ่ม 64 ตัวอักษร — สร้างด้วย `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `NODE_ENV=production` (บังคับ secure cookie)
   - `SELLCENTER_OAUTH_BASE_URL=https://data.digital.in.th` (default อยู่แล้ว)
   - `ADMIN_APP_NAME=biokoop Admin`
   - `AUTO_PROVISION_DOMAIN=@itsr.co.th`
4. ตั้งค่า Startup File เป็น `server.js` ใน Plesk Node.js settings
5. ไปที่ LINE Developers Console → Messaging API → ตั้ง Webhook URL เป็น `https://your-domain.example.com/webhook` แล้วกด Verify
6. ทดสอบส่งรูปจาก LINE OA ของตัวเอง (1:1 chat) ก่อนเปิด public
7. ทดสอบ login หลังบ้านที่ `https://your-domain.example.com/admin/` — login ด้วยบัญชี `@itsr.co.th` คนแรกเพื่อสร้าง superadmin

## จุดที่ต้อง double-check ก่อนเปิด public

- [ ] ทดสอบ webhook ตอบ 200 เร็วพอ ไม่โดน LINE ส่ง event ซ้ำ
- [ ] ทดสอบ replyToken หมดอายุ -> ระบบสลับไป Push API ถูกต้อง (ดู `pipeline.js` -> `safeReplyOrPushImage`)
- [ ] ทดสอบเคส AI ตอบ error / confidence ต่ำ -> ต้องไม่ส่งการ์ดที่ผิดออกไปหาลูกค้า (ดู `needs_review` status)
- [ ] เช็คว่า `/results/:id.png` เข้าถึงได้จากอินเทอร์เน็ตจริง ไม่ใช่แค่ localhost
- [ ] เปิด MongoDB query ดู `request_logs` collection ว่าบันทึกครบทุก step ตามที่ต้องการ
- [ ] เช็ค cookie `biokoop_admin_sid` ใน DevTools ต้องมี flag `Secure` + `HttpOnly`
- [ ] เช็ค MongoDB ต้องมี collection ใหม่ `admin_sessions`, `adminusers`, `adminauditlogs`
- [ ] ยืนยันว่าบัญชี `@itsr.co.th` คนแรกที่ login เป็น superadmin ของคุณเอง (ไม่ใช่คนอื่น)

## สถานะที่ยังไม่ได้ทำ (รอปรับแต่งต่อ)

- `cardTemplate.js` ยังใช้ mock ตำแหน่ง timeline chart (ต้องคำนวณจากข้อมูลจริงที่ AI ส่งมา)
- `wrapText()` ใน cardTemplate ใช้การประมาณความกว้างตัวอักษรแบบหยาบ ควรทดสอบกับข้อความยาวๆ เพิ่มเติม
- ยังไม่มี flow ให้ superadmin เพิ่ม admin ที่ไม่ใช่ domain `@itsr.co.th` เอง (ตอนนี้ auto-provision เฉพาะ domain นี้)
- LINE command `/admin auth <password>` ใน webhook.js ยังใช้ `ADMIN_PASSWORD` แบบเดิม (แยกจาก web admin panel ที่ใช้ SSO แล้ว)
