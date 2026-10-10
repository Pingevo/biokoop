"""แปลงคำถามภาษาไทยเป็นช่วงเวลา (from,to) — default สัปดาห์ล่าสุด.

ใช้ pythainlp word_tokenize แยกคำก่อนจับกฎ — รองรับ "วันนี้/เมื่อวาน/
สัปดาห์นี้/สัปดาห์ที่แล้ว/เดือนนี้/เดือนที่แล้ว/ปีนี้/N สัปดาห์/N เดือน/N วัน/ทั้งหมด
และวันที่เจาะจง "3 ตุลาคม" / "3 ต.ค. 69" / "3/10" / "3-10-2569"
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from pythainlp import word_tokenize

_BANGKOK = timezone(timedelta(hours=7))

_THAI_MONTHS = {
    "มกราคม": 1, "ม.ค.": 1, "มค": 1,
    "กุมภาพันธ์": 2, "ก.พ.": 2, "กพ": 2,
    "มีนาคม": 3, "มี.ค.": 3, "มีค": 3,
    "เมษายน": 4, "เม.ย.": 4, "เมย": 4,
    "พฤษภาคม": 5, "พ.ค.": 5, "พค": 5,
    "มิถุนายน": 6, "มิ.ย.": 6, "มิย": 6,
    "กรกฎาคม": 7, "ก.ค.": 7, "กค": 7,
    "สิงหาคม": 8, "ส.ค.": 8, "สค": 8,
    "กันยายน": 9, "ก.ย.": 9, "กย": 9,
    "ตุลาคม": 10, "ต.ค.": 10, "ตค": 10,
    "พฤศจิกายน": 11, "พ.ย.": 11, "พย": 11,
    "ธันวาคม": 12, "ธ.ค.": 12, "ธค": 12,
}
_THAI_MONTH_RE = "|".join(sorted(_THAI_MONTHS, key=len, reverse=True))
_MONTH_TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
             "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]


def _thai_year(y: int, now: datetime) -> int:
    """แปลงปีที่ลูกค้าพิมพ์ → ค.ศ. — พ.ศ. (>2400 หรือ 2 หลัก ≥50) ลบ 543, เว้นปีใช้ปีปัจจุบัน"""
    if y is None:
        return now.year
    if y >= 2400:
        return y - 543
    if y >= 50 and y < 100:      # 69 → พ.ศ. 2569 → ค.ศ. 2026
        return y + 1957
    if y < 100:                  # 26 → ค.ศ. 2026
        return y + 2000
    return y


def _explicit_date(joined: str, now: datetime) -> tuple[str, datetime, datetime] | None:
    """จับวันที่เจาะจง "3 ตุลาคม", "3 ต.ค. 69", "3/10", "3/10/2569" → (label, from, to)"""
    m = re.search(rf"(\d{{1,2}})\s*({_THAI_MONTH_RE})\s*(\d{{2,4}})?", joined)
    if m:
        day, month, yr = int(m.group(1)), _THAI_MONTHS[m.group(2)], m.group(3)
        try:
            d = datetime(_thai_year(int(yr) if yr else None, now), month, day,
                         tzinfo=_BANGKOK)
        except ValueError:
            return None
        if d > now + timedelta(days=1):        # ไม่ระบุปีแล้วได้วันในอนาคต → หมายถึงปีก่อน
            d = d.replace(year=d.year - 1)
        end = min(d + timedelta(days=1), now)
        return (f"วันที่ {day} {_MONTH_TH[month]}", d, end)
    m = re.search(r"(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?", joined)
    if m:
        day, month, yr = int(m.group(1)), int(m.group(2)), m.group(3)
        if 1 <= day <= 31 and 1 <= month <= 12:
            try:
                d = datetime(_thai_year(int(yr) if yr else None, now), month, day,
                             tzinfo=_BANGKOK)
            except ValueError:
                return None
            if d > now + timedelta(days=1):
                d = d.replace(year=d.year - 1)
            end = min(d + timedelta(days=1), now)
            return (f"วันที่ {day} {_MONTH_TH[month]}", d, end)
    return None

_THAI_NUM = {
    "หนึ่ง": 1, "สอง": 2, "สาม": 3, "สี่": 4, "ห้า": 5,
    "หก": 6, "เจ็ด": 7, "แปด": 8, "เก้า": 9, "สิบ": 10,
    "๑": 1, "๒": 2, "๓": 3, "๔": 4, "๕": 5,
    "๖": 6, "๗": 7, "๘": 8, "๙": 9, "๑๐": 10, "สิบสอง": 12,
}


def _now() -> datetime:
    return datetime.now(_BANGKOK)


def _start_of_day(dt: datetime) -> datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _months_back(n: int, now: datetime) -> datetime:
    """ย้อน N เดือนแบบปฏิทิน (ไม่ใช้ dateutil) — clamp วันที่ปลายเดือน."""
    y, m = now.year, now.month - n
    while m < 1:
        m += 12
        y -= 1
    day = min(now.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28,
                        31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return now.replace(year=y, month=m, day=day)


def _num_of(tok: str) -> int | None:
    tok = tok.strip()
    if tok.isdigit():
        return int(tok)
    return _THAI_NUM.get(tok)


def parse_range(text: str, now: datetime | None = None) -> dict:
    """คืน {label, from, to} — from/to เป็น aware datetime (Asia/Bangkok).

    ลำดับกฎ: เจาะจงก่อน ("เมื่อวาน" ชนะ default) แล้วค่อย N-unit, ท้ายสุด default สัปดาห์ล่าสุด
    """
    now = now or _now()
    tokens = word_tokenize(text, keep_whitespace=False)
    joined = "".join(tokens)

    def result(label: str, frm: datetime, to: datetime) -> dict:
        return {"label": label, "from": frm, "to": to}

    # --- วันที่เจาะจง เช่น "วันที่ 3 ตุลาคม", "3/10/69" ---
    explicit = _explicit_date(joined, now)
    if explicit:
        return result(*explicit)

    # --- เจาะจงวัน ---
    if "วันนี้" in tokens:
        return result("วันนี้", _start_of_day(now), now)
    if "เมื่อวาน" in joined:
        y = _start_of_day(now) - timedelta(days=1)
        return result("เมื่อวาน", y, _start_of_day(now))
    if "เมื่อคืน" in joined:
        # เมื่อคืน = คืนที่ผ่านมา (เย็นเมื่อวาน → เช้าวันนี้) — ข้อมูลเป็นรายสัปดาห์
        # ใช้ช่วง "เมื่อวาน" เป็นตัวแทน เพื่อเช็คว่ามี record ครอบคืนนั้นไหม
        y = _start_of_day(now) - timedelta(days=1)
        return result("เมื่อคืน", y, _start_of_day(now))
    if "พรุ่งนี้" in joined:
        return result("พรุ่งนี้", now, now)

    # --- ทั้งหมด ---
    if any(t in tokens for t in ("ทั้งหมด", "ตลอด")) or "ตั้งแต่แรก" in joined:
        return result("ข้อมูลทั้งหมด", datetime(2020, 1, 1, tzinfo=_BANGKOK), now)

    # --- N หน่วยย้อนหลัง ("3 สัปดาห์", "สองเดือน", "7 วัน") ---
    for i, tok in enumerate(tokens):
        n = _num_of(tok)
        if n is None:
            continue
        unit = tokens[i + 1] if i + 1 < len(tokens) else ""
        if unit in ("สัปดาห์", "อาทิตย์"):
            return result(f"{n} สัปดาห์ย้อนหลัง", now - timedelta(weeks=n), now)
        if unit == "เดือน":
            return result(f"{n} เดือนย้อนหลัง", _months_back(n, now), now)
        if unit == "วัน":
            return result(f"{n} วันย้อนหลัง", now - timedelta(days=n), now)
        if unit == "ปี":
            return result(f"{n} ปีย้อนหลัง", _months_back(n * 12, now), now)

    # --- ชื่อเดือนล้วน "เดือนกรกฎาคม", "สิงหาคม" → ทั้งเดือนนั้น ---
    # เช็คแบบ token ตรงๆ (ย่อสั้นๆ เช่น "กค" substring ในคำอื่นได้ ห้ามค้น joined)
    _FULL_MONTHS = [k for k in _THAI_MONTHS if len(k) > 3]
    month_hit = next((t for t in tokens if t in _THAI_MONTHS), None) \
        or next((k for k in _FULL_MONTHS if k in joined), None)
    if month_hit:
        month = _THAI_MONTHS[month_hit]
        y = now.year if month <= now.month else now.year - 1
        start = datetime(y, month, 1, tzinfo=_BANGKOK)
        nxt = datetime(y + (month == 12), month % 12 + 1, 1, tzinfo=_BANGKOK)
        return result(f"เดือน{_MONTH_TH[month]} {y + 543}", start, min(nxt, now))

    # --- ช่วงปัจจุบัน/ที่แล้ว ---
    if "สัปดาห์นี้" in joined or "อาทิตย์นี้" in joined:
        mon = _start_of_day(now) - timedelta(days=now.weekday())
        return result("สัปดาห์นี้", mon, now)
    if re.search(r"(สัปดาห์|อาทิตย์)(ที่แล้ว|ก่อน)", joined):
        this_mon = _start_of_day(now) - timedelta(days=now.weekday())
        return result("สัปดาห์ที่แล้ว", this_mon - timedelta(days=7), this_mon)
    if "เดือนนี้" in joined:
        return result("เดือนนี้", now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), now)
    if re.search(r"เดือน(ที่แล้ว|ก่อน)", joined):
        first_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_prev_end = first_this - timedelta(seconds=1)
        return result("เดือนที่แล้ว",
                      last_prev_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
                      first_this)
    if "ปีนี้" in joined:
        return result("ปีนี้", now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0), now)
    if "ปีที่แล้ว" in joined or "ปีก่อน" in joined:
        start = now.replace(year=now.year - 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        return result("ปีที่แล้ว", start, end)

    # --- default: สัปดาห์ล่าสุด ---
    # คำถามที่ไม่มีคำบอกเวลา ("ช่วงนี้", "เป็นยังไงบ้าง") → window 7 วัน
    # fetch_extractions จะเติม "ชุดข้อมูลล่าสุด" เข้า context เสมออยู่แล้ว
    return result("สัปดาห์ล่าสุด", now - timedelta(weeks=1), now)
