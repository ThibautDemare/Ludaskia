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

/* Dose d'entretien réellement servie : celle du plafond (`plafondBasNiveau`), mais bornée
   par ce que le NIVEAU ACTIF apporte vraiment. Sans cette borne, un stock actif famélique se
   faisait noyer par une dose calibrée pour une séance pleine : un seul élément actif dû et
   trois notions basses à plafond 20 donnaient trois quarts de séance venus de l'année passée.
   L'entretien ne DÉPASSE donc jamais le nombre d'éléments actifs dus. S'il n'y a rien de dû au
   niveau actif, la séance est entièrement d'entretien, mais pas plus grosse que celle d'une
   file active à un seul élément (soit deux) : sinon une file vide proposait trois éléments à
   plafond 20/24 quand le lendemain, une leçon devenue due n'en proposait plus que deux — la
   séance rétrécissait alors que la dette montait. La taille d'une séance ne décroît jamais
   quand la dette du niveau actif augmente.

   C'est la lecture retenue du critère « le niveau actif reste majoritaire » (#232) : il vise
   la COLONISATION d'une séance de travail courant, pas l'arithmétique d'une séance de deux
   éléments. Une borne strictement majoritaire (dose ≤ actifs − 1) a été essayée et écartée :
   elle rendait la taille de séance non monotone — 4 notions basses dues sans rien d'actif
   donnaient 2 éléments, et la séance RÉTRÉCISSAIT à 1 le jour où une leçon du niveau actif
   devenait due, l'entretien disparaissant d'un coup. Incohérent pour l'enfant qui compare
   deux jours de suite, et incohérent avec le cas « rien d'actif » qu'on sert quand même. */
function budgetEntretien(nbActifs: number, plafond: number): number {
	const dose = plafondBasNiveau(plafond);
	return Math.min(dose, nbActifs === 0 ? 2 : nbActifs);
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
	const dus = collectDue(ortho, lessonRevisions, now);
	return dus.length + collectBasNiveau(bas, now, budgetEntretien(dus.length, plafond)).length;
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

/* Regroupement par catégorie, dans l'ordre d'apparition (une catégorie est révisée en
   entier avant de passer à la suivante, jamais en alternance). */
function grouper(items: DueItem[]): DueGroup[] {
	const groups: DueGroup[] = [];
	for (const it of items) {
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

/* Nouveau groupe pour une catégorie (même libellé que `grouper`). */
function groupeDe(it: DueItem): DueGroup {
	const cat = CATEGORIES.find((c) => c.id === it.categoryId);
	return { categoryId: it.categoryId, label: cat?.label ?? it.categoryId, items: [it] };
}

/* Glisse un élément d'entretien (niveau inférieur, #232) dans une séance déjà GROUPÉE.
   Le placement se décide sur les GROUPES, pas sur une liste plate : ce que l'enfant joue,
   c'est la concaténation des groupes, donc un élément inséré au milieu d'une liste plate
   est de toute façon recollé dans le bloc de sa catégorie — placer avant de grouper ne
   décide de rien (c'était le défaut de la 1re version : la séance pouvait finir sur
   l'entretien alors que le code croyait l'avoir évité).
   Deux règles, dans cet ordre :
   1. `jamais en clôture de séance` PRIME. Clore par une notion presque acquise, c'est la
      faire échouer par FATIGUE — or un échec recule d'un palier : le dispositif punirait un
      faux échec et laisserait l'enfant sur ce raté (avis « troubles des apprentissages »).
      Un groupe créé pour l'entretien est donc inséré AVANT le dernier groupe, et dans le
      dernier groupe l'entretien passe avant son dernier élément. Invariant : dès qu'il
      existe un élément actif, la séance se termine sur un élément actif.
   2. sinon, l'entretien va APRÈS les éléments actifs de sa catégorie (avis pédagogue : un
      CE2 en retard de 90 jours n'est pas plus urgent qu'un CM1 en retard de 2), au sein du
      bloc de sa notion — le `categoryId` n'étant pas namespacé par niveau, numération est
      révisée avec numération.
   Cas irréductible, assumé : avec une seule catégorie active, un entretien d'une AUTRE
   catégorie ouvre forcément la séance (il ne peut être ni premier ni dernier d'une liste de
   deux). On préfère l'ouverture : elle place l'entretien loin de la fatigue de fin, et le
   seul reproche qu'on lui fait est de rendre le lot identifiable. */
function insererEntretien(groups: DueGroup[], it: DueItem): void {
	const i = groups.findIndex((g) => g.categoryId === it.categoryId);
	if (i < 0) {
		groups.splice(Math.max(0, groups.length - 1), 0, groupeDe(it));
		return;
	}
	const items = groups[i].items;
	const dernierGroupe = i === groups.length - 1;
	items.splice(dernierGroupe ? Math.max(0, items.length - 1) : items.length, 0, it);
}

/* Sélection plafonnée et regroupée par catégorie. La composition est équilibrée entre
   sources (cf. selectionEquilibree) ; l'ordre d'affichage reste « le plus en retard
   d'abord ».
   `bas` = leçons en rotation au niveau INFÉRIEUR (#232) : une dose plafonnée
   (`plafondBasNiveau`) prend des slots DANS le plafond — la charge d'une séance ne change
   pas — et se glisse dans la séance groupée (cf. insererEntretien). Absent ou vide ⇒
   comportement V1 strictement inchangé (niveau actif seul). */
export function selectDueGroups(
	ortho: OrthoState,
	lessonRevisions: Record<string, EtatRevision>,
	now: number,
	plafond = REVISION_PLAFOND,
	bas: LeconBasNiveau[] = [],
): DueGroup[] {
	const dus = collectDue(ortho, lessonRevisions, now);
	const entretien = collectBasNiveau(bas, now, budgetEntretien(dus.length, plafond));
	// Re-tri par retard : selectionEquilibree ne garantit pas l'ordre global.
	const actifs = selectionEquilibree(dus, plafond - entretien.length).sort((a, b) => a.due - b.due);
	// Rien d'actif : il ne reste que l'entretien, dans son propre ordre (les règles de
	// placement n'ont plus d'objet, elles se définissent par rapport aux éléments actifs).
	if (!actifs.length) return grouper(entretien);
	const groups = grouper(actifs);
	for (const it of entretien) insererEntretien(groups, it);
	return groups;
}
