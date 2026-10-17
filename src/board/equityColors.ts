// src/board/equityColors.ts
// One colour range for every equity picture (the bar chart and the heatmaps):
// positive = green, negative = red, zero = neutral.
export const EQUITY_POSITIVE = '#2e7d32';
export const EQUITY_NEGATIVE = '#c62828';

const rgb = (hex: string): [number, number, number] => [
	parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
];

/** A cell colour for `value`: white at 0, the full colour at |value| >= scale. */
export function heatColor(value: number, scale: number): { background: string; color: string } {
	const t = Math.min(1, Math.abs(value) / scale);
	const target = rgb(value >= 0 ? EQUITY_POSITIVE : EQUITY_NEGATIVE);
	const mix = (c: number) => Math.round(255 + (c - 255) * t);
	return {
		background: `rgb(${mix(target[0])}, ${mix(target[1])}, ${mix(target[2])})`,
		color: t > 0.55 ? '#fff' : '#111', // readable text on dark cells
	};
}