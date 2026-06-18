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
	btn.title = 'Écouter la consigne';
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
		// Par défaut le bouton suit la consigne (inline) ; `data-tts-pos="start"`
		// l'ancre EN TÊTE (énoncés longs : il reste rattaché au texte, jamais isolé).
		if (el.dataset.ttsPos === 'start') el.prepend(btn);
		else el.append(btn);
		if (!premier) {
			premier = btn;
			premierTexte = texte;
		}
	});
	// Lecture auto (opt-in profil) : seulement la 1re consigne, best-effort.
	if (premier && lectureConsigneAuto()) parler(premier, premierTexte);
}

/** Cible d'un bouton « haut-parleur » compact (#203). */
export interface ItemTtsCible {
	anchor: Element; // élément d'ancrage du bouton
	texte: string; // mot lu à voix haute
	dans?: boolean; // true : bouton ajouté DANS l'ancre (option) ; sinon JUSTE APRÈS (mot inline)
}

/** Greffe un bouton « haut-parleur » compact (icône seule) lisant UN mot, sur le
    mot-cible (en gras) et sur CHAQUE option d'un QCM (#203, leçons contraires /
    sens proche). Mêmes règles que la consigne : lecture à la demande, jamais en
    rafale (dicterConsigne coupe la lecture en cours), jamais automatique ; aucun
    bouton si l'appareil n'a pas de voix française. Le clic n'enclenche pas le choix
    sous-jacent (stopPropagation). */
export function bindItemTts(cibles: ItemTtsCible[]): void {
	if (!dicteeDisponible()) return; // pas de voix → pas de bouton
	for (const { anchor, texte, dans } of cibles) {
		if (!texte.trim()) continue;
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'item-tts';
		btn.setAttribute('aria-label', `Écouter le mot ${texte}`);
		btn.title = `Écouter le mot ${texte}`;
		btn.innerHTML = icon('speaker');
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			parler(btn, texte);
		});
		if (dans) anchor.append(btn);
		else anchor.insertAdjacentElement('afterend', btn);
	}
}
