/* ============================================================
   Orthographe — la règle du « m » devant m, b, p (#111).
   ------------------------------------------------------------
   Exercice « m ou n ? » : un mot à trou (`@` = la lettre manquante),
   QCM à 2 options (m / n). Règle : devant m, b, p on écrit « m » —
   sauf quelques exceptions (bonbon, bonbonne, néanmoins).

   Banque combinée (critère #111) :
   - mots RÉGULIERS curatés (réponse m, devant m/b/p) ;
   - mots de la banque #106 (ORTHO_PREDEF) contenant mm/mb/mp, le « m »
     de la règle remplacé par `@` — en EXCLUANT les mots à majuscule
     (noms propres : orthographe non pertinente ici) ;
   - CONTRE-EXEMPLES en « n » (lettre suivante ≠ m/b/p) pour éviter la
     sur-généralisation ;
   - EXCEPTIONS (réponse n malgré b/m) SUR-PONDÉRÉES dans le tirage, pour
     qu'elles sortent régulièrement (un tirage uniforme les verrait à peine).

   Le feedback (runner QCM, champ `explication`) rappelle la règle, le
   contre-cas ou l'exception selon le type du mot.
   ============================================================ */
import type { Exercise, ExerciseType, ModeOption } from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import { sample } from '../../core/utils';
import { ORTHO_PREDEF } from './orthographe';

export type TypeMbp = 'regle' | 'contre' | 'exception';

export interface MotMbp {
	mot: string; // mot avec `@` à la place de la lettre m/n à trouver
	reponse: 'm' | 'n';
	type: TypeMbp;
}

/* Mots réguliers (réponse « m », devant m/b/p) — `@` posé à la main. */
const REGULIERS: MotMbp[] = [
	{ mot: 'e@mener', reponse: 'm', type: 'regle' },
	{ mot: 'i@mense', reponse: 'm', type: 'regle' },
	{ mot: 'to@ber', reponse: 'm', type: 'regle' },
	{ mot: 'o@bre', reponse: 'm', type: 'regle' },
	{ mot: 'cha@bre', reponse: 'm', type: 'regle' },
	{ mot: 'no@bre', reponse: 'm', type: 'regle' },
	{ mot: 'ja@be', reponse: 'm', type: 'regle' },
	{ mot: 'ense@ble', reponse: 'm', type: 'regle' },
	{ mot: 'septe@bre', reponse: 'm', type: 'regle' },
	{ mot: 'i@portant', reponse: 'm', type: 'regle' },
	{ mot: 'la@pe', reponse: 'm', type: 'regle' },
	{ mot: 'po@pier', reponse: 'm', type: 'regle' },
	{ mot: 'ti@bre', reponse: 'm', type: 'regle' },
	{ mot: 'si@ple', reponse: 'm', type: 'regle' },
	{ mot: 'e@porter', reponse: 'm', type: 'regle' },
	{ mot: 'e@baller', reponse: 'm', type: 'regle' },
	{ mot: 'gri@per', reponse: 'm', type: 'regle' },
	{ mot: 'co@pter', reponse: 'm', type: 'regle' },
	{ mot: 'cha@pignon', reponse: 'm', type: 'regle' },
	{ mot: 'ta@bour', reponse: 'm', type: 'regle' },
	{ mot: 'déce@bre', reponse: 'm', type: 'regle' },
	{ mot: 'nove@bre', reponse: 'm', type: 'regle' },
	{ mot: 'me@bre', reponse: 'm', type: 'regle' },
	{ mot: 'tre@bler', reponse: 'm', type: 'regle' },
	{ mot: 'ca@per', reponse: 'm', type: 'regle' },
	{ mot: 'po@pe', reponse: 'm', type: 'regle' },
	{ mot: 'bo@be', reponse: 'm', type: 'regle' },
	{ mot: 'co@ble', reponse: 'm', type: 'regle' },
	// Ajouts CE2 courants (avis pédagogue : mots plus concrets).
	{ mot: 'ja@bon', reponse: 'm', type: 'regle' },
	{ mot: 'co@pote', reponse: 'm', type: 'regle' },
	{ mot: 'tro@pette', reponse: 'm', type: 'regle' },
	{ mot: 'fra@boise', reponse: 'm', type: 'regle' },
];

/* Contre-exemples (réponse « n » : la lettre suivante n'est pas m/b/p). */
const CONTRE: MotMbp[] = [
	{ mot: 'e@fant', reponse: 'n', type: 'contre' },
	{ mot: 'mo@ter', reponse: 'n', type: 'contre' },
	{ mot: 'da@ser', reponse: 'n', type: 'contre' },
	{ mot: 'pa@talon', reponse: 'n', type: 'contre' },
	{ mot: 'co@tent', reponse: 'n', type: 'contre' },
	{ mot: 'cha@ter', reponse: 'n', type: 'contre' },
	{ mot: 'ma@teau', reponse: 'n', type: 'contre' },
	{ mot: 'de@t', reponse: 'n', type: 'contre' },
	{ mot: 've@t', reponse: 'n', type: 'contre' },
	{ mot: 'po@t', reponse: 'n', type: 'contre' },
	{ mot: 'o@cle', reponse: 'n', type: 'contre' },
	{ mot: 'e@cre', reponse: 'n', type: 'contre' },
	{ mot: 'ra@ger', reponse: 'n', type: 'contre' },
	{ mot: 'ora@ge', reponse: 'n', type: 'contre' },
	{ mot: 'bra@che', reponse: 'n', type: 'contre' },
	{ mot: 'dima@che', reponse: 'n', type: 'contre' },
	{ mot: 'mo@de', reponse: 'n', type: 'contre' },
	{ mot: 'via@de', reponse: 'n', type: 'contre' },
	{ mot: 'gra@de', reponse: 'n', type: 'contre' },
	{ mot: 'pri@temps', reponse: 'n', type: 'contre' },
	{ mot: 'si@ge', reponse: 'n', type: 'contre' },
	{ mot: 'lo@gue', reponse: 'n', type: 'contre' },
	{ mot: 'pi@ceau', reponse: 'n', type: 'contre' },
	{ mot: 'lu@di', reponse: 'n', type: 'contre' },
	{ mot: 'to@dre', reponse: 'n', type: 'contre' },
	{ mot: 'la@gue', reponse: 'n', type: 'contre' },
	{ mot: 'cha@ce', reponse: 'n', type: 'contre' },
	{ mot: 'dra@gon', reponse: 'n', type: 'contre' },
	{ mot: 'pri@ce', reponse: 'n', type: 'contre' },
];

/* Exceptions (réponse « n » malgré b/m) — sur-pondérées (cf. POIDS). */
const EXCEPTIONS: MotMbp[] = [
	{ mot: 'bo@bon', reponse: 'n', type: 'exception' },
	{ mot: 'bo@bonne', reponse: 'n', type: 'exception' },
	{ mot: 'néa@moins', reponse: 'n', type: 'exception' },
];

/* Forme complète d'un item (le `@` rempli par la bonne réponse). */
export const motComplet = (item: MotMbp): string => item.mot.replace('@', item.reponse);

/* Mots de la banque #106 (ORTHO_PREDEF) contenant mm/mb/mp → items « règle ».
   On EXCLUT les mots à majuscule (noms propres, orthographe hors sujet ici) et
   on dédoublonne contre les mots curatés. Le `m` de la règle (devant m/b/p)
   devient `@`. */
function motsDe106(dejaVus: Set<string>): MotMbp[] {
	const out: MotMbp[] = [];
	const vus = new Set(dejaVus);
	for (const lecon of ORTHO_PREDEF) {
		for (const { mot } of lecon.mots) {
			if (!/m[mbp]/.test(mot)) continue; // contient le motif de la règle
			if (/\p{Lu}/u.test(mot)) continue; // exclut les majuscules (noms propres)
			// Garde-fou niveau CE2 (avis pédagogue) : on écarte les adverbes en
			// -mment (brillamment…) et les mots trop longs, non calibrés pour la règle.
			if (/mment$/.test(mot) || mot.length > 11) continue;
			if (vus.has(mot)) continue; // déjà couvert
			vus.add(mot);
			out.push({ mot: mot.replace(/m([mbp])/, '@$1'), reponse: 'm', type: 'regle' });
		}
	}
	return out;
}

/* Banque combinée. Les items #106 viennent après les curatés (dédoublonnés). */
export const MBP_BANK: MotMbp[] = (() => {
	const curated = [...REGULIERS, ...CONTRE, ...EXCEPTIONS];
	const vus = new Set(curated.map(motComplet));
	return [...curated, ...motsDe106(vus)];
})();

/* Poids de tirage par type : les exceptions sont rares dans la langue mais on
   les sur-pondère pour qu'elles reviennent régulièrement (sans dominer). */
const POIDS: Record<TypeMbp, number> = { regle: 1, contre: 1, exception: 3 };
export const poidsDe = (item: MotMbp): number => POIDS[item.type];

/* Tirage pondéré PUR : `r` ∈ [0, 1) (injectable pour les tests). */
export function tiragePondere(bank: MotMbp[], r: number): MotMbp {
	const total = bank.reduce((s, it) => s + poidsDe(it), 0);
	let x = r * total;
	for (const it of bank) {
		x -= poidsDe(it);
		if (x < 0) return it;
	}
	return bank[bank.length - 1];
}

/* Feedback selon le type du mot. */
export function explicationMbp(item: MotMbp): string {
	if (item.type === 'regle') return 'Devant m, b ou p, on écrit « m ».';
	if (item.type === 'exception')
		return "C'est une exception : on écrit « n » (bonbon, bonbonne, néanmoins).";
	return "La lettre d'après n'est pas m, b ni p : on écrit « n ».";
}

const MODE_QCM: ModeOption[] = [
	{ id: 'qcm', label: 'Je choisis la bonne lettre', icon: 'check-circle', recommended: true },
];

export function mbpType(): ExerciseType {
	return {
		modes: MODE_QCM,
		generate(): Exercise {
			const item = tiragePondere(MBP_BANK, Math.random());
			return {
				type: 'qcm',
				question: item.mot,
				answer: item.reponse,
				choices: sample(['m', 'n'], 2),
				explication: explicationMbp(item),
				// Texte lu (#42) : on ne lit PAS le mot — l'entendre prononcé donnerait
				// la nasale (donc la lettre). On lit la consigne ; le mot reste à l'écran.
				parle: 'Choisis la bonne lettre pour compléter le mot.',
			};
		},
		check: (exercise, input) => checkAnswer(exercise, input),
	};
}

export interface MbpLessonDef {
	id: string;
	label: string;
	rubrique: string;
	exerciseType: ExerciseType;
}

export const MBP_LESSONS: MbpLessonDef[] = [
	{
		id: 'fr-mbp',
		label: 'm devant m, b, p',
		rubrique: 'Les règles',
		exerciseType: mbpType(),
	},
];
