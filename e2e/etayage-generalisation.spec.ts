/* ============================================================
   Étayage de la NOTION (#490, PR 2) — généralisation à quatre moteurs.
   ------------------------------------------------------------
   La PR 1 (e2e/etayage.spec.ts) a posé le panneau et sa mécanique sur le calcul
   posé, seul moteur du catalogue à l'époque. Cette PR généralise à quatre
   moteurs de plus, chacun avec SON visuel de démonstration :
   - TABLEAU DE CONVERSION (mes-longueurs, mode « tableau ») : colonnes qui se
     remplissent, comme la grille posée ;
   - DROITE GRADUÉE (num-droite-entiers) : figure SVG, un repère qui se pose puis
     un chemin qui se trace — pas une case qui se remplit ;
   - NUMÉRATION (num-valeur-position) : les chiffres du nombre sont DONNÉS dès le
     départ, ce qui avance c'est ce qu'on surligne et ce qu'on masque ;
   - CONJUGAISON (fr-conj-aimer-present) : deux morceaux (radical + terminaison)
     qui s'écrivent à côté du pronom.

   On ne teste PAS le libellé des phrases (Vitest, et ça bougera), seulement la
   MÉCANIQUE : ouverture par les points d'entrée propres à chaque écran, avancée
   du visuel pas à pas, et la nouveauté d'interaction de cette PR — un lien
   « Comprendre la méthode » sous le verdict d'un runner, UNIQUEMENT après une
   erreur, ouvrant la démonstration de CET exercice-là (tableau, droite graduée :
   les deux seuls moteurs ici rendus par un runner dédié qui sait décrire l'item
   raté ; numération et conjugaison montrent leur exemple canonique, structurellement
   incapables de reconstruire l'item — cf. core/etayage-position.ts). Et la
   dégradation : un verbe irrégulier au présent n'a AUCUN contenu d'étayage, donc
   aucun bouton ni lien.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Lit « Étape i sur n » dans le compteur du panneau (même helper qu'etayage.spec.ts). */
async function etape(page: Page): Promise<{ i: number; n: number }> {
	const txt = (await page.locator('#etayCompteur').textContent()) ?? '';
	const m = txt.match(/Étape (\d+) sur (\d+)/);
	if (!m) throw new Error(`Compteur d'étapes illisible : "${txt}"`);
	return { i: Number(m[1]), n: Number(m[2]) };
}

/* Verrou anti-régression (#490) : « Suivant ▶ » doit rester ATTEIGNABLE quelle que soit la
   hauteur du contenu, la modale se défilant elle-même (cf. etayage.spec.ts). Reposé ici sur
   les nouveaux moteurs pour vérifier qu'aucun n'introduit une régression sur ce point. */
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

/* Ferme l'aide auto-affichée si présente (1er lancement du profil) ; no-op sinon. La droite
   graduée n'a pas de clé dans seedAideVueScript (helpers.ts), d'où cette fermeture manuelle
   (même geste que droite-graduee.spec.ts). */
async function fermerAideSiPresente(page: Page): Promise<void> {
	const overlay = page.locator('#aideOverlay');
	if (await overlay.isVisible()) {
		await page.locator('.aide-ok').click();
		await expect(overlay).toHaveCount(0);
	}
}

/* Extrait le libellé de la cible depuis la consigne (« Place le nombre 3,47 sur la droite
   graduée. » → « 3,47 »), identique caractère pour caractère au titre du panneau d'étayage
   (« Placer 3,47 ») — même fonction de formatage des deux côtés. */
async function cibleLabelDepuisConsigne(page: Page): Promise<string> {
	const texte = await page.locator('#dgConsigne').innerText();
	const m = texte.match(/Place le nombre (.+) sur la droite graduée/);
	expect(m).not.toBeNull();
	return m![1];
}

/* ================================================================
   1. Tableau de conversion (mes-longueurs, mode « tableau »).
   ================================================================ */

test('tableau de conversion : le bouton persistant ouvre l’exemple canonique, les colonnes se remplissent pas à pas', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	// Exemple fixe de la leçon (data/maths/mesures.ts) : 3 km = 3 000 m.
	await expect(page.locator('#etayTitle')).toHaveText('3 km = ? m');

	const rempli = () =>
		page
			.locator('#etayVisuel .tc-cell')
			.evaluateAll((els) => els.filter((el) => (el.textContent ?? '').trim() !== '').length);

	// 4 colonnes (km, hm, dam, m) : elles se remplissent une à une, sauf le dernier pas
	// (relecture) qui n'écrit rien de plus.
	const attendus = [1, 2, 3, 4, 4];
	expect(await rempli()).toBe(attendus[0]);
	let e = await etape(page);
	expect(e).toEqual({ i: 1, n: 5 });
	await suivantAtteignable(page);

	for (let i = 1; i < attendus.length; i++) {
		await page.locator('#etaySuivant').click();
		expect(await rempli()).toBe(attendus[i]);
		e = await etape(page);
		expect(e.i).toBe(i + 1);
		await suivantAtteignable(page);
	}

	await expect(page.locator('#etaySuivant')).toHaveText("D'accord, à moi de jouer !");
	await page.locator('#etaySuivant').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('tableau de conversion : le lien « Comprendre la méthode » n’apparaît qu’après une erreur, et ouvre CETTE conversion', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	await gotoHash(page, 'mode-mes-masses');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();

	// Les unités actuellement à l'écran (kg/hg/dag/g, ou l'inverse selon le sens tiré) :
	// c'est la seule chose qu'on peut comparer sans recalculer l'exercice aléatoire.
	const unitesEcran = await page.locator('#tcTable .tc-sym').allTextContents();

	// Toutes les cases justes, sauf la première (fautée volontairement) : verdict raté garanti.
	const cellules = page.locator('#tcTable .tc-cell');
	const n = await cellules.count();
	for (let i = 0; i < n; i++) {
		const cellule = page.locator(`#tcTable .tc-cell[data-i="${i}"]`);
		const bon = await cellule.getAttribute('data-answer');
		const chiffre = i === 0 ? String((Number(bon) + 1) % 10) : (bon ?? '0');
		await page.locator(`.tc-pave-btn[data-chiffre="${chiffre}"]`).click();
	}
	await page.locator('#tcVerif').click();
	await expect(page.locator('#tcFeedback')).toContainText('La bonne réponse était');

	const lien = page.locator('#runEtayage');
	await expect(lien).toBeVisible();
	await lien.click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();

	// Le déroulé porte les MÊMES colonnes (mêmes unités, même ordre) que le tableau raté —
	// jamais un exemple générique d'une autre conversion.
	const unitesDemo = await page.locator('#etayVisuel .tc-sym').allTextContents();
	expect(unitesDemo).toEqual(unitesEcran);

	// La démonstration avance (au moins une case s'écrit dès le 1er pas) et finit par TOUTES
	// les remplir, quel que soit le sens tiré (grand→petit ou petit→grand).
	const rempliDemo = () =>
		page
			.locator('#etayVisuel .tc-cell')
			.evaluateAll((els) => els.filter((el) => (el.textContent ?? '').trim() !== '').length);
	expect(await rempliDemo()).toBeGreaterThan(0);
	let rempli = await rempliDemo();
	let sorti = false;
	for (let garde = 0; garde < 10 && !sorti; garde++) {
		const suivant = page.locator('#etaySuivant');
		if ((await suivant.textContent())?.includes('à moi de jouer')) {
			sorti = true;
			break;
		}
		await suivant.click();
		const now = await rempliDemo();
		expect(now).toBeGreaterThanOrEqual(rempli);
		rempli = now;
	}
	expect(sorti).toBe(true); // la sortie a bien été atteinte (pas de déroulé qui boucle)
	expect(rempli).toBe(unitesEcran.length); // toutes les colonnes finissent remplies

	await page.locator('#etaySuivant').click(); // sortie du panneau
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	// Jamais après une bonne réponse : question suivante, tout juste, aucun lien.
	await page.locator('#tcActions button').click(); // Continuer ▶
	await expect(page.locator('#tcTable')).toBeVisible();
	const cellules2 = page.locator('#tcTable .tc-cell');
	const n2 = await cellules2.count();
	for (let i = 0; i < n2; i++) {
		const cellule = page.locator(`#tcTable .tc-cell[data-i="${i}"]`);
		const bon = await cellule.getAttribute('data-answer');
		await page.locator(`.tc-pave-btn[data-chiffre="${bon}"]`).click();
	}
	await page.locator('#tcVerif').click();
	await expect(page.locator('#tcFeedback')).toContainText('Bravo');
	await expect(page.locator('#runEtayage')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   2. Droite graduée (num-droite-entiers).
   ================================================================ */

test('droite graduée : le bouton persistant ouvre l’exemple canonique, un repère se pose puis un chemin se trace', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-droite-entiers'); // mono-mode → lancement direct
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page);

	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	// Exemple fixe de la leçon (data/maths/droite-graduee.ts) : fenêtre [340;350], cible 347.
	await expect(page.locator('#etayTitle')).toHaveText('Placer 347');

	const cercles = () => page.locator('#etayVisuel svg circle').count();
	const chemin = () => page.locator('#etayVisuel svg line[stroke="var(--accent)"]').count();

	// 1er pas : ce que vaut une graduation, rien encore posé sur l'axe.
	expect(await cercles()).toBe(0);
	await suivantAtteignable(page);

	// 2e pas : le repère de départ est posé.
	await page.locator('#etaySuivant').click();
	expect(await cercles()).toBe(1);
	expect(await chemin()).toBe(0);
	await expect(page.locator('#etaySuivant')).not.toHaveText("D'accord, à moi de jouer !");
	await suivantAtteignable(page);

	// 3e et dernier pas : le repère arrive à la cible, le chemin parcouru se trace.
	await page.locator('#etaySuivant').click();
	expect(await cercles()).toBe(1);
	expect(await chemin()).toBe(1);
	await expect(page.locator('#etaySuivant')).toHaveText("D'accord, à moi de jouer !");
	await suivantAtteignable(page);

	await page.locator('#etaySuivant').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('droite graduée : le lien « Comprendre la méthode » n’apparaît qu’après une erreur, et ouvre LE placement raté', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-droite-entiers');
	await page.locator('.dg-interactif').waitFor();
	await fermerAideSiPresente(page);

	// La graduation d'indice 0 n'est jamais la cible (#256) : choix faux déterministe.
	await page.locator('.dg-hit[data-index="0"]').click();
	await page.locator('#dgVerify').click();
	await expect(page.locator('.lqcm-ko')).toBeVisible();

	const cible = await cibleLabelDepuisConsigne(page);
	const lien = page.locator('#runEtayage');
	await expect(lien).toBeVisible();
	await lien.click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	// Le titre porte LA cible ratée, jamais l'exemple canonique (347) de la leçon.
	await expect(page.locator('#etayTitle')).toHaveText(`Placer ${cible}`);
	await page.locator('.aide-close').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	// Continuer, puis répondre JUSTE : plus aucun lien.
	await page.locator('#dgActions button').click();
	await page.locator('.dg-interactif').waitFor();
	const cible2 = await cibleLabelDepuisConsigne(page);
	await page.locator(`.dg-hit[data-label="${cible2}"]`).click();
	await page.locator('#dgVerify').click();
	await expect(page.locator('.lqcm-ok')).toBeVisible();
	await expect(page.locator('#runEtayage')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   3. Numération (valeur de position) — num-valeur-position : les chiffres du
      nombre sont DONNÉS dès le départ, la démonstration avance en surlignant
      puis en masquant, jamais en écrivant de nouveaux chiffres.
   ================================================================ */

test('numération : le bouton persistant ouvre l’exemple canonique, la démonstration surligne puis masque pas à pas', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-valeur-position'); // mono-mode → fiche directe
	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	// Exemple fixe de la leçon (data/maths/position.ts) : 3472, rang des centaines.
	await expect(page.locator('#etayTitle')).toHaveText('Les centaines de 3472');

	const rangs = () => page.locator('#etayVisuel .etay-rang').count();
	const actifs = () => page.locator('#etayVisuel .etay-rang.etay-actif').count();
	const masques = () => page.locator('#etayVisuel .etay-rang.etay-masque').count();

	// Les 4 chiffres du nombre sont là dès le 1er pas, tous surlignés (« je pose les rangs »).
	expect(await rangs()).toBe(4);
	expect(await actifs()).toBe(4);
	expect(await masques()).toBe(0);
	const e = await etape(page);
	expect(e).toEqual({ i: 1, n: 3 });

	// 2e pas : un seul rang désigné (« le chiffre des centaines »), rien encore masqué.
	await page.locator('#etaySuivant').click();
	expect(await rangs()).toBe(4); // les chiffres restent affichés, ce n'est pas une case vide
	expect(await actifs()).toBe(1);
	expect(await masques()).toBe(0);
	await expect(page.locator('#etaySuivant')).not.toHaveText("D'accord, à moi de jouer !");

	// 3e et dernier pas : ce qu'on cache pour lire « en tout » apparaît enfin.
	await page.locator('#etaySuivant').click();
	expect(await actifs()).toBe(2);
	expect(await masques()).toBe(2);
	await expect(page.locator('#etaySuivant')).toHaveText("D'accord, à moi de jouer !");

	await page.locator('#etaySuivant').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   4. Conjugaison (fr-conj-aimer-present, verbe régulier du 1er groupe) : les
      deux morceaux (radical + terminaison) s'écrivent l'un après l'autre à côté
      du pronom, comme les cellules d'une grille posée.
   ================================================================ */

test('conjugaison (aimer, présent) : le bouton persistant ouvre l’exemple canonique, les deux morceaux s’écrivent pas à pas', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-conj-aimer-present'); // mode par défaut ('saisie') → fiche directe
	const btn = page.locator('.etayage-btn');
	await expect(btn).toBeVisible();
	await btn.click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();
	await expect(page.locator('#etayTitle')).toHaveText('aimer au présent');

	const rempli = () =>
		page
			.locator('#etayVisuel .etay-conj-pronom, #etayVisuel .etay-morceau')
			.evaluateAll((els) => els.filter((el) => (el.textContent ?? '').trim() !== '').length);

	// Pronom, puis radical, puis terminaison ; le dernier pas (assemblage) n'écrit rien
	// de nouveau, il rejoue les deux morceaux déjà posés.
	const attendus = [1, 2, 3, 3];
	expect(await rempli()).toBe(attendus[0]);
	let e = await etape(page);
	expect(e).toEqual({ i: 1, n: 4 });

	for (let i = 1; i < attendus.length; i++) {
		await page.locator('#etaySuivant').click();
		expect(await rempli()).toBe(attendus[i]);
		e = await etape(page);
		expect(e.i).toBe(i + 1);
	}

	await expect(page.locator('#etaySuivant')).toHaveText("D'accord, à moi de jouer !");
	await page.locator('#etaySuivant').click();
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   5. Dégradation : un verbe irrégulier au présent (« aller ») n'a AUCUN contenu
      d'étayage — `derouleConjugaison` refuse d'inventer un découpage. Ni bouton
      persistant, ni lien, ni panneau : la leçon se joue normalement.
   ================================================================ */

test('conjugaison (aller, présent — irrégulier) : aucun bouton ni lien d’étayage, dégradation propre', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-conj-aller-present');
	await page.locator('.ans-text').first().waitFor(); // la fiche se rend normalement
	await expect(page.locator('.etayage-btn')).toHaveCount(0);
	await expect(page.locator('.etay-lien')).toHaveCount(0);
	await expect(page.locator('#etayageOverlay')).toHaveCount(0);

	expect(errors).toEqual([]);
});
