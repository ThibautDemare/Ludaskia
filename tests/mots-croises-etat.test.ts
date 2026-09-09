/* ============================================================
   Mots croisés (#665) — L'ÉTAT PERSISTÉ (critères 37, 38, 39, 40).

   Écrit AVANT l'implémentation. `src/core/jeux/mots-croises-etat.ts` n'existe
   pas encore : ce fichier est ROUGE À L'IMPORT, et c'est le résultat attendu.

   ── LE CONTRAT QUE CES TESTS FIGENT ─────────────────────────────────────────

     // src/core/jeux/mots-croises-etat.ts
     export const CLE_MOTS_CROISES_PARTIE = 'ludaskia_jeux_mots-croises_partie';

     export function partieEnCours(): PartieMotsCroises | null;  // validée à la LECTURE
     export function sauverPartie(p: PartieMotsCroises): void;
     export function effacerPartie(): void;

   **UNE seule clé**, et c'est un point de contrat, pas une économie. Les mots
   casés en ont deux parce que l'enfant y choisit une taille ; ici il ne choisit
   rien (l'issue ne demande aucun format), donc toute clé supplémentaire serait
   une MÉMOIRE de plus — un compteur de grilles finies, une série de grilles
   enchaînées (critère 43), un record (critère 42). Sans mémoire, il n'y a ni
   palier ni score possible. Une deuxième clé se déclare ici, avec sa raison.

   **La forme rangée sous la clé n'est PAS contrainte.** Aucun test d'ici ne la
   suppose : les cas de donnée bricolée passent soit par le sommet de la clé (une
   chaîne, un nombre), soit par un PARCOURS EN PROFONDEUR de la valeur réellement
   écrite, où l'on remplace une chaîne connue par une autre. Un test qui
   devinerait la forme serait vert ou rouge selon la chance. Et chaque parcours
   vérifie qu'il a bien MODIFIÉ quelque chose : sans ça, un stockage qui
   n'écrirait pas les mots rendrait ces tests verts sans rien tenir.

   ── CE QUE CE FICHIER NE COUVRE PAS ─────────────────────────────────────────

   • La moitié POSITIVE du critère 38 — « la sauvegarde a lieu à chaque lettre
     posée ou effacée » — dépend de QUI appelle `sauverPartie` et QUAND : c'est le
     runner, et ça se voit en rechargeant la page, donc en Playwright. Ce qui se
     tient ici, c'est la condition sans laquelle cette sauvegarde ne servirait à
     rien : une grille sauvée en cours de mot se relit lettre pour lettre. La
     moitié négative (ne pas s'accrocher à `beforeunload`) est dans
     `mots-croises-gate.test.ts`.
   • « La grille survit au PLAFOND atteint » (critère 37) se joue à l'écran : le
     plafond n'est pas consulté ici — et qu'il ne le soit jamais est tenu
     statiquement par le gate, qui interdit à ce module d'importer
     `jeux/plafond` et `jeux/etat`.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	CLE_MOTS_CROISES_PARTIE,
	effacerPartie,
	partieEnCours,
	sauverPartie,
} from '../src/core/jeux/mots-croises-etat';
import {
	ecrire,
	etatMot,
	lettreEn,
	partieGagnee,
	tirerGrille,
	vivierMotsCroises,
	type PartieMotsCroises,
} from '../src/core/jeux/mots-croises';
import { casesDe } from '../src/core/jeux/grille-mots';
import { meilleurScore } from '../src/core/jeux/etat';
import {
	activeProfile,
	addProfile,
	initProfiles,
	setActiveProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import { appKeys, lsGet, lsSet, setOnDataWrite } from '../src/core/storage';
import { getXP } from '../src/core/progress';
import { tirage } from './aleatoire';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const NFC = (s: string): string => s.normalize('NFC');
const lettres = (mot: string): string[] => [...NFC(mot)];
const bas = (s: string): string => NFC(s).toLowerCase();

/** Toutes les cases du motif, dans un ordre stable. */
const casesToutes = (p: PartieMotsCroises): { ligne: number; colonne: number }[] =>
	p.motif.emplacements.flatMap((e) => casesDe(e));

/** Deux parties sont-elles la MÊME partie, vue de l'enfant ? Comparaison
    OBSERVABLE (dessin, solution, lettres case par case) et non structurelle :
    la forme interne de la saisie appartient à l'implémentation. */
function memeEtat(a: PartieMotsCroises | null, b: PartieMotsCroises | null): string[] {
	if (!a || !b) return [`une des deux parties est nulle (a=${String(!!a)}, b=${String(!!b)})`];
	const ecarts: string[] = [];
	if (a.motif.id !== b.motif.id) ecarts.push(`motif ${a.motif.id} ≠ ${b.motif.id}`);
	if (a.solution.map(bas).join(',') !== b.solution.map(bas).join(',')) {
		ecarts.push(`solution [${a.solution.join(',')}] ≠ [${b.solution.join(',')}]`);
	}
	for (const c of casesToutes(a)) {
		const la = lettreEn(a, c.ligne, c.colonne);
		const lb = lettreEn(b, c.ligne, c.colonne);
		if (bas(la ?? '') !== bas(lb ?? '')) {
			ecarts.push(
				`case ${String(c.ligne)},${String(c.colonne)} : « ${la ?? '∅'} » ≠ « ${lb ?? '∅'} »`,
			);
		}
	}
	return ecarts;
}

/** Une partie ENTAMÉE : un mot juste, plus trois lettres d'un autre mot. Assez
    pour que la relecture ait quelque chose à perdre. */
function entamee(graine = 4): PartieMotsCroises {
	const p = tirerGrille(tirage(graine));
	let courante = p;
	casesDe(p.motif.emplacements[0]).forEach((c, k) => {
		courante = ecrire(courante, c.ligne, c.colonne, lettres(p.solution[0])[k]);
	});
	casesDe(p.motif.emplacements[1])
		.slice(0, 3)
		.forEach((c, k) => {
			courante = ecrire(courante, c.ligne, c.colonne, lettres(p.solution[1])[k]);
		});
	return courante;
}

/** Une partie GAGNÉE : la solution écrite en entier. */
function gagnee(graine = 4): PartieMotsCroises {
	const p = tirerGrille(tirage(graine));
	let courante = p;
	p.solution.forEach((mot, i) => {
		casesDe(p.motif.emplacements[i]).forEach((c, k) => {
			courante = ecrire(courante, c.ligne, c.colonne, lettres(mot)[k]);
		});
	});
	return courante;
}

/* ---------- Bricoler la valeur stockée, sans en connaître la forme ---------- */

function remplacerPartout(valeur: unknown, avant: string, apres: string): unknown {
	if (typeof valeur === 'string') return valeur === avant ? apres : valeur;
	if (Array.isArray(valeur)) return valeur.map((v) => remplacerPartout(v, avant, apres));
	if (valeur && typeof valeur === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(valeur)) out[k] = remplacerPartout(v, avant, apres);
		return out;
	}
	return valeur;
}

/** Remplace une chaîne dans la partie stockée ; rend `true` si ça a bougé. */
function bricoler(avant: string, apres: string): boolean {
	const brut = lsGet(CLE_MOTS_CROISES_PARTIE, null) as unknown;
	const modifie = remplacerPartout(brut, avant, apres);
	const change = JSON.stringify(modifie) !== JSON.stringify(brut);
	lsSet(CLE_MOTS_CROISES_PARTIE, modifie);
	return change;
}

describe('#665 critère 40 — la clé de stockage', () => {
	it('commence par « ludaskia_jeux_ »', () => {
		/* Cas d'échec littéral : « cles-stockage-gate.test.ts échoue ». Ce gate-là
		   est générique et statique ; ici on nomme le critère, pour qu'un échec dise
		   « la clé des mots croisés » et pas « une clé quelque part dans src/ ». */
		expect(CLE_MOTS_CROISES_PARTIE.startsWith('ludaskia_jeux_')).toBe(true);
		expect(CLE_MOTS_CROISES_PARTIE.startsWith('ludaskia_jeux_mots-croises_')).toBe(true);
	});

	it('entre dans l’export de sauvegarde et disparaît avec le profil', () => {
		// `appKeys()` filtre sur `ludaskia_`, et c'est ce filtre qui alimente l'export
		// du parent ET la suppression d'un profil. On éprouve la conséquence
		// observable : la donnée est bien rangée sous le profil actif.
		sauverPartie(entamee());
		expect(appKeys().some((k) => k.includes(CLE_MOTS_CROISES_PARTIE))).toBe(true);
	});
});

describe('#665 critère 37 — la grille en cours survit', () => {
	it('n’a rien en cours sur un profil neuf', () => {
		expect(partieEnCours()).toBeNull();
	});

	it('rend la grille exactement telle qu’on l’a laissée', () => {
		/* Cas d'échec littéral : « revenir après le plafond sert une grille vide ».
		   Avec un plafond de quelques minutes par jour, une grille de six définitions
		   ne se finit pas en une session : repartir de zéro serait le cas NORMAL, et
		   une perte non consentie. */
		const p = entamee();
		sauverPartie(p);
		expect(memeEtat(partieEnCours(), p)).toEqual([]);
	});

	it('la rend encore à la relecture suivante (rien ne se consomme)', () => {
		sauverPartie(entamee());
		expect(partieEnCours()).not.toBeNull();
		expect(partieEnCours()).not.toBeNull();
	});

	it('remplace la précédente au lieu d’empiler', () => {
		sauverPartie(entamee(4));
		const suivante = entamee(9);
		sauverPartie(suivante);
		expect(memeEtat(partieEnCours(), suivante)).toEqual([]);
	});

	it('libère la place quand on l’efface', () => {
		sauverPartie(entamee());
		effacerPartie();
		expect(partieEnCours()).toBeNull();
	});

	it('reste propre au profil actif', () => {
		// Une grille partagée entre frères et sœurs, c'est l'un qui finit celle de
		// l'autre. Le préfixe de profil est posé par `lsGet`/`lsSet` ; ce qu'on
		// vérifie ici, c'est que ce module passe bien par eux.
		const p = entamee(4);
		sauverPartie(p);
		const aine = activeProfile()?.uuid ?? '';
		addProfile('Cadette');
		expect(partieEnCours()).toBeNull();
		setActiveProfile(aine);
		expect(memeEtat(partieEnCours(), p)).toEqual([]);
	});
});

describe('#665 critère 38 — ce que la sauvegarde doit savoir garder', () => {
	it('relit lettre pour lettre une grille sauvée en plein mot', () => {
		/* « Fermer l'onglet brutalement perd la dernière lettre » est le cas d'échec.
		   Le runner sauvera à chaque lettre (moitié Playwright) ; encore faut-il que
		   ce qui est relu porte VRAIMENT la dernière lettre écrite, et pas le mot
		   entier ou rien. On sauve après chaque frappe et on relit à chaque fois. */
		const p = tirerGrille(tirage(6));
		const cases = casesDe(p.motif.emplacements[0]);
		const sol = lettres(p.solution[0]);
		let courante = p;
		for (let k = 0; k < cases.length; k++) {
			courante = ecrire(courante, cases[k].ligne, cases[k].colonne, sol[k]);
			sauverPartie(courante);
			const relue = partieEnCours();
			expect(relue, `après ${String(k + 1)} lettre(s)`).not.toBeNull();
			expect(memeEtat(relue, courante), `après ${String(k + 1)} lettre(s)`).toEqual([]);
			expect(
				bas(lettreEn(relue as PartieMotsCroises, cases[k].ligne, cases[k].colonne) ?? ''),
				`la lettre ${String(k + 1)} n'a pas survécu`,
			).toBe(bas(sol[k]));
		}
	});

	it('garde une grille PLEINE MAIS FAUSSE : c’est un état de jeu, pas une corruption', () => {
		/* Le contraire de la partie gagnée ci-dessous, et il ne faut pas les
		   confondre : une grille pleine et fausse est exactement le moment où
		   l'enfant a le plus besoin de revenir. La jeter à la lecture le punirait
		   d'avoir quitté. */
		const p = gagnee(8);
		const c = casesDe(p.motif.emplacements[0])[0];
		const attendue = lettres(p.solution[0])[0];
		const fausse = ecrire(p, c.ligne, c.colonne, bas(attendue) === 'z' ? 'k' : 'z');
		expect(partieGagnee(fausse), 'montage : la grille doit être pleine et fausse').toBe(false);
		sauverPartie(fausse);
		expect(memeEtat(partieEnCours(), fausse)).toEqual([]);
	});
});

describe('#665 critère 39 — l’état restauré est validé à la LECTURE', () => {
	it('refuse une partie déjà terminée', () => {
		/* Cas d'échec littéral : « une partie déjà finie rouvre ». Le chemin normal
		   efface à la victoire, mais la fenêtre existe : onglet fermé sur la dernière
		   lettre, plafond atteint pile à ce moment, export pris à cet instant.
		   Rouvrir une grille finie ne laisserait rien à faire à l'enfant, sans lui
		   dire pourquoi. */
		const p = gagnee();
		expect(partieGagnee(p), 'montage : la partie doit bien être gagnée').toBe(true);
		sauverPartie(p);
		expect(partieEnCours()).toBeNull();
	});

	it('refuse n’importe quoi au sommet de la clé, sans jamais lever', () => {
		for (const brico of ['', 'partie', 42, true, [], [1, 2, 3], { rien: 'du tout' }]) {
			lsSet(CLE_MOTS_CROISES_PARTIE, brico);
			expect(() => partieEnCours(), `valeur stockée ${JSON.stringify(brico)}`).not.toThrow();
			expect(partieEnCours(), `valeur stockée ${JSON.stringify(brico)}`).toBeNull();
		}
	});

	it('refuse un motif inconnu', () => {
		const p = entamee();
		sauverPartie(p);
		expect(
			bricoler(p.motif.id, 'motif-qui-n-existe-pas'),
			'l’identifiant du motif n’est pas dans la valeur stockée',
		).toBe(true);
		expect(partieEnCours()).toBeNull();
	});

	it('refuse un mot de solution hors vivier', () => {
		// Un mot inventé ne peut pas venir du jeu : il vient d'un import bricolé. Le
		// laisser passer donnerait un emplacement SANS DÉFINITION à afficher — et
		// l'enfant devrait deviner un mot dont rien ne dit le sens.
		const p = entamee();
		sauverPartie(p);
		const mot = p.solution[0];
		expect(bricoler(mot, 'z'.repeat(lettres(mot).length)), 'le mot n’est pas stocké').toBe(true);
		expect(partieEnCours()).toBeNull();
	});

	it('refuse un mot dont la longueur ne colle pas à son emplacement', () => {
		const p = entamee();
		sauverPartie(p);
		const mot = p.solution[0];
		const autre = vivierMotsCroises().find((m) => lettres(m).length !== lettres(mot).length);
		expect(autre, 'le vivier n’a qu’une seule longueur ?').toBeDefined();
		expect(bricoler(mot, autre ?? ''), 'le mot n’est pas stocké').toBe(true);
		expect(partieEnCours()).toBeNull();
	});

	it('refuse une solution qui se contredit à un croisement', () => {
		/* Une grille restaurée est une grille SERVIE : ce que le critère 16 interdit
		   à la génération n'a pas à rentrer par la porte du stockage. Une solution
		   dont deux mots réclament deux lettres différentes dans la même case est
		   INFINISSABLE — l'enfant tournerait en rond sans jamais comprendre. */
		const p = entamee();
		sauverPartie(p);
		const mot = p.solution[0];
		const memeLongueur = vivierMotsCroises().filter(
			(m) => lettres(m).length === lettres(mot).length && bas(m) !== bas(mot),
		);
		// On veut un mot qui casse VRAIMENT le croisement, sinon le test ne prouve
		// rien : il doit différer de la solution sur la case partagée.
		const partagee = casesDe(p.motif.emplacements[0]).findIndex((c) =>
			p.motif.emplacements.some(
				(e, i) => i !== 0 && casesDe(e).some((x) => x.ligne === c.ligne && x.colonne === c.colonne),
			),
		);
		expect(partagee, 'l’emplacement 0 ne croise rien (critère 15)').toBeGreaterThanOrEqual(0);
		const casseur = memeLongueur.find(
			(m) =>
				lettres(m)[partagee] !== lettres(mot)[partagee] && !p.solution.map(bas).includes(bas(m)),
		);
		expect(casseur, 'aucun mot du vivier ne casse ce croisement ?').toBeDefined();
		expect(bricoler(mot, casseur ?? ''), 'le mot n’est pas stocké').toBe(true);
		expect(partieEnCours()).toBeNull();
	});

	it('refuse un doublon dans la solution', () => {
		/* Critère 17, à la relecture : deux emplacements avec le même mot, donc la
		   même définition affichée deux fois — et une seule des deux réponses
		   acceptée. Le doublon n'est injectable que sur deux emplacements de MÊME
		   longueur (sinon c'est le contrôle de longueur qui refuse, et ce test ne
		   prouverait rien) : on cherche donc un tirage qui en offre un couple. */
		let monte: { p: PartieMotsCroises; source: number; cible: number } | null = null;
		for (let graine = 1; graine <= 30 && !monte; graine++) {
			const p = entamee(graine);
			for (let i = 0; i < p.solution.length && !monte; i++) {
				for (let j = i + 1; j < p.solution.length && !monte; j++) {
					if (lettres(p.solution[i]).length === lettres(p.solution[j]).length) {
						monte = { p, source: i, cible: j };
					}
				}
			}
		}
		expect(
			monte,
			'aucun motif livré n’a deux emplacements de même longueur : le doublon est alors impossible par construction, et ce test doit être supprimé avec cette raison',
		).not.toBeNull();
		if (!monte) return;
		sauverPartie(monte.p);
		expect(
			bricoler(monte.p.solution[monte.cible], monte.p.solution[monte.source]),
			'le mot n’est pas stocké',
		).toBe(true);
		expect(partieEnCours()).toBeNull();
	});

	it('ne laisse jamais une case porter autre chose qu’une seule lettre', () => {
		/* « Une valeur bricolée dans le stockage casse l'écran » : une case qui
		   porterait « ## », un chiffre ou une espace déborderait d'une case de 44 px,
		   et le clavier alphabétique ne permettrait jamais de la corriger.

		   L'assertion porte sur le RÉSULTAT, pas sur l'endroit du garde-fou : que ce
		   soit `ecrire` qui refuse le bruit ou la relecture qui jette la grille, ce
		   qui compte est qu'aucune case ne finisse par l'afficher. */
		const p = entamee();
		const c = casesDe(p.motif.emplacements[0])[0];
		let tentee = p;
		for (const bruit of ['##', 'AB', '1', ' ', '\n']) {
			tentee = ecrire(tentee, c.ligne, c.colonne, bruit);
		}
		sauverPartie(tentee);
		expect(() => partieEnCours()).not.toThrow();
		const relue = partieEnCours();
		const valeur = relue === null ? null : lettreEn(relue, c.ligne, c.colonne);
		expect(
			valeur === null || /^\p{L}$/u.test(NFC(valeur)),
			`la case ${String(c.ligne)},${String(c.colonne)} porte « ${valeur ?? '∅'} »`,
		).toBe(true);
	});

	it('ne borne QUE le bruit : une partie saine survit à tous ces refus', () => {
		// Le garde-fou du garde-fou. Une validation trop zélée, qui rejetterait tout,
		// rendrait les huit tests ci-dessus verts sans rien garder.
		lsSet(CLE_MOTS_CROISES_PARTIE, 'nawak');
		expect(partieEnCours()).toBeNull();
		const p = entamee(12);
		sauverPartie(p);
		expect(memeEtat(partieEnCours(), p)).toEqual([]);
		expect(etatMot(partieEnCours() as PartieMotsCroises, 0)).toBe(etatMot(p, 0));
	});
});

describe('#665 critères 42 et 43 — jouer ne fait bouger aucun compteur', () => {
	it('n’enregistre ni score ni XP, même en gagnant', () => {
		/* Cas d'échec du critère 42 : « finir une grille fait bouger un compteur de
		   l'accueil ». Ici la moitié observable ; l'autre — le jeu n'importe même pas
		   ces modules — est tenue statiquement par le gate. */
		const xpAvant = getXP();
		sauverPartie(entamee());
		partieEnCours();
		sauverPartie(gagnee());
		partieEnCours();
		effacerPartie();
		expect(getXP()).toBe(xpAvant);
		expect(meilleurScore('mots-croises')).toBe(0);
	});

	it('n’écrit rien en dehors de sa clé', () => {
		/* Critère 43 : un compteur de grilles enchaînées aurait besoin d'une SECONDE
		   clé. Ce contrôle n'interdit pas de compter, il interdit de se SOUVENIR — et
		   sans mémoire, il n'y a ni série ni record possible. */
		const avant = new Set(appKeys());
		sauverPartie(entamee());
		partieEnCours();
		sauverPartie(gagnee());
		partieEnCours();
		const nouvelles = appKeys().filter((k) => !avant.has(k));
		for (const k of nouvelles) {
			expect(k.includes(CLE_MOTS_CROISES_PARTIE), `clé inattendue écrite en jouant : ${k}`).toBe(
				true,
			);
		}
	});
});
