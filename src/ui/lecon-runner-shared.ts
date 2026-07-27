/* ============================================================
   Squelette commun des runners de leçon (#344) — « une question à la fois ».
   Les cinq runners (qcm / ordre / tri / tuiles / problème) partagent la même
   fin de session : barre de progression, clôture (enregistrement de l'essai)
   et écran de résultat (score, étoile, mascotte, récompenses de niveau). Ce
   module centralise ces trois briques pour qu'une évolution transversale
   (nouvelle médaille, markup `.sprint-done`, `streakSuffix`…) ne se fasse plus
   en cinq exemplaires.

   Le runner « problème » garde son lexique spécifique (`lex.nom` /
   `lex.nomPluriel`) via le paramètre optionnel `lexique`.
   ============================================================ */
import type { ProbLexique } from '../core/exercise';
import { recordLessonRun } from '../core/lesson-run';
import type { LessonRunOutcome } from '../core/lesson-run';
import { streakSuffix } from '../core/progress';
import { announceRewards } from './effects';
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
   en mode leçon (pas de chrono). */
export function finishLeconRun(lessonId: string, ok: number, total: number): LessonRunOutcome {
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
