/* ============================================================
   Bilan personnalisé : configurateur, favoris, exécution.
   Suit le même pattern que sprint.ts (dépendance circulaire
   volontaire avec navigation.ts — valide en ES modules).
   ============================================================ */
import {
	getAllLessons,
	getLessonsByCategory,
	bilanMode,
	commonCategoryId,
	estEligibleSprintHorsNiveau,
	sprintJouable,
	CATEGORIES,
	SUBJECTS,
} from '../core/catalog';
import type { BilanConfig, LessonDef, Category } from '../core/catalog';
import { labelLecon } from '../core/levels';
import { elisionDe } from '../core/utils';
import { classeChoisie, classeDeCategorie, leverClasseChoisie } from '../core/niveau-actif';
import { subjectIcon, subjectTint, catTint } from './cat-visuals';
import { loadBilans, saveBilan } from '../core/bilans';
import { startCustomSprint } from './sprint';
import { printScope } from './session';
import { bilanCategoryKey, bilanCustomKey, bilanFavoriKey } from '../core/resume';
import { clearResumeCtx, maybeRelaunch, type ResumeCtx } from './resume';
import { lancerParcours } from './bilan-parcours';
import { icon } from './icon';
import { html, type SafeHtml, VIDE, joindre, drapeau } from '../core/html';

/* ---------- Exécution d'un BilanConfig ---------- */

/* Joue un bilan à l'écran : en PARCOURS guidé (#777), une question par écran, quel que soit
   le point d'entrée (configurateur, favori, bilan express ou complet de catégorie, programme
   du jour). La page unique ne sert plus qu'à l'impression (`printScope`). Le parcours pose
   lui-même le mode d'enregistrement (« complet » / « express », #35) et l'id du favori
   (#636 : seul un favori ENREGISTRÉ en porte un, ce qui coche l'étape du programme).
   Contexte de reprise (#63) : celui du bilan, ou `null` quand il ne se reprend pas (classe
   choisie, #772, cf. startBilan). Le contexte de GRILLE est levé : le parcours a sa propre
   reprise (nature `runner`), et une photo de son DOM n'aurait rien à rejouer. */
export function runBilanConfig(config: BilanConfig, ctx?: ResumeCtx | null): void {
	if (!config.lessonIds.length) return;
	clearResumeCtx();
	lancerParcours(config, ctx ?? null);
}

/* Lance un bilan en gérant la reprise : si le même bilan était commencé, on
   propose « Continuer / Recommencer » ; sinon on le lance neuf (#63). Dans une classe
   choisie sur l'écran de la catégorie (#772), ni offre ni instantané : celui en attente est
   celui de la classe du profil, et celui de ce bilan, rangé sous la catégorie, serait repris
   plus tard dans la classe du profil (même règle que le niveau imposé de #573). */
export function startBilan(config: BilanConfig, ctx: ResumeCtx): void {
	if (classeChoisie()) {
		runBilanConfig(config, null);
		return;
	}
	maybeRelaunch(ctx.key, ctx.label, () => runBilanConfig(config, ctx));
}

/** Lance un favori selon SON mode (#64) : « sprint » part au chrono, « bilan » ouvre
    l'écran de bilan. Point d'entrée UNIQUE depuis #636 — l'accueil, une catégorie et le
    programme du jour lancent un favori de la même façon, donc tous journalisent son id et
    tous créditent l'étape qui le vise (critère 10 : « quel que soit le point d'entrée »). */
export function lancerFavori(config: BilanConfig): void {
	// Un favori se joue dans la classe du profil, même lancé depuis une catégorie passée dans
	// une autre classe (#772) : c'est une sélection enregistrée, pas le contenu de la page.
	leverClasseChoisie();
	if (bilanMode(config) === 'sprint') startCustomSprint(config, config.id);
	else startBilan(config, favoriBilanCtx(config));
}

/* Fabriques de contexte de reprise selon le type de bilan. */
export function categoryBilanCtx(
	mode: 'express' | 'complet',
	categoryId: string,
	config: BilanConfig,
): ResumeCtx {
	return {
		key: bilanCategoryKey(mode, categoryId),
		mode,
		label: config.label,
		icon: mode === 'complet' ? 'exam' : 'timer',
		categoryId,
		relaunch: { type: 'bilan', config },
	};
}
function customBilanCtx(config: BilanConfig, categoryId: string | null): ResumeCtx {
	return {
		key: bilanCustomKey(categoryId),
		mode: 'custom',
		label: config.label,
		icon: 'faders',
		categoryId,
		relaunch: { type: 'bilan', config },
	};
}
function favoriBilanCtx(config: BilanConfig): ResumeCtx {
	return {
		// Clé partagée avec l'éditeur de l'espace encadrant (#778), qui l'efface quand le
		// contenu du favori change : une seule source, sinon les deux divergeraient.
		key: bilanFavoriKey(config.id),
		mode: 'custom',
		label: config.label,
		icon: 'bookmark',
		// Un favori rattaché à une catégorie (#65) voit aussi sa reprise filtrée
		// dans cette catégorie ; un favori multi-catégories reste « hors scope ».
		categoryId: config.categoryId ?? null,
		relaunch: { type: 'bilan', config },
	};
}

/* ---------- Lecture du formulaire ---------- */

function readFormConfig(form: HTMLElement): BilanConfig | null {
	const lessonIds = [...form.querySelectorAll<HTMLInputElement>('.bc-lesson-check:checked')].map(
		(el) => el.value,
	);
	if (!lessonIds.length) return null;
	const modeEl = form.querySelector<HTMLInputElement>('.bc-mode-radio:checked');
	const mode = modeEl?.value === 'sprint' ? 'sprint' : 'bilan';
	const nbqEl = form.querySelector<HTMLInputElement>('.bc-nbq-radio:checked');
	const nbqRaw = nbqEl ? nbqEl.value : '3';
	// En sprint, le nombre de questions par leçon n'a pas de sens (le sprint est
	// borné par le temps) : on garde une valeur neutre, ignorée au lancement.
	const questionsPerLesson = nbqRaw === 'all' ? ('all' as const) : Number(nbqRaw);
	// Rattachement à une catégorie (#65) : déduit des leçons cochées (et non du
	// contexte d'ouverture) pour couvrir aussi une sélection mono-catégorie
	// composée depuis l'accueil. `undefined` (multi-catégories) → accueil seul.
	const categoryId = commonCategoryId(lessonIds);
	return { id: '', label: 'Bilan personnalisé', lessonIds, questionsPerLesson, mode, categoryId };
}

/* ---------- Refus du composeur (#778) ---------- */

/* Zone `#bcErr` (role="alert"). Réécrire le MÊME message ne change pas le texte, et un
   lecteur d'écran ne dirait rien : l'enfant qui réessaie sans comprendre n'entendrait le
   refus qu'une fois. On vide donc, puis on réécrit au frame suivant. */
interface ZoneErreur {
	montrer(message: string): void;
	effacer(): void;
}
function zoneErreur(el: HTMLElement): ZoneErreur {
	let attente = 0;
	return {
		montrer(message) {
			cancelAnimationFrame(attente);
			el.textContent = '';
			attente = requestAnimationFrame(() => {
				el.textContent = message;
			});
		},
		effacer() {
			cancelAnimationFrame(attente);
			el.textContent = '';
		},
	};
}

/* Nom du bilan (« Garder » et « Enregistrer »), ou `null` s'il est vide. Le champ est alors
   signalé : focus, `aria-invalid`, et le message relié par `aria-describedby` (le champ n'a
   pas d'autre description). Le signalement tombe dès que l'action est rejouée avec un nom,
   même si elle échoue ensuite pour une autre raison : c'est le nom qu'il qualifie. */
function lireNom(el: HTMLElement, erreur: ZoneErreur): string | null {
	const champ = el.querySelector<HTMLInputElement>('#bcLabel')!;
	const nom = champ.value.trim();
	if (nom) {
		champ.removeAttribute('aria-invalid');
		champ.removeAttribute('aria-describedby');
		return nom;
	}
	champ.setAttribute('aria-invalid', 'true');
	champ.setAttribute('aria-describedby', 'bcErr');
	erreur.montrer('Entre un nom pour enregistrer le bilan.');
	champ.focus();
	return null;
}

/* Lit la sélection et la VALIDE : au moins une leçon, et en mode Sprint au moins une leçon
   qui se joue en sprint. Partagé par Lancer, Garder et Enregistrer : aucun des trois ne
   laisse passer ce qu'un autre refuse. */
function lireSelection(form: HTMLElement, erreur: ZoneErreur): BilanConfig | null {
	const config = readFormConfig(form);
	if (!config) {
		erreur.montrer('Coche au moins une leçon.');
		return null;
	}
	if (bilanMode(config) === 'sprint' && !sprintJouable(config.lessonIds)) {
		erreur.montrer(
			'Aucune des leçons choisies ne se joue en sprint. Ajoute une leçon sans la mention « pas en sprint », ou choisis le mode Tranquille.',
		);
		return null;
	}
	erreur.effacer();
	return config;
}

function genId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2);
	}
}

/* ---------- Écran de configuration ---------- */

/* Liste de cases à cocher (toute la tuile est cliquable) pour un ensemble de leçons.
   Le composeur liste TOUTES les leçons (tous niveaux confondus, volontairement) ; le
   libellé, lui, est celui de la classe dans laquelle la leçon sera imprimée/jouée (#436) :
   celle de sa catégorie, donc la classe choisie sur l'écran de la catégorie s'il y en a
   une (#772), sinon la classe suivie par la matière.
   Une leçon qui ne se joue pas en sprint porte le repère TEXTUEL « pas en sprint » (#778),
   affiché par la feuille de style en mode Sprint seulement : la couleur seule ne dirait rien
   à qui ne la distingue pas, et l'enfant comprendrait mal pourquoi son sprint l'ignore.
   `<small>` et non `<span>` : le `<span>` de la carte est son libellé, et le seul. */
function lessonChecks(lessons: LessonDef[]): SafeHtml {
	return joindre(
		lessons.map(
			(l) =>
				html`<label class="bc-item">
          <input type="checkbox" class="bc-lesson-check" value="${l.id}" checked>
          <span>${labelLecon(l, classeDeCategorie(l.category))}</span>
          ${estEligibleSprintHorsNiveau(l) ? VIDE : html`<small class="bc-hors-sprint">pas en sprint</small>`}
        </label>`,
		),
	);
}

/* Case parent d'un groupe (matière/catégorie/rubrique) : coche/décoche tout son
   périmètre, et reflète un état partiel (indéterminé) — câblé dans le JS. */
function groupCheck(label: string): SafeHtml {
	return html`<input type="checkbox" class="bc-group-check" aria-label="Tout choisir : ${label}">`;
}

/* Regroupe des leçons par rubrique (#109), dans leur ordre d'apparition. Une
   leçon sans rubrique rejoint un groupe « sans titre » (clé vide). */
function groupByRubrique(lessons: LessonDef[]): { rubrique: string; lessons: LessonDef[] }[] {
	const groups: { rubrique: string; lessons: LessonDef[] }[] = [];
	lessons.forEach((l) => {
		const r = l.rubrique ?? '';
		let g = groups.find((x) => x.rubrique === r);
		if (!g) {
			g = { rubrique: r, lessons: [] };
			groups.push(g);
		}
		g.lessons.push(l);
	});
	return groups;
}

/* Corps d'une catégorie : leçons regroupées par rubrique si la catégorie en a
   (même présentation que l'écran de catégorie, #109), sinon grille à plat. Les
   leçons sans rubrique d'une catégorie mixte restent à plat (sans en-tête). */
function categoryBody(lessons: LessonDef[]): SafeHtml {
	const groups = groupByRubrique(lessons);
	const aRubriques = groups.some((g) => g.rubrique !== '');
	if (!aRubriques) return html`<div class="bc-lessons-grid">${lessonChecks(lessons)}</div>`;
	return joindre(
		groups.map((g) => {
			if (g.rubrique === '')
				return html`<div class="bc-lessons-grid">${lessonChecks(g.lessons)}</div>`;
			return html`<div class="bc-group bc-rubrique">
        <label class="bc-group-head bc-rubrique-head">
          ${groupCheck(g.rubrique)}
          <span class="bc-group-title bc-rubrique-title">${g.rubrique}</span>
          <span class="bc-group-count" aria-hidden="true"></span>
        </label>
        <div class="bc-lessons-grid">${lessonChecks(g.lessons)}</div>
      </div>`;
		}),
	);
}

/* Bloc d'une catégorie (configurateur global) : en-tête à pastille colorée +
   case parent + compteur, puis corps groupé par rubrique. La teinte (cyclée)
   et l'icône reprennent celles des cartes de navigation (cf. cat-visuals). */
function categoryBlock(cat: Category, lessons: LessonDef[], tint: string): SafeHtml {
	const ico = cat.icon
		? html`<span class="cat-ico bc-cat-ico" style="background:${tint}">${icon(cat.icon)}</span>`
		: VIDE;
	return html`<div class="bc-group bc-category" style="--bc-cat-tint:${tint}">
      <label class="bc-group-head bc-cat-head">
        ${groupCheck(cat.label)}
        ${ico}
        <span class="bc-group-title bc-cat-title">${cat.label}</span>
        <span class="bc-group-count" aria-hidden="true"></span>
      </label>
      <div class="bc-cat-body">${categoryBody(lessons)}</div>
    </div>`;
}

/* ---------- Mode édition d'un favori (#778) ---------- */

/** Ce que le composeur reçoit pour éditer un favori. Il ne sait rien du propriétaire au-delà
    de son prénom, ni de la reprise : il pré-remplit, refuse ce que la création refuse, et
    remet la config validée à `enregistrer`, qui décide où et comment l'écrire
    (cf. `ui/bilan-edition.ts`). */
export interface EditionComposeur {
	/** Version enregistrée du favori : pré-remplit le formulaire. */
	favori: BilanConfig;
	/** Prénom de l'enfant à qui appartient le favori (titre de la page). */
	proprietaire: string;
	/** Reçoit la config validée, id et nom du favori posés. Résout un message d'erreur à
	    afficher, ou `null` quand il n'y a rien à dire (enregistré, ou abandonné). */
	enregistrer: (config: BilanConfig) => Promise<string | null>;
	annuler: () => void;
}

/* Coche EXACTEMENT les leçons du favori et déplie les volets de matière qui en contiennent
   une : un volet replié cacherait une coche (critère 2). */
function cocherFavori(form: HTMLElement, favori: BilanConfig): void {
	const ids = new Set(favori.lessonIds);
	form
		.querySelectorAll<HTMLInputElement>('.bc-lesson-check')
		.forEach((cb) => (cb.checked = ids.has(cb.value)));
	form.querySelectorAll<HTMLDetailsElement>('details.bc-subject').forEach((d) => {
		if (d.querySelector('.bc-lesson-check:checked')) d.open = true;
	});
}

/* Boutons « Enregistrer » et « Annuler ». Mêmes refus qu'à la création (nom vide, aucune
   leçon, sprint sans leçon jouable), dans le même ordre ; l'écriture appartient à
   l'appelant. */
function brancherEdition(
	el: HTMLElement,
	form: HTMLElement,
	erreur: ZoneErreur,
	edition: EditionComposeur,
): void {
	el.querySelector('#bcUpdate')!.addEventListener('click', () => {
		const label = lireNom(el, erreur);
		if (!label) return;
		const config = lireSelection(form, erreur);
		if (!config) return;
		config.id = edition.favori.id;
		config.label = label;
		void edition.enregistrer(config).then((message) => {
			if (message) erreur.montrer(message);
		});
	});
	el.querySelector('#bcCancel')!.addEventListener('click', () => edition.annuler());
}

/* Leçons proposées par le composeur.
   - global (pas de catégorie) : leçons groupées par matière > catégorie ;
   - scopé à une catégorie : ses leçons, regroupées par rubrique (entrée « Je choisis mes
     leçons » depuis l'écran de catégorie). */
function leconsComposeurHTML(category: Category | null): SafeHtml {
	if (category) {
		// Écran scopé : une seule catégorie, déjà nommée par `.bc-scope`. On
		// regroupe simplement ses leçons par rubrique (#109) ; le « Tout choisir »
		// global du haut couvre le niveau catégorie. Ouvert depuis une catégorie passée dans
		// une autre classe (#772), il ne propose que les leçons de CETTE classe.
		const choix = classeChoisie();
		const lecons =
			choix?.categoryId === category.id
				? getLessonsByCategory(category.id, choix.niveau)
				: getLessonsByCategory(category.id);
		return html`<div class="bc-scoped-lessons">${categoryBody(lecons)}</div>`;
	}
	// Écran global : Matière (volet repliable) → Catégorie → Rubrique. Volets
	// repliés par défaut (109 leçons) — les compteurs « x/y » par matière disent
	// l'état sans déplier (cf. avis UX enfant).
	const lessons = getAllLessons();
	return joindre(
		SUBJECTS.map((subj) => {
			const catBlocks = CATEGORIES.filter((c) => c.subject === subj.id).map((cat, i) => {
				const catLessons = lessons.filter((l) => l.category === cat.id);
				return catLessons.length ? categoryBlock(cat, catLessons, catTint(i)) : VIDE;
			});
			if (!catBlocks.length) return VIDE;
			return html`<details class="bc-group bc-subject">
        <summary class="bc-group-head bc-subject-head">
          <span class="bc-check-wrap"><input type="checkbox" class="bc-group-check" aria-label="Tout choisir : ${subj.label}"></span>
          <span class="cat-ico bc-subject-ico" style="background:${subjectTint(subj.id)}">${icon(subjectIcon(subj.id))}</span>
          <span class="bc-group-title bc-subject-title">${subj.label}</span>
          <span class="bc-group-count" aria-hidden="true"></span>
          <span class="bc-chevron" aria-hidden="true">${icon('caret-down')}</span>
        </summary>
        <div class="bc-subject-body">${catBlocks}</div>
      </details>`;
		}),
	);
}

/* Ce qui distingue la création de l'édition dans le balisage du composeur ; tout le reste
   est commun. */
interface PartiesComposeur {
	marqueur: SafeHtml; // `data-edition` sur le formulaire (édition seulement)
	enTete: SafeHtml;
	actions: SafeHtml; // boutons posés avant « Imprimer »
	sauvegarde: SafeHtml; // volet « Garder pour plus tard » (création seulement)
	nbqDefaut: string;
	modeDefaut: 'bilan' | 'sprint';
}

function partiesCreation(category: Category | null): PartiesComposeur {
	const today = new Date();
	const defaultName = category
		? `${category.label} ${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`
		: '';
	return {
		marqueur: VIDE,
		enTete: category
			? html`<p class="bc-scope">Catégorie : <strong>${category.label}</strong></p>`
			: VIDE,
		actions: html`<button id="bcRun" class="bc-btn bc-btn-run">${icon('play')} C'est parti !</button>`,
		sauvegarde: html`<details class="bc-save">
        <summary>${icon('bookmark')} Garder pour plus tard</summary>
        <div class="bc-save-row">
          <input id="bcLabel" class="bc-label-input" type="text" placeholder="Nom du bilan" maxlength="60" value="${defaultName}">
          <button id="bcSave" class="bc-btn bc-btn-save">${icon('bookmark')} Garder</button>
        </div>
        <div class="bc-saved" id="bcSaved" role="status"></div>
      </details>`,
		// Défaut : « Moyen » sur un écran scopé (révision pour de vrai), « Un peu » sinon.
		nbqDefaut: category ? '5' : '3',
		modeDefaut: 'bilan',
	};
}

/* L'écran nomme le favori ET l'enfant à qui il appartient (#778, critère 4) : le profil
   actif, celui de la barre, n'est pas forcément le sien. Le nom se modifie en tête, à
   découvert, et non dans le volet replié « Garder pour plus tard ». Pas de lancement : il
   jouerait sur le profil ACTIF (critère 5). */
function partiesEdition(edition: EditionComposeur): PartiesComposeur {
	const { favori } = edition;
	// Le réglage du favori, s'il fait partie des quatre proposés : l'écran montre alors
	// exactement ce qui sera enregistré.
	const nbqFavori = String(favori.questionsPerLesson);
	return {
		marqueur: drapeau('data-edition'),
		enTete: html`<h2 class="bc-edit-title" tabindex="-1">Modifier « ${favori.label} », bilan favori ${elisionDe(edition.proprietaire)}</h2>
      <label class="bc-section-title bc-edit-name" for="bcLabel">Nom du bilan</label>
      <input id="bcLabel" class="bc-label-input" type="text" maxlength="60" value="${favori.label}">`,
		actions: html`<button id="bcUpdate" class="bc-btn bc-btn-run">${icon('check')} Enregistrer</button>
        <button id="bcCancel" class="bc-btn bc-btn-cancel">${icon('x')} Annuler</button>`,
		sauvegarde: VIDE,
		nbqDefaut: ['3', '5', '10', 'all'].includes(nbqFavori) ? nbqFavori : '3',
		modeDefaut: bilanMode(favori),
	};
}

function composeurHTML(lecons: SafeHtml, parties: PartiesComposeur): SafeHtml {
	// Carte verticale : icône (agrandie) au-dessus du libellé et du nombre, pour
	// un picto lisible et tapable au doigt (cf. avis UX enfant). Le bouton radio
	// est masqué visuellement (l'état coché est porté par la carte).
	const nbqItem = (value: string, ico: SafeHtml, intent: string, num: string) =>
		html`<label class="bc-nbq-item">
      <input type="radio" name="bcNbq" class="bc-nbq-radio" value="${value}"${value === parties.nbqDefaut ? drapeau('checked') : ''}>
      <span class="bc-nbq-ico">${ico}</span>
      <span class="bc-nbq-label">${intent}</span>
      <span class="bc-nbq-num">${num || '&nbsp;'}</span>
    </label>`;
	const modeItem = (value: string, ico: SafeHtml, title: string, sub: string) =>
		html`<label class="bc-mode-item">
      <input type="radio" name="bcMode" class="bc-mode-radio" value="${value}"${value === parties.modeDefaut ? drapeau('checked') : ''}>
      <span>${ico} ${title} <span class="bc-mode-sub">${sub}</span></span>
    </label>`;
	return html`
    <div class="bilan-config" id="bilanConfigForm"${parties.marqueur}>
      ${parties.enTete}
      <div class="bc-section-title">Que veux-tu faire ?</div>
      <div class="bc-mode">
        ${modeItem('bilan', icon('feather'), 'Tranquille', 'à ton rythme')}
        ${modeItem('sprint', icon('run'), 'Sprint', '5 min chrono')}
      </div>
      <div class="bc-section-title">Leçons à inclure</div>
      <div class="bc-top-actions">
        <button class="bc-action-btn" id="bcSelectAll">${icon('check')} Tout choisir</button>
        <button class="bc-action-btn" id="bcSelectNone">${icon('x')} Tout enlever</button>
      </div>
      ${lecons}

      <div id="bcNbqSection">
        <div class="bc-section-title">Questions par leçon</div>
        <div class="bc-nbq">
          ${nbqItem('3', icon('quantity-1'), 'Un peu', '3')}
          ${nbqItem('5', icon('quantity-2'), 'Moyen', '5')}
          ${nbqItem('10', icon('quantity-3'), 'Beaucoup', '10')}
          ${nbqItem('all', icon('quantity-all'), 'Tout', '')}
        </div>
      </div>

      <div class="bc-run-row">
        ${parties.actions}
        <button id="bcPrint" class="bc-btn bc-btn-print" title="Imprimer ce bilan à remplir au crayon">${icon('printer')} Imprimer</button>
        <span class="bc-count" id="bcCount"></span>
      </div>
      <label class="bc-corrige" id="bcCorrigeWrap">
        <input type="checkbox" id="bcCorrige">
        <span>${icon('printer')} Imprimer aussi le corrigé pour le parent (avec les réponses)</span>
      </label>

      ${parties.sauvegarde}
      <div class="bc-err" id="bcErr" role="alert"></div>
    </div>`;
}

/* Cases parentes, compteurs et « Tout choisir / Tout enlever ». Groupes (matière /
   catégorie / rubrique) : chaque groupe porte une case parent (`.bc-group-check`) et un
   compteur (`.bc-group-count`) dans son en-tête direct (`:scope > .bc-group-head`). On
   collecte une fois les références ; le périmètre d'un groupe = toutes les leçons qu'il
   contient (les groupes sont imbriqués matière ⊃ catégorie ⊃ rubrique). Les cases doivent
   être cochées AVANT l'appel : l'état initial des compteurs est calculé ici. */
function brancherSelection(el: HTMLElement, form: HTMLElement): void {
	const countEl = el.querySelector<HTMLElement>('#bcCount')!;
	const groups = [...form.querySelectorAll<HTMLElement>('.bc-group')].map((group) => {
		const head = group.querySelector<HTMLElement>(':scope > .bc-group-head')!;
		return {
			group,
			cb: head.querySelector<HTMLInputElement>('.bc-group-check')!,
			counter: head.querySelector<HTMLElement>('.bc-group-count')!,
		};
	});

	// Recalcule l'état de chaque case parent (cochée / partielle « indéterminée »)
	// et son compteur « x/y », plus le compteur global de leçons choisies. Le
	// texte « x/y » est le vrai porteur d'info (la couleur seule ne suffit pas
	// pour ce public, cf. avis UX enfant).
	const refresh = () => {
		for (const { group, cb, counter } of groups) {
			const boxes = group.querySelectorAll<HTMLInputElement>('.bc-lesson-check');
			const total = boxes.length;
			const checked = [...boxes].filter((b) => b.checked).length;
			cb.checked = total > 0 && checked === total;
			cb.indeterminate = checked > 0 && checked < total;
			counter.textContent = `${checked}/${total}`;
			counter.classList.toggle('is-full', total > 0 && checked === total);
		}
		const n = form.querySelectorAll<HTMLInputElement>('.bc-lesson-check:checked').length;
		countEl.textContent = n
			? `${n} leçon${n > 1 ? 's' : ''} choisie${n > 1 ? 's' : ''}`
			: 'Aucune leçon choisie';
	};

	// Case parent → coche/décoche toutes les leçons de son périmètre. Sur la barre
	// de matière, la case est un `<label>` distinct (`.bc-check-wrap`) : on stoppe
	// la propagation pour ne pas (dé)plier l'accordéon en cochant.
	groups.forEach(({ group, cb }) => {
		const wrap = cb.closest('.bc-check-wrap');
		if (wrap) wrap.addEventListener('click', (e) => e.stopPropagation());
		cb.addEventListener('change', () => {
			group
				.querySelectorAll<HTMLInputElement>('.bc-lesson-check')
				.forEach((b) => (b.checked = cb.checked));
			refresh();
		});
	});

	// Une leçon cochée/décochée met à jour tous les compteurs et états parents.
	form.addEventListener('change', (e) => {
		if ((e.target as HTMLElement).classList.contains('bc-lesson-check')) refresh();
	});

	refresh();

	const setAll = (checked: boolean) => {
		form
			.querySelectorAll<HTMLInputElement>('.bc-lesson-check')
			.forEach((cb) => (cb.checked = checked));
		refresh();
	};
	el.querySelector('#bcSelectAll')!.addEventListener('click', () => setAll(true));
	el.querySelector('#bcSelectNone')!.addEventListener('click', () => setAll(false));
}

/* Mode sprint (#64) : le sprint est borné par le temps, le réglage « questions par leçon »
   et l'impression d'un bilan papier n'ont pas de sens → masqués. */
function brancherMode(el: HTMLElement, form: HTMLElement): void {
	const nbqSection = el.querySelector<HTMLElement>('#bcNbqSection')!;
	const printBtn = el.querySelector<HTMLElement>('#bcPrint')!;
	const corrigeWrap = el.querySelector<HTMLElement>('#bcCorrigeWrap')!;
	const applyMode = () => {
		const sprint =
			form.querySelector<HTMLInputElement>('.bc-mode-radio:checked')?.value === 'sprint';
		nbqSection.hidden = sprint;
		printBtn.hidden = sprint;
		// Le corrigé n'a de sens qu'à l'impression (chemin papier), pas en sprint.
		corrigeWrap.hidden = sprint;
		// Montre les repères « pas en sprint » (#778) : cf. bilan.scss.
		form.dataset.mode = sprint ? 'sprint' : 'bilan';
	};
	applyMode();
	form
		.querySelectorAll<HTMLInputElement>('.bc-mode-radio')
		.forEach((r) => r.addEventListener('change', applyMode));
}

/* Chemin B (#40) : imprimer le bilan tel que configuré, sans le lancer.
   « Toutes » → fiches d'entraînement ; un nombre → bilan (grille de N questions). `titre`
   est lu au clic : en édition, c'est le nom saisi dans le champ. */
function brancherImpression(
	el: HTMLElement,
	form: HTMLElement,
	erreur: ZoneErreur,
	titre: () => string,
): void {
	el.querySelector('#bcPrint')!.addEventListener('click', () => {
		// Efface la confirmation « enregistré » de la création (absente en édition).
		el.querySelector<HTMLElement>('#bcSaved')?.replaceChildren();
		const config = readFormConfig(form);
		if (!config) {
			erreur.montrer('Coche au moins une leçon.');
			return;
		}
		erreur.effacer();
		const isAll = config.questionsPerLesson === 'all';
		// #41 : si la case est cochée, on ajoute un corrigé (mêmes items, réponses révélées).
		const corrige = el.querySelector<HTMLInputElement>('#bcCorrige')?.checked ?? false;
		printScope({
			title: titre(),
			lessonIds: config.lessonIds,
			kind: isAll ? 'fiches' : 'bilan',
			nbQ: isAll ? undefined : (config.questionsPerLesson as number),
			corrige,
		});
	});
}

/* Libellés d'un bilan ou d'un sprint lancé depuis la création : le nom de la catégorie
   quand l'écran lui est scopé. Aussi le titre de la fiche imprimée. */
function libellesLancement(category: Category | null): { bilan: string; sprint: string } {
	return category
		? { bilan: `Bilan — ${category.label}`, sprint: `Sprint — ${category.label}` }
		: { bilan: 'Bilan personnalisé', sprint: 'Sprint personnalisé' };
}

/* Boutons « C'est parti ! » et « Garder » de la création, pendant de `brancherEdition`.
   `categoryId` est celui reçu par l'écran : il range la reprise d'un bilan scopé. */
function brancherCreation(
	el: HTMLElement,
	form: HTMLElement,
	erreur: ZoneErreur,
	category: Category | null,
	categoryId: string | undefined,
): void {
	const libelles = libellesLancement(category);
	const savedEl = el.querySelector<HTMLElement>('#bcSaved')!;

	el.querySelector('#bcRun')!.addEventListener('click', () => {
		const config = lireSelection(form, erreur);
		if (!config) return;
		if (bilanMode(config) === 'sprint') {
			config.label = libelles.sprint;
			startCustomSprint(config);
		} else {
			config.label = libelles.bilan;
			startBilan(config, customBilanCtx(config, categoryId ?? null));
		}
	});

	// Enregistrer un favori SANS le lancer (#55) : on confirme sur place ; le
	// favori apparaît dans « Mes bilans favoris » sur l'accueil. Pour le lancer,
	// « C'est parti ! » reste disponible (en deux gestes : enregistrer puis lancer).
	el.querySelector('#bcSave')!.addEventListener('click', () => {
		savedEl.textContent = '';
		const label = lireNom(el, erreur);
		if (!label) return;
		const config = lireSelection(form, erreur);
		if (!config) return;
		config.label = label;
		config.id = genId();
		saveBilan(config);
		savedEl.textContent = `✓ « ${label} » enregistré — tu le retrouveras dans tes favoris.`;
	});
}

/** Options de l'écran de composition. */
export interface OptionsComposeur {
	/** Écran scopé à une catégorie (« Je choisis mes leçons » depuis la catégorie). */
	categoryId?: string;
	/** Édition d'un favori (#778) : écran global, pré-rempli. */
	edition?: EditionComposeur;
}

/* Écran de composition d'un bilan : global, ou scopé à une catégorie (cf.
   `leconsComposeurHTML`). Pensé tablette/mobile (cf. avis UX enfant) : grosses cibles
   tactiles, une action principale « C'est parti », sauvegarde repliée pour le parent.
   En ÉDITION (#778) : le même écran global, pré-rempli avec un favori, avec « Enregistrer /
   Annuler / Imprimer » à la place de « C'est parti » et « Garder ». La fonction rend, puis
   branche le commun et l'un des deux modes. */
export function renderBilanConfigScreen(el: HTMLElement, options: OptionsComposeur = {}): void {
	const { categoryId, edition } = options;
	const category = (categoryId ? CATEGORIES.find((c) => c.id === categoryId) : null) ?? null;
	const parties = edition ? partiesEdition(edition) : partiesCreation(category);
	el.innerHTML = composeurHTML(leconsComposeurHTML(category), parties).balisage;

	const form = el.querySelector<HTMLElement>('#bilanConfigForm')!;
	const erreur = zoneErreur(el.querySelector<HTMLElement>('#bcErr')!);
	if (edition) cocherFavori(form, edition.favori);
	brancherSelection(el, form);
	brancherMode(el, form);

	if (edition) {
		const champNom = el.querySelector<HTMLInputElement>('#bcLabel')!;
		// En édition, la fiche porte le nom du favori (celui du champ, s'il est rempli).
		brancherImpression(el, form, erreur, () => champNom.value.trim() || edition.favori.label);
		brancherEdition(el, form, erreur, edition);
	} else {
		brancherImpression(el, form, erreur, () => libellesLancement(category).bilan);
		brancherCreation(el, form, erreur, category, categoryId);
	}
}

/* ---------- Section favoris (accueil et catégorie) ---------- */

function favoriItemHTML(b: BilanConfig): SafeHtml {
	const nLessons = `${b.lessonIds.length} leçon${b.lessonIds.length > 1 ? 's' : ''}`;
	// Un favori sprint (#64) affiche son chrono ; un bilan, ses questions/leçon.
	const detail =
		bilanMode(b) === 'sprint'
			? html`${icon('run')} Sprint · 5 min · ${nLessons}`
			: html`${icon('feather')} ${nLessons} · ${
					b.questionsPerLesson === 'all'
						? 'toutes les questions'
						: `${b.questionsPerLesson} question${(b.questionsPerLesson as number) > 1 ? 's' : ''}/leçon`
				}`;
	return html`<div class="favori-item">
        <div class="favori-info">
          <div class="favori-name">${b.label}</div>
          <div class="favori-meta">${detail}</div>
        </div>
        <div class="favori-btns">
          <button class="favori-btn favori-btn-run" data-run="${b.id}">${icon('play')} Lancer</button>
        </div>
      </div>`;
}

/* Rend la liste des favoris dans `el` et câble Lancer/Supprimer.
   - sans `categoryId` : tous les favoris (accueil) ;
   - avec `categoryId` : seulement ceux rattachés à cette catégorie (#65).
   Liste vide → conteneur vidé (aucun titre), pour ne pas encombrer l'écran. */
export function renderFavoris(el: HTMLElement | null, categoryId?: string): void {
	if (!el) return;
	const bilans = loadBilans().filter((b) => !categoryId || b.categoryId === categoryId);
	if (!bilans.length) {
		el.innerHTML = '';
		return;
	}
	el.innerHTML = html`<h3 class="favoris-title">Mes bilans favoris</h3>
    <div class="favori-list">${joindre(bilans.map(favoriItemHTML))}</div>`.balisage;

	el.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const config = loadBilans().find((b) => b.id === btn.dataset.run);
			if (!config) return;
			lancerFavori(config);
		});
	});
	/* La SUPPRESSION n'est plus ici (#636) : elle est passée dans l'espace encadrant. Dès
	   qu'une étape de programme peut viser un favori, laisser la corbeille sous la main de
	   l'enfant, c'est lui laisser effacer d'un clic une consigne posée par l'adulte, sans que
	   personne ne le sache. La CRÉATION, elle, reste de son côté : il compose, nomme et
	   enregistre depuis son écran, et c'est l'adulte qui fait le ménage. Asymétrie assumée. */
}
