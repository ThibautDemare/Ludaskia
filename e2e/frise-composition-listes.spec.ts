/* ============================================================
   Frise de COMPOSITION des LISTES de dictée (#545) — smoke tests e2e.
   ------------------------------------------------------------
   Pendant de `frise-dictees.spec.ts` (l'ÉTAT d'une liste, #541), pour la mesure de
   nature DIFFÉRENTE ajoutée par #545 : la RÉPARTITION des mots entre les étapes de
   l'escalier (atelier → tuiles → affiche/masque → dictée), qui bouge dès qu'un seul
   mot franchit une marche — même si personne ne devient « maîtrisé ». C'est
   exactement ce que l'ancienne frise d'états ne savait pas montrer (critère 6).

   Couverture (voir #545 pour le texte complet des critères) :
   - 5 : la ligne dénombre les mots par étape, et deux compositions différentes
     s'affichent différemment.
   - 6 (critère central) : un franchissement RÉEL (joué dans l'interface, pas semé)
     change le texte de la ligne sans qu'aucun mot ne devienne maîtrisé.
   - 8 : le repli des 12 semaines s'ouvre et se rend sans erreur console.
   - 12 : la frise des 12 semaines se dit en une phrase (texte visible, colonnes
     décoratives), jamais cellule par cellule.
   - 20 : la méta datée de la ligne (« acquise le… ») cohabite avec la nouvelle frise.
   - 21 : rien de tout ceci n'atteint l'enfant.

   Rendu : `compositionHTML` (barre du jour), `friseCompositionHTML` (repli 12
   semaines) — `src/ui/encadrant-progression.ts`. Logique : `composition`/`rangMot`
   (`src/core/orthographe/etapes.ts`) et `friseComposition`
   (`src/core/encadrant-stats.ts`), déjà couvertes côté Vitest
   (tests/etapes-ortho.test.ts, tests/frise-composition.test.ts) — pas redoublées ici.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

async function seedOrtho(page: Page, seed: unknown): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);
}

const motVierge = (id: string, mot: string) => ({
	id,
	mot,
	entourage: [],
	atelierFait: true,
	validation: { motCache: false, tuiles: false, dictee: false },
	revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
	origine: 'liste',
});

/* Complète UNE tuile-mot (mode « lettres à remettre dans l'ordre »), via un vrai
   geste : clique chaque lettre du bac dans l'ordre du mot, puis vérifie. Repris de
   `paliers-journal-ortho.spec.ts` (branche tuiles de `completerEntretien`). */
async function completerTuiles(page: Page, mot: string): Promise<void> {
	for (const ch of mot) {
		await page
			.locator('.tuiles-bac button.tuile:not(.tuile-used)', { hasText: ch })
			.first()
			.click();
	}
	await page.locator('#btnVerifTuiles').click();
}

/* ---------- Critère 5 : deux compositions différentes s'affichent différemment ---------- */
const SEED_DEUX_LISTES = {
	banque: {
		d1: motVierge('d1', 'cahier'),
		d2: motVierge('d2', 'tableau'),
		d3: motVierge('d3', 'domino'),
		t1: {
			...motVierge('t1', 'ballon'),
			validation: { motCache: false, tuiles: true, dictee: false },
		},
		t2: {
			...motVierge('t2', 'jardin'),
			validation: { motCache: false, tuiles: true, dictee: false },
		},
		t3: {
			...motVierge('t3', 'nuage'),
			validation: { motCache: false, tuiles: true, dictee: false },
		},
	},
	listes: [
		{
			id: 'l-e2e-compo-decouverte',
			label: 'Liste tout juste découverte',
			motIds: ['d1', 'd2', 'd3'],
			createdAt: 1,
			updatedAt: 1,
		},
		{
			id: 'l-e2e-compo-avancee',
			label: 'Liste avancée aux tuiles',
			motIds: ['t1', 't2', 't3'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: {
		cahier: 'd1',
		tableau: 'd2',
		domino: 'd3',
		ballon: 't1',
		jardin: 't2',
		nuage: 't3',
	},
};

test('critère 5 : deux listes de même taille mais de composition différente ne s’affichent pas pareil', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedOrtho(page, SEED_DEUX_LISTES);
	await gotoHash(page, 'encadrant');

	const ligneDecouverte = page.locator(
		'.enc-detail-item:has([data-lesson="ortho:l-e2e-compo-decouverte"])',
	);
	const ligneAvancee = page.locator(
		'.enc-detail-item:has([data-lesson="ortho:l-e2e-compo-avancee"])',
	);
	const texteDecouverte = ligneDecouverte.locator('.enc-compo-texte');
	const texteAvancee = ligneAvancee.locator('.enc-compo-texte');
	await expect(texteDecouverte).toBeVisible();
	await expect(texteAvancee).toBeVisible();

	// Même effectif (3 mots chacune), étape différente : le TEXTE doit le dire — dénombrement
	// ET sujet explicite (« mots »), pas un participe sans sujet.
	await expect(texteDecouverte).toContainText('3 mots découverts');
	await expect(texteAvancee).toContainText('3 mots réussis aux tuiles');
	const [txtA, txtB] = await Promise.all([texteDecouverte.innerText(), texteAvancee.innerText()]);
	expect(txtA).not.toBe(txtB);

	expect(errors).toEqual([]);
});

/* ---------- Critère 6 (central) : un franchissement RÉEL change l'affichage,
   sans qu'aucun mot ne devienne « maîtrisé » ---------- */
const SEED_PROGRES = {
	banque: {
		p1: motVierge('p1', 'cahier'),
		p2: motVierge('p2', 'tableau'),
	},
	listes: [
		{
			id: 'l-e2e-compo-progres',
			label: 'Liste en progrès',
			motIds: ['p1', 'p2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { cahier: 'p1', tableau: 'p2' },
};

test('critère 6 : un mot qui franchit une marche change la ligne, même sans mot maîtrisé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	await seedOrtho(page, SEED_PROGRES);

	// --- AVANT : les deux mots sont seulement « découverts » (atelier fait, rien validé).
	await gotoHash(page, 'encadrant');
	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-compo-progres"])');
	const texte = ligne.locator('.enc-compo-texte');
	await expect(texte).toBeVisible();
	const avant = await texte.innerText();
	// Le niveau de la liste (le mot, canal indépendant de la couleur) reste « en cours »
	// avant comme après : aucun mot n'atteint la maîtrise dans ce test.
	await expect(ligne.locator('.enc-detail-mot')).toContainText('en cours');

	// --- GESTE RÉEL : parcours complet, on ne joue que la PREMIÈRE activité proposée
	// (tuiles, pour le premier mot de la liste) et on valide.
	await gotoHash(page, 'ortho-mode-l-e2e-compo-progres');
	await page.locator('.mode-btn.recommended').click();
	await page.locator('.tuiles-bac button.tuile').first().waitFor({ state: 'visible' });
	await completerTuiles(page, 'cahier');
	// La réussite masque le bouton « Vérifier » (cf. ortho-runner.ts) : signal fiable
	// que `validerMode` (et donc `saveOrtho`) a bien tourné avant qu'on ne s'en aille.
	await expect(page.locator('#btnVerifTuiles')).toBeHidden();

	// --- APRÈS : on relit la ligne, SANS avoir terminé la séance (pas de bilan).
	await gotoHash(page, 'encadrant');
	const texteApres = ligne.locator('.enc-compo-texte');
	await expect(texteApres).toBeVisible();
	const apres = await texteApres.innerText();

	expect(apres).not.toBe(avant);
	expect(apres).toMatch(/tuiles/);
	// Toujours « en cours » : le second mot n'est pas touché, le premier n'a que les
	// tuiles de validées — aucun mot n'est devenu maîtrisé par ce seul geste.
	await expect(ligne.locator('.enc-detail-mot')).toContainText('en cours');

	expect(errors).toEqual([]);
});

/* ---------- Critères 8 et 12 : le repli des 12 semaines ---------- */
const NOW = Date.now();
const WEEK = 7 * 24 * 60 * 60 * 1000;
const SEED_SEMAINES = {
	banque: {
		s1: {
			...motVierge('s1', 'cahier'),
			franchissements: { atelier: NOW - 9 * WEEK },
		},
		s2: {
			...motVierge('s2', 'tableau'),
			validation: { motCache: false, tuiles: true, dictee: false },
			franchissements: { atelier: NOW - 9 * WEEK, tuiles: NOW - 4 * WEEK },
		},
	},
	listes: [
		{
			id: 'l-e2e-compo-semaines',
			label: 'Liste évolutive',
			motIds: ['s1', 's2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { cahier: 's1', tableau: 's2' },
};

test('critère 8 : le repli des 12 semaines s’ouvre et rend ses 12 colonnes sans erreur', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedOrtho(page, SEED_SEMAINES);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-compo-semaines"])');
	const details = ligne.locator('details.enc-compo-frise');
	const summary = details.locator('summary');
	await expect(summary).toBeVisible();
	await expect(details).not.toHaveJSProperty('open', true);

	const cells = details.locator('.enc-compo-cells');
	await expect(cells).toBeHidden();
	await summary.click();
	await expect(cells).toBeVisible();

	const cols = cells.locator('.enc-compo-col');
	await expect(cols).toHaveCount(12);
	// Le suivi datant seulement de ~9 semaines, les colonnes les plus anciennes (au-delà)
	// sont INCONNUES — jamais « rien n'était commencé » — mais pas TOUTES : la dernière
	// (aujourd'hui) est toujours connue, sans attendre aucune borne (critère 11).
	await expect(cols.first()).toHaveClass(/enc-compo-col--inconnue/);
	await expect(cols.last()).not.toHaveClass(/enc-compo-col--inconnue/);
	const nbInconnues = await cells.locator('.enc-compo-col--inconnue').count();
	expect(nbInconnues).toBeGreaterThan(0);
	expect(nbInconnues).toBeLessThan(12);

	expect(errors).toEqual([]);
});

test('critère 12 : la frise des 12 semaines se dit en mots, par changement — jamais cellule par cellule', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedOrtho(page, SEED_SEMAINES);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-compo-semaines"])');
	const details = ligne.locator('details.enc-compo-frise');
	await details.locator('summary').click();

	// Les 12 colonnes sont DÉCORATIVES (le rendu graphique n'est pas fiable sur ses
	// frontières les plus serrées, cf. la dérogation de contraste) : rien à annoncer
	// cellule par cellule, ni via un rôle ni via un `aria-label` individuel.
	const cells = details.locator('.enc-compo-cells');
	await expect(cells).toHaveAttribute('aria-hidden', 'true');
	await expect(details.locator('.enc-compo-col[aria-label]')).toHaveCount(0);
	await expect(details.locator('.enc-compo-col[role="img"]')).toHaveCount(0);

	// La narration vit dans une vraie LISTE de texte VISIBLE (perceptible par tout le
	// monde, pas seulement au lecteur d'écran, et annoncée « liste, N éléments » par ce
	// dernier) — une entrée par CHANGEMENT de composition, jamais une par colonne : sur
	// 12 semaines, moins de 12 entrées.
	const recit = details.locator('.enc-compo-recit');
	await expect(recit).toHaveCount(1);
	await expect(recit).toBeVisible();
	const entrees = recit.locator('li');
	const nbEntrees = await entrees.count();
	expect(nbEntrees).toBeGreaterThan(0);
	expect(nbEntrees).toBeLessThan(12);
	// Chaque entrée porte un repère de temps mis en évidence (`<strong>`) : le préfixe
	// inconnu est résumé en NOMBRE de semaines dans une SEULE entrée, jamais répété
	// colonne par colonne (ce que ferait une lecture cellule par cellule).
	await expect(entrees.locator('strong')).toHaveCount(nbEntrees);
	await expect(entrees.first()).toContainText(/semaines? de statut inconnu/);
	const texte = await recit.innerText();
	expect((texte.match(/inconnu/gi) ?? []).length).toBe(1);
	// Au moins une transition racontée dans une entrée distincte : la composition a
	// changé au moins une fois sur la fenêtre (le mot « tableau » a franchi les tuiles
	// à 4 semaines).
	expect(texte).toMatch(/tuiles/);

	expect(errors).toEqual([]);
});

/* ---------- Critère 20 : la méta datée de la ligne survit à la nouvelle frise ---------- */
const SEED_META = {
	banque: {
		m1: {
			...motVierge('m1', 'chameau'),
			validation: { motCache: true, tuiles: true, dictee: true },
		},
	},
	listes: [
		{ id: 'l-e2e-compo-meta', label: 'Liste acquise', motIds: ['m1'], createdAt: 1, updatedAt: 1 },
	],
	motIdParForme: { chameau: 'm1' },
};
/* Journal des paliers d'ÉTAT (#541, distinct de la composition) : c'est LUI qui porte
   la date « acquise le… » de la méta visible — cf. `ligneListeOrtho`. */
const SEED_PALIERS_META = `(() => {
  const now = Date.now(); const week = 7 * 86400000;
  localStorage.setItem('e2e/ludaskia_paliersOrthoDepuis', String(now - 6 * week));
  localStorage.setItem('e2e/ludaskia_paliersOrtho', JSON.stringify({
    'l-e2e-compo-meta': { acquis: now - 2 * week },
  }));
})();`;

test('critère 20 : la méta datée (« acquise le… ») cohabite avec la nouvelle frise de composition', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedOrtho(page, SEED_META);
	await page.addInitScript(SEED_PALIERS_META);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-compo-meta"])');
	await expect(ligne).toBeVisible();
	// La méta datée existait AVANT #545 (journal des paliers d'état) : elle est toujours là.
	await expect(ligne.locator('.enc-detail-meta')).toContainText(/acquise/);
	// … à côté de la nouvelle frise de composition (barre du jour + repli 12 semaines) :
	// aucune des deux ne remplace l'autre.
	await expect(ligne.locator('.enc-compo')).toBeVisible();
	await expect(ligne.locator('details.enc-compo-frise')).toHaveCount(1);

	expect(errors).toEqual([]);
});

/* ---------- Critère 21 : rien de tout ceci n'atteint l'enfant ---------- */
test("critère 21 : la composition n'apparaît sur aucun écran enfant (catalogue, choix de mode)", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedOrtho(page, SEED_META);
	await page.addInitScript(SEED_PALIERS_META);

	// Le catalogue enfant d'orthographe (« Mes listes », la même liste vue par l'enfant).
	await gotoHash(page, 'categorie-fr-orthographe');
	await expect(page.locator('[data-ortho="l-e2e-compo-meta"]')).toBeVisible();
	await expect(page.locator('[class*="enc-compo"]')).toHaveCount(0);

	// L'écran de choix du mode de LA MÊME liste, déjà acquise côté encadrant.
	await gotoHash(page, 'ortho-mode-l-e2e-compo-meta');
	await expect(page.locator('.mode-choice')).toBeVisible();
	await expect(page.locator('[class*="enc-compo"]')).toHaveCount(0);

	expect(errors).toEqual([]);
});
