/* ============================================================
   Tableau de conversion — verdict et relecture d'un tableau SAISI (#734, PR 4).

   `src/core/tableau-lecture.ts` est sorti du runner quand la séance partagée a dû noter un
   tableau sans rien peindre : le jeu libre et la séance partagée jugent et relisent le même
   tableau avec ces quatre fonctions. Ce fichier tient ce qu'elles AJOUTENT à
   `verdictsCases` / `nombreTableauSaisi`, déjà éprouvées case par case dans
   `tableau-verdict.test.ts` et `erreur-representation.test.ts` :

   - `jugerTableau` rend DEUX verdicts séparés (chiffres, virgule) : une virgule fausse ne
     repeint aucune case juste, et une case fausse ne rend pas la virgule fausse ;
   - la virgule n'est jugée qu'en mode « virgule », et à la position attendue en index de
     CASE, une tête de colonne à deux chiffres comprise ;
   - `saisieTableau` relit ce que l'enfant a posé (virgule posée comprise) avec l'unité, et
     l'écrit comme l'attendue (« 20 000 mL », groupé à partir de 10 000), trou compris ;
   - `attendueTableau` écrit la réponse comme les énoncés (« 20 000 mL »).

   Les attendus sont recalculés à la main depuis la question (valeur des rangs), jamais
   recopiés d'une formule. Fixtures : la tranche fixe des longueurs du CM1 (km → mm).
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
import {
	attendueTableau,
	jugerTableau,
	saisieTableau,
	unitesDesCases,
	type TableauConversion,
} from '../src/core/tableau-lecture';
import { TROU } from '../src/core/tableau-verdict';
import { MESURE_LESSONS } from '../src/data/maths/mesures';
import type { SchoolLevel } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Espace fine insécable, désignée par son point de code (convention de core/nombres.ts). */
const U202F = String.fromCharCode(0x202f);

const LONGUEURS: [string, string][] = [
	['km', 'kilomètre'],
	['hm', 'hectomètre'],
	['dam', 'décamètre'],
	['m', 'mètre'],
	['dm', 'décimètre'],
	['cm', 'centimètre'],
	['mm', 'millimètre'],
];

/** Un tableau des longueurs fabriqué à la main. `chiffres` : un élément par COLONNE (la tête
 *  peut en porter deux). `virgule` absent = mode « tableau » sans virgule dessinée. */
function tableau(o: {
	chiffres: string[];
	connue: string;
	demandee: string;
	answer: string;
	virguleApres?: number;
	virguleLibre?: boolean;
}): TableauConversion {
	return {
		type: 'tableauConversion',
		question: `? = @ ${o.demandee}`,
		answer: o.answer,
		answerUnit: o.demandee,
		uniteConnue: o.connue,
		colonnes: LONGUEURS.map(([unite, nom], i) => ({
			unite,
			nom,
			transit: false,
			chiffres: o.chiffres[i],
		})),
		...(o.virguleApres !== undefined ? { virguleApres: o.virguleApres } : {}),
		...(o.virguleLibre ? { virguleLibre: true } : {}),
	};
}

/* « 3 km = ? m » (mode tableau). 3 km = 3 en km, puis des zéros. La question exige km, hm,
   dam et m (la donnée en km, la réponse se lit en m) ; dm, cm, mm sont hors question. */
const KM_EN_M = tableau({
	chiffres: ['3', '0', '0', '0', '0', '0', '0'],
	connue: 'km',
	demandee: 'm',
	answer: '3000',
});

/* « 456 cm = ? m » au CM1, mode « virgule » : 4 m 5 dm 6 cm, réponse 4,56 m. La virgule va
   juste après la colonne des mètres (index de colonne 3, donc case 3 : têtes à un chiffre). */
const CM_EN_M_VIRGULE = tableau({
	chiffres: ['0', '0', '0', '4', '5', '6', '0'],
	connue: 'cm',
	demandee: 'm',
	answer: '4,56',
	virguleApres: 3,
	virguleLibre: true,
});
/* La même question en mode « tableau » : l'application DESSINE la virgule. */
const CM_EN_M_TABLEAU = tableau({
	chiffres: ['0', '0', '0', '4', '5', '6', '0'],
	connue: 'cm',
	demandee: 'm',
	answer: '4,56',
	virguleApres: 3,
});
/* Ce qu'écrit l'enfant pour « 456 cm » : 4, 5, 6 dans m, dm, cm ; le reste laissé vide. */
const SAISIE_456 = ['', '', '', '4', '5', '6', ''];

/* « 12 450 m = ? km », mode « virgule » : la tête (km) absorbe les dizaines de km et porte
   DEUX chiffres, donc DEUX cases. Réponse 12,45 km. La virgule se pose après la colonne des
   km, c'est-à-dire après la case 1 (le 2), jamais entre le 1 et le 2 (case 0). */
const TETE_DOUBLE = tableau({
	chiffres: ['12', '4', '5', '0', '0', '0', '0'],
	connue: 'm',
	demandee: 'km',
	answer: '12,45',
	virguleApres: 0,
	virguleLibre: true,
});
const SAISIE_12450 = ['1', '2', '4', '5', '0', '', '', ''];

describe('unitesDesCases — une unité par CASE, dans l’ordre des cases', () => {
	it('têtes à un chiffre : une case par colonne, dans l’ordre grande → petite unité', () => {
		expect(unitesDesCases(KM_EN_M)).toEqual(['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm']);
	});

	it('tête à deux chiffres : deux cases « km », puis les autres colonnes décalées d’un rang', () => {
		const u = unitesDesCases(TETE_DOUBLE);
		expect(u).toEqual(['km', 'km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm']);
		// Autant d'unités que de cases saisissables : sans quoi la relecture du journal
		// attribuerait le chiffre d'une case à l'unité de sa voisine.
		expect(u).toHaveLength(SAISIE_12450.length);
	});
});

describe('jugerTableau — chiffres (mode tableau)', () => {
	it('tableau juste, réduit à la question : chiffres justes, virgule hors sujet', () => {
		const r = jugerTableau(KM_EN_M, ['3', '0', '0', '0', '', '', ''], null);
		expect(r.chiffresOk).toBe(true);
		expect(r.virguleOk).toBe(true);
		expect(r.verdicts).toHaveLength(7);
		expect(r.verdicts).not.toContain('faux');
	});

	it('un seul chiffre faux (5 dans les m : 3005 m) : chiffres faux, et c’est CETTE case qui l’est', () => {
		const r = jugerTableau(KM_EN_M, ['3', '0', '0', '5', '', '', ''], null);
		expect(r.chiffresOk).toBe(false);
		expect(r.verdicts[3]).toBe('faux');
		expect(r.verdicts.filter((v) => v === 'faux')).toHaveLength(1);
	});

	it('case EXIGÉE laissée vide (le 0 des hm) : chiffres faux', () => {
		const r = jugerTableau(KM_EN_M, ['3', '', '0', '0', '', '', ''], null);
		expect(r.chiffresOk).toBe(false);
		expect(r.verdicts[1]).toBe('faux');
	});

	it('zéros écrits hors de la question (dm, cm, mm) : acceptés, le tableau reste juste', () => {
		const r = jugerTableau(KM_EN_M, ['3', '0', '0', '0', '0', '0', '0'], null);
		expect(r.chiffresOk).toBe(true);
	});

	it('chiffre parasite hors de la question (4 dans les cm) : chiffres faux', () => {
		// 3 km 4 cm n'est pas 3 km : la case hors question n'est tolérée que vide ou à zéro.
		const r = jugerTableau(KM_EN_M, ['3', '0', '0', '0', '0', '4', '0'], null);
		expect(r.chiffresOk).toBe(false);
		expect(r.verdicts[5]).toBe('faux');
	});

	it('mode tableau : la virgule est DESSINÉE par l’application, jamais reprochée à l’enfant', () => {
		// « 456 cm = ? m » : la réponse est décimale, l'écran pose la virgule (virguleApres = 3),
		// l'enfant n'en pose aucune. Lui compter une virgule absente serait le juger sur un
		// geste qu'on ne lui a pas demandé.
		const r = jugerTableau(CM_EN_M_TABLEAU, SAISIE_456, null);
		expect(r.chiffresOk).toBe(true);
		expect(r.virguleOk).toBe(true);
	});
});

describe('jugerTableau — mode « virgule » : deux verdicts SÉPARÉS', () => {
	it('chiffres justes, virgule après les m : tout juste', () => {
		const r = jugerTableau(CM_EN_M_VIRGULE, SAISIE_456, 3);
		expect(r).toMatchObject({ chiffresOk: true, virguleOk: true });
	});

	it('chiffres justes, virgule un cran trop loin (après les dm : 45,6 m) : virgule fausse, chiffres toujours justes', () => {
		const r = jugerTableau(CM_EN_M_VIRGULE, SAISIE_456, 4);
		expect(r.chiffresOk).toBe(true);
		expect(r.virguleOk).toBe(false);
		// Aucune case juste repeinte en rouge pour une virgule.
		expect(r.verdicts).not.toContain('faux');
	});

	it('chiffres justes, virgule un cran trop tôt (après les dam : 0,456 m) : virgule fausse', () => {
		const r = jugerTableau(CM_EN_M_VIRGULE, SAISIE_456, 2);
		expect(r).toMatchObject({ chiffresOk: true, virguleOk: false });
	});

	it('virgule ABSENTE alors que le mode la demande : virgule fausse', () => {
		const r = jugerTableau(CM_EN_M_VIRGULE, SAISIE_456, null);
		expect(r).toMatchObject({ chiffresOk: true, virguleOk: false });
	});

	it('un chiffre faux sous une virgule juste : chiffres faux, virgule juste', () => {
		const r = jugerTableau(CM_EN_M_VIRGULE, ['', '', '', '4', '7', '6', ''], 3);
		expect(r).toMatchObject({ chiffresOk: false, virguleOk: true });
	});

	it('tête à deux chiffres : la virgule attendue est après le 2 de « 12 » (case 1), jamais entre le 1 et le 2', () => {
		expect(jugerTableau(TETE_DOUBLE, SAISIE_12450, 1)).toMatchObject({
			chiffresOk: true,
			virguleOk: true,
		});
		// Case 0 = « 1,2450 km » : l'index de COLONNE (0) pris pour un index de CASE.
		expect(jugerTableau(TETE_DOUBLE, SAISIE_12450, 0).virguleOk).toBe(false);
		// Case 2 = « 124,5 km ».
		expect(jugerTableau(TETE_DOUBLE, SAISIE_12450, 2).virguleOk).toBe(false);
	});
});

describe('saisieTableau — la réponse donnée telle que le journal la relit', () => {
	it('mode tableau : lue dans l’unité demandée, avec l’unité (« 4,56 m »)', () => {
		expect(saisieTableau(CM_EN_M_TABLEAU, SAISIE_456, null)).toBe('4,56 m');
	});

	it('mode virgule, virgule posée au bon rang : « 4,56 m »', () => {
		expect(saisieTableau(CM_EN_M_VIRGULE, SAISIE_456, 3)).toBe('4,56 m');
	});

	it('la virgule POSÉE prime sur l’unité demandée : un cran trop loin se relit « 45,6 m »', () => {
		// Le parent doit lire le nombre faux que l'écran montrait, pas la bonne valeur.
		expect(saisieTableau(CM_EN_M_VIRGULE, SAISIE_456, 4)).toBe('45,6 m');
		expect(saisieTableau(CM_EN_M_VIRGULE, SAISIE_456, 2)).toBe('0,456 m');
	});

	it('tête à deux chiffres : virgule après « 12 » → « 12,45 km » ; entre le 1 et le 2 → « 1,245 km »', () => {
		expect(saisieTableau(TETE_DOUBLE, SAISIE_12450, 1)).toBe('12,45 km');
		expect(saisieTableau(TETE_DOUBLE, SAISIE_12450, 0)).toBe('1,245 km');
	});

	it('chiffre parasite hors question : il se voit (3 km 4 cm = 3000,04 m)', () => {
		expect(saisieTableau(KM_EN_M, ['3', '0', '0', '0', '', '4', ''], null)).toBe('3000,04 m');
	});

	it('case exigée vide : le trou se voit, jamais la bonne réponse sous un tableau faux', () => {
		const lu = saisieTableau(KM_EN_M, ['3', '', '', '', '', '', ''], null);
		expect(lu).not.toBe('3000 m');
		expect(lu).toContain(TROU);
		expect(lu.endsWith(' m')).toBe(true);
	});
});

describe('saisieTableau — même graphie que l’attendue (groupée à partir de 10 000, #734)', () => {
	/* « 20 km = ? m » : la tête (km) porte deux chiffres, donc deux cases. 20 km = 20 000 m. */
	const KM20_EN_M_PARAMS = {
		chiffres: ['20', '0', '0', '0', '0', '0', '0'],
		connue: 'km',
		demandee: 'm',
		answer: '20000',
	};
	const KM20_EN_M = tableau(KM20_EN_M_PARAMS);

	it('entier ≥ 10 000 : « 20 000 m », espace fine insécable', () => {
		const lu = saisieTableau(KM20_EN_M, ['2', '0', '0', '0', '0', '', '', ''], null);
		expect(lu).toBe(`20${U202F}000 m`);
	});

	it('pile 10 000 : groupé (« 10 000 m ») ; 9999 juste en dessous : pas de séparateur', () => {
		const km10 = tableau({
			...KM20_EN_M_PARAMS,
			chiffres: ['10', '0', '0', '0', '0', '0', '0'],
			answer: '10000',
		});
		expect(saisieTableau(km10, ['1', '0', '0', '0', '0', '', '', ''], null)).toBe(
			`10${U202F}000 m`,
		);
		// 9 km 9 hm 9 dam 9 m = 9999 m : écrit comme dans les énoncés CE2, sans séparateur.
		const m9999 = tableau({
			...KM20_EN_M_PARAMS,
			chiffres: ['9', '9', '9', '9', '0', '0', '0'],
			answer: '9999',
		});
		expect(saisieTableau(m9999, ['9', '9', '9', '9', '', '', ''], null)).toBe('9999 m');
	});

	it('décimal ≥ 10 000 : partie entière groupée, décimales intactes (« 12 345,6 m »)', () => {
		// 12 km 3 hm 4 dam 5 m 6 dm = 12 345,6 m ; donnée en dm, réponse lue en m.
		const dm_en_m = tableau({
			chiffres: ['12', '3', '4', '5', '6', '0', '0'],
			connue: 'dm',
			demandee: 'm',
			answer: '12345,6',
		});
		const saisies = ['1', '2', '3', '4', '5', '6', '', ''];
		expect(saisieTableau(dm_en_m, saisies, null)).toBe(`12${U202F}345,6 m`);
		// Et c'est bien l'écriture de l'attendue, à l'identique.
		expect(saisieTableau(dm_en_m, saisies, null)).toBe(attendueTableau(dm_en_m));
	});

	it('décimal sous 10 000 : inchangé (« 1234,5 m »)', () => {
		const dm_en_m = tableau({
			chiffres: ['1', '2', '3', '4', '5', '0', '0'],
			connue: 'dm',
			demandee: 'm',
			answer: '1234,5',
		});
		expect(saisieTableau(dm_en_m, ['1', '2', '3', '4', '5', '', ''], null)).toBe('1234,5 m');
	});

	it('case exigée VIDE dans un grand nombre : le trou sort tel quel, ni regroupé ni comblé', () => {
		// Les hectomètres laissés vides sur « 20 km = ? m » : l'enfant a écrit 2, 0, _, 0, 0.
		// Le parent doit voir le trou, jamais « 20 000 m » sous un tableau faux.
		const lu = saisieTableau(KM20_EN_M, ['2', '0', '', '0', '0', '', '', ''], null);
		expect(lu).toBe(`20${TROU}00 m`);
		expect(lu).not.toContain(U202F);
	});
});

describe('attendueTableau — la réponse attendue, écrite comme dans les énoncés', () => {
	const contenance = (answer: string) =>
		({ ...KM_EN_M, answer, answerUnit: 'mL' }) satisfies TableauConversion;

	it('« 20 L = ? mL » : « 20 000 mL », groupé par une espace fine insécable', () => {
		expect(attendueTableau(contenance('20000'))).toMatch(new RegExp(`^20${U202F}000\\smL$`));
	});

	it('sous 10 000 : pas de séparateur (« 3000 m »), comme dans les énoncés CE2', () => {
		expect(attendueTableau(KM_EN_M)).toMatch(/^3000\sm$/);
	});

	it('décimal : virgule française conservée, décimales intactes (« 4,56 m », « 12,45 km »)', () => {
		expect(attendueTableau(CM_EN_M_VIRGULE)).toMatch(/^4,56\sm$/);
		expect(attendueTableau(TETE_DOUBLE)).toMatch(/^12,45\skm$/);
	});
});

/* ============================================================
   Confronté aux tableaux réellement tirés : un tableau rempli JUSTE est jugé juste, se
   relit comme la réponse attendue, et la virgule n'est juste qu'au bon rang.
   ============================================================ */
describe('tableaux réellement générés — jugés et relus comme la réponse attendue', () => {
	type Tirage = { id: string; level: SchoolLevel; mode: 'tableau' | 'virgule' };
	const TIRAGES: Tirage[] = [
		...(['mes-longueurs', 'mes-masses', 'mes-contenances'] as const).flatMap((id) =>
			(['ce2', 'cm1'] as const).map((level) => ({ id, level, mode: 'tableau' as const })),
		),
		// Le mode « virgule » n'existe qu'au CM1, et pas pour les masses (aucune conversion
		// décimale à ce niveau).
		{ id: 'mes-longueurs', level: 'cm1', mode: 'virgule' },
		{ id: 'mes-contenances', level: 'cm1', mode: 'virgule' },
	];

	function tirer(t: Tirage, n: number): TableauConversion[] {
		const type = MESURE_LESSONS.find((l) => l.id === t.id)!.exerciseType;
		const out: TableauConversion[] = [];
		for (let seed = 1; seed <= n; seed++) {
			const ex = withSeed(seed, () => type.generate({ mode: t.mode, level: t.level }));
			if (ex.type === 'tableauConversion') out.push(ex);
		}
		expect(out.length, `${t.id} ${t.level} ${t.mode} : aucun tableau tiré`).toBe(n);
		return out;
	}

	/** Toutes les cases remplies avec les chiffres attendus. */
	const remplies = (ex: TableauConversion) => ex.colonnes.flatMap((c) => c.chiffres.split(''));
	/** La virgule « juste après la colonne de l'unité demandée », en index de CASE, recalculée
	 *  depuis les colonnes (règle de classe), sans passer par `virguleApres`. */
	const caseApresUniteDemandee = (ex: TableauConversion) => {
		const col = ex.colonnes.findIndex((c) => c.unite === ex.answerUnit);
		return ex.colonnes.slice(0, col + 1).reduce((n, c) => n + c.chiffres.length, 0) - 1;
	};

	it('rempli juste (virgule au bon rang en mode virgule) : jugé juste, relu = réponse attendue', () => {
		let virgules = 0;
		for (const t of TIRAGES) {
			for (const ex of tirer(t, 150)) {
				const saisies = remplies(ex);
				const virgule = ex.virguleLibre ? caseApresUniteDemandee(ex) : null;
				if (ex.virguleLibre) virgules++;
				const nom = `${t.id} ${t.level} ${t.mode} « ${ex.question} »`;
				const r = jugerTableau(ex, saisies, virgule);
				expect(r.chiffresOk, `${nom} : chiffres justes jugés faux`).toBe(true);
				expect(r.virguleOk, `${nom} : virgule juste jugée fausse`).toBe(true);
				// Relu À L'IDENTIQUE de l'attendue, groupement des milliers compris (#734) : lues
				// côte à côte, « 20000 mL » et « 20 000 mL » feraient croire à deux nombres. (Ce
				// test comparait jusqu'ici la relecture à la valeur BRUTE, et verrouillait donc
				// précisément l'écart entre les deux graphies.)
				expect(saisieTableau(ex, saisies, virgule), nom).toBe(attendueTableau(ex));
			}
		}
		expect(virgules, 'le mode virgule est bien atteint').toBeGreaterThan(0);
	});

	it('mode virgule : un cran à gauche ou à droite, ou pas de virgule → virgule fausse, chiffres toujours justes', () => {
		for (const t of TIRAGES.filter((x) => x.mode === 'virgule')) {
			for (const ex of tirer(t, 150)) {
				const saisies = remplies(ex);
				const bonne = caseApresUniteDemandee(ex);
				const nom = `${t.id} « ${ex.question} »`;
				for (const fausse of [bonne - 1, bonne + 1, null]) {
					if (fausse !== null && (fausse < 0 || fausse >= saisies.length - 1)) continue;
					const r = jugerTableau(ex, saisies, fausse);
					expect(r.virguleOk, `${nom} : virgule en ${fausse} jugée juste`).toBe(false);
					expect(r.chiffresOk, `${nom} : une virgule fausse a rendu les chiffres faux`).toBe(true);
				}
			}
		}
	});

	it('attendue : jamais un nombre de 5 chiffres ou plus sans séparateur de milliers', () => {
		let groupes = 0;
		for (const t of TIRAGES) {
			for (const ex of tirer(t, 150)) {
				const a = attendueTableau(ex);
				expect(a, `« ${ex.question} » → ${a}`).not.toMatch(/\d{5}/);
				if (a.includes(U202F)) groupes++;
			}
		}
		// Sans au moins un grand nombre tiré, le test ne garderait rien.
		expect(groupes).toBeGreaterThan(0);
	});
});
