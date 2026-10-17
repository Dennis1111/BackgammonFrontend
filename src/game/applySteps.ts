// src/game/applySteps.ts
// Applies partial steps to a position for display only (human = P1).
// Encoding: P1 = positive counts, P2 = negative, P2 bar = 0, P1 bar = 25, P1 bear-off = 26.
import type { Step } from './gameLoop';

export function applyStepsAsP1(position: number[], steps: Step[]): number[] {
	const p = [...position];
	for (const s of steps) {
		p[s.from] -= 1;
		if (s.isHit) {
			p[s.to] = 0; // the P2 blot goes to P2's bar
			p[0] -= 1;
		}
		p[s.isBearOff ? 26 : s.to] += 1;
	}
	return p;
}