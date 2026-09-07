/* ============================================================
   Mode Orthographe — cœur logique du runner (sans DOM).
   Statut d'un mot, choix de l'activité suivante, validation des
   modes, étoile d'une liste. Logique pure et testable.
   (La répétition espacée relève d'un mode dédié — issue séparée ;
   le rendu/écrans et la dictée TTS relèvent de la couche UI.)
   Voir docs/design-orthographe.md (§ Runner).
   ============================================================ */
import { etatNeuf, estHorsRotation } from '../revision';
import type { MotOrtho, ModeOrtho, EtapeOrtho } from './types';

/** Ordre de déblocage des modes : tuiles → affiche/masque → dictée. */
export const ORDRE_MODES: readonly ModeOrtho[] = ['tuiles', 'motCache', 'dictee'];

export type Activite = 'atelier' | ModeOrtho;
export type StatutMot = 'nouveau' | 'enCours' | 'maitrise';

/** Modes requis pour l'étoile : tuiles + motCache, et dictée seulement si le TTS est dispo. */
export function modesRequis(dicteeDispo: boolean): ModeOrtho[] {
	return ORDRE_MODES.filter((m) => m !== 'dictee' || dicteeDispo);
}

/** Le mode visé ET tous ceux qui le précèdent sur l'escalier, restreints aux modes
    requis (#641). C'est l'ensemble qu'une réussite dans `mode` fait franchir : réussir
    la dictée d'un mot au rang « tuiles », c'est réussir tout ce qui est plus étayé. */
export function modesJusqua(mode: ModeOrtho, dicteeDispo: boolean): ModeOrtho[] {
	const rang = ORDRE_MODES.indexOf(mode);
	return modesRequis(dicteeDispo).filter((m) => ORDRE_MODES.indexOf(m) <= rang);
}

export function statutMot(mot: MotOrtho, dicteeDispo: boolean): StatutMot {
	if (!mot.atelierFait) return 'nouveau';
	return modesRequis(dicteeDispo).every((m) => mot.validation[m]) ? 'maitrise' : 'enCours';
}

/* Phase de découverte : au moins un mot de la liste n'a pas encore eu son
   atelier. Tant qu'elle dure, le parcours ne propose QUE des ateliers, afin de
   découvrir TOUTE la liste avant de commencer à s'entraîner — l'enfant doit
   pouvoir voir tous ses mots vite (première dictée dès le lendemain). Voir #69. */
export function decouverteEnCours(mots: MotOrtho[]): boolean {
	return mots.some((m) => !m.atelierFait);
}

/** Prochain mode à valider, dans l'ordre (null si tous les modes requis le sont). */
export function prochainModeAValider(mot: MotOrtho, dicteeDispo: boolean): ModeOrtho | null {
	return modesRequis(dicteeDispo).find((m) => !mot.validation[m]) ?? null;
}

/** La marche la plus haute JOUABLE sur cet appareil : la dictée si le TTS est là, le mot
    caché sinon. C'est ce qu'on sert à un mot dont tout est déjà validé (#658).

    Le tirage au hasard qu'elle remplace était un défaut, pas une variété : `ORDRE_MODES`
    acte que les trois tâches forment un GRADIENT de difficulté. Resservir les tuiles à un
    mot déjà écrit sous la dictée, c'est de la reconstitution et non du rappel — ça ne teste
    rien que l'enfant n'ait prouvé, et à 8-9 ans une tâche plus facile que prévu renforce une
    illusion de compétence. Sur un rappel espacé, l'enfant n'a par ailleurs aucun souvenir de
    la fois d'avant : il ne percevrait pas la variété, seulement le coût de re-décoder une
    consigne imprévisible. */
export function marcheLaPlusHaute(dicteeDispo: boolean): ModeOrtho {
	const requis = modesRequis(dicteeDispo);
	return requis[requis.length - 1];
}

/** Prochaine activité d'un mot : atelier (découverte) → modes dans l'ordre →
    une fois tout validé, la marche la plus haute jouable (entretien), jamais l'atelier. */
export function prochaineActivite(mot: MotOrtho, dicteeDispo: boolean): Activite {
	if (!mot.atelierFait) return 'atelier';
	return prochainModeAValider(mot, dicteeDispo) ?? marcheLaPlusHaute(dicteeDispo);
}

/* Date le franchissement d'une étape s'il ne l'était pas déjà (#545). MONOTONE : un mot
   rejoué ne réécrit pas sa date. Interne, et appelé DANS les deux fonctions qui font
   progresser un mot plutôt que par leurs appelants — c'est ce qui rend impossible une étape
   franchie sans date, là où un rappel en commentaire ne fait qu'espérer (cf. le rappel de
   `journaliserPaliersOrtho` ci-dessous, qui n'a pas pu être structurel, lui). */
function dater(mot: MotOrtho, etape: EtapeOrtho, now: number): void {
	const journal = (mot.franchissements ??= {});
	if (journal[etape] == null) journal[etape] = now;
}

/** Découverte d'un mot : marche du bas de l'escalier, et ENTRÉE EN ROTATION de révision
 *  espacée (#641). Le compteur d'espacement démarre ici, à la première rencontre réelle,
 *  et non à l'ajout du mot par le parent : sans quoi une liste saisie le lundi et ouverte
 *  trois semaines plus tard arrivait avec trois semaines de retard d'un coup.
 *
 *  MONOTONE comme le datage : un mot déjà en rotation (ou déjà acquis) n'est jamais
 *  réécrit — rejouer l'atelier d'un mot ne remet pas son espacement à zéro. */
export function marquerAtelierFait(mot: MotOrtho, now = Date.now()): void {
	mot.atelierFait = true;
	dater(mot, 'atelier', now);
	if (estHorsRotation(mot.revision)) mot.revision = etatNeuf(now);
}

/** Valide un mode après une réussite (v1 : une réussite suffit), ET tous les modes plus
 *  étayés qui le précèdent sur l'escalier (#641 — voir le corps).
 *
 *  À SAVOIR si vous ajoutez un chemin qui appelle ceci : c'est ici qu'un mot progresse, donc
 *  qu'une LISTE peut franchir un cap. La fin de séance doit alors appeler `journaliserPaliersOrtho`
 *  (`orthographe/paliers.ts`), sinon la frise d'évolution de l'espace encadrant rate le
 *  franchissement — sans que rien ne le signale, et pour des semaines. Deux chemins le font
 *  aujourd'hui : la dictée (`ui/ortho-runner.ts`) et la révision espacée (`ui/revision.ts`).
 *  Ce rappel est ici, et pas seulement dans `paliers.ts`, parce qu'un futur auteur regarde
 *  l'endroit où l'état change, pas le module qui l'observe. Le pendant côté leçons, lui, est
 *  STRUCTUREL (`recordLessonStats` journalise de lui-même, cf. PR #540) ; ça ne l'est pas ici,
 *  faute de pouvoir décider sans `dicteeDispo`, que seule l'UI connaît. */
export function validerMode(mot: MotOrtho, mode: ModeOrtho, now = Date.now()): void {
	// CUMULATIVE (#641) : réussir un mode valide aussi tous ceux du dessous. Les tuiles
	// fournissent toutes les lettres, le mot caché laisse regarder avant d'écrire : qui
	// écrit un mot sous la dictée a fait, de fait, ce que les modes plus étayés demandent.
	// Le cumul est ICI, et pas chez l'appelant, pour la même raison que le datage l'a été
	// (#545) : aucun chemin ne doit pouvoir faire monter un mot en sautant une marche, ce
	// qui laisserait un escalier incohérent (dictée validée, tuiles non) à `rangMot`.
	// `dicteeDispo` vaut `true` : le mode DEMANDÉ vient forcément d'être joué, donc il
	// était disponible, et le filtre ne concerne que les modes au-dessus de lui.
	for (const m of modesJusqua(mode, true)) {
		// Ne dater QUE ce que cette réussite fait effectivement franchir. `dater` est monotone,
		// mais une banque d'avant #545 porte des marches validées SANS date : les re-daterait
		// alors d'aujourd'hui, et la frise de composition affirmerait une séance de travail qui
		// n'a pas eu lieu — le défaut même que la réparation d'escalier refuse de commettre.
		// Sans cette garde, la protection fuit d'une séance.
		const aFranchir = !mot.validation[m];
		mot.validation[m] = true;
		if (aFranchir) dater(mot, m, now);
	}
}

/* Répare un escalier TROUÉ hérité : toute marche sous la plus haute marche validée est
   validée à son tour. Une banque écrite avant que `validerMode` ne devienne cumulative
   (#641) peut porter `{ tuiles: false, motCache: true }` — un mot qui a prouvé le mot caché
   a de fait prouvé les tuiles, donc rien n'est franchi sans réussite (#640, critère 16) :
   c'est la règle du cumul appliquée rétroactivement à une donnée écrite avant elle.

   La marche comblée reprend la date de la marche du DESSUS, jamais celle du jour, et aucune
   date n'est inventée quand la source n'en a pas : la frise de l'espace encadrant ne doit
   pas se mettre à décrire du travail récent parce que le code a changé. Cf. le commentaire
   daté du 2026-09-07 sur #640, qui rend le critère 18 tenable au sens littéral.

   Idempotente et jamais destructrice : elle ne dé-valide rien et laisse intact un escalier
   déjà cohérent. Renvoie `true` si elle a comblé quelque chose. */
export function reparerEscalier(mot: MotOrtho): boolean {
	let comble = false;
	// De haut en bas : on retient la date de la marche validée la plus BASSE déjà rencontrée,
	// qui est la plus proche au-dessus de celle qu'on comble.
	let dateAuDessus: number | undefined;
	for (let i = ORDRE_MODES.length - 1; i >= 0; i--) {
		const m = ORDRE_MODES[i];
		if (mot.validation[m]) {
			dateAuDessus = mot.franchissements?.[m] ?? dateAuDessus;
			continue;
		}
		if (dateAuDessus === undefined && !aUneMarcheValidee(mot, i)) continue; // rien au-dessus
		mot.validation[m] = true;
		comble = true;
		if (dateAuDessus !== undefined) dater(mot, m, dateAuDessus);
	}
	return comble;
}

/* Une marche STRICTEMENT au-dessus du rang `rang` est-elle validée ? Sert à décider s'il y a
   un trou à combler quand aucune date n'est connue au-dessus. */
function aUneMarcheValidee(mot: MotOrtho, rang: number): boolean {
	return ORDRE_MODES.slice(rang + 1).some((m) => mot.validation[m]);
}

/** Cette activité peut-elle encore faire MONTER ce mot (#641) ? L'atelier ouvre le
 *  parcours, il fait toujours progresser ; un mode fait progresser tant qu'il reste une
 *  marche non validée sous lui ou à son niveau (effet du cumul de `validerMode`).
 *
 *  Sert à décider si une SÉANCE a compté pour le programme du jour : la question est
 *  « ce travail POUVAIT-il faire progresser un mot », pas « l'enfant a-t-il réussi » —
 *  rater huit fois reste du travail, refaire huit fois des tuiles déjà acquises non. */
export function activiteProgressive(
	mot: MotOrtho,
	activite: Activite,
	dicteeDispo: boolean,
): boolean {
	if (activite === 'atelier') return true;
	return modesJusqua(activite, dicteeDispo).some((m) => !mot.validation[m]);
}

/** Une liste est étoilée quand tous ses mots sont « maîtrisés ». */
export function listeEtoilee(mots: MotOrtho[], dicteeDispo: boolean): boolean {
	return mots.length > 0 && mots.every((m) => statutMot(m, dicteeDispo) === 'maitrise');
}
