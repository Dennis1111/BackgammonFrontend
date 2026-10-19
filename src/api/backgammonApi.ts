// src/api/backgammonApi.ts
import { getJson, postJson } from './http';
import type {
	CubeDecisionRequest,
	CubeDecisionResponse,
	EvaluateMovesRequest,
	EvaluateMovesResponse,
	LegalMovesRequest,
	LegalMovesResponse,
} from './types';

// The engine calls are CPU-heavy and the server shares engine state between requests, so the
// heavy ones run one at a time. This lets the game start evaluating your move in the background
// while you think, without ever overlapping with the computer's own search.
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
	const run = queue.then(task);
	queue = run.catch(() => undefined);
	return run;
}

export const backgammonApi = {
	health: () => getJson<{ status: string }>('/health'),

	legalMoves: (req: LegalMovesRequest) =>
		postJson<LegalMovesRequest, LegalMovesResponse>('/legal-moves', req),

	evaluateMoves: (req: EvaluateMovesRequest) =>
		oneAtATime(() => postJson<EvaluateMovesRequest, EvaluateMovesResponse>('/evaluate-moves', req)),

	cubeDecision: (req: CubeDecisionRequest) =>
		oneAtATime(() => postJson<CubeDecisionRequest, CubeDecisionResponse>('/cube-decision', req)),
};