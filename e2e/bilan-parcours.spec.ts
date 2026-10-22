/* ============================================================
   Bilan en PARCOURS guidé (#777) — smoke tests e2e.
   ------------------------------------------------------------
   Écrit AVANT l'implémentation (#777, skill /cadrer) : rouge à l'arrivée.
   L'écran `.bilan-parcours` n'existe pas : chaque test rougit d'abord sur
   l'attente de `#sheets .bilan-parcours` (ancien rendu = `.bilan-grid`).

   Un bilan ne s'affiche plus en page unique : une question par écran (le vrai
   exercice), des parties (une catégorie, <= 15 questions), correction à la FIN
   de chaque partie, puis récapitulatif par leçon. Pas de chrono.

   Traduit les critères 6, 7+5 (côté écran), 9, 10, 11, 13+14, 17, 18, N1.
   Les libellés ne sont pas figés (on lit `data-*`, des motifs « k sur n », des
   nombres) ; seuls « pas de réponse » (critère 11) et le mot du verdict (en
   `data-verdict`, pas en texte) sont porteurs de l'exigence.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

interface FavoriSeed {
	id: string;
	label: string;
	lessonIds: string[];
	questionsPerLesson: number | 'all';
	mode: 'bilan';
	categoryId?: string;
}

function favori(lessonIds: string[], nbq: number, categoryId?: string): FavoriSeed {
	return {
		id: 'fav-777',
		label: 'Parcours 777',
		lessonIds,
		questionsPerLesson: nbq,
		mode: 'bilan',
		categoryId,
	};
}

async function seedFavoris(page: Page, bilans: FavoriSeed[]): Promise<void> {
	await page.addInitScript(
		(json) => localStorage.setItem('e2e/ludaskia_bilans', json),
		JSON.stringify(bilans),
	);
}

/* Lance un favori depuis l'accueil et attend l'écran du parcours. */
async function lancerFavoriAccueil(page: Page, bilans: FavoriSeed[]): Promise<void> {
	await seedFavoris(page, bilans);
	await gotoHash(page, 'accueil');
	await page.locator('.favori-btn-run').first().click();
	await expect(page.locator('#sheets .bilan-parcours')).toBeVisible();
}

/* Un bilan d'UNE leçon numérique (réponse lue dans `data-answer`), nbq questions. */
const LECON_NUM = 'math-complements';

type Geste = 'juste' | 'faux' | 'passe';

interface Trace {
	kind: string;
	lesson: string;
	answer: string | null;
	partie: string;
	question: string;
	valuenow: number;
	valuemax: number;
	nom: string;
}

interface Crochets {
	/** À chaque écran affiché (question ou fin de partie), avant tout geste. */
	surEcran?: (ecran: 'question' | 'fin-partie') => Promise<void>;
	/** Sur chaque écran de question, avant le geste. */
	surQuestion?: (trace: Trace) => Promise<void>;
	/** Sur chaque fin de partie. */
	surFinPartie?: () => Promise<void>;
	/** Appelé sur le récapitulatif. */
	surRecap?: () => Promise<void>;
}

/* Joue tout le parcours jusqu'au récapitulatif. `geste(i, trace)` décide de la
   réponse à la i-ème question (0-based). Seules les saisies numériques (`num`,
   `posee`) se répondent juste/faux ; tout autre format est « passé ». */
async function jouer(
	page: Page,
	geste: (i: number, t: Trace) => Geste,
	crochets: Crochets = {},
): Promise<Trace[]> {
	const traces: Trace[] = [];
	const t = (sel: string) => page.locator(sel);
	for (let garde = 0; garde < 200; garde++) {
		await t('#bpStage, .bp-fin-partie, .bp-recap').first().waitFor({ state: 'visible' });
		if (await t('.bp-recap').isVisible()) {
			await crochets.surRecap?.();
			return traces;
		}
		if (await t('.bp-fin-partie').isVisible()) {
			await crochets.surEcran?.('fin-partie');
			await crochets.surFinPartie?.();
			await t('#bpPartieSuivante, #bpVoirBilan').first().click();
			continue;
		}
		const stage = t('#bpStage');
		const kind = (await stage.getAttribute('data-kind')) ?? '';
		const bar = t('.bp-progression');
		const input = t('#bpInput');
		const trace: Trace = {
			kind,
			lesson: (await stage.getAttribute('data-lesson')) ?? '',
			answer: kind === 'num' ? await input.getAttribute('data-answer') : null,
			partie: (await t('.bp-partie-num').innerText()).trim(),
			question: (await t('.bp-question-num').innerText()).trim(),
			valuenow: Number(await bar.getAttribute('aria-valuenow')),
			valuemax: Number(await bar.getAttribute('aria-valuemax')),
			nom: (await t('.bp-partie-nom').innerText()).trim(),
		};
		await crochets.surEcran?.('question');
		await crochets.surQuestion?.(trace);
		const g = geste(traces.length, trace);
		traces.push(trace);
		const avant = `${trace.partie}|${trace.question}`;
		if (g !== 'passe' && (kind === 'num' || kind === 'posee')) {
			if (kind === 'num') {
				await input.fill(g === 'juste' ? trace.answer! : `${trace.answer}7`);
			} else {
				const cells = t('.posee-input[data-answer]');
				const n = await cells.count();
				for (let c = 0; c < n; c++) {
					const rep = (await cells.nth(c).getAttribute('data-answer')) ?? '';
					await cells.nth(c).fill(g === 'juste' ? rep : `${rep}7`);
				}
			}
			await t('#bpValider').click();
		} else {
			await t('#bpPasser').click();
		}
		await page.waitForFunction((a) => {
			if (!document.querySelector('#bpStage') || document.querySelector('.bp-fin-partie'))
				return true;
			const p = document.querySelector('.bp-partie-num')?.textContent?.trim();
			const q = document.querySelector('.bp-question-num')?.textContent?.trim();
			return `${p}|${q}` !== a;
		}, avant);
	}
	throw new Error('Le parcours ne se termine pas (garde 200 écrans)');
}

const sansEspaces = (s: string) => s.replace(/\s/g, '');

/* ---------- Critère 6 : les six points d'entrée ouvrent le parcours ---------- */

async function exigerParcoursSansGrille(page: Page): Promise<void> {
	await expect(page.locator('#sheets .bilan-parcours')).toBeVisible();
	await expect(page.locator('.bilan-grid')).toBeHidden();
}

test.describe('critère 6 : chaque point d’entrée ouvre le parcours, jamais la page unique', () => {
	test('configurateur « C’est parti ! »', async ({ page }) => {
		const errors = watchErrors(page);
		await gotoHash(page, 'bilan-custom');
		await page.locator('#bcSelectNone').click();
		// Les matières sont repliées : on coche par le DOM (le geste visé est « C'est parti »).
		await page.evaluate((id) => {
			const cb = document.querySelector<HTMLInputElement>(`.bc-lesson-check[value="${id}"]`)!;
			cb.checked = true;
			cb.dispatchEvent(new Event('change', { bubbles: true }));
		}, LECON_NUM);
		await page.locator('#bcRun').click();
		await exigerParcoursSansGrille(page);
		expect(errors).toEqual([]);
	});

	test('favori lancé depuis l’accueil', async ({ page }) => {
		const errors = watchErrors(page);
		await lancerFavoriAccueil(page, [favori([LECON_NUM], 3)]);
		await exigerParcoursSansGrille(page);
		expect(errors).toEqual([]);
	});

	test('favori lancé depuis sa catégorie', async ({ page }) => {
		const errors = watchErrors(page);
		await seedFavoris(page, [favori([LECON_NUM], 3, 'math-calcul-mental')]);
		await gotoHash(page, 'categorie-math-calcul-mental');
		await page.locator('.favori-btn-run').first().click();
		await exigerParcoursSansGrille(page);
		expect(errors).toEqual([]);
	});

	for (const mode of ['express', 'complet'] as const) {
		test(`« Bilan ${mode} » d’une catégorie`, async ({ page }) => {
			const errors = watchErrors(page);
			await gotoHash(page, 'categorie-math-calcul-mental');
			await page.locator(`[data-act="${mode}"]`).click();
			await exigerParcoursSansGrille(page);
			expect(errors).toEqual([]);
		});
	}

	test('étape « Un bilan favori » du programme du jour', async ({ page }) => {
		const errors = watchErrors(page);
		// Seed direct, comme programme-favori.spec.ts : un programme d'une étape « favori ».
		const defs = [
			{
				id: 'd1',
				etapes: [{ id: 'e1', kind: 'favori', refs: ['fav-777'], count: 1 }],
				recurrence: { type: 'hebdo', jours: [1, 2, 3, 4, 5, 6, 7] },
			},
		];
		await page.addInitScript(
			(seed) => {
				localStorage.setItem('e2e/ludaskia_bilans', seed.bilans);
				localStorage.setItem('e2e/ludaskia_seance', seed.defs);
				localStorage.removeItem('ludaskia_encadrant_lock');
			},
			{
				bilans: JSON.stringify([favori([LECON_NUM], 3, 'math-calcul-mental')]),
				defs: JSON.stringify(defs),
			},
		);
		await gotoHash(page, 'seance');
		await page.locator('.programme-tuile[data-act="lancer"]').first().click();
		await exigerParcoursSansGrille(page);
		expect(errors).toEqual([]);
	});
});

/* ---------- Critères 7 + 5 : le vrai widget de chaque format ---------- */

const FORMATS: Record<string, string> = {
	'math-complements': 'num',
	'calc-addition-posee': 'posee',
	'fr-conj-groupe': 'qcm',
	'num-comparer': 'tuile',
	'fr-vocab-alpha-initiale': 'ordre',
	'fr-vocab-champs-tri': 'tri',
	'fr-vocab-familles-relier': 'appariement',
	'fr-gram-clic-verbe': 'clicMot',
	'math-prob-composition': 'probleme',
};

test('critères 7 et 5 : chaque question montre le widget de son format, sans « Recopie »/« Écris » pour un widget', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori(Object.keys(FORMATS), 1)]);
	const vus = new Set<string>();
	await jouer(page, () => 'passe', {
		surQuestion: async (tr) => {
			const attendu = FORMATS[tr.lesson];
			expect(attendu, `leçon inattendue ${tr.lesson}`).toBeDefined();
			expect(tr.kind, `format de ${tr.lesson}`).toBe(attendu);
			vus.add(tr.lesson);
			const stage = page.locator('#bpStage');
			const texte = (await stage.innerText()).trim();
			expect(texte.length, 'question vide').toBeGreaterThan(0);
			if (tr.kind === 'num') await expect(page.locator('#bpInput')).toBeVisible();
			else if (tr.kind === 'posee')
				expect(await page.locator('.posee-input').count()).toBeGreaterThan(0);
			else if (tr.kind === 'qcm')
				expect(await page.locator('.bp-choice[data-value]').count()).toBeGreaterThanOrEqual(2);
			else if (tr.kind === 'tuile')
				await expect(page.locator('#ltuiSlot, [data-tuile-mount]').first()).toBeVisible();
			else
				await expect(
					stage
						.locator('button, input, [role="button"], [draggable="true"]')
						.filter({ hasNot: page.locator('#bpValider, #bpPasser') })
						.first(),
				).toBeVisible();
			if (['tuile', 'ordre', 'tri', 'appariement', 'clicMot'].includes(tr.kind))
				expect(texte).not.toMatch(/\b(recopie|écris)\b/i);
		},
	});
	expect([...vus].sort()).toEqual(Object.keys(FORMATS).sort());
	expect(errors).toEqual([]);
});

/* ---------- Critère 9 : les quatre repères de l'en-tête ---------- */

test('critère 9 : partie k sur n, question i sur m et progression cohérentes à chaque écran', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM, 'fr-conj-groupe'], 3)]);
	const traces = await jouer(page, () => 'passe');
	expect(traces.length).toBeGreaterThanOrEqual(2);
	const total = traces[0].valuemax;
	expect(total, 'aria-valuemax = total du bilan').toBe(traces.length);
	let partiePrec = 0;
	let iPrec = 0;
	traces.forEach((tr, idx) => {
		expect(tr.nom.length).toBeGreaterThan(0);
		const p = /(\d+)\D+(\d+)/.exec(tr.partie)!;
		const q = /(\d+)\D+(\d+)/.exec(tr.question)!;
		const [k, n, i, m] = [p[1], p[2], q[1], q[2]].map(Number);
		expect(k).toBeGreaterThanOrEqual(1);
		expect(k).toBeLessThanOrEqual(n);
		expect(i).toBeLessThanOrEqual(m);
		if (k === partiePrec) expect(i, 'i avance de 1 dans la partie').toBe(iPrec + 1);
		else {
			expect(k, 'k avance de 1').toBe(partiePrec + 1);
			expect(i, 'i repart à 1').toBe(1);
		}
		partiePrec = k;
		iPrec = i;
		expect(tr.valuenow, 'progression = questions déjà traitées').toBe(idx);
		expect(tr.valuemax).toBe(total);
	});
	expect(errors).toEqual([]);
});

/* ---------- Critère 10 : pas de correction avant la fin de la partie ---------- */

test('critère 10 : aucune marque juste/faux ni « bonne réponse » avant la fin de la partie ; « Je passe » avance', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM], 4)]);
	const verifier = async () => {
		await expect(page.locator('.mark.correct, .mark.wrong, .correct, .wrong')).toBeHidden();
		expect(await page.locator('#sheets').innerText()).not.toMatch(/bonne r[ée]ponse/i);
	};
	let questions = 0;
	await jouer(page, (i) => (i === 0 ? 'juste' : i === 1 ? 'faux' : 'passe'), {
		surQuestion: async () => {
			questions++;
			await verifier();
		},
	});
	expect(questions).toBe(4);
	expect(errors).toEqual([]);
});

/* ---------- Critère 11 : fin de partie ---------- */

test('critère 11 : réussites avant erreurs ; passée = « pas de réponse » + attendue ; fausse = donnée + attendue', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM], 3)]);
	const gestes: Geste[] = ['passe', 'faux', 'juste'];
	const traces: Trace[] = [];
	let vu = false;
	await jouer(page, (i) => gestes[i], {
		surQuestion: async (tr) => {
			traces.push(tr);
		},
		surFinPartie: async () => {
			vu = true;
			const fin = page.locator('.bp-fin-partie');
			await expect(fin.locator('.bp-reussites')).toBeVisible();
			expect(await fin.locator('.bp-reussites').getAttribute('data-nombre')).toBe('1');
			// ordre du DOM : `.bp-reussites` précède chaque `.bp-erreur`
			const ordreOk = await fin.evaluate((el) => {
				const r = el.querySelector('.bp-reussites')!;
				return [...el.querySelectorAll('.bp-erreur')].every(
					(e) => !!(r.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING),
				);
			});
			expect(ordreOk, '.bp-reussites avant les .bp-erreur').toBe(true);
			const erreurs = fin.locator('.bp-erreur');
			await expect(erreurs).toHaveCount(2);
			const passee = erreurs.filter({ hasText: /pas de r[ée]ponse/i });
			await expect(passee).toHaveCount(1);
			expect(sansEspaces(await passee.locator('.bp-erreur-attendue').innerText())).toContain(
				sansEspaces(traces[0].answer!),
			);
			const fausse = erreurs.filter({ hasNotText: /pas de r[ée]ponse/i });
			await expect(fausse).toHaveCount(1);
			expect(sansEspaces(await fausse.locator('.bp-erreur-donnee').innerText())).toContain(
				sansEspaces(`${traces[1].answer}7`),
			);
			expect(sansEspaces(await fausse.locator('.bp-erreur-attendue').innerText())).toContain(
				sansEspaces(traces[1].answer!),
			);
			await expect(fausse.locator('.bp-erreur-enonce')).not.toBeEmpty();
		},
	});
	expect(vu, 'une fin de partie a été affichée').toBe(true);
	expect(errors).toEqual([]);
});

/* ---------- Critères 13 + 14 : verdict, score, pas de pourcentage ---------- */

const VERDICTS = [
	{ bonnes: 5, verdict: 'reussi', score: '5 sur 5' },
	{ bonnes: 3, verdict: 'presque', score: '3 sur 5' },
	{ bonnes: 1, verdict: 'a-retravailler', score: '1 sur 5' },
] as const;

for (const { bonnes, verdict, score } of VERDICTS) {
	test(`critères 13/14 : ${bonnes} bonne(s) sur 5 → ${verdict}, « ${score} », sans « % »`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await lancerFavoriAccueil(page, [favori([LECON_NUM], 5)]);
		await jouer(page, (i) => (i < bonnes ? 'juste' : 'faux'));
		const recap = page.locator('.bp-recap');
		await expect(recap).toBeVisible();
		const ligne = recap.locator(`.bp-lecon[data-lesson="${LECON_NUM}"]`);
		await expect(ligne).toHaveAttribute('data-verdict', verdict);
		await expect(ligne.locator('.bp-score')).toHaveText(new RegExp(`^\\s*${score}\\s*$`));
		await expect(ligne.locator('.bp-verdict svg')).toHaveCount(1);
		await expect(ligne.locator('.bp-verdict')).not.toHaveText(/^\s*$/);
		expect(await recap.innerText()).not.toContain('%');
		await expect(page.locator('#bpReviserErreurs')).toHaveCount(bonnes === 5 ? 0 : 1);
		expect(errors).toEqual([]);
	});
}

test('critères 13/14 : lignes triées réussi → à retravailler, total après la liste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// fr-conj-groupe (QCM) est passé : 0 sur 3 → à retravailler ; la leçon numérique est réussie.
	// Les deux leçons sont listées dans l'ordre INVERSE du tri attendu.
	await lancerFavoriAccueil(page, [favori(['fr-conj-groupe', LECON_NUM], 3)]);
	await jouer(page, (_i, tr) => (tr.lesson === LECON_NUM ? 'juste' : 'passe'));
	const lignes = page.locator('.bp-recap .bp-lecon');
	await expect(lignes).toHaveCount(2);
	await expect(lignes.nth(0)).toHaveAttribute('data-verdict', 'reussi');
	await expect(lignes.nth(1)).toHaveAttribute('data-verdict', 'a-retravailler');
	const totalApres = await page.locator('.bp-recap').evaluate((el) => {
		const total = el.querySelector('.bp-recap-total')!;
		return [...el.querySelectorAll('.bp-lecon')].every(
			(l) => !!(l.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING),
		);
	});
	expect(totalApres, '.bp-recap-total après la liste').toBe(true);
	expect(errors).toEqual([]);
});

/* ---------- Critères 17 + N1 : ni chrono, ni ancienne page ---------- */

test('critères 17 et N1 : ni #chrono, ni #btnVerify, ni .bilan-grid, du lancement au récapitulatif', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM, 'fr-conj-groupe'], 3)]);
	let ecrans = 0;
	const verifier = async () => {
		ecrans++;
		await expect(page.locator('#sheets .bilan-parcours')).toBeVisible();
		await expect(page.locator('#chrono')).toBeHidden();
		await expect(page.locator('#btnVerify')).toBeHidden();
		await expect(page.locator('.bilan-grid')).toBeHidden();
	};
	await jouer(page, () => 'passe', { surEcran: verifier, surRecap: verifier });
	expect(ecrans).toBeGreaterThanOrEqual(8); // 6 questions + fin(s) de partie + récap
	expect(errors).toEqual([]);
});

/* ---------- Critère 18 : lisibilité tablette ---------- */

test.describe('critère 18 : lisibilité à 800 × 1280', () => {
	test.use({ viewport: { width: 800, height: 1280 } });

	test('énoncé >= 18 px, en-tête >= 14 px, champ >= 48 px bordé, pas de défilement horizontal', async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await lancerFavoriAccueil(page, [favori([LECON_NUM], 3)]);
		await expect(page.locator('#bpInput')).toBeVisible();
		const mesures = await page.evaluate(() => {
			const px = (el: Element | null, prop: string) =>
				el ? parseFloat(getComputedStyle(el).getPropertyValue(prop)) : NaN;
			const input = document.querySelector('#bpInput');
			const cote = (c: string) =>
				input
					? [
							px(input, `border-${c}-width`),
							getComputedStyle(input).getPropertyValue(`border-${c}-style`),
						]
					: [NaN, ''];
			const r = input?.getBoundingClientRect();
			return {
				enonce: px(document.querySelector('#bpStage .bp-enonce'), 'font-size'),
				entete: ['.bp-partie-nom', '.bp-partie-num', '.bp-question-num'].map((s) =>
					px(document.querySelector(s), 'font-size'),
				),
				hauteur: r?.height ?? 0,
				bordures: ['top', 'right', 'bottom', 'left'].map(cote),
				debord: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			};
		});
		expect(mesures.enonce, 'police de l’énoncé').toBeGreaterThanOrEqual(18);
		for (const f of mesures.entete)
			expect(f, 'police des mentions d’en-tête').toBeGreaterThanOrEqual(14);
		expect(mesures.hauteur, 'hauteur de #bpInput').toBeGreaterThanOrEqual(48);
		for (const [w, style] of mesures.bordures) {
			expect(w as number, 'bordure de #bpInput').toBeGreaterThan(0);
			expect(style).not.toBe('none');
		}
		expect(mesures.debord, 'défilement horizontal').toBeLessThanOrEqual(0);
		expect(errors).toEqual([]);
	});
});
