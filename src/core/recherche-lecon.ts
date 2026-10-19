/* ============================================================
   Recherche de leçon côté ENFANT (#718) — logique pure.
   ------------------------------------------------------------
   L'enfant tape un mot sur l'écran des matières et doit atteindre une leçon, une
   catégorie ou une dictée de mots sans traverser matière → catégorie → liste.

   Depuis #722, le sélecteur adulte (`catalogue-arbre.ts`, #556) cherche avec les mêmes
   mots et les mêmes noms : libellé affiché (`libelleAffiche`), mots-clés, dictées. Deux
   différences subsistent, VOULUES (ne pas « aligner » l'un sur l'autre) :
   - ici la classe suivie passe EN TÊTE, elle ne filtre pas : chaque leçon disponible au
     niveau actif de SA matière (`source.niveau(subject)`) sort comme sur le catalogue
     parcouru à la main (critères 7 et 17) ; depuis #772, les versions des AUTRES classes
     suivent, marquées de leur classe (`ResultatLecon.niveau`), sauf si l'adulte a retiré
     cet accès (`autresClasses`) ; l'adulte, lui, choisit sa classe par jeton ;
   - une catégorie qui correspond (nom ou mot-clé) est un RÉSULTAT à part entière, qui
     ouvre son écran ; elle n'entraîne PAS ses leçons (« conjug » ne doit pas aligner 55
     boutons — la catégorie est la bonne réponse, critère 5) ; chez l'adulte, l'arbre EST le
     résultat, et la catégorie qui correspond déplie toutes ses leçons.
   Deux partis pris partagés : le texte cherché est le libellé AFFICHÉ plus les MOTS-CLÉS
   de la leçon (vocabulaire concret de l'enfant, #718), et les dictées de mots, qui ne
   sont pas des `LessonDef`, sont cherchées par leur nom (critère 6) — l'appelant les
   fournit ici déjà filtrées au niveau (cumulatif, #243).

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
import { classeLaPlusProche, LEVEL_ORDER } from './levels';
import { libelleAffiche } from './libelle-affiche';
import { trierParOrdre } from './ordre';
import { ordreEcran } from './rubriques';
import { cleRecherche } from './utils';

/** Longueur minimale de la requête NORMALISÉE pour que la recherche soit active. */
export const RECHERCHE_MIN = 2;

export interface DicteeRecherche {
	id: string;
	label: string;
	/** Classe de la dictée quand elle n'est pas visible dans la classe suivie (#772) : posée
	    par l'appelant, recopiée telle quelle dans le résultat. */
	niveau?: SchoolLevel;
}

export interface SourceRecherche {
	/** Catalogue complet, non filtré (`getAllLessons()`) : le filtre de niveau se fait ici. */
	lessons: readonly LessonDef[];
	/** Niveau actif PAR MATIÈRE (un enfant peut être CM1 en maths et CE2 en français). */
	niveau: (subject: SubjectId) => SchoolLevel;
	/** Dictées de mots déjà visibles au niveau actif (prédéfinies + listes du parent). */
	dictees: readonly DicteeRecherche[];
	/** Chercher aussi dans les AUTRES classes (#772). Absent ou `false` : la recherche
	    d'avant, à l'identique — c'est le cas d'un profil dont l'adulte a retiré l'accès. */
	autresClasses?: boolean;
}

export interface ResultatCategorie {
	categoryId: string;
	label: string;
	subject: SubjectId;
	subjectLabel: string;
}

export interface ResultatLecon {
	id: string;
	label: string; // libellé AFFICHÉ à l'enfant, résolu dans la classe du résultat
	/** Classe du résultat, PRÉSENTE seulement hors de la classe suivie de sa matière (#772) :
	    c'est ce qui porte la pastille, et la classe dans laquelle la leçon se lance. */
	niveau?: SchoolLevel;
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

/* Écart d'une classe à la classe suivie, pour trier les autres classes : la plus proche
   d'abord, celle du dessous avant celle du dessus à égalité. */
function rangProximite(lv: SchoolLevel, profil: SchoolLevel): number {
	const d = LEVEL_ORDER.indexOf(lv) - LEVEL_ORDER.indexOf(profil);
	return Math.abs(d) * 2 + (d > 0 ? 1 : 0);
}

/* Versions des leçons d'une catégorie à chercher HORS de la classe suivie (#772, critère 10) :
   - une leçon de la classe suivie n'apporte une autre version que si son libellé y DIFFÈRE
     (une même notion sous un autre nom, ex. « Clique sur le nom » / « … le nom noyau ») ;
     deux autres classes au même libellé n'en font qu'une, la plus proche ;
   - une leçon absente de la classe suivie sort une fois, dans la classe la plus proche.
   Sans cette règle, « Comparer des nombres » sortirait une fois par classe sous le même nom. */
function autresVersions(
	lessons: readonly LessonDef[],
	profil: SchoolLevel,
): { lesson: LessonDef; niveau: SchoolLevel; label: string }[] {
	const out: { lesson: LessonDef; niveau: SchoolLevel; label: string }[] = [];
	for (const l of lessons) {
		if (!l.levels.includes(profil)) {
			const niveau = classeLaPlusProche(l.levels, profil);
			out.push({ lesson: l, niveau, label: libelleAffiche(l, niveau) });
			continue;
		}
		const base = libelleAffiche(l, profil);
		const vus = new Set<string>([base]);
		const autres = l.levels
			.filter((lv) => lv !== profil)
			.sort((a, b) => rangProximite(a, profil) - rangProximite(b, profil));
		for (const niveau of autres) {
			const label = libelleAffiche(l, niveau);
			if (vus.has(label)) continue;
			vus.add(label);
			out.push({ lesson: l, niveau, label });
		}
	}
	return out;
}

/* Résultats d'une catégorie HORS de la classe suivie (#772), APRÈS ceux de la classe suivie :
   de la classe la plus proche à la plus lointaine, et dans une même classe, dans l'ordre de
   SON écran — tri et rubriques calculés sur toute la catégorie à ce niveau AVANT de filtrer,
   comme pour la classe suivie (sinon une rubrique se déplace selon ce qui correspond). */
function autresTrouvees(
	deLaCategorie: readonly LessonDef[],
	profil: SchoolLevel,
	contient: (texte: string) => boolean,
	parMotCle: (mots: readonly string[] | undefined) => boolean,
): ResultatLecon[] {
	const versions = autresVersions(deLaCategorie, profil).filter(
		(v) => contient(v.label) || parMotCle(v.lesson.motsCles),
	);
	const classes = [...new Set(versions.map((v) => v.niveau))].sort(
		(a, b) => rangProximite(a, profil) - rangProximite(b, profil),
	);
	return classes.flatMap((niveau) => {
		const ecran = ordreEcran(
			trierParOrdre(
				deLaCategorie.filter((l) => l.levels.includes(niveau)),
				niveau,
			),
		).map((l) => l.id);
		return versions
			.filter((v) => v.niveau === niveau)
			.sort((a, b) => ecran.indexOf(a.lesson.id) - ecran.indexOf(b.lesson.id))
			.map((v) => ({ id: v.lesson.id, label: v.label, niveau }));
	});
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
		const deLaCategorie = source.lessons.filter((l) => l.category === cat.id);
		const auNiveau = deLaCategorie.filter((l) => l.levels.includes(niveau));
		// Une catégorie sans rien à montrer n'est jamais proposée : l'enfant arriverait sur
		// « Bientôt disponible ». L'orthographe compte ses dictées. Avec les autres classes
		// (#772), ce qu'elle a ailleurs compte aussi : son écran y mène par le sélecteur.
		const aDuContenu =
			(source.autresClasses ? deLaCategorie.length > 0 : auNiveau.length > 0) ||
			(cat.id === ORTHO_CATEGORY_ID && source.dictees.length > 0);
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
		const lecons: ResultatLecon[] = trouvees.map((l) => ({
			id: l.id,
			label: libelleAffiche(l, niveau),
		}));
		if (source.autresClasses)
			lecons.push(...autresTrouvees(deLaCategorie, niveau, contient, parMotCle));
		if (lecons.length) {
			groupes.push({
				categoryId: cat.id,
				label: cat.label,
				subject: cat.subject,
				subjectLabel: libelleMatiere(cat.subject),
				lecons,
			});
		}
	}
	const dictees = source.dictees.filter((d) => contient(d.label));
	const total =
		categories.length + groupes.reduce((n, g) => n + g.lecons.length, 0) + dictees.length;
	return { active: true, categories, groupes, dictees, total };
}
