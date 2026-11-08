/* ============================================================
   Garde « double appui » du deuxième essai (dictée, mot caché).

   Au premier essai raté, la saisie RESTE dans le champ pour que l'enfant la corrige :
   une faute de frappe sur tablette ne doit pas lui coûter le mot entier. Revers : un
   double appui sur « Vérifier », ou une double Entrée, renverrait la même réponse fausse
   et brûlerait le deuxième essai. Le champ vidé neutralisait ce geste jusque-là, par le
   garde-fou des réponses vides (`ignorerReponseVide`, #640).

   On ignore donc la même réponse revalidée, mais UNE seule fois et seulement dans la
   seconde qui suit l'essai compté. Au-delà, ou dès la deuxième revalidation, l'enfant
   maintient sa réponse : il doit alors arriver à la correction guidée. Ignorer sans
   limite le ferait tourner sur « Presque ! » tant qu'il n'a pas changé une lettre.
   « Même réponse » s'entend après `normalizeText`, la normalisation de la correction
   elle-même : ce qui serait corrigé pareil est la même réponse.
   ============================================================ */
import { normalizeText } from '../utils';

/** Fenêtre (ms) dans laquelle une même réponse revalidée passe pour un double appui. Au-dessus
    du double tap Android (300 ms) et du démarrage de la répétition clavier (~500 ms). */
export const DELAI_DOUBLE_APPUI_MS = 1000;

/** Garde d'UN mot affiché. Reçoit chaque réponse FAUSSE avant qu'elle soit comptée, et rend
    `true` si c'est le double appui à ignorer (non compté) ; sinon la réponse est comptée et
    devient la référence. `maintenant` : horloge en ms, injectable pour les tests. */
export function creerGardeDoubleAppui(
	maintenant: () => number = () => performance.now(),
): (saisie: string) => boolean {
	let reference: string | null = null; // dernière réponse comptée ; `null` une fois le doublon consommé
	let compteeA = 0;
	return (saisie) => {
		const forme = normalizeText(saisie);
		const instant = maintenant();
		if (forme === reference && instant - compteeA < DELAI_DOUBLE_APPUI_MS) {
			reference = null; // une seule fois : la prochaine revalidation sera comptée
			return true;
		}
		reference = forme;
		compteeA = instant;
		return false;
	};
}
