/* ============================================================
   Mode Orthographe — avancement d'une leçon (liste OU prédéfinie).
   ------------------------------------------------------------
   Traduit l'état par-mot du modèle orthographe (atelier fait + modes validés)
   en un état d'acquisition PAR LISTE, sur la même échelle que les leçons du
   catalogue (NiveauNotion), pour l'espace encadrant (#234) et la carte « à revoir ».

   Lecture SEULE et SYNCHRONE : on n'appelle pas materialiserVerbes (async, LEFFF).
   Les mots ATTENDUS d'une leçon sont énumérés directement :
   - mots simples : ids de la liste (parent) ou lookup par forme (prédéfinie) ;
   - cibles verbe (#261) : id DÉTERMINISTE (cibleVerbeId) — calculable sans LEFFF.
   Un mot attendu absent de la banque (jamais matérialisé/joué) compte « nouveau ».

   Échelle à 3 niveaux (pas de « à renforcer » : la validation d'un mode est binaire,
   il n'y a pas de « perf récente en % » comme pour les QCM) :
   - à découvrir : aucun mot commencé ;
   - acquis : tous les mots maîtrisés (= liste étoilée) ;
   - en cours : entre les deux.
   ============================================================ */
import { ORTHO_PREDEF } from '../../data/francais/orthographe';
import { getListe, formeNormalisee } from './store';
import { statutMot, type StatutMot } from './runner';
import { cibleVerbeId } from './verbes';
import type { MotOrtho, OrthoState } from './types';
import type { NiveauNotion } from '../maitrise';

/** Statut d'un mot attendu : son statut s'il est en banque, sinon « nouveau ». */
function statutAttendu(mot: MotOrtho | undefined, dicteeDispo: boolean): StatutMot {
	return mot ? statutMot(mot, dicteeDispo) : 'nouveau';
}

/** Statuts des mots ATTENDUS d'une leçon d'orthographe (liste du profil OU prédéfinie),
    en lecture seule : mots simples + cibles verbe. `[]` si l'id est inconnu. */
export function statutsLecon(state: OrthoState, id: string, dicteeDispo: boolean): StatutMot[] {
	const liste = getListe(state, id);
	if (liste) {
		const simples = liste.motIds.map((mid) => statutAttendu(state.banque[mid], dicteeDispo));
		const verbes: StatutMot[] = [];
		for (const v of liste.verbes ?? []) {
			for (const temps of v.temps) {
				for (const person of v.pronoms) {
					const cible = state.banque[cibleVerbeId(v.infinitif, temps, person)];
					verbes.push(statutAttendu(cible, dicteeDispo));
				}
			}
		}
		return [...simples, ...verbes];
	}
	const predef = ORTHO_PREDEF.find((l) => l.id === id);
	if (predef) {
		return predef.mots.map((mi) => {
			const motId = state.motIdParForme[formeNormalisee(mi.mot)];
			return statutAttendu(motId ? state.banque[motId] : undefined, dicteeDispo);
		});
	}
	return [];
}

/** Avancement d'une leçon d'orthographe : état sur l'échelle NiveauNotion (3 valeurs
    utilisées : 'a-decouvrir' | 'en-cours' | 'acquis' ; jamais 'non-acquis') + compte
    factuel « maîtrisés / total » — l'UI accole ce compte à « en cours » pour restituer
    la nuance perdue faute de « à renforcer » (avis pédago), sans jamais afficher de %. */
export interface AvancementListe {
	niveau: NiveauNotion;
	total: number; // mots attendus de la liste
	maitrises: number; // mots déjà maîtrisés
}
export function avancementLecon(
	state: OrthoState,
	id: string,
	dicteeDispo: boolean,
): AvancementListe {
	const statuts = statutsLecon(state, id, dicteeDispo);
	const maitrises = statuts.filter((s) => s === 'maitrise').length;
	const niveau: NiveauNotion =
		statuts.length === 0 || statuts.every((s) => s === 'nouveau')
			? 'a-decouvrir'
			: maitrises === statuts.length
				? 'acquis'
				: 'en-cours';
	return { niveau, total: statuts.length, maitrises };
}

/** Raccourci : seul l'état d'acquisition (sans le compte). */
export function niveauListeOrtho(
	state: OrthoState,
	id: string,
	dicteeDispo: boolean,
): NiveauNotion {
	return avancementLecon(state, id, dicteeDispo).niveau;
}
