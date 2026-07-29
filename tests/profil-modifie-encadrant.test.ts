/* ============================================================
   « Profil marqué comme modifié » (`Profile.updatedAt`) sur les écritures
   PAR UUID de l'espace encadrant.
   ------------------------------------------------------------
   Ces écritures visent le profil CONSULTÉ (clé réelle `uuid/…`), donc hors du
   préfixe actif : le hook d'écriture qui bumpe `updatedAt` ne les voit pas. Or
   l'import de profils fusionne PAR RÉCENCE (la version au `updatedAt` le plus
   grand gagne, cf. `importProfiles`), donc un `updatedAt` qui ne bouge pas fait
   perdre le geste de l'adulte.

   Règle éprouvée ici (dérivée de la fusion par récence, pas du code) :
     - une modification VOULUE par l'adulte marque le profil comme modifié ;
     - un effet AUTOMATIQUE ne le marque PAS — sinon la simple consultation de
       l'espace encadrant rendrait le profil « plus récent » que la sauvegarde
       d'un autre appareil, et fausserait la fusion dans l'autre sens.

   Le piège de régression visé : l'épinglage manuel (`toggleRevoirFor`) et le
   nettoyage automatique (`purgeRevoirSolides`) écrivent la file « à revoir » par
   le MÊME helper interne. Un refactor qui déplacerait le bump dans ce helper
   commun (ou l'en retirerait) doit faire rougir un test des DEUX côtés : chaque
   sens est donc assorti d'un contrôle de sensibilité.

   Observation du bump : `touchProfile` date via `Date.now()` (non injectable).
   On fige donc l'horloge le temps du geste (`auMoment`) et `updatedAt` à une
   sentinelle basse avant : l'attendu est une égalité EXACTE, sans dépendre de la
   granularité de l'horloge réelle.
   ============================================================ */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
	initProfiles,
	activeProfile,
	addProfile,
	loadProfilesMeta,
	touchActiveProfile,
	exportProfiles,
	importProfiles,
	type Profile,
} from '../src/core/profiles';
import { setOnDataWrite, lsSetRaw, lsGetItemRaw, PROFILES_KEY } from '../src/core/storage';
import { STARS_KEY } from '../src/core/progress';
import {
	toggleRevoirFor,
	purgeRevoirSolides,
	loadRevoirFor,
	orthoRevoirId,
	REVOIR_KEY,
	REVOIR_FRAGILE_KEY,
} from '../src/core/encadrant-stats';
import { enregistrerSeancesFor, chargerSeancesFor, type SeanceDef } from '../src/core/seance';
import { declarerVuAilleursFor, loadVuAilleursFor } from '../src/core/vu-ailleurs';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});
afterEach(() => {
	vi.restoreAllMocks(); // l'horloge est figée le temps de chaque geste
});

/* ---------- Repères ---------- */
const T0 = new Date(2026, 5, 15, 9, 0, 0, 0).getTime(); // 15 juin 2026, 9:00 (local)
const MIN = 60_000;
/* Valeur qu'aucune horloge réelle ne peut produire : si `updatedAt` la garde, il n'a
   pas été touché ; s'il change, on sait exactement à quel instant. */
const SENTINELLE = 1000;

/* ---------- Helpers ---------- */
/** Écriture BRUTE dans un profil ciblé, comme le fait l'espace encadrant. */
function seed(uuid: string, key: string, value: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(value));
}
/** Profil RELU depuis la méta (l'objet capturé plus tôt est périmé après un bump). */
function profil(uuid: string): Profile {
	const p = loadProfilesMeta()?.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	return p;
}
function updatedAt(uuid: string): number {
	return profil(uuid).updatedAt;
}
/** Fige `updatedAt` sans passer par une écriture de données (écriture brute de la méta). */
function figer(uuid: string, at: number): void {
	const m = loadProfilesMeta();
	if (!m) throw new Error('méta absente');
	const p = m.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	p.updatedAt = at;
	lsSetRaw(PROFILES_KEY, JSON.stringify(m));
}
/** Joue `geste` avec l'horloge figée à `t` : un bump vaut alors EXACTEMENT `t`. */
function auMoment<T>(t: number, geste: () => T): T {
	const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
	try {
		return geste();
	} finally {
		spy.mockRestore();
	}
}
/** Repart d'un `updatedAt` connu, joue `geste` à l'instant `quand`, renvoie l'`updatedAt`
    observé : `quand` = profil marqué modifié, SENTINELLE = profil laissé intact. */
function updatedApres(uuid: string, quand: number, geste: () => void): number {
	figer(uuid, SENTINELLE);
	auMoment(quand, geste);
	return updatedAt(uuid);
}

/** Deux profils : le CONSULTÉ (`vise`, pas l'actif) et l'actif (`autre`), tous deux
    figés à la sentinelle. C'est la situation réelle de l'espace encadrant : l'adulte
    règle un profil sans faire basculer l'enfant courant. */
function deuxProfils(): { vise: Profile; autre: Profile } {
	const vise = activeProfile();
	const autre = addProfile('Profil B'); // devient l'actif
	figer(vise.uuid, SENTINELLE);
	figer(autre.uuid, SENTINELLE);
	return { vise: profil(vise.uuid), autre: profil(autre.uuid) };
}

const LECON = 'math-doubles'; // leçon CE2 du catalogue (id stable, déjà utilisé par les tests voisins)
const AUTRE_LECON = 'math-moities';

/* ============================================================
   1. Épinglage manuel : geste de l'adulte → profil marqué modifié
   ============================================================ */
describe('toggleRevoirFor — épingler est un geste, il marque le profil', () => {
	it('marque le profil CONSULTÉ (pas l’actif) et ne fait basculer personne', () => {
		const { vise, autre } = deuxProfils();

		expect(updatedApres(vise.uuid, T0, () => toggleRevoirFor(vise.uuid, LECON))).toBe(T0);
		expect(loadRevoirFor(vise.uuid)).toEqual([LECON]); // l'épingle est bien posée
		expect(updatedAt(autre.uuid)).toBe(SENTINELLE); // l'autre profil n'a pas changé
		expect(loadProfilesMeta()?.active).toBe(autre.uuid); // aucune bascule d'enfant courant
	});

	it('DÉSÉPINGLER marque aussi le profil (retirer est une décision, pas un effet)', () => {
		const { vise } = deuxProfils();
		toggleRevoirFor(vise.uuid, LECON);

		expect(updatedApres(vise.uuid, T0 + MIN, () => toggleRevoirFor(vise.uuid, LECON))).toBe(
			T0 + MIN,
		);
		expect(loadRevoirFor(vise.uuid)).toEqual([]);
	});

	it('épingler une DICTÉE (entrée préfixée) marque le profil comme une leçon', () => {
		const { vise } = deuxProfils();
		const entree = orthoRevoirId('fr-ortho-invariables-1');

		expect(updatedApres(vise.uuid, T0, () => toggleRevoirFor(vise.uuid, entree))).toBe(T0);
		expect(loadRevoirFor(vise.uuid)).toEqual([entree]);
	});
});

/* ============================================================
   2. Nettoyage automatique : effet de la consultation → profil intact
   ------------------------------------------------------------
   `purgeRevoirSolides` tourne à chaque ouverture de l'espace encadrant. Il écrit
   la file par le MÊME helper que l'épinglage : c'est le point où un refactor
   « bump dans le helper commun » casserait la règle.
   ============================================================ */
describe('purgeRevoirSolides — un désépinglage AUTOMATIQUE ne marque pas le profil', () => {
	it('retire une entrée (donc réécrit la file) sans marquer le profil', () => {
		const { vise, autre } = deuxProfils();
		seed(vise.uuid, STARS_KEY, { [LECON + '@ce2']: 1 }); // notion redevenue solide
		seed(vise.uuid, REVOIR_KEY, [LECON, AUTRE_LECON]);
		figer(vise.uuid, SENTINELLE);

		expect(auMoment(T0, () => purgeRevoirSolides(vise, false, T0))).toEqual([LECON]);
		expect(loadRevoirFor(vise.uuid)).toEqual([AUTRE_LECON]); // la file a bien été réécrite
		expect(updatedAt(vise.uuid)).toBe(SENTINELLE); // …sans marquer le profil
		expect(updatedAt(autre.uuid)).toBe(SENTINELLE);

		// Contrôle de sensibilité : la MÊME écriture de file, déclenchée par un geste,
		// marque bien le profil. Sans ça, le test ci-dessus passerait aussi si plus
		// personne ne bumpait.
		expect(updatedApres(vise.uuid, T0 + MIN, () => toggleRevoirFor(vise.uuid, LECON))).toBe(
			T0 + MIN,
		);
	});

	it('une passe SANS retrait (simple consultation) écrit ses marques sans marquer le profil', () => {
		const { vise } = deuxProfils();
		toggleRevoirFor(vise.uuid, AUTRE_LECON); // jamais travaillée → jamais retirée d'office
		figer(vise.uuid, SENTINELLE);

		expect(auMoment(T0, () => purgeRevoirSolides(vise, false, T0))).toEqual([]);
		// La passe a bel et bien écrit (marques de fragilité) : le « pas de bump » n'est
		// pas l'effet d'une absence d'écriture.
		expect(lsGetItemRaw(vise.uuid + '/' + REVOIR_FRAGILE_KEY)).not.toBeNull();
		expect(loadRevoirFor(vise.uuid)).toEqual([AUTRE_LECON]);
		expect(updatedAt(vise.uuid)).toBe(SENTINELLE);
	});
});

/* ============================================================
   3. Les autres gestes de l'espace encadrant
   ============================================================ */
describe('autres écritures par UUID voulues par l’adulte', () => {
	const DEF: SeanceDef = {
		id: 'd1',
		etapes: [{ id: 'e1', kind: 'sprint', count: 1 }],
		recurrence: { type: 'hebdo', jours: [1] },
	};

	it('composer le programme du jour (enregistrerSeancesFor) marque le profil consulté', () => {
		const { vise, autre } = deuxProfils();

		expect(updatedApres(vise.uuid, T0, () => enregistrerSeancesFor(vise.uuid, [DEF]))).toBe(T0);
		expect(chargerSeancesFor(vise.uuid)).toEqual([DEF]);
		expect(updatedAt(autre.uuid)).toBe(SENTINELLE);
		expect(loadProfilesMeta()?.active).toBe(autre.uuid);
	});

	it('déclarer « vu en classe » marque le profil, et l’annulation aussi', () => {
		const { vise } = deuxProfils();
		const entrees = [{ lessonId: LECON, niveau: 'ce2' as const }];

		expect(
			updatedApres(vise.uuid, T0, () => declarerVuAilleursFor(vise.uuid, entrees, true, T0)),
		).toBe(T0);
		expect(Object.keys(loadVuAilleursFor(vise.uuid))).toEqual([LECON + '@ce2']);

		expect(
			updatedApres(vise.uuid, T0 + MIN, () =>
				declarerVuAilleursFor(vise.uuid, entrees, false, T0 + MIN),
			),
		).toBe(T0 + MIN);
		expect(loadVuAilleursFor(vise.uuid)).toEqual({});
	});

	it('une déclaration SANS effet (déjà cochée) ne marque pas le profil', () => {
		const { vise } = deuxProfils();
		const entrees = [{ lessonId: LECON, niveau: 'ce2' as const }];
		declarerVuAilleursFor(vise.uuid, entrees, true, T0);

		// Rien ne change dans les données → il n'y a pas de modification à faire gagner.
		expect(
			updatedApres(vise.uuid, T0 + MIN, () =>
				declarerVuAilleursFor(vise.uuid, entrees, true, T0 + MIN),
			),
		).toBe(SENTINELLE);
	});
});

/* ============================================================
   4. Conséquence réelle : la fusion par récence de l'import
   ------------------------------------------------------------
   Scénario du bug : le profil est aussi utilisé sur un autre appareil, dont la
   sauvegarde est plus récente que le DERNIER état connu ici — mais antérieure au
   geste que l'adulte vient de faire ici. C'est le geste local qui doit survivre.
   ============================================================ */
describe('fusion par récence à l’import — le geste local n’est pas écrasé', () => {
	/** Sauvegarde du profil prise « ailleurs » : contenu de l'état LOCAL ACTUEL,
	    horodatée à `quand` (une session s'est déroulée sur l'autre appareil à cet
	    instant). Le local est figé plus tôt : la sauvegarde est donc bien la plus
	    récente des deux au moment où elle est faite. */
	function sauvegardeAilleurs(uuid: string, quand: number) {
		figer(uuid, quand - MIN);
		const payload = exportProfiles([uuid]);
		if (!payload) throw new Error('export impossible');
		payload.profiles[0].updatedAt = quand;
		return payload;
	}

	it('un épinglage postérieur à la sauvegarde distante l’emporte (import ignoré)', () => {
		const uuid = activeProfile().uuid;
		const distante = sauvegardeAilleurs(uuid, T0); // sauvegarde SANS épingle

		auMoment(T0 + 5 * MIN, () => toggleRevoirFor(uuid, LECON)); // l'adulte épingle APRÈS

		expect(importProfiles(distante)).toEqual({ added: 0, updated: 0, skipped: 1 });
		expect(loadRevoirFor(uuid)).toEqual([LECON]); // l'épingle a survécu à la fusion
	});

	it('un nettoyage automatique, lui, ne protège pas le profil : le distant récent s’applique', () => {
		const uuid = activeProfile().uuid;
		seed(uuid, STARS_KEY, { [LECON + '@ce2']: 1 });
		seed(uuid, REVOIR_KEY, [LECON, AUTRE_LECON]);
		const distante = sauvegardeAilleurs(uuid, T0); // sauvegarde AVEC les deux épingles

		// Ouverture de l'espace encadrant : l'entrée redevenue solide part d'elle-même.
		auMoment(T0 + 5 * MIN, () => purgeRevoirSolides(profil(uuid), false, T0 + 5 * MIN));
		expect(loadRevoirFor(uuid)).toEqual([AUTRE_LECON]);

		// Consulter n'est pas modifier : la sauvegarde distante reste la plus récente et
		// s'applique (c'est l'autre sens de la règle — sans quoi un vrai changement fait
		// ailleurs serait bloqué par une simple visite ici).
		expect(importProfiles(distante)).toEqual({ added: 0, updated: 1, skipped: 0 });
		expect(loadRevoirFor(uuid)).toEqual([LECON, AUTRE_LECON]);
	});
});
