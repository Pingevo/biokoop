# AI Usage Hub — API Documentation (สำหรับนักพัฒนาโปรเจกต์อื่น)

Central logging สำหรับการเรียกใช้ AI/scraping provider (OpenRouter, Gemini, OpenAI,
Anthropic, Apify, ...) แบบรวมศูนย์ ทุกโปรเจกต์ยิง event เข้ามาที่จุดเดียว แล้วดู
ค่าใช้จ่าย/โทเคน/error rate แยกตามโปรเจกต์ ผู้ใช้ provider model ได้จากแดชบอร์ดเดียว

**ไม่ต้องขึ้น server เอง ไม่ต้องตั้ง DB เอง** — ยิง HTTP POST มาที่ sellcenter (`https://digital.in.th`) เท่านั้นพอ

Base URL: `https://digital.in.th`

---

## 1) Authentication

ทุก request เข้า ingest endpoint ต้องแนบ **service token** มาด้วย ทีมงานจะส่ง token
ให้แยกตามระบบของคุณ (ไม่ต้องขอเอง) — token หน้าตาแบบนี้:

```
svc_<64 hex characters>
```

แนบมาใน header อย่างใดอย่างหนึ่ง:

```
x-service-token: svc_xxxxxxxxxxxxxxxxxxxxxxxxx
```
หรือ
```
Authorization: Bearer svc_xxxxxxxxxxxxxxxxxxxxxxxxx
```

**Token ระบุตัวตนโปรเจกต์คุณอัตโนมัติ** (ผูกกับชื่อที่ตั้งไว้ตอนสร้าง) — ไม่ต้องส่งชื่อ
โปรเจกต์มาใน request body และปลอมชื่อโปรเจกต์อื่นไม่ได้แม้จะพยายามส่งมาก็ตาม (server
ไม่เชื่อค่าที่ส่งมา ใช้ค่าที่ผูกกับ token เท่านั้น)

**เก็บ token ไว้ใน secret manager / env var ของโปรเจกต์คุณ ห้าม commit ขึ้น git และ
ห้ามใส่ในเอกสาร/README ที่จะแชร์ต่อ**

**Token หายหรือรั่วไหล**: แจ้งทีม sellcenter ให้ rotate token ให้ทันที (token เดิมจะใช้
ไม่ได้ต่อจากนั้น)

---

## 2) Ingest — เรียกหลังทุกครั้งที่เรียก AI/scraping provider จริง

### Endpoint

| Method | Path | ใช้เมื่อ |
|---|---|---|
| `POST` | `/internal/ai-usage/logs` | log ทีละ 1 event |
| `POST` | `/internal/ai-usage/logs/batch` | log หลาย event รวดเดียว — body `{ "items": [ {...}, {...} ] }` |

### Request Body

**Field เดียวที่บังคับคือ `provider`** นอกนั้นส่งเท่าที่มี — แต่แนะนำให้ส่งครบทุก field
ที่เกี่ยวข้องทุกครั้ง (ดูเหตุผลในหัวข้อ 6):

```json
{
  "provider": "openrouter",
  "model": "google/gemini-2.5-flash",
  "operation": "chat.completions",
  "source": "classifyPost",
  "user": "E1234 สมชาย",
  "reference": "project_id:9981",
  "request_id": "abc-123",
  "environment": "production",
  "prompt_tokens": 1200,
  "completion_tokens": 340,
  "units": { "images_processed": 3 },
  "cost_usd": 0.00042,
  "cost_thb": 0.0153,
  "duration_ms": 850,
  "attempt": 1,
  "status": "success",
  "http_status": 200,
  "error_message": null,
  "raw_usage": { "...": "whatever the provider's own response returned" },
  "metadata": { "channel_id": "9981", "post_id": "..." }
}
```

| Field | ประเภท | คำอธิบาย |
|---|---|---|
| `provider` | string **(บังคับ)** | `openrouter` \| `gemini` \| `openai` \| `anthropic` \| `apify` \| `9arm` \| `other` (ค่าอื่นนอกจากนี้จะถูก normalize เป็น `other` อัตโนมัติ) |
| `model` | string | ชื่อ model หรือ Apify actor id (เช่น `clockworks/tiktok-scraper`) |
| `operation` | string | ชื่อ operation ฝั่ง provider เช่น `chat.completions`, `generateContent`, `actor.run` |
| `source` | string | ชื่อจุดเรียกในโค้ดคุณ เช่น `evaluatePersonDay` — ช่วยไล่หาต้นทางตอนดูรายงานมาก |
| `user` | string | **ใครสั่งให้เรียก (actor)** — ดูหัวข้อ 3 |
| `reference` | string | **เรื่องนี้เกี่ยวกับอะไร/ใคร (subject)** — ดูหัวข้อ 3 |
| `request_id` | string | id ที่ provider คืนมา (generation id, run id, ฯลฯ) — ใช้เป็น idempotency key ได้ถ้าต้องดึงประวัติย้อนหลังทีหลัง (ดูหัวข้อ 7) |
| `environment` | string | ค่า default = `production` ถ้าไม่ส่ง |
| `prompt_tokens` / `completion_tokens` | number | จาก `usage.prompt_tokens` ฯลฯ ของ provider |
| `units` | object | การใช้งานที่ไม่ใช่ token เช่น `{"images_processed": 3}`, `{"items_fetched": 20}` |
| `cost_usd` | number | **ต้องเป็นราคาจริงเป็น USD จาก provider เสมอ ห้ามปล่อยว่างให้ระบบประมาณ** — ดูหัวข้อ 5 |
| `cost_thb` | number | ถ้าไม่ส่งมา ระบบคำนวณให้อัตโนมัติจากเรทจริงของ ธปท. |
| `duration_ms` | number | เวลาที่ใช้เรียก |
| `attempt` | number | ครั้งที่กี่ ถ้ามี retry (default 1) |
| `status` | string | `success` \| `error` \| `timeout` (ไม่ส่ง = ถือว่า `success`) |
| `http_status` | number | HTTP status ที่ provider ตอบกลับ |
| `error_message` | string | ข้อความ error (ถ้ามี) |
| `raw_usage` | object | response ดิบจาก provider ที่เกี่ยวกับ usage/cost — เก็บไว้เผื่อ debug/audit ย้อนหลัง |
| `metadata` | object | context อิสระอื่นๆ ที่อยากผูกไว้กับ log นี้ |

### curl example

```bash
curl -X POST "https://digital.in.th/internal/ai-usage/logs" \
  -H "Content-Type: application/json" \
  -H "x-service-token: svc_xxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "provider": "openrouter",
    "model": "anthropic/claude-3.5-sonnet",
    "operation": "chat.completions",
    "source": "evaluatePersonDay",
    "user": "สมชาย (#12)",
    "prompt_tokens": 9012,
    "completion_tokens": 1021,
    "cost_usd": 0.014117,
    "duration_ms": 11834,
    "status": "success"
  }'
```

### Success response

```json
{ "success": true, "cost_usd": 0.014117, "cost_thb": 0.472 }
```
(`cost_thb` คำนวณให้อัตโนมัติจากเรทเงินจริงของ ธปท. ถ้าไม่ได้ส่งมาเอง — ไม่ต้อง
คำนวณเอง)

### Error response

```json
{ "success": false, "error": "provider is required" }
```

### Node.js

```js
function logAiUsage(entry) {
  const url = process.env.AI_USAGE_HUB_URL;   // https://digital.in.th
  const token = process.env.AI_USAGE_HUB_TOKEN;
  if (!url || !token) return; // ยังไม่ตั้งค่า — ข้ามเงียบๆ ไม่ throw

  fetch(url.replace(/\/$/, "") + "/internal/ai-usage/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-service-token": token },
    body: JSON.stringify(entry),
  }).catch((e) => console.error("[ai-usage-hub] log failed:", e));
}

// เรียกหลังทุกครั้งที่ได้ response จริงจาก AI provider
logAiUsage({
  provider: "openrouter",
  model: result.model,
  operation: "chat.completions",
  source: "myFunctionName",
  user: currentUser.name,
  prompt_tokens: result.usage?.prompt_tokens,
  completion_tokens: result.usage?.completion_tokens,
  cost_usd: result.usage?.cost,
  duration_ms: Date.now() - startedAt,
  status: "success",
});
```

### Python

```python
import os
import requests

def log_ai_usage(entry: dict) -> None:
    url = os.environ.get("AI_USAGE_HUB_URL")
    token = os.environ.get("AI_USAGE_HUB_TOKEN")
    if not url or not token:
        return  # ยังไม่ตั้งค่า — ข้ามเงียบๆ

    try:
        requests.post(
            f"{url.rstrip('/')}/internal/ai-usage/logs",
            json=entry,
            headers={"x-service-token": token},
            timeout=5,
        )
    except Exception as e:
        print(f"[ai-usage-hub] log failed: {e}")

log_ai_usage({
    "provider": "openrouter",
    "model": model_name,
    "operation": "chat.completions",
    "source": "my_function_name",
    "user": current_user_name,
    "prompt_tokens": usage.get("prompt_tokens"),
    "completion_tokens": usage.get("completion_tokens"),
    "cost_usd": usage.get("cost"),
    "duration_ms": duration_ms,
    "status": "success",
})
```

**หลักการสำคัญ**: ฟังก์ชัน log ต้อง**ไม่มีวัน throw error ออกมาทำลาย flow หลักของคุณ**
— ถ้ายิงไม่สำเร็จ แค่ log ไว้เฉยๆ แล้วปล่อยผ่าน (fire-and-forget เสมอ ครอบด้วย
try/catch หรือ `.catch()` ให้ครบทุกทาง)

---

## 3) `user` vs `reference` — คนละมิติกัน อย่าใส่ปนกัน

**`user` = ใครสั่งให้เรียก (actor)**
- มีพนักงาน/ผู้ใช้จริงกดปุ่ม → ใส่ชื่อหรือ emp_id ของเขา เช่น `"E1234 สมชาย"`
- เป็น cron/worker ที่รันเอง ไม่มีคนสั่ง ณ ตอนนั้น → ใส่ label ชัดเจน เช่น `"system"` หรือ
  ดีกว่านั้นคือใส่ชื่องานนั้นไปเลย เช่น `"cron:daily_sync"`

**อย่าปล่อยว่าง** ถ้าปล่อยว่าง รายงานจะโชว์เป็น `(ไม่ระบุ)` ซึ่งแยกไม่ออกว่า "ตั้งใจให้
เป็นระบบอัตโนมัติ" หรือ "ลืมใส่" — การใส่ label ชัดเจนทำให้รายงานเชื่อถือได้กว่ามาก

**`reference` = เรื่องนี้เกี่ยวกับอะไร/ใคร (subject)** — เอาไว้อ้างใบงาน/เอกสาร/รายการที่
การเรียกครั้งนี้เกี่ยวข้องด้วย เช่น เลขที่ใบงาน, doc id, ชื่อ project, หรือ "คนที่ถูก
ประมวลผล" (ไม่ใช่คนที่สั่ง)

**ตัวอย่างที่ทำให้เห็นความต่าง**: ระบบประเมินงานพนักงานอัตโนมัติทุกคืน — ไม่มีใครกดปุ่ม
ตอนนั้น แต่ AI กำลังประเมินงานของพนักงานคนหนึ่งอยู่:
```json
{ "user": "system", "reference": "ศราวุฒิ ชัยมี (#2)" }
```
ถ้าเป็นแอดมินกดสั่งประเมินเองผ่านหน้าเว็บ (ไม่ใช่ cron):
```json
{ "user": "Ping (admin)", "reference": "ศราวุฒิ ชัยมี (#2)" }
```
`reference` เหมือนเดิมทั้งสองกรณี (ประเมินคนเดียวกัน) แต่ `user` ต่างกันตามคนสั่ง —
แยกกันชัดแบบนี้ทำให้ดูได้ทั้ง "ใครสั่งบ่อยสุด" และ "ประเมินใครแพงสุด" พร้อมกันโดยไม่ปน
กัน

**แนะนำรูปแบบ `reference`**: ถ้ามี code อ่านง่ายอยู่แล้ว (เช่น `JOB-20230622-05`) ใช้
ตัวนั้นต่อท้ายด้วยบริบทเพิ่ม เช่น platform ได้ เช่น `JOB-20230622-05-youtube` — อ่านง่าย
กว่า raw database id เปล่าๆ มาก

---

## 4) แยกประเภทการทำงานด้วย `metadata`

ถ้าระบบคุณมีการทำงานหลายแบบที่อยากแยกดูใน `/ai-usage` ได้ (เช่น "วิเคราะห์ผลงาน" vs
"ดึงสถิติ" vs "ประมวลผล batch") แนะนำใส่ tag แยกประเภทไว้ใน `metadata.analysis_type`
(หรือชื่อ key อื่นที่สื่อความหมายกับระบบคุณ) เช่น:

```json
{ "metadata": { "analysis_type": "job_performance_analysis", "channel_id": "..." } }
```

ทำให้ query/filter แยกตามประเภทงานได้ทีหลังโดยไม่ต้องพึ่ง `source` (ชื่อฟังก์ชัน) เพียง
อย่างเดียว ซึ่งอาจมีหลายฟังก์ชันย่อยอยู่ในงานประเภทเดียวกัน

---

## 5) เรื่องราคา (`cost_usd`) — **ต้องเป็นราคาจริงเท่านั้น ห้ามใช้ค่าประมาณ**

**Provider หลักที่ระบบนี้ใช้งานจริงตอนนี้ (OpenRouter, Apify, 9arm) ทุกตัวมีราคาจริงให้
หาได้เสมอ** — ห้ามปล่อยให้ระบบ fallback ไปประมาณราคาเองเด็ดขาด ก่อนขึ้นโค้ด production
ต้องหาว่า provider ของคุณคืนราคาจริงมาจากตรงไหน แล้วส่ง `cost_usd` นั้นมาตรงๆ ทุกครั้ง:

- **OpenRouter**: `usage.cost` มากับ response ของทุก chat completion request อยู่แล้ว
  (ต้องเปิด usage accounting ใน request ถ้ายังไม่เปิด) — ส่งค่านี้ตรงๆ
- **Apify**: **ห้ามใช้ endpoint สะดวก `run-sync-get-dataset-items`** — endpoint นั้นคืน
  แค่ array ของข้อมูลที่ scrape ได้ ไม่มีราคาติดมาเลย ให้ใช้
  `POST /v2/acts/{actorId}/runs?waitForFinish=60` แทน (รอ run จบแล้วคืน run object ที่มี
  `usageTotalUsd` จริงในตัว, `id`, `defaultDatasetId` — ใช้ id ไปดึง dataset items ต่อ)
  ถ้า run ใช้เวลานานกว่า `waitForFinish`, poll ต่อที่
  `GET /v2/actor-runs/{runId}?waitForFinish=60` จนกว่า `status` จะ terminal
  (`SUCCEEDED`/`FAILED`/`TIMED-OUT`/`ABORTED`) — ทุก response มี `usageTotalUsd` ติดมา
  เสมอไม่ว่าจะจบแบบไหน
- **9arm**: เช็ค API/billing endpoint ของ 9arm เองว่าราคาจริงอยู่ตรงไหนในการตอบกลับ
  (หรือถามทีมที่ดูแล 9arm โดยตรง) แล้วส่งมาเหมือนกัน — **อย่าเดา field name เอง**

ถ้า provider ของคุณไม่ใช่ 3 ตัวข้างบนและไม่แน่ใจว่ามีราคาจริงให้ดึงไหม ให้เช็คเอกสาร
provider นั้นก่อนขึ้น production เสมอ — ระบบมีสูตรประมาณราคา fallback อยู่จริง (จาก
`model` + จำนวนโทเคน) แต่ **นั่นคือ safety net สำหรับ provider ที่หาราคาจริงไม่ได้จริงๆ
เท่านั้น ไม่ใช่ทางเลือกให้ข้ามขั้นตอนหาราคาจริง** — ถ้าปล่อยให้ estimate ทำงานทั้งที่จริง
หาราคาได้ รายงานจะไม่แม่น (`is_cost_estimated: true`) และเทียบข้ามโปรเจกต์ไม่ได้

- `cost_thb` ไม่ต้องคำนวณเอง ระบบแปลงให้อัตโนมัติจากเรทเงินจริงของธนาคารแห่งประเทศไทย
  (อัปเดตวันละครั้ง) — ไม่เกี่ยวกับกฎ "ห้ามประมาณ" ข้างบน (อันนั้นคือ `cost_usd`)

---

## 6) ครอบทุก call site จริงๆ — อย่าครอบแค่บางจุด

ถ้าโค้ดคุณมีหลายจุดที่เรียก provider จริง (เช่น หลายฟังก์ชัน หรือมี fallback หลายชั้น)
**ต้อง log ให้ครบทุกจุด รวมถึง error path ด้วย** ไม่ใช่แค่ตอน success — จุดที่มี
`try { ... } catch (e) { return null; }` แบบเงียบๆ ก็ต้อง log ใน catch ด้วยเช่นกัน
ไม่งั้น cost จะหายไปจากรายงานโดยไม่มีใครรู้ตัว

---

## 7) ทำไมควร log สดให้ครบตั้งแต่วันแรก ไม่ใช่ค่อยดึงย้อนหลังทีหลัง

หลาย provider (OpenRouter, Apify) มี API ให้ดึงประวัติการใช้งานย้อนหลังได้จริง แต่มี
ข้อจำกัดที่แก้ไม่ได้เสมอ — เช่น OpenRouter เก็บรายละเอียดระดับ transaction ให้แค่ 31 วัน
ล่าสุดเท่านั้น เก่ากว่านั้นเหลือแต่ยอดรวมแบบ aggregate ที่ไม่มี timestamp/id แม่นยำให้
**Log สดให้ครบทุก call site ตั้งแต่ต้นถูกกว่าและแม่นกว่าการค่อยไปดึงย้อนหลังทีหลังมาก**
— ถ้าจำเป็นต้องดึงย้อนหลังจริงๆ ให้ใช้ `request_id` ของแต่ละ log เป็น idempotency key
เทียบกับ id ที่ provider คืนมา (generation id, run id, ฯลฯ) เพื่อไม่ให้ backfill ซ้ำกับ
log สดที่มีอยู่แล้ว

---

## 8) ดูรายงาน

`https://digital.in.th/ai-usage` (ต้อง login sellcenter ก่อน — ถ้ายังไม่มีบัญชีติดต่อ
ทีม sellcenter) — filter ตามโปรเจกต์/provider/user/reference/ช่วงวันที่ได้, ดูแนวโน้ม
ค่าใช้จ่ายรายวัน, แยกตาม project/provider/model, แยกตาม user, และ log ล่าสุดแบบ
real-time

**ถ้ามีหลายโปรเจกต์แชร์ Hub เดียวกัน ควร filter ตาม `project` เสมอ** — ไม่งั้นแท็บ
"Logs" (เรียงใหม่→เก่าข้ามทุกโปรเจกต์) จะโดนโปรเจกต์ที่ log ถี่กว่าบังจนดูเหมือนข้อมูล
หาย ทั้งที่จริงๆ มีอยู่ (แท็บสรุป/breakdown ไม่โดนบัง เพราะ group ตาม project อยู่แล้ว)

---

## คำถามที่พบบ่อย

**Q: ยิง log พลาด/ระบบ AI Usage Hub ล่ม จะทำให้โปรแกรมหลักของฉันพังไหม?**
ไม่ควรพัง — ทำ fetch เป็น fire-and-forget (ไม่ต้อง await ผลลัพธ์ก่อนทำงานต่อ, ครอบด้วย
try/catch หรือ `.catch()` เสมอ) ตามตัวอย่างโค้ดด้านบน

**Q: ต้องยิงทุก request จริงหรือ ถ้ามีปริมาณเยอะมากจะช้าไหม?**
ยิงแบบ fire-and-forget ไม่ block และมี `/internal/ai-usage/logs/batch` ถ้าอยากรวมส่ง
ทีเดียวหลาย event ก็ได้ (ส่ง `{ "items": [...] }` แทน)

**Q: มี rate limit ฝั่ง AI Usage Hub ไหม?**
ไม่มีในตอนนี้ — ยิงได้ตามการใช้งานจริงของคุณ

**Q: token หาย/รั่วไหลทำยังไง?**
แจ้งทีม sellcenter ให้ rotate token ให้ — token เดิมจะใช้ไม่ได้ต่อจากนั้นทันที

**Q: ขอ token ได้จากไหน?**
ทีม sellcenter จะสร้างและส่งให้แยกตามระบบของคุณ ไม่ต้อง self-service สร้างเอง

---

มีคำถามเพิ่มเติมทักทีมสร้าง sellcenter ได้เลยครับ
