/**
 * Netlify Serverless Function: Scheduled Event Publisher
 *
 * Endpoints:
 *   POST /.netlify/functions/scheduler          — Schedule a pre-signed event
 *   GET  /.netlify/functions/scheduler?id=xxx   — Check status of a scheduled event
 *   DELETE /.netlify/functions/scheduler?id=xxx  — Cancel a scheduled event
 *
 * Storage: Netlify Blobs via raw HTTP API (zero npm dependencies)
 *
 * Uses Netlify.env for environment variables and the modern
 * export default (Request, context) => Response function format.
 */

// Default relays to publish to if none specified
const DEFAULT_RELAYS = [
  "wss://relay.ditto.pub",
  "wss://relay.primal.net",
  "wss://relay.damus.io",
];

const STORE_NAME = "scheduled-events";

// ─── Netlify Blobs Raw HTTP Client ────────────────────────────────

/**
 * Get blob storage credentials from environment.
 * 
 * Tries:
 * 1. NETLIFY_BLOBS_CONTEXT (auto-injected by build pipeline)
 * 2. NETLIFY_API_TOKEN + SITE_ID (manual setup for API-deployed functions)
 */
function getBlobsContext() {
  // Approach 1: Auto-injected context (build-pipeline deploys)
  const raw = process.env.NETLIFY_BLOBS_CONTEXT;

  if (raw) {
    try {
      const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
      console.log("[Blobs] Using NETLIFY_BLOBS_CONTEXT (auto-injected)");
      return {
        apiURL: decoded.apiURL || decoded.edgeURL,
        token: decoded.token,
        siteID: decoded.siteID,
      };
    } catch (err) {
      console.error("[Blobs] Failed to parse NETLIFY_BLOBS_CONTEXT:", err);
    }
  }

  // Approach 2: Manual token + reserved SITE_ID (Lambda/API-deployed functions)
  const token = process.env.NETLIFY_API_TOKEN;
  const siteID = process.env.SITE_ID;

  if (token && siteID) {
    console.log("[Blobs] Using NETLIFY_API_TOKEN + SITE_ID");
    return {
      apiURL: "https://api.netlify.com/api/v1",
      token,
      siteID,
    };
  }

  console.error("[Blobs] No credentials found.");
  console.error("[Blobs] NETLIFY_BLOBS_CONTEXT=" + (raw ? "set" : "unset"));
  console.error("[Blobs] NETLIFY_API_TOKEN=" + (token ? "set" : "unset"));
  console.error("[Blobs] SITE_ID=" + (siteID ? "set" : "unset"));
  return null;
}

/**
 * Build the Blobs API URL for a given store and key.
 */
function blobUrl(ctx, key) {
  const base = ctx.apiURL.replace(/\/$/, "");

  if (base.includes("api.netlify.com")) {
    return key
      ? `${base}/blobs/${ctx.siteID}/site:${STORE_NAME}/${key}`
      : `${base}/blobs/${ctx.siteID}/site:${STORE_NAME}`;
  }

  return key
    ? `${base}/${ctx.siteID}/site:${STORE_NAME}/${key}`
    : `${base}/${ctx.siteID}/site:${STORE_NAME}`;
}

function blobHeaders(ctx) {
  return {
    Authorization: `Bearer ${ctx.token}`,
    "Content-Type": "application/json",
  };
}

async function blobSet(ctx, key, value) {
  const url = blobUrl(ctx, key);
  console.log(`[Blobs] SET ${url}`);
  const res = await fetch(url, {
    method: "PUT",
    headers: blobHeaders(ctx),
    body: JSON.stringify(value),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[Blobs] SET failed (${res.status}): ${text}`);
    throw new Error(`Blob SET failed (${res.status}): ${text}`);
  }
  console.log(`[Blobs] SET OK for key: ${key}`);
}

async function blobGet(ctx, key) {
  const url = blobUrl(ctx, key);
  console.log(`[Blobs] GET ${url}`);
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (res.status === 404) {
    console.log(`[Blobs] GET 404 for key: ${key}`);
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[Blobs] GET failed (${res.status}): ${text}`);
    throw new Error(`Blob GET failed (${res.status}): ${text}`);
  }
  console.log(`[Blobs] GET OK for key: ${key}`);
  return res.json();
}

async function blobDelete(ctx, key) {
  const url = blobUrl(ctx, key);
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`Blob DELETE failed (${res.status}): ${text}`);
  }
}

async function blobList(ctx) {
  const url = blobUrl(ctx, null);
  console.log(`[Blobs] LIST ${url}`);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[Blobs] LIST failed (${res.status}): ${text}`);
    throw new Error(`Blob LIST failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  console.log(`[Blobs] LIST found ${(data.blobs || []).length} entries`);
  return data.blobs || [];
}

// ─── Nostr Relay Publishing ───────────────────────────────────────

async function publishToRelay(relayUrl, signedEvent, timeoutMs = 10000) {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(relayUrl);
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { ws.close(); } catch {}
          resolve({ relay: relayUrl, ok: false, error: "timeout" });
        }
      }, timeoutMs);

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify(["EVENT", signedEvent]));
      });

      ws.addEventListener("message", (msg) => {
        try {
          const data = JSON.parse(typeof msg.data === "string" ? msg.data : msg.data.toString());
          if (data[0] === "OK" && data[1] === signedEvent.id) {
            clearTimeout(timer);
            settled = true;
            ws.close();
            resolve({ relay: relayUrl, ok: data[2], message: data[3] || "" });
          }
        } catch {}
      });

      ws.addEventListener("error", (err) => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          try { ws.close(); } catch {}
          resolve({ relay: relayUrl, ok: false, error: String(err.message || "ws error") });
        }
      });

      ws.addEventListener("close", () => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          resolve({ relay: relayUrl, ok: false, error: "connection closed" });
        }
      });
    } catch (err) {
      resolve({ relay: relayUrl, ok: false, error: String(err) });
    }
  });
}

async function publishToRelays(signedEvent, relayUrls) {
  return Promise.all(relayUrls.map((url) => publishToRelay(url, signedEvent)));
}

// ─── CORS ─────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/**
 * Lambda-compatible response helper.
 * Returns { statusCode, headers, body } format.
 */
function lambdaResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
    body: JSON.stringify(body),
  };
}

// ─── Main Handler (Lambda compatibility format for API deploys) ───

export const handler = async (event, context) => {
  const method = event.httpMethod;

  // CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  const blobCtx = getBlobsContext();
  const id = event.queryStringParameters?.id || null;
  const action = event.queryStringParameters?.action || null;
  const cronKey = event.queryStringParameters?.key || null;

  // ── GET without id: health check (works even without storage) ──
  if (method === "GET" && !id && action !== "cron") {
    return lambdaResponse({
      ok: true,
      service: "plebeian-scheduler",
      storage: blobCtx ? "connected" : "not configured",
      method: blobCtx ? "ready" : "none",
    });
  }

  // ── GET with action=cron: external cron trigger ──
  // URL: /.netlify/functions/scheduler?action=cron&key=YOUR_CRON_SECRET
  if (method === "GET" && action === "cron") {
    const expectedKey = process.env.CRON_SECRET;
    if (!expectedKey || cronKey !== expectedKey) {
      return lambdaResponse({ error: "Unauthorized" }, 401);
    }

    if (!blobCtx) {
      return lambdaResponse({ error: "Storage not configured" }, 500);
    }

    console.log("[Scheduler Cron] Triggered by external cron service...");

    const now = Math.floor(Date.now() / 1000);
    let publishedCount = 0;
    let checkedCount = 0;

    try {
      const blobs = await blobList(blobCtx);
      checkedCount = blobs.length;

      for (const blob of blobs) {
        const record = await blobGet(blobCtx, blob.key);
        if (!record || record.status !== "pending") continue;
        if (record.publishAt > now) continue;

        console.log(`[Scheduler Cron] Publishing event ${blob.key} (due at ${new Date(record.publishAt * 1000).toISOString()})...`);

        try {
          const results = await publishToRelays(record.signedEvent, record.relays);
          const anySuccess = results.some((r) => r.ok);

          record.status = anySuccess ? "published" : "failed";
          record.publishedAt = Math.floor(Date.now() / 1000);
          record.results = results;

          await blobSet(blobCtx, blob.key, record);
          publishedCount++;

          console.log(`[Scheduler Cron] Event ${blob.key}: ${record.status}`, JSON.stringify(results));
        } catch (err) {
          console.error(`[Scheduler Cron] Failed to publish ${blob.key}:`, err);
          record.status = "failed";
          record.results = [{ error: String(err.message || err) }];
          await blobSet(blobCtx, blob.key, record);
        }
      }
    } catch (err) {
      console.error("[Scheduler Cron] Error listing blobs:", err);
      return lambdaResponse({ error: String(err.message || err) }, 500);
    }

    return lambdaResponse({
      ok: true,
      checked: checkedCount,
      published: publishedCount,
      timestamp: new Date().toISOString(),
    });
  }

  // All other operations need storage
  if (!blobCtx) {
    return lambdaResponse({
      error: "Blob storage not configured. Set NETLIFY_API_TOKEN in site environment variables.",
    }, 500);
  }

  try {
    // ── POST: Schedule a new event ──
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { signedEvent, publishAt, relays } = body;

      if (!signedEvent || !signedEvent.id || !signedEvent.sig || !signedEvent.pubkey) {
        return lambdaResponse({ error: "Missing or invalid signedEvent" }, 400);
      }
      if (!publishAt || typeof publishAt !== "number") {
        return lambdaResponse({ error: "Missing or invalid publishAt timestamp" }, 400);
      }

      const record = {
        signedEvent,
        publishAt,
        relays: relays && relays.length > 0 ? relays : DEFAULT_RELAYS,
        status: "pending",
        createdAt: Math.floor(Date.now() / 1000),
        publishedAt: null,
        results: null,
      };

      await blobSet(blobCtx, signedEvent.id, record);

      console.log(`[Scheduler] Stored event ${signedEvent.id} for publish at ${new Date(publishAt * 1000).toISOString()}`);

      return lambdaResponse({
        ok: true,
        id: signedEvent.id,
        publishAt,
        status: "pending",
      });
    }

    // ── GET with id: Check status ──
    if (method === "GET" && id) {
      const record = await blobGet(blobCtx, id);

      if (!record) {
        return lambdaResponse({ error: "Not found" }, 404);
      }

      return lambdaResponse({
        id,
        status: record.status,
        publishAt: record.publishAt,
        publishedAt: record.publishedAt,
        results: record.results,
      });
    }

    // ── DELETE: Cancel a scheduled event ──
    if (method === "DELETE" && id) {
      const record = await blobGet(blobCtx, id);

      if (!record) {
        return lambdaResponse({ error: "Not found" }, 404);
      }

      if (record.status === "published") {
        return lambdaResponse({ error: "Already published, cannot cancel" }, 409);
      }

      await blobDelete(blobCtx, id);

      return lambdaResponse({ ok: true, id, status: "cancelled" });
    }

    return lambdaResponse({ error: "Method not allowed" }, 405);

  } catch (err) {
    console.error("[Scheduler] Error:", err);
    return lambdaResponse({ error: String(err.message || err) }, 500);
  }
};

// ─── Scheduled Function (Cron) ────────────────────────────────────

export async function scheduled(event) {
  console.log("[Scheduler Cron] Checking for due events...");

  const ctx = getBlobsContext();
  if (!ctx) {
    console.error("[Scheduler Cron] No storage credentials, skipping.");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  let publishedCount = 0;

  try {
    const blobs = await blobList(ctx);

    for (const blob of blobs) {
      const record = await blobGet(ctx, blob.key);
      if (!record || record.status !== "pending") continue;
      if (record.publishAt > now) continue;

      console.log(`[Scheduler Cron] Publishing event ${blob.key} (due at ${new Date(record.publishAt * 1000).toISOString()})...`);

      try {
        const results = await publishToRelays(record.signedEvent, record.relays);
        const anySuccess = results.some((r) => r.ok);

        record.status = anySuccess ? "published" : "failed";
        record.publishedAt = Math.floor(Date.now() / 1000);
        record.results = results;

        await blobSet(ctx, blob.key, record);
        publishedCount++;

        console.log(`[Scheduler Cron] Event ${blob.key}: ${record.status}`, JSON.stringify(results));
      } catch (err) {
        console.error(`[Scheduler Cron] Failed to publish ${blob.key}:`, err);
        record.status = "failed";
        record.results = [{ error: String(err.message || err) }];
        await blobSet(ctx, blob.key, record);
      }
    }
  } catch (err) {
    console.error("[Scheduler Cron] Error listing blobs:", err);
  }

  console.log(`[Scheduler Cron] Done. Published ${publishedCount} event(s).`);
}

export const config = {
  schedule: "* * * * *",
};
