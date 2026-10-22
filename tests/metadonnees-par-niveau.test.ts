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
import { avecConsigne, consignePourNiveau } from '../src/core/exercise';
import type { ConsigneFiche, Exercise, ExerciseType } from '../src/core/exercise';
import { calibrated, consigneParNiveau } from '../src/core/level-combinators';
import { rnd, withSeed } from '../src/core/utils';
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
const ADJ = 'fr-gram-clic-adj'; // #528 : second porteur de `labelNiveau` (épithète / attribut)
const lecon = (id: string): LessonDef => getLessonById(id)!;

/* Les SEULES leçons autorisées à se nommer différemment selon la classe, chacune avec la
   raison qui l'y oblige. Le mécanisme reste opt-in : une leçon qui se dote d'un
   `labelNiveau` sans entrée ici fait échouer le test de non-régression ci-dessous, et
   l'entrée ne s'écrit qu'avec une raison qui dise ce que le libellé neutre aurait de FAUX
   à l'un des niveaux servis (pas seulement d'imprécis). */
const LABEL_NIVEAU_JUSTIFIE: Record<string, string> = {
	[NOYAU]:
		'« noyau » est du vocabulaire CM1 (analyse du groupe nominal) : un CE2 ne doit pas le lire (#436)',
	[ADJ]: '« épithète » / « attribut » sont du vocabulaire CM1 : un CE2 ne doit pas les lire (#528)',
	'num-situer-10000':
		"au CM1, la leçon compare et encadre de GRANDS nombres (autour du million) : « jusqu'à 10 000 » y est une borne fausse (#777, critère 3)",
	'num-decompose-10000':
		"au CM1, la leçon décompose des grands nombres, jusqu'à 999 999 (critère 26) : « jusqu'à 10 000 » y est une borne fausse (#777, critère 3)",
};

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
		// Le mécanisme reste OPT-IN : la liste EXACTE est le gate. Deux raisons l'alimentent
		// aujourd'hui — un mot du programme CM1 qu'un CE2 ne doit pas lire (#436, #528), et une
		// borne chiffrée qui devient fausse au CM1 (#777, critère 3). Une leçon de plus devra
		// passer par `LABEL_NIVEAU_JUSTIFIE`, donc dire sa raison.
		expect([...porteurs].sort()).toEqual(Object.keys(LABEL_NIVEAU_JUSTIFIE).sort());
		for (const [id, raison] of Object.entries(LABEL_NIVEAU_JUSTIFIE)) {
			expect(raison.trim(), `${id} : dérogation sans raison`).not.toBe('');
		}
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

/* ============================================================
   `consigneParNiveau` et `avecConsigne` (#777, critère 4).
   ------------------------------------------------------------
   Exigence de `consigneParNiveau` : l'enfant lit la consigne du niveau DONT IL REÇOIT LES
   EXERCICES. L'oracle est donc `calibrated` lui-même, sur la même table : pour chaque
   classe de l'échelle et sans niveau, la consigne lue doit être celle de la table dont
   `calibrated` tire les exercices. Pas de copie de la règle de repli.
   Exigence d'`avecConsigne` : poser une consigne ne change rien d'autre au type — ni ce
   qu'il génère (à chaque niveau, sous graine), ni ses modes, ses niveaux, sa correction —
   et ne touche pas le type d'origine, partagé par d'autres leçons.
   ============================================================ */
const NIVEAUX_ET_SANS: (SchoolLevel | undefined)[] = [...LEVEL_ORDER, undefined];

const TABLES_CONSIGNE: Partial<Record<SchoolLevel, string>>[] = [
	{ ce2: 'C-ce2', cm1: 'C-cm1' },
	{ cm1: 'C-cm1' }, // leçon CM1 seule : un CE2 lit la consigne du CM1, qu'il reçoit
	{ ce2: 'C-ce2' },
	{ ce1: 'C-ce1', cm1: 'C-cm1' }, // trou au CE2 : repli vers le bas, sur le CE1
];

/** Le paramètre que `calibrated` sert à un niveau : la réponse de l'exercice généré. */
function paramServi(table: Partial<Record<SchoolLevel, string>>, n?: SchoolLevel): string {
	const type = calibrated<string>(table, (p) => ({
		generate: (): Exercise => ({ type: 'text', question: '@', answer: p }),
		check: () => false,
	}));
	const ex = type.generate(n === undefined ? undefined : { level: n });
	return ex.type === 'text' ? ex.answer : '';
}

type FabriqueConsigne = (table: Partial<Record<SchoolLevel, string>>) => ConsigneFiche;

function ecartsAvecCalibrated(fabrique: FabriqueConsigne): string[] {
	const out: string[] = [];
	for (const table of TABLES_CONSIGNE) {
		const type = { consigne: fabrique(table) };
		for (const n of NIVEAUX_ET_SANS) {
			const lue = consignePourNiveau(type, n);
			const attendue = paramServi(table, n);
			if (lue !== attendue) {
				out.push(
					`${JSON.stringify(table)} @${n ?? 'sans niveau'} : « ${lue} » au lieu de « ${attendue} »`,
				);
			}
		}
	}
	return out;
}

describe('consigneParNiveau — consigne déclinée par niveau (#777, critère 4)', () => {
	it('sur { ce2, cm1 } : niveau servi, CM2 et 6e repliés sur le CM1, CP et CE1 ramenés au CE2, sans niveau = CE2', () => {
		const type = { consigne: consigneParNiveau({ ce2: 'C-ce2', cm1: 'C-cm1' }) };
		const attendu: [SchoolLevel | undefined, string][] = [
			['ce2', 'C-ce2'],
			['cm1', 'C-cm1'],
			['cm2', 'C-cm1'],
			['6e', 'C-cm1'],
			['cp', 'C-ce2'],
			['ce1', 'C-ce2'],
			[undefined, 'C-ce2'],
		];
		for (const [n, c] of attendu) expect(consignePourNiveau(type, n), n ?? 'sans niveau').toBe(c);
	});

	it('même résolution que `calibrated` : la consigne lue est celle du niveau dont viennent les exercices', () => {
		expect(ecartsAvecCalibrated(consigneParNiveau)).toEqual([]);
	});

	it('témoins : une résolution exacte seule, un repli vers le haut ou un défaut figé au CE2 sont pris en défaut', () => {
		const mutants: Record<string, FabriqueConsigne> = {
			'niveau exact seulement': (t) => (l) => (l === undefined ? undefined : t[l]),
			'repli vers le niveau servi le plus HAUT': (t) => (l) =>
				(l === undefined ? undefined : t[l]) ?? t.cm1 ?? t.ce2,
			'sans niveau : toujours le CE2': (t) => (l) => t[l ?? 'ce2'] ?? t.cm1,
		};
		for (const [nom, m] of Object.entries(mutants)) {
			expect(ecartsAvecCalibrated(m), nom).not.toEqual([]);
		}
	});
});

/* Type d'origine FRAIS à chaque appel (un mutant fautif le modifie) : calibré sur deux
   niveaux, avec modes, session et correction, pour qu'une perte de l'un d'eux se voie. */
function typeOrigine(): ExerciseType {
	return calibrated<string>({ ce2: 'p-ce2', cm1: 'p-cm1' }, (p) => ({
		modes: [
			{ id: 'saisie', label: 'Écrire' },
			{ id: 'qcm', label: 'Choisir' },
		],
		exerciseKind: 'tuilesOrdre',
		consigne: 'Consigne d’origine.',
		generate: (): Exercise => ({ type: 'text', question: `${p} ${rnd(1, 1000)} @`, answer: p }),
		generateSession: (n: number): Exercise[] =>
			Array.from({ length: n }, (): Exercise => ({
				type: 'text',
				question: `${p} ${rnd(1, 1000)} @`,
				answer: p,
			})),
		check: (_ex, saisie) => saisie === 'ok',
	}));
}

type PoseConsigne = (t: ExerciseType, c: ConsigneFiche) => ExerciseType;

function ecartsAvecConsigne(pose: PoseConsigne): string[] {
	const out: string[] = [];
	const origine = typeOrigine();
	const temoin = typeOrigine();
	const t = pose(origine, consigneParNiveau({ ce2: 'Nouvelle CE2.', cm1: 'Nouvelle CM1.' }));
	if (consignePourNiveau(t, 'ce2') !== 'Nouvelle CE2.') out.push('consigne CE2 non posée');
	if (consignePourNiveau(t, 'cm1') !== 'Nouvelle CM1.') out.push('consigne CM1 non posée');
	if (consignePourNiveau(origine, 'cm1') !== 'Consigne d’origine.')
		out.push('type d’origine modifié');
	if (JSON.stringify(t.modes) !== JSON.stringify(temoin.modes)) out.push('modes perdus ou changés');
	if (JSON.stringify(t.levels) !== JSON.stringify(temoin.levels)) out.push('niveaux perdus');
	if (t.exerciseKind !== temoin.exerciseKind) out.push('format d’exercice perdu');
	for (const level of ['ce2', 'cm1'] as const) {
		for (const seed of [1, 2, 3]) {
			const a = JSON.stringify(withSeed(seed, () => t.generate({ level })));
			const b = JSON.stringify(withSeed(seed, () => temoin.generate({ level })));
			if (a !== b) out.push(`generate @${level} graine ${seed} : ${a} ≠ ${b}`);
			const sa = JSON.stringify(withSeed(seed, () => t.generateSession?.(3, { level })));
			const sb = JSON.stringify(withSeed(seed, () => temoin.generateSession?.(3, { level })));
			if (sa !== sb) out.push(`generateSession @${level} graine ${seed} : ${sa} ≠ ${sb}`);
		}
	}
	const ex = temoin.generate({ level: 'ce2' });
	for (const saisie of ['ok', 'ko']) {
		if (t.check(ex, saisie) !== temoin.check(ex, saisie)) out.push(`check(« ${saisie} ») changé`);
	}
	return out;
}

describe('avecConsigne — pose une consigne sans rien changer d’autre (#777, critère 4)', () => {
	it('la consigne est posée ; génération (par niveau), session, modes, niveaux, format et correction intacts ; origine intacte', () => {
		expect(ecartsAvecConsigne(avecConsigne)).toEqual([]);
	});

	it('témoins : modifier l’origine, perdre les modes, ou générer au plus bas niveau est pris en défaut', () => {
		const mutants: Record<string, PoseConsigne> = {
			'modifie le type d’origine': (t, c) => {
				t.consigne = c;
				return t;
			},
			'perd les modes': (t, c) => ({ generate: t.generate, check: t.check, consigne: c }),
			'perd la calibration': (t, c) => ({ ...t, consigne: c, generate: () => t.generate() }),
		};
		for (const [nom, m] of Object.entries(mutants)) {
			expect(ecartsAvecConsigne(m), nom).not.toEqual([]);
		}
	});
});
