/* ============================================================
   Espace encadrant — onglet « Envois » (#734) : COMPOSER un exercice figé à envoyer par
   lien, et retrouver les envois déjà créés.
   ------------------------------------------------------------
   Quatre sources à terme ; ici une leçon dans un mode (en fiche, ou dans son runner « une
   question à la fois »), ou un bilan (de catégorie, ou un favori du profil consulté). Les
   dictées viendront avec leur écran côté enfant : on ne propose que ce que l'enfant pourra
   jouer (`modesEnvoyables`).

   Le niveau est TOUJOURS choisi ici, en clair (critère 1) : le profil consulté ne sert qu'à
   le présélectionner, et l'envoi ne dépend d'aucun profil de l'appareil.

   État de vue en module, comme les autres sections : l'espace recrée tout son DOM à chaque
   action. Le libellé, lui, se valide à la frappe sans re-rendu (le champ garderait sinon
   ni focus ni curseur).
   ============================================================ */
import {
	bilanMode,
	CATEGORIES,
	getAllLessons,
	getLessonById,
	getLessonsByCategory,
	ORTHO_CATEGORY_ID,
	SUBJECTS,
	type BilanConfig,
	type LessonDef,
	type SchoolLevel,
} from '../core/catalog';
import { niveauProfilMatiere } from '../core/encadrant-stats';
import type { ExerciseMode } from '../core/exercise';
import { attribut, drapeau, html, joindre, VIDE, type SafeHtml } from '../core/html';
import { availableLevels, LEVEL_LABEL, LEVEL_ORDER, labelLecon } from '../core/levels';
import { elisionDe } from '../core/utils';
import {
	bilanCategorie,
	bilanFavori,
	composerBilan,
	composerLecon,
	libelleParDefaut,
	libelleValide,
	modesEnvoyables,
	niveauxEnvoyables,
	niveauxFavori,
	type Composition,
} from '../core/partage/composition';
import { EXPRESS_CAP, expressQuestionsPerLesson } from '../core/bilan-express';
import { QUESTIONS_PAR_FICHE } from '../core/build';
import { encoderEnvoi, MAX_BLOCS, MAX_ITEMS, nombreItems, type Envoi } from '../core/partage/envoi';
import {
	chargerEnvoisCrees,
	garderEnvoiCree,
	oublierEnvoiCree,
	type EnvoiCree,
} from '../core/partage/envois-crees';
import { nouvelIdentifiant } from '../core/partage/liens';
import { listProfiles, type Profile } from '../core/profiles';
import {
	consulteUuid,
	container,
	onChangementProfilConsulte,
	renderEspace,
} from './encadrant-commun';
import { favorisProfil } from './encadrant-favoris';
import { icon } from './icon';
import { annoncer, copierTexte, urlDuLien } from './lien-partage';
import { segmentHTML } from './segment';
import { enregistrerSelecteur, oublierSelecteur, selecteurLeconHTML } from './selecteur-lecon';
import { uiConfirm } from './ui-modal';

/* ---------- Libellés ---------- */

const AIDE_LIBELLE =
	"L'enfant le lit en ouvrant le lien. Lettres, chiffres, espaces, apostrophes et traits d'union, 60 caractères au plus.";
const AIDE_LIBELLE_REFUSE =
	"Ce libellé est refusé : il est vide ou contient un caractère non autorisé. Utilisez des lettres, des chiffres, des espaces, des apostrophes et des traits d'union.";

/* Chaque refus dit comment réussir (convention #657). */
function messageRefus(raison: Exclude<Composition, { ok: true }>['raison']): string {
	switch (raison) {
		case 'libelle':
			return 'Le libellé est refusé. Corrigez-le, puis créez le lien.';
		case 'vide':
			return 'Ce choix ne contient aucune question à ce niveau. Essayez un autre niveau.';
		case 'trop-grand':
			return `Ce bilan est trop grand pour tenir dans un lien : ${MAX_BLOCS} leçons et ${MAX_ITEMS} questions au plus. ${
				etat.bilan === 'categorie'
					? 'Choisissez le bilan express.'
					: 'Choisissez un favori plus petit.'
			}`;
		case 'format':
			return 'Cet exercice ne peut pas encore être envoyé par lien. Choisissez une autre leçon.';
	}
}
const REFUS_ENCODAGE =
	'Ce navigateur ne sait pas créer le lien. Essayez avec un navigateur à jour (Firefox, Chrome, Safari).';

/* ---------- État de vue ---------- */

type Source = 'lecon' | 'bilan';
type SourceBilan = 'categorie' | 'favori';
type Variante = 'express' | 'complet';

const SELECTEUR = 'envoi';

interface Etat {
	source: Source;
	leconId: string | null;
	/* Niveau et mode retenus pour la leçon ; `null` : celui qu'on présélectionne. */
	niveau: SchoolLevel | null;
	mode: ExerciseMode | null;
	bilan: SourceBilan;
	categorieId: string | null;
	variante: Variante;
	favoriId: string | null;
	/* Libellé saisi. `null` : pas encore touché, on montre celui du choix courant. Une fois
	   écrit par l'adulte, il survit aux changements de choix : l'effacer en silence parce
	   qu'il change de catégorie lui ferait perdre ce qu'il a tapé. */
	libelle: string | null;
	cree: { url: string; garde: boolean } | null;
}

const etat: Etat = {
	source: 'lecon',
	leconId: null,
	niveau: null,
	mode: null,
	bilan: 'categorie',
	categorieId: null,
	variante: 'express',
	favoriId: null,
	libelle: null,
	cree: null,
};

/* Les favoris sont ceux du profil consulté : en changer invalide le favori retenu. */
onChangementProfilConsulte(() => {
	etat.favoriId = null;
	if (etat.source === 'bilan' && etat.bilan === 'favori') reinitialiserSortie();
});

/* Tout changement de ce qu'on compose périme le lien affiché. */
function reinitialiserSortie(): void {
	etat.cree = null;
}

/* ---------- Ce qu'on peut composer ---------- */

/* Leçons envoyables, calculées une fois : il faut tirer quelques exercices de chaque mode
   de chaque leçon pour le savoir (cf. `modesEnvoyables`). */
let envoyables: LessonDef[] | null = null;
function leconsEnvoyables(): LessonDef[] {
	envoyables ??= getAllLessons().filter((l) => niveauxEnvoyables(l).length > 0);
	return envoyables;
}

/* Niveau présélectionné : celui que suit le profil consulté dans la matière, s'il est
   proposé ; sinon le premier proposé. */
function niveauPropose(
	choix: readonly SchoolLevel[],
	consulte: Profile,
	subject: string,
): SchoolLevel {
	const suivi = niveauProfilMatiere(consulte, subject);
	return choix.includes(suivi) ? suivi : choix[0];
}

/* Le niveau choisi par l'encadrant, s'il est proposé pour ce choix ; sinon la
   présélection. */
function niveauRetenu(niveaux: readonly SchoolLevel[], propose: SchoolLevel): SchoolLevel {
	return etat.niveau && niveaux.includes(etat.niveau) ? etat.niveau : propose;
}

interface ChoixLecon {
	lesson: LessonDef;
	niveaux: SchoolLevel[];
	niveau: SchoolLevel;
	modes: (ExerciseMode | undefined)[];
	mode: ExerciseMode | undefined;
}

function choixLecon(consulte: Profile): ChoixLecon | null {
	const lesson = etat.leconId ? getLessonById(etat.leconId) : undefined;
	if (!lesson) return null;
	const niveaux = niveauxEnvoyables(lesson);
	if (!niveaux.length) return null;
	const niveau = niveauRetenu(niveaux, niveauPropose(niveaux, consulte, lesson.subject));
	const modes = modesEnvoyables(lesson, niveau);
	const mode = etat.mode !== null && modes.includes(etat.mode) ? etat.mode : modes[0];
	return { lesson, niveaux, niveau, modes, mode };
}

function categoriesBilan(): { id: string; label: string; subject: string }[] {
	return CATEGORIES.filter(
		(c) => c.id !== ORTHO_CATEGORY_ID && getLessonsByCategory(c.id).length > 0,
	);
}

interface ChoixBilan {
	titre: string;
	niveaux: SchoolLevel[];
	niveau: SchoolLevel;
	lessons: LessonDef[];
	parLecon: number;
	variante: Variante;
	ecartees: number;
}

function choixCategorie(consulte: Profile): ChoixBilan | null {
	const cats = categoriesBilan();
	const cat = cats.find((c) => c.id === etat.categorieId) ?? cats[0];
	if (!cat) return null;
	const niveaux = availableLevels(getLessonsByCategory(cat.id));
	const niveau = niveauRetenu(niveaux, niveauPropose(niveaux, consulte, cat.subject));
	const { lessons, parLecon } = bilanCategorie(cat.id, niveau, etat.variante);
	return {
		titre: cat.label,
		niveaux,
		niveau,
		lessons,
		parLecon,
		variante: etat.variante,
		ecartees: 0,
	};
}

function favorisEnvoyables(consulte: Profile): BilanConfig[] {
	return favorisProfil(consulte.uuid).filter(
		(f) => bilanMode(f) === 'bilan' && niveauxFavori(f).length > 0,
	);
}

function choixFavori(consulte: Profile): ChoixBilan | null {
	const favoris = favorisEnvoyables(consulte);
	const favori = favoris.find((f) => f.id === etat.favoriId) ?? favoris[0];
	if (!favori) return null;
	const niveaux = niveauxFavori(favori);
	const ref = consulte.niveauReference;
	const niveau = niveauRetenu(niveaux, ref && niveaux.includes(ref) ? ref : niveaux[0]);
	return { titre: favori.label, niveaux, niveau, ...bilanFavori(favori, niveau) };
}

function choixBilan(consulte: Profile): ChoixBilan | null {
	return etat.bilan === 'categorie' ? choixCategorie(consulte) : choixFavori(consulte);
}

/* Libellé présenté tant que l'encadrant n'a pas écrit le sien. */
function libelleSuggere(consulte: Profile): string {
	if (etat.source === 'lecon') {
		const c = choixLecon(consulte);
		return c ? libelleParDefaut(labelLecon(c.lesson, c.niveau)) : '';
	}
	const b = choixBilan(consulte);
	if (!b) return '';
	return libelleParDefaut(etat.bilan === 'categorie' ? `Bilan ${b.variante} ${b.titre}` : b.titre);
}

function libelleCourant(consulte: Profile): string {
	return etat.libelle ?? libelleSuggere(consulte);
}

/* ---------- Rendu ---------- */

export function envoisHTML(consulte: Profile): SafeHtml {
	return html`<section class="enc-section enc-envois">
      <h2 class="enc-h2">${icon('paper-plane')} Envoyer un exercice</h2>
      <p class="enc-hint">Créez un lien vers un exercice. L'enfant l'ouvre sur son appareil, le fait, puis vous renvoie un lien avec ses réponses. Tous les enfants qui ouvrent ce lien ont les mêmes questions.</p>
      ${composeurHTML(consulte)}
      ${listeHTML()}
    </section>`;
}

function composeurHTML(consulte: Profile): SafeHtml {
	const source = segmentHTML({
		act: 'envoi-source',
		valAttr: 'source',
		label: 'Que voulez-vous envoyer ?',
		active: etat.source,
		options: [
			{ val: 'lecon', label: 'Une leçon' },
			{ val: 'bilan', label: 'Un bilan' },
		],
	});
	const libelle = libelleCourant(consulte);
	const invalide = libelleRefuse(libelle);
	return html`<div class="enc-block enc-envoi-composeur" id="envoiComposer">
      <h3 class="enc-h3">Composer un envoi</h3>
      ${source}
      ${etat.source === 'lecon' ? leconHTML(consulte) : bilanHTML(consulte)}
      <label class="enc-envoi-label" for="envoiLibelle">Libellé</label>
      <input type="text" class="enc-input enc-envoi-libelle" id="envoiLibelle" data-act="envoi-libelle" value="${libelle}" maxlength="60" autocomplete="off" spellcheck="true" aria-describedby="envoiLibelleAide"${invalide ? attribut('aria-invalid', 'true') : VIDE} />
      <p class="enc-hint${invalide ? ' enc-envoi-aide-refus' : ''}" id="envoiLibelleAide">${invalide ? AIDE_LIBELLE_REFUSE : AIDE_LIBELLE}</p>
      <p class="enc-envoi-mention" id="envoiMention">${icon('lock')} <span>Le résultat que l'enfant vous renverra contiendra le prénom ou le pseudo qu'il aura choisi, et ses réponses. Rien ne passe par un serveur : tout tient dans les liens.</span></p>
      <button type="button" class="enc-btn" id="envoiCreer" data-act="envoi-creer">${icon('paper-plane')} Créer le lien</button>
      <p class="enc-envoi-erreur" id="envoiErreur" role="alert"></p>
      ${creeHTML()}
    </div>`;
}

function selectHTML(
	id: string,
	act: string,
	label: string,
	options: { val: string; label: string }[],
	actif: string,
): SafeHtml {
	const opts = joindre(
		options.map(
			(o) =>
				html`<option value="${o.val}"${o.val === actif ? drapeau('selected') : VIDE}>${o.label}</option>`,
		),
	);
	return html`<label class="enc-envoi-label" for="${id}">${label}</label>
      <select class="enc-select-niveau enc-envoi-select" id="${id}" data-act="${act}">${opts}</select>`;
}

function niveauHTML(niveaux: SchoolLevel[], niveau: SchoolLevel): SafeHtml {
	if (niveaux.length === 1)
		return html`<p class="enc-envoi-fixe">Niveau : <strong>${LEVEL_LABEL[niveau]}</strong></p>`;
	return selectHTML(
		'envoiNiveau',
		'envoi-niveau',
		'Niveau',
		niveaux.map((n) => ({ val: n, label: LEVEL_LABEL[n] })),
		niveau,
	);
}

function libelleMode(lesson: LessonDef, mode: ExerciseMode | undefined): string {
	return lesson.exerciseType.modes?.find((m) => m.id === mode)?.label ?? '';
}

function leconHTML(consulte: Profile): SafeHtml {
	const c = choixLecon(consulte);
	if (!c) {
		const action = {
			act: 'envoi-lecon',
			etat: () => ({ label: 'Choisir', on: false }),
		};
		enregistrerSelecteur(SELECTEUR, () => {
			const p = profilConsulte();
			return p ? { consulte: p, action, lessons: leconsEnvoyables(), sansDictees: true } : null;
		});
		return html`<div class="enc-envoi-choix">
        <p class="enc-hint">Choisissez la leçon. Seules celles qu'un enfant peut faire depuis un lien sont proposées.</p>
        ${selecteurLeconHTML({ id: SELECTEUR, consulte, action, lessons: leconsEnvoyables(), sansDictees: true })}
      </div>`;
	}
	const mode =
		c.modes.length > 1
			? selectHTML(
					'envoiMode',
					'envoi-mode',
					'Mode',
					c.modes.map((m) => ({ val: m ?? '', label: libelleMode(c.lesson, m) })),
					c.mode ?? '',
				)
			: VIDE;
	return html`<div class="enc-envoi-choix">
      <p class="enc-envoi-fixe" id="envoiLeconChoisie" tabindex="-1">Leçon : <strong>${labelLecon(c.lesson, c.niveau)}</strong></p>
      <button type="button" class="enc-btn-sec" data-act="envoi-lecon-changer">Changer de leçon</button>
      ${niveauHTML(c.niveaux, c.niveau)}
      ${mode}
      <p class="enc-hint">${resumeQuestions(1, QUESTIONS_PAR_FICHE, true)}</p>
    </div>`;
}

/* « 8 questions », « 12 leçons, 36 questions au plus » : ce que l'enfant aura à faire. */
function resumeQuestions(lecons: number, questions: number, auPlus: boolean): string {
	const q = `${questions} question${questions > 1 ? 's' : ''}${auPlus ? ' au plus' : ''}`;
	return lecons > 1 ? `${lecons} leçons, ${q}.` : `${q.charAt(0).toUpperCase()}${q.slice(1)}.`;
}

function bilanHTML(consulte: Profile): SafeHtml {
	const type = segmentHTML({
		act: 'envoi-bilan',
		valAttr: 'bilan',
		label: 'Quel bilan ?',
		active: etat.bilan,
		options: [
			{ val: 'categorie', label: 'Un bilan de catégorie' },
			{ val: 'favori', label: 'Un bilan favori' },
		],
	});
	return html`<div class="enc-envoi-choix">
      ${type}
      ${etat.bilan === 'categorie' ? categorieHTML(consulte) : favoriHTML(consulte)}
    </div>`;
}

function categorieHTML(consulte: Profile): SafeHtml {
	const b = choixCategorie(consulte);
	if (!b) return html`<p class="enc-hint">Aucune catégorie ne peut faire l'objet d'un bilan.</p>`;
	const cats = categoriesBilan();
	const groupes = joindre(
		SUBJECTS.map((s) => {
			const opts = joindre(
				cats
					.filter((c) => c.subject === s.id)
					.map(
						(c) =>
							html`<option value="${c.id}"${c.label === b.titre ? drapeau('selected') : VIDE}>${c.label}</option>`,
					),
			);
			return html`<optgroup label="${s.label}">${opts}</optgroup>`;
		}),
	);
	const variante = segmentHTML({
		act: 'envoi-variante',
		valAttr: 'variante',
		label: 'Bilan express ou complet',
		active: etat.variante,
		options: [
			{ val: 'express', label: 'Express' },
			{ val: 'complet', label: 'Complet' },
		],
	});
	const explication =
		etat.variante === 'express'
			? `Express : ${EXPRESS_CAP} leçons au plus, tirées au hasard, de 1 à ${expressQuestionsPerLesson(1)} questions chacune.`
			: `Complet : toutes les leçons de la catégorie, ${QUESTIONS_PAR_FICHE} questions chacune.`;
	return html`<label class="enc-envoi-label" for="envoiCategorie">Catégorie</label>
      <select class="enc-select-niveau enc-envoi-select" id="envoiCategorie" data-act="envoi-categorie">${groupes}</select>
      ${niveauHTML(b.niveaux, b.niveau)}
      ${variante}
      <p class="enc-hint">${explication} ${resumeQuestions(b.lessons.length, b.lessons.length * b.parLecon, true)}</p>`;
}

function favoriHTML(consulte: Profile): SafeHtml {
	const favoris = favorisEnvoyables(consulte);
	const b = choixFavori(consulte);
	if (!b || !favoris.length) {
		const aucun = favorisProfil(consulte.uuid).length === 0;
		return html`<p class="enc-hint" id="envoiFavoriAucun">${
			aucun
				? `${consulte.name} n'a pas de bilan favori.`
				: `Les bilans favoris ${elisionDe(consulte.name)} ne peuvent pas être envoyés : un sprint ne s'envoie pas par lien.`
		} Les favoris proposés sont ceux du profil choisi en haut de la page.</p>`;
	}
	const actif = favoris.find((f) => f.id === etat.favoriId) ?? favoris[0];
	const select = selectHTML(
		'envoiFavori',
		'envoi-favori',
		`Bilans favoris ${elisionDe(consulte.name)}`,
		favoris.map((f) => ({ val: f.id, label: f.label })),
		actif.id,
	);
	const ecart = b.ecartees
		? html`<p class="enc-hint enc-envoi-aide-refus">${
				b.ecartees > 1
					? `${b.ecartees} leçons de ce favori ne sont pas proposées en ${LEVEL_LABEL[b.niveau]} : elles ne seront pas dans l'envoi.`
					: `Une leçon de ce favori n'est pas proposée en ${LEVEL_LABEL[b.niveau]} : elle ne sera pas dans l'envoi.`
			}</p>`
		: VIDE;
	return html`${select}
      ${niveauHTML(b.niveaux, b.niveau)}
      ${ecart}
      <p class="enc-hint">${resumeQuestions(b.lessons.length, b.lessons.length * b.parLecon, true)}</p>`;
}

function creeHTML(): SafeHtml {
	if (!etat.cree) return VIDE;
	const partager =
		typeof navigator.share === 'function'
			? html`<button type="button" class="enc-btn-sec" id="envoiPartager" data-act="envoi-partager">${icon('export')} Partager</button>`
			: VIDE;
	const nonGarde = etat.cree.garde
		? VIDE
		: html`<p class="enc-hint enc-envoi-aide-refus">L'appareil n'a pas pu garder ce lien dans vos envois : copiez-le maintenant.</p>`;
	return html`<div class="enc-envoi-cree" id="envoiCree">
      <h4 class="enc-envoi-cree-titre" id="envoiCreeTitre" tabindex="-1">${icon('check-circle')} Le lien est prêt</h4>
      <p class="enc-hint">Envoyez-le à l'enfant, par message ou par l'ENT de l'école. Il l'ouvre sur son appareil.</p>
      ${nonGarde}
      <label class="sr-only" for="envoiLien">Lien de l'exercice</label>
      <input type="text" class="enc-input enc-envoi-lien" id="envoiLien" value="${etat.cree.url}" readonly />
      <div class="enc-envoi-actions">
        <button type="button" class="enc-btn" id="envoiCopier" data-act="envoi-copier-cree">Copier le lien</button>
        ${partager}
      </div>
      <p class="enc-envoi-copie" id="envoiCopie" role="status" aria-live="polite"></p>
    </div>`;
}

function dateEnvoi(t: number): string {
	return new Date(t).toLocaleDateString('fr-FR', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

function listeHTML(): SafeHtml {
	const envois = chargerEnvoisCrees();
	const corps = envois.length
		? html`<ul class="enc-envois-liste">${joindre(envois.map(envoiHTML))}</ul>`
		: html`<p class="enc-hint">Aucun envoi pour l'instant.</p>`;
	return html`<div class="enc-block">
      <h3 class="enc-h3" id="envoisTitre" tabindex="-1">Vos envois</h3>
      <p class="enc-hint">Vos envois sont gardés sur cet appareil. Retirer un envoi de la liste ne désactive pas son lien.</p>
      <div id="envoisListe">${corps}</div>
      <p class="enc-envoi-copie" id="envoisStatut" role="status" aria-live="polite"></p>
    </div>`;
}

function envoiHTML(e: EnvoiCree): SafeHtml {
	return html`<li class="enc-envoi" data-id="${e.id}">
      <p class="enc-envoi-titre">${e.libelle}</p>
      <p class="enc-hint">Créé le ${dateEnvoi(e.date)}. ${e.detail}.</p>
      <div class="enc-envoi-actions">
        <button type="button" class="enc-btn-sec" data-act="envoi-copier" data-id="${e.id}" aria-label="Copier le lien : ${e.libelle}">Copier le lien</button>
        <button type="button" class="enc-btn-sec" data-act="envoi-oublier" data-id="${e.id}" aria-label="Retirer de la liste : ${e.libelle}">Retirer de la liste</button>
      </div>
      <p class="enc-envoi-copie" role="status" aria-live="polite"></p>
    </li>`;
}

/* ---------- Plomberie ---------- */

function profilConsulte(): Profile | null {
	const uuid = consulteUuid();
	return uuid ? (listProfiles().find((p) => p.uuid === uuid) ?? null) : null;
}

/* Re-rend l'espace puis rend le focus à l'élément désigné (le DOM est recréé). */
function rendre(refocus?: string): void {
	renderEspace();
	if (refocus) container()?.querySelector<HTMLElement>(refocus)?.focus({ preventScroll: true });
}

/* Le choix change : le lien affiché et le niveau retenu ne valent plus. */
function changerChoix(maj: () => void, refocus: string): void {
	maj();
	etat.niveau = null;
	etat.mode = null;
	reinitialiserSortie();
	rendre(refocus);
}

/* ---------- Composition ---------- */

/* « Leçon : Être au présent, CE2, 8 questions ». Des virgules plutôt qu'un point médian,
   que certains lecteurs d'écran prononcent. */
function detailEnvoi(envoi: Envoi, titre: string, mode: string): string {
	const n = nombreItems(envoi);
	const questions = `${n} question${n > 1 ? 's' : ''}`;
	const niveau = envoi.niveau ? LEVEL_LABEL[envoi.niveau] : '';
	if (envoi.nature === 'lecon')
		return `Leçon : ${[titre, niveau, mode, questions].filter(Boolean).join(', ')}`;
	if (envoi.nature === 'bilan') {
		const lecons = `${envoi.blocs.length} leçon${envoi.blocs.length > 1 ? 's' : ''}`;
		return `Bilan ${envoi.variante} : ${[titre, niveau, lecons, questions].join(', ')}`;
	}
	return `Dictée : ${[titre, questions].join(', ')}`;
}

function composer(
	consulte: Profile,
	libelle: string,
	id: string,
): { compo: Composition; titre: string; mode: string } | null {
	if (etat.source === 'lecon') {
		const c = choixLecon(consulte);
		if (!c) return null;
		const compo = composerLecon({ lesson: c.lesson, niveau: c.niveau, mode: c.mode, libelle, id });
		const mode = c.modes.length > 1 ? libelleMode(c.lesson, c.mode) : '';
		return { compo, titre: labelLecon(c.lesson, c.niveau), mode };
	}
	const b = choixBilan(consulte);
	if (!b) return null;
	const compo = composerBilan({ ...b, libelle, id });
	return { compo, titre: b.titre, mode: '' };
}

/* L'alerte est remplie APRÈS le rendu : une région `role="alert"` qui naît déjà remplie
   n'est annoncée de façon fiable par aucun lecteur d'écran (relecture a11y). */
function signalerErreur(texte: string, refocus: string): void {
	rendre(refocus);
	const region = container()?.querySelector<HTMLElement>('#envoiErreur');
	if (region) annoncer(region, texte);
}

let creation = false;

async function creer(): Promise<void> {
	if (creation) return;
	creation = true;
	try {
		await creerUnEnvoi();
	} finally {
		creation = false;
	}
}

async function creerUnEnvoi(): Promise<void> {
	const consulte = profilConsulte();
	if (!consulte) return;
	const libelle = libelleCourant(consulte);
	const id = nouvelIdentifiant();
	const r = composer(consulte, libelle, id);
	etat.cree = null;
	if (!r) {
		signalerErreur(
			etat.source === 'lecon' ? "Choisissez d'abord une leçon." : "Choisissez d'abord un bilan.",
			'#envoiCreer',
		);
		return;
	}
	if (!r.compo.ok) {
		signalerErreur(
			messageRefus(r.compo.raison),
			r.compo.raison === 'libelle' ? '#envoiLibelle' : '#envoiCreer',
		);
		return;
	}
	let code: string;
	try {
		code = await encoderEnvoi(r.compo.envoi);
	} catch {
		signalerErreur(REFUS_ENCODAGE, '#envoiCreer');
		return;
	}
	const garde = garderEnvoiCree({
		id,
		libelle,
		date: Date.now(),
		detail: detailEnvoi(r.compo.envoi, r.titre, r.mode),
		code,
	});
	etat.cree = { url: urlDuLien('envoi', code), garde };
	rendre('#envoiCreeTitre');
}

/* ---------- Handlers délégués (aiguillés par l'orchestrateur) ---------- */

export function envoisClick(act: string, el: HTMLElement): boolean {
	switch (act) {
		case 'envoi-source':
			changerChoix(
				() => {
					etat.source = el.dataset.source === 'bilan' ? 'bilan' : 'lecon';
				},
				`[data-act="envoi-source"][data-source="${etat.source === 'lecon' ? 'bilan' : 'lecon'}"]`,
			);
			return true;
		case 'envoi-bilan':
			changerChoix(
				() => {
					etat.bilan = el.dataset.bilan === 'favori' ? 'favori' : 'categorie';
				},
				`[data-act="envoi-bilan"][data-bilan="${el.dataset.bilan === 'favori' ? 'favori' : 'categorie'}"]`,
			);
			return true;
		case 'envoi-variante': {
			const variante: Variante = el.dataset.variante === 'complet' ? 'complet' : 'express';
			// Le niveau, lui, reste : la variante ne change pas la catégorie.
			etat.variante = variante;
			reinitialiserSortie();
			rendre(`[data-act="envoi-variante"][data-variante="${variante}"]`);
			return true;
		}
		case 'envoi-lecon':
			changerChoix(() => {
				etat.leconId = el.dataset.lesson ?? null;
				oublierSelecteur(SELECTEUR);
			}, '#envoiLeconChoisie');
			return true;
		case 'envoi-lecon-changer':
			changerChoix(() => {
				etat.leconId = null;
			}, `#sel-rech-${SELECTEUR}`);
			return true;
		case 'envoi-creer':
			void creer();
			return true;
		case 'envoi-copier-cree': {
			const champ = container()?.querySelector<HTMLInputElement>('#envoiLien');
			const region = container()?.querySelector<HTMLElement>('#envoiCopie');
			if (champ && region) void copierEtDire(champ.value, region, champ);
			return true;
		}
		case 'envoi-partager':
			if (etat.cree && typeof navigator.share === 'function')
				navigator.share({ url: etat.cree.url }).catch(() => {
					// feuille de partage refermée : rien à dire
				});
			return true;
		case 'envoi-copier': {
			const e = chargerEnvoisCrees().find((x) => x.id === el.dataset.id);
			const li = el.closest('li');
			if (e && li) void copierDepuisListe(urlDuLien('envoi', e.code), li);
			return true;
		}
		case 'envoi-oublier':
			void oublier(el.dataset.id ?? '');
			return true;
	}
	return false;
}

const COPIE_OK = 'Lien copié. Vous pouvez le coller dans un message.';
const COPIE_ECHEC = 'La copie a échoué : sélectionnez le lien et copiez-le à la main.';

async function copierEtDire(
	url: string,
	region: HTMLElement,
	champ: HTMLInputElement,
): Promise<void> {
	annoncer(region, (await copierTexte(url, champ)) ? COPIE_OK : COPIE_ECHEC);
}

/* La liste n'affiche pas les liens (un bilan complet en fait plusieurs dizaines de Ko) : si
   le presse-papiers refuse, le lien apparaît dans un champ, sélectionné, pour une copie à
   la main. Champ créé par le DOM, sans balisage. */
async function copierDepuisListe(url: string, li: HTMLElement): Promise<void> {
	const region = li.querySelector<HTMLElement>('.enc-envoi-copie');
	if (!region) return;
	if (await copierTexte(url)) {
		annoncer(region, COPIE_OK);
		return;
	}
	let champ = li.querySelector<HTMLInputElement>('.enc-envoi-lien');
	if (!champ) {
		champ = document.createElement('input');
		champ.type = 'text';
		champ.readOnly = true;
		champ.className = 'enc-input enc-envoi-lien';
		champ.setAttribute('aria-label', "Lien de l'exercice");
		region.before(champ);
	}
	champ.value = url;
	champ.focus();
	champ.select();
	annoncer(region, COPIE_ECHEC);
}

async function oublier(id: string): Promise<void> {
	const e = chargerEnvoisCrees().find((x) => x.id === id);
	if (!e) return;
	const ok = await uiConfirm({
		title: `Retirer « ${e.libelle} » de vos envois ?`,
		message:
			"Le lien reste valable : un enfant qui l'a déjà reçu peut toujours faire l'exercice. Vous ne pourrez plus le copier d'ici.",
		confirmLabel: 'Retirer de la liste',
		cancelLabel: 'Garder',
	});
	if (!ok) return;
	const ids = chargerEnvoisCrees().map((x) => x.id);
	const i = ids.indexOf(id);
	const voisin = ids[i + 1] ?? ids[i - 1];
	oublierEnvoiCree(id);
	rendre(voisin ? `[data-act="envoi-oublier"][data-id="${CSS.escape(voisin)}"]` : '#envoisTitre');
	const statut = container()?.querySelector<HTMLElement>('#envoisStatut');
	if (statut) annoncer(statut, `« ${e.libelle} » est retiré de la liste.`);
}

export function envoisChange(act: string, t: HTMLInputElement | HTMLSelectElement): boolean {
	switch (act) {
		case 'envoi-niveau':
			etat.niveau = LEVEL_ORDER.find((n) => n === t.value) ?? null;
			etat.mode = null;
			reinitialiserSortie();
			rendre('#envoiNiveau');
			return true;
		case 'envoi-mode':
			etat.mode = t.value;
			reinitialiserSortie();
			rendre('#envoiMode');
			return true;
		case 'envoi-categorie':
			changerChoix(() => {
				etat.categorieId = t.value;
			}, '#envoiCategorie');
			return true;
		case 'envoi-favori':
			changerChoix(() => {
				etat.favoriId = t.value;
			}, '#envoiFavori');
			return true;
	}
	return false;
}

/* Libellé : validé à chaque lettre, SANS re-rendu. L'aide change de texte (jamais la
   couleur seule) et le champ porte `aria-invalid`. */
/* Un champ VIDE n'est pas signalé à la frappe ni à l'ouverture (rien n'est encore choisi) :
   c'est « Créer le lien » qui le refuse, avec son message. */
function libelleRefuse(s: string): boolean {
	return s !== '' && !libelleValide(s);
}

export function envoisInput(act: string, t: HTMLElement): boolean {
	if (act !== 'envoi-libelle' || !(t instanceof HTMLInputElement)) return false;
	etat.libelle = t.value;
	const valide = !libelleRefuse(t.value);
	if (valide) t.removeAttribute('aria-invalid');
	else t.setAttribute('aria-invalid', 'true');
	const aide = container()?.querySelector<HTMLElement>('#envoiLibelleAide');
	if (aide) {
		aide.textContent = valide ? AIDE_LIBELLE : AIDE_LIBELLE_REFUSE;
		aide.classList.toggle('enc-envoi-aide-refus', !valide);
	}
	return true;
}
