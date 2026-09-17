/* ============================================================
   Étape « Un bilan favori » du programme du jour (#636) — smoke tests e2e.
   ------------------------------------------------------------
   Écrits AVANT l'implémentation (skill /cadrer) : ROUGES à l'arrivée, à
   l'exception du critère 14 (déjà satisfait). Couvre les critères 1-4 et 6-8
   de l'issue #636 (composer l'étape côté encadrant, la faire côté enfant).
   Les critères 5, 9-11 sont tenus au cœur en Vitest par un autre agent ; les
   critères 12-15 (déplacement de la suppression) vivent dans
   `favori-suppression-encadrant.spec.ts`.

   Contrat d'écran visé (décidé avec le mainteneur, cf. issue) :
   - mode `favori` dans le sélecteur d'ajout, libellé « Un bilan favori » ;
   - `fieldset.enc-seance-favoris[data-def][data-etape]`, cases
     `input[data-act="seance-favori-toggle"][data-def][data-etape][data-ref]`,
     chacune dans un `label.enc-seance-favori` qui nomme le favori ET son mode
     lisible (« Bilan » / « Sprint 5 min ») ;
   - repère `p.enc-seance-favoris-hint` (dit explicitement l'absence de favori) ;
   - côté enfant : titre générique du cas « pool » = « Mes bilans favoris »
     (vocabulaire déjà affiché à l'enfant par `renderFavoris`, #230 : jamais
     « bilan » seul, abstrait pour un CE2).

   Comme `programme-dictee-pool.spec.ts` / `programme-dictee-sans-cible.spec.ts` :
   mêmes helpers, même pattern watchErrors, seed direct de `ludaskia_seance` /
   `ludaskia_bilans` pour les scénarios côté enfant (le compositeur ne sachant pas
   encore composer une étape « favori », impossible de la faire naître par l'UI).

   Gate ajouté après coup (relecture qualité) : les tests ci-dessus s'arrêtent au
   LANCEMENT d'un favori sprint (ouverture de `#sprintStage`) et ne vont jamais
   jusqu'à sa COMPLÉTION — ils ne voient donc ni la journalisation de l'étape ni une
   éventuelle fuite de la référence du favori vers le sprint SUIVANT. `sprintFavoriId`
   (variable de module de `src/ui/sprint.ts`, appariée au filtre par le seul écrivain
   `poserFiltreSprint`) existe justement pour qu'un sprint ordinaire n'hérite jamais,
   en silence, de la référence du favori précédent. Les deux tests en fin de fichier
   mènent le sprint jusqu'à `.sprint-done` (patron `lancerSprintNumComparer` de
   `recap-seance.spec.ts`) pour vérifier le crédit (a) et l'absence de fuite (b).

   (b) s'est révélé plus subtil qu'il n'y paraît : `sprintFavoriId` est un état de MODULE,
   remis à `null` par tout rechargement de page. Une première version enchaînait le sprint
   favori puis l'ordinaire via deux `gotoHash` distincts — verte, mais incapable de voir la
   moindre fuite, puisque la provenance valait déjà `null` avant même le premier clic du
   second sprint (rien à hériter). Le test correct enchaîne les DEUX sprints dans la MÊME vie
   de page (uniquement des clics entre les deux, jamais de rechargement), seule condition où
   une fuite aurait quelque chose à fuiter. */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Supprime tout verrou PIN éventuel persisté d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Leçon réelle du catalogue CE2, reprise du repère de plusieurs autres specs
   (mono-mode, fiche de 12 items) : peu importe ici, seul le LABEL du favori
   compte pour les assertions. */
const LESSON_ID = 'math-complements';

interface BilanFavoriSeed {
	id: string;
	label: string;
	lessonIds: string[];
	questionsPerLesson: number | 'all';
	mode: 'bilan' | 'sprint';
}

function favori(id: string, label: string, mode: 'bilan' | 'sprint'): BilanFavoriSeed {
	return { id, label, lessonIds: [LESSON_ID], questionsPerLesson: 3, mode };
}

/* Seed direct de `ludaskia_bilans` (favoris) SEUL, pour le profil par défaut
   'e2e' — compositeur encadrant (critères 1, 3, 4). */
function seedBilansScript(bilans: BilanFavoriSeed[]): string {
	return `localStorage.setItem('e2e/ludaskia_bilans', ${JSON.stringify(JSON.stringify(bilans))});`;
}

/* Seed direct de `ludaskia_bilans` ET `ludaskia_seance` (une définition d1 avec
   une seule étape e1, kind 'favori', pool `refs`) pour le profil 'e2e' —
   scénarios côté enfant (critères 6, 7, 8). Le compositeur ne pouvant pas
   encore créer ce type d'étape, on la pose directement en stockage, comme
   `seedProgrammeLeconPlusDicteeOrpheline` dans programme-dictee-sans-cible.spec.ts.
   `count` (défaut 1) : nombre de sessions requises pour épuiser l'étape — porté à 2 par le
   test de non-héritage, pour qu'un premier crédit LÉGITIME laisse l'étape observable
   (encore candidate) au moment du second sprint, cf. plus bas. */
function seedFavorisEtProgrammeScript(
	bilans: BilanFavoriSeed[],
	refs: string[],
	count = 1,
): string {
	const defs = [
		{
			id: 'd1',
			etapes: [{ id: 'e1', kind: 'favori', refs, count }],
			recurrence: { type: 'hebdo', jours: [1, 2, 3, 4, 5, 6, 7] },
		},
	];
	return `(function(){
		localStorage.setItem('e2e/ludaskia_bilans', ${JSON.stringify(JSON.stringify(bilans))});
		localStorage.setItem('e2e/ludaskia_seance', ${JSON.stringify(JSON.stringify(defs))});
	})();`;
}

/* ---------- Critère 1 : le mode apparaît dans le sélecteur d'ajout ---------- */

test('critère 1 : « + Ajouter une activité… » propose « Un bilan favori »', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant/programme');

	await page.locator('[data-act="seance-add"]').click();
	const option = page.locator(
		'select[data-act="seance-etape-add"][data-def="d1"] option[value="favori"]',
	);
	// Échec attendu tant que le mode n'existe pas : la liste des modes est inchangée
	// (5 options : sprint/révision/à revoir/leçon du jour/leçon précise/dictée).
	await expect(option).toHaveCount(1);
	await expect(option).toHaveText('Un bilan favori');

	expect(errors).toEqual([]);
});

/* ---------- Critère 2 : favoris du profil CONSULTÉ, pas de l'actif ---------- */

const PROFIL_A = 'e2e-a';
const PROFIL_B = 'e2e-b';

test('critère 2 : l’étape propose les favoris du profil CONSULTÉ (B), pas ceux de l’actif (A)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	// Actif = A. On seed aussi des favoris différents pour A, pour vérifier qu'ils ne
	// fuitent PAS dans l'étape composée pour B (sans quoi ce test passerait même avec
	// un `loadBilans()` non corrigé, lu sur le profil actif plutôt que le consulté).
	await page.addInitScript(
		(seed) => {
			localStorage.setItem('ludaskia_profiles', JSON.stringify(seed.profils));
			localStorage.setItem(`${seed.a}/ludaskia_bilans`, JSON.stringify(seed.bilansA));
			localStorage.setItem(`${seed.b}/ludaskia_bilans`, JSON.stringify(seed.bilansB));
		},
		{
			profils: {
				list: [
					{ uuid: PROFIL_A, name: 'Profil A', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' },
					{ uuid: PROFIL_B, name: 'Profil B', emoji: '🐨', updatedAt: 1, niveauReference: 'ce2' },
				],
				active: PROFIL_A,
			},
			a: PROFIL_A,
			b: PROFIL_B,
			bilansA: [favori('fav-a1', 'Favori A1', 'bilan')],
			bilansB: [favori('fav-b1', 'Favori B1', 'bilan'), favori('fav-b2', 'Favori B2', 'sprint')],
		},
	);
	await gotoHash(page, 'encadrant/programme');

	// A est actif, mais on COMPOSE pour B : bascule du profil consulté AVANT d'ajouter
	// l'étape (encConsulteSel, même sélecteur qu'encadrant-banque.spec.ts).
	const sel = page.locator('#encConsulteSel');
	await sel.selectOption(PROFIL_B);
	await expect(sel).toHaveValue(PROFIL_B);

	await page.locator('[data-act="seance-add"]').click();
	await page
		.locator('select[data-act="seance-etape-add"][data-def="d1"]')
		.selectOption('favori', { timeout: 5000 });

	const fieldset = page.locator('fieldset.enc-seance-favoris[data-def="d1"][data-etape="e1"]');
	await expect(fieldset).toBeVisible();
	await expect(fieldset.locator('label.enc-seance-favori')).toHaveCount(2);
	await expect(fieldset).toContainText('Favori B1');
	await expect(fieldset).toContainText('Favori B2');
	await expect(fieldset).not.toContainText('Favori A1');

	expect(errors).toEqual([]);
});

/* ---------- Critère 3 : les deux modes proposés, chacun lisible ---------- */

test('critère 3 : la liste propose les favoris des deux modes, chacun avec son mode lisible', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	// Noms SANS le mot « Bilan »/« Sprint » dedans : sinon l'assertion sur le mode
	// lisible passerait trivialement en lisant le NOM du favori, pas l'étiquette de mode.
	await page.addInitScript(
		seedBilansScript([
			favori('fav-t', 'Tables de multiplication', 'bilan'),
			favori('fav-f', 'Flash calcul', 'sprint'),
		]),
	);
	await gotoHash(page, 'encadrant/programme');

	await page.locator('[data-act="seance-add"]').click();
	await page
		.locator('select[data-act="seance-etape-add"][data-def="d1"]')
		.selectOption('favori', { timeout: 5000 });

	const fieldset = page.locator('fieldset.enc-seance-favoris[data-def="d1"][data-etape="e1"]');
	const ligneBilan = fieldset.locator('label.enc-seance-favori', {
		hasText: 'Tables de multiplication',
	});
	const ligneSprint = fieldset.locator('label.enc-seance-favori', { hasText: 'Flash calcul' });
	await expect(ligneBilan).toContainText('Bilan');
	await expect(ligneSprint).toContainText('Sprint 5 min');

	expect(errors).toEqual([]);
});

/* ---------- Critère 4 : profil sans aucun favori -> message explicite ---------- */

test('critère 4 : un profil sans aucun favori le dit dans l’étape', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(seedBilansScript([]));
	await gotoHash(page, 'encadrant/programme');

	await page.locator('[data-act="seance-add"]').click();
	await page
		.locator('select[data-act="seance-etape-add"][data-def="d1"]')
		.selectOption('favori', { timeout: 5000 });

	// Cadre vide et MUET = échec : on exige un texte non vide, spécifique au favori
	// (pas le repère générique d'une autre étape recyclé tel quel).
	const hint = page.locator('p.enc-seance-favoris-hint');
	await expect(hint).toHaveText(/\S/);
	await expect(hint).toContainText(/favori/i);
	await expect(
		page.locator('fieldset.enc-seance-favoris input[data-act="seance-favori-toggle"]'),
	).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- Critères 6 et 7 : pool à UN SEUL favori (nommage + mode respecté) ---------- */

test('critères 6+7 : pool à un seul favori BILAN — la tuile le nomme, le lancement ouvre le bilan', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(
		seedFavorisEtProgrammeScript([favori('fav-1', 'Tables de 7', 'bilan')], ['fav-1']),
	);
	await gotoHash(page, 'seance');

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();
	await expect(tuile.locator('.programme-tuile-titre')).toHaveText('Tables de 7');

	await tuile.click();
	// Le mode BILAN du favori tiré ouvre l'écran de bilan (rendu direct dans #sheets,
	// comme runBilanConfig ; #seance disparaît, cf. hideMenus dans navigation.ts).
	await expect(page.locator('#seance')).toBeHidden();
	await expect(page.locator('#sheets .bilan-title')).toHaveText('Tables de 7');

	expect(errors).toEqual([]);
});

test('critères 6+7 : pool à un seul favori SPRINT — la tuile le nomme, le lancement ouvre le sprint personnalisé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(
		seedFavorisEtProgrammeScript([favori('fav-2', 'Sprint révisions', 'sprint')], ['fav-2']),
	);
	await gotoHash(page, 'seance');

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();
	await expect(tuile.locator('.programme-tuile-titre')).toHaveText('Sprint révisions');

	await tuile.click();
	// Échec du critère 7 tel que constaté aujourd'hui : un favori sprint ne doit PAS
	// ouvrir l'écran de bilan — il doit lancer le sprint personnalisé (#sprint, #sprintStage).
	await expect(page).toHaveURL(/#sprint$/);
	await expect(page.locator('#sprintStage')).toBeVisible();

	expect(errors).toEqual([]);
});

/* ---------- Critères 6 et 8 : pool à DEUX favoris ou plus (titre générique + tirage) ---------- */

test('critères 6+8 : pool à deux favoris — titre générique « Mes bilans favoris », un favori est tiré au lancement', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(
		seedFavorisEtProgrammeScript(
			[favori('fav-3', 'Favori Trois', 'bilan'), favori('fav-4', 'Favori Quatre', 'bilan')],
			['fav-3', 'fav-4'],
		),
	);
	await gotoHash(page, 'seance');

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();
	// Titre générique = vocabulaire DÉJÀ affiché à l'enfant (titre de section de
	// `renderFavoris`, src/ui/bilan.ts:530) — jamais « bilan » seul, abstrait pour un CE2
	// (choix acté #230). Le libellé exact est donc intentionnel ici, pas un simple non-vide.
	await expect(tuile.locator('.programme-tuile-titre')).toHaveText('Mes bilans favoris');

	await tuile.click();
	// Un favori du pool a bien été tiré ET lancé (peu importe lequel : le tirage est
	// aléatoire) — la tuile n'annonce jamais un favori pour en lancer un autre.
	await expect(page.locator('#sheets .bilan-title')).toHaveText(/Favori (Trois|Quatre)/);

	expect(errors).toEqual([]);
});

/* ---------- Crédit ET non-héritage : le sprint favori mené à terme (relecture #636) ---------- */

/* Ferme les éventuelles modales de récompense (étoile / niveau / fête de fin de programme)
   qui intercepteraient le clic suivant — même pattern que recap-seance.spec.ts /
   programme-carte-terminee.spec.ts. */
async function fermerModalesRecompense(page: Page): Promise<void> {
	for (let i = 0; i < 5; i++) {
		const levelup = page.locator('#levelupOk');
		if (await levelup.isVisible().catch(() => false)) {
			await levelup.click();
			continue;
		}
		const celebrate = page.locator('#celebrateOk');
		if (await celebrate.isVisible().catch(() => false)) {
			await celebrate.click();
			continue;
		}
		break;
	}
}

/* Mène jusqu'à `.sprint-done` un sprint DÉJÀ LANCÉ (page sur `#sprint`, `#sprintStage`
   visible), puis rentre à l'accueil. Une seule question, réponse à VIDE (chemin
   `sansTentative`, #467) : compte comme une réponse fausse SANS qu'il faille connaître la
   bonne réponse — robuste au tirage, et adapté ici puisque LESSON_ID (math-complements) est
   une saisie numérique (`#sprintValidate`/`#sprintInput`), pas un QCM. L'horloge DOIT être
   installée par l'appelant AVANT le clic qui lance le sprint (avant la création du
   `setInterval` du décompte, cf. e2e/README.md). */
async function terminerSprintEtRentrer(page: Page): Promise<void> {
	await expect(page.locator('#sprintStage')).toBeVisible();
	await expect(page.locator('#sprintValidate')).toBeVisible();
	await page.locator('#sprintValidate').click();
	await expect(page.locator('#sprintContinue')).toBeVisible();
	await page.locator('#sprintContinue').click();
	await page.clock.fastForward('05:01');
	await expect(page.locator('.sprint-done')).toBeVisible();
	await fermerModalesRecompense(page);
	await page.locator('#sprintHome').click();
	await fermerModalesRecompense(page); // fête de fin de programme éventuelle (cas crédité)
}

test('crédit : un sprint FAVORI mené jusqu’au bout coche l’étape « bilan favori »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(
		seedFavorisEtProgrammeScript([favori('fav-sprint', 'Sprint favori', 'sprint')], ['fav-sprint']),
	);
	await gotoHash(page, 'seance');

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();

	// Horloge installée AVANT le clic qui lance le sprint (crée le setInterval du décompte).
	await page.clock.install();
	await tuile.click();
	await expect(page).toHaveURL(/#sprint$/);
	await terminerSprintEtRentrer(page);

	// `resoudreProgramme` (appelé au retour vers l'accueil) lit le journal d'activité —
	// kind 'sprint', ref = id du favori (`finalizeSprint`, sprint.ts:942) — et crédite l'étape
	// unique du programme, qui à elle seule complète TOUT le programme (repère déjà éprouvé
	// par programme-carte-terminee.spec.ts : classe `programme-card--fini`, plus de `.go`).
	await expect(page.locator('#home')).toBeVisible();
	await expect(page.locator('#cardProgramme')).toHaveClass(/programme-card--fini/);
	await expect(page.locator('#cardProgramme .go')).toHaveCount(0);

	// MUTATION qui ferait rougir ce test (jouée par le mainteneur, pas ici — interdiction de
	// toucher src/) : dans `finalizeSprint` (src/ui/sprint.ts:942), remplacer
	// `recordLessonStats(sprintPerLesson, 'sprint', sprintFavoriId ?? undefined)` par
	// `recordLessonStats(sprintPerLesson, 'sprint')` — la référence du favori ne serait plus
	// journalisée, `etapeSatisfaite('favori', …)` ne trouverait plus jamais de correspondance
	// dans `refs`, et l'étape resterait bloquée à 0/1.
	expect(errors).toEqual([]);
});

test('non-héritage : un sprint ORDINAIRE enchaîné SANS RECHARGER après un sprint favori ne recrédite pas l’étape une 2ᵉ fois', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	// `count: 2` (3ᵉ argument) : l'étape survit à son premier crédit légitime plutôt que de
	// compléter tout le programme d'un coup — sans quoi il n'y aurait plus RIEN à observer au
	// second sprint (une étape déjà épuisée n'est même plus candidate à un second crédit,
	// leak ou pas). C'est ce qui rend le test capable de voir la fuite, ou son absence.
	await page.addInitScript(
		seedFavorisEtProgrammeScript(
			[favori('fav-sprint', 'Sprint favori', 'sprint')],
			['fav-sprint'],
			2,
		),
	);
	await gotoHash(page, 'seance');

	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();

	// Horloge installée UNE SEULE FOIS, avant le PREMIER sprint : elle reste posée pour toute
	// la vie de la page (pas de second `install()`, non supporté dans le même realm, cf.
	// e2e/README.md), et c'est justement ce qui permet aux deux sprints de s'enchaîner SANS
	// AUCUN rechargement complet — condition nécessaire pour que `sprintFavoriId` (état de
	// MODULE, réinitialisé à `null` par tout rechargement) ait quelque chose à faire fuiter.
	await page.clock.install();

	// 1) Sprint FAVORI, lancé depuis la tuile du programme, mené au bout : crédit légitime.
	await tuile.click();
	await expect(page).toHaveURL(/#sprint$/);
	await terminerSprintEtRentrer(page);
	await expect(page.locator('#home')).toBeVisible();
	await expect(page.locator('#cardProgramme .lj-sub')).toHaveText('1 sur 2 déjà fait');

	// 2) SANS RECHARGER (aucun `gotoHash`/`reload` ici — uniquement des clics, comme
	// `#sprintHome` juste avant) : sprint ORDINAIRE, depuis l'accueil -> écran de config ->
	// lancement, jamais via le favori ni la tuile du programme. Filtre restreint à la
	// catégorie de LESSON_ID (« Calcul mental ») pour rester en saisie déterministe
	// (`#sprintValidate`) — le tirage par défaut couvrirait tout le catalogue, y compris des
	// formats QCM (`.sprint-choice`) que `terminerSprintEtRentrer` ne sait pas jouer.
	await page.locator('#cardSprint').click();
	await expect(page).toHaveURL(/#sprint-config$/);
	await page.locator('.sc-radio[value="category:math-calcul-mental"]').check();
	await page.locator('#scLaunch').click();
	await expect(page).toHaveURL(/#sprint$/);
	await terminerSprintEtRentrer(page); // même horloge déjà installée : pas de second install()

	// Le sprint ordinaire ne doit PAS recréditer l'étape « bilan favori » une 2ᵉ fois : elle
	// reste à 1/2 (jamais 2/2), le programme n'est pas déclaré fini. C'est LE gate visé par la
	// relecture #636 : une fuite de `sprintFavoriId` d'un sprint favori vers le sprint
	// ORDINAIRE qui le suit, dans la même page, cocherait ici une 2ᵉ session que l'enfant n'a
	// pas faite pour ce favori.
	await expect(page.locator('#home')).toBeVisible();
	const carte = page.locator('#cardProgramme');
	await expect(carte).not.toHaveClass(/programme-card--fini/);
	await expect(carte.locator('.lj-sub')).toHaveText('1 sur 2 déjà fait');

	// MUTATION qui ferait rougir ce test (jouée par le mainteneur, pas ici — interdiction de
	// toucher src/) : dans `poserFiltreSprint` (src/ui/sprint.ts:118), rendre l'affectation
	// CONDITIONNELLE — `if (favoriId) sprintFavoriId = favoriId;` au lieu de l'affectation
	// inconditionnelle actuelle. Le `null` explicitement passé par le gestionnaire de
	// `#scLaunch` (sprint.ts:288) devient alors une valeur FAUSSE comme une autre : elle ne
	// réarme plus `sprintFavoriId`, qui garde la valeur laissée par le sprint favori
	// précédent (`'fav-sprint'`) — encore en vie car AUCUN rechargement n'a eu lieu entre les
	// deux sprints. Le sprint ordinaire créditerait alors l'étape une 2ᵉ fois, et le programme
	// passerait à tort en « fini ». (Une première tentative, qui lançait le sprint ordinaire
	// depuis une page rechargée, ne voyait pas cette fuite : `sprintFavoriId` y repartait de
	// toute façon à `null` à l'ouverture de la page, leak ou pas — corrigé ici en gardant les
	// deux sprints dans la MÊME page.)
	expect(errors).toEqual([]);
});
