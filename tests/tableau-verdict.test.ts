/* ============================================================
   Ce que le tableau de conversion EXIGE, et ce qu'il tolère (#711 lot 5) — logique PURE.

   Jusqu'ici l'enfant devait remplir TOUTES les cases : « 60 mm = ? cm » lui demandait
   `0 0 0 0 0 6 0`, cinq zéros dans des colonnes qui ne concernent pas sa question. Les
   critères 30 à 39 découpent le tableau en deux : une ZONE OBLIGATOIRE, qui prouve la
   transcription, et le reste, qui relève de l'écriture décimale et qu'on ne pénalise pas.

   ── La règle, telle que le pédagogue l'a posée (avis du 30/09) ──────────────────
   Le tableau sert à TRANSCRIRE la donnée, puis à LIRE la réponse.
   - à gauche du premier chiffre : zéros acceptés, non exigés (personne n'écrit `006,5`) ;
   - entre les chiffres, ET jusqu'à la colonne où se lit la réponse : obligatoires, ils
     portent le rang vide ;
   - à droite du dernier chiffre de la DONNÉE : acceptés, non exigés (`3000,000` n'est pas
     faux, mais c'est une écriture qu'on évite à cet âge).

   Les attendus de ce fichier sont dérivés de cette règle, pas d'une formule : chaque zone
   citée plus bas est recalculée à la main en commentaire, et le tableau d'exemples de
   l'issue a été refait case par case avant d'être figé ici. Ce qui en découle :

   - `gauche` = la plus à GAUCHE entre le premier chiffre significatif et la colonne de la
     réponse. C'est la seconde qui fait exister « 5 m = ? km » → `0 0 0 5` : les trois zéros
     de tête sont exigés parce que la réponse se lit derrière eux.
   - `droite` = la plus à DROITE entre le dernier chiffre de la donnée et la colonne de la
     réponse. C'est elle qui fait exister le cas qui décide de tout : le `0` des millimètres
     de « 60 mm = ? cm » est OBLIGATOIRE. Ce n'est pas un chiffre de la réponse, c'est un
     chiffre de la DONNÉE — l'accepter vide reviendrait à valider une conversion faite de
     tête sans passer par le tableau.

   ── Deux unités de mesure à ne pas confondre : la ZONE et l'ÉCRITURE ────────────
   `zoneObligatoire` dit ce que l'enfant doit ÉCRIRE ; `ecritureAttendue` dit ce que la
   donnée VAUT. Les deux ne coïncident pas, et c'est délibéré : la zone déborde l'écriture
   de la donnée du côté de la réponse. Parcourir la zone pour composer la phrase produirait
   « pour 5 m, il fallait écrire 0 dans les km, 0 dans les hm, 0 dans les dam et 5 dans les m »
   — vrai de la LIGNE du tableau, faux du nombre : 5 m ne s'écrit pas « 0 km ». La phrase ne
   parcourt donc que les colonnes qui portent les chiffres de la donnée, c'est-à-dire la zone
   amputée de ce qui n'y est que pour la réponse.

   Conséquence assumée : quand la donnée tient sur UNE colonne (« 3 km », « 5 m »), il n'y a
   rien à dire et la fonction rend la chaîne vide. Le rang vide oublié — le `0` des
   hectomètres de « 3 km = ? m » — n'est alors plus couvert ici : il l'est par
   `explicationRangVide` (`src/ui/lecon-tableau.ts`), avec « Pense au 0 de l'unité
   intermédiaire ». Les deux messages sont COMPLÉMENTAIRES et ne doivent pas se recouvrir ;
   c'est pourquoi plusieurs tests plus bas exigent une chaîne VIDE là où une phrase serait
   possible.

   ── Le piège du lot, et pourquoi `neutre` n'est pas un demi-verdict ─────────────
   Les critères 30 et 36 parlent de la MÊME case — hors zone, laissée vide — et en disent
   deux choses différentes : elle ne coûte rien au score (30), et elle ne reçoit NI ✓ NI ✗
   (36). Une implémentation qui la marquerait `juste` satisferait le premier et raterait le
   second, sans qu'aucune addition ne s'en aperçoive : l'enfant verrait un ✓ posé sur une
   case qu'il n'a jamais remplie, c'est-à-dire un « tu as bon » qui ne dit pas de quoi. D'où
   la troisième valeur, et d'où le fait que ces tests distinguent partout le vide de l'écrit
   — y compris hors zone, où les deux « ne comptent pas ».

   Hors de ce fichier : que la case porte bien sa marque à l'écran, que « Vérifier » cesse
   d'être gris, que le retour s'affiche — c'est du DOM, donc de la spec Playwright.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	indicesQuestion,
	bornesColonnes,
	zoneObligatoire,
	casesObligatoires,
	verdictsCases,
	ecritureAttendue,
	saisiesPourJournal,
	noteOubli,
	TROU,
	type ColonneAttendue,
	type VerdictCase,
} from '../src/core/tableau-verdict';
// Le journal encadrant se relit en DEUX temps (critère 34) : ce module-ci décide de ce que
// vaut une case vide, celui-là en tire le nombre lu dans l'unité demandée. C'est la
// composition qui porte le risque, elle est donc jouée telle quelle plus bas.
import { nombreTableauSaisi } from '../src/core/erreur-representation';
import { getLessonById, type SchoolLevel } from '../src/core/catalog';
import { ESPACE_FINE, formatNombre } from '../src/core/nombres';
import { withSeed } from '../src/core/utils';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { apostrophesCourbes, vouvoiements, signesCites } from './gardes-langue';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ============================================================
   Les questions, dérivées à la main
   ============================================================ */

/** La tranche FIXE des longueurs : sept rangs, de la plus grande unité à la plus petite.
    C'est celle du tableau d'exemples de l'issue, et celle que le CE2 comme le CM1 rendent
    (les deux configurations de `CONFIG_LONGUEURS` nomment km↔m et m↔mm). */
const LONGUEURS = ['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm'];

interface Cas {
	/** La question, telle que l'enfant la lit. Sert de préfixe à tous les messages d'échec. */
	nom: string;
	unites: string[];
	/** Chiffres ATTENDUS, un par colonne — la TÊTE peut en porter deux. Écrits à la main
	    depuis la question, puis revérifiés par le garde-fou de fixtures plus bas. */
	chiffres: string[];
	connue: string;
	demandee: string;
	/** Zone obligatoire, en index de COLONNE, dérivée de la règle du pédagogue. */
	zone: { gauche: number; droite: number };
	/** Colonnes qui portent les chiffres de la DONNÉE — de son premier chiffre significatif
	    à son dernier. Toujours incluses dans `zone`, et souvent plus étroites : c'est
	    l'écart entre les deux qui distingue « ce qu'il faut écrire » de « ce que ça vaut ». */
	donneeRangs: { gauche: number; droite: number };
	/** La donnée telle que l'énoncé l'écrit. */
	donnee: string;
	/** La même donnée exprimée dans la plus petite unité de la tranche — sert uniquement à
	    revérifier `chiffres` par un second chemin. */
	enPlusPetiteUnite: number;
	/** La question est-elle réellement TIRÉE par le générateur, et par quelle relation de
	    `CONFIG_LONGUEURS` ? `false` signale une garde défensive : le module est pur et doit
	    répondre, mais l'attendu n'est vérifiable sur aucun écran. Le jour où une relation
	    rend la question tirable, c'est ce champ qui dit qu'il faut la rejouer à la main. */
	tire: string | false;
}

/* Les cinq lignes du tableau de l'issue. Le calcul est refait ici, pas recopié. */
const CAS: Cas[] = [
	{
		// 3 km = 3 en km puis des zéros. Premier chiffre en km (0), réponse en m (3) :
		// gauche = min(0, 3) = 0. Dernier chiffre de la donnée en km (0), réponse en m :
		// droite = max(0, 3) = 3. Les dm/cm/mm sont à droite du dernier chiffre : facultatifs.
		// La donnée, elle, tient sur la seule colonne des km → aucune phrase à composer.
		nom: '« 3 km = ? m »',
		unites: LONGUEURS,
		chiffres: ['3', '0', '0', '0', '0', '0', '0'],
		connue: 'km',
		demandee: 'm',
		zone: { gauche: 0, droite: 3 },
		donneeRangs: { gauche: 0, droite: 0 },
		donnee: '3 km',
		enPlusPetiteUnite: 3_000_000,
		tire: 'km↔m, sens grande→petite (v = rnd(1, maxBig))',
	},
	{
		// LE cas du module. 60 mm s'écrit 6 en cm et 0 en mm. Premier chiffre en cm (5),
		// réponse en cm : gauche = 5. Dernier chiffre de la donnée en mm (6) — c'est le `0`
		// de « 60 » — donc droite = max(6, 5) = 6. Tout le reste du tableau est facultatif :
		// cinq cases de moins à remplir qu'aujourd'hui.
		nom: '« 60 mm = ? cm »',
		unites: LONGUEURS,
		chiffres: ['0', '0', '0', '0', '0', '6', '0'],
		connue: 'mm',
		demandee: 'cm',
		zone: { gauche: 5, droite: 6 },
		donneeRangs: { gauche: 5, droite: 6 },
		donnee: '60 mm',
		enPlusPetiteUnite: 60,
		// Au CM1 la paire cm↔mm est `decimal: 'deux-sens'`, donc ce sens y produit
		// « 125 mm = ? cm » (frac jamais nul). C'est au CE2, où la paire est entière, que
		// l'exemple du critère 38 se rencontre pour de vrai.
		tire: 'CE2 : cm↔mm entier, sens petite→grande (k × facteur)',
	},
	{
		// 456 cm = 4 m 5 dm 6 cm. Premier chiffre en m (3), réponse en m : gauche = 3.
		// Dernier chiffre de la donnée en cm (5) : droite = max(5, 3) = 5. Les mm sont à
		// droite du dernier chiffre, les km/hm/dam à gauche du premier : tous facultatifs.
		nom: '« 456 cm = ? m »',
		unites: LONGUEURS,
		chiffres: ['0', '0', '0', '4', '5', '6', '0'],
		connue: 'cm',
		demandee: 'm',
		zone: { gauche: 3, droite: 5 },
		donneeRangs: { gauche: 3, droite: 5 },
		donnee: '456 cm',
		enPlusPetiteUnite: 4560,
		tire: "CM1 : m↔cm `decimal: 'vers-grande'`, réponse 4,56 m",
	},
	{
		/* Conversion vers la GAUCHE avec une réponse INFÉRIEURE À 1. Premier chiffre en m (3),
		   mais la réponse se lit en km (0) : gauche = min(3, 0) = 0. Les trois zéros de tête,
		   « à gauche du premier chiffre », deviennent donc obligatoires — c'est la clause
		   « jusqu'à la colonne où se lit la réponse » qui prime, et c'est ce qui permet à
		   l'enfant de LIRE 0,005.

		   NON TIRÉ, et c'est le point à connaître : le sens petite→grande part toujours d'un
		   multiple exact (`k × facteur`) et les deux branches décimales imposent une partie
		   entière ≥ 1, si bien qu'aucune question ne produit aujourd'hui une réponse < 1. Cette
		   ligne du tableau de l'issue est donc la SEULE à exercer la clause de `gauche`, et elle
		   n'est vérifiable sur aucun écran. La clause reste juste — elle dit ce que la règle
		   veut dire — mais tant qu'aucune question ne la déclenche, ce test est le seul endroit
		   où elle est éprouvée. */
		nom: '« 5 m = ? km »',
		unites: LONGUEURS,
		chiffres: ['0', '0', '0', '5', '0', '0', '0'],
		connue: 'm',
		demandee: 'km',
		zone: { gauche: 0, droite: 3 },
		donneeRangs: { gauche: 3, droite: 3 },
		donnee: '5 m',
		enPlusPetiteUnite: 5000,
		tire: false,
	},
	{
		// Donnée décimale. 3,2 cm = 3 en cm et 2 en mm. Premier chiffre en cm (5), réponse en
		// mm (6) : gauche = 5, droite = max(6, 6) = 6.
		nom: '« 3,2 cm = ? mm »',
		unites: LONGUEURS,
		chiffres: ['0', '0', '0', '0', '0', '3', '2'],
		connue: 'cm',
		demandee: 'mm',
		zone: { gauche: 5, droite: 6 },
		donneeRangs: { gauche: 5, droite: 6 },
		donnee: '3,2 cm',
		enPlusPetiteUnite: 32,
		tire: "CM1 : cm↔mm `decimal: 'deux-sens'`, sens grande→petite (entier 3, frac 2)",
	},
];

/** La question qui SÉPARE la règle du pédagogue de sa contrefaçon la plus tentante — « la
    zone va de la colonne de l'unité donnée à celle de l'unité demandée ». Les cinq lignes du
    tableau de l'issue ne les distinguent pas : elles rendent la même zone dans les deux
    lectures, si bien qu'une implémentation qui ne lirait jamais les chiffres les passerait
    toutes. Ici elles divergent, et sur une question réellement tirée.

    La contrefaçon n'exigerait que cm et mm. Un enfant qui écrit 2 en cm et 5 en mm — c'est-à-
    dire qui transcrit « 2,5 cm » au lieu de « 12,5 cm » — serait alors compté juste, et sa
    réponse validée à 25 mm au lieu de 125. Le 1 des décimètres est un chiffre de la DONNÉE :
    il est exigé, même s'il tombe à gauche de l'unité de départ.

    Valeurs choisies dans ce que le générateur produit vraiment : `entier = rnd(1, maxBig)`
    avec `maxBig: 20` et `frac = rnd(1, 9)`, donc « 12,5 cm » est tirable quand « 45,6 cm »
    ne l'est pas (partie entière > 20). */
const MULTI_CHIFFRES_VERS_LA_DROITE: Cas = {
	nom: '« 12,5 cm = ? mm »',
	unites: LONGUEURS,
	chiffres: ['0', '0', '0', '0', '1', '2', '5'],
	connue: 'cm',
	demandee: 'mm',
	// Premier chiffre en dm (4), réponse en mm (6) : gauche = min(4, 6) = 4.
	// Dernier chiffre de la donnée en mm (6) : droite = max(6, 6) = 6.
	zone: { gauche: 4, droite: 6 },
	donneeRangs: { gauche: 4, droite: 6 },
	donnee: '12,5 cm',
	enPlusPetiteUnite: 125,
	tire: "CM1 : cm↔mm `decimal: 'deux-sens'`, sens grande→petite",
};

/** La plus longue écriture de donnée que le catalogue produise : quatre rangs. Aucune paire
    ne traverse la tranche entière — la plus étendue est km↔m ou m↔mm, soit quatre colonnes —
    donc c'est ici que la phrase du critère 38 est la plus longue qu'elle sera jamais. C'est
    aussi le cas où elle enchaîne trois zéros, ce qui est précisément ce qu'on demande à
    l'enfant de comprendre. */
const QUATRE_RANGS: Cas = {
	nom: '« 3000 mm = ? m »',
	unites: LONGUEURS,
	chiffres: ['0', '0', '0', '3', '0', '0', '0'],
	connue: 'mm',
	demandee: 'm',
	// Premier chiffre en m (3), réponse en m : gauche = 3.
	// Dernier chiffre de la donnée en mm (6) : droite = max(6, 3) = 6.
	zone: { gauche: 3, droite: 6 },
	donneeRangs: { gauche: 3, droite: 6 },
	donnee: '3000 mm',
	enPlusPetiteUnite: 3000,
	tire: 'm↔mm entier, sens petite→grande (k × 1000)',
};

/** Donnée DÉCIMALE convertie vers la GAUCHE : le cas où les deux clauses de la règle tirent
    chacune d'un côté. 3,2 m s'écrit 3 en m et 2 en dm — la donnée déborde à DROITE de sa
    propre colonne — tandis que la réponse se lit en km, tout à GAUCHE. La zone doit couvrir
    les deux bouts : gauche = min(3, 0) = 0, droite = max(4, 0) = 4. Une règle qui n'aurait
    retenu que « de l'unité donnée à l'unité demandée » perdrait le 2 des décimètres, c'est-
    à-dire le seul chiffre qui distingue 3,2 m de 3 m.

    NON TIRÉ : une donnée décimale va toujours vers la PETITE unité (la branche décimale ne
    rend une grande unité à virgule que du côté RÉPONSE). Garde défensive, donc — mais elle
    tient le seul cas où `donneeRangs` déborde `zone` d'un côté et est débordé de l'autre. */
const DECIMAL_VERS_LA_GAUCHE: Cas = {
	nom: '« 3,2 m = ? km »',
	unites: LONGUEURS,
	chiffres: ['0', '0', '0', '3', '2', '0', '0'],
	connue: 'm',
	demandee: 'km',
	zone: { gauche: 0, droite: 4 },
	donneeRangs: { gauche: 3, droite: 4 },
	donnee: '3,2 m',
	enPlusPetiteUnite: 3200,
	tire: false,
};

/** Unités ADJACENTES, dans les deux sens. Même valeur, même ligne de chiffres, même zone :
    ce qui change est seulement lequel des deux rangs porte la réponse — et, pour la phrase,
    si la donnée tient sur une colonne ou sur deux. */
const ADJACENTES: Cas[] = [
	{
		// 5 dm = 50 cm. Premier chiffre en dm (4), réponse en cm (5) : [4, 5]. Le `0` des cm
		// est la réponse elle-même, donc exigé. La donnée « 5 dm », elle, tient sur un rang.
		nom: '« 5 dm = ? cm »',
		unites: LONGUEURS,
		chiffres: ['0', '0', '0', '0', '5', '0', '0'],
		connue: 'dm',
		demandee: 'cm',
		zone: { gauche: 4, droite: 5 },
		donneeRangs: { gauche: 4, droite: 4 },
		donnee: '5 dm',
		enPlusPetiteUnite: 500,
		tire: 'CE2 : dm↔cm entier, sens grande→petite',
	},
	{
		// 50 cm = 5 dm. Sens inverse : le `0` des cm est cette fois le dernier chiffre de la
		// DONNÉE, donc exigé pour la même raison que celui de « 60 mm = ? cm ». Zone [4, 5]
		// dans les deux sens, mais pas pour les mêmes motifs — et une phrase ici, pas là.
		nom: '« 50 cm = ? dm »',
		unites: LONGUEURS,
		chiffres: ['0', '0', '0', '0', '5', '0', '0'],
		connue: 'cm',
		demandee: 'dm',
		zone: { gauche: 4, droite: 5 },
		donneeRangs: { gauche: 4, droite: 5 },
		donnee: '50 cm',
		enPlusPetiteUnite: 500,
		tire: 'CE2 : dm↔cm entier, sens petite→grande',
	},
];

/** Même unité des deux côtés : la question dégénère, la règle doit quand même répondre. La
    transcription reste exigée (m, dm, cm), il n'y a simplement aucune conversion à lire. */
const MEME_UNITE: Cas = {
	nom: '« 456 cm = ? cm »',
	unites: LONGUEURS,
	chiffres: ['0', '0', '0', '4', '5', '6', '0'],
	connue: 'cm',
	demandee: 'cm',
	zone: { gauche: 3, droite: 5 },
	donneeRangs: { gauche: 3, droite: 5 },
	donnee: '456 cm',
	enPlusPetiteUnite: 4560,
	tire: false, // aucune relation ne relie une unité à elle-même
};

/** Donnée qui DÉBORDE la tranche à gauche : la colonne de tête absorbe les rangs supérieurs
    et porte deux chiffres, donc deux cases. Tout ce qui se compte en CASES change de valeur
    ici, alors que la zone, elle, se compte en COLONNES et ne bouge pas : [0, 3] comme pour
    « 3 km = ? m ». C'est le seul endroit où les deux unités de mesure du module se séparent,
    donc le seul endroit où une confusion entre elles se voit. */
const TETE_A_DEUX_CHIFFRES: Cas = {
	nom: '« 12 km = ? m »',
	unites: LONGUEURS,
	chiffres: ['12', '0', '0', '0', '0', '0', '0'],
	connue: 'km',
	demandee: 'm',
	zone: { gauche: 0, droite: 3 },
	donneeRangs: { gauche: 0, droite: 0 },
	donnee: '12 km',
	enPlusPetiteUnite: 12_000_000,
	tire: 'km↔m entier, sens grande→petite (maxBig 20, donc v ≥ 10 arrive)',
};

/** La même tête à deux chiffres, mais la donnée s'étend cette fois sur quatre rangs : c'est
    le seul cas qui montre la tête NOMMÉE dans la phrase. Une implémentation qui parcourrait
    les CASES au lieu des COLONNES dirait « 1 en km, 2 en km, 0 en hm… » — deux fois la même
    unité, et un rang de trop. */
const TETE_VERS_LA_GAUCHE: Cas = {
	nom: '« 12000 m = ? km »',
	unites: LONGUEURS,
	chiffres: ['12', '0', '0', '0', '0', '0', '0'],
	connue: 'm',
	demandee: 'km',
	// Premier chiffre dans la tête (0), réponse en km (0) : gauche = 0.
	// Dernier chiffre de la donnée en m (3) : droite = max(3, 0) = 3.
	zone: { gauche: 0, droite: 3 },
	donneeRangs: { gauche: 0, droite: 3 },
	donnee: '12000 m',
	enPlusPetiteUnite: 12_000_000,
	tire: 'km↔m entier, sens petite→grande (k × 1000, k ≥ 10)',
};

/** Toutes les questions du fichier. Les balayages les reprennent une à une. */
const TOUS: Cas[] = [
	...CAS,
	MULTI_CHIFFRES_VERS_LA_DROITE,
	QUATRE_RANGS,
	DECIMAL_VERS_LA_GAUCHE,
	...ADJACENTES,
	MEME_UNITE,
	TETE_A_DEUX_CHIFFRES,
	TETE_VERS_LA_GAUCHE,
];

/* ============================================================
   Outils de lecture des fixtures
   ============================================================ */

const colonnes = (cas: Cas): ColonneAttendue[] =>
	cas.unites.map((unite, i) => ({ unite, chiffres: cas.chiffres[i] }));

/** Une case du tableau : sa colonne, l'unité de cette colonne, le chiffre attendu. L'ordre
    est celui du rendu — colonne par colonne, et de gauche à droite dans la colonne de tête. */
interface Case {
	colonne: number;
	unite: string;
	attendu: string;
	obligatoire: boolean;
}

function casesDe(cas: Cas): Case[] {
	const out: Case[] = [];
	cas.chiffres.forEach((chiffres, colonne) => {
		for (const attendu of chiffres)
			out.push({
				colonne,
				unite: cas.unites[colonne],
				attendu,
				obligatoire: colonne >= cas.zone.gauche && colonne <= cas.zone.droite,
			});
	});
	return out;
}

/** Ce que l'enfant écrit quand il remplit TOUT, zéros facultatifs compris. */
const saisieComplete = (cas: Cas): string[] => casesDe(cas).map((c) => c.attendu);
/** Le minimum acceptable : la zone obligatoire, et rien d'autre. C'est la promesse de #711. */
const saisieMinimale = (cas: Cas): string[] =>
	casesDe(cas).map((c) => (c.obligatoire ? c.attendu : ''));
/** Un tableau auquel l'enfant n'a pas touché. */
const saisieVide = (cas: Cas): string[] => casesDe(cas).map(() => '');

/* ============================================================
   Détecteurs : les critères, écrits une fois
   ============================================================ */

const chiffreNonNul = (chiffres: string) => [...chiffres].some((c) => c !== '0');

/** Ce qu'une zone doit tenir, rendu en DÉFAUTS lisibles plutôt qu'en booléen : quand un
    balayage rougit, le message doit dire ce que l'enfant pourrait faire passer, pas « false ».
    Deux exigences disent ce que la zone doit contenir, deux ce qu'elle n'a pas le droit
    d'exiger en plus. */
function defautsDeZone(zone: { gauche: number; droite: number } | null, cas: Cas): string[] {
	if (zone === null) return [`${cas.nom} : aucune zone alors que les deux unités sont là`];
	const n = cas.unites.length;
	if (!Number.isInteger(zone.gauche) || !Number.isInteger(zone.droite))
		return [`${cas.nom} : bornes non entières (${zone.gauche}, ${zone.droite})`];
	if (zone.gauche < 0 || zone.droite >= n || zone.gauche > zone.droite)
		return [`${cas.nom} : bornes hors tableau ou inversées (${zone.gauche}, ${zone.droite})`];
	const out: string[] = [];
	const iDemandee = cas.unites.indexOf(cas.demandee);
	const iConnue = cas.unites.indexOf(cas.connue);
	const dedans = (i: number) => i >= zone.gauche && i <= zone.droite;

	// 1. La réponse se LIT quelque part : sa colonne ne peut pas être facultative, sinon
	//    l'enfant valide sans avoir jamais écrit son résultat.
	if (!dedans(iDemandee))
		out.push(
			`${cas.nom} : la colonne des ${cas.demandee}, celle où se lit la RÉPONSE, n'est pas exigée — l'enfant valide sans avoir écrit son résultat`,
		);
	// 2. La donnée se TRANSCRIT jusqu'à sa propre unité : c'est le `0` des millimètres de
	//    « 60 mm = ? cm », celui qui prouve que la conversion est passée par le tableau.
	if (!dedans(iConnue))
		out.push(
			`${cas.nom} : la colonne des ${cas.connue}, où se pose le dernier chiffre de la DONNÉE, n'est pas exigée — une conversion faite de tête passerait`,
		);
	// 3. Aucun chiffre significatif ne peut être laissé facultatif : une case omise vaudrait
	//    un rang perdu, donc une transcription fausse comptée juste.
	for (let i = 0; i < n; i++)
		if (!dedans(i) && chiffreNonNul(cas.chiffres[i]))
			out.push(
				`${cas.nom} : le chiffre ${cas.chiffres[i]} des ${cas.unites[i]} est hors zone — l'enfant pourrait l'omettre et être compté juste`,
			);
	// 4. Les bornes sont SERRÉES : une borne qui ne porte ni chiffre, ni la réponse, ni la
	//    donnée exige une case pour rien — le défaut d'origine, simplement rétréci.
	for (const [cote, i] of [
		['gauche', zone.gauche],
		['droite', zone.droite],
	] as const)
		if (i !== iDemandee && i !== iConnue && !chiffreNonNul(cas.chiffres[i]))
			out.push(
				`${cas.nom} : la borne ${cote} tombe sur les ${cas.unites[i]}, qui ne portent qu'un zéro sans rapport avec la question — une case exigée pour rien`,
			);
	return out;
}

/** Le verdict qu'une case DOIT recevoir, critères 30/31/32/36 réunis. Écrit à un seul
    endroit : le balayage, les témoins et les cas nommés lisent tous celui-ci. */
function verdictAttendu(c: Case, saisie: string): VerdictCase {
	if (c.obligatoire) return saisie === c.attendu ? 'juste' : 'faux';
	if (saisie === '') return 'neutre';
	return saisie === c.attendu ? 'juste' : 'faux';
}

/** Pourquoi ce verdict-là, dit du point de vue de l'enfant. Un échec doit nommer ce que le
    tableau lui ferait croire, pas afficher deux chaînes côte à côte. */
function raison(c: Case, saisie: string): string {
	if (c.obligatoire && saisie === '')
		return `critère 31 : case EXIGÉE laissée vide, elle doit être fausse et montrer son ${c.attendu}`;
	if (c.obligatoire && saisie !== c.attendu)
		return `critère 31 : case EXIGÉE portant ${saisie} au lieu de ${c.attendu}`;
	if (c.obligatoire) return 'case exigée, correctement remplie';
	if (saisie === '')
		return `critère 36 : case FACULTATIVE jamais remplie — ni ✓ ni ✗, poser une marque sur du vide dirait « tu as bon » sans dire de quoi`;
	if (saisie === c.attendu)
		return 'critère 30 : case facultative portant le zéro attendu — acceptée, jamais pénalisée';
	return `critère 32 : case FACULTATIVE portant ${saisie}, un chiffre qui n'a rien à faire là`;
}

/** Ce que la liste des verdicts doit tenir, case par case. */
function defautsDeVerdicts(verdicts: VerdictCase[], cas: Cas, saisies: string[]): string[] {
	const plan = casesDe(cas);
	if (verdicts.length !== plan.length)
		return [
			`${cas.nom} : ${verdicts.length} verdicts pour ${plan.length} cases — le décalage désaligne chaque marque de sa case, donc l'enfant lit le verdict du voisin`,
		];
	const out: string[] = [];
	plan.forEach((c, i) => {
		const saisie = i < saisies.length ? saisies[i] : '';
		const attendu = verdictAttendu(c, saisie);
		const tete = c.colonne === 0 && cas.chiffres[0].length > 1 ? ', colonne de tête' : '';
		if (verdicts[i] !== attendu)
			out.push(
				`${cas.nom} — case ${i} (${c.unite}${tete}), saisie « ${saisie} » : verdict « ${verdicts[i]} » au lieu de « ${attendu} » — ${raison(c, saisie)}`,
			);
	});
	return out;
}

/* ============================================================
   Garde-fou sur mes propres fixtures
   ============================================================ */

describe('#711 lot 5 — les fixtures disent bien ce que la question dit', () => {
	/** Les chiffres étalés un par colonne, la TÊTE absorbant les rangs supérieurs — refait ici
	    par un second chemin (découpage de l'écriture décimale) pour attraper une faute de frappe
	    dans les lignes de chiffres écrites plus haut. Sans lui, un `0` de trop rendrait TOUS les
	    attendus de ce fichier faux, sans rien de visible. */
	const etaler = (total: number, n: number): string[] => {
		const s = String(total).padStart(n, '0');
		return [s.slice(0, s.length - (n - 1)), ...s.slice(s.length - (n - 1)).split('')];
	};

	it('chaque ligne de chiffres correspond à la valeur de sa question', () => {
		const fautes: string[] = [];
		for (const cas of TOUS) {
			const refait = etaler(cas.enPlusPetiteUnite, cas.unites.length);
			if (refait.join('|') !== cas.chiffres.join('|'))
				fautes.push(
					`${cas.nom} : ${cas.chiffres.join(' ')} écrit à la main, ${refait.join(' ')} recalculé`,
				);
		}
		expect(fautes, `Fixtures fausses :\n${fautes.join('\n')}`).toEqual([]);
	});

	it('les deux unités de chaque question sont dans la tranche, et les zones respectent la règle', () => {
		for (const cas of TOUS) {
			expect(cas.unites, `${cas.nom} : unité donnée hors tranche`).toContain(cas.connue);
			expect(cas.unites, `${cas.nom} : unité demandée hors tranche`).toContain(cas.demandee);
			expect(defautsDeZone(cas.zone, cas), `${cas.nom} : ma propre zone viole la règle`).toEqual(
				[],
			);
		}
	});

	it('la zone est l’écriture de la donnée ÉTENDUE jusqu’à la colonne de la réponse', () => {
		/* La relation entre les deux champs, écrite une fois : elle empêche `donneeRangs` et
		   `zone` de dériver l'un de l'autre au fil des ajouts, et elle dit en une ligne ce que le
		   module doit faire de différent dans ses deux fonctions. */
		for (const cas of TOUS) {
			const iDemandee = cas.unites.indexOf(cas.demandee);
			expect({ ...cas.zone }, `${cas.nom} : zone et écriture de la donnée incohérentes`).toEqual({
				gauche: Math.min(cas.donneeRangs.gauche, iDemandee),
				droite: Math.max(cas.donneeRangs.droite, iDemandee),
			});
			// L'écriture de la donnée couvre tous ses chiffres significatifs, et s'étend au moins
			// jusqu'à l'unité dans laquelle la donnée est exprimée.
			for (let i = 0; i < cas.unites.length; i++)
				if (chiffreNonNul(cas.chiffres[i]))
					expect(
						i >= cas.donneeRangs.gauche && i <= cas.donneeRangs.droite,
						`${cas.nom} : le chiffre des ${cas.unites[i]} tombe hors de l’écriture de la donnée`,
					).toBe(true);
		}
	});

	it('« 12 km = ? m » compte bien une case de plus que de colonnes', () => {
		// La distinction colonnes / cases n'existe que là : autant vérifier que la fixture la
		// porte vraiment, sinon les tests de longueur ci-dessous ne prouvent rien.
		expect(casesDe(TETE_A_DEUX_CHIFFRES)).toHaveLength(8);
		expect(TETE_A_DEUX_CHIFFRES.unites).toHaveLength(7);
		expect(casesDe(CAS[0])).toHaveLength(7);
	});
});

/* ============================================================
   `indicesQuestion` et `bornesColonnes` — quelles colonnes la question met en jeu
   ------------------------------------------------------------
   Deux façons de désigner les MÊMES deux colonnes, et c'est tout le sujet : l'une les rend
   par RÔLE (la donnée, la demandée), l'autre par POSITION (gauche, droite). Rien, en aval,
   ne distingue une paire de l'autre — même forme, deux entiers, mêmes valeurs sur toutes les
   conversions vers la droite, c'est-à-dire sur la plupart des questions tirées. Une
   substitution ne se verrait donc que sur « 3 000 mg = ? kg », et seulement sur la tablette.
   Les tests qui suivent commencent par les SÉPARER.

   `bornesColonnes` était éprouvée dans `tests/tableau-cadrage.test.ts` jusqu'à ce que la
   fonction change de module ; ses attendus n'ont pas bougé. Ce qui l'a fait déménager : le
   cadrage a besoin des RÔLES (critère 25), pas des positions, et son seul appelant restant
   est `explicationRangVide` (src/ui/lecon-tableau.ts), qui nomme les rangs intermédiaires.
   ============================================================ */

/** Les deux tranches FIXES du CM1, réduites à ce que ces deux fonctions regardent : la suite
    des unités, sans les chiffres attendus. */
const RANGS_LONGUEURS = LONGUEURS.map((unite) => ({ unite }));
const RANGS_MASSES = ['kg', 'hg', 'dag', 'g', 'dg', 'cg', 'mg'].map((unite) => ({ unite }));

describe('#711 lot 5 — indicesQuestion : les deux colonnes PAR RÔLE', () => {
	it('« 3 km = ? m » : la donnée en tête, la demandée trois rangs plus loin', () => {
		expect(indicesQuestion(RANGS_LONGUEURS, 'km', 'm')).toEqual({ iDonnee: 0, iDemandee: 3 });
	});

	it('la conversion vers la GAUCHE inverse les deux index, là où l’intervalle ne bouge pas', () => {
		/* Le cas qui sépare les deux fonctions, et le seul. « 3 000 mg = ? kg » part de la
		   dernière colonne pour arriver à la première : les rôles sont inversés, l'intervalle est
		   identique. Un appelant qui prendrait `gauche` pour le point de départ cadrerait le
		   tableau sur les kilogrammes — c'est-à-dire sur la RÉPONSE, en laissant hors champ la
		   seule colonne que l'énoncé n'écrit nulle part (critère 25). */
		expect(indicesQuestion(RANGS_MASSES, 'mg', 'kg')).toEqual({ iDonnee: 6, iDemandee: 0 });
		expect(indicesQuestion(RANGS_MASSES, 'kg', 'mg')).toEqual({ iDonnee: 0, iDemandee: 6 });
		expect(
			bornesColonnes(RANGS_MASSES, 'mg', 'kg'),
			'les positions, elles, sont les mêmes dans les deux sens : c’est ce qui rend la substitution silencieuse',
		).toEqual(bornesColonnes(RANGS_MASSES, 'kg', 'mg'));
	});

	it('ce sont des index de COLONNE, jamais de case', () => {
		/* Sur « 12 km = ? m », la colonne de tête absorbe les rangs supérieurs et porte DEUX
		   cases : la colonne des mètres est la quatrième (index 3) alors que sa case est la
		   cinquième (index 4). Les appelants indexent des colonnes (`ex.colonnes`, les `.tc-col`
		   du rendu) ; un index de case ferait cadrer le tableau un rang trop loin, et nommerait
		   la mauvaise unité dans le retour de correction. */
		const cols = colonnes(TETE_A_DEUX_CHIFFRES);
		expect(cols[0].chiffres, 'la fixture doit bien porter une tête à deux chiffres').toHaveLength(
			2,
		);
		expect(indicesQuestion(cols, 'km', 'm')).toEqual({ iDonnee: 0, iDemandee: 3 });
		expect(casesDe(TETE_A_DEUX_CHIFFRES)).toHaveLength(8);
	});

	it('la même unité des deux côtés : une réponse DÉFINIE, les deux index confondus', () => {
		// « 3 m = ? m » n'est pas tiré, mais la fonction doit répondre : le contrat réserve
		// `null` à l'unité INTROUVABLE, et rendre `null` ici ferait retomber l'appelant sur
		// « je ne sais pas » là où la réponse est évidente.
		expect(indicesQuestion(RANGS_LONGUEURS, 'm', 'm')).toEqual({ iDonnee: 3, iDemandee: 3 });
	});

	it('une unité absente, ou aucune colonne : `null`, jamais un index inventé', () => {
		/* Le repli qui coûterait cher est `-1` rendu tel quel : `colonnes[-1]` vaut `undefined`,
		   et la chaîne continue jusqu'à un cadrage ou un verdict calculé sur une question qui
		   n'existe pas. `null` oblige l'appelant à s'arrêter. */
		expect(indicesQuestion(RANGS_LONGUEURS, 'L', 'km'), 'unité donnée hors tranche').toBeNull();
		expect(indicesQuestion(RANGS_LONGUEURS, 'km', 'L'), 'unité demandée hors tranche').toBeNull();
		expect(
			indicesQuestion(RANGS_LONGUEURS, 't', 'kg'),
			'deux unités d’une autre famille',
		).toBeNull();
		expect(
			indicesQuestion(RANGS_MASSES, 'm', 'g'),
			'une longueur dans le tableau des masses',
		).toBeNull();
		expect(indicesQuestion([], 'km', 'm'), 'aucune colonne').toBeNull();
	});

	it('contrat, sur toutes les paires des deux tranches : chaque index désigne l’unité de son RÔLE', () => {
		// 49 paires par tranche, la même unité des deux côtés comprise. Relire l'unité à l'index
		// rendu est le seul contrôle qui ne recopie aucune formule — et il fait tomber aussi bien
		// une réponse constante qu'une paire triée.
		const fautes: string[] = [];
		for (const rangs of [RANGS_LONGUEURS, RANGS_MASSES])
			for (const a of rangs)
				for (const b of rangs) {
					const q = indicesQuestion(rangs, a.unite, b.unite);
					if (q === null) {
						fautes.push(`${a.unite} → ${b.unite} : null alors que les deux unités sont là`);
						continue;
					}
					const lu = `${rangs[q.iDonnee]?.unite} → ${rangs[q.iDemandee]?.unite}`;
					if (lu !== `${a.unite} → ${b.unite}`)
						fautes.push(
							`${a.unite} → ${b.unite} : les index désignent « ${lu} » — la question posée n'est plus celle que l'enfant lit`,
						);
				}
		expect(fautes, `Rôles perdus :\n${fautes.join('\n')}`).toEqual([]);
	});
});

describe('#711 lot 5 — bornesColonnes : l’intervalle de la question', () => {
	it('« 3 km = ? m » : de la colonne km à la colonne m, colonnes intermédiaires comprises', () => {
		const b = bornesColonnes(RANGS_LONGUEURS, 'km', 'm');
		expect(b, '« 3 km = ? m » : aucun intervalle trouvé alors que les deux unités sont là').toEqual(
			{ gauche: 0, droite: 3 },
		);
		/* Ce que l'intervalle contient, et qui est sa raison d'être : les rangs que l'enfant doit
		   traverser. Ce sont ceux qu'`explicationRangVide` (src/ui/lecon-tableau.ts) nomme quand
		   il rappelle les 0 à poser, et ceux que le cadrage doit garder sous les yeux. */
		expect(RANGS_LONGUEURS.slice(b!.gauche + 1, b!.droite).map((c) => c.unite)).toEqual([
			'hm',
			'dam',
		]);
	});

	it('« 456 cm = ? m » : le SENS de la conversion ne change pas l’intervalle', () => {
		// `gauche` et `droite` sont des POSITIONS dans le tableau, pas des rôles : la même paire
		// d'unités donne le même intervalle dans les deux sens. C'est ce qui rend la substitution
		// possible — donc autant l'écrire noir sur blanc.
		expect(bornesColonnes(RANGS_LONGUEURS, 'cm', 'm')).toEqual({ gauche: 3, droite: 5 });
		expect(bornesColonnes(RANGS_LONGUEURS, 'm', 'cm')).toEqual({ gauche: 3, droite: 5 });
	});

	it('unités adjacentes : l’intervalle se réduit aux deux colonnes, sans rien entre elles', () => {
		for (const [connue, demandee] of [
			['cm', 'mm'],
			['mm', 'cm'],
		]) {
			const b = bornesColonnes(RANGS_LONGUEURS, connue, demandee);
			expect(b, `« ${connue} → ${demandee} »`).toEqual({ gauche: 5, droite: 6 });
			expect(
				RANGS_LONGUEURS.slice(b!.gauche + 1, b!.droite),
				`« ${connue} → ${demandee} » : une colonne intermédiaire inventée entre deux rangs voisins`,
			).toEqual([]);
		}
	});

	it('la même unité des deux côtés : une réponse DÉFINIE, l’intervalle d’une seule colonne', () => {
		// Une seule colonne, donc aucun rang intermédiaire — ce qu'`explicationRangVide` traduit
		// déjà par « rien à dire ».
		const b = bornesColonnes(RANGS_LONGUEURS, 'm', 'm');
		expect(b).toEqual({ gauche: 3, droite: 3 });
		expect(RANGS_LONGUEURS.slice(b!.gauche + 1, b!.droite)).toEqual([]);
	});

	it('une unité absente de la tranche : `null`, et surtout pas un intervalle inventé', () => {
		/* `explicationRangVide` traite déjà ce cas par un retour vide. Ici, un repli sur
		   { gauche: 0, droite: 0 } nommerait des rangs intermédiaires pris au hasard, et ferait
		   cadrer le tableau sur sa première colonne en silence : le bug d'origine, mais devenu
		   invisible parce qu'il aurait l'air d'une décision. */
		expect(
			bornesColonnes(RANGS_LONGUEURS, 't', 'kg'),
			'deux unités d’une autre famille',
		).toBeNull();
		expect(bornesColonnes(RANGS_LONGUEURS, 'km', 'L'), 'unité demandée hors tranche').toBeNull();
		expect(bornesColonnes(RANGS_LONGUEURS, 'L', 'km'), 'unité donnée hors tranche').toBeNull();
		expect(
			bornesColonnes(RANGS_MASSES, 'm', 'g'),
			'une longueur dans le tableau des masses',
		).toBeNull();
	});

	it('tableau vide : `null` (il n’y a aucune colonne à borner)', () => {
		expect(bornesColonnes([], 'm', 'm')).toBeNull();
		expect(bornesColonnes([], 'km', 'm')).toBeNull();
	});

	it('contrat, sur toutes les paires des deux tranches : gauche ≤ droite, et ce sont bien les deux unités de la question', () => {
		// Balayage : 49 paires par tranche. Une réponse constante (« toujours la première
		// colonne ») tombe ici, quelle que soit la constante.
		const fautes: string[] = [];
		for (const rangs of [RANGS_LONGUEURS, RANGS_MASSES]) {
			for (const a of rangs) {
				for (const b of rangs) {
					const r = bornesColonnes(rangs, a.unite, b.unite);
					if (r === null) {
						fautes.push(`${a.unite} → ${b.unite} : null alors que les deux unités sont là`);
						continue;
					}
					if (r.gauche > r.droite)
						fautes.push(`${a.unite} → ${b.unite} : gauche > droite (${r.gauche} > ${r.droite})`);
					if (r.gauche < 0 || r.droite >= rangs.length)
						fautes.push(`${a.unite} → ${b.unite} : index hors tableau (${r.gauche}, ${r.droite})`);
					else {
						const trouvees = new Set([rangs[r.gauche].unite, rangs[r.droite].unite]);
						const attendues = new Set([a.unite, b.unite]);
						if (![...attendues].every((u) => trouvees.has(u)) || trouvees.size !== attendues.size)
							fautes.push(
								`${a.unite} → ${b.unite} : l'intervalle désigne [${[...trouvees].join(', ')}] — les rangs nommés ne seraient pas ceux de la question`,
							);
					}
				}
			}
		}
		expect(fautes, `Paires mal bornées :\n${fautes.join('\n')}`).toEqual([]);
	});
});

/* ============================================================
   `zoneObligatoire`
   ============================================================ */

describe('#711 lot 5 — zoneObligatoire : ce que l’enfant doit écrire', () => {
	it('les cinq questions du tableau de l’issue', () => {
		const fautes: string[] = [];
		for (const cas of CAS) {
			const z = zoneObligatoire(colonnes(cas), cas.connue, cas.demandee);
			const lu = z === null ? 'null' : `[${cas.unites[z.gauche]} … ${cas.unites[z.droite]}]`;
			if (z === null || z.gauche !== cas.zone.gauche || z.droite !== cas.zone.droite)
				fautes.push(
					`${cas.nom} : zone ${lu} au lieu de [${cas.unites[cas.zone.gauche]} … ${cas.unites[cas.zone.droite]}]`,
				);
		}
		expect(fautes, `Zones fausses :\n${fautes.join('\n')}`).toEqual([]);
	});

	it('« 60 mm = ? cm » : deux colonnes, pas sept — et le `0` des mm en fait partie', () => {
		/* Le cas qui justifie tout le lot. Aujourd'hui l'enfant tape cinq zéros avant d'arriver à
		   sa question. Demain il tape deux chiffres — mais PAS un seul : n'exiger que la case des
		   cm reviendrait à valider « 60 mm, ça fait 6 », c'est-à-dire une conversion faite de
		   tête, que le tableau est justement là pour empêcher. */
		const cas = CAS[1];
		const z = zoneObligatoire(colonnes(cas), 'mm', 'cm');
		expect(z, 'aucune zone trouvée alors que les deux unités sont dans la tranche').not.toBeNull();
		expect(cas.unites.slice(z!.gauche, z!.droite + 1)).toEqual(['cm', 'mm']);
		expect(
			z!.droite,
			'le `0` des millimètres est un chiffre de la DONNÉE, pas de la réponse : le laisser facultatif laisse passer une conversion faite de tête',
		).toBe(cas.unites.indexOf('mm'));
	});

	it('« 5 m = ? km » : les zéros de tête sont exigés parce que la réponse se lit derrière eux', () => {
		// La clause « zéros à gauche du premier chiffre : non exigés » cède devant « jusqu'à la
		// colonne où se lit la réponse ». Une règle qui appliquerait la première sans la seconde
		// rendrait [m … m], et l'enfant n'écrirait jamais son résultat. Cf. le commentaire de la
		// fixture : aucune question tirée aujourd'hui ne produit une réponse < 1, donc ce test
		// est le seul endroit où cette clause est éprouvée.
		const cas = CAS[3];
		const z = zoneObligatoire(colonnes(cas), 'm', 'km');
		expect(cas.unites.slice(z!.gauche, z!.droite + 1)).toEqual(['km', 'hm', 'dam', 'm']);
	});

	it('« 12,5 cm = ? mm » : les chiffres à GAUCHE de l’unité de départ sont exigés aussi', () => {
		/* Le test qui distingue la règle de sa contrefaçon, sur une question réellement tirée.
		   « De l'unité donnée à l'unité demandée » rendrait [cm … mm] : l'enfant pourrait écrire
		   2 et 5, donc transcrire « 2,5 cm », et voir sa conversion validée. Ce sont les chiffres
		   de la donnée qui commandent, pas les deux unités de la question. */
		const cas = MULTI_CHIFFRES_VERS_LA_DROITE;
		const z = zoneObligatoire(colonnes(cas), 'cm', 'mm');
		expect(
			cas.unites.slice(z!.gauche, z!.droite + 1),
			'le 1 des décimètres ne peut pas être facultatif : l’omettre transcrit un autre nombre',
		).toEqual(['dm', 'cm', 'mm']);
		expect(defautsDeZone(z, cas)).toEqual([]);
	});

	it('donnée décimale convertie vers la GAUCHE : la zone couvre les deux bouts', () => {
		const cas = DECIMAL_VERS_LA_GAUCHE;
		const z = zoneObligatoire(colonnes(cas), cas.connue, cas.demandee);
		expect(
			cas.unites.slice(z!.gauche, z!.droite + 1),
			'« 3,2 m = ? km » : la zone doit aller de la colonne de la réponse (km) au dernier chiffre de la donnée (le 2 des dm)',
		).toEqual(['km', 'hm', 'dam', 'm', 'dm']);
		expect(defautsDeZone(z, cas)).toEqual([]);
	});

	it('unités adjacentes : deux colonnes, dans les deux sens', () => {
		for (const cas of ADJACENTES) {
			const z = zoneObligatoire(colonnes(cas), cas.connue, cas.demandee);
			expect(cas.unites.slice(z!.gauche, z!.droite + 1), cas.nom).toEqual(['dm', 'cm']);
		}
	});

	it('la même unité des deux côtés : une réponse DÉFINIE, la transcription reste exigée', () => {
		/* « 456 cm = ? cm » n'est tiré par aucune relation, mais la fonction doit répondre :
		   `null` est réservé à l'unité INTROUVABLE, et y retomber ferait juger le tableau comme
		   s'il n'y avait rien à exiger. */
		const z = zoneObligatoire(colonnes(MEME_UNITE), 'cm', 'cm');
		expect(z, 'la même unité des deux côtés ne rend pas `null`').not.toBeNull();
		expect(MEME_UNITE.unites.slice(z!.gauche, z!.droite + 1)).toEqual(['m', 'dm', 'cm']);

		// Valeur à un seul chiffre : la zone se réduit à la colonne où tout se joue.
		const unSeulChiffre: Cas = {
			...MEME_UNITE,
			nom: '« 3 m = ? m »',
			chiffres: ['0', '0', '0', '3', '0', '0', '0'],
			connue: 'm',
			demandee: 'm',
			zone: { gauche: 3, droite: 3 },
			donneeRangs: { gauche: 3, droite: 3 },
			donnee: '3 m',
			enPlusPetiteUnite: 3000,
		};
		expect(zoneObligatoire(colonnes(unSeulChiffre), 'm', 'm')).toEqual({ gauche: 3, droite: 3 });
	});

	it('donnée qui déborde la tranche à gauche : la zone reste comptée en COLONNES', () => {
		/* La colonne de tête porte « 12 », donc deux cases. La zone, elle, se compte en colonnes :
		   rendre 4 (le nombre de cases obligatoires) au lieu de 3 ferait exiger une colonne de
		   plus, en silence, et seulement sur les grandes valeurs. */
		for (const cas of [TETE_A_DEUX_CHIFFRES, TETE_VERS_LA_GAUCHE]) {
			const z = zoneObligatoire(colonnes(cas), cas.connue, cas.demandee);
			expect(z, cas.nom).toEqual({ gauche: 0, droite: 3 });
			expect(cas.unites.slice(z!.gauche, z!.droite + 1)).toEqual(['km', 'hm', 'dam', 'm']);
		}
	});

	it('une unité absente de la tranche : `null`, et surtout pas une zone inventée', () => {
		/* Un repli sur { gauche: 0, droite: 0 } n'exigerait qu'une case, tout en ayant l'air d'une
		   décision. L'enfant validerait un tableau presque vide. */
		const cols = colonnes(CAS[0]);
		expect(zoneObligatoire(cols, 't', 'kg'), 'deux unités d’une autre famille').toBeNull();
		expect(zoneObligatoire(cols, 'km', 'L'), 'unité demandée hors tranche').toBeNull();
		expect(zoneObligatoire(cols, 'L', 'km'), 'unité donnée hors tranche').toBeNull();
		expect(zoneObligatoire(cols, 'M', 'm'), 'la casse compte : « M » n’est pas « m »').toBeNull();
	});

	it('tranche vide : `null` (il n’y a aucune case à exiger)', () => {
		expect(zoneObligatoire([], 'm', 'm')).toBeNull();
		expect(zoneObligatoire([], 'mm', 'cm')).toBeNull();
	});

	it('contrat, sur toutes les questions : la réponse et la donnée sont exigées, rien de superflu', () => {
		const fautes: string[] = [];
		for (const cas of TOUS)
			fautes.push(...defautsDeZone(zoneObligatoire(colonnes(cas), cas.connue, cas.demandee), cas));
		expect(fautes, `Zones qui violent la règle :\n${fautes.join('\n')}`).toEqual([]);
	});
});

/* ============================================================
   `casesObligatoires` — la zone traduite en CASES
   ------------------------------------------------------------
   La zone se compte en COLONNES, le rendu et la saisie en CASES, et la colonne de tête peut
   en porter deux. Toute la fonction tient dans cette traduction, donc tout le risque aussi :
   un résultat à sept entrées là où le tableau en a huit décale chaque réponse d'un cran à
   partir de la tête, et l'enfant se voit exiger une case qu'il n'a pas à remplir, pendant
   que la dernière — celle de sa réponse — devient facultative.
   ============================================================ */

describe('#711 lot 5 — casesObligatoires : une réponse par CASE, pas par colonne', () => {
	it('« 60 mm = ? cm » : deux cases exigées sur sept', () => {
		// La promesse de #711, en un tableau : cinq cases de moins à remplir qu'avant. Les deux
		// qui restent sont le 6 des cm (la réponse) et le 0 des mm (le dernier chiffre de la
		// donnée, celui qui prouve que la conversion est passée par le tableau).
		expect(casesObligatoires(colonnes(CAS[1]), 'mm', 'cm')).toEqual([
			false,
			false,
			false,
			false,
			false,
			true,
			true,
		]);
	});

	it('« 3 km = ? m » : les quatre premières, et pas une de plus', () => {
		// Les trois zéros de hm, dam et m sont tout l'exercice ; dm, cm et mm sont à droite du
		// dernier chiffre de la donnée, donc facultatifs (personne n'écrit « 3000,000 »).
		expect(casesObligatoires(colonnes(CAS[0]), 'km', 'm')).toEqual([
			true,
			true,
			true,
			true,
			false,
			false,
			false,
		]);
	});

	it('colonne de tête à deux chiffres : huit réponses pour sept colonnes', () => {
		/* « 12 km = ? m » : la tête porte `12`, donc DEUX cases, toutes deux dans la zone. Une
		   implémentation qui répondrait par colonne rendrait sept entrées, et le rendu peindrait
		   l'exigence de la case des mètres sur celle des décimètres. */
		expect(casesObligatoires(colonnes(TETE_A_DEUX_CHIFFRES), 'km', 'm')).toEqual([
			true,
			true,
			true,
			true,
			true,
			false,
			false,
			false,
		]);
	});

	it('une unité introuvable : tout facultatif, et la LONGUEUR quand même conservée', () => {
		/* La tranche est alors mal formée, et c'est le catalogue qui est en faute, pas l'enfant :
		   rien ne lui est exigé. Mais le tableau se dessine quand même, donc la réponse doit
		   garder une entrée par case — un tableau plus court ferait lire `undefined` au rendu
		   pour les dernières, et `undefined` n'est pas `false`. */
		const r = casesObligatoires(colonnes(CAS[0]), 'km', 'L');
		expect(r).toHaveLength(casesDe(CAS[0]).length);
		expect(r.some(Boolean), 'une case exigée sur une question qu’on ne sait pas lire').toBe(false);
	});

	it('toutes les questions : une entrée par case, et la zone dérivée à la main', () => {
		const fautes: string[] = [];
		for (const cas of TOUS) {
			const r = casesObligatoires(colonnes(cas), cas.connue, cas.demandee);
			const attendu = casesDe(cas).map((c) => c.obligatoire);
			if (r.length !== attendu.length)
				fautes.push(`${cas.nom} : ${r.length} réponses pour ${attendu.length} cases`);
			else
				casesDe(cas).forEach((c, i) => {
					if (r[i] !== attendu[i])
						fautes.push(
							`${cas.nom} : la case ${i} (${c.attendu} dans les ${c.unite}) est rendue ${r[i] ? 'obligatoire' : 'facultative'} alors que la zone [${cas.unites[cas.zone.gauche]} … ${cas.unites[cas.zone.droite]}] la veut ${attendu[i] ? 'obligatoire' : 'facultative'}`,
						);
				});
		}
		expect(fautes, `Cases mal exigées :\n${fautes.join('\n')}`).toEqual([]);
	});
});

/* ============================================================
   `verdictsCases`
   ============================================================ */

describe('#711 lot 5 — verdictsCases : ce que chaque case reçoit', () => {
	it('un verdict par case, colonne de tête à deux chiffres comprise', () => {
		/* Le résultat est lu positionnellement par le rendu : une case de plus ou de moins et
		   chaque marque glisse d'un cran, si bien que l'enfant voit le ✗ de son voisin. */
		for (const cas of TOUS) {
			const attendu = casesDe(cas).length;
			for (const saisies of [saisieComplete(cas), saisieMinimale(cas), saisieVide(cas)])
				expect(
					verdictsCases(colonnes(cas), cas.connue, cas.demandee, saisies).length,
					`${cas.nom} : verdicts désalignés des cases`,
				).toBe(attendu);
		}
		expect(
			verdictsCases(
				colonnes(TETE_A_DEUX_CHIFFRES),
				'km',
				'm',
				saisieComplete(TETE_A_DEUX_CHIFFRES),
			),
			'« 12 km = ? m » : 8 cases pour 7 colonnes',
		).toHaveLength(8);
	});

	it('tableau rempli entièrement et exactement : aucune case fausse', () => {
		for (const cas of TOUS) {
			const v = verdictsCases(colonnes(cas), cas.connue, cas.demandee, saisieComplete(cas));
			expect(v, `${cas.nom} : une case exacte comptée fausse`).not.toContain('faux');
			expect(v, `${cas.nom} : une case remplie et exacte doit porter son ✓`).toEqual(
				casesDe(cas).map(() => 'juste'),
			);
		}
	});

	it('LA promesse de #711 : la zone seule suffit, le reste laissé vide ne coûte rien', () => {
		/* « 60 mm = ? cm » rempli de deux chiffres. Aujourd'hui ce tableau est refusé ; demain il
		   est juste. C'est la raison d'être du lot, donc le test à lire en premier. */
		const cas = CAS[1];
		const v = verdictsCases(colonnes(cas), 'mm', 'cm', saisieMinimale(cas));
		expect(v, 'les deux chiffres écrits doivent porter leur ✓, les cinq cases vides rien').toEqual([
			'neutre',
			'neutre',
			'neutre',
			'neutre',
			'neutre',
			'juste',
			'juste',
		]);

		for (const autre of TOUS) {
			const minimal = verdictsCases(
				colonnes(autre),
				autre.connue,
				autre.demandee,
				saisieMinimale(autre),
			);
			expect(minimal, `${autre.nom} : la zone seule est refusée`).not.toContain('faux');
		}
	});

	it('critère 31 : une case EXIGÉE laissée vide est fausse', () => {
		// Le `0` des millimètres de « 60 mm = ? cm », effacé. L'enfant a « 6 » en cm et rien en
		// mm : sa réponse a l'air bonne, mais il n'a pas transcrit sa donnée.
		const cas = CAS[1];
		const saisies = saisieMinimale(cas);
		saisies[6] = '';
		const v = verdictsCases(colonnes(cas), 'mm', 'cm', saisies);
		expect(v[6], 'la case des mm, vide alors qu’elle est exigée, doit être fausse').toBe('faux');
		expect(v[5], 'la case des cm, elle, est juste : le verdict est par case, pas global').toBe(
			'juste',
		);
	});

	it('critère 31 : une case EXIGÉE mal remplie est fausse', () => {
		const cas = CAS[2]; // « 456 cm = ? m »
		const saisies = saisieMinimale(cas);
		saisies[4] = '4'; // les dm portent 5, pas 4
		const v = verdictsCases(colonnes(cas), 'cm', 'm', saisies);
		expect(v[4], 'un chiffre faux dans la zone doit être faux').toBe('faux');
		expect(v[3], 'ses voisines justes ne doivent pas être entraînées').toBe('juste');
		expect(v[5]).toBe('juste');
	});

	it('critère 32 : hors zone, un `0` est juste mais un chiffre non nul est faux', () => {
		/* La même case, à un chiffre près. C'est la distinction qui empêche « hors zone » de
		   vouloir dire « on ne regarde pas » : un 7 dans la colonne des kilomètres n'est pas une
		   écriture décimale tolérable, c'est une erreur de rang, et elle doit se voir. */
		const cas = CAS[1]; // « 60 mm = ? cm », zone [cm … mm]
		const cols = colonnes(cas);

		const avecZero = saisieMinimale(cas);
		avecZero[0] = '0';
		expect(
			verdictsCases(cols, 'mm', 'cm', avecZero)[0],
			'un zéro écrit hors zone est une écriture correcte, jamais une faute',
		).toBe('juste');

		const avecSept = saisieMinimale(cas);
		avecSept[0] = '7';
		expect(
			verdictsCases(cols, 'mm', 'cm', avecSept)[0],
			'7 kilomètres n’ont rien à faire dans « 60 mm » : erreur de rang, elle doit se voir',
		).toBe('faux');

		// Et le tableau entièrement rempli de zéros facultatifs reste juste de bout en bout.
		expect(verdictsCases(cols, 'mm', 'cm', saisieComplete(cas))).not.toContain('faux');
	});

	it('critère 36 : une case jamais remplie hors zone ne reçoit NI ✓ NI ✗', () => {
		/* Le piège du lot. Le critère 30 dit que cette case ne coûte rien, le 36 dit qu'elle ne
		   porte pas de marque : la marquer `juste` satisferait l'addition et tromperait l'enfant,
		   à qui on afficherait un ✓ sur une case qu'il n'a jamais touchée. */
		const cas = CAS[0]; // « 3 km = ? m », zone [km … m]
		const v = verdictsCases(colonnes(cas), 'km', 'm', saisieMinimale(cas));
		expect(v.slice(4), 'dm, cm et mm sont vides et facultatifs : rien à annoncer').toEqual([
			'neutre',
			'neutre',
			'neutre',
		]);
		expect(v.slice(0, 4)).toEqual(['juste', 'juste', 'juste', 'juste']);
	});

	it('tableau entièrement vide : tout ce qui est exigé est faux, le reste est muet', () => {
		for (const cas of TOUS) {
			const v = verdictsCases(colonnes(cas), cas.connue, cas.demandee, saisieVide(cas));
			expect(
				v,
				`${cas.nom} : un tableau auquel l’enfant n’a pas touché doit montrer chaque case manquante, et rien d’autre`,
			).toEqual(casesDe(cas).map((c) => (c.obligatoire ? 'faux' : 'neutre')));
		}
	});

	it('`saisies` trop court : une case absente vaut une case VIDE', () => {
		/* Le runner peut passer une liste tronquée (cases pas encore montées, mode qui n'en rend
		   qu'une partie). La longueur du RÉSULTAT ne doit pas suivre celle de l'entrée, sinon le
		   rendu se décale ; et une case dont on n'a rien reçu est une case que l'enfant n'a pas
		   remplie — pas une case à juger juste par défaut. */
		const cas = CAS[2]; // « 456 cm = ? m »
		const cols = colonnes(cas);
		const tronque = saisieComplete(cas).slice(0, 4);
		const rembourre = [...tronque, '', '', ''];

		const v = verdictsCases(cols, 'cm', 'm', tronque);
		expect(
			v,
			'la liste de verdicts doit couvrir TOUTES les cases, pas seulement celles reçues',
		).toHaveLength(casesDe(cas).length);
		expect(v, 'une case absente ne se comporte pas comme une case vide').toEqual(
			verdictsCases(cols, 'cm', 'm', rembourre),
		);
		expect(v[5], 'la case des cm, exigée et non reçue, doit être fausse').toBe('faux');

		// Cas extrême : aucune saisie du tout.
		expect(verdictsCases(cols, 'cm', 'm', [])).toEqual(
			verdictsCases(cols, 'cm', 'm', saisieVide(cas)),
		);
	});

	it('`saisies` trop long : les entrées en trop sont ignorées', () => {
		const cas = CAS[2];
		const cols = colonnes(cas);
		const complet = saisieComplete(cas);
		const v = verdictsCases(cols, 'cm', 'm', [...complet, '9', '9']);
		expect(v, 'une entrée surnuméraire ne crée pas de case').toHaveLength(casesDe(cas).length);
		expect(v).toEqual(verdictsCases(cols, 'cm', 'm', complet));
	});

	it('une unité introuvable : on ne déclare fausse aucune case', () => {
		/* Sans les deux unités, la zone n'existe pas (`zoneObligatoire` rend `null`). Aucun
		   critère ne dit quoi faire alors ; la raison de ce choix, puisqu'elle n'est écrite nulle
		   part ailleurs : une tranche mal formée vient du CATALOGUE, pas de l'enfant. Marquer des
		   cases fausses lui ferait payer un défaut de données, et le masquerait du même coup — un
		   tableau plein de ✗ ressemble à un enfant qui s'est trompé, pas à une leçon cassée. La
		   longueur, elle, reste due : c'est elle qui tient l'alignement du rendu. */
		const cas = CAS[0];
		const cols = colonnes(cas);
		const v = verdictsCases(cols, 'L', 'm', saisieVide(cas));
		expect(v, 'la longueur du résultat ne dépend pas de la question').toHaveLength(
			casesDe(cas).length,
		);
		expect(v, 'aucune case ne peut être exigée quand on ignore ce qui est demandé').not.toContain(
			'faux',
		);
	});

	it('balayage : toutes les questions, tous les motifs de remplissage', () => {
		/* Sept motifs par question, dont ceux qu'un enfant produit vraiment : le minimum, le
		   tout-rempli, le tout-vide, l'oubli d'un rang, le chiffre égaré hors zone. Une
		   implémentation qui traiterait « hors zone » comme « on ne regarde pas » tombe ici. */
		const fautes: string[] = [];
		for (const cas of TOUS) {
			const plan = casesDe(cas);
			const motifs: { quoi: string; saisies: string[] }[] = [
				{ quoi: 'tout rempli', saisies: saisieComplete(cas) },
				{ quoi: 'la zone seule', saisies: saisieMinimale(cas) },
				{ quoi: 'rien du tout', saisies: saisieVide(cas) },
				{
					quoi: 'la zone laissée vide, le reste rempli',
					saisies: saisieComplete(cas).map((s, i) => (plan[i].obligatoire ? '' : s)),
				},
				{
					quoi: 'un chiffre égaré dans chaque case facultative',
					saisies: saisieMinimale(cas).map((s, i) => (plan[i].obligatoire ? s : '7')),
				},
				{
					quoi: 'des zéros partout hors zone',
					saisies: saisieMinimale(cas).map((s, i) => (plan[i].obligatoire ? s : '0')),
				},
				{
					quoi: 'tout rempli, les chiffres de la zone faux',
					saisies: saisieComplete(cas).map((s, i) =>
						plan[i].obligatoire ? (s === '9' ? '8' : '9') : s,
					),
				},
			];
			for (const { quoi, saisies } of motifs) {
				const v = verdictsCases(colonnes(cas), cas.connue, cas.demandee, saisies);
				for (const d of defautsDeVerdicts(v, cas, saisies)) fautes.push(`[${quoi}] ${d}`);
			}
		}
		expect(fautes, `Verdicts fautifs :\n${fautes.join('\n')}`).toEqual([]);
	});
});

/* ============================================================
   `ecritureAttendue` — critère 38
   ============================================================ */

/** Les couples « chiffre, colonne » que la phrase énonce, dans l'ordre où elle les énonce.
    La FORME « 6 dans les cm » est celle du module (avis `redacteur-contenu-francais` du
    30/09 : « 6 en cm » se lit « 6, converti en cm », puisque « en » porte déjà ce sens dans
    tout l'exercice, alors que « dans les cm » désigne la COLONNE). Ce qui est éprouvé ici,
    c'est QUELS rangs sont nommés, avec quels chiffres, et dans quel ordre. */
function rangsNommes(phrase: string): string[] {
	return [...phrase.matchAll(/(\d+)\s+dans\s+les\s+([a-zA-Z]+)/gu)].map(
		(m) => `${m[1]} dans les ${m[2]}`,
	);
}

/** Les rangs que la phrase DOIT énoncer : ceux de l'écriture de la donnée, et eux seuls. */
function rangsAttendus(cas: Cas): string[] {
	return cas.unites
		.map((unite, i) => ({ unite, chiffres: cas.chiffres[i], i }))
		.filter((c) => c.i >= cas.donneeRangs.gauche && c.i <= cas.donneeRangs.droite)
		.map((c) => `${c.chiffres} dans les ${c.unite}`);
}

/** Ce que la phrase doit dire de la question : la donnée, puis chaque rang de son écriture,
    une fois, dans l'ordre du tableau — et rien d'autre. Quand la donnée tient sur un seul
    rang, la phrase entière doit disparaître. */
function defautsDeLaPhrase(phrase: string, cas: Cas): string[] {
	const out: string[] = [];
	const attendus = rangsAttendus(cas);
	if (attendus.length < 2) {
		if (phrase !== '')
			out.push(
				`${cas.nom} : la donnée tient sur le seul rang des ${cas.unites[cas.donneeRangs.gauche]}, il n'y a donc rien à décomposer — mais la phrase dit « ${phrase} », ce que l'énoncé a déjà dit`,
			);
		return out;
	}
	const trouves = rangsNommes(phrase);
	if (trouves.join(', ') !== attendus.join(', '))
		out.push(
			`${cas.nom} : la phrase énonce « ${trouves.join(', ')} » là où l'écriture de la donnée est « ${attendus.join(', ')} » — elle doit nommer les rangs de la DONNÉE, tous, dans l'ordre du tableau, et aucun rang qui n'y est que pour la réponse`,
		);
	const ouEstLaDonnee = phrase.indexOf(cas.donnee);
	if (ouEstLaDonnee < 0)
		out.push(
			`${cas.nom} : la phrase ne reprend pas la donnée « ${cas.donnee} » — l'enfant ne sait pas de quel nombre on lui parle`,
		);
	else if (trouves.length > 0 && ouEstLaDonnee > phrase.search(/\d+\s+dans\s+les\s+[a-zA-Z]+/u))
		out.push(`${cas.nom} : la phrase décompose avant d'avoir nommé « ${cas.donnee} »`);
	// Ni majuscule initiale ni point final : le runner la compose avec ce qui la précède
	// (« Tes chiffres sont bons, mais il en manquait un : <phrase>. »). Une phrase qui se
	// ponctuerait elle-même produirait « … : Pour 60 mm, il fallait… .. » à l'écran.
	if (/^[A-ZÀ-Þ]/u.test(phrase))
		out.push(
			`${cas.nom} : la phrase commence par une majuscule alors qu'elle est insérée après « : » dans la phrase du runner`,
		);
	if (/[.!?]$/u.test(phrase))
		out.push(
			`${cas.nom} : la phrase se termine par un point alors que le runner en ajoute un après elle`,
		);
	for (const faute of apostrophesCourbes(phrase))
		out.push(
			`${cas.nom} : apostrophe courbe dans « ${faute} » — la convention du projet est l'apostrophe droite`,
		);
	for (const faute of vouvoiements(phrase))
		out.push(`${cas.nom} : vouvoiement dans « ${faute} » — l'appli parle À l'enfant`);
	for (const faute of signesCites(phrase))
		out.push(`${cas.nom} : signe cité au lieu d'être nommé dans « ${faute} » — muet au TTS`);
	return out;
}

describe('#711 lot 5 — ecritureAttendue : ce que la donnée VAUT, pas ce qu’il faut écrire', () => {
	it('le cas du critère 38, mot pour mot', () => {
		/* L'issue écrivait « Ici, 60 mm s'écrit 6 en cm et 0 en mm » ; la tournure a changé après
		   relecture (avis `redacteur-contenu-francais` du 30/09), et les deux raisons méritent
		   d'être relues avant qu'on y revienne :
		   - « 60 mm s'écrit 6 en cm » affirme quelque chose sur le NOMBRE, et c'est faux : ce qui
		     s'écrit ainsi, c'est la ligne du tableau. D'où le geste, au passé — « il fallait
		     écrire » — accordé sur « la virgule allait après les millimètres » ;
		   - « en cm » se lit « converti en cm », puisque « en » porte déjà ce sens dans tout
		     l'exercice ; « dans les cm » désigne la colonne.
		   Ce qui NE change pas : les symboles d'unité, gardés contre les noms entiers (rejet
		   écrit dans la JSDoc du module). La phrase reste sans majuscule ni point final, parce
		   que le runner la compose après « … il en manquait un : ». */
		expect(ecritureAttendue(colonnes(CAS[1]), 'mm', 'cm')).toBe(
			'pour 60 mm, il fallait écrire 6 dans les cm et 0 dans les mm',
		);
	});

	it('les trois écritures de référence, mot pour mot', () => {
		// Deux, trois, puis quatre rangs : la forme de l'énumération (virgules puis « et ») se
		// décline sur les trois longueurs que le catalogue produit.
		expect(ecritureAttendue(colonnes(CAS[2]), 'cm', 'm')).toBe(
			'pour 456 cm, il fallait écrire 4 dans les m, 5 dans les dm et 6 dans les cm',
		);
		expect(ecritureAttendue(colonnes(QUATRE_RANGS), 'mm', 'm')).toBe(
			'pour 3000 mm, il fallait écrire 3 dans les m, 0 dans les dm, 0 dans les cm et 0 dans les mm',
		);
		expect(ecritureAttendue(colonnes(MULTI_CHIFFRES_VERS_LA_DROITE), 'cm', 'mm')).toBe(
			'pour 12,5 cm, il fallait écrire 1 dans les dm, 2 dans les cm et 5 dans les mm',
		);
	});

	it('elle s’insère dans la phrase du runner : ni majuscule initiale, ni point final', () => {
		/* Le runner compose « Tes chiffres sont bons, mais il en manquait un : <phrase>. » Une
		   majuscule après le deux-points, ou un point que le runner doublerait, se verraient à
		   l'écran de l'enfant et nulle part ailleurs — c'est le genre de défaut qu'aucune
		   assertion sur le CONTENU n'attrape. */
		for (const cas of TOUS) {
			const phrase = ecritureAttendue(colonnes(cas), cas.connue, cas.demandee);
			if (phrase === '') continue;
			expect(phrase[0], `${cas.nom} : « ${phrase} » commence par une majuscule`).toBe(
				phrase[0].toLowerCase(),
			);
			expect(phrase.endsWith('.'), `${cas.nom} : « ${phrase} » se ponctue elle-même`).toBe(false);
		}
	});

	it('la phrase suit la DONNÉE, pas la zone : elle ne nomme aucun rang ajouté pour la réponse', () => {
		/* La correction de spec, en un test. Sur « 5 m = ? km » la zone couvre km, hm, dam et m,
		   mais l'écriture de la donnée tient sur le seul rang des mètres : « il fallait écrire 0
		   dans les km, 0 dans les hm, 0 dans les dam et 5 dans les m » décrirait la LIGNE du
		   tableau, pas le nombre. La phrase disparaît donc entièrement.

		   Même chose sur « 3,2 m = ? km », où la donnée s'écrit sur deux rangs au milieu d'une
		   zone qui en compte cinq : c'est le cas qui montre que la phrase ne se contente pas de
		   raccourcir la zone d'un côté. */
		expect(ecritureAttendue(colonnes(CAS[3]), 'm', 'km')).toBe('');
		expect(ecritureAttendue(colonnes(DECIMAL_VERS_LA_GAUCHE), 'm', 'km')).toBe(
			'pour 3,2 m, il fallait écrire 3 dans les m et 2 dans les dm',
		);
	});

	it('elle ne recouvre pas `explicationRangVide` : sur « 3 km = ? m », rien à dire', () => {
		/* Le rang vide oublié — le `0` des hectomètres — est le défaut typique de cette question,
		   et c'est `explicationRangVide` (src/ui/lecon-tableau.ts) qui le nomme, avec « Pense au 0
		   de l'unité intermédiaire ». La donnée « 3 km », elle, tient sur une colonne : la
		   décomposer ne dirait rien que l'énoncé n'ait dit. Deux messages complémentaires, et
		   l'enfant n'en lit jamais deux qui disent la même chose. */
		expect(ecritureAttendue(colonnes(CAS[0]), 'km', 'm')).toBe('');
		expect(ecritureAttendue(colonnes(ADJACENTES[0]), 'dm', 'cm')).toBe('');
	});

	it('toutes les questions : la phrase nomme les rangs de la donnée, tous, et aucun autre', () => {
		const fautes: string[] = [];
		for (const cas of TOUS)
			fautes.push(
				...defautsDeLaPhrase(ecritureAttendue(colonnes(cas), cas.connue, cas.demandee), cas),
			);
		expect(fautes, `Phrases fautives :\n${fautes.join('\n')}`).toEqual([]);
	});

	it('donnée décimale : la virgule de l’énoncé se retrouve dans la phrase', () => {
		// « pour 3,2 cm, il fallait écrire 3 dans les cm et 2 dans les mm ». Une phrase qui
		// dirait « 32 cm » citerait un nombre que l'enfant n'a jamais lu.
		const phrase = ecritureAttendue(colonnes(CAS[4]), 'cm', 'mm');
		expect(phrase).toContain('3,2 cm');
		expect(phrase).toBe('pour 3,2 cm, il fallait écrire 3 dans les cm et 2 dans les mm');
		expect(rangsNommes(phrase)).toEqual(['3 dans les cm', '2 dans les mm']);
	});

	it('colonne de tête à deux chiffres : elle est nommée d’un seul tenant', () => {
		/* « 12 dans les km », pas « 1 dans les km et 2 dans les km » : la tête absorbe les rangs
		   supérieurs, et une
		   implémentation qui parcourrait les CASES au lieu des COLONNES la couperait en deux,
		   nommant deux fois la même unité. Le cas symétrique — « 12 km = ? m », où la donnée tient
		   sur la seule tête — est tenu par le test des rangs uniques : la même découpe y
		   produirait deux rangs là où la phrase doit être vide. */
		expect(ecritureAttendue(colonnes(TETE_VERS_LA_GAUCHE), 'm', 'km')).toBe(
			'pour 12000 m, il fallait écrire 12 dans les km, 0 dans les hm, 0 dans les dam et 0 dans les m',
		);
		expect(ecritureAttendue(colonnes(TETE_A_DEUX_CHIFFRES), 'km', 'm')).toBe('');
	});

	it('une unité introuvable, ou aucune colonne : chaîne vide', () => {
		// Il n'y a pas d'écriture attendue à nommer quand on ignore la question. Une phrase
		// tronquée (« il fallait écrire dans les ») s'afficherait, elle, telle quelle sous les
		// yeux de l'enfant.
		expect(ecritureAttendue(colonnes(CAS[0]), 'L', 'm')).toBe('');
		expect(ecritureAttendue(colonnes(CAS[0]), 'km', 'L')).toBe('');
		expect(ecritureAttendue([], 'm', 'cm')).toBe('');
	});

	it('la phrase reste courte : quatre rangs au plus, parce que le catalogue n’en produit pas plus', () => {
		/* Borne justifiée par les relations de `CONFIG_LONGUEURS`, pas par une préférence : aucune
		   paire ne traverse la tranche entière, la plus étendue étant km↔m ou m↔mm, soit quatre
		   colonnes. Une phrase à sept rangs n'est donc pas « longue », elle est le signe que la
		   fonction a parcouru le tableau au lieu de la donnée.

		   Ce que ce test ne dit pas : si une relation à sept rangs était ajoutée un jour, il
		   rougirait — et ce serait la bonne réaction. C'est la FORME de la phrase qu'il faudrait
		   alors revoir, pas la borne qu'il faudrait relever. */
		for (const cas of TOUS) {
			const rangs = rangsNommes(ecritureAttendue(colonnes(cas), cas.connue, cas.demandee));
			expect(rangs.length, `${cas.nom} : ${rangs.length} rangs énumérés`).toBeLessThanOrEqual(4);
			if (rangs.length > 0)
				expect(
					rangs.length,
					`${cas.nom} : un seul rang énuméré — une décomposition à un terme ne décompose rien`,
				).toBeGreaterThanOrEqual(2);
		}
	});
});

/* ============================================================
   `saisiesPourJournal` — critère 34 : ce que le PARENT relit
   ------------------------------------------------------------
   « Le journal encadrant reçoit la réponse telle que l'écran l'affichait, les cases vides
   hors zone valant zéro. Échec : le parent lit 300 là où l'enfant avait laissé des cases
   vides. »

   Une case vide n'est pas un zéro, et la nuance décide de ce que le parent lit. Hors de la
   question, le vide VAUT zéro — l'enfant avait le droit de ne rien y écrire, et c'est bien
   zéro que le tableau montre. Dans la question, non : relire « 3 km = ? m » comme « 3000 m »
   alors que l'enfant n'a écrit que le 3 afficherait au parent la BONNE réponse sous un
   tableau rouge.

   Ce qui est éprouvé ici, c'est la COMPOSITION avec `nombreTableauSaisi`
   (src/core/erreur-representation.ts), parce que c'est elle qui porte le risque : prises
   séparément, les deux fonctions ont l'air inoffensives. Le second nettoie les zéros sans
   valeur des deux bouts (« 000300,0 » → « 300 »), si bien qu'un trou rendu par un `0`
   disparaîtrait purement et simplement de la ligne que le parent lit.
   ============================================================ */

/** Les saisies relues pour le journal, puis le nombre que le runner en tire dans l'unité
    demandée — l'enchaînement exact de `verifier()` (src/ui/lecon-tableau.ts), virgule libre
    mise à part. */
function reluParLeParent(cas: Cas, saisies: string[]): string {
	const pourJournal = saisiesPourJournal(colonnes(cas), cas.connue, cas.demandee, saisies);
	return nombreTableauSaisi(
		casesDe(cas).map((c, i) => ({ unite: c.unite, valeur: pourJournal[i] })),
		cas.demandee,
	);
}

describe('#711 lot 5 — saisiesPourJournal : le parent ne lit jamais une réponse que l’enfant n’a pas écrite', () => {
	it('« 60 mm = ? cm », seul le 6 saisi : zéro hors de la question, un trou dans les mm', () => {
		/* Les cinq colonnes des km aux dm sont hors zone : l'enfant avait le droit de les laisser
		   vides, et c'est bien zéro que le tableau montre. La case des mm, elle, est exigée — son
		   0 est le dernier chiffre de la DONNÉE — donc son vide est un trou. */
		expect(saisiesPourJournal(colonnes(CAS[1]), 'mm', 'cm', ['', '', '', '', '', '6', ''])).toEqual(
			['0', '0', '0', '0', '0', '6', TROU],
		);
	});

	it('« 60 mm = ? cm » : sans le trou, le parent lirait la BONNE réponse sous un tableau rouge', () => {
		/* 6 cm est la réponse attendue. Le trou tombe en DERNIÈRE position, là où
		   `nombreTableauSaisi` retire les zéros de queue : rendu par un `0`, il serait effacé et
		   la ligne du journal deviendrait « 6 cm », c'est-à-dire un sans-faute. Le parent
		   chercherait alors ce que son enfant a raté. */
		const lu = reluParLeParent(CAS[1], ['', '', '', '', '', '6', '']);
		expect(lu, 'le journal affiche la réponse juste alors que le tableau était incomplet').not.toBe(
			'6',
		);
		expect(lu).toContain(TROU);
		expect(lu).toBe(`6,${TROU}`);
	});

	it('« 3 km = ? m », seul le 3 saisi : le journal ne dit pas 3000', () => {
		/* Le cas nommé par la relecture. Les trois zéros de hm, dam et m sont exigés — ils sont
		   tout l'exercice — et l'enfant ne les a pas écrits. Les rendre par des `0` ferait lire
		   « 3000 m » au parent : la bonne réponse, exactement, alors que l'écran était rouge. */
		expect(saisiesPourJournal(colonnes(CAS[0]), 'km', 'm', ['3', '', '', '', '', '', ''])).toEqual([
			'3',
			TROU,
			TROU,
			TROU,
			'0',
			'0',
			'0',
		]);
		const lu = reluParLeParent(CAS[0], ['3', '', '', '', '', '', '']);
		expect(lu, 'le parent lit la réponse attendue là où trois rangs manquaient').not.toBe('3000');
		expect(lu).toBe(`3${TROU}${TROU}${TROU}`);
	});

	it('« 456 cm = ? m », seul le 4 saisi : le trou survit au nettoyage des zéros des deux bouts', () => {
		/* Les zéros de tête (km, hm, dam) sont hors zone et disparaissent à la lecture, comme
		   dans tout nombre — mais les deux rangs manquants, eux, restent visibles de part et
		   d'autre de la virgule. Une marque faite d'un chiffre serait avalée par l'un ou l'autre
		   des deux nettoyages. */
		expect(reluParLeParent(CAS[2], ['', '', '', '4', '', '', ''])).toBe(`4,${TROU}${TROU}`);
	});

	it('un chiffre écrit HORS de la question n’est jamais remplacé par un zéro', () => {
		/* Le 7 des centimètres est une vraie erreur — l'enfant a posé un chiffre dans un rang qui
		   n'en attendait pas — et c'est précisément ce que le parent doit voir. L'écraser au
		   prétexte que la colonne est facultative rendrait « 3000 m », donc un sans-faute sous un
		   tableau rouge : le même piège que les cases vides, par l'autre bout. */
		const saisies = ['3', '0', '0', '0', '', '7', ''];
		expect(saisiesPourJournal(colonnes(CAS[0]), 'km', 'm', saisies)[5]).toBe('7');
		expect(reluParLeParent(CAS[0], saisies)).toBe('3000,07');
	});

	it('tableau rempli en entier, ou réduit à la zone : le journal rend ce que l’écran montrait', () => {
		/* Le contrôle positif, sans lequel les tests ci-dessus prouveraient seulement que la
		   fonction sait marquer des trous. Rien à marquer ici : dans le premier cas l'enfant a
		   tout écrit, dans le second il a écrit tout ce qui lui était demandé, et les deux
		   tableaux se relisent « 6 cm ». */
		const complete = saisieComplete(CAS[1]);
		expect(saisiesPourJournal(colonnes(CAS[1]), 'mm', 'cm', complete)).toEqual(complete);
		expect(reluParLeParent(CAS[1], complete)).toBe('6');
		const minimale = saisieMinimale(CAS[1]);
		expect(saisiesPourJournal(colonnes(CAS[1]), 'mm', 'cm', minimale)).toEqual([
			'0',
			'0',
			'0',
			'0',
			'0',
			'6',
			'0',
		]);
		expect(reluParLeParent(CAS[1], minimale)).toBe('6');
	});

	it('le trou ne peut être ni un chiffre ni un blanc', () => {
		// Sinon il se confond avec un rang écrit, ou disparaît à la lecture. Un seul caractère :
		// la ligne du journal doit rester alignée sur ce que le tableau montrait.
		expect([...TROU]).toHaveLength(1);
		expect(TROU, 'un chiffre ou un blanc ne se distingue pas d’un rang écrit').not.toMatch(
			/[\d\s]/u,
		);
	});

	it('une entrée par case, même sur une saisie tronquée ou une question illisible', () => {
		/* La longueur est ce qui aligne le journal sur les cellules du rendu : une entrée de moins
		   et chaque unité glisse d'un cran, si bien que le parent lit un nombre construit sur les
		   mauvaises colonnes. Deux façons de la perdre : une tranche où l'unité de l'énoncé est
		   absente (rien n'est exigé, mais le tableau se dessine quand même), et un tableau à
		   colonne de tête, dont les huit cases ne se comptent pas comme les sept colonnes. */
		const cases = casesDe(TETE_A_DEUX_CHIFFRES).length;
		expect(cases).toBe(8);
		expect(saisiesPourJournal(colonnes(TETE_A_DEUX_CHIFFRES), 'km', 'm', ['1'])).toEqual([
			'1',
			TROU,
			TROU,
			TROU,
			TROU,
			'0',
			'0',
			'0',
		]);
		const illisible = saisiesPourJournal(colonnes(CAS[0]), 'km', 'L', [
			'3',
			'',
			'',
			'',
			'',
			'',
			'',
		]);
		expect(illisible).toHaveLength(casesDe(CAS[0]).length);
		expect(
			illisible.includes(TROU),
			'un trou annoncé sur une question qu’on ne sait pas lire : le parent lirait un manque imputé à l’enfant',
		).toBe(false);
	});
});

/* ============================================================
   `noteOubli` — critère 38 : nommer l'oubli avant de montrer l'écriture
   ------------------------------------------------------------
   « Tes chiffres sont bons, mais il en manquait un : … » Sans ce préfixe, « la bonne réponse
   était 6 cm » suivi de « 0 dans les mm » se contredit à l'oreille, et l'enfant qui a bien
   écrit son 6 ne comprend pas ce qui est rouge.

   La phrase AFFIRME quelque chose — que les chiffres écrits sont justes — donc elle a quatre
   bords, et un seul de trop la rend menteuse : un oubli, plusieurs, un oubli accompagné d'un
   chiffre faux, un oubli accompagné d'une virgule mal placée. Ils sont éprouvés un par un
   ci-dessous, plus le cas où il n'y a rien à dire.

   ── Le cinquième bord : l'enfant n'a rien écrit du tout ─────────────────────────
   « Vérifier » est actif dès l'apparition de la question (critère 33), donc un tableau
   auquel l'enfant n'a pas touché est validable, et « Tes chiffres sont bons » s'adressait
   alors à qui n'en avait écrit aucun. Le compliment tombe dans ce cas : reste l'écriture
   attendue seule, en PHRASE — majuscule et point — puisque plus rien ne la précède. Ni
   compliment ni reproche : féliciter quelqu'un de ce qu'il n'a pas écrit lui apprend surtout
   que la phrase ne veut rien dire.

   Le seuil porte sur la ZONE, et c'est ce qui se déplace sans qu'on le voie : un 0 posé dans
   une colonne facultative n'est pas « avoir écrit ses chiffres ». Un seuil calculé sur le
   tableau entier rendrait le compliment à un enfant qui n'a touché aucune case exigée, et
   les deux lectures coïncident partout ailleurs. Un test nommé plus bas les sépare.
   ============================================================ */

describe('#711 lot 5 — noteOubli : « tes chiffres sont bons » n’est dit que quand c’est vrai', () => {
	it('un seul oubli : l’accord se fait en toutes lettres', () => {
		/* « 60 mm = ? cm » avec le 6 écrit et le 0 des mm oublié. « il en manquait 1 » écrirait un
		   nombre là où le français met un article : c'est la forme qu'on lit, et celle que le TTS
		   prononce correctement. */
		const phrase = noteOubli(colonnes(CAS[1]), 'mm', 'cm', ['', '', '', '', '', '6', ''], true);
		expect(phrase).toBe(
			'Tes chiffres sont bons, mais il en manquait un : pour 60 mm, il fallait écrire 6 dans les cm et 0 dans les mm.',
		);
		expect(phrase, 'un oubli annoncé par le chiffre 1').not.toContain('manquait 1');
	});

	it('plusieurs oublis : le nombre est dit, et l’écriture entière avec lui', () => {
		// « 456 cm = ? m » avec le seul 4 écrit : les 5 des dm et 6 des cm manquent. L'enfant a
		// besoin de voir l'écriture COMPLÈTE, pas seulement les deux rangs qu'il a sautés — c'est
		// la transcription du nombre qu'il n'a pas faite.
		expect(noteOubli(colonnes(CAS[2]), 'cm', 'm', ['', '', '', '4', '', '', ''], true)).toBe(
			'Tes chiffres sont bons, mais il en manquait 2 : pour 456 cm, il fallait écrire 4 dans les m, 5 dans les dm et 6 dans les cm.',
		);
	});

	it('un oubli ET un chiffre faux : la phrase se tait', () => {
		/* Le 9 posé dans les décimètres à la place du 5 est une vraie erreur de conversion. Dire
		   « tes chiffres sont bons » serait faux, et surtout cela noierait ce que l'enfant a
		   besoin d'entendre : ce n'est pas un rang qu'il a sauté, c'est le nombre qu'il a mal lu. */
		expect(noteOubli(colonnes(CAS[2]), 'cm', 'm', ['', '', '', '4', '9', '', ''], true)).toBe('');
	});

	it('un chiffre faux HORS de la zone compte aussi : la phrase se tait', () => {
		// Le 7 posé dans les décimètres n'était pas exigé, mais il est écrit, et il est faux : le
		// tableau que l'enfant a rempli ne se lit pas 6 cm. Une case facultative donne le droit de
		// ne RIEN écrire, pas celui d'écrire n'importe quoi.
		expect(noteOubli(colonnes(CAS[1]), 'mm', 'cm', ['', '', '', '', '7', '6', ''], true)).toBe('');
	});

	it('un oubli ET une virgule mal placée : la phrase se tait', () => {
		/* Mêmes chiffres qu'au premier test, mais la virgule est fausse. Le runner a déjà sa
		   phrase pour ce cas (« la virgule allait après les millimètres ») ; empiler les deux
		   ferait trois lignes à lire sous un tableau rouge, et « tes chiffres sont bons » y
		   apparaîtrait deux fois. */
		expect(noteOubli(colonnes(CAS[1]), 'mm', 'cm', ['', '', '', '', '', '6', ''], false)).toBe('');
	});

	it('rien d’oublié : rien à dire, y compris quand la moitié du tableau est restée vide', () => {
		/* Le contrôle positif, et la promesse du lot en même temps : sur la saisie MINIMALE, cinq
		   cases sont vides et aucune ne manque. La règle d'avant en aurait compté cinq et affiché
		   la phrase à un enfant qui venait de répondre juste. */
		expect(noteOubli(colonnes(CAS[1]), 'mm', 'cm', saisieMinimale(CAS[1]), true)).toBe('');
		expect(noteOubli(colonnes(CAS[1]), 'mm', 'cm', saisieComplete(CAS[1]), true)).toBe('');
	});

	it('une donnée qui tient sur un rang : le compte, sans deux-points orphelin', () => {
		/* « 3 km = ? m » avec le seul 3 écrit. Il n'y a rien à décomposer — « 3 km s'écrit 3 en
		   km » ne dirait rien que l'énoncé n'ait dit — donc `ecritureAttendue` rend une chaîne
		   vide, et la phrase doit se refermer proprement. Un « : » suivi d'un point est ce que
		   produit une concaténation qui ne teste pas son morceau. C'est `explicationRangVide` qui
		   prend le relais ici, avec « Pense aux 0 des unités intermédiaires ». */
		const phrase = noteOubli(colonnes(CAS[0]), 'km', 'm', ['3', '', '', '', '', '', ''], true);
		expect(phrase).toBe('Tes chiffres sont bons, mais il en manquait 3.');
		expect(phrase).not.toContain(' : .');
	});

	it('une unité introuvable : la phrase se tait plutôt que d’imputer un manque à l’enfant', () => {
		// Tranche mal formée, donc défaut de catalogue : aucune case n'est exigée, aucune ne
		// manque, et surtout on ne reproche rien à l'enfant pour une leçon cassée.
		expect(noteOubli(colonnes(CAS[0]), 'km', 'L', ['3', '', '', '', '', '', ''], true)).toBe('');
	});

	it('un tableau auquel il n’a pas touché : l’écriture attendue, et AUCUN compliment', () => {
		/* « Vérifier » est actif dès l'apparition de la question (critère 33), donc ce tableau-là
		   est validable. « Tes chiffres sont bons » y félicitait un enfant qui n'avait écrit aucun
		   chiffre — un compliment qui ne correspond à rien apprend surtout que la phrase ne veut
		   rien dire, et le suivant, mérité celui-là, ne vaudra plus rien.

		   Ce qui reste est l'écriture attendue, seule : ni compliment, ni reproche. */
		const phrase = noteOubli(colonnes(CAS[2]), 'cm', 'm', saisieVide(CAS[2]), true);
		expect(phrase).toBe(
			'Pour 456 cm, il fallait écrire 4 dans les m, 5 dans les dm et 6 dans les cm.',
		);
		expect(phrase, 'félicité pour des chiffres qu’il n’a pas écrits').not.toContain(
			'Tes chiffres sont bons',
		);
		// Même chose sur le cas du critère 38, pour que la branche ne tienne pas à une question.
		expect(noteOubli(colonnes(CAS[1]), 'mm', 'cm', saisieVide(CAS[1]), true)).toBe(
			'Pour 60 mm, il fallait écrire 6 dans les cm et 0 dans les mm.',
		);
	});

	it('le seuil porte sur la ZONE : un chiffre juste posé hors d’elle ne fait pas « avoir écrit »', () => {
		/* Le bord qui se déplace sans se voir. Les deux lectures — « il a rempli une case exigée »
		   et « il a rempli une case » — coïncident sur toutes les saisies ordinaires ; elles ne
		   divergent que lorsque l'enfant a posé quelque chose de JUSTE hors de la question, ici le
		   0 des kilomètres, qui est bien le chiffre attendu dans cette colonne mais ne dit rien de
		   la conversion demandée. Un seuil calculé sur le tableau entier le prendrait pour une
		   transcription commencée et rendrait le compliment. */
		const horsZone = ['0', '', '', '', '', '', ''];
		expect(
			casesObligatoires(colonnes(CAS[2]), 'cm', 'm')[0],
			'la fixture ne place plus cette case hors de la zone : le test ne sépare plus rien',
		).toBe(false);
		expect(noteOubli(colonnes(CAS[2]), 'cm', 'm', horsZone, true)).toBe(
			'Pour 456 cm, il fallait écrire 4 dans les m, 5 dans les dm et 6 dans les cm.',
		);
		// L'autre côté du seuil, sur la MÊME question : un seul chiffre écrit dans la zone, et le
		// compliment revient. C'est ce couple qui fixe la frontière, pas chaque cas pris seul.
		expect(noteOubli(colonnes(CAS[2]), 'cm', 'm', ['', '', '', '4', '', '', ''], true)).toBe(
			'Tes chiffres sont bons, mais il en manquait 2 : pour 456 cm, il fallait écrire 4 dans les m, 5 dans les dm et 6 dans les cm.',
		);
	});

	it('rien écrit ET rien à décomposer : la phrase se tait entièrement', () => {
		/* « 3 km = ? m » vierge. Sans compliment à donner et sans écriture à montrer — la donnée
		   tient sur un seul rang — il ne reste rien à dire : un « Pour 3 km, il fallait écrire 3
		   dans les km. » ne serait que l'énoncé répété. `explicationRangVide` prend le relais avec
		   « Pense aux 0 des unités intermédiaires », et l'enfant lit une phrase, pas deux. */
		expect(noteOubli(colonnes(CAS[0]), 'km', 'm', saisieVide(CAS[0]), true)).toBe('');
	});

	it('fragment ou phrase : les deux exigences de ponctuation sont inverses, et justes toutes les deux', () => {
		/* À lire avec le test « elle s'insère dans la phrase du runner » de `ecritureAttendue`, qui
		   exige exactement le contraire — ni majuscule, ni point. Les deux ne se contredisent pas,
		   ils décrivent deux POSITIONS du même contenu :
		   - `ecritureAttendue` est un FRAGMENT, inséré après « … il en manquait un : » ; une
		     majuscule y tomberait au milieu d'une phrase, et son point la doublerait ;
		   - la branche sans compliment est la phrase ENTIÈRE, seule à l'écran ; sans majuscule ni
		     point, elle s'afficherait en minuscule juste avant « La bonne réponse était… ».
		   Supprimer l'un des deux tests parce qu'il « contredit » l'autre relâche la moitié de la
		   règle — d'où ce troisième, qui les montre ensemble. */
		expect(ecritureAttendue(colonnes(CAS[2]), 'cm', 'm')).toBe(
			'pour 456 cm, il fallait écrire 4 dans les m, 5 dans les dm et 6 dans les cm',
		);
		expect(noteOubli(colonnes(CAS[2]), 'cm', 'm', saisieVide(CAS[2]), true)).toBe(
			'Pour 456 cm, il fallait écrire 4 dans les m, 5 dans les dm et 6 dans les cm.',
		);
	});

	it('la phrase est une phrase : majuscule, point final, et la langue du projet', () => {
		/* Elle est composée AVANT « La bonne réponse était… », contrairement à `ecritureAttendue`
		   qui s'insère après un deux-points : c'est donc elle qui porte la ponctuation. Les DEUX
		   branches y passent — celle qui complimente et celle qui se contente de montrer —, parce
		   que la seconde compose sa majuscule au lieu de l'avoir écrite. */
		const phrases = [
			noteOubli(colonnes(CAS[1]), 'mm', 'cm', ['', '', '', '', '', '6', ''], true),
			noteOubli(colonnes(CAS[2]), 'cm', 'm', ['', '', '', '4', '', '', ''], true),
			noteOubli(colonnes(CAS[0]), 'km', 'm', ['3', '', '', '', '', '', ''], true),
			noteOubli(colonnes(CAS[2]), 'cm', 'm', saisieVide(CAS[2]), true),
		];
		const fautes: string[] = [];
		for (const p of phrases) {
			if (!/^[A-ZÀ-Þ]/u.test(p)) fautes.push(`« ${p} » ne commence pas par une majuscule`);
			if (!p.endsWith('.')) fautes.push(`« ${p} » ne se termine pas par un point`);
			for (const f of apostrophesCourbes(p))
				fautes.push(`apostrophe courbe dans « ${f} » — la convention du projet est la droite`);
			for (const f of vouvoiements(p))
				fautes.push(`vouvoiement dans « ${f} » — l'appli parle À l'enfant`);
			for (const f of signesCites(p)) fautes.push(`signe cité au lieu d'être nommé dans « ${f} »`);
		}
		expect(fautes, `Phrases fautives :\n${fautes.join('\n')}`).toEqual([]);
	});
});

/* ============================================================
   Témoins : ce que les détecteurs ci-dessus doivent refuser
   ------------------------------------------------------------
   Les trois fonctions ne sont pas appelées ici. `defautsDeZone`, `defautsDeVerdicts` et
   `defautsDeLaPhrase` portent la moitié des exigences des balayages : trop permissifs, ils
   laisseraient tout vert sur une correction fautive. On leur soumet donc des réponses
   FABRIQUÉES — dont celle d'aujourd'hui, « tout le tableau est obligatoire » — et on exige
   qu'ils réagissent, puis les réponses justes, sur lesquelles ils doivent se taire.
   ============================================================ */

describe('#711 lot 5 — témoins des détecteurs', () => {
	const soixanteMm = CAS[1]; // « 60 mm = ? cm », zone [cm … mm]

	it('la zone d’AUJOURD’HUI — tout le tableau — est signalée', () => {
		expect(defautsDeZone({ gauche: 0, droite: 6 }, soixanteMm).join(' | ')).toMatch(
			/exigée pour rien/,
		);
	});

	it('oublier le `0` des millimètres est signalé', () => {
		// La zone qu'on obtiendrait en s'arrêtant au dernier chiffre NON NUL de la donnée.
		expect(defautsDeZone({ gauche: 5, droite: 5 }, soixanteMm).join(' | ')).toMatch(
			/faite de tête/,
		);
	});

	it('la contrefaçon « de l’unité donnée à l’unité demandée » est signalée', () => {
		// Sur « 12,5 cm = ? mm » elle rend [cm … mm] et laisse le 1 des décimètres facultatif.
		expect(
			defautsDeZone({ gauche: 5, droite: 6 }, MULTI_CHIFFRES_VERS_LA_DROITE).join(' | '),
		).toMatch(/l'enfant pourrait l'omettre/);
	});

	it('une zone qui n’exige pas la colonne de la réponse est signalée', () => {
		const d = defautsDeZone({ gauche: 6, droite: 6 }, soixanteMm).join(' | ');
		expect(d).toMatch(/où se lit la RÉPONSE/);
		expect(d, 'le 6 des centimètres serait devenu facultatif').toMatch(/hors zone/);
	});

	it('une zone hors tableau ou inversée est signalée', () => {
		expect(defautsDeZone({ gauche: 2, droite: 1 }, soixanteMm).join(' | ')).toMatch(/inversées/);
		expect(defautsDeZone({ gauche: 0, droite: 7 }, soixanteMm).join(' | ')).toMatch(/hors tableau/);
		expect(defautsDeZone(null, soixanteMm).join(' | ')).toMatch(/aucune zone/);
	});

	it('contrôle positif : la zone JUSTE de chaque question ne déclenche rien', () => {
		// Sans lui, les témoins ci-dessus prouveraient seulement que le détecteur crie — pas qu'il
		// sait se taire.
		for (const cas of TOUS) expect(defautsDeZone(cas.zone, cas), cas.nom).toEqual([]);
	});

	it('un ✓ posé sur une case vide hors zone est signalé (critère 36)', () => {
		const saisies = saisieMinimale(soixanteMm);
		const fautif: VerdictCase[] = casesDe(soixanteMm).map(() => 'juste');
		expect(defautsDeVerdicts(fautif, soixanteMm, saisies).join(' | ')).toMatch(/critère 36/);
	});

	it('une case exigée et vide passée sous silence est signalée (critère 31)', () => {
		const saisies = saisieVide(soixanteMm);
		const fautif: VerdictCase[] = casesDe(soixanteMm).map(() => 'neutre');
		expect(defautsDeVerdicts(fautif, soixanteMm, saisies).join(' | ')).toMatch(/critère 31/);
	});

	it('un chiffre égaré hors zone passé sous silence est signalé (critère 32)', () => {
		const saisies = saisieMinimale(soixanteMm);
		saisies[0] = '7';
		const fautif: VerdictCase[] = casesDe(soixanteMm).map((c, i) =>
			i === 0 ? 'neutre' : c.obligatoire ? 'juste' : 'neutre',
		);
		expect(defautsDeVerdicts(fautif, soixanteMm, saisies).join(' | ')).toMatch(/critère 32/);
	});

	it('une liste de verdicts désalignée est signalée', () => {
		expect(
			defautsDeVerdicts(['juste'], soixanteMm, saisieMinimale(soixanteMm)).join(' | '),
		).toMatch(/verdict du voisin/);
	});

	it('contrôle positif : les verdicts JUSTES ne déclenchent rien', () => {
		for (const cas of TOUS)
			for (const saisies of [saisieComplete(cas), saisieMinimale(cas), saisieVide(cas)]) {
				const attendus = casesDe(cas).map((c, i) =>
					verdictAttendu(c, i < saisies.length ? saisies[i] : ''),
				);
				expect(defautsDeVerdicts(attendus, cas, saisies), cas.nom).toEqual([]);
			}
	});

	it('le détecteur de phrase refuse la phrase qui parcourt la ZONE au lieu de la DONNÉE', () => {
		/* La formulation que la correction de spec écarte, soumise telle quelle : elle est vraie
		   du tableau et fausse du nombre, et c'est ce détecteur qui doit la refuser. */
		expect(
			defautsDeLaPhrase(
				'pour 5 m, il fallait écrire 0 dans les km, 0 dans les hm, 0 dans les dam et 5 dans les m',
				CAS[3],
			).join(' | '),
		).toMatch(/il n'y a donc rien à décomposer/);
		expect(
			defautsDeLaPhrase(
				'pour 3,2 m, il fallait écrire 0 dans les km, 0 dans les hm, 0 dans les dam, 3 dans les m et 2 dans les dm',
				DECIMAL_VERS_LA_GAUCHE,
			).join(' | '),
		).toMatch(/aucun rang qui n'y est que pour la réponse/);
	});

	it('le détecteur de phrase refuse le « seul chiffre manquant » que le critère 38 écarte', () => {
		const d = defautsDeLaPhrase('il manquait un 0 dans les mm', soixanteMm).join(' | ');
		expect(d).toMatch(/dans l'ordre du tableau/);
		expect(d, 'la donnée « 60 mm » n’est pas reprise').toMatch(/ne reprend pas la donnée/);
	});

	it('le détecteur de phrase refuse la tranche entière, et les fautes de langue', () => {
		expect(
			defautsDeLaPhrase(
				'pour 60 mm, il fallait écrire 0 dans les km, 0 dans les hm, 0 dans les dam, 0 dans les m, 0 dans les dm, 6 dans les cm et 0 dans les mm',
				soixanteMm,
			).join(' | '),
		).toMatch(/l'écriture de la donnée est/);
		expect(
			defautsDeLaPhrase(
				'pour 60 mm, il fallait l’écrire 6 dans les cm et 0 dans les mm',
				soixanteMm,
			).join(' | '),
		).toMatch(/apostrophe courbe/);
		expect(
			defautsDeLaPhrase(
				'pour 60 mm, il fallait écrire 6 dans les cm et 0 dans les mm, vous voyez',
				soixanteMm,
			).join(' | '),
		).toMatch(/vouvoiement/);
		expect(
			defautsDeLaPhrase(
				'pour 60 mm, il fallait écrire 6 dans les cm et 0 dans les mm, avec « , » entre les deux',
				soixanteMm,
			).join(' | '),
		).toMatch(/signe cité/);
	});

	it('le détecteur de phrase refuse une majuscule initiale et un point final', () => {
		/* Les deux branches que le contenu réel ne déclenche jamais — donc celles qui, sans témoin,
		   pourraient cesser de fonctionner sans que rien ne bouge. La phrase s'insère après
		   « … il en manquait un : », d'où l'interdit. */
		expect(
			defautsDeLaPhrase(
				'Pour 60 mm, il fallait écrire 6 dans les cm et 0 dans les mm',
				soixanteMm,
			).join(' | '),
		).toMatch(/commence par une majuscule/);
		expect(
			defautsDeLaPhrase(
				'pour 60 mm, il fallait écrire 6 dans les cm et 0 dans les mm.',
				soixanteMm,
			).join(' | '),
		).toMatch(/se termine par un point/);
	});

	it('le détecteur de phrase refuse une décomposition là où la donnée tient sur un rang', () => {
		expect(
			defautsDeLaPhrase('pour 3 km, il fallait écrire 3 dans les km', CAS[0]).join(' | '),
		).toMatch(/ce que l'énoncé a déjà dit/);
		expect(
			defautsDeLaPhrase(
				'pour 12 km, il fallait écrire 1 dans les km et 2 dans les km',
				TETE_A_DEUX_CHIFFRES,
			).join(' | '),
			'la découpe de la tête en deux cases doit être refusée',
		).toMatch(/rien à décomposer/);
	});

	it('contrôle positif : les phrases JUSTES ne déclenchent rien', () => {
		expect(
			defautsDeLaPhrase('pour 60 mm, il fallait écrire 6 dans les cm et 0 dans les mm', soixanteMm),
		).toEqual([]);
		expect(
			defautsDeLaPhrase(
				'pour 456 cm, il fallait écrire 4 dans les m, 5 dans les dm et 6 dans les cm',
				CAS[2],
			),
			'la forme à trois rangs, séparateurs compris, doit passer',
		).toEqual([]);
		expect(
			defautsDeLaPhrase(
				'pour 3000 mm, il fallait écrire 3 dans les m, 0 dans les dm, 0 dans les cm et 0 dans les mm',
				QUATRE_RANGS,
			),
			'la forme la plus longue que le catalogue produise doit passer',
		).toEqual([]);
		expect(defautsDeLaPhrase('', CAS[0]), 'la chaîne vide est la bonne réponse ici').toEqual([]);
	});
});

/* ============================================================
   Le nombre CITÉ par la phrase est celui que l'énoncé AFFICHE
   ------------------------------------------------------------
   Gate sur le lien entre DEUX modules, pas sur une valeur (remontée
   `redacteur-contenu-francais`). `ecritureAttendue` RECONSTRUIT le nombre de la donnée en
   concaténant les chiffres des colonnes, tandis que l'énoncé l'affiche tel que le générateur
   l'a composé — `buildQuestion` (src/data/maths/mesures.ts) interpole `${knownValue}` brut.
   Deux chemins, un seul nombre, et rien qui les tienne ensemble.

   Le jour où l'énoncé passerait par `formatNombre` (src/core/nombres.ts) — ce qui est la
   règle du projet pour les nombres affichés depuis #240 — il grouperait les milliers à partir
   de 10 000. La phrase citerait alors « 12000 » là où l'écran montre « 12 000 » : un nombre
   que l'enfant n'a jamais lu, dans le message même qui existe pour le raccrocher à ce qu'il a
   sous les yeux. Le défaut ne se verrait ni en revue (les deux graphies se ressemblent, elles
   ne diffèrent que par un caractère invisible) ni en e2e (la spec tape des chiffres, elle ne
   lit pas le message).

   Joué sur des TIRAGES du catalogue, et non sur les fixtures écrites plus haut : celles-ci
   sont construites ici et ne sauraient pas dire que l'énoncé a changé de graphie. Un compte
   de couverture est exigé — dont au moins un nombre ≥ 10 000, seuil du groupement ; sans lui
   le gate serait vert en ne regardant que des nombres trop courts pour diverger.
   ============================================================ */

/** Séparateurs de milliers, désignés par leur CODE et jamais écrits en clair (convention de
    `src/core/nombres.ts` : invisibles, donc fragiles à l'édition). U+202F est celui que
    produit `Intl.NumberFormat('fr-FR')`, U+00A0 celui de contenus plus anciens. */
const SEPARATEURS_MILLIERS = ESPACE_FINE + String.fromCharCode(0x00a0);

/** Les nombres que l'énoncé AFFICHE, dans leur graphie exacte — séparateurs de milliers et
    virgule décimale compris. Un nombre groupé ressort d'un seul tenant, ce qui est tout
    l'intérêt : « 12 000 » ne se confondra pas avec « 12000 ». */
function nombresAffiches(enonce: string): string[] {
	const motif = new RegExp('[0-9](?:[0-9,.' + SEPARATEURS_MILLIERS + ']*[0-9])?', 'g');
	return [...enonce.matchAll(motif)].map((m) => m[0]);
}

/** Le nombre que la phrase CITE : ce qui suit « pour » jusqu'à l'unité. */
function nombreCite(phrase: string): string | null {
	return /^pour (\S+) /u.exec(phrase)?.[1] ?? null;
}

/** Le défaut, s'il y en a un, entre ce que la phrase cite et ce que l'énoncé montre. Rendu en
    texte plutôt qu'en booléen : l'échec doit montrer les deux graphies ET leurs points de
    code, sinon personne ne verra qu'elles ne diffèrent que par un caractère invisible. */
function defautDeCitation(phrase: string, enonce: string): string | null {
	if (phrase === '') return null;
	const cite = nombreCite(phrase);
	if (cite === null) return `la phrase « ${phrase} » ne commence pas par « pour <nombre> <unité> »`;
	const affiches = nombresAffiches(enonce);
	if (affiches.includes(cite)) return null;
	const codes = affiches.map((n) => `« ${n} » [${[...n].map((c) => c.codePointAt(0)).join(' ')}]`);
	return `la phrase cite « ${cite} » alors que l'énoncé « ${enonce} » affiche ${codes.join(', ')} — l'enfant lirait un nombre qu'il n'a jamais vu, dans le message même qui devait le ramener à son tableau`;
}

describe('#711 lot 5 — le nombre cité par la phrase est celui que l’énoncé affiche', () => {
	const LECONS = ['mes-longueurs', 'mes-masses', 'mes-contenances'];
	const NIVEAUX: SchoolLevel[] = ['ce2', 'cm1'];

	interface Tire {
		ou: string;
		enonce: string;
		phrase: string;
		cite: string | null;
	}

	/** Tirages réels, par graine, sur les trois leçons à tableau et les deux niveaux. */
	function tirages(parCombinaison: number): Tire[] {
		const out: Tire[] = [];
		for (const id of LECONS) {
			const lecon = getLessonById(id);
			if (!lecon) throw new Error(`leçon absente du catalogue : ${id}`);
			for (const niveau of NIVEAUX)
				for (let seed = 1; seed <= parCombinaison; seed++) {
					const ex = withSeed(seed, () =>
						lecon.exerciseType.generate({ mode: 'tableau', level: niveau }),
					);
					if (ex.type !== 'tableauConversion')
						throw new Error(`${id}/${niveau} : type « ${ex.type} » au lieu d'un tableau`);
					const phrase = ecritureAttendue(ex.colonnes, ex.uniteConnue, ex.answerUnit);
					out.push({
						ou: `${id}/${niveau}/graine ${seed}`,
						enonce: ex.question,
						phrase,
						cite: phrase === '' ? null : nombreCite(phrase),
					});
				}
		}
		return out;
	}

	const TIRAGES = tirages(120);

	it('le balayage voit bien les tirages qui pourraient diverger', () => {
		/* Sans ce compte, le gate ci-dessous serait vert en ne regardant que des nombres à trois
		   chiffres, que `formatNombre` rend inchangés — donc vert sans rien garder. Le seuil qui
		   compte est 10 000 : c'est à partir de là que le groupement s'applique. */
		const avecPhrase = TIRAGES.filter((t) => t.phrase !== '');
		expect(
			avecPhrase.length,
			'aucun tirage ne produit de phrase : le gate ne lirait rien',
		).toBeGreaterThan(50);

		const cites = avecPhrase.map((t) => t.cite ?? '');
		const grands = cites.filter((n) => Number(n.replace(',', '.')) >= 10000);
		expect(
			grands.length,
			`aucun nombre ≥ 10 000 parmi les ${cites.length} cités : le seuil de groupement de formatNombre n'est jamais franchi, donc ce gate ne verrait pas l'énoncé changer de graphie`,
		).toBeGreaterThan(0);

		const decimaux = cites.filter((n) => n.includes(','));
		expect(
			decimaux.length,
			'aucune donnée décimale citée : la virgule de l’énoncé n’est pas éprouvée',
		).toBeGreaterThan(0);
	});

	it('sur chaque tirage, la phrase cite le nombre tel que l’énoncé l’écrit', () => {
		const fautes: string[] = [];
		for (const t of TIRAGES) {
			const d = defautDeCitation(t.phrase, t.enonce);
			if (d !== null) fautes.push(`${t.ou} : ${d}`);
		}
		expect(
			fautes,
			`Nombres cités hors énoncé (${fautes.length} tirages) :\n${fautes.slice(0, 10).join('\n')}`,
		).toEqual([]);
	});

	it('TÉMOIN : si l’énoncé se mettait à grouper ses milliers, le gate rougirait', () => {
		/* La preuve que le test ci-dessus garde quelque chose. On ne peut pas muter le générateur
		   depuis un test, mais on peut lui soumettre l'énoncé qu'il produirait : le même, passé par
		   `formatNombre`. Sans ce témoin, « aucune faute » ne distinguerait pas un lien tenu d'un
		   détecteur qui ne regarde rien. */
		const grand = TIRAGES.find((t) => t.cite !== null && Number(t.cite) >= 10000);
		expect(grand, 'aucun tirage ≥ 10 000 : le témoin ne prouverait rien').toBeDefined();
		const valeur = Number(grand!.cite);
		const groupe = formatNombre(valeur);
		expect(groupe, 'formatNombre ne groupe pas cette valeur : le témoin serait vide').not.toBe(
			grand!.cite,
		);

		const enonceGroupe = grand!.enonce.replace(String(valeur), groupe);
		expect(
			defautDeCitation(grand!.phrase, enonceGroupe),
			`l'énoncé « ${enonceGroupe} » et la phrase « ${grand!.phrase} » citent deux graphies différentes, et le détecteur ne le voit pas`,
		).not.toBeNull();

		// Et il se tait sur l'énoncé réel, sinon il crierait sur tout.
		expect(defautDeCitation(grand!.phrase, grand!.enonce)).toBeNull();
	});

	it('TÉMOIN : une phrase qui ne commence pas par « pour <nombre> » est signalée', () => {
		expect(defautDeCitation('il fallait écrire 6 dans les cm', '60 mm = @ cm')).toMatch(
			/ne commence pas par/,
		);
		// Contrôle positif : la chaîne vide n'est pas une faute, c'est l'absence de message.
		expect(defautDeCitation('', '3 km = @ m')).toBeNull();
	});
});
