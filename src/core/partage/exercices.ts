/* ============================================================
   Séance partagée (#734) — schéma de chaque format d'EXERCICE dans un lien.

   La table est typée `{ [K in Exercise['type']]: … }` : ajouter un format à
   l'union `Exercise` sans y déclarer son schéma casse `npm run typecheck`
   (critère 35). `tests/partage-gate.test.ts` refait la vérification à
   l'exécution, sur le source de l'union, pour que `npm test` la signale aussi.
   Et `objet` exige un schéma pour CHAQUE champ d'un format : un champ ajouté à un
   format existant casse aussi le typecheck, au lieu de disparaître du lien.

   Les invariants entre champs (`verifier`) sont ceux que les runners SUPPOSENT :
   un index de mot qui tombe dans la phrase, une réponse qui figure parmi les
   choix. Faux, ils lèveraient une erreur chez l'enfant au lieu d'un refus propre
   du lien (critère 29).
   ============================================================ */
import type { CalculEtape, ChoiceView, Exercise, ProblemeEtape, TableauColonne } from '../exercise';
import {
	booleen,
	chaine,
	entier,
	facultatif,
	liste,
	nombre,
	objet,
	parmi,
	refuser,
	tuple,
	union,
	type Schema,
} from './schema';
import { fragment } from './fragments';
import { MOTIF_MOT } from './textes';

export type SchemasExercice = { [K in Exercise['type']]: Schema<Extract<Exercise, { type: K }>> };

type Ex<K extends Exercise['type']> = Extract<Exercise, { type: K }>;

/* ---------- Pièces communes ---------- */

/** Texte libre d'un énoncé : borné, sans contrôle (cf. `chaine`). L'échappement à
 *  l'affichage fait le reste — un `<` est une réponse valable en numération. */
const texte = (max: number) => chaine({ max });
const nonVide = (max: number) => chaine({ min: 1, max });

const question = texte(600);
const reponse = texte(200);
const parle = texte(1000);
const explication = texte(1000);
const consigne = texte(300);

const valeur = nombre(-1e12, 1e12);
const intervalle = tuple<[number, number]>(valeur, valeur);

const vueChoix = objet<ChoiceView>({ html: fragment, label: nonVide(200) });

/** Mot de l'atelier d'orthographe (formats `motCache`, `tuiles`, `dictee`). */
const motOrtho = chaine({ min: 1, max: 40, motif: MOTIF_MOT });

const calculEtape = objet<CalculEtape>({
	op: parmi('+', '-', 'x', ':'),
	a: valeur,
	b: valeur,
	uniteA: facultatif(parmi('euro')),
	uniteB: facultatif(parmi('euro')),
	deA: facultatif(entier(0, 3)),
	deB: facultatif(entier(0, 3)),
});

const etape = objet<ProblemeEtape>({
	question: nonVide(300),
	answer: valeur,
	calcul: facultatif(calculEtape),
	unite: facultatif(parmi('euro')),
});

const colonne = objet<TableauColonne>({
	unite: nonVide(8),
	nom: nonVide(40),
	transit: booleen,
	chiffres: chaine({ max: 4, motif: /^[0-9]*$/ }),
});

/* ---------- Invariants ---------- */

const contient = (liste: readonly string[], v: string) => liste.includes(v);

function intervalleOuvert(i: [number, number] | undefined, chemin: string): void {
	if (i && !(i[0] < i[1])) refuser(chemin, 'intervalle vide ou inversé');
}

const memesElements = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

/** Les tuiles d'un mot contiennent-elles chacune de ses lettres, autant de fois qu'il le
 *  faut ? Inclusion et non égalité : des lettres en trop (distracteurs) restent un
 *  exercice faisable ; une lettre manquante, non. Découpage NFC, comme `lettresDuMot`. */
function contientLesLettres(tuiles: readonly string[], mot: string): boolean {
	const reste = [...tuiles];
	for (const lettre of Array.from(mot.normalize('NFC'))) {
		const i = reste.indexOf(lettre);
		if (i < 0) return false;
		reste.splice(i, 1);
	}
	return true;
}

/* ---------- La table ---------- */

export const SCHEMAS_EXERCICE: SchemasExercice = {
	text: objet<Ex<'text'>>(
		{
			type: parmi('text'),
			question,
			answer: reponse,
			// La lecture de l'heure accepte une cinquantaine d'écritures (« 5 h 00 », « 17:00 »…).
			answers: facultatif(liste(reponse, { max: 200 })),
			figure: facultatif(fragment),
			champHeure: facultatif(booleen),
			champRomain: facultatif(booleen),
			parle: facultatif(parle),
			intervalle: facultatif(intervalle),
		},
		(e, chemin) => intervalleOuvert(e.intervalle, chemin),
	),
	qcm: objet<Ex<'qcm'>>(
		{
			type: parmi('qcm'),
			question,
			answer: reponse,
			choices: liste(reponse, { min: 1, max: 12 }),
			choicesView: facultatif(liste(vueChoix, { max: 12 })),
			choicesEmpilees: facultatif(booleen),
			figure: facultatif(fragment),
			explication: facultatif(explication),
			parle: facultatif(parle),
			consigne: facultatif(consigne),
			picto: facultatif(texte(10)),
			ttsItems: facultatif(booleen),
			variante: facultatif(parmi('ponctuation')),
		},
		(e, chemin) => {
			if (!contient(e.choices, e.answer)) refuser(chemin, 'réponse absente des choix');
			if (e.choicesView && e.choicesView.length !== e.choices.length)
				refuser(chemin, 'vues et choix désalignés');
		},
	),
	qcmMulti: objet<Ex<'qcmMulti'>>(
		{
			type: parmi('qcmMulti'),
			question,
			propositions: liste(nonVide(300), { min: 2, max: 8 }),
			correctes: liste(nonVide(300), { min: 1, max: 8 }),
			figure: facultatif(fragment),
			parle: facultatif(parle),
		},
		(e, chemin) => {
			if (!e.correctes.every((c) => contient(e.propositions, c)))
				refuser(chemin, 'bonne réponse hors des propositions');
		},
	),
	tuilesNombre: objet<Ex<'tuilesNombre'>>(
		{
			type: parmi('tuilesNombre'),
			question,
			answer: nonVide(60),
			tuiles: liste(nonVide(60), { min: 1, max: 12 }),
			parle: facultatif(parle),
			intervalle: facultatif(intervalle),
		},
		(e, chemin) => {
			if (!contient(e.tuiles, e.answer)) refuser(chemin, 'réponse absente des tuiles');
			intervalleOuvert(e.intervalle, chemin);
		},
	),
	tuilesOrdre: objet<Ex<'tuilesOrdre'>>(
		{
			type: parmi('tuilesOrdre'),
			question,
			tuiles: liste(nonVide(60), { min: 2, max: 20 }),
			ordre: liste(nonVide(60), { min: 2, max: 20 }),
			nature: facultatif(parmi('mots', 'nombres')),
			parle: facultatif(parle),
		},
		(e, chemin) => {
			if (!memesElements(e.tuiles, e.ordre)) refuser(chemin, 'ordre attendu ≠ tuiles montrées');
		},
	),
	tuilesTri: objet<Ex<'tuilesTri'>>({
		type: parmi('tuilesTri'),
		question,
		categories: tuple<[string, string]>(nonVide(60), nonVide(60)),
		mots: liste(objet({ mot: nonVide(60), cat: parmi(0, 1) }), { min: 1, max: 30 }),
		parle: facultatif(parle),
	}),
	appariement: objet<Ex<'appariement'>>({
		type: parmi('appariement'),
		question,
		paires: liste(objet({ gauche: nonVide(60), droite: nonVide(60) }), { min: 1, max: 12 }),
		intrus: facultatif(liste(nonVide(60), { max: 12 })),
		// Ce que porte la colonne de droite (#731) : des mots, ou des étiquettes de classe.
		// N'accorde que la formulation de l'aide, jamais la correction — un lien partagé qui
		// l'omettrait reste jouable, l'enfant lirait seulement la notice de l'autre geste.
		colonneDroite: facultatif(parmi('mots', 'etiquettes')),
		parle: facultatif(parle),
	}),
	clicMot: objet<Ex<'clicMot'>>(
		{
			type: parmi('clicMot'),
			tokens: liste(nonVide(60), { min: 1, max: 80 }),
			cibleIndices: liste(entier(0, 79), { min: 1, max: 20 }),
			consigne,
			explication,
			parle,
			cibleLabel: facultatif(texte(100)),
			explicationNommeCible: facultatif(booleen),
			segment: facultatif(booleen),
		},
		(e, chemin) => {
			if (e.cibleIndices.some((i) => i >= e.tokens.length))
				refuser(chemin, 'cible hors de la phrase');
			if (new Set(e.cibleIndices).size !== e.cibleIndices.length)
				refuser(chemin, 'cible en double');
		},
	),
	droiteGraduee: objet<Ex<'droiteGraduee'>>(
		{
			type: parmi('droiteGraduee'),
			min: valeur,
			max: valeur,
			pas: nombre(1e-6, 1e12),
			graduations: liste(objet({ valeur, label: nonVide(40) }), { min: 2, max: 401 }),
			bornes: liste(objet({ valeur, label: nonVide(40) }), { max: 60 }),
			cible: valeur,
			cibleLabel: nonVide(40),
			consigne,
			explication,
			parle,
			pasLabel: nonVide(40),
		},
		(e, chemin) => {
			if (!(e.max > e.min) || (e.max - e.min) / e.pas > 400) refuser(chemin, 'axe invalide');
			if (!e.graduations.some((g) => g.valeur === e.cible))
				refuser(chemin, 'cible hors graduations');
		},
	),
	posed: objet<Ex<'posed'>>(
		{
			type: parmi('posed'),
			op: parmi('+', '-', 'x'),
			a: entier(0, 10_000_000),
			b: entier(0, 10_000_000),
		},
		(e, chemin) => {
			if (e.op === '-' && e.a < e.b) refuser(chemin, 'soustraction négative');
			if (e.op === 'x' && e.b >= 100) refuser(chemin, 'multiplicateur à plus de deux chiffres');
		},
	),
	tableauConversion: objet<Ex<'tableauConversion'>>(
		{
			type: parmi('tableauConversion'),
			question,
			answer: nonVide(40),
			answerUnit: nonVide(8),
			uniteConnue: nonVide(8),
			colonnes: liste(colonne, { min: 1, max: 12 }),
			virguleApres: facultatif(entier(0, 11)),
			virguleLibre: facultatif(booleen),
			parle: facultatif(parle),
		},
		(e, chemin) => {
			if (e.virguleApres !== undefined && e.virguleApres >= e.colonnes.length)
				refuser(chemin, 'virgule hors du tableau');
		},
	),
	probleme: objet<Ex<'probleme'>>(
		{
			type: parmi('probleme'),
			enonce: nonVide(1500),
			etapes: liste(etape, { min: 1, max: 4 }),
			parle,
			figure: facultatif(fragment),
			explication: facultatif(explication),
		},
		(e, chemin) => {
			// Un opérande « issu d'une étape » ne peut venir que d'une étape PRÉCÉDENTE.
			e.etapes.forEach((et, i) => {
				const { deA, deB } = et.calcul ?? {};
				if ((deA !== undefined && deA >= i) || (deB !== undefined && deB >= i))
					refuser(chemin, 'chaînage vers une étape suivante');
			});
		},
	),
	motCache: objet<Ex<'motCache'>>({ type: parmi('motCache'), answer: motOrtho }),
	tuiles: objet<Ex<'tuiles'>>(
		{
			type: parmi('tuiles'),
			answer: motOrtho,
			lettres: liste(chaine({ min: 1, max: 4 }), { min: 1, max: 40 }),
		},
		(e, chemin) => {
			if (!contientLesLettres(e.lettres, e.answer))
				refuser(chemin, 'mot impossible à reconstituer');
		},
	),
	dictee: objet<Ex<'dictee'>>({
		type: parmi('dictee'),
		answer: motOrtho,
		commeDans: facultatif(texte(200)),
	}),
};

export const schemaExercice: Schema<Exercise> = union<'type', Exercise>('type', SCHEMAS_EXERCICE);
