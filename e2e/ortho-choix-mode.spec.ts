/* ============================================================
   Écran de choix du mode d'orthographe (#641) — smoke tests e2e, écrits
   AVANT l'implémentation à partir des critères d'acceptation de l'issue et
   du contrat d'API (.claude/scratch/641-contrat-api.md), puis conservés
   comme garde-fous une fois #641 posé.

   Couverture (texte complet des critères dans l'issue #641) :
   - 1  : une réussite en mode CIBLÉ valide RÉELLEMENT le mode joué et tous
          ceux en dessous (cumul), pas seulement en apparence — le garde
          `if (!seanceMode)` de `reussiteMode` (ui/ortho-runner.ts) est le
          bug d'origine que #641 existe pour tuer ; aucun test Vitest ne
          peut le voir (le cumul peut être parfaitement correct côté
          `core/` et ce garde bloquer quand même tout appel), seul un test
          qui OBSERVE l'effet depuis l'écran l'attrape.
   - 7  : un mode dont tous les mots ont validé quitte la zone principale,
          reste accessible plus bas, signalé comme terminé ET comme
          rapportant encore des points.
   - 8  : arrivée depuis le programme du jour — même règle, autre porte
          d'entrée (`startOrthoLecon(id, 'programme')`, `ui/seance.ts`).
   - 9  : le coût « 8 activités » sur TOUS les boutons de séance, sur AUCUN
          autre (« Relire mes mots » n'a pas de plafond).
   - 10 : un mode terminé ne reprend pas le style `.programme-tuile--inactive`
          (déjà appris ailleurs comme « pas cliquable »).
   - 11 : cas limite — liste entièrement acquise, l'écran ne se vide pas.
   - 12 : l'écran de fin annonce explicitement qu'un mode vient d'être
          terminé PENDANT la séance qui vient de se jouer — SINGULIER (un
          seul mode bascule) et PLURIEL (le cumul en bascule plusieurs d'un
          coup) ont chacun leur variante de texte, donc leur propre test.
   - 13 : la célébration « Liste prête ! » prime, aucun message d'épuisement
          ne s'y ajoute (effet direct du cumul du critère 1).
   - 22 : le journal d'erreurs de l'espace encadrant continue de capturer
          même quand le geste vient de la zone basse (mode terminé, nouveau
          chemin d'entrée introduit par #641).

   Libellés ARRÊTÉS (contrat §F, avis redacteur-contenu-francais) : le texte
   exact du coût est « 8 activités », le badge d'un mode terminé est
   « Terminé pour cette liste · donne toujours des points », le titre de la
   zone basse « Déjà terminés pour cette liste ». Les mots « épuisé » et
   « maîtrisé » sont INTERDITS côté enfant — on vérifie leur absence, pas
   seulement la présence du bon texte. Le message de fin (critère 12) n'a
   pas d'emplacement tranché (bloc ou en ligne) : on n'accroche que le
   sélecteur `.ortho-mode-epuise` et un fragment RÉELLEMENT commun aux deux
   variantes (singulier « il te donnera » / pluriel « ils te donneront » ne
   partagent PAS de sous-chaîne — « toujours des points », lui, est commun
   aux deux), jamais la phrase entière.

   Disponibilité de la voix — STUBBÉE, jamais subie de l'hôte : Chromium
   headless n'expose aucune voix par défaut sous Linux (CI), mais expose les
   voix SAPI du système sous Windows, souvent françaises. Une spec qui
   compte sur « pas de voix » par défaut devient alors dépendante de la
   machine qui l'exécute — verte en CI, rouge (ou fausse verte) en local.
   `STUB_SANS_VOIX` et `STUB_VOIX_FR` (`journal-couverture.ts`) posent l'état
   voulu explicitement. Les deux sont nécessaires ici, pas par prudence :
   le critère 12 a deux variantes de texte (singulier/pluriel), et seule la
   variante PLURIEL exige une voix disponible pour se produire sans étoiler
   la liste au passage (dictée qui reste due — sinon on retombe dans le
   critère 13, qui supprime le message).
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';
import { STUB_SANS_VOIX, STUB_VOIX_FR } from './journal-couverture';

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* ---------- Seeds ---------- */

function motVierge(
	id: string,
	mot: string,
	validation: Partial<{ tuiles: boolean; motCache: boolean; dictee: boolean }> = {},
) {
	return {
		id,
		mot,
		entourage: [],
		atelierFait: true, // liste déjà découverte : l'écran de choix est la porte d'entrée normale
		validation: { tuiles: false, motCache: false, dictee: false, ...validation },
		revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
		origine: 'liste',
	};
}

async function seedOrtho(page: Page, seed: unknown): Promise<void> {
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);
}

// Liste à 2 mots (lettres toutes distinctes, aucun chevauchement entre les deux mots :
// « chat » et « lion » ne partagent aucune lettre, un clic par lettre reste sans ambiguïté)
// dont TUILES est déjà validé sur les deux mots (donc terminé pour la liste), MOT CACHÉ non.
const LESSON_PARTIEL = 'l-e2e-choix-partiel';
const SEED_PARTIEL = {
	banque: {
		m1: motVierge('m1', 'chat', { tuiles: true }),
		m2: motVierge('m2', 'lion', { tuiles: true }),
	},
	listes: [
		{
			id: LESSON_PARTIEL,
			label: 'Liste partielle',
			motIds: ['m1', 'm2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'm1', lion: 'm2' },
};

// Les deux modes requis (dictée stubbée absente : STUB_SANS_VOIX) sont déjà validés
// sur les deux mots : liste entièrement acquise dès l'ouverture de l'écran.
const LESSON_COMPLET = 'l-e2e-choix-complet';
const SEED_COMPLET = {
	banque: {
		m1: motVierge('m1', 'chat', { tuiles: true, motCache: true }),
		m2: motVierge('m2', 'lion', { tuiles: true, motCache: true }),
	},
	listes: [
		{
			id: LESSON_COMPLET,
			label: 'Liste acquise',
			motIds: ['m1', 'm2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'm1', lion: 'm2' },
};

// Pour la séance ciblée « tuiles » (critère 12, singulier) : un mot a déjà tuiles
// validé, l'autre non — la 1re réussite du 2e mot fait basculer « tuiles » en terminé
// PENDANT la séance, sans jamais valider mot caché (donc sans étoiler la liste —
// isole le critère 12 du critère 13).
const LESSON_SEANCE = 'l-e2e-choix-seance';
const SEED_SEANCE_TUILES = {
	banque: {
		m1: motVierge('m1', 'chat', { tuiles: true }),
		m2: motVierge('m2', 'lion', {}),
	},
	listes: [
		{
			id: LESSON_SEANCE,
			label: 'Liste séance tuiles',
			motIds: ['m1', 'm2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'm1', lion: 'm2' },
};

// Pour la séance ciblée « mot caché » (critère 13) : rien n'est validé. Le cumul (critère 1)
// valide tuiles ET mot caché à chaque réussite de mot caché : le 2e mot réussi étoile la
// liste ET termine les deux modes d'un coup — exactement le cas visé par le critère 13.
const LESSON_ETOILE = 'l-e2e-choix-etoile';
const SEED_SEANCE_MOTCACHE = {
	banque: {
		m1: motVierge('m1', 'chat', {}),
		m2: motVierge('m2', 'lion', {}),
	},
	listes: [
		{
			id: LESSON_ETOILE,
			label: 'Liste séance mot caché',
			motIds: ['m1', 'm2'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'm1', lion: 'm2' },
};

/* ---------- Gestes ---------- */

/* Complète une activité TUILES avec succès (clique chaque lettre du bac dans l'ordre du
   mot, vérifie, attend le « Bravo », enchaîne). Reprend le geste de
   frise-composition-listes.spec.ts / paliers-journal-ortho.spec.ts. */
async function completerTuiles(page: Page, mot: string): Promise<void> {
	for (const ch of mot) {
		await page
			.locator('.tuiles-bac button.tuile:not(.tuile-used)', { hasText: ch })
			.first()
			.click();
	}
	await page.locator('#btnVerifTuiles').click();
	await page.locator('.fb-ok').waitFor();
	await page.locator('#fb button.btn-primary').click();
}

/* Complète une activité MOT CACHÉ avec succès. */
async function completerMotCache(page: Page, mot: string): Promise<void> {
	await page.locator('#btnCacher').click();
	await page.locator('#orthoInput').fill(mot);
	await page.locator('#btnVerifMot').click();
	await page.locator('.fb-ok').waitFor();
	await page.locator('#fb button.btn-primary').click();
}

/* Cible EXCLUSIVEMENT notre liste seedée dans le pool d'une étape « Une dictée » du
   compositeur encadrant : au moins une dictée PRÉDÉFINIE existe toujours pour un profil
   CE2 (ORTHO_PREDEF), et c'est elle — pas notre liste — que le champ pré-coche par défaut
   (`premiereRef`, la première proposée). On coche la nôtre, puis on décoche CE défaut : ne
   jamais l'inverse, le champ refuse de retomber à 0 coché. Pool résultant = 1 → tirage
   déterministe, comme la 1re moitié de programme-dictee-pool.spec.ts. */
async function cibleUniquementNotreListe(fieldset: Locator, ref: string): Promise<void> {
	const defautRef = await fieldset
		.locator('input[data-act="seance-dictee-toggle"]:checked')
		.first()
		.getAttribute('data-ref');
	await fieldset.locator(`input[data-act="seance-dictee-toggle"][data-ref="${ref}"]`).check();
	if (defautRef && defautRef !== ref) {
		await fieldset
			.locator(`input[data-act="seance-dictee-toggle"][data-ref="${defautRef}"]`)
			.uncheck();
	}
}

/* ============================================================
   Sans voix (dictée indisponible, stubbée) : c'est le régime de TOUS les
   critères sauf la variante PLURIEL du 12, qui a sa propre section plus bas.
   ============================================================ */
test.describe('sans voix (dictée indisponible, stub)', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(STUB_SANS_VOIX);
	});

	/* ============================================================
	   Critère 1 (le plus important du lot #641) : une réussite en mode CIBLÉ
	   valide RÉELLEMENT le mode joué ET tous ceux en dessous. Liste à UN
	   SEUL mot : la réussite jouée en MOT CACHÉ ne peut achever la liste
	   entière (et donc mener au bilan « Liste prête ! ») QUE SI le cumul a
	   aussi validé les TUILES, jamais jouées. On revient ensuite sur l'écran
	   de choix pour lire l'état à jour DEPUIS L'INTERFACE, pas depuis le
	   localStorage.
	   Depuis #658, une liste à un seul mot entièrement acquise voit son SEUL
	   mode restant (ici mot caché, sans voix stubbée) promu en tête d'écran
	   plutôt que relégué en zone basse : la vérification « mot caché acquis »
	   se lit donc sur le bouton de tête (`data-marche`), tandis que les
	   TUILES, jamais jouées, restent visibles en zone basse comme avant.
	   ============================================================ */
	test('critère 1 : une réussite en mode ciblé « mot caché » valide aussi les tuiles au passage (cumul)', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		const LESSON_CUMUL = 'l-e2e-choix-cumul';
		await seedOrtho(page, {
			banque: { m1: motVierge('m1', 'chat') },
			listes: [
				{ id: LESSON_CUMUL, label: 'Liste cumul', motIds: ['m1'], createdAt: 1, updatedAt: 1 },
			],
			motIdParForme: { chat: 'm1' },
		});
		await seedAideVue(page);
		await gotoHash(page, 'ortho-mode-' + LESSON_CUMUL);
		await page.locator('.mode-btn[data-mode="motCache"]').click();

		// Un seul mot, un seul mode JOUÉ (mot caché) : la liste ne peut devenir
		// entièrement maîtrisée d'un coup QUE SI le cumul a aussi validé les tuiles.
		// Si le garde `if (!seanceMode)` de `reussiteMode` (ui/ortho-runner.ts, le
		// bug d'origine de #641) revenait, RIEN ne serait validé et cet écran
		// n'arriverait jamais.
		await completerMotCache(page, 'chat');
		await expect(page.getByRole('heading', { name: 'Liste prête' })).toBeVisible();

		// Retour sur l'écran de choix : lecture depuis l'INTERFACE, pas le localStorage.
		await gotoHash(page, 'ortho-mode-' + LESSON_CUMUL);

		// Le mode JOUÉ (mot caché) est bien acquis — mais sur cette liste à UN
		// mot, c'est désormais le SEUL mode restant : #658 le promeut en tête
		// d'écran (bouton `.recommended`) au lieu de le laisser en zone basse,
		// donc c'est là qu'on l'atteste (`data-marche`), pas dans
		// `.mode-choice-epuises` qu'il a quitté.
		await expect(
			page.locator('.mode-choice-list .mode-btn.recommended[data-marche="motCache"]'),
		).toBeVisible();
		// … et les TUILES aussi, alors qu'elles n'ont JAMAIS été jouées directement :
		// c'est la moitié de la règle qu'un test qui ne vérifierait que le mode
		// réellement joué raterait.
		await expect(
			page.locator('.mode-choice-epuises .mode-btn[data-mode="tuiles"][data-epuise="1"]'),
		).toBeVisible();

		expect(errors).toEqual([]);
	});

	/* ============================================================
	   Critères 7 / 10 : répartition zone principale / zone basse, jamais le
	   style d'un bouton mort.
	   ============================================================ */
	test('critère 7/10 : un mode terminé pour la liste quitte la zone principale, rejoint la zone basse sans style inactif', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await seedOrtho(page, SEED_PARTIEL);
		await gotoHash(page, 'ortho-mode-' + LESSON_PARTIEL);

		// Tuiles est validé sur les 2 mots : absent de la zone principale…
		await expect(page.locator('.mode-choice-list .mode-btn[data-mode="tuiles"]')).toHaveCount(0);

		// … mais accessible dans la zone basse, dépliée, marqué comme terminé.
		const epuise = page.locator(
			'.mode-choice-epuises .mode-btn[data-mode="tuiles"][data-epuise="1"]',
		);
		await expect(epuise).toBeVisible();
		await expect(epuise).toContainText('Terminé pour cette liste · donne toujours des points');
		// Vocabulaire interdit côté enfant (contrat §F) : « épuisé » lirait un bouton mort,
		// « maîtrisé » est réservé aux mots/notions.
		await expect(epuise).not.toContainText(/épuisé/i);
		await expect(epuise).not.toContainText(/maîtris/i);
		// Jamais le style déjà appris ailleurs comme « pas cliquable ».
		await expect(epuise).not.toHaveClass(/programme-tuile--inactive/);

		// Le titre de la zone basse reprend le libellé arrêté.
		await expect(page.locator('.mode-choice-epuises')).toContainText(
			'Déjà terminés pour cette liste',
		);

		// Mot caché, lui, n'est pas terminé : reste en zone principale.
		await expect(page.locator('.mode-choice-list .mode-btn[data-mode="motCache"]')).toBeVisible();

		expect(errors).toEqual([]);
	});

	/* ============================================================
	   Critère 9 : le coût est annoncé sur TOUS les boutons de séance, sur AUCUN
	   autre — et le hint « pour t'entraîner », rendu redondant par ce chip, a
	   disparu (contrat §F).
	   ============================================================ */
	test('critère 9 : « 8 activités » sur tous les boutons de séance, sur aucun autre', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		// Liste fraîche : rien n'est terminé, les 3 boutons de séance disponibles sans
		// voix (parcours complet + tuiles + mot caché — la dictée est filtrée faute de
		// voix, pas seulement « terminée ») sont donc TOUS en zone principale.
		await seedOrtho(page, {
			banque: { m1: motVierge('m1', 'chat'), m2: motVierge('m2', 'lion') },
			listes: [
				{
					id: 'l-e2e-choix-cout',
					label: 'Liste coût',
					motIds: ['m1', 'm2'],
					createdAt: 1,
					updatedAt: 1,
				},
			],
			motIdParForme: { chat: 'm1', lion: 'm2' },
		});
		await gotoHash(page, 'ortho-mode-l-e2e-choix-cout');

		for (const sel of [
			'.mode-btn.recommended',
			'.mode-choice-list .mode-btn[data-mode="tuiles"]',
			'.mode-choice-list .mode-btn[data-mode="motCache"]',
		]) {
			const bouton = page.locator(sel);
			await expect(bouton, `${sel} devrait annoncer le coût « 8 activités »`).toContainText(
				'8 activités',
			);
			// Le hint générique disparaît : le chip de coût suffit désormais (contrat §F).
			await expect(bouton).not.toContainText('pour t’entraîner');
			await expect(bouton).not.toContainText("pour t'entraîner");
		}

		// « Relire mes mots » n'a pas de plafond d'activités : pas de coût affiché.
		await expect(page.locator('#btnRevoir .mode-btn-cout')).toHaveCount(0);
		await expect(page.locator('#btnRevoir')).not.toContainText('8 activités');

		expect(errors).toEqual([]);
	});

	/* ============================================================
	   Critère 11 (cas limite) : liste entièrement acquise, l'écran reste
	   utilisable — il ne se vide pas quand plus aucun mode ciblé n'est utile.
	   Depuis #658, le mode restant ne stagne plus en zone basse sans porte
	   d'entrée : il EST la marche que sert le bouton de tête (ici mot caché,
	   sans voix stubbée), qui quitte donc `.mode-choice-epuises` — seules les
	   tuiles, l'autre mode terminé, y restent.
	   ============================================================ */
	test("critère 11 : liste entièrement acquise, l'écran de choix ne se vide pas", async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await seedOrtho(page, SEED_COMPLET);
		await gotoHash(page, 'ortho-mode-' + LESSON_COMPLET);

		// Plus aucun mode ciblé utile en zone principale : ni tuiles ni mot caché
		// n'y apparaissent comme bouton « à faire ».
		await expect(page.locator('.mode-choice-list .mode-btn[data-mode="tuiles"]')).toHaveCount(0);
		await expect(page.locator('.mode-choice-list .mode-btn[data-mode="motCache"]')).toHaveCount(0);

		// … mais l'écran ne se vide pas pour autant : le bouton de tête sert la
		// marche la plus haute jouable (mot caché, sans voix) au lieu du parcours
		// complet, et « Relire mes mots » reste disponible.
		await expect(
			page.locator('.mode-choice-list .mode-btn.recommended[data-marche="motCache"]'),
		).toBeVisible();
		await expect(page.locator('#btnRevoir')).toBeVisible();

		// Tuiles, l'autre mode terminé, reste accessible plus bas…
		await expect(
			page.locator('.mode-choice-epuises .mode-btn[data-mode="tuiles"][data-epuise="1"]'),
		).toBeVisible();
		// … mais mot caché, promu en tête, a quitté cette zone : il n'y apparaît plus en double.
		await expect(page.locator('.mode-choice-epuises .mode-btn[data-mode="motCache"]')).toHaveCount(
			0,
		);

		expect(errors).toEqual([]);
	});

	/* ============================================================
	   Critère 8 : lancé depuis le programme du jour (pas le catalogue), un
	   mode déjà terminé pour la liste n'apparaît pas en zone principale — même
	   règle que le critère 7, vérifiée depuis l'autre porte d'entrée
	   (`lancerEtapeProgramme` → `startOrthoLecon(id, 'programme')`, ui/seance.ts).
	   ============================================================ */
	test('critère 8 : lancé depuis le programme du jour, un mode terminé n’apparaît pas en zone principale', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.addInitScript(CLEAR_PIN);
		await seedOrtho(page, SEED_PARTIEL);
		await seedAideVue(page);
		await gotoHash(page, 'encadrant/programme');

		await page.locator('[data-act="seance-add"]').click();
		await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('dictee');

		const fieldset = page.locator('fieldset.enc-seance-dictees');
		await expect(fieldset).toBeVisible();
		await cibleUniquementNotreListe(fieldset, LESSON_PARTIEL);
		await expect(fieldset.locator('input[data-act="seance-dictee-toggle"]:checked')).toHaveCount(1);

		for (let jour = 1; jour <= 7; jour++) {
			await page
				.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
				.check();
		}

		await page.locator('.enc-back[data-act="retour"]').click();
		await page.locator('#cardProgramme').click();
		await expect(page).toHaveURL(/#seance$/);

		const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
		await expect(tuile).toBeVisible();
		await tuile.click();

		// Liste déjà découverte (atelierFait) : startOrthoLecon mène droit à l'écran de choix.
		await expect(page).toHaveURL(/#ortho-mode-/);
		await expect(page.locator('.mode-choice-list .mode-btn[data-mode="tuiles"]')).toHaveCount(0);
		await expect(
			page.locator('.mode-choice-epuises .mode-btn[data-mode="tuiles"][data-epuise="1"]'),
		).toBeVisible();

		expect(errors).toEqual([]);
	});

	/* ============================================================
	   Critère 12 (SINGULIER) : quand une séance CIBLÉE fait franchir le
	   dernier mot d'UN SEUL mode (mais n'étoile pas la liste — mot caché
	   reste dû), l'écran de fin le dit explicitement. Emplacement non
	   tranché : on n'accroche que `.ortho-mode-epuise` et un fragment
	   RÉELLEMENT commun aux deux variantes (« toujours des points »), jamais
	   la phrase entière.
	   ============================================================ */
	test("critère 12 (singulier) : un mode qui vient d'être terminé pendant la séance ciblée, l'écran de fin le dit", async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await seedOrtho(page, SEED_SEANCE_TUILES);
		await seedAideVue(page);
		await gotoHash(page, 'ortho-mode-' + LESSON_SEANCE);
		await page.locator('.mode-btn[data-mode="tuiles"]').click();

		// 8 activités (SEANCE_MAX) : chat déjà validé tuiles (rejoué sans effet), lion
		// franchit tuiles à sa 1re réussite (2e activité) — le mode bascule en cours de route.
		const mots = ['chat', 'lion', 'chat', 'lion', 'chat', 'lion', 'chat', 'lion'];
		for (const mot of mots) {
			await page.locator('.tuiles-bac button.tuile:not(.tuile-used)').first().waitFor();
			await completerTuiles(page, mot);
		}

		// Pause de séance : la liste n'est pas maîtrisée (mot caché reste dû), donc pas de bilan.
		await expect(page.getByRole('heading', { name: 'Bonne séance !' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Liste prête' })).toHaveCount(0);

		// Le mode « tuiles » vient d'être terminé PENDANT cette séance : l'écran le dit,
		// sans jamais employer « épuisé » ni « maîtrisé » (contrat §F).
		const message = page.locator('.ortho-mode-epuise');
		await expect(message).toBeVisible();
		await expect(message).toContainText(/toujours des points/i);
		await expect(message).not.toContainText(/épuisé/i);
		await expect(message).not.toContainText(/maîtris/i);
		// Le message doit être ANNONCÉ, pas seulement affiché : l'écran de pause est rendu d'un
		// coup et le focus part aussitôt sur « Continuer encore un peu », qui suit ce bloc dans
		// le DOM. Même garde que `mots-difficiles.spec.ts` sur le bloc voisin du même écran.
		await expect(message).toHaveAttribute('role', 'status');
		await expect(message).toHaveAttribute('aria-atomic', 'true');

		expect(errors).toEqual([]);
	});

	/* ============================================================
	   Critère 13 : la célébration « Liste prête ! » prime — aucun message
	   d'épuisement de mode ne s'y ajoute quand la dernière réussite valide
	   plusieurs modes d'un coup (effet direct du cumul, critère 1).
	   ============================================================ */
	test('critère 13 : la célébration « Liste prête ! » prime, aucun message de mode terminé ne s’y ajoute', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await seedOrtho(page, SEED_SEANCE_MOTCACHE);
		await seedAideVue(page);
		await gotoHash(page, 'ortho-mode-' + LESSON_ETOILE);
		await page.locator('.mode-btn[data-mode="motCache"]').click();

		// Le mode ciblé « mot caché » valide par cumul tuiles ET mot caché (critère 1) : les 2
		// mots franchissent donc la dernière marche à la même activité, ce qui étoile la liste
		// ET termine les deux modes simultanément.
		await completerMotCache(page, 'chat');
		await completerMotCache(page, 'lion');

		await expect(page.getByRole('heading', { name: 'Liste prête' })).toBeVisible();
		// Aucun message de mode terminé empilé à côté de la célébration.
		await expect(page.locator('.ortho-mode-epuise')).toHaveCount(0);

		expect(errors).toEqual([]);
	});

	/* ============================================================
	   Critère 22 : le journal d'erreurs de l'espace encadrant continue de
	   capturer même depuis la zone basse (mode déjà terminé pour la liste) —
	   chemin d'entrée NOUVEAU introduit par #641, non couvert par
	   journal-couverture.ts (qui ne joue que des modes en zone principale).
	   ============================================================ */
	test('critère 22 : un mode terminé, joué depuis la zone basse, journalise toujours ses erreurs', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await page.addInitScript(CLEAR_PIN);
		await seedOrtho(page, SEED_PARTIEL);
		await seedAideVue(page);
		await gotoHash(page, 'ortho-mode-' + LESSON_PARTIEL);

		const epuise = page.locator(
			'.mode-choice-epuises .mode-btn[data-mode="tuiles"][data-epuise="1"]',
		);
		await expect(epuise).toBeVisible(); // échoue en 5 s (défaut expect) plutôt que le timeout du test
		await epuise.click();

		// Ne pose que 2 lettres du bac : le mot construit est trop court, donc faux (même geste
		// que l'entrée « tuiles » de journal-couverture.ts, rejoué depuis la zone basse).
		const lettres = page.locator('#bac .tuile[data-i]');
		await lettres.first().waitFor();
		await lettres.nth(0).click();
		await lettres.nth(0).click(); // le bac se referme sur les restantes
		await page.locator('#btnVerifTuiles').click();
		await page.locator('.fb-ko').waitFor();

		await gotoHash(page, 'encadrant');
		const carte = page.locator('.enc-err-lecon');
		await expect(
			carte,
			"Le geste depuis la zone basse n'a produit aucune entrée dans le journal (#391).",
		).toHaveCount(1);
		await carte.locator('.enc-err-sum').click();
		await expect(carte.locator('.enc-err-donnee').first()).toHaveText(/Réponse donnée\s*:\s*\S/);
		await expect(carte.locator('.enc-err-bonne').first()).toHaveText(/Réponse attendue\s*:\s*\S/);

		expect(errors).toEqual([]);
	});
});

/* ============================================================
   Avec voix disponible (dictée requise, stub) : régime nécessaire pour la
   variante PLURIEL du critère 12, qui ne peut se produire QUE si la dictée
   reste due après que le cumul a basculé tuiles ET mot caché — sinon la
   liste (2 modes requis seulement) s'achève et on retombe dans le critère
   13, qui supprime le message.
   ============================================================ */
test.describe('avec voix disponible (dictée requise, stub)', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(STUB_VOIX_FR);
	});

	test('critère 12 (pluriel) : deux modes terminés d’un coup, le message s’accorde, sans étoiler la liste', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		const LESSON_PLURIEL = 'l-e2e-choix-cumul-pluriel';
		await seedOrtho(page, {
			banque: { m1: motVierge('m1', 'chat') },
			listes: [
				{
					id: LESSON_PLURIEL,
					label: 'Liste pluriel',
					motIds: ['m1'],
					createdAt: 1,
					updatedAt: 1,
				},
			],
			motIdParForme: { chat: 'm1' },
		});
		await seedAideVue(page);
		await gotoHash(page, 'ortho-mode-' + LESSON_PLURIEL);
		await page.locator('.mode-btn[data-mode="motCache"]').click();

		// Voix dispo → dictée requise : mot caché seul ne peut jamais achever la liste
		// (elle resterait due). Les tuiles ET le mot caché basculent tous deux dès la
		// 1re réussite (cumul, critère 1) ; les 7 réussites suivantes, sur le même
		// unique mot, ne font qu'épuiser les 8 activités de la séance (SEANCE_MAX)
		// jusqu'à la pause — seul écran où ce message s'affiche (contrat §F).
		for (let i = 0; i < 8; i++) await completerMotCache(page, 'chat');

		await expect(page.getByRole('heading', { name: 'Bonne séance !' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Liste prête' })).toHaveCount(0);

		const message = page.locator('.ortho-mode-epuise');
		await expect(message).toBeVisible();
		await expect(message).toContainText(/toujours des points/i);
		// Accord PLURIEL : deux modes terminés d'un coup, pas un seul.
		await expect(message).toContainText(/ces modes/i);
		await expect(message).not.toContainText(/épuisé/i);
		await expect(message).not.toContainText(/maîtris/i);

		expect(errors).toEqual([]);
	});
});
