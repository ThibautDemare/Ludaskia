/* ============================================================
   Journal du RETARD au moment de la correction (#691).
   ------------------------------------------------------------
   Tout ce lot d'issues repose sur une hypothèse : un rendez-vous servi très en
   retard fait échouer l'enfant, et cet échec est imputable à la file plutôt qu'à
   lui. En simulation, cette hypothèse porte TOUT le bénéfice attendu — avec un
   taux de réussite dépendant du retard, le crédit de #688 divise par deux le temps
   de sortie de congestion ; avec un taux fixe, le statu quo se résorbe aussi bien.
   Or elle n'était ni vérifiable ni réfutable : `EtatRevision` ne garde que le
   dernier test et le palier courant, donc `avancerEtat` écrase le retard à chaque
   passage et l'historique est perdu.

   Ce module capture le retard AVANT qu'il soit écrasé, et rien d'autre.

   CE QU'IL N'EST PAS. Ce n'est pas le journal d'erreurs (#391), qui capture les
   réponses de l'enfant pour l'espace encadrant : celui-là garde des énoncés, ne
   retient que les échecs, et sert à comprendre UNE erreur. Celui-ci ne porte que
   des nombres, garde aussi les RÉUSSITES (sans dénominateur, pas de taux à lire)
   et sert à juger la PLANIFICATION. Les deux restent distincts.

   IL N'ENTRE DANS AUCUN CALCUL de l'application : ni XP, ni trophée, ni objectif,
   ni sélection des éléments à réviser. C'est une mesure, pas une entrée du moteur —
   le retirer ne doit rien changer au comportement.
   ============================================================ */
import { lsGet, lsSet, lsGetRaw } from './storage';
import { REVISION_INTERVALLES } from './revision';
import type { EtatRevision } from './orthographe/types';

export const RETARD_KEY = 'ludaskia_retards';

/* Rétention. Volontairement BIEN au-dessus des 150 du journal d'erreurs, et c'est un
   arbitrage du mainteneur, pas un oubli d'alignement : ce journal doit permettre de
   comparer un AVANT et un APRÈS sur la durée que le lot vise (sortie de congestion en
   8 à 16 semaines). À 150, la fenêtre observable tombe sous la semaine pour le profil
   qui a motivé le diagnostic — réglé au plafond de séance maximal, soit jusqu'à 24
   corrections par jour — et le taux par tranche ne pourrait jamais arbitrer ce qu'il
   est censé arbitrer. 1000 entrées couvrent environ 6 semaines à ce rythme, 12 au
   plafond par défaut, pour de l'ordre de 70 Ko. */
export const MAX_RETARDS = 1000;

export type TrancheRetard = 'aHeure' | 'retardModere' | 'retardFort';

/* Une correction, réduite à ce qui se mesure. Aucun texte hors des deux identifiants :
   le journal d'erreurs porte déjà les énoncés, les dupliquer ici alourdirait l'export
   sans rien ajouter, et ferait entrer des données d'enfant dans une table de mesure. */
export interface RetardEntry {
	ts: number;
	kind: 'mot' | 'lecon';
	/** `wordId` d'un mot (jamais le mot lui-même), ou clé de leçon. */
	id: string;
	/** Palier de DÉPART, avant l'avancement : c'est lui qui donne l'intervalle attendu. */
	palier: number;
	retardRelatif: number;
	reussi: boolean;
}

export interface TrancheDef {
	id: TrancheRetard;
	label: string;
	min: number;
	max: number;
}

/* Trois tranches, bornes SEMI-OUVERTES `[min, max[` : aucune valeur ne tombe dans deux
   tranches ni dans aucune.

   Pourquoi « à l'heure » va jusqu'à un intervalle entier, et non jusqu'à une fraction :
   l'échéance est horodatée à la minute, alors qu'un enfant révise une fois par jour à
   une heure variable. Une séance de la veille à 18 h rend l'élément dû à 18 h ; l'enfant
   qui joue le lendemain matin ne le voit pas et le retrouve le surlendemain — retard
   relatif d'environ 0,6 sur un palier à J+1, avec un rythme pourtant parfait. Une tranche
   calée plus bas serait quasi vide sur les deux premiers paliers et mesurerait l'heure de
   la séance, pas la planification. Sous 1, le délai réellement écoulé reste inférieur au
   double du délai prévu.

   Les libellés disent « moins de » et non « jusqu'à » : avec des bornes semi-ouvertes,
   un retard relatif de 2 pile appartient à la tranche du DESSUS, et un libellé inclusif
   contredirait ce qu'il compte. */
export const TRANCHES_RETARD: readonly TrancheDef[] = [
	{ id: 'aHeure', label: "Servi à l'heure", min: 0, max: 1 },
	{ id: 'retardModere', label: 'Moins de 2 intervalles de retard', min: 1, max: 2 },
	{ id: 'retardFort', label: '2 intervalles de retard ou plus', min: 2, max: Infinity },
];

export interface TauxTranche {
	tranche: TrancheRetard;
	label: string;
	total: number;
	reussites: number;
	/** Fraction dans [0, 1], NON formatée : la mise en pourcentage appartient au rendu.
	    `null` quand la tranche est VIDE — à ne pas confondre avec un taux de 0, qui dit
	    que tout a été raté. Fondre les deux ferait lire « 0 % de réussite » là où il n'y
	    a simplement rien à lire. */
	taux: number | null;
}

/* Retard rapporté à l'intervalle du palier de départ. `null` quand il n'y a rien à
   mesurer : pas d'état, pas d'échéance (hors rotation, acquis), ou palier corrompu par
   une donnée importée. Une entrée sans retard ne vaut pas mieux que pas d'entrée — elle
   pèserait dans un taux sans rien mesurer.

   Plancher à 0 : un élément servi en avance n'est pas « en retard négatif », et le
   nombre ressortirait tel quel dans une lecture parent. */
export function retardRelatif(e: EtatRevision | null | undefined, now: number): number | null {
	if (!e || e.prochaineRevision == null) return null;
	const p = e.palier;
	if (!Number.isInteger(p) || p < 0 || p >= REVISION_INTERVALLES.length) return null;
	return Math.max(0, (now - e.prochaineRevision) / REVISION_INTERVALLES[p]);
}

export function entreeRetard(
	cible: { kind: 'mot' | 'lecon'; id: string },
	e: EtatRevision | null | undefined,
	reussi: boolean,
	now: number,
): RetardEntry | null {
	if (!cible.id) return null;
	const rel = retardRelatif(e, now);
	if (rel == null || !Number.isFinite(rel)) return null;
	return { ts: now, kind: cible.kind, id: cible.id, palier: e!.palier, retardRelatif: rel, reussi };
}

/* Ajout en TÊTE puis troncature : les plus anciennes s'évincent d'elles-mêmes. Pure —
   la liste reçue n'est pas mutée (même forme que `ajouterErreur`, #391). */
export function ajouterRetard(
	liste: RetardEntry[],
	entry: RetardEntry,
	max = MAX_RETARDS,
): RetardEntry[] {
	return [entry, ...liste].slice(0, Math.max(0, max));
}

/* Écriture pour le profil ACTIF. Sans effet si le retard n'est pas mesurable : mieux vaut
   un trou dans la mesure qu'une ligne qui la fausse. */
export function journaliserRetard(
	cible: { kind: 'mot' | 'lecon'; id: string },
	e: EtatRevision | null | undefined,
	reussi: boolean,
	now: number,
): void {
	const entry = entreeRetard(cible, e, reussi, now);
	if (!entry) return;
	const brut = lsGet(RETARD_KEY, []);
	const liste = Array.isArray(brut) ? (brut as RetardEntry[]) : [];
	lsSet(RETARD_KEY, ajouterRetard(liste, entry));
}

/* Lecture BRUTE d'un profil donné (espace encadrant), plus récent d'abord. Garde de
   forme : la clé traverse l'export/import, une entrée incomplète est écartée plutôt que
   de fausser un taux. */
export function chargerRetardsFor(uuid: string): RetardEntry[] {
	const v = lsGetRaw(uuid + '/' + RETARD_KEY, []);
	if (!Array.isArray(v)) return [];
	return (v as RetardEntry[]).filter(
		(e) =>
			!!e &&
			typeof e === 'object' &&
			Number.isFinite(e.ts) &&
			(e.kind === 'mot' || e.kind === 'lecon') &&
			typeof e.id === 'string' &&
			Number.isFinite(e.palier) &&
			Number.isFinite(e.retardRelatif) &&
			typeof e.reussi === 'boolean',
	);
}

/* Fonction TOTALE : tout nombre tombe dans exactement une tranche, y compris un négatif
   venu d'un stockage ancien (rangé « à l'heure », faute d'être en retard). */
export function trancheRetard(rel: number): TrancheRetard {
	for (const t of TRANCHES_RETARD) {
		if (rel < t.max) return t.id;
	}
	return 'retardFort';
}

/* Taux de réussite par tranche. PUR : ne lit pas le stockage, ne mute rien. Rend toujours
   les trois tranches, dans l'ordre, même vides — c'est ce qui permet de lire « rien à
   cette tranche » plutôt que de croire qu'elle n'existe pas. */
export function tauxParTranche(entries: readonly RetardEntry[]): TauxTranche[] {
	const seau = new Map<TrancheRetard, { total: number; reussites: number }>();
	for (const t of TRANCHES_RETARD) seau.set(t.id, { total: 0, reussites: 0 });
	for (const e of entries) {
		if (!Number.isFinite(e.retardRelatif)) continue;
		const s = seau.get(trancheRetard(e.retardRelatif));
		if (!s) continue;
		s.total++;
		if (e.reussi) s.reussites++;
	}
	return TRANCHES_RETARD.map((t) => {
		const s = seau.get(t.id) ?? { total: 0, reussites: 0 };
		return {
			tranche: t.id,
			label: t.label,
			total: s.total,
			reussites: s.reussites,
			taux: s.total === 0 ? null : s.reussites / s.total,
		};
	});
}
