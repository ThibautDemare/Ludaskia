/* ============================================================
   Intercalation CE2 (#446) — extension à la PLAGE 4 CHIFFRES, charnières de rang
   et distracteurs de tuiles.
   ------------------------------------------------------------
   Complète `intercaler-ce2.test.ts` (paliers d'écart, correction par intervalle,
   round-trip de correction) sur ce qu'il ne couvre pas :
   - la leçon `num-situer-10000` intercale DÉSORMAIS elle aussi, sur des bornes à
     4 chiffres et par-dessus un millier (l'attendu CE2 associe comparer / encadrer /
     intercaler sur toute la plage du niveau) ;
   - le cas « CHARNIÈRE » du palier moyen (396 → 405, 3 987 → 4 002) est réellement
     REPRÉSENTÉ, et non plus laissé au hasard ;
   - la PONDÉRATION des trois paliers d'écart (~18 / ~50 / ~32 %) ;
   - les distracteurs de tuiles : aucun n'est une réponse VALIDE, et le débordement
     hors bande se produit des DEUX côtés (il n'était montré que par le bas) ;
   - la NON-RÉGRESSION de la branche CM1 de `num-situer-10000`, qui ne doit pas se
     mettre à intercaler.

   Attendus dérivés du contrat de l'issue et du programme (« comparer, encadrer,
   intercaler des nombres entiers »), jamais recopiés de l'implémentation. On désigne
   les leçons par leur IDENTIFIANT : leur libellé est en cours d'arbitrage.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getLessonById, genLessonItem } from '../src/core/catalog';
import { ESPACE_FINE } from '../src/core/nombres';
import type { Exercise } from '../src/core/exercise';

type Texte = Extract<Exercise, { type: 'text' }>;
type Tuiles = Extract<Exercise, { type: 'tuilesNombre' }>;

/* Marqueurs d'énoncé des trois gestes de la relation d'ordre. On classe par l'ÉNONCÉ
   (et non par la présence de `intervalle`) pour que ces tests restent des tests de
   comportement observable ; « aucun énoncé non classé » garantit qu'un changement de
   formulation les fait échouer bruyamment au lieu de les vider silencieusement. */
const INTERCALER = 'Place un nombre entre';
const COMPARER = 'Compare';
const ENCADRER = /juste (avant|après)/;

/* Les DEUX leçons CE2 qui couvrent une plage entière, donc qui doivent intercaler (#446),
   avec le plafond de leur plage — déduit de leur périmètre pédagogique (3 chiffres pour
   « j'encadre et j'intercale », « jusqu'à 10 000 » pour l'autre), pas du code. */
const LECONS_CE2 = [
	{ id: 'num-encadrer-intercaler', max: 999 },
	{ id: 'num-situer-10000', max: 9999 },
] as const;

function lecon(id: string) {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon ${id} absente du catalogue`);
	return l;
}

/* Séparateurs de milliers possibles dans un énoncé : espace fine insécable (U+202F, posée
   par formatNombre au-delà de 9 999) et insécable (U+00A0). Désignés par leur échappement,
   jamais écrits en clair (invisibles, fragiles à l'édition). */
const SEPARATEURS = /[\s\u202F\u00A0]/g;
const CHIFFRES_GROUPES = /entre ([\d\u202F\u00A0]+) et ([\d\u202F\u00A0]+)/;

/* Un nombre lu dans un énoncé, séparateurs de milliers neutralisés. */
const sansSeparateur = (s: string) => Number(s.replace(SEPARATEURS, ''));

/* Bornes A, B de « Place un nombre entre A et B … » lues dans l'énoncé AFFICHÉ. */
function bornes(question: string): [number, number] {
	const m = question.match(CHIFFRES_GROUPES);
	if (!m) throw new Error(`énoncé d'intercalation inattendu : ${question}`);
	return [sansSeparateur(m[1]), sansSeparateur(m[2])];
}

function saisies(id: string, n: number): Texte[] {
	const type = lecon(id).exerciseType;
	const out: Texte[] = [];
	for (let i = 0; i < n; i++) {
		const ex = type.generate({ level: 'ce2' });
		if (ex.type === 'text') out.push(ex);
	}
	return out;
}

function tuiles(id: string, n: number): Tuiles[] {
	const type = lecon(id).exerciseType;
	const out: Tuiles[] = [];
	for (let i = 0; i < n; i++) {
		const ex = type.generate({ level: 'ce2', mode: 'tuiles' });
		if (ex.type === 'tuilesNombre') out.push(ex);
	}
	return out;
}

/* Écart d'une intercalation → palier. Les trois bandes de l'issue sont DISJOINTES et non
   adjacentes (2-4 / 6-30 / 100-900) : un écart de 5 ou de 31..99 signalerait un tirage hors
   contrat, jamais un palier ambigu. */
function palier(ecart: number): 'serré' | 'moyen' | 'large' {
	if (ecart >= 2 && ecart <= 4) return 'serré';
	if (ecart >= 6 && ecart <= 30) return 'moyen';
	if (ecart >= 100 && ecart <= 900) return 'large';
	throw new Error(`écart hors des trois paliers du contrat : ${ecart}`);
}

describe('num-situer-10000 au CE2 : les trois gestes, dont intercaler (#446)', () => {
	it('intercale aussi, sur des bornes à 4 chiffres, et par-dessus un millier', () => {
		const ex = saisies('num-situer-10000', 3000);
		let compare = 0;
		let encadre = 0;
		let intercale = 0;
		let quatreChiffres = 0;
		let franchitMillier = 0;
		for (const e of ex) {
			if (e.question.startsWith(INTERCALER)) {
				intercale++;
				const [a, b] = bornes(e.question);
				expect(a).toBeGreaterThanOrEqual(100); // bornes à 3 chiffres au moins
				expect(a).toBeLessThan(b);
				expect(b).toBeLessThanOrEqual(9999); // plage de la leçon : jamais au-delà de 10 000
				// La bande affichée est bien celle que la correction utilisera.
				expect(e.intervalle).toEqual([a, b]);
				if (b >= 1000) quatreChiffres++;
				if (Math.floor(a / 1000) !== Math.floor(b / 1000)) franchitMillier++;
			} else if (e.question.startsWith(COMPARER)) compare++;
			else if (ENCADRER.test(e.question)) encadre++;
			else throw new Error(`énoncé non classé : ${e.question}`);
		}
		expect(compare + encadre + intercale).toBe(ex.length);
		// Les trois gestes du programme cohabitent, l'intercalation n'étant pas résiduelle
		// (l'issue les veut à parts comparables ; plancher volontairement bas).
		expect(compare).toBeGreaterThan(0);
		expect(encadre).toBeGreaterThan(0);
		expect(intercale / ex.length).toBeGreaterThan(0.2);
		// L'apport de #446 sur cette leçon : intercaler à 4 chiffres, impossible auparavant.
		expect(quatreChiffres / intercale).toBeGreaterThan(0.5);
		// … et par-dessus un millier (3 987 → 4 002), cas cité par l'issue.
		expect(franchitMillier / intercale).toBeGreaterThan(0.1);
	});
});

describe('Charnière : le palier moyen franchit vraiment un rang (#446)', () => {
	/* Seuil de fréquence assumé. Le hasard seul produirait une charnière de CENTAINE sur un
	   écart moyen (6-30, moyenne ~18) dans ~18/900 des cas sur la plage 999 et ~18/9900 sur
	   la plage 9999, soit ~2 % et ~0,2 % : c'est l'état AVANT #446. Un pilotage « une moitié
	   du palier » donne ~50 %. Le plancher à 30 % tranche donc franchement entre les deux
	   sans figer la pondération exacte, et reste à plus de 10 écarts-types du 50 % attendu
	   sur les échantillons ci-dessous (≥ 300 écarts moyens). */
	const PLANCHER_CENTAINE = 0.3;
	// Charnière de MILLIER (plage 4 chiffres) : ~la moitié des charnières visent le millier,
	// soit ~25 % du palier moyen, contre ~0,2 % par hasard. Plancher à 10 %.
	const PLANCHER_MILLIER = 0.1;

	for (const { id, max } of LECONS_CE2) {
		it(`${id} : les écarts moyens encadrent souvent un multiple de 100`, () => {
			let moyens = 0;
			let centaine = 0;
			let millier = 0;
			for (const e of saisies(id, 3000)) {
				if (!e.question.startsWith(INTERCALER)) continue;
				const [a, b] = bornes(e.question);
				if (palier(b - a) !== 'moyen') continue;
				moyens++;
				if (Math.floor(a / 100) !== Math.floor(b / 100)) centaine++;
				if (Math.floor(a / 1000) !== Math.floor(b / 1000)) millier++;
			}
			expect(moyens).toBeGreaterThan(300); // échantillon utile (palier majoritaire)
			expect(centaine / moyens).toBeGreaterThan(PLANCHER_CENTAINE);
			if (max >= 1000) expect(millier / moyens).toBeGreaterThan(PLANCHER_MILLIER);
		});
	}
});

describe('Pondération des trois paliers d’écart (#446)', () => {
	/* Cibles de l'issue : ~18 % serré, ~50 % moyen, ~32 % large. Tolérance ±6 points —
	   au moins 4 écarts-types sur les échantillons ci-dessous (≥ 900 intercalations), donc
	   sensible à une inversion de pondération sans l'être au hasard du tirage. */
	const CIBLES = { serré: 0.18, moyen: 0.5, large: 0.32 } as const;
	const TOLERANCE = 0.06;

	for (const { id } of LECONS_CE2) {
		it(`${id} : ~18 % serré, ~50 % moyen, ~32 % large`, () => {
			const vus = { serré: 0, moyen: 0, large: 0 };
			let total = 0;
			for (const e of saisies(id, 4000)) {
				if (!e.question.startsWith(INTERCALER)) continue;
				const [a, b] = bornes(e.question);
				vus[palier(b - a)]++; // lève si l'écart tombe hors des trois bandes
				total++;
			}
			expect(total).toBeGreaterThan(900);
			for (const [nom, cible] of Object.entries(CIBLES)) {
				const part = vus[nom as keyof typeof vus] / total;
				expect(part).toBeGreaterThan(cible - TOLERANCE);
				expect(part).toBeLessThan(cible + TOLERANCE);
			}
		});
	}
});

describe('Tuiles : distracteurs hors bande, des DEUX côtés (#446)', () => {
	/* Le débordement hors bande n'était tiré que SOUS la borne basse : l'enfant ne voyait
	   jamais l'erreur « j'ai dépassé par le haut ». Les deux sens doivent apparaître ; un
	   tirage équilibré en donne ~50 % chacun, une implémentation unilatérale exactement 0 %
	   d'un côté. Plancher à 15 %. */
	const PLANCHER_COTE = 0.15;

	for (const { id, max } of LECONS_CE2) {
		it(`${id} : aucun distracteur valide, débordement au-dessus ET au-dessous`, () => {
			let vus = 0;
			let dessus = 0;
			let dessous = 0;
			for (const e of tuiles(id, 2500)) {
				if (!e.question.startsWith(INTERCALER)) continue;
				vus++;
				const [a, b] = bornes(e.question);
				const valeurs = e.tuiles.map(sansSeparateur);
				const bonne = sansSeparateur(e.answer);
				expect(e.tuiles).toContain(e.answer);
				expect(bonne).toBeGreaterThan(a);
				expect(bonne).toBeLessThan(b);
				for (const v of valeurs) {
					// De VRAIES formes : des entiers strictement positifs, jamais au-delà de la
					// plage de la leçon (une tuile à 5 chiffres au CE2 serait hors programme).
					expect(Number.isInteger(v)).toBe(true);
					expect(v).toBeGreaterThan(0);
					expect(v).toBeLessThanOrEqual(max);
					// L'intervalle est OUVERT : les bornes elles-mêmes sont des distracteurs
					// légitimes, mais AUCUNE autre tuile ne doit être une réponse acceptable —
					// sinon deux tuiles seraient justes et l'une comptée fausse à tort.
					if (v !== bonne) expect(v > a && v < b).toBe(false);
				}
				if (valeurs.some((v) => v > b)) dessus++;
				if (valeurs.some((v) => v < a)) dessous++;
			}
			expect(vus).toBeGreaterThan(300);
			expect(dessus / vus).toBeGreaterThan(PLANCHER_COTE);
			expect(dessous / vus).toBeGreaterThan(PLANCHER_COTE);
		});
	}
});

describe('Non-régression : la branche CM1 de num-situer-10000 est inchangée (#446)', () => {
	it('aucune intercalation au CM1, et des nombres toujours ≥ 10 000', () => {
		const N = 3000;
		let compare = 0;
		let encadre = 0;
		for (let i = 0; i < N; i++) {
			const item = genLessonItem(lecon('num-situer-10000'), 'cm1');
			// L'extension #446 vise la plage CE2 : au CM1 cette leçon reste « comparer /
			// encadrer aux grandes plages », sans geste d'intercalation ni correction par
			// intervalle (l'intercalation CM1 vit dans num-encadrer-intercaler).
			expect(item.intervalle).toBeUndefined();
			expect(item.text.startsWith(INTERCALER)).toBe(false);
			// Grandes plages (#240) : tout nombre affiché est ≥ 10 000, donc GROUPÉ par classes
			// de 3 (convention française) — marqueur simple, indépendant du libellé.
			expect(item.text).toContain(ESPACE_FINE);
			if (['<', '=', '>'].includes(String(item.answer))) compare++;
			else if (ENCADRER.test(item.text)) encadre++;
			else throw new Error(`énoncé CM1 inattendu : ${item.text}`);
		}
		// Les deux gestes restent substantiellement représentés (l'un ne mange pas l'autre).
		expect(compare / N).toBeGreaterThan(0.3);
		expect(encadre / N).toBeGreaterThan(0.3);
	});
});
