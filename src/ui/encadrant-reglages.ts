/* ============================================================
   Espace encadrant (#234, découpage #354) — RÉGLAGES.
   ------------------------------------------------------------
   Réglages posés par l'adulte sur le profil CONSULTÉ (écrits par UUID via setXxxFor,
   sans changer le profil/niveau actif) : classe de référence + niveau par matière,
   et aménagements « dys »/attention. Le bloc « Code d'accès » (verrou PIN) est rendu
   par `encadrant-pin` et injecté ici par l'orchestrateur (`pinBlock`), car il vit dans
   la même section « Réglages ».
   ============================================================ */

import { icon } from './icon';
import {
	setNiveauReferenceFor,
	setNiveauMatiereFor,
	setPrefFor,
	type Profile,
} from '../core/profiles';
import { getAllLessons, SUBJECTS, type SchoolLevel, type SubjectId } from '../core/catalog';
import { availableLevels, LEVEL_LABEL } from '../core/levels';
import { REVISION_PLAFOND, REVISION_PLAFOND_CHOIX } from '../core/revision';
import { niveauProfilMatiere } from '../core/encadrant-stats';
import {
	categoriesDeclarables,
	declarerVuAilleursFor,
	type CategorieDeclarable,
	type LeconNiveau,
} from '../core/vu-ailleurs';
import { dicteeDisponible, messageSansVoix } from './tts';
import { consulteUuid, renderEspace } from './encadrant-commun';
import { html, type SafeHtml, VIDE, joindre, drapeau } from '../core/html';

/* La section « Réglages » : classe + aménagements + déjà vu en classe + bloc PIN
   (rendu par le module pin et passé en `pinBlock` par l'orchestrateur). */
export function reglagesHTML(consulte: Profile, pinBlock: SafeHtml): SafeHtml {
	return html`<section class="enc-section">
      <h2 class="enc-h2">Réglages</h2>
      ${classeHTML(consulte)}
      ${amenagementsHTML(consulte)}
      ${plafondRevisionHTML(consulte)}
      ${vuEnClasseHTML(consulte)}
      ${pinBlock}
    </section>`;
}

/* Longueur d'une séance de Révision (#439), réglée par l'adulte sur le profil CONSULTÉ
   (setPrefFor, sans changer le profil actif). Menu à paliers fixes (REVISION_PLAFOND_CHOIX,
   déjà bornés côté programme) : pas de saisie libre, donc pas de valeur extrême possible.
   Le défaut (REVISION_PLAFOND) est marqué et reste sélectionné pour un profil non réglé. */
function plafondRevisionHTML(consulte: Profile): SafeHtml {
	const actuel = consulte.prefs?.revisionPlafond ?? REVISION_PLAFOND;
	// Valeur affichée : le palier stocké s'il fait partie de la liste, sinon on retombe
	// sur le défaut (donnée importée hors paliers → pas d'option « fantôme » à afficher).
	const sel = REVISION_PLAFOND_CHOIX.includes(actuel) ? actuel : REVISION_PLAFOND;
	const opts = joindre(
		REVISION_PLAFOND_CHOIX.map(
			(n) =>
				html`<option value="${n}"${n === sel ? drapeau('selected') : ''}>${n}${n === REVISION_PLAFOND ? ' (par défaut)' : ''}</option>`,
		),
	);
	return html`<div class="enc-block">
      <h3 class="enc-h3">Séance de révision</h3>
      <label class="enc-row"><span>Nombre de questions par séance</span>
        <select class="enc-select-niveau" data-act="set-revision-plafond">${opts}</select></label>
      <p class="enc-hint">Ajustez la longueur d'une séance de révision selon l'attention de l'enfant (par défaut ${REVISION_PLAFOND}).</p>
    </div>`;
}

/* Aménagements « dys »/attention posés par l'adulte (avis specialiste-troubles-
   apprentissage) : masquer le minuteur (pression temporelle) + lecture auto des
   consignes. Stables (l'enfant ne les bascule pas par jeu) ; l'écoute À LA DEMANDE
   reste toujours dispo côté enfant. Écrits sur le profil CONSULTÉ (setPrefFor). */
function amenagementsHTML(consulte: Profile): SafeHtml {
	const prefs = consulte.prefs ?? {};
	const voix = dicteeDisponible();
	return html`<div class="enc-block">
      <h3 class="enc-h3">Aménagements</h3>
      <p class="enc-hint">Réglages d'accompagnement posés par l'adulte (l'enfant ne peut pas les changer).</p>
      <label class="enc-toggle">
        <input type="checkbox" data-act="set-amenagement" data-pref="sansPressionTemporelle"${prefs.sansPressionTemporelle ? drapeau('checked') : ''} />
        <span>Masquer le minuteur pendant les sprints <small class="enc-hint">(moins de pression ; le score s'affiche à la fin)</small></span>
      </label>
      <label class="enc-toggle${voix ? '' : ' enc-toggle-off'}">
        <input type="checkbox" data-act="set-amenagement" data-pref="lectureConsigneAuto"${prefs.lectureConsigneAuto ? drapeau('checked') : ''}${voix ? '' : drapeau('disabled')} />
        <span>Lire la consigne à voix haute automatiquement <small class="enc-hint">(sauf pendant les sprints, où l'enfant déclenche l'écoute lui-même)</small></span>
      </label>
      <p class="enc-hint">${icon('speaker')} ${messageSansVoix()}</p>
      <label class="enc-toggle">
        <input type="checkbox" data-act="set-amenagement" data-pref="sansApparitionsSurprises"${prefs.sansApparitionsSurprises ? drapeau('checked') : ''} />
        <span>Désactiver les apparitions surprises <small class="enc-hint">(petites surprises qui passent parfois à l'écran, ex. une luciole — à couper pour un enfant qu'un mouvement inattendu déconcentre)</small></span>
      </label>
    </div>`;
}

/* ---------- Leçons déjà vues en classe (#478) ----------
   L'adulte déclare ce que l'enfant a travaillé HORS de l'application : ces leçons
   comptent alors comme « rencontrées » pour le périmètre du sprint et entrent en
   révision espacée. Écriture par UUID sur le profil CONSULTÉ (declarerVuAilleursFor),
   sans changer le profil actif.

   Structure (avis a11y) : PAS de case à cocher dans un `<summary>` (contrôle dans un
   contrôle) — chaque catégorie a une case, un compteur textuel et un bouton de dépliage
   distinct (`aria-expanded` / `aria-controls`) commandant une liste `hidden`. Listes
   fermées au rendu : les ~110 cases de leçons restent hors de l'ordre de tabulation
   tant qu'on n'a pas déplié. Les cases se mettent à jour EN PLACE (pas de re-rendu de
   l'espace, qui détruirait focus, scroll et dépliages). */
function vuEnClasseHTML(consulte: Profile): SafeHtml {
	const cats = categoriesDeclarables(consulte.uuid, (s: SubjectId) =>
		niveauProfilMatiere(consulte, s),
	);
	if (cats.length === 0) return VIDE;
	const blocs = joindre(cats.map(categorieVuHTML));
	return html`<div class="enc-block" id="encVuBloc">
      <h3 class="enc-h3">Leçons déjà vues en classe</h3>
      <p class="enc-hint">Cochez ce que ${consulte.name} a déjà travaillé en classe, hors de l'application. Ces leçons rejoignent « ce que tu connais déjà » pour le sprint et entrent en révision : la première révision arrive dès le lendemain.</p>
      <p class="enc-hint">Mieux vaut cocher au fil du programme de la classe : tout déclarer d'un coup fait grimper d'autant ce qu'il y a à réviser. Une erreur à cette première révision est normale — c'est la première fois que l'application interroge l'enfant sur cette notion.</p>
      <div class="enc-vu-actions">
        <button type="button" class="enc-btn-sec" data-act="vu-tout">${icon('check')} Tout déclarer</button>
        <button type="button" class="enc-btn-sec" data-act="vu-rien">${icon('x')} Tout retirer</button>
      </div>
      <p class="enc-vu-total" id="encVuTotal"></p>
      <div class="enc-vu-cats">${blocs}</div>
      <p class="enc-vu-status" id="encVuStatus" role="status"></p>
    </div>`;
}

/* Un bloc de catégorie : en-tête (case + compteur + dépliage) et liste des leçons.
   Une leçon DÉJÀ travaillée dans l'appli est cochée et désactivée : elle est déjà
   rencontrée, la déclarer n'ajouterait rien — et la décocher ne la retirerait pas du
   périmètre, ce qui serait incompréhensible. */
function categorieVuHTML(c: CategorieDeclarable): SafeHtml {
	const items = joindre(
		c.lecons.map((l) => {
			const off = l.jouee ? drapeau('disabled') : '';
			const mention = l.jouee
				? html` <small class="enc-vu-note">(déjà travaillée dans l'application)</small>`
				: VIDE;
			return html`<li><label class="enc-vu-item">
          <input type="checkbox" class="enc-vu-lecon" data-act="vu-lecon" data-cat="${c.categoryId}" data-lesson="${l.lessonId}" data-niveau="${l.niveau}"${l.declaree || l.jouee ? drapeau('checked') : ''}${off} />
          <span>${l.label}${mention}</span>
        </label></li>`;
		}),
	);
	const listId = `encVuList-${c.categoryId}`;
	// `role="group"` + libellé : en navigation « champ par champ » (lecteur d'écran), les
	// cases de leçons restent rattachées à leur catégorie — sinon ~110 libellés défilent
	// sans contexte. Pas de <fieldset>/<legend>, qui doublonnerait le titre à l'écran.
	return html`<div class="enc-vu-cat" role="group" aria-label="${c.label}" data-cat="${c.categoryId}">
      <div class="enc-vu-head">
        <label class="enc-vu-catlab">
          <input type="checkbox" class="enc-vu-cat-check" data-act="vu-cat" data-cat="${c.categoryId}"${c.declarables === 0 ? drapeau('disabled') : ''} />
          <span>${c.label}</span>
        </label>
        <span class="enc-vu-count" data-count="${c.categoryId}"></span>
        <button type="button" class="enc-vu-expand" data-act="vu-detail" data-cat="${c.categoryId}" aria-expanded="false" aria-controls="${listId}">
          <span class="sr-only">Détail des leçons : ${c.label}</span>${icon('caret-down')}
        </button>
      </div>
      <ul class="enc-vu-list" id="${listId}" hidden>${items}</ul>
    </div>`;
}

/* Recalcule, DEPUIS LE DOM, l'état des cases de catégorie (cochée / partielle) et les
   compteurs textuels. Appelé après chaque écriture et une fois au rendu (l'état
   « indéterminé » d'une case n'existe pas en HTML : seul le JS peut le poser). */
function rafraichirVuEnClasse(): void {
	const bloc = document.getElementById('encVuBloc');
	if (!bloc) return;
	let vues = 0;
	let total = 0;
	bloc.querySelectorAll<HTMLElement>('.enc-vu-cat').forEach((cat) => {
		const boxes = [...cat.querySelectorAll<HTMLInputElement>('.enc-vu-lecon')];
		const cochees = boxes.filter((b) => b.checked).length;
		const declarables = boxes.filter((b) => !b.disabled);
		const parent = cat.querySelector<HTMLInputElement>('.enc-vu-cat-check');
		if (parent) {
			// L'état de la case parente suit les leçons DÉCLARABLES (les autres sont déjà
			// rencontrées, cochées et figées). Catégorie entièrement travaillée dans
			// l'appli : plus rien à déclarer → case cochée et inactive, jamais « vide ».
			const n = declarables.filter((b) => b.checked).length;
			parent.checked = declarables.length > 0 ? n === declarables.length : cochees === boxes.length;
			parent.indeterminate = n > 0 && n < declarables.length;
		}
		const compteur = cat.querySelector<HTMLElement>('.enc-vu-count');
		if (compteur) compteur.textContent = `${cochees} sur ${boxes.length}`;
		vues += cochees;
		total += boxes.length;
	});
	const tot = document.getElementById('encVuTotal');
	if (tot)
		tot.textContent = `${vues} leçon${vues > 1 ? 's' : ''} déjà vue${vues > 1 ? 's' : ''} sur ${total}`;
}

/* Hook post-rendu de la section (l'orchestrateur l'appelle après avoir posé le HTML). */
export function reglagesApresRendu(): void {
	rafraichirVuEnClasse();
}

/* Les cases de leçons d'un périmètre (bloc entier ou une catégorie), déclarables
   uniquement — une leçon déjà travaillée dans l'appli n'est pas modifiable. */
function casesDeclarables(racine: HTMLElement | null): HTMLInputElement[] {
	if (!racine) return [];
	return [...racine.querySelectorAll<HTMLInputElement>('.enc-vu-lecon')].filter((b) => !b.disabled);
}

/* Annonce (région `status`) réservée aux changements que l'utilisateur n'a PAS produits
   directement : action groupée, ou case de catégorie qui bascule d'elle-même. Cocher une
   case isolée se suffit à soi-même — annoncer à chaque coche serait du bruit. */
function annoncerVu(texte: string): void {
	const status = document.getElementById('encVuStatus');
	if (status) status.textContent = texte;
}

/* Applique une déclaration groupée : une seule écriture (pas N), puis reflet dans le DOM. */
function declarerCases(uuid: string, cases: HTMLInputElement[], vu: boolean, annonce: string) {
	const entrees: LeconNiveau[] = cases.map((b) => ({
		lessonId: b.dataset.lesson ?? '',
		niveau: (b.dataset.niveau ?? '') as SchoolLevel,
	}));
	declarerVuAilleursFor(uuid, entrees, vu, Date.now());
	cases.forEach((b) => (b.checked = vu));
	rafraichirVuEnClasse();
	annoncerVu(annonce);
}

function classeHTML(consulte: Profile): SafeHtml {
	const niveaux = availableLevels(getAllLessons());
	if (niveaux.length < 2) return VIDE; // un seul niveau au catalogue → aucun choix utile
	const ref = consulte.niveauReference ?? niveaux[0];
	const parMat = consulte.niveauParMatiere ?? {};
	const opts = (sel: string | undefined) =>
		joindre(
			niveaux.map(
				(lv) =>
					html`<option value="${lv}"${lv === sel ? drapeau('selected') : ''}>${LEVEL_LABEL[lv]}</option>`,
			),
		);
	const matieres = joindre(
		SUBJECTS.map(
			(s) => html`<label class="enc-row">
          <span>${s.label}</span>
          <select class="enc-select-niveau" data-act="set-niveau-mat" data-subject="${s.id}">
            <option value=""${parMat[s.id] ? '' : drapeau('selected')}>Comme la classe</option>
            ${opts(parMat[s.id])}
          </select>
        </label>`,
		),
	);
	return html`<div class="enc-block">
      <h3 class="enc-h3">Classe de ${consulte.name}</h3>
      <div class="enc-niveau">
        <label class="enc-row"><span><strong>Classe</strong></span>
          <select class="enc-select-niveau" data-act="set-niveau-ref">${opts(ref)}</select></label>
        ${matieres}
      </div>
      <p class="enc-hint">« Comme la classe » suit la classe choisie ; ajustez une matière au besoin.</p>
    </div>`;
}

/* ---------- Handlers délégués (aiguillés par l'orchestrateur) ---------- */
export function reglagesChange(act: string, t: HTMLInputElement | HTMLSelectElement): boolean {
	const uuid = consulteUuid();
	if (act === 'set-niveau-ref' && uuid) {
		setNiveauReferenceFor(uuid, t.value as SchoolLevel);
		renderEspace();
		return true;
	}
	if (act === 'set-niveau-mat' && uuid) {
		setNiveauMatiereFor(
			uuid,
			(t as HTMLElement).dataset.subject ?? '',
			(t.value || undefined) as SchoolLevel | undefined,
		);
		renderEspace();
		return true;
	}
	if (act === 'set-revision-plafond' && uuid) {
		// Le bornage/fallback est fait à la LECTURE (getRevisionPlafond) : ici on écrit
		// simplement le palier choisi (toujours une valeur de REVISION_PLAFOND_CHOIX).
		// Pas de renderEspace() : rien d'autre à l'écran ne dépend de ce réglage, et un
		// re-rendu détruirait le <select> → perte du focus clavier pour rien (avis a11y).
		setPrefFor(uuid, 'revisionPlafond', Number(t.value));
		return true;
	}
	// Déclaration « vu en classe » (#478) : écriture ciblée puis mise à jour EN PLACE.
	// Surtout pas de renderEspace() — il détruirait le DOM (focus, scroll, dépliages)
	// à chaque case cochée, sur une liste qui peut compter plus de cent leçons.
	if (act === 'vu-lecon' && uuid) {
		const b = t as HTMLInputElement;
		const cat = b.closest<HTMLElement>('.enc-vu-cat');
		const parent = cat?.querySelector<HTMLInputElement>('.enc-vu-cat-check') ?? null;
		const completeAvant = parent?.checked ?? false;
		declarerVuAilleursFor(
			uuid,
			[{ lessonId: b.dataset.lesson ?? '', niveau: (b.dataset.niveau ?? '') as SchoolLevel }],
			b.checked,
			Date.now(),
		);
		rafraichirVuEnClasse();
		// La case de la catégorie a pu basculer d'elle-même (dernière leçon cochée, ou
		// première décochée) : ce changement sur un contrôle que l'adulte n'a pas touché
		// passerait inaperçu au lecteur d'écran → on l'annonce (avis a11y).
		if (parent && parent.checked !== completeAvant) {
			const label = cat?.querySelector('.enc-vu-catlab span')?.textContent ?? '';
			annoncerVu(
				parent.checked
					? `${label} : toutes les leçons sont déclarées vues en classe.`
					: `${label} : il reste des leçons à déclarer.`,
			);
		}
		return true;
	}
	if (act === 'vu-cat' && uuid) {
		const b = t as HTMLInputElement;
		const cat = document.querySelector<HTMLElement>(
			`.enc-vu-cat[data-cat="${b.dataset.cat ?? ''}"]`,
		);
		const label = cat?.querySelector('.enc-vu-catlab span')?.textContent ?? '';
		declarerCases(
			uuid,
			casesDeclarables(cat),
			b.checked,
			b.checked
				? `${label} : toutes les leçons sont déclarées vues en classe.`
				: `${label} : les déclarations sont retirées.`,
		);
		return true;
	}
	if (act === 'set-amenagement' && uuid) {
		const pref = (t as HTMLElement).dataset.pref as
			'sansPressionTemporelle' | 'lectureConsigneAuto' | 'sansApparitionsSurprises';
		setPrefFor(uuid, pref, (t as HTMLInputElement).checked);
		renderEspace();
		return true;
	}
	return false;
}

/* Clics de la section (dépliage d'une catégorie, déclaration de tout le niveau). */
export function reglagesClick(act: string, el: HTMLElement): boolean {
	const uuid = consulteUuid();
	if (act === 'vu-detail') {
		// Dépliage maison (bouton + liste `hidden`) plutôt que <details>/<summary> : la
		// ligne porte déjà une case à cocher, imbriquer un contrôle dans le contrôle de
		// dépliage rendrait le clavier ambigu (avis a11y).
		const liste = document.getElementById(el.getAttribute('aria-controls') ?? '');
		if (!liste) return true;
		const ouvert = el.getAttribute('aria-expanded') === 'true';
		el.setAttribute('aria-expanded', ouvert ? 'false' : 'true');
		liste.hidden = ouvert;
		return true;
	}
	if ((act === 'vu-tout' || act === 'vu-rien') && uuid) {
		const vu = act === 'vu-tout';
		declarerCases(
			uuid,
			casesDeclarables(document.getElementById('encVuBloc')),
			vu,
			// « affichées » et non « du niveau » : un profil peut suivre une matière à un
			// niveau et une autre à un niveau différent (niveauParMatiere).
			vu
				? 'Toutes les leçons affichées sont déclarées vues en classe.'
				: 'Toutes les déclarations « vu en classe » sont retirées.',
		);
		return true;
	}
	return false;
}
