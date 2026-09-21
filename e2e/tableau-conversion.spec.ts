/* ============================================================
   Tests e2e du mode « tableau de conversion » (#394) : 2ᵉ mode des leçons
   de mesures (longueurs, masses, contenances — pas les durées, base 60).
   L'enfant remplit une colonne d'unité par case via un pavé de chiffres
   externe (jamais de clavier natif), avec avance automatique.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Le mode « tableau » déclenche l'aide contextuelle au 1er lancement (overlay
   bloquant, cf. numeration.spec.ts) : on la marque comme déjà vue. */
test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
});

/* Profil CM1 (pattern repris tel quel de mesures-decimaux.spec.ts / clic-verbe.spec.ts) :
   nécessaire pour le cas le plus défavorable du critère 11 (mes-masses au CM1, colonnes les
   plus longues du catalogue — cf. plus bas). Navigation via `gotoHash` (gate
   `tests/e2e-navigation-gate.test.ts` : `page.goto` direct est une dette exemptée UNIQUEMENT
   sur les specs déjà listées avant le gate, jamais sur une spec neuve). La crainte d'origine
   ne tient pas : `ENSURE_NIVEAU` (e2e/helpers.ts) ne force `niveauReference: 'ce2'` QUE sur un
   profil où le champ est absent, et ne fabrique un profil que si la liste est vide — un profil
   CM1 déjà semé par `addInitScript(SEED_CM1)` survit intact. L'ordre joue en notre faveur : les
   scripts `addInitScript` s'exécutent dans l'ordre d'ajout, et `gotoHash` ajoute le sien
   (ENSURE_NIVEAU) APRÈS celui-ci. */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await gotoHash(page, hash);
}

/* Remplit toutes les cases dans l'ordre de `data-i` croissant via le pavé, en
   utilisant le chiffre attendu (`data-answer`) de chaque case. L'avance auto
   suit l'ordre : cliquer les bons boutons du pavé dans l'ordre suffit. */
async function remplirTableau(page: import('@playwright/test').Page): Promise<void> {
	const cellules = page.locator('.tc-cell');
	const n = await cellules.count();
	for (let i = 0; i < n; i++) {
		const cellule = page.locator(`.tc-cell[data-i="${i}"]`);
		const chiffre = await cellule.getAttribute('data-answer');
		await page.locator(`.tc-pave-btn[data-chiffre="${chiffre}"]`).click();
	}
}

test('mes-longueurs : le choix de mode propose saisie et tableau', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-longueurs');
	await expect(page.locator('.mode-btn[data-mode="saisie"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="tableau"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('mes-longueurs (tableau) : le tableau se rend avec au moins 2 cases', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();
	expect(await page.locator('.tc-cell').count()).toBeGreaterThanOrEqual(2);
	expect(errors).toEqual([]);
});

test('mes-longueurs (tableau) : remplir toutes les cases juste donne Bravo', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	await remplirTableau(page);
	await expect(page.locator('#tcVerif')).toBeEnabled();
	await page.locator('#tcVerif').click();

	const n = await page.locator('.tc-cell').count();
	for (let i = 0; i < n; i++) {
		await expect(page.locator(`.tc-cell[data-i="${i}"]`)).toHaveClass(/correct/);
	}
	await expect(page.locator('#tcFeedback')).toContainText('Bravo');
	await expect(page.locator('#tcActions button')).toBeVisible();
	expect(errors).toEqual([]);
});

test('mes-masses (tableau) : une case fausse donne un ✗ et affiche la bonne réponse', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-masses');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	const cellules = page.locator('.tc-cell');
	const n = await cellules.count();
	// Remplit toutes les cases juste, sauf la première qu'on trompe volontairement.
	for (let i = 0; i < n; i++) {
		const cellule = page.locator(`.tc-cell[data-i="${i}"]`);
		const bon = await cellule.getAttribute('data-answer');
		const chiffre = i === 0 ? String((Number(bon) + 1) % 10) : (bon ?? '0');
		await page.locator(`.tc-pave-btn[data-chiffre="${chiffre}"]`).click();
	}
	await expect(page.locator('#tcVerif')).toBeEnabled();
	await page.locator('#tcVerif').click();

	await expect(page.locator('.tc-cell[data-i="0"]')).toHaveClass(/wrong/);
	const bonneReponse = await page.locator('.tc-cell').first().getAttribute('data-answer');
	// data-answer reste posé après correction : on vérifie juste la présence du feedback détaillé.
	expect(bonneReponse).not.toBeNull();
	await expect(page.locator('#tcFeedback')).toContainText('La bonne réponse était');
	expect(errors).toEqual([]);
});

/* Gate #711 (constat `relecteur-accessibilite`) : la tranche de colonnes étant fixe, le
   tableau des longueurs en affiche sept — plus large que la scène, que `.sprint` plafonne à
   600 px. Le débordement est donc la situation NORMALE, et non plus un cas limite de petit
   écran. Le chemin du pavé focalise la case active avec `preventScroll` (pour ne pas faire
   sauter la page), ce qui laissait l'enfant écrire à l'aveugle dans une case surlignée
   sortie du cadre. Le test suit la case active jusqu'au bout d'une question et exige qu'elle
   reste visible dans `.tc-wrap` à chaque frappe. */
test('mes-longueurs (tableau) : la case active reste visible quand le tableau déborde', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	const cellules = page.locator('.tc-cell');
	const n = await cellules.count();
	// Le cas n'a d'intérêt que si le tableau déborde vraiment de son cadre.
	const deborde = await page
		.locator('.tc-wrap')
		.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
	expect(deborde, 'le tableau devrait déborder de .tc-wrap sur ce viewport').toBe(true);

	for (let i = 0; i < n; i++) {
		const chiffre = await cellules.nth(i).getAttribute('data-answer');
		await page.locator(`.tc-pave-btn[data-chiffre="${chiffre ?? '0'}"]`).click();
		// La dernière frappe n'avance plus : il n'y a pas de case suivante à suivre.
		if (i === n - 1) break;
		const dedans = await page.evaluate(() => {
			const active = document.querySelector('.tc-cell--active');
			const wrap = document.querySelector('.tc-wrap');
			if (!active || !wrap) return null;
			const a = active.getBoundingClientRect();
			const w = wrap.getBoundingClientRect();
			return {
				visible: a.left >= w.left - 1 && a.right <= w.right + 1,
				left: a.left,
				wrapLeft: w.left,
				right: a.right,
				wrapRight: w.right,
			};
		});
		expect(dedans, 'aucune case active trouvée').not.toBeNull();
		expect(dedans!.visible, `case ${i + 1}/${n} hors du cadre : ${JSON.stringify(dedans)}`).toBe(
			true,
		);
	}

	expect(errors).toEqual([]);
});

/* ============================================================
   Lot 3 (#711) : rendu portrait / paysage du tableau. Les quatre tests
   ci-dessous couvrent les critères 11 à 14 de l'issue.
   ============================================================ */

/* Critère 12 : en paysage sous une hauteur donnée, tableau et pavé côte à côte,
   les 7 colonnes des longueurs tiennent sans défilement. Viewport 851×393
   d'après les mesures relevées sur le profil Chromium mobile du projet (tableau
   entièrement visible, pavé à droite).

   REJET ÉCRIT (#711, évaluation de couverture) : mes-masses au CM1 (noms plus longs,
   cf. critère 11 plus haut) a été mesuré sur CE MÊME viewport et NE tient PAS dans le
   cadre — `.tc-wrap` : clientWidth 579px, scrollWidth 640px (déborde de 61px) ;
   `.tc-table` fait ~636px de large et son bord droit (≈676px) chevauche le pavé, dont
   le bord gauche est à ≈629px. Le critère 12 reste donc porté par mes-longueurs SEUL :
   l'étendre aux masses/CM1 sur ce viewport ferait un test rouge en permanence (ou
   forcerait un contournement complaisant), pas un gain de couverture. Si le rendu du
   tableau change (plafond de colonne, largeur de scène), remesurer avant de rouvrir. */
test('mes-longueurs (tableau, #711 critère 12) : en paysage le tableau et le pavé sont côte à côte, sans défilement', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 851, height: 393 });
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	// Aucun défilement horizontal du cadre : les 7 colonnes tiennent entières.
	const deborde = await page
		.locator('.tc-wrap')
		.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
	expect(deborde, 'le tableau ne devrait pas déborder de .tc-wrap en paysage 851×393').toBe(false);

	const rects = await page.evaluate(() => {
		const table = document.querySelector('.tc-table')?.getBoundingClientRect();
		const pave = document.querySelector('.tc-pave')?.getBoundingClientRect();
		if (!table || !pave) return null;
		return {
			table: { left: table.left, right: table.right, top: table.top, bottom: table.bottom },
			pave: { left: pave.left, right: pave.right, top: pave.top, bottom: pave.bottom },
		};
	});
	expect(rects, 'tableau ou pavé introuvable').not.toBeNull();
	const { table, pave } = rects!;

	// Côte à côte : le tableau finit avant que le pavé ne commence…
	expect(
		table.right,
		`tableau (right=${table.right}) devrait finir avant le pavé (left=${pave.left})`,
	).toBeLessThanOrEqual(pave.left + 1);
	// … et leurs plages verticales se recoupent (même rangée, pas une colonne empilée).
	const seChevauchentVerticalement = table.top < pave.bottom && pave.top < table.bottom;
	expect(
		seChevauchentVerticalement,
		`pas de recouvrement vertical : tableau=${JSON.stringify(table)} pavé=${JSON.stringify(pave)}`,
	).toBe(true);

	expect(errors).toEqual([]);
});

/* Critère 11 : le nom d'unité en toutes lettres reste ENTIER — ni tronqué (pas
   de coupure CSS visible via scrollWidth > clientWidth), ni remplacé par son
   seul symbole. On parcourt toutes les colonnes rendues, quelle que soit la
   leçon de mesure. Viewport portrait 393×851 (le plus étroit des repères) :
   c'est le cas le plus défavorable à la place disponible pour le nom.

   Deux cas, PAS un seul : mes-longueurs (CE2, la leçon la plus commune) ET
   mes-masses au CM1, qui affiche la même chaîne de 7 colonnes mais avec les
   noms les plus longs de l'application (« kilogrammes », « hectogrammes »,
   « décagrammes », « décigrammes », « centigrammes », « milligrammes » — la
   racine « -gramme » est plus longue que « -mètre »). Avant cet ajout, ce cas
   n'était vérifié que par une capture d'écran (`galerie.spec.ts`, baselines
   Linux, sans valeur hors CI) : un nom rogné spécifiquement sur les masses au
   CM1 n'aurait fait rougir aucune assertion. */
const CAS_COLONNES_CRITERE_11: { label: string; hash: string; cm1: boolean }[] = [
	{ label: 'mes-longueurs (CE2 par défaut)', hash: 'mode-mes-longueurs', cm1: false },
	{
		label: 'mes-masses (CM1, noms de colonnes les plus longs du catalogue)',
		hash: 'mode-mes-masses',
		cm1: true,
	},
];

for (const { label, hash, cm1 } of CAS_COLONNES_CRITERE_11) {
	test(`${label} (tableau, #711 critère 11) : le nom d'unité reste entier, jamais tronqué ni réduit au symbole`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.setViewportSize({ width: 393, height: 851 });
		if (cm1) {
			await gotoCM1(page, hash);
		} else {
			await gotoHash(page, hash);
		}
		await page.locator('.mode-btn[data-mode="tableau"]').click();
		await expect(page.locator('#tcTable')).toBeVisible();

		const colonnes = page.locator('.tc-col');
		const n = await colonnes.count();
		expect(n).toBeGreaterThanOrEqual(2);

		for (let i = 0; i < n; i++) {
			const colonne = colonnes.nth(i);
			const nom = colonne.locator('.tc-nom');
			const sym = colonne.locator('.tc-sym');

			const rogne = await nom.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
			const nomTexte = ((await nom.textContent()) ?? '').trim();
			const symTexte = ((await sym.textContent()) ?? '').trim();

			expect(rogne, `colonne ${i} : nom « ${nomTexte} » rogné (scrollWidth > clientWidth)`).toBe(
				false,
			);
			expect(nomTexte.length, `colonne ${i} : nom vide`).toBeGreaterThan(0);
			expect(
				nomTexte.toLowerCase(),
				`colonne ${i} : le nom « ${nomTexte} » a été réduit au symbole « ${symTexte} »`,
			).not.toBe(symTexte.toLowerCase());
			expect(
				nomTexte.length,
				`colonne ${i} : nom « ${nomTexte} » pas plus long que le symbole « ${symTexte} »`,
			).toBeGreaterThan(symTexte.length);
		}

		expect(errors).toEqual([]);
	});
}

/* Critère 13 : quand le tableau déborde en portrait, l'enfant est INVITÉ à
   tourner l'appareil, et rien n'est VERROUILLÉ — aucun appel à
   `screen.orientation.lock`. Le dispositif est en DEUX registres (arbitrage
   mainteneur, cf. `AIDES.tableau.alternative` dans core/aide.ts) : le signal
   dans l'écran d'exercice est désormais une JAUGE DE DÉFILEMENT posée sous le
   cadre (`#tcJauge` / `.tc-jauge-curseur`, pilotée par le défilement réel —
   voir le test dédié plus bas pour le détail de son comportement), et non
   plus le fondu de bord `tc-wrap--suite-d` d'origine : un `mask-image` baisse
   l'alpha de TOUT le contenu sous la bande, y compris des chiffres et noms
   d'unité entièrement visibles, ce qui faisait tomber le contraste sous le
   seuil WCAG AA. Ici on vérifie juste qu'elle EST visible et qu'elle ne ment
   pas (curseur partiel, jamais plein) ; la phrase qui invite à tourner
   l'appareil vit, elle, dans l'aide contextuelle ouverte par le bouton « ? »
   (`.aide-btn`) — on vérifie donc qu'elle y est BIEN atteignable, pas
   seulement présente dans le code. On instrumente `screen.orientation.lock`
   avant toute navigation pour enregistrer les appels éventuels. */
test("mes-longueurs (tableau, #711 critère 13) : en portrait, le débordement est signalé et l'aide invite à tourner l'écran sans verrou d'orientation", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(() => {
		(window as unknown as { __tcLockCalls: unknown[] }).__tcLockCalls = [];
		const orientation = window.screen && window.screen.orientation;
		if (!orientation) return;
		try {
			Object.defineProperty(orientation, 'lock', {
				configurable: true,
				value: (...args: unknown[]) => {
					(window as unknown as { __tcLockCalls: unknown[] }).__tcLockCalls.push(args);
					return Promise.resolve();
				},
			});
		} catch {
			// `lock` non reconfigurable sur ce navigateur : un vrai appel lèverait alors une
			// exception visible (donc détectée par watchErrors), le critère resterait tenu.
		}
	});
	await page.setViewportSize({ width: 393, height: 851 });
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	// Le cas n'a d'intérêt que si le tableau déborde vraiment de son cadre.
	const deborde = await page
		.locator('.tc-wrap')
		.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
	expect(deborde, 'le tableau devrait déborder de .tc-wrap en portrait 393×851').toBe(true);

	// Signal permanent : le portrait ne tronque pas « sans rien dire ». La jauge est
	// visible, et son curseur n'occupe qu'une FRACTION de la piste — jamais pleine,
	// sinon elle prétendrait que tout le tableau est déjà là.
	const jaugeCritere13 = page.locator('#tcJauge');
	await expect(jaugeCritere13).toBeVisible();
	await expect(jaugeCritere13).not.toHaveClass(/tc-jauge--inactive/);
	const fractionCritere13 = await page.evaluate(() => {
		const j = document.querySelector('#tcJauge') as HTMLElement;
		const c = document.querySelector('.tc-jauge-curseur') as HTMLElement;
		return c.getBoundingClientRect().width / j.getBoundingClientRect().width;
	});
	expect(
		fractionCritere13,
		`le curseur (ratio=${fractionCritere13}) devrait n'occuper qu'une fraction de la piste`,
	).toBeLessThan(1);

	// L'invitation à tourner l'appareil est atteignable depuis l'écran d'exercice, via
	// l'aide contextuelle (`seedAideVue` du beforeEach ne masque que l'AUTO-affichage au
	// 1er lancement ; le bouton « ? » persistant reste, lui, toujours disponible).
	const boutonAide = page.locator('button.aide-btn');
	await expect(boutonAide).toBeVisible();
	await boutonAide.click();
	const overlay = page.locator('#aideOverlay');
	await expect(overlay).toBeVisible();
	await expect(overlay.locator('.aide-alt')).toContainText(
		"Le tableau dépasse de l'écran ? Fais-le glisser, ou tourne l'appareil, pour voir plus de colonnes.",
	);
	await overlay.locator('.aide-ok').click();
	await expect(overlay).toHaveCount(0);

	const appelsVerrou = await page.evaluate(
		() => (window as unknown as { __tcLockCalls: unknown[] }).__tcLockCalls,
	);
	expect(appelsVerrou, 'aucune tentative de verrouillage d’orientation ne doit avoir lieu').toEqual(
		[],
	);

	expect(errors).toEqual([]);
});

/* Critère 14 : les cases conservent au moins leur taille tactile actuelle
   (40 × 46 px, repère relevé sur le profil Chromium mobile du projet) dans les
   deux orientations. Tolérance de 0,5 px pour l'arrondi sous-pixel du rendu. */
test('mes-longueurs (tableau, #711 critère 14) : les cases gardent leur taille tactile dans les deux orientations', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const orientations = [
		{ width: 393, height: 851, label: 'portrait' },
		{ width: 851, height: 393, label: 'paysage' },
	];

	for (const { width, height, label } of orientations) {
		await page.setViewportSize({ width, height });
		await gotoHash(page, 'mode-mes-longueurs');
		await page.locator('.mode-btn[data-mode="tableau"]').click();
		await expect(page.locator('#tcTable')).toBeVisible();

		const dims = await page.locator('.tc-cell').evaluateAll((els) =>
			els.map((el) => {
				const r = el.getBoundingClientRect();
				return { w: r.width, h: r.height };
			}),
		);
		expect(dims.length, `aucune case trouvée en ${label}`).toBeGreaterThan(0);
		for (const d of dims) {
			expect(
				d.w,
				`case trop étroite en ${label} : ${d.w}px (attendu ≥ 40px)`,
			).toBeGreaterThanOrEqual(39.5);
			expect(d.h, `case trop basse en ${label} : ${d.h}px (attendu ≥ 46px)`).toBeGreaterThanOrEqual(
				45.5,
			);
		}
	}

	expect(errors).toEqual([]);
});

/* Jauge de défilement (#711, remplace le fondu de bord `tc-wrap--suite-d` écarté pour
   contraste insuffisant, cf. commentaire du critère 13 plus haut) : elle ne touche à aucun
   contenu, et dit EN PLUS quelle part du tableau est visible. Portrait 393×851 : le viewport
   où mes-longueurs déborde (mêmes mesures que les critères 11 et 13). Trois observables :
   - au repos (avant toute interaction), le curseur est collé au bord gauche de la piste et
     n'en occupe qu'une partie ;
   - sa largeur reflète le ratio `clientWidth / scrollWidth` de `.tc-wrap`, au plancher de
     32 px près (`min-width` SCSS) ;
   - après un défilement complet (`scrollLeft = scrollWidth`), son bord droit rejoint le bord
     droit de la piste à quelques pixels près — ce qui dit à l'enfant qu'il n'y a plus rien
     après. */
test('mes-longueurs (tableau, #711 jauge) : le curseur reflète la part visible du tableau, au repos et après défilement complet', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 393, height: 851 });
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	// Le cas n'a d'intérêt que si le tableau déborde vraiment de son cadre.
	const deborde = await page
		.locator('.tc-wrap')
		.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
	expect(deborde, 'le tableau devrait déborder de .tc-wrap en portrait 393×851').toBe(true);

	const releve = () =>
		page.evaluate(() => {
			const wrap = document.querySelector('.tc-wrap') as HTMLElement;
			const jauge = document.querySelector('#tcJauge') as HTMLElement;
			const curseur = document.querySelector('.tc-jauge-curseur') as HTMLElement;
			const j = jauge.getBoundingClientRect();
			const c = curseur.getBoundingClientRect();
			return {
				pisteLeft: j.left,
				pisteRight: j.right,
				pisteWidth: j.width,
				curseurLeft: c.left,
				curseurRight: c.right,
				curseurWidth: c.width,
				wrapClientWidth: wrap.clientWidth,
				wrapScrollWidth: wrap.scrollWidth,
			};
		});

	// Au repos : collé à gauche de la piste, et partiel (pas plein).
	const repos = await releve();
	expect(
		repos.curseurLeft - repos.pisteLeft,
		`curseur pas collé à gauche au repos : ${JSON.stringify(repos)}`,
	).toBeLessThanOrEqual(2);
	expect(repos.curseurWidth, `curseur plein dès le repos : ${JSON.stringify(repos)}`).toBeLessThan(
		repos.pisteWidth,
	);

	// Sa largeur reflète la part visible du cadre, au plancher de 32 px près.
	const attendu = Math.max(32, (repos.pisteWidth * repos.wrapClientWidth) / repos.wrapScrollWidth);
	expect(
		Math.abs(repos.curseurWidth - attendu),
		`largeur du curseur (${repos.curseurWidth}px) éloignée de l'attendu (${attendu}px) : ${JSON.stringify(repos)}`,
	).toBeLessThanOrEqual(3);

	// Défilement complet du cadre : le curseur rejoint le bord droit de la piste.
	await page.evaluate(() => {
		const el = document.querySelector('.tc-wrap') as HTMLElement;
		el.scrollLeft = el.scrollWidth;
	});
	await expect
		.poll(
			async () => {
				const fin = await releve();
				return fin.pisteRight - fin.curseurRight;
			},
			{
				message: 'le curseur devrait rejoindre le bord droit de la piste après défilement complet',
			},
		)
		.toBeLessThanOrEqual(3);

	expect(errors).toEqual([]);
});

/* Cas « rien à signaler » (#711) : en paysage sans débordement (mêmes mesures que le
   critère 12 : mes-longueurs, 851×393), une jauge qui resterait affichée pleine mentirait —
   il n'y a rien à faire défiler. `tc-jauge--inactive` retire tout via `display: none`
   (cf. SCSS), donc la jauge n'occupe AUCUNE hauteur. */
test('mes-longueurs (tableau, #711 jauge) : en paysage sans débordement, la jauge est inactive et invisible', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 851, height: 393 });
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	const deborde = await page
		.locator('.tc-wrap')
		.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
	expect(deborde, 'le tableau ne devrait pas déborder de .tc-wrap en paysage 851×393').toBe(false);

	const jauge = page.locator('#tcJauge');
	await expect(jauge).toHaveClass(/tc-jauge--inactive/);
	const hauteur = await jauge.evaluate((el) => el.getBoundingClientRect().height);
	expect(
		hauteur,
		`la jauge occupe ${hauteur}px de hauteur alors qu'elle devrait être masquée`,
	).toBe(0);

	expect(errors).toEqual([]);
});
