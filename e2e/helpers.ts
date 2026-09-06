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
   le `#hash` est résolu contre la baseURL (…/Ludaskia/app.html).

   Piège Chromium (constaté sur mesures-decimaux.spec.ts et impression-rendu.spec.ts, tous
   deux intermittents en suite complète alors que verts en isolation) : un `page.goto` vers
   une URL IDENTIQUE à l'URL courante — même hash — est un NO-OP silencieux, sans navigation
   ni re-rendu. Une spec qui rappelle `gotoHash` sur LE MÊME hash pour forcer un nouveau
   tirage (fiche aléatoire, question suivante d'une série…) revoit alors indéfiniment l'écran
   du tout premier appel : la boucle « on relance jusqu'à N fois » ne relance en réalité
   qu'UNE fois, et échoue dès que ce premier tirage est défavorable. On détecte ce cas précis
   (même hash que l'URL courante) et on force un `.reload()` — SEULEMENT alors : recharger
   systématiquement, y compris quand le hash change, ajouterait une navigation par appel sur
   les 561 tests de la suite, pour un gain nul dans l'immense majorité des cas où le hash
   change réellement. */
export async function gotoHash(page: Page, hash: string): Promise<void> {
	await page.addInitScript(ENSURE_NIVEAU);
	const dejaSurCetHash = (() => {
		try {
			const u = new URL(page.url());
			return u.pathname.endsWith('/app.html') && u.hash === `#${hash}`;
		} catch {
			return false;
		}
	})();
	if (dejaSurCetHash) {
		await page.reload({ waitUntil: 'networkidle' });
		return;
	}
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

/* Amorçage des TROIS VERROUS de l'encart « Pour les parents » (#306 §7,
   `core/rappel-sauvegarde.ts`) : engagement réel (au moins `activites`
   entrées, comparé au seuil MIN_ACTIVITES = 3 côté source, non importé ici —
   cf. la remarque sur les imports `src/` en tête de fichier), plus de 48 h
   depuis le premier lancement, jamais exporté récemment. Réutilisé par
   `rappel-sauvegarde.spec.ts` (comportement) ET `a11y-axe.spec.ts` (scan de
   l'encart, qui sinon ne s'affiche jamais dans un profil frais). */
export interface SeedRappelOptions {
	uuid?: string;
	now?: number;
	/** Nombre d'activités enregistrées, une par jour dans le passé (déf. 3, le seuil). */
	activites?: number;
	/** Ancienneté du dernier export (ou de l'origine si jamais exporté), en ms (déf. 3 jours). */
	depuisSauvegardeMs?: number;
}

export function seedRappelSauvegardeScript(opts: SeedRappelOptions = {}): string {
	const DAY = 24 * 60 * 60 * 1000;
	const uuid = opts.uuid ?? 'e2e';
	const now = opts.now ?? Date.now();
	const nActivites = opts.activites ?? 3;
	const depuis = now - (opts.depuisSauvegardeMs ?? 3 * DAY);
	const seed: Record<string, unknown> = {
		ludaskia_profiles: {
			list: [{ uuid, name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' }],
			active: uuid,
		},
		[`${uuid}/ludaskia_tour_seen`]: true,
		[`${uuid}/ludaskia_parents_seen`]: true,
		[`${uuid}/ludaskia_activity`]: Array.from({ length: nActivites }, (_, i) => ({
			t: now - (i + 1) * DAY,
			k: 'exo',
		})),
		ludaskia_sauvegarde: { depuis, palier: 0 },
	};
	// Une seule ligne de script : chaque valeur est sérialisée en JSON, ce que
	// `lsGet`/`lsGetRaw` (JSON.parse tolérant) attendent aussi bien pour les
	// booléens (`"true"`) que pour les objets/tableaux.
	return `(function(){var seed=${JSON.stringify(
		seed,
	)};Object.keys(seed).forEach(function(k){localStorage.setItem(k, JSON.stringify(seed[k]));});})();`;
}

/* Attend la fin des animations d'ENTRÉE (finies, non infinies) du sous-arbre visé, AVANT
   d'interagir avec son contenu ou de le scanner : le gabarit `.modal` porte une animation
   `modal-pop` (250 ms, `scale(0.85) → scale(1)`) qui déplace ses coins de plusieurs dizaines
   de pixels pendant son déroulé — un clic sur une commande DEDANS (croix de fermeture,
   bouton d'action) tombe alors pendant le mouvement plutôt qu'après, et l'actionnabilité de
   Playwright s'y perd par intermittence (#490, flake d'etayage-redige.spec.ts). Aucun humain
   ne clique dans les 250 ms qui suivent l'ouverture : attendre la fin de l'animation est le
   pendant, côté clic, de ce que fait déjà ce helper côté scan a11y (contraste non déterministe
   à mi-fondu). On écarte les animations infinies (ambiance) pour ne jamais bloquer dessus. */
export async function settleAnimations(page: Page, selector: string): Promise<void> {
	await page
		.locator(selector)
		.first()
		.evaluate((el) =>
			Promise.all(
				el
					.getAnimations({ subtree: true })
					.filter(
						(a) => (a.effect as KeyframeEffect | null)?.getComputedTiming().iterations !== Infinity,
					)
					.map((a) => a.finished.catch(() => undefined)),
			),
		);
}

/* Un point cliquable est-il bien l'élément AU-DESSUS en son propre centre géométrique ?
   Lecture BRUTE du rendu (`elementFromPoint`), sans passer par l'actionnabilité complète de
   Playwright : son étape « scrolling into view if needed » défile le conteneur AVANT chaque
   `.click()`, y compris quand l'élément est déjà entièrement visible — et un élément en
   `position: absolute` DANS un conteneur défilant (`.modal { overflow-y: auto }`) se déplace
   avec ce défilement. Le point de clic, calculé plus tôt, atterrit alors sur ce qui a pris sa
   place (constaté sur `.aide-close` : « element is visible, enabled and stable » PUIS
   « scrolling into view if needed » PUIS interception, #490). Cette lecture-ci n'a rien à
   faire défiler, donc rien ne peut se déplacer entre le calcul du point et sa mesure. */
export async function estAtteignable(page: Page, selector: string): Promise<boolean> {
	return page.evaluate((sel) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		if (!el) return false;
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) return false; // masqué (display:none, etc.)
		const cx = r.left + r.width / 2;
		const cy = r.top + r.height / 2;
		const top = document.elementFromPoint(cx, cy);
		return !!top && (top === el || el.contains(top));
	}, selector);
}

/* ============================================================
   Étagère de jeux (#661) — écrits AVANT l'implémentation, contre le contrat
   `tmp-contrat.md` (racine du dépôt, temporaire). Réutilisés par
   jeux-etagere.spec.ts, jeu-2048.spec.ts et jeu-motus.spec.ts.
   ============================================================ */

/* Sème les jeux déjà POSSÉDÉS du profil actif : `CLE_POSSEDES` du contrat
   (`src/core/jeux/etat.ts`), `ludaskia_jeux_possedes`, un tableau d'ids
   (`jeuxPossedes(): string[]`). Même style d'amorçage que
   `seedRappelSauvegardeScript` : le tableau est embarqué comme littéral JS
   (Node → texte de script), puis re-sérialisé en JSON côté NAVIGATEUR avant
   `setItem` — c'est bien une CHAÎNE que `lsGet` doit retrouver via
   `JSON.parse`, pas l'objet lui-même.
   À appeler via `page.addInitScript(...)` AVANT `gotoHash`. */
export function seedJeuxPossedesScript(ids: string[], uuid = 'e2e'): string {
	return `localStorage.setItem('${uuid}/ludaskia_jeux_possedes', JSON.stringify(${JSON.stringify(ids)}));`;
}

/* Ouvre l'étagère depuis l'accueil (bouton #btnJeux → modale #jeuxEtagere,
   critère 39). Suppose qu'on est déjà sur l'accueil. */
export async function ouvrirEtagere(page: Page): Promise<void> {
	await page.locator('#btnJeux').click();
	await page.locator('#jeuxEtagere').waitFor({ state: 'visible' });
}

/* Ouvre l'étagère puis lance le PREMIER jeu listé (écran plein #jeuEcran,
   critère 39). Les specs qui l'utilisent sèment un SEUL jeu possédé au
   préalable (`seedJeuxPossedesScript`), pour ne pas dépendre d'un attribut
   distinguant un jeu précis dans `.jeu-item` — absent du contrat. */
export async function ouvrirJeuDepuisEtagere(page: Page): Promise<void> {
	await ouvrirEtagere(page);
	await page.locator('.jeu-item').first().click();
	await page.locator('#jeuEcran').waitFor({ state: 'visible' });
}
