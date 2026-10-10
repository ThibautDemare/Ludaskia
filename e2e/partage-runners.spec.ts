/* ============================================================
   Séance partagée (#734), PR 4 : un envoi `lecon` joué dans l'un des DIX runners
   « une question à la fois » (QCM, QCM multi, tuiles nombre / ordre / tri, tableau de
   conversion, appariement, problème, clic-mot, droite graduée).

   Spec écrite AVANT l'implémentation, depuis le contrat de la PR 4 et les critères 7 à
   17, 23 à 26 et 28 de l'issue. Elle est ROUGE tant que l'envoi en runner est refusé.

   Chaque format joue TROIS questions écrites à la main (le tirage ne joue aucun rôle) :
   la 1re juste, la 2e fausse, la 3e « Je ne sais pas ». Les gestes viennent de
   `journal-couverture.ts` ; là où il devine (appariement, tri), ce fichier les écrit
   déterministes parce que les exercices sont connus.

   Libellés : seuls sont cités mot pour mot ceux qui SONT l'objet du test (nom accessible
   « Valider », annonce « Réponse enregistrée. Question k sur n. », « Je ne sais pas »),
   validés dans le contrat de l'écran. Le reste s'asserte sur l'exigence.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import type { Exercise } from '../src/core/exercise';
import { gotoHash, seedAideVue, watchErrors } from './helpers';
import { codeDe, decoderResultat, envoiRunnerDe } from './partage-fixtures';

type Verdict = 'juste' | 'faux' | 'jnsp';
const PLAN: Verdict[] = ['juste', 'faux', 'jnsp'];
const TOTAL = 3;

interface FormatRunner {
	type: string;
	lecon: string;
	mode?: string;
	niveau: 'ce2' | 'cm1';
	exercices: Exercise[];
	/** Sous-chaîne propre à la question 1 : si elle apparaît au journal, la question juste a été journalisée. */
	marqueQ1: string;
	/** Joue la question `i` (rang dans `exercices`) avec une réponse juste ou fausse. */
	jouer(page: Page, i: number, verdict: 'juste' | 'faux'): Promise<void>;
}

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = (s: string) => new RegExp(`^\\s*${echapper(s)}\\s*$`);

/* ---------- Les dix formats ---------- */

const qcm = (question: string, answer: string): Exercise => ({
	type: 'qcm',
	question,
	answer,
	choices: ['3', '4', '5'],
});
const QCM_EX = [
	qcm('Combien font 2 + 2 ? (un)', '4'),
	qcm('Combien font 1 + 2 ? (deux)', '3'),
	qcm('Combien font 3 + 2 ? (trois)', '5'),
];

const multi = (question: string): Exercise => ({
	type: 'qcmMulti',
	question,
	propositions: [
		'Elle a un angle droit.',
		'Elle a quatre côtés égaux.',
		'Elle a trois côtés.',
		'Elle a un côté courbe.',
	],
	correctes: ['Elle a un angle droit.', 'Elle a trois côtés.'],
});

const compare = (question: string, answer: string): Exercise => ({
	type: 'tuilesNombre',
	question,
	answer,
	tuiles: ['<', '=', '>'],
});

const ordre = (question: string, tuiles: string[]): Exercise => ({
	type: 'tuilesOrdre',
	question,
	tuiles,
	ordre: [...tuiles].sort((a, b) => Number(a) - Number(b)),
	nature: 'nombres',
});

const tri = (question: string): Exercise => ({
	type: 'tuilesTri',
	question,
	categories: ['la mer', 'la forêt'],
	mots: [
		{ mot: 'algue', cat: 0 },
		{ mot: 'lisière', cat: 1 },
		{ mot: 'coquillage', cat: 0 },
		{ mot: 'sous-bois', cat: 1 },
	],
});

const NOMS_COLONNES: [string, string, boolean][] = [
	['km', 'kilomètre', false],
	['hm', 'hectomètre', true],
	['dam', 'décamètre', true],
	['m', 'mètre', false],
	['dm', 'décimètre', false],
	['cm', 'centimètre', false],
	['mm', 'millimètre', false],
];
const tableau = (metres: number): Exercise => ({
	type: 'tableauConversion',
	question: `${metres} m = @ cm`,
	answer: `${metres}00`,
	answerUnit: 'cm',
	uniteConnue: 'm',
	colonnes: NOMS_COLONNES.map(([unite, nom, transit], i) => ({
		unite,
		nom,
		transit,
		chiffres: i === 3 ? String(metres) : '0',
	})),
	parle: `Combien font ${metres} mètres en centimètres ?`,
});

const PAIRES = [
	[
		{ gauche: 'bois', droite: 'boiserie' },
		{ gauche: 'mur', droite: 'muraille' },
		{ gauche: 'terre', droite: 'terrain' },
		{ gauche: 'toit', droite: 'toiture' },
	],
	[
		{ gauche: 'fleur', droite: 'fleuriste' },
		{ gauche: 'lait', droite: 'laitier' },
		{ gauche: 'jardin', droite: 'jardinier' },
		{ gauche: 'pain', droite: 'panier' },
	],
	[
		{ gauche: 'dent', droite: 'dentiste' },
		{ gauche: 'lune', droite: 'lunette' },
		{ gauche: 'mer', droite: 'marin' },
		{ gauche: 'sel', droite: 'salière' },
	],
];
const relier = (question: string, paires: (typeof PAIRES)[number]): Exercise => ({
	type: 'appariement',
	question,
	paires,
});

const probleme = (enonce: string, a: number, b: number): Exercise => ({
	type: 'probleme',
	enonce,
	etapes: [{ question: 'Combien sont jaunes ?', answer: a - b }],
	parle: `${enonce} Combien sont jaunes ?`,
});

const clic = (tokens: string[], cible: number): Exercise => ({
	type: 'clicMot',
	tokens,
	cibleIndices: [cible],
	consigne: 'Clique sur le verbe conjugué de la phrase.',
	explication: `Le verbe dit l'action : ici « ${tokens[cible]} ».`,
	parle: tokens.join(' '),
	cibleLabel: 'le verbe conjugué',
	explicationNommeCible: true,
});

const droite = (min: number, cible: number): Exercise => {
	const max = min + 100;
	const graduations = [];
	for (let v = min; v <= max; v += 10) graduations.push({ valeur: v, label: String(v) });
	return {
		type: 'droiteGraduee',
		min,
		max,
		pas: 10,
		graduations,
		bornes: [min, min + 50, max].map((v) => ({ valeur: v, label: String(v) })),
		cible,
		cibleLabel: String(cible),
		consigne: `Place le nombre ${cible} sur la droite graduée.`,
		explication: 'Chaque graduation vaut 10.',
		parle: `Place le nombre ${cible} sur la droite graduée.`,
		pasLabel: '10',
	};
};

const FORMATS: FormatRunner[] = [
	{
		type: 'qcm',
		lecon: 'fr-homophones-a',
		mode: 'qcm',
		niveau: 'ce2',
		exercices: QCM_EX,
		marqueQ1: '(un)',
		jouer: async (page, i, verdict) => {
			const ex = QCM_EX[i] as Extract<Exercise, { type: 'qcm' }>;
			const choix = verdict === 'juste' ? ex.answer : ex.choices.find((c) => c !== ex.answer)!;
			await page
				.locator('#lqcmChoices .sprint-choice')
				.filter({ hasText: exact(choix) })
				.click();
		},
	},
	{
		type: 'qcmMulti',
		lecon: 'geo-cm1-figures-proprietes',
		mode: 'coche',
		niveau: 'cm1',
		exercices: [
			multi('Coche toutes les propriétés vraies. (un)'),
			multi('Coche toutes les propriétés vraies. (deux)'),
			multi('Coche toutes les propriétés vraies. (trois)'),
		],
		marqueQ1: '(un)',
		jouer: async (page, _i, verdict) => {
			// Vraies : 0 et 2. Faux : la seule proposition 1, qui est fausse.
			for (const k of verdict === 'juste' ? [0, 2] : [1]) {
				await page.locator(`.lqcm-multi-choice[data-i="${k}"]`).click();
			}
		},
	},
	{
		type: 'tuilesNombre',
		lecon: 'num-comparer',
		mode: 'tuiles',
		niveau: 'ce2',
		exercices: [
			compare('Compare : 12 @ 40 (un)', '<'),
			compare('Compare : 90 @ 30 (deux)', '>'),
			compare('Compare : 55 @ 55 (trois)', '='),
		],
		marqueQ1: '(un)',
		jouer: async (page, i, verdict) => {
			const bon = ['<', '>', '='][i];
			const pose = verdict === 'juste' ? bon : bon === '<' ? '>' : '<';
			await page
				.locator('.ltui-tuile')
				.filter({ hasText: exact(pose) })
				.click();
		},
	},
	{
		type: 'tuilesOrdre',
		lecon: 'num-ranger',
		mode: 'tuiles',
		niveau: 'ce2',
		exercices: [
			ordre('Range ces nombres du plus petit au plus grand. (un)', ['58', '13', '90', '31']),
			ordre('Range ces nombres du plus petit au plus grand. (deux)', ['72', '25', '64', '48']),
			ordre('Range ces nombres du plus petit au plus grand. (trois)', ['81', '19', '37', '66']),
		],
		marqueQ1: '(un)',
		jouer: async (page, i, verdict) => {
			const ex = FORMATS[3].exercices[i] as Extract<Exercise, { type: 'tuilesOrdre' }>;
			const suite =
				verdict === 'juste' ? ex.ordre : [ex.ordre[1], ex.ordre[0], ...ex.ordre.slice(2)];
			for (const v of suite) await page.locator(`.lord-tuile[data-val="${v}"]`).click();
		},
	},
	{
		type: 'tuilesTri',
		lecon: 'fr-vocab-champs-tri',
		mode: 'tri',
		niveau: 'ce2',
		exercices: [
			tri('Range chaque mot dans le bon thème. (un)'),
			tri('Range chaque mot dans le bon thème. (deux)'),
			tri('Range chaque mot dans le bon thème. (trois)'),
		],
		marqueQ1: '(un)',
		jouer: async (page, i, verdict) => {
			const ex = FORMATS[4].exercices[i] as Extract<Exercise, { type: 'tuilesTri' }>;
			for (const m of ex.mots) {
				const col = verdict === 'juste' ? m.cat : 0; // tout dans la 1re colonne : la moitié est mal classée
				await page.locator(`.ltri-tuile[data-mot="${m.mot}"]`).click();
				await page.locator(`.ltri-col[data-col="${col}"] .ltri-col-titre`).click();
			}
		},
	},
	{
		type: 'tableauConversion',
		lecon: 'mes-longueurs',
		mode: 'tableau',
		niveau: 'ce2',
		exercices: [tableau(7), tableau(4), tableau(5)],
		marqueQ1: '7 m',
		jouer: async (page, _i, verdict) => {
			await page.locator('#tcTable').waitFor();
			const n = await page.locator('.tc-cell').count();
			for (let k = 0; k < n; k++) {
				const bon =
					(await page.locator(`.tc-cell[data-i="${k}"]`).getAttribute('data-answer')) ?? '0';
				const chiffre = verdict === 'faux' && k === 0 ? String((Number(bon) + 1) % 10) : bon;
				await page.locator(`.tc-pave-btn[data-chiffre="${chiffre}"]`).click();
			}
		},
	},
	{
		type: 'appariement',
		lecon: 'fr-vocab-familles-relier',
		mode: 'relier',
		niveau: 'ce2',
		exercices: [
			relier('Relie chaque mot à un mot de sa famille. (un)', PAIRES[0]),
			relier('Relie chaque mot à un mot de sa famille. (deux)', PAIRES[1]),
			relier('Relie chaque mot à un mot de sa famille. (trois)', PAIRES[2]),
		],
		marqueQ1: '(un)',
		jouer: async (page, i, verdict) => {
			const paires = PAIRES[i];
			for (let k = 0; k < paires.length; k++) {
				// Faux : chaque mot est relié au mot d'à côté, donc toutes les paires sont fausses.
				const cible = paires[verdict === 'juste' ? k : (k + 1) % paires.length];
				await page.locator(`.lapp-mot[data-side="g"][data-id="${paires[k].gauche}"]`).click();
				await page.locator(`.lapp-mot[data-side="d"][data-id="${cible.droite}"]`).click();
			}
		},
	},
	{
		type: 'probleme',
		lecon: 'math-prob-composition',
		niveau: 'ce2',
		exercices: [
			probleme(
				'Dans le carton, il y a 28 perles : des rouges et des jaunes. 20 sont rouges. (un)',
				28,
				20,
			),
			probleme(
				'Dans le sac, il y a 35 billes : des rouges et des jaunes. 20 sont rouges. (deux)',
				35,
				20,
			),
			probleme(
				'Dans la boîte, il y a 40 jetons : des rouges et des jaunes. 30 sont rouges. (trois)',
				40,
				30,
			),
		],
		marqueQ1: '(un)',
		jouer: async (page, _i, verdict) => {
			const champ = page.locator('.prob-input').first();
			await champ.waitFor();
			const bon = Number((await champ.getAttribute('data-answer')) ?? '0');
			await champ.fill(String(verdict === 'juste' ? bon : bon + 1));
		},
	},
	{
		type: 'clicMot',
		lecon: 'fr-gram-clic-verbe',
		mode: 'clic',
		niveau: 'ce2',
		exercices: [
			clic(['Le', 'chat', 'dort', '.'], 2),
			clic(['Les', 'enfants', 'jouent', '.'], 2),
			clic(['Marie', 'chante', '.'], 1),
		],
		marqueQ1: 'chat',
		jouer: async (page, i, verdict) => {
			const cible = [2, 2, 1][i];
			await page.locator(`.lclic-mot[data-i="${verdict === 'juste' ? cible : 0}"]`).click();
		},
	},
	{
		type: 'droiteGraduee',
		lecon: 'num-droite-entiers',
		mode: 'placer',
		niveau: 'ce2',
		exercices: [droite(0, 70), droite(200, 240), droite(400, 460)],
		marqueQ1: '70',
		jouer: async (page, i, verdict) => {
			const min = [0, 200, 400][i];
			const cible = [70, 240, 460][i];
			const label = verdict === 'juste' ? cible : min;
			await page.locator(`.dg-hit[data-label="${label}"]`).click();
		},
	},
];

/* ---------- Aides ---------- */

const valider = (page: Page) => page.locator('[data-partage-valider]');
const jnsp = (page: Page) => page.locator('#partageJnsp');
const progression = (page: Page) => page.locator('.lqcm-progress-lab');

async function commencer(page: Page, code: string) {
	await gotoHash(page, `envoi/${code}`);
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await page.locator('#partageCommencer').click();
	await expect(page.locator('#partageRepere')).toBeVisible();
	await expect(valider(page)).toBeVisible();
}

/** Critère 17 : rien ne trahit le verdict dans l'écran de la séance. */
async function aucunVerdict(page: Page) {
	const feuille = page.locator('#sheets');
	await expect(
		feuille.locator(
			'.correct, .wrong, .is-hit, .is-missed, .is-false, .lqcm-ok, .lqcm-ko, .rempli-ok',
		),
	).toHaveCount(0);
	await expect(feuille.locator('.sprint-correction:visible')).toHaveCount(0);
	await expect(feuille.locator('[class*="etayage"]:visible')).toHaveCount(0);
	await expect(feuille).not.toContainText(/Bravo|Ce n.est pas ça|La bonne réponse/);
	await regionsLivesSansVerdict(page);
}

/** Critère 17, côté lecteur d'écran : le verdict ne passe pas non plus par une région
 *  vocale. Seule `#partageAnnonce` parle, et elle dit « Réponse enregistrée », jamais « juste ».
 *  Les régions de runner (`#tcStatus`, `#lqcmStatus`…) sont lues telles qu'elles sont : une
 *  région vide passe, ce qui est voulu, mais une région qui porterait le verdict échoue. */
const VERDICT_DIT = /Bravo|Ce n.est pas|bonne réponse|juste|faux/i;
async function regionsLivesSansVerdict(page: Page) {
	const textes = await page
		.locator('#sheets')
		.locator('[role="status"]:not(#partageAnnonce), [aria-live]:not(#partageAnnonce)')
		.allTextContents();
	for (const t of textes) expect(t, 'région live de la séance').not.toMatch(VERDICT_DIT);
}

/** Après « Valider », la nouvelle question porte le focus et se nomme : un conteneur muet
 *  laisserait un lecteur d'écran sans repère. Le libellé « Question k sur n » est ici
 *  l'objet du test (nom accessible validé par la relecture a11y), la chaîne est intentionnelle. */
async function focusSurQuestion(page: Page, rang: number) {
	const stage = page.locator('#sheets .sprint-stage');
	await expect(stage).toBeFocused();
	await expect(stage).toHaveAttribute('role', 'group');
	await expect(stage).toHaveAttribute('aria-label', `Question ${rang} sur ${TOTAL}`);
}

async function attendreQuestion(page: Page, k: number) {
	await expect(progression(page)).toContainText(new RegExp(`\\b${k}\\s*/\\s*${TOTAL}\\b`));
}

/** Joue une question complète selon son verdict, du geste à « Valider ». */
async function jouerQuestion(page: Page, f: FormatRunner, i: number, verdict: Verdict) {
	await attendreQuestion(page, i + 1);
	await expect(page.locator('#partageRepere')).toBeVisible();
	await expect(valider(page)).toBeDisabled(); // rien n'est répondu : « Valider » ne note rien
	await aucunVerdict(page);
	if (verdict === 'jnsp') await jnsp(page).check();
	else await f.jouer(page, i, verdict);
	await expect(valider(page)).toBeEnabled();
	await aucunVerdict(page);
	await valider(page).click();
}

async function jouerSeance(page: Page, f: FormatRunner, plan: Verdict[] = PLAN) {
	for (let i = 0; i < plan.length; i++) {
		await jouerQuestion(page, f, i, plan[i]);
		if (i < plan.length - 1) {
			await attendreQuestion(page, i + 2);
			await aucunVerdict(page);
		}
	}
}

async function resultatAffiche(page: Page) {
	const lien = await page.locator('#partageLien').inputValue();
	expect(lien).toContain('#resultat/');
	const r = await decoderResultat(lien.slice(lien.indexOf('#resultat/') + '#resultat/'.length));
	if (!r.ok) throw new Error(`résultat non décodable : ${r.raison}`);
	return r.valeur;
}

const stockage = (page: Page) =>
	page.evaluate(() =>
		Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
	);

const xp = async (page: Page): Promise<number> =>
	JSON.parse((await page.evaluate(() => localStorage.getItem('e2e/ludaskia_xp'))) ?? '0');

interface Erreur {
	lessonId: string;
	mode: string;
	question: string;
	donnee: string;
	attendue: string;
	sansTentative?: true;
}
const journal = async (page: Page): Promise<Erreur[]> =>
	JSON.parse((await page.evaluate(() => localStorage.getItem('e2e/ludaskia_erreurs'))) ?? '[]');

const QCM = FORMATS[0];
const codeQcm = () => codeDe(envoiRunnerDe(QCM.lecon, QCM.mode, QCM.exercices));

/* ---------- Les dix formats : la séance entière ---------- */

for (const f of FORMATS) {
	test(`7, 9, 11, 14, 17, 25 · ${f.type} : trois questions (juste, fausse, je ne sais pas), aucun verdict avant la fin, résultat et journal`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		const code = await codeDe(envoiRunnerDe(f.lecon, f.mode, f.exercices, f.niveau));
		await commencer(page, code);

		// Nom accessible du bouton : c'est lui l'objet du test, la chaîne est intentionnelle.
		await expect(page.getByRole('button', { name: 'Valider', exact: true })).toBeVisible();
		await expect(page.locator('#btnVerify')).not.toBeVisible();
		await expect(page.locator('#partageAnnonce')).toBeEmpty();

		// 17 : après chaque « Valider », annonce de l'enregistrement et progression, sans verdict.
		for (let i = 0; i < TOTAL; i++) {
			await jouerQuestion(page, f, i, PLAN[i]);
			if (i < TOTAL - 1) {
				await attendreQuestion(page, i + 2);
				await expect(page.locator('#partageAnnonce')).toContainText(
					`Réponse enregistrée. Question ${i + 2} sur ${TOTAL}.`,
				);
				await focusSurQuestion(page, i + 2); // gate d
				await aucunVerdict(page); // 17 + gate c (régions live sans verdict)
			}
		}
		await expect(page.locator('#partageFin')).toBeVisible();

		// 14, 11 : résultat décodé, statuts et saisies lisibles.
		const r = await resultatAffiche(page);
		expect(r.reponses.map((x) => x.statut)).toEqual(PLAN);
		for (const x of r.reponses) {
			expect(x.lecon).toBe(f.lecon);
			expect(x.enonce.trim()).not.toBe('');
			expect(x.attendue.trim()).not.toBe('');
		}
		expect(r.reponses[0].saisie.trim()).not.toBe('');
		expect(r.reponses[1].saisie.trim()).not.toBe('');
		expect(r.reponses[2].saisie).toBe(''); // jnsp : pas de saisie, et pas « faux »

		// 25 : journal en mode « partage » pour la fausse et pour la « je ne sais pas »,
		// rien pour la juste.
		const entrees = await journal(page);
		expect(entrees.length).toBeGreaterThan(0);
		expect(entrees.every((e) => e.mode === 'partage' && e.lessonId === f.lecon)).toBe(true);
		const essayees = entrees.filter((e) => !e.sansTentative);
		const sansEssai = entrees.filter((e) => e.sansTentative);
		expect(essayees.length, 'la réponse fausse est journalisée').toBeGreaterThan(0);
		expect(
			sansEssai.length,
			'« Je ne sais pas » est journalisé « n’a pas essayé »',
		).toBeGreaterThan(0);
		expect(entrees.some((e) => e.question.includes(f.marqueQ1))).toBe(false);

		// 17 : la correction n'arrive qu'à la demande, sous forme de liste.
		await page.locator('#partageVoirCorrection').click();
		await expect(page.locator('#partageCorrection')).toBeFocused();
		const lignes = page.locator('#partageCorrectionItems li.resultat-item');
		await expect(lignes).toHaveCount(TOTAL);
		for (let i = 0; i < TOTAL; i++) {
			await expect(lignes.nth(i)).toHaveAttribute('data-statut', PLAN[i]);
		}
		expect(errors).toEqual([]);
	});
}

/* ---------- Transverses ---------- */

test('QCM · toucher un choix le sélectionne sans valider, un autre choix déplace la sélection, « Je ne sais pas » se décoche', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await commencer(page, await codeQcm());
	const choix = (t: string) =>
		page.locator('#lqcmChoices .sprint-choice').filter({ hasText: exact(t) });

	await choix('3').click();
	await expect(choix('3')).toHaveAttribute('aria-pressed', 'true');
	await expect(valider(page)).toBeEnabled();
	await attendreQuestion(page, 1); // toucher ne valide pas : on est toujours à la question 1
	await expect(page.locator('#partageAnnonce')).toBeEmpty();
	await aucunVerdict(page);

	await choix('4').click();
	await expect(choix('4')).toHaveAttribute('aria-pressed', 'true');
	await expect(choix('3')).toHaveAttribute('aria-pressed', 'false');

	await jnsp(page).check();
	await expect(jnsp(page)).toBeChecked();
	await choix('5').click();
	await expect(jnsp(page)).not.toBeChecked();
	await expect(choix('5')).toHaveAttribute('aria-pressed', 'true');
	expect(errors).toEqual([]);
});

for (const type of ['tuilesTri', 'appariement']) {
	test(`9 · ${type} : « Je ne sais pas » active « Valider » sans effacer le widget, toucher au widget le décoche`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		const f = FORMATS.find((x) => x.type === type)!;
		await commencer(page, await codeDe(envoiRunnerDe(f.lecon, f.mode, f.exercices)));
		await expect(valider(page)).toBeDisabled();

		// Un geste partiel : un mot rangé / une paire reliée.
		const pose =
			type === 'tuilesTri' ? page.locator('.ltri-posee') : page.locator('#lappLinks .lapp-link');
		if (type === 'tuilesTri') {
			await page.locator('.ltri-tuile[data-mot="algue"]').click();
			await page.locator('.ltri-col[data-col="0"] .ltri-col-titre').click();
		} else {
			await page.locator('.lapp-mot[data-side="g"][data-id="bois"]').click();
			await page.locator('.lapp-mot[data-side="d"][data-id="boiserie"]').click();
		}
		await expect(pose).toHaveCount(1);

		await jnsp(page).check();
		await expect(valider(page)).toBeEnabled();
		await expect(pose).toHaveCount(1); // cocher n'efface pas ce qui était posé

		if (type === 'tuilesTri') {
			await page.locator('.ltri-tuile[data-mot="lisière"]').click();
			await page.locator('.ltri-col[data-col="1"] .ltri-col-titre').click();
		} else {
			await page.locator('.lapp-mot[data-side="g"][data-id="mur"]').click();
			await page.locator('.lapp-mot[data-side="d"][data-id="muraille"]').click();
		}
		await expect(jnsp(page)).not.toBeChecked();
		await expect(pose).toHaveCount(2);
		expect(errors).toEqual([]);
	});
}

test('un double clic sur « Valider » ne saute pas de question', async ({ page }) => {
	const errors = watchErrors(page);
	await commencer(page, await codeQcm());
	await attendreQuestion(page, 1);
	await QCM.jouer(page, 0, 'juste');
	await valider(page).dblclick();

	await attendreQuestion(page, 2);
	await expect(page.locator('#partageAnnonce')).toContainText('Question 2 sur 3.');
	await expect(page.locator('#partageAnnonce')).not.toContainText('Question 3 sur 3.');
	await expect(valider(page)).toBeDisabled(); // la question 2 n'a pas de réponse

	// Rien n'a été sauté : les deux questions suivantes s'enchaînent, et le résultat s'aligne.
	await jouerQuestion(page, QCM, 1, 'faux');
	await jouerQuestion(page, QCM, 2, 'jnsp');
	await expect(page.locator('#partageFin')).toBeVisible();
	expect((await resultatAffiche(page)).reponses.map((x) => x.statut)).toEqual(PLAN);
	expect(errors).toEqual([]);
});

test('16 · quitter en cours : confirmation, premier passage non consommé, rien n’a bougé, pas de carte « À continuer »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const code = await codeQcm();
	await commencer(page, code);
	const avant = await stockage(page);

	await jouerQuestion(page, QCM, 0, 'faux'); // une question validée, et fausse : de quoi journaliser
	await attendreQuestion(page, 2);

	await page.evaluate(() => document.getElementById('btnHome')?.click());
	await expect(page.getByText('Tu veux arrêter ?')).toBeVisible();
	await page.getByRole('button', { name: 'Oui, arrêter' }).click();
	await expect(page.locator('.home-grid')).toBeVisible();
	await expect(page.locator('.reprise-card')).toHaveCount(0);

	const apres = await stockage(page);
	for (const k of [
		'e2e/ludaskia_xp',
		'e2e/ludaskia_activity',
		'e2e/ludaskia_erreurs',
		'e2e/ludaskia_partagesRecus',
	]) {
		expect(apres[k] ?? null, k).toBe(avant[k] ?? null);
	}

	await gotoHash(page, `envoi/${code}`);
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await expect(page.locator('#partageDejaFait')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('23, 24, 26, 28 · premier passage : +5 XP, une entrée « partage », rien d’autre ne bouge, aucune modale, aucune requête sortante', async ({
	page,
	baseURL,
}) => {
	const errors = watchErrors(page);
	const sortants: string[] = [];
	const origine = new URL(baseURL ?? 'http://localhost:4173').origin;
	page.on('request', (r) => {
		const type = r.resourceType();
		const u = new URL(r.url());
		const externe = !['data:', 'blob:'].includes(u.protocol) && u.origin !== origine;
		// Seule exception : le GET de `foret-pied.svg`, décor de l'accueil servi par le site lui-même.
		const decor = r.method() === 'GET' && !u.search && u.pathname.endsWith('/foret-pied.svg');
		if (((type === 'fetch' || type === 'xhr') && !decor) || externe)
			sortants.push(`${type} ${r.method()} ${r.url()}`);
	});

	const code = await codeQcm();
	await gotoHash(page, `envoi/${code}`);
	await expect(page.locator('#partageAccueil')).toBeVisible();
	const avant = await stockage(page);
	const xpAvant = await xp(page);

	await page.locator('#partageCommencer').click();
	await expect(valider(page)).toBeVisible();
	await jouerSeance(page, QCM);
	await expect(page.locator('#partageFin')).toBeVisible();
	await expect(page.locator('.modal:visible')).toHaveCount(0);

	expect(await xp(page)).toBe(xpAvant + 5);
	const apres = await stockage(page);
	const changees = Object.keys({ ...avant, ...apres }).filter((k) => avant[k] !== apres[k]);
	const toleres = new Set([
		'e2e/ludaskia_xp',
		'e2e/ludaskia_activity',
		'e2e/ludaskia_erreurs',
		'e2e/ludaskia_partagesRecus',
		// Méta du profil : seul `updatedAt` peut bouger (horodatage d'écriture).
		'ludaskia_profiles',
	]);
	expect(changees.filter((k) => !toleres.has(k))).toEqual([]);
	if (changees.includes('ludaskia_profiles')) {
		const sansDate = (s: string | null | undefined) =>
			JSON.stringify(JSON.parse(s ?? 'null'), (k, v) => (k === 'updatedAt' ? undefined : v));
		expect(sansDate(apres['ludaskia_profiles'])).toBe(sansDate(avant['ludaskia_profiles']));
	}
	const act = (s: string | null | undefined): { k: string }[] => JSON.parse(s ?? '[]');
	const nouvelles = act(apres['e2e/ludaskia_activity']).slice(
		act(avant['e2e/ludaskia_activity']).length,
	);
	expect(nouvelles).toHaveLength(1);
	expect(nouvelles[0].k).toBe('partage');

	expect(sortants).toEqual([]);
	expect(errors).toEqual([]);
});

test('15 · entraînement en runner : fin d’entraînement, correction en liste dessous, aucune XP', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const code = await codeQcm();
	await commencer(page, code);
	await jouerSeance(page, QCM);
	await expect(page.locator('#partageFin')).toBeVisible();
	const xpApres = await xp(page);

	await gotoHash(page, `envoi/${code}`);
	await expect(page.locator('#partageDejaFait')).toBeVisible();
	await page.locator('#partageEntrainer').click();
	await expect(page.locator('#partageRepere')).toBeVisible();
	await expect(valider(page)).toBeVisible();
	await jouerSeance(page, QCM);

	await expect(page.locator('#partageFinEntrainement')).toBeVisible();
	await expect(page.locator('#partageLien')).toHaveCount(0);
	const lignes = page.locator('#partageCorrectionItems li.resultat-item');
	await expect(lignes).toHaveCount(TOTAL);
	await expect(lignes.first()).toBeVisible();
	for (let i = 0; i < TOTAL; i++) {
		await expect(lignes.nth(i)).toHaveAttribute('data-statut', PLAN[i]);
	}
	expect(await xp(page)).toBe(xpApres);
	await expect(page.locator('.modal:visible')).toHaveCount(0);
	expect(errors).toEqual([]);
});

/* ---------- Gates de relecture ---------- */

/** Change de vue DANS le document, sans recharger : l'état de module des runners (séance
 *  courante, bloc de décision) survit alors, et c'est précisément ce qu'on éprouve. */
async function allerSansRecharger(page: Page, hash: string) {
	await page.evaluate((h) => {
		location.hash = h;
	}, hash);
}

const aucunResteDeSeance = async (page: Page) => {
	await expect(page.locator('#partageJnsp')).toHaveCount(0);
	await expect(page.locator('[data-partage-valider]')).toHaveCount(0);
	await expect(page.locator('#partageRepere')).toHaveCount(0);
};

test('27 · QCM : le jeu libre d’après une séance partagée valide au toucher et montre le verdict', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	await commencer(page, await codeQcm());
	await jouerSeance(page, QCM);
	await expect(page.locator('#partageFin')).toBeVisible();

	// Même document, même leçon, jeu libre (mono-mode QCM : lancement direct).
	await allerSansRecharger(page, `lecon-${QCM.lecon}`);
	const choix = page.locator('#lqcmChoices .sprint-choice');
	await expect(choix.first()).toBeVisible();
	await aucunResteDeSeance(page);
	await expect(page.locator('#lqcmFeedback')).toBeHidden();

	await choix.first().click(); // un seul toucher : il valide
	await expect(page.locator('#lqcmChoices .sprint-choice.correct')).toHaveCount(1);
	await expect(page.locator('#lqcmFeedback')).toBeVisible();
	await expect(page.locator('#lqcmFeedback')).not.toBeEmpty();
	await expect(choix.first()).toBeDisabled();
	await aucunResteDeSeance(page);
	expect(errors).toEqual([]);
});

test('27 · tableau : le jeu libre d’après une séance partagée garde « Vérifier » et le clavier physique', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedAideVue(page);
	const f = FORMATS.find((x) => x.type === 'tableauConversion')!;
	await commencer(page, await codeDe(envoiRunnerDe(f.lecon, f.mode, f.exercices)));
	await jouerSeance(page, f);
	await expect(page.locator('#partageFin')).toBeVisible();

	await allerSansRecharger(page, `mode-${f.lecon}`);
	await page.locator('.mode-btn[data-mode="tableau"]').click();
	await expect(page.locator('#tcTable')).toBeVisible();
	await aucunResteDeSeance(page);
	await expect(page.locator('#tcVerif')).toBeVisible();
	await expect(page.locator('#tcVerif')).toBeEnabled(); // actif d'office en jeu libre

	// Clavier physique : le chiffre tapé atterrit dans la case focalisée.
	const case0 = page.locator('.tc-cell[data-i="0"]');
	await case0.focus();
	await page.keyboard.press('7');
	await expect(case0).toHaveText('7');
	await expect(page.locator('.tc-cell[data-i="1"]')).toHaveAttribute('aria-current', 'true');

	// « Vérifier » rend un verdict (case marquée), aucun « Valider » n'apparaît.
	await page.locator('#tcVerif').click();
	await expect(page.locator('.tc-cell.correct, .tc-cell.wrong').first()).toBeVisible();
	await aucunResteDeSeance(page);
	expect(errors).toEqual([]);
});

test('« Valider » désactivé est décrit par son aide, et n’en dépend plus dès qu’il s’active', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await commencer(page, await codeQcm());
	const choix = (t: string) =>
		page.locator('#lqcmChoices .sprint-choice').filter({ hasText: exact(t) });

	await expect(valider(page)).toBeDisabled();
	await expect(valider(page)).toHaveAttribute('aria-describedby', 'partageValiderAide');
	await expect(page.locator('#partageValiderAide')).toBeVisible();

	await choix('3').click(); // une réponse donnée
	await expect(valider(page)).toBeEnabled();
	await expect(valider(page)).not.toHaveAttribute('aria-describedby', /.*/);
	await expect(page.locator('#partageValiderAide')).toBeHidden();

	// Le chemin « Je ne sais pas » : question neuve (désactivé, décrit), puis la case active.
	await valider(page).click();
	await attendreQuestion(page, 2);
	await expect(valider(page)).toBeDisabled();
	await expect(valider(page)).toHaveAttribute('aria-describedby', 'partageValiderAide');
	await jnsp(page).check();
	await expect(valider(page)).toBeEnabled();
	await expect(valider(page)).not.toHaveAttribute('aria-describedby', /.*/);
	await jnsp(page).uncheck();
	await expect(valider(page)).toBeDisabled();
	await expect(valider(page)).toHaveAttribute('aria-describedby', 'partageValiderAide');
	expect(errors).toEqual([]);
});

/* ---------- Tableau : la virgule posée au mauvais endroit ---------- */

/* Mode `virgule` de `mes-longueurs` (CM1 seulement, `mesures.ts`) : l'enfant place lui-même
   la virgule. Exercices écrits à la main à la forme exacte que produit `generateTableau` :
   « 456 cm = @ m » tient en sept colonnes km..mm, les chiffres de 4560 mm tombent de m à mm,
   et la virgule attendue est après la colonne m (index 3). */
const COLONNES_LONGUEUR: [string, string][] = [
	['km', 'kilomètre'],
	['hm', 'hectomètre'],
	['dam', 'décamètre'],
	['m', 'mètre'],
	['dm', 'décimètre'],
	['cm', 'centimètre'],
	['mm', 'millimètre'],
];
const tableauVirgule = (cm: number): Exercise => {
	const s = String(cm);
	const chiffres = ['0', '0', '0', s[0], s[1], s[2], '0'];
	return {
		type: 'tableauConversion',
		question: `${cm} cm = @ m`,
		answer: `${s[0]},${s.slice(1)}`,
		answerUnit: 'm',
		uniteConnue: 'cm',
		colonnes: COLONNES_LONGUEUR.map(([unite, nom], i) => ({
			unite,
			nom,
			transit: false,
			chiffres: chiffres[i],
		})),
		parle: `Combien font ${cm} centimètres en mètres ?`,
		virguleApres: 3,
		virguleLibre: true,
	};
};

test('tableau, mode virgule · chiffres justes, virgule au mauvais endroit : faux, et la saisie porte la virgule posée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const exercices = [tableauVirgule(456), tableauVirgule(789), tableauVirgule(234)];
	await commencer(page, await codeDe(envoiRunnerDe('mes-longueurs', 'virgule', exercices, 'cm1')));

	const chiffres = async () => {
		await page.locator('#tcTable').waitFor();
		const n = await page.locator('.tc-cell').count();
		for (let k = 0; k < n; k++) {
			const bon = await page.locator(`.tc-cell[data-i="${k}"]`).getAttribute('data-answer');
			await page.locator(`.tc-pave-btn[data-chiffre="${bon}"]`).click();
		}
	};
	const virguleApres = async (caseI: number) => {
		await page.locator(`.tc-cell[data-i="${caseI}"]`).click(); // la virgule suit la case active
		await page.locator('[data-pave="virgule"]').click();
	};

	// 1 : chiffres justes, virgule après les km (case 0) au lieu des m (case 3).
	await attendreQuestion(page, 1);
	await chiffres();
	await virguleApres(0);
	await expect(valider(page)).toBeEnabled();
	await valider(page).click();
	// 2 : chiffres et virgule justes.
	await attendreQuestion(page, 2);
	await chiffres();
	await virguleApres(3);
	await valider(page).click();
	// 3 : « Je ne sais pas ».
	await attendreQuestion(page, 3);
	await jnsp(page).check();
	await valider(page).click();

	await expect(page.locator('#partageFin')).toBeVisible();
	const r = (await resultatAffiche(page)).reponses;
	expect(r.map((x) => x.statut)).toEqual(['faux', 'juste', 'jnsp']);
	// La virgule posée fait partie de la saisie : la fausse n'est pas lue comme un tableau juste.
	expect(r[0].saisie).toContain(',');
	expect(r[0].saisie).not.toBe(r[0].attendue);
	expect(r[0].saisie).not.toContain('4,56');
	expect(r[1].saisie).toContain(',');
	expect(r[2].saisie).toBe('');
	expect(errors).toEqual([]);
});
