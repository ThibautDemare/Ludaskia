/* ============================================================
   Bouton « Écouter la consigne » (#42) — greffe générique.
   Tout runner d'exercice pose un attribut `data-tts="<texte parlé>"` sur son
   élément de consigne/énoncé (via core/tts-text → ttsAttr), puis appelle
   bindConsigneTts(conteneur) après rendu. Ici on injecte le bouton APRÈS la
   consigne et on câble la lecture.

   Règles d'accessibilité (avis « dys » / TDAH) :
   - lecture À LA DEMANDE ; jamais en rafale (cancel() avant chaque relance) ;
   - PAS de voix FR sur l'appareil → aucun bouton (on ne pollue pas l'écran) ;
   - lecture automatique seulement si le profil l'a activée, et seulement la
     PREMIÈRE consigne de l'écran (best-effort : bloquée hors geste sur iOS).

   Le sprint chronométré (#630) passe par la MÊME greffe, avec deux réglages :
   `auto: false` (aucune lecture spontanée sous chrono) et `exclusif: true` (un
   clic pendant la lecture ne relance pas). Il a longtemps été le seul écran
   d'exercice sans accès à l'oral — non par décision, mais par défaut de câblage.

   `bindItemTts` (#203) applique les mêmes règles à un bouton « haut-parleur »
   COMPACT, posé sur le mot-cible et sur chaque option d'un QCM (lecture mot à mot,
   jamais automatique).
   ============================================================ */
import { dicteeDisponible, dicterConsigne } from './tts';
import { lectureConsigneAuto } from '../core/profiles';
import { icon } from './icon';
import { html } from '../core/html';

const MARQUE = 'ttsDone'; // dataset flag : élément déjà équipé de son bouton

/* `onLecture` encadre la lecture : `true` au démarrage, `false` à la fin (ou à
   l'échec, ou sur coupure). UN seul point de code pose et retire donc à la fois
   l'état visuel « ça parle » du bouton et ce que l'appelant y accroche — le gel du
   compte à rebours du sprint (#630). Deux états tenus en synchro à la main
   finiraient par diverger, et c'est le décompte qui resterait figé. */
function parler(btn: HTMLElement, texte: string, onLecture?: (enCours: boolean) => void): void {
	btn.classList.add('speaking');
	onLecture?.(true);
	dicterConsigne(texte, () => {
		btn.classList.remove('speaking');
		onLecture?.(false);
	});
}

function fabriquerBouton(texte: string, opts: ConsigneTtsOptions): HTMLButtonElement {
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'consigne-tts';
	btn.setAttribute('aria-label', 'Écouter la consigne');
	btn.title = 'Écouter la consigne';
	btn.innerHTML = html`${icon('speaker')}<span class="consigne-tts-lab">Écouter</span>`.balisage;
	btn.addEventListener('click', () => {
		// `exclusif` : un clic pendant que ça parle est SANS EFFET, au lieu de couper
		// pour relancer. Sur un écran chronométré, relancer empilerait un second gel du
		// décompte sur la fin du premier — le temps repartirait au milieu de l'audio.
		if (opts.exclusif && btn.classList.contains('speaking')) return;
		parler(btn, texte, opts.onLecture);
	});
	return btn;
}

/** Réglages de la greffe. Les valeurs par défaut reproduisent le comportement
 *  d'origine : tout écran qui appelle `bindConsigneTts(root)` sans options est
 *  strictement inchangé. */
export interface ConsigneTtsOptions {
	/** Lire automatiquement la 1re consigne si le profil l'a activé (défaut : oui).
	 *  Le sprint le refuse : il réécrit son écran à CHAQUE question, donc chacune
	 *  serait « la première » et le réglage lirait 20 à 60 énoncés en 5 minutes. */
	auto?: boolean;
	/** Ignorer un clic pendant qu'une lecture joue, au lieu de la relancer. */
	exclusif?: boolean;
	/** Appelé au démarrage (`true`) et à la fin (`false`) de chaque lecture. */
	onLecture?: (enCours: boolean) => void;
}

/** Équipe d'un bouton « Écouter » chaque consigne (`[data-tts]`) du conteneur. */
export function bindConsigneTts(root: ParentNode = document, opts: ConsigneTtsOptions = {}): void {
	if (!dicteeDisponible()) return; // pas de voix → pas de bouton
	let premier: HTMLButtonElement | null = null;
	let premierTexte = '';
	root.querySelectorAll<HTMLElement>('[data-tts]').forEach((el) => {
		if (el.dataset[MARQUE]) return; // idempotent (re-rendu partiel)
		el.dataset[MARQUE] = '1';
		const texte = el.dataset.tts || '';
		if (!texte.trim()) return;
		const btn = fabriquerBouton(texte, opts);
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
	if (premier && opts.auto !== false && lectureConsigneAuto())
		parler(premier, premierTexte, opts.onLecture);
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
		btn.innerHTML = icon('speaker').balisage;
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			parler(btn, texte);
		});
		if (dans) anchor.append(btn);
		else anchor.insertAdjacentElement('afterend', btn);
	}
}
