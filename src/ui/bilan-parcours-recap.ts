/* ============================================================
   Bilan en PARCOURS guidé (#777) — écrans B et C : fin de partie et récapitulatif.
   ------------------------------------------------------------
   B. la FIN DE PARTIE : d'abord les réussites, puis chaque erreur (question, réponse
      donnée, bonne réponse) ;
   C. le RÉCAPITULATIF : un verdict et un score brut par leçon, le nombre de leçons
      réussies, « Réviser mes erreurs » ; PUIS les modales de récompense habituelles
      (niveau, trophées, objectif du jour), comme après une leçon.
   Rendu seul : la correction, le journal et le crédit ont déjà eu lieu dans l'état du
   parcours (`ui/bilan-parcours.ts`), qui passe ici ce qu'il faut montrer et ce qu'il faut
   faire au geste suivant.
   ============================================================ */
import { getLessonById } from '../core/catalog';
import { labelLecon } from '../core/levels';
import { niveauLecon } from '../core/niveau-actif';
import type { QuestionRevision } from '../core/revision-question';
import {
	figureDeQuestion,
	libellePartieTerminee,
	libelleReussites,
	libelleScore,
	libelleScoreLu,
	libelleTitreRecap,
	libelleTotalRecap,
	MOT_VERDICT,
	TEXTES_PARCOURS,
	type BilanLecon,
	type Correction,
	type ErreurCorrigee,
	type VerdictLecon,
} from '../core/bilan-parcours';
import { figureBlock } from '../core/items';
import type { LessonRunOutcome } from '../core/lesson-run';
import { html, type SafeHtml, VIDE, joindre } from '../core/html';
import type { IconName } from '../core/icon-names';
import { goHome } from './navigation';
import { announceRewards } from './effects';
import { icon } from './icon';

const sheets = (): HTMLElement => document.getElementById('sheets')!;

/* ---------- Écran B : fin de partie ---------- */

/** Une partie corrigée, et ce que fait son bouton (partie suivante ou récapitulatif). */
export interface EcranFinPartie {
	numero: number;
	derniere: boolean;
	corrections: readonly { q: QuestionRevision; c: Correction }[];
	continuer: () => void;
}

export function afficherFinPartie(ecran: EcranFinPartie): void {
	const reussites = ecran.corrections.filter(({ c }) => c.reussi).length;
	const erreurs = ecran.corrections.flatMap(({ q, c }) => c.erreurs.map((err) => ({ q, err })));
	const liste = erreurs.length
		? html`<h3 class="bp-revoir-titre">${TEXTES_PARCOURS.aRevoir}</h3>
      <ul class="bp-erreurs" role="list">${joindre(erreurs.map(({ q, err }, n) => erreurHTML(q, err, n)))}</ul>`
		: html`<p class="bp-aucune-erreur">${TEXTES_PARCOURS.aucuneErreur}</p>`;
	const suite = ecran.derniere
		? html`<button type="button" class="bp-valider" id="bpVoirBilan">Voir mon bilan</button>`
		: html`<button type="button" class="bp-valider" id="bpPartieSuivante">Partie suivante</button>`;
	// La carte reçoit le focus : un groupe NOMMÉ par son titre, pour qu'on l'entende.
	sheets().innerHTML = html`<div class="bilan-parcours">
    <div class="bp-fin-partie bp-carte" role="group" aria-labelledby="bpFinTitre" tabindex="-1">
      <h2 class="bp-fin-titre" id="bpFinTitre">${libellePartieTerminee(ecran.numero)}</h2>
      <p class="bp-reussites" data-nombre="${reussites}">${icon('check-circle')}<span>${libelleReussites(reussites)}</span></p>
      ${liste}
      <div class="bp-decide">${suite}</div>
    </div>
  </div>`.balisage;
	(document.getElementById('bpVoirBilan') ??
		document.getElementById('bpPartieSuivante'))!.addEventListener('click', () => {
		ecran.continuer();
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
			? html`<p class="bp-erreur-donnee">${TEXTES_PARCOURS.pasDeReponse}</p>`
			: html`<p class="bp-erreur-donnee">${TEXTES_PARCOURS.taReponse} <strong>${err.donnee}</strong></p>`;
	return html`<li class="bp-erreur" style="--bp-rang:${Math.min(n, 6)}">
      ${figureBlock(figureDeQuestion(q))}
      <p class="bp-erreur-enonce">${err.enonce}</p>
      ${donnee}
      <p class="bp-erreur-attendue">${TEXTES_PARCOURS.bonneReponse} <strong>${err.attendue}</strong></p>
    </li>`;
}

/* ---------- Écran C : récapitulatif ---------- */

/** Le bilan clos (ou la révision des erreurs finie), et ce qu'il reste à faire. */
export interface EcranRecap {
	rejeu: boolean;
	/** Une ligne par leçon, déjà triée (réussi, presque, à retravailler). */
	lignes: readonly BilanLecon[];
	/** Phrase de la règle des 60 % quand le bilan ne compte pas, sinon `null`. */
	seuil: string | null;
	/** « Réviser mes erreurs » : absent quand tout est juste. */
	reviser: (() => void) | null;
	/** Gains du crédit à annoncer par les modales, ou `null`. */
	gains: LessonRunOutcome | null;
}

const ICONE_VERDICT: Record<VerdictLecon, IconName> = {
	reussi: 'check-circle',
	presque: 'quantity-2',
	'a-retravailler': 'book-open',
};

export function afficherRecap(ecran: EcranRecap): void {
	const reussies = ecran.lignes.filter((l) => l.verdict === 'reussi').length;
	const lignesHTML = joindre(
		ecran.lignes.map((l) => {
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
	const seuil = ecran.seuil ? html`<p class="bp-seuil">${ecran.seuil}</p>` : VIDE;
	const reviser = ecran.reviser
		? html`<button type="button" class="bp-valider" id="bpReviserErreurs">Réviser mes erreurs</button>`
		: VIDE;
	sheets().innerHTML = html`<div class="bilan-parcours">
    <div class="bp-recap bp-carte" role="group" aria-labelledby="bpRecapTitre" tabindex="-1">
      <h2 class="bp-recap-titre" id="bpRecapTitre">${libelleTitreRecap(ecran.rejeu)}</h2>
      <ul class="bp-lecons" role="list">${lignesHTML}</ul>
      <p class="bp-recap-total">${icon('check-circle')}<span>${libelleTotalRecap(reussies, ecran.lignes.length)}</span></p>
      ${seuil}
      <div class="bp-decide">
        ${reviser}
        <button type="button" class="bp-passer" id="bpAccueil">${icon('house')}<span>Retour à l'accueil</span></button>
      </div>
    </div>
  </div>`.balisage;
	const aReviser = ecran.reviser;
	if (aReviser) document.getElementById('bpReviserErreurs')?.addEventListener('click', aReviser);
	document.getElementById('bpAccueil')!.addEventListener('click', goHome);
	sheets().querySelector<HTMLElement>('.bp-recap')?.focus({ preventScroll: true });
	window.scrollTo({ top: 0, behavior: 'smooth' });
	// Ce que le bilan vient de rapporter (niveau, trophées, objectif du jour) : les modales
	// habituelles, comme après une leçon, ouvertes APRÈS le récapitulatif (décision du
	// mainteneur, #777) — jamais sur l'écran de correction d'une partie, et jamais recopiées
	// ici. Le focus, posé d'abord sur la carte, y revient à la fermeture.
	const gains = ecran.gains;
	if (gains) announceRewards(gains.niveauGagne, gains.recompensesNiv, gains.celeb);
}
