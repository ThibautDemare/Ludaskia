/* ============================================================
   Grandeurs et mesures — conversions d'unités (MES 1/3/4/8, #89 ; plages
   par niveau #287). Moteur de génération PARTAGÉ par quatre leçons :
   longueurs, masses, contenances, durées. Une question = une valeur dans une
   unité, l'enfant écrit la valeur dans l'autre unité (réponse numérique,
   vérifiée par checkItemAnswer en mode `num`).

   Second mode « tableau de conversion » (#394, mécanisme de modes #69) : proposé
   pour les familles décimales (longueurs, masses, contenances ; PAS les durées,
   base 60), en COMPLÉMENT de la saisie (jamais un remplacement). L'enfant place un
   chiffre par colonne d'unité, zéros de transit compris. Voir `generateTableau` et
   son invariant zéro-de-transit ⊕ virgule ; le rendu vit dans ui/lecon-tableau.ts.

   Multi-niveaux (#225/#287) : chaque leçon est `calibrated` par une table
   { ce2, cm1 } ; CE2 reste calibré à l'identique, le CM1 élargit les plages et
   ajoute des unités. Le vrai levier de variété n'est PAS d'élargir 1–9, mais
   d'ajouter des unités DÉJÀ au programme du niveau.

   Calibrage pédagogique (avis pedagogue-primaire) :
   - longueurs : CE2 m↔cm (×100), km↔m (×1000) ET cm↔mm (×10), m↔mm (×1000) —
     le mm de LONGUEUR est au programme CE2 2025 (1 cm = 10 mm, 1 m = 1000 mm) ;
     CM1 élargit à 1–20 et ajoute le dm.
   - masses : CE2 kg↔g (×1000) ; CM1 1–20 + g↔mg + le demi-kilo (500 g).
   - contenances : CE2 L↔cL (×100) ET L↔dL (×10) ; le mL (L↔mL, ×1000) relève du
     CM1 (franchir le millier), pas le dL.
   - durées : CE2 h↔min (×60, jusqu'à 4 h) + repères culturels (½, ¼, ¾ h, 1 h 30,
     1 h 15) ; le min↔s « libre » et les GRANDES unités de temps (siècle↔an, an↔mois,
     semaine↔jour, jour↔h — relations EXACTES seulement, #252) relèvent du CM1 (jamais
     ouverts au CE2). Les unités-mots (siècle, an, mois, semaine, jour) sont accordées
     au pluriel via `uniteAccordee` ; les symboles ne prennent jamais de marque.
   - facteur grande→petite borné par `maxBig` ; sens inverse (petite→grande)
     uniquement sur des multiples EXACTS du facteur → réponse entière.
   - pondération ~60/40 en faveur du sens grande→petite (× plus sûr que ÷) ;
     le trou alterne à gauche/à droite. L'unité attendue est collée au champ.

   Décimaux CM1 (#248, programme 2025 §1.3, AU PLUS 2 chiffres après la virgule) :
   les paires ×10 et ×100 CONCERNÉES portent un flag `decimal` (cf. `Conversion`) qui
   ouvre une génération décimale bornée. Le CE2 reste STRICTEMENT entier (aucun flag).
   La réponse décimale est stockée en écriture à VIRGULE (« 4,56 ») — la comparaison
   numérique (checkNumerique / checkItemAnswer) normalise virgule/point des deux côtés.
   ============================================================ */
import type {
	Exercise,
	ExerciseType,
	ModeOption,
	GenerateOpts,
	TableauColonne,
} from '../../core/exercise';
import { etayageRedige, type LessonInput } from '../_shared';
import { checkNumerique } from '../../core/check-helpers';
import { calibrated } from '../../core/level-combinators';
import { rnd, choice } from '../../core/utils';

/* Une relation « 1 grande unité = facteur petites unités ». `maxBig` borne la
   valeur tirée côté grande unité (défaut 9 ; réduit pour les durées en ×60). */
interface Conversion {
	big: string; // unité grande (ex. 'm', 'km', 'kg', 'L', 'h')
	small: string; // unité petite (ex. 'cm', 'm', 'g', 'cL', 'min')
	factor: number; // 1 big = factor small
	maxBig?: number; // valeur max côté grande unité (défaut 9)
	// Ouverture au DÉCIMAL (#248, CM1 uniquement). Absent → conversions ENTIÈRES : tout
	// le CE2, les paires ×1000 (résultat < 1 sur > 2 décimales → hors programme) et les
	// durées (×60). Sinon la paire produit des résultats décimaux à AU PLUS 2 chiffres
	// après la virgule (programme 2025 §1.3, borne DURE) :
	//   - 'deux-sens'   : décimal dans les DEUX sens (paires ×10, 1 décimale) —
	//                     « 4,5 cm = 45 mm » et « 45 mm = 4,5 cm » ;
	//   - 'vers-grande' : décimal SEULEMENT petite→grande (paires ×100, 2 décimales),
	//                     avec résultat ≥ 1 dans la grande unité (« 456 cm = 4,56 m »,
	//                     jamais « 3 cm = 0,03 m »). Le sens grande→petite reste ENTIER
	//                     (« 3 m = 300 cm », conservé). Le grande→petite DÉCIMAL
	//                     (« 4,56 m = @ cm ») est DIFFÉRÉ (jugement didactique du
	//                     pédagogue : contracter petite→grande avant d'étendre l'écriture
	//                     décimale d'une grande unité vers la petite).
	decimal?: 'deux-sens' | 'vers-grande';
	// Relation de CONSOLIDATION (#711) : un pas de rang intermédiaire ouvert au CM1 pour que la
	// colonne cesse d'être marquée « pas encore vue en classe » (hm↔dam, hg↔dag, daL↔L…). C'est
	// une vraie relation du programme, mais un outil de MÉTHODE plutôt qu'un savoir réutilisé
	// ailleurs : tirée moins souvent (cf. `tirerConversion`), et JAMAIS ouverte au décimal —
	// « 4,5 dag » n'a aucun référent dans la vie d'un enfant, contrairement à « 4,5 kg ».
	consolidation?: true;
}

/* Un « fait » mémorisé (toujours dans le sens grande→petite), pour les repères
   culturels que l'enfant connaît sans les calculer (½ h = 30 min…). */
interface Fact {
	left: string; // membre connu, ex. 'une demi-heure'
	answerUnit: string; // unité du champ, ex. 'min'
	answer: number; // valeur attendue
}

/* Une unité de l'échelle décimale d'une famille (#394), pour le mode « tableau de
   conversion ». `nom` = nom complet singulier, AFFICHÉ dans l'en-tête (pas seulement en
   aria-label) : l'`aria-label` sert le lecteur d'écran, pas l'enfant dyslexique qui LIT
   l'écran et confond des abréviations proches (dam/dm, hg/kg) — avis
   specialiste-troubles-apprentissage. */
interface EchelleUnite {
	unite: string; // symbole (« km », « dam », « g »…)
	nom: string; // nom complet singulier (« kilomètre », « décamètre »…)
}

/* Colonne d'un exemple d'étayage : même forme qu'une `TableauColonne`, `transit` en
   option (absent = unité étudiée), parce que le moteur de déroulé la lit ainsi. */
type ColonneExemple = { unite: string; nom: string; chiffres: string; transit?: boolean };

interface MesureConfig {
	conversions: Conversion[];
	facts?: Fact[]; // tirés ~1 fois sur 4 quand présents (mode saisie uniquement)
	// Échelle décimale de la famille, ordonnée GRANDE→PETITE unité (crans successifs ×10).
	// PRÉSENCE = le mode « tableau de conversion » (#394) est proposé pour cette leçon ;
	// ABSENCE (durées, base 60 non décimale) = leçon mono-mode, comportement inchangé.
	// L'échelle est commune aux niveaux d'une famille ; ce sont les `conversions` du niveau
	// qui déterminent les unités ÉTUDIÉES (les autres colonnes de l'empan = « de transit »).
	echelle?: EchelleUnite[];
}

/* Échelles décimales par famille (mode tableau #394). Ordre GRANDE→PETITE, stable d'un
   exercice à l'autre (avis dys : repérage d'une colonne par sa position mémorisée). Les
   durées n'en ont pas (base 60 : un tableau décimal y donnerait des réponses fausses). */
const ECHELLE_LONGUEUR: EchelleUnite[] = [
	{ unite: 'km', nom: 'kilomètre' },
	{ unite: 'hm', nom: 'hectomètre' },
	{ unite: 'dam', nom: 'décamètre' },
	{ unite: 'm', nom: 'mètre' },
	{ unite: 'dm', nom: 'décimètre' },
	{ unite: 'cm', nom: 'centimètre' },
	{ unite: 'mm', nom: 'millimètre' },
];
const ECHELLE_MASSE: EchelleUnite[] = [
	{ unite: 'kg', nom: 'kilogramme' },
	{ unite: 'hg', nom: 'hectogramme' },
	{ unite: 'dag', nom: 'décagramme' },
	{ unite: 'g', nom: 'gramme' },
	{ unite: 'dg', nom: 'décigramme' },
	{ unite: 'cg', nom: 'centigramme' },
	{ unite: 'mg', nom: 'milligramme' },
];
/* Contenances : l'échelle va de l'hectolitre au millilitre (#711, critère 6). Le programme
   CM1 nomme « les unités de contenance du millilitre à l'hectolitre » — l'échelle s'arrêtait
   au litre, si bien que hL et daL n'existaient même pas comme colonnes. Le CE2 n'en voit
   rien : sa tranche se calcule sur SES conversions (L, dL, cL) et ne remonte pas au hL. */
const ECHELLE_CONTENANCE: EchelleUnite[] = [
	{ unite: 'hL', nom: 'hectolitre' },
	{ unite: 'daL', nom: 'décalitre' },
	{ unite: 'L', nom: 'litre' },
	{ unite: 'dL', nom: 'décilitre' },
	{ unite: 'cL', nom: 'centilitre' },
	{ unite: 'mL', nom: 'millilitre' },
];

/* Pluriel des unités-MOTS de temps (#252, CM1 uniquement). Le moteur affiche
   « valeur + unité » sans accorder → « 3 siècle » serait fautif. Les DEUX valeurs
   (connue ET réponse) étant connues à la génération, on accorde chaque unité à SA
   valeur. Les unités-SYMBOLES (h, min, s, cm, kg, L…) sont ABSENTES de la table :
   jamais de pluriel (comportement CE2 STRICTEMENT inchangé). « mois » est invariable
   (même forme au singulier et au pluriel). */
const PLURIELS_UNITE: Record<string, string> = {
	siècle: 'siècles',
	an: 'ans',
	semaine: 'semaines',
	jour: 'jours',
	mois: 'mois',
};

/* Unité accordée à sa valeur : pluriel dès 2 (français : singulier pour 0 et 1). Une
   unité hors table (tout symbole) est rendue telle quelle, sans dépendre de la valeur —
   la parenthèse `!pluriel` court-circuite AVANT de comparer `valeur` (un `NaN` d'un
   décimal en chaîne, côté symbole, n'est donc jamais évalué). */
function uniteAccordee(unite: string, valeur: number): string {
	const pluriel = PLURIELS_UNITE[unite];
	if (!pluriel) return unite;
	return valeur >= 2 ? pluriel : unite;
}

/* Construit la question texte (avec le `@` = emplacement du champ) en plaçant
   le trou à gauche ou à droite, l'unité attendue restant collée au champ. La
   valeur connue est déjà une chaîne prête à afficher (un décimal est passé en
   écriture à VIRGULE — jamais de point ; un entier se coerce sans point). Chaque unité
   est ACCORDÉE à SA valeur (`answerValue` = valeur du champ) pour les unités-mots. */
function buildQuestion(
	knownValue: number | string,
	knownUnit: string,
	answerUnit: string,
	answerValue: number,
): string {
	const uniteConnue = uniteAccordee(knownUnit, Number(String(knownValue).replace(',', '.')));
	const known = `${knownValue} ${uniteConnue}`;
	const cible = uniteAccordee(answerUnit, answerValue);
	// 50/50 : « known = @ unité » ou « @ unité = known ».
	return rnd(0, 1) === 0 ? `${known} = @ ${cible}` : `@ ${cible} = ${known}`;
}

/* Écrit un décimal « entier,frac » à la FRANÇAISE (virgule, jamais de point). Le
   nombre est construit à partir de ses parties ENTIÈRES (aucun calcul flottant →
   aucun artefact « 4.5600000001 »), sans zéro final inutile (« 4,50 » → « 4,5 »).
   `decimales` = largeur de la partie fractionnaire (1 pour ×10, 2 pour ×100). */
function ecritureDecimale(entier: number, frac: number, decimales: number): string {
	const fracStr = String(frac).padStart(decimales, '0').replace(/0+$/, '');
	return fracStr === '' ? String(entier) : `${entier},${fracStr}`;
}

/* Instance concrète d'une conversion TIRÉE : sépare le tirage (sens, décimal, valeurs) du
   RENDU, pour que la saisie (`generateConversion`) et le tableau (`generateTableau`) partent
   des MÊMES décisions sans dupliquer la logique de sens/décimal. `sPetit` = la quantité
   exprimée dans la PETITE unité de la paire, TOUJOURS entière : c'est la base du remplissage
   colonne par colonne du tableau. `answerDecimal` = la réponse attendue porte une virgule
   (⟺ sens petite→grande d'une paire décimale, la cible est alors la grande unité). */
interface ConvInstance {
	big: string;
	small: string;
	factor: number;
	knownValue: number | string; // valeur connue affichée (décimale en chaîne le cas échéant)
	knownUnit: string;
	answerUnit: string; // unité cible
	answer: string; // valeur cible (entière ou décimale à virgule)
	sPetit: number;
	answerDecimal: boolean;
}

/* Tirage d'une relation (#711). Le CM1 ouvre toute la chaîne de rangs pour que plus aucune
   colonne ne soit démotée : on passe de 6 à 12 relations en longueurs. Tirées uniformément,
   les relations d'ANCRAGE (1 km = 1 000 m, 1 kg = 1 000 g…) — celles qui reviennent dans les
   problèmes, l'estimation et le choix d'une unité adaptée — deviendraient deux fois plus
   rares que des pas de rang qui ne consolident que la mécanique du tableau (avis
   pedagogue-primaire). Elles gardent donc ~2 tirages sur 3. Sans relation marquée
   `consolidation` — tout le CE2 — le tirage reste STRICTEMENT uniforme, donc inchangé. */
function tirerConversion(conversions: Conversion[]): Conversion {
	const ancrages = conversions.filter((c) => !c.consolidation);
	const pas = conversions.filter((c) => c.consolidation);
	if (!pas.length || !ancrages.length) return choice(conversions);
	return rnd(1, 3) === 1 ? choice(pas) : choice(ancrages);
}

function pickConversionInstance(conversions: Conversion[]): ConvInstance {
	const c = tirerConversion(conversions);
	const maxBig = c.maxBig ?? 9;
	// ~60 % grande→petite (×, plus intuitif), ~40 % petite→grande (÷, exact).
	const versPetite = rnd(1, 10) <= 6;
	const base = { big: c.big, small: c.small, factor: c.factor };
	// grande→petite : connue = grande unité, cible = petite (réponse entière).
	const gp = (knownValue: number | string, sPetit: number): ConvInstance => ({
		...base,
		knownValue,
		knownUnit: c.big,
		answerUnit: c.small,
		answer: String(sPetit),
		sPetit,
		answerDecimal: false,
	});
	// petite→grande : connue = petite unité (sPetit), cible = grande (`answer` : entière ou décimale).
	const pg = (sPetit: number, answer: string, answerDecimal: boolean): ConvInstance => ({
		...base,
		knownValue: sPetit,
		knownUnit: c.small,
		answerUnit: c.big,
		answer,
		sPetit,
		answerDecimal,
	});
	if (c.decimal) {
		// Décimales dictées par le facteur (×10 → 1, ×100 → 2 ; `factor` = 10^decimales).
		const decimales = String(c.factor).length - 1;
		// Paires ×100 : le sens grande→petite reste ENTIER (« 3 m = 300 cm »).
		if (versPetite && c.decimal === 'vers-grande') {
			const v = rnd(1, maxBig);
			return gp(v, v * c.factor);
		}
		// Côté DÉCIMAL (grande unité) : partie entière ≥ 1 + partie fractionnaire NON nulle →
		// au plus `decimales` chiffres après la virgule, résultat ≥ 1, petite unité ENTIÈRE
		// (petite = entier·facteur + frac, car facteur = 10^décimales).
		const entier = rnd(1, maxBig);
		const frac = rnd(1, c.factor - 1); // 1..9 (×10) ou 1..99 (×100), jamais 0
		const grande = ecritureDecimale(entier, frac, decimales);
		const petite = entier * c.factor + frac; // entier exact (aucun flottant)
		// grande→petite : grande décimale connue, petite entière attendue (paires ×10) ;
		// petite→grande : petite entière connue, grande décimale attendue.
		return versPetite ? gp(grande, petite) : pg(petite, grande, true);
	}
	// ---- Conversions ENTIÈRES (comportement CE2 inchangé) ----
	if (versPetite) {
		const v = rnd(1, maxBig); // valeur dans la grande unité
		return gp(v, v * c.factor);
	}
	const k = rnd(1, maxBig); // sens inverse : on part d'un multiple EXACT du facteur
	return pg(k * c.factor, String(k), false);
}

function generateConversion(conversions: Conversion[]): Exercise {
	const inst = pickConversionInstance(conversions);
	return {
		type: 'text',
		question: buildQuestion(
			inst.knownValue,
			inst.knownUnit,
			inst.answerUnit,
			Number(inst.answer.replace(',', '.')),
		),
		answer: inst.answer,
	};
}

/* Tranche de colonnes AFFICHÉE, FIXE pour un couple (leçon, niveau) — #711. Elle court de la
   plus grande à la plus petite unité qui apparaissent dans les `conversions` du niveau, et ne
   dépend donc PAS de la paire tirée.

   Avant #711, l'empan était taillé sur la question (`echelle.slice(iBig, iSmall + 1)`) :
   l'unité connue et l'unité cible étaient TOUJOURS les deux bords du tableau, si bien que
   « recopier les chiffres puis compléter de zéros jusqu'à l'autre bord » répondait juste à
   100 % des items, sans lire un seul nom d'unité. Le geste que le tableau doit installer —
   situer une unité à son rang — n'était jamais demandé. Avec une tranche fixe, l'enfant
   décide lui-même où commencer à écrire et où lire sa réponse.

   Un bord reste assumé sur UNE leçon-niveau : les masses au CE2 n'ont qu'une relation au
   programme (1 kg = 1 000 g ; le programme CE2 ne nomme que g, kg et la tonne, sans chaîne de
   rangs), donc la tranche s'y réduit à la paire et kg reste la tête de tous les items. Le
   `pedagogue-primaire` recommandait plutôt de retirer le tableau des masses au CE2, l'outil
   étant nommément de CM1 ; arbitrage du mainteneur : on garde le mode, un bord assumé sur
   cette seule leçon-niveau valant mieux qu'un mode en moins pour l'enfant. Partout ailleurs il
   y a au moins deux relations, donc au moins une unité en position intérieure. */
function trancheFixe(echelle: EchelleUnite[], conversions: Conversion[]): EchelleUnite[] {
	let debut = echelle.length;
	let fin = -1;
	for (const c of conversions) {
		for (const u of [c.big, c.small]) {
			const i = echelle.findIndex((e) => e.unite === u);
			// Garde-fou : une unité absente de l'échelle de sa famille (typo au prochain ajout)
			// donnerait une tranche silencieusement fausse — mieux vaut échouer net.
			if (i < 0) throw new Error(`Tableau : unité hors échelle (${u})`);
			debut = Math.min(debut, i);
			fin = Math.max(fin, i);
		}
	}
	if (fin < 0) throw new Error('Tableau : aucune conversion configurée');
	return echelle.slice(debut, fin + 1);
}

/* Génère un exercice « tableau de conversion » (#394, empan refondu par #711) à partir de la
   MÊME instance que la saisie. Les colonnes sont la tranche FIXE du niveau (cf. `trancheFixe`),
   et la quantité s'y étale un chiffre par colonne À SON RANG — donc des 0 de tête dès que
   l'unité connue n'est pas la plus grande de la tranche (« 3 cm » ne contient aucun kilomètre).
   L'enfant remplit toutes les cases : pas de case à laisser vide ni de marqueur de colonne vide
   (un seul geste inédit à la fois), et la validation reste bloquée tant qu'il en manque une.
   INVARIANT (à ne pas casser) : zéro-de-transit et virgule ne coexistent JAMAIS dans le même
   exercice. Il tient parce que les deux lots sont partis ensemble — le CM1 n'a plus AUCUNE
   colonne démotée (toute la chaîne de rangs y est au programme) et le CE2 n'a aucun décimal.
   `virguleApres` est posé même si l'app rend la virgule fixe en v1 (donnée générique, ouvre une
   saisie de la virgule sans refonte). */
function generateTableau(config: MesureConfig): Exercise {
	const echelle = config.echelle!;
	const inst = pickConversionInstance(config.conversions);
	// Unités ÉTUDIÉES au niveau = celles qui figurent dans ses conversions ; les autres colonnes
	// sont « de transit » (en-tête démoté + case pointillés). L'équivalence reste exacte aux deux
	// niveaux : au CE2 les relations configurées SONT les unités nommées par le programme, et au
	// CM1 la chaîne de rangs est ouverte en entier. Le jour où une relation serait retirée pour
	// doser la difficulté, sa colonne serait démotée À TORT ; il faudrait alors une liste
	// d'unités « au programme » distincte des relations tirées — et surtout pas un troisième état
	// visuel à faire comprendre à l'enfant (avis pedagogue-primaire).
	const etudiees = new Set<string>();
	for (const c of config.conversions) {
		etudiees.add(c.big);
		etudiees.add(c.small);
	}
	const span = trancheFixe(echelle, config.conversions);
	const n = span.length;
	// `sPetit` est la quantité dans la petite unité de la PAIRE, qui n'est plus forcément la
	// dernière colonne : on la ramène au rang du bas de la TRANCHE pour l'étaler chiffre à
	// chiffre. Tout reste entier — aucun flottant, donc aucun artefact d'arrondi.
	const iSmall = span.findIndex((u) => u.unite === inst.small);
	const total = inst.sPetit * 10 ** (n - 1 - iSmall);
	const chiffres = chiffresParColonne(total, n);
	const colonnes: TableauColonne[] = span.map((u, i) => ({
		unite: u.unite,
		nom: u.nom,
		transit: !etudiees.has(u.unite),
		chiffres: chiffres[i],
	}));
	// Virgule : juste après la colonne de l'unité cible, UNIQUEMENT si la réponse est décimale.
	const virguleApres = inst.answerDecimal
		? span.findIndex((u) => u.unite === inst.answerUnit)
		: undefined;
	// Énoncé PARLÉ (#42) avec les noms d'unités en toutes lettres (le TTS ne lit que la
	// consigne + l'énoncé, jamais la géométrie du tableau). Accord nom ET verbe sur la valeur
	// connue (pluriel dès 2 ; « 1 kilomètre fait », « 3 kilomètres font »).
	const nomConnu = span.find((u) => u.unite === inst.knownUnit)!.nom;
	const nomCible = span.find((u) => u.unite === inst.answerUnit)!.nom;
	const valConnue = Number(String(inst.knownValue).replace(',', '.'));
	const pluriel = valConnue >= 2;
	const parle = `Combien ${pluriel ? 'font' : 'fait'} ${inst.knownValue} ${nomConnu}${pluriel ? 's' : ''} en ${nomCible}s ?`;
	return {
		type: 'tableauConversion',
		question: buildQuestion(
			inst.knownValue,
			inst.knownUnit,
			inst.answerUnit,
			Number(inst.answer.replace(',', '.')),
		),
		answer: inst.answer,
		answerUnit: inst.answerUnit,
		uniteConnue: inst.knownUnit,
		colonnes,
		parle,
		...(virguleApres !== undefined ? { virguleApres } : {}),
	};
}

/* Modes du mode tableau (#394), proposés SEULEMENT quand la leçon porte une `echelle`
   (longueurs / masses / contenances ; pas les durées). Saisie = mode conseillé et premier
   contact ; le tableau est un complément, jamais un remplacement. */
const MODES_MESURE: ModeOption[] = [
	{
		id: 'saisie',
		label: "J'écris le nombre",
		hint: 'au clavier',
		icon: 'keyboard',
		recommended: true,
	},
	{ id: 'tableau', label: 'Je remplis le tableau', hint: 'un chiffre par case', icon: 'table' },
];

/* Fabrique l'ExerciseType d'une leçon de conversion (un jeu de paramètres = un niveau).
   Deux modes quand une `echelle` est fournie (saisie + tableau #394), mono-mode sinon
   (durées). Utilisée telle quelle comme `build` du combinateur `calibrated` (qui prend
   `modes`/`consigne` sur le niveau le plus bas : l'echelle CE2 doit donc être présente
   pour exposer le tableau au CE2 comme au CM1). */
export function conversionType(config: MesureConfig): ExerciseType {
	const facts = config.facts ?? [];
	return {
		// Le tableau n'est proposé que si la famille a une échelle décimale.
		...(config.echelle ? { modes: MODES_MESURE } : {}),
		// Consigne d'action (#265) : l'énoncé « 3 m = @ cm » est une égalité sans verbe
		// (« faut-il convertir ? compléter ? »). Affichée en fiche et propagée en révision.
		consigne: 'Complète : écris le bon nombre.',
		generate(opts?: GenerateOpts): Exercise {
			// Mode tableau (#394) : runner dédié (ui/lecon-tableau.ts). Ignore les `facts`
			// (repères mémorisés, hors geste du tableau) — que du calcul de rang.
			if (opts?.mode === 'tableau' && config.echelle) return generateTableau(config);
			if (facts.length && rnd(1, 4) === 1) {
				const f = choice(facts);
				return {
					type: 'text',
					question: `${f.left} = @ ${f.answerUnit}`,
					answer: String(f.answer),
				};
			}
			return generateConversion(config.conversions);
		},
		// Le tableau est corrigé cellule par cellule par son runner : jamais de correction
		// numérique générique (cohérent avec checkAnswer qui exclut déjà ce type). Garde-fou
		// pour un futur appelant qui passerait un tableau à ce `check`.
		check: (ex, input) => (ex.type === 'tableauConversion' ? false : checkNumerique(ex, input)),
	};
}

/* ---------- Configurations par niveau (#287) ---------- */

/* Repères culturels de durée, communs CE2/CM1 (mémorisés, pas calculés). */
const DUREE_FACTS: Fact[] = [
	{ left: 'une demi-heure', answerUnit: 'min', answer: 30 },
	{ left: "un quart d'heure", answerUnit: 'min', answer: 15 },
	{ left: "trois quarts d'heure", answerUnit: 'min', answer: 45 },
	{ left: 'une heure et demie', answerUnit: 'min', answer: 90 },
	{ left: 'une heure et quart', answerUnit: 'min', answer: 75 },
];

/* ---------- Étayage de la notion (#490) ----------
   DEUX entrées par leçon, une par mode, parce que ce ne sont pas les mêmes méthodes.

   Mode TABLEAU (entrée la plus spécifique, elle gagne quand ce mode est actif) : la
   méthode y est mécanisable (des rangs, un chiffre par case) et le déroulé montre
   exactement le tableau que l'enfant remplit. L'exemple est FIXE et va de la GRANDE unité
   vers la petite : c'est le sens où les colonnes intermédiaires sont vides, donc celui où
   se joue la seule vraie difficulté (le 0 qui tient un rang, cf. `explicationTransit` côté
   runner). Les colonnes hors des paires étudiées sont marquées `transit`, comme dans
   l'exercice réel — même géométrie, mêmes codes visuels.

   Mode SAISIE (entrée sans `mode`, donc servie partout ailleurs) : pas de tableau à
   remplir, donc rien à dérouler ; c'est le texte rédigé annoncé par #490. Il fallait
   l'écrire, et pas seulement le prévoir : `saisie` est le mode RECOMMANDÉ de ces trois
   leçons, si bien que l'entrée « tableau » seule laissait sans panneau le mode où les
   enfants travaillent le plus (constat de l'`auteur-tests-logique`). */
/* Chiffres d'une quantité étalés un par colonne, la TÊTE (colonne 0) absorbant tous les
   rangs supérieurs. Partagé par l'exercice et par l'exemple d'étayage : c'est ce qui les
   empêche de diverger. */
function chiffresParColonne(total: number, n: number): string[] {
	return Array.from({ length: n }, (_, i) =>
		i === 0
			? String(Math.floor(total / 10 ** (n - 1)))
			: String(Math.floor(total / 10 ** (n - 1 - i)) % 10),
	);
}

/* Exemple d'étayage CONSTRUIT par le moteur (#711) : même tranche, mêmes colonnes démotées
   et mêmes chiffres que l'exercice réel du niveau. Écrit à la main, il dérivait dès qu'une
   échelle bougeait — et c'est exactement ce qui vient d'arriver : l'exemple des longueurs
   montrait quatre colonnes là où l'exercice en affiche désormais sept. `valeur` est exprimée
   dans l'unité `depart`, toujours la plus GRANDE des deux : c'est le sens où les colonnes
   intermédiaires sont vides, donc celui où se joue la seule vraie difficulté (le 0 qui tient
   un rang). */
function exempleTableau(
	config: MesureConfig,
	depart: string,
	valeur: number,
	cible: string,
): { colonnes: ColonneExemple[]; depart: string; cible: string } {
	const span = trancheFixe(config.echelle!, config.conversions);
	const etudiees = new Set(config.conversions.flatMap((c) => [c.big, c.small]));
	const iDepart = span.findIndex((u) => u.unite === depart);
	const chiffres = chiffresParColonne(valeur * 10 ** (span.length - 1 - iDepart), span.length);
	return {
		colonnes: span.map((u, i) => ({
			unite: u.unite,
			nom: u.nom,
			chiffres: chiffres[i],
			...(etudiees.has(u.unite) ? {} : { transit: true }),
		})),
		depart,
		cible,
	};
}

function etayageConversion(
	titre: string,
	// Un exemple PAR NIVEAU (#711) : la tranche de colonnes n'est plus la même au CE2 et au
	// CM1 (le CM1 ouvre toute la chaîne de rangs), donc un exemple unique en montrerait un
	// faux à l'un des deux. `EtayageEntree` sait se scoper par niveau, l'entrée la plus
	// spécifique gagnant.
	exemples: { niveau: 'ce2' | 'cm1'; colonnes: ColonneExemple[]; depart: string; cible: string }[],
	saisie: { titre: string; regle: string; etapes: string[] },
): NonNullable<LessonInput['etayage']> {
	return [
		...exemples.map(({ niveau, ...spec }) => ({
			niveau,
			mode: 'tableau' as const,
			contenu: {
				titre,
				// L'idée-force, sous les yeux à chaque pas. Elle ne dit ni « ajoute des zéros » ni
				// « décale la virgule » : ces raccourcis marchent sur les entiers et cassent au
				// premier décimal (3,2 km = 3 200 m, pas 32 000).
				regle:
					'Chaque colonne est une unité : tu écris un chiffre par colonne, et un 0 ' +
					"quand il n'y a rien à compter dans cette unité-là.",
				exemple: { moteur: 'conversion' as const, spec },
			},
		})),
		etayageRedige(saisie.titre, saisie.regle, saisie.etapes),
	];
}

/* ---------- Descripteurs des quatre leçons (#89) ---------- */

/* Configurations par leçon, sorties du combinateur pour être RELUES par les exemples
   d'étayage (`exempleTableau`) : l'exemple montré à l'enfant est alors calculé sur la même
   tranche et les mêmes relations que ses exercices, et ne peut plus dériver. */
const CONFIG_LONGUEURS: Record<'ce2' | 'cm1', MesureConfig> = {
	// CE2 : m↔cm, km↔m, ET cm↔mm / m↔mm (mm de longueur = CE2).
	ce2: {
		echelle: ECHELLE_LONGUEUR,
		conversions: [
			{ big: 'm', small: 'cm', factor: 100 },
			{ big: 'km', small: 'm', factor: 1000 },
			{ big: 'cm', small: 'mm', factor: 10 },
			{ big: 'm', small: 'mm', factor: 1000 },
		],
	},
	// CM1 : mêmes unités en 1–20, + le dm (m↔dm, dm↔cm). Décimaux (#248) : les
	// paires ×10 (cm↔mm, dm↔cm, m↔dm) en décimal dans les deux sens ; m↔cm (×100)
	// en décimal petite→grande (« 456 cm = 4,56 m »), l'entier grande→petite gardé ;
	// km↔m et m↔mm (×1000) restent ENTIÈRES (décimal < 1 hors programme).
	cm1: {
		echelle: ECHELLE_LONGUEUR,
		conversions: [
			{ big: 'm', small: 'cm', factor: 100, maxBig: 20, decimal: 'vers-grande' },
			{ big: 'km', small: 'm', factor: 1000, maxBig: 20 },
			{ big: 'cm', small: 'mm', factor: 10, maxBig: 20, decimal: 'deux-sens' },
			{ big: 'm', small: 'mm', factor: 1000, maxBig: 20 },
			{ big: 'dm', small: 'cm', factor: 10, maxBig: 20, decimal: 'deux-sens' },
			{ big: 'm', small: 'dm', factor: 10, maxBig: 20, decimal: 'deux-sens' },
			// Pas de rang ouverts par #711 pour que hm et dam cessent d'être « pas encore vus »
			// alors que le programme CM1 nomme les unités « du millimètre au kilomètre ».
			// Entiers : une longueur décimale en hectomètres n'a aucun référent réel.
			{ big: 'km', small: 'hm', factor: 10, maxBig: 20, consolidation: true },
			{ big: 'hm', small: 'dam', factor: 10, maxBig: 20, consolidation: true },
			{ big: 'dam', small: 'm', factor: 10, maxBig: 20, consolidation: true },
		],
	},
};

const CONFIG_MASSES: Record<'ce2' | 'cm1', MesureConfig> = {
	ce2: { echelle: ECHELLE_MASSE, conversions: [{ big: 'kg', small: 'g', factor: 1000 }] },
	// CM1 : 1–20, + g↔mg. Aucune paire ×10/×100 n'existe en masse → pas de
	// conversion décimale générique ; on ancre plutôt des REPÈRES décimaux mémorisés
	// (#248) via les facts : le demi-kilo en toutes lettres + les écritures à virgule
	// 0,5 kg = 500 g et 0,25 kg = 250 g (correspondance décimal ↔ grammes).
	cm1: {
		echelle: ECHELLE_MASSE,
		conversions: [
			{ big: 'kg', small: 'g', factor: 1000, maxBig: 20 },
			{ big: 'g', small: 'mg', factor: 1000, maxBig: 20 },
			// Chaîne de rangs ouverte par #711 : le programme CM1 nomme les unités « du
			// milligramme au kilogramme », alors que hg/dag/dg/cg ne figuraient dans aucune
			// relation et restaient donc affichés « pas encore vus en classe ». Entiers, et
			// jamais décimaux : « 4,5 dag » ne se rencontre nulle part, contrairement à
			// « 4,5 kg » (avis pedagogue-primaire).
			{ big: 'kg', small: 'hg', factor: 10, maxBig: 20, consolidation: true },
			{ big: 'hg', small: 'dag', factor: 10, maxBig: 20, consolidation: true },
			{ big: 'dag', small: 'g', factor: 10, maxBig: 20, consolidation: true },
			{ big: 'g', small: 'dg', factor: 10, maxBig: 20, consolidation: true },
			{ big: 'dg', small: 'cg', factor: 10, maxBig: 20, consolidation: true },
			{ big: 'cg', small: 'mg', factor: 10, maxBig: 20, consolidation: true },
		],
		facts: [
			{ left: 'un demi-kilogramme', answerUnit: 'g', answer: 500 },
			{ left: '0,5 kg', answerUnit: 'g', answer: 500 },
			{ left: '0,25 kg', answerUnit: 'g', answer: 250 },
		],
	},
};

const CONFIG_CONTENANCES: Record<'ce2' | 'cm1', MesureConfig> = {
	// CE2 : L↔cL ET L↔dL (le dL est au programme) ; PAS le mL (CM1).
	ce2: {
		echelle: ECHELLE_CONTENANCE,
		conversions: [
			{ big: 'L', small: 'cL', factor: 100, maxBig: 12 },
			{ big: 'L', small: 'dL', factor: 10, maxBig: 12 },
		],
	},
	// CM1 : 1–20, + L↔mL (×1000, franchit le millier). Décimaux (#248) : L↔dL (×10)
	// en décimal dans les deux sens ; L↔cL (×100) en décimal petite→grande
	// (« 456 cL = 4,56 L »), l'entier grande→petite gardé ; L↔mL (×1000) ENTIÈRE.
	cm1: {
		echelle: ECHELLE_CONTENANCE,
		conversions: [
			{ big: 'L', small: 'cL', factor: 100, maxBig: 20, decimal: 'vers-grande' },
			{ big: 'L', small: 'dL', factor: 10, maxBig: 20, decimal: 'deux-sens' },
			{ big: 'L', small: 'mL', factor: 1000, maxBig: 20 },
			// Haut de l'échelle ouvert par #711 (programme CM1 : « du millilitre à
			// l'hectolitre »). L'hectolitre a un ancrage réel (récolte, cuves) ; le décalitre
			// n'en a aucun dans la France d'aujourd'hui — on l'exerce comme rouage du tableau,
			// jamais comme une contenance qu'on rencontrerait.
			{ big: 'hL', small: 'L', factor: 100, maxBig: 20, consolidation: true },
			{ big: 'hL', small: 'daL', factor: 10, maxBig: 20, consolidation: true },
			{ big: 'daL', small: 'L', factor: 10, maxBig: 20, consolidation: true },
		],
	},
};

export const MESURE_LESSONS: LessonInput[] = [
	{
		id: 'mes-longueurs',
		label: 'Je convertis les longueurs',
		exerciseType: calibrated<MesureConfig>(CONFIG_LONGUEURS, conversionType),
		// Exemple 3 km = 3 000 m, CONSTRUIT par le moteur pour chaque niveau : le CE2 le voit avec
		// ses colonnes démotées, le CM1 avec la chaîne de rangs complète. Même géométrie que
		// l'exercice réel, par construction — un exemple écrit à la main mentait dès qu'une
		// échelle bougeait.
		etayage: etayageConversion(
			'Le tableau de conversion des longueurs',
			[
				{ niveau: 'ce2', ...exempleTableau(CONFIG_LONGUEURS.ce2, 'km', 3, 'm') },
				{ niveau: 'cm1', ...exempleTableau(CONFIG_LONGUEURS.cm1, 'km', 3, 'm') },
			],
			{
				titre: 'Convertir une longueur',
				regle: 'Une grande unité contient plusieurs petites : il faut savoir combien.',
				etapes: [
					'Retiens les repères : 1 km = 1 000 m, 1 m = 100 cm, 1 cm = 10 mm.',
					'Vers la PETITE unité, multiplie : 3 km, cela fait 3 × 1 000 = 3 000 m.',
					'Vers la GRANDE unité, divise : 300 cm, cela fait 300 ÷ 100 = 3 m.',
				],
			},
		),
	},
	{
		id: 'mes-masses',
		label: 'Je convertis les masses',
		exerciseType: calibrated<MesureConfig>(CONFIG_MASSES, conversionType),
		// Exemple 2 kg = 2 000 g, CONSTRUIT par le moteur pour chaque niveau : le CE2 le voit avec
		// ses colonnes démotées, le CM1 avec la chaîne de rangs complète. Même géométrie que
		// l'exercice réel, par construction — un exemple écrit à la main mentait dès qu'une
		// échelle bougeait.
		etayage: etayageConversion(
			'Le tableau de conversion des masses',
			[
				{ niveau: 'ce2', ...exempleTableau(CONFIG_MASSES.ce2, 'kg', 2, 'g') },
				{ niveau: 'cm1', ...exempleTableau(CONFIG_MASSES.cm1, 'kg', 2, 'g') },
			],
			{
				titre: 'Convertir une masse',
				regle: 'Une grande unité contient plusieurs petites : il faut savoir combien.',
				etapes: [
					'Retiens les repères : 1 kg = 1 000 g, et 1 g = 1 000 mg.',
					'Vers la PETITE unité, multiplie : 2 kg, cela fait 2 × 1 000 = 2 000 g.',
					'Vers la GRANDE unité, divise : 3 000 g, cela fait 3 000 ÷ 1 000 = 3 kg.',
				],
			},
		),
	},
	{
		id: 'mes-contenances',
		label: 'Je convertis les contenances',
		exerciseType: calibrated<MesureConfig>(CONFIG_CONTENANCES, conversionType),
		// 5 L = 500 cL : deux colonnes vides, toutes deux ÉTUDIÉES (aucune de transit dans
		// cet empan) — l'exemple montre donc le 0 de rang sans le mêler au code « unité pas
		// Exemple 5 L = 500 cL, CONSTRUIT par le moteur pour chaque niveau : le CE2 le voit avec
		// ses colonnes démotées, le CM1 avec la chaîne de rangs complète. Même géométrie que
		// l'exercice réel, par construction — un exemple écrit à la main mentait dès qu'une
		// échelle bougeait.
		etayage: etayageConversion(
			'Le tableau de conversion des contenances',
			[
				{ niveau: 'ce2', ...exempleTableau(CONFIG_CONTENANCES.ce2, 'L', 5, 'cL') },
				{ niveau: 'cm1', ...exempleTableau(CONFIG_CONTENANCES.cm1, 'L', 5, 'cL') },
			],
			{
				titre: 'Convertir une contenance',
				regle: 'Une grande unité contient plusieurs petites : il faut savoir combien.',
				etapes: [
					'Retiens les repères : 1 L = 10 dL, 1 L = 100 cL, 1 L = 1 000 mL.',
					'Vers la PETITE unité, multiplie : 5 L, cela fait 5 × 100 = 500 cL.',
					'Vers la GRANDE unité, divise : 300 cL, cela fait 300 ÷ 100 = 3 L.',
				],
			},
		),
	},
	{
		id: 'mes-durees',
		label: 'Je convertis les durées',
		exerciseType: calibrated<MesureConfig>(
			{
				// CE2 : h↔min jusqu'à 4 h + repères culturels. JAMAIS min↔s.
				ce2: {
					conversions: [{ big: 'h', small: 'min', factor: 60, maxBig: 4 }],
					facts: DUREE_FACTS,
				},
				// CM1 : h↔min jusqu'à 10 h + min↔s (×60, 1–5 min) + les GRANDES unités de
				// temps (#252). On ne retient que les relations EXACTES entre unités (jamais
				// 1 an = 365 jours ni 52 semaines, non exactes) ; `maxBig` modeste (9) pour des
				// nombres CM1 raisonnables. Les unités-mots sont accordées au pluriel par
				// `uniteAccordee` (« 3 siècles = 300 ans », « 1 jour = 24 h »).
				cm1: {
					conversions: [
						{ big: 'h', small: 'min', factor: 60, maxBig: 10 },
						{ big: 'min', small: 's', factor: 60, maxBig: 5 },
						{ big: 'siècle', small: 'an', factor: 100, maxBig: 9 },
						{ big: 'an', small: 'mois', factor: 12, maxBig: 9 },
						{ big: 'semaine', small: 'jour', factor: 7, maxBig: 9 },
						{ big: 'jour', small: 'h', factor: 24, maxBig: 9 },
					],
					facts: DUREE_FACTS,
				},
			},
			conversionType,
		),
		// La seule leçon de conversion SANS tableau (cf. `etayageConversion` plus haut) : les
		// durées ne sont pas décimales, donc il n'y a pas de colonne à décaler. Son étayage
		// est donc rédigé, et il dit d'abord ce qui la distingue de ses trois voisines —
		// un enfant qui applique le tableau des longueurs aux heures trouve 1 h = 100 min.
		etayage: [
			etayageRedige(
				'Convertir des durées',
				'Les durées ne se comptent pas par 10 : 1 h = 60 min, 1 jour = 24 h, 1 an = 12 mois.',
				[
					'Repère les deux unités et le nombre qui les relie (des heures en minutes : 60).',
					'Vers la PETITE unité, on multiplie : 4 h = 4 × 60 = 240 min.',
					'Vers la GRANDE unité, on divise : 180 min = 180 ÷ 60 = 3 h.',
				],
			),
		],
	},
];
