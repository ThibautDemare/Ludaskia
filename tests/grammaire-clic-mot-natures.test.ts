/* ============================================================
   Grammaire — « Clique sur le mot », 5 natures CM1 (#437).
   ------------------------------------------------------------
   Complète tests/grammaire-clic-mot.test.ts (leçon « verbe », #259) SANS le
   toucher : ici les 5 leçons de nature CM1 (déterminant, conjonction, pronom,
   nom noyau, sujet). Logique PURE (aucun DOM) : on éprouve les BANQUES, les
   FABRIQUES et le REPLI non interactif ; `check` renvoie toujours false (le
   runner d'écran corrige par égalité d'ensembles).

   Indépendance auteur ≠ code : les attendus grammaticaux (ce qu'est un article /
   possessif / démonstratif, un pronom sujet vs complément, la cardinalité d'une
   cible « ni … ni » ou d'un sujet composé) sont DÉRIVÉS de la grammaire et du
   périmètre documenté du design #437 — pas transcrits de l'implémentation. Les
   ensembles de mots ci-dessous redisent le PÉRIMÈTRE de chaque leçon (choix
   pédagogique arrêté), volontairement recalculés à la main pour que ces tests
   attrapent un item hors périmètre au lieu de le figer.

   NB — la consigne / le `cibleLabel` de la leçon « sujet » sont susceptibles
   d'être reformulés après relecture langue : on n'assère donc PAS leur chaîne
   exacte, seulement la MÉCANIQUE et la présence du label (lu sur l'item généré).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	PHRASES_CONJ,
	PHRASES_DET,
	PHRASES_PRON,
	PHRASES_NOYAU,
	PHRASES_SUJET,
	clicMotType,
	clicVerbeType,
	joindrePhrase,
	CLIC_MOT_LESSONS,
	phrase,
	phraseMots,
	det,
	pron,
	type PhraseClicMot,
} from '../src/data/francais/grammaire-clic-mot';
import { withSeed } from '../src/core/utils';
import type { ExerciseType } from '../src/core/exercise';
import { getLessonById, genLessonItem, isClicMotLesson } from '../src/core/catalog';

/* ---------- Attendus GRAMMATICAUX re-dérivés (pas relus du code) ---------- */

/* Ponctuation isolée = jamais cliquable ⇒ jamais une cible. Re-dérivé (le module
   exporte `estPonctuation`, testé ailleurs ; on recalcule pour rester indépendant). */
const MA_PONCT = /^[.,;:!?…«»]+$/u;
const estPonct = (t: string): boolean => MA_PONCT.test(t);

/* Périmètre « déterminant » du design #437 : articles NON partitifs/contractés,
   possessifs, démonstratifs. (Grammaire + périmètre documenté.) */
const ARTICLES = new Set(['le', 'la', 'les', 'un', 'une', 'des']);
const POSSESSIFS = new Set([
	'mon',
	'ma',
	'mes',
	'ton',
	'ta',
	'tes',
	'son',
	'sa',
	'ses',
	'notre',
	'nos',
	'votre',
	'vos',
	'leur',
	'leurs',
]);
const DEMONSTRATIFS = new Set(['ce', 'cet', 'cette', 'ces']);
const DET_SET: Record<'article' | 'possessif' | 'demonstratif', Set<string>> = {
	article: ARTICLES,
	possessif: POSSESSIFS,
	demonstratif: DEMONSTRATIFS,
};

/* Pronoms personnels. Sujets = je/tu/il/elle/on/nous/vous/ils/elles ; compléments
   retenus au CM1 (design : le/la/les EXCLUS car homographes d'articles) =
   me/te/lui/leur/se/nous/vous. Formes STRICTES = un seul rôle possible (nous/vous
   sont partagés, donc hors formes strictes). */
const PRON_SUJET = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles']);
const PRON_COMPL = new Set(['me', 'te', 'lui', 'leur', 'se', 'nous', 'vous']);
const PRON_SUJET_STRICT = new Set(['je', 'tu', 'il', 'elle', 'on', 'ils', 'elles']);
const PRON_COMPL_STRICT = new Set(['me', 'te', 'lui', 'leur', 'se']);

const lc = (s: string): string => s.toLowerCase();
const cle = (p: { tokens: string[]; cibleIndices: number[] }): string =>
	`${joindrePhrase(p.tokens)} ##idx## ${p.cibleIndices.join(',')}`;

const BANQUES: Array<[string, PhraseClicMot[]]> = [
	['CONJ', PHRASES_CONJ],
	['DET', PHRASES_DET],
	['PRON', PHRASES_PRON],
	['NOYAU', PHRASES_NOYAU],
	['SUJET', PHRASES_SUJET],
];

/* Cible bien formée : non vide, indices entiers dans les bornes, STRICTEMENT
   croissants (triés + uniques), aucun sur de la ponctuation ; explication non vide. */
function verifieCible(p: PhraseClicMot, où: string): void {
	const { tokens, cibleIndices } = p;
	expect(cibleIndices.length, `${où} : cible vide`).toBeGreaterThan(0);
	for (const i of cibleIndices) {
		expect(Number.isInteger(i), `${où} : index non entier ${i}`).toBe(true);
		expect(i, où).toBeGreaterThanOrEqual(0);
		expect(i, où).toBeLessThan(tokens.length);
		expect(estPonct(tokens[i]), `${où} : ponctuation ciblée « ${tokens[i]} »`).toBe(false);
	}
	for (let k = 1; k < cibleIndices.length; k++) {
		// strictement croissant ⇒ trié ET sans doublon
		expect(cibleIndices[k], `${où} : indices non triés/uniques`).toBeGreaterThan(
			cibleIndices[k - 1],
		);
	}
	expect(p.explication.trim().length, `${où} : explication vide`).toBeGreaterThan(0);
}

/* Effet du garde-fou d'unicité (phraseMots) OBSERVÉ sur les données : chaque forme
   ciblée apparaît dans la phrase EXACTEMENT autant de fois qu'elle est ciblée — pas
   d'occurrence « fantôme » non cliquée qui rendrait la réponse ambiguë. */
function verifieMultiplicite(p: PhraseClicMot, où: string): void {
	const attendu = new Map<string, number>();
	for (const i of p.cibleIndices) {
		const f = lc(p.tokens[i]);
		attendu.set(f, (attendu.get(f) ?? 0) + 1);
	}
	for (const [f, m] of attendu) {
		const total = p.tokens.filter((t) => lc(t) === f).length;
		expect(total, `${où} : « ${f} » ciblé ${m}× mais présent ${total}×`).toBe(m);
	}
}

/* ============================================================ */
describe('Intégrité des 5 banques (#437)', () => {
	for (const [nom, banque] of BANQUES) {
		it(`${nom} : chaque item a une cible bien formée, non ponctuée, non ambiguë`, () => {
			expect(banque.length, `${nom} vide`).toBeGreaterThan(0);
			for (const p of banque) {
				const où = `${nom} « ${joindrePhrase(p.tokens)} »`;
				verifieCible(p, où);
				verifieMultiplicite(p, où);
			}
		});
	}

	it('aucune paire (phrase, cible) en double au sein d’une banque', () => {
		for (const [nom, banque] of BANQUES) {
			const cles = banque.map(cle);
			expect(new Set(cles).size, `doublon dans ${nom}`).toBe(cles.length);
		}
	});
});

describe('Cibles multi-mots non adjacentes (#437)', () => {
	it('CONJ : les items « ni … ni » ciblent DEUX « ni » séparés par au moins un mot', () => {
		const doubles = PHRASES_CONJ.filter((p) => p.cibleIndices.length === 2);
		expect(doubles.length, 'aucun item ni…ni').toBeGreaterThan(0);
		for (const p of PHRASES_CONJ) {
			const où = `CONJ « ${joindrePhrase(p.tokens)} »`;
			// une conjonction simple = 1 cible ; ni…ni = 2 cibles, jamais plus.
			expect([1, 2], où).toContain(p.cibleIndices.length);
			if (p.cibleIndices.length === 2) {
				const [a, b] = p.cibleIndices;
				expect(lc(p.tokens[a]), où).toBe('ni');
				expect(lc(p.tokens[b]), où).toBe('ni');
				expect(b - a, `${où} : « ni » adjacents`).toBeGreaterThan(1); // non contiguës
			}
		}
	});

	it('SUJET : sujet composé = 2 noms propres, « et » sauté ; sujet simple = 1 mot', () => {
		const composes = PHRASES_SUJET.filter((p) => p.cibleIndices.length === 2);
		const simples = PHRASES_SUJET.filter((p) => p.cibleIndices.length === 1);
		expect(composes.length, 'aucun sujet composé').toBeGreaterThan(0);
		expect(simples.length, 'aucun sujet simple').toBeGreaterThan(0);
		for (const p of PHRASES_SUJET) {
			const où = `SUJET « ${joindrePhrase(p.tokens)} »`;
			expect([1, 2], où).toContain(p.cibleIndices.length);
			if (p.cibleIndices.length === 2) {
				const [a, b] = p.cibleIndices;
				expect(b - a, `${où} : noms adjacents (pas de « et » sauté)`).toBeGreaterThan(1);
				// deux noms PROPRES (initiale majuscule)
				expect(/^\p{Lu}/u.test(p.tokens[a]), où).toBe(true);
				expect(/^\p{Lu}/u.test(p.tokens[b]), où).toBe(true);
				// un « et » de coordination se trouve STRICTEMENT entre les deux, non ciblé
				const entre = p.tokens.slice(a + 1, b).map(lc);
				expect(entre, `${où} : pas de « et » entre les noms`).toContain('et');
			}
		}
	});
});

describe('Garde-fous de sous-catégorie DÉTERMINANT (effet observé, #437)', () => {
	it('chaque item cible EXACTEMENT le déterminant de sa sous-catégorie annoncée', () => {
		for (const p of PHRASES_DET) {
			const où = `DET « ${joindrePhrase(p.tokens)} »`;
			expect(p.cibleLabel, `${où} : cibleLabel absent`).toBeDefined();
			expect(p.consigne, `${où} : consigne absente`).toBeDefined();
			const label = lc(p.cibleLabel!);
			const cat: 'article' | 'possessif' | 'demonstratif' = label.includes('possessif')
				? 'possessif'
				: label.includes('démonstratif') || label.includes('demonstratif')
					? 'demonstratif'
					: 'article';
			// consigne cohérente avec la sous-catégorie annoncée
			const motCle =
				cat === 'article' ? 'article' : cat === 'possessif' ? 'possessif' : 'démonstratif';
			expect(lc(p.consigne!), `${où} : consigne ≠ ${cat}`).toContain(motCle);
			// cible unique et de la bonne nature
			expect(p.cibleIndices.length, où).toBe(1);
			const cibleTok = lc(p.tokens[p.cibleIndices[0]]);
			expect(DET_SET[cat].has(cibleTok), `${où} : « ${cibleTok} » pas un ${cat}`).toBe(true);
			// UN SEUL déterminant de CETTE sous-catégorie dans la phrase, = la cible
			const membres = p.tokens.filter((t) => DET_SET[cat].has(lc(t)));
			expect(
				membres.length,
				`${où} : ${membres.length} ${cat} (attendu 1) : ${membres.join(', ')}`,
			).toBe(1);
			expect(lc(membres[0]), où).toBe(cibleTok);
		}
	});
});

describe('Garde-fous de rôle PRONOM (effet observé, #437)', () => {
	it('chaque item cible UN pronom du rôle annoncé (le/la/les jamais compléments)', () => {
		for (const p of PHRASES_PRON) {
			const où = `PRON « ${joindrePhrase(p.tokens)} »`;
			expect(p.cibleLabel, `${où} : cibleLabel absent`).toBeDefined();
			const label = lc(p.cibleLabel!);
			const role: 'sujet' | 'complement' =
				label.includes('complément') || label.includes('complement') ? 'complement' : 'sujet';
			expect(p.cibleIndices.length, où).toBe(1);
			const cibleTok = lc(p.tokens[p.cibleIndices[0]]);
			const setRole = role === 'sujet' ? PRON_SUJET : PRON_COMPL;
			expect(setRole.has(cibleTok), `${où} : « ${cibleTok} » pas un pronom ${role}`).toBe(true);
			// homographes d'articles JAMAIS pris pour un complément
			expect(['le', 'la', 'les'].includes(cibleTok), `${où} : article pris pour pronom`).toBe(
				false,
			);
			// un seul pronom du rôle visé cliquable : formes strictes du rôle + la cible = 1
			const strict = role === 'sujet' ? PRON_SUJET_STRICT : PRON_COMPL_STRICT;
			const cliquables = p.tokens.filter((t) => strict.has(lc(t)) || lc(t) === cibleTok);
			expect(cliquables.length, `${où} : ${cliquables.length} pronoms ${role} (attendu 1)`).toBe(1);
		}
	});

	it('aucune forme partagée (nous/vous) présente deux fois dans une même phrase', () => {
		for (const p of PHRASES_PRON) {
			const où = `PRON « ${joindrePhrase(p.tokens)} »`;
			for (const forme of ['nous', 'vous']) {
				const n = p.tokens.filter((t) => lc(t) === forme).length;
				expect(n, `${où} : « ${forme} » ${n}× (sujet ET complément ambigus)`).toBeLessThanOrEqual(
					1,
				);
			}
		}
	});
});

describe('Garde-fous d’homographes de banque (#437)', () => {
	it('CONJ ne contient jamais le token « où » (homophone fragile de « ou »)', () => {
		for (const p of PHRASES_CONJ) {
			for (const t of p.tokens) {
				expect(lc(t), `CONJ « ${joindrePhrase(p.tokens)} »`).not.toBe('où');
			}
		}
	});

	it('PRON : aucune cible de complément n’est « le » / « la » / « les »', () => {
		for (const p of PHRASES_PRON) {
			const label = lc(p.cibleLabel ?? '');
			if (!(label.includes('complément') || label.includes('complement'))) continue;
			const cibleTok = lc(p.tokens[p.cibleIndices[0]]);
			expect(['le', 'la', 'les']).not.toContain(cibleTok);
		}
	});
});

/* ---------- Fabriques ---------- */

/* `levels` : les natures « déterminant », « pronom » et « nom » sont désormais servies
   AUSSI au CE2 (#436), avec une banque et une consigne propres à ce niveau — couvertes
   par leurs propres tests. Ici on continue d'éprouver la banque CM1, donc `generate` est
   appelé AVEC `{ level: 'cm1' }` dès que l'appartenance à la banque CM1 est en jeu. */
const NATURES: Array<{
	id: string;
	label: string;
	banque: PhraseClicMot[];
	levels: Array<'ce2' | 'cm1'>;
}> = [
	{
		id: 'fr-gram-clic-det',
		label: 'Clique sur le déterminant',
		banque: PHRASES_DET,
		levels: ['ce2', 'cm1'],
	},
	{
		id: 'fr-gram-clic-conj',
		label: 'Clique sur la conjonction',
		banque: PHRASES_CONJ,
		levels: ['cm1'],
	},
	{
		id: 'fr-gram-clic-pron',
		label: 'Clique sur le pronom',
		banque: PHRASES_PRON,
		levels: ['ce2', 'cm1'],
	},
	{
		id: 'fr-gram-clic-noyau',
		label: 'Clique sur le nom',
		banque: PHRASES_NOYAU,
		levels: ['ce2', 'cm1'],
	},
	{
		id: 'fr-gram-clic-sujet',
		label: 'Clique sur le sujet',
		banque: PHRASES_SUJET,
		levels: ['cm1'],
	},
];

function typeDe(id: string): ExerciseType {
	const l = CLIC_MOT_LESSONS.find((x) => x.id === id);
	expect(l, `leçon ${id} absente de CLIC_MOT_LESSONS`).toBeDefined();
	return l!.exerciseType;
}

describe('Fabrique clicMotType — contrat (#437)', () => {
	for (const { id, levels } of NATURES) {
		it(`${id} : generate() → clicMot cohérent, check=false, niveaux déclarés`, () => {
			const type = typeDe(id);
			expect(type.exerciseKind).toBe('clicMot');
			expect(type.levels).toEqual(levels);
			for (let i = 0; i < 60; i++) {
				const ex = type.generate({ level: 'cm1' });
				expect(ex.type).toBe('clicMot');
				if (ex.type !== 'clicMot') continue;
				verifieCible(ex, `${id} generate()`);
				expect(ex.parle).toBe(joindrePhrase(ex.tokens)); // texte lu = phrase entière
				expect(ex.consigne.length).toBeGreaterThan(0);
				expect((ex.cibleLabel ?? '').length, `${id} : cibleLabel vide`).toBeGreaterThan(0);
				expect(ex.explication.trim().length).toBeGreaterThan(0);
				// le runner corrige ; check du type renvoie toujours false, même sur la « bonne » saisie
				const bonne = ex.cibleIndices.map((k) => ex.tokens[k]).join(' ');
				expect(type.check(ex, bonne)).toBe(false);
				expect(type.check(ex, 'nimporte')).toBe(false);
			}
		});
	}

	it('verbe : niveaux CE2 + CM1 (contraste avec les natures CM1-only)', () => {
		expect(clicVerbeType().levels).toEqual(['ce2', 'cm1']);
	});

	it('itemClicMot : le cibleLabel/consigne PAR ITEM prime sur les défauts du type', () => {
		// Une phrase DÉTERMINANT porte ses propres consigne/cibleLabel : ils doivent
		// gagner face aux défauts passés à la fabrique.
		const phraseDet = PHRASES_DET[0];
		expect(phraseDet.cibleLabel).toBeDefined();
		const type = clicMotType({
			banque: [phraseDet],
			consigne: 'CONSIGNE_DEFAUT_A_IGNORER',
			cibleLabel: 'LABEL_DEFAUT_A_IGNORER',
		});
		const ex = type.generate();
		if (ex.type !== 'clicMot') throw new Error('type inattendu');
		expect(ex.consigne).toBe(phraseDet.consigne);
		expect(ex.cibleLabel).toBe(phraseDet.cibleLabel);
	});

	it('itemClicMot : sans surcharge, la phrase hérite des défauts du type', () => {
		// Une phrase NOM NOYAU n'a ni consigne ni cibleLabel propres → les défauts s'appliquent.
		const phraseNoyau = PHRASES_NOYAU[0];
		expect(phraseNoyau.consigne).toBeUndefined();
		expect(phraseNoyau.cibleLabel).toBeUndefined();
		const type = clicMotType({
			banque: [phraseNoyau],
			consigne: 'MA_CONSIGNE',
			cibleLabel: 'MON_LABEL',
			levels: ['ce2'], // override du niveau par défaut
		});
		expect(type.levels).toEqual(['ce2']);
		const ex = type.generate();
		if (ex.type !== 'clicMot') throw new Error('type inattendu');
		expect(ex.consigne).toBe('MA_CONSIGNE');
		expect(ex.cibleLabel).toBe('MON_LABEL');
	});

	it('det / pron : consigne + cibleLabel de l’item tiré collent à la nature de sa cible', () => {
		// DÉTERMINANT : la sous-catégorie annoncée par cibleLabel matche le token ciblé.
		const detType = typeDe('fr-gram-clic-det');
		for (let i = 0; i < 200; i++) {
			const ex = detType.generate({ level: 'cm1' });
			if (ex.type !== 'clicMot') continue;
			const cibleTok = lc(ex.tokens[ex.cibleIndices[0]]);
			const label = lc(ex.cibleLabel ?? '');
			const cat: 'article' | 'possessif' | 'demonstratif' = label.includes('possessif')
				? 'possessif'
				: label.includes('démonstratif')
					? 'demonstratif'
					: 'article';
			expect(DET_SET[cat].has(cibleTok), `det ${cat} ← « ${cibleTok} »`).toBe(true);
		}
		// PRONOM : le rôle annoncé matche la nature du token ciblé.
		const pronType = typeDe('fr-gram-clic-pron');
		for (let i = 0; i < 200; i++) {
			const ex = pronType.generate({ level: 'cm1' });
			if (ex.type !== 'clicMot') continue;
			const cibleTok = lc(ex.tokens[ex.cibleIndices[0]]);
			const label = lc(ex.cibleLabel ?? '');
			const set =
				label.includes('complément') || label.includes('complement') ? PRON_COMPL : PRON_SUJET;
			expect(set.has(cibleTok), `pron ← « ${cibleTok} » / ${label}`).toBe(true);
			expect(lc(ex.consigne)).toContain('pronom'); // libellé stable (indépendant du mot « sujet »)
		}
	});
});

describe('Déterminisme du tirage & bornes par échantillonnage (#437)', () => {
	it('même graine ⇒ item identique (tokens + cibleIndices + libellés)', () => {
		for (const { id } of NATURES) {
			const type = typeDe(id);
			for (const seed of [2, 11, 37, 128, 777]) {
				const a = withSeed(seed, () => type.generate());
				const b = withSeed(seed, () => type.generate());
				expect(b, `${id}@${seed}`).toEqual(a);
			}
		}
	});

	it('générateur non figé : des graines variées donnent des phrases différentes', () => {
		for (const { id } of NATURES) {
			const type = typeDe(id);
			const vus = new Set<string>();
			for (let seed = 1; seed <= 20; seed++) {
				vus.add(withSeed(seed, () => JSON.stringify(type.generate())));
			}
			expect(vus.size, `${id} figé ?`).toBeGreaterThan(1);
		}
	});

	it('400 tirages : tout item produit est MEMBRE de sa banque et bien formé', () => {
		for (const { id, banque } of NATURES) {
			const type = typeDe(id);
			const membres = new Set(banque.map(cle));
			for (let i = 0; i < 400; i++) {
				const ex = type.generate({ level: 'cm1' });
				expect(ex.type).toBe('clicMot');
				if (ex.type !== 'clicMot') continue;
				verifieCible(ex, `${id} tirage ${i}`);
				expect(membres.has(cle(ex)), `${id} : item hors banque`).toBe(true);
			}
		}
	});
});

describe('Catalogue : les 5 leçons de nature (#437)', () => {
	for (const { id, label, levels } of NATURES) {
		it(`${id} : grammaire française, niveaux déclarés, format clicMot`, () => {
			const def = getLessonById(id);
			expect(def, `${id} introuvable`).toBeDefined();
			expect(def!.subject).toBe('francais');
			expect(def!.category).toBe('fr-grammaire');
			expect(def!.levels).toEqual(levels);
			expect(def!.label).toBe(label);
			expect(def!.exerciseType.exerciseKind).toBe('clicMot');
			expect(isClicMotLesson(def!)).toBe(true);
		});
	}
});

/* Balaie les graines jusqu'à tirer l'item dont la phrase montrée est `texteCible`,
   et renvoie le `answer` du repli pour CET item connu. Permet de fixer des attendus
   LITTÉRAUX (dérivés à la main) plutôt que de recopier la jointure du code. */
function answerPourPhrase(
	lesson: NonNullable<ReturnType<typeof getLessonById>>,
	level: 'ce2' | 'cm1',
	texteCible: string,
): string | undefined {
	for (let seed = 0; seed < 4000; seed++) {
		const ex = withSeed(seed, () => lesson.exerciseType.generate({ level }));
		if (ex.type !== 'clicMot') continue;
		if (joindrePhrase(ex.tokens) === texteCible) {
			const item = withSeed(seed, () => genLessonItem(lesson, level));
			return String(item.answer);
		}
	}
	return undefined;
}

describe('Repli non interactif (bilan / révision) via genLessonItem (#437)', () => {
	it('answer STOCKÉ, texte = « Recopie <cibleLabel> » + phrase, parle préfixé (seedé)', () => {
		for (const { id } of NATURES) {
			const lesson = getLessonById(id)!;
			for (const seed of [1, 8, 42, 123, 777, 2024]) {
				// Sous une même graine, genLessonItem et generate consomment le MÊME tirage.
				const item = withSeed(seed, () => genLessonItem(lesson, 'cm1'));
				const ex = withSeed(seed, () => lesson.exerciseType.generate({ level: 'cm1' }));
				expect(ex.type).toBe('clicMot');
				if (ex.type !== 'clicMot') continue;
				const cibleTokens = ex.cibleIndices.map((i) => ex.tokens[i]);
				expect(item.kind, id).toBe('text');
				// answer référence bien les tokens STOCKÉS (sans dicter ici la jointure —
				// l'exactitude « et » vs espace est pinée par les attendus littéraux plus bas).
				expect(String(item.answer).length, `${id}@${seed}`).toBeGreaterThan(0);
				for (const tok of cibleTokens) {
					expect(String(item.answer), `${id}@${seed} : « ${tok} » absent`).toContain(tok);
				}
				const texte = String(item.text);
				expect(texte, id).toContain('Recopie');
				expect(texte, `${id} : cibleLabel absent du repli`).toContain(ex.cibleLabel!);
				expect(texte, `${id} : phrase absente du repli`).toContain(joindrePhrase(ex.tokens));
				expect(item._lesson, id).toBe(id);
				// TTS du repli : « Recopie <cibleLabel>. » puis la phrase entière lue.
				expect(item.parle, `${id}@${seed} : parle`).toBe(`Recopie ${ex.cibleLabel}. ${ex.parle}`);
			}
		}
	});

	it('answer référence les tokens-cibles stockés (échantillon large, jamais vide)', () => {
		for (const { id } of NATURES) {
			const lesson = getLessonById(id)!;
			for (let i = 0; i < 120; i++) {
				const seed = i * 7 + 3;
				const item = withSeed(seed, () => genLessonItem(lesson, 'cm1'));
				const ex = withSeed(seed, () => lesson.exerciseType.generate({ level: 'cm1' }));
				if (ex.type !== 'clicMot') continue;
				expect(String(item.answer).length, `${id}@${seed}`).toBeGreaterThan(0);
				for (const i2 of ex.cibleIndices) {
					expect(String(item.answer)).toContain(ex.tokens[i2]);
				}
			}
		}
	});

	it('answer joint par « et » sur cible NON adjacente, par ESPACE si contiguë (littéraux)', () => {
		// Attendus écrits À LA MAIN depuis la règle « et si non contigu » : un test qui
		// recopierait `.join(' ')` (ancien bug) ou `libelleCible` (impl.) serait aveugle.
		const sujet = getLessonById('fr-gram-clic-sujet')!;
		const conj = getLessonById('fr-gram-clic-conj')!;
		const verbe = getLessonById('fr-gram-clic-verbe')!;

		// Sujet composé « Paul … Léa » (« et » sauté par la cible) → réponse « Paul et Léa ».
		expect(answerPourPhrase(sujet, 'cm1', 'Paul et Léa jouent ensemble.')).toBe('Paul et Léa');
		expect(answerPourPhrase(sujet, 'cm1', 'Emma et Chloé chantent gaiement.')).toBe(
			'Emma et Chloé',
		);
		// « ni … ni » (deux « ni » non contigus) → « ni et ni » (jamais « ni ni »).
		expect(answerPourPhrase(conj, 'cm1', 'Il ne mange ni viande ni poisson.')).toBe('ni et ni');
		// Cible CONTIGUË (passé composé, 2 mots) → jointure par une simple espace.
		expect(answerPourPhrase(verbe, 'cm1', 'Léa a mangé une pomme bien mûre.')).toBe('a mangé');
		// Cible simple (1 mot) → le mot seul.
		expect(answerPourPhrase(sujet, 'cm1', 'Le petit chien aboie joyeusement.')).toBe('chien');
	});

	it('parle : la leçon VERBE reçoit aussi le préfixe « Recopie <cibleLabel>. »', () => {
		// Le changement de comportement TTS touche AUSSI le verbe (cibleLabel par défaut).
		const verbe = getLessonById('fr-gram-clic-verbe')!;
		for (const seed of [3, 55, 400]) {
			const item = withSeed(seed, () => genLessonItem(verbe, 'cm1'));
			const ex = withSeed(seed, () => verbe.exerciseType.generate({ level: 'cm1' }));
			if (ex.type !== 'clicMot') continue;
			expect(ex.cibleLabel).toBe('le verbe conjugué');
			expect(item.parle).toBe(`Recopie le verbe conjugué. ${ex.parle}`);
		}
	});
});

/* ---------- Garde-fous de construction : chemins `throw` (données AUTEUR) ---------- */
describe('Garde-fous de construction — entrées auteur invalides lèvent (#437)', () => {
	it('phraseMots : une cible multi-mots est refusée', () => {
		expect(() => phraseMots('Le chat dort.', ['le chat'], { explication: 'x' })).toThrow();
	});
	it('phraseMots : mot ciblé absent (0 occurrence) lève', () => {
		expect(() => phraseMots('Le chat dort.', ['chien'], { explication: 'x' })).toThrow();
	});
	it('phraseMots : mot ciblé 1× mais présent 2× lève (cible ambiguë)', () => {
		expect(() => phraseMots('Le chat et le chien.', ['le'], { explication: 'x' })).toThrow();
	});
	it('phrase : verbe absent (0) et verbe présent 2× lèvent', () => {
		expect(() => phrase('Le chat dort.', 'court')).toThrow();
		expect(() => phrase('Il court et court vite.', 'court')).toThrow();
	});
	it('det : 0 / ≥2 déterminant de la sous-catégorie, ou unique ≠ cible → lève', () => {
		// 0 article dans la phrase
		expect(() => det('Chien mange os.', 'un', 'article')).toThrow();
		// 2 articles
		expect(() => det('Le chat mange le pain.', 'le', 'article')).toThrow();
		// exactement 1 article mais ce n'est pas la cible annoncée
		expect(() => det('Le chat dort.', 'un', 'article')).toThrow();
	});
	it('pron : cible hors du rôle, ou 0 / ≥2 pronoms cliquables du rôle → lève', () => {
		// cible qui n'est pas un pronom sujet
		expect(() => pron('Il court vite.', 'chat', 'sujet')).toThrow();
		// aucun pronom sujet cliquable dans la phrase
		expect(() => pron('Le chat dort.', 'il', 'sujet')).toThrow();
		// deux pronoms sujets cliquables
		expect(() => pron('Il et elle chantent.', 'il', 'sujet')).toThrow();
	});
});
