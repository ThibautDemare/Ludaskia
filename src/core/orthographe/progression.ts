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
import { composition, type Composition } from './etapes';
import { cibleVerbeId } from './verbes';
import type { MotOrtho, OrthoState } from './types';
import type { NiveauNotion } from '../maitrise';

/** Mots ATTENDUS d'une leçon d'orthographe (liste du profil OU prédéfinie), en lecture seule :
    mots simples puis cibles verbe. Une entrée `undefined` = mot attendu jamais matérialisé en
    banque (donc jamais commencé). `[]` si l'id est inconnu.
    Énumération PARTAGÉE : c'est la même population de mots qui donne l'état d'une liste
    (`avancementLecon`) et sa composition par étape (`compositionLecon`, #545) — les deux ne
    doivent pas pouvoir porter sur des ensembles différents. */
export function motsAttendusLecon(state: OrthoState, id: string): (MotOrtho | undefined)[] {
	const liste = getListe(state, id);
	if (liste) {
		const simples = liste.motIds.map((mid) => state.banque[mid]);
		const verbes: (MotOrtho | undefined)[] = [];
		for (const v of liste.verbes ?? []) {
			for (const temps of v.temps) {
				for (const person of v.pronoms) {
					verbes.push(state.banque[cibleVerbeId(v.infinitif, temps, person)]);
				}
			}
		}
		return [...simples, ...verbes];
	}
	const predef = ORTHO_PREDEF.find((l) => l.id === id);
	if (predef) {
		return predef.mots.map((mi) => {
			const motId = state.motIdParForme[formeNormalisee(mi.mot)];
			return motId ? state.banque[motId] : undefined;
		});
	}
	return [];
}

/** Statuts des mots ATTENDUS d'une leçon : celui du mot s'il est en banque, sinon « nouveau ». */
export function statutsLecon(state: OrthoState, id: string, dicteeDispo: boolean): StatutMot[] {
	return motsAttendusLecon(state, id).map((m) => (m ? statutMot(m, dicteeDispo) : 'nouveau'));
}

/** Composition d'une leçon d'orthographe (#545) : combien de ses mots sont à chaque étape du
    parcours, à `at` si fourni, sinon aujourd'hui. Mesure de COUVERTURE qui bouge à chaque
    franchissement, là où `avancementLecon` ne bouge qu'aux deux caps de la liste. */
export function compositionLecon(
	state: OrthoState,
	id: string,
	dicteeDispo: boolean,
	at?: number,
): Composition {
	return composition(motsAttendusLecon(state, id), dicteeDispo, at);
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
