/* ============================================================
   Contrôle des acquis (#689) : smoke tests e2e.
   ------------------------------------------------------------
   Le sommet de l'escalier de répétition espacée n'est plus une sortie
   définitive : `avancerEtat` y pose désormais un rendez-vous de contrôle à un
   an (`REVISION_CONTROLE_ACQUIS`, src/core/revision.ts) au lieu de
   `prochaineRevision: null`. ~96 tests Vitest couvrent la logique pure
   (l'escalier, le repli de lecture, l'ordre de remplissage, le sous-compte,
   les trophées) : cette spec ne la rejoue PAS. Elle prouve les deux choses
   qu'un navigateur seul peut établir :
     1. un contrôle échu est réellement SERVI dans une vraie séance, et y
        répondre avance l'état (écrit en stockage) ;
     2. un acquis d'AVANT ce changement (`prochaineRevision: null`) est daté
        au moment de la LECTURE (`dernierTest + 365 j`), sans jamais réécrire
        le stockage au simple chargement — c'est le critère « aucune
        migration », qui ne se vérifie nulle part ailleurs en conditions
        réelles (Vitest appelle la fonction pure, il ne charge pas une page).

   Leçon choisie : `num-comparer` (« Je compare les nombres »), déjà utilisée
   par revision.spec.ts / revision-niveau-inferieur.spec.ts pour son
   interaction en tuiles — verdict déterministe (on déduit le bon signe des
   deux nombres de l'énoncé), sans dépendre d'un tirage QCM aléatoire.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

const DAY = 86_400_000;
// PALIER_ACQUIS (src/core/revision.ts) = REVISION_INTERVALLES.length = 6. Pas d'import de
// `src/` dans une spec (cf. e2e/README.md) : la valeur est recopiée en dur, avec sa source.
const PALIER_ACQUIS = 6;
const LESSON_KEY = 'num-comparer@ce2';

interface EtatBrut {
	palier: number;
	prochaineRevision: number | null;
	reussites: number;
	dernierTest: number | null;
}

/* Amorce un profil dédié dont le SEUL état de révision est un acquis (palier
   PALIER_ACQUIS) — rien d'autre n'est dû, actif ou en attente. `etat` est passé en
   argument sérialisé (pas une chaîne de script) : les timestamps sont calculés côté
   Node, comparables tels quels en fin de test. */
async function seedControleAcquis(page: Page, uuid: string, etat: EtatBrut) {
	await page.addInitScript(
		(opts: { uuid: string; lessonKey: string; etat: EtatBrut }) => {
			localStorage.setItem(
				'ludaskia_profiles',
				JSON.stringify({
					list: [
						{ uuid: opts.uuid, name: 'Test', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' },
					],
					active: opts.uuid,
				}),
			);
			localStorage.setItem(
				opts.uuid + '/ludaskia_lessonRevision',
				JSON.stringify({ [opts.lessonKey]: opts.etat }),
			);
		},
		{ uuid, lessonKey: LESSON_KEY, etat },
	);
	await page.addInitScript(seedAideVueScript(uuid));
}

async function lireEtat(page: Page, uuid: string): Promise<EtatBrut> {
	const raw = await page.evaluate(
		(u) => localStorage.getItem(`${u}/ludaskia_lessonRevision`),
		uuid,
	);
	expect(raw).not.toBeNull();
	return JSON.parse(raw!)[LESSON_KEY];
}

/* Déduit le bon signe des deux nombres de l'énoncé, pose la tuile, valide — même geste
   que revision.spec.ts / revision-niveau-inferieur.spec.ts. */
async function jouerComparaisonCorrecte(page: Page) {
	await expect(page.locator('.rev-consigne')).toContainText('compare');
	await expect(page.locator('#ltuiSlot')).toBeVisible();
	const enonce = await page.locator('.ltui-enonce').innerText();
	const m = enonce.match(/(\d+)\D+?(\d+)/);
	expect(m).not.toBeNull();
	const a = Number(m![1]);
	const b = Number(m![2]);
	const signe = a < b ? '<' : a > b ? '>' : '=';
	await page.locator('.ltui-tuile', { hasText: signe }).first().click();
	await page.locator('#revValidate').click();
	await expect(page.locator('.rev-feedback.ok')).toBeVisible();
}

const UUID_NOUVEAU = 'e2e-controle-nouveau';

test('Contrôle des acquis (#689), forme nouvelle : servi en séance, une réussite repousse ~1 an au sommet', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const now = Date.now();
	// Palier au sommet, échéance de contrôle déjà posée (forme #689) et ÉCHUE : rien d'autre
	// n'est dû, c'est ce seul acquis qui doit remplir la séance.
	await seedControleAcquis(page, UUID_NOUVEAU, {
		palier: PALIER_ACQUIS,
		prochaineRevision: now - DAY,
		reussites: 8,
		dernierTest: now - 40 * DAY,
	});
	await gotoHash(page, 'accueil');

	// La carte Révision de l'accueil annonce le contrôle échu comme une révision du jour.
	await expect(page.locator('#cardRevision')).not.toHaveClass(/card-inactive/);
	await expect(page.locator('#recRevision')).toContainText('à réviser');

	// La séance le propose réellement (pas de traitement visuel particulier — hors périmètre
	// de #689 —, c'est exactement le widget d'une comparaison ordinaire).
	await gotoHash(page, 'revision-espacee');
	await jouerComparaisonCorrecte(page);

	const etat = await lireEtat(page, UUID_NOUVEAU);
	expect(etat.palier).toBe(PALIER_ACQUIS); // une réussite au sommet n'en fait PAS descendre
	expect(etat.reussites).toBe(9);
	expect(etat.dernierTest).not.toBeNull();
	// Nouvelle échéance de contrôle : `dernierTest + 365 jours` EXACTEMENT
	// (REVISION_CONTROLE_ACQUIS, src/core/revision.ts) — invariant déterministe, indépendant
	// de l'horloge réelle du test (pas de fenêtre de tolérance à deviner).
	expect(etat.prochaineRevision! - etat.dernierTest!).toBe(365 * DAY);

	expect(errors).toEqual([]);
});

const UUID_ANCIEN = 'e2e-controle-ancien';

test("Contrôle des acquis (#689), forme ancienne (prochaineRevision: null) : repli de lecture SANS migration, puis une réussite avance l'état", async ({
	page,
}) => {
	const errors = watchErrors(page);
	const now = Date.now();
	const dernierTest = now - 400 * DAY; // échéance repliée = dernierTest + 365 j, dans le passé
	// Forme D'AVANT #689 : le sommet posait `prochaineRevision: null` (sortie définitive).
	await seedControleAcquis(page, UUID_ANCIEN, {
		palier: PALIER_ACQUIS,
		prochaineRevision: null,
		reussites: 8,
		dernierTest,
	});
	await gotoHash(page, 'accueil');

	// Critère « aucune migration » : lu AVANT toute interaction, juste après le chargement.
	// Le repli (`echeanceControle`) est une LECTURE, jamais une écriture — le stockage doit
	// rester EXACTEMENT ce qui a été semé, `prochaineRevision: null` compris.
	const etatAvant = await lireEtat(page, UUID_ANCIEN);
	expect(etatAvant.palier).toBe(PALIER_ACQUIS);
	expect(etatAvant.prochaineRevision).toBeNull();
	expect(etatAvant.dernierTest).toBe(dernierTest);

	// Pourtant daté échu à la lecture (dernierTest + 365 j est dans le passé) : la carte
	// l'annonce comme n'importe quel contrôle de forme nouvelle.
	await expect(page.locator('#cardRevision')).not.toHaveClass(/card-inactive/);
	await expect(page.locator('#recRevision')).toContainText('à réviser');

	await gotoHash(page, 'revision-espacee');
	// Un second chargement de page (nouvelle navigation) ne migre toujours rien.
	const etatEnSeance = await lireEtat(page, UUID_ANCIEN);
	expect(etatEnSeance.prochaineRevision).toBeNull();

	await jouerComparaisonCorrecte(page);

	const etatApres = await lireEtat(page, UUID_ANCIEN);
	expect(etatApres.palier).toBe(PALIER_ACQUIS);
	expect(etatApres.reussites).toBe(9);
	expect(etatApres.dernierTest).not.toBeNull();
	// Même invariant qu'en forme nouvelle : désormais une VRAIE échéance numérique,
	// posée à `dernierTest + 365 jours` exactement — la réponse a fait sortir l'élément
	// de la forme ancienne.
	expect(etatApres.prochaineRevision! - etatApres.dernierTest!).toBe(365 * DAY);

	expect(errors).toEqual([]);
});
