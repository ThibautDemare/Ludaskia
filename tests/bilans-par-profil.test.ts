/* ============================================================
   Favoris (BilanConfig) lus et supprimés PAR PROFIL (#636) — src/core/bilans.ts.

   Auteur des tests DISTINCT de l'auteur du code, écrits AVANT l'implémentation : au moment
   où ce fichier est écrit, `src/core/bilans.ts` ne sait lire et écrire que les favoris du
   profil ACTIF (`lsGet`/`lsSet`, donc clé préfixée par le profil courant).

   Pourquoi ça change avec #636 : la suppression d'un favori QUITTE l'écran enfant pour
   l'espace encadrant. L'adulte y consulte un profil SANS basculer dessus — le profil actif
   reste celui de l'enfant qui jouait. Deux fonctions par uuid sont donc nécessaires, sur le
   modèle de `chargerSeancesFor` / `enregistrerSeancesFor` (src/core/seance.ts).

   Critères couverts : 2 (versant donnée : la liste est celle du profil CONSULTÉ) et 20
   (négatif : supprimer chez A ne touche pas B). Le rendu de l'écran encadrant, la
   confirmation nommée et le retrait de la cible des étapes concernées (critères 13 et 15)
   sont visuels → e2e.

   Fichier séparé de tests/seance-favori.test.ts : autre module, autre contrat.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { loadBilans, saveBilan, loadBilansFor, deleteBilanFor } from '../src/core/bilans';
import {
	initProfiles,
	activeProfile,
	addProfile,
	setActiveProfile,
	touchActiveProfile,
	loadProfilesMeta,
} from '../src/core/profiles';
import { setOnDataWrite, lsSet, PROFILES_KEY } from '../src/core/storage';
import type { BilanConfig } from '../src/core/catalog';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Leçons RÉELLES : le chargement rattache un favori mono-catégorie à sa catégorie (#65),
   ce qui ne doit rien changer aux lectures par uuid. */
const LECON_A = 'math-doubles';
const LECON_B = 'math-moities';

function favori(id: string, label: string, mode?: 'bilan' | 'sprint'): BilanConfig {
	const b: BilanConfig = { id, label, lessonIds: [LECON_A, LECON_B], questionsPerLesson: 3 };
	if (mode !== undefined) b.mode = mode;
	return b;
}
/** Enregistre des favoris POUR un profil, par le chemin réel (l'enfant les compose depuis
    son écran, donc en étant le profil actif), puis rend la main au profil laissé actif. */
function semerFavoris(uuid: string, ...configs: BilanConfig[]): void {
	const avant = activeProfile().uuid;
	setActiveProfile(uuid);
	for (const c of configs) saveBilan(c);
	setActiveProfile(avant);
}
function ids(list: BilanConfig[]): string[] {
	return list.map((b) => b.id);
}

describe('loadBilansFor : la liste du profil CONSULTÉ, sans bascule (critère 2)', () => {
	it('rend les favoris de l’uuid demandé, pas ceux du profil actif', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		semerFavoris(a, favori('f-a1', 'Tables de A'), favori('f-a2', 'Conjugaison de A', 'sprint'));
		semerFavoris(b, favori('f-b1', 'Orthographe de B'));

		// L'adulte consulte depuis l'espace encadrant : le profil ACTIF reste celui de A.
		setActiveProfile(a);
		expect(ids(loadBilansFor(b))).toEqual(['f-b1']);
		expect(ids(loadBilansFor(a))).toEqual(['f-a1', 'f-a2']);
		// La consultation n'a pas basculé le profil actif au passage.
		expect(activeProfile().uuid).toBe(a);
	});

	it('un profil sans aucun favori rend une liste vide (et non celle d’un autre)', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		semerFavoris(a, favori('f-a1', 'Tables de A'));
		expect(loadBilansFor(b)).toEqual([]);
	});

	it('lire par uuid le profil ACTIF donne exactement la même liste que `loadBilans()`', () => {
		// Invariant : deux portes d'entrée sur la même donnée ne doivent pas diverger (même
		// rattachement de catégorie, même ordre, mêmes champs). Sans lui, l'espace encadrant
		// afficherait une liste subtilement différente de celle que voit l'enfant.
		const a = activeProfile().uuid;
		semerFavoris(a, favori('f-a1', 'Sans mode'), favori('f-a2', 'En sprint', 'sprint'));
		expect(loadBilansFor(a)).toEqual(loadBilans());
	});

	it('le mode enregistré est conservé (critère 3, versant donnée)', () => {
		const a = activeProfile().uuid;
		semerFavoris(
			a,
			favori('f-bilan', 'Un bilan', 'bilan'),
			favori('f-sprint', 'Un sprint', 'sprint'),
		);
		const lus = loadBilansFor(a);
		expect(lus.find((b) => b.id === 'f-bilan')!.mode).toBe('bilan');
		expect(lus.find((b) => b.id === 'f-sprint')!.mode).toBe('sprint');
	});

	it('un uuid inconnu ne fait pas tomber la lecture', () => {
		expect(loadBilansFor('uuid-qui-n-existe-pas')).toEqual([]);
	});
});

describe('deleteBilanFor : la suppression ne touche QUE le profil consulté (critère 20)', () => {
	it('deux enfants, un favori de MÊME id : supprimer chez A le laisse chez B', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		// Même id des deux côtés : c'est exactement le cas que le critère 20 décrit.
		semerFavoris(a, favori('f-commun', 'Révisions du soir'), favori('f-a2', 'Autre chez A'));
		semerFavoris(b, favori('f-commun', 'Révisions du soir'));

		// L'adulte consulte A alors que B est le profil actif (aucune bascule attendue).
		setActiveProfile(b);
		deleteBilanFor(a, 'f-commun');

		expect(ids(loadBilansFor(a))).toEqual(['f-a2']);
		expect(ids(loadBilansFor(b))).toEqual(['f-commun']);
		expect(activeProfile().uuid).toBe(b);
		// Le profil actif lit toujours SA liste : le préfixe de stockage n'a pas été déréglé.
		expect(ids(loadBilans())).toEqual(['f-commun']);
	});

	it('supprimer un id absent ne retire rien, chez personne', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		semerFavoris(a, favori('f-a1', 'Chez A'));
		semerFavoris(b, favori('f-b1', 'Chez B'));
		deleteBilanFor(a, 'f-b1'); // l'id existe… mais chez B
		expect(ids(loadBilansFor(a))).toEqual(['f-a1']);
		expect(ids(loadBilansFor(b))).toEqual(['f-b1']);
	});

	it('la suppression marque le profil consulté comme modifié (fusion par récence)', () => {
		// Même exigence que `enregistrerSeancesFor` : sans ce marquage, un import de sauvegarde
		// plus « récent » ressusciterait un favori que l'adulte vient de supprimer.
		const a = activeProfile().uuid;
		const b = addProfile('Enfant B').uuid;
		semerFavoris(a, favori('f-a1', 'Chez A'));
		setActiveProfile(b);

		// On vieillit artificiellement les deux profils pour que la comparaison ait un sens.
		const meta = loadProfilesMeta()!;
		for (const p of meta.list) p.updatedAt = 1_000;
		lsSet(PROFILES_KEY, meta);

		deleteBilanFor(a, 'f-a1');

		const apres = loadProfilesMeta()!;
		expect(apres.list.find((p) => p.uuid === a)!.updatedAt).toBeGreaterThan(1_000);
		// …et pas l'autre : une suppression chez A n'a rien changé chez B.
		expect(apres.list.find((p) => p.uuid === b)!.updatedAt).toBe(1_000);
	});
});
