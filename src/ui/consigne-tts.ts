/* ============================================================
   Bouton « Écouter la consigne » (#42) — greffe générique.
   Tout runner d'exercice (sauf le sprint chronométré) pose un attribut
   `data-tts="<texte parlé>"` sur son élément de consigne/énoncé (via
   core/tts-text → ttsAttr), puis appelle bindConsigneTts(conteneur) après
   rendu. Ici on injecte le bouton APRÈS la consigne et on câble la lecture.

   Règles d'accessibilité (avis « dys » / TDAH) :
   - lecture À LA DEMANDE ; jamais en rafale (cancel() avant chaque relance) ;
   - PAS de voix FR sur l'appareil → aucun bouton (on ne pollue pas l'écran) ;
   - lecture automatique seulement si le profil l'a activée, et seulement la
     PREMIÈRE consigne de l'écran (best-effort : bloquée hors geste sur iOS).
   ============================================================ */
import { dicteeDisponible, dicterConsigne } from './tts';
import { lectureConsigneAuto } from '../core/profiles';
import { icon } from './icon';

const MARQUE = 'ttsDone'; // dataset flag : élément déjà équipé de son bouton

function parler(btn: HTMLElement, texte: string): void {
	btn.classList.add('speaking');
	dicterConsigne(texte, () => btn.classList.remove('speaking'));
}

function fabriquerBouton(texte: string): HTMLButtonElement {
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'consigne-tts';
	btn.setAttribute('aria-label', 'Écouter la consigne');
	btn.innerHTML = `${icon('speaker')}<span class="consigne-tts-lab">Écouter</span>`;
	btn.addEventListener('click', () => parler(btn, texte));
	return btn;
}

/** Équipe d'un bouton « Écouter » chaque consigne (`[data-tts]`) du conteneur. */
export function bindConsigneTts(root: ParentNode = document): void {
	if (!dicteeDisponible()) return; // pas de voix → pas de bouton
	let premier: HTMLButtonElement | null = null;
	let premierTexte = '';
	root.querySelectorAll<HTMLElement>('[data-tts]').forEach((el) => {
		if (el.dataset[MARQUE]) return; // idempotent (re-rendu partiel)
		el.dataset[MARQUE] = '1';
		const texte = el.dataset.tts || '';
		if (!texte.trim()) return;
		const btn = fabriquerBouton(texte);
		el.insertAdjacentElement('afterend', btn);
		if (!premier) {
			premier = btn;
			premierTexte = texte;
		}
	});
	// Lecture auto (opt-in profil) : seulement la 1re consigne, best-effort.
	if (premier && lectureConsigneAuto()) parler(premier, premierTexte);
}
