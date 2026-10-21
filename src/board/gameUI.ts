// The only place that knows about buttons and the DOM; gameLoop.ts just awaits these promises.
import { updateBoard } from './renderBoard';
import { HistoryPanel } from './historyPanel';
import type { CubeState } from '../api/types';
import { applyStepsAsP1 } from '../game/applySteps';
import { blockInput, confirmMove, pickHumanMove, swapDice, undoMove } from '../game/moveInput';
import type { GameState, GameUi } from '../game/gameLoop';
import type { GameHistory } from '../game/record';
import type { SessionScore } from '../game/session';
import { isModeAvailable } from '../game/settings';

export interface AppUi extends GameUi {
	showScore(score: SessionScore): void;
	/** After a game: another game, or end the session (only offered when iron mode is available). */
	askNextStep(): Promise<'new' | 'end'>;
	askNewSession(): Promise<void>;
	clearLog(): void;
	/** While a game is in progress, clicking a previous move shows that position (review mode). */
	setInGame(inGame: boolean): void;
	followLatest(): void;
}

const panel = () => document.querySelector<HTMLElement>('.game-panel')!;
const board = () => document.querySelector<HTMLElement>('.board')!;

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
	const button = document.createElement('button');
	button.textContent = label;
	button.addEventListener('click', onClick);
	return button;
}

function makeBoardActions(className: string): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = `board-actions ${className}`;
	return wrap;
}

type Side = 'left' | 'right';

// Buttons the human answers with sit on the board, centered in the left or right half of the inner board.
function askChoice<T extends string>(options: { value: T; label: string; side?: Side }[]): Promise<T> {
	return new Promise((resolve) => {
		const wraps: Record<Side, HTMLElement> = {
			left: makeBoardActions('board-actions-left'),
			right: makeBoardActions('board-actions-right'),
		};
		const cleanup = () => Object.values(wraps).forEach((w) => w.remove());

		for (const o of options) {
			wraps[o.side ?? 'right'].appendChild(
				makeButton(o.label, () => {
					cleanup();
					resolve(o.value);
				})
			);
		}
		for (const w of Object.values(wraps)) {
			if (w.childElementCount > 0) board().appendChild(w);
		}
	});
}

// What the board shows for the live game (kept so we can go back to it after a review).
interface LiveView {
	board: number[];
	dice: [number, number] | null;
	player: 0 | 1;
	cube: CubeState;
	used?: (0 | 1 | 2)[]; // dice used so far in the move being made (drawn faded)
}

export function createGameUi(history: GameHistory): AppUi {
	let inGame = false;
	let reviewing = false;       // a previous position is shown on the board while the game waits
	let live: LiveView | null = null;
	let continueWrap: HTMLElement | null = null;

	// All drawing of the live game goes through here. While reviewing it is only remembered.
	const drawLive = (view: LiveView) => {
		live = view;
		if (!reviewing) updateBoard(view.board, view.dice, view.player, view.cube, view.used);
	};

	// Review mode: the live buttons are hidden (CSS, .board.reviewing), the live input is blocked,
	// and a single [Continue] button on the bar takes you back.
	const enterReview = () => {
		if (!inGame || reviewing) return;
		reviewing = true;
		blockInput(true);
		board().classList.add('reviewing');
		continueWrap = makeBoardActions('board-actions-center');
		continueWrap.append(makeButton('Continue', () => resume()));
		board().append(continueWrap);
	};

	// Back to the live game: restore the live board and focus the list on the last move.
	const resume = () => {
		if (reviewing) {
			reviewing = false;
			blockInput(false);
			board().classList.remove('reviewing');
			continueWrap?.remove();
			continueWrap = null;
			if (live) updateBoard(live.board, live.dice, live.player, live.cube, live.used);
		}
		historyPanel.followLatest();
	};

	// Panel layout, top to bottom: [score] [game selector] [move list] [evaluation pane] [status] [controls]
	const historyPanel = new HistoryPanel(history, panel(), {
		show: (t) => {
			enterReview();
			updateBoard(t.position, t.dice, t.player === 'P1' ? 0 : 1, t.cube);
		},
		live: (turn) => {
			const game = history.games[history.games.length - 1];
			return inGame && !!game && game.turns[game.turns.length - 1] === turn && !turn.done;
		},
		resume: () => resume(),
	});
	const status = document.createElement('div');
	status.className = 'panel-status';
	const controls = document.createElement('div');
	controls.className = 'panel-controls';
	panel().append(status, controls);

	return {
		render(state: GameState) {
			drawLive({
				board: state.position,
				dice: state.dice,
				player: state.currentPlayer === 'P1' ? 0 : 1,
				cube: state.cube,
			});
		},

		// Choices are split over the two halves: Double (left) / Roll (right), Take (left) / Drop (right).
		// `hint` (engine's cube evaluation) is not used here; the evaluation pane shows it afterwards.
		askCubeAction(_hint) {
			return askChoice<'double' | 'roll'>([
				{ value: 'double', label: 'Double', side: 'left' },
				{ value: 'roll', label: 'Roll', side: 'right' },
			]);
		},

		askTakeDrop() {
			return askChoice<'take' | 'drop'>([
				{ value: 'take', label: 'Take', side: 'left' },
				{ value: 'drop', label: 'Drop', side: 'right' },
			]);
		},

		// Undo below the panel (or Ctrl+Z), Done on the board where the dice were (shown once the
		// move is complete and replacing the dice), clicking the dice swaps their order.
		pickHumanMove(options, state) {
			const undoButton = makeButton('Undo (Ctrl+Z)', undoMove);
			controls.append(undoButton);

			const doneButton = makeButton('Done', confirmMove);
			const doneWrap = makeBoardActions('board-actions-right');
			doneWrap.style.display = 'none';
			doneWrap.appendChild(doneButton);
			board().appendChild(doneWrap);

			const diceElement = document.querySelector<HTMLElement>('.dice-container'); // first one = the dice
			diceElement?.addEventListener('click', swapDice);
			diceElement?.classList.add('swappable');
			if (diceElement) diceElement.title = 'Click to swap the dice';

			return pickHumanMove(options, state.position, state.dice!, (view) => {
				drawLive({
					board: applyStepsAsP1(state.position, view.done),
					dice: view.finished ? null : view.dice, // Done replaces the dice
					player: 0,
					cube: state.cube,
					used: view.used,
				});
				undoButton.disabled = view.done.length === 0;
				doneWrap.style.display = view.finished ? 'flex' : 'none';
			}).finally(() => {
				undoButton.remove();
				doneWrap.remove();
				diceElement?.removeEventListener('click', swapDice);
				diceElement?.classList.remove('swappable');
			});
		},

		async notify(text: string) {
			status.textContent = text;
		},

		showScore(score) {
			let box = document.querySelector<HTMLElement>('.session-score');
			if (!box) {
				box = document.createElement('div');
				box.className = 'session-score';
				panel().prepend(box);
			}
			const diff = score.human - score.computer;

			const title = document.createElement('div');
			title.className = 'session-score-title';
			title.textContent = `Session (${score.games} game${score.games === 1 ? '' : 's'})`;

			const line = document.createElement('div');
			line.className = 'session-score-line';
			line.append(`You ${score.human} – ${score.computer} Computer  `);

			const diffEl = document.createElement('span');
			diffEl.className = diff > 0 ? 'score-ahead' : diff < 0 ? 'score-behind' : '';
			diffEl.textContent = `(${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.abs(diff)})`;
			line.append(diffEl);

			box.replaceChildren(title, line);
		},

		askNextStep() {
			const options: { value: 'new' | 'end'; label: string; side?: Side }[] = [{ value: 'new', label: 'New game' }];
			if (isModeAvailable('iron')) options.push({ value: 'end', label: 'End session', side: 'left' });
			return askChoice<'new' | 'end'>(options);
		},

		async askNewSession() {
			await askChoice<'new'>([{ value: 'new', label: 'New session' }]);
		},

		clearLog() {
			status.textContent = '';
		},

		setInGame(value: boolean) {
			inGame = value;
			if (reviewing) resume(); // a game started or ended while reviewing: back to the live board
		},

		followLatest() {
			historyPanel.followLatest();
		},
	};
}