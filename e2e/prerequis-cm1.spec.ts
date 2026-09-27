/* ============================================================
   Prérequis CE2 chez un enfant passé au CM1 (#724) — smoke tests e2e.
   ------------------------------------------------------------
   Couvre les critères 3, 4, 12, 13 et 18 de l'issue #724 : quand le fil
   pédagogique CM1 arrive sur une leçon dont le prérequis CE2 n'a pas été
   franchi, l'appli insère ce prérequis (accueil, panneau d'étayage, journal
   encadrant) SANS jamais mentionner de classe côté enfant (18), tout en la
   nommant explicitement côté encadrant (13).

   Leçon-cible : math-ordre-grandeur-produit (OG), 7e du fil CM1 maths.
   Prérequis CE2 attendu : math-tables-multiplication (TABLES), avant
   math-multiplier-10-100 (X10) dans l'ordre CE2.

   Pour amener OG en tête du fil sur un profil CM1 neuf : étoiler les 6
   premières leçons du fil maths CM1 (jusqu'à juste avant OG) ET les 7
   premières du fil français CM1 — le fil « prochaine leçon » commence par la
   matière la moins avancée, donc le français doit être devant pour laisser
   les maths s'arrêter sur OG.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';
import { ordreLecons } from '../src/core/ordre';
import { getLessonById } from '../src/core/catalog';

const UUID = 'e2e-prerequis';
const OG = 'math-ordre-grandeur-produit';
const TABLES = 'math-tables-multiplication';
const X10 = 'math-multiplier-10-100';

const LABEL_TABLES = getLessonById(TABLES)?.label ?? '';
const LABEL_OG = getLessonById(OG)?.label ?? '';
if (!LABEL_TABLES || !LABEL_OG) {
	throw new Error('Catalogue : libellé introuvable pour math-tables-multiplication ou OG');
}

function seedProfilCm1(): string {
	return `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: '${UUID}', name: 'Test', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: '${UUID}' }));`;
}

/* Étoile les N premières leçons d'un fil (matière/niveau donnés) pour amener
   la tête de fil pile après elles. */
function etoilesScript(entries: Array<[string, string]>): string {
	const obj: Record<string, number> = {};
	for (const [id, niveau] of entries) obj[`${id}@${niveau}`] = 1;
	return `localStorage.setItem('${UUID}/ludaskia_stars', JSON.stringify(${JSON.stringify(obj)}));`;
}

function seedTeteFilSurOG(): string {
	const mathsAvantOG = ordreLecons('math', 'cm1')
		.slice(0, 6)
		.map((id) => [id, 'cm1'] as [string, string]);
	const francaisAvant = ordreLecons('francais', 'cm1')
		.slice(0, 7)
		.map((id) => [id, 'cm1'] as [string, string]);
	return etoilesScript([...mathsAvantOG, ...francaisAvant]);
}

/* Leçon CE2 travaillée à 40 %, sans essai complet réussi (même forme de stat
   que classe-precedente.spec.ts). */
function statFragile(lessonId: string): string {
	return `'${lessonId}@ce2': { attempts: 1, correct: 4, questions: 10, bestPct: 40, lastPct: 40, recents: [{ ok: 4, total: 10 }], lastAt: 1 }`;
}

function seedStatsTablesFragile(): string {
	return `localStorage.setItem('${UUID}/ludaskia_lessonStats', JSON.stringify({ ${statFragile(TABLES)} }));`;
}

/* ================================================================
   3/18 — Accueil : OG en tête, TABLES travaillée à 40% → la carte
   « Ta prochaine leçon » propose TABLES (le prérequis) plutôt qu'OG, sans
   jamais mentionner de classe.
   ================================================================ */
test('accueil (#724 crit. 3,18) : prérequis TABLES travaillé à 40% proposé à la place d’OG, sans étiquette de classe', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfilCm1());
	await page.addInitScript(seedTeteFilSurOG());
	await page.addInitScript(seedStatsTablesFragile());
	await page.addInitScript(seedAideVueScript(UUID));
	await gotoHash(page, 'accueil');

	const leconDuJour = page.locator('#leconDuJour');
	await expect(leconDuJour).toHaveAttribute('data-lesson', TABLES);
	await expect(leconDuJour.locator('.lj-title')).toContainText(LABEL_TABLES);

	const texte = (await leconDuJour.textContent()) ?? '';
	expect(texte).not.toContain('CE2');
	expect(texte).not.toContain('CM1');

	expect(errors).toEqual([]);
});

/* Témoin (critère 15 par ricochet) : même tête de fil, mais AUCUNE stat CE2 —
   le prérequis n'a jamais été travaillé, donc pas d'insertion : la carte
   propose bien OG. */
test('accueil, témoin (#724 crit. 3) : prérequis jamais travaillé → pas d’insertion, la carte propose OG', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfilCm1());
	await page.addInitScript(seedTeteFilSurOG());
	await page.addInitScript(seedAideVueScript(UUID));
	await gotoHash(page, 'accueil');

	await expect(page.locator('#leconDuJour')).toHaveAttribute('data-lesson', OG);

	expect(errors).toEqual([]);
});

/* ================================================================
   4 — « Voir une autre leçon » : ne réintroduit pas TABLES entre-temps ;
   au plus 10 clics, la carte finit par proposer OG (pas de verrou dessus).
   ================================================================ */
test('accueil (#724 crit. 4) : « autre leçon » finit par proposer OG sans repasser par TABLES, et OG se lance sans verrou', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfilCm1());
	await page.addInitScript(seedTeteFilSurOG());
	await page.addInitScript(seedStatsTablesFragile());
	await page.addInitScript(seedAideVueScript(UUID));
	await gotoHash(page, 'accueil');

	const leconDuJour = page.locator('#leconDuJour');
	await expect(leconDuJour).toHaveAttribute('data-lesson', TABLES);

	let vueOG = false;
	for (let i = 0; i < 10; i++) {
		await leconDuJour.locator('[data-lj="autre"]').click();
		const id = await leconDuJour.getAttribute('data-lesson');
		expect(id).not.toBe(TABLES);
		if (id === OG) {
			vueOG = true;
			break;
		}
	}
	expect(vueOG).toBe(true);

	await gotoHash(page, `lecon-${OG}`);
	// Pas de verrou : la leçon se rend (pas de redirection vers l'accueil, pas
	// d'overlay de blocage — OG est un QCM, ses choix de réponse s'affichent).
	await expect(page.locator('#lqcmChoices .sprint-choice').first()).toBeVisible();

	expect(errors).toEqual([]);
});

/* ================================================================
   12/18 — Panneau d'étayage d'OG : prérequis TABLES jamais travaillé, affiché
   sans étiquette de classe ; épingler → « à revoir » → carte #aRevoir.
   ================================================================ */
test('étayage OG (#724 crit. 12,18) : prérequis TABLES affiché sans classe, épingler alimente #aRevoir', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfilCm1());
	await page.addInitScript(seedAideVueScript(UUID));
	await gotoHash(page, `lecon-${OG}`);
	await page.locator('.etayage-btn').click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();

	const prerequis = page.locator('.etay-prerequis[data-prerequis="' + TABLES + '"]');
	await expect(prerequis).toBeVisible();
	await expect(prerequis.locator('.etay-prerequis-txt')).toContainText(LABEL_TABLES);

	const texteOverlay = (await page.locator('#etayageOverlay').textContent()) ?? '';
	expect(texteOverlay).not.toContain('CE2');
	expect(texteOverlay).not.toContain('CM1');

	await page.locator('#etayEpingler').click();
	const revoir = await page.evaluate(
		(uuid) => localStorage.getItem(`${uuid}/ludaskia_revoir`),
		UUID,
	);
	expect(JSON.parse(revoir ?? '[]')).toContain(TABLES);

	await gotoHash(page, 'accueil');
	await expect(page.locator('#aRevoir')).toHaveAttribute('data-lesson', TABLES);

	expect(errors).toEqual([]);
});

/* Règle actuelle (12) : TABLES ET X10 tous deux franchis → le panneau ne
   propose plus ni l'un ni l'autre en `data-prerequis` (soit la leçon
   précédente de catégorie, soit pas de bloc du tout). */
test('étayage OG (#724 crit. 12) : TABLES et X10 franchis → ni l’un ni l’autre en prérequis', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfilCm1());
	await page.addInitScript(seedAideVueScript(UUID));
	await page.addInitScript(
		`localStorage.setItem('${UUID}/ludaskia_leconReport', JSON.stringify({ '${TABLES}@ce2': { jours: 0, dernierJour: '', reporteLe: 0, reprendreLe: 0, meilleurPct: 80 }, '${X10}@ce2': { jours: 0, dernierJour: '', reporteLe: 0, reprendreLe: 0, meilleurPct: 80 } }));`,
	);
	await gotoHash(page, `lecon-${OG}`);
	await page.locator('.etayage-btn').click();
	await expect(page.locator('#etayageOverlay')).toBeVisible();

	await expect(page.locator(`.etay-prerequis[data-prerequis="${TABLES}"]`)).toHaveCount(0);
	await expect(page.locator(`.etay-prerequis[data-prerequis="${X10}"]`)).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ================================================================
   13 — Journal encadrant : erreurs sur OG, groupe déplié → bloc prérequis
   nommant TABLES et sa classe d'origine (CE2), épingler depuis là. Couvre
   aussi le signal dans le résumé replié, la phrase d'aide du bloc, et les
   noms accessibles distincts des deux boutons « Épingler » d'un même groupe
   (relecture a11y).
   ================================================================ */
function seedErreursOG(uuid: string): string {
	return `(() => {
  const now = Date.now(); const min = 60000;
  const liste = [
    { ts: now,       lessonId: '${OG}', mode: 'lecon', question: '4 x 198 environ', donnee: '400', attendue: '800' },
    { ts: now - min, lessonId: '${OG}', mode: 'lecon', question: '6 x 302 environ', donnee: '1800', attendue: '1800' },
  ];
  localStorage.setItem('${uuid}/ludaskia_erreurs', JSON.stringify(liste));
})();`;
}

const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Report « franchi » (meilleurPct 80) pour DEUX prérequis à la fois — même forme que
   le témoin de l'étayage (crit. 12, ligne ~194) : construit à la main plutôt qu'avec
   `seedReportFranchi`, qui écrase toute la clé et n'accepte donc qu'un seul id. */
function seedReportFranchiTablesEtX10(): string {
	return `localStorage.setItem('${UUID}/ludaskia_leconReport', JSON.stringify({ '${TABLES}@ce2': { jours: 0, dernierJour: '', reporteLe: 0, reprendreLe: 0, meilleurPct: 80 }, '${X10}@ce2': { jours: 0, dernierJour: '', reporteLe: 0, reprendreLe: 0, meilleurPct: 80 } }));`;
}

test('encadrant (#724 crit. 13) : bloc « Prérequis » sur OG nomme TABLES + son origine CE2, épingle, et le signal/l’aide/les noms accessibles suivent', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfilCm1());
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(seedErreursOG(UUID));
	await gotoHash(page, 'encadrant');

	await page.locator('.enc-act-mode[data-act="erreurs-periode"][data-periode="tout"]').click();

	const groupeOG = page.locator('.enc-err-lecon').filter({ hasText: LABEL_OG }).first();
	await expect(groupeOG).toBeVisible();

	// Signal dans le résumé replié : visible SANS déplier (le groupe est encore
	// fermé à ce stade du test).
	await expect(groupeOG.locator('.enc-err-sum')).toContainText('prérequis à revoir');

	// Phrase d'aide du bloc : explique le mot « Prérequis » dès qu'une ligne existe.
	const hint = page.locator('.enc-block .enc-hint').filter({ hasText: 'Dépliez une leçon' });
	await expect(hint).toContainText('Un « Prérequis » signale');

	await groupeOG.locator('.enc-err-sum').click();

	const prerequisBloc = groupeOG.locator(`.enc-err-prerequis[data-prerequis="${TABLES}"]`);
	await expect(prerequisBloc).toBeVisible();
	await expect(prerequisBloc).toContainText('Prérequis');
	await expect(prerequisBloc).toContainText(LABEL_TABLES);

	// Scopé au bloc de CE prérequis : le groupe OG peut afficher DEUX blocs
	// prérequis (TABLES et X10, tant qu'aucun n'est franchi), chacun avec son
	// propre badge d'origine.
	const origine = prerequisBloc.locator('.enc-classe-origine');
	await expect(origine).toBeVisible();
	await expect(origine).toContainText('CE2');

	// Infobulle AVANT l'épinglage : invite à épingler, ne prétend pas encore que
	// c'est fait.
	const infobulleAvant = (await origine.getAttribute('aria-label')) ?? '';
	expect(infobulleAvant).toContain('Épinglez-la');
	expect(infobulleAvant).not.toContain('épinglée volontairement');

	// Noms accessibles distincts : le bouton du PRÉREQUIS nomme TABLES + sa
	// classe d'origine, celui du GROUPE (dans .enc-actions) nomme OG — jamais
	// le même nom accessible pour deux actions différentes (relecture a11y).
	const boutonPrerequis = prerequisBloc.locator('button[data-act="epingler"]');
	const boutonGroupe = groupeOG.locator('.enc-actions button[data-act="epingler"]');
	const labelPrerequis = (await boutonPrerequis.getAttribute('aria-label')) ?? '';
	const labelGroupe = (await boutonGroupe.getAttribute('aria-label')) ?? '';
	expect(labelPrerequis).toContain(LABEL_TABLES);
	expect(labelPrerequis).toContain('(CE2)');
	expect(labelPrerequis).not.toBe(labelGroupe);

	await boutonPrerequis.click();
	const revoir = await page.evaluate(
		(uuid) => localStorage.getItem(`${uuid}/ludaskia_revoir`),
		UUID,
	);
	const liste = JSON.parse(revoir ?? '[]');
	expect(liste).toContain(TABLES);
	expect(liste).not.toContain(OG);

	// Infobulle APRÈS l'épinglage : le re-rendu remplace le DOM du groupe (il
	// se replie, aucun état `open` n'est conservé côté rendu) — on le rouvre
	// avant de relire le badge du MÊME prérequis.
	await groupeOG.locator('.enc-err-sum').click();
	const prerequisBlocApres = groupeOG.locator(`.enc-err-prerequis[data-prerequis="${TABLES}"]`);
	await expect(prerequisBlocApres).toBeVisible();
	const infobulleApres =
		(await prerequisBlocApres.locator('.enc-classe-origine').getAttribute('aria-label')) ?? '';
	expect(infobulleApres).toContain('épinglée volontairement');
	await expect(prerequisBlocApres.locator('button[data-act="epingler"]')).toHaveText('Retirer');

	expect(errors).toEqual([]);
});

test('encadrant (#724 crit. 13) : TABLES et X10 franchis → plus de bloc « Prérequis », plus de signal ni d’aide sur OG', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedProfilCm1());
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(seedErreursOG(UUID));
	await page.addInitScript(seedReportFranchiTablesEtX10());
	await gotoHash(page, 'encadrant');

	await page.locator('.enc-act-mode[data-act="erreurs-periode"][data-periode="tout"]').click();

	const groupeOG = page.locator('.enc-err-lecon').filter({ hasText: LABEL_OG }).first();
	await expect(groupeOG).toBeVisible();

	// Témoin du signal : plus aucun prérequis ouvert → le résumé ne le mentionne plus.
	await expect(groupeOG.locator('.enc-err-sum')).not.toContainText('prérequis');

	// Témoin de l'aide : la phrase n'explique plus un mot absent de l'écran.
	const hint = page.locator('.enc-block .enc-hint').filter({ hasText: 'Dépliez une leçon' });
	await expect(hint).not.toContainText('Un « Prérequis » signale');

	await groupeOG.locator('.enc-err-sum').click();
	await expect(groupeOG.locator(`.enc-err-prerequis[data-prerequis="${TABLES}"]`)).toHaveCount(0);
	await expect(groupeOG.locator(`.enc-err-prerequis[data-prerequis="${X10}"]`)).toHaveCount(0);

	expect(errors).toEqual([]);
});
