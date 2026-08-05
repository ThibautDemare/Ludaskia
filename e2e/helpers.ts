/* ============================================================
   Helpers partagés des smoke tests e2e (#129).
   ============================================================ */
import type { Page } from '@playwright/test';
import { getLessonsBySubject } from '../src/core/catalog';
import type { SchoolLevel, SubjectId } from '../src/core/catalog';

/* Ids des leçons d'une matière à un niveau, dans l'ORDRE pédagogique. SEUL endroit où
   les tests e2e importent du code applicatif, et à garder ainsi : certains scénarios
   doivent amorcer le programme ENTIER (« tout est mis de côté », #485), impossible à
   figer à la main et qui pourrirait à chaque leçon ajoutée. Une spec qui n'a besoin
   que d'un id connu le garde en dur, c'est plus lisible. */
export function leconsDuNiveau(subject: SubjectId, niveau: SchoolLevel): string[] {
	return getLessonsBySubject(subject, niveau).map((l) => l.id);
}

/* Messages de console à ignorer (bruits navigateur sans rapport avec l'app :
   favicon manquant, ressources annexes…). Le 4ᵉ (beforeunload) est un artefact
   Chromium propre aux specs qui forcent un `page.reload()` pendant un sprint/une
   révision EN COURS (#63, `quittingLosesProgress`) sans qu'un vrai clic ait encore
   eu lieu sur la page : Chromium bloque alors SILENCIEUSEMENT la boîte de dialogue
   native (« pas de geste utilisateur depuis le chargement de la frame ») au lieu de
   la montrer, et journalise ce constat — la navigation continue normalement, rien à
   voir avec l'app. */
const BENIGN = [/favicon/i, /manifest/i, /net::ERR/i, /Failed to load resource/i, /beforeunload/i];

/* Pose un collecteur d'erreurs : exceptions non rattrapées (`pageerror`) — le
   signal d'un crash de rendu/navigation — et `console.error` applicatifs (hors
   bruits annexes). Les tests vérifient ensuite que le tableau est vide. */
export function watchErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() !== 'error') return;
		const text = m.text();
		if (!BENIGN.some((re) => re.test(text))) errors.push(`console.error: ${text}`);
	});
	return errors;
}

/* Onboarding niveau (#225) : un profil neuf face à plusieurs niveaux voit une popup
   de choix de classe FORCÉE (overlay bloquant) au chargement. Les smoke tests du
   catalogue se déroulent sur le niveau par défaut → on fixe `niveauReference: 'ce2'`
   AVANT le chargement (catalogue CE2 = toutes les leçons) pour que la popup ne
   s'affiche pas. On préserve une méta déjà seedée par un test (ex. révision) en y
   ajoutant seulement le niveau. La spec dédiée (niveau.spec.ts) teste la popup
   elle-même via une navigation directe, sans cet amorçage.

   Guide de 1re visite (#330) : de même, on amorce les drapeaux « déjà vu » du tour
   enfant ET du mot aux parents (préfixés par le profil actif) pour que cet
   onboarding ne s'affiche pas sur l'accueil de toutes les specs. La spec dédiée
   (tour.spec.ts) navigue « à froid », sans cet amorçage, pour tester l'enchaînement. */
const ENSURE_NIVEAU = `(() => {
	const KEY = 'ludaskia_profiles';
	let m = null;
	try { m = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
	if (!m || !Array.isArray(m.list) || !m.list.length) {
		m = { list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'ce2' }], active: 'e2e' };
	} else {
		m.list.forEach((p) => { if (!p.niveauReference) p.niveauReference = 'ce2'; });
	}
	localStorage.setItem(KEY, JSON.stringify(m));
	localStorage.setItem(m.active + '/ludaskia_tour_seen', 'true');
	localStorage.setItem(m.active + '/ludaskia_parents_seen', 'true');
})();`;

/* Navigue vers une vue routée par hash (#accueil, #categorie-..., #lecon-...).
   L'application vit sur `app.html` (#271 : `index.html` est la page vitrine) ;
   le `#hash` est résolu contre la baseURL (…/Ludaskia/app.html). */
export async function gotoHash(page: Page, hash: string): Promise<void> {
	await page.addInitScript(ENSURE_NIVEAU);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
}

/* Aide contextuelle : masque l'auto-modale pour les runners concernés (dont
   `ordreNombres`, #448 : même widget que `ordre`, formulation « nombres », et
   `clicMot`, dont la révision monte aussi l'aide).
   À appeler via `addInitScript` AVANT `gotoHash` dans les specs préexistantes
   qui exercent ces runners mais ne testent PAS l'aide elle-même.
   Clé préfixée par le profil (uuid par défaut = 'e2e', préfixe = 'e2e/') ; les specs
   qui amorcent LEUR propre profil (révision : uuid dédié) passent le leur, sinon le
   masque tomberait à côté et la modale s'ouvrirait quand même.
   Ne PAS utiliser dans aide-exercice.spec.ts (elle gère l'aide elle-même). */
export function seedAideVueScript(uuid = 'e2e'): string {
	return `localStorage.setItem('${uuid}/ludaskia_aide_vue', '{"tuiles":true,"ordre":true,"ordreNombres":true,"tri":true,"atelier":true,"lettres":true,"tableau":true,"appariement":true,"clicMot":true}');`;
}

/* Surcharge pratique : injecte directement le script sur la page.
   Appeler AVANT gotoHash (addInitScript s'exécute avant le chargement). */
export async function seedAideVue(page: Page): Promise<void> {
	await page.addInitScript(seedAideVueScript());
}
