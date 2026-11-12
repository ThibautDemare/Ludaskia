/* ============================================================
   #785 — Décor de Noël : QUAND il s'affiche (critère 10) et les bornes de ses
   flocons (critère 12). Logique pure ; le rendu (« visibles à la fois » réellement à
   l'écran, animation figée) relève de la spec Playwright.

   Attendus dérivés des critères de l'issue, pas de l'implémentation :
   - critère 10 : décor du 1er au 31 décembre, selon la date LOCALE de l'appareil ;
   - critère 12 (rédaction du 11/11/2026, commentaire daté sur #785) : au moins 6 flocons ;
     au plus 11 hors du plan lointain ; au plus 5 lointains, chacun de 13 px au plus et
     d'au moins 40 s par traversée ; chaque flocon, au moins 15 s par traversée ;
   - dessin (même commentaire, « hors critère ») : un cristal unique par flocon, graine
     fixe, symétrie d'ordre 6 (une branche tournée six fois), dessin simple au lointain ;
   - critère 33 : aucun test ne dépend de la date du jour (horloge figée partout).

   Fuseaux : une confusion heure locale / UTC ne se voit QUE si l'appareil n'est pas en
   UTC — or la CI l'est. Les cas de bord sont donc rejoués sous deux fuseaux de signes
   opposés, qui couvrent les deux sens de l'erreur :
   - Europe/Paris (UTC+1 en hiver) : le 1er janvier à 0 h 05 local est encore le
     31 décembre en UTC, le 1er décembre à 0 h 00 local est encore le 30 novembre ;
   - America/New_York (UTC-5) : le 31 décembre à 23 h 59 local est déjà le 1er janvier
     en UTC, le 30 novembre à 23 h 59 local est déjà le 1er décembre.
   Node relit `process.env.TZ` à chaque affectation dans le fil principal (pool `forks`,
   celui de Vitest par défaut). Sous le pool `threads`, l'affectation est sans effet : le
   garde de `beforeAll` le signale au lieu de laisser des cas qui ne discriminent rien.
   ============================================================ */
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	brancheCristal,
	FLOCONS,
	RAYON_CRISTAL,
	saisonDu,
	type FloconSpec,
	type PlanFlocon,
} from '../src/core/decor-saison';
import { sansCommentairesScss } from './aide-scss';

// Fuseau résolu au chargement : c'est lui qu'on remet en place (supprimer `TZ` ne
// rétablit pas le fuseau sous Node, il faut le réaffecter).
const FUSEAU_ORIGINE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/* Décalage attendu (minutes, au sens de `getTimezoneOffset`) le 1er décembre 2026 :
   sert à vérifier que le fuseau a bien été appliqué avant de jouer les cas. */
const FUSEAUX: readonly { tz: string; decalageDecembre: number }[] = [
	{ tz: 'Europe/Paris', decalageDecembre: -60 },
	{ tz: 'America/New_York', decalageDecembre: 300 },
];

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	// Juillet, loin de décembre : un test qui lirait l'horloge au lieu de la date reçue
	// ne trouverait pas Noël par hasard.
	vi.setSystemTime(new Date(2026, 6, 14, 10, 0));
});
afterEach(() => {
	vi.useRealTimers();
});

describe.each(FUSEAUX)('saisonDu — critère 10, fuseau $tz', ({ tz, decalageDecembre }) => {
	beforeAll(() => {
		process.env.TZ = tz;
		const obtenu = new Date(2026, 11, 1, 0, 0).getTimezoneOffset();
		if (obtenu !== decalageDecembre)
			throw new Error(
				`fuseau ${tz} non appliqué (décalage ${obtenu} au lieu de ${decalageDecembre}) : ` +
					'lancer Vitest avec le pool forks, sinon ces cas ne discriminent pas heure locale / UTC',
			);
	});
	afterAll(() => {
		process.env.TZ = FUSEAU_ORIGINE;
	});

	it('critère 10 : décor le 15 décembre', () => {
		expect(saisonDu(new Date(2026, 11, 15, 12, 0))).toBe('noel');
	});

	it('critère 10 : premier instant du 1er décembre (0 h 00 local) = décor', () => {
		expect(saisonDu(new Date(2026, 11, 1, 0, 0))).toBe('noel');
	});

	it('critère 10 : dernière minute du 31 décembre (23 h 59 local) = décor', () => {
		expect(saisonDu(new Date(2026, 11, 31, 23, 59))).toBe('noel');
	});

	it('critère 10 : 30 novembre à 23 h 59 local = pas de décor', () => {
		expect(saisonDu(new Date(2026, 10, 30, 23, 59))).toBeNull();
	});

	it('critère 10 : 1er janvier à 0 h 00 local = pas de décor', () => {
		expect(saisonDu(new Date(2027, 0, 1, 0, 0))).toBeNull();
	});

	it("critère 10 : sur toute l'année (bissextile comprise), décor exactement les 31 jours de décembre", () => {
		for (const annee of [2026, 2028]) {
			const joursNoel: string[] = [];
			// Chaque jour, au premier et au dernier instant local : les deux bords de la journée.
			for (let d = new Date(annee, 0, 1); d.getFullYear() === annee; d.setDate(d.getDate() + 1)) {
				for (const [h, m] of [
					[0, 0],
					[23, 59],
				]) {
					const instant = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
					const s = saisonDu(instant);
					if (instant.getMonth() === 11) expect(s, instant.toString()).toBe('noel');
					else expect(s, instant.toString()).toBeNull();
					if (s === 'noel') joursNoel.push(`${instant.getMonth() + 1}-${instant.getDate()}`);
				}
			}
			expect(new Set(joursNoel).size).toBe(31);
		}
	});
});

/* Critère 12, borne par borne. Chaque contrôle rend les écarts (vide si la borne tient) :
   le même contrôle sert au décor réel ET aux listes fabriquées plus bas, qui prouvent
   qu'il sait échouer, au bord exact de chaque borne. Les comparaisons sont écrites en
   négatif (`!(x <= 13)`) pour qu'une valeur NaN soit un écart, pas un passe-droit.
   « Visibles à la fois » se joue à l'écran (spec Playwright) : la liste entière majore
   ici ce qui peut l'être à un instant donné. */
type Borne = (flocons: readonly FloconSpec[]) => string[];
const PLANS: readonly PlanFlocon[] = ['loin', 'milieu', 'devant', 'premier-plan'];
const decrit = (f: FloconSpec): string => JSON.stringify(f);
const combien = (fl: readonly FloconSpec[], lointains: boolean): number =>
	fl.filter((f) => (f.plan === 'loin') === lointains).length;

const BORNES_12: Record<string, Borne> = {
	'au moins 6 flocons en tout': (fl) => (fl.length >= 6 ? [] : [`${fl.length} flocons`]),
	'au plus 11 flocons hors du plan lointain': (fl) =>
		combien(fl, false) <= 11 ? [] : [`${combien(fl, false)} flocons hors du plan lointain`],
	'au plus 5 flocons lointains': (fl) =>
		combien(fl, true) <= 5 ? [] : [`${combien(fl, true)} flocons lointains`],
	'chaque lointain fait 13 px au plus': (fl) =>
		fl.filter((f) => f.plan === 'loin' && !(f.taille <= 13)).map(decrit),
	'chaque lointain met au moins 40 s à traverser': (fl) =>
		fl.filter((f) => f.plan === 'loin' && !(f.duree >= 40)).map(decrit),
	'chaque flocon met au moins 15 s à traverser': (fl) =>
		fl.filter((f) => !(f.duree >= 15)).map(decrit),
};

/** Flocon fabriqué, pour éprouver les contrôles : seuls le plan, la taille et la durée
 *  comptent pour le critère 12. */
const fabrique = (plan: PlanFlocon, taille: number, duree: number, nombre = 1): FloconSpec[] =>
	Array.from({ length: nombre }, () => ({
		x: 50,
		taille,
		duree,
		phase: 0,
		plan,
		graine: 1,
		opacite: 1,
		derive: 0,
		rotation: 0,
	}));

describe('FLOCONS — critère 12 (rédaction du 11/11/2026)', () => {
	it.each(Object.entries(BORNES_12))('critère 12 : %s', (_nom, borne) => {
		expect(FLOCONS.length, 'FLOCONS vide : les bornes passeraient à vide').toBeGreaterThan(0);
		expect(borne(FLOCONS)).toEqual([]);
	});

	/* Preuve que chaque contrôle peut échouer, au bord exact : la valeur limite tient, le
	   cran au-delà rompt. Indépendant du décor réel, qui peut s'éloigner des bornes. */
	const N6 = 'au moins 6 flocons en tout';
	const N11 = 'au plus 11 flocons hors du plan lointain';
	const N5 = 'au plus 5 flocons lointains';
	const T13 = 'chaque lointain fait 13 px au plus';
	const D40 = 'chaque lointain met au moins 40 s à traverser';
	const D15 = 'chaque flocon met au moins 15 s à traverser';
	it.each<[string, string, boolean, FloconSpec[]]>([
		[N6, '6 flocons', true, fabrique('milieu', 30, 30, 6)],
		[N6, '5 flocons', false, fabrique('milieu', 30, 30, 5)],
		[
			N11,
			'11 devant et 5 lointains',
			true,
			[...fabrique('devant', 45, 20, 11), ...fabrique('loin', 10, 45, 5)],
		],
		[
			N11,
			'6 au milieu, 4 devant et 2 au premier plan',
			false,
			[
				...fabrique('milieu', 30, 30, 6),
				...fabrique('devant', 45, 20, 4),
				...fabrique('premier-plan', 68, 16, 2),
			],
		],
		[N5, '5 lointains', true, fabrique('loin', 10, 45, 5)],
		[N5, '6 lointains', false, fabrique('loin', 10, 45, 6)],
		[T13, 'un lointain de 13 px', true, fabrique('loin', 13, 45)],
		[T13, 'un lointain de 13,5 px', false, fabrique('loin', 13.5, 45)],
		[T13, 'un flocon du milieu de 30 px', true, fabrique('milieu', 30, 30)],
		[D40, 'un lointain en 40 s', true, fabrique('loin', 10, 40)],
		[D40, 'un lointain en 39,5 s', false, fabrique('loin', 10, 39.5)],
		[D40, 'un flocon devant en 20 s', true, fabrique('devant', 45, 20)],
		[D15, 'un premier plan en 15 s', true, fabrique('premier-plan', 68, 15)],
		[D15, 'un premier plan en 14,5 s', false, fabrique('premier-plan', 68, 14.5)],
		[D15, 'une durée NaN', false, fabrique('milieu', 30, NaN)],
	])('le contrôle « %s » sur %s : tient = %s', (nom, _cas, tient, liste) => {
		const borne = BORNES_12[nom];
		expect(borne, `contrôle « ${nom} » inconnu`).toBeTypeOf('function');
		expect(borne(liste).length === 0).toBe(tient);
	});

	it("chaque flocon est dessinable (position dans l'écran, taille et opacité visibles, plan connu)", () => {
		expect(FLOCONS.length).toBeGreaterThanOrEqual(6);
		for (const f of FLOCONS) {
			const quoi = JSON.stringify(f);
			// Hors de [0, 100] %, le flocon tombe hors de l'écran : il ne compte plus parmi
			// les visibles.
			expect(f.x, quoi).toBeGreaterThanOrEqual(0);
			expect(f.x, quoi).toBeLessThanOrEqual(100);
			expect(f.taille, quoi).toBeGreaterThan(0);
			expect(Number.isFinite(f.taille), quoi).toBe(true);
			// Opacité nulle = flocon invisible, donc pas « visible à la fois ».
			expect(f.opacite, quoi).toBeGreaterThan(0);
			expect(f.opacite, quoi).toBeLessThanOrEqual(1);
			expect(f.phase, quoi).toBeGreaterThanOrEqual(0);
			expect(f.phase, quoi).toBeLessThanOrEqual(1);
			expect(PLANS, quoi).toContain(f.plan);
			expect(Number.isFinite(f.derive), quoi).toBe(true);
			expect(Number.isFinite(f.rotation), quoi).toBe(true);
		}
	});

	it('les flocons ne partent pas tous du même point du cycle (phases non toutes égales)', () => {
		expect(FLOCONS.length).toBeGreaterThanOrEqual(6);
		expect(new Set(FLOCONS.map((f) => f.phase)).size).toBeGreaterThan(1);
	});
});

/* ============================================================
   brancheCristal — le dessin des flocons
   Le rendu tourne la branche six fois (0, 60, …, 300°) dans une vue carrée de
   ±RAYON_CRISTAL, trait à bouts et jonctions ronds. Les contrôles lisent le tracé `d`
   eux-mêmes, au lieu de faire confiance à sa construction.
   ============================================================ */

type Point = readonly [number, number];
type Trait = readonly [Point, Point];

/** Lit un tracé `d` en points et en traits. Commandes admises : M, V, L absolues et l
 *  relative. Toute autre commande, un texte hors commande, un nombre d'arguments faux ou un
 *  tracé sans trait LÈVENT une erreur : un tracé mal compris ne doit jamais être déclaré
 *  « dans le cadre ». */
function lireTrace(d: string): { points: Point[]; traits: Trait[] } {
	const NOMBRE = /[-+]?(?:\d+\.?\d*|\.\d+)/g;
	const commandes = [...d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)];
	if (commandes.map((m) => m[0]).join('') !== d)
		throw new Error(`texte hors commande dans « ${d} »`);
	const points: Point[] = [];
	const traits: Trait[] = [];
	let courant: Point | undefined;
	const va = (p: Point, trace: boolean) => {
		if (trace) {
			if (!courant) throw new Error(`trait sans point de départ dans « ${d} »`);
			traits.push([courant, p]);
		}
		points.push(p);
		courant = p;
	};
	for (const [, lettre, brut] of commandes) {
		if (brut.replace(NOMBRE, '').replace(/[\s,]+/g, '') !== '')
			throw new Error(`arguments illisibles « ${lettre}${brut} » dans « ${d} »`);
		const n = [...brut.matchAll(NOMBRE)].map((m) => Number(m[0]));
		const paires = (): [number, number][] => {
			if (n.length === 0 || n.length % 2 !== 0)
				throw new Error(`« ${lettre} » attend des paires de nombres dans « ${d} »`);
			return Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]]);
		};
		if (lettre === 'M') paires().forEach(([x, y], i) => va([x, y], i > 0));
		else if (lettre === 'L') for (const [x, y] of paires()) va([x, y], true);
		else if (lettre === 'l')
			for (const [dx, dy] of paires()) {
				if (!courant) throw new Error(`« l » sans point de départ dans « ${d} »`);
				va([courant[0] + dx, courant[1] + dy], true);
			}
		else if (lettre === 'V') {
			if (n.length === 0) throw new Error(`« V » sans argument dans « ${d} »`);
			for (const y of n) {
				if (!courant) throw new Error(`« V » sans point de départ dans « ${d} »`);
				va([courant[0], y], true);
			}
		} else throw new Error(`commande « ${lettre} » non interprétée dans « ${d} »`);
	}
	if (traits.length === 0) throw new Error(`aucun trait dans « ${d} »`);
	return { points, traits };
}

/** Plus grand dépassement du cadre ±RAYON_CRISTAL, la branche tournée six fois et chaque
 *  point grossi d'un demi-trait ; ≤ 0 si tout tient. Les extrémités suffisent : un trait à
 *  bouts et jonctions ronds est l'enveloppe convexe des disques de ses extrémités, et le
 *  cadre est convexe. Tourner compte : un point dans le carré peut en sortir à 60°. */
function depassement(d: string, epaisseur: number): number {
	const { points } = lireTrace(d);
	let pire = -Infinity;
	for (let k = 0; k < 6; k++) {
		const a = (k * Math.PI) / 3;
		for (const [x, y] of points) {
			const xr = x * Math.cos(a) - y * Math.sin(a);
			const yr = x * Math.sin(a) + y * Math.cos(a);
			pire = Math.max(pire, Math.max(Math.abs(xr), Math.abs(yr)) + epaisseur / 2 - RAYON_CRISTAL);
		}
	}
	return pire;
}

const surAxe = (p: Point): boolean => Math.abs(p[0]) < 1e-9;
const proches = (a: number, b: number): boolean => Math.abs(a - b) <= 0.011; // arrondi au centième

/** Écart à « une seule paire de ramures » : '' si la branche n'a, hors de sa tige (les
 *  traits sur l'axe x = 0), que deux traits partis du même point de la tige, dont les
 *  pointes sont symétriques par rapport à la tige. */
function ecartPaireUnique(d: string): string {
	const { traits } = lireTrace(d);
	const tige = traits.filter(([a, b]) => surAxe(a) && surAxe(b));
	const ramures = traits.filter((t) => !tige.includes(t));
	if (tige.length === 0) return 'pas de tige';
	if (ramures.length !== 2) return `${ramures.length} traits hors de la tige, 2 attendus`;
	const ys = tige.flatMap(([a, b]) => [a[1], b[1]]);
	const [haut, bas] = [Math.min(...ys), Math.max(...ys)];
	const [[a1, p1], [a2, p2]] = ramures.map(([a, b]) => (surAxe(a) ? [a, b] : [b, a]));
	for (const attache of [a1, a2])
		if (!surAxe(attache) || attache[1] < haut - 1e-9 || attache[1] > bas + 1e-9)
			return 'une ramure ne part pas de la tige';
	if (!proches(a1[1], a2[1])) return 'les deux ramures ne partent pas du même point';
	if (!proches(p1[0], -p2[0]) || !proches(p1[1], p2[1]))
		return 'les deux ramures ne sont pas symétriques';
	return '';
}

/** Épaisseur de trait la plus forte du rendu, en unités du dessin : celle des feuilles
 *  (par plan) et l'attribut par défaut du SVG. Lue, pas recopiée (1,8 au plan lointain le
 *  11/11/2026) : un trait épaissi demain resserre le cadre ici aussi. */
const EPAISSEURS_FEUILLE = [
	...sansCommentairesScss(readFileSync('src/styles/decor-saison.scss', 'utf8')).matchAll(
		/stroke-width:\s*(\d+(?:\.\d+)?)/g,
	),
].map((m) => Number(m[1]));
const EPAISSEURS_SVG = [
	...readFileSync('src/ui/decor-saison.ts', 'utf8').matchAll(/stroke-width="(\d+(?:\.\d+)?)"/g),
].map((m) => Number(m[1]));
const EPAISSEUR = Math.max(...EPAISSEURS_FEUILLE, ...EPAISSEURS_SVG);

/** Large échantillon de graines, au-delà de celles du décor (comprises dans 0-2000), plus
 *  quelques extrêmes de l'entier 32 bits. */
const GRAINES = [...Array.from({ length: 2001 }, (_, i) => i), 123456789, 2 ** 31, 2 ** 32 - 1];

const resume = (ecarts: readonly string[]): string =>
	`${ecarts.length} écart(s), dont :\n${ecarts.slice(0, 5).join('\n')}`;

describe('brancheCristal — dessin des flocons', () => {
	it("garde contre un test à vide : épaisseurs de trait lues dans la feuille et l'attribut SVG", () => {
		expect(
			EPAISSEURS_FEUILLE.length,
			'aucun `stroke-width` lu dans decor-saison.scss',
		).toBeGreaterThan(0);
		expect(
			EPAISSEURS_SVG.length,
			'aucun `stroke-width="…"` lu dans ui/decor-saison.ts',
		).toBeGreaterThan(0);
		expect(Number.isFinite(EPAISSEUR) && EPAISSEUR > 0).toBe(true);
		expect(FLOCONS.every((f) => GRAINES.includes(f.graine))).toBe(true);
	});

	it("déterministe : même graine, même tracé, simple ou non, quel que soit l'ordre des appels", () => {
		const premiers = GRAINES.map((g) => [brancheCristal(g), brancheCristal(g, true)]);
		const ecarts: string[] = [];
		// Relu dans l'ordre inverse : un état caché entre deux appels (compteur, tirage
		// partagé) donnerait un autre tracé.
		for (let i = GRAINES.length - 1; i >= 0; i--) {
			const g = GRAINES[i];
			if (brancheCristal(g) !== premiers[i][0]) ecarts.push(`graine ${g}`);
			if (brancheCristal(g, true) !== premiers[i][1]) ecarts.push(`graine ${g} (simple)`);
		}
		expect(ecarts, resume(ecarts)).toEqual([]);
	});

	it("unique : les flocons du décor ont tous un tracé différent (simple au lointain, comme à l'écran)", () => {
		expect(FLOCONS.length).toBeGreaterThanOrEqual(6);
		const parTrace = new Map<string, number[]>();
		for (const f of FLOCONS) {
			const d = brancheCristal(f.graine, f.plan === 'loin');
			parTrace.set(d, [...(parTrace.get(d) ?? []), f.graine]);
		}
		const doublons = [...parTrace.values()].filter((graines) => graines.length > 1);
		expect(doublons, 'graines qui donnent le même dessin').toEqual([]);
	});

	it('cadré : tournée six fois, chaque branche reste dans ±RAYON_CRISTAL, demi-trait le plus épais compris (2 000 graines)', () => {
		const ecarts: string[] = [];
		for (const g of GRAINES)
			for (const simple of [false, true]) {
				const d = brancheCristal(g, simple); // une commande inconnue fait lever lireTrace
				const ex = depassement(d, EPAISSEUR);
				if (ex > 1e-9)
					ecarts.push(`graine ${g}${simple ? ' (simple)' : ''} : +${ex.toFixed(3)} — ${d}`);
			}
		expect(ecarts, resume(ecarts)).toEqual([]);
	});

	it("forme simple : avec `simple`, la branche n'a qu'une paire de ramures (2 000 graines)", () => {
		const ecarts = GRAINES.map((g) => {
			const d = brancheCristal(g, true);
			const e = ecartPaireUnique(d);
			return e === '' ? '' : `graine ${g} : ${e} — ${d}`;
		}).filter((e) => e !== '');
		expect(ecarts, resume(ecarts)).toEqual([]);
	});
});

/* Preuve que les contrôles ci-dessus savent échouer : des tracés fabriqués, au bord exact
   quand il y en a un. Sans eux, un lecteur de tracé trop permissif rendrait le cadrage et
   la forme simple verts quoi que dessine `brancheCristal`. */
describe('brancheCristal — les contrôles du test savent échouer', () => {
	it.each([
		['M0 0H5', 'H non admise'],
		['M0 0v-5', 'v relative non admise'],
		['m0 0V-5', 'm relative non admise'],
		['M0 0Q1 1 2 2', 'courbe non admise'],
		['V-5', 'pas de point de départ'],
		['M0 0L1', 'paire incomplète'],
		['M0 0', 'aucun trait'],
		[' M0 0V-5', 'texte hors commande'],
	])('lireTrace refuse « %s » (%s)', (d) => {
		expect(() => lireTrace(d)).toThrow();
	});

	it.each<[string, boolean]>([
		['M0 0V-11.6', true], // 11,6 + 0,9 = 12,5 : le bord tient
		['M0 0V-11.7', false],
		['M0 -11l0 -0.7', false], // l relative : la pointe est à -11,7, pas à -0,7
		['M0 0L10 -10', false], // dans le carré tel quel, hors du carré tourné de 60°
	])('cadrage à 1,8 de trait : « %s » tient = %s', (d, tient) => {
		expect(depassement(d, 1.8) <= 1e-9).toBe(tient);
	});

	it.each<[string, boolean]>([
		['M0 0V-9M0 -5l-2 -2M0 -5l2 -2', true],
		['M0 0V-9M0 -5l-2 -2M0 -5l2 -2M0 -7l-1 -1M0 -7l1 -1', false], // deux paires
		['M0 0V-9M0 -9l-1.1 -1.1M0 -9l1.1 -1.1M0 -5l-2 -2M0 -5l2 -2', false], // fourche en plus
		['M0 0V-9M0 -3L2.6 -1.5M0 -5l-2 -2M0 -5l2 -2', false], // côté d'hexagone en plus
		['M0 0V-9M0 -5l-2 -2M0 -5l2 -1', false], // pointes non symétriques
		['M0 0V-9M0 -5l-2 -2M0 -6l2 -2', false], // attaches différentes
		['M0 0V-4M0 -6l-2 -2M0 -6l2 -2', false], // ramures hors de la tige
	])('forme simple : « %s » tient = %s', (d, tient) => {
		expect(ecartPaireUnique(d) === '').toBe(tient);
	});
});
