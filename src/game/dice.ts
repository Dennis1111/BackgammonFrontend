export function rollDie(): number {
	return Math.floor(Math.random() * 6) + 1;
}

// Highest die first: it is the one a click on a checker uses first (see moveInput.ts),
// and it is shown on the left. Clicking the dice swaps the order.
function highFirst(a: number, b: number): [number, number] {
	return a >= b ? [a, b] : [b, a];
}

export function rollOpeningDice(): [number, number] {
	let die1 = rollDie();
	let die2 = rollDie();
	while (die1 === die2) {
		die1 = rollDie();
		die2 = rollDie();
	}
	return highFirst(die1, die2);
}

export function rollTurnDice(): [number, number] {
	return highFirst(rollDie(), rollDie());
}