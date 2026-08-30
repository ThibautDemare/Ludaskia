/* ============================================================
   Échappement par construction (#614) — rien ne s'affiche EN CLAIR.

   Le risque propre au lot : un fragment DOUBLEMENT échappé ne casse ni la
   compilation, ni les tests unitaires, ni un sélecteur — il s'affiche simplement en
   clair à l'enfant (« <strong> » lu comme du texte). Le symétrique est un fragment
   interpolé dans un gabarit NON balisé, qui rend « [object Object] ». Les deux ne se
   voient qu'à l'écran : d'où cette spec, qui lit le TEXTE VISIBLE de chaque écran.

   Quatre familles de rendu, parce que la conversion a touché quatre pipelines
   distincts et qu'aucun ne prouve les autres :
     1. la FICHE (core/items → renderItem, le chemin le plus partagé) ;
     2. un RUNNER À WIDGET (tuiles : markup composé, attributs construits) ;
     3. l'ESPACE ENCADRANT (le plus gros volume de balisage de l'application) ;
     4. le SPRINT (rendu propre, QCM + HUD).

   Le CHEVRON SEUL n'est pas testé, et c'est délibéré : les leçons de comparaison
   affichent « 3 < 5 ». On cherche des OUVERTURES DE BALISE (« <span », « <div »…),
   qui elles ne peuvent pas apparaître légitimement dans du texte lu par un enfant.

   ------------------------------------------------------------
   Extension (régression de #614 constatée en PRODUCTION) : la spec ci-dessus
   attestait l'échappement sur quatre familles, mais n'avait jamais posé l'œil sur
   six écrans où huit sites ont pourtant fui — dont le PLUS emprunté de l'appli.
   Cinq tests de plus, une famille de rendu chacun, jamais prouvée par les quatre
   premières :
     5. le RUNNER QCM DE LEÇON, en question ET à son écran de résultat
        (`renderQuestion` de lecon-qcm.ts + `renderLeconResult`, commun aux cinq
        runners « une question à la fois ») ;
     6. le RÉSULTAT DU SPRINT (`renderSprintResults`) — la spec n'allait jusque-là
        que sur l'écran EN COURS, jamais sur son bilan ;
     7. « TON PROGRAMME DU JOUR » (`pastillesHTML`) — les pastilles de progression ;
     8. la RÉVISION, sur ses chemins QCM et problème (`renderQcm`/`renderProbleme`
        de revision.ts), non couverts par les scénarios tuiles/tri déjà en place
        dans revision.spec.ts.

   Second symptôme, mesuré en prod à côté du premier : un gabarit `html\`…\`` dont
   le backtick de fermeture atterrit un cran trop loin (`</div>html\`.balisage`)
   laisse le MOT « html » nu dans le DOM. `verifierTexteVisible` le cherche
   désormais aussi, en mot ISOLÉ (frontières `\b`, casse exacte) — jamais une
   sous-chaîne, qui accuserait à tort « SafeHtml » (jamais affiché, casse
   différente) ou un futur contenu qui parlerait légitimement du web.
   ------------------------------------------------------------
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

/* Ouvertures de balise : la marque d'un fragment ré-échappé. On y ajoute
   « [object Object] », marque de l'oubli symétrique — un fragment interpolé dans un
   gabarit non balisé (`SafeHtml` n'a volontairement pas de `toString`). */
const EN_CLAIR = ['<span', '<div', '<strong', '<em', '<br', '<button', '<input', '[object Object]'];

/* Second symptôme (production) : le MOT « html » isolé, laissé nu par un gabarit
   dont le backtick de fermeture se referme un cran trop tard. Mot ISOLÉ et casse
   EXACTE (minuscule, celle du nom de la fonction gabarit) — une sous-chaîne
   attraperait « SafeHtml »/« innerHTML » (capitale différente, jamais affichés
   tels quels) ou un futur contenu pédagogique sur le web ("HTML" en toutes lettres
   n'a rien d'un artefact dans ce cas-là). */
const MOT_HTML = /\bhtml\b/;

async function verifierTexteVisible(page: Page, ou: string): Promise<void> {
	const texte = await page.locator('body').innerText();
	for (const marque of EN_CLAIR)
		expect(
			texte,
			`${ou} : « ${marque} » apparaît dans le TEXTE VISIBLE.\n` +
				`Soit un fragment a été échappé deux fois (il s'affiche au lieu de se rendre), ` +
				`soit un SafeHtml a été interpolé dans un gabarit non balisé.`,
		).not.toContain(marque);
	expect(
		texte,
		`${ou} : le mot « html » nu apparaît dans le TEXTE VISIBLE.\n` +
			`Un gabarit html\`…\` se referme probablement un cran trop tard ` +
			`(ex. « </div>html\`.balisage » au lieu de « </div>\`.balisage »).`,
	).not.toMatch(MOT_HTML);
}

test('fiche : l’énoncé et ses champs se rendent, rien n’est écrit en clair', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-comparer');
	await page.locator('.ans').first().waitFor({ state: 'visible' });
	// Le rendu enrichi doit être du BALISAGE, pas du texte : au moins un champ existe.
	await expect(page.locator('input.ans').first()).toBeVisible();
	await verifierTexteVisible(page, 'fiche');
	expect(errors).toEqual([]);
});

test('fiche : après correction, le verdict et la réponse révélée restent du balisage', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-num-comparer');
	const champ = page.locator('.ans').first();
	await champ.waitFor({ state: 'visible' });
	await champ.fill('999'); // réponse volontairement fausse → révélation
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark').first()).toBeVisible();
	await verifierTexteVisible(page, 'fiche corrigée');
	expect(errors).toEqual([]);
});

test('runner à widget (tuiles) : consigne, énoncé et tuiles se rendent', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedAideVueScript());
	// `mode-…` et non `lecon-…` : c'est l'écran de CHOIX de mode qui offre les tuiles,
	// `lecon-…` lançant directement le mode par défaut (saisie).
	await gotoHash(page, 'mode-num-comparer');
	await page.getByText('Je déplace les tuiles').click();
	await page.locator('#ltuiSlot').waitFor({ state: 'visible' });
	await expect(page.locator('.ltui-tuile').first()).toBeVisible();
	await verifierTexteVisible(page, 'runner tuiles');
	expect(errors).toEqual([]);
});

test('espace encadrant : les panneaux se rendent sans balisage en clair', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(`localStorage.removeItem('ludaskia_encadrant_lock');`);
	await gotoHash(page, 'encadrant');
	await expect(page.locator('.enc-tab').first()).toBeVisible();
	await verifierTexteVisible(page, 'encadrant (progression)');
	// Les autres onglets sont rendus par des fonctions distinctes : on les traverse.
	const onglets = page.locator('.enc-tab');
	for (let i = 1; i < (await onglets.count()); i++) {
		await onglets.nth(i).click();
		await expect(page.locator('.enc-tab.active')).toHaveCount(1);
		await verifierTexteVisible(page, `encadrant (onglet ${i})`);
	}
	expect(errors).toEqual([]);
});

test('sprint : la question, les choix et le bandeau se rendent', async ({ page }) => {
	const errors = watchErrors(page);
	// Sprint restreint à une seule leçon via le composeur de bilan (même procédé que
	// pave-signes.spec.ts) : le tirage devient déterministe.
	await gotoHash(page, 'bilan-cat-math-numeration');
	await page.locator('#bcSelectNone').click();
	await page.locator('.bc-lesson-check[value="num-comparer"]').check();
	await page.locator('.bc-mode-radio[value="sprint"]').check();
	await page.locator('#bcRun').click();
	await expect(page.locator('#sprintTime')).toBeVisible();
	await expect(page.locator('.sprint-choice').first()).toBeVisible();
	await verifierTexteVisible(page, 'sprint');
	expect(errors).toEqual([]);
});

test('accueil : cartes, progression et récompenses se rendent', async ({ page }) => {
	// L'accueil concentre les fragments composés hors gabarit (icônes injectées dans
	// des libellés statiques, barre de niveau, boutons de récompense) — c'est là que la
	// conversion a laissé le plus de concaténations à reprendre.
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	await expect(page.locator('#progression')).toBeVisible();
	await verifierTexteVisible(page, 'accueil');
	expect(errors).toEqual([]);
});

test('runner QCM de leçon : la question, puis l’écran de résultat, se rendent sans balisage en clair', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// geo-angles : QCM mono-mode (#202) → lancement direct par gotoHash, comme la
	// fiche ci-dessus, sans écran de choix de mode à traverser.
	await gotoHash(page, 'lecon-geo-angles');
	const choices = page.locator('.sprint-choice');
	await choices.first().waitFor({ state: 'visible' });
	await verifierTexteVisible(page, 'runner QCM de leçon (question)');

	// Enchaîne les 8 questions (NB_QUESTIONS, lecon-qcm.ts) jusqu'à l'écran de résultat,
	// commun aux cinq runners « une question à la fois » (renderLeconResult, le site qui
	// a fui « [object Object] » en prod).
	for (let i = 0; i < 8; i++) {
		await expect(choices.first()).toBeVisible();
		await choices.first().click();
		await page.locator('#lqcmActions button').click();
	}
	for (const ok of ['#levelupOk', '#celebrateOk']) {
		const btn = page.locator(ok);
		if (await btn.isVisible().catch(() => false)) await btn.click();
	}
	await expect(page.locator('.sprint-done')).toBeVisible();
	await verifierTexteVisible(page, 'runner QCM de leçon (résultat)');
	expect(errors).toEqual([]);
});

/* Libellés du signe choisi en sprint (comparaison), réutilisés pour cliquer le bon
   choix — même table que pave-signes.spec.ts / recap-seance.spec.ts. */
const SIGNE_LABELS: Record<string, string> = {
	'<': 'plus petit que',
	'=': 'égal à',
	'>': 'plus grand que',
};

test('sprint : l’écran de résultat ne fuit rien de son gabarit', async ({ page }) => {
	const errors = watchErrors(page);
	// Sprint scopé à la seule leçon num-comparer via le composeur de bilan (#64), tirage
	// déterministe. Horloge truquée posée AVANT #bcRun (avant la création du setInterval
	// du sprint) : seul moyen d'atteindre .sprint-done sans les 5 minutes réelles (cf.
	// e2e/README.md, pattern de recap-seance.spec.ts).
	await gotoHash(page, 'bilan-cat-math-numeration');
	await page.locator('#bcSelectNone').click();
	await page.locator('.bc-lesson-check[value="num-comparer"]').check();
	await page.locator('.bc-mode-radio[value="sprint"]').check();
	await page.clock.install();
	await page.locator('#bcRun').click();
	await expect(page.locator('#sprintTime')).toBeVisible();

	// Réponse volontairement FAUSSE (comme recap-seance.spec.ts) : une bonne réponse
	// enchaîne via un setTimeout d'animation non déterministe, alors qu'une mauvaise
	// réponse affiche #sprintContinue et attend le clic — seul chemin fiable ici.
	const enonce = await page.locator('.sprint-q-qcm').innerText();
	const m = enonce.match(/(\d+)\D+?(\d+)/);
	if (!m) throw new Error(`énoncé de comparaison inattendu : ${enonce}`);
	const a = Number(m[1]);
	const b = Number(m[2]);
	const bon = a < b ? '<' : a > b ? '>' : '=';
	const faux = bon === '<' ? '>' : '<';
	await page.locator(`.sprint-choice[aria-label="${SIGNE_LABELS[faux]}"]`).click();
	await expect(page.locator('#sprintContinue')).toBeVisible();
	await page.locator('#sprintContinue').click();
	await page.clock.fastForward('05:01');

	await expect(page.locator('.sprint-done')).toBeVisible();
	await verifierTexteVisible(page, 'sprint (résultat)');
	expect(errors).toEqual([]);
});

test('« Ton programme du jour » : les pastilles de progression ne fuient rien', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Programme avec une étape « Sprint 5 min », récurrence sur les 7 jours (s'applique
	// donc forcément aujourd'hui) — même mise en place que programme-du-jour.spec.ts.
	await page.addInitScript(`localStorage.removeItem('ludaskia_encadrant_lock');`);
	await gotoHash(page, 'encadrant/programme');
	await page.locator('[data-act="seance-add"]').click();
	await page.locator('select[data-act="seance-etape-add"][data-def="d1"]').selectOption('sprint');
	for (let jour = 1; jour <= 7; jour++) {
		await page
			.locator(`input[data-act="seance-rec-jour"][data-def="d1"][data-jour="${jour}"]`)
			.check();
	}

	// Retour à l'accueil enfant, puis carte programme → #seance (pastillesHTML, le
	// site qui a fui « [object Object] » à la place des pastilles).
	await page.locator('.enc-back[data-act="retour"]').click();
	await page.locator('#cardProgramme').click();
	await expect(page).toHaveURL(/#seance$/);
	await expect(page.locator('.programme-pastilles')).toBeVisible();
	await verifierTexteVisible(page, '« Ton programme du jour »');
	expect(errors).toEqual([]);
});

/* Amorce un profil de test dédié avec UNE leçon « due » en révision espacée — même
   procédé que revision.spec.ts (seedDueLesson), dupliqué ici (une spec reste
   autonome, cf. e2e/README.md). */
function seedDueLesson(uuid: string, lessonId: string): string {
	return `
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({ list: [{ uuid, name: 'Test', emoji: '🦊', updatedAt: 1 }], active: uuid }),
		)});
    localStorage.setItem('${uuid}/ludaskia_lessonRevision', JSON.stringify({
      ${JSON.stringify(lessonId)}: { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }
    }));
    ${seedAideVueScript(uuid)}
  `;
}

test('révision QCM : le choix se rend sans balisage en clair', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('e2e-echap-qcm', 'fr-vocab-contraires'));
	await gotoHash(page, 'revision-espacee');

	// renderQcm (revision.ts) : le rendu initial est déjà le site qui a fui « html »
	// nu en prod (giveUpHTML mal refermé) — pas besoin d'interagir pour l'exercer.
	await expect(page.locator('.rev-q-qcm')).toBeVisible();
	await verifierTexteVisible(page, 'révision QCM');

	await page.locator('.rev-choice').first().click();
	await expect(page.locator('.rev-feedback')).toBeVisible();
	expect(errors).toEqual([]);
});

test('révision problème : l’énoncé et ses sous-questions se rendent sans balisage en clair', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedDueLesson('e2e-echap-probleme', 'math-prob-deux-etapes'));
	await gotoHash(page, 'revision-espacee');

	// renderProbleme (revision.ts) : même famille de fuite (decideHTML mal refermé),
	// déjà présente au rendu initial du board.
	await expect(page.locator('.prob-enonce')).toBeVisible();
	await verifierTexteVisible(page, 'révision problème');

	const inputs = page.locator('.prob-input');
	const n = await inputs.count();
	expect(n).toBeGreaterThanOrEqual(2);
	for (let i = 0; i < n; i++) {
		const answer = await inputs.nth(i).getAttribute('data-answer');
		expect(answer).not.toBeNull();
		await inputs.nth(i).fill(answer!);
	}
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback')).toBeVisible();
	expect(errors).toEqual([]);
});
