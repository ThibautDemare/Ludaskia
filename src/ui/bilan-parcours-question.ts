/* ============================================================
   Bilan en PARCOURS guidé (#777) — écran A : une question.
   ------------------------------------------------------------
   Le vrai exercice de la leçon (mêmes widgets que la révision espacée), monté en mode
   COLLECTE : « Valider » lit la réponse et la rend à l'état du parcours, sans aucun
   verdict ni marque juste/faux ; « Je passe » rend une question sans réponse. Ce module
   ne sait rien de la suite : `EcranQuestion.repondre` décide (question suivante, fin de
   partie), dans `ui/bilan-parcours.ts`.
   ============================================================ */
import { getLessonById } from '../core/catalog';
import { labelLecon } from '../core/levels';
import { niveauLecon } from '../core/niveau-actif';
import { consignePourNiveau } from '../core/exercise';
import { typeAideDuGeste } from '../core/aide';
import type { QuestionRevision } from '../core/revision-question';
import {
	libelleAvancee,
	libellePartieSur,
	libelleQuestionSur,
	libelleTitreParcours,
	PASSE,
	TEXTES_PARCOURS,
	type ReponseQuestion,
} from '../core/bilan-parcours';
import {
	ariaChamp,
	createRenderContext,
	enonceTexte,
	figureBlock,
	formatChampReponse,
	legendeQcmTrou,
	MARQUE_TROU,
	poserAuTrou,
	renderItem,
	TEXT_ANSWER_INPUT_ATTRS,
} from '../core/items';
import { libelleChoix, PONCT_MOTS } from '../core/erreur-representation';
import { texteParle, ttsAttr } from '../core/tts-text';
import { html, type SafeHtml, VIDE, joindre, attribut } from '../core/html';
import { bindTuileInteraction, type TuileController } from './tuile-interaction';
import { bindAppariement } from './appariement';
import { bindClicMot } from './clic-mot-interaction';
import { bindSegmentMot } from './segment-mot-interaction';
import { renderProblemeBoardHTML } from './lecon-probleme';
import { brouillonHTML, bindBrouillon } from './brouillon';
import { bindConsigneTts } from './consigne-tts';
import { focaliserChamp } from './anti-suggestion';
import { monterBoutonAide } from './aide-exercice';
import { radioVisee } from './segment';

/** Ce que l'état du parcours donne à montrer, et à qui rendre la réponse. */
export interface EcranQuestion {
	/** Nom du bilan (ou de la révision des erreurs). */
	nomBilan: string;
	rejeu: boolean;
	/** Libellé de la catégorie de la partie. */
	categorie: string;
	partie: { numero: number; total: number };
	question: { numero: number; total: number };
	/** Questions déjà traitées, sur le total du bilan (la jauge). */
	avancee: { faites: number; total: number };
	q: QuestionRevision;
	/** La réponse collectée (ou `PASSE`) : l'état la range et montre la suite. */
	repondre: (r: ReponseQuestion) => void;
}

const sheets = (): HTMLElement => document.getElementById('sheets')!;

/* La question affichée : de quoi lire sa réponse, et à qui la rendre. */
let lireReponse: (() => ReponseQuestion) | null = null;
let repondre: ((r: ReponseQuestion) => void) | null = null;

/* Rend la réponse une seule fois : la question affichée n'a plus rien à lire. */
function transmettre(r: ReponseQuestion): void {
	const suite = repondre;
	lireReponse = null;
	repondre = null;
	suite?.(r);
}

/* Squelette de l'écran de question, rendu à l'entrée d'une partie. La carte `#bpStage` est
   un GROUPE nommé à chaque question (« Question 2 sur 5 ») : c'est elle qui reçoit le focus
   quand la question n'a pas de champ, et un focus sans nom ne dit rien à qui ne voit pas
   l'écran. Le numéro affiché n'est donc plus une région live (il serait lu deux fois).
   « Valider » n'est jamais `disabled` : `aria-disabled` le garde dans l'ordre de
   tabulation, et l'appuyer trop tôt DIT pourquoi rien ne se passe — à l'écran sous les
   boutons (`#bpMessage`, tu aux technologies d'assistance pour n'être pas lu deux fois),
   et à l'oreille dans `#bpStatut` (région insérée VIDE avec le squelette, remplie
   ensuite : c'est ce qui la fait lire). */
function rendreSquelette(titre: string): void {
	sheets().innerHTML = html`<div class="bilan-parcours">
    <h2 class="bilan-title bp-titre">${titre}</h2>
    <div class="bp-entete">
      <div class="bp-entete-ligne">
        <span class="bp-partie-nom"></span>
        <span class="bp-partie-num"></span>
      </div>
      <p class="bp-question-num" id="bpQuestionNum"></p>
      <div class="bp-progression" role="progressbar" aria-label="Progression du bilan" aria-valuemin="0">
        <div class="bp-progression-fill"></div>
      </div>
    </div>
    <div class="bp-stage" id="bpStage" role="group" tabindex="-1"></div>
    <div class="bp-decide">
      <button type="button" class="bp-valider" id="bpValider" aria-disabled="true">Valider</button>
      <button type="button" class="bp-passer" id="bpPasser">Je passe</button>
    </div>
    <p class="bp-message" id="bpMessage" aria-hidden="true" hidden></p>
    <p class="sr-only" id="bpStatut" role="status"></p>
  </div>`.balisage;
	const racine = sheets().querySelector<HTMLElement>('.bilan-parcours')!;
	document.getElementById('bpValider')!.addEventListener('click', valider);
	document.getElementById('bpPasser')!.addEventListener('click', () => transmettre(PASSE));
	// Entrée dans un champ : valide si la réponse est complète, sinon le dit et mène au champ
	// vide suivant. Arrêtée ICI : l'écouteur global de la fiche (`ui/session.ts`) corrigerait
	// sinon la page entière sur Entrée dans une case d'opération posée (`.ans`).
	racine.addEventListener('keydown', (ev) => {
		const cible = ev.target;
		if (ev.key !== 'Enter' || !(cible instanceof HTMLInputElement)) return;
		ev.preventDefault();
		ev.stopPropagation();
		if (reponseComplete()) {
			valider();
			return;
		}
		direReponseAttendue();
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

/* La réponse de la question affichée est-elle complète ? Lu sur « Valider », qui en porte
   l'état (`aria-disabled`) : une seule source, tenue par le `pret` de chaque format. */
function reponseComplete(): boolean {
	return document.getElementById('bpValider')?.getAttribute('aria-disabled') !== 'true';
}

/* Jeton de la dernière annonce : une question qui change entre-temps l'annule. */
let jetonStatut = 0;

/* Dit le message : tout de suite à l'écran (`#bpMessage`), et dans `#bpStatut` vidé
   d'abord — le même message redit (deuxième Entrée) doit être relu, et une région qui
   garde son texte ne réannonce rien. */
function direReponseAttendue(): void {
	const region = document.getElementById('bpStatut');
	const message = document.getElementById('bpMessage');
	if (message) {
		message.textContent = TEXTES_PARCOURS.reponseAttendue;
		message.hidden = false;
	}
	if (!region) return;
	const jeton = ++jetonStatut;
	region.textContent = '';
	window.setTimeout(() => {
		if (jeton === jetonStatut && region.isConnected)
			region.textContent = TEXTES_PARCOURS.reponseAttendue;
	}, 50);
}

/* Retire le message, à l'écran et dans `#bpStatut` (nouvelle question, réponse devenue
   complète), et annule l'annonce en vol. Par `hidden` et texte vidé, pas par une classe :
   rien ne dépend de la feuille de style. */
function viderStatut(): void {
	jetonStatut++;
	const region = document.getElementById('bpStatut');
	if (region) region.textContent = '';
	const message = document.getElementById('bpMessage');
	if (message) {
		message.textContent = '';
		message.hidden = true;
	}
}

/* Champs à remplir de la question affichée (saisie, cases d'une posée, étapes). */
function champsAttendus(): HTMLInputElement[] {
	const stage = document.getElementById('bpStage');
	if (!stage) return [];
	return [...stage.querySelectorAll<HTMLInputElement>('#bpInput, .posee-input, .prob-input')];
}

/** Montre une question : en-tête (partie, numéro, jauge), puis l'exercice dans la carte. Le
    squelette n'est rendu qu'à l'entrée d'une partie ; ensuite seule la carte change. */
export function afficherQuestion(ecran: EcranQuestion): void {
	if (!document.getElementById('bpStage'))
		rendreSquelette(libelleTitreParcours(ecran.rejeu, ecran.nomBilan));
	const { q, categorie, avancee } = ecran;
	// En-tête : partie (sa catégorie), « Partie k sur n », « Question i sur m », progression.
	const racine = sheets();
	const numero = libelleQuestionSur(ecran.question.numero, ecran.question.total);
	racine.querySelector('.bp-partie-nom')!.textContent = categorie;
	racine.querySelector('.bp-partie-num')!.textContent = libellePartieSur(
		ecran.partie.numero,
		ecran.partie.total,
	);
	racine.querySelector('.bp-question-num')!.textContent = numero;
	const barre = racine.querySelector<HTMLElement>('.bp-progression')!;
	barre.setAttribute('aria-valuemax', String(avancee.total));
	barre.setAttribute('aria-valuenow', String(avancee.faites));
	barre.setAttribute('aria-valuetext', libelleAvancee(avancee.faites, avancee.total));
	barre.querySelector<HTMLElement>('.bp-progression-fill')!.style.width =
		`${Math.round((avancee.faites / avancee.total) * 100)}%`;

	const stage = document.getElementById('bpStage')!;
	// Nom du groupe : le numéro, précédé de la catégorie à la 1re question d'une partie (on
	// vient de l'écran de fin de partie : c'est là que la catégorie change).
	stage.setAttribute(
		'aria-label',
		ecran.question.numero === 1 && categorie ? `${categorie}. ${numero}` : numero,
	);
	viderStatut();
	const boutonValider = document.getElementById('bpValider')!;
	const pret = (ok: boolean): void => {
		boutonValider.setAttribute('aria-disabled', String(!ok));
		if (ok) viderStatut();
	};
	pret(false);
	stage.className = 'bp-stage';
	stage.dataset.kind = q.kind === 'num' && q.item.posed ? 'posee' : q.kind;
	stage.dataset.lesson = q.lessonId;
	if (q.kind === 'qcm') stage.dataset.answer = String(q.item.answer);
	else if (q.kind === 'tuile') stage.dataset.answer = q.answer;
	else delete stage.dataset.answer;
	repondre = ecran.repondre;
	lireReponse = monterQuestion(stage, q, pret);
	bindConsigneTts(stage); // bouton « Écouter » de la consigne (#42)
	// Aide au geste (#272) du format affiché, la même table qu'en révision ; aucune pour une
	// saisie. Le bouton seulement : jamais ouverte d'office pendant un bilan.
	const aide = typeAideDuGeste(q);
	stage.classList.toggle('bp-stage--aide', !!aide);
	if (aide) monterBoutonAide(stage, aide);
	// Fondu d'entrée rejoué à chaque question (le nœud survit, la classe doit repartir).
	stage.classList.remove('bp-entree');
	void stage.offsetWidth;
	stage.classList.add('bp-entree');
	const champ = document.getElementById('bpInput');
	if (champ) focaliserChamp(champ);
	else stage.focus({ preventScroll: true });
}

/* « Valider » : rend la réponse si elle est complète, sinon dit pourquoi rien ne se passe. */
function valider(): void {
	if (!lireReponse) return;
	if (!reponseComplete()) {
		direReponseAttendue();
		return;
	}
	transmettre(lireReponse());
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
	// volontairement muet (`parle: ''`) le reste, et un texte déjà lu ne l'est pas deux fois
	// (homophones : `parle` y répète la consigne, pour taire la phrase).
	const lus: string[] = [];
	for (const t of [action, enonceParle])
		if (t && texteParle(t) && !lus.some((u) => memeLecture(u, t))) lus.push(t);
	const lu = lus.join(' ');
	// Le texte de l'action a son propre nœud (`#bpConsigneAction`), qui décrit le champ de
	// saisie (`aria-describedby`) sans emporter le bouton « Écouter » greffé à côté.
	const actionHTML = action
		? html`<span class="bp-consigne-action"${lu ? ttsAttr(lu) : VIDE}><span id="bpConsigneAction">${action}</span></span>`
		: VIDE;
	return html`<div class="bp-consigne"><span class="bp-consigne-titre" id="bpConsigneTitre">${titre}</span>${actionHTML}</div>`;
}

/* Deux textes se lisent-ils pareil ? Comparés après passage à l'oral, sans la casse ni la
   ponctuation, qui ne s'entendent pas. */
function memeLecture(a: string, b: string): boolean {
	const oral = (t: string): string =>
		texteParle(t)
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, ' ')
			.trim();
	return oral(a) === oral(b);
}

/* Ce qui décrit le champ de saisie : les nœuds de la consigne présents dans la carte. */
function consigneDecrite(stage: HTMLElement): string {
	return ['bpConsigneTitre', 'bpConsigneAction']
		.filter((id) => stage.querySelector(`#${id}`)?.textContent?.trim())
		.join(' ');
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
	// Le nom du champ est l'énoncé ; sa description dit d'abord où l'on en est (« Question 2
	// sur 5 », l'en-tête, hors de la carte), puis la consigne (« Calcule », « Écris le mot… »).
	const decrit = [
		document.getElementById('bpQuestionNum')?.textContent?.trim() ? 'bpQuestionNum' : '',
		consigneDecrite(stage),
	]
		.filter(Boolean)
		.join(' ');
	if (decrit) inp.setAttribute('aria-describedby', decrit);
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
	/* Ce que le trou montre une fois rempli : le choix, tel que son bouton l'affiche. Une vue
	   riche (fraction empilée) ou un signe de ponctuation est recopié TU à l'oreille, et son
	   libellé lisible (« trois quarts », « point d'interrogation ») le dit à sa place. */
	const dansLeTrou = (i: number, valeur: string): SafeHtml => {
		const lu = label(valeur);
		const riche = ponct ? undefined : q.choicesView?.[i];
		if (riche)
			return html`<span aria-hidden="true">${riche.html}</span><span class="sr-only">${lu}</span>`;
		if (lu !== valeur)
			return html`<span aria-hidden="true">${valeur}</span><span class="sr-only">${lu}</span>`;
		return html`${valeur}`;
	};
	// Le trou reste LISIBLE aux technologies d'assistance (relecture accessibilité) :
	// « (trou) » le marque pour l'oreille, HORS du nœud que le choix vient remplir.
	const trou = html`<span class="bp-trou"><span class="sr-only">${MARQUE_TROU}</span><span class="bp-trou-mot"></span></span>`;
	// Le groupe de choix se nomme par la phrase, trou marqué : « Le chat (trou) mangé. ».
	const nomGroupe = legendeQcmTrou(q.item) || q.consigneRenforcee || 'Choix de réponse';
	// Choix EXCLUSIF : patron APG « Radio Group », comme le segment (`ui/segment.ts`) —
	// `role="radio"` + `aria-checked`, un seul arrêt de tabulation (tabindex mobile : le
	// choix coché, sinon le premier), flèches et Home/End qui déplacent ET sélectionnent.
	stage.innerHTML =
		html`${consigneHTML(q, q.item.parle ?? q.item.text)}${figureBlock(q.item.figure)}
    <div class="bp-enonce">${poserAuTrou(enonceTexte(q.item.text), '@', trou)}</div>
    <div class="bp-choix" role="radiogroup"${attribut('aria-label', nomGroupe)}>${joindre(
			q.choices.map((c, i) => {
				const aria = label(c) === c ? VIDE : attribut('aria-label', label(c));
				return html`<button type="button" class="bp-choice" role="radio" data-value="${c}" data-i="${i}" aria-checked="false" tabindex="${i === 0 ? '0' : '-1'}"${aria}>${vue(i)}</button>`;
			}),
		)}</div>`.balisage;
	let choisi: string | null = null;
	const boutons = [...stage.querySelectorAll<HTMLButtonElement>('.bp-choice')];
	const caseTrou = stage.querySelector<HTMLElement>('.bp-trou');
	const motTrou = stage.querySelector<HTMLElement>('.bp-trou-mot');
	// Espace et Entrée cliquent le bouton nativement ; les flèches passent par la règle
	// partagée du segment, puis le focus suit et le choix est retenu.
	stage.querySelector<HTMLElement>('.bp-choix')?.addEventListener('keydown', (ev) => {
		const visee = radioVisee(ev, '.bp-choice[role="radio"]');
		if (!visee) return;
		visee.focus();
		visee.click();
	});
	boutons.forEach((btn) =>
		btn.addEventListener('click', () => {
			const valeur = btn.dataset.value ?? null;
			choisi = valeur;
			for (const b of boutons) {
				b.setAttribute('aria-checked', String(b === btn));
				b.tabIndex = b === btn ? 0 : -1;
			}
			// Toucher un choix le place dans le trou (critère 1) : la phrase se relit entière.
			if (caseTrou && motTrou && valeur !== null) {
				motTrou.innerHTML = dansLeTrou(Number(btn.dataset.i), valeur).balisage;
				caseTrou.classList.add('bp-trou--rempli');
			}
			pret(valeur !== null);
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
