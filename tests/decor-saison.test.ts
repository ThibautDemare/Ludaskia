/* ============================================================
   #785 — Décor de Noël : QUAND il s'affiche (critère 10) et les bornes de ses
   flocons (critère 12). Logique pure ; le rendu (« visibles à la fois » réellement à
   l'écran, animation figée) relève de la spec Playwright.

   Attendus dérivés des critères de l'issue, pas de l'implémentation :
   - critère 10 : décor du 1er au 31 décembre, selon la date LOCALE de l'appareil ;
   - critère 12 : entre 6 et 10 flocons, chacun met au moins 15 s à traverser sa zone ;
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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLOCONS, saisonDu } from '../src/core/decor-saison';

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

describe('FLOCONS — critère 12', () => {
	it('critère 12 : entre 6 et 10 flocons', () => {
		expect(FLOCONS.length).toBeGreaterThanOrEqual(6);
		expect(FLOCONS.length).toBeLessThanOrEqual(10);
	});

	it('critère 12 : chaque flocon met au moins 15 s à traverser sa zone', () => {
		expect(FLOCONS.length).toBeGreaterThanOrEqual(6); // plancher : une liste vide passerait à vide
		for (const f of FLOCONS) {
			expect(Number.isFinite(f.duree), JSON.stringify(f)).toBe(true);
			expect(f.duree, JSON.stringify(f)).toBeGreaterThanOrEqual(15);
		}
	});

	it('critère 12 : chaque flocon est dessinable (position dans la bande, taille et opacité visibles, forme connue)', () => {
		expect(FLOCONS.length).toBeGreaterThanOrEqual(6);
		for (const f of FLOCONS) {
			const quoi = JSON.stringify(f);
			// Hors de [0, 100] %, le flocon tombe hors de la bande : il ne compte plus parmi
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
			expect(['point', 'cristal'], quoi).toContain(f.forme);
			expect(Number.isFinite(f.derive), quoi).toBe(true);
			expect(Number.isFinite(f.rotation), quoi).toBe(true);
		}
	});

	it('les flocons ne partent pas tous du même point du cycle (phases non toutes égales)', () => {
		expect(FLOCONS.length).toBeGreaterThanOrEqual(6);
		expect(new Set(FLOCONS.map((f) => f.phase)).size).toBeGreaterThan(1);
	});
});
