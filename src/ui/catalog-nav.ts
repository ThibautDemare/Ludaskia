/* ============================================================
   Navigation multi-matières : Matière → Catégorie → Leçons.
   Trois écrans, routés par hash depuis navigation.ts :
     #matieres            → liste des matières
     #matiere-<id>        → catégories d'une matière
     #categorie-<id>      → leçons d'une catégorie + accès bilan/sprint
   ============================================================ */
import {
	SUBJECTS,
	CATEGORIES,
	ORTHO_CATEGORY_ID,
	getLessonsBySubject,
	getLessonsByCategory,
} from '../core/catalog';
import type { BilanConfig, LessonDef } from '../core/catalog';
import { niveauActifMatiere } from '../core/niveau-actif';
import { LEVEL_ORDER, LEVEL_LABEL, labelLecon } from '../core/levels';
import { LESSONS_CALCUL_MENTAL } from '../core/lessons';
import { loadStars, loadLessonStats, etoileAuxNiveaux } from '../core/progress';
import { loadOrtho } from '../core/orthographe/store';
import { listOrthoLecons, motsApercu, type LeconOrthoRef } from '../core/orthographe/lessons';
import { escapeHTML } from '../core/utils';
import { lessonCardHTML } from './render';
import { startCategorySprint } from './sprint';
import { startBilan, categoryBilanCtx, renderFavoris } from './bilan';
import { renderReprises } from './resume';
import { printScope } from './session';
import { icon, type IconName } from './icon';
import { subjectIcon, subjectTint, catTint } from './cat-visuals';
import { buildExpressConfig } from '../core/bilan-express';
import {
	startLecon,
	goCategories,
	goCategorie,
	goCategorieBilan,
	startOrthoLecon,
	goOrthoNew,
	goOrthoEdit,
} from './navigation';
import { html, VIDE, joindre } from '../core/html';

/* Dernier tirage d'express par catégorie (rotation : on évite de
   refaire tomber le même échantillon de leçons d'un express à l'autre). */
const lastExpressByCat: Record<string, string[]> = {};

/* Visuels (icône + teinte) des matières/catégories : voir ui/cat-visuals.ts
   (source partagée avec le configurateur de bilan). */

/* ---------- Écran : liste des matières ---------- */
export function renderSubjects(el: HTMLElement): void {
	el.innerHTML = html`<div class="nav-cards">
    ${joindre(
			SUBJECTS.map((s) => {
				const n = getLessonsBySubject(s.id, niveauActifMatiere(s.id)).length;
				return html`<button class="nav-card" data-subject="${s.id}">
        <span class="cat-ico" style="background:${subjectTint(s.id)}">${icon(subjectIcon(s.id))}</span>
        <div class="nav-card-title">${s.label}</div>
        <div class="nav-card-sub">${n} leçon${n > 1 ? 's' : ''}</div>
      </button>`;
			}),
		)}
  </div>`.balisage;
	el.querySelectorAll<HTMLButtonElement>('[data-subject]').forEach((btn) => {
		btn.addEventListener('click', () => goCategories(btn.dataset.subject!));
	});
}

/* ---------- Écran : catégories d'une matière ---------- */
export function renderCategories(el: HTMLElement, subjectId: string, titleEl: HTMLElement): void {
	const subject = SUBJECTS.find((s) => s.id === subjectId);
	if (titleEl && subject) titleEl.textContent = subject.label;
	const cats = CATEGORIES.filter((c) => c.subject === subjectId);
	const niveau = niveauActifMatiere(subjectId);
	el.innerHTML = html`<div class="nav-cards">
    ${joindre(
			cats.map((c, i) => {
				const n =
					c.id === ORTHO_CATEGORY_ID
						? listOrthoLecons(loadOrtho(), niveau).length +
							getLessonsByCategory(c.id, niveau).length
						: getLessonsByCategory(c.id, niveau).length;
				// Pastille colorée + icône : carte de catégorie plus engageante (la
				// couleur cycle pour varier ; elle double l'icône, jamais l'info seule).
				const tint = catTint(i);
				const ico = c.icon
					? html`<span class="cat-ico" style="background:${tint}">${icon(c.icon)}</span>`
					: '';
				return html`<button class="nav-card" data-category="${c.id}">
          ${ico}
          <div class="nav-card-title">${c.label}</div>
          <div class="nav-card-sub">${n} leçon${n > 1 ? 's' : ''}</div>
        </button>`;
			}),
		)}
  </div>`.balisage;
	el.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((btn) => {
		btn.addEventListener('click', () => goCategorie(btn.dataset.category!));
	});
}

/* ---------- Écran : leçons d'une catégorie + accès bilan/sprint ---------- */
export function renderCategorie(el: HTMLElement, categoryId: string, titleEl: HTMLElement): void {
	const category = CATEGORIES.find((c) => c.id === categoryId);
	if (titleEl && category) titleEl.textContent = category.label;

	if (categoryId === ORTHO_CATEGORY_ID) {
		renderOrthoCategorie(el);
		return;
	}

	const niveau = niveauActifMatiere(category?.subject ?? '');
	const lessonDefs = getLessonsByCategory(categoryId, niveau);

	// Catégorie encore sans leçon (nouvelles catégories maths en attente de
	// contenu, #92) : on évite d'afficher des bilans/sprints qui ne tireraient
	// rien. Un message rassurant tient lieu d'écran.
	if (!lessonDefs.length) {
		el.innerHTML = html`<div class="cat-empty">
      <div class="cat-empty-ico" aria-hidden="true">🌱</div>
      <p class="cat-empty-title">Bientôt disponible&nbsp;!</p>
      <p class="cat-empty-sub">Les leçons de cette catégorie arrivent prochainement.</p>
    </div>`.balisage;
		return;
	}

	const lessonIds = lessonDefs.map((l) => l.id);
	const stars = loadStars();
	const lstats = loadLessonStats();

	// On réutilise les cartes riches (numéro, titre, étoile, %) à partir des
	// entrées LESSONS correspondantes ; fallback minimal si absente.
	// Chaque leçon : carte riche + un 🖨 pour imprimer sa fiche (sans la lancer).
	const ai = LEVEL_ORDER.indexOf(niveau);
	const cardRow = (def: LessonDef, i: number) => {
		const rich = LESSONS_CALCUL_MENTAL.find((l) => l.id === def.id);
		const entry = rich ?? { id: def.id, num: i + 1, title: labelLecon(def, niveau) };
		// Badge « déjà maîtrisée en <classe inférieure> » : même leçon étoilée à un
		// niveau plus bas que le niveau actif de la matière (#225). On nomme la classe
		// inférieure maîtrisée la plus haute.
		const bas = etoileAuxNiveaux(def.id)
			.filter((lv) => LEVEL_ORDER.indexOf(lv) < ai)
			.sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
		const badge = bas.length ? LEVEL_LABEL[bas[bas.length - 1]] : undefined;
		return html`<div class="lesson-row">${lessonCardHTML(entry, stars, lstats, def.repere, badge)}<button class="lz-print" data-print="${def.id}" title="Imprimer la fiche" aria-label="Imprimer la fiche : ${labelLecon(def, niveau)}">${icon('printer')}</button></div>`;
	};

	// Regroupement par rubrique (#109), dans l'ordre d'apparition. Une leçon sans
	// rubrique forme un groupe « sans titre » (rendu à plat, rétro-compatible).
	const groupes: { rubrique: string; defs: LessonDef[] }[] = [];
	lessonDefs.forEach((def) => {
		const r = def.rubrique ?? '';
		let g = groupes.find((x) => x.rubrique === r);
		if (!g) {
			g = { rubrique: r, defs: [] };
			groupes.push(g);
		}
		g.defs.push(def);
	});
	const aRubriques = groupes.some((g) => g.rubrique !== '');
	const listHTML = joindre(
		groupes.map((g) => {
			const head =
				g.rubrique && aRubriques ? html`<h3 class="cat-rubrique">${g.rubrique}</h3>` : VIDE;
			const rows = joindre(g.defs.map((def) => cardRow(def, lessonDefs.indexOf(def))));
			return html`${head}<div class="lesson-list">${rows}</div>`;
		}),
	);

	el.innerHTML = html`
    <div id="catReprises" class="reprises reprises-cat"></div>
    <div class="cat-actions">
      <button class="cat-action" data-act="express"><span class="cat-action-line">${icon('timer')} Bilan express</span><small>rapide · ~20 questions</small></button>
      <button class="cat-action" data-act="complet"><span class="cat-action-line">${icon('exam')} Bilan complet</span><small>toutes les questions</small></button>
      <button class="cat-action" data-act="sprint"><span class="cat-action-line">${icon('run')} Sprint 5 min</span><small>cette catégorie</small></button>
      <button class="cat-action cat-action-secondary" data-act="custom"><span class="cat-action-line">${icon('faders')} Je choisis mes leçons</span><small>coche les leçons que tu veux</small></button>
      <button class="cat-action cat-action-secondary" data-act="print"><span class="cat-action-line">${icon('printer')} Imprimer les fiches</span><small>toute la catégorie</small></button>
    </div>
    <div id="catLessons">${listHTML}</div>
    <div id="catFavoris" class="favoris favoris-cat"></div>`.balisage;

	// Délégation : 🖨 d'une leçon (impression, chemin B) ou clic sur la carte (lancer).
	el.querySelector('#catLessons')!.addEventListener('click', (e: Event) => {
		const target = e.target as HTMLElement;
		const printBtn = target.closest('.lz-print') as HTMLElement | null;
		if (printBtn && printBtn.dataset.print) {
			const def = lessonDefs.find((l) => l.id === printBtn.dataset.print);
			// Titre résolu au niveau actif (#436), comme l'aria-label du même bouton : le
			// couvre-fiche ne le consomme pas pour une leçon seule aujourd'hui, mais un titre
			// brut serait faux le jour où il le fera.
			printScope({
				title: def ? labelLecon(def, niveau) : '',
				lessonIds: [printBtn.dataset.print],
				kind: 'fiches',
			});
			return;
		}
		const btn = target.closest('.lesson-item') as HTMLElement | null;
		if (btn && btn.dataset.id) startLecon(btn.dataset.id);
	});

	// Bilans et sprint de la catégorie
	el.querySelector('[data-act="express"]')!.addEventListener('click', () => {
		// Express borné + échantillonné (cf. #35), avec rotation par catégorie.
		const config = buildExpressConfig(
			`Bilan express — ${category?.label ?? ''}`,
			lessonIds,
			lastExpressByCat[categoryId],
		);
		lastExpressByCat[categoryId] = config.lessonIds;
		startBilan(config, categoryBilanCtx('express', categoryId, config));
	});
	el.querySelector('[data-act="complet"]')!.addEventListener('click', () => {
		const config: BilanConfig = {
			id: '',
			label: `Bilan complet — ${category?.label ?? ''}`,
			lessonIds,
			questionsPerLesson: 'all',
		};
		startBilan(config, categoryBilanCtx('complet', categoryId, config));
	});
	el.querySelector('[data-act="sprint"]')!.addEventListener('click', () => {
		startCategorySprint(categoryId);
	});
	el.querySelector('[data-act="print"]')!.addEventListener('click', () => {
		printScope({ title: `Fiches — ${category?.label ?? ''}`, lessonIds, kind: 'fiches' });
	});
	el.querySelector('[data-act="custom"]')!.addEventListener('click', () => {
		goCategorieBilan(categoryId);
	});

	// Section « À continuer » filtrée sur cette catégorie (#63).
	renderReprises(el.querySelector<HTMLElement>('#catReprises'), categoryId);

	// Bilans favoris rattachés à cette catégorie (#65), en complément de l'accueil.
	renderFavoris(el.querySelector<HTMLElement>('#catFavoris'), categoryId);
}

/* ---------- Écran : catégorie Orthographe ----------
   Leçons prédéfinies (invariables/irréguliers) + listes du profil, plus une
   carte « + Ajouter une liste ». Pas de bilan/sprint (modes propres au runner). */
function renderOrthoCategorie(el: HTMLElement): void {
	// Niveau actif de la matière français : filtre CUMULATIF des dictées prédéfinies
	// (#243) — un profil CM1 voit les listes CE2 ET CM1, un CE2 reste aux listes CE2.
	const niveau = niveauActifMatiere('francais');
	const lecons = listOrthoLecons(loadOrtho(), niveau);
	// Leçons « moteur » de la catégorie Orthographe (accords #109, homophones #110) :
	// exercices LessonDef (transformation / QCM), distincts des dictées de mots.
	// Regroupées par rubrique, lancées par le parcours standard (saisie/QCM).
	const moteurLecons = getLessonsByCategory(ORTHO_CATEGORY_ID, niveau);
	const stars = loadStars();
	const predef = lecons.filter((l) => l.source === 'predefini');
	// Listes du parent triées par date de contrôle décroissante (sans date en dernier).
	const listes = lecons
		.filter((l) => l.source === 'liste')
		.sort(
			(a, b) =>
				(b.dateControle ?? '').localeCompare(a.dateControle ?? '') ||
				(b.createdAt ?? 0) - (a.createdAt ?? 0),
		);

	const sub = (l: LeconOrthoRef) => {
		const mots = `${l.nbMots} mot${l.nbMots > 1 ? 's' : ''}`;
		if (l.source === 'liste' && l.dateControle) {
			const [, m, d] = l.dateControle.split('-');
			return html`${mots} · ${icon('calendar')} ${d}/${m}`;
		}
		return html`${mots}`;
	};
	const apercu = (l: LeconOrthoRef) => {
		if (!l.mots.length) return '';
		// Ordre d'affichage partagé avec l'espace encadrant (#441) : alphabétique pour une
		// liste du parent, ordre d'origine pour une leçon prédéfinie.
		const mots = motsApercu(l.mots, l.source);
		return html`<div class="ortho-apercu" aria-hidden="true">${mots.map(escapeHTML).join(' · ')}</div>`;
	};
	const baseCard = (
		l: LeconOrthoRef,
		tint: string,
	) => html`<button class="nav-card" data-ortho="${l.id}">
      <span class="cat-ico" style="background:${tint}">${icon('book-open')}</span>
      <div class="nav-card-title">${l.label}</div>
      <div class="nav-card-sub">${sub(l)}</div>
      ${apercu(l)}
    </button>`;
	const listCard = (l: LeconOrthoRef, tint: string) => html`<div class="nav-card-group">
      <button class="nav-card" data-ortho="${l.id}">
        <span class="cat-ico" style="background:${tint}">${icon('cards')}</span>
        <div class="nav-card-title">${l.label}</div>
        <div class="nav-card-sub">${sub(l)}</div>
        ${apercu(l)}
      </button>
      <button class="nav-card-edit" data-ortho-edit="${l.id}" aria-label="Modifier la liste" title="Modifier">${icon('pencil')}</button>
    </div>`;

	// Icône + sous-titre par rubrique « moteur » : annonce le geste attendu (ne pas
	// laisser croire à une dictée). Repli générique pour une rubrique inconnue.
	const RUBRIQUE_META: Record<string, { ico: IconName; hint: string; tint: string }> = {
		'Les accords': { ico: 'pencil', hint: 'je transforme les mots', tint: 'var(--accent)' },
		'Les homophones': {
			ico: 'text',
			hint: 'je choisis la bonne écriture',
			tint: 'var(--cat-sprint)',
		},
		'Les règles': { ico: 'ruler', hint: 'je choisis la bonne lettre', tint: 'var(--cat-bilan)' },
	};
	const moteurCard = (l: LessonDef) => {
		const etoilee = (stars[l.id] ?? 0) > 0;
		const meta = RUBRIQUE_META[l.rubrique ?? ''];
		const hint = meta?.hint ?? "je m'entraîne";
		const ico = meta?.ico ?? 'book-open';
		const tint = meta?.tint ?? 'var(--accent)';
		const repere =
			l.repere === 'plus-difficile'
				? html` <span class="lz-level" title="Leçon plus difficile">plus dur</span>`
				: VIDE;
		return html`<button class="nav-card" data-lecon="${l.id}">
      <span class="cat-ico" style="background:${tint}">${icon(ico)}</span>
      <div class="nav-card-title">${labelLecon(l, niveau)}${etoilee ? ' ⭐' : ''}${repere}</div>
      <div class="nav-card-sub">${hint}</div>
    </button>`;
	};

	// Regroupement des leçons moteur par rubrique, dans l'ordre d'apparition.
	const rubriques: { nom: string; lecons: LessonDef[] }[] = [];
	moteurLecons.forEach((l) => {
		const nom = l.rubrique ?? 'Exercices';
		let g = rubriques.find((r) => r.nom === nom);
		if (!g) {
			g = { nom, lecons: [] };
			rubriques.push(g);
		}
		g.lecons.push(l);
	});
	const moteurSections = joindre(
		rubriques.map(
			(r) => html`<section class="ortho-rubrique">
        <h3 class="cat-rubrique">${r.nom}</h3>
        <div class="nav-cards ortho-cards">${joindre(r.lecons.map(moteurCard))}</div>
      </section>`,
		),
	);

	el.innerHTML = html`${moteurSections}
    <section class="ortho-rubrique">
      <h3 class="cat-rubrique">Les dictées de mots</h3>
      <div class="ortho-cols">
        <section class="ortho-col">
          <h4 class="ortho-col-title">${icon('book-open')} Mots de base</h4>
          <div class="nav-cards ortho-cards">${joindre(predef.map((l) => baseCard(l, 'var(--cat-bleu)')))}</div>
        </section>
        <section class="ortho-col">
          <h4 class="ortho-col-title">${icon('cards')} Mes listes</h4>
          <div class="nav-cards ortho-cards">
            <button class="nav-card nav-card-add" data-ortho-new="1">
              <span class="cat-ico" style="background:var(--accent)">${icon('plus')}</span>
              <div class="nav-card-title">Ajouter une liste</div>
              <div class="nav-card-sub">les mots de la semaine</div>
            </button>
            ${joindre(listes.map((l) => listCard(l, 'var(--accent)')))}
          </div>
        </section>
      </div>
    </section>`.balisage;
	el.querySelectorAll<HTMLButtonElement>('[data-lecon]').forEach((btn) => {
		btn.addEventListener('click', () => startLecon(btn.dataset.lecon!));
	});
	el.querySelectorAll<HTMLButtonElement>('[data-ortho]').forEach((btn) => {
		btn.addEventListener('click', () => startOrthoLecon(btn.dataset.ortho!));
	});
	el.querySelectorAll<HTMLButtonElement>('[data-ortho-edit]').forEach((btn) => {
		btn.addEventListener('click', () => goOrthoEdit(btn.dataset.orthoEdit!));
	});
	el.querySelector<HTMLButtonElement>('[data-ortho-new]')!.addEventListener('click', () =>
		goOrthoNew(),
	);
}
