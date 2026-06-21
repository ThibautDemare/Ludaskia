import { describe, it, expect } from 'vitest';
import {
	expanseVerbe,
	materialiserVerbes,
	cibleVerbeId,
	nbCiblesVerbe,
	nbCiblesVerbes,
} from '../src/core/orthographe/verbes';
import {
	emptyOrthoState,
	createListe,
	updateListe,
	normaliserVerbes,
} from '../src/core/orthographe/store';
import type { VerbeConfig } from '../src/core/orthographe/types';
import type { FormesConjuguees, VerbTense } from '../src/data/francais/verbs-lookup';

const FORMES_MANGER: FormesConjuguees = [
	'mange',
	'manges',
	'mange',
	'mangeons',
	'mangez',
	'mangent',
];
const FORMES_AIMER: FormesConjuguees = ['aime', 'aimes', 'aime', 'aimons', 'aimez', 'aiment'];

function cfg(pronoms: number[], complement?: string, infinitif = 'manger'): VerbeConfig {
	return { kind: 'verbe', infinitif, pronoms, temps: ['present'], complement };
}
const map = (f: FormesConjuguees) => new Map<VerbTense, FormesConjuguees>([['present', f]]);

describe('expanseVerbe (pur)', () => {
	it('produit une cible par couple (pronom × temps)', () => {
		const cibles = expanseVerbe(cfg([0, 1, 2]), map(FORMES_MANGER), 1000);
		expect(cibles).toHaveLength(3);
		expect(cibles.map((c) => c.mot)).toEqual(['mange', 'manges', 'mange']);
	});

	it('construit la phrase de contexte (pronom + complément)', () => {
		const [je, , il] = expanseVerbe(cfg([0, 1, 2], 'une pomme'), map(FORMES_MANGER), 1000);
		expect(je.contexte).toEqual({ avant: 'je ', apres: ' une pomme' });
		expect(il.contexte).toEqual({ avant: 'il ', apres: ' une pomme' });
	});

	it("élide « je » → « j' » devant une voyelle", () => {
		const [je] = expanseVerbe(cfg([0], '', 'aimer'), map(FORMES_AIMER), 1000);
		expect(je.contexte!.avant).toBe("j'");
		expect(je.mot).toBe('aime');
	});

	it('complément vide → suffixe vide', () => {
		const [je] = expanseVerbe(cfg([0]), map(FORMES_MANGER), 1000);
		expect(je.contexte!.apres).toBe('');
	});

	it('ids stables et distincts pour je/il même forme « mange »', () => {
		const [je, , il] = expanseVerbe(cfg([0, 1, 2]), map(FORMES_MANGER), 1000);
		expect(je.mot).toBe(il.mot);
		expect(je.id).not.toBe(il.id);
		expect(je.id).toBe(cibleVerbeId('manger', 'present', 0));
		expect(il.id).toBe(cibleVerbeId('manger', 'present', 2));
	});

	it('cible neuve : origine verbe, atelier à faire, modes non validés', () => {
		const [c] = expanseVerbe(cfg([0]), map(FORMES_MANGER), 1000);
		expect(c.origine).toBe('verbe');
		expect(c.atelierFait).toBe(false);
		expect(c.validation).toEqual({ motCache: false, tuiles: false, dictee: false });
	});

	it('compte les cibles = |pronoms| × |temps|', () => {
		expect(nbCiblesVerbe(cfg([0, 1, 2, 3]))).toBe(4);
		expect(nbCiblesVerbes([cfg([0, 1]), cfg([0, 1, 2], '', 'aimer')])).toBe(5);
	});
});

describe('materialiserVerbes (lookup LEFFF réel + banque)', () => {
	it('résout les formes et matérialise les cibles hors index de forme', async () => {
		const st = emptyOrthoState();
		const cibles = await materialiserVerbes(st, [cfg([0, 2], 'une pomme')], 1000);
		expect(cibles).toHaveLength(2);
		expect(cibles[0].mot).toBe('mange');
		expect(Object.keys(st.banque)).toHaveLength(2);
		expect(st.motIdParForme).toEqual({}); // cibles verbe jamais dédupliquées par forme
	});

	it('réutilise une cible existante (progression conservée) et rafraîchit le contexte', async () => {
		const st = emptyOrthoState();
		const first = await materialiserVerbes(st, [cfg([0], 'une pomme')], 1000);
		first[0].validation.dictee = true;
		const again = await materialiserVerbes(st, [cfg([0], 'des pommes')], 2000);
		expect(again[0].validation.dictee).toBe(true); // même objet de banque
		expect(again[0].contexte!.apres).toBe(' des pommes'); // complément mis à jour
		expect(Object.keys(st.banque)).toHaveLength(1);
	});

	it('ignore un verbe inconnu du lexique', async () => {
		const st = emptyOrthoState();
		expect(await materialiserVerbes(st, [cfg([0], '', 'zzzxqyw')], 1000)).toEqual([]);
	});
});

describe('store — persistance des verbes', () => {
	it('normaliserVerbes nettoie pronoms/temps et écarte les entrées incomplètes', () => {
		const v = normaliserVerbes([
			{
				kind: 'verbe',
				infinitif: ' Manger ',
				pronoms: [2, 0, 0, 9, -1],
				temps: ['present', 'present'],
				complement: '  une pomme  ',
			},
			{ kind: 'verbe', infinitif: '', pronoms: [0], temps: ['present'] },
			{ kind: 'verbe', infinitif: 'aller', pronoms: [], temps: ['present'] },
		]);
		expect(v).toHaveLength(1);
		expect(v[0]).toEqual({
			kind: 'verbe',
			infinitif: 'Manger',
			pronoms: [0, 2],
			temps: ['present'],
			complement: 'une pomme',
		});
	});

	it('createListe puis updateListe gèrent le champ verbes', () => {
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [{ mot: 'chat' }], undefined, [
			{ kind: 'verbe', infinitif: 'manger', pronoms: [0, 1], temps: ['present'] },
		]);
		expect(liste.verbes).toHaveLength(1);
		expect(liste.motIds).toHaveLength(1);
		updateListe(st, liste.id, 'L2', [{ mot: 'chat' }], undefined, []);
		expect(st.listes[0].verbes).toBeUndefined(); // plus aucun verbe → undefined
	});
});
