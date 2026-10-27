# API and Socket.IO contract

All errors share one shape: `{ code: 'MACHINE_READABLE', message: 'Safe to show to players.' }`.

## REST (`/api`)

| Method & path | Body | Success | Errors |
|---|---|---|---|
| `GET /api/health` | – | `{ ok, status: 'up', database: 'connected' \| 'offline', activeRooms, time }` | – |
| `GET /api/games` | – | `{ ok, games: [{ id, name, tagline, minPlayers, maxPlayers, duration, vibe, howToPlay[], settings[] }] }` | – |
| `POST /api/rooms` | `{ name, gameId, settings? }` | `201 { ok, session: { roomCode, playerId, token }, room }` | `INVALID_NAME`, `UNKNOWN_GAME`, `INVALID_BODY`, `RATE_LIMITED` |
| `GET /api/rooms/:code` | – | `{ ok, room: { code, gameId, status, capacity, playerCount, hostName }, joinable: { ok, code?, message? } }` | `INVALID_CODE` (400), `ROOM_NOT_FOUND` (404) |
| `POST /api/rooms/:code/join` | `{ name }` | `201 { ok, session, room }` | `INVALID_CODE`, `ROOM_NOT_FOUND`, `INVALID_NAME`, `NAME_TAKEN` (409), `ROOM_FULL` (409), `GAME_IN_PROGRESS` (409), `RATE_LIMITED` |
| `GET /api/history` | – | `{ ok, matches: [...] }` (latest 6) | – |
| `GET /api/history/:id` | – | `{ ok, match }` | `NOT_FOUND`, `HISTORY_UNAVAILABLE` (503) |

The `token` is shown once and only stored client-side. The server keeps a SHA-256 hash of it.

## Socket.IO

### Connecting

```js
io(URL, { auth: { roomCode, playerId, token } })
```

The `authenticate` middleware checks the seat. A connection attempt is rejected with `connect_error` carrying `err.data = { code, message }`. The code is `SESSION_INVALID` (unknown player or wrong token) or `ROOM_NOT_FOUND`.

On connect, the socket joins two Socket.IO rooms: `room:<CODE>`, for broadcasts and relays, and `player:<id>`, for private state. It immediately receives a `room:state`.

### Client → server

Every event can take an acknowledgement callback, answered with `{ ok: true }` or `{ ok: false, error }`. Failures are also pushed as `server:error` to the sender. Payloads must be plain objects. Each socket may send at most 12 events per second, plus 40 drawing events per second.

| Event | Payload | Who | Validation |
|---|---|---|---|
| `room:select-game` | `{ gameId }` | host | room not playing; game exists |
| `room:update-settings` | `{ settings: { key: value } }` | host | room not playing; values clamped to the game's definitions |
| `room:ready` | `{ ready: boolean }` | anyone | – |
| `room:start-game` | – | host | not already playing; player count within the game's min/max |
| `room:return-lobby` | – | host | ends any running game without results |
| `room:kick` | `{ playerId }` | host | not yourself; target must be in the room |
| `room:leave` | – | anyone | removes the seat; transfers host; may end the game if too few remain |
| `game:action` | `{ type, payload }` | players in the game | `type` must be one of that game's actions; the game module validates the phase, turn and payload |
| `game:draw` | `{ type: 'stroke' \| 'clear' \| 'undo', payload }` | the current drawer (Pictionary) | the same path as `game:action`, with a larger rate limit; strokes are validated and size-capped |

Gameplay deliberately uses one event (`game:action`) rather than an event per move. The engine looks up `actions[type]` in the game module. That keeps the socket layer identical for all 15 games, and a move that doesn't exist is rejected as `UNKNOWN_ACTION`. Each game's actions are listed in [game-rules.md](game-rules.md).

### Server → client

| Event | Sent to | Payload |
|---|---|---|
| `room:state` | each player privately (`player:<id>`) after every change | `{ room, game, you, serverNow }` (see below) |
| `room:closed` | the whole room, or a kicked player | `{ reason }`; the client clears its seat and shows a closed screen |
| `server:error` | the sender | `{ code, message }` |
| `draw:stroke` | everyone in the room except the drawer | `{ stroke: { id, color, size, tool, points: [[x, y], …] } }` |
| `draw:clear` | everyone in the room except the drawer | `{}` |
| `draw:undo` | everyone in the room except the drawer | `{ id }` |

### `room:state` shape

```js
{
  you: 'player-id',
  serverNow: 1793061194147,          // for clock-offset correction
  room: {
    code, hostId, gameId, settings, status: 'lobby' | 'playing' | 'results',
    capacity, minPlayers,
    players: [{ id, name, avatar, connected, ready, isHost }],
    lastResults: null | { gameId, gameName, headline, ranking: [{ playerId, name, score, rank, note }],
                          highlights: [], reveal, endedEarly, historyId }
  },
  game: null | {
    id, phase, deadline,             // epoch ms or null
    roster: [{ id, name }],          // players at game start
    spectating: boolean,
    view: { ... }                    // game-specific; only what THIS player may see
  }
}
```

`room:state` is sent per player, not broadcast. Two players in the same Mafia game receive different `game.view` objects.

### Error codes

| Code | Meaning |
|---|---|
| `HOST_ONLY` | A non-host tried a host action |
| `WRONG_PHASE` | The move isn't valid in the current phase |
| `NOT_YOUR_TURN` | Out-of-turn move |
| `NOT_IN_GAME` | Joined after the game started |
| `INVALID_CHOICE`, `INVALID_PAYLOAD`, `INVALID_TARGET` | Bad input |
| `NOT_ENOUGH_PLAYERS`, `TOO_MANY_PLAYERS` | Start blocked by player count |
| `GAME_IN_PROGRESS` | Join or settings change while playing |
| `RATE_LIMITED` | Too many events or requests |
| `TOO_LATE` | Submission after a deadline |
| `OFFLINE`, `TIMEOUT` | Client-side: no connection, or no acknowledgement within 8s |

Game modules add their own codes, such as `NO_SKIPS_LEFT`, `ALREADY_GUESSED`, `COLOR_REQUIRED` and `DRAWING_FULL`, always with a friendly message.

### Reconnection

Socket.IO retries automatically (0.8s, backing off to 5s). The `{roomCode, playerId, token}` in `localStorage` reclaims the same seat after a refresh or network change. While a player has no open socket they show as "Reconnecting…" to the others. A host who stays away for 30 seconds loses host to the next connected player. Games skip or time out a disconnected player's turn, so the room is never stuck waiting.
