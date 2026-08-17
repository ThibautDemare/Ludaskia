/* ============================================================
   Rappel « installez sur l'écran d'accueil, et sauvegardez » (#306 §7).
   ------------------------------------------------------------
   Les données vivent dans le navigateur, et un navigateur peut les effacer :
   sur Safari, environ sept jours sans interaction suffisent à vider le stockage
   d'un site NON installé — la progression de l'enfant avec. Deux parades
   existent, l'installation sur l'écran d'accueil (qui lève ce plafond) et
   l'export de sauvegarde (le filet de secours). Autant le dire à l'adulte, au
   bon moment.

   « Au bon moment » est tout le sujet. PAS DE MINUTERIE : un rappel « tous les
   N jours » sonne aussi bien quand rien n'a changé depuis le dernier export
   (harcèlement pour rien) que dès le premier jour, avant qu'il y ait quoi que ce
   soit à perdre. Dans les deux cas il se décrédibilise, et le message qui
   compterait vraiment sera ignoré. Le déclencheur est donc le RISQUE RÉELLEMENT
   ACCUMULÉ, avec un simple plancher anti-rafale. Même logique que la mise à
   jour, qui ne recharge jamais sur minuterie mais seulement s'il y a vraiment
   une nouvelle version.

   Trois conditions se CUMULENT, et c'est le piège principal de cette mécanique :

   1. du risque accumulé — au moins 3 activités terminées, tous profils
      confondus, depuis le dernier export réussi ;
   2. le délai de report écoulé — chaque fermeture repousse la fois suivante un
      peu plus loin (1 jour, 3, 7, 14, 30, puis 30 indéfiniment) ;
   3. un délai minimal depuis le dernier export — 7 jours.

   Le report est un PLANCHER, jamais un déclencheur : si le délai expire alors
   qu'il n'y a rien de neuf à perdre, l'encart ne s'affiche pas. Sans cette
   précision, la mécanique se recode en « afficher tous les N jours » et on
   réintroduit la minuterie que tout le reste écarte.

   Pourquoi le troisième verrou, et pourquoi 7 jours : un export remet le
   compteur d'activités à zéro. Sans lui, trois activités (un sprint, une leçon
   et une révision dans la même soirée peuvent y suffire) plus un jour, et
   l'encart reviendrait deux ou trois jours après un export — on solliciterait
   le plus souvent celui qui fait l'effort. Et 7 plutôt que 30 parce que le
   profil réellement en danger est l'utilisateur PONCTUEL (révision de dictées
   toutes les deux ou trois semaines, retour de vacances), celui que la purge
   iOS des sept jours frappe : un délai de 30 jours supprimerait le rappel au
   seul moment où on peut le lui adresser.

   Les seuils sont des ordres de grandeur raisonnés, pas des constantes
   observées : à recalibrer à l'usage.

   Module FEUILLE (il n'importe que `storage`) : `profiles.ts` l'appelle pour
   horodater un export, ce qui interdit tout import en sens inverse. Les UUID des
   profils lui sont donc passés par l'appelant.
   ============================================================ */
import { lsGetRaw, lsSetRaw } from './storage';

/* Clé GLOBALE (non préfixée par profil), sur le modèle de `ludaskia_encadrant_lock` :
   l'export couvre TOUS les profils, l'état du rappel ne peut donc appartenir à aucun.
   Elle n'est pas exportée avec les profils (ce serait importer la mémoire d'une AUTRE
   machine) et survit à la suppression d'un profil. */
export const RAPPEL_SAUVEGARDE_KEY = 'ludaskia_sauvegarde';

/** Nombre d'activités (tous profils) à accumuler depuis le dernier export. */
export const MIN_ACTIVITES = 3;
/** Le « mot aux parents » du premier lancement promet « sans aucune pression » :
 *  y superposer un message inquiétant dans la même minute le contredirait. */
export const DELAI_PREMIER_JOUR_MS = 48 * 60 * 60 * 1000;
/** Troisième verrou : on ne sollicite pas quelqu'un qui vient de sauvegarder. */
export const DELAI_MIN_EXPORT_MS = 7 * 24 * 60 * 60 * 1000;
/** Échelle de report, en jours : chaque fermeture monte d'un cran, le dernier est
 *  un PLAFOND (l'information ne meurt jamais, mais 30 jours est très loin du
 *  harcèlement). Pas de « ne plus jamais afficher » : le report le rend inutile. */
export const REPORTS_JOURS = [1, 3, 7, 14, 30] as const;

const JOUR_MS = 24 * 60 * 60 * 1000;

/** État persisté du rappel. */
export interface EtatRappel {
	/** Première fois qu'on a observé cette installation (≈ création du 1er profil). */
	depuis?: number;
	/** Horodatage du dernier export réussi (absent = jamais sauvegardé). */
	dernierExport?: number;
	/** Cran atteint dans l'échelle de report (0 = jamais fermé). */
	palier: number;
	/** Plancher de réapparition posé par la dernière fermeture. */
	prochain?: number;
}

/** Ce que l'appelant observe au moment de décider. */
export interface ContexteRappel {
	/** Quelqu'un se sert-il vraiment de l'app ? (cf. `core/engagement.ts`) */
	engage: boolean;
	/** Activités terminées, tous profils, depuis le dernier export réussi. */
	activites: number;
	/** L'app est-elle déjà posée sur l'écran d'accueil ? */
	installee: boolean;
	now: number;
}

export function etatNeufRappel(now: number): EtatRappel {
	return { depuis: now, palier: 0 };
}

/** Délai de report du cran courant (le dernier cran fait plafond). */
export function delaiReportMs(palier: number): number {
	const i = Math.min(Math.max(palier, 0), REPORTS_JOURS.length - 1);
	return REPORTS_JOURS[i] * JOUR_MS;
}

/** Faut-il montrer l'encart maintenant ? Les trois verrous se cumulent. */
export function doitAfficherRappel(etat: EtatRappel, ctx: ContexteRappel): boolean {
	if (!ctx.engage) return false; // rien à perdre
	if (ctx.activites < MIN_ACTIVITES) return false; // aucun risque accumulé
	// Délai calendaire, pas temps d'usage : une longue absence fait expirer les
	// délais, et l'encart s'affiche à la réouverture. C'est le comportement voulu —
	// beaucoup de progression non sauvegardée plus une longue absence, c'est
	// exactement le moment de prévenir.
	const depuis = etat.depuis ?? ctx.now;
	if (ctx.now - depuis < DELAI_PREMIER_JOUR_MS) return false;
	if (etat.dernierExport != null && ctx.now - etat.dernierExport < DELAI_MIN_EXPORT_MS)
		return false;
	if (etat.prochain != null && ctx.now < etat.prochain) return false; // plancher de report
	return true;
}

/* Ce que l'encart propose. Les deux conseils ont des conditions INDÉPENDANTES :
   l'installation se fait une fois, l'export est à refaire. Le cas le plus fréquent
   à terme est donc « installée mais pas sauvegardée » — l'encart ne disparaît pas,
   il se réduit à ce qui reste pertinent. */
export function contenuRappel(ctx: ContexteRappel): {
	installer: boolean;
	sauvegarder: boolean;
} {
	return { installer: !ctx.installee, sauvegarder: true };
}

/** Fermeture : on monte d'un cran et on repousse la fois suivante d'autant. */
export function reporter(etat: EtatRappel, now: number): EtatRappel {
	const palier = Math.min(etat.palier + 1, REPORTS_JOURS.length - 1);
	// Le délai posé est celui du cran qu'on VIENT d'atteindre : fermer une première
	// fois renvoie au lendemain, le fermer encore trois jours plus tard, etc.
	return { ...etat, palier, prochain: now + delaiReportMs(etat.palier) };
}

/* Export réussi : le compteur d'activités repart (il se compte depuis cette date)
   et le report redescend au premier cran. Sans cette remise à zéro, une famille
   qui exporte régulièrement mais ferme parfois l'encart dériverait jusqu'au palier
   de 30 jours et y resterait — précisément celle qui se comporte bien. Fermer
   monte d'un cran, exporter ramène au premier ; c'est le verrou des 7 jours qui
   empêche l'encart de revenir aussitôt. */
export function apresExport(etat: EtatRappel, now: number): EtatRappel {
	return { depuis: etat.depuis ?? now, dernierExport: now, palier: 0 };
}

/* ---------- Persistance (clé globale) ---------- */

function normaliser(v: unknown, now: number): EtatRappel {
	if (!v || typeof v !== 'object') return etatNeufRappel(now);
	const o = v as Partial<EtatRappel>;
	const nombre = (x: unknown): number | undefined =>
		typeof x === 'number' && Number.isFinite(x) ? x : undefined;
	return {
		depuis: nombre(o.depuis) ?? now,
		dernierExport: nombre(o.dernierExport),
		palier: Math.min(Math.max(nombre(o.palier) ?? 0, 0), REPORTS_JOURS.length - 1),
		prochain: nombre(o.prochain),
	};
}

/* Lit l'état, en POSANT l'origine au premier appel si elle manque. C'est ce qui
   date le « 48 h » sans exiger un champ de création sur les profils : pour un
   nouvel arrivant, ce premier appel a lieu au premier lancement. */
export function lireEtatRappel(now: number): EtatRappel {
	const brut = lsGetRaw(RAPPEL_SAUVEGARDE_KEY, null);
	const etat = normaliser(brut, now);
	if (!brut || (brut as Partial<EtatRappel>).depuis == null) ecrireEtatRappel(etat);
	return etat;
}

export function ecrireEtatRappel(etat: EtatRappel): void {
	lsSetRaw(RAPPEL_SAUVEGARDE_KEY, JSON.stringify(etat));
}

/** Horodate un export réussi (appelé par `exportProfiles`). */
export function enregistrerExport(now: number): void {
	ecrireEtatRappel(apresExport(lireEtatRappel(now), now));
}

/* Compte les activités terminées depuis `depuis`, sur TOUS les profils. Ne compter
   que le profil actif ferait réapparaître l'encart à tort au simple changement
   d'enfant, l'export couvrant toute la famille. On lit `ludaskia_activity` par UUID,
   comme le fait déjà l'espace encadrant, et on tolère l'ancien format (horodatage nu). */
export function compterActivites(uuids: string[], depuis?: number): number {
	const seuil = depuis ?? 0;
	let n = 0;
	// Le préfixe vide couvre un profil hérité, d'avant les profils multiples.
	for (const prefixe of ['', ...uuids.map((u) => `${u}/`)]) {
		const brut = lsGetRaw(`${prefixe}ludaskia_activity`, []);
		if (!Array.isArray(brut)) continue;
		for (const e of brut) {
			const t = typeof e === 'number' ? e : (e as { t?: unknown })?.t;
			if (typeof t === 'number' && t > seuil) n++;
		}
	}
	return n;
}
