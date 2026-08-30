/* ============================================================
   Mode Orthographe — page de relecture « Je relis mes mots » (#80).
   Une page d'ÉTUDE PASSIVE (pas un exercice) : les mots sur une seule
   page, chacun avec les entourages tracés par l'enfant (mêmes couleurs/rendu
   que l'atelier, via dessinerEntourages). Aucune saisie, aucune vérification,
   aucun gain d'XP, aucune étoile.
   La relecture seule ne modifie RIEN : on ne sauvegarde qu'après une
   correction explicite, déclenchée par le crayon d'un mot (qui rouvre
   l'atelier pour ce mot, puis revient ici avec l'entourage mis à jour).
   Voir docs/design-orthographe.md (§ Relecture).

   Deux entrées (#618) :
   - une LISTE entière (`#ortho-revoir-<id>`), l'entrée historique ;
   - une SÉLECTION de mots (`#ortho-revoir`), posée en mémoire par un écran de fin
     de séance (« Relire ces mots ») et consommée UNE fois. La sélection peut
     traverser plusieurs listes : une révision espacée tire ses mots dans toute la
     banque. C'est la raison pour laquelle la page ne s'organise plus autour d'un
     `lessonId` unique mais autour d'un ENSEMBLE de mots, la liste n'étant plus
     qu'une façon parmi d'autres de le constituer.
   ============================================================ */

import { loadOrtho, saveOrtho } from '../core/orthographe/store';
import { motsDeLecon, listOrthoLecons } from '../core/orthographe/lessons';
import type { MotOrtho, OrthoState } from '../core/orthographe/types';
import { lettresMotHTML, dessinerEntourages, renderAtelier } from './ortho-atelier';
import { goCategorie, goHome } from './navigation';
import { retourFinActivite, activiteDemarree, type RetourCible } from './retour-activite';
import { ORTHO_CATEGORY_ID } from '../core/catalog';
import { html, type SafeHtml, VIDE, joindre } from '../core/html';

let st: OrthoState;
let mots: MotOrtho[];
let lessonId: string;
let hostEl: HTMLElement;
let label = '';
let scrollToIdx = -1; // carte à recentrer au prochain rendu (retour de correction)

/** Sélection de mots posée par un écran de fin de séance, consommée par le PROCHAIN
    rendu de la page et une seule fois (#618, critères 12 et 21). Même patron que
    `setPendingOrthoMode` : c'est ce qui garantit qu'un retour arrière, un
    rechargement ou un accès direct au hash retrouve la liste entière, et qu'une
    sélection de séance précédente ne réapparaît jamais. */
export interface SelectionRelecture {
	/** Ids de banque des mots à relire, dans l'ordre où l'enfant les a rencontrés. */
	motIds: readonly string[];
	/** Liste d'origine quand tous les mots en viennent : conserve le sous-titre et la
	    validation de provenance (#461). Absent = sélection multi-listes (révision). */
	lessonId?: string;
}
let pendingSelection: SelectionRelecture | null = null;
/** Pose la sélection que le prochain rendu de la relecture consommera. */
export function setPendingRelecture(s: SelectionRelecture | null): void {
	pendingSelection = s;
}
/* Sélection RETENUE pour l'affichage courant. Distincte de `pendingSelection` : elle
   doit survivre à un re-rendu interne (retour d'une correction au crayon) mais pas à
   une navigation, qui repasse par l'une des deux fonctions d'entrée ci-dessous. */
let selection: SelectionRelecture | null = null;

/* Destination du bouton « ← » de la page, DÉRIVÉE de `lessonId` plutôt que mémorisée :
   une liste suit la provenance d'activité (#461, catalogue ou programme du jour), une
   sélection multi-listes vient de la révision espacée et ramène à l'accueil (#618,
   critère 17). `retourFinActivite` étant pure, la recalculer à chaque rendu donne
   exactement la même valeur qu'une variable posée à l'entrée — avec une variable de
   module de moins à tenir cohérente (remontée `relecteur-qualite`). */
function retourCourant(): RetourCible {
	if (!lessonId) return { label: 'Accueil', aller: goHome };
	return retourFinActivite({ label: 'Retour', aller: () => goCategorie(ORTHO_CATEGORY_ID) });
}

let resizeHandler: (() => void) | null = null;
function cleanup(): void {
	if (resizeHandler) {
		window.removeEventListener('resize', resizeHandler);
		resizeHandler = null;
	}
}

/** Rend la page de relecture d'une LISTE dans `host` (typiquement #sheets).
    Restreinte aux mots d'une sélection en attente quand celle-ci vise cette liste. */
export function renderOrthoRevoir(host: HTMLElement, id: string): void {
	// Même validation de provenance que les runners (#461) : cette page est atteignable
	// par le routeur sans déclencheur (accès direct au hash, Précédent/Suivant).
	activiteDemarree(id);
	hostEl = host;
	lessonId = id;
	// La sélection ne vaut que pour la liste qui l'a posée ; un hash direct vers une
	// AUTRE liste ne doit pas hériter du filtre (critère 12).
	selection = pendingSelection?.lessonId === id ? pendingSelection : null;
	pendingSelection = null;
	render();
}

/** Rend la page pour une SÉLECTION de mots pouvant venir de plusieurs listes (#618).
    Renvoie `false` s'il n'y a aucune sélection en attente — accès direct au hash,
    rechargement, retour arrière : l'appelant redirige alors plutôt que d'afficher une
    page vide, et surtout aucune sélection précédente ne ressort (critère 21). */
export function renderOrthoRevoirSelection(host: HTMLElement): boolean {
	const sel = pendingSelection;
	pendingSelection = null;
	if (!sel || sel.lessonId) return false;
	// Aucune liste derrière laquelle se replier ici : si plus aucun mot de la sélection
	// n'est en banque, il n'y a rien à rendre du tout — mieux vaut l'accueil qu'une page
	// « cette liste n'a pas encore de mots », qui parlerait d'une liste inexistante.
	const banque = loadOrtho().banque;
	if (!sel.motIds.some((id) => banque[id])) return false;
	hostEl = host;
	// `lessonId` vidé : c'est LUI qui distingue les deux entrées partout ailleurs — les
	// mots affichés, le sous-titre, et la destination du bouton « ← » (cf. `retourCourant`,
	// qui ramène à l'accueil parce qu'une révision espacée n'est pas une leçon et n'a donc
	// pas de provenance d'activité au sens de #461).
	lessonId = '';
	selection = sel;
	render();
	return true;
}

/* Mots à afficher. La sélection prime, résolue depuis la banque (elle peut traverser
   plusieurs listes) ; sinon toute la liste. Repli explicite : une sélection dont plus
   aucun mot n'est en banque (donnée nettoyée entre-temps) retombe sur la liste entière
   plutôt que sur une page vide — mieux vaut relire trop que rien.

   « resoudre » et non « motsAffiches » : cette fonction peut ANNULER la sélection en
   repliant, un nom d'accesseur cacherait cet effet de bord (remontée `relecteur-qualite`). */
function resoudreMotsAffiches(): MotOrtho[] {
	const tous = lessonId ? motsDeLecon(st, lessonId) : [];
	if (!selection) return tous;
	const choisis = selection.motIds
		.map((id) => st.banque[id])
		.filter((m): m is MotOrtho => !!m && !!m.mot);
	if (choisis.length) return choisis;
	selection = null; // le sous-titre et la consigne doivent suivre le repli
	return tous;
}

function render(): void {
	cleanup();
	// État frais à chaque rendu (couvre le retour de correction). motsDeLecon
	// matérialise les mots prédéfinis en mémoire, mais on ne sauvegarde PAS ici :
	// relire ne doit rien persister (saveOrtho n'a lieu qu'après une correction).
	st = loadOrtho();
	mots = resoudreMotsAffiches();
	const retour = retourCourant();
	label = lessonId
		? (listOrthoLecons(st).find((l) => l.id === lessonId)?.label ?? 'Mes mots')
		: 'Tes mots à revoir';

	const cartes = joindre(mots.map((mot, i) => carteHTML(mot, i)));

	const corps = mots.length
		? html`<div class="relecture-grille">${cartes}</div>`
		: html`<p class="relecture-vide">Cette liste n'a pas encore de mots.</p>`;

	// Consigne : la même invitation à mémoriser dans les deux cas, précédée d'un rappel
	// de ce qu'on regarde quand la page ne montre PAS toute la liste — sans quoi l'enfant
	// arrivé par « Relire ces mots » croit avoir perdu le reste de ses mots.
	const amorce = selection
		? html`<p class="relecture-amorce">Voici les mots qui t'ont demandé du travail.</p>`
		: VIDE;

	hostEl.innerHTML = html`
    <div class="page relecture">
      <button type="button" class="relecture-retour" id="relRetour">← ${retour.label}</button>
      <h2 class="relecture-titre">📖 Je relis mes mots</h2>
      <p class="relecture-sous">${label}</p>
      ${amorce}
      <p class="relecture-consigne">Regarde bien chaque mot et ses pièges, et essaie de les retenir dans ta tête.</p>
      ${corps}
    </div>`.balisage;

	hostEl.querySelector('#relRetour')!.addEventListener('click', () => {
		cleanup();
		retour.aller();
	});

	// Crayon d'une carte → correction de l'entourage de ce mot (geste optionnel).
	hostEl.querySelectorAll<HTMLButtonElement>('.relecture-crayon').forEach((btn) => {
		btn.addEventListener('click', () => ouvrirCorrection(Number(btn.dataset.edit)));
	});

	tracerToutesLesCartes();
	// Les offsets dépendent de la police : on retrace une fois les polices prêtes
	// (cas d'un tout premier rendu avant que Nunito ne soit chargée).
	void document.fonts.ready.then(tracerToutesLesCartes);
	resizeHandler = () => tracerToutesLesCartes();
	window.addEventListener('resize', resizeHandler);

	// Retour de correction : recentrer la carte modifiée pour ne pas désorienter.
	if (scrollToIdx >= 0) {
		const cible = hostEl.querySelector<HTMLElement>(`.relecture-carte[data-i="${scrollToIdx}"]`);
		cible?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		scrollToIdx = -1;
	} else {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
}

function carteHTML(mot: MotOrtho, i: number): SafeHtml {
	const vide = mot.entourage.length === 0;
	const crayonLabel = vide
		? `Entourer les pièges de ${mot.mot}`
		: `Corriger les pièges de ${mot.mot}`;
	const comme = mot.commeDans
		? html`<p class="relecture-comme">comme dans <i>${mot.commeDans}</i></p>`
		: VIDE;
	const aide = vide ? html`<p class="relecture-aide">Pas encore de pièges marqués</p>` : VIDE;
	return html`<div class="relecture-carte" data-i="${i}">
      <button type="button" class="relecture-crayon" data-edit="${i}"
              aria-label="${crayonLabel}" title="${crayonLabel}">✏️</button>
      <div class="atelier-stage relecture-stage">
        <div class="relecture-mot" data-mot="${i}">${lettresMotHTML(mot.mot)}</div>
        <svg class="atelier-svg" data-svg="${i}" aria-hidden="true"></svg>
      </div>
      ${comme}
      ${aide}
    </div>`;
}

function tracerToutesLesCartes(): void {
	mots.forEach((mot, i) => {
		const motEl = hostEl.querySelector<HTMLElement>(`.relecture-mot[data-mot="${i}"]`);
		const svg = hostEl.querySelector(`svg[data-svg="${i}"]`) as SVGSVGElement | null;
		if (motEl && svg) dessinerEntourages(motEl, svg, mot.entourage);
	});
}

/* Correction d'un mot : rouvre l'atelier (qui sait charger/sauver mot.entourage),
   puis revient à la relecture avec l'entourage mis à jour et sauvegardé. Fonctionne
   à l'identique sur une sélection multi-listes : l'atelier mute l'objet `MotOrtho` de
   la BANQUE, qui ne dépend d'aucune liste (#618, critère 16). */
function ouvrirCorrection(i: number): void {
	const mot = mots[i];
	if (!mot) return;
	cleanup(); // l'atelier remplace le DOM : on retire notre handler de resize
	scrollToIdx = i;
	renderAtelier(hostEl, mot, {
		consigne: mot.entourage.length
			? 'Tu as repéré un autre piège ? Entoure-le.'
			: 'Surligne les pièges : passe le doigt (ou la souris) sur les lettres où on pourrait se tromper.',
		onDone: () => {
			saveOrtho(st); // l'atelier a mis à jour mot.entourage (objet de `st`)
			render();
		},
	});
}
