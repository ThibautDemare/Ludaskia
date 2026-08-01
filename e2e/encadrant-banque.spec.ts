/* ============================================================
   Espace encadrant — banque de mots d'orthographe (#496).
   ------------------------------------------------------------
   Couvre le second volet du bloc « Dictées » de l'onglet Suivi : la bascule
   segment « Listes » / « Mots » (`data-act="dictees-vue"`), le rendu de la
   banque mot par mot (légende, mention figée pour un mot d'une dictée
   prédéfinie, compteur d'orphelins), la recherche (résumé en région live
   STABLE, annonce différée), le filtre orphelins (bouton muté en place,
   auto-désarmé si le dernier orphelin disparaît), la remise à plat de cet
   état de vue au changement de profil consulté (`#encConsulteSel`), la
   pagination à 50 (SC 2.4.1), et la suppression définitive (modale
   destructive puis disparition de la ligne).
   Bonus : le formulaire d'édition d'une liste (enfant) propose de supprimer
   pour de bon un mot qui vient d'en être retiré et n'est plus dans aucune
   liste — répercuté jusque dans la banque de l'espace encadrant.

   Note sélecteurs modale : comme modales.spec.ts, l'overlay `ui-modal.ts`
   est le SEUL `.modal-overlay` sans `id` (les overlays statiques de
   gamification en ont un) — `.modal-title`/`.modal-msg` seuls seraient en
   conflit avec ces overlays statiques, toujours présents dans le DOM.

   Note délai d'annonce : le résumé (`#encBanqueResume`) est une région live
   STABLE, mise à jour ~350ms après une frappe/un clic de filtre (pour ne pas
   interrompre une synthèse vocale en cours). `toHaveText` réessaie déjà
   (largement sous le timeout par défaut), mais un enchaînement de recherches
   qui produirait DEUX FOIS le même texte masquerait une annonce restée
   périmée (elle « collerait » par coïncidence) — on choisit donc des
   recherches dont les résumés successifs diffèrent, plutôt que de se fier au
   seul texte final.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Pas de verrou PIN hérité d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Alias : l'overlay ui-modal est le seul .modal-overlay sans id dans le DOM. */
const uiModalOverlay = '.modal-overlay:not([id])';

const LISTE_ID = 'l-e2e-banque';

/* Trois mots, trois statuts distincts pour la banque. Attention : les mots
   choisis doivent être ABSENTS de toute dictée prédéfinie (data/francais/
   orthographe.ts), sinon `leconPredefinieDuMot` les rendrait figés même
   référencés par une liste (piège vérifié : « cahier » y figure !).
   - w1 « framboise » : dans une liste du parent, en cours (atelier fait,
     aucun mode validé) → supprimable, cité par sa liste.
   - w2 « aussi » : PAS dans une liste du parent, mais présent dans la leçon
     prédéfinie « Mots invariables (1) » (fr-ortho-invariables-1) → non
     supprimable, mention figée. Tous les modes validés (maîtrisé).
   - w3 « zibulon » (mot inventé, absent de toute leçon prédéfinie) : ni
     liste, ni prédéfinie → ORPHELIN, supprimable, jamais découvert. */
const SEED_BANQUE = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'framboise',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		w2: {
			id: 'w2',
			mot: 'aussi',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: true, dictee: true },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		w3: {
			id: 'w3',
			mot: 'zibulon',
			entourage: [],
			atelierFait: false,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [{ id: LISTE_ID, label: 'Ma liste maison', motIds: ['w1'], createdAt: 1, updatedAt: 1 }],
	motIdParForme: { framboise: 'w1', aussi: 'w2', zibulon: 'w3' },
};

test.beforeEach(async ({ page }) => {
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_BANQUE);
});

const basculeVers = (page: import('@playwright/test').Page, vue: 'listes' | 'mots') =>
	page.locator(`.enc-act-mode[data-act="dictees-vue"][data-vue="${vue}"]`).click();

test('bloc « Dictées » : bascule Listes/Mots, légende, mot figé (dictée prédéfinie) et compteur d’orphelins', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant');

	// Le bloc s'appelle désormais « Dictées » (plus « Listes de dictée »).
	const bloc = page
		.locator('.enc-block')
		.filter({ has: page.locator('.enc-h3', { hasText: 'Dictées' }) });
	await expect(bloc.locator('.enc-h3')).toHaveText(/Dictées/);

	// Segment « Listes » / « Mots », « Listes » actif par défaut.
	const btnListes = page.locator('.enc-act-mode[data-act="dictees-vue"][data-vue="listes"]');
	const btnMots = page.locator('.enc-act-mode[data-act="dictees-vue"][data-vue="mots"]');
	await expect(btnListes).toHaveAttribute('aria-checked', 'true');
	await expect(btnMots).toHaveAttribute('aria-checked', 'false');

	// Volet « Listes » (l'existant) : la liste maison y apparaît toujours par défaut.
	await expect(
		page.locator(`.enc-detail-item:has([data-lesson="ortho:${LISTE_ID}"])`),
	).toBeVisible();
	await expect(page.locator('#encBanqueRech')).toHaveCount(0);

	// Bascule vers « Mots ».
	await basculeVers(page, 'mots');
	await expect(btnMots).toHaveAttribute('aria-checked', 'true');
	await expect(btnListes).toHaveAttribute('aria-checked', 'false');

	// Légende d'acquisition (3 niveaux, échelle ortho), scopée au bloc Dictées
	// (une légende similaire existe aussi pour le suivi des leçons du catalogue).
	await expect(bloc.locator('.enc-legend .enc-key')).toHaveCount(3);

	// Champ de recherche + résumé (région live stable, hors #encBanqueCorps) + les 3 mots.
	await expect(page.locator('#encBanqueRech')).toBeVisible();
	const resume = page.locator('#encBanqueResume');
	await expect(resume).toHaveAttribute('role', 'status');
	await expect(resume).toHaveText('3 mots affichés sur 3.');
	await expect(page.locator('#encBanqueCorps #encBanqueResume')).toHaveCount(0);
	await expect(page.locator('.enc-banque-item')).toHaveCount(3);

	// « framboise » (liste du parent) : citée par sa liste, bouton Supprimer.
	const ligneFramboise = page.locator('.enc-banque-item').filter({ hasText: 'framboise' });
	await expect(ligneFramboise.locator('.enc-detail-meta')).toContainText('Ma liste maison');
	await expect(
		ligneFramboise.locator('button[data-act="banque-supprimer"][data-mot="w1"]'),
	).toBeVisible();

	// « aussi » (mot d'une dictée prédéfinie) : mention figée, PAS de bouton Supprimer.
	const ligneAussi = page.locator('.enc-banque-item').filter({ hasText: 'aussi' });
	await expect(ligneAussi.locator('.enc-banque-fige')).toContainText(
		"Mot d'une dictée proposée par l'application",
	);
	await expect(ligneAussi.locator('button[data-act="banque-supprimer"]')).toHaveCount(0);

	// « zibulon » (orphelin) : « Dans aucune liste », supprimable.
	const ligneZibulon = page.locator('.enc-banque-item').filter({ hasText: 'zibulon' });
	await expect(ligneZibulon.locator('.enc-detail-meta')).toHaveText('Dans aucune liste');
	await expect(
		ligneZibulon.locator('button[data-act="banque-supprimer"][data-mot="w3"]'),
	).toBeVisible();

	// Compteur d'orphelins (bouton-bascule, un seul mot concerné).
	const btnOrphelins = page.locator('[data-act="banque-orphelins"]');
	await expect(btnOrphelins).toHaveText("1 mot n'est plus dans aucune liste");
	await expect(btnOrphelins).toHaveAttribute('aria-pressed', 'false');

	expect(errors).toEqual([]);
});

test('volet « Mots » : la recherche filtre la liste, le résumé (annoncé avec un léger différé) suit', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant');
	await basculeVers(page, 'mots');

	const rech = page.locator('#encBanqueRech');
	const resume = page.locator('#encBanqueResume');
	const items = page.locator('.enc-banque-item');

	// « fram » : un seul résultat. Le filtrage visuel de la liste est immédiat (pas de délai).
	await rech.fill('fram');
	await expect(items).toHaveCount(1);
	await expect(items.filter({ hasText: 'framboise' })).toBeVisible();
	await expect(resume).toHaveText('1 mot affiché sur 3.');

	// Vider la recherche : retour aux 3 mots, texte de résumé DIFFÉRENT du précédent — la
	// distinction textuelle prouve que l'annonce différée a bien rejoué, pas qu'un texte
	// périmé identique est resté affiché par coïncidence.
	await rech.fill('');
	await expect(items).toHaveCount(3);
	await expect(resume).toHaveText('3 mots affichés sur 3.');

	// Recherche insensible aux accents/à la casse (cleRecherche des deux côtés).
	await rech.fill('AUSSI');
	await expect(items).toHaveCount(1);
	await expect(items.filter({ hasText: 'aussi' })).toBeVisible();
	await expect(resume).toHaveText('1 mot affiché sur 3.');

	// Aucune correspondance : message dédié porté par le résumé lui-même (plus de
	// paragraphe #encBanqueVide séparé), pas de résultat dans #encBanqueCorps.
	await rech.fill('xyzxyz');
	await expect(resume).toHaveText('Aucun mot ne correspond à cette recherche.');
	await expect(items).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('volet « Mots » : le compteur d’orphelins bascule le filtre en place (aria-pressed, pas de remplacement de nœud)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant');
	await basculeVers(page, 'mots');

	const btnOrphelins = page.locator('[data-act="banque-orphelins"]');
	await btnOrphelins.click();
	await expect(btnOrphelins).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.enc-banque-item')).toHaveCount(1);
	await expect(page.locator('.enc-banque-item').filter({ hasText: 'zibulon' })).toBeVisible();
	// Le total (dénominateur du résumé) reste celui de la banque ENTIÈRE, pas du filtre.
	await expect(page.locator('#encBanqueResume')).toHaveText('1 mot affiché sur 3.');

	await btnOrphelins.click();
	await expect(btnOrphelins).toHaveAttribute('aria-pressed', 'false');
	await expect(page.locator('.enc-banque-item')).toHaveCount(3);

	expect(errors).toEqual([]);
});

test('volet « Mots » : supprimer un mot supprimable ouvre une modale destructive puis fait disparaître la ligne', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant');
	await basculeVers(page, 'mots');

	await page.locator('button[data-act="banque-supprimer"][data-mot="w1"]').click();

	// Modale de confirmation destructive (`uiConfirm`), nommant le mot.
	await expect(page.locator(`${uiModalOverlay} .modal-title`)).toHaveText(
		'Supprimer « framboise » ?',
	);
	await expect(page.locator(`${uiModalOverlay} .modal-msg`)).toContainText('Ma liste maison');
	await page.locator(`${uiModalOverlay} .modal-danger`).click();

	// Re-rendu complet (immédiat, pas d'annonce différée ici) : la ligne a disparu.
	await expect(page.locator('.enc-banque-item')).toHaveCount(2);
	await expect(page.locator('.enc-banque-item').filter({ hasText: 'framboise' })).toHaveCount(0);
	await expect(page.locator('#encBanqueResume')).toHaveText('2 mots affichés sur 2.');

	expect(errors).toEqual([]);
});

test('volet « Mots » : supprimer le dernier orphelin alors que le filtre est actif le désarme automatiquement', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant');
	await basculeVers(page, 'mots');

	// Poser le filtre : seul « zibulon » (l'unique orphelin) reste visible.
	const btnOrphelins = page.locator('[data-act="banque-orphelins"]');
	await btnOrphelins.click();
	await expect(page.locator('.enc-banque-item')).toHaveCount(1);

	// Le supprimer : c'était le seul orphelin ET le filtre était actif.
	await page.locator('button[data-act="banque-supprimer"][data-mot="w3"]').click();
	await expect(page.locator(`${uiModalOverlay} .modal-title`)).toHaveText(
		'Supprimer « zibulon » ?',
	);
	await page.locator(`${uiModalOverlay} .modal-danger`).click();

	// Le filtre s'est désarmé de lui-même (sinon la vue resterait vide sans recours) : les
	// 2 mots restants réapparaissent, et le bouton a disparu (plus aucun orphelin).
	await expect(page.locator('[data-act="banque-orphelins"]')).toHaveCount(0);
	await expect(page.locator('.enc-banque-item')).toHaveCount(2);
	await expect(page.locator('#encBanqueResume')).toHaveText('2 mots affichés sur 2.');

	expect(errors).toEqual([]);
});

/* Changement de profil consulté (#496, relecture qualité) : l'état de vue du volet « Mots »
   (recherche, filtre orphelins, dépliage) décrit le profil qu'on REGARDAIT. Hérité tel quel
   après une bascule du sélecteur « Vous consultez » (#encConsulteSel), il ferait passer une
   liste filtrée/tronquée pour la banque ENTIÈRE du nouvel enfant, sans rien d'anormal à
   l'écran pour le signaler. Seed à deux profils, chacun sa propre banque (mots absents des
   dictées prédéfinies), pour observer un VRAI changement de contenu au changement de profil. */
const PROFIL_A = 'e2e-a';
const PROFIL_B = 'e2e-b';

function motSimple(id: string, mot: string) {
	return {
		id,
		mot,
		entourage: [],
		atelierFait: true,
		validation: { motCache: false, tuiles: false, dictee: false },
		revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
		origine: 'liste',
	};
}

const SEED_DEUX_PROFILS = {
	profils: {
		list: [
			{ uuid: PROFIL_A, name: 'Profil A', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' },
			{ uuid: PROFIL_B, name: 'Profil B', emoji: '🐨', updatedAt: 1, niveauReference: 'ce2' },
		],
		active: PROFIL_A,
	},
	// A : « abricot » référencé par une liste (non orphelin), « brioche » orphelin seul.
	orthoA: {
		banque: { wa1: motSimple('wa1', 'abricot'), wa2: motSimple('wa2', 'brioche') },
		listes: [{ id: 'l-a', label: 'Fruits', motIds: ['wa1'], createdAt: 1, updatedAt: 1 }],
		motIdParForme: { abricot: 'wa1', brioche: 'wa2' },
	},
	// B : même forme (1 mot en liste + 1 orphelin), contenu totalement distinct de A.
	orthoB: {
		banque: { wb1: motSimple('wb1', 'canard'), wb2: motSimple('wb2', 'dauphin') },
		listes: [{ id: 'l-b', label: 'Animaux', motIds: ['wb1'], createdAt: 1, updatedAt: 1 }],
		motIdParForme: { canard: 'wb1', dauphin: 'wb2' },
	},
};

test('volet « Mots » : changer de profil consulté remet la vue à plat (recherche, filtre, dépliage)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	// `addInitScript` sérialise la fonction pour l'exécuter dans la page : elle ne peut fermer
	// sur AUCUNE variable Node externe (PROFIL_A/PROFIL_B compris) — tout doit venir de `seed`.
	await page.addInitScript((seed) => {
		localStorage.setItem('ludaskia_profiles', JSON.stringify(seed.profils));
		localStorage.setItem(
			`${seed.profils.list[0].uuid}/ludaskia_ortho`,
			JSON.stringify(seed.orthoA),
		);
		localStorage.setItem(
			`${seed.profils.list[1].uuid}/ludaskia_ortho`,
			JSON.stringify(seed.orthoB),
		);
	}, SEED_DEUX_PROFILS);
	await gotoHash(page, 'encadrant');
	await basculeVers(page, 'mots');

	const sel = page.locator('#encConsulteSel');
	await expect(sel).toHaveValue(PROFIL_A);

	// Sur le profil A : poser une recherche, puis (après l'avoir vidée) le filtre orphelins.
	const rech = page.locator('#encBanqueRech');
	await rech.fill('abri');
	await expect(page.locator('.enc-banque-item')).toHaveCount(1);
	await rech.fill('');
	const btnOrphelins = page.locator('[data-act="banque-orphelins"]');
	await btnOrphelins.click();
	await expect(btnOrphelins).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.enc-banque-item')).toHaveCount(1); // seule « brioche » est orpheline

	// Basculer vers le profil B via le sélecteur « Vous consultez ».
	await sel.selectOption(PROFIL_B);
	await expect(sel).toHaveValue(PROFIL_B);

	// Le volet « Mots » du second repart propre : champ vide, filtre relâché, liste COMPLÈTE
	// (et non celle, tronquée, qu'on regardait chez A).
	await expect(page.locator('#encBanqueRech')).toHaveValue('');
	await expect(page.locator('[data-act="banque-orphelins"]')).toHaveAttribute(
		'aria-pressed',
		'false',
	);
	await expect(page.locator('.enc-banque-item')).toHaveCount(2);
	await expect(page.locator('.enc-banque-item').filter({ hasText: 'canard' })).toBeVisible();
	await expect(page.locator('.enc-banque-item').filter({ hasText: 'dauphin' })).toBeVisible();
	await expect(page.locator('.enc-banque-item').filter({ hasText: 'abricot' })).toHaveCount(0);
	await expect(page.locator('#encBanqueResume')).toHaveText('2 mots affichés sur 2.');

	expect(errors).toEqual([]);
});

/* Pagination à 50 (SC 2.4.1, #496) : au-delà, un bouton « Afficher les N mots suivants »
   évite à un utilisateur clavier de traverser des centaines de boutons Supprimer pour
   atteindre la section suivante. Seed généré (52 mots list-only, tous absents des dictées
   prédéfinies par construction du préfixe) : dédié à CE test, pas mêlé au petit seed des
   tests ci-dessus. */
const N_PAGINATION = 52;
const PAGE_SIZE = 50; // observable via le rendu (bouton « Afficher les N suivants »)

function seedGrandeBanque(n: number): {
	banque: Record<string, unknown>;
	listes: unknown[];
	motIdParForme: Record<string, string>;
} {
	const banque: Record<string, unknown> = {};
	const motIdParForme: Record<string, string> = {};
	for (let i = 1; i <= n; i++) {
		const id = `p${i}`;
		const mot = `motpagin${String(i).padStart(3, '0')}`;
		banque[id] = {
			id,
			mot,
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		};
		motIdParForme[mot] = id;
	}
	return { banque, listes: [], motIdParForme };
}

test('volet « Mots » : au-delà de 50 mots, « Afficher les mots suivants » déplie le reste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, seedGrandeBanque(N_PAGINATION));
	await gotoHash(page, 'encadrant');
	await basculeVers(page, 'mots');

	await expect(page.locator('.enc-banque-item')).toHaveCount(PAGE_SIZE);
	// Résumé tronqué : le compte annoncé est celui RÉELLEMENT affiché (troncature comprise),
	// pas le total filtré — sinon la phrase se contredirait elle-même (#496, corrigé :
	// `texteResume` calcule maintenant `Math.min(filtres.length, limite)` en un seul point).
	await expect(page.locator('#encBanqueResume')).toHaveText(
		`${PAGE_SIZE} mots affichés sur ${N_PAGINATION}. Les premiers seulement sont listés.`,
	);
	const btnPlus = page.locator('[data-act="banque-plus"]');
	await expect(btnPlus).toHaveText(`Afficher les ${N_PAGINATION - PAGE_SIZE} mots suivants`);

	await btnPlus.click();

	await expect(page.locator('.enc-banque-item')).toHaveCount(N_PAGINATION);
	await expect(btnPlus).toHaveCount(0);
	await expect(page.locator('#encBanqueResume')).toHaveText(
		`${N_PAGINATION} mots affichés sur ${N_PAGINATION}.`,
	);

	expect(errors).toEqual([]);
});

/* Bonus (#496) : côté enfant, le formulaire d'édition d'une liste propose de
   supprimer pour de bon un mot qui vient d'en être retiré et qui n'est plus
   référencé par aucune liste — jusque dans la banque de l'espace encadrant.
   Seed dédié (2 mots dans la liste, tous deux absents des dictées
   prédéfinies) : en retirer un seul laisse l'autre dans le formulaire,
   évitant l'alerte « Écris au moins un mot » à l'enregistrement. */
const SEED_LISTE_2_MOTS = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'framboise',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		w4: {
			id: 'w4',
			mot: 'chien',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{ id: LISTE_ID, label: 'Ma liste maison', motIds: ['w1', 'w4'], createdAt: 1, updatedAt: 1 },
	],
	motIdParForme: { framboise: 'w1', chien: 'w4' },
};

test('formulaire de liste (enfant) : un mot retiré et devenu orphelin propose sa suppression définitive, répercutée dans la banque', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_LISTE_2_MOTS);
	await gotoHash(page, 'ortho-edit-' + LISTE_ID);

	const rows = page.locator('.ortho-row-wrap');
	await expect(rows).toHaveCount(3); // framboise, chien, ligne vide finale
	await expect(page.locator('.ortho-mot').nth(0)).toHaveValue('framboise');
	await expect(page.locator('.ortho-mot').nth(1)).toHaveValue('chien');

	// Retirer « framboise » (1re ligne) ; « chien » reste dans le formulaire.
	await rows.nth(0).locator('.ortho-row-del').click();
	await expect(rows).toHaveCount(2);
	await expect(page.locator('.ortho-mot').nth(0)).toHaveValue('chien');

	await page.locator('#orthoSave').click();

	// « framboise » n'est plus référencé par aucune liste : modale de suppression définitive.
	// Le refus s'appelle désormais « Non, je garde » (invariable, cohérent avec le reste de
	// l'appli, y compris la suppression de liste plus bas dans ce même fichier source).
	await expect(page.locator(`${uiModalOverlay} .modal-title`)).toHaveText(
		'Supprimer aussi ce mot ?',
	);
	await expect(page.locator(`${uiModalOverlay} .modal-msg`)).toContainText('framboise');
	await expect(page.locator(`${uiModalOverlay} .modal-ok`)).toHaveText('Non, je garde');
	await page.locator(`${uiModalOverlay} .modal-danger`).click();

	// Retour à la catégorie Orthographe (enregistrement effectué).
	await expect(page.locator('.cat-rubrique').first()).toBeVisible();

	// Bascule vers l'espace encadrant SANS rechargement complet (hashchange applicatif,
	// pas de nouvelle navigation) : un `page.goto`/`gotoHash` ré-exécuterait les scripts
	// d'amorçage de la page et re-seederait localStorage, effaçant la suppression qu'on
	// vient de vérifier.
	await page.evaluate(() => {
		location.hash = 'encadrant';
	});
	await basculeVers(page, 'mots');

	// « framboise » a bien disparu de la banque ; « chien » y est toujours (dans la liste).
	await expect(page.locator('.enc-banque-item')).toHaveCount(1);
	await expect(page.locator('.enc-banque-item').filter({ hasText: 'chien' })).toBeVisible();
	await expect(page.locator('.enc-banque-item').filter({ hasText: 'framboise' })).toHaveCount(0);

	expect(errors).toEqual([]);
});
