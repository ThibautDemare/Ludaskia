/* ============================================================
   Persistance des BilanConfig sauvegardés (« favoris »).
   ============================================================ */
import { lsGet, lsSet } from './storage';
import type { BilanConfig } from './catalog';

export const BILANS_KEY = 'ludaskia_bilans';

export function loadBilans(): BilanConfig[] {
	return lsGet(BILANS_KEY, []);
}

export function saveBilan(config: BilanConfig): void {
	const bilans = loadBilans();
	const idx = bilans.findIndex((b) => b.id === config.id);
	if (idx >= 0) bilans[idx] = config;
	else bilans.push(config);
	lsSet(BILANS_KEY, bilans);
}

export function deleteBilan(id: string): void {
	lsSet(
		BILANS_KEY,
		loadBilans().filter((b) => b.id !== id),
	);
}
