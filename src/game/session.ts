// src/game/session.ts
// Running score for the whole session (everything since the page was loaded), like XG's session score.
import type { GameResult } from './gameLoop';

export interface SessionScore {
	games: number;
	human: number;    // points won by you (P1)
	computer: number; // points won by the computer (P2)
}

export const newSession = (): SessionScore => ({ games: 0, human: 0, computer: 0 });

export function addResult(score: SessionScore, result: GameResult): SessionScore {
	return {
		games: score.games + 1,
		human: score.human + (result.winner === 'P1' ? result.points : 0),
		computer: score.computer + (result.winner === 'P2' ? result.points : 0),
	};
}