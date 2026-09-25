/* ============================================================
   Recherche de leçon côté ENFANT (#718) — logique pure.
   ------------------------------------------------------------
   L'enfant tape un mot sur l'écran des matières et doit atteindre une leçon, une
   catégorie ou une dictée de mots sans traverser matière → catégorie → liste.

   Quatre partis pris, tous DIFFÉRENTS du sélecteur adulte (`catalogue-arbre.ts`, #556),
   qui reste inchangé (critère 20) :
   - le niveau est une FRONTIÈRE, pas un filtre : chaque leçon est retenue si elle est
     disponible au niveau actif de SA matière (`source.niveau(subject)`), exactement comme
     le catalogue parcouru à la main (critères 7 et 17) ;
   - le texte cherché est le libellé AFFICHÉ (`libelleAffiche`) plus les MOTS-CLÉS de la
     leçon (vocabulaire concret de l'enfant, #718) — jamais le seul `label` du catalogue,
     qui diffère de l'écran pour le calcul mental (critère 3) ;
   - une catégorie qui correspond (nom ou mot-clé) est un RÉSULTAT à part entière, qui
     ouvre son écran ; elle n'entraîne PAS ses leçons (« conjug » ne doit pas aligner 55
     boutons — la catégorie est la bonne réponse, critère 5) ;
   - les dictées de mots, qui ne sont pas des `LessonDef`, sont cherchées par leur nom
     (critère 6) ; l'appelant les fournit déjà filtrées au niveau (cumulatif, #243).

   Correspondance : sous-chaîne sur `cleRecherche` (casse, accents, ligatures et
   apostrophes indifférents). En dessous de `RECHERCHE_MIN` caractères, la recherche est
   INACTIVE (une lettre seule ferait clignoter tout le catalogue, critère 2).
   Pur : ni DOM ni stockage.
   ============================================================ */
import {
	CATEGORIES,
	ORTHO_CATEGORY_ID,
	SUBJECTS,
	type LessonDef,
	type SchoolLevel,
	type SubjectId,
} from './catalog';
import { libelleAffiche } from './libelle-affiche';
import { trierParOrdre } from './ordre';
import { ordreEcran } from './rubriques';
import { cleRecherche } from './utils';

/** Longueur minimale de la requête NORMALISÉE pour que la recherche soit active. */
export const RECHERCHE_MIN = 2;

export interface DicteeRecherche {
	id: string;
	label: string;
}

export interface SourceRecherche {
	/** Catalogue complet, non filtré (`getAllLessons()`) : le filtre de niveau se fait ici. */
	lessons: readonly LessonDef[];
	/** Niveau actif PAR MATIÈRE (un enfant peut être CM1 en maths et CE2 en français). */
	niveau: (subject: SubjectId) => SchoolLevel;
	/** Dictées de mots déjà visibles au niveau actif (prédéfinies + listes du parent). */
	dictees: readonly DicteeRecherche[];
}

export interface ResultatCategorie {
	categoryId: string;
	label: string;
	subject: SubjectId;
	subjectLabel: string;
}

export interface ResultatLecon {
	id: string;
	label: string; // libellé AFFICHÉ à l'enfant, résolu au niveau actif
}

export interface GroupeLecons {
	categoryId: string;
	label: string;
	subject: SubjectId;
	subjectLabel: string;
	lecons: ResultatLecon[]; // ordre de l'ÉCRAN de catégorie : tri pédagogique puis rubriques
}

export interface ResultatsRecherche {
	/** `false` sous RECHERCHE_MIN caractères : tout est vide et rien ne doit s'afficher. */
	active: boolean;
	categories: ResultatCategorie[];
	groupes: GroupeLecons[];
	dictees: DicteeRecherche[];
	/** Catégories + leçons + dictées : le compte annoncé à l'enfant. */
	total: number;
}

const INACTIF: ResultatsRecherche = Object.freeze({
	active: false,
	categories: [],
	groupes: [],
	dictees: [],
	total: 0,
});

function libelleMatiere(subject: SubjectId): string {
	return SUBJECTS.find((s) => s.id === subject)?.label ?? subject;
}

export function rechercherLecons(requete: string, source: SourceRecherche): ResultatsRecherche {
	const q = cleRecherche(requete);
	if (q.length < RECHERCHE_MIN) return INACTIF;
	const contient = (texte: string): boolean => cleRecherche(texte).includes(q);
	const parMotCle = (mots: readonly string[] | undefined): boolean => (mots ?? []).some(contient);

	const categories: ResultatCategorie[] = [];
	const groupes: GroupeLecons[] = [];
	for (const cat of CATEGORIES) {
		const niveau = source.niveau(cat.subject);
		const auNiveau = source.lessons.filter(
			(l) => l.category === cat.id && l.levels.includes(niveau),
		);
		// Une catégorie sans rien à montrer au niveau actif n'est jamais proposée : l'enfant
		// arriverait sur « Bientôt disponible ». L'orthographe compte ses dictées.
		const aDuContenu =
			auNiveau.length > 0 || (cat.id === ORTHO_CATEGORY_ID && source.dictees.length > 0);
		if (aDuContenu && (contient(cat.label) || parMotCle(cat.motsCles))) {
			categories.push({
				categoryId: cat.id,
				label: cat.label,
				subject: cat.subject,
				subjectLabel: libelleMatiere(cat.subject),
			});
		}
		// Ordre de l'ÉCRAN de la catégorie (critère 9) : tri pédagogique PUIS regroupement par
		// rubrique, calculés sur toute la catégorie AVANT de filtrer — filtrer d'abord
		// déplacerait une rubrique dont la première leçon n'est pas retenue.
		const trouvees = ordreEcran(trierParOrdre(auNiveau, niveau)).filter(
			(l) => contient(libelleAffiche(l, niveau)) || parMotCle(l.motsCles),
		);
		if (trouvees.length) {
			groupes.push({
				categoryId: cat.id,
				label: cat.label,
				subject: cat.subject,
				subjectLabel: libelleMatiere(cat.subject),
				lecons: trouvees.map((l) => ({ id: l.id, label: libelleAffiche(l, niveau) })),
			});
		}
	}
	const dictees = source.dictees.filter((d) => contient(d.label));
	const total =
		categories.length + groupes.reduce((n, g) => n + g.lecons.length, 0) + dictees.length;
	return { active: true, categories, groupes, dictees, total };
}
