/* ============================================================
   Séance partagée (#734) — le PASSAGE d'un envoi par l'enfant.

   Logique pure et persistance du premier passage : ce que l'écran rend (les items
   d'un envoi), ce qu'il note (un statut par item), ce qu'il fige (le premier
   passage terminé, une seule fois par couple envoi × profil).
   ============================================================ */
import { dispositionPosee, type Item } from '../items';
import { getLessonById, itemDepuisExercice, type LessonDef, type SchoolLevel } from '../catalog';
import {
	consignePourNiveau,
	defaultMode,
	seJoueEnRunner,
	type Exercise,
	type ExerciseMode,
} from '../exercise';
import { labelLecon } from '../levels';
import { attendueItem, libelleChoix, questionPourJournal } from '../erreur-representation';
import { addXP, recordActivitePartage } from '../progress';
import { lsGet, lsSet } from '../storage';
import type { Envoi } from './envoi';
import { figerResultat, type Capture, type ItemCapture } from './capture';
import { schemaResultatGarde, type Resultat, type StatutReponse } from './resultat';
import { pseudo as schemaPseudo } from './textes';

/** Mode d'une séance partagée : état de session de l'écran, et mode des erreurs qu'elle
 *  journalise (l'encadrant lit « séance partagée » à côté de l'erreur). */
export const MODE_PARTAGE = 'partage';

/** XP de participation d'un premier passage terminé, quel que soit le score (critère 23). */
export const XP_PARTICIPATION = 5;

/** Part d'items répondus (juste, faux ou « je ne sais pas ») qui termine un passage :
 *  la même que celle qui fait compter une fiche ordinaire. */
export const SEUIL_REPONDUS = 0.6;

/** Premiers passages du profil actif, par identifiant d'envoi. */
export const PARTAGES_RECUS_KEY = 'ludaskia_partagesRecus';

/** Nombre de premiers passages gardés par profil : au-delà, le plus ancien (par date)
 *  est oublié, et son lien rouvert redevient un premier passage (+5 XP compris). Un
 *  passage garde tous ses énoncés : un bilan complet pèse plusieurs dizaines de Ko, dans
 *  un `localStorage` d'environ 5 Mo partagé avec tout le reste du profil. */
export const MAX_PASSAGES_GARDES = 30;

/** Un item prêt à rendre, et ce que le résultat en dira. */
export interface ItemPassage {
	item: Item;
	capture: ItemCapture;
}

/** Une leçon de l'envoi, telle que l'écran la présente. */
export interface BlocPassage {
	lecon: LessonDef;
	/** Libellé de la leçon au niveau de l'envoi. */
	titre: string;
	/** Consigne de la fiche, au niveau de l'envoi. */
	consigne: string;
	items: ItemPassage[];
}

/** Pourquoi un envoi bien formé ne se joue pas ici :
 *  - `lecon` : une leçon de l'envoi n'existe pas dans cette version du catalogue ;
 *  - `format` : l'envoi ne se joue pas en fiche (dictée, runner une-question-à-la-fois). */
export type RaisonInjouable = 'lecon' | 'format';

export type Passage =
	{ ok: true; envoi: Envoi; blocs: BlocPassage[] } | { ok: false; raison: RaisonInjouable };

/** Ce que la correction d'un champ a donné. `pos` : rang du chiffre dans le résultat
 *  d'une opération posée, dont chaque chiffre est un champ. */
export interface ChampCorrige {
	saisie: string;
	correct: boolean;
	pos?: number;
}

/* ---------- Préparer : de l'envoi aux items de la fiche ---------- */

/** Prépare le passage d'un envoi : un bloc par leçon, un item par exercice, dans l'ordre
 *  de l'envoi. N'écrit rien : préparer (puis abandonner) ne consomme pas le premier
 *  passage (critère 16). Le niveau du titre, de la consigne et des items est celui de
 *  l'ENVOI, jamais celui du profil actif (critère 2). */
export function preparerPassage(envoi: Envoi): Passage {
	if (envoi.nature === 'dictee') return { ok: false, raison: 'format' };
	const blocs: BlocPassage[] = [];
	for (const bloc of envoi.blocs) {
		// L'id relu sur la leçon trouvée : un id comme `constructor` ne doit pas passer pour
		// une leçon en tombant sur un prototype.
		const lecon = getLessonById(bloc.lecon);
		if (!lecon || lecon.id !== bloc.lecon) return { ok: false, raison: 'lecon' };
		// Une leçon se joue comme en jeu libre : un mode à runner dédié n'est pas une fiche.
		// Mode absent = mode par défaut de la leçon, comme `runLecon`. Un bilan, lui, replie
		// tout format en fiche (`itemDepuisExercice`), comme le bilan ordinaire.
		if (envoi.nature === 'lecon') {
			const mode = bloc.mode ?? defaultMode(lecon.exerciseType);
			if (bloc.exercices.some((ex) => seJoueEnRunner(ex.type, mode)))
				return { ok: false, raison: 'format' };
		}
		blocs.push({
			lecon,
			titre: labelLecon(lecon, envoi.niveau),
			consigne: consigneFiche(lecon, envoi.niveau),
			items: bloc.exercices.map((ex) => itemPassage(lecon, ex, bloc.mode)),
		});
	}
	return { ok: true, envoi, blocs };
}

/* Même consigne que la fiche ordinaire (`buildLessonFiche`). */
function consigneFiche(lecon: LessonDef, niveau: SchoolLevel): string {
	return (
		consignePourNiveau(lecon.exerciseType, niveau) ??
		(lecon.subject === 'math' ? 'Complète.' : 'Écris la forme correcte.')
	);
}

function itemPassage(lecon: LessonDef, ex: Exercise, mode: ExerciseMode | undefined): ItemPassage {
	const item = itemDepuisExercice(lecon, ex);
	const capture: ItemCapture = {
		lecon: lecon.id,
		enonce: enonceLisible(item),
		attendue: item.choices?.length
			? libelleChoix(item.choices, item.choicesView, String(item.answer))
			: attendueItem(item),
	};
	if (mode !== undefined) capture.mode = mode;
	return { item, capture };
}

/* L'énoncé tel que l'encadrant le lira : la forme du journal d'erreurs (`@` → « … »,
   dessin signalé), et l'opération elle-même pour une opération posée, dont l'item n'a
   pas de texte. */
function enonceLisible(item: Item): string {
	if (item.kind === 'posed' && item.posed) return dispositionPosee(item.posed).operation;
	return questionPourJournal(item.text, !!item.figure?.balisage);
}

/* ---------- Noter : le statut d'un item ---------- */

/** Statut d'un item à partir de ses champs corrigés. « Je ne sais pas » l'emporte sur ce
 *  que contiennent les champs ; une opération posée n'est juste que si TOUS ses chiffres
 *  le sont, et sa saisie se lit dans l'ordre des chiffres. */
export function statutItem(
	champs: readonly ChampCorrige[],
	jnsp: boolean,
): { statut: StatutReponse; saisie: string } {
	if (jnsp) return { statut: 'jnsp', saisie: '' };
	if (champs.every((c) => c.saisie === '')) return { statut: 'vide', saisie: '' };
	if (champs.length === 1) {
		const [c] = champs;
		return { statut: c.correct ? 'juste' : 'faux', saisie: c.saisie };
	}
	const tries = [...champs].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
	const incomplet = tries.some((c) => c.saisie === '');
	return {
		statut: tries.every((c) => c.correct) ? 'juste' : 'faux',
		saisie: incomplet ? '(incomplet)' : tries.map((c) => c.saisie).join(''),
	};
}

/** Le passage est-il terminé ? Même seuil que l'enregistrement d'une fiche ordinaire,
 *  compté en items. « Je ne sais pas » est une réponse (avis specialiste-troubles-
 *  apprentissage) : c'est l'information la plus utile à l'adulte, et l'enfant honnête
 *  ne doit pas rester bloqué sous le seuil. */
export function passageTermine(statuts: readonly StatutReponse[]): boolean {
	if (statuts.length === 0) return false;
	const repondus = statuts.filter((s) => s !== 'vide').length;
	return repondus >= statuts.length * SEUIL_REPONDUS;
}

/* ---------- Le premier passage, gardé par le profil ---------- */

/* Lecture défensive : le stockage peut venir d'un import de sauvegarde. Chaque entrée
   repasse par le schéma, et une `Map` évite qu'un identifiant comme `__proto__` ou
   `constructor` ne touche un prototype. Une entrée illisible est oubliée, sans lever. */
function chargerPassages(): Map<string, Resultat> {
	const brut: unknown = lsGet(PARTAGES_RECUS_KEY, {});
	const passages = new Map<string, Resultat>();
	if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return passages;
	for (const [id, valeur] of Object.entries(brut)) {
		try {
			const r = schemaResultatGarde.lire(valeur, id);
			if (r.envoi.id === id) passages.set(id, r);
		} catch {
			// entrée corrompue : oubliée
		}
	}
	return passages;
}

/* Écrit les passages, les plus récents d'abord, au plus `MAX_PASSAGES_GARDES`. */
function enregistrerPassages(passages: Map<string, Resultat>): void {
	const gardes = [...passages.values()]
		.sort((a, b) => b.date - a.date)
		.slice(0, MAX_PASSAGES_GARDES);
	lsSet(
		PARTAGES_RECUS_KEY,
		Object.fromEntries(gardes.map((r) => [r.envoi.id, schemaResultatGarde.ecrire(r)])),
	);
}

/** Le premier passage de cet envoi sur le profil actif, ou `null`. */
export function premierPassage(envoiId: string): Resultat | null {
	return chargerPassages().get(envoiId) ?? null;
}

/** Fige le PREMIER passage terminé de cet envoi sur le profil actif : le résultat est
 *  gardé, `XP_PARTICIPATION` XP et une entrée d'activité « séance partagée » sont
 *  crédités (critères 23 et 24). Rien d'autre ne bouge (critère 26) : ni étoile, ni
 *  record, ni statistique de leçon, ni série, ni objectif, ni trophée, ni révision.
 *  Un passage déjà figé est rendu tel quel : la capture rejouée est ignorée et rien
 *  n'est recrédité (critère 15). Le journal d'erreurs, lui, est écrit par l'écran au
 *  moment de la correction, comme dans tous les runners. */
export function terminerPremierPassage(
	envoi: Envoi,
	capture: Capture,
	{ pseudo, date, id }: { pseudo: string; date: number; id: string },
): Resultat {
	const passages = chargerPassages();
	const deja = passages.get(envoi.id);
	if (deja) return deja;
	const resultat = figerResultat(capture, { envoi, pseudo, date, id });
	passages.set(envoi.id, resultat);
	enregistrerPassages(passages);
	// Écriture refusée (quota) : `lsSet` ne lève pas. Créditer quand même rendrait les +5 XP
	// à chaque réouverture du lien, le passage n'étant jamais retrouvé.
	if (!chargerPassages().has(envoi.id)) return resultat;
	addXP(XP_PARTICIPATION);
	recordActivitePartage(date);
	return resultat;
}

/** Change le pseudo du premier passage gardé (id, date et réponses inchangés). `null`
 *  sans rien changer si ce passage n'existe pas ou si le pseudo est refusé. */
export function changerPseudo(envoiId: string, pseudo: string): Resultat | null {
	if (!pseudoValide(pseudo)) return null;
	const passages = chargerPassages();
	const r = passages.get(envoiId);
	if (!r) return null;
	const modifie: Resultat = { ...r, pseudo };
	passages.set(envoiId, modifie);
	enregistrerPassages(passages);
	return modifie;
}

/** Le pseudo passe-t-il la liste blanche du lien (critère 39) ? Même décision que le
 *  décodage : c'est le même schéma. */
export function pseudoValide(s: string): boolean {
	try {
		schemaPseudo.lire(s, 'pseudo');
		return true;
	} catch {
		return false;
	}
}

/** Apostrophe typographique ramenée à l'apostrophe droite, la seule de la liste blanche :
 *  les claviers mobiles (ponctuation « intelligente ») tapent la première. */
export function normaliserPseudo(s: string): string {
	return s.trim().replace(/’/g, "'");
}

/** Pseudo prérempli à la fin (critère 13) : le prénom du profil s'il passe la liste
 *  blanche, sinon rien, et l'enfant l'écrit. */
export function pseudoParDefaut(nomProfil: string): string {
	const nom = normaliserPseudo(nomProfil);
	return pseudoValide(nom) ? nom : '';
}
