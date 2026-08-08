import { Router } from "express";
import { openDownloadStream } from "../services/storageService.js";

const router = Router();

// GET /results/:id.png
router.get("/:id.png", (req, res) => {
  const { id } = req.params;
  try {
    const stream = openDownloadStream("results", id);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    stream.on("error", () => res.sendStatus(404));
    stream.pipe(res);
  } catch {
    res.sendStatus(404);
  }
});

export default router;
