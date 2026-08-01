/* ============================================================
   Espace encadrant — BANQUE DE MOTS (#496) : voir où vit un mot, le supprimer
   pour de bon, suivre son avancement.
   ------------------------------------------------------------
   Les attendus sont dérivés du MODÈLE et de la spec de la vue, jamais transcrits
   depuis l'implémentation :
     - une liste ne CONTIENT pas ses mots, elle les RÉFÉRENCE, et la banque
       déduplique par forme normalisée → un même mot peut être attaché à
       plusieurs listes, et une suppression doit toutes les nettoyer, sinon
       l'adulte ampute une liste sans le savoir ;
     - « orphelin » doit coïncider EXACTEMENT avec « aucun groupe où ranger une
       erreur » (`groupeOrthoDuMot === null`) : c'est le motif d'ouverture de la
       vue, un mot révisé mais invisible du journal d'erreurs ;
     - « supprimable » se juge sur l'APPARTENANCE à une leçon prédéfinie, jamais
       sur `MotOrtho.origine` : la dédup par forme fait qu'un mot saisi par le
       parent ET présent dans une prédéfinie n'a qu'UNE entrée, dont l'`origine`
       ne dit que qui l'a créée en premier ;
     - l'index de dédup ne doit référencer que des mots PRÉSENTS en banque
       (invariant `index ⊆ banque`), y compris quand l'état vient d'un import.

   Les états « venus d'ailleurs » (import, version antérieure) sont fabriqués en
   JSON brut relu par `loadOrthoFor` — comme le ferait un vrai localStorage —
   plutôt qu'avec un cast : c'est le seul chemin par lequel une incohérence entre
   dans l'appli.
   ============================================================ */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { setOnDataWrite, lsSetRaw, PROFILES_KEY } from '../src/core/storage';
import {
	initProfiles,
	activeProfile,
	addProfile,
	loadProfilesMeta,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import { toggleRevoirFor } from '../src/core/encadrant-stats';
import {
	ORTHO_KEY,
	emptyOrthoState,
	addOrGetMot,
	createListe,
	updateListe,
	deleteListe,
	loadOrtho,
	loadOrthoFor,
	saveOrthoFor,
	listeContenantMot,
	listesContenantMot,
	supprimerMot,
} from '../src/core/orthographe/store';
import {
	groupeOrthoDuMot,
	leconPredefinieDuMot,
	motsDeLecon,
} from '../src/core/orthographe/lessons';
import { cibleVerbeId, expanseVerbe, listesDeCibleVerbe } from '../src/core/orthographe/verbes';
import {
	banqueProfil,
	filtrerBanque,
	motsDevenusOrphelins,
	type EntreeBanque,
} from '../src/core/orthographe/banque';
import { marquerAtelierFait, validerMode } from '../src/core/orthographe/runner';
import { ORTHO_PREDEF, type LeconOrthoPredef } from '../src/data/francais/orthographe';
import type { MotOrtho, OrthoState, VerbeConfig } from '../src/core/orthographe/types';
import type { FormesConjuguees, VerbTense } from '../src/data/francais/verbs-lookup';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});
afterEach(() => {
	vi.restoreAllMocks();
});

/* ============================================================
   Repères et helpers
   ============================================================ */
const T0 = new Date(2026, 5, 15, 9, 0, 0, 0).getTime();
/** Valeur qu'aucune horloge réelle ne produit : si `updatedAt` la garde, personne ne l'a touché. */
const SENTINELLE = 1000;

/** Verbe paramétré par le parent (#261) : ses cibles se recréent à chaque parcours. */
const MANGER: VerbeConfig = {
	kind: 'verbe',
	infinitif: 'manger',
	pronoms: [0, 2],
	temps: ['present'],
	complement: 'une pomme',
};
const FORMES_MANGER: FormesConjuguees = [
	'mange',
	'manges',
	'mange',
	'mangeons',
	'mangez',
	'mangent',
];
const FORMES_AIMER: FormesConjuguees = ['aime', 'aimes', 'aime', 'aimons', 'aimez', 'aiment'];

/** Matérialise les cibles d'un verbe dans la banque (ce que fait `materialiserVerbes`
    une fois les formes résolues via LEFFF — ici les formes sont fournies, donc synchrone). */
function poserCibles(state: OrthoState, cfg: VerbeConfig, formes: FormesConjuguees): MotOrtho[] {
	const cibles = expanseVerbe(cfg, new Map<VerbTense, FormesConjuguees>([['present', formes]]), T0);
	for (const c of cibles) state.banque[c.id] = c;
	return cibles;
}

/** État orthographe fabriqué en JSON BRUT puis relu comme le fait l'espace encadrant :
    le seul chemin réaliste pour un état importé/incohérent, sans cast dans le test. */
function etatImporte(uuid: string, brut: unknown): OrthoState {
	lsSetRaw(uuid + '/' + ORTHO_KEY, JSON.stringify(brut));
	return loadOrthoFor(uuid);
}

/** Squelette d'un mot en banque tel qu'il est sérialisé (pour les états importés). */
function motBrut(id: string, mot: string) {
	return {
		id,
		mot,
		entourage: [],
		atelierFait: false,
		validation: { motCache: false, tuiles: false, dictee: false },
		revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
		origine: 'liste',
	};
}

/** Une forme présente dans PLUSIEURS leçons prédéfinies, avec ces leçons dans l'ordre
    de DÉCLARATION : le cas où « la première déclarée gagne » se joue. */
function formePartagee(): { forme: string; lecons: LeconOrthoPredef[] } {
	const parForme = new Map<string, LeconOrthoPredef[]>();
	for (const l of ORTHO_PREDEF) {
		for (const mi of l.mots) {
			const f = mi.mot.trim().normalize('NFC').toLocaleLowerCase('fr');
			const deja = parForme.get(f) ?? [];
			if (!deja.includes(l)) deja.push(l);
			parForme.set(f, deja);
		}
	}
	for (const [forme, lecons] of parForme) if (lecons.length > 1) return { forme, lecons };
	throw new Error('aucune forme partagée entre deux leçons prédéfinies');
}

const MOT_PREDEF = ORTHO_PREDEF[0].mots[0].mot; // mot livré avec l'appli (« afin de »)

const formes = (es: EntreeBanque[]) => es.map((e) => e.mot);
const labels = (ls: { label: string }[]) => ls.map((l) => l.label);

/* Observation d'`updatedAt` (cf. profil-modifie-encadrant.test.ts) */
function profil(uuid: string): Profile {
	const p = loadProfilesMeta()?.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	return p;
}
function figer(uuid: string, at: number): void {
	const m = loadProfilesMeta();
	if (!m) throw new Error('méta absente');
	const p = m.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	p.updatedAt = at;
	lsSetRaw(PROFILES_KEY, JSON.stringify(m));
}
function auMoment<T>(t: number, geste: () => T): T {
	const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
	try {
		return geste();
	} finally {
		spy.mockRestore();
	}
}

/* ============================================================
   1. « Où vit ce mot ? » — toutes les attaches, pas une seule
   ============================================================ */
describe('listesContenantMot — toutes les listes qui référencent le mot', () => {
	it('renvoie TOUTES les listes dans l’ordre du profil, là où listeContenantMot n’en donne qu’une', () => {
		const s = emptyOrthoState();
		const a = createListe(s, 'Dictée du 12', [{ mot: 'vélo' }, { mot: 'train' }]);
		createListe(s, 'Dictée du 19', [{ mot: 'brouette' }]);
		// Même mot, saisi différemment : la banque déduplique par forme → même id.
		const c = createListe(s, 'Révisions', [{ mot: '  Vélo ' }]);

		const velo = s.motIdParForme['vélo'];
		expect(a.motIds).toContain(velo);
		expect(c.motIds).toEqual([velo]);

		expect(listesContenantMot(s, velo).map((l) => l.id)).toEqual([a.id, c.id]);
		expect(listeContenantMot(s, velo)).toBe(a.id); // le journal d'erreurs, lui, n'en garde qu'une
	});

	it('mot rattaché à aucune liste (ou id inconnu) → tableau vide', () => {
		const s = emptyOrthoState();
		createListe(s, 'Dictée du 12', [{ mot: 'vélo' }]);
		const seul = addOrGetMot(s, { mot: 'zorglub' }); // en banque, dans aucune liste

		expect(listesContenantMot(s, seul.id)).toEqual([]);
		expect(listesContenantMot(s, 'id-inexistant')).toEqual([]);
	});
});

describe('listesDeCibleVerbe — les listes qui REGÉNÈRENT une cible verbe', () => {
	it('l’id d’une cible encode le verbe, le temps et la personne', () => {
		expect(cibleVerbeId('manger', 'present', 2)).toBe('v:manger#present#2');
		// La casse et la forme Unicode de la saisie parent ne changent pas l'id.
		expect(cibleVerbeId('MANGER', 'present', 2)).toBe(cibleVerbeId('manger', 'present', 2));
		expect(cibleVerbeId('être', 'present', 0)).toBe(cibleVerbeId('être', 'present', 0));
	});

	it('renvoie toutes les listes portant le verbe, dans l’ordre, quelles que soient casse et graphie', () => {
		const s = emptyOrthoState();
		const a = createListe(s, 'Verbes du soir', [], undefined, [MANGER]);
		createListe(s, 'Mots seuls', [{ mot: 'vélo' }]);
		const c = createListe(s, 'Révisions', [], undefined, [
			{ kind: 'verbe', infinitif: 'MANGER', pronoms: [4], temps: ['present'] },
		]);

		const cible = cibleVerbeId('manger', 'present', 2);
		expect(listesDeCibleVerbe(s, cible).map((l) => l.id)).toEqual([a.id, c.id]);
	});

	it('« s’enfuir » et « enfuir » désignent la même cible (préfixe pronominal retiré)', () => {
		const s = emptyOrthoState();
		const a = createListe(s, 'Pronominaux', [], undefined, [
			{ kind: 'verbe', infinitif: "s'enfuir", pronoms: [0], temps: ['present'] },
		]);
		const b = createListe(s, 'Simples', [], undefined, [
			{ kind: 'verbe', infinitif: 'enfuir', pronoms: [0], temps: ['present'] },
		]);

		expect(listesDeCibleVerbe(s, cibleVerbeId("s'enfuir", 'present', 0)).map((l) => l.id)).toEqual([
			a.id,
			b.id,
		]);
	});

	it('aucun faux positif : un id de mot classique, un verbe voisin, un verbe retiré', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Dictée', [{ mot: 'vélo' }], undefined, [
			{ kind: 'verbe', infinitif: 'aime', pronoms: [0], temps: ['present'] },
		]);

		expect(listesDeCibleVerbe(s, s.motIdParForme['vélo'])).toEqual([]); // pas une cible verbe
		expect(listesDeCibleVerbe(s, 'v:')).toEqual([]);
		// « aime » ne doit pas capter la cible de « aimer » : le préfixe s'arrête au « # ».
		expect(listesDeCibleVerbe(s, cibleVerbeId('aimer', 'present', 0))).toEqual([]);

		// Le parent retire le verbe de la liste → plus aucune liste ne régénère la cible.
		updateListe(s, liste.id, liste.label, [{ mot: 'vélo' }]);
		expect(listesDeCibleVerbe(s, cibleVerbeId('aime', 'present', 0))).toEqual([]);
	});
});

/* ============================================================
   2. Suppression définitive d'un mot
   ============================================================ */
describe('supprimerMot', () => {
	it('retire le mot de la banque, de l’index et des motIds de TOUTES ses listes', () => {
		const s = emptyOrthoState();
		const a = createListe(s, 'Dictée du 12', [{ mot: 'vélo' }, { mot: 'train' }]);
		const b = createListe(s, 'Révisions', [{ mot: 'vélo' }, { mot: 'brouette' }]);
		const velo = s.motIdParForme['vélo'];
		const train = s.motIdParForme['train'];

		expect(supprimerMot(s, velo)).toBe(true);

		expect(s.banque[velo]).toBeUndefined();
		expect(Object.values(s.motIdParForme)).not.toContain(velo);
		expect(a.motIds).toEqual([train]);
		expect(b.motIds).toEqual([s.motIdParForme['brouette']]);
		// Les voisins sont intacts : la suppression est chirurgicale.
		expect(s.banque[train].mot).toBe('train');
		expect(s.motIdParForme['train']).toBe(train);
		expect(labels(s.listes)).toEqual(['Dictée du 12', 'Révisions']); // aucune liste supprimée
	});

	it('id inconnu → false, et l’état n’est pas touché ; second appel → false (idempotent)', () => {
		const s = emptyOrthoState();
		createListe(s, 'Dictée du 12', [{ mot: 'vélo' }]);
		const avant = JSON.stringify(s);

		expect(supprimerMot(s, 'id-inexistant')).toBe(false);
		expect(JSON.stringify(s)).toBe(avant);

		const velo = s.motIdParForme['vélo'];
		expect(supprimerMot(s, velo)).toBe(true);
		expect(supprimerMot(s, velo)).toBe(false);
	});

	it('invariant « index ⊆ banque » : une entrée d’index PÉRIMÉE sur le même id part aussi', () => {
		// État importé : le mot a été corrigé « chats » → « chat », mais l'ancienne clé
		// d'index pointe encore sur lui. Supprimer le mot doit laisser un index qui ne
		// référence QUE des mots présents en banque.
		const uuid = activeProfile().uuid;
		const s = etatImporte(uuid, {
			banque: { m1: motBrut('m1', 'chat'), m2: motBrut('m2', 'vélo') },
			listes: [],
			motIdParForme: { chat: 'm1', chats: 'm1', vélo: 'm2' },
		});

		expect(supprimerMot(s, 'm1')).toBe(true);

		expect(Object.values(s.motIdParForme)).not.toContain('m1');
		expect(s.motIdParForme).toEqual({ vélo: 'm2' }); // l'index restant reste valide
		for (const id of Object.values(s.motIdParForme)) expect(s.banque[id]).toBeDefined();

		// Ressaisir l'une ou l'autre forme recrée un mot RÉELLEMENT présent en banque.
		const rejoue = addOrGetMot(s, { mot: 'chats' });
		expect(rejoue.id).not.toBe('m1');
		expect(s.banque[rejoue.id]).toBeDefined();
	});

	it('supprime une cible verbe de la banque (la config du verbe, elle, reste dans la liste)', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Verbes du soir', [], undefined, [MANGER]);
		const cibles = poserCibles(s, MANGER, FORMES_MANGER);
		const cible = cibles[0].id;

		expect(supprimerMot(s, cible)).toBe(true);
		expect(s.banque[cible]).toBeUndefined();
		expect(liste.verbes).toHaveLength(1); // le verbe régénérera la cible au prochain parcours
	});
});

/* ============================================================
   3. Rattachement à une leçon prédéfinie
   ============================================================ */
describe('leconPredefinieDuMot', () => {
	it('retrouve la leçon d’un mot matérialisé en jouant cette leçon', () => {
		const s = emptyOrthoState();
		const lecon = ORTHO_PREDEF[0];
		const mots = motsDeLecon(s, lecon.id);

		expect(mots.length).toBe(lecon.mots.length);
		for (const m of mots) {
			expect(leconPredefinieDuMot(s, m.id)).toEqual({ id: lecon.id, label: lecon.label });
		}
	});

	it('un mot SAISI PAR LE PARENT qui figure dans une prédéfinie y est rattaché quand même', () => {
		// Cas piège : la banque déduplique par forme, donc `origine` reste 'liste' alors
		// que rejouer la leçon prédéfinie recréerait le mot. Se fier à `origine` laisserait
		// croire qu'il est supprimable.
		const s = emptyOrthoState();
		createListe(s, 'Dictée du 12', [{ mot: MOT_PREDEF }]);
		const id = s.motIdParForme[MOT_PREDEF];

		expect(s.banque[id].origine).toBe('liste');
		expect(leconPredefinieDuMot(s, id)).toEqual({
			id: ORTHO_PREDEF[0].id,
			label: ORTHO_PREDEF[0].label,
		});
	});

	it('forme partagée par plusieurs leçons → la PREMIÈRE déclarée', () => {
		const { forme, lecons } = formePartagee();
		expect(lecons.length).toBeGreaterThanOrEqual(2); // le cas existe bien dans les données
		const s = emptyOrthoState();
		const id = addOrGetMot(s, { mot: forme }).id;

		expect(leconPredefinieDuMot(s, id)).toEqual({ id: lecons[0].id, label: lecons[0].label });
	});

	it('mot du parent absent des prédéfinies, cible verbe, id inconnu → null', () => {
		const s = emptyOrthoState();
		createListe(s, 'Dictée du 12', [{ mot: 'zorglub' }]);
		// Une cible verbe n'est PAS indexée par forme : même quand la banque contient par
		// ailleurs un mot de prédéfinie, la recherche par id ne doit pas les confondre.
		addOrGetMot(s, { mot: MOT_PREDEF });
		const cibles = poserCibles(s, MANGER, FORMES_MANGER);

		expect(leconPredefinieDuMot(s, s.motIdParForme['zorglub'])).toBeNull();
		expect(leconPredefinieDuMot(s, cibles[0].id)).toBeNull();
		expect(leconPredefinieDuMot(s, 'id-inexistant')).toBeNull();
	});
});

describe('groupeOrthoDuMot — non-régression du groupe d’erreurs (#391)', () => {
	it('priorité liste > leçon prédéfinie > liste propriétaire du verbe, sinon null', () => {
		const s = emptyOrthoState();
		// Le mot est à la fois dans une liste du parent ET dans une prédéfinie.
		const liste = createListe(s, 'Dictée du 12', [{ mot: MOT_PREDEF }, { mot: 'vélo' }]);
		const predefSeul = addOrGetMot(s, { mot: formePartagee().forme });
		const listeVerbe = createListe(s, 'Verbes du soir', [], undefined, [MANGER]);
		const cibles = poserCibles(s, MANGER, FORMES_MANGER);
		const orphelin = addOrGetMot(s, { mot: 'zorglub' });

		expect(groupeOrthoDuMot(s, s.motIdParForme[MOT_PREDEF])).toBe(liste.id);
		expect(groupeOrthoDuMot(s, predefSeul.id)).toBe(formePartagee().lecons[0].id);
		expect(groupeOrthoDuMot(s, cibles[0].id)).toBe(listeVerbe.id);
		expect(groupeOrthoDuMot(s, orphelin.id)).toBeNull();
		expect(groupeOrthoDuMot(s, 'id-inexistant')).toBeNull();
	});
});

/* ============================================================
   4. Projection de la banque
   ============================================================ */
/** État couvrant les quatre façons d'être rattaché — et les deux d'être orphelin. */
function etatRiche() {
	const s = emptyOrthoState();
	const liste = createListe(s, 'Dictée du 12', [{ mot: 'vélo' }, { mot: 'train' }]);
	const listeVerbe = createListe(s, 'Verbes du soir', [], undefined, [MANGER]);
	const cibles = poserCibles(s, MANGER, FORMES_MANGER);
	const predef = addOrGetMot(s, { mot: MOT_PREDEF }, 'predefini');
	const jamaisEnListe = addOrGetMot(s, { mot: 'zorglub' });
	// Mot dont la seule liste a été supprimée : il reste en révision, sans groupe.
	const ancienne = createListe(s, 'Ancienne dictée', [{ mot: 'brouette' }]);
	const listeSupprimee = s.motIdParForme['brouette'];
	deleteListe(s, ancienne.id);
	return { s, liste, listeVerbe, cibles, predef, jamaisEnListe, listeSupprimee };
}

describe('banqueProfil', () => {
	it('trie en ordre « dictionnaire » : accents et majuscules à leur place', () => {
		const s = emptyOrthoState();
		for (const mot of ['zèbre', 'école', 'Élan', 'avion', 'eau']) addOrGetMot(s, { mot });

		// Un tri brut sur la chaîne rejetterait « école »/« Élan » après « zèbre ».
		expect(formes(banqueProfil(s, true))).toEqual(['avion', 'eau', 'école', 'Élan', 'zèbre']);
	});

	it('INVARIANT : orphelin ⇔ groupeOrthoDuMot() === null', () => {
		const { s, jamaisEnListe, listeSupprimee } = etatRiche();
		const entrees = banqueProfil(s, true);

		for (const e of entrees) {
			expect([e.mot, e.orphelin]).toEqual([e.mot, groupeOrthoDuMot(s, e.id) === null]);
		}
		// …et l'invariant n'est pas vrai « à vide » : on sait exactement qui est orphelin.
		expect(
			entrees
				.filter((e) => e.orphelin)
				.map((e) => e.id)
				.sort(),
		).toEqual([jamaisEnListe.id, listeSupprimee].sort());
	});

	it('nomme les listes qui référencent le mot et celles qui régénèrent une cible verbe', () => {
		const { s, liste, listeVerbe, cibles } = etatRiche();
		const parId = new Map(banqueProfil(s, true).map((e) => [e.id, e]));

		const velo = parId.get(s.motIdParForme['vélo']);
		expect(velo?.listes).toEqual([{ id: liste.id, label: 'Dictée du 12' }]);
		expect(velo?.verbeListes).toEqual([]);

		const cible = parId.get(cibles[0].id);
		expect(cible?.listes).toEqual([]); // une cible verbe n'est pas dans motIds
		expect(cible?.verbeListes).toEqual([{ id: listeVerbe.id, label: 'Verbes du soir' }]);
	});

	it('supprimable = n’appartient à aucune prédéfinie (pas « origine ≠ predefini »)', () => {
		const s = emptyOrthoState();
		// Saisi par le parent (origine 'liste') mais présent dans une leçon livrée :
		// le supprimer ne tiendrait pas, la leçon le recréerait.
		createListe(s, 'Dictée du 12', [{ mot: MOT_PREDEF }, { mot: 'zorglub' }]);
		const cibles = poserCibles(s, MANGER, FORMES_MANGER);
		const parId = new Map(banqueProfil(s, true).map((e) => [e.id, e]));

		const predef = parId.get(s.motIdParForme[MOT_PREDEF]);
		expect(predef?.leconPredefinie).toBe(ORTHO_PREDEF[0].label);
		expect(predef?.supprimable).toBe(false);
		expect(parId.get(s.motIdParForme['zorglub'])?.supprimable).toBe(true);
		// Une cible verbe n'est dans aucune prédéfinie → supprimable ; c'est `verbeListes`
		// qui prévient l'adulte qu'un verbe la recréerait.
		expect(parId.get(cibles[0].id)?.supprimable).toBe(true);
	});

	it('leconPredefinie applique le même tie-break « première déclarée » que le journal', () => {
		// La vue et le journal d'erreurs doivent nommer la MÊME leçon : deux chemins qui
		// divergeraient donneraient à l'adulte deux provenances pour le même mot.
		const { forme, lecons } = formePartagee();
		expect(lecons[0].label).not.toBe(lecons[lecons.length - 1].label); // le tie-break est visible
		const s = emptyOrthoState();
		const id = addOrGetMot(s, { mot: forme }).id;
		const e = banqueProfil(s, true).find((x) => x.id === id);

		expect(e?.leconPredefinie).toBe(lecons[0].label);
		expect(e?.supprimable).toBe(false);
		expect(groupeOrthoDuMot(s, id)).toBe(lecons[0].id);
	});

	it('leconPredefinie ne diverge jamais de leconPredefinieDuMot (règle à source unique)', () => {
		const { s } = etatRiche();
		const entrees = banqueProfil(s, true);

		expect(entrees.filter((e) => e.leconPredefinie !== null)).not.toHaveLength(0);
		for (const e of entrees) {
			const attendu = leconPredefinieDuMot(s, e.id)?.label ?? null;
			expect([e.mot, e.leconPredefinie]).toEqual([e.mot, attendu]);
		}
	});

	it('statut = même échelle que les listes, dictée comptée seulement si le TTS est là', () => {
		const s = emptyOrthoState();
		createListe(s, 'Dictée du 12', [{ mot: 'vélo' }, { mot: 'train' }]);
		const velo = s.banque[s.motIdParForme['vélo']];
		marquerAtelierFait(velo);
		validerMode(velo, 'tuiles');
		validerMode(velo, 'motCache');

		const avecTts = new Map(banqueProfil(s, true).map((e) => [e.id, e.statut]));
		const sansTts = new Map(banqueProfil(s, false).map((e) => [e.id, e.statut]));

		expect(avecTts.get(velo.id)).toBe('enCours'); // la dictée manque encore
		expect(sansTts.get(velo.id)).toBe('maitrise'); // sans TTS, elle n'est pas exigée
		expect(avecTts.get(s.motIdParForme['train'])).toBe('nouveau'); // atelier pas fait
	});

	it('contexte : la cible verbe s’affiche en phrase, un mot classique n’en a pas', () => {
		const s = emptyOrthoState();
		addOrGetMot(s, { mot: 'vélo' });
		poserCibles(s, MANGER, FORMES_MANGER);
		poserCibles(
			s,
			{ kind: 'verbe', infinitif: 'aimer', pronoms: [0], temps: ['present'] },
			FORMES_AIMER,
		);
		const parId = new Map(banqueProfil(s, true).map((e) => [e.id, e]));

		expect(parId.get(cibleVerbeId('manger', 'present', 2))?.contexte).toBe('il mange une pomme');
		expect(parId.get(cibleVerbeId('aimer', 'present', 0))?.contexte).toBe("j'aime"); // élision
		expect(parId.get(s.motIdParForme['vélo'])?.contexte).toBeUndefined();
	});

	it('état importé incohérent : l’entrée corrompue est ignorée, le reste est projeté', () => {
		const uuid = activeProfile().uuid;
		const s = etatImporte(uuid, {
			banque: { bad: { id: 'bad' }, m2: motBrut('m2', 'vélo') },
			listes: [],
			motIdParForme: { vélo: 'm2' },
		});

		expect(formes(banqueProfil(s, true))).toEqual(['vélo']);
	});
});

/* ============================================================
   5. Filtres de la vue
   ============================================================ */
describe('filtrerBanque', () => {
	function entrees(): EntreeBanque[] {
		const s = emptyOrthoState();
		createListe(s, 'Dictée du 12', [{ mot: 'brouette' }, { mot: 'école' }]);
		addOrGetMot(s, { mot: 'chouette' }); // dans aucune liste → orphelin
		addOrGetMot(s, { mot: 'être' }); // figure dans une prédéfinie → pas orphelin
		return banqueProfil(s, true);
	}

	it('cherche en SOUS-CHAÎNE, pas seulement en début de mot', () => {
		expect(formes(filtrerBanque(entrees(), { recherche: 'ouette' }))).toEqual([
			'brouette',
			'chouette',
		]);
	});

	it('insensible à la casse', () => {
		expect(formes(filtrerBanque(entrees(), { recherche: 'ÉCOLE' }))).toEqual(['école']);
		expect(formes(filtrerBanque(entrees(), { recherche: 'BrOu' }))).toEqual(['brouette']);
	});

	it('insensible aux accents : taper « etre » doit trouver « être »', () => {
		// Sur un clavier tactile, exiger le circonflexe rend la recherche inutile là où
		// elle sert le plus (spec #496).
		expect(formes(filtrerBanque(entrees(), { recherche: 'etre' }))).toEqual(['être']);
		expect(formes(filtrerBanque(entrees(), { recherche: 'ecole' }))).toEqual(['école']);
		// …sans devenir un « tout passe » : la recherche discrimine toujours.
		expect(formes(filtrerBanque(entrees(), { recherche: 'etra' }))).toEqual([]);
		expect(formes(filtrerBanque(entrees(), { recherche: 'être' }))).toEqual(['être']);
	});

	it('replie les ligatures : taper « coeur » doit trouver « cœur »', () => {
		// Piège distinct des accents : NFD ne décompose PAS œ/æ (ce ne sont pas des
		// base + diacritique). Or ces mots sont déjà dans les dictées livrées (« cœur »,
		// « chœur » en homophones CM1) et personne ne tape « œ » sur un clavier tactile.
		const s = emptyOrthoState();
		createListe(s, 'Homophones', [
			{ mot: 'cœur' },
			{ mot: 'chœur' },
			{ mot: 'ex æquo' },
			{ mot: 'courage' },
		]);
		const es = banqueProfil(s, true);
		expect(formes(es)).toEqual(['chœur', 'cœur', 'courage', 'ex æquo']);

		expect(formes(filtrerBanque(es, { recherche: 'coeur' }))).toEqual(['cœur']);
		expect(formes(filtrerBanque(es, { recherche: 'choeur' }))).toEqual(['chœur']);
		expect(formes(filtrerBanque(es, { recherche: 'aequo' }))).toEqual(['ex æquo']);
		// La ligature tapée telle quelle marche aussi (pliage des DEUX côtés).
		expect(formes(filtrerBanque(es, { recherche: 'cœur' }))).toEqual(['cœur']);
		// …et le pliage ne rend pas la recherche floue : « coeur » ne ramène pas « chœur ».
		expect(formes(filtrerBanque(es, { recherche: 'oeuf' }))).toEqual([]);
	});

	it('replier les ligatures concerne la RECHERCHE seule, pas la dédup de la banque', () => {
		// « cœur » et « coeur » sont deux graphies distinctes en banque (un enfant à qui
		// l'on dicte « cœur » doit écrire la ligature) : le pliage ne doit pas les fusionner.
		const s = emptyOrthoState();
		createListe(s, 'Dictée du 12', [{ mot: 'cœur' }, { mot: 'coeur' }]);
		const es = banqueProfil(s, true);

		expect(es).toHaveLength(2);
		expect(formes(filtrerBanque(es, { recherche: 'coeur' }))).toEqual(['coeur', 'cœur']);
	});

	it('replier les accents concerne la RECHERCHE seule, pas la dédup de la banque', () => {
		// Contrôle du bon endroit : si le repli passait par `formeNormalisee`, « cote » et
		// « côté » n'auraient plus qu'UNE entrée en banque — deux mots distincts fusionnés,
		// avec un seul historique de révision.
		const s = emptyOrthoState();
		createListe(s, 'Dictée du 12', [{ mot: 'cote' }, { mot: 'côté' }]);
		const es = banqueProfil(s, true);

		expect(formes(es)).toEqual(['cote', 'côté']); // deux mots, deux entrées
		expect(formes(filtrerBanque(es, { recherche: 'cote' }))).toEqual(['cote', 'côté']);
		expect(formes(filtrerBanque(es, { recherche: 'côté' }))).toEqual(['cote', 'côté']);
	});

	it('recherche vide, absente ou blanche → toute la banque ; sans correspondance → rien', () => {
		const es = entrees();
		expect(filtrerBanque(es)).toHaveLength(es.length);
		expect(filtrerBanque(es, { recherche: '' })).toHaveLength(es.length);
		expect(filtrerBanque(es, { recherche: '   ' })).toHaveLength(es.length);
		expect(filtrerBanque(es, { recherche: 'zorglub' })).toEqual([]);
	});

	it('« orphelins seulement » se combine avec la recherche', () => {
		const es = entrees();
		expect(formes(filtrerBanque(es, { orphelinsSeuls: true }))).toEqual(['chouette']);
		expect(formes(filtrerBanque(es, { orphelinsSeuls: false }))).toHaveLength(es.length);
		expect(formes(filtrerBanque(es, { recherche: 'ouette', orphelinsSeuls: true }))).toEqual([
			'chouette',
		]);
		// La recherche seule ramènerait « brouette », que le filtre orphelins écarte.
		expect(formes(filtrerBanque(es, { recherche: 'brou', orphelinsSeuls: true }))).toEqual([]);
	});
});

/* ============================================================
   6. Proposition de nettoyage après édition d'une liste
   ============================================================ */
describe('motsDevenusOrphelins', () => {
	it('ne propose que les candidats devenus orphelins ET supprimables', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Dictée du 12', [
			{ mot: 'vélo' },
			{ mot: 'train' },
			{ mot: 'brouette' },
			{ mot: MOT_PREDEF },
		]);
		createListe(s, 'Révisions', [{ mot: 'train' }]); // « train » vit aussi ailleurs
		const candidats = [
			s.motIdParForme['vélo'],
			s.motIdParForme['train'],
			s.motIdParForme['brouette'],
			s.motIdParForme[MOT_PREDEF],
		];

		// Le parent ne garde qu'un mot : les trois autres sortent de la liste.
		updateListe(s, liste.id, liste.label, [{ mot: 'vélo' }]);

		const proposes = motsDevenusOrphelins(s, candidats, true);
		expect(formes(proposes)).toEqual(['brouette']); // trié alphabétiquement
		// « vélo » y est resté, « train » vit dans une autre liste, MOT_PREDEF serait
		// recréé par sa leçon prédéfinie (donc ni orphelin ni supprimable).
		expect(proposes.every((e) => e.orphelin && e.supprimable)).toBe(true);
	});

	it('candidat déjà supprimé de la banque, doublons, liste vide → pas de bruit', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Dictée du 12', [{ mot: 'brouette' }, { mot: 'chouette' }]);
		const brouette = s.motIdParForme['brouette'];
		const chouette = s.motIdParForme['chouette'];
		updateListe(s, liste.id, liste.label, []);
		supprimerMot(s, chouette); // déjà nettoyé par un geste précédent

		expect(
			motsDevenusOrphelins(s, [brouette, brouette, chouette, 'id-inexistant'], true).map(
				(e) => e.id,
			),
		).toEqual([brouette]);
		expect(motsDevenusOrphelins(s, [], true)).toEqual([]);
	});

	it('une cible verbe orpheline (verbe retiré de la liste) est proposée', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Verbes du soir', [], undefined, [MANGER]);
		const cibles = poserCibles(s, MANGER, FORMES_MANGER);
		const ids = cibles.map((c) => c.id);

		expect(motsDevenusOrphelins(s, ids, true)).toEqual([]); // le verbe est encore là
		updateListe(s, liste.id, liste.label, []); // le parent retire le verbe
		expect(
			motsDevenusOrphelins(s, ids, true)
				.map((e) => e.id)
				.sort(),
		).toEqual([...ids].sort());
	});

	it('dicteeDispo ne change pas QUI est proposé, mais bien le statut annoncé', () => {
		// Sur un appareil sans voix, la dictée n'est pas exigée pour l'étoile : un mot
		// validé aux tuiles et à l'affiche/masque y est MAÎTRISÉ. Figer `dicteeDispo`
		// afficherait « en cours » à un adulte à qui l'on propose justement de supprimer
		// ce mot — un avancement faux au pire moment.
		const s = emptyOrthoState();
		const liste = createListe(s, 'Dictée du 12', [{ mot: 'brouette' }]);
		const brouette = s.motIdParForme['brouette'];
		marquerAtelierFait(s.banque[brouette]);
		validerMode(s.banque[brouette], 'tuiles');
		validerMode(s.banque[brouette], 'motCache');
		updateListe(s, liste.id, liste.label, []); // le mot sort de sa seule liste

		expect(motsDevenusOrphelins(s, [brouette], true).map((e) => e.statut)).toEqual(['enCours']);
		expect(motsDevenusOrphelins(s, [brouette], false).map((e) => e.statut)).toEqual(['maitrise']);
	});
});

/* ============================================================
   7. Écriture sur le profil CONSULTÉ
   ============================================================ */
describe('saveOrthoFor', () => {
	/** Le profil consulté (`vise`) N'EST PAS l'actif — situation réelle de l'espace encadrant. */
	function deuxProfils(): { vise: Profile; actif: Profile } {
		const vise = activeProfile();
		const actif = addProfile('Profil B'); // devient l'actif
		figer(vise.uuid, SENTINELLE);
		figer(actif.uuid, SENTINELLE);
		return { vise: profil(vise.uuid), actif: profil(actif.uuid) };
	}

	it('aller-retour par UUID, sans écrire chez l’actif ni faire basculer qui que ce soit', () => {
		const { vise, actif } = deuxProfils();
		const s = emptyOrthoState();
		createListe(s, 'Dictée du 12', [{ mot: 'vélo' }]);

		saveOrthoFor(vise.uuid, s);

		const relu = loadOrthoFor(vise.uuid);
		expect(labels(relu.listes)).toEqual(['Dictée du 12']);
		expect(formes(banqueProfil(relu, true))).toEqual(['vélo']);
		expect(relu.motIdParForme).toEqual(s.motIdParForme);

		expect(loadOrtho().listes).toEqual([]); // le profil ACTIF n'a rien reçu
		expect(loadOrtho().banque).toEqual({});
		expect(loadOrthoFor(actif.uuid).listes).toEqual([]);
		expect(loadProfilesMeta()?.active).toBe(actif.uuid); // aucune bascule d'enfant
	});

	it('écriture SILENCIEUSE : elle ne marque pas le profil (c’est à l’appelant de le faire)', () => {
		const { vise, actif } = deuxProfils();

		auMoment(T0, () => saveOrthoFor(vise.uuid, emptyOrthoState()));
		expect(profil(vise.uuid).updatedAt).toBe(SENTINELLE);
		expect(profil(actif.uuid).updatedAt).toBe(SENTINELLE);

		// Contrôle de sensibilité : un geste de l'adulte, lui, marque bien le profil —
		// sinon ce test passerait aussi si plus personne ne bumpait.
		auMoment(T0, () => toggleRevoirFor(vise.uuid, 'math-doubles'));
		expect(profil(vise.uuid).updatedAt).toBe(T0);
	});

	it('geste complet : supprimer un mot chez le profil consulté ne touche pas l’autre', () => {
		const { vise, actif } = deuxProfils();
		for (const uuid of [vise.uuid, actif.uuid]) {
			const s = emptyOrthoState();
			createListe(s, 'Dictée du 12', [{ mot: 'vélo' }, { mot: 'train' }]);
			saveOrthoFor(uuid, s);
		}

		const s = loadOrthoFor(vise.uuid);
		expect(supprimerMot(s, s.motIdParForme['vélo'])).toBe(true);
		saveOrthoFor(vise.uuid, s);

		expect(formes(banqueProfil(loadOrthoFor(vise.uuid), true))).toEqual(['train']);
		expect(formes(banqueProfil(loadOrthoFor(actif.uuid), true))).toEqual(['train', 'vélo']);
		expect(loadOrthoFor(vise.uuid).listes[0].motIds).toHaveLength(1);
	});
});
