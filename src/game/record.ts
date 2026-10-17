// Everything that happened in the games of this session, for the move list and the evaluation pane.
import type { Candidate, CubeDecisionResponse, CubeState, PlayerId, Position } from '../api/types';
import type { GameResult } from './gameLoop';

export interface TurnRecord {
	player: PlayerId;
	positionBefore: Position;
	cubeBefore: CubeState;
	// Cube decision (only when the player was allowed to double)
	cubeAvailable: boolean;                      // was there a cube decision to make in this turn?
	cubeEval: CubeDecisionResponse | null;       // what the engine thinks (arrives asynchronously for you)
	cubeAction: 'double' | 'no-double' | null;   // what was done; null = no cube decision in this turn
	cubeResponse: 'take' | 'drop' | null;
	// Move
	dice: [number, number] | null;               // null if the game ended before the roll (dropped double)
	move: { notation: string; boardAfter: Position } | null; // null = cannot move (or not played yet)
	candidates: Candidate[] | null;              // engine's ranking, best first
	playedIndex: number;                         // index of the played move in `candidates`, -1 = unknown
	done: boolean;                               // the turn is complete
}

export function newTurn(player: PlayerId, position: Position, cube: CubeState): TurnRecord {
	return {
		player, positionBefore: position, cubeBefore: cube,
		cubeAvailable: false, cubeEval: null, cubeAction: null, cubeResponse: null,
		dice: null, move: null, candidates: null, playedIndex: -1, done: false,
	};
}

export class GameRecord {
	readonly turns: TurnRecord[] = [];
	result: GameResult | null = null;
	scoreAfter: { human: number; computer: number } | null = null; // session score after this game

	constructor(readonly number: number, private readonly onChange: () => void) { }

	addTurn(turn: TurnRecord): TurnRecord {
		this.turns.push(turn);
		this.onChange();
		return turn;
	}

	/** Call after changing anything in a turn (or the record itself). */
	changed(): void {
		this.onChange();
	}
}

export class GameHistory {
	readonly games: GameRecord[] = [];
	private listeners: (() => void)[] = [];

	onChange(listener: () => void): void {
		this.listeners.push(listener);
	}

	reset(): void {
		this.games.length = 0;
		this.listeners.forEach((l) => l());
	}

	startGame(): GameRecord {
		const game = new GameRecord(this.games.length + 1, () => this.listeners.forEach((l) => l()));
		this.games.push(game);
		this.listeners.forEach((l) => l());
		return game;
	}
}

export const sameBoard = (a: Position, b: Position): boolean =>
	a.length === b.length && a.every((v, i) => v === b[i]);

/** The cube as it is when the move is played (after an accepted double). */
export function cubeForMove(t: TurnRecord): CubeState {
	if (t.cubeAction === 'double' && t.cubeResponse === 'take') {
		return { power: t.cubeBefore.power + 1, owner: t.player === 'P1' ? 'P2' : 'P1' };
	}
	return t.cubeBefore;
}

// ---------- Errors (XG style thresholds, in equity) ----------
export type ErrorLevel = 'doubtful' | 'error' | 'blunder';

export function errorLevel(loss: number | null): ErrorLevel | null {
	if (loss === null || loss < 0.04) return null;
	if (loss < 0.08) return 'doubtful';
	if (loss < 0.16) return 'error';
	return 'blunder';
}

/** Equity lost compared with the engine's best move, or null if unknown. */
export function moveLoss(t: TurnRecord): number | null {
	const played = t.candidates?.[t.playedIndex];
	if (!t.candidates || t.candidates.length === 0 || !played) return null;
	return t.candidates[0].equity - played.equity;
}

/** Equity lost by the cube action, or null unless the server sends all three cube equities. */
export function cubeLoss(t: TurnRecord): number | null {
	const ev = t.cubeEval;
	if (!ev || !t.cubeAction) return null;
	const { equityNoDouble: nd, equityDoubleTake: dt, equityDoubleDrop: dd } = ev;
	if (nd === undefined || dt === undefined || dd === undefined) return null;
	const doubleEquity = Math.min(dt, dd); // the opponent picks the option that is worse for the doubler
	return Math.max(nd, doubleEquity) - (t.cubeAction === 'double' ? doubleEquity : nd);
}

export function cubeError(t: TurnRecord): ErrorLevel | null {
	const loss = cubeLoss(t);
	if (loss !== null) return errorLevel(loss);
	// Without the three equities we can only tell that the action differs from the engine's.
	if (t.player === 'P1' && t.cubeEval && t.cubeAction && t.cubeEval.action !== t.cubeAction) return 'error';
	return null;
}