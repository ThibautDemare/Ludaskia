/* ============================================================
   Mode « tableau de conversion » (#394, refondu par #711 lot 1) — logique PURE de
   génération (sans DOM). Ce que ce fichier tient APRÈS le lot « tranche fixe » :

   - la tranche de colonnes est FIXE par couple (leçon, niveau) et indépendante de la
     paire tirée (critère 1) : chaque unité garde le même indice d'un item à l'autre ;
   - l'unité connue et l'unité cible ne sont plus systématiquement aux deux bords
     (critère 2) : « aligner les chiffres sur un bord puis compléter de zéros jusqu'à
     l'autre » ne suffit plus à répondre ;
   - toute unité tirée a sa colonne (critère 3) ;
   - au CM1, aucune colonne n'est marquée « pas encore vue en classe » (critère 5) et
     l'échelle des contenances couvre de mL à hL (critère 6) ;
   - au CE2, le marquage des unités hors programme est CONSERVÉ (critère 7) et aucune
     unité hors programme n'est tirée comme unité connue ou cible (critère 20) ;
   - l'invariant « colonne de transit ⊕ virgule » tient toujours (critère 10) ;
   - les chiffres sont posés à leur RANG : relus depuis la colonne cible ils redonnent
     `answer`, relus depuis la colonne de l'unité connue ils redonnent la valeur de
     l'énoncé (critère 15).

   Les critères 1 et 2 sont éprouvés par ÉCHANTILLON sur le champ `colonnes`, sans
   instrumenter l'interface (critère 16). Le rendu (critères 11-14), la virgule
   saisissable (critères 8-9) et la correction cellule par cellule vivent ailleurs :
   runner `ui/lecon-tableau.ts` et sa spec e2e. Itérations bornées.

   Le bloc « témoins des détecteurs » en fin de fichier joue les prédicats de ce fichier
   sur des tableaux FABRIQUÉS portant exactement la faute annoncée : sans lui, un
   détecteur devenu permissif laisserait tout vert en silence.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { MESURE_LESSONS } from '../src/data/maths/mesures';
import { checkAnswer } from '../src/core/exercise';
import type { Exercise, TableauColonne } from '../src/core/exercise';
import type { SchoolLevel } from '../src/core/catalog';
import { conversionDepuisTableau } from '../src/core/etayage-conversion';

type Tableau = Extract<Exercise, { type: 'tableauConversion' }>;

const FAMILLES = ['mes-longueurs', 'mes-masses', 'mes-contenances'] as const;
const NIVEAUX = ['ce2', 'cm1'] as const;
const type = (id: string) => MESURE_LESSONS.find((l) => l.id === id)!.exerciseType;

/* Rangs décimaux de chaque grandeur, du plus grand au plus petit (système métrique, pas
   un miroir d'une constante de `mesures.ts`) : sert à vérifier que les colonnes suivent
   toujours cette chaîne, dans cet ordre et sans trou. Les contenances vont jusqu'à `hL`
   (critère 6). La TONNE n'y figure pas : elle est à trois rangs du kilogramme dont deux
   sans symbole enseignable — si l'arbitrage du critère 4 (masses CE2, paire unique) la
   fait entrer dans le tableau, c'est cette table qu'il faut rouvrir, pas contourner. */
const ECHELLES: Record<string, string[]> = {
	'mes-longueurs': ['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm'],
	'mes-masses': ['kg', 'hg', 'dag', 'g', 'dg', 'cg', 'mg'],
	'mes-contenances': ['hL', 'daL', 'L', 'dL', 'cL', 'mL'],
};

/* Unités NOMMÉES par le programme CE2 (docs/reference/programmes/ce2-maths.md §2.1-2.3 :
   « m, dm, cm, mm et km », « g, kg et tonne », « L, dL et cL »). Source des critères 7 et
   20 — la tonne est écartée pour la raison ci-dessus. */
const PROGRAMME_CE2: Record<string, string[]> = {
	'mes-longueurs': ['km', 'm', 'dm', 'cm', 'mm'],
	'mes-masses': ['kg', 'g'],
	'mes-contenances': ['L', 'dL', 'cL'],
};

function genTab(id: string, level: SchoolLevel, n: number): Tableau[] {
	const t = type(id);
	const out: Tableau[] = [];
	for (let i = 0; i < n; i++) {
		const ex = t.generate({ mode: 'tableau', level });
		if (ex.type === 'tableauConversion') out.push(ex);
	}
	return out;
}

/* ---------- Détecteurs (joués sur des cas fabriqués en fin de fichier) ---------- */

/** Disposition des colonnes, sous une forme comparable d'un item à l'autre (critère 1). */
const signature = (ex: Tableau) => ex.colonnes.map((c) => c.unite).join(' | ');

/** L'unité CONNUE n'est pas exposée dans l'`Exercise` : elle se lit dans l'énoncé partagé
    (« 3 m = @ cm » ou « @ cm = 3 m »), du côté qui NE porte PAS le champ `@` — l'unité
    collée au `@` étant la cible (`answerUnit`). Retourne `''` / `NaN` si l'énoncé ne se
    lit pas, pour que les tests le signalent au lieu de le supposer. */
function enonceConnu(question: string): { valeur: number; unite: string } {
	const cote = question.split(' = ').find((c) => !c.includes('@')) ?? '';
	const mots = cote.trim().split(' ').filter(Boolean);
	if (mots.length < 2) return { valeur: NaN, unite: '' };
	// Un éventuel séparateur de milliers (espace) est recollé ; la virgule décimale est
	// ramenée au point pour `Number`.
	return {
		valeur: Number(mots.slice(0, -1).join('').replace(',', '.')),
		unite: mots[mots.length - 1],
	};
}

/** Valeur que l'enfant LIT dans la colonne `unite` : les chiffres de toutes les colonnes
    juxtaposés, rapportés au rang de cette colonne (une colonne = un rang décimal, la
    tête absorbant les rangs supérieurs). Décaler un chiffre d'une colonne change le
    résultat d'un facteur 10 : c'est ce qui rend la propriété sensible au mauvais rang. */
function valeurLue(ex: Tableau, unite: string): number {
	const i = ex.colonnes.findIndex((c) => c.unite === unite);
	if (i < 0) return NaN;
	const joint = ex.colonnes.map((c) => c.chiffres).join('');
	return Number(joint) / 10 ** (ex.colonnes.length - 1 - i);
}

/** Critère 2 : au moins une des deux unités en jeu (connue, cible) est entourée de
    colonnes des DEUX côtés — donc ni le bord gauche ni le bord droit ne la donne. */
function uneUniteEntouree(ex: Tableau): boolean {
	const n = ex.colonnes.length;
	const entouree = (u: string) => {
		const i = ex.colonnes.findIndex((c) => c.unite === u);
		return i > 0 && i < n - 1;
	};
	return entouree(ex.answerUnit) || entouree(enonceConnu(ex.question).unite);
}

/** Critère 3 : l'unité a bien sa colonne dans la tranche affichée. */
const aSaColonne = (ex: Tableau, unite: string) => ex.colonnes.some((c) => c.unite === unite);

/* ---------- Critères 1 à 3 : la tranche ---------- */

describe('#711 tableau — tranche de colonnes fixe', () => {
	it('critère 1 : pour un couple (leçon, niveau), la tranche est la même quelle que soit la paire tirée', () => {
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				const vues = [...new Set(genTab(id, level, 100).map(signature))];
				// Une seule disposition observée ⇒ chaque unité garde son indice, et les
				// unités de la première et de la dernière colonne sont constantes.
				expect(vues, `${id} / ${level} : la tranche dépend de la paire tirée`).toEqual([vues[0]]);
			}
		}
	});

	it('critère 1 : colonnes ordonnées grande→petite, contiguës sur l’échelle de la grandeur', () => {
		for (const id of FAMILLES) {
			const echelle = ECHELLES[id];
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 200)) {
					const idx = ex.colonnes.map((c) => echelle.indexOf(c.unite));
					expect(
						idx.every((v) => v >= 0),
						`unité hors échelle dans « ${signature(ex)} »`,
					).toBe(true);
					for (let i = 1; i < idx.length; i++) expect(idx[i]).toBe(idx[i - 1] + 1);
				}
			}
		}
	});

	it('critère 2 : la réponse ne s’obtient plus en poussant les chiffres jusqu’à un bord', () => {
		// Masses CE2 volontairement absentes : une seule paire (kg↔g) au niveau, cas en
		// arbitrage (critère 4) qui fera l'objet d'un second passage.
		for (const id of ['mes-longueurs', 'mes-contenances']) {
			for (const level of NIVEAUX) {
				const items = genTab(id, level, 100);
				const entourees = items.filter(uneUniteEntouree).length;
				expect(
					entourees,
					`${id} / ${level} : connue et cible toujours aux deux bords sur ${items.length} items`,
				).toBeGreaterThan(0);
			}
		}
	});

	it('critère 3 : l’unité connue comme l’unité cible ont toujours leur colonne', () => {
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 200)) {
					const connue = enonceConnu(ex.question).unite;
					expect(connue, `énoncé illisible : « ${ex.question} »`).not.toBe('');
					// L'unité cible est bien celle collée au champ « @ » de l'énoncé partagé.
					expect(ex.answerUnit).not.toBe('');
					expect(ex.question).toContain(`@ ${ex.answerUnit}`);
					expect(aSaColonne(ex, connue), `${connue} sans colonne (${signature(ex)})`).toBe(true);
					expect(
						aSaColonne(ex, ex.answerUnit),
						`${ex.answerUnit} sans colonne (${signature(ex)})`,
					).toBe(true);
				}
			}
		}
	});
});

/* ---------- Critère 15 : les chiffres à leur rang ---------- */

describe('#711 tableau — chiffres posés au bon rang', () => {
	it('critère 15 : un chiffre par colonne, seule la tête (colonne 0) peut en porter deux', () => {
		// Avec une tranche fixe, la tête n'est plus l'unité connue mais la plus grande unité
		// de la tranche : elle peut donc valoir « 0 ». Elle absorbe en revanche les rangs
		// au-dessus d'elle (« 20 km »), d'où 2 chiffres possibles — bornés par les valeurs
		// tirées (au plus 20 dans la grande unité). Les autres colonnes valent UN rang : y
		// déverser plusieurs chiffres (« 3000 » dans la colonne des mètres) est la faute que
		// cette règle attrape une fois la tranche fixe.
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 200)) {
					expect(ex.colonnes.length).toBeGreaterThanOrEqual(2);
					ex.colonnes.forEach((col, i) => {
						expect(/^[0-9]+$/.test(col.chiffres), `case non numérique : « ${col.chiffres} »`).toBe(
							true,
						);
						if (i === 0) {
							expect(col.chiffres.length).toBeGreaterThanOrEqual(1);
							expect(col.chiffres.length).toBeLessThanOrEqual(2);
							// Pas de rembourrage : « 03 » n'est pas une écriture de nombre.
							if (col.chiffres.length === 2) expect(col.chiffres.startsWith('0')).toBe(false);
						} else {
							expect(col.chiffres.length, `${col.unite} porte « ${col.chiffres} »`).toBe(1);
						}
						expect(col.nom.length).toBeGreaterThan(0); // nom complet visible (a11y dys)
					});
				}
			}
		}
	});

	it('critère 15 : relus à la colonne cible les chiffres donnent la réponse, relus à la colonne connue la valeur de l’énoncé', () => {
		// Deux lectures, pas une redondance : la première dit que le tableau répond bien à
		// `answer` ; la seconde l'amarre à l'énoncé AFFICHÉ (un tableau construit sur une
		// autre instance que la question passerait la première seule). Les deux échouent si
		// un chiffre est posé une colonne trop à gauche ou à droite.
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 300)) {
					const attendu = Number(ex.answer.replace(',', '.'));
					expect(
						valeurLue(ex, ex.answerUnit),
						`cible ${ex.answerUnit} : « ${ex.question} »`,
					).toBeCloseTo(attendu, 6);
					const connu = enonceConnu(ex.question);
					expect(
						valeurLue(ex, connu.unite),
						`connue ${connu.unite} : « ${ex.question} »`,
					).toBeCloseTo(connu.valeur, 6);
				}
			}
		}
	});

	it('critère 15 : une colonne de tête à 2 chiffres reste atteignable (longueurs CM1, valeurs jusqu’à 20)', () => {
		// Le rendu doit prévoir la case large (option a de #394) : la tranche fixe ne doit pas
		// faire disparaître le cas. Éprouvé sur les longueurs CM1, seul couple où le programme
		// impose la tranche (« du millimètre au kilomètre ») et où une valeur ≥ 10 dans la plus
		// grande unité est tirable.
		const longueurs = genTab('mes-longueurs', 'cm1', 400);
		expect(longueurs.some((ex) => ex.colonnes[0].chiffres.length === 2)).toBe(true);
	});
});

/* ---------- Critères 5 à 7 et 20 : unités étudiées / hors programme ---------- */

describe('#711 tableau — unités étudiées et colonnes de transit', () => {
	it('critère 5 : au CM1, aucune colonne n’est marquée « pas encore vue en classe »', () => {
		for (const id of FAMILLES) {
			for (const ex of genTab(id, 'cm1', 200)) {
				const demotees = ex.colonnes.filter((c) => c.transit).map((c) => c.unite);
				expect(demotees, `${id} CM1 : colonnes démotées`).toEqual([]);
			}
		}
	});

	it('critère 6 : le tableau des contenances CM1 va du millilitre à l’hectolitre', () => {
		for (const ex of genTab('mes-contenances', 'cm1', 50)) {
			for (const unite of ['hL', 'daL', 'L', 'dL', 'cL', 'mL']) {
				expect(aSaColonne(ex, unite), `${unite} absente de « ${signature(ex)} »`).toBe(true);
			}
		}
	});

	it('critère 7 : au CE2, une colonne est démotée SI ET SEULEMENT SI elle est hors programme', () => {
		for (const id of FAMILLES) {
			const programme = PROGRAMME_CE2[id];
			for (const ex of genTab(id, 'ce2', 200)) {
				for (const col of ex.colonnes) {
					const auProgramme = programme.includes(col.unite);
					// Les DEUX sens. Le test ne tenait que le premier, et sa propre table savait
					// pourtant que le décimètre est au programme CE2 : la colonne était démotée sur
					// tous les items sans que rien ne le signale (constat relecteur-qualite).
					expect(
						col.transit,
						`${col.unite} ${auProgramme ? 'au programme CE2 mais présentée comme pas encore vue' : 'présentée comme étudiée au CE2'}`,
					).toBe(!auProgramme);
				}
			}
		}
	});

	it('critère 20 : aucune leçon CE2 ne tire une unité hors de son programme', () => {
		for (const id of FAMILLES) {
			const programme = PROGRAMME_CE2[id];
			for (const ex of genTab(id, 'ce2', 200)) {
				const connue = enonceConnu(ex.question).unite;
				expect(programme, `unité connue « ${connue} » : ${ex.question}`).toContain(connue);
				expect(programme, `unité cible « ${ex.answerUnit} » : ${ex.question}`).toContain(
					ex.answerUnit,
				);
			}
		}
	});

	it('critères 7 et 20 : l’unité connue et l’unité cible ne sont jamais sur une colonne démotée', () => {
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 200)) {
					const connue = enonceConnu(ex.question).unite;
					for (const u of [connue, ex.answerUnit]) {
						const col = ex.colonnes.find((c) => c.unite === u);
						expect(col?.transit, `${u} tirée alors qu’elle est démotée (${id}/${level})`).toBe(
							false,
						);
					}
				}
			}
		}
	});
});

/* ---------- Ce que la tranche fixe met en danger ailleurs ---------- */

describe('#711 tableau — l’étayage déroule bien la conversion de l’enfant', () => {
	it('le déroulé part de l’unité de l’énoncé et va à l’unité cible', () => {
		/* Exigence : après un item raté, le panneau montre SA conversion, pas une voisine
		   (`src/core/etayage-conversion.ts`). L'unité de départ ne figurant nulle part dans
		   l'`Exercise`, elle est aujourd'hui DÉDUITE de la structure : « la cible est une des
		   deux extrémités, donc l'autre extrémité est le départ ». Cette déduction est
		   exactement ce que la tranche fixe supprime — d'où cette garde ici plutôt que dans
		   `etayage-conversion.test.ts` : verte aujourd'hui, elle rougit à la seconde où la
		   tranche cesse de coïncider avec la paire, soit en rendant `undefined` (aucun
		   étayage), soit en désignant la mauvaise colonne de départ. */
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 100)) {
					const spec = conversionDepuisTableau(ex);
					expect(spec, `aucun déroulé pour « ${ex.question} » (${signature(ex)})`).toBeDefined();
					expect(spec?.depart, `départ faux pour « ${ex.question} »`).toBe(
						enonceConnu(ex.question).unite,
					);
					expect(spec?.cible).toBe(ex.answerUnit);
				}
			}
		}
	});
});

/* ---------- Critère 10 : l'invariant transit ⊕ virgule ---------- */

describe('#711 tableau — invariant zéro-de-transit ⊕ virgule', () => {
	it('critère 10 : jamais une colonne démotée ET une virgule dans le même exercice', () => {
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 400)) {
					const aTransit = ex.colonnes.some((c) => c.transit);
					const aVirgule = ex.virguleApres !== undefined;
					expect(aTransit && aVirgule, `${id}/${level} : « ${ex.question} »`).toBe(false);
				}
			}
		}
	});

	it('virgule ⟺ réponse décimale, rattachée à la colonne cible', () => {
		for (const id of FAMILLES) {
			for (const ex of genTab(id, 'cm1', 400)) {
				const decimale = ex.answer.includes(',');
				expect(ex.virguleApres !== undefined).toBe(decimale);
				if (ex.virguleApres !== undefined) {
					expect(ex.colonnes[ex.virguleApres].unite).toBe(ex.answerUnit);
				}
			}
		}
	});

	it('CE2 : entier partout → jamais de virgule', () => {
		for (const id of FAMILLES) {
			for (const ex of genTab(id, 'ce2', 300)) {
				expect(ex.virguleApres).toBeUndefined();
				expect(ex.answer).not.toContain(',');
			}
		}
	});
});

/* ---------- Modes exposés (inchangés par #711) ---------- */

describe('#394 tableau — modes exposés', () => {
	it('longueurs / masses / contenances proposent saisie + tableau ; durées mono-mode', () => {
		for (const id of FAMILLES) {
			const modes = type(id).modes?.map((m) => m.id) ?? [];
			expect(modes).toContain('saisie');
			expect(modes).toContain('tableau');
			expect(type(id).modes?.find((m) => m.recommended)?.id).toBe('saisie');
		}
		// Durées : pas d’échelle décimale → pas de mode tableau (reste mono-mode).
		const durees = type('mes-durees');
		expect(durees.modes).toBeUndefined();
		// Et un forçage du mode tableau retombe sur la saisie texte (jamais un tableau).
		for (let i = 0; i < 50; i++) {
			expect(durees.generate({ mode: 'tableau', level: 'cm1' }).type).toBe('text');
		}
	});

	it('checkAnswer renvoie false pour un tableau (corrigé cellule par cellule par le runner)', () => {
		const ex = genTab('mes-longueurs', 'cm1', 1)[0];
		expect(checkAnswer(ex, ex.answer)).toBe(false);
	});

	it('le `check` du type renvoie aussi false pour un tableau (garde-fou, jamais de correction générique)', () => {
		const t = type('mes-longueurs');
		const ex = genTab('mes-longueurs', 'cm1', 1)[0];
		// Même avec la « bonne » valeur cible, le check générique ne doit pas la valider.
		expect(t.check(ex, ex.answer)).toBe(false);
	});
});

/* ---------- Témoins : ce qui doit faire RÉAGIR les détecteurs ci-dessus ----------
   Les critères 2, 3 et 15 sont vérifiés par des prédicats maison. Un prédicat trop
   permissif laisserait la suite verte sur du contenu fautif : on le joue donc ici sur des
   tableaux FABRIQUÉS portant exactement la faute annoncée, plus les témoins corrects qui
   ne doivent PAS être signalés. */

const colonne = (unite: string, chiffres: string, transit = false): TableauColonne => ({
	unite,
	nom: unite,
	transit,
	chiffres,
});

const fauxTableau = (
	question: string,
	answer: string,
	answerUnit: string,
	colonnes: TableauColonne[],
): Tableau => ({
	type: 'tableauConversion',
	question,
	answer,
	answerUnit,
	// Lue depuis l'énoncé du témoin, jamais posée à la main : un fixture dont l'unité connue
	// contredirait sa propre question ne prouverait rien.
	uniteConnue: enonceConnu(question).unite,
	colonnes,
});

describe('#711 témoins des détecteurs', () => {
	it('l’unité connue se lit dans les deux dispositions de l’énoncé', () => {
		expect(enonceConnu('3 m = @ cm')).toEqual({ valeur: 3, unite: 'm' });
		expect(enonceConnu('@ cm = 3 m')).toEqual({ valeur: 3, unite: 'm' });
		expect(enonceConnu('4,56 m = @ cm')).toEqual({ valeur: 4.56, unite: 'm' });
		expect(enonceConnu('@ km = 3 000 m')).toEqual({ valeur: 3000, unite: 'm' });
		expect(enonceConnu('illisible').unite).toBe(''); // signalé, pas deviné
	});

	it('la relecture des chiffres rejette un tableau dont les chiffres sont décalés d’une colonne', () => {
		const colonnes = ['m', 'dm', 'cm'];
		const bon = fauxTableau(
			'3 m = @ cm',
			'300',
			'cm',
			colonnes.map((u, i) => colonne(u, i === 0 ? '3' : '0')),
		);
		expect(valeurLue(bon, 'cm')).toBe(300);
		expect(valeurLue(bon, 'm')).toBe(3);
		// Mêmes chiffres, poussés d'une colonne vers la droite (« aligner sur le bord »).
		const decale = fauxTableau(
			'3 m = @ cm',
			'300',
			'cm',
			colonnes.map((u, i) => colonne(u, i === 1 ? '3' : '0')),
		);
		expect(valeurLue(decale, 'cm')).not.toBe(300);
		expect(valeurLue(decale, 'm')).not.toBe(3);
	});

	it('une unité sans colonne est détectée', () => {
		const ex = fauxTableau('3 m = @ mm', '3000', 'mm', [colonne('m', '3'), colonne('dm', '0')]);
		expect(aSaColonne(ex, 'mm')).toBe(false);
		expect(aSaColonne(ex, 'm')).toBe(true);
	});

	it('le détecteur de bord distingue une unité entourée d’une unité collée au bord', () => {
		const auxBords = fauxTableau('3 m = @ cm', '300', 'cm', [
			colonne('m', '3'),
			colonne('dm', '0'),
			colonne('cm', '0'),
		]);
		expect(uneUniteEntouree(auxBords)).toBe(false);
		const entouree = fauxTableau('3 m = @ dm', '30', 'dm', [
			colonne('m', '3'),
			colonne('dm', '0'),
			colonne('cm', '0'),
		]);
		expect(uneUniteEntouree(entouree)).toBe(true);
	});
});

/* Gate #711 (constat `relecteur-qualite`) : ouvrir la chaîne de rangs au CM1 ne sert à rien
   si l'enfant n'est jamais INTERROGÉ dessus. Les critères 5 et 6 ne vérifient que la
   PRÉSENCE des colonnes, laquelle est garantie quoi qu'il arrive — la tranche et le marquage
   se calculent sur toutes les relations configurées, tirées ou non. Un `tirerConversion` qui
   ne sélectionnerait jamais le groupe « consolidation » laisserait donc tout vert, avec des
   colonnes bien nommées sur lesquelles aucune question ne tomberait jamais : exactement le
   défaut que ce lot dit corriger. */
describe('#711 tirage — les rangs ouverts au CM1 sont réellement interrogés', () => {
	// Unités que SEULES les relations de rang intermédiaire mettent en jeu.
	const RANGS_CM1: Record<string, string[]> = {
		'mes-longueurs': ['hm', 'dam'],
		'mes-masses': ['hg', 'dag', 'dg', 'cg'],
		'mes-contenances': ['hL', 'daL'],
	};

	it('chaque unité de rang apparaît comme unité connue ou cible sur un large échantillon', () => {
		for (const [id, rangs] of Object.entries(RANGS_CM1)) {
			const vues = new Set<string>();
			for (const ex of genTab(id, 'cm1', 1200)) {
				vues.add(ex.answerUnit);
				vues.add(enonceConnu(ex.question).unite);
			}
			for (const unite of rangs) {
				expect(vues.has(unite), `${id} CM1 : ${unite} affichée mais jamais interrogée`).toBe(true);
			}
		}
	});

	it('les relations d’ancrage restent majoritaires (elles resservent partout ailleurs)', () => {
		// Pas un ratio exact — la pondération est un réglage, pas un contrat. Ce qui est tenu :
		// le groupe de consolidation ne DOMINE pas. Sur les longueurs CM1, les items dont les
		// DEUX unités sont des rangs intermédiaires doivent rester minoritaires.
		const items = genTab('mes-longueurs', 'cm1', 1200);
		const rangs = new Set(RANGS_CM1['mes-longueurs']);
		const entreRangs = items.filter(
			(ex) => rangs.has(ex.answerUnit) || rangs.has(enonceConnu(ex.question).unite),
		).length;
		expect(entreRangs).toBeGreaterThan(0);
		expect(entreRangs).toBeLessThan(items.length / 2);
	});
});
