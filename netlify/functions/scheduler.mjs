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
 * The function uses the NETLIFY_BLOBS_CONTEXT env var injected by the
 * Netlify runtime, which contains { apiURL, token, siteID, deployID }.
 * This avoids needing the @netlify/blobs npm package.
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
 * Parse the Netlify Blobs context from the environment.
 * Returns { apiURL, token, siteID } or null if not available.
 */
function getBlobsContext() {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT;
  if (!raw) {
    console.error("[Blobs] NETLIFY_BLOBS_CONTEXT not found in environment");
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    return {
      apiURL: decoded.apiURL || decoded.edgeURL,
      token: decoded.token,
      siteID: decoded.siteID,
    };
  } catch (err) {
    console.error("[Blobs] Failed to parse NETLIFY_BLOBS_CONTEXT:", err);
    return null;
  }
}

/**
 * Build the Blobs API URL for a given store and key.
 *
 * Netlify Blobs API format:
 *   {apiURL}/api/v1/blobs/{siteID}/{storeName}/{key}
 *
 * For the newer edge API:
 *   {edgeURL}/{siteID}/{storeName}/{key}
 */
function blobUrl(ctx, key) {
  // The apiURL from context may be the edge URL or the API URL
  const base = ctx.apiURL.replace(/\/$/, "");

  // Detect if this is the edge URL pattern (no /api/v1 prefix)
  if (base.includes("/api/v1")) {
    return key
      ? `${base}/blobs/${ctx.siteID}/${STORE_NAME}/${key}`
      : `${base}/blobs/${ctx.siteID}/${STORE_NAME}`;
  }

  // Edge/deploy URL pattern
  return key
    ? `${base}/${ctx.siteID}/${STORE_NAME}/${key}`
    : `${base}/${ctx.siteID}/${STORE_NAME}`;
}

function blobHeaders(ctx) {
  return {
    Authorization: `Bearer ${ctx.token}`,
    "Content-Type": "application/json",
  };
}

/** Store a JSON value in blobs */
async function blobSet(ctx, key, value) {
  const url = blobUrl(ctx, key);
  const res = await fetch(url, {
    method: "PUT",
    headers: blobHeaders(ctx),
    body: JSON.stringify(value),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Blob SET failed (${res.status}): ${text}`);
  }
}

/** Get a JSON value from blobs, returns null if not found */
async function blobGet(ctx, key) {
  const url = blobUrl(ctx, key);
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Blob GET failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Delete a key from blobs */
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

/** List all keys in the store. Returns array of { key } objects. */
async function blobList(ctx) {
  const url = blobUrl(ctx, null);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Blob LIST failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  // Response shape: { blobs: [{ key, ... }] }
  return data.blobs || [];
}

// ─── Nostr Relay Publishing ───────────────────────────────────────

/**
 * Publish a signed Nostr event to a relay via WebSocket.
 * Returns { relay, ok, message/error }.
 */
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// ─── Main Handler ─────────────────────────────────────────────────

export async function handler(request) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const ctx = getBlobsContext();
  if (!ctx) {
    return jsonResponse({ error: "Blob storage not available — NETLIFY_BLOBS_CONTEXT missing" }, 500);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  try {
    // ── POST: Schedule a new event ──
    if (request.method === "POST") {
      const body = await request.json();
      const { signedEvent, publishAt, relays } = body;

      if (!signedEvent || !signedEvent.id || !signedEvent.sig || !signedEvent.pubkey) {
        return jsonResponse({ error: "Missing or invalid signedEvent" }, 400);
      }
      if (!publishAt || typeof publishAt !== "number") {
        return jsonResponse({ error: "Missing or invalid publishAt timestamp" }, 400);
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

      await blobSet(ctx, signedEvent.id, record);

      console.log(`[Scheduler] Stored event ${signedEvent.id} for publish at ${new Date(publishAt * 1000).toISOString()}`);

      return jsonResponse({
        ok: true,
        id: signedEvent.id,
        publishAt,
        status: "pending",
      });
    }

    // ── GET: Check status ──
    if (request.method === "GET" && id) {
      const record = await blobGet(ctx, id);

      if (!record) {
        return jsonResponse({ error: "Not found" }, 404);
      }

      return jsonResponse({
        id,
        status: record.status,
        publishAt: record.publishAt,
        publishedAt: record.publishedAt,
        results: record.results,
      });
    }

    // ── GET without id: health check ──
    if (request.method === "GET" && !id) {
      return jsonResponse({ ok: true, service: "plebeian-scheduler", storage: "connected" });
    }

    // ── DELETE: Cancel a scheduled event ──
    if (request.method === "DELETE" && id) {
      const record = await blobGet(ctx, id);

      if (!record) {
        return jsonResponse({ error: "Not found" }, 404);
      }

      if (record.status === "published") {
        return jsonResponse({ error: "Already published, cannot cancel" }, 409);
      }

      await blobDelete(ctx, id);

      return jsonResponse({ ok: true, id, status: "cancelled" });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);

  } catch (err) {
    console.error("[Scheduler] Error:", err);
    return jsonResponse({ error: String(err.message || err) }, 500);
  }
}

// ─── Scheduled Function (Cron) ────────────────────────────────────

/**
 * Runs every minute via Netlify cron.
 * Checks for pending events whose publishAt <= now and publishes them.
 */
export async function scheduled(event) {
  console.log("[Scheduler Cron] Checking for due events...");

  const ctx = getBlobsContext();
  if (!ctx) {
    console.error("[Scheduler Cron] NETLIFY_BLOBS_CONTEXT not available, skipping.");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  let publishedCount = 0;

  try {
    const blobs = await blobList(ctx);

    for (const blob of blobs) {
      const record = await blobGet(ctx, blob.key);
      if (!record || record.status !== "pending") continue;

      // Not due yet
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

// Netlify scheduled function config — run every minute
export const config = {
  schedule: "* * * * *",
};
