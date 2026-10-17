// Pop-up with a bar chart of the equity for each roll, sorted from best to worst.
// Two tabs: the rolls after a double (doubleRollStats) and the rolls without doubling (noDoubleRollStats).
import type { CubeDecisionResponse, RollStat } from '../api/types';
import { EQUITY_NEGATIVE, EQUITY_POSITIVE } from './equityColors';
import { probsText } from './format';

type Which = 'double' | 'no-double';

interface Roll {
	hi: number;      // higher die
	lo: number;      // lower die
	weight: number;  // number of the 36 outcomes: 2 for 6-5, 1 for 6-6
	equity: number;
	scores: number[];
}

// One entry per roll, whether the server sends 21 combinations or all 36 orderings.
function uniqueRolls(stats: RollStat[]): Roll[] {
	const rolls = new Map<string, Roll>();
	for (const s of stats) {
		const hi = Math.max(s.die1, s.die2);
		const lo = Math.min(s.die1, s.die2);
		const key = `${hi}${lo}`;
		if (!rolls.has(key)) rolls.set(key, { hi, lo, weight: hi === lo ? 1 : 2, equity: s.equity, scores: s.scores });
	}
	return [...rolls.values()].sort((a, b) => b.equity - a.equity || b.hi - a.hi || b.lo - a.lo);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(
	tag: K, attrs: Record<string, string | number> = {}, text?: string
): SVGElementTagNameMap[K] {
	const e = document.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
	if (text !== undefined) e.textContent = text;
	return e;
}

function html<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
	const e = document.createElement(tag);
	if (className) e.className = className;
	if (text) e.textContent = text;
	return e;
}

function niceStep(range: number): number {
	const rough = Math.max(range, 0.1) / 5;
	const pow = Math.pow(10, Math.floor(Math.log10(rough)));
	const f = rough / pow;
	return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}

function chart(rolls: Roll[], average: number): SVGSVGElement {
	const W = 640, H = 300, left = 46, right = 14, top = 16, bottom = 34;
	const plotW = W - left - right;
	const plotH = H - top - bottom;

	const values = rolls.map((r) => r.equity);
	let lo = Math.min(0, average, ...values);
	let hi = Math.max(0, average, ...values);
	const pad = (hi - lo || 0.2) * 0.08;
	lo -= pad;
	hi += pad;
	const y = (v: number) => top + ((hi - v) / (hi - lo)) * plotH;

	const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Equity per roll' });

	// grid lines and the value axis
	const step = niceStep(hi - lo);
	for (let i = Math.ceil(lo / step); i <= Math.floor(hi / step); i++) {
		const v = i * step;
		root.append(
			svg('line', { x1: left, x2: W - right, y1: y(v), y2: y(v), stroke: v === 0 ? '#444' : '#ddd', 'stroke-width': v === 0 ? 1.2 : 1 }),
			svg('text', { x: left - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#555' }, v.toFixed(2))
		);
	}

	// bars, best roll first
	const slot = plotW / rolls.length;
	const barW = slot * 0.7;
	rolls.forEach((r, i) => {
		const x = left + i * slot + (slot - barW) / 2;
		const y0 = y(0);
		const y1 = y(r.equity);
		const bar = svg('rect', {
			x, y: Math.min(y0, y1), width: barW, height: Math.max(1, Math.abs(y1 - y0)),
			fill: r.equity >= 0 ? EQUITY_POSITIVE : EQUITY_NEGATIVE,
			opacity: r.weight === 1 ? 0.6 : 1, // doubles are rarer
		});
		bar.append(svg('title', {}, `${r.hi}-${r.lo}   equity ${r.equity.toFixed(3)}   (${r.weight}/36)\n${probsText(r.scores)}`));
		root.append(bar, svg('text', { x: x + barW / 2, y: H - bottom + 15, 'text-anchor': 'middle', 'font-size': 11, fill: '#222' }, `${r.hi}${r.lo}`));
	});

	// weighted average
	root.append(
		svg('line', { x1: left, x2: W - right, y1: y(average), y2: y(average), stroke: '#1e6fd9', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }),
		svg('text', { x: W - right, y: y(average) - 4, 'text-anchor': 'end', 'font-size': 11, fill: '#1e6fd9' }, `average ${average.toFixed(3)}`)
	);
	return root;
}

/** `who` is "You" or "Computer": the equities are from that player's point of view. */
export function openRollDiagram(ev: CubeDecisionResponse, who: string): void {
	document.querySelector('.modal-backdrop')?.remove();

	const backdrop = html('div', 'modal-backdrop');
	const modal = html('div', 'modal');
	modal.setAttribute('role', 'dialog');
	const body = html('div', 'modal-body');
	const tabs = html('div', 'modal-tabs');

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

	const head = html('div', 'modal-head');
	const closeButton = html('button', 'modal-close', '×');
	closeButton.title = 'Close (Esc)';
	closeButton.addEventListener('click', close);
	head.append(html('span', '', `Equity per roll (${who}'s point of view)`), closeButton);

	const show = (which: Which) => {
		tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.which === which));
		body.replaceChildren();

		const stats = which === 'double' ? ev.doubleRollStats : ev.noDoubleRollStats;
		const valid = which === 'double' ? ev.doubleRollStatsValid && stats.length > 0 : stats.length > 0;
		if (!valid) {
			body.append(html('div', 'eval-empty', which === 'double'
				? 'The engine did not evaluate the rolls after a double in this position.'
				: 'No roll evaluation without doubling for this position.'));
			return;
		}

		const rolls = uniqueRolls(stats);
		const totalWeight = rolls.reduce((sum, r) => sum + r.weight, 0);
		const average = rolls.reduce((sum, r) => sum + r.weight * r.equity, 0) / totalWeight;
		body.append(chart(rolls, average));

		const best = rolls[0];
		const worst = rolls[rolls.length - 1];
		body.append(html('div', 'modal-note',
			`Best roll ${best.hi}-${best.lo} ${best.equity.toFixed(3)} · worst roll ${worst.hi}-${worst.lo} ${worst.equity.toFixed(3)} · ` +
			`the dashed line is the average over all 36 outcomes (lighter bars are doubles, 1/36 each). Hover a bar for details.`));
	};

	for (const [which, label] of [['double', 'Double'], ['no-double', 'No double']] as [Which, string][]) {
		const mark = ev.action === which ? ' ✓' : ''; // ✓ = the engine's cube action
		const button = html('button', '', label + mark);
		button.dataset.which = which;
		button.addEventListener('click', () => show(which));
		tabs.append(button);
	}

	modal.append(head, tabs, body);
	backdrop.append(modal);
	document.body.append(backdrop);
	show('double');
}