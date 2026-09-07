/* ============================================================
   #660 — huit trophées pour reconnaître ce que la répétition espacée fait
   déjà en silence : un élément qui gravit tout l'escalier d'intervalles
   (`REVISION_INTERVALLES`, `src/core/revision.ts`) sort de la rotation au
   palier `PALIER_ACQUIS` (= 6) SANS jamais être signalé à l'enfant. Deux
   familles d'ids : mots d'orthographe ancrés (`orthoAncres1/150/300/420`) et
   notions ancrées — paires leçon × niveau — (`notionsAncrees1/45/120/200`).

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
   « N calculs », et XP (2 au total) reste loin du niveau 2 (12) — mais la
   session écrit quand même des stats de leçon et de l'XP en direct, donc RIEN
   ne garantit qu'un AUTRE trophée d'effort ne bascule pas dans le même
   mouvement. D'où le resserrage ci-dessous : chaque assertion de critère 6/7
   NOMME `notionsAncrees1`, elle ne se contente pas d'un comptage global qui
   serait tout aussi vert si un trophée sans rapport avait basculé à la place.

   Critères couverts (numérotation #660) :
   - 6 : le palier franchi PENDANT la session est annoncé sur l'écran de fin
     (`#celebrateList`), par le même chemin que les autres récompenses — ET
     l'annonce nomme SPÉCIFIQUEMENT `notionsAncrees1` (son titre, lu dans la
     galerie, doit apparaître dans le texte de la célébration), pas un
     trophée voisin qui aurait basculé dans le même mouvement.
   - 7 : la galerie (modale « Trophées ») affiche cette famille comme les
     autres — SANS rendu inventé — ET c'est LA BONNE cellule qui bascule :
     `[data-trophy-id="notionsAncrees1"]` passe de `.trophy.off` à
     `.trophy.on`, tandis que le dénominateur (`#tropheesContent .trophy`,
     total) ne bouge pas (la cellule existait déjà, verrouillée — aucune
     grille séparée n'a été ajoutée pour cette famille).
   - 9 (négatif) : rien n'est annoncé au milieu de la session — le
     franchissement a lieu sur l'item 1/2 (pas le dernier), aucune modale ne
     doit apparaître avant le clic sur « Terminer ».
   - 10 (négatif, BEST-EFFORT — voir note dans le test) : le feedback
     affiché à l'enfant sur l'item qui vient de franchir le palier ne doit
     rien laisser filtrer sur l'état interne (palier/« ancré »/« acquis »).

   Discriminance vérifiée explicitement (demande de resserrage) :
   `notionsAncrees45` — le palier SUIVANT de la MÊME famille — est lu à
   chaque ouverture de la galerie et DOIT rester verrouillé. Une
   implémentation buguée qui allumerait toute la famille d'un coup (au lieu
   du seul palier franchi) ferait rougir cette ligne précise, que l'ancienne
   version par comptage global ne pouvait pas distinguer d'un déblocage
   correct (`total`/`acquis` auraient bougé pareil dans les deux cas).

   Ce que la version RESSERRÉE attrape et que l'ancienne (comptage seul)
   laissait passer : un trophée SANS RAPPORT qui basculerait dans la même
   session (la session écrit aussi de l'XP et des stats de leçon, donc un
   trophée d'effort peut basculer dans le même mouvement) faisait déjà
   avancer `acquis` de 1 et laissait `total` inchangé — indiscernable, dans
   l'ancienne version, d'un déblocage correct de `notionsAncrees1`. Nommer
   l'id cible (`[data-trophy-id="notionsAncrees1"]`) et vérifier le voisin
   (`notionsAncrees45`) ferme ce trou : le test ne peut plus être satisfait
   que par LE bon trophée.

   Sélecteur `data-trophy-id` : ajouté à `unlocks-view.ts` (`trophiesContentHTML`)
   suite à la remontée initiale de cette spec (le rendu n'exposait auparavant
   aucun identifiant, seulement un titre non figé — relecture pédagogique en
   cours). On continue de ne JAMAIS hardcoder le libellé d'un trophée : le
   titre de `notionsAncrees1` est lu dynamiquement dans la galerie puis
   cherché dans le texte de la célébration, jamais écrit en dur ici.

   Sélecteurs stables utilisés : #revProg, .posee-input, #revValidate,
   .rev-feedback, #revNext, .rev-done, #celebrate, #celebrateList,
   #celebrateOk, [data-act="open-trophees"], #trophees, #tropheesContent,
   .trophy, .trophy.on, [data-trophy-id], .trophy-title.
   ============================================================ */
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

/* État d'UN trophée précis dans la galerie déjà ouverte : verrouillé/débloqué (classe
   `.trophy.on`/`.off`) + son titre (jamais comparé à un libellé en dur, seulement
   RE-cherché tel quel dans le texte d'une autre modale — cf. critère 6 ci-dessous). */
async function etatTrophee(page: Page, id: string): Promise<{ on: boolean; titre: string }> {
	const cell = page.locator(`[data-trophy-id="${id}"]`);
	await expect(cell).toHaveCount(1);
	const classes = (await cell.getAttribute('class')) ?? '';
	const titre = ((await cell.locator('.trophy-title').textContent()) ?? '').trim();
	return { on: classes.split(/\s+/).includes('on'), titre };
}

interface EtatGalerie {
	total: number;
	acquis: number;
	notionsAncrees1On: boolean;
	notionsAncrees45On: boolean;
	notionsAncrees1Titre: string;
}

/* Ouvre la modale « Trophées » depuis l'accueil, lit le dénominateur global (`total`),
   le numérateur (`acquis`), PLUS l'état nommé de `notionsAncrees1` et de son voisin de
   famille `notionsAncrees45` (discriminance), puis referme (Échap, comme
   `modales-statiques.spec.ts`). */
async function ouvrirTropheesEtLire(page: Page): Promise<EtatGalerie> {
	await page.locator('[data-act="open-trophees"]').click();
	await expect(page.locator('#trophees')).toBeVisible();
	await page.locator('#tropheesContent .trophy').first().waitFor();
	const total = await page.locator('#tropheesContent .trophy').count();
	const acquis = await page.locator('#tropheesContent .trophy.on').count();
	const notionsAncrees1 = await etatTrophee(page, 'notionsAncrees1');
	const notionsAncrees45 = await etatTrophee(page, 'notionsAncrees45');
	await page.keyboard.press('Escape');
	await expect(page.locator('#trophees')).toBeHidden();
	return {
		total,
		acquis,
		notionsAncrees1On: notionsAncrees1.on,
		notionsAncrees45On: notionsAncrees45.on,
		notionsAncrees1Titre: notionsAncrees1.titre,
	};
}

test('critères 6, 7, 9 : notionsAncrees1 (et lui seul) est annoncé et débloqué par une session dont il n’est PAS le dernier item', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedSessionPalier5(UUID));

	// ---------- Baseline AVANT la session : `notionsAncrees1` ET son voisin verrouillés. ----------
	await gotoHash(page, 'accueil');
	const avant = await ouvrirTropheesEtLire(page);
	expect(avant.notionsAncrees1On).toBe(false);
	expect(avant.notionsAncrees45On).toBe(false);

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

	// Critère 6 (annonce) : quelque chose EST annoncé à l'écran de fin — capturé ici,
	// vérifié ci-dessous une fois qu'on connaît le VRAI titre de `notionsAncrees1`.
	await expect(page.locator('#celebrate')).toBeVisible();
	const celebrateTexte = ((await page.locator('#celebrateList').innerText()) ?? '').trim();
	expect(celebrateTexte).toMatch(/Trophée\s*:/);

	await page.locator('#celebrateOk').click();
	await expect(page.locator('#celebrate')).not.toBeVisible();

	// ---------- Critère 7 (resserré) : LA bonne cellule bascule, pas une autre. ----------
	await gotoHash(page, 'accueil');
	const apres = await ouvrirTropheesEtLire(page);

	// Le dénominateur ne bouge pas entre les deux lectures : aucune grille ni compteur
	// séparés n'ont été ajoutés pour cette famille.
	expect(apres.total).toBe(avant.total);
	// `notionsAncrees1` — et lui nommément — est maintenant débloqué.
	expect(apres.notionsAncrees1On).toBe(true);
	// Discriminance famille : le palier SUIVANT (`notionsAncrees45`) reste verrouillé —
	// une implémentation qui allumerait toute la famille d'un coup ferait rougir CETTE
	// ligne précise, que l'ancien comptage global ne pouvait pas voir.
	expect(apres.notionsAncrees45On).toBe(false);

	// Critère 6 (resserré) : le texte annoncé en fin de session nomme SPÉCIFIQUEMENT
	// `notionsAncrees1` (son titre, lu dans la galerie — jamais écrit en dur ici), pas un
	// trophée d'effort/XP sans rapport qui aurait basculé dans le même mouvement.
	expect(apres.notionsAncrees1Titre).toBeTruthy();
	expect(celebrateTexte).toContain(apres.notionsAncrees1Titre);

	expect(errors).toEqual([]);
});
