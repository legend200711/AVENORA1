# 24-Hour Audio Cloud Stream

---

## PROJECT

**24-Hour Audio Cloud Stream** — the Avenora 24-hour audio broadcasting system.

A creator can go live with a server-side 24-hour audio broadcast without a camera or live video.
Audio files are served from Cloudflare R2 (or any CDN). A Cloudflare Worker (backed by a Durable Object)
advances the playlist automatically. Listeners receive synchronized real-time playback via Firestore.

---

## FIREBASE

**Active Firebase project: `avenora-6e147`**

The Cloud Stream requires the following Firebase services:

| Service | Purpose |
|---------|---------|
| **Firebase Authentication** | Creator sign-in; ID tokens used to authenticate API calls |
| **Firestore** | `cloudStreams/{streamId}` — broadcast record; `studioCloudStreamMusic/{streamId}` — live Now Playing (worker-owned); `studioPlaylists/{uid}/playlists/{plId}` — creator playlist metadata; `cloudStreamTracks/{uid}/tracks/{trackId}` — creator's track library; `users/{uid}` — display name / avatar / role |
| **Firebase SDK** | CDN-loaded `firebase/app`, `firebase/auth`, `firebase/firestore` v12.18.0 |

> **Credentials:** The Firebase config (API key, project ID, etc.) is embedded in `js/cloud-stream.js`.
> These are web-tier, client-safe credentials. Do NOT embed Firebase Admin or service account keys here.

---

## CLOUDFLARE

| Resource | Details |
|----------|---------|
| **Worker name** | `avenora-cloudstream` |
| **Worker source** | `workers/cloudstream-worker.js` |
| **Wrangler config** | `config/wrangler-studio.jsonc` |
| **KV Namespace** | `cloudStreamKV` — stores stream state, music queue, events |
| **Durable Object** | `CloudStreamScheduler` class — drives 24-hour track alarm scheduling |

### Worker Secrets (must be set via `wrangler secret put`)

```
STREAM_SECRET      — Signs/verifies stream auth tokens
FIREBASE_API_KEY   — Firebase Web API key for project avenora-6e147 (server-side Firestore REST writes only)
```

### Deploying the Worker

```bash
npx wrangler deploy --config config/wrangler-studio.jsonc

# Set required secrets
npx wrangler secret put STREAM_SECRET --config config/wrangler-studio.jsonc
npx wrangler secret put FIREBASE_API_KEY --config config/wrangler-studio.jsonc
```

---

## ENTRY POINT

```
24-hour-cloud-stream/index.html
```

Open `index.html` in a browser (served from any static host) or deploy the folder to a CDN / Firebase Hosting.
Firebase Auth must be configured on the same domain, or `localhost` must be in the authorised domains list.

---

## REQUIRED FILES

```
24-hour-cloud-stream/
│
├── index.html                         — App shell & HTML
│
├── css/
│   └── cloud-stream.css               — All UI styles (standalone, no external CSS)
│
├── js/
│   └── cloud-stream.js                — All client-side logic (creator + listener)
│
├── workers/
│   └── cloudstream-worker.js          — Cloudflare Worker (server-side brain)
│
├── assets/
│   ├── apple-touch-icon.png           — PWA icon
│   ├── favicon.ico                    — Favicon
│   ├── favicon-16x16.png              — Favicon 16px
│   └── favicon-32x32.png             — Favicon 32px
│
├── config/
│   └── wrangler-studio.jsonc          — Worker deployment config
│
└── README.md                          — This file
```

---

## WORKER API ENDPOINTS

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/stream/start` | Start a new broadcast |
| POST | `/api/stream/stop` | Stop an active broadcast |
| POST | `/api/stream/control` | Scene / music control actions |
| GET  | `/api/stream/health/{streamId}` | Poll stream health + Now Playing |
| GET  | `/api/stream/sync/{streamId}` | Listener sync (public, no auth) |
| GET  | `/api/stream/active/{uid}` | Check if user already has an active stream |
| POST | `/api/stream/music/set` | Replace music queue |
| POST | `/api/stream/music/control` | Skip / pause / resume / volume |
| GET  | `/api/stream/music/{streamId}` | Read current music state |
| POST | `/api/admin/stream/stop` | Force-stop (founder only) |
| GET  | `/api/admin/streams` | List all active streams (founder only) |
| GET  | `/health` | Worker liveness check |

---

## TEST CHECKLIST

- [ ] `index.html` opens and shows the loading spinner
- [ ] After Firebase Auth resolves, the app shows Create Broadcast form or active stream panel
- [ ] Selecting a playlist populates the queue preview
- [ ] Clicking GO LIVE FOR 24 HOURS starts the broadcast
- [ ] Stream status panel shows LIVE badge, title, host, expiry countdown
- [ ] Another device / account opens `index.html?id=<streamId>` and sees the listener player
- [ ] Listener hears audio (browser autoplay may require user interaction)
- [ ] Now Playing updates when the Durable Object alarm advances the track
- [ ] Skip Track advances to the next track
- [ ] Listener count displayed in the status panel
- [ ] Cover artwork displays if uploaded
- [ ] END CLOUD BROADCAST stops the stream and cleans up Firestore
- [ ] `GET /health` at the worker URL returns `{ ok: true, worker: "cloudstream", v: "1.4.0" }`
- [ ] No camera is requested at any point
