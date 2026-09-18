# Decisions Log

## 2026-09-18 — Weekly report LINE display: went back and forth, landed on individual 3-page cards only (no combined 3-in-1 card)

First pass: user asked to show only the combined 3-in-1 panorama card and drop the 3 individual page bubbles/images. Implemented that (removed the per-page bubble loop from `buildWeeklyReportCarouselFlex`, default send branch became `[carouselFlex(combined-only), summaryMsg]`).

User then asked where the page 1/2/3 images went and said not to remove that part. Clarified via AskUserQuestion — turned out they wanted the opposite of the first pass: **drop the combined 3-in-1 card entirely, keep only the 3 separate per-page cards** ("การ์ดรวม ไม่เอา เอาแค่การ์ดแยก 1 2 3").

Then a third clarification: user doesn't want a Flex Message (carousel cards) at all either — just plain LINE image messages for page 1/2/3, in that order, no combined panorama.

Then a fourth request: add the combined 3-in-1 panorama back, but as a plain image (not Flex) placed **before** the 3 individual page images, with a short plain-text caption describing it (since LINE image messages can't carry a caption directly).

Final state in [services/lineService.js](services/lineService.js):
- Removed `buildWeeklyReportCarouselFlex` entirely (was dead code once nothing called it) — no more Flex Carousel for the weekly report.
- `sendWeeklyReportImages` now unconditionally sends, in order: combined 3-in-1 image (`type: "image"`) → a plain text caption ("🖼️ ภาพรวม 3-in-1 แผ่นเดียว..." — reused wording from the old Flex bubble body) → the 3 individual page images → the text summary. All plain `type: "image"`/`type: "text"` messages, no Flex. `WEEKLY_REPORT_DISPLAY_MODE` env var is no longer read/used.
- `logLineMessage` calls restored for the combined image since it's actually sent again.
- Did **not** touch `services/pipeline.js` — it still renders/saves the 3 individual page PNGs (`resultImageIds`) *and* the combined panorama (`combinedResultImageId`) to GridFS/DB regardless of what gets pushed to LINE; only the LINE message composition changed.
- Message count can be up to 6 (combined image + caption + 3 pages + summary); existing chunking logic (max 4 per `pushMessage` call, LINE's limit is 5) already handles this without changes.
