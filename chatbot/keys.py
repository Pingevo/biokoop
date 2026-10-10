"""Gemini key pool — decrypt AES-256-GCM + round-robin เหมือน services/llmKeyService.js.

encKey format (base64): "iv:tag:ciphertext" — key = sha256(LLMKEY_ENCRYPTION_KEY
|| SESSION_SECRET || "dev-llmkey-secret-change-me") ต้องตรงกับฝั่ง Node เป๊ะ
round-robin: find_one_and_update sort lastUsedAt ขึ้น (null มาก่อน) — atomic เหมือนกัน
"""
from __future__ import annotations

import hashlib
import os
import sys
from base64 import b64decode
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pymongo import ReturnDocument

from . import store


def _secret() -> bytes:
    raw = (
        os.environ.get("LLMKEY_ENCRYPTION_KEY", "").strip()
        or os.environ.get("SESSION_SECRET", "").strip()
        or "dev-llmkey-secret-change-me"
    )
    return hashlib.sha256(raw.encode()).digest()


def decrypt_key(enc_key: str) -> str:
    """ivB64:tagB64:ctB64 → plaintext; ถอดไม่ได้ raise."""
    parts = str(enc_key).split(":")
    if len(parts) != 3:
        raise ValueError("รูปแบบ encKey ไม่ถูกต้อง")
    iv, tag, ct = (b64decode(p) for p in parts)
    return AESGCM(_secret()).decrypt(iv, ct + tag, None).decode()


def active_key_count() -> int:
    return store.llm_keys().count_documents({"isActive": True})


def pick_next_key() -> dict | None:
    """เลือก key ใบถัดไปแบบ round-robin (atomic) — คืน doc พร้อม encKey ที่ถอดแล้วใน _plain."""
    doc = store.llm_keys().find_one_and_update(
        {"isActive": True},
        {"$set": {"lastUsedAt": datetime.now(timezone.utc)}, "$inc": {"useCount": 1}},
        sort=[("lastUsedAt", 1)],
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        return None
    try:
        doc["_plain"] = decrypt_key(doc["encKey"])
    except Exception as exc:
        print(f"[KEYS] decrypt '{doc.get('label')}' ไม่สำเร็จ: {exc}", file=sys.stderr)
        mark_key_failure(doc["_id"], f"decrypt: {exc}")
        doc["_plain"] = ""
    return doc


def mark_key_success(key_id, model: str) -> None:
    try:
        store.llm_keys().update_one(
            {"_id": key_id},
            {"$set": {"lastError": "", "lastUsedModel": model or ""}},
        )
    except Exception:
        pass


def mark_key_failure(key_id, err: str) -> None:
    try:
        store.llm_keys().update_one(
            {"_id": key_id},
            {"$inc": {"failCount": 1}, "$set": {"lastError": str(err or "")[:500]}},
        )
    except Exception:
        pass
