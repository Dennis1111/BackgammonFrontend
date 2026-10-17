// src/board/heatmap.ts
// A 6x6 grid of equities for the dice combinations, die 1 down the side, die 2 along the top (1-1 top left).
import type { RollStat } from '../api/types';
import { el } from './dom';
import { heatColor } from './equityColors';

export type Grid = (number | null)[][]; // grid[die1 - 1][die2 - 1]

export function toGrid(stats: RollStat[]): Grid {
	const grid: Grid = Array.from({ length: 6 }, () => Array<number | null>(6).fill(null));
	for (const s of stats) { // 6-5 and 5-6 are the same roll
		grid[s.die1 - 1][s.die2 - 1] = s.equity;
		grid[s.die2 - 1][s.die1 - 1] = s.equity;
	}
	return grid;
}

/** a - b for every roll (null where either is missing). */
export function diffGrid(a: Grid, b: Grid): Grid {
	return a.map((row, i) => row.map((v, j) => {
		const w = b[i][j];
		return v === null || w === null ? null : v - w;
	}));
}

const values = (g: Grid): number[] => g.flat().filter((v): v is number => v !== null);

/** Average over all 36 outcomes (the grid holds both orderings, so 6-5 counts twice and 6-6 once). */
export function gridAverage(g: Grid): number | null {
	const v = values(g);
	return v.length === 0 ? null : v.reduce((sum, x) => sum + x, 0) / v.length;
}

/** The value that gets the strongest colour: the largest |equity| in the grids (at least 0.05). */
export function gridScale(...grids: Grid[]): number {
	return Math.max(0.05, ...grids.flatMap(values).map(Math.abs));
}

export function renderHeatmap(grid: Grid, scale: number, signed: boolean): HTMLTableElement {
	const table = el('table', 'heatmap-table');
	const head = el('tr');
	head.append(el('th'));
	for (let d = 1; d <= 6; d++) head.append(el('th', '', String(d)));
	table.append(head);

	grid.forEach((row, i) => {
		const tr = el('tr');
		tr.append(el('th', '', String(i + 1)));
		row.forEach((v, j) => {
			const td = el('td');
			if (v === null) {
				td.textContent = '–';
			} else {
				const c = heatColor(v, scale);
				td.style.background = c.background;
				td.style.color = c.color;
				td.textContent = (signed && v > 0 ? '+' : '') + v.toFixed(2);
				td.title = `${i + 1}-${j + 1}: ${v.toFixed(3)}`;
			}
			tr.append(td);
		});
		table.append(tr);
	});
	return table;
}