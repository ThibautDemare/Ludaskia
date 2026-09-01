/* ============================================================
   Espace encadrant — bloc « Travaillé récemment » (#520).
   ------------------------------------------------------------
   Nomme DIRECTEMENT ce que l'enfant a travaillé sur une fenêtre courte. L'information
   existait déjà, mais elle était introuvable : le graphe d'activité compte des séances
   par jour sans nommer une seule leçon, et le détail par leçon est enfermé dans
   l'accordéon « Notions par catégorie », qu'il fallait déplier catégorie par catégorie
   pour reconstituer la semaine.

   Section à part entière (comme encadrant-erreurs / encadrant-revision / encadrant-banque) :
   elle possède l'état de sa fenêtre et exporte le couple `travailHTML` / `travailClick`,
   que la section « progression » compose et aiguille. Les calculs (sélection, comptage,
   tri) vivent dans core/encadrant-stats (`travailRecent`) ; ici, le rendu et le handler.
   ============================================================ */

import { icon } from './icon';
import { type Profile } from '../core/profiles';
import {
	libelleDerniereFois,
	travailRecentProfil,
	type CapFranchi,
	type CibleTravaillee,
	type GroupeTravail,
} from '../core/encadrant-stats';
import { container, renderEspace } from './encadrant-commun';
import { dicteeDisponible } from './tts';
import { segmentHTML } from './segment';
import { html, type SafeHtml, VIDE, joindre } from '../core/html';

/* ---------- État de la section (module) ----------
   Fenêtre en JOURS calendaires. Défaut : 7 jours, la même fenêtre que le graphe d'activité
   juste au-dessus — deux périodes différentes sur le même écran obligeraient le lecteur à se
   demander pourquoi (avis designer). Pas de choix « Tout », qui reviendrait à lister le
   catalogue. */
let joursTravail = 7;
const PERIODES_TRAVAIL: { jours: number; label: string; phrase: string }[] = [
	{ jours: 1, label: "Aujourd'hui", phrase: "aujourd'hui" },
	{ jours: 2, label: '2 jours', phrase: 'sur les 2 derniers jours' },
	{ jours: 7, label: '1 semaine', phrase: 'sur les 7 derniers jours' },
];
const periodeTravail = () => PERIODES_TRAVAIL.find((p) => p.jours === joursTravail)!;
/* Lignes visibles par matière avant repli : au-delà, la liste devient un mur de texte dans
   un onglet déjà long (avis designer). Le reste est DÉPLIABLE et non résumé par un
   compteur — même parti pris que les erreurs plus anciennes (cf. encadrant-erreurs). */
const MAX_TRAVAIL_PAR_MATIERE = 6;

/* Groupé par MATIÈRE, chaque ligne portant sa CATÉGORIE : le libellé seul (« Décompo. de 60 »)
   ne dit pas à un parent s'il s'agit d'une notion de base ou avancée (avis pédago). Et aucun
   état d'acquisition par ligne — une notion tout juste abordée est normalement encore « à
   découvrir », un badge afficherait donc un niveau bas sur ce qu'il y a de plus récent (idem). */
export function travailHTML(consulte: Profile): SafeHtml {
	const { jours, phrase } = periodeTravail();
	const now = Date.now();
	// `dicteeDisponible()` : l'état courant d'une liste en dépend (un mode requis en moins sans
	// voix de synthèse), et cet état sert à ne pas annoncer un cap que la liste ne porte plus
	// (#536, cf. capAnnoncable). Le paramètre a un défaut `false`, donc l'oublier ne casse rien
	// bruyamment — il rendrait seulement l'état des listes plus optimiste qu'il ne l'est.
	const groupes = travailRecentProfil(consulte, jours, now, dicteeDisponible());
	const total = groupes.reduce((s, g) => s + g.cibles.length, 0);
	const resume = resumeTravail(groupes, phrase);
	// Bascule de période : mêmes fenêtres que le filtre des erreurs, sans « Tout ».
	// L'option active porte le résultat du filtre dans son nom accessible (comme les
	// erreurs) : sinon, au clavier, on change de période sans savoir ce que ça donne.
	const bascule = segmentHTML({
		act: 'travail-periode',
		valAttr: 'jours',
		label: 'Période des leçons travaillées',
		active: String(jours),
		options: PERIODES_TRAVAIL.map((p) => ({
			val: String(p.jours),
			label: p.label,
			ariaLabel: p.jours === jours ? `${p.label}, ${resume.toLowerCase()}` : undefined,
		})),
	});
	const corps =
		total === 0
			? html`<p class="enc-hint">${resume}.</p>`
			: html`${joindre(groupes.map((g) => groupeTravailHTML(g, now)))}
      <p class="enc-hint">${resume}.</p>`;
	return html`<div class="enc-block">
      <h3 class="enc-h3">${icon('check-square')} Travaillé récemment</h3>
      ${bascule}
      ${corps}
    </div>`;
}

/* Synthèse du bloc — UNE seule formulation, qui sert aussi de nom accessible à l'option de
   période active : deux textes séparés avaient divergé (l'écran disait « Aucune leçon
   travaillée » quand le lecteur d'écran entendait « 0 leçon travaillée »).
   Les dictées sont comptées À PART : elles figurent bien dans la liste, mais annoncer
   « 1 leçon travaillée » pour une dictée serait faux, et l'écran distingue soigneusement les
   deux partout ailleurs. Fenêtre vide : on parle du temps écoulé et non de l'effort de
   l'enfant, avec le mot déjà employé par le graphe d'activité juste au-dessus (« Aucune
   session ») — et jamais un « 0 » en tête de phrase. */
function resumeTravail(groupes: GroupeTravail[], phrase: string): string {
	const cibles = groupes.flatMap((g) => g.cibles);
	if (cibles.length === 0) return `Aucune session ${phrase}`;
	const dictees = cibles.filter((c) => c.kind === 'dictee').length;
	const lecons = cibles.length - dictees;
	const bouts = [
		lecons > 0 ? `${lecons} leçon${lecons > 1 ? 's' : ''}` : '',
		dictees > 0 ? `${dictees} dictée${dictees > 1 ? 's' : ''}` : '',
	].filter(Boolean);
	return `${bouts.join(' et ')} travaillée${cibles.length > 1 ? 's' : ''} ${phrase}`;
}

/* Une matière : son libellé, ses lignes, et le reste DÉPLIABLE au-delà de
   MAX_TRAVAIL_PAR_MATIERE (jamais un simple compteur : annoncer des lignes sans permettre
   de les lire crée un écart inexplicable, cf. les erreurs plus anciennes). */
function groupeTravailHTML(g: GroupeTravail, now: number): SafeHtml {
	const visibles = g.cibles.slice(0, MAX_TRAVAIL_PAR_MATIERE);
	const reste = g.cibles.slice(MAX_TRAVAIL_PAR_MATIERE);
	const texte = `${reste.length} autre${reste.length > 1 ? 's' : ''}`;
	// Nom accessible enrichi de la matière : deux matières peuvent déborder, et une série
	// de « 3 autres » identiques serait sans repère en navigation au rotor.
	const repli = reste.length
		? html`<details class="enc-trav-plus">
        <summary class="enc-trav-plus-sum" aria-label="${`${texte} en ${g.label.toLowerCase()}`}">${texte}</summary>
        <ul class="enc-trav-list">${joindre(reste.map((c) => ligneTravailHTML(c, now)))}</ul>
      </details>`
		: VIDE;
	return html`<h4 class="enc-sub-lab">${g.label}</h4>
      <ul class="enc-trav-list">${joindre(visibles.map((c) => ligneTravailHTML(c, now)))}</ul>
      ${repli}`;
}

/* Mot de la mention de cap (#536). Chaque terme est repris d'ailleurs sur cet écran plutôt
   qu'inventé, et les trois choix ont une raison qui a déjà servi :

   Au FÉMININ, le sujet implicite étant la leçon ou la dictée — convention posée par
   `MOT_CELLULE` (encadrant-notions) et déjà appliquée à la suite de libellés masculins dans
   la méta des lignes de `notionsHTML`. L'accord tient donc même après « Le passé composé ».

   « RÉCEMMENT » et non « tout juste » : « tout juste » a deux sens en français, temporel (« à
   l'instant ») et restrictif (« à peine, de justesse »), et le second se lirait comme un
   jugement sur la solidité de l'acquisition — l'inverse de ce que cette mention veut dire.
   « Récemment » est déjà le mot de la fraîcheur d'un état sur ce même écran (« N maîtrisées
   récemment », dans le bandeau de chiffres-clés).

   « PASSÉE EN COURS » et non « commencée », et c'est le point qui m'a échappé au premier jet :
   l'échelle d'une leçon compte un palier « à renforcer » ENTRE « à découvrir » et « en cours »,
   si bien qu'une leçon peut être travaillée depuis des semaines et ne franchir « en cours » que
   maintenant. Ce n'est alors pas un commencement, c'est une progression, et `EVENEMENT_CELLULE`
   dit déjà « passée en cours » pour exactement ce fait. « Commencée » ne serait exact que pour
   une LISTE, dont l'échelle n'a que trois crans — or cette table ne distingue pas les deux
   familles, donc il faut le mot qui reste vrai des deux côtés (avis langue).

   Deux entrées et jamais plus : ce sont les deux seuls franchissements que les journaux datent,
   et les deux seuls que le pédagogue a autorisés à figurer ici. Rien de bas ni d'intermédiaire
   n'a de mot dans cette table, ce qui rend le critère 6 impossible à violer par inadvertance. */
const MOT_CAP: Record<CapFranchi, string> = {
	'en-cours': 'récemment passée en cours',
	acquis: 'récemment acquise',
};

/* Une ligne : libellé de la leçon (ou de la liste de dictée) + méta factuelle. Le compte
   est OMIS quand il est inconnu (leçon travaillée dans un bilan ou un sprint, qui ne
   référencent pas une cible unique) — mieux vaut une méta plus courte qu'un chiffre faux.
   « 2 fois » et non « travaillée 2 fois » : cette dernière formule est celle de l'accordéon
   « Notions par catégorie », où elle compte les séances DEPUIS TOUJOURS. Deux chiffres
   différents sous la même phrase, sur le même écran, se lisaient comme un bug (avis langue) ;
   l'ellipse réserve la formule longue au compte cumulé.
   Pas d'action sur la ligne : épingler et imprimer restent groupés dans l'accordéon, ce bloc
   est une lecture. */
function ligneTravailHTML(c: CibleTravaillee, now: number): SafeHtml {
	const meta = [
		c.kind === 'dictee' ? 'Dictée' : c.contexte,
		c.seances === null ? '' : `${c.seances} fois`,
		libelleDerniereFois(c.derniereFois, now),
	]
		.filter(Boolean)
		.join(' · ');
	// La mention de cap (#536), SEULE exception à la règle « aucun état sur ces lignes ». Elle
	// est dans la méta et non en badge : un badge se lit comme un état permanent, alors que le
	// fait est ponctuel et daté (« ça a bougé pendant la fenêtre affichée »). Et elle arrive en
	// TÊTE de la méta, parce que c'est la seule chose de la ligne qui ne soit pas de l'activité.
	// Rien n'est ajouté quand `capFranchi` est nul, ce qui est le cas ordinaire : une mention
	// vide sur chaque ligne rendrait le signal invisible là où il existe.
	const complete = c.capFranchi
		? html`<span class="enc-trav-cap">${MOT_CAP[c.capFranchi]}</span> · ${meta}`
		: html`${meta}`;
	return html`<li class="enc-trav-item">
      <span class="enc-trav-lab">${c.label}</span>
      <span class="enc-trav-meta">${complete}</span>
    </li>`;
}

/* Handler délégué (aiguillé par la section « progression », qui compose ce bloc). */
export function travailClick(act: string, el: HTMLElement): boolean {
	if (act !== 'travail-periode') return false;
	const jours = Number(el.dataset.jours);
	if (PERIODES_TRAVAIL.some((p) => p.jours === jours)) joursTravail = jours;
	renderEspace();
	// Le re-rendu recrée le DOM → on garde le focus clavier sur le bouton actif. Sélecteur
	// SCOPÉ par `data-act` : quatre segments `.enc-act-mode.on` coexistent dans l'onglet Suivi
	// (activité, travail récent, erreurs, révision).
	(container()?.querySelector('[data-act="travail-periode"].on') as HTMLElement | null)?.focus({
		preventScroll: true,
	});
	return true;
}
