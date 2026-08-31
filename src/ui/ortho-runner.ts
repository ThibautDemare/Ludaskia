/* ============================================================
   Mode Orthographe — runner d'entraînement (couche UI).
   Boucle : on prend le prochain mot non maîtrisé, on rend l'activité
   qui lui correspond (atelier -> tuiles -> affiche/masque ; la dictée
   viendra avec le TTS), on enregistre le résultat, on enchaîne.
   Quand tous les mots sont maîtrisés -> bilan.
   - L'atelier est ici en version « légère » (regarder le mot) ; la
     version SVG (entourer les pièges) est une étape suivante.
   - La dictée n'est pas proposée tant que le TTS n'est pas branché.
   ============================================================ */
import { insertAt, moveAt, removeAt } from '../core/utils';
import { loadOrtho, saveOrtho, getListe } from '../core/orthographe/store';
import { materialiserVerbes } from '../core/orthographe/verbes';
import { motsDeLecon } from '../core/orthographe/lessons';
import { genExerciseOrtho, ORTHO_MODE_OPTIONS } from '../core/orthographe/exercise';
import { checkAnswer, type ModeOption } from '../core/exercise';
import { TEXT_ANSWER_INPUT_ATTRS } from '../core/items';
import {
	statutMot,
	prochaineActivite,
	activiteProgressive,
	marquerAtelierFait,
	validerMode,
	decouverteEnCours,
	listeEtoilee,
} from '../core/orthographe/runner';
import { modesEpuises, modesEpuisesPendant } from '../core/orthographe/choix-mode';
import type { MotOrtho, OrthoState, ModeOrtho } from '../core/orthographe/types';
import { diffCorrect } from '../core/orthographe/diff';
import { addXP, getXP, niveauDepuisXP, recordSessionActivity } from '../core/progress';
import { journaliserPaliersOrtho } from '../core/orthographe/paliers';
import { evaluateTrophies } from '../core/rewards';
import { ORTHO_CATEGORY_ID } from '../core/catalog';
import { goCategorie, goOrthoRevoir, goOrthoRevoirMots } from './navigation';
import { motsDifficilesHTML, bindMotsDifficiles } from './mots-difficiles-view';
import { retourFinActivite, activiteDemarree } from './retour-activite';
import {
	renderAtelier,
	lettresMotHTML,
	dessinerEntourages,
	ajusterTailleMot,
} from './ortho-atelier';
import { recompensesEntre } from '../core/unlocks';
import { announceRewards } from './effects';
import { mascotteBulleHTML, encouragementMascotte } from './unlocks-view';
import { dicteeDisponible, dicter, messageSansVoix } from './tts';
import { icon, iconOr } from './icon';
import { monterBoutonAide, maybeAutoAide } from './aide-exercice';
import { capterErreur } from './erreur-capture';
import { html, drapeau, attribut, type SafeHtml, joindre, VIDE } from '../core/html';

const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'ô', 'î', 'ï', 'û', 'ù', 'œ', '-', "'"];
const SEANCE_MAX = 8; // activités par séance avant de proposer une pause (rythme CE2)

let st: OrthoState;
let mots: MotOrtho[];
let orthoLessonId = ''; // id de la liste travaillée (journal d'erreurs #391)
let idx = 0;
let dispoDictee = false;
let niveauAvant = 0;
let actes = 0;
// Mode de la séance (#69) : null = parcours complet (atelier → modes → étoile) ; un mode =
// entraînement ciblé sur ce seul mode. Depuis #641 un mode ciblé VALIDE lui aussi (le cumul
// vit dans `validerMode`) : il peut donc faire monter un mot, étoiler la liste et décrocher
// des trophées. Ce qu'il change encore, c'est le CHOIX de l'activité (imposée) et le tour de
// piste (on tourne sur tous les mots au lieu de s'arrêter aux non-maîtrisés).
let seanceMode: ModeOrtho | null = null;
// La liste était-elle DÉJÀ étoilée à l'ouverture (#641, critère 5) ? On ne rejoue pas la
// célébration de première complétion pour une liste acquise avant que la séance commence.
let listeEtoileeAvant = false;
// Modes terminés pour la liste À L'OUVERTURE (#641, critère 12) : témoin qui permet de dire,
// en fin de séance, lesquels viennent de basculer — et eux seuls.
let modesEpuisesAvant: ModeOrtho[] = [];
// La séance a-t-elle comporté au moins une activité qui POUVAIT faire progresser un mot
// (#641) ? C'est ce qui décide si l'étape « dictée » du programme du jour se coche, la
// réussite n'entrant pas dans le calcul. Un parcours complet compte toujours (y compris son
// tour de révision) ; un mode ciblé ne compte que s'il avait quelque chose à faire gagner.
let seanceProgressive = false;
// Tour de révision : true quand le parcours complet est lancé sur une liste DÉJÀ
// entièrement maîtrisée. Au lieu d'un bilan vide (l'étoile est déjà gagnée), on
// repasse chaque mot une fois en mode d'entretien, puis on clôt par « Révision
// terminée » (pas la célébration « Liste prête ! » de première complétion).
let revisionRun = false;
// Une session d'orthographe a-t-elle déjà été journalisée dans le graphe d'activité
// encadrant (#319) ? Posée une seule fois par session (au 1er écran terminal atteint :
// pause, bilan ou révision terminée), pour ne pas re-compter les « Continuer encore ».
let orthoJournalisee = false;
// Mots passés par la CORRECTION GUIDÉE depuis le début de la séance (#618), dans
// l'ordre de rencontre et sans doublon. Alimenté par la seule branche d'escalade
// (2e erreur → atelier avec le diff) du mot caché et de la dictée : un mot raté puis
// rattrapé dans la foulée relève de la récupération autonome, donc du fonctionnement
// normal de l'apprentissage, et ne se signale pas. Les TUILES n'ont pas cette branche
// (l'enfant y réessaie sans escalade, et les lettres lui sont fournies) : elles ne
// nourrissent donc jamais cette liste, conséquence assumée du cadrage.
//
// À NE PAS CONFONDRE avec le journal de l'espace encadrant (`journalErreurOrtho`), qui
// capture lui le PREMIER essai raté. Les deux points de capture divergent volontairement.
//
// En mémoire uniquement : aucune clé de stockage, rien qui survive au rechargement.
// Remis à zéro par `startOrthoRun` seulement — surtout pas par « Continuer encore un
// peu », qui poursuit la MÊME séance.
let motsDifficiles: MotOrtho[] = [];
function noterMotDifficile(word: MotOrtho): void {
	if (!motsDifficiles.some((m) => m.id === word.id)) motsDifficiles.push(word);
}
// Mode choisi en attente, posé par l'écran de choix et consommé par startOrthoRun.
let pendingOrthoMode: ModeOrtho | null = null;
export const setPendingOrthoMode = (m: ModeOrtho | null) => {
	pendingOrthoMode = m;
};

// Retrace des entourages du mot affiché en mode « afficher/cacher » au resize (#263).
// Module-level (un seul mot affiché à la fois) ; nettoyé dès qu'on cache le mot ou
// qu'on change d'activité (début de renderNext), comme l'atelier/la relecture.
let motCacheResize: (() => void) | null = null;
function cleanupMotCacheResize(): void {
	if (motCacheResize) {
		window.removeEventListener('resize', motCacheResize);
		motCacheResize = null;
	}
}

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

/* ---------- Contexte d'une cible verbe (#261) ----------
   Une cible verbe porte `contexte` (pronom + complément) : on affiche la phrase à
   trou autour du slot interactif (le « trou » = la forme à écrire/assembler) et on
   lit la phrase complète en TTS. Un mot classique (`contexte` absent) est inchangé. */

/* Phrase à trou. `reveal` montre la forme (phase « affiché » du mot caché). */
function contexteHTML(word: MotOrtho, reveal = false): SafeHtml {
	if (!word.contexte) return VIDE;
	const { avant, apres } = word.contexte;
	const creux = reveal
		? html`<span class="ortho-trou is-rempli">${word.mot}</span>`
		: html`<span class="ortho-trou"><span aria-hidden="true">______</span><span class="sr-only">le verbe à écrire</span></span>`;
	return html`<p class="ortho-contexte" lang="fr">${avant}${creux}${apres}</p>`;
}

/* Phrase complète lue par le TTS pour une cible verbe : « il mange une pomme ». */
function phraseVerbe(word: MotOrtho): string {
	const c = word.contexte!;
	return `${c.avant}${word.mot}${c.apres}`;
}

/* Écoute d'une cible : phrase complète pour un verbe (lève l'ambiguïté), sinon
   « mot. Comme dans : … » pour un mot classique. `onErreur` remonte le silence
   (voix absente ou énoncé en échec) à l'appelant — cf. `dicteeMuette`. */
function ecouterCible(word: MotOrtho, onErreur?: () => void): void {
	if (word.contexte) dicter(phraseVerbe(word), undefined, onErreur);
	else dicter(word.mot, word.commeDans, onErreur);
}

function ecouterLabel(word: MotOrtho): string {
	return word.contexte ? 'Écouter la phrase' : 'Écouter le mot';
}

/* Bouton « Écouter » de l'atelier : on rend l'atelier audible comme les autres
   modes (découverte ET correction). Absent si aucune voix n'est dispo. Lit le mot
   (ou la phrase, pour un verbe) — le mot est affiché à l'atelier, rien n'est révélé. */
function ecouteAtelier(word: MotOrtho): { label: string; onClick: () => void } | undefined {
	if (!dispoDictee) return undefined;
	return { label: ecouterLabel(word), onClick: () => ecouterCible(word) };
}

/* Journal des erreurs (#391) : consigne le PREMIER essai raté d'un mot (mot caché,
   dictée ou tuiles), lisible côté encadrant. mode 'dictee' (le sous-mode importe peu
   au parent). Pour un verbe en contexte, l'énoncé montre la phrase à trou ; sinon un
   libellé générique (la bonne réponse — le mot — porte l'info). Appelé une seule fois
   par activité (garde chez l'appelant). */
function journalErreurOrtho(word: MotOrtho, saisie: string): void {
	if (!saisie.trim()) return; // saisie vide = non répondu → ignorée (parité avec la fiche)
	const c = word.contexte;
	capterErreur({
		text: c ? `${c.avant}…${c.apres}` : 'Mot à écrire sous la dictée',
		donnee: saisie,
		attendue: word.mot,
		lessonId: orthoLessonId,
		mode: 'dictee',
	});
}

export async function startOrthoRun(lessonId: string): Promise<void> {
	// Cette liste démarre : valide (ou invalide) la provenance mémorisée (#461), le routeur
	// pouvant nous appeler sans déclencheur (accès direct au hash, Précédent/Suivant).
	activiteDemarree(lessonId);
	st = loadOrtho();
	orthoLessonId = lessonId;
	mots = motsDeLecon(st, lessonId);
	// Verbes de la liste (#261) : résolus via LEFFF (async) puis matérialisés en
	// cibles dictée/tuiles/mot-caché et concaténés aux mots classiques.
	const liste = getListe(st, lessonId);
	if (liste?.verbes?.length) {
		renderPreparation();
		const cibles = await materialiserVerbes(st, liste.verbes, Date.now());
		mots = [...mots, ...cibles];
	}
	saveOrtho(st); // persiste la matérialisation (mots prédéfinis + cibles verbe)
	dispoDictee = dicteeDisponible();
	seanceMode = pendingOrthoMode; // null → parcours complet
	pendingOrthoMode = null;
	idx = 0;
	niveauAvant = niveauDepuisXP(getXP());
	actes = 0;
	motsDifficiles = []; // nouvelle séance → nouveau rappel de fin (#618)
	orthoJournalisee = false; // nouvelle session → re-journalisable une fois (#319)
	seanceProgressive = false; // nouvelle session : rien n'a encore pu faire progresser (#641)
	listeEtoileeAvant = listeEtoilee(mots, dispoDictee);
	modesEpuisesAvant = modesEpuises(mots, dispoDictee);
	// Parcours complet sur une liste déjà acquise → tour de révision (sinon le bilan
	// tomberait tout de suite, sans rien proposer à travailler).
	revisionRun = !seanceMode && listeEtoileeAvant;
	if (!mots.length) {
		goCategorie(ORTHO_CATEGORY_ID);
		return;
	}
	renderNext();
}

/* Écran d'attente bref pendant la résolution des formes verbales (chargement
   paresseux d'un shard). Évite un écran vide le temps de l'import dynamique. */
function renderPreparation(): void {
	sheets().innerHTML = html`
    <div class="page ortho-run ortho-bilan">
      <div class="ortho-bilan-emoji">⏳</div>
      <p>Un instant, je prépare tes mots…</p>
    </div>`.balisage;
}

/* La découverte de la liste est-elle terminée (tous les mots vus à l'atelier) ?
   Sert à décider d'afficher l'écran de choix de mode (#69). */
export function orthoDiscoveryComplete(lessonId: string): boolean {
	const s = loadOrtho();
	const m = motsDeLecon(s, lessonId);
	return m.length > 0 && !decouverteEnCours(m);
}

/* Coût d'une séance, annoncé sur TOUS les boutons qui en lancent une (#641, critère 9) —
   et sur eux seuls : porté par le seul parcours complet, le chiffre se lirait comme un
   avertissement contre lui. « Relire mes mots » n'a pas de plafond d'activités, donc pas de
   chip. Interpolé depuis `SEANCE_MAX` : écrit en dur, le libellé se désynchroniserait
   silencieusement le jour où la constante bouge. */
function coutSeanceHTML(): SafeHtml {
	return html`<span class="mode-btn-cout">${SEANCE_MAX} activités</span>`;
}

/* Un bouton de mode ciblé. `termine` = tous les mots de la liste ont validé ce mode : il
   descend en zone basse, porte son badge, et surtout GARDE l'aspect d'un bouton pleinement
   actif (critère 10) — jamais le pointillé de `.programme-tuile--inactive`, que l'enfant a
   déjà appris ailleurs comme « pas cliquable ». Il rapporte toujours de l'XP, et le badge
   le dit — avec le MÊME adverbe que le message de fin de séance (« toujours ») : deux mots
   différents pour le même fait, sur le même écran, se lisent comme deux faits différents. */
function modeBtnHTML(m: ModeOption, termine: boolean): SafeHtml {
	const badge = termine
		? html`<span class="mode-btn-badge">Terminé pour cette liste · donne toujours des points</span>`
		: VIDE;
	return html`<button class="mode-btn" data-mode="${m.id}"${termine ? attribut('data-epuise', '1') : ''}>
        <span class="mode-btn-ico">${iconOr(m.icon)}</span>
        <span class="mode-btn-txt">
          <span class="mode-btn-label">${m.label}</span>
          ${badge}${coutSeanceHTML()}
        </span>
      </button>`;
}

/* Écran de choix du mode d'une liste (#69), proposé une fois la liste découverte :
   le parcours complet (conseillé, seul à donner l'étoile) ou un mode ciblé.

   Depuis #641, les modes se répartissent en DEUX zones : ce qui reste à faire en tête, et
   plus bas ce qui est déjà terminé pour cette liste (tous ses mots l'ont validé). Un mode
   terminé ne disparaît pas — il rapporte toujours des points et reste un entraînement
   valable — mais il cesse de capter le geste par défaut d'un enfant qui va au plus étayé,
   ce qui est le point de départ de l'issue. La zone basse reste toujours DÉPLIÉE (choix du
   mainteneur) : un repli en cacherait l'existence à qui ne sait pas qu'il faut chercher.

   Cas limite tenu par le critère 11 : sur une liste entièrement acquise, la zone principale
   n'a plus de mode ciblé, mais l'écran ne se vide pas (parcours complet + relecture y sont
   toujours). Les cibles VERBE d'une liste (#261) ne sont pas comptées ici : elles ne sont
   matérialisées qu'au lancement du parcours, donc un mode ne se dira « terminé » que sur
   les mots classiques — au pire un bouton reste en tête un peu plus longtemps. */
export function renderOrthoModeChoice(host: HTMLElement, lessonId: string, label: string): void {
	const dispo = dicteeDisponible();
	const motsListe = motsDeLecon(loadOrtho(), lessonId);
	const finis = modesEpuises(motsListe, dispo);
	const cibles = ORTHO_MODE_OPTIONS.filter((m) => m.id !== 'dictee' || dispo);
	const aFaire = cibles.filter((m) => !finis.includes(m.id as ModeOrtho));
	const termines = cibles.filter((m) => finis.includes(m.id as ModeOrtho));
	const go = (mode: ModeOrtho | null) => {
		setPendingOrthoMode(mode);
		location.hash = 'ortho-' + lessonId;
	};
	const zoneTermines = termines.length
		? html`<div class="mode-choice-epuises">
      <p class="mode-choice-epuises-sep">Déjà terminés pour cette liste</p>
      ${joindre(termines.map((m) => modeBtnHTML(m, true)))}
    </div>`
		: VIDE;
	host.innerHTML = html`<div class="mode-choice">
    <h2 class="mode-choice-title">Comment veux-tu t'entraîner ?</h2>
    <p class="mode-choice-lesson">${label}</p>
    <div class="mode-choice-list">
      <button class="mode-btn recommended" data-mode="">
        <span class="mode-btn-ico">${icon('star', { cls: 'ph-star' })}</span>
        <span class="mode-btn-txt">
          <span class="mode-btn-label">Le parcours complet</span>
          <span class="mode-btn-badge">conseillé · donne l'étoile</span>
          ${coutSeanceHTML()}
        </span>
      </button>
      ${joindre(aFaire.map((m) => modeBtnHTML(m, false)))}
    </div>
    ${zoneTermines}
    <div class="mode-choice-etude">
      <p class="mode-choice-etude-sep">Ou pour réviser tranquillement</p>
      <button class="etude-btn" id="btnRevoir">
        <span class="mode-btn-ico">${icon('book-open')}</span>
        <span class="mode-btn-txt">
          <span class="mode-btn-label">Relire mes mots</span>
          <span class="mode-btn-hint">juste pour relire, sans points</span>
        </span>
      </button>
    </div>
  </div>`.balisage;
	host.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
		const m = btn.dataset.mode;
		btn.addEventListener('click', () => go(m ? (m as ModeOrtho) : null));
	});
	host.querySelector('#btnRevoir')!.addEventListener('click', () => goOrthoRevoir(lessonId));
}

/* Prochain mot à travailler, en parcourant cycliquement (on avance même si le
   mot n'a pas été validé, pour ne pas boucler sur le même).
   En phase de découverte (#69), on ne renvoie que des mots pas encore vus à
   l'atelier : toute la liste est découverte avant le moindre entraînement. */
function prochainNonMaitrise(): MotOrtho | null {
	// Mode ciblé : entraînement libre, on tourne sur tous les mots (jamais « fini »).
	if (seanceMode) {
		const m = mots[idx % mots.length];
		idx = (idx + 1) % mots.length;
		return m;
	}
	// Tour de révision : liste déjà acquise → on repasse chaque mot UNE fois, dans
	// l'ordre, puis « fini » (pas de filtre de statut, ils sont tous maîtrisés ;
	// l'activité due sera un mode d'entretien aléatoire via prochaineActivite).
	if (revisionRun) return idx < mots.length ? mots[idx++] : null;
	const enDecouverte = decouverteEnCours(mots);
	for (let k = 0; k < mots.length; k++) {
		const i = (idx + k) % mots.length;
		const aFaire = enDecouverte
			? !mots[i].atelierFait
			: statutMot(mots[i], dispoDictee) !== 'maitrise';
		if (aFaire) {
			idx = (i + 1) % mots.length;
			return mots[i];
		}
	}
	return null;
}

/* La voix peut DISPARAÎTRE en cours de séance : il suffit de passer hors ligne sur
   un appareil dont la seule voix française est distante (#306 §5). On revérifie donc
   avant chaque activité — et jamais dans l'autre sens : une séance ne se remet pas à
   exiger la dictée en cours de route, sinon l'étoile s'éloignerait sous les pieds de
   l'enfant au gré du réseau. */
function reviserDisponibiliteDictee(): void {
	if (dispoDictee && !dicteeDisponible()) dispoDictee = false;
}

/* Écran de sortie quand la dictée ne peut pas parler. Pour une dictée, le TTS n'est
   pas un confort, c'est l'exercice : sans voix la leçon n'est pas dégradée, elle est
   inutilisable. On ne laisse donc pas l'enfant devant un champ muet — il saisirait
   n'importe quoi, et ces réponses partiraient dans le journal de l'espace encadrant
   comme autant de fautes d'orthographe qui n'en sont pas (#391). Le message reprend
   le patron de l'espace encadrant plutôt que d'en inventer un. */
function renderDicteeMuette(): void {
	const retour = retourOrtho("Retour à l'orthographe", 'Retour au programme');
	// Message partagé avec les réglages de l'espace encadrant (cf. `messageSansVoix`) :
	// une seule formulation par cause, et celle du hors-ligne dit bien que la voix
	// revient — un enfant ne doit pas croire que c'est cassé pour de bon.
	const explication = messageSansVoix();
	sheets().innerHTML = html`
    <div class="page ortho-run ortho-bilan">
      <h2>La dictée a besoin du son</h2>
      <p>${icon('speaker')} ${explication}</p>
      <p>Tu peux travailler tes mots autrement : en les regardant, ou avec les lettres à remettre dans l'ordre.</p>
      <div class="ortho-pause-actions">
        <button class="btn-primary" id="btnAutrementDictee">Travailler autrement</button>
        <button class="atelier-undo" id="btnStopDictee">${retour.label}</button>
      </div>
    </div>`.balisage;
	const b = sheets().querySelector('#btnAutrementDictee') as HTMLButtonElement;
	// `dispoDictee` est déjà retombé à false : le parcours proposera un autre mode.
	b.addEventListener('click', () => {
		actes = Math.max(0, actes - 1); // l'activité muette ne compte pas dans la séance
		renderNext();
	});
	sheets().querySelector('#btnStopDictee')!.addEventListener('click', retour.aller);
	b.focus();
}

function renderNext(): void {
	cleanupMotCacheResize(); // on quitte un éventuel mot affiché : plus rien à retracer
	reviserDisponibiliteDictee();
	// La liste vient-elle d'être achevée PENDANT une séance ciblée (#641, critère 4) ? Depuis
	// que le cumul fait monter les mots dans tous les modes, un enfant peut finir sa liste en
	// tuiles ; il doit alors recevoir le bilan « Liste prête ! », et non tourner en boucle ou
	// tomber sur l'écran de pause. D'où la place de ce test AVANT le plafond de séance.
	// Le témoin `listeEtoileeAvant` garde le critère 5 : une liste acquise avant l'ouverture
	// ne rejoue pas sa célébration (le parcours complet, lui, passe par `revisionRun`).
	if (seanceMode && !listeEtoileeAvant && listeEtoilee(mots, dispoDictee)) {
		renderBilan();
		return;
	}
	const word = prochainNonMaitrise();
	if (!word) {
		if (revisionRun) renderRevisionFin();
		else renderBilan();
		return;
	}
	if (actes >= SEANCE_MAX) {
		renderPause();
		return;
	}
	actes++;
	// Mode ciblé : on impose ce mode ; sinon le parcours choisit l'activité due.
	const act = seanceMode ?? prochaineActivite(word, dispoDictee);
	// Le parcours complet a déjà écarté la dictée si elle est muette (`dispoDictee`) ;
	// une séance CIBLÉE sur la dictée, elle, l'impose — c'est ici qu'on l'arrête.
	if (act === 'dictee' && !dispoDictee) {
		renderDicteeMuette();
		return;
	}
	// #641 : cette activité-là pouvait-elle faire monter ce mot ? Posé APRÈS l'écran de
	// dictée muette (une activité qu'on n'a pas pu jouer n'est pas du travail) et AVANT la
	// réponse de l'enfant (rater ne retire pas le crédit du programme du jour). Le parcours
	// complet compte toujours : c'est le trajet entier de la liste, y compris son tour de
	// révision sur une liste déjà acquise, que l'adulte a mis au programme (critère 15).
	if (!seanceMode || activiteProgressive(word, act, dispoDictee)) seanceProgressive = true;
	if (act === 'atelier') {
		renderAtelier(sheets(), word, {
			contexteHTML: contexteHTML(word),
			ecoute: ecouteAtelier(word),
			onDone: () => {
				marquerAtelierFait(word);
				saveOrtho(st);
				renderNext();
			},
		});
	} else if (act === 'tuiles') renderTuiles(word);
	else if (act === 'dictee') renderDictee(word);
	else renderMotCache(word);
}

/* ---------- Affiche / masque ---------- */
function renderMotCache(word: MotOrtho): void {
	const ex = genExerciseOrtho(word, 'motCache');
	let essais = 0;
	sheets().innerHTML = html`
    <div class="page ortho-run">
      <p class="ortho-run-consigne">${word.contexte ? 'Regarde bien le verbe, puis cache-le et écris-le.' : 'Regarde bien ce mot, puis cache-le et écris-le.'}</p>
      ${contexteHTML(word)}
      ${dispoDictee ? html`<div><button class="btn-primary ortho-ecouter" id="btnEcouterMot">${icon('speaker')} ${ecouterLabel(word)}</button></div>` : ''}
      <div class="atelier-stage" id="motStage">
        <div class="ortho-mot-affiche" id="motAffiche">${lettresMotHTML(word.mot)}</div>
        <svg class="atelier-svg" id="motSvg" aria-hidden="true"></svg>
      </div>
      <div><button class="btn-primary" id="btnCacher">Cacher et écrire →</button></div>
      <div class="ortho-saisie" id="zoneSaisie" hidden>
        <input class="ortho-input" id="orthoInput" ${TEXT_ANSWER_INPUT_ATTRS}
               aria-label="Écris le mot" />
        <div class="accent-kb" id="accentKb"></div>
        <button class="btn-primary" id="btnVerifMot">✓ Vérifier</button>
      </div>
      <div class="ortho-feedback" id="fb"></div>
    </div>`.balisage;
	const motStage = sheets().querySelector('#motStage') as HTMLElement;
	const motAffiche = sheets().querySelector('#motAffiche') as HTMLElement;
	const motSvg = sheets().querySelector('#motSvg') as unknown as SVGSVGElement;
	const btnCacher = sheets().querySelector('#btnCacher') as HTMLButtonElement;
	const zone = sheets().querySelector('#zoneSaisie') as HTMLElement;
	const input = sheets().querySelector('#orthoInput') as HTMLInputElement;
	const fb = sheets().querySelector('#fb') as HTMLElement;

	renderAccentKb(sheets().querySelector('#accentKb') as HTMLElement, input);

	// Rappel visuel des pièges (#263) : si l'enfant a entouré des lettres à l'atelier,
	// on les retrace ici en LECTURE SEULE (mêmes couleurs/rendu que l'atelier et la
	// relecture) tant que le mot est affiché. `ajusterTailleMot` garde un mot long dans
	// le cadre ; on retrace au resize (offsets dépendants de la mise en page) et une
	// fois les polices prêtes (premier rendu). Nettoyé dès qu'on cache le mot.
	const retracer = (): void => {
		ajusterTailleMot(motAffiche, motStage);
		if (word.entourage.length) dessinerEntourages(motAffiche, motSvg, word.entourage);
	};
	retracer();
	void document.fonts?.ready?.then(retracer);
	motCacheResize = retracer;
	window.addEventListener('resize', motCacheResize);

	// Écoute du mot (#150) : disponible avant ET après l'avoir caché (le bouton est
	// hors des éléments masqués) — entendre la prononciation aide à l'écrire.
	if (dispoDictee) {
		sheets()
			.querySelector('#btnEcouterMot')!
			.addEventListener('click', () => ecouterCible(word));
	}

	btnCacher.addEventListener('click', () => {
		cleanupMotCacheResize(); // mot caché : plus d'entourages à retracer
		motStage.style.display = 'none';
		btnCacher.style.display = 'none';
		zone.hidden = false;
		input.focus();
	});

	const verifier = () => {
		if (checkAnswer(ex, input.value)) {
			reussiteMode(word, 'motCache');
			// Réussite : « Vérifier » s'efface, seul « Continuer → » reste (pas deux boutons, #153).
			(sheets().querySelector('#btnVerifMot') as HTMLButtonElement).hidden = true;
			input.readOnly = true;
			reussite(fb, true);
		} else {
			if (essais === 0) journalErreurOrtho(word, input.value); // 1er essai raté
			essais++;
			if (essais < 2) {
				fb.innerHTML =
					html`<span class="fb-ko">Presque ! Regarde bien et réessaie.</span>`.balisage;
				input.value = '';
				input.focus();
			} else {
				// 2e erreur : on bascule sur l'atelier de correction (diff sur le mot). Le
				// retrace du mot affiché a déjà été coupé au clic « Cacher » (on n'arrive
				// ici qu'après), donc `motCacheResize` est déjà nul — rien à nettoyer.
				noterMotDifficile(word); // ce mot a demandé un étayage (#618)
				const diff = diffCorrect(input.value, word.mot);
				renderAtelier(sheets(), word, {
					contexteHTML: contexteHTML(word),
					ecoute: ecouteAtelier(word),
					onDone: () => {
						saveOrtho(st);
						renderNext();
					},
					diff,
					consigne: "Regarde où tu t'es trompé, puis entoure le piège.",
				});
			}
		}
	};
	sheets().querySelector('#btnVerifMot')!.addEventListener('click', verifier);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') verifier();
	});
}

/* ---------- Dictée (TTS) ---------- */
function renderDictee(word: MotOrtho): void {
	const ex = genExerciseOrtho(word, 'dictee');
	let essais = 0;
	sheets().innerHTML = html`
    <div class="page ortho-run">
      <p class="ortho-run-consigne">${word.contexte ? 'Écoute la phrase, puis écris seulement le verbe.' : 'Écoute le mot, puis écris-le.'}</p>
      ${contexteHTML(word)}
      <button class="btn-primary ortho-ecouter" id="btnEcouter">${icon('speaker')} ${ecouterLabel(word)}</button>
      <div class="ortho-saisie">
        <input class="ortho-input" id="orthoInput" ${TEXT_ANSWER_INPUT_ATTRS}
               aria-label="${word.contexte ? 'Écris le verbe' : 'Écris le mot'}" />
        <div class="accent-kb" id="accentKb"></div>
        <button class="btn-primary" id="btnVerifMot">✓ Vérifier</button>
      </div>
      <div class="ortho-feedback" id="fb"></div>
    </div>`.balisage;
	const input = sheets().querySelector('#orthoInput') as HTMLInputElement;
	const fb = sheets().querySelector('#fb') as HTMLElement;
	renderAccentKb(sheets().querySelector('#accentKb') as HTMLElement, input);

	// Filet de sécurité (#306 §5) : l'énoncé peut échouer alors que la voix semblait
	// utilisable (voix distante coupée en plein vol, moteur en panne). L'enfant se
	// retrouverait à écrire sans avoir rien entendu — et sa saisie au hasard finirait
	// dans le journal de l'espace encadrant. On coupe court : plus de dictée pour
	// cette séance, aucune journalisation, et l'écran de sortie prend la main.
	let muette = false;
	const surSilence = (): void => {
		if (muette) return;
		muette = true;
		dispoDictee = false;
		renderDicteeMuette();
	};
	const ecouter = () => ecouterCible(word, surSilence);
	sheets().querySelector('#btnEcouter')!.addEventListener('click', ecouter);

	const verifier = () => {
		if (muette) return; // dictée silencieuse : on ne corrige ni ne journalise
		if (checkAnswer(ex, input.value)) {
			reussiteMode(word, 'dictee');
			// Réussite : « Vérifier » s'efface, seul « Continuer → » reste (pas deux boutons, #153).
			(sheets().querySelector('#btnVerifMot') as HTMLButtonElement).hidden = true;
			input.readOnly = true;
			reussite(fb, true);
		} else {
			if (essais === 0) journalErreurOrtho(word, input.value); // 1er essai raté
			essais++;
			if (essais < 2) {
				fb.innerHTML = html`<span class="fb-ko">Presque ! Réécoute et réessaie.</span>`.balisage;
				input.value = '';
				input.focus();
				ecouter();
			} else {
				noterMotDifficile(word); // ce mot a demandé un étayage (#618)
				const diff = diffCorrect(input.value, word.mot);
				renderAtelier(sheets(), word, {
					contexteHTML: contexteHTML(word),
					ecoute: ecouteAtelier(word),
					onDone: () => {
						saveOrtho(st);
						renderNext();
					},
					diff,
					consigne: word.contexte
						? "Regarde le verbe et où tu t'es trompé, puis entoure le piège."
						: "Regarde le mot et où tu t'es trompé, puis entoure le piège.",
				});
			}
		}
	};
	sheets().querySelector('#btnVerifMot')!.addEventListener('click', verifier);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') verifier();
	});
	// Lecture auto EN DERNIER (peut être bloquée tant qu'il n'y a pas eu de geste).
	// Après le câblage, et pas avant : en cas d'échec, `surSilence` remplace tout le DOM
	// de l'écran par celui de la dictée muette. Déclenchée plus haut, elle laisserait les
	// `querySelector(...)!` suivants chercher des éléments qui n'existent plus.
	ecouter();
}

/* ---------- Tuiles ---------- */
// Réordonnancement des tuiles : insertAt/removeAt/moveAt vivent désormais dans
// core/utils.ts (logique pure testable sans DOM, #374) et sont importés ci-dessus.

// Au-delà de ce déplacement (px) un geste devient un glisser ; en dessous, c'est
// un tap. Volontairement élevé : un tap « propre » de CE2 dérive de 8-15 px.
const DRAG_THRESHOLD = 18;

function renderTuiles(word: MotOrtho): void {
	const ex = genExerciseOrtho(word, 'tuiles');
	const lettres = ex.type === 'tuiles' ? ex.lettres : [];
	let assembled: number[] = []; // indices dans `lettres`, dans l'ordre posé
	let caret = 0; // position d'insertion (0..assembled.length) ; défaut = fin du mot
	let sel: number | null = null; // tuile posée sélectionnée (exclusif avec le curseur)
	const label = (l: string) => (l === ' ' ? '␣' : l);
	const glyph = (l: string) => (l === ' ' ? '␣' : l); // pour textContent (fantôme)

	sheets().innerHTML = html`
    <div class="page ortho-run">
      <p class="ortho-run-consigne">${word.contexte ? 'Remets les lettres du verbe dans le bon ordre.' : 'Remets les lettres dans le bon ordre.'}
        <span class="ortho-run-astuce">Tape entre deux lettres pour choisir où écrire.</span></p>
      ${contexteHTML(word)}
      ${dispoDictee ? html`<div><button class="btn-primary ortho-ecouter" id="btnEcouterTuiles">${icon('speaker')} ${ecouterLabel(word)}</button></div>` : ''}
      <p class="tuiles-titre">${word.contexte ? 'Le verbe' : 'Ton mot'}</p>
      <div class="tuiles-construction" id="construction"></div>
      <p class="tuiles-titre">Les lettres</p>
      <div class="tuiles-bac" id="bac"></div>
      <button class="btn-primary" id="btnVerifTuiles">✓ Vérifier</button>
      <div class="ortho-feedback" id="fb"></div>
    </div>`.balisage;
	const construction = sheets().querySelector('#construction') as HTMLElement;
	const bac = sheets().querySelector('#bac') as HTMLElement;
	const fb = sheets().querySelector('#fb') as HTMLElement;
	if (dispoDictee) {
		sheets()
			.querySelector('#btnEcouterTuiles')!
			.addEventListener('click', () => ecouterCible(word));
	}
	monterBoutonAide(sheets().querySelector('.ortho-run'), 'lettres'); // bouton « ? » persistant (#272)

	// --- Rendu ---
	function slotHTML(pos: number): SafeHtml {
		const actif = sel === null && caret === pos;
		return html`<button type="button" class="tuile-slot${actif ? ' is-caret' : ''}" data-slot="${pos}" aria-label="Insérer ici"><span class="tuile-curseur"></span></button>`;
	}
	function poseHTML(posLettre: number): SafeHtml {
		const i = assembled[posLettre];
		if (sel !== posLettre) {
			return html`<button type="button" class="tuile tuile-pose" data-pos="${posLettre}">${label(lettres[i])}</button>`;
		}
		const auDebut = posLettre === 0;
		const aLaFin = posLettre === assembled.length - 1;
		return html`
      <span class="tuile-cell sel">
        <span class="tuile-controls">
          <button type="button" class="tuile-fleche${auDebut ? ' is-disabled' : ''}" data-act="left" aria-label="Déplacer à gauche"${auDebut ? drapeau('disabled') : ''}>◀</button>
          <button type="button" class="tuile-fleche${aLaFin ? ' is-disabled' : ''}" data-act="right" aria-label="Déplacer à droite"${aLaFin ? drapeau('disabled') : ''}>▶</button>
          <button type="button" class="tuile-retirer" data-act="remove">↩ enlever</button>
        </span>
        <button type="button" class="tuile tuile-pose sel" data-pos="${posLettre}">${label(lettres[i])}</button>
      </span>`;
	}
	function redraw(): void {
		// Mot en construction : slot, tuile, slot, tuile, …, slot final.
		let contenu = slotHTML(0);
		for (let p = 0; p < assembled.length; p++)
			contenu = html`${contenu}${poseHTML(p)}${slotHTML(p + 1)}`;
		construction.innerHTML = contenu.balisage;
		construction.classList.toggle('vide', assembled.length === 0);
		// Bac : lettres encore disponibles (les posées restent là mais masquées).
		bac.innerHTML = joindre(
			lettres.map((l, i) =>
				assembled.includes(i)
					? html`<button type="button" class="tuile tuile-used" disabled>${label(l)}</button>`
					: html`<button type="button" class="tuile" data-i="${i}">${label(l)}</button>`,
			),
		).balisage;
	}

	// --- Actions (taps : souris, clavier et tap tactile passent par le click) ---
	function insertLettre(i: number): void {
		assembled = insertAt(assembled, caret, i);
		caret += 1;
		sel = null;
		redraw();
	}
	function poseCaret(pos: number): void {
		caret = pos;
		sel = null;
		redraw();
	}
	function selectPose(pos: number): void {
		sel = sel === pos ? null : pos; // re-tap = désélection
		redraw();
	}
	function deplacer(dir: -1 | 1): void {
		if (sel === null) return;
		const to = sel + dir;
		if (to < 0 || to >= assembled.length) return;
		assembled = moveAt(assembled, sel, to);
		sel = to;
		redraw();
	}
	function retirer(): void {
		if (sel === null) return;
		assembled = removeAt(assembled, sel);
		sel = null;
		caret = Math.min(caret, assembled.length);
		redraw();
	}

	let justDragged = false; // neutralise le click synthétique qui suit un glisser
	construction.addEventListener('click', (e) => {
		if (justDragged) {
			justDragged = false;
			return;
		}
		const t = (e.target as HTMLElement).closest('button');
		if (!t) return;
		const act = t.dataset.act;
		if (act === 'left') deplacer(-1);
		else if (act === 'right') deplacer(1);
		else if (act === 'remove') retirer();
		else if (t.dataset.slot !== undefined) poseCaret(Number(t.dataset.slot));
		else if (t.dataset.pos !== undefined) selectPose(Number(t.dataset.pos));
	});
	bac.addEventListener('click', (e) => {
		if (justDragged) {
			justDragged = false;
			return;
		}
		const t = (e.target as HTMLElement).closest('.tuile') as HTMLElement | null;
		if (!t || t.dataset.i === undefined) return;
		insertLettre(Number(t.dataset.i));
	});

	// --- Couche glisser-déposer (raccourci « bonus », par-dessus les taps) ---
	type Source = { type: 'bac' | 'pose'; index: number; el: HTMLElement };
	let pending: { src: Source | null; x: number; y: number; pid: number } | null = null;
	let dragging = false;
	let ghost: HTMLElement | null = null;
	let dropSlot: number | null = null;

	function sourceFrom(target: HTMLElement): Source | null {
		const pose = target.closest('.tuile-pose') as HTMLElement | null;
		if (pose && pose.dataset.pos !== undefined)
			return { type: 'pose', index: Number(pose.dataset.pos), el: pose };
		const bacTile = target.closest('.tuiles-bac .tuile') as HTMLElement | null;
		if (bacTile && bacTile.dataset.i !== undefined && !bacTile.classList.contains('tuile-used'))
			return { type: 'bac', index: Number(bacTile.dataset.i), el: bacTile };
		return null;
	}
	const lettreDe = (src: Source) =>
		src.type === 'bac' ? lettres[src.index] : lettres[assembled[src.index]];
	const clearDrop = () =>
		construction
			.querySelectorAll('.tuile-slot.is-drop')
			.forEach((s) => s.classList.remove('is-drop'));
	function majDropSlot(x: number, y: number): void {
		const el = document.elementFromPoint(x, y) as HTMLElement | null;
		const slot = el?.closest('.tuile-slot') as HTMLElement | null;
		const pose = el?.closest('.tuile-pose') as HTMLElement | null;
		let p: number | null = null;
		if (slot && slot.dataset.slot !== undefined) p = Number(slot.dataset.slot);
		else if (pose && pose.dataset.pos !== undefined) {
			const r = pose.getBoundingClientRect();
			p = Number(pose.dataset.pos) + (x > r.left + r.width / 2 ? 1 : 0);
		}
		clearDrop();
		dropSlot = p;
		if (p !== null)
			construction.querySelector(`.tuile-slot[data-slot="${p}"]`)?.classList.add('is-drop');
	}
	function endDrag(): void {
		dragging = false;
		ghost?.remove();
		ghost = null;
		clearDrop();
		dropSlot = null;
		document.querySelectorAll('.tuile-source').forEach((s) => s.classList.remove('tuile-source'));
	}

	const onDown = (e: PointerEvent): void => {
		// Si un glisser précédent n'a pas été suivi d'un click (variable selon les
		// navigateurs tactiles), on purge le drapeau ici pour ne pas avaler ce tap.
		justDragged = false;
		pending = {
			src: sourceFrom(e.target as HTMLElement),
			x: e.clientX,
			y: e.clientY,
			pid: e.pointerId,
		};
	};
	const onMove = (e: PointerEvent): void => {
		if (!pending || pending.pid !== e.pointerId || !pending.src) return;
		if (!dragging) {
			if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < DRAG_THRESHOLD) return;
			dragging = true;
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			pending.src.el.classList.add('tuile-source');
			ghost = document.createElement('div');
			ghost.className = 'tuile-ghost';
			ghost.textContent = glyph(lettreDe(pending.src));
			document.body.appendChild(ghost);
		}
		e.preventDefault();
		if (ghost) {
			ghost.style.left = `${e.clientX}px`;
			ghost.style.top = `${e.clientY}px`;
		}
		majDropSlot(e.clientX, e.clientY);
	};
	const onUp = (e: PointerEvent): void => {
		if (!pending || pending.pid !== e.pointerId) return;
		if (dragging && pending.src && dropSlot !== null) {
			const src = pending.src;
			if (src.type === 'bac') {
				assembled = insertAt(assembled, dropSlot, src.index);
				caret = Math.min(dropSlot + 1, assembled.length);
			} else {
				assembled = moveAt(assembled, src.index, dropSlot > src.index ? dropSlot - 1 : dropSlot);
			}
			sel = null;
			justDragged = true; // le click qui suit le glisser ne doit pas re-déclencher un tap
			endDrag();
			redraw();
		} else if (dragging) {
			endDrag();
		}
		pending = null;
	};
	for (const zone of [construction, bac]) {
		zone.addEventListener('pointerdown', onDown);
		zone.addEventListener('pointermove', onMove);
		zone.addEventListener('pointerup', onUp);
		zone.addEventListener('pointercancel', onUp);
	}

	redraw();

	let erreurLoggee = false; // journal d'erreurs (#391) : une seule capture par mot
	const verifier = (): void => {
		const built = assembled.map((i) => lettres[i]).join('');
		if (checkAnswer(ex, built)) {
			reussiteMode(word, 'tuiles');
			// Réussite : « Vérifier » s'efface, seul « Continuer → » reste (pas deux boutons, #153).
			(sheets().querySelector('#btnVerifTuiles') as HTMLButtonElement).hidden = true;
			reussite(fb, true);
		} else {
			if (!erreurLoggee) {
				journalErreurOrtho(word, built); // 1er essai raté
				erreurLoggee = true;
			}
			fb.innerHTML = html`<span class="fb-ko">Pas tout à fait, réessaie.</span>`.balisage;
		}
	};
	sheets().querySelector('#btnVerifTuiles')!.addEventListener('click', verifier);

	maybeAutoAide('lettres'); // bulle d'aide au 1er lancement (une fois par profil)
}

/* Journalise UNE session d'orthographe (#319) au 1er écran terminal atteint (bilan,
   révision terminée ou pause) ; le flag évite de re-compter un « Continuer encore ».
   La LISTE travaillée est jointe (#498) : c'est elle qui permet au programme du jour
   d'attribuer son étape « dictée » ou « à revoir » à ce qui a réellement été fait, sans
   dépendre du bouton par lequel l'enfant est arrivé. */
function journalOrthoSession(): void {
	if (orthoJournalisee) return;
	orthoJournalisee = true;
	const now = Date.now(); // un seul instant pour les deux journaux de cette session
	recordSessionActivity('dictee', orthoLessonId || undefined, seanceProgressive);
	// Franchissements d'état des listes (#541) : ce qui donne à une dictée la frise d'évolution
	// des leçons. Toutes les listes sont réévaluées, pas seulement celle jouée — les mots sont
	// partagés (cf. journaliserPaliersOrtho). `dispoDictee` = ce que l'enfant avait vraiment.
	journaliserPaliersOrtho(dispoDictee, now);
}

/* Retour de fin de séance d'orthographe : le programme du jour si la dictée en a été
   lancée (#461), sinon la catégorie Orthographe. Le libellé « catalogue » varie selon
   l'écran (bilan, révision terminée, pause), d'où le paramètre. */
function retourOrtho(labelCatalogue: string, labelProgramme?: string) {
	return retourFinActivite(
		{ label: labelCatalogue, aller: () => goCategorie(ORTHO_CATEGORY_ID) },
		labelProgramme,
	);
}

/* ---------- Bilan ---------- */
function renderBilan(): void {
	journalOrthoSession();
	const total = mots.length;
	const retour = retourOrtho("Retour à l'orthographe");
	// Rappel des mots qui ont résisté (#618) : au bilan, TOUS ceux passés par la
	// correction guidée pendant la séance, sans filtre de statut. À cet instant ils sont
	// maîtrisés par construction — c'est la condition même d'affichage de cet écran —,
	// donc ce qui est nommé vient de l'historique de la séance et se dit sous l'angle de
	// l'effort fourni, jamais de la fragilité.
	const difficiles = motsDifficiles;
	sheets().innerHTML = html`
    <div class="page ortho-run ortho-bilan">
      ${mascotteBulleHTML(encouragementMascotte())}
      <div class="ortho-bilan-emoji">🎉</div>
      <h2>Liste prête !</h2>
      <p>Tu as bien travaillé ${total > 1 ? html`les <b>${total}</b> mots` : 'le mot'} de cette liste.</p>
      ${motsDifficilesHTML(difficiles, 'bilan', 'ortho-difficiles')}
      <button class="btn-primary" id="btnBilanRetour">${retour.label}</button>
    </div>`.balisage;
	sheets().querySelector('#btnBilanRetour')!.addEventListener('click', retour.aller);
	bindMotsDifficiles(sheets(), () => relireMotsDifficiles(difficiles));

	// Récompenses : l'étoile « Liste prête », plus trophées éventuels + montée de niveau.
	annoncerRecompensesFin([{ icon: '🌟', text: 'Liste prête, bravo !' }]);
}

/* ---------- Fin d'un tour de révision (liste déjà maîtrisée) ----------
   La liste est déjà acquise : on NE rejoue PAS la célébration « Liste prête ! »
   (l'étoile est gagnée), mais un bilan de révision plus sobre. On annonce tout de
   même les récompenses légitimement gagnées pendant la révision (trophées, montée
   de niveau due à l'XP), sans la fausse étoile de première complétion. */
function renderRevisionFin(): void {
	journalOrthoSession();
	const total = mots.length;
	const retour = retourOrtho("Retour à l'orthographe");
	sheets().innerHTML = html`
    <div class="page ortho-run ortho-bilan">
      ${mascotteBulleHTML(encouragementMascotte())}
      <div class="ortho-bilan-emoji">✅</div>
      <h2>Révision terminée !</h2>
      <p>Tu as révisé ${total > 1 ? html`les <b>${total}</b> mots` : 'le mot'} de cette liste.</p>
      <button class="btn-primary" id="btnBilanRetour">${retour.label}</button>
    </div>`.balisage;
	sheets().querySelector('#btnBilanRetour')!.addEventListener('click', retour.aller);
	annoncerRecompensesFin([]); // pas d'étoile : seulement trophées/niveau réellement gagnés
}

/* Annonce les récompenses obtenues sur un écran de fin — bilan, révision terminée, ou pause
   d'une séance qui n'aura pas de bilan (mode ciblé, révision) : trophées
   nouvellement débloqués + éventuelle montée de niveau (modale + confettis). `celebBase`
   = entrées de célébration toujours montrées (l'étoile « Liste prête » du parcours
   complet) ; vide en révision, où l'on ne célèbre que ce qui a réellement été gagné. */
function annoncerRecompensesFin(celebBase: { icon: string; text: string }[]): void {
	const newTrophies = evaluateTrophies();
	const celeb = [
		...celebBase,
		...newTrophies.map((t) => ({ icon: t.icon, text: `Trophée : ${t.title}` })),
	];
	const niveauApres = niveauDepuisXP(getXP());
	const niveauGagne = niveauApres > niveauAvant ? niveauApres : 0;
	const recompensesNiv = recompensesEntre(niveauAvant, niveauApres);
	niveauAvant = niveauApres;
	announceRewards(niveauGagne, recompensesNiv, celeb);
}

/* ---------- Pause de séance (rythme adapté à un CE2) ---------- */
function renderPause(): void {
	journalOrthoSession();
	// Bouton d'arrêt : garde son libellé « intention » hors programme ; depuis le
	// programme, il annonce où il ramène (#461).
	const retour = retourOrtho('Revenir une autre fois', 'Revenir au programme');
	// Rappel des mots qui ont résisté (#618) : à la pause, seuls ceux qui donnent ENCORE
	// du travail. Un mot passé par la correction guidée puis validé avant la pause n'y est
	// pas nommé — il relève du bilan, sous l'angle de l'effort fourni. Depuis #641 le statut
	// lu ici tient compte du travail de la séance dans TOUS les modes (`reussiteMode` valide
	// désormais partout), et non plus du seul parcours complet.
	const difficiles = motsDifficiles.filter((m) => statutMot(m, dispoDictee) !== 'maitrise');
	sheets().innerHTML = html`
    <div class="page ortho-run ortho-bilan">
      <div class="ortho-bilan-emoji">👏</div>
      <h2>Bonne séance !</h2>
      <p>Tu as bien travaillé. Tu peux continuer encore un peu ou revenir une autre fois.</p>
      ${messageModesTerminesHTML()}
      ${motsDifficilesHTML(difficiles, 'pause', 'ortho-difficiles')}
      <div class="ortho-pause-actions">
        <button class="btn-primary" id="btnContinuerSeance">Continuer encore un peu</button>
        <button class="atelier-undo" id="btnStopSeance">${retour.label}</button>
      </div>
    </div>`.balisage;
	const b = sheets().querySelector('#btnContinuerSeance') as HTMLButtonElement;
	b.addEventListener('click', () => {
		actes = 0;
		renderNext();
	});
	sheets().querySelector('#btnStopSeance')!.addEventListener('click', retour.aller);
	bindMotsDifficiles(sheets(), () => relireMotsDifficiles(difficiles));
	b.focus();
	// Hors parcours de première complétion (mode ciblé ou révision), il n'y a pas de bilan
	// d'étoile → la pause EST l'écran de fin, et doit donc annoncer ce qui a été gagné.
	// Depuis #641 cela inclut les TROPHÉES : un mode ciblé fait monter les mots, donc décroche
	// « Première liste » comme le parcours complet ; les laisser à l'accueil, c'est ne rien
	// annoncer au moment où l'enfant l'a mérité. Sans étoile ajoutée : elle appartient au bilan.
	if (seanceMode || revisionRun) annoncerRecompensesFin([]);
}

/* Message de fin (#641, critère 12) : un mode d'entraînement dont le DERNIER mot vient d'être
   franchi pendant cette séance. Sans lui, le bouton quitte simplement la zone principale de
   l'écran de choix à la prochaine visite, ce qui se lit comme une perte ou un bug.
   Posé à la PAUSE seulement : quand la séance étoile la liste, c'est le bilan « Liste prête ! »
   qui s'affiche, et la célébration prime — aucune annonce ne s'y empile (critère 13).
   On dit « ce mode » sans le nommer : à cet instant l'enfant n'a pas eu le libellé du bouton
   de choix sous les yeux. Le mot « terminé » plutôt qu'« épuisé », et la mention des points,
   pour ne pas laisser croire à un bouton mort. */
function messageModesTerminesHTML(): SafeHtml {
	const apres = modesEpuises(mots, dispoDictee);
	const finis = modesEpuisesPendant(modesEpuisesAvant, apres);
	// Le témoin avance : la nouvelle ne s'annonce qu'UNE fois. « Continuer encore un peu »
	// poursuit la MÊME séance et repasserait sinon par ici à chaque pause.
	modesEpuisesAvant = apres;
	if (!finis.length) return VIDE;
	// Le cumul peut faire basculer PLUSIEURS modes d'un coup (réussir le mot caché du dernier
	// mot valide aussi ses tuiles) : l'accord suit, le message reste unique.
	// Le pluriel n'est pas l'accord mécanique du singulier : « tous les mots » et « ces modes »
	// y seraient deux antécédents masculins pluriels concurrents, et « tu LES retrouveras un peu
	// plus bas » se lirait aussi bien « les mots » — lecture cohérente, puisque l'écran de choix
	// propose bien de retrouver des mots plus bas. « toute cette liste » a la même portée (elle
	// reste bornée par « avec ces modes ») et ne laisse qu'un seul nom pluriel dans la phrase.
	// Pas de NUMÉRAL non plus (« ces deux modes ») : le compte peut valoir trois.
	const texte =
		finis.length > 1
			? 'Tu as fini toute cette liste avec ces modes ! La prochaine fois, tu les retrouveras un peu plus bas, et ils te donneront toujours des points.'
			: 'Tu as fini tous les mots de cette liste avec ce mode ! La prochaine fois, tu le retrouveras un peu plus bas, et il te donnera toujours des points.';
	// `role="status"` : même situation que le bloc VOISIN de cet écran (`motsDifficilesHTML`,
	// ui/mots-difficiles-view.ts) — la pause est rendue d'un coup par `innerHTML`, puis le
	// focus part droit sur « Continuer encore un peu », qui suit ce message dans le DOM. Sans
	// annonce, un enfant au lecteur d'écran n'apprendrait jamais qu'il a terminé un mode, ni
	// qu'il rapporte toujours des points, ni où le retrouver — soit tout ce que le critère 12
	// demande de dire. `aria-atomic` fait relire la phrase entière plutôt que le seul nœud
	// modifié.
	return html`<p class="ortho-mode-epuise" role="status" aria-atomic="true">${icon('check-circle')} ${texte}</p>`;
}

/* ---------- Helpers ---------- */
/* « Relire ces mots » (#618) : ouvre la page de relecture RESTREINTE aux mots qui ont
   résisté. La liste travaillée est passée : la relecture garde alors son sous-titre et
   la provenance d'activité (#461), donc son bouton « Retour » ramène là d'où l'enfant
   vient — catalogue ou programme du jour. */
function relireMotsDifficiles(difficiles: readonly MotOrtho[]): void {
	goOrthoRevoirMots(
		difficiles.map((m) => m.id),
		orthoLessonId,
	);
}

/* Réussite d'un mode : +1 XP et validation du mode, DANS TOUS LES MODES DE SÉANCE (#641).
   Le garde `if (!seanceMode)` qui vivait ici est le bug d'origine : l'enfant qui prenait
   systématiquement le mode le plus étayé encaissait son XP et cochait son programme sans
   qu'aucun mot ne monte d'un cran — l'appli lui confirmait par ses deux seuls signaux
   visibles un travail qu'elle ne comptait nulle part. Le cumul est dans `validerMode` :
   valider la dictée d'un mot valide aussi tout ce qui est plus étayé. */
function reussiteMode(word: MotOrtho, mode: ModeOrtho): void {
	validerMode(word, mode);
	saveOrtho(st);
	addXP(1);
}

function reussite(fb: HTMLElement, xpGagne = false): void {
	const xp = xpGagne ? html` <span class="fb-xp">+1 XP</span>` : VIDE;
	fb.innerHTML = html`<span class="fb-ok">Bravo ! 🎉</span>${xp} `.balisage;
	boutonContinuer(fb);
}

function boutonContinuer(fb: HTMLElement): void {
	const b = document.createElement('button');
	b.className = 'btn-primary';
	b.textContent = 'Continuer →';
	b.addEventListener('click', renderNext);
	fb.appendChild(b);
	b.focus(); // la touche Entrée enchaîne sur la suite
}

function renderAccentKb(container: HTMLElement, input: HTMLInputElement): void {
	container.innerHTML = joindre(
		ACCENTS.map((c) => html`<button type="button" class="accent-key" data-c="${c}">${c}</button>`),
	).balisage;
	container
		.querySelectorAll<HTMLButtonElement>('.accent-key')
		.forEach((b) => b.addEventListener('click', () => insertAtCursor(input, b.dataset.c ?? '')));
}

function insertAtCursor(input: HTMLInputElement, text: string): void {
	const start = input.selectionStart ?? input.value.length;
	const end = input.selectionEnd ?? input.value.length;
	input.value = input.value.slice(0, start) + text + input.value.slice(end);
	const pos = start + text.length;
	input.setSelectionRange(pos, pos);
	input.focus();
}
