/* ============================================================
   Ordre pédagogique + leçon du jour (#208).
   Logique pure : ordre d'affichage (core/ordre.ts) et dérivation de la
   « leçon du jour » (core/lecon-du-jour.ts). Profil/localStorage reconstruits
   avant chaque test (même pattern que niveau.test.ts).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { ORDRE_LECONS } from '../src/data/ordre-pedagogique';
import { ordreLecons, positionLecon, trierParOrdre } from '../src/core/ordre';
import {
	getAllLessons,
	getLessonById,
	getLessonsBySubject,
	getLessonsByCategory,
} from '../src/core/catalog';
import type { LessonDef, SchoolLevel, SubjectId } from '../src/core/catalog';
import { leconDuJour, leconSuivante, sequenceLeconDuJour } from '../src/core/lecon-du-jour';
import {
	initProfiles,
	setNiveauReference,
	setNiveauMatiere,
	touchActiveProfile,
} from '../src/core/profiles';
import { recordLessonResult } from '../src/core/progress';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

// Raccourcis typés `string[]` (le helper évite le `| undefined` du Partial).
const M_CE2 = ordreLecons('math', 'ce2');
const M_CM1 = ordreLecons('math', 'cm1');
const F_CE2 = ordreLecons('francais', 'ce2');
const F_CM1 = ordreLecons('francais', 'cm1');

describe('core/ordre — helpers', () => {
	it('ordreLecons rend la liste de la matière×niveau (ou vide si non renseigné)', () => {
		expect(ordreLecons('math', 'ce2')).toEqual(ORDRE_LECONS.math.ce2 as string[]);
		expect(ordreLecons('math', 'ce2')[0]).toBe('num-comparer');
		// Math CM1 = numération « grands nombres » (#240 : 6) + calcul mental (#241 : 2,
		// #250 : divisibilité & ordre de grandeur, 2, #251 : division euclidienne, 1 → 5) +
		// géométrie (#242, 6 + #253 : figure par ses propriétés, 1 + #252 : les angles CM1,
		// 1 → 8) + nombres décimaux (#246, 5 + #247, 4 → 9) + conversions de mesures (#248, 4
		// + #253 : aire & périmètre, 1 + #252 : durée écoulée, 1 → 6) + fractions ouvertes au
		// CM1 & fractions comme nombres (#249, 6 + 3 → 9) + micro-problèmes décimaux #255 : 4
		// (composition, transformation, comparaison, multiplication rouvertes au CM1) :
		// 6 + 5 + 8 + 9 + 6 + 9 + 4 = 47 leçons.
		expect(ordreLecons('math', 'cm1')).toHaveLength(47);
		expect(ordreLecons('math', 'cm1')[0]).toBe('num-comparer');
		// Français CM1 : 52 leçons verbe×temps + 3 QCM méta (#239) + 3 leçons de grammaire
		// « Les phrases » (#245 : type, forme, transfo négative) + 2 leçons d'accords CM1
		// (#243 : mots isolés + groupe nominal) + 4 leçons de vocabulaire CM1 (#244 :
		// contraires, sens proche, familles, préfixes/suffixes) + 1 leçon d'homonymes
		// (#254) + 1 leçon « Clique sur le verbe » (#259, partagée CE2/CM1) = 66.
		expect(ordreLecons('francais', 'cm1')).toHaveLength(66);
		// Niveau sans ordre défini → liste vide (fallback ordre de déclaration).
		expect(ordreLecons('math', 'cp')).toEqual([]);
		expect(ordreLecons('inconnue' as SubjectId, 'ce2')).toEqual([]);
	});

	it('positionLecon : index dans l’ordre, Infinity si absente', () => {
		const comparer = getLessonById('num-comparer')!;
		expect(positionLecon(comparer, 'ce2')).toBe(0);
		const fake = { ...comparer, id: 'zzz-inconnue', subject: 'math' as SubjectId };
		expect(positionLecon(fake, 'ce2')).toBe(Infinity);
	});

	it('trierParOrdre : trie par position, leçons hors ordre en queue (stable)', () => {
		const real = getLessonById('math-doubles')!; // position connue, > 0
		const fakeA = { ...real, id: 'zzz-inconnue-1' };
		const fakeB = { ...real, id: 'zzz-inconnue-2' };
		const comparer = getLessonById('num-comparer')!; // position 0
		const entree: LessonDef[] = [real, fakeA, comparer, fakeB];
		const trie = trierParOrdre(entree, 'ce2').map((l) => l.id);
		// num-comparer (0) avant math-doubles ; puis les inconnues dans l'ordre d'entrée.
		expect(trie).toEqual(['num-comparer', 'math-doubles', 'zzz-inconnue-1', 'zzz-inconnue-2']);
	});
});

describe('core/ordre — application au catalogue', () => {
	it('getLessonsBySubject(niveau) rend exactement l’ordre pédagogique de ce niveau', () => {
		// L'ordre est une permutation complète du catalogue du niveau → égalité stricte.
		expect(getLessonsBySubject('math', 'ce2').map((l) => l.id)).toEqual(M_CE2);
		expect(getLessonsBySubject('francais', 'ce2').map((l) => l.id)).toEqual(F_CE2);
		expect(getLessonsBySubject('francais', 'cm1').map((l) => l.id)).toEqual(F_CM1);
		// Maths CM1 : numération « grands nombres » (#240) + calcul mental (#241).
		expect(getLessonsBySubject('math', 'cm1').map((l) => l.id)).toEqual(M_CM1);
	});

	it('getLessonsByCategory(niveau) : leçons triées selon l’ordre (positions croissantes)', () => {
		const ids = getLessonsByCategory('math-numeration', 'ce2').map((l) => l.id);
		const positions = ids.map((id) => M_CE2.indexOf(id));
		const triees = [...positions].sort((a, b) => a - b);
		expect(positions).toEqual(triees); // déjà croissant
		expect(positions.every((p) => p >= 0)).toBe(true); // toutes connues de l'ordre
	});

	it('sans niveau, l’ordre de déclaration est préservé (comportement inchangé)', () => {
		const sansNiveau = getLessonsByCategory('math-numeration').map((l) => l.id);
		const decl = getAllLessons()
			.filter((l) => l.category === 'math-numeration')
			.map((l) => l.id);
		expect(sansNiveau).toEqual(decl);
	});
});

describe('core/ordre — garde-fous de cohérence (timeline ↔ catalogue)', () => {
	// Force la mise à jour de l'ordre quand on ajoute/retire une leçon (#208).
	it('toute leçon du catalogue figure dans l’ordre de chacun de ses niveaux renseignés', () => {
		const orphelines: string[] = [];
		for (const l of getAllLessons()) {
			for (const niveau of l.levels) {
				const liste = ORDRE_LECONS[l.subject]?.[niveau];
				if (liste && !liste.includes(l.id)) orphelines.push(`${l.id}@${niveau}`);
			}
		}
		expect(orphelines).toEqual([]);
	});

	it('aucun ID fantôme dans les ordres (existe, bonne matière, bon niveau)', () => {
		const fantomes: string[] = [];
		for (const subject of Object.keys(ORDRE_LECONS) as SubjectId[]) {
			for (const niveau of Object.keys(ORDRE_LECONS[subject]) as SchoolLevel[]) {
				for (const id of ORDRE_LECONS[subject][niveau]!) {
					const def = getLessonById(id);
					if (!def || def.subject !== subject || !def.levels.includes(niveau)) {
						fantomes.push(`${id}@${subject}/${niveau}`);
					}
				}
			}
		}
		expect(fantomes).toEqual([]);
	});

	it('aucun doublon dans un ordre', () => {
		for (const subject of Object.keys(ORDRE_LECONS) as SubjectId[]) {
			for (const niveau of Object.keys(ORDRE_LECONS[subject]) as SchoolLevel[]) {
				const liste = ORDRE_LECONS[subject][niveau]!;
				expect(new Set(liste).size).toBe(liste.length);
			}
		}
	});
});

describe('leçon du jour', () => {
	it('profil neuf (CE2) : démarre sur la 1re leçon de l’ordre, matières alternées 1:1', () => {
		setNiveauReference('ce2');
		const seq = sequenceLeconDuJour();
		// Round-robin math/français : math[0], fr[0], math[1], fr[1]…
		expect(seq[0].id).toBe(M_CE2[0]); // num-comparer
		expect(seq[1].id).toBe(F_CE2[0]); // fr-gram-ponctuation
		expect(seq[2].id).toBe(M_CE2[1]); // math-tables-addition
		expect(seq[3].id).toBe(F_CE2[1]); // fr-gram-type-phrase
		expect(leconDuJour()!.id).toBe('num-comparer');
	});

	it('avance par la maîtrise : une étoile sur la leçon courante passe à la suivante', () => {
		setNiveauReference('ce2');
		expect(leconDuJour()!.id).toBe('num-comparer');
		recordLessonResult('num-comparer', true); // étoile @ce2
		// num-comparer n'est plus dans les restantes → la tête maths avance.
		expect(leconDuJour()!.id).toBe(M_CE2[1]); // math-tables-addition
	});

	it('contournement « voir une autre leçon » : leçon suivante du fil, cyclique', () => {
		setNiveauReference('ce2');
		const seq = sequenceLeconDuJour();
		expect(leconSuivante('num-comparer')!.id).toBe(seq[1].id); // fr-gram-ponctuation
		// ID hors fil (déjà acquise / inconnue) → repart de la tête.
		expect(leconSuivante('zzz-inconnue')!.id).toBe(seq[0].id);
	});

	it('tout acquis → plus de leçon du jour (l’accueil basculera vers la révision)', () => {
		setNiveauReference('ce2');
		for (const subj of ['math', 'francais'] as SubjectId[]) {
			for (const l of getLessonsBySubject(subj, 'ce2')) recordLessonResult(l.id, true);
		}
		expect(sequenceLeconDuJour()).toHaveLength(0);
		expect(leconDuJour()).toBeNull();
		expect(leconSuivante('num-comparer')).toBeNull();
	});

	it('multi-niveau : en CM1, déroule les ordres CM1, file vide ⇒ on continue l’autre matière', () => {
		setNiveauReference('cm1');
		const seq = sequenceLeconDuJour();
		// math CM1 = 47 leçons (numération #240 + calcul mental #241, #250 & #251 + géométrie
		// #242, figure par ses propriétés #253 & les angles CM1 #252 + nombres décimaux #246 &
		// écritures équivalentes #247 + conversions de mesures #248, aire & périmètre #253 &
		// durée écoulée #252 + fractions au CM1 & fractions comme nombres #249 + micro-problèmes
		// décimaux #255), français CM1 =
		// 66 (conjugaison #239 + grammaire « phrases » #245 +
		// accords #243 + vocabulaire #244 + homonymes #254 + « Clique sur le verbe » #259) →
		// entrelacement 1:1, puis la matière la plus longue (français) seule.
		expect(seq).toHaveLength(M_CM1.length + F_CM1.length);
		expect(seq[0].id).toBe(M_CM1[0]); // math.cm1[0] = num-comparer
		expect(seq[1].id).toBe(F_CM1[0]); // fr-gram-type-phrase (grammaire en tête au CM1)
		expect(seq[2].id).toBe(M_CM1[1]); // math.cm1[1] = math-multiples-50
		expect(seq[3].id).toBe(F_CM1[1]);
		expect(leconDuJour()!.id).toBe(M_CM1[0]);
	});

	it('niveau PAR MATIÈRE : maths en CM1, français en CE2, chacun sur son ordre', () => {
		setNiveauReference('ce2');
		setNiveauMatiere('math', 'cm1'); // profil en dents de scie (#225)
		const seq = sequenceLeconDuJour();
		expect(seq[0].id).toBe(M_CM1[0]); // maths CM1 (num-comparer)
		expect(seq[1].id).toBe(F_CE2[0]); // français reste CE2
		expect(seq[2].id).toBe(M_CM1[1]); // maths CM1 continue (math-multiples-50)
		expect(seq[3].id).toBe(F_CE2[1]);
	});
});
