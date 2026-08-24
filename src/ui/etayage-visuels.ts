/* ============================================================
   Visuels de démonstration de l'étayage (#490) — un moteur, un dessin.
   ------------------------------------------------------------
   Le panneau (ui/etayage-panneau.ts) ne connaît que deux choses : une suite de PAS
   (phrases) et une fonction qui dessine l'état du pas courant. Tout ce qui est propre à
   une famille d'exercice vit ici — et un seul endroit change quand un moteur s'ajoute.

   Règle tenue par les cinq visuels, et qui vaut plus que leur code : la démonstration a
   la MÊME géométrie que l'exercice réel (mêmes classes, mêmes largeurs de case, même
   ordre des colonnes). Un enfant en difficulté ne doit pas avoir à réapprendre un format
   visuel en plus de la méthode. D'où la réutilisation des classes existantes (`.posee-*`,
   `.tc-*`, la figure `droite.ts`) plutôt qu'un habillage propre au panneau.

   Deuxième règle : les visuels sont MUETS pour les technologies d'assistance
   (`aria-hidden` posé par le panneau). Tout ce qu'ils montrent est déjà DIT par la
   narration ; les étiqueter à moitié ferait entendre une grille de chiffres nus en plus
   de l'explication.
   ============================================================ */
import type { EtayageExemple } from '../core/etayage';
import type { DerouleEtayage, PasEtayage } from '../core/etayage-deroule';
import {
	CIBLE_MORCEAU_1,
	CIBLE_MORCEAU_2,
	CIBLE_PRONOM,
	derouleConjugaison,
} from '../core/etayage-conjugaison';
import { cibleColonne, derouleConversion, type ConversionSpec } from '../core/etayage-conversion';
import { derouleDroite, type DerouleDroite, type DroiteSpec } from '../core/etayage-droite';
import {
	cibleRang,
	chiffresParRang,
	deroulePosition,
	type DeroulePosition,
	type PositionSpec,
} from '../core/etayage-position';
import { cibleChiffrePosee, cibleRetenuePosee, deroulePosee } from '../core/etayage-posee';
import { cibleEtape, derouleProbleme, type ProblemeSpec } from '../core/etayage-probleme';
import { renderDroiteGraduee } from '../core/figures/droite';
import { dispositionPosee, poseeGrilleHTML, type PosedSpec } from '../core/items';
import { nomRang } from '../core/nombres';

import { html, type SafeHtml, joindre, brut, attribut } from '../core/html';

/* ---------- Outils communs ---------- */

/** Ce qui est écrit à l'écran au pas `i` : les écritures de tous les pas jusque-là. Le
    rendu rejoue depuis le début à chaque fois — « Précédent » n'a ainsi rien à défaire,
    donc rien à oublier de défaire. */
function ecritesJusqua(pas: PasEtayage[], i: number): Map<string, string> {
	const out = new Map<string, string>();
	for (let k = 0; k <= i && k < pas.length; k++) {
		for (const e of pas[k].ecritures ?? []) out.set(e.cible, e.texte);
	}
	return out;
}

/* Les cases dont on parle À CE PAS (surbrillance). Une seule chose allumée à la fois :
   au bout de six pas, une demi-grille en surbrillance distrairait plus qu'elle n'aiderait. */
function actifsDu(pas: PasEtayage[], i: number): Set<string> {
	return new Set(pas[i]?.actifs ?? []);
}

/* Attributs communs d'une case de démonstration : ses classes (marque commune + état du
   pas) ET sa clé, exposée en `data-cible`.

   La clé n'est pas là pour le rendu : c'est le SÉLECTEUR STABLE des specs Playwright, qui
   comptent les cases déjà remplies sans avoir à connaître la géométrie de chaque moteur.
   Le passage d'un remplissage impératif à un rendu déclaratif l'avait fait disparaître, ce
   qui cassait deux tests de la PR pilote (constat de l'`auteur-tests-e2e`) — d'où sa
   réintroduction ICI, en un seul endroit pour les cinq visuels qui ont des cases, plutôt
   qu'au cas par cas. */
function marqueCase(cible: string, actifs: Set<string>, base = ''): SafeHtml {
	const classes = `${base} etay-cell${actifs.has(cible) ? ' etay-actif' : ''}`.trim();
	return joindre([attribut('class', classes), attribut('data-cible', cible)]);
}

/* ---------- Calcul posé ---------- */

/* La grille jouable, à l'identique (même disposition, même largeur de colonne), mais figée
   et vide de ce qui reste à trouver : l'enfant voit d'emblée COMBIEN de chiffres sont à
   écrire, et les voit arriver un par un. */
function visuelPosee(spec: PosedSpec, deroule: DerouleEtayage, i: number): SafeHtml {
	const disposition = dispositionPosee(spec);
	const ecrites = ecritesJusqua(deroule.pas, i);
	const actifs = actifsDu(deroule.pas, i);
	let ligne = -1; // index de la ligne de chiffres À ÉCRIRE (ordre des rangées)
	const cellules = joindre(
		disposition.rangees.map((rangee) => {
			if (rangee.barre)
				return html`<span class="posee-rule" style="grid-column: 1 / ${disposition.colonnes + 2}"></span>`;
			// La rangée porte-t-elle des cases à trouver ? (les rangées de saisie se succèdent
			// dans le même ordre que les lignes de la résolution.)
			if (rangee.cellules.some((c) => c.role === 'saisie')) ligne++;
			return joindre(
				rangee.cellules.map((c, k) => {
					// `k === 0` est la colonne du signe ; les suivantes sont les colonnes de
					// chiffres, alignées à droite → rang = distance à la colonne des unités.
					const rang = disposition.colonnes - k;
					switch (c.role) {
						case 'signe':
							return html`<span class="posee-cell posee-op">${c.texte}</span>`;
						case 'chiffre':
							return html`<span class="posee-cell posee-digit">${c.chiffre}</span>`;
						case 'zeroDecalage':
							return html`<span class="posee-cell posee-digit posee-zero">0</span>`;
						case 'retenue': {
							const cible = cibleRetenuePosee(rang);
							return html`<span${marqueCase(cible, actifs, 'posee-cell posee-carry')}>${ecrites.get(cible) ?? ''}</span>`;
						}
						case 'saisie': {
							const cible = cibleChiffrePosee(ligne, rang);
							return html`<span${marqueCase(cible, actifs, 'posee-cell posee-input')}>${ecrites.get(cible) ?? ''}</span>`;
						}
						case 'vide':
							return html`<span class="posee-cell"></span>`;
					}
				}),
			);
		}),
	);
	return poseeGrilleHTML(disposition, cellules, 'posee-demo');
}

/* ---------- Tableau de conversion ---------- */

/* Le tableau du runner, mêmes classes et même ordre de colonnes (grande unité à gauche) :
   c'est cet alignement-là que la méthode utilise, et le réapprendre coûterait plus que la
   notion elle-même. Les cases se remplissent au fil des pas. */
function visuelConversion(spec: ConversionSpec, deroule: DerouleEtayage, i: number): SafeHtml {
	const ecrites = ecritesJusqua(deroule.pas, i);
	const actifs = actifsDu(deroule.pas, i);
	const colonnes = joindre(
		spec.colonnes.map((col, k) => {
			const cible = cibleColonne(k);
			const transit = col.transit ? ' tc-head--transit' : '';
			return html`<div class="tc-col">
				<div class="tc-head${transit}">
					<span class="tc-sym">${col.unite}</span>
					<span class="tc-nom">${`${col.nom}s`}</span>
				</div>
				<div class="tc-col-cells"><span${marqueCase(cible, actifs, `tc-cell${col.transit ? ' tc-cell--transit' : ''}`)}>${ecrites.get(cible) ?? ''}</span></div>
			</div>`;
		}),
	);
	return html`<div class="tc-table etay-tc">${colonnes}</div>`;
}

/* ---------- Droite graduée ---------- */

/* La figure du renderer commun, redessinée à chaque pas : repère posé, chemin parcouru.
   C'est le seul moteur dont l'avancement n'est pas une case qui se remplit — d'où l'état
   porté par le pas lui-même (cf. core/etayage-droite.ts). */
function visuelDroite(spec: DroiteSpec, deroule: DerouleDroite, i: number): SafeHtml {
	const pas = deroule.pas[i];
	// Fragment SVG du moteur de figures (cf. sa frontière typée) : composé à partir
	// de nombres et de libellés de leçon, jamais d'une saisie.
	return brut(
		renderDroiteGraduee({
			min: spec.min,
			max: spec.max,
			pas: spec.pas,
			bornes: spec.bornes,
			...(pas?.repere !== undefined ? { reperes: [{ valeur: pas.repere }] } : {}),
			...(pas?.parcours ? { parcours: pas.parcours } : {}),
			// Pas de `desc` : le conteneur du visuel est `aria-hidden` (la narration dit déjà
			// tout), une description y serait du texte que personne n'entend jamais.
		}),
	);
}

/* ---------- Numération (valeur de position, décomposition) ---------- */

/* Le nombre lui-même, posé rang par rang, chaque chiffre sous le nom de son rang : c'est
   le tableau de numération de la classe, construit à partir du nombre que l'enfant a sous
   les yeux — et non un tableau de plus à apprendre. Les chiffres sont là dès le départ
   (le nombre est DONNÉ) ; ce qui bouge, c'est ce qu'on regarde et ce qu'on cache. */
function visuelPosition(spec: PositionSpec, deroule: DeroulePosition, i: number): SafeHtml {
	const actifs = actifsDu(deroule.pas, i);
	const masques = new Set(deroule.pas[i]?.masques ?? []);
	const chiffres = chiffresParRang(spec.n);
	const cases: SafeHtml[] = [];
	for (let rang = chiffres.length - 1; rang >= 0; rang--) {
		const cible = cibleRang(rang);
		const masque = masques.has(cible) ? ' etay-masque' : '';
		cases.push(html`<div${marqueCase(cible, actifs, `etay-rang${masque}`)}>
			<span class="etay-rang-chiffre">${chiffres[rang]}</span>
			<span class="etay-rang-nom">${nomRang(rang) ?? ''}</span>
		</div>`);
	}
	return html`<div class="etay-rangs">${cases}</div>`;
}

/* ---------- Conjugaison ---------- */

/* Les deux morceaux qu'on assemble (radical + terminaison, ou auxiliaire + participe),
   posés à côté du pronom. Le même dessin sert aux quatre temps : c'est justement le geste
   commun — une forme conjuguée se FABRIQUE en deux morceaux — que l'enfant doit voir. */
function visuelConjugaison(deroule: DerouleEtayage, i: number): SafeHtml {
	const ecrites = ecritesJusqua(deroule.pas, i);
	const actifs = actifsDu(deroule.pas, i);
	const morceau = (cible: string) =>
		html`<span${marqueCase(cible, actifs, 'etay-morceau')}>${ecrites.get(cible) ?? ''}</span>`;
	return html`<div class="etay-conj">
		<span${marqueCase(CIBLE_PRONOM, actifs, 'etay-conj-pronom')}>${ecrites.get(CIBLE_PRONOM) ?? ''}</span>
		${morceau(CIBLE_MORCEAU_1)}${morceau(CIBLE_MORCEAU_2)}
	</div>`;
}

/* ---------- Problème à étapes ---------- */

/* L'énoncé et ses sous-questions, comme sur l'écran du runner : les réponses arrivent une
   par une, à leur place. Montrer l'énoncé EN ENTIER pendant tout le déroulé n'est pas du
   décor — c'est là que se trouvent les nombres dont on parle, et un enfant qui a perdu le
   fil doit pouvoir y revenir sans quitter l'explication. */
function visuelProbleme(spec: ProblemeSpec, deroule: DerouleEtayage, i: number): SafeHtml {
	const ecrites = ecritesJusqua(deroule.pas, i);
	const actifs = actifsDu(deroule.pas, i);
	const questions = joindre(
		spec.etapes.map((etape, k) => {
			const cible = cibleEtape(k);
			return html`<li${marqueCase(cible, actifs, 'etay-prob-q')}>
				<span class="etay-prob-txt">${etape.question}</span>
				<span class="etay-prob-rep">${ecrites.get(cible) ?? ''}</span>
			</li>`;
		}),
	);
	return html`<div class="etay-prob">
		<p class="etay-prob-enonce${actifs.has('enonce') ? ' etay-actif' : ''}">${spec.enonce}</p>
		<ol class="etay-prob-liste">${questions}</ol>
	</div>`;
}

/* ---------- Aiguillage ---------- */

/** Ce que le panneau a besoin de savoir d'un exemple : ses pas, et comment le dessiner à
    un pas donné. Un `switch` plutôt qu'une table : chaque branche garde le type CONCRET de
    son moteur (le déroulé de la droite porte un état que les autres n'ont pas), donc pas
    une seule conversion de type à l'aveugle. */
export interface MoteurEtayage {
	deroule: DerouleEtayage;
	visuel: (i: number) => SafeHtml;
}

export function moteurEtayage(exemple: EtayageExemple): MoteurEtayage {
	switch (exemple.moteur) {
		case 'posee': {
			const deroule = deroulePosee(exemple.spec);
			return { deroule, visuel: (i) => visuelPosee(exemple.spec, deroule, i) };
		}
		case 'conversion': {
			const deroule = derouleConversion(exemple.spec);
			return { deroule, visuel: (i) => visuelConversion(exemple.spec, deroule, i) };
		}
		case 'droite': {
			const deroule = derouleDroite(exemple.spec);
			return { deroule, visuel: (i) => visuelDroite(exemple.spec, deroule, i) };
		}
		case 'position': {
			const deroule = deroulePosition(exemple.spec);
			return { deroule, visuel: (i) => visuelPosition(exemple.spec, deroule, i) };
		}
		case 'conjugaison': {
			const deroule = derouleConjugaison(exemple.spec);
			return { deroule, visuel: (i) => visuelConjugaison(deroule, i) };
		}
		case 'probleme': {
			const deroule = derouleProbleme(exemple.spec);
			return { deroule, visuel: (i) => visuelProbleme(exemple.spec, deroule, i) };
		}
	}
}
