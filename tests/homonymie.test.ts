/* ============================================================
   Vocabulaire CM1 — « Les homonymes » (homographes) (#254).
   ------------------------------------------------------------
   Leçon QCM sur banque taguée par niveau (`bankByLevel`). Un mot homographe porte
   2 ou 3 SENS RÉELS ; chaque item emploie le mot dans UN sens, l'enfant choisit ce
   sens parmi TOUS les sens réels du mot (les distracteurs sont les autres sens réels,
   jamais un sens inventé).

   Attendus DÉRIVÉS de la consigne et de la donnée (pas recopiés de l'implémentation) :
   - les options d'un item = l'ENSEMBLE des libellés des sens du mot, ni plus ni moins ;
   - le nombre d'options = le nombre de sens (2 ou 3), la banque mêle les deux cas ;
   - la réponse stockée = le sens de la phrase employée, incluse dans les choix ;
   - la correction accepte ce sens et rejette tout autre sens du même mot ;
   - GARDE-FOU anti-fuite : aucune phrase ne contient EN CLAIR le libellé d'un sens
     (sinon la réponse « fuiterait » dans l'énoncé) — balayé sur toute la table ;
   - câblage catalogue : banque CM1-only, leçon exposée en CM1 / vocabulaire, exclue
     du sprint (jugement de sens, pas un automatisme chronométrable).
   Pas de DOM ; logique pure.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	MOTS_HOMOGRAPHES,
	BANQUE_HOMONYMES,
	exerciceHomonyme,
	HOMONYMIE_LESSONS,
	type MotHomographe,
	type SensHomographe,
} from '../src/data/francais/homonymie';
import { pickFromBank } from '../src/core/level-combinators';
import { getLessonById } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import type { Item } from '../src/core/items';
import type { Exercise } from '../src/core/exercise';

// Les 15 homographes attendus par le cadrage (#254) — liste dressée à partir de la
// consigne, pas relue depuis l'ordre du tableau source.
const MOTS_ATTENDUS = [
	'glace',
	'carte',
	'pièce',
	'mine',
	'note',
	'avocat',
	'addition',
	'souris',
	'feuille',
	'bureau',
	'argent',
	'batterie',
	'règle',
	'vol',
	'cours',
];

// Narrowing strict (pas de cast) : un homographe produit TOUJOURS un QCM.
type QcmExercise = Extract<Exercise, { type: 'qcm' }>;
function asQcm(ex: Exercise): QcmExercise {
	if (ex.type !== 'qcm') throw new Error(`attendu un QCM, reçu « ${ex.type} »`);
	return ex;
}

// Parcourt TOUS les triplets (mot, sens, phrase) de la table — couverture exhaustive
// et déterministe, sans dépendre du tirage aléatoire.
function forEachTriplet(cb: (mot: MotHomographe, sens: SensHomographe, phrase: string) => void) {
	for (const mot of MOTS_HOMOGRAPHES) {
		for (const sens of mot.sens) {
			for (const phrase of sens.phrases) cb(mot, sens, phrase);
		}
	}
}

const libellesDe = (mot: MotHomographe) => mot.sens.map((s) => s.libelle);

describe('Homonymes (#254) — cohérence de la table', () => {
	it('contient exactement les 15 homographes attendus', () => {
		const mots = MOTS_HOMOGRAPHES.map((m) => m.mot);
		expect(mots).toHaveLength(15);
		expect(new Set(mots)).toEqual(new Set(MOTS_ATTENDUS));
	});

	it('chaque mot a 2 ou 3 sens, chaque sens ≥ 2 phrases, libellés d’un mot distincts', () => {
		for (const mot of MOTS_HOMOGRAPHES) {
			expect([2, 3], mot.mot).toContain(mot.sens.length);
			for (const sens of mot.sens) {
				expect(sens.phrases.length, `${mot.mot} / ${sens.libelle}`).toBeGreaterThanOrEqual(2);
				for (const p of sens.phrases) expect(p.trim().length, p).toBeGreaterThan(0);
			}
			const libelles = libellesDe(mot);
			expect(new Set(libelles).size, mot.mot).toBe(libelles.length); // aucun doublon de sens
		}
	});

	it('la banque mêle des mots à 2 sens ET des mots à 3 sens', () => {
		const tailles = MOTS_HOMOGRAPHES.map((m) => m.sens.length);
		expect(tailles.some((n) => n === 2)).toBe(true);
		expect(tailles.some((n) => n === 3)).toBe(true);
	});
});

describe('Homonymes (#254) — options = vrais sens uniquement (exhaustif)', () => {
	it('les choix = exactement les libellés des sens du mot (2 ou 3), distincts, réponse incluse', () => {
		forEachTriplet((mot, sens, phrase) => {
			const ex = asQcm(exerciceHomonyme(mot, sens, phrase));
			const attendus = libellesDe(mot);
			// Ensemble EXACT : aucun sens étranger, aucun sens inventé, aucun sens manquant.
			expect(new Set(ex.choices), phrase).toEqual(new Set(attendus));
			// Nombre d'options = nombre de sens du mot (2 ou 3), sans doublon.
			expect(ex.choices.length, phrase).toBe(mot.sens.length);
			expect(new Set(ex.choices).size, phrase).toBe(ex.choices.length);
			// Réponse = le sens de la phrase employée, et présente parmi les choix.
			expect(ex.answer, phrase).toBe(sens.libelle);
			expect(ex.choices, phrase).toContain(ex.answer);
		});
	});

	it('la correction accepte le bon sens et REJETTE tout autre sens du même mot', () => {
		const type = HOMONYMIE_LESSONS[0].exerciseType;
		forEachTriplet((mot, sens, phrase) => {
			const ex = asQcm(exerciceHomonyme(mot, sens, phrase));
			const item: Item = { text: ex.question, answer: ex.answer, kind: 'text' };
			// Chemin sprint (checkItemAnswer) ET chemin fiche (exerciseType.check).
			expect(checkItemAnswer(item, sens.libelle), `${phrase} → ${sens.libelle}`).toBe(true);
			expect(type.check(ex, sens.libelle), `${phrase} → ${sens.libelle}`).toBe(true);
			for (const autre of mot.sens) {
				if (autre.libelle === sens.libelle) continue;
				expect(checkItemAnswer(item, autre.libelle), `${phrase} ↛ ${autre.libelle}`).toBe(false);
				expect(type.check(ex, autre.libelle), `${phrase} ↛ ${autre.libelle}`).toBe(false);
			}
		});
	});
});

describe('Homonymes (#254) — garde-fou anti-fuite', () => {
	// Un item ne doit pas trahir sa réponse : la phrase ne doit contenir, en toutes
	// lettres, AUCUN des libellés-choix du mot (le mot-cible seul, ex. « glace », peut
	// figurer ; c'est « crème glacée » qui ne le doit pas). Balaye 15 mots × sens × phrases.
	it('aucune phrase ne contient en clair un libellé de sens du mot', () => {
		const fuites: string[] = [];
		for (const mot of MOTS_HOMOGRAPHES) {
			const libelles = libellesDe(mot).map((l) => l.toLowerCase());
			for (const sens of mot.sens) {
				for (const phrase of sens.phrases) {
					const p = phrase.toLowerCase();
					for (const l of libelles) {
						if (p.includes(l))
							fuites.push(`« ${mot.mot} » : la phrase « ${phrase} » contient « ${l} »`);
					}
				}
			}
		}
		expect(fuites).toEqual([]);
	});
});

describe('Homonymes (#254) — génération aléatoire (invariants par échantillon)', () => {
	it('sur 600 tirages : options = sens réels, réponse incluse, phrase cohérente avec le sens', () => {
		const type = getLessonById('fr-vocab-homonymes-cm1')!.exerciseType;
		for (let n = 0; n < 600; n++) {
			const ex = asQcm(type.generate({ level: 'cm1' }));
			// Retrouve le mot/sens de manière INDÉPENDANTE du libellé de la question :
			// le seul (mot, sens) cohérent est celui dont un libellé == answer ET dont une
			// phrase de CE sens apparaît dans l'énoncé. Vérifie du même coup phrase ↔ sens.
			const matches = MOTS_HOMOGRAPHES.filter((mot) =>
				mot.sens.some(
					(s) => s.libelle === ex.answer && s.phrases.some((p) => ex.question.includes(p)),
				),
			);
			expect(matches, ex.question).toHaveLength(1);
			const mot = matches[0];
			expect(new Set(ex.choices), ex.question).toEqual(new Set(libellesDe(mot)));
			expect(ex.choices.length, ex.question).toBe(mot.sens.length);
			expect(ex.choices, ex.question).toContain(ex.answer);
		}
	});

	it('le tirage produit des items à 2 ET à 3 options', () => {
		const type = getLessonById('fr-vocab-homonymes-cm1')!.exerciseType;
		const tailles = new Set<number>();
		for (let n = 0; n < 600; n++)
			tailles.add(asQcm(type.generate({ level: 'cm1' })).choices.length);
		expect(tailles.has(2)).toBe(true);
		expect(tailles.has(3)).toBe(true);
	});
});

describe('Homonymes (#254) — banque & catalogue', () => {
	it('la banque ne couvre que le CM1', () => {
		expect(BANQUE_HOMONYMES.levels).toEqual(['cm1']);
		expect(BANQUE_HOMONYMES.at('cm1')).toHaveLength(15);
	});

	it('pickFromBank(cm1) ne tire que des mots tagués CM1', () => {
		const attendus = new Set(MOTS_ATTENDUS);
		for (let n = 0; n < 300; n++) {
			const mot = pickFromBank(BANQUE_HOMONYMES, 'cm1');
			expect(mot.levels).toContain('cm1');
			expect(attendus.has(mot.mot), mot.mot).toBe(true);
		}
	});

	it('la leçon est exposée en CM1, en Vocabulaire, et exclue du sprint', () => {
		const lesson = getLessonById('fr-vocab-homonymes-cm1');
		expect(lesson).toBeDefined();
		expect(lesson!.category).toBe('fr-vocabulaire');
		expect(lesson!.levels).toEqual(['cm1']);
		// Choix délibéré (#254) : jugement de sens, pas un automatisme chronométrable.
		expect(lesson!.excludeFromSprint).toBe(true);
	});
});
