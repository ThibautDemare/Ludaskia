/* ============================================================
   Décompte du sprint (#630) — l'arithmétique du temps restant, hors DOM.

   Le mode Sprint gèle déjà son compte à rebours pendant la correction d'une
   erreur. L'écoute de l'énoncé à voix haute ajoute une SECONDE raison de geler,
   et les deux peuvent se chevaucher (écouter pendant qu'une correction est
   affichée). Un booléen unique obligerait alors à mémoriser « l'état d'avant »
   à chaque gel — et la fin de l'audio dégèlerait un décompte que la correction
   voulait garder figé. D'où une pause à plusieurs CAUSES : le temps repart quand
   la DERNIÈRE cause est retirée, jamais avant. C'est toujours UN concept de
   pause, avec deux entrées.

   Le temps courant est TOUJOURS reçu en paramètre, jamais lu depuis `Date.now()` :
   le module reste pur (testable sans faux timers), et l'appelant reste maître de
   son horloge.

   Chaque bascule SOLDE d'abord le temps couru depuis le dernier relevé. Sans ce
   solde, l'intervalle entre le dernier battement (250 ms) et le clic ne serait
   jamais décompté : chaque écoute offrirait jusqu'à un quart de seconde de
   réflexion gratuite, et réécouter en boucle achèterait du temps — exactement ce
   que le critère 12 de l'issue interdit.
   ============================================================ */

/** Ce qui peut geler le décompte. */
export type CauseGel = 'correction' | 'lecture';

export interface Decompte {
	/** Temps restant (ms), tel que soldé au dernier relevé. Jamais négatif : le
	 *  compte à rebours s'arrête à zéro. Sans cette borne, « le temps utilisé » se
	 *  calculerait un jour par `durée − restant()` et dépasserait la durée de la
	 *  partie, pour la seule raison qu'on aurait relevé l'heure tard. */
	restant(): number;
	/** Le décompte est-il gelé (au moins une cause active) ? */
	enPause(): boolean;
	/** Cette cause-là est-elle active ? À interroger — plutôt que `enPause()` — dès
	 *  qu'on veut savoir DANS QUEL ÉTAT est l'écran, et non si le temps court : une
	 *  correction affichée attend « Continuer », une lecture en cours n'attend rien
	 *  et ne doit pas empêcher l'enfant de répondre. Confondre les deux ferait
	 *  ignorer une réponse tapée pendant l'audio, ou pire, sauter la question. */
	gelePar(cause: CauseGel): boolean;
	/** Solde le temps couru depuis le dernier relevé et renvoie le restant. */
	tic(now: number): number;
	/** Ajoute une cause de gel (idempotent). SOLDE d'abord le temps couru jusqu'à
	 *  `now` : c'est à ça que sert le paramètre, et c'est ce qui empêche l'intervalle
	 *  entre le dernier battement et le clic d'être offert à l'enfant. */
	geler(cause: CauseGel, now: number): void;
	/** Retire une cause de gel (idempotent : dégeler une cause jamais posée ne fait
	 *  rien de plus que déplacer le relevé). Solde de même, pour que le temps reparte
	 *  exactement à `now` et pas depuis le dernier battement. */
	degeler(cause: CauseGel, now: number): void;
}

export function creerDecompte(dureeMs: number, maintenant: number): Decompte {
	let restant = dureeMs;
	let dernier = maintenant;
	const gels = new Set<CauseGel>();

	/* Ferme l'intervalle [dernier, now] : il n'est retiré du restant que si
	   AUCUNE cause de gel n'était active pendant celui-ci. Le relevé avance dans
	   tous les cas, sinon le temps passé en pause ressortirait au dégel. */
	const solder = (now: number): void => {
		if (!gels.size) restant = Math.max(0, restant - (now - dernier));
		dernier = now;
	};

	return {
		restant: () => restant,
		enPause: () => gels.size > 0,
		gelePar: (cause) => gels.has(cause),
		tic(now) {
			solder(now);
			return restant;
		},
		geler(cause, now) {
			solder(now);
			gels.add(cause);
		},
		degeler(cause, now) {
			solder(now);
			gels.delete(cause);
		},
	};
}
