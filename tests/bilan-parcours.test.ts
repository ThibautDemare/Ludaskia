/* ============================================================
   Parcours de bilan en une session (#777) : logique pure de `src/core/bilan-parcours.ts`.

   Écrit AVANT l'implémentation (#777, skill /cadrer) : rouge à l'arrivée. Le module
   n'existe pas encore, l'import rouge est voulu.

   Ce que ce fichier tient :
   - critère 13 : `verdictLecon` (Réussi / Presque / À retravailler), à toutes les bornes,
     contre un oracle en arithmétique entière dérivé du texte de l'issue ;
   - critère 8 : `planifierParties` (une catégorie par partie, leçon jamais coupée, ordre
     d'entrée conservé, plafond de 15 sauf leçon seule plus grosse, nombre de parties
     MINIMAL), sur cas construits et 600 entrées aléatoires contre un oracle par
     programmation dynamique ; `construireParcours` sur une config passée dans le désordre ;
   - socle du critère 7 : `questionsDuBilan` sert les vraies formes de la révision (QCM avec
     ses choix, « clique sur le mot » et pas une recopie), sans doublon ; `nbQuestionsLecon` ;
   - critère 10 (et la forme des erreurs des critères 11-12) : `corrigerQuestion` pour
     chaque format, réponse juste, réponse fausse, question passée.

   Chaque prédicat maison a ses témoins (en fin de fichier) : une entrée fabriquée portant
   exactement le défaut annoncé est signalée, et le cas sain ne l'est pas.

   Hors de portée ici : « chaque leçon au niveau effectif du profil » (il faudrait changer
   la classe du profil, ce que ce fichier ne fait pas), la règle des 60 % de réponses
   (critère 10, absente du contrat du module), l'affichage (critères 9, 11, 17, 18 → e2e).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	verdictLecon,
	planifierParties,
	PLAFOND_PARTIE,
	nbQuestionsLecon,
	questionsDuBilan,
	construireParcours,
	corrigerQuestion,
	type VerdictLecon,
	type LeconPlanifiee,
	type PartiePlan,
	type PartieBilan,
	type ReponseQuestion,
	type Correction,
	type ErreurCorrigee,
} from '../src/core/bilan-parcours';
import {
	CATEGORIES,
	getAllLessons,
	getLessonById,
	getLessonsByCategory,
	isLegacyMathLesson,
	type BilanConfig,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import { questionDeRevision, type QuestionRevision } from '../src/core/revision-question';
import { QUESTIONS_PAR_FICHE } from '../src/core/build';
import { checkItemAnswer, dispositionPosee, type Item, type PosedSpec } from '../src/core/items';
import { withSeed } from '../src/core/utils';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Outils communs ---------- */

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon ${id} absente du catalogue`);
	return l;
};

const niveauxDe = (lesson: LessonDef): SchoolLevel[] =>
	lesson.levels.length > 0 ? lesson.levels : ['ce2'];

/** Nombre écrit comme le tape l'enfant : virgule décimale. */
const nombreFr = (n: number): string => String(n).replace('.', ',');

/** « Un de plus » sur une réponse écrite en chiffres (« 1,59 » → « 2,59 »), en touchant
    la partie entière seulement : aucun flottant, donc aucune réponse « presque juste »
    fabriquée par arrondi. `null` si la réponse n'est pas un nombre. */
function plusUn(reponse: string): string | null {
	const compacte = reponse.replace(/\s/g, '');
	const m = /^(-?\d+)(,\d+)?$/.exec(compacte);
	if (!m) return null;
	return `${Number(m[1]) + 1}${m[2] ?? ''}`;
}

/** Espaces de milliers sur la partie entière (« 6643 » → « 6 643 »). */
function grouperMilliers(reponse: string, espace = ' '): string {
	const [entier, decimales] = reponse.split(',');
	const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, espace);
	return decimales === undefined ? groupe : `${groupe},${decimales}`;
}

/* Espaces insécables construites par leur code (ESLint `no-irregular-whitespace`). */
const INSECABLE = String.fromCharCode(0x00a0);

/** Cellules à TROUVER d'une opération posée (`role: 'saisie'`, produits partiels compris),
    en ordre de lecture : rangée par rangée, de gauche à droite. */
function cellulesATrouver(spec: PosedSpec): string[] {
	return dispositionPosee(spec).rangees.flatMap((r) =>
		r.cellules.flatMap((c) => (c.role === 'saisie' ? [c.chiffre] : [])),
	);
}

/** Texte « lu » : espaces réduits (`\s` couvre aussi les insécables). */
const lu = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Clé de doublon d'une question : ce que l'enfant voit et doit trouver. L'ORDRE des choix,
    des tuiles ou des paires n'en fait pas partie : deux tirages qui ne diffèrent que par le
    mélange sont la même question posée deux fois. */
function cleQuestion(q: QuestionRevision): string {
	switch (q.kind) {
		case 'num':
			return [
				'num',
				q.item.text,
				String(q.item.answer),
				JSON.stringify(q.item.posed ?? null),
				q.item.figure?.balisage ?? '',
			].join('¦');
		case 'qcm':
			return ['qcm', q.item.text, String(q.item.answer), q.item.figure?.balisage ?? ''].join('¦');
		case 'tuile':
			return ['tuile', q.question, q.answer].join('¦');
		case 'ordre':
			return ['ordre', q.question, q.ordre.join('|')].join('¦');
		case 'tri':
			return [
				'tri',
				q.question,
				q.mots
					.map((m) => `${m.mot}:${m.cat}`)
					.sort()
					.join('|'),
			].join('¦');
		case 'appariement':
			return [
				'appariement',
				q.question,
				q.paires
					.map((p) => `${p.gauche}>${p.droite}`)
					.sort()
					.join('|'),
			].join('¦');
		case 'probleme':
			return [
				'probleme',
				q.enonce,
				q.etapes.map((e) => `${e.question}=${e.answer}`).join('|'),
				q.figure?.balisage ?? '',
			].join('¦');
		case 'clicMot':
			return ['clicMot', q.actionConsigne, q.tokens.join(' '), q.cibleIndices.join(',')].join('¦');
	}
}

const doublons = (qs: QuestionRevision[]): string[] => {
	const vues = new Set<string>();
	const d: string[] = [];
	for (const q of qs) {
		const k = cleQuestion(q);
		if (vues.has(k)) d.push(k);
		vues.add(k);
	}
	return d;
};

/* ============================================================
   Critère 13 — verdict par leçon.
   ============================================================ */

/** Oracle du critère 13, en ARITHMÉTIQUE ENTIÈRE (aucun flottant) :
    - N ≤ 3 : tout juste → réussi, sinon à retravailler ;
    - N ≥ 4 : réussies ≥ ⌈0,8 × N⌉ ⇔ 5 × réussies ≥ 4 × N (réussies est entier) ;
      réussies < N/2 ⇔ 2 × réussies < N ; presque entre les deux. */
function verdictAttendu(reussies: number, posees: number): VerdictLecon {
	if (posees <= 3) return reussies === posees ? 'reussi' : 'a-retravailler';
	if (5 * reussies >= 4 * posees) return 'reussi';
	if (2 * reussies < posees) return 'a-retravailler';
	return 'presque';
}

const intervalle = (de: number, a: number): number[] =>
	Array.from({ length: a - de + 1 }, (_, k) => de + k);

/* Paliers recalculés à la main, case par case. 5, 10 et 12 sont les exemples de l'issue ;
   1 à 4 et 8 en sont dérivés : ⌈0,8 × 4⌉ = 4, ⌈0,8 × 8⌉ = ⌈6,4⌉ = 7 ; 4/2 = 2, 8/2 = 4. */
const PALIERS: { n: number; reussi: number[]; presque: number[]; aRetravailler: number[] }[] = [
	{ n: 1, reussi: [1], presque: [], aRetravailler: [0] },
	{ n: 2, reussi: [2], presque: [], aRetravailler: [0, 1] },
	{ n: 3, reussi: [3], presque: [], aRetravailler: [0, 1, 2] },
	{ n: 4, reussi: [4], presque: [2, 3], aRetravailler: [0, 1] },
	{ n: 5, reussi: [4, 5], presque: [3], aRetravailler: [0, 1, 2] },
	{ n: 8, reussi: [7, 8], presque: [4, 5, 6], aRetravailler: intervalle(0, 3) },
	{ n: 10, reussi: [8, 9, 10], presque: [5, 6, 7], aRetravailler: intervalle(0, 4) },
	{ n: 12, reussi: intervalle(10, 12), presque: intervalle(6, 9), aRetravailler: intervalle(0, 5) },
];

describe('Critère 13 : verdict par leçon (verdictLecon)', () => {
	for (const p of PALIERS) {
		it(`critère 13 : sur ${p.n} question(s), chaque score de 0 à ${p.n} a son verdict`, () => {
			const obtenus = intervalle(0, p.n).map((r) => `${r}/${p.n} → ${verdictLecon(r, p.n)}`);
			const attendus = intervalle(0, p.n).map((r) => {
				const v: VerdictLecon = p.reussi.includes(r)
					? 'reussi'
					: p.presque.includes(r)
						? 'presque'
						: 'a-retravailler';
				return `${r}/${p.n} → ${v}`;
			});
			expect(obtenus).toEqual(attendus);
		});
	}

	it('critère 13 : jamais « presque » sur 3 questions ou moins', () => {
		const presque = [1, 2, 3].flatMap((n) =>
			intervalle(0, n)
				.filter((r) => verdictLecon(r, n) === 'presque')
				.map((r) => `${r}/${n}`),
		);
		expect(presque).toEqual([]);
	});

	it('critère 13 : de 1 à 30 questions, tout score suit la règle de l’issue', () => {
		const ecarts: string[] = [];
		for (let n = 1; n <= 30; n++) {
			for (let r = 0; r <= n; r++) {
				const v = verdictLecon(r, n);
				if (v !== verdictAttendu(r, n))
					ecarts.push(`${r}/${n} : ${v} au lieu de ${verdictAttendu(r, n)}`);
			}
		}
		expect(ecarts).toEqual([]);
	});

	it('critère 13 : une réussite de plus ne dégrade jamais le verdict', () => {
		const rang: Record<VerdictLecon, number> = { 'a-retravailler': 0, presque: 1, reussi: 2 };
		const reculs: string[] = [];
		for (let n = 1; n <= 30; n++) {
			for (let r = 1; r <= n; r++) {
				if (rang[verdictLecon(r, n)] < rang[verdictLecon(r - 1, n)])
					reculs.push(`${r - 1}→${r} sur ${n}`);
			}
		}
		expect(reculs).toEqual([]);
	});
});

/* ============================================================
   Critère 8 — découpage en parties.
   ============================================================ */

/** Entrée de planification depuis une liste [catégorie, nombre de questions] ; les
    identifiants de leçon sont uniques (`l0`, `l1`…). */
const entree = (spec: [string, number][]): LeconPlanifiee[] =>
	spec.map(([categoryId, nbQuestions], i) => ({ lessonId: `l${i}`, categoryId, nbQuestions }));

/** Nombre MINIMAL de parties, par programmation dynamique sur les découpages en segments
    consécutifs. Un segment est valide s'il ne contient qu'une catégorie et s'il tient sous
    le plafond, ou s'il ne compte qu'une leçon (seule exception de l'issue). Explore tous
    les découpages : ne présume pas qu'un remplissage glouton soit optimal. */
function partiesMinimales(e: LeconPlanifiee[], plafond: number): number {
	const meilleur: number[] = new Array<number>(e.length + 1).fill(Number.POSITIVE_INFINITY);
	meilleur[0] = 0;
	for (let fin = 1; fin <= e.length; fin++) {
		let somme = 0;
		for (let debut = fin - 1; debut >= 0; debut--) {
			if (e[debut].categoryId !== e[fin - 1].categoryId) break;
			somme += e[debut].nbQuestions;
			// Plus d'une leçon au-delà du plafond : invalide, et l'allonger n'y change rien.
			if (debut < fin - 1 && somme > plafond) break;
			meilleur[fin] = Math.min(meilleur[fin], meilleur[debut] + 1);
		}
	}
	return meilleur[e.length];
}

/** Défauts d'un plan au regard du critère 8. Liste vide = plan conforme. */
function defautsPlan(e: LeconPlanifiee[], plan: PartiePlan[], plafond: number): string[] {
	const d: string[] = [];
	const parId = new Map(e.map((l) => [l.lessonId, l]));
	// Ordre conservé, leçon jamais coupée, rien perdu ni dupliqué : la concaténation des
	// parties redonne exactement la liste d'entrée.
	const concat = plan.flatMap((p) => p.lessonIds);
	const ids = e.map((l) => l.lessonId);
	if (JSON.stringify(concat) !== JSON.stringify(ids)) {
		d.push(`leçons ${JSON.stringify(concat)} au lieu de ${JSON.stringify(ids)}`);
	}
	plan.forEach((p, k) => {
		if (p.lessonIds.length === 0) d.push(`partie ${k + 1} vide`);
		const cats = new Set(p.lessonIds.map((id) => parId.get(id)?.categoryId));
		if (cats.size > 1 || !cats.has(p.categoryId)) {
			d.push(`partie ${k + 1} (${p.categoryId}) mêle ${JSON.stringify([...cats])}`);
		}
		const somme = p.lessonIds.reduce((s, id) => s + (parId.get(id)?.nbQuestions ?? 0), 0);
		if (p.nbQuestions !== somme)
			d.push(`partie ${k + 1} : nbQuestions ${p.nbQuestions} au lieu de ${somme}`);
		if (somme > plafond && p.lessonIds.length > 1) {
			d.push(
				`partie ${k + 1} : ${somme} questions sur ${p.lessonIds.length} leçons (plafond ${plafond})`,
			);
		}
	});
	const minimum = partiesMinimales(e, plafond);
	if (plan.length !== minimum) d.push(`${plan.length} parties au lieu de ${minimum}`);
	return d;
}

const planifier = (e: LeconPlanifiee[], plafond?: number): PartiePlan[] =>
	plafond === undefined ? planifierParties(e) : planifierParties(e, plafond);

/** Générateur pseudo-aléatoire reproductible (mulberry32) : les entrées aléatoires ne
    dépendent pas de `Math.random`. */
function prng(graine: number): () => number {
	let a = graine >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe('Critère 8 : découpage en parties (planifierParties)', () => {
	it('critère 8 : le plafond d’une partie vaut 15 questions', () => {
		expect(PLAFOND_PARTIE).toBe(15);
	});

	it('critère 8 : aucune leçon, aucune partie', () => {
		expect(planifierParties([])).toEqual([]);
	});

	it('critère 8 : 13 leçons de 3 questions d’une même catégorie → 3 parties', () => {
		const e = entree(Array.from({ length: 13 }, (): [string, number] => ['math-numeration', 3]));
		const plan = planifierParties(e);
		expect(defautsPlan(e, plan, 15)).toEqual([]);
		expect(plan).toHaveLength(3);
	});

	it('critère 8 : une leçon de 20 questions, seule → 1 partie de 20', () => {
		const e = entree([['math-calcul-mental', 20]]);
		expect(planifierParties(e)).toEqual([
			{ categoryId: 'math-calcul-mental', lessonIds: ['l0'], nbQuestions: 20 },
		]);
	});

	it('critère 8 : une catégorie de 3 questions fait sa partie de 3, même s’il reste de la place ailleurs', () => {
		const e = entree([
			['math-numeration', 5],
			['math-numeration', 5],
			['fr-grammaire', 3],
		]);
		const plan = planifierParties(e);
		expect(defautsPlan(e, plan, 15)).toEqual([]);
		expect(plan[plan.length - 1]).toEqual({
			categoryId: 'fr-grammaire',
			lessonIds: ['l2'],
			nbQuestions: 3,
		});
	});

	it('critère 8 : exactement 15 questions tiennent en une partie, 16 non', () => {
		const quinze = entree([
			['A', 5],
			['A', 5],
			['A', 5],
		]);
		expect(planifierParties(quinze)).toHaveLength(1);
		const seize = entree([
			['A', 5],
			['A', 5],
			['A', 5],
			['A', 1],
		]);
		const plan = planifierParties(seize);
		expect(defautsPlan(seize, plan, 15)).toEqual([]);
		expect(plan).toHaveLength(2);
	});

	it('critère 8 : une leçon plus grosse que le plafond reste seule, sans absorber ses voisines', () => {
		const e = entree([
			['A', 5],
			['A', 20],
			['A', 5],
		]);
		const plan = planifierParties(e);
		expect(defautsPlan(e, plan, 15)).toEqual([]);
		expect(plan.map((p) => p.nbQuestions)).toEqual([5, 20, 5]);
	});

	it('critère 8 : une catégorie qui revient plus loin n’est pas regroupée (rien n’est réordonné)', () => {
		const e = entree([
			['A', 3],
			['B', 3],
			['A', 3],
		]);
		const plan = planifierParties(e);
		expect(defautsPlan(e, plan, 15)).toEqual([]);
		expect(plan.map((p) => p.categoryId)).toEqual(['A', 'B', 'A']);
	});

	it('critère 8 : le plafond passé en paramètre remplace 15', () => {
		const e = entree([
			['A', 2],
			['A', 2],
			['A', 2],
		]);
		const plan = planifierParties(e, 4);
		expect(defautsPlan(e, plan, 4)).toEqual([]);
		expect(plan).toHaveLength(2);
	});

	it('critère 8 : sur 600 entrées aléatoires, tous les invariants et le nombre minimal de parties', () => {
		const fautes: string[] = [];
		for (let graine = 1; graine <= 600; graine++) {
			const r = prng(graine);
			const n = 1 + Math.floor(r() * 18);
			const spec: [string, number][] = [];
			let cat = 'A';
			for (let i = 0; i < n; i++) {
				if (r() < 0.3) cat = ['A', 'B', 'C'][Math.floor(r() * 3)];
				// Surtout de petites leçons, parfois une plus grosse que le plafond.
				const nb = r() < 0.15 ? 11 + Math.floor(r() * 15) : 1 + Math.floor(r() * 10);
				spec.push([cat, nb]);
			}
			const plafond = graine % 2 === 0 ? undefined : 1 + Math.floor(r() * 20);
			const e = entree(spec);
			const d = defautsPlan(e, planifier(e, plafond), plafond ?? 15);
			if (d.length > 0)
				fautes.push(
					`graine ${graine} ${JSON.stringify(spec)} plafond ${plafond ?? 15} : ${d.join(' ; ')}`,
				);
		}
		expect(fautes.slice(0, 5), `${fautes.length} entrée(s) fautive(s)`).toEqual([]);
	});
});

/* ============================================================
   Socle du critère 7 — questions servies, et leur nombre.
   ============================================================ */
const MODERNES = getAllLessons().filter((l) => !isLegacyMathLesson(l));
const HERITEES = getAllLessons().filter(isLegacyMathLesson);

describe('Réglage « questions par leçon » (nbQuestionsLecon)', () => {
	it('un nombre réglé (3, 5, 10) est rendu tel quel, leçon moderne ou héritée', () => {
		for (const id of ['fr-homophones-et', 'math-complements']) {
			for (const n of [3, 5, 10]) expect(nbQuestionsLecon(lecon(id), n), `${id} × ${n}`).toBe(n);
		}
	});

	it('« Tout » sur une leçon moderne = autant que la fiche (QUESTIONS_PAR_FICHE)', () => {
		expect(MODERNES.length).toBeGreaterThanOrEqual(100);
		const ecarts = MODERNES.filter((l) => nbQuestionsLecon(l, 'all') !== QUESTIONS_PAR_FICHE).map(
			(l) => `${l.id} : ${nbQuestionsLecon(l, 'all')}`,
		);
		expect(ecarts).toEqual([]);
	});

	it('« Tout » sur une leçon du calcul mental hérité = un nombre entier d’au moins 1', () => {
		expect(HERITEES.length).toBeGreaterThanOrEqual(15);
		const ecarts = HERITEES.map((l) => ({ id: l.id, n: nbQuestionsLecon(l, 'all') }))
			.filter(({ n }) => !Number.isInteger(n) || n < 1)
			.map(({ id, n }) => `${id} : ${n}`);
		expect(ecarts).toEqual([]);
	});
});

describe('Socle du critère 7 : questions d’une leçon (questionsDuBilan)', () => {
	it('math-complements, 5 demandées : exactement 5, toutes de la leçon, sans doublon', () => {
		for (const graine of [1, 2, 3]) {
			const qs = withSeed(graine, () => questionsDuBilan(lecon('math-complements'), 5, 'ce2'));
			expect(qs, `graine ${graine}`).toHaveLength(5);
			expect(qs.filter((q) => q.lessonId !== 'math-complements')).toEqual([]);
			expect(doublons(qs)).toEqual([]);
		}
	});

	it('une leçon QCM sert des QCM dont les choix contiennent la réponse', () => {
		for (const graine of [1, 2, 3]) {
			const qs = withSeed(graine, () => questionsDuBilan(lecon('fr-homophones-et'), 5, 'ce2'));
			expect(qs.length).toBeGreaterThanOrEqual(1);
			for (const q of qs) {
				expect(q.kind, JSON.stringify(q)).toBe('qcm');
				if (q.kind === 'qcm') expect(q.choices).toContain(String(q.item.answer));
			}
		}
	});

	it('« Clique sur le verbe » sert le vrai widget (clicMot), pas une recopie, au CE2 comme au CM1', () => {
		for (const niveau of ['ce2', 'cm1'] as const) {
			const qs = withSeed(7, () => questionsDuBilan(lecon('fr-gram-clic-verbe'), 5, niveau));
			expect(qs.length).toBeGreaterThanOrEqual(1);
			expect(
				qs.map((q) => q.kind).filter((k) => k !== 'clicMot'),
				niveau,
			).toEqual([]);
		}
	});

	/* Banque courte : « être au présent » a moins de 10 questions distinctes (mesuré sur
	   400 tirages, et vérifié ci-dessous). Demander 10 doit rendre toute la banque, une
	   fois chaque question, et pas 10 avec des répétitions. */
	it('banque plus courte que demandé : toute la banque, sans doublon, jamais n répétitions', () => {
		const l = lecon('fr-conj-etre-present');
		const banque = new Set(
			intervalle(1, 400).flatMap((g) => {
				const q = withSeed(g, () => questionDeRevision(l, 'ce2'));
				return q ? [cleQuestion(q)] : [];
			}),
		);
		expect(banque.size, 'précondition : banque courte').toBeLessThan(10);
		for (const graine of [1, 2, 3]) {
			const qs = withSeed(graine, () => questionsDuBilan(l, 10, 'ce2'));
			expect(doublons(qs), `graine ${graine}`).toEqual([]);
			expect(qs.length, `graine ${graine}`).toBe(banque.size);
		}
	});

	it('jamais plus que demandé ni zéro, sur tout le catalogue (n = 3)', () => {
		expect(getAllLessons().length).toBeGreaterThanOrEqual(150);
		const fautes: string[] = [];
		for (const l of getAllLessons()) {
			for (const niveau of niveauxDe(l)) {
				const qs = withSeed(11, () => questionsDuBilan(l, 3, niveau));
				if (qs.length < 1 || qs.length > 3)
					fautes.push(`${l.id} @${niveau} : ${qs.length} question(s)`);
				else if (qs.some((q) => q.lessonId !== l.id))
					fautes.push(`${l.id} @${niveau} : question d'une autre leçon`);
				else if (doublons(qs).length > 0) fautes.push(`${l.id} @${niveau} : doublon`);
			}
		}
		expect(fautes).toEqual([]);
	});
});

/* ============================================================
   Critère 8 — le parcours construit depuis un favori.
   ============================================================ */

/* Ordre attendu, écrit à la main : catégories dans l'ordre de `CATEGORIES`, leçons dans
   l'ordre du catalogue. Choisies pour que l'ordre de DÉCLARATION et l'ordre PÉDAGOGIQUE
   (CE2 et CM1) coïncident : le test vaut quelle que soit la lecture retenue de « ordre du
   catalogue » (cf. précondition ci-dessous). Calcul mental : 4 leçons × 5 = 20 questions,
   donc au moins deux parties. */
const ORDRE_ATTENDU = [
	'num-decompose-100',
	'num-decompose-1000',
	'math-tables-addition',
	'math-complements',
	'math-doubles',
	'math-moities',
	'mes-longueurs',
	'mes-masses',
	'fr-gram-clic-verbe',
	'fr-conj-etre-present',
	'fr-homophones-a',
	'fr-homophones-et',
];

/** La même sélection, dans le désordre. */
const FAVORI: BilanConfig = {
	id: 'bilan-777',
	label: 'Bilan des vacances',
	lessonIds: [
		'fr-homophones-et',
		'math-moities',
		'fr-gram-clic-verbe',
		'mes-masses',
		'num-decompose-1000',
		'math-tables-addition',
		'fr-conj-etre-present',
		'math-doubles',
		'mes-longueurs',
		'fr-homophones-a',
		'num-decompose-100',
		'math-complements',
	],
	questionsPerLesson: 5,
};

const categorieDe = (lessonId: string): string => getLessonById(lessonId)?.category ?? '?';

/** Suites de leçons du parcours (une entrée par série consécutive de questions). */
const seriesDeLecons = (parcours: PartieBilan[]): string[] =>
	parcours
		.flatMap((p) => p.questions.map((q) => q.lessonId))
		.filter((id, i, tous) => i === 0 || tous[i - 1] !== id);

/** Défauts structurels d'un parcours : partie vide, catégories mêlées, plafond dépassé
    à plusieurs leçons, leçon dont les questions ne se suivent pas. */
function defautsParcours(parcours: PartieBilan[]): string[] {
	const d: string[] = [];
	parcours.forEach((p, k) => {
		if (p.questions.length === 0) d.push(`partie ${k + 1} vide`);
		const cats = new Set(p.questions.map((q) => categorieDe(q.lessonId)));
		if (cats.size > 1 || !cats.has(p.categoryId)) {
			d.push(`partie ${k + 1} (${p.categoryId}) mêle ${JSON.stringify([...cats])}`);
		}
		const lecons = new Set(p.questions.map((q) => q.lessonId));
		if (p.questions.length > PLAFOND_PARTIE && lecons.size > 1) {
			d.push(`partie ${k + 1} : ${p.questions.length} questions sur ${lecons.size} leçons`);
		}
	});
	const series = seriesDeLecons(parcours);
	const coupees = series.filter((id, i) => series.indexOf(id) !== i);
	if (coupees.length > 0)
		d.push(`questions non consécutives pour ${JSON.stringify([...new Set(coupees)])}`);
	return d;
}

describe('Critère 8 : parcours d’un favori (construireParcours)', () => {
	it('précondition : l’ordre attendu suit CATEGORIES, et la déclaration comme l’ordre pédagogique', () => {
		const rangCat = (id: string): number => CATEGORIES.findIndex((c) => c.id === categorieDe(id));
		const fautes: string[] = [];
		ORDRE_ATTENDU.forEach((id, i) => {
			if (!lecon(id).levels.includes('ce2')) fautes.push(`${id} hors CE2`);
			if (i === 0) return;
			const prec = ORDRE_ATTENDU[i - 1];
			if (rangCat(prec) > rangCat(id)) fautes.push(`${prec} avant ${id} : catégories à rebours`);
			if (categorieDe(prec) !== categorieDe(id)) return;
			const cat = lecon(id).category;
			const ordres: [string, string[]][] = [
				['déclaration', getLessonsByCategory(cat).map((l) => l.id)],
				['CE2', getLessonsByCategory(cat, 'ce2').map((l) => l.id)],
				['CM1', getLessonsByCategory(cat, 'cm1').map((l) => l.id)],
			];
			for (const [nom, ordre] of ordres) {
				const a = ordre.indexOf(prec);
				const b = ordre.indexOf(id);
				if (a >= 0 && b >= 0 && a > b) fautes.push(`${prec} après ${id} dans l'ordre ${nom}`);
			}
		});
		expect(fautes).toEqual([]);
		expect([...FAVORI.lessonIds].sort()).toEqual([...ORDRE_ATTENDU].sort());
	});

	it('critère 8 : favori dans le désordre → leçons dans l’ordre du catalogue, chacune d’un seul tenant', () => {
		const parcours = withSeed(3, () => construireParcours(FAVORI));
		expect(seriesDeLecons(parcours)).toEqual(ORDRE_ATTENDU);
	});

	it('critère 8 : aucune partie ne mêle deux catégories ni ne dépasse 15 questions à plusieurs leçons', () => {
		const parcours = withSeed(3, () => construireParcours(FAVORI));
		expect(defautsParcours(parcours)).toEqual([]);
	});

	it('critère 8 : catégories des parties dans l’ordre de CATEGORIES, et nombre de parties minimal', () => {
		const parcours = withSeed(3, () => construireParcours(FAVORI));
		const cats = parcours.map((p) => p.categoryId);
		const rangs = cats.map((c) => CATEGORIES.findIndex((x) => x.id === c));
		expect(
			rangs.every((r, i) => r >= 0 && (i === 0 || rangs[i - 1] <= r)),
			JSON.stringify(cats),
		).toBe(true);
		// Le minimum se recalcule sur les tailles RÉELLES des leçons servies.
		const tailles = seriesDeLecons(parcours).map((id) => ({
			lessonId: id,
			categoryId: categorieDe(id),
			nbQuestions: parcours.flatMap((p) => p.questions).filter((q) => q.lessonId === id).length,
		}));
		expect(parcours).toHaveLength(partiesMinimales(tailles, PLAFOND_PARTIE));
		// Calcul mental (20 questions) : au moins deux parties.
		expect(cats.filter((c) => c === 'math-calcul-mental').length).toBeGreaterThanOrEqual(2);
	});

	it('critère 8 : 5 questions par leçon, total = somme des nbQuestionsLecon (60)', () => {
		const parcours = withSeed(3, () => construireParcours(FAVORI));
		const toutes = parcours.flatMap((p) => p.questions);
		const attendu = FAVORI.lessonIds.reduce((s, id) => s + nbQuestionsLecon(lecon(id), 5), 0);
		expect(attendu).toBe(60);
		expect(toutes).toHaveLength(attendu);
		for (const id of ORDRE_ATTENDU) {
			expect(
				toutes.filter((q) => q.lessonId === id),
				id,
			).toHaveLength(5);
		}
	});

	it('critère 8 : un favori qui cite une leçon disparue du catalogue se lance sans elle', () => {
		const ancien: BilanConfig = {
			id: 'bilan-ancien',
			label: 'Ancien favori',
			lessonIds: ['fr-homophones-et', 'lecon-disparue-depuis', 'math-complements'],
			questionsPerLesson: 3,
		};
		const parcours = withSeed(5, () => construireParcours(ancien));
		expect(seriesDeLecons(parcours)).toEqual(['math-complements', 'fr-homophones-et']);
		expect(defautsParcours(parcours)).toEqual([]);
	});
});

/* ============================================================
   Critère 10 — correction différée d'une question (corrigerQuestion).
   ============================================================ */

/** Défauts d'une erreur corrigée : ce que verra l'enfant en fin de partie (critère 11) et
    ce que reçoit le journal du parent (critère 12). */
function defautsErreur(e: ErreurCorrigee): string[] {
	const d: string[] = [];
	if (e.enonce.trim() === '') d.push('énoncé vide');
	if (e.enonce.includes('@')) d.push(`« @ » dans l'énoncé « ${e.enonce} »`);
	if (e.enonce.includes('**')) d.push(`« ** » dans l'énoncé « ${e.enonce} »`);
	if (e.attendue.trim() === '') d.push('réponse attendue vide');
	if (e.sansTentative !== true && e.donnee.trim() === '')
		d.push('réponse donnée vide hors « sansTentative »');
	for (const champ of [e.enonce, e.donnee, e.attendue]) {
		if (/undefined|NaN|\[object/.test(champ)) d.push(`valeur technique dans « ${champ} »`);
	}
	return d;
}

/** Défauts d'une question PASSÉE : fausse, une seule erreur, sans tentative, donnée vide. */
function defautsPasse(c: Correction): string[] {
	if (c.reussi) return ['question passée jugée réussie'];
	if (c.erreurs.length !== 1) return [`${c.erreurs.length} erreurs au lieu d'une`];
	const e = c.erreurs[0];
	const d = defautsErreur(e);
	if (e.sansTentative !== true) d.push('sansTentative absent');
	if (e.donnee !== '') d.push(`donnée « ${e.donnee} » au lieu de vide`);
	return d;
}

/** La bonne réponse, telle que l'enfant la donnerait dans le widget de la question. */
function bonneReponse(q: QuestionRevision): ReponseQuestion {
	switch (q.kind) {
		case 'num':
			if (q.item.kind === 'posed' && q.item.posed) {
				return { kind: 'posee', chiffres: cellulesATrouver(q.item.posed) };
			}
			return {
				kind: 'saisie',
				valeur: typeof q.item.answer === 'number' ? nombreFr(q.item.answer) : q.item.answer,
			};
		case 'qcm':
			return { kind: 'choix', valeur: String(q.item.answer) };
		case 'tuile':
			return { kind: 'tuile', posee: q.answer };
		case 'ordre':
			return { kind: 'ordre', propose: [...q.ordre] };
		case 'tri':
			return {
				kind: 'tri',
				placement: Object.fromEntries(q.mots.map((m) => [m.mot, m.cat] as const)),
			};
		case 'appariement':
			return {
				kind: 'appariement',
				liens: q.paires.map((p) => ({ gauche: p.gauche, droite: p.droite })),
			};
		case 'probleme':
			return { kind: 'probleme', saisies: q.etapes.map((e) => nombreFr(e.answer)) };
		case 'clicMot':
			return { kind: 'clicMot', indices: [...q.cibleIndices] };
	}
}

/** Une réponse certainement fausse, plausible (un chiffre, un choix, un lien de travers).
    `null` si la question n'en admet pas (un seul choix…). */
function mauvaiseReponse(q: QuestionRevision): ReponseQuestion | null {
	switch (q.kind) {
		case 'num': {
			if (q.item.kind === 'posed' && q.item.posed) {
				const c = cellulesATrouver(q.item.posed);
				const dernier = c.length - 1;
				c[dernier] = String((Number(c[dernier]) + 1) % 10);
				return { kind: 'posee', chiffres: c };
			}
			// Bande ouverte : la borne elle-même est exclue.
			if (q.item.intervalle) return { kind: 'saisie', valeur: nombreFr(q.item.intervalle[1]) };
			const a = typeof q.item.answer === 'number' ? nombreFr(q.item.answer) : q.item.answer;
			return { kind: 'saisie', valeur: plusUn(a) ?? `${a}zz` };
		}
		case 'qcm': {
			const autre = q.choices.find((c) => c !== String(q.item.answer));
			return autre === undefined ? null : { kind: 'choix', valeur: autre };
		}
		case 'tuile': {
			const autre = q.tuiles.find((t) => t !== q.answer);
			return autre === undefined ? null : { kind: 'tuile', posee: autre };
		}
		case 'ordre': {
			if (q.ordre.length < 2 || q.ordre[0] === q.ordre[1]) return null;
			const [a, b, ...reste] = q.ordre;
			return { kind: 'ordre', propose: [b, a, ...reste] };
		}
		case 'tri': {
			const [premier, ...reste] = q.mots;
			const placement: Record<string, 0 | 1> = Object.fromEntries(
				reste.map((m) => [m.mot, m.cat] as const),
			);
			placement[premier.mot] = premier.cat === 0 ? 1 : 0;
			return { kind: 'tri', placement };
		}
		case 'appariement': {
			const liens: { gauche: string; droite: string | null }[] = q.paires.map((p) => ({ ...p }));
			const j = q.paires.findIndex((p) => p.droite !== q.paires[0].droite);
			if (j > 0) {
				liens[0].droite = q.paires[j].droite;
				liens[j].droite = q.paires[0].droite;
			} else liens[0].droite = null;
			return { kind: 'appariement', liens };
		}
		case 'probleme': {
			const saisies = q.etapes.map((e) => nombreFr(e.answer));
			saisies[0] = plusUn(saisies[0]) ?? '0';
			return { kind: 'probleme', saisies };
		}
		case 'clicMot': {
			const hors = q.tokens.findIndex((_, i) => !q.cibleIndices.includes(i));
			return hors < 0 ? null : { kind: 'clicMot', indices: [...q.cibleIndices.slice(1), hors] };
		}
	}
}

/* Inventaire : une question de révision par leçon, niveau couvert et graine. Tous les
   formats de `QuestionRevision` doivent y figurer (planchers ci-dessous). */
const GRAINES_INVENTAIRE = [1, 2, 3, 4];
interface Tiree {
	ou: string;
	q: QuestionRevision;
}
const INVENTAIRE: Tiree[] = [];
for (const lesson of getAllLessons()) {
	for (const niveau of niveauxDe(lesson)) {
		for (const graine of GRAINES_INVENTAIRE) {
			const q = withSeed(graine, () => questionDeRevision(lesson, niveau));
			if (q) INVENTAIRE.push({ ou: `${lesson.id} @${niveau} / graine ${graine}`, q });
		}
	}
}

/** Tous les formats, énumérés depuis le TYPE : un format ajouté à `QuestionRevision` sans
    entrée ici fait échouer le typecheck. */
const FORMATS: Record<QuestionRevision['kind'], true> = {
	num: true,
	qcm: true,
	tuile: true,
	ordre: true,
	tri: true,
	appariement: true,
	probleme: true,
	clicMot: true,
};

/** Applique une règle à l'inventaire, une faute par leçon (la première). */
function fautesInventaire(regle: (q: QuestionRevision) => string | null): string[] {
	const parLecon = new Map<string, string>();
	for (const { ou, q } of INVENTAIRE) {
		if (parLecon.has(q.lessonId)) continue;
		const f = regle(q);
		if (f !== null) parLecon.set(q.lessonId, `${ou} (${q.kind}) : ${f}`);
	}
	return [...parLecon.values()];
}

describe('Critère 10 : correction de chaque question du catalogue (corrigerQuestion)', () => {
	it('l’inventaire couvre tous les formats, dont l’opération posée et l’intercalation', () => {
		const vus = new Set(INVENTAIRE.map(({ q }) => q.kind));
		expect(Object.keys(FORMATS).filter((k) => !vus.has(k as QuestionRevision['kind']))).toEqual([]);
		expect(INVENTAIRE.some(({ q }) => q.kind === 'num' && q.item.kind === 'posed')).toBe(true);
		expect(INVENTAIRE.some(({ q }) => q.kind === 'num' && q.item.intervalle !== undefined)).toBe(
			true,
		);
	});

	it('critère 10 : la bonne réponse est jugée juste, sans aucune erreur', () => {
		expect(
			fautesInventaire((q) => {
				const c = corrigerQuestion(q, bonneReponse(q));
				return c.reussi && c.erreurs.length === 0
					? null
					: `réussi=${c.reussi}, ${c.erreurs.length} erreur(s) ${JSON.stringify(c.erreurs[0] ?? {})}`;
			}),
		).toEqual([]);
	});

	it('critère 10 : une mauvaise réponse est jugée fausse, avec des erreurs bien formées', () => {
		expect(
			fautesInventaire((q) => {
				const r = mauvaiseReponse(q);
				if (r === null) return null;
				const c = corrigerQuestion(q, r);
				if (c.reussi) return `jugée juste : ${JSON.stringify(r)}`;
				if (c.erreurs.length === 0) return 'fausse mais aucune erreur';
				const d = c.erreurs.flatMap(defautsErreur);
				return d.length > 0 ? d.join(' ; ') : null;
			}),
		).toEqual([]);
	});

	it('critère 10 : une question passée est fausse, une seule erreur « pas de réponse »', () => {
		expect(
			fautesInventaire((q) => {
				const d = defautsPasse(corrigerQuestion(q, { kind: 'passe' }));
				return d.length > 0 ? d.join(' ; ') : null;
			}),
		).toEqual([]);
	});

	it('critère 10 : une saisie est jugée comme le fait déjà l’appli (checkItemAnswer)', () => {
		const SAISIES = INVENTAIRE.flatMap(({ ou, q }) =>
			q.kind === 'num' && q.item.kind !== 'posed' ? [{ ou, q, item: q.item }] : [],
		);
		expect(SAISIES.length).toBeGreaterThanOrEqual(50);
		const parLecon = new Map<string, string>();
		for (const { ou, q, item } of SAISIES) {
			const a = typeof item.answer === 'number' ? nombreFr(item.answer) : item.answer;
			const variantes = [
				a,
				grouperMilliers(a),
				grouperMilliers(a, INSECABLE),
				` ${a} `,
				a.replace(',', '.'),
				a.toLowerCase(),
				plusUn(a) ?? `${a}zz`,
			];
			for (const v of variantes) {
				const appli = checkItemAnswer(item, v);
				const obtenu = corrigerQuestion(q, { kind: 'saisie', valeur: v }).reussi;
				if (obtenu !== appli && !parLecon.has(q.lessonId)) {
					parLecon.set(
						q.lessonId,
						`${ou} : « ${v} » jugée ${obtenu ? 'juste' : 'fausse'}, l'appli la juge ${appli ? 'juste' : 'fausse'}`,
					);
				}
			}
		}
		expect([...parLecon.values()]).toEqual([]);
	});
});

/* ---------- Questions fabriquées, une par cas tricky ---------- */

const saisie = (q: QuestionRevision, valeur: string): Correction =>
	corrigerQuestion(q, { kind: 'saisie', valeur });
const num = (lessonId: string, item: Item): QuestionRevision => ({ kind: 'num', lessonId, item });

describe('Critère 10 : saisie (num) — tolérance et bande ouverte', () => {
	const MILLIERS = num('num-decompose-10000', {
		text: '6 milliers + 6 centaines + 4 dizaines + 3 unités = @',
		answer: '6643',
		kind: 'num',
	});
	const HERITE = num('math-multiplier-10-100', { text: '22 × 100 = @', answer: 2200, kind: 'num' });
	const DECIMAL = num('num-droite-decimaux', {
		text: 'Quel nombre est repéré sur la droite graduée ? @',
		answer: '1,59',
		kind: 'num',
	});

	it('critère 10 : espaces de milliers acceptés, mauvais nombre refusé', () => {
		expect(saisie(MILLIERS, '6643').reussi).toBe(true);
		expect(saisie(MILLIERS, '6 643').reussi).toBe(true);
		expect(saisie(MILLIERS, `6${INSECABLE}643`).reussi).toBe(true);
		expect(saisie(MILLIERS, '6 634').reussi).toBe(false);
		expect(saisie(HERITE, '2 200').reussi).toBe(true);
		expect(saisie(HERITE, '220').reussi).toBe(false);
	});

	it('critère 10 : virgule décimale acceptée', () => {
		expect(saisie(DECIMAL, '1,59').reussi).toBe(true);
		expect(saisie(DECIMAL, '1,6').reussi).toBe(false);
		const nombre = num('num-dec-encadrer', { text: '3 + 0,5 = @', answer: 3.5, kind: 'num' });
		expect(saisie(nombre, '3,5').reussi).toBe(true);
	});

	it('critère 10 : intercaler, toute valeur STRICTEMENT dans la bande est juste, les bornes non', () => {
		const q = num('num-encadrer-intercaler', {
			text: 'Place un nombre entre 450 et 465 : @',
			answer: '455',
			kind: 'num',
			intervalle: [450, 465],
		});
		const justes = ['451', '455', '460', '464'].filter((v) => !saisie(q, v).reussi);
		const fausses = ['450', '465', '449', '466'].filter((v) => saisie(q, v).reussi);
		expect({ justesRefusees: justes, faussesAcceptees: fausses }).toEqual({
			justesRefusees: [],
			faussesAcceptees: [],
		});
		const milliers = num('num-encadrer-intercaler', {
			text: 'Place un nombre entre 4 000 et 4 010 : @',
			answer: '4005',
			kind: 'num',
			intervalle: [4000, 4010],
		});
		expect(saisie(milliers, '4 001').reussi).toBe(true);
		expect(saisie(milliers, '4 010').reussi).toBe(false);
	});

	it('critère 10 : l’erreur d’une saisie a un énoncé sans « @ » et des réponses non vides', () => {
		const c = saisie(MILLIERS, '6 634');
		expect(c.erreurs).toHaveLength(1);
		expect(defautsErreur(c.erreurs[0])).toEqual([]);
	});
});

describe('Critère 10 : opération posée', () => {
	/* 12 × 24, posée à la main : 12 × 4 = 48 (1er produit partiel), 12 × 2 = 24 suivi du 0
	   fourni (2ᵉ), 48 + 240 = 288. Cellules à trouver, en lisant : 4 8 | 2 4 | 2 8 8. */
	const MULT: PosedSpec = { op: 'x', a: 12, b: 24 };
	const JUSTE_MULT = ['4', '8', '2', '4', '2', '8', '8'];
	const qMult = num('calc-multiplication-posee', {
		text: '',
		answer: 288,
		kind: 'posed',
		posed: MULT,
	});
	const ADD: PosedSpec = { op: '+', a: 630, b: 12 };
	const qAdd = num('calc-addition-posee', { text: '', answer: 642, kind: 'posed', posed: ADD });
	const posee = (q: QuestionRevision, chiffres: string[]): Correction =>
		corrigerQuestion(q, { kind: 'posee', chiffres });
	const chiffresDe = (s: string): string => s.replace(/\D/g, '');

	it('critère 10 : toutes les cellules justes → réussi, sans erreur', () => {
		expect(posee(qMult, JUSTE_MULT)).toEqual({ reussi: true, erreurs: [] });
		expect(posee(qAdd, ['6', '4', '2'])).toEqual({ reussi: true, erreurs: [] });
	});

	it('critère 10 : un chiffre du résultat faux → UNE erreur, attendue = le résultat', () => {
		const c = posee(qMult, ['4', '8', '2', '4', '2', '8', '9']);
		expect(c.reussi).toBe(false);
		expect(c.erreurs).toHaveLength(1);
		expect(chiffresDe(c.erreurs[0].attendue)).toBe('288');
		expect(defautsErreur(c.erreurs[0])).toEqual([]);
	});

	it('critère 10 : un produit partiel faux, même avec le bon résultat → faux, UNE erreur', () => {
		const c = posee(qMult, ['4', '9', '2', '4', '2', '8', '8']);
		expect(c.reussi).toBe(false);
		expect(c.erreurs).toHaveLength(1);
		expect(chiffresDe(c.erreurs[0].attendue)).toBe('288');
	});

	it('critère 10 : trois chiffres faux (produit partiel et résultat) → toujours UNE erreur', () => {
		const c = posee(qMult, ['4', '9', '2', '4', '2', '9', '9']);
		expect(c.reussi).toBe(false);
		expect(c.erreurs).toHaveLength(1);
		expect(chiffresDe(c.erreurs[0].attendue)).toBe('288');
	});

	it('critère 10 : une grille incomplète est fausse', () => {
		expect(posee(qMult, ['2', '8', '8']).reussi).toBe(false);
	});

	it('critère 10 : l’énoncé d’une posée (sans texte) nomme l’opération', () => {
		const c = posee(qAdd, ['6', '4', '3']);
		expect(c.erreurs).toHaveLength(1);
		const e = c.erreurs[0];
		expect(defautsErreur(e)).toEqual([]);
		expect(e.enonce).toContain('630');
		expect(e.enonce).toContain('12');
		expect(chiffresDe(e.attendue)).toBe('642');
	});
});

describe('Critère 10 : QCM et tuile — comparaison sur la valeur', () => {
	const A_ACCENT: QuestionRevision = {
		kind: 'qcm',
		lessonId: 'fr-homophones-a',
		item: { text: 'Le cadeau est @ ma sœur.', answer: 'à', kind: 'text' },
		choices: ['a', 'à'],
	};
	const GRAS: QuestionRevision = {
		kind: 'qcm',
		lessonId: 'fr-vocab-contraires',
		item: {
			text: 'Le cheval doit **tirer** la grosse charrette.',
			answer: 'pousser',
			kind: 'text',
		},
		choices: ['pousser', 'traîner', 'porter'],
	};

	it('critère 10 : « a » n’est pas « à » (l’accent compte)', () => {
		expect(corrigerQuestion(A_ACCENT, { kind: 'choix', valeur: 'à' })).toEqual({
			reussi: true,
			erreurs: [],
		});
		const c = corrigerQuestion(A_ACCENT, { kind: 'choix', valeur: 'a' });
		expect(c.reussi).toBe(false);
		expect(c.erreurs).toHaveLength(1);
		expect(defautsErreur(c.erreurs[0])).toEqual([]);
		expect(lu(c.erreurs[0].attendue)).toContain('à');
	});

	it('critère 10 : l’énoncé d’erreur perd « ** » mais garde le mot mis en gras', () => {
		const c = corrigerQuestion(GRAS, { kind: 'choix', valeur: 'traîner' });
		expect(c.reussi).toBe(false);
		expect(defautsErreur(c.erreurs[0])).toEqual([]);
		expect(c.erreurs[0].enonce).toContain('tirer');
		expect(lu(c.erreurs[0].attendue)).toContain('pousser');
	});

	it('critère 10 : tuile, le bon signe est juste, un autre ou aucun est faux', () => {
		const q: QuestionRevision = {
			kind: 'tuile',
			lessonId: 'num-comparer',
			question: 'Compare : 352 @ 748',
			answer: '<',
			tuiles: ['<', '=', '>'],
			parle: 'Compare 352 et 748.',
		};
		expect(corrigerQuestion(q, { kind: 'tuile', posee: '<' })).toEqual({
			reussi: true,
			erreurs: [],
		});
		const faux = corrigerQuestion(q, { kind: 'tuile', posee: '>' });
		expect(faux.reussi).toBe(false);
		expect(faux.erreurs.flatMap(defautsErreur)).toEqual([]);
		expect(faux.erreurs[0]?.attendue ?? '').toContain('<');
		expect(corrigerQuestion(q, { kind: 'tuile', posee: null }).reussi).toBe(false);
	});
});

describe('Critère 10 : ranger (ordre) et trier (tri)', () => {
	const ORDRE: QuestionRevision = {
		kind: 'ordre',
		lessonId: 'fr-vocab-alpha-initiale',
		question: "Range ces mots dans l'ordre alphabétique.",
		ordre: ['abeille', 'balle', 'chat'],
		tuiles: ['chat', 'abeille', 'balle'],
	};
	const ranger = (propose: string[]): Correction =>
		corrigerQuestion(ORDRE, { kind: 'ordre', propose });

	it('critère 10 : seul l’ordre exact est juste', () => {
		expect(ranger(['abeille', 'balle', 'chat'])).toEqual({ reussi: true, erreurs: [] });
		for (const faux of [
			['balle', 'abeille', 'chat'],
			['chat', 'abeille', 'balle'], // l'ordre de présentation des tuiles
			['abeille', 'balle'], // incomplet
		]) {
			const c = ranger(faux);
			expect(c.reussi, JSON.stringify(faux)).toBe(false);
			expect(c.erreurs.length).toBeGreaterThanOrEqual(1);
			expect(c.erreurs.flatMap(defautsErreur)).toEqual([]);
		}
	});

	const TRI: QuestionRevision = {
		kind: 'tri',
		lessonId: 'fr-vocab-champs-tri',
		question: 'Range chaque mot dans le bon thème.',
		categories: ['les émotions', 'la montagne'],
		mots: [
			{ mot: 'glacier', cat: 1 },
			{ mot: 'fierté', cat: 0 },
			{ mot: 'pente', cat: 1 },
			{ mot: 'déception', cat: 0 },
		],
	};
	const JUSTE_TRI: Record<string, 0 | 1> = { glacier: 1, fierté: 0, pente: 1, déception: 0 };
	const trier = (placement: Record<string, 0 | 1>): Correction =>
		corrigerQuestion(TRI, { kind: 'tri', placement });
	/** L'erreur qui nomme ce mot (dans l'énoncé, la donnée ou l'attendue). */
	const erreursDuMot = (c: Correction, mot: string): ErreurCorrigee[] =>
		c.erreurs.filter((e) => `${e.enonce} ${e.donnee} ${e.attendue}`.includes(mot));

	it('critère 10 : tout bien classé → réussi, sans erreur', () => {
		expect(trier(JUSTE_TRI)).toEqual({ reussi: true, erreurs: [] });
	});

	it('critère 10 : UNE erreur par mot mal classé, qui nomme le mot et son bon thème', () => {
		const c = trier({ ...JUSTE_TRI, glacier: 0, déception: 1 });
		expect(c.reussi).toBe(false);
		expect(c.erreurs).toHaveLength(2);
		expect(c.erreurs.flatMap(defautsErreur)).toEqual([]);
		expect(erreursDuMot(c, 'glacier')).toHaveLength(1);
		expect(erreursDuMot(c, 'déception')).toHaveLength(1);
		expect(erreursDuMot(c, 'glacier')[0]?.attendue ?? '').toContain('la montagne');
		expect(erreursDuMot(c, 'déception')[0]?.attendue ?? '').toContain('les émotions');
	});

	it('critère 10 : un mot laissé hors des thèmes compte comme UNE erreur', () => {
		const sansPente = Object.fromEntries(
			Object.entries(JUSTE_TRI).filter(([mot]) => mot !== 'pente'),
		);
		const c = trier(sansPente);
		expect(c.reussi).toBe(false);
		expect(c.erreurs).toHaveLength(1);
		expect(erreursDuMot(c, 'pente')).toHaveLength(1);
		expect(defautsErreur(c.erreurs[0])).toEqual([]);
	});

	it('critère 10 : passer un tri donne UNE seule erreur, pas une par mot', () => {
		expect(defautsPasse(corrigerQuestion(TRI, { kind: 'passe' }))).toEqual([]);
	});
});

describe('Critère 10 : relier (appariement)', () => {
	const FAMILLES: QuestionRevision = {
		kind: 'appariement',
		lessonId: 'fr-vocab-familles-relier',
		question: 'Relie chaque mot à un mot de sa famille.',
		paires: [
			{ gauche: 'poisson', droite: 'poissonnerie' },
			{ gauche: 'fromage', droite: 'fromagerie' },
			{ gauche: 'ami', droite: 'amitié' },
		],
		intrus: ['poison'],
	};
	const relier = (
		q: QuestionRevision,
		liens: { gauche: string; droite: string | null }[],
	): Correction => corrigerQuestion(q, { kind: 'appariement', liens });
	const JUSTE = [
		{ gauche: 'poisson', droite: 'poissonnerie' },
		{ gauche: 'fromage', droite: 'fromagerie' },
		{ gauche: 'ami', droite: 'amitié' },
	];

	it('critère 10 : chaque mot relié au bon → réussi, quel que soit l’ordre des liens', () => {
		expect(relier(FAMILLES, JUSTE)).toEqual({ reussi: true, erreurs: [] });
		expect(relier(FAMILLES, [...JUSTE].reverse())).toEqual({ reussi: true, erreurs: [] });
	});

	it('critère 10 : deux liens croisés → faux, une erreur par paire mal reliée', () => {
		const c = relier(FAMILLES, [
			{ gauche: 'poisson', droite: 'fromagerie' },
			{ gauche: 'fromage', droite: 'poissonnerie' },
			{ gauche: 'ami', droite: 'amitié' },
		]);
		expect(c.reussi).toBe(false);
		expect(c.erreurs).toHaveLength(2);
		expect(c.erreurs.flatMap(defautsErreur)).toEqual([]);
	});

	it('critère 10 : un mot non relié, relié à l’intrus, ou absent des liens → faux', () => {
		const cas = [
			[{ gauche: 'poisson', droite: null }, JUSTE[1], JUSTE[2]],
			[{ gauche: 'poisson', droite: 'poison' }, JUSTE[1], JUSTE[2]],
			[JUSTE[1], JUSTE[2]],
		];
		for (const liens of cas) {
			const c = relier(FAMILLES, liens);
			expect(c.reussi, JSON.stringify(liens)).toBe(false);
			expect(c.erreurs.length).toBeGreaterThanOrEqual(1);
			expect(c.erreurs.flatMap(defautsErreur)).toEqual([]);
		}
	});

	/* Étiquettes (#731) : deux mots du groupe ont la MÊME étiquette. Une correction qui
	   voudrait une étiquette par mot (bijection) refuserait la bonne réponse. */
	const NATURES: QuestionRevision = {
		kind: 'appariement',
		lessonId: 'fr-gram-gn-nommer',
		question:
			'Relie chaque mot du groupe « un grand chien noir » : est-ce un déterminant, un nom ou un adjectif ?',
		paires: [
			{ gauche: 'un', droite: 'déterminant' },
			{ gauche: 'grand', droite: 'adjectif' },
			{ gauche: 'chien', droite: 'nom' },
			{ gauche: 'noir', droite: 'adjectif' },
		],
		intrus: [],
		colonneDroite: 'etiquettes',
	};

	it('critère 10 : étiquettes, deux adjectifs reliés à « adjectif » → réussi', () => {
		const liens = NATURES.kind === 'appariement' ? NATURES.paires.map((p) => ({ ...p })) : [];
		expect(relier(NATURES, liens)).toEqual({ reussi: true, erreurs: [] });
	});

	it('critère 10 : étiquettes, nom et adjectif inversés → deux erreurs', () => {
		const c = relier(NATURES, [
			{ gauche: 'un', droite: 'déterminant' },
			{ gauche: 'grand', droite: 'adjectif' },
			{ gauche: 'chien', droite: 'adjectif' },
			{ gauche: 'noir', droite: 'nom' },
		]);
		expect(c.reussi).toBe(false);
		expect(c.erreurs).toHaveLength(2);
	});
});

describe('Critère 10 : problème à étapes', () => {
	const DEUX_ETAPES: QuestionRevision = {
		kind: 'probleme',
		lessonId: 'math-prob-deux-etapes',
		enonce: 'Lina achète 4 livres à 8 € chacun. Elle paie avec un billet de 50 €.',
		etapes: [
			{ question: 'Combien coûtent les 4 livres ?', answer: 32, unite: 'euro' },
			{ question: 'Combien lui rend-on ?', answer: 18, unite: 'euro' },
		],
		parle: 'Lina achète 4 livres à 8 euros chacun. Elle paie avec un billet de 50 euros.',
	};
	const resoudre = (q: QuestionRevision, saisies: string[]): Correction =>
		corrigerQuestion(q, { kind: 'probleme', saisies });

	it('critère 10 : toutes les étapes justes → réussi, sans erreur', () => {
		expect(resoudre(DEUX_ETAPES, ['32', '18'])).toEqual({ reussi: true, erreurs: [] });
	});

	it('critère 10 : UNE erreur par étape fausse, aucune pour une étape juste', () => {
		const premiere = resoudre(DEUX_ETAPES, ['36', '18']);
		expect(premiere.reussi).toBe(false);
		expect(premiere.erreurs).toHaveLength(1);
		expect(premiere.erreurs[0].enonce).toContain('Combien coûtent les 4 livres');
		expect(defautsErreur(premiere.erreurs[0])).toEqual([]);

		const seconde = resoudre(DEUX_ETAPES, ['32', '14']);
		expect(seconde.erreurs).toHaveLength(1);
		expect(seconde.erreurs[0].enonce).toContain('Combien lui rend-on');

		expect(resoudre(DEUX_ETAPES, ['36', '14']).erreurs).toHaveLength(2);
	});

	it('critère 10 : une étape laissée vide est fausse', () => {
		expect(resoudre(DEUX_ETAPES, ['32', '']).reussi).toBe(false);
		expect(resoudre(DEUX_ETAPES, ['32']).reussi).toBe(false);
	});

	it('critère 10 : euros décimaux, « 16,15 » est juste et l’attendue s’écrit avec une virgule', () => {
		const q: QuestionRevision = {
			kind: 'probleme',
			lessonId: 'math-prob-composition',
			enonce: 'Alix achète un livre à 8,20 € et un stylo à 7,95 €.',
			etapes: [{ question: 'Combien Alix paie-t-il en tout ?', answer: 16.15, unite: 'euro' }],
			parle: 'Alix achète un livre à 8 euros 20 et un stylo à 7 euros 95.',
		};
		expect(resoudre(q, ['16,15'])).toEqual({ reussi: true, erreurs: [] });
		const c = resoudre(q, ['16,25']);
		expect(c.reussi).toBe(false);
		expect(c.erreurs).toHaveLength(1);
		expect(c.erreurs[0].attendue).toContain('16,15');
	});

	it('critère 10 : passer un problème à deux étapes donne UNE seule erreur', () => {
		expect(defautsPasse(corrigerQuestion(DEUX_ETAPES, { kind: 'passe' }))).toEqual([]);
	});
});

describe('Critère 10 : clique sur le mot (clicMot)', () => {
	const NOMS: QuestionRevision = {
		kind: 'clicMot',
		lessonId: 'fr-gram-clic-noyau',
		actionConsigne: 'Clique sur les noms.',
		tokens: ['Le', 'chat', 'guette', 'la', 'souris', '.'],
		cibleIndices: [1, 4],
		explication: '« chat » et « souris » sont des noms.',
		parle: 'Le chat guette la souris.',
	};
	const cliquer = (indices: number[]): Correction =>
		corrigerQuestion(NOMS, { kind: 'clicMot', indices });

	it('critère 10 : l’ensemble des mots cibles est juste, dans n’importe quel ordre', () => {
		expect(cliquer([1, 4])).toEqual({ reussi: true, erreurs: [] });
		expect(cliquer([4, 1])).toEqual({ reussi: true, erreurs: [] });
		// Un ENSEMBLE : un indice répété n'ajoute pas de mot.
		expect(cliquer([1, 4, 4]).reussi).toBe(true);
	});

	it('critère 10 : un mot manquant, un mot en trop ou un doublon qui masque un manque → faux', () => {
		for (const faux of [[1], [1, 4, 2], [1, 1], []]) {
			const c = cliquer(faux);
			expect(c.reussi, JSON.stringify(faux)).toBe(false);
			expect(c.erreurs.length).toBeGreaterThanOrEqual(1);
			expect(c.erreurs.flatMap(defautsErreur), JSON.stringify(faux)).toEqual([]);
		}
	});

	it('critère 10 : l’attendue nomme les mots à trouver', () => {
		const c = cliquer([1, 2]);
		expect(c.erreurs.map((e) => e.attendue).join(' ')).toContain('chat');
		expect(c.erreurs.map((e) => e.attendue).join(' ')).toContain('souris');
	});
});

/* ============================================================
   Correction différée : « rien donné » est une NON-TENTATIVE (relecture langue et
   accessibilité, décision du 23 octobre 2026). Écrit AVANT la correction : rouge.

   Un mot de tri laissé sans thème, un chiffre du résultat laissé vide, un mot laissé sans
   lien : l'enfant n'a rien donné pour cette partie. L'erreur le dit comme une question
   passée — `sansTentative`, réponse donnée VIDE (l'écran : « Pas de réponse » ; le journal :
   « n'a pas essayé ») —, plus jamais par un marqueur « (pas rangé) », « (incomplet) » ou
   « (non relié) » affiché comme si c'était sa réponse. Une opération posée fausse seulement
   sur un produit partiel le dit sans jargon : « (une ligne du calcul est fausse) ».

   Le lien manquant (relier) n'est pas cité par la décision : il en relève par sa règle
   générale (« tout cas rien donné d'un format »).
   ============================================================ */

/** Défauts d'une erreur « rien donné » : bien formée, sans tentative, donnée vide. */
function defautsNonTentative(e: ErreurCorrigee): string[] {
	const d = defautsErreur(e);
	if (e.sansTentative !== true) d.push(`sansTentative absent (donnée « ${e.donnee} »)`);
	if (e.donnee !== '') d.push(`donnée « ${e.donnee} » au lieu de vide`);
	return d;
}

/** Rangs, parmi les cellules à trouver (ordre de lecture), de celles du RÉSULTAT. */
function rangsResultat(spec: PosedSpec): number[] {
	return dispositionPosee(spec)
		.rangees.flatMap((r) => r.cellules.filter((c) => c.role === 'saisie'))
		.flatMap((c, i) => (c.resultat !== undefined ? [i] : []));
}

/** La bonne réponse amputée d'UNE partie, celle que l'enfant n'a pas donnée ; `null` pour un
    format qui n'a pas de partie à laisser (saisie, choix, tuile, ordre, mots à toucher). */
function reponseAmputee(q: QuestionRevision): { reponse: ReponseQuestion; manque: string } | null {
	const r = bonneReponse(q);
	if (r.kind === 'posee' && q.kind === 'num' && q.item.posed) {
		const rangs = rangsResultat(q.item.posed);
		const chiffres = [...r.chiffres];
		chiffres[rangs[rangs.length - 1]] = '';
		return { reponse: { kind: 'posee', chiffres }, manque: 'un chiffre du résultat' };
	}
	if (r.kind === 'tri' && q.kind === 'tri' && q.mots.length > 1) {
		const placement = Object.fromEntries(
			Object.entries(r.placement).filter(([mot]) => mot !== q.mots[0].mot),
		);
		return { reponse: { kind: 'tri', placement }, manque: `le mot « ${q.mots[0].mot} »` };
	}
	if (r.kind === 'appariement' && r.liens.length > 1) {
		const liens = r.liens.map((l, i) => (i === 0 ? { ...l, droite: null } : l));
		return { reponse: { kind: 'appariement', liens }, manque: `le lien de « ${liens[0].gauche} »` };
	}
	if (r.kind === 'probleme' && r.saisies.length > 1) {
		return {
			reponse: { kind: 'probleme', saisies: ['', ...r.saisies.slice(1)] },
			manque: '1re étape',
		};
	}
	return null;
}

describe('Correction différée : « rien donné » est une non-tentative', () => {
	const TRI: QuestionRevision = {
		kind: 'tri',
		lessonId: 'fr-vocab-champs-tri',
		question: 'Range chaque mot dans le bon thème.',
		categories: ['les émotions', 'la montagne'],
		mots: [
			{ mot: 'glacier', cat: 1 },
			{ mot: 'fierté', cat: 0 },
			{ mot: 'pente', cat: 1 },
			{ mot: 'déception', cat: 0 },
		],
	};
	const trier = (placement: Record<string, 0 | 1>): Correction =>
		corrigerQuestion(TRI, { kind: 'tri', placement });
	const duMot = (c: Correction, mot: string): ErreurCorrigee | undefined =>
		c.erreurs.find((e) => e.enonce.includes(mot));

	it('tri : un mot laissé sans thème → non-tentative, donnée vide, bon thème attendu ; plus de « (pas rangé) »', () => {
		const c = trier({ glacier: 1, fierté: 0, déception: 0 });
		expect(c.reussi).toBe(false);
		expect(c.erreurs).toHaveLength(1);
		const e = duMot(c, 'pente');
		expect(e, 'l’erreur nomme le mot laissé').toBeDefined();
		expect(defautsNonTentative(e!)).toEqual([]);
		expect(e!.attendue).toContain('la montagne');
	});

	it('tri : à côté d’un mot non rangé, un mot MAL rangé reste une tentative (le thème choisi)', () => {
		const c = trier({ glacier: 0, fierté: 0, déception: 0 });
		expect(c.erreurs).toHaveLength(2);
		const mal = duMot(c, 'glacier');
		expect(mal?.sansTentative).not.toBe(true);
		expect(mal?.donnee).toContain('les émotions');
		expect(defautsNonTentative(duMot(c, 'pente')!)).toEqual([]);
	});

	/* 12 × 24 : cellules à trouver 4 8 | 2 4 | 2 8 8 (cf. « Critère 10 : opération posée »). */
	const qMult: QuestionRevision = {
		kind: 'num',
		lessonId: 'calc-multiplication-posee',
		item: { text: '', answer: 288, kind: 'posed', posed: { op: 'x', a: 12, b: 24 } },
	};
	const poser = (chiffres: string[]): Correction =>
		corrigerQuestion(qMult, { kind: 'posee', chiffres });

	it('posée : un chiffre du résultat laissé vide → non-tentative, donnée vide ; plus de « (incomplet) »', () => {
		for (const chiffres of [
			['4', '8', '2', '4', '2', '8', ''],
			['4', '8', '2', '4', '', '', ''], // produits partiels posés, résultat pas écrit
		]) {
			const c = poser(chiffres);
			expect(c.reussi, JSON.stringify(chiffres)).toBe(false);
			expect(c.erreurs, JSON.stringify(chiffres)).toHaveLength(1);
			expect(defautsNonTentative(c.erreurs[0]), JSON.stringify(chiffres)).toEqual([]);
			expect(c.erreurs[0].attendue.replace(/\D/g, '')).toBe('288');
		}
	});

	it('posée : fausse seulement sur un produit partiel → « (une ligne du calcul est fausse) », jamais « produit partiel »', () => {
		const c = poser(['4', '9', '2', '4', '2', '8', '8']);
		expect(c.reussi).toBe(false);
		expect(c.erreurs).toHaveLength(1);
		const e = c.erreurs[0];
		expect(e.sansTentative).not.toBe(true);
		expect(e.donnee).toContain('(une ligne du calcul est fausse)');
		expect(e.donnee).not.toMatch(/produit|partiel/);
		// Et nulle part ailleurs dans une erreur de posée.
		for (const chiffres of [
			['4', '9', '2', '4', '2', '9', '9'],
			['4', '8', '2', '4', '2', '8', '9'],
		])
			expect(poser(chiffres).erreurs[0].donnee, JSON.stringify(chiffres)).not.toMatch(
				/produit|partiel/,
			);
	});

	it('relier : un mot laissé sans lien (ou absent des liens) → non-tentative, donnée vide ; plus de « (non relié) »', () => {
		const q: QuestionRevision = {
			kind: 'appariement',
			lessonId: 'fr-vocab-familles-relier',
			question: 'Relie chaque mot à un mot de sa famille.',
			paires: [
				{ gauche: 'poisson', droite: 'poissonnerie' },
				{ gauche: 'fromage', droite: 'fromagerie' },
				{ gauche: 'ami', droite: 'amitié' },
			],
			intrus: ['poison'],
		};
		const autres = [
			{ gauche: 'fromage', droite: 'fromagerie' },
			{ gauche: 'ami', droite: 'amitié' },
		];
		for (const liens of [[{ gauche: 'poisson', droite: null }, ...autres], autres]) {
			const c = corrigerQuestion(q, { kind: 'appariement', liens });
			expect(c.erreurs, JSON.stringify(liens)).toHaveLength(1);
			expect(defautsNonTentative(c.erreurs[0]), JSON.stringify(liens)).toEqual([]);
			expect(c.erreurs[0].enonce).toContain('poisson');
			expect(c.erreurs[0].attendue).toContain('poissonnerie');
		}
	});

	it('catalogue : la bonne réponse amputée d’une partie → UNE erreur, et c’est une non-tentative', () => {
		const vus: Record<string, number> = {};
		const fautes = fautesInventaire((q) => {
			const a = reponseAmputee(q);
			if (a === null) return null;
			vus[a.reponse.kind] = (vus[a.reponse.kind] ?? 0) + 1;
			const c = corrigerQuestion(q, a.reponse);
			if (c.reussi) return `${a.manque} manquant, jugée juste`;
			if (c.erreurs.length !== 1) return `${a.manque} manquant : ${c.erreurs.length} erreurs`;
			const d = defautsNonTentative(c.erreurs[0]);
			return d.length ? `${a.manque} manquant : ${d.join(' ; ')}` : null;
		});
		// Chaque format à parties est bien éprouvé (planchers en leçons).
		expect(Object.keys(vus).sort()).toEqual(['appariement', 'posee', 'probleme', 'tri']);
		expect(fautes).toEqual([]);
	});

	it('témoins : defautsNonTentative accepte une question passée et refuse un marqueur', () => {
		const passee = corrigerQuestion(TRI, { kind: 'passe' }).erreurs[0];
		expect(defautsNonTentative(passee)).toEqual([]);
		expect(defautsNonTentative({ ...passee, donnee: '(pas rangé)' })).not.toEqual([]);
		expect(defautsNonTentative({ ...passee, sansTentative: undefined, donnee: 'x' })).not.toEqual(
			[],
		);
	});
});

/* ============================================================
   Témoins : les prédicats maison mordent, et ne mordent pas à tort.
   ============================================================ */
describe('Témoins des prédicats du fichier', () => {
	it('témoins : l’oracle du verdict redonne les exemples de l’issue', () => {
		for (const p of PALIERS) {
			for (const r of p.reussi) expect(verdictAttendu(r, p.n), `${r}/${p.n}`).toBe('reussi');
			for (const r of p.presque) expect(verdictAttendu(r, p.n), `${r}/${p.n}`).toBe('presque');
			for (const r of p.aRetravailler)
				expect(verdictAttendu(r, p.n), `${r}/${p.n}`).toBe('a-retravailler');
		}
	});

	it('témoins : le minimum de parties compté à la main', () => {
		const treize = entree(Array.from({ length: 13 }, (): [string, number] => ['A', 3]));
		expect(partiesMinimales(treize, 15)).toBe(3);
		expect(partiesMinimales(entree([['A', 20]]), 15)).toBe(1);
		expect(
			partiesMinimales(
				entree([
					['A', 5],
					['A', 20],
					['A', 5],
				]),
				15,
			),
		).toBe(3);
		expect(
			partiesMinimales(
				entree([
					['A', 3],
					['B', 3],
					['A', 3],
				]),
				15,
			),
		).toBe(3);
		expect(
			partiesMinimales(
				entree([
					['A', 5],
					['A', 5],
					['A', 5],
				]),
				15,
			),
		).toBe(1);
		// 8 + 8 + 7 + 7 = 30 : deux parties de 15 au plus seraient 8+7 | 8+7, ce que l'ordre
		// interdit (8 | 8 7 7 dépasse) ; il en faut trois.
		expect(
			partiesMinimales(
				entree([
					['A', 8],
					['A', 8],
					['A', 7],
					['A', 7],
				]),
				15,
			),
		).toBe(3);
	});

	it('témoins : defautsPlan signale chaque défaut du critère 8, et pas un plan sain', () => {
		const e = entree([
			['A', 5],
			['A', 5],
			['B', 3],
			['A', 20],
		]);
		const sain: PartiePlan[] = [
			{ categoryId: 'A', lessonIds: ['l0', 'l1'], nbQuestions: 10 },
			{ categoryId: 'B', lessonIds: ['l2'], nbQuestions: 3 },
			{ categoryId: 'A', lessonIds: ['l3'], nbQuestions: 20 },
		];
		expect(defautsPlan(e, sain, 15)).toEqual([]);
		const fautifs: [string, PartiePlan[]][] = [
			[
				'catégories mêlées',
				[
					{ categoryId: 'A', lessonIds: ['l0', 'l1', 'l2'], nbQuestions: 13 },
					{ categoryId: 'A', lessonIds: ['l3'], nbQuestions: 20 },
				],
			],
			[
				'leçon coupée',
				[
					{ categoryId: 'A', lessonIds: ['l0', 'l1'], nbQuestions: 10 },
					{ categoryId: 'A', lessonIds: ['l1'], nbQuestions: 5 },
					{ categoryId: 'B', lessonIds: ['l2'], nbQuestions: 3 },
					{ categoryId: 'A', lessonIds: ['l3'], nbQuestions: 20 },
				],
			],
			['réordonné', [sain[1], sain[0], sain[2]]],
			['somme fausse', [{ ...sain[0], nbQuestions: 11 }, sain[1], sain[2]]],
			[
				'pas minimal',
				[
					{ categoryId: 'A', lessonIds: ['l0'], nbQuestions: 5 },
					{ categoryId: 'A', lessonIds: ['l1'], nbQuestions: 5 },
					sain[1],
					sain[2],
				],
			],
		];
		for (const [nom, plan] of fautifs) expect(defautsPlan(e, plan, 15), nom).not.toEqual([]);
		// Plafond dépassé à deux leçons.
		const deux = entree([
			['A', 10],
			['A', 10],
		]);
		expect(
			defautsPlan(deux, [{ categoryId: 'A', lessonIds: ['l0', 'l1'], nbQuestions: 20 }], 15),
		).not.toEqual([]);
	});

	it('témoins : defautsParcours signale catégories mêlées, plafond et leçon coupée', () => {
		const q = (lessonId: string): QuestionRevision => ({
			kind: 'num',
			lessonId,
			item: { text: '1 + 1 = @', answer: '2', kind: 'num' },
		});
		const fois = (id: string, n: number): QuestionRevision[] =>
			Array.from({ length: n }, () => q(id));
		const sain: PartieBilan[] = [
			{
				categoryId: 'math-calcul-mental',
				questions: [...fois('math-complements', 5), ...fois('math-doubles', 5)],
			},
			{ categoryId: 'fr-orthographe', questions: fois('fr-homophones-et', 5) },
		];
		expect(defautsParcours(sain)).toEqual([]);
		expect(
			defautsParcours([
				{
					categoryId: 'math-calcul-mental',
					questions: [...fois('math-complements', 5), ...fois('fr-homophones-et', 5)],
				},
			]),
		).not.toEqual([]);
		expect(
			defautsParcours([
				{
					categoryId: 'math-calcul-mental',
					questions: [...fois('math-complements', 10), ...fois('math-doubles', 10)],
				},
			]),
		).not.toEqual([]);
		expect(
			defautsParcours([
				{ categoryId: 'math-calcul-mental', questions: fois('math-complements', 3) },
				{ categoryId: 'math-calcul-mental', questions: fois('math-doubles', 3) },
				{ categoryId: 'math-calcul-mental', questions: fois('math-complements', 2) },
			]),
		).not.toEqual([]);
		// Une leçon seule au-delà du plafond reste permise.
		expect(
			defautsParcours([
				{ categoryId: 'math-calcul-mental', questions: fois('math-complements', 20) },
			]),
		).toEqual([]);
	});

	it('témoins : la clé de doublon ignore le mélange des choix, pas la question', () => {
		const base: QuestionRevision = {
			kind: 'qcm',
			lessonId: 'fr-homophones-et',
			item: { text: 'Mon papa @ pompier.', answer: 'est', kind: 'text' },
			choices: ['et', 'est'],
		};
		const melangee: QuestionRevision = { ...base, choices: ['est', 'et'] };
		expect(doublons([base, melangee])).toHaveLength(1);
		const autre: QuestionRevision = {
			...base,
			item: { ...base.item, text: 'Le chat @ le chien.', answer: 'et' },
		};
		expect(doublons([base, autre])).toEqual([]);
	});

	it('témoins : defautsErreur et defautsPasse mordent', () => {
		const saine: ErreurCorrigee = { enonce: 'Mon papa … pompier.', donnee: 'et', attendue: 'est' };
		expect(defautsErreur(saine)).toEqual([]);
		expect(defautsErreur({ ...saine, enonce: ' ' })).not.toEqual([]);
		expect(defautsErreur({ ...saine, enonce: 'Mon papa @ pompier.' })).not.toEqual([]);
		expect(defautsErreur({ ...saine, enonce: 'Le **cheval**' })).not.toEqual([]);
		expect(defautsErreur({ ...saine, attendue: '' })).not.toEqual([]);
		expect(defautsErreur({ ...saine, donnee: '' })).not.toEqual([]);
		expect(defautsErreur({ ...saine, attendue: 'undefined' })).not.toEqual([]);
		expect(defautsErreur({ ...saine, donnee: '', sansTentative: true })).toEqual([]);
		const passe: ErreurCorrigee = { ...saine, donnee: '', sansTentative: true };
		expect(defautsPasse({ reussi: false, erreurs: [passe] })).toEqual([]);
		expect(defautsPasse({ reussi: true, erreurs: [passe] })).not.toEqual([]);
		expect(defautsPasse({ reussi: false, erreurs: [passe, passe] })).not.toEqual([]);
		expect(defautsPasse({ reussi: false, erreurs: [{ ...passe, donnee: 'et' }] })).not.toEqual([]);
		expect(
			defautsPasse({ reussi: false, erreurs: [{ ...passe, sansTentative: undefined }] }),
		).not.toEqual([]);
	});

	it('témoins : la grille posée de 12 × 24 se lit 48 | 24 | 288, et la fausse réponse diffère de la bonne', () => {
		expect(cellulesATrouver({ op: 'x', a: 12, b: 24 })).toEqual([
			'4',
			'8',
			'2',
			'4',
			'2',
			'8',
			'8',
		]);
		expect(cellulesATrouver({ op: '+', a: 630, b: 12 })).toEqual(['6', '4', '2']);
		// Sur tout l'inventaire, la « mauvaise » réponse n'est jamais la bonne.
		const identiques = INVENTAIRE.filter(
			({ q }) => JSON.stringify(mauvaiseReponse(q)) === JSON.stringify(bonneReponse(q)),
		).map(({ ou }) => ou);
		expect(identiques).toEqual([]);
		// Et une mauvaise saisie n'est jamais acceptée par l'appli elle-même.
		const acceptees = INVENTAIRE.flatMap(({ ou, q }) => {
			if (q.kind !== 'num' || q.item.kind === 'posed') return [];
			const r = mauvaiseReponse(q);
			return r?.kind === 'saisie' && checkItemAnswer(q.item, r.valeur) ? [ou] : [];
		});
		expect(acceptees).toEqual([]);
	});
});
