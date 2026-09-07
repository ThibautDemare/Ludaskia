/* ============================================================
   Mode Orthographe — runner d'entraînement (couche UI).
   Boucle : on prend le prochain mot non maîtrisé, on rend l'activité
   qui lui correspond (atelier -> tuiles -> affiche/masque -> dictée),
   on enregistre le résultat, on enchaîne. Quand tous les mots sont
   maîtrisés -> bilan.

   Les RENDUS des trois marches (tuiles, mot caché, dictée) vivent depuis #640
   dans `ui/ortho-taches.ts` : la révision espacée sert les mêmes, et une tâche
   par marche est la seule façon d'empêcher les deux chemins de re-diverger. Ce
   qui reste ici, c'est ce que le PARCOURS décide (cf. `optionsTacheParcours`) :
   le tour de piste, le plafond de séance, l'XP, le journal, les écrans de fin.
   L'atelier, lui, est mutualisé depuis plus longtemps (`ui/ortho-atelier.ts`).
   ============================================================ */
import { loadOrtho, saveOrtho, getListe } from '../core/orthographe/store';
import { materialiserVerbes } from '../core/orthographe/verbes';
import { motsDeLecon } from '../core/orthographe/lessons';
import { ORTHO_MODE_OPTIONS } from '../core/orthographe/exercise';
import { type ModeOption } from '../core/exercise';
import {
	statutMot,
	prochaineActivite,
	activiteProgressive,
	marquerAtelierFait,
	validerMode,
	decouverteEnCours,
	listeEtoilee,
	marcheLaPlusHaute,
} from '../core/orthographe/runner';
import { modesEpuises, modesEpuisesPendant } from '../core/orthographe/choix-mode';
import { avancementLecon } from '../core/orthographe/progression';
import type { MotOrtho, OrthoState, ModeOrtho } from '../core/orthographe/types';
import { diffCorrect } from '../core/orthographe/diff';
import { addXP, getXP, niveauDepuisXP, recordSessionActivity } from '../core/progress';
import { journaliserPaliersOrtho } from '../core/orthographe/paliers';
import { ORTHO_CATEGORY_ID } from '../core/catalog';
import { goCategorie, goOrthoRevoir, goOrthoRevoirMots } from './navigation';
import { motsDifficilesHTML, bindMotsDifficiles } from './mots-difficiles-view';
import { retourFinActivite, activiteDemarree } from './retour-activite';
import { renderAtelier } from './ortho-atelier';
import {
	monterTacheOrtho,
	nettoyerTaches,
	contexteHTML,
	ecouteAtelier,
	type OptionsTache,
} from './ortho-taches';
import { recompensesFin, type CelebEntry } from '../core/recompenses-fin';
import { announceRewards } from './effects';
import { mascotteBulleHTML, encouragementMascotte } from './unlocks-view';
import { dicteeDisponible, messageSansVoix } from './tts';
import { icon, iconOr } from './icon';
import { capterErreur } from './erreur-capture';
import { html, attribut, type SafeHtml, joindre, VIDE } from '../core/html';

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

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
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
function coutSeanceHTML(n = SEANCE_MAX): SafeHtml {
	return html`<span class="mode-btn-cout">${n} ${n > 1 ? 'activités' : 'activité'}</span>`;
}

/* L'intérieur d'un bouton de l'écran de choix — icône, libellé, badge, coût. Les trois
   boutons (mode ciblé, parcours complet, marche promue) ne diffèrent que par ces quatre
   fentes et par leurs attributs ; passer par un contenu commun évite qu'un champ ajouté
   plus tard n'atterrisse que dans deux d'entre eux. */
function contenuBoutonHTML(ico: SafeHtml, label: string, badge: SafeHtml, cout: SafeHtml) {
	return html`<span class="mode-btn-ico">${ico}</span>
        <span class="mode-btn-txt">
          <span class="mode-btn-label">${label}</span>
          ${badge}${cout}
        </span>`;
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
        ${contenuBoutonHTML(iconOr(m.icon), m.label, badge, coutSeanceHTML())}
      </button>`;
}

/* Le bouton de tête de l'écran de choix. `marche` non nulle = liste entièrement acquise
   (#658) : le bouton lance toujours le même tour (`data-mode=""`), mais il annonce la tâche
   qu'il va réellement servir au lieu de « Le parcours complet », et son badge retombe sur le
   simple « conseillé » de tous les modes recommandés de l'app — le « · donne l'étoile » était
   l'exception, justifiée par un enjeu qui n'existe plus ici.

   `data-marche` porte la marche visée pour qui teste l'écran : le libellé, lui, appartient au
   mode et peut être réécrit sans que le sens du bouton change.

   Le coût annoncé est celui du tour réellement servi — un mot, une activité, plafonné à la
   séance. `nbMots` compte les mots ATTENDUS, cibles VERBE (#261) comprises : les compter sur
   les seuls `motIds` sous-estimait le tour d'une liste à verbes. */
function teteHTML(marche: ModeOrtho | null, nbMots: number): SafeHtml {
	if (!marche)
		return html`<button class="mode-btn recommended" data-mode="">
        ${contenuBoutonHTML(
					icon('star', { cls: 'ph-star' }),
					'Le parcours complet',
					html`<span class="mode-btn-badge">conseillé · donne l'étoile</span>`,
					coutSeanceHTML(),
				)}
      </button>`;
	const option = ORTHO_MODE_OPTIONS.find((m) => m.id === marche)!;
	return html`<button class="mode-btn recommended" data-mode=""${attribut('data-marche', marche)}>
        ${contenuBoutonHTML(
					iconOr(option.icon),
					option.label,
					html`<span class="mode-btn-badge">conseillé</span>`,
					coutSeanceHTML(Math.min(SEANCE_MAX, nbMots)),
				)}
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
	// Liste entièrement acquise (#658) : derrière « Le parcours complet » il n'y a plus le
	// parcours mais un TOUR DE RÉVISION, qui repasse chaque mot une fois. Le bouton de tête
	// dit donc ce qu'il fait vraiment — la marche la plus haute jouable — et cesse de promettre
	// une étoile déjà gagnée, dont la célébration ne se rejoue pas.
	// « Acquise » se lit sur les mots ATTENDUS, pas sur `motsListe` : ce dernier ne connaît que
	// les mots simples (`motIds`), alors qu'une liste peut aussi porter des cibles VERBE (#261),
	// matérialisées seulement au lancement du parcours. Une liste étoilée à laquelle un parent
	// ajoute un verbe paraîtrait donc acquise ici, et le bouton promettrait un tour de N
	// activités avant de lancer... la découverte des cibles verbe. `avancementLecon` énumère les
	// deux populations en lecture seule (id de cible déterministe, sans LEFFF) et compte
	// « nouveau » ce qui n'est pas encore en banque — c'est la même mesure que l'espace encadrant.
	const avancement = avancementLecon(loadOrtho(), lessonId, dispo);
	const acquise = avancement.niveau === 'acquis';
	const marche = acquise ? marcheLaPlusHaute(dispo) : null;
	// La marche promue quitte la zone basse : la laisser aussi en « déjà terminé » ferait lire
	// deux fois le même libellé sur un écran que l'enfant parcourt en diagonale.
	const termines = cibles.filter((m) => finis.includes(m.id as ModeOrtho) && m.id !== marche);
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
      ${teteHTML(marche, avancement.total)}
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
	// l'activité due sera la marche la plus haute jouable, via prochaineActivite — depuis
	// #658, plus un tirage : c'est aussi ce que le bouton de tête annonce à l'enfant).
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
	nettoyerTaches(); // on quitte un éventuel mot affiché : plus rien à retracer
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
			ecoute: ecouteAtelier(word, dispoDictee),
			onDone: () => {
				marquerAtelierFait(word);
				saveOrtho(st);
				renderNext();
			},
		});
	} else monterTacheOrtho(act, word, optionsTacheParcours(word, act));
}

/* Ce que le PARCOURS attend d'une tâche (#640). Le rendu lui-même (tuiles, mot caché,
   dictée) est partagé avec la révision espacée depuis ce lot : ne restent ici que les
   décisions du parcours — deux essais avant la correction guidée (jamais sur les tuiles,
   où les lettres sont fournies), le journal d'erreurs sur le premier essai raté, l'XP et
   la validation de la marche, puis l'enchaînement de la séance. */
function optionsTacheParcours(word: MotOrtho, act: ModeOrtho): OptionsTache {
	return {
		hote: sheets(),
		dispoDictee,
		essaisAvantCorrection: act === 'tuiles' ? Infinity : 2,
		onReussite: (mode, fb) => {
			reussiteMode(word, mode);
			reussite(fb, true);
		},
		onEchec: (saisie, rang) => {
			if (rang === 1) journalErreurOrtho(word, saisie); // 1er essai raté
		},
		onCorrection: (saisie) => {
			noterMotDifficile(word); // ce mot a demandé un étayage (#618)
			renderAtelier(sheets(), word, {
				contexteHTML: contexteHTML(word),
				ecoute: ecouteAtelier(word, dispoDictee),
				onDone: () => {
					saveOrtho(st);
					renderNext();
				},
				diff: diffCorrect(saisie, word.mot),
				consigne: consigneCorrection(word, act),
			});
		},
		// La dictée s'est tue en plein vol : plus de dictée pour cette séance, et l'écran
		// de sortie prend la main (le parcours proposera un autre mode ensuite).
		onSilence: () => {
			dispoDictee = false;
			renderDicteeMuette();
		},
	};
}

/* Consigne de la correction guidée, propre au mode raté : le mot caché a été regardé
   avant d'être écrit (rien à re-nommer), la dictée n'a jamais montré sa cible. */
function consigneCorrection(word: MotOrtho, act: ModeOrtho): string {
	if (act === 'motCache') return "Regarde où tu t'es trompé, puis entoure le piège.";
	return word.contexte
		? "Regarde le verbe et où tu t'es trompé, puis entoure le piège."
		: "Regarde le mot et où tu t'es trompé, puis entoure le piège.";
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
function annoncerRecompensesFin(celebBase: CelebEntry[]): void {
	const gains = recompensesFin(niveauAvant, celebBase);
	niveauAvant = gains.niveauApres; // un parcours enchaîne plusieurs écrans de fin
	announceRewards(gains.niveauGagne, gains.recompensesNiv, gains.celeb);
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
