/* ============================================================
   Arbre du catalogue pour la SÉLECTION d'une leçon côté adulte (#556).
   ------------------------------------------------------------
   L'espace encadrant doit pouvoir désigner N'IMPORTE QUELLE leçon du catalogue pour un
   profil — y compris d'une classe autre que celle qu'il suit — sans faire reculer toute
   la matière. Les points d'exposition existants filtrent au contraire STRICTEMENT sur le
   niveau du profil (`getLessonsBySubject`, `lessonsForLevel`) : ce module est la vue qui
   ne filtre pas, et où le niveau redevient un FILTRE qu'on choisit, pas une frontière.

   Deux responsabilités, PURES (ni DOM ni stockage — le rendu vit dans
   `ui/selecteur-lecon.ts`) : construire l'arbre `matière → catégorie → leçons` (filtre de
   niveau et recherche appliqués), et calculer la barre de jetons de niveau (« Sa classe »
   plus un jeton par niveau pourvu en contenu). La CLASSE D'ORIGINE d'une leçon pour un
   profil, elle, vit dans `encadrant-stats` aux côtés de `niveauProfilMatiere` — l'y laisser
   évite un cycle d'imports entre les deux modules.

   Le niveau reste une DONNÉE (#225) : rien ici ne connaît de liste de classes en dur, tout
   se dérive du catalogue (`availableLevels`) et du profil (`niveauProfilMatiere`).
   ============================================================ */
import {
	CATEGORIES,
	SUBJECTS,
	getAllLessons,
	type LessonDef,
	type SchoolLevel,
	type SubjectId,
} from './catalog';
import { LEVEL_LABEL, LEVEL_ORDER, availableLevels, labelLecon } from './levels';
import { niveauProfilMatiere } from './encadrant-stats';
import type { Profile } from './profiles';
import { trierParOrdre } from './ordre';
import { cleRecherche } from './utils';

/* ---------- Filtre de niveau ----------
   « Sa classe » n'est PAS un niveau : c'est « ce que suit ce profil », résolu PAR MATIÈRE
   (un enfant peut être en CM1 en maths et en CE2 en français). D'où une valeur à part
   entière plutôt qu'un `SchoolLevel` pré-résolu, qui écraserait cette différence. */
export type FiltreNiveau = 'sa-classe' | SchoolLevel;
export const FILTRE_DEFAUT: FiltreNiveau = 'sa-classe';

export interface JetonNiveau {
	val: FiltreNiveau;
	label: string;
}

/* ---------- Arbre ---------- */
export interface LeconArbre {
	id: string;
	label: string; // libellé résolu AU NIVEAU affiché (#436)
	niveau: SchoolLevel; // niveau sous lequel la leçon est proposée ici
}
export interface CategorieArbre {
	categoryId: string;
	label: string;
	lecons: LeconArbre[];
}
export interface MatiereArbre {
	subject: SubjectId;
	label: string;
	total: number; // leçons de la matière retenues (toutes catégories)
	categories: CategorieArbre[];
}

export interface OptionsArbre {
	filtre?: FiltreNiveau;
	recherche?: string;
	/** Catalogue injectable (tests) ; par défaut le catalogue complet, SANS filtre de niveau. */
	lessons?: readonly LessonDef[];
}

/* Niveaux DISTINCTS effectivement suivis par un profil, un par matière (ordre scolaire).
   Un enfant « mono-niveau » n'en a qu'un ; c'est la seule condition sous laquelle un jeton
   de niveau peut faire doublon avec « Sa classe » (cf. `jetonsNiveau`). */
export function niveauxSuivis(profile: Profile): SchoolLevel[] {
	const set = new Set(SUBJECTS.map((s) => niveauProfilMatiere(profile, s.id)));
	return LEVEL_ORDER.filter((lv) => set.has(lv));
}

/* Barre de jetons du sélecteur : « Sa classe » puis un jeton par niveau POURVU EN CONTENU
   (dérivé du catalogue, jamais d'une liste en dur — un futur CM2 apparaîtra tout seul).

   Déduplication : on ne retire le jeton d'un niveau QUE si l'enfant est mono-niveau, où il
   dirait alors exactement la même chose que « Sa classe ». Pour un enfant multi-niveaux
   (CM1 en maths, CE2 en français), les retirer rendrait les maths CE2 et le français CM1
   INATTEIGNABLES : « Sa classe » ne montre alors, dans chaque matière, que le niveau suivi
   par cette matière. Le libellé de « Sa classe » suit la même logique — il ne nomme la
   classe entre parenthèses que lorsqu'il n'y en a qu'une à nommer. */
export function jetonsNiveau(
	profile: Profile,
	lessons: readonly LessonDef[] = getAllLessons(),
): JetonNiveau[] {
	const suivis = niveauxSuivis(profile);
	const mono = suivis.length === 1;
	const jetons: JetonNiveau[] = [
		{ val: 'sa-classe', label: mono ? `Sa classe (${LEVEL_LABEL[suivis[0]]})` : 'Sa classe' },
	];
	for (const lv of availableLevels(lessons)) {
		if (mono && lv === suivis[0]) continue;
		jetons.push({ val: lv, label: LEVEL_LABEL[lv] });
	}
	return jetons;
}

/* Niveau sous lequel les leçons d'une MATIÈRE sont proposées par un filtre donné : le filtre
   lui-même quand c'est un niveau, sinon la classe suivie pour cette matière. Sert au libellé
   (#436, `labelLecon`) autant qu'au tri pédagogique. */
function niveauSousFiltre(subject: SubjectId, profile: Profile, filtre: FiltreNiveau): SchoolLevel {
	return filtre === 'sa-classe' ? niveauProfilMatiere(profile, subject) : filtre;
}

/* Arbre `matière → catégorie → leçons` du catalogue, filtre de niveau et recherche appliqués.
   Matières et catégories suivent l'ordre du catalogue ; les leçons d'une catégorie sont triées
   par l'ORDRE PÉDAGOGIQUE du niveau sous lequel elles sont proposées (`trierParOrdre`, #208),
   exactement comme `getLessonsByCategory` le fait pour l'écran de l'enfant. L'ordre de
   déclaration ne convient pas : il groupe par exemple la conjugaison par verbe alors que la
   progression va par temps, et l'adulte qui compose y perdrait le fil que l'enfant suit.
   Toutes les leçons d'une catégorie partageant une matière, elles partagent aussi ce niveau —
   un seul tri par catégorie suffit.

   Le filtre est une APPARTENANCE stricte au niveau demandé (`levels.includes`), comme
   l'écran de l'enfant : le sélecteur montre ce que ce niveau contient, pas ce qu'il
   contiendrait par repli. La recherche s'applique À L'INTÉRIEUR du filtre actif, sur le
   libellé de la leçon ET sur celui de sa catégorie — chercher « géométrie » doit rendre les
   leçons de géométrie, dont aucune ne porte le mot. Accents et casse indifférents
   (`cleRecherche`). Catégories et matières vidées par le filtre sont écartées. */
export function arbreCatalogue(profile: Profile, opts: OptionsArbre = {}): MatiereArbre[] {
	const filtre = opts.filtre ?? FILTRE_DEFAUT;
	const lessons = opts.lessons ?? getAllLessons();
	const q = cleRecherche(opts.recherche ?? '');
	const out: MatiereArbre[] = [];
	for (const sub of SUBJECTS) {
		const categories: CategorieArbre[] = [];
		let total = 0;
		for (const cat of CATEGORIES.filter((c) => c.subject === sub.id)) {
			const catMatche = q !== '' && cleRecherche(cat.label).includes(q);
			const niveau = niveauSousFiltre(sub.id, profile, filtre);
			const retenues = lessons.filter((l) => {
				if (l.category !== cat.id || !l.levels.includes(niveau)) return false;
				return q === '' || catMatche || cleRecherche(labelLecon(l, niveau)).includes(q);
			});
			const lecons: LeconArbre[] = trierParOrdre(retenues, niveau).map((l) => ({
				id: l.id,
				label: labelLecon(l, niveau),
				niveau,
			}));
			if (lecons.length) {
				categories.push({ categoryId: cat.id, label: cat.label, lecons });
				total += lecons.length;
			}
		}
		if (categories.length) out.push({ subject: sub.id, label: sub.label, total, categories });
	}
	return out;
}

/* Nombre total de leçons d'un arbre — le compte que le sélecteur annonce (région live), et
   la seule source du cas « rien à montrer ». */
export function compterLecons(arbre: readonly MatiereArbre[]): number {
	return arbre.reduce((n, m) => n + m.total, 0);
}
