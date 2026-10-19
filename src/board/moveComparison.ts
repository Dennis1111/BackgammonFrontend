// src/board/moveComparison.ts
// Pop-up that compares two moves with heatmaps: the equity after each of the opponent's rolls for
// move 1, for move 2, and the difference between them. Default: the best move against the move played.
// The roll equities come with the candidates (noDoubleRollStats from /evaluate-moves).
import type { Candidate } from '../api/types';
import type { TurnRecord } from '../game/record';
import { el } from './dom';
import { diffGrid, gridAverage, gridScale, renderHeatmap, toGrid } from './heatmap';
import type { Grid } from './heatmap';

const fmt = (x: number | null, signed = false) =>
	x === null ? '–' : (signed && x > 0 ? '+' : '') + x.toFixed(3);

const hasRolls = (c: Candidate): boolean => !!c.noDoubleRollStats && c.noDoubleRollStats.length > 0;
const gridOf = (c: Candidate): Grid | null => (hasRolls(c) ? toGrid(c.noDoubleRollStats!) : null);

function panel(title: string, sub: string, body: HTMLElement): HTMLElement {
	const cell = el('div', 'heatmap');
	cell.append(el('div', 'heatmap-title', title), el('div', 'heatmap-sub', sub), body);
	return cell;
}

export function openMoveComparison(turn: TurnRecord): void {
	const candidates = turn.candidates;
	if (!candidates || candidates.length < 2) return;
	document.querySelector('.modal-backdrop')?.remove();

	let first = 0;                                           // the best move
	let second = turn.playedIndex > 0 ? turn.playedIndex : 1; // the move that was played (or the runner-up)

	const backdrop = el('div', 'modal-backdrop');
	const modal = el('div', 'modal modal-wide');
	modal.setAttribute('role', 'dialog');

	const close = () => {
		backdrop.remove();
		document.removeEventListener('keydown', onKey);
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') close();
	};
	document.addEventListener('keydown', onKey);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) close();
	});

	const head = el('div', 'modal-head');
	const closeButton = el('button', 'modal-close', '×');
	closeButton.title = 'Close (Esc)';
	closeButton.addEventListener('click', close);
	const who = turn.player === 'P1' ? 'your' : "the computer's";
	head.append(el('span', '', `Compare moves: equity after the opponent's roll (${who} point of view)`), closeButton);

	// Choose any two moves
	const picker = (label: string, current: () => number, set: (i: number) => void) => {
		const select = el('select', 'compare-select');
		candidates.slice(0, 30).forEach((c, i) => {
			const tags = (i === 0 ? ' · best' : '') + (i === turn.playedIndex ? ' · played' : '') + (hasRolls(c) ? '' : ' · no roll data');
			const option = el('option', '', `${c.notation}  (${c.equity.toFixed(3)})${tags}`);
			option.value = String(i);
			select.append(option);
		});
		select.value = String(current());
		select.addEventListener('change', () => {
			set(Number(select.value));
			render();
		});
		const wrap = el('label', 'compare-pick', label);
		wrap.append(select);
		return wrap;
	};
	const controls = el('div', 'compare-controls');
	controls.append(
		picker('Move 1 ', () => first, (i) => { first = i; }),
		picker('Move 2 ', () => second, (i) => { second = i; })
	);

	const grid = el('div', 'compare-grid');
	const cells = [el('div'), el('div'), el('div'), el('div', 'heatmap-text')]; // the 4th cell is free for explanations
	cells[3].dataset.slot = 'explanation';
	grid.append(...cells);

	modal.append(head, controls, grid);
	backdrop.append(modal);
	document.body.append(backdrop);

	const message = (text: string) => el('div', 'eval-empty', text);
	const noData = (c: Candidate) => message(`The server sent no roll equities for ${c.notation}.`);

	function render(): void {
		const a = candidates![first];
		const b = candidates![second];
		const ga = gridOf(a);
		const gb = gridOf(b);
		const titleA = `Move 1: ${a.notation}`;
		const titleB = `Move 2: ${b.notation}`;
		const titleD = 'Difference (move 1 − move 2)';
		const diffSub = 'green = move 1 is better after that roll';

		const present = [ga, gb].filter((g): g is Grid => g !== null);
		const scale = gridScale(...present); // both maps share one scale, so the same equity has the same colour

		cells[0].replaceChildren(ga
			? panel(titleA, `equity ${fmt(a.equity)} · average ${fmt(gridAverage(ga))} · scale ±${scale.toFixed(2)}`, renderHeatmap(ga, scale, false))
			: panel(titleA, `equity ${fmt(a.equity)}`, noData(a)));
		cells[1].replaceChildren(gb
			? panel(titleB, `equity ${fmt(b.equity)} · average ${fmt(gridAverage(gb))} · scale ±${scale.toFixed(2)}`, renderHeatmap(gb, scale, false))
			: panel(titleB, `equity ${fmt(b.equity)}`, noData(b)));

		if (ga && gb) {
			const gd = diffGrid(ga, gb);
			const dScale = gridScale(gd);
			cells[2].replaceChildren(panel(titleD, `${diffSub} · average ${fmt(gridAverage(gd), true)} · scale ±${dScale.toFixed(2)}`, renderHeatmap(gd, dScale, true)));
		} else {
			cells[2].replaceChildren(panel(titleD, diffSub, message('Pick two moves that both have roll data.')));
		}
	}

	render();
}