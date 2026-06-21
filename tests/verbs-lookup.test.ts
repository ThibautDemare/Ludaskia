import { describe, it, expect } from 'vitest';
import {
	stripPronominal,
	normVerbKey,
	lookupConjugatedForms,
	estVerbe,
} from '../src/data/francais/verbs-lookup';
import manifest from '../src/data/francais/verbs/manifest.json';

describe('normalisation des clés verbe (jumelle du script de génération)', () => {
	it('stripPronominal retire « se » / « s’ » sans amputer un vrai verbe', () => {
		expect(stripPronominal('se laver')).toBe('laver');
		expect(stripPronominal("s'enfuir")).toBe('enfuir');
		expect(stripPronominal('s’enfuir')).toBe('enfuir');
		expect(stripPronominal('manger')).toBe('manger');
		expect(stripPronominal('semer')).toBe('semer'); // « se… » sans espace : intact
		expect(stripPronominal('séduire')).toBe('séduire');
	});

	it('normVerbKey : NFC + minuscules + retrait du pronominal', () => {
		expect(normVerbKey('Manger')).toBe('manger');
		expect(normVerbKey("S'ENFUIR")).toBe('enfuir');
		expect(normVerbKey('  Être ')).toBe('être');
	});
});

describe('manifeste trié (cohérence build ↔ runtime, garde-fou P1)', () => {
	it('les clés-frontières sont strictement croissantes (comparaison NFC brute)', () => {
		const m = manifest as { first: string; file: string }[];
		expect(m.length).toBeGreaterThan(1);
		for (let i = 1; i < m.length; i++) {
			expect(m[i - 1].first < m[i].first).toBe(true);
		}
	});
});

describe('lookupConjugatedForms', () => {
	it('trouve un verbe du 1er groupe (présent complet)', async () => {
		expect(await lookupConjugatedForms('manger', 'present')).toEqual([
			'mange',
			'manges',
			'mange',
			'mangeons',
			'mangez',
			'mangent',
		]);
	});

	it('trouve des verbes situés dans des shards différents', async () => {
		expect(await lookupConjugatedForms('être', 'present')).toEqual([
			'suis',
			'es',
			'est',
			'sommes',
			'êtes',
			'sont',
		]);
		expect((await lookupConjugatedForms('finir', 'present'))?.[2]).toBe('finit');
		expect((await lookupConjugatedForms('aimer', 'present'))?.[0]).toBe('aime');
	});

	it('normalise la requête (casse, NFC, pronominal)', async () => {
		const ref = await lookupConjugatedForms('manger', 'present');
		expect(await lookupConjugatedForms('  MANGER ', 'present')).toEqual(ref);
		expect(await lookupConjugatedForms("s'enfuir", 'present')).toEqual(
			await lookupConjugatedForms('enfuir', 'present'),
		);
	});

	it('renvoie null pour un non-verbe ou une saisie vide', async () => {
		expect(await lookupConjugatedForms('zzzzxqyw', 'present')).toBeNull();
		expect(await lookupConjugatedForms('', 'present')).toBeNull();
	});

	it('estVerbe détecte la présence dans le lexique', async () => {
		expect(await estVerbe('manger')).toBe(true);
		expect(await estVerbe('Sauter')).toBe(true);
		expect(await estVerbe('xyzkqw')).toBe(false);
	});
});
