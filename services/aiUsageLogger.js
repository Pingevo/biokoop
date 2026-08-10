// services/aiUsageLogger.js
import { estimateCost, OFFICIAL_PRESETS } from "./apiPricingConfigService.js";

/**
 * ส่งข้อมูล Log การใช้งาน AI ไปยัง AI Usage Hub (Centralized Token Logging)
 * Base URL: https://digital.in.th/internal/ai-usage/logs
 * 
 * กฎสำคัญตามข้อกำหนดใน AI_USAGE_HUB_DEVELOPER_API.md:
 * 1. ฟังก์ชันนี้เป็น fire-and-forget (ห้าม throw error หรือรบกวนระบบหลักเด็ดขาด)
 * 2. ส่งราคาจริงเป็น USD (cost_usd) หากมีจาก provider
 * 3. ส่ง x-service-token header เพื่อระบุตัวตนโปรเจกต์
 */
export function logAiUsage(entry = {}) {
  try {
    const url = process.env.AI_USAGE_HUB_URL || "https://digital.in.th";
    const token = process.env.AI_USAGE_HUB_TOKEN || "";

    if (!url || !token) return;

    // คำนวณราคาเป็น USD (ถ้าไม่ได้ส่ง cost_usd มา หรือ provider ไม่ได้คืนค่าราคาติดมา)
    let costUsd = entry.cost_usd;
    if (costUsd === undefined || costUsd === null) {
      const modelKey = entry.model || "";
      const strippedModel = modelKey.replace(/^openrouter\//, "");
      const preset = OFFICIAL_PRESETS[modelKey] || OFFICIAL_PRESETS[strippedModel] || OFFICIAL_PRESETS[modelKey.split("/").pop()];
      
      if (preset) {
        const pTokens = Number(entry.prompt_tokens || 0);
        const cTokens = Number(entry.completion_tokens || 0);
        costUsd = (pTokens / 1_000_000) * preset.inputPer1M + (cTokens / 1_000_000) * preset.outputPer1M;
      } else {
        costUsd = estimateCost(entry.model, entry.prompt_tokens || 0, entry.completion_tokens || 0);
      }
    }

    const payload = {
      provider: entry.provider || "other",
      model: entry.model || "unknown",
      operation: entry.operation || "chat.completions",
      source: entry.source || "biokoopApp",
      user: entry.user || "system",
      reference: entry.reference || "biokoop",
      request_id: entry.request_id || undefined,
      environment: process.env.NODE_ENV || "production",
      prompt_tokens: Number(entry.prompt_tokens || 0),
      completion_tokens: Number(entry.completion_tokens || 0),
      cost_usd: Number(costUsd || 0),
      duration_ms: Number(entry.duration_ms || 0),
      status: entry.status || "success",
      http_status: Number(entry.http_status || 200),
      error_message: entry.error_message || null,
      raw_usage: entry.raw_usage || {},
      metadata: entry.metadata || {},
    };

    const endpoint = `${url.replace(/\/$/, "")}/internal/ai-usage/logs`;

    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-service-token": token,
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.warn(`[ai-usage-hub] ⚠️ Ingest responded ${res.status}: ${text}`);
        } else {
          console.log(`[ai-usage-hub] ✅ Recorded AI log -> Provider: ${payload.provider} | Model: ${payload.model} | Tokens: ${payload.prompt_tokens + payload.completion_tokens} | Cost: $${payload.cost_usd.toFixed(6)}`);
        }
      })
      .catch((err) => {
        console.error("[ai-usage-hub] ❌ Fire-and-forget log failed:", err.message);
      });
  } catch (err) {
    console.error("[ai-usage-hub] ❌ Exception in logAiUsage:", err.message);
  }
}
