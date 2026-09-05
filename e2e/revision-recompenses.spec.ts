/* ============================================================
   #659 — « Révision espacée : les trophées et niveaux gagnés ne sont jamais
   annoncés ». `src/ui/revision.ts` fait avancer XP, trophées et niveau
   (`addXP`, `recordRun`, `recordLessonStats`, `recordSessionActivity`) mais
   son écran de fin (`renderDone`) n'annonce rien : c'est le SEUL écran de fin
   de run à ne jamais passer par `announceRewards` (`ui/effects.ts`), la porte
   commune des autres modes (leçon, ortho, sprint, séance).

   Écrit AVANT l'implémentation (rouge attendu) : rien dans `revision.ts`
   n'importe encore `announceRewards` (cf. `tests/annonce-recompenses-gate.test.ts`,
   côté statique) ni ne calcule de récompenses de fin (`tests/recompenses-fin.test.ts`,
   côté calcul). Cette spec couvre ce que les deux Vitest ne peuvent PAS voir :
   le rendu réel à l'écran, et le MOMENT où il apparaît.

   Critères couverts ici (numérotés comme dans #659) :
   - 1 : un trophée décroché pendant la session est annoncé à l'écran de fin ;
   - 2 : un niveau franchi est annoncé de même, AVEC les déblocages du palier ;
   - 3 : plusieurs récompenses de la même session sont TOUTES annoncées
     (chaînage modale de niveau → modale de célébration générique) ;
   - 6 (négatif) : rien n'est annoncé AU MILIEU de la session, même quand le
     franchissement a lieu sur le 1er item d'une session qui en compte deux ;
   - 7 (négatif) : une session sans aucune récompense se termine comme
     aujourd'hui (aucune modale, aucune trace de récompense sur l'écran de fin).
   Les critères 4, 5 et 9 (chemin commun, pas de double annonce, autres écrans
   de fin inchangés) sont du ressort des Vitest ci-dessus, qui voient le
   câblage et le calcul — pas du rendu.

   Sélecteurs stables : #revProg, .posee-input, #revValidate, .rev-feedback,
   #revNext, .rev-done, #levelup, #levelupNum, #levelupUnlocks,
   .levelup-unlock, #levelupOk, #celebrate, #celebrateList.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* ---------- Amorçage : deux items dus (opérations posées) + seuils juste en dessous ----------

   Deux leçons « L'addition posée » / « La soustraction posée » (`src/data/maths/posee.ts`) :
   leur grille expose `.posee-input[data-answer]` par chiffre du résultat (cf.
   `core/items.ts:posedGridHTML`), donc une réponse CORRECTE se lit dans le DOM sans
   recalculer l'opération — même principe que `.ans[data-answer]` ailleurs. Chaque item
   compte pour EXACTEMENT une réponse (juste ou fausse), quel que soit son nombre de
   cases (`recordGrade`, `ui/revision.ts`) : un item = +1 XP si réussi, +1 question de
   stats à la fin de la session.

   Deux seuils placés à 1 de distance, pour que la session les fasse basculer :
   - XP = 33 = xpPourNiveau(3) - 1. xpPourNiveau(3) = xpVersSuivant(1) + xpVersSuivant(2)
     = round(12×1^0.89) + round(12×2^0.89) = 12 + 22 = 34 (calibrage documenté dans
     `src/core/progress.ts` et `docs/architecture/gamification.md` § XP & niveaux :
     « palier 1→2 = 12 XP »). Le 1er item réussi ajoute 1 XP → 34 → niveau 3, qui
     débloque le compagnon (`MASCOTTE`, seuil 3, `src/core/unlocks.ts`) : un niveau
     AVEC déblocage, pas un palier « sec » (critère 2 au complet).
   - Stats de leçon pré-existantes à 98 questions cumulées, posées sur L'UNE DES DEUX
     leçons DÉJÀ dues (`calc-addition-posee@ce2`) plutôt que sur une leçon tierce : une
     leçon avec des stats mais SANS état de révision se ferait réinjecter en rotation par
     `migrateRevisions`/`backfillLessonRevisions` (rattrapage d'historique, #45) à
     l'activation du profil — elle ajouterait un 3e item DÛ non désiré à la session,
     découvert en faisant tourner cette spec (la session comptait « 1 / 3 », pas « 1 / 2 »).
     Les 2 items de la session (+2 questions, écrites en un seul bloc par
     `recordLessonStats` à la toute fin, cf. `ui/revision.ts:renderDone`) portent le
     total à 100 → trophée « 100 calculs » (`vol100`, `TROPHIES` dans `src/core/rewards.ts`).
   L'XP, lui, est ajouté EN TEMPS RÉEL à chaque bonne réponse (`recordGrade`) : le
   niveau bascule donc DÈS le 1er item, en arrière-plan — exactement le cas que le
   critère 6 interdit d'annoncer avant la fin de la session. */
const UUID = 'e2e-revision-recompenses';
const XP_JUSTE_SOUS_NIVEAU3 = 33;

function seedDeuxItemsAvecRecompenses(uuid: string): string {
	return `(() => {
    const now = Date.now(); const day = 86400000;
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: uuid,
			}),
		)});
    localStorage.setItem('${uuid}/ludaskia_lessonRevision', JSON.stringify({
      'calc-addition-posee@ce2': { palier: 2, prochaineRevision: now - day, reussites: 2, dernierTest: now - 3 * day },
      'calc-soustraction-posee@ce2': { palier: 2, prochaineRevision: now - day, reussites: 2, dernierTest: now - 3 * day },
    }));
    localStorage.setItem('${uuid}/ludaskia_lessonStats', JSON.stringify({
      'calc-addition-posee@ce2': { attempts: 98, correct: 98, questions: 98, bestPct: 100, lastPct: 100 },
    }));
    localStorage.setItem('${uuid}/ludaskia_xp', '${XP_JUSTE_SOUS_NIVEAU3}');
  })();`;
}

/* Remplit TOUTES les cases-résultat de la grille posée courante avec leur `data-answer`
   (réponse garantie CORRECTE), sans recalculer l'opération. */
async function remplirPoseeCorrectement(page: Page): Promise<void> {
	const cells = page.locator('.posee-input');
	await cells.first().waitFor();
	const n = await cells.count();
	expect(n).toBeGreaterThan(0);
	for (let i = 0; i < n; i++) {
		const chiffre = await cells.nth(i).getAttribute('data-answer');
		expect(chiffre).not.toBeNull();
		await cells.nth(i).fill(chiffre ?? '');
	}
}

test('critères 1, 2, 3, 6 : trophée ET niveau (avec déblocage) sont annoncés ENSEMBLE à l’écran de fin, jamais entre deux items', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDeuxItemsAvecRecompenses(UUID));
	await gotoHash(page, 'revision-espacee');

	await expect(page.locator('#revProg')).toHaveText('1 / 2');

	// --- Item 1/2 : le franchir fait basculer XP → niveau 3 EN ARRIÈRE-PLAN (temps réel).
	await remplirPoseeCorrectement(page);
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible();

	// Critère 6 : rien à l'écran malgré le basculement de niveau qui vient d'avoir lieu.
	await expect(page.locator('#levelup')).not.toBeVisible();
	await expect(page.locator('#celebrate')).not.toBeVisible();

	await page.locator('#revNext').click(); // « Continuer ▶ »
	await expect(page.locator('#revProg')).toHaveText('2 / 2');
	await expect(page.locator('#levelup')).not.toBeVisible();
	await expect(page.locator('#celebrate')).not.toBeVisible();

	// --- Item 2/2 : le dernier de la session.
	await remplirPoseeCorrectement(page);
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible();
	// Toujours rien : on est sur le verdict du DERNIER item, pas encore sur l'écran de fin
	// (`renderDone` n'est déclenché qu'au clic sur « Terminer » ci-dessous).
	await expect(page.locator('#levelup')).not.toBeVisible();
	await expect(page.locator('#celebrate')).not.toBeVisible();

	await page.locator('#revNext').click(); // « Terminer » → écran de fin
	await expect(page.locator('.rev-done')).toBeVisible();

	// Critère 2 : le niveau franchi (3) est annoncé, AVEC le déblocage de ce palier
	// (le compagnon grandit, `MASCOTTE` seuil 3) — pas un palier muet.
	const levelup = page.locator('#levelup');
	await expect(levelup).toBeVisible();
	await expect(page.locator('#levelupNum')).toHaveText('3');
	await expect(page.locator('#levelupUnlocks')).toBeVisible();
	await expect(page.locator('.levelup-unlock')).toContainText('Ton compagnon grandit');

	// Critère 3 : à la fermeture de la modale de niveau, la célébration s'enchaîne — le
	// trophée gagné dans LA MÊME session (critère 1) n'est pas avalé par le niveau.
	await page.locator('#levelupOk').click();
	await expect(page.locator('#celebrate')).toBeVisible();
	await expect(page.locator('#celebrateList')).toContainText('Trophée : 100 calculs');

	expect(errors).toEqual([]);
});

/* ---------- Critère 7 (négatif) : session sans la moindre récompense ---------- */

const UUID_VIDE = 'e2e-revision-sans-recompense';

/* Un seul item dû, profil neuf (XP nul, aucune stat proche d'un seuil) : la session ne
   fait franchir NI niveau NI trophée. Réponse quelconque (juste ou fausse, peu importe :
   même une bonne réponse n'ajoute qu'1 XP, loin du seuil de niveau 2 à 12 XP). */
function seedUnItemSansSeuil(uuid: string): string {
	return `(() => {
    const now = Date.now(); const day = 86400000;
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: uuid,
			}),
		)});
    localStorage.setItem('${uuid}/ludaskia_lessonRevision', JSON.stringify({
      'num-valeur-position@ce2': { palier: 2, prochaineRevision: now - day, reussites: 2, dernierTest: now - 3 * day },
    }));
  })();`;
}

test('critère 7 : une session sans aucune récompense se termine SANS la moindre modale ni bloc orphelin', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedUnItemSansSeuil(UUID_VIDE));
	await gotoHash(page, 'revision-espacee');

	const input = page.locator('#revInput');
	await expect(input).toBeVisible();
	await input.fill('999999'); // jamais la bonne réponse d'une valeur de chiffre : sans incidence ici
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback')).toBeVisible();

	await page.locator('#revNext').click(); // seul item de la session → « Terminer »
	await expect(page.locator('.rev-done')).toContainText('terminée');

	// Aucune modale de récompense.
	await expect(page.locator('#levelup')).not.toBeVisible();
	await expect(page.locator('#celebrate')).not.toBeVisible();
	// Ni bloc vide ni titre orphelin glissé dans l'écran de fin lui-même (pas seulement
	// dans une modale) : aucune trace textuelle d'une annonce qui n'a pas lieu d'être.
	const texteFin = await page.locator('.rev-done').innerText();
	expect(texteFin).not.toContain('Trophée');
	expect(texteFin).not.toContain('Niveau');

	expect(errors).toEqual([]);
});
