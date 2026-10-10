/* ============================================================
   Séance partagée (#734) — les SOURCES d'une dictée envoyée : une dictée prédéfinie, ou
   une liste personnalisée d'un profil de l'appareil (critère 1).

   Ce qui voyage est la cible MATÉRIALISÉE (`MotDictee`) : un verbe d'une liste arrive
   déjà conjugué, avec sa phrase à trou, comme dans le parcours de l'enfant.

   Chaque mot repasse par la liste blanche du lien (critère 39). Une liste du parent
   accepte tout ce qu'on y tape (« 1er », « M. ») ; le lien, lui, n'accepte que des
   lettres, l'apostrophe, le trait d'union et l'espace. Un mot refusé est ÉCARTÉ et
   NOMMÉ (`ecartes`), pour que l'écran le dise : une liste amputée en silence se lirait
   comme la liste entière (même règle que les leçons écartées d'un favori).

   Aucune fonction n'écrit dans le stockage : composer un envoi ne touche à aucun profil.
   ============================================================ */
import { ORTHO_PREDEF } from '../../data/francais/orthographe';
import type { SchoolLevel } from '../catalog';
import { getListe, motsDeListe } from '../orthographe/store';
import type { OrthoState } from '../orthographe/types';
import { materialiserVerbes } from '../orthographe/verbes';
import type { MotDictee } from './envoi';
import { apresVerbe, avantVerbe, commeDans as schemaCommeDans, motDictee } from './textes';

/** Une dictée prédéfinie, prête à envoyer. */
export interface DicteePredefinie {
	id: string;
	label: string;
	niveau: SchoolLevel;
	mots: MotDictee[];
}

/* Les claviers mobiles tapent l'apostrophe typographique (ponctuation « intelligente ») ;
   la liste blanche ne connaît que l'apostrophe droite, celle des données de l'appli. */
const APOSTROPHES = /[’‘ʼ]/g;
const propre = (s: string): string => s.normalize('NFC').replace(APOSTROPHES, "'");

/** Un mot de dictée tel qu'il voyage, ou `null` si un de ses champs sort de la liste
 *  blanche du lien. Même décision que le décodage : ce sont les mêmes schémas. */
export function motDicteeDepuis(m: {
	mot: string;
	commeDans?: string;
	contexte?: { avant: string; apres: string };
}): MotDictee | null {
	try {
		const out: MotDictee = { mot: motDictee.lire(propre(m.mot).trim(), 'mot') };
		const comme = m.commeDans === undefined ? '' : propre(m.commeDans).trim();
		if (comme) out.commeDans = schemaCommeDans.lire(comme, 'commeDans');
		// La phrase à trou garde ses espaces : `apres` commence par celle qui sépare le verbe
		// de son complément (« mange » + « une pomme »).
		if (m.contexte)
			out.contexte = {
				avant: avantVerbe.lire(propre(m.contexte.avant), 'avant'),
				apres: apresVerbe.lire(propre(m.contexte.apres), 'apres'),
			};
		return out;
	} catch {
		return null;
	}
}

/* Les données de l'appli passent toutes la liste blanche (`tests/partage-gate.test.ts`) :
   un mot refusé ici serait un défaut des données, qu'on ne cache pas en l'écartant. */
function versPredefinie(l: (typeof ORTHO_PREDEF)[number]): DicteePredefinie {
	const mots = l.mots.map((m) => {
		const mot = motDicteeDepuis(m);
		if (!mot) throw new Error(`dictée prédéfinie ${l.id} : « ${m.mot} » ne peut pas voyager`);
		return mot;
	});
	return { id: l.id, label: l.label, niveau: l.niveau, mots };
}

/** Les dictées prédéfinies, dans l'ordre des données. */
export function dicteesPredefinies(): DicteePredefinie[] {
	return ORTHO_PREDEF.map(versPredefinie);
}

/** Une dictée prédéfinie par son id, `null` si elle n'existe pas. */
export function dicteePredefinie(id: string): DicteePredefinie | null {
	// L'id relu sur l'entrée trouvée : `find` ne tombe jamais sur un prototype, mais la règle
	// est celle du reste du module.
	const l = ORTHO_PREDEF.find((p) => p.id === id);
	return l && l.id === id ? versPredefinie(l) : null;
}

/** Les mots d'une liste personnalisée : ses mots simples dans l'ordre de la liste, puis
 *  ses verbes conjugués (verbe, temps, pronom), comme le parcours de l'enfant les sert.
 *  `ecartes` : les formes refusées par la liste blanche. `null` : liste inconnue.
 *
 *  `state` peut être MUTÉ (la conjugaison matérialise les cibles verbe dans sa banque),
 *  mais n'est jamais sauvegardé : l'appelant passe un état chargé pour l'occasion. */
export async function motsDicteeListe(
	state: OrthoState,
	listeId: string,
): Promise<{ label: string; mots: MotDictee[]; ecartes: string[] } | null> {
	const liste = getListe(state, listeId);
	if (!liste) return null;
	const cibles = liste.verbes?.length
		? await materialiserVerbes(state, liste.verbes, Date.now())
		: [];
	const mots: MotDictee[] = [];
	const ecartes: string[] = [];
	for (const m of [...motsDeListe(state, liste), ...cibles]) {
		const mot = motDicteeDepuis(m);
		if (mot) mots.push(mot);
		else ecartes.push(m.mot);
	}
	return { label: liste.label, mots, ecartes };
}
