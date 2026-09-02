/* ============================================================
   Smoke e2e — Micro-problèmes CM1 décimaux (#255).
   Quatre structures de « Résolution de problèmes » déjà ouvertes au CE2
   (composition, transformation, comparaison, multiplication) sont rouvertes au
   CM1 avec un mix ~50 % d'items entiers / ~50 % DÉCIMAUX (argent en centimes,
   mesures au dixième), toujours à UNE seule étape. Runner dédié inchangé
   (ui/lecon-probleme.ts) : une réponse ratée est révélée en écriture à VIRGULE
   française (jamais un point) et une saisie à virgule est acceptée en correction.

   ⚠ Ces variantes dépendent du niveau CM1 (levels ['ce2','cm1']) : on amorce un
   profil en CM1 et on navigue DIRECTEMENT (pas gotoHash, qui force CE2 via
   ENSURE_NIVEAU), comme calcul-mental-cm1.spec.ts / conjugaison-cm1.spec.ts.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
	// `page.goto` vers le hash DÉJÀ affiché est un no-op silencieux sous Chromium (aucune
	// navigation, aucun re-rendu) — le piège documenté dans e2e/README.md (#511), retrouvé ici :
	// `trouverItemDecimalArgent` (plus bas) rappelle `gotoCM1` sur le MÊME hash pour tirer un
	// NOUVEAU problème à chaque run, et sans ce `.reload()` la 2e tentative se contentait de
	// refixer les yeux sur le dernier écran (Problème 8/8, déjà corrigé, champ DISABLED) —
	// `trouverItemDecimal` porte le même défaut, seulement invisible : son critère plus large
	// (~50 % par question) trouve presque toujours son bonheur dès le 1er run.
	await page.reload({ waitUntil: 'networkidle' });
}

const NB_QUESTIONS = 8; // cf. ui/lecon-probleme.ts

const LECONS_CM1 = [
	'math-prob-composition',
	'math-prob-transformation',
	'math-prob-comparaison',
	'math-prob-multiplication',
];

/* Une passe par leçon : l'énoncé et le champ de réponse se rendent, la bonne
   réponse (exposée via data-answer, comme tous les champs .ans/.prob-input)
   valide l'étape — que l'item tiré soit entier ou décimal. On saisit la valeur
   en écriture FRANÇAISE (virgule) pour couvrir l'acceptation `,` → `.` du check,
   sans effet sur un entier (pas de point à remplacer). */
for (const id of LECONS_CM1) {
	test(`CM1 « ${id} » : énoncé rendu, réponse validée (saisie à virgule acceptée)`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await gotoCM1(page, `lecon-${id}`);
		await expect(page.locator('.prob-enonce')).toBeVisible();
		const input = page.locator('.prob-input').first();
		await input.waitFor();
		const answer = await input.getAttribute('data-answer');
		expect(answer).toBeTruthy();
		await input.fill(answer!.replace('.', ','));
		await page.locator('#probVerif').click();
		await expect(page.locator('.prob-mark.correct').first()).toBeVisible();
		expect(errors).toEqual([]);
	});
}

/* Avance dans les questions d'un run (une leçon = un item aléatoire par question)
   jusqu'à tomber sur un item DÉCIMAL (data-answer avec un point), en répondant
   JUSTE aux items entiers rencontrés en chemin pour passer à la suite. Relance
   jusqu'à 5 runs si aucun décimal n'apparaît dans les 8 tirages (probabilité
   résiduelle négligeable au tirage ~50/50) plutôt qu'un waitForTimeout arbitraire.
   Laisse la page sur l'item décimal trouvé, NON répondu. */
async function trouverItemDecimal(page: Page, hash: string): Promise<string | null> {
	for (let run = 0; run < 5; run++) {
		await gotoCM1(page, hash);
		for (let q = 0; q < NB_QUESTIONS; q++) {
			const input = page.locator('.prob-input').first();
			await input.waitFor();
			const answer = await input.getAttribute('data-answer');
			if (answer?.includes('.')) return answer;
			await input.fill(answer!);
			await page.locator('#probVerif').click();
			await expect(page.locator('.prob-mark.correct').first()).toBeVisible();
			if (q < NB_QUESTIONS - 1) await page.locator('#probActions button').click();
		}
	}
	return null;
}

/* Comme `trouverItemDecimal`, mais restreint à un item d'ARGENT — la seule branche où
   #542 s'applique (deux décimales). Le tirage décimal de math-prob-composition mélange
   argent et mesures à ~50/50 (compositionArgent / compositionMesureTout) : un décimal
   MESURE croisé en chemin est répondu JUSTE pour continuer, comme un entier — seul un
   décimal ARGENT est laissé NON répondu, page dessus. Un « € » dans l'énoncé signe
   l'argent (aucune mesure de l'appli n'emploie ce symbole). Probabilité par question :
   ~25 % (décimal ET argent), donc ~10 % de rater les 8 questions d'un run — 6 runs
   ramènent le résidu à 0,10^6 ≈ 10⁻⁶, négligeable. */
async function trouverItemDecimalArgent(page: Page, hash: string): Promise<string | null> {
	for (let run = 0; run < 6; run++) {
		await gotoCM1(page, hash);
		for (let q = 0; q < NB_QUESTIONS; q++) {
			const input = page.locator('.prob-input').first();
			await input.waitFor();
			const answer = await input.getAttribute('data-answer');
			if (answer?.includes('.')) {
				const estArgent = (await page.locator('.prob-enonce').innerText()).includes('€');
				if (estArgent) return answer;
			}
			await input.fill(answer!);
			await page.locator('#probVerif').click();
			await expect(page.locator('.prob-mark.correct').first()).toBeVisible();
			if (q < NB_QUESTIONS - 1) await page.locator('#probActions button').click();
		}
	}
	return null;
}

test('CM1 « math-prob-composition » : un item décimal raté révèle la solution en VIRGULE, quelle que soit sa branche', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Garantie ANTÉRIEURE à #542 (#255/#467, puis #501) : TOUT item décimal — argent OU
	// mesure — se révèle en virgule française, jamais au point. Ne pas confondre avec le
	// test suivant, qui exige les DEUX décimales sur la seule branche argent : celui-ci
	// couvre aussi la branche mesure (« 3,5 », UNE décimale), qui n'a QUE cette couverture-là.
	const answer = await trouverItemDecimal(page, 'lecon-math-prob-composition');
	expect(answer).not.toBeNull(); // un item décimal a bien été tiré (dans les runs tentés)
	expect(answer).toMatch(/^\d+\.\d+$/);
	// Réponse volontairement fausse (les réponses décimales générées sont toujours > 0).
	await page.locator('.prob-input').first().fill('0');
	await page.locator('#probVerif').click();
	const sol = page.locator('.prob-mark.wrong .sol');
	await expect(sol).toBeVisible();
	await expect(sol).toContainText(',');
	await expect(sol).not.toContainText('.');
	expect(errors).toEqual([]);
});

test('CM1 « math-prob-composition » : un item décimal ARGENT raté révèle la solution à DEUX décimales (#542)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Boucle jusqu'à la branche ARGENT (pas un simple `if` sur le tirage du jour) : sinon
	// l'assertion à deux décimales peut ne JAMAIS s'exécuter sur un run donné — vert par
	// vacuité partielle, pas parce que la graphie est bonne (relecteur-qualité).
	const answer = await trouverItemDecimalArgent(page, 'lecon-math-prob-composition');
	expect(answer, 'un item décimal ARGENT attendu sur 6 runs de 8 questions').not.toBeNull();
	expect(answer).toMatch(/^\d+\.\d+$/);
	// Réponse volontairement fausse (les réponses décimales générées sont toujours > 0).
	await page.locator('.prob-input').first().fill('0');
	await page.locator('#probVerif').click();
	const sol = page.locator('.prob-mark.wrong .sol');
	await expect(sol).toBeVisible();
	// #542 : un montant en euros s'écrit TOUJOURS à deux décimales (« 6,75 »), jamais une
	// seule (« 6,8 ») — la notation enseignée, pas un arrondi d'affichage. La graphie des
	// mesures décimales (« 3,5 », UNE décimale) n'est pas touchée : ce test cible SEULEMENT
	// la branche argent (cf. trouverItemDecimalArgent), jamais la branche mesure.
	await expect(sol).toHaveText(/^→ \d+,\d{2}$/);
	expect(errors).toEqual([]);
});
