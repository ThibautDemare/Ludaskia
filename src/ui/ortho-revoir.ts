/* ============================================================
   Mode Orthographe — page de relecture « Je relis mes mots » (#80).
   Une page d'ÉTUDE PASSIVE (pas un exercice) : tous les mots d'une liste
   sur une seule page, chacun avec les entourages tracés par l'enfant
   (mêmes couleurs/rendu que l'atelier, via dessinerEntourages). Aucune
   saisie, aucune vérification, aucun gain d'XP, aucune étoile.
   La relecture seule ne modifie RIEN : on ne sauvegarde qu'après une
   correction explicite, déclenchée par le crayon d'un mot (qui rouvre
   l'atelier pour ce mot, puis revient ici avec l'entourage mis à jour).
   Voir docs/design-orthographe.md (§ Relecture).
   ============================================================ */

import { loadOrtho, saveOrtho } from '../core/orthographe/store';
import { motsDeLecon, listOrthoLecons } from '../core/orthographe/lessons';
import type { MotOrtho, OrthoState } from '../core/orthographe/types';
import { lettresMotHTML, dessinerEntourages, renderAtelier } from './ortho-atelier';
import { goCategorie } from './navigation';
import { retourFinActivite, activiteDemarree } from './retour-activite';
import { ORTHO_CATEGORY_ID } from '../core/catalog';
import { html, type SafeHtml, VIDE, joindre } from '../core/html';

let st: OrthoState;
let mots: MotOrtho[];
let lessonId: string;
let hostEl: HTMLElement;
let label = '';
let scrollToIdx = -1; // carte à recentrer au prochain rendu (retour de correction)

let resizeHandler: (() => void) | null = null;
function cleanup(): void {
	if (resizeHandler) {
		window.removeEventListener('resize', resizeHandler);
		resizeHandler = null;
	}
}

/** Rend la page de relecture d'une liste dans `host` (typiquement #sheets). */
export function renderOrthoRevoir(host: HTMLElement, id: string): void {
	// Même validation de provenance que les runners (#461) : cette page est atteignable
	// par le routeur sans déclencheur (accès direct au hash, Précédent/Suivant).
	activiteDemarree(id);
	hostEl = host;
	lessonId = id;
	render();
}

function render(): void {
	cleanup();
	// État frais à chaque rendu (couvre le retour de correction). motsDeLecon
	// matérialise les mots prédéfinis en mémoire, mais on ne sauvegarde PAS ici :
	// relire ne doit rien persister (saveOrtho n'a lieu qu'après une correction).
	st = loadOrtho();
	mots = motsDeLecon(st, lessonId);
	label = listOrthoLecons(st).find((l) => l.id === lessonId)?.label ?? 'Mes mots';

	const cartes = joindre(mots.map((mot, i) => carteHTML(mot, i)));

	const corps = mots.length
		? html`<div class="relecture-grille">${cartes}</div>`
		: html`<p class="relecture-vide">Cette liste n'a pas encore de mots.</p>`;

	// Relire est un détour d'une liste lancée depuis le catalogue OU depuis le programme
	// du jour : le retour suit la provenance (#461).
	const retour = retourFinActivite({
		label: 'Retour',
		aller: () => goCategorie(ORTHO_CATEGORY_ID),
	});

	hostEl.innerHTML = html`
    <div class="page relecture">
      <button type="button" class="relecture-retour" id="relRetour">← ${retour.label}</button>
      <h2 class="relecture-titre">📖 Je relis mes mots</h2>
      <p class="relecture-sous">${label}</p>
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
   puis revient à la relecture avec l'entourage mis à jour et sauvegardé. */
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
