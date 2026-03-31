/**
 * Netlify Serverless Function: Scheduled Event Publisher
 *
 * Endpoints:
 *   POST /.netlify/functions/scheduler          — Schedule a pre-signed event
 *   GET  /.netlify/functions/scheduler?id=xxx   — Check status of a scheduled event
 *   DELETE /.netlify/functions/scheduler?id=xxx  — Cancel a scheduled event
 *
 * Scheduled trigger (every minute):
 *   Checks for due events and publishes them to Nostr relays via WebSocket.
 *
 * Storage: Netlify Blobs (persistent key-value store)
 */

import { getStore } from "@netlify/blobs";

// Default relays to publish to if none specified
const DEFAULT_RELAYS = [
  "wss://relay.ditto.pub",
  "wss://relay.primal.net",
  "wss://relay.damus.io",
];

/**
 * Publish a signed Nostr event to a relay via WebSocket.
 * Returns true if the relay accepted the event.
 */
async function publishToRelay(relayUrl, signedEvent, timeoutMs = 10000) {
  return new Promise((resolve) => {
    try {
      // Use dynamic import for WebSocket in Node.js environment
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
        // Send EVENT message per NIP-01
        ws.send(JSON.stringify(["EVENT", signedEvent]));
      });

      ws.addEventListener("message", (msg) => {
        try {
          const data = JSON.parse(msg.data);
          // OK message: ["OK", event_id, accepted, message]
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

/**
 * Publish to multiple relays in parallel.
 */
async function publishToRelays(signedEvent, relayUrls) {
  const results = await Promise.all(
    relayUrls.map((url) => publishToRelay(url, signedEvent))
  );
  return results;
}

/**
 * Get the Netlify Blob store for scheduled events.
 */
function getSchedulerStore() {
  return getStore("scheduled-events");
}

/**
 * CORS headers for all responses
 */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/**
 * Main handler
 */
export default async function handler(request, context) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  try {
    // POST — Schedule a new event
    if (request.method === "POST") {
      const body = await request.json();
      const { signedEvent, publishAt, relays } = body;

      // Validate
      if (!signedEvent || !signedEvent.id || !signedEvent.sig || !signedEvent.pubkey) {
        return new Response(
          JSON.stringify({ error: "Missing or invalid signedEvent" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }
      if (!publishAt || typeof publishAt !== "number") {
        return new Response(
          JSON.stringify({ error: "Missing or invalid publishAt timestamp" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }

      const store = getSchedulerStore();
      const record = {
        signedEvent,
        publishAt,
        relays: relays && relays.length > 0 ? relays : DEFAULT_RELAYS,
        status: "pending",
        createdAt: Math.floor(Date.now() / 1000),
        publishedAt: null,
        results: null,
      };

      await store.setJSON(signedEvent.id, record);

      console.log(`[Scheduler] Stored event ${signedEvent.id} for publish at ${new Date(publishAt * 1000).toISOString()}`);

      return new Response(
        JSON.stringify({
          ok: true,
          id: signedEvent.id,
          publishAt,
          status: "pending",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    // GET — Check status
    if (request.method === "GET" && id) {
      const store = getSchedulerStore();
      const record = await store.get(id, { type: "json" });

      if (!record) {
        return new Response(
          JSON.stringify({ error: "Not found" }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }

      return new Response(
        JSON.stringify({
          id,
          status: record.status,
          publishAt: record.publishAt,
          publishedAt: record.publishedAt,
          results: record.results,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    // DELETE — Cancel a scheduled event
    if (request.method === "DELETE" && id) {
      const store = getSchedulerStore();
      const record = await store.get(id, { type: "json" });

      if (!record) {
        return new Response(
          JSON.stringify({ error: "Not found" }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }

      if (record.status === "published") {
        return new Response(
          JSON.stringify({ error: "Already published, cannot cancel" }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }

      await store.delete(id);

      return new Response(
        JSON.stringify({ ok: true, id, status: "cancelled" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );

  } catch (err) {
    console.error("[Scheduler] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err.message || err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }
}

/**
 * Scheduled function — runs every minute via Netlify cron.
 * Checks for pending events whose publishAt <= now and publishes them.
 */
export async function scheduled(event) {
  console.log("[Scheduler Cron] Checking for due events...");

  const store = getSchedulerStore();
  const now = Math.floor(Date.now() / 1000);

  // List all stored events
  const { blobs } = await store.list();

  let publishedCount = 0;

  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: "json" });
    if (!record || record.status !== "pending") continue;

    // Check if due
    if (record.publishAt > now) continue;

    console.log(`[Scheduler Cron] Publishing event ${blob.key} (due at ${new Date(record.publishAt * 1000).toISOString()})...`);

    try {
      const results = await publishToRelays(record.signedEvent, record.relays);
      const anySuccess = results.some((r) => r.ok);

      record.status = anySuccess ? "published" : "failed";
      record.publishedAt = Math.floor(Date.now() / 1000);
      record.results = results;

      await store.setJSON(blob.key, record);
      publishedCount++;

      console.log(`[Scheduler Cron] Event ${blob.key}: ${record.status}`, results);
    } catch (err) {
      console.error(`[Scheduler Cron] Failed to publish ${blob.key}:`, err);

      record.status = "failed";
      record.results = [{ error: String(err.message || err) }];
      await store.setJSON(blob.key, record);
    }
  }

  console.log(`[Scheduler Cron] Done. Published ${publishedCount} event(s).`);
}

// Netlify scheduled function config — run every minute
export const config = {
  schedule: "* * * * *",
};
