/* ============================================================
   Auto-test du harnais `tests/gardes-affixes.ts` (#500).
   ------------------------------------------------------------
   Pourquoi ce fichier : les gardes de contenu des banques d'affixes sont VERTES sur
   les banques réelles (c'est le but). Un détecteur qui cesserait de détecter — regex
   d'explication devenue trop stricte, comparaison inversée, boucle vide — les
   laisserait vertes aussi, et quatre gardes deviendraient silencieusement des
   coquilles. On les éprouve donc sur des banques FABRIQUÉES, portant chacune la
   violation exacte qu'elles prétendent attraper, et un témoin propre qui doit passer.
   C'est la réponse à « qu'est-ce qui ferait rougir ce test vert ? » pour les gardes
   d'intégrité (#453 CE2, #500 CM1), sans toucher au contenu de `src/`.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import type { ItemAffixe } from '../src/data/francais/familles';
import {
	MARGE_LONGUEUR,
	anomaliesDuMotInterroge,
	fuitesDuMotInterroge,
	reperesDeLongueur,
	affixesAnnoncesIncoherents,
	explicationsSansLeMotInterroge,
	type BanqueAffixes,
} from './gardes-affixes';

const prefixes = (items: ItemAffixe[]): BanqueAffixes => ({
	nom: 'PREFIXES_TEST',
	items,
	role: 'préfixe',
});
const suffixes = (items: ItemAffixe[]): BanqueAffixes => ({
	nom: 'SUFFIXES_TEST',
	items,
	role: 'suffixe',
});

/* Témoins propres : un préfixé et un suffixé irréprochables sur les quatre gardes. */
const PREFIXE_SAIN: ItemAffixe = {
	mot: 'refaire',
	sens: 'faire à nouveau',
	distracteurs: ['faire une seule fois', 'faire à moitié'],
	explication: 'Le préfixe « re- » veut dire « à nouveau » : refaire = faire à nouveau.',
};
const SUFFIXE_SAIN: ItemAffixe = {
	mot: 'chanteur',
	sens: 'celui qui chante',
	distracteurs: ['celui qui écoute', 'celui qui danse'],
	explication: 'Le suffixe « -eur » désigne celui qui fait : un chanteur, celui qui chante.',
};
const SAINES = [prefixes([PREFIXE_SAIN]), suffixes([SUFFIXE_SAIN])];

/* Item de longueur calibrée : la mesure porte sur des caractères comptés, pas sur une
   formulation dont la longueur se discuterait. */
const long = (mot: string, sens: number, distracteurs: [number, number]): ItemAffixe => ({
	mot,
	sens: 'x'.repeat(sens),
	distracteurs: ['y'.repeat(distracteurs[0]), 'z'.repeat(distracteurs[1])],
	explication: `Le préfixe « re- » veut dire « à nouveau » : ${mot}.`,
});

describe('Harnais des gardes d’affixes — les détecteurs attrapent ce qu’ils annoncent (#500)', () => {
	it('aucune violation sur des banques saines (le harnais ne crie pas dans le vide)', () => {
		expect(anomaliesDuMotInterroge(SAINES)).toEqual([]);
		expect(fuitesDuMotInterroge(SAINES)).toEqual([]);
		expect(reperesDeLongueur(SAINES)).toEqual([]);
		expect(affixesAnnoncesIncoherents(SAINES)).toEqual([]);
		expect(explicationsSansLeMotInterroge(SAINES)).toEqual([]);
	});

	it('longueur : signale au-delà de la marge, pas à la marge, et jamais un distracteur plus long', () => {
		const banque = prefixes([
			long('surmarge', MARGE_LONGUEUR + 12, [10, 11]), // +11 : au-dessus
			long('pilesurlamarge', MARGE_LONGUEUR + 11, [10, 11]), // +10 : tolérée
			long('distracteurlong', 5, [30, 2]), // −25 : garde à sens unique
		]);
		const repères = reperesDeLongueur([banque]);
		expect(repères).toHaveLength(1);
		expect(repères[0]).toContain('surmarge');
		expect(repères[0]).toContain('+11 car.');
	});

	it('fuite : une option qui contient le mot interrogé est signalée (réponse ou leurre)', () => {
		const dansLaReponse: ItemAffixe = {
			...PREFIXE_SAIN,
			mot: 'gonflable',
			sens: "qu'on peut gonfler (comme une piscine gonflable)",
			distracteurs: ['qui est déjà plein', 'qui se dégonfle tout seul'],
			explication: 'Le préfixe « re- » veut dire « à nouveau » : gonflable.',
		};
		const dansUnLeurre: ItemAffixe = {
			...PREFIXE_SAIN,
			mot: 'relire',
			distracteurs: ['lire en relire deux fois', 'faire à moitié'],
			explication: 'Le préfixe « re- » veut dire « à nouveau » : relire.',
		};
		expect(fuitesDuMotInterroge([prefixes([dansLaReponse])])).toHaveLength(1);
		expect(fuitesDuMotInterroge([prefixes([dansUnLeurre])])).toHaveLength(1);
	});

	it('affixe annoncé : absence, mauvais type, et affixe que le mot ne porte pas', () => {
		const sansAffixe: ItemAffixe = { ...PREFIXE_SAIN, explication: 'refaire, c’est recommencer.' };
		const mauvaisType: ItemAffixe = {
			...PREFIXE_SAIN,
			explication: 'Le suffixe « -re » veut dire « à nouveau » : refaire.',
		};
		const nonPorte: ItemAffixe = {
			...PREFIXE_SAIN,
			explication: 'Le préfixe « anti- » veut dire « contre » : refaire.',
		};
		expect(affixesAnnoncesIncoherents([prefixes([sansAffixe])])[0]).toContain('aucun affixe');
		expect(affixesAnnoncesIncoherents([prefixes([mauvaisType])])[0]).toContain('annoncé comme');
		expect(affixesAnnoncesIncoherents([prefixes([nonPorte])])[0]).toContain('ne porte pas');
		// … et le suffixe se vérifie bien par la FIN du mot (pas par le début).
		const suffixeFaux: ItemAffixe = {
			...SUFFIXE_SAIN,
			explication: 'Le suffixe « -age » indique l’action : un chanteur.',
		};
		expect(affixesAnnoncesIncoherents([suffixes([suffixeFaux])])).toHaveLength(1);
	});

	it('affixe annoncé : la tolérance d’élision accepte « sou- » pour « sous- », et rien de plus', () => {
		// Règle chargée en production : « souterrain » / « souligner » (banque CE2) ne passent
		// que grâce à l'élision de la dernière lettre d'un préfixe d'au moins 4 lettres. Un
		// DURCISSEMENT se verrait sur le contenu réel ; un ASSOUPLISSEMENT, non — le contenu
		// resterait vert. On éprouve donc les deux bords de la tolérance.
		const elide: ItemAffixe = {
			mot: 'souligner',
			sens: 'tracer un trait sous un mot',
			distracteurs: ["tracer un trait au-dessus d'un mot", 'entourer un mot'],
			explication: 'Le préfixe « sous- » veut dire « en dessous » : souligner.',
		};
		expect(affixesAnnoncesIncoherents([prefixes([elide])])).toEqual([]);

		// Bord 1 — la tolérance ne descend PAS sous 4 lettres : « in- » ne doit pas avaler
		// tout mot commençant par « i » (rougit si le seuil `prefixe.length >= 4` baisse).
		const prefixeCourt: ItemAffixe = {
			mot: 'imaginer',
			sens: 'se représenter quelque chose',
			distracteurs: ['oublier quelque chose', 'montrer quelque chose'],
			explication: 'Le préfixe « in- » veut dire « le contraire » : imaginer.',
		};
		expect(affixesAnnoncesIncoherents([prefixes([prefixeCourt])])[0]).toContain('ne porte pas');

		// Bord 2 — elle ne retire qu'UNE lettre : « para- » ne doit pas être reconnu dans un
		// mot qui n'en partage que « pa » (rougit si `slice(0, -1)` s'élargit).
		const troisLettresSeulement: ItemAffixe = {
			mot: 'patiner',
			sens: 'glisser sur la glace',
			distracteurs: ['courir sur la neige', 'marcher sur la route'],
			explication: 'Le préfixe « para- » veut dire « protège de » : patiner.',
		};
		expect(affixesAnnoncesIncoherents([prefixes([troisLettresSeulement])])[0]).toContain(
			'ne porte pas',
		);
	});

	it('explication : une explication qui parle d’un autre mot est signalée', () => {
		const recopiee: ItemAffixe = {
			...PREFIXE_SAIN,
			explication: 'Le préfixe « re- » veut dire « à nouveau » : redire = dire à nouveau.',
		};
		expect(explicationsSansLeMotInterroge([prefixes([recopiee])])[0]).toContain('refaire');
	});

	it('mot interrogé : mot vide, doublon dans une banque, doublon entre banques, espace de bord', () => {
		// Mot vide : aucune question à poser, et la garde « l'explication cite le mot » devient
		// vraie pour n'importe quoi (toute chaîne contient la chaîne vide) — c'est la branche
		// qui empêche ce trou de s'ouvrir en silence.
		const vide = prefixes([{ ...PREFIXE_SAIN, mot: '' }]);
		expect(anomaliesDuMotInterroge([vide])).toHaveLength(1);
		expect(anomaliesDuMotInterroge([vide])[0]).toContain('mot vide');

		const doublonInterne = prefixes([PREFIXE_SAIN, { ...PREFIXE_SAIN }]);
		expect(anomaliesDuMotInterroge([doublonInterne])).toHaveLength(1);
		expect(anomaliesDuMotInterroge([doublonInterne])[0]).toContain('interrogé deux fois');

		const croise = [prefixes([PREFIXE_SAIN]), suffixes([{ ...SUFFIXE_SAIN, mot: 'refaire' }])];
		expect(anomaliesDuMotInterroge(croise)).toHaveLength(1);
		expect(anomaliesDuMotInterroge(croise)[0]).toContain('PREFIXES_TEST et SUFFIXES_TEST');

		const espace = prefixes([{ ...PREFIXE_SAIN, mot: 'refaire ' }]);
		expect(anomaliesDuMotInterroge([espace])[0]).toContain('espace de bord');
	});
});
