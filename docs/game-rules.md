# PlayHive game rules reference

This is the rulebook for all 15 games, written from the server modules in `server/src/games/*/index.js`. The server is authoritative: every rule below is enforced on the server, and a client can only send requests (actions) that the server checks.

Games are listed in registry order (`meta.order`).

## Contents

1. [Truth or Dare](#1-truth-or-dare)
2. [Would You Rather](#2-would-you-rather)
3. [Never Have I Ever](#3-never-have-i-ever)
4. [Two Truths and a Lie](#4-two-truths-and-a-lie)
5. [Heads Up](#5-heads-up)
6. [Charades](#6-charades)
7. [Pictionary](#7-pictionary)
8. [Mafia](#8-mafia)
9. [Hot Seat](#9-hot-seat)
10. [Scavenger Hunt](#10-scavenger-hunt)
11. [Spin the Bottle](#11-spin-the-bottle)
12. [Colour Clash (UNO-style)](#12-colour-clash-uno-style)
13. [Telephone](#13-telephone)
14. [Freeze Dance](#14-freeze-dance)
15. [Sardines](#15-sardines)

---

## The game-module contract

### What a module is

Every game is a plain object, the default export of `server/src/games/<folder>/index.js` (see `server/src/games/baseGame.js`):

| Member | Purpose |
|---|---|
| `meta` | `{ id, order, name, tagline, minPlayers, maxPlayers, duration, vibe, howToPlay }` |
| `settings` | List of host-configurable settings: `number` (min, max, default, optional step), `select` (options), or `boolean` |
| `create(ctx)` | Builds fresh state for a new game. A rematch calls it again, so a rematch always starts clean. |
| `actions` | `{ [type]: (state, ctx) => result? }`. Each one validates the move and changes state. |
| `onTimeout(state, ctx)` | Called by the engine once `state.deadline` (ms epoch) has passed |
| `onPlayerLeft(state, ctx)` | A participant left the room mid-game (only called while enough players remain) |
| `summarize(state, ctx)` | `{ headline, ranking, highlights }` for the current state; used if the game ends early |
| `view(state, playerId, ctx)` | Exactly what one player may see. Secrets are filtered here. |

### What a module receives

`ctx` is built by the engine (`server/src/services/gameEngine.js`) for every call:

- `players`: the roster at game start, `[{ id, name }]`
- `connected`: a Set of the ids that are connected right now
- `hostId`: the current host. This can change if the host leaves.
- `settings`: the validated settings
- `rng`: `{ int(max) }`. Seeded in tests so games are repeatable.
- `now`: the current time in ms
- for actions only: `playerId` and `payload`

### Shared rules

- **Settings validation:** `validateSettings` rounds numbers and clamps them to `[min, max]`. Unknown select values and non-boolean values fall back to the default. A client therefore cannot send an out-of-range setting.
- **Rejecting a move:** an invalid move calls `fail(code, message)`, which throws an `AppError`. The engine sends `server:error` to that player only, and nothing is broadcast. `requirePhase(state, ...phases)` rejects moves made in the wrong phase with `WRONG_PHASE`. The shared helpers add `NOT_IN_GAME`, `NOT_YOUR_TURN` and `INVALID_CHOICE`.
- **Checks before any action runs:** the engine rejects an unknown action type (`UNKNOWN_ACTION`) and a player who is not on the roster, for example someone who joined mid-game and is spectating (`NOT_IN_GAME`).
- **Duplicates:** repeated clicks are either ignored or rejected. Turn-based games carry a token (`turn`, `spinId`, `wordId`) so a stale or doubled tap can never advance a turn twice.
- **Starting a game:** the engine refuses to start below `minPlayers` or above `maxPlayers`.
- **Deadlines:** setting `state.deadline` schedules a timer, and `null` cancels it. Every waiting phase has a deadline, so an AFK player cannot stall a room.
- **Ending a game:** `state.finished = true` plus `state.results = { headline, ranking, highlights, reveal? }`. The engine builds the results screen and saves match history. `ranking` comes from `ranking(scores)`: highest first, and equal scores share a rank.
- **Leaving:** "leaving" means removed from the room. It does not mean temporarily disconnected; a disconnected player keeps their seat. When someone leaves:
  - If fewer than `minPlayers` remain, the engine ends the game early with `summarize()` and the headline "Too many players left".
  - Otherwise it calls `onPlayerLeft`, and modules record the player with `markLeft`.
- **Host changes:** if the host leaves, the host role moves at once to the longest-standing connected player. A disconnected host keeps the role for a short grace period, then it moves.
- **What is sent to clients:** `{ id, phase, deadline, roster, spectating, view }`. `view` is the module's `view()` for that player.

### How a game plugs in

- **Server:** add a folder `server/src/games/<camelCaseName>/` with an `index.js`, usually plus `content.js` for prompt banks. `server/src/games/registry.js` imports every folder that has an `index.js` (except `shared`) and sorts by `meta.order`. Nothing else on the server changes.
- **Client:** add `client/src/features/games/<game-id>/View.jsx`. The folder name must equal `meta.id`. An optional `Reveal.jsx` shows `results.reveal` on the results screen. `client/src/features/games/gameRegistry.js` finds both with `import.meta.glob` and lazy-loads them.
- **Catalogue:** the marketing cards also read display details from `client/src/features/games/catalog.js`.
- **Tests:** each module has unit tests in `server/test/games/<camelCaseName>.test.js` that drive the module directly with a seeded rng.

### A note for every game

The engine sends `state.deadline` to everyone as the top-level `deadline`. A game that wants to keep a time secret (Freeze Dance) can hide it in its own view, but the top-level field still carries it. This is listed under each affected game.

---

## 1. Truth or Dare

- **id:** `truth-or-dare`
- **Players:** 3–12
- **Pitch:** On your turn, pick truth or dare, then do it in front of everyone for a point.

### Settings

| Key | Range | Default |
|---|---|---|
| `rounds` | 1–5 (one turn each per round) | 2 |
| `intensity` | `mild` / `spicy` (spicy adds bolder prompts to the mild pool) | `mild` |
| `category` | `mix` / `classic` / `campus` / `online` | `mix` |
| `skipsPerPlayer` | 0–3 (for the whole game) | 1 |

### Phases

`choosing → prompt → choosing (next player) → … → finished`

The turn order is shuffled once and repeats every round.

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `choose` | current player | `{ kind: 'truth' \| 'dare' }` | phase `choosing`, participant, their turn, kind in the list |
| `done` | current player | `{ turn? }` | phase `prompt`, their turn. A stale `turn` is ignored. |
| `skip` | current player | `{ turn? }` | as `done`, plus skips left > 0 (else `NO_SKIPS`) |
| `skipTurn` | host | `{ turn }` (required integer) | phase `choosing` or `prompt`. A stale `turn` is ignored, so a double click skips only one person. |

### Scoring

+1 for each completed turn (`done`). A skip, a timeout or a host skip scores nothing.

### Timeouts

- `choosing`, 30 s: a random kind is picked for the player. If the player is offline, the turn is lost instead (`away`).
- `prompt`, 90 s: the turn counts as a pass with no point.

### Disconnect and leave

- When a turn comes up, players who are disconnected or have left are skipped and logged as `away`. If nobody at all is connected, no turns are skipped.
- If the current player leaves, their turn ends (`left`) and play moves on.

### Privacy

Nothing is secret. The prompt is shown to everyone during `prompt`, and only then.

### End condition

After `rounds` times the number of players turns. Skipped turns still use up their slot.

### Limitations

- The app cannot see or hear anyone. The player taps Done and the group keeps them honest.
- A turn skipped because someone was offline is not made up later.

---

## 2. Would You Rather

- **id:** `would-you-rather`
- **Players:** 2–20
- **Pitch:** Two options, everyone votes in secret, and siding with the majority scores.

### Settings

| Key | Range | Default |
|---|---|---|
| `rounds` | 3–20 questions | 8 |
| `voteSeconds` | 10–60 (step 5) | 20 |
| `category` | `mix` / `campus` / `food` / `life` / `chaos` | `mix` |
| `anonymous` | boolean (hide who voted for what) | false |

### Phases

`voting → reveal → voting → … → finished`

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `vote` | any participant | `{ choice: 0 \| 1 }` | phase `voting`, participant, choice 0 or 1. A second vote is ignored (votes are locked). |
| `next` | host | none | phase `reveal` |

### Scoring

+1 to every voter on the majority side. A tie gives nobody a point.

### Timeouts

- `voting`, `voteSeconds`: reveal with whatever votes are in.
- `reveal`, 7 s: next question.

### Disconnect and leave

- Disconnected players are not skipped; voting simply waits for the timer.
- A player who leaves has their vote removed. If everyone remaining has voted, the reveal happens immediately.

### Privacy

- Before the reveal, others see only who has voted (`votedIds`), and each player sees only their own vote.
- At the reveal everyone sees the tally. They also see the per-player votes, unless `anonymous` is on.

### End condition

After `rounds` questions.

### Limitations

- It is a majority game, so a split vote scores nothing.
- In a small group, an anonymous tally can still give answers away.

---

## 3. Never Have I Ever

- **id:** `never-have-i-ever`
- **Players:** 3–15
- **Pitch:** A "Never have I ever…" statement appears, and everyone secretly answers "I have" or "Never".

### Settings

| Key | Range | Default |
|---|---|---|
| `rounds` | 5–25 statements | 10 |
| `answerSeconds` | 10–60 (step 5) | 20 |
| `category` | `mix` / `campus` / `online` / `life` | `mix` |
| `lives` | 0–10 "fingers" each (0 = no scoring) | 5 |
| `privacy` | `named` (show who said "I have") / `anonymous` (counts only) | `named` |

### Phases

`answering → reveal → answering → … → finished`

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `answer` | any participant | `{ answer: 'have' \| 'never' }` | phase `answering`, participant, value in the list. The first answer sticks; repeats are ignored. |
| `next` | host | none | phase `reveal` |

### Scoring

**Lives mode** (`lives` > 0):
- Each "I have" costs one finger at the reveal.
- A player at 0 is out but can keep answering for fun.
- The ranking is by fingers left, so the most fingers wins and ties share a rank.

**No-lives mode** (`lives` = 0):
- Everyone scores 0.
- In named mode, the results note how many times each player said "I have".

### Timeouts

- `answering`, `answerSeconds`: reveal. A missing answer costs nothing and is left out of the counts.
- `reveal`, 8 s: next statement.

### Disconnect and leave

- Disconnected players are not skipped; the timer closes the round.
- A player who leaves has their answer removed. If everyone remaining has answered, the reveal happens immediately.

### Privacy

- Individual answers are never in anyone else's view before the reveal. Others see only who has answered.
- At the reveal everyone sees the "have" and "never" counts. Named mode adds `haveIds`.
- Anonymous mode never sends `haveIds`. It also hides other players' lives during the game, because a drop in someone's lives would reveal their answer; each player sees only their own (`myLives`).

### End condition

After `rounds` statements.

### Limitations

- Answers are self-reported.
- In anonymous lives mode, the final ranking shows each player's fingers left. That reveals their total number of "I have" answers, though never which statements.
- With 3 players, a count of 0 or 3 reveals everyone's answer.

---

## 4. Two Truths and a Lie

- **id:** `two-truths-and-a-lie`
- **Players:** 3–12
- **Pitch:** The storyteller writes three statements, one of them false. Everyone else votes for the lie.

### Settings

| Key | Range | Default |
|---|---|---|
| `roundsPerPlayer` | 1–2 turns each | 1 |
| `writeSeconds` | 30–180 (step 15) | 90 |
| `voteSeconds` | 10–90 (step 5) | 30 |

### Phases

`writing → voting → reveal → writing (next storyteller) → … → finished`

The storyteller order is shuffled once.

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `submit` | storyteller | `{ statements: [s1, s2, s3], lieIndex: 0–2 }` | phase `writing`, their turn. Must be exactly 3 strings, each cleaned to at most 120 characters and at least 3 long, all different (ignoring case). `lieIndex` must be 0, 1 or 2. |
| `vote` | participants except the storyteller | `{ choice: 0–2 }` | phase `voting`. The storyteller is rejected. One locked vote; repeats are ignored. |
| `next` | host | none | phase `reveal` |

### Scoring

- +2 to each voter who found the lie.
- +1 to the storyteller for each voter they fooled. Players who didn't vote don't count.

### Timeouts

- `writing`, `writeSeconds`: the storyteller's turn is skipped and recorded in `skipped`.
- `voting`, `voteSeconds`: reveal.
- `reveal`, 10 s: next turn.

### Disconnect and leave

- When a turn starts, storytellers who are disconnected or have left are skipped.
- If the storyteller leaves while writing, their turn is skipped.
- If a voter leaves, their vote is removed and the reveal may happen early.
- If the storyteller leaves during voting, the round still reveals, because the lie is already locked in.

### Privacy

- Before the reveal, `lieIndex` is sent only to the storyteller (as `myLie`).
- Before the reveal, others see only who has voted.
- The results `reveal` lists every storyteller's statements together with the lie.

### End condition

After every planned turn, including skipped ones.

### Limitations

- The app cannot check whether statements are true.
- Text is cleaned but not moderated.
- A submission cannot be edited once sent.

---

## 5. Heads Up

- **id:** `heads-up`
- **Players:** 3–12
- **Pitch:** The guesser can't see the word. Everyone else gives clues out loud.

### Settings

| Key | Range | Default |
|---|---|---|
| `turnSeconds` | 30–120 (step 15) | 60 |
| `category` | `mix` / `bollywood` / `sport` / `food` / `hostel` / `internet` | `mix` |
| `turnsPerPlayer` | 1–2 | 1 |

### Phases

`ready → playing → turnSummary → ready (next guesser) → … → finished`

The guesser order is shuffled once.

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `start` | guesser or host | none | phase `ready` |
| `correct` | any participant | `{ wordId }` | phase `playing`, participant. A `wordId` that isn't the current word is ignored, which stops stale or doubled taps. |
| `pass` | any participant | `{ wordId }` | same as `correct` |
| `next` | host | none | phase `turnSummary` |

### Scoring

- +1 to the guesser for each `correct`.
- Passes are unlimited and counted, with no penalty.

### Timeouts

- `ready`, 20 s: the turn starts automatically.
- `playing`, `turnSeconds`: the turn ends. The word on screen is logged as `timeUp`.
- `turnSummary`, 6 s: next turn.

### Disconnect and leave

- Guessers who are disconnected or have left are skipped when their turn comes up.
- If the guesser leaves during `ready`, play moves to the next turn. If they leave during `playing`, the turn ends.

### Privacy

The guesser's view has `word: null` and `log: null` until `turnSummary`. Everyone else sees the word.

### End condition

After every planned turn.

### Limitations

- The app cannot hear guesses; players mark them honestly.
- Any participant can tap Correct, including the guesser.

---

## 6. Charades

- **id:** `charades`
- **Players:** 3–12
- **Pitch:** Act out a secret word in silence while everyone else shouts guesses.

### Settings

| Key | Range | Default |
|---|---|---|
| `turnSeconds` | 30–180 (step 15) | 90 |
| `category` | `mix` / `movies` / `songs` / `actions` / `festivals` | `mix` |
| `skipsPerTurn` | 0–5 | 2 |
| `turnsPerPlayer` | 1–2 | 1 |

### Phases

`ready → acting → turnSummary → ready (next performer) → … → finished`

The performer order is shuffled once.

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `start` | performer or host | none | phase `ready` |
| `skip` | performer | `{ wordId }` | phase `acting`. A stale `wordId` is ignored. Skips used must be below `skipsPerTurn` (else `NO_SKIPS_LEFT`). |
| `guessed` | performer or host | `{ wordId, guesserId }` | phase `acting`. A stale `wordId` is ignored. `guesserId` must be an active player other than the performer. |
| `next` | host | none | phase `turnSummary` |

### Scoring

For each word guessed: +1 to the performer and +1 to the player credited with the guess.

### Timeouts

- `ready`, 20 s: acting starts.
- `acting`, `turnSeconds`: the turn ends. The word on screen is logged as `timeUp`.
- `turnSummary`, 8 s: next turn.

### Disconnect and leave

- Performers who are disconnected or have left are skipped when their turn comes up.
- If the performer leaves during `ready`, play moves to the next turn. If they leave during `acting`, the turn ends.

### Privacy

- Only the performer sees `word`.
- During `acting`, only the performer sees the word log. Everyone sees it in `turnSummary`.

### End condition

After every planned turn.

### Limitations

- The app cannot hear guesses, or tell whether the performer spoke. The performer or host credits the guesser honestly.

---

## 7. Pictionary

- **id:** `pictionary`
- **Players:** 3–12
- **Pitch:** Draw a secret word on a shared canvas. Guessers type, and faster guesses score more.

### Settings

| Key | Range | Default |
|---|---|---|
| `rounds` | 1–3 (turns each to draw) | 1 |
| `drawSeconds` | 45–120 (step 15) | 75 |
| `difficulty` | `mix` / `easy` / `desi` / `tricky` | `mix` |

### Phases

`choosing → drawing → roundEnd → choosing (next drawer) → … → finished`

The drawers go in roster order, `rounds` times.

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `choose` | drawer | `{ index: 0–2 }` | phase `choosing`, their turn, index of one of the 3 options |
| `guess` | participants except the drawer | `{ text }` | phase `drawing`. The drawer is rejected (`DRAWER_CANNOT_GUESS`), and so is anyone who already got it (`ALREADY_GUESSED`). Text is cleaned to at most 60 characters and must not be empty. |
| `stroke` | drawer | `{ stroke }` (sent on `game:draw`) | phase `drawing`. The stroke is validated: id, pen or eraser, palette colour, size 2–40, points inside the 0–1 canvas, at most 200 points per message, and at most 30,000 points per canvas (`DRAWING_FULL`). It is relayed as `draw:stroke` with no full broadcast. |
| `clear` | drawer | none | phase `drawing`. Relayed as `draw:clear`. |
| `undo` | drawer | none | phase `drawing`. Relayed as `draw:undo`. Does nothing if there is nothing to undo. |

### How a guess is handled

The guess and the word are compared after normalising both (lowercase, letters and digits only).

- **Correct:** announced as "X guessed it!". The guess text itself is never shown to anyone.
- **Near miss:** an edit distance of 1, for words longer than 4 characters. Only the guesser sees "So close!".
- **Answer inside a sentence:** only the guesser sees a note asking for one answer at a time.
- **Anything else:** posted to the public feed.

### Scoring

- Correct guessers score 5, 4, 3, 2, then 1 for everyone after that, in the order they got it.
- The drawer scores +2 per correct guesser, up to 10 per turn.

### Timeouts

- `choosing`, 15 s: a random word is picked for the drawer. If the drawer is offline, they lose the turn instead.
- `drawing`: the first deadline is halfway through, when one hint letter is revealed. The second deadline is `endsAt`, when the turn ends with reason `time`.
- `roundEnd`, 6 s: next turn. There is no host "next" button.

### Disconnect and leave

- A drawer who is offline or has left when their turn comes up loses that turn.
- The turn ends early once every connected guesser has guessed correctly.
- If the drawer leaves during `choosing`, play moves to the next turn. If they leave during `drawing`, the turn ends with reason `drawerLeft`.

### Privacy

- The three `options` go to the drawer only.
- `word` goes to the drawer while drawing, and to everyone at `roundEnd`.
- Guessers get a masked `hint` instead.
- Correct guess text is never broadcast, and each player's notes (`myNote`) are sent only to them.
- `strokes` are sent in the view so a player who reconnects can replay the drawing.

### End condition

When every drawer has had their turns.

### Limitations

- The app cannot stop a drawer from writing letters.
- Guesses must match the word's spelling. Synonyms don't count.
- The top-level `deadline` is the halfway mark at first, so the UI must use `view.endsAt` for the timer.

---

## 8. Mafia

- **id:** `mafia`
- **Players:** 6–12
- **Pitch:** Hidden roles. The Mafia kill at night, and the town votes by day.

### Settings

| Key | Range | Default |
|---|---|---|
| `nightSeconds` | 20–90 (step 5) | 40 |
| `discussionSeconds` | 30–300 (step 15) | 120 |
| `voteSeconds` | 15–90 (step 5) | 40 |

### Roles

- Mafia: 1 for 6–7 players, 2 for 8–10, 3 for 11–12.
- One Doctor and one Detective.
- Everyone else is a Villager.
- The server is the narrator, so the host plays normally.

### Phases

`roles → night → day → voting → night → … → finished`

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `ready` | any participant | none | phase `roles`. Repeats are ignored. |
| `nightTarget` | living Mafia | `{ targetId }` | phase `night`, alive, role Mafia. The target must be a living non-Mafia. The pick can be changed. |
| `protect` | living Doctor | `{ targetId }` | phase `night`, alive, role Doctor, living target. Self is allowed, but not the person protected last night. Repeating the same target does nothing; a different target is rejected (`ALREADY_ACTED`). |
| `investigate` | living Detective | `{ targetId }` | phase `night`, alive, role Detective, a living target that isn't themselves. Same repeat rule as `protect`. The result (`mafia` / `not mafia`) is recorded at once. |
| `skipDiscussion` | host | none | phase `day` |
| `vote` | living participant | `{ targetId }` or `{ targetId: null }` (skip) | phase `voting`, alive. The target must be alive and not themselves. The vote can be changed. |

### How the night is resolved

- The kill is the plurality of the Mafia picks. A tie is broken at random, and no picks means no kill.
- If the Doctor protected the target, nobody dies.
- The victim's role is announced.

### How the vote is resolved

- A player is eliminated only on a strict plurality: more votes than the skips and than every other player. Their role is revealed.
- A tie, or skip winning, means nobody is eliminated.

### Scoring

- +1 to each member of the winning team.
- +1 for surviving to the end.

### Timeouts

- `roles`, 15 s: night begins.
- `night`, `nightSeconds`: resolve the night.
- `day`, `discussionSeconds`: voting begins.
- `voting`, `voteSeconds`: resolve the vote.

Night ends early when every connected living role-holder has acted. Voting ends early when every connected living player has voted.

### Disconnect and leave

- Disconnected players are left out of the "waiting for" checks.
- A player who leaves is removed from the living quietly, and their role is not revealed.
- Their night picks and votes are deleted, along with any picks or votes that targeted them.
- If the Doctor leaves, tonight's protection is cleared.
- The win condition is re-checked after a departure.

### Privacy

- Each player sees only their own role.
- Mafia also see their teammates and the team's kill picks.
- The Detective sees only their own investigation results.
- The Doctor sees who they protected last night.
- Living players' roles are never shown, not even to dead players.
- After a vote resolves, `lastVote` shows publicly who voted for whom.
- The results `reveal` lists every role.

### End condition

- The town wins when no Mafia are alive.
- The Mafia win when living Mafia are at least as many as living non-Mafia.
- This is checked after every death or departure.

### Limitations

- Discussion happens on the call, not in the app.
- Dead players are trusted to stay quiet.
- There is no round limit, so a long run of saves and skipped votes can make the game drag.

---

## 9. Hot Seat

- **id:** `hot-seat`
- **Players:** 3–12
- **Pitch:** One player answers a four-option question about themselves, and everyone else predicts what they picked.

### Settings

| Key | Range | Default |
|---|---|---|
| `roundsPerPlayer` | 1–3 | 1 |
| `seconds` | 10–60 (step 5) | 25 |
| `category` | `mix` / `everyday` / `food` / `campus` / `whatIf` | `mix` |

### Phases

`answering → reveal → answering (next hot seat) → … → finished`

The hot seat rotates through a shuffled order, `roundsPerPlayer` times.

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `answer` | any participant | `{ choice: 0–3 }` | phase `answering`, participant, choice in 0–3. It counts as the honest answer from the hot-seat player and as a prediction from anyone else. The first submission is locked; repeats are ignored. |
| `next` | host | none | phase `reveal` |

### Scoring

- +1 to each correct predictor.
- The hot-seat player gets +1 for each correct predictor.
- If the hot-seat player never answers, or leaves, the round is void and nobody scores.

### Timeouts

- `answering`, `seconds`: reveal, which is void if the hot-seat player didn't answer.
- `reveal`, 8 s: next hot seat.

Answering closes early once every remaining player has submitted.

### Disconnect and leave

- A player who is offline or has left when their seat comes up is skipped. If nobody is connected, no seats are skipped.
- If the hot-seat player leaves during answering, the round is void (`reason: 'left'`).
- If another player leaves, their prediction is removed and the reveal may happen early.

### Privacy

- Before the reveal, others see only who has locked in, and whether the hot-seat player has answered.
- The real answer and every prediction appear only in `reveal`.

### End condition

When the seat queue is exhausted.

### Limitations

- The hot-seat player is trusted to answer honestly.
- `totalRounds` is the planned count, so the game can end earlier if seats are skipped.

---

## 10. Scavenger Hunt

- **id:** `scavenger-hunt`
- **Players:** 2–12
- **Pitch:** Hunters race to find real-world items and describe them as proof. The referee judges.

### Settings

| Key | Range | Default |
|---|---|---|
| `taskCount` | 3–10 | 6 |
| `minutes` | 2–15 | 5 |
| `category` | `home` / `campus` / `outdoors` / `online` | `home` |
| `mode` | `same` (one list for all) / `different` (own random list each) | `same` |

### Phases

`hunting → review → finished`

### Roles

The host at game start is the referee and does not hunt. Everyone else is a hunter. The referee stays fixed even if the host role changes later.

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `submit` | hunters | `{ taskId, text }` | Participant, not the referee. Phase must be `hunting` and the time no later than `endsAt` (else `TOO_LATE`). The task must be on the hunter's list. Text is cleaned to 3–200 characters. Resending the same text keeps the original timestamp; new text replaces the proof and its timestamp. |
| `endHunt` | referee | none | phase `hunting` |
| `judge` | referee | `{ hunterId, taskId, verdict: 'approve' \| 'reject' }` | phase `review`. The hunter must be real and must have submitted that task. Verdicts can be changed until `finishReview`. |
| `finishReview` | referee | none | phase `review` |

### Scoring

- 1 point per approved task.
- In `same` mode, +1 bonus for the earliest approved submission of each task. Equal timestamps share it.
- Anything still unreviewed at the end is approved automatically.

### Timeouts

- `hunting`, `minutes`: review. If nothing was submitted, or the referee has left, the game goes straight to results.
- `review`, 300 s: finish.

### Disconnect and leave

- A hunter who leaves keeps their finds.
- If the referee leaves, `refereeLeft` is set and everything is auto-approved. If this happens during `review`, the game finishes at once.

### Privacy

- During hunting, each hunter sees only their own sheet, plus everyone's submission counts.
- The referee sees every sheet.
- In `review`, every sheet is shown to everyone.

### End condition

The referee taps `finishReview`, the review timer runs out, or the game skips review as described above.

### Limitations

- Proof is a text description only; photo upload is not implemented.
- The app cannot verify finds. The referee's judgement is final.
- Editing a proof resets its timestamp, which can lose the first-finder bonus.

---

## 11. Spin the Bottle

- **id:** `spin-the-bottle`
- **Players:** 3–12
- **Pitch:** A friendly version, with no kissing. The bottle picks a player, who gets a truth, dare, question, compliment or challenge.

### Settings

| Key | Range | Default |
|---|---|---|
| `spins` | 5–30 total | 12 |
| `category` | `mix` (all 5 kinds) / `chatty` (truth, question, compliment) / `active` (dare, challenge, compliment) / `wholesome` (question, compliment, challenge) | `mix` |
| `skipsPerPlayer` | 0–3 | 1 |

### Phases

`ready → spun → ready (target becomes spinner) → … → finished`

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `spin` | current spinner | none | phase `ready`, participant, their turn |
| `done` | target | `{ spinId? }` | phase `spun`, their turn. A stale `spinId` is ignored. |
| `skip` | target | `{ spinId? }` | as `done`, plus skips left > 0 (else `NO_SKIPS`) |
| `skipTurn` | host | `{ spinId }` (required integer) | phase `ready` (spins for an idle spinner) or `spun` (passes an idle target). A stale `spinId` is ignored. |

### How a spin works

- **Target:** never the spinner, and connected players are preferred. The previous target is avoided when possible. The previous spinner is avoided only if at least two other choices remain; with 3 players, avoiding them would make every spin predictable.
- **Prompt:** the kind is picked at random from the category's kinds, then a prompt is drawn without repeats. `{spinner}` in the text is replaced with the spinner's name.
- **Animation:** `spinId` goes up by one on every spin. Clients animate the bottle to `seats[targetIndex]`.

### Scoring

+1 for each completed prompt. A skip or a timeout scores nothing.

### Timeouts

- `ready`, 30 s: automatic spin.
- `spun`, 90 s: a pass with no point.

### Disconnect and leave

- Offline players are not picked while anyone else is online.
- If the spinner leaves during `ready`, a random new spinner is chosen.
- If the target leaves during `spun`, that spin doesn't count and the same spinner spins again.
- Seats keep the positions of players who left, so the angles stay stable.

### Privacy

Nothing is secret. The target and prompt are shown to everyone after the spin.

### End condition

After `spins` resolved spins.

### Limitations

- The app cannot see whether the prompt was done; the group judges.

---

## 12. Colour Clash (UNO-style)

- **id:** `uno`
- **Players:** 2–10
- **Pitch:** A shedding card game. Match the colour or the symbol, mess with the next player, and empty your hand first.

### Settings

| Key | Range | Default |
|---|---|---|
| `turnSeconds` | 15–60 (step 5) | 30 |

### Phases

`playing → finished`

### The fixed variant

- **Deck of 108:**
  - For each of 4 colours: one 0, plus two each of 1–9, Skip, Reverse and Draw Two.
  - 4 Wild and 4 Wild Draw Four.
- **Deal:** 7 cards each. The starter card is always a number card.
- **A turn:** play a card that matches the colour or the value, or any Wild. Or draw 1 instead.
- **After drawing:** if the drawn card is playable, you may play only that card, or pass.
- **Skip:** the next player misses a turn.
- **Reverse:** flips the direction. With 2 players it acts as a Skip.
- **Draw Two / Wild Draw Four:** the next player draws 2 / 4 and is skipped. There is no stacking and no challenge.
- **Empty draw pile:** the discard pile, except its top card, is shuffled into a new draw pile.

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `play` | current player | `{ cardId, color? }` | Their turn. They must hold the card, and after a draw it must be the drawn card. It must be playable. A Wild needs a `color` from red, yellow, green, blue. |
| `draw` | current player | none | Their turn, and they haven't already drawn (`ALREADY_DREW`) |
| `pass` | current player | none | Only after drawing a playable card (`CANNOT_PASS`) |
| `callUno` | any participant | none | Holding 1 card, or 2 cards on their own turn. Repeats are ignored. |
| `catch` | any other participant | `{ targetId }` | The target is in `catchableIds`: they went down to 1 card without calling, and no move has been made since. The target draws 2. |

### Scoring

- The winner scores the card points left in everyone else's hands: face value for numbers, 20 for action cards, 50 for Wilds.
- Everyone else scores 0 and is ranked by fewest points left.

### Timeouts

The turn timer is `turnSeconds`. When it runs out, the player draws 1 and passes, or just passes if they had already drawn.

### Disconnect and leave

- Disconnected players' turns are skipped, unless nobody is connected. They still take draw penalties.
- A player who leaves has their cards shuffled back under the draw pile. If it was their turn, play moves on.

### Privacy

- Each player sees only their own hand.
- Everyone sees card counts, uno calls, the top card, the current colour and the pile sizes.

### End condition

The first player to empty their hand wins at once. A final Draw Two is not dealt.

### Limitations

- House rules are not supported: no stacking, no Draw Four challenge, no 7-0 swaps.
- "Catching" depends on someone noticing in time.

---

## 13. Telephone

- **id:** `telephone`
- **Players:** 4–12
- **Pitch:** Telestrations-style chains. Write a phrase, draw what you get, describe what you get, then watch every chain fall apart.

### Settings

| Key | Range | Default |
|---|---|---|
| `mode` | `draw` (draw and describe alternate) / `text` (rewrite from memory) | `draw` |
| `maxSteps` | 4–12 | 8 |
| `drawSeconds` | 30–120 (step 15) | 60 |
| `writeSeconds` | 20–90 (step 5) | 40 |

### Phases

`writing (step 0) → step → step → … → reveal → finished`

### How the chains work

- n players start n chains, and there are `min(n, maxSteps)` steps.
- At step k, player i works on chain `(i + k) mod n`.
- **Draw mode:** odd steps are drawings and even steps are text.
- **Text mode:** every step is text. The previous phrase is shown for 6 s (`showUntil`), then rewritten from memory.

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `useSuggestion` | any participant | none | Phase `writing`, before submitting. Stores a random starting phrase to prefill the input. |
| `submit` | any participant | `{ text }` | A text step and before the deadline (`TOO_LATE`). Text is cleaned to at most 80 characters and must not be empty. A second submit is ignored. |
| `submitDrawing` | any participant | `{ strokes }` | A drawing step and before the deadline. Strokes are validated: at most 400 strokes, at most 1,000 points per stroke, at most 8,000 points in total, and unique stroke ids. A second submit is ignored. |
| `nextReveal` | host | none | phase `reveal` |

### Scoring

There is no winner. Everyone scores 0.

### Timeouts

- **Each step:** the deadline is `drawSeconds` for drawing steps and `writeSeconds` for text steps, plus 6 s for a text-mode recall step. Missing entries are filled in:
  - a missing starting phrase becomes a random suggestion;
  - a missing text becomes "(they ran out of time)";
  - a missing drawing becomes a blank drawing.
- **Reveal:** 90 s per chain, then the next chain is shown automatically.

### Disconnect and leave

- Disconnected players are not skipped; they simply time out.
- A player who leaves gets "(they left the game)" or a blank drawing for the current step and every later step. Their chain still runs.

### Privacy

- Each player sees only the one previous entry of the chain they are working on, so nobody sees their own chain until the reveal.
- Other players' entries are never sent during the steps.
- In the reveal, one chain at a time is shown to everyone. The results `reveal` holds every chain.

### End condition

After the host or the timer moves past the last chain.

### Limitations

- In text mode the server stops sending the phrase only in views computed after `showUntil`. There is no extra broadcast at that moment, so the client must hide the phrase itself when `showUntil` passes.
- Text is cleaned but not moderated.

---

## 14. Freeze Dance

- **id:** `freeze-dance`
- **Players:** 3–20
- **Pitch:** Dance while the music plays and freeze when it stops. The DJ calls out anyone who moved.

### Settings

| Key | Range | Default |
|---|---|---|
| `maxRounds` | 3–15 | 8 |
| `pace` | `chill` (10–15 s songs) / `normal` (6–12 s) / `hyper` (5–8 s) | `normal` |

### Roles

The host is the DJ and referee and does not dance, unless fewer than 3 other players are in the game. In that case everyone, the host included, is a contestant.

### Phases

`dancing → frozen → dancing → … → finished`

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `eliminate` | DJ (current host) | `{ playerIds: [id, …] }` | Phase `frozen`. 1–20 string ids, all contestants. Players already out are ignored. |
| `reinstate` | DJ | `{ playerId }` | Phase `frozen`. Only for someone called out this round (by the DJ or by themselves) who hasn't left. |
| `iMoved` | contestant | none | Phase `frozen`. The DJ is rejected (`NOT_A_CONTESTANT`). Repeats are harmless. |
| `resume` | DJ | none | phase `frozen` |

### Scoring

+1 to every contestant still standing at the end of each round.

### Timeouts

- `dancing`: a random length in the pace range, then freeze.
- `frozen`, 15 s: the round ends.

### Disconnect and leave

- A player who leaves is knocked out (`how: 'left'`).
- If a contestant leaves and one or nobody remains standing, the game ends.
- The DJ is whoever is host at the moment of each action. If the host leaves, the new host gets the DJ buttons, even if they are also a contestant.

### Privacy

The view hides `deadline` while dancing, so the stop is meant to be a surprise.

### End condition

When one or nobody is left standing, or after `maxRounds`.

### Limitations

- The app cannot see anyone. The DJ judges in person or on video, and players are trusted to tap "I moved".
- The stop time stays secret: `gameEngine.viewFor` uses the view's own `deadline` (null while dancing) instead of the internal one, so no client receives it.

---

## 15. Sardines

- **id:** `sardines`
- **Players:** 4–12
- **Pitch:** A companion for real-world hide-and-seek. Find the hider and squeeze in with them.

### Settings

| Key | Range | Default |
|---|---|---|
| `rounds` | 1–12 | 4 |
| `hideSeconds` | 30–300 (step 15) | 60 |
| `seekSeconds` | 60–900 (step 30) | 300 |

### Phases

`hiding → seeking → roundSummary → hiding (next hider) → … → finished`

### Hider order

The first hider is random. After that the role rotates in roster order, skipping anyone who is offline or has left.

### Actions

| Action | Who | Payload | Validation |
|---|---|---|---|
| `hidden` | hider | none | phase `hiding`, their turn. Starts the search early. |
| `found` | seekers | none | Phase `seeking`. Must be one of this round's seekers, not the hider. Repeats are ignored. |
| `endRound` | host | none | phase `seeking`. Scored as if time ran out. |
| `next` | host | none | phase `roundSummary` |

### Scoring

With n seekers (not counting those who left):
- The first finder gets n−1, the next n−2, and so on, so the last finder gets 0.
- The hider gets +1 for each seeker still searching when the round ends.

### Timeouts

- `hiding`, `hideSeconds`: seeking starts.
- `seeking`, `seekSeconds`: the round ends.
- `roundSummary`, 15 s: next round.

The round also ends as soon as every seeker has found the hider.

### Disconnect and leave

- If the hider leaves during hiding or seeking, the round is void and nobody scores. It still counts as one of the rounds.
- If a seeker leaves, the round may end early once nobody is still searching.

### Privacy

Nothing is secret in the app. Only times and the order of finds are recorded.

### End condition

After `rounds` rounds, or when no available hider is left.

### Limitations

- The app does not track location; "Found" is on the honour system.
- Safety depends on the group agreeing on safe play areas first.
