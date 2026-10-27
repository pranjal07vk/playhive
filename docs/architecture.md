# PlayHive architecture

PlayHive is a single Node.js service that serves three things from one origin:

1. the **React app** (built by Vite into `client/dist`),
2. a small **REST API** (`/api/...`) used before a player has a seat, and
3. a **Socket.IO** endpoint that carries everything that happens inside a room.

```
 Browser (React)                                   Node.js (Express + Socket.IO)
 ───────────────                                   ─────────────────────────────
 pages / components  ──HTTP──▶  routes → controllers → roomService ──┐
        │                                                           │
 roomController hook ◀─WebSocket─▶ sockets/ (thin adapters) → roomService / gameEngine
        │                                                           │
 game View.jsx  ◀── personalised room:state ◀── viewFor(player) ◀── games/<id>/index.js
                                                                    │
                                              historyService ──▶ MongoDB (finished matches)
```

## Why this shape

| Decision | Reason |
|---|---|
| **Server-authoritative game state** | Every move is a request. The server checks the phase, the turn and the payload, applies the rules, and sends each player a fresh view. A player cannot make themselves win, see someone's cards, or pick a "random" result by editing JavaScript in the browser. |
| **Socket.IO for gameplay, REST for create/join** | Creating or joining a room is a one-off request/response that needs good error messages, so it uses REST. Gameplay is many small, bidirectional, low-latency events, so it uses a persistent WebSocket. Socket.IO adds reconnection, rooms and acknowledgements on top of WebSockets. |
| **In-memory active rooms** | Room and game state changes several times per second (votes, strokes, timers). Keeping it in memory makes it fast and simple. **Trade-off:** rooms are lost when the server restarts, and the app cannot run on more than one server instance without a shared store (Redis plus the Socket.IO Redis adapter). That is acceptable for this project and documented as a limitation. |
| **MongoDB only for finished matches** | Only data worth keeping after a game is saved: the game, the players, the final ranking and highlights (`GameHistory` model). Saving every vote or brush stroke would add latency for no benefit. The app keeps working if MongoDB is down; only history is disabled. |
| **Guest sessions, no accounts** | Signing up is friction a party game does not need. Each seat gets a random `playerId` and a 192-bit token. The server stores only a SHA-256 hash of the token. The browser keeps `{roomCode, playerId, token}` in `localStorage`, which is how a refresh or a dropped connection gets back the same seat. |
| **One deploy (Express serves the client)** | Same-origin hosting means no CORS setup between two hosts, no third-party cookies, one URL to share, and one thing to keep awake on a free plan. |

## MVC on the server

| Layer | Folder | What belongs there |
|---|---|---|
| **Model** | `server/src/models/` | Mongoose schemas for persistent data: `GameHistory`. Nothing temporary lives here. |
| **View** | The React client | The server never renders HTML. Its "view" output is the JSON produced by `publicRoom()` and each game's `view()`. |
| **Controller** | `server/src/controllers/` + `routes/` | Parse HTTP input, call a service, shape the response. No game rules. |
| **Socket adapters** | `server/src/sockets/` | The controllers for real-time events: authenticate the socket, rate-limit, check the payload shape, call a service, acknowledge. No game rules either. |
| **Services** | `server/src/services/` | Business logic shared by REST and sockets: `roomService` (rooms, seats, host rules), `gameEngine` (runs game modules, timers, finishing), `sessionService`, `historyService`, `timerService`. |
| **Game modules** | `server/src/games/<name>/` | One folder per game, holding its rules and content. See *Game module contract* below. |

Services never import Socket.IO. When a room changes, `roomService` and `gameEngine` emit `room:changed` on an internal `EventEmitter` (`services/events.js`), and `sockets/index.js` decides who receives what. That keeps business logic testable without a network.

## MVC-inspired structure on the client

| Concern | Folder |
|---|---|
| Pages, one per route | `client/src/pages/` |
| Reusable presentational components | `client/src/components/{common,layout,room,game,feedback}` |
| Controller and state for a live room | `client/src/features/room/roomController.js` (`useRoomConnection`), with React context in `roomState.js` |
| Per-game screens | `client/src/features/games/<game-id>/View.jsx` (+ optional `Reveal.jsx` for results) |
| HTTP and socket services | `client/src/services/` |
| Shared hooks | `client/src/hooks/` (`useRoom`, `useGameTimer`, `useSocketEvent`) |
| Design tokens and global styles | `client/src/styles/` |

The client never decides an outcome. It renders the latest `room:state` and sends requests (`act('vote', {choice: 1})`). The screen changes only when the server's answer arrives.

## Room lifecycle

```
Landing → Create (REST) ─┐
                         ├─▶ Lobby ──host: start──▶ Playing ──game finishes──▶ Results
Join (REST) ─────────────┘     ▲                       │                        │
                               └──── host: end game ───┘◀──── host: rematch ────┤
                               └──────────── host: choose another game ─────────┘
```

* `status` is `lobby`, `playing` or `results`, and only the server changes it. One URL (`/room/:code`) shows whichever screen matches.
* **Joining** is allowed in `lobby` and `results`, and blocked in `playing`. A player who already has a seat can always reconnect.
* **Room codes** are 5 characters from an alphabet without look-alikes (no 0/O, 1/I/L, U). That gives 30⁵ ≈ 24 million codes, generated with `crypto.randomInt` and checked against active rooms for collisions.
* **Host transfer:** if the host leaves, or stays disconnected for 30 seconds, the longest-present connected player becomes host. If everyone leaves, the room closes.
* **Cleanup:** a room is deleted after everyone has been offline for 10 minutes, or after 3 hours with no activity.

## Game module contract

Every game is a plain object in `server/src/games/<folder>/index.js`:

```js
export default {
  meta:     { id, name, minPlayers, maxPlayers, howToPlay, ... },
  settings: [{ key, label, type: 'number' | 'select' | 'boolean', ... }],
  create(ctx)                  // → initial state
  actions:  { vote(state, ctx) { ... }, next(state, ctx) { ... } },
  onTimeout(state, ctx)        // when state.deadline passes
  onPlayerLeft(state, ctx)     // someone left mid-game
  summarize(state, ctx)        // ranking so far (used when a game ends early)
  view(state, playerId, ctx)   // exactly what this player may see
}
```

`ctx` holds the roster, connected ids, host id, validated settings, the random generator and the current time. The **registry** imports every folder automatically, and the client's `gameRegistry.js` does the same with `import.meta.glob`. Adding a game means adding two folders; no other code changes.

The engine (`services/gameEngine.js`) does everything games share:

* validates settings against the definitions (`validateSettings`)
* checks the player is in the game, and that the action exists, before calling it
* schedules one timer per room for `state.deadline`
* when `state.finished` is set, stores the results on the room, saves history, and moves the room to `results`
* ends the game early if leavers bring it below `minPlayers`
* `viewFor(room, playerId)` builds each player's private view

### Public, private and internal state

Each game's `view()` is an **allow-list**: it builds a new object with only the fields that player may see. The full state object is never sent. For example:

* **Mafia:** only mafia players get their teammates. The detective alone sees investigation results. Roles are revealed only on death or at the end.
* **Pictionary:** only the drawer's view contains the word; guessers get a hint pattern. Correct guesses are never echoed into the public feed.
* **Colour Clash:** each player gets their own hand. Opponents are card counts only, and the draw pile order is never sent.
* **Would You Rather / Never Have I Ever:** individual votes appear only after the reveal, and never in anonymous mode.

Every game has privacy tests in `server/test/games/`.

## Timers

Games store an absolute `deadline` (epoch milliseconds) in their state. The engine schedules a single `setTimeout` per room. Clients receive the deadline plus `serverNow` with every state, and compute a clock offset. Every device counts down to the same moment even if its own clock is wrong, and an expired timer is always resolved by the server, never by a client.

## Security and abuse handling

* `helmet` with a strict Content-Security-Policy (only same-origin scripts; Google Fonts allowed).
* CORS: an allow-list from `CLIENT_ORIGINS`, plus the deployed URL.
* JSON bodies are limited to 20 KB, and unknown fields are rejected.
* Rate limits: 120 API requests per minute per IP, 20 room creates or joins per minute per IP, 12 socket events per second per socket (40 per second for drawing).
* Socket.IO `maxHttpBufferSize` is 64 KB. Drawings are capped at 200 points per message and 30,000 per drawing.
* User text is trimmed, stripped of control characters and length-limited on the server. React escapes it on output.
* Errors sent to clients are always `{ code, message }`, with no stack traces. Unexpected errors are logged on the server and reported to the client as a generic message.

## Known limitations

* Active rooms live in memory: a restart ends running games, and horizontal scaling would need Redis.
* Guest seats are per-browser. Clearing site data means rejoining as a new player.
* Physical games (Charades, Heads Up, Freeze Dance, Sardines, Scavenger Hunt) rely on humans to judge. The app records results; it does not verify speech, movement, location or photos.
* Scavenger Hunt accepts text proof only. Photo upload would need object storage, which the free hosting plan does not include.
