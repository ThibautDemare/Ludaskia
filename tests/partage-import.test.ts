/* ============================================================
   Séance partagée par lien (#734) — l'IMPORT d'un résultat dans le suivi d'un
   profil, depuis l'espace encadrant (`src/core/partage/import.ts`).

   Écrits AVANT l'implémentation, par un auteur distinct, depuis les critères de
   l'issue et le contrat du module. Rouges tant que le module n'existe pas.

   Critères tenus ici (versant logique) :
   - 19 : le profil présélectionné est celui dont le nom correspond au pseudo,
     casse, accents et espaces de bord ignorés, sans correspondance partielle ;
   - 20 : le profil créé est un profil ordinaire, nommé du pseudo, dont la classe
     est celle de l'ENVOI (vide s'il n'en a pas), jamais celle du profil actif ;
   - 21 : les erreurs du résultat (faux et « je ne sais pas ») arrivent dans le
     journal du profil choisi, datées du passage, avec une entrée d'activité
     « partage » — y compris quand ce profil n'est pas l'actif, et même si son
     journal est plein ;
   - 22 : un même résultat ne s'importe qu'une fois par profil, y compris quand il
     est le premier passage que ce profil a joué sur cet appareil ; la mémoire des
     imports est bornée (`MAX_IMPORTS_RETENUS`) et survit à une valeur corrompue ;
   - 26 : rien d'autre ne bouge dans le stockage (instantané complet) ; une
     écriture refusée (quota) défait tout l'import, et un nouvel essai ne double rien.

   Les attendus sont écrits à la main, depuis le contrat : jamais recopiés d'une
   sortie du module. L'horloge est figée puis AVANCÉE avant chaque import : une
   date prise sur `Date.now()` au lieu de `r.date`, ou un `updatedAt` touché par
   erreur, se voit donc à coup sûr.
   ============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	chargerErreursFor,
	ERREURS_KEY,
	MAX_ERREURS,
	type ErreurEntry,
} from '../src/core/erreurs-journal';
import {
	ACTIVITY_KEY,
	getXP,
	loadActivity,
	normalizeActivity,
	XP_KEY,
	type ActivityEntry,
} from '../src/core/progress';
import {
	activeProfile,
	addProfile,
	getXPFor,
	initProfiles,
	listProfiles,
	setActiveProfile,
	setNiveauReference,
	touchActiveProfile,
	type Profile,
	type ProfilesMeta,
} from '../src/core/profiles';
import {
	lsGetItemRaw,
	lsGetRaw,
	lsKeysRaw,
	lsSetRaw,
	PROFILES_KEY,
	setOnDataWrite,
} from '../src/core/storage';
import { nouvelleCapture, noterReponse, type Capture } from '../src/core/partage/capture';
import type { Envoi } from '../src/core/partage/envoi';
import { changerPseudo, MODE_PARTAGE, terminerPremierPassage } from '../src/core/partage/passage';
import type { ReponseItem, Resultat } from '../src/core/partage/resultat';
import {
	creerProfilImporte,
	dejaImporte,
	erreursDuResultat,
	importerResultat,
	MAX_IMPORTS_RETENUS,
	profilCorrespondant,
	RESULTATS_IMPORTES_KEY,
} from '../src/core/partage/import';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

afterEach(() => {
	vi.restoreAllMocks();
});

/* ---------- Données ---------- */

/** Identifiants de 12 caractères base64url, comme ceux du lien (`identifiant`). */
const ID_ENVOI = 'EnvoiTest001';
const ID_RESULTAT = 'ResultTest01';
const ID_PREMIER = 'PremierPass1';

const HEURE = 3_600_000;
/** Fin du passage, la veille de l'import. */
const DATE_FIN = Date.UTC(2026, 9, 7, 14, 30, 0);
/** Moment de l'import, côté encadrant. */
const MAINTENANT = Date.UTC(2026, 9, 8, 9, 0, 0);

const LECON_A = 'math-tables-addition';
const LECON_B = 'num-valeur-position';
const LECON_C = 'calc-addition-posee';

/** Les quatre statuts, dont deux faux non contigus. Le premier faux porte un mode
 *  d'exercice : le journal doit malgré tout dire « séance partagée ». */
const REPONSES: ReponseItem[] = [
	{ lecon: LECON_A, enonce: '2 + 5 = …', saisie: '7', attendue: '7', statut: 'juste' },
	{ lecon: LECON_A, mode: 'qcm', enonce: '3 + 5 = …', saisie: '9', attendue: '8', statut: 'faux' },
	{
		lecon: LECON_B,
		enonce: 'Dans 4572, quel est le chiffre des centaines ?',
		saisie: '',
		attendue: '5',
		statut: 'vide',
	},
	{
		lecon: LECON_B,
		enonce: 'Dans 318, quel est le chiffre des dizaines ?',
		saisie: '',
		attendue: '1',
		statut: 'jnsp',
	},
	{ lecon: LECON_C, enonce: '347 + 285', saisie: '522', attendue: '632', statut: 'faux' },
];

/** Ce que le contrat dit de `REPONSES`, écrit à la main. */
const ERREURS_ATTENDUES: ErreurEntry[] = [
	{
		ts: DATE_FIN,
		lessonId: LECON_A,
		mode: MODE_PARTAGE,
		question: '3 + 5 = …',
		donnee: '9',
		attendue: '8',
	},
	{
		ts: DATE_FIN,
		lessonId: LECON_B,
		mode: MODE_PARTAGE,
		question: 'Dans 318, quel est le chiffre des dizaines ?',
		donnee: '',
		attendue: '1',
		sansTentative: true,
	},
	{
		ts: DATE_FIN,
		lessonId: LECON_C,
		mode: MODE_PARTAGE,
		question: '347 + 285',
		donnee: '522',
		attendue: '632',
	},
];

function resultat(o: Partial<Resultat> = {}): Resultat {
	return {
		id: ID_RESULTAT,
		envoi: { id: ID_ENVOI, libelle: 'Fiche du lundi', niveau: 'cm1' },
		pseudo: 'Léa',
		date: DATE_FIN,
		reponses: REPONSES.map((r) => ({ ...r })),
		...o,
	};
}

/* ---------- Outils ---------- */

/** Fige `Date.now()` ; rend de quoi l'avancer. */
function figerHorloge(t: number): (suivant: number) => void {
	let maintenant = t;
	vi.spyOn(Date, 'now').mockImplementation(() => maintenant);
	return (suivant) => {
		maintenant = suivant;
	};
}

/** Le profil créé par `initProfiles` reste actif ; un second profil, « Léa », n'est
 *  PAS actif (`addProfile` bascule dessus, on revient donc au premier). */
function deuxProfils(): { actif: Profile; cible: Profile } {
	const actif = activeProfile();
	const cible = addProfile('Léa');
	setActiveProfile(actif.uuid);
	expect(activeProfile().uuid, 'précondition : le premier profil est actif').toBe(actif.uuid);
	return { actif, cible };
}

const ERREURS_EXISTANTES: ErreurEntry[] = [
	{
		ts: MAINTENANT - 2 * HEURE,
		lessonId: LECON_A,
		mode: 'lecon',
		question: '6 + 6 = …',
		donnee: '13',
		attendue: '12',
	},
	{
		ts: DATE_FIN - 24 * HEURE,
		lessonId: LECON_C,
		mode: 'express',
		question: '128 + 64',
		donnee: '182',
		attendue: '192',
		sansTentative: true,
	},
];

const ACTIVITE_EXISTANTE: ActivityEntry = { t: DATE_FIN - 3 * HEURE, k: 'lecon', ref: LECON_A };

/** Une progression déjà là, écrite en brut (sans toucher `updatedAt`). */
function peupler(uuid: string, xp: number): void {
	lsSetRaw(uuid + '/' + XP_KEY, JSON.stringify(xp));
	lsSetRaw(uuid + '/' + ERREURS_KEY, JSON.stringify(ERREURS_EXISTANTES));
	lsSetRaw(uuid + '/' + ACTIVITY_KEY, JSON.stringify([ACTIVITE_EXISTANTE]));
}

function activite(uuid: string): ActivityEntry[] {
	return normalizeActivity(lsGetRaw(uuid + '/' + ACTIVITY_KEY, []));
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

/** Méta des profils où seul l'`updatedAt` du profil `uuid` est neutralisé : le seul
 *  champ que le critère 26 laisse bouger. */
function metaSaufHorodatageDe(brut: string | undefined, uuid: string): ProfilesMeta | undefined {
	if (brut === undefined) return undefined;
	const m: ProfilesMeta = JSON.parse(brut);
	return { ...m, list: m.list.map((p) => (p.uuid === uuid ? { ...p, updatedAt: 0 } : p)) };
}

/* Premier passage joué SUR CET APPAREIL par le profil actif : juste, faux, « je ne
   sais pas ». C'est le chemin réel (`terminerPremierPassage`), pas un état fabriqué. */
function envoiJoue(): Envoi {
	return {
		id: ID_ENVOI,
		libelle: 'Fiche du lundi',
		nature: 'lecon',
		niveau: 'cm1',
		blocs: [{ lecon: LECON_A, exercices: [] }],
	};
}

function captureJouee(): Capture {
	const c = nouvelleCapture([
		{ lecon: LECON_A, enonce: '2 + 5 = …', attendue: '7' },
		{ lecon: LECON_A, enonce: '3 + 5 = …', attendue: '8' },
		{ lecon: LECON_A, enonce: '4 + 5 = …', attendue: '9' },
	]);
	noterReponse(c, 0, { statut: 'juste', saisie: '7' });
	noterReponse(c, 1, { statut: 'faux', saisie: '6' });
	noterReponse(c, 2, { statut: 'jnsp', saisie: '' });
	return c;
}

function jouerSurPlace(): Resultat {
	const r = terminerPremierPassage(envoiJoue(), captureJouee(), {
		pseudo: 'Léa',
		date: DATE_FIN,
		id: ID_PREMIER,
	});
	expect(r.id, 'précondition : le premier passage porte l’id donné').toBe(ID_PREMIER);
	return r;
}

/* ============================================================
   erreursDuResultat — pur
   ============================================================ */

describe('erreursDuResultat — une entrée par erreur ciblable (critère 21)', () => {
	it('faux et « je ne sais pas » deviennent des erreurs, dans l’ordre, datées du passage, en mode « partage » ; juste et vide ne donnent rien', () => {
		figerHorloge(MAINTENANT);
		// toStrictEqual : `sansTentative` doit être ABSENT des faux, pas `undefined`/`false`.
		expect(erreursDuResultat(resultat())).toStrictEqual(ERREURS_ATTENDUES);
	});

	it('« je ne sais pas » ne porte aucune réponse donnée, même si le lien en transporte une', () => {
		// Un lien se forge : le schéma ne garantit pas une saisie vide sur un `jnsp`.
		const r = resultat({
			reponses: [
				{
					lecon: LECON_B,
					enonce: '318 : les dizaines ?',
					saisie: '3',
					attendue: '1',
					statut: 'jnsp',
				},
			],
		});
		expect(erreursDuResultat(r)).toStrictEqual([
			{
				ts: DATE_FIN,
				lessonId: LECON_B,
				mode: MODE_PARTAGE,
				question: '318 : les dizaines ?',
				donnee: '',
				attendue: '1',
				sansTentative: true,
			},
		]);
	});

	it('un résultat sans faux ni « je ne sais pas » ne donne aucune erreur', () => {
		const r = resultat({
			reponses: REPONSES.filter((x) => x.statut === 'juste' || x.statut === 'vide'),
		});
		expect(erreursDuResultat(r)).toEqual([]);
	});

	it('pure : n’écrit rien et ne modifie pas le résultat', () => {
		const r = resultat();
		const copie = structuredClone(r);
		const avant = instantane();
		erreursDuResultat(r);
		expect(r).toEqual(copie);
		expect(clesModifiees(avant, instantane())).toEqual([]);
	});
});

/* ============================================================
   importerResultat — le cas nominal : un profil qui n'est pas l'actif
   ============================================================ */

describe('importerResultat — dans un profil qui n’est pas le profil actif (critères 21 et 26)', () => {
	it('critère 21 : le journal et l’activité du profil choisi reçoivent les erreurs et la séance, datées du passage', () => {
		const avancer = figerHorloge(MAINTENANT - HEURE);
		const { cible } = deuxProfils();
		peupler(cible.uuid, 10);
		const r = resultat();
		const copie = structuredClone(r);
		avancer(MAINTENANT);

		expect(importerResultat(r, cible.uuid)).toEqual({ ok: true, erreurs: 3 });

		const journal = chargerErreursFor(cible.uuid);
		expect(journal, 'les erreurs déjà là restent, les trois importées s’ajoutent').toHaveLength(
			ERREURS_EXISTANTES.length + ERREURS_ATTENDUES.length,
		);
		expect(journal).toEqual(expect.arrayContaining([...ERREURS_EXISTANTES, ...ERREURS_ATTENDUES]));

		const act = activite(cible.uuid);
		expect(act, 'une seule entrée d’activité ajoutée').toHaveLength(2);
		expect(act).toContainEqual(ACTIVITE_EXISTANTE);
		// Exactement { t, k } : ni score, ni `ref`, ni `progressive`.
		expect(act).toContainEqual({ t: DATE_FIN, k: 'partage' });

		expect(r, 'le résultat passé n’est pas modifié').toEqual(copie);
	});

	it('critère 26 : seuls changent le journal, l’activité et la mémoire des imports du profil choisi, plus son updatedAt', () => {
		const avancer = figerHorloge(MAINTENANT - HEURE);
		const { actif, cible } = deuxProfils();
		// XP juste sous un palier : un calcul de niveau ou de trophée déclenché par
		// l'import se verrait dans le stockage.
		peupler(actif.uuid, 42);
		peupler(cible.uuid, 10);
		const avant = instantane();
		avancer(MAINTENANT);

		expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: true, erreurs: 3 });

		const apres = instantane();
		const p = cible.uuid + '/';
		const permises = [p + ERREURS_KEY, p + ACTIVITY_KEY, p + RESULTATS_IMPORTES_KEY, PROFILES_KEY];
		const modifiees = clesModifiees(avant, apres);
		for (const cle of modifiees)
			expect(permises, `clé modifiée hors périmètre : ${cle}`).toContain(cle);
		for (const cle of [p + ERREURS_KEY, p + ACTIVITY_KEY])
			expect(modifiees, `${cle} aurait dû être écrite`).toContain(cle);
		expect(
			metaSaufHorodatageDe(apres.get(PROFILES_KEY), cible.uuid),
			'profils : seul l’updatedAt du profil choisi peut bouger, pas celui du profil actif',
		).toEqual(metaSaufHorodatageDe(avant.get(PROFILES_KEY), cible.uuid));
		expect(getXPFor(cible.uuid), 'critère 21 : l’XP du profil choisi ne bouge pas').toBe(10);
		expect(getXPFor(actif.uuid)).toBe(42);
	});

	it('le profil actif reste le même, et c’est encore ses données qu’on lit et écrit', () => {
		const { actif, cible } = deuxProfils();
		lsSetRaw(actif.uuid + '/' + XP_KEY, '42');
		lsSetRaw(cible.uuid + '/' + XP_KEY, '10');

		importerResultat(resultat(), cible.uuid);

		expect(activeProfile().uuid).toBe(actif.uuid);
		// Un import qui basculerait le préfixe actif sans le rétablir ferait lire l'XP
		// du profil choisi à la place de celle de l'enfant en cours.
		expect(getXP(), 'le préfixe actif est toujours celui du profil actif').toBe(42);
	});

	it('dans le profil actif aussi (résultat venu d’un autre appareil)', () => {
		const actif = activeProfile();
		expect(importerResultat(resultat(), actif.uuid)).toEqual({ ok: true, erreurs: 3 });
		expect(chargerErreursFor(actif.uuid)).toEqual(expect.arrayContaining(ERREURS_ATTENDUES));
		expect(loadActivity()).toContainEqual({ t: DATE_FIN, k: 'partage' });
	});

	it('un résultat sans erreur s’importe quand même : zéro erreur, une séance à l’activité', () => {
		const { cible } = deuxProfils();
		const r = resultat({ reponses: REPONSES.filter((x) => x.statut === 'juste') });
		expect(importerResultat(r, cible.uuid)).toEqual({ ok: true, erreurs: 0 });
		expect(chargerErreursFor(cible.uuid)).toEqual([]);
		expect(activite(cible.uuid)).toEqual([{ t: DATE_FIN, k: 'partage' }]);
	});
});

describe('importerResultat — journal plein (critère 21)', () => {
	it('les erreurs importées, plus anciennes que les entrées présentes, ne sont pas évincées', () => {
		const { cible } = deuxProfils();
		const recentes: ErreurEntry[] = Array.from({ length: MAX_ERREURS }, (_, i) => ({
			ts: MAINTENANT - i * 60_000,
			lessonId: LECON_A,
			mode: 'lecon',
			question: `${i} + 1 = …`,
			donnee: '0',
			attendue: String(i + 1),
		}));
		lsSetRaw(cible.uuid + '/' + ERREURS_KEY, JSON.stringify(recentes));
		expect(chargerErreursFor(cible.uuid), 'précondition : journal plein').toHaveLength(MAX_ERREURS);
		expect(
			recentes.every((e) => e.ts > DATE_FIN),
			'précondition : toutes plus récentes que le passage',
		).toBe(true);

		expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: true, erreurs: 3 });
		expect(chargerErreursFor(cible.uuid)).toEqual(expect.arrayContaining(ERREURS_ATTENDUES));
	});
});

/* ============================================================
   Dédoublonnage (critère 22)
   ============================================================ */

describe('importerResultat — une seule fois par résultat et par profil (critère 22)', () => {
	it('le second import du même résultat rend « deja » et n’écrit rien', () => {
		const avancer = figerHorloge(MAINTENANT - HEURE);
		const { cible } = deuxProfils();
		expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: true, erreurs: 3 });
		const avant = instantane();
		avancer(MAINTENANT);

		// Un objet neuf, égal en valeur : le lien rouvert, redécodé.
		expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: false, raison: 'deja' });

		expect(clesModifiees(avant, instantane()), 'rien n’est écrit, pas même updatedAt').toEqual([]);
		expect(chargerErreursFor(cible.uuid), 'aucune erreur en double').toHaveLength(3);
	});

	it('un résultat sans erreur n’est pas réimporté pour autant : l’activité ne double pas', () => {
		const { cible } = deuxProfils();
		const r = resultat({
			id: 'SansErreur01',
			reponses: REPONSES.filter((x) => x.statut === 'juste'),
		});
		expect(importerResultat(r, cible.uuid)).toEqual({ ok: true, erreurs: 0 });
		expect(importerResultat(structuredClone(r), cible.uuid)).toEqual({ ok: false, raison: 'deja' });
		expect(activite(cible.uuid).filter((e) => e.k === 'partage')).toHaveLength(1);
	});

	it('le même résultat s’importe dans un autre profil, puis n’est plus accepté dans aucun des deux', () => {
		const { actif, cible } = deuxProfils();
		expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: true, erreurs: 3 });
		expect(importerResultat(resultat(), actif.uuid)).toEqual({ ok: true, erreurs: 3 });
		expect(chargerErreursFor(actif.uuid)).toEqual(expect.arrayContaining(ERREURS_ATTENDUES));
		expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: false, raison: 'deja' });
		expect(importerResultat(resultat(), actif.uuid)).toEqual({ ok: false, raison: 'deja' });
	});

	it('deux résultats distincts du même envoi s’importent tous les deux (la clé est le résultat, pas l’envoi)', () => {
		const { cible } = deuxProfils();
		expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: true, erreurs: 3 });
		expect(importerResultat(resultat({ id: 'ResultTest02' }), cible.uuid)).toEqual({
			ok: true,
			erreurs: 3,
		});
		expect(chargerErreursFor(cible.uuid)).toHaveLength(6);
	});

	it('dejaImporte suit l’import, profil par profil, sans rien écrire', () => {
		const { actif, cible } = deuxProfils();
		const r = resultat();
		expect(dejaImporte(r, cible.uuid)).toBe(false);
		importerResultat(r, cible.uuid);
		const avant = instantane();
		expect(dejaImporte(r, cible.uuid)).toBe(true);
		expect(dejaImporte(r, actif.uuid), 'un autre profil').toBe(false);
		expect(dejaImporte(resultat({ id: 'ResultTest02' }), cible.uuid), 'un autre résultat').toBe(
			false,
		);
		expect(clesModifiees(avant, instantane())).toEqual([]);
	});
});

describe('importerResultat — premier passage joué sur cet appareil (critère 22)', () => {
	it('importé dans le profil qui l’a joué : « deja », rien n’est écrit (ses erreurs sont déjà dans son journal)', () => {
		const avancer = figerHorloge(MAINTENANT - HEURE);
		const joueur = activeProfile();
		const r = jouerSurPlace();
		const avant = instantane();
		avancer(MAINTENANT);

		expect(importerResultat(structuredClone(r), joueur.uuid)).toEqual({
			ok: false,
			raison: 'deja',
		});
		expect(clesModifiees(avant, instantane())).toEqual([]);
		expect(dejaImporte(structuredClone(r), joueur.uuid), 'dejaImporte dit la même chose').toBe(
			true,
		);
	});

	it('même quand un autre profil est actif au moment de l’import', () => {
		const joueur = activeProfile();
		const r = jouerSurPlace();
		const autre = addProfile('Tom');
		expect(activeProfile().uuid, 'précondition : un autre profil est actif').toBe(autre.uuid);
		const avant = instantane();

		expect(importerResultat(structuredClone(r), joueur.uuid)).toEqual({
			ok: false,
			raison: 'deja',
		});
		expect(clesModifiees(avant, instantane())).toEqual([]);
	});

	it('même après un changement de pseudo (même résultat, même id)', () => {
		const joueur = activeProfile();
		jouerSurPlace();
		const renomme = changerPseudo(ID_ENVOI, 'Lou');
		expect(renomme, 'précondition : pseudo changé').not.toBeNull();
		if (!renomme) return;
		expect(importerResultat(structuredClone(renomme), joueur.uuid)).toEqual({
			ok: false,
			raison: 'deja',
		});
	});

	it('le même premier passage s’importe dans un autre profil', () => {
		const joueur = activeProfile();
		const r = jouerSurPlace();
		const autre = addProfile('Tom');
		setActiveProfile(joueur.uuid);
		expect(importerResultat(structuredClone(r), autre.uuid)).toEqual({ ok: true, erreurs: 2 });
	});

	it('un AUTRE résultat du même envoi (joué sur un autre appareil) s’importe dans ce profil', () => {
		const joueur = activeProfile();
		const r = jouerSurPlace();
		const ailleurs: Resultat = { ...structuredClone(r), id: 'AutreAppar01' };
		expect(importerResultat(ailleurs, joueur.uuid)).toEqual({ ok: true, erreurs: 2 });
	});
});

describe('importerResultat — profil inconnu', () => {
	it.each([
		['un uuid jamais vu', 'profil-inconnu'],
		['un uuid vide', ''],
		['les restes d’un profil supprimé (clés sans profil)', 'orphelin-0001'],
	])('%s : refus « profil », rien n’est écrit', (_cas, uuid) => {
		lsSetRaw('orphelin-0001/' + XP_KEY, '3');
		const avant = instantane();
		expect(importerResultat(resultat(), uuid)).toEqual({ ok: false, raison: 'profil' });
		expect(clesModifiees(avant, instantane())).toEqual([]);
	});
});

describe('importerResultat — textes gardés tels quels', () => {
	it('un énoncé, une saisie ou un attendu contenant du HTML sont stockés comme texte, sans transformation', () => {
		const { cible } = deuxProfils();
		const r = resultat({
			reponses: [
				{
					lecon: LECON_A,
					enonce: '<img src=x onerror=alert(1)>',
					saisie: '"><svg onload=alert(1)>',
					attendue: 'a < b & c',
					statut: 'faux',
				},
			],
		});
		expect(importerResultat(r, cible.uuid)).toEqual({ ok: true, erreurs: 1 });
		expect(chargerErreursFor(cible.uuid)).toEqual([
			{
				ts: DATE_FIN,
				lessonId: LECON_A,
				mode: MODE_PARTAGE,
				question: '<img src=x onerror=alert(1)>',
				donnee: '"><svg onload=alert(1)>',
				attendue: 'a < b & c',
			},
		]);
	});
});

/* ============================================================
   Écriture refusée (quota) : l'import se fait en entier ou pas du tout
   ============================================================ */

/** Fait lever `setItem` pour la clé réelle `cle`, comme un quota dépassé. Posé sur
 *  l'INSTANCE : sous happy-dom, un espion sur `Storage.prototype` n'intercepte rien
 *  (constaté dans partage-passage.test.ts). */
function refuserEcriture(cle: string): { refus: () => number; retablir: () => void } {
	const ecrire = localStorage.setItem.bind(localStorage);
	let refus = 0;
	const espion = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
		if (k === cle) {
			refus++;
			throw new DOMException('quota dépassé', 'QuotaExceededError');
		}
		ecrire(k, v);
	});
	return { refus: () => refus, retablir: () => espion.mockRestore() };
}

/* Trois écritures, trois points de refus : l'ordre dans lequel le module les enchaîne
   n'est pas connu, et chaque ordre laisse derrière lui des écritures différentes. */
const CLES_REFUSEES: [string, string][] = [
	['le journal d’erreurs', ERREURS_KEY],
	['la mémoire des résultats importés', RESULTATS_IMPORTES_KEY],
	['l’activité', ACTIVITY_KEY],
];

describe.each(CLES_REFUSEES)('importerResultat — écriture refusée sur %s (quota)', (_nom, cle) => {
	it('profil vierge : refus « stockage », les clés absentes avant le restent, updatedAt ne bouge pas', () => {
		const avancer = figerHorloge(MAINTENANT - HEURE);
		const { cible } = deuxProfils();
		const p = cible.uuid + '/';
		const cles = [p + ERREURS_KEY, p + ACTIVITY_KEY, p + RESULTATS_IMPORTES_KEY];
		for (const k of cles) expect(lsGetItemRaw(k), `précondition : ${k} absente`).toBeNull();
		const avant = instantane();
		avancer(MAINTENANT);
		const { refus } = refuserEcriture(p + cle);

		const res = importerResultat(resultat(), cible.uuid);

		expect(refus(), 'précondition : l’écriture a bien été tentée, et refusée').toBeGreaterThan(0);
		expect(res).toEqual({ ok: false, raison: 'stockage' });
		for (const k of cles) expect(lsGetItemRaw(k), `${k} redevient absente`).toBeNull();
		expect(clesModifiees(avant, instantane()), 'rien ne reste, pas même updatedAt').toEqual([]);
	});

	it('profil déjà suivi : refus « stockage », chaque clé retrouve exactement sa valeur d’avant', () => {
		const avancer = figerHorloge(MAINTENANT - HEURE);
		const { cible } = deuxProfils();
		peupler(cible.uuid, 10);
		// Un import réussi plus tôt : la mémoire des imports existe déjà, elle aussi.
		expect(importerResultat(resultat({ id: 'ResultTest02' }), cible.uuid)).toEqual({
			ok: true,
			erreurs: 3,
		});
		const p = cible.uuid + '/';
		for (const k of [p + ERREURS_KEY, p + ACTIVITY_KEY, p + RESULTATS_IMPORTES_KEY])
			expect(lsGetItemRaw(k), `précondition : ${k} présente`).not.toBeNull();
		const avant = instantane();
		avancer(MAINTENANT);
		const { refus } = refuserEcriture(p + cle);

		const res = importerResultat(resultat(), cible.uuid);

		expect(refus(), 'précondition : l’écriture a bien été tentée, et refusée').toBeGreaterThan(0);
		expect(res).toEqual({ ok: false, raison: 'stockage' });
		expect(clesModifiees(avant, instantane()), 'rien ne reste, pas même updatedAt').toEqual([]);
		expect(dejaImporte(resultat(), cible.uuid), 'le résultat refusé n’est pas retenu').toBe(false);
	});

	it('un nouvel essai, l’écriture rétablie, réussit sans doubler les erreurs ni la séance', () => {
		const { cible } = deuxProfils();
		peupler(cible.uuid, 10);
		const { retablir } = refuserEcriture(cible.uuid + '/' + cle);
		expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: false, raison: 'stockage' });
		retablir();

		expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: true, erreurs: 3 });

		const journal = chargerErreursFor(cible.uuid);
		expect(journal, 'les 2 erreurs d’avant et les 3 importées, une seule fois').toHaveLength(
			ERREURS_EXISTANTES.length + ERREURS_ATTENDUES.length,
		);
		expect(journal).toEqual(expect.arrayContaining([...ERREURS_EXISTANTES, ...ERREURS_ATTENDUES]));
		const act = activite(cible.uuid);
		expect(act, 'une seule séance ajoutée').toHaveLength(2);
		expect(act).toContainEqual(ACTIVITE_EXISTANTE);
		expect(act).toContainEqual({ t: DATE_FIN, k: 'partage' });
		expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: false, raison: 'deja' });
	});
});

/* ============================================================
   Mémoire des résultats importés : bornée, et robuste
   ============================================================ */

describe('importerResultat — mémoire des imports bornée à MAX_IMPORTS_RETENUS (critère 22)', () => {
	/* Résultat sans erreur, d'id et de date propres au rang `i`. Le premier importé est
	   aussi le plus ancien passage : « le plus ancien » désigne le même, qu'on le lise
	   par ordre d'import ou par date. */
	function rang(i: number): Resultat {
		return resultat({
			id: 'Imp' + String(i).padStart(9, '0'),
			date: DATE_FIN + i * 1000,
			reponses: REPONSES.filter((x) => x.statut === 'juste'),
		});
	}

	it('la borne vaut 500', () => {
		expect(MAX_IMPORTS_RETENUS).toBe(500);
	});

	it('les 500 derniers sont retenus ; au 501e, le plus ancien est oublié et se réimporte', () => {
		const { cible } = deuxProfils();
		for (let i = 0; i < MAX_IMPORTS_RETENUS; i++)
			expect(importerResultat(rang(i), cible.uuid), `import n° ${i}`).toEqual({
				ok: true,
				erreurs: 0,
			});
		expect(dejaImporte(rang(0), cible.uuid), 'exactement 500 : le premier est encore retenu').toBe(
			true,
		);

		expect(importerResultat(rang(MAX_IMPORTS_RETENUS), cible.uuid)).toEqual({
			ok: true,
			erreurs: 0,
		});

		expect(dejaImporte(rang(0), cible.uuid), 'au 501e, le plus ancien est oublié').toBe(false);
		expect(dejaImporte(rang(1), cible.uuid), 'un seul est oublié').toBe(true);
		expect(dejaImporte(rang(MAX_IMPORTS_RETENUS), cible.uuid), 'le dernier est retenu').toBe(true);
		expect(importerResultat(rang(0), cible.uuid), 'l’oublié se réimporte').toEqual({
			ok: true,
			erreurs: 0,
		});
		expect(importerResultat(rang(MAX_IMPORTS_RETENUS), cible.uuid)).toEqual({
			ok: false,
			raison: 'deja',
		});
	});
});

describe('importerResultat — mémoire des imports corrompue (critère 22)', () => {
	/* Plusieurs portent l'id du résultat sous une forme qui n'est PAS une entrée de
	   mémoire valide : une lecture naïve (`in`, `includes` sur une chaîne, recherche
	   dans le texte brut) le croirait déjà importé. */
	const CORROMPUES: [string, string][] = [
		['un objet indexé par l’id', '{"ResultTest01":true}'],
		['la chaîne de l’id seule', '"ResultTest01"'],
		['un nombre', '42'],
		['null', 'null'],
		['du JSON illisible', '["ResultTest01"'],
		['un tableau de non-chaînes', '[1,null,{"id":"ResultTest01"},["ResultTest01"]]'],
	];
	it.each(CORROMPUES)(
		'%s : rien ne lève, le résultat s’importe, puis n’est plus réimporté',
		(_cas, brut) => {
			const { cible } = deuxProfils();
			lsSetRaw(cible.uuid + '/' + RESULTATS_IMPORTES_KEY, brut);

			expect(dejaImporte(resultat(), cible.uuid)).toBe(false);
			expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: true, erreurs: 3 });
			expect(chargerErreursFor(cible.uuid)).toHaveLength(3);
			expect(importerResultat(resultat(), cible.uuid)).toEqual({ ok: false, raison: 'deja' });
		},
	);
});

/* ============================================================
   profilCorrespondant — présélection (critère 19)
   ============================================================ */

function profil(uuid: string, name: string): Profile {
	return { uuid, name, emoji: '🐧', updatedAt: 0 };
}

describe('profilCorrespondant — présélection du profil (critère 19)', () => {
	const EQUIVALENTS: [string, string][] = [
		['lea', 'Léa'],
		['LÉA', 'Léa'],
		['Léa', 'LEA'],
		['  Léa ', 'Léa'],
		['Léa', ' léa  '],
		['Noel', 'Noël'],
		['jerome', 'Jérôme'],
		['Francois', 'François'],
	];
	it.each(EQUIVALENTS)('le pseudo « %s » retrouve le profil « %s »', (pseudo, nom) => {
		const profils = [profil('u1', 'Tom'), profil('u2', nom)];
		expect(profilCorrespondant(pseudo, profils)?.uuid).toBe('u2');
	});

	const DIFFERENTS: [string, string][] = [
		['Léa', 'Léane'],
		['Léane', 'Léa'],
		['Lé', 'Léa'],
		['Léa', 'Léa Martin'],
	];
	it.each(DIFFERENTS)(
		'pas de correspondance partielle : « %s » ne retrouve pas « %s »',
		(pseudo, nom) => {
			expect(profilCorrespondant(pseudo, [profil('u1', nom)])).toBeNull();
		},
	);

	it('plusieurs profils correspondent : le premier de la liste, même si un suivant est identique au caractère près', () => {
		const profils = [profil('u1', 'Tom'), profil('u2', 'LEA'), profil('u3', 'Léa')];
		expect(profilCorrespondant('Léa', profils)?.uuid).toBe('u2');
	});

	it('aucun profil, ou aucun qui corresponde : null', () => {
		expect(profilCorrespondant('Léa', [])).toBeNull();
		expect(profilCorrespondant('Léa', [profil('u1', 'Profil 1'), profil('u2', 'Tom')])).toBeNull();
	});
});

/* ============================================================
   creerProfilImporte — « Créer le profil <pseudo> » (critère 20)
   ============================================================ */

describe('creerProfilImporte — un profil ordinaire, à la classe de l’envoi (critère 20)', () => {
	it('envoi CM1 : profil listé, nommé du pseudo, en CM1 — même si le profil actif est en CE2', () => {
		setNiveauReference('ce2');
		const avant = listProfiles().length;

		const cree = creerProfilImporte('Léa', 'cm1');

		expect(listProfiles()).toHaveLength(avant + 1);
		const garde = listProfiles().find((p) => p.uuid === cree.uuid);
		expect(garde, 'le profil est enregistré comme les autres').toBeDefined();
		expect(garde?.name).toBe('Léa');
		expect(garde?.emoji).toBeTruthy();
		expect(garde?.niveauReference).toBe('cm1');
	});

	it('envoi sans niveau : la classe reste vide, elle n’hérite pas de celle du profil actif', () => {
		setNiveauReference('ce2');
		const cree = creerProfilImporte('Léa');
		const garde = listProfiles().find((p) => p.uuid === cree.uuid);
		expect(garde).toBeDefined();
		expect(garde).not.toHaveProperty('niveauReference');
	});

	it('le profil actif ne change pas (ni lui, ni son updatedAt, ni le préfixe des données)', () => {
		const avancer = figerHorloge(MAINTENANT - HEURE);
		const actif = activeProfile();
		lsSetRaw(actif.uuid + '/' + XP_KEY, '42');
		avancer(MAINTENANT);

		const cree = creerProfilImporte('Léa', 'cm1');

		expect(cree.uuid).not.toBe(actif.uuid);
		expect(activeProfile()).toEqual(actif);
		expect(getXP(), 'les données lues sont toujours celles du profil actif').toBe(42);
	});

	it('le profil créé reçoit l’import qui suit', () => {
		const cree = creerProfilImporte('Léa', 'cm1');
		expect(importerResultat(resultat(), cree.uuid)).toEqual({ ok: true, erreurs: 3 });
		expect(chargerErreursFor(cree.uuid)).toHaveLength(3);
	});
});
