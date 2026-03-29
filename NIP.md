# Plebeian Scheduler - Nostr Protocol Usage

## Overview

Plebeian Scheduler is a scheduling tool for Nostr merchants, primarily targeting the Plebeian Market ecosystem. It enables users to compose, schedule, and publish Nostr events at future timestamps.

## Standard NIPs Used

### NIP-01 — Events & `created_at`

All Nostr events use the standard event structure. For scheduled posts, the `created_at` field is set to the future timestamp when the event should appear on relays.

### NIP-07 — Browser Extension Signer

Events are signed via NIP-07 compatible browser extensions (like Plebeian Signer). The scheduler never handles private keys directly.

### NIP-23 — Long-form Content

- **kind 30023** — Published long-form articles
- **kind 30024** — Draft articles (saved before publishing)

Tags used: `d`, `title`, `summary`, `image`, `published_at`, `t`

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

For delegated publishing, the scheduler creates job requests:

- **kind 5905** — Job request to publish a scheduled event
  - Input: The stringified JSON of the unsigned event to publish
  - Params: `action` = "publish", `publish_at` = unix timestamp
  - Relays: Target relay URLs for publication

```json
{
  "kind": 5905,
  "content": "",
  "tags": [
    ["i", "<stringified-event-json>", "text"],
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
  - Input: A prompt describing what content to generate
  - Params: `max_tokens`, `temperature`
  - Output: `text/plain`

```json
{
  "kind": 5050,
  "content": "",
  "tags": [
    ["i", "Write a compelling product description for...", "text"],
    ["output", "text/plain"],
    ["param", "max_tokens", "1024"],
    ["param", "temperature", "0.7"],
    ["alt", "NIP-90 Text Generation request"]
  ]
}
```

Job results are **kind 6050** from the DVM service provider, with the generated text in the `content` field. Job feedback events (**kind 7000**) may indicate processing status or errors.

### NIP-92 — Media Attachments

All uploaded media includes `imeta` tags with available metadata:

```json
["imeta", "url https://example.com/image.jpg", "m image/jpeg", "dim 1024x768", "x <sha256>"]
```

### NIP-99 — Classified Listings

The primary use case for Plebeian Market merchants.

- **kind 30402** — Published classified listing
- **kind 30403** — Draft classified listing

Required tags: `d`, `title`, `published_at`

Optional tags: `summary`, `price`, `location`, `status`, `t`, `image`, `imeta`, `expiration`

#### Price Tag Format

```json
["price", "<amount>", "<currency>", "<frequency>"]
```

- Currency: ISO 4217 or crypto codes (BTC, SAT, USD, EUR, etc.)
- Frequency: Optional (hour, day, week, month, year)

## Import from Nostr

The scheduler can import existing published events from Nostr relays to auto-fill the compose form:

- **kind 30402** (NIP-99) — Import existing classified listings with title, description, price, images, categories, and all metadata
- **kind 30023** (NIP-23) — Import existing long-form articles with title, summary, cover image, and content

Events are queried using `authors: [user.pubkey]` to ensure only the logged-in user's own events are fetched. Imported data populates all relevant form fields, including image URLs from both `image` and `imeta` tags.

## Local Storage Schema

All scheduler data is stored in browser localStorage (not on Nostr relays) until the event is published:

- `plebeian-scheduler:posts` — Array of SchedulerPost objects
- `plebeian-scheduler:queues` — Array of Queue objects

This local-first approach ensures no private data leaks to relays before intentional publishing.
