/* ============================================================
   Mode Orthographe — escalier des étapes d'un mot, DATÉ (#545).
   ------------------------------------------------------------
   Le parcours d'un mot est un escalier strictement ordonné et exclusif : atelier de
   découverte, puis les modes dans l'ordre de `ORDRE_MODES` (tuiles → affiche/masque →
   dictée). Un mot est donc à exactement UN rang, et il n'en redescend jamais
   (`validerMode` ne pose que `true`).

   Ce que ce module ajoute : la DATE de chaque franchissement. Sans elle, l'espace
   encadrant ne peut dire d'une liste que « commencée » ou « acquise » — entre les deux,
   des semaines de travail réel ne changent rien à l'écran, parce que le seul compte
   affiché (`avancementLecon`) ne retient que les mots dont TOUS les modes sont validés.

   MONOTONE, comme les journaux de paliers : on ne date que le PREMIER franchissement.
   Un mot rejoué en août ne réécrit pas sa date de juin.

   Pur (hors mutation de l'argument), donc testable sans DOM ni localStorage. La borne de
   mise en service du datage, elle, vit dans `paliers.ts` avec les autres bornes.
   ============================================================ */
import { ORDRE_MODES, modesRequis } from './runner';
import type { MotOrtho, EtapeOrtho } from './types';

/** Les étapes dans l'ordre de franchissement — l'atelier ouvre le parcours (`prochaineActivite`). */
export const ORDRE_ETAPES: readonly EtapeOrtho[] = ['atelier', ...ORDRE_MODES];

/** Rang d'un mot sur l'escalier : `neuf` (rien de franchi) puis la dernière étape franchie. */
export type RangMot = 'neuf' | EtapeOrtho;

/** Répartition d'un ensemble de mots entre les rangs de l'escalier, à un instant donné. */
export interface Composition {
	/** Rangs RÉELLEMENT possibles, du bas vers le haut (dépend de `dicteeDispo`). */
	paliers: RangMot[];
	/** Nombre de mots à chaque rang, indexé comme `paliers` ; la somme vaut `total`. */
	compte: number[];
	total: number;
}

/* ---------- Escalier ---------- */

/** Les rangs possibles, du bas vers le haut. Sans voix de synthèse, `dictee` n'est pas
    requise (`modesRequis`) : l'escalier s'arrête à l'affiche/masque, qui vaut alors sommet. */
export function paliersComposition(dicteeDispo: boolean): RangMot[] {
	return ['neuf', 'atelier', ...modesRequis(dicteeDispo)];
}

/* ---------- Datage ---------- */

/** Date du franchissement d'une étape, ou `null` si elle n'est pas franchie OU pas datée
    (mot d'avant #545). Les deux cas sont distingués par les booléens du mot, pas ici. */
export function dateFranchissement(mot: MotOrtho, etape: EtapeOrtho): number | null {
	const t = mot.franchissements?.[etape];
	return typeof t === 'number' && Number.isFinite(t) ? t : null;
}

/* L'ÉCRITURE de ces dates n'est pas ici mais dans `runner.ts`, à l'intérieur même de
   `marquerAtelierFait` et `validerMode` : c'est la seule façon qu'aucun appelant ne puisse
   faire progresser un mot sans le dater (critère 3 de #545). Ce module ne fait que LIRE,
   ce qui le garde aussi sans dépendance circulaire avec le runner. */

/* ---------- Rang et composition ---------- */

/** Rang d'un mot, à `at` si fourni, sinon aujourd'hui.
 *
 *  `undefined` = mot ATTENDU d'une liste mais jamais matérialisé en banque (cf.
 *  `statutsLecon`) : il est `neuf`, comme un mot dont rien n'est commencé.
 *
 *  À une date PASSÉE, une étape compte comme franchie si son booléen est vrai ET que sa
 *  date est absente ou antérieure. L'absence de date vaut « franchie avant la mise en
 *  service du datage » — donc avant toute semaine que la frise accepte de dessiner (les
 *  semaines antérieures à la borne y sont `null`, cf. `friseComposition`).
 *
 *  `at` est une borne EXCLUE : une étape datée exactement à `at` n'est pas encore franchie.
 *  Aligné sur `cellulesFrise` (`cap < finSemaine`), et il faut que les deux le soient : la
 *  frise de composition et les frises d'états découpent le même axe du temps, aux mêmes
 *  frontières de semaine, et un cap franchi le dimanche soir ne peut pas tomber dans une
 *  semaine ici et dans l'autre à côté.
 *
 *  Lecture DU PARCOURS et non « la plus haute étape franchie » : on s'arrête à la première
 *  marche manquante, comme `prochainModeAValider`. Sur données saines les deux lectures
 *  coïncident (l'escalier est ordonné) ; elles divergent sur un état incohérent — mode validé
 *  sans son précédent, ce qu'un import bancal peut produire. La lecture haute mettrait alors
 *  le mot au sommet quand `statutMot` le dit encore « en cours », soit deux affirmations
 *  contradictoires sur la même ligne. Celle-ci s'aligne sur le parcours réellement praticable
 *  par l'enfant, qui est ce que la frise prétend décrire. */
export function rangMot(mot: MotOrtho | undefined, dicteeDispo: boolean, at?: number): RangMot {
	if (!mot) return 'neuf';
	const franchie = (etape: EtapeOrtho, fait: boolean): boolean => {
		if (!fait) return false;
		if (at === undefined) return true;
		const t = dateFranchissement(mot, etape);
		return t === null || t < at;
	};
	if (!franchie('atelier', mot.atelierFait)) return 'neuf';
	let rang: RangMot = 'atelier';
	for (const mode of modesRequis(dicteeDispo)) {
		if (!franchie(mode, mot.validation[mode])) break;
		rang = mode;
	}
	return rang;
}

/** Répartition de `mots` entre les rangs, à `at` si fourni, sinon aujourd'hui. */
export function composition(
	mots: readonly (MotOrtho | undefined)[],
	dicteeDispo: boolean,
	at?: number,
): Composition {
	const paliers = paliersComposition(dicteeDispo);
	const compte = paliers.map(() => 0);
	// La somme des comptes vaut TOUJOURS `total` : `rangMot` ne renvoie que `neuf`, `atelier`
	// ou un mode de `modesRequis(dicteeDispo)`, tous présents dans `paliers` par construction.
	// C'est ce qui autorise l'UI à dessiner une barre pleine sans se demander où passe le reste.
	for (const mot of mots) compte[paliers.indexOf(rangMot(mot, dicteeDispo, at))]++;
	return { paliers, compte, total: mots.length };
}
