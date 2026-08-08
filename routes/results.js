import { Router } from "express";
import { openDownloadStream } from "../services/storageService.js";

const router = Router();

// GET /results/save/:id - สั่งเปิดหน้าดาวน์โหลดภาพแบบอัตโนมัติ 0 คลิกซ้ำ
router.get("/save/:id", (req, res) => {
  const { id } = req.params;
  const rawId = id.replace(/\.png$/, "");
  const imageUrl = `${process.env.PUBLIC_BASE_URL || ""}/results/${rawId}.png`;

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>บันทึกรูปภาพ - biokoop</title>
  <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Kanit', sans-serif; }
    body { background: #09090b; color: #ffffff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; text-align: center; }
    .card-box { max-width: 440px; width: 100%; background: #18181b; border-radius: 20px; padding: 20px; border: 1px solid #27272a; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    img { width: 100%; height: auto; border-radius: 12px; display: block; margin-bottom: 16px; }
    .status { font-size: 16px; font-weight: 700; color: #22c55e; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .tip { margin-top: 14px; font-size: 13px; color: #a1a1aa; line-height: 1.5; }
  </style>
</head>
<body onload="autoSave()">
  <div class="card-box">
    <div class="status">⚡ กำลังบันทึกรูปภาพลงเครื่อง...</div>
    <img id="cardImg" src="${imageUrl}" alt="biokoop result" />
    <div class="tip">💡 หากระบบไม่เด้งหน้าต่างบันทึกอัตโนมัติ ให้แตะกดค้างที่รูปภาพด้านบน แล้วเลือก <b>"บันทึกภาพ" (Save Image)</b> ได้ทันทีค่ะ</div>
  </div>

  <script>
    async function autoSave() {
      const imgUrl = "${imageUrl}";
      try {
        const response = await fetch(imgUrl);
        const blob = await response.blob();
        const file = new File([blob], "biokoop-health-${rawId.slice(-6)}.png", { type: "image/png" });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "biokoop Health Card" });
          return;
        }
      } catch (e) {}

      const a = document.createElement("a");
      a.href = imgUrl + "?download=1";
      a.download = "biokoop-health-${rawId.slice(-6)}.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// GET /results/:id.png
router.get("/:id.png", (req, res) => {
  const { id } = req.params;
  const isDownload = req.query.download === "1" || req.query.dl === "1";
  try {
    const stream = openDownloadStream("results", id);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=31536000, immutable");

    if (isDownload) {
      res.set(
        "Content-Disposition",
        `attachment; filename="biokoop-health-${id.slice(-6)}.png"`
      );
    }

    stream.on("error", () => res.sendStatus(404));
    stream.pipe(res);
  } catch {
    res.sendStatus(404);
  }
});

export default router;
