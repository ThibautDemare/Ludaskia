/* ============================================================
   Édition d'un bilan favori depuis l'espace encadrant (#778) — smoke tests e2e.
   ------------------------------------------------------------
   Écrite AVANT l'implémentation, depuis les critères GELÉS de l'issue (numéros
   repris dans les titres : un échec dit quel critère n'est pas tenu). La partie
   purement logique est tenue par `tests/edition-favori.test.ts`.

   Critères couverts : 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 (création ET édition),
   13, 14, 15, 16. Non couvert : « changer de profil depuis la barre du composeur
   pendant l'édition » (critère 6, sa moitié la plus dure) : aucun sélecteur de cette
   barre n'est fixé par le contrat ; on tient ici le cas « actif ≠ consulté ».

   ROUGE à l'écriture : tout ce qui exige le crayon, l'éditeur, le repère Sprint et la
   reprise abandonnée (1-12, 14 hors partie vide, 15). VERTS d'emblée (comportement
   déjà vrai) : 13 (aucun bouton de modification côté enfant), 16 (« Garder pour
   plus tard » crée déjà un nouveau favori), et la moitié « direct, sans passer par le
   crayon » du 14 (il n'y a pas encore de route `bilan-edit`). Leur mutation de
   falsifiabilité est écrite sur chaque test.

   Contrat d'écran (fixé par l'orchestrateur) :
   - crayon `button[data-act="seance-favori-edit"][data-id]` dans `.enc-favori-gere`,
     nom accessible « Modifier le bilan favori <nom> » (c'est LE libellé qui est
     l'objet du critère 1 : la chaîne est intentionnelle) ;
   - le crayon mène au hash `bilan-edit`, le favori édité est tenu en mémoire ;
   - formulaire `#bilanConfigForm[data-edition]`, titre `.bc-edit-title` (nom du favori
     + prénom du propriétaire), `#bcLabel` visible et pré-rempli ;
   - boutons : `#bcUpdate`, `#bcCancel`, `#bcPrint` présents ; `#bcRun`, `#bcSave` absents ;
   - après `#bcUpdate`/`#bcCancel` : retour à `#encadrant…` sur le profil propriétaire ;
   - repère Sprint : `.bc-hors-sprint` (« pas en sprint ») dans le `label.bc-item` des
     leçons non jouables, visible seulement si le mode Sprint est coché ; refus dans
     `#bcErr` si aucune leçon cochée n'est jouable ;
   - reprise : `uiConfirm` avant `#bcUpdate` si le contenu change ET qu'une reprise
     `bilan-favori-<id>` existe chez le propriétaire.

   Choix de semis de la reprise (critère 9) : SEMIS DIRECT de `<uuid>/ludaskia_resume`,
   pas une partie réellement jouée. #777 refait le déroulé du bilan : jouer une partie
   dans ce test casserait à sa fusion pour une raison sans rapport avec #778. Le
   contrat que #778 consomme est la clé `bilan-favori-<id>` + le format versionné
   validé par `core/resume.ts` (grille minimale, `version: 1`) : si ce format évolue,
   une reprise invalide serait purgée à la lecture et le test rougirait (visible).
   Les assertions portent sur la PRÉSENCE de la clé, pas sur le contenu de l'instantané.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;
const uiModalOverlay = '.modal-overlay:not([id])';
const FORM = '#bilanConfigForm[data-edition]';

const PROFIL_A = 'e2e-a';
const PROFIL_B = 'e2e-b';
const PROFILS = {
	list: [
		{ uuid: PROFIL_A, name: 'Profil A', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' },
		{ uuid: PROFIL_B, name: 'Profil B', emoji: '🐨', updatedAt: 1, niveauReference: 'ce2' },
	],
	active: PROFIL_A,
};

/* Leçons choisies pour leur comportement en sprint (vérifié dans src/core/catalog.ts) :
   - jouables : `math-doubles`, `math-complements` (catégorie `math-calcul-mental`) ;
   - NON jouables : un problème (`excludeFromSprint`) et un « Clique sur… ». */
const JOUABLE = 'math-doubles';
const JOUABLE_2 = 'math-complements';
const CAT_MATH = 'math-calcul-mental';
const PROBLEME = 'math-prob-composition';
const CLIQUE = 'fr-gram-clic-verbe';

interface Favori {
	id: string;
	label: string;
	lessonIds: string[];
	questionsPerLesson: number | 'all';
	mode: 'bilan' | 'sprint';
	categoryId?: string;
}

function favori(id: string, label: string, over: Partial<Favori> = {}): Favori {
	return { id, label, lessonIds: [JOUABLE_2], questionsPerLesson: 3, mode: 'bilan', ...over };
}

/* Instantané de reprise minimal mais VALIDE (cf. `normaliser`, core/resume.ts). */
function reprise(key: string, label: string): Record<string, unknown> {
	return {
		kind: 'grille',
		version: 1,
		key,
		savedAt: Date.now(),
		mode: 'custom',
		label,
		icon: 'bookmark',
		categoryId: null,
		relaunch: { type: 'bilan', config: favori('x', label) },
		total: 3,
		answered: 1,
		sheetsHTML: '<div></div>',
		items: {},
		answers: { a: '1' },
		activeId: null,
		elapsedMs: 1000,
	};
}

/* Semis idempotent : `addInitScript` rejoue à CHAQUE chargement (reload compris) et
   écraserait ce que l'app vient d'écrire. Le drapeau en sessionStorage (propre à
   l'onglet, survit au reload) n'amorce qu'une fois. */
async function semer(page: Page, entrees: Record<string, unknown>): Promise<void> {
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript((e) => {
		if (sessionStorage.getItem('seed778')) return;
		sessionStorage.setItem('seed778', '1');
		for (const [k, v] of Object.entries(e)) localStorage.setItem(k, JSON.stringify(v));
	}, entrees);
}

async function semerDeuxProfils(page: Page, entrees: Record<string, unknown>): Promise<void> {
	await semer(page, { ludaskia_profiles: PROFILS, ...entrees });
}

const lire = (page: Page, cle: string) => page.evaluate((k) => localStorage.getItem(k), cle);

async function lireListe(page: Page, cle: string): Promise<Favori[]> {
	return JSON.parse((await lire(page, cle)) ?? '[]') as Favori[];
}

const crayon = (page: Page, id: string) =>
	page.locator(`button[data-act="seance-favori-edit"][data-id="${id}"]`);

/* Espace encadrant, onglet Programme, jusqu'à l'éditeur ouvert par le crayon. */
async function ouvrirEdition(page: Page, id: string, consulte?: string): Promise<void> {
	await gotoHash(page, 'encadrant/programme');
	if (consulte) await page.locator('#encConsulteSel').selectOption(consulte);
	await crayon(page, id).click();
	await expect(page.locator(FORM)).toBeVisible();
}

/* Les volets matière sont repliés par défaut : on les ouvre pour agir ou mesurer. */
async function ouvrirVolets(page: Page): Promise<void> {
	await page
		.locator('details.bc-subject')
		.evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
}

async function choisirLecons(page: Page, ids: string[]): Promise<void> {
	await page.locator('#bcSelectNone').click();
	await ouvrirVolets(page);
	for (const id of ids) await page.locator(`.bc-lesson-check[value="${id}"]`).check();
}

/* Les radios sont masqués visuellement (état porté par la carte) : on clique le label. */
async function choisirMode(page: Page, mode: 'bilan' | 'sprint'): Promise<void> {
	await page
		.locator('.bc-mode-item', { has: page.locator(`.bc-mode-radio[value="${mode}"]`) })
		.click();
}
async function choisirNbq(page: Page, v: string): Promise<void> {
	await page.locator('.bc-nbq-item', { has: page.locator(`.bc-nbq-radio[value="${v}"]`) }).click();
}

const horsSprint = (page: Page, id: string) =>
	page
		.locator('label.bc-item', { has: page.locator(`.bc-lesson-check[value="${id}"]`) })
		.locator('.bc-hors-sprint');

/* ---------- Critères 1, 4, 5 : crayon, titre, boutons ---------- */

test('critères 1, 4, 5 : crayon nommé, éditeur titré (favori + enfant), boutons Enregistrer/Annuler/Imprimer', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semerDeuxProfils(page, {
		[`${PROFIL_B}/ludaskia_bilans`]: [favori('fav-b1', 'Favori B1'), favori('fav-b2', 'Favori B2')],
	});
	await gotoHash(page, 'encadrant/programme');
	await page.locator('#encConsulteSel').selectOption(PROFIL_B);

	// 1 : un crayon par ligne, au nom accessible qui contient le nom du favori.
	await expect(page.locator('.enc-favori-gere button[data-act="seance-favori-edit"]')).toHaveCount(
		2,
	);
	const btn = page.getByRole('button', { name: 'Modifier le bilan favori Favori B1' });
	await expect(btn).toBeVisible();
	await btn.click();

	// Pleine page, par le hash `bilan-edit`.
	await expect(page).toHaveURL(/#bilan-edit$/);
	await expect(page.locator(FORM)).toBeVisible();

	// 4 : le titre nomme le favori ET l'enfant propriétaire (le profil actif est A).
	await expect(page.locator('.bc-edit-title')).toContainText('Favori B1');
	await expect(page.locator('.bc-edit-title')).toContainText('Profil B');

	// 5 : boutons d'édition présents, boutons de lancement/création absents.
	await expect(page.locator('#bcUpdate')).toBeVisible();
	await expect(page.locator('#bcCancel')).toBeVisible();
	await expect(page.locator('#bcPrint')).toBeVisible();
	await expect(page.locator('#bcRun')).toHaveCount(0);
	await expect(page.locator('#bcSave')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- Critère 2 : pré-remplissage ---------- */

test('critère 2 : l’éditeur est pré-rempli (nom, mode, leçons exactes, volets dépliés, compteurs)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semerDeuxProfils(page, {
		[`${PROFIL_B}/ludaskia_bilans`]: [
			favori('fav-b1', 'Favori B1', { lessonIds: [JOUABLE_2, JOUABLE], questionsPerLesson: 5 }),
		],
	});
	await ouvrirEdition(page, 'fav-b1', PROFIL_B);

	await expect(page.locator('#bcLabel')).toBeVisible();
	await expect(page.locator('#bcLabel')).toHaveValue('Favori B1');
	await expect(page.locator('.bc-mode-radio[value="bilan"]')).toBeChecked();
	await expect(page.locator('.bc-nbq-radio[value="5"]')).toBeChecked();

	// Exactement les leçons du favori sont cochées (ni plus, ni moins).
	const cochees = await page
		.locator('.bc-lesson-check:checked')
		.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).sort());
	expect(cochees).toEqual([JOUABLE, JOUABLE_2].sort());

	// Aucun volet replié ne cache une coche.
	const volets = await page.locator('details.bc-subject').evaluateAll((ds) =>
		ds.map((d) => ({
			open: (d as HTMLDetailsElement).open,
			coche: !!d.querySelector('.bc-lesson-check:checked'),
		})),
	);
	expect(volets.some((v) => v.coche)).toBe(true);
	expect(volets.filter((v) => v.coche).every((v) => v.open)).toBe(true);

	// Compteur « x/y » du volet Mathématiques : 2 coches (texte `aria-hidden`, lu tel quel).
	const compteur = page
		.locator('details.bc-subject', { hasText: 'Mathématiques' })
		.locator('.bc-subject-head .bc-group-count');
	await expect(compteur).toHaveText(/^\s*2\s*\/\s*\d+\s*$/);

	expect(errors).toEqual([]);
});

/* ---------- Critère 3 : toutes les matières, même pour un favori rattaché ---------- */

test('critère 3 : un favori rattaché à une catégorie peut recevoir une leçon d’une autre matière', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, {
		'e2e/ludaskia_bilans': [favori('fav-1', 'Rattaché', { categoryId: CAT_MATH })],
	});
	await ouvrirEdition(page, 'fav-1');

	expect(await page.locator('details.bc-subject').count()).toBeGreaterThanOrEqual(2);
	await ouvrirVolets(page);
	await page.locator(`.bc-lesson-check[value="${CLIQUE}"]`).check();
	await page.locator('#bcUpdate').click();

	await expect(page).toHaveURL(/#encadrant/);
	const l = await lireListe(page, 'e2e/ludaskia_bilans');
	expect(l).toHaveLength(1);
	expect(l[0].lessonIds).toEqual(expect.arrayContaining([JOUABLE_2, CLIQUE]));

	expect(errors).toEqual([]);
});

/* ---------- Critères 6, 15 : écriture chez le propriétaire, homonyme intact ---------- */

test('critères 6 et 15 : Enregistrer écrit chez le propriétaire (actif ≠ consulté), même id, retour sur lui, homonyme intact', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const bilansA = [favori('fav-b1', 'Homonyme A')]; // MÊME id que celui de B
	await semerDeuxProfils(page, {
		[`${PROFIL_A}/ludaskia_bilans`]: bilansA,
		[`${PROFIL_B}/ludaskia_bilans`]: [favori('fav-b1', 'Favori B1'), favori('fav-b2', 'Autre B')],
	});
	await gotoHash(page, 'encadrant/programme');
	const brutA = await lire(page, `${PROFIL_A}/ludaskia_bilans`);
	await ouvrirEdition(page, 'fav-b1', PROFIL_B);

	await choisirLecons(page, [JOUABLE, JOUABLE_2]);
	await choisirMode(page, 'sprint');
	await page.locator('#bcLabel').fill('Favori B1 modifié');
	await page.locator('#bcUpdate').click();

	// Retour à l'espace encadrant, sur le profil PROPRIÉTAIRE.
	await expect(page).toHaveURL(/#encadrant/);
	await expect(page.locator('#encConsulteSel')).toHaveValue(PROFIL_B);

	const b = await lireListe(page, `${PROFIL_B}/ludaskia_bilans`);
	expect(b).toHaveLength(2); // pas de doublon
	const modifie = b.find((x) => x.id === 'fav-b1');
	expect(modifie?.label).toBe('Favori B1 modifié');
	expect(modifie?.mode).toBe('sprint');
	expect([...(modifie?.lessonIds ?? [])].sort()).toEqual([JOUABLE, JOUABLE_2].sort());
	expect(b.find((x) => x.id === 'fav-b2')?.label).toBe('Autre B');

	// 15 : le favori homonyme du profil actif n'a pas bougé d'un octet.
	expect(await lire(page, `${PROFIL_A}/ludaskia_bilans`)).toBe(brutA);

	expect(errors).toEqual([]);
});

/* ---------- Critère 7 : rattachement recalculé ---------- */

test('critère 7 : un favori rattaché devenu multi-catégories quitte sa catégorie et reste sur l’accueil', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, {
		'e2e/ludaskia_bilans': [favori('fav-1', 'Devient multi', { categoryId: CAT_MATH })],
	});
	await gotoHash(page, `categorie-${CAT_MATH}`);
	await expect(
		page.locator('#catFavoris .favori-item', { hasText: 'Devient multi' }),
	).toBeVisible();

	await ouvrirEdition(page, 'fav-1');
	await ouvrirVolets(page);
	await page.locator(`.bc-lesson-check[value="${CLIQUE}"]`).check();
	await page.locator('#bcUpdate').click();
	await expect(page).toHaveURL(/#encadrant/);

	await gotoHash(page, `categorie-${CAT_MATH}`);
	await expect(page.locator('#catFavoris .favori-item', { hasText: 'Devient multi' })).toHaveCount(
		0,
	);
	await gotoHash(page, 'accueil');
	await expect(page.locator('#favoris .favori-item', { hasText: 'Devient multi' })).toBeVisible();

	expect(errors).toEqual([]);
});

test('critère 7 : un favori multi-catégories devenu mono-catégorie apparaît dans sa catégorie', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, {
		'e2e/ludaskia_bilans': [favori('fav-1', 'Devient mono', { lessonIds: [JOUABLE_2, CLIQUE] })],
	});
	await gotoHash(page, `categorie-${CAT_MATH}`);
	await expect(page.locator('#catFavoris .favori-item', { hasText: 'Devient mono' })).toHaveCount(
		0,
	);

	await ouvrirEdition(page, 'fav-1');
	await choisirLecons(page, [JOUABLE_2]);
	await page.locator('#bcUpdate').click();
	await expect(page).toHaveURL(/#encadrant/);

	await gotoHash(page, `categorie-${CAT_MATH}`);
	await expect(page.locator('#catFavoris .favori-item', { hasText: 'Devient mono' })).toBeVisible();

	expect(errors).toEqual([]);
});

/* ---------- Critère 8 : étape de programme conservée ---------- */

test('critère 8 : l’étape de programme qui visait le favori le vise toujours, et son détail suit le nouveau mode', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, {
		'e2e/ludaskia_bilans': [favori('fav-1', 'Favori Cible'), favori('fav-2', 'Favori Autre')],
		'e2e/ludaskia_seance': [
			{
				id: 'd1',
				etapes: [{ id: 'e1', kind: 'favori', refs: ['fav-1'], count: 1 }],
				recurrence: { type: 'hebdo', jours: [1, 2, 3, 4, 5, 6, 7] },
			},
		],
	});
	const coche = (p: Page) =>
		p.locator(
			'fieldset.enc-seance-favoris[data-def="d1"][data-etape="e1"] input[data-act="seance-favori-toggle"][data-ref="fav-1"]',
		);
	const detail = (p: Page) =>
		p
			.locator('fieldset.enc-seance-favoris[data-def="d1"][data-etape="e1"] label', {
				has: p.locator('input[data-ref="fav-1"]'),
			})
			.locator('.enc-seance-favori-detail');

	await gotoHash(page, 'encadrant/programme');
	await expect(coche(page)).toBeChecked();
	await expect(detail(page)).toContainText('Bilan');

	await ouvrirEdition(page, 'fav-1');
	await choisirLecons(page, [JOUABLE, JOUABLE_2]);
	await choisirMode(page, 'sprint');
	await page.locator('#bcUpdate').click();
	await expect(page).toHaveURL(/#encadrant/);

	await page.evaluate(() => {
		location.hash = '#encadrant/programme';
	});
	await expect(coche(page)).toBeChecked();
	// Libellé d'ISSUE (critère 8) : « Sprint 5 min · N leçons » ; la chaîne est voulue.
	await expect(detail(page)).toHaveText('Sprint 5 min · 2 leçons');

	expect(errors).toEqual([]);
});

/* ---------- Critère 9 : reprise du favori ---------- */

const CLE_REPRISE = 'bilan-favori-fav-b1';
const seedReprise = (): Record<string, unknown> => ({
	[`${PROFIL_B}/ludaskia_bilans`]: [favori('fav-b1', 'Favori B1')],
	[`${PROFIL_B}/ludaskia_resume`]: [
		reprise(CLE_REPRISE, 'Favori B1'),
		reprise('lecon-math-doubles', 'Les doubles'),
	],
});
const clesReprises = async (page: Page): Promise<string[]> =>
	(JSON.parse((await lire(page, `${PROFIL_B}/ludaskia_resume`)) ?? '[]') as { key: string }[]).map(
		(s) => s.key,
	);

test('critère 9 : changer le contenu avec une reprise en cours confirme d’abord ; annuler n’écrit rien ; confirmer abandonne la reprise', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semerDeuxProfils(page, seedReprise());
	await ouvrirEdition(page, 'fav-b1', PROFIL_B);
	expect(await clesReprises(page)).toContain(CLE_REPRISE);
	const brutBilans = await lire(page, `${PROFIL_B}/ludaskia_bilans`);

	await choisirNbq(page, '10'); // contenu modifié (questions par leçon)
	await page.locator('#bcUpdate').click();

	const modale = page.locator(uiModalOverlay);
	await expect(modale).toBeVisible();
	// Elle dit ce qui sera perdu : on exige un message non vide qui parle de perte/de
	// partie, pas une phrase exacte.
	await expect(modale.locator('.modal-msg')).toContainText(/perd|partie|réponse|commenc/i);
	// Titre validé en relecture (nomme l'enfant ET le bilan) : chaîne intentionnelle.
	await expect(modale.locator('.modal-title')).toHaveText(
		'Profil B a une partie en cours de « Favori B1 »',
	);

	// Annuler la confirmation (action SÛRE = bouton primaire) : rien n'est écrit.
	await modale.locator('.modal-ok').click();
	await expect(modale).toHaveCount(0);
	await expect(page.locator(FORM)).toBeVisible();
	expect(await lire(page, `${PROFIL_B}/ludaskia_bilans`)).toBe(brutBilans);
	expect(await clesReprises(page)).toContain(CLE_REPRISE);

	// Confirmer : enregistre ET supprime la reprise de CE favori, pas les autres.
	await page.locator('#bcUpdate').click();
	await page.locator(`${uiModalOverlay} .modal-danger, ${uiModalOverlay} .modal-secondary`).click();
	await expect(page).toHaveURL(/#encadrant/);
	const l = await lireListe(page, `${PROFIL_B}/ludaskia_bilans`);
	expect(l.find((x) => x.id === 'fav-b1')?.questionsPerLesson).toBe(10);
	const cles = await clesReprises(page);
	expect(cles).not.toContain(CLE_REPRISE);
	expect(cles).toContain('lecon-math-doubles');

	expect(errors).toEqual([]);
});

test('critère 9 (négatif) : un simple renommage ne demande rien et garde la reprise', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semerDeuxProfils(page, seedReprise());
	await ouvrirEdition(page, 'fav-b1', PROFIL_B);

	await page.locator('#bcLabel').fill('Nom changé');
	await page.locator('#bcUpdate').click();
	await expect(page).toHaveURL(/#encadrant/);
	await expect(page.locator(uiModalOverlay)).toHaveCount(0);

	const l = await lireListe(page, `${PROFIL_B}/ludaskia_bilans`);
	expect(l.find((x) => x.id === 'fav-b1')?.label).toBe('Nom changé');
	expect(await clesReprises(page)).toContain(CLE_REPRISE);

	expect(errors).toEqual([]);
});

/* ---------- Critère 10 : Annuler ---------- */

test('critère 10 : Annuler ramène à l’espace encadrant sur le profil consulté, sans rien écrire', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semerDeuxProfils(page, {
		[`${PROFIL_B}/ludaskia_bilans`]: [favori('fav-b1', 'Favori B1')],
	});
	await ouvrirEdition(page, 'fav-b1', PROFIL_B);
	const avantB = await lire(page, `${PROFIL_B}/ludaskia_bilans`);
	const avantA = await lire(page, `${PROFIL_A}/ludaskia_bilans`);

	await page.locator('#bcLabel').fill('Brouillon jeté');
	await choisirMode(page, 'sprint');
	await page.locator('#bcCancel').click();

	await expect(page).toHaveURL(/#encadrant/);
	await expect(page.locator('#encConsulteSel')).toHaveValue(PROFIL_B);
	expect(await lire(page, `${PROFIL_B}/ludaskia_bilans`)).toBe(avantB);
	expect(await lire(page, `${PROFIL_A}/ludaskia_bilans`)).toBe(avantA);

	expect(errors).toEqual([]);
});

/* ---------- Critère 11 : refus nom vide / aucune leçon ---------- */

test('critère 11 : nom vide ou aucune leçon cochée, l’enregistrement est refusé avec un message', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, { 'e2e/ludaskia_bilans': [favori('fav-1', 'Favori 1')] });
	await ouvrirEdition(page, 'fav-1');
	const avant = await lire(page, 'e2e/ludaskia_bilans');

	await page.locator('#bcLabel').fill('');
	await page.locator('#bcUpdate').click();
	await expect(page.locator('#bcErr')).not.toBeEmpty();
	await expect(page.locator(FORM)).toBeVisible();
	expect(await lire(page, 'e2e/ludaskia_bilans')).toBe(avant);

	await page.locator('#bcLabel').fill('Un nom');
	await page.locator('#bcSelectNone').click();
	await page.locator('#bcUpdate').click();
	await expect(page.locator('#bcErr')).not.toBeEmpty();
	await expect(page.locator(FORM)).toBeVisible();
	expect(await lire(page, 'e2e/ludaskia_bilans')).toBe(avant);

	expect(errors).toEqual([]);
});

/* ---------- Critère 12 : repère et refus Sprint ---------- */

for (const ecran of ['création', 'édition'] as const) {
	test(`critère 12 (${ecran}) : repère textuel « pas en sprint » visible seulement en mode Sprint`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await semer(page, {
			'e2e/ludaskia_bilans': [favori('fav-1', 'Favori 1', { lessonIds: [JOUABLE, PROBLEME] })],
		});
		if (ecran === 'création') await gotoHash(page, 'bilan-custom');
		else await ouvrirEdition(page, 'fav-1');
		await ouvrirVolets(page);

		// Tranquille (défaut) : aucun repère visible.
		await expect(page.locator('.bc-mode-radio[value="bilan"]')).toBeChecked();
		await expect(horsSprint(page, PROBLEME)).toBeHidden();
		await expect(horsSprint(page, CLIQUE)).toBeHidden();

		await choisirMode(page, 'sprint');
		for (const id of [PROBLEME, CLIQUE]) {
			await expect(horsSprint(page, id)).toBeVisible();
			await expect(horsSprint(page, id)).toContainText(/pas en sprint/i);
		}
		// Une leçon jouable n'a pas de repère.
		await expect(horsSprint(page, JOUABLE)).toHaveCount(0);

		// Retour en Tranquille : le repère disparaît.
		await choisirMode(page, 'bilan');
		await expect(horsSprint(page, PROBLEME)).toBeHidden();

		expect(errors).toEqual([]);
	});
}

test('critère 12 (création) : un Sprint sans leçon jouable est refusé (lancer ET garder), un Sprint mixte passe', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, { 'e2e/ludaskia_bilans': [] });
	await gotoHash(page, 'bilan-custom');
	await choisirLecons(page, [PROBLEME, CLIQUE]);
	await choisirMode(page, 'sprint');

	await page.locator('#bcRun').click();
	await expect(page.locator('#bcErr')).not.toBeEmpty();
	// Libellé validé en relecture : le refus offre une issue à l'enfant (chaîne intentionnelle).
	await expect(page.locator('#bcErr')).toContainText('ou choisis le mode Tranquille.');
	await expect(page).toHaveURL(/#bilan-custom$/);

	await page.locator('.bc-save summary').click();
	await page.locator('#bcLabel').fill('Sprint vide');
	await page.locator('#bcSave').click();
	await expect(page.locator('#bcErr')).not.toBeEmpty();
	expect(await lireListe(page, 'e2e/ludaskia_bilans')).toEqual([]);

	// Garde de non-sur-refus : une leçon jouable parmi les autres suffit.
	await page.locator(`.bc-lesson-check[value="${JOUABLE}"]`).check();
	await page.locator('#bcSave').click();
	await expect(page.locator('#bcSaved')).toContainText('Sprint vide');
	expect(await lireListe(page, 'e2e/ludaskia_bilans')).toHaveLength(1);

	expect(errors).toEqual([]);
});

test('critère 12 (édition) : un Sprint sans leçon jouable est refusé à l’enregistrement', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, {
		'e2e/ludaskia_bilans': [favori('fav-1', 'Favori 1', { lessonIds: [PROBLEME] })],
	});
	await ouvrirEdition(page, 'fav-1');
	const avant = await lire(page, 'e2e/ludaskia_bilans');

	await choisirMode(page, 'sprint');
	await page.locator('#bcUpdate').click();
	await expect(page.locator('#bcErr')).not.toBeEmpty();
	await expect(page.locator('#bcErr')).toContainText('ou choisis le mode Tranquille.');
	await expect(page.locator(FORM)).toBeVisible();
	expect(await lire(page, 'e2e/ludaskia_bilans')).toBe(avant);

	expect(errors).toEqual([]);
});

/* ---------- Critère 13 : rien côté enfant (VERT d'emblée) ---------- */

test('critère 13 : aucun bouton de modification sur les cartes favori (accueil et catégorie)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, {
		'e2e/ludaskia_bilans': [
			favori('fav-1', 'Favori Accueil', { lessonIds: [JOUABLE_2, CLIQUE] }),
			favori('fav-2', 'Favori Catégorie', { categoryId: CAT_MATH }),
		],
	});
	await gotoHash(page, 'accueil');
	const accueil = page.locator('#favoris .favori-item', { hasText: 'Favori Accueil' });
	await expect(accueil).toBeVisible();
	await expect(accueil.getByRole('button', { name: /modifier|éditer/i })).toHaveCount(0);
	await expect(page.locator('[data-act="seance-favori-edit"]')).toHaveCount(0);

	await gotoHash(page, `categorie-${CAT_MATH}`);
	const cat = page.locator('#catFavoris .favori-item', { hasText: 'Favori Catégorie' });
	await expect(cat).toBeVisible();
	await expect(cat.getByRole('button', { name: /modifier|éditer/i })).toHaveCount(0);
	await expect(page.locator('[data-act="seance-favori-edit"]')).toHaveCount(0);

	// VERT d'emblée. Ce qui le fait rougir : ajouter à `favoriItemHTML` (src/ui/bilan.ts) un
	// bouton « Modifier … » ou `data-act="seance-favori-edit"`. Mutation NON jouée : cet auteur
	// n'a pas le droit de toucher `src/` ; à jouer à la revue.
	expect(errors).toEqual([]);
});

/* ---------- Critère 14 : l'éditeur ne s'ouvre que par le crayon ---------- */

test('critère 14 : l’éditeur ne s’affiche ni en lien direct, ni après rechargement', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, { 'e2e/ludaskia_bilans': [favori('fav-1', 'Favori 1')] });

	// Lien direct, sans crayon : pas d'éditeur.
	await gotoHash(page, 'bilan-edit');
	await expect(page.locator(FORM)).toHaveCount(0);
	await expect(page.locator('#bcUpdate')).toHaveCount(0);

	// Par le crayon : l'éditeur s'ouvre (preuve que l'assertion ci-dessus n'est pas vacue)…
	await ouvrirEdition(page, 'fav-1');
	// …mais un rechargement le perd : la mémoire du favori ne survit pas, l'URL seule ne suffit pas.
	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.locator(FORM)).toHaveCount(0);
	await expect(page.locator('#bcUpdate')).toHaveCount(0);

	// Même la moitié « lien direct » est verte aujourd'hui (pas de route). Mutation qui la fait
	// rougir : router `bilan-edit` vers l'éditeur sans exiger un favori en mémoire.
	expect(errors).toEqual([]);
});

test('critère 14 : « Précédent » après Enregistrer ou Annuler ne rouvre pas l’éditeur', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, { 'e2e/ludaskia_bilans': [favori('fav-1', 'Favori 1')] });

	for (const action of ['#bcUpdate', '#bcCancel']) {
		await ouvrirEdition(page, 'fav-1');
		await page.locator(action).click();
		await expect(page).toHaveURL(/#encadrant/);
		await page.goBack();
		await expect(page.locator(FORM)).toHaveCount(0);
		await expect(page.locator('#bcUpdate')).toHaveCount(0);
	}

	expect(errors).toEqual([]);
});

/* ---------- Critère 16 : « Garder pour plus tard » crée toujours un NOUVEAU favori ---------- */

test('critère 16 : « Garder pour plus tard » ajoute un nouveau favori sans écraser l’existant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const existant = favori('fav-existant', 'Déjà là');
	await semer(page, { 'e2e/ludaskia_bilans': [existant] });

	// L'éditeur du favori existant a été OUVERT puis abandonné : c'est ce qui rend le test
	// capable de rougir si l'état d'édition fuit vers la création (cf. mutation ci-dessous).
	await ouvrirEdition(page, 'fav-existant');
	await page.locator('#bcCancel').click();
	await expect(page).toHaveURL(/#encadrant/);

	await gotoHash(page, 'bilan-custom');
	await choisirLecons(page, [JOUABLE]);
	await page.locator('.bc-save summary').click();
	await page.locator('#bcLabel').fill('Tout neuf');
	await page.locator('#bcSave').click();
	await expect(page.locator('#bcSaved')).toContainText('Tout neuf');

	const l = await lireListe(page, 'e2e/ludaskia_bilans');
	expect(l).toHaveLength(2);
	expect(new Set(l.map((x) => x.id)).size).toBe(2); // ids distincts
	expect(l.find((x) => x.id === 'fav-existant')).toMatchObject({
		label: 'Déjà là',
		lessonIds: [JOUABLE_2],
		mode: 'bilan',
		questionsPerLesson: 3,
	});
	expect(l.find((x) => x.label === 'Tout neuf')?.id).not.toBe('fav-existant');

	// VERT d'emblée. Ce qui le fait rougir (non jouée : `src/` interdit) : dans `genId()` ou à
	// l'appel `config.id = genId()` (src/ui/bilan.ts ~686), poser l'id du favori en cours
	// d'édition (`edition.favori.id`, bilan.ts ~381, ou l'`enCours.id` de bilan-edition.ts)
	// quand il reste en mémoire après Annuler. `saveBilan` fait alors un `bilans[idx] = config` :
	// la liste n'a plus qu'UN favori, « Déjà là » écrasé, et `toHaveLength(2)` échoue.
	expect(errors).toEqual([]);
});

/* ============================================================
   Passe 2 : correctifs validés en relecture (C2, C3, C4, S2) et critère 6 « profil
   ACTIF changé pendant l'édition ». C2, C3, C4 et S2 étaient ROUGES à l'écriture.
   ============================================================ */

const carte = (page: Page, id: string) => page.locator(`.enc-favori-gere[data-id="${id}"]`);
const crayonDe = (page: Page, id: string) =>
	carte(page, id).locator('[data-act="seance-favori-edit"]');
const annonceEnregistre = (page: Page) =>
	page.locator('[role="status"]', { hasText: /Bilan « .+ » enregistré\./ });

/* ---------- C2 : focus au retour ---------- */

for (const action of ['#bcUpdate', '#bcCancel'] as const) {
	test(`C2 : après ${action === '#bcUpdate' ? 'Enregistrer' : 'Annuler'}, le focus est sur le crayon du favori édité`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await semer(page, {
			'e2e/ludaskia_bilans': [favori('fav-1', 'Favori 1'), favori('fav-2', 'Favori 2')],
		});
		await ouvrirEdition(page, 'fav-2');
		await page.locator(action).click();
		await expect(page).toHaveURL(/#encadrant/);
		await expect(crayonDe(page, 'fav-2')).toBeFocused();
		expect(errors).toEqual([]);
	});
}

test('C2 (repli) : si le favori a disparu entre-temps, le focus va au titre « Bilans favoris de… »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, { 'e2e/ludaskia_bilans': [favori('fav-1', 'Favori 1')] });
	await ouvrirEdition(page, 'fav-1');
	// Le favori disparaît pendant l'édition (autre onglet, autre adulte) : plus de crayon à viser.
	await page.evaluate(() => localStorage.removeItem('e2e/ludaskia_bilans'));
	await page.locator('#bcCancel').click();
	await expect(page).toHaveURL(/#encadrant/);
	const titre = page.locator('.enc-seance-favoris-gestion h3');
	await expect(titre).toContainText('Bilans favoris de');
	await expect(titre).toBeFocused();
	expect(errors).toEqual([]);
});

/* ---------- C3 : annonce ---------- */

test('C3 : Enregistrer annonce « Bilan « <nom> » enregistré. » dans une région status ; Annuler n’annonce rien', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, { 'e2e/ludaskia_bilans': [favori('fav-1', 'Favori 1')] });

	await ouvrirEdition(page, 'fav-1');
	await page.locator('#bcCancel').click();
	await expect(page).toHaveURL(/#encadrant/);
	await expect(crayon(page, 'fav-1')).toBeVisible();
	await expect(annonceEnregistre(page)).toHaveCount(0);

	await crayon(page, 'fav-1').click();
	await expect(page.locator(FORM)).toBeVisible();
	await page.locator('#bcLabel').fill('Nom neuf');
	await page.locator('#bcUpdate').click();
	await expect(page).toHaveURL(/#encadrant/);
	// Texte EXACT voulu (relecture a11y) : c'est lui qui est annoncé au lecteur d'écran.
	await expect(annonceEnregistre(page)).toHaveText('Bilan « Nom neuf » enregistré.');

	expect(errors).toEqual([]);
});

/* ---------- C4 : erreur de nom ---------- */

const champNomInvalide = async (page: Page) => {
	await expect(page.locator('#bcLabel')).toBeFocused();
	await expect(page.locator('#bcLabel')).toHaveAttribute('aria-invalid', 'true');
	await expect(page.locator('#bcLabel')).toHaveAttribute('aria-describedby', /\bbcErr\b/);
};

test('C4 (édition) : nom vide, le focus va sur #bcLabel (aria-invalid, aria-describedby) ; le drapeau tombe avec un nom valide', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, { 'e2e/ludaskia_bilans': [favori('fav-1', 'Favori 1')] });
	await ouvrirEdition(page, 'fav-1');

	await page.locator('#bcLabel').fill('');
	await page.locator('#bcUpdate').click();
	await champNomInvalide(page);

	// Nom valide, mais un AUTRE refus (aucune leçon) : on reste sur l'écran, le nom n'est
	// plus signalé invalide.
	await page.locator('#bcLabel').fill('Un nom');
	await page.locator('#bcSelectNone').click();
	await page.locator('#bcUpdate').click();
	await expect(page.locator('#bcErr')).not.toBeEmpty();
	await expect(page.locator('#bcLabel')).not.toHaveAttribute('aria-invalid', /.*/);

	expect(errors).toEqual([]);
});

test('C4 (création) : « Garder pour plus tard » sans nom, focus sur #bcLabel invalide ; le drapeau tombe une fois enregistré', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, { 'e2e/ludaskia_bilans': [] });
	await gotoHash(page, 'bilan-custom');
	await page.locator('.bc-save summary').click();

	await page.locator('#bcLabel').fill('');
	await page.locator('#bcSave').click();
	await champNomInvalide(page);

	await page.locator('#bcLabel').fill('Un nom');
	await page.locator('#bcSave').click();
	await expect(page.locator('#bcSaved')).toContainText('Un nom');
	await expect(page.locator('#bcLabel')).not.toHaveAttribute('aria-invalid', /.*/);

	expect(errors).toEqual([]);
});

/* ---------- Texte de la section vide (relecture) ---------- */

test('section vide : l’espace encadrant annonce que les favoris se modifient ou se suppriment ici', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semerDeuxProfils(page, {});
	await gotoHash(page, 'encadrant/programme');
	await page.locator('#encConsulteSel').selectOption(PROFIL_B);
	// Libellé validé en relecture : chaîne intentionnelle.
	await expect(page.locator('.enc-seance-favoris-gestion .enc-hint')).toHaveText(
		'Les bilans favoris se composent depuis son écran ; vous pourrez ensuite les modifier ou les supprimer ici.',
	);
	expect(errors).toEqual([]);
});

/* ---------- Critère 6 : profil ACTIF changé depuis la barre pendant l'édition ---------- */

const PROFIL_C = 'e2e-c';
const TROIS_PROFILS = {
	list: [
		...PROFILS.list,
		{ uuid: PROFIL_C, name: 'Profil C', emoji: '🐼', updatedAt: 1, niveauReference: 'ce2' },
	],
	active: PROFIL_A,
};

/* Barre de profil : `#toolbarProfile` ouvre `#profileMenu`, un `button[data-uuid]` bascule le
   profil actif (cf. src/main.ts). Sur mobile la barre vit dans le tiroir `#toolbarBurger`. */
async function changerProfilActif(page: Page, uuid: string): Promise<void> {
	const burger = page.locator('#toolbarBurger');
	if (await burger.isVisible()) await burger.click();
	await page.locator('#toolbarProfile').click();
	await page.locator(`#profileMenu button[data-uuid="${uuid}"]`).click();
}

test('critère 6 (barre) : changer le profil actif pendant l’édition n’empêche pas d’écrire chez le propriétaire', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, {
		ludaskia_profiles: TROIS_PROFILS,
		[`${PROFIL_B}/ludaskia_bilans`]: [favori('fav-b1', 'Favori B1')],
	});
	await ouvrirEdition(page, 'fav-b1', PROFIL_B);

	await changerProfilActif(page, PROFIL_C);
	await expect(page).toHaveURL(/#bilan-edit$/);
	await expect(page.locator(FORM)).toBeVisible();
	await expect(page.locator('.bc-edit-title')).toContainText('Profil B');

	await choisirLecons(page, [JOUABLE, JOUABLE_2]);
	await choisirMode(page, 'sprint');
	await page.locator('#bcLabel').fill('Favori B1 modifié');
	await page.locator('#bcUpdate').click();

	await expect(page).toHaveURL(/#encadrant/);
	await expect(page.locator('#encConsulteSel')).toHaveValue(PROFIL_B);
	const b = await lireListe(page, `${PROFIL_B}/ludaskia_bilans`);
	expect(b).toHaveLength(1);
	expect(b[0]).toMatchObject({ id: 'fav-b1', label: 'Favori B1 modifié', mode: 'sprint' });
	// Ni le nouveau profil actif, ni l'ancien n'ont reçu quoi que ce soit.
	expect(await lire(page, `${PROFIL_C}/ludaskia_bilans`)).toBeNull();
	expect(await lire(page, `${PROFIL_A}/ludaskia_bilans`)).toBeNull();

	expect(errors).toEqual([]);
});

test('S2 : après un changement de profil sans nouveau rendu, le focus n’est pas rapporté sur le titre', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semer(page, {
		ludaskia_profiles: TROIS_PROFILS,
		[`${PROFIL_B}/ludaskia_bilans`]: [favori('fav-b1', 'Favori B1')],
	});
	await ouvrirEdition(page, 'fav-b1', PROFIL_B);
	await page.locator('#bcLabel').fill('Saisie en cours');
	// Repère posé sur le nœud du formulaire : s'il survit, il n'a PAS été re-rendu.
	await page.locator(FORM).evaluate((el) => ((el as HTMLElement & { _s2?: boolean })._s2 = true));

	await changerProfilActif(page, PROFIL_C);
	await expect(page).toHaveURL(/#bilan-edit$/);

	// Précondition observable : la saisie de l'adulte est conservée, donc le formulaire est
	// le même nœud (comportement déjà en place, `rendu` dans bilan-edition.ts).
	await expect(page.locator('#bcLabel')).toHaveValue('Saisie en cours');
	expect(
		await page.locator(FORM).evaluate((el) => (el as HTMLElement & { _s2?: boolean })._s2 === true),
	).toBe(true);
	// Le focus reporté sur le titre arracherait l'adulte à ce qu'il faisait (lecteur d'écran).
	await expect(page.locator('.bc-edit-title')).not.toBeFocused();

	expect(errors).toEqual([]);
});

/* ---------- Q1 : écriture refusée par le stockage (quota plein) ---------- */

test('Q1 : si le stockage refuse l’écriture du favori, l’éditeur reste ouvert, signale l’échec, n’annonce rien et garde la reprise', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await semerDeuxProfils(page, seedReprise());
	await ouvrirEdition(page, 'fav-b1', PROFIL_B);
	const cleFavoris = `${PROFIL_B}/ludaskia_bilans`;
	const avant = await lire(page, cleFavoris);
	const repriseAvant = await lire(page, `${PROFIL_B}/ludaskia_resume`);

	// Quota plein pour CETTE clé seulement, posé sur l'INSTANCE `localStorage` (un espion sur
	// `Storage.prototype.setItem` ne prend pas sous tous les moteurs). Les autres clés (dont
	// la reprise) restent écrivables : c'est ce qui rend l'effacement de la reprise observable.
	await page.evaluate((cle) => {
		const reel = Storage.prototype.setItem;
		Object.defineProperty(localStorage, 'setItem', {
			configurable: true,
			value: (k: string, v: string) => {
				if (k === cle) throw new DOMException('quota simulé', 'QuotaExceededError');
				return reel.call(localStorage, k, v);
			},
		});
	}, cleFavoris);
	// Le refus prend vraiment : écrire la clé lève, la valeur stockée ne bouge pas.
	const leve = await page.evaluate((cle) => {
		try {
			localStorage.setItem(cle, '[]');
			return false;
		} catch {
			return true;
		}
	}, cleFavoris);
	expect(leve).toBe(true);
	expect(await lire(page, cleFavoris)).toBe(avant);

	// Le contenu change ET une reprise existe : on traverse la confirmation, puis l'écriture échoue.
	await choisirNbq(page, '10');
	await page.locator('#bcUpdate').click();
	await page.locator(`${uiModalOverlay} .modal-danger, ${uiModalOverlay} .modal-secondary`).click();

	// On reste dans l'éditeur, avec un message (texte non figé : pas encore choisi).
	await expect(page.locator(FORM)).toBeVisible();
	await expect(page.locator('#bcErr')).not.toBeEmpty();
	await expect(page).toHaveURL(/#bilan-edit$/);
	await expect(annonceEnregistre(page)).toHaveCount(0);

	// Rien n'a bougé : favori inchangé, reprise de l'enfant intacte (un échec ne doit pas lui
	// coûter sa partie).
	expect(await lire(page, cleFavoris)).toBe(avant);
	expect(await clesReprises(page)).toContain(CLE_REPRISE);
	expect(await lire(page, `${PROFIL_B}/ludaskia_resume`)).toBe(repriseAvant);

	expect(errors).toEqual([]);
});
