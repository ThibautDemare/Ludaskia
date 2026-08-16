/* ============================================================
   Grandeurs et mesures — Calculer une DURÉE (CM1, #252).
   Programme 2025 §2.6 : calculer une durée écoulée entre deux instants, et
   déterminer un instant à partir d'un instant et d'une durée. DEUX formes, tirées
   aléatoirement (comme la division alterne ses formes) :
   - Forme A « durée écoulée » : « De h1 h m1 à h2 h m2, combien de temps s'est
     écoulé ? » → étape 1 heures écoulées, étape 2 minutes de plus.
   - Forme B « instant + durée → instant » : « Il est h1 h m1. <durée> plus tard,
     quelle heure sera-t-il ? » → étape 1 heures d'arrivée, étape 2 minutes d'arrivée.

   Runner « problème » à DEUX sous-questions (charpente partagée
   `_probleme-deux-sous-questions.ts`, comme la division euclidienne #251) : mode
   saisie (recommandé) + variante QCM accessible. CM1-only, hors sprint (deux champs
   + lecture d'énoncé). Sans figure horloge au lancement (texte seul — le rendu
   deux-cadrans est différé).

   Calibrage (avis pedagogue + specialiste-troubles-apprentissage) :
   - minutes des instants = multiples de 5 (départ ET arrivée) ;
   - PAS de passage de midi ni de minuit (même demi-journée, jamais ambigu) ;
     départ < arrivée, durée ≠ 0 ; amplitude totale ≤ 4 h ;
   - la « retenue » (minutes d'arrivée < minutes de départ) est DOSÉE : majorité de
     cas simples d'abord (~2/3 sans retenue), le reste avec — sans la bannir (c'est
     l'intérêt de la compétence) ;
   - `parle` EXPLICITE, chiffres en toutes lettres et « heures/minutes » écrits (le
     TTS n'étend pas le « h », cf. core/tts-text.ts) ;
   - `explication` = stratégie du « pont » (de 8 h 40 à 9 h = 20 min ; de 9 h à
     9 h 10 = 10 min ; total 30 min), affichée après la réponse dans les deux modes ;
   - distracteurs QCM = erreurs classiques : oublier la retenue, ±1 h, minute mal lue.

   INVARIANT PROJET : tous les résultats (heures/minutes) sont CALCULÉS à la génération
   puis STOCKÉS (`etapes[].answer` en saisie, chaîne `answer` en QCM), jamais recalculés
   au `check`.
   ============================================================ */
import { rnd, sample } from '../../core/utils';
import { nombreEnMots } from '../../core/nombres';
import type { Exercise } from '../../core/exercise';
import { etayageRedige, type LessonInput } from '../_shared';
import { deuxSousQuestionsType } from './_probleme-deux-sous-questions';

const PAS_MINUTE = 5; // minutes toujours multiples de 5
const AMPLITUDE_MAX = 240; // durée ≤ 4 h
const AVANT_MIDI = 11 * 60 + 55; // arrivée ≤ 11 h 55 → jamais de passage de midi

/* Décisions d'un tirage : instants de départ/arrivée (avant midi) et durée écoulée
   (dh h dm min, dm ∈ [0,55]). `avecRetenue` ⟺ minutes d'arrivée < minutes de départ. */
interface TirageDuree {
	h1: number;
	m1: number;
	h2: number;
	m2: number;
	dh: number;
	dm: number;
	avecRetenue: boolean;
}

function tireDuree(): TirageDuree {
	// ~1/3 des cas avec retenue : une MAJORITÉ de cas simples d'abord, sans bannir la retenue.
	const avecRetenue = rnd(0, 2) === 0;
	// Minutes de départ (multiples de 5). Avec retenue, m1 ≥ 5 : sinon aucune durée
	// ≤ 55 min ne peut faire « déborder » les 60 minutes (m1 + dm ≥ 60).
	const m1 = (avecRetenue ? rnd(1, 11) : rnd(0, 11)) * PAS_MINUTE;
	const h1 = rnd(1, 9); // départ en matinée, toujours avant midi
	const depart = h1 * 60 + m1;
	// Minutes de la durée, choisies selon la retenue voulue :
	// - avec retenue : m1 + dm ≥ 60 (⇒ m2 = m1 + dm − 60 < m1) ;
	// - sans retenue : m1 + dm < 60 (⇒ m2 = m1 + dm ≥ m1).
	const dm = avecRetenue
		? rnd(Math.ceil((60 - m1) / PAS_MINUTE), 11) * PAS_MINUTE
		: rnd(0, Math.floor((55 - m1) / PAS_MINUTE)) * PAS_MINUTE;
	// Heures de la durée : bornées par l'amplitude (≤ 4 h) ET par « rester avant midi ».
	const dhMax = Math.max(
		0,
		Math.min(Math.floor((AMPLITUDE_MAX - dm) / 60), Math.floor((AVANT_MIDI - depart - dm) / 60)),
	);
	// Durée ≠ 0 : si dm = 0, il faut au moins 1 h.
	const dhMin = dm === 0 ? 1 : 0;
	// Garde-fou : `dhMax` ≥ `dhMin` pour toute combinaison ATTEIGNABLE (h1 ≤ 9, m1 ≤ 55,
	// dm ≤ 55) — le `Math.max` ne se déclenche jamais en pratique ; il protège d'un futur
	// élargissement des bornes qui rendrait `dhMax` négatif.
	const dh = rnd(dhMin, Math.max(dhMin, dhMax));
	const arrivee = depart + dh * 60 + dm;
	return { h1, m1, h2: Math.floor(arrivee / 60), m2: arrivee % 60, dh, dm, avecRetenue };
}

/* ---------- Mise en forme (affiché à l'ŒIL) ---------- */
const mm = (m: number): string => String(m).padStart(2, '0');
// Instant affiché : « 8 h 20 », « 9 h » (minutes 0 omises, lecture d'horloge).
const fmtInstant = (h: number, m: number): string => (m === 0 ? `${h} h` : `${h} h ${mm(m)}`);
// Durée affichée dans l'énoncé (forme B) : « 2 h 30 », « 45 min », « 2 h ».
function fmtDureeCourt(h: number, m: number): string {
	if (h === 0) return `${m} min`;
	if (m === 0) return `${h} h`;
	return `${h} h ${mm(m)}`;
}
// Durée affichée comme RÉPONSE (choix QCM forme A) : « 2 h 30 min », « 45 min », « 2 h ».
function fmtDureeReponse(h: number, m: number): string {
	if (h === 0) return `${m} min`;
	if (m === 0) return `${h} h`;
	return `${h} h ${mm(m)} min`;
}

/* ---------- Mise en forme parlée (#42, à l'OREILLE) ----------
   Chiffres en toutes lettres, « heures/minutes » écrits (le TTS n'étend pas le « h »). */
const motHeures = (h: number): string => (h === 1 ? 'une heure' : `${nombreEnMots(h)} heures`);
// Instant parlé : lecture d'horloge (« huit heures vingt », « neuf heures »).
const motInstant = (h: number, m: number): string =>
	m === 0 ? motHeures(h) : `${motHeures(h)} ${nombreEnMots(m)}`;
// Durée parlée : unités écrites (« deux heures trente minutes », « quarante-cinq minutes »).
function motDuree(h: number, m: number): string {
	const mots = `${nombreEnMots(m)} minutes`;
	if (h === 0) return mots;
	if (m === 0) return motHeures(h);
	return `${motHeures(h)} ${mots}`;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Explication « pont » (affichée après la réponse) ----------
   Forme A (durée écoulée) : on saute d'abord à l'heure pleine, puis les heures
   entières, puis les minutes restantes. */
function explicationDuree(t: TirageDuree): string {
	const { h1, m1, h2, m2 } = t;
	const segs: string[] = [];
	const heurePleine = m1 === 0 ? h1 : h1 + 1;
	if (m1 !== 0) segs.push(`de ${fmtInstant(h1, m1)} à ${heurePleine} h : ${60 - m1} min`);
	const heuresEntieres = h2 - heurePleine;
	if (heuresEntieres > 0) segs.push(`de ${heurePleine} h à ${h2} h : ${heuresEntieres} h`);
	if (m2 > 0) segs.push(`de ${h2} h à ${fmtInstant(h2, m2)} : ${m2} min`);
	return `${cap(segs.join(' ; '))}. En tout : ${fmtDureeReponse(t.dh, t.dm)}.`;
}
/* Forme B (instant + durée → instant) : on ajoute les heures pleines, puis on
   « ponte » les minutes par l'heure pleine si elles débordent (retenue). */
function explicationArrivee(t: TirageDuree): string {
	const { h1, m1, dh, dm, h2, m2, avecRetenue } = t;
	const parts: string[] = [];
	const hInter = h1 + dh; // après ajout des heures pleines (mêmes minutes)
	let courant = fmtInstant(h1, m1);
	if (dh > 0) {
		const suivant = fmtInstant(hInter, m1);
		parts.push(`${courant} + ${dh} h → ${suivant}`);
		courant = suivant;
	}
	if (dm > 0) {
		if (avecRetenue) {
			const versHeure = 60 - m1;
			parts.push(`${courant} + ${versHeure} min → ${fmtInstant(hInter + 1, 0)}`);
			const reste = dm - versHeure;
			if (reste > 0)
				parts.push(`${fmtInstant(hInter + 1, 0)} + ${reste} min → ${fmtInstant(h2, m2)}`);
		} else {
			parts.push(`${courant} + ${dm} min → ${fmtInstant(h2, m2)}`);
		}
	}
	return `${cap(parts.join(' ; '))}.`;
}

/* ---------- Distracteurs QCM (de VRAIES formes ; jamais une faute affichée) ----------
   Candidats plausibles autour de la bonne réponse (±1 h, ±2 h, minute mal lue de ±5 /
   ±10 / ±15) ; le piège « oubli de retenue » est FORCÉ quand la retenue existe. La liste
   est VOLONTAIREMENT redondante : au pire cas (`dh=1, dm=0`), elle laisse encore une
   marge (≥ 5 candidats valides pour 3 tirés) afin de GARANTIR 4 choix uniques. Heures
   bornées à [hMin, 12] (jamais « 0 h », jamais au-delà d'une horloge 12 h). */
function distracteurs(
	hCorrect: number,
	mCorrect: number,
	fmt: (h: number, m: number) => string,
	hMin: number,
	piege: string | undefined,
): string[] {
	const correct = fmt(hCorrect, mCorrect);
	const candidats: Array<[number, number]> = [
		[hCorrect + 1, mCorrect],
		[hCorrect - 1, mCorrect],
		[hCorrect + 2, mCorrect],
		[hCorrect - 2, mCorrect],
		[hCorrect, mCorrect + 5],
		[hCorrect, mCorrect - 5],
		[hCorrect, mCorrect + 10],
		[hCorrect, mCorrect - 10],
		[hCorrect, mCorrect + 15],
		[hCorrect, mCorrect - 15],
		[hCorrect + 1, mCorrect - 5],
	];
	const formes = candidats
		.filter(([h, m]) => h >= hMin && h <= 12 && m >= 0 && m <= 55 && !(h === 0 && m === 0))
		.map(([h, m]) => fmt(h, m))
		.filter((s) => s !== correct && s !== piege);
	const uniques = [...new Set(formes)];
	// Le piège prend une place, on complète avec des leurres plausibles distincts.
	return piege ? [piege, ...sample(uniques, 2)] : sample(uniques, 3);
}

/* ---------- Forme A — durée écoulée ---------- */
function enonceDuree(t: TirageDuree): string {
	return `De ${fmtInstant(t.h1, t.m1)} à ${fmtInstant(t.h2, t.m2)}, combien de temps s'est écoulé ?`;
}
function parleDuree(t: TirageDuree): string {
	return `De ${motInstant(t.h1, t.m1)} à ${motInstant(t.h2, t.m2)}, combien de temps s'est écoulé ?`;
}
function genDureeProbleme(t: TirageDuree): Exercise {
	return {
		type: 'probleme',
		enonce: enonceDuree(t),
		etapes: [
			{ question: "Combien d'heures ?", answer: t.dh },
			{ question: 'Combien de minutes de plus ?', answer: t.dm },
		],
		parle: parleDuree(t),
		explication: explicationDuree(t),
	};
}
function genDureeQcm(t: TirageDuree): Exercise {
	const correct = fmtDureeReponse(t.dh, t.dm);
	// Piège « oubli de retenue » : une heure de trop (l'enfant n'a pas décompté la retenue).
	const piege = t.avecRetenue ? fmtDureeReponse(t.dh + 1, t.dm) : undefined;
	const distract = distracteurs(t.dh, t.dm, fmtDureeReponse, 0, piege);
	return {
		type: 'qcm',
		question: enonceDuree(t),
		answer: correct,
		choices: sample([correct, ...distract], distract.length + 1),
		parle: parleDuree(t),
		explication: explicationDuree(t),
	};
}

/* ---------- Forme B — instant + durée → instant ---------- */
function enonceArrivee(t: TirageDuree): string {
	return `Il est ${fmtInstant(t.h1, t.m1)}. ${fmtDureeCourt(t.dh, t.dm)} plus tard, quelle heure sera-t-il ?`;
}
function parleArrivee(t: TirageDuree): string {
	// `cap` : la durée ouvre une nouvelle phrase après le point (« …vingt. Quarante-cinq… »).
	return `Il est ${motInstant(t.h1, t.m1)}. ${cap(motDuree(t.dh, t.dm))} plus tard, quelle heure sera-t-il ?`;
}
function genArriveeProbleme(t: TirageDuree): Exercise {
	return {
		type: 'probleme',
		enonce: enonceArrivee(t),
		// L'arrivée est un INSTANT (h2 h m2), chaque champ = UN nombre. Libellés « Les
		// heures d'arrivée ? » / « Les minutes d'arrivée ? » : « d'arrivée » lève l'ambiguïté
		// (l'énoncé cite départ + durée + arrivée) ; sans « de plus » (ce n'est pas une durée)
		// et sans « Quelle heure ? » (qui, comme dans heure.ts, appellerait « 9h30 » → NaN).
		etapes: [
			{ question: "Les heures d'arrivée ?", answer: t.h2 },
			{ question: "Les minutes d'arrivée ?", answer: t.m2 },
		],
		parle: parleArrivee(t),
		explication: explicationArrivee(t),
	};
}
function genArriveeQcm(t: TirageDuree): Exercise {
	const correct = fmtInstant(t.h2, t.m2);
	// Piège « oubli de retenue » : une heure en moins (la minute a débordé sans être reportée).
	const piege = t.avecRetenue ? fmtInstant(t.h2 - 1, t.m2) : undefined;
	// Instants : heures ≥ 1 (jamais « 0 h »).
	const distract = distracteurs(t.h2, t.m2, fmtInstant, 1, piege);
	return {
		type: 'qcm',
		question: enonceArrivee(t),
		answer: correct,
		choices: sample([correct, ...distract], distract.length + 1),
		parle: parleArrivee(t),
		explication: explicationArrivee(t),
	};
}

/* ---------- Générateurs (une forme tirée au hasard à chaque item) ---------- */
function genProbleme(): Exercise {
	const t = tireDuree();
	return rnd(0, 1) === 0 ? genDureeProbleme(t) : genArriveeProbleme(t);
}
function genQcm(): Exercise {
	const t = tireDuree();
	return rnd(0, 1) === 0 ? genDureeQcm(t) : genArriveeQcm(t);
}

export interface DureeEcouleeLessonDef extends LessonInput {
	excludeFromSprint?: boolean;
}

export const DUREE_ECOULEE_LESSONS: DureeEcouleeLessonDef[] = [
	{
		id: 'mes-duree-ecoulee',
		label: 'Je calcule une durée',
		exerciseType: deuxSousQuestionsType({
			levels: ['cm1'],
			labelSaisie: "J'écris les heures et les minutes",
			generateProbleme: genProbleme,
			generateQcm: genQcm,
		}),
		// Deux champs (heures + minutes) + lecture d'énoncé : hors chrono.
		excludeFromSprint: true,
		// Le déroulé suit EXACTEMENT le découpage des trois bonds (heure ronde, heures
		// entières, minutes restantes), donc l'ordre des deux champs de la leçon. La règle
		// dit d'emblée pourquoi on ne pose pas 5 h 55 - 3 h 50 : en base 60, la soustraction
		// posée demande une retenue à 60 que le CM1 n'a pas.
		etayage: [
			etayageRedige(
				'Calculer une durée',
				"On avance par bonds en passant par l'heure ronde : les heures ne se soustraient pas comme des nombres ordinaires.",
				[
					"Va d'abord jusqu'à l'heure ronde suivante : de 3 h 50 à 4 h, il y a 10 min.",
					'Compte les heures entières : de 4 h à 5 h, il y a 1 h.',
					'Ajoute les minutes qui restent : de 5 h à 5 h 55, il y a 55 min. En tout, 2 h 5 min.',
				],
			),
		],
	},
];
