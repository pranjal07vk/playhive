# Testing checklist

Legend: ✅ verified · ⬜ to verify on the deployed site

## Automated (run on every change)

| Check | Command | Status |
|---|---|---|
| 130 server tests (room integration over real sockets + rules for all 15 games) | `npm test` | ✅ passing |
| Client production build | `npm run build` | ✅ passing |
| Headless-Chrome smoke test: every game started with 3–6 real browser clients, phases clicked through, desktop + 375px mobile | scratch script (puppeteer-core) | ✅ no crashes, no console errors, no horizontal overflow |
| Full two-browser Would You Rather game (desktop host + 390px guest) through results | scratch script | ✅ |

## Manual multiplayer pass (two or more devices)

| Area | Steps | Expected |
|---|---|---|
| Create | Create a room with a 1-character name | Inline "at least 2 characters" error |
| Join with a bad code | Type `ZZZZZ` | "We could not find that room…" before entering a name |
| Join a full room | Fill a game to its max, then join again | "This room is full…" |
| Join mid-game | Join while a game is running | "A game is already underway…" |
| Duplicate name | Join with the host's name in different capitals | "Someone in this room is already called…" |
| Invite link | Open `/join/<CODE>` | Code prefilled, room preview shown |
| Live lobby | Join, ready up, and leave from a second device | Every device updates instantly |
| Host-only | A guest tries to change settings | Controls disabled; the server also rejects (`HOST_ONLY`) |
| Too few players | Start Mafia with 3 players | Start disabled with a "Need 3 more players" message |
| Refresh | Reload mid-game | Same seat, same game, same private info |
| Network drop | Turn Wi-Fi off for 10s | "Reconnecting…" banner, others see "Reconnecting…", state restores |
| Host leaves | The host taps Leave | The next player becomes host and the game continues |
| Kick | The host removes a player | That player sees "The host removed you" |
| Secrets | Pictionary/Mafia/Colour Clash on two devices | Word/roles/hand visible only to the right player |
| Duplicate votes | Double-tap a vote | Counted once |
| Timers | Let a timer expire | The game advances on its own, the same moment on all devices |
| Results | Finish a game, then Rematch | Clean state: round 1, no old votes or scores |
| Reduced motion | Enable the OS "reduce motion" setting | No confetti or spinning; Spin the Bottle shows the result immediately |
| Keyboard | Tab through create → lobby | Visible focus ring everywhere; game picker usable with arrow keys |
| Widths | 360, 390, 768, 1024, 1440 | No horizontal scroll; main actions visible |

## Production

| Check | Status |
|---|---|
| `/api/health` returns `status: up`, `database: connected` | ✅ 27 Oct 2026 |
| Fresh headless browsers on the live URL: create → join at 390px → 8-round game → results | ✅ |
| Match saved (results screen shows "Saved to match history"; `/api/history` lists it) | ✅ |
| Pictionary strokes sync between devices over production WebSockets | ✅ |
| 6-player Mafia started and played to results on the live URL | ✅ |
| Real phones on mobile data (not just emulated widths) | ⬜ do this while recording the demo |
