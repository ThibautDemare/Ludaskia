/* ============================================================
   Galerie visuelle (#412) — DEV UNIQUEMENT.

   Rend en UNE page la fiche de CHAQUE leçon du catalogue, regroupée par
   catégorie. Sert de surface unique aux snapshots visuels Playwright
   (e2e/galerie.spec.ts) : une régression purement graphique (mise en page
   cassée, figure SVG mal rendue, couleur qui change) y devient visible sans
   multiplier les specs. Complète — sans le remplacer — le jugement
   esthétique/émotionnel de l'agent `designer-ux-enfant` : on n'attrape ici que
   les régressions MÉCANIQUES de rendu.

   Ce module est importé DYNAMIQUEMENT derrière `import.meta.env.DEV`
   (ui/navigation.ts) : en build de production, la branche est morte, Rollup
   élimine l'import et ce code N'EST PAS dans le bundle exposé aux utilisateurs
   (critère #412 : galerie absente de la prod).

   DÉTERMINISME (indispensable pour des baselines stables) : toute la
   construction tourne sous `withSeed(SEED, …)`. L'aléa de génération passe par
   `randFloat` (invariant #41, cf. core/utils), donc une graine fixe ⇒ contenu
   identique d'un run à l'autre. Chaque leçon est calibrée à son PREMIER niveau
   (`levels[0]`) plutôt qu'au profil actif : couverture stable de tout le
   catalogue (CE2 comme CM1), indépendante de l'état local.

   PÉRIMÈTRE v1 : les FICHES en rendu PAPIER (`printMode`) — saisie
   texte/numérique, QCM en cases à cocher, opérations posées, figures SVG,
   listes. Le mode papier est indispensable ici : à l'écran, les choix d'un QCM
   sont rendus par son runner interactif, PAS par `renderItem` (un item QCM sans
   `@` s'y rendrait sans champ ni choix). Les écrans de RUNNER interactifs
   (tuiles, tri, appariement, problème, tableau de conversion) sont un autre
   type de rendu, couplé à #sheets / au chrono et à l'enregistrement d'un essai :
   les snapshoter statiquement demanderait d'extraire des fonctions de rendu
   pures — suivi séparé.
   ============================================================ */
import '../styles/galerie.scss';
import { getAllLessons, CATEGORIES, SUBJECTS } from '../core/catalog';
import { buildLessonFiche } from '../core/build';
import { createRenderContext } from '../core/items';
import { withSeed, escapeHTML } from '../core/utils';

/* Graine fixe : le rendu doit être identique à chaque exécution pour que la
   comparaison aux baselines soit stable. Valeur arbitraire (date de l'issue). */
const SEED = 20260713;

/* Construit la galerie et l'injecte dans `container`. `printMode: true` : rendu
   PAPIER des fiches (QCM en cases à cocher, ligne d'écriture garantie) — sinon un
   item QCM sans `@` ressortirait sans champ ni choix (cf. en-tête). Un SEUL
   contexte partagé par toutes les fiches ⇒ identifiants uniques dans toute la
   page (groupes de boutons radio, `for`/`id`), comme un document imprimé (#352). */
export function renderGalerie(container: HTMLElement): void {
	const lessons = getAllLessons();
	const ctx = createRenderContext({ printMode: true });

	const sectionsHTML = withSeed(SEED, () =>
		CATEGORIES.map((cat) => {
			const catLessons = lessons.filter((l) => l.category === cat.id);
			// Catégories sans leçon LessonDef (orthographe dynamique, catégories à venir) :
			// rien à rendre ici (leurs runners/listes sortent du périmètre fiche v1).
			if (!catLessons.length) return '';
			const subject = SUBJECTS.find((s) => s.id === cat.subject);
			const fiches = catLessons
				.map((l) => {
					const fiche = buildLessonFiche(l.id, l.levels[0], ctx);
					return `<article class="gal-lesson">
    <p class="gal-lesson-meta"><code>${escapeHTML(l.id)}</code> · ${escapeHTML(l.levels.join('/'))}</p>
    <div class="page">${fiche}</div>
  </article>`;
				})
				.join('');
			return `<section class="gal-section" data-gallery="${escapeHTML(cat.id)}">
    <h2 class="gal-section-title">${escapeHTML(subject?.label ?? cat.subject)} — ${escapeHTML(cat.label)}</h2>
    ${fiches}
  </section>`;
		}).join(''),
	);

	container.innerHTML = `<div class="galerie">
    <h1 class="gal-h1">Galerie visuelle — rendu du catalogue (dev)</h1>
    <p class="gal-intro">Une fiche par leçon, regroupée par catégorie. Surface des snapshots visuels (#412).</p>
    ${sectionsHTML}
  </div>`;
}
