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

   Import de `vueProgramme` depuis `./seance` : c'est une arête NOUVELLE, et un
   cycle réel — `seance.ts` importe `invitationHTML` en retour, et il existe même
   un chemin à trois nœuds via `sprint.ts`. À ne pas confondre avec le cycle
   `seance ↔ recap-seance` déjà documenté dans `docs/architecture/ui.md`, qui est
   un autre.

   Il est toléré par le critère du dépôt (l'import n'est utilisé QU'À L'INTÉRIEUR
   d'une fonction, jamais au chargement du module), et l'alternative est pire :
   `doitInviter` a besoin de savoir si un programme est actif pour les SIX points
   d'appel, pas seulement pour `seance.ts` — un écran de fin ordinaire doit
   justement ne PAS inviter pendant qu'un programme court. Faire calculer
   `programmeActif` par chaque appelant créerait cinq arêtes vers `seance.ts` au
   lieu d'une. Qualification corrigée après relecture le 2026-09-07.
   ============================================================ */
import { html, type SafeHtml, VIDE } from '../core/html';
import { doitInviter } from '../core/jeux/invitation';
import { etagereNonVide } from '../core/jeux/etat';
import { etagereJeuxActive, invitationJeuxActive } from '../core/profiles';
import { vueProgramme } from './seance';
import { openEtagere } from './jeux-etagere';

/** Le bloc d'invitation, ou rien. `ou` dit d'où on appelle : la fin du
    programme du jour, ou un écran de fin ordinaire. */
export function invitationHTML(ou: 'programme' | 'ecran'): SafeHtml {
	const afficher = doitInviter({
		etagereActive: etagereJeuxActive(),
		invitationActive: invitationJeuxActive(),
		etagereNonVide: etagereNonVide(),
		programmeActif: vueProgramme() !== null,
		ou,
	});
	if (!afficher) return VIDE;
	/* AUCUNE félicitation ici, et c'est le point délicat de tout ce fichier.
	   La version initiale disait « Beau travail ! Tes jeux t'attendent, si tu
	   veux. » — sans un seul mot interdit par le critère 28, et pourtant fautive :
	   accoler un compliment sur l'effort fourni et une offre de jeu, dans cet
	   ordre et au même endroit, installe la même cadence causale que « pour
	   débloquer ». À huit ans on ne lit pas deux phrases collées comme deux idées
	   indépendantes, et le « si tu veux » n'y change rien — la contrepartie vient
	   de la POSITION, pas du vocabulaire. Relevé par `redacteur-contenu-francais`
	   le 2026-09-07. Le travail est déjà félicité juste au-dessus par l'écran de
	   fin lui-même ; le redire ici ne servait qu'à payer l'enfant. */
	return html`<div class="jeu-invitation">
		<p class="jeu-invitation-txt">Tes jeux t'attendent, si tu veux.</p>
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
