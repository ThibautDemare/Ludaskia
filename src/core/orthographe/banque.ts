/* ============================================================
   Mode Orthographe — projection de la BANQUE pour l'espace encadrant (#496).
   ------------------------------------------------------------
   Les listes ne CONTIENNENT pas les mots, elles les référencent : la banque est le
   dictionnaire du profil, et supprimer une liste n'en retire rien (cf. l'en-tête de
   types.ts). L'adulte n'avait donc aucun moyen de voir ni de retirer un mot devenu
   parasite — typiquement un nom propre d'une liste supprimée, qui continue de revenir
   en révision espacée. Ce module projette, mot par mot : où il vit (listes), où en est
   l'enfant, et s'il est supprimable.

   Lecture SEULE et SYNCHRONE (comme progression.ts) : on n'appelle pas
   materialiserVerbes (async, LEFFF). La suppression elle-même vit dans store.ts
   (`supprimerMot`), l'écriture par profil consulté dans `saveOrthoFor`.
   Pur : aucun accès DOM ni localStorage, `dicteeDispo` injecté.
   ============================================================ */
import { formeNormalisee, listesContenantMot } from './store';
import { leconPredefinieDuMot } from './lessons';
import { listesDeCibleVerbe } from './verbes';
import { statutMot, type StatutMot } from './runner';
import type { OrthoState } from './types';

/** Un mot de la banque, vu par l'adulte. */
export interface EntreeBanque {
	id: string;
	mot: string; // forme correcte (ce que l'enfant doit écrire)
	contexte?: string; // phrase d'une cible verbe (« il mange ») : « mange » seul serait ambigu
	cle: string; // forme normalisée : clé de tri ET de recherche (insensible casse/accents)
	listes: { id: string; label: string }[]; // listes du parent qui référencent ce mot
	verbeListes: { id: string; label: string }[]; // listes dont un verbe REGÉNÈRE cette cible
	leconPredefinie: string | null; // libellé de la leçon livrée avec l'appli, si le mot en vient
	orphelin: boolean; // plus rattaché à rien : ni liste, ni verbe, ni leçon prédéfinie
	statut: StatutMot; // avancement de l'enfant, même échelle à 3 niveaux que les listes
	supprimable: boolean; // faux pour un mot de leçon prédéfinie (la suppression ne tiendrait pas)
}

const ref = (l: { id: string; label: string }) => ({ id: l.id, label: l.label });

/** Toute la banque d'un profil, triée alphabétiquement (ordre « dictionnaire » : c'est ainsi
    qu'un adulte cherche un mot, par reconnaissance et non par chronologie). */
export function banqueProfil(state: OrthoState, dicteeDispo: boolean): EntreeBanque[] {
	const out: EntreeBanque[] = [];
	for (const id in state.banque) {
		const m = state.banque[id];
		if (!m || typeof m.mot !== 'string') continue; // état importé/corrompu : on ignore
		const listes = listesContenantMot(state, id).map(ref);
		const verbeListes = listesDeCibleVerbe(state, id).map(ref);
		const predef = leconPredefinieDuMot(state, id);
		out.push({
			id,
			mot: m.mot,
			contexte: m.contexte ? `${m.contexte.avant}${m.mot}${m.contexte.apres}` : undefined,
			cle: formeNormalisee(m.mot),
			listes,
			verbeListes,
			leconPredefinie: predef?.label ?? null,
			// Exactement le cas où `groupeOrthoDuMot` renvoie null : le mot est révisé mais
			// rattaché à rien, donc invisible au journal d'erreurs (#489). C'est le motif
			// d'ouverture n°1 de cette vue, d'où un filtre dédié.
			orphelin: listes.length === 0 && verbeListes.length === 0 && !predef,
			statut: statutMot(m, dicteeDispo),
			supprimable: !predef,
		});
	}
	return out.sort((a, b) => a.cle.localeCompare(b.cle, 'fr'));
}

/** Filtre de la vue : recherche texte libre + « orphelins seulement ». La recherche passe par
    `formeNormalisee` (la clé de dédup de la banque) des DEUX côtés : sur un clavier tactile,
    taper « etre » doit trouver « être » — exiger le circonflexe rendrait la recherche inutile
    là où elle sert le plus. Sous-chaîne et non préfixe : l'adulte se souvient rarement du début
    exact d'un mot qu'il a saisi il y a trois mois. Pur. */
export function filtrerBanque(
	entrees: EntreeBanque[],
	opts: { recherche?: string; orphelinsSeuls?: boolean } = {},
): EntreeBanque[] {
	const q = formeNormalisee(opts.recherche ?? '');
	return entrees.filter(
		(e) => (!opts.orphelinsSeuls || e.orphelin) && (q === '' || e.cle.includes(q)),
	);
}

/** Mots devenus ORPHELINS et supprimables parmi `candidats` — ceux que plus aucune liste ne
    référence et qu'aucune leçon prédéfinie ne recréerait. Sert au formulaire de liste : après
    enregistrement, proposer de supprimer pour de bon les mots que l'adulte vient d'en retirer,
    au lieu de les laisser en révision à son insu. À appeler APRÈS la mise à jour de la liste,
    l'état devant refléter les références restantes. Pur. */
export function motsDevenusOrphelins(state: OrthoState, candidats: string[]): EntreeBanque[] {
	const vus = new Set(candidats);
	return banqueProfil(state, true).filter((e) => vus.has(e.id) && e.orphelin && e.supprimable);
}
