/* ============================================================
   Métadonnées d'une leçon DÉCLINÉES PAR NIVEAU (#436) : `labelLecon` /
   `LessonDef.labelNiveau` (le nom de la leçon) et `consignePourNiveau` /
   `ConsigneFiche` (la consigne de fiche, désormais aussi acceptée sous forme de
   FONCTION du niveau).
   ------------------------------------------------------------
   Indépendance auteur ≠ code. Attendus dérivés :
   - du PROGRAMME : « nom noyau » est du vocabulaire CM1 (analyse du groupe
     nominal) ; au CE2 on nomme la classe « nom », en bloc. Un CE2 ne doit donc pas
     lire « noyau », un CM1 doit le garder ;
   - de la RÉSOLUTION de niveau déjà spécifiée (#225, `effectiveLevel`) : repli sur
     le plus haut niveau supporté en-dessous, clamp sur le plus bas au-dessus. Un
     libellé par niveau doit suivre EXACTEMENT la même résolution que la génération,
     sinon le titre et le contenu parlent de deux classes différentes ;
   - du CONTRAT documenté de `calibrated` : les métadonnées invariantes sont
     RECOPIÉES depuis le niveau le plus bas — d'où l'intérêt d'une consigne fonction,
     qui doit continuer de résoudre au niveau DEMANDÉ après cette recopie.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { labelLecon, effectiveLevel, LEVEL_ORDER } from '../src/core/levels';
import { consignePourNiveau } from '../src/core/exercise';
import type { ConsigneFiche, Exercise, ExerciseType } from '../src/core/exercise';
import { calibrated } from '../src/core/level-combinators';
import { getAllLessons, getLessonById } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { buildLessonFiche } from '../src/core/build';
import { createRenderContext } from '../src/core/items';

/* Leçon de test minimale : `labelLecon` ne lit que `label`, `labelNiveau` et `levels`. */
function leconTest(
	levels: SchoolLevel[],
	label: string,
	labelNiveau?: Partial<Record<SchoolLevel, string>>,
): LessonDef {
	const def: LessonDef = {
		id: 'test-label',
		label,
		subject: 'francais',
		category: 'test',
		levels,
		exerciseType: {
			generate: (): Exercise => ({ type: 'text', question: '@', answer: 'x' }),
			check: () => false,
		},
	};
	if (labelNiveau) def.labelNiveau = labelNiveau;
	return def;
}

const NOYAU = 'fr-gram-clic-noyau';
const lecon = (id: string): LessonDef => getLessonById(id)!;

describe('labelLecon — nom de la leçon par niveau (#436)', () => {
	it('« Clique sur le nom » au CE2, « Clique sur le nom noyau » au CM1', () => {
		const l = lecon(NOYAU);
		expect(labelLecon(l, 'ce2')).toBe('Clique sur le nom');
		expect(labelLecon(l, 'cm1')).toBe('Clique sur le nom noyau');
		// Le mot « noyau » est du vocabulaire CM1 : il ne doit pas atteindre le CE2.
		expect(labelLecon(l, 'ce2').toLowerCase()).not.toContain('noyau');
		expect(labelLecon(l, 'cm1').toLowerCase()).toContain('noyau');
	});

	it('sans niveau : le `label` neutre (écrans qui n’ont pas le niveau sous la main)', () => {
		const l = lecon(NOYAU);
		expect(labelLecon(l)).toBe(l.label);
		// Le label neutre doit rester JUSTE aux deux niveaux : pas de « noyau » dedans.
		expect(l.label.toLowerCase()).not.toContain('noyau');
	});

	it('niveau hors de la leçon : MÊME résolution que la génération (repli / clamp)', () => {
		const l = lecon(NOYAU); // levels = ['ce2', 'cm1']
		// Repli vers le plus haut niveau supporté en-dessous…
		expect(effectiveLevel(l, 'cm2')).toBe('cm1');
		expect(labelLecon(l, 'cm2')).toBe('Clique sur le nom noyau');
		// …et clamp vers le plus bas quand la leçon est entièrement au-dessus.
		expect(effectiveLevel(l, 'ce1')).toBe('ce2');
		expect(labelLecon(l, 'ce1')).toBe('Clique sur le nom');
		expect(labelLecon(l, 'cp')).toBe('Clique sur le nom');
	});

	it('niveau non déclaré dans `labelNiveau` : repli sur le `label`', () => {
		// Déclaration PARTIELLE (seul le CM1 renomme) : le CE2 garde le libellé par défaut.
		const partielle = leconTest(['ce2', 'cm1'], 'Nom neutre', { cm1: 'Nom CM1' });
		expect(labelLecon(partielle, 'cm1')).toBe('Nom CM1');
		expect(labelLecon(partielle, 'ce2')).toBe('Nom neutre');
		// Table vide : jamais d'`undefined` rendu à l'écran.
		expect(labelLecon(leconTest(['ce2'], 'Neutre', {}), 'ce2')).toBe('Neutre');
	});

	it('NON-RÉGRESSION : une leçon sans `labelNiveau` rend son `label` à tout niveau', () => {
		const porteurs: string[] = [];
		for (const l of getAllLessons()) {
			if (l.labelNiveau) {
				porteurs.push(l.id);
				continue;
			}
			for (const lvl of LEVEL_ORDER) expect(labelLecon(l, lvl), `${l.id}@${lvl}`).toBe(l.label);
			expect(labelLecon(l), l.id).toBe(l.label);
		}
		// Le mécanisme est OPT-IN : une seule leçon en a besoin aujourd'hui (#436).
		expect(porteurs).toEqual([NOYAU]);
	});

	it('un `labelNiveau` ne déclare que des niveaux servis, et jamais un libellé vide', () => {
		for (const l of getAllLessons()) {
			if (!l.labelNiveau) continue;
			for (const [lvl, texte] of Object.entries(l.labelNiveau)) {
				expect(l.levels, `${l.id} : ${lvl} non servi`).toContain(lvl as SchoolLevel);
				expect((texte ?? '').trim().length, `${l.id}@${lvl}`).toBeGreaterThan(0);
			}
		}
	});
});

describe('consignePourNiveau — forme chaîne (#42) et forme fonction (#436)', () => {
	it('forme CHAÎNE : la même consigne à tous les niveaux (données existantes)', () => {
		let chaines = 0;
		for (const l of getAllLessons()) {
			const c = l.exerciseType.consigne;
			if (typeof c !== 'string') continue;
			chaines++;
			for (const lvl of LEVEL_ORDER) expect(consignePourNiveau(l.exerciseType, lvl), l.id).toBe(c);
			expect(consignePourNiveau(l.exerciseType), l.id).toBe(c);
		}
		// L'échantillon n'est pas vide : la forme chaîne reste le cas courant.
		expect(chaines, 'aucune consigne sous forme de chaîne ?').toBeGreaterThan(20);
	});

	it('AUCUNE leçon ne rend autre chose qu’une chaîne (jamais une fonction à l’écran)', () => {
		// Le piège de la forme fonction : un lecteur qui lirait `type.consigne` en direct
		// afficherait « (level) => … » sur la fiche. `consignePourNiveau` est le seul seam.
		for (const l of getAllLessons()) {
			for (const lvl of LEVEL_ORDER) {
				const c = consignePourNiveau(l.exerciseType, lvl);
				expect(c === undefined || typeof c === 'string', `${l.id}@${lvl}`).toBe(true);
				if (typeof c === 'string') expect(c.trim().length, `${l.id}@${lvl}`).toBeGreaterThan(0);
			}
		}
	});

	it('forme FONCTION : la consigne CE2 et la consigne CM1 diffèrent vraiment', () => {
		// Attendus dérivés de la TÂCHE de chaque niveau, pas des chaînes du module :
		// au CE2 on demande TOUS les mots d'une classe nommée en bloc ; au CM1 un SEUL mot,
		// d'une sous-catégorie qui change d'un item à l'autre (« demandé »).
		const cas: Array<[string, RegExp, RegExp]> = [
			['fr-gram-clic-noyau', /tous les noms/iu, /noyau/iu],
			['fr-gram-clic-det', /tous les déterminants/iu, /déterminant/iu],
			['fr-gram-clic-pron', /pronom personnel sujet/iu, /pronom personnel/iu],
		];
		for (const [id, ce2Attendu, cm1Attendu] of cas) {
			const type = lecon(id).exerciseType;
			const ce2 = consignePourNiveau(type, 'ce2') ?? '';
			const cm1 = consignePourNiveau(type, 'cm1') ?? '';
			expect(ce2, `${id}@ce2`).toMatch(ce2Attendu);
			expect(cm1, `${id}@cm1`).toMatch(cm1Attendu);
			expect(cm1, `${id} : consigne identique aux deux niveaux`).not.toBe(ce2);
		}
		// Le CE2 ne sous-catégorise pas (article / possessif / démonstratif = attendus CM1),
		// et ne lit pas « noyau ».
		const det = consignePourNiveau(lecon('fr-gram-clic-det').exerciseType, 'ce2') ?? '';
		for (const mot of ['article', 'possessif', 'démonstratif', 'demandé']) {
			expect(det.toLowerCase(), `consigne CE2 déterminant : « ${mot} »`).not.toContain(mot);
		}
		expect(
			(consignePourNiveau(lecon('fr-gram-clic-noyau').exerciseType, 'ce2') ?? '').toLowerCase(),
		).not.toContain('noyau');
		// Sans niveau, on retombe sur le CE2 (jamais une consigne CM1 par défaut).
		expect(consignePourNiveau(lecon('fr-gram-clic-noyau').exerciseType)).toBe(
			consignePourNiveau(lecon('fr-gram-clic-noyau').exerciseType, 'ce2'),
		);
		// À un niveau NON SERVI, la consigne suit le même repli/clamp que le libellé (sinon
		// un CM2 lirait « Clique sur le nom noyau » au-dessus d'une consigne CE2).
		const type = lecon(NOYAU).exerciseType;
		expect(consignePourNiveau(type, 'cm2')).toBe(consignePourNiveau(type, 'cm1'));
		expect(consignePourNiveau(type, 'cp')).toBe(consignePourNiveau(type, 'ce2'));
	});

	it('NON-RÉGRESSION : la consigne CM1 du verbe garde son indice « deux mots »', () => {
		const verbe = lecon('fr-gram-clic-verbe').exerciseType;
		const ce2 = consignePourNiveau(verbe, 'ce2') ?? '';
		const cm1 = consignePourNiveau(verbe, 'cm1') ?? '';
		expect(cm1.toLowerCase()).toContain('deux mots'); // passé composé annoncé
		expect(ce2.toLowerCase()).not.toContain('deux mots'); // cible d'un seul mot au CE2
	});

	it('une consigne fonction traverse `calibrated` et résout au niveau DEMANDÉ', () => {
		// `calibrated` RECOPIE les métadonnées du niveau le plus bas : une consigne figée y
		// serait celle du CE2 pour tout le monde. La forme fonction doit voyager telle quelle.
		const consigne: ConsigneFiche = (level) =>
			level === 'cm1' ? 'Consigne CM1.' : 'Consigne CE2.';
		const build = (max: number): ExerciseType => ({
			consigne,
			generate: (): Exercise => ({ type: 'text', question: '@', answer: String(max) }),
			check: () => false,
		});
		const type = calibrated<number>({ ce2: 10, cm1: 100 }, build);
		expect(consignePourNiveau(type, 'ce2')).toBe('Consigne CE2.');
		expect(consignePourNiveau(type, 'cm1')).toBe('Consigne CM1.');
		expect(consignePourNiveau(type)).toBe('Consigne CE2.'); // sans niveau : plus bas
		// Contre-exemple qui justifie la règle : une consigne dérivée des `params` CAPTURÉS
		// à la construction est figée au niveau le plus bas, même via `consignePourNiveau`.
		const figee = calibrated<number>({ ce2: 10, cm1: 100 }, (max) => ({
			consigne: `Calcule jusqu'à ${max}.`,
			generate: (): Exercise => ({ type: 'text', question: '@', answer: String(max) }),
			check: () => false,
		}));
		expect(consignePourNiveau(figee, 'cm1')).toBe("Calcule jusqu'à 10.");
	});
});

describe('Fiche imprimée — titre et consigne parlent du MÊME niveau (#436)', () => {
	it('la fiche CE2 nomme la leçon et la tâche en vocabulaire CE2', () => {
		const html = buildLessonFiche(NOYAU, 'ce2', createRenderContext());
		expect(html.balisage).toContain('Clique sur le nom');
		expect(html.balisage).toContain('tous les noms');
		// (« noyau » nu apparaît dans l'id de leçon des attributs `data-lesson` : on cherche
		// donc la TOURNURE lisible, celle qui atteindrait l'enfant.)
		expect(html.balisage).not.toContain('nom noyau');
	});

	it('la fiche CM1 garde le vocabulaire du CM1 (titre ET consigne)', () => {
		const html = buildLessonFiche(NOYAU, 'cm1', createRenderContext());
		expect(html.balisage).toContain('Clique sur le nom noyau');
		expect(html.balisage).toContain('nom noyau du groupe nominal');
		expect(html.balisage).not.toContain('tous les noms');
	});
});
