/* ============================================================
   Lot 5 (#711) : le tableau de conversion s'ouvre là où la question se joue.
   Critères 21 à 28 de l'issue (le 29, « aucune autre leçon ne bouge », est décrit en fin
   de fichier : il ne se teste pas honnêtement ici).

   Méthode : on compare des RECTANGLES (colonnes contre cadre `.tc-wrap`), jamais un
   `scrollLeft` figé. Les largeurs de colonnes changent dans ce lot (critère 23) ; ce qui
   ne change pas, c'est la propriété « l'intervalle est dans le cadre ».
   Règle d'or de la spec : la question se lit à l'APPARITION, avant tout geste. Le premier
   clic sur une case déclenche `garderCaseActiveEnVue` et déplacerait le cadre, ce qui
   rendrait un test vert pour une mauvaise raison. On mesure donc AVANT de remplir.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
});

/* Les tests qui cherchent une question précise rejouent plusieurs séries : 30 s ne suffisent pas. */
test.setTimeout(120_000);

/* Profil CM1 : même amorçage que tableau-conversion.spec.ts (le critère 23 distingue CE2 et CM1). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

interface Taille {
	width: number;
	height: number;
}
const PORTRAIT: Taille = { width: 393, height: 851 }; // mesure de référence de l'issue
const PAYSAGE: Taille = { width: 851, height: 393 };
const TRES_ETROIT: Taille = { width: 320, height: 640 }; // critère 25

async function ouvrirTableau(
	page: Page,
	hash: string,
	cm1: boolean,
	taille: Taille,
): Promise<void> {
	await page.setViewportSize(taille);
	// Fin d'une série précédente : célébration et montée de niveau restent ouvertes au-dessus de
	// tout, et un `gotoHash` qui ne change que le hash ne recharge pas la page.
	for (let k = 0; k < 2; k++) {
		for (const ok of ['#celebrateOk', '#levelupOk']) {
			const bouton = page.locator(ok);
			if (await bouton.isVisible()) await bouton.click();
		}
	}
	if (cm1) await page.addInitScript(SEED_CM1);
	await gotoHash(page, hash);
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();
}

interface Colonne {
	sym: string;
	nom: string;
	left: number;
	right: number;
	tronque: boolean;
	lignes: number;
}
interface Releve {
	enonce: string;
	cadreGauche: number;
	cadreDroite: number;
	scrollLeft: number;
	cols: Colonne[];
}
interface Question extends Releve {
	iDonnee: number;
	iDemandee: number;
	lo: number; // colonne la plus à gauche de l'intervalle
	hi: number; // colonne la plus à droite
}

/* Relevé atomique (une seule évaluation : rien ne bouge entre l'énoncé et les rectangles).
   Le cadre est mesuré à l'intérieur de sa bordure (`clientLeft`/`clientWidth`). */
async function releve(page: Page): Promise<Releve> {
	return page.evaluate(() => {
		const wrap = document.querySelector('.tc-wrap') as HTMLElement;
		const w = wrap.getBoundingClientRect();
		const gauche = w.left + wrap.clientLeft;
		const cols = [...document.querySelectorAll('.tc-col')].map((col) => {
			const r = col.getBoundingClientRect();
			const nom = col.querySelector('.tc-nom') as HTMLElement;
			const plage = document.createRange();
			plage.selectNodeContents(nom);
			return {
				sym: (col.querySelector('.tc-sym')?.textContent ?? '').trim(),
				nom: (nom.textContent ?? '').trim(),
				left: r.left,
				right: r.right,
				tronque: nom.scrollWidth > nom.clientWidth + 1,
				lignes: plage.getClientRects().length,
			};
		});
		return {
			enonce: (document.querySelector('.tc-enonce') as HTMLElement).innerText,
			cadreGauche: gauche,
			cadreDroite: gauche + wrap.clientWidth,
			scrollLeft: wrap.scrollLeft,
			cols,
		};
	});
}

/* L'unité DEMANDÉE est celle qui suit le trou « ? » ; la DONNÉE est l'autre unité de
   l'énoncé. Dérivées de l'énoncé affiché, jamais recalculées (le tirage est aléatoire). */
async function analyser(page: Page): Promise<Question> {
	const r = await releve(page);
	const m = r.enonce.match(/\?\s*([^\s0-9=,.]+)/);
	if (!m) throw new Error(`Énoncé illisible : « ${r.enonce} »`);
	const iDemandee = r.cols.findIndex((c) => c.sym === m[1]);
	const jetons = r.enonce.split(/\s+/);
	const posTrou = jetons.findIndex((j) => j.includes('?'));
	const jetonDonne = jetons.find((j, k) => k !== posTrou + 1 && r.cols.some((c) => c.sym === j));
	const iDonnee = r.cols.findIndex((c) => c.sym === jetonDonne);
	if (iDemandee < 0 || iDonnee < 0) {
		throw new Error(
			`Unités introuvables dans « ${r.enonce} » (demandée ${m[1]}, donnée ${jetonDonne})`,
		);
	}
	return {
		...r,
		iDonnee,
		iDemandee,
		lo: Math.min(iDonnee, iDemandee),
		hi: Math.max(iDonnee, iDemandee),
	};
}

const largeurIntervalle = (q: Question): number => q.cols[q.hi].right - q.cols[q.lo].left;
const largeurCadre = (r: Releve): number => r.cadreDroite - r.cadreGauche;

/* Remplit toutes les cases (data-answer) puis valide et passe à la question suivante.
   Appelé APRÈS la mesure. Rend false quand la série est finie. */
async function questionSuivante(page: Page): Promise<boolean> {
	const cellules = page.locator('.tc-cell');
	const n = await cellules.count();
	for (let i = 0; i < n; i++) {
		const chiffre = await page.locator(`.tc-cell[data-i="${i}"]`).getAttribute('data-answer');
		await page.locator(`.tc-pave-btn[data-chiffre="${chiffre}"]`).click();
	}
	await page.locator('#tcVerif').click();
	await page.locator('#tcActions button').click();
	try {
		await expect(page.locator('#tcVerif')).toBeDisabled({ timeout: 3000 });
		return true;
	} catch {
		return false;
	}
}

/* Parcourt jusqu'à `max` questions ; `visite` reçoit la question à l'apparition et rend true
   pour s'arrêter dessus (la page reste alors sur cette question, sans geste). */
async function parcourir(
	page: Page,
	max: number,
	visite: (q: Question) => boolean | Promise<boolean>,
): Promise<Question | null> {
	for (let k = 0; k < max; k++) {
		const q = await analyser(page);
		if (await visite(q)) return q;
		if (!(await questionSuivante(page))) return null;
	}
	return null;
}

/* Cherche, sur plusieurs séries fraîches, une question qui vérifie `accepte`. Le tirage est
   aléatoire : on ne force pas la question, on la cherche. Rend null si rien trouvé. */
async function chercherQuestion(
	page: Page,
	ouvrir: () => Promise<void>,
	accepte: (q: Question) => boolean,
	series = 4,
): Promise<Question | null> {
	for (let s = 0; s < series; s++) {
		await ouvrir();
		const q = await parcourir(page, 12, accepte);
		if (q) return q;
	}
	return null;
}

/* Critères 21 (intervalle entièrement dans le cadre) et 22 (aucun nom d'en-tête tronqué). */
function verifierIntervalle(q: Question): void {
	const g = q.cols[q.lo];
	const d = q.cols[q.hi];
	const ctx = `« ${q.enonce} » (scrollLeft ${q.scrollLeft}, cadre ${q.cadreGauche}→${q.cadreDroite})`;
	expect(
		g.left,
		`${ctx} : la colonne ${g.sym} dépasse à gauche du cadre, l'enfant ne voit pas le début de l'intervalle`,
	).toBeGreaterThanOrEqual(q.cadreGauche - 1);
	expect(
		d.right,
		`${ctx} : la colonne ${d.sym} dépasse à droite du cadre, l'enfant ne voit pas la fin de l'intervalle`,
	).toBeLessThanOrEqual(q.cadreDroite + 1);
	for (let i = q.lo; i <= q.hi; i++) {
		expect(
			q.cols[i].tronque,
			`${ctx} : le nom « ${q.cols[i].nom} » de la colonne ${q.cols[i].sym} est coupé`,
		).toBe(false);
	}
}

/* Critère 28 : les noms restent entiers, sur UNE ligne (« hecto- / grammes » interdit). */
function verifierNomsSurUneLigne(q: Question): void {
	for (const c of q.cols) {
		expect(c.lignes, `le nom « ${c.nom} » (${c.sym}) est rendu sur ${c.lignes} lignes`).toBe(1);
		expect(c.tronque, `le nom « ${c.nom} » (${c.sym}) est coupé`).toBe(false);
	}
}

/* ------------------------------------------------------------------
   Critères 21, 22 et 28, sur toutes les familles, masses CM1 comprises (le cas le plus
   large). Plusieurs questions par test : chacune est mesurée à son apparition.
   ------------------------------------------------------------------ */
const FAMILLES: { label: string; hash: string; cm1: boolean }[] = [
	{ label: 'mes-longueurs (CE2)', hash: 'mode-mes-longueurs', cm1: false },
	{ label: 'mes-masses (CE2)', hash: 'mode-mes-masses', cm1: false },
	{ label: 'mes-masses (CM1)', hash: 'mode-mes-masses', cm1: true },
	{ label: 'mes-contenances (CE2)', hash: 'mode-mes-contenances', cm1: false },
];

for (const { label, hash, cm1 } of FAMILLES) {
	test(`${label} (#711 critères 21, 22, 28) : à 393 px, l'intervalle de chaque question est entier dans le cadre, noms entiers sur une ligne`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await ouvrirTableau(page, hash, cm1, PORTRAIT);
		const vues = { n: 0 };
		await parcourir(page, 5, (q) => {
			vues.n++;
			verifierIntervalle(q);
			verifierNomsSurUneLigne(q);
			return false;
		});
		expect(vues.n, 'aucune question mesurée').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});
}

/* Critère 23 : le cas dur, les masses. Propriété INDÉPENDANTE du tirage : `kg` et `g`
   doivent pouvoir tenir ensemble dans le cadre, sans quoi aucun cadrage ne satisfait « 2 kg = ? g ».
   Avant le lot : 332 px (CE2) / 346 px (CM1) pour un cadre de 313 px. */
for (const cm1 of [false, true]) {
	test(`mes-masses (${cm1 ? 'CM1' : 'CE2'}, #711 critère 23) : à 393 px, kg et g tiennent ensemble dans le cadre`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await ouvrirTableau(page, 'mode-mes-masses', cm1, PORTRAIT);
		const r = await releve(page);
		const iKg = r.cols.findIndex((c) => c.sym === 'kg');
		const iG = r.cols.findIndex((c) => c.sym === 'g');
		expect(iKg, 'colonne kg introuvable').toBeGreaterThanOrEqual(0);
		expect(iG, 'colonne g introuvable').toBeGreaterThanOrEqual(0);
		const span = r.cols[Math.max(iKg, iG)].right - r.cols[Math.min(iKg, iG)].left;
		expect(
			span,
			`« 2 kg = ? g » : l'intervalle kg↔g mesure ${span} px pour un cadre de ${largeurCadre(r)} px, il ne peut pas être vu entier`,
		).toBeLessThanOrEqual(largeurCadre(r) + 1);
		expect(errors).toEqual([]);
	});
}

/* Critère 24 : le cadrage se recalcule quand la géométrie change. Portrait → paysage (le
   tableau ne déborde plus, le navigateur ramène le défilement à 0) → portrait : sans
   recalcul, le cadre reste à 0 et l'intervalle ressort du cadre. On choisit une question
   qui exige un décalage (scrollLeft > 0 à l'apparition) pour que le retour à 0 se voie. */
test("mes-longueurs (#711 critère 24) : après rotation paysage puis retour au portrait, l'intervalle est de nouveau entier dans le cadre", async ({
	page,
}) => {
	const errors = watchErrors(page);
	const q = await chercherQuestion(
		page,
		() => ouvrirTableau(page, 'mode-mes-longueurs', false, PORTRAIT),
		(x) => x.scrollLeft > 1 && largeurIntervalle(x) <= largeurCadre(x),
		4,
	);
	expect(
		q,
		"aucune question n'a été cadrée (scrollLeft > 0) à l'apparition : le tableau s'ouvre toujours sur ses premières colonnes",
	).not.toBeNull();

	await page.setViewportSize(PAYSAGE);
	// Une rotation réelle dure des dizaines d'images : le paysage est bel et bien rendu avant le
	// retour. Sans cette attente, les deux redimensionnements se jouent sans image entre eux.
	await page.evaluate(
		() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
	);
	await page.setViewportSize(PORTRAIT);

	let dernier = '';
	try {
		await expect
			.poll(
				async () => {
					const r = await releve(page);
					const largeur = await page.evaluate(() => window.innerWidth);
					dernier = `viewport ${largeur}px, scrollLeft ${r.scrollLeft}, cadre ${r.cadreGauche}→${r.cadreDroite}, ${q!.cols[q!.lo].sym} à ${r.cols[q!.lo].left}, ${q!.cols[q!.hi].sym} jusqu'à ${r.cols[q!.hi].right} (scrollLeft avant rotation : ${q!.scrollLeft})`;
					return (
						r.cols[q!.lo].left >= r.cadreGauche - 1 && r.cols[q!.hi].right <= r.cadreDroite + 1
					);
				},
				{
					timeout: 3000,
				},
			)
			.toBe(true);
	} catch (e) {
		throw new Error(
			`« ${q!.enonce} » : après rotation, le tableau est resté sur une position qui ne correspond plus à la question. ${dernier}`,
			{ cause: e },
		);
	}
	expect(errors).toEqual([]);
});

/* Critère 25 : quand l'intervalle ne tient pas, le cadre s'ouvre sur l'unité DONNÉE, dans le
   sens du remplissage (arbitrage pedagogue-primaire). La donnée doit être entière et sans
   colonne complète « derrière » elle : à gauche du cadre pour une conversion vers la droite
   (3 km → m), à droite pour une conversion vers la gauche (456 cm → m). */
for (const sens of ['droite', 'gauche'] as const) {
	test(`mes-longueurs (#711 critère 25) : à 320 px, un intervalle trop large cadre l'unité donnée (conversion vers la ${sens})`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		const q = await chercherQuestion(
			page,
			() => ouvrirTableau(page, 'mode-mes-longueurs', false, TRES_ETROIT),
			(x) =>
				largeurIntervalle(x) > largeurCadre(x) + 1 &&
				(sens === 'droite' ? x.iDemandee > x.iDonnee && x.iDonnee > 0 : x.iDemandee < x.iDonnee),
		);
		expect(
			q,
			`aucune question « vers la ${sens} » à intervalle trop large tirée en 4 séries (relancer : tirage)`,
		).not.toBeNull();
		const d = q!.cols[q!.iDonnee];
		const ctx = `« ${q!.enonce} » (scrollLeft ${q!.scrollLeft})`;
		expect(
			d.left,
			`${ctx} : l'unité donnée ${d.sym} est coupée à gauche, le tableau ne s'ouvre pas sur elle`,
		).toBeGreaterThanOrEqual(q!.cadreGauche - 1);
		expect(d.right, `${ctx} : l'unité donnée ${d.sym} est coupée à droite`).toBeLessThanOrEqual(
			q!.cadreDroite + 1,
		);
		// Le cadre s'étend dans le sens du remplissage : moins d'une colonne de vide côté « arrière ».
		const arriere = sens === 'droite' ? d.left - q!.cadreGauche : q!.cadreDroite - d.right;
		expect(
			arriere,
			`${ctx} : ${Math.round(arriere)} px de colonnes précèdent l'unité donnée ${d.sym} côté ${sens === 'droite' ? 'gauche' : 'droit'}, le cadre n'est pas aligné sur elle`,
		).toBeLessThan(d.right - d.left);
		expect(errors).toEqual([]);
	});
}

/* Critère 26 (négatif) : le cadrage ne déplace jamais la page verticalement. Les gestes passent
   par des clics DOM (`el.click()`) : le `click()` de Playwright fait lui-même défiler la page
   pour atteindre sa cible, ce qui polluerait la mesure. Viewport bas pour que la page défile.
   Un TÉMOIN en fin de test prouve que l'instrument voit un défilement de page quand il y en a. */
test("mes-longueurs (#711 critère 26) : l'apparition d'une question ne fait pas défiler la page", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirTableau(page, 'mode-mes-longueurs', false, { width: 393, height: 420 });
	const marge = await page.evaluate(
		() => document.documentElement.scrollHeight - window.innerHeight,
	);
	expect(
		marge,
		'la page devrait défiler à cette hauteur (sinon le test ne prouve rien)',
	).toBeGreaterThan(60);
	const Y0 = 20;
	await page.evaluate((y) => window.scrollTo(0, y), Y0);

	for (let k = 0; k < 3; k++) {
		const enonceAvant = await page.locator('.tc-enonce').innerText();
		await page.evaluate(() => {
			document.querySelectorAll<HTMLElement>('.tc-cell').forEach((c) => {
				document
					.querySelector<HTMLElement>(`.tc-pave-btn[data-chiffre="${c.dataset.answer}"]`)
					?.click();
			});
			document.querySelector<HTMLElement>('#tcVerif')?.click();
		});
		// La correction affichée peut, elle, faire défiler (hors sujet ici) : on remet la page à
		// Y0 juste avant d'appeler la question suivante, pour ne mesurer que SON apparition.
		await expect(page.locator('#tcActions button')).toBeVisible();
		await page.evaluate((y) => window.scrollTo(0, y), Y0);
		await page.evaluate(() => document.querySelector<HTMLElement>('#tcActions button')?.click());
		await expect(page.locator('#tcVerif')).toBeDisabled();
		await expect(page.locator('.tc-enonce')).not.toHaveText(enonceAvant);
		const y = await page.evaluate(() => window.scrollY);
		expect(y, `la page a bougé de ${y - Y0} px au rendu de la question ${k + 2}`).toBe(Y0);
	}

	// Témoin : l'instrument n'est pas aveugle.
	await page.evaluate(() =>
		document.querySelector('.tc-legende')?.scrollIntoView({ block: 'end' }),
	);
	const apres = await page.evaluate(() => window.scrollY);
	expect(apres, 'témoin : un scrollIntoView vertical devrait être détecté').not.toBe(Y0);
	expect(errors).toEqual([]);
});

/* Critère 27 (négatif) : aucun mouvement animé. Deux observables : le `scroll-behavior` calculé du
   cadre, et l'absence de déplacement EN COURS une fois la question apparue (on laisse passer
   deux images, puis on compare deux lectures espacées de trois). Un TÉMOIN (défilement
   `smooth` explicite) prouve que la mesure détecte un mouvement progressif.
   Limite assumée : cela garde l'effet (rien n'anime), pas la ligne de code `behavior: 'smooth'`. */
async function defilementEnCours(page: Page, provoquer = false): Promise<boolean> {
	return page.evaluate(async (provoque) => {
		const wrap = document.querySelector('.tc-wrap') as HTMLElement;
		const image = () => new Promise((r) => requestAnimationFrame(() => r(null)));
		if (provoque) {
			// TÉMOIN : tout se joue dans CETTE évaluation (pas d'aller-retour Playwright entre le
			// lancement du défilement et sa mesure, sinon il peut être fini avant d'être vu).
			// On laisse d'abord passer 30 images : juste après le rendu d'une question, le
			// `ResizeObserver` du runner rejoue le cadrage à sa première notification, et cette
			// écriture instantanée de `scrollLeft` annule net un défilement `smooth` lancé
			// dans l'intervalle (mesuré : le témoin restait immobile 2 fois sur 3).
			for (let i = 0; i < 30; i++) await image();
			const max = wrap.scrollWidth - wrap.clientWidth;
			wrap.scrollTo({ left: wrap.scrollLeft < max / 2 ? max : 0, behavior: 'smooth' });
		}
		await image();
		await image();
		const avant = wrap.scrollLeft;
		await image();
		await image();
		await image();
		return wrap.scrollLeft !== avant;
	}, provoquer);
}

test('mes-longueurs (#711 critère 27) : le cadrage est instantané, sans défilement progressif', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirTableau(page, 'mode-mes-longueurs', false, PORTRAIT);

	for (let k = 0; k < 3; k++) {
		const comportement = await page
			.locator('.tc-wrap')
			.evaluate((el) => getComputedStyle(el).scrollBehavior);
		expect(comportement, 'le cadre porte un scroll-behavior animé').toBe('auto');
		expect(
			await defilementEnCours(page),
			`la question ${k + 1} s'anime : le tableau glisse au lieu d'apparaître en place`,
		).toBe(false);
		if (!(await questionSuivante(page))) break;
	}

	// Témoin : un défilement `smooth` demandé explicitement est bien vu comme un mouvement.
	expect(
		await defilementEnCours(page, true),
		"témoin : un défilement smooth n'est pas détecté",
	).toBe(true);
	expect(errors).toEqual([]);
});

/* Critère 29 (« aucune leçon hors du tableau de conversion ne change ») : NON couvert ici, à dessein.
   Un test e2e honnête demanderait une comparaison de rendu pixel à pixel des autres runners
   avant/après, c'est le rôle de `galerie.spec.ts` (baselines Linux, jouée en CI). Une assertion
   sur des marges de `.sprint` recopierait la valeur du SCSS et rougirait sans rien casser. */
