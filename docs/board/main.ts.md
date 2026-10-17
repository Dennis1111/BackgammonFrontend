## src/board/main.ts - Game Board Entry Point

This file serves as the entry point for the game board module. It:
1. Imports core game components (board rendering, game logic, API communication)
2. Defines the main game loop and session management
3. Handles game result notifications and session transitions
4. Manages board resizing and UI interaction

### Key Functions
- `mount()` - Initializes the game board UI
- `describe()` - Formats game result messages
- `main()` - The primary game execution flow

### Dependencies
- `backgammonApi` - For communication with the backend engine
- `createBoardMarkup` - For rendering the board UI
- `playMoneyGame` - Implements the core game logic
- `GameHistory` - Tracks game session history