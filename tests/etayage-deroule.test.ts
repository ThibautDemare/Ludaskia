/* ============================================================
   Étayage (#490) — le CONTRAT commun des résolutions générées, et son application à
   TOUTES les données branchées.
   ------------------------------------------------------------
   Auteur des tests distinct de l'auteur du code. Deux choses se jouent ici, et aucune ne
   se voit dans un moteur pris isolément :

   1. le PLAFOND. Un déroulé plus long que `PAS_MAX` est abandonné EN ENTIER, jamais
      tronqué : couper au douzième pas laisserait l'enfant devant une méthode qui s'arrête
      au milieu. La contrepartie est qu'il faut vérifier qu'aucune résolution réellement
      atteignable ne dépasse ce plafond — sinon la « dégradation propre » se traduit en
      panneau silencieusement absent là où on l'a promis ;
   2. le BRANCHEMENT. Chaque entrée `etayage` déclarée par une leçon doit produire un
      déroulé MONTRABLE — ou pas d'entrée du tout. Une entrée qui n'aboutit à rien ouvre un
      panneau vide : la pire des trois issues, puisqu'elle promet une explication à un
      enfant qui vient d'échouer. C'est un test de DONNÉES autant que de code, et il tombe
      tout seul le jour où quelqu'un ajoute une leçon avec un exemple mal formé.

   Le déroulé est obtenu par l'aiguillage RÉEL du panneau (`moteurEtayage`), pas par un
   `switch` recopié dans le test : c'est lui qui décide quel moteur traite quel exemple, et
   c'est là que se logerait une erreur de branchement.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { PAS_MAX, derouleMontrable, type DerouleEtayage } from '../src/core/etayage-deroule';
import { etayagePour, type EtayageExemple } from '../src/core/etayage';
import { getAllLessons, type LessonDef, type SchoolLevel } from '../src/core/catalog';
import { moteurEtayage } from '../src/ui/etayage-visuels';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const deroule = (pas: number): DerouleEtayage => ({
	titre: 'test',
	pas: Array.from({ length: pas }, (_, i) => ({ phrase: `pas ${i}` })),
});

/* ============================================================
   1. LE CONTRAT : QU'EST-CE QU'UN DÉROULÉ MONTRABLE ?
   ============================================================ */
describe('derouleMontrable — ni rien à montrer, ni une épreuve d’endurance', () => {
	it('rien du tout n’est pas montrable (pas de panneau, pas un panneau vide)', () => {
		expect(derouleMontrable(undefined)).toBe(false);
		expect(derouleMontrable(deroule(0))).toBe(false);
	});

	it('un déroulé ordinaire est montrable, jusqu’au plafond inclus', () => {
		expect(derouleMontrable(deroule(1))).toBe(true);
		expect(derouleMontrable(deroule(PAS_MAX))).toBe(true);
	});

	it('au-delà du plafond, on abandonne ENTIÈREMENT plutôt que de tronquer', () => {
		// La règle affichée seule vaut mieux qu'une méthode qui s'arrête au milieu : le
		// prédicat refuse, il ne rogne pas.
		const trop = deroule(PAS_MAX + 1);
		expect(derouleMontrable(trop)).toBe(false);
		expect(trop.pas.length).toBe(PAS_MAX + 1); // rien n'a été coupé
	});
});

/* ============================================================
   2. TOUTES LES DONNÉES BRANCHÉES DU CATALOGUE
   ============================================================ */
const NIVEAUX: SchoolLevel[] = ['ce2', 'cm1'];

/* Chaque (leçon, niveau, mode) réellement atteignable : les modes déclarés par la leçon,
   plus « sans mode » (une leçon mono-mode est lancée sans en choisir un). */
function situations(): { lesson: LessonDef; niveau: SchoolLevel; mode?: string }[] {
	const out: { lesson: LessonDef; niveau: SchoolLevel; mode?: string }[] = [];
	for (const lesson of getAllLessons()) {
		const niveaux = (lesson.levels ?? NIVEAUX).filter((n) => NIVEAUX.includes(n));
		for (const niveau of niveaux) {
			out.push({ lesson, niveau });
			for (const m of lesson.exerciseType.modes ?? []) out.push({ lesson, niveau, mode: m.id });
		}
	}
	return out;
}

/* Les exemples DISTINCTS servis par le catalogue (une même entrée peut être servie à
   plusieurs niveaux ou plusieurs modes : on ne la juge qu'une fois). */
function exemplesServis(): { ou: string; exemple: EtayageExemple }[] {
	const vus = new Set<EtayageExemple>();
	const out: { ou: string; exemple: EtayageExemple }[] = [];
	for (const { lesson, niveau, mode } of situations()) {
		const contenu = etayagePour(lesson, niveau, mode);
		if (!contenu?.exemple || vus.has(contenu.exemple)) continue;
		vus.add(contenu.exemple);
		out.push({ ou: `${lesson.id}/${niveau}${mode ? `/${mode}` : ''}`, exemple: contenu.exemple });
	}
	return out;
}

describe('les exemples déclarés par les leçons — jamais un panneau vide', () => {
	const servis = exemplesServis();

	it('l’inventaire couvre les familles mécanisables attendues', () => {
		const parMoteur = new Map<string, number>();
		for (const { exemple } of servis)
			parMoteur.set(exemple.moteur, (parMoteur.get(exemple.moteur) ?? 0) + 1);
		// Comptes dérivés des données : 3 opérations posées, 3 tableaux de conversion (les
		// durées n'en ont pas), 3 droites graduées (les entiers en déclarent une PAR NIVEAU —
		// un cran ne vaut jamais 1 au CM1 —, les décimaux une seule, CM1 only), 6 entrées de
		// numération (5 leçons, dont « jusqu'à 10 000 » qui en déclare une par niveau), et
		// 41 (verbe × temps) — les 52 leçons de conjugaison moins les 11 présents irréguliers,
		// qui n'ont rien d'honnête à dérouler.
		expect(parMoteur.get('posee')).toBe(3);
		expect(parMoteur.get('conversion')).toBe(3);
		expect(parMoteur.get('droite')).toBe(3);
		expect(parMoteur.get('position')).toBe(6);
		expect(parMoteur.get('conjugaison')).toBe(41);
	});

	it('chacun produit un déroulé MONTRABLE, sous le plafond', () => {
		const fautes: string[] = [];
		for (const { ou, exemple } of servis) {
			const d = moteurEtayage(exemple).deroule;
			if (!derouleMontrable(d))
				fautes.push(`${ou} (${exemple.moteur}) — ${d.pas.length} pas, plafond ${PAS_MAX}`);
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 5) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('chaque pas dit quelque chose, et rien d’assemblé de travers', () => {
		const fautes: string[] = [];
		for (const { ou, exemple } of servis) {
			const d = moteurEtayage(exemple).deroule;
			const faute = (raison: string) => fautes.push(`${ou} — ${raison}`);
			if (!d.titre.trim()) faute('titre vide');
			d.pas.forEach((p, i) => {
				// Un trou d'interpolation ne se voit pas au relecteur ; il se voit ici.
				if (!p.phrase.trim()) faute(`pas ${i} : phrase vide`);
				if (/undefined|NaN|\[object/.test(p.phrase)) faute(`pas ${i} : « ${p.phrase} »`);
				if (p.phrase !== p.phrase.trim() || /\s{2}/.test(p.phrase))
					faute(`pas ${i} : espaces parasites — « ${p.phrase} »`);
				for (const e of p.ecritures ?? [])
					if (!e.texte.trim()) faute(`pas ${i} : écriture vide dans « ${e.cible} »`);
			});
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 5) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('aucune leçon n’ouvre le déroulé d’une AUTRE (pas de repli par famille de moteur)', () => {
		/* Corollaire central de #490 : un exemple voisin servi « faute de mieux » est PIRE que
		   rien. Formulé sans leçon témoin — depuis #490 PR 3 les maths portent toutes un
		   contenu et le français suivra, donc un témoin « leçon sans entrée » désigné par son
		   id se périmerait à chaque PR. Ce qui reste vrai pour toujours : l'exemple déroulé
		   est un objet déclaré par CETTE leçon (identité de référence). */
		const fautes: string[] = [];
		for (const { lesson, niveau, mode } of situations()) {
			const contenu = etayagePour(lesson, niveau, mode);
			if (!contenu?.exemple) continue;
			const siens = (lesson.etayage ?? []).map((e) => e.contenu.exemple);
			if (!siens.includes(contenu.exemple))
				fautes.push(
					`${lesson.id}/${niveau}/${mode ?? '-'} — exemple « ${contenu.exemple.moteur} »`,
				);
		}
		expect(fautes).toEqual([]);
		// Les deux voisinages les plus tentants : une leçon de calcul MENTAL (texte rédigé)
		// n'ouvre pas le déroulé de l'addition posée, et un présent irrégulier — qui n'a rien
		// d'honnête à dérouler — n'ouvre pas celui d'« aimer ».
		for (const id of ['math-tables-addition', 'fr-conj-aller-present']) {
			const lesson = getAllLessons().find((l) => l.id === id);
			if (!lesson) throw new Error(`leçon absente du catalogue : ${id}`);
			for (const niveau of NIVEAUX)
				expect(etayagePour(lesson, niveau, 'saisie')?.exemple, id).toBeUndefined();
		}
	});
});
