/* ============================================================
   Séance partagée (#734), côté ENCADRANT : suite de `partage-encadrant.spec.ts`.
   Chemins visibles relevés par les relecteurs : bilan favori, changement de profil
   consulté, validation du libellé, retrait d'un envoi de la liste, « Voir le suivi »,
   bascule du panneau d'import, et absence d'accueil par-dessus un lien partagé (43).

   Les libellés cités entre guillemets sont des noms accessibles ou des intitulés du
   contrat d'écran : ils sont l'objet du test là où ils apparaissent.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { gotoHash, watchErrors } from './helpers';
import { codeDe, codeResultatDe, envoiFiche, LECON_A } from './partage-fixtures';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/* Leçon CM1 seulement : absente d'un envoi au niveau CE2. */
const LECON_CM1 = 'num-chiffres-romains';

const stockage = (page: Page) =>
	page.evaluate(() =>
		JSON.stringify(
			Object.keys(localStorage)
				.sort()
				.map((k) => [k, localStorage.getItem(k)]),
		),
	);

interface FavoriSeed {
	id: string;
	label: string;
	lessonIds: string[];
	questionsPerLesson: number | 'all';
	mode?: 'bilan' | 'sprint';
}

interface ProfilSeed {
	uuid: string;
	name: string;
	favoris?: FavoriSeed[];
}

/** Profils (tous en CE2) et leurs favoris, posés à chaque chargement avant l'app. */
function seedProfils(profils: ProfilSeed[], actif: string): string {
	const donnees = {
		profils: {
			list: profils.map((p) => ({
				uuid: p.uuid,
				name: p.name,
				emoji: '🦊',
				updatedAt: 1,
				niveauReference: 'ce2',
			})),
			active: actif,
		},
		bilans: Object.fromEntries(profils.filter((p) => p.favoris).map((p) => [p.uuid, p.favoris])),
	};
	return `(() => {
	  const d = ${JSON.stringify(donnees)};
	  localStorage.setItem('ludaskia_profiles', JSON.stringify(d.profils));
	  localStorage.removeItem('ludaskia_encadrant_lock');
	  Object.keys(d.bilans).forEach((u) => localStorage.setItem(u + '/ludaskia_bilans', JSON.stringify(d.bilans[u])));
	})();`;
}

const SEED_DEUX_PROFILS = `(() => {
  if (localStorage.getItem('ludaskia_profiles')) return;
  localStorage.setItem('ludaskia_profiles', JSON.stringify({
    list: [
      { uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'ce2' },
      { uuid: 'lea', name: 'Léa', emoji: '\\uD83D\\uDC31', updatedAt: 1, niveauReference: 'ce2' },
    ],
    active: 'e2e',
  }));
})();`;

async function ouvrirBilanFavori(page: Page) {
	await gotoHash(page, 'encadrant/envois');
	await page.locator('button[data-act="envoi-source"][data-source="bilan"]').click();
	await page.locator('button[data-act="envoi-bilan"][data-bilan="favori"]').click();
}

const optionsFavoris = (page: Page) =>
	page.locator('select#envoiFavori option').evaluateAll((os) => os.map((o) => o.textContent));

/* ============================================================
   1. Bilan favori
   ============================================================ */

test('bilan favori : une leçon absente au niveau choisi est signalée, et le lien se crée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(
		seedProfils(
			[
				{
					uuid: 'fav',
					name: 'Favori',
					favoris: [
						{
							id: 'f1',
							label: 'Mon bilan mixte',
							lessonIds: [LECON_A, LECON_CM1],
							questionsPerLesson: 3,
							mode: 'bilan',
						},
					],
				},
			],
			'fav',
		),
	);
	await ouvrirBilanFavori(page);

	await expect(page.locator('select#envoiFavori')).toBeVisible();
	expect(await optionsFavoris(page)).toEqual(['Mon bilan mixte']);
	await expect(page.locator('#envoiFavoriAucun')).toHaveCount(0);
	// L'exigence : l'adulte est prévenu qu'une leçon manque à l'envoi (pas la formulation exacte).
	await expect(page.locator('.enc-envoi-choix')).toContainText(/pas dans l.envoi/);

	await page.locator('button#envoiCreer').click();
	await expect(page.locator('#envoiCree')).toBeVisible();
	await expect(page.locator('input#envoiLien')).toHaveValue(/#envoi\/[A-Za-z0-9_-]+$/);
	// L'envoi ne contient bien qu'une leçon : celle qui existe en CE2.
	await expect(page.locator('#envoisListe li.enc-envoi')).toContainText(/\b1 leçon\b/);
	expect(errors).toEqual([]);
});

for (const [titre, favoris] of [
	['sans favori', undefined],
	[
		'avec seulement un favori sprint',
		[
			{
				id: 's1',
				label: 'Mon sprint',
				lessonIds: [LECON_A],
				questionsPerLesson: 3,
				mode: 'sprint',
			},
		],
	],
] as [string, FavoriSeed[] | undefined][]) {
	test(`bilan favori : profil ${titre} → message « aucun », pas de liste`, async ({ page }) => {
		const errors = watchErrors(page);
		await page.addInitScript(seedProfils([{ uuid: 'sans', name: 'Sans', favoris }], 'sans'));
		await ouvrirBilanFavori(page);

		await expect(page.locator('#envoiFavoriAucun')).toBeVisible();
		await expect(page.locator('select#envoiFavori')).toHaveCount(0);
		expect(errors).toEqual([]);
	});
}

/* ============================================================
   2. Changer de profil consulté
   ============================================================ */

test('profil consulté : changer de profil change les favoris proposés', async ({ page }) => {
	const errors = watchErrors(page);
	const fav = (id: string, label: string): FavoriSeed => ({
		id,
		label,
		lessonIds: [LECON_A],
		questionsPerLesson: 3,
		mode: 'bilan',
	});
	await page.addInitScript(
		seedProfils(
			[
				{ uuid: 'pa', name: 'Alice', favoris: [fav('a1', 'Bilan de Alice')] },
				{ uuid: 'pb', name: 'Bruno', favoris: [fav('b1', 'Bilan de Bruno')] },
			],
			'pa',
		),
	);
	await ouvrirBilanFavori(page);
	expect(await optionsFavoris(page)).toEqual(['Bilan de Alice']);

	await page.locator('#encConsulteSel').selectOption('pb');
	await expect(page.locator('#encConsulteSel')).toHaveValue('pb');
	await expect(page.locator('select#envoiFavori option')).toHaveText(['Bilan de Bruno']);
	expect(errors).toEqual([]);
});

/* ============================================================
   3. Libellé
   ============================================================ */

test('libellé hors liste blanche : signalé à la frappe, refusé à la création avec un message', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/envois');
	await page.locator('button[data-act="envoi-source"][data-source="bilan"]').click();
	const libelle = page.locator('input#envoiLibelle');
	const erreur = page.locator('#envoiErreur');

	await libelle.fill('<b>Fiche</b>');
	await expect(libelle).toHaveAttribute('aria-invalid', 'true');
	await expect(erreur).toHaveText(''); // rien n'est annoncé pendant la frappe
	await page.locator('button#envoiCreer').click();
	await expect(erreur).toHaveText(/\S/);
	await expect(page.locator('#envoiCree')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('libellé vidé : pas signalé pendant la frappe, mais la création est refusée avec un message', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/envois');
	await page.locator('button[data-act="envoi-source"][data-source="bilan"]').click();
	const libelle = page.locator('input#envoiLibelle');
	const erreur = page.locator('#envoiErreur');

	await expect(libelle).not.toHaveValue(''); // prérempli : le vidage est bien un geste
	await libelle.fill('');
	await expect(libelle).not.toHaveAttribute('aria-invalid', /.*/);
	await expect(erreur).toHaveText('');
	await page.locator('button#envoiCreer').click();
	await expect(erreur).toHaveText(/\S/);
	await expect(page.locator('#envoiCree')).toHaveCount(0);
	expect(errors).toEqual([]);
});

/* ============================================================
   4. Retirer de la liste
   ============================================================ */

test('retirer un envoi : confirmation, annonce, focus sur le voisin puis sur le titre, persiste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	for (const nom of ['Bilan un', 'Bilan deux']) {
		await gotoHash(page, 'encadrant/envois');
		await page.locator('button[data-act="envoi-source"][data-source="bilan"]').click();
		await page.locator('input#envoiLibelle').fill(nom);
		await page.locator('button#envoiCreer').click();
		await expect(page.locator('#envoiCree')).toBeVisible();
	}
	const lignes = page.locator('#envoisListe li.enc-envoi');
	await expect(lignes).toHaveCount(2);
	const ids = await lignes.evaluateAll((ls) => ls.map((l) => (l as HTMLElement).dataset.id!));
	const noms = await lignes.locator('.enc-envoi-titre').allTextContents();
	const modale = page.locator('.modal-overlay:not([id])');
	const retirer = (nom: string) =>
		page.getByRole('button', { name: `Retirer de la liste : ${nom}` });

	// « Garder » annule : rien ne bouge.
	await retirer(noms[0]).click();
	await expect(modale).toBeVisible();
	await modale.getByRole('button', { name: 'Garder', exact: true }).click();
	await expect(modale).toHaveCount(0);
	await expect(lignes).toHaveCount(2);

	// Confirmer : la ligne part, l'annonce nomme l'envoi, le focus va au voisin.
	await retirer(noms[0]).click();
	await modale.getByRole('button', { name: 'Retirer de la liste', exact: true }).click();
	await expect(lignes).toHaveCount(1);
	await expect(page.locator('#envoisListe')).not.toContainText(noms[0]);
	await expect(page.locator('#envoisStatut')).toContainText(noms[0]);
	await expect(page.locator(`li[data-id="${ids[1]}"] [data-act="envoi-oublier"]`)).toBeFocused();

	await page.reload({ waitUntil: 'networkidle' });
	await expect(lignes).toHaveCount(1);
	await expect(lignes).toContainText(noms[1]);

	// Le dernier : plus de voisin, le focus va au titre de la liste.
	await retirer(noms[1]).click();
	await modale.getByRole('button', { name: 'Retirer de la liste', exact: true }).click();
	await expect(lignes).toHaveCount(0);
	await expect(page.locator('#envoisTitre')).toBeFocused();
	await page.reload({ waitUntil: 'networkidle' });
	await expect(lignes).toHaveCount(0);
	expect(errors).toEqual([]);
});

/* ============================================================
   5. « Voir le suivi » ouvre le profil importé
   ============================================================ */

test('« Voir le suivi » : l’espace s’ouvre sur le profil importé, pas sur le profil actif', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_DEUX_PROFILS);
	await gotoHash(page, `resultat/${await codeResultatDe({ pseudo: 'Léa' })}`);
	await page.locator('button#resultatImporter').click();
	await expect(page.locator('input[name="resultatCible"][value="lea"]')).toBeChecked();
	await page.locator('button#resultatConfirmer').click();
	await page.locator('a#resultatVoirSuivi').click();

	await expect(page.locator('#encConsulteSel')).toHaveValue('lea');
	expect(errors).toEqual([]);
});

test('« Voir le suivi » : après création d’un nouveau profil, c’est lui qui est consulté', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_DEUX_PROFILS);
	await gotoHash(page, `resultat/${await codeResultatDe({ pseudo: 'Zoé' })}`);
	await page.locator('button#resultatImporter').click();
	await page.locator('input[name="resultatCible"][value="nouveau"]').check();
	await page.locator('button#resultatConfirmer').click();
	await page.locator('a#resultatVoirSuivi').click();

	const sel = page.locator('#encConsulteSel');
	await expect(sel).toBeVisible();
	await expect(sel.locator('option:checked')).toContainText('Zoé');
	await expect(sel).not.toHaveValue('e2e');
	expect(errors).toEqual([]);
});

/* ============================================================
   6. « Ajouter au suivi d'un profil » : une vraie bascule
   ============================================================ */

test('bouton « Ajouter au suivi » : un second clic referme le panneau d’import', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, `resultat/${await codeResultatDe()}`);
	const bouton = page.locator('button#resultatImporter');

	await expect(bouton).toHaveAttribute('aria-expanded', 'false');
	await bouton.click();
	await expect(bouton).toHaveAttribute('aria-expanded', 'true');
	await expect(page.locator('#resultatImport')).toBeVisible();
	await bouton.click();
	await expect(bouton).toHaveAttribute('aria-expanded', 'false');
	await expect(page.locator('#resultatImport')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('bouton « Ajouter au suivi » avec code d’accès : un second clic referme la demande du code', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'encadrant/reglages');
	await page.evaluate(() => localStorage.removeItem('ludaskia_encadrant_lock'));
	await gotoHash(page, 'encadrant/reglages');
	await page.locator('[data-act="pin-activer"]').click();
	for (const d of ['1', '2', '3', '4']) await page.locator(`.kp-key[data-d="${d}"]`).click();
	await page.locator('[data-act="secret-conserve"]').click();
	await page.locator('[data-act="pin-terminer"]').click();
	await expect(page.locator('select[data-act="set-niveau-ref"]')).toBeVisible();

	await gotoHash(page, `resultat/${await codeResultatDe()}`);
	await page.reload({ waitUntil: 'networkidle' }); // mémoire vidée : session verrouillée
	const bouton = page.locator('button#resultatImporter');
	await bouton.click();
	await expect(bouton).toHaveAttribute('aria-expanded', 'true');
	await expect(page.locator('#resultatPin')).toBeVisible();
	await bouton.click();
	await expect(bouton).toHaveAttribute('aria-expanded', 'false');
	await expect(page.locator('#resultatPin')).toHaveCount(0);
	expect(errors).toEqual([]);
});

/* ============================================================
   7. Pas d'accueil par-dessus un lien partagé (critère 43)
   ============================================================ */

/* `gotoHash` complète toujours `niveauReference` : pour tester le cas « profil sans classe »,
   on retire la classe APRÈS lui (un script d'initialisation ajouté ensuite s'exécute après),
   puis on charge à froid par un changement de hash suivi d'un rechargement. Le script garde
   aussi l'état du stockage tel qu'il est à l'instant où l'appli démarre. */
const SANS_CLASSE = `(() => {
  const m = JSON.parse(localStorage.getItem('ludaskia_profiles'));
  m.list.forEach((p) => { delete p.niveauReference; });
  localStorage.setItem('ludaskia_profiles', JSON.stringify(m));
  window.__avant = JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));
})();`;

async function chargerSansClasse(page: Page, hash: string) {
	await page.evaluate((h) => {
		location.hash = h;
	}, hash);
	await page.reload({ waitUntil: 'networkidle' });
}

const cas: [string, () => Promise<string>, string][] = [
	['#resultat/<code>', async () => `resultat/${await codeResultatDe()}`, '#resultatTitre'],
	['#envoi/<code>', async () => `envoi/${await codeDe(envoiFiche())}`, '#partageAccueil'],
];

for (const [nom, hash, ecran] of cas) {
	test(`43 · profil sans classe + lien ${nom} à froid : aucune modale, stockage inchangé`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await gotoHash(page, 'accueil');
		await page.addInitScript(SANS_CLASSE);

		// Témoin : sans lien partagé, ce même profil voit bien la modale de choix de classe.
		await chargerSansClasse(page, 'accueil');
		await expect(page.locator('#onboardingNiveau')).toBeVisible();

		await chargerSansClasse(page, await hash());
		await expect(page.locator(ecran)).toBeVisible();
		await expect(page.locator('#onboardingNiveau')).toHaveCount(0);
		await expect(page.locator('.modal-overlay:visible')).toHaveCount(0);
		const avant = await page.evaluate(() => (window as unknown as { __avant: string }).__avant);
		expect(await stockage(page)).toBe(avant);
		expect(errors).toEqual([]);
	});
}
