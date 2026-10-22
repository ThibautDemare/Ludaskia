/* ============================================================
   Bilan en PARCOURS guidé (#777) — écran.
   ------------------------------------------------------------
   Tout bilan joué à l'écran passe par ici (configurateur, favoris, « Bilan express » et
   « Bilan complet » de catégorie, programme du jour) ; la page unique ne sert plus qu'à
   l'impression. Trois écrans, dans `#sheets` :

   A. une QUESTION par écran, avec le vrai exercice de la leçon (mêmes widgets que la
      révision espacée), en mode COLLECTE : « Valider » lit la réponse et passe à la
      suite, sans aucun verdict ni marque juste/faux ; « Je passe » laisse la question
      sans réponse ;
   B. la FIN DE PARTIE : d'abord les réussites, puis chaque erreur (question, réponse
      donnée, bonne réponse). C'est là, et seulement là, que la partie est corrigée et
      que ses erreurs partent au journal du parent (#391) ;
   C. le RÉCAPITULATIF : un verdict et un score brut par leçon, le nombre de leçons
      réussies, « Réviser mes erreurs ».

   Toute la logique (tirage, découpage, correction, verdict, phrases) vit dans
   `core/bilan-parcours.ts` ; ici, le rendu, la collecte, le journal, le crédit (UNE fois,
   à la correction de la dernière partie) et la reprise (`runner-reprise.ts`).
   ============================================================ */
import { CATEGORIES, getLessonById, type BilanConfig } from '../core/catalog';
import { labelLecon } from '../core/levels';
import { niveauLecon } from '../core/niveau-actif';
import { consignePourNiveau } from '../core/exercise';
import type { QuestionRevision } from '../core/revision-question';
import type { ResumeParcours } from '../core/resume';
import type { TypeAide } from '../core/aide';
import {
	assezDeReponses,
	construireParcours,
	corrigerQuestion,
	debutsDesParties,
	libellePartieSur,
	libellePartieTerminee,
	libelleQuestionSur,
	libelleReussites,
	libelleScore,
	libelleScoreLu,
	libelleSeuilNonAtteint,
	libelleTotalRecap,
	MOT_VERDICT,
	positionDuRang,
	premiereSansReponse,
	repartirEnParties,
	syntheseParLecon,
	trierParVerdict,
	type Correction,
	type ErreurCorrigee,
	type PartieBilan,
	type ReponseQuestion,
	type VerdictLecon,
} from '../core/bilan-parcours';
import {
	ariaChamp,
	createRenderContext,
	enonceTexte,
	figureBlock,
	formatChampReponse,
	poserAuTrou,
	renderItem,
	TEXT_ANSWER_INPUT_ATTRS,
} from '../core/items';
import { libelleChoix, PONCT_MOTS, questionPourJournal } from '../core/erreur-representation';
import { recordLessonRun, type LessonRunOutcome } from '../core/lesson-run';
import { ttsAttr } from '../core/tts-text';
import { html, type SafeHtml, VIDE, joindre, attribut } from '../core/html';
import type { IconName } from '../core/icon-names';
import {
	goHome,
	hideMenus,
	setCurrentFavoriId,
	setCurrentLessonId,
	setCurrentMode,
	setToolbar,
} from './navigation';
import type { ResumeCtx } from './resume';
import {
	declarerSessionParcours,
	enregistrerParcours,
	finirSessionParcours,
	quitterSessionRunner,
} from './runner-reprise';
import { capterErreur } from './erreur-capture';
import { capterPasse } from './revelation-neutre';
import { bindTuileInteraction, type TuileController } from './tuile-interaction';
import { bindAppariement } from './appariement';
import { bindClicMot } from './clic-mot-interaction';
import { bindSegmentMot } from './segment-mot-interaction';
import { renderProblemeBoardHTML } from './lecon-probleme';
import { brouillonHTML, bindBrouillon } from './brouillon';
import { bindConsigneTts } from './consigne-tts';
import { focaliserChamp } from './anti-suggestion';
import { monterBoutonAide } from './aide-exercice';
import { resetChrono } from './chrono';
import { icon } from './icon';

/** Nom stable du parcours dans le registre de reprise (`runner-reprise.ts`). */
const RUNNER = 'bilan-parcours';

/* ---------- État du parcours en cours ---------- */

interface EtatParcours {
	config: BilanConfig;
	/** Contexte de reprise du bilan, `null` quand il ne se reprend pas (classe choisie, #772). */
	ctx: ResumeCtx | null;
	/** « Réviser mes erreurs » : on rejoue les questions ratées, sans crédit, sans journal
	    ni reprise — comme l'ancienne reprise des erreurs (`runRevision`). */
	rejeu: boolean;
	parties: PartieBilan[];
	/** Réponse de chaque question, au rang global ; `null` = pas encore traitée. */
	reponses: (ReponseQuestion | null)[];
	/** Parties déjà corrigées (journal écrit) : ni re-corrigées ni re-journalisées. */
	partiesCorrigees: number;
	/** Temps passé avant la session courante (reprise), et début de celle-ci. */
	ecouleMs: number;
	debutMs: number;
	/** Issue du crédit (bilan clos et compté), ou `null`. */
	credit: LessonRunOutcome | null;
	/** Le bilan est-il compté (règle des 60 %) ? `null` tant qu'il n'est pas clos. */
	compte: boolean | null;
}

let etat: EtatParcours | null = null;

/* Ce que l'écran sait lire de la question affichée : la réponse collectée. */
let lireReponse: (() => ReponseQuestion) | null = null;

/* Questions de toutes les parties, à plat (le rang global de chacune est son index). */
const toutesLesQuestions = (e: EtatParcours): QuestionRevision[] =>
	e.parties.flatMap((p) => p.questions);

/* Mode d'enregistrement d'un bilan, inchangé (#35) : « complet » quand toutes les
   questions sont demandées, « express » sinon. */
const modeBilan = (config: BilanConfig): 'complet' | 'express' =>
	config.questionsPerLesson === 'all' ? 'complet' : 'express';

const sheets = (): HTMLElement => document.getElementById('sheets')!;

/* ---------- Lancement, reprise ---------- */

/** Lance le parcours d'un bilan. `ctx` : contexte de reprise (`null` = pas de reprise). */
export function lancerParcours(config: BilanConfig, ctx: ResumeCtx | null): void {
	const parties = construireParcours(config);
	if (!parties.length) return;
	demarrer({
		config,
		ctx,
		rejeu: false,
		parties,
		reponses: parties.flatMap((p) => p.questions.map(() => null)),
		partiesCorrigees: 0,
		ecouleMs: 0,
		debutMs: Date.now(),
		credit: null,
		compte: null,
	});
}

/* État sauvegardé avec l'instantané, en plus des parties (`questions`) et du rang (`idx`). */
interface EtatSauve {
	reponses: (ReponseQuestion | null)[];
	partiesCorrigees: number;
	ecouleMs: number;
}

/* Forme des parties relues d'un instantané (aller-retour JSON) : de quoi rejouer. Le
   contenu des questions est celui que ce même écran a écrit. */
function partiesRelues(x: unknown): x is PartieBilan[] {
	return (
		Array.isArray(x) &&
		x.length > 0 &&
		x.every(
			(p) =>
				typeof p === 'object' &&
				p !== null &&
				'categoryId' in p &&
				typeof p.categoryId === 'string' &&
				'questions' in p &&
				Array.isArray(p.questions),
		)
	);
}

function etatRelu(x: unknown, total: number): x is EtatSauve {
	return (
		typeof x === 'object' &&
		x !== null &&
		'reponses' in x &&
		Array.isArray(x.reponses) &&
		x.reponses.length === total &&
		'partiesCorrigees' in x &&
		typeof x.partiesCorrigees === 'number' &&
		'ecouleMs' in x &&
		typeof x.ecouleMs === 'number'
	);
}

/* Reprise (#777, critère 16) : on rejoue les questions DÉJÀ TIRÉES avec les réponses déjà
   données et les parties déjà corrigées ; l'écran rouvre la première question sans
   réponse. L'instantané a fait un aller-retour JSON (déjà revivifié par
   `restaurerRunner`) : sa forme est celle que `etatPhotographie` a écrite. Une forme
   inattendue (instantané d'une autre version) rend la main à l'accueil. */
enregistrerParcours(RUNNER, (snap: ResumeParcours) => {
	const parties = snap.questions;
	const total = partiesRelues(parties) ? parties.reduce((s, p) => s + p.questions.length, 0) : 0;
	const sauve = snap.parcours;
	if (!partiesRelues(parties) || !total || !etatRelu(sauve, total)) {
		goHome();
		return;
	}
	demarrer({
		config: snap.relaunch.config,
		ctx: {
			key: snap.key,
			mode: snap.mode,
			label: snap.label,
			icon: snap.icon,
			categoryId: snap.categoryId,
			relaunch: snap.relaunch,
		},
		rejeu: false,
		parties,
		reponses: sauve.reponses,
		partiesCorrigees: sauve.partiesCorrigees,
		ecouleMs: sauve.ecouleMs,
		debutMs: Date.now(),
		credit: null,
		compte: null,
	});
});

function demarrer(e: EtatParcours): void {
	etat = e;
	setCurrentMode(e.rejeu ? 'revision' : modeBilan(e.config));
	setCurrentLessonId(null);
	setCurrentFavoriId(e.rejeu ? null : e.config.id || null);
	hideMenus();
	// Ni « Vérifier » ni chrono (critère 17) : la correction est celle de la fin de partie,
	// et le temps se mesure sans s'afficher.
	setToolbar({ verify: false, home: true, profile: false });
	resetChrono();
	if (e.ctx && !e.rejeu)
		declarerSessionParcours({
			runner: RUNNER,
			identite: {
				key: e.ctx.key,
				mode: e.ctx.mode,
				label: e.ctx.label,
				icon: e.ctx.icon,
				categoryId: e.ctx.categoryId,
				config: e.config,
			},
			etat: () => etatPhotographie(e),
		});
	else quitterSessionRunner();
	afficherEcranCourant();
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Ce que la reprise photographie, relu à l'instant de la photo. */
function etatPhotographie(e: EtatParcours) {
	const sauve: EtatSauve = {
		reponses: e.reponses,
		partiesCorrigees: e.partiesCorrigees,
		ecouleMs: e.ecouleMs + (Date.now() - e.debutMs),
	};
	const idx = premiereSansReponse(e.reponses);
	const score = toutesLesQuestions(e)
		.slice(0, idx)
		.filter((q, i) => corriger(q, e.reponses[i]).reussi).length;
	return {
		parties: e.parties,
		idx,
		total: e.reponses.length,
		score,
		parcours: sauve,
	};
}

const PASSE: ReponseQuestion = { kind: 'passe' };
const corriger = (q: QuestionRevision, r: ReponseQuestion | null): Correction =>
	corrigerQuestion(q, r ?? PASSE);

/* Écran à montrer d'après l'état : la première question sans réponse, la fin d'une partie
   répondue mais pas encore corrigée, ou le récapitulatif. */
function afficherEcranCourant(): void {
	const e = etat;
	if (!e) return;
	const rang = premiereSansReponse(e.reponses);
	const pos = positionDuRang(e.parties, rang);
	if (pos && pos.partie <= e.partiesCorrigees) {
		afficherQuestion(pos.partie, pos.question);
		return;
	}
	const aCorriger = pos ? pos.partie - 1 : e.parties.length - 1;
	if (aCorriger >= e.partiesCorrigees) {
		corrigerPartie(aCorriger);
		afficherFinPartie(aCorriger);
		return;
	}
	afficherRecap();
}

/* ---------- Écran A : une question ---------- */

/* Squelette de l'écran de question, rendu à l'entrée d'une partie. Le NŒUD de l'en-tête
   survit d'une question à l'autre : `.bp-question-num` est une région polie, qui n'annonce
   que si son texte CHANGE dans un nœud déjà là. */
function rendreSquelette(): void {
	const e = etat!;
	const titre = e.rejeu ? 'Révision — tes erreurs' : e.config.label;
	sheets().innerHTML = html`<div class="bilan-parcours">
    <h2 class="bilan-title bp-titre">${titre}</h2>
    <div class="bp-entete">
      <div class="bp-entete-ligne">
        <span class="bp-partie-nom"></span>
        <span class="bp-partie-num"></span>
      </div>
      <p class="bp-question-num" aria-live="polite" aria-atomic="true"></p>
      <div class="bp-progression" role="progressbar" aria-label="Avancée du bilan" aria-valuemin="0">
        <div class="bp-progression-fill"></div>
      </div>
    </div>
    <div class="bp-stage" id="bpStage" tabindex="-1"></div>
    <div class="bp-decide">
      <button type="button" class="bp-valider" id="bpValider" disabled>Valider</button>
      <button type="button" class="bp-passer" id="bpPasser">Je passe</button>
    </div>
  </div>`.balisage;
	const racine = sheets().querySelector<HTMLElement>('.bilan-parcours')!;
	document.getElementById('bpValider')!.addEventListener('click', valider);
	document.getElementById('bpPasser')!.addEventListener('click', () => enregistrer(PASSE));
	// Entrée dans un champ : valide si la réponse est complète, sinon mène au champ vide
	// suivant. Arrêtée ICI : l'écouteur global de la fiche (`ui/session.ts`) corrigerait
	// sinon la page entière sur Entrée dans une case d'opération posée (`.ans`).
	racine.addEventListener('keydown', (ev) => {
		const cible = ev.target;
		if (ev.key !== 'Enter' || !(cible instanceof HTMLInputElement)) return;
		ev.preventDefault();
		ev.stopPropagation();
		const bouton = document.getElementById('bpValider') as HTMLButtonElement | null;
		if (bouton && !bouton.disabled) {
			valider();
			return;
		}
		champsAttendus()
			.find((c) => c.value.trim() === '')
			?.focus();
	});
	// Le champ qui prend le focus reste visible au-dessus du clavier de la tablette.
	racine.addEventListener('focusin', (ev) => {
		if (ev.target instanceof HTMLInputElement)
			ev.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
}

/* Champs à remplir de la question affichée (saisie, cases d'une posée, étapes). */
function champsAttendus(): HTMLInputElement[] {
	const stage = document.getElementById('bpStage');
	if (!stage) return [];
	return [...stage.querySelectorAll<HTMLInputElement>('#bpInput, .posee-input, .prob-input')];
}

function afficherQuestion(k: number, i: number): void {
	const e = etat!;
	if (!document.getElementById('bpStage')) rendreSquelette();
	const partie = e.parties[k];
	const q = partie.questions[i];
	const total = e.reponses.length;
	const faites = premiereSansReponse(e.reponses);
	// En-tête : partie (sa catégorie), « Partie k sur n », « Question i sur m », progression.
	const racine = sheets();
	racine.querySelector('.bp-partie-nom')!.textContent =
		CATEGORIES.find((c) => c.id === partie.categoryId)?.label ?? '';
	racine.querySelector('.bp-partie-num')!.textContent = libellePartieSur(k + 1, e.parties.length);
	racine.querySelector('.bp-question-num')!.textContent = libelleQuestionSur(
		i + 1,
		partie.questions.length,
	);
	const barre = racine.querySelector<HTMLElement>('.bp-progression')!;
	barre.setAttribute('aria-valuemax', String(total));
	barre.setAttribute('aria-valuenow', String(faites));
	barre.setAttribute('aria-valuetext', `${faites} sur ${total}`);
	barre.querySelector<HTMLElement>('.bp-progression-fill')!.style.width =
		`${Math.round((faites / total) * 100)}%`;

	const stage = document.getElementById('bpStage')!;
	const boutonValider = document.getElementById('bpValider') as HTMLButtonElement;
	boutonValider.disabled = true;
	const pret = (ok: boolean) => (boutonValider.disabled = !ok);
	stage.className = 'bp-stage';
	stage.dataset.kind = q.kind === 'num' && q.item.posed ? 'posee' : q.kind;
	stage.dataset.lesson = q.lessonId;
	if (q.kind === 'qcm') stage.dataset.answer = String(q.item.answer);
	else if (q.kind === 'tuile') stage.dataset.answer = q.answer;
	else delete stage.dataset.answer;
	lireReponse = monterQuestion(stage, q, pret);
	bindConsigneTts(stage); // bouton « Écouter » de la consigne (#42)
	const aide = typeAide(q);
	stage.classList.toggle('bp-stage--aide', !!aide);
	// Le bouton d'aide au GESTE seulement : jamais ouvert d'office pendant un bilan.
	if (aide) monterBoutonAide(stage, aide);
	// Fondu d'entrée rejoué à chaque question (le nœud survit, la classe doit repartir).
	stage.classList.remove('bp-entree');
	void stage.offsetWidth;
	stage.classList.add('bp-entree');
	const champ = document.getElementById('bpInput');
	if (champ) focaliserChamp(champ);
	else stage.focus({ preventScroll: true });
}

/* Consigne de la question : le titre de la leçon (au niveau joué), puis l'action. Pour un
   widget, l'action est celle de son GESTE (« Clique sur le verbe », « Range ces mots… ») —
   jamais la consigne écrite d'une fiche, qui dirait « Recopie » ou « Écris » devant des
   mots à toucher ; la tuile porte la sienne dans le widget. Sinon, la consigne renforcée du
   QCM ou la consigne d'action du type. */
function consigneHTML(q: QuestionRevision, enonceParle?: string): SafeHtml {
	const lesson = getLessonById(q.lessonId);
	const niveau = lesson ? niveauLecon(lesson) : undefined;
	const titre = lesson ? labelLecon(lesson, niveau) : '';
	let action: string | undefined;
	switch (q.kind) {
		case 'clicMot':
			action = q.actionConsigne;
			break;
		case 'ordre':
		case 'tri':
		case 'appariement':
			action = q.question;
			break;
		case 'tuile':
			action = undefined;
			break;
		case 'qcm':
			action =
				q.consigneRenforcee ??
				(lesson ? consignePourNiveau(lesson.exerciseType, niveau) : undefined);
			break;
		default:
			action = lesson ? consignePourNiveau(lesson.exerciseType, niveau) : undefined;
	}
	// Lecture vocale : la consigne PUIS l'énoncé (même contrat qu'en révision) ; un énoncé
	// volontairement muet (`parle: ''`) le reste.
	const lu = [action, enonceParle].filter((t) => !!t).join(' ');
	const actionHTML = action
		? html`<span class="bp-consigne-action"${lu ? ttsAttr(lu) : ''}>${action}</span>`
		: VIDE;
	return html`<div class="bp-consigne"><span class="bp-consigne-titre">${titre}</span>${actionHTML}</div>`;
}

/* Monte la question dans la carte et renvoie de quoi lire sa réponse. `pret` (dés)active
   « Valider » selon que la réponse est complète. */
function monterQuestion(
	stage: HTMLElement,
	q: QuestionRevision,
	pret: (ok: boolean) => void,
): () => ReponseQuestion {
	switch (q.kind) {
		case 'num':
			return q.item.posed ? monterPosee(stage, q, pret) : monterSaisie(stage, q, pret);
		case 'qcm':
			return monterQcm(stage, q, pret);
		case 'tuile':
		case 'ordre':
		case 'tri':
			return monterTuiles(stage, q, pret);
		case 'appariement': {
			stage.innerHTML = html`${consigneHTML(q)}<div data-tuile-mount></div>`.balisage;
			const ctrl = bindAppariement(
				stage,
				{ question: q.question, paires: q.paires, intrus: q.intrus },
				{ variant: 'revision', onState: pret },
			);
			return () => reponseWidget(ctrl, q);
		}
		case 'probleme': {
			const board = renderProblemeBoardHTML(
				{
					enonce: q.enonce,
					etapes: q.etapes,
					parle: q.parle,
					figure: q.figure,
					explication: q.explication,
				},
				q.lex,
			);
			stage.innerHTML =
				html`${consigneHTML(q)}<div class="bp-probleme">${board}</div>${brouillonHTML()}`.balisage;
			bindBrouillon(stage);
			const cases = [...stage.querySelectorAll<HTMLInputElement>('.prob-input')];
			const maj = () => pret(cases.every((c) => c.value.trim() !== ''));
			cases.forEach((c) => c.addEventListener('input', maj));
			return () => ({ kind: 'probleme', saisies: cases.map((c) => c.value.trim()) });
		}
		case 'clicMot': {
			stage.innerHTML = html`${consigneHTML(q)}<div data-tuile-mount></div>`.balisage;
			const monter = q.segment ? bindSegmentMot : bindClicMot;
			const ctrl = monter(
				stage,
				{
					tokens: q.tokens,
					cibleIndices: q.cibleIndices,
					parle: q.parle,
					cibleLabel: q.cibleLabel,
				},
				{ onState: pret },
			);
			return () => ({ kind: 'clicMot', indices: ctrl.selected() });
		}
	}
}

/* Valeur attendue telle que l'enfant la tape (virgule décimale) : sert de repère `data-answer`. */
function valeurTapee(answer: number | string): string {
	return typeof answer === 'number' ? String(answer).replace('.', ',') : answer;
}

function monterSaisie(
	stage: HTMLElement,
	q: Extract<QuestionRevision, { kind: 'num' }>,
	pret: (ok: boolean) => void,
): () => ReponseQuestion {
	const it = q.item;
	const texte = it.kind === 'text' || it.kind === 'heure';
	const attendue = attribut('data-answer', valeurTapee(it.answer));
	const nom = ariaChamp(it, formatChampReponse(it));
	const decimal =
		String(it.answer).includes(',') ||
		(typeof it.answer === 'number' && !Number.isInteger(it.answer));
	const champ = texte
		? html`<input id="bpInput" class="bp-input bp-input-text"${nom}${attendue} ${TEXT_ANSWER_INPUT_ATTRS}>`
		: html`<input id="bpInput" class="bp-input" inputmode="${decimal ? 'decimal' : 'numeric'}" autocomplete="off"${nom}${attendue}>`;
	// Le `@` place le champ ; un énoncé sans trou (question à figure) le reçoit à sa suite.
	const enonce = it.text.includes('@')
		? poserAuTrou(enonceTexte(it.text), '@', champ)
		: html`${enonceTexte(it.text)} ${champ}`;
	stage.innerHTML =
		html`${consigneHTML(q, it.parle ?? it.text)}${figureBlock(it.figure)}<div class="bp-enonce">${enonce}</div>`.balisage;
	const inp = stage.querySelector<HTMLInputElement>('#bpInput')!;
	inp.addEventListener('input', () => pret(inp.value.trim() !== ''));
	return () => ({ kind: 'saisie', valeur: inp.value });
}

function monterPosee(
	stage: HTMLElement,
	q: Extract<QuestionRevision, { kind: 'num' }>,
	pret: (ok: boolean) => void,
): () => ReponseQuestion {
	// Contexte de rendu jetable (#352) : les cellules se lisent dans le DOM (`.posee-input`).
	// Seules les cellules à TROUVER comptent ; les retenues (`.posee-carry`) restent une aide.
	stage.innerHTML =
		html`${consigneHTML(q)}<div class="bp-posee">${renderItem(q.item, createRenderContext())}</div>`.balisage;
	const cases = [...stage.querySelectorAll<HTMLInputElement>('.posee-input')];
	const maj = () => pret(cases.every((c) => c.value.trim() !== ''));
	cases.forEach((c) => c.addEventListener('input', maj));
	return () => ({ kind: 'posee', chiffres: cases.map((c) => c.value.trim()) });
}

function monterQcm(
	stage: HTMLElement,
	q: Extract<QuestionRevision, { kind: 'qcm' }>,
	pret: (ok: boolean) => void,
): () => ReponseQuestion {
	const ponct = q.variante === 'ponctuation';
	// Libellé LU d'un choix (aria-label quand il diffère du choix brut) et contenu AFFICHÉ :
	// le mot d'un signe de ponctuation, la vue riche d'une fraction, sinon le choix.
	const label = (v: string): string =>
		ponct ? (PONCT_MOTS[v] ?? v) : libelleChoix(q.choices, q.choicesView, v);
	const vue = (i: number): SafeHtml => {
		const riche = ponct ? undefined : q.choicesView?.[i];
		return riche ? riche.html : html`${label(q.choices[i])}`;
	};
	const trou = html`<span class="bp-trou" aria-hidden="true"></span>`;
	stage.innerHTML =
		html`${consigneHTML(q, q.item.parle ?? q.item.text)}${figureBlock(q.item.figure)}
    <div class="bp-enonce">${poserAuTrou(enonceTexte(q.item.text), '@', trou)}</div>
    <div class="bp-choix" role="group" aria-label="Choix de réponse">${joindre(
			q.choices.map((c, i) => {
				const aria = label(c) === c ? VIDE : attribut('aria-label', label(c));
				return html`<button type="button" class="bp-choice" data-value="${c}" data-i="${i}" aria-pressed="false"${aria}>${vue(i)}</button>`;
			}),
		)}</div>`.balisage;
	let choisi: string | null = null;
	const boutons = [...stage.querySelectorAll<HTMLButtonElement>('.bp-choice')];
	const caseTrou = stage.querySelector<HTMLElement>('.bp-trou');
	boutons.forEach((btn) =>
		btn.addEventListener('click', () => {
			choisi = btn.dataset.value ?? null;
			for (const b of boutons) b.setAttribute('aria-pressed', String(b === btn));
			// Toucher un choix le place dans le trou (critère 1) : la phrase se relit entière.
			if (caseTrou) {
				caseTrou.textContent = ponct ? (choisi ?? '') : label(choisi ?? '');
				caseTrou.classList.toggle('bp-trou--rempli', choisi !== null);
			}
			pret(choisi !== null);
		}),
	);
	return () => ({ kind: 'choix', valeur: choisi ?? '' });
}

function monterTuiles(
	stage: HTMLElement,
	q: Extract<QuestionRevision, { kind: 'tuile' | 'ordre' | 'tri' }>,
	pret: (ok: boolean) => void,
): () => ReponseQuestion {
	stage.innerHTML = html`${consigneHTML(q)}<div data-tuile-mount></div>`.balisage;
	const opts = { variant: 'revision' as const, onState: pret };
	const ctrl =
		q.kind === 'tuile'
			? bindTuileInteraction(
					stage,
					{
						kind: 'tuile',
						question: q.question,
						answer: q.answer,
						tuiles: q.tuiles,
						parle: q.parle,
					},
					opts,
				)
			: q.kind === 'ordre'
				? bindTuileInteraction(
						stage,
						{
							kind: 'ordre',
							question: q.question,
							ordre: q.ordre,
							tuiles: q.tuiles,
							nature: q.nature,
						},
						opts,
					)
				: bindTuileInteraction(
						stage,
						{ kind: 'tri', question: q.question, categories: q.categories, mots: q.mots },
						opts,
					);
	return () => reponseWidget(ctrl, q);
}

/* Réponse posée dans un widget à tuiles, telle que le widget l'expose (`reponse()`), sans
   jamais appeler `verify()` : aucune marque avant la fin de la partie (critère 10). */
function reponseWidget(ctrl: TuileController, q: QuestionRevision): ReponseQuestion {
	const r = ctrl.reponse?.();
	if (r) return r;
	return q.kind === 'tuile' ? { kind: 'tuile', posee: null } : PASSE;
}

/* Aide au geste (#272) du format affiché, comme en révision ; aucune pour une saisie. */
function typeAide(q: QuestionRevision): TypeAide | undefined {
	switch (q.kind) {
		case 'tuile':
			return 'tuiles';
		case 'ordre':
			return q.nature === 'nombres' ? 'ordreNombres' : 'ordre';
		case 'tri':
			return 'tri';
		case 'appariement':
			return q.colonneDroite === 'etiquettes' ? 'appariementEtiquettes' : 'appariement';
		case 'clicMot':
			return q.segment ? 'segmentMot' : 'clicMot';
		default:
			return undefined;
	}
}

function valider(): void {
	const bouton = document.getElementById('bpValider') as HTMLButtonElement | null;
	if (!bouton || bouton.disabled || !lireReponse) return;
	enregistrer(lireReponse());
}

/* Range la réponse de la question affichée, puis passe à la suivante, ou corrige la partie
   quand c'était sa dernière question. */
function enregistrer(r: ReponseQuestion): void {
	const e = etat;
	if (!e) return;
	const rang = premiereSansReponse(e.reponses);
	const pos = positionDuRang(e.parties, rang);
	if (!pos) return;
	e.reponses[rang] = r;
	lireReponse = null;
	if (pos.question + 1 < e.parties[pos.partie].questions.length) {
		afficherQuestion(pos.partie, pos.question + 1);
		return;
	}
	corrigerPartie(pos.partie);
	afficherFinPartie(pos.partie);
}

/* ---------- Correction d'une partie : journal, crédit ---------- */

/* Corrige la partie `k` UNE fois : ses erreurs partent au journal du parent, et la
   dernière partie clôt le bilan (crédit). Une partie déjà corrigée (reprise) ne refait
   rien. */
function corrigerPartie(k: number): void {
	const e = etat!;
	if (k < e.partiesCorrigees) return;
	e.partiesCorrigees = k + 1;
	if (e.rejeu) return; // révision des erreurs : déjà journalisées, rien à créditer
	const debut = debutsDesParties(e.parties)[k];
	e.parties[k].questions.forEach((q, i) => {
		for (const err of corriger(q, e.reponses[debut + i]).erreurs) journaliser(q, err);
	});
	if (k === e.parties.length - 1) cloreBilan();
}

/* Journal du parent (#391) : une entrée par erreur ciblable, avec la leçon, l'énoncé
   lisible et les deux réponses ; une question passée suit la convention « n'a pas
   essayé » (`capterPasse`). Le dessin éventuel est signalé par le journal lui-même. */
function journaliser(q: QuestionRevision, err: ErreurCorrigee): void {
	const mode = modeBilan(etat!.config);
	const figure = figureDe(q);
	// Un énoncé qui n'est QUE « Exercice avec un dessin » le dit déjà : pas de double marque.
	const avecFigure = figure && err.enonce !== questionPourJournal('', true) ? figure : undefined;
	if (err.sansTentative && err.donnee === '') {
		capterPasse({
			text: err.enonce,
			figure: avecFigure,
			attendue: err.attendue,
			lessonId: q.lessonId,
			mode,
		});
		return;
	}
	capterErreur({
		text: err.enonce,
		figure: avecFigure,
		donnee: err.donnee,
		attendue: err.attendue,
		lessonId: q.lessonId,
		mode,
		sansTentative: err.sansTentative,
	});
}

function figureDe(q: QuestionRevision): SafeHtml | undefined {
	if (q.kind === 'num' || q.kind === 'qcm') return q.item.figure;
	if (q.kind === 'probleme') return q.figure;
	return undefined;
}

/* Clôture du bilan, après la correction de sa dernière partie : crédité UNE fois (critère
   15, N4) s'il compte (règle des 60 %), avec les stats par leçon et l'id du favori ; la
   reprise est effacée. */
function cloreBilan(): void {
	const e = etat!;
	const questions = toutesLesQuestions(e);
	const resultats = questions.map((q, i) => ({
		reussi: corriger(q, e.reponses[i]).reussi,
		repondue: (e.reponses[i]?.kind ?? 'passe') !== 'passe',
	}));
	const repondues = resultats.filter((r) => r.repondue).length;
	e.compte = assezDeReponses(repondues, questions.length);
	if (e.compte) {
		// Même agrégat que la fiche (`scoreItems`) : par leçon, les réussites sur les questions
		// RÉPONDUES ; une question passée ne compte que dans le total du bilan.
		const perLesson: Record<string, { ok: number; total: number }> = {};
		for (const b of syntheseParLecon(questions, resultats))
			perLesson[b.lessonId] = { ok: b.reussies, total: b.repondues };
		e.credit = recordLessonRun({
			mode: modeBilan(e.config),
			lessonId: null,
			ok: resultats.filter((r) => r.reussi).length,
			questionCount: questions.length,
			ms: e.ecouleMs + (Date.now() - e.debutMs),
			perLesson,
			favoriId: e.config.id || undefined,
		});
	}
	finirSessionParcours();
}

/* ---------- Écran B : fin de partie ---------- */

function afficherFinPartie(k: number): void {
	const e = etat!;
	const debut = debutsDesParties(e.parties)[k];
	const corrections = e.parties[k].questions.map((q, i) => ({
		q,
		c: corriger(q, e.reponses[debut + i]),
	}));
	const reussites = corrections.filter(({ c }) => c.reussi).length;
	const erreurs = corrections.flatMap(({ q, c }) => c.erreurs.map((err) => ({ q, err })));
	const derniere = k === e.parties.length - 1;
	const liste = erreurs.length
		? html`<h3 class="bp-revoir-titre">À revoir</h3>
      <ul class="bp-erreurs">${joindre(erreurs.map(({ q, err }, n) => erreurHTML(q, err, n)))}</ul>`
		: html`<p class="bp-aucune-erreur">Aucune erreur dans cette partie. Bravo !</p>`;
	const suite = derniere
		? html`<button type="button" class="bp-valider" id="bpVoirBilan">Voir mon bilan</button>`
		: html`<button type="button" class="bp-valider" id="bpPartieSuivante">Partie suivante</button>`;
	sheets().innerHTML = html`<div class="bilan-parcours">
    <div class="bp-fin-partie bp-carte" tabindex="-1">
      <h2 class="bp-fin-titre">${libellePartieTerminee(k + 1)}</h2>
      <p class="bp-reussites" data-nombre="${reussites}">${icon('check-circle')}<span>${libelleReussites(reussites)}</span></p>
      ${liste}
      <div class="bp-decide">${suite}</div>
    </div>
  </div>`.balisage;
	(document.getElementById('bpVoirBilan') ??
		document.getElementById('bpPartieSuivante'))!.addEventListener('click', () => {
		if (derniere) afficherRecap();
		else afficherQuestion(k + 1, 0);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	});
	sheets().querySelector<HTMLElement>('.bp-fin-partie')?.focus({ preventScroll: true });
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Une erreur : la question (avec son dessin), puis la réponse donnée — « Pas de réponse »
   pour une question passée —, puis la bonne réponse, toujours dans cet ordre. Ce sont les
   mots qui portent le sens ; la couleur ne fait que le doubler. */
function erreurHTML(q: QuestionRevision, err: ErreurCorrigee, n: number): SafeHtml {
	const donnee =
		err.sansTentative && err.donnee === ''
			? html`<p class="bp-erreur-donnee">Pas de réponse</p>`
			: html`<p class="bp-erreur-donnee">Ta réponse : <strong>${err.donnee}</strong></p>`;
	return html`<li class="bp-erreur" style="--bp-rang:${Math.min(n, 6)}">
      ${figureBlock(figureDe(q))}
      <p class="bp-erreur-enonce">${err.enonce}</p>
      ${donnee}
      <p class="bp-erreur-attendue">La bonne réponse : <strong>${err.attendue}</strong></p>
    </li>`;
}

/* ---------- Écran C : récapitulatif ---------- */

const ICONE_VERDICT: Record<VerdictLecon, IconName> = {
	reussi: 'check-circle',
	presque: 'quantity-2',
	'a-retravailler': 'book-open',
};

function afficherRecap(): void {
	const e = etat!;
	quitterSessionRunner(); // plus rien à photographier (bilan clos, ou révision des erreurs)
	const questions = toutesLesQuestions(e);
	const resultats = questions.map((q, i) => ({
		reussi: corriger(q, e.reponses[i]).reussi,
		repondue: (e.reponses[i]?.kind ?? 'passe') !== 'passe',
	}));
	const lignes = trierParVerdict(syntheseParLecon(questions, resultats));
	const reussies = lignes.filter((l) => l.verdict === 'reussi').length;
	const ratees = questions.filter((_, i) => !resultats[i].reussi);
	const lignesHTML = joindre(
		lignes.map((l) => {
			const lesson = getLessonById(l.lessonId);
			const nom = lesson ? labelLecon(lesson, niveauLecon(lesson)) : l.lessonId;
			return html`<li class="bp-lecon" data-lesson="${l.lessonId}" data-verdict="${l.verdict}">
        <div class="bp-lecon-texte">
          <span class="bp-lecon-nom">${nom}</span>
          <span class="bp-verdict bp-verdict--${l.verdict}">${icon(ICONE_VERDICT[l.verdict])}<span>${MOT_VERDICT[l.verdict]}</span></span>
        </div>
        <span class="bp-score" aria-hidden="true">${libelleScore(l.reussies, l.posees)}</span>
        <span class="sr-only">${libelleScoreLu(l.reussies, l.posees)}</span>
      </li>`;
		}),
	);
	const seuil =
		!e.rejeu && e.compte === false
			? html`<p class="bp-seuil">${libelleSeuilNonAtteint(questions.length)}</p>`
			: VIDE;
	const reviser = ratees.length
		? html`<button type="button" class="bp-valider" id="bpReviserErreurs">Réviser mes erreurs</button>`
		: VIDE;
	sheets().innerHTML = html`<div class="bilan-parcours">
    <div class="bp-recap bp-carte" tabindex="-1">
      <h2 class="bp-recap-titre">${e.rejeu ? 'Révision terminée' : 'Ton bilan'}</h2>
      <ul class="bp-lecons">${lignesHTML}</ul>
      <p class="bp-recap-total">${icon('check-circle')}<span>${libelleTotalRecap(reussies, lignes.length)}</span></p>
      ${recompensesHTML(e.credit)}
      ${seuil}
      <div class="bp-decide">
        ${reviser}
        <button type="button" class="bp-passer" id="bpAccueil">${icon('house')}<span>Retour à l'accueil</span></button>
      </div>
    </div>
  </div>`.balisage;
	document
		.getElementById('bpReviserErreurs')
		?.addEventListener('click', () => revoirErreurs(ratees));
	document.getElementById('bpAccueil')!.addEventListener('click', goHome);
	sheets().querySelector<HTMLElement>('.bp-recap')?.focus({ preventScroll: true });
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Ce que le bilan vient de rapporter (niveau, trophées, objectif du jour), DANS le
   récapitulatif plutôt qu'en modale : l'écran de fin du parcours est sans confettis
   (spécification de rendu, §4), et une modale masquerait les verdicts qu'il vient
   d'afficher. Rien quand il n'y a rien de neuf. */
function recompensesHTML(credit: LessonRunOutcome | null): SafeHtml {
	if (!credit) return VIDE;
	const lignes: SafeHtml[] = [];
	if (credit.niveauGagne)
		lignes.push(
			html`<li><span aria-hidden="true">⬆️</span> Tu passes au niveau ${credit.niveauGagne} !</li>`,
		);
	for (const r of credit.recompensesNiv)
		lignes.push(html`<li><span aria-hidden="true">${r.icone}</span> ${r.texte}</li>`);
	for (const c of credit.celeb)
		lignes.push(html`<li><span aria-hidden="true">${c.icon}</span> ${c.text}</li>`);
	return lignes.length ? html`<ul class="bp-recompenses">${joindre(lignes)}</ul>` : VIDE;
}

/* « Réviser mes erreurs » (critère 14) : les questions ratées du bilan, rejouées avec le
   même parcours (parties, correction en fin de partie, récapitulatif), sans crédit, sans
   journal ni reprise. */
function revoirErreurs(ratees: QuestionRevision[]): void {
	const e = etat;
	if (!e || !ratees.length) return;
	const parties = repartirEnParties(ratees);
	demarrer({
		config: e.config,
		ctx: null,
		rejeu: true,
		parties,
		reponses: ratees.map(() => null),
		partiesCorrigees: 0,
		ecouleMs: 0,
		debutMs: Date.now(),
		credit: null,
		compte: null,
	});
}
