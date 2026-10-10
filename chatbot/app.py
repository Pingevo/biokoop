"""FastAPI service ของ health chatbot — bind localhost เท่านั้น (Express proxy เข้ามา).

รัน: cd chatbot && uvicorn app:app --host 127.0.0.1 --port 5001
env ที่ใช้ (อ่าน .env root repo): MONGODB_URI, LLMKEY_ENCRYPTION_KEY|SESSION_SECRET,
AI_USAGE_HUB_URL/TOKEN, CHAT_MODEL (optional)
"""
from __future__ import annotations

import base64
import binascii
import sys
from pathlib import Path

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from . import llm, store  # noqa: E402 — หลัง load_dotenv เสมอ

app = FastAPI(title="biokoop health chatbot", docs_url=None, redoc_url=None)


@app.on_event("startup")
def _startup() -> None:
    store.ensure_indexes()


class ChatImage(BaseModel):
    data: str                       # base64 (ไม่เอา data: prefix)
    mimeType: str = "image/jpeg"


class ChatRequest(BaseModel):
    lineUserId: str
    message: str = ""
    images: list[ChatImage] = Field(default_factory=list, max_length=4)
    sessionId: str | None = None
    adminUsername: str = ""
    task: str | None = None      # "food" = โหมดโภชนาการ (prompt แยก ไม่ดึงข้อมูลสุขภาพ)


@app.get("/health")
def health() -> dict:
    try:
        store.db().command("ping")
        mongo = True
    except Exception:
        mongo = False
    return {"ok": mongo, "mongo": mongo, "keys": _safe_key_count()}


def _safe_key_count() -> int:
    try:
        from . import keys
        return keys.active_key_count()
    except Exception:
        return -1


_MAX_IMAGE_BYTES = 8 * 1024 * 1024   # ต่อรูป


@app.post("/chat")
def chat(req: ChatRequest) -> dict:
    if not req.lineUserId.strip():
        raise HTTPException(400, "ต้องระบุ lineUserId")
    if not req.message.strip() and not req.images:
        raise HTTPException(400, "ต้องมีข้อความหรือรูปภาพอย่างน้อยอย่างหนึ่ง")

    # decode + เก็บรูปลง GridFS ก่อน — llm ได้ bytes พร้อม id สำหรับผูกกับ message
    images = []
    for im in req.images:
        try:
            raw = base64.b64decode(im.data, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(400, "รูปภาพ base64 ไม่ถูกต้อง")
        if len(raw) > _MAX_IMAGE_BYTES:
            raise HTTPException(400, f"รูปใหญ่เกิน {_MAX_IMAGE_BYTES // 1024 // 1024}MB")
        fid = store.chat_images_fs().put(
            raw, contentType=im.mimeType, lineUserId=req.lineUserId.strip())
        images.append({"id": str(fid), "data": raw, "mime": im.mimeType})

    try:
        return llm.ask(req.lineUserId.strip(), req.message.strip(),
                       req.sessionId, req.adminUsername or "admin", images,
                       task=req.task)
    except Exception as exc:
        print(f"[chat] ask failed: {exc}", file=sys.stderr)
        raise HTTPException(500, f"chat error: {type(exc).__name__}")


@app.get("/chat/images/{file_id}")
def chat_image(file_id: str) -> Response:
    """รูปที่แนบในแชท — stream จาก GridFS (Express proxy ให้ admin เท่านั้น)"""
    try:
        f = store.chat_images_fs().get(ObjectId(file_id))
    except Exception:
        raise HTTPException(404, "ไม่พบรูป")
    return Response(
        content=f.read(),
        media_type=f.content_type or "image/jpeg",
        headers={"Cache-Control": "private, max-age=3600"})


@app.get("/chat/users")
def chat_users() -> dict:
    """inbox ลูกค้า = users ทั้งหมด + lineUserId ที่เคยเห็นใน linemessagelogs
    sort: กิจกรรมล่าสุด (max ของแชททดสอบ, แชท LINE, extraction) ใหม่สุดก่อน"""
    ext = {r["_id"]: r for r in store.raw_extractions().aggregate([
        {"$match": {"status": "success"}},
        {"$group": {"_id": "$lineUserId", "count": {"$sum": 1},
                    "latest": {"$max": "$createdAt"}}},
    ])}
    chats = {c["_id"]: c for c in store.chat_messages().aggregate([
        {"$sort": {"createdAt": -1}},
        {"$group": {"_id": "$lineUserId",
                    "lastAt": {"$first": "$createdAt"},
                    "lastText": {"$first": "$text"},
                    "lastSession": {"$first": "$sessionId"},
                    "lastHasImg": {"$first": "$hasImages"},
                    "count": {"$sum": 1}}},
    ])}
    lines = {c["_id"]: c for c in store.db()["linemessagelogs"].aggregate([
        {"$match": {"channel": {"$ne": "sim"}}},   # แชท sim (testline/demo) ไม่นับเป็นกิจกรรม LINE จริง
        {"$sort": {"createdAt": -1}},
        {"$group": {"_id": "$lineUserId",
                    "lastAt": {"$first": "$createdAt"},
                    "lastText": {"$first": "$content"},
                    "lastType": {"$first": "$messageType"}}},
    ])}

    users = {u["lineUserId"]: u for u in store.users().find(
        {}, {"lineUserId": 1, "displayName": 1, "nickname": 1, "pictureUrl": 1})}
    all_ids = list(set(users) | set(lines))
    # เผื่อคนมี extraction แต่ไม่อยู่ใน users/ไม่เคยคุย LINE (edge case)
    all_ids += [i for i in ext if i not in all_ids]

    out = []
    for uid in all_ids:
        u = users.get(uid) or {}
        e = ext.get(uid) or {}
        c = chats.get(uid) or {}
        ln = lines.get(uid) or {}
        last_chat = c.get("lastAt")
        last_line = ln.get("lastAt")
        last_ext = e.get("latest")
        last_act = max([t for t in (last_chat, last_line, last_ext) if t], default=None)
        out.append({
            "lineUserId": uid,
            "extractionCount": e.get("count", 0),
            "latestExtractionAt": last_ext.isoformat() if last_ext else None,
            "displayName": u.get("displayName", ""),
            "nickname": u.get("nickname", ""),
            "pictureUrl": u.get("pictureUrl", ""),
            "chatCount": c.get("count", 0),
            "lastChatAt": last_chat.isoformat() if last_chat else None,
            "lastChatPreview": ("📷 รูปภาพ" if c.get("lastHasImg")
                                else c.get("lastText") or "")[:80],
            "lastSessionId": c.get("lastSession"),
            "lastLineAt": last_line.isoformat() if last_line else None,
            "lastLinePreview": (ln.get("lastText") or f"[{ln.get('lastType')}]" if ln.get("lastType") else "")[:80],
            "lastActivityAt": last_act.isoformat() if last_act else None,
        })
    out.sort(key=lambda u: u["lastActivityAt"] or "", reverse=True)
    return {"users": out}


@app.get("/chat/sessions")
def chat_sessions(lineUserId: str | None = None) -> dict:
    """session ล่าสุด — ส่ง lineUserId = เฉพาะลูกค้านั้น, ไม่ส่ง = ทุกลูกค้า (พร้อมชื่อกำกับ)"""
    match = {"$match": {"lineUserId": lineUserId}} if lineUserId else {"$match": {}}
    pipeline = [
        match,
        {"$group": {"_id": "$sessionId", "lastAt": {"$max": "$createdAt"},
                    "count": {"$sum": 1},
                    "lineUserId": {"$first": "$lineUserId"},
                    "firstText": {"$first": "$text"},
                    "adminUsername": {"$last": "$adminUsername"}}},
        {"$sort": {"lastAt": -1}},
        {"$limit": 50},
    ]
    rows = list(store.chat_messages().aggregate(pipeline))
    ids = list({r["lineUserId"] for r in rows if r.get("lineUserId")})
    users = {u["lineUserId"]: u for u in store.users().find(
        {"lineUserId": {"$in": ids}},
        {"lineUserId": 1, "displayName": 1, "nickname": 1})}
    return {"sessions": [
        {"sessionId": r["_id"], "lineUserId": r.get("lineUserId", ""),
         "customerName": (users.get(r.get("lineUserId")) or {}).get("nickname")
                         or (users.get(r.get("lineUserId")) or {}).get("displayName", ""),
         "messageCount": r["count"],
         "firstText": (r.get("firstText") or "")[:80],
         "adminUsername": r.get("adminUsername", ""),
         "lastAt": r["lastAt"].isoformat() if r.get("lastAt") else None}
        for r in rows]}


@app.get("/chat/thread")
def chat_thread(lineUserId: str = Query(...), sessionId: str | None = None) -> dict:
    """timeline รวม = แชท LINE จริง (linemessagelogs — โชว์อย่างเดียว) + ข้อความทดสอบของ session
    kind='line' → render read-only, ไม่เกี่ยวกับการส่งจากหน้านี้"""
    items = []
    cur = (store.db()["linemessagelogs"]
           .find({"lineUserId": lineUserId},
                 {"sendType": 1, "messageType": 1, "content": 1, "createdAt": 1, "channel": 1})
           .sort("createdAt", -1).limit(300))
    for m in cur:
        content = m.get("content") or ""
        is_img = m["messageType"] == "image" and content.startswith("http")
        items.append({
            "kind": "line",
            "side": "user" if m["sendType"] == "incoming" else "bot",
            "channel": m.get("channel") or "line",   # sim = ถูกดักโดย testline/demo ไม่ได้เข้า LINE จริง
            "type": m["messageType"],
            "text": "" if is_img else content,
            "imageUrl": content if is_img else "",
            "createdAt": m["createdAt"].isoformat() if m.get("createdAt") else None,
        })
    # sessionId มีค่า = เฉพาะ session นั้น / ไม่ส่ง = ทุก session ของลูกค้าคนนี้
    # ('__new__' = มุมมองแชทใหม่จากหน้าเว็บ — ไม่ match ข้อความใด เหลือแต่แชท LINE จริง)
    if sessionId != "__new__":
        q = {"sessionId": sessionId} if sessionId else {"lineUserId": lineUserId}
        cur2 = (store.chat_messages()
                .find(q)
                .sort("createdAt", 1).limit(500))
        for m in cur2:
            items.append({
                "kind": "chat",
                "side": "user" if m["role"] == "user" else "bot",
                "type": "image" if m.get("hasImages") else "text",
                "text": m["text"],
                "sessionId": m.get("sessionId", ""),
                "imageIds": m.get("imageIds", []),
                # draft = คำตอบที่บอทเตรียมเองจากข้อความ LINE จริง (auto-draft — ไม่ได้ส่งเข้า LINE)
                "draft": m.get("adminUsername") == "auto-draft",
                "createdAt": m["createdAt"].isoformat() if m.get("createdAt") else None,
                "meta": {k: m[k] for k in
                         ("rangeLabel", "extractionCount", "model", "keyLabel",
                          "promptTokens", "completionTokens", "durationMs", "error")
                         if k in m},
            })
    items.sort(key=lambda i: i["createdAt"] or "")
    return {"items": items}


@app.get("/chat/messages")
def chat_messages(sessionId: str = Query(...)) -> dict:
    """ข้อความทั้งหมดของ session เรียงเก่า→ใหม่"""
    cur = (store.chat_messages().find({"sessionId": sessionId})
           .sort("createdAt", 1).limit(500))
    out = []
    for m in cur:
        out.append({
            "role": m["role"], "text": m["text"],
            "imageIds": m.get("imageIds", []),
            "createdAt": m["createdAt"].isoformat() if m.get("createdAt") else None,
            "meta": {k: m[k] for k in
                     ("rangeLabel", "extractionCount", "model", "keyLabel",
                      "promptTokens", "completionTokens", "durationMs", "error")
                     if k in m},
        })
    return {"messages": out}
