/* ============================================================
   Séance partagée (#734) jouée dans un runner « une question à la fois ».

   Les dix runners de leçon (QCM, QCM multi, tuiles, rangement, tri, tableau,
   appariement, clic-mot, droite graduée, problème) jouent ici les exercices FIGÉS d'un
   envoi, au lieu d'en tirer. Ce qui change par rapport au jeu libre, et rien d'autre :
   - aucun verdict avant la fin (critère 17) : « Valider » note la réponse et passe à la
     question suivante, sans marque juste/faux, sans explication ni étayage ;
   - « Je ne sais pas » est une case du bloc de décision (critère 9), comme sur la fiche.
     Elle n'efface pas le widget, et toucher au widget la décoche ;
   - aucun retour en arrière (arbitrage du mainteneur) : chaque « Valider » est définitif,
     comme en jeu libre ;
   - ni XP de leçon, ni étoile, ni reprise, ni aide ouverte d'office : la séance appartient
     à l'écran partagé (`partage-seance.ts`), qui fige le résultat et journalise à la fin.
   Partis pris de rendu : avis designer-ux-enfant et specialiste-troubles-apprentissage.

   La correction reste celle du format (critère 11) : chaque runner calcule son verdict
   avec la règle de son jeu libre, puis le confie à `noter`.
   ============================================================ */
import type { LessonDef, SchoolLevel } from '../core/catalog';
import type { Exercise, ExerciseMode } from '../core/exercise';
import { html, type SafeHtml } from '../core/html';
import type { CaptureErreurOpts } from './erreur-capture';

/** Une entrée du journal d'erreurs, sans son mode : la séance la journalise elle-même, en
 *  `partage`, une fois le passage fini (rien n'est écrit si l'enfant quitte avant). */
export type ErreurRunner = Omit<CaptureErreurOpts, 'mode'>;

/** Ce qu'un runner a noté pour une question. */
export interface ReponseRunner {
	statut: 'juste' | 'faux' | 'jnsp';
	/** Réponse donnée, lisible : la mise en forme du journal du format. Vide pour « je ne
	 *  sais pas ». */
	saisie: string;
	/** Réponse attendue lisible, quand le runner la dit mieux que la capture déclarée au
	 *  départ (repli de l'exercice en fiche). */
	attendue?: string;
	/** Entrées de journal, à la granularité du format en jeu libre (une par mot mal rangé,
	 *  par étape ratée, par paire mal reliée…). Vide pour une réponse juste. */
	erreurs: ErreurRunner[];
}

/** La séance qu'un runner joue pour l'écran partagé. */
export interface SeanceRunner {
	lesson: LessonDef;
	/** Mode effectif de l'envoi : celui de l'encadrant, ou le mode par défaut. */
	mode: ExerciseMode | undefined;
	/** Niveau de l'ENVOI, jamais celui du profil actif (critère 2). */
	niveau: SchoolLevel;
	exercices: readonly Exercise[];
	/** Conteneur où le runner rend chaque question. */
	scene: HTMLElement;
	/** Note la réponse à la question `index` (son rang dans `exercices`). */
	noter(index: number, reponse: ReponseRunner): void;
	/** Après la dernière question : fige le résultat et affiche la fin. */
	terminer(): void;
	/** Annonce un texte dans la région live de l'écran, qui survit aux questions. */
	annoncer(texte: string): void;
}

const JNSP_ID = 'partageJnsp';
const AIDE_ID = 'partageValiderAide';

/** Bloc de décision d'une question : « Je ne sais pas », puis « Valider ». La case vient
 *  AVANT le bouton, entre la réponse et la validation : sous le bouton, à la place du lien
 *  « montre-moi » du jeu libre, elle deviendrait un raccourci sous le pouce (avis
 *  designer). L'aide dit pourquoi « Valider » est grisé : un bouton grisé muet se lit
 *  comme « faux ». */
export function decisionPartageHTML(validerId: string, classeBloc?: string): SafeHtml {
	return html`<div class="lecon-decide partage-decide${classeBloc ? ` ${classeBloc}` : ''}">
        <label class="partage-jnsp"><input type="checkbox" id="${JNSP_ID}"><span>Je ne sais pas</span></label>
        <p class="partage-aide" id="${AIDE_ID}">Réponds, ou coche « Je ne sais pas ».</p>
        <button class="sprint-btn" id="${validerId}" data-partage-valider aria-describedby="${AIDE_ID}" disabled>Valider</button>
      </div>`;
}

export interface DecisionPartage {
	/** « Je ne sais pas » est-il coché ? */
	jnsp(): boolean;
	/** Le widget vient de changer : décoche « Je ne sais pas », puis recalcule « Valider ». */
	widgetTouche(): void;
	/** Recalcule l'état de « Valider ». */
	maj(): void;
}

/** Câble le bloc de `decisionPartageHTML`. `repondu` est la règle d'activation du format
 *  (rangée pleine, tout relié, un choix fait…) : « Valider » ne note jamais une question
 *  laissée sans réponse, sauf « je ne sais pas ». Un seul « Valider » par question : un
 *  double appui ne note pas deux fois et ne saute pas une question.
 *  L'aide n'est la description du bouton que tant qu'elle s'affiche : masquée mais encore
 *  référencée, elle resterait lue (« Valider, Réponds, ou coche… ») sur un bouton actif. */
export function brancherDecisionPartage(
	root: ParentNode,
	o: { validerId: string; repondu: () => boolean; onValider: () => void },
): DecisionPartage {
	const caseJnsp = root.querySelector<HTMLInputElement>(`#${JNSP_ID}`)!;
	const valider = root.querySelector<HTMLButtonElement>(`#${o.validerId}`)!;
	const aide = root.querySelector<HTMLElement>(`#${AIDE_ID}`);
	let valide = false;
	const maj = () => {
		const ok = caseJnsp.checked || o.repondu();
		valider.disabled = !ok;
		if (aide) aide.hidden = ok;
		if (ok) valider.removeAttribute('aria-describedby');
		else valider.setAttribute('aria-describedby', AIDE_ID);
	};
	caseJnsp.addEventListener('change', maj);
	valider.addEventListener('click', () => {
		if (valide || valider.disabled) return;
		valide = true;
		try {
			o.onValider();
		} catch (e) {
			// La question resterait sinon bloquée sans issue : on rend la main.
			valide = false;
			throw e;
		}
	});
	maj();
	return {
		jnsp: () => caseJnsp.checked,
		widgetTouche: () => {
			caseJnsp.checked = false;
			maj();
		},
		maj,
	};
}

/** Entrée de journal d'une question passée par « je ne sais pas » : « n'a pas essayé »,
 *  comme `capterPasse` en jeu libre (#467). */
export function erreurPassee(o: {
	text: string;
	figure?: SafeHtml;
	attendue: string;
	lessonId: string;
}): ErreurRunner {
	return { ...o, donnee: '', sansTentative: true };
}

/** Après « Valider » : note la réponse, puis rend la question suivante, ou termine après
 *  la dernière. Le focus va sur la nouvelle question, jamais sur un champ (le clavier
 *  virtuel s'ouvrirait avant la lecture), et l'annonce dit que la réponse a compté sans
 *  dire si elle était juste. */
export function enchainerPartage(
	s: SeanceRunner,
	index: number,
	reponse: ReponseRunner,
	rendreSuivante: () => void,
): void {
	s.noter(index, reponse);
	const total = s.exercices.length;
	if (index + 1 >= total) {
		s.terminer();
		return;
	}
	rendreSuivante();
	s.annoncer(`Réponse enregistrée. Question ${index + 2} sur ${total}.`);
	focusQuestion(s, index + 2, total);
}

/* Focus sur la question affichée : la carte du runner, NOMMÉE (« Question 2 sur 5 »). Un
   conteneur sans rôle ni nom est muet ou relu en entier selon le lecteur d'écran, et le
   rang, écrit dans la barre de progression, est hors de la carte (relecture a11y). Le rang
   est donc dit même si l'annonce de la région live est coupée par la lecture du focus. */
function focusQuestion(s: SeanceRunner, rang: number, total: number): void {
	const stage = s.scene.querySelector<HTMLElement>('.sprint-stage');
	if (!stage) return;
	stage.tabIndex = -1;
	stage.setAttribute('role', 'group');
	stage.setAttribute('aria-label', `Question ${rang} sur ${total}`);
	// Un focus déjà posé DANS la question par son rendu n'est pas volé (même règle que la
	// révision, #528) : le clic-mot le met sur sa consigne, parce que la tâche change d'une
	// question à l'autre (« l'épithète », puis « l'attribut »).
	const actif = document.activeElement;
	if (actif && actif !== stage && stage.contains(actif)) return;
	stage.focus({ preventScroll: true });
}
