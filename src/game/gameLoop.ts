// src/game/gameLoop.ts
// Mirrors GameSimulator::PlayMoneyGame. No DOM in here: everything the human has to answer goes
// through the GameUi interface. Everything that happens is also written to a GameRecord,
// which the move list and the evaluation pane read.
import { backgammonApi } from '../api/backgammonApi';
import type { Candidate, CheckerMove, CubeDecisionResponse, CubeState, PlayerId, Position } from '../api/types';
import { rollOpeningDice, rollTurnDice } from './dice';
import { newTurn, sameBoard } from './record';
import type { GameRecord, TurnRecord } from './record';

export type Step = CheckerMove; // { from, to, isHit, isBearOff }

export interface HumanMoveOption {
	steps: Step[];
	boardAfter: Position;
}

export interface GameState {
	position: Position;
	currentPlayer: PlayerId; // P1 = human (bottom), P2 = computer (top)
	cube: CubeState;
	dice: [number, number] | null; // null until rolled this turn
	isStartingPosition: boolean;
}

export interface GameResult {
	winner: PlayerId;
	points: number; // cube value x 1 (single), 2 (gammon) or 3 (backgammon)
	kind: 'single' | 'gammon' | 'backgammon' | 'drop';
}

export interface GameUi {
	render(state: GameState): void;
	/** Human is on roll: show [Double] [Roll]. `hint` resolves with the engine's evaluation. */
	askCubeAction(hint: Promise<CubeDecisionResponse>): Promise<'double' | 'roll'>;
	/** Computer doubled: show [Take] [Drop]. */
	askTakeDrop(): Promise<'take' | 'drop'>;
	/** Resolves when the human has completed one of the options by clicking. */
	pickHumanMove(options: HumanMoveOption[], state: GameState): Promise<HumanMoveOption>;
	notify(text: string): Promise<void>;
}

const opponent = (p: PlayerId): PlayerId => (p === 'P1' ? 'P2' : 'P1');
const cubeValue = (c: CubeState): number => 1 << c.power;

// Same rule as the C++ code.
function canDouble(state: GameState): boolean {
	const { cube, currentPlayer } = state;
	return cubeValue(cube) <= 64 && (cube.owner === null || cube.owner === currentPlayer);
}

// 26/27 = bear-off points, the sign of the count tells whose checkers they are.
function findWinner(position: Position): PlayerId | null {
	for (const i of [26, 27]) {
		if (Math.abs(position[i]) === 15) return position[i] > 0 ? 'P1' : 'P2';
	}
	return null;
}

// Only when the game was played out (not when a double is dropped).
function winKind(position: Position, winner: PlayerId): 'single' | 'gammon' | 'backgammon' {
	const loser = opponent(winner);
	if (Math.abs(position[loser === 'P1' ? 26 : 27]) > 0) return 'single'; // loser has borne off a checker
	const loserSign = loser === 'P1' ? 1 : -1;
	const loserOnBar = Math.abs(position[loser === 'P1' ? 25 : 0]) > 0;
	const winnerHome = winner === 'P1' ? [1, 2, 3, 4, 5, 6] : [19, 20, 21, 22, 23, 24];
	const loserInWinnersHome = winnerHome.some((p) => position[p] * loserSign > 0);
	return loserOnBar || loserInWinnersHome ? 'backgammon' : 'gammon';
}

function finish(record: GameRecord, result: GameResult): GameResult {
	record.result = result;
	record.changed();
	return result;
}

export async function playMoneyGame(ui: GameUi, startPosition: Position, record: GameRecord): Promise<GameResult> {
	let state: GameState = {
		position: startPosition,
		currentPlayer: Math.random() < 0.5 ? 'P1' : 'P2',
		cube: { power: 0, owner: null },
		dice: rollOpeningDice(),
		isStartingPosition: true,
	};
	ui.render(state);

	while (true) {
		const winner = findWinner(state.position);
		if (winner) {
			const kind = winKind(state.position, winner);
			const multiplier = kind === 'backgammon' ? 3 : kind === 'gammon' ? 2 : 1;
			return finish(record, { winner, points: cubeValue(state.cube) * multiplier, kind });
		}

		const turn = record.addTurn(newTurn(state.currentPlayer, state.position, state.cube));

		if (!state.isStartingPosition) {
			const phase = await cubePhase(state, ui, turn, record);
			if (phase.kind === 'drop') {
				turn.done = true;
				// Doubler wins the cube value from BEFORE the double.
				return finish(record, { winner: state.currentPlayer, points: cubeValue(state.cube), kind: 'drop' });
			}
			state = { ...phase.state, dice: rollTurnDice() };
		}
		turn.dice = state.dice;
		record.changed();
		ui.render(state); // shows dice (and the new cube if one was accepted)

		state = state.currentPlayer === 'P1'
			? await humanMove(state, ui, turn, record)
			: await computerMove(state, ui, turn, record);

		state = { ...state, currentPlayer: opponent(state.currentPlayer), dice: null, isStartingPosition: false };
		ui.render(state);
	}
}

type CubePhase = { kind: 'continue'; state: GameState } | { kind: 'drop' };

async function cubePhase(state: GameState, ui: GameUi, turn: TurnRecord, record: GameRecord): Promise<CubePhase> {
	if (!canDouble(state)) return { kind: 'continue', state };

	turn.cubeAvailable = true;
	record.changed();

	const isHuman = state.currentPlayer === 'P1';

	// Start the request immediately. For the human it runs while the buttons are shown.
	const evaluation = backgammonApi.cubeDecision({
		position: state.position,
		player: state.currentPlayer,
		cube: state.cube,
	});
	evaluation.then(
		(ev) => { turn.cubeEval = ev; record.changed(); },
		() => { /* the error surfaces where the promise is awaited */ }
	);

	const wantsToDouble = isHuman
		? (await ui.askCubeAction(evaluation)) === 'double'
		: (await evaluation).action === 'double';
	turn.cubeAction = wantsToDouble ? 'double' : 'no-double';
	record.changed();
	if (!wantsToDouble) return { kind: 'continue', state };

	// Computer doubles -> human decides. Human doubles -> engine's `response` decides.
	const takes = isHuman
		? (await evaluation).response === 'take'
		: (await ui.askTakeDrop()) === 'take';
	turn.cubeResponse = takes ? 'take' : 'drop';
	record.changed();
	if (!takes) return { kind: 'drop' };

	return {
		kind: 'continue',
		state: { ...state, cube: { power: state.cube.power + 1, owner: opponent(state.currentPlayer) } },
	};
}

// ---------- helpers for the record ----------
// The server sends equities and score vectors from the point of view of the player on roll (it mirrors
// them for the computer), so a higher equity is better for both players. Nothing to convert here.

// "41: Bar/20 13/7" -> "Bar/20 13/7" (the dice are shown separately)
const stripDice = (notation: string): string => notation.replace(/^\s*\d{2}:\s*/, '');

// Sorted on search level first (deepest first), then on equity within each level.
function prepareCandidates(candidates: Candidate[]): Candidate[] {
	return candidates
		.map((c) => ({ ...c, notation: stripDice(c.notation) }))
		.sort((a, b) => (b.level ?? 1) - (a.level ?? 1) || b.equity - a.equity);
}

// Standard notation, e.g. "Bar/20 13/7*", used until the engine's own notation is known.
function stepsToNotation(steps: Step[]): string {
	return steps
		.map((s) => `${s.from === 25 ? 'Bar' : s.from}/${s.isBearOff ? 'Off' : s.to}${s.isHit ? '*' : ''}`)
		.join(' ');
}

// Finds the played move among the engine's candidates (by resulting position).
function linkPlayedMove(turn: TurnRecord): void {
	if (!turn.move || !turn.candidates) return;
	const played = turn.move.boardAfter;
	const i = turn.candidates.findIndex((c) => sameBoard(c.boardAfter, played));
	turn.playedIndex = i;
	if (i >= 0) turn.move.notation = turn.candidates[i].notation;
}

async function humanMove(state: GameState, ui: GameUi, turn: TurnRecord, record: GameRecord): Promise<GameState> {
	const [die1, die2] = state.dice!;
	const { moves } = await backgammonApi.legalMoves({
		position: state.position,
		player: state.currentPlayer,
		die1,
		die2,
	});

	// One option per distinct set of steps. Different orders of the same steps are the same
	// move for the click input, but 24/23 23/21 and 24/22 22/21 are different routes and both stay.
	const key = (steps: Step[]) => steps.map((s) => `${s.from}/${s.to}`).sort().join(' ');
	const seen = new Set<string>();
	const options: HumanMoveOption[] = moves
		.map((m) => ({ steps: m.checkerMoves, boardAfter: m.resultingBoard }))
		.filter((o) => o.steps.length > 0)
		.filter((o) => {
			const k = key(o.steps);
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		});

	if (options.length === 0) {
		turn.candidates = [];
		turn.done = true;
		record.changed();
		await ui.notify('You have no legal moves');
		return state;
	}

	// Ask the engine to rank the moves while the human thinks (used for the evaluation pane).
	backgammonApi
		.evaluateMoves({ position: state.position, player: state.currentPlayer, die1, die2, cube: state.cube })
		.then(
			(r) => {
				turn.candidates = prepareCandidates(r.candidates);
				linkPlayedMove(turn);
				record.changed();
			},
			() => { /* no evaluation for this move */ }
		);

	const chosen = await ui.pickHumanMove(options, state);
	turn.move = { notation: stepsToNotation(chosen.steps), boardAfter: chosen.boardAfter };
	linkPlayedMove(turn); // if the evaluation is already there
	turn.done = true;
	record.changed();
	return { ...state, position: chosen.boardAfter };
}

async function computerMove(state: GameState, ui: GameUi, turn: TurnRecord, record: GameRecord): Promise<GameState> {
	const [die1, die2] = state.dice!;
	const { candidates } = await backgammonApi.evaluateMoves({
		position: state.position,
		player: state.currentPlayer,
		die1,
		die2,
		cube: state.cube,
	});

	if (candidates.length === 0) {
		turn.candidates = [];
		turn.done = true;
		record.changed();
		await ui.notify('Computer has no legal moves');
		return state;
	}

	const best = candidates[0]; // the move the engine plays
	turn.candidates = prepareCandidates(candidates);
	turn.move = { notation: stripDice(best.notation), boardAfter: best.boardAfter };
	linkPlayedMove(turn);
	turn.done = true;
	record.changed();
	return { ...state, position: best.boardAfter };
}