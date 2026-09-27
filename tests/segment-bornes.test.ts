/* ============================================================
   Diagnostic d'un segment mal délimité — `src/core/segment-bornes.ts` (#716).

   Critère 6 de #716 : « après une erreur, l'enfant voit où était la frontière
   juste », dont le cas d'échec est « l'enfant ne sait pas s'il a pris un mot de
   trop ou oublié le déterminant ». Traduit ici en une exigence vérifiable :
   **le message doit porter assez d'information pour qu'on RETROUVE le segment
   attendu à partir du segment choisi**. C'est ce que `reconstruire()` éprouve,
   sur les 1 296 paires de segments d'une phrase de huit mots.

   Pourquoi relire le sens plutôt que comparer des chaînes : figer la
   formulation exacte (« tu as pris un mot de trop au début ») ferait rougir le
   jour où on la reformule sans rien casser. L'exigence, c'est l'information
   transportée — combien de mots, de quel côté, dans quel sens ; la phrase n'en
   est qu'un véhicule. Les contrôles de ce fichier sont donc des lecteurs, et le
   dernier `describe` vérifie qu'ils MORDENT (témoins fabriqués), faute de quoi
   un balayage vert ne prouverait rien.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { ecartBornes, intervalleDe, type Intervalle } from '../src/core/segment-bornes';

const iv = (debut: number, fin: number): Intervalle => ({ debut, fin });

/* ---------------------------------------------------------------------------
   Lecture sémantique d'un diagnostic
   --------------------------------------------------------------------------- */

type Sens = 'trop' | 'manque';
type Cote = 'debut' | 'fin';

interface Proposition {
	sens: Sens;
	cote: Cote;
	compte: number;
}

/** Le nombre de mots annoncé, dans les deux écritures possibles du compte
    (« un mot », « 3 mots »). L'ACCORD, lui, est jugé à part par
    `defautsDeForme` : ici on veut pouvoir relire même une phrase mal accordée,
    sinon un défaut d'accord se déguiserait en défaut de reconstruction. */
function compteDe(texte: string): number | null {
	const chiffres = /(-?\d+)\s+mots?\b/.exec(texte);
	if (chiffres) return Number(chiffres[1]);
	if (/\bun mot\b/.test(texte)) return 1;
	return null;
}

/** Ce qu'une proposition DIT : un sens de glissement, un côté, un nombre de
    mots. `null` si la proposition ne porte pas les trois. */
function lireProposition(texte: string): Proposition | null {
	const t = texte.toLowerCase();
	const sens: Sens | null = /trop/.test(t) ? 'trop' : /manqu/.test(t) ? 'manque' : null;
	const cote: Cote | null = /début/.test(t) ? 'debut' : /\bfin\b/.test(t) ? 'fin' : null;
	const compte = compteDe(t);
	if (sens === null || cote === null || compte === null) return null;
	return { sens, cote, compte };
}

function propositions(phrase: string): Proposition[] {
	return phrase
		.replace(/\.$/, '')
		.split(' et ')
		.map((morceau) => lireProposition(morceau))
		.filter((p): p is Proposition => p !== null);
}

/** Le segment attendu, retrouvé à partir du segment CHOISI et du seul message.
    Rend une explication (chaîne) quand le message ne se laisse pas relire comme
    un diagnostic de bornes exploitable. */
function reconstruire(choisi: Intervalle, phrase: string): Intervalle | string {
	const morceaux = phrase.replace(/\.$/, '').split(' et ');
	let debut = choisi.debut;
	let fin = choisi.fin;
	const vus = new Set<Cote>();
	for (const morceau of morceaux) {
		const p = lireProposition(morceau);
		if (!p) return `proposition illisible : « ${morceau} »`;
		if (vus.has(p.cote)) return `le côté « ${p.cote} » est corrigé deux fois`;
		vus.add(p.cote);
		// « de trop au début » : l'enfant a commencé AVANT, donc le début attendu est
		// plus loin. « il manque au début » : il a commencé APRÈS, le début recule.
		if (p.cote === 'debut') debut += p.sens === 'trop' ? p.compte : -p.compte;
		else fin += p.sens === 'trop' ? -p.compte : p.compte;
	}
	return { debut, fin };
}

/* ---------------------------------------------------------------------------
   Forme de la phrase rendue
   --------------------------------------------------------------------------- */

const MAJUSCULE = /[A-ZÀ-ÖØ-Þ]/;

/** Ce qui empêcherait le message d'être lu tel quel par un enfant, ou recopié
    dans la ligne de statut qui l'enchâsse (`Ce n'est pas ça. <ici> Le groupe
    nominal : …`). Liste vide = rien à redire. */
function defautsDeForme(phrase: string): string[] {
	const d: string[] = [];
	if (!phrase.trim()) d.push('phrase vide');
	if (phrase !== phrase.trim()) d.push('espace en bordure');
	if (/ {2}/.test(phrase)) d.push('espace double');
	if (!MAJUSCULE.test(phrase.charAt(0))) d.push('pas de majuscule initiale');
	if (MAJUSCULE.test(phrase.slice(1))) d.push('majuscule en milieu de phrase');
	if (!phrase.endsWith('.')) d.push('pas de point final');
	if (phrase.slice(0, -1).includes('.')) d.push('plusieurs phrases');
	// Convention du projet : apostrophe droite dans les textes de l'appli.
	if (phrase.includes('’')) d.push('apostrophe typographique');
	if (/\b[01] mots?\b/.test(phrase)) d.push('compte en chiffres au lieu de « un mot »');
	if (/-\d/.test(phrase)) d.push('compte négatif');
	return d;
}

/* Toutes les délimitations possibles d'une phrase de huit mots : 36 segments,
   donc 1 296 couples (choisi, attendu) — assez pour couvrir chaque géométrie
   (inclus, englobant, décalé, adjacent, lointain, d'un seul mot). */
const TAILLE = 8;
const TOUS: Intervalle[] = [];
for (let debut = 0; debut < TAILLE; debut++) {
	for (let fin = debut; fin < TAILLE; fin++) TOUS.push(iv(debut, fin));
}

const identiques = (a: Intervalle, b: Intervalle): boolean =>
	a.debut === b.debut && a.fin === b.fin;
const seChevauchent = (a: Intervalle, b: Intervalle): boolean =>
	a.fin >= b.debut && a.debut <= b.fin;

/* ===========================================================================
   intervalleDe
   =========================================================================== */

describe('intervalleDe — le segment couvert par un geste à deux bornes', () => {
	it('un ensemble vide ne délimite aucun segment', () => {
		expect(intervalleDe([])).toBeNull();
	});

	it("l'indice 0 n'est pas confondu avec l'absence de choix", () => {
		// Le premier mot de la phrase est un indice parfaitement valide.
		expect(intervalleDe([0])).toEqual(iv(0, 0));
	});

	it('un seul indice donne un segment d’un mot', () => {
		expect(intervalleDe([3])).toEqual(iv(3, 3));
	});

	it('les indices n’ont pas à être triés', () => {
		expect(intervalleDe([5, 2, 9])).toEqual(iv(2, 9));
		expect(intervalleDe([9, 2, 5])).toEqual(iv(2, 9));
	});

	it('un indice répété ne décale pas les bornes', () => {
		expect(intervalleDe([4, 4, 4])).toEqual(iv(4, 4));
		expect(intervalleDe([2, 7, 2])).toEqual(iv(2, 7));
	});

	it('des indices non contigus sont lus comme le segment qui les COUVRE', () => {
		// Contrat assumé : on ne garde que les deux extrêmes, le trou est inclus.
		expect(intervalleDe([1, 5])).toEqual(iv(1, 5));
	});

	it('la lecture n’altère pas le tableau reçu', () => {
		const indices = [7, 1, 4];
		intervalleDe(indices);
		expect(indices).toEqual([7, 1, 4]);
	});
});

/* ===========================================================================
   ecartBornes — rien à dire
   =========================================================================== */

describe('ecartBornes — les cas où il n’y a rien à diagnostiquer', () => {
	it('aucun mot choisi : pas d’écart de bornes à décrire', () => {
		expect(ecartBornes(null, iv(2, 4))).toBeNull();
	});

	it('les deux segments coïncident', () => {
		expect(ecartBornes(iv(2, 4), iv(2, 4))).toBeNull();
	});

	it('les deux segments coïncident sur un seul mot', () => {
		expect(ecartBornes(iv(3, 3), iv(3, 3))).toBeNull();
	});
});

/* ===========================================================================
   ecartBornes — un seul bord a glissé
   =========================================================================== */

describe('ecartBornes — un seul bord a glissé', () => {
	it('commencé trop tôt : des mots de trop AU DÉBUT', () => {
		const choisi = iv(1, 5);
		const attendu = iv(3, 5);
		const phrase = ecartBornes(choisi, attendu);
		expect(phrase).not.toBeNull();
		expect(propositions(phrase!)).toEqual([{ sens: 'trop', cote: 'debut', compte: 2 }]);
		expect(reconstruire(choisi, phrase!)).toEqual(attendu);
		expect(defautsDeForme(phrase!)).toEqual([]);
	});

	it('commencé trop tard : des mots manquants AU DÉBUT', () => {
		const choisi = iv(4, 6);
		const attendu = iv(2, 6);
		const phrase = ecartBornes(choisi, attendu);
		expect(propositions(phrase!)).toEqual([{ sens: 'manque', cote: 'debut', compte: 2 }]);
		expect(reconstruire(choisi, phrase!)).toEqual(attendu);
	});

	it('arrêté trop tard : des mots de trop À LA FIN', () => {
		const choisi = iv(1, 5);
		const attendu = iv(1, 2);
		const phrase = ecartBornes(choisi, attendu);
		expect(propositions(phrase!)).toEqual([{ sens: 'trop', cote: 'fin', compte: 3 }]);
		expect(reconstruire(choisi, phrase!)).toEqual(attendu);
	});

	it('arrêté trop tôt : des mots manquants À LA FIN', () => {
		const choisi = iv(1, 2);
		const attendu = iv(1, 5);
		const phrase = ecartBornes(choisi, attendu);
		expect(propositions(phrase!)).toEqual([{ sens: 'manque', cote: 'fin', compte: 3 }]);
		expect(reconstruire(choisi, phrase!)).toEqual(attendu);
	});

	it('un bord immobile n’est jamais évoqué', () => {
		// Le début est juste : le message ne doit pas en parler, sans quoi l'enfant
		// corrigerait un bord qui n'a pas bougé.
		const phrase = ecartBornes(iv(1, 2), iv(1, 5));
		expect(phrase).not.toBeNull();
		expect(phrase!.toLowerCase()).not.toContain('début');
		expect(propositions(phrase!)).toHaveLength(1);
	});

	it('l’écart d’un seul mot se dit « un mot », pas « 1 mot » (les quatre sens)', () => {
		const cas: Array<[Intervalle, Intervalle]> = [
			[iv(2, 5), iv(3, 5)], // un de trop au début
			[iv(3, 5), iv(2, 5)], // un manquant au début
			[iv(2, 5), iv(2, 4)], // un de trop à la fin
			[iv(2, 4), iv(2, 5)], // un manquant à la fin
		];
		for (const [choisi, attendu] of cas) {
			const phrase = ecartBornes(choisi, attendu);
			expect(phrase).not.toBeNull();
			expect(phrase!).toContain('un mot');
			expect(phrase!).not.toMatch(/\b1 mot/);
			expect(propositions(phrase!)).toHaveLength(1);
			expect(propositions(phrase!)[0].compte).toBe(1);
		}
	});

	it('au-delà d’un mot, le compte s’accorde au pluriel', () => {
		const cas: Array<[Intervalle, Intervalle, number]> = [
			[iv(0, 5), iv(3, 5), 3],
			[iv(3, 5), iv(0, 5), 3],
			[iv(0, 5), iv(0, 3), 2],
			[iv(0, 3), iv(0, 5), 2],
		];
		for (const [choisi, attendu, compte] of cas) {
			const phrase = ecartBornes(choisi, attendu);
			expect(phrase!).toContain(`${compte} mots`);
			expect(propositions(phrase!)[0].compte).toBe(compte);
		}
	});
});

/* ===========================================================================
   ecartBornes — les deux bords ont glissé
   =========================================================================== */

describe('ecartBornes — les deux bords ont glissé', () => {
	it('segment trop large des deux côtés', () => {
		const choisi = iv(0, 6);
		const attendu = iv(2, 4);
		const phrase = ecartBornes(choisi, attendu);
		expect(propositions(phrase!)).toEqual([
			{ sens: 'trop', cote: 'debut', compte: 2 },
			{ sens: 'trop', cote: 'fin', compte: 2 },
		]);
		expect(reconstruire(choisi, phrase!)).toEqual(attendu);
	});

	it('segment trop étroit des deux côtés', () => {
		const choisi = iv(3, 4);
		const attendu = iv(1, 6);
		const phrase = ecartBornes(choisi, attendu);
		expect(propositions(phrase!)).toEqual([
			{ sens: 'manque', cote: 'debut', compte: 2 },
			{ sens: 'manque', cote: 'fin', compte: 2 },
		]);
		expect(reconstruire(choisi, phrase!)).toEqual(attendu);
	});

	it('segment entier décalé d’un cran : un mot de trop d’un côté, un manquant de l’autre', () => {
		const choisi = iv(0, 2);
		const attendu = iv(1, 3);
		const phrase = ecartBornes(choisi, attendu);
		expect(propositions(phrase!)).toEqual([
			{ sens: 'trop', cote: 'debut', compte: 1 },
			{ sens: 'manque', cote: 'fin', compte: 1 },
		]);
		expect(reconstruire(choisi, phrase!)).toEqual(attendu);
	});

	it('les deux propositions se lisent comme UNE seule phrase', () => {
		const phrase = ecartBornes(iv(0, 6), iv(2, 4));
		expect(phrase).not.toBeNull();
		// Une majuscule à l'entrée, aucune au milieu, un seul point, tout à la fin.
		expect(defautsDeForme(phrase!)).toEqual([]);
		expect(phrase!).toContain(' et ');
		expect(phrase!.split('.').filter(Boolean)).toHaveLength(1);
	});

	it('le début est traité avant la fin, dans l’ordre de lecture de la phrase', () => {
		const phrase = ecartBornes(iv(0, 6), iv(2, 4))!;
		expect(phrase.toLowerCase().indexOf('début')).toBeLessThan(phrase.toLowerCase().indexOf('fin'));
	});
});

/* ===========================================================================
   ecartBornes — frontière entre « cherché ailleurs » et « un bord a glissé »
   =========================================================================== */

describe('ecartBornes — frontière entre « ailleurs » et « un bord a glissé »', () => {
	const AILLEURS = ecartBornes(iv(0, 1), iv(4, 6));

	it('deux segments qui se TOUCHENT sans mot commun sont « ailleurs », des deux côtés', () => {
		// Fin du choisi juste avant le début attendu, puis l'inverse.
		expect(ecartBornes(iv(0, 1), iv(2, 4))).toBe(AILLEURS);
		expect(ecartBornes(iv(5, 7), iv(2, 4))).toBe(AILLEURS);
	});

	it('« ailleurs » ne parle pas de bornes : il n’y aurait rien à recadrer', () => {
		expect(AILLEURS).not.toBeNull();
		expect(propositions(AILLEURS!)).toEqual([]);
		expect(AILLEURS!.toLowerCase()).not.toContain('mot');
		expect(defautsDeForme(AILLEURS!)).toEqual([]);
	});

	it('UN SEUL mot commun suffit à parler de bornes', () => {
		const choisi = iv(0, 2);
		const attendu = iv(2, 4);
		const phrase = ecartBornes(choisi, attendu);
		expect(phrase).not.toBe(AILLEURS);
		expect(propositions(phrase!)).toHaveLength(2);
		expect(reconstruire(choisi, phrase!)).toEqual(attendu);
	});

	it('un segment d’un seul mot posé SUR une borne attendue se diagnostique', () => {
		const choisi = iv(2, 2);
		const attendu = iv(2, 4);
		const phrase = ecartBornes(choisi, attendu);
		expect(propositions(phrase!)).toEqual([{ sens: 'manque', cote: 'fin', compte: 2 }]);
		expect(reconstruire(choisi, phrase!)).toEqual(attendu);
	});

	it('un segment d’un seul mot posé juste à CÔTÉ est « ailleurs »', () => {
		// Un mot d'écart suffit à sortir du segment : plus aucun mot commun.
		expect(ecartBornes(iv(1, 1), iv(2, 4))).toBe(AILLEURS);
		expect(ecartBornes(iv(5, 5), iv(2, 4))).toBe(AILLEURS);
	});

	it('« ailleurs » l’emporte même quand les deux bords ont glissé', () => {
		// Sans mot commun, dire « tu as pris 4 mots de trop au début » serait absurde.
		expect(ecartBornes(iv(0, 0), iv(5, 7))).toBe(AILLEURS);
	});
});

/* ===========================================================================
   Balayage : toutes les paires de segments d'une phrase de huit mots
   =========================================================================== */

describe('ecartBornes — balayage de toutes les paires d’une phrase de huit mots', () => {
	it('le diagnostic est nul exactement quand les deux segments coïncident', () => {
		let nuls = 0;
		for (const choisi of TOUS) {
			for (const attendu of TOUS) {
				const phrase = ecartBornes(choisi, attendu);
				if (identiques(choisi, attendu)) {
					expect(phrase, `${choisi.debut}-${choisi.fin} identique`).toBeNull();
					nuls++;
				} else {
					expect(
						phrase,
						`choisi ${choisi.debut}-${choisi.fin}, attendu ${attendu.debut}-${attendu.fin}`,
					).not.toBeNull();
				}
			}
		}
		expect(nuls).toBe(TOUS.length);
	});

	it('toute phrase rendue est bien formée', () => {
		for (const choisi of TOUS) {
			for (const attendu of TOUS) {
				const phrase = ecartBornes(choisi, attendu);
				if (!phrase) continue;
				expect(
					defautsDeForme(phrase),
					`choisi ${choisi.debut}-${choisi.fin}, attendu ${attendu.debut}-${attendu.fin} : « ${phrase} »`,
				).toEqual([]);
			}
		}
	});

	it('critère 6 : le message suffit à retrouver la frontière juste', () => {
		let vus = 0;
		for (const choisi of TOUS) {
			for (const attendu of TOUS) {
				if (identiques(choisi, attendu) || !seChevauchent(choisi, attendu)) continue;
				const phrase = ecartBornes(choisi, attendu);
				expect(
					reconstruire(choisi, phrase!),
					`choisi ${choisi.debut}-${choisi.fin}, attendu ${attendu.debut}-${attendu.fin} : « ${phrase} »`,
				).toEqual(attendu);
				vus++;
			}
		}
		// Compté par l'énumération ci-dessus, pas par le module : une boucle vide
		// passerait sinon en silence.
		expect(vus).toBe(840);
	});

	it('sans mot commun, le message est toujours le même et ne parle jamais de bornes', () => {
		const distincts = new Set<string>();
		let vus = 0;
		for (const choisi of TOUS) {
			for (const attendu of TOUS) {
				if (seChevauchent(choisi, attendu)) continue;
				const phrase = ecartBornes(choisi, attendu)!;
				distincts.add(phrase);
				expect(propositions(phrase)).toEqual([]);
				vus++;
			}
		}
		expect(vus).toBe(420);
		expect(distincts.size).toBe(1);
	});
});

/* ===========================================================================
   Vacuité : les contrôles de ce fichier mordent-ils ?
   =========================================================================== */

describe('Les contrôles de ce fichier mordent (témoins fabriqués)', () => {
	it('defautsDeForme signale chaque défaut annoncé', () => {
		expect(defautsDeForme('tu as pris un mot de trop au début.')).toContain(
			'pas de majuscule initiale',
		);
		expect(defautsDeForme('Tu as pris un mot de trop au début')).toContain('pas de point final');
		expect(
			defautsDeForme('Il manque un mot au début. Tu as pris un mot de trop à la fin.'),
		).toContain('plusieurs phrases');
		expect(defautsDeForme('Il manque un mot au début Et il manque un mot à la fin.')).toContain(
			'majuscule en milieu de phrase',
		);
		expect(defautsDeForme('Il manque 1 mot au début.')).toContain(
			'compte en chiffres au lieu de « un mot »',
		);
		expect(defautsDeForme('Il manque -2 mots au début.')).toContain('compte négatif');
		expect(defautsDeForme('Ce n’est pas au bon endroit dans la phrase.')).toContain(
			'apostrophe typographique',
		);
		expect(defautsDeForme('Il manque  un mot au début.')).toContain('espace double');
		expect(defautsDeForme(' Il manque un mot au début. ')).toContain('espace en bordure');
		expect(defautsDeForme('')).toContain('phrase vide');
	});

	it('defautsDeForme laisse passer les phrases correctes (il ne dit pas non à tout)', () => {
		expect(defautsDeForme('Il manque un mot au début.')).toEqual([]);
		expect(
			defautsDeForme('Tu as pris 2 mots de trop au début et il manque un mot à la fin.'),
		).toEqual([]);
		expect(defautsDeForme("Ce n'est pas au bon endroit dans la phrase.")).toEqual([]);
	});

	it('reconstruire rejette un diagnostic dont le SENS est inversé', () => {
		const choisi = iv(1, 5);
		const attendu = iv(3, 5); // deux mots de trop au début
		expect(reconstruire(choisi, 'Il manque 2 mots au début.')).not.toEqual(attendu);
	});

	it('reconstruire rejette un diagnostic dont le CÔTÉ est inversé', () => {
		const choisi = iv(1, 5);
		const attendu = iv(3, 5);
		expect(reconstruire(choisi, 'Tu as pris 2 mots de trop à la fin.')).not.toEqual(attendu);
	});

	it('reconstruire rejette un diagnostic dont le COMPTE est décalé d’un mot', () => {
		const choisi = iv(1, 5);
		const attendu = iv(3, 5);
		expect(reconstruire(choisi, 'Tu as pris 3 mots de trop au début.')).not.toEqual(attendu);
	});

	it('reconstruire rejette un message qui ne dit pas l’écart', () => {
		expect(reconstruire(iv(1, 5), "Ce n'est pas ça.")).toMatch(/^proposition illisible/);
		expect(reconstruire(iv(1, 5), 'Il manque un mot au début et il manque un mot au début.')).toBe(
			'le côté « debut » est corrigé deux fois',
		);
	});

	it('reconstruire accepte une reformulation qui garde l’information', () => {
		// Ce que le contrôle NE doit pas interdire : une autre façon de le dire.
		expect(reconstruire(iv(1, 5), 'Tu en as pris 2 mots en trop tout au début.')).toEqual(iv(3, 5));
	});
});
