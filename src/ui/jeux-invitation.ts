/* ============================================================
   Étagère de jeux (#661) — l'INVITATION de fin de séance (critère 2, révisé le
   2026-09-06 : commentaire daté sur l'issue, sections 4 et 5).

   Une invitation, pas une récompense annoncée. Elle arrive APRÈS coup, sur un
   écran de fin, et elle ne conditionne rien : l'entrée de l'étagère est déjà
   permanente sur l'accueil. C'est cette asymétrie qui empêche le dispositif de
   redevenir un péage — et c'est pourquoi aucune formulation ici ne doit
   contenir « pour débloquer », « il te reste » ou « tu dois d'abord »
   (critère 28).

   Le placement est la partie subtile : un programme du jour DÉPLACE
   l'invitation vers sa fin, il ne l'ajoute pas. Sans ça, un enfant qui
   enchaîne trois étapes serait invité trois fois, et la proposition
   deviendrait une relance. La règle elle-même est pure et testée dans
   `core/jeux/invitation.ts` ; ici, on ne fait que lui fournir le contexte.

   Import de `vueProgramme` depuis `./seance` : même arête que
   `recap-seance.ts`, qui la lit déjà pour la même raison (la vue du programme
   ne se construit que là, elle a besoin du contexte « à revoir »).
   ============================================================ */
import { html, type SafeHtml, VIDE } from '../core/html';
import { doitInviter } from '../core/jeux/invitation';
import { jeuxPossedes } from '../core/jeux/etat';
import { etagereJeuxActive, invitationJeuxActive } from '../core/profiles';
import { vueProgramme } from './seance';
import { openEtagere } from './jeux-etagere';

/** Le bloc d'invitation, ou rien. `ou` dit d'où on appelle : la fin du
    programme du jour, ou un écran de fin ordinaire. */
export function invitationHTML(ou: 'programme' | 'ecran'): SafeHtml {
	const afficher = doitInviter({
		etagereActive: etagereJeuxActive(),
		invitationActive: invitationJeuxActive(),
		aUnJeu: jeuxPossedes().length > 0,
		programmeActif: vueProgramme() !== null,
		ou,
	});
	if (!afficher) return VIDE;
	/* Formulation au passé et sans contrepartie : on constate le travail fait,
	   on propose, on n'échange pas. « si tu veux » porte tout le reste. */
	return html`<div class="jeu-invitation">
		<p class="jeu-invitation-txt">Beau travail ! Tes jeux t'attendent, si tu veux.</p>
		<button type="button" class="btn-primary jeu-invitation-btn" data-act="open-jeux">
			🧩 Voir mes jeux
		</button>
	</div>`;
}

/* Un seul écouteur délégué pour toute l'app : l'invitation apparaît dans cinq
   écrans de fin différents, et le bouton de l'accueil porte le même `data-act`.
   Poser la délégation sur `document` évite de la recâbler dans chacun — et
   surtout d'en oublier un. */
let branche = false;

export function bindInvitationJeux(): void {
	if (branche) return;
	branche = true;
	document.addEventListener('click', (e) => {
		const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-act="open-jeux"]');
		if (btn) openEtagere();
	});
}
