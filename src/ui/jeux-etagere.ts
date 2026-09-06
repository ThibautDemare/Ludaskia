/* ============================================================
   Étagère de jeux (#661) — l'ENTRÉE et la MODALE de l'étagère.

   L'entrée est permanente et INCONDITIONNELLE (critère 1) : elle ne demande
   pas d'avoir travaillé aujourd'hui, elle ne se grise pas, elle n'annonce
   aucun prix. C'est ce qui distingue le dispositif d'un péage — travailler
   n'achète pas du temps de jeu, il ouvre de NOUVEAUX jeux.

   Elle reste toutefois masquée dans deux cas, et ce n'est pas une condition
   déguisée : tant qu'aucun palier n'a été franchi il n'y a rien à ouvrir
   (critère 27), et si l'encadrant a coupé l'accès il n'y a rien à proposer.

   Trois choix de rendu qui ont chacun leur précédent dans le dépôt :
   - facture `.reward-btn`, comme les deux boutons voisins (critère 40) —
     l'étagère étant une modale, le contrat d'interaction est identique ; une
     flèche annoncerait un départ qui n'a pas lieu ;
   - AUCUN compteur `N/M` (critère 41), sur le modèle de `renderEggAlbumNav`,
     qui a déjà tranché la même question pour l'album de surprises ;
   - AUCUN badge « nouveau » (critère 42) : l'écran de choix EST la
     célébration, un badge la dupliquerait en relance permanente.
   ============================================================ */
import { html, type SafeHtml, VIDE, joindre } from '../core/html';
import { activateModal } from './modal-a11y';
import { etagereJeuxActive, getJeuxPlafondMinutes } from '../core/profiles';
import { jeuParId } from '../core/jeux/catalogue';
import { jeuxPossedes, secondesRestantes } from '../core/jeux/etat';

/** L'étagère est-elle montrable ? Masquée avant le premier palier (critère 27)
    et quand l'encadrant a coupé l'accès. */
export function etagereVisible(): boolean {
	return etagereJeuxActive() && jeuxPossedes().length > 0;
}

/** Le bouton d'accès sur l'accueil. Vide quand il n'y a rien à ouvrir. */
export function renderJeuxNav(): void {
	const el = document.getElementById('jeuxNav');
	if (!el) return;
	el.innerHTML = (
		etagereVisible()
			? html`<button class="reward-btn jeux-btn" id="btnJeux" data-act="open-jeux">
					🧩 Mes jeux
				</button>`
			: VIDE
	).balisage;
}

function jeuItemHTML(id: string): SafeHtml {
	const jeu = jeuParId(id);
	if (!jeu) return VIDE;
	/* `data-jeu` : sélecteur stable pour les specs e2e. Et surtout, RIEN ici ne
	   nomme la compétence (critère 3) — l'étagère est un rayon de jeux, pas un
	   sommaire de matières. */
	return html`<button type="button" class="jeu-item" data-jeu="${jeu.id}">
		<span class="jeu-item-ico" aria-hidden="true">${jeu.icone}</span>
		<span class="jeu-item-titre">${jeu.label}</span>
	</button>`;
}

/* Message de plafond atteint. Registre `--warn`, jamais `--ko` (critère 44) :
   avoir joué son temps n'est pas une faute. Et surtout pas de compte à rebours
   (critère 12) — on ne dit combien il reste ni avant, ni pendant, seulement que
   c'est fini pour aujourd'hui. */
function plafondHTML(): SafeHtml {
	return secondesRestantes(getJeuxPlafondMinutes()) > 0
		? VIDE
		: html`<p class="jeux-plafond" role="status">
				Tu as bien joué aujourd'hui. On se retrouve demain !
			</p>`;
}

function etagereContenuHTML(): SafeHtml {
	const jeux = joindre(jeuxPossedes().map(jeuItemHTML));
	return html`${plafondHTML()}
		<div class="jeux-liste" id="jeuxListe">${jeux}</div>`;
}

/* Même garde que les vitrines Récompenses / Trophées : une seule modale de
   cette famille ouverte à la fois, donc un seul `release` (#235). */
let etagereRelease: (() => void) | null = null;

export function openEtagere(): void {
	const contenu = document.getElementById('jeuxEtagereContent');
	if (contenu) contenu.innerHTML = etagereContenuHTML().balisage;
	const ov = document.getElementById('jeuxEtagere');
	if (!ov) return;
	ov.style.display = '';
	etagereRelease?.();
	etagereRelease = activateModal(ov, {
		onEscape: hideEtagere,
		initialFocus: document.getElementById('jeuxEtagereOk'),
	});
	ov.addEventListener('click', surClicJeu);
}

export function hideEtagere(): void {
	etagereRelease?.();
	etagereRelease = null;
	const ov = document.getElementById('jeuxEtagere');
	if (!ov) return;
	ov.removeEventListener('click', surClicJeu);
	ov.style.display = 'none';
}

/* Lancer un jeu ferme l'étagère et passe par la ROUTE, pas par un appel direct
   au runner : c'est ce qui rend le retour arrière du navigateur cohérent, et
   ce qui permet à `quitterJeu` de rouvrir l'étagère derrière lui (critère 44).
   Le plafond épuisé ne grise rien : la route refuse d'ouvrir et rend la main,
   pendant que la modale explique en une phrase pourquoi. */
function surClicJeu(e: MouseEvent): void {
	const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('.jeu-item');
	const id = btn?.dataset.jeu;
	if (!id) return;
	hideEtagere();
	location.hash = `jeu-${id}`;
}

/** Le plafond du jour est-il épuisé ? Sert au lancement d'une partie. */
export function plafondAtteint(): boolean {
	return secondesRestantes(getJeuxPlafondMinutes()) <= 0;
}
