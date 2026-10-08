/* ============================================================
   Séance partagée (#734) — outils d'écran communs aux LIENS : l'adresse complète
   d'un lien, sa copie, et l'annonce qui la confirme. Partagés par l'écran de fin de
   l'enfant (`partage-seance.ts`), la composition d'un envoi (`encadrant-envois.ts`) et
   la vue de résultat (`partage-resultat.ts`).
   ============================================================ */
import type { RaisonRefus, TypeLien } from '../core/partage/codec';
import { fragmentLien } from '../core/partage/liens';

/** Adresse complète d'un lien : la page courante, sans son fragment, puis le fragment du
 *  lien. Le fragment ne part jamais vers le serveur qui sert la page (critère 28). */
export function urlDuLien(type: TypeLien, code: string): string {
	return location.href.split('#')[0] + fragmentLien(type, code);
}

/** Copie un texte. Le presse-papiers peut être refusé (contexte non sécurisé, navigateur
 *  ancien) : on retombe sur la sélection du champ qui l'affiche, s'il y en a un. `false`
 *  si rien n'a pu être copié : à l'écran de dire comment copier à la main. */
export async function copierTexte(texte: string, champ?: HTMLInputElement): Promise<boolean> {
	if (!texte) return false;
	try {
		await navigator.clipboard.writeText(texte);
		return true;
	} catch {
		if (!champ) return false;
		champ.focus();
		champ.select();
		try {
			return document.execCommand('copy');
		} catch {
			return false;
		}
	}
}

/** Région vivante vidée puis remplie : un texte identique au précédent ne serait pas
 *  réannoncé (même patron que le verdict de la fiche, `ui/session.ts`). */
export function annoncer(region: HTMLElement, texte: string): void {
	region.textContent = '';
	setTimeout(() => {
		region.textContent = texte;
	}, 50);
}

/* Cause d'un refus de décodage, pour un ADULTE (vouvoiement) : repliée sous « Pour
   l'adulte » chez l'enfant, affichée telle quelle à l'encadrant. Le plus souvent, un lien
   coupé par une messagerie. Chaque cause dit quoi faire (convention #657 : un refus
   réversible dit comment réussir), et reste juste des deux côtés du lien. */
const CAUSES: Record<Exclude<RaisonRefus, 'type'>, string> = {
	navigateur:
		'Ce navigateur ne sait pas ouvrir ce lien. Essayez avec un navigateur à jour (Firefox, Chrome, Safari).',
	illisible:
		"Le lien est incomplet ou a été modifié. C'est souvent une messagerie qui l'a coupé : copiez-le en entier, ou demandez un nouveau lien.",
	controle:
		'Le lien a été modifié ou copié en partie : son contenu ne correspond plus. Demandez un nouveau lien.',
	taille: 'Le lien est trop long pour être ouvert. Demandez un nouveau lien.',
	version:
		"Ce lien vient d'une autre version de Ludaskia. Mettez l'application à jour, ou demandez un nouveau lien.",
	schema: "Le contenu du lien n'est pas valide. Demandez un nouveau lien.",
};

/** Cause d'un refus, selon le lien qu'on attendait : un lien de résultat ouvert comme un
 *  exercice (ou l'inverse) se dit autrement selon le côté. */
export function causeRefus(raison: RaisonRefus, attendu: TypeLien): string {
	if (raison !== 'type') return CAUSES[raison];
	return attendu === 'envoi'
		? "Ce lien n'est pas un exercice à faire. C'est peut-être un lien de résultat."
		: "Ce lien n'est pas un résultat : c'est un exercice à donner à l'enfant.";
}
