/* ============================================================
   Résolution GÉNÉRÉE d'un placement sur la droite graduée (#490) — logique pure.
   ------------------------------------------------------------
   Contrairement au calcul posé et au tableau de conversion, cette tâche n'est PAS une
   accumulation : c'est une décision perceptive, quasi instantanée une fois l'échelle
   comprise. La découper en huit pas produirait un bavardage sur un geste unique (avis
   `pedagogue-primaire`). D'où un déroulé volontairement COURT — trois pas, jamais plus —
   qui suit l'ordre réel du raisonnement :

   1. ce que vaut une graduation. C'est le fait numérique isolé de cette famille,
      l'équivalent du « 3 + 8 + 1 = 12 » de l'addition posée. Et c'est structurellement
      plus décisif ici qu'ailleurs : l'échelle CHANGE à chaque item (un cran vaut 1, 10,
      100, 1 000, 0,1 ou 0,01 selon la fenêtre tirée). Sauter ce pas réduit l'exercice à
      un comptage aveugle qui ne transfère à rien ;
   2. d'où l'on part : le nombre ÉCRIT juste avant la cible, et non la borne de gauche —
      sinon l'enfant compte neuf crans là où deux suffisent ;
   3. combien de sauts, en nommant le piège (on compte les SAUTS d'un trait à l'autre,
      pas les traits), puis on pose le repère.

   Le comptage est doublé d'un relais VISUEL (`parcours`, cf. core/figures/droite.ts) :
   le texte seul laisse sans repère l'enfant qui décroche, là où la grille du calcul posé
   montrait l'avancement d'elle-même.
   ============================================================ */
import type { DerouleEtayage, PasEtayage } from './etayage-deroule';
import { nbIntervalles } from './figures/droite';

/** Une graduation numérotée : sa valeur d'axe et son écriture. */
export interface BorneDroite {
	valeur: number;
	label: string;
}

/** Le placement à dérouler. Les valeurs sont dans l'unité INTERNE du client (centièmes
    entiers pour les décimaux, cf. data/maths/droite-graduee.ts) et les libellés sont déjà
    formatés : ce module ne choisit aucune représentation, il raconte. */
export interface DroiteSpec {
	min: number;
	max: number;
	pas: number;
	bornes: BorneDroite[]; // les graduations NUMÉROTÉES (bornes + milieu)
	cible: number;
	cibleLabel: string;
	pasLabel: string; // ce que vaut UNE graduation, écrit comme l'enfant l'écrirait
}

/** Un pas du déroulé de la droite : sa phrase, plus l'état de la FIGURE à ce moment-là.
    La droite ne se remplit pas case par case comme une grille — ce qui avance, c'est un
    repère et un chemin —, d'où cet état propre au moteur plutôt que des `ecritures`. */
export interface PasDroite extends PasEtayage {
	/** Repère posé à ce pas (valeur d'axe), absent = aucun repère encore. */
	repere?: number;
	/** Portion d'axe déjà parcourue, mise en avant sous les graduations. */
	parcours?: { de: number; a: number };
}

export interface DerouleDroite extends DerouleEtayage {
	pas: PasDroite[];
}

/** Spécification tirée de l'exercice que l'enfant vient de rater : une simple projection
    (l'exercice porte déjà tout, fenêtre, bornes chiffrées, cible et valeur d'un cran). */
export function droiteDepuisExercice(ex: {
	min: number;
	max: number;
	pas: number;
	bornes: readonly BorneDroite[];
	cible: number;
	cibleLabel: string;
	pasLabel: string;
}): DroiteSpec {
	return {
		min: ex.min,
		max: ex.max,
		pas: ex.pas,
		bornes: [...ex.bornes],
		cible: ex.cible,
		cibleLabel: ex.cibleLabel,
		pasLabel: ex.pasLabel,
	};
}

/** La graduation CHIFFRÉE juste avant la cible : le point de départ du comptage. La cible
    tombe toujours sur une graduation muette (le générateur l'y contraint), il y a donc
    toujours une borne strictement en dessous. */
export function borneAvant(spec: DroiteSpec): BorneDroite | undefined {
	const candidates = spec.bornes.filter((b) => b.valeur < spec.cible);
	if (!candidates.length) return undefined;
	return candidates.reduce((a, b) => (b.valeur > a.valeur ? b : a));
}

/** Déroulé d'un placement. Vide (donc pas de panneau) si la fenêtre ne porte aucune
    graduation chiffrée sous la cible : sans point de départ nommé, le comptage n'aurait
    pas d'ancre et la démonstration reviendrait à désigner la réponse. */
export function derouleDroite(spec: DroiteSpec): DerouleDroite {
	const depart = borneAvant(spec);
	// `pasLabel` manquant : la spécification vient d'un instantané de reprise (#498) écrit
	// par une version antérieure. Rien à raconter sans la valeur d'un cran — c'est le
	// premier pas, et sans lui le reste n'est qu'un comptage aveugle.
	if (!depart || !spec.pasLabel) return { titre: '', pas: [] };
	const n = nbIntervalles(spec.min, spec.max, spec.pas);
	const sauts = Math.round((spec.cible - depart.valeur) / spec.pas);
	const premiere = spec.bornes[0];
	const derniere = spec.bornes[spec.bornes.length - 1];
	const pas: PasDroite[] = [
		{
			// L'échelle AVANT tout le reste : de combien de graduations est faite la fenêtre,
			// donc ce que vaut chacune. Le nombre écrit n'est jamais « lu » sur la droite, il
			// se DÉDUIT de ce calcul.
			phrase:
				`Je regarde d'abord les nombres écrits : ${premiere.label} et ${derniere.label}. ` +
				`Entre les deux, il y a ${n} graduations : chaque graduation vaut donc ${spec.pasLabel}.`,
		},
		{
			phrase:
				`Je cherche ${spec.cibleLabel}. Je pars du nombre écrit juste avant lui : ${depart.label}. ` +
				`Partir de plus loin ferait compter beaucoup plus de graduations pour rien.`,
			repere: depart.valeur,
		},
		{
			phrase:
				`De ${depart.label} à ${spec.cibleLabel}, j'avance de ${sauts} ${sauts > 1 ? 'graduations' : 'graduation'}. ` +
				`Je compte les sauts d'un trait au suivant, jamais les traits eux-mêmes. ` +
				`Je pose mon repère à l'arrivée : ${spec.cibleLabel}.`,
			repere: spec.cible,
			parcours: { de: depart.valeur, a: spec.cible },
		},
	];
	return { titre: `Placer ${spec.cibleLabel}`, pas };
}
