/* ============================================================
   Grandeurs et mesures — Lire l'heure (MES7, #88).
   Première leçon « cliente » du moteur de figures SVG
   (core/figures.ts) : une horloge à aiguilles est générée et
   affichée au-dessus de la question. Deux modes (#69) :
   - `saisie` (conseillé, compatible fiche imprimable & bilans) :
     l'enfant écrit l'heure (« 10 h 15 ») — parsing TOLÉRANT
     (10h15, 10:15, 8 / 8h / 8h00 pour les heures pile) ;
   - `qcm` : 4 propositions, distracteurs = erreurs classiques.

   Calibrage pédagogique CE2 (avis pedagogue-primaire) :
   - horloge 12 h UNIQUEMENT (jamais 0 h ni format 24 h : CM1) ;
   - 4 plages pondérées du simple au dur : heures pile (~40 %),
     demi-heures (~25 %), quarts 15/45 (~20 %), multiples de 5
     (~15 %) ; la minute près relève du CM1, écartée ;
   - aiguille des heures proportionnelle aux minutes (gérée par le
     rendu SVG) ; on écarte les positions où les deux aiguilles se
     superposent (dont 12 h 00) → lecture ambiguë.
   ============================================================ */
import type { Exercise, ExerciseType, ExerciseMode, ModeOption } from '../../core/exercise';
import { normalizeText, rnd, choice, sample } from '../../core/utils';
import { renderFigure } from '../../core/figures';

const MODES: ModeOption[] = [
	{ id: 'saisie', label: "J'écris l'heure", hint: 'au clavier', icon: '⌨️', recommended: true },
	{ id: 'qcm', label: 'Je choisis la bonne heure', hint: 'parmi 4', icon: '👆' },
];

interface Heure {
	h: number; // 1..12
	m: number; // 0..59 (multiples de 5 ici)
}

/* Écart angulaire entre les deux aiguilles (degrés, 0..180). */
function ecartAiguilles(h: number, m: number): number {
	const minuteAngle = m * 6;
	const hourAngle = (h % 12) * 30 + m * 0.5;
	const gap = Math.abs(minuteAngle - hourAngle) % 360;
	return Math.min(gap, 360 - gap);
}

/* Tire une heure dans les 4 plages pondérées, en évitant les aiguilles quasi
   superposées (gap < 12° → lecture ambiguë : 12 h 00, ~1 h 05…). */
function genHeure(): Heure {
	for (;;) {
		const r = rnd(1, 100);
		const m =
			r <= 40
				? 0
				: r <= 65
					? 30
					: r <= 85
						? choice([15, 45])
						: choice([5, 10, 20, 25, 35, 40, 50, 55]);
		const h = rnd(1, 12);
		if (ecartAiguilles(h, m) >= 12) return { h, m };
	}
}

/* Forme canonique affichée : « H h MM » (minutes sur 2 chiffres). */
function fmtHeure(h: number, m: number): string {
	return `${h} h ${String(m).padStart(2, '0')}`;
}

/* Formes d'écriture acceptées en saisie (parsing tolérant, avis pédagogique) :
   séparateur « h » ou « : », minutes avec ou sans zéro ; pour les heures pile,
   on accepte aussi « 8 », « 8 h », « 8h00 », « 8 heures ». */
function variantes(h: number, m: number): string[] {
	const set = new Set<string>();
	const minForms = m === 0 ? ['00', '0'] : [String(m).padStart(2, '0'), String(m)];
	for (const mf of minForms) {
		set.add(`${h} h ${mf}`);
		set.add(`${h}h${mf}`);
		set.add(`${h}h ${mf}`);
		set.add(`${h} h${mf}`);
		set.add(`${h} H ${mf}`);
		set.add(`${h}H${mf}`);
		set.add(`${h}:${mf}`);
		set.add(`${h} : ${mf}`);
	}
	if (m === 0) {
		set.add(`${h}`);
		set.add(`${h} h`);
		set.add(`${h}h`);
		set.add(`${h} heures`);
		set.add(`${h}heures`);
	}
	return [...set];
}

/* Distracteurs QCM = erreurs classiques d'un CE2 (avis pédagogique) :
   ±5/±10 min (comptage de 5 en 5), ±1 h (petite aiguille mal attribuée),
   confusion quart/demi, « minutes = chiffre pointé » (grande aiguille sur 3
   lue « 3 min »), et inversion des deux aiguilles. */
function distracteurs(h: number, m: number): Heure[] {
	const wrapH = (x: number) => ((x - 1 + 12) % 12) + 1;
	const cands: Heure[] = [];
	for (const dm of [5, -5, 10, -10]) {
		const nm = m + dm;
		if (nm >= 0 && nm < 60) cands.push({ h, m: nm });
	}
	cands.push({ h: wrapH(h + 1), m }, { h: wrapH(h - 1), m });
	if (m === 15) cands.push({ h, m: 45 }, { h, m: 30 });
	if (m === 45) cands.push({ h, m: 15 }, { h, m: 30 });
	if (m === 30) cands.push({ h, m: 15 }, { h, m: 45 });
	if (m % 5 === 0 && m !== 0) {
		cands.push({ h, m: m / 5 }); // « minutes = chiffre pointé »
		cands.push({ h: m / 5, m: (h % 12) * 5 }); // inversion des aiguilles
	}
	// Valides, distincts, jamais la bonne réponse.
	const seen = new Set([fmtHeure(h, m)]);
	const out: Heure[] = [];
	for (const c of cands) {
		if (c.h < 1 || c.h > 12 || c.m < 0 || c.m > 59) continue;
		const key = fmtHeure(c.h, c.m);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(c);
	}
	// Filet de sécurité : compléter si moins de 3 distracteurs trouvés.
	let dm = 5;
	while (out.length < 3 && dm <= 55) {
		for (const nm of [m + dm, m - dm]) {
			if (nm < 0 || nm >= 60) continue;
			const key = fmtHeure(h, nm);
			if (!seen.has(key)) {
				seen.add(key);
				out.push({ h, m: nm });
			}
		}
		dm += 5;
	}
	return out;
}

function genExercise(mode?: ExerciseMode): Exercise {
	const { h, m } = genHeure();
	const figure = renderFigure({ kind: 'horloge', heures: h, minutes: m });
	if (mode === 'qcm') {
		const opts = [{ h, m }, ...sample(distracteurs(h, m), 3)];
		const choices = sample(opts, opts.length).map((o) => fmtHeure(o.h, o.m));
		return {
			type: 'qcm',
			question: 'Quelle heure est-il ?',
			answer: fmtHeure(h, m),
			choices,
			figure,
		};
	}
	return {
		type: 'text',
		question: 'Quelle heure est-il ? @',
		answer: fmtHeure(h, m),
		answers: variantes(h, m),
		figure,
		champHeure: true, // saisie en 2 champs [heures] h [minutes] (#88)
	};
}

export function heureType(): ExerciseType {
	return {
		modes: MODES,
		generate: genExercise,
		check(exercise: Exercise, input: string): boolean {
			if (exercise.type !== 'text' && exercise.type !== 'qcm') return false;
			const norm = normalizeText(input);
			if (norm === normalizeText(exercise.answer)) return true;
			return exercise.type === 'text'
				? (exercise.answers ?? []).some((a) => normalizeText(a) === norm)
				: false;
		},
	};
}

export interface HeureLessonDef {
	id: string;
	label: string;
	exerciseType: ExerciseType;
}

export const HEURE_LESSONS: HeureLessonDef[] = [
	{
		id: 'mes-lecture-heure',
		label: "Je lis l'heure",
		exerciseType: heureType(),
	},
];
