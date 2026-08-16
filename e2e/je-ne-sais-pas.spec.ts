/* ============================================================
   Smoke e2e — « Je ne sais pas, montre-moi » (#467).
   Sortie de secours d'un enfant bloqué : un lien discret sous le bouton de
   validation révèle la bonne réponse dans un 3ᵉ état de verdict NEUTRE (ni
   ✓ ni ✗), l'exercice est compté comme une réponse fausse assumée (0 XP,
   compté au dénominateur, jamais rejoué), et l'espace encadrant distingue
   « raté après tentative » de « passé sans essayer ».

   Couvre :
   1. Révision (format à saisie libre) : révélation en verdict neutre, pas
      de rejeu de la même question.
   1 bis. Régression verrouillée : la révélation d'un WIDGET fige la carte
      (`rev-stage--fige`), or `#revStage` survit d'une question à l'autre —
      sans dégel au rendu suivant, toute la suite de la séance devenait
      inerte (`pointer-events: none`), seuls les boutons « Écouter »
      répondant encore.
   2. Un widget dont « Vérifier »/« Valider » est encore désactivé (rien
      posé/relié) : la révélation ne marque AUCUNE erreur sur le widget.
   3. Régression verrouillée : le bloc de décision entier (`.lecon-decide`,
      pas seulement le bouton « Vérifier ») disparaît après une validation
      normale ET après une révélation — sans la règle CSS
      `.lecon-decide[hidden] { display: none }`, il restait visible à côté
      de « Continuer ».
   4. Sprint : valider un champ vide révèle la solution, compte la question
      au bilan final, sans le moindre point.
   5. Espace encadrant : une entrée « sansTentative » affiche la phrase
      adaptée au mode (révision vs sprint), jamais « Réponse donnée ».
   6. Droite graduée : les trois branches de la figure de révélation (repère
      de l'enfant faux, juste, ou jamais posé) — nombre de repères, légende
      et description accessible dédiée.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue, seedAideVueScript } from './helpers';

/* ---------- 1. Révision : format à saisie libre ---------- */

const UUID_REV = 'e2e-467';

/* Deux leçons DUES, avec des échéances distinctes (`prochaineRevision` croissant)
   pour figer l'ORDRE de passage : la 1re (num-valeur-position, réponse toujours
   numérique → toujours rendue en saisie libre `#revInput`, jamais en tuiles) sert
   à tester la révélation ; la 2e (num-comparer, libellé bien distinct : « Je
   compare les nombres » vs « La valeur des chiffres ») sert seulement à constater
   qu'on n'a PAS rejoué la même question après « Continuer ». */
function seedDeuxLeconsDues(): string {
	return `
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid: UUID_REV, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: UUID_REV,
			}),
		)});
    localStorage.setItem('${UUID_REV}/ludaskia_lessonRevision', JSON.stringify({
      'num-valeur-position': { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null },
      'num-comparer': { palier: 0, prochaineRevision: 2, reussites: 0, dernierTest: null }
    }));
    ${seedAideVueScript(UUID_REV)}
  `;
}

test('Révision (saisie libre) : « Je ne sais pas » révèle en verdict neutre, sans rejouer la question', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDeuxLeconsDues());
	await gotoHash(page, 'revision-espacee');

	await expect(page.locator('#revInput')).toBeVisible();
	const consigneAvant = (await page.locator('.rev-consigne').innerText()).trim();

	await page.locator('#revGiveUp').click();

	// Depuis #490, « Je ne sais pas » ouvre d'abord l'étayage de la notion quand la leçon en
	// porte un — et `num-valeur-position` en porte un depuis la généralisation (PR 2). C'est
	// le seul point d'entrée où le panneau PRÉCÈDE la réponse : l'enfant a réclamé
	// l'explication, la lui servir après le verdict reviendrait à ne pas la lui servir. Le
	// panneau franchi, la révélation neutre de #467 reprend, inchangée — c'est ce que la
	// suite de ce test vérifie.
	const panneau = page.locator('#etayageOverlay');
	if (await panneau.isVisible().catch(() => false)) {
		await page.locator('#etayageOverlay .aide-close').click();
		await expect(panneau).toHaveCount(0);
	}

	// Verdict NEUTRE : ni le vert du ✓, ni le rouge du ✗.
	await expect(page.locator('.rev-feedback.reveal')).toBeVisible();
	await expect(page.locator('.rev-feedback.ok')).toHaveCount(0);
	await expect(page.locator('.rev-feedback.ko')).toHaveCount(0);
	// Toute la carte (dont le bloc de décision) a été remplacée par le verdict.
	await expect(page.locator('.rev-decide')).toHaveCount(0);
	// Annoncée pour un lecteur d'écran, même quand le widget n'a rien à dire lui-même.
	await expect(page.locator('#revStatus')).toContainText('Pas grave, on la reverra bientôt.');

	// « Continuer » avance sur un item DIFFÉRENT (pas de rejeu de la question passée).
	await page.locator('#revNext').click();
	await expect(page.locator('.rev-consigne')).toBeVisible();
	const consigneApres = (await page.locator('.rev-consigne').innerText()).trim();
	expect(consigneApres).not.toBe(consigneAvant);

	expect(errors).toEqual([]);
});

/* ---------- 1 bis. La carte figée par une révélation ne doit pas déteindre ---------- */

/* Mêmes deux leçons, ÉCHÉANCES INVERSÉES : `num-comparer` passe en premier. Sa réponse
   est un SIGNE (< = >), donc la révision la rend en WIDGET de tuiles (jamais en saisie),
   ce qui est le cas visé : seuls les widgets appellent `neutraliserWidget`, donc seuls
   eux figent la carte. La 2e (num-valeur-position, réponse numérique) revient en saisie
   libre — un format sans `#revAfter`, celui où le figeage résiduel ne laissait plus RIEN
   d'opérable. */
function seedWidgetPuisSaisie(): string {
	return `
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid: UUID_REV, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: UUID_REV,
			}),
		)});
    localStorage.setItem('${UUID_REV}/ludaskia_lessonRevision', JSON.stringify({
      'num-comparer': { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null },
      'num-valeur-position': { palier: 0, prochaineRevision: 2, reussites: 0, dernierTest: null }
    }));
    ${seedAideVueScript(UUID_REV)}
  `;
}

test('Révision : une révélation sur un widget ne fige pas les questions suivantes', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedWidgetPuisSaisie());
	await gotoHash(page, 'revision-espacee');

	// 1re question : le widget de tuiles, révélé sans rien poser (« Valider » désactivé).
	await expect(page.locator('.tuile').first()).toBeVisible();
	await page.locator('#revGiveUp').click();
	await expect(page.locator('.rev-feedback.reveal')).toBeVisible();
	await expect(page.locator('#revStage')).toHaveClass(/rev-stage--fige/); // carte figée, attendu
	await page.locator('#revNext').click();

	// 2e question : la carte doit être DÉGELÉE. `#revStage` n'est pas recréé (seul son
	// contenu l'est), donc la classe de figeage y restait collée pour toute la séance.
	await expect(page.locator('#revInput')).toBeVisible();
	await expect(page.locator('#revStage')).not.toHaveClass(/rev-stage--fige/);

	// Vérification par le GESTE, pas seulement par la classe : Playwright refuse de cliquer
	// un élément qui ne reçoit pas les événements de pointeur — exactement le symptôme
	// constaté (plus un seul bouton cliquable, seul « Écouter » répondait).
	await page.locator('#revInput').fill('1');
	await page.locator('#revValidate').click();
	await expect(page.locator('#revNext')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ---------- 2 & 3. Widget bloqué + verrou de la régression `.lecon-decide[hidden]` ---------- */

test.describe('runners de leçon à widget', () => {
	test.beforeEach(async ({ page }) => {
		await seedAideVue(page); // évite l'overlay d'aide au 1er lancement du geste
	});

	test('Appariement : bloqué sans rien relier, la révélation ne marque aucune erreur sur le widget', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await gotoHash(page, 'lecon-fr-vocab-familles-relier');
		await page.locator('.lapp-mot').first().waitFor();

		// « Vérifier » est encore désactivé : rien n'a été relié — exactement le cas visé.
		await expect(page.locator('#lappVerif')).toBeDisabled();
		await page.locator('#leconPasser').click();

		// Verdict neutre affiché, bloc de décision ENTIER masqué (verrou #3).
		await expect(page.locator('.lecon-reveal')).toBeVisible();
		await expect(page.locator('.lecon-decide')).toBeHidden();
		await expect(page.locator('#leconPasser')).toBeHidden();

		// Aucune marque d'erreur sur un widget jamais complété : pas de `ctrl.verify()`
		// caché derrière la révélation (il poserait `.wrong`/`.is-decoy` sur des liens
		// jamais tentés).
		await expect(page.locator('.lapp-mot.wrong')).toHaveCount(0);
		await expect(page.locator('.lapp-mot.is-decoy')).toHaveCount(0);
		await expect(page.locator('.lapp-mark')).toHaveCount(0);

		await expect(page.locator('#lappActions button')).toBeVisible();
		expect(errors).toEqual([]);
	});

	test('Tri : après une validation normale, le bloc de décision entier disparaît (pas que « Vérifier »)', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await gotoHash(page, 'lecon-fr-vocab-champs-tri');
		await page.locator('.ltri-tuile').first().waitFor();

		// Range tout dans le 1er thème (peu importe la justesse, seul le geste complet compte).
		while ((await page.locator('.ltri-tuile').count()) > 0) {
			await page.locator('.ltri-tuile').first().click();
			await page.locator('.ltri-col').first().locator('.ltri-col-titre').click();
		}
		await expect(page.locator('#ltriVerif')).toBeEnabled();
		await page.locator('#ltriVerif').click();

		// Régression verrouillée (fix : `.lecon-decide[hidden] { display: none }`) : sans
		// cette règle, `display: flex` de `.lecon-decide` l'emportait sur l'attribut
		// `hidden`, et « Vérifier » + le lien restaient visibles à côté de « Continuer ».
		await expect(page.locator('.lecon-decide')).toBeHidden();
		await expect(page.locator('#ltriVerif')).toBeHidden();
		await expect(page.locator('#leconPasser')).toBeHidden();
		await expect(page.locator('#ltriActions button')).toBeVisible();

		expect(errors).toEqual([]);
	});
});

/* ---------- Droite graduée : la tentative de l'enfant reste visible à la révélation ---------- */

/* Ferme l'aide auto-affichée si présente (1er lancement du profil) ; no-op sinon. Le type
   d'aide « droiteGraduee » n'est pas de ceux couverts par `seedAideVueScript` (helpers.ts) :
   même parade que droite-graduee.spec.ts (fermer plutôt que présceller « déjà vue »). */
async function fermerAideSiPresente(page: import('@playwright/test').Page): Promise<void> {
	const overlay = page.locator('#aideOverlay');
	if (await overlay.isVisible()) {
		await page.locator('.aide-ok').click();
		await expect(overlay).toHaveCount(0);
	}
}

/* Libellé de la cible depuis la consigne (« Place le nombre 3,47 sur la droite graduée. »
   → « 3,47 »), identique caractère pour caractère au `data-label` du `.dg-hit` visé — même
   fonction de formatage côté data et côté consigne (cf. droite-graduee.spec.ts). */
async function cibleLabelDepuisConsigne(page: import('@playwright/test').Page): Promise<string> {
	const texte = await page.locator('#dgConsigne').innerText();
	const m = texte.match(/Place le nombre (.+) sur la droite graduée/);
	expect(m).not.toBeNull();
	return m![1];
}

const DESC_DEUX_REPERES =
	'La droite graduée avec le bon repère, et à côté, le repère que tu avais posé, pour comparer.';
const DESC_UN_REPERE = 'La droite graduée avec le repère au bon endroit.';

test.describe('Droite graduée : révélation avec le repère de l’enfant (trois branches)', () => {
	test('repère posé au mauvais endroit : deux repères, légende, description dédiée', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await gotoHash(page, 'lecon-num-droite-entiers'); // mono-mode → lancement direct, profil CE2 par défaut
		await page.locator('.dg-interactif').waitFor();
		await fermerAideSiPresente(page);

		// La cible n'est JAMAIS une borne numérotée (#256) : l'indice 0 est toujours un
		// mauvais choix, déterministe (cf. droite-graduee.spec.ts).
		await page.locator('.dg-hit[data-index="0"]').click();
		await page.locator('#leconPasser').click();

		await expect(page.locator('.figure-droite-graduee circle')).toHaveCount(2);
		await expect(page.locator('.clock-legend')).toBeVisible();
		await expect(page.locator('.clock-legend')).toContainText('ton repère');
		await expect(page.locator('.clock-legend')).toContainText('le bon repère');
		await expect(page.locator('.figure-droite-graduee desc')).toHaveText(DESC_DEUX_REPERES);
		expect(errors).toEqual([]);
	});

	test('repère posé au bon endroit : un seul repère, pas de légende', async ({ page }) => {
		const errors = watchErrors(page);
		await gotoHash(page, 'lecon-num-droite-entiers');
		await page.locator('.dg-interactif').waitFor();
		await fermerAideSiPresente(page);

		const cible = await cibleLabelDepuisConsigne(page);
		await page.locator(`.dg-hit[data-label="${cible}"]`).click();
		await page.locator('#leconPasser').click();

		// Deux têtes pleines à la même abscisse s'occulteraient (lu comme un bug) : un seul
		// repère est dessiné, rien à comparer.
		await expect(page.locator('.figure-droite-graduee circle')).toHaveCount(1);
		await expect(page.locator('.clock-legend')).toHaveCount(0);
		await expect(page.locator('.figure-droite-graduee desc')).toHaveText(DESC_UN_REPERE);
		expect(errors).toEqual([]);
	});

	test('aucun repère posé : un seul repère, pas de légende', async ({ page }) => {
		const errors = watchErrors(page);
		await gotoHash(page, 'lecon-num-droite-entiers');
		await page.locator('.dg-interactif').waitFor();
		await fermerAideSiPresente(page);

		// « Vérifier » encore désactivé : rien n'a été posé — le lien reste, lui, cliquable.
		await expect(page.locator('#dgVerify')).toBeDisabled();
		await page.locator('#leconPasser').click();

		await expect(page.locator('.figure-droite-graduee circle')).toHaveCount(1);
		await expect(page.locator('.clock-legend')).toHaveCount(0);
		await expect(page.locator('.figure-droite-graduee desc')).toHaveText(DESC_UN_REPERE);
		expect(errors).toEqual([]);
	});
});

/* ---------- 4. Sprint : validation à vide ---------- */

/* Filtre le sprint sur « Calcul mental » (100 % saisie) — même pattern que
   saisie-non-numerique.spec.ts et smoke.spec.ts : chaque question a un champ
   #sprintInput, donc une validation à vide est possible sans ambiguïté. */
async function lancerSprintCalculMental(page: import('@playwright/test').Page) {
	await gotoHash(page, 'sprint-config');
	// Horloge truquée, installée AVANT le lancement (donc avant la création du
	// setInterval du sprint) : seul moyen déterministe d'atteindre la fin d'un
	// sprint chronométré (5 min réelles) sans `waitForTimeout` ni re-run.
	await page.clock.install();
	await page.locator('.sc-option', { hasText: 'Calcul mental' }).click();
	await page.locator('#scLaunch').click();
	await expect(page.locator('#sprintInput')).toBeVisible();
}

test('Sprint : valider un champ vide révèle la solution et compte la question, sans le moindre point', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerSprintCalculMental(page);
	const scoreAvant = await page.locator('#sprintScore').textContent();

	await page.locator('#sprintInput').press('Enter'); // rien saisi

	await expect(page.locator('#sprintContinue')).toBeVisible();
	await expect(page.locator('.sprint-donnee')).toHaveText('Pas de réponse cette fois.');
	await expect(page.locator('#sprintScore')).toHaveText(scoreAvant ?? '');

	// La question compte quand même au bilan final (dénominateur), sans le moindre point :
	// on avance le temps jusqu'à la fin du sprint pour le constater.
	await page.locator('#sprintContinue').click();
	await page.clock.fastForward('05:01');
	await expect(page.locator('.sprint-done')).toBeVisible();
	await expect(page.locator('.sprint-done-big')).toHaveText('0');
	await expect(page.locator('.sprint-done-sub')).toContainText('1 question posée');

	expect(errors).toEqual([]);
});

/* ---------- 5. Espace encadrant : « passé sans essayer » ---------- */

/* Pas de verrou PIN hérité d'un test précédent (même garde que erreurs-encadrant.spec.ts). */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Une entrée « sansTentative » par mode journalisant ce marqueur (#467) : la révision
   (lien « Je ne sais pas, montre-moi ») et le sprint (validation à vide, seul mode où
   elle vaut réponse fausse). Deux leçons distinctes → deux cartes, faciles à isoler. */
const SEED_PASSE = `(() => {
  const now = Date.now();
  const liste = [
    { ts: now, lessonId: 'num-valeur-position', mode: 'revision', question: 'Valeur du chiffre des dizaines de 452 ?', donnee: '', attendue: '5', sansTentative: true },
    { ts: now - 60000, lessonId: 'math-doubles', mode: 'sprint', question: 'double de 8 = …', donnee: '', attendue: '16', sansTentative: true },
  ];
  localStorage.setItem('e2e/ludaskia_erreurs', JSON.stringify(liste));
})();`;

test('Encadrant : une entrée « sansTentative » affiche la phrase adaptée au mode, jamais « Réponse donnée »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_PASSE);
	await gotoHash(page, 'encadrant');

	const lecons = page.locator('.enc-err-lecon');
	await expect(lecons.first()).toBeVisible();
	expect(await lecons.count()).toBe(2);
	for (const lecon of await lecons.all()) {
		await lecon.locator('.enc-err-sum').click(); // déplie chaque carte
	}

	// Révision : « a demandé à voir la réponse ». Sprint : « a validé sans répondre ».
	// Les deux phrases distinctes, jamais confondues, et jamais de « Réponse donnée ».
	await expect(
		page.locator('.enc-err-item--passe').filter({ hasText: 'a demandé à voir la réponse' }),
	).toBeVisible();
	await expect(
		page.locator('.enc-err-item--passe').filter({ hasText: 'a validé sans répondre' }),
	).toBeVisible();
	await expect(page.locator('.enc-err-donnee')).toHaveCount(0);

	expect(errors).toEqual([]);
});
