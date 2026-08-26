/* ============================================================
   Dates de la ligne d'une liste de dictée (#541 volet 2, converti par #545) —
   smoke tests e2e.
   ------------------------------------------------------------
   Anciennement « frise d'états des listes » : cette spec testait `.enc-frise` sur
   une ligne de liste (une cellule par semaine, couleur = état). Cette frise a
   DISPARU des lignes de liste avec #545 (remplacée par la frise de composition,
   cf. `frise-composition-listes.spec.ts`) — la liste ne mesurant pas la même
   chose qu'une leçon, garder les deux frises côte à côte aurait recréé la
   confusion que #545 vient justement défaire (cf. le commentaire de
   `ligneListeOrtho`, `src/ui/encadrant-progression.ts`).

   Ce que cette spec vérifiait ne s'est pas volatilisé pour autant : le journal
   `journaliserPaliersOrtho` (`src/core/orthographe/paliers.ts`) continue de
   dater les franchissements « en cours » / « acquis » d'une liste, et c'est
   maintenant la SEULE chose qui porte ces dates — la méta visible de la ligne
   (« commencée le… », « acquise le… »), dérivée par `friseListeOrtho` (toujours
   là, juste plus dessinée). C'est le critère 20 de #545, et le point le plus
   fragile de tout ce travail : plus rien à l'écran ne montre la frise d'états
   elle-même, donc rien ne saute aux yeux si `ludaskia_paliersOrtho` cesse un
   jour d'être lu. Cette spec est ce qui l'empêche : elle garde les seeds et les
   cas de l'ancienne (bien construits), et vérifie désormais la MÉTA plutôt que
   des cellules de frise.

   Autre conséquence directe de la disparition de la frise : la puce d'état
   (`.enc-detail-puce`) n'est plus jamais réservée sur une ligne de liste — elle
   était omise seulement parce que la dernière cellule de la frise disait déjà
   l'état ; cette cellule n'existe plus, donc la puce redevient le seul canal
   visuel de l'état et reste TOUJOURS colorée (`.enc-key-<niveau>`).

   Ces tests SÈMENT le journal directement en localStorage (comme
   encadrant.spec.ts le fait pour les leçons) : l'écriture RÉELLE par une
   session jouée est couverte à part (paliers-journal-ortho.spec.ts).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Quatre listes « maison » (source 'liste', toujours visibles) : deux pour les paliers
   datés (l'une dont l'atelier est fait mais aucun mode validé, niveau réel « en cours » ;
   l'autre entièrement validée, niveau réel « acquis » — dictée exclue des modes requis en
   Chromium headless, sans voix FR, cf. modesRequis/dicteeDisponible), et deux de plus pour
   l'AMORÇAGE depuis le graphe d'activité (#541) : une « en cours » et une « acquise »,
   toutes deux SANS aucun palier stocké — c'est justement le cas qu'amorce ou pas
   `friseListeOrtho` selon que le sommet visé est atteignable. */
const SEED_ORTHO_ETATS = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'cahier',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		w2: {
			id: 'w2',
			mot: 'tableau',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: true, dictee: false },
			revision: { palier: 4, prochaineRevision: null, reussites: 3, dernierTest: null },
			origine: 'liste',
		},
		w3: {
			id: 'w3',
			mot: 'domino',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		w4: {
			id: 'w4',
			mot: 'ballon',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: true, dictee: false },
			revision: { palier: 4, prochaineRevision: null, reussites: 3, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-frise-encours',
			label: 'Liste en cours',
			motIds: ['w1'],
			createdAt: 1,
			updatedAt: 1,
		},
		{
			id: 'l-e2e-frise-acquis',
			label: 'Liste acquise',
			motIds: ['w2'],
			createdAt: 1,
			updatedAt: 1,
		},
		{
			id: 'l-e2e-frise-amorce-encours',
			label: 'Liste amorcée en cours',
			motIds: ['w3'],
			createdAt: 1,
			updatedAt: 1,
		},
		{
			id: 'l-e2e-frise-amorce-acquis',
			label: 'Liste amorcée acquise',
			motIds: ['w4'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { cahier: 'w1', tableau: 'w2', domino: 'w3', ballon: 'w4' },
};

/* Journal des paliers de dictée (#541) : un franchissement daté par liste + la
   borne de mise en service, sur le modèle de SEED_PALIERS (encadrant.spec.ts). */
const SEED_PALIERS_ORTHO = `(() => {
  const now = Date.now(); const week = 7 * 86400000;
  localStorage.setItem('e2e/ludaskia_paliersOrthoDepuis', String(now - 6 * week));
  localStorage.setItem('e2e/ludaskia_paliersOrtho', JSON.stringify({
    'l-e2e-frise-encours': { enCours: now - 5 * week },
    'l-e2e-frise-acquis': { acquis: now - 2 * week },
  }));
})();`;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_ORTHO_ETATS);
});

test("liste « en cours » : la méta dit « commencée le… », plus de frise d'états sur la ligne, puce colorée", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_PALIERS_ORTHO);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-encours"])');
	await expect(ligne).toBeVisible();
	// La frise d'états elle-même a disparu des lignes de liste (#545) : la composition l'a
	// remplacée pour le mouvement au jour le jour, et la garder ICI en plus aurait recréé la
	// confusion entre deux mesures différentes que #545 corrige. Absence VÉRIFIÉE et non
	// supposée, pour qu'un futur lecteur ne la lise pas comme un oubli.
	await expect(ligne.locator('.enc-frise')).toHaveCount(0);
	// Ce que la frise portait à elle seule survit dans la méta, DATÉE, dérivée du même
	// journal (`ludaskia_paliersOrtho`) par `friseListeOrtho` — juste plus dessinée.
	await expect(ligne.locator('.enc-detail-meta')).toContainText(/commencée le/);
	await expect(ligne.locator('.enc-detail-meta')).not.toContainText('acquise');
	// Puce TOUJOURS colorée sur une ligne de liste (plus jamais réservée, cf. l'ancienne
	// règle qui l'omettait quand la frise d'états disait déjà l'état — cette frise n'existe
	// plus, la puce redevient le seul canal visuel).
	await expect(ligne.locator('.enc-detail-puce.enc-key-en-cours')).toBeVisible();
	await expect(ligne.locator('.enc-detail-puce--reserve')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test("liste « acquise » : la méta dit « acquise le… », plus de frise d'états sur la ligne, puce colorée", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_PALIERS_ORTHO);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-acquis"])');
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-frise')).toHaveCount(0);
	await expect(ligne.locator('.enc-detail-meta')).toContainText(/acquise le/);
	await expect(ligne.locator('.enc-detail-puce.enc-key-acquis')).toBeVisible();
	await expect(ligne.locator('.enc-detail-puce--reserve')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Nuance documentée par friseListeOrtho/aucuneSemaineConnue (#541), toujours vraie sans
   frise à dessiner : SANS borne de mise en service (`ludaskia_paliersOrthoDepuis` absente)
   et sans aucun cap déjà daté, rien n'est déductible — la méta n'a alors AUCUNE date, elle
   ne dit que le compte de mots. Avant #545 ce fait s'observait par l'absence de frise ; il
   s'observe maintenant par l'absence du segment daté dans la méta. */
test('sans borne de mise en service, une liste déjà commencée a une méta SANS aucune date (juste le compte de mots)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Aucun seed de `ludaskia_paliersOrtho`/`ludaskia_paliersOrthoDepuis` : le journal
	// n'a encore jamais tourné pour ce profil.
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-encours"])');
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-frise')).toHaveCount(0);
	// Rien à dater : ni « commencée », ni « acquise » — seul le compte de mots reste.
	const meta = ligne.locator('.enc-detail-meta');
	await expect(meta).toContainText('mot');
	await expect(meta).not.toContainText('commencée');
	await expect(meta).not.toContainText('acquise');
	// La puce d'état et le mot restent le canal — inchangés par cette absence de date.
	await expect(ligne.locator('.enc-detail-puce.enc-key-en-cours')).toBeVisible();
	await expect(ligne.locator('.enc-detail-mot')).toContainText('en cours');

	expect(errors).toEqual([]);
});

/* Amorçage depuis le graphe d'activité (#541) : le cas RÉEL qui l'a motivé — un profil
   déjà utilisateur des dictées au moment où ce journal arrive, sans aucun palier stocké
   ni borne posée. `ludaskia_activity` garde pourtant des séances DATÉES par liste
   (`{k:'dictee', ref}`, #498) : une séance sur cette liste PROUVE qu'elle était « en
   cours » à cette date. `friseListeOrtho` s'en sert pour amorcer le cap « en cours » ET
   la borne de suivi de CETTE ligne — la méta porte une date dès le premier chargement,
   sans attendre une prochaine séance. */
const SEED_ACTIVITE_AMORCE = `(() => {
  const now = Date.now(); const week = 7 * 86400000;
  localStorage.setItem('e2e/ludaskia_activity', JSON.stringify([
    { t: now - 3 * week, k: 'dictee', ref: 'l-e2e-frise-amorce-encours' },
    { t: now - 3 * week, k: 'dictee', ref: 'l-e2e-frise-amorce-acquis' },
  ]));
})();`;

test("amorçage depuis le graphe d'activité : une liste « en cours » sans palier stocké obtient quand même sa date « commencée »", async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Aucun `ludaskia_paliersOrtho` ni borne : seul le graphe d'activité connaît cette liste.
	await page.addInitScript(SEED_ACTIVITE_AMORCE);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator(
		'.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-amorce-encours"])',
	);
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-frise')).toHaveCount(0);
	// La première séance connue (il y a 3 semaines) sert de date « commencée » — l'amorçage
	// ne prouve rien avant cette date, mais celle-ci suffit à dater la méta dès aujourd'hui.
	await expect(ligne.locator('.enc-detail-meta')).toContainText(/commencée le/);

	expect(errors).toEqual([]);
});

/* Ce que l'amorçage ne fait JAMAIS : dater une acquisition. Une liste déjà maîtrisée avant
   ce journal (état courant « acquis ») n'a AUCUN tampon `acquis` stocké — rien ne permet de
   dater CE franchissement-là, et l'inventer peindrait une semaine au hasard. Sa méta reste
   donc SANS aucune date, même avec des séances de dictée datées ; elle en aura une après sa
   prochaine séance, qui posera pour de bon le tampon `acquis`. */
test("amorçage depuis le graphe d'activité : une liste déjà « acquise » sans tampon garde une méta SANS date", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_ACTIVITE_AMORCE);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator(
		'.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-amorce-acquis"])',
	);
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-frise')).toHaveCount(0);
	const meta = ligne.locator('.enc-detail-meta');
	await expect(meta).not.toContainText('acquise');
	await expect(meta).not.toContainText('commencée');
	await expect(ligne.locator('.enc-detail-puce.enc-key-acquis')).toBeVisible();
	await expect(ligne.locator('.enc-detail-mot')).toContainText('acquis');

	expect(errors).toEqual([]);
});

/* Une liste jamais commencée (aucun mot travaillé) n'a rien à dater : pas de frise (comme
   pour une leçon jamais travaillée, cf. encadrant.spec.ts, test 10) et pas de segment daté
   dans la méta non plus. */
test('liste de dictée jamais commencée : ni frise, ni date dans la méta', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript((seed) => {
		const s = JSON.parse(seed);
		s.listes.push({
			id: 'l-e2e-frise-vierge',
			label: 'Liste vierge',
			motIds: [],
			createdAt: 1,
			updatedAt: 1,
		});
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, JSON.stringify(SEED_ORTHO_ETATS));
	await page.addInitScript(SEED_PALIERS_ORTHO);
	await gotoHash(page, 'encadrant');

	const ligne = page.locator('.enc-detail-item:has([data-lesson="ortho:l-e2e-frise-vierge"])');
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-frise')).toHaveCount(0);
	const meta = ligne.locator('.enc-detail-meta');
	await expect(meta).not.toContainText('commencée');
	await expect(meta).not.toContainText('acquise');

	expect(errors).toEqual([]);
});
