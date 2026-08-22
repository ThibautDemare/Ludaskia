/* ============================================================
   Guide de première visite (#330) — couche UI.
   Trois pièces, branchées au 1er lancement dans l'ordre :
   choix de classe (ui/onboarding) → MOT AUX PARENTS → TOUR ENFANT.

   - `ouvrirMotParents(onClose)` : courte modale adressée à l'ADULTE qui installe
     (voix « vous »), une seule fois. Réutilise la modale a11y standard.
   - `lancerTour(opts)` : tour enfant guidé par la MASCOTTE, 3 grands repères de
     l'accueil (cf. core/tour). Chaque étape amène le bloc à l'écran
     (scrollIntoView) et l'entoure d'un halo lumineux (« spotlight »), pendant que
     la mascotte parle dans un encart FIXE en bas. Toujours sautable (« Passer »
     visible à chaque étape — la tablette n'a pas de touche Échap), audio à la
     demande (TTS), jamais réimposé une fois vu/sauté (drapeau par profil).
   - `maybeOnboarding()` : orchestration du 1er lancement (appelée depuis main.ts).

   Le contenu pur (étapes, textes, drapeaux) vit dans core/tour. Le surlignage
   réutilise le focus-trap a11y SANS verrou de défilement (modal-a11y lockScroll)
   pour pouvoir faire défiler la page jusqu'au bloc surligné.
   ============================================================ */
import {
	TOUR_ETAPES,
	texteTtsEtape,
	tourVu,
	marquerTourVu,
	motParentsVu,
	marquerMotParentsVu,
} from '../core/tour';
import { getXP, niveauDepuisXP } from '../core/progress';
import { mascotteDuNiveau } from '../core/unlocks';
import { lectureConsigneAuto } from '../core/profiles';
import { activateModal } from './modal-a11y';
import { dicteeDisponible, dicterConsigne, stopTts } from './tts';
import { icon } from './icon';
import { html, joindre } from '../core/html';

/** Mouvement réduit : réglage in-app (`html.anim-reduced`) OU préférence système.
    On couvre les DEUX (cf. styles) pour ne jamais imposer de défilement animé. */
function mouvementReduit(): boolean {
	return (
		document.documentElement.classList.contains('anim-reduced') ||
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/* ---------- Tour enfant (mascotte + spotlight) ---------- */

let tourActif = false; // un seul tour à la fois (évite un double-lancement)

/** Lance le tour enfant (3 étapes). `trigger` : élément dont le focus est restauré
    à la fermeture (bouton « ? » en rejeu). Idempotent si un tour est déjà ouvert. */
export function lancerTour(opts: { trigger?: HTMLElement | null } = {}): void {
	if (tourActif || !TOUR_ETAPES.length) return;
	tourActif = true;

	const emoji = mascotteDuNiveau(niveauDepuisXP(getXP())).emoji;
	const ttsDispo = dicteeDisponible();

	const overlay = document.createElement('div');
	overlay.className = 'tour';
	overlay.id = 'tourOverlay';
	overlay.innerHTML = html`
		<div class="tour-card" role="dialog" aria-modal="true" aria-label="Découvre ton accueil">
			<button type="button" class="tour-skip" aria-label="Quitter le guide">${icon('x')}<span>Passer</span></button>
			<div class="tour-say" aria-live="polite" aria-atomic="true">
				<span class="tour-mascotte" aria-hidden="true">${emoji}</span>
				<span class="tour-bulle">
					<span class="tour-title"></span>
					<span class="tour-text"></span>
				</span>
			</div>
			<div class="tour-foot">
				<span class="tour-dots" aria-hidden="true"></span>
				<span class="tour-foot-btns">
					${
						ttsDispo
							? html`<button type="button" class="modal-listen tour-listen" aria-label="Écouter">${icon('speaker')}<span>Écouter</span></button>`
							: ''
					}
					<button type="button" class="modal-ok tour-next"></button>
				</span>
			</div>
		</div>`.balisage;
	document.body.appendChild(overlay);

	const card = overlay.querySelector<HTMLElement>('.tour-card')!;
	const mascEl = card.querySelector<HTMLElement>('.tour-mascotte')!;
	const titleEl = card.querySelector<HTMLElement>('.tour-title')!;
	const textEl = card.querySelector<HTMLElement>('.tour-text')!;
	const dotsEl = card.querySelector<HTMLElement>('.tour-dots')!;
	const next = card.querySelector<HTMLButtonElement>('.tour-next')!;
	const listen = card.querySelector<HTMLButtonElement>('.tour-listen');

	let idx = 0;
	let cibleEl: HTMLElement | null = null;

	// Focus-trap + arrière-plan inerte, MAIS défilement autorisé (scrollIntoView)
	// et Échap = quitter (filet clavier ; sur tablette, c'est le bouton « Passer »).
	const release = activateModal(overlay, {
		trigger: opts.trigger ?? null,
		onEscape: terminer,
		lockScroll: false,
		initialFocus: next,
		restoreFocusTo: () => document.getElementById('btnGuide'),
	});

	function poserSpotlight(el: HTMLElement): void {
		el.classList.add('tour-cible');
		el.scrollIntoView({ block: 'center', behavior: mouvementReduit() ? 'auto' : 'smooth' });
	}

	function lire(): void {
		if (!listen) return;
		stopTts();
		listen.classList.add('speaking');
		dicterConsigne(texteTtsEtape(idx), () => listen.classList.remove('speaking'));
	}

	function rendre(): void {
		const e = TOUR_ETAPES[idx];
		const dernier = idx === TOUR_ETAPES.length - 1;
		// Déplace le halo du bloc précédent vers le nouveau.
		if (cibleEl) cibleEl.classList.remove('tour-cible');
		cibleEl = document.querySelector<HTMLElement>(e.cible);
		if (cibleEl) poserSpotlight(cibleEl);
		// Texte (la région aria-live annonce le changement d'étape).
		titleEl.textContent = e.titre;
		textEl.textContent = e.texte;
		next.textContent = dernier ? "C'est parti !" : 'Suivant';
		dotsEl.innerHTML = joindre(
			TOUR_ETAPES.map((_, i) => html`<span class="tour-dot${i === idx ? ' on' : ''}"></span>`),
		).balisage;
		// Petit « pop » de la mascotte à chaque étape (neutralisé sous mouvement réduit, cf. styles).
		mascEl.classList.remove('pop');
		void mascEl.offsetWidth; // force le reflow pour relancer l'animation CSS
		mascEl.classList.add('pop');
		// Ne PAS re-focuser à chaque étape : l'annonce du focus concurrencerait la
		// région aria-live (le titre+texte de l'étape). Le focus initial est posé par
		// activateModal ; ensuite « Suivant » reste l'élément actif, on n'y touche que
		// s'il a perdu le focus.
		if (document.activeElement !== next) next.focus();
		if (listen && lectureConsigneAuto()) lire();
	}

	function terminer(): void {
		if (!tourActif) return;
		stopTts();
		if (cibleEl) cibleEl.classList.remove('tour-cible');
		marquerTourVu();
		release();
		overlay.remove();
		tourActif = false;
	}

	card.querySelector('.tour-skip')!.addEventListener('click', terminer);
	next.addEventListener('click', () => {
		if (idx >= TOUR_ETAPES.length - 1) {
			terminer();
		} else {
			idx++;
			rendre();
		}
	});
	listen?.addEventListener('click', lire);

	rendre();
}

/* ---------- Mot aux parents (adulte, à l'installation) ---------- */

let motParentsOuvert = false;

/** Courte modale destinée à l'adulte qui installe l'app. `onClose` est appelé à
    la fermeture (quel que soit le moyen) — sert à enchaîner sur le tour enfant. */
export function ouvrirMotParents(
	onClose: () => void,
	opts: { trigger?: HTMLElement | null } = {},
): void {
	if (motParentsOuvert) return;
	motParentsOuvert = true;

	const overlay = document.createElement('div');
	overlay.className = 'modal-overlay';
	overlay.id = 'motParentsOverlay';
	overlay.innerHTML = html`
		<div class="modal parents-modal" role="dialog" aria-modal="true" aria-labelledby="parentsTitle">
			<button type="button" class="modal-close" aria-label="Fermer">${icon('x')}</button>
			<div class="modal-emoji" aria-hidden="true">👋</div>
			<h2 class="modal-title" id="parentsTitle">Un mot pour les parents</h2>
			<div class="parents-body">
				<p>
					Ludaskia entraîne votre enfant en maths et en français, avec une correction immédiate
					et sans aucune pression : pas de publicité, pas de compte, et tout reste sur cet appareil.
				</p>
				<p>
					Vous suivez ses progrès dans l'<strong>espace encadrants</strong>, accessible depuis
					le menu, en haut à droite. Le
					<a href="guide.html" target="_blank" rel="noopener"
						>guide pour les parents<span class="sr-only"> (nouvel onglet)</span></a
					>
					explique tout ce qu'on peut y faire.
				</p>
				<p>Nous allons maintenant présenter l'application à votre enfant, en quelques étapes.</p>
			</div>
			<button type="button" class="modal-ok parents-ok">Montrer à mon enfant</button>
		</div>`.balisage;
	document.body.appendChild(overlay);

	const ok = overlay.querySelector<HTMLButtonElement>('.parents-ok')!;
	const release = activateModal(overlay, {
		trigger: opts.trigger ?? null,
		onEscape: fermer,
		initialFocus: ok,
		restoreFocusTo: () => document.getElementById('btnGuide'),
	});

	function fermer(): void {
		if (!motParentsOuvert) return;
		release();
		overlay.remove();
		motParentsOuvert = false;
		onClose();
	}

	ok.addEventListener('click', fermer);
	overlay.querySelector('.modal-close')!.addEventListener('click', fermer);
	// Tap en dehors de la carte : ferme aussi (et enchaîne).
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) fermer();
	});
}

/* ---------- Orchestration du 1er lancement ---------- */

/** Au 1er lancement, sur l'accueil : mot aux parents (une fois) puis tour enfant.
    Idempotent et sans effet hors accueil ; ne chevauche pas la modale de choix de
    classe (qui relance cet enchaînement via son callback `onChosen`). */
export function maybeOnboarding(): void {
	// Le tour surligne des blocs de l'accueil : ne rien faire si l'accueil n'est
	// pas la vue affichée (deep-link vers un autre écran, exercice en cours…).
	const home = document.getElementById('home');
	if (!home || home.offsetParent === null) return;
	// Choix de classe encore ouvert : on laisse son `onChosen` relancer plus tard.
	if (document.getElementById('onboardingNiveau')) return;
	// Anti-chevauchement : ne rien relancer si le mot aux parents ou le tour est
	// déjà à l'écran (symétrique de la garde ci-dessus ; verrouille un éventuel
	// double appel).
	if (document.getElementById('motParentsOverlay') || document.getElementById('tourOverlay')) {
		return;
	}

	if (!motParentsVu()) {
		marquerMotParentsVu();
		ouvrirMotParents(() => {
			if (!tourVu()) lancerTour();
		});
		return;
	}
	if (!tourVu()) lancerTour();
}
