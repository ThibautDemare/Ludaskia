/* ============================================================
   Géométrie — Je reconnais les solides (GEOM10, #103).
   Cliente du moteur de figures SVG (core/figures.ts, `renderSolide`).
   Deux leçons (avis pedagogue-primaire : deux compétences, comme les
   figures planes) :
   - `geo-solides-reconnaitre` : identification — un solide est dessiné
     (schéma en perspective), l'enfant le nomme. Deux modes (#69) : `qcm`
     (conseillé) et `saisie` (on écrit le nom ; fiche imprimable).
   - `geo-solides-proprietes` : propriétés mémorisées (QCM textuel).

   Choix de rendu : **schémas SVG générés** (`renderSolide`), pas d'images
   statiques — cohérent avec le moteur de figures, sans gestion d'assets.

   Calibrage CE2 (avis pedagogue-primaire) :
   - 6 solides : cube, pavé droit, cylindre, cône, pyramide, boule (pas de
     prisme) ; libellés « pavé droit » et « boule » (pas « sphère »).
   - comptage EXACT réservé aux polyèdres (cube/pavé : 6 faces, 8 sommets,
     cube 12 arêtes ; pyramide : 5 faces, 5 sommets). JAMAIS le nombre de
     faces/arêtes d'un cylindre / cône / boule (ambigu) → seulement des
     propriétés qualitatives sûres (« roule », « une pointe », « 2 disques »).
   - HORS PÉRIMÈTRE : compter faces/arêtes/sommets sur le dessin (faces
     cachées) — les propriétés sont mémorisées, pas comptées.
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption, GenerateOpts } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { MODE_QCM_POINT } from '../_shared';
import type { LessonInput } from '../_shared';
import type { PropQ } from './_shared';
import { checkNumeriqueOuTexte } from '../../core/check-helpers';
import type { Solid, SolidOrient } from '../../core/figures';
import { renderFigure } from '../../core/figures';
import { choice, sample, rnd } from '../../core/utils';

/* Orientation du schéma (#286 — variété visuelle, cadrage designer-ux-enfant) :
   on fait varier cube/pavé/pyramide pour qu'un même solide n'apparaisse pas
   toujours à l'identique. ~60 % vue canonique (ancrage), ~40 % variantes (miroir
   horizontal, et léger angle/profondeur pour les boîtes). Cylindre/cône/boule :
   une seule vue lisible → orientation inchangée. */
function orientSolide(solid: Solid): SolidOrient {
	if (solid === 'cube' || solid === 'pave') {
		const r = rnd(1, 100);
		if (r <= 60) return { lean: 0, mirror: false }; // canonique (fuite haut-droite)
		if (r <= 80) return { lean: 0, mirror: true }; // miroir (fuite haut-gauche)
		const lean: 1 | 2 = rnd(1, 2) === 1 ? 1 : 2; // plus plat / plus raide
		return { lean, mirror: rnd(1, 2) === 1 };
	}
	if (solid === 'pyramide') return { mirror: rnd(1, 100) > 60 }; // 60 % canonique / 40 % miroir
	return {}; // cylindre / cône / boule : vue unique
}

const NOM: Record<Solid, string> = {
	cube: 'cube',
	pave: 'pavé droit',
	cylindre: 'cylindre',
	cone: 'cône',
	pyramide: 'pyramide',
	boule: 'boule',
	// Prisme droit : CM1 (#242). Absent du tirage CE2 (`TOUS` ci-dessous reste à 6).
	prisme: 'prisme',
};
const TOUS: Solid[] = ['cube', 'pave', 'cylindre', 'cone', 'pyramide', 'boule'];
// Formes équivalentes acceptées en saisie (le QCM reste sur le libellé de référence).
const ACCEPTE: Partial<Record<Solid, string[]>> = { pave: ['pavé droit', 'pavé'] };

const MODES: ModeOption[] = [
	{ ...MODE_QCM_POINT, hint: 'parmi 4' },
	{ id: 'saisie', label: "J'écris le nom", hint: 'au clavier', icon: 'keyboard' },
];

/* ---------- Objectif 1 : reconnaître (schéma + nom) ---------- */

function reconnaitreType(): ExerciseType {
	return {
		modes: MODES,
		generate(opts?: GenerateOpts): Exercise {
			const mode = opts?.mode;
			const solid = choice(TOUS);
			const answer = NOM[solid];
			const figure = renderFigure({ kind: 'solide', solid, orient: orientSolide(solid) });
			if (mode === 'qcm') {
				const distract = sample(
					TOUS.map((s) => NOM[s]).filter((n) => n !== answer),
					3,
				);
				return {
					type: 'qcm',
					question: 'Quel est ce solide ?',
					answer,
					choices: sample([answer, ...distract], 4),
					figure,
				};
			}
			return {
				type: 'text',
				question: 'Quel est ce solide ? @',
				answer,
				answers: ACCEPTE[solid] ?? [answer],
				figure,
			};
		},
		check: checkAnswer,
	};
}

/* ---------- Objectif 2 : propriétés (QCM textuel) ---------- */

const PROPRIETES: PropQ[] = [
	// Comptage exact : polyèdres uniquement (cube, pavé, pyramide).
	{ q: 'Combien de faces a un cube ?', a: '6', choices: ['4', '5', '6', '8'] },
	{ q: 'Combien de sommets a un cube ?', a: '8', choices: ['4', '6', '8', '12'] },
	{ q: "Combien d'arêtes a un cube ?", a: '12', choices: ['6', '8', '10', '12'] },
	{ q: 'Combien de faces a un pavé droit ?', a: '6', choices: ['4', '5', '6', '8'] },
	{ q: 'Combien de faces a une pyramide à base carrée ?', a: '5', choices: ['4', '5', '6', '8'] },
	// Cylindre / cône / boule : propriétés qualitatives sûres (jamais de comptage).
	{
		q: "Quel solide roule mais n'a aucun coin ?",
		a: 'la boule',
		choices: ['la boule', 'le cube', 'le pavé droit', 'la pyramide'],
	},
	{
		q: 'Quel solide a une pointe (un sommet) ?',
		a: 'le cône',
		choices: ['le cône', 'le cylindre', 'le cube', 'la boule'],
	},
	{
		q: 'Quel solide a toutes ses faces carrées ?',
		a: 'le cube',
		choices: ['le cube', 'le pavé droit', 'la pyramide', 'le cylindre'],
	},
	{
		q: 'Quel solide a deux faces rondes (deux disques) ?',
		a: 'le cylindre',
		choices: ['le cylindre', 'le cône', 'la boule', 'le cube'],
	},
	{
		q: 'Quel solide ne roule pas du tout ?',
		a: 'le cube',
		choices: ['le cube', 'la boule', 'le cylindre', 'le cône'],
	},
	// Ancrage objet-réel (du concret vers l'abstrait).
	{
		q: "Quel solide a la forme d'une boîte de conserve ?",
		a: 'le cylindre',
		choices: ['le cylindre', 'le cube', 'la boule', 'le cône'],
	},
	{
		q: "Quel solide a la forme d'un ballon ?",
		a: 'la boule',
		choices: ['la boule', 'le cylindre', 'le cube', 'le cône'],
	},
	// ----- Ajouts #285 (variété) : comptage EXACT réservé aux polyèdres (cube/pavé/pyramide) ;
	// pour les solides ronds, propriétés qualitatives sûres + ancrage objet-réel. -----
	{ q: "Combien d'arêtes a un pavé droit ?", a: '12', choices: ['6', '8', '10', '12'] },
	{ q: 'Combien de sommets a un pavé droit ?', a: '8', choices: ['4', '6', '8', '12'] },
	{
		q: 'Combien de sommets a une pyramide à base carrée ?',
		a: '5',
		choices: ['4', '5', '6', '8'],
	},
	{ q: 'Combien de disques a un cylindre ?', a: '2', choices: ['0', '1', '2', '3'] },
	{
		q: "Quel solide a la forme d'un dé ?",
		a: 'le cube',
		choices: ['le cube', 'la boule', 'le cylindre', 'le cône'],
	},
	{
		q: "Quel solide a la forme d'une balle ?",
		a: 'la boule',
		choices: ['la boule', 'le cube', 'le pavé droit', 'le cône'],
	},
];

function proprietesType(): ExerciseType {
	return {
		modes: [MODE_QCM_POINT],
		generate(): Exercise {
			const p = choice(PROPRIETES);
			return {
				type: 'qcm',
				question: p.q,
				answer: p.a,
				choices: sample(p.choices, p.choices.length),
			};
		},
		check: checkNumeriqueOuTexte,
	};
}

/* ---------- Descripteurs ---------- */

export const SOLIDE_LESSONS: LessonInput[] = [
	{
		id: 'geo-solides-reconnaitre',
		label: 'Je reconnais les solides',
		exerciseType: reconnaitreType(),
	},
	{
		id: 'geo-solides-proprietes',
		label: 'Les propriétés des solides',
		exerciseType: proprietesType(),
	},
];
