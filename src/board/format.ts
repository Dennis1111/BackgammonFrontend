// src/board/format.ts

// scoreVector from the point of view of the player who is on roll (the server mirrors it for the computer):
// [win, win gammon, win backgammon, opp. gammon, opp. backgammon].
export function probsText(sv: number[]): string {
	if (sv.length < 5) return '';
	const p = (x: number) => (x * 100).toFixed(1);
	return `P: ${p(sv[0])} ${p(sv[1])} ${p(sv[2])}   O: ${p(1 - sv[0])} ${p(sv[3])} ${p(sv[4])}`;
}