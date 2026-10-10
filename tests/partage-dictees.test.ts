/* ============================================================
   Séance partagée par lien (#734), PR 5 : les DICTÉES envoyées par lien
   (`src/core/partage/envoi.ts`, `passage.ts`, `composition.ts`).

   Écrits AVANT l'implémentation, par un auteur distinct, depuis le contrat de la
   PR 5 (arbitrages du mainteneur du 10 octobre 2026), pas depuis le code. Rouges
   tant que le format ne porte pas `lecon`, que `preparerPassage` refuse la dictée
   et que `composerDictee` n'existe pas : c'est attendu.

   Ce qui est tenu ici (versant logique) :
   - format : l'envoi d'une dictée porte FACULTATIVEMENT l'id de sa source
     (`lecon` : dictée prédéfinie, ou UUID d'une liste personnalisée), sous la
     liste blanche des leçons citées par un résultat (motif `[A-Za-z0-9_:.-]`, 1 à
     80 caractères) ; hors motif, le lien est refusé (`schema`). Le format ne
     change pas de version : les liens de référence déjà commités (critère 36),
     sans `lecon`, décodent à l'identique ;
   - passage (critères 14 et 16) : une dictée se joue (plus de refus `format`), un
     item par mot dans l'ordre de l'envoi, chacun avec sa leçon (celle de l'envoi,
     ou `ID_DICTEE_ENVOYEE` à défaut), le mode `dictee`, un énoncé lisible hors de
     l'appli et l'attendu ; préparer n'écrit rien ;
   - composition (critère 39) : libellé contrôlé en premier, puis liste vide, puis
     plus de 60 mots ; ordre des mots conservé ; `niveau` présent seulement s'il
     est fourni ; un envoi composé se joue et voyage, sinon refus `format` chez
     l'encadrant plutôt qu'un lien refusé chez l'enfant.

   Références d'attendu (aucune n'est le code testé) :
   - énoncés écrits à la main d'après le contrat, qui les aligne sur le journal du
     jeu libre (`enonceJournalOrtho(mot, 'dictee')`) : « Mot à écrire sous la
     dictée » pour un mot simple, `avant…apres` pour une cible verbe, jamais le
     « comme dans » ;
   - refus du lien : `decoderEnvoi` nourri d'un JSON forgé (`encoder` du codec) ;
   - liens de référence : les deux codes de `partage-references.test.ts`, recopiés.
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
import type { SchoolLevel } from '../src/core/catalog';
import { ID_DICTEE_ENVOYEE } from '../src/core/orthographe/lessons';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { lsGetItemRaw, lsKeysRaw, setOnDataWrite } from '../src/core/storage';
import { encoder, type Decodage } from '../src/core/partage/codec';
import { composerDictee, type Composition } from '../src/core/partage/composition';
import { decoderEnvoi, encoderEnvoi, type Envoi, type MotDictee } from '../src/core/partage/envoi';
import { preparerPassage, type ItemDictee } from '../src/core/partage/passage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Outils ---------- */

/** Identifiant de 12 caractères base64url, comme ceux du lien (`identifiant`). */
const ID_ENVOI = 'DicteeTest01';
const LIBELLE = 'Dictée de la semaine';
/** Id d'une dictée prédéfinie, cité par le contrat. */
const ID_PREDEFINIE = 'fr-ortho-invariables-1';
/** Id d'une liste personnalisée : un UUID, inconnu du catalogue. */
const UUID_LISTE = '3f2c8a1e-5b7d-4c9a-8e2f-1a2b3c4d5e6f';

/** Un mot de chaque forme, dans un ordre NON alphabétique (un tri se verrait) : mot
 *  simple, mot avec « comme dans », cible verbe avec sa phrase à trou (espace initial
 *  de `apres` compris), mot à apostrophe droite. */
const MOTS: MotDictee[] = [
	{ mot: 'bateau' },
	{ mot: 'mer', commeDans: 'la mer est bleue' },
	{ mot: 'mangeons', contexte: { avant: 'nous', apres: ' une pomme' } },
	{ mot: "aujourd'hui" },
];

const ENONCE_MOT = 'Mot à écrire sous la dictée';

function dictee(o: { lecon?: string; niveau?: SchoolLevel; mots?: MotDictee[] } = {}): Envoi {
	return {
		id: ID_ENVOI,
		libelle: LIBELLE,
		nature: 'dictee',
		...(o.niveau !== undefined ? { niveau: o.niveau } : {}),
		...(o.lecon !== undefined ? { lecon: o.lecon } : {}),
		mots: o.mots ?? MOTS,
	};
}

const verdict = (d: Decodage<unknown>): string => (d.ok ? 'accepté' : `refusé (${d.raison})`);

/** Décode un JSON FORGÉ à la main : ce qu'un lien trafiqué ferait arriver chez l'enfant. */
async function ouvrirForge(json: Record<string, unknown>): Promise<Decodage<Envoi>> {
	return decoderEnvoi(await encoder('envoi', json));
}

/** Une dictée valide sous forme JSON, à compléter par le champ éprouvé. */
function jsonDictee(extra: Record<string, unknown>): Record<string, unknown> {
	return {
		id: ID_ENVOI,
		libelle: LIBELLE,
		nature: 'dictee',
		niveau: 'ce2',
		mots: [{ mot: 'bateau' }],
		...extra,
	};
}

/** Items de dictée d'un envoi qui DOIT se jouer. Échoue (avec la raison) sur un refus. */
function itemsDictee(envoi: Envoi): ItemDictee[] {
	const p = preparerPassage(envoi);
	expect(p.ok ? 'joué' : `refusé (${p.raison})`, 'une dictée se joue depuis le lien').toBe('joué');
	if (!p.ok) throw new Error('inatteignable');
	expect(p.envoi, 'le passage porte l’envoi tel quel').toEqual(envoi);
	expect(p.blocs, 'une dictée n’a aucun bloc de fiche').toEqual([]);
	expect(p.dictee, 'les items de la dictée').toBeDefined();
	return p.dictee ?? [];
}

/** Toutes les clés réelles du stockage et leur valeur brute. */
function instantane(): Map<string, string> {
	const m = new Map<string, string>();
	for (const k of lsKeysRaw()) m.set(k, lsGetItemRaw(k) ?? '');
	return m;
}

function clesModifiees(avant: Map<string, string>, apres: Map<string, string>): string[] {
	const cles = new Set<string>([...avant.keys(), ...apres.keys()]);
	return [...cles].filter((k) => avant.get(k) !== apres.get(k)).sort();
}

/** `n` mots distincts, en lettres seules (la liste blanche des mots refuse les chiffres). */
function motsNumerotes(n: number): MotDictee[] {
	return Array.from({ length: n }, (_, i) => ({
		mot: 'mot' + String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26)),
	}));
}

/* ============================================================
   §1 Format : `lecon`, facultatif, sous liste blanche
   ============================================================ */

describe('format : une dictée porte l’id de sa source (`lecon`, facultatif)', () => {
	it.each<[string, Envoi]>([
		['dictée prédéfinie (son id, niveau ce2)', dictee({ lecon: ID_PREDEFINIE, niveau: 'ce2' })],
		['liste personnalisée (UUID, sans niveau)', dictee({ lecon: UUID_LISTE })],
		['sans `lecon`, niveau ce2 (lien d’avant la PR 5)', dictee({ niveau: 'ce2' })],
		['sans `lecon` ni niveau (lien d’avant la PR 5)', dictee()],
	])('aller-retour du lien à l’identique : %s', async (_cas, envoi) => {
		expect(await decoderEnvoi(await encoderEnvoi(envoi))).toEqual({ ok: true, valeur: envoi });
	});

	/* Chaque refus est apparié à l'acceptation d'un `lecon` valide dans le MÊME envoi :
	   un refus seul ne prouverait rien tant que la clé est inconnue du schéma (elle
	   serait refusée comme « champ inconnu », quelle que soit sa valeur). */
	it.each<[string, string, string]>([
		['espace', ID_PREDEFINIE, 'a b'],
		['chevrons', ID_PREDEFINIE, '<x>'],
		['chaîne vide', ID_PREDEFINIE, ''],
		['81 caractères (80 passent)', 'a'.repeat(80), 'a'.repeat(81)],
	])('`lecon` hors motif refusé en `schema` : %s', async (_cas, valide, invalide) => {
		expect(
			verdict(await ouvrirForge(jsonDictee({ lecon: valide }))),
			`témoin : « ${valide} » est un id de source valide`,
		).toBe('accepté');
		expect(
			verdict(await ouvrirForge(jsonDictee({ lecon: invalide }))),
			`« ${invalide} » ne doit pas passer`,
		).toBe('refusé (schema)');
	});

	it.each([
		{
			nom: 'dictée prédéfinie (niveau ce2, mot avec commeDans)',
			json: {
				id: 'dictee-ce2-3',
				libelle: 'Dictée de la semaine',
				nature: 'dictee',
				niveau: 'ce2',
				mots: [
					{ mot: 'bateau' },
					{ mot: 'mer', commeDans: 'la mer est bleue' },
					{ mot: "aujourd'hui" },
					{ mot: 'arc-en-ciel' },
				],
			},
			code: 'AUUxvEYwTcs9DsIwFAPgq0ReWJKlbJl7C8TwmljioSSV8sNS9UCcg4uhDqBu1md7g0Z4RA2ddIGTu8Ii6cKUCI9ZQ_-8aSJNEtOYRQthUaSPyv_zEH1RBjwCJ1jktTf423YEeCzSj3a3P8issAhrzpylNHgkMZnVsHWzJA6exjKe66jx8hh61hociwvKhP2-fwE',
		},
		{
			nom: 'dictée personnalisée (sans niveau, verbe en contexte)',
			json: {
				id: 'perso-Verbes',
				libelle: 'Mes verbes',
				nature: 'dictee',
				mots: [
					{ mot: 'mangeons', contexte: { avant: 'nous', apres: ' une pomme' } },
					{ mot: 'finissaient', contexte: { avant: 'ils', apres: ' leurs devoirs' } },
					{ mot: 'jardin' },
				],
			},
			code: 'AUX_qFwodYwxCgIxFESvEqZeL5A72NqIRdYd5Uvys-Qni7Dk7pJiQQu74b3h7ZAFHiuL5dOFZaZhQpSZMRIeZ5rbDqyhtjLoIvdKYkLK1eCv-xjwSEGfzDq-96yV70r4HWELOrTmNlRYCw0erindmlMiep-OxkNUzIJQ65-MxJ9KZCvmFm5Zin2XXqEsoui3_gE',
		},
	])(
		'critère 36 : le lien de référence « $nom » (sans `lecon`) décode à l’identique',
		async ({ json, code }) => {
			expect(await decoderEnvoi(code)).toEqual({ ok: true, valeur: json });
		},
	);
});

/* ============================================================
   §2 Passage : la dictée se joue, un item par mot
   ============================================================ */

describe('passage : une dictée se joue depuis un lien (critère 14)', () => {
	it.each<[string, { lecon?: string; niveau?: SchoolLevel }, string]>([
		[
			'dictée prédéfinie : la leçon est l’id de l’envoi',
			{ lecon: ID_PREDEFINIE, niveau: 'ce2' },
			ID_PREDEFINIE,
		],
		[
			'liste personnalisée : son UUID, inconnu du catalogue, n’est pas refusé en `lecon`',
			{ lecon: UUID_LISTE },
			UUID_LISTE,
		],
		['lien sans `lecon`, niveau ce2 : ID_DICTEE_ENVOYEE', { niveau: 'ce2' }, ID_DICTEE_ENVOYEE],
		['lien sans `lecon` ni niveau : ID_DICTEE_ENVOYEE', {}, ID_DICTEE_ENVOYEE],
	])('%s', (_cas, o, lecon) => {
		const items = itemsDictee(dictee(o));
		// Sans cette garde, un `undefined` attendu et un `undefined` obtenu se valideraient.
		expect(typeof lecon, 'précondition : id de leçon attendu exporté').toBe('string');
		const capture = (enonce: string, attendue: string) => ({
			lecon,
			mode: 'dictee',
			enonce,
			attendue,
		});
		// « mer » : le « comme dans » reste sur le mot (la voix le dit), jamais dans
		// l'énoncé du résultat (parité avec le journal du jeu libre).
		expect(items).toEqual([
			{ mot: MOTS[0], capture: capture(ENONCE_MOT, 'bateau') },
			{ mot: MOTS[1], capture: capture(ENONCE_MOT, 'mer') },
			{ mot: MOTS[2], capture: capture('nous… une pomme', 'mangeons') },
			{ mot: MOTS[3], capture: capture(ENONCE_MOT, "aujourd'hui") },
		]);
	});

	it('critère 16 : préparer une dictée n’écrit rien dans le stockage', () => {
		const avant = instantane();
		expect(itemsDictee(dictee({ lecon: UUID_LISTE })).length, 'un item par mot').toBe(MOTS.length);
		expect(clesModifiees(avant, instantane()), 'clés écrites par la préparation').toEqual([]);
	});
});

/* ============================================================
   §4 Composition : composerDictee
   ============================================================ */

type OptionsDictee = Parameters<typeof composerDictee>[0];

function composer(o: Partial<OptionsDictee> = {}): Composition {
	return composerDictee({ mots: MOTS, lecon: ID_PREDEFINIE, libelle: LIBELLE, id: ID_ENVOI, ...o });
}

const LIBELLE_INVALIDE = 'Dictée <b>';

describe('composition : composerDictee (critère 39)', () => {
	it.each<[string, MotDictee[]]>([
		['mots valides', MOTS],
		['aucun mot', []],
		['61 mots', motsNumerotes(61)],
	])('libellé hors liste blanche → `libelle`, contrôlé en premier (%s)', (_cas, mots) => {
		expect(composer({ libelle: LIBELLE_INVALIDE, mots })).toEqual({
			ok: false,
			raison: 'libelle',
		});
	});

	it('aucun mot → `vide`', () => {
		expect(composer({ mots: [] })).toEqual({ ok: false, raison: 'vide' });
	});

	it('61 mots → `trop-grand` ; 60 passent', () => {
		expect(composer({ mots: motsNumerotes(61) })).toEqual({ ok: false, raison: 'trop-grand' });
		const soixante = composer({ mots: motsNumerotes(60) });
		expect(soixante.ok ? 'composé' : `refusé (${soixante.raison})`, '60 mots').toBe('composé');
	});

	const CAS_COMPOSES: [string, Partial<OptionsDictee>, Envoi][] = [
		[
			'dictée prédéfinie, niveau ce2',
			{ lecon: ID_PREDEFINIE, niveau: 'ce2' },
			{
				id: ID_ENVOI,
				libelle: LIBELLE,
				nature: 'dictee',
				lecon: ID_PREDEFINIE,
				niveau: 'ce2',
				mots: MOTS,
			},
		],
		[
			'liste personnalisée, sans niveau',
			{ lecon: UUID_LISTE },
			{ id: ID_ENVOI, libelle: LIBELLE, nature: 'dictee', lecon: UUID_LISTE, mots: MOTS },
		],
	];

	it.each(CAS_COMPOSES)(
		'envoi composé exact, ordre des mots conservé : %s',
		(_cas, options, attendu) => {
			const c = composer(options);
			expect(c).toEqual({ ok: true, envoi: attendu });
			if (!c.ok) throw new Error('inatteignable');
			expect('niveau' in c.envoi, 'clé `niveau` présente').toBe('niveau' in attendu);
		},
	);

	it('`niveau: undefined` passé explicitement : pas de clé `niveau` dans l’envoi', () => {
		const c = composer({ lecon: UUID_LISTE, niveau: undefined });
		if (!c.ok) throw new Error(`refusé (${c.raison})`);
		expect('niveau' in c.envoi).toBe(false);
	});

	it.each(CAS_COMPOSES)(
		'l’envoi composé se joue et fait l’aller-retour du lien : %s',
		async (_cas, options) => {
			const c = composer(options);
			if (!c.ok) throw new Error(`refusé à la composition (${c.raison})`);
			expect(itemsDictee(c.envoi).map((i) => i.mot)).toEqual(MOTS);
			expect(await decoderEnvoi(await encoderEnvoi(c.envoi))).toEqual({
				ok: true,
				valeur: c.envoi,
			});
		},
	);

	it.each<[string, Partial<OptionsDictee>]>([
		['un mot hors liste blanche (« a<b »)', { mots: [{ mot: 'bateau' }, { mot: 'a<b' }] }],
		['un `lecon` hors motif (« a b »)', { lecon: 'a b' }],
	])(
		'ce qui ne voyagerait pas est refusé chez l’encadrant (`format`), pas chez l’enfant : %s',
		(_cas, options) => {
			expect(composer(options)).toEqual({ ok: false, raison: 'format' });
		},
	);
});
