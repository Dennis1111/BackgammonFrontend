// src/game/settings.ts
// When the engine's evaluations may be shown to you.
//   tutorial: everything, immediately (also before you have decided)
//   learning: an evaluation is shown only after the decision it belongs to has been made
//   iron:     nothing until the session is over
import type { TurnRecord } from './record';

export type EvalMode = 'tutorial' | 'learning' | 'iron';

export const EVAL_MODES: { value: EvalMode; label: string; help: string }[] = [
	{ value: 'tutorial', label: 'Tutorial', help: 'Everything is shown at once, also before you decide.' },
	{ value: 'learning', label: 'Learning', help: 'An evaluation is shown only after you have made the decision.' },
	{ value: 'iron', label: 'Iron', help: 'All evaluations are hidden until the session is over.' },
];

// The modes the player can choose between. For now only learning is enabled and the selector is hidden.
// Add 'tutorial' and/or 'iron' here to bring them back (the code for them is all still in place).
export const AVAILABLE_MODES: EvalMode[] = ['learning'];
export const isModeAvailable = (m: EvalMode): boolean => AVAILABLE_MODES.includes(m);

const KEY = 'backgammon.evalMode';

function loadMode(): EvalMode {
	try {
		const v = localStorage.getItem(KEY);
		if ((v === 'tutorial' || v === 'learning' || v === 'iron') && AVAILABLE_MODES.includes(v)) return v;
	} catch { /* storage not available */ }
	return AVAILABLE_MODES[0];
}

let mode: EvalMode = loadMode();
let sessionStarted = false; // has the first game of this session started?
let sessionOver = false;
const listeners: (() => void)[] = [];
const emit = () => listeners.forEach((l) => l());

export const getMode = (): EvalMode => mode;
export const isSessionOver = (): boolean => sessionOver;

/** Iron mode can not be switched off once the session has started (that would be peeking). */
export const isLocked = (): boolean => mode === 'iron' && sessionStarted && !sessionOver;

export function setMode(next: EvalMode): void {
	if (isLocked() || !isModeAvailable(next)) return;
	mode = next;
	try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
	emit();
}

export function beginSession(): void { sessionStarted = false; sessionOver = false; emit(); }
export function gameStarted(): void { if (!sessionStarted) { sessionStarted = true; emit(); } }
export function endSession(): void { sessionOver = true; emit(); }
export function onSettingsChange(listener: () => void): void { listeners.push(listener); }

// ---------- the rules: one place decides what may be shown ----------
export function cubeVisible(turn: TurnRecord): boolean {
	if (mode === 'tutorial') return true;
	if (mode === 'iron') return sessionOver;
	return turn.cubeAction !== null; // learning: after the cube action has been taken
}

export function moveVisible(turn: TurnRecord): boolean {
	if (mode === 'tutorial') return true;
	if (mode === 'iron') return sessionOver;
	return turn.done; // learning: after the move has been played
}