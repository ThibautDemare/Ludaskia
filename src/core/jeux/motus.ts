/* ============================================================
   Étagère de jeux (#661) — le MOTUS : correcteur et vivier.

   Jeu-compétence : l'orthographe lexicale EST la mécanique. Mais il ne corrige
   rien au sens du #391 — aucune réponse n'est fausse, seulement plus ou moins
   informative. D'où l'absence totale de `capterErreur` ici (critère 24), et le
   fait que toute suite de lettres soit acceptée (critère 29) : « ZZZZZ » n'est
   pas refusé, il est simplement tout gris.

   Trois règles que le correcteur doit tenir ensemble, et qui se contredisent si
   on les code à la va-vite :
   - une lettre ne peut être créditée plus de fois qu'elle n'apparaît dans le
     mot caché (critère 47) — d'où les DEUX passes, jamais une seule ;
   - l'accent fait partie de la lettre (critère 33) : `e` ne vaut pas `ê` ;
   - la casse, elle, ne vaut PAS une faute (tranché le 2026-09-06) : la grille
     s'écrit en capitales, les mots sont stockés en minuscules.
   ============================================================ */
import type { SchoolLevel } from '../catalog';
import { LEVEL_ORDER } from '../levels';
import { ORTHO_PREDEF } from '../../data/francais/orthographe';

export type EtatLettre = 'placee' | 'ailleurs' | 'absente';

/* Ordre de « qualité » d'un état, pour le résumé cumulé du critère 46. */
const RANG: Record<EtatLettre, number> = { absente: 0, ailleurs: 1, placee: 2 };

/* Normalisation commune aux deux côtés de la comparaison : NFC pour que `ê`
   composé et `ê` décomposé soient la même lettre, minuscules pour que la casse
   ne compte pas. Surtout PAS de suppression des diacritiques : ce serait
   exactement l'inverse du critère 33. */
function lettresDe(mot: string): string[] {
	return [...mot.normalize('NFC').toLowerCase()];
}

/** Le retour à trois états d'une proposition face au mot caché.

    Rend un état par lettre de la PROPOSITION, quelle que soit sa longueur : le
    jeu ne refuse jamais une saisie, donc il n'y a pas d'exception ici non plus.
    Les positions au-delà du mot caché sont « absente » — la grille n'a pas de
    case pour elles, même si la lettre existe dans le mot. Pur. */
export function evaluerEssai(propose: string, cible: string): EtatLettre[] {
	const p = lettresDe(propose);
	const c = lettresDe(cible);
	const etats: EtatLettre[] = p.map(() => 'absente');

	/* Passe 1 — les coïncidences de position, et SEULEMENT elles. Ce qui n'est
	   pas consommé ici forme le stock que la passe 2 a le droit de réclamer. */
	const restant = new Map<string, number>();
	for (let i = 0; i < c.length; i++) {
		if (i < p.length && p[i] === c[i]) etats[i] = 'placee';
		else restant.set(c[i], (restant.get(c[i]) ?? 0) + 1);
	}

	/* Passe 2 — « présente ailleurs », dans la limite du stock. C'est cette
	   limite qui empêche « momme » de faire créditer trois `m` alors que
	   « pomme » n'en porte que deux. */
	for (let i = 0; i < Math.min(p.length, c.length); i++) {
		if (etats[i] === 'placee') continue;
		const dispo = restant.get(p[i]) ?? 0;
		if (dispo > 0) {
			etats[i] = 'ailleurs';
			restant.set(p[i], dispo - 1);
		}
	}
	return etats;
}

/** Le meilleur statut connu de chaque lettre proposée, cumulé sur la partie.

    C'est la table du clavier-résumé (critère 46). Elle n'apporte AUCUNE
    information nouvelle : c'est exactement ce que l'enfant reconstituerait en
    relisant sa grille. Elle lui évite juste de la tenir en tête pendant qu'il
    joue.

    Ne régresse jamais : une lettre trouvée « bien placée » reste « bien placée »
    même si un essai ultérieur la met au mauvais endroit. Pur. */
export function statutsCumules(
	essais: { mot: string; etats: EtatLettre[] }[],
): Map<string, EtatLettre> {
	const table = new Map<string, EtatLettre>();
	for (const essai of essais) {
		lettresDe(essai.mot).forEach((lettre, i) => {
			const etat = essai.etats[i];
			if (!etat) return;
			const actuel = table.get(lettre);
			if (actuel === undefined || RANG[etat] > RANG[actuel]) table.set(lettre, etat);
		});
	}
	return table;
}

/** Le nombre d'essais accordé pour un mot de `longueur` lettres.

    CONSTANT au lot 1 : le hors périmètre de #661 annonce un « nombre d'essais
    unique ≥ 5 » sur des mots de 5 ou 6 lettres. Faire varier le budget avec la
    longueur, et tenir un ratio essais/lettres non décroissant, appartient à
    #663 (son critère 8), qui est le lot où la longueur varie vraiment.

    Six, et pas cinq : sous 5 essais le jeu devient une loterie (raison écrite
    dans le critère 36), et 5 pile ne laisse aucune marge à l'enfant qui perd son
    premier essai à sonder les voyelles. */
export function budgetEssais(longueur: number): number {
	void longueur;
	return 6;
}

/* ---------- Le vivier des mots cachés ---------- */

/* Seule source autorisée par le critère 30 : les séries thématiques. Pas de
   dictionnaire d'acceptation à côté — on accepte tout par CHOIX (critère 31). */
const PREFIXE_THEME = 'fr-ortho-theme-';

/* Familles écartées par le critère 32. Le filtre porte sur le MOT, pas sur la
   série (tranché le 2026-09-06) : six invariables — `autre`, `chaque`, `après`,
   `contre`, `malgré`, `dehors` — figurent AUSSI dans une série thématique, et
   passeraient un filtre appliqué à la série seule.

   `irreguliers` couvre les finales muettes, les lettres internes muettes et les
   exceptions de graphie : dans tous ces cas, le retour lettre-à-lettre n'est
   pas informatif mais déstabilisant, parce qu'aucune proposition phonétiquement
   plausible ne mène à la bonne lettre. */
const SERIES_EXCLUES = /^fr-ortho-(invariables|irreguliers|cm1-)/;

function motsExclus(): Set<string> {
	const exclus = new Set<string>();
	for (const serie of ORTHO_PREDEF) {
		const serieExclue = SERIES_EXCLUES.test(serie.id);
		for (const m of serie.mots) {
			// Un homophone reste un homophone où qu'il soit rangé : sa graphie ne se
			// déduit pas sans contexte, et le jeu n'en donne aucun.
			if (serieExclue || m.homophone) exclus.add(m.mot.toLowerCase().normalize('NFC'));
		}
	}
	return exclus;
}

/* Une seule case par lettre : ni espace, ni trait d'union, ni apostrophe. C'est
   une contrainte de FORME, indépendante de la règle « pas de mot-outil sans
   référent » qui écarte déjà la plupart de ces mots pour une autre raison. */
const FORME_JOUABLE = /^[a-zà-öø-ÿœæ]+$/;

function construireVivier(niveau: SchoolLevel): string[] {
	const exclus = motsExclus();
	const rang = LEVEL_ORDER.indexOf(niveau);
	const vus = new Set<string>();
	const vivier: string[] = [];
	for (const serie of ORTHO_PREDEF) {
		if (!serie.id.startsWith(PREFIXE_THEME)) continue;
		// Visibilité CUMULATIVE, comme les leçons d'orthographe : un CM1 joue aussi
		// les mots du CE2. L'orthographe lexicale ne se désapprend pas.
		if (LEVEL_ORDER.indexOf(serie.niveau) > rang) continue;
		for (const m of serie.mots) {
			const mot = m.mot.toLowerCase().normalize('NFC');
			if (vus.has(mot) || exclus.has(mot)) continue;
			if (!FORME_JOUABLE.test(mot)) continue;
			const n = [...mot].length;
			if (n < 5 || n > 6) continue;
			vus.add(mot);
			vivier.push(mot);
		}
	}
	return vivier;
}

/* Le vivier ne dépend que des données statiques : on le calcule une fois par
   niveau plutôt qu'à chaque tirage. */
const CACHE = new Map<SchoolLevel, string[]>();

/** Les mots cachés jouables à cette classe (critères 30 et 32). */
export function vivierMots(niveau: SchoolLevel): string[] {
	let v = CACHE.get(niveau);
	if (!v) {
		v = construireVivier(niveau);
		CACHE.set(niveau, v);
	}
	return [...v];
}

/** Tire un mot caché en évitant `exclus` (critère 36 : pas de rejeu immédiat).

    Si tout est exclu — partie très longue, petit vivier — on repart du vivier
    entier plutôt que de rendre `undefined` : mieux vaut revoir un mot que
    refuser de lancer la partie. Aléa injecté, donc déterministe à générateur
    fixé. */
export function tirerMot(niveau: SchoolLevel, exclus: string[], r: () => number): string {
	const tous = vivierMots(niveau);
	const ecartes = new Set(exclus.map((m) => m.toLowerCase().normalize('NFC')));
	const dispo = tous.filter((m) => !ecartes.has(m));
	const source = dispo.length ? dispo : tous;
	return source[Math.min(source.length - 1, Math.floor(r() * source.length))];
}
