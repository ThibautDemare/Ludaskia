/* ============================================================
   Représentations composites du journal d'erreurs (#391) — logique pure :
   opération posée (agrégation des cellules), rangement, tableau de conversion,
   appariement, tri par thème, et résolution du libellé d'une liste d'orthographe.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	analyserResultatPosee,
	ordreErreur,
	nombreTableauSaisi,
	pairesErreur,
	motsMalClasses,
	type CellulePosee,
	type CelluleTableau,
	type LienPropose,
} from '../src/core/erreur-representation';
import { labelLeconOrtho } from '../src/core/orthographe/lessons';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import { MESURE_LESSONS } from '../src/data/maths/mesures';
import type { Exercise } from '../src/core/exercise';
import type { SchoolLevel } from '../src/core/catalog';

const cell = (pos: number, saisie: string, correct: boolean): CellulePosee => ({
	pos,
	saisie,
	correct,
});

/* Cases d'un tableau façon runner : liste PLATE « unité:chiffre », une entrée par
   chiffre saisi (la colonne de tête peut donc en fournir deux). */
const cases = (...specs: string[]): CelluleTableau[] =>
	specs.map((s) => {
		const [unite, valeur] = s.split(':');
		return { unite, valeur };
	});

describe('analyserResultatPosee (opération posée → une entrée)', () => {
	it('résultat entièrement juste → non journalisé', () => {
		const r = analyserResultatPosee([cell(0, '4', true), cell(1, '2', true), cell(2, '3', true)]);
		expect(r.journaliser).toBe(false);
	});

	it('grille vierge (aucun chiffre saisi) → non journalisé', () => {
		const r = analyserResultatPosee([cell(0, '', false), cell(1, '', false)]);
		expect(r.journaliser).toBe(false);
	});

	it('résultat faux et complet → journalisé, chiffres assemblés dans l’ordre des positions', () => {
		// positions données en désordre : la reconstruction doit trier par `pos`.
		const r = analyserResultatPosee([cell(2, '3', false), cell(0, '4', true), cell(1, '1', false)]);
		expect(r.journaliser).toBe(true);
		expect(r.donnee).toBe('413');
	});

	it('résultat partiellement saisi (des cellules vides) → « (incomplet) »', () => {
		const r = analyserResultatPosee([cell(0, '4', true), cell(1, '', false), cell(2, '3', false)]);
		expect(r.journaliser).toBe(true);
		expect(r.donnee).toBe('(incomplet)');
	});
});

describe('ordreErreur (rangement d’une suite)', () => {
	it('joint la suite proposée et la suite attendue par « , »', () => {
		expect(ordreErreur(['banane', 'abricot', 'cerise'], ['abricot', 'banane', 'cerise'])).toEqual({
			donnee: 'banane, abricot, cerise',
			attendue: 'abricot, banane, cerise',
		});
	});

	/* Nature « nombres » (#448) : le parent lit ces deux chaînes dans l'espace encadrant,
	   HORS de l'application. Jointes par la virgule, « donné : 95, 104, 98 » se lit comme
	   des nombres à virgule — c'est le séparateur DÉCIMAL en français. D'où le
	   point-virgule. Appelé ici DIRECTEMENT avec la nature : sans ce test, un retour au
	   séparateur unique ne serait vu par aucune suite (les autres chemins de #448
	   n'appellent pas `ordreErreur`). */
	it('nature « nombres » : joint par « ; », jamais par la virgule décimale', () => {
		const r = ordreErreur(['95', '104', '98'], ['95', '98', '104'], 'nombres');
		expect(r).toEqual({ donnee: '95 ; 104 ; 98', attendue: '95 ; 98 ; 104' });
		expect(r.donnee).not.toContain(',');
		expect(r.attendue).not.toContain(',');
	});

	it('nature « mots » explicite = comportement par défaut (virgule)', () => {
		const propose = ['chien', 'chat'];
		const ordre = ['chat', 'chien'];
		expect(ordreErreur(propose, ordre, 'mots')).toEqual(ordreErreur(propose, ordre));
	});

	it('rangée laissée vide (aucune tuile posée) : réponse donnée vide, attendue lisible', () => {
		// Le runner passe `[]` quand le widget n'expose pas de réponse : pas de plantage,
		// et le parent voit quand même ce qui était attendu.
		expect(ordreErreur([], ['95', '98'], 'nombres')).toEqual({
			donnee: '',
			attendue: '95 ; 98',
		});
	});
});

describe('nombreTableauSaisi (tableau de conversion relu dans l’unité cible)', () => {
	it('cible = dernière colonne (grande→petite) : aucune virgule', () => {
		// « 3 km = ? m » : les 4 colonnes km·hm·dam·m, cible en bout de tableau.
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:0', 'm:0'), 'm')).toBe('3000');
	});

	it('cible = colonne de tête (petite→grande) : virgule juste après la tête', () => {
		// « 1500 m = ? km » → 1,500 km (soit 1,5 km).
		expect(nombreTableauSaisi(cases('km:1', 'hm:5', 'dam:0', 'm:0'), 'km')).toBe('1,500');
	});

	it('cible au milieu du tableau : virgule après SA colonne, pas après la première', () => {
		// « 250 cm = ? dm » sur l'empan m·dm·cm → 25,0 dm.
		expect(nombreTableauSaisi(cases('m:2', 'dm:5', 'cm:0'), 'dm')).toBe('25,0');
	});

	it('tête à 2 chiffres et cible en tête : virgule après le DERNIER chiffre de la tête', () => {
		// « 1250 cm = ? m » : la tête « m » porte 12 → 12,50 m (et non 1,250).
		expect(nombreTableauSaisi(cases('m:1', 'm:2', 'dm:5', 'cm:0'), 'm')).toBe('12,50');
	});

	it('tête à 2 chiffres et cible en bout : les chiffres se suivent sans virgule', () => {
		// « 12 km = ? m » → 12000 m.
		expect(nombreTableauSaisi(cases('km:1', 'km:2', 'hm:0', 'dam:0', 'm:0'), 'm')).toBe('12000');
	});

	it('chiffre parasite dans une colonne de transit : il ressort dans la réponse donnée', () => {
		// C'est l'erreur à montrer au parent. « 3 km = ? m » avec un 7 glissé dans les dam :
		// la réponse donnée doit dire 3070 (et non 3000, la valeur juste).
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:7', 'm:0'), 'm')).toBe('3070');
		// Même table relue dans l'autre sens (« 3000 m = ? km ») : le 7 parasite pèse un
		// centième de km, donc la réponse donnée porte une virgule alors que l'écran n'en
		// affiche pas (réponse attendue entière). C'est VOULU : « 3070 km » induirait le
		// parent en erreur, « 3,070 km » face à « 3 km » montre exactement l'écart.
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:7', 'm:0'), 'km')).toBe('3,070');
	});

	it('unité cible absente des cases : chiffres bruts, sans virgule inventée', () => {
		expect(nombreTableauSaisi(cases('km:3', 'hm:0', 'dam:0', 'm:0'), 'mm')).toBe('3000');
	});

	it('aucune case : chaîne vide (pas d’exception)', () => {
		expect(nombreTableauSaisi([], 'm')).toBe('');
	});

	it('une seule colonne, qui est la cible : le chiffre seul', () => {
		expect(nombreTableauSaisi(cases('m:7'), 'm')).toBe('7');
	});
});

describe('nombreTableauSaisi — confronté aux tableaux réellement générés (#394)', () => {
	type Tableau = Extract<Exercise, { type: 'tableauConversion' }>;
	const FAMILLES = ['mes-longueurs', 'mes-masses', 'mes-contenances'] as const;
	const NIVEAUX: SchoolLevel[] = ['ce2', 'cm1'];
	const type = (id: string) => MESURE_LESSONS.find((l) => l.id === id)!.exerciseType;

	function genTab(id: string, level: SchoolLevel, n: number): Tableau[] {
		const t = type(id);
		const out: Tableau[] = [];
		for (let i = 0; i < n; i++) {
			const ex = t.generate({ mode: 'tableau', level });
			if (ex.type === 'tableauConversion') out.push(ex);
		}
		return out;
	}

	/* Tableau REMPLI JUSTE : les chiffres attendus, déployés en liste plate comme le
	   runner (une case par chiffre, la tête pouvant en porter deux). */
	const casesJustes = (ex: Tableau): CelluleTableau[] =>
		ex.colonnes.flatMap((col) =>
			col.chiffres.split('').map((valeur) => ({ unite: col.unite, valeur })),
		);

	it('un tableau rempli JUSTE se relit exactement comme la réponse attendue', () => {
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 200)) {
					const lu = nombreTableauSaisi(casesJustes(ex), ex.answerUnit);
					// Forme lisible : des chiffres, au plus une virgule décimale.
					expect(lu).toMatch(/^\d+(,\d+)?$/);
					// Même VALEUR que la réponse (les zéros finaux de « 12,50 » vs « 12,5 » ne
					// comptent pas ; une virgule mal placée d'un rang, si).
					expect(Number(lu.replace(',', '.'))).toBeCloseTo(Number(ex.answer.replace(',', '.')), 6);
				}
			}
		}
	});

	it('quand l’écran pose une virgule, le journal la place au même endroit', () => {
		let vus = 0;
		for (const id of FAMILLES) {
			for (const ex of genTab(id, 'cm1', 300)) {
				if (ex.virguleApres === undefined) continue;
				vus++;
				const lu = nombreTableauSaisi(casesJustes(ex), ex.answerUnit);
				// Nombre de chiffres affichés avant la virgule de l'écran (`virguleApres` est un
				// index de COLONNE, la tête pouvant valoir 2 chiffres).
				const avant = ex.colonnes
					.slice(0, ex.virguleApres + 1)
					.reduce((n, c) => n + c.chiffres.length, 0);
				expect(lu.indexOf(',')).toBe(avant);
			}
		}
		expect(vus).toBeGreaterThan(0); // le cas décimal est bien atteint (pas un test à vide)
	});

	it('un zéro de transit oublié change la valeur relue (l’erreur ne peut pas passer)', () => {
		// Les masses portent toujours une colonne de transit (hg/dag ou dg/cg).
		let vus = 0;
		for (const level of NIVEAUX) {
			for (const ex of genTab('mes-masses', level, 100)) {
				const cellules = casesJustes(ex);
				const uniteTransit = ex.colonnes.find((c) => c.transit)!.unite;
				const i = cellules.findIndex((c) => c.unite === uniteTransit);
				cellules[i] = { unite: uniteTransit, valeur: cellules[i].valeur === '7' ? '9' : '7' };
				const lu = nombreTableauSaisi(cellules, ex.answerUnit);
				expect(Number(lu.replace(',', '.'))).not.toBeCloseTo(
					Number(ex.answer.replace(',', '.')),
					6,
				);
				vus++;
			}
		}
		expect(vus).toBeGreaterThan(0);
	});
});

describe('pairesErreur (appariement : seuls les liens faux)', () => {
	const paires = [
		{ gauche: 'chant', droite: 'chanteur' },
		{ gauche: 'dent', droite: 'dentiste' },
		{ gauche: 'fleur', droite: 'fleuriste' },
		{ gauche: 'lait', droite: 'laitier' },
	];
	const lien = (gauche: string, droite: string | null): LienPropose => ({ gauche, droite });

	it('un seul lien faux (mot relié à un intrus) : les paires justes ne sont pas re-citées', () => {
		const liens = [
			lien('chant', 'chanteur'),
			lien('dent', 'dentelle'), // intrus
			lien('fleur', 'fleuriste'),
			lien('lait', 'laitier'),
		];
		expect(pairesErreur(liens, paires)).toEqual({
			donnee: 'dent → dentelle',
			attendue: 'dent → dentiste',
		});
	});

	it('tout est faux : chaque lien est cité, séparé par « ; », dans l’ordre affiché', () => {
		const liens = [lien('chant', 'dentiste'), lien('dent', 'fleuriste'), lien('fleur', 'chanteur')];
		expect(pairesErreur(liens, paires)).toEqual({
			donnee: 'chant → dentiste ; dent → fleuriste ; fleur → chanteur',
			attendue: 'chant → chanteur ; dent → dentiste ; fleur → fleuriste',
		});
	});

	it('mot laissé sans lien : « (non relié) » côté donné, la bonne paire côté attendu', () => {
		const liens = [lien('chant', 'chanteur'), lien('dent', null)];
		expect(pairesErreur(liens, paires)).toEqual({
			donnee: 'dent → (non relié)',
			attendue: 'dent → dentiste',
		});
	});

	it('donné et attendu restent alignés mot à mot, même si l’ordre diffère des paires', () => {
		// Ordre d'affichage ≠ ordre du jeu de paires : une réponse donnée et une réponse
		// attendue désalignées montreraient au parent la correction d'un AUTRE mot.
		const liens = [lien('lait', 'dentiste'), lien('chant', 'laitier'), lien('dent', 'chanteur')];
		const { donnee, attendue } = pairesErreur(liens, paires);
		const gauchesDe = (s: string) => s.split(' ; ').map((seg) => seg.split(' → ')[0]);
		expect(gauchesDe(donnee)).toEqual(['lait', 'chant', 'dent']);
		expect(gauchesDe(attendue)).toEqual(['lait', 'chant', 'dent']);
	});

	it('repli défensif : aucun lien faux → tous les liens, donné identique à l’attendu', () => {
		const liens = [lien('chant', 'chanteur'), lien('dent', 'dentiste')];
		const res = pairesErreur(liens, paires);
		expect(res.donnee).toBe('chant → chanteur ; dent → dentiste');
		expect(res.attendue).toBe(res.donnee);
	});
});

describe('motsMalClasses (tri par thème)', () => {
	const mots = [
		{ mot: 'chat', cat: 0 as const },
		{ mot: 'rose', cat: 1 as const },
		{ mot: 'chien', cat: 0 as const },
	];
	const categories = ['Animaux', 'Fleurs'] as const;

	it('ne renvoie que les mots MAL classés (colonne choisie ≠ bonne colonne)', () => {
		// chat mal classé (mis en Fleurs), rose bien classée, chien non classé.
		const res = motsMalClasses(mots, categories, { chat: 1, rose: 1 });
		expect(res).toEqual([{ mot: 'chat', donnee: 'Fleurs', attendue: 'Animaux' }]);
	});

	it('tri parfait → aucune entrée', () => {
		expect(motsMalClasses(mots, categories, { chat: 0, rose: 1, chien: 0 })).toEqual([]);
	});
});

describe('labelLeconOrtho (libellé d’une liste d’orthographe)', () => {
	it('liste du profil (custom) : renvoie son label', () => {
		expect(labelLeconOrtho('liste-42', [{ id: 'liste-42', label: 'Mots de la semaine' }])).toBe(
			'Mots de la semaine',
		);
	});

	it('leçon prédéfinie : renvoie son label sans état de profil', () => {
		const predef = ORTHO_PREDEF[0];
		expect(labelLeconOrtho(predef.id)).toBe(predef.label);
	});

	it('id inconnu → null (repli sur l’id brut côté UI)', () => {
		expect(labelLeconOrtho('inexistant')).toBeNull();
	});
});
