/* ============================================================
   Proportionnalité CM1 (#258) — leçon A « Est-ce proportionnel ? » (identifier) :
   QCM Oui/Non sur une banque de situations.

   Tests écrits AVANT l'implémentation, à partir des critères de l'issue #258
   (1 à 4, 10, 12 à 14) et du contrat d'API convenu pour
   `src/data/maths/proportionnalite.ts`. Auteur des tests DISTINCT de l'auteur du
   code : aucun attendu n'est lu dans une implémentation. Les trois familles NON
   proportionnelles typiques se classent par les premiers principes :
   - part fixe : a + 2·b·x ≠ 2·(a + b·x) dès que a ≠ 0 ;
   - aire du carré : un côté doublé donne (2c)² = 4c², pas le double ;
   - âge et taille : taille non nulle à la naissance, croissance qui ralentit.

   Non mécanisable, laissé à la relecture (pedagogue-primaire, redacteur-contenu-
   francais) : la PLAUSIBILITÉ des situations (critère 2) et leur caractère concret
   (critère 1). Le critère 15 (aucune leçon existante ne change) relève de la suite
   complète, pas de ce fichier. La leçon B (résoudre) a son propre fichier,
   `proportionnalite-resoudre.test.ts`.
   ============================================================ */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { BANQUE_IDENTIFIER, exerciceIdentifier } from '../src/data/maths/proportionnalite';
import { getLessonById, genLessonItem, getLessonsBySubject } from '../src/core/catalog';
import type { LessonDef } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import { withSeed } from '../src/core/utils';
import { ORDRE_LECONS } from '../src/data/ordre-pedagogique';
import type { Exercise } from '../src/core/exercise';

type ItemIdentifier = ReturnType<typeof BANQUE_IDENTIFIER.at>[number];

const ID = 'math-prob-proportion-identifier';
const ID_RESOUDRE = 'math-prob-proportion-resoudre';

/* Équilibre minimal de chaque réponse. Le QCM est binaire : au-delà de 70/30, la
   stratégie fixe « toujours la réponse majoritaire » réussit déjà 70 % des items
   sans rien lire, et la classe minoritaire devient rare à l'écran. */
const PART_MIN = 0.3;

/* Plafond du « lecteur de connecteurs » (critère 3). Point médian entre le hasard
   (50 %) et le cas d'échec de l'issue (100 % : « on classe correctement tous les
   items en ne lisant que les mots de liaison »). */
const REUSSITE_MAX = 0.75;

const ITEMS: ItemIdentifier[] = BANQUE_IDENTIFIER.at('cm1');

/* Narrowing : la leçon ne produit que des QCM (critère 14). */
function qcm(ex: Exercise): Extract<Exercise, { type: 'qcm' }> {
	if (ex.type !== 'qcm') throw new Error(`attendu un QCM, reçu « ${ex.type} »`);
	return ex;
}

function leconIdentifier(): LessonDef {
	const l = getLessonById(ID);
	if (!l) throw new Error(`leçon « ${ID} » absente du catalogue`);
	return l;
}

/* Normalisation de comparaison : NFC, minuscules, apostrophes typographiques vers
   l'apostrophe droite, espaces (insécables compris) repliés. */
function normaliser(s: string): string {
	return s.normalize('NFC').toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
}

/* Clé d'unicité : la normalisation, sans la ponctuation finale. */
const cleSituation = (s: string): string => normaliser(s).replace(/[\s.!?…]+$/, '');

/* ---------------------------------------------------------------------
   Détecteur de connecteurs (critère 3)
   --------------------------------------------------------------------- */

const LETTRE = 'a-zàâäçéèêëîïôöùûüÿœæ';

interface Connecteur {
	nom: string;
	motif: RegExp;
}

/* Motif borné par des non-lettres : « en plusieurs » n'est pas « en plus »,
   « puisque » n'est pas « puis » (\b ignore les lettres accentuées). */
function connecteur(nom: string, motif: string): Connecteur {
	return { nom, motif: new RegExp(`(?<![${LETTRE}])(?:${motif})(?![${LETTRE}])`) };
}

/* Les quatre mots de liaison CITÉS par le critère 3, avec leurs variantes de forme. */
const CONNECTEURS_CITES: Connecteur[] = [
	connecteur('chacun', 'chacune?s?'),
	connecteur('identiques', 'identiques?'),
	connecteur("d'abord", "d'abord"),
	connecteur('en plus', '(?:en|de) plus'),
];

/* Lexique élargi : les cités, plus les connecteurs voisins qu'un lecteur pressé
   prendrait pour un signal. « puis » est celui de l'exemple même de l'issue (« 3 € de
   prise en charge, puis 1 € par kilomètre ») ; « plus…, plus… » fait croire à la
   proportionnalité dès que deux grandeurs croissent ensemble. */
const CONNECTEURS_ELARGIS: Connecteur[] = [
	...CONNECTEURS_CITES,
	connecteur('chaque', 'chaque'),
	connecteur('même', 'mêmes?'),
	connecteur('pareil', 'pareil(?:le)?s?'),
	connecteur('puis', 'puis'),
	connecteur('ensuite', 'ensuite'),
	connecteur('au départ', 'au (?:départ|début)'),
	connecteur('en supplément', 'en supplément'),
	connecteur('plus…, plus…', 'plus[^.?!]*, ?plus'),
];

interface Etiquete {
	texte: string;
	oui: boolean;
}

interface Repartition {
	nom: string;
	oui: number;
	non: number;
}

function repartition(items: Etiquete[], lexique: Connecteur[]): Repartition[] {
	return lexique.map((c) => {
		const avec = items.filter((it) => c.motif.test(normaliser(it.texte)));
		const oui = avec.filter((it) => it.oui).length;
		return { nom: c.nom, oui, non: avec.length - oui };
	});
}

const decrire = (r: Repartition): string => `« ${r.nom} » : ${r.oui} Oui / ${r.non} Non`;

/* Connecteurs présents d'UN SEUL côté : là où ils apparaissent, ils donnent la réponse
   (dans un sens ou dans l'autre : un piège systématiquement inversé s'apprend aussi). */
function connecteursUnilateraux(items: Etiquete[], lexique: Connecteur[]): string[] {
	return repartition(items, lexique)
		.filter((r) => r.oui > 0 !== r.non > 0)
		.map(decrire);
}

/* Réussite d'un enfant qui ne lit QUE les connecteurs : à force de jouer la banque, il
   a appris de quel côté penche chacun ; il additionne ces penchants, et tire à pile ou
   face (0,5) quand aucun connecteur ne l'aide ou qu'ils s'annulent. */
function reussiteLecteurDeConnecteurs(items: Etiquete[], lexique: Connecteur[]): number {
	if (items.length === 0) return 0.5;
	const penchants = repartition(items, lexique).map((r) => Math.sign(r.oui - r.non));
	let total = 0;
	for (const it of items) {
		const texte = normaliser(it.texte);
		let vote = 0;
		lexique.forEach((c, i) => {
			if (c.motif.test(texte)) vote += penchants[i];
		});
		if (vote === 0) total += 0.5;
		else if (vote > 0 === it.oui) total += 1;
	}
	return total / items.length;
}

/* Source pseudo-aléatoire reproductible (LCG), pour simuler deux `Math.random`
   différents sans risquer de boucle infinie sur un tirage constant. */
function suiteAleatoire(graine: number): () => number {
	let s = graine >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/* =====================================================================
   Banque — taille, unicité, niveau (critère 4)
   ===================================================================== */

describe('Banque « Est-ce proportionnel ? » — taille et unicité (critère 4)', () => {
	it('critère 4 : entre 50 et 100 items au CM1', () => {
		expect(ITEMS.length).toBeGreaterThanOrEqual(50);
		expect(ITEMS.length).toBeLessThanOrEqual(100);
	});

	it('critère 4 : situations deux à deux distinctes (casse, espaces, apostrophes et point final ignorés)', () => {
		const vues = new Set<string>();
		const doublons: string[] = [];
		for (const it of ITEMS) {
			const cle = cleSituation(it.situation);
			if (vues.has(cle)) doublons.push(it.situation);
			vues.add(cle);
		}
		expect(doublons).toEqual([]);
	});

	it('banque CM1 seulement : chaque item est tagué [cm1], rien au CE2', () => {
		expect(BANQUE_IDENTIFIER.levels).toEqual(['cm1']);
		for (const it of ITEMS) expect(it.levels, it.situation).toEqual(['cm1']);
		expect(BANQUE_IDENTIFIER.at('ce2')).toEqual([]);
	});

	it(`ni « tout Oui » ni « tout Non » : chaque réponse pèse au moins ${PART_MIN * 100} % de la banque`, () => {
		const n = ITEMS.length;
		const oui = ITEMS.filter((it) => it.proportionnel).length;
		expect(n).toBeGreaterThan(0);
		expect(oui / n, `${oui} Oui sur ${n}`).toBeGreaterThanOrEqual(PART_MIN);
		expect((n - oui) / n, `${n - oui} Non sur ${n}`).toBeGreaterThanOrEqual(PART_MIN);
	});
});

/* =====================================================================
   Familles de situations (critère 2)
   ===================================================================== */

describe('Familles de situations (critère 2)', () => {
	it('critère 2 : les NON proportionnelles couvrent au moins la part fixe, l’âge et la taille, l’aire du carré', () => {
		const famillesNon = [
			...new Set(ITEMS.filter((it) => !it.proportionnel).map((it) => it.famille)),
		];
		for (const f of ['part-fixe', 'age-taille', 'aire-carre']) {
			expect(famillesNon, `famille « ${f} » absente des situations NON`).toContain(f);
		}
	});

	it('une famille ne range jamais une situation côté Oui et une autre côté Non', () => {
		const sens = new Map<string, Set<boolean>>();
		for (const it of ITEMS) {
			expect(it.famille.trim(), `famille vide : ${it.situation}`).not.toBe('');
			const s = sens.get(it.famille) ?? new Set<boolean>();
			s.add(it.proportionnel);
			sens.set(it.famille, s);
		}
		const mixtes = [...sens].filter(([, s]) => s.size > 1).map(([f]) => f);
		expect(mixtes).toEqual([]);
	});
});

/* =====================================================================
   Anti-piège mots-clés (critère 3)
   ===================================================================== */

describe('Anti-piège mots-clés (critère 3)', () => {
	const etiquetes: Etiquete[] = ITEMS.map((it) => ({
		texte: it.situation,
		oui: it.proportionnel,
	}));

	it('critère 3 : la situation n’énonce jamais elle-même la réponse', () => {
		// « est proportionnel », « n'est pas proportionnel », « varie proportionnellement »,
		// « situation de proportionnalité ». Une QUESTION (« est-il proportionnel ? ») reste
		// permise : le trait d'union la sépare de « est ».
		const enonceLaReponse =
			/(?<![a-zé])(?:est|sont|varie|varient)\s+(?:pas\s+)?proportionnel|situation de proportionnalit/;
		const fautives = ITEMS.filter((it) => enonceLaReponse.test(normaliser(it.situation)));
		expect(fautives.map((it) => it.situation)).toEqual([]);
	});

	it('critère 3 : chaque connecteur cité par l’issue (et ses variantes) apparaît des deux côtés, ou nulle part', () => {
		expect(connecteursUnilateraux(etiquetes, CONNECTEURS_CITES)).toEqual([]);
	});

	it(`critère 3 : un lecteur de connecteurs qui a appris leur penchant sur la banque ne dépasse pas ${REUSSITE_MAX * 100} %`, () => {
		const r = reussiteLecteurDeConnecteurs(etiquetes, CONNECTEURS_ELARGIS);
		const presents = repartition(etiquetes, CONNECTEURS_ELARGIS)
			.filter((x) => x.oui + x.non > 0)
			.map(decrire)
			.join(' ; ');
		expect(r, `réussite ${Math.round(r * 100)} % — ${presents}`).toBeLessThan(REUSSITE_MAX);
	});

	describe('garde-fou du détecteur (sans lui, les deux tests ci-dessus ne garderaient rien)', () => {
		it("le cas d'échec de l'issue (connecteurs alignés sur la réponse) est détecté", () => {
			const piegee: Etiquete[] = [
				{ texte: 'Les sachets sont identiques : chacun coûte 2 €.', oui: true },
				{ texte: 'Chacune des boîtes contient 6 œufs.', oui: true },
				{ texte: 'Le taxi prend d’abord 3 €, puis 1 € par kilomètre.', oui: false },
				{ texte: 'La location coûte 10 €, et 2 € de plus par heure.', oui: false },
			];
			expect(connecteursUnilateraux(piegee, CONNECTEURS_CITES)).toHaveLength(4);
			expect(reussiteLecteurDeConnecteurs(piegee, CONNECTEURS_ELARGIS)).toBe(1);
		});

		it('un piège inversé (connecteur toujours du côté opposé) est détecté aussi', () => {
			const inverse: Etiquete[] = [
				{ texte: 'Chacun paie 3 € d’entrée, puis 1 € par tour de manège.', oui: false },
				{ texte: 'Un cahier coûte 2 €.', oui: true },
			];
			expect(connecteursUnilateraux(inverse, CONNECTEURS_CITES)).toEqual([
				'« chacun » : 0 Oui / 1 Non',
			]);
		});

		it('« en plusieurs » et « puisque » ne passent pas pour « en plus » et « puis »', () => {
			const neutre: Etiquete[] = [
				{ texte: 'Un vélo se paie en plusieurs fois.', oui: true },
				{ texte: 'Puisque le côté du carré change, son aire change.', oui: false },
			];
			expect(connecteursUnilateraux(neutre, CONNECTEURS_ELARGIS)).toEqual([]);
			expect(reussiteLecteurDeConnecteurs(neutre, CONNECTEURS_ELARGIS)).toBe(0.5);
		});

		it("un connecteur présent des deux côtés n'est pas signalé et ne rapporte rien", () => {
			const equilibre: Etiquete[] = [
				{ texte: 'Chaque stylo coûte 1 €.', oui: true },
				{ texte: "Le club demande 20 € d'inscription, et 5 € pour chaque séance.", oui: false },
			];
			expect(connecteursUnilateraux(equilibre, CONNECTEURS_ELARGIS)).toEqual([]);
			expect(reussiteLecteurDeConnecteurs(equilibre, CONNECTEURS_ELARGIS)).toBe(0.5);
		});
	});
});

/* =====================================================================
   Exercice produit (critères 1, 12, 13, 14)
   ===================================================================== */

describe('Exercice produit par exerciceIdentifier', () => {
	it('critères 1 et 14 : QCM [Oui, Non], réponse Oui si et seulement si la situation est proportionnelle', () => {
		for (const it of ITEMS) {
			const ex = qcm(exerciceIdentifier(it));
			expect(ex.choices).toEqual(['Oui', 'Non']);
			expect(ex.answer, it.situation).toBe(it.proportionnel ? 'Oui' : 'Non');
		}
	});

	it('critère 1 : la question reprend la situation en entier et demande si c’est proportionnel', () => {
		for (const it of ITEMS) {
			const q = normaliser(qcm(exerciceIdentifier(it)).question);
			expect(q).toContain(normaliser(it.situation));
			// La question est ce qui descend dans l'Item (fiche, révision) : la demande doit
			// y figurer, pas seulement dans le titre de la leçon.
			expect(q, it.situation).toMatch(/proportionn[^.!]*\?/);
		}
	});

	it('critère 12 : aucun tableau ni figure — ni dessin, ni grille HTML ou Markdown', () => {
		for (const it of ITEMS) {
			const ex = qcm(exerciceIdentifier(it));
			expect(ex.figure, it.situation).toBeUndefined();
			const textes = [ex.question, ex.consigne, ex.explication].join(' ');
			expect(textes).not.toMatch(/<(?:table|tr|td|th|input|svg)\b/i);
			expect(textes).not.toMatch(/\|[^|\n]*\|/);
		}
	});

	it('critère 13 : ni l’énoncé ni l’étayage ne nomment une procédure postérieure au CM1', () => {
		const vocabulaireInterdit = /coefficient|produit en croix|r[eè]gle de trois/;
		const passageParUnite =
			/par l'unit[eé]|(?:prix|valeur|masse|poids|longueur|quantit[eé]) (?:d'|pour )une? seule?|cherche d'abord/;
		for (const it of ITEMS) {
			const ex = qcm(exerciceIdentifier(it));
			const tout = normaliser([ex.question, ex.consigne, ex.explication, ex.parle].join(' '));
			expect(tout, it.situation).not.toMatch(vocabulaireInterdit);
			const etayage = normaliser([ex.consigne, ex.explication].join(' '));
			expect(etayage, it.situation).not.toMatch(passageParUnite);
		}
	});
});

/* =====================================================================
   Branchement catalogue
   ===================================================================== */

describe('Branchement catalogue de la leçon « Est-ce proportionnel ? »', () => {
	it('leçon de maths CM1-only, catégorie Problèmes, exclue du sprint, avec des mots-clés de recherche', () => {
		const l = leconIdentifier();
		expect(l.subject).toBe('math');
		expect(l.category).toBe('math-problemes');
		expect(l.levels).toEqual(['cm1']);
		// Oui/Non devinable à 50 % : pas de place dans un sprint chronométré.
		expect(l.excludeFromSprint).toBe(true);
		expect(l.motsCles?.length ?? 0).toBeGreaterThan(0);
	});

	it('absente du CE2 : ni dans le catalogue de maths CE2, ni dans son ordre pédagogique', () => {
		expect(getLessonsBySubject('math', 'ce2').map((l) => l.id)).not.toContain(ID);
		expect(ORDRE_LECONS.math.ce2 ?? []).not.toContain(ID);
	});

	it('ordre pédagogique CM1 : « identifier » vient AVANT « résoudre »', () => {
		const ordre = ORDRE_LECONS.math.cm1 ?? [];
		const a = ordre.indexOf(ID);
		const b = ordre.indexOf(ID_RESOUDRE);
		expect(a, `${ID} absente de ORDRE_LECONS.math.cm1`).toBeGreaterThanOrEqual(0);
		expect(b, `${ID_RESOUDRE} absente de ORDRE_LECONS.math.cm1`).toBeGreaterThanOrEqual(0);
		expect(a).toBeLessThan(b);
	});

	it('genLessonItem CM1 : QCM sur une situation de la banque, corrigé selon la réponse stockée', () => {
		const l = leconIdentifier();
		const vus = { Oui: 0, Non: 0 };
		withSeed(258, () => {
			for (let i = 0; i < 300; i++) {
				const item = genLessonItem(l, 'cm1');
				expect(item.choices).toEqual(['Oui', 'Non']);
				expect(item.figure).toBeUndefined();
				expect(item.kind).not.toBe('posed');
				const texte = normaliser(item.text);
				const sources = ITEMS.filter((it) => texte.includes(normaliser(it.situation)));
				expect(sources.length, `situation hors banque : ${item.text}`).toBeGreaterThan(0);
				// Une situation peut en contenir une autre : la plus longue est la bonne.
				const source = sources.reduce((a, b) => (b.situation.length > a.situation.length ? b : a));
				const attendu = source.proportionnel ? 'Oui' : 'Non';
				expect(item.answer).toBe(attendu);
				expect(checkItemAnswer(item, attendu)).toBe(true);
				expect(checkItemAnswer(item, attendu === 'Oui' ? 'Non' : 'Oui')).toBe(false);
				vus[attendu]++;
			}
		});
		expect(vus.Oui).toBeGreaterThan(0);
		expect(vus.Non).toBeGreaterThan(0);
	});
});

/* =====================================================================
   Déterminisme de construction
   ===================================================================== */

describe('Déterminisme de construction de la banque', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it('deux imports frais sous deux sources d’aléa différentes donnent la même banque, dans le même ordre', async () => {
		// Relire deux fois le même module déjà chargé ne prouverait rien : on le RÉ-ÉVALUE
		// avec un `Math.random` différent. Un mélange ou un tirage à la construction
		// changerait la liste ou son ordre.
		const lire = async (graine: number): Promise<ItemIdentifier[]> => {
			vi.resetModules();
			vi.spyOn(Math, 'random').mockImplementation(suiteAleatoire(graine));
			const m = await import('../src/data/maths/proportionnalite');
			const items = m.BANQUE_IDENTIFIER.at('cm1');
			vi.restoreAllMocks();
			return items;
		};
		const a = await lire(1);
		const b = await lire(2);
		expect(a.length).toBeGreaterThan(0);
		expect(b).toEqual(a);
	});
});

/* =====================================================================
   Critère 10 — le refus du tableau est écrit
   ===================================================================== */

describe('Critère 10 : le refus du tableau de proportionnalité est consigné', () => {
	it('la doc cible consigne le refus du tableau, avec sa source et le mécanisme de contournement', () => {
		// Cible fixée par l'issue : `docs/perimetre/cm1.md` si #260 est livrée, sinon
		// `docs/architecture/contenu-et-lecons.md`.
		const cible = existsSync('docs/perimetre/cm1.md')
			? 'docs/perimetre/cm1.md'
			: 'docs/architecture/contenu-et-lecons.md';
		const sections = readFileSync(cible, 'utf8')
			.split(/^(?=#{1,6} )/m)
			.filter((s) => /tableaux? de proportionnalit/i.test(s));
		expect(sections.length, `aucune section de ${cible} ne traite du tableau`).toBeGreaterThan(0);
		const texte = sections.join('\n');
		expect(texte, 'source absente').toMatch(
			/eduscol|résoudre des problèmes de proportionnalité au cycle 3/i,
		);
		expect(texte, 'mécanisme de contournement absent').toMatch(
			/contourn|écart entre|suite numérique|répét/i,
		);
	});
});
