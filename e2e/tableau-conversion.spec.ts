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

test('mes-longueurs (CE2) : le choix de mode propose saisie et tableau, jamais virgule (#711 critère 20)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'mode-mes-longueurs');
	await expect(page.locator('.mode-btn[data-mode="saisie"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="tableau"]')).toBeVisible();
	// Critère 20 (négatif) : l'écriture décimale est hors programme CE2 — le mode
	// « virgule » (réservé au CM1 via `ModeOption.levels`) ne doit jamais y apparaître.
	// Ce même sélecteur trouve bien le bouton côté CM1 (test « le mode virgule est
	// proposé… » plus bas) : la paire des deux tests prouve que l'absence ici n'est
	// pas un sélecteur muet, mais le filtre de niveau qui joue.
	await expect(page.locator('.mode-btn[data-mode="virgule"]')).toHaveCount(0);
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

/* ============================================================
   Lot 4 (#711) : mode « virgule », CM1 seulement, mes-longueurs et
   mes-contenances. L'application ne pose plus la virgule : l'enfant la place
   lui-même, à la frontière de colonne qui suit la case active, via le 12ᵉ
   bouton du pavé (`data-pave="virgule"`).
   ============================================================ */

/* La position ATTENDUE de la virgule n'est PAS exposée dans le DOM avant correction
   (anti-suggestion voulue) : on la DÉRIVE de l'énoncé, jamais d'un calcul recopié du
   générateur. `.tc-enonce` s'écrit toujours « … @ ${unité} … » (`buildQuestion`,
   `data/maths/mesures.ts`), le trou étant rendu par le span `.tc-trou` (texte « ? ») :
   l'unité qui suit immédiatement le « ? » est donc l'unité demandée, quel que soit le
   sens de l'égalité (connue = @ unité, ou @ unité = connue — les deux collent l'unité
   au trou). On retrouve ensuite la colonne dont le `.tc-sym` porte ce symbole. */
async function colonneCibleIndex(page: Page): Promise<number> {
	const enonce = await page.locator('.tc-enonce').innerText();
	const m = enonce.match(/\?\s*([^\s0-9=,.]+)/);
	if (!m) throw new Error(`Énoncé illisible pour en déduire l'unité cible : « ${enonce} »`);
	const unite = m[1];
	const symboles = page.locator('.tc-sym');
	const n = await symboles.count();
	for (let i = 0; i < n; i++) {
		if (((await symboles.nth(i).textContent()) ?? '').trim() === unite) return i;
	}
	throw new Error(`Colonne cible « ${unite} » introuvable parmi les ${n} symboles affichés.`);
}

/* Rend active une case de la colonne `colIndex` (n'importe laquelle des 1-2 cases de la
   colonne : `basculerVirgule` retombe de toute façon sur la DERNIÈRE case de la colonne
   qui contient la case active, cf. `colonneDeCase`/`derniereCaseDe` dans lecon-tableau.ts). */
async function cliquerCaseColonne(page: Page, colIndex: number): Promise<void> {
	await page.locator('.tc-col').nth(colIndex).locator('.tc-cell').first().click();
}

/* Contenu CALCULÉ d'un pseudo-élément. `getComputedStyle().content` rend la chaîne ENTRE
   GUILLEMETS ('"✓"', '""' pour un contenu vide, 'none' si masqué). Vérifier la CLASSE ne
   suffit pas : un bug de spécificité (le masquage `.tc-table--virgule-posee .tc-fente::before`
   battait les règles de verdict) laissait la classe posée mais supprimait pastille et liseré. */
const contenuPseudo = (page: Page, sel: string, pseudo: '::before' | '::after') =>
	page.locator(sel).evaluate((el, p) => getComputedStyle(el, p).content, pseudo);

/* Index plats (data-i) des cases dont l'aria-label annonce la virgule. Lecture AU REPOS : la
   virgule est `aria-hidden` sur ses emplacements, seule la case qui la précède la porte. On lit
   `evaluateAll` (one-shot) : à appeler après une attente sur l'état visé (classe/expect). */
const casesAvecVirgule = (page: Page): Promise<string[]> =>
	page
		.locator('.tc-cell')
		.evaluateAll((els) =>
			els
				.filter((el) => (el.getAttribute('aria-label') ?? '').includes('virgule après'))
				.map((el) => el.getAttribute('data-i') ?? ''),
		);

/* data-i de la DERNIÈRE case d'une colonne (1 ou 2 cases : une tête peut en porter deux). */
const derniereCaseIndex = async (page: Page, colIndex: number): Promise<string> =>
	(await page.locator('.tc-col').nth(colIndex).locator('.tc-cell').last().getAttribute('data-i')) ??
	'';

const clicVirgule = (page: Page) => page.locator('.tc-pave-btn[data-pave="virgule"]').click();

test('mes-longueurs (CM1) : le mode « virgule » est proposé, contrairement au CE2 (#711 critère 20)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'mode-mes-longueurs');
	await expect(page.locator('.mode-btn[data-mode="saisie"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="tableau"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="virgule"]')).toBeVisible();
	expect(errors).toEqual([]);
});

/* mes-masses n'a AUCUNE conversion décimale au CM1 (aucune paire ×10/×100 en masse,
   cf. commentaire de CONFIG_MASSES) : le mode ne doit pas apparaître, même à ce niveau —
   contrairement à mes-longueurs et mes-contenances juste au-dessus/en-dessous, qui, elles,
   le proposent au même niveau. C'est cette paire de tests qui prouve que l'absence ici
   tient à la configuration de la leçon, pas à un filtre de niveau qui bloquerait tout. */
test('mes-masses (CM1) : le mode « virgule » n’est PAS proposé (aucune conversion décimale en masse)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'mode-mes-masses');
	await expect(page.locator('.mode-btn[data-mode="saisie"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="tableau"]')).toBeVisible();
	await expect(page.locator('.mode-btn[data-mode="virgule"]')).toHaveCount(0);
	expect(errors).toEqual([]);
});

/* Critère 19 étendu (#711 lot 4) : la réponse n'est complète que si TOUTES les cases sont
   remplies ET la virgule posée. Avant #711, "toutes les cases remplies" suffisait — c'est
   justement ce que ce test protège : que le mode `virgule` ajoute bien une seconde
   condition, sans laquelle « Vérifier » s'activerait dès la dernière case écrite. */
test('mes-longueurs (virgule, #711 critère 19 étendu) : Vérifier reste désactivé tant que la virgule n’est pas posée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="virgule"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	await remplirTableau(page);
	// Toutes les cases sont remplies (remplirTableau les traite dans l'ordre de data-i
	// croissant, en écrivant le chiffre attendu de chacune), mais aucune virgule n'a été
	// posée : la validation doit rester bloquée.
	await expect(page.locator('#tcVerif')).toBeDisabled();

	const cible = await colonneCibleIndex(page);
	await cliquerCaseColonne(page, cible);
	await clicVirgule(page);
	await expect(page.locator('#tcVerif')).toBeEnabled();

	expect(errors).toEqual([]);
});

/* Le geste : poser, déplacer, retirer. `tc-table--virgule-posee` est le seul état qui
   masque les repères vides sur TOUTES les colonnes (cf. SCSS, `.tc-table--virgule-posee
   .tc-fente::before { content: none; }`) : le vérifier à chaque étape prouve à la fois le
   déplacement ET la disparition des repères tant qu'une virgule reste posée quelque part. */
test('mes-longueurs (virgule, #711 lot 4) : poser, déplacer puis retirer la virgule', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="virgule"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	const nCol = await page.locator('.tc-col').count();
	const a = await colonneCibleIndex(page);
	const b = a > 0 ? a - 1 : a + 1; // une autre colonne, valide dans tous les cas (n ≥ 2)
	expect(b).toBeGreaterThanOrEqual(0);
	expect(b).toBeLessThan(nCol);

	const table = page.locator('#tcTable');
	const fenteA = page.locator(`.tc-fente[data-apres="${a}"]`);
	const fenteB = page.locator(`.tc-fente[data-apres="${b}"]`);

	// Au repos : aucun repère « posé », donc le masquage n'est pas actif.
	await expect(table).not.toHaveClass(/tc-table--virgule-posee/);
	// Le repère du vide est bien RENDU sur les emplacements tant qu'aucune virgule n'est posée.
	expect(await contenuPseudo(page, `.tc-fente[data-apres="${b}"]`, '::before')).not.toBe('none');

	// Pose en A.
	await cliquerCaseColonne(page, a);
	await clicVirgule(page);
	await expect(table).toHaveClass(/tc-table--virgule-posee/);
	await expect(fenteA).toHaveClass(/tc-fente--posee/);
	await expect(fenteB).not.toHaveClass(/tc-fente--posee/);
	// La virgule suit son emplacement dans les aria-label : UNE case, la dernière de A.
	expect(await casesAvecVirgule(page)).toEqual([await derniereCaseIndex(page, a)]);
	// Une virgule posée : les repères vides des autres emplacements ne sont plus rendus.
	expect(await contenuPseudo(page, `.tc-fente[data-apres="${b}"]`, '::before')).toBe('none');

	// Déplacement vers B : une pression AILLEURS retire l'ancienne et pose la nouvelle.
	await cliquerCaseColonne(page, b);
	await clicVirgule(page);
	await expect(table).toHaveClass(/tc-table--virgule-posee/); // toujours posée quelque part
	await expect(fenteB).toHaveClass(/tc-fente--posee/);
	await expect(fenteA).not.toHaveClass(/tc-fente--posee/);
	// Déplacée : le libellé quitte A et se pose sur la dernière case de B (jamais deux virgules).
	expect(await casesAvecVirgule(page)).toEqual([await derniereCaseIndex(page, b)]);

	// Retrait : une seconde pression AU MÊME ENDROIT (le focus/l'actif est resté en B).
	await clicVirgule(page);
	await expect(table).not.toHaveClass(/tc-table--virgule-posee/);
	await expect(fenteB).not.toHaveClass(/tc-fente--posee/);
	expect(await casesAvecVirgule(page)).toEqual([]); // retirée : plus aucune case ne l'annonce
	// Virgule retirée : le repère du vide revient (le correctif ne doit pas casser ce sens-là).
	expect(await contenuPseudo(page, `.tc-fente[data-apres="${b}"]`, '::before')).not.toBe('none');

	// Colonne de tête (index 0) : la virgule se pose après sa DERNIÈRE case, jamais entre deux
	// chiffres. Si la tête n'a qu'une case sur ce tirage, l'assertion reste vraie mais ne
	// distingue pas index de case et index de colonne (cf. compte rendu).
	await cliquerCaseColonne(page, 0);
	await clicVirgule(page);
	await expect(page.locator('.tc-fente[data-apres="0"]')).toHaveClass(/tc-fente--posee/);
	expect(await casesAvecVirgule(page)).toEqual([await derniereCaseIndex(page, 0)]);

	expect(errors).toEqual([]);
});

/* Critère 17 + correction dissociée (#711 lot 4, le cœur du lot) : des chiffres tous
   justes ne doivent PAS se lire comme un échec total à cause d'une virgule mal placée.
   On pose volontairement la virgule un rang trop loin (colonne voisine de la cible). */
test('mes-longueurs (virgule, #711 critère 17) : chiffres justes + virgule mal placée → les cases restent correct, seule la virgule est fausse', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="virgule"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	const cible = await colonneCibleIndex(page);
	const nCol = await page.locator('.tc-col').count();
	const fausse = cible > 0 ? cible - 1 : cible + 1;
	expect(fausse).toBeGreaterThanOrEqual(0);
	expect(fausse).toBeLessThan(nCol);

	await remplirTableau(page); // tous les chiffres, justes
	await cliquerCaseColonne(page, fausse);
	await clicVirgule(page);
	await expect(page.locator('#tcVerif')).toBeEnabled();
	await page.locator('#tcVerif').click();

	// Les chiffres, TOUS justes, restent verts malgré la virgule fausse.
	const n = await page.locator('.tc-cell').count();
	for (let i = 0; i < n; i++) {
		await expect(page.locator(`.tc-cell[data-i="${i}"]`)).toHaveClass(/correct/);
		await expect(page.locator(`.tc-cell[data-i="${i}"]`)).not.toHaveClass(/wrong/);
	}
	// L'emplacement choisi est marqué faux, l'emplacement attendu montré à son tour.
	await expect(page.locator(`.tc-fente[data-apres="${fausse}"]`)).toHaveClass(/tc-fente--fausse/);
	await expect(page.locator(`.tc-fente[data-apres="${cible}"]`)).toHaveClass(/tc-fente--attendue/);
	// Feedback dédié : « Tes chiffres sont bons » plutôt qu'un échec en bloc.
	// Rendu réel des marques (pas seulement les classes) : pastille ✗ sur l'emplacement choisi,
	// liseré rendu (contenu non masqué) sur l'emplacement attendu.
	expect(await contenuPseudo(page, `.tc-fente[data-apres="${fausse}"]`, '::before')).toBe('"✗"');
	expect(await contenuPseudo(page, `.tc-fente[data-apres="${cible}"]`, '::before')).not.toBe(
		'none',
	);
	// Seul canal du verdict de la virgule hors du visuel : le texte nomme la règle enfreinte.
	// Libellé testé à dessein (« la virgule allait après… »), pas seulement « chiffres bons ».
	await expect(page.locator('#tcFeedback')).toContainText('Tes chiffres sont bons');
	await expect(page.locator('#tcFeedback')).toContainText('la virgule allait après');
	// L'annonce de la virgule survit à la correction : la case qui la précède dit à la fois
	// « virgule après » et « correct » (chiffres justes), et elle est seule à le dire.
	const porteuses = await casesAvecVirgule(page);
	expect(porteuses).toEqual([await derniereCaseIndex(page, fausse)]);
	const libelle = await page
		.locator(`.tc-cell[data-i="${porteuses[0]}"]`)
		.getAttribute('aria-label');
	expect(libelle).toContain('virgule après');
	expect(libelle).toMatch(/correct/);
	expect(libelle).not.toMatch(/incorrect/);

	expect(errors).toEqual([]);
});

/* Cas « tout juste » : chiffres corrects + virgule au bon rang → tableau entièrement
   correct, l'emplacement de la virgule marqué « juste ». */
test('mes-longueurs (virgule, #711) : chiffres justes + virgule au bon rang → tableau correct', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="virgule"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	const cible = await colonneCibleIndex(page);
	await remplirTableau(page);
	await cliquerCaseColonne(page, cible);
	await clicVirgule(page);
	await expect(page.locator('#tcVerif')).toBeEnabled();
	await page.locator('#tcVerif').click();

	const n = await page.locator('.tc-cell').count();
	for (let i = 0; i < n; i++) {
		await expect(page.locator(`.tc-cell[data-i="${i}"]`)).toHaveClass(/correct/);
	}
	await expect(page.locator(`.tc-fente[data-apres="${cible}"]`)).toHaveClass(/tc-fente--juste/);
	expect(await contenuPseudo(page, `.tc-fente[data-apres="${cible}"]`, '::before')).toBe('"✓"');
	await expect(page.locator('#tcFeedback')).toContainText('Bravo');

	expect(errors).toEqual([]);
});

/* « Je ne sais pas, montre-moi » en mode virgule (#711 lot 4, #467). `passer()` appelle
   `marquerVirgule(ex, null)` : elle RÉVÈLE l'emplacement attendu SANS JUGER celui que
   l'enfant a posé. Le `null` est le contrat : le remplacer par un booléen ferait apparaître
   une pastille ✓/✗ sur une réponse que l'enfant n'a pas soumise (ni ✗ à tort, ni ✓ qui
   aurait l'air d'un succès sur une question passée). */
test('mes-longueurs (virgule, #711) : « Je ne sais pas » révèle la virgule attendue sans juger celle qui est posée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="virgule"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	const cible = await colonneCibleIndex(page);
	const fausse = cible > 0 ? cible - 1 : cible + 1;
	await cliquerCaseColonne(page, fausse);
	await clicVirgule(page);
	await expect(page.locator(`.tc-fente[data-apres="${fausse}"]`)).toHaveClass(/tc-fente--posee/);

	await page.locator('#leconPasser').click();

	// Réponse révélée en texte, comme sur les autres chemins.
	await expect(page.locator('.lecon-reveal-rep')).not.toBeEmpty();
	// L'emplacement attendu est montré, et son repère est réellement rendu.
	await expect(page.locator('.tc-fente--attendue')).toHaveCount(1);
	await expect(page.locator(`.tc-fente[data-apres="${cible}"]`)).toHaveClass(/tc-fente--attendue/);
	expect(await contenuPseudo(page, `.tc-fente[data-apres="${cible}"]`, '::before')).not.toBe(
		'none',
	);
	// Aucun verdict : ni juste ni faux, nulle part.
	await expect(page.locator('.tc-fente--juste')).toHaveCount(0);
	await expect(page.locator('.tc-fente--fausse')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Clavier physique : `,` pose la virgule, `.` la bascule (pavé numérique : le séparateur
   décimal y est un point). Garde explicite du runner : la frappe n'est prise que si le focus est
   dans le widget (case ou pavé), pour ne pas voler les touches au reste de la page.
   NON TESTÉ : `!e.repeat` (touche maintenue) — un `keyboard.down` répété n'est pas simulable de
   façon fiable, un test instable serait pire que l'absence de test. */
test('mes-longueurs (virgule, #711) : les touches « , » et « . » posent puis retirent la virgule, seulement si le focus est dans le tableau', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="virgule"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	const table = page.locator('#tcTable');
	const a = await colonneCibleIndex(page);
	await cliquerCaseColonne(page, a); // focus dans la case
	await page.keyboard.press(',');
	await expect(table).toHaveClass(/tc-table--virgule-posee/);
	await expect(page.locator(`.tc-fente[data-apres="${a}"]`)).toHaveClass(/tc-fente--posee/);
	expect(await casesAvecVirgule(page)).toEqual([await derniereCaseIndex(page, a)]);

	// Le point, au même endroit : seconde pression = retrait.
	await page.keyboard.press('.');
	await expect(table).not.toHaveClass(/tc-table--virgule-posee/);
	expect(await casesAvecVirgule(page)).toEqual([]);

	// Garde de focus : focus HORS du widget → la touche ne fait rien. Mutation : retirer la
	// garde `focus.closest('.tc-cell, .tc-pave')` de keyHandler (lecon-tableau.ts).
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	expect(
		await page.evaluate(() => document.activeElement?.closest('.tc-cell, .tc-pave')),
	).toBeNull();
	await page.keyboard.press(',');
	await expect(table).not.toHaveClass(/tc-table--virgule-posee/);
	expect(await casesAvecVirgule(page)).toEqual([]);

	expect(errors).toEqual([]);
});

/* Reprise (#498) : le mode se reprend comme les autres runners. La virgule posée sur la
   question interrompue ne doit PAS être reportée : le rendu la remet à zéro. On recharge la
   page (`reload`, pas `goto` : gate e2e-navigation) depuis l'accueil pour rejouer à froid le
   registre des runners. */
test('mes-longueurs (virgule, #711) : reprise d’une session interrompue — mêmes question et pavé virgule, virgule non reportée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="virgule"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	// Question 1 répondue puis on enchaîne : la reprise n'existe qu'à idx ≥ 1.
	const cible1 = await colonneCibleIndex(page);
	await remplirTableau(page);
	await cliquerCaseColonne(page, cible1);
	await clicVirgule(page);
	await page.locator('#tcVerif').click();
	await page.locator('#tcActions button').click();

	// Question 2 en cours, virgule posée (à ne PAS retrouver après reprise).
	await expect(page.locator('#tcVerif')).toBeDisabled();
	const enonceAvant = (await page.locator('.tc-enonce').innerText()).trim();
	const progressAvant = await page.locator('.lqcm-progress-lab').textContent();
	await cliquerCaseColonne(page, await colonneCibleIndex(page));
	await clicVirgule(page);
	await expect(page.locator('#tcTable')).toHaveClass(/tc-table--virgule-posee/);

	await page.locator('#toolbarBurger').click();
	await page.locator('#btnHome').click();
	await expect(page.locator('#home')).toBeVisible();
	await page.reload({ waitUntil: 'networkidle' });

	const carte = page.locator('.reprise-card[data-key="lecon-mes-longueurs"]');
	await expect(carte).toBeVisible();
	await carte.locator('.reprise-continue').click();

	await expect(page.locator('#tcTable')).toBeVisible();
	await expect(page.locator('.lqcm-progress-lab')).toHaveText(progressAvant!);
	expect((await page.locator('.tc-enonce').innerText()).trim()).toBe(enonceAvant);
	// Le mode a bien été repris AVEC sa virgule à placer : bouton du pavé et emplacements.
	await expect(page.locator('.tc-pave-btn[data-pave="virgule"]')).toBeVisible();
	await expect(page.locator('.tc-fente')).toHaveCount(await page.locator('.tc-col').count());
	// Rien n'est reporté de la question quittée.
	await expect(page.locator('#tcTable')).not.toHaveClass(/tc-table--virgule-posee/);
	expect(await casesAvecVirgule(page)).toEqual([]);
	await expect(page.locator('#tcVerif')).toBeDisabled();

	expect(errors).toEqual([]);
});
