// src/api/types.ts: mirrors the JSON of the C++ BackgammonServer
export type PlayerId = 'P1' | 'P2';
export type Position = number[];

export interface CubeState {
	power: number;
	owner: PlayerId | null;
}

// --- /legal-moves ---
export interface LegalMovesRequest {
	position: Position;
	player: PlayerId;
	die1: number;
	die2: number;
}
export interface CheckerMove {
	from: number;
	to: number;
	isHit: boolean;
	isBearOff: boolean;
}
export interface LegalMove {
	die1: number;
	die2: number;
	player: PlayerId;
	doubleOffer: boolean;
	checkerMoves: CheckerMove[];
	resultingBoard: Position;
}
export interface LegalMovesResponse {
	moves: LegalMove[];
}

// --- /evaluate-moves (server must parse "cube", see the TODO in BackgammonServer.cpp) ---
export interface EvaluateMovesRequest extends LegalMovesRequest {
	cube: CubeState;
}
export interface Candidate {
	notation: string;
	equity: number;
	scoreVector: number[];
	boardAfter: Position;
	level: number;
}
export interface EvaluateMovesResponse {
	candidates: Candidate[];
	bestMoveNotation: string; // "no-move" if none
}

// --- /cube-decision ---
export interface CubeDecisionRequest {
	position: Position;
	player: PlayerId;
	cube: CubeState;
}
export interface RollStat {
	die1: number;
	die2: number;
	scores: number[];
	equity: number;
}

export interface CubeDecisionResponse {
	scores: number[];
	equity: number;
	action: 'double' | 'no-double';
	response: 'take' | 'drop';
	noDoubleRollStats: RollStat[];
	doubleRollStats: RollStat[];
	doubleRollStatsValid: boolean;
	equityNoDouble: number;
    scoresNoDouble: number[];
	equityDoubleTake: number;
	scoresDoubleTake: number[];
	equityDoubleDrop: number;
}