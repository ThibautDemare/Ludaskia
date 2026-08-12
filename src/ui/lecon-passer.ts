/* ============================================================
   « Je ne sais pas, montre-moi » (#467) — sortie de secours des runners de leçon
   à WIDGET (tuiles, rangement d'une suite, tri par thème, appariement, clique sur
   le mot) et à SAISIE contrainte (problème, tableau de conversion, droite graduée,
   QCM multi-sélection).
   ------------------------------------------------------------
   Ces runners sont les VRAIS culs-de-sac de l'entraînement : leur bouton
   « Vérifier » reste `disabled` tant que le GESTE n'est pas complet (toutes les
   tuiles posées, tous les mots reliés, toutes les cases du tableau remplies, au moins
   une propriété cochée…) ou refuse un champ vide (problème). Un enfant bloqué par le
   GESTE — et pas par la notion, cas typique d'un profil dyspraxique — n'avait donc
   aucune issue : ni valider, ni passer, seulement quitter la leçon. On lui en donne une,
   ASSUMÉE comme une réponse fausse (jamais un « passer » gratuit et muet) :
     - la question compte au DÉNOMINATEUR (`finishLeconRun(…, questions.length)`) sans
       compter au score : 0 XP, et le sans-faute — donc l'étoile — n'est plus
       atteignable pour cet essai, exactement comme après une erreur ;
     - l'erreur est journalisée pour l'espace encadrant, marquée « n'a pas essayé »
       (`sansTentative` + `donnee: ''`) : un aveu d'ignorance n'est pas une faute de
       raisonnement, et les confondre ferait croire à une confusion qui n'existe pas.
       Nuance quand l'enfant avait COMMENCÉ (case de problème remplie, repère déjà placé
       sur la droite graduée, cases déjà cochées d'un QCM multi) : c'est alors une vraie
       entrée d'erreur avec ce qu'il avait proposé — voir chaque runner, le journal doit
       dire ce qui s'est passé et non le raccourci commode ;
     - la question n'est PAS rejouée dans la série en cours (l'index avance).

   Le fond COMMUN avec le mode Révision (libellé du lien, ton du verdict, neutralisation
   du widget, annonce non visuelle, entrée de journal « n'a pas essayé ») vit dans
   ui/revelation-neutre.ts : les deux écrans en sont deux HABILLAGES, pas deux
   implémentations — un correctif de fond ne peut donc plus s'appliquer à un seul des
   deux. Ce module-ci ne garde que ce qui est propre au mode leçon : les styles
   `.sprint-*`, les ids repérés par les specs e2e, le bloc de décision et l'enchaînement
   par `wireNext`.

   Module partagé par les NEUF runners d'écran dédié : les cinq à widget et les quatre à
   saisie contrainte. Reste dehors ce qui n'est pas un cul-de-sac — le QCM simple (taper un
   choix est toujours possible, et un essai de leçon n'alimente pas la répétition espacée,
   donc l'argument du « meilleur signal » de la révision ne s'y applique pas) et le parcours
   d'orthographe, qui a déjà sa sortie (deux essais puis bascule vers l'atelier du mot).
   ============================================================ */
import { wireNext } from './lecon-runner-shared';
import {
	annoncerRevelation,
	capterPasse as capterPasseNeutre,
	lienPasserHTML,
	neutraliserScene,
	REVEAL_LAB,
} from './revelation-neutre';

/* Fond commun réexporté tel quel : les runners n'ont qu'un import pour tout ce qui touche
   à « Je ne sais pas, montre-moi », et la formulation de la ligne de révélation reste la
   MÊME qu'en révision (source unique, cf. revelation-neutre.ts). */
export { ligneRevelation, REVELATION_EN_PLACE } from './revelation-neutre';

/* Id du lien de déblocage — un seul par écran (les runners ne posent qu'une question à
   la fois), donc un id FIXE, stable pour les specs e2e comme `#ltuiVerif` et compagnie. */
export const PASSER_ID = 'leconPasser';

/** Options de rendu du bloc de décision — les deux seules différences entre les neuf
    runners, tout le reste (libellés, ordre, écart, styles) étant volontairement figé ici. */
export interface DecisionOpts {
	/* « Vérifier » actif dès l'affichage : c'est le cas du problème, dont la validation
	   refuse un champ vide au lieu de se désactiver. Les autres runners partent `disabled`
	   (geste incomplet), d'où le défaut. */
	actif?: boolean;
	/* Classe supplémentaire sur le BLOC (pas sur le bouton) : un runner dont le « Vérifier »
	   était collant en bas d'écran doit rendre collant le bloc entier, sinon le bouton ne
	   peut plus sortir de son nouveau conteneur (cf. `.lqcm-multi-decide`). */
	classeBloc?: string;
}

/** Bloc de décision d'une question : « Vérifier » puis, EN DESSOUS et nettement détaché,
    le lien de déblocage — dans cet ordre en DOM comme au clavier, la validation restant la
    première action atteinte. Les neuf runners rendaient déjà le même bouton « Vérifier »
    (`.sprint-btn`, id propre au runner, repère des specs e2e) : il passe donc par ici.

    Le lien est un vrai `<button type="button">`, JAMAIS un `<a>` (rien à naviguer), et il
    est TOUJOURS actif, même quand « Vérifier » est `disabled` : c'est tout son intérêt. */
export function decisionHTML(verifId: string, o: DecisionOpts = {}): string {
	const bloc = o.classeBloc ? ` ${o.classeBloc}` : '';
	return `<div class="lecon-decide${bloc}">
        <button class="sprint-btn" id="${verifId}"${o.actif ? '' : ' disabled'}>Vérifier</button>
        ${lienPasserHTML('lecon-passer', PASSER_ID)}
      </div>`;
}

/** Câble le lien rendu par `decisionHTML`. `onPasser` fait le travail propre au format :
    journaliser, avancer l'index, composer la révélation. */
export function wirePasser(root: ParentNode, onPasser: () => void): void {
	root.querySelector<HTMLButtonElement>(`#${PASSER_ID}`)?.addEventListener('click', onPasser);
}

/** Efface le bloc de décision (les DEUX boutons) : une fois la question tranchée — validée
    ou révélée — seul « Continuer ▶ » reste (#153). Masquer le seul « Vérifier » laisserait
    un « Je ne sais pas, montre-moi » cliquable sur une question déjà corrigée. */
export function masquerDecision(root: ParentNode): void {
	const bloc = root.querySelector<HTMLElement>('.lecon-decide');
	if (bloc) bloc.hidden = true;
}

/** Journalise une question PASSÉE, sous le mode 'lecon' (cf. revelation-neutre.ts pour la
    règle : réponse donnée vide + marqueur `sansTentative`). */
export function capterPasse(o: {
	text: string;
	figure?: string;
	attendue: string;
	lessonId: string;
}): void {
	capterPasseNeutre({ ...o, mode: 'lecon' });
}

/* Scène à désarmer côté leçon : la carte du runner. Zones d'APRÈS-verdict à ne jamais
   désarmer : le feedback et le bouton « Continuer ▶ ». La mécanique elle-même (et sa
   raison d'être : ne JAMAIS appeler `ctrl.verify()`) est dans `neutraliserScene`. */
function neutraliserWidget(root: ParentNode): void {
	neutraliserScene({
		scene: root.querySelector<HTMLElement>('.sprint-stage'),
		classeFige: 'lecon-fige',
		apres: '.sprint-correction, .sprint-actions',
	});
}

export interface RevelationOpts {
	root: HTMLElement; // conteneur de l'écran du runner (#sheets)
	feedback: HTMLElement; // zone de correction du runner (#…Feedback)
	actions: HTMLElement; // zone d'enchaînement du runner (#…Actions)
	repHTML: string; // ligne de révélation, cf. ligneRevelation
	extraHTML?: string; // complément affiché dessous (solution en bloc, explication)
	annonce: string; // même contenu, en TEXTE, pour la live region
	isLast: boolean; // dernière question de la série → « Voir mon résultat ▶ »
	onNext: () => void; // enchaînement (question suivante ou écran de résultat)
	/* Désarmer le widget de la scène ? Défaut oui. À mettre à `false` quand le runner a DÉJÀ
	   verrouillé sa saisie lui-même et que la scène contient des outils qui doivent rester
	   utilisables : le brouillon du problème (ardoise ouverte, à pouvoir refermer) serait
	   sinon désactivé, et `.lecon-fige` lui couperait le tracé. */
	figerWidget?: boolean;
}

/** Révèle la solution d'une question passée : verdict NEUTRE (ni rouge ni ✗, aucune
    animation — l'enfant n'a pas échoué, il a demandé à voir), widget neutralisé mais
    laissé visible, annonce pour lecteur d'écran, puis « Continuer ▶ ». La réponse reste
    mise en valeur en `--ok` (via `.sprint-correction strong`) : c'est bien la BONNE qu'il
    regarde. N'enregistre rien : le comptage passe par le chemin habituel du runner
    (`finishLeconRun`, dénominateur inchangé, score non incrémenté). */
export function revelerSolution(o: RevelationOpts): void {
	masquerDecision(o.root);
	if (o.figerWidget !== false) neutraliserWidget(o.root);
	// Un runner d'écran dédié n'a qu'UNE région live à la fois : celle de son widget
	// (`#ltriStatus`, `#lappStatus`, `#lclicStatus`, `#probStatus`) OU la sienne, fixe
	// (`#ltuiStatus`, `#lordStatus`, `#dgStatus`, `#lqmStatus`, `#tcStatus`) — d'où la
	// recherche dans la carte, sans repli à distinguer.
	annoncerRevelation({
		scope: o.root.querySelector<HTMLElement>('.sprint-stage'),
		message: o.annonce,
	});
	wireNext(o.actions, o.feedback, {
		feedbackHTML: `<div class="lecon-reveal">
        <span class="lecon-reveal-lab">${REVEAL_LAB}</span>
        <span class="lecon-reveal-rep">${o.repHTML}</span>
      </div>${o.extraHTML ?? ''}`,
		isLast: o.isLast,
		onNext: o.onNext,
	});
}
