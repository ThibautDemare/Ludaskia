/* ============================================================
   Runner « tableau de conversion » (#394) — 2ᵉ mode des leçons de mesures,
   « une question à la fois ». L'enfant remplit une colonne d'unité par case
   (zéros de transit compris) via un PAVÉ de chiffres externe (jamais de clavier
   natif ouvert par case) : case active surlignée, avance automatique, navigation
   clavier ← →. Feedback immédiat, sans chrono ; à la fin, l'essai est enregistré
   via recordLessonRun → mêmes XP / étoiles / objectifs que la fiche en saisie
   (parité #69), comme les autres runners dédiés (cf. lecon-tuiles.ts).

   Rendu : réutilise le langage visuel des cellules posées (.posee-*) via des tokens
   partagés (bord, --paper, --ink, --ok/--ko) ; une colonne de transit (unité non
   étudiée au niveau) est signalée par un EN-TÊTE démoté + une case en POINTILLÉS
   (jamais grisée/opacifiée = code du champ désactivé). Accessibilité dys (avis
   specialiste-troubles-apprentissage) : nom d'unité en toutes lettres VISIBLE dans
   l'en-tête, ordre spatial grande→petite stable, légende courte permanente, aria-label
   par case en toutes lettres, aide illustrative rappelable.

   DEUX MODES de tableau (#711 lot 4), et non un geste qui remplace l'autre :
   - `tableau` : l'application POSE la virgule, et seulement sur une réponse décimale.
     Comportement d'origine, inchangé — c'est la marche accessible, on ne la retire pas ;
   - `virgule` (CM1 seulement) : c'est l'ENFANT qui la place, sur TOUS les items. Elle se
     pose juste après la colonne de l'unité demandée, comme au tableau noir, que le résultat
     soit décimal ou entier. La demander seulement sur les décimaux reviendrait à lui dire
     que la réponse est décimale — l'exercice répondrait encore à une moitié de la question.

   Le geste passe par un 12ᵉ bouton du PAVÉ (`data-pave="virgule"`), jamais par un glisser
   ni par une zone tapable entre deux colonnes : l'écart inter-colonnes fait 12 px, le
   porter à une cible de 44 px suppose de mordre sur les cases voisines, qui sont
   elles-mêmes des boutons (avis designer-ux-enfant, contrainte géométrique dure).
   La virgule se pose à la frontière de colonne qui suit la case active ; une pression au
   même endroit la retire. ÉCARTÉ : étendre la cascade de `effacer` pour qu'elle traverse
   aussi la virgule (proposition designer). Le va-et-vient sur le même bouton suffit à
   corriger, et faire dépendre l'effacement d'un chiffre de la présence d'une virgule
   ajoutait un état à comprendre pour un gain nul.

   La virgule a un EMPLACEMENT VISIBLE (`.tc-fente`) à chaque frontière de colonne tant
   qu'elle n'est pas posée : c'est ce qui rend lisible le bouton « Vérifier » encore gris
   (avis specialiste-troubles-apprentissage — un blocage dont la cause ne se voit pas dans
   le tableau est un obstacle qu'on ne peut ni voir ni raisonner). Les emplacements sont
   INERTES : ils ne sont pas une seconde façon de viser, et ils ne disent pas où aller
   puisqu'il y en a un partout. ÉCARTÉ pour la même raison inverse : une pastille sur le
   bouton virgule tant qu'aucune n'est posée (proposition designer) — la virgule étant
   attendue sur tous les items, elle serait permanente donc muette.

   ÉCARTÉ, une fois pour toutes (relecture a11y #711) : ajouter un RANG numérique à
   l'aria-label des cases (« case 4 sur 7 ») alors que la tranche fixe en affiche jusqu'à
   huit. Le nom d'unité est plus informatif qu'un ordinal, l'ordre spatial grande→petite
   est stable d'un exercice à l'autre, et `#tcStatus` répète déjà ce nom à chaque frappe :
   le rang n'ajouterait qu'une redondance à écouter. Consigné ici pour que le prochain
   audit ne le re-remonte pas.
   ============================================================ */
import { getLessonById } from '../core/catalog';
import type { LessonDef } from '../core/catalog';
import { niveauLecon } from '../core/niveau-actif';
import type { Exercise, ExerciseMode, TableauColonne } from '../core/exercise';
import { commKey } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import { bindConsigneTts } from './consigne-tts';
import { goHome } from './navigation';
import {
	leconProgressHTML,
	finishLeconRun,
	renderLeconResult,
	wireNext,
	VERDICT_OK,
	verdictKo,
	demarrerRunner,
	leconTitreHTML,
} from './lecon-runner-shared';
import { enregistrerRunner } from './runner-reprise';
import { monterBoutonAide } from './aide-exercice';
import type { TypeAide } from '../core/aide';
import { capterErreur } from './erreur-capture';
import {
	capterPasse,
	decisionHTML,
	ligneRevelation,
	masquerDecision,
	revelerSolution,
	wirePasser,
} from './lecon-passer';
import { nombreTableauSaisi } from '../core/erreur-representation';
import { conversionDepuisTableau } from '../core/etayage-conversion';
// Traduction index-de-case ↔ index-de-colonne (#711 lot 4) : pure, donc dans `core/` où
// un test la joue sur un tableau fabriqué — le cas qui casse (colonne de tête à deux
// chiffres) ne sort pas à tous les tirages, un e2e ne le garantirait pas.
import { derniereCaseDe, colonneDeCase, caseVirguleAttendue } from '../core/tableau-virgule';
import { bornesColonnes, scrollPourCadrer, type Segment } from '../core/tableau-cadrage';
import type { EtayageDemande } from './etayage-panneau';
import { html, type SafeHtml, VIDE, joindre } from '../core/html';
import { poserAuTrou } from '../core/items';
import { formatReponseRevelee } from '../core/nombres';

const NB_QUESTIONS = 8;

type Tableau = Extract<Exercise, { type: 'tableauConversion' }>;

/* Consigne VISIBLE (et lue par le TTS) : motive le zéro, pas seulement le geste
   (avis pedagogue-primaire). L'énoncé « 3 km = ? m » s'affiche en dessous. */
const CONSIGNE = "Écris un chiffre par case. Mets 0 quand il n'y a rien à compter dans une unité.";
/* Mode « virgule » (#711 lot 4) : la consigne NOMME les deux gestes et suggère un ordre
   sans l'imposer (avis specialiste-troubles-apprentissage — séquencer aide au découpage,
   mais un ordre OBLIGATOIRE serait une règle de plus à retenir, et certains enfants
   dyscalculiques s'appuient d'abord sur le repère de rang). Le rappel du 0 reste : il
   porte ce que le tableau enseigne, pas seulement le geste. */
const CONSIGNE_VIRGULE =
	"Écris un chiffre par case, puis place la virgule. Mets 0 quand il n'y a rien à compter dans une unité.";
/* Légende courte PERMANENTE sous le tableau (avis dys : rappel présent à chaque
   affichage, pas seulement au 1er lancement). */
const LEGENDE =
	'Les unités en petit ne sont pas encore vues en classe : tu peux quand même y écrire des 0.';
/* En mode « virgule » la légende change de sujet : au CM1 aucune colonne n'est démotée
   (toute la chaîne de rangs est au programme depuis le lot 2), donc le rappel des unités
   « pas encore vues » n'y désigne rien. Elle dit le GESTE et ce que montrent les marques,
   PAS la règle : où la virgule se place est ce que l'exercice demande de trouver, et cette
   règle vit dans l'aide contextuelle (bouton « ? », `AIDES.tableauVirgule`), à la demande.

   Deux phrases, et c'est voulu : la légende est lue par `aria-describedby` sur le tableau,
   donc elle doit servir aussi à qui ne voit pas les marques (elles sont `aria-hidden`). La
   première phrase vaut pour tout le monde, la seconde légende le visuel. « Traits » plutôt
   que « repères », qui est un mot d'adulte et ne dit pas ce qu'on cherche des yeux. */
const LEGENDE_VIRGULE =
	'La virgule se pose avec le bouton virgule du pavé. Les petits traits montrent où elle peut aller.';

const consigneDe = (ex: Tableau) => (ex.virguleLibre ? CONSIGNE_VIRGULE : CONSIGNE);
const legende = (ex: Tableau) => (ex.virguleLibre ? LEGENDE_VIRGULE : LEGENDE);
/* Débordement du tableau (#711 critère 13) : AUCUN texte dans l'écran d'exercice. Le
   signalement s'y fait par la jauge de défilement, muette et permanente (`.tc-jauge`,
   `styles/tableau-conversion.scss`) ; l'invitation à tourner l'appareil vit dans l'aide
   contextuelle (`core/aide.ts`, entrée `tableau`, champ `alternative`), donc à la demande
   derrière le bouton « ? » et au 1er lancement du mode. Raison : un message posé sous le
   tableau se relit à chaque question et devient du bruit ignoré, tout en mangeant de la
   hauteur là où elle manque (avis designer-ux-enfant, arbitrage du mainteneur, écart au
   critère 13 tracé par un commentaire daté sur l'issue). Rien n'est verrouillé non plus :
   `screen.orientation.lock()` exige le plein écran et n'existe pas sur Safari iOS. */

/* Une case saisissable = un chiffre attendu, rattachée à sa colonne. La colonne de tête
   à 2 chiffres se déploie en 2 cases (dizaine puis unité), regroupées visuellement (avis
   dys) mais gérées comme deux cases d'un chiffre → avance auto et pavé homogènes. */
export interface Cellule {
	col: TableauColonne;
	attendu: string; // chiffre attendu ('0'..'9')
	aria: string; // libellé complet (« chiffre des mètres »)
	valeur: string; // saisie courante ('' ou un chiffre)
	rang?: 'dizaine' | 'unite'; // rang dans une tête à 2 chiffres (sinon absent)
}

let lesson: LessonDef;
let mode: ExerciseMode;
let questions: Tableau[] = [];
let idx = 0;
let score = 0;
let cells: Cellule[] = [];
let active = 0;
/* Mode « virgule » (#711 lot 4) : index de la case APRÈS laquelle l'enfant a posé sa
   virgule, `null` tant qu'elle ne l'est pas. Toujours la DERNIÈRE case d'une colonne — une
   colonne de tête à deux chiffres est un artefact de la tranche fixe (elle encaisse les
   valeurs jusqu'à 20), pas un objet de classe : y glisser une virgule inventerait une
   erreur qui n'existe pas au tableau noir. Reste `null` dans le mode `tableau`. */
let virguleCase: number | null = null;
let frozen = false; // après validation : plus de saisie
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let resizeHandler: (() => void) | null = null;
let cadreObserver: ResizeObserver | null = null;

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

const pluriel = (nom: string) => `${nom}s`;

function genQuestions(l: LessonDef, m: ExerciseMode, n: number): Tableau[] {
	const out: Tableau[] = [];
	const seen = new Set<string>();
	let misses = 0;
	while (out.length < n && misses < 80) {
		const ex = l.exerciseType.generate({ mode: m, level: niveauLecon(l) });
		if (ex.type !== 'tableauConversion') break; // ce runner n'a de sens que pour un tableau
		const key = commKey(ex.question);
		if (seen.has(key)) {
			misses++;
			continue;
		}
		seen.add(key);
		out.push(ex);
		misses = 0;
	}
	return out;
}

/* Déploie les colonnes de l'exercice en liste plate de cases (une par chiffre attendu).
   Exporté (avec `renderTableauBoardHTML`) pour la galerie visuelle (#419) : pure et
   déterministe (aucun aléa), il produit les mêmes cases que le runner live. */
export function buildCells(ex: Tableau): Cellule[] {
	const out: Cellule[] = [];
	for (const col of ex.colonnes) {
		const digits = col.chiffres.split('');
		digits.forEach((d, i) => {
			// Tête à 2 chiffres : on nomme le rang pour l'aria (« dizaines des mètres »).
			const rang = digits.length === 2 ? (i === 0 ? 'dizaine' : 'unite') : undefined;
			const aria = rang
				? `chiffre des ${rang === 'dizaine' ? 'dizaines' : 'unités'} de ${pluriel(col.nom)}`
				: `chiffre des ${pluriel(col.nom)}`;
			out.push({ col, attendu: d, aria, valeur: '', rang });
		});
	}
	return out;
}

/* Nom du runner dans le registre de reprise (#498) — stable, il vit dans les instantanés. */
const RUNNER = 'tableau';

/* Démarre l'écran sur un jeu de questions donné, à l'index et au score voulus. Chemin
   COMMUN au lancement neuf (0/0) et à la reprise, pour que les deux ne divergent pas. */
function demarrer(l: LessonDef, m: ExerciseMode, qs: Tableau[], depart = 0, pts = 0): void {
	lesson = l;
	mode = m;
	questions = qs;
	idx = depart;
	score = pts;
	demarrerRunner({
		runner: RUNNER,
		lesson: l,
		mode: m ?? null,
		etat: () => ({ questions, idx, score }),
		render: renderQuestion,
		// L'aide suit le MODE, pas le runner : placer la virgule n'est pas un geste de plus
		// dans le même tableau, c'est une autre question posée à l'enfant.
		aide: typeAide(),
	});
}

/* Aide contextuelle du mode courant (#711 lot 4). Lue sur l'exercice et non sur `mode`, pour
   que le refus du générateur fasse foi : un mode « virgule » forcé hors CM1 rend un tableau
   ordinaire, et c'est l'aide ordinaire qu'il faut alors montrer. */
const typeAide = (): TypeAide => (questions[idx]?.virguleLibre ? 'tableauVirgule' : 'tableau');

export function runLeconTableau(lessonId: string, m: ExerciseMode): void {
	const l = getLessonById(lessonId);
	if (!l) {
		goHome();
		return;
	}
	const qs = genQuestions(l, m, NB_QUESTIONS);
	if (!qs.length) {
		goHome();
		return;
	}
	demarrer(l, m, qs);
}

/* Reprise (#498) : on rejoue les questions DÉJÀ TIRÉES à l'index sauvegardé, jamais un
   nouveau tirage — l'enfant retrouve sa leçon, pas une autre. */
enregistrerRunner(RUNNER, (snap) => {
	const l = getLessonById(snap.relaunch.lessonId);
	const qs = snap.questions as Tableau[];
	if (!l || !qs.length) {
		goHome();
		return;
	}
	demarrer(l, snap.exerciseMode as ExerciseMode, qs, snap.idx, snap.score);
});

/* Rendu d'une colonne : en-tête (symbole + nom complet visible) + ses cases, la virgule
   fixe étant insérée APRÈS la colonne cible (donnée `virguleApres`). Chaque case porte son
   index plat en `data-i` (repère e2e + rattachement à `cells`) et le chiffre attendu en
   `data-answer` (même convention que la grille posée : correction auditable + repère e2e). */
function colonneHTML(
	ex: Tableau,
	col: TableauColonne,
	colIndex: number,
	offset: number,
	cellsArg: Cellule[],
): SafeHtml {
	const tCls = col.transit ? ' tc-col--transit' : '';
	const nb = col.chiffres.length;
	const cases = joindre(
		Array.from({ length: nb }, (_, k) => {
			const i = offset + k;
			return html`<button type="button" class="tc-cell${col.transit ? ' tc-cell--transit' : ''}" data-i="${i}" data-answer="${cellsArg[i].attendu}" aria-label="${cellsArg[i].aria}"></button>`;
		}),
	);
	// Virgule POSÉE PAR L'APP (mode `tableau`) : glyphe décoratif entre deux colonnes.
	const virgule =
		!ex.virguleLibre && ex.virguleApres === colIndex
			? html`<span class="tc-virgule" aria-hidden="true">,</span>`
			: VIDE;
	// Virgule À PLACER (mode `virgule`) : un emplacement au bord droit de CHAQUE colonne,
	// la dernière comprise (l'unité demandée y tombe souvent : « 3 m = ? mm »). Positionné
	// en absolu dans la colonne, donc à coût de largeur NUL — le tableau déborde déjà en
	// portrait, et un emplacement qui élargirait ferait sauter le défilement au moment même
	// où l'enfant pose sa virgule. Inerte : `aria-hidden`, aucun listener (l'état réel est
	// annoncé par `#tcStatus`, et le geste passe par le pavé).
	const fente = ex.virguleLibre
		? html`<span class="tc-fente" data-apres="${colIndex}" aria-hidden="true"></span>`
		: VIDE;
	return html`<div class="tc-col${tCls}">
      <div class="tc-head${col.transit ? ' tc-head--transit' : ''}">
        <span class="tc-sym">${col.unite}</span>
        <span class="tc-nom">${pluriel(col.nom)}</span>
      </div>
      <div class="tc-col-cells">${cases}</div>${fente}
    </div>${virgule}`;
}

/* Board PUR du tableau (#419) : consigne + énoncé + tableau + légende + pavé, à partir
   de l'exercice et de SES cases (déployées par `buildCells`). Extrait du runner live
   (renderQuestion l'appelle) pour être réutilisé À L'IDENTIQUE par la galerie visuelle
   (ui/galerie.ts) — même markup des deux côtés, donc un snapshot détecte les régressions
   du VRAI rendu. NE CÂBLE RIEN (pas de `wireInteraction`, donc aucun listener `document`) :
   l'entrée live ajoute l'interaction autour. */
export function renderTableauBoardHTML(ex: Tableau, cellsArg: Cellule[]): SafeHtml {
	let offset = 0;
	const colonnes = joindre(
		ex.colonnes.map((col, colIndex) => {
			const colonne = colonneHTML(ex, col, colIndex, offset, cellsArg);
			offset += col.chiffres.length;
			return colonne;
		}),
	);
	const enonce = poserAuTrou(html`${ex.question}`, '@', html`<span class="tc-trou">?</span>`);
	// Repli du texte parlé aligné sur les autres runners (jamais chaîne vide) : `parle`
	// est toujours fourni ici, mais on retombe sur l'énoncé si un futur générateur l'omet.
	const ttsTexte = `${consigneDe(ex)} ${ex.parle ?? ex.question}`.trim();
	return html`<p class="tc-consigne"${ttsAttr(ttsTexte)}>${consigneDe(ex)}</p>
        <p class="tc-enonce">${enonce}</p>
        <div class="tc-zone">
          <div class="tc-colonne-tableau">
            <div class="tc-wrap">
              <div class="tc-table" id="tcTable" role="group" aria-describedby="tcLegende" aria-label="Tableau de conversion">${colonnes}</div>
            </div>
            <div class="tc-jauge tc-jauge--inactive" id="tcJauge" aria-hidden="true"><span class="tc-jauge-curseur"></span></div>
            <p class="tc-legende" id="tcLegende">${legende(ex)}</p>
          </div>
          ${paveHTML(ex)}
        </div>`;
}

function renderQuestion(): void {
	const ex = questions[idx];
	cells = buildCells(ex); // état mutable de saisie (le board pur ci-dessous consomme LES MÊMES cases)
	active = 0;
	virguleCase = null;
	frozen = false;
	sheets().innerHTML = html`
    <div class="sprint sprint-lecon tc-runner">
      ${leconProgressHTML(idx, questions.length)}
      <div class="sprint-stage">
        ${leconTitreHTML(lesson)}
        ${renderTableauBoardHTML(ex, cells)}
        ${decisionHTML('tcVerif')}
        <div class="sprint-correction" id="tcFeedback" hidden></div>
        <div class="sprint-actions" id="tcActions" hidden></div>
        <p class="sr-only" id="tcStatus" role="status" aria-live="polite" aria-atomic="true"></p>
        <p class="sr-only" id="tcVerdict" role="status" aria-live="polite" aria-atomic="true"></p>
      </div>
    </div>`.balisage;
	wireInteraction();
	paintAll();
	cadrerSurLaQuestion();
	majJaugeDefilement(); // après le cadrage : le curseur dit où l'on se trouve
	bindConsigneTts(sheets()); // bouton « Écouter » sur la consigne (#42)
	monterBoutonAide(sheets().querySelector('.sprint-stage'), typeAide()); // bouton « ? » persistant
}

/* Pavé de chiffres externe (façon pave-signes.ts) : gros boutons ≥ 56 px, aucune ouverture
   de clavier natif. 1–9, puis effacer + 0.

   Mode « virgule » (#711 lot 4) : un 12ᵉ bouton. La grille fait trois colonnes et compte
   onze boutons, donc la case en bas à droite est DÉJÀ vide — le bouton s'y range sans
   déplacer un seul chiffre, et la mémoire motrice des dix touches reste intacte (avis
   designer-ux-enfant). Il n'apparaît que dans ce mode : dans le mode `tableau` il n'aurait
   rien à faire, et un bouton présent mais inerte se tape quand même. */
function paveHTML(ex: Tableau): SafeHtml {
	const btn = (d: number) =>
		html`<button type="button" class="tc-pave-btn" data-chiffre="${d}">${d}</button>`;
	const chiffres = joindre([1, 2, 3, 4, 5, 6, 7, 8, 9].map(btn));
	const virgule = ex.virguleLibre
		? html`<button type="button" class="tc-pave-btn tc-pave-virgule" data-pave="virgule" aria-label="Placer la virgule">,</button>`
		: VIDE;
	return html`<div class="tc-pave" role="group" aria-label="Pavé de chiffres">
      ${chiffres}
      <button type="button" class="tc-pave-btn tc-pave-back" data-pave="effacer" aria-label="Effacer">⌫</button>
      ${btn(0)}${virgule}
    </div>`;
}

function wireInteraction(): void {
	const table = sheets().querySelector('#tcTable') as HTMLElement;
	// Tap sur une case : la rend active (sans ouvrir de clavier — ce sont des boutons).
	table.addEventListener('click', (e) => {
		if (frozen) return;
		const b = e.target instanceof Element ? e.target.closest('.tc-cell') : null;
		if (b instanceof HTMLButtonElement) setActive(Number(b.dataset.i));
	});
	// Focus sur une case (Tab clavier ou focus natif du clic) → synchronise l'état
	// « active » avec le focus DOM, pour que la frappe atterrisse dans la case focalisée.
	table.addEventListener('focusin', (e) => {
		if (frozen) return;
		const b = e.target instanceof Element ? e.target.closest('.tc-cell') : null;
		if (b instanceof HTMLButtonElement) setActive(Number(b.dataset.i));
	});
	// Pavé : chiffre → saisie + avance auto ; effacer → recule.
	sheets()
		.querySelector('.tc-pave')!
		.addEventListener('click', (e) => {
			if (frozen) return;
			const b = e.target instanceof Element ? e.target.closest('button') : null;
			if (!(b instanceof HTMLButtonElement)) return;
			if (b.dataset.chiffre !== undefined) saisir(b.dataset.chiffre);
			else if (b.dataset.pave === 'effacer') effacer();
			else if (b.dataset.pave === 'virgule') basculerVirgule();
			else return;
			// Après un tap, on ramène le focus sur la CASE active : Entrée y valide (au lieu de
			// ré-activer le bouton du pavé focalisé → ré-saisie silencieuse), et la frappe
			// physique continue d'atterrir dans la bonne case. Invisible au tactile (pas de
			// clavier natif, pas de défilement grâce à preventScroll).
			cellBtn(active)?.focus({ preventScroll: true });
			garderCaseActiveEnVue();
		});
	// Jauge : suit le défilement du cadre, et la largeur disponible (rotation de l'appareil,
	// redimensionnement de fenêtre → la tranche visible change, donc le curseur aussi).
	sheets()
		.querySelector('.tc-wrap')!
		.addEventListener('scroll', majJaugeDefilement, { passive: true });
	detachResize();
	resizeHandler = () => majJaugeDefilement();
	window.addEventListener('resize', resizeHandler);
	/* Recadrage sur changement de GÉOMÉTRIE, et surveillé par `ResizeObserver` plutôt que par
	   `window.resize` — deux raisons, toutes deux mesurées :

	   1. `resize` ne veut pas dire « la largeur a changé ». Sur Firefox comme sur Chrome
	      Android, replier ou déplier la barre d'adresse au fil du défilement en émet un où seule
	      la HAUTEUR bouge. Recadrer là-dessus rejouerait le cadrage en pleine saisie et
	      effacerait le défilement que l'enfant venait de faire à la main, ce que le commentaire
	      de `cadrerSurLaQuestion` s'interdit (constats convergents du designer et du relecteur
	      a11y).
	   2. Filtrer la largeur À LA MAIN dans un `window.resize` a été essayé, et c'est un piège :
	      une rotation aller-retour rend la même largeur qu'au départ, si bien que le filtre ne
	      voyait plus rien à faire et laissait le tableau là où le navigateur l'avait remis
	      entre-temps, c'est-à-dire à zéro. Mesuré, critère 24 rouge.

	   L'observateur n'a besoin d'aucun filtre, et c'est ce qui le rend juste : il regarde LE
	   CADRE, dont la largeur suit le conteneur et dont la hauteur est dictée par le tableau. Une
	   barre d'adresse qui se replie ne change ni l'une ni l'autre, donc ne le réveille même pas.
	   Il voit en revanche le zoom texte et une police système agrandie, qui changent la
	   géométrie sans jamais émettre `resize`. La jauge, elle, reste aussi branchée sur `resize` :
	   elle décrit une position, pas une décision.

	   TROU CONNU, laissé ouvert sciemment : deux largeurs différentes appliquées sans qu'une
	   image soit rendue entre les deux ne produisent qu'UNE notification, portant la taille
	   finale. Si celle-ci égale la taille de départ, l'observateur se tait, alors que la mise en
	   page intermédiaire a pu ramener le défilement à zéro. Le fermer demanderait de surveiller
	   aussi `scrollWidth` ou l'événement `scroll`. Écarté : une rotation d'appareil dure des
	   dizaines d'images, donc le cas ne se produit qu'en pilotant le viewport par programme. */
	detachCadreObserver();
	const cadre = sheets().querySelector<HTMLElement>('.tc-wrap');
	if (cadre) {
		cadreObserver = new ResizeObserver(() => {
			// `observe()` notifie une première fois, tout de suite : ce rejeu est GARDÉ, et pas
			// seulement toléré. Il est idempotent (même géométrie, même position), et il rattrape
			// le cas où le premier cadrage a mesuré des colonnes pas encore à leur largeur finale,
			// typiquement avant que la police de l'interface soit chargée.
			cadrerSurLaQuestion();
			majJaugeDefilement();
		});
		cadreObserver.observe(cadre);
	}
	const verif = sheets().querySelector('#tcVerif') as HTMLButtonElement;
	verif.addEventListener('click', () => verifier());
	wirePasser(sheets(), passer); // « Je ne sais pas, montre-moi » (#467)
	// Clavier physique (l'inputmode ne s'applique pas ; les cases ne sont pas des champs
	// texte) : chiffres, effacement et navigation ← →. Retiré au re-rendu / à la sortie.
	detachKeys();
	keyHandler = (e: KeyboardEvent) => {
		if (frozen || !sheets().querySelector('#tcTable')) return;
		// Ne traiter QUE si le focus est dans le widget (une case ou le pavé) : sinon on
		// volerait chiffres / flèches / Entrée aux autres commandes de la page (toolbar
		// Accueil, bouton « Écouter », bouton « ? »… tous hors #sheets ou frères du tableau).
		const focus = document.activeElement;
		if (!(focus instanceof Element && focus.closest('.tc-cell, .tc-pave'))) return;
		// Ne pas détourner les raccourcis navigateur à modificateur (Ctrl+0 zoom, Cmd+1 onglet…).
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (/^[0-9]$/.test(e.key)) {
			saisir(e.key);
			e.preventDefault();
		} else if (e.key === 'Backspace') {
			effacer();
			e.preventDefault();
		} else if ((e.key === ',' || e.key === '.') && questions[idx].virguleLibre && !e.repeat) {
			// Le point autant que la virgule : sur un pavé numérique physique, le séparateur
			// décimal est un point, et refuser la touche que l'enfant a sous le doigt serait
			// une énigme de plus. Le tableau, lui, n'affiche jamais qu'une virgule.
			// `!e.repeat` : une touche MAINTENUE ferait clignoter la virgule entre posée et
			// retirée, là où un chiffre maintenu ne fait que réécrire la même valeur.
			basculerVirgule();
			e.preventDefault();
		} else if (e.key === 'ArrowRight') {
			setActive(Math.min(active + 1, cells.length - 1), estCaseFocus());
			e.preventDefault();
		} else if (e.key === 'ArrowLeft') {
			setActive(Math.max(active - 1, 0), estCaseFocus());
			e.preventDefault();
		} else if (e.key === 'Enter' && estCaseFocus() && !verif.disabled) {
			// Entrée ne valide que depuis une CASE (les boutons gardent leur Entrée natif).
			verifier();
			e.preventDefault();
		}
	};
	document.addEventListener('keydown', keyHandler);
}

/** Nettoyage à la sortie du runner (quitter via Accueil sans passer par `finish`) : retire
    les listeners posés HORS de `#sheets` — clavier sur `document`, redimensionnement sur
    `window`. Ceux posés dans `#sheets` partent avec le markup au re-rendu. Branché dans
    resetSessionUI, comme sprintCleanup. */
export function leconTableauCleanup(): void {
	detachKeys();
	detachResize();
	// L'observateur du cadre vit lui aussi hors du markup : il survivrait à la sortie du runner.
	detachCadreObserver();
}

function detachKeys(): void {
	if (keyHandler) document.removeEventListener('keydown', keyHandler);
	keyHandler = null;
}

function detachResize(): void {
	if (resizeHandler) window.removeEventListener('resize', resizeHandler);
	resizeHandler = null;
}

/* L'observateur porte sur LE `.tc-wrap` courant, que chaque re-rendu remplace : sans cette
   coupure on accumulerait un observateur par question, tous pointant sur des cadres détachés. */
function detachCadreObserver(): void {
	cadreObserver?.disconnect();
	cadreObserver = null;
}

const cellBtn = (i: number) => sheets().querySelector<HTMLButtonElement>(`.tc-cell[data-i="${i}"]`);

/* Région live de l'ÉCHO DE SAISIE (#tcStatus, `role=status`) — à ne pas confondre avec
   `#tcVerdict`, celle du verdict, peuplée par `wireNext` (#505). Annonce la saisie quand elle
   passe par le PAVÉ (le focus reste alors sur le pavé, `aria-current` sur la case ne serait
   pas lu). Même parade que le widget tuiles (#360 / SC 4.1.3). */
function announce(msg: string): void {
	const s = sheets().querySelector('#tcStatus');
	if (s) s.textContent = msg;
}

/* Une case a-t-elle actuellement le focus DOM ? (path clavier : la frappe et l'avance
   auto font alors suivre le focus ; path pavé/tactile : le focus reste sur le pavé.) */
const estCaseFocus = () =>
	document.activeElement instanceof HTMLElement &&
	document.activeElement.classList.contains('tc-cell');

/* Peint une case : chiffre saisi + états (active / correct / wrong). */
function paintCell(i: number): void {
	const b = cellBtn(i);
	if (!b) return;
	const c = cells[i];
	b.textContent = c.valeur;
	b.classList.toggle('tc-cell--active', !frozen && i === active);
	if (!frozen) b.classList.remove('correct', 'wrong');
	b.setAttribute('aria-current', !frozen && i === active ? 'true' : 'false');
	if (!frozen) b.setAttribute('aria-label', ariaCase(i));
}

/* Libellé d'une case, virgule COMPRISE (#711 lot 4). Sans ça, la position de la virgule
   n'existait que dans l'annonce du geste (`#tcStatus`, qui ne se relit pas) et dans le
   feedback final : un enfant qui parcourt le tableau case par case au lecteur d'écran, pour
   se relire avant de valider, n'avait aucun moyen de retrouver où il l'avait posée. Les
   emplacements eux-mêmes sont `aria-hidden` — ils ne portent aucun texte, seulement une
   forme — donc c'est la case qui précède la virgule qui doit le dire. */
function ariaCase(i: number): string {
	return virguleCase === i ? `${cells[i].aria}, virgule après` : cells[i].aria;
}

function paintAll(): void {
	cells.forEach((_, i) => paintCell(i));
	peindreVirgule();
	refreshVerif();
}

/* Ramène la case active dans le champ visible du tableau, sans JAMAIS bouger la page.
   Depuis #711 la tranche de colonnes est fixe : un tableau de longueurs en fait sept, soit
   plus large que la scène (`.sprint` plafonne à 600 px), si bien que `.tc-wrap` défile en
   temps normal et non plus seulement sur très petit écran. Le chemin du PAVÉ focalise la
   case avec `preventScroll` — nécessaire pour ne pas faire sauter la page — ce qui, sans ce
   rattrapage, laissait l'enfant écrire à l'aveugle dans une case surlignée sortie du cadre
   (constat relecteur-accessibilite). `block: 'nearest'` interdit tout mouvement vertical,
   `inline: 'nearest'` ne fait défiler que l'ancêtre horizontal le plus proche, au minimum.
   Pas de `behavior: 'smooth'` : aucun mouvement animé à accorder à `prefers-reduced-motion`. */
function garderCaseActiveEnVue(): void {
	cellBtn(active)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

/* Bords d'une colonne dans le repère du CONTENU du cadre (donc indépendants du défilement
   courant), mesurés par rectangles plutôt que par `offsetLeft` : depuis le lot 4 les
   colonnes sont `position: relative`, si bien que leur `offsetParent` n'est plus garanti
   d'être le cadre, et un décalage d'origine se lirait comme un décalage de cadrage. */
function segmentColonne(wrap: HTMLElement, col: HTMLElement | null): Segment | null {
	if (!col) return null;
	const cadre = wrap.getBoundingClientRect();
	const r = col.getBoundingClientRect();
	const origine = cadre.left + wrap.clientLeft - wrap.scrollLeft;
	return { debut: r.left - origine, fin: r.right - origine };
}

/* Ouvre le tableau LÀ OÙ LA QUESTION SE JOUE (#711 lot 5).

   Le tableau s'ouvrait sur sa première colonne et ne bougeait ensuite qu'au fil de la
   saisie : mesuré à 393 px, le défilement valait 0 à l'apparition de CHAQUE question, et
   sur « 3,2 cm = ? mm » l'enfant lisait une question sur les centimètres devant les
   colonnes des kilomètres.

   Ce qui doit être vu n'est pas seulement les deux colonnes de la question, mais
   l'INTERVALLE entre elles, colonnes intermédiaires comprises (avis `pedagogue-primaire`) :
   ce sont elles qui permettent de compter les rangs (« je descends de 3 crans, donc
   ×1000 ») au lieu d'appliquer une recette (« kg→g, j'ajoute trois zéros »).

   Appelé à l'apparition ET au redimensionnement (rotation de tablette) : une position
   calculée une fois ne vaut plus rien quand la largeur visible change. Jamais après une
   saisie — c'est le rôle de `garderCaseActiveEnVue`, qui suit la case active, et recadrer
   sous les doigts de l'enfant déplacerait le tableau qu'il vient de lire.

   Sans effet vertical et sans animation (critères 26 et 27) : on écrit `scrollLeft`, ce qui
   ne touche qu'un ancêtre et n'anime rien, plutôt qu'un `scrollIntoView` dont le navigateur
   choisit lui-même les axes. */
function cadrerSurLaQuestion(): void {
	const ex = questions[idx];
	const wrap = sheets().querySelector<HTMLElement>('.tc-wrap');
	if (!wrap || !ex) return;
	const colonnes = [...wrap.querySelectorAll<HTMLElement>('.tc-col')];
	const iDonnee = ex.colonnes.findIndex((c) => c.unite === ex.uniteConnue);
	const iDemandee = ex.colonnes.findIndex((c) => c.unite === ex.answerUnit);
	// Les deux index sont cherchés PAR RÔLE, jamais par position : `bornesColonnes` rend la
	// paire triée, ce qui perdrait le sens du remplissage — or c'est lui qui décide du bord
	// sur lequel le cadre s'aligne quand l'intervalle ne tient pas (critère 25).
	const donnee = segmentColonne(wrap, colonnes[iDonnee] ?? null);
	const demandee = segmentColonne(wrap, colonnes[iDemandee] ?? null);
	if (!donnee || !demandee) return;
	wrap.scrollLeft = scrollPourCadrer(donnee, demandee, wrap.clientWidth, wrap.scrollWidth);
}

/* Jauge de défilement (#711 lot 3) : dit qu'il reste des colonnes hors champ, et combien,
   sans un mot. Pilotée par la position de défilement RÉELLE et non par une media query —
   une jauge figée affirmerait une suite qui n'existe pas, et plus catégoriquement qu'un
   signal discret ne le ferait. Tolérance de 2 px : `scrollWidth` et `clientWidth` sont
   arrondis à l'entier, un écart de 1 px n'est pas un hors-champ.

   Calcul en PIXELS et non en pourcentages : le curseur a une largeur plancher (32 px, pour
   rester perceptible quand la part visible est faible), donc sa course utile n'est pas la
   piste entière. En pourcentages il dépasserait à droite au lieu de s'arrêter pile en
   butée — or « le curseur touche le bord » est exactement ce qui doit dire à l'enfant
   qu'il n'y a plus rien après. */
function majJaugeDefilement(): void {
	const wrap = sheets().querySelector<HTMLElement>('.tc-wrap');
	const jauge = sheets().querySelector<HTMLElement>('#tcJauge');
	const curseur = jauge?.querySelector<HTMLElement>('.tc-jauge-curseur');
	if (!wrap || !jauge || !curseur) return;
	const cache = wrap.scrollWidth - wrap.clientWidth;
	jauge.classList.toggle('tc-jauge--inactive', cache <= 2);
	if (cache <= 2) return;
	const piste = jauge.clientWidth;
	const largeur = Math.max(32, Math.round((piste * wrap.clientWidth) / wrap.scrollWidth));
	const course = Math.max(0, piste - largeur);
	curseur.style.width = `${largeur}px`;
	curseur.style.left = `${Math.round((Math.min(wrap.scrollLeft, cache) / cache) * course)}px`;
}

/* Déplace la case active (surbrillance) ; `focus` = déplacer AUSSI le focus DOM (nav clavier
   sur les cases). Le focusin resynchronisera `active` — idempotent, pas de boucle. */
function setActive(i: number, focus = false): void {
	const prev = active;
	active = i;
	paintCell(prev);
	paintCell(active);
	if (focus) cellBtn(active)?.focus();
	garderCaseActiveEnVue();
}

function saisir(d: string): void {
	const focusSuit = estCaseFocus();
	cells[active].valeur = d;
	const prev = active;
	if (active < cells.length - 1) active += 1; // avance automatique
	paintCell(prev);
	paintCell(active);
	if (focusSuit) cellBtn(active)?.focus();
	// Retour vocal (surtout path pavé, focus hors case) : ce qu'on vient d'écrire, où.
	announce(`${cells[prev].aria} : ${d}${resteLaVirgule()}`);
	garderCaseActiveEnVue();
	refreshVerif();
}

/* Pose, déplace ou retire la virgule (#711 lot 4). Elle va à la frontière de colonne qui
   suit la case ACTIVE — jamais entre les deux chiffres d'une tête (cf. `virguleCase`). Une
   pression au même endroit la retire : c'est la seule façon de revenir en arrière, et elle
   tient dans le bouton qu'on vient d'utiliser.

   Le curseur n'avance PAS après la pose, contrairement à un chiffre : la virgule ne remplit
   pas une case, elle marque un bord. Faire sauter la case active ici donnerait l'impression
   d'avoir écrit quelque chose. */
/* Ce qu'il reste à faire, accolé au message du geste plutôt qu'annoncé à part : un enfant au
   lecteur d'écran ne voit pas les emplacements (`aria-hidden`), et « Vérifier » désactivé est
   sauté à la tabulation — sans cette phrase, le blocage n'a aucune cause perceptible. Un seul
   `announce` par geste, jamais deux qui se couperaient (avis relecteur-accessibilite). */
function resteLaVirgule(): string {
	if (!questions[idx].virguleLibre || virguleCase !== null) return '';
	return cells.some((c) => c.valeur === '') ? '' : ' Il reste la virgule à placer.';
}

function basculerVirgule(): void {
	const ex = questions[idx];
	if (frozen || !ex.virguleLibre) return;
	const cible = derniereCaseDe(ex, colonneDeCase(ex, active));
	if (virguleCase === cible) {
		virguleCase = null;
		announce(`Virgule retirée.${resteLaVirgule()}`);
	} else {
		virguleCase = cible;
		// On annonce la POSITION FINALE, jamais le trajet : une région `role=status` qui
		// raconte « déplacée de X à Y » se fait couper par l'annonce suivante et noie
		// l'information utile (avis specialiste-troubles-apprentissage).
		announce(`Virgule après les ${pluriel(cells[cible].col.nom)}.`);
	}
	peindreVirgule();
	// Les libellés des cases portent la virgule : deux peuvent changer d'un coup (celle qu'on
	// quitte, celle qu'on rejoint), et repeindre toute la ligne coûte moins cher que suivre
	// laquelle était l'ancienne.
	cells.forEach((_, i) => paintCell(i));
	garderCaseActiveEnVue();
	refreshVerif();
}

/* Place le glyphe dans SON emplacement et retire les autres marques. Les emplacements vides
   ne se montrent que tant qu'aucune virgule n'est posée : avant, ils disent « il en manque
   une quelque part » (ce qui rend lisible le bouton « Vérifier » encore gris) ; après, ils
   ne seraient plus que des leurres à balayer. */
function peindreVirgule(): void {
	const table = sheets().querySelector<HTMLElement>('#tcTable');
	if (!table) return;
	const ex = questions[idx];
	table.classList.toggle('tc-table--virgule-posee', virguleCase !== null);
	for (const f of table.querySelectorAll<HTMLElement>('.tc-fente')) {
		const col = Number(f.dataset.apres);
		f.classList.toggle(
			'tc-fente--posee',
			virguleCase !== null && derniereCaseDe(ex, col) === virguleCase,
		);
	}
}

/* Correction de la virgule : son emplacement porte SON propre verdict, distinct de celui
   des cases. Quand elle est fausse, l'emplacement attendu est montré à son tour — c'est la
   même règle que partout ailleurs après une erreur, la réponse est déjà révélée dans le
   feedback, donc rien ne « fuite ». Sans marque à sa place, la seule erreur possible sur un
   tableau aux sept chiffres justes n'aurait aucune trace à l'écran.

   `ok` à `null` = on RÉVÈLE sans juger, pour « Je ne sais pas, montre-moi » : ce chemin ne
   marque déjà aucune case ✓/✗ (elles ne sont pas toutes remplies), il ne jugerait pas plus
   justement une virgule posée à moitié d'une réponse. */
function marquerVirgule(ex: Tableau, ok: boolean | null): void {
	if (!ex.virguleLibre) return;
	const table = sheets().querySelector<HTMLElement>('#tcTable');
	if (!table) return;
	const attendue = caseVirguleAttendue(ex);
	for (const f of table.querySelectorAll<HTMLElement>('.tc-fente')) {
		const bord = derniereCaseDe(ex, Number(f.dataset.apres));
		if (ok !== null && bord === virguleCase)
			f.classList.add(ok ? 'tc-fente--juste' : 'tc-fente--fausse');
		if (ok !== true && bord === attendue) f.classList.add('tc-fente--attendue');
	}
}

function effacer(): void {
	const focusSuit = estCaseFocus();
	if (cells[active].valeur !== '') {
		cells[active].valeur = '';
		paintCell(active);
		announce(`${cells[active].aria} effacé`);
	} else if (active > 0) {
		const prev = active;
		active -= 1;
		cells[active].valeur = '';
		paintCell(prev);
		paintCell(active);
		if (focusSuit) cellBtn(active)?.focus();
		announce(`${cells[active].aria} effacé`);
	}
	garderCaseActiveEnVue();
	refreshVerif();
}

/* Validation bloquée tant qu'une case est vide (entraîne les zéros de transit) : « Vérifier »
   ne s'active que lorsque TOUTES les cases sont remplies (avis dys : pas de message d'erreur
   à re-balayer, l'avance auto amène déjà sur la case vide suivante). */
function refreshVerif(): void {
	const verif = sheets().querySelector('#tcVerif') as HTMLButtonElement | null;
	if (verif) verif.disabled = !reponseComplete();
}

/* Réponse complète = toutes les cases remplies, ET la virgule posée quand le mode la demande.
   Le blocage ne révèle rien ici, précisément parce que le mode ne tire que des conversions à
   réponse décimale : la virgule est attendue sur tous ses items. Sur un mode où elle ne le
   serait que parfois, ce même blocage dirait « ta réponse est décimale ». */
function reponseComplete(): boolean {
	if (cells.some((c) => c.valeur === '')) return false;
	return !questions[idx].virguleLibre || virguleCase !== null;
}

function verifier(): void {
	if (frozen || !reponseComplete()) return;
	frozen = true;
	const ex = questions[idx];
	// Deux verdicts SÉPARÉS, et non un « faux » global. Ce sont deux compétences distinctes
	// du programme — la valeur positionnelle des chiffres d'un côté, la lecture du tableau
	// dans l'unité demandée de l'autre (avis pedagogue-primaire) — et un enfant qui voit sa
	// série de cases justes repeinte en rouge pour une virgule conclut qu'il a tout raté
	// (avis specialiste-troubles-apprentissage).
	let chiffresOk = true;
	const virguleOk = !ex.virguleLibre || virguleCase === caseVirguleAttendue(ex);
	cells.forEach((c, i) => {
		const ok = c.valeur === c.attendu;
		chiffresOk = chiffresOk && ok;
		const b = cellBtn(i);
		if (b) {
			b.classList.remove('tc-cell--active');
			b.classList.add(ok ? 'correct' : 'wrong');
			b.setAttribute('aria-current', 'false');
			// Justesse exposée aux technologies d'assistance (le ✓/✗ CSS ::after ne l'est pas) :
			// la réponse est déjà révélée dans le feedback, donc `attendu` ne « fuite » rien.
			b.setAttribute('aria-invalid', String(!ok));
			// `ariaCase` et non `c.aria` : la virgule reste audible après la correction, quand
			// l'enfant relit son tableau pour comprendre ce qui a été compté faux.
			b.setAttribute(
				'aria-label',
				ok ? `${ariaCase(i)}, correct` : `${ariaCase(i)}, incorrect, attendu ${c.attendu}`,
			);
		}
	});
	const correct = chiffresOk && virguleOk;
	marquerVirgule(ex, virguleOk);
	if (correct) score++;
	// La réponse attendue, écrite comme dans les énoncés (#501) : « 20 000 mL », pas
	// « 20000 mL ». UNE variable pour ses trois usages — le journal encadrant, le feedback
	// affiché et le résumé annoncé — pour qu'ils ne puissent pas se contredire. Le résumé
	// annoncé, lui, est recollé en aval par le point de passage des annonces
	// (ui/lecon-runner-shared.ts) : un séparateur de milliers ne part jamais à l'oreille.
	const attendueTexte = `${formatReponseRevelee(ex.answer)} ${ex.answerUnit}`;
	// Journal des erreurs (#391) : UNE entrée par tableau raté (jamais une par case, illisible
	// pour le parent), la réponse donnée étant le nombre relu dans l'unité demandée — un
	// chiffre parasite dans une colonne de transit s'y voit donc. La garde `frozen` ci-dessus
	// assure une seule capture par question.
	if (!correct) {
		// La virgule POSÉE prime sur l'unité demandée (#711 lot 4) : elle fait partie de la
		// réponse. Sans ça, un enfant qui l'a mise un cran trop loin verrait sa réponse
		// journalisée à la bonne valeur, et le parent lirait un tableau juste là où l'écran
		// affichait un tableau faux. Dans le mode `tableau`, `virguleCase` reste `null` et la
		// relecture est exactement celle d'avant.
		const saisi = nombreTableauSaisi(
			cells.map((c) => ({ unite: c.col.unite, valeur: c.valeur })),
			ex.answerUnit,
			virguleCase ?? undefined,
		);
		capterErreur({
			text: ex.question,
			donnee: `${saisi} ${ex.answerUnit}`,
			attendue: attendueTexte,
			lessonId: lesson.id,
			mode: 'lecon',
		});
	}
	// Un seul bouton à la fois (#153) : le bloc de décision s'efface (les DEUX boutons — un
	// « Je ne sais pas » cliquable sur un tableau déjà corrigé n'aurait plus de sens) et
	// « Continuer ▶ » prend le relais.
	masquerDecision(sheets());
	const explication = explicationRangVide(ex);
	// Erreur de virgule SEULE : on le dit, au lieu de laisser un « c'est faux » global sur un
	// tableau dont les sept chiffres sont justes. C'est aussi ce qui permet à l'enfant de
	// cibler sa reprise — celui qui ne voit qu'un « faux » doit tout revérifier, y compris ce
	// qui était bon (avis pedagogue-primaire et specialiste-troubles-apprentissage).
	// On nomme AUSSI l'endroit : « tes chiffres sont bons » suivi de « la bonne réponse
	// était… » laisse l'enfant chercher ce qui cloche (constat redacteur-contenu-francais),
	// et oblige un enfant au lecteur d'écran à retrouver le rang en comparant deux nombres à
	// l'oreille (constat relecteur-accessibilite). C'est le seul canal qui porte le verdict
	// de la virgule hors du visuel.
	const noteVirgule =
		chiffresOk && !virguleOk
			? `Tes chiffres sont bons, mais la virgule allait après les ${pluriel(cells[caseVirguleAttendue(ex)].col.nom)}. `
			: '';
	wireNext(
		sheets().querySelector('#tcActions') as HTMLElement,
		sheets().querySelector('#tcFeedback') as HTMLElement,
		{
			feedbackHTML: correct
				? html`<span class="lqcm-ok">Bravo ! 🎉</span>`
				: html`<span class="lqcm-ko">${noteVirgule}La bonne réponse était <strong>${attendueTexte}</strong>.${explication ? html` ${explication}` : ''}</span>`,
			// Ce runner ne disait RIEN à la correction (#505) : `#tcStatus` existait, mais
			// ne servait qu'à l'écho de SAISIE au pavé (« case mètres : 3 »). Un enfant au
			// lecteur d'écran s'entendait dicter ses propres chiffres, puis plus rien.
			// Le verdict a donc sa PROPRE région, `#tcVerdict`, et ne réutilise pas celle
			// de l'écho : le dépôt s'est déjà donné cette règle par écrit à propos de
			// `#revStatus` (docs/architecture/ui.md) — « deux responsabilités dans une même
			// région finissent par se marcher dessus ». Les deux ont ici des rythmes
			// opposés : l'écho parle à chaque frappe, le verdict une fois, à la fin.
			resume: correct
				? VERDICT_OK
				: verdictKo(`${noteVirgule}La bonne réponse était ${attendueTexte}.`),
			statut: '#tcVerdict',
			isLast: idx >= questions.length - 1,
			// Étayage (#490) : proposé sur un tableau raté, jamais sur un tableau juste, et
			// déroulé sur LA conversion qui vient d'échouer (pas l'exemple de la leçon).
			...(correct ? {} : etayageTableauRate(ex)),
			onNext: () => {
				idx++;
				if (idx >= questions.length) finish();
				else renderQuestion();
			},
		},
	);
}

/* De quoi étayer le tableau courant, quand sa structure se laisse décrire (invariant du
   générateur, cf. `conversionDepuisTableau`). Rien à proposer sinon : pas de lien plutôt
   qu'un lien qui ouvrirait une démonstration à côté de la plaque. */
function etayageTableauRate(ex: Tableau): { etayage?: EtayageDemande } {
	const spec = conversionDepuisTableau(ex);
	if (!spec) return {};
	return {
		etayage: {
			lesson,
			niveau: niveauLecon(lesson),
			mode,
			exemple: { moteur: 'conversion', spec },
		},
	};
}

/* Ce que le tableau enseigne au-delà du geste : le 0 qui MARQUE un rang vide. Affiché quand
   la réponse n'est pas donnée — erreur ou question passée (#467), les deux cas où l'enfant a
   justement besoin de l'explication.

   Les colonnes nommées sont celles qui SÉPARENT l'unité donnée de l'unité cherchée et qui
   attendent un 0 : ce sont elles, le rang à tenir. Jusqu'à #711 on les repérait par le
   drapeau `transit` (« unité pas encore vue en classe »), ce qui tombait juste par
   coïncidence tant que le tableau s'arrêtait sur la paire convertie. Depuis que la tranche
   est fixe et que le CM1 a toute sa chaîne de rangs au programme, plus AUCUNE colonne n'y est
   de transit : l'explication aurait disparu au niveau même où le tableau est le plus large.
   Effet de bord assumé : elle apparaît désormais aussi sur les contenances au CE2, où le
   décilitre tient bien un rang vide entre le litre et le centilitre sans avoir jamais été
   « pas encore vu ». C'est ce que la phrase a toujours voulu dire. */
function explicationRangVide(ex: Tableau): string {
	const bornes = bornesColonnes(ex.colonnes, ex.uniteConnue, ex.answerUnit);
	if (!bornes) return '';
	const vides = ex.colonnes
		.slice(bornes.gauche + 1, bornes.droite)
		.filter((c) => Number(c.chiffres) === 0);
	if (vides.length === 0) return '';
	return vides.length === 1
		? `Pense au 0 de l'unité intermédiaire (le ${vides[0].nom}) pour marquer le rang vide.`
		: `Pense aux 0 des unités intermédiaires (${vides.map((c) => pluriel(c.nom)).join(', ')}) pour marquer les rangs vides.`;
}

/* « Je ne sais pas, montre-moi » (#467) : la réponse est révélée en TEXTE (« 3 000 m »),
   comme après une erreur, sans corriger les cases — « Vérifier » est justement encore inactif
   à ce stade (le tableau n'est pas rempli) et marquer ✗ des cases jamais remplies serait faux.
   Les cases déjà écrites restent VISIBLES, à comparer avec la réponse, mais plus modifiables
   (`frozen` + désarmement du DOM par `revelerSolution`). Le tableau compte au dénominateur
   (score inchangé ⇒ 0 XP) et n'est pas rejoué. */
function passer(): void {
	if (frozen) return;
	frozen = true;
	const ex = questions[idx];
	// Même graphie que dans le feedback de correction (#501) : le journal, la ligne révélée
	// et l'annonce lisent la MÊME variable, donc disent le même nombre.
	const attendueTexte = `${formatReponseRevelee(ex.answer)} ${ex.answerUnit}`;
	// Une entrée « n'a pas essayé » pour le tableau, jamais le nombre relu dans les cases : un
	// tableau incomplet ne se relit pas en nombre (il manque des chiffres), et un « 3,07 km »
	// reconstruit sur des cases vides ferait croire à une erreur de conversion inexistante.
	// EXCEPTION ASSUMÉE, et non un oubli : les autres formats à saisie contrainte journalisent
	// bien la tentative commencée (un repère déjà placé sur la droite graduée, des cases déjà
	// cochées d'un QCM multi, une sous-question de problème déjà remplie — cf.
	// core/probleme-etapes.ts). Ici la réponse n'est pas une case mais la LECTURE de toutes les
	// cases ensemble : elle n'existe pas tant qu'il en manque une, donc il n'y a aucune réponse
	// donnée à montrer au parent, même partielle.
	capterPasse({
		text: ex.question,
		attendue: attendueTexte,
		lessonId: lesson.id,
	});
	paintAll(); // retire la surbrillance de la case active (plus de saisie en cours)
	marquerVirgule(ex, null); // montre OÙ la virgule allait, sans juger celle qui est posée
	const explication = explicationRangVide(ex);
	// L'index avance AVANT tout affichage : la photo de reprise (#498) est prise quand
	// l'enfant quitte l'écran, et un tableau déjà révélé ne doit jamais lui être reposé.
	idx++;
	revelerSolution({
		root: sheets(),
		feedback: sheets().querySelector('#tcFeedback') as HTMLElement,
		actions: sheets().querySelector('#tcActions') as HTMLElement,
		repHTML: ligneRevelation('la réponse', html`${attendueTexte}`),
		extraHTML: explication ? html`<p class="lqcm-expl">${explication}</p>` : VIDE,
		annonce: `La réponse : ${attendueTexte}.`,
		isLast: idx >= questions.length,
		onNext: () => {
			if (idx >= questions.length) finish();
			else renderQuestion();
		},
	});
}

function finish(): void {
	detachKeys();
	renderLeconResult({
		out: finishLeconRun(lesson.id, score, questions.length),
		score,
		total: questions.length,
		category: lesson.category,
		onAgain: () => runLeconTableau(lesson.id, mode),
	});
}
