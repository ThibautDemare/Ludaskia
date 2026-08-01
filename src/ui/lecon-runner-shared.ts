/* ============================================================
   Squelette commun des runners de leçon (#344) — « une question à la fois ».
   Les runners (qcm / qcm multi / ordre / tri / tuiles / tableau / appariement /
   clic-mot / droite graduée / problème) partagent la même fin de session : barre
   de progression, clôture (enregistrement de l'essai) et écran de résultat
   (score, étoile, mascotte, récompenses de niveau). Ce module centralise ces
   briques pour qu'une évolution transversale (nouvelle médaille, markup
   `.sprint-done`, `streakSuffix`…) ne se fasse plus en dix exemplaires.

   Il porte aussi la REPRISE de ces runners (#498, cf. « Reprise » plus bas) :
   eux seuls savent ce qu'ils ont tiré, mais la mécanique de photographie et de
   rejeu est la même pour tous.

   Le runner « problème » garde son lexique spécifique (`lex.nom` /
   `lex.nomPluriel`) via le paramètre optionnel `lexique`.
   ============================================================ */
import type { LessonDef } from '../core/catalog';
import type { ProbLexique } from '../core/exercise';
import { recordLessonRun } from '../core/lesson-run';
import type { LessonRunOutcome } from '../core/lesson-run';
import { streakSuffix } from '../core/progress';
import { leconKey, removeResume, RESUME_VERSION } from '../core/resume';
import type { ResumeRunner } from '../core/resume';
import { announceRewards } from './effects';
import { subjectIcon } from './cat-visuals';
import { mascotteBulleHTML, encouragementMascotte } from './unlocks-view';
import { goCategorie } from './navigation';
import { retourFinActivite } from './retour-activite';

function sheets(): HTMLElement {
	return document.getElementById('sheets')!;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* Barre de progression « Question i / n ». Le libellé est surchargeable
   (« Problème i / n », « Calcul i / n »… pour le runner problème). */
export function leconProgressHTML(idx: number, total: number, libelle = 'Question'): string {
	const pct = Math.round((idx / total) * 100);
	return `<div class="lqcm-progress">
    <span class="lqcm-progress-lab">${libelle} ${idx + 1} / ${total}</span>
    <div class="lqcm-bar"><div class="lqcm-bar-fill" style="width:${pct}%"></div></div>
  </div>`;
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

/* ============================================================
   Reprise d'un runner (#498)
   ------------------------------------------------------------
   La reprise historique (#63) photographie le DOM : elle ne marche que pour la
   fiche en saisie, dont l'état tient dans des champs remplis. Les runners, eux,
   gardent leur état en mémoire (questions tirées, index, score) et re-rendent
   l'écran à chaque question. Résultat : dix runners sans aucune reprise, où une
   leçon interrompue était perdue.

   On photographie donc l'ÉTAT LOGIQUE. Chaque runner déclare sa session au
   démarrage (`declarerSessionRunner`) en fournissant un accès à son état, et
   s'enregistre une fois pour toutes (`enregistrerRunner`) pour savoir se rejouer.
   Le reste — quand photographier, quand restaurer — est commun.
   ============================================================ */

/** Ce qu'un runner doit dire de lui-même pour devenir reprenable. La leçon est passée
    entière : libellé, icône et catégorie de la carte « À continuer » s'en déduisent ici,
    plutôt que d'être recopiés dans les dix runners. `etat` est relu au moment de la photo
    (et non copié à la déclaration) : c'est ce qui permet de capturer la progression réelle
    à l'instant où l'enfant quitte l'écran. */
export interface SessionRunner {
	runner: string; // nom stable, clé du registre de restauration
	lesson: LessonDef;
	exerciseMode: string | null; // mode retenu (#69) ; null pour un type mono-mode
	etat: () => { questions: unknown[]; idx: number; score: number };
}

let sessionCourante: SessionRunner | null = null;

/** Déclare le runner en cours : c'est lui que `captureResume` photographiera si l'enfant
    quitte l'écran. À appeler au démarrage, lancement neuf comme reprise. */
export function declarerSessionRunner(s: SessionRunner): void {
	sessionCourante = s;
}

/** Clôt la session en cours et efface la reprise stockée : l'essai est terminé (ou
    abandonné explicitement), il n'y a plus rien à continuer. Idempotent. */
export function finirSessionRunner(): void {
	if (sessionCourante) removeResume(leconKey(sessionCourante.lesson.id));
	sessionCourante = null;
}

/** Instantané du runner en cours, ou `null` s'il n'y a rien qui vaille la peine d'être
    repris : aucun runner actif, ou pas une seule question validée — proposer « continue
    ta leçon » à la question 1 encombrerait la section « À continuer » sans rien
    épargner à l'enfant. Une session déjà à sa dernière question n'est pas non plus
    reprise : elle se termine en une réponse. */
export function snapshotRunner(now: number): ResumeRunner | null {
	if (!sessionCourante) return null;
	const s = sessionCourante;
	const { questions, idx, score } = s.etat();
	if (idx < 1 || idx >= questions.length) return null;
	return {
		kind: 'runner',
		key: leconKey(s.lesson.id),
		version: RESUME_VERSION,
		savedAt: now,
		mode: 'lecon',
		label: s.lesson.label,
		icon: subjectIcon(s.lesson.subject),
		categoryId: s.lesson.category,
		relaunch: { type: 'lecon', lessonId: s.lesson.id },
		total: questions.length,
		answered: idx,
		runner: s.runner,
		exerciseMode: s.exerciseMode,
		questions,
		idx,
		score,
	};
}

/* Registre des restaurateurs. Chaque runner s'y déclare au chargement de son module ;
   tous étant importés statiquement par la navigation, le registre est complet dès le
   démarrage de l'application. */
type RestaurerRunner = (snap: ResumeRunner) => void;
const registre = new Map<string, RestaurerRunner>();

/** Déclare comment rejouer ce runner. À appeler au niveau du module. */
export function enregistrerRunner(nom: string, restaurer: RestaurerRunner): void {
	registre.set(nom, restaurer);
}

/** Rejoue un instantané de runner. Renvoie `false` si le runner est inconnu — un
    instantané peut survivre à la disparition du runner qui l'a écrit (7 jours de TTL) ;
    à l'appelant de retomber proprement plutôt que de laisser un écran vide. */
export function restaurerRunner(snap: ResumeRunner): boolean {
	const restaurer = registre.get(snap.runner);
	if (!restaurer) return false;
	restaurer(snap);
	return true;
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
			extra += `<div class="rb-medal"><span class="rb-medal-ico">⭐</span><span class="rb-medal-txt">${out.starInfo.newStar ? 'Étoile gagnée !' : 'Encore sans faute !'}</span></div>`;
		const succes = lexique
			? `${cap(lexique.nomPluriel)} réussis sans faute`
			: 'Leçon réussie sans faute';
		const msg =
			(out.starInfo.perfect
				? `${succes}${out.starInfo.count > 1 ? ` (${out.starInfo.count}×)` : ''}. Bravo !`
				: `Il faut un sans-faute pour décrocher l'étoile. Réessaie ⭐`) +
			streakSuffix(out.streakDays);
		extra += `<div class="sprint-done-sub">${msg}</div>`;
	}
	const labTexte = lexique
		? `${score > 1 ? lexique.nomPluriel : lexique.nom.toLowerCase()} réussi${score > 1 ? 's' : ''} (${acc}%)`
		: `bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''} (${acc}%)`;
	sheets().innerHTML = `
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
    </div>`;
	sheets().querySelector('#leconAgain')!.addEventListener('click', onAgain);
	sheets().querySelector('#leconBack')!.addEventListener('click', retour.aller);
	// Récompenses : modale de niveau (puis confettis), comme les autres écrans.
	announceRewards(out.niveauGagne, out.recompensesNiv, out.celeb);
}

export interface WireNextOpts {
	feedbackHTML: string; // HTML du feedback, déjà échappé par l'appelant (injecté via innerHTML)
	isLast: boolean; // dernière question → « Voir mon résultat ▶ », sinon « Continuer ▶ »
	onNext: () => void; // enchaînement (question suivante ou écran de résultat)
}

/* Fin de question commune aux cinq runners (#344) : révèle la zone de feedback,
   affiche le bouton « Continuer ▶ » / « Voir mon résultat ▶ », câble son clic et pose
   le focus (la touche Entrée enchaîne). `actions`/`feedback` sont les éléments déjà
   résolus par l'appelant — leurs id `#…Actions` / `#…Feedback` servent de sélecteurs
   e2e ; le bouton lui-même n'a pas besoin d'id propre. */
export function wireNext(actions: HTMLElement, feedback: HTMLElement, opts: WireNextOpts): void {
	feedback.hidden = false;
	feedback.innerHTML = opts.feedbackHTML;
	actions.hidden = false;
	actions.innerHTML = `<button class="sprint-btn">${opts.isLast ? 'Voir mon résultat ▶' : 'Continuer ▶'}</button>`;
	const next = actions.querySelector<HTMLButtonElement>('button')!;
	next.addEventListener('click', opts.onNext);
	next.focus();
}
