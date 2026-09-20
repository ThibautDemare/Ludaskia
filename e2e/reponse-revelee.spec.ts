/* ============================================================
   Réponse révélée mise en forme comme les énoncés (#501) — smoke e2e.
   `formatReponseRevelee` (core/nombres.ts) est branchée sur quatre surfaces :
   le marqueur ✗ de la grille de fiche (ui/session.ts), la correction du
   sprint (ui/sprint.ts), le verdict de révision (ui/revision.ts) et la
   réponse attendue du journal encadrant / le corrigé imprimé
   (core/erreur-representation.ts, core/items.ts). Un entier révélé s'écrit
   groupé (espace fine insécable \u202F, à partir de 5 chiffres, comme dans
   les énoncés) ; un décimal s'écrit à la virgule française, JAMAIS au point ;
   tout le reste (texte, conjugaison, mesure avec unité, bande d'intercalation
   déjà rédigée) ressort INCHANGÉ — c'est le critère négatif le plus utile
   (il attrape un sur-formatage qui casserait une réponse non numérique).

   Un CINQUIÈME chemin (runner « tableau de conversion », ui/lecon-tableau.ts +
   ui/lecon-runner-shared.ts) ajoute une nuance ŒIL/OREILLE : la graphie groupée
   est pour l'œil (feedback visible), mais ce qui part à une région live doit être
   RECOLLÉ (`sansSeparateurMilliers`, core/nombres.ts) — un séparateur de milliers
   ferait lire trois nombres au lecteur d'écran là où il y en a un. Les deux derniers
   tests de ce fichier couvrent ce couple, pas seulement le groupement.

   Familles couvertes (au moins une leçon par grande famille, comme demandé
   par #501) : numération/calcul (millions CM1), grandeurs & mesures (heure,
   longueurs décimales, tableau de conversion des masses), conjugaison. Le
   marqueur de fiche est vérifié sur la numération ; sprint et révision sont
   couverts sur la MÊME leçon (moins de fixtures, même invariant de fond : un
   grand nombre reste groupé partout).

   Pattern maison : `gotoHash`, watchErrors + expect(errors).toEqual([]), réponse
   lue via data-answer/data-attendue, jamais recalculée. Sélecteurs stables :
   .ans[data-answer], .mark[data-for], .sol, #btnVerify, .sprint-sol, #sprintInput,
   .rev-feedback.ko, #revInput.

   Profil CM1 (#240, les grands nombres groupés n'existent qu'à partir du CM1) :
   amorcé par `addInitScript` AVANT `gotoHash` — son propre amorçage
   (`ENSURE_NIVEAU`, e2e/helpers.ts) ne pose 'ce2' que si AUCUN niveau n'est
   encore fixé, donc laisse intact un niveauReference déjà posé. `gotoHash` reste
   donc utilisable (vérifié empiriquement : la génération qui suit sort bien
   « grande », cf. le test de numération plus bas) — pas besoin d'un `page.goto`
   brut, que le gate de navigation (#511, tests/e2e-navigation-gate.test.ts)
   interdit à toute spec NEUVE.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue, seedAideVueScript } from './helpers';

/* Espace fine insécable (U+202F), séparateur de milliers des grands nombres
   groupés — jamais écrit en clair dans le source (convention du projet). */
const U202F = String.fromCharCode(0x202f);

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). Amorcé
   AVANT tout `gotoHash` (cf. note d'en-tête) : la génération qui suit reste
   calibrée CM1. */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

/* ---------- 1. Marqueur de la grille de fiche (ui/session.ts) ---------- */

test.describe('Marqueur de fiche : numération CM1 « J’encadre et j’intercale »', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(SEED_CM1);
	});

	test('#501 (critères 1 et 4) : un encadrement raté groupe le grand nombre, une intercalation ratée laisse la bande intacte', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		// Cette leçon (#240) mélange ~60 % d'encadrement (réponse unique, sans
		// data-attendue) et ~40 % d'intercalation (bande, avec data-attendue) sur 8
		// items par fiche : on cherche UNE fiche qui contient les deux, sinon on en
		// tire une autre (jusqu'à 6 fiches, résidu négligeable). Reset des deux ids à
		// CHAQUE tentative : un id trouvé sur une fiche abandonnée ne vaut plus rien
		// une fois qu'on a rechargé (nouveau tirage, nouveaux ids).
		let idEncadrement: string | null = null;
		let idIntercalation: string | null = null;
		for (let tentative = 0; tentative < 6 && !(idEncadrement && idIntercalation); tentative++) {
			// `gotoHash` sur le MÊME hash à chaque tour : détecte qu'on y est déjà et force
			// un vrai `.reload()` (sinon un `page.goto` vers l'URL courante est un no-op
			// silencieux sous Chromium — cf. e2e/README.md, #511).
			await gotoHash(page, 'lecon-num-encadrer-intercaler');
			await page.locator('.ans').first().waitFor({ state: 'visible' });
			idEncadrement = null;
			idIntercalation = null;
			const champs = page.locator('.ans');
			const n = await champs.count();
			for (let i = 0; i < n; i++) {
				const champ = champs.nth(i);
				const attendue = await champ.getAttribute('data-attendue');
				const id = await champ.getAttribute('id');
				if (attendue && !idIntercalation) idIntercalation = id;
				if (!attendue && !idEncadrement) idEncadrement = id;
			}
		}
		expect(idEncadrement, 'un item d’encadrement (réponse unique) sur 8 tirages').not.toBeNull();
		expect(idIntercalation, 'un item d’intercalation (bande) sur 8 tirages').not.toBeNull();

		const champEncadrement = page.locator(`#${idEncadrement}`);
		const bonneReponse = await champEncadrement.getAttribute('data-answer');
		expect(bonneReponse).toMatch(/^\d+$/); // toujours un entier positif « grand » (#240)
		await champEncadrement.fill('1'); // jamais un nombre à plusieurs chiffres : faux à coup sûr

		const champIntercalation = page.locator(`#${idIntercalation}`);
		const bande = await champIntercalation.getAttribute('data-attendue');
		expect(bande).toContain('entre'); // « un nombre entre X et Y »
		await champIntercalation.fill('1'); // hors de toute plage « grande » (bornes ≥ 10 000)

		await page.locator('#btnVerify').click();

		// Critère 1 : l'encadrement raté révèle un nombre GROUPÉ, sans perte de valeur
		// (les chiffres, séparateurs ôtés, sont exactement ceux de data-answer).
		const solEncadrement = page.locator(`.mark[data-for="${idEncadrement}"] .sol`);
		await expect(solEncadrement).toBeVisible();
		const texteEncadrement = await solEncadrement.innerText();
		expect(texteEncadrement).toContain(U202F);
		expect(texteEncadrement).not.toContain('.');
		expect(texteEncadrement.split(U202F).join('')).toBe(`→ ${bonneReponse}`);

		// Critère 4 (négatif) : la bande, déjà rédigée par l'app (data-attendue), ressort
		// VERBATIM — formatReponseRevelee ne la reformate pas une seconde fois.
		const solIntercalation = page.locator(`.mark[data-for="${idIntercalation}"] .sol`);
		await expect(solIntercalation).toBeVisible();
		await expect(solIntercalation).toHaveText(`→ ${bande}`);

		expect(errors).toEqual([]);
	});
});

/* ---------- 2. Conjugaison : réponse texte inchangée (critère négatif) ---------- */

test('#501 (critère 4, négatif) : Conjugaison « être au présent » — la forme conjuguée révélée n’est jamais reformatée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-conj-etre-present'); // mono-mode saisie → fiche directe
	const champs = page.locator('.ans');
	await champs.first().waitFor();
	const n = await champs.count();
	expect(n).toBeGreaterThanOrEqual(6); // les 6 personnes du présent

	// Un seul champ faux (les autres corrects, lus via data-answer) : un seul .mark.wrong
	// à interpréter, sans ambiguïté sur le champ visé.
	const idCible = await champs.first().getAttribute('id');
	const bonneReponse = await champs.first().getAttribute('data-answer');
	await champs.first().fill('zzzzzz'); // jamais une forme conjuguée valide
	for (let i = 1; i < n; i++) {
		const bon = await champs.nth(i).getAttribute('data-answer');
		await champs.nth(i).fill(bon ?? '');
	}

	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.wrong')).toHaveCount(1);

	const sol = page.locator(`.mark[data-for="${idCible}"] .sol`);
	await expect(sol).toBeVisible();
	// Réponse texte : ne matche pas le motif « nombre », ressort donc INCHANGÉE.
	await expect(sol).toHaveText(`→ ${bonneReponse}`);
	expect(errors).toEqual([]);
});

/* ---------- 3. Mesures : réponse avec unité inchangée (critère négatif) ---------- */

test('#501 (critère 4, négatif) : Grandeurs et mesures « Lire l’heure » — la réponse « H h MM » révélée garde son unité', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-mes-lecture-heure');
	const champHeure = page.locator('.heure-h').first();
	await champHeure.waitFor();
	const bonneReponse = await champHeure.getAttribute('data-answer'); // « H h MM »
	const m = bonneReponse?.match(/^(\d{1,2}) h (\d{2})$/);
	expect(m).not.toBeNull();
	// Décalage de 6 h : jamais la même heure, et jamais l'ambiguïté « ±12 h » d'un cadran
	// sans repère matin/après-midi (cf. data/maths/heure.ts, variantes()).
	const heureFausse = (Number(m![1]) + 6) % 24;
	await champHeure.fill(String(heureFausse));
	await page.locator('.heure-min').first().fill(m![2]);

	await page.locator('#btnVerify').click();

	const idCible = await champHeure.getAttribute('id');
	const sol = page.locator(`.mark[data-for="${idCible}"] .sol`);
	await expect(sol).toBeVisible();
	// « H h MM » ne matche pas le motif « nombre » (lettre « h », espaces) : inchangée.
	await expect(sol).toHaveText(`→ ${bonneReponse}`);
	expect(errors).toEqual([]);
});

/* ---------- 4. Décimaux : jamais de point (critère 5) ---------- */

test.describe('Marqueur de fiche : décimaux CM1 « conversions de longueurs »', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(SEED_CM1);
	});

	test('#501 (critère 5) : un résultat décimal raté est révélé à la virgule, jamais au point, sans perte de décimale', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		// Même stratégie de relance que mesures-decimaux.spec.ts : le trou décimal ne
		// sort pas à tous les tirages (~26,7 % par item), 6 relances ramènent le résidu
		// à une probabilité négligeable (~8,4 %^6).
		let trouve = false;
		for (let tentative = 0; tentative < 6 && !trouve; tentative++) {
			await gotoHash(page, 'lecon-mes-longueurs'); // force un .reload() réel à chaque tour (#511)
			await page.locator('.ans').first().waitFor({ state: 'visible' });
			trouve = (await page.locator('.ans[data-answer*=","]').count()) > 0;
		}
		expect(trouve).toBe(true);

		const champ = page.locator('.ans[data-answer*=","]').first();
		const id = await champ.getAttribute('id');
		const bonneReponse = await champ.getAttribute('data-answer'); // ex. « 3,6 »
		expect(bonneReponse).toMatch(/^\d+,\d+$/);
		const [entier, decimales] = bonneReponse!.split(',');
		const mauvais = `${Number(entier) + 1},${decimales}`; // même précision, valeur différente
		await champ.fill(mauvais);

		await page.locator('#btnVerify').click();

		const sol = page.locator(`.mark[data-for="${id}"] .sol`);
		await expect(sol).toBeVisible();
		await expect(sol).toHaveText(`→ ${bonneReponse}`); // décimales recopiées à l'identique
		await expect(sol).not.toContainText('.');
		expect(errors).toEqual([]);
	});
});

/* ---------- 5. Correction du sprint (ui/sprint.ts) ---------- */

test('#501 (critère 1, sprint) : sprint CM1 scopé à « J’encadre et j’intercale » — la correction révèle un grand nombre groupé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_CM1);
	// Composeur de bilan personnalisé (#64) scopé à CETTE SEULE leçon (cf. e2e/README.md) :
	// le sprint ne tire plus que sur elle. `ans` du sprint est TOUJOURS un nombre isolé
	// « grand » (≥ 5 chiffres, #240), encadrement ou exemple d'intercalation confondus
	// (ui/sprint.ts ne montre jamais la bande, seulement l'exemple) : pas besoin de
	// distinguer les deux cas ici.
	await gotoHash(page, 'bilan-cat-math-numeration');
	await page.locator('#bcSelectNone').click();
	await page.locator('.bc-lesson-check[value="num-encadrer-intercaler"]').check();
	await page.locator('.bc-mode-radio[value="sprint"]').check();
	await page.locator('#bcRun').click();

	await expect(page.locator('#sprintTime')).toBeVisible();
	const champ = page.locator('#sprintInput');
	await expect(champ).toBeVisible();
	await champ.fill('1'); // jamais un nombre à plusieurs chiffres : faux à coup sûr
	await champ.press('Enter');

	const sol = page.locator('.sprint-sol');
	await expect(sol).toBeVisible();
	const texte = await sol.innerText();
	expect(texte).not.toContain('.');
	expect(texte).toMatch(new RegExp(`\\d${U202F}\\d{3}`)); // grand nombre groupé

	expect(errors).toEqual([]);
});

/* ---------- 6. Verdict de révision (ui/revision.ts) ---------- */

test('#501 (critère 1, révision) : révision CM1 « J’encadre et j’intercale » — un verdict faux révèle un grand nombre groupé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const UUID = 'e2e-501-revision';
	// Profil dédié à UUID fixe (comme revision.spec.ts) : niveauReference CM1 posé DÈS la
	// création du profil, AVANT le premier appel à `gotoHash` — son propre amorçage
	// (`ENSURE_NIVEAU`) ne pose 'ce2' que si AUCUN niveau n'est déjà fixé, donc laisse
	// intact le CM1 posé ici (vérifié : la génération qui suit sort bien « grande »).
	// Plus UNE leçon « due » dès maintenant. « num-encadrer-intercaler » produit une
	// réponse « text » (jamais tuiles en révision : seule une réponse NON numérique
	// bascule en tuiles, cf. ui/revision.ts) → repli saisie, #revInput.
	// Clé namespacée « lessonId@niveau » (#225, core/progress.ts) : une clé SANS suffixe
	// est traitée comme legacy CE2 (`NIVEAU_LEGACY`), ce qui aurait fait générer l'item au
	// petit gabarit CE2 et fait échouer ce test sans rapport avec #501 (constaté en local).
	await page.addInitScript(`
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid: UUID, name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }],
				active: UUID,
			}),
		)});
    localStorage.setItem('${UUID}/ludaskia_lessonRevision', JSON.stringify({
      'num-encadrer-intercaler@cm1': { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }
    }));
    ${seedAideVueScript(UUID)}
  `);
	await gotoHash(page, 'revision-espacee');

	const input = page.locator('#revInput');
	await expect(input).toBeVisible();
	await input.fill('1'); // jamais un nombre à plusieurs chiffres : faux à coup sûr
	await input.press('Enter');

	await expect(page.locator('.rev-feedback.ko')).toBeVisible();
	const revele = await page.locator('.rev-feedback.ko strong').innerText();
	expect(revele).not.toContain('.');
	expect(revele).toMatch(new RegExp(`\\d${U202F}\\d{3}`)); // grand nombre groupé

	expect(errors).toEqual([]);
});

/* ---------- 7. Tableau de conversion (ui/lecon-tableau.ts + lecon-runner-shared.ts) ---------- */

/* Cherche, dans une session de tableau (8 questions), la PREMIÈRE dont la réponse franchit
   le seuil de groupement (≥ 10 000) ET reste ENTIÈRE : c'est le seul cas où le nombre
   affiché porte une espace fine et aucune virgule.

   Depuis #711 la tranche de colonnes est FIXE, et les chiffres des cases valent la quantité
   dans la plus petite unité de la TRANCHE, pas dans l'unité cible. Sur « 20 kg = ? g » au
   CM1, le tableau va du kilogramme au milligramme et affiche 20000000, quand la réponse est
   20 000 g. La magnitude ne se lit donc plus sur le nombre de cases, et ne s'infère plus non
   plus de l'énoncé : les relations de rang ajoutées au CM1 sont en ×10, si bien que
   « 20 dg = ? g » met un nombre de tête dans [10, 20] au service d'une réponse de 2 g. On la
   CALCULE : les chiffres jusqu'à la dernière case de la colonne cible, zéros de tête ôtés.
   L'unité cible est celle collée au « ? » dans l'énoncé ; chaque colonne porte son symbole
   dans `.tc-sym`.

   Les questions qui ne qualifient pas sont PASSÉES (« Je ne sais pas », un clic) au lieu
   d'être remplies case par case : à sept colonnes, remplir pour avancer coûtait à lui seul
   le budget de 30 s du test. Laisse la page sur la question trouvée, cases NON remplies :
   à l'appelant de jouer la suite (vérifier ou « Je ne sais pas »). */
async function trouverTableauGroupe(
	page: import('@playwright/test').Page,
): Promise<{ chiffres: string[]; reponse: string } | null> {
	for (let session = 0; session < 4; session++) {
		await gotoHash(page, 'mode-mes-masses');
		await page.locator('.mode-btn[data-mode="tableau"]').click();
		await expect(page.locator('#tcTable')).toBeVisible();
		for (let q = 0; q < 8; q++) {
			await page.locator('.tc-cell').first().waitFor({ state: 'visible' });
			const colonnes = await page.locator('.tc-col').evaluateAll((cols) =>
				cols.map((c) => ({
					sym: (c.querySelector('.tc-sym')?.textContent ?? '').trim(),
					cases: Array.from(c.querySelectorAll('.tc-cell')).map(
						(b) => b.getAttribute('data-answer') ?? '0',
					),
				})),
			);
			const enonce = await page.locator('.tc-enonce').innerText();
			const cible = (enonce.split('=').find((membre) => membre.includes('?')) ?? '')
				.replace('?', '')
				.trim();
			const iCible = colonnes.findIndex((c) => c.sym === cible);
			if (iCible >= 0) {
				const jusquACible = colonnes.slice(0, iCible + 1).flatMap((c) => c.cases);
				const apresCible = colonnes.slice(iCible + 1).flatMap((c) => c.cases);
				const reponse = jusquACible.join('').replace(/^0+(?=\d)/, '');
				if (reponse.length >= 5 && apresCible.every((d) => d === '0')) {
					return { chiffres: colonnes.flatMap((c) => c.cases), reponse };
				}
			}
			await page.locator('#leconPasser').click();
			if (q < 7) {
				await expect(page.locator('#tcActions button')).toBeVisible();
				await page.locator('#tcActions button').click();
			}
		}
	}
	return null;
}

test('#501 (critère 1, tableau de conversion) : une case fausse groupe le feedback visible et recolle l’annonce', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_CM1);
	await seedAideVue(page); // le mode tableau déclenche l'aide au 1er lancement

	const trouve = await trouverTableauGroupe(page);
	expect(
		trouve,
		'une conversion à réponse entière ≥ 5 chiffres attendue sur 4 sessions de 8 questions',
	).not.toBeNull();
	const { chiffres, reponse } = trouve!;

	// Répond FAUX à la première case (mod 10 + 1), juste aux autres.
	const n = chiffres!.length;
	for (let i = 0; i < n; i++) {
		const bon = chiffres![i];
		const saisi = i === 0 ? String((Number(bon) + 1) % 10) : bon;
		await page.locator(`.tc-pave-btn[data-chiffre="${saisi}"]`).click();
	}
	await expect(page.locator('#tcVerif')).toBeEnabled();
	await page.locator('#tcVerif').click();

	// Face ŒIL : le feedback visible groupe le grand nombre (#501, critère 1).
	const feedback = page.locator('#tcFeedback strong');
	await expect(feedback).toBeVisible();
	const texteVu = await feedback.innerText();
	expect(texteVu).toContain(U202F);
	expect(texteVu).not.toContain('.');
	const texteRecolle = texteVu.split(U202F).join('');
	// Valeur préservée : le nombre affiché est EXACTEMENT la réponse que le tableau encode —
	// ses chiffres relus en s'arrêtant à la colonne de l'unité cible, et non la juxtaposition
	// de toutes les cases, qui vaut depuis #711 la quantité dans la plus petite unité de la
	// tranche et non dans l'unité demandée.
	expect(texteRecolle.replace(/\D/g, '')).toBe(reponse);

	// Face OREILLE : la région annoncée (#tcVerdict, nommée par `statut:` dans
	// lecon-tableau.ts) dit le MÊME nombre, jamais avec le séparateur de milliers —
	// c'est le point de passage corrigé dans lecon-runner-shared.ts:wireNext.
	const verdict = page.locator('#tcVerdict');
	await expect(verdict).not.toHaveText('');
	const texteEntendu = await verdict.innerText();
	expect(texteEntendu).not.toContain(U202F);
	expect(texteEntendu).toContain(texteRecolle);

	expect(errors).toEqual([]);
});

test('#501 (tableau de conversion, « Je ne sais pas, montre-moi ») : la révélation groupe à l’œil, recolle à l’oreille', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_CM1);
	await seedAideVue(page);

	const trouve = await trouverTableauGroupe(page);
	expect(
		trouve,
		'une conversion à réponse entière ≥ 5 chiffres attendue sur 4 sessions de 8 questions',
	).not.toBeNull();
	const { reponse } = trouve!;

	// Sortie de secours (#467) : toujours actif, même « Vérifier » désactivé (aucune case
	// remplie) — passe par `revelerSolution` (ui/lecon-passer.ts), un TROISIÈME point de
	// passage, indépendant de `wireNext`.
	await page.locator('#leconPasser').click();

	// Face ŒIL : la ligne de révélation groupe le nombre.
	const revele = page.locator('.lecon-reveal-rep strong');
	await expect(revele).toBeVisible();
	const texteVu = await revele.innerText();
	expect(texteVu).toContain(U202F);
	const texteRecolle = texteVu.split(U202F).join('');
	expect(texteRecolle.replace(/\D/g, '')).toBe(reponse);

	// Face OREILLE : balayage de TOUTES les régions live de l'écran — la révélation n'a pas
	// de région fixe dédiée (`annoncerRevelation` cherche celle du widget, sinon la région
	// fixe du runner, cf. ui/lecon-passer.ts) — aucune ne doit porter le séparateur, et
	// l'une d'elles doit annoncer le même nombre, recollé (core/nombres.ts,
	// `sansSeparateurMilliers`, posé dans `annoncerStatut`).
	const regions = page.locator('#sheets [role="status"]');
	const total = await regions.count();
	expect(total).toBeGreaterThan(0);
	let trouveRecolle = false;
	for (let i = 0; i < total; i++) {
		const texte = await regions.nth(i).innerText();
		expect(texte).not.toContain(U202F);
		if (texte.includes(texteRecolle)) trouveRecolle = true;
	}
	expect(trouveRecolle, 'au moins une région live doit annoncer le nombre recollé').toBe(true);

	expect(errors).toEqual([]);
});

/* ---------- 8. Journal encadrant (core/probleme-etapes.ts : attenduEtapeTexte) ---------- */

test('#542 (journal encadrant) : un problème d’argent CM1 raté écrit la réponse attendue à deux décimales, jamais au point', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_CM1);
	// Pas de verrou PIN hérité d'un test précédent (même précaution que erreurs-encadrant.spec.ts).
	await page.addInitScript(`localStorage.removeItem('ludaskia_encadrant_lock');`);

	// « J'ai combien en tout » (multiplication) : mono-étape, et sa branche décimale CM1
	// (`genMultiplicationDec`, ~50 % du tirage) est TOUJOURS un montant en euros — contrairement
	// à la composition/comparaison, qui mélangent argent et mesures. Un `data-answer` à point
	// suffit donc à garantir qu'on tient un item d'argent, sans lire l'énoncé.
	let dataAnswer: string | null = null;
	for (let tentative = 0; tentative < 6 && !dataAnswer?.includes('.'); tentative++) {
		await gotoHash(page, 'lecon-math-prob-multiplication');
		await page.locator('.prob-input').first().waitFor({ state: 'visible' });
		dataAnswer = await page.locator('.prob-input').first().getAttribute('data-answer');
	}
	expect(dataAnswer, 'un tirage décimal (donc en euros) attendu sur 6 essais').toMatch(
		/^\d+\.\d+$/,
	);

	await page.locator('.prob-input').first().fill('0'); // jamais la réponse : un montant est > 0
	await page.locator('#probVerif').click();
	await expect(page.locator('.prob-mark.wrong')).toBeVisible();

	// Round-trip du journal (même pattern que e2e/journal-couverture.spec.ts) : la faute vient
	// d'être commise, une seule leçon doit apparaître.
	await gotoHash(page, 'encadrant');
	const carte = page.locator('.enc-err-lecon');
	await expect(carte).toHaveCount(1);
	await carte.locator('.enc-err-sum').click();

	const bonne = carte.locator('.enc-err-bonne').first();
	await expect(bonne).toBeVisible();
	const texte = (await bonne.innerText()).trim();
	// #542 : ce que LIT le parent ne doit plus jamais porter de point (`String(4.5)` l'y
	// mettait avant ce correctif) et doit toujours porter DEUX décimales pour un montant.
	expect(texte).not.toContain('.');
	expect(texte).toMatch(/,\d{2}$/);

	expect(errors).toEqual([]);
});
