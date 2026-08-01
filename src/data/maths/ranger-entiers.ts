/* ============================================================
   Numération — « Je range les nombres » (#448) : ordonner une petite série
   d'entiers dans l'ordre croissant OU décroissant (CE2).
   ------------------------------------------------------------
   3ᵉ pilier du paragraphe programme « comparer, encadrer, intercaler »
   (programme 2025 : « Ordonner des nombres dans l'ordre croissant ou
   décroissant »), dont les deux premiers sont déjà couverts par maths/numeration.ts
   (#98). Ici l'enfant ne CHOISIT pas une suite bien rangée : il la CONSTRUIT, en
   posant 4 à 5 tuiles-nombres dans des cases numérotées (type d'exercice
   `tuilesOrdre`, runner ui/lecon-ordre.ts, déjà utilisé par l'ordre alphabétique
   #108). L'ordre proposé par l'enfant est donc lisible tel quel — c'est ce que
   journalise le runner en cas d'erreur (#391).

   Calibrage CE2 (programme : « quantités et nombres jusqu'à 10 000 ») :
   - PLAFOND EFFECTIF 9 999. Le nombre 10 000 lui-même est écarté : c'est le seul
     de la plage que `formatNombre` groupe (« 10 000 », espace fine insécable), ce
     qui rendrait la saisie du repli texte (fiche/bilan) ambiguë — « 9998 9999 10 000 »
     ne se distingue plus d'une liste de 4 nombres. Toute extension CM1 (999 999)
     devra donc revoir ce repli, pas seulement les plages.
   - séries CALIBRÉES pour forcer la comparaison rang par rang : la lecture des
     seules longueurs ou du seul chiffre de tête ne suffit pas à ranger (profils
     `memeTete` et `permutation`, 45 % des tirages) ;
   - CAS CHARNIÈRE : franchissement de 99/100 et de 999/1000 (40 % des tirages),
     là où « plus de chiffres = plus grand » doit primer sur la comparaison
     chiffre à chiffre de gauche à droite (« 8 > 1 donc 87 > 105 ») ;
   - le profil LISIBLE « longueurs mêlées » (nombres à 2, 3 et 4 chiffres) pèse
     15 % : il se range presque à vue, et c'est précisément son rôle — garantir
     des réussites franches dans une séance de 6 questions ;
   - la TAILLE de série (4 ou 5) n'est pas tirée à part : elle est COUPLÉE au
     profil, pour ne jamais cumuler « 5 tuiles » et « comparaison la plus
     coûteuse » (cf. TAILLE_PIEGE / tailleLisible).

   La bonne suite est TOUJOURS calculée par tri numérique (jamais codée en dur), et
   le sens (croissant/décroissant) est tiré PAR QUESTION — ce n'est pas un mode
   (#69 : un mode change le moyen de répondre, pas le fait généré).
   ============================================================ */
import type { Exercise, ExerciseType } from '../../core/exercise';
// Même descripteur que les autres leçons de la rubrique « Numération » (niveaux
// optionnels) : les trois listes sont mappées par le MÊME appel à `toLessonDefs`
// (core/catalog.ts), qui lit `d.levels` — un descripteur sans ce champ casserait le
// typage de l'union. `num-ranger` reste CE2-only : elle ne le renseigne pas (défaut).
import type { NumerationLessonDef } from './numeration';
import { rnd, choice, sample, melangerDifferemment } from '../../core/utils';
import { formatNombre } from '../../core/nombres';

/* Plafond de la plage CE2 (cf. en-tête : 10 000 exclu). */
const MAX_CE2 = 9999;

/* ---------- Taille de série COUPLÉE au profil (avis pedagogue-primaire) ----------
   La charge d'un rangement = nombre d'éléments × complexité d'une comparaison, et
   l'enfant enchaîne 6 comparaisons (4 tuiles) à 10 (5 tuiles) par question. Tirer la
   taille INDÉPENDAMMENT du profil laissait donc sortir le pire cumul que la leçon
   puisse produire (5 tuiles × comparaison rang par rang sur 4 chiffres) et, à
   l'inverse, permettait au profil le plus lisible de se limiter à 4.
   - profils PIÈGE (même tête en base 4 chiffres, chiffres permutés, charnières) :
     plafonnés à 4 tuiles ;
   - profils LISIBLES (longueurs mêlées, même tête en base 3 chiffres) : seuls à
     pouvoir aller jusqu'à 5 (4 ou 5, pour que la longueur de rangée varie encore). */
const TAILLE_PIEGE = 4;
const tailleLisible = (): number => choice([4, 5]);

/* ---------- Profils de série ----------
   Chaque profil renvoie des entiers DISTINCTS de la plage CE2 et décide LUI-MÊME
   combien (cf. ci-dessus). La pondération est la garantie de calibrage (cf. en-tête) :
   elle est lisible en un seul endroit, `tireSerie`. */

/* Ajoute des tirages jusqu'à obtenir `n` valeurs distinctes. Garde-fou de boucle :
   les plages appelantes offrent toujours largement plus de `n` valeurs. */
function completer(valeurs: Set<number>, n: number, tirage: () => number): number[] {
	for (let garde = 0; valeurs.size < n && garde < 200; garde++) valeurs.add(tirage());
	return [...valeurs];
}

/* Même « tête » : tous les nombres partagent leurs chiffres de tête et ne diffèrent
   que par les deux derniers rangs (dizaines/unités) → le rangement se joue rang par
   rang. Deux nombres partagent en plus la même dizaine (ex. 3204 / 3209) : au moins
   une comparaison se décide sur le chiffre des unités. La base commande la taille :
   3 chiffres (comparaison plus légère) → 4 ou 5 tuiles ; 4 chiffres → 4 tuiles. */
function serieMemeTete(): number[] {
	const troisChiffres = choice([true, false]);
	const base = troisChiffres
		? rnd(1, 9) * 100 // 3 chiffres : 4xx
		: rnd(1, 9) * 1000 + rnd(0, 9) * 100; // 4 chiffres : 3 2xx
	const n = troisChiffres ? tailleLisible() : TAILLE_PIEGE;
	const valeurs = new Set<number>();
	const o1 = rnd(0, 99);
	valeurs.add(base + o1);
	const dizaine = Math.floor(o1 / 10) * 10;
	let o2 = dizaine + rnd(0, 9);
	while (o2 === o1) o2 = dizaine + rnd(0, 9);
	valeurs.add(base + o2);
	return completer(valeurs, n, () => base + rnd(0, 99));
}

/* Mêmes chiffres permutés (476 / 746 / 674 / 467) : la longueur et l'ensemble des
   chiffres n'apprennent rien, seule la POSITION décide. Chiffres tirés dans 1..9
   (aucun 0 → toute permutation reste un nombre de la même longueur). Le plus exigeant
   des cinq profils → toujours 4 tuiles (et 3 chiffres = 6 permutations, largement
   assez pour en tirer 4 distinctes). */
function seriePermutation(): number[] {
	const taille = choice([3, 4]);
	const chiffres = sample([1, 2, 3, 4, 5, 6, 7, 8, 9], taille);
	const valeurs = new Set<number>();
	const tirage = () => Number(sample(chiffres, taille).join(''));
	return completer(valeurs, TAILLE_PIEGE, tirage);
}

/* Cas charnière : la série FRANCHIT une barre ronde (100 ou 1000), avec au moins un
   nombre juste en dessous et un juste au-dessus (à 5 près). C'est là que « le nombre
   qui a le plus de chiffres est le plus grand » doit primer sur la lecture chiffre à
   chiffre (« 8 > 1 donc 87 > 105 »). Le reste de la série est tiré autour de la barre. */
function serieCharniere(barre: 100 | 1000): number[] {
	const marge = barre === 100 ? 20 : 30;
	const valeurs = new Set<number>();
	valeurs.add(barre - rnd(1, 5)); // juste avant la barre (99, 998…)
	valeurs.add(barre + rnd(0, 4)); // la barre elle-même ou juste après
	// Profil piège (la barre franchie est LE piège) → 4 tuiles.
	return completer(valeurs, TAILLE_PIEGE, () =>
		choice([true, false]) ? barre - rnd(1, marge) : barre + rnd(0, marge),
	);
}

/* Longueurs mêlées : des nombres à 2, 3 et 4 chiffres. Le plus LISIBLE des profils
   (« plus de chiffres = plus grand » se voit d'un coup d'œil), donc l'un des deux
   autorisés à monter à 5 tuiles ; il installe la règle de longueur et — objectif du
   pédagogue — garantit des réussites franches dans une séance. Il reste une vraie tâche
   de rangement : 4 ou 5 nombres pour 3 longueurs, donc au moins deux nombres à comparer
   à longueur égale. */
function serieLongueursMelees(): number[] {
	const valeurs = new Set<number>([rnd(10, 99), rnd(100, 999), rnd(1000, MAX_CE2)]);
	return completer(valeurs, tailleLisible(), () =>
		choice([rnd(10, 99), rnd(100, 999), rnd(1000, MAX_CE2)]),
	);
}

/* Tire une série selon la pondération de calibrage : 30 % même tête (moitié en base
   3 chiffres, moitié en base 4), 15 % chiffres permutés, 20 % charnière 99/100, 20 %
   charnière 999/1000, 15 % longueurs mêlées.
   - les deux charnières cumulent 40 % → sur une leçon de 6 questions, il en tombe au
     moins une dans ~95 % des cas ;
   - le profil LISIBLE est passé de 10 à 15 % (et non 20 : arbitrage pedagogue-primaire).
     La FRÉQUENCE est le seul levier qui restait à régler — le facteur de CHARGE, lui, est
     déjà traité par le couplage taille/profil ci-dessus (une permutation à 5 tuiles
     n'existe plus), donc rien ne justifie de le pousser au maximum. À 15 %, la garantie
     de réussites franches est déjà acquise (mesure : un profil lisible dans ~90 % des
     séances de 6, en comptant la même tête en base 3 chiffres) ;
   - les chiffres permutés restent donc à 15 % : c'est le profil qui exerce le plus
     finement la VALEUR POSITIONNELLE (aucun raccourci de longueur ni de chiffre de
     tête) ; à 10 % il devenait anecdotique au regard de sa valeur formative. */
function tireSerie(): number[] {
	const r = rnd(1, 100);
	if (r <= 30) return serieMemeTete();
	if (r <= 45) return seriePermutation();
	if (r <= 65) return serieCharniere(100);
	if (r <= 85) return serieCharniere(1000);
	return serieLongueursMelees();
}

/* ---------- Fabrique d'exercice ---------- */
/* Libellé d'affichage d'un nombre : `formatNombre` par cohérence avec le reste de la
   numération (no-op sous 10 000, cf. en-tête). Les tuiles et la suite attendue passent
   par le MÊME libellé — le runner compare les cases par libellé exact. */
const affiche = (n: number): string => formatNombre(n);

function rangerFact(): Exercise {
	const croissant = rnd(0, 1) === 0;
	const nombres = tireSerie();
	const tries = [...nombres].sort((a, b) => a - b);
	const ordre = (croissant ? tries : [...tries].reverse()).map(affiche);
	return {
		type: 'tuilesOrdre',
		// Consigne d'action complète (#265) : elle dit quoi faire ET dans quel sens, sans
		// répéter les nombres (ils sont sous les yeux, sur les tuiles).
		question: `Range ces nombres du plus ${croissant ? 'petit au plus grand' : 'grand au plus petit'}.`,
		tuiles: melangerDifferemment(ordre),
		ordre,
		nature: 'nombres',
	};
}

/* Fabrique l'ExerciseType mono-mode « je range les tuiles ». Le runner d'écran
   (ui/lecon-ordre.ts) corrige case par case en comparant à `ordre` ; `check()` ne
   sert qu'au repli texte de la fiche / du bilan : les nombres écrits dans l'ordre,
   séparés par des espaces, des virgules ou des points-virgules. La comparaison se
   fait sur les VALEURS (suite de chiffres extraite), ce qui reste sans ambiguïté
   tant que les nombres ne sont pas groupés (plage CE2, cf. en-tête). */
function rangerType(): ExerciseType {
	return {
		// Rangement d'une suite (#108) : classé sans appeler generate() (#348), hors sprint.
		exerciseKind: 'tuilesOrdre',
		modes: [
			{
				id: 'tuiles',
				label: 'Je range les nombres',
				hint: 'glisse ou tape les tuiles',
				icon: 'puzzle-piece',
				recommended: true,
			},
		],
		generate: () => rangerFact(),
		check(exercise: Exercise, input: string): boolean {
			if (exercise.type !== 'tuilesOrdre') return false;
			const valeurs = (s: string) => (s.match(/\d+/g) ?? []).join(' ');
			return valeurs(input) === valeurs(exercise.ordre.join(' '));
		},
	};
}

export const RANGER_LESSONS: NumerationLessonDef[] = [
	{
		id: 'num-ranger',
		label: 'Je range les nombres',
		exerciseType: rangerType(),
	},
];
