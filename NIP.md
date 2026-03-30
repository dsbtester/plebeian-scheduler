# Plebeian Scheduler - Nostr Protocol Usage

## Overview

Plebeian Scheduler is a social media marketing tool for Nostr merchants. It allows merchants to import their existing Plebeian Market listings (NIP-99), craft promotional notes (kind 1), and schedule those promo notes to go out at specific times.

**Key concept**: The scheduler always publishes **kind 1 notes** (regular Nostr posts). It does NOT publish listings or articles. NIP-99 listing data is used as *source material* to craft compelling promotional posts.

## Workflow

1. Merchant has existing NIP-99 listings on Plebeian Market
2. They open the scheduler and browse/import a listing
3. The listing's title, price, images, and description are used to auto-generate a promo note
4. The merchant edits the note, optionally uses AI to improve it
5. They schedule the note to publish at a specific time
6. At publish time, a kind 1 note goes out with the promo text + images + a `nostr:naddr1...` link back to the original listing

## Standard NIPs Used

### NIP-01 — Events & `created_at`

All published events are **kind 1** (Short Text Notes). The `created_at` field is always set to current time — relays reject future timestamps.

### NIP-07 — Browser Extension Signer

Events are signed via NIP-07 compatible browser extensions. The scheduler never handles private keys directly.

### NIP-19 — Bech32 Identifiers

When importing a listing, an `naddr1` identifier is generated for the original NIP-99 listing. This identifier is used to construct a direct buy link to Plebeian Market (`https://plebeian.market/p/naddr1...`) which is included in the promo note content.

### NIP-40 — Event Expiration

Optional `expiration` tag can be added to any event to signal relays to delete the event after a specified timestamp.

```json
["expiration", "1700000000"]
```

### NIP-46 — Remote Signing (Nostr Connect)

Supports NIP-46 bunker:// URIs for remote signing. This enables delegated publishing via DVM without exposing private keys.

### NIP-65 — Relay List Metadata

Relay configuration is synced via NIP-65. The scheduler reads and writes relay preferences.

### NIP-90 — Data Vending Machine (DVM)

The scheduler uses two DVM job types:

#### Delegated Publishing (kind 5905)

For scheduled posts, a DVM job request is published immediately when the user schedules the post. The DVM service provider holds the job and publishes the kind 1 note at the scheduled time.

- **kind 5905** — Job request to publish a scheduled event
  - Input: The stringified JSON of the unsigned kind 1 event to publish
  - Params: `action` = "publish", `publish_at` = unix timestamp
  - Relays: Target relay URLs for publication

```json
{
  "kind": 5905,
  "content": "",
  "tags": [
    ["i", "<stringified-kind-1-event-json>", "text"],
    ["output", "text/plain"],
    ["param", "action", "publish"],
    ["param", "publish_at", "1700000000"],
    ["relays", "wss://relay.damus.io", "wss://relay.primal.net"],
    ["alt", "DVM job request: publish scheduled Nostr event at 2023-11-14T22:13:20.000Z"]
  ]
}
```

Job results would be **kind 6905** from the DVM service provider.

#### AI Text Generation (kind 5050)

For AI-assisted content generation, the scheduler publishes text generation job requests to DVM service providers:

- **kind 5050** — Job request for AI text generation
  - Input: A prompt describing what promotional content to generate
  - Params: `max_tokens`, `temperature`
  - Output: `text/plain`

```json
{
  "kind": 5050,
  "content": "",
  "tags": [
    ["i", "Write a compelling promotional post for...", "text"],
    ["output", "text/plain"],
    ["param", "max_tokens", "1024"],
    ["param", "temperature", "0.7"],
    ["alt", "NIP-90 Text Generation request"]
  ]
}
```

Job results are **kind 6050** from the DVM service provider, with the generated text in the `content` field.

### NIP-92 — Media Attachments

All uploaded media includes `imeta` tags with available metadata:

```json
["imeta", "url https://example.com/image.jpg", "m image/jpeg", "dim 1024x768", "x <sha256>"]
```

Media URLs are also appended to the note content, ensuring they display as inline images in all Nostr clients.

### NIP-99 — Classified Listings (Read-Only)

The scheduler **reads** NIP-99 listings (kind 30402) from Nostr relays for import:

- Queries the user's own listings: `authors: [user.pubkey], kinds: [30402]`
- Queries all listings on connected relays: `kinds: [30402]`
- Parses listing metadata: title, summary, price, location, categories, images

This data is used locally to auto-generate promo note content. The scheduler never publishes kind 30402 events.

## Example Output

A merchant imports their "Christmas Cakes" listing (NIP-99, kind 30402) and the scheduler generates:

```json
{
  "kind": 1,
  "content": "Christmas Cakes & Cookies\n\nFreshly baked holiday treats, made with love!\n\nPrice: 50000 sats\n📍 Austin, TX\n\n🛒 Buy here: https://plebeian.market/p/naddr1qqxnzd3e...\nhttps://blossom.example.com/cakes.jpg",
  "tags": [
    ["imeta", "url https://blossom.example.com/cakes.jpg", "m image/jpeg", "dim 1200x800"]
  ],
  "created_at": 1700000000
}
```

## Local Storage Schema

All scheduler data is stored in browser localStorage (not on Nostr relays) until the event is published:

- `plebeian-scheduler:posts` — Array of SchedulerPost objects (promo notes with optional imported listing metadata)
- `plebeian-scheduler:queues` — Array of Queue objects

This local-first approach ensures no private data leaks to relays before intentional publishing.
