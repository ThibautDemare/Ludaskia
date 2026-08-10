/* ============================================================
   Grammaire CE2 — « Clique sur le mot » : nom, déterminant, adjectif, pronom
   personnel sujet (#436).
   ------------------------------------------------------------
   Complète (sans les toucher) `grammaire-clic-mot.test.ts` (verbe, #259) et
   `grammaire-clic-mot-natures.test.ts` (les 5 natures CM1, #437). Ici : les quatre
   BANQUES CE2, la règle d'ÉNUMÉRATION française partagée, la CIBLE PLURIELLE
   (« tous les noms », « tous les déterminants »), le repli non interactif au CE2, la
   propagation de `explicationNommeCible`, et la NON-RÉGRESSION du CM1 (les trois
   leçons désormais servies aux deux niveaux ne doivent jamais servir la mauvaise
   banque).

   Indépendance auteur ≠ code. Les attendus sont DÉRIVÉS :
   - de la GRAMMAIRE et du programme CE2 (ce qu'est un déterminant — article,
     possessif, démonstratif —, un pronom personnel sujet, un adjectif ; ce que le
     CE2 nomme « en bloc » sans sous-catégoriser) ;
   - de la TYPOGRAPHIE française pour l'énumération (« a », « a et b », « a, b et c ») ;
   - de la CONSIGNE lue par l'enfant (une consigne au pluriel oblige la réponse à
     être l'ensemble des mots).
   Les listes de mots ci-dessous (déterminants, pronoms, participes passés
   adjectivaux…) sont RE-ÉCRITES à la main : elles ne sont pas relues du module, si
   bien qu'un garde-fou dont l'ensemble interne serait incomplet est attrapé ici.

   Les garde-fous de construction sont éprouvés DEUX fois, exprès : par leur chemin
   `throw` (les quatre fabriques sont exportées pour ça) ET par leur EFFET sur les
   banques avec des critères re-dérivés — le premier prouve que le garde-fou s'exécute,
   le second attrape un garde-fou dont l'ensemble interne serait trop court.

   Hors périmètre assumé : le RENDU du runner (phrase cliquable, pastilles, live
   region) → smoke Playwright. Seul le VERDICT du widget (booléen d'égalité
   d'ensembles) est éprouvé ici, faute d'existence hors du DOM.
   ============================================================ */
import { afterEach, describe, it, expect } from 'vitest';
import {
	PHRASES_NOM_CE2,
	PHRASES_DET_CE2,
	PHRASES_ADJ_CE2,
	PHRASES_PRON_CE2,
	PHRASES_NOYAU,
	PHRASES_DET,
	PHRASES_PRON,
	PHRASES_CE2,
	PHRASES_CM1,
	CLIC_MOT_LESSONS,
	enumererFr,
	cibleContigue,
	libelleCible,
	joindrePhrase,
	estPonctuation,
	nomsCE2,
	detsCE2,
	adjCE2,
	pronSujetCE2,
	type PhraseClicMot,
} from '../src/data/francais/grammaire-clic-mot';
import { enumererFr as enumererFrCore } from '../src/core/utils';
import { withSeed } from '../src/core/utils';
import { getLessonById, genLessonItem, isClicMotLesson } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import type { Item } from '../src/core/items';
import { consignePourNiveau } from '../src/core/exercise';
import { effectiveLevel, labelLecon, LEVEL_ORDER } from '../src/core/levels';
import { bindClicMot } from '../src/ui/clic-mot-interaction';

const lc = (s: string): string => s.toLowerCase();

/* ---------- Attendus grammaticaux re-dérivés (jamais relus du module) ---------- */

/* Déterminants nommés au CE2, EN BLOC : articles (hors partitifs/contractés),
   possessifs, démonstratifs. */
const DETERMINANTS = new Set(
	(
		'le la les un une des ' +
		'mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs ' +
		'ce cet cette ces'
	).split(' '),
);
/* Déterminants (ou formes homographes) HORS périmètre CE2 : partitifs et contractés,
   « leur » singulier (homographe du pronom complément « je leur parle »), indéfinis et
   numéraux (non nommés au CE2 : présents, ils seraient des déterminants NON ciblés,
   donc une réponse fausse enseignée). */
const DET_HORS_PERIMETRE = new Set(
	(
		'du au aux leur chaque quelques plusieurs certains certaines ' +
		'tout toute tous toutes quel quelle quels quelles ' +
		'deux trois quatre cinq six sept huit neuf dix'
	).split(' '),
);
/* Pronoms personnels sujets, et les pronoms (compléments / toniques) qui n'ont pas à
   apparaître dans une phrase de la leçon CE2 « pronom personnel sujet ». */
const PRON_SUJET = new Set('je tu il elle on nous vous ils elles'.split(' '));
const PRON_NON_CE2 = new Set('me te se lui leur moi toi eux y'.split(' '));
/* Verbes qui rendraient « il » impersonnel (« il pleut ») : ce « il » ne remplace
   personne, il ne peut pas être la cible d'une leçon sur le pronom SUJET. */
const VERBES_IMPERSONNELS = new Set(
	'pleut pleuvait neige neigeait faut fallait gèle fait fera ferait'.split(' '),
);
/* Mots qui INTRODUISENT un nom (déterminants + contractés/partitif + « chaque ») :
   servent à la réciproque « aucun nom oublié dans l'annotation ». */
const INTRODUCTEURS = new Set([...DETERMINANTS, 'au', 'aux', 'du', 'chaque']);
/* Participes passés à valeur adjectivale et formes nom/adjectif ambiguës : hors
   périmètre de la leçon « adjectif » au CE2 (piège du passé composé sans auxiliaire
   visible / de la nationalité substantivée). Liste re-écrite à la main. */
const PARTICIPES_ET_AMBIGUS = new Set(
	(
		'fatigué fatiguée cassé cassée fermé fermée ouvert ouverte rempli remplie ' +
		'mouillé endormi assis allumé éteint rangé rangée perdu cuit brûlé fané ' +
		'français française anglais anglaise italien italienne chinois allemand allemande'
	).split(' '),
);
/* Prépositions et pronoms : jamais un NOM, donc jamais une cible de la leçon « nom ». */
const JAMAIS_UN_NOM = new Set(
	(
		'je tu il elle on nous vous ils elles me te se lui leur moi toi eux y en ' +
		"à au aux de du dans sur sous devant derrière pendant après avant avec pour vers chez jusqu'au par et ou mais donc"
	).split(' '),
);

/* Les quatre banques CE2 de #436. */
const BANQUES_CE2: Array<[string, PhraseClicMot[]]> = [
	['NOM', PHRASES_NOM_CE2],
	['DET', PHRASES_DET_CE2],
	['ADJ', PHRASES_ADJ_CE2],
	['PRON', PHRASES_PRON_CE2],
];
/* Les deux banques à cible PLURIELLE (décision produit : au CE2 on demande TOUS les
   noms / TOUS les déterminants de la phrase). */
const BANQUES_PLURIELLES: Array<[string, PhraseClicMot[]]> = [
	['NOM', PHRASES_NOM_CE2],
	['DET', PHRASES_DET_CE2],
];

const texte = (p: PhraseClicMot): string => joindrePhrase(p.tokens);
const mots = (p: PhraseClicMot): string[] => p.cibleIndices.map((i) => p.tokens[i]);
const cle = (p: { tokens: string[]; cibleIndices: number[] }): string =>
	`${joindrePhrase(p.tokens)} ##${p.cibleIndices.join(',')}`;

/* Toutes les formes d'adjectif employées comme CIBLE dans la banque « adjectif » :
   sert de détecteur de SECOND adjectif (une phrase ne doit pas en contenir deux, la
   cible ne serait plus unique). Dérivé de la DONNÉE (la banque), pas du code. */
const FORMES_ADJECTIF = new Set(PHRASES_ADJ_CE2.map((p) => lc(p.tokens[p.cibleIndices[0]])));

/* ============================================================
   1. Énumération à la française — règle partagée par les deux formateurs.
   ============================================================ */
describe('enumererFr — typographie française de l’énumération (#436)', () => {
	it('« a » / « a et b » / « a, b et c » : virgules jusqu’au dernier, « et » devant lui', () => {
		// Attendus écrits depuis la règle typographique, pas depuis le code.
		expect(enumererFr([])).toBe('');
		expect(enumererFr(['chien'])).toBe('chien');
		expect(enumererFr(['Paul', 'Léa'])).toBe('Paul et Léa');
		expect(enumererFr(['cour', 'enfants', 'ballon'])).toBe('cour, enfants et ballon');
		expect(enumererFr(['la', 'un', 'des', 'ses'])).toBe('la, un, des et ses');
	});

	it('ni « et » répété (ancien bug), ni virgule avant « et »', () => {
		const trois = enumererFr(['cour', 'enfants', 'ballon']);
		expect(trois).not.toBe('cour et enfants et ballon'); // ancien join(' et ')
		expect(trois).not.toContain(', et '); // « cour, enfants, et ballon »
		expect(enumererFr(['Paul', 'Léa'])).not.toContain(','); // deux éléments : pas de virgule
		// Un seul « et », toujours devant le dernier élément.
		expect(enumererFr(['a', 'b', 'c', 'd']).match(/ et /g)?.length).toBe(1);
	});

	it('règle UNIQUE : le module de grammaire ré-exporte celle du cœur, il n’en a pas d’autre', () => {
		// Identité de fonction, pas seulement égalité des sorties : deux implémentations
		// jumelles finiraient par diverger, et la même liste se lirait alors différemment
		// selon l'écran (libellé lu, explication, message de l'espace encadrant).
		expect(enumererFr).toBe(enumererFrCore);
	});
});

describe('libelleCible — trois régimes de jointure (#436)', () => {
	it('cible CONTIGUË : les mots forment UN groupe, joints par une espace', () => {
		// « a mangé » (auxiliaire + participe) est un seul groupe verbal : ni « a et mangé »,
		// ni « a, mangé ».
		expect(libelleCible(['Léa', 'a', 'mangé', 'une', 'pomme', '.'], [1, 2])).toBe('a mangé');
		expect(libelleCible(['Il', 'ne', 'sera', 'pas', 'venu', '.'], [2, 3, 4])).toBe('sera pas venu');
	});

	it('DEUX mots non adjacents : « Paul et Léa » (jamais de virgule)', () => {
		const tokens = ['Paul', 'et', 'Léa', 'jouent', 'ensemble', '.'];
		expect(libelleCible(tokens, [0, 2])).toBe('Paul et Léa');
		expect(libelleCible(tokens, [0, 2])).not.toContain(',');
	});

	it('TROIS mots non adjacents : « cour, enfants et ballon »', () => {
		const tokens = ['Dans', 'la', 'cour', ',', 'les', 'enfants', 'jouent', 'au', 'ballon', '.'];
		expect(libelleCible(tokens, [2, 5, 8])).toBe('cour, enfants et ballon');
		expect(libelleCible(tokens, [2, 5, 8])).not.toBe('cour et enfants et ballon');
	});

	it('cible d’UN mot : le mot seul, sans connecteur', () => {
		expect(libelleCible(['Le', 'chien', 'aboie', '.'], [1])).toBe('chien');
	});

	it('cibleContigue : UN groupe de mots collés vs des mots SÉPARÉS (règle partagée)', () => {
		// Ce prédicat départage les deux consommateurs de la cible : la façon de l'énoncer
		// (espace ou énumération) ET la tolérance de recopie du repli fiche (`motsAttendus`).
		expect(cibleContigue([3])).toBe(true); // un seul mot est un groupe
		expect(cibleContigue([1, 2])).toBe(true); // « a mangé »
		expect(cibleContigue([2, 3, 4])).toBe(true);
		expect(cibleContigue([0, 2])).toBe(false); // « Paul … Léa »
		expect(cibleContigue([2, 5, 8])).toBe(false); // tous les noms d'une phrase
		expect(cibleContigue([1, 2, 4])).toBe(false); // un seul trou suffit
		// Au CE2, TOUTE cible plurielle est faite de mots séparés (aucun groupe collé) : la
		// recopie y est donc toujours tolérante au connecteur.
		for (const [nom, banque] of BANQUES_PLURIELLES) {
			for (const p of banque) {
				expect(cibleContigue(p.cibleIndices), `${nom} « ${texte(p)} »`).toBe(false);
			}
		}
	});

	it('sur les banques CE2 : la jointure suit la contiguïté réelle des indices', () => {
		for (const [nom, banque] of BANQUES_PLURIELLES) {
			for (const p of banque) {
				const lib = libelleCible(p.tokens, p.cibleIndices);
				const contigu = p.cibleIndices.every((v, k) => k === 0 || v === p.cibleIndices[k - 1] + 1);
				const attendu = contigu ? mots(p).join(' ') : enumererFr(mots(p));
				expect(lib, `${nom} « ${texte(p)} »`).toBe(attendu);
				// Aucun « X et Y et Z » ne doit sortir d'une cible à 3 mots.
				if (p.cibleIndices.length >= 3) {
					expect((lib.match(/ et /g) ?? []).length, `${nom} « ${texte(p)} »`).toBe(1);
					expect(lib, `${nom} « ${texte(p)} »`).toContain(', ');
				}
			}
		}
	});

	it('les DEUX formateurs (libellé lu / mots cités dans l’explication) restent d’accord', () => {
		// Intérêt de la règle unique : l'explication cite les mots (« cour », « enfants » et
		// « ballon ») et le libellé lu les énonce nus (cour, enfants et ballon). En retirant
		// les guillemets de l'explication, on doit retrouver EXACTEMENT le libellé — sinon un
		// enfant au lecteur d'écran entend deux énumérations différentes de la même réponse.
		for (const [nom, banque] of BANQUES_PLURIELLES) {
			for (const p of banque) {
				const nu = p.explication.replace(/«\s*/gu, '').replace(/\s*»/gu, '');
				expect(nu, `${nom} « ${texte(p)} »`).toContain(libelleCible(p.tokens, p.cibleIndices));
			}
		}
	});
});

/* ============================================================
   2. Intégrité des quatre banques CE2.
   ============================================================ */
describe('Banques CE2 — taille et cibles bien formées (#436)', () => {
	for (const [nom, banque] of BANQUES_CE2) {
		it(`${nom} : 50 à 100 items, cibles valides, non ponctuées, sans doublon`, () => {
			// Plancher maison des banques de leçon (50-100 items) : en-dessous, l'enfant
			// revoit les mêmes phrases dans la séance.
			expect(banque.length, `${nom} trop courte`).toBeGreaterThanOrEqual(50);
			expect(banque.length, `${nom} trop longue`).toBeLessThanOrEqual(100);
			for (const p of banque) {
				const où = `${nom} « ${texte(p)} »`;
				expect(p.cibleIndices.length, `${où} : cible vide`).toBeGreaterThan(0);
				for (const i of p.cibleIndices) {
					expect(Number.isInteger(i), `${où} : index ${i}`).toBe(true);
					expect(i, où).toBeGreaterThanOrEqual(0);
					expect(i, où).toBeLessThan(p.tokens.length);
					expect(estPonctuation(p.tokens[i]), `${où} : ponctuation ciblée`).toBe(false);
				}
				// Strictement croissant ⇒ trié ET sans doublon d'indice.
				for (let k = 1; k < p.cibleIndices.length; k++) {
					expect(p.cibleIndices[k], `${où} : indices non triés/uniques`).toBeGreaterThan(
						p.cibleIndices[k - 1],
					);
				}
				expect(p.explication.trim().length, `${où} : explication vide`).toBeGreaterThan(0);
				expect((p.consigne ?? '').length, `${où} : consigne par item absente`).toBeGreaterThan(0);
				expect((p.cibleLabel ?? '').length, `${où} : cibleLabel absent`).toBeGreaterThan(0);
				// Chaque mot ciblé apparaît dans la phrase autant de fois qu'il est ciblé :
				// aucune occurrence « fantôme » non cliquée (réponse ambiguë).
				const attendu = new Map<string, number>();
				for (const m of mots(p)) attendu.set(lc(m), (attendu.get(lc(m)) ?? 0) + 1);
				for (const [m, n] of attendu) {
					expect(p.tokens.filter((t) => lc(t) === m).length, `${où} : « ${m} »`).toBe(n);
				}
			}
			const cles = banque.map(cle);
			expect(new Set(cles).size, `${nom} : doublon (phrase, cible)`).toBe(cles.length);
		});
	}

	it('cible PLURIELLE (≥ 2 mots) pour nom et déterminant, UNIQUE pour adjectif et pronom', () => {
		// La consigne au pluriel (« tous les noms ») serait mensongère sur une phrase à un
		// seul nom ; à l'inverse, l'adjectif est facultatif dans le groupe nominal, une
		// phrase à un seul adjectif est naturelle.
		for (const [nom, banque] of BANQUES_PLURIELLES) {
			for (const p of banque) {
				expect(p.cibleIndices.length, `${nom} « ${texte(p)} »`).toBeGreaterThanOrEqual(2);
			}
		}
		for (const p of PHRASES_ADJ_CE2) expect(p.cibleIndices.length, texte(p)).toBe(1);
		for (const p of PHRASES_PRON_CE2) expect(p.cibleIndices.length, texte(p)).toBe(1);
	});

	it('position de la cible VARIÉE : jamais « le premier mot » comme stratégie', () => {
		for (const [nom, banque] of BANQUES_CE2) {
			const debuts = banque.map((p) => Math.min(...p.cibleIndices));
			expect(new Set(debuts).size, `${nom} : positions trop uniformes`).toBeGreaterThanOrEqual(4);
			// « Cliquer le premier mot » ne doit jamais être une stratégie gagnante : STRICTEMENT
			// moins de la moitié des items. (Mesuré : nom 6/55 = 11 %, déterminant 23/54 = 43 %,
			// adjectif 0/60, pronom sujet 27/62 = 44 %.)
			const enTete = debuts.filter((d) => d === 0).length;
			expect(enTete, `${nom} : ${enTete}/${banque.length} items ciblent le 1er mot`).toBeLessThan(
				banque.length / 2,
			);
			// …et la cible se trouve parfois loin du début (complément en tête, attribut).
			expect(
				debuts.some((d) => d >= 3),
				`${nom} : cible jamais éloignée du début`,
			).toBe(true);
		}
		// L'adjectif n'ouvre JAMAIS une phrase (il suit un déterminant, un nom ou « être »).
		expect(Math.min(...PHRASES_ADJ_CE2.map((p) => p.cibleIndices[0]))).toBeGreaterThan(0);
	});
});

/* ============================================================
   3. Garde-fous, éprouvés par leur EFFET (critères re-dérivés).
   ============================================================ */
describe('Déterminants CE2 — périmètre et non-ambiguïté (#436)', () => {
	it('la cible est EXACTEMENT l’ensemble des déterminants de la phrase (aucun oubli)', () => {
		for (const p of PHRASES_DET_CE2) {
			const attendus = p.tokens
				.map((t, i) => [t, i] as const)
				.filter(([t]) => DETERMINANTS.has(lc(t)))
				.map(([, i]) => i);
			expect(p.cibleIndices, `DET « ${texte(p)} »`).toEqual(attendus);
		}
	});

	it('aucun partitif / contracté (du, au, aux), aucun « leur » singulier, aucun numéral', () => {
		for (const p of PHRASES_DET_CE2) {
			for (const t of p.tokens) {
				expect(
					DET_HORS_PERIMETRE.has(lc(t)),
					`DET « ${texte(p)} » : « ${t} » hors périmètre CE2`,
				).toBe(false);
			}
		}
	});

	it('aucun article élidé « l’… » (soudé au nom, il ne serait plus cliquable seul)', () => {
		for (const p of PHRASES_DET_CE2) {
			for (const t of p.tokens) {
				expect(/^l'/iu.test(t), `DET « ${texte(p)} » : « ${t} » élidé`).toBe(false);
			}
		}
	});

	it('« ce » n’est jamais le PRONOM (« Ce sont… », « Ce n’est pas… »)', () => {
		const ETRE_AVOIR = new Set('est sont était étaient sera seront a ont avait avaient'.split(' '));
		for (const p of PHRASES_DET_CE2) {
			p.tokens.forEach((t, i) => {
				if (lc(t) !== 'ce') return;
				expect(
					ETRE_AVOIR.has(lc(p.tokens[i + 1] ?? '')),
					`DET « ${texte(p)} » : « ce ${p.tokens[i + 1]} » = pronom`,
				).toBe(false);
			});
		}
	});

	it('aucun « le/la/les » PRONOM COMPLÉMENT pris pour un déterminant (« je le vois »)', () => {
		for (const p of PHRASES_DET_CE2) {
			for (const i of p.cibleIndices) {
				expect(
					PRON_SUJET.has(lc(p.tokens[i - 1] ?? '')),
					`DET « ${texte(p)} » : « ${p.tokens[i - 1]} ${p.tokens[i]} »`,
				).toBe(false);
			}
		}
	});
});

describe('Noms CE2 — tous les noms, et rien qu’eux (#436)', () => {
	it('aucune cible n’est un déterminant, un pronom, une préposition ou un adjectif', () => {
		for (const p of PHRASES_NOM_CE2) {
			for (const m of mots(p)) {
				const b = lc(m);
				expect(DETERMINANTS.has(b), `NOM « ${texte(p)} » : « ${m} » déterminant`).toBe(false);
				expect(JAMAIS_UN_NOM.has(b), `NOM « ${texte(p)} » : « ${m} » pronom/préposition`).toBe(
					false,
				);
				expect(FORMES_ADJECTIF.has(b), `NOM « ${texte(p)} » : « ${m} » adjectif`).toBe(false);
			}
		}
	});

	it('RÉCIPROQUE : tout introducteur de nom est suivi d’un nom CIBLÉ (aucun nom oublié)', () => {
		// Le vrai risque de la cible plurielle : un nom laissé hors de l'annotation
		// deviendrait une « mauvaise réponse » alors que l'enfant a raison de le cliquer.
		for (const p of PHRASES_NOM_CE2) {
			const cible = new Set(p.cibleIndices);
			p.tokens.forEach((t, j) => {
				if (!INTRODUCTEURS.has(lc(t))) return;
				const suivi = [1, 2, 3].some((d) => cible.has(j + d));
				expect(suivi, `NOM « ${texte(p)} » : « ${t} » n'introduit aucun nom ciblé`).toBe(true);
			});
		}
	});

	it('chaque nom ciblé est introduit par un déterminant OU est un nom propre', () => {
		for (const p of PHRASES_NOM_CE2) {
			for (const i of p.cibleIndices) {
				const propre = /^\p{Lu}/u.test(p.tokens[i]);
				const introduit = p.tokens
					.slice(Math.max(0, i - 3), i)
					.some((t) => INTRODUCTEURS.has(lc(t)));
				expect(
					propre || introduit,
					`NOM « ${texte(p)} » : « ${p.tokens[i]} » sans introducteur`,
				).toBe(true);
			}
		}
	});

	it('aucun mot élidé « l’… » / « d’… » (le nom ne serait plus cliquable seul)', () => {
		for (const p of PHRASES_NOM_CE2) {
			for (const t of p.tokens) {
				expect(/^[ld]'/iu.test(t), `NOM « ${texte(p)} » : « ${t} » élidé`).toBe(false);
			}
		}
	});

	it('le nom PROPRE compte comme un nom, et l’explication le dit (accord au nombre)', () => {
		// Simplification assumée au CE2 : « Léa » est un nom. L'explication doit le RAPPELER
		// dès qu'un nom propre est ciblé, et s'accorder au nombre de noms propres cités.
		let avecPropre = 0;
		for (const p of PHRASES_NOM_CE2) {
			const propres = mots(p).filter((m) => /^\p{Lu}/u.test(m));
			if (!propres.length) {
				expect(p.explication, `NOM « ${texte(p)} »`).not.toContain('nom propre');
				continue;
			}
			avecPropre++;
			const attendu = propres.length === 1 ? 'Un nom propre' : 'Des noms propres';
			expect(p.explication, `NOM « ${texte(p)} »`).toContain(attendu);
			for (const m of propres) expect(p.explication, `NOM « ${texte(p)} »`).toContain(m);
		}
		expect(avecPropre, 'aucun nom propre dans la banque').toBeGreaterThan(0);
		// Une phrase à DEUX noms propres existe (le rappel au pluriel n'est pas du code mort).
		expect(PHRASES_NOM_CE2.some((p) => mots(p).filter((m) => /^\p{Lu}/u.test(m)).length >= 2)).toBe(
			true,
		);
	});
});

describe('Pronom personnel sujet CE2 — un seul rôle enseigné (#436)', () => {
	it('la cible est un pronom SUJET, et c’est le seul de la phrase', () => {
		for (const p of PHRASES_PRON_CE2) {
			const cible = lc(p.tokens[p.cibleIndices[0]]);
			expect(PRON_SUJET.has(cible), `PRON « ${texte(p)} » : « ${cible} »`).toBe(true);
			const sujets = p.tokens.filter((t) => PRON_SUJET.has(lc(t)));
			expect(sujets.length, `PRON « ${texte(p)} » : ${sujets.join(', ')}`).toBe(1);
		}
	});

	it('aucun pronom COMPLÉMENT ni tonique (me, te, se, lui, leur, moi, toi, eux, y)', () => {
		for (const p of PHRASES_PRON_CE2) {
			for (const t of p.tokens) {
				expect(PRON_NON_CE2.has(lc(t)), `PRON « ${texte(p)} » : « ${t} » hors CE2`).toBe(false);
			}
		}
	});

	it('aucun « il » impersonnel (« il pleut », « il faut ») : le pronom remplace quelqu’un', () => {
		for (const p of PHRASES_PRON_CE2) {
			const i = p.cibleIndices[0];
			expect(
				VERBES_IMPERSONNELS.has(lc(p.tokens[i + 1] ?? '')),
				`PRON « ${texte(p)} » : cible impersonnelle`,
			).toBe(false);
		}
	});

	it('les neuf pronoms sujets sont travaillés', () => {
		const vus = new Set(PHRASES_PRON_CE2.map((p) => lc(p.tokens[p.cibleIndices[0]])));
		expect([...vus].sort()).toEqual([...PRON_SUJET].sort());
	});
});

describe('Adjectif CE2 — cible unique et non ambiguë (#436)', () => {
	it('aucun participe passé adjectival ni forme nom/adjectif ambiguë, ciblé ou présent', () => {
		for (const p of PHRASES_ADJ_CE2) {
			for (const t of p.tokens) {
				expect(
					PARTICIPES_ET_AMBIGUS.has(lc(t)),
					`ADJ « ${texte(p)} » : « ${t} » participe/forme ambiguë`,
				).toBe(false);
			}
		}
	});

	it('aucun SECOND adjectif dans la phrase (la cible resterait-elle unique ?)', () => {
		for (const p of PHRASES_ADJ_CE2) {
			const i = p.cibleIndices[0];
			p.tokens.forEach((t, k) => {
				if (k === i) return;
				expect(FORMES_ADJECTIF.has(lc(t)), `ADJ « ${texte(p)} » : « ${t} » adjectif aussi`).toBe(
					false,
				);
			});
		}
	});

	it('aucun adverbe en « -ment » de la même famille que l’adjectif visé', () => {
		for (const p of PHRASES_ADJ_CE2) {
			const i = p.cibleIndices[0];
			const rad = lc(p.tokens[i]).replace(/e?s?$/u, '');
			p.tokens.forEach((t, k) => {
				if (k === i || rad.length < 3) return;
				const b = lc(t);
				expect(
					b.endsWith('ment') && b.startsWith(rad),
					`ADJ « ${texte(p)} » : « ${t} » famille de « ${p.tokens[i]} »`,
				).toBe(false);
			});
		}
	});

	it('les trois positions sont travaillées : après le nom, avant le nom, attribut', () => {
		const attribut = PHRASES_ADJ_CE2.filter((p) =>
			['est', 'sont'].includes(lc(p.tokens[p.cibleIndices[0] - 1] ?? '')),
		);
		expect(attribut.length, 'aucun adjectif attribut').toBeGreaterThan(5);
		expect(attribut.length, 'que des attributs').toBeLessThan(PHRASES_ADJ_CE2.length / 2);
		// Un adjectif épithète ANTÉPOSÉ : précédé d'un déterminant et suivi d'un autre mot.
		const antepose = PHRASES_ADJ_CE2.filter((p) => {
			const i = p.cibleIndices[0];
			return DETERMINANTS.has(lc(p.tokens[i - 1] ?? '')) && !estPonctuation(p.tokens[i + 1] ?? '.');
		});
		expect(antepose.length, 'aucun adjectif avant le nom').toBeGreaterThan(5);
	});
});

/* ============================================================
   4. Génération : branchement de niveau, déterminisme, non-régression CM1.
   ============================================================ */
const CE2_NATURES: Array<{ id: string; ce2: PhraseClicMot[]; cm1?: PhraseClicMot[] }> = [
	{ id: 'fr-gram-clic-noyau', ce2: PHRASES_NOM_CE2, cm1: PHRASES_NOYAU },
	{ id: 'fr-gram-clic-det', ce2: PHRASES_DET_CE2, cm1: PHRASES_DET },
	{ id: 'fr-gram-clic-pron', ce2: PHRASES_PRON_CE2, cm1: PHRASES_PRON },
	{ id: 'fr-gram-clic-adj', ce2: PHRASES_ADJ_CE2 },
];

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	expect(l, `leçon ${id} absente du catalogue`).toBeDefined();
	return l!;
};

describe('Génération par niveau — jamais la banque de l’autre classe (#436)', () => {
	for (const { id, ce2, cm1 } of CE2_NATURES) {
		it(`${id} : 300 tirages au CE2 restent dans la banque CE2`, () => {
			const type = lecon(id).exerciseType;
			const membres = new Set(ce2.map(cle));
			for (let i = 0; i < 300; i++) {
				const ex = type.generate({ level: 'ce2' });
				expect(ex.type).toBe('clicMot');
				if (ex.type !== 'clicMot') continue;
				expect(
					membres.has(cle(ex)),
					`${id} : item hors banque CE2 « ${joindrePhrase(ex.tokens)} »`,
				).toBe(true);
				expect(ex.parle).toBe(joindrePhrase(ex.tokens));
				expect(ex.consigne.length).toBeGreaterThan(0);
				expect((ex.cibleLabel ?? '').length).toBeGreaterThan(0);
				// Le runner corrige ; le check du type ne valide JAMAIS une saisie.
				expect(type.check(ex, libelleCible(ex.tokens, ex.cibleIndices))).toBe(false);
			}
		});

		it(`${id} : sans niveau, on sert le CE2 (jamais du contenu CM1 par défaut)`, () => {
			const type = lecon(id).exerciseType;
			const membres = new Set(ce2.map(cle));
			for (let i = 0; i < 200; i++) {
				const ex = type.generate();
				if (ex.type !== 'clicMot') continue;
				expect(membres.has(cle(ex)), `${id} : repli hors banque CE2`).toBe(true);
			}
		});

		if (cm1) {
			it(`${id} : NON-RÉGRESSION — 300 tirages au CM1 restent dans la banque CM1`, () => {
				const type = lecon(id).exerciseType;
				const membres = new Set(cm1.map(cle));
				for (let i = 0; i < 300; i++) {
					const ex = type.generate({ level: 'cm1' });
					if (ex.type !== 'clicMot') continue;
					expect(membres.has(cle(ex)), `${id} : item CE2 servi au CM1`).toBe(true);
				}
			});
		}
	}

	it('niveau NON DÉCLARÉ : la banque suit le repli/clamp du moteur, comme le libellé', () => {
		// Une leçon CE2+CM1 interrogée à un niveau qu'elle ne sert pas doit recevoir la
		// variante du niveau vers lequel le catalogue la replie (`effectiveLevel`) : sinon le
		// titre annonce une classe et le contenu une autre.
		const noyau = lecon('fr-gram-clic-noyau');
		const dansLaBanque = (level: SchoolLevel, banque: PhraseClicMot[]): void => {
			const membres = new Set(banque.map(cle));
			for (let i = 0; i < 150; i++) {
				const ex = noyau.exerciseType.generate({ level });
				if (ex.type !== 'clicMot') continue;
				expect(membres.has(cle(ex)), `noyau@${level} : « ${joindrePhrase(ex.tokens)} »`).toBe(true);
			}
		};
		// CM2 / 6e : repli vers le CM1 (le plus haut niveau servi en-dessous).
		expect(effectiveLevel(noyau, 'cm2')).toBe('cm1');
		dansLaBanque('cm2', PHRASES_NOYAU);
		dansLaBanque('6e', PHRASES_NOYAU);
		// CP / CE1 : clamp vers le CE2 (la leçon est entièrement au-dessus).
		expect(effectiveLevel(noyau, 'cp')).toBe('ce2');
		dansLaBanque('cp', PHRASES_NOM_CE2);
		dansLaBanque('ce1', PHRASES_NOM_CE2);
		// Même patron pour la leçon « verbe » (deux niveaux, sans variante nommée `ce2`) :
		// au CM2 elle sert le CM1, donc peut tirer une cible de DEUX mots (passé composé).
		const verbe = lecon('fr-gram-clic-verbe');
		const membresCM1 = new Set(PHRASES_CM1.map(cle));
		const membresCE2 = new Set(PHRASES_CE2.map(cle));
		for (let i = 0; i < 150; i++) {
			const haut = verbe.exerciseType.generate({ level: 'cm2' });
			if (haut.type === 'clicMot') expect(membresCM1.has(cle(haut))).toBe(true);
			const bas = verbe.exerciseType.generate({ level: 'cp' });
			if (bas.type === 'clicMot') {
				expect(membresCE2.has(cle(bas))).toBe(true);
				expect(bas.cibleIndices.length).toBe(1); // banque CE2 : temps simples
			}
		}
	});

	it('LIBELLÉ, CONSIGNE et BANQUE résolus par le MÊME niveau, à tous les niveaux', () => {
		// L'invariant qui empêche « titre CM1 sur contenu CE2 » : à un niveau quelconque, ce
		// qui est servi doit être exactement ce qui est servi au niveau EFFECTIF de la leçon.
		for (const l of CLIC_MOT_LESSONS.map((x) => lecon(x.id))) {
			for (const niveau of LEVEL_ORDER) {
				const eff = effectiveLevel(l, niveau);
				expect(labelLecon(l, niveau), `${l.id}@${niveau} : libellé`).toBe(labelLecon(l, eff));
				expect(consignePourNiveau(l.exerciseType, niveau), `${l.id}@${niveau} : consigne`).toBe(
					consignePourNiveau(l.exerciseType, eff),
				);
			}
		}
	});

	it('déterminisme : même graine ⇒ item identique, graines variées ⇒ items variés', () => {
		for (const { id } of CE2_NATURES) {
			const type = lecon(id).exerciseType;
			for (const seed of [4, 19, 77, 333]) {
				const a = withSeed(seed, () => type.generate({ level: 'ce2' }));
				const b = withSeed(seed, () => type.generate({ level: 'ce2' }));
				expect(b, `${id}@${seed}`).toEqual(a);
			}
			const vus = new Set<string>();
			for (let seed = 1; seed <= 20; seed++) {
				vus.add(withSeed(seed, () => JSON.stringify(type.generate({ level: 'ce2' }))));
			}
			expect(vus.size, `${id} : générateur figé ?`).toBeGreaterThan(1);
		}
	});

	it('NON-RÉGRESSION : les banques CM1 et la leçon « verbe » n’ont pas bougé', () => {
		// Témoins lus dans les banques CM1 : #436 ne devait ni retirer ni réétiqueter un item.
		const noyau = PHRASES_NOYAU.find((p) => texte(p) === 'Le petit chat noir dort profondément.');
		expect(noyau, 'phrase témoin du nom noyau CM1 absente').toBeDefined();
		expect(mots(noyau!)).toEqual(['chat']); // le nom NOYAU, pas tous les noms
		const det = PHRASES_DET.filter((p) => texte(p) === 'Ce chien mange sa gamelle et un os.');
		expect(det.length, 'les 3 sous-catégories du déterminant CM1').toBe(3);
		expect(det.map((p) => mots(p)[0])).toEqual(['Ce', 'sa', 'un']); // cible UNIQUE par item
		const pron = PHRASES_PRON.filter((p) => texte(p) === 'Il lui offre un joli cadeau.');
		expect(pron.map((p) => mots(p)[0])).toEqual(['Il', 'lui']);
		// La leçon « verbe » garde ses deux banques et sa cible d'un seul mot au CE2.
		expect(PHRASES_CM1.length).toBeGreaterThan(PHRASES_CE2.length);
		for (const p of PHRASES_CE2) expect(p.cibleIndices.length, texte(p)).toBe(1);
	});
});

describe('Catalogue — les leçons CE2 de #436', () => {
	it('« Clique sur l’adjectif » : leçon NEUVE, grammaire française, CE2 seulement', () => {
		const def = lecon('fr-gram-clic-adj');
		expect(def.subject).toBe('francais');
		expect(def.category).toBe('fr-grammaire');
		expect(def.levels).toEqual(['ce2']); // l'adjectif reste hors du CM1
		expect(def.label).toBe("Clique sur l'adjectif"); // apostrophe DROITE (choix acté)
		expect(def.exerciseType.exerciseKind).toBe('clicMot');
		expect(isClicMotLesson(def)).toBe(true);
		expect(CLIC_MOT_LESSONS.map((l) => l.id)).toContain('fr-gram-clic-adj');
	});

	it('nom / déterminant / pronom sont servis aux DEUX niveaux', () => {
		for (const id of ['fr-gram-clic-noyau', 'fr-gram-clic-det', 'fr-gram-clic-pron']) {
			expect(lecon(id).levels, id).toEqual(['ce2', 'cm1']);
		}
	});

	it('les natures CM1 seules ne descendent PAS au CE2', () => {
		expect(lecon('fr-gram-clic-conj').levels).toEqual(['cm1']);
		expect(lecon('fr-gram-clic-sujet').levels).toEqual(['cm1']);
	});
});

/* ============================================================
   5. Correction de la cible plurielle : égalité d'ensembles.
   ============================================================ */
describe('Correction — égalité d’ensembles exacte (cible plurielle, #436)', () => {
	/* Le verdict est rendu par le widget partagé (`bindClicMot`), seul détenteur de la
	   règle : on l'éprouve ici sur son BOOLÉEN, pas sur son rendu (rendu = e2e). */
	const TOKENS = ['Dans', 'la', 'cour', ',', 'les', 'enfants', 'jouent', 'au', 'ballon', '.'];
	const CIBLE = [2, 5, 8]; // cour, enfants, ballon

	function monter(tokens = TOKENS, cibleIndices = CIBLE) {
		const root = document.createElement('div');
		root.innerHTML = '<div data-tuile-mount></div>';
		document.body.appendChild(root);
		const ctrl = bindClicMot(root, { tokens, cibleIndices }, { onState: () => {} });
		const cliquer = (...indices: number[]) => {
			for (const i of indices) {
				const btn = root.querySelector<HTMLButtonElement>(`.lclic-mot[data-i="${i}"]`);
				if (!btn) throw new Error(`mot d'indice ${i} non cliquable`);
				btn.click();
			}
		};
		return { ctrl, cliquer };
	}

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('tous les mots-cibles cliqués ⇒ juste, dans N’IMPORTE quel ordre', () => {
		const gauche = monter();
		gauche.cliquer(2, 5, 8); // ordre de lecture
		expect(gauche.ctrl.verify()).toBe(true);
		const droite = monter();
		droite.cliquer(8, 2, 5); // ordre quelconque : même réponse
		expect(droite.ctrl.verify()).toBe(true);
	});

	it('un mot-cible OUBLIÉ ⇒ faux', () => {
		const { ctrl, cliquer } = monter();
		cliquer(2, 5);
		expect(ctrl.verify()).toBe(false);
	});

	it('un mot EN TROP ⇒ faux (même avec toute la cible)', () => {
		const { ctrl, cliquer } = monter();
		cliquer(2, 5, 8, 1);
		expect(ctrl.verify()).toBe(false);
	});

	it('aucune sélection ⇒ faux ; la ponctuation n’est même pas cliquable', () => {
		const { ctrl } = monter();
		expect(ctrl.verify()).toBe(false);
		const { cliquer } = monter();
		expect(() => cliquer(3)).toThrow(); // la virgule (index 3) n'est pas un bouton
	});

	it('désélectionner un mot le retire de la réponse (sélection réversible)', () => {
		const { ctrl, cliquer } = monter();
		cliquer(2, 5, 8, 8); // le 2e clic sur « ballon » le désélectionne
		expect(ctrl.selected()).toEqual([2, 5]);
		expect(ctrl.verify()).toBe(false);
	});

	it('verdict IDEMPOTENT : un second verify ne change pas la note', () => {
		const { ctrl, cliquer } = monter();
		cliquer(2, 5, 8);
		expect(ctrl.verify()).toBe(true);
		expect(ctrl.verify()).toBe(true);
	});

	it('sur un item RÉEL de la banque CE2 : l’ensemble stocké est la bonne réponse', () => {
		const p = PHRASES_DET_CE2.find((x) => texte(x) === 'Sur la table, un vase attend des fleurs.');
		expect(p, 'phrase témoin absente de la banque déterminants').toBeDefined();
		const { ctrl, cliquer } = monter(p!.tokens, p!.cibleIndices);
		cliquer(...[...p!.cibleIndices].reverse());
		expect(ctrl.verify()).toBe(true);
	});
});

/* ============================================================
   6. Repli non interactif (fiche / bilan) au CE2.
   ============================================================ */
/* Balaie les graines jusqu'à tirer l'item dont la phrase montrée est `cible`, et rend
   l'Item du repli pour CET item connu : permet des attendus LITTÉRAUX écrits à la main. */
function itemPourPhrase(lesson: LessonDef, level: SchoolLevel, cible: string): Item | undefined {
	for (let seed = 0; seed < 6000; seed++) {
		const ex = withSeed(seed, () => lesson.exerciseType.generate({ level }));
		if (ex.type !== 'clicMot') continue;
		if (joindrePhrase(ex.tokens) === cible)
			return withSeed(seed, () => genLessonItem(lesson, level));
	}
	return undefined;
}

describe('Repli non interactif au CE2 — recopie de la cible (#436)', () => {
	it('la réponse STOCKÉE énumère les mots à la française (attendus littéraux)', () => {
		// Attendus écrits à la main en lisant la phrase : « tous les noms » de
		// « Dans la cour, les enfants jouent au ballon. » = cour, enfants, ballon.
		const noms = lecon('fr-gram-clic-noyau');
		expect(itemPourPhrase(noms, 'ce2', 'Dans la cour, les enfants jouent au ballon.')?.answer).toBe(
			'cour, enfants et ballon',
		);
		expect(itemPourPhrase(noms, 'ce2', 'Le chien mange sa gamelle.')?.answer).toBe(
			'chien et gamelle',
		);
		expect(itemPourPhrase(noms, 'ce2', 'Paul et Léa partagent un goûter.')?.answer).toBe(
			'Paul, Léa et goûter',
		);
		// MÊME phrase, leçon « déterminant » : la réponse change de cible.
		const dets = lecon('fr-gram-clic-det');
		expect(itemPourPhrase(dets, 'ce2', 'Le chien mange sa gamelle.')?.answer).toBe('Le et sa');
		expect(itemPourPhrase(dets, 'ce2', 'Sur la table, un vase attend des fleurs.')?.answer).toBe(
			'la, un et des',
		);
		// Cible unique : le mot seul, sans connecteur.
		expect(
			itemPourPhrase(lecon('fr-gram-clic-adj'), 'ce2', 'Le ciel est gris ce matin.')?.answer,
		).toBe('gris');
		expect(
			itemPourPhrase(lecon('fr-gram-clic-pron'), 'ce2', 'Chaque matin, il promène son chien.')
				?.answer,
		).toBe('il');
	});

	it('l’énoncé montre la phrase, nomme la cible au bon NOMBRE et ouvre un champ', () => {
		const noms = lecon('fr-gram-clic-noyau');
		const ce2 = itemPourPhrase(noms, 'ce2', 'Le chien mange sa gamelle.')!;
		expect(ce2.kind).toBe('text');
		expect(ce2.text).toContain('Le chien mange sa gamelle.');
		expect(ce2.text).toContain('les noms'); // cible PLURIELLE ⇒ libellé au pluriel
		expect(ce2.text.trim().endsWith('@')).toBe(true); // sans « @ », aucun champ de saisie
		expect(ce2.parle).toBe('Recopie les noms. Le chien mange sa gamelle.');
		expect(ce2._lesson).toBe('fr-gram-clic-noyau');
		// Au CM1, la même leçon nomme le NOYAU (vocabulaire de la classe) et sa cible est unique.
		const cm1 = itemPourPhrase(noms, 'cm1', 'Le petit chat noir dort profondément.')!;
		expect(cm1.text).toContain('le nom noyau');
		expect(cm1.answer).toBe('chat');
	});

	it('échantillon large : jamais d’exception, jamais de réponse vide (4 leçons × 120)', () => {
		for (const { id } of CE2_NATURES) {
			const l = lecon(id);
			for (let i = 0; i < 120; i++) {
				const seed = i * 11 + 5;
				const item = withSeed(seed, () => genLessonItem(l, 'ce2'));
				const ex = withSeed(seed, () => l.exerciseType.generate({ level: 'ce2' }));
				if (ex.type !== 'clicMot') continue;
				expect(String(item.answer).length, `${id}@${seed}`).toBeGreaterThan(0);
				// La réponse cite TOUS les mots-cibles (aucun oublié par la jointure).
				for (const m of ex.cibleIndices.map((k) => ex.tokens[k])) {
					expect(String(item.answer), `${id}@${seed} : « ${m} » absent`).toContain(m);
				}
			}
		}
	});
});

/* ============================================================
   7. `explicationNommeCible` — propagation depuis la donnée.
   ============================================================ */
describe('explicationNommeCible — drapeau porté par la donnée (#436)', () => {
	it('posé sur les DEUX banques à cible plurielle, absent partout ailleurs', () => {
		for (const [nom, banque] of BANQUES_PLURIELLES) {
			for (const p of banque) expect(p.explicationNommeCible, `${nom} « ${texte(p)} »`).toBe(true);
		}
		for (const banque of [PHRASES_ADJ_CE2, PHRASES_PRON_CE2, PHRASES_CE2, PHRASES_NOYAU]) {
			for (const p of banque) expect(p.explicationNommeCible, texte(p)).toBeUndefined();
		}
	});

	it('quand il est posé, l’explication CITE réellement chaque mot-cible', () => {
		// Sans cette garantie, la région live se tairait sur la réponse : un enfant au
		// lecteur d'écran n'aurait AUCUN canal pour l'apprendre.
		for (const [nom, banque] of BANQUES_CE2) {
			for (const p of banque) {
				if (!p.explicationNommeCible) continue;
				for (const m of mots(p)) {
					expect(p.explication, `${nom} « ${texte(p)} » : « ${m} » non cité`).toContain(m);
				}
			}
		}
	});

	it('propagé jusqu’à l’exercice généré, et JAMAIS au CM1 (cible unique)', () => {
		for (const id of ['fr-gram-clic-noyau', 'fr-gram-clic-det']) {
			const type = lecon(id).exerciseType;
			for (let i = 0; i < 60; i++) {
				const ce2 = type.generate({ level: 'ce2' });
				if (ce2.type === 'clicMot') expect(ce2.explicationNommeCible, `${id}@ce2`).toBe(true);
				const cm1 = type.generate({ level: 'cm1' });
				if (cm1.type === 'clicMot') expect(cm1.explicationNommeCible, `${id}@cm1`).toBeUndefined();
			}
		}
		for (const id of ['fr-gram-clic-adj', 'fr-gram-clic-pron', 'fr-gram-clic-verbe']) {
			const type = lecon(id).exerciseType;
			for (let i = 0; i < 30; i++) {
				const ex = type.generate({ level: 'ce2' });
				if (ex.type === 'clicMot') expect(ex.explicationNommeCible, id).toBeUndefined();
			}
		}
	});
});

/* ============================================================
   8. Garde-fous de construction : les chemins `throw` (données AUTEUR).
   ------------------------------------------------------------
   Chaque cas est une PAIRE (phrase FAUTIVE qui lève, phrase RÉPARÉE qui ne lève pas),
   la réparation ne touchant QUE le point fautif. C'est ce qui prouve que le `throw`
   vient bien de la règle visée — sans coupler le test au texte du message d'erreur, et
   sans qu'un « ça lève » fortuit (une autre règle enfreinte au passage) puisse faire
   passer le test pour la mauvaise raison.
   ============================================================ */
describe('Garde-fous « noms CE2 » — entrées auteur invalides (#436)', () => {
	it('refuse une phrase à UN SEUL nom (la consigne parle de TOUS les noms)', () => {
		expect(() => nomsCE2('Le chien aboie très fort.', ['chien'])).toThrow();
		expect(() => nomsCE2('Le chien mange sa gamelle.', ['chien', 'gamelle'])).not.toThrow();
	});

	it('refuse un mot élidé (« l’oiseau », « d’Anna ») : le nom n’est plus cliquable seul', () => {
		expect(() => nomsCE2("L'oiseau protège ses petits.", ['oiseau', 'petits'])).toThrow();
		expect(() => nomsCE2('Cet oiseau protège ses petits.', ['oiseau', 'petits'])).not.toThrow();
		expect(() =>
			nomsCE2("Le chien d'Anna mange sa gamelle.", ['chien', 'Anna', 'gamelle']),
		).toThrow();
	});

	it('refuse un nom sans déterminant (« en classe ») qui n’est pas un nom propre', () => {
		expect(() => nomsCE2('Léa va en classe avec Paul.', ['Léa', 'classe', 'Paul'])).toThrow();
		expect(() =>
			nomsCE2('Léa va dans sa classe avec Paul.', ['Léa', 'classe', 'Paul']),
		).not.toThrow();
	});

	it('refuse un nom OUBLIÉ dans l’annotation (réciproque : un introducteur sans cible)', () => {
		// Le vrai risque de la cible plurielle : « ballon » resterait cliquable mais compté faux.
		expect(() =>
			nomsCE2('Dans la cour, les enfants jouent au ballon.', ['cour', 'enfants']),
		).toThrow();
		expect(() =>
			nomsCE2('Dans la cour, les enfants jouent au ballon.', ['cour', 'enfants', 'ballon']),
		).not.toThrow();
	});
});

describe('Garde-fous « déterminants CE2 » — entrées auteur invalides (#436)', () => {
	it('refuse un partitif ou un contracté (du / au / aux)', () => {
		expect(() => detsCE2('Le petit chat boit du lait.')).toThrow();
		expect(() => detsCE2('Le petit chat boit son lait.')).not.toThrow();
		expect(() => detsCE2('Le chien joue au ballon avec sa balle.')).toThrow();
		expect(() => detsCE2('Le chien joue avec sa balle.')).not.toThrow();
	});

	it('refuse les déterminants non nommés au CE2 (« chaque », un numéral)', () => {
		expect(() => detsCE2('Chaque matin, le coq réveille la ferme.')).toThrow();
		expect(() => detsCE2('Ce matin, le coq réveille la ferme.')).not.toThrow();
		expect(() => detsCE2('Les deux chiens gardent la maison.')).toThrow();
		expect(() => detsCE2('Les chiens gardent la maison.')).not.toThrow();
	});

	it('refuse « leur » SINGULIER (homographe du pronom), accepte « leurs »', () => {
		expect(() => detsCE2('Les enfants leur montrent la cour.')).toThrow();
		expect(() => detsCE2('Les enfants montrent leurs dessins.')).not.toThrow();
	});

	it('refuse un article élidé (« l’oiseau » : il n’est plus cliquable)', () => {
		expect(() => detsCE2("L'oiseau protège ses petits.")).toThrow();
		expect(() => detsCE2('Cet oiseau protège ses petits.')).not.toThrow();
	});

	it('refuse une phrase à UN SEUL déterminant (consigne au pluriel)', () => {
		expect(() => detsCE2('Paul mange le pain.')).toThrow();
		expect(() => detsCE2('Paul mange le pain de sa sœur.')).not.toThrow();
	});

	it('refuse « ce » PRONOM (« Ce sont… ») pris pour un déterminant', () => {
		expect(() => detsCE2('Ce sont mes livres et ses cahiers.')).toThrow();
		expect(() => detsCE2('Ce livre est à mes cousins.')).not.toThrow();
	});

	it('refuse « le/la/les » PRONOM COMPLÉMENT derrière un pronom sujet (« je le vois »)', () => {
		expect(() => detsCE2('Je le vois avec mes amis.')).toThrow();
		expect(() => detsCE2('Je vois le chien de mes amis.')).not.toThrow();
	});
});

describe('Garde-fous « adjectif CE2 » — entrées auteur invalides (#436)', () => {
	it('refuse un participe passé adjectival comme CIBLE (piège du passé composé)', () => {
		expect(() => adjCE2('Le vélo cassé attend dans la cour.', 'cassé')).toThrow();
		expect(() => adjCE2('Le vélo rouge attend dans la cour.', 'rouge')).not.toThrow();
	});

	it('refuse un participe passé adjectival PRÉSENT ailleurs dans la phrase', () => {
		expect(() => adjCE2('La porte fermée cache un chat noir.', 'noir')).toThrow();
		expect(() => adjCE2('La porte cache un chat noir.', 'noir')).not.toThrow();
	});

	it('refuse un SECOND adjectif (la cible ne serait plus unique)', () => {
		expect(() => adjCE2('Le petit chien noir aboie fort.', 'petit')).toThrow();
		expect(() => adjCE2('Le petit chien aboie fort.', 'petit')).not.toThrow();
	});

	it('refuse un mot de la MÊME FAMILLE que l’adjectif visé (adverbe en -ment, pluriel)', () => {
		expect(() => adjCE2('La rivière calme coule calmement.', 'calme')).toThrow();
		expect(() => adjCE2('La rivière calme coule lentement.', 'calme')).not.toThrow();
		expect(() => adjCE2('Le grand chien aime les grands arbres.', 'grand')).toThrow();
		expect(() => adjCE2('Le grand chien aime les arbres.', 'grand')).not.toThrow();
	});
});

describe('Garde-fous « pronom sujet CE2 » — entrées auteur invalides (#436)', () => {
	it('refuse une cible qui n’est pas un pronom personnel sujet', () => {
		expect(() => pronSujetCE2('Le chien aboie très fort.', 'chien')).toThrow();
		expect(() => pronSujetCE2('Il aboie très fort.', 'Il')).not.toThrow();
	});

	it('refuse la présence d’un pronom COMPLÉMENT (non enseigné au CE2)', () => {
		expect(() => pronSujetCE2('Il me regarde très souvent.', 'Il')).toThrow();
		expect(() => pronSujetCE2('Il regarde très souvent la cour.', 'Il')).not.toThrow();
	});

	it('refuse DEUX pronoms sujets cliquables dans la phrase', () => {
		expect(() => pronSujetCE2('Il chante et elle danse.', 'Il')).toThrow();
		expect(() => pronSujetCE2('Il chante et Léa danse.', 'Il')).not.toThrow();
	});

	it('refuse une cible qui n’est pas LE pronom sujet de la phrase', () => {
		expect(() => pronSujetCE2('Elle chante très fort.', 'Il')).toThrow();
		expect(() => pronSujetCE2('Elle chante très fort.', 'Elle')).not.toThrow();
	});

	it('refuse un « il » IMPERSONNEL (« il pleut ») : ce « il » ne remplace personne', () => {
		expect(() => pronSujetCE2('Il pleut sur la ville.', 'Il')).toThrow();
		expect(() => pronSujetCE2('Il joue sur la place.', 'Il')).not.toThrow();
	});
});
