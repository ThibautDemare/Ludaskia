/* ============================================================
   Séance partagée par lien (#734), PR 5 : d'où viennent les mots d'une dictée
   envoyée (`src/core/partage/dictees.ts`), et le libellé qui remplace l'id d'une
   liste introuvable (`libelleOrthoIntrouvable`, `src/core/orthographe/lessons.ts`).

   Écrits AVANT l'implémentation, par un auteur distinct, depuis le contrat de la
   PR 5 (§3 et §5, arbitrages du mainteneur du 10 octobre 2026), pas depuis le code.
   Rouges tant que `dictees.ts` n'existe pas et que `lessons.ts` n'exporte ni
   `libelleOrthoIntrouvable`, ni `LABEL_LISTE_ABSENTE`, ni `ID_DICTEE_ENVOYEE` :
   c'est attendu.

   Ce qui est tenu ici (versant logique) :
   - critère 1 : une dictée part par lien, depuis une dictée proposée (TOUS ses mots,
     « comme dans » compris) ou depuis une liste du profil (ses mots, puis ses
     verbes conjugués en phrase à trou) ;
   - critère 39 : chaque mot passe la liste blanche du lien (`motDictee`,
     `commeDans`, `avantVerbe`, `apresVerbe` de `textes.ts`) APRÈS une mise en forme
     qui ne doit pas faire perdre un mot légitime : NFC, apostrophes typographiques
     ramenées à la droite (celle du clavier, choix acté du projet), rognage. Un mot
     refusé est NOMMÉ à l'adulte (`ecartes`), pas perdu en silence ; un verbe qu'on
     n'a pas pu conjuguer aussi (`nonConjugues`, §10 du contrat), sans faire tomber
     les autres ;
   - arbitrage du mainteneur : là où un id de liste ne se résout pas (journal de
     l'encadrant, vue de résultat), un libellé lisible remplace l'UUID.

   Références d'attendu (aucune n'est le code testé) :
   - les mots des dictées proposées : `ORTHO_PREDEF`, les données elles-mêmes ;
   - les formes conjuguées : écrites à la main (aimer au présent : j'aime, nous
     aimons) ; le pronom affiché : `displayPronoun`, la fonction qui fait foi pour
     la phrase à trou de toute cible verbe ;
   - les formes refusées : les listes blanches de `textes.ts`, lues à la main
     (« 1er » a un chiffre, « M. » un point, « ! » n'est pas dans un complément).
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
import { getAllLessons, getLessonById } from '../src/core/catalog';
import {
	ID_DICTEE_ENVOYEE,
	LABEL_LISTE_ABSENTE,
	libelleOrthoIntrouvable,
} from '../src/core/orthographe/lessons';
import { createListe, emptyOrthoState, saveOrtho } from '../src/core/orthographe/store';
import type { OrthoState, VerbeConfig } from '../src/core/orthographe/types';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { lsGetItemRaw, lsKeysRaw, setOnDataWrite } from '../src/core/storage';
import { displayPronoun } from '../src/data/francais/conjugaison';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import type { MotDictee } from '../src/core/partage/envoi';
import { LONGUEUR_MAX_MOT } from '../src/core/partage/textes';
import {
	dicteePredefinie,
	dicteesPredefinies,
	motDicteeDepuis,
	motsDicteeListe,
} from '../src/core/partage/dictees';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Outils ---------- */

/** Entrée de `motDicteeDepuis`, recopiée du contrat. */
interface EntreeMot {
	mot: string;
	commeDans?: string;
	contexte?: { avant: string; apres: string };
}

function instantane(): Map<string, string> {
	const m = new Map<string, string>();
	for (const k of lsKeysRaw()) m.set(k, lsGetItemRaw(k) ?? '');
	return m;
}

function clesModifiees(avant: Map<string, string>, apres: Map<string, string>): string[] {
	const cles = new Set<string>([...avant.keys(), ...apres.keys()]);
	return [...cles].filter((k) => avant.get(k) !== apres.get(k)).sort();
}

/** Ce que les DONNÉES disent d'un mot, sous sa forme de mot de dictée : la forme, et le
 *  « comme dans » s'il y en a un. Le drapeau `homophone` des données ne voyage pas : un
 *  `MotDictee` n'en a pas. */
function motDesDonnees(mi: { mot: string; commeDans?: string }): MotDictee {
	return mi.commeDans ? { mot: mi.mot, commeDans: mi.commeDans } : { mot: mi.mot };
}

/** Aimer au présent, je et nous, avec un complément : l'initiale voyelle donne l'élision
 *  « j' », qui doit passer la liste blanche du pronom. */
const AIMER: VerbeConfig = {
	kind: 'verbe',
	infinitif: 'aimer',
	pronoms: [0, 3],
	temps: ['present'],
	complement: 'les fraises',
};

/** Une liste de parent réaliste : un mot simple, deux formes que le lien refuse (« 1er »,
 *  « M. »), un homographe avec son « comme dans », un mot tapé sur un clavier de
 *  téléphone (apostrophe typographique), et un verbe. */
function listeDeJeudi(): { state: OrthoState; id: string } {
	const state = emptyOrthoState();
	const liste = createListe(
		state,
		'Les mots de jeudi',
		[
			{ mot: 'ainsi' },
			{ mot: '1er' },
			{ mot: 'sort', commeDans: 'jeter un sort' },
			{ mot: 'aujourd’hui' },
			{ mot: 'M.' },
			{ mot: 'chez' },
		],
		undefined,
		[AIMER],
	);
	return { state, id: liste.id };
}

/* ============================================================
   §3 motDicteeDepuis : un mot sous la liste blanche du lien
   ============================================================ */

describe('motDicteeDepuis : mise en forme puis liste blanche', () => {
	it('un mot simple ressort tel quel, sans aucune autre clé', () => {
		expect(motDicteeDepuis({ mot: 'ainsi' })).toStrictEqual({ mot: 'ainsi' });
	});

	const APOSTROPHES: [string, string][] = [
		['’ (U+2019, celle des claviers de téléphone)', '’'],
		['‘ (U+2018)', '‘'],
		['ʼ (U+02BC, une LETTRE : elle passerait la liste blanche sans être convertie)', 'ʼ'],
	];

	it.each(APOSTROPHES)(
		'apostrophe %s ramenée à la droite dans le mot et le « comme dans »',
		(_, a) => {
			expect(
				motDicteeDepuis({ mot: `aujourd${a}hui`, commeDans: `le temps qu${a}il fait` }),
			).toStrictEqual({ mot: "aujourd'hui", commeDans: "le temps qu'il fait" });
		},
	);

	it.each(APOSTROPHES)('apostrophe %s ramenée à la droite dans la phrase à trou', (_, a) => {
		expect(
			motDicteeDepuis({ mot: 'aime', contexte: { avant: `j${a}`, apres: ` l${a}école` } }),
		).toStrictEqual({ mot: 'aime', contexte: { avant: "j'", apres: " l'école" } });
	});

	it('NFC : une forme décomposée (lettre + accent combinant) revient composée, mot et « comme dans »', () => {
		// La forme décomposée passe la liste blanche telle quelle (\p{M} y est admis) : seule
		// la normalisation la ramène à ce que l'enfant tape, « déjà » en 4 caractères.
		expect(motDicteeDepuis({ mot: 'déjà', commeDans: 'un vélo' })).toStrictEqual({
			mot: 'déjà',
			commeDans: 'un vélo',
		});
	});

	it('rogne le mot et le « comme dans » (espaces, tabulation, saut de ligne)', () => {
		expect(motDicteeDepuis({ mot: '  ainsi\t', commeDans: '\n jeter un sort  ' })).toStrictEqual({
			mot: 'ainsi',
			commeDans: 'jeter un sort',
		});
	});

	it(`borne : ${LONGUEUR_MAX_MOT} lettres passent, et le rognage précède le contrôle de longueur`, () => {
		const long = 'a'.repeat(LONGUEUR_MAX_MOT);
		expect(motDicteeDepuis({ mot: `  ${long}  ` })).toStrictEqual({ mot: long });
	});

	it.each([
		['vide', ''],
		["fait d'espaces", '   '],
	])('« comme dans » %s : la clé est ABSENTE (ni vide, ni undefined)', (_, cd) => {
		const r = motDicteeDepuis({ mot: 'ainsi', commeDans: cd });
		expect(r).not.toBeNull();
		expect(r !== null && 'commeDans' in r).toBe(false);
		expect(r).toStrictEqual({ mot: 'ainsi' });
	});

	it('jamais de clé valant undefined, même quand l’appelant en passe', () => {
		const r = motDicteeDepuis({ mot: 'ainsi', commeDans: undefined, contexte: undefined });
		expect(r === null ? null : Object.keys(r)).toEqual(['mot']);
	});

	it('phrase à trou gardée telle quelle : espace final du pronom, espace initial du complément', () => {
		expect(
			motDicteeDepuis({ mot: 'mangeons', contexte: { avant: 'nous ', apres: ' une pomme' } }),
		).toStrictEqual({ mot: 'mangeons', contexte: { avant: 'nous ', apres: ' une pomme' } });
	});

	it('phrase à trou sans complément (verbe sans complément) : gardée, `apres` vide', () => {
		expect(motDicteeDepuis({ mot: 'mange', contexte: { avant: 'il ', apres: '' } })).toStrictEqual({
			mot: 'mange',
			contexte: { avant: 'il ', apres: '' },
		});
	});

	const REFUS: [string, EntreeMot][] = [
		['un chevron dans le mot', { mot: 'a<b' }],
		['un chiffre dans le mot', { mot: '1er' }],
		['un point dans le mot', { mot: 'M.' }],
		['un mot vide', { mot: '' }],
		["un mot fait d'espaces", { mot: '   ' }],
		[`un mot de ${LONGUEUR_MAX_MOT + 1} lettres`, { mot: 'a'.repeat(LONGUEUR_MAX_MOT + 1) }],
		['un « comme dans » hors liste blanche', { mot: 'sort', commeDans: 'jeter un <b>sort</b>' }],
		['un pronom hors liste blanche', { mot: 'mange', contexte: { avant: 'il2 ', apres: '' } }],
		[
			'un complément hors liste blanche',
			{ mot: 'mangeons', contexte: { avant: 'nous ', apres: ' une pomme !' } },
		],
	];

	it.each(REFUS)('refus : %s → null (le mot entier, pas seulement le champ fautif)', (_, m) => {
		expect(motDicteeDepuis(m)).toBeNull();
	});
});

/* ============================================================
   §3 dicteesPredefinies / dicteePredefinie : les dictées proposées
   ============================================================ */

describe('dicteesPredefinies : toutes les dictées proposées, mot pour mot', () => {
	it('autant de dictées que les données, dans le même ordre, mêmes id / libellé / niveau', () => {
		expect(dicteesPredefinies().map(({ id, label, niveau }) => ({ id, label, niveau }))).toEqual(
			ORTHO_PREDEF.map(({ id, label, niveau }) => ({ id, label, niveau })),
		);
	});

	it('chaque dictée porte exactement les mots des données, dans leur ordre, « comme dans » compris', () => {
		const parId = new Map(dicteesPredefinies().map((d) => [d.id, d.mots]));
		for (const l of ORTHO_PREDEF) {
			expect(parId.get(l.id), l.id).toStrictEqual(l.mots.map(motDesDonnees));
		}
	});

	it('repère lisible : les homophones CM1 gardent leur « comme dans », sans le drapeau homophone', () => {
		const d = dicteesPredefinies().find((x) => x.id === 'fr-ortho-cm1-homophones');
		expect(d?.mots.slice(0, 2)).toStrictEqual([
			{ mot: 'verre', commeDans: 'boire dans un verre' },
			{ mot: 'ver', commeDans: 'un ver de terre' },
		]);
	});
});

describe('dicteePredefinie : une dictée proposée par son id', () => {
	it('pour CHAQUE id des données, la dictée et tous ses mots', () => {
		for (const l of ORTHO_PREDEF) {
			const d = dicteePredefinie(l.id);
			expect(d === null ? null : { id: d.id, label: d.label, niveau: d.niveau }, l.id).toEqual({
				id: l.id,
				label: l.label,
				niveau: l.niveau,
			});
			expect(d?.mots, l.id).toStrictEqual(l.mots.map(motDesDonnees));
		}
	});

	it.each(['inconnue', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty'])(
		'id « %s » → null (ni dictée, ni propriété héritée d’un objet)',
		(id) => {
			expect(dicteePredefinie(id)).toBeNull();
		},
	);
});

/* ============================================================
   §3 motsDicteeListe : une liste personnalisée du profil
   ============================================================ */

describe('motsDicteeListe : les mots d’une liste du profil, prêts pour le lien', () => {
	it('rend le libellé de la liste', async () => {
		const { state, id } = listeDeJeudi();
		expect((await motsDicteeListe(state, id))?.label).toBe('Les mots de jeudi');
	});

	it('mots simples dans l’ordre de la liste, PUIS les cibles verbe (pronom, forme, complément)', async () => {
		const { state, id } = listeDeJeudi();
		expect((await motsDicteeListe(state, id))?.mots).toStrictEqual([
			{ mot: 'ainsi' },
			{ mot: 'sort', commeDans: 'jeter un sort' },
			// Tapé « aujourd’hui » par le parent : converti, pas écarté.
			{ mot: "aujourd'hui" },
			{ mot: 'chez' },
			// j'aime les fraises / nous aimons les fraises.
			{ mot: 'aime', contexte: { avant: displayPronoun(0, 'aime'), apres: ' les fraises' } },
			{ mot: 'aimons', contexte: { avant: displayPronoun(3, 'aimons'), apres: ' les fraises' } },
		]);
	});

	it('les formes refusées par la liste blanche sont NOMMÉES, dans l’ordre de la liste', async () => {
		const { state, id } = listeDeJeudi();
		expect((await motsDicteeListe(state, id))?.ecartes).toEqual(['1er', 'M.']);
	});

	it('une cible verbe au complément hors liste blanche est écartée, sous sa forme', async () => {
		const state = emptyOrthoState();
		const liste = createListe(state, 'Verbes', [{ mot: 'ainsi' }], undefined, [
			{ ...AIMER, complement: 'les fraises !' },
		]);
		const r = await motsDicteeListe(state, liste.id);
		expect(r?.mots).toStrictEqual([{ mot: 'ainsi' }]);
		expect(r?.ecartes).toEqual(['aime', 'aimons']);
	});

	it('un verbe absent du lexique est NOMMÉ dans nonConjugues ; ses cibles ne sont ni dans mots ni dans ecartes', async () => {
		const state = emptyOrthoState();
		const liste = createListe(state, 'Verbes', [{ mot: 'ainsi' }], undefined, [
			{ kind: 'verbe', infinitif: 'xyzzer', pronoms: [0, 3], temps: ['present'] },
			AIMER,
		]);
		const r = await motsDicteeListe(state, liste.id);
		expect(r?.nonConjugues).toEqual(['xyzzer']);
		// Le verbe réel, lui, est bien là : un verbe inconnu ne fait pas tomber ses voisins.
		expect(r?.mots).toStrictEqual([
			{ mot: 'ainsi' },
			{ mot: 'aime', contexte: { avant: displayPronoun(0, 'aime'), apres: ' les fraises' } },
			{ mot: 'aimons', contexte: { avant: displayPronoun(3, 'aimons'), apres: ' les fraises' } },
		]);
		expect(r?.ecartes).toEqual([]);
	});

	it('nonConjugues suit l’ordre de la liste, sans doublon (un même infinitif configuré deux fois)', async () => {
		const state = emptyOrthoState();
		const liste = createListe(state, 'Verbes', [], undefined, [
			{ kind: 'verbe', infinitif: 'xyzzer', pronoms: [0], temps: ['present'] },
			AIMER,
			{ kind: 'verbe', infinitif: 'zzqwer', pronoms: [1], temps: ['present'] },
			{ kind: 'verbe', infinitif: 'xyzzer', pronoms: [3], temps: ['present'] },
		]);
		expect((await motsDicteeListe(state, liste.id))?.nonConjugues).toEqual(['xyzzer', 'zzqwer']);
	});

	it('une liste sans verbe inconnu rend nonConjugues vide (avec ou sans verbe)', async () => {
		const { state, id } = listeDeJeudi();
		expect((await motsDicteeListe(state, id))?.nonConjugues).toEqual([]);
		const sansVerbe = createListe(state, 'Sans verbe', [{ mot: 'hier' }]);
		expect((await motsDicteeListe(state, sansVerbe.id))?.nonConjugues).toEqual([]);
	});

	it.each([
		['un id inconnu', 'pas-une-liste'],
		['un UUID qui n’est pas une liste de cet état', '3f2c9a1e-7b4d-4c2a-9e8f-0123456789ab'],
		['l’id d’une dictée proposée (pas une liste du profil)', 'fr-ortho-invariables-1'],
	])('%s → null', async (_, id) => {
		const { state } = listeDeJeudi();
		expect(await motsDicteeListe(state, id)).toBeNull();
	});

	it('n’écrit RIEN dans le stockage (l’état passé peut changer, pas ce qui est sauvegardé)', async () => {
		const { state, id } = listeDeJeudi();
		saveOrtho(state);
		// Un changement EN MÉMOIRE, jamais sauvegardé : une sauvegarde pendant l'appel l'écrirait,
		// que l'appel matérialise les cibles verbe dans cet état ou dans une copie.
		createListe(state, 'Brouillon', [{ mot: 'hier' }]);
		const avant = instantane();
		await motsDicteeListe(state, id);
		expect(clesModifiees(avant, instantane()), 'clés écrites par l’appel').toEqual([]);
	});
});

/* ============================================================
   §5 libelleOrthoIntrouvable : un libellé à la place d'un id de liste
   ============================================================ */

describe('libelleOrthoIntrouvable : un libellé pour l’adulte, jamais l’UUID', () => {
	const REPLI_12 = 'o' + 'k3x9'.repeat(3);

	it.each([
		['un UUID tiré par crypto.randomUUID()', crypto.randomUUID()],
		['un UUID écrit à la main', '3f2c9a1e-7b4d-4c2a-9e8f-0123456789ab'],
		['le repli « o » + 12 caractères', REPLI_12],
		['le repli « o » + 14 caractères', REPLI_12 + 'z0'],
		['le repli « o » + 12 chiffres', 'o' + '0123456789'.repeat(2).slice(0, 12)],
	])('%s → LABEL_LISTE_ABSENTE', (_, id) => {
		expect(libelleOrthoIntrouvable(id)).toBe(LABEL_LISTE_ABSENTE);
	});

	it('l’id des dictées envoyées sans source → LABEL_LISTE_ABSENTE', () => {
		expect(libelleOrthoIntrouvable(ID_DICTEE_ENVOYEE)).toBe(LABEL_LISTE_ABSENTE);
	});

	it('un id de leçon du catalogue → null', () => {
		expect(getLessonById('fr-conj-etre-present'), 'précondition : la leçon existe').toBeDefined();
		expect(libelleOrthoIntrouvable('fr-conj-etre-present')).toBeNull();
	});

	it('AUCUN id du catalogue n’est pris pour une liste', () => {
		const pris = getAllLessons()
			.map((l) => l.id)
			.filter((id) => libelleOrthoIntrouvable(id) !== null);
		expect(pris).toEqual([]);
	});

	it('AUCUN id de dictée proposée n’est pris pour une liste', () => {
		expect(ORTHO_PREDEF.map((l) => l.id)).toContain('fr-ortho-invariables-1');
		const pris = ORTHO_PREDEF.map((l) => l.id).filter((id) => libelleOrthoIntrouvable(id) !== null);
		expect(pris).toEqual([]);
	});

	it.each([
		['un UUID en majuscules', '3F2C9A1E-7B4D-4C2A-9E8F-0123456789AB'],
		['un UUID tronqué (11 chiffres au dernier groupe)', '3f2c9a1e-7b4d-4c2a-9e8f-0123456789a'],
		['un UUID précédé de texte', 'x3f2c9a1e-7b4d-4c2a-9e8f-0123456789ab'],
		['un UUID suivi de texte', '3f2c9a1e-7b4d-4c2a-9e8f-0123456789ab-x'],
		['« o » + 11 caractères', REPLI_12.slice(0, 12)],
		['« o » + 12 caractères dont une majuscule', 'o' + 'k3X9'.repeat(3)],
		['un texte quelconque', 'bonjour'],
		['la chaîne vide', ''],
	])('%s → null', (_, id) => {
		expect(libelleOrthoIntrouvable(id)).toBeNull();
	});

	it('LABEL_LISTE_ABSENTE est un texte pour l’adulte : ni UUID, ni id, et pas pris lui-même pour un id', () => {
		expect(LABEL_LISTE_ABSENTE.trim()).not.toBe('');
		expect(LABEL_LISTE_ABSENTE).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
		expect(LABEL_LISTE_ABSENTE).not.toContain(ID_DICTEE_ENVOYEE);
		// Pas un identifiant : des mots séparés d'espaces, hors du motif des leçons citées.
		expect(LABEL_LISTE_ABSENTE).not.toMatch(/^[A-Za-z0-9_:.-]+$/);
		expect(LABEL_LISTE_ABSENTE).toMatch(/\p{L}+ \p{L}+/u);
		expect(libelleOrthoIntrouvable(LABEL_LISTE_ABSENTE)).toBeNull();
	});
});
