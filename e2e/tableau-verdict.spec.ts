/* ============================================================
   Lot 5 (#711) : ce que le tableau de conversion EXIGE, et ce qu'il tolère.
   Critères 33, 36, 37 et 38 de l'issue (30-32, 34-35 et 39 sont de la logique pure, tenus par
   `tests/tableau-verdict.test.ts` ; ici on ne joue que ce qui se voit dans le navigateur).

   Le critère 19 du lot 4 (« Vérifier reste gris tant qu'une case est vide ») a été RENVERSÉ par
   le mainteneur, commentaire daté du 30/09/2026 sur l'issue : seules les cases de la zone de la
   question sont exigées, et « Vérifier » est actif dès l'apparition.

   Méthode : la zone obligatoire n'est JAMAIS recalculée ici (ce serait recopier le module que
   ces tests jugent). On la lit à travers ses effets : une case vide qui reçoit ✗ est exigée,
   une case vide qui ne reçoit rien ne l'est pas. Les cases écrites par le test sont choisies
   pour être exigées ou non par CONSTRUCTION (la première case au chiffre non nul ouvre
   toujours la zone), pas par tirage.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
});

test.setTimeout(90_000);

interface Colonne {
	sym: string;
	chiffres: string; // chiffres ATTENDUS de la colonne (data-answer), dans l'ordre
}
interface Cellule {
	i: number;
	answer: string;
}
interface Question {
	enonce: string;
	colonnes: Colonne[];
	cellules: Cellule[];
	iDonnee: number;
	iDemandee: number;
	/** Colonne du premier chiffre non nul : là commence la donnée. */
	iPremier: number;
}

/* L'unité DEMANDÉE suit le trou « ? » ; la DONNÉE est l'autre unité de l'énoncé (dérivées de
   l'énoncé affiché, jamais du générateur : le tirage est aléatoire). */
async function lireQuestion(page: Page): Promise<Question> {
	const brut = await page.evaluate(() => ({
		enonce: (document.querySelector('.tc-enonce') as HTMLElement).innerText,
		colonnes: [...document.querySelectorAll('.tc-col')].map((col) => ({
			sym: (col.querySelector('.tc-sym')?.textContent ?? '').trim(),
			cases: [...col.querySelectorAll<HTMLElement>('.tc-cell')].map((c) => ({
				i: Number(c.dataset.i),
				answer: c.dataset.answer ?? '',
			})),
		})),
	}));
	const m = brut.enonce.match(/\?\s*([^\s0-9=,.]+)/);
	if (!m) throw new Error(`Énoncé illisible : « ${brut.enonce} »`);
	const syms = brut.colonnes.map((c) => c.sym);
	const iDemandee = syms.indexOf(m[1]);
	const jetons = brut.enonce.split(/\s+/);
	const posTrou = jetons.findIndex((j) => j.includes('?'));
	const jetonDonne = jetons.find((j, k) => k !== posTrou + 1 && syms.includes(j));
	const iDonnee = syms.indexOf(jetonDonne ?? '');
	if (iDemandee < 0 || iDonnee < 0) {
		throw new Error(`Unités introuvables dans « ${brut.enonce} »`);
	}
	const colonnes = brut.colonnes.map((c) => ({
		sym: c.sym,
		chiffres: c.cases.map((x) => x.answer).join(''),
	}));
	return {
		enonce: brut.enonce,
		colonnes,
		cellules: brut.colonnes.flatMap((c) => c.cases),
		iDonnee,
		iDemandee,
		iPremier: colonnes.findIndex((c) => /[1-9]/.test(c.chiffres)),
	};
}

const progression = (page: Page): Promise<string> => page.locator('.lqcm-progress-lab').innerText();

async function ouvrir(page: Page): Promise<void> {
	// Fin d'une série précédente : célébration et montée de niveau restent au-dessus de tout.
	for (const ok of ['#celebrateOk', '#levelupOk']) {
		const bouton = page.locator(ok);
		if (await bouton.isVisible()) await bouton.click();
	}
	await gotoHash(page, 'mode-mes-longueurs');
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();
}

/* Écrit `chiffre` dans la case `i` : on l'active d'un clic, puis le pavé. */
async function ecrire(page: Page, i: number, chiffre: string): Promise<void> {
	await page.locator(`.tc-cell[data-i="${i}"]`).click();
	await page.locator(`.tc-pave-btn[data-chiffre="${chiffre}"]`).click();
}

/* Passe à la question suivante ; le compteur de progression avance d'un cran, signal qui ne se
   satisfait pas par hasard (« Vérifier » ne dit plus rien : il est toujours actif). */
async function continuer(page: Page): Promise<void> {
	const avant = await progression(page);
	await page.locator('#tcActions button').click();
	await expect(page.locator('.lqcm-progress-lab')).not.toHaveText(avant);
}

/* Répond JUSTE à toute la question, en clics DOM (un seul aller-retour : la recherche d'une
   question rejoue jusqu'à une dizaine de questions), puis passe à la suivante. */
async function repondreJusteEtContinuer(page: Page): Promise<void> {
	await page.evaluate(() => {
		document.querySelectorAll<HTMLElement>('.tc-cell').forEach((c) => {
			document
				.querySelector<HTMLElement>(`.tc-pave-btn[data-chiffre="${c.dataset.answer}"]`)
				?.click();
		});
		document.querySelector<HTMLElement>('#tcVerif')?.click();
	});
	await continuer(page);
}

/* Contenu CALCULÉ du pseudo-élément ::after d'une case (la pastille ✓/✗) : vérifier la classe
   ne suffit pas, le lot 4 a déjà été pris en défaut par une classe posée pendant que le CSS
   annulait la marque. */
const pastille = (page: Page, i: number): Promise<string> =>
	page.locator(`.tc-cell[data-i="${i}"]`).evaluate((el) => getComputedStyle(el, '::after').content);

/* Première case au chiffre non nul : elle ouvre la zone obligatoire PAR DÉFINITION, donc la
   remplir juste donne un ✓ et ne peut pas être « hors zone ». */
const premiereCaseNonNulle = (q: Question): Cellule => {
	const c = q.cellules.find((x) => x.answer !== '0');
	if (!c) throw new Error(`Aucun chiffre non nul dans « ${q.enonce} »`);
	return c;
};

/* Cherche, sur des séries fraîches, une conversion de la petite vers la grande unité
   (« 60 mm = ? cm », « 300 cm = ? m »). Elle est tirée une fois sur deux, et sa donnée
   s'écrit TOUJOURS sur au moins deux rangs (un multiple du facteur : un chiffre, puis des
   zéros) : c'est le cas qui porte la phrase du critère 38. Le sens inverse (« 3 km = ? m »)
   tient sur un seul rang et n'en produit aucune, à dessein. */
async function chercherPetiteVersGrande(page: Page): Promise<Question> {
	for (let serie = 0; serie < 3; serie++) {
		await ouvrir(page);
		for (let k = 0; k < 9; k++) {
			const q = await lireQuestion(page);
			if (q.iDonnee > q.iDemandee) return q;
			await repondreJusteEtContinuer(page);
		}
	}
	throw new Error('Aucune conversion petite → grande tirée en 3 séries de 9 questions');
}

/* ------------------------------------------------------------------ */

test('mes-longueurs (#711 critère 33) : « Vérifier » est actif dès l’apparition de la question, et le reste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page);
	const verif = page.locator('#tcVerif');

	// À l'apparition, avant tout geste.
	await expect(verif).toBeEnabled();
	// Une case écrite, puis tout le tableau : il ne se grise à aucun moment.
	const q = await lireQuestion(page);
	await ecrire(page, premiereCaseNonNulle(q).i, premiereCaseNonNulle(q).answer);
	await expect(verif).toBeEnabled();
	for (const c of q.cellules) await ecrire(page, c.i, c.answer);
	await expect(verif).toBeEnabled();
	await verif.click();
	await continuer(page);

	// Question suivante : actif dès l'apparition, et cliquer sur un tableau VIDE corrige (le
	// bouton actif n'est pas décoratif : le retour arrive, avec la bonne réponse).
	await expect(verif).toBeEnabled();
	await verif.click();
	await expect(page.locator('#tcFeedback')).toContainText('La bonne réponse');
	expect(errors).toEqual([]);
});

test('mes-longueurs (#711 critère 36) : chaque case porte le verdict de ce que l’enfant a ÉCRIT, une case vide hors zone ne reçoit ni ✓ ni ✗', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page);
	const q = await lireQuestion(page);

	// A : juste, et exigée par construction. B : fausse, écrite hors de toute logique de zone
	// (une case écrite fausse reçoit ✗ où qu'elle soit). Le reste du tableau reste vide.
	const A = premiereCaseNonNulle(q);
	const B = q.cellules[0].i !== A.i ? q.cellules[0] : q.cellules[q.cellules.length - 1];
	await ecrire(page, A.i, A.answer);
	await ecrire(page, B.i, String((Number(B.answer) + 1) % 10));
	await page.locator('#tcVerif').click();
	await expect(page.locator('#tcFeedback')).toContainText('La bonne réponse');

	// Case remplie juste : ✓ rendu. Case remplie fausse : ✗ rendu.
	await expect(page.locator(`.tc-cell[data-i="${A.i}"]`)).toHaveClass(/correct/);
	expect(await pastille(page, A.i)).toBe('"✓"');
	await expect(page.locator(`.tc-cell[data-i="${B.i}"]`)).toHaveClass(/wrong/);
	expect(await pastille(page, B.i)).toBe('"✗"');

	// Cases vides : deux populations, et les deux doivent exister (sept colonnes, une zone qui
	// n'en couvre jamais plus de quatre, donc des cases hors question ; et la donnée s'étend
	// toujours sur au moins deux rangs ou jusqu'à l'unité demandée, donc des cases exigées).
	const vides = q.cellules.filter((c) => c.i !== A.i && c.i !== B.i);
	const exigees: Cellule[] = [];
	const neutres: Cellule[] = [];
	for (const c of vides) {
		const cible = page.locator(`.tc-cell[data-i="${c.i}"]`);
		const faux = (await cible.getAttribute('class'))?.includes('wrong') ?? false;
		(faux ? exigees : neutres).push(c);
		// Le point de l'issue : JAMAIS un ✓ sur une case restée vide.
		await expect(cible).not.toHaveClass(/correct/);
		expect(await pastille(page, c.i), `case ${c.i} vide : pastille ✓ affichée`).not.toBe('"✓"');
		await expect(cible).toHaveText('');
	}
	expect(exigees.length, 'aucune case vide exigée : le tableau ne demande rien ?').toBeGreaterThan(
		0,
	);
	expect(
		neutres.length,
		'aucune case vide neutre : toutes les cases sont exigées ?',
	).toBeGreaterThan(0);

	// Case vide exigée : ✗ rendu, et sa valeur attendue dite (nom accessible : la case reste vide).
	for (const c of exigees) {
		const cible = page.locator(`.tc-cell[data-i="${c.i}"]`);
		expect(await pastille(page, c.i)).toBe('"✗"');
		await expect(cible).toHaveAttribute('aria-invalid', 'true');
		await expect(cible).toHaveAttribute('aria-label', new RegExp(`attendu ${c.answer}$`));
	}
	// Case vide hors zone : ni ✓ ni ✗, ni classe, ni marque exposée aux lecteurs d'écran.
	for (const c of neutres) {
		const cible = page.locator(`.tc-cell[data-i="${c.i}"]`);
		await expect(cible).not.toHaveClass(/wrong/);
		expect(await pastille(page, c.i), `case ${c.i} hors zone : pastille affichée`).not.toBe('"✗"');
		await expect(cible).not.toHaveAttribute('aria-invalid', /.*/);
		await expect(cible).not.toHaveAttribute('aria-label', /incorrect|correct/);
	}
	expect(errors).toEqual([]);
});

test('mes-longueurs (#711 critère 37) : une vérification anticipée clôt la question, plus de saisie possible', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page);
	const q = await lireQuestion(page);
	const A = premiereCaseNonNulle(q);
	await ecrire(page, A.i, A.answer);
	// Vérification ANTICIPÉE : une seule case écrite sur le tableau.
	await page.locator('#tcVerif').click();
	await expect(page.locator('#tcFeedback')).toContainText('La bonne réponse');

	const photo = () =>
		page
			.locator('.tc-cell')
			.evaluateAll((els) => els.map((e) => `${e.className}|${e.textContent}`));
	const avant = await photo();

	// Toutes les voies de saisie : pavé, clic sur une case, clavier physique.
	await page.evaluate(() => {
		document.querySelector<HTMLElement>('.tc-pave-btn[data-chiffre="7"]')?.click();
		document.querySelector<HTMLElement>('.tc-cell:not(.correct):not(.wrong)')?.click();
		document.querySelector<HTMLElement>('.tc-pave-btn[data-chiffre="7"]')?.click();
	});
	await page.keyboard.press('7');
	await page.keyboard.press('Backspace');
	expect(await photo(), 'une saisie a modifié le tableau après le verdict').toEqual(avant);

	// « Vérifier » a disparu au profit de la suite.
	await expect(page.locator('#tcVerif')).toBeHidden();
	await continuer(page);
	expect(errors).toEqual([]);
});

/* Les deux tests suivants portent le critère 38. La chaîne « Ici, » n'est PAS asserée : la
   tournure appartient au pedagogue-primaire. Ce qui est exigé, c'est que le retour dise
   l'ÉCRITURE de la donnée, colonne par colonne (« 6 en cm », « 0 en mm »). */
test('mes-longueurs (#711 critère 38) : quand la seule erreur est une case vide exigée, le retour nomme l’écriture de la donnée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const q = await chercherPetiteVersGrande(page);
	const A = premiereCaseNonNulle(q);
	await ecrire(page, A.i, A.answer); // tout ce qui est écrit est juste ; il manque le reste
	await page.locator('#tcVerif').click();
	await expect(page.locator('#tcFeedback')).toContainText('La bonne réponse');

	const retour = ((await page.locator('#tcFeedback').innerText()) ?? '').replace(/\s+/g, ' ');
	// La donnée occupe les colonnes du premier chiffre non nul jusqu'à l'unité donnée.
	const rangs = q.colonnes.slice(q.iPremier, q.iDonnee + 1);
	expect(rangs.length, 'la donnée devrait tenir sur au moins deux rangs').toBeGreaterThan(1);
	for (const r of rangs) {
		expect(
			retour,
			`« ${q.enonce} » : le retour ne dit pas « ${r.chiffres} en ${r.sym} »`,
		).toContain(`${r.chiffres} en ${r.sym}`);
	}
	// Le nombre de la donnée est cité tel que l'énoncé l'écrit (espaces de milliers ignorés).
	const nombre = rangs
		.map((r) => r.chiffres)
		.join('')
		.replace(/^0+/, '');
	const donnee = `${nombre}${q.colonnes[q.iDonnee].sym}`;
	expect(q.enonce.replace(/\s+/g, '')).toContain(donnee);
	expect(retour.replace(/\s+/g, '')).toContain(donnee);
	expect(errors).toEqual([]);
});

test('mes-longueurs (#711 critère 38, négatif) : avec en plus un chiffre faux, le retour ne nomme pas l’écriture', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const q = await chercherPetiteVersGrande(page);
	const A = premiereCaseNonNulle(q);
	const derniere = q.cellules[q.cellules.length - 1];
	await ecrire(page, A.i, A.answer);
	await ecrire(page, derniere.i, String((Number(derniere.answer) + 1) % 10)); // un vrai chiffre faux
	await page.locator('#tcVerif').click();
	await expect(page.locator('#tcFeedback')).toContainText('La bonne réponse');

	const retour = await page.locator('#tcFeedback').innerText();
	// Le motif « chiffre en unité » est celui de la phrase du critère 38 : absent ici, sans
	// quoi le test précédent ne prouverait rien (il exige ce même motif).
	expect(retour).not.toMatch(/\b\d+ en (km|hm|dam|m|dm|cm|mm)\b/);
	expect(errors).toEqual([]);
});
