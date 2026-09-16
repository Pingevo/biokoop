# biokoop — Notes for coding agents

## Stack
- Node.js (ESM, `"type": "module"`) + Express 4 + MongoDB (Mongoose), port **5000**
- LINE OA bot → AI image analysis → ส่งผลกลับเป็นรูปภาพ

## Weekly Health Trend Report (ปัจจุบัน — แทน flow รายวันเดิม)
- ลูกค้าส่ง Screenshot จากแอป Kieslect **3 รูป/ชุด**: Body Load, Recovery, Sleep Quality (ลำดับใดก็ได้ AI จำแนกเอง)
- Flow: `webhook.js` → `pipeline.js:queueWeeklyImage()` เก็บ buffer ไว้ใน `imageBatches` Map (TTL 10 นาที, env `WEEKLY_BATCH_TTL_MS`) → ครบ 3 → `aiService.js:analyzeWeeklyImages()` (ภาพ 3 ใบใน 1 รีเควสต์: OpenRouter หลัก → Gemini สำรอง) → `weeklyReportTemplate.js:renderWeeklyReportSvgs()` SVG 3 หน้า → `imageService.js:composeWeeklyReport()` PNG → GridFS ("results") → `lineService.js:sendWeeklyReportImages()` push ภาพ 3 หน้า + ข้อความสรุป
- รายงานพื้นหลังขาวล้วน **ไม่มีภาพภูเขา/ภาพถ่าย** (page1 Overview / page2 Activity & Recovery โทนเขียว / page3 Sleep โทนม่วง)
- Request model มี `reportType`, `originalImageIds[3]`, `resultImageIds[3]` (ฟิลด์เดิม `originalImageId/resultImageId` เก็บไว้ = legacy)
- การ์ดรายวันเดิม (`cardTemplate.js`) เหลือใช้เฉพาะหน้า Admin (Card Builder / AI Studio `/api/test-ai-analyze`)
- ทดสอบเรนเดอร์โดยไม่ยิง AI: `node scripts/test_weekly_report.js` (ออกไฟล์ test_weekly_report_p1-3.png)

## Admin UI (public/admin/index.html)
- ไฟล์เดียวใหญ่ (~6,400 บรรทัด, inline CSS/JS ทั้งหมด) — มี `<style>` 3 ก้อน: base, design-system override (ใช้ `!important` เยอะ), และ "Admin UX Pack" (drawer menu + font-scale + scroll-top)
- Route: `GET /admin` → `requireAdmin` session (ITSR SSO via `/admin/auth`) → `res.sendFile` → แก้ไฟล์แล้ว refresh ได้ทันที ไม่ต้อง restart server
- โครงหลัก: `.header` / `.app-container` (`.sidebar` + `.main-content`) / tabs `switchTab('tab-name')` / sub-tabs `switchSubTab()`
- Tab switcher ถูก wrap (monkey-patch) 2 ครั้ง: ท้าย script หลัก (superadmin tabs) และท้ายไฟล์ (Admin UX Pack) — ถ้าเพิ่ม tab ใหม่ ให้ระวัง chain นี้
- Responsive: drawer menu เมื่อ ≤1100px (`body.nav-open`), font-scale modes เก็บใน `localStorage['biokoop-admin-font-scale']` (`'' | 'lg' | 'xl'` → `html[data-ui-scale]`)

## Verify changes
- `node --check server.js`
- HTML inline JS syntax: `node -e "const h=require('fs').readFileSync('public/admin/index.html','utf8'); [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m=>new Function(m[1])); console.log('OK')"`
- Start: `npm start` (ต้องมี .env + MongoDB); login หน้า admin ผ่าน ITSR SSO เท่านั้น
