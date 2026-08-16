/* ============================================================
   Étayage (#490) — résolution GÉNÉRÉE d'une question de numération.
   ------------------------------------------------------------
   Auteur des tests distinct de l'auteur du code. Les attendus sont dérivés de la
   numération décimale elle-même, et calculés autrement que dans le module :
   - le CHIFFRE d'un rang se lit dans l'écriture du nombre (le r-ième caractère en partant
     de la droite), pas par une division ;
   - « combien en tout » se lit en MASQUANT la droite, c'est-à-dire en tronquant la chaîne
     — ce que la phrase dit littéralement (« je cache tout ce qui est à droite ») ;
   - une décomposition est juste si la SOMME de ses termes redonne le nombre : c'est le
     seul juge, et il ne dépend d'aucune formulation.

   Ce qui est éprouvé :
   - les quatre gestes de la famille, qui se ressemblent à l'œil et qu'il ne faut surtout
     pas confondre (`chiffre` / `entout` / `rangs` / `multiplicative`) ;
   - le ZÉRO qui tient un rang : sa phrase apparaît quand il y en a un, jamais autrement,
     et elle nomme un rang qui porte vraiment un 0 ;
   - la DÉGRADATION : rang absent du nombre, ou rang sans nom (au-delà des millions) →
     déroulé vide plutôt qu'une case désignée dans le vide ;
   - par ÉCHANTILLON (des centaines de nombres × leurs rangs × les quatre genres) : toute
     égalité énoncée est vraie, tout chiffre annoncé est le bon, la longueur reste sous le
     plafond — et le FRANÇAIS tient (accords), ce qui n'est pas un détail dans une phrase
     servie à un enfant qui vient d'échouer.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	chiffresParRang,
	cibleRang,
	deroulePosition,
	type GenrePosition,
	type PositionSpec,
} from '../src/core/etayage-position';
import { PAS_MAX, derouleMontrable } from '../src/core/etayage-deroule';
import { etayagePour } from '../src/core/etayage';
import { getLessonById, type LessonDef } from '../src/core/catalog';
import { ESPACE_FINE, formatNombre, parseNombreFr } from '../src/core/nombres';

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
};

/* Un nombre tel qu'il est ÉCRIT dans une phrase : des chiffres, éventuellement groupés par
   l'espace fine insécable de l'appli (jamais écrite en clair dans un source, cf. nombres.ts). */
const NOMBRE_ECRIT = '[\\d\\u202F]+';

/* Nomenclature des rangs de la numération française, écrite ici plutôt qu'importée : c'est
   la table du programme (unités, dizaines, centaines, milliers, dizaines de mille…), pas un
   détail d'implémentation. Le GENRE sert à juger l'accord (« aucun millier », mais « aucune
   dizaine ») : c'est du français, pas une convention du code. */
const RANGS: { singulier: string; pluriel: string; masculin: boolean }[] = [
	{ singulier: 'unité', pluriel: 'unités', masculin: false },
	{ singulier: 'dizaine', pluriel: 'dizaines', masculin: false },
	{ singulier: 'centaine', pluriel: 'centaines', masculin: false },
	{ singulier: 'millier', pluriel: 'milliers', masculin: true },
	{ singulier: 'dizaine de mille', pluriel: 'dizaines de mille', masculin: false },
	{ singulier: 'centaine de mille', pluriel: 'centaines de mille', masculin: false },
	{ singulier: 'million', pluriel: 'millions', masculin: true },
];

/* Le chiffre du rang `r`, LU dans l'écriture du nombre (et non calculé par division). */
const chiffreLu = (n: number, r: number): number => Number(String(n).split('').reverse()[r]);

/* « Combien de <rang> en tout » : ce qui reste quand on CACHE les chiffres de droite. */
const enMasquant = (n: number, r: number): number => {
	const s = String(n);
	return r >= s.length ? 0 : Number(s.slice(0, s.length - r));
};

/* Le rang nommé dans un terme de décomposition (« 4 dizaines de mille ») : on retient le
   nom le plus long qui corresponde, pour ne pas confondre « dizaines » et « dizaines de
   mille ». */
function rangDuNom(nom: string): number {
	const trouve = RANGS.map((r, i) => ({ i, r }))
		.filter(({ r }) => nom === r.singulier || nom === r.pluriel)
		.pop();
	if (!trouve) throw new Error(`rang inconnu : « ${nom} »`);
	return trouve.i;
}

/** Valeur de la décomposition énoncée par le pas « Je relis tout : … = N ». Les termes sont
    rendus à leur valeur (« 4 dizaines de mille » → 40 000, « 4 × 10 000 » → 40 000) et
    additionnés : si la somme ne redonne pas le nombre, la démonstration est fausse. */
function valeurRelue(phrase: string): { somme: number; annonce: number } {
	const m = new RegExp(`Je relis tout : (.+) = (${NOMBRE_ECRIT})\\.$`).exec(phrase);
	if (!m) throw new Error(`pas de relecture dans « ${phrase} »`);
	const somme = m[1].split(' + ').reduce((total, terme) => {
		const produit = new RegExp(`^(\\d+) × (${NOMBRE_ECRIT})$`).exec(terme);
		if (produit) return total + Number(produit[1]) * parseNombreFr(produit[2]);
		const rang = /^(\d+) (.+)$/.exec(terme);
		if (!rang) throw new Error(`terme illisible : « ${terme} »`);
		return total + Number(rang[1]) * 10 ** rangDuNom(rang[2]);
	}, 0);
	return { somme, annonce: parseNombreFr(m[2]) };
}

/* ============================================================
   1. LES CHIFFRES, DANS L'ORDRE DE LA NUMÉRATION
   ============================================================ */
describe('chiffresParRang — unités d’abord', () => {
	it('range les chiffres du plus petit rang au plus grand', () => {
		expect(chiffresParRang(3472)).toEqual([2, 7, 4, 3]);
		expect(chiffresParRang(305)).toEqual([5, 0, 3]);
		expect(chiffresParRang(7)).toEqual([7]);
		expect(chiffresParRang(0)).toEqual([0]);
		expect(chiffresParRang(1000)).toEqual([0, 0, 0, 1]);
	});
});

/* ============================================================
   2. LES QUATRE GESTES, SUR LES EXEMPLES DÉCLARÉS PAR LES LEÇONS
   ============================================================ */
describe('deroulePosition — quatre questions qui se ressemblent, quatre méthodes', () => {
	it('« le chiffre des … » : une seule case, rien à calculer', () => {
		// 3 472 : le chiffre des centaines est le 4 (3e caractère en partant de la droite).
		const d = deroulePosition({ genre: 'chiffre', n: 3472, rang: 2 });
		expect(d.titre).toBe('Le chiffre des centaines de 3472');
		expect(d.pas.length).toBe(2); // poser les rangs, puis lire la case
		const dernier = d.pas[1];
		expect(dernier.phrase).toContain('chiffre des centaines');
		expect(dernier.phrase).toContain("c'est 4");
		expect(dernier.actifs).toEqual([cibleRang(2)]);
		// Une seule case allumée, et rien de masqué : c'est tout le propos de cette question.
		expect(dernier.masques).toBeUndefined();
	});

	it('« combien en tout » : on masque la droite et on relit — 34 centaines, pas 4', () => {
		const contenu = etayagePour(lecon('num-valeur-position'), 'ce2');
		if (contenu?.exemple?.moteur !== 'position') throw new Error('exemple manquant');
		expect(contenu.exemple.spec).toEqual({ genre: 'entout', n: 3472, rang: 2 });
		const d = deroulePosition(contenu.exemple.spec);
		expect(d.titre).toBe('Les centaines de 3472');
		expect(d.pas.length).toBe(3);
		// La confusion est nommée AVANT d'être levée, sinon le déroulé la renforce.
		expect(d.pas[1].phrase).toContain('on ne demande pas le chiffre des centaines');
		expect(d.pas[1].phrase).toContain('4');
		expect(d.pas[1].phrase).toMatch(/TOUT/);
		// 3 472 : 34 centaines (les deux chiffres de gauche), et on cache les deux de droite.
		expect(d.pas[2].phrase).toContain('34 centaines');
		expect(d.pas[2].masques).toEqual([cibleRang(0), cibleRang(1)]);
		expect(d.pas[2].actifs).toEqual([cibleRang(2), cibleRang(3)]);
	});

	it('décomposition en rangs : le terme manquant, puis la relecture qui vérifie', () => {
		const d = deroulePosition({ genre: 'rangs', n: 47, rang: 1 });
		expect(d.titre).toBe('Décomposer 47');
		expect(d.pas.length).toBe(3);
		expect(d.pas[1].phrase).toContain('4 dizaines');
		expect(d.pas[2].phrase).toContain('4 dizaines + 7 unités = 47');
		expect(valeurRelue(d.pas[2].phrase)).toEqual({ somme: 47, annonce: 47 });
	});

	it('décomposition multiplicative : les mêmes valeurs, écrites en produits', () => {
		const contenu = etayagePour(lecon('num-decompose-multiplicative'), 'cm1');
		if (contenu?.exemple?.moteur !== 'position') throw new Error('exemple manquant');
		const spec = contenu.exemple.spec;
		expect(spec.genre).toBe('multiplicative');
		const d = deroulePosition(spec);
		// 48 205, rang des milliers : 8 × 1000. Et la somme des cinq produits fait le nombre.
		expect(d.pas.some((p) => p.phrase.includes('8 × 1000'))).toBe(true);
		const relecture = d.pas[d.pas.length - 1].phrase;
		expect(relecture).toContain(`4 × 10${ESPACE_FINE}000`);
		expect(relecture).toContain('5 × 1');
		expect(valeurRelue(relecture)).toEqual({ somme: 48205, annonce: 48205 });
	});

	it('le zéro intercalaire a sa phrase, et elle nomme un rang qui porte vraiment un 0', () => {
		// 305 : le 0 des dizaines. C'est le point dur de la décomposition à trois chiffres.
		const d = deroulePosition({ genre: 'rangs', n: 305, rang: 2 });
		expect(d.pas.length).toBe(4); // poser, le zéro, le terme manquant, la relecture
		expect(d.pas[1].phrase).toContain('0 des dizaines');
		expect(d.pas[1].phrase).toMatch(/place|rang/);
		expect(d.pas[1].actifs).toEqual([cibleRang(1)]);
		expect(chiffresParRang(305)[1]).toBe(0);
		expect(valeurRelue(d.pas[3].phrase)).toEqual({ somme: 305, annonce: 305 });
		// Un nombre sans zéro n'a pas cette phrase.
		const sansZero = deroulePosition({ genre: 'rangs', n: 3472, rang: 2 });
		expect(sansZero.pas.some((p) => /n'est pas un trou/.test(p.phrase))).toBe(false);
		expect(sansZero.pas.length).toBe(3);
	});

	it('les cinq leçons de numération déclarent un exemple montrable', () => {
		const attendus = [
			{ id: 'num-valeur-position', niveau: 'ce2' as const, genre: 'entout' },
			{ id: 'num-decompose-100', niveau: 'ce2' as const, genre: 'rangs' },
			{ id: 'num-decompose-1000', niveau: 'ce2' as const, genre: 'rangs' },
			{ id: 'num-decompose-10000', niveau: 'ce2' as const, genre: 'rangs' },
			{ id: 'num-decompose-multiplicative', niveau: 'cm1' as const, genre: 'multiplicative' },
		];
		for (const { id, niveau, genre } of attendus) {
			const contenu = etayagePour(lecon(id), niveau);
			if (contenu?.exemple?.moteur !== 'position') throw new Error(`exemple manquant : ${id}`);
			expect(contenu.exemple.spec.genre, id).toBe(genre);
			expect(derouleMontrable(deroulePosition(contenu.exemple.spec)), id).toBe(true);
		}
		// « Je décompose jusqu'à 10 000 » change de plage selon la classe : le CM1 reçoit un
		// exemple à sa mesure (au-delà du millier), pas celui du CE2.
		const ce2 = etayagePour(lecon('num-decompose-10000'), 'ce2');
		const cm1 = etayagePour(lecon('num-decompose-10000'), 'cm1');
		if (ce2?.exemple?.moteur !== 'position' || cm1?.exemple?.moteur !== 'position')
			throw new Error('exemples manquants');
		expect(cm1.exemple.spec.n).toBeGreaterThan(ce2.exemple.spec.n);
		expect(String(ce2.exemple.spec.n).length).toBe(4);
		expect(String(cm1.exemple.spec.n).length).toBeGreaterThan(4);
	});
});

/* ============================================================
   3. DÉGRADATION
   ============================================================ */
describe('deroulePosition — refus propre quand la case n’existe pas', () => {
	it('un rang absent du nombre : déroulé vide', () => {
		// 47 n'a pas de centaines : montrer une case vide serait pire que la règle seule.
		expect(deroulePosition({ genre: 'chiffre', n: 47, rang: 2 }).pas).toEqual([]);
		expect(deroulePosition({ genre: 'rangs', n: 305, rang: 3 }).pas).toEqual([]);
		expect(derouleMontrable(deroulePosition({ genre: 'entout', n: 47, rang: 5 }))).toBe(false);
	});

	it('un rang sans nom (au-delà des millions) : déroulé vide', () => {
		// L'appli ne nomme pas les dizaines de millions : on ne sert pas un mot inventé.
		expect(deroulePosition({ genre: 'rangs', n: 12345678, rang: 7 }).pas).toEqual([]);
		// Le rang des millions, lui, a un nom : il se déroule.
		expect(deroulePosition({ genre: 'rangs', n: 12345678, rang: 6 }).pas.length).toBeGreaterThan(0);
	});
});

/* ============================================================
   4. ÉCHANTILLON — tous les rangs de centaines de nombres
   ============================================================ */
const GENRES: GenrePosition[] = ['chiffre', 'entout', 'rangs', 'multiplicative'];

/* Nombres balayés : une trame régulière (les cas ordinaires) plus des cas durs choisis —
   zéros intercalaires, zéros en série, puissances de 10, rangs élevés. */
const NOMBRES = [
	...Array.from({ length: 280 }, (_, i) => 10 + i * 7),
	305,
	3472,
	48205,
	40205,
	100,
	1000,
	10000,
	100000,
	1000000,
	999999,
	10203,
	90,
	20,
	5001,
	700070,
];

const CAS: PositionSpec[] = [];
for (const n of NOMBRES)
	for (let rang = 0; rang < String(n).length; rang++)
		for (const genre of GENRES) CAS.push({ genre, n, rang });

describe('INVARIANTS sur un large échantillon de nombres', () => {
	it('l’échantillon couvre les quatre genres, les zéros et les grands rangs', () => {
		expect(CAS.length).toBeGreaterThan(3000);
		expect(CAS.some((c) => String(c.n).includes('0') && c.rang > 0)).toBe(true);
		expect(CAS.some((c) => c.rang >= 5)).toBe(true);
		for (const genre of GENRES) expect(CAS.some((c) => c.genre === genre)).toBe(true);
	});

	it('tout chiffre annoncé est le bon, toute décomposition redonne le nombre', () => {
		const fautes: string[] = [];
		for (const spec of CAS) {
			const d = deroulePosition(spec);
			const ou = `${spec.genre}/${spec.n}/rang ${spec.rang}`;
			const faute = (raison: string) => fautes.push(`${ou} — ${raison}`);
			if (!derouleMontrable(d)) {
				faute(`déroulé non montrable (${d.pas.length} pas, plafond ${PAS_MAX})`);
				continue;
			}
			const texte = d.pas.map((p) => p.phrase).join(' ');
			if (texte.includes('undefined')) faute('« undefined » dans une phrase');
			// Le nombre en jeu est nommé quelque part (l'enfant doit savoir de quoi on parle),
			// et écrit comme partout ailleurs dans l'appli.
			if (!texte.includes(formatNombre(spec.n))) faute('le nombre n’est jamais écrit');
			const chiffre = chiffreLu(spec.n, spec.rang);
			if (spec.genre === 'chiffre') {
				const dit = d.pas[d.pas.length - 1].phrase;
				if (!dit.includes(`c'est ${chiffre}.`)) faute(`chiffre annoncé ≠ ${chiffre} : « ${dit} »`);
			}
			if (spec.genre === 'entout') {
				const total = enMasquant(spec.n, spec.rang);
				const dit = d.pas[d.pas.length - 1].phrase;
				// « Il reste 34 : il y a 34 centaines en tout » — les deux nombres sont le total.
				const reste = new RegExp(`Il reste (${NOMBRE_ECRIT})`).exec(dit);
				const enTout = new RegExp(`il y a (${NOMBRE_ECRIT})`).exec(dit);
				if (!reste || parseNombreFr(reste[1]) !== total) faute(`« il reste » ≠ ${total}`);
				if (!enTout || parseNombreFr(enTout[1]) !== total) faute(`« il y a » ≠ ${total}`);
				// Et l'avertissement cite le CHIFFRE, celui qu'on confond avec le total.
				if (!d.pas[d.pas.length - 2].phrase.includes(`qui est ${chiffre}`))
					faute(`le chiffre du rang n'est pas opposé au total (${chiffre})`);
			}
			if (spec.genre === 'rangs' || spec.genre === 'multiplicative') {
				const { somme, annonce } = valeurRelue(d.pas[d.pas.length - 1].phrase);
				if (somme !== spec.n) faute(`décomposition = ${somme}`);
				if (annonce !== spec.n) faute(`total annoncé = ${annonce}`);
			}
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('la phrase du zéro n’apparaît que s’il y a un zéro, et elle désigne sa case', () => {
		const fautes: string[] = [];
		for (const spec of CAS) {
			const d = deroulePosition(spec);
			if (!d.pas.length) continue;
			const chiffres = chiffresParRang(spec.n);
			// Un zéro NON de tête, s'il y en a un : le module n'en nomme qu'un (deux phrases
			// diraient deux fois la même chose).
			const attendu = chiffres.slice(0, -1).some((c) => c === 0);
			const pas = d.pas.filter((p) => /n'est pas un trou/.test(p.phrase));
			if (attendu !== pas.length > 0) {
				fautes.push(`${spec.n} — phrase du zéro ${pas.length ? 'en trop' : 'manquante'}`);
				continue;
			}
			if (!pas.length) continue;
			if (pas.length > 1) fautes.push(`${spec.n} — ${pas.length} phrases pour les zéros`);
			const cible = pas[0].actifs?.[0];
			const index = chiffres.findIndex((_, r) => cibleRang(r) === cible);
			if (index < 0 || chiffres[index] !== 0)
				fautes.push(`${spec.n} — « ${cible} » ne porte pas un 0`);
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('ce qu’on masque et ce qu’on montre ne se chevauchent jamais, et couvrent le nombre', () => {
		for (const n of [3472, 48205, 305, 1000000]) {
			for (let rang = 0; rang < String(n).length; rang++) {
				const d = deroulePosition({ genre: 'entout', n, rang });
				if (!d.pas.length) continue;
				const dernier = d.pas[d.pas.length - 1];
				const masques = new Set(dernier.masques ?? []);
				const actifs = new Set(dernier.actifs ?? []);
				const ou = `${n} / rang ${rang}`;
				for (const a of actifs) expect(masques.has(a), `${ou} : ${a} caché ET montré`).toBe(false);
				expect(masques.size + actifs.size, ou).toBe(String(n).length);
			}
		}
	});

	/* ---------- Accords : le français d'une phrase servie à un enfant ----------
	   Ces deux cas ne sont pas atteignables par les exemples DÉCLARÉS aujourd'hui (3 472,
	   47, 305, 48 205), mais le module est générique : changer un nombre dans
	   data/maths/position.ts suffit à les faire sortir. Cf. rapport — ⚠ ROUGES en l'état. */
	it('⚠ ACCORD : « aucun millier », jamais « aucune millier »', () => {
		// La phrase du zéro écrit « il n'y a aucune <rang au singulier> ». Deux rangs sont
		// MASCULINS (millier, million) : l'article doit s'accorder. Déclencheurs : un 0 au
		// rang des milliers (40 205, 10 203, 10 000…).
		const fautes: string[] = [];
		for (const spec of CAS) {
			const pas = deroulePosition(spec).pas.find((p) => /n'est pas un trou/.test(p.phrase));
			if (!pas) continue;
			for (const { singulier, masculin } of RANGS)
				if (masculin && pas.phrase.includes(`aucune ${singulier}`))
					fautes.push(`${spec.n} — « aucune ${singulier} »`);
		}
		expect([...new Set(fautes)].slice(0, 3)).toEqual([]);
	});

	it('⚠ ACCORD : « il y a 1 dizaine en tout », jamais « 1 dizaines »', () => {
		// « Combien en tout » écrit toujours le rang au PLURIEL, y compris quand il n'y en a
		// qu'un (nombres à 2 chiffres commençant par 1, rang des dizaines : « 17 → il y a 1
		// dizaines en tout »).
		const fautes: string[] = [];
		for (const spec of CAS) {
			if (spec.genre !== 'entout') continue;
			const d = deroulePosition(spec);
			if (!d.pas.length) continue;
			const total = enMasquant(spec.n, spec.rang);
			if (total !== 1) continue;
			const dit = d.pas[d.pas.length - 1].phrase;
			const { singulier, pluriel } = RANGS[spec.rang];
			if (!dit.includes(`1 ${singulier} en tout`))
				fautes.push(`${spec.n}/rang ${spec.rang} — « 1 ${pluriel} en tout »`);
		}
		expect([...new Set(fautes)].slice(0, 3)).toEqual([]);
	});
});
