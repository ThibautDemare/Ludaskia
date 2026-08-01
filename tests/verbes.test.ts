import { describe, it, expect } from 'vitest';
import {
	expanseVerbe,
	materialiserVerbes,
	cibleVerbeId,
	listeDeCibleVerbe,
	nbCiblesVerbe,
	nbCiblesVerbes,
	libellePronoms,
	apercuVerbe,
	TEMPS_LABEL,
} from '../src/core/orthographe/verbes';
import {
	emptyOrthoState,
	createListe,
	updateListe,
	normaliserVerbes,
	loadOrtho,
	saveOrtho,
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

/* ============================================================
   Vocabulaire d'un verbe configuré (#441) — libellePronoms / apercuVerbe.
   ------------------------------------------------------------
   Attendus dérivés de ce que l'adulte doit LIRE : les pronoms tels
   qu'on les dit à l'école (je, tu, il, nous, vous, ils), une formule
   courte quand ils y sont tous, et une étiquette qui commence par
   l'infinitif (c'est elle qui sera triée dans l'aperçu des mots).
   ============================================================ */
describe('libellePronoms (pur)', () => {
	it('un seul pronom : aucun séparateur parasite', () => {
		expect(libellePronoms([0])).toBe('je');
		expect(libellePronoms([5])).toBe('ils');
	});

	it('plusieurs pronoms : énumérés, séparés par une virgule', () => {
		expect(libellePronoms([0, 2])).toBe('je, il');
		expect(libellePronoms([3, 4, 5])).toBe('nous, vous, ils');
	});

	it('CINQ pronoms sur six : toujours énumérés (pas de raccourci prématuré)', () => {
		expect(libellePronoms([0, 1, 2, 3, 4])).toBe('je, tu, il, nous, vous');
	});

	it('les SIX pronoms : bascule sur « tous les pronoms »', () => {
		expect(libellePronoms([0, 1, 2, 3, 4, 5])).toBe('tous les pronoms');
	});

	it('respecte l’ordre reçu, sans le retrier lui-même', () => {
		// Le tri canonique est la responsabilité de normaliserVerbes (en amont) : cette
		// fonction ne fait que mettre en mots ce qu'on lui donne.
		expect(libellePronoms([2, 0])).toBe('il, je');
	});
});

describe('apercuVerbe (pur) — étiquette d’aperçu d’un verbe', () => {
	it('infinitif puis pronoms et temps entre parenthèses', () => {
		expect(apercuVerbe(cfg([0, 2]))).toBe('manger (je, il — présent)');
		expect(apercuVerbe(cfg([0]))).toBe('manger (je — présent)');
	});

	it('les six pronoms cochés : la formule courte, pas six pronoms d’affilée', () => {
		expect(apercuVerbe(cfg([0, 1, 2, 3, 4, 5]))).toBe('manger (tous les pronoms — présent)');
	});

	it('le complément de phrase ne figure PAS dans l’aperçu', () => {
		// « une pomme » sert la phrase de contexte de la dictée, pas l'identification du
		// verbe : l'étiquette doit rester la même avec ou sans lui.
		expect(apercuVerbe(cfg([0, 2], 'une pomme'))).toBe(apercuVerbe(cfg([0, 2])));
	});

	it('infinitif rendu tel quel (pronominal, apostrophe droite conservée)', () => {
		expect(apercuVerbe(cfg([0, 1], undefined, "s'enfuir"))).toBe("s'enfuir (je, tu — présent)");
		expect(apercuVerbe(cfg([0], undefined, 'se laver'))).toBe('se laver (je — présent)');
	});

	it('commence TOUJOURS par l’infinitif (c’est lui qui décide du tri de l’aperçu)', () => {
		for (const v of [cfg([0]), cfg([0, 1, 2, 3, 4, 5], 'une pomme'), cfg([3], '', 'aimer')]) {
			expect(apercuVerbe(v).startsWith(v.infinitif + ' (')).toBe(true);
			expect(apercuVerbe(v).endsWith(')')).toBe(true);
		}
	});

	it('le temps est nommé en clair (et une seule fois après normalisation)', () => {
		expect(TEMPS_LABEL.present).toBe('présent');
		// Un temps coché deux fois est dédupliqué en amont : pas de « présent, présent ».
		const [v] = normaliserVerbes([
			{ kind: 'verbe', infinitif: 'manger', pronoms: [0], temps: ['present', 'present'] },
		]);
		expect(apercuVerbe(v)).toBe('manger (je — présent)');
	});

	it('chemin réel : l’ordre de cochage du parent ne transparaît pas', () => {
		const [v] = normaliserVerbes([
			{ kind: 'verbe', infinitif: 'manger', pronoms: [5, 0, 2], temps: ['present'] },
		]);
		expect(apercuVerbe(v)).toBe('manger (je, il, ils — présent)');
	});

	it('chemin réel : un pronom coché en double ne fait pas croire aux six', () => {
		// Six ENTRÉES mais un seul pronom distinct : c'est la dédup amont qui protège la
		// bascule « tous les pronoms » (elle se décide sur le nombre de pronoms).
		const [v] = normaliserVerbes([
			{ kind: 'verbe', infinitif: 'manger', pronoms: [0, 0, 0, 0, 0, 0], temps: ['present'] },
		]);
		expect(v.pronoms).toEqual([0]);
		expect(apercuVerbe(v)).toBe('manger (je — présent)');
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

	it('homophones je/il (« mange ») → deux cibles de banque distinctes', async () => {
		const st = emptyOrthoState();
		await materialiserVerbes(st, [cfg([0, 2])], 1000); // je, il
		expect(Object.keys(st.banque).sort()).toEqual(
			[cibleVerbeId('manger', 'present', 0), cibleVerbeId('manger', 'present', 2)].sort(),
		);
		expect(Object.values(st.banque).map((m) => m.mot)).toEqual(['mange', 'mange']);
	});
});

describe('listeDeCibleVerbe — lien retour cible → liste propriétaire (#391)', () => {
	const verbe = (infinitif: string): VerbeConfig => ({
		kind: 'verbe',
		infinitif,
		pronoms: [0, 2],
		temps: ['present'],
	});

	it('cible matérialisée : renvoie la liste qui porte CE verbe (pas la 1re liste à verbes)', async () => {
		const st = emptyOrthoState();
		const autre = createListe(st, 'Semaine 1', [{ mot: 'chat' }], undefined, [verbe('chanter')]);
		const liste = createListe(st, 'Semaine 2', [{ mot: 'jardin' }], undefined, [verbe('manger')]);
		const cibles = await materialiserVerbes(st, [verbe('chanter'), verbe('manger')], 1000);
		expect(cibles.length).toBe(4); // 2 verbes × 2 pronoms
		for (const c of cibles) {
			const attendue = c.mot.startsWith('chant') ? autre.id : liste.id;
			expect(listeDeCibleVerbe(st, c.id)).toBe(attendue);
		}
	});

	it('insensible à la casse et aux espaces de la saisie du parent', () => {
		// La liste et la banque passent par la MÊME clé (normVerbKey) : le parent peut avoir
		// saisi « Écouter » d'un côté et la cible être née d'une saisie différemment ponctuée.
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [], undefined, [verbe('écouter')]);
		expect(listeDeCibleVerbe(st, cibleVerbeId('  ÉCOUTER ', 'present', 0))).toBe(liste.id);
	});

	it('verbe pronominal : « se laver » et « laver » désignent la même cible', () => {
		// La clé retire le pronominal, des deux côtés → le lien retour fonctionne quelle que
		// soit la forme saisie (revers assumé : deux listes, l'une « se laver » l'autre
		// « laver », se disputent la cible ; la première de l'état gagne).
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [], undefined, [verbe('se laver')]);
		expect(listeDeCibleVerbe(st, cibleVerbeId('se laver', 'present', 0))).toBe(liste.id);
		expect(listeDeCibleVerbe(st, cibleVerbeId('laver', 'present', 0))).toBe(liste.id);
	});

	it('un infinitif plus long ne capte pas la cible (comparaison bornée par « # »)', () => {
		const st = emptyOrthoState();
		createListe(st, 'L', [], undefined, [verbe('manger')]);
		expect(listeDeCibleVerbe(st, cibleVerbeId('mangeotter', 'present', 0))).toBeNull();
	});

	it('id qui n’est pas une cible verbe (mot ordinaire) : null', () => {
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [{ mot: 'chat' }], undefined, [verbe('manger')]);
		expect(listeDeCibleVerbe(st, liste.motIds[0])).toBeNull();
	});

	it('cible dont la liste a disparu (ou dont le verbe a été retiré) : null', async () => {
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [], undefined, [verbe('manger')]);
		const [cible] = await materialiserVerbes(st, [verbe('manger')], 1000);
		expect(listeDeCibleVerbe(st, cible.id)).toBe(liste.id);
		// Le verbe retiré de la liste : la cible reste en banque (donc en révision), mais
		// plus aucun groupe ne la revendique.
		updateListe(st, liste.id, 'L', [], undefined, []);
		expect(st.banque[cible.id]).toBeDefined();
		expect(listeDeCibleVerbe(st, cible.id)).toBeNull();
	});

	it('état sans liste, ou liste sans verbes : null', () => {
		const vide = emptyOrthoState();
		expect(listeDeCibleVerbe(vide, cibleVerbeId('manger', 'present', 0))).toBeNull();
		const st = emptyOrthoState();
		createListe(st, 'Sans verbe', [{ mot: 'chat' }]);
		expect(listeDeCibleVerbe(st, cibleVerbeId('manger', 'present', 0))).toBeNull();
	});

	it('un infinitif sans accent ne crée AUCUNE cible : la question ne se pose pas', async () => {
		// La clé n'est pas insensible aux accents (« ecouter » ≠ « écouter »), mais un tel
		// infinitif est inconnu du lexique → aucune cible en banque, donc rien à rattacher.
		const st = emptyOrthoState();
		createListe(st, 'L', [], undefined, [verbe('ecouter')]);
		expect(await materialiserVerbes(st, [verbe('ecouter')], 1000)).toEqual([]);
		expect(Object.keys(st.banque)).toHaveLength(0);
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

	it('loadOrtho : rétrocompat d’une liste sans champ verbes', () => {
		const st = emptyOrthoState();
		createListe(st, 'Legacy', [{ mot: 'chat' }]); // liste créée sans verbes
		saveOrtho(st);
		const reloaded = loadOrtho();
		expect(reloaded.listes).toHaveLength(1);
		expect(reloaded.listes[0].verbes).toBeUndefined();
		expect(reloaded.listes[0].motIds).toHaveLength(1);
	});
});
