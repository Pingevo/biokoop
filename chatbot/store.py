"""MongoDB access — client singleton + collections ที่บอทใช้.

ใช้ MONGODB_URI เดียวกับ Node app (load .env จาก root ของ repo ใน app.py)
collection ที่แตะ: users, rawextractions, llmkeys, chatmessages (+ chatimages GridFS)
"""
from __future__ import annotations

import os

from gridfs import GridFS
from pymongo import MongoClient

_client: MongoClient | None = None


def db():
    """คืน default database จาก MONGODB_URI (ชี้ db ใน URI เดียวกับแอป Node)."""
    global _client
    if _client is None:
        uri = os.environ.get("MONGODB_URI", "").strip()
        if not uri:
            raise RuntimeError("ไม่มี MONGODB_URI ใน env")
        # tz_aware → datetime ที่อ่านกลับมี +00:00 ติด — isoformat() ส่งให้ frontend
        # ถูกตีความเป็น UTC จริง (ไม่ใช่ local) กันเวลาเพี้ยน -7 ชม.
        _client = MongoClient(uri, serverSelectionTimeoutMS=5000, tz_aware=True)
    return _client.get_default_database()


def users():
    return db()["users"]


def raw_extractions():
    return db()["rawextractions"]


def llm_keys():
    return db()["llmkeys"]


def chat_messages():
    return db()["chatmessages"]


def chatbot_config():
    """config ของบอท (persona ฯลฯ) — doc _id='persona' เขียนจากหน้า /chatpersona"""
    return db()["chatbotconfig"]


def chat_images_fs() -> GridFS:
    """GridFS bucket เก็บรูปที่ลูกค้าแนบในแชท (แยกจาก originals/original_images)."""
    return GridFS(db(), collection="chatimages")


def ensure_indexes() -> None:
    """สร้าง index ของ chatmessages ถ้ายังไม่มี (เรียกตอน startup)."""
    cm = chat_messages()
    cm.create_index([("sessionId", 1), ("createdAt", 1)])
    cm.create_index([("lineUserId", 1), ("createdAt", -1)])
