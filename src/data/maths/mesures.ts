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
import type { LessonInput } from '../_shared';
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
const ECHELLE_CONTENANCE: EchelleUnite[] = [
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

function pickConversionInstance(conversions: Conversion[]): ConvInstance {
	const c = choice(conversions);
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

/* Génère un exercice « tableau de conversion » (#394) à partir de la MÊME instance que la
   saisie. Empan VARIABLE par exercice : on n'affiche que la tranche contiguë de l'échelle de
   la grande unité de la paire à la petite (« 3 km = ? m » → km·hm·dam·m, jamais km→mm). La
   quantité, exprimée dans la petite unité (`sPetit`, entière), s'étale un chiffre par colonne,
   la colonne de tête absorbant les chiffres de poids fort (1-2 chiffres, `maxBig ≤ 20`).
   INVARIANT (à ne pas casser) : zéro-de-transit et virgule ne coexistent JAMAIS dans le même
   exercice. Les colonnes de transit (hm/dam, hg-dag-dg-cg — unités NON étudiées au niveau)
   n'apparaissent que sur les paires ×1000 STRICTEMENT entières (aucune virgule) ; une virgule
   n'apparaît que sur les paires ×10/×100 décimales, dont toutes les unités intermédiaires sont
   déjà enseignées (donc AUCUNE colonne de transit). `virguleApres` est posé même si l'app rend
   la virgule fixe en v1 (donnée générique, ouvre une saisie de la virgule sans refonte). */
function generateTableau(config: MesureConfig): Exercise {
	const echelle = config.echelle!;
	const inst = pickConversionInstance(config.conversions);
	// Unités ÉTUDIÉES au niveau = celles qui figurent dans ses conversions ; les autres
	// colonnes de l'empan sont « de transit » (en-tête démoté + case pointillés).
	const etudiees = new Set<string>();
	for (const c of config.conversions) {
		etudiees.add(c.big);
		etudiees.add(c.small);
	}
	const iBig = echelle.findIndex((u) => u.unite === inst.big);
	const iSmall = echelle.findIndex((u) => u.unite === inst.small);
	// Garde-fou : une unité d'une `Conversion` absente de l'échelle de sa famille (typo au
	// prochain ajout) produirait un empan silencieusement faux — mieux vaut échouer net.
	if (iBig < 0 || iSmall < 0) {
		throw new Error(`Tableau : unité hors échelle (${inst.big} / ${inst.small})`);
	}
	const span = echelle.slice(iBig, iSmall + 1);
	const m = iSmall - iBig; // nombre de crans entre grande et petite ; facteur = 10^m
	const colonnes: TableauColonne[] = span.map((u, i) => ({
		unite: u.unite,
		nom: u.nom,
		transit: !etudiees.has(u.unite),
		// Tête (i = 0) : tous les chiffres de poids fort (⌊sPetit / 10^m⌋, 1-2 chiffres) ;
		// colonnes suivantes : le chiffre du rang correspondant.
		chiffres:
			i === 0
				? String(Math.floor(inst.sPetit / 10 ** m))
				: String(Math.floor(inst.sPetit / 10 ** (m - i)) % 10),
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
   Réservé au mode TABLEAU : c'est lui qui rend la méthode mécanisable (des rangs, un
   chiffre par case), et le déroulé montre exactement le tableau que l'enfant remplit. Le
   mode SAISIE, lui, ne se ramène pas à une seule méthode (repères mémorisés, ×10 ou ÷10
   selon le sens) : il relèvera d'un texte rédigé, pas d'une résolution générée.

   L'exemple est FIXE et va de la GRANDE unité vers la petite : c'est le sens où les
   colonnes intermédiaires sont vides, donc celui où se joue la seule vraie difficulté (le
   0 qui tient un rang, cf. `explicationTransit` côté runner). Les colonnes hors des paires
   étudiées sont marquées `transit`, comme dans l'exercice réel — même géométrie, mêmes
   codes visuels. */
function etayageTableau(
	titre: string,
	colonnes: { unite: string; nom: string; chiffres: string; transit?: boolean }[],
	depart: string,
	cible: string,
): NonNullable<LessonInput['etayage']> {
	return [
		{
			mode: 'tableau',
			contenu: {
				titre,
				// L'idée-force, sous les yeux à chaque pas. Elle ne dit ni « ajoute des zéros » ni
				// « décale la virgule » : ces raccourcis marchent sur les entiers et cassent au
				// premier décimal (3,2 km = 3 200 m, pas 32 000).
				regle:
					'Chaque colonne est une unité : tu écris un chiffre par colonne, et un 0 ' +
					"quand il n'y a rien à compter dans cette unité-là.",
				exemple: { moteur: 'conversion', spec: { colonnes, depart, cible } },
			},
		},
	];
}

/* ---------- Descripteurs des quatre leçons (#89) ---------- */

export const MESURE_LESSONS: LessonInput[] = [
	{
		id: 'mes-longueurs',
		label: 'Je convertis les longueurs',
		exerciseType: calibrated<MesureConfig>(
			{
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
					],
				},
			},
			conversionType,
		),
		// 3 km = 3 000 m : trois colonnes à remplir de 0, dont deux de transit.
		etayage: etayageTableau(
			'Le tableau de conversion des longueurs',
			[
				{ unite: 'km', nom: 'kilomètre', chiffres: '3' },
				{ unite: 'hm', nom: 'hectomètre', chiffres: '0', transit: true },
				{ unite: 'dam', nom: 'décamètre', chiffres: '0', transit: true },
				{ unite: 'm', nom: 'mètre', chiffres: '0' },
			],
			'km',
			'm',
		),
	},
	{
		id: 'mes-masses',
		label: 'Je convertis les masses',
		exerciseType: calibrated<MesureConfig>(
			{
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
					],
					facts: [
						{ left: 'un demi-kilogramme', answerUnit: 'g', answer: 500 },
						{ left: '0,5 kg', answerUnit: 'g', answer: 500 },
						{ left: '0,25 kg', answerUnit: 'g', answer: 250 },
					],
				},
			},
			conversionType,
		),
		// 2 kg = 2 000 g : mêmes trois colonnes vides, sur une autre grandeur.
		etayage: etayageTableau(
			'Le tableau de conversion des masses',
			[
				{ unite: 'kg', nom: 'kilogramme', chiffres: '2' },
				{ unite: 'hg', nom: 'hectogramme', chiffres: '0', transit: true },
				{ unite: 'dag', nom: 'décagramme', chiffres: '0', transit: true },
				{ unite: 'g', nom: 'gramme', chiffres: '0' },
			],
			'kg',
			'g',
		),
	},
	{
		id: 'mes-contenances',
		label: 'Je convertis les contenances',
		exerciseType: calibrated<MesureConfig>(
			{
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
					],
				},
			},
			conversionType,
		),
		// 5 L = 500 cL : deux colonnes vides, toutes deux ÉTUDIÉES (aucune de transit dans
		// cet empan) — l'exemple montre donc le 0 de rang sans le mêler au code « unité pas
		// encore vue en classe ».
		etayage: etayageTableau(
			'Le tableau de conversion des contenances',
			[
				{ unite: 'L', nom: 'litre', chiffres: '5' },
				{ unite: 'dL', nom: 'décilitre', chiffres: '0' },
				{ unite: 'cL', nom: 'centilitre', chiffres: '0' },
			],
			'L',
			'cL',
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
	},
];
