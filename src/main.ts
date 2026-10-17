// src/main.ts
import { backgammonApi } from './api/backgammonApi';
import { createBoardMarkup } from './board/createBoardMarkup';
import { createGameUi } from './board/gameUI';
import { observeBoardResize } from './board/renderBoard';
import { playMoneyGame } from './game/gameLoop';
import type { GameResult } from './game/gameLoop';
import { handlePointClick } from './game/moveInput';
import { GameHistory } from './game/record';
import { addResult, newSession } from './game/session';
import { beginSession, endSession, gameStarted } from './game/settings';
import { START_POSITION } from './game/startPosition';

function mount(): void {
	document.getElementById('board-root')!.replaceWith(createBoardMarkup(handlePointClick));
}

function describe(r: GameResult): string {
	const who = r.winner === 'P1' ? 'You win' : 'Computer wins';
	const how = r.kind === 'single' ? '' : r.kind === 'drop' ? ' (double dropped)' : ` (${r.kind})`;
	return `${who} ${r.points} point${r.points === 1 ? '' : 's'}${how}`;
}

async function main(): Promise<void> {
	mount();
	const history = new GameHistory();
	const ui = createGameUi(history);

	try {
		await backgammonApi.health();
	} catch {
		await ui.notify('Cannot reach the engine server. Is BackgammonServer running on port 8080?');
		return;
	}

	observeBoardResize();

	while (true) { // one iteration = one session
		history.reset();
		ui.followLatest();
		beginSession();
		let session = newSession();
		ui.showScore(session);

		let anotherGame = true;
		while (anotherGame) {
			const record = history.startGame();
			gameStarted();
			ui.followLatest();
			ui.setInGame(true);

			const result = await playMoneyGame(ui, [...START_POSITION], record);

			ui.setInGame(false); // from here you can click moves in the list to review them on the board
			session = addResult(session, result);
			record.scoreAfter = { human: session.human, computer: session.computer };
			record.changed();
			ui.showScore(session);
			await ui.notify(describe(result));
			anotherGame = (await ui.askNextStep()) === 'new';
			ui.clearLog();
		}

		endSession(); // reveals everything (iron mode)
		await ui.notify('Session over. Click a move in the list to review it.');
		await ui.askNewSession();
		ui.clearLog();
	}
}

main().catch((err) => {
	console.error(err);
	document.querySelector('.game-panel')?.insertAdjacentText('beforeend', `Error: ${err.message}`);
});