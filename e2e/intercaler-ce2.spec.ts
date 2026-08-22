/* ============================================================
   Intercalation CE2 par intervalle ouvert (#446) — smoke e2e.
   Avant #446, « J'encadre et j'intercale » n'acceptait qu'UNE réponse ; elle
   accepte désormais toute valeur strictement comprise entre deux bornes
   exclues, comme au CM1 (#240, déjà couvert par grands-nombres.spec.ts).
   Couvre ce que numeration.spec.ts ne prouve jamais (il retape toujours
   `data-answer` à l'identique) :
   - le CŒUR du changement : une valeur dans la bande mais DIFFÉRENTE de
     l'exemple révélé (`data-answer`) est acceptée ;
   - le marqueur d'erreur de la fiche qui révèle la BANDE (`data-attendue`),
     pas un nombre isolé, et sa remontée identique dans le journal encadrant ;
   - la mention supplémentaire du mode tuiles (« D'autres nombres… ») quand
     la bande admet plusieurs réponses ;
   - la leçon renommée « Je compare, j'encadre, j'intercale jusqu'à 10 000 »,
     qui tire maintenant aussi des intercalations, reste jouable sans erreur ;
   - le 7ᵉ chemin de correction (révision en mode tuiles) : la forme locale de
     la révision oubliait l'intervalle, d'où un verdict « LA bonne réponse : 4002 »
     et un journal à nombre isolé, en contradiction avec la même leçon jouée hors
     révision. Non testable en Vitest (fonctions non exportées, dépendantes du DOM).
   Pattern maison : gotoHash, watchErrors + expect(errors).toEqual([]),
   sélecteurs stables. La leçon mélange comparer/encadrer/intercaler au
   hasard : comme clic-verbe.spec.ts (trouverCibleDouble), on relance
   jusqu'à 5 tirages plutôt qu'un waitForTimeout ou un test qui dépend d'un
   tirage précis.
   ============================================================ */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue, seedAideVueScript } from './helpers';

const NB_QUESTIONS_TUILES = 8;

/* Lit les bornes ]min ; max[ depuis un texte « un nombre entre 450 et 465 »
   (attribut `data-attendue` ou message de correction) — jamais recalculées,
   toujours LUES dans le DOM (l'exercice est aléatoire). Les plages CE2 restent
   sous 10 000 : `formatNombre` n'y insère aucun séparateur (regroupement à
   partir de 10 000 seulement), donc de simples chiffres à extraire. */
function bornes(texte: string): [number, number] {
	const m = texte.match(/(\d+)\D+(\d+)/);
	if (!m) throw new Error(`bornes introuvables dans « ${texte} »`);
	return [Number(m[1]), Number(m[2])];
}

/* Cherche, dans la fiche (saisie) d'une leçon, un champ corrigé PAR INTERVALLE
   (`data-attendue`, posé par renderItem UNIQUEMENT pour ces items, #446) dont
   la bande admet un écart d'au moins `ecartMin`. La fiche mélange encadrer et
   intercaler au hasard (8 items) : on relance jusqu'à 5 fois si aucun item ne
   convient dans le tirage courant. `page.goto` vers un hash IDENTIQUE au hash
   courant est un no-op côté Chromium (pas de rechargement réel, cf.
   clic-verbe.spec.ts/gotoCM1) : un `.reload()` explicite force un vrai tirage
   à chaque tentative, sinon les « relances » revoient toutes la même fiche. */
async function trouverChampIntercalation(
	page: Page,
	hash: string,
	ecartMin = 0,
): Promise<Locator | null> {
	for (let tentative = 0; tentative < 5; tentative++) {
		await gotoHash(page, hash);
		await page.reload({ waitUntil: 'networkidle' });
		await page.locator('.ans').first().waitFor();
		const champs = page.locator('.ans[data-attendue]');
		const n = await champs.count();
		for (let i = 0; i < n; i++) {
			const champ = champs.nth(i);
			const attendue = await champ.getAttribute('data-attendue');
			if (!attendue) continue;
			const [min, max] = bornes(attendue);
			if (max - min >= ecartMin) return champ;
		}
	}
	return null;
}

/* Avance question par question dans le runner tuiles jusqu'à tomber sur une
   intercalation dont la bande admet AU MOINS 4 (seuil de `intervalleAPlusieursReponses`,
   partagé par la consigne saisie et la correction tuiles) : c'est le seul cas où
   « D'autres nombres auraient aussi convenu. » doit s'afficher. Une fois trouvée, pose
   délibérément une tuile HORS bande (bornes ou distracteur) pour déclencher la
   correction, et laisse la page sur l'écran de feedback. Les questions non ciblées sont
   passées avec n'importe quelle tuile (leur verdict n'importe pas ici). */
async function jouerTuilesJusquaIntercalationLarge(page: Page, hash: string): Promise<boolean> {
	for (let run = 0; run < 5; run++) {
		await gotoHash(page, hash);
		// Un `goto` vers le MÊME hash ne recharge pas réellement (cf. trouverChampIntercalation) :
		// on force le rechargement pour obtenir un NOUVEAU tirage à chaque relance.
		await page.reload({ waitUntil: 'networkidle' });
		await page.getByText('Je déplace les tuiles').click();
		for (let q = 0; q < NB_QUESTIONS_TUILES; q++) {
			await page.locator('#ltuiSlot').waitFor();
			const enonce = await page.locator('.ltui-enonce').innerText();
			const m = enonce.match(/Place un nombre entre (\d+) et (\d+)/);
			if (m) {
				const min = Number(m[1]);
				const max = Number(m[2]);
				if (max - min >= 4) {
					const tuiles = page.locator('.ltui-tuile');
					const nT = await tuiles.count();
					let poseeHorsBande = false;
					for (let t = 0; t < nT; t++) {
						const val = Number((await tuiles.nth(t).innerText()).replace(/\D/g, ''));
						if (val <= min || val >= max) {
							await tuiles.nth(t).click();
							poseeHorsBande = true;
							break;
						}
					}
					if (!poseeHorsBande) break; // ne devrait pas arriver : bornes/hors sont toujours distracteurs
					await page.locator('#ltuiVerif').click();
					return true;
				}
			}
			// Question non ciblée (encadrement, ou intercalation à bande trop serrée) :
			// on passe sans se soucier du verdict, pour atteindre la question suivante.
			await page.locator('.ltui-tuile').first().click();
			await page.locator('#ltuiVerif').click();
			if (q < NB_QUESTIONS_TUILES - 1) await page.locator('#ltuiActions button').click();
		}
	}
	return false;
}

test('intercaler (cœur du changement) : une valeur dans la bande, différente de l’exemple révélé, est acceptée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Écart ≥ 3 : au moins deux entiers valides dans la bande, pour pouvoir en choisir un
	// DIFFÉRENT de l'exemple (`data-answer`) — sinon les specs existantes (qui retapent
	// toujours l'exemple) ne prouveraient jamais que la correction accepte tout l'intervalle.
	const champ = await trouverChampIntercalation(page, 'lecon-num-encadrer-intercaler', 3);
	expect(champ, 'aucune intercalation à bande assez large tirée en 5 tentatives').not.toBeNull();
	const c = champ as Locator;

	const [min, max] = bornes((await c.getAttribute('data-attendue'))!);
	const exemple = Number(await c.getAttribute('data-answer'));
	let autre = min + 1;
	if (autre === exemple) autre = min + 2;
	expect(autre).toBeGreaterThan(min);
	expect(autre).toBeLessThan(max);
	expect(autre).not.toBe(exemple);

	await c.fill(String(autre));
	await page.locator('#btnVerify').click();
	await expect(c.locator('xpath=following-sibling::span[contains(@class,"mark")]')).toHaveClass(
		/correct/,
	);
	expect(errors).toEqual([]);
});

test('intercaler (fiche) : une erreur révèle la bande, qui remonte identique dans le journal encadrant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(`localStorage.removeItem('ludaskia_encadrant_lock');`);
	const champ = await trouverChampIntercalation(page, 'lecon-num-encadrer-intercaler');
	expect(champ, 'aucune intercalation tirée en 5 tentatives').not.toBeNull();
	const c = champ as Locator;
	const attendue = (await c.getAttribute('data-attendue'))!;
	expect(attendue).toMatch(/^un nombre entre \d+ et \d+$/);

	await c.fill('0'); // toujours hors bande : les bornes CE2 sont ≥ 100
	await page.locator('#btnVerify').click();
	const mark = c.locator('xpath=following-sibling::span[contains(@class,"mark")]');
	await expect(mark).toHaveClass(/wrong/);
	await expect(mark).toContainText(attendue); // « ✗ → un nombre entre … », pas un nombre isolé

	await gotoHash(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();
	await expect(lecon.locator('.enc-err-bonne').first()).toContainText(attendue);
	expect(errors).toEqual([]);
});

test('intercaler (tuiles) : réponse hors bande → « Une réponse possible » puis « D’autres nombres… »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page); // le mode tuiles déclenche l'aide contextuelle au 1er lancement
	const trouve = await jouerTuilesJusquaIntercalationLarge(page, 'mode-num-encadrer-intercaler');
	expect(trouve, 'aucune intercalation à bande large tirée en tuiles en 5 tentatives').toBe(true);
	await expect(page.locator('#ltuiFeedback')).toContainText('Une réponse possible était');
	await expect(page.locator('#ltuiFeedback')).toContainText(
		"D'autres nombres auraient aussi convenu.",
	);
	expect(errors).toEqual([]);
});

test('leçon renommée « Je compare, j’encadre, j’intercale jusqu’à 10 000 » reste jouable', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-math-numeration');
	await expect(page.locator('.lesson-item[data-id="num-situer-10000"]')).toContainText(
		"Je compare, j'encadre, j'intercale jusqu'à 10 000",
	);

	await gotoHash(page, 'mode-num-situer-10000');
	await expect(page.locator('.mode-choice-lesson')).toContainText(
		"Je compare, j'encadre, j'intercale jusqu'à 10 000",
	);

	await gotoHash(page, 'lecon-num-situer-10000'); // mode saisie par défaut
	const field = page.locator('.ans').first();
	await field.waitFor();
	const good = await field.getAttribute('data-answer');
	await field.fill(good ?? '');
	await page.locator('#btnVerify').click();
	await expect(field.locator('xpath=following-sibling::span[contains(@class,"mark")]')).toHaveClass(
		/correct/,
	);
	expect(errors).toEqual([]);
});

/* ---------- 7ᵉ chemin de correction : la révision en mode tuiles ---------- */

/* Profil e2e dédié + UNE leçon « due » dès maintenant (même pattern que
   revision.spec.ts/seedDueLesson). La clé de révision est préfixée par le
   profil actif (uuid + '/'), d'où l'amorçage conjoint de la méta-profil. */
const UUID_REVISION = 'e2e-revision-intercaler';
function seedDueLesson(lessonId: string): string {
	return `
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid: UUID_REVISION, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: UUID_REVISION,
			}),
		)});
    localStorage.setItem('${UUID_REVISION}/ludaskia_lessonRevision', JSON.stringify({
      ${JSON.stringify(lessonId)}: { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }
    }));
    ${seedAideVueScript(UUID_REVISION)}
  `;
}

/* Atteindre une intercalation rejouée EN TUILES en révision demande DEUX tirages
   indépendants dans `num-situer-10000` (#446, ui/revision.ts) : le 1ᵉʳ tirage (mode
   saisie par défaut) doit être une COMPARAISON (réponse non numérique → seul cas qui
   bascule la révision en tuiles, cf. `!answerEstNumerique`) — 1/3 des tirages — puis
   le 2ᵉ tirage (regénéré en mode tuiles) doit être une INTERCALATION — 1/3 des tirages
   à nouveau. Combiné : ~1/9 (~11 %) par relance, conforme au diagnostic du 7ᵉ chemin.
   Une seule leçon est due → CHAQUE relance ne tire qu'UN item, jamais répondu (donc
   toujours « due » à la relance suivante) : on recharge jusqu'à tomber sur le bon cas,
   comme ailleurs dans ce fichier, mais ICI le hash ne change JAMAIS entre relances →
   `page.goto` vers un hash identique ne rejoue rien (cf. trouverChampIntercalation) :
   le `.reload()` explicite est indispensable. Une révision EN COURS bloque la
   navigation (#63, `quittingLosesProgress`) : un `.reload()` mi-exercice déclenche la
   boîte de dialogue NATIVE `beforeunload` (pas la modale in-app, réservée aux
   changements de hash) — un handler `page.on('dialog')` l'accepte pour abandonner
   l'item non répondu et relancer. Le nombre de tentatives (80) vise le même ordre de
   grandeur de risque résiduel que `trouverCibleDouble` (clic-verbe.spec.ts) : 0,889⁸⁰ ≈
   0,008 %, négligeable. */
async function trouverRevisionTuileIntercalation(page: Page, tentativesMax = 80): Promise<boolean> {
	for (let tentative = 0; tentative < tentativesMax; tentative++) {
		await gotoHash(page, 'revision-espacee');
		await page.reload({ waitUntil: 'networkidle' });
		// Attendre que la carte de révision soit RENDUE avant de trancher le mode : le
		// `count()` ci-dessous est une lecture one-shot et `networkidle` peut précéder le
		// rendu du SPA, si bien qu'une tentative sur deux se conclurait par « pas de tuiles »
		// alors que la page n'avait simplement rien dessiné — les 80 relances y passeraient
		// sans jamais voir le tirage cherché. On attend `#revValidate`, présent dans la carte
		// QUEL QUE SOIT le mode (revision.ts) : attendre `#ltuiSlot`, lui, exclurait d'emblée
		// le cas saisie qu'on veut justement pouvoir rejeter.
		await expect(page.locator('#revValidate')).toBeVisible();
		if (!(await page.locator('#ltuiSlot').count())) continue; // item 'num' (saisie) : relance
		const enonce = await page.locator('.ltui-enonce').innerText();
		if (/Place un nombre entre \d+ et \d+/.test(enonce)) return true; // comparer/encadrer en tuiles : relance
	}
	return false;
}

test('révision (tuiles) : une intercalation ratée parle au singulier indéfini et journalise la bande', async ({
	page,
}) => {
	test.setTimeout(120_000); // ~80 relances à ~1 s (reload + dialogue beforeunload), cf. helper
	const errors = watchErrors(page);
	// Relances mi-exercice (révision non répondue) : boîte de dialogue NATIVE `beforeunload`
	// (#63) à chaque tentative manquée — on l'accepte pour abandonner l'item et relancer.
	page.on('dialog', (d) => void d.accept());
	await page.addInitScript(`localStorage.removeItem('ludaskia_encadrant_lock');`);
	await page.addInitScript(seedDueLesson('num-situer-10000'));

	const trouve = await trouverRevisionTuileIntercalation(page);
	expect(trouve, 'aucune intercalation en tuiles tirée en 80 tentatives (~11 % par tirage)').toBe(
		true,
	);

	const enonce = await page.locator('.ltui-enonce').innerText();
	const m = enonce.match(/Place un nombre entre (\d+) et (\d+)/)!;
	const min = Number(m[1]);
	const max = Number(m[2]);

	// Pose une tuile HORS bande (bornes recopiées ou distracteur) → réponse fausse garantie.
	const tuiles = page.locator('.ltui-tuile');
	const n = await tuiles.count();
	let posee = false;
	for (let t = 0; t < n; t++) {
		const val = Number((await tuiles.nth(t).innerText()).replace(/\D/g, ''));
		if (val <= min || val >= max) {
			await tuiles.nth(t).click();
			posee = true;
			break;
		}
	}
	expect(
		posee,
		'aucune tuile hors bande trouvée (toutes les distractrices sont dans la bande ?)',
	).toBe(true);
	await page.locator('#revValidate').click();

	// Verdict au singulier INDÉFINI (#446) : « Une réponse possible », jamais « La bonne réponse »
	// (qui affirmerait l'unicité, en contradiction avec la même leçon jouée hors révision).
	const verdict = page.locator('.rev-feedback');
	await expect(verdict).toContainText('Une réponse possible');
	await expect(verdict).not.toContainText('La bonne réponse');

	await page.locator('#revNext').click();
	await expect(page.locator('.rev-done')).toContainText('terminée');

	// Le journal encadrant reçoit la BANDE, pas un nombre isolé.
	await gotoHash(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();
	await expect(lecon.locator('.enc-err-bonne').first()).toContainText(/un nombre entre \d+ et \d+/);
	expect(errors).toEqual([]);
});
