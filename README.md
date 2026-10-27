# PlayHive

**Create a room. Invite your people. Let the chaos begin.**

PlayHive is a real-time multiplayer party-games platform for the browser. One person creates a room, everyone else joins with a 5-character code or an invite link from their own phone or laptop, and the whole group plays together, with turns, votes, timers, secret roles and drawings kept in sync live.

- **Live app:** https://playhive-t8t4.onrender.com
- **Source:** https://github.com/pranjal07vk/playhive

---

## 1. Problem

Friends end up in different hostels, cities and countries. Existing ways to play together remotely are clumsy: app downloads, mandatory accounts, one person screen-sharing a game, or games where the "online" part is a static question list everyone reads at their own pace. There's no shared state, so nobody really knows whose turn it is, votes can't be secret, and secrets can't be kept.

## 2. Target users

College students and hostel groups, friends spread across cities, families, and casual social groups who want a quick game night with zero setup.

## 3. Solution

A browser app with no accounts and no downloads, where:

* the **server is the referee**: it deals cards, assigns secret roles, runs every timer and validates every move;
* each player's device receives **only what that player is allowed to see**;
* all players stay **in sync in real time** over WebSockets;
* dropping off Wi-Fi is fine: you **reconnect to the same seat**.

## 4. Features

* 15 games, each with its own rules engine, settings and screen:
  Truth or Dare · Would You Rather · Never Have I Ever · Two Truths & a Lie · Heads Up · Charades · Pictionary (live synced drawing) · Mafia (hidden roles) · Hot Seat · Scavenger Hunt · Spin the Bottle · Colour Clash (UNO-style) · Telephone (draw-and-describe chains) · Freeze Dance (generated beat + DJ referee) · Sardines (hide-and-seek companion)
* Room codes and invite links, with live room lookup before joining (wrong code, full room, game running)
* A live lobby: player cards, online status, ready toggles, host badge, host-only settings that update for everyone, kick, and host transfer
* Per-game settings generated from the server's definitions (only relevant options appear)
* Shared, clock-corrected countdowns
* Results with a podium, leaderboard, highlights and game-specific reveals (Mafia roles, Telephone chains, the lies from Two Truths), plus Rematch, Choose another game and Leave
* Finished matches saved to MongoDB
* A mobile-first, accessible, "Indian maximalism × internet culture" visual identity

## 5. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18, Vite, React Router 6, plain CSS with design tokens | Component model for 15 different game screens; fast builds; no CSS framework, so the visual identity stays distinctive |
| Real-time | Socket.IO 4 | WebSockets plus reconnection, rooms and acknowledgements |
| Backend | Node.js, Express 4 | REST for create/join, and the same process hosts Socket.IO |
| Database | MongoDB Atlas + Mongoose | Stores finished match history |
| Security | helmet (CSP), express-rate-limit, CORS allow-list, hashed session tokens | |
| Tests | `node:test` (built in), socket.io-client | 130 tests with no extra framework |
| Hosting | Render (one web service) | Supports long-lived WebSocket connections; serverless hosts don't |

Not used, on purpose: Redux (the server owns state; the client has one room context), Redis (a single instance is enough at this scale; see limitations), TypeScript, Docker.

## 6. Architecture overview

```
client/ React app ── REST (create/join) ──▶ server/ Express controllers → services
       └──────────── Socket.IO (room + game events) ──▶ socket adapters → roomService / gameEngine → games/<id>
                                                                                        └─▶ MongoDB (finished matches)
```

Details: **[docs/architecture.md](docs/architecture.md)** · API and events: **[docs/socket-events.md](docs/socket-events.md)** · rules for every game: **[docs/game-rules.md](docs/game-rules.md)** · manual test plan: **[docs/testing-checklist.md](docs/testing-checklist.md)**

## 7. MVC responsibilities

| Layer | Where | Responsibility |
|---|---|---|
| Model | `server/src/models/GameHistory.js` | Persistent schema for finished matches |
| View | `client/src/pages`, `components`, `features/games/*/View.jsx` | Rendering only; no rules, no database |
| Controller | `server/src/controllers`, `routes`; `server/src/sockets` for real-time events | Parse input, authorise, delegate, respond |
| Service | `server/src/services` | Room rules, sessions, the game engine, timers, history |
| Game modules | `server/src/games/<name>/` | Each game's rules, phases, scoring and private views |
| Client controller | `client/src/features/room/roomController.js` | Owns the socket; exposes room state and actions to the views |

## 8. Room and multiplayer workflow

1. **Create:** `POST /api/rooms` validates the name, game and settings, generates a unique code on the server, creates the host's seat and returns `{roomCode, playerId, token}`.
2. **Join:** the join page calls `GET /api/rooms/:code` while you type, to show problems early, then `POST /api/rooms/:code/join`.
3. **Connect:** the browser stores the seat in `localStorage` and opens a socket with it as `auth`. The server verifies the token hash and puts the socket in the room's channel and a private player channel.
4. **Lobby:** every change (join, leave, ready, settings, host transfer) emits a fresh `room:state` to each player.
5. **Play:** moves are `game:action {type, payload}`. The game module validates the phase, turn and payload, updates state, and every player receives their own filtered view. Deadlines are enforced by a server timer.
6. **Results:** the engine stores the results on the room, saves them to MongoDB, and moves everyone to the results screen. The host can rematch (fresh state) or pick another game.

## 9. Game rules

Every game's settings, phases, actions, scoring, timeouts, privacy rules and limitations are in **[docs/game-rules.md](docs/game-rules.md)**. Physical-world games (Charades, Heads Up, Freeze Dance, Sardines, Scavenger Hunt) are honest about it: players or the host record results, and the app does not pretend to verify speech, movement or location.

## 10. Local installation

Requires Node.js 20+.

```bash
git clone https://github.com/pranjal07vk/playhive.git
cd playhive
npm run install:all
cp server/.env.example server/.env    # optional: add MONGODB_URI
npm run dev:server                    # API + Socket.IO on http://localhost:4000
npm run dev:client                    # in a second terminal: http://localhost:5173
```

Open http://localhost:5173 in two different browsers (or one normal and one private window) to play against yourself.

## 11. Environment variables

**server/.env**

| Variable | Example | Purpose |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `NODE_ENV` | `production` | |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster/playhive` | Match history. Optional: without it the games still work and history is disabled |
| `CLIENT_ORIGINS` | `http://localhost:5173` | Comma-separated origins allowed by CORS and Socket.IO |
| `CLIENT_DIST` | `../client/dist` | When set, Express also serves the built React app |

**client/.env** (development only)

| Variable | Example | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000` | API base. Leave unset in production, where the app and API share an origin |

Real `.env` files are git-ignored. Only `.env.example` files are committed.

## 12. Testing

```bash
npm test          # 130 server tests: room flows over real sockets + rules for all 15 games
npm run build     # production build of the client
```

* `server/test/rooms.integration.test.js` starts a real server and drives it with socket clients: validation, host-only actions, duplicate votes, a full game, rematch, host transfer, and joining while a game is running.
* `server/test/games/*.test.js` covers every game: a full game played to the end with exact scores, invalid and out-of-turn moves, duplicate actions, timeouts, players leaving, and **privacy** (secret words, roles, hands and votes never appear in other players' views).
* An end-to-end smoke test with headless Chrome (3–6 real browser clients per game, desktop + 375px mobile) played every game with no crashes, no console errors and no mobile horizontal overflow.
* Manual checklist: [docs/testing-checklist.md](docs/testing-checklist.md).

## 13. Deployment

The repo includes a Render Blueprint (`render.yaml`): one web service that builds the client and runs the server, which serves both the API and the app.

1. Create a free MongoDB Atlas cluster, add a database user, and allow network access from `0.0.0.0/0`.
2. In Render: **New → Blueprint**, then pick this repository.
3. Set `MONGODB_URI` when prompted. `NODE_ENV`, `CLIENT_DIST` and the health check are preconfigured.
4. Check `https://<your-app>.onrender.com/api/health`; it should report `"database": "connected"`.

Why not Vercel/Netlify alone: serverless functions can't hold the long-lived Socket.IO connections the games depend on.

## 14. Public URL

**https://playhive-t8t4.onrender.com** (Render web service + MongoDB Atlas). Health check: https://playhive-t8t4.onrender.com/api/health

## 15. Known limitations

* Active rooms are in memory: a server restart ends running games, and scaling past one instance would need Redis and the Socket.IO Redis adapter.
* Render's free plan sleeps after 15 idle minutes; the first request can take about 50 seconds.
* Guest seats are per browser; clearing site data means joining again.
* Scavenger Hunt takes text proof only (no photo uploads).
* Mafia has no round limit, so a long run of doctor saves and skipped votes can stretch a game; the host can end it from the side panel.

## 16. Future improvements

Redis-backed rooms for zero-downtime deploys, photo proof via object storage, custom prompt packs made by the host, spectator mode for late joiners, team modes for Heads Up and Charades, and optional accounts with persistent stats.
