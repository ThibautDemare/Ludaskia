/* ============================================================
   Représentations composites pour le journal d'erreurs (#391) — logique pure.
   ------------------------------------------------------------
   Certains exercices ne produisent pas une simple paire saisie/réponse : une
   opération posée s'étale sur plusieurs cellules-chiffres, un rangement ou un tri
   portent sur un ENSEMBLE de tuiles. On met ici en forme la « réponse donnée » et
   la « réponse attendue » LISIBLES pour un parent, à partir des données brutes des
   runners — sans DOM, donc testable en isolation. La journalisation elle-même
   reste centralisée dans ui/erreur-capture.ts.
   ============================================================ */

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
/* Réponse donnée / attendue d'un rangement, jointes par « , » (lisible : une suite
   de mots séparés par des virgules). */
export function ordreErreur(
	propose: string[],
	ordre: string[],
): { donnee: string; attendue: string } {
	return { donnee: propose.join(', '), attendue: ordre.join(', ') };
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
