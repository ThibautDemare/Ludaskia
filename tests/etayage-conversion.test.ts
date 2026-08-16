/* ============================================================
   Étayage (#490) — résolution GÉNÉRÉE d'une conversion au tableau.
   ------------------------------------------------------------
   Auteur des tests distinct de l'auteur du code : les attendus sont dérivés de la NOTION
   (un tableau de conversion est un tableau de rangs, un cran = ×10, et le même tableau se
   lit dans l'unité qu'on veut), jamais recopiés de l'implémentation.

   Ce qui est éprouvé, et pourquoi :
   - `lireDansUnite` sur des tableaux POSÉS À LA MAIN, avec leur lecture calculée à part :
     c'est la fonction qui porte toute la notion, et une lecture fausse ferait dire au
     panneau « 3 km = 30 m » sans que rien d'autre ne s'en aperçoive ;
   - la DÉDUCTION de l'unité de départ (`conversionDepuisTableau`) : elle repose sur un
     invariant du générateur, donc elle se teste contre de VRAIS tableaux tirés par le
     catalogue — et l'unité attendue est lue dans l'ÉNONCÉ (« 3 km = @ m »), c'est-à-dire
     dans ce que l'enfant a sous les yeux, jamais dans la structure dont le code la déduit ;
   - la VÉRITÉ de ce qui est affirmé, sur un large échantillon des deux sens et des cas
     décimaux : la valeur de départ annoncée est bien celle de l'énoncé, la valeur finale
     est bien la réponse attendue de l'exercice, et l'égalité énoncée est arithmétiquement
     juste (un cran de colonne = un facteur 10) ;
   - la COHÉRENCE dit / écrit : chaque colonne annoncée vide porte bien un 0, chaque
     écriture porte le chiffre de sa colonne, et le tableau se remplit de gauche à droite
     sans trou ni doublon ;
   - la DÉGRADATION : unité absente du tableau, unité cible au milieu de l'empan, tableau
     vide → aucun déroulé plutôt qu'une démonstration qui désigne une colonne absente ;
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
   2. DÉROULÉ — les trois exemples déclarés par les leçons de mesures
   ============================================================ */
describe('derouleConversion — l’exemple de la leçon (mode tableau)', () => {
	const exemple = (id: string): ConversionSpec => {
		const contenu = etayagePour(lecon(id), 'ce2', 'tableau');
		if (contenu?.exemple?.moteur !== 'conversion')
			throw new Error(`pas d'exemple conversion : ${id}`);
		return contenu.exemple.spec;
	};

	it('le DÉROULÉ du tableau ne sort jamais du mode tableau (la saisie a son texte à elle)', () => {
		/* Deux entrées par leçon, et c'est la plus spécifique qui gagne : en mode `tableau`,
		   l'exemple déroulé ; partout ailleurs, le texte rédigé de la conversion. Ce qu'on
		   verrouille ici, c'est qu'aucun des deux ne déborde sur l'autre — montrer la grille
		   de colonnes à un enfant qui tape « 300 cm = ? m » lui expliquerait un écran qu'il
		   n'a pas sous les yeux. */
		for (const id of ['mes-longueurs', 'mes-masses', 'mes-contenances']) {
			expect(etayagePour(lecon(id), 'ce2', 'tableau')?.exemple, id).toBeDefined();
			const saisie = etayagePour(lecon(id), 'ce2', 'saisie');
			expect(saisie, id).toBeDefined();
			expect(saisie?.exemple, id).toBeUndefined();
			expect(saisie?.etapes?.length, id).toBeGreaterThan(0);
			// Sans mode (appel générique) : le texte rédigé aussi, jamais le déroulé.
			expect(etayagePour(lecon(id), 'ce2'), id).toBe(saisie);
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

	it('3 km = 3 000 m : un pas d’ancrage, une colonne vide à la fois, puis la lecture', () => {
		const deroule = derouleConversion(exemple('mes-longueurs'));
		expect(deroule.titre).toBe('3 km = ? m');
		// 1 ancrage + 3 colonnes à remplir (hm, dam, m) + 1 lecture.
		expect(deroule.pas.length).toBe(5);
		expect(deroule.pas[0].phrase).toContain('3 km');
		expect(deroule.pas[0].phrase).toContain('kilomètres');
		// Le sens de lecture est dit UNE fois, au premier pas, et pas ailleurs.
		const sens = deroule.pas.filter((p) => /gauche/.test(p.phrase));
		expect(sens.length).toBe(1);
		expect(deroule.pas[0].phrase).toMatch(/gauche.*droite/);
		// Chaque colonne vide est NOMMÉE (« il n'y a rien à cette place-là »), jamais un
		// « j'écris 0 » sec.
		expect(deroule.pas[1].phrase).toContain('hectomètres');
		expect(deroule.pas[2].phrase).toContain('décamètres');
		expect(deroule.pas[3].phrase).toContain('mètres');
		for (const i of [1, 2, 3]) {
			expect(deroule.pas[i].phrase, `pas ${i}`).toContain('0');
			expect(deroule.pas[i].ecritures, `pas ${i}`).toEqual([
				{ cible: cibleColonne(i), texte: '0' },
			]);
		}
		// Conclusion : la vraie égalité, dans les deux unités de la question.
		expect(deroule.pas[4].phrase).toContain('3000');
		expect(deroule.pas[4].phrase).toContain('3 km = 3000 m');
	});

	it('5 L = 500 cL : deux colonnes vides seulement (l’empan est plus court)', () => {
		const deroule = derouleConversion(exemple('mes-contenances'));
		expect(deroule.titre).toBe('5 L = ? cL');
		expect(deroule.pas.length).toBe(4);
		expect(deroule.pas[1].phrase).toContain('décilitres');
		expect(deroule.pas[2].phrase).toContain('centilitres');
		expect(deroule.pas[3].phrase).toContain('5 L = 500 cL');
	});

	it('2 kg = 2 000 g : même méthode, autre grandeur', () => {
		const deroule = derouleConversion(exemple('mes-masses'));
		expect(deroule.titre).toBe('2 kg = ? g');
		expect(deroule.pas.length).toBe(5);
		expect(deroule.pas[4].phrase).toContain('2 kg = 2000 g');
	});

	it('aucun raccourci « on ajoute des zéros » ni « on décale la virgule »', () => {
		// Ces deux formules marchent sur les entiers et cassent au premier décimal
		// (3,2 km = 3 200 m, pas 32 000) : elles arment une règle qui explosera au CM1.
		for (const id of ['mes-longueurs', 'mes-masses', 'mes-contenances']) {
			const texte = derouleConversion(exemple(id))
				.pas.map((p) => p.phrase)
				.join(' ');
			expect(texte.toLowerCase(), id).not.toMatch(/ajoute[a-z]*\s+(des|un|le)\s+z[ée]ro/);
			expect(texte.toLowerCase(), id).not.toMatch(/d[ée]cal/);
		}
	});
});

/* ============================================================
   3. DÉGRADATION — mieux vaut pas de panneau qu’une colonne désignée à tort
   ============================================================ */
describe('derouleConversion / conversionDepuisTableau — refus propre', () => {
	const TABLE = [
		col('km', 'kilomètre', '3'),
		col('hm', 'hectomètre', '0'),
		col('dam', 'décamètre', '0'),
		col('m', 'mètre', '0'),
	];

	it('une unité absente du tableau : déroulé vide, donc pas de panneau', () => {
		expect(derouleConversion({ colonnes: TABLE, depart: 'cm', cible: 'm' }).pas).toEqual([]);
		expect(derouleConversion({ colonnes: TABLE, depart: 'km', cible: 'mm' }).pas).toEqual([]);
		expect(derouleMontrable(derouleConversion({ colonnes: TABLE, depart: 'cm', cible: 'm' }))).toBe(
			false,
		);
	});

	it('un tableau sans colonne ne se décrit pas', () => {
		expect(derouleConversion({ colonnes: [], depart: 'km', cible: 'm' }).pas).toEqual([]);
		expect(conversionDepuisTableau({ colonnes: [], answerUnit: 'm' })).toBeUndefined();
	});

	it('l’unité cherchée doit être une EXTRÉMITÉ de l’empan, sinon on ne déduit rien', () => {
		// Le générateur pose toujours le tableau entre les deux unités de la paire. Si ce
		// n'est pas le cas (unité cherchée au milieu), on ne peut pas savoir laquelle est
		// donnée : désigner la mauvaise colonne serait pire que ne rien montrer.
		const colonnes = TABLE.map((c) => ({ ...c, transit: false }));
		expect(conversionDepuisTableau({ colonnes, answerUnit: 'dam' })).toBeUndefined();
		expect(conversionDepuisTableau({ colonnes, answerUnit: 'hm' })).toBeUndefined();
		expect(conversionDepuisTableau({ colonnes, answerUnit: 'cL' })).toBeUndefined();
		// Une seule colonne : les deux extrémités se confondent, il n'y a pas de conversion.
		expect(
			conversionDepuisTableau({ colonnes: [{ ...colonnes[0] }], answerUnit: 'km' }),
		).toBeUndefined();
	});

	it('les deux extrémités sont bien reconnues, dans les deux sens', () => {
		const colonnes = TABLE.map((c, i) => ({ ...c, transit: i === 1 || i === 2 }));
		expect(conversionDepuisTableau({ colonnes, answerUnit: 'm' })?.depart).toBe('km');
		expect(conversionDepuisTableau({ colonnes, answerUnit: 'km' })?.depart).toBe('m');
		// Les colonnes de transit sont reportées telles quelles (même géométrie que l'exercice).
		expect(
			conversionDepuisTableau({ colonnes, answerUnit: 'm' })?.colonnes.map((c) => !!c.transit),
		).toEqual([false, true, true, false]);
	});
});

/* ============================================================
   4. ÉCHANTILLON — de VRAIS tableaux tirés par le catalogue
   ------------------------------------------------------------
   La déduction de l'unité de départ repose sur un invariant du générateur : on l'éprouve
   donc sur ses tirages réels, dans les deux sens et sur les cas décimaux du CM1. L'unité
   et la valeur ATTENDUES sont lues dans l'ÉNONCÉ (ce que l'enfant voit), et la réponse
   dans `answer` (ce que l'exercice corrige) — deux sources indépendantes du module testé.
   ============================================================ */
interface Tire {
	ou: string;
	question: string;
	answer: string;
	answerUnit: string;
	colonnes: { unite: string; nom: string; transit: boolean; chiffres: string }[];
}

const LECONS_TABLEAU = ['mes-longueurs', 'mes-masses', 'mes-contenances'];
const NIVEAUX: SchoolLevel[] = ['ce2', 'cm1'];

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
					question: ex.question,
					answer: ex.answer,
					answerUnit: ex.answerUnit,
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

	it('l’échantillon couvre les deux sens, les décimaux et les colonnes de transit', () => {
		expect(tires.length).toBe(LECONS_TABLEAU.length * NIVEAUX.length * 200);
		const specs = tires.map((t) => ({ t, spec: conversionDepuisTableau(t) }));
		const iDe = (s: ConversionSpec) => s.colonnes.findIndex((c) => c.unite === s.depart);
		const iVers = (s: ConversionSpec) => s.colonnes.findIndex((c) => c.unite === s.cible);
		const vus = specs
			.filter((x) => x.spec)
			.map((x) => ({ t: x.t, spec: x.spec as ConversionSpec }));
		expect(vus.some(({ spec }) => iDe(spec) < iVers(spec))).toBe(true); // grande → petite
		expect(vus.some(({ spec }) => iDe(spec) > iVers(spec))).toBe(true); // petite → grande
		expect(vus.some(({ t }) => t.answer.includes(','))).toBe(true); // réponse décimale
		expect(vus.some(({ t }) => enonce(t.question).valeur.includes(','))).toBe(true); // donnée décimale
		expect(vus.some(({ t }) => t.colonnes.some((c) => c.transit))).toBe(true);
		// Empans courts (une paire voisine) ET longs (×1000, trois colonnes à remplir).
		expect(vus.some(({ t }) => t.colonnes.length === 2)).toBe(true);
		expect(vus.some(({ t }) => t.colonnes.length === 4)).toBe(true);
	});

	it('l’unité de départ DÉDUITE est celle de l’énoncé, et jamais celle qu’on cherche', () => {
		const ratés: string[] = [];
		for (const t of tires) {
			const spec = conversionDepuisTableau(t);
			const dit = enonce(t.question);
			if (!spec) {
				ratés.push(`${t.ou} — aucune spécification (l'invariant du générateur ne tient pas)`);
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
			const spec = conversionDepuisTableau(t);
			if (!spec) continue; // signalé par le test précédent
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
			if (/d[ée]cal/.test(texte)) faute('« décale la virgule »');
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('ce qui est ÉCRIT suit ce qui est DIT : une colonne à la fois, sans trou ni doublon', () => {
		const fautes: string[] = [];
		for (const t of tires) {
			const spec = conversionDepuisTableau(t);
			if (!spec) continue;
			const deroule = derouleConversion(spec);
			if (!deroule.pas.length) continue;
			const faute = (raison: string) => fautes.push(`${t.ou} — ${raison}`);
			const iCible = spec.colonnes.findIndex((c) => c.unite === spec.cible);
			const iDepart = spec.colonnes.findIndex((c) => c.unite === spec.depart);
			const ecrites: string[] = [];
			deroule.pas.forEach((p, k) => {
				for (const e of p.ecritures ?? []) {
					ecrites.push(e.cible);
					const index = spec.colonnes.findIndex((_, i) => cibleColonne(i) === e.cible);
					if (index < 0) faute(`pas ${k} : case « ${e.cible} » hors du tableau`);
					else if (e.texte !== spec.colonnes[index].chiffres)
						faute(`pas ${k} : écrit « ${e.texte} » dans ${spec.colonnes[index].unite}`);
				}
				// Ce qu'on surligne est ce dont on parle : jamais une case hors du tableau.
				for (const a of p.actifs ?? [])
					if (!spec.colonnes.some((_, i) => cibleColonne(i) === a))
						faute(`pas ${k} : surligne « ${a} », hors du tableau`);
			});
			// Aucune case remplie deux fois, et toutes les colonnes de l'énoncé à la cible
			// sont remplies (le tableau ne doit pas rester troué au dernier pas).
			if (new Set(ecrites).size !== ecrites.length) faute('une case remplie deux fois');
			const attendues = Array.from({ length: Math.max(iDepart, iCible) + 1 }, (_, i) =>
				cibleColonne(i),
			);
			for (const cible of attendues)
				if (!ecrites.includes(cible)) faute(`colonne « ${cible} » jamais remplie`);
			// Les pas du MILIEU sont les colonnes qu'on remplit une à une (le premier pose le
			// nombre donné, le dernier relit) : chacune porte un 0 — dire « il n'y a rien à
			// compter » d'une colonne qui porte un chiffre serait un contresens énoncé au moment
			// même où on l'écrit —, et chacune est NOMMÉE (le 0 tient un rang, il ne « rallonge »
			// pas le nombre). Critère structurel, indépendant de la rédaction du moment.
			deroule.pas.slice(1, -1).forEach((p, k) => {
				const ecritures = p.ecritures ?? [];
				if (ecritures.length !== 1) {
					faute(`pas ${k + 1} : ${ecritures.length} cases remplies au lieu d'une`);
					return;
				}
				if (ecritures[0].texte !== '0') faute(`pas ${k + 1} : remplit un ${ecritures[0].texte}`);
				const index = spec.colonnes.findIndex((_, i) => cibleColonne(i) === ecritures[0].cible);
				if (index >= 0 && !p.phrase.includes(`${spec.colonnes[index].nom}s`))
					faute(`pas ${k + 1} : colonne non nommée — « ${p.phrase} »`);
			});
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});
});
