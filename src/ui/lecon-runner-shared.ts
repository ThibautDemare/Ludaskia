/* ============================================================
   Squelette commun des runners de leçon (#344) — « une question à la fois ».
   Les runners (qcm / qcm multi / ordre / tri / tuiles / tableau / appariement /
   clic-mot / droite graduée / problème) partagent la même fin de session : barre
   de progression, clôture (enregistrement de l'essai) et écran de résultat
   (score, étoile, mascotte, récompenses de niveau). Ce module centralise ces
   briques pour qu'une évolution transversale (nouvelle médaille, markup
   `.sprint-done`, `streakSuffix`…) ne se fasse plus en dix exemplaires.

   La REPRISE de ces runners (#498) vit à côté, dans `runner-reprise.ts` : c'est
   un module FEUILLE, condition pour que le registre soit prêt avant les runners
   qui s'y déclarent au chargement (cf. l'en-tête de ce module).

   Le runner « problème » garde son lexique spécifique (`lex.nom` /
   `lex.nomPluriel`) via le paramètre optionnel `lexique`.
   ============================================================ */
import type { LessonDef } from '../core/catalog';
import type { ExerciseMode, ProbLexique } from '../core/exercise';
import { recordLessonRun } from '../core/lesson-run';
import type { LessonRunOutcome } from '../core/lesson-run';
import { labelLecon } from '../core/levels';
import { niveauLecon } from '../core/niveau-actif';

import { streakSuffix } from '../core/progress';
import type { TypeAide } from '../core/aide';
import { maybeAutoAide } from './aide-exercice';
import {
	brancherEtayageEcran,
	etayageDisponible,
	lienEtayageHTML,
	ouvrirEtayage,
	type EtayageDemande,
} from './etayage-panneau';
import { announceRewards } from './effects';
import { annoncerStatut } from './revelation-neutre';
import { sansSeparateurMilliers } from '../core/nombres';
import { declarerSessionRunner, finirSessionRunner } from './runner-reprise';
import { mascotteBulleHTML, encouragementMascotte } from './unlocks-view';
import {
	goCategorie,
	hideMenus,
	setToolbar,
	setCurrentMode,
	setCurrentLessonId,
} from './navigation';
import { retourFinActivite } from './retour-activite';
import { html, type SafeHtml } from '../core/html';

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* Barre de progression « Question i / n ». Le libellé est surchargeable
   (« Problème i / n », « Calcul i / n »… pour le runner problème). */
export function leconProgressHTML(idx: number, total: number, libelle = 'Question'): SafeHtml {
	const pct = Math.round((idx / total) * 100);
	return html`<div class="lqcm-progress">
    <span class="lqcm-progress-lab">${libelle} ${idx + 1} / ${total}</span>
    <div class="lqcm-bar"><div class="lqcm-bar-fill" style="width:${pct}%"></div></div>
  </div>`;
}

/** Bandeau de titre d'un runner de leçon : le LIBELLÉ de la leçon, résolu pour le niveau
    RÉELLEMENT joué (#436 — une leçon peut se nommer autrement selon la classe, cf.
    `LessonDef.labelNiveau`). Les dix runners rendaient ce même markup chacun chez eux, donc
    chacun aurait dû penser à résoudre le niveau : un seul endroit désormais. */
export function leconTitreHTML(lesson: LessonDef): SafeHtml {
	const label = labelLecon(lesson, niveauLecon(lesson));
	return html`<div class="sprint-theme"><span class="sprint-lesson">${label}</span></div>`;
}

/** Ouverture commune d'un écran de runner : mise en place du chrome, déclaration de la
    session reprenable, rendu, aide contextuelle et focus. Appelée par le `demarrer(...)`
    de chaque runner, sur le chemin du lancement neuf COMME de la reprise — ce qui garantit
    que les deux ouvrent l'écran exactement de la même façon.

    Ce qui DIVERGE d'un runner à l'autre reste chez lui : l'état de module (questions ou
    manches, index, score, lexique du problème), et le rendu lui-même, passé en `render`.

    Le FOCUS est le point à ne pas perdre de vue : le déclencheur (tuile de leçon, carte
    « À continuer », bouton de la modale de reprise) vient d'être masqué par `hideMenus()`,
    et un élément en `display:none` ne garde pas le focus — le navigateur le rabat sur
    `<body>`. Faute de skip-link, un enfant au clavier devrait alors re-tabuler depuis la
    barre d'outils pour atteindre sa question. On pose donc le focus sur le conteneur
    d'exercice (`#sheets`, `tabindex="-1"`), qui est stable d'un rendu à l'autre. */
export function demarrerRunner(o: {
	runner: string; // nom stable dans le registre de reprise
	lesson: LessonDef;
	mode: ExerciseMode | null;
	etat: () => { questions: unknown[]; idx: number; score: number };
	render: () => void;
	aide?: TypeAide; // clé d'aide contextuelle, pour les runners qui en ont une
}): void {
	setCurrentMode('lecon');
	setCurrentLessonId(o.lesson.id);
	hideMenus();
	setToolbar({ verify: false, home: true, profile: false }); // boutons propres au runner
	declarerSessionRunner({
		runner: o.runner,
		lesson: o.lesson,
		exerciseMode: o.mode,
		etat: o.etat,
	});
	o.render();
	document.getElementById('sheets')?.focus({ preventScroll: true });
	// APRÈS le focus, jamais avant : la bulle d'aide est une modale qui prend le focus et
	// le rend à la fermeture (au bouton « ? » de l'exercice). Focaliser `#sheets` ensuite
	// le lui volerait et casserait son piège de focus.
	if (o.aide) maybeAutoAide(o.aide); // au 1er lancement seulement (une fois par profil)
	// PUIS l'étayage de la notion (#490), jamais avant : l'aide au GESTE est prioritaire
	// quand les deux se présentent (savoir manipuler l'écran précède la méthode).
	brancherEtayageEcran(
		document.querySelector<HTMLElement>('#sheets .sprint-stage'),
		o.lesson,
		o.mode ?? undefined,
	);
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Clôture commune : enregistre l'essai (parité des modes — mêmes XP / étoiles /
   objectifs que la fiche en saisie) et renvoie l'issue à afficher. `ms` inutile
   en mode leçon (pas de chrono). Clôt aussi la session de reprise : l'essai est
   fini, il n'y a plus rien à reprendre. */
export function finishLeconRun(lessonId: string, ok: number, total: number): LessonRunOutcome {
	finirSessionRunner();
	return recordLessonRun({
		mode: 'lecon',
		lessonId,
		ok,
		questionCount: total,
		ms: 0,
		perLesson: { [lessonId]: { ok, total } },
	});
}

export interface LeconResultOpts {
	out: LessonRunOutcome; // issue renvoyée par finishLeconRun
	score: number;
	total: number;
	category: string; // catégorie de la leçon (bouton « Retour », hors programme)
	onAgain: () => void; // relance de la leçon (bouton « Recommencer »)
	lexique?: ProbLexique; // problème : « problèmes réussis » au lieu de « bonnes réponses »
}

/* Écran de résultat commun : score, étoile/médaille, mascotte, boutons. Le
   markup et la logique de récompense (niveau gagné → confettis) sont identiques
   aux cinq runners ; seuls les libellés varient via `lexique`. */
export function renderLeconResult(opts: LeconResultOpts): void {
	const { out, score, total, category, onAgain, lexique } = opts;
	const acc = total ? Math.round((score / total) * 100) : 0;
	// Retour d'où l'on vient (#461) : le programme du jour s'il a lancé la leçon.
	const retour = retourFinActivite({ label: 'Retour', aller: () => goCategorie(category) });
	// Liste de fragments, JAMAIS une chaîne accumulée : `extra += html\`…\`` coerce le
	// `SafeHtml` en « [object Object] », que le gabarit affiche ensuite en toutes lettres.
	const extra: SafeHtml[] = [];
	if (out.starInfo) {
		if (out.starInfo.perfect)
			extra.push(
				html`<div class="rb-medal"><span class="rb-medal-ico">⭐</span><span class="rb-medal-txt">${out.starInfo.newStar ? 'Étoile gagnée !' : 'Encore sans faute !'}</span></div>`,
			);
		const succes = lexique
			? `${cap(lexique.nomPluriel)} réussis sans faute`
			: 'Leçon réussie sans faute';
		const msg =
			(out.starInfo.perfect
				? `${succes}${out.starInfo.count > 1 ? ` (${out.starInfo.count}×)` : ''}. Bravo !`
				: `Il faut un sans-faute pour décrocher l'étoile. Réessaie ⭐`) +
			streakSuffix(out.streakDays);
		extra.push(html`<div class="sprint-done-sub">${msg}</div>`);
	}
	const labTexte = lexique
		? `${score > 1 ? lexique.nomPluriel : lexique.nom.toLowerCase()} réussi${score > 1 ? 's' : ''} (${acc}%)`
		: `bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''} (${acc}%)`;
	sheets().innerHTML = html`
    <div class="sprint sprint-lecon">
      <div class="sprint-stage">
        <div class="sprint-done">
          ${mascotteBulleHTML(encouragementMascotte())}
          <div class="sprint-done-big">${score} / ${total}</div>
          <div class="sprint-done-lab">${labTexte}</div>
          ${extra}
          <div class="sprint-actions">
            <button class="sprint-btn" id="leconAgain">↻ Recommencer</button>
            <button class="sprint-btn ghost" id="leconBack">${retour.label}</button>
          </div>
        </div>
      </div>
    </div>`.balisage;
	sheets().querySelector('#leconAgain')!.addEventListener('click', onAgain);
	sheets().querySelector('#leconBack')!.addEventListener('click', retour.aller);
	// Récompenses : modale de niveau (puis confettis), comme les autres écrans.
	announceRewards(out.niveauGagne, out.recompensesNiv, out.celeb);
}

/** Les deux amorces du résumé annoncé aux lecteurs d'écran (#505).
 *
 *  Partagées et non recopiées : ces deux phrases existaient déjà dans
 *  `clic-mot-interaction.ts`, et généraliser l'annonce à cinq runners de plus allait
 *  les dupliquer six fois. Le dépôt a déjà payé ce copier-coller ailleurs (le token
 *  `--muted`, contourné à la main dans quatre feuilles avant d'être corrigé à la
 *  source) : une formulation recopiée diverge le jour où l'une des copies change.
 *  Ce sont des amorces, pas des messages complets : chaque runner ajoute ce que SA
 *  mécanique sait dire (la bonne réponse, le bon rangement, les bonnes propriétés). */
export const VERDICT_OK = 'Bravo, bonne réponse.';
export const verdictKo = (suite: string): string => `Ce n'est pas ça. ${suite}`;

export interface WireNextOpts {
	feedbackHTML: SafeHtml; // fragment du feedback (injecté via innerHTML)
	/** Résumé du verdict EN UNE PHRASE, annoncé aux lecteurs d'écran (#505).
	 *
	 *  OBLIGATOIRE, et c'est le cœur du correctif. Optionnel, il serait « ce que
	 *  l'auteur du prochain runner pensera peut-être à fournir » — exactement le régime
	 *  qui a laissé cinq runners muets pendant des mois, chacun ayant recopié ou oublié
	 *  le même bout de code. Requis, le compilateur refuse un runner qui ne dit pas ce
	 *  qu'il faut annoncer. Il n'y a pas de valeur par défaut raisonnable : dériver le
	 *  résumé du feedback affiché reviendrait à faire lire le pavé HTML (plusieurs
	 *  phrases, parfois une explication entière), ce que la région live doit justement
	 *  éviter.
	 *  TEXTE BRUT, pas de HTML : c'est ce que la voix de synthèse va prononcer. Et un
	 *  LIBELLÉ lisible, pas une valeur brute — « 3/4 » se prononce « trois slash quatre ».
	 *  Chaîne VIDE = « ma mécanique a déjà annoncé, ne redis rien » (cas des widgets,
	 *  voir ci-dessous) — jamais « il n'y a rien à dire ».
	 *  ÉCARTÉ, pour ne pas être reproposé : typer ce cas en `string | 'deja-annonce'`.
	 *  En TypeScript, `string` absorbe la branche littérale — l'union s'effondre en
	 *  `string` et ne contraint rien de plus qu'aujourd'hui. La forme qui marcherait est
	 *  une union DISCRIMINÉE par la forme de l'objet (`{ resume } | { dejaAnnonce: true }`) ;
	 *  elle n'empêcherait pas plus un `dejaAnnonce: true` mensonger, pour un remaniement
	 *  des onze points d'appel. À reconsidérer si le motif se reproduit ailleurs. */
	resume: string;
	/** Sélecteur de la région live FIXE de l'écran, celle que le runner rend lui-même
	 *  dans son markup (`#ltuiStatus`, `#lqmStatus`, `#dgStatus`…). Sert à la distinguer
	 *  de celle d'un WIDGET monté dans la même carte : la règle partagée
	 *  (`annoncerStatut`) donne la priorité au widget, dont le message est plus riche.
	 *  Absent ⇒ l'écran n'a pas de région à lui, on écrit dans celle du widget s'il y en
	 *  a une. */
	statut?: string;
	isLast: boolean; // dernière question → « Voir mon résultat ▶ », sinon « Continuer ▶ »
	onNext: () => void; // enchaînement (question suivante ou écran de résultat)
	/** Étayage à PROPOSER sous le verdict (#490) : un lien discret, jamais un affichage
	    automatique. À ne fournir que lorsque l'enfant s'est trompé (ou a demandé la réponse) —
	    on n'explique pas une réussite —, et avec l'exercice raté quand le runner sait le
	    décrire, pour dérouler CELUI-LÀ plutôt que l'exemple de la leçon. */
	etayage?: EtayageDemande;
}

/* Fin de question commune aux cinq runners (#344) : révèle la zone de feedback,
   affiche le bouton « Continuer ▶ » / « Voir mon résultat ▶ », câble son clic et pose
   le focus (la touche Entrée enchaîne). `actions`/`feedback` sont les éléments déjà
   résolus par l'appelant — leurs id `#…Actions` / `#…Feedback` servent de sélecteurs
   e2e ; le bouton lui-même n'a pas besoin d'id propre. */
export function wireNext(actions: HTMLElement, feedback: HTMLElement, opts: WireNextOpts): void {
	feedback.hidden = false;
	feedback.innerHTML = opts.feedbackHTML.balisage;
	// Annonce du verdict AVANT que le focus ne parte sur « Continuer ▶ » (plus bas) : ce
	// bouton ne dit que « Continuer », donc sans elle l'enfant qui n'y voit pas apprend
	// que la question est finie sans savoir ce qu'elle est devenue.
	// Le `.sprint-correction` lui-même n'est PAS une région live, et ne doit pas le
	// devenir : il contient du HTML (des <strong>, plusieurs phrases, parfois une
	// explication entière), qui serait annoncé d'un bloc. D'où un résumé texte à part.
	// Résumé VIDE = le widget a déjà annoncé, et plus précisément (il connaît chaque
	// paire, chaque mot) : on se tait plutôt que d'écraser son message par un résumé
	// global. C'est aussi ce qui garantit qu'on n'annonce jamais deux fois.
	if (opts.resume) {
		const scope = feedback.closest('.sprint-stage') ?? feedback.parentElement;
		// Le runner qui NOMME sa région de verdict est cru sur parole, sans passer par la
		// règle de résolution partagée. Celle-ci (`annoncerStatut`) départage « région du
		// widget » et « région fixe » par la négative — toute région qui n'est PAS le repli
		// est réputée appartenir à un widget —, ce qui suppose qu'un écran n'en a qu'une à
		// lui. L'hypothèse tient pour la révélation et la révision, mais plus ici : le
		// tableau de conversion en a DEUX, l'écho de saisie au pavé et le verdict (#505).
		// Sans ce chemin direct, l'écho passait pour un widget et récupérait le verdict —
		// exactement la confusion que séparer les deux régions cherchait à éviter.
		const cible = opts.statut ? scope?.querySelector<HTMLElement>(opts.statut) : null;
		// Même règle que `annoncerStatut` (#501) : ce qui part à l'OREILLE n'emporte pas le
		// séparateur de milliers. Posée ici, elle couvre les six régions que ce chemin direct
		// dessert (#tcVerdict, #dgStatus, #lordStatus, #ltuiStatus, #lqcmStatus, #lqmStatus) —
		// les mettre à jour runner par runner aurait laissé le prochain runner dehors.
		if (cible) cible.textContent = sansSeparateurMilliers(opts.resume);
		// Sans `statut`, l'écran n'a pas de région à lui : on retombe sur la règle
		// partagée, qui trouvera celle du widget s'il en monte une.
		else annoncerStatut({ scope, message: opts.resume });
	}
	// Étayage (#490) : APRÈS la bonne réponse et AVANT « Continuer ▶ ». Placé avant la
	// réponse, ou aussi lourd que « Continuer », il serait cliqué par réflexe sans être lu.
	// Même ordre qu'en révision, où le lien vit déjà au même endroit du verdict.
	const demande = opts.etayage;
	if (demande && etayageDisponible(demande.lesson, demande.niveau, demande.mode)) {
		const hote = document.createElement('div');
		hote.className = 'etay-apres-verdict';
		// Le focus part sur « Continuer ▶ » juste après (voir plus bas) : sans région live, un
		// enfant au lecteur d'écran n'apprendrait JAMAIS que l'offre existe — au moment précis
		// où elle lui sert. On l'annonce sans la lui imposer (le focus ne bouge pas).
		hote.setAttribute('role', 'status');
		hote.innerHTML = lienEtayageHTML('etay-lien', 'runEtayage').balisage;
		const bouton = hote.querySelector('button')!;
		bouton.addEventListener('click', () => ouvrirEtayage({ ...demande, trigger: bouton }));
		feedback.appendChild(hote);
	}
	actions.hidden = false;
	actions.innerHTML =
		html`<button class="sprint-btn">${opts.isLast ? 'Voir mon résultat ▶' : 'Continuer ▶'}</button>`.balisage;
	const next = actions.querySelector<HTMLButtonElement>('button')!;
	next.addEventListener('click', opts.onNext);
	next.focus();
}
