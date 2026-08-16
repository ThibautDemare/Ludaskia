/* ============================================================
   Étayage (#490) — résolution GÉNÉRÉE d'un placement sur la droite graduée.
   ------------------------------------------------------------
   Auteur des tests distinct de l'auteur du code. Le principe de dérivation, ici, est
   simple et il est TOUT le test : un enfant ne dispose que des NOMBRES ÉCRITS sous la
   droite. Tout ce que le déroulé affirme (ce que vaut une graduation, d'où l'on part,
   combien de sauts) doit donc se vérifier à partir de ces seuls libellés — pas des valeurs
   internes du générateur, qui sont en centièmes entiers pour les décimaux. C'est aussi ce
   qui rend le test indépendant de l'implémentation : on refait le raisonnement de l'enfant.

   Ce qui est éprouvé :
   - `borneAvant` : le nombre écrit JUSTE avant la cible, jamais la borne de gauche (sinon
     l'enfant compte neuf crans là où deux suffisent), et rien quand il n'y en a pas ;
   - la VÉRITÉ arithmétique des trois phrases, sur les deux leçons et leurs trois échelles,
     par échantillon déterministe : (max − min) / n = valeur d'une graduation, et
     (cible − départ) / valeur d'une graduation = nombre de sauts annoncé ;
   - l'ÉTAT DE LA FIGURE : le repère n'apparaît qu'une fois le point de départ nommé, et le
     chemin parcouru va bien du départ à la cible ;
   - la DÉGRADATION : pas de graduation chiffrée sous la cible, ou valeur d'un cran inconnue
     (instantané de reprise antérieur) → déroulé vide, donc pas de panneau.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	borneAvant,
	derouleDroite,
	droiteDepuisExercice,
	type DroiteSpec,
} from '../src/core/etayage-droite';
import { PAS_MAX, derouleMontrable } from '../src/core/etayage-deroule';
import { etayagePour } from '../src/core/etayage';
import { getLessonById, type LessonDef, type SchoolLevel } from '../src/core/catalog';
import { parseNombreFr } from '../src/core/nombres';
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

/* Fenêtre [340 ; 350] graduée en unités, cible 347 — la même que l'exemple de la leçon
   des entiers, recopiée ici pour que les cas limites se lisent sans ouvrir les données. */
const ENTIERS: DroiteSpec = {
	min: 340,
	max: 350,
	pas: 1,
	bornes: [
		{ valeur: 340, label: '340' },
		{ valeur: 345, label: '345' },
		{ valeur: 350, label: '350' },
	],
	cible: 347,
	cibleLabel: '347',
	pasLabel: '1',
};

/* ============================================================
   1. LE POINT DE DÉPART DU COMPTAGE
   ============================================================ */
describe('borneAvant — le nombre écrit juste avant la cible', () => {
	it('la borne chiffrée la plus PROCHE sous la cible, pas celle de gauche', () => {
		// 347 est après 345 (le milieu chiffré) : partir de 340 ferait compter 7 crans.
		expect(borneAvant(ENTIERS)?.label).toBe('345');
		// Une cible avant le milieu repart, elle, de la borne de gauche.
		expect(borneAvant({ ...ENTIERS, cible: 342, cibleLabel: '342' })?.label).toBe('340');
	});

	it('une cible POSÉE sur un nombre écrit repart du précédent (comparaison stricte)', () => {
		// Cas hors calibrage (la cible tombe toujours sur une graduation muette), mais la
		// fonction ne doit pas se désigner elle-même comme point de départ : « 0 saut » ne
		// serait pas un comptage.
		expect(borneAvant({ ...ENTIERS, cible: 345, cibleLabel: '345' })?.label).toBe('340');
	});

	it('rien à gauche de la cible : aucun point de départ nommable', () => {
		expect(borneAvant({ ...ENTIERS, cible: 340, cibleLabel: '340' })).toBeUndefined();
		expect(borneAvant({ ...ENTIERS, bornes: [] })).toBeUndefined();
	});
});

/* ============================================================
   2. LES TROIS PAS, SUR L'EXEMPLE DE LA LEÇON
   ============================================================ */
describe('derouleDroite — trois pas, dans l’ordre du raisonnement', () => {
	it('l’échelle d’abord, puis le point de départ, puis les sauts', () => {
		const d = derouleDroite(ENTIERS);
		expect(d.titre).toBe('Placer 347');
		expect(d.pas.length).toBe(3);
		// 1. Ce que vaut une graduation, DÉDUIT des deux nombres écrits : de 340 à 350, dix
		//    graduations, donc une graduation vaut 1.
		expect(d.pas[0].phrase).toContain('340');
		expect(d.pas[0].phrase).toContain('350');
		expect(d.pas[0].phrase).toContain('10 graduations');
		expect(d.pas[0].phrase).toContain('vaut donc 1');
		expect(d.pas[0].repere).toBeUndefined(); // rien de posé tant qu'on n'a pas d'ancre
		// 2. Le nombre écrit juste avant, et pourquoi pas un autre.
		expect(d.pas[1].phrase).toContain('347');
		expect(d.pas[1].phrase).toContain('345');
		expect(d.pas[1].repere).toBe(345);
		expect(d.pas[1].parcours).toBeUndefined();
		// 3. Deux sauts (345 → 346 → 347), le piège nommé, le repère posé à l'arrivée.
		expect(d.pas[2].phrase).toContain('2 graduations');
		expect(d.pas[2].phrase).toMatch(/sauts/);
		expect(d.pas[2].phrase).toMatch(/jamais les traits/);
		expect(d.pas[2].repere).toBe(347);
		expect(d.pas[2].parcours).toEqual({ de: 345, a: 347 });
	});

	it('un seul saut : le mot « graduation » s’accorde', () => {
		const d = derouleDroite({ ...ENTIERS, cible: 346, cibleLabel: '346' });
		expect(d.pas[2].phrase).toContain('1 graduation');
		expect(d.pas[2].phrase).not.toContain('1 graduations');
	});

	it('une graduation qui ne vaut pas 1 : c’est ce que le premier pas doit dire', () => {
		// Fenêtre [3 ; 4] en dixièmes (valeurs internes en centièmes), cible 3,7. Le comptage
		// part de 3,5 : deux crans de 0,1.
		const decimaux: DroiteSpec = {
			min: 300,
			max: 400,
			pas: 10,
			bornes: [
				{ valeur: 300, label: '3' },
				{ valeur: 350, label: '3,5' },
				{ valeur: 400, label: '4' },
			],
			cible: 370,
			cibleLabel: '3,7',
			pasLabel: '0,1',
		};
		const d = derouleDroite(decimaux);
		expect(d.titre).toBe('Placer 3,7');
		expect(d.pas[0].phrase).toContain('10 graduations');
		expect(d.pas[0].phrase).toContain('0,1');
		expect(d.pas[1].phrase).toContain('3,5');
		expect(d.pas[2].phrase).toContain('2 graduations');
		expect(d.pas[2].parcours).toEqual({ de: 350, a: 370 });
		// Aucune valeur INTERNE (centièmes) ne doit fuir dans le texte lu à l'enfant.
		const texte = d.pas.map((p) => p.phrase).join(' ');
		expect(texte).not.toContain('350');
		expect(texte).not.toContain('370');
	});

	it('les deux leçons déclarent un exemple, servi à leur niveau', () => {
		const entiers = etayagePour(lecon('num-droite-entiers'), 'ce2');
		expect(entiers?.exemple?.moteur).toBe('droite');
		const decimaux = etayagePour(lecon('num-droite-decimaux'), 'cm1');
		expect(decimaux?.exemple?.moteur).toBe('droite');
		// La cible de chaque exemple tombe sur une graduation MUETTE (comme dans l'exercice) et
		// à plusieurs crans d'un nombre écrit : sinon l'exemple ne montre aucun comptage.
		for (const contenu of [entiers, decimaux]) {
			if (contenu?.exemple?.moteur !== 'droite') throw new Error('exemple non déroulable');
			const spec = contenu.exemple.spec;
			expect(spec.bornes.map((b) => b.valeur)).not.toContain(spec.cible);
			const depart = borneAvant(spec);
			expect(depart).toBeDefined();
			expect(Math.round((spec.cible - (depart?.valeur ?? 0)) / spec.pas)).toBeGreaterThanOrEqual(2);
			expect(derouleMontrable(derouleDroite(spec))).toBe(true);
		}
	});
});

/* ============================================================
   3. DÉGRADATION
   ============================================================ */
describe('derouleDroite — refus propre plutôt que comptage sans ancre', () => {
	it('aucune graduation chiffrée sous la cible : déroulé vide', () => {
		const d = derouleDroite({ ...ENTIERS, cible: 340, cibleLabel: '340' });
		expect(d.pas).toEqual([]);
		expect(derouleMontrable(d)).toBe(false);
	});

	it('valeur d’une graduation inconnue (instantané de reprise ancien) : déroulé vide', () => {
		// Sans le premier pas, le reste n'est qu'un comptage aveugle : on ne montre rien.
		expect(derouleDroite({ ...ENTIERS, pasLabel: '' }).pas).toEqual([]);
	});

	it('droiteDepuisExercice recopie l’exercice sans rien réinterpréter', () => {
		const ex = {
			min: 340,
			max: 350,
			pas: 1,
			bornes: ENTIERS.bornes,
			cible: 347,
			cibleLabel: '347',
			pasLabel: '1',
		};
		expect(droiteDepuisExercice(ex)).toEqual(ENTIERS);
		// Les bornes sont COPIÉES : modifier l'exercice ensuite ne doit pas déformer une
		// démonstration déjà ouverte.
		const spec = droiteDepuisExercice(ex);
		expect(spec.bornes).not.toBe(ex.bornes);
	});
});

/* ============================================================
   4. ÉCHANTILLON — les vraies fenêtres tirées par le catalogue
   ------------------------------------------------------------
   Le générateur change d'échelle à chaque item (un cran vaut 1, 10, 100, 1 000, 0,1 ou
   0,01) : c'est exactement ce que le déroulé prétend savoir dire. On le vérifie sur ses
   tirages réels, en ne raisonnant que sur les libellés AFFICHÉS.
   ============================================================ */
interface TireDroite {
	ou: string;
	spec: DroiteSpec;
}

function droites(parCombinaison: number): TireDroite[] {
	const out: TireDroite[] = [];
	const combinaisons: { id: string; niveau: SchoolLevel }[] = [
		{ id: 'num-droite-entiers', niveau: 'ce2' },
		{ id: 'num-droite-entiers', niveau: 'cm1' },
		{ id: 'num-droite-decimaux', niveau: 'cm1' },
	];
	for (const { id, niveau } of combinaisons) {
		const l = lecon(id);
		for (let seed = 1; seed <= parCombinaison; seed++) {
			const ex = withSeed(seed, () => l.exerciseType.generate({ level: niveau }));
			if (ex.type !== 'droiteGraduee') throw new Error(`${id} : type ${ex.type}`);
			out.push({ ou: `${id}/${niveau}/${ex.cibleLabel}`, spec: droiteDepuisExercice(ex) });
		}
	}
	return out;
}

describe('INVARIANTS sur un large échantillon des vraies droites', () => {
	const tires = droites(250);

	it('l’échantillon couvre les six échelles de graduation de l’appli', () => {
		expect(tires.length).toBe(750);
		const echelles = new Set(tires.map((t) => t.spec.pasLabel));
		// Entiers : crans de 1, 10, 100 et 1 000 ; décimaux : 0,1 et 0,01.
		for (const attendu of ['1', '10', '100', '1000', '0,1', '0,01'])
			expect([...echelles], `échelle ${attendu}`).toContain(attendu);
		// Des comptages courts ET longs (jusqu'à 4 crans depuis un nombre écrit).
		const sauts = tires.map((t) => {
			const depart = borneAvant(t.spec);
			return Math.round((t.spec.cible - (depart?.valeur ?? 0)) / t.spec.pas);
		});
		expect(Math.min(...sauts)).toBe(1);
		expect(Math.max(...sauts)).toBe(4);
	});

	it('tout ce qui est affirmé se vérifie sur les nombres ÉCRITS (échelle, départ, sauts)', () => {
		const fautes: string[] = [];
		for (const { ou, spec } of tires) {
			const faute = (raison: string) => fautes.push(`${ou} — ${raison}`);
			const d = derouleDroite(spec);
			if (!derouleMontrable(d)) {
				faute(`déroulé non montrable (${d.pas.length} pas)`);
				continue;
			}
			if (d.pas.length !== 3) faute(`${d.pas.length} pas au lieu de 3`);
			if (d.pas.length > PAS_MAX) faute('au-dessus du plafond');
			const depart = borneAvant(spec);
			if (!depart) {
				faute('aucun point de départ');
				continue;
			}
			// Ce que l'enfant lit : les deux nombres écrits aux extrémités, la valeur d'un cran,
			// le nombre de départ et la cible. Tout le reste doit s'en déduire.
			const premiere = parseNombreFr(spec.bornes[0].label);
			const derniere = parseNombreFr(spec.bornes[spec.bornes.length - 1].label);
			const cran = parseNombreFr(spec.pasLabel);
			const cible = parseNombreFr(spec.cibleLabel);
			const depuis = parseNombreFr(depart.label);
			// 1. « Entre les deux, il y a N graduations : chacune vaut X. »
			const n = Number(/il y a (\d+) graduations/.exec(d.pas[0].phrase)?.[1]);
			if (!Number.isFinite(n)) faute(`premier pas sans nombre de graduations : ${d.pas[0].phrase}`);
			else if (Math.abs(n * cran - (derniere - premiere)) > 1e-9)
				faute(`${n} × ${spec.pasLabel} ≠ ${premiere} → ${derniere}`);
			if (!d.pas[0].phrase.includes(spec.bornes[0].label))
				faute('la borne de gauche n’est pas dite');
			if (!d.pas[0].phrase.includes(spec.bornes[spec.bornes.length - 1].label))
				faute('la borne de droite n’est pas dite');
			// 2. Le départ nommé est le nombre écrit LE PLUS PROCHE sous la cible.
			if (!d.pas[1].phrase.includes(depart.label)) faute('le point de départ n’est pas dit');
			if (spec.bornes.some((b) => b.valeur > depart.valeur && b.valeur < spec.cible))
				faute(`départ ${depart.label} : un nombre écrit est plus proche`);
			if (d.pas[1].repere !== depart.valeur) faute('le repère n’est pas posé sur le départ');
			// 3. Le nombre de sauts annoncé est celui qu'on compte sur les libellés.
			const sauts = Number(/j'avance de (\d+) graduation/.exec(d.pas[2].phrase)?.[1]);
			if (!Number.isFinite(sauts)) faute(`troisième pas sans nombre de sauts : ${d.pas[2].phrase}`);
			else {
				if (Math.abs(depuis + sauts * cran - cible) > 1e-9)
					faute(`${depart.label} + ${sauts} × ${spec.pasLabel} ≠ ${spec.cibleLabel}`);
				if (sauts < 1) faute('un comptage de zéro saut');
				const pluriel = /avance de \d+ graduations/.test(d.pas[2].phrase);
				if (pluriel !== sauts > 1) faute(`accord de « graduation » faux pour ${sauts}`);
			}
			// 4. La figure suit le texte : repère à l'arrivée, chemin du départ à la cible.
			if (d.pas[2].repere !== spec.cible) faute('le repère final n’est pas sur la cible');
			if (d.pas[2].parcours?.de !== depart.valeur || d.pas[2].parcours?.a !== spec.cible)
				faute('le chemin parcouru ne va pas du départ à la cible');
			// 5. Le titre nomme la cible telle qu'elle est écrite.
			if (!d.titre.includes(spec.cibleLabel)) faute(`titre sans la cible : ${d.titre}`);
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});
});
