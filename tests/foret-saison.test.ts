/* ============================================================
   #785 — La forêt du pied de page en décembre : des sapins enneigés (critères 35 à 39,
   commentaire du 12/11/2026 sur l'issue), la forêt de l'année inchangée le reste du temps
   (critère 34). Logique pure : QUEL fichier pour quelle date (`fichierForet`), et ce que le
   générateur produit (`composeForest`). Le rendu (sapins à l'écran, balancement figé, guide
   du critère 37) est joué par `e2e/decor-noel-foret.spec.ts`.

   Attendus dérivés des critères, pas du générateur :
   - critère 35 : du 1er au 31 décembre, à l'heure LOCALE, forêt de sapins enneigés ; sinon
     la forêt habituelle. Jugé sur le CONTENU du fichier que désigne `fichierForet`, pas sur
     son nom ;
   - critère 36 : chaque sapin se balance comme un arbre habituel, donc dans un groupe
     `sway` (la classe que vise l'animation « vent » de `foret.scss`), et il y en a autant
     que d'arbres habituels ;
   - critère 38 : le fichier de décembre ne pèse pas plus lourd que celui de l'année ;
   - critère 39 : ni fruit ni étoile. Témoin : les couleurs cherchées sont bien celles des
     fruits et de l'étincelle de la forêt de l'année, qui les porte ;
   - critère 34 : les fichiers servis sont exactement la sortie du générateur, avec les
     paramètres de `npm run forest:gen` (lus dans package.json, pas recopiés). Un fichier
     régénéré sans être commité, ou un générateur modifié sans régénérer, fait échouer.
   - critère 33 : aucun test ne lit la date du jour (horloge figée en juillet).
   ============================================================ */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fichierForet } from '../src/core/decor-saison';
import { composeForest } from '../tools/forest/generate-forest.mjs';

/* ============================================================
   Contrôles : partagés par le vrai décor et par les cas fabriqués du bas du fichier, qui
   prouvent qu'ils savent échouer.
   ============================================================ */

/** Fins de ligne normalisées, sans le saut de ligne final qu'écrit le générateur. */
const normalise = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\n+$/, '');

/** '' si identiques ; sinon le premier écart, avec un peu de contexte (un diff complet de
 *  400 Ko serait illisible). */
function premierEcart(attendu: string, obtenu: string): string {
	if (attendu === obtenu) return '';
	let i = 0;
	while (i < attendu.length && i < obtenu.length && attendu[i] === obtenu[i]) i++;
	const autour = (s: string): string => JSON.stringify(s.slice(Math.max(0, i - 30), i + 30));
	return (
		`premier écart au caractère ${i} (longueurs ${attendu.length} / ${obtenu.length}) : ` +
		`attendu ${autour(attendu)}, obtenu ${autour(obtenu)}`
	);
}

/** Classes de la balise RACINE. Un document qui ne commence pas par `<svg` lève. */
function classesRacine(svg: string): string[] {
	const racine = /^\s*<svg\b[^>]*>/.exec(svg);
	if (!racine) throw new Error(`pas de balise <svg> en tête : ${svg.slice(0, 40)}`);
	const attribut = /\sclass="([^"]*)"/.exec(racine[0]);
	return attribut ? attribut[1].split(/\s+/).filter((c) => c !== '') : [];
}

/** Contenu de chaque `<g>` dont la classe compte `sway`, jusqu'à SA balise fermante : un
 *  sapin contient lui-même des `<g>`, s'arrêter au premier `</g>` couperait l'arbre. */
function groupesSway(svg: string): string[] {
	const groupes: string[] = [];
	const ouverture = /<g\b[^>]*>/g;
	for (let o = ouverture.exec(svg); o; o = ouverture.exec(svg)) {
		const classe = /\sclass="([^"]*)"/.exec(o[0]);
		if (!classe || !classe[1].split(/\s+/).includes('sway')) continue;
		if (o[0].endsWith('/>')) {
			groupes.push('');
			continue;
		}
		const debut = o.index + o[0].length;
		const balise = /<g\b[^>]*>|<\/g\s*>/g;
		balise.lastIndex = debut;
		let profondeur = 1;
		let fin = -1;
		for (let b = balise.exec(svg); b; b = balise.exec(svg)) {
			if (b[0].startsWith('</')) profondeur--;
			else if (!b[0].endsWith('/>')) profondeur++;
			if (profondeur === 0) {
				fin = b.index;
				break;
			}
		}
		if (fin < 0) throw new Error(`groupe sway non refermé (caractère ${o.index})`);
		groupes.push(svg.slice(debut, fin));
	}
	return groupes;
}

type Rvb = readonly [number, number, number];

/** Couleur d'un `fill` : `#rgb`, `#rrggbb` ou `hsl(t s% l%)`. Autre chose (`url(…)`,
 *  `none`) : `null`. */
function couleur(valeur: string): Rvb | null {
	const v = valeur.trim().toLowerCase();
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
	if (hex) {
		const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
		const canal = (k: number): number => parseInt(h.slice(k, k + 2), 16);
		return [canal(0), canal(2), canal(4)];
	}
	const hsl = /^hsl\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/.exec(v);
	if (hsl) {
		const [t, s, l] = [Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100];
		const a = s * Math.min(l, 1 - l);
		const canal = (n: number): number => {
			const k = (n + t / 30) % 12;
			return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
		};
		return [canal(0), canal(8), canal(4)];
	}
	return null;
}

/** Neige : un remplissage blanc à peine teinté, chaque canal à 224 (0xE0) au moins. */
const SEUIL_NEIGE = 224;
const porteDeLaNeige = (fragment: string): boolean =>
	[...fragment.matchAll(/\sfill="([^"]*)"/g)].some((m) => {
		const c = couleur(m[1]);
		return c !== null && Math.min(...c) >= SEUIL_NEIGE;
	});

/** Couleurs des fruits et de l'étincelle (étoile) de la forêt de l'année. */
const COULEURS_FRUITS = ['#d8392b', '#e2632a', '#e8a21d', '#e0b020', '#8a5bc0'] as const;
const ETINCELLE = '#ffe9a0';
const decorations = (svg: string): string[] => {
	const bas = svg.toLowerCase();
	return [...COULEURS_FRUITS, ETINCELLE].filter((c) => bas.includes(c));
};

/** Écarts à « forêt de sapins enneigés » (critères 35, 36, 39) ; vide si c'en est une. */
function ecartsSapins(svg: string): string[] {
	const ecarts: string[] = [];
	if (!classesRacine(svg).includes('foret-noel')) ecarts.push('racine sans la classe foret-noel');
	const arbres = groupesSway(svg);
	if (arbres.length === 0) ecarts.push('aucun arbre qui se balance');
	arbres.forEach((a, i) => {
		if (!porteDeLaNeige(a)) ecarts.push(`arbre ${i + 1} sans neige`);
	});
	for (const c of decorations(svg)) ecarts.push(`décoration ${c}`);
	return ecarts;
}

/** Poids en octets (UTF-8), fins de ligne normalisées. */
const octets = (s: string): number => new TextEncoder().encode(normalise(s)).length;
const pasPlusLourd = (noel: string, annee: string): boolean => octets(noel) <= octets(annee);

/* ============================================================
   Paramètres réels : ceux de `npm run forest:gen`, lus dans package.json.
   ============================================================ */

interface Generation {
	graine: number;
	arbres: number;
	fichier: string;
	saison: string | undefined;
}

const paquet: { scripts: Record<string, string | undefined> } = JSON.parse(
	readFileSync('package.json', 'utf8'),
);
const GENERATIONS: Generation[] = [
	...(paquet.scripts['forest:gen'] ?? '').matchAll(
		/node tools\/forest\/generate-forest\.mjs (\d+) (\d+) (\S+)(?: (\w+))?/g,
	),
].map((m) => ({ graine: Number(m[1]), arbres: Number(m[2]), fichier: m[3], saison: m[4] }));

function generation(saison: 'noel' | undefined): Generation {
	const g = GENERATIONS.find((x) => x.saison === saison);
	if (!g) throw new Error(`forest:gen ne produit pas la forêt ${saison ?? "de l'année"}`);
	return g;
}
const genere = (g: Generation): string => normalise(composeForest(g.graine, g.arbres, g.saison));
const lirePublic = (nom: string): string => normalise(readFileSync(`public/${nom}`, 'utf8'));
const lireFichier = (chemin: string): string => normalise(readFileSync(chemin, 'utf8'));

/** Nombre d'arbres de la forêt habituelle (critère 36 : « comme les arbres habituels »). */
const ARBRES = 14;

describe('forest:gen — les paramètres réels du générateur', () => {
	it('garde contre un test à vide : deux générations lues, la forêt de l’année et celle de Noël', () => {
		expect(GENERATIONS.length, paquet.scripts['forest:gen']).toBe(2);
		expect(GENERATIONS.filter((g) => g.saison === undefined)).toHaveLength(1);
		expect(GENERATIONS.filter((g) => g.saison === 'noel')).toHaveLength(1);
		for (const g of GENERATIONS) {
			expect(Number.isInteger(g.graine), JSON.stringify(g)).toBe(true);
			expect(g.fichier, JSON.stringify(g)).toMatch(/^public\/[\w-]+\.svg$/);
		}
	});
});

/* ============================================================
   fichierForet — critère 35 : QUELLE forêt pour quelle date.
   Rejoué sous deux fuseaux de signes opposés (même raison que `decor-saison.test.ts`) :
   une confusion heure locale / UTC ne se voit que hors UTC, et la CI est en UTC.
   ============================================================ */

const FUSEAU_ORIGINE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const FUSEAUX: readonly { tz: string; decalageDecembre: number }[] = [
	{ tz: 'Europe/Paris', decalageDecembre: -60 },
	{ tz: 'America/New_York', decalageDecembre: 300 },
];

/** Dates construites à l'heure LOCALE, au moment où le fuseau est en place. */
const EN_DECEMBRE: readonly [string, () => Date][] = [
	['1er décembre à 0 h 00', () => new Date(2026, 11, 1, 0, 0)],
	['15 décembre à midi', () => new Date(2026, 11, 15, 12, 0)],
	['31 décembre à 23 h 59', () => new Date(2026, 11, 31, 23, 59)],
];
const HORS_DECEMBRE: readonly [string, () => Date][] = [
	['30 novembre à 23 h 59', () => new Date(2026, 10, 30, 23, 59)],
	['1er janvier à 0 h 00', () => new Date(2027, 0, 1, 0, 0)],
	['14 juillet à 10 h 00', () => new Date(2026, 6, 14, 10, 0)],
];

describe.each(FUSEAUX)('fichierForet — critère 35, fuseau $tz', ({ tz, decalageDecembre }) => {
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
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		// Juillet, loin de décembre : un code qui lirait l'horloge au lieu de la date reçue
		// ne trouverait pas Noël par hasard.
		vi.setSystemTime(new Date(2026, 6, 14, 10, 0));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it.each(EN_DECEMBRE)('critère 35 : le %s, la forêt servie est celle des sapins', (_q, date) => {
		const nom = fichierForet(date());
		const svg = lirePublic(nom);
		expect(premierEcart(genere(generation('noel')), svg), nom).toBe('');
		expect(ecartsSapins(svg), nom).toEqual([]);
	});

	it.each(HORS_DECEMBRE)(
		'critère 35 : le %s, la forêt servie est la forêt habituelle',
		(_q, date) => {
			const nom = fichierForet(date());
			expect(premierEcart(genere(generation(undefined)), lirePublic(nom)), nom).toBe('');
		},
	);
});

/* ============================================================
   composeForest — la forêt de Noël, avec les paramètres réels.
   ============================================================ */

describe('composeForest — forêt de Noël (paramètres de forest:gen)', () => {
	const NOEL = generation('noel');
	const ANNEE = generation(undefined);
	const svgNoel = genere(NOEL);
	const svgAnnee = genere(ANNEE);

	it('déterministe : même chaîne d’un appel à l’autre, à la suite ou la forêt de l’année générée entre les deux', () => {
		const noel = (): string => composeForest(NOEL.graine, NOEL.arbres, NOEL.saison);
		const premier = noel();
		expect(premierEcart(premier, noel()), 'deux appels à la suite').toBe('');
		composeForest(ANNEE.graine, ANNEE.arbres);
		expect(premierEcart(premier, noel()), 'après la forêt de l’année').toBe('');
	});

	it('critère 35 : la racine porte la classe foret-noel ; la forêt de l’année ne la porte pas', () => {
		expect(classesRacine(svgNoel)).toContain('foret-noel');
		expect(classesRacine(svgAnnee)).not.toContain('foret-noel');
	});

	it('critère 36 : 14 sapins, chacun dans un groupe sway, autant que d’arbres habituels', () => {
		expect(groupesSway(svgAnnee)).toHaveLength(ARBRES);
		expect(groupesSway(svgNoel)).toHaveLength(ARBRES);
	});

	it('critère 35 : chaque sapin porte de la neige (témoin : des arbres de l’année n’en portent pas)', () => {
		const sansNeige = groupesSway(svgNoel)
			.map((a, i) => (porteDeLaNeige(a) ? '' : `sapin ${i + 1}`))
			.filter((e) => e !== '');
		expect(sansNeige).toEqual([]);
		expect(groupesSway(svgAnnee).some((a) => !porteDeLaNeige(a))).toBe(true);
	});

	it('critère 39 : ni fruit ni étoile (témoin : la forêt de l’année les porte)', () => {
		expect(decorations(svgNoel)).toEqual([]);
		expect(decorations(svgAnnee).length).toBeGreaterThan(0);
		expect(decorations(svgAnnee)).toContain(ETINCELLE);
	});

	it('critère 38 : le fichier de décembre ne pèse pas plus lourd que celui de l’année', () => {
		const noel = lireFichier(NOEL.fichier);
		const annee = lireFichier(ANNEE.fichier);
		expect(
			pasPlusLourd(noel, annee),
			`${NOEL.fichier} : ${octets(noel)} octets ; ${ANNEE.fichier} : ${octets(annee)} octets`,
		).toBe(true);
	});

	it.each(GENERATIONS.map((g) => [g.fichier, g] as const))(
		'critère 34 : %s est exactement la sortie du générateur (sinon : npm run forest:gen)',
		(_f, g) => {
			expect(premierEcart(genere(g), lireFichier(g.fichier))).toBe('');
		},
	);
});

/* ============================================================
   composeForest — une saison mal écrite ne donne pas, sans bruit, la forêt de l'année.
   ============================================================ */

describe('composeForest — saison inconnue', () => {
	it.each(['noël', 'Noel', 'NOEL'])('« %s » lève une erreur', (saison) => {
		expect(() => composeForest(15, ARBRES, saison)).toThrow();
	});

	it('sans saison, ou `undefined` explicite : la forêt de l’année, sans erreur', () => {
		const annee = composeForest(15, ARBRES);
		expect(premierEcart(annee, composeForest(15, ARBRES, undefined))).toBe('');
		expect(classesRacine(annee)).not.toContain('foret-noel');
	});
});

/* ============================================================
   La ligne de commande (`npm run forest:gen`) s'exécute vraiment. Sa garde « lancé, pas
   importé » compare l'URL du module au chemin du script : si elle se trompait, le script
   sortirait sans rien écrire et sans erreur. On le lance donc pour de vrai, comme
   `forest:gen` (chemin relatif depuis la racine du dépôt), vers un dossier temporaire du
   système, nettoyé après chaque test.
   ============================================================ */

describe('generate-forest.mjs — la ligne de commande', () => {
	const SCRIPT = 'tools/forest/generate-forest.mjs';
	let dossier = '';
	beforeEach(() => {
		dossier = mkdtempSync(join(tmpdir(), 'ludaskia-foret-'));
	});
	afterEach(() => {
		if (dossier !== '') rmSync(dossier, { recursive: true, force: true });
		dossier = '';
	});

	it('écrit la forêt de Noël demandée, identique à composeForest', () => {
		const NOEL = generation('noel');
		const sortie = join(dossier, 'foret-noel.svg');
		execFileSync(
			process.execPath,
			[SCRIPT, String(NOEL.graine), String(NOEL.arbres), sortie, 'noel'],
			{ stdio: 'pipe' },
		);
		expect(existsSync(sortie), `${sortie} non écrit`).toBe(true);
		const svg = readFileSync(sortie, 'utf8');
		expect(svg.startsWith('<svg class="foret-svg foret-noel"'), svg.slice(0, 60)).toBe(true);
		expect(
			premierEcart(normalise(composeForest(NOEL.graine, NOEL.arbres, 'noel')), normalise(svg)),
		).toBe('');
	});

	it.each(['noël', 'Noel'])('saison « %s » : sortie en erreur, aucun fichier écrit', (saison) => {
		const sortie = join(dossier, 'foret.svg');
		const r = spawnSync(process.execPath, [SCRIPT, '15', String(ARBRES), sortie, saison], {
			encoding: 'utf8',
		});
		expect(r.status, r.stderr).not.toBe(0);
		expect(r.status, 'processus tué sans code de sortie').not.toBeNull();
		expect(existsSync(sortie)).toBe(false);
	});
});

/* ============================================================
   composeForest — au-delà de la graine réelle : graines 1 à 30.
   ============================================================ */

describe('composeForest — graines 1 à 30', () => {
	const GRAINES = Array.from({ length: 30 }, (_, i) => i + 1);

	// Relu en ordre inverse, l'année AVANT Noël : un état caché qui avancerait à chaque appel
	// (même à pas pair) ne retomberait pas sur la même chaîne.
	it('déterministe : même graine, même forêt, Noël et année entrelacés puis relus en ordre inverse', () => {
		const premiers = GRAINES.map((g) => [
			composeForest(g, ARBRES, 'noel'),
			composeForest(g, ARBRES),
		]);
		const ecarts: string[] = [];
		for (let i = GRAINES.length - 1; i >= 0; i--) {
			const g = GRAINES[i];
			if (composeForest(g, ARBRES) !== premiers[i][1]) ecarts.push(`graine ${g} (année)`);
			if (composeForest(g, ARBRES, 'noel') !== premiers[i][0]) ecarts.push(`graine ${g} (Noël)`);
		}
		expect(ecarts).toEqual([]);
	});

	it('critères 35, 36 et 39 : chaque forêt de Noël est faite de 14 sapins enneigés, sans fruit ni étoile', () => {
		const ecarts = GRAINES.flatMap((g) => {
			const svg = composeForest(g, ARBRES, 'noel');
			const n = groupesSway(svg).length;
			return [...(n === ARBRES ? [] : [`${n} arbres qui se balancent`]), ...ecartsSapins(svg)].map(
				(e) => `graine ${g} : ${e}`,
			);
		});
		expect(ecarts).toEqual([]);
	});

	it('témoin du critère 39 : chaque couleur cherchée apparaît dans la forêt de l’année d’au moins une graine', () => {
		const vues = new Set(GRAINES.flatMap((g) => decorations(composeForest(g, ARBRES))));
		expect([...vues].sort()).toEqual([...COULEURS_FRUITS, ETINCELLE].sort());
	});
});

/* ============================================================
   Les contrôles savent échouer : des SVG fabriqués, au bord quand il y en a un. Sans eux,
   un lecteur trop permissif rendrait les tests ci-dessus verts quoi que produise le
   générateur.
   ============================================================ */

describe('les contrôles du test savent échouer', () => {
	const sapin =
		'<g class="sway"><g><circle fill="hsl(150 35% 40%)"/></g><circle fill="#f4f8fb"/></g>';
	const foret = (classes: string, arbres: string): string =>
		`<svg class="${classes}" viewBox="0 0 10 10">${arbres}</svg>`;

	it.each<[string, string, boolean]>([
		['forêt de sapins minimale', foret('foret-svg foret-noel', sapin), true],
		['racine sans foret-noel', foret('foret-svg', sapin), false],
		[
			'foret-noel sur un enfant, pas sur la racine',
			foret('foret-svg', `<g class="foret-noel">${sapin}</g>`),
			false,
		],
		['classe voisine foret-noel-x', foret('foret-svg foret-noel-x', sapin), false],
		['un fruit #d8392b', foret('foret-noel', `${sapin}<circle fill="#d8392b"/>`), false],
		[
			'un fruit en majuscules #8A5BC0',
			foret('foret-noel', `${sapin}<circle fill="#8A5BC0"/>`),
			false,
		],
		['une étincelle #ffe9a0', foret('foret-noel', `${sapin}<path fill="#ffe9a0"/>`), false],
		[
			'un sapin sans neige, de la neige hors des sapins',
			foret('foret-noel', `${sapin}<g class="sway"><circle fill="#2a5"/></g><circle fill="#fff"/>`),
			false,
		],
		['aucun arbre', foret('foret-noel', '<circle fill="#fff"/>'), false],
	])('ecartsSapins sur « %s » : forêt de sapins = %s', (_cas, svg, tient) => {
		expect(ecartsSapins(svg).length === 0).toBe(tient);
	});

	it('classesRacine lève si le document ne commence pas par <svg', () => {
		expect(() =>
			classesRacine('<g class="foret-noel"><svg class="foret-noel"></svg></g>'),
		).toThrow();
	});

	it('groupesSway va jusqu’à la balise fermante du groupe, pas au premier </g>', () => {
		// Neige APRÈS un <g> imbriqué : un lecteur qui s'arrête au premier </g> la perdrait.
		expect(groupesSway(sapin)).toHaveLength(1);
		expect(porteDeLaNeige(groupesSway(sapin)[0])).toBe(true);
		expect(groupesSway(`${sapin}<g class="sway x"></g><g class="swaying"></g>`)).toHaveLength(2);
		expect(() => groupesSway('<g class="sway"><g></g>')).toThrow();
	});

	it.each<[string, boolean]>([
		['#f4f8fb', true],
		['#fff', true],
		['#e0e0e0', true], // 224 sur chaque canal : le bord tient
		['#dfe0e0', false], // 223 sur un canal
		['#cdd9e6', false],
		['hsl(0 0% 95%)', true],
		['hsl(150 35% 40%)', false],
		['url(#tgs1)', false],
	])('porteDeLaNeige sur fill="%s" : %s', (fill, neige) => {
		expect(porteDeLaNeige(`<circle fill="${fill}"/>`)).toBe(neige);
	});

	it.each<[string, string, boolean]>([
		['même poids', 'abcd', true],
		['un octet de moins', 'abc', true],
		['un octet de plus', 'abcde', false],
		['même nombre de caractères, un accent en plus (2 octets)', 'abcé', false],
	])('pasPlusLourd, Noël « %s » face à « abcd » : %s', (_cas, noel, tient) => {
		expect(pasPlusLourd(noel, 'abcd')).toBe(tient);
	});

	it.each<[string, string, boolean]>([
		['identique', '<svg></svg>', true],
		['fins de ligne CRLF et saut final', '<svg></svg>\r\n', true],
		['un caractère changé', '<svg></svG>', false],
		['un caractère en plus', '<svg> </svg>', false],
	])('premierEcart face au fichier « %s » : identique = %s', (_cas, fichier, identique) => {
		expect(premierEcart(normalise('<svg></svg>\n'), normalise(fichier)) === '').toBe(identique);
	});
});
