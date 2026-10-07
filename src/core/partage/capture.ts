/* ============================================================
   Séance partagée (#734) — CAPTURE item par item pendant le passage.

   Le journal d'erreurs ne garde que les erreurs ; le résultat, lui, doit dire ce
   qui s'est passé sur CHAQUE item (critère 14). Le runner déclare les items au
   démarrage — énoncé et attendu lisibles —, puis note chaque réponse au moment de
   la correction. Un item jamais noté ressort `vide` : l'enfant l'a laissé, et
   l'encadrant doit le voir plutôt que de trouver un trou dans la liste.

   La PREMIÈRE réponse notée fait foi : une correction rejouée, un second clic sur
   « Vérifier » ou une reprise ne réécrivent pas ce que l'enfant a d'abord répondu.
   ============================================================ */
import type { ExerciseMode } from '../exercise';
import type { Envoi } from './envoi';
import {
	LONGUEUR_MAX_ENONCE,
	LONGUEUR_MAX_REPONSE,
	type ReponseItem,
	type Resultat,
	type StatutReponse,
} from './resultat';
import { borner } from './textes';

/** Ce que le runner sait d'un item avant que l'enfant y réponde. */
export interface ItemCapture {
	lecon: string;
	mode?: ExerciseMode;
	enonce: string;
	attendue: string;
}

/** Une réponse notée par le runner. `attendue` : cf. `noterReponse`. */
export interface ReponseNotee {
	statut: StatutReponse;
	saisie: string;
	attendue?: string;
}

export interface Capture {
	readonly items: readonly ItemCapture[];
	/** Réponses notées, par index d'item. */
	readonly reponses: ReadonlyMap<number, ReponseNotee>;
}

export function nouvelleCapture(items: ItemCapture[]): Capture {
	return { items: items.map((it) => ({ ...it })), reponses: new Map<number, ReponseNotee>() };
}

/** Note la réponse de l'item `index`. Rend `false` sans rien changer si l'index est
 *  hors de la capture ou si l'item a déjà une réponse (la première fait foi).
 *  `attendue` remplace l'attendu déclaré quand il dépend de la réponse (un tri où
 *  seuls les mots mal rangés comptent, par exemple). */
export function noterReponse(capture: Capture, index: number, reponse: ReponseNotee): boolean {
	const horsCapture = !Number.isInteger(index) || index < 0 || index >= capture.items.length;
	if (horsCapture || capture.reponses.has(index)) return false;
	// La `Map` est créée par `nouvelleCapture` : en lecture seule pour les appelants, que
	// cette fonction seule fait évoluer.
	(capture.reponses as Map<number, ReponseNotee>).set(index, { ...reponse });
	return true;
}

/** Fige le résultat du passage. Un item jamais noté ressort `vide`, saisie vide.
 *  `id` : identifiant aléatoire du résultat (cf. `nouvelIdentifiant`).
 *
 *  La saisie n'est gardée que pour une réponse DONNÉE (juste ou fausse) : « je ne sais
 *  pas » et « sans réponse » ressortent toujours sans saisie, quoi qu'en dise le runner —
 *  l'encadrant ne doit pas lire un brouillon abandonné comme une réponse.
 *
 *  Les textes sont ramenés dans les plafonds du lien (`borner`) : un énoncé très long ou
 *  une saisie collée ne doivent pas rendre illisible le résultat d'une séance finie. Le
 *  pseudo, lui, n'est PAS corrigé ici — c'est l'écran de fin qui le valide pendant la
 *  saisie, quand l'enfant peut encore le changer. */
export function figerResultat(
	capture: Capture,
	{ envoi, pseudo, date, id }: { envoi: Envoi; pseudo: string; date: number; id: string },
): Resultat {
	const reponses = capture.items.map((item, i): ReponseItem => {
		const notee = capture.reponses.get(i);
		const statut = notee?.statut ?? 'vide';
		const saisie = notee && (statut === 'juste' || statut === 'faux') ? notee.saisie : '';
		const r: ReponseItem = {
			lecon: item.lecon,
			enonce: borner(item.enonce, LONGUEUR_MAX_ENONCE),
			saisie: borner(saisie, LONGUEUR_MAX_REPONSE),
			attendue: borner(notee?.attendue ?? item.attendue, LONGUEUR_MAX_REPONSE),
			statut,
		};
		if (item.mode !== undefined) r.mode = item.mode;
		return r;
	});
	// On ne recopie de l'envoi que ce qui titre la vue : ni ses blocs, ni ses exercices.
	const rappel: Resultat['envoi'] = { id: envoi.id, libelle: envoi.libelle };
	if (envoi.niveau !== undefined) rappel.niveau = envoi.niveau;
	return { id, envoi: rappel, pseudo, date, reponses };
}
