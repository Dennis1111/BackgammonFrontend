import type { HumanMoveOption as MoveCandidate, Step } from './gameLoop';
import { applyStepsAsP1 } from './applySteps';


export interface MoveInputView {
	done: Step[];
	dice: [number, number];
	finished: MoveCandidate | null; // non-null = move is complete, waiting for Done
}

let startPosition: number[] = [];
let candidates: MoveCandidate[] = [];
let done: Step[] = [];
let dice: [number, number] = [0, 0];
let finished: MoveCandidate | null = null;
let resolveMove: ((m: MoveCandidate) => void) | null = null;
let onChange: ((view: MoveInputView) => void) | null = null;
let inputBlocked = false;

/** While a previous position is shown on the board, the live game must not react to clicks or keys. */

export function blockInput(blocked: boolean): void {
	inputBlocked = blocked;
}

const same = (a: Step, b: Step) => a.from === b.from && a.to === b.to;

// Human = P1, moves from high to low point numbers (bar = 25, bear-off = 26).
// Does this step use the given die? A bear-off can also use a larger die than the point number.
function usesDie(s: Step, die: number): boolean {
	return s.isBearOff ? die >= s.from : s.from - s.to === die;
}



// Anropas av gameLoop. Resolvar först när människan trycker Done på ett komplett drag.
// `change` anropas vid varje förändring (steg, ångra, tärningsbyte) så att UI kan rita om.
export function pickHumanMove(
	options: MoveCandidate[],
	position: number[],
	diceRolled: [number, number],
	change: (view: MoveInputView) => void
): Promise<MoveCandidate> {
	candidates = options;
	startPosition = position;
	done = [];
	dice = diceRolled;
	finished = null;
	onChange = change;
	return new Promise((resolve) => {
		resolveMove = resolve;
		notify();
	});
}

// Stegen som återstår i c, eller null om c inte innehåller alla steg i `done`.
// Ordningen spelar ingen roll, så "andra tärningen först" fungerar av sig självt.
function remaining(c: MoveCandidate): Step[] | null {
	const rest = [...c.steps];
	for (const s of done) {
		const i = rest.findIndex((r) => same(r, s));
		if (i < 0) return null;
		rest.splice(i, 1);
	}
	return rest;
}

// Steps that can be played right now: not yet done AND a checker is actually on the from-point.
// (The second step of a route like 13/10 10/8 only becomes playable after 13/10 is played.)
function liveSteps(): Step[] {
	const board = applyStepsAsP1(startPosition, done);
	return candidates
		.flatMap((c) => remaining(c) ?? [])
		.filter((s) => board[s.from] > 0);
}

function notify(): void {
	finished = candidates.find((c) => remaining(c)?.length === 0) ?? null;
	onChange?.({ done, dice, finished });
	refreshHighlights();
}

function applyStep(step: Step): void {
	done.push(step);
	notify();
}

// Klick på en punkt med brickor: spela ETT steg därifrån, första tärningen först,
// sedan andra tärningen. Bar-regeln sköts av servern (bara bar-steg finns kvar då).
// useSecondDie (högerklick) provar andra tärningen först.
// Klick på en punkt utan egna steg: om exakt ett steg slutar där spelas det.
export function handlePointClick(id: number, useSecondDie = false): void {
	if (!resolveMove || inputBlocked) return; // inte människans tur
	const steps = liveSteps(); // tomt när draget är komplett

	const fromHere = steps.filter((s) => s.from === id);
	if (fromHere.length > 0) {
		const order = useSecondDie ? [dice[1], dice[0]] : dice;
		const step = order.map((d) => fromHere.find((s) => usesDie(s, d))).find((s) => s) ?? fromHere[0];
		applyStep(step);
		return;
	}

	const toHere = steps.filter((s) => s.to === id);
	const unique = toHere.filter((s, i) => toHere.findIndex((t) => same(t, s)) === i);
	if (unique.length === 1) applyStep(unique[0]);
}

// Ångra senaste checker-steget (Ctrl+Z). Går även efter att draget blivit komplett, fram till Done.
export function undoMove(): void {
	if (!resolveMove || inputBlocked || done.length === 0) return;
	done.pop();
	notify();
}

// Byt ordning på tärningarna: nästa klick använder den andra tärningen först.
export function swapDice(): void {
	if (!resolveMove || inputBlocked) return;
	dice = [dice[1], dice[0]];
	notify();
}

// Done: bekräfta det kompletta draget.
export function confirmMove(): void {
	if (!resolveMove || inputBlocked || !finished) return;
	const resolve = resolveMove;
	const move = finished;
	resolveMove = null;
	finished = null;
	refreshHighlights(); // rensar markeringar
	resolve(move);
}

document.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
		e.preventDefault();
		undoMove();
	} else if (e.key === 'Enter' && document.activeElement === document.body) {
		confirmMove();
	}
});

// Högerklick på en punkt = andra tärningen först (bara för det klicket).
document.addEventListener('contextmenu', (e) => {
	if (!resolveMove || inputBlocked) return;
	const el = (e.target as HTMLElement).closest<HTMLElement>('[id^="point-"]');
	if (!el) return;
	e.preventDefault();
	handlePointClick(Number(el.id.slice('point-'.length)), true);
});

function refreshHighlights(): void {
	document.querySelectorAll('.selectable').forEach((el) => el.classList.remove('selectable'));
	if (!resolveMove) return;
	for (const s of liveSteps()) document.getElementById(`point-${s.from}`)?.classList.add('selectable');
}