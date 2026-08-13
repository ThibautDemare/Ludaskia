/* ============================================================
   Révision espacée — sélection des éléments « dus », regroupés par
   catégorie (issue #45). Pur et testable : `now` passé en paramètre.
   Combine deux sources d'état :
     - mots d'orthographe (OrthoState.banque[].revision) ;
     - leçons maths/conjugaison (Record<lessonId, EtatRevision>).
   ============================================================ */
import {
	estDu,
	PALIER_ACQUIS,
	REVISION_PLAFOND,
	REVISION_SEUIL_SOURCE_VIDABLE,
	REVISION_MAX_VIDAGES_SOURCES,
	plafondBasNiveau,
} from './revision';
import { getLessonById, CATEGORIES, ORTHO_CATEGORY_ID } from './catalog';
import type { SchoolLevel } from './catalog';
import type { OrthoState, EtatRevision } from './orthographe/types';

/* Leçon en rotation à un niveau STRICTEMENT INFÉRIEUR au niveau actif de sa matière
   (#232) : entrée de l'entretien du niveau inférieur. Le contrat vit ici, avec la
   sélection qui le consomme ; c'est le seam de stockage qui le produit
   (`progress.ts:loadLessonRevisionsBasNiveau`, seul à savoir lire le profil). */
export interface LeconBasNiveau {
	lessonId: string;
	niveau: SchoolLevel;
	etat: EtatRevision;
}

export type DueItem =
	| { kind: 'word'; id: string; label: string; categoryId: string; due: number }
	| {
			kind: 'lesson';
			id: string;
			label: string;
			categoryId: string;
			due: number;
			/* Niveau de STOCKAGE de l'état SR, renseigné UNIQUEMENT pour un élément d'un
			   niveau inférieur au niveau actif (entretien, #232). Absent = niveau actif, que
			   l'appelant résout lui-même (`niveauLecon`). Présent, il est impératif : c'est à
			   ce niveau que l'exercice doit être généré ET que l'état doit être réécrit. */
			niveau?: SchoolLevel;
	  };

export interface DueGroup {
	categoryId: string;
	label: string;
	items: DueItem[];
}

/* Tous les éléments dus (mots + leçons), les plus en retard d'abord. */
function collectDue(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	now: number,
): DueItem[] {
	const due: DueItem[] = [];
	for (const id in ortho.banque) {
		const m = ortho.banque[id];
		if (estDu(m.revision, now)) {
			due.push({
				kind: 'word',
				id,
				label: m.mot,
				categoryId: ORTHO_CATEGORY_ID,
				due: m.revision.prochaineRevision!,
			});
		}
	}
	for (const id in lessonRevisions) {
		const e = lessonRevisions[id];
		if (!estDu(e, now)) continue;
		const lesson = getLessonById(id);
		if (lesson) {
			due.push({
				kind: 'lesson',
				id,
				label: lesson.label,
				categoryId: lesson.category,
				due: e.prochaineRevision!,
			});
		}
	}
	return due.sort((a, b) => a.due - b.due);
}

/* Éléments dus du niveau INFÉRIEUR retenus pour la séance (#232), dans la limite d'un
   budget. Trois différences assumées avec le niveau actif :
   - ils ne passent PAS par l'équilibrage entre sources (`selectionEquilibree`) : leur
     budget est déjà minuscule (≤ 3), le round-robin n'aurait rien à y répartir ;
   - ils ne CONCOURENT pas avec le niveau actif sur le retard. C'est le point clé (avis
     pédagogue) : après des mois au niveau supérieur, toute échéance basse est dépassée de
     dizaines à centaines de jours, quand une échéance du niveau actif l'est de deux jours.
     Sur une clé de tri commune, le niveau inférieur gagnerait TOUJOURS et raflerait la
     séance. Le retard n'est donc jamais comparé entre niveaux : le lot est servi sur un
     quota fixe, à part ;
   - à l'intérieur du lot, on ne trie pas par retard non plus (il ne discrimine plus rien
     quand tout est dépassé) mais par « le plus longtemps SANS TEST RÉEL » — ce qui fait
     tourner le stock au lieu de laisser un élément moisir. Jamais testé (leçon déclarée
     « vue en classe » et jamais jouée) passe d'abord.
   La condition d'éligibilité est celle de tout le monde (`estDu`) : elle exclut déjà les
   éléments « acquis » (palier ≥ PALIER_ACQUIS), qui restent au repos. */
function collectBasNiveau(bas: LeconBasNiveau[], now: number, budget: number): DueItem[] {
	if (budget <= 0) return [];
	const dus: { it: DueItem; teste: number }[] = [];
	for (const e of bas) {
		if (!estDu(e.etat, now)) continue;
		const lesson = getLessonById(e.lessonId);
		if (!lesson) continue;
		dus.push({
			it: {
				kind: 'lesson',
				id: e.lessonId,
				label: lesson.label,
				categoryId: lesson.category,
				due: e.etat.prochaineRevision!,
				niveau: e.niveau,
			},
			teste: e.etat.dernierTest ?? -Infinity,
		});
	}
	// Départage stable (id) : deux éléments jamais testés ont le même `teste`, et une séance
	// ne doit pas dépendre de l'ordre d'énumération du stockage.
	dus.sort((a, b) => (a.teste !== b.teste ? a.teste - b.teste : a.it.id.localeCompare(b.it.id)));
	return dus.slice(0, budget).map((x) => x.it);
}

/* Place les éléments d'entretien DANS la séance du niveau actif (#232). Chacun est glissé
   APRÈS le dernier élément actif de SA catégorie : il est ainsi révisé au sein du bloc de
   sa notion (numération avec la numération — le `categoryId` n'est pas namespacé par
   niveau, donc le regroupement existant s'en charge), sans jamais passer DEVANT les
   éléments du niveau actif de ce bloc (avis pédagogue : un CE2 en retard de 90 jours n'est
   pas plus urgent qu'un CM1 en retard de 2). À défaut de catégorie commune, l'élément est
   glissé juste après le PREMIER élément actif de la séance : son groupe naît en deuxième
   position, jamais en ouverture.
   Deux bornes viennent de l'avis « troubles des apprentissages » : ouvrir la séance sur les
   notions de l'année passée la fait identifier comme telle (vécu « on me fait refaire du
   bébé »), et la CLORE par elles fait échouer par fatigue une notion presque acquise — or
   un échec recule d'un palier, donc le dispositif punirait un faux échec et laisserait
   l'enfant sur ce raté. D'où le clamp, qui PRIME sur la règle de catégorie : jamais après le
   dernier élément actif. Deux conséquences assumées quand la catégorie de l'élément
   d'entretien se trouve fermer la séance : il passe juste avant ce dernier actif (donc en
   tête de son bloc si celui-ci n'a qu'un élément — un bloc d'un seul élément n'a de toute
   façon pas d'ordre à préserver). Et une séance sans élément actif, ou d'un seul, ne peut
   pas à la fois ne pas commencer et ne pas finir par de l'entretien. */
function fusionnerBasNiveau(actifs: DueItem[], bas: DueItem[]): DueItem[] {
	if (!bas.length) return actifs;
	if (!actifs.length) return bas;
	const apres = new Map<number, DueItem[]>(); // index d'actif → éléments à insérer derrière
	for (const it of bas) {
		let i = -1;
		for (let k = 0; k < actifs.length; k++) if (actifs[k].categoryId === it.categoryId) i = k;
		if (i < 0) i = 0; // aucune catégorie commune → derrière le premier actif
		i = Math.max(0, Math.min(i, actifs.length - 2)); // jamais derrière le dernier actif
		const file = apres.get(i);
		if (file) file.push(it);
		else apres.set(i, [it]);
	}
	const out: DueItem[] = [];
	for (let k = 0; k < actifs.length; k++) {
		out.push(actifs[k]);
		const file = apres.get(k);
		if (file) out.push(...file);
	}
	return out;
}

/* Date (ms) du prochain re-test À VENIR parmi les éléments en rotation (mots +
   leçons non acquis), ou `null` si rien n'est programmé : banque vierge, ou tout
   acquis. Sert à l'état « rien à réviser » de l'accueil pour annoncer l'échéance.
   Les éléments déjà dus (échéance passée) sont ignorés ici — ils relèvent de
   `countDue`. Les leçons orphelines (id absent du catalogue) sont écartées, comme
   dans la sélection. */
export function prochaineEcheance(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	now: number,
	bas: LeconBasNiveau[] = [],
): number | null {
	let min: number | null = null;
	const consider = (e: EtatRevision | undefined | null) => {
		if (!e || e.palier >= PALIER_ACQUIS || e.prochaineRevision == null) return;
		if (e.prochaineRevision <= now) return; // déjà dû
		if (min == null || e.prochaineRevision < min) min = e.prochaineRevision;
	};
	for (const id in ortho.banque) consider(ortho.banque[id].revision);
	for (const id in lessonRevisions) {
		if (getLessonById(id)) consider(lessonRevisions[id]);
	}
	// L'entretien du niveau inférieur (#232) compte dans l'horizon annoncé : depuis qu'il
	// est reproposé, une échéance basse est un vrai rendez-vous, plus une date dormante.
	for (const e of bas) if (getLessonById(e.lessonId)) consider(e.etat);
	return min;
}

/* Y a-t-il au moins un élément en rotation (mot ou leçon connue avec un état SR) ?
   Distingue « profil neuf, rien d'appris » de « tout est à jour / acquis ». */
export function aDesRevisions(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	bas: LeconBasNiveau[] = [],
): boolean {
	for (const id in ortho.banque) if (ortho.banque[id].revision) return true;
	for (const id in lessonRevisions) if (getLessonById(id)) return true;
	// Un profil dont il ne reste QUE des notions du niveau inférieur en rotation n'est pas
	// un profil neuf : il a tout révisé, ce qui n'est pas le même message (#232).
	for (const e of bas) if (getLessonById(e.lessonId)) return true;
	return false;
}

/* Nombre total d'éléments dus (non plafonné) — base de l'état « y a-t-il à réviser ? ».
   Le niveau actif y compte pour son stock ENTIER ; l'entretien du niveau inférieur (#232),
   lui, ne compte que pour la dose que la séance servira vraiment (d'où le `plafond` ici).
   Compter son stock entier gonflerait l'annonce de la carte d'accueil d'items que la séance
   ne proposera jamais, et casserait l'invariant « annoncé = proposé » de #478. */
export function countDue(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	now: number,
	plafond = REVISION_PLAFOND,
	bas: LeconBasNiveau[] = [],
): number {
	return (
		collectDue(ortho, lessonRevisions, now).length +
		collectBasNiveau(bas, now, plafondBasNiveau(plafond)).length
	);
}

/* Ce que la carte Révision de l'accueil ANNONCE à l'enfant : au-delà d'une séance, on
   montre l'effort du jour (le plafond, exactement ce que `selectDueGroups` proposera) et
   non le stock dû. Une déclaration « déjà vu en classe » (#478) peut rendre des dizaines
   de leçons dues le même jour ; un compteur à trois chiffres qui ne descend pas malgré le
   travail décourage (avis pédagogue). `plafonne` dit lequel des deux est affiché — l'UI
   adapte le libellé pour ne pas laisser croire qu'il ne reste que ça. Pur. */
export function effortRevisionAffiche(
	dus: number,
	plafond: number,
): { n: number; plafonne: boolean } {
	return dus > plafond ? { n: plafond, plafonne: true } : { n: dus, plafonne: false };
}

/* Sélection plafonnée et équilibrée entre SOURCES (= `categoryId` : une catégorie
   de leçon, ou l'orthographe entière). On évite qu'une source surreprésentée
   monopolise la session : d'abord on vide jusqu'à REVISION_MAX_VIDAGES_SOURCES
   petites sources (≤ REVISION_SEUIL_SOURCE_VIDABLE éléments dus), les plus en
   retard d'abord ; puis on partage les slots restants en round-robin entre les
   sources restantes (grosses + petites non vidées), chacune cédant son élément le
   plus en retard à tour de rôle. Deux garde-fous contre la famine d'une source :
   le vidage est plafonné à REVISION_MAX_VIDAGES_SOURCES sources ET son budget de
   slots est plafonné pour réserver une place à chaque source du round-robin — ce
   second garde-fou est indispensable depuis que le plafond est réglable et peut
   descendre bas (#439), sinon le vidage raflerait toute une session courte.
   L'entrée `due` est déjà triée par retard (donc chaque source l'est aussi) ; le
   résultat ne l'est PAS globalement (vidage puis round-robin) → le call-site
   re-trie pour l'affichage. */
function selectionEquilibree(due: DueItem[], plafond: number): DueItem[] {
	const parSource = new Map<string, DueItem[]>();
	for (const it of due) {
		const file = parSource.get(it.categoryId);
		if (file) file.push(it);
		else parSource.set(it.categoryId, [it]);
	}
	// Sources triées par urgence (retard de leur élément le plus en retard = le 1er).
	const sources = [...parSource.values()].sort((a, b) => a[0].due - b[0].due);
	const petites = sources.filter((s) => s.length <= REVISION_SEUIL_SOURCE_VIDABLE);
	const grosses = sources.filter((s) => s.length > REVISION_SEUIL_SOURCE_VIDABLE);

	const picked: DueItem[] = [];
	// Sources restantes pour le round-robin (grosses + petites non vidées), triées par urgence.
	const files = [...grosses, ...petites.slice(REVISION_MAX_VIDAGES_SOURCES)].sort(
		(a, b) => a[0].due - b[0].due,
	);
	// Phase 1 — vidage : au plus N petites sources, les plus urgentes, MAIS avec un budget
	// PLAFONNÉ qui réserve un slot par source du round-robin. Le plafond étant réglable par
	// profil (#439, min 6), sans ce plafonnage le vidage pouvait, à petit plafond, rafler toute
	// la session (jusqu'à REVISION_MAX_VIDAGES_SOURCES × REVISION_SEUIL_SOURCE_VIDABLE = 8 slots)
	// et affamer une grosse source pourtant due et plus en retard (ex. l'orthographe). Le budget
	// suit le plafond : sur une session large (≥ 8 + nb sources) il laisse le vidage se faire en
	// entier (comportement historique inchangé) ; il ne se resserre que quand le plafond est trop
	// court pour tout servir, garantissant qu'un round-robin a toujours lieu (aucune famine).
	const reserveRoundRobin = Math.min(files.length, plafond);
	const budgetVidage = plafond - reserveRoundRobin;
	const aVider = petites.slice(0, REVISION_MAX_VIDAGES_SOURCES);
	// aVider.flat() concatène les petites sources vidées, déjà triées par retard ; on tronque au
	// budget (chaque source reste ordonnée « plus en retard d'abord »).
	picked.push(...aVider.flat().slice(0, budgetVidage));
	// Phase 2 — round-robin sur les sources restantes : chacune cède son élément le plus en
	// retard à tour de rôle, jusqu'au plafond.
	const curseur = files.map(() => 0);
	let progres = true;
	while (picked.length < plafond && progres) {
		progres = false;
		for (let i = 0; i < files.length; i++) {
			if (curseur[i] < files[i].length) {
				picked.push(files[i][curseur[i]]);
				curseur[i]++;
				progres = true;
				if (picked.length >= plafond) break;
			}
		}
	}
	return picked;
}

/* Sélection plafonnée et regroupée par catégorie (ordre d'apparition) : on
   révise une catégorie avant de passer à la suivante, jamais en alternance. La
   composition est équilibrée entre sources (cf. selectionEquilibree) ; l'ordre
   d'affichage reste « le plus en retard d'abord ».
   `bas` = leçons en rotation au niveau INFÉRIEUR (#232) : une dose plafonnée
   (`plafondBasNiveau`) prend des slots DANS le plafond — la charge d'une séance ne change
   pas — et se glisse dans le bloc de sa catégorie (cf. fusionnerBasNiveau). Absent ou vide
   ⇒ comportement V1 strictement inchangé (niveau actif seul). */
export function selectDueGroups(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	now: number,
	plafond = REVISION_PLAFOND,
	bas: LeconBasNiveau[] = [],
): DueGroup[] {
	const entretien = collectBasNiveau(bas, now, plafondBasNiveau(plafond));
	// Re-tri par retard : selectionEquilibree ne garantit pas l'ordre global.
	const actifs = selectionEquilibree(
		collectDue(ortho, lessonRevisions, now),
		plafond - entretien.length,
	).sort((a, b) => a.due - b.due);
	const capped = fusionnerBasNiveau(actifs, entretien);
	const groups: DueGroup[] = [];
	for (const it of capped) {
		let g = groups.find((x) => x.categoryId === it.categoryId);
		if (!g) {
			const cat = CATEGORIES.find((c) => c.id === it.categoryId);
			g = { categoryId: it.categoryId, label: cat?.label ?? it.categoryId, items: [] };
			groups.push(g);
		}
		g.items.push(it);
	}
	return groups;
}
