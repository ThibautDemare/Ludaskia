/* ============================================================
   Récap éphémère de fin de séance (#537) — smoke e2e.
   ------------------------------------------------------------
   Une phrase qui NOMME les notions travaillées, ajoutée sur les écrans de fin
   déjà existants (critère 8 de #537) : bilan (`.rb-recap`), sprint
   (`.sprint-recap`), révision espacée (`.rev-recap`), et enrichissement du
   récap déjà en place du programme du jour (`.programme-recap-notions`).

   Sélecteurs stables : .rb-recap, .sprint-recap, .rev-recap,
   .programme-recap-item, .programme-recap-notions, .ans, #btnVerify,
   .bc-lesson-check, .bc-mode-radio, #bcSelectNone, #bcRun, #sprintTime,
   .sprint-choice, #sprintContinue, #revInput, #revNext.

   Deux leçons CE2 de la catégorie « Numération », déjà mono-mode saisie
   ailleurs dans la suite (cf. pave-signes.spec.ts, revision.spec.ts) :
   - num-comparer (« Je compare les nombres », réponse = signe < = >) ;
   - num-valeur-position (« La valeur des chiffres », réponse numérique).
   Choisies pour leur déterminisme (mode saisie, pas de widget), pas pour leur
   contenu pédagogique.

   Sprint scopé au singulier (num-comparer) : composeur de bilan personnalisé
   (#64), horloge truquée (`page.clock`) pour atteindre `.sprint-done` sans
   attendre 5 minutes réelles (cf. e2e/README.md). Un `page.clock.install()`
   ne peut être posé qu'UNE fois par realm JS : le test du critère 3, qui
   enchaîne deux sprints dans le même test, passe par un `page.reload()`
   explicite entre les deux (realm frais) plutôt qu'un second `install()` sur
   la même page — non documenté comme supporté par l'API Clock.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

const SIGNE_LABELS: Record<string, string> = {
	'<': 'plus petit que',
	'=': 'égal à',
	'>': 'plus grand que',
};

/* Supprime tout verrou PIN éventuel persisté d'un test précédent (même garde que
   programme-du-jour.spec.ts / programme-carte-terminee.spec.ts). */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Compose puis lance un SPRINT personnalisé scopé à la SEULE leçon num-comparer
   (#64, cf. pave-signes.spec.ts) : réponse tirée au hasard parmi < = >, on répond
   toujours FAUX (chemin déterministe, sans le setTimeout d'animation de la bonne
   réponse — cf. e2e/README.md) puis on avance l'horloge truquée jusqu'à la fin.
   L'horloge DOIT être installée avant #bcRun (avant la création du setInterval du
   sprint). Laisse la page sur `.sprint-done`. */
async function lancerSprintNumComparer(page: Page): Promise<void> {
	await gotoHash(page, 'bilan-cat-math-numeration');
	await page.locator('#bcSelectNone').click();
	await page.locator('.bc-lesson-check[value="num-comparer"]').check();
	await page.locator('.bc-mode-radio[value="sprint"]').check();
	await page.clock.install();
	await page.locator('#bcRun').click();
	await expect(page.locator('#sprintTime')).toBeVisible();

	const enonce = await page.locator('.sprint-q-qcm').innerText();
	const m = enonce.match(/(\d+)\D+?(\d+)/);
	if (!m) throw new Error(`énoncé de comparaison inattendu : ${enonce}`);
	const a = Number(m[1]);
	const b = Number(m[2]);
	const bon = a < b ? '<' : a > b ? '>' : '=';
	const faux = bon === '<' ? '>' : '<'; // n'importe quel autre signe : chemin FAUX, déterministe
	await page.locator(`.sprint-choice[aria-label="${SIGNE_LABELS[faux]}"]`).click();
	await expect(page.locator('#sprintContinue')).toBeVisible();
	await page.locator('#sprintContinue').click();
	await page.clock.fastForward('05:01');
	await expect(page.locator('.sprint-done')).toBeVisible();
}

/* Ferme les éventuelles modales de récompense (étoile / niveau / fête) qui
   intercepteraient le prochain clic (même pattern que programme-carte-terminee.spec.ts,
   programme-du-jour.spec.ts). Un sans-faute répété (même leçon rejouée) en déclenche
   une à chaque passage. */
async function fermerModalesRecompense(page: Page): Promise<void> {
	for (let i = 0; i < 5; i++) {
		const levelup = page.locator('#levelupOk');
		if (await levelup.isVisible().catch(() => false)) {
			await levelup.click();
			continue;
		}
		const celebrate = page.locator('#celebrateOk');
		if (await celebrate.isVisible().catch(() => false)) {
			await celebrate.click();
			continue;
		}
		break;
	}
}

/* Compose puis lance un BILAN « Tranquille » (mode par défaut, pas sprint) scopé à
   la seule leçon num-comparer, répond correctement à toutes les questions
   (`data-answer`) et valide. Retourne le TEXTE du récap, modales de récompense
   refermées (sans-faute systématique : sinon la 2e exécution ne peut plus cliquer
   #bcSelectNone). Réutilisé par le test du critère 6 (deux exécutions de suite,
   même contenu attendu). */
async function bilanNumComparerRecap(page: Page): Promise<string> {
	await gotoHash(page, 'bilan-cat-math-numeration');
	await page.locator('#bcSelectNone').click();
	await page.locator('.bc-lesson-check[value="num-comparer"]').check();
	await expect(page.locator('.bc-mode-radio[value="bilan"]')).toBeChecked(); // pas sprint
	await page.locator('#bcRun').click();

	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const n = await fields.count();
	for (let i = 0; i < n; i++) {
		const ans = await fields.nth(i).getAttribute('data-answer');
		await fields.nth(i).fill(ans ?? '');
	}
	await page.locator('#btnVerify').click();
	const recap = page.locator('.rb-recap');
	await expect(recap).toBeVisible();
	const texte = await recap.innerText();
	await fermerModalesRecompense(page);
	return texte;
}

/* ---------- Critère 1 : bilan ---------- */

test('critère 1 : bilan (express) — le bandeau de fin nomme les leçons réellement travaillées', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'bilan-cat-math-numeration');
	await page.locator('#bcSelectNone').click();
	await page.locator('.bc-lesson-check[value="num-comparer"]').check();
	await page.locator('.bc-lesson-check[value="num-valeur-position"]').check();
	// Palier par défaut d'un écran scopé = 5 (≠ « Tout ») : bilan EXPRESS, pas complet.
	await expect(page.locator('.bc-mode-radio[value="bilan"]')).toBeChecked();
	await page.locator('#bcRun').click();

	const fields = page.locator('.ans');
	await fields.first().waitFor();
	const n = await fields.count();
	expect(n).toBeGreaterThan(0);
	for (let i = 0; i < n; i++) {
		const ans = await fields.nth(i).getAttribute('data-answer');
		expect(ans).not.toBeNull();
		await fields.nth(i).fill(ans ?? '');
	}
	await page.locator('#btnVerify').click();

	// Critère 13 : le récap est déjà dans le bandeau au moment même où le verdict
	// s'affiche, AVANT toute fermeture d'une éventuelle modale de récompense — aucun
	// clic supplémentaire n'a eu lieu entre #btnVerify et cette assertion.
	const recap = page.locator('.rb-recap');
	await expect(recap).toBeVisible();
	const texte = await recap.innerText();
	expect(texte).not.toBe('');
	expect(texte).toContain('compare');
	expect(texte).toContain('valeur des chiffres');

	expect(errors).toEqual([]);
});

/* ---------- Critère 2 : sprint hors programme ---------- */

test('critère 2 : sprint lancé hors programme — l’écran de fin porte le même récap', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerSprintNumComparer(page);

	const recap = page.locator('.sprint-recap');
	await expect(recap).toBeVisible();
	await expect(recap).toContainText('compare');

	expect(errors).toEqual([]);
});

/* ---------- Critère 2 : révision espacée hors programme ---------- */

const REV_UUID = 'e2e-recap-rev';

/* Amorce un profil dédié et rend UNE leçon « due » dès maintenant (même pattern
   que revision.spec.ts, uuid distinct pour ne pas interférer). */
function seedDueLesson(lessonId: string): string {
	return `
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid: REV_UUID, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: REV_UUID,
			}),
		)});
    localStorage.setItem('${REV_UUID}/ludaskia_lessonRevision', JSON.stringify({
      ${JSON.stringify(lessonId)}: { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }
    }));
    ${seedAideVueScript(REV_UUID)}
  `;
}

test('critère 2 : révision espacée lancée hors programme — l’écran de fin porte le même récap', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('num-valeur-position'));
	await gotoHash(page, 'revision-espacee');

	const input = page.locator('#revInput');
	await expect(input).toBeVisible();
	await input.fill('0'); // peu importe la justesse : seul l'écran de fin nous intéresse
	await input.press('Enter');
	await expect(page.locator('.rev-feedback')).toBeVisible();
	await page.locator('#revNext').press('Enter');

	await expect(page.locator('.rev-done')).toContainText('terminée');
	const recap = page.locator('.rev-recap');
	await expect(recap).toBeVisible();
	await expect(recap).toContainText('valeur des chiffres');

	expect(errors).toEqual([]);
});

/* ---------- Critère 4 : récap du programme du jour enrichi ---------- */

test('critère 4 : programme du jour — une étape sprint déjà faite voit sa ligne nommer la leçon tirée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);

	// Programme actif aujourd'hui avec DEUX étapes génériques (sprint + révision) : la
	// révision reste sciemment non satisfaite, pour que le programme ne se termine PAS
	// dès que le sprint est fait (on resterait sinon sur l'écran de célébration, hors
	// sujet ici).
	await gotoHash(page, 'encadrant/programme');
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('sprint');
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('revision');
	for (let jour = 1; jour <= 7; jour++) {
		await page
			.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
			.check();
	}
	await page.locator('.enc-back[data-act="retour"]').click();
	await expect(page.locator('#home')).toBeVisible();

	// Sprint lancé HORS programme (composeur personnalisé, pas la tuile #seance) :
	// l'attribution au programme est rétrospective (n'importe quel sprint vaut l'étape
	// générique « Sprint 5 min », cf. etapeSatisfaite) — nul besoin de passer par la
	// tuile pour que l'étape se retrouve créditée.
	await lancerSprintNumComparer(page);

	// La navigation vers #seance rafraîchit le programme AVANT de le rendre : l'étape
	// sprint passe à « faite », et sa ligne de récap nomme désormais la leçon tirée au
	// lieu de rester générique (« Sprint 5 min » seul).
	await gotoHash(page, 'seance');
	const ligneSprint = page.locator('.programme-recap-item', { hasText: 'Sprint' });
	await expect(ligneSprint).toBeVisible();
	await expect(ligneSprint.locator('.programme-recap-notions')).toContainText('compare');

	expect(errors).toEqual([]);
});

/* ---------- Critère 3 : suppression du récap autonome ---------- */

/* Programme actif AUJOURD'HUI (récurrence tous les jours, pour être indépendant du
   jour d'exécution du test), deux étapes génériques : une « sprint » (celle qui
   masque) et une « revision » VOLONTAIREMENT jamais satisfaite, pour que le
   programme reste NON complet une fois le sprint fait (condition du critère 3,
   « actif ET non complet » — un programme complet ne masque plus rien, cf.
   `recapAutonomeMasque`). Forme exacte de `SeanceDef` (src/core/seance.ts), semée
   directement en localStorage sous le préfixe du profil actif par défaut ('e2e',
   posé par `ENSURE_NIVEAU` dans gotoHash/helpers.ts) : `etatSeanceJour` lit cette
   clé à la demande, sans exiger un passage préalable par l'écran encadrant. */
const SEANCE_PROGRAMME_SPRINT_REVISION = `localStorage.setItem('e2e/ludaskia_seance', JSON.stringify([
  {
    id: 'd1',
    etapes: [
      { id: 'e1', kind: 'sprint', count: 1 },
      { id: 'e2', kind: 'revision', count: 1 },
    ],
    recurrence: { type: 'hebdo', jours: [1, 2, 3, 4, 5, 6, 7] },
  },
]));`;

test('critère 3 : le récap autonome du sprint disparaît quand un programme actif et non complet contient une étape sprint', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// CONTRÔLE (sans programme actif, ce même sprint scopé porte bien un récap) déjà
	// tenu par le test du critère 2 ci-dessus, avec le MÊME helper
	// `lancerSprintNumComparer` : il établit que l'absence testée plus bas n'est pas une
	// absence pour n'importe quelle raison (widget cassé, leçon non résolue…) mais bien
	// l'effet du programme actif et non complet semé ici.
	await page.addInitScript(SEANCE_PROGRAMME_SPRINT_REVISION);

	// Sprint lancé HORS programme (composeur personnalisé, pas la tuile #seance) :
	// l'attribution est rétrospective, donc même un sprint composé à la main compte pour
	// l'étape générique « sprint » (cf. etapeSatisfaite) — mais ce n'est pas ce qu'on
	// mesure ici, seul l'écran de fin DE CE sprint nous intéresse.
	await lancerSprintNumComparer(page);
	await expect(page.locator('.sprint-done')).toBeVisible();
	await expect(page.locator('.sprint-recap')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- Critère 6 : formulation variée ---------- */

test('critère 6 : deux bilans consécutifs sur la même page ne répètent pas le même gabarit de phrase', async ({
	page,
}) => {
	const errors = watchErrors(page);

	const phrase1 = await bilanNumComparerRecap(page);
	// Navigation SPA vers un hash différent (pas de rechargement) : le compteur de
	// rotation des gabarits (mémoire de page, jamais persisté) survit — c'est justement
	// ce qu'on veut mesurer. Revenir directement sur LE MÊME hash forcerait un
	// `.reload()` (cf. gotoHash) et repartirait de zéro.
	await gotoHash(page, 'accueil');
	const phrase2 = await bilanNumComparerRecap(page);

	// Même leçon, donc même CONTENU nommé dans les deux cas : si les phrases diffèrent,
	// ce ne peut être que le gabarit.
	expect(phrase1).toContain('compare');
	expect(phrase2).toContain('compare');
	expect(phrase2).not.toBe(phrase1);

	expect(errors).toEqual([]);
});

/* ---------- Critère 10 : aucune séance mono-leçon ne porte de récap ---------- */

test('critère 10 : une séance mono-leçon ne porte aucun récap', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-comparer');

	const field = page.locator('.ans').first();
	await field.waitFor();
	const expected = await field.getAttribute('data-answer');
	await field.fill(expected ?? '');
	await page.locator('#btnVerify').click();

	await expect(page.locator('.mark.correct').first()).toBeVisible();
	await expect(page.locator('.result-banner')).toBeVisible();
	await expect(page.locator('.rb-recap')).toHaveCount(0);

	expect(errors).toEqual([]);
});
