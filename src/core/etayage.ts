/* ============================================================
   Étayage de la NOTION (#490) — socle PUR, sans DOM ni stockage.
   ------------------------------------------------------------
   L'aide existante (#272, core/aide.ts) explique la MANIPULATION d'un widget :
   comment glisser une tuile, où saisir. Elle ne dit rien du savoir en jeu. Un
   enfant qui n'a pas la retenue refera la même erreur avec d'autres nombres —
   « varier la surface » (items régénérés, #485) ne suffit pas.

   Ce module porte donc :
   - la SÉLECTION du contenu d'étayage d'une leçon (`etayagePour`) ;
   - le DÉCLENCHEUR de l'exemple d'avant-série et sa mémoire par ÉPISODE de blocage
     (`episodeEtayable`, `doitEtayerAvantSerie`) ;
   - le repli qui marche SANS contenu rédigé : la leçon prérequise (`leconPrerequise`).

   Deux contenus, à ne pas confondre (cf. #490) :
   - la RÉSOLUTION GÉNÉRÉE d'un item, une fonction pure par moteur (le calcul posé
     dans core/etayage-posee.ts) — du code, aucun arriéré éditorial ;
   - le TEXTE RÉDIGÉ de la notion, écrit à la main, qui vit dans le module de données
     de sa leçon (`src/data/<matiere>/`) et remonte par le catalogue, comme `levels`
     ou `exerciseType`. Pas de table centrale de cent entrées : elle dériverait de la
     leçon qu'elle décrit et serait un nid de conflits.

   Granularité de la clé : (leçon, niveau, mode), et non « famille de moteur ». Les
   moteurs sont réutilisés par plusieurs leçons et plusieurs niveaux ; un exemple
   « clique sur un nom, CE2 » servi à un enfant qui rate « clique sur l'adjectif,
   CM1 » est PIRE que rien. Corollaire tenu par tout ce module : sans entrée pour
   cette leçon, il n'y a PAS de panneau — jamais de repli sur un exemple générique
   de la famille de moteur, qui reproduirait exactement ce décalage.
   ============================================================ */
import type { LessonDef, SchoolLevel } from './catalog';
import { getLessonsByCategory } from './catalog';
import type { ConjugaisonSpec } from './etayage-conjugaison';
import type { ConversionSpec } from './etayage-conversion';
import type { DroiteSpec } from './etayage-droite';
import type { PositionSpec } from './etayage-position';
import type { ProblemeSpec } from './etayage-probleme';
import type { PosedSpec } from './items';
import { BLOCAGES_SIGNAL_ADULTE, type EtatReport } from './report-lecon';

/** Exemple entièrement résolu, décrit par la DONNÉE de la leçon et déroulé par le moteur
    de résolution correspondant (`core/etayage-<moteur>.ts`, tous purs et tous rendant le
    même `DerouleEtayage`). Une branche par famille MÉCANISABLE — celles dont la méthode
    est un algorithme, donc du code sans arriéré éditorial. Les autres notions relèvent du
    texte rédigé, pas de cette union.

    Le cas des PROBLÈMES à étapes a demandé d'élargir la donnée avant de pouvoir les
    dérouler : `ProblemeEtape` ne retenait que l'intitulé d'une sous-question et sa réponse,
    de quoi réciter les réponses et rien de plus. Un `calcul` optionnel (#490) y a été
    ajouté, renseigné par les générateurs qui le connaissent. Ce que le déroulé ne prétend
    toujours pas faire : justifier le CHOIX de l'opération, qui demanderait la structure
    sémantique de l'énoncé — absente, et pas déductible. */
export type EtayageExemple =
	| { moteur: 'posee'; spec: PosedSpec }
	| { moteur: 'conversion'; spec: ConversionSpec }
	| { moteur: 'droite'; spec: DroiteSpec }
	| { moteur: 'position'; spec: PositionSpec }
	| { moteur: 'conjugaison'; spec: ConjugaisonSpec }
	| { moteur: 'probleme'; spec: ProblemeSpec };

/** Contenu d'étayage d'une leçon : ce qu'on montre à un enfant qui bute sur la NOTION.
    Rédaction calée sur la charte des aides au geste (#272) : tutoiement, une idée par
    phrase, trois étapes au maximum. Jamais la réponse de la question qui va être posée. */
export interface EtayageContenu {
	/** Titre du panneau, propre à la NOTION (« Comment on fait une addition posée ? »),
	    jamais le « Comment jouer ? » de l'aide au geste : l'enfant ne doit pas confondre
	    « comment on manipule » et « comment on calcule ». */
	titre: string;
	/** L'idée-force, en UNE phrase, affichée en permanence pendant tout le panneau : c'est
	    la seule chose qu'un enfant à faible mémoire de travail emportera d'un écran au
	    suivant (avis `specialiste-troubles-apprentissage`), et elle redonne le SENS avant
	    la mécanique — sans quoi l'enfant récite un enchaînement de gestes vides. */
	regle?: string;
	/** Les étapes de la méthode, ≤ 3 (mémoire de travail). Absentes quand la méthode est
	    portée par un exemple DÉROULÉ (`exemple`), qui la montre au lieu de la résumer. */
	etapes?: string[];
	/** Exemple à dérouler, quand la leçon en désigne un. */
	exemple?: EtayageExemple;
}

/** Entrée d'étayage portée par une leçon. `niveau` et `mode` absents = l'entrée vaut
    pour tous les niveaux / tous les modes de la leçon — le cas courant, puisque le
    catalogue scope déjà chaque leçon par niveau et que la quasi-totalité des leçons
    est mono-niveau et mono-mode. */
export interface EtayageEntree {
	niveau?: SchoolLevel;
	mode?: string;
	contenu: EtayageContenu;
}

/** Contenu d'étayage d'une leçon pour un niveau et un mode donnés, ou `undefined` s'il
    n'y en a pas — auquel cas il n'y a pas de panneau du tout (dégradation propre).
    L'entrée la plus SPÉCIFIQUE gagne (niveau puis mode) : une leçon peut ainsi porter
    une entrée générale et une entrée dédiée à un niveau ou à un mode particulier. Une
    entrée qui précise un niveau ou un mode DIFFÉRENT est écartée, jamais dégradée. */
export function etayagePour(
	lesson: LessonDef,
	niveau: SchoolLevel,
	mode?: string,
): EtayageContenu | undefined {
	let meilleur: { score: number; contenu: EtayageContenu } | undefined;
	for (const e of lesson.etayage ?? []) {
		if (e.niveau !== undefined && e.niveau !== niveau) continue;
		if (e.mode !== undefined && e.mode !== mode) continue;
		const score = (e.niveau !== undefined ? 2 : 0) + (e.mode !== undefined ? 1 : 0);
		if (!meilleur || score > meilleur.score) meilleur = { score, contenu: e.contenu };
	}
	return meilleur?.contenu;
}

/** Leçon à revoir AVANT celle-ci : la précédente de sa catégorie dans l'ordre
    pédagogique du niveau (`ORDRE_LECONS` via `getLessonsByCategory`, déjà trié).
    Entièrement mécanisable, donc affichable même pour une leçon sans contenu rédigé.
    `undefined` si la leçon ouvre sa catégorie, ou n'y existe pas à ce niveau. */
export function leconPrerequise(lesson: LessonDef, niveau: SchoolLevel): LessonDef | undefined {
	const soeurs = getLessonsByCategory(lesson.category, niveau);
	const i = soeurs.findIndex((l) => l.id === lesson.id);
	return i > 0 ? soeurs[i - 1] : undefined;
}

/** Épisode de blocage dont l'enfant REVIENT, identifié par l'horodatage du report qui
    l'a ouvert (0 = aucun). Un report échu (`reprendreLe` passé) signe le retour dans le
    fil : c'est là que l'exemple d'avant-série a sa place, et `reporteLe` en est la
    signature stable — deux blocages successifs seraient deux épisodes distincts.

    Borne haute : dès `BLOCAGES_SIGNAL_ADULTE` atteint, l'espace encadrant alerte l'adulte
    et l'appli cesse d'expliquer d'elle-même — un dispositif auto-corrigé ne répare pas
    une incompréhension persistante par la répétition.

    ⚠ CE QUE LE CALIBRAGE ACTUEL REND ATTEIGNABLE, et qui est plus étroit que la mécanique
    ci-dessus : il faut un report (donc `jours ≥ 2`) et `jours < 3`, soit exactement
    `jours = 2` ; or `jours` ne redescend qu'au franchissement (`apresEssaiLecon`), lequel
    interdit tout report ultérieur. Une leçon ne donne donc, en pratique, qu'UN SEUL exemple
    d'avant-série par niveau, à vie, et la mémoire d'épisode se comporte comme un booléen.
    C'est volontairement conservateur (les autres points d'entrée, eux, restent toujours
    offerts et sans mémoire), mais si l'on veut un second passage il faudra élargir la
    borne, pas ce module — d'où la mécanique laissée générale. */
export function episodeEtayable(etat: EtatReport | undefined, now: number): number {
	if (!etat || etat.reprendreLe <= 0 || etat.reprendreLe > now) return 0;
	if (etat.jours >= BLOCAGES_SIGNAL_ADULTE) return 0;
	return etat.reporteLe;
}

/** Faut-il montrer l'exemple d'avant-série ? `vu` est l'épisode déjà couvert pour cette
    leçon (0 = aucun). Une fois par épisode : relancer la leçon dix fois le même jour ne
    redonne pas dix exemples, mais le blocage suivant, lui, en vaut un nouveau. */
export function doitEtayerAvantSerie(
	etat: EtatReport | undefined,
	vu: number,
	now: number,
): boolean {
	const episode = episodeEtayable(etat, now);
	return episode !== 0 && episode !== vu;
}
