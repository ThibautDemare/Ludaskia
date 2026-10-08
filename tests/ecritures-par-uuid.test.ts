/* ============================================================
   Écritures par UUID (#734) — trois primitives qui visent un profil donné par
   son UUID, actif ou non, SANS changer le profil actif. L'import d'un résultat
   de séance partagée, depuis l'espace encadrant, les enchaîne.

   - `journaliserErreursFor` : erreurs ajoutées EN TÊTE du journal du profil,
     avec leur date et leur ordre, journal plafonné en gardant la tête ;
   - `recordActivitePartageFor` : point d'activité « partage » rangé à sa place
     chronologique, activité plafonnée en gardant les plus récentes ;
   - `passageJoueIci` : ce résultat est-il le premier passage que CE profil a
     lui-même joué sur cet appareil ? (lecture seule)

   Attendus écrits à la main depuis le contrat, jamais recopiés d'une sortie. Le
   stockage est relu en entier avant / après (`instantane`) : une écriture dans
   le profil actif au lieu du profil visé, ou une clé de trop, se voit.
   L'horloge est figée loin des dates manipulées : une date reprise de
   `Date.now()` au lieu de celle de l'entrée se voit aussi.
   ============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	chargerErreursFor,
	ERREURS_KEY,
	journaliserErreur,
	journaliserErreursFor,
	MAX_ERREURS,
	type ErreurEntry,
} from '../src/core/erreurs-journal';
import {
	ACTIVITY_KEY,
	loadActivity,
	normalizeActivity,
	recordActivitePartageFor,
	type ActivityEntry,
} from '../src/core/progress';
import {
	activeProfile,
	addProfile,
	initProfiles,
	setActiveProfile,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import { lsGetItemRaw, lsGetRaw, lsKeysRaw, lsSetRaw, setOnDataWrite } from '../src/core/storage';
import { nouvelleCapture, noterReponse, type Capture } from '../src/core/partage/capture';
import type { Envoi } from '../src/core/partage/envoi';
import {
	PARTAGES_RECUS_KEY,
	passageJoueIci,
	terminerPremierPassage,
} from '../src/core/partage/passage';
import type { Resultat } from '../src/core/partage/resultat';

const HEURE = 3_600_000;
/** Horloge figée : postérieure à toutes les dates manipulées ci-dessous. */
const MAINTENANT = Date.UTC(2026, 9, 8, 9, 0, 0);
/** Fin d'un passage, trois jours avant l'import. */
const DATE_PASSAGE = MAINTENANT - 72 * HEURE;

const LECON_A = 'math-tables-addition';
const LECON_B = 'num-valeur-position';

/** Identifiants de 12 caractères base64url, comme ceux du lien. */
const ID_ENVOI = 'EnvoiTest001';
const ID_AUTRE_ENVOI = 'EnvoiTest002';
const ID_PREMIER = 'PremierPass1';
const ID_PASSAGE_ACTIF = 'PassageActf1';
const ID_AILLEURS = 'AutreAppar01';

beforeEach(() => {
	localStorage.clear();
	vi.spyOn(Date, 'now').mockReturnValue(MAINTENANT);
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

afterEach(() => {
	vi.restoreAllMocks();
});

/* ---------- Outils ---------- */

/** Le profil créé par `initProfiles` reste actif ; « Léa » existe mais n'est PAS active. */
function deuxProfils(): { actif: Profile; cible: Profile } {
	const actif = activeProfile();
	const cible = addProfile('Léa');
	setActiveProfile(actif.uuid);
	expect(activeProfile().uuid, 'précondition : le premier profil est actif').toBe(actif.uuid);
	return { actif, cible };
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

/* ============================================================
   1. journaliserErreursFor
   ============================================================ */

function erreur(o: Partial<ErreurEntry> = {}): ErreurEntry {
	return {
		ts: DATE_PASSAGE,
		lessonId: LECON_A,
		mode: 'partage',
		question: '3 + 5 = …',
		donnee: '9',
		attendue: '8',
		...o,
	};
}

function ecrireJournal(uuid: string, liste: readonly unknown[]): void {
	lsSetRaw(uuid + '/' + ERREURS_KEY, JSON.stringify(liste));
}

/** Journal déjà là : erreurs RÉCENTES, plus récentes que celles qu'on importe. */
const EXISTANTES: ErreurEntry[] = [
	erreur({
		ts: MAINTENANT - HEURE,
		mode: 'lecon',
		question: '6 + 6 = …',
		donnee: '13',
		attendue: '12',
	}),
	erreur({
		ts: MAINTENANT - 2 * HEURE,
		mode: 'express',
		question: '7 + 7 = …',
		donnee: '15',
		attendue: '14',
	}),
];

/** Erreurs d'un passage vieux de plusieurs jours, volontairement PAS rangées par date
 *  (la seconde est plus récente que la première) : l'ordre reçu doit être gardé tel quel. */
const IMPORTEES: ErreurEntry[] = [
	erreur({
		ts: DATE_PASSAGE - HEURE,
		lessonId: LECON_B,
		question: 'Dans 318, quel est le chiffre des dizaines ?',
		donnee: '',
		attendue: '1',
		sansTentative: true,
	}),
	erreur({ ts: DATE_PASSAGE, question: '347 + 285', donnee: '522', attendue: '632' }),
];

describe('journaliserErreursFor — erreurs ajoutées au journal d’un profil par UUID', () => {
	it('les entrées passent en tête, avec leur date et leur ordre, même plus anciennes que le journal', () => {
		const { cible } = deuxProfils();
		ecrireJournal(cible.uuid, EXISTANTES);

		expect(journaliserErreursFor(cible.uuid, IMPORTEES)).toBe(2);
		expect(chargerErreursFor(cible.uuid)).toStrictEqual([...IMPORTEES, ...EXISTANTES]);
	});

	it('n’écrit que le journal du profil visé : le profil actif reste actif, son journal et la méta intacts', () => {
		const { actif, cible } = deuxProfils();
		ecrireJournal(actif.uuid, EXISTANTES);
		ecrireJournal(cible.uuid, EXISTANTES);
		const avant = instantane();

		journaliserErreursFor(cible.uuid, IMPORTEES);

		expect(activeProfile().uuid).toBe(actif.uuid);
		expect(clesModifiees(avant, instantane())).toEqual([cible.uuid + '/' + ERREURS_KEY]);
	});

	it('profil actif visé par son UUID : même journal que celui qu’écrit la capture en séance', () => {
		const { actif } = deuxProfils();
		const enSeance = {
			lessonId: LECON_A,
			mode: 'lecon',
			question: '9 + 9 = …',
			donnee: '17',
			attendue: '18',
		};
		journaliserErreur(enSeance); // chemin des runners : profil actif, daté de maintenant

		expect(journaliserErreursFor(actif.uuid, IMPORTEES)).toBe(2);
		expect(chargerErreursFor(actif.uuid)).toStrictEqual([
			...IMPORTEES,
			{ ...enSeance, ts: MAINTENANT },
		]);
	});

	it('ignore une entrée invalide, sans leçon ou sans énoncé, et ne compte que celles retenues', () => {
		const { cible } = deuxProfils();
		const [v1, v2] = IMPORTEES;
		// Formes impossibles à écrire en TypeScript, mais possibles dans un lien décodé.
		const [dateTexte, sansAttendue]: ErreurEntry[] = JSON.parse(
			JSON.stringify([
				{ ...erreur(), ts: 'hier' },
				{ ts: DATE_PASSAGE, lessonId: LECON_A, mode: 'partage', question: '2 + 2', donnee: '5' },
			]),
		);
		const melange = [
			dateTexte,
			v1,
			erreur({ lessonId: '' }),
			erreur({ question: '' }),
			sansAttendue,
			v2,
		];

		expect(journaliserErreursFor(cible.uuid, melange)).toBe(2);
		expect(chargerErreursFor(cible.uuid)).toStrictEqual([v1, v2]);
	});

	it('aucune entrée retenue : rend 0 et n’écrit rien, pas même une réécriture du journal', () => {
		const { actif, cible } = deuxProfils();
		// Une entrée illisible dans le journal existant : toute réécriture filtrée l'effacerait.
		ecrireJournal(cible.uuid, [...EXISTANTES, { illisible: true }]);
		const avant = instantane();

		expect(journaliserErreursFor(cible.uuid, [])).toBe(0);
		expect(
			journaliserErreursFor(cible.uuid, [erreur({ lessonId: '' }), erreur({ question: '' })]),
		).toBe(0);
		expect(journaliserErreursFor(actif.uuid, [])).toBe(0); // profil sans journal : rien créé

		expect(clesModifiees(avant, instantane())).toEqual([]);
	});

	it('journal plein : reste à MAX_ERREURS, les ajoutées en tête, la queue évincée', () => {
		const { cible } = deuxProfils();
		// Toutes plus récentes que les erreurs importées.
		const plein = Array.from({ length: MAX_ERREURS }, (_, i) =>
			erreur({ ts: MAINTENANT - (i + 1) * 60_000, question: `${i} + 1 = …` }),
		);
		ecrireJournal(cible.uuid, plein);

		expect(journaliserErreursFor(cible.uuid, IMPORTEES)).toBe(2);
		expect(chargerErreursFor(cible.uuid)).toStrictEqual([
			...IMPORTEES,
			...plein.slice(0, MAX_ERREURS - 2),
		]);
	});

	it('plus de MAX_ERREURS entrées d’un coup : le journal garde les premières reçues, dans l’ordre', () => {
		const { cible } = deuxProfils();
		ecrireJournal(cible.uuid, EXISTANTES);
		const flot = Array.from({ length: MAX_ERREURS + 5 }, (_, i) =>
			erreur({ ts: DATE_PASSAGE + i, question: `question ${i}` }),
		);

		journaliserErreursFor(cible.uuid, flot);

		expect(chargerErreursFor(cible.uuid)).toStrictEqual(flot.slice(0, MAX_ERREURS));
	});

	it.each([
		['un objet', '{"0":"pas un journal"}'],
		['du texte illisible', 'pas du json'],
	])(
		'journal existant corrompu (%s) : remplacé par les entrées ajoutées, sans lever',
		(_, brut) => {
			const { cible } = deuxProfils();
			lsSetRaw(cible.uuid + '/' + ERREURS_KEY, brut);

			expect(journaliserErreursFor(cible.uuid, IMPORTEES)).toBe(2);
			expect(chargerErreursFor(cible.uuid)).toStrictEqual(IMPORTEES);
		},
	);
});

/* ============================================================
   2. recordActivitePartageFor
   ============================================================ */

/** Plafond de l'activité, donné par le contrat. */
const ACTIVITE_MAX = 200;
const T = MAINTENANT - 24 * HEURE;
const PARTAGE: ActivityEntry = { t: T, k: 'partage' };

function ecrireActivite(uuid: string, liste: readonly unknown[]): void {
	lsSetRaw(uuid + '/' + ACTIVITY_KEY, JSON.stringify(liste));
}

function activite(uuid: string): ActivityEntry[] {
	return normalizeActivity(lsGetRaw(uuid + '/' + ACTIVITY_KEY, []));
}

describe('recordActivitePartageFor — point d’activité « partage » écrit par UUID', () => {
	const AVANT: ActivityEntry = { t: T - 2 * HEURE, k: 'lecon', ref: LECON_A };
	const APRES_1: ActivityEntry = { t: T + HEURE, k: 'dictee', ref: 'liste-1' };
	const APRES_2: ActivityEntry = { t: T + 5 * HEURE, k: 'sprint' };

	it('rangée à sa place chronologique : avant les entrées plus récentes, après les plus anciennes', () => {
		const { cible } = deuxProfils();
		ecrireActivite(cible.uuid, [AVANT, APRES_1, APRES_2]);

		recordActivitePartageFor(cible.uuid, T);

		expect(activite(cible.uuid)).toStrictEqual([AVANT, PARTAGE, APRES_1, APRES_2]);
	});

	it('aux deux bouts : en tête si plus ancienne que tout, en fin si plus récente que tout', () => {
		const { cible } = deuxProfils();
		ecrireActivite(cible.uuid, [APRES_1, APRES_2]);
		recordActivitePartageFor(cible.uuid, T);
		expect(activite(cible.uuid)).toStrictEqual([PARTAGE, APRES_1, APRES_2]);

		ecrireActivite(cible.uuid, [AVANT]);
		recordActivitePartageFor(cible.uuid, T);
		expect(activite(cible.uuid)).toStrictEqual([AVANT, PARTAGE]);
	});

	it('profil non actif : seule son activité change, le profil actif reste actif et intact', () => {
		const { actif, cible } = deuxProfils();
		ecrireActivite(actif.uuid, [AVANT]);
		ecrireActivite(cible.uuid, [AVANT]);
		const avant = instantane();

		recordActivitePartageFor(cible.uuid, T);

		expect(activeProfile().uuid).toBe(actif.uuid);
		expect(clesModifiees(avant, instantane())).toEqual([cible.uuid + '/' + ACTIVITY_KEY]);
		// Exactement `{ t, k: 'partage' }` en stockage : ni `ref`, ni drapeau.
		expect(lsGetRaw(cible.uuid + '/' + ACTIVITY_KEY, null)).toStrictEqual([AVANT, PARTAGE]);
	});

	it('profil actif visé par son UUID : l’entrée est relue par le chargeur du profil actif', () => {
		const { actif } = deuxProfils();

		recordActivitePartageFor(actif.uuid, T);

		expect(loadActivity()).toStrictEqual([PARTAGE]);
	});

	describe(`activité pleine (${ACTIVITE_MAX} entrées) : on garde les ${ACTIVITE_MAX} plus récentes`, () => {
		const BASE = T - 300 * HEURE;
		const pleine: ActivityEntry[] = Array.from({ length: ACTIVITE_MAX }, (_, i) => ({
			t: BASE + i * HEURE,
			k: 'lecon',
		}));

		it('plus récente que tout : ajoutée en fin, la plus ancienne évincée', () => {
			const { cible } = deuxProfils();
			ecrireActivite(cible.uuid, pleine);
			const t = BASE + ACTIVITE_MAX * HEURE;

			recordActivitePartageFor(cible.uuid, t);

			expect(activite(cible.uuid)).toStrictEqual([...pleine.slice(1), { t, k: 'partage' }]);
		});

		it('au milieu : rangée à sa place, la plus ancienne évincée', () => {
			const { cible } = deuxProfils();
			ecrireActivite(cible.uuid, pleine);
			const t = BASE + 99 * HEURE + HEURE / 2; // entre la 100e et la 101e

			recordActivitePartageFor(cible.uuid, t);

			expect(activite(cible.uuid)).toStrictEqual([
				...pleine.slice(1, 100),
				{ t, k: 'partage' },
				...pleine.slice(100),
			]);
		});

		it('plus ancienne que tout : n’y reste pas, l’activité est inchangée', () => {
			const { cible } = deuxProfils();
			ecrireActivite(cible.uuid, pleine);

			recordActivitePartageFor(cible.uuid, BASE - HEURE);

			expect(activite(cible.uuid)).toStrictEqual(pleine);
		});
	});

	it.each([
		['du texte illisible', 'pas du json'],
		['un objet', '{"t":1,"k":"lecon"}'],
		['un nombre', '42'],
		['null', 'null'],
	])('activité corrompue (%s) : remplacée par l’entrée, sans lever', (_, brut) => {
		const { cible } = deuxProfils();
		lsSetRaw(cible.uuid + '/' + ACTIVITY_KEY, brut);

		recordActivitePartageFor(cible.uuid, T);

		expect(activite(cible.uuid)).toStrictEqual([PARTAGE]);
	});

	it('entrées héritées (horodatage nu) : réécrites au format objet en stockage, l’entrée rangée parmi elles', () => {
		const { cible } = deuxProfils();
		ecrireActivite(cible.uuid, [T - HEURE, APRES_1, T + 3 * HEURE]);

		recordActivitePartageFor(cible.uuid, T);

		// Lu en BRUT : relu par `normalizeActivity`, un nombre nu serait invisible.
		expect(lsGetRaw(cible.uuid + '/' + ACTIVITY_KEY, null)).toStrictEqual([
			{ t: T - HEURE, k: 'inconnu' },
			PARTAGE,
			APRES_1,
			{ t: T + 3 * HEURE, k: 'inconnu' },
		]);
	});
});

/* ============================================================
   3. passageJoueIci
   ============================================================ */

function envoi(): Envoi {
	return {
		id: ID_ENVOI,
		libelle: 'Fiche du lundi',
		nature: 'lecon',
		niveau: 'cm1',
		blocs: [{ lecon: LECON_A, exercices: [] }],
	};
}

function capture(): Capture {
	const c = nouvelleCapture([
		{ lecon: LECON_A, enonce: '2 + 5 = …', attendue: '7' },
		{ lecon: LECON_A, enonce: '3 + 5 = …', attendue: '8' },
	]);
	noterReponse(c, 0, { statut: 'juste', saisie: '7' });
	noterReponse(c, 1, { statut: 'faux', saisie: '6' });
	return c;
}

/** Joue le premier passage de l'envoi SUR le profil `uuid` (rendu actif le temps du
 *  passage, par le vrai chemin `terminerPremierPassage`), puis rétablit l'actif. */
function jouerSur(uuid: string, id: string): Resultat {
	const precedent = activeProfile().uuid;
	setActiveProfile(uuid);
	const r = terminerPremierPassage(envoi(), capture(), { pseudo: 'Léa', date: DATE_PASSAGE, id });
	setActiveProfile(precedent);
	expect(r.id, 'précondition : le passage porte l’id donné').toBe(id);
	return r;
}

describe('passageJoueIci — ce résultat est-il le premier passage joué ici par CE profil ?', () => {
	it('vrai pour le profil qui l’a joué, interrogé pendant qu’un autre est actif, sans rien écrire', () => {
		const { actif, cible } = deuxProfils();
		const r = jouerSur(cible.uuid, ID_PREMIER);
		const avant = instantane();

		expect(passageJoueIci(cible.uuid, r)).toBe(true);

		expect(activeProfile().uuid).toBe(actif.uuid);
		expect(clesModifiees(avant, instantane())).toEqual([]);
	});

	it('faux pour un autre profil, y compris quand il a joué le même envoi de son côté', () => {
		const { actif, cible } = deuxProfils();
		const rCible = jouerSur(cible.uuid, ID_PREMIER);
		expect(passageJoueIci(actif.uuid, rCible), 'profil qui n’a rien joué').toBe(false);

		const rActif = jouerSur(actif.uuid, ID_PASSAGE_ACTIF);
		expect(passageJoueIci(actif.uuid, rCible), 'même envoi, passage de l’autre').toBe(false);
		expect(passageJoueIci(cible.uuid, rActif), 'même envoi, passage de l’autre').toBe(false);
		expect(passageJoueIci(actif.uuid, rActif), 'son propre passage').toBe(true);
	});

	it('faux pour un autre résultat du même envoi, ou pour le même id rattaché à un autre envoi', () => {
		const { cible } = deuxProfils();
		const r = jouerSur(cible.uuid, ID_PREMIER);

		expect(passageJoueIci(cible.uuid, { ...r, id: ID_AILLEURS }), 'passage joué ailleurs').toBe(
			false,
		);
		expect(
			passageJoueIci(cible.uuid, { ...r, envoi: { ...r.envoi, id: ID_AUTRE_ENVOI } }),
			'aucun passage gardé pour cet envoi',
		).toBe(false);
	});

	it.each([
		['du texte illisible', 'pas du json'],
		['null', 'null'],
		['un tableau', '[]'],
		['une chaîne', '"EnvoiTest001"'],
		['une entrée nulle', JSON.stringify({ [ID_ENVOI]: null })],
		// Le seul champ que la comparaison regarde, sans rien d'autre d'un résultat.
		['une entrée réduite à l’id', JSON.stringify({ [ID_ENVOI]: { id: ID_PREMIER } })],
	])('stockage corrompu (%s) : faux, sans lever', (_, brut) => {
		const { cible } = deuxProfils();
		const r = jouerSur(cible.uuid, ID_PREMIER);
		lsSetRaw(cible.uuid + '/' + PARTAGES_RECUS_KEY, brut);

		expect(passageJoueIci(cible.uuid, r)).toBe(false);
	});
});
