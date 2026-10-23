/* ============================================================
   Bilan en PARCOURS guidé (#777), seconde spec : ce qui se passe AUTOUR du parcours.
   ------------------------------------------------------------
   Écrit AVANT l'implémentation (#777, skill /cadrer) : rouge à l'arrivée.
   `bilan-parcours.spec.ts` tient l'écran lui-même ; celle-ci tient ses effets :
   reprise après interruption, crédit unique, journal du parent, favoris déjà
   stockés, et le QCM à trou rendu hors runner.

   Traduit les critères 16 (reprise), 15 + N4 (crédit unique), 12 (journal),
   N6 (favoris existants) et 1 (QCM à trou à l'écran, côté interaction).

   Contrat d'écran : celui de `bilan-parcours.spec.ts` (recopié, pas importé : une
   spec ne partage pas ses helpers de jeu). Les libellés ne sont pas figés ; seuls
   les gabarits `data-*`, les motifs « k sur n » et les classes du journal existant
   (`.enc-err-item--passe` = « n'a pas essayé ») portent l'exigence.

   Aucun test de ce fichier n'est vert d'emblée : tous rougissent d'abord sur
   l'attente de `#sheets .bilan-parcours` (ou, pour le critère 1, sur l'absence des
   boutons radio du QCM à trou). Chaque test dit, en fin de corps, la mutation de
   l'implémentation qui le ferait rougir une fois vert.
   ============================================================ */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';
import { codeDe, decoderResultat, envoiBilanDe } from './partage-fixtures';

/* ---------- Seeds ---------- */

interface FavoriSeed {
	id: string;
	label: string;
	lessonIds: string[];
	questionsPerLesson: number | 'all';
	mode?: 'bilan';
	categoryId?: string;
}

const ID_FAVORI = 'fav-777';

function favori(lessonIds: string[], nbq: number, over: Partial<FavoriSeed> = {}): FavoriSeed {
	return {
		id: ID_FAVORI,
		label: 'Parcours 777',
		lessonIds,
		questionsPerLesson: nbq,
		mode: 'bilan',
		...over,
	};
}

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

async function seedFavoris(page: Page, bilans: FavoriSeed[]): Promise<void> {
	await page.addInitScript(
		(json) => localStorage.setItem('e2e/ludaskia_bilans', json),
		JSON.stringify(bilans),
	);
}

/* Un programme du jour d'UNE étape « Un bilan favori » (seed direct, comme
   `programme-favori.spec.ts`). */
async function seedFavorisEtProgramme(page: Page, bilans: FavoriSeed[]): Promise<void> {
	const defs = [
		{
			id: 'd1',
			etapes: [{ id: 'e1', kind: 'favori', refs: [ID_FAVORI], count: 1 }],
			recurrence: { type: 'hebdo', jours: [1, 2, 3, 4, 5, 6, 7] },
		},
	];
	await page.addInitScript(
		(seed) => {
			localStorage.setItem('e2e/ludaskia_bilans', seed.bilans);
			localStorage.setItem('e2e/ludaskia_seance', seed.defs);
			localStorage.removeItem('ludaskia_encadrant_lock');
		},
		{ bilans: JSON.stringify(bilans), defs: JSON.stringify(defs) },
	);
}

/* Deux leçons numériques de deux CATÉGORIES différentes (calcul mental, calcul posé) :
   un parcours de deux parties, joué juste ou faux sans lire de contenu. */
const LECON_NUM = 'math-complements';
const LECON_POSEE = 'calc-addition-posee';

/* ---------- Jeu du parcours (recopié de bilan-parcours.spec.ts, plus un pas-à-pas) ---------- */

type Geste = 'juste' | 'faux' | 'passe';
type Ecran = 'question' | 'fin-partie' | 'recap';

interface Trace {
	kind: string;
	lesson: string;
	/** Réponse attendue lue dans le DOM (saisie numérique, QCM) ; null sinon. */
	answer: string | null;
	/** Ce que l'enfant a donné (saisie ou valeur du choix), '' si passée. */
	donnee: string;
	partie: string;
	question: string;
}

const numeros = (texte: string): number[] => (texte.match(/\d+/g) ?? []).map(Number);
const sansEspaces = (s: string) => s.replace(/\s/g, '');

async function ecranCourant(page: Page): Promise<Ecran> {
	const t = (sel: string) => page.locator(sel);
	await t('#bpStage, .bp-fin-partie, .bp-recap').first().waitFor({ state: 'visible' });
	if (await t('.bp-recap').isVisible()) return 'recap';
	if (await t('.bp-fin-partie').isVisible()) return 'fin-partie';
	return 'question';
}

async function lancerFavoriAccueil(page: Page, bilans: FavoriSeed[]): Promise<void> {
	await seedFavoris(page, bilans);
	await gotoHash(page, 'accueil');
	await page.locator('.favori-btn-run').first().click();
	await expect(page.locator('#sheets .bilan-parcours')).toBeVisible();
}

/* Répond à la question affichée. Seules les saisies numériques (`num`, `posee`) se
   répondent juste ou faux ; un QCM se répond juste ou faux par son `data-answer` ; un
   « clic-mot » se répond faux en cliquant TOUS les mots (les intrus rendent la sélection
   fausse, cf. journal-couverture.ts) ; le reste est passé. */
async function jouerQuestion(
	page: Page,
	gesteOuParLecon: Geste | ((lecon: string) => Geste),
): Promise<Trace> {
	const t = (sel: string) => page.locator(sel);
	const stage = t('#bpStage');
	const kind = (await stage.getAttribute('data-kind')) ?? '';
	const trace: Trace = {
		kind,
		lesson: (await stage.getAttribute('data-lesson')) ?? '',
		answer:
			kind === 'num'
				? await t('#bpInput').getAttribute('data-answer')
				: kind === 'qcm'
					? await stage.getAttribute('data-answer')
					: null,
		donnee: '',
		partie: (await t('.bp-partie-num').innerText()).trim(),
		question: (await t('.bp-question-num').innerText()).trim(),
	};
	const geste =
		typeof gesteOuParLecon === 'function' ? gesteOuParLecon(trace.lesson) : gesteOuParLecon;
	const avant = `${trace.partie}|${trace.question}`;
	if (geste === 'passe') {
		await t('#bpPasser').click();
	} else if (kind === 'num') {
		trace.donnee = geste === 'juste' ? trace.answer! : `${trace.answer}7`;
		await t('#bpInput').fill(trace.donnee);
		await t('#bpValider').click();
	} else if (kind === 'posee') {
		const cells = t('.posee-input[data-answer]');
		const n = await cells.count();
		for (let c = 0; c < n; c++) {
			const rep = (await cells.nth(c).getAttribute('data-answer')) ?? '';
			await cells.nth(c).fill(geste === 'juste' ? rep : `${rep}7`);
		}
		await t('#bpValider').click();
	} else if (kind === 'qcm') {
		const valeurs = await t('.bp-choice[data-value]').evaluateAll((els) =>
			els.map((e) => e.getAttribute('data-value') ?? ''),
		);
		const choix = geste === 'juste' ? trace.answer : valeurs.find((v) => v !== trace.answer);
		expect(choix, 'un choix du QCM à cliquer').toBeTruthy();
		trace.donnee = choix!;
		await t('.bp-choice[data-value]').evaluateAll(
			(els, v) => (els.find((e) => e.getAttribute('data-value') === v) as HTMLElement).click(),
			choix!,
		);
		await t('#bpValider').click();
	} else if (kind === 'clicMot' && geste === 'faux') {
		const mots = t('.lclic-mot');
		const n = await mots.count();
		for (let i = 0; i < n; i++) await mots.nth(i).click();
		trace.donnee = 'tous les mots';
		await t('#bpValider').click();
	} else {
		throw new Error(`geste « ${geste} » non pris en charge pour le format ${kind}`);
	}
	await page.waitForFunction((a) => {
		if (!document.querySelector('#bpStage') || document.querySelector('.bp-fin-partie'))
			return true;
		const p = document.querySelector('.bp-partie-num')?.textContent?.trim();
		const q = document.querySelector('.bp-question-num')?.textContent?.trim();
		return `${p}|${q}` !== a;
	}, avant);
	return trace;
}

/* Joue les questions de la partie courante jusqu'à sa correction (qui reste affichée). */
async function jouerPartie(
	page: Page,
	geste: (t: Trace | null, i: number) => Geste,
): Promise<Trace[]> {
	const traces: Trace[] = [];
	while ((await ecranCourant(page)) === 'question') {
		const g = geste(null, traces.length);
		traces.push(await jouerQuestion(page, g));
	}
	await expect(page.locator('.bp-fin-partie')).toBeVisible();
	return traces;
}

const partieSuivante = (page: Page) =>
	page.locator('#bpPartieSuivante, #bpVoirBilan').first().click();

/* Joue tout le reste du parcours jusqu'au récapitulatif. */
async function jusquAuRecap(
	page: Page,
	geste: Geste | ((lecon: string) => Geste),
): Promise<Trace[]> {
	const traces: Trace[] = [];
	for (let garde = 0; garde < 200; garde++) {
		const ecran = await ecranCourant(page);
		if (ecran === 'recap') return traces;
		if (ecran === 'fin-partie') {
			await partieSuivante(page);
			continue;
		}
		traces.push(await jouerQuestion(page, geste));
	}
	throw new Error('Le parcours ne se termine pas (garde 200 écrans)');
}

/* Ce qui permet de reconnaître LA MÊME question : énoncé et réponses attendues exposées. */
async function signature(page: Page): Promise<string> {
	return page.locator('#bpStage').evaluate((el) => {
		const attendues = [...el.querySelectorAll('[data-answer]')]
			.map((e) => e.getAttribute('data-answer'))
			.join('|');
		return `${(el as HTMLElement).innerText.trim()}##${el.getAttribute('data-answer') ?? ''}##${attendues}`;
	});
}

/* Quitte vers l'accueil par la barre d'outils (comme `reprise-runners.spec.ts`). */
async function quitterVersAccueil(page: Page): Promise<void> {
	await page.locator('#toolbarBurger').click();
	await page.locator('#btnHome').click();
	await expect(page.locator('#home')).toBeVisible();
}

const DIALOGUE = '[role="alertdialog"]'; // l'offre « Tu avais commencé ! »

/* Ferme les modales de récompense qui intercepteraient le clic suivant
   (même patron que programme-favori.spec.ts). */
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

/* Journal d'activité du profil e2e (forme : `{ t, k, ref? }`, cf. progress.ts). */
interface Activite {
	t: number;
	k: string;
	ref?: string;
}
async function lireBilans(page: Page): Promise<Activite[]> {
	const raw = await page.evaluate(() => localStorage.getItem('e2e/ludaskia_activity'));
	return ((raw ? JSON.parse(raw) : []) as Activite[]).filter((a) => a.k === 'bilan');
}

/* ============================================================
   Critère 16 : reprise après interruption
   ============================================================ */

/* Joue la partie 1 en entier (juste), puis UNE question de la partie 2 ; renvoie les
   traces des deux et la signature de la question 2 de la partie 2, encore à répondre. */
async function jusqueDansLaPartie2(page: Page) {
	const partie1 = await jouerPartie(page, () => 'juste');
	await partieSuivante(page);
	await expect(page.locator('#bpStage')).toBeVisible();
	const q1 = await jouerQuestion(page, 'juste');
	await expect(page.locator('#bpStage')).toBeVisible();
	return { partie1, q1, sig: await signature(page) };
}

test('critère 16 : quitter en partie 2 puis relancer le favori propose Continuer / Recommencer ; Continuer rouvre la même question 2 et le récapitulatif garde les réponses de la partie 1', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM, LECON_POSEE], 2)]);
	const { partie1, q1, sig } = await jusqueDansLaPartie2(page);
	expect(partie1.length, 'questions de la partie 1').toBe(2);
	expect(numeros(q1.partie)[0], 'on est bien en partie 2').toBe(2);
	expect(numeros(await page.locator('.bp-question-num').innerText())[0]).toBe(2);

	await quitterVersAccueil(page);
	await page.locator('.favori-btn-run').first().click();

	// L'offre existante (resume.ts) : une sortie sûre et une sortie destructive.
	const dialogue = page.locator(DIALOGUE);
	await expect(dialogue).toBeVisible();
	await expect(dialogue.locator('.modal-ok')).toBeVisible(); // Continuer
	await expect(dialogue.locator('.modal-danger')).toBeVisible(); // Recommencer
	await dialogue.locator('.modal-ok').click();

	await expect(page.locator('#sheets .bilan-parcours')).toBeVisible();
	await expect(page.locator('#bpStage')).toBeVisible();
	expect(numeros(await page.locator('.bp-partie-num').innerText())[0], 'partie rouverte').toBe(2);
	expect(numeros(await page.locator('.bp-question-num').innerText())[0], 'question rouverte').toBe(
		2,
	);
	expect(await signature(page), 'la MÊME question, pas un nouveau tirage').toBe(sig);

	await jusquAuRecap(page, 'juste');
	const recap = page.locator('.bp-recap');
	await expect(recap.locator('.bp-lecon')).toHaveCount(2);
	// Réponses d'AVANT l'interruption : les 2 de la partie 1 et la 1re de la partie 2.
	for (const lecon of [partie1[0].lesson, q1.lesson]) {
		await expect(recap.locator(`.bp-lecon[data-lesson="${lecon}"] .bp-score`)).toHaveText(
			/^\s*2 sur 2\s*$/,
		);
	}
	expect(errors).toEqual([]);
	// Mutation (à jouer une fois l'implémentation faite) : ne pas inclure les `reponses`
	// de l'instantané dans l'état restauré. Les deux scores du récapitulatif tomberaient
	// à « 1 sur 2 » (partie 2) ou « 0 sur 2 » (partie 1) et ce test rougirait.
});

/* ============================================================
   Critères 15 + N4 : un seul crédit « bilan » par bilan fini
   ============================================================ */

test('critères 15 et N4 : aucun crédit avant la dernière partie ; la fin crédite UNE activité « bilan » du favori et coche l’étape « Un bilan favori »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedFavorisEtProgramme(page, [favori([LECON_NUM, LECON_POSEE], 2)]);
	await gotoHash(page, 'seance');
	await page.locator('.programme-tuile[data-act="lancer"]').first().click();
	await expect(page.locator('#sheets .bilan-parcours')).toBeVisible();

	// Fin de la partie 1 (correction affichée) : le bilan n'est PAS fini, rien n'est crédité.
	await jouerPartie(page, () => 'juste');
	expect(await lireBilans(page), 'crédit après la partie 1').toEqual([]);
	await partieSuivante(page);
	await jouerQuestion(page, 'juste');
	expect(await lireBilans(page), 'crédit en pleine partie 2').toEqual([]);

	await jusquAuRecap(page, 'juste');
	const credits = await lireBilans(page);
	expect(credits, 'une seule activité « bilan » pour un bilan fini').toHaveLength(1);
	expect(credits[0].ref, 'rattachée au favori (c’est ce qui coche l’étape)').toBe(ID_FAVORI);

	await fermerModalesRecompense(page);
	await quitterVersAccueil(page);
	await fermerModalesRecompense(page);
	// Une étape unique cochée = programme fini (repère de programme-favori.spec.ts).
	await expect(page.locator('#cardProgramme')).toHaveClass(/programme-card--fini/);
	await expect(page.locator('#cardProgramme .go')).toHaveCount(0);
	expect(errors).toEqual([]);
	// Mutation : journaliser l'activité à la fin de CHAQUE partie (au lieu de la dernière).
	// `lireBilans` renverrait 1 entrée après la partie 1, et 2 à la fin : rouge aux deux endroits.
});

test('critère N4 : une reprise (quitter, Continuer, finir) ne crédite qu’UNE fois, et rien tant que le bilan n’est pas fini', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM, LECON_POSEE], 2)]);
	await jusqueDansLaPartie2(page);

	await quitterVersAccueil(page);
	expect(await lireBilans(page), 'crédit d’un bilan abandonné').toEqual([]);
	await page.locator('.favori-btn-run').first().click();
	await page.locator(`${DIALOGUE} .modal-ok`).click(); // Continuer
	await expect(page.locator('#bpStage')).toBeVisible();

	await jusquAuRecap(page, 'juste');
	expect(await lireBilans(page), 'un bilan repris puis fini').toHaveLength(1);
	expect(errors).toEqual([]);
	// Mutation : créditer à la reprise (au lancement d'un instantané) EN PLUS de la fin.
	// Deux entrées après `jusquAuRecap` ; ou, si le crédit se fait à l'abandon, une
	// entrée avant la reprise : les deux assertions ci-dessus rougissent.
});

test('critère N4 : « Recommencer » en cours de route puis finir ne crédite qu’UNE fois pour ce bilan', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM, LECON_POSEE], 2)]);
	await jusqueDansLaPartie2(page);

	await quitterVersAccueil(page);
	await page.locator('.favori-btn-run').first().click();
	await page.locator(`${DIALOGUE} .modal-danger`).click(); // Recommencer du début
	await expect(page.locator('#bpStage')).toBeVisible();
	expect(numeros(await page.locator('.bp-partie-num').innerText())[0], 'repart en partie 1').toBe(
		1,
	);
	expect(numeros(await page.locator('.bp-question-num').innerText())[0]).toBe(1);
	expect(await lireBilans(page), 'crédit juste après Recommencer').toEqual([]);

	await jusquAuRecap(page, 'juste');
	expect(await lireBilans(page), 'un bilan recommencé puis fini').toHaveLength(1);
	expect(errors).toEqual([]);
	// Mutation : ne pas effacer l'instantané ni le compteur au « Recommencer » (le bilan
	// abandonné resterait crédité) : l'assertion « juste après Recommencer » ou le
	// décompte final (2) rougirait.
});

/* ============================================================
   Critère 12 : le journal du parent reçoit chaque erreur du parcours
   ============================================================ */

interface EntreeJournal {
	lessonId: string;
	question: string;
	donnee: string;
	attendue: string;
	sansTentative?: true;
}

const lireErreurs = async (page: Page): Promise<EntreeJournal[]> =>
	JSON.parse(
		(await page.evaluate(() => localStorage.getItem('e2e/ludaskia_erreurs'))) ?? '[]',
	) as EntreeJournal[];

test('critère 12 : saisie fausse, QCM faux, clic-mot faux et question passée remontent côté encadrant avec leçon, énoncé et réponse attendue ; la passée est « n’a pas essayé »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	const SAISIE = LECON_NUM;
	const QCM = 'fr-conj-groupe';
	const CLIC = 'fr-gram-clic-verbe';
	const PASSEE = 'math-doubles';
	await lancerFavoriAccueil(page, [favori([SAISIE, QCM, CLIC, PASSEE], 1)]);

	const traces = await jusquAuRecap(page, (lecon) => (lecon === PASSEE ? 'passe' : 'faux'));
	expect(traces.map((t) => t.lesson).sort(), 'une question par leçon').toEqual(
		[SAISIE, QCM, CLIC, PASSEE].sort(),
	);
	const de = (lecon: string) => traces.find((t) => t.lesson === lecon)!;

	// Le journal : une entrée au moins par erreur, avec leçon, énoncé lisible, attendue.
	const journal = await lireErreurs(page);
	for (const lecon of [SAISIE, QCM, CLIC, PASSEE]) {
		const entrees = journal.filter((e) => e.lessonId === lecon);
		expect(entrees.length, `entrée(s) du journal pour ${lecon}`).toBeGreaterThanOrEqual(1);
		for (const e of entrees) {
			expect(e.question.trim(), `énoncé de ${lecon}`).not.toBe('');
			expect(e.question, `énoncé de ${lecon} sans marqueur interne`).not.toContain('@');
			expect(e.attendue.trim(), `réponse attendue de ${lecon}`).not.toBe('');
		}
	}
	const saisie = journal.find((e) => e.lessonId === SAISIE)!;
	expect(sansEspaces(saisie.attendue)).toContain(sansEspaces(de(SAISIE).answer!));
	expect(sansEspaces(saisie.donnee)).toContain(sansEspaces(de(SAISIE).donnee));
	const qcm = journal.find((e) => e.lessonId === QCM)!;
	expect(sansEspaces(qcm.attendue)).toContain(sansEspaces(de(QCM).answer!));
	// Les trois erreurs tentées ont une réponse donnée non vide, et ne sont pas « passées ».
	for (const lecon of [SAISIE, QCM, CLIC]) {
		for (const e of journal.filter((x) => x.lessonId === lecon)) {
			expect(e.donnee.trim(), `réponse donnée de ${lecon}`).not.toBe('');
			expect(e.sansTentative, `${lecon} n’est pas une question passée`).toBeUndefined();
		}
	}
	// La question passée suit la convention existante : marqueur `sansTentative`, rien donné.
	const passee = journal.filter((e) => e.lessonId === PASSEE);
	for (const e of passee) {
		expect(e.sansTentative, 'la question passée est marquée non tentée').toBe(true);
		expect(e.donnee, 'rien donné pour une question passée').toBe('');
	}

	// Côté encadrant : même constat à l'écran, une carte par leçon.
	// #777 : un bilan annonce ses récompenses par les modales habituelles ; une éventuelle
	// modale ouverte rendrait le reste de la page inerte, on la ferme avant de naviguer.
	await fermerModalesRecompense(page);
	await gotoHash(page, 'encadrant');
	const lecons = page.locator('.enc-err-lecon');
	await expect(lecons.first()).toBeVisible();
	await expect(lecons).toHaveCount(4);
	for (const l of await lecons.all()) await l.locator('.enc-err-sum').click();
	expect(await page.locator('.enc-err-item').count()).toBeGreaterThanOrEqual(4);
	for (const q of await page.locator('.enc-err-q').all()) await expect(q).toHaveText(/\S/);
	for (const b of await page.locator('.enc-err-bonne').all())
		expect((await b.innerText()).replace(/^[^:]*:/, '').trim()).not.toBe('');
	await expect(page.locator('.enc-err-item--passe')).toHaveCount(passee.length);
	// Les erreurs tentées affichent leur réponse donnée, la passée non.
	await expect(page.locator('.enc-err-item:not(.enc-err-item--passe) .enc-err-donnee')).toHaveCount(
		journal.length - passee.length,
	);
	await expect(page.locator('.enc-err-item--passe .enc-err-donnee')).toHaveCount(0);
	for (const d of await page.locator('.enc-err-donnee').all())
		expect((await d.innerText()).replace(/^[^:]*:/, '').trim()).not.toBe('');
	expect(errors).toEqual([]);
	// Mutation : ne pas appeler `capterErreur` pour le clic-mot (ou le QCM) dans le runner
	// du parcours : la carte de la leçon manque (`toHaveCount(4)`) et l'entrée aussi.
	// Autre mutation : passer `sansTentative: false` pour « Je passe » : le
	// `.enc-err-item--passe` disparaît et `toBe(true)` rougit.
});

/* ============================================================
   N6 : les favoris déjà stockés se lancent en parcours
   ============================================================ */

/* Forme réelle d'un export : avec `mode: 'bilan'` + `categoryId`, puis SANS `mode`
   (favoris d'avant l'ajout du champ). */
const FORMES_STOCKEES: { titre: string; favori: FavoriSeed }[] = [
	{
		titre: 'avec mode « bilan » et catégorie',
		favori: favori([LECON_NUM], 3, { categoryId: 'math-calcul-mental' }),
	},
	{
		titre: 'sans champ mode',
		favori: (() => {
			const f = favori([LECON_NUM], 3, { categoryId: 'math-calcul-mental' });
			delete f.mode;
			return f;
		})(),
	},
];

for (const { titre, favori: f } of FORMES_STOCKEES) {
	test(`critère N6 : un favori stocké ${titre} se lance en parcours et se joue jusqu’au récapitulatif, sans erreur`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		expect('mode' in f, 'le seed reflète bien la forme visée').toBe(titre.includes('avec mode'));
		await lancerFavoriAccueil(page, [f]);
		await expect(page.locator('.bilan-grid')).toBeHidden();
		await expect(page.locator('.bp-partie-num')).toBeVisible();
		await jusquAuRecap(page, 'juste');
		await expect(page.locator('.bp-recap .bp-lecon')).toHaveCount(1);
		expect(errors).toEqual([]);
		// Mutation : le lancement d'un favori teste `mode === 'bilan'` strictement et traite
		// l'absence de `mode` comme un sprint (ou ne fait rien) : seule la 2e forme rougit.
	});
}

/* ============================================================
   Critère 1 : QCM à trou rendu HORS runner, côté interaction
   (séance partagée reçue par lien : même `renderItem` que le bilan).
   Piège : sur une leçon À RUNNER (ex. `fr-homophones-et`), l'envoi se joue dans le runner
   « une question à la fois » et `renderItem` n'est jamais appelé : le test ne verrait pas
   l'écran visé. Le bloc est donc rattaché à `num-frac-sens`, leçon de fiche (même choix
   que `partage-seance.spec.ts`, QCM dans un bilan).
   ============================================================ */

/* Texte VISIBLE de l'énoncé, hors groupe de choix, hors case « Je ne sais pas » ; y compris
   la valeur d'un éventuel champ de saisie visible posé au trou. Un champ caché (`.ans`
   alimenté par le radio) ne compte pas : c'est le trou à l'écran que le critère exige. */
async function texteAuTrou(item: Locator): Promise<string[]> {
	const brut = await item.evaluate((el) => {
		const c = el.cloneNode(true) as HTMLElement;
		c.querySelectorAll('fieldset.fiche-choix, .partage-jnsp, legend, .sr-only').forEach((n) =>
			n.remove(),
		);
		const valeurs = [...c.querySelectorAll<HTMLInputElement>('input')]
			.filter((i) => !['hidden', 'radio', 'checkbox'].includes(i.type))
			.map((i) => i.value);
		return `${c.textContent ?? ''} ${valeurs.join(' ')}`;
	});
	return brut.split(/[^\p{L}]+/u).filter(Boolean);
}

test('critère 1 : un QCM à trou montre ses choix, toucher un choix le place dans le trou, la correction compte le bon choix', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const code = await codeDe(
		envoiBilanDe([
			{
				lecon: 'num-frac-sens',
				exercices: [
					{
						type: 'qcm',
						question: 'Le chat @ le chien dorment.',
						answer: 'et',
						choices: ['et', 'est'],
					},
				],
			},
		]),
	);
	await gotoHash(page, `envoi/${code}`);
	await page.locator('#partageCommencer').click();
	const item = page.locator('.partage-item').first();
	await expect(item).toBeVisible();

	// Les choix sont visibles : un radio par choix, dans un seul groupe.
	const radios = item.locator('input[type="radio"]');
	await expect(radios).toHaveCount(2);
	expect(
		await radios.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).sort()),
	).toEqual(['est', 'et']);
	expect(
		new Set(await radios.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).name))).size,
		'un seul groupe',
	).toBe(1);
	const choix = (valeur: string) =>
		item.locator('label.fiche-choix-opt', { has: page.locator(`input[value="${valeur}"]`) });
	await expect(choix('et')).toBeVisible();
	await expect(choix('est')).toBeVisible();

	// Trou vide au départ, jamais de « @ » brut, le reste de l'énoncé est lu.
	const avant = await texteAuTrou(item);
	expect(avant).toEqual(expect.arrayContaining(['chat', 'chien']));
	expect(avant).not.toContain('et');
	expect(avant).not.toContain('est');
	expect(await item.innerText()).not.toContain('@');

	// Toucher un mauvais choix le place dans le trou ; en toucher un autre le remplace.
	await choix('est').click();
	expect(await texteAuTrou(item), 'le choix « est » est dans le trou').toContain('est');
	await choix('et').click();
	const apres = await texteAuTrou(item);
	expect(apres, 'le choix « et » est dans le trou').toContain('et');
	expect(apres, 'le précédent choix a quitté le trou').not.toContain('est');

	// La correction compte juste le bon choix.
	await page.locator('#partageFini').click();
	await expect(page.locator('#partageFin')).toBeVisible();
	const lien = await page.locator('#partageLien').inputValue();
	const r = await decoderResultat(lien.slice(lien.indexOf('#resultat/') + '#resultat/'.length));
	if (!r.ok) throw new Error(`résultat non décodable : ${r.raison}`);
	expect(r.valeur.reponses.map((x) => x.statut)).toEqual(['juste']);
	expect(r.valeur.reponses[0].saisie).toBe('et');
	expect(errors).toEqual([]);
	// Mutations : (a) rendre le QCM à trou par un simple champ texte (état actuel : aucun
	// radio, `toHaveCount(2)` rougit) ; (b) câbler le radio au seul champ caché sans rien
	// écrire à l'emplacement du trou : `texteAuTrou` ignore les champs cachés, les deux
	// assertions « dans le trou » rougissent.
});
