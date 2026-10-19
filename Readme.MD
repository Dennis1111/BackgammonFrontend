# Backgammon web client

A browser-based backgammon game for playing against a custom C++ engine. The frontend is written in TypeScript without a UI framework. AI (Claude) was used extensively to develop the frontend and prepare the documentation.

![Backgammon game and analysis panel](docs/game.png)

## Features

**Play**
- Play money games against the engine, including doubling, taking and dropping.
- Track the session score.
- Interactive checker movement with legal moves supplied by the engine.

**Analysis**
- Ranked move candidates with equity and win, gammon and backgammon probabilities.
- Doubling-cube decisions with equity comparisons and per-roll analysis.
- Move comparison using 6 × 6 dice-grid heatmaps.
- Game review with move history, error marks and equity-loss summaries.

**Interface**
- Responsive 2D board with SVG graphics.
- Analysis panel with move, cube and summary views.
- Review previous positions and return to the current game.

## Architecture

The frontend communicates with a separate C++ HTTP server over JSON/HTTP. The server handles legal move generation, position evaluation and doubling-cube decisions; the frontend handles the game flow, interface and game history.

The game flow is implemented as an asynchronous function, separated from DOM rendering through a small UI interface. Game history is stored in a `GameRecord`, which drives the move list and analysis views.

## Tech stack

- **Frontend:** TypeScript (strict), Vite, plain DOM and SVG, CSS.
- **Backend:** A custom C++ engine for legal move generation, position evaluation and doubling-cube decisions.
- **Development:** AI-assisted implementation using Claude.

## Getting started

Requires Node.js and a running engine server listening on port 8080 by default.

## Running locally

Requires Node.js and the separate C++ engine server, listening on port 8080 by default. The Vite development server proxies API requests to the engine.