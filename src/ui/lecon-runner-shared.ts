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
	let extra = '';
	if (out.starInfo) {
		if (out.starInfo.perfect)
			extra += html`<div class="rb-medal"><span class="rb-medal-ico">⭐</span><span class="rb-medal-txt">${out.starInfo.newStar ? 'Étoile gagnée !' : 'Encore sans faute !'}</span></div>`;
		const succes = lexique
			? `${cap(lexique.nomPluriel)} réussis sans faute`
			: 'Leçon réussie sans faute';
		const msg =
			(out.starInfo.perfect
				? `${succes}${out.starInfo.count > 1 ? ` (${out.starInfo.count}×)` : ''}. Bravo !`
				: `Il faut un sans-faute pour décrocher l'étoile. Réessaie ⭐`) +
			streakSuffix(out.streakDays);
		extra += html`<div class="sprint-done-sub">${msg}</div>`;
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

export interface WireNextOpts {
	feedbackHTML: SafeHtml; // fragment du feedback (injecté via innerHTML)
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
