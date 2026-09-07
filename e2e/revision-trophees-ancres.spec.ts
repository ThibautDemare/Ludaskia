/* ============================================================
   #660 — huit trophées pour reconnaître ce que la répétition espacée fait
   déjà en silence : un élément qui gravit tout l'escalier d'intervalles
   (`REVISION_INTERVALLES`, `src/core/revision.ts`) sort de la rotation au
   palier `PALIER_ACQUIS` (= 6) SANS jamais être signalé à l'enfant. Deux
   familles d'ids : mots d'orthographe ancrés (`orthoAncres1/150/300/420`) et
   notions ancrées — paires leçon × niveau — (`notionsAncrees1/45/120/200`).

   Écrite AVANT l'implémentation (rouge attendu) : aucun de ces huit ids
   n'existe encore dans `TROPHIES` (`src/core/rewards.ts`), donc
   `evaluateTrophies()` ne peut rien débloquer pour eux — la spec doit
   échouer sur « rien n'a été annoncé/ajouté », pas sur un sélecteur
   introuvable pour une raison sans rapport.

   Périmètre volontairement restreint à la famille NOTIONS (paires
   leçon@niveau, portées par `ludaskia_lessonRevision`) : la famille MOTS
   partage le MÊME mécanisme (`evaluateTrophies` → `recompensesFin` →
   `announceRewards` → `trophiesContentHTML`), seule la métrique de
   `GSnapshot` changerait (mots acquis vs paires acquises). La couvrir EN
   PLUS obligerait à seeder aussi `ludaskia_ortho` et à jouer un mode
   motCache/tuiles/dictee dans la même session, sans rien prouver de plus sur
   le CHEMIN commun testé ici. À reprendre séparément si l'implémentation du
   comptage des mots s'avère spécifique (ex. mots partagés entre listes).

   Amorçage — palier 5, pas 6 : `applyActive` (`src/core/profiles.ts`)
   appelle `evaluateTrophies()` à l'activation du profil et JETTE le
   résultat (absorption volontaire, cf. `absorberTropheesDeReparation`). Un
   élément semé DÉJÀ au palier 6 se ferait donc absorber en silence dès le
   premier chargement, et le trophée ne serait jamais ANNONCÉ — exactement
   le défaut que #660 corrige. Semer juste EN DESSOUS (palier 5) et laisser
   UNE réponse juste de la session faire franchir le palier en direct
   reproduit le seul chemin où l'annonce compte.

   Deux leçons « posée » dues (mêmes ids que `revision-recompenses.spec.ts`,
   #659), à des `prochaineRevision` distinctes pour contrôler l'ordre (le tri
   final de session est par retard croissant, `revision-select.ts`) :
   - `calc-addition-posee@ce2` : palier 5, la PLUS en retard → item 1/2. Une
     réponse juste la fait passer à 6 = PALIER_ACQUIS, ce qui doit débloquer
     `notionsAncrees1` (seuil 1, une seule paire suffit).
   - `calc-soustraction-posee@ce2` : palier 2, moins en retard → item 2/2.
     Neutre : sert seulement à ce que le franchissement ait lieu SUR UN ITEM
     QUI N'EST PAS LE DERNIER (critère 9).
   Aucune stat de leçon préexistante n'est semée (contrairement à #659) :
   avec seulement 2 réponses ajoutées, `totalAnswered` reste loin des seuils
   « N calculs », et XP (2 au total) reste loin du niveau 2 (12) — la session
   ne doit rien déclencher d'AUTRE que le trophée testé, sans quoi
   `#celebrateList` et les comptages de la galerie deviendraient ambigus.

   Critères couverts (numérotation #660) :
   - 6 : le palier franchi PENDANT la session est annoncé sur l'écran de fin
     (`#celebrateList`), par le même chemin que les autres récompenses.
   - 7 : la galerie (modale « Trophées ») affiche cette famille comme les
     autres — SANS rendu inventé. Vérifié par une DIFFÉRENCE de comptage
     dans `#tropheesContent .trophy` avant/après la session (même dénominateur,
     +1 sur `.trophy.on`) plutôt que par un texte : si #660 avait dessiné une
     grille ou un compteur séparés pour ces familles, ce comptage ne
     bougerait pas comme attendu.
   - 9 (négatif) : rien n'est annoncé au milieu de la session — le
     franchissement a lieu sur l'item 1/2 (pas le dernier), aucune modale ne
     doit apparaître avant le clic sur « Terminer ».
   - 10 (négatif, BEST-EFFORT — voir note dans le test) : le feedback
     affiché à l'enfant sur l'item qui vient de franchir le palier ne doit
     rien laisser filtrer sur l'état interne (palier/« ancré »/« acquis »).

   Sélecteurs stables utilisés : #revProg, .posee-input, #revValidate,
   .rev-feedback, #revNext, .rev-done, #celebrate, #celebrateList,
   #celebrateOk, [data-act="open-trophees"], #trophees, #tropheesContent,
   .trophy, .trophy.on.

   Sélecteur stable MANQUANT signalé au passage : `.trophy` (et sa variante
   `tierCell` dans `recompensesContentHTML`) ne porte aucun `data-trophy-id`.
   Impossible donc de cibler UNE cellule précise sans dépendre de son titre —
   or les titres/descriptions de #660 ne sont pas figés (relecture pédago en
   cours), et cette spec doit rester verte quel que soit le libellé retenu.
   D'où le choix d'un test par COMPTAGE (transition .off → .on, dénominateur
   stable) plutôt que par correspondance de texte. Ajouter
   `data-trophy-id="${t.id}"` sur la cellule (`unlocks-view.ts`, les deux
   fonctions qui rendent des `.trophy`) permettrait des specs futures bien
   plus ciblées. */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const UUID = 'e2e-660-notions-ancrees';

function seedSessionPalier5(uuid: string): string {
	return `(() => {
    const now = Date.now(); const day = 86400000;
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: uuid,
			}),
		)});
    localStorage.setItem('${uuid}/ludaskia_lessonRevision', JSON.stringify({
      'calc-addition-posee@ce2': { palier: 5, prochaineRevision: now - 5 * day, reussites: 5, dernierTest: now - 40 * day },
      'calc-soustraction-posee@ce2': { palier: 2, prochaineRevision: now - day, reussites: 2, dernierTest: now - 3 * day },
    }));
  })();`;
}

/* Remplit TOUTES les cases-résultat de la grille posée courante avec leur `data-answer`
   (réponse garantie CORRECTE), sans recalculer l'opération — même principe que
   `revision-recompenses.spec.ts` (#659). */
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

async function ouvrirTropheesEtCompter(
	page: Page,
): Promise<{ acquis: number; total: number }> {
	await page.locator('[data-act="open-trophees"]').click();
	await expect(page.locator('#trophees')).toBeVisible();
	await page.locator('#tropheesContent .trophy').first().waitFor();
	const acquis = await page.locator('#tropheesContent .trophy.on').count();
	const total = await page.locator('#tropheesContent .trophy').count();
	await page.keyboard.press('Escape');
	await expect(page.locator('#trophees')).toBeHidden();
	return { acquis, total };
}

test('critères 6, 7, 9 : une notion ancrée PENDANT la session (item non final) est annoncée à l’écran de fin et rejoint la galerie, jamais avant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedSessionPalier5(UUID));

	// ---------- Baseline AVANT la session : compteur/état de la galerie. ----------
	await gotoHash(page, 'accueil');
	const avant = await ouvrirTropheesEtCompter(page);

	// ---------- Session : item 1/2 = la paire au palier 5 (la plus en retard). ----------
	await gotoHash(page, 'revision-espacee');
	await expect(page.locator('#revProg')).toHaveText('1 / 2');

	await remplirPoseeCorrectement(page);
	await page.locator('#revValidate').click();
	const feedback1 = page.locator('.rev-feedback.ok');
	await expect(feedback1).toBeVisible();

	// Critère 9 : le franchissement (palier 5 → 6, en arrière-plan) vient d'avoir
	// lieu sur l'item 1/2 — PAS le dernier — et rien n'est encore annoncé.
	await expect(page.locator('#celebrate')).not.toBeVisible();

	// Critère 10 (best-effort, voir en-tête) : le feedback affiché à l'enfant sur
	// CET item précis (celui qui vient d'atteindre le palier maximal) ne doit rien
	// laisser filtrer sur l'état interne. Ce filet attrape la régression la plus
	// probable (un texte ajouté directement ici) ; il ne prouve pas l'absence de
	// fuite sur tout autre écran enfant, hors périmètre mécanisable de cette spec.
	const texteFeedback1 = (await feedback1.textContent()) ?? '';
	expect(texteFeedback1).not.toMatch(/palier|ancr|acquis|maximal|6\s*\/\s*6/i);

	await page.locator('#revNext').click(); // « Continuer ▶ »
	await expect(page.locator('#revProg')).toHaveText('2 / 2');
	await expect(page.locator('#celebrate')).not.toBeVisible();

	// ---------- Item 2/2 : neutre (palier 2), dernier item de la session. ----------
	await remplirPoseeCorrectement(page);
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible();
	// Toujours rien : on est sur le verdict du DERNIER item, pas encore sur l'écran
	// de fin (`renderDone` n'est déclenché qu'au clic sur « Terminer » ci-dessous).
	await expect(page.locator('#celebrate')).not.toBeVisible();

	await page.locator('#revNext').click(); // « Terminer » → écran de fin
	await expect(page.locator('.rev-done')).toBeVisible();

	// Critère 6 : la notion ancrée pendant CETTE session est annoncée à l'écran de
	// fin, par le même chemin que les autres récompenses (`#celebrate`/`#celebrateList`,
	// `showCelebration` — `ui/effects.ts`). Le préfixe « Trophée : » est un format
	// d'application partagé par TOUS les trophées (`recompenses-fin.ts:39`), pas le
	// libellé propre à #660 : le vérifier ne fige aucune formulation de ce lot.
	await expect(page.locator('#celebrate')).toBeVisible();
	await expect(page.locator('#celebrateList')).toContainText(/Trophée\s*:/);

	await page.locator('#celebrateOk').click();
	await expect(page.locator('#celebrate')).not.toBeVisible();

	// ---------- Critère 7 : la galerie affiche la notion ancrée COMME LES AUTRES. ----------
	await gotoHash(page, 'accueil');
	const apres = await ouvrirTropheesEtCompter(page);

	// Le dénominateur ne bouge pas entre les deux lectures : la cellule existait déjà,
	// verrouillée, avant d'être décrochée — aucune grille ni compteur séparés n'ont
	// été ajoutés pour cette famille (sans quoi `total` aurait changé ici).
	expect(apres.total).toBe(avant.total);
	// Une cellule de plus est passée de .trophy.off à .trophy.on : la transition a
	// bien eu lieu DANS la grille commune.
	expect(apres.acquis).toBe(avant.acquis + 1);

	expect(errors).toEqual([]);
});
