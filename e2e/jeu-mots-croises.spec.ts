/* ============================================================
   Mots croisés (#665) — smoke e2e.

   Ce que couvrent déjà les 135 tests Vitest (`tests/mots-croises*.test.ts`,
   `tests/definitions-gate.test.ts`, `tests/grille-mots*.test.ts`) et qui n'a donc
   rien à faire ici : le catalogue, la banque de définitions (contenu, longueur,
   absence de méta-langage, unicité), les motifs en tant que DONNÉES et leur
   remplissage sur 200 tirages, l'absence de journal d'erreurs et d'économie
   (XP/médaille/objectif), le préfixe des clés de stockage, et la moitié négative
   de la persistance (une valeur bricolée dans le stockage ne casse pas l'écran).
   Ici, uniquement ce qui ne se vérifie que dans un navigateur : le geste, le
   rendu, une MESURE en pixels, et la persistance RÉELLE à travers un rechargement
   (2026-09-10).

   Sélecteurs stables : `.mx-case[data-ligne][data-colonne]` (un `<input
   maxlength="1">` par case jouable, avec `data-h`/`data-v` s'il appartient à un
   mot horizontal/vertical), `.mx-sens[data-emplacement]`, `#mxDefTexte`,
   `#mxChoix`, `#mxSignal`, `#mxActions`, `#mxChanger`, `#mxFin`, et les attributs
   `data-plein`/`data-courant`/`data-juste`/`data-faux`.

   ── Comment cette spec connaît LA solution sans jamais importer `src/` ────────
   Contrairement aux mots à caser, le DOM des mots croisés n'expose JAMAIS le mot
   d'un emplacement (seulement sa définition) : il n'y a donc rien à lire dans la
   page pour fabriquer une pose juste. Mais la partie SAUVEGARDÉE, elle, range la
   solution en clair (`ludaskia_jeux_mots-croises_partie`, côté
   `core/jeux/mots-croises-etat.ts`) — c'est une lecture d'ÉTAT, pas un import de
   module, et la solution y est déjà présente dès le tirage (la sauvegarde a lieu
   avant toute lettre écrite). `lireGrilleReelle` la croise avec la géométrie du
   DOM (`data-h`/`data-v`) pour reconstruire, par emplacement, quelles cases
   portent quelle lettre, dans l'ordre de lecture du mot. */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedJeuxPossedesScript, ouvrirEtagere } from './helpers';

interface Cellule {
	ligne: number;
	colonne: number;
}

interface Emplacement {
	index: number;
	mot: string;
	cellules: Cellule[];
	/** Une case de cet emplacement qu'AUCUN autre mot ne traverse — garantie par
	    le dessin des motifs (« chaque emplacement garde au moins une case à
	    lui »). `null` seulement si cette garantie était violée. */
	libre: Cellule | null;
}

function caseLoc(page: Page, c: Cellule) {
	return page.locator(`.mx-case[data-ligne="${c.ligne}"][data-colonne="${c.colonne}"]`);
}

/* On désigne le jeu par `data-jeu="mots-croises"` : c'est le marqueur que
   `tests/couverture-e2e-gate.test.ts` cherche pour rattacher ce fichier au
   runner (#665). */
async function entrerDansLeJeu(page: Page): Promise<void> {
	await ouvrirEtagere(page);
	await page.locator('.jeu-item[data-jeu="mots-croises"]').click();
	await page.locator('#jeuEcran').waitFor({ state: 'visible' });
	await expect(page.locator('.mx-grille')).toBeVisible();
}

async function ouvrirMotsCroises(page: Page): Promise<void> {
	await page.addInitScript(seedJeuxPossedesScript(['mots-croises']));
	await gotoHash(page, 'accueil');
	await entrerDansLeJeu(page);
}

/** Lit la solution sauvegardée et la géométrie rendue, et les croise. */
async function lireGrilleReelle(page: Page): Promise<Emplacement[]> {
	return page.evaluate((): Emplacement[] => {
		let solution: string[] = [];
		try {
			const brut = localStorage.getItem('e2e/ludaskia_jeux_mots-croises_partie');
			const range = brut ? (JSON.parse(brut) as { solution?: string[] }) : {};
			solution = range.solution ?? [];
		} catch {
			solution = [];
		}
		const cases = [...document.querySelectorAll<HTMLInputElement>('.mx-case')];
		const par = new Map<number, { ligne: number; colonne: number; partagee: boolean }[]>();
		for (const el of cases) {
			const ligne = Number(el.dataset.ligne);
			const colonne = Number(el.dataset.colonne);
			const partagee = el.dataset.h !== undefined && el.dataset.v !== undefined;
			if (el.dataset.h !== undefined) {
				const i = Number(el.dataset.h);
				const liste = par.get(i) ?? [];
				liste.push({ ligne, colonne, partagee });
				par.set(i, liste);
			}
			if (el.dataset.v !== undefined) {
				const i = Number(el.dataset.v);
				const liste = par.get(i) ?? [];
				liste.push({ ligne, colonne, partagee });
				par.set(i, liste);
			}
		}
		return [...par.entries()]
			.map(([index, cellules]) => {
				const memeLigne = cellules.every((c) => c.ligne === cellules[0].ligne);
				const triees = [...cellules].sort((a, b) =>
					memeLigne ? a.colonne - b.colonne : a.ligne - b.ligne,
				);
				const libre = triees.find((c) => !c.partagee) ?? null;
				return {
					index,
					mot: solution[index] ?? '',
					cellules: triees.map(({ ligne, colonne }) => ({ ligne, colonne })),
					libre: libre ? { ligne: libre.ligne, colonne: libre.colonne } : null,
				};
			})
			.sort((a, b) => a.index - b.index);
	});
}

/** La première case qui porte À LA FOIS `data-h` et `data-v` — un croisement. */
async function premiereCaseCroisee(
	page: Page,
): Promise<{ ligne: number; colonne: number; h: number; v: number } | null> {
	return page.evaluate(() => {
		const els = [...document.querySelectorAll<HTMLInputElement>('.mx-case')];
		for (const el of els) {
			const h = el.dataset.h;
			const v = el.dataset.v;
			if (h !== undefined && v !== undefined) {
				return {
					ligne: Number(el.dataset.ligne),
					colonne: Number(el.dataset.colonne),
					h: Number(h),
					v: Number(v),
				};
			}
		}
		return null;
	});
}

/** Deux emplacements qui ne partagent AUCUNE case — pour éprouver un mot juste
    et un mot faux sans que l'un influence l'autre. */
function trouverPaireDisjointe(grille: Emplacement[]): [Emplacement, Emplacement] | null {
	for (let i = 0; i < grille.length; i++) {
		for (let j = i + 1; j < grille.length; j++) {
			const a = grille[i];
			const b = grille[j];
			const partage = a.cellules.some((ca) =>
				b.cellules.some((cb) => ca.ligne === cb.ligne && ca.colonne === cb.colonne),
			);
			if (!partage) return [a, b];
		}
	}
	return null;
}

/** Écrit un mot COMPLET et CORRECT dans ses cases, dans l'ordre de lecture. */
async function ecrireMot(page: Page, cellules: Cellule[], mot: string): Promise<void> {
	const lettres = [...mot.normalize('NFC')];
	for (let i = 0; i < cellules.length; i++) {
		await caseLoc(page, cellules[i]).fill(lettres[i]);
	}
}

/** Une lettre ASCII garantie différente de `lettre` (accents/casse pliés) : sert
    à fabriquer un désaccord de croisement sans connaître tout l'alphabet évité. */
function lettreDifferenteDe(lettre: string): string {
	const pliee = lettre.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
	return pliee === 'z' ? 'y' : 'z';
}

/* ---------- 1. Entrer dans le jeu ---------- */

test('entrer dans le jeu depuis l’étagère (data-jeu="mots-croises") : la grille se rend, sans erreur', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirMotsCroises(page);

	await expect(page.locator('.mx-grille')).toBeVisible();
	await expect(page.locator('.mx-case').first()).toBeVisible();

	expect(errors).toEqual([]);
});

/* ---------- 2. Mesure à 360 px ---------- */

test('à 360 px de large, une case du motif le plus large (6 colonnes) mesure au moins 44 px', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 360, height: 640 });
	await ouvrirMotsCroises(page);

	const grille = page.locator('#mxGrille');
	const lireColonnes = () =>
		grille.evaluate((el) => Number(el.style.getPropertyValue('--mx-colonnes')) || 0);

	// Cinq motifs sur six comptent 6 colonnes (un seul, « echelle », en compte 5) :
	// on relance jusqu'à tomber sur le pire cas, comme `jeu-mots-cases.spec.ts`
	// relance jusqu'à obtenir le tirage qu'il veut mesurer.
	let colonnes = await lireColonnes();
	for (let tentative = 0; tentative < 20 && colonnes !== 6; tentative++) {
		await page.locator('#mxChanger').click();
		await expect(page.locator('.mx-case').first()).toBeVisible();
		colonnes = await lireColonnes();
	}
	expect(colonnes, 'aucun motif à 6 colonnes obtenu en 20 tirages').toBe(6);

	const cases = page.locator('.mx-case');
	const n = await cases.count();
	expect(n).toBeGreaterThan(0);
	let min = Infinity;
	for (let i = 0; i < n; i++) {
		const boite = await cases.nth(i).boundingBox();
		expect(boite).not.toBeNull();
		min = Math.min(min, boite?.width ?? 0, boite?.height ?? 0);
	}
	console.log(
		`[mots-croises] case à 360 px (motif 6 colonnes) : ${min.toFixed(1)} px (plancher 44 px)`,
	);
	expect(min, `case mesurée à ${min.toFixed(1)} px`).toBeGreaterThanOrEqual(44);

	expect(errors).toEqual([]);
});

/* ---------- 3. Toucher une case affiche la définition ---------- */

test('toucher une case affiche la définition de son mot dans #mxDefTexte, et met le mot en évidence', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirMotsCroises(page);

	const grille = await lireGrilleReelle(page);
	const emplacement = grille.find((e) => e.libre);
	expect(emplacement, 'aucun emplacement avec une case non partagée').toBeTruthy();
	const cible = emplacement!.libre!;

	await expect(page.locator('#mxDefTexte')).not.toHaveAttribute('data-plein', '1');
	await caseLoc(page, cible).click();

	await expect(page.locator('#mxDefTexte')).toHaveAttribute('data-plein', '1');
	const texte = ((await page.locator('#mxDefTexte').textContent()) ?? '').trim();
	expect(texte.length).toBeGreaterThan(0);

	for (const c of emplacement!.cellules) {
		await expect(caseLoc(page, c)).toHaveAttribute('data-courant', '1');
	}

	expect(errors).toEqual([]);
});

/* ---------- 4. Croisement : deux boutons de sens ---------- */

test('sur une case de croisement, deux boutons .mx-sens (un par sens) apparaissent ; en choisir un fixe la définition', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirMotsCroises(page);

	const croisee = await premiereCaseCroisee(page);
	expect(croisee, 'aucune case de croisement trouvée sur cette grille').not.toBeNull();
	const { ligne, colonne, h, v } = croisee!;

	await caseLoc(page, { ligne, colonne }).click();

	await expect(page.locator('#mxChoix')).toBeVisible();
	await expect(page.locator('#mxChoix .mx-sens')).toHaveCount(2);
	const boutonH = page.locator(`.mx-sens[data-emplacement="${h}"]`);
	const boutonV = page.locator(`.mx-sens[data-emplacement="${v}"]`);
	await expect(boutonH).toBeVisible();
	await expect(boutonV).toBeVisible();

	// Tant qu'aucun sens n'est choisi, le jeu ne tranche pas à la place de l'enfant.
	await expect(page.locator('#mxDefTexte')).not.toHaveAttribute('data-plein', '1');

	await boutonH.click();
	await expect(boutonH).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#mxDefTexte')).toHaveAttribute('data-plein', '1');
	const texte = ((await page.locator('#mxDefTexte').textContent()) ?? '').trim();
	expect(texte.length).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});

/* ---------- 5. Saisie : écriture, avance, retour arrière ---------- */

test('taper une lettre l’écrit dans la case et avance à la prochaine case vide du mot ; le retour arrière sur case vide recule et efface', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirMotsCroises(page);

	const grille = await lireGrilleReelle(page);
	const emplacement = grille.find((e) => e.cellules.length >= 3 && e.libre);
	expect(
		emplacement,
		'aucun emplacement de trois lettres ou plus avec une case libre',
	).toBeTruthy();
	const [c0, c1, c2] = emplacement!.cellules;
	const case0 = caseLoc(page, c0);
	const case1 = caseLoc(page, c1);
	const case2 = caseLoc(page, c2);

	// On sélectionne le mot par sa case LIBRE (jamais ambiguë), puis on se place
	// sur sa première case pour y taper.
	await caseLoc(page, emplacement!.libre!).click();
	await case0.click();

	await page.keyboard.type('a');
	await expect(case0).toHaveValue('A');
	await expect(case1).toBeFocused();

	await page.keyboard.type('b');
	await expect(case1).toHaveValue('B');
	await expect(case2).toBeFocused();

	// Retour arrière sur une case VIDE (case2) : recule et efface la précédente.
	await page.keyboard.press('Backspace');
	await expect(case1).toBeFocused();
	await expect(case1).toHaveValue('');
	// La première lettre, elle, n'a pas bougé.
	await expect(case0).toHaveValue('A');

	expect(errors).toEqual([]);
});

/* ---------- 6. Le plus important : rien avant la dernière lettre ---------- */

test('un mot rempli sauf sa dernière lettre ne déclenche AUCUN signalement', async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrirMotsCroises(page);

	const grille = await lireGrilleReelle(page);
	const emplacement = grille.find((e) => e.cellules.length >= 2);
	expect(emplacement, 'aucun emplacement d’au moins deux lettres').toBeTruthy();
	const lettres = [...emplacement!.mot.normalize('NFC')];
	const cellules = emplacement!.cellules;

	// Toutes les lettres CORRECTES, sauf la dernière — non écrite.
	for (let i = 0; i < cellules.length - 1; i++) {
		await caseLoc(page, cellules[i]).fill(lettres[i]);
	}

	for (const c of cellules) {
		await expect(caseLoc(page, c)).not.toHaveAttribute('data-faux', '1');
		await expect(caseLoc(page, c)).not.toHaveAttribute('data-juste', '1');
	}
	await expect(page.locator('#mxSignal')).toBeHidden();

	expect(errors).toEqual([]);
});

/* ---------- 7. Complet et faux se signale ; complet et juste ne se signale pas ---------- */

test('un mot complet et faux se signale ; un mot complet et juste ne se signale pas', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirMotsCroises(page);

	let grille = await lireGrilleReelle(page);
	let paire = trouverPaireDisjointe(grille);
	for (let tentative = 0; tentative < 10 && !paire; tentative++) {
		await page.locator('#mxChanger').click();
		await expect(page.locator('.mx-case').first()).toBeVisible();
		grille = await lireGrilleReelle(page);
		paire = trouverPaireDisjointe(grille);
	}
	expect(paire, 'aucune paire de mots disjoints trouvée en 10 tirages').not.toBeNull();
	const [juste, faux] = paire!;

	// Mot A, complété CORRECTEMENT : aucun signal.
	await ecrireMot(page, juste.cellules, juste.mot);
	for (const c of juste.cellules) {
		await expect(caseLoc(page, c)).toHaveAttribute('data-juste', '1');
	}
	await expect(page.locator('#mxSignal')).toBeHidden();

	// Mot B, complété FAUX (dernière lettre changée) : signal.
	const lettresFaux = [...faux.mot.normalize('NFC')];
	const dernier = lettresFaux.length - 1;
	for (let i = 0; i < dernier; i++) {
		await caseLoc(page, faux.cellules[i]).fill(lettresFaux[i]);
	}
	await caseLoc(page, faux.cellules[dernier]).fill(lettreDifferenteDe(lettresFaux[dernier]));

	for (const c of faux.cellules) {
		await expect(caseLoc(page, c)).toHaveAttribute('data-faux', '1');
	}
	await expect(page.locator('#mxSignal')).toBeVisible();

	// Le mot juste, lui, n'a pas bougé.
	for (const c of juste.cellules) {
		await expect(caseLoc(page, c)).toHaveAttribute('data-juste', '1');
	}

	expect(errors).toEqual([]);
});

/* ---------- 8. Case partagée : repasse en faux le mot voisin ---------- */

test('écrire dans une case partagée fait repasser en faux un mot voisin qui était juste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirMotsCroises(page);

	const croisee = await premiereCaseCroisee(page);
	expect(croisee, 'aucune case de croisement trouvée sur cette grille').not.toBeNull();
	const { ligne, colonne, h } = croisee!;

	const grille = await lireGrilleReelle(page);
	const emplacementH = grille.find((e) => e.index === h);
	expect(emplacementH, 'emplacement horizontal introuvable').toBeTruthy();

	// Le mot H, complété CORRECTEMENT.
	await ecrireMot(page, emplacementH!.cellules, emplacementH!.mot);
	for (const c of emplacementH!.cellules) {
		await expect(caseLoc(page, c)).toHaveAttribute('data-juste', '1');
	}

	// On réécrit la case PARTAGÉE, en travaillant sur le mot qui la croise (V) :
	// une lettre différente de celle qu'attendait H.
	const rang = emplacementH!.cellules.findIndex((c) => c.ligne === ligne && c.colonne === colonne);
	const correcte = [...emplacementH!.mot.normalize('NFC')][rang];
	await caseLoc(page, { ligne, colonne }).fill(lettreDifferenteDe(correcte));

	// Le mot H repasse en faux, sur TOUTES ses cases — sans qu'on y ait retouché.
	for (const c of emplacementH!.cellules) {
		await expect(caseLoc(page, c)).toHaveAttribute('data-faux', '1');
		await expect(caseLoc(page, c)).not.toHaveAttribute('data-juste', '1');
	}

	expect(errors).toEqual([]);
});

/* ---------- 9. Victoire : #mxActions masqué ---------- */

test('à la victoire, #mxActions est masqué : les deux boutons faisaient le même geste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirMotsCroises(page);

	const grille = await lireGrilleReelle(page);
	for (const emplacement of grille) {
		await ecrireMot(page, emplacement.cellules, emplacement.mot);
	}

	await expect(page.locator('.mx-fin')).toBeVisible();
	await expect(page.locator('#mxActions')).toBeHidden();

	expect(errors).toEqual([]);
});

/* ---------- 10. Persistance au rechargement ---------- */

test('recharger la page au milieu d’une grille retrouve les lettres posées', async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrirMotsCroises(page);

	const grille = await lireGrilleReelle(page);
	const emplacement = grille[0];
	const cible = emplacement.libre ?? emplacement.cellules[0];
	const rang = emplacement.cellules.findIndex(
		(c) => c.ligne === cible.ligne && c.colonne === cible.colonne,
	);
	const lettre = [...emplacement.mot.normalize('NFC')][rang];

	const caseCible = caseLoc(page, cible);
	await caseCible.fill(lettre);
	await expect(caseCible).not.toHaveValue('');

	// Rechargement BRUTAL, sans passer par un bouton de sortie : seule une
	// sauvegarde faite AU MOMENT de la pose peut survivre à ça.
	await page.reload({ waitUntil: 'networkidle' });
	await page.locator('.mx-grille').waitFor({ state: 'visible' });

	await expect(caseCible).not.toHaveValue('');

	expect(errors).toEqual([]);
});
