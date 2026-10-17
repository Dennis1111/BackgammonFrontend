// src/board/historyPanel.ts
// The side panel in the style of eXtreme Gammon: a game selector, the move list (with cube actions
// and error marks) and, below it, an evaluation pane with the tabs Cube / Move / Summary.
import type { CubeState, PlayerId, Position } from '../api/types';
import { cubeError, cubeForMove, cubeLoss, errorLevel, moveLoss } from '../game/record';
import type { ErrorLevel, GameHistory, GameRecord, TurnRecord } from '../game/record';
import {
	EVAL_MODES, cubeVisible, getMode, isLocked, isModeAvailable, isSessionOver, moveVisible, onSettingsChange, setMode,
} from '../game/settings';
import type { EvalMode } from '../game/settings';
import { probsText } from './format';
import { openRollDiagram } from './rollDiagram';

export interface ReviewTarget {
	position: Position;
	dice: [number, number] | null;
	cube: CubeState;
	player: PlayerId;
}

export interface ReviewHooks {
	/** Show a previous position on the board (during a game this enters review mode). */
	show(target: ReviewTarget): void;
	/** Is this the turn that is being played right now? Then there is nothing to review. */
	live(turn: TurnRecord): boolean;
	/** Back to the live game (restores the live board and its buttons). */
	resume(): void;
}

type Tab = 'cube' | 'move' | 'summary';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
	const e = document.createElement(tag);
	if (className) e.className = className;
	if (text) e.textContent = text;
	return e;
}

// Heading above each group of candidates that were evaluated at the same search depth.
const levelTitle = (level: number): string =>
	level <= 1 ? 'Level 1 · full search' : `Level ${level} · deeper search`;

const signed = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`;

export class HistoryPanel {
	private readonly modeSelect = el('select', 'mode-select');
	private readonly select = el('select', 'history-select');
	private readonly list = el('div', 'history-list');
	private readonly tabBar = el('div', 'eval-tabs');
	private readonly body = el('div', 'eval-body');

	private tab: Tab = 'move';
	private gameIndex = -1;                        // -1 = follow the latest game
	private selectedTurn: TurnRecord | null = null; // null = follow the latest turn
	private selectedCandidate = -1;
	private optionsKey = '';
	private scrollToEnd = false;                    // scroll the list to the last move on the next draw
	private revealSelected = false;                 // scroll the selected row into view on the next draw
	private rowEntries: { turn: TurnRecord; select: () => void; selected: boolean; el: HTMLElement }[] = []; // rows in display order
	private readonly modes = EVAL_MODES.filter((m) => isModeAvailable(m.value));

	constructor(private readonly history: GameHistory, host: HTMLElement, private readonly review: ReviewHooks) {
		for (const [tab, label] of [['cube', 'Cube'], ['move', 'Move'], ['summary', 'Summary']] as [Tab, string][]) {
			const button = el('button', '', label);
			button.dataset.tab = tab;
			button.addEventListener('click', () => {
				this.tab = tab;
				this.refresh();
			});
			this.tabBar.append(button);
		}
		const pane = el('div', 'eval-pane');
		pane.append(this.tabBar, this.body);

		// The mode selector only exists when there is more than one mode to choose from.
		if (this.modes.length > 1) {
			const modeRow = el('div', 'mode-row');
			for (const m of this.modes) {
				const option = el('option', '', m.label);
				option.value = m.value;
				option.title = m.help;
				this.modeSelect.append(option);
			}
			this.modeSelect.addEventListener('change', () => setMode(this.modeSelect.value as EvalMode));
			modeRow.append(el('label', '', 'Evaluations: '), this.modeSelect);
			host.append(modeRow);
		}
		host.append(this.select, this.list, pane);

		this.select.addEventListener('change', () => {
			const i = Number(this.select.value);
			this.gameIndex = i === this.history.games.length - 1 ? -1 : i;
			this.selectedTurn = null;
			this.selectedCandidate = -1;
			this.refresh();
		});

		history.onChange(() => this.refresh());
		onSettingsChange(() => this.refresh());
		document.addEventListener('keydown', (e) => this.onKey(e));
		this.refresh();
	}

	/** Jump to the newest game and its latest turn (called when a new game starts). */
	followLatest(): void {
		this.gameIndex = -1;
		this.selectedTurn = null;
		this.selectedCandidate = -1;
		this.scrollToEnd = true;
		this.refresh();
	}

	// ---------- what is shown ----------
	private game(): GameRecord | null {
		const games = this.history.games;
		if (games.length === 0) return null;
		return (this.gameIndex < 0 ? undefined : games[this.gameIndex]) ?? games[games.length - 1];
	}

	// Is there anything about this turn that may be shown right now?
	private hasVisibleEval(t: TurnRecord): boolean {
		return (t.cubeAvailable && cubeVisible(t)) || (t.dice !== null && moveVisible(t));
	}

	private turn(): TurnRecord | null {
		const game = this.game();
		if (!game || game.turns.length === 0) return null;
		if (this.selectedTurn && game.turns.includes(this.selectedTurn)) return this.selectedTurn;
		// Following: the latest turn whose evaluation may be shown, preferring your own turns.
		// (In learning mode this keeps the feedback on your last decision up while you make the next one.)
		const shown = game.turns.filter((t) => this.hasVisibleEval(t));
		const mine = shown.filter((t) => t.player === 'P1');
		return mine[mine.length - 1] ?? shown[shown.length - 1] ?? null;
	}

	// The turn being played right now (you about to double or roll, or the computer thinking).
	private liveTurn(): TurnRecord | null {
		const game = this.game();
		const last = game?.turns[game.turns.length - 1];
		return last && this.review.live(last) ? last : null;
	}

	// The row that is highlighted in the list: your explicit choice, else the live turn, else the latest evaluated turn.
	private listTurn(): TurnRecord | null {
		const game = this.game();
		if (game && this.selectedTurn && game.turns.includes(this.selectedTurn)) return this.selectedTurn;
		return this.liveTurn() ?? this.turn();
	}

	private hiddenText(): string {
		return getMode() === 'iron'
			? 'Hidden until the session is over (iron mode).'
			: 'Hidden until you have made this decision (learning mode).';
	}

	private refresh(): void {
		this.modeSelect.value = getMode();
		this.modeSelect.disabled = isLocked();
		this.modeSelect.title = isLocked() ? 'Iron mode is locked until the session is over.' : '';
		this.renderSelect();
		this.renderList();
		this.renderEval();
	}

	// ---------- game selector ----------
	private renderSelect(): void {
		const games = this.history.games;
		const labels = games.map((g) => {
			const s = g.scoreAfter;
			return s
				? `Game ${g.number}: You ${s.human} – ${s.computer} Computer (${signed(s.human - s.computer)})`
				: `Game ${g.number}: in progress`;
		});
		const key = labels.join('|');
		if (key !== this.optionsKey) { // rebuild only when needed, so an open dropdown is not closed
			this.optionsKey = key;
			this.select.replaceChildren(
				...labels.map((label, i) => {
					const option = el('option', '', label);
					option.value = String(i);
					return option;
				})
			);
		}
		const shown = this.game();
		if (shown) this.select.value = String(games.indexOf(shown));
	}

	// ---------- move list ----------
	private renderList(): void {
		const game = this.game();
		const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 30;
		const scrollTop = this.list.scrollTop;
		this.list.replaceChildren();
		this.rowEntries = [];
		if (!game) return;

		const current = this.listTurn();
		const live = this.liveTurn();
		game.turns.forEach((turn, i) => {
			let number = i % 2 === 0 ? `${i / 2 + 1})` : ''; // XG numbers a pair of turns
			const hasMove = turn.dice !== null || !turn.done; // the turn being played has a row from the start
			const selected = turn === current;
			const cubeSelected = selected && turn !== live && (this.tab === 'cube' || !hasMove);

			if (turn.cubeAction === 'double') {
				const text = turn.cubeResponse ? `Double/${turn.cubeResponse === 'take' ? 'Take' : 'Drop'}` : 'Double';
				const select = () => this.choose(turn, 'cube');
				const row = this.row(turn, number, text, cubeVisible(turn) ? cubeError(turn) : null, cubeSelected, 1 << (turn.cubeBefore.power + 1), select);
				this.list.append(row);
				this.rowEntries.push({ turn, select, selected: cubeSelected, el: row });
				number = '';
			}

			if (hasMove) {
				const dice = turn.dice ? `${turn.dice[0]}${turn.dice[1]}` : '';
				// Before the roll the row is empty (a non-breaking space keeps the row height).
				const text = !dice ? '\u00A0' : !turn.done ? `${dice}: …` : turn.move ? `${dice}: ${turn.move.notation}` : `${dice}: Cannot Move`;
				// A cube mistake without a "Double" row (you should have doubled) is marked on the move row.
				const moveMark = moveVisible(turn) ? errorLevel(moveLoss(turn)) : null;
				const cubeMark = cubeVisible(turn) && turn.cubeAction !== 'double' ? cubeError(turn) : null;
				const mark = moveMark ?? cubeMark;
				const select = () => this.choose(turn, this.tab === 'summary' || this.tab === 'cube' ? 'move' : this.tab);
				const row = this.row(turn, number, text, mark, selected && !cubeSelected, undefined, select);
				this.list.append(row);
				this.rowEntries.push({ turn, select, selected: selected && !cubeSelected, el: row });
			}
		});

		const toEnd = this.scrollToEnd || (this.selectedTurn === null && atBottom);
		this.scrollToEnd = false;
		this.list.scrollTop = toEnd ? this.list.scrollHeight : scrollTop;

		if (this.revealSelected) { // after moving with the arrow keys: keep the selected row visible
			this.revealSelected = false;
			this.rowEntries.find((r) => r.selected)?.el.scrollIntoView?.({ block: 'nearest' });
		}
	}

	// Up / Down arrows move through the rows of the move list (cube actions and moves), like clicking them.
	private onKey(e: KeyboardEvent): void {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
		const target = document.activeElement;
		if (target instanceof HTMLElement && (['SELECT', 'INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)) return;
		if (document.querySelector('.modal-backdrop') || this.rowEntries.length === 0) return;

		e.preventDefault(); // do not scroll the list, move the selection instead
		const up = e.key === 'ArrowUp';
		const last = this.rowEntries.length - 1;
		const current = this.rowEntries.findIndex((r) => r.selected);
		let next = current < 0 ? (up ? last : -1) : Math.max(0, Math.min(last, current + (up ? -1 : 1)));
		// The turn being played right now can not be reviewed: skip its rows when going up.
		while (up && next > 0 && this.review.live(this.rowEntries[next].turn)) next--;
		if (next < 0 || next === current || this.rowEntries[next] === undefined) return;
		this.revealSelected = true;
		this.rowEntries[next].select();
	}

	private row(
		turn: TurnRecord, number: string, text: string, mark: ErrorLevel | null,
		selected: boolean, cubeNumber: number | undefined, onClick: () => void
	): HTMLElement {
		const row = el('div', selected ? 'history-row selected' : 'history-row');
		row.append(
			el('span', 'row-no', number),
			el('span', `row-player ${turn.player === 'P1' ? 'p1' : 'p2'}`),
			el('span', mark ? `row-mark ${mark}` : 'row-mark')
		);
		if (cubeNumber !== undefined) row.append(el('span', 'cube-badge', String(cubeNumber)));
		row.append(el('span', 'row-text', text));
		row.addEventListener('click', onClick);
		return row;
	}

	private choose(turn: TurnRecord, tab: Tab): void {
		this.selectedTurn = turn;
		this.selectedCandidate = -1;
		this.tab = tab;
		if (this.review.live(turn)) {
			// The turn being played right now: nothing to review, go back to the live game.
			this.review.resume();
			return;
		}
		const cubeTab = tab === 'cube';
		this.review.show({
			position: turn.positionBefore,
			dice: cubeTab ? null : turn.dice,
			cube: cubeTab ? turn.cubeBefore : cubeForMove(turn),
			player: turn.player,
		});
		this.refresh();
	}

	// ---------- evaluation pane ----------
	private renderEval(): void {
		const scrollTop = this.body.scrollTop;
		const turn = this.turn();

		// Before the roll a turn has no move yet, so its evaluation (after you have doubled or rolled) is the cube one.
		const tab: Tab = this.tab === 'move' && turn !== null && turn.dice === null && turn.cubeAvailable ? 'cube' : this.tab;
		this.tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));

		let content: HTMLElement;
		if (tab === 'summary') content = this.summaryView();
		else if (!turn) content = el('div', 'eval-empty', this.noTurnText());
		else if (tab === 'cube') content = this.cubeView(turn);
		else content = this.moveView(turn);

		// While the live turn is highlighted in the list, the pane keeps showing the feedback on the last decision.
		const live = this.liveTurn();
		if (turn && tab !== 'summary' && this.selectedTurn === null && live !== null && turn !== live) {
			const wrap = el('div');
			wrap.append(el('div', 'eval-caption', turn.player === 'P1' ? 'Feedback on your last move' : 'Latest evaluation'), content);
			content = wrap;
		}

		this.body.replaceChildren(content);
		this.body.scrollTop = scrollTop;
	}

	private noTurnText(): string {
		if (this.game()?.turns.length) return this.hiddenText();
		return 'No moves yet.';
	}

	private moveView(turn: TurnRecord): HTMLElement {
		if (!turn.dice) return el('div', 'eval-empty', 'No move in this turn.');
		if (!moveVisible(turn)) return el('div', 'eval-empty', this.hiddenText());
		if (turn.done && !turn.move) return el('div', 'eval-empty', 'No legal move.');
		if (!turn.candidates) return el('div', 'eval-empty', turn.player === 'P1' ? 'Evaluating…' : 'Thinking…');

		const wrap = el('div');
		const best = turn.candidates[0];
		// The list is sorted on search level first (deepest first), then on equity within each level.
		// Headings only make sense when there is more than one level.
		const showLevels = new Set(turn.candidates.map((c) => c.level ?? 1)).size > 1;
		turn.candidates.slice(0, 20).forEach((c, i, all) => {
			const level = c.level ?? 1;
			if (showLevels && (i === 0 || level !== (all[i - 1].level ?? 1))) {
				wrap.append(el('div', 'level-header', levelTitle(level)));
			}
			const classes = ['cand-row'];
			if (i === turn.playedIndex) classes.push('played');
			if (i === this.selectedCandidate) classes.push('selected');
			const row = el('div', classes.join(' '));

			const top = el('div', 'cand-top');
			top.append(
				el('span', 'cand-check', i === turn.playedIndex ? '✓' : ''),
				el('span', i === 0 ? 'cand-notation best' : 'cand-notation', c.notation)
			);
			top.append(el('span', 'cand-equity', c.equity.toFixed(3)));
			const sub = el('div', 'cand-sub');
			sub.append(
				el('span', 'cand-probs', probsText(c.scoreVector)),
				el('span', 'cand-diff', i === 0 ? '' : (c.equity - best.equity).toFixed(3))
			);
			row.append(top, sub);

			row.addEventListener('click', () => {
				this.selectedCandidate = i;
				this.review.show({ position: c.boardAfter, dice: null, cube: cubeForMove(turn), player: turn.player });
				this.refresh();
			});
			wrap.append(row);
		});
		return wrap;
	}

	private cubeView(turn: TurnRecord): HTMLElement {
		if (!turn.cubeAvailable) {
			return el('div', 'eval-empty', 'No cube decision in this turn (opening roll, or the opponent owns the cube).');
		}
		if (!cubeVisible(turn)) return el('div', 'eval-empty', this.hiddenText());
		const ev = turn.cubeEval;
		if (!ev) return el('div', 'eval-empty', 'Evaluating…');

		const wrap = el('div', 'cube-view');
		const who = turn.player === 'P1' ? 'You' : 'Computer';
		const action = (double: boolean, response: string | null) =>
			double ? `Double / ${response === 'take' ? 'Take' : 'Pass'}` : 'No double';

		const played = turn.cubeAction === null ? 'not decided yet' : action(turn.cubeAction === 'double', turn.cubeResponse);
		wrap.append(
			el('div', 'cube-line', `${who} played: ${played}`),
			el('div', 'cube-line best', `Engine: ${action(ev.action === 'double', ev.response)}  (equity ${ev.equity.toFixed(3)})`),
			el('div', 'cand-probs', probsText(ev.scores))
		);

		// Pop-up with the equity of every roll (after a double / without doubling)
		if (ev.doubleRollStats.length > 0 || ev.noDoubleRollStats.length > 0) {
			const info = el('button', 'info-button', 'ⓘ Equity per roll');
			info.addEventListener('click', () => openRollDiagram(ev, who));
			wrap.append(info);
		}

		const { equityNoDouble: nd, equityDoubleTake: dt, equityDoubleDrop: dd } = ev;
		if (nd !== undefined && dt !== undefined && dd !== undefined) {
			const bestEquity = Math.max(nd, Math.min(dt, dd));
			const table = el('table', 'cube-table');
			for (const [label, value] of [['No double', nd], ['Double / Take', dt], ['Double / Pass', dd]] as [string, number][]) {
				const tr = el('tr');
				tr.append(el('td', '', label), el('td', 'num', value.toFixed(3)), el('td', 'num', (value - bestEquity).toFixed(3)));
				table.append(tr);
			}
			wrap.append(table);
			const loss = cubeLoss(turn);
			if (loss !== null && loss > 0.0005) wrap.append(el('div', 'cube-line', `Equity lost: ${loss.toFixed(3)}`));
		}
		return wrap;
	}

	private summaryView(): HTMLElement {
		const game = this.game();
		if (!game) return el('div', 'eval-empty', 'No game yet.');
		if (getMode() === 'iron' && !isSessionOver()) return el('div', 'eval-empty', this.hiddenText());

		const stats = (player: PlayerId) => {
			const s = { moves: 0, doubtful: 0, error: 0, blunder: 0, lost: 0 };
			for (const t of game.turns) {
				if (t.player !== player) continue;
				if (t.dice && t.done) s.moves++;
				for (const loss of [moveVisible(t) ? moveLoss(t) : null, cubeVisible(t) ? cubeLoss(t) : null]) {
					if (loss === null || loss <= 0) continue;
					s.lost += loss;
					const level = errorLevel(loss);
					if (level) s[level]++;
				}
			}
			return s;
		};
		const you = stats('P1');
		const comp = stats('P2');

		const table = el('table', 'summary-table');
		const addRow = (label: string, a: string, b: string, header = false) => {
			const tr = el('tr');
			tr.append(el(header ? 'th' : 'td', '', label), el(header ? 'th' : 'td', 'num', a), el(header ? 'th' : 'td', 'num', b));
			table.append(tr);
		};
		addRow('', 'You', 'Computer', true);
		addRow('Moves', String(you.moves), String(comp.moves));
		addRow('Doubtful', String(you.doubtful), String(comp.doubtful));
		addRow('Errors', String(you.error), String(comp.error));
		addRow('Blunders', String(you.blunder), String(comp.blunder));
		addRow('Equity lost', you.lost.toFixed(3), comp.lost.toFixed(3));
		return table;
	}
}