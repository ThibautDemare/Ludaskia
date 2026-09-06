/* ============================================================
   Étagère de jeux (#661) — l'ÉCRAN DE CHOIX d'un palier franchi (critères 4 à 9).

   Trois propositions, et l'enfant en garde une. Ce n'est pas un tirage qu'on
   subit : le choix est ce qui transforme un déblocage en décision, et les deux
   jeux écartés RESTENT dans le vivier — l'écran le dit explicitement, sans quoi
   l'enfant croit perdre définitivement ce qu'il n'a pas pris (critère 6).

   Deux règles de séquence qui se voient peu et cassent vite :
   - un palier dont le vivier est VIDE n'est pas consommé (critère 9), sinon il
     serait perdu pour toujours alors qu'un changement de classe le rendrait
     jouable ;
   - plusieurs paliers franchis hors de l'app se présentent l'un APRÈS l'autre
     (critère 7), jamais empilés à l'écran.

   L'écran n'a ni croix ni bouton « Fermer » : choisir est la seule sortie. Un
   moyen de repousser ferait de ce cadeau une tâche de plus.
   ============================================================ */
import { html, type SafeHtml, joindre } from '../core/html';
import { randFloat } from '../core/utils';
import { activateModal } from './modal-a11y';
import { niveauActif } from '../core/niveau-actif';
import { JEUX, type JeuDef } from '../core/jeux/catalogue';
import { PALIERS } from '../core/jeux/paliers';
import { proposerJeux } from '../core/jeux/tirage';
import { ajouterJeu, consommerPalier, jeuxPossedes, paliersEnAttente } from '../core/jeux/etat';
import { renderJeuxNav } from './jeux-etagere';

let choixRelease: (() => void) | null = null;

function propositionHTML(jeu: JeuDef): SafeHtml {
	/* Rien ne nomme la compétence (critère 3) : l'enfant choisit un jeu, pas une
	   matière. `data-jeu` est le sélecteur stable des specs e2e. */
	return html`<button type="button" class="jeu-choix-item" data-jeu="${jeu.id}">
		<span class="jeu-choix-ico" aria-hidden="true">${jeu.icone}</span>
		<span class="jeu-choix-titre">${jeu.label}</span>
	</button>`;
}

function choixContenuHTML(propositions: JeuDef[]): SafeHtml {
	/* La phrase qui tient le critère 6. Elle dit ce qui arrive aux deux autres,
	   au présent et sans condition : « tu pourras les avoir plus tard » se lirait
	   comme une promesse à mériter. */
	return html`<p class="jeu-choix-consigne">Choisis celui que tu veux garder.</p>
		<div class="jeu-choix-liste">${joindre(propositions.map(propositionHTML))}</div>
		<p class="jeu-choix-rassure">Les autres restent dans la réserve : tu pourras les choisir à un
			prochain niveau.</p>`;
}

function fermer(): void {
	choixRelease?.();
	choixRelease = null;
	const ov = document.getElementById('jeuxChoix');
	if (!ov) return;
	ov.removeEventListener('click', surClic);
	ov.style.display = 'none';
}

function choisir(id: string): void {
	ajouterJeu(id);
	fermer();
	renderJeuxNav(); // l'entrée peut apparaître pour la première fois (critère 27)
	// Palier suivant s'il y en a un : l'un APRÈS l'autre (critère 7).
	ouvrirProchainChoix();
}

/** Ouvre l'écran de choix du prochain palier en attente, s'il y en a un.

    Ne fait rien — et surtout ne CONSOMME rien — quand le vivier ne rend aucune
    proposition : le palier doit rester en attente pour se redéclencher quand la
    classe du profil change et rouvre des jeux (critère 9). */
export function ouvrirProchainChoix(): void {
	const rang = paliersEnAttente()[0];
	if (rang === undefined) return;
	const palier = PALIERS.find((p) => p.rang === rang);
	if (!palier) {
		consommerPalier(); // rang inconnu (donnée importée d'une version future) : on purge
		ouvrirProchainChoix();
		return;
	}
	const propositions = proposerJeux({
		palier,
		vivier: JEUX,
		niveau: niveauActif(),
		dejaChoisis: jeuxPossedes(),
		r: randFloat,
	});
	if (!propositions.length) return; // palier gardé en attente, pas consommé

	consommerPalier();
	const contenu = document.getElementById('jeuxChoixContent');
	if (contenu) contenu.innerHTML = choixContenuHTML(propositions).balisage;
	const ov = document.getElementById('jeuxChoix');
	if (!ov) return;
	ov.style.display = '';
	choixRelease?.();
	/* Pas de `onEscape` : Échap ne ferme pas cet écran, parce qu'il n'y a rien à
	   fermer sans choisir. C'est le seul endroit de l'app où on le refuse
	   volontairement — `activateModal` le permet en ne passant pas l'option. */
	choixRelease = activateModal(ov, {
		initialFocus: ov.querySelector<HTMLElement>('.jeu-choix-item'),
	});
	/* Délégation posée à l'ouverture et retirée à la fermeture, PAS un
	   `{ once: true }` : un clic à côté d'une proposition (le texte de la
	   consigne, la marge) consommerait l'écouteur et laisserait l'enfant devant
	   un écran mort dont rien ne permet de sortir. */
	ov.addEventListener('click', surClic);
}

function surClic(e: MouseEvent): void {
	const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('.jeu-choix-item');
	const id = btn?.dataset.jeu;
	if (id) choisir(id);
}
