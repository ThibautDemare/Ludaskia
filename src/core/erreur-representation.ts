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
