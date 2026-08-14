/* ============================================================
   Étayage d'une opération posée (#490) : résolution GÉNÉRÉE + NARRATION.
   ------------------------------------------------------------
   Auteur des tests distinct de l'auteur du code : les attendus ci-dessous sont des
   CALCULS POSÉS FAITS À LA MAIN (colonne par colonne, retenue par retenue), pas une
   relecture de `core/etayage-posee.ts`. Chaque cas est écrit avec sa décomposition en
   commentaire pour qu'un désaccord se tranche sans ouvrir le code.

   Ce qui est éprouvé, et pourquoi :
   - le DÉCOUPAGE en lignes et en colonnes (unités d'abord), y compris les trois lignes
     d'une multiplication par un nombre à deux chiffres ;
   - les cas durs du CE2 : retenues en cascade, retenue qui ajoute un chiffre à gauche,
     emprunts successifs, emprunt à travers un ZÉRO, résultat plus court que l'opérande
     du haut ;
   - le piège du 2ᵉ produit partiel DÉCALÉ : le rang de calcul n'est pas la colonne à
     l'écran, et c'est celle de l'écran que la narration doit nommer (sinon on apprend à
     l'enfant à écrire le chiffre dans la mauvaise case) ;
   - la NARRATION, jugée sur ses INGRÉDIENTS pédagogiques actés (colonne nommée, fait
     numérique énoncé comme un calcul, retenue justifiée par la valeur de position,
     emprunt pris à la colonne D'À CÔTÉ) et sur des invariants indépendants de la
     rédaction : toute égalité énoncée doit être VRAIE, et deux situations distinctes
     (emprunt ordinaire / emprunt à travers un zéro, retenue avec case / sans case)
     doivent recevoir deux phrases de STRUCTURE différente — pas la même phrase avec
     d'autres nombres. Une colonne qui n'a PAS de case dans la grille (zéro de tête
     d'une soustraction) est exemptée du calcul énoncé, mais elle doit rester nommée et
     ne rien promettre qu'on n'écrit pas : la narration ne doit jamais désigner une case
     qui ne s'allume pas ;
   - par ÉCHANTILLON large et déterministe (les vrais générateurs, via `withSeed`) : les
     chiffres écrits recomposent la valeur de leur ligne, aucune retenue ne reste en
     suspens, et la grille de démonstration a une case pour chaque chiffre annoncé.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	chapeauLigne,
	nomColonne,
	phrasePosee,
	resolutionPosee,
	resultatPosee,
	retenueDansLaGrille,
	type EtapePosee,
	type LignePosee,
	type ResolutionPosee,
} from '../src/core/etayage-posee';
import { dispositionPosee, type PosedSpec } from '../src/core/items';
import { genLessonItem, getLessonById } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Outils de lecture (aucune règle métier ici) ---------- */

const POSEES = ['calc-addition-posee', 'calc-soustraction-posee', 'calc-multiplication-posee'];

/** L'étape d'un rang de CALCUL donné, dans la ligne demandée. */
function etape(res: ResolutionPosee, ligne: number, colonne: number): EtapePosee {
	const e = res.lignes[ligne]?.etapes.find((x) => x.colonne === colonne);
	if (!e) throw new Error(`étape absente : ligne ${ligne}, colonne ${colonne}`);
	return e;
}

/** Ce qui est écrit sur une ligne, relu des unités vers la gauche : Σ chiffre × 10^rang.
    Formulation volontairement insensible aux zéros de tête (105 − 100 → « 005 » = 5). */
function valeurEcrite(ligne: LignePosee): number {
	return ligne.etapes.reduce((n, e) => n + e.ecrit * 10 ** e.colonne, 0);
}

/** Squelette d'une phrase : les nombres remplacés par « # ». Deux situations
    pédagogiquement différentes doivent donner deux squelettes différents — sinon c'est
    la même phrase avec d'autres nombres, et l'enfant n'apprend pas à distinguer les
    deux cas. */
const squelette = (phrase: string): string => phrase.replace(/\d+/g, '#');

/** Les égalités « … = … » énoncées dans une phrase qui sont FAUSSES. Invariant
    indépendant de la rédaction : quelle que soit la façon de le dire, un fait numérique
    faux est un contresens. (« (la retenue) » est une glose, pas un terme.) */
function egalitesFausses(phrase: string): string[] {
	const nettoye = phrase.replace(/\(la retenue\)/g, '');
	const faux: string[] = [];
	for (const m of nettoye.matchAll(/(\d+(?:\s*[+−×-]\s*\d+)+)\s*=\s*(\d+)/g)) {
		const termes = m[1].split(/\s*([+−×-])\s*/);
		let valeur = Number(termes[0]);
		for (let i = 1; i < termes.length; i += 2) {
			const n = Number(termes[i + 1]);
			valeur = termes[i] === '+' ? valeur + n : termes[i] === '×' ? valeur * n : valeur - n;
		}
		if (valeur !== Number(m[2])) faux.push(m[0]);
	}
	return faux;
}

/** Échantillon DÉTERMINISTE de specs, tiré par les vrais générateurs de leçon (donc
    exactement les plages réelles de `data/maths/posee.ts`, calibrage compris). */
function echantillon(parLecon: number): PosedSpec[] {
	const specs: PosedSpec[] = [];
	for (const id of POSEES) {
		const lesson = getLessonById(id);
		if (!lesson) throw new Error(`leçon absente du catalogue : ${id}`);
		for (let seed = 1; seed <= parLecon; seed++) {
			const item = withSeed(seed, () => genLessonItem(lesson));
			if (!item.posed) throw new Error(`item non posé pour ${id} (graine ${seed})`);
			specs.push(item.posed);
		}
	}
	return specs;
}

const nb = (spec: PosedSpec) => `${spec.a} ${spec.op} ${spec.b}`;

/* ============================================================
   1. DÉCOUPAGE — addition
   ============================================================ */
describe('resolutionPosee — addition', () => {
	it('sans retenue : une ligne, une étape par colonne, unités en premier', () => {
		// 231 + 546 : 1+6=7 | 3+4=7 | 2+5=7 → 777, aucune retenue.
		const res = resolutionPosee({ op: '+', a: 231, b: 546 });
		expect(res.resultat).toBe(777);
		expect(res.operation).toBe('231 + 546');
		expect(res.lignes.length).toBe(1);
		expect(res.lignes[0].role).toBe('total');
		expect(res.lignes[0].valeur).toBe(777);
		expect(res.lignes[0].etapes.map((e) => e.colonne)).toEqual([0, 1, 2]);
		expect(res.lignes[0].etapes.map((e) => e.chiffres)).toEqual([
			[1, 6],
			[3, 4],
			[2, 5],
		]);
		expect(res.lignes[0].etapes.map((e) => e.ecrit)).toEqual([7, 7, 7]);
		expect(res.lignes[0].etapes.map((e) => e.retenueSortante)).toEqual([0, 0, 0]);
	});

	it('retenues en cascade : la retenue sortante est la retenue entrante de la suivante', () => {
		// 347 + 285 : 7+5=12 → 2 retiens 1 | 4+8+1=13 → 3 retiens 1 | 3+2+1=6 → 632.
		const res = resolutionPosee({ op: '+', a: 347, b: 285 });
		expect(res.resultat).toBe(632);
		const [l] = res.lignes;
		expect(l.etapes.map((e) => e.ecrit)).toEqual([2, 3, 6]);
		expect(l.etapes.map((e) => e.retenueEntrante)).toEqual([0, 1, 1]);
		expect(l.etapes.map((e) => e.retenueSortante)).toEqual([1, 1, 0]);
		expect(valeurEcrite(l)).toBe(632);
	});

	it('la dernière retenue ajoute un chiffre à gauche : une étape SANS chiffres à lire', () => {
		// 999 + 999 : 18 → 8 r1 | 19 → 9 r1 | 19 → 9 r1 | reste la retenue → 1 → 1998.
		const res = resolutionPosee({ op: '+', a: 999, b: 999 });
		expect(res.resultat).toBe(1998);
		const [l] = res.lignes;
		expect(l.etapes.length).toBe(4); // 3 colonnes de chiffres + la retenue finale
		expect(l.etapes.map((e) => e.ecrit)).toEqual([8, 9, 9, 1]);
		const derniere = l.etapes[3];
		expect(derniere.colonne).toBe(3);
		expect(derniere.chiffres).toEqual([]); // rien à lire : il ne reste que la retenue
		expect(derniere.retenueEntrante).toBe(1);
		expect(derniere.retenueSortante).toBe(0);
		expect(valeurEcrite(l)).toBe(1998);
	});

	it('termes de longueurs différentes : la colonne manquante vaut 0', () => {
		// 45 + 907 : 5+7=12 → 2 r1 | 4+0+1=5 | (rien)+9=9 → 952.
		const res = resolutionPosee({ op: '+', a: 45, b: 907 });
		expect(res.resultat).toBe(952);
		const [l] = res.lignes;
		expect(l.etapes.map((e) => e.chiffres)).toEqual([
			[5, 7],
			[4, 0],
			[0, 9],
		]);
		expect(l.etapes.map((e) => e.ecrit)).toEqual([2, 5, 9]);
	});
});

/* ============================================================
   2. DÉCOUPAGE — soustraction
   ============================================================ */
describe('resolutionPosee — soustraction', () => {
	it('sans emprunt : aucune étape marquée `emprunt`', () => {
		// 758 − 236 : 8−6=2 | 5−3=2 | 7−2=5 → 522.
		const res = resolutionPosee({ op: '-', a: 758, b: 236 });
		expect(res.resultat).toBe(522);
		expect(res.operation).toBe('758 − 236'); // signe typographique de la grille
		const [l] = res.lignes;
		expect(l.etapes.map((e) => e.ecrit)).toEqual([2, 2, 5]);
		expect(l.etapes.some((e) => e.emprunt)).toBe(false);
		expect(l.etapes.map((e) => e.retenueSortante)).toEqual([0, 0, 0]);
	});

	it('emprunts successifs : une retenue de 1 à retirer à la colonne suivante', () => {
		// 452 − 178 : 2<8 → 12−8=4 retenue 1 | 5<7+1 → 15−8=7 retenue 1 | 4−1−1=2 → 274.
		const res = resolutionPosee({ op: '-', a: 452, b: 178 });
		expect(res.resultat).toBe(274);
		const [l] = res.lignes;
		expect(l.etapes.map((e) => e.ecrit)).toEqual([4, 7, 2]);
		expect(l.etapes.map((e) => e.emprunt)).toEqual([true, true, false]);
		expect(l.etapes.map((e) => e.retenueEntrante)).toEqual([0, 1, 1]);
		expect(l.etapes.map((e) => e.retenueSortante)).toEqual([1, 1, 0]);
		expect(valeurEcrite(l)).toBe(274);
	});

	it('emprunt en cascade à travers un ZÉRO : la colonne vide doit prêter à son tour', () => {
		// 503 − 287 : 3<7 → 13−7=6 retenue 1 | 0 < 8+1 → 10−9=1 retenue 1 | 5−2−1=2 → 216.
		const res = resolutionPosee({ op: '-', a: 503, b: 287 });
		expect(res.resultat).toBe(216);
		const [l] = res.lignes;
		expect(l.etapes.map((e) => e.ecrit)).toEqual([6, 1, 2]);
		expect(l.etapes.map((e) => e.emprunt)).toEqual([true, true, false]);
		const dizaines = etape(res, 0, 1);
		expect(dizaines.chiffres).toEqual([0, 8]); // le haut est vide : c'est LE point dur
		expect(dizaines.retenueEntrante).toBe(1);
		expect(dizaines.retenueSortante).toBe(1);
		expect(valeurEcrite(l)).toBe(216);
	});

	it('résultat plus court que le haut : les colonnes de zéros de tête existent quand même', () => {
		// 105 − 100 : 5−0=5 | 0−0=0 | 1−1=0 → 5. Trois colonnes traitées, un seul chiffre
		// utile — le calcul des retenues dépend des deux autres, c'est le RENDU qui n'a pas
		// de case pour elles.
		const res = resolutionPosee({ op: '-', a: 105, b: 100 });
		expect(res.resultat).toBe(5);
		const [l] = res.lignes;
		expect(l.valeur).toBe(5);
		expect(l.etapes.length).toBe(3);
		expect(l.etapes.map((e) => e.ecrit)).toEqual([5, 0, 0]);
		expect(l.etapes.some((e) => e.emprunt)).toBe(false);
		expect(valeurEcrite(l)).toBe(5); // « 005 » relu des unités vaut bien 5
	});

	it('a = b : tout est zéro, aucune retenue en suspens', () => {
		const res = resolutionPosee({ op: '-', a: 340, b: 340 });
		expect(res.resultat).toBe(0);
		const [l] = res.lignes;
		expect(l.etapes.map((e) => e.ecrit)).toEqual([0, 0, 0]);
		expect(valeurEcrite(l)).toBe(0);
		expect(l.etapes[l.etapes.length - 1].retenueSortante).toBe(0);
	});
});

/* ============================================================
   3. DÉCOUPAGE — multiplication
   ============================================================ */
describe('resolutionPosee — multiplication', () => {
	it('par un chiffre : une seule ligne, la retenue finale devient le chiffre de gauche', () => {
		// 47 × 6 : 7×6=42 → 2 retiens 4 | 4×6=24+4=28 → 8 retiens 2 | reste 2 → 282.
		const res = resolutionPosee({ op: 'x', a: 47, b: 6 });
		expect(res.resultat).toBe(282);
		expect(res.operation).toBe('47 × 6');
		expect(res.lignes.length).toBe(1);
		const [l] = res.lignes;
		expect(l.role).toBe('total');
		expect(l.multiplicateur).toBe(6);
		expect(l.decalage).toBeUndefined();
		expect(l.etapes.map((e) => e.chiffres)).toEqual([[7], [4], []]);
		expect(l.etapes.map((e) => e.ecrit)).toEqual([2, 8, 2]);
		expect(l.etapes.map((e) => e.retenueEntrante)).toEqual([0, 4, 2]);
		expect(valeurEcrite(l)).toBe(282);
	});

	it('par un chiffre, sans retenue finale : pas d’étape en trop', () => {
		// 123 × 4 : 3×4=12 → 2 r1 | 2×4=8+1=9 | 1×4=4 → 492.
		const res = resolutionPosee({ op: 'x', a: 123, b: 4 });
		expect(res.resultat).toBe(492);
		expect(res.lignes[0].etapes.length).toBe(3);
		expect(res.lignes[0].etapes.map((e) => e.ecrit)).toEqual([2, 9, 4]);
	});

	it('par deux chiffres : trois lignes (unités, dizaines, puis leur addition)', () => {
		// 47 × 26 = 1222.
		//   ligne 1 (× 6) : 7×6=42 → 2 r4 | 4×6=24+4=28 → 8 r2 | reste 2      → 282
		//   ligne 2 (× 2) : 7×2=14 → 4 r1 | 4×2=8+1=9                          → 94
		//   ligne 3 : 282 + 940 : 2+0=2 | 8+4=12 → 2 r1 | 2+9+1=12 → 2 r1 | 1 → 1222
		const res = resolutionPosee({ op: 'x', a: 47, b: 26 });
		expect(res.resultat).toBe(1222);
		expect(res.lignes.map((l) => l.role)).toEqual([
			'produit-partiel',
			'produit-partiel-dizaines',
			'somme-partiels',
		]);
		expect(res.lignes.map((l) => l.valeur)).toEqual([282, 94, 1222]);
		expect(res.lignes.map((l) => l.multiplicateur)).toEqual([6, 2, undefined]);

		// Le 2ᵉ produit partiel est DÉCALÉ d'une colonne (son 0 des unités vient de la grille).
		expect(res.lignes[0].decalage).toBeUndefined();
		expect(res.lignes[1].decalage).toBe(1);
		expect(res.lignes[2].decalage).toBeUndefined();
		// Et le décalage doit être cohérent avec les valeurs : pp1 + pp2 × 10 = résultat.
		expect(res.lignes[0].valeur + res.lignes[1].valeur * 10 ** 1).toBe(res.resultat);

		expect(res.lignes[0].etapes.map((e) => e.ecrit)).toEqual([2, 8, 2]);
		expect(res.lignes[1].etapes.map((e) => e.ecrit)).toEqual([4, 9]);
		expect(res.lignes[1].etapes.map((e) => e.colonne)).toEqual([0, 1]); // rangs de CALCUL
		expect(res.lignes[2].etapes.map((e) => e.ecrit)).toEqual([2, 2, 2, 1]);
		for (const l of res.lignes) expect(valeurEcrite(l)).toBe(l.valeur);
	});

	it('par deux chiffres, multiplicateur en 1x : la ligne des dizaines recopie le multiplicande', () => {
		// 24 × 13 = 312. ligne 1 (× 3) : 4×3=12 → 2 r1 | 2×3=6+1=7 → 72
		//                ligne 2 (× 1) : 4 | 2 → 24
		//                ligne 3 : 72 + 240 = 312
		const res = resolutionPosee({ op: 'x', a: 24, b: 13 });
		expect(res.resultat).toBe(312);
		expect(res.lignes.map((l) => l.valeur)).toEqual([72, 24, 312]);
		expect(res.lignes[1].etapes.map((e) => e.ecrit)).toEqual([4, 2]);
		expect(res.lignes[1].etapes.every((e) => e.retenueSortante === 0)).toBe(true);
		expect(res.lignes[2].etapes.map((e) => e.ecrit)).toEqual([2, 1, 3]);
	});
});

describe('resultatPosee', () => {
	it('donne la valeur attendue de la grille pour les trois opérations', () => {
		expect(resultatPosee({ op: '+', a: 347, b: 285 })).toBe(632);
		expect(resultatPosee({ op: '-', a: 503, b: 287 })).toBe(216);
		expect(resultatPosee({ op: 'x', a: 47, b: 26 })).toBe(1222);
	});
});

/* ============================================================
   4. RETENUES QUI S'ÉCRIVENT (une seule rangée dans la grille)
   ============================================================ */
describe('retenueDansLaGrille — seules les retenues qui ont une case', () => {
	it('le résultat et l’addition finale ont leur rangée ; les produits partiels non', () => {
		const simple = resolutionPosee({ op: '+', a: 347, b: 285 });
		expect(retenueDansLaGrille(simple.lignes[0])).toBe(true);
		const mult = resolutionPosee({ op: 'x', a: 47, b: 26 });
		expect(mult.lignes.map(retenueDansLaGrille)).toEqual([false, false, true]);
	});

	it('exactement une ligne par opération a des retenues écrites — comme la grille n’a qu’une rangée de retenues', () => {
		for (const spec of [
			{ op: '+', a: 347, b: 285 },
			{ op: '-', a: 503, b: 287 },
			{ op: 'x', a: 123, b: 4 },
			{ op: 'x', a: 47, b: 26 },
		] as PosedSpec[]) {
			const res = resolutionPosee(spec);
			const ecrites = res.lignes.filter(retenueDansLaGrille).length;
			const rangees = dispositionPosee(spec).rangees.filter((r) =>
				r.cellules.some((c) => c.role === 'retenue'),
			).length;
			expect(ecrites, nb(spec)).toBe(1);
			expect(rangees, nb(spec)).toBe(ecrites);
		}
	});
});

/* ============================================================
   5. NARRATION
   ------------------------------------------------------------
   Règles actées (charte des aides #272 + avis pédagogique repris dans #490) :
   chaque colonne est NOMMÉE, le fait numérique est énoncé comme un CALCUL, et une
   retenue est justifiée par la VALEUR DE POSITION. Les assertions portent sur ces
   ingrédients (et sur la vérité arithmétique de ce qui est énoncé), pas sur une
   formulation recopiée.
   ============================================================ */
describe('phrasePosee — addition', () => {
	const res = resolutionPosee({ op: '+', a: 347, b: 285 });
	const ligne = res.lignes[0];
	const dis = (colonne: number) => phrasePosee(etape(res, 0, colonne), '+', ligne);

	it('nomme la colonne, énonce le calcul, justifie la retenue par la valeur de position', () => {
		// Unités : 7 + 5 = 12, soit 1 dizaine et 2 unités.
		const p = dis(0);
		expect(p).toContain('unités');
		expect(p).toContain('7 + 5 = 12');
		expect(p).toContain('1 dizaine');
		expect(p).toContain('2 unités');
		expect(p.toLowerCase()).toContain('écris');
		expect(egalitesFausses(p)).toEqual([]);
	});

	it('la retenue entrante fait partie du calcul énoncé, et est nommée comme telle', () => {
		// Dizaines : 4 + 8 + 1 = 13 → 13 DIZAINES = 1 centaine et 3 dizaines.
		const p = dis(1);
		expect(p).toContain('dizaines');
		expect(p).toContain('4 + 8 + 1');
		expect(p).toMatch(/retenue/);
		expect(p).toContain('1 centaine');
		expect(p).toContain('3 dizaines');
		expect(egalitesFausses(p)).toEqual([]);
	});

	it('sans retenue sortante, on écrit et c’est tout (rien à retenir)', () => {
		// Centaines : 3 + 2 + 1 = 6, pas de retenue → ne doit rien demander de retenir.
		const p = dis(2);
		expect(p).toContain('centaines');
		expect(p).toContain('= 6');
		expect(p).not.toMatch(/je retiens/);
		expect(egalitesFausses(p)).toEqual([]);
	});

	it('dernière colonne d’une retenue seule : on écrit le chiffre de gauche, sans rien reporter', () => {
		const neufs = resolutionPosee({ op: '+', a: 999, b: 999 });
		const p = phrasePosee(etape(neufs, 0, 3), '+', neufs.lignes[0]);
		expect(p).toMatch(/retenue/);
		expect(p).toContain('1');
		expect(p).not.toMatch(/je retiens/);
		expect(egalitesFausses(p)).toEqual([]);
	});
});

describe('phrasePosee — soustraction', () => {
	const res = resolutionPosee({ op: '-', a: 452, b: 178 });
	const ligne = res.lignes[0];
	const dis = (colonne: number) => phrasePosee(etape(res, 0, colonne), '-', ligne);

	it('emprunt ordinaire : ce qu’il faut retirer, l’emprunt d’une dizaine, le calcul, le report', () => {
		// Unités : retirer 8 à 2 → j'emprunte une dizaine, 12 − 8 = 4, et je retiens 1 pour
		// les dizaines.
		const p = dis(0);
		expect(p).toContain('unités');
		expect(p).toContain('8'); // ce qu'il faut retirer
		expect(p).toMatch(/dizaine/); // l'unité EMPRUNTÉE est nommée
		expect(p).toContain('12 − 8 = 4');
		expect(p).toMatch(/retiens 1/);
		expect(egalitesFausses(p)).toEqual([]);
	});

	it('la retenue s’ajoute à ce qu’il faut retirer, et l’emprunt vient de la colonne d’à côté', () => {
		// Dizaines : retirer 7 + 1 = 8 à 5 → emprunt d'une centaine, 15 − 8 = 7, retenue 1
		// à retirer aux centaines.
		const p = dis(1);
		expect(p).toContain('dizaines');
		expect(p).toContain('centaine'); // emprunté au rang supérieur
		expect(p).toContain('15 − 8 = 7');
		expect(egalitesFausses(p)).toEqual([]);
	});

	it('sans emprunt : le calcul et l’écriture, aucun emprunt annoncé', () => {
		// Centaines : retirer 1 + 1 = 2 à 4 → 4 − 2 = 2.
		const p = dis(2);
		expect(p).toContain('centaines');
		expect(p).toContain('4 − 2 = 2');
		expect(p.toLowerCase()).not.toMatch(/emprunt/);
		expect(egalitesFausses(p)).toEqual([]);
	});

	it('emprunt à travers un ZÉRO : phrase de STRUCTURE différente de l’emprunt ordinaire', () => {
		// 503 − 287, colonne des dizaines : 0 doit prêter alors qu'il n'a rien.
		// Comparée à un emprunt ordinaire de MÊME forme (543 − 287, mêmes chiffres du bas,
		// même retenue entrante) : si les deux phrases avaient le même squelette, le cas dur
		// du CE2 serait raconté comme un cas banal.
		const zero = resolutionPosee({ op: '-', a: 503, b: 287 });
		const ordinaire = resolutionPosee({ op: '-', a: 543, b: 287 });
		const pZero = phrasePosee(etape(zero, 0, 1), '-', zero.lignes[0]);
		const pOrdi = phrasePosee(etape(ordinaire, 0, 1), '-', ordinaire.lignes[0]);
		expect(etape(zero, 0, 1).chiffres[0]).toBe(0);
		expect(etape(ordinaire, 0, 1).chiffres[0]).toBe(4); // même bas (8), même retenue (1)
		expect(etape(ordinaire, 0, 1).retenueEntrante).toBe(etape(zero, 0, 1).retenueEntrante);
		expect(squelette(pZero)).not.toBe(squelette(pOrdi));
		// Le cas du zéro dit qu'il n'y a rien à prendre ici ; l'ordinaire, que le chiffre du
		// haut est trop petit — deux explications, pas une.
		expect(pZero).toMatch(/rien/);
		expect(pOrdi).not.toMatch(/rien/);
		expect(pZero).toContain('10 − 9 = 1');
		expect(pOrdi).toContain('14 − 9 = 5');
		expect(egalitesFausses(pZero)).toEqual([]);
		expect(egalitesFausses(pOrdi)).toEqual([]);
	});

	it('l’emprunt se prend à la colonne D’À CÔTÉ, jamais à la sienne', () => {
		// La règle affichée en permanence dit « tu empruntes une dizaine à la colonne d'à
		// côté » : la colonne citée après « j'emprunte » doit être celle de rang + 1. Un
		// off-by-one ici enseignerait un geste impossible, et il ne se voit pas à l'œil nu sur
		// un exemple à trois chiffres.
		const res = resolutionPosee({ op: '-', a: 452, b: 178 });
		const source = (colonne: number) => {
			const p = phrasePosee(etape(res, 0, colonne), '-', res.lignes[0]);
			return /emprunte[^.]*/.exec(p)?.[0] ?? '';
		};
		expect(source(0)).toContain('dizaines'); // unités : on emprunte aux dizaines
		expect(source(0)).not.toContain('unités');
		expect(source(1)).toContain('centaines'); // dizaines : on emprunte aux centaines
		expect(source(1)).not.toContain('dizaines');
	});

	it('colonne SANS case dans la grille : nommée, mais aucune écriture promise', () => {
		// 512 − 480 = 32 : la colonne des centaines rend la retenue (5 − 4 − 1 = 0) et son
		// chiffre est un zéro de tête, que la grille n'écrit pas. La phrase doit donc nommer la
		// colonne sans annoncer d'écriture — « j'écris 0 » désignerait une case qui ne
		// s'allume pas. (Ce qu'elle DOIT dire du calcul reste discuté : cf. rapport.)
		const res = resolutionPosee({ op: '-', a: 512, b: 480 });
		expect(res.resultat).toBe(32);
		const p = phrasePosee(etape(res, 0, 2), '-', res.lignes[0]);
		expect(p).toContain('Colonne des centaines');
		expect(p.toLowerCase()).not.toContain('écris');
		expect(egalitesFausses(p)).toEqual([]);
		// Les colonnes qui ONT une case, elles, annoncent toujours leur écriture.
		for (const colonne of [0, 1]) {
			const q = phrasePosee(etape(res, 0, colonne), '-', res.lignes[0]);
			expect(q.toLowerCase(), `colonne ${colonne}`).toContain('écris');
		}
	});
});

describe('phrasePosee — multiplication', () => {
	const res = resolutionPosee({ op: 'x', a: 47, b: 26 });
	const [pp1, pp2, somme] = res.lignes;

	it('produit partiel : le fait numérique isolé, puis la valeur de position', () => {
		// Unités : 7 × 6 = 42, soit 4 dizaines et 2 unités.
		const p = phrasePosee(etape(res, 0, 0), 'x', pp1);
		expect(p).toContain('unités');
		expect(p).toContain('7 × 6 = 42');
		expect(p).toContain('4 dizaines');
		expect(p).toContain('2 unités');
		expect(egalitesFausses(p)).toEqual([]);
	});

	it('retenue d’un produit partiel : dite AUTREMENT, puisqu’elle n’a pas de case', () => {
		// Même étape, une fois sur une ligne dont les retenues s'écrivent, une fois sur la
		// ligne réelle (produit partiel). Les deux phrases doivent différer de structure :
		// sur un produit partiel, il n'y a nulle part où écrire la retenue.
		const e = etape(res, 0, 0);
		const commeGrille: LignePosee = { ...pp1, role: 'total' };
		const pEnTete = phrasePosee(e, 'x', pp1);
		const pDansGrille = phrasePosee(e, 'x', commeGrille);
		expect(squelette(pEnTete)).not.toBe(squelette(pDansGrille));
		expect(pDansGrille).toMatch(/je retiens/);
		expect(pEnTete).not.toMatch(/je retiens/);
	});

	it('PIÈGE du décalage : la 1re colonne du 2ᵉ produit partiel est celle des DIZAINES', () => {
		// Rang de calcul 0 (on multiplie le chiffre des unités de 47), mais la case est dans
		// la colonne des DIZAINES à l'écran (les unités portent le 0 fourni). 7 × 2 = 14 →
		// 1 centaine et 4 dizaines.
		const p = phrasePosee(etape(res, 1, 0), 'x', pp2);
		expect(p).toContain('7 × 2 = 14');
		expect(p).toContain('dizaines');
		expect(p).not.toContain('Colonne des unités');
		expect(p).toContain('1 centaine');
		expect(p).toContain('4 dizaines');
		expect(egalitesFausses(p)).toEqual([]);
	});

	it('PIÈGE du décalage (suite) : la colonne suivante est celle des CENTAINES', () => {
		// Rang de calcul 1, colonne des centaines à l'écran : 4 × 2 = 8, plus la retenue 1 → 9.
		const p = phrasePosee(etape(res, 1, 1), 'x', pp2);
		expect(p).toContain('centaines');
		expect(p).toContain('4 × 2 = 8');
		expect(p).toMatch(/9/);
		expect(egalitesFausses(p)).toEqual([]);
	});

	it('addition finale : elle se raconte comme une ADDITION, avec l’op de l’opération (ce que passe le rendu)', () => {
		// La ligne `somme-partiels` additionne les deux produits partiels (282 + 940). Le
		// rendu appelle `phrasePosee(etape, spec.op, ligne)` — donc avec 'x', l'op de
		// l'OPÉRATION —, mais la ligne, elle, est une addition : c'est elle qui commande la
		// narration. Colonne des dizaines : 8 + 4 = 12.
		// ⚠ ÉCHOUE aujourd'hui (bug applicatif, cf. rapport) : la branche 'x' de
		// `phrasePosee` est appliquée à une ligne SANS multiplicateur, ce qui produit
		// « 8 × undefined = 0 » puis une valeur de position fausse. À corriger dans
		// src/core/etayage-posee.ts (choisir la narration d'après le RÔLE de la ligne) ou
		// dans l'appelant (passer '+' pour `somme-partiels`).
		const p = phrasePosee(etape(res, 2, 1), 'x', somme);
		expect(p).toContain('dizaines');
		expect(p).toContain('8 + 4 = 12');
		expect(p).not.toContain('×');
		expect(p).not.toContain('undefined');
		expect(egalitesFausses(p)).toEqual([]);
	});
});

describe('chapeauLigne — annoncer une ligne seulement quand il y en a plusieurs', () => {
	it('opération à une seule ligne : rien à annoncer', () => {
		for (const spec of [
			{ op: '+', a: 347, b: 285 },
			{ op: '-', a: 503, b: 287 },
			{ op: 'x', a: 123, b: 4 },
		] as PosedSpec[]) {
			const res = resolutionPosee(spec);
			expect(chapeauLigne(res.lignes[0], spec), nb(spec)).toBeUndefined();
		}
	});

	it('multiplication à deux chiffres : trois annonces distinctes, dont le 0 du décalage', () => {
		const spec: PosedSpec = { op: 'x', a: 47, b: 26 };
		const res = resolutionPosee(spec);
		const chapeaux = res.lignes.map((l) => chapeauLigne(l, spec));
		expect(chapeaux.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
		expect(new Set(chapeaux).size).toBe(3);
		// 1re ligne : on multiplie 47 par le chiffre des UNITÉS (6).
		expect(chapeaux[0]).toContain('47');
		expect(chapeaux[0]).toContain('6');
		expect(chapeaux[0]).toContain('unités');
		// 2e ligne : par le chiffre des DIZAINES (2), et le 0 déjà écrit explique le décalage.
		expect(chapeaux[1]).toContain('47');
		expect(chapeaux[1]).toContain('2');
		expect(chapeaux[1]).toContain('dizaines');
		expect(chapeaux[1]).toContain('0');
		expect(chapeaux[1]).toMatch(/décal/);
		// 3e ligne : additionner les deux lignes obtenues.
		expect(chapeaux[2]).toMatch(/addition|additionn/);
	});
});

describe('nomColonne', () => {
	it('nomme les quatre rangs de l’appli, et n’invente rien au-delà', () => {
		expect(nomColonne(0)).toBe('unités');
		expect(nomColonne(1)).toBe('dizaines');
		expect(nomColonne(2)).toBe('centaines');
		expect(nomColonne(3)).toBe('milliers');
		// Au-delà des milliers, l'appli ne va pas : mieux vaut ne pas nommer la colonne que
		// servir un mot que l'enfant n'a pas rencontré.
		expect(['unités', 'dizaines', 'centaines', 'milliers']).not.toContain(nomColonne(4));
		expect(nomColonne(4).length).toBeGreaterThan(0);
	});
});

/* ============================================================
   6. INVARIANTS PAR ÉCHANTILLON (tirage déterministe, plages réelles)
   ============================================================ */
describe('INVARIANTS sur un large échantillon des vrais générateurs', () => {
	const specs = echantillon(400);

	it('l’échantillon couvre bien les trois opérations, retenues, emprunts et deux produits partiels', () => {
		expect(specs.length).toBe(1200);
		expect(specs.some((s) => s.op === '+')).toBe(true);
		expect(specs.some((s) => s.op === '-')).toBe(true);
		expect(specs.some((s) => s.op === 'x' && s.b < 10)).toBe(true);
		expect(specs.some((s) => s.op === 'x' && s.b >= 10)).toBe(true);
		// Cas durs présents, sinon les invariants ci-dessous ne prouveraient pas grand-chose.
		const res = specs.map(resolutionPosee);
		expect(res.some((r) => r.lignes[0].etapes.some((e) => e.retenueSortante > 0))).toBe(true);
		expect(res.some((r) => r.lignes[0].etapes.some((e) => e.emprunt))).toBe(true);
		expect(res.some((r) => r.lignes[0].etapes.some((e) => e.emprunt && e.chiffres[0] === 0))).toBe(
			true,
		);
	});

	it('les chiffres écrits recomposent la valeur de leur ligne, et rien ne reste en suspens', () => {
		for (const spec of specs) {
			const res = resolutionPosee(spec);
			const attendu =
				spec.op === '+' ? spec.a + spec.b : spec.op === '-' ? spec.a - spec.b : spec.a * spec.b;
			expect(res.resultat, nb(spec)).toBe(attendu);
			let recompose = 0;
			for (const ligne of res.lignes) {
				// Colonnes traitées des unités vers la gauche, sans trou.
				expect(
					ligne.etapes.map((e) => e.colonne),
					nb(spec),
				).toEqual(ligne.etapes.map((_, i) => i));
				// Chaîne des retenues : rien n'apparaît ni ne disparaît en cours de route.
				expect(ligne.etapes[0].retenueEntrante, nb(spec)).toBe(0);
				for (let i = 1; i < ligne.etapes.length; i++) {
					expect(ligne.etapes[i].retenueEntrante, nb(spec)).toBe(
						ligne.etapes[i - 1].retenueSortante,
					);
				}
				// Un chiffre par colonne, et aucune retenue oubliée en fin de ligne.
				for (const e of ligne.etapes) {
					expect(e.ecrit, nb(spec)).toBeGreaterThanOrEqual(0);
					expect(e.ecrit, nb(spec)).toBeLessThanOrEqual(9);
				}
				expect(ligne.etapes[ligne.etapes.length - 1].retenueSortante, nb(spec)).toBe(0);
				// Ce qui est écrit sur la ligne EST la valeur annoncée de la ligne.
				expect(valeurEcrite(ligne), `${nb(spec)} / ${ligne.role}`).toBe(ligne.valeur);
				if (ligne.role === 'produit-partiel' || ligne.role === 'produit-partiel-dizaines')
					recompose += ligne.valeur * 10 ** (ligne.decalage ?? 0);
			}
			// Les produits partiels, remis à leur place par leur décalage, font le résultat.
			if (res.lignes.length > 1) expect(recompose, nb(spec)).toBe(res.resultat);
		}
	});

	it('narration : chaque colonne lue est nommée, énoncée comme un calcul, et tout ce qui est affirmé est vrai', () => {
		// Toutes les violations sont COLLECTÉES (au lieu de s'arrêter à la première) : sur un
		// millier d'opérations, savoir COMBIEN de cas et LESQUELS dérapent est ce qui permet
		// de distinguer un défaut de rédaction d'un défaut de branche.
		const violations: string[] = [];
		for (const spec of specs) {
			const res = resolutionPosee(spec);
			const dispo = dispositionPosee(spec);
			const rangeesSaisie = dispo.rangees.filter((r) =>
				r.cellules.some((c) => c.role === 'saisie'),
			);
			res.lignes.forEach((ligne, i) => {
				// Rangs qui ont une CASE dans la grille (la cellule 0 est la colonne du signe).
				const rangsCases = rangeesSaisie[i].cellules
					.map((c, idx) => (c.role === 'saisie' ? dispo.colonnes - idx : -1))
					.filter((r) => r >= 0);
				for (const e of ligne.etapes) {
					// `spec.op` : c'est bien l'op de l'OPÉRATION que passe le rendu, y compris sur
					// la ligne d'addition finale d'une multiplication (cf. ui/etayage-panneau.ts).
					const p = phrasePosee(e, spec.op, ligne);
					const rang = e.colonne + (ligne.decalage ?? 0);
					const ou = `${nb(spec)} / ${ligne.role} / colonne ${e.colonne}`;
					const faute = (raison: string) => violations.push(`${ou} — ${raison} : « ${p} »`);
					const fausses = egalitesFausses(p);
					if (fausses.length) faute(`égalité fausse (${fausses.join(', ')})`);
					if (!p.trim().length) faute('phrase vide');
					if (p.includes('undefined')) faute('« undefined » dans la phrase');
					// Toute colonne est nommée, y compris celles qui n'écrivent rien : c'est le
					// repère de l'enfant sur la grille. (Sauf « il reste la retenue », qui ne lit
					// aucune colonne et écrit « tout à gauche ».)
					if (e.chiffres.length && !/unités|dizaines|centaines|milliers/.test(p))
						faute('colonne non nommée');
					// L'emprunt se prend à la colonne D'À CÔTÉ (rang + 1), jamais à la sienne.
					const emprunt = /emprunte[^.]*/.exec(p)?.[0];
					if (emprunt && !emprunt.includes(nomColonne(rang + 1)))
						faute(`emprunt pris à la mauvaise colonne (attendu : ${nomColonne(rang + 1)})`);
					// Colonne SANS case dans la grille (zéro de tête d'une soustraction, 105 − 100) :
					// exemptée du calcul énoncé, mais elle ne doit rien promettre qu'on n'écrit pas.
					if (!rangsCases.includes(rang)) {
						if (e.ecrit !== 0) faute('chiffre non nul dans une colonne sans case');
						if (p.toLowerCase().includes('écris'))
							faute("promet une écriture sans case pour l'accueillir");
						continue;
					}
					if (!e.chiffres.length) continue; // « il reste la retenue » : rien à lire
					// Le fait numérique est un CALCUL énoncé, pas un constat.
					if (!/\d\s*[+−×]\s*\d/.test(p) || !p.includes('=')) faute('aucun calcul énoncé');
					if (!p.toLowerCase().includes('écris')) faute("ne dit pas ce qu'on écrit");
				}
			});
		}
		expect({
			nombre: violations.length,
			familles: [...new Set(violations.map((v) => v.split(' — ')[1].split(' : ')[0]))],
			premieres: violations.slice(0, 2),
		}).toEqual({ nombre: 0, familles: [], premieres: [] });
	});

	it('grille de démonstration : une case pour chaque chiffre annoncé (seuls des zéros de tête peuvent manquer)', () => {
		for (const spec of specs) {
			const res = resolutionPosee(spec);
			const dispo = dispositionPosee(spec);
			// Les rangées à remplir se succèdent dans le même ordre que les lignes.
			const rangees = dispo.rangees.filter((r) => r.cellules.some((c) => c.role === 'saisie'));
			expect(rangees.length, nb(spec)).toBe(res.lignes.length);
			res.lignes.forEach((ligne, i) => {
				// Rang d'une case = sa distance à la colonne des unités (la cellule 0 est le signe).
				const rangsCases = rangees[i].cellules
					.map((c, idx) => (c.role === 'saisie' ? dispo.colonnes - idx : -1))
					.filter((r) => r >= 0);
				const rangsEtapes = ligne.etapes.map((e) => e.colonne + (ligne.decalage ?? 0));
				// Aucune case sans son étape : la démonstration ne peut pas laisser un trou.
				for (const r of rangsCases)
					expect(rangsEtapes, `${nb(spec)} / ${ligne.role} / rang ${r}`).toContain(r);
				// Une étape sans case ne peut être qu'un zéro de tête (105 − 100 → « 005 »).
				for (const e of ligne.etapes) {
					const rang = e.colonne + (ligne.decalage ?? 0);
					if (!rangsCases.includes(rang))
						expect(e.ecrit, `${nb(spec)} / ${ligne.role} / rang ${rang}`).toBe(0);
				}
			});
		}
	});
});
