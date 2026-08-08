import { Router } from "express";
import mongoose from "mongoose";
import { getQueueStats } from "../services/pipeline.js";

const router = Router();
const startTime = Date.now();

// GET /health หรือ /api/health
router.get(["/", "/api"], (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const isMongoConnected = mongoState === 1;

  const memory = process.memoryUsage();
  const heapUsedMB = (memory.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotalMB = (memory.heapTotal / 1024 / 1024).toFixed(2);
  const rssMB = (memory.rss / 1024 / 1024).toFixed(2);

  const queueStats = getQueueStats();

  const isOk = isMongoConnected;
  const httpStatus = isOk ? 200 : 503;

  res.status(httpStatus).json({
    status: isOk ? "ok" : "degraded",
    service: "biokoop",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    uptimeFormatted: `${Math.floor(process.uptime() / 60)} minutes`,
    database: {
      connected: isMongoConnected,
      readyState: mongoState, // 1 = connected, 0 = disconnected
    },
    memory: {
      heapUsedMB: `${heapUsedMB} MB`,
      heapTotalMB: `${heapTotalMB} MB`,
      rssMB: `${rssMB} MB`,
    },
    pipelineQueue: queueStats,
  });
});

export default router;
