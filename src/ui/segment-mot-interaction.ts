/* ============================================================
   Widget « Délimite le bloc » (#716) — désigner dans une phrase un SEGMENT de mots
   contigus par ses deux bornes.

   Pourquoi un widget de plus, à côté de `ui/clic-mot-interaction.ts` : parce que le
   geste est l'enjeu. Cocher des mots un par un permet de désigner « chat » et
   « noir » en sautant « petit » — et un enfant qui répond ainsi n'a pas vu que le
   groupe nominal est un BLOC. Le cadrage de #716 (critère 3) interdit donc la
   sélection libre : ici, l'enfant pose un DÉBUT puis une FIN, et tout ce qui est
   entre les deux entre dans la réponse, qu'il l'ait touché ou non.

   ── Le geste, et ce qu'on a écarté ───────────────────────────────────────────
   Deux frappes-bornes, PAS un glissement continu. Le glissement existe pourtant
   déjà dans la maison (`ui/ortho-atelier.ts` : surligner un piège en passant le
   doigt sur des lettres), et c'était le candidat naturel. Le designer enfant et le
   spécialiste des troubles d'apprentissage l'ont écarté séparément, pour la même
   raison : l'atelier ne glisse que sur UN mot tenu sur UNE ligne, en `nowrap`, avec
   un calcul à une dimension (`clientX`). Une phrase entière passe à la ligne ; le
   doigt devrait alors suivre un trajet en L au-dessus d'une zone vide, et un
   décrochage en route (`pointercancel`, tremblement, occlusion) annule tout le geste
   sans qu'un enfant comprenne pourquoi. Deux frappes se calculent sur des INDICES de
   tokens : le retour à la ligne n'existe pas pour elles.

   Corollaire écarté lui aussi, et il était tentant : ajuster « intelligemment » la
   borne la plus proche quand l'enfant retape un mot. Règle invisible, fondée sur une
   distance que rien à l'écran n'explique — un résultat surprenant sans explication.
   Une frappe alors qu'un bloc est posé REPART donc d'une nouvelle borne, toujours.

   ── L'exposition accessible ──────────────────────────────────────────────────
   Un `<button>` par mot, comme le widget voisin — surtout PAS `role="listbox"` +
   `aria-multiselectable`. Ce motif n'existe que pour une sélection qui s'ÉTEND pas à
   pas (Maj+flèches) ; ici le bloc se ferme en exactement deux activations discrètes.
   L'adopter importerait un mode de navigation (tabindex roving, conventions clavier)
   pour un besoin qui n'existe pas, en cassant le Tab+Entrée que l'enfant a appris
   partout ailleurs.
   Reste une faille connue, et c'est le seul vrai défaut du bouton simple :
   `aria-pressed` promet implicitement qu'on décoche un élément en le réactivant, ce
   qui est FAUX ici (retaper un mot du bloc repart d'une borne). La règle du geste est
   donc énoncée dans la CONSIGNE — affichée et lue par la synthèse vocale — parce que
   l'ARIA seule ne peut pas la porter. Cf. docs/architecture/ui.md.

   L'appelant garde son chrome (libellé, consigne, bouton Vérifier, feedback) : même
   contrat que `bindClicMot`, `verify()` + `selected()` + `onState`.
   ============================================================ */

import { ttsAttr } from '../core/tts-text';
import { estPonctuation, libelleCible } from '../data/francais/grammaire-clic-mot';
import { ecartBornes, intervalleDe } from '../core/segment-bornes';
import { marquerMot, phraseMotsHTML } from './phrase-mots';
import { html } from '../core/html';

export interface SegmentMotSpec {
	tokens: string[];
	/** Indices du segment attendu — CONTIGUS par construction de la banque. */
	cibleIndices: number[];
	/** Énoncé complet lu à voix haute. Absent ⇒ pas de bouton « Écouter la phrase ». */
	parle?: string;
	/** Nom de ce qu'on cherche (« le groupe nominal ») : alimente les libellés de
	    correction. Absent ⇒ repli générique. */
	cibleLabel?: string;
	/** Justification courte annoncée après une erreur (parité avec le visuel). */
	explication?: string;
	/** L'`explication` CITE DÉJÀ le segment attendu (#436/#529) : la région live n'y
	    ajoute pas son « La bonne réponse : … », qui le répéterait mot pour mot. */
	explicationNommeCible?: boolean;
}

export interface SegmentMotOptions {
	/** Notifié à chaque changement avec « le bloc est fermé » : l'appelant (dé)active
	    alors son bouton « Vérifier ». Une borne seule ne suffit pas — un segment n'est
	    pas une réponse tant qu'il n'a pas de fin. */
	onState: (blocFerme: boolean) => void;
}

export interface SegmentMotController {
	/** Fige, marque ✓/✗, révèle le segment attendu, renvoie la justesse. Idempotent. */
	verify(): boolean;
	/** Indices des MOTS du bloc (ordre croissant, ponctuation exclue), pour le journal
	    d'erreurs (#391) et la correction. */
	selected(): number[];
}

export function bindSegmentMot(
	root: HTMLElement,
	spec: SegmentMotSpec,
	opts: SegmentMotOptions,
): SegmentMotController {
	const { tokens, cibleIndices, cibleLabel, explication } = spec;
	/** Borne posée en attente de sa jumelle (`null` = aucune). */
	let ancre: number | null = null;
	/** Bloc fermé, bornes incluses (`null` = pas encore de réponse). */
	let bloc: [number, number] | null = null;
	/** Une borne a-t-elle déjà été posée depuis l'ouverture de la question ? Décide de
	    la longueur de l'annonce : on explique le geste UNE fois, puis on se contente de
	    dire où en est l'enfant — cinq reposes de suite ne doivent pas réciter cinq fois
	    la même consigne dans l'oreille de qui écoute. */
	let dejaExplique = false;
	let fige = false;
	let resultat = false;

	const mount = root.querySelector('[data-tuile-mount]');
	if (mount) {
		// `data-tts-pos="start"` : le bouton « Écouter » est posé EN TÊTE de la zone,
		// donc AVANT les mots dans l'ordre de tabulation — avec « Recommencer » juste
		// après. Un enfant au clavier qui se trompe au troisième mot d'une phrase longue
		// atteindrait sinon « Recommencer » en traversant tous les mots restants.
		mount.outerHTML = html`
    <div class="lseg-zone"${spec.parle ? ttsAttr(spec.parle) : ''} data-tts-pos="start" data-tts-label="Écouter la phrase">
      <div class="lseg-outils">
        <button type="button" class="lseg-reset" id="lsegReset">Recommencer</button>
      </div>
      <div class="lseg-phrase">${phraseMotsHTML(tokens, 'lseg')}</div>
    </div>
    <p class="sr-only" id="lsegStatus" role="status" aria-live="polite" aria-atomic="true"></p>`.balisage;
	}

	const status = root.querySelector('#lsegStatus') as HTMLElement | null;
	const jetons = (): HTMLElement[] => [
		...root.querySelectorAll<HTMLElement>('.lseg-mot, .lseg-ponct'),
	];
	const boutons = (): HTMLButtonElement[] => [
		...root.querySelectorAll<HTMLButtonElement>('.lseg-mot'),
	];

	/** Les MOTS du bloc courant. La ponctuation qu'il enjambe est peinte mais jamais
	    comptée : un bloc allant de « Ce » à « chien » dans « Ce matin, le chien aboie »
	    ne répond pas « matin , le », et le journal du parent n'a pas à lire une virgule
	    comme si l'enfant l'avait désignée. */
	function motsDuBloc(): number[] {
		if (!bloc) return [];
		const out: number[] = [];
		for (let i = bloc[0]; i <= bloc[1]; i++) if (!estPonctuation(tokens[i])) out.push(i);
		return out;
	}

	/* Repeint l'état courant. Une seule fonction, appelée après chaque frappe : deux
	   chemins de peinture (poser / effacer) finiraient par diverger sur un cas. */
	function peindre(): void {
		const dans = bloc ? new Set(intervalle(bloc[0], bloc[1])) : new Set<number>();
		jetons().forEach((el) => {
			const i = Number(el.dataset.i);
			const estAncre = ancre === i;
			el.classList.toggle('est-ancre', estAncre);
			el.classList.toggle('dans-bloc', dans.has(i));
			el.classList.toggle('bloc-debut', !!bloc && i === bloc[0]);
			el.classList.toggle('bloc-fin', !!bloc && i === bloc[1]);
			// L'état de sélection est CALCULÉ (un mot du milieu y entre sans avoir été
			// touché) ; il n'en est pas moins vrai, et un lecteur d'écran doit l'entendre.
			if (el instanceof HTMLButtonElement)
				el.setAttribute('aria-pressed', String(estAncre || dans.has(i)));
		});
	}

	function annoncer(texte: string): void {
		if (status) status.textContent = texte;
	}

	function frapper(i: number): void {
		if (fige) return;
		if (bloc) {
			// Bloc déjà fermé : toute frappe REPART, y compris sur un mot du bloc.
			bloc = null;
			ancre = i;
			annoncer(`Nouvelle borne : « ${tokens[i]} ».`);
		} else if (ancre === null) {
			ancre = i;
			annoncer(
				dejaExplique
					? `Nouvelle borne : « ${tokens[i]} ».`
					: `Première borne : « ${tokens[i]} ». Touche maintenant le dernier mot.`,
			);
			dejaExplique = true;
		} else if (ancre === i) {
			// Retaper sa propre borne l'annule (même réversibilité que le widget voisin).
			// Aucun segment d'UN seul mot n'est ainsi atteignable, et c'est sans perte : un
			// groupe nominal commence par un déterminant, il fait toujours au moins deux mots.
			ancre = null;
			annoncer('Borne annulée.');
		} else {
			bloc = [Math.min(ancre, i), Math.max(ancre, i)];
			ancre = null;
			const mots = motsDuBloc();
			annoncer(`Tu as choisi « ${libelleCible(tokens, mots)} » : ${mots.length} mots.`);
		}
		peindre();
		opts.onState(bloc !== null);
	}

	boutons().forEach((btn) => {
		btn.addEventListener('click', () => frapper(Number(btn.dataset.i)));
	});

	root.querySelector('#lsegReset')?.addEventListener('click', () => {
		if (fige) return;
		ancre = null;
		bloc = null;
		peindre();
		annoncer('Sélection effacée. Touche le premier mot du groupe.');
		opts.onState(false);
	});

	/* Pose les marques de bord sur le segment ATTENDU (au verdict) : ses deux extrémités
	   portent la même marque qu'un bloc en construction, sinon le verdict montrerait des
	   mots verts épars là où l'enfant doit voir une frontière (critère 6). */
	function marquerBordAttendu(): void {
		if (!cibleIndices.length) return;
		const debut = cibleIndices[0];
		const fin = cibleIndices[cibleIndices.length - 1];
		jetons().forEach((el) => {
			const i = Number(el.dataset.i);
			if (i < debut || i > fin) return;
			el.classList.add('bloc-attendu');
			el.classList.toggle('bloc-debut', i === debut);
			el.classList.toggle('bloc-fin', i === fin);
		});
	}

	return {
		verify(): boolean {
			if (fige) return resultat;
			fige = true;
			const choisis = motsDuBloc();
			const selection = new Set(choisis);
			const cible = new Set(cibleIndices);
			const juste = selection.size === cible.size && choisis.every((i) => cible.has(i));
			resultat = juste;

			boutons().forEach((btn) => {
				const i = Number(btn.dataset.i);
				btn.disabled = true;
				btn.classList.remove('est-ancre', 'dans-bloc', 'bloc-debut', 'bloc-fin');
				// L'état de bascule n'a plus de sens une fois figé (parité avec bindClicMot).
				btn.removeAttribute('aria-pressed');
				const estCible = cible.has(i);
				const estChoisi = selection.has(i);
				// Les libellés disent l'APPARTENANCE AU BLOC, pas un verdict isolé : « chat,
				// correct » perdrait justement la notion que l'exercice travaille.
				if (estChoisi && estCible) {
					marquerMot(btn, 'lseg', 'correct', `${btn.textContent ?? ''}, dans le groupe, correct`);
				} else if (estChoisi && !estCible) {
					marquerMot(
						btn,
						'lseg',
						'wrong',
						`${btn.textContent ?? ''}, ce mot ne fait pas partie du groupe`,
					);
				} else if (!estChoisi && estCible) {
					// Révélé en place (surlignage doux), sans pastille : c'est une réponse
					// montrée, pas une erreur de l'enfant.
					btn.classList.add('is-cible');
					btn.setAttribute('aria-label', `${btn.textContent ?? ''}, ce mot fait partie du groupe`);
				}
			});
			marquerBordAttendu();

			if (status) {
				const dejaNommee = !!spec.explicationNommeCible && !!explication;
				const attendu = dejaNommee
					? ''
					: ` ${majuscule(cibleLabel ?? 'le bon groupe')} : ${libelleCible(tokens, cibleIndices)}.`;
				// Le diagnostic de bornes AVANT la réponse : une erreur de segment est presque
				// toujours un bord qui a glissé, et c'est ce que le critère 6 demande de dire —
				// « tu ne sais pas si tu as pris un mot de trop ou oublié le déterminant ».
				// Les DEUX intervalles passent par `intervalleDe` : lire `cibleIndices[0]` et
				// `[length - 1]` supposait un tableau trié, et un attendu inversé aurait produit
				// un diagnostic faux en silence. Inatteignable aujourd'hui (la banque est tenue
				// par `cibleContigue`), mais le piège attendait le prochain appelant.
				const attenduIv = intervalleDe(cibleIndices);
				const ecart = juste || !attenduIv ? null : ecartBornes(intervalleDe(choisis), attenduIv);
				status.textContent = juste
					? 'Bravo, bonne réponse.'
					: `Ce n'est pas ça.${ecart ? ` ${ecart}` : ''}${attendu}${explication ? ` ${explication}` : ''}`;
			}
			return juste;
		},
		selected(): number[] {
			return motsDuBloc();
		},
	};
}

/* Tous les indices de `a` à `b`, bornes incluses. */
function intervalle(a: number, b: number): number[] {
	return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}

function majuscule(texte: string): string {
	return `${texte.charAt(0).toUpperCase()}${texte.slice(1)}`;
}
