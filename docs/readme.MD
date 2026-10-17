## Backgammon Frontend Overview

This frontend implements a backgammon game where the frontend mirrors the backend's `playMoneyGame` logic. Key features:

### Core Game Flow
1. **Game Start**: Dice are rolled until values differ. Higher value determines starting player.
2. **Legal Moves**: Backend provides all valid moves when it's the human player's turn.
3. **Doubling Mechanics**: Current player may double (if cube not owned by opponent). A double/drop ends the game with the loser paying the cube value.

### Turn Handling
**Computer Turn**: 
- First checks if doubling is requested
- If no double, rolls dice (backend may eventually generate these)
- Sends request to backend for move generation

**Human Turn**: 
- Presents double/roll options (if doubling available)
- If doubling occurs, requests computer response (double/drop)
- If no double/drop, retrieves legal moves from backend and validates human checker moves against this list

### Project Structure
- `src/` contains core application code
- `src/api/` handles backend communication (e.g., `GameSimulatorService`, `ApiService.ts`)
- `src/board/` contains game board logic and UI components
- `src/game/` implements core game mechanics (e.g., `GameSimulator.ts`, `DoublingManager.ts`)