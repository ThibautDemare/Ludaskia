/* ============================================================
   Galerie visuelle (#412, #419) — DEV UNIQUEMENT.

   Rend en UNE page la fiche de CHAQUE leçon du catalogue, regroupée par
   catégorie, PUIS un exemplaire de chaque ÉCRAN DE RUNNER interactif (#419).
   Sert de surface unique aux snapshots visuels Playwright (e2e/galerie.spec.ts) :
   une régression purement graphique (mise en page cassée, figure SVG mal rendue,
   couleur qui change) y devient visible sans multiplier les specs. Complète — sans
   le remplacer — le jugement esthétique/émotionnel de l'agent `designer-ux-enfant` :
   on n'attrape ici que les régressions MÉCANIQUES de rendu.

   Ce module est importé DYNAMIQUEMENT derrière `import.meta.env.DEV`
   (ui/navigation.ts) : en build de production, la branche est morte, Rollup
   élimine l'import et ce code N'EST PAS dans le bundle exposé aux utilisateurs
   (critère #412 : galerie absente de la prod).

   DÉTERMINISME (indispensable pour des baselines stables) : toute la
   construction tourne sous `withSeed(SEED, …)`. L'aléa de génération passe par
   `randFloat` (invariant #41, cf. core/utils), donc une graine fixe ⇒ contenu
   identique d'un run à l'autre. Chaque leçon est calibrée à son PREMIER niveau
   (`levels[0]`) plutôt qu'au profil actif : couverture stable de tout le
   catalogue (CE2 comme CM1), indépendante de l'état local. ⚠ Le câblage des
   widgets (bindTuileInteraction/bindAppariement) reste DANS le `withSeed` :
   `bindAppariement` re-mélange ses colonnes via `sample()` AU BIND (#419).

   PÉRIMÈTRE FICHES (#412) : les FICHES en rendu PAPIER (`printMode`) — saisie
   texte/numérique, QCM en cases à cocher, opérations posées, figures SVG, listes.
   Le mode papier est indispensable ici : à l'écran, les choix d'un QCM sont rendus
   par son runner interactif, PAS par `renderItem` (un item QCM sans `@` s'y rendrait
   sans champ ni choix).

   PÉRIMÈTRE RUNNERS (#419) : les 6 types d'écran de runner (tuiles, ordre, tri,
   appariement, problème, tableau de conversion), un exemplaire chacun. Rendus par
   le MÊME code que le runner live — les widgets partagés (ui/tuile-interaction.ts,
   ui/appariement.ts) et les fonctions de board extraites des runners
   problème/tableau (renderProblemeBoardHTML, renderTableauBoardHTML) — de sorte
   qu'un snapshot détecte les régressions du VRAI rendu. AUCUN effet de bord ici :
   on N'appelle PAS les entrées `runLeconXxx` (elles mutent la toolbar, ouvrent
   l'aide, écrivent en storage) — juste les widgets/markups. Le runner tableau
   attache un `keydown` sur `document` via `wireInteraction` : NON appelé ici (seul
   le markup pur l'est), donc pas de listener résiduel.
   ============================================================ */
import '../styles/galerie.scss';
import { getAllLessons, getLessonById, CATEGORIES, SUBJECTS } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { labelLecon } from '../core/levels';
import { buildLessonFiche } from '../core/build';
import { createRenderContext } from '../core/items';
import { withSeed, escapeHTML } from '../core/utils';
import type { Exercise } from '../core/exercise';
import { bindTuileInteraction } from './tuile-interaction';
import type { TuileOptions, TuileSpec } from './tuile-interaction';
import { bindAppariement } from './appariement';
import type { AppariementSpec } from './appariement';
import { renderProblemeBoardHTML } from './lecon-probleme';
import { renderTableauBoardHTML, buildCells } from './lecon-tableau';

/* Graine fixe : le rendu doit être identique à chaque exécution pour que la
   comparaison aux baselines soit stable. Valeur arbitraire (date de l'issue). */
const SEED = 20260713;

/* Options de widget « inertes » : on ne joue pas la galerie, on ne fait que la
   RENDRE — `onState` est un no-op (aucun bouton « Vérifier » à (dé)activer). */
const OPTS_INERTES: TuileOptions = { variant: 'lecon', onState: () => {} };

/* Un exemplaire de runner à rendre : sa section (`data-gallery` → capture dédiée),
   son titre, et une closure qui GÉNÈRE + rend le board dans le conteneur fourni.
   La closure tourne sous `withSeed` (cf. renderGalerie). */
interface RunnerExemple {
	gallery: string;
	titre: string;
	render(host: HTMLElement): void;
}

/* Génère l'Exercise d'une leçon à son premier niveau (comme les fiches), pour le
   mode demandé. Lève si la leçon a disparu du catalogue (signal de maintenance en
   dev — la galerie est DEV-only). */
function genExemple(lessonId: string, mode?: string): { lesson: LessonDef; ex: Exercise } {
	const lesson = getLessonById(lessonId);
	if (!lesson) throw new Error(`Galerie (#419) : leçon inconnue « ${lessonId} ».`);
	return { lesson, ex: lesson.exerciseType.generate({ mode, level: lesson.levels[0] }) };
}

/* Enveloppe « scène » commune aux runners à WIDGET (tuiles/ordre/tri/appariement) :
   même structure que le renderQuestion du runner live (sprint-stage + libellé de
   leçon + éventuelle consigne), avec le placeholder `[data-tuile-mount]` que le
   widget remplace au bind. `consigneHTML` reproduit le paragraphe d'énoncé des
   runners ordre/tri/appariement (le runner tuiles n'en a pas : le widget rend
   lui-même l'énoncé avec le `@`). */
function sceneWidget(label: string, consigneHTML: string): string {
	return `<div class="sprint sprint-lecon">
    <div class="sprint-stage">
      <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(label)}</span></div>
      ${consigneHTML}
      <div data-tuile-mount></div>
    </div>
  </div>`;
}

/* Section de galerie autour d'un board (titre + contenu). `data-gallery` la rend
   capturable un-à-un par e2e/galerie.spec.ts (une nouvelle section = une capture). */
function runnerSection(gallery: string, titre: string, boardHTML: string): string {
	return `<section class="gal-section gal-runner" data-gallery="${escapeHTML(gallery)}">
    <h2 class="gal-section-title">${escapeHTML(titre)}</h2>
    ${boardHTML}
  </section>`;
}

/* Les 6 exemplaires (#419), un par type d'écran de runner. Le mode retenu est celui
   qui, pour la leçon choisie, PRODUIT le type d'écran visé (cf. modes du catalogue) :
   - tuiles      → `num-comparer` (numération), mode « tuiles » : comparer deux nombres ;
   - ordre       → `fr-vocab-alpha-initiale` (vocabulaire), mode « tuiles » : rangement alpha ;
   - tri         → `fr-vocab-champs-tri` (champs lexicaux), mode « tri » : deux thèmes ;
   - appariement → `fr-vocab-familles-relier` (familles), mode « relier » : relier des paires ;
   - problème    → `math-prob-deux-etapes` : le board le plus riche (deux étapes + badges) ;
   - tableau     → `mes-longueurs` (mesures), mode « tableau » : colonnes + pavé de chiffres. */
const RUNNER_EXEMPLES: RunnerExemple[] = [
	{
		gallery: 'runner-tuiles',
		titre: 'Runner — déplacer une tuile (numération)',
		render(host) {
			const { lesson, ex } = genExemple('num-comparer', 'tuiles');
			if (ex.type !== 'tuilesNombre') throw new Error('Galerie : type tuilesNombre attendu.');
			const spec: TuileSpec = {
				kind: 'tuile',
				question: ex.question,
				answer: ex.answer,
				tuiles: ex.tuiles,
				parle: ex.parle,
			};
			host.innerHTML = sceneWidget(labelLecon(lesson, lesson.levels[0]), '');
			bindTuileInteraction(host, spec, OPTS_INERTES);
		},
	},
	{
		gallery: 'runner-ordre',
		titre: 'Runner — ranger une suite (ordre alphabétique)',
		render(host) {
			const { lesson, ex } = genExemple('fr-vocab-alpha-initiale', 'tuiles');
			if (ex.type !== 'tuilesOrdre') throw new Error('Galerie : type tuilesOrdre attendu.');
			const spec: TuileSpec = {
				kind: 'ordre',
				question: ex.question,
				ordre: ex.ordre,
				tuiles: ex.tuiles,
			};
			const consigne = `<p class="sprint-q lord-consigne">${escapeHTML(ex.question)}</p>`;
			host.innerHTML = sceneWidget(labelLecon(lesson, lesson.levels[0]), consigne);
			bindTuileInteraction(host, spec, OPTS_INERTES);
		},
	},
	{
		gallery: 'runner-tri',
		titre: 'Runner — ranger par thème (champs lexicaux)',
		render(host) {
			const { lesson, ex } = genExemple('fr-vocab-champs-tri', 'tri');
			if (ex.type !== 'tuilesTri') throw new Error('Galerie : type tuilesTri attendu.');
			const spec: TuileSpec = {
				kind: 'tri',
				question: ex.question,
				categories: ex.categories,
				mots: ex.mots,
			};
			const consigne = `<p class="sprint-q lord-consigne">${escapeHTML(ex.question)}</p>`;
			host.innerHTML = sceneWidget(labelLecon(lesson, lesson.levels[0]), consigne);
			bindTuileInteraction(host, spec, OPTS_INERTES);
		},
	},
	{
		gallery: 'runner-appariement',
		titre: 'Runner — relier des paires (familles de mots)',
		render(host) {
			const { lesson, ex } = genExemple('fr-vocab-familles-relier', 'relier');
			if (ex.type !== 'appariement') throw new Error('Galerie : type appariement attendu.');
			const spec: AppariementSpec = {
				question: ex.question,
				paires: ex.paires,
				intrus: ex.intrus,
			};
			const consigne = `<p class="sprint-q lapp-titre">${escapeHTML(ex.question)}</p>`;
			host.innerHTML = sceneWidget(labelLecon(lesson, lesson.levels[0]), consigne);
			// bindAppariement re-mélange les colonnes via sample() AU BIND → doit rester
			// dans le withSeed de renderGalerie (garanti : render() y est appelé). La
			// géométrie SVG se calcule après insertion (host est dans #sheets, donc en page).
			bindAppariement(host, spec, OPTS_INERTES);
		},
	},
	{
		gallery: 'runner-probleme',
		titre: 'Runner — résolution de problèmes',
		render(host) {
			const { lesson, ex } = genExemple('math-prob-deux-etapes');
			if (ex.type !== 'probleme') throw new Error('Galerie : type probleme attendu.');
			// Board pur PARTAGÉ avec le runner live (renderProblemeBoardHTML) → fidélité.
			host.innerHTML = `<div class="sprint sprint-lecon">
    <div class="sprint-stage prob-stage">
      <div class="prob-col">
        <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(labelLecon(lesson, lesson.levels[0]))}</span></div>
        ${renderProblemeBoardHTML(ex)}
      </div>
    </div>
  </div>`;
		},
	},
	{
		gallery: 'runner-tableau',
		titre: 'Runner — tableau de conversion (mesures)',
		render(host) {
			const { lesson, ex } = genExemple('mes-longueurs', 'tableau');
			if (ex.type !== 'tableauConversion') throw new Error('Galerie : type tableau attendu.');
			// Markup pur PARTAGÉ avec le runner live (renderTableauBoardHTML) SANS
			// wireInteraction : pas de listener `document`, aucun effet de bord.
			const cells = buildCells(ex);
			host.innerHTML = `<div class="sprint sprint-lecon tc-runner">
    <div class="sprint-stage">
      <div class="sprint-theme"><span class="sprint-lesson">${escapeHTML(labelLecon(lesson, lesson.levels[0]))}</span></div>
      ${renderTableauBoardHTML(ex, cells)}
    </div>
  </div>`;
		},
	},
];

/* Construit la galerie et l'injecte dans `container`. `printMode: true` : rendu
   PAPIER des fiches (QCM en cases à cocher, ligne d'écriture garantie) — sinon un
   item QCM sans `@` ressortirait sans champ ni choix (cf. en-tête). Un SEUL
   contexte partagé par toutes les fiches ⇒ identifiants uniques dans toute la
   page (groupes de boutons radio, `for`/`id`), comme un document imprimé (#352). */
export function renderGalerie(container: HTMLElement): void {
	const lessons = getAllLessons();
	const ctx = createRenderContext({ printMode: true });

	withSeed(SEED, () => {
		// 1. Fiches par catégorie (périmètre #412).
		const fichesHTML = CATEGORIES.map((cat) => {
			const catLessons = lessons.filter((l) => l.category === cat.id);
			// Catégories sans leçon LessonDef (orthographe dynamique, catégories à venir) :
			// rien à rendre ici (leurs runners/listes sortent du périmètre fiche v1).
			if (!catLessons.length) return '';
			const subject = SUBJECTS.find((s) => s.id === cat.subject);
			const fiches = catLessons
				.map((l) => {
					const fiche = buildLessonFiche(l.id, l.levels[0], ctx);
					return `<article class="gal-lesson" data-gallery-lesson="${escapeHTML(l.id)}">
    <p class="gal-lesson-meta"><code>${escapeHTML(l.id)}</code> · ${escapeHTML(l.levels.join('/'))}</p>
    <div class="page">${fiche}</div>
  </article>`;
				})
				.join('');
			return `<section class="gal-section" data-gallery="${escapeHTML(cat.id)}">
    <h2 class="gal-section-title">${escapeHTML(subject?.label ?? cat.subject)} — ${escapeHTML(cat.label)}</h2>
    ${fiches}
  </section>`;
		}).join('');

		// 2. Sections des écrans de runner (#419) : hôtes VIDES d'abord — on génère et on
		//    câble les widgets JUSTE APRÈS l'insertion (le DOM doit exister pour le bind et
		//    la mesure de layout SVG de l'appariement).
		const runnersHTML = RUNNER_EXEMPLES.map((r) =>
			runnerSection(r.gallery, r.titre, `<div data-runner-host></div>`),
		).join('');

		container.innerHTML = `<div class="galerie">
    <h1 class="gal-h1">Galerie visuelle — rendu du catalogue (dev)</h1>
    <p class="gal-intro">Une fiche par leçon, puis un écran de runner par type. Surface des snapshots visuels (#412, #419).</p>
    ${fichesHTML}
    ${runnersHTML}
  </div>`;

		// 3. Génération + rendu des boards de runner (toujours DANS le withSeed).
		for (const r of RUNNER_EXEMPLES) {
			const host = container.querySelector<HTMLElement>(
				`[data-gallery="${r.gallery}"] [data-runner-host]`,
			);
			if (host) r.render(host);
		}
	});
}
