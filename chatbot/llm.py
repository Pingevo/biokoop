"""ตอบคำถามสุขภาพจากข้อมูล raw extraction — parse ช่วงเวลา → ดึงข้อมูล → Gemini.

flow: parse_range → fetch rawextractions ของลูกค้าในช่วง → build context JSON +
system prompt → เรียก Gemini (round-robin key + failover) → save chatmessages → log usage
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types as genai_types

from . import keys, store
from .thai_range import parse_range

# ราคา gemini-*-flash-lite ต่อ 1M tokens (USD) — คำนวณ cost ส่ง ai-usage-hub
_COST_PER_M = {"prompt": 0.30, "output": 2.50}
_MAX_WEEKS = 12          # จำกัดจำนวนสัปดาห์ใน context กัน token พุ่ง
_HISTORY_TURNS = 8       # จำนวน turn ก่อนหน้าที่ส่งให้ model จำบทสนทนา
_BKK = timezone(timedelta(hours=7))  # format label วันเป็นเวลาไทย (Mongo เก็บ UTC instant)
_MAX_OUTPUT_TOKENS = 4096

_SYSTEM_PROMPT_TEMPLATE = """คุณชื่อ "{bot_name}" เป็นผู้ช่วยวิเคราะห์สุขภาพประจำ biokoop ตอบคำถามลูกค้าเป็นภาษาไทย
โดยอ้างอิงจากข้อมูลรายสัปดาห์ของนาฬิกา Kieslect (Body Load, Recovery, Sleep Quality) ที่แนบมาใน context เท่านั้น

ตัวตนและบุคลิกของคุณ: {persona}

กฎบังคับ:
- "{bot_name}" คือชื่อของคุณ (ผู้ช่วย) — ห้ามเรียกลูกค้าด้วยชื่อนี้เด็ดขาด
- การเรียกลูกค้า: เขียน "{{username}}" ทุกครั้งที่ต้องการเรียกชื่อลูกค้า (เช่น "สวัสดีค่ะ {{username}}") — ห้ามพิมพ์ชื่อจริงหรือแต่งชื่อเองเด็ดขาด ระบบจะแทนที่เป็น "คุณ+ชื่อจริง" อัตโนมัติ; ถ้า field "ลูกค้า" ใน context เป็น null ให้เรียกแค่ "คุณ" เท่านั้น — ห้ามใช้คำเรียกแทนอื่นเด็ดขาด เช่น "คุณผู้ชม" "คุณลูกค้า" "ท่าน"
- แสดงตัวเป็นตัวตนและบุคลิกนั้นตามธรรมชาติ — ห้ามพูดถึงว่าถูกตั้งค่า ถูกสั่ง หรือมีการกำหนดค่าใดๆ มาบังคับ
- ปิดท้ายทุกคำตอบด้วยข้อความเตือนสั้นๆ ว่า "คำตอบนี้มาจากบอทวิเคราะห์ข้อมูลเบื้องต้น ไม่ใช่คำวินิจฉัยของแพทย์ และไม่สามารถนำไปอ้างอิงทางการแพทย์ได้" — ทุกคำตอบไม่มีข้อยกเว้น
- ตอบจากข้อมูลใน context เท่านั้น ห้ามเดาหรือสร้างตัวเลข "ที่วัดได้" ที่ไม่มีในข้อมูล
- คำถามเชิงแนะนำ ("ควรทำยังไง" "ควรนอนกี่ชั่วโมง" "ต้องพักฟื้นไหม" "ออกกำลังกายหนักได้ไหม") ต้องตอบเจาะจงเป็นตัวเลข/ระดับที่แนะนำ — คำนวณจากข้อมูลจริงของลูกค้าเทียบกับเกณฑ์สุขภาพมาตรฐานทั่วไป เช่น ผู้ใหญ่ควรนอน 7–9 ชม./คืน, recovery ต่ำควรลดความหนัก — ระบุชัดว่าเป็นคำแนะนำที่คำนวณจากข้อมูลของลูกค้า ไม่ใช่คำวินิจฉัยแพทย์; แนวทางการคำนวณแบบนี้ "ไม่" ถือเป็นการเดาห้ามทำตามข้อด้านบน
- คำถามเรื่องควรนอนกี่ชั่วโมง → ตอบด้วยข้อความใน field "ชั่วโมงนอนที่แนะนำคืนนี้ (ใช้ข้อความนี้ตอบเลย)" เป็นหลักเสมอ (เช่น "คืนนี้ควรนอน 8 ชม. 15 นาที") พร้อมเล่าเหตุผลที่คำนวณไว้ต่อท้าย — ห้ามตอบเป็นช่วงกว้างๆ เช่น "7–9 ชม." หรือปัดเป็นชั่วโมงเต็มเองเด็ดขาด; ถ้า field นี้เป็น null (ไม่มีข้อมูลเลย) ค่อยตอบด้วยเกณฑ์ทั่วไป
- ถ้าไม่มีข้อมูลของช่วงเวลาที่ถาม ให้บอกตรงๆ ว่าไม่มีข้อมูลช่วงนั้น และบอกว่ามีข้อมูลช่วงไหนบ้าง
- ห้ามวินิจฉัยโรค ห้ามสั่งยา — ถ้าค่าผิดปกติหรือลูกค้ามีอาการน่าเป็นห่วง ให้แนะนำปรึกษาแพทย์
- อ้างอิง "ช่วงข้อมูล" (dataFrom–dataTo) ของแต่ละ record เสมอ ไม่ใช่วันที่ส่งภาพ
- record บางอันอาจซ้อนทับกัน (ลูกค้าส่งภาพถี่กว่า 7 วัน) — ให้ดูช่วงวันจริงของแต่ละชุด อย่านับ record เป็นสัปดาห์ถ้าช่วงซ้ำ
- วันเดียวกันอาจมีข้อมูลจากหลายชุด (ลูกค้าส่งซ้ำ) → ใช้ค่าจากชุดที่ "ส่งเข้าระบบล่าสุด" เสมอ — context มี "ตารางรายวันรวม" ที่ merge ตามกฎนี้ไว้แล้ว ให้ใช้ตารางนั้นเป็นคำตอบหลักของค่ารายวัน
- ถ้าลูกค้าส่งรูปภาพมา ให้อ่านข้อมูลสุขภาพในรูปแล้วเทียบ/ตอบร่วมกับข้อมูลใน context ได้
- ตอบเป็นภาษาไทยเท่านั้น — อนุญาตเฉพาะศัพท์เทคนิคภาษาอังกฤษ (เช่น HRV, REM, Body Load) ห้ามใช้คำภาษาอื่นปนในประโยค

การตีความช่วงเวลาที่ลูกค้าพูดถึง — ยึดตามนี้เสมอ:
- "ช่วงนี้ / ล่าสุด / ตอนนี้ / ช่วงล่าสุด" หมายถึง "ชุดข้อมูลล่าสุด" (ที่มี 'เป็นล่าสุด': true) เท่านั้น — ห้ามเลือกชุดเก่ากว่ามาตอบ
- "ดีขึ้นไหม / แย่ลงไหม / เทียบกับก่อน / เทรนด์ / เทียบช่วงนี้" = คำถามเชิงเปรียบเทียบ — เทียบ "ชุดข้อมูลล่าสุด" (ใหม่สุด) กับ "ชุดก่อนหน้าล่าสุด" (เก่ากว่าตามลำดับข้อมูล) เสมอ ไม่ว่าจะถามวันไหนก็ตาม เช่น มีข้อมูล 1–7 กับ 8–14 แล้วถามวันที่ 15 → เทียบ 8–14 (ใหม่) กับ 1–7 (เก่า)
- ดู "ข้อมูลเก่ามาแล้ว(วัน)" ของชุดที่ใช้ตอบเป็นหลัก: ถ้าชุดที่ใช้มีอายุ ≥ 3 วัน หรือ "ช่วงที่ถามมีข้อมูลบันทึกไหม" เป็น false → ต้องเปิดคำตอบด้วยการแจ้งชัดว่าใช้ข้อมูลช่วงไหนและเก่ามาแล้วกี่วัน เช่น "ข้อมูลที่ดิฉันใช้คือช่วง X–Y (เก่า N วันแล้วค่ะ)"; ถ้าชุดที่ใช้เก่าเกิน 7 วัน → ปิดท้ายชวนส่งภาพ Screenshot Kieslect ครบ 3 หน้าของช่วงปัจจุบันเสมอ
- ถ้า "จำนวนชุดข้อมูลที่ทับช่วงที่ถาม" เป็น 0 → ใช้โครงคำตอบนี้เสมอ (ห้ามตอบแค่ "ไม่มีข้อมูล" แล้วหยุด — ทุกคำถามสุขภาพต้องได้คำวิเคราะห์จากข้อมูลที่มี):
  1. แจ้งสั้นๆ ว่าช่วงที่ถามยังไม่มีข้อมูลบันทึก + ข้อมูลล่าสุดที่มีคือช่วงไหน (X–Y)
  2. ตอบคำถามจากชุดข้อมูลล่าสุดเต็มที่ เหมือนลูกค้าถามถึงช่วงนั้น — ใส่ตัวเลขจริง + คำนวณ/แนะนำเจาะจงตามคำถาม (ถ้าเป็นคำถามเทียบ ให้เทียบ 2 ชุดล่าสุดตามเดิม)
  3. ปิดท้ายชวนลูกค้าส่งภาพ Screenshot จากแอป Kieslect ครบ 3 หน้าของช่วงปัจจุบัน เพื่อวิเคราะห์ข้อมูลล่าสุดให้
- วันที่ลูกค้าถามดูจาก "ช่วงเวลาที่ลูกค้าถาม" ที่มีวันที่จริงกำกับ — ห้ามเดาว่า "เมื่อวาน/วันนี้" คือวันสุดท้ายของข้อมูลเด็ดขาด; ถ้าวันที่ถามไม่มีข้อมูล → บอกชัดว่า "เมื่อวานที่ X ยังไม่มีข้อมูล" ไม่ใช่เล่าข้อมูลวันสุดท้ายเหมือนเป็นวันที่ถาม
- ถ้าไม่มีข้อมูลเลยจริงๆ (ไม่มีชุดข้อมูลสักชุด) → บอกว่ายังไม่มีข้อมูล + ชวนส่งภาพ 3 หน้า — กรณีนี้เท่านั้นที่ไม่ต้องวิเคราะห์
- "วันนี้ / เมื่อคืน / เมื่อวาน / วันที่ X" = คำถามระดับวัน — ใช้ "ตารางรายวันรวม" เป็นหลัก (merge แล้ว วันซ้ำใช้ชุดล่าสุด) — มีเฉพาะวันที่มีข้อมูลจริง ไม่ต้องนับ index เอง:
  - ถ้าวันที่ถามมี row ใน "ตารางรายวันรวม" → ตอบค่าของ row นั้นตรงๆ โดยเอ่ยถึงแค่วันที่ถาม — ห้ามเอ่ยถึง "ช่วงข้อมูล"/"ช่วงวันที่" ของ record ในคำตอบระดับวัน
  - ถ้าวันที่ถามไม่มี row (จะอยู่ในช่วงข้อมูลแต่ค่าว่าง หรือไม่มีชุดครอบเลยก็ตาม) → บอกก่อนว่าวันที่ถามไม่มีข้อมูลบันทึก แล้วตอบคำถามด้วยข้อมูลชุดล่าสุดเต็มที่ (ค่าสรุป today/rings/avg30d และค่ารายวันของชุดนั้น) พร้อมบอกชัดว่าเป็นข้อมูลช่วงไหน + ชวนส่งภาพของช่วงปัจจุบัน
- "สัปดาห์นี้ / สัปดาห์ที่แล้ว / เดือนนี้ / N สัปดาห์ที่แล้ว" เช็คชุดที่ช่วงข้อมูลทับกับช่วงนั้น ไม่ใช่วันที่ส่งภาพ

รูปแบบคำตอบ — ลงลึกในข้อมูล ไม่ใช่แค่ภาพรวม:
- ใส่ตัวเลขจริงจากข้อมูลเสมอ: ค่า HRV (ms), หัวใจพัก (bpm), body load, recovery %, ชั่วโมงนอน, sleep stages (หลับตื้น/ลึก/REM/ตื่น เป็นชั่วโมงนาที), คะแนนนอน, ประสิทธิภาพนอน, high sleep stress
- เทียบ today vs compare (ค่าเฉลี่ย 30 วัน) ถ้ามี — บอกว่าดีกว่า/แย่กว่าค่าเฉลี่ยแค่ไหน
- ถ้ามี series รายวัน (charts) ให้บอกวันไหนดีสุด/แย่สุด และแนวโน้มขึ้น/ลง
- ถ้ามีหลายช่วงข้อมูล เทียบแนวโน้มระหว่างช่วง (ดีขึ้น/แย่ลง)
- จัดกลุ่มคำตอบตามหมวด: ภาระร่างกาย / การฟื้นตัว / คุณภาพการนอน — ตามที่คำถามเกี่ยวข้อง
- ตอบเป็นกันเองตามบุคลิกที่กำหนด
- ห้ามใช้สัญลักษณ์ markdown ทุกชนิด เช่น *, **, ***, #, ` — เขียนเป็นข้อความธรรมดาเท่านั้น เพราะแอปแชทไม่แสดงผล markdown
- แบ่งเป็นย่อหน้าสั้นๆ ตามเนื้อหา และถ้าจะทำรายการข้อ ให้ใช้ - นำหน้าแต่ละข้อ
"""

_PERSONA_DEFAULTS = {
    "bot_name": "biokoop",
    "persona": "ผู้ช่วยดูแลสุขภาพที่เป็นกันเอง สุภาพ อบอุ่น พูดจาสุภาพ ใช้คำลงท้าย \"ครับ/ค่ะ\" ตามบริบท เห็นใจและให้กำลังใจลูกค้าเสมอ",
}
_persona_cache: dict | None = None
_persona_cache_at = 0.0


# ระดับ slider จากหน้า /chatpersona (1–3) → directive ที่แทรกท้าย system prompt
_STYLE = {
    "friendliness": {
        1: "ใช้ภาษาทางการ สุภาพเรียบร้อย รักษาระยะห่างแบบมืออาชีพ ไม่เล่นมุก ไม่ใช้อีโมจิ",
        2: "ใช้ภาษาสุภาพเป็นมิตร คุยแบบผู้ช่วยที่น่าไว้ใจ",
        3: "ใช้ภาษาเป็นกันเองมาก อบอุ่น เหมือนเพื่อนที่ห่วงใย ใส่อีโมจิหรือคำอุทานได้พอเหมาะ",
    },
    "answer_length": {
        1: "ตอบสั้นที่สุดเท่าที่ตอบคำถามได้ 1–3 บรรทัด เน้นผลลัพธ์",
        2: "ตอบความยาวปานกลาง ครอบคลุมประเด็นหลัก ไม่ยืดยาว",
        3: "ตอบละเอียดเต็มที่ เจาะลึกตัวเลขทุกค่าที่เกี่ยวข้อง เปรียบเทียบ และให้คำแนะนำครบ",
    },
    "conciseness": {
        1: "เข้าประเด็นทันที ไม่เกริ่นนำ ไม่สรุปซ้ำท้ายคำตอบ",
        2: "เกริ่นสั้นๆ แล้วเข้าเนื้อหา",
        3: "อธิบายครบทุกมิติที่เกี่ยวข้อง ยอมยาวเพื่อความชัดเจน",
    },
}


def _lv3(v) -> int:
    """ระดับ slider 1–3, default 2 = กลาง"""
    return v if v in (1, 2, 3) else 2


def _get_persona() -> dict:
    """persona จาก chatbotconfig (หน้า /chatpersona เขียน — cache 60s)"""
    global _persona_cache, _persona_cache_at
    if time.monotonic() - _persona_cache_at > 60:
        try:
            doc = store.chatbot_config().find_one({"_id": "persona"}) or {}
            _persona_cache = {
                "bot_name": (doc.get("botName") or _PERSONA_DEFAULTS["bot_name"]).strip()[:60],
                "persona": (doc.get("persona") or _PERSONA_DEFAULTS["persona"]).strip()[:2000],
                "friendliness": _lv3(doc.get("friendliness")),
                "answer_length": _lv3(doc.get("answerLength")),
                "conciseness": _lv3(doc.get("conciseness")),
            }
        except Exception:
            _persona_cache = {**_PERSONA_DEFAULTS,
                              "friendliness": 2, "answer_length": 2, "conciseness": 2}
        _persona_cache_at = time.monotonic()
    return _persona_cache or _PERSONA_DEFAULTS


def _system_prompt() -> str:
    p = _get_persona()
    base = _SYSTEM_PROMPT_TEMPLATE.format(bot_name=p["bot_name"], persona=p["persona"])
    return base + (
        "\nสไตล์การตอบ (ค่าที่แอดมินปรับไว้ — ทำตามระดับนี้ทุกคำตอบ):\n"
        f"- โทนและความเป็นกันเอง: {_STYLE['friendliness'][p['friendliness']]}\n"
        f"- ความยาวคำตอบ: {_STYLE['answer_length'][p['answer_length']]}\n"
        f"- ความกระชับ: {_STYLE['conciseness'][p['conciseness']]}\n"
    )


_FOOD_PROMPT_TEMPLATE = """คุณคือ "{bot_name}" ผู้ช่วยวิเคราะห์โภชนาการอาหาร ตอบเป็นภาษาไทยเสมอ สุภาพ เป็นกันเอง ใช้ "ครับ/ค่ะ" ตามบริบท

กฎของโหมดวิเคราะห์อาหาร:
- "{bot_name}" คือชื่อของคุณ (ผู้ช่วย) — ห้ามเรียกลูกค้าด้วยชื่อนี้เด็ดขาด
- การเรียกลูกค้า: เขียน "{{username}}" ทุกครั้งที่ต้องการเรียกชื่อลูกค้า — ห้ามพิมพ์ชื่อจริงหรือแต่งชื่อเองเด็ดขาด ระบบจะแทนที่อัตโนมัติ; ถ้า field "ลูกค้า" เป็น null ให้เรียกแค่ "คุณ" เท่านั้น
- หน้าที่เดียวคือประเมินอาหาร/โภชนาการจากรูปหรือคำถามของลูกค้า — ทำตามรูปแบบที่ลูกค้ากำหนดในข้อความล่าสุดเคร่งครัด (ตารางรายชิ้น ตารางสรุป ฯลฯ)
- ถ้าลูกค้าถามค่าโภชนาการโดยไม่ได้แนบรูป → ประเมินจากชื่อเมนู/รายละเอียดที่ให้มาได้เลย พร้อมบอกว่าเป็นการประเมินคร่าวๆ ไม่ต้องขอรูปใหม่
- ห้ามแนะนำตัวเป็นผู้ช่วยสุขภาพ ห้ามพูดถึงนาฬิกา Kieslect ข้อมูลสุขภาพ การนอน การฟื้นตัว หรือชวนส่งภาพวิเคราะห์สุขภาพ
- ไม่ต้องใส่ disclaimer ทางการแพทย์ — ระบุแค่ว่าเป็นการประเมินจากภาพโดยประมาณ ตามที่ลูกค้ากำหนดรูปแบบไว้
- ห้ามใช้สัญลักษณ์ markdown ทุกชนิด เช่น *, **, ***, #, ` — เขียนเป็นข้อความธรรมดาเท่านั้น เพราะแอปแชทไม่แสดงผล markdown
"""


def _food_system_prompt() -> str:
    """system prompt เฉพาะโหมดโภชนาการ — แยกจากผู้ช่วยสุขภาพ ไม่ใช้ persona สุขภาพ"""
    return _FOOD_PROMPT_TEMPLATE.format(bot_name=_get_persona()["bot_name"])


def _chat_model() -> str:
    """model ของ chat — env CHAT_MODEL > config/llmExtractConfig.json > default"""
    m = os.environ.get("CHAT_MODEL", "").strip()
    if m:
        return m
    try:
        cfg = json.loads((Path(__file__).resolve().parent.parent
                          / "config" / "llmExtractConfig.json").read_text())
        return cfg.get("model", "gemini-3.5-flash-lite")
    except Exception:
        return "gemini-3.5-flash-lite"


def _log_usage(model: str, prompt_tokens: int, completion_tokens: int,
               duration_ms: int, status: str, reference: str,
               error_message: str | None = None) -> None:
    """fire-and-forget POST เข้า ai-usage-hub เหมือน services/aiUsageLogger.js"""
    url = os.environ.get("AI_USAGE_HUB_URL", "https://digital.in.th").rstrip("/")
    token = os.environ.get("AI_USAGE_HUB_TOKEN", "")
    if not url or not token:
        return
    payload = {
        "provider": "gemini",
        "model": model,
        "operation": "chat.ask",
        "source": "biokoopApp",
        "user": "chatbot-test",
        "reference": reference,
        "environment": os.environ.get("NODE_ENV", "production"),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost_usd": (prompt_tokens * _COST_PER_M["prompt"]
                     + completion_tokens * _COST_PER_M["output"]) / 1_000_000,
        "duration_ms": duration_ms,
        "status": status,
        "http_status": 200 if status == "success" else 500,
        "error_message": error_message,
        "raw_usage": {},
        "metadata": {},
    }
    def _send() -> None:
        try:
            req = urllib.request.Request(
                f"{url}/internal/ai-usage/logs",
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json",
                         "x-service-token": token,
                         "Authorization": f"Bearer {token}"},
            )
            urllib.request.urlopen(req, timeout=10).read()
        except Exception as exc:
            print(f"[ai-usage-hub] log failed: {exc}", file=sys.stderr)
    threading.Thread(target=_send, daemon=True).start()


def fetch_extractions(line_user_id: str, frm: datetime, to: datetime) -> list[dict]:
    """ดึง rawextractions ที่ช่วงข้อมูล "ทับ" กับช่วงที่ถาม — dataFrom ≤ to AND dataTo ≥ from
    fallback: record เก่าที่ยังไม่มี dataFrom/dataTo → เทียบ createdAt แทน"""
    cur = (store.raw_extractions()
           .find({"lineUserId": line_user_id, "status": "success",
                  "$or": [
                      {"dataFrom": {"$lte": to}, "dataTo": {"$gte": frm}},
                      {"dataTo": {"$exists": False}, "createdAt": {"$gte": frm, "$lte": to}},
                  ]},
                 {"rawResult": 1, "createdAt": 1, "weekOf": 1, "dataFrom": 1, "dataTo": 1})
           .sort("dataFrom", -1).limit(_MAX_WEEKS))
    docs = list(cur)
    docs.reverse()

    # ใส่ "2 ชุดล่าสุด" เข้า context เสมอ — คำถามเชิงเทียบ ("ช่วงนี้ดีขึ้น/แย่ลง")
    # ต้องมีทั้งชุดใหม่สุดและชุดก่อนหน้า แม้ช่วงที่ถามจะไม่ทับข้อมูลเก่าก็ตาม
    latest_docs = list(store.raw_extractions().find(
        {"lineUserId": line_user_id, "status": "success"},
        {"rawResult": 1, "createdAt": 1, "weekOf": 1, "dataFrom": 1, "dataTo": 1}
    ).sort("dataTo", -1).limit(2))
    have = {d["_id"] for d in docs}
    for d in reversed(latest_docs):  # ใส่เก่าก่อนเพื่อคงลำดับเวลา
        if d["_id"] not in have:
            docs.append(d)
    return docs


def _span(d: dict) -> str:
    """label ช่วงข้อมูลของ record — dataFrom→dataTo ถ้ามี ไม่งั้น createdAt (แสดงเวลาไทย)"""
    frm, to = d.get("dataFrom"), d.get("dataTo")
    if frm and to:
        s = frm.astimezone(_BKK).strftime("%d/%m/%y")
        e = to.astimezone(_BKK).strftime("%d/%m/%y")
        return s if s == e else f"{s} – {e}"
    return d["createdAt"].astimezone(_BKK).strftime("%d/%m/%y")


def _pick(arr, i):
    return arr[i] if isinstance(arr, list) and i < len(arr) else None


def _daily_rows(d: dict) -> list[dict]:
    """ตารางค่ารายวัน precompute ให้ model — index i = dataFrom + i วัน
    ข้ามวันที่ค่า null หมด (กัน LLM นับ index ผิด)"""
    rr = d.get("rawResult") or {}
    pg = rr.get("pages") or {}
    chB = (pg.get("body_load") or {}).get("charts") or {}
    chR = (pg.get("recovery") or {}).get("charts") or {}
    chS = (pg.get("sleep_quality") or {}).get("charts") or {}
    frm = d.get("dataFrom") or d["createdAt"]
    n = max(len(frm and rr.get("days") or []),
            round(((d.get("dataTo") or d["createdAt"]) - frm).total_seconds() / 86400) + 1, 1)
    rows = []
    for i in range(n):
        act_h, need_h = _pick(chS.get("hoursVsNeededSeries"), i), _pick(chS.get("hoursNeededSeries"), i)
        vals = {
            "bodyLoad": _pick(chB.get("bodyLoadSeries"), i),
            "recovery%": _pick(chR.get("recoverySeries"), i),
            "hrv": _pick(chR.get("hrvSeries"), i),
            "rhr": _pick(chR.get("rhrSeries"), i),
            "คุณภาพนอน%": _pick(chR.get("sleepQualitySeries"), i)
                          or _pick(chS.get("qualitySeries"), i),
            "ความสม่ำเสมอนอน%": _pick(chS.get("consistencySeries"), i),
        }
        # ชั่วโมงนอนแยกชัด 3 field: นอนจริง / ที่ต้องการ / %เทียบที่ต้องการ (คำนวณใน code)
        # series ที่ >14 = เป็น % มาอยู่แล้ว ไม่ใช่ชั่วโมง — ใส่เป็น % ตรงๆ
        if isinstance(act_h, (int, float)):
            if act_h <= 14:
                vals["ชม.นอนจริง"] = round(act_h, 2)
                if isinstance(need_h, (int, float)) and 0 < need_h <= 14:
                    vals["ชม.ที่ร่างกายต้องการ"] = round(need_h, 2)
                    vals["%นอนเทียบที่ต้องการ"] = round(act_h / need_h * 100)
            else:
                vals["%นอนเทียบที่ต้องการ"] = act_h
        vals = {k: v for k, v in vals.items() if v is not None}
        if vals:
            rows.append({"วันที่": (frm + timedelta(days=i)).astimezone(_BKK)
                                 .strftime("%d/%m/%y"),
                         **vals})
    return rows


def _merged_daily_rows(docs: list[dict]) -> list[dict]:
    """รวมตารางรายวันทุกชุดเป็น timeline เดียว — วันที่ซ้ำกันค่าจากชุดที่
    createdAt ล่าสุดชนะ (ต่อ field) — ใช้เป็นค่าตอบหลักตามกฎลูกค้าส่งซ้ำ"""
    by_day: dict[str, dict] = {}
    for d in sorted(docs, key=lambda x: x["createdAt"]):
        for row in _daily_rows(d):
            cur = by_day.setdefault(row["วันที่"], {"วันที่": row["วันที่"]})
            for k, v in row.items():
                if k != "วันที่":
                    cur[k] = v
    return sorted(by_day.values(),
                  key=lambda r: datetime.strptime(r["วันที่"], "%d/%m/%y"))


def _num(v) -> float | None:
    """แปลงค่า rawResult เป็น float — รองรับตัวเลข, "64", "8:17" (→8.28), % unit"""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if ":" in s:
        try:
            h, m = s.split(":")[:2]
            return int(h) + int(m) / 60
        except ValueError:
            return None
    try:
        return float(re.sub(r"[^\d.]", "", s))
    except ValueError:
        return None


def _last_num(arr) -> float | None:
    """ค่าตัวเลขตัวสุดท้ายที่ไม่ null ใน series (series มีช่องว่างระหว่างวัน)"""
    for v in reversed(arr or []):
        n = _num(v)
        if n is not None:
            return n
    return None


def _recommended_sleep(d: dict | None) -> dict | None:
    """ชั่วโมงนอนแนะนำคืนนี้ คำนวณจากชุดข้อมูลล่าสุด (deterministic — model แค่เล่า)
    base = ชั่วโมงที่ร่างกายต้องการ (นาฬิกาคำนวณ, default 8) + ชดเชยหนี้นอน 50% (cap 1:30)
    + ปรับตาม recovery ต่ำ / bodyLoad สูง / stress ตอนนอน / หลับลึก+REM น้อย / efficiency ต่ำ
    clamp 7:00–9:30 ปัดขึ้นช่วง 15 นาที"""
    if not d:
        return None
    pg = (d.get("rawResult") or {}).get("pages") or {}
    sl, rec, bl = pg.get("sleep_quality") or {}, pg.get("recovery") or {}, pg.get("body_load") or {}
    chS = sl.get("charts") or {}

    base_m = int(round((_last_num(chS.get("hoursNeededSeries")) or 8.0) * 60))
    reasons = [f"เป้าหมายพื้นฐาน {base_m // 60} ชม. (ค่าที่นาฬิกาคำนวณให้ร่างกาย)"]

    # หนี้นอนสะสม — series ต้องเป็นหน่วยชั่วโมง (≤14) ถ้าเป็น % ข้าม
    need, act = chS.get("hoursNeededSeries") or [], chS.get("hoursVsNeededSeries") or []
    debt = 0.0
    for n_raw, a_raw in zip(need, act):
        n, a = _num(n_raw), _num(a_raw)
        if n is not None and a is not None and n <= 14 and a <= 14:
            debt += max(0.0, n - a)
    repay = min(debt * 0.5, 1.5)
    total_m = base_m + int(round(repay * 60))
    if repay > 0:
        reasons.append(f"ชดเชยหนี้นอนสะสม {debt:.1f} ชม. (คืน 50%)")

    rc = _num((rec.get("rings") or {}).get("recoveryPercent"))
    if rc is not None and rc < 50:
        add = 60 if rc < 30 else 30
        total_m += add
        reasons.append(f"การฟื้นตัว{'ต่ำมาก' if rc < 30 else 'ต่ำ'} {rc:g}% +{add} นาที")

    blv = _last_num((bl.get("charts") or {}).get("bodyLoadSeries")) \
        or _num(((bl.get("rings") or {}).get("bodyLoad") or {}).get("value"))
    if blv is not None and blv > 80:
        add = 45 if blv > 90 else 30
        total_m += add
        reasons.append(f"ภาระร่างกาย{'สูงมาก' if blv > 90 else 'สูง'} {blv:g} +{add} นาที")

    today = sl.get("today") or {}
    hs = _num(today.get("highStressPercent"))
    if hs is not None and hs > 15:
        total_m += 30
        reasons.append(f"ความเครียดขณะนอนสูง {hs:g}% +30 นาที")

    st = sl.get("sleepStages") or {}
    deep, rem = _num((st.get("deep") or {}).get("percent")), _num((st.get("rem") or {}).get("percent"))
    if deep is not None and rem is not None and deep + rem < 25:
        total_m += 30
        reasons.append(f"หลับลึก+REM รวมแค่ {deep + rem:g}% (<25%) +30 นาที")

    eff = _num(today.get("efficiencyPercent"))
    if eff is not None and eff < 85:
        total_m += 15
        reasons.append(f"ประสิทธิภาพการนอน {eff:g}% (<85%) +15 นาที")

    total_m = min(570, max(420, -(-total_m // 15) * 15))  # clamp 7:00–9:30, ปัดขึ้น 15 นาที
    h, m = divmod(total_m, 60)
    return {"คำตอบที่ต้องใช้": f"{h} ชม." + (f" {m} นาที" if m else ""),
            "ชั่วโมงนาที": f"{h}:{m:02d}", "ปัจจัยที่คำนวณ": reasons}


def list_weeks_available(line_user_id: str) -> list[str]:
    """ช่วงข้อมูลทั้งหมดของลูกค้า (เอาไว้บอกว่ามีข้อมูลช่วงไหนบ้าง)."""
    cur = (store.raw_extractions()
           .find({"lineUserId": line_user_id, "status": "success"},
                 {"createdAt": 1, "dataFrom": 1, "dataTo": 1})
           .sort("createdAt", 1))
    return [_span(d) for d in cur]


def _recent_history(session_id: str) -> list[dict]:
    """turn ล่าสุดของ session (เก่า→ใหม่) จำกัด _HISTORY_TURNS — ใส่ multi-turn memory"""
    cur = (store.chat_messages()
           .find({"sessionId": session_id}, {"role": 1, "text": 1})
           .sort("createdAt", -1).limit(_HISTORY_TURNS))
    msgs = list(cur)
    msgs.reverse()
    return msgs


def _save_message(session_id: str, line_user_id: str, admin: str,
                  role: str, text: str, meta: dict | None = None) -> None:
    doc = {
        "sessionId": session_id,
        "lineUserId": line_user_id,
        "adminUsername": admin,
        "role": role,
        "text": text,
        "createdAt": datetime.now(timezone.utc),
    }
    if meta:
        doc.update(meta)
    try:
        store.chat_messages().insert_one(doc)
    except Exception as exc:
        print(f"[chat] save message failed: {exc}", file=sys.stderr)


def _extract_json_obj(text: str) -> str | None:
    """ดึง JSON object แรกที่ปีกกาบาลานซ์ — กันกรณี model มีข้อความคั่นหน้า/ต่อท้าย"""
    start = (text or "").find("{")
    if start < 0:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start:i + 1]
    return text[start:]  # output ถูกตัดกลาง → ส่งท้ายทั้งหมดให้ json.loads ฟาดเส้นเอง


def _parse_food_json(text: str) -> dict | None:
    """ดึง JSON ผลวิเคราะห์อาหารจากคำตอบ model — {"error": ...} หรือ {menu, items, total}"""
    raw = _extract_json_obj(text)
    if not raw:
        return None
    try:
        d = json.loads(raw)
    except Exception:
        return None
    if not isinstance(d, dict):
        return None
    if d.get("error"):
        return d
    if not isinstance(d.get("items"), list) or not d["items"]:
        return None
    return d


# คำไทย/คำเรียกที่ขึ้นต้นด้วย "คุณ" แต่ไม่ใช่ชื่อลูกค้า — ห้ามแก้ (เช่น คุณภาพการนอน, ปรึกษาคุณหมอ)
_NAME_WHITELIST = ("คุณภาพ", "คุณค่า", "คุณสมบัติ", "คุณลักษณะ", "คุณประโยชน์",
                   "คุณวุฒิ", "คุณธรรม", "คุณูปการ", "คุณหมอ", "คุณพ่อ", "คุณแม่",
                   "คุณพี่", "คุณน้อง", "คุณปู่", "คุณย่า", "คุณตา", "คุณยาย",
                   "คุณลุง", "คุณป้า", "คุณนาย", "คุณครู")
# คำเรียกแทนที่ model เผลอแต่งเอง — ไม่ใช่ชื่อจริง ต้องแก้เป็น "คุณ{ชื่อจริง}" หรือ "คุณ" เสมอ
# (startswith เพราะอาจต่อท้าย เช่น "คุณผู้ชมทุกท่าน"; ไม่ใส่ "คุณทุก*" กันชน "คุณทุกข์")
_NAME_BAD = ("คุณผู้ชม", "คุณลูกค้า", "คุณท่าน", "คุณผู้ใช้", "คุณคนไข้",
             "คุณผู้ฟัง")
_NAME_RE = re.compile(r"คุณ\s?([A-Za-zก-๙0-9]{1,20})")


def _fix_customer_name(answer: str, customer_name: str | None) -> str:
    """แก้ 'คุณX' ในคำตอบให้ตรงชื่อเล่นจริง — ย้ำ deterministic หลัง LLM ตอบ"""
    def _sub(m: re.Match) -> str:
        full = m.group(0).replace(" ", "")
        if any(full.startswith(b) for b in _NAME_BAD):
            return f"คุณ{customer_name}" if customer_name else "คุณ"
        if any(full.startswith(w) for w in _NAME_WHITELIST):
            return m.group(0)
        name = m.group(1)
        if customer_name:
            # ถูกอยู่แล้ว / ชื่อมั่ว → แก้เป็นชื่อเล่นจริงเสมอ
            return m.group(0) if name == customer_name else f"คุณ{customer_name}"
        # ไม่มีชื่อจริง — แก้เฉพาะ capture ที่เป็น Latin/ตัวเลข (uid/ชื่อระบบ)
        # ส่วน capture ไทยปล่อยไว้ เผื่อเป็นคำทั่วไปที่ whitelist ไม่ครอบ
        return "คุณ" if re.fullmatch(r"[A-Za-z0-9]+", name) else m.group(0)
    return _NAME_RE.sub(_sub, answer)


def _food_text(d: dict) -> str:
    """แปลง JSON ผลวิเคราะห์อาหารเป็นข้อความอ่านง่าย (เก็บใน history + ใช้เป็น fallback)"""
    lines = [f"🍽️ เมนู: {d.get('menu') or 'อาหารในรูป'}", "", "📋 ส่วนประกอบรายชิ้น"]
    for it in d.get("items", []):
        lines.append(
            f"- {it.get('name', '?')} {it.get('gram', 0)}g | {it.get('kcal', 0)} kcal"
            f" | carb {it.get('carb', 0)}g protein {it.get('protein', 0)}g fat {it.get('fat', 0)}g")
    t = d.get("total") or {}
    lines += ["", "📊 สรุปรวมทั้งจาน",
              f"รวม {t.get('gram', 0)}g | {t.get('kcal', 0)} kcal"
              f" | carb {t.get('carb', 0)}g protein {t.get('protein', 0)}g fat {t.get('fat', 0)}g",
              f"ไขมันอิ่มตัว {t.get('satFat', 0)}g | ไขมันไม่อิ่มตัว {t.get('unsatFat', 0)}g"
              f" | น้ำตาล {t.get('sugar', 0)}g | โซเดียม {t.get('sodium', 0)}mg | ใยอาหาร {t.get('fiber', 0)}g"]
    if d.get("note"):
        lines += ["", str(d["note"])]
    lines += ["", "(ประเมินจากภาพเทียบขนาดมาตรฐาน — ค่าจริงอาจต่างเล็กน้อย)"]
    return "\n".join(lines)


def _gemini_answer(api_key: str, model: str, contents: list,
                   task: str | None = None) -> tuple[str, dict]:
    """ยิง Gemini 1 ครั้ง — คืน (text, usage_dict); raise เมื่อพัง"""
    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model=model,
        contents=contents,
        config=genai_types.GenerateContentConfig(
            system_instruction=(_food_system_prompt() if task == "food"
                                else _system_prompt()),
            max_output_tokens=_MAX_OUTPUT_TOKENS,
        ),
    )
    usage = getattr(resp, "usage_metadata", None)
    return (resp.text or "").strip(), {
        "prompt_tokens": getattr(usage, "prompt_token_count", 0) or 0,
        "completion_tokens": getattr(usage, "candidates_token_count", 0) or 0,
    }


def ask(line_user_id: str, message: str, session_id: str | None,
        admin: str, images: list[dict] | None = None,
        task: str | None = None) -> dict[str, Any]:
    """ตอบคำถาม 1 turn — images = [{"id": gridfs_id, "data": bytes, "mime": str}] (optional)
    task="food" = โหมดโภชนาการ (prompt แยก ไม่ดึง extraction context)
    คืน dict พร้อม answer + meta สำหรับหน้าบ้าน"""
    started = time.monotonic()
    session_id = session_id or uuid.uuid4().hex[:12]
    images = images or []

    user_doc = store.users().find_one({"lineUserId": line_user_id},
                                      {"displayName": 1, "nickname": 1})
    _raw_name = (((user_doc or {}).get("nickname") or "").strip()
                 or ((user_doc or {}).get("displayName") or "").strip())
    # ไม่มีชื่อจริง/เป็นชื่อระบบ (uid ดิบ, userbot, test) → None — prompt จะสั่งให้เรียก "คุณ" เฉยๆ
    customer_name = (
        None if (not _raw_name or _raw_name == line_user_id
                 or re.search(r"userbot|testline|ทดสอบ|test[_-]?script", _raw_name, re.I))
        else _raw_name
    )

    if task == "food":
        rng = None
        docs_sorted = []
        context = {
            "ลูกค้า": customer_name,
            "หมายเหตุ": "ลูกค้าอยู่ในโหมดวิเคราะห์โภชนาการอาหาร — ทำตามรูปแบบที่สั่งในข้อความเท่านั้น ไม่ต้องอ้างหรือพูดถึงข้อมูลสุขภาพ",
        }
    else:
        rng = parse_range(message or "")  # ข้อความว่าง (ส่งแต่รูป) → default 4 สัปดาห์
        docs = fetch_extractions(line_user_id, rng["from"], rng["to"])

        # anchor ชุดล่าสุด/ชุดก่อนหน้าให้ model ชัดเจน — กันมันเลือกชุดเก่ามาตอบคำว่า "ช่วงนี้/ล่าสุด"
        docs_sorted = sorted(docs, key=lambda d: d.get("dataTo") or d["createdAt"])
        latest = docs_sorted[-1] if docs_sorted else None
        prev = docs_sorted[-2] if len(docs_sorted) > 1 else None

        def _in_range(d: dict) -> bool:
            frm_d = d.get("dataFrom") or d["createdAt"]
            to_d = d.get("dataTo") or d["createdAt"]
            return frm_d <= rng["to"] and to_d >= rng["from"]

        # อายุข้อมูลนับจากวันสุดท้ายของแต่ละชุด (dataTo = วันที่ในภาพ ไม่ใช่เวลาอัปโหลด)
        def _age_days(d: dict) -> int:
            t = d.get("dataTo") or d["createdAt"]
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - t).days

        _stale_days = _age_days(latest) if latest else None
        _overlap = sum(1 for d in docs_sorted if _in_range(d))
        # คำแนะนำชั่วโมงนอนเป็น string เดียว (คำตอบอยู่หน้าสุด) — กัน model หยิบข้อความในปัจจัยไปตอบ
        _rec = _recommended_sleep(latest)
        _rec_txt = (f"คืนนี้ควรนอน {_rec['คำตอบที่ต้องใช้']} — คำนวณจาก: "
                    + "; ".join(_rec["ปัจจัยที่คำนวณ"])) if _rec else None
        # label ช่วงที่ถามพร้อมวันที่จริง — กัน model เดาเอาเองว่า "เมื่อวาน" = วันสุดท้ายของข้อมูล
        _rf = rng["from"].astimezone(_BKK).strftime("%d/%m/%y")
        _rt = (rng["to"] - timedelta(seconds=1)).astimezone(_BKK).strftime("%d/%m/%y")
        _range_lbl = f'{rng["label"]} ({_rf})' if _rf == _rt else f'{rng["label"]} ({_rf} – {_rt})'
        context = {
            "ลูกค้า": customer_name,
            "วันนี้ (เวลาไทย)": datetime.now(_BKK).strftime("%d/%m/%y"),
            "ช่วงเวลาที่ลูกค้าถาม": _range_lbl,
            "หมายเหตุ": "แต่ละ record: 'ช่วงข้อมูล' คือวันที่ข้อมูลครอบคลุมจริง (อาจซ้อนกัน), 'ส่งเข้าระบบเมื่อ' คือเวลาอัปโหลดซึ่งไม่ใช่ความใหม่ของข้อมูล (ลูกค้าอาจส่งภาพข้อมูลเก่าย้อนหลัง), 'ข้อมูลเก่ามาแล้ว(วัน)' คืออายุข้อมูลจริงของชุดนั้น — วันที่ซ้อนหลายชุดให้ใช้ชุดที่ส่งเข้าระบบล่าสุด (ดู 'ตารางรายวันรวม') และคำว่า 'ข้อมูลล่าสุด' ในคำตอบต้องหมายถึงชุดที่ 'ข้อมูลใหม่สุดในระบบ' เท่านั้น",
            "ช่วงที่ถามมีข้อมูลบันทึกไหม": _overlap > 0,
            "จำนวนชุดข้อมูลที่ทับช่วงที่ถาม": _overlap,
            "ข้อมูลใหม่สุดในระบบเก่ามาแล้ว(วัน)": _stale_days,
            "ชุดที่ข้อมูลใหม่สุด": _span(latest) if latest else None,
            "ชุดก่อนหน้านั้น": _span(prev) if prev else None,
            "ชั่วโมงนอนที่แนะนำคืนนี้ (ใช้ข้อความนี้ตอบเลย)": _rec_txt,
            "ตารางรายวันรวม": _merged_daily_rows(docs_sorted),
            "ชุดข้อมูล": [
                {"ช่วงข้อมูล": _span(d),
                 "ทับช่วงที่ถาม": _in_range(d),
                 "ข้อมูลใหม่สุดในระบบ": d is latest,
                 "ข้อมูลเก่ามาแล้ว(วัน)": _age_days(d),
                 "ส่งเข้าระบบเมื่อ": d["createdAt"].astimezone(_BKK)
                                       .strftime("%d/%m/%y %H:%M"),
                 "ค่ารายวัน": _daily_rows(d),
                 "ข้อมูล": d.get("rawResult")} for d in docs_sorted
            ],
            "ช่วงข้อมูลทั้งหมดที่มีในระบบ": list_weeks_available(line_user_id),
        }

    contents: list = []
    for m in _recent_history(session_id):
        role = "user" if m["role"] == "user" else "model"
        contents.append(genai_types.Content(role=role,
                                            parts=[genai_types.Part(text=m["text"])]))
    user_text = (f"[CONTEXT]\n{json.dumps(context, ensure_ascii=False, default=str)}\n"
                 f"[/CONTEXT]\n\nคำถามลูกค้า: "
                 f"{message or '(ลูกค้าส่งรูปภาพมาโดยไม่ได้พิมพ์ข้อความ — ช่วยอ่านและสรุปข้อมูลสุขภาพในรูป)'}")
    user_parts = [genai_types.Part.from_bytes(data=im["data"], mime_type=im["mime"])
                  for im in images]
    user_parts.append(genai_types.Part(text=user_text))
    contents.append(genai_types.Content(role="user", parts=user_parts))

    model = _chat_model()
    meta = {
        "rangeLabel": rng["label"] if rng else (task or ""),
        "rangeFrom": rng["from"] if rng else None,
        "rangeTo": rng["to"] if rng else None,
        "extractionIds": [str(d["_id"]) for d in docs_sorted],
        "extractionCount": len(docs_sorted),
        "model": model,
    }

    user_meta = None
    if images:
        user_meta = {"imageIds": [im["id"] for im in images], "hasImages": True}
    _save_message(session_id, line_user_id, admin, "user",
                  message or f"(แนบรูปภาพ {len(images)} ใบ)", user_meta)

    attempts = max(1, keys.active_key_count())
    answer, usage, key_label = "", {"prompt_tokens": 0, "completion_tokens": 0}, ""
    last_err: Exception | None = None
    for _ in range(min(attempts, 5)):
        k = keys.pick_next_key()
        if not k:
            last_err = RuntimeError("ไม่มี Gemini key ที่ใช้งานได้")
            break
        key_label = k.get("label", "")
        plain = k.get("_plain", "")
        if not plain:
            continue
        try:
            answer, usage = _gemini_answer(plain, model, contents, task)
            keys.mark_key_success(k["_id"], model)
            last_err = None
            break
        except Exception as exc:
            last_err = exc
            keys.mark_key_failure(k["_id"], str(exc)[:300])
            print(f"[chat] key '{key_label}' failed: {exc}", file=sys.stderr)

    duration_ms = int((time.monotonic() - started) * 1000)
    meta.update({"keyLabel": key_label,
                 "promptTokens": usage["prompt_tokens"],
                 "completionTokens": usage["completion_tokens"],
                 "durationMs": duration_ms})

    if last_err:
        answer = "ขออภัยค่ะ ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งค่ะ"
        meta["error"] = str(last_err)[:300]

    # food mode: model ตอบ JSON → meta.foodData ให้ฝั่ง Node เรนเดอร์เป็นการ์ดภาพ,
    # ส่วน answer เก็บเป็นข้อความอ่านง่าย (history + fallback ถ้าเรนเดอร์พลาด)
    if task == "food" and not last_err:
        food = _parse_food_json(answer)
        if food:
            if food.get("error"):
                answer = (f"ขออภัยครับ ประเมินรูปนี้ไม่ได้ ({food['error']}) "
                          "ลองส่งรูปที่เห็นอาหารชัดๆ อีกครั้งนะครับ")
            else:
                meta["foodData"] = food
                answer = _food_text(food)

    if answer:
        # model เขียน {username} เป็นตัวแทนชื่อลูกค้า (ดู prompt) → แทนด้วย "คุณ+ชื่อจริง"
        # regex กันเคส model เผลอเขียน "คุณ{username}" ติดกันมาด้วย
        display = f"คุณ{customer_name}" if customer_name else "คุณ"
        answer = re.sub(r"(คุณ\s*)?\{\s*username\s*\}", display, answer, flags=re.I)
        answer = _fix_customer_name(answer, customer_name)

    _save_message(session_id, line_user_id, admin, "assistant", answer, meta)
    _log_usage(model, usage["prompt_tokens"], usage["completion_tokens"],
               duration_ms, "success" if not last_err else "error",
               f"chatbot:{line_user_id}", str(last_err)[:300] if last_err else None)

    return {"ok": not last_err, "sessionId": session_id, "answer": answer,
            "meta": {**meta,
                     "rangeFrom": rng["from"].isoformat() if rng else None,
                     "rangeTo": rng["to"].isoformat() if rng else None}}
