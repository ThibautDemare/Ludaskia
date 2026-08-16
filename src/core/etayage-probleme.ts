/* ============================================================
   Résolution GÉNÉRÉE d'un problème à étapes (#490) — logique pure.
   ------------------------------------------------------------
   Ce moteur a failli ne pas exister. `ProblemeEtape` ne portait que l'intitulé d'une
   sous-question et sa réponse : un déroulé n'y aurait su que réciter les réponses, ce
   que la révélation (#467) montre déjà. Le modèle a donc été étendu d'un `calcul`
   (opération + opérandes, dans les valeurs affichées de l'énoncé), renseigné par les
   générateurs qui le connaissent — et ABSENT partout où le calcul ne s'exprime pas
   ainsi (division avec reste, durée décomposée en heures et minutes). Sans un seul
   calcul, ce module rend un déroulé vide : mieux vaut pas de panneau qu'une récitation.

   Ce qu'il raconte, et ce qu'il ne prétend PAS raconter. Le vrai obstacle d'un problème
   n'est pas l'opération, c'est de savoir LAQUELLE choisir — et ça, l'énoncé ne le porte
   nulle part sous forme exploitable (il faudrait sa structure sémantique : état,
   transformation, comparaison). Le déroulé ne fabrique donc aucune justification : il
   montre où va chaque sous-question et quel calcul y répond. La seule chose qu'il sait
   VRAIMENT expliquer, il la dit — le CHAÎNAGE : quand le calcul d'une sous-question
   reprend le résultat de la précédente, il le nomme. C'est précisément ce qui se perd
   dans un problème à deux étapes, et c'est déductible des données.
   ============================================================ */
import type { DerouleEtayage, PasEtayage } from './etayage-deroule';
import type { CalculEtape, ProblemeEtape } from './exercise';
import { attenduEtapeTexte } from './probleme-etapes';

/** Le problème à dérouler : son énoncé et ses sous-questions (celles de l'exercice). */
export interface ProblemeSpec {
	enonce: string;
	etapes: ProblemeEtape[];
}

/** Clé de la case-réponse de la sous-question `i`. */
export function cibleEtape(i: number): string {
	return `q${i}`;
}

/* Signe affiché d'une opération : celui de l'école (« × », « − », « ÷ »), pas l'opérateur
   interne. Le TTS les convertit en mots (cf. core/tts-text.ts). */
const SIGNES: Record<CalculEtape['op'], string> = { '+': '+', '-': '−', x: '×', ':': '÷' };

const RANGS_QUESTION = ['Première question', 'Deuxième question', 'Troisième question'];

/* Le calcul en toutes lettres, avec son résultat — le résultat VENANT de l'étape, jamais
   recalculé : les valeurs décimales de l'appli sont construites en entier puis divisées au
   dernier moment (cf. data/maths/problemes.ts), et refaire le calcul ici rouvrirait la
   porte aux artefacts de virgule flottante que le générateur s'échine à éviter. */
function calculTexte(calcul: CalculEtape, answer: number): string {
	const a = attenduEtapeTexte(calcul.a);
	const b = attenduEtapeTexte(calcul.b);
	return `${a} ${SIGNES[calcul.op]} ${b} = ${attenduEtapeTexte(answer)}`;
}

/** L'opérande `valeur` est-il le résultat d'une sous-question PRÉCÉDENTE ? C'est le
    chaînage d'un problème à étapes : le seul raisonnement que ces données permettent
    d'expliquer honnêtement. Renvoie l'index de cette sous-question, ou -1. */
export function etapeSource(etapes: ProblemeEtape[], i: number, valeur: number): number {
	for (let k = 0; k < i; k++) {
		if (etapes[k].answer === valeur) return k;
	}
	return -1;
}

/** Déroulé d'un problème : on relit l'énoncé, puis on traite les sous-questions dans
    l'ordre. Vide (donc pas de panneau) si AUCUNE sous-question ne porte son calcul —
    dérouler reviendrait alors à donner les réponses sans rien expliquer. */
export function derouleProbleme(spec: ProblemeSpec): DerouleEtayage {
	const { etapes } = spec;
	if (!etapes.length || !etapes.some((e) => e.calcul)) return { titre: '', pas: [] };
	const pas: PasEtayage[] = [
		{
			// Relire AVANT de calculer : c'est le geste que saute l'enfant qui attrape les deux
			// nombres de l'énoncé et les additionne au hasard.
			phrase: `Je relis l'énoncé, puis je regarde ce qu'on me demande, question par question.`,
			actifs: ['enonce'],
		},
	];
	etapes.forEach((etape, i) => {
		const entete = etapes.length > 1 ? `${RANGS_QUESTION[i] ?? `Question ${i + 1}`} : ` : '';
		const intitule = `${entete}« ${etape.question} »`;
		if (!etape.calcul) {
			// Sous-question dont le calcul ne s'écrit pas en une opération : on ne l'invente pas.
			pas.push({
				phrase: `${intitule} Ici, la réponse est ${attenduEtapeTexte(etape.answer)}.`,
				ecritures: [{ cible: cibleEtape(i), texte: attenduEtapeTexte(etape.answer) }],
				actifs: [cibleEtape(i)],
			});
			return;
		}
		// Chaînage : un opérande qui vient d'une sous-question précédente se dit, sans quoi
		// l'enfant voit un nombre tomber du ciel là où il devait réutiliser son résultat.
		const source = [etape.calcul.a, etape.calcul.b]
			.map((v) => etapeSource(etapes, i, v))
			.find((k) => k >= 0);
		const reprise =
			source !== undefined && source >= 0
				? ` Le ${attenduEtapeTexte(etapes[source].answer)} vient de la question d'avant : je m'en sers ici.`
				: '';
		pas.push({
			phrase: `${intitule} Je calcule ${calculTexte(etape.calcul, etape.answer)}.${reprise}`,
			ecritures: [{ cible: cibleEtape(i), texte: attenduEtapeTexte(etape.answer) }],
			actifs: [cibleEtape(i)],
		});
	});
	return { titre: 'Résoudre le problème', pas };
}
