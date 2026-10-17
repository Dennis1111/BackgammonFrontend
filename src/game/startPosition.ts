// src/game/startPosition.ts
// 0 = P2 bar, 25 = P1 bar, 26/27 = bear-off, 1-24 = points. Positive = P1, negative = P2.
export const START_POSITION: number[] = (() => {
	const p = new Array<number>(28).fill(0);
	p[24] = 2; p[13] = 5; p[8] = 3; p[6] = 5;    // P1 (human, bottom)
	p[1] = -2; p[12] = -5; p[17] = -3; p[19] = -5; // P2 (computer, top)
	return p;
})();