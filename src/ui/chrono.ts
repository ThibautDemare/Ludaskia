/* ============================================================
   Chronomètre de la barre d'outils
   ============================================================ */
import { fmt } from '../core/utils';

let timer: ReturnType<typeof setInterval> | null = null,
	startTs = 0,
	offsetMs = 0, // temps déjà écoulé au démarrage (reprise d'un exercice, #63)
	elapsedMs = 0,
	running = false,
	visible = true; // chrono masqué lors d'une reprise (on n'exhibe pas un compteur déjà avancé)
// Le mode sprint réutilise/réassigne le même handle d'intervalle : accesseurs dédiés.
export const getTimer = () => timer;
export const setTimer = (v: ReturnType<typeof setInterval> | null) => {
	timer = v;
};
/* Démarre le chrono.
   - initialMs : temps déjà écoulé à reprendre (exercice repris, #63).
   - show : false pour un exercice repris — on continue de mesurer en coulisse
     sans afficher un compteur qui « saute » à 01:23 (déroutant pour un CE2). */
export function startChrono(initialMs = 0, show = true) {
	offsetMs = initialMs;
	startTs = Date.now();
	running = true;
	visible = show;
	const el = document.getElementById('chrono')!;
	if (visible) {
		el.classList.remove('hidden');
		el.textContent = fmt(initialMs);
	} else {
		el.classList.add('hidden');
	}
	if (timer) clearInterval(timer);
	timer = setInterval(() => {
		if (running && visible) {
			el.textContent = fmt(offsetMs + (Date.now() - startTs));
		}
	}, 250);
}
/* Temps actif courant (offset + temps écoulé), que le chrono tourne ou non.
   Sert à capturer la progression d'un exercice qu'on quitte (#63). */
export function getElapsed() {
	return running ? offsetMs + (Date.now() - startTs) : elapsedMs;
}
export function stopChrono() {
	if (!running) return elapsedMs;
	running = false;
	elapsedMs = offsetMs + (Date.now() - startTs);
	if (timer) clearInterval(timer);
	const el = document.getElementById('chrono')!;
	// Exercice repris : on dévoile le total (info) seulement à la fin.
	el.classList.remove('hidden');
	el.textContent = fmt(elapsedMs);
	return elapsedMs;
}
export function resetChrono() {
	running = false;
	if (timer) clearInterval(timer);
	elapsedMs = 0;
	offsetMs = 0;
	visible = true;
	const el = document.getElementById('chrono')!;
	el.classList.add('hidden');
	el.textContent = '00:00';
}
