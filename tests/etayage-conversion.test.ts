/* ============================================================
   Étayage (#490) — résolution GÉNÉRÉE d'une conversion au tableau.
   ------------------------------------------------------------
   Auteur des tests distinct de l'auteur du code : les attendus sont dérivés de la NOTION
   (un tableau de conversion est un tableau de rangs, un cran = ×10, et le même tableau se
   lit dans l'unité qu'on veut), jamais recopiés de l'implémentation.

   Depuis #711, le tableau n'est plus taillé sur la question : sa tranche de colonnes est
   FIXE par couple (leçon, niveau), donc l'enfant voit toujours la même échelle — celle de
   son niveau — et le nombre donné y flotte, précédé ou suivi de colonnes à zéro qui ne lui
   appartiennent pas. Deux conséquences que ce fichier garde :
   - l'unité DONNÉE ne se déduit plus de la géométrie du tableau. Elle est portée par
     l'exercice ; la déduction d'avant (« la cible est une extrémité, donc l'autre extrémité
     est le départ ») se tromperait maintenant en silence, ce qui est pire que refuser ;
   - le déroulé doit remplir TOUT le tableau, pas seulement l'empan de la paire convertie.

   Ce qui est éprouvé, et pourquoi :
   - `lireDansUnite` sur des tableaux POSÉS À LA MAIN, avec leur lecture calculée à part :
     c'est la fonction qui porte toute la notion, et une lecture fausse ferait dire au
     panneau « 3 km = 30 m » sans que rien d'autre ne s'en aperçoive ;
   - la fidélité de `conversionDepuisTableau` : elle relaie l'unité de l'exercice sans
     l'inventer, y compris quand départ et cible sont à l'INTÉRIEUR du tableau — et l'unité
     attendue est lue dans l'ÉNONCÉ (« 3 km = @ m »), c'est-à-dire dans ce que l'enfant a
     sous les yeux, jamais dans la structure dont le code la tirerait ;
   - la FIXITÉ de la tranche de colonnes, par leçon et par niveau (#711) ;
   - la VÉRITÉ de ce qui est affirmé, sur un large échantillon des deux sens et des cas
     décimaux : la valeur de départ annoncée est bien celle de l'énoncé, la valeur finale
     est bien la réponse attendue de l'exercice, et l'égalité énoncée est arithmétiquement
     juste (un cran de colonne = un facteur 10) ;
   - la COHÉRENCE dit / écrit : chaque colonne du tableau est écrite EXACTEMENT une fois,
     l'ancrage ne pose que les chiffres du nombre donné (pas les zéros de tête), et toute
     colonne remplie plus tard est nommée ;
   - la DÉGRADATION : unité absente du tableau, unité confondue avec la cible, tableau vide
     → aucun déroulé plutôt qu'une démonstration qui désigne une colonne absente ;
   - les RACCOURCIS INTERDITS (« ajoute des zéros », « décale la virgule »), qui marchent
     sur les entiers et cassent au premier décimal.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	cibleColonne,
	conversionDepuisTableau,
	derouleConversion,
	lireDansUnite,
	type ColonneConversion,
	type ConversionSpec,
} from '../src/core/etayage-conversion';
import { PAS_MAX, derouleMontrable } from '../src/core/etayage-deroule';
import { etayagePour } from '../src/core/etayage';
import { getLessonById, type LessonDef } from '../src/core/catalog';
import type { SchoolLevel } from '../src/core/catalog';
import { ESPACE_FINE, parseNombreFr } from '../src/core/nombres';
import { withSeed } from '../src/core/utils';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
};

/* Colonne de test : le tableau est décrit à la main, sa lecture est calculée à part. */
const col = (unite: string, nom: string, chiffres: string): ColonneConversion => ({
	unite,
	nom,
	chiffres,
});

/* Les deux niveaux où vivent les leçons à tableau (le catalogue en connaît d'autres). */
type NiveauTableau = Extract<SchoolLevel, 'ce2' | 'cm1'>;
const LECONS_TABLEAU = ['mes-longueurs', 'mes-masses', 'mes-contenances'];
const NIVEAUX: NiveauTableau[] = ['ce2', 'cm1'];

/* La tranche de colonnes attendue par (leçon, niveau) — #711. Écrite d'après l'échelle
   métrique et le programme, pas relue du générateur : au CE2 on s'arrête au gramme et au
   centilitre (les rangs plus fins ne sont pas au programme), au CM1 la chaîne va jusqu'au
   milligramme et au millilitre. Les longueurs, elles, sont déjà complètes au CE2. */
const TRANCHE: Record<string, Record<NiveauTableau, string[]>> = {
	'mes-longueurs': {
		ce2: ['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm'],
		cm1: ['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm'],
	},
	'mes-masses': {
		ce2: ['kg', 'hg', 'dag', 'g'],
		cm1: ['kg', 'hg', 'dag', 'g', 'dg', 'cg', 'mg'],
	},
	'mes-contenances': {
		ce2: ['L', 'dL', 'cL'],
		cm1: ['hL', 'daL', 'L', 'dL', 'cL', 'mL'],
	},
};

/* ============================================================
   1. LIRE LE TABLEAU DANS UNE UNITÉ — la notion elle-même
   ============================================================ */
describe('lireDansUnite — un même tableau, une valeur par unité', () => {
	it('3 km = 3 000 m : la lecture change avec la colonne de lecture, pas le tableau', () => {
		// Tableau de « 3 km » : 3 | 0 | 0 | 0. Lu en km c'est 3 ; en hm, 30 (chaque km vaut
		// 10 hm) ; en dam, 300 ; en m, 3000. Valeurs calculées à la main, pas relues du code.
		const t = [
			col('km', 'kilomètre', '3'),
			col('hm', 'hectomètre', '0'),
			col('dam', 'décamètre', '0'),
			col('m', 'mètre', '0'),
		];
		expect(lireDansUnite(t, 0)).toBe('3');
		expect(lireDansUnite(t, 1)).toBe('30');
		expect(lireDansUnite(t, 2)).toBe('300');
		expect(lireDansUnite(t, 3)).toBe('3000');
	});

	it('la partie décimale est ce qui reste à DROITE de la colonne lue', () => {
		// 456 cm : 4 m, 5 dm, 6 cm. En mètres, 4,56 ; en décimètres, 45,6 ; en centimètres, 456.
		const t = [col('m', 'mètre', '4'), col('dm', 'décimètre', '5'), col('cm', 'centimètre', '6')];
		expect(lireDansUnite(t, 0)).toBe('4,56');
		expect(lireDansUnite(t, 1)).toBe('45,6');
		expect(lireDansUnite(t, 2)).toBe('456');
	});

	it('les zéros inutiles disparaissent des deux côtés, comme les écrit un enfant', () => {
		// 2 m 50 cm : « 2,50 » s'écrit 2,5 ; et 45 mm ne s'écrit pas « 045 ».
		const t = [col('m', 'mètre', '2'), col('dm', 'décimètre', '5'), col('cm', 'centimètre', '0')];
		expect(lireDansUnite(t, 0)).toBe('2,5');
		expect(lireDansUnite(t, 2)).toBe('250');
		const petit = [
			col('m', 'mètre', '0'),
			col('cm', 'centimètre', '4'),
			col('mm', 'millimètre', '5'),
		];
		expect(lireDansUnite(petit, 2)).toBe('45');
		// Et un zéro de tête SEUL reste un zéro : « 0,45 », pas « ,45 ».
		expect(lireDansUnite(petit, 0)).toBe('0,45');
	});

	it('un tableau tout à zéro se lit 0 dans n’importe quelle unité', () => {
		const t = [col('L', 'litre', '0'), col('dL', 'décilitre', '0')];
		expect(lireDansUnite(t, 0)).toBe('0');
		expect(lireDansUnite(t, 1)).toBe('0');
	});

	it('la colonne de tête porte ses deux chiffres, et les grands nombres sont groupés', () => {
		// 20 km = 20 000 m (plage CM1, maxBig 20). Le groupement est celui de toute l'appli
		// (espace fine insécable à partir de 5 chiffres), jamais une virgule.
		const t = [
			col('km', 'kilomètre', '20'),
			col('hm', 'hectomètre', '0'),
			col('dam', 'décamètre', '0'),
			col('m', 'mètre', '0'),
		];
		expect(lireDansUnite(t, 0)).toBe('20');
		expect(lireDansUnite(t, 3)).toBe(`20${ESPACE_FINE}000`);
	});

	it('deux colonnes voisines : un facteur 10, toujours (c’est ce que le tableau enseigne)', () => {
		const t = [
			col('km', 'kilomètre', '7'),
			col('hm', 'hectomètre', '4'),
			col('dam', 'décamètre', '0'),
			col('m', 'mètre', '9'),
		];
		for (let i = 0; i < t.length - 1; i++) {
			const gauche = parseNombreFr(lireDansUnite(t, i));
			const droite = parseNombreFr(lireDansUnite(t, i + 1));
			expect(droite, `colonnes ${i} → ${i + 1}`).toBeCloseTo(gauche * 10, 6);
		}
		expect(lireDansUnite(t, 3)).toBe('7409');
	});
});

/* ============================================================
   2. DÉROULÉ — les exemples déclarés par les leçons de mesures
   ============================================================ */
describe('derouleConversion — l’exemple de la leçon (mode tableau)', () => {
	const exemple = (id: string, niveau: NiveauTableau): ConversionSpec => {
		const contenu = etayagePour(lecon(id), niveau, 'tableau');
		if (contenu?.exemple?.moteur !== 'conversion')
			throw new Error(`pas d'exemple conversion : ${id}/${niveau}`);
		return contenu.exemple.spec;
	};

	it('le DÉROULÉ du tableau ne sort jamais du mode tableau (la saisie a son texte à elle)', () => {
		/* Plusieurs entrées par leçon, et c'est la plus spécifique qui gagne : en mode
       `tableau`, l'exemple déroulé (un par niveau depuis #711) ; partout ailleurs, le texte
       rédigé de la conversion. Ce qu'on verrouille ici, c'est qu'aucun des deux ne déborde
       sur l'autre — montrer la grille de colonnes à un enfant qui tape « 300 cm = ? m » lui
       expliquerait un écran qu'il n'a pas sous les yeux. */
		for (const id of LECONS_TABLEAU)
			for (const niveau of NIVEAUX) {
				const ou = `${id}/${niveau}`;
				expect(etayagePour(lecon(id), niveau, 'tableau')?.exemple, ou).toBeDefined();
				const saisie = etayagePour(lecon(id), niveau, 'saisie');
				expect(saisie, ou).toBeDefined();
				expect(saisie?.exemple, ou).toBeUndefined();
				expect(saisie?.etapes?.length, ou).toBeGreaterThan(0);
				// Sans mode (appel générique) : le texte rédigé aussi, jamais le déroulé.
				expect(etayagePour(lecon(id), niveau), ou).toBe(saisie);
			}
	});

	it('l’exemple montre le tableau du NIVEAU de l’enfant, pas celui du voisin', () => {
		/* #711 : la tranche est fixe par (leçon, niveau), donc l'exemple d'étayage doit
       montrer la MÊME grille que celle où l'enfant vient de se tromper. Un CM1 à qui l'on
       déroule le tableau du CE2 (kg → g) verrait une démonstration dans un tableau qui n'a
       pas les colonnes du sien, et inversement. */
		for (const id of LECONS_TABLEAU)
			for (const niveau of NIVEAUX) {
				const ou = `${id}/${niveau}`;
				const spec = exemple(id, niveau);
				const unites = spec.colonnes.map((c) => c.unite);
				expect(unites, ou).toEqual(TRANCHE[id][niveau]);
				// Les deux unités de la démonstration sont dans cette grille-là.
				expect(unites, ou).toContain(spec.depart);
				expect(unites, ou).toContain(spec.cible);
				expect(spec.depart, ou).not.toBe(spec.cible);
				// Et le déroulé reste montrable : une grille plus large ne doit pas faire déborder
				// le panneau (cf. PAS_MAX), sinon l'enfant n'a plus d'étayage du tout.
				const deroule = derouleConversion(spec);
				expect(derouleMontrable(deroule), `${ou} : ${deroule.pas.length} pas, max ${PAS_MAX}`).toBe(
					true,
				);
			}
	});

	it('les DURÉES font exception : un texte rédigé, valable dans tous les modes', () => {
		/* Base 60 : il n'y a pas de tableau de rangs à remplir (1 h ne vaut pas 10 min), donc
       rien à dérouler — l'entrée est rédigée et n'est PAS scopée au mode tableau, sans
       quoi cette leçon mono-mode n'aurait aucun panneau du tout. Ce qu'on verrouille
       surtout : elle ne doit jamais devenir un exemple de conversion, qui montrerait à
       l'enfant le tableau décimal des longueurs appliqué aux heures. */
		const durees = lecon('mes-durees');
		const contenu = etayagePour(durees, 'ce2');
		expect(contenu).toBeDefined();
		expect(contenu?.exemple).toBeUndefined();
		expect(contenu?.etapes?.length).toBeGreaterThan(0);
		// Le même contenu, quel que soit le mode : la leçon n'en déclare aucun (pas d'échelle
		// décimale → pas de mode tableau), mais un appel avec un mode ne doit pas l'écarter.
		expect(durees.exerciseType.modes).toBeUndefined();
		expect(etayagePour(durees, 'ce2', 'tableau')).toBe(contenu);
		expect(etayagePour(durees, 'cm1', 'saisie')).toBe(contenu);
		// Et il dit le nombre qui relie les deux unités : une méthode de durée qui ne nomme
		// jamais le 60 laisserait l'enfant appliquer le ×10 de ses trois voisines.
		expect([contenu?.regle, ...(contenu?.etapes ?? [])].join(' ')).toContain('60');
	});

	it('3 km = 3 000 m : l’ancrage, le chemin colonne par colonne, le reste en bloc, la lecture', () => {
		const spec = exemple('mes-longueurs', 'ce2');
		const deroule = derouleConversion(spec);
		expect(deroule.titre).toBe('3 km = ? m');
		// Le tableau va du km au mm (7 colonnes fixes, #711) : le 3 tient dans la colonne des
		// kilomètres (1 pas d'ancrage), le chemin jusqu'aux mètres traverse hm, dam, m (3 pas
		// nommés un par un), il reste dm, cm, mm (1 pas groupé), puis on relit (1 pas) → 6.
		expect(spec.colonnes.map((c) => c.unite)).toEqual(TRANCHE['mes-longueurs'].ce2);
		expect(deroule.pas.length).toBe(6);
		expect(deroule.pas[0].phrase).toContain('3 km');
		expect(deroule.pas[0].phrase).toContain('kilomètres');
		// L'ancrage ne pose QUE le chiffre donné : les six autres colonnes ne sont pas à lui.
		expect(deroule.pas[0].ecritures).toEqual([{ cible: cibleColonne(0), texte: '3' }]);
		// Le sens de lecture est dit UNE fois, au premier pas, et pas ailleurs.
		const sens = deroule.pas.filter((p) => /gauche/.test(p.phrase));
		expect(sens.length).toBe(1);
		expect(deroule.pas[0].phrase).toMatch(/gauche.*droite/);
		// Chaque colonne du chemin est NOMMÉE (« il n'y a rien à cette place-là »), jamais un
		// « j'écris 0 » sec, et remplie une à une jusqu'à celle qu'on demande.
		expect(deroule.pas[1].phrase).toContain('hectomètres');
		expect(deroule.pas[2].phrase).toContain('décamètres');
		expect(deroule.pas[3].phrase).toContain('mètres');
		for (const i of [1, 2, 3]) {
			expect(deroule.pas[i].phrase, `pas ${i}`).toContain('0');
			expect(deroule.pas[i].ecritures, `pas ${i}`).toEqual([
				{ cible: cibleColonne(i), texte: '0' },
			]);
		}
		// Les colonnes au-delà de la cible sont remplies aussi, groupées en un seul pas : elles
		// ne portent aucune notion, mais les laisser vides ferait deviner leur contenu.
		expect(deroule.pas[4].ecritures).toEqual(
			[4, 5, 6].map((i) => ({ cible: cibleColonne(i), texte: '0' })),
		);
		for (const nom of ['décimètres', 'centimètres', 'millimètres'])
			expect(deroule.pas[4].phrase, nom).toContain(nom);
		// Conclusion : la vraie égalité, dans les deux unités de la question.
		expect(deroule.pas[5].phrase).toContain('3000');
		expect(deroule.pas[5].phrase).toContain('3 km = 3000 m');
		// Et à la fin, AUCUNE case du tableau n'est restée vide, ni remplie deux fois.
		const ecrites = deroule.pas.flatMap((p) => (p.ecritures ?? []).map((e) => e.cible));
		expect(ecrites.slice().sort()).toEqual(spec.colonnes.map((_, i) => cibleColonne(i)).sort());
	});

	it('5 L = 500 cL : au CE2 le tableau s’arrête au centilitre, donc rien à grouper', () => {
		const spec = exemple('mes-contenances', 'ce2');
		const deroule = derouleConversion(spec);
		expect(deroule.titre).toBe('5 L = ? cL');
		// L | dL | cL : 1 ancrage + 2 colonnes de chemin + 1 lecture (aucune colonne restante).
		expect(spec.colonnes.map((c) => c.unite)).toEqual(['L', 'dL', 'cL']);
		expect(deroule.pas.length).toBe(4);
		expect(deroule.pas[1].phrase).toContain('décilitres');
		expect(deroule.pas[2].phrase).toContain('centilitres');
		expect(deroule.pas[3].phrase).toContain('5 L = 500 cL');
	});

	it('2 kg = 2 000 g : même méthode, autre grandeur', () => {
		const spec = exemple('mes-masses', 'ce2');
		const deroule = derouleConversion(spec);
		expect(deroule.titre).toBe('2 kg = ? g');
		// kg | hg | dag | g : 1 ancrage + 3 colonnes de chemin + 1 lecture.
		expect(spec.colonnes.map((c) => c.unite)).toEqual(['kg', 'hg', 'dag', 'g']);
		expect(deroule.pas.length).toBe(5);
		expect(deroule.pas[4].phrase).toContain('2 kg = 2000 g');
	});

	it('aucun raccourci « on ajoute des zéros » ni « on décale la virgule »', () => {
		// Ces deux formules marchent sur les entiers et cassent au premier décimal
		// (3,2 km = 3 200 m, pas 32 000) : elles arment une règle qui explosera au CM1.
		// Le motif vise le VERBE (décale, décaler, décalage) et non la racine : le tableau des
		// contenances au CM1 a une colonne de décalitres, qui n'est pas un raccourci.
		for (const id of LECONS_TABLEAU)
			for (const niveau of NIVEAUX) {
				const texte = derouleConversion(exemple(id, niveau))
					.pas.map((p) => p.phrase)
					.join(' ');
				const ou = `${id}/${niveau}`;
				expect(texte.toLowerCase(), ou).not.toMatch(/ajoute[a-z]*\s+(des|un|le)\s+z[ée]ro/);
				expect(texte.toLowerCase(), ou).not.toMatch(/d[ée]cal(e|er|age)/);
			}
	});
});

/* ============================================================
   3. LE NOMBRE DONNÉ FLOTTE DANS LE TABLEAU (#711)
   ------------------------------------------------------------
   La tranche fixe met des colonnes à zéro des deux côtés du nombre donné. Ces zéros ne sont
   pas ses chiffres : les traiter comme tels ferait dire au pas d'ancrage « son dernier
   chiffre va dans la colonne des centimètres, les autres vers la gauche » en désignant cinq
   cases que l'enfant n'a jamais écrites.
   ============================================================ */
describe('derouleConversion — un petit nombre dans un grand tableau', () => {
	const PREFIXES = ['kilo', 'hecto', 'déca', '', 'déci', 'centi', 'milli'];
	const longueurs = (chiffres: string[]): ColonneConversion[] =>
		['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm'].map((u, i) =>
			col(u, `${PREFIXES[i]}mètre`, chiffres[i]),
		);

	it('« 3 cm = ? mm » : l’ancrage ne pose que le 3, pas les cinq zéros qui le précèdent', () => {
		const colonnes = longueurs(['0', '0', '0', '0', '0', '3', '0']);
		const deroule = derouleConversion({ colonnes, depart: 'cm', cible: 'mm' });
		expect(deroule.titre).toBe('3 cm = ? mm');
		expect(deroule.pas[0].phrase).toContain('3 cm');
		expect(deroule.pas[0].phrase).toContain('centimètres');
		expect(deroule.pas[0].ecritures).toEqual([{ cible: cibleColonne(5), texte: '3' }]);
		// 1 ancrage + 1 colonne de chemin (mm) + 1 pas groupé (les cinq de gauche) + 1 lecture.
		expect(deroule.pas.length).toBe(4);
		expect(deroule.pas[1].ecritures).toEqual([{ cible: cibleColonne(6), texte: '0' }]);
		expect(deroule.pas[1].phrase).toContain('millimètres');
		expect(deroule.pas[2].ecritures?.map((e) => e.cible)).toEqual(
			[0, 1, 2, 3, 4].map(cibleColonne),
		);
		expect(deroule.pas[3].phrase).toContain('3 cm = 30 mm');
		// Aucune case laissée à deviner : les sept colonnes sont écrites, chacune une fois.
		const ecrites = deroule.pas.flatMap((p) => (p.ecritures ?? []).map((e) => e.cible));
		expect(ecrites.slice().sort()).toEqual(colonnes.map((_, i) => cibleColonne(i)).sort());
	});

	it('« 250 cm = ? m » : la colonne demandée porte un vrai chiffre, on n’y écrit pas 0', () => {
		/* Ici la cible est DANS le nombre donné (2 m 5 dm 0 cm). Dire « rien à compter dans la
       colonne des mètres » y serait un contresens énoncé au moment même où l'on écrit un 2,
       et la lecture doit poser la virgule juste après cette colonne — jamais la « décaler ». */
		const colonnes = longueurs(['0', '0', '0', '2', '5', '0', '0']);
		const deroule = derouleConversion({ colonnes, depart: 'cm', cible: 'm' });
		expect(deroule.titre).toBe('250 cm = ? m');
		// L'ancrage couvre les trois colonnes du nombre donné (m, dm, cm), pas les zéros de tête.
		expect(deroule.pas[0].ecritures).toEqual([
			{ cible: cibleColonne(3), texte: '2' },
			{ cible: cibleColonne(4), texte: '5' },
			{ cible: cibleColonne(5), texte: '0' },
		]);
		// 1 ancrage + 0 colonne de chemin (la cible est déjà posée) + 1 pas groupé + 1 lecture.
		expect(deroule.pas.length).toBe(3);
		expect(deroule.pas[1].ecritures?.map((e) => e.cible)).toEqual([0, 1, 2, 6].map(cibleColonne));
		expect(deroule.pas[2].phrase).toContain('250 cm = 2,5 m');
		expect(deroule.pas[2].phrase).toContain('virgule');
		expect(deroule.pas.map((p) => p.phrase).join(' ')).not.toMatch(/d[ée]cal(e|er|age)/);
	});
});

/* ============================================================
   4. DÉGRADATION ET FIDÉLITÉ — mieux vaut pas de panneau qu’une colonne désignée à tort
   ============================================================ */
describe('derouleConversion / conversionDepuisTableau — refus propre', () => {
	const TABLE = [
		col('km', 'kilomètre', '3'),
		col('hm', 'hectomètre', '0'),
		col('dam', 'décamètre', '0'),
		col('m', 'mètre', '0'),
	];
	const brut = TABLE.map((c) => ({ ...c, transit: false }));
	const specDe = (
		colonnes: { unite: string; nom: string; transit: boolean; chiffres: string }[],
		uniteConnue: string,
		answerUnit: string,
	): ConversionSpec => {
		const spec = conversionDepuisTableau({ colonnes, answerUnit, uniteConnue });
		if (!spec) throw new Error(`aucune spécification : ${uniteConnue} → ${answerUnit}`);
		return spec;
	};

	it('une unité absente du tableau : déroulé vide, donc pas de panneau', () => {
		expect(derouleConversion({ colonnes: TABLE, depart: 'cm', cible: 'm' }).pas).toEqual([]);
		expect(derouleConversion({ colonnes: TABLE, depart: 'km', cible: 'mm' }).pas).toEqual([]);
		expect(derouleMontrable(derouleConversion({ colonnes: TABLE, depart: 'cm', cible: 'm' }))).toBe(
			false,
		);
		// Et en amont : une unité sans colonne ne donne aucune spécification, des deux côtés.
		expect(
			conversionDepuisTableau({ colonnes: brut, answerUnit: 'm', uniteConnue: 'cm' }),
		).toBeUndefined();
		expect(
			conversionDepuisTableau({ colonnes: brut, answerUnit: 'mm', uniteConnue: 'km' }),
		).toBeUndefined();
	});

	it('un tableau sans colonne ne se décrit pas', () => {
		expect(derouleConversion({ colonnes: [], depart: 'km', cible: 'm' }).pas).toEqual([]);
		expect(
			conversionDepuisTableau({ colonnes: [], answerUnit: 'm', uniteConnue: 'km' }),
		).toBeUndefined();
	});

	it('départ et cible confondus : il n’y a rien à convertir, donc rien à montrer', () => {
		expect(
			conversionDepuisTableau({ colonnes: brut, answerUnit: 'km', uniteConnue: 'km' }),
		).toBeUndefined();
		// Tableau d'une seule colonne : le cas ne peut être que celui-là.
		expect(
			conversionDepuisTableau({ colonnes: [brut[0]], answerUnit: 'km', uniteConnue: 'km' }),
		).toBeUndefined();
	});

	it('l’unité donnée est celle de l’exercice, même quand elle n’est pas au bord du tableau', () => {
		/* #711 : le tableau n'est plus taillé sur la paire convertie, donc la position d'une
       colonne ne dit plus rien de la question. Une conversion entre deux colonnes
       INTÉRIEURES (30 hm = ? dam) est désormais un cas ordinaire, et le déroulé doit parler
       d'elle — pas des extrémités du tableau, qui poseraient « 3 km = ? m » à un enfant qui
       lisait « 30 hm = ? dam ». */
		expect(specDe(brut, 'hm', 'dam').depart).toBe('hm');
		expect(specDe(brut, 'hm', 'dam').cible).toBe('dam');
		expect(derouleConversion(specDe(brut, 'hm', 'dam')).titre).toBe('30 hm = ? dam');
		// Cible intérieure, départ au bord — et l'inverse.
		expect(derouleConversion(specDe(brut, 'km', 'dam')).titre).toBe('3 km = ? dam');
		expect(derouleConversion(specDe(brut, 'hm', 'm')).titre).toBe('30 hm = ? m');
		// Les deux sens, entre les deux extrémités : l'unité donnée n'est jamais inversée.
		expect(specDe(brut, 'km', 'm').depart).toBe('km');
		expect(specDe(brut, 'm', 'km').depart).toBe('m');
		expect(derouleConversion(specDe(brut, 'm', 'km')).titre).toBe('3000 m = ? km');
	});

	it('les colonnes de transit sont reportées telles quelles (la grille de l’exercice)', () => {
		// Le tableau montré à l'enfant démote les rangs hors programme : le déroulé doit
		// travailler sur la MÊME grille, sinon il démontre dans un tableau qui n'est pas le sien.
		const colonnes = TABLE.map((c, i) => ({ ...c, transit: i === 1 || i === 2 }));
		expect(specDe(colonnes, 'km', 'm').colonnes.map((c) => !!c.transit)).toEqual([
			false,
			true,
			true,
			false,
		]);
		expect(specDe(colonnes, 'km', 'm').colonnes.map((c) => c.chiffres)).toEqual([
			'3',
			'0',
			'0',
			'0',
		]);
	});
});

/* ============================================================
   5. ÉCHANTILLON — de VRAIS tableaux tirés par le catalogue
   ------------------------------------------------------------
   On éprouve le module sur les tirages réels du générateur, dans les deux sens, aux deux
   niveaux et sur les cas décimaux. L'unité et la valeur ATTENDUES sont lues dans l'ÉNONCÉ
   (ce que l'enfant voit), et la réponse dans `answer` (ce que l'exercice corrige) — deux
   sources indépendantes du module testé.
   ============================================================ */
interface Tire {
	ou: string;
	lecon: string;
	niveau: NiveauTableau;
	question: string;
	answer: string;
	answerUnit: string;
	uniteConnue: string;
	colonnes: { unite: string; nom: string; transit: boolean; chiffres: string }[];
}

function tableaux(parCombinaison: number): Tire[] {
	const out: Tire[] = [];
	for (const id of LECONS_TABLEAU) {
		const l = lecon(id);
		for (const niveau of NIVEAUX) {
			for (let seed = 1; seed <= parCombinaison; seed++) {
				const ex = withSeed(seed, () =>
					l.exerciseType.generate({ mode: 'tableau', level: niveau }),
				);
				if (ex.type !== 'tableauConversion')
					throw new Error(`${id}/${niveau} : type ${ex.type} au lieu d'un tableau`);
				out.push({
					ou: `${id}/${niveau}/${ex.question}`,
					lecon: id,
					niveau,
					question: ex.question,
					answer: ex.answer,
					answerUnit: ex.answerUnit,
					uniteConnue: ex.uniteConnue,
					colonnes: ex.colonnes,
				});
			}
		}
	}
	return out;
}

/* Ce que dit l'ÉNONCÉ : « 3 km = @ m » ou « @ m = 3 km ». La valeur et l'unité connues
   sont du côté SANS le champ ; l'unité cherchée est collée au champ. */
function enonce(question: string): { valeur: string; unite: string; cible: string } {
	const cotes = question.split('=').map((s) => s.trim());
	const trou = cotes.find((c) => c.includes('@'));
	const connu = cotes.find((c) => !c.includes('@'));
	if (!trou || !connu) throw new Error(`énoncé illisible : ${question}`);
	const coupe = connu.lastIndexOf(' ');
	return {
		valeur: connu.slice(0, coupe),
		unite: connu.slice(coupe + 1),
		cible: trou.replace('@', '').trim(),
	};
}

describe('INVARIANTS sur un large échantillon des vrais tableaux', () => {
	const tires = tableaux(200);
	/* Aucun tirage ne doit rester sans spécification : sinon les invariants ci-dessous
     porteraient sur une liste vide et passeraient en ne gardant rien. */
	const specObligatoire = (t: Tire): ConversionSpec => {
		const spec = conversionDepuisTableau(t);
		if (!spec) throw new Error(`aucune spécification : ${t.ou}`);
		return spec;
	};

	it('la tranche de colonnes est FIXE par (leçon, niveau), quelle que soit la question', () => {
		// #711 : le tableau ne se rétrécit plus autour de la paire convertie. Deux enfants de la
		// même classe voient la même grille, et l'enfant qui enchaîne deux questions aussi.
		expect(tires.length).toBe(LECONS_TABLEAU.length * NIVEAUX.length * 200);
		for (const id of LECONS_TABLEAU)
			for (const niveau of NIVEAUX) {
				const grilles = new Set(
					tires
						.filter((t) => t.lecon === id && t.niveau === niveau)
						.map((t) => t.colonnes.map((c) => c.unite).join(' ')),
				);
				expect([...grilles], `${id}/${niveau}`).toEqual([TRANCHE[id][niveau].join(' ')]);
			}
	});

	it('l’échantillon couvre les deux sens, le transit au CE2 et les décimaux au CM1', () => {
		const vus = tires.map((t) => ({ t, spec: specObligatoire(t) }));
		const iDe = (s: ConversionSpec) => s.colonnes.findIndex((c) => c.unite === s.depart);
		const iVers = (s: ConversionSpec) => s.colonnes.findIndex((c) => c.unite === s.cible);
		expect(vus.some(({ spec }) => iDe(spec) < iVers(spec))).toBe(true); // grande → petite
		expect(vus.some(({ spec }) => iDe(spec) > iVers(spec))).toBe(true); // petite → grande
		const ce2 = vus.filter(({ t }) => t.niveau === 'ce2');
		const cm1 = vus.filter(({ t }) => t.niveau === 'cm1');
		// Les décimaux sont une notion de CM1 : c'est là qu'on exige d'en rencontrer, des deux
		// côtés du signe = (une donnée décimale à replacer, une réponse décimale à lire).
		expect(cm1.some(({ t }) => t.answer.includes(','))).toBe(true);
		expect(cm1.some(({ t }) => enonce(t.question).valeur.includes(','))).toBe(true);
		// Le transit — un rang traversé mais hors programme, montré en pointillés — n'a de sens
		// qu'au CE2. Au CM1 toute la chaîne des rangs est au programme : une colonne démotée y
		// dirait à l'enfant qu'un rang qu'il étudie ne compte pas.
		expect(ce2.some(({ t }) => t.colonnes.some((c) => c.transit))).toBe(true);
		expect(cm1.filter(({ t }) => t.colonnes.some((c) => c.transit)).map(({ t }) => t.ou)).toEqual(
			[],
		);
		// Les deux empans : une paire voisine (un seul cran) et un ×1000 (trois crans).
		const crans = ({ spec }: { spec: ConversionSpec }) => Math.abs(iVers(spec) - iDe(spec));
		expect(vus.some((x) => crans(x) === 1)).toBe(true);
		expect(vus.some((x) => crans(x) === 3)).toBe(true);
	});

	it('l’unité de départ est celle de l’ÉNONCÉ, et jamais celle qu’on cherche', () => {
		/* Le module ne déduit plus l'unité donnée de la géométrie du tableau (#711) : il relaie
       celle que l'exercice porte. Ce qui reste à garder, et que la déduction cassait en
       silence dès que le tableau a débordé la paire : l'unité relayée est bien celle que
       l'enfant LIT dans l'énoncé, et jamais celle qu'on lui demande de trouver. */
		const ratés: string[] = [];
		for (const t of tires) {
			const spec = conversionDepuisTableau(t);
			const dit = enonce(t.question);
			if (!spec) {
				ratés.push(`${t.ou} — aucune spécification`);
				continue;
			}
			if (spec.depart !== dit.unite) ratés.push(`${t.ou} — départ ${spec.depart} ≠ ${dit.unite}`);
			if (spec.cible !== dit.cible) ratés.push(`${t.ou} — cible ${spec.cible} ≠ ${dit.cible}`);
			if (spec.cible !== t.answerUnit) ratés.push(`${t.ou} — cible ≠ unité de la réponse`);
			if (spec.depart === spec.cible) ratés.push(`${t.ou} — départ et cible confondus`);
		}
		expect(ratés.slice(0, 3)).toEqual([]);
	});

	it('tout ce que le déroulé affirme est VRAI (valeur donnée, réponse, égalité finale)', () => {
		const fautes: string[] = [];
		for (const t of tires) {
			const spec = specObligatoire(t);
			const dit = enonce(t.question);
			const deroule = derouleConversion(spec);
			const faute = (raison: string) => fautes.push(`${t.ou} — ${raison}`);
			if (!derouleMontrable(deroule)) {
				faute(`déroulé non montrable (${deroule.pas.length} pas, max ${PAS_MAX})`);
				continue;
			}
			const iDepart = spec.colonnes.findIndex((c) => c.unite === spec.depart);
			const iCible = spec.colonnes.findIndex((c) => c.unite === spec.cible);
			const valeurDepart = lireDansUnite(spec.colonnes, iDepart);
			const valeurCible = lireDansUnite(spec.colonnes, iCible);
			// 1. Le nombre DONNÉ par l'énoncé est bien celui que le tableau porte.
			if (parseNombreFr(valeurDepart) !== parseNombreFr(dit.valeur))
				faute(`valeur de départ lue ${valeurDepart} ≠ énoncé ${dit.valeur}`);
			// 2. La valeur finale annoncée est la RÉPONSE attendue de l'exercice.
			if (parseNombreFr(valeurCible) !== parseNombreFr(t.answer))
				faute(`valeur finale ${valeurCible} ≠ réponse ${t.answer}`);
			// 3. L'égalité énoncée est arithmétiquement juste : un cran de colonne = ×10.
			const attendu = parseNombreFr(valeurDepart) * 10 ** (iCible - iDepart);
			if (Math.abs(attendu - parseNombreFr(valeurCible)) > 1e-9)
				faute(`${valeurDepart} ${spec.depart} ≠ ${valeurCible} ${spec.cible}`);
			// 4. La conclusion l'ÉCRIT, avec ses deux unités, et le titre pose la question.
			const conclusion = deroule.pas[deroule.pas.length - 1].phrase;
			const egalite = `${valeurDepart} ${spec.depart} = ${valeurCible} ${spec.cible}`;
			if (!conclusion.includes(egalite)) faute(`conclusion sans l'égalité « ${egalite} »`);
			if (deroule.titre !== `${valeurDepart} ${spec.depart} = ? ${spec.cible}`)
				faute(`titre inattendu : ${deroule.titre}`);
			// 5. L'ancrage annonce le nombre DONNÉ avec son unité, et ne parle de la virgule que
			//    si ce nombre en a une : « le chiffre juste avant la virgule » sur un entier
			//    enverrait l'enfant chercher une virgule qui n'existe pas.
			const ancrage = deroule.pas[0].phrase;
			if (!ancrage.includes(`${valeurDepart} ${spec.depart}`))
				faute(`ancrage sans le nombre donné : « ${ancrage} »`);
			if (valeurDepart.includes(',') !== /virgule/.test(ancrage))
				faute(`ancrage et virgule discordants : « ${ancrage} »`);
			// 6. Aucun raccourci mécanique, dans aucun pas.
			const texte = deroule.pas
				.map((p) => p.phrase)
				.join(' ')
				.toLowerCase();
			if (/ajoute[a-z]*\s+(des|un|le)\s+z[ée]ro/.test(texte)) faute('« ajoute des zéros »');
			if (/d[ée]cal(e|er|age)/.test(texte)) faute('« décale la virgule »');
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('ce qui est ÉCRIT suit ce qui est DIT : chaque colonne une fois, les rangs vides nommés', () => {
		const fautes: string[] = [];
		for (const t of tires) {
			const spec = specObligatoire(t);
			const deroule = derouleConversion(spec);
			const faute = (raison: string) => fautes.push(`${t.ou} — ${raison}`);
			// Plancher : poser le nombre donné, puis le relire ailleurs. Quand ce nombre occupe
			// déjà toute la grille (2000 g = ? kg), il ne reste aucune colonne vide à narrer —
			// deux pas suffisent, et la notion est portée par la lecture.
			if (deroule.pas.length < 2) {
				faute(`déroulé réduit à ${deroule.pas.length} pas`);
				continue;
			}
			const rang = (cible: string) => spec.colonnes.findIndex((_, i) => cibleColonne(i) === cible);
			const iCible = spec.colonnes.findIndex((c) => c.unite === spec.cible);
			const iDepart = spec.colonnes.findIndex((c) => c.unite === spec.depart);
			const ecrites: string[] = [];
			deroule.pas.forEach((p, k) => {
				for (const e of p.ecritures ?? []) {
					ecrites.push(e.cible);
					const index = rang(e.cible);
					if (index < 0) faute(`pas ${k} : case « ${e.cible} » hors du tableau`);
					else if (e.texte !== spec.colonnes[index].chiffres)
						faute(`pas ${k} : écrit « ${e.texte} » dans ${spec.colonnes[index].unite}`);
				}
				// Ce qu'on surligne est ce dont on parle : jamais une case hors du tableau.
				for (const a of p.actifs ?? [])
					if (!spec.colonnes.some((_, i) => cibleColonne(i) === a))
						faute(`pas ${k} : surligne « ${a} », hors du tableau`);
			});
			// 1. À la fin du déroulé, CHAQUE colonne du tableau a été écrite, et une seule fois.
			//    Depuis la tranche fixe (#711), le tableau déborde la paire convertie : une case
			//    laissée vide serait un rang que l'enfant devrait deviner tout seul.
			if (new Set(ecrites).size !== ecrites.length) faute('une case remplie deux fois');
			for (const cible of spec.colonnes.map((_, i) => cibleColonne(i)))
				if (!ecrites.includes(cible)) faute(`colonne « ${cible} » jamais remplie`);
			// 2. L'ancrage pose les chiffres du nombre DONNÉ, sur des colonnes contiguës, et ses
			//    deux bouts sont des chiffres à lui : soit un chiffre non nul, soit sa colonne
			//    d'unité. Sinon il annonce comme « ses chiffres » des zéros de remplissage.
			const rangs = (deroule.pas[0].ecritures ?? []).map((e) => rang(e.cible));
			const sien = (i: number) => i === iDepart || Number(spec.colonnes[i].chiffres) !== 0;
			if (!rangs.length) faute("l'ancrage ne pose aucun chiffre");
			else if (!sien(rangs[0]) || !sien(rangs[rangs.length - 1]))
				faute(`ancrage débordant sur des zéros : colonnes ${rangs.join(',')}`);
			if (rangs.some((r, k) => k > 0 && r !== rangs[k - 1] + 1))
				faute(`ancrage sur des colonnes non contiguës : ${rangs.join(',')}`);
			// 3. Les pas suivants (hors lecture finale) ne remplissent que des 0 — dire « il n'y a
			//    rien à compter » d'une colonne qui porte un chiffre serait un contresens énoncé au
			//    moment même où on l'écrit — et NOMMENT chaque colonne remplie (le 0 tient un rang,
			//    il ne « rallonge » pas le nombre).
			const milieu = deroule.pas.slice(1, -1);
			milieu.forEach((p, k) => {
				const ecritures = p.ecritures ?? [];
				if (!ecritures.length) faute(`pas ${k + 1} : ne remplit rien`);
				for (const e of ecritures) {
					if (e.texte !== '0') faute(`pas ${k + 1} : remplit un ${e.texte} hors de l'ancrage`);
					const index = rang(e.cible);
					if (index >= 0 && !p.phrase.includes(`${spec.colonnes[index].nom}s`))
						faute(`pas ${k + 1} : colonne non nommée — « ${p.phrase} »`);
				}
			});
			// 4. Le chemin se fait colonne par colonne ; seules les colonnes RESTANTES, qui ne
			//    portent aucune notion, sont groupées — en un seul pas, et à la fin.
			const groupes = milieu
				.map((p, k) => ({ k, n: (p.ecritures ?? []).length }))
				.filter((x) => x.n > 1);
			if (groupes.length > 1) faute(`${groupes.length} pas groupés au lieu d'un seul`);
			if (groupes.length === 1 && groupes[0].k !== milieu.length - 1)
				faute(`pas groupé avant la fin du chemin (pas ${groupes[0].k + 1})`);
			// 5. La colonne DEMANDÉE n'est jamais noyée dans ce groupe : ou bien le nombre donné
			//    l'occupe déjà (elle est dans l'ancrage), ou bien elle a son pas à elle.
			const pasCible = deroule.pas.findIndex((p) =>
				(p.ecritures ?? []).some((e) => e.cible === cibleColonne(iCible)),
			);
			if (pasCible > 0 && (deroule.pas[pasCible].ecritures ?? []).length !== 1)
				faute(`la colonne demandée (${spec.cible}) est remplie en groupe`);
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});
});
