/* ============================================================
   #306 — arithmétique PURE du précache hors-ligne (`core/pwa-cache.ts`).
   ------------------------------------------------------------
   Attendus dérivés du CADRAGE de l'issue, pas de l'implémentation :
   - le worker travaille sur des chemins absolus sous la base publiée, alors que le
     manifeste injecté au build est relatif → rebase, sans jamais fabriquer un
     chemin qu'aucune requête ne portera (`//`, `/./`) ;
   - le manifeste contient des doublons (les icônes y figurent deux fois) : les
     retirer évite de télécharger deux fois et d'annoncer plus d'entrées qu'il n'y
     a de fichiers. Un doublon, c'est le MÊME fichier, donc la même clé de cache —
     deux révisions différentes du même chemin sont deux contenus distincts ;
   - la clé de cache doit faire SURVIVRE au déploiement une entrée inchangée (sinon
     chaque mise en ligne recoûte les 850 Ko de verbes) tout en distinguant deux
     contenus servis sous un nom stable (les trois `.html`) ;
   - la partition immédiat/différé sépare la coquille (rien à afficher sans elle) des
     26 shards de verbes (gros, nombreux, inutiles tant qu'aucune dictée ne demande
     un verbe) ;
   - `manques` / `obsoletes` / `couverture` pilotent le réchauffement : ne récupérer
     que ce qui manque, purger ce qui n'est plus du build, et ne jamais annoncer une
     couverture complète qu'on ne peut pas prouver.

   Le nom du paramètre de révision est un détail d'implémentation : on éprouve donc
   les PROPRIÉTÉS de la clé (elle identifie, elle distingue, elle reste une URL
   exploitable), jamais sa forme littérale.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
	cleCache,
	couverture,
	estDiffere,
	manques,
	normaliserManifeste,
	obsoletes,
	partitionner,
	type EntreePrecache,
} from '../src/core/pwa-cache';

/* Base réelle du site publié : `new URL(registration.scope).pathname` finit toujours
   par un « / ». La forme sans « / » final est le cas défensif. */
const BASE = '/Ludaskia/';

/* Manifeste représentatif de ce que Workbox injecte : trois pages à nom STABLE
   (donc révisionnées), des assets hachés, et des shards de verbes. */
const MANIFESTE_TYPE: EntreePrecache[] = [
	{ url: 'index.html', revision: 'aaa111' },
	{ url: 'app.html', revision: 'bbb222' },
	{ url: 'guide.html', revision: 'ccc333' },
	{ url: 'assets/app-a1b2c3.js', revision: null },
	{ url: 'assets/app-d4e5f6.css', revision: null },
	{ url: 'assets/verbs-01-9f8e7d.js', revision: null },
	{ url: 'assets/verbs-02-1a2b3c.js', revision: null },
	{ url: 'pwa-192.png', revision: 'ddd444' },
];

const urls = (l: EntreePrecache[]) => l.map((e) => e.url);
const cles = (l: EntreePrecache[]) => l.map(cleCache);

describe('normaliserManifeste — rebase sur la base publiée', () => {
	it('rebase une URL relative, que la base porte ou non son « / » final', () => {
		const entree = [{ url: 'assets/app-a1b2c3.js', revision: null }];
		expect(urls(normaliserManifeste(entree, '/Ludaskia/'))).toEqual([
			'/Ludaskia/assets/app-a1b2c3.js',
		]);
		expect(urls(normaliserManifeste(entree, '/Ludaskia'))).toEqual([
			'/Ludaskia/assets/app-a1b2c3.js',
		]);
	});

	it('site publié à la racine : un seul « / », jamais « // »', () => {
		const out = normaliserManifeste(
			[
				{ url: 'index.html', revision: 'aaa111' },
				{ url: 'assets/app-a1b2c3.js', revision: null },
			],
			'/',
		);
		expect(urls(out)).toEqual(['/index.html', '/assets/app-a1b2c3.js']);
	});

	it('aucun chemin fabriqué n’est « // » ou « /./ » (une requête ne les porterait pas)', () => {
		// Formes tolérées côté manifeste : nue, « ./ », déjà absolue.
		const out = normaliserManifeste(
			[
				{ url: 'index.html', revision: 'aaa111' },
				{ url: './guide.html', revision: 'ccc333' },
				{ url: '/Ludaskia/app.html', revision: 'bbb222' },
			],
			BASE,
		);
		expect(urls(out)).toEqual([
			'/Ludaskia/index.html',
			'/Ludaskia/guide.html',
			'/Ludaskia/app.html',
		]);
		for (const u of urls(out)) {
			expect(u.includes('//')).toBe(false);
			expect(u.includes('/./')).toBe(false);
		}
	});

	it('une URL DÉJÀ absolue est laissée telle quelle, base ou pas', () => {
		const out = normaliserManifeste([{ url: '/Ludaskia/app.html', revision: 'bbb222' }], BASE);
		expect(out[0].url).toBe('/Ludaskia/app.html'); // pas de double préfixe
		expect(out[0].revision).toBe('bbb222'); // la révision survit au rebase
	});

	it('renormaliser un manifeste déjà normalisé ne change rien (idempotence)', () => {
		const une = normaliserManifeste(MANIFESTE_TYPE, BASE);
		expect(normaliserManifeste(une, BASE)).toEqual(une);
	});

	it('n’altère pas le manifeste reçu', () => {
		const copie = JSON.parse(JSON.stringify(MANIFESTE_TYPE));
		normaliserManifeste(MANIFESTE_TYPE, BASE);
		expect(MANIFESTE_TYPE).toEqual(copie);
	});
});

describe('normaliserManifeste — dédoublonnage', () => {
	it('une icône listée deux fois ne compte qu’une fois', () => {
		// Cas réel : ramassée dans `public/`, puis déclarée comme icône du manifeste web.
		const out = normaliserManifeste(
			[
				{ url: 'pwa-192.png', revision: 'ddd444' },
				{ url: 'pwa-192.png', revision: 'ddd444' },
			],
			BASE,
		);
		expect(urls(out)).toEqual(['/Ludaskia/pwa-192.png']);
	});

	it('un doublon reste un doublon sous sa forme absolue', () => {
		const out = normaliserManifeste(
			[
				{ url: 'index.html', revision: 'aaa111' },
				{ url: '/Ludaskia/index.html', revision: 'aaa111' }, // même fichier, autre écriture
			],
			BASE,
		);
		expect(out).toHaveLength(1);
	});

	it('même URL, révisions DIFFÉRENTES → deux entrées (deux contenus)', () => {
		const out = normaliserManifeste(
			[
				{ url: 'index.html', revision: 'aaa111' },
				{ url: 'index.html', revision: 'zzz999' },
			],
			BASE,
		);
		expect(out).toHaveLength(2);
		expect(new Set(cles(out)).size).toBe(2); // et elles ne se recouvrent pas en cache
	});

	it('« pas de révision » et « révision nulle » désignent le même fichier', () => {
		const out = normaliserManifeste(
			[{ url: 'assets/app-a1b2c3.js', revision: null }, { url: 'assets/app-a1b2c3.js' }],
			BASE,
		);
		expect(out).toHaveLength(1);
	});

	it('garde la première occurrence, dans l’ordre du manifeste', () => {
		const out = normaliserManifeste(
			[
				{ url: 'app.html', revision: 'bbb222' },
				{ url: 'index.html', revision: 'aaa111' },
				{ url: 'app.html', revision: 'bbb222' },
			],
			BASE,
		);
		expect(urls(out)).toEqual(['/Ludaskia/app.html', '/Ludaskia/index.html']);
	});
});

describe('cleCache — identifier sans casser le partage entre déploiements', () => {
	it('nom déjà haché : la clé EST l’URL (l’entrée survit à un déploiement)', () => {
		const e = { url: '/Ludaskia/assets/verbs-01-9f8e7d.js', revision: null };
		expect(cleCache(e)).toBe(e.url);
		// Nouveau build, fichier inchangé : même clé → rien à retélécharger.
		expect(cleCache({ url: e.url })).toBe(cleCache(e));
	});

	it('nom stable : deux contenus = deux clés, toutes deux rattachées à l’URL', () => {
		const avant = cleCache({ url: '/Ludaskia/app.html', revision: 'bbb222' });
		const apres = cleCache({ url: '/Ludaskia/app.html', revision: 'ccc333' });
		expect(avant).not.toBe(apres);
		expect(avant.startsWith('/Ludaskia/app.html')).toBe(true);
		expect(apres.startsWith('/Ludaskia/app.html')).toBe(true);
		// …et jamais confondues avec la même page servie sans révision connue.
		expect(cleCache({ url: '/Ludaskia/app.html' })).not.toBe(avant);
	});

	it('URL portant déjà un « ? » : la clé reste une URL exploitable (un seul « ? »)', () => {
		const cle = cleCache({ url: '/Ludaskia/app.html?v=2', revision: 'bbb222' });
		expect(cle.split('?')).toHaveLength(2); // sinon la clé n'est plus une URL
		expect(cle.startsWith('/Ludaskia/app.html?v=2')).toBe(true); // la requête d'origine survit
		expect(cle).not.toBe(cleCache({ url: '/Ludaskia/app.html?v=2', revision: 'zzz999' }));
	});

	it('révision vide : traitée comme absente (elle n’identifie rien)', () => {
		expect(cleCache({ url: '/Ludaskia/app.html', revision: '' })).toBe('/Ludaskia/app.html');
	});

	it('deux fichiers différents n’ont jamais la même clé', () => {
		const toutes = cles(normaliserManifeste(MANIFESTE_TYPE, BASE));
		expect(new Set(toutes).size).toBe(toutes.length);
	});
});

describe('estDiffere / partitionner — la coquille d’abord, les verbes plus tard', () => {
	it('les shards de verbes sont différés, chunk JS comme JSON', () => {
		expect(estDiffere('/Ludaskia/assets/verbs-01-9f8e7d.js')).toBe(true);
		expect(estDiffere('/Ludaskia/assets/verbs-26-0a0b0c.json')).toBe(true);
	});

	it('la coquille est immédiate (pages, bundle, CSS, police, images)', () => {
		for (const u of [
			'/Ludaskia/index.html',
			'/Ludaskia/app.html',
			'/Ludaskia/guide.html',
			'/Ludaskia/assets/app-a1b2c3.js',
			'/Ludaskia/assets/app-d4e5f6.css',
			'/Ludaskia/assets/nunito-1a2b3c.woff2',
			'/Ludaskia/pwa-512.png',
		])
			expect(estDiffere(u)).toBe(false);
	});

	it('« verbs- » ailleurs que dans le NOM DE FICHIER ne diffère pas', () => {
		// Un dossier qui s'appellerait ainsi, ou un fichier qui contient le mot :
		// différer la coquille laisserait l'app sans rien à afficher hors ligne.
		expect(estDiffere('/Ludaskia/verbs-anciens/index.js')).toBe(false);
		expect(estDiffere('/Ludaskia/assets/app-verbs-01.js')).toBe(false);
	});

	it('partition exhaustive, sans perte ni doublon, ordre du manifeste conservé', () => {
		const m = normaliserManifeste(MANIFESTE_TYPE, BASE);
		const { immediat, differe } = partitionner(m);
		expect(urls(differe)).toEqual([
			'/Ludaskia/assets/verbs-01-9f8e7d.js',
			'/Ludaskia/assets/verbs-02-1a2b3c.js',
		]);
		expect(immediat.length + differe.length).toBe(m.length);
		// Chaque entrée est dans exactement une des deux listes…
		expect([...immediat, ...differe].map(cleCache).sort()).toEqual(cles(m).sort());
		// …et chaque liste garde l'ordre du manifeste (le réchauffement en prend des tranches).
		expect(urls(immediat)).toEqual(urls(m.filter((e) => !estDiffere(e.url))));
	});

	it('manifeste vide → deux listes vides (pas d’exception)', () => {
		expect(partitionner([])).toEqual({ immediat: [], differe: [] });
	});
});

describe('manques — ne récupérer que ce qui manque', () => {
	const m = normaliserManifeste(MANIFESTE_TYPE, BASE);

	it('cache vide → tout manque, dans l’ordre du manifeste', () => {
		expect(cles(manques(m, new Set()))).toEqual(cles(m));
	});

	it('cache complet → plus rien à récupérer', () => {
		expect(manques(m, new Set(cles(m)))).toEqual([]);
	});

	it('ne renvoie que les absents, sans réordonner', () => {
		const present = new Set([cleCache(m[0]), cleCache(m[3])]);
		expect(cles(manques(m, present))).toEqual(cles(m).filter((k) => !present.has(k)));
	});

	it('page en cache sous une ANCIENNE révision → toujours manquante', () => {
		// Le nouveau contenu doit être récupéré, pas considéré comme déjà là.
		const ancienne = new Set([cleCache({ url: '/Ludaskia/app.html', revision: 'perime' })]);
		const nouvelle = { url: '/Ludaskia/app.html', revision: 'bbb222' };
		expect(cles(manques([nouvelle], ancienne))).toEqual([cleCache(nouvelle)]);
	});

	it('un shard haché déjà en cache n’est PAS retéléchargé au déploiement suivant', () => {
		const shard = { url: '/Ludaskia/assets/verbs-01-9f8e7d.js', revision: null };
		expect(manques([shard], new Set([cleCache(shard)]))).toEqual([]);
	});
});

describe('obsoletes — garder le cache borné sans expiration', () => {
	const m = normaliserManifeste(MANIFESTE_TYPE, BASE);

	it('l’ancienne version d’une page est purgée, la nouvelle non', () => {
		const enCache = [
			cleCache({ url: '/Ludaskia/app.html', revision: 'perime' }),
			cleCache({ url: '/Ludaskia/app.html', revision: 'bbb222' }),
		];
		expect(obsoletes(m, enCache)).toEqual([enCache[0]]);
	});

	it('un chunk d’un déploiement précédent est purgé', () => {
		const vieux = '/Ludaskia/assets/app-000000.js';
		expect(obsoletes(m, [...cles(m), vieux])).toEqual([vieux]);
	});

	it('une entrée récupérée « à la demande », hors manifeste, tombe dans le même filet', () => {
		expect(obsoletes(m, ['/Ludaskia/assets/verbs-26-inconnu.js'])).toEqual([
			'/Ludaskia/assets/verbs-26-inconnu.js',
		]);
	});

	it('cache exactement conforme au build → rien à purger', () => {
		expect(obsoletes(m, cles(m))).toEqual([]);
	});
});

describe('couverture — ce qu’on peut promettre hors ligne', () => {
	const m = normaliserManifeste(MANIFESTE_TYPE, BASE);

	it('compte les présentes ; complet seulement quand tout y est', () => {
		expect(couverture(m, new Set())).toEqual({ present: 0, total: m.length, complet: false });
		const partiel = new Set(cles(m).slice(0, 3));
		expect(couverture(m, partiel)).toEqual({ present: 3, total: m.length, complet: false });
		expect(couverture(m, new Set(cles(m)))).toEqual({
			present: m.length,
			total: m.length,
			complet: true,
		});
	});

	it('manifeste VIDE → jamais « complet » (rien de prouvé, pas tout couvert)', () => {
		expect(couverture([], new Set())).toEqual({ present: 0, total: 0, complet: false });
		expect(couverture([], new Set(['/Ludaskia/app.html']))).toEqual({
			present: 0,
			total: 0,
			complet: false,
		});
	});

	it('des clés en trop (périmées) ne gonflent pas la couverture ni ne l’empêchent', () => {
		const avecVieux = new Set([...cles(m), '/Ludaskia/assets/app-000000.js']);
		expect(couverture(m, avecVieux)).toEqual({
			present: m.length,
			total: m.length,
			complet: true,
		});
	});

	it('une entrée présente sous une autre révision ne compte pas comme couverte', () => {
		const perimee = new Set([cleCache({ url: '/Ludaskia/app.html', revision: 'perime' })]);
		expect(couverture([{ url: '/Ludaskia/app.html', revision: 'bbb222' }], perimee)).toEqual({
			present: 0,
			total: 1,
			complet: false,
		});
	});

	it('des doublons non retirés annonceraient plus d’entrées qu’il n’y a de fichiers', () => {
		// C'est la raison d'être du dédoublonnage : deux fichiers réels, trois lignes au manifeste.
		const brut: EntreePrecache[] = [
			{ url: 'pwa-192.png', revision: 'ddd444' },
			{ url: 'pwa-192.png', revision: 'ddd444' },
			{ url: 'index.html', revision: 'aaa111' },
		];
		const propre = normaliserManifeste(brut, BASE);
		expect(couverture(propre, new Set(cles(propre)))).toEqual({
			present: 2,
			total: 2,
			complet: true,
		});
	});
});

/* Le réchauffement est une BOUCLE : à chaque période calme, il demande ce qui manque,
   le range en cache, puis se redemande où il en est. Les trois fonctions doivent donc
   parler de la même chose — si `manques` et `couverture` ne comptaient pas pareil, la
   boucle ne convergerait jamais (téléchargements répétés) ou s'arrêterait avant la
   couverture complète. Éprouvé sur des manifestes tirés au sort (doublons, révisions
   qui se croisent, formes relatives et absolues du même fichier). */
describe('invariants du réchauffement, sur manifestes tirés au sort', () => {
	const entree = fc.record({
		url: fc.constantFrom(
			'index.html',
			'app.html',
			'/Ludaskia/app.html',
			'guide.html',
			'assets/app-a1b2c3.js',
			'assets/verbs-01-9f8e7d.js',
			'assets/verbs-02-1a2b3c.js',
			'assets/nunito-1a2b3c.woff2',
			'pwa-192.png',
		),
		revision: fc.option(fc.constantFrom('aaa111', 'bbb222'), { nil: null }),
	});
	const manifeste = fc.array(entree, { maxLength: 25 });
	const dejaLa = fc.array(fc.nat({ max: 24 }), { maxLength: 25 });
	/* Bruit : une entrée périmée et une entrée récupérée à la demande traînent dans le
	   cache. Ni l'une ni l'autre ne doit être comptée comme couverte. */
	const BRUIT = ['/Ludaskia/assets/app-000000.js', '/Ludaskia/assets/verbs-99-inconnu.js'];

	it('ce qui manque plus ce qui est couvert fait toujours le manifeste', () => {
		fc.assert(
			fc.property(manifeste, dejaLa, (brut, indices) => {
				const m = normaliserManifeste(brut, BASE);
				const presentes = new Set([
					...indices.filter((i) => i < m.length).map((i) => cleCache(m[i])),
					...BRUIT,
				]);
				const { present, total, complet } = couverture(m, presentes);
				expect(manques(m, presentes).length + present).toBe(m.length);
				expect(total).toBe(m.length);
				expect(complet).toBe(m.length > 0 && manques(m, presentes).length === 0);
			}),
			{ numRuns: 300 },
		);
	});

	it('un tour qui récupère les manques atteint la couverture complète, et rien de plus', () => {
		fc.assert(
			fc.property(manifeste, dejaLa, (brut, indices) => {
				const m = normaliserManifeste(brut, BASE);
				fc.pre(m.length > 0);
				const presentes = new Set([
					...indices.filter((i) => i < m.length).map((i) => cleCache(m[i])),
					...BRUIT,
				]);
				// Le worker range en cache ce que `manques` lui a désigné…
				for (const e of manques(m, presentes)) presentes.add(cleCache(e));
				expect(couverture(m, presentes).complet).toBe(true); // …la boucle converge
				expect(manques(m, presentes)).toEqual([]); // …et ne se redemande rien
				// La purge n'emporte que le bruit, jamais ce que le build attend.
				expect(obsoletes(m, presentes).sort()).toEqual([...BRUIT].sort());
			}),
			{ numRuns: 300 },
		);
	});

	it('la partition ne perd ni ne duplique jamais une entrée', () => {
		fc.assert(
			fc.property(manifeste, (brut) => {
				const m = normaliserManifeste(brut, BASE);
				const { immediat, differe } = partitionner(m);
				expect([...immediat, ...differe].map(cleCache).sort()).toEqual(cles(m).sort());
				expect(differe.every((e) => estDiffere(e.url))).toBe(true);
				expect(immediat.every((e) => !estDiffere(e.url))).toBe(true);
			}),
			{ numRuns: 200 },
		);
	});
});
