/* ============================================================
   Représentations composites pour le journal d'erreurs (#391) — logique pure.
   ------------------------------------------------------------
   Certains exercices ne produisent pas une simple paire saisie/réponse : une
   opération posée s'étale sur plusieurs cellules-chiffres, un rangement ou un tri
   portent sur un ENSEMBLE de tuiles. On met ici en forme la « réponse donnée » et
   la « réponse attendue » LISIBLES pour un parent, à partir des données brutes des
   runners — sans DOM, donc testable en isolation. La journalisation elle-même
   reste centralisée dans ui/erreur-capture.ts.

   Le module héberge aussi (#446) la FORMULATION d'une réponse attendue NON UNIQUE
   (intercalation par intervalle) : elle est la même pour le journal encadrant, la révélation
   de la fiche à l'écran (`data-attendue`) et le corrigé imprimé. Un seul endroit pour la lire
   et la faire évoluer — l'éparpiller écran par écran est exactement ce qui avait produit des
   discours contradictoires (« LA bonne réponse » là où douze valeurs étaient acceptées).

   Et (#467) la règle qui décide s'il y a une entrée à écrire du tout quand une question est
   PASSÉE, selon ce que l'enfant avait déjà posé — voir la section ci-dessous.
   ============================================================ */
import { separateurSuite } from './exercise';
import type { NatureOrdre } from './exercise';
import { formatNombre } from './nombres';
import type { Item } from './items';

/* ---------- Question PASSÉE : ce qu'une tentative laisse au journal (#467) ---------- */

/** Ce qu'on sait de la tentative au moment où l'enfant demande à voir la réponse. */
export interface TentativePassee {
	/* A-t-il posé quelque chose ? (case de problème remplie, repère placé sur la droite,
	   au moins une case cochée d'un QCM multi). */
	tentee: boolean;
	/* Ce qu'il avait posé était-il exactement la bonne réponse ? Lu par l'appelant avec SA
	   règle de comparaison (numérique à virgule française, valeur de graduation, grille
	   tout-ou-rien) : c'est la seule chose qui diffère d'un format à l'autre. */
	juste: boolean;
	/* Sa proposition, déjà LISIBLE pour un parent (« 9 », « 3,50 », « rectangle ; carré »). */
	donnee: string;
}

/** Entrée de journal à écrire pour une question passée : réponse donnée + drapeau. */
export interface EntreeTentative {
	donnee: string; // '' quand rien n'avait été tenté
	sansTentative: boolean; // rien tenté → « N'a pas essayé », pas une faute de raisonnement
}

/** Décrit l'entrée de journal d'une tentative sur une question PASSÉE (#467). Trois cas,
    une seule règle — pour les sous-questions d'un problème, la droite graduée et le QCM
    multi, qui l'avaient chacun recopiée :
      - RIEN de posé → entrée marquée `sansTentative`, sans réponse donnée (aveu
        d'ignorance) ;
      - posé et FAUX → vraie entrée d'erreur, avec ce que l'enfant avait proposé : il a bien
        tenté, le marquer « n'a pas essayé » serait un mensonge, et c'est justement sa
        proposition qui dit au parent ce qui coince ;
      - posé et JUSTE → AUCUNE entrée (`null`) : on ne fabrique pas une erreur là où l'enfant
        avait bon (il a pu demander à voir par manque de confiance), et une entrée dont la
        réponse donnée égale la réponse attendue se lirait comme un bug côté encadrant.
    L'ORDRE des deux tests fait partie de la règle : « rien de posé » l'emporte sur « juste »,
    sinon une case vide serait déclarée juste sur une réponse attendue de 0 (`Number('')`
    vaut 0) et disparaîtrait du journal. */
export function entreeTentativePassee(t: TentativePassee): EntreeTentative | null {
	if (!t.tentee) return { donnee: '', sansTentative: true };
	if (t.juste) return null;
	return { donnee: t.donnee, sansTentative: false };
}

/* ---------- Intercalation (réponse corrigée par intervalle ouvert) ---------- */
/* La bande elle-même, formulée comme l'énoncé (« Place un nombre entre 450 et 465 ») : mêmes
   bornes exclues, même groupement des grands nombres. Source unique des deux tournures
   ci-dessous, pour qu'elles ne divergent jamais. */
function bandeIntervalle([min, max]: [number, number]): string {
	return `entre ${formatNombre(min)} et ${formatNombre(max)}`;
}

/* Réponse attendue LISIBLE d'une intercalation (#446) : la BANDE acceptée, pas un nombre
   isolé. Sans ça, le parent lit « La bonne réponse : 457 » là où douze valeurs étaient
   acceptées, et croit son enfant plus loin du but qu'il ne l'est. Sert au journal encadrant
   ET à la révélation de la fiche à l'écran (`data-attendue`). */
export function attendueIntervalle(intervalle: [number, number]): string {
	return `un nombre ${bandeIntervalle(intervalle)}`;
}

/* Révélation d'une intercalation dans le CORRIGÉ IMPRIMÉ (#446) : « 457 ou tout nombre entre
   450 et 465 ». L'exemple concret est gardé en tête (l'adulte corrige vite en le comparant),
   la règle est dite juste après — sans quoi le corrigé papier fait barrer des réponses JUSTES,
   alors que la fiche, elle, annonce « (plusieurs réponses possibles) ». On ne recopie pas
   l'énoncé mot pour mot (« un nombre entre… »), qui figure deux lignes plus haut. */
export function corrigeIntercalation(
	exemple: number | string,
	intervalle: [number, number],
): string {
	// L'exemple est GROUPÉ comme les bornes (formatNombre) : sans ça la même phrase écrivait le
	// même ordre de grandeur de deux façons au CM1 (« 8750000 ou tout nombre entre 8 700 000 et
	// 8 800 000 »). Sans effet au CE2 (pas de séparateur sous 10 000). Repli défensif sur la
	// valeur brute si elle n'est pas numérique (jamais le cas d'une intercalation).
	const n = Number(String(exemple).trim());
	const vu =
		String(exemple).trim() !== '' && Number.isFinite(n) ? formatNombre(n) : String(exemple);
	return `${vu} ou tout nombre ${bandeIntervalle(intervalle)}`;
}

/* Réponse attendue LISIBLE d'un item de fiche / sprint / révision : l'`answer` révélée,
   SAUF quand l'item est corrigé par intervalle (intercalation) — auquel cas `answer` n'est
   qu'un EXEMPLE et l'attendu est la bande. Un seul point de vérité pour les trois chemins
   de correction qui journalisent un `Item`. */
export function attendueItem(it: Pick<Item, 'answer' | 'intervalle'>): string {
	return it.intervalle ? attendueIntervalle(it.intervalle) : String(it.answer);
}

/* ---------- Opération posée (cellules-chiffres du résultat) ---------- */
export interface CellulePosee {
	pos: number; // rang du chiffre dans le résultat (0 = le plus à gauche)
	saisie: string; // chiffre saisi ; '' si la cellule est vide
	correct: boolean; // la cellule est-elle juste ?
}
export interface ResultatPosee {
	journaliser: boolean; // l'enfant a tenté ET le résultat n'est pas entièrement juste
	donnee: string; // chiffres assemblés (ordre des positions) ou « (incomplet) »
}

/* Analyse les cellules du résultat d'UNE opération posée pour n'en faire qu'UNE
   entrée d'erreur (pas une par chiffre). On ne journalise que si l'enfant a saisi
   au moins un chiffre (grille vierge = non tentée, comme un champ vide ignoré) ET
   que le résultat n'est pas entièrement juste. `donnee` reconstruit le nombre saisi
   dans l'ordre des positions ; « (incomplet) » si des chiffres manquent. */
export function analyserResultatPosee(cells: CellulePosee[]): ResultatPosee {
	const triees = [...cells].sort((a, b) => a.pos - b.pos);
	const rempli = triees.filter((c) => c.saisie !== '');
	if (rempli.length === 0) return { journaliser: false, donnee: '' };
	if (triees.every((c) => c.correct)) return { journaliser: false, donnee: '' };
	const incomplet = triees.some((c) => c.saisie === '');
	return {
		journaliser: true,
		donnee: incomplet ? '(incomplet)' : triees.map((c) => c.saisie).join(''),
	};
}

/* ---------- Rangement dans l'ordre (une rangée de tuiles) ---------- */
/* Réponse donnée / attendue d'un rangement, jointes par le séparateur de la NATURE de
   la suite (#448, `separateurSuite`) : virgule pour des mots, point-virgule pour des
   nombres. Sans ce second cas, le parent lisait « donné : 95, 104, 98 » dans l'espace
   encadrant — soit exactement l'ambiguïté virgule-décimale que le repli texte évite.
   `nature` absente = mots (comportement d'origine). */
export function ordreErreur(
	propose: string[],
	ordre: string[],
	nature?: NatureOrdre,
): { donnee: string; attendue: string } {
	const sep = separateurSuite(nature);
	return { donnee: propose.join(sep), attendue: ordre.join(sep) };
}

/* ---------- Tableau de conversion (une case par chiffre) ---------- */
export interface CelluleTableau {
	unite: string; // symbole d'unité de la colonne (« m », « cm »…)
	valeur: string; // chiffre saisi dans la case
}

/* Nombre écrit par l'enfant dans un tableau de conversion, LU DANS L'UNITÉ CIBLE :
   les chiffres jusqu'à la colonne de l'unité demandée forment la partie entière, ceux des
   colonnes suivantes la partie décimale. On lit ainsi TOUTES les cases, y compris celles des
   unités de transit : un chiffre parasite dans une colonne basse (là où un 0 était attendu)
   apparaît donc dans la réponse donnée — c'est précisément l'erreur à montrer au parent.
   Aucune colonne après la cible → pas de virgule.

   La virgule est posée dès qu'une colonne suit la cible, y compris quand l'ÉCRAN n'en affiche
   aucune (il ne la dessine que si la réponse attendue est décimale, cf. `virguleApres`). C'est
   voulu : sur « 3000 m = @ km », un enfant qui écrit un 7 chez les décamètres a écrit 3,070 km,
   et le journal doit le dire — rendre « 3070 km » tromperait le parent d'un facteur 1000. */
export function nombreTableauSaisi(cells: CelluleTableau[], answerUnit: string): string {
	const chiffres = cells.map((c) => c.valeur);
	// Dernière case de la colonne cible (une colonne de tête peut porter 2 chiffres).
	const fin = cells.reduce((last, c, i) => (c.unite === answerUnit ? i : last), -1);
	if (fin < 0 || fin >= cells.length - 1) return chiffres.join('');
	return `${chiffres.slice(0, fin + 1).join('')},${chiffres.slice(fin + 1).join('')}`;
}

/* ---------- Appariement (paires reliées) ---------- */
export interface LienPropose {
	gauche: string;
	droite: string | null; // null = mot de gauche laissé sans lien
}

/* Réponse donnée / attendue d'un appariement, RESTREINTES aux liens FAUX : relier 5 paires
   dont une seule est ratée doit montrer cette paire, pas re-citer les quatre justes (même
   parti pris que `motsMalClasses`). Repli défensif sur tous les liens si aucun ne ressort
   comme faux (appelé après un verdict d'échec, donc jamais en pratique). */
export function pairesErreur(
	liens: LienPropose[],
	paires: { gauche: string; droite: string }[],
): { donnee: string; attendue: string } {
	const bonne = new Map(paires.map((p) => [p.gauche, p.droite]));
	const faux = liens.filter((l) => l.droite !== bonne.get(l.gauche));
	const source = faux.length ? faux : liens;
	return {
		donnee: source.map((l) => `${l.gauche} → ${l.droite ?? '(non relié)'}`).join(' ; '),
		attendue: source.map((l) => `${l.gauche} → ${bonne.get(l.gauche) ?? ''}`).join(' ; '),
	};
}

/* ---------- Tri par thème (mots dans deux colonnes) ---------- */
export interface MotTri {
	mot: string;
	cat: 0 | 1;
}
export interface MotMalClasse {
	mot: string;
	donnee: string; // libellé de la colonne choisie par l'enfant
	attendue: string; // libellé de la bonne colonne
}

/* Mots MAL classés d'un tri : pour chacun, la colonne choisie (donnee) et la bonne
   (attendue), en libellés lisibles. Un mot non classé (`placement` sans entrée) ou
   bien classé est ignoré. Une entrée d'erreur par mot mal classé (avis : cibler le
   mot précis sur lequel aider, pas « le tri est faux »). */
export function motsMalClasses(
	mots: MotTri[],
	categories: readonly [string, string],
	placement: Record<string, 0 | 1>,
): MotMalClasse[] {
	const out: MotMalClasse[] = [];
	for (const m of mots) {
		const choisi = placement[m.mot];
		if (choisi === undefined || choisi === m.cat) continue;
		out.push({ mot: m.mot, donnee: categories[choisi], attendue: categories[m.cat] });
	}
	return out;
}
