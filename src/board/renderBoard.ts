// Ported from BackgammonC#/Backgammon.WebApp/wwwroot/js/updateBoard.js
// Point numbering preserved exactly: 0 = bar (player2), 25 = bar (player1), 26/27 = bear-off.
import type { CubeState } from '../api/types';

export type PlayerClass = 'player1' | 'player2';

// The last thing drawn, so a resize can redraw the same state.
let lastRender: { board: number[]; dice: [number, number] | null; player: 0 | 1; cube: CubeState } | null = null;

// player: 0 = P1 (human, dice on the right), 1 = P2 (computer, dice on the left).
// dice = null hides the dice (before the roll and after a finished move).
export function updateBoard(board: number[], dice: [number, number] | null, player: 0 | 1, cube: CubeState): void {
	lastRender = { board, dice, player, cube };
	clearBoard(board);
	adjustCheckerSize();
	setPointLabels(player);
	setHalfCenters();
	for (let i = 0; i < board.length; i++) {
		const pointId = `point-${i}`;
		const numberOfCheckers = Math.abs(board[i]);
		const playerClass: PlayerClass = board[i] > 0 ? 'player1' : 'player2';
		if (numberOfCheckers > 0) {
			if (i === 26 || i === 27) {
				placeStandingCheckersInBearOff(pointId, numberOfCheckers, playerClass);
			} else {
				placeCheckers(pointId, numberOfCheckers, playerClass);
			}
		}
	}

	const diceContainer = document.querySelector<HTMLElement>('.dice-container'); // first one = the dice
	if (dice) {
		showDice(player, dice);
		diceContainer?.classList.remove('hidden');
	} else {
		diceContainer?.classList.add('hidden');
	}
	showCube(cube);
}

function setHalfCenters(): void {
	const boardElement = document.querySelector<HTMLElement>('.board');
	const bar = document.getElementById('point-25');
	const firstLeft = document.getElementById('point-24');  // outer edge of the left half
	const lastRight = document.getElementById('point-13');  // outer edge of the right half
	if (!boardElement || !bar || !firstLeft || !lastRight) return;
	const b = boardElement.getBoundingClientRect();
	const bl = bar.getBoundingClientRect();
	const fl = firstLeft.getBoundingClientRect();
	const lr = lastRight.getBoundingClientRect();
	boardElement.style.setProperty('--left-center', `${(fl.left + bl.left) / 2 - b.left}px`);
	boardElement.style.setProperty('--right-center', `${(bl.right + lr.right) / 2 - b.left}px`);
	boardElement.style.setProperty('--bar-center', `${(bl.left + bl.right) / 2 - b.left}px`);
}

function clearBoard(board: number[]): void {
	for (let i = 0; i < board.length; i++) {
		clearCheckers(`point-${i}`);
	}
}

function clearCheckers(pointId: string): void {
	const pointElement = document.getElementById(pointId);
	if (!pointElement) return;
	pointElement.querySelectorAll('.checker, .bear-off-checker').forEach((checker) => checker.remove());
}

const CHECKERS_PER_LAYER = 5;
const MAX_LAYER_SHIFT = 0.25; // in checker diameters: how far each extra layer sits from the layer below

function placeCheckers(pointId: string, numberOfCheckers: number, player: PlayerClass): void {
	const pointElement = document.getElementById(pointId);
	if (!pointElement) return;
	pointElement.innerHTML = '';

	const size = parseFloat(
		getComputedStyle(document.documentElement).getPropertyValue('--checker-size')
	);
	const fromTop = pointElement.parentElement?.classList.contains('upper-half') ?? false;
	const edge = 2; // distance from the board edge for the first checker

	// Extra layers sit on top of the layer below, shifted toward the middle of the board.
	// The shift shrinks if needed so the highest checker still fits inside the point.
	const layers = Math.ceil(numberOfCheckers / CHECKERS_PER_LAYER);
	const room = pointElement.clientHeight - edge - CHECKERS_PER_LAYER * size;
	const shift = layers > 1
		? Math.max(0, Math.min(MAX_LAYER_SHIFT * size, room / (layers - 1)))
		: 0;

	for (let i = 0; i < numberOfCheckers; i++) {
		const layer = Math.floor(i / CHECKERS_PER_LAYER);
		const row = i % CHECKERS_PER_LAYER;
		const offset = edge + row * size + layer * shift;

		const checker = document.createElement('div');
		checker.classList.add('checker', player);
		checker.style.width = `${size}px`;
		checker.style.height = `${size}px`;
		if (fromTop) {
			checker.style.top = `${offset}px`;
			checker.style.bottom = 'auto';
		} else {
			checker.style.bottom = `${offset}px`;
			checker.style.top = 'auto';
		}
		pointElement.appendChild(checker); // later checkers are drawn on top of earlier ones
	}
}

function bearOffMetrics(boardWidth: number) {
	const size = boardWidth * 0.056;                          // checker diameter
	const thickness = Math.max(3, Math.round(size * 0.16));   // a checker on its edge
	const pitch = thickness + Math.max(2, Math.round(size * 0.03));
	const edge = Math.round(size * 0.1);                      // padding inside the recess
	const cubeSize = Math.round(boardWidth * 0.034);          // the cube is drawn at exactly this size
	const stack = 14 * pitch + thickness;                     // 15 checkers
	const gap = Math.round(size * 0.15);                      // between the 15th checker and the cube
	const slack = Math.round(size * 0.3);                     // extra air: raise this to make the recess longer
	return {
		size, thickness, pitch, edge, cubeSize,
		trayHeight: edge + stack + gap + cubeSize + slack + edge,
	};
}

export function adjustCheckerSize(): void {
	const board = document.querySelector<HTMLElement>('.board');
	if (!board) return;
	const m = bearOffMetrics(board.offsetWidth);
	const root = document.documentElement.style;
	root.setProperty('--checker-size', `${m.size}px`);
	root.setProperty('--tray-height', `${m.trayHeight}px`);
	root.setProperty('--cube-size', `${m.cubeSize}px`);
}

function placeStandingCheckersInBearOff(pointId: string, numberOfCheckers: number, player: PlayerClass): void {
	const tray = document.getElementById(pointId);
	const boardElement = document.querySelector<HTMLElement>('.board');
	if (!tray || !boardElement) return;

	const m = bearOffMetrics(boardElement.offsetWidth);
	const fromTop = tray.classList.contains('bear-off-top');

	for (let i = 0; i < numberOfCheckers; i++) {
		const checker = document.createElement('div');
		checker.classList.add('checker', 'bear-off-checker', player);
		checker.style.width = `${Math.round(m.size * 1.2)}px`;
		checker.style.height = `${m.thickness}px`;

		const offset = m.edge + i * m.pitch; // stacks from the outer end of the recess
		if (fromTop) checker.style.top = `${offset}px`;
		else checker.style.bottom = `${offset}px`;

		tray.appendChild(checker);
	}
}

const DOT_POSITIONS: Record<number, number[]> = {
	1: [5],
	2: [1, 9],
	3: [1, 5, 9],
	4: [1, 3, 7, 9],
	5: [1, 3, 5, 7, 9],
	6: [1, 3, 4, 6, 7, 9],
};

function createDiceDots(value: number): HTMLDivElement {
	const grid = document.createElement('div');
	grid.className = 'dice-grid';
	grid.dataset.value = String(value);

	for (let i = 1; i <= 9; i++) {
		const dot = document.createElement('div');
		if (DOT_POSITIONS[value]?.includes(i)) {
			dot.className = 'dice-dot';
		}
		grid.appendChild(dot);
	}

	return grid;
}

// The dice container element itself is kept (only its children are rebuilt),
// so a click listener attached to it (swap dice) survives redraws.
function showDice(player: 0 | 1, diceValues: [number, number]): void {
	const diceContainer = document.querySelector<HTMLElement>('.dice-container');
	if (!diceContainer) return;

	diceContainer.classList.toggle('side-human', player === 0);
	diceContainer.classList.toggle('side-computer', player === 1);
	diceContainer.style.left = '';
	diceContainer.style.right = '';
	diceContainer.innerHTML = '';

	diceValues.forEach((value) => {
		const dice = createDiceDots(value);
		dice.classList.add(player === 0 ? 'dice-player1' : 'dice-player2');
		diceContainer.appendChild(dice);
	});
}

// The cube lives on the right rail (the empty bear-off column):
// middle = nobody owns it, upper half = P2 (computer), lower half = P1 (human).
// Tweak these three values to move it.
//const CUBE_LEFT = '96%';
//const CUBE_TOP = { centered: '50%', P2: '25%', P1: '75%' };

// Centered: in the flat frame between the two recesses.
// Owned: inside the owner's recess at its inner end (P2 = top recess, P1 = bottom recess).
function showCube(cube: CubeState): void {
	const container = document.getElementById('cube-container');
	const cubeElement = document.getElementById('game-cube');
	const boardElement = document.querySelector<HTMLElement>('.board');
	const topTray = document.getElementById('point-27');
	const bottomTray = document.getElementById('point-26');
	if (!container || !cubeElement || !boardElement || !topTray || !bottomTray) return;

	const centered = cube.owner == null;
	const value = centered ? 64 : 1 << cube.power;
	cubeElement.dataset.value = String(value);
	cubeElement.innerText = String(value);
	cubeElement.classList.toggle('centered', centered);

	container.classList.remove('hidden'); // has to be visible to be measured
	const m = bearOffMetrics(boardElement.offsetWidth);
	const b = boardElement.getBoundingClientRect();
	const t = topTray.getBoundingClientRect();
	const u = bottomTray.getBoundingClientRect();
	const half = container.offsetHeight / 2;

	const x = t.left + t.width / 2 - b.left;
	const y = centered
		? (t.bottom + u.top) / 2 - b.top        // middle of the flat part
		: cube.owner === 'P2'
			? t.bottom - m.edge - half - b.top  // inner end of the top recess
			: u.top + m.edge + half - b.top;    // inner end of the bottom recess

	container.style.left = `${x}px`;
	container.style.right = 'auto';
	container.style.top = `${y}px`;
	container.style.transform = 'translate(-50%, -50%)';
}

// call setPointLabels(player) in updateBoard, right after adjustCheckerSize()
function setPointLabels(player: 0 | 1): void {
	for (let id = 1; id <= 24; id++) {
		const point = document.getElementById(`point-${id}`);
		if (point) point.dataset.label = String(player === 0 ? id : 25 - id);
	}
}

let resizeObserver: ResizeObserver | null = null;

// Call once after the board is mounted (see main.ts). Redraws the last rendered
// state whenever the .board element changes size, so checkers pick up the new size.
export function observeBoardResize(): void {
	const boardElement = document.querySelector<HTMLElement>('.board');
	if (!boardElement) return;

	resizeObserver?.disconnect();
	resizeObserver = new ResizeObserver(() => {
		if (lastRender) updateBoard(lastRender.board, lastRender.dice, lastRender.player, lastRender.cube);
	});
	resizeObserver.observe(boardElement);
}