/* ============================================================
   Géométrie CM1 — Reconnaître une figure par ses propriétés (#253).
   ------------------------------------------------------------
   Tests de LOGIQUE PURE de la leçon `geo-cm1-figures-proprietes` (deux modes :
   vrai/faux mono-propriété `qcm` + multi-sélection `coche` produisant un `qcmMulti`),
   de la nouvelle variante `qcmMulti` (câblage `checkAnswer` + repli `genLessonItem`)
   et du branchement catalogue.

   Attendus DÉRIVÉS de la consigne, du programme (propriétés lisibles sur le codage) et
   de la géométrie de premier niveau — jamais recopiés de l'implémentation.

   LIMITE ASSUMÉE (remontée dans le compte rendu) : la table `FIGURES` (fait par forme)
   n'est PAS exportée, et l'identité de la forme n'est pas lisible dans le SVG (desc
   neutre). On ne peut donc pas ÉPINGLER « carré → parallèles = Vrai » depuis l'API
   publique. On vérifie donc la table de vérité par ses CONSÉQUENCES observables :
   - chaque propriété est atteignable en Vrai ET en Faux (les contre-exemples existent,
     dont le quadrilatère quelconque « côtés opposés parallèles = Faux ») ;
   - aucune combinaison de propriétés vraies géométriquement impossible.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { getLessonById, getLessonsByCategory, genLessonItem } from '../src/core/catalog';
import type { LessonDef } from '../src/core/catalog';
import { checkAnswer, defaultMode, hasMode } from '../src/core/exercise';
import type { Exercise, ExerciseType } from '../src/core/exercise';
import { checkItemAnswer } from '../src/core/items';
import { withSeed } from '../src/core/utils';
import { FIGURES } from '../src/data/maths/figures-proprietes';

/* Libellés d'affirmations attendus (CONTRAT d'affichage — affirmations POSITIVES, sans
   nom de figure). Écrits ici indépendamment : si le code change le libellé, ces tests
   le signalent. */
const P = {
	angleDroit: 'Cette figure a au moins un angle droit.',
	quatreAnglesDroits: 'Cette figure a quatre angles droits.',
	tousEgaux: 'Tous les côtés ont la même longueur.',
	deuxEgaux: 'Au moins deux côtés ont la même longueur.',
	longueursDiff: 'Cette figure a au moins deux côtés de longueurs différentes.',
	opposesParalleles: 'Les côtés opposés sont parallèles.',
	troisCotes: 'Cette figure a trois côtés.',
	quatreCotes: 'Cette figure a quatre côtés.',
} as const;
const TOUS_TEXTES: string[] = Object.values(P);

/* Un nom de figure dans l'énoncé réintroduirait l'inclusion (écartée deux fois dans le
   projet) : interdit, comme pour le CE2 `geo-figures-proprietes`. */
const NOMS_FIGURES = ['carré', 'rectangle', 'losange', 'parallélogramme', 'triangle', 'cercle'];
const contientNomFigure = (s: string): boolean =>
	NOMS_FIGURES.some((n) => s.toLowerCase().includes(n));

const LESSON_ID = 'geo-cm1-figures-proprietes';
const getType = (): ExerciseType => getLessonById(LESSON_ID)!.exerciseType;

describe('Figures par propriétés CM1 — vrai/faux (mode qcm, défaut)', () => {
	it('generate() sans mode → un vrai/faux qcm bien formé (choix stables « Vrai/Faux »)', () => {
		const type = getType();
		withSeed(101, () => {
			for (let i = 0; i < 2000; i++) {
				const ex = type.generate();
				if (ex.type !== 'qcm') throw new Error(`type inattendu : ${ex.type}`);
				// Positions STABLES (accessibilité) : toujours [Vrai, Faux] dans cet ordre.
				expect(ex.choices).toEqual(['Vrai', 'Faux']);
				expect(['Vrai', 'Faux']).toContain(ex.answer);
				expect(ex.question.startsWith('Vrai ou faux ? ')).toBe(true);
				// L'affirmation jugée est l'un des libellés connus (aucune propriété non codée).
				const affirmation = ex.question.slice('Vrai ou faux ? '.length);
				expect(TOUS_TEXTES).toContain(affirmation);
				expect(ex.figure ?? '').toContain('<svg');
				expect(ex.parle).toBe(ex.question);
			}
		});
	});

	it('mode « qcm » explicite = même format vrai/faux', () => {
		const type = getType();
		withSeed(202, () => {
			for (let i = 0; i < 300; i++) {
				const ex = type.generate({ mode: 'qcm' });
				expect(ex.type).toBe('qcm');
				if (ex.type === 'qcm') expect(ex.choices).toEqual(['Vrai', 'Faux']);
			}
		});
	});

	it('jamais de nom de figure dans la question (comme le CE2 geo-figures-proprietes)', () => {
		const type = getType();
		withSeed(303, () => {
			for (let i = 0; i < 1500; i++) {
				const ex = type.generate();
				if (ex.type !== 'qcm') continue;
				expect(contientNomFigure(ex.question)).toBe(false);
			}
		});
	});

	it('chaque propriété est atteinte en Vrai ET en Faux sur grand échantillon (contre-exemples présents)', () => {
		// Verrouille la CONSÉQUENCE de la table de vérité : aucune propriété n'est
		// « toujours vraie » (ex. le quadrilatère quelconque garantit « côtés opposés
		// parallèles = Faux ») ni « toujours fausse ». Déterministe (grand N + graine fixe).
		const type = getType();
		const vus = new Map<string, Set<string>>();
		withSeed(404, () => {
			for (let i = 0; i < 8000; i++) {
				const ex = type.generate();
				if (ex.type !== 'qcm') continue;
				const affirmation = ex.question.slice('Vrai ou faux ? '.length);
				if (!vus.has(affirmation)) vus.set(affirmation, new Set());
				vus.get(affirmation)!.add(ex.answer);
			}
		});
		// Les 8 affirmations doivent apparaître, chacune en Vrai ET en Faux.
		for (const t of TOUS_TEXTES) {
			expect(vus.has(t), `propriété jamais posée : « ${t} »`).toBe(true);
			const rep = vus.get(t)!;
			expect([...rep].sort(), `« ${t} » n'atteint pas Vrai ET Faux`).toEqual(['Faux', 'Vrai']);
		}
	});
});

describe('Figures par propriétés CM1 — multi-sélection (mode coche → qcmMulti)', () => {
	it('4 propositions distinctes ; 1 à 3 correctes ; correctes ⊆ propositions ; libellés connus', () => {
		const type = getType();
		withSeed(505, () => {
			for (let i = 0; i < 4000; i++) {
				const ex = type.generate({ mode: 'coche' });
				if (ex.type !== 'qcmMulti') throw new Error(`type inattendu : ${ex.type}`);
				expect(ex.propositions).toHaveLength(4);
				expect(new Set(ex.propositions).size).toBe(4); // pas de doublon
				// Au moins une vraie ET au moins une fausse (jamais 0 ni 4).
				expect(ex.correctes.length).toBeGreaterThanOrEqual(1);
				expect(ex.correctes.length).toBeLessThanOrEqual(3);
				for (const c of ex.correctes) expect(ex.propositions).toContain(c);
				for (const p of ex.propositions) expect(TOUS_TEXTES).toContain(p);
				expect(ex.figure ?? '').toContain('<svg');
				expect(contientNomFigure(ex.question)).toBe(false);
				ex.propositions.forEach((p) => expect(contientNomFigure(p)).toBe(false));
			}
		});
	});

	it('jamais les deux affirmations du groupe « angle » ensemble (redondance visuelle)', () => {
		const type = getType();
		withSeed(606, () => {
			for (let i = 0; i < 4000; i++) {
				const ex = type.generate({ mode: 'coche' });
				if (ex.type !== 'qcmMulti') continue;
				const anglePresents = [P.angleDroit, P.quatreAnglesDroits].filter((t) =>
					ex.propositions.includes(t),
				);
				expect(anglePresents.length).toBeLessThanOrEqual(1);
			}
		});
	});

	it('jamais « côtés opposés parallèles » posée sur un triangle', () => {
		const type = getType();
		withSeed(707, () => {
			for (let i = 0; i < 4000; i++) {
				const ex = type.generate({ mode: 'coche' });
				if (ex.type !== 'qcmMulti') continue;
				// « trois côtés » vraie ⇒ triangle ⇒ le parallélisme (propriété de quadrilatère)
				// ne doit même pas être proposé.
				if (ex.correctes.includes(P.troisCotes)) {
					expect(ex.propositions).not.toContain(P.opposesParalleles);
				}
			}
		});
	});

	it('l’ensemble des propriétés vraies est géométriquement cohérent', () => {
		// Contradictions IMPOSSIBLES entre affirmations vraies d'une même figure (dérivées
		// de la géométrie, pas de l'implémentation) : elles ne doivent jamais coexister.
		const type = getType();
		withSeed(808, () => {
			for (let i = 0; i < 5000; i++) {
				const ex = type.generate({ mode: 'coche' });
				if (ex.type !== 'qcmMulti') continue;
				const C = new Set(ex.correctes);
				const props = new Set(ex.propositions);
				// 3 côtés et 4 côtés : jamais vrais ensemble ; si les deux sont proposés, un seul vrai.
				expect(C.has(P.troisCotes) && C.has(P.quatreCotes)).toBe(false);
				if (props.has(P.troisCotes) && props.has(P.quatreCotes)) {
					expect(C.has(P.troisCotes)).not.toBe(C.has(P.quatreCotes)); // XOR
				}
				// « tous égaux » exclut « au moins deux longueurs différentes ».
				expect(C.has(P.tousEgaux) && C.has(P.longueursDiff)).toBe(false);
				// « tous égaux » vrai ⇒ « au moins deux égaux » vrai (si proposé).
				if (C.has(P.tousEgaux) && props.has(P.deuxEgaux)) {
					expect(C.has(P.deuxEgaux)).toBe(true);
				}
				// « quatre angles droits » vrai ⇒ quadrilatère ⇒ pas « trois côtés » vrai.
				if (C.has(P.quatreAnglesDroits) && props.has(P.troisCotes)) {
					expect(C.has(P.troisCotes)).toBe(false);
				}
			}
		});
	});
});

describe('Figures par propriétés CM1 — table de vérité (lecture directe de FIGURES)', () => {
	// Attendus DÉRIVÉS de la géométrie (pas recopiés de la table) pour les 3 propriétés
	// visées : angle droit / côtés tous égaux / côtés opposés parallèles.
	const VERITE: Record<
		string,
		{ angleDroit: boolean; tousEgaux: boolean; opposesParalleles: boolean }
	> = {
		carre: { angleDroit: true, tousEgaux: true, opposesParalleles: true },
		rectangle: { angleDroit: true, tousEgaux: false, opposesParalleles: true },
		losange: { angleDroit: false, tousEgaux: true, opposesParalleles: true },
		parallelogramme: { angleDroit: false, tousEgaux: false, opposesParalleles: true },
		// Le contre-exemple INDISPENSABLE : parallélisme = Faux (sinon la propriété serait
		// toujours vraie sur le pool).
		quadrilatereQuelconque: { angleDroit: false, tousEgaux: false, opposesParalleles: false },
	};

	for (const [shape, attendu] of Object.entries(VERITE)) {
		it(`${shape} : angle droit=${attendu.angleDroit}, tous égaux=${attendu.tousEgaux}, parallèles=${attendu.opposesParalleles}`, () => {
			const fig = FIGURES.find((f) => f.shape === shape);
			expect(fig, `forme absente de FIGURES : ${shape}`).toBeDefined();
			// « angle droit » codé par les deux affirmations (au moins un / quatre) : même
			// valeur pour ces cinq quadrilatères.
			expect(fig!.faits.angleDroit).toBe(attendu.angleDroit);
			expect(fig!.faits.quatreAnglesDroits).toBe(attendu.angleDroit);
			expect(fig!.faits.tousEgaux).toBe(attendu.tousEgaux);
			expect(fig!.faits.opposesParalleles).toBe(attendu.opposesParalleles);
		});
	}

	it('aucun triangle ne porte le fait « côtés opposés parallèles » (clé absente des faits)', () => {
		const triangles = FIGURES.filter((f) => f.shape.startsWith('triangle'));
		expect(triangles.length).toBeGreaterThan(0);
		for (const t of triangles) {
			expect('opposesParalleles' in t.faits, `${t.shape} porte à tort le parallélisme`).toBe(false);
		}
	});
});

describe('Figures par propriétés CM1 — modes déclarés', () => {
	it('mode par défaut = « qcm » (vrai/faux devinable à 50 %, jamais rendu plus dur par défaut)', () => {
		const type = getType();
		expect(defaultMode(type)).toBe('qcm');
	});

	it('« qcm » recommandé, « coche » présent mais non recommandé', () => {
		const type = getType();
		expect(hasMode(type, 'qcm')).toBe(true);
		expect(hasMode(type, 'coche')).toBe(true);
		const qcm = type.modes!.find((m) => m.id === 'qcm')!;
		const coche = type.modes!.find((m) => m.id === 'coche')!;
		expect(qcm.recommended).toBe(true);
		expect(coche.recommended).toBeFalsy();
	});
});

describe('Variante qcmMulti — câblage (#253)', () => {
	it('checkAnswer renvoie false pour un exercice qcmMulti (correction déléguée au runner)', () => {
		const ex: Exercise = {
			type: 'qcmMulti',
			question: 'Coche…',
			propositions: [P.tousEgaux, P.quatreCotes, P.angleDroit, P.longueursDiff],
			correctes: [P.tousEgaux, P.quatreCotes],
		};
		// Aucune saisie ne valide via la correction générique — la correction est tout-ou-rien
		// dans le runner dédié (ui/lecon-qcm-multi.ts).
		expect(checkAnswer(ex, P.tousEgaux)).toBe(false);
		expect(checkAnswer(ex, `${P.tousEgaux}|${P.quatreCotes}`)).toBe(false);
		expect(checkAnswer(ex, '')).toBe(false);
	});

	// Fabrique une leçon factice dont le generate() renvoie un qcmMulti, pour EXERCER
	// directement la branche de repli « normalement pas atteinte » de genLessonItem.
	const lessonQcmMulti = (propositions: string[], correctes: string[]): LessonDef => ({
		id: 'test-qcm-multi-repli',
		label: 'repli qcmMulti',
		subject: 'math',
		category: 'math-geometrie',
		levels: ['cm1'],
		exerciseType: {
			generate: (): Exercise => ({
				type: 'qcmMulti',
				question: 'Coche les propriétés vraies.',
				propositions,
				correctes,
				figure: '<svg>fig</svg>',
				parle: 'Coche les propriétés vraies.',
			}),
			check: checkAnswer,
		},
	});

	it('repli genLessonItem : propositions[0] vraie → item texte « Vrai » cohérent', () => {
		const item = genLessonItem(lessonQcmMulti([P.tousEgaux, P.longueursDiff], [P.tousEgaux]));
		expect(item.kind).toBe('text');
		expect(item.answer).toBe('Vrai'); // propositions[0] appartient à correctes
		expect(item.text).toBe(`Vrai ou faux ? ${P.tousEgaux}`);
		expect(item.figure).toBe('<svg>fig</svg>');
		expect(checkItemAnswer(item, 'Vrai')).toBe(true);
		expect(checkItemAnswer(item, 'Faux')).toBe(false);
		expect(item.choices).toBeUndefined(); // pas un QCM classique
	});

	it('repli genLessonItem : propositions[0] fausse → item texte « Faux » cohérent', () => {
		const item = genLessonItem(lessonQcmMulti([P.longueursDiff, P.tousEgaux], [P.tousEgaux]));
		expect(item.answer).toBe('Faux'); // propositions[0] N'appartient PAS à correctes
		expect(checkItemAnswer(item, 'Faux')).toBe(true);
		expect(checkItemAnswer(item, 'Vrai')).toBe(false);
	});
});

describe('Catalogue — branchement de geo-cm1-figures-proprietes (#253)', () => {
	it('leçon CM1 de géométrie, hors sprint, absente du CE2', () => {
		const lesson = getLessonById(LESSON_ID)!;
		expect(lesson).toBeDefined();
		expect(lesson.category).toBe('math-geometrie');
		expect(lesson.levels).toContain('cm1');
		expect(lesson.levels).not.toContain('ce2');
		expect(lesson.excludeFromSprint).toBe(true);
	});

	it('présente dans la géométrie CM1, absente de la géométrie CE2', () => {
		const cm1 = getLessonsByCategory('math-geometrie', 'cm1').map((l) => l.id);
		const ce2 = getLessonsByCategory('math-geometrie', 'ce2').map((l) => l.id);
		expect(cm1).toContain(LESSON_ID);
		expect(ce2).not.toContain(LESSON_ID);
	});
});
