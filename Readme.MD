# Backgammon web client

A browser-based backgammon game for money play against a custom C++ engine, with an
[eXtreme Gammon](https://www.extremegammon.com/)-style analysis panel. 
The front end is written in TypeScript with no UI framework;

![Board](docs/game.png)

## Features

**Play**
- Money game with the doubling cube (double / take / drop) without the jacoby rule (you must double to be able to win gammon or backgammon) and also there is no beaver, raccon allowed yet (only take or drop).
- Running session score with the difference, like XG's session score.
- Click-to-move: click a checker to play one step with the higher die first, click the dice to swap their order,
  right-click to use the other die, **Done** to confirm and **Ctrl+Z** to undo single checker moves.
  Legal moves come from the engine, so the rules are never duplicated in the client.

**Board**
- 2D board with checkers, bear-off recesses that hold both the checkers and the cube, and a black frame.
- Point numbers are shown from the point of view of the player on roll and swap with the turn.
- Responsive: a fixed 1.5 : 1 board sized with CSS container queries, so everything scales with the board.

**Analysis**
- Move list with game selector, cube actions and error marks (doubtful / error / blunder, XG thresholds).
- Evaluation pane with three tabs:
  - **Move**: the engine's ranked candidates with equity, win / gammon / backgammon percentages and
    the search level each move was evaluated at (deepest first).
  - **Cube**: the engine's cube action, the equities for no double / double take / double pass, and a pop-up
    with a bar chart of the equity for each roll.
  - **Summary**: moves, errors and equity lost for both players.
- **Move comparison**: heatmaps (6 × 6 dice grid) of the equity after each of the opponent's rolls for any two moves,
  plus the difference between them. Default: the best move against the move you played.
- **Review mode**: click an earlier move during a game to see that position on the board, then **Continue**
  to return to the game. Up / Down arrows move through the list.
- **Learning mode**: evaluations are shown only after the decision they belong to has been made, so they can't be used
  to choose the move. (Tutorial and iron modes are implemented but switched off for now, see `src/game/settings.ts`.)

## Architecture

```
 Browser (this repo)                          Engine server (separate project)
┌──────────────────────────────┐   JSON    ┌──────────────────────────────┐
│ board/  DOM, rendering, panel│  over     │ C++ HTTP server              │
│ game/   game loop, state     │◄─────────►│ move generation, evaluation, │
│ api/    typed HTTP client    │   HTTP    │ cube decisions               │
└──────────────────────────────┘           └──────────────────────────────┘
```

- `game/gameLoop.ts` is the whole game as one async function (a port of the engine's own self-play loop). It has no
  DOM code: everything the player has to answer goes through a small `GameUi` interface that returns promises.
- Everything that happens is written to a `GameRecord`; the move list and evaluation pane only read from it.
- The engine is CPU-heavy, so the client sends analysis requests one at a time. Your own move is evaluated in the
  background while you think, never overlapping with the computer's search.
- All evaluations are from the point of view of the player on roll. The server does the conversion for the computer,
  so the client has a single convention.
- What may be shown and when is decided in one place (`game/settings.ts`).

## Tech stack

TypeScript (strict), [Vite](https://vitejs.dev/), plain DOM and SVG, CSS (container queries, custom properties).
The server is C++ ([cpp-httplib](https://github.com/yhirose/cpp-httplib) and
[nlohmann/json](https://github.com/nlohmann/json)).

## Getting started

You need Node.js and a running engine server (listening on port 8080 by default).

```bash
npm install
npm run dev        # http://localhost:5173
```

The dev server proxies `/api/*` to the engine (`vite.config.ts`):

```ts
server: { proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } } }
```

If the server isn't running, the side panel says so instead of showing an empty board.
For a production build (`npm run build`) the same `/api` routing has to be done by a reverse proxy.

## Server API

All requests and responses are JSON. A **position** is an array of 28 numbers: `0` = P2's bar, `1`–`24` = the points,
`25` = P1's bar, `26` / `27` = bear-off for P1 / P2. Positive counts are P1 (the human), negative counts are P2 (the
computer). The **cube** is `{ power, owner }`: the value is 2^power and `owner` is `"P1"`, `"P2"` or `null` (centered).

| Endpoint | Request | Response |
|---|---|---|
| `GET /health` | – | `{ status }` |
| `POST /legal-moves` | `position, player, die1, die2` | `moves[]`: `checkerMoves[]` (`from, to, isHit, isBearOff`) and `resultingBoard` |
| `POST /evaluate-moves` | `position, player, die1, die2, cube` | `candidates[]`: `notation, equity, scoreVector, boardAfter, level, noDoubleRollStats?` |
| `POST /cube-decision` | `position, player, cube` | `action, response, equity, scores`, the equities for no double / double take / double pass, and per-roll stats |

Equities and score vectors are from the point of view of `player`. A score vector is
`[win, win gammon, win backgammon, opponent gammon, opponent backgammon]`. `noDoubleRollStats` holds the equity after
each of the opponent's rolls (`die1, die2, equity, scores`).

## Project structure

```
src/
├─ api/      types.ts, http.ts, backgammonApi.ts      typed client for the endpoints above
├─ game/     gameLoop.ts, record.ts, session.ts,      game flow, history, score, settings,
│            settings.ts, moveInput.ts, applySteps.ts click-to-move input
│            dice.ts, startPosition.ts
├─ board/    renderBoard.ts, createBoardMarkup.ts,    board drawing and the side panel
│            gameUI.ts, historyPanel.ts,
│            rollDiagram.ts, moveComparison.ts,
│            heatmap.ts, equityColors.ts + *.css
└─ main.ts
```

## Status and ideas

A work in progress. Possible next steps: a hosted demo, a mobile-friendly layout / PWA, saving and exporting games,
and automated tests for the game loop and the click-to-move input.
