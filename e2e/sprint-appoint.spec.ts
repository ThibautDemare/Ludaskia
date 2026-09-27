/* ============================================================
   Smoke e2e — appoint de la classe précédente dans le SPRINT (#724, crit. 10,
   11, 18 côté sprint).
   ------------------------------------------------------------
   Un profil CM1 avec des leçons CE2-only « fragiles » (travaillées, jamais
   franchies, stat à 40 %) doit voir ces leçons parfois tirées EN APPOINT par
   le sprint « tout », sans jamais l'afficher à l'enfant (pas de « CE2 »/« CM1 »
   dans le HUD ni le bilan — crit. 18) ; l'appoint se lit uniquement dans
   `ludaskia_lessonStats` (clé `@ce2` qui gagne des questions, jamais de clé
   `@cm1` créée pour ces leçons). Un sprint FAVORI (sélection CM1 explicite)
   ne doit lui jamais piocher dans ces stats (crit. 11).

   Déterminisme du tirage (`core/appoint-sprint.ts` → `tirerAppoint`, appelé
   avec `Math.random` par `ui/sprint.ts` → `pickSprintDef`) : `Math.random` est
   remplacé par un mulberry32 à graine fixe, posé AVANT le chargement de l'app
   (`addInitScript`). Graine retenue : 1 (cf. rapport) — elle produit un tirage
   d'appoint (`math-complements`) autour de la 9ᵉ question ; 25 questions
   laissent une marge confortable.

   Piège mesuré en écrivant cette spec (à ne pas réintroduire) : les stats de
   sprint ne sont PAS écrites question par question, seulement à la
   FINALISATION (`finalizeSprint`, appelée en atteignant `.sprint-done`) — un
   test qui boucle sur des questions sans jamais faire s'écouler les 5 minutes
   (`page.clock.fastForward('05:01')`) ne verra donc jamais `ludaskia_lessonStats`
   bouger, tirage d'appoint ou non.

   Chaque question est répondue à VIDE (chemin `sansTentative`, déterministe,
   cf. e2e/je-ne-sais-pas.spec.ts) : peu importe la bonne réponse, y compris
   pour les formats QCM (`.sprint-choice`) où le premier choix est cliqué — un
   double chemin gère alors la correction manuelle (`#sprintContinue`, réponse
   fausse) et l'auto-avance chronométrée (`#sprintContinue` absent : la
   pioche est tombée juste, on avance l'horloge de 700 ms).
   ============================================================ */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

const UUID = 'e2e-sprint-appoint';
const FRAGILES = ['math-complements', 'math-doubles', 'math-tables-multiplication', 'fr-mbp'];
const SEED = 1;
/* Assez pour couvrir le tirage d'appoint observé (~9ᵉ question) avec de la marge. */
const NB_QUESTIONS = 25;

function seedProfil(uuid: string, niveauReference: 'ce2' | 'cm1'): string {
	return `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: '${uuid}', name: 'Test', emoji: '🦊', updatedAt: 1, niveauReference: '${niveauReference}' }], active: '${uuid}' }));`;
}

function statFragile(lessonId: string) {
	return `'${lessonId}@ce2': { attempts: 1, correct: 4, questions: 10, bestPct: 40, lastPct: 40, recents: [{ ok: 4, total: 10 }], lastAt: 1 }`;
}

/* Les 4 leçons CE2 fragiles (travaillées, jamais franchies) que le profil CM1 peut
   voir tirées en appoint. */
const SEED_STATS = `localStorage.setItem('${UUID}/ludaskia_lessonStats', JSON.stringify({ ${FRAGILES.map(statFragile).join(', ')} }));`;

/* mulberry32 : PRNG à graine fixe, remplace Math.random AVANT le chargement de
   l'appli (déterminisme total du tirage d'appoint, cf. `tirerAppoint`). */
function seedRandomScript(seed: number): string {
	return `(() => {
		function mulberry32(a) {
			return function () {
				a |= 0; a = (a + 0x6d2b79f5) | 0;
				let t = Math.imul(a ^ (a >>> 15), 1 | a);
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};
		}
		Math.random = mulberry32(${seed});
	})();`;
}

async function lireStats(page: Page, uuid: string): Promise<Record<string, { questions: number }>> {
	return page.evaluate(
		(u) => JSON.parse(localStorage.getItem(`${u}/ludaskia_lessonStats`) || '{}'),
		uuid,
	);
}

async function isVisibleSoon(locator: Locator, ms = 400): Promise<boolean> {
	try {
		await locator.waitFor({ state: 'visible', timeout: ms });
		return true;
	} catch {
		return false;
	}
}

/* Répond à UNE question du sprint, à vide (réponse fausse déterministe, peu importe
   le format tiré) puis avance jusqu'à la question suivante. QCM : premier choix
   cliqué ; si la pioche était la bonne réponse, l'auto-avance chronométrée (~600 ms)
   remplace la correction manuelle — d'où le double chemin. */
async function repondreUneQuestion(page: Page): Promise<void> {
	const input = page.locator('#sprintInput');
	const choice = page.locator('.sprint-choice').first();
	if (await input.isVisible().catch(() => false)) {
		await input.fill('');
		await page.locator('#sprintValidate').click();
		await expect(page.locator('#sprintContinue')).toBeVisible();
		await page.locator('#sprintContinue').click();
	} else if (await choice.isVisible().catch(() => false)) {
		await choice.click();
		if (await isVisibleSoon(page.locator('#sprintContinue'))) {
			await page.locator('#sprintContinue').click();
		} else {
			await page.clock.fastForward(700);
		}
	} else {
		throw new Error(`widget sprint inconnu : ${await page.locator('#sprintStage').innerHTML()}`);
	}
}

/* Lance le sprint « tout » (filtre par défaut, aucune classe/matière restreinte)
   depuis l'écran de config. L'horloge DOIT être installée AVANT ce clic (avant la
   création du setInterval du décompte, cf. e2e/README.md « Sprint déterministe »). */
async function lancerSprintTout(page: Page): Promise<void> {
	await gotoHash(page, 'sprint-config');
	await page.clock.install();
	await page.locator('#scLaunch').click();
	await expect(page.locator('#sprintTime')).toBeVisible();
}

test('Sprint « tout » avec les 4 fragiles semées : aucune fuite « CE2 »/« CM1 », au moins un appoint tiré (#724 crit. 10, 18)', async ({
	page,
}) => {
	test.setTimeout(60_000);
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil(UUID, 'cm1'));
	await page.addInitScript(SEED_STATS);
	await page.addInitScript(seedRandomScript(SEED));
	await page.addInitScript(seedAideVueScript(UUID));

	await lancerSprintTout(page);

	for (let i = 0; i < NB_QUESTIONS; i++) {
		// Crit. 18 : jamais d'étiquette de classe dans le HUD, à CHAQUE question
		// (l'appoint ne se signale pas plus qu'une question ordinaire).
		const hud = await page.locator('.sprint-hud').innerText();
		expect(hud).not.toContain('CE2');
		expect(hud).not.toContain('CM1');
		await repondreUneQuestion(page);
	}

	// Fin du sprint par l'horloge (pas par épuisement d'un compteur de questions).
	await page.clock.fastForward('05:01');
	await expect(page.locator('.sprint-done')).toBeVisible();

	// Crit. 18 : le bilan non plus ne nomme jamais la classe.
	const bilan = await page.locator('.sprint-done').innerText();
	expect(bilan).not.toContain('CE2');
	expect(bilan).not.toContain('CM1');

	// Crit. 10 : au moins une des 4 fragiles a gagné des questions sous `@ce2`
	// (preuve qu'un appoint a bien été tiré et journalisé), et AUCUNE clé `@cm1`
	// n'a été créée pour elles (l'appoint s'écrit au niveau de STOCKAGE d'origine).
	const stats = await lireStats(page, UUID);
	const uneFragileABouge = FRAGILES.some((id) => (stats[`${id}@ce2`]?.questions ?? 0) > 10);
	expect(uneFragileABouge).toBe(true);
	for (const id of FRAGILES) {
		expect(stats[`${id}@cm1`]).toBeUndefined();
	}

	expect(errors).toEqual([]);
});

/* ---------- Critère 11 : un sprint FAVORI ne touche jamais les fragiles ----------
   Sélection explicite de leçons (#64, `startCustomSprint`) : seed direct de
   `ludaskia_bilans` (favori) + `ludaskia_seance` (étape kind 'favori', pool à un
   seul favori pour un tirage déterministe), même pattern que
   e2e/programme-favori.spec.ts (compositeur ne sachant pas encore créer ce type
   d'étape). Lancement : tuile du programme du jour (`#seance`). */
const FAVORI_LESSON_ID = 'num-dec-position'; // leçon CM1 réelle, hors des 4 fragiles

function seedFavoriSprintScript(uuid: string): string {
	const bilans = [
		{
			id: 'fav-cm1',
			label: 'Sprint CM1 ciblé',
			lessonIds: [FAVORI_LESSON_ID],
			questionsPerLesson: 3,
			mode: 'sprint',
		},
	];
	const defs = [
		{
			id: 'd1',
			etapes: [{ id: 'e1', kind: 'favori', refs: ['fav-cm1'], count: 1 }],
			recurrence: { type: 'hebdo', jours: [1, 2, 3, 4, 5, 6, 7] },
		},
	];
	return `(function(){
		localStorage.setItem('${uuid}/ludaskia_bilans', ${JSON.stringify(JSON.stringify(bilans))});
		localStorage.setItem('${uuid}/ludaskia_seance', ${JSON.stringify(JSON.stringify(defs))});
	})();`;
}

test('Sprint FAVORI (sélection CM1 explicite) : aucune stat « @ce2 » des fragiles ne bouge (#724 crit. 11)', async ({
	page,
}) => {
	test.setTimeout(60_000);
	const errors = watchErrors(page);
	await page.addInitScript(seedProfil(UUID, 'cm1'));
	await page.addInitScript(SEED_STATS);
	await page.addInitScript(seedRandomScript(SEED));
	await page.addInitScript(seedAideVueScript(UUID));
	await page.addInitScript(seedFavoriSprintScript(UUID));

	await gotoHash(page, 'seance');
	const tuile = page.locator('.programme-tuile[data-act="lancer"]').first();
	await expect(tuile).toBeVisible();

	// Horloge installée AVANT le clic qui lance le sprint (crée le setInterval du décompte).
	await page.clock.install();
	await tuile.click();
	await expect(page.locator('#sprintStage')).toBeVisible();

	for (let i = 0; i < 3; i++) await repondreUneQuestion(page);
	await page.clock.fastForward('05:01');
	await expect(page.locator('.sprint-done')).toBeVisible();

	const stats = await lireStats(page, UUID);
	for (const id of FRAGILES) {
		expect(stats[`${id}@ce2`]?.questions ?? 0).toBe(10); // valeur de départ, inchangée
		expect(stats[`${id}@cm1`]).toBeUndefined();
	}

	expect(errors).toEqual([]);
});
