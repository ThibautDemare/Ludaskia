/* ============================================================
   Grammaire — « Clique sur le verbe » (#259), brique « clique sur le mot ».
   ------------------------------------------------------------
   Logique PURE (aucun DOM) : on éprouve la GÉNÉRATION et les INVARIANTS DE
   DONNÉES, pas le `check` (qui renvoie toujours false : c'est le runner UI qui
   corrige par égalité d'ensembles). La réponse est STOCKÉE à la génération, jamais
   recalculée — on vérifie qu'elle reste cohérente partout (générateur, repli
   non interactif).

   Indépendance auteur ≠ code : les attendus (quel mot est le verbe, la ponctuation
   jamais cible, la typographie de `joindrePhrase`) sont DÉRIVÉS de la consigne, du
   texte des phrases et des règles de langue — pas transcrits de l'implémentation.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	PHRASES_CE2,
	PHRASES_CM1,
	clicVerbeType,
	estPonctuation,
	joindrePhrase,
	CLIC_MOT_LESSONS,
	type PhraseClicMot,
} from '../src/data/francais/grammaire-clic-mot';
import { withSeed } from '../src/core/utils';
import { getLessonById, genLessonItem, isClicMotLesson } from '../src/core/catalog';

const LESSON_ID = 'fr-gram-clic-verbe';
const TYPE = clicVerbeType();

/* Occurrences (INSENSIBLES à la casse) d'une suite de tokens dans une phrase.
   Dérive le garde-fou d'unicité : la forme verbale visée doit apparaître
   exactement une fois (sinon cible ambiguë). Recalculé ici indépendamment. */
function occurrences(tokens: string[], suite: string[]): number {
	let n = 0;
	for (let i = 0; i + suite.length <= tokens.length; i++) {
		let ok = true;
		for (let k = 0; k < suite.length; k++) {
			if (tokens[i + k].toLowerCase() !== suite[k].toLowerCase()) {
				ok = false;
				break;
			}
		}
		if (ok) n++;
	}
	return n;
}

/* Vérifie qu'une cible est BIEN FORMÉE (dérivé de la spec, pas du code) :
   non vide, indices valides, jamais de ponctuation, tokens ADJACENTS (1 mot aux
   temps simples, 2 au passé composé), et suite verbale présente une seule fois. */
function verifieCibleBienFormee(p: PhraseClicMot, contexte = '') {
	const { tokens, cibleIndices } = p;
	const où = contexte || joindrePhrase(tokens);
	expect(cibleIndices.length, où).toBeGreaterThan(0);
	for (const i of cibleIndices) {
		expect(Number.isInteger(i), où).toBe(true);
		expect(i, où).toBeGreaterThanOrEqual(0);
		expect(i, où).toBeLessThan(tokens.length);
		// Un token de ponctuation n'est JAMAIS cliquable → jamais une cible.
		expect(estPonctuation(tokens[i]), `${où} :: token « ${tokens[i]} »`).toBe(false);
	}
	// Indices adjacents (bloc contigu) — auxiliaire + participe collés au passé composé.
	const tri = [...cibleIndices].sort((a, b) => a - b);
	for (let k = 1; k < tri.length; k++) expect(tri[k], où).toBe(tri[k - 1] + 1);
	// La forme verbale visée apparaît EXACTEMENT une fois dans la phrase.
	const suite = cibleIndices.map((i) => tokens[i]);
	expect(occurrences(tokens, suite), `${où} :: « ${suite.join(' ')} »`).toBe(1);
}

/* Retrouve une phrase de banque par son texte reconstruit (clé stable). */
function trouver(banque: PhraseClicMot[], texte: string): PhraseClicMot | undefined {
	return banque.find((p) => joindrePhrase(p.tokens) === texte);
}

describe('Helpers exportés (logique de découpage / typographie)', () => {
	it('estPonctuation : vrai sur les signes isolés, faux sur les mots', () => {
		for (const s of ['.', ',', ';', ':', '!', '?', '…', '«', '»']) {
			expect(estPonctuation(s), s).toBe(true);
		}
		for (const m of ['chat', "l'oiseau", 'grand-mère', 'a', 'Range', 'mangé']) {
			expect(estPonctuation(m), m).toBe(false);
		}
	});

	it('joindrePhrase : ponctuation collée, espace française avant « ; : ! ? »', () => {
		// Règle typographique dérivée de la consigne du module (pas du code).
		expect(joindrePhrase(['Le', 'chat', 'dort', '.'])).toBe('Le chat dort.');
		expect(joindrePhrase(['Viens', 'ici', '!'])).toBe('Viens ici !');
		expect(joindrePhrase(['Tu', 'pars', '?'])).toBe('Tu pars ?');
		expect(joindrePhrase(['Chaque', 'matin', ',', 'le', 'chat', 'boit', '.'])).toBe(
			'Chaque matin, le chat boit.',
		);
	});
});

describe('Invariants de banque — cibles bien formées', () => {
	it('CE2 : chaque phrase a une cible valide, non ponctuée, unique', () => {
		for (const p of PHRASES_CE2) verifieCibleBienFormee(p);
	});
	it('CM1 : idem (banque = CE2 + extras passé composé / inversion / CC)', () => {
		for (const p of PHRASES_CM1) verifieCibleBienFormee(p);
	});

	it('aucune phrase en double dans une banque', () => {
		const ce2 = PHRASES_CE2.map((p) => joindrePhrase(p.tokens));
		expect(new Set(ce2).size, 'doublon CE2').toBe(ce2.length);
		const cm1 = PHRASES_CM1.map((p) => joindrePhrase(p.tokens));
		expect(new Set(cm1).size, 'doublon CM1').toBe(cm1.length);
	});

	it('position du verbe variée (anti-mémorisation)', () => {
		const debuts = new Set(PHRASES_CM1.map((p) => Math.min(...p.cibleIndices)));
		expect(debuts.size).toBeGreaterThanOrEqual(5); // pas toujours le même index
		expect(debuts.has(0)).toBe(true); // verbe en tête (impératif / inversion)
		expect([...debuts].some((d) => d >= 3)).toBe(true); // verbe rejeté (CC en tête, sujet étoffé)
	});
});

describe('Cible = le verbe conjugué visé (attendus dérivés à la main)', () => {
	// Verbe déterminé par LECTURE de la phrase (pas relu du code) : off-by-one sur
	// l'index-cible ou mauvaise forme repérée feraient rougir ces cas.
	it('CE2 : temps simples, impératif, interrogative → cible = 1 mot exact', () => {
		const cas: Array<[string, string]> = [
			['Le chat dort tranquillement sur le canapé.', 'dort'], // présent
			['Nous jouons au ballon dans la cour.', 'jouons'],
			['Le ciel est tout gris ce matin.', 'est'], // être : verbe « discret »
			['Range ta chambre avant le dîner.', 'Range'], // impératif, verbe en tête
			['Tu pars en vacances la semaine prochaine ?', 'pars'], // interrogative
			['Le petit garçon jouait dans le sable.', 'jouait'], // imparfait
			['Nous irons à la piscine demain matin.', 'irons'], // futur
		];
		for (const [texte, verbe] of cas) {
			const p = trouver(PHRASES_CE2, texte);
			expect(p, texte).toBeDefined();
			const cible = p!.cibleIndices.map((i) => p!.tokens[i]).join(' ');
			expect(cible, texte).toBe(verbe);
			expect(p!.cibleIndices.length, texte).toBe(1);
		}
	});

	it('CM1 : passé composé → cible = 2 mots (auxiliaire + participe) ; inversion / CC', () => {
		const cas2mots: Array<[string, string]> = [
			['Léa a mangé une pomme bien mûre.', 'a mangé'],
			['Elle est partie très tôt ce matin.', 'est partie'],
		];
		for (const [texte, verbe] of cas2mots) {
			const p = trouver(PHRASES_CM1, texte);
			expect(p, texte).toBeDefined();
			const cible = p!.cibleIndices.map((i) => p!.tokens[i]).join(' ');
			expect(cible, texte).toBe(verbe);
			expect(p!.cibleIndices.length, texte).toBe(2); // deux mots ADJACENTS
		}
		const cas1mot: Array<[string, string]> = [
			['Que mange le petit lapin gris ?', 'mange'], // inversion nominale (verbe en 2e)
			['Chaque matin, le chat boit du lait.', 'boit'], // CC en tête, verbe rejeté
		];
		for (const [texte, verbe] of cas1mot) {
			const p = trouver(PHRASES_CM1, texte);
			expect(p, texte).toBeDefined();
			const cible = p!.cibleIndices.map((i) => p!.tokens[i]).join(' ');
			expect(cible, texte).toBe(verbe);
			expect(p!.cibleIndices.length, texte).toBe(1);
		}
	});
});

describe('Branchement par niveau (échantillon large)', () => {
	it('CE2 (et niveau absent) : cible TOUJOURS d’un seul mot', () => {
		for (const p of PHRASES_CE2) expect(p.cibleIndices.length).toBe(1);
		for (let i = 0; i < 300; i++) {
			const ce2 = TYPE.generate({ level: 'ce2' });
			const def = TYPE.generate(); // niveau absent → repli CE2
			expect(ce2.type).toBe('clicMot');
			expect(def.type).toBe('clicMot');
			if (ce2.type === 'clicMot') expect(ce2.cibleIndices.length).toBe(1);
			if (def.type === 'clicMot') expect(def.cibleIndices.length).toBe(1);
		}
	});

	it('CM1 : rencontre des cibles de 2 mots ET de 1 mot, jamais plus de 2', () => {
		// La banque contient bien les deux tailles…
		const tailles = PHRASES_CM1.map((p) => p.cibleIndices.length);
		expect(tailles).toContain(2);
		expect(tailles).toContain(1);
		expect(Math.max(...tailles)).toBe(2);
		// …et le générateur CM1 les tire réellement (400 tirages → on croise les deux).
		const vues = new Set<number>();
		for (let i = 0; i < 400; i++) {
			const ex = TYPE.generate({ level: 'cm1' });
			if (ex.type !== 'clicMot') continue;
			expect([1, 2]).toContain(ex.cibleIndices.length);
			vues.add(ex.cibleIndices.length);
		}
		expect(vues.has(1)).toBe(true);
		expect(vues.has(2)).toBe(true);
	});

	it('generate : cibles bien formées, parle = phrase reconstruite (CE2 et CM1)', () => {
		for (const level of ['ce2', 'cm1'] as const) {
			for (let i = 0; i < 200; i++) {
				const ex = TYPE.generate({ level });
				expect(ex.type).toBe('clicMot');
				if (ex.type !== 'clicMot') continue;
				verifieCibleBienFormee(ex, `generate(${level})`);
				expect(ex.parle).toBe(joindrePhrase(ex.tokens)); // texte lu = phrase entière
				expect(ex.consigne.length).toBeGreaterThan(0);
			}
		}
	});

	it('consigne CM1 signale le multi-mots ; CE2 non', () => {
		const ce2 = TYPE.generate({ level: 'ce2' });
		const cm1 = TYPE.generate({ level: 'cm1' });
		if (ce2.type === 'clicMot') expect(ce2.consigne.toLowerCase()).not.toContain('deux mots');
		if (cm1.type === 'clicMot') expect(cm1.consigne.toLowerCase()).toContain('deux mots');
	});
});

describe('Déterminisme du tirage (seed injecté)', () => {
	it('même graine ⇒ item identique (tokens + cibleIndices)', () => {
		for (const level of ['ce2', 'cm1'] as const) {
			for (const seed of [3, 17, 88, 256, 1000]) {
				const a = withSeed(seed, () => TYPE.generate({ level }));
				const b = withSeed(seed, () => TYPE.generate({ level }));
				expect(b).toEqual(a); // arrays profondément égales
			}
		}
	});

	it('générateur non figé : des graines différentes donnent des phrases variées', () => {
		const vus = new Set<string>();
		for (let seed = 1; seed <= 12; seed++) {
			vus.add(withSeed(seed, () => JSON.stringify(TYPE.generate({ level: 'cm1' }))));
		}
		expect(vus.size).toBeGreaterThan(1);
	});
});

describe('Catalogue & classification', () => {
	it('fr-gram-clic-verbe : grammaire française, niveaux CE2 + CM1, clicMot', () => {
		const def = getLessonById(LESSON_ID);
		expect(def).toBeDefined();
		expect(def!.subject).toBe('francais');
		expect(def!.category).toBe('fr-grammaire');
		expect(def!.levels).toEqual(['ce2', 'cm1']);
		expect(def!.label).toBe('Clique sur le verbe');
		expect(def!.exerciseType.exerciseKind).toBe('clicMot');
		// isClicMotLesson est CE que le filtre du sprint utilise pour l'écarter du
		// tirage « une réponse à la fois » (comme probleme / appariement). L'exclusion
		// passe par ce helper, PAS par un flag excludeFromSprint (non posé ici).
		expect(isClicMotLesson(def!)).toBe(true);
	});

	it('CLIC_MOT_LESSONS déclare bien la leçon', () => {
		expect(CLIC_MOT_LESSONS.map((l) => l.id)).toContain(LESSON_ID);
	});

	it('isClicMotLesson : faux pour une leçon d’un autre format', () => {
		expect(isClicMotLesson(getLessonById('fr-conj-etre-present')!)).toBe(false);
		expect(isClicMotLesson(getLessonById('fr-gram-classes')!)).toBe(false);
	});
});

describe('Repli non interactif (bilan / révision) via genLessonItem', () => {
	const lesson = getLessonById(LESSON_ID)!;

	it('réponse = verbe stocké, texte = phrase montrée (cross-check seedé, CE2 & CM1)', () => {
		// Sous une même graine, genLessonItem et generate consomment le MÊME tirage
		// (choice) → on connaît la phrase servie et on DÉRIVE le verbe attendu depuis
		// ses tokens+cibleIndices (pas depuis le repli lui-même).
		for (const level of ['ce2', 'cm1'] as const) {
			for (const seed of [1, 7, 42, 123, 999, 2024]) {
				const item = withSeed(seed, () => genLessonItem(lesson, level));
				const ex = withSeed(seed, () => lesson.exerciseType.generate({ level }));
				expect(ex.type).toBe('clicMot');
				if (ex.type !== 'clicMot') continue;
				const verbeAttendu = ex.cibleIndices.map((i) => ex.tokens[i]).join(' ');
				expect(item.kind).toBe('text'); // pas de saisie numérique
				expect(item.answer).toBe(verbeAttendu); // 1 mot, ou 2 au passé composé
				expect(item.text).toContain(joindrePhrase(ex.tokens)); // la phrase est montrée
				expect(item._lesson).toBe(LESSON_ID);
			}
		}
	});

	it('ne plante jamais et rend une réponse non vide (échantillon large)', () => {
		for (let i = 0; i < 200; i++) {
			const item = genLessonItem(lesson, 'cm1');
			expect(item.kind).toBe('text');
			expect(String(item.answer).length).toBeGreaterThan(0);
		}
	});
});
