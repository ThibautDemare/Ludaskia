/* ============================================================
   Étayage de la NOTION (#490) — smoke tests.
   Pilote : le calcul posé — les trois seules leçons du catalogue à porter un
   contenu d'étayage à ce stade ; on en exerce deux (addition, et soustraction
   pour son prérequis). On ne teste PAS le libellé des phrases (Vitest, et ça bougera),
   seulement la MÉCANIQUE : ouverture par chacun des points d'entrée, remplissage
   pas à pas de la grille de démonstration, mise de côté du prérequis, mémoire
   de l'avant-série, et un minimum d'accessibilité (Échap + focus).
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Nombre de cellules de RÉSULTAT (`.posee-input`) déjà écrites dans le panneau ouvert.
   Une seule par pas, alors que la case de retenue n'existe pas à chaque colonne : c'est
   donc le compteur robuste, indépendant de l'opération tirée au hasard. Les deux sortes de
   cases portent un `data-cible` (le sélecteur stable des démonstrations, cf.
   `ui/etayage-visuels.ts`) — les compter ensemble rendrait CE test dépendant du nombre de
   retenues tirées, ce qu'il ne cherche pas à vérifier. */
async function cellesRemplies(page: Page): Promise<number> {
	return page
		.locator('#etayageOverlay .posee-input[data-cible]')
		.evaluateAll((els) => els.filter((el) => (el.textContent ?? '').trim() !== '').length);
}

/* Lit « Étape i sur n » dans le compteur du panneau. */
async function etape(page: Page): Promise<{ i: number; n: number }> {
	const txt = (await page.locator('#etayCompteur').textContent()) ?? '';
	const m = txt.match(/Étape (\d+) sur (\d+)/);
	if (!m) throw new Error(`Compteur d'étapes illisible : "${txt}"`);
	return { i: Number(m[1]), n: Number(m[2]) };
}

/* Verrou anti-régression (cf. #490) : « Suivant ▶ » doit rester ATTEIGNABLE quelle que
   soit la hauteur du contenu — un panneau qui grandit avec la donnée (multiplication à
   2 chiffres + son renvoi au prérequis) ne doit jamais pousser sa navigation sous le pli
   SANS RECOURS, la page étant verrouillée (`lockBackground`) tant que la modale est
   ouverte. `scrollIntoViewIfNeeded` fait défiler le panneau lui-même s'il est bien un
   conteneur de scroll (`.etay-modal { max-height / overflow-y: auto }`) ; sans ce
   défilement, le bouton resterait hors du viewport et l'assertion suivante le prouverait. */
async function suivantAtteignable(page: Page): Promise<void> {
	const suivant = page.locator('#etaySuivant');
	await suivant.scrollIntoViewIfNeeded();
	const box = await suivant.boundingBox();
	const viewport = page.viewportSize();
	expect(box, '#etaySuivant introuvable/masqué').not.toBeNull();
	expect(viewport).not.toBeNull();
	expect(box!.y, '#etaySuivant dépasse par le haut du viewport').toBeGreaterThanOrEqual(0);
	expect(
		box!.y + box!.height,
		'#etaySuivant dépasse par le bas du viewport (sous le pli, inatteignable)',
	).toBeLessThanOrEqual(viewport!.height);
}

/* ================================================================
   1. Chemin principal : lien proposé après une grille ratée, panneau sur
      L'OPÉRATION RATÉE, déroulé pas à pas, sortie.
   ================================================================ */

test('addition posée : lien « Comprendre la méthode » sous la grille ratée, pas sous une grille juste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-addition-posee');
	const grilles = page.locator('.posee');
	const n = await grilles.count();
	expect(n).toBeGreaterThan(1); // il faut au moins une grille ratée ET une grille juste

	// Toutes les grilles remplies JUSTE avec leur data-answer…
	for (let g = 0; g < n; g++) {
		const cells = grilles.nth(g).locator('.posee-input');
		const c = await cells.count();
		for (let i = 0; i < c; i++) {
			const cell = cells.nth(i);
			await cell.fill((await cell.getAttribute('data-answer')) ?? '');
		}
	}
	// …sauf la toute première cellule de la 1re grille, faussée volontairement.
	const premiereCellule = grilles.first().locator('.posee-input').first();
	const bonne = Number((await premiereCellule.getAttribute('data-answer')) ?? '0');
	await premiereCellule.fill(String((bonne + 1) % 10));

	await page.locator('#btnVerify').click();
	// Un quasi-sans-faute peut déclencher la modale de niveau (puis célébration) :
	// la fermer avant d'aller plus loin, sinon elle intercepte les clics (#484-like).
	for (const ok of ['#levelupOk', '#celebrateOk']) {
		const btn = page.locator(ok);
		if (await btn.isVisible().catch(() => false)) await btn.click();
	}

	// Le lien n'apparaît qu'après la grille ratée, jamais après une grille juste.
	await expect(page.locator('.etay-lien-posee')).toHaveCount(1);
	await expect(page.locator('.posee:has(.posee-input.wrong) + .etay-lien-posee')).toHaveCount(1);
	await expect(page.locator('.posee:not(:has(.posee-input.wrong)) + .etay-lien-posee')).toHaveCount(
		0,
	);

	// L'opération de la grille ratée (attributs posés par poseeGrilleHTML), pour
	// vérifier ensuite que le panneau s'ouvre bien SUR CELLE-LÀ.
	const grilleRatee = page.locator('.posee:has(.posee-input.wrong)');
	const a = await grilleRatee.getAttribute('data-pose-a');
	const b = await grilleRatee.getAttribute('data-pose-b');

	await page.locator('.etay-lien-posee button').click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	// Le titre EST l'opération ratée (addition : signe '+' sans ambiguïté typographique).
	await expect(page.locator('#etayTitle')).toHaveText(`${a} + ${b}`);

	// 1er pas : une seule cellule-cible écrite, compteur à « Étape 1 sur n ».
	expect(await cellesRemplies(page)).toBe(1);
	let e = await etape(page);
	expect(e.i).toBe(1);

	// La grille de démonstration se remplit strictement à chaque pas, le compteur avance.
	let rempli = 1;
	for (let pas = 1; pas < e.n; pas++) {
		await page.locator('#etaySuivant').click();
		const now = await cellesRemplies(page);
		expect(now).toBeGreaterThan(rempli);
		rempli = now;
		e = await etape(page);
		expect(e.i).toBe(pas + 1);
	}

	// Dernier pas : le bouton devient la sortie, et il ferme le panneau.
	await expect(page.locator('#etaySuivant')).toHaveText("D'accord, à moi de jouer !");
	await page.locator('#etaySuivant').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   2. Bouton persistant de l'en-tête : ouvre le même panneau, sans erreur.
   ================================================================ */

test('addition posée : le bouton persistant de l’en-tête ouvre le panneau sur l’exemple de la leçon', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-addition-posee');
	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();

	await btn.click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	// Sans erreur préalable : exemple canonique de la leçon (data/maths/posee.ts).
	await expect(page.locator('#etayTitle')).toHaveText('347 + 285');

	await page.locator('.aide-close').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   3. Exemple d'avant-série : ouverture AUTOMATIQUE sur un report échu,
      fermeture d'un geste, jamais deux fois pour le même épisode.
   ================================================================ */

/* État de report ÉCHU (`reprendreLe` déjà passé) avec moins de blocages que
   BLOCAGES_SIGNAL_ADULTE (3) : c'est la condition de `episodeEtayable`
   (core/etayage.ts). Namespacé comme dans lecon-du-jour.spec.ts. */
const SEED_REPORT_ECHU = `(() => {
	const now = Date.now();
	const day = 24 * 60 * 60 * 1000;
	const reports = { 'calc-addition-posee@ce2': {
		jours: 2, dernierJour: '', reporteLe: now - 3 * day,
		reprendreLe: now - 1000, meilleurPct: 40,
	} };
	localStorage.setItem('e2e/ludaskia_leconReport', JSON.stringify(reports));
})();`;

test('addition posée : l’exemple d’avant-série s’ouvre seul sur un report échu, et ne revient pas au lancement suivant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_REPORT_ECHU);
	await gotoHash(page, 'lecon-calc-addition-posee');

	// Ouverture AUTOMATIQUE, sans le moindre clic.
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	await expect(page.locator('.mascotte-bulle')).toHaveText('Un petit rappel avant de commencer.');
	// Offre de partir tout de suite (jamais un péage) : bouton dédié.
	await expect(page.locator('#etayFiler')).toBeVisible();

	// Le panneau s'écarte d'un geste.
	await page.locator('#etayFiler').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	// Relancer la leçon (nouvelle navigation) ne redonne PAS l'exemple : l'épisode
	// est déjà marqué vu (ludaskia_etayageVu), le bouton persistant reste, lui.
	await gotoHash(page, 'lecon-calc-addition-posee');
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);
	await expect(page.locator('.etayage-btn')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ================================================================
   4. Leçon d'avant : la mettre de côté l'ajoute à la file « à revoir »
      du profil, remplace le bouton par une confirmation, sans fermer
      le panneau. (calc-soustraction-posee a un prérequis : la 1re leçon
      de la catégorie, calc-addition-posee, n'en a pas.)
   ================================================================ */

test('soustraction posée : mettre la leçon d’avant de côté l’ajoute à « à revoir » sans fermer le panneau', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-soustraction-posee');
	await page.locator('.etayage-btn').click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();

	const epingler = page.locator('#etayEpingler');
	await expect(epingler).toBeVisible();
	await expect(page.locator('.etay-prerequis-txt')).toContainText("L'addition posée");

	await epingler.click();

	// Confirmation à la place du bouton, panneau toujours ouvert.
	await expect(page.locator('#etayEpingler')).toHaveCount(0);
	await expect(page.locator('.etay-prerequis-ok')).toBeVisible();
	await expect(page.locator('#etayageOverlay')).toBeVisible();

	// La file « à revoir » du profil (clé préfixée) porte bien la leçon prérequise.
	const revoir = await page.evaluate(() => localStorage.getItem('e2e/ludaskia_revoir'));
	expect(JSON.parse(revoir ?? '[]')).toContain('calc-addition-posee');

	expect(errors).toEqual([]);
});

/* ================================================================
   5. Accessibilité minimale : Échap ferme le panneau, le focus revient
      au bouton qui l'a ouvert.
   ================================================================ */

test('addition posée : Échap ferme le panneau et rend le focus au bouton persistant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-addition-posee');
	await page.locator('.etayage-btn').click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);
	await expect(page.locator('.etayage-btn')).toBeFocused();

	expect(errors).toEqual([]);
});

/* ================================================================
   6. Révision (#467/#490) : le lien au verdict d'une ERREUR (#revEtayage,
      posé par verdictHTML/wireRevNext), et « Je ne sais pas, montre-moi »
      (#revGiveUp) qui ouvre le panneau AVANT le verdict neutre — le seul
      point d'entrée où le panneau précède la réponse.

   Amorçage : une entrée `ludaskia_lessonRevision` due (même pattern que
   `seedDueLesson` dans aide-exercice.spec.ts) pour que la révision serve
   à coup sûr un item `calc-addition-posee` (grille posée, renderPosed).
   ================================================================ */

/* Rend UNE leçon « due » dès maintenant pour le profil e2e (préfixe 'e2e/'),
   clé NON namespacée : `scopeActif` retombe alors sur NIVEAU_LEGACY = 'ce2',
   qui est le niveau du profil e2e amorcé par gotoHash. */
function seedDueLesson(lessonId: string): string {
	return `localStorage.setItem('e2e/ludaskia_lessonRevision', JSON.stringify({
    ${JSON.stringify(lessonId)}: { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }
  }));`;
}

test('révision : lien « Comprendre la méthode » au verdict d’une addition posée ratée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('calc-addition-posee'));
	await gotoHash(page, 'revision-espacee');

	const cells = page.locator('.posee-input');
	await cells.first().waitFor();
	// Opération de la grille jouée (mêmes attributs data-pose-* qu'en leçon), pour
	// vérifier ensuite que le panneau s'ouvre sur CETTE opération-là.
	const grille = page.locator('.posee').first();
	const a = await grille.getAttribute('data-pose-a');
	const b = await grille.getAttribute('data-pose-b');

	// Toutes les cellules faussées volontairement → verdict raté garanti.
	const n = await cells.count();
	for (let i = 0; i < n; i++) {
		const cell = cells.nth(i);
		const bonne = Number((await cell.getAttribute('data-answer')) ?? '0');
		await cell.fill(String((bonne + 1) % 10));
	}
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ko')).toBeVisible();

	const lien = page.locator('#revEtayage');
	await expect(lien).toBeVisible();
	await lien.click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	await expect(page.locator('#etayTitle')).toHaveText(`${a} + ${b}`);

	await page.locator('.aide-close').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);
	// Le verdict (déjà affiché avant l'ouverture) reste en place, panneau fermé.
	await expect(page.locator('.rev-feedback.ko')).toBeVisible();

	expect(errors).toEqual([]);
});

test('révision : « Je ne sais pas, montre-moi » ouvre le panneau AVANT le verdict', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('calc-addition-posee'));
	await gotoHash(page, 'revision-espacee');
	await page.locator('.posee-input').first().waitFor();

	await page.locator('#revGiveUp').click();
	// Le panneau s'ouvre AVANT tout verdict : la grille jouable est toujours affichée,
	// aucun verdict tant que le panneau reste ouvert.
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	await expect(page.locator('.posee-input').first()).toBeVisible();
	await expect(page.locator('.rev-feedback')).toHaveCount(0);

	await page.locator('.aide-close').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);
	// Le panneau fermé (quelle qu'en soit la façon), le verdict neutre apparaît enfin.
	await expect(page.locator('.rev-feedback.reveal')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ================================================================
   7. Multiplication à 2 chiffres (exemple fixe 47 × 26, seul cas à TROIS
      lignes : deux produits partiels puis leur addition, chapeaux de
      ligne, zéro de décalage fourni, cellules décalées). Ouvert par le
      bouton persistant, déroulé JUSQU'AU BOUT : c'est `pasDe` et
      `grilleDemoHTML` qui sont exercés, pas la narration (Vitest).

   C'est aussi le SEUL cas dont le contenu (grille à 3 lignes + son renvoi
   au prérequis) dépasse la hauteur du viewport mobile par défaut (Pixel 5,
   393×727 : ~934 px de contenu) — le viewport n'est PAS agrandi ici,
   justement pour exercer le défilement propre du panneau (`.etay-modal`,
   cf. src/styles/etayage.scss) à chaque pas, via `suivantAtteignable`.
   ================================================================ */

test('multiplication posée : le déroulé à 2 chiffres (2 produits partiels + somme) va jusqu’à la sortie', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-calc-multiplication-posee');
	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	await expect(page.locator('#etayTitle')).toHaveText('47 × 26');

	// Verrou anti-régression : ce panneau DÉBORDE réellement du viewport mobile par
	// défaut (sinon `suivantAtteignable` ne prouverait rien) et se défile proprement —
	// jamais la page entière, verrouillée tant que la modale est ouverte.
	const modal = page.locator('#etayageOverlay .modal');
	const debordement = await modal.evaluate((el) => ({
		overflowY: getComputedStyle(el).overflowY,
		deborde: el.scrollHeight > el.clientHeight,
	}));
	expect(debordement.overflowY, 'la modale doit défiler (overflow-y: auto)').toBe('auto');
	expect(
		debordement.deborde,
		'ce cas doit réellement déborder du viewport, sinon suivantAtteignable ne teste rien',
	).toBe(true);

	expect(await cellesRemplies(page)).toBe(1);
	let e = await etape(page);
	expect(e.i).toBe(1);
	// 3 lignes (2 produits partiels + la somme) : nettement plus de pas qu'une
	// addition simple, sinon le cas à 3 lignes n'est pas celui qu'on a ouvert.
	expect(e.n).toBeGreaterThan(3);
	await suivantAtteignable(page);

	let rempli = 1;
	for (let pas = 1; pas < e.n; pas++) {
		await page.locator('#etaySuivant').click();
		const now = await cellesRemplies(page);
		expect(now).toBeGreaterThan(rempli);
		rempli = now;
		e = await etape(page);
		expect(e.i).toBe(pas + 1);
		// À CHAQUE pas : la navigation reste atteignable, jamais sous le pli sans recours.
		await suivantAtteignable(page);
	}

	await expect(page.locator('#etaySuivant')).toHaveText("D'accord, à moi de jouer !");
	await page.locator('#etaySuivant').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});
