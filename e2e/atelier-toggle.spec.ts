/* ============================================================
   Atelier du mot — bascule (toggle) d'un entourage déjà tracé (#462).
   Recliquer/re-glisser sur une lettre DÉJÀ entourée doit RETIRER
   l'entourage (au lieu d'en empiler un second, superposé). Couvre :
   - ajout puis retrait au tap sur la même lettre (bascule) ;
   - aperçu pendant le geste (`.sel` en ajout, `.sel-effacer` en retrait) ;
   - dépassement (le geste part d'une lettre entourée et va au-delà) :
     `.sel-effacer` sur l'entourage visé, `.sel-neutre` sur le dépassement,
     `data-effacer` sur SON seul `<rect>` (SVG), styles suivis en Chromium ;
   - « Effacer le dernier » / « Tout effacer » restent fonctionnels.
   Logique pure (basculerEntourage / entouragesRecouverts) déjà couverte en
   Vitest (tests/ortho-entourages.test.ts) : on teste ici le GESTE réel
   dans le DOM (core/orthographe/entourages.ts, ui/ortho-atelier.ts).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Le runner « atelier » déclenche l'aide contextuelle au 1er lancement.
   On la marque comme déjà vue pour éviter que l'overlay bloque les gestes. */
test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
});

test('atelier : recliquer une lettre entourée retire l’entourage (bascule) — #462', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Liste prédéfinie « Mots invariables (1) » → profil neuf : découverte = atelier.
	await gotoHash(page, 'ortho-fr-ortho-invariables-1');

	const mot = page.locator('#atelierMot');
	await expect(mot).toBeVisible();
	const rects = page.locator('#atelierSvg rect');

	const lettre = mot.locator('.atelier-lettre:not([data-space="1"])').first();

	// Un geste sur une lettre NON entourée ajoute un entourage (comportement inchangé).
	await lettre.click();
	await expect(rects).toHaveCount(1);

	// Refaire le geste sur cette MÊME lettre retire l'entourage, au lieu d'en
	// empiler un second (le bug #462 : deux <rect> superposés).
	await lettre.click();
	await expect(rects).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('atelier : aperçu pendant le geste — .sel en ajout, .sel-effacer en retrait — #462', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'ortho-fr-ortho-invariables-1');

	const mot = page.locator('#atelierMot');
	await expect(mot).toBeVisible();
	const rects = page.locator('#atelierSvg rect');

	const lettre = mot.locator('.atelier-lettre:not([data-space="1"])').first();
	const box = await lettre.boundingBox();
	expect(box).not.toBeNull();
	const cx = box!.x + box!.width / 2;
	const cy = box!.y + box!.height / 2;

	// Pointeur enfoncé sur une lettre NON entourée : aperçu « ça va s'ajouter » (.sel).
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await expect(mot.locator('.atelier-lettre.sel')).toHaveCount(1);
	await expect(mot.locator('.atelier-lettre.sel-effacer')).toHaveCount(0);
	await page.mouse.up();
	await expect(rects).toHaveCount(1); // relâché : l'entourage est bien tracé

	// Refaire le même geste sur cette lettre désormais entourée : aperçu
	// « ça va s'effacer » (.sel-effacer), pas .sel.
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await expect(mot.locator('.atelier-lettre.sel-effacer')).toHaveCount(1);
	await expect(mot.locator('.atelier-lettre.sel')).toHaveCount(0);
	await page.mouse.up();
	await expect(rects).toHaveCount(0); // relâché : l'entourage est bien retiré

	expect(errors).toEqual([]);
});

/* Mot déterministe (pas la liste prédéfinie aléatoire) pour maîtriser les index de
   lettres : il faut un mot assez long, SANS espace, pour construire un dépassement
   précis (une lettre entourée isolée, un dépassement de 2 lettres, un second
   entourage lointain qui ne doit PAS être concerné). Seed « ludaskia_ortho » du
   profil e2e, comme motcache-entourages.spec.ts. */
const ORTHO_SEED_DEPASSEMENT = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'extraordinaire',
			entourage: [],
			atelierFait: false,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-depassement',
			label: 'Test dépassement entourage',
			motIds: ['w1'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { extraordinaire: 'w1' },
};

test('atelier : geste de dépassement — .sel-effacer sur l’entourage visé, .sel-neutre au-delà, data-effacer sur SON rect — #462', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, ORTHO_SEED_DEPASSEMENT);
	await gotoHash(page, 'ortho-l-e2e-depassement');

	const mot = page.locator('#atelierMot');
	await expect(mot).toBeVisible();
	const lettres = mot.locator('.atelier-lettre:not([data-space="1"])');
	const rects = page.locator('#atelierSvg rect');

	// Deux entourages distincts et éloignés (lettre 0 seule, lettre 10 seule) : le
	// second ne doit PAS être concerné par le dépassement testé plus bas.
	await lettres.nth(0).click();
	await lettres.nth(10).click();
	await expect(rects).toHaveCount(2);

	// Geste qui PART de la lettre 0 (entourée) et DÉPASSE jusqu'à la lettre 2 : un
	// vrai glissé (pointeur maintenu enfoncé), pour observer l'aperçu intermédiaire.
	const box0 = await lettres.nth(0).boundingBox();
	const box2 = await lettres.nth(2).boundingBox();
	expect(box0).not.toBeNull();
	expect(box2).not.toBeNull();
	await page.mouse.move(box0!.x + box0!.width / 2, box0!.y + box0!.height / 2);
	await page.mouse.down();
	await page.mouse.move(box2!.x + box2!.width / 2, box2!.y + box2!.height / 2, { steps: 5 });

	// La lettre entourée (0) : .sel-effacer. Les lettres de dépassement (1, 2), hors de
	// tout entourage : .sel-neutre — jamais .sel (rien ne s'y ajoute, le geste efface
	// ailleurs, cf. commentaire `setPending` dans ui/ortho-atelier.ts).
	await expect(mot.locator('.atelier-lettre[data-i="0"].sel-effacer')).toHaveCount(1);
	await expect(mot.locator('.atelier-lettre[data-i="1"].sel-neutre')).toHaveCount(1);
	await expect(mot.locator('.atelier-lettre[data-i="2"].sel-neutre')).toHaveCount(1);
	await expect(mot.locator('.atelier-lettre.sel')).toHaveCount(0);

	// Le SVG ne marque QUE le rect de l'entourage visé (lettre 0), pas celui de la
	// lettre 10 : un seul `rect[data-effacer]`, stylé en pointillé — surcharge CSS de
	// l'attribut de présentation `stroke-dasharray` à vérifier dans Chromium.
	const rectEffacer = page.locator('#atelierSvg rect[data-effacer]');
	await expect(rectEffacer).toHaveCount(1);
	const dashArray = await rectEffacer.evaluate((el) => getComputedStyle(el).strokeDasharray);
	expect(dashArray).not.toBe('none');

	// Relâcher : seul l'entourage visé disparaît (bascule), l'autre reste — et le
	// SVG, retracé, ne porte plus `data-effacer` nulle part.
	await page.mouse.up();
	await expect(rects).toHaveCount(1);
	await expect(page.locator('#atelierSvg rect[data-effacer]')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('atelier : « Effacer le dernier » et « Tout effacer » restent fonctionnels', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'ortho-fr-ortho-invariables-1');

	const mot = page.locator('#atelierMot');
	await expect(mot).toBeVisible();
	const rects = page.locator('#atelierSvg rect');
	const lettres = mot.locator('.atelier-lettre:not([data-space="1"])');

	// Deux lettres distinctes entourées → deux entourages (pas de recouvrement).
	await lettres.nth(0).click();
	await lettres.nth(1).click();
	await expect(rects).toHaveCount(2);

	// « Effacer le dernier » retire uniquement le second.
	await page.locator('#atelierUndo').click();
	await expect(rects).toHaveCount(1);

	// « Tout effacer » ouvre une modale de confirmation ; confirmer vide tout.
	await page.locator('#atelierClear').click();
	await page.locator('.modal-danger').click();
	await expect(rects).toHaveCount(0);

	expect(errors).toEqual([]);
});
