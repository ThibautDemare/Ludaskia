/* ============================================================
   Widget « Clique sur le mot » (#259, mutualisé #466) — sélectionner dans une
   phrase le(s) mot(s) répondant à une consigne. Extrait du runner de leçon
   (ui/lecon-clic-mot.ts) pour être RÉUTILISÉ À L'IDENTIQUE par le mode Révision
   (ui/revision.ts), qui le dégradait en recopie au clavier (bruit orthographique,
   ambiguïté pour les consignes multi-mots). Même contrat que les widgets à tuiles
   (ui/tuile-interaction.ts) et d'appariement (ui/appariement.ts) : l'appelant garde
   son « chrome » (libellé de leçon, consigne, bouton Vérifier, feedback,
   enchaînement) ; le widget expose `verify()` (fige + marque ✓/✗ + révèle les
   cibles + renvoie la justesse) et notifie l'état de sélection via `onState`, pour
   que l'appelant (dé)active son propre bouton.

   Sélection MULTIPLE réversible : taper un mot le sélectionne, retaper le
   désélectionne ; aucune correction au 1er tap. Correction par ÉGALITÉ D'ENSEMBLES
   EXACTE (ni plus, ni moins) — au passé composé, le verbe fait 2 mots (auxiliaire +
   participe). Feedback DIFFÉRÉ à la validation : chaque mot choisi est figé et
   marqué (couleur + pastille, jamais la couleur seule) ; un mot-cible NON choisi est
   révélé (surlignage vert doux) même en cas d'erreur. Une live region (#lclicStatus)
   annonce le verdict (le focus part alors sur « Continuer »).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { ttsAttr } from '../core/tts-text';
import { estPonctuation, libelleCible } from '../data/francais/grammaire-clic-mot';

export interface ClicMotSpec {
	tokens: string[];
	cibleIndices: number[];
	/** Énoncé complet lu à voix haute (bouton « Écouter » de la phrase). Optionnel :
	    absent ⇒ pas de zone TTS greffée sur la phrase. */
	parle?: string;
	/** Nom de la cible au singulier (« le verbe conjugué », « l'article »…) : alimente
	    les aria-labels de correction. Absent ⇒ repli générique « la bonne réponse ». */
	cibleLabel?: string;
	/** Justification courte annoncée dans la live region après une erreur (parité avec
	    le feedback visuel). Optionnelle. */
	explication?: string;
	/** L'`explication` ÉNONCE DÉJÀ le(s) mot(s)-cible (#436, drapeau porté par la donnée
	    de l'exercice) : la live region n'y ajoute pas son « La bonne réponse : … », qui
	    répéterait la même énumération. Sans explication à annoncer, le drapeau est IGNORÉ —
	    la bonne réponse est dite quand même (ne jamais laisser un enfant au lecteur d'écran
	    sans la réponse). */
	explicationNommeCible?: boolean;
}

export interface ClicMotOptions {
	/** Notifié après chaque (dé)sélection avec la présence d'au moins un mot choisi :
	    l'appelant (dé)active alors son bouton « Vérifier ». Non appelé une fois figé. */
	onState: (hasSelection: boolean) => void;
}

export interface ClicMotController {
	/** Fige le widget, marque ✓/✗, révèle les cibles, renvoie la justesse (égalité
	    d'ensembles exacte). Idempotent : un second appel renvoie le même verdict. */
	verify(): boolean;
	/** Indices des mots sélectionnés (ordre croissant), pour le journal d'erreurs (#391). */
	selected(): number[];
}

/* Point d'entrée unique. Remplace le placeholder `[data-tuile-mount]` de `root` par
   la phrase cliquable + une live region, câble la (dé)sélection, et renvoie le
   contrôleur. */
export function bindClicMot(
	root: HTMLElement,
	spec: ClicMotSpec,
	opts: ClicMotOptions,
): ClicMotController {
	const { tokens, cibleIndices, cibleLabel, explication } = spec;
	const selection = new Set<number>();
	let fige = false;
	let resultat = false;

	const motsHTML = tokens
		.map((t, i) =>
			estPonctuation(t)
				? `<span class="lclic-ponct">${escapeHTML(t)}</span>`
				: `<button type="button" class="lclic-mot" data-i="${i}" aria-pressed="false">${escapeHTML(t)}</button>`,
		)
		.join('');
	const mount = root.querySelector('[data-tuile-mount]');
	if (mount) {
		mount.outerHTML = `
    <div class="lclic-phrase-zone"${spec.parle ? ttsAttr(spec.parle) : ''}>
      <div class="lclic-phrase">${motsHTML}</div>
    </div>
    <p class="sr-only" id="lclicStatus" role="status" aria-live="polite" aria-atomic="true"></p>`;
	}

	const status = root.querySelector('#lclicStatus') as HTMLElement | null;

	/* (Dé)sélectionne un mot (réversible tant que non figé) et notifie l'appelant. */
	root.querySelectorAll<HTMLButtonElement>('.lclic-mot').forEach((btn) => {
		btn.addEventListener('click', () => {
			if (fige) return;
			const i = Number(btn.dataset.i);
			if (selection.has(i)) {
				selection.delete(i);
				btn.classList.remove('is-selected');
				btn.setAttribute('aria-pressed', 'false');
			} else {
				selection.add(i);
				btn.classList.add('is-selected');
				btn.setAttribute('aria-pressed', 'true');
			}
			opts.onState(selection.size > 0);
		});
	});

	return {
		verify(): boolean {
			if (fige) return resultat;
			fige = true;
			const cible = new Set(cibleIndices);
			const nomCible = cibleLabel ?? 'la bonne réponse';
			// Égalité d'ensembles exacte : même cardinal ET tout sélectionné est cible.
			const juste = selection.size === cible.size && [...selection].every((i) => cible.has(i));
			resultat = juste;

			// Feedback token par token (mots seulement). Un mot choisi est marqué juste
			// (dans la cible) / faux (hors cible) ; un mot-cible NON choisi est révélé.
			root.querySelectorAll<HTMLButtonElement>('.lclic-mot').forEach((btn) => {
				const i = Number(btn.dataset.i);
				btn.disabled = true;
				btn.classList.remove('is-selected');
				// L'état de bascule n'a plus de sens une fois figé : on le retire pour ne pas
				// mêler un `aria-pressed` obsolète au verdict (parité avec bindAppariement, #466).
				btn.removeAttribute('aria-pressed');
				const estCible = cible.has(i);
				const estChoisi = selection.has(i);
				// Cible MULTIPLE (ni…ni, sujet composé, tous les noms / déterminants d'une phrase
				// au CE2) : un mot n'est pas « la » réponse à lui seul, et le libellé peut être au
				// PLURIEL (« les noms ») — on énonce alors l'appartenance à la réponse plutôt que
				// d'accorder la phrase avec le libellé (« ce n'est pas les noms »).
				const multiple = cible.size > 1;
				if (estChoisi && estCible) {
					marquer(btn, 'correct', '✓', `${btn.textContent ?? ''}, correct`);
				} else if (estChoisi && !estCible) {
					const dit = multiple
						? `ce mot ne fait pas partie de la réponse`
						: `ce n'est pas ${nomCible}`;
					marquer(btn, 'wrong', '✗', `${btn.textContent ?? ''}, ${dit}`);
				} else if (!estChoisi && estCible) {
					// Bonne réponse révélée dans la phrase (surlignage vert doux), sans pastille.
					btn.classList.add('is-cible');
					const suffixe = multiple
						? `, ce mot faisait partie de la réponse : ${nomCible}`
						: `, c'était ${nomCible}`;
					btn.setAttribute('aria-label', `${btn.textContent ?? ''}${suffixe}`);
				}
			});

			// Annonce du verdict pour lecteur d'écran (le focus part sur « Continuer »).
			// L'explication qui NOMME déjà la cible (drapeau de la donnée, #436) tient lieu
			// d'annonce : on ne fait pas entendre deux fois la même énumération. Sans
			// explication, le drapeau est ignoré et la réponse est annoncée — le repli DIT
			// toujours la réponse.
			if (status) {
				const dejaNommee = !!spec.explicationNommeCible && !!explication;
				const reponse = dejaNommee
					? ''
					: ` La bonne réponse : ${libelleCible(tokens, cibleIndices)}.`;
				status.textContent = juste
					? 'Bravo, bonne réponse.'
					: `Ce n'est pas ça.${reponse}${explication ? ` ${explication}` : ''}`;
			}
			return juste;
		},
		selected(): number[] {
			return [...selection].sort((a, b) => a - b);
		},
	};
}

/* Applique un verdict à un mot : classe d'état, pastille ✓/✗ (double codage couleur
   + signe), et aria-label parlant pour le lecteur d'écran. */
function marquer(
	btn: HTMLButtonElement,
	etat: 'correct' | 'wrong',
	signe: string,
	aria: string,
): void {
	btn.classList.add(etat);
	btn.setAttribute('aria-label', aria);
	const mark = document.createElement('span');
	mark.className = 'lclic-mark';
	mark.setAttribute('aria-hidden', 'true');
	mark.textContent = signe;
	btn.appendChild(mark);
}
