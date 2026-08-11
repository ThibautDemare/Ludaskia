/* ============================================================
   Frise d'états par leçon (#521) — `friseNotion` / `aChangeRecemment`, et leur
   branchement dans `progressionProfil`.
   ------------------------------------------------------------
   Remplace la frise d'évolution par matière (#397, `frisesParMatiere`, supprimée).
   Le contrat éprouvé ici, tel qu'il est annoncé :
   - 12 cellules, de la plus ANCIENNE à la plus récente, la dernière = semaine EN COURS ;
   - l'état d'une cellule est le plus haut atteint à la FIN de sa semaine — un cap franchi
     le mercredi colore la semaine qui le contient, pas la suivante ;
   - le journal des paliers ne datant que les MONTÉES, une frise ne redescend jamais ;
   - sans date de première rencontre, les semaines antérieures au premier cap sont
     'inconnu' (on ne SAIT pas) ; avec elle, elles valent 'a-decouvrir' (on sait qu'aucun
     cap n'a été franchi). C'est la seule différence entre les deux frises d'un même
     journal, et la subtilité centrale de la fonction ;
   - `null` quand aucun cap n'est daté : il n'y a pas de trajectoire à tracer ;
   - `aChangeRecemment(frise)` ne signale que ce qui est VISIBLE dans la frise : une frise
     plate n'annonce rien. Comme le code lit les CELLULES, l'attendu est ici dérivé des DATES
     (`compteurAttendu`) pour rester un second modèle : le compteur s'allume quand le cap le
     plus HAUT (« acquis » s'il est daté, sinon « en cours ») est tombé dans les 11 dernières
     semaines — un cap plus ancien est déjà porté par la cellule 0, donc invisible.

   Les attendus sont dérivés de ce contrat, en INDEX DE SEMAINE (`friseAttendue`), là où le
   code raisonne en horodatages de fin de semaine : les deux modèles doivent coïncider.

   DEUX repères temporels, chacun un mercredi à 15 h 30 (heure locale) :
   - `NOW` = 12 août 2026, dont la fenêtre de 12 semaines (fin mai → mi-août) ne contient
     aucun changement d'heure, sous quelque fuseau que ce soit : le gros des attendus s'y lit
     sans réserve. Les marches injectées y restent à ≥ 2 h de toute frontière de semaine,
     sauf dans les tests de BORNE, qui les visent exprès ;
   - `NOW_DST` = 13 mai 2026, dont la fenêtre est à cheval sur la bascule d'heure d'été de
     l'hémisphère nord (29 mars 2026 en Europe). Le pas hebdomadaire passant par un décalage
     en jours CALENDAIRES, les frontières des semaines anciennes ne dérivent pas d'une heure
     et un cap franchi le dimanche à 23 h 30 reste dans SA semaine. Dans un fuseau sans heure
     d'été (UTC, comme la CI), ce bloc dégénère en cas nominal — il mord sur la machine du
     mainteneur.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	initProfiles,
	activeProfile,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import { setOnDataWrite, lsSetRaw } from '../src/core/storage';
import {
	LESSON_PALIERS_KEY,
	LESSON_FIRST_SEEN_KEY,
	type PaliersNotion,
} from '../src/core/progress';
import {
	friseNotion,
	aChangeRecemment,
	debutSemaine,
	progressionProfil,
	niveauProfilMatiere,
	type CelluleFrise,
	type FriseNotion,
	type RecapCategorie,
	type RecapMatiere,
	type RecapProfil,
} from '../src/core/encadrant-stats';
import type { SubjectId } from '../src/core/catalog';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const NB_SEMAINES = 12; // largeur annoncée de la frise
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

const NOW = new Date(2026, 7, 12, 15, 30).getTime(); // mercredi 12 août 2026, 15 h 30
const NOW_DST = new Date(2026, 4, 13, 15, 30).getTime(); // mercredi 13 mai 2026 (fenêtre à cheval)

/* Grille de semaines d'un instant, en JOURS CALENDAIRES : c'est la définition « semaine
   calendaire locale » du contrat, et surtout PAS l'arithmétique du code (`lundiDecale`),
   qu'on ne veut pas recopier — si l'une des deux dérive, les attendus ne coïncident plus. */
function grille(now: number) {
	/* Lundi 00:00 de la semaine portée par la cellule d'index `i` (0 = la plus ancienne de la
	   frise, NB_SEMAINES-1 = la semaine en cours) ; un index négatif désigne une semaine
	   ANTÉRIEURE à la fenêtre. */
	const lundiCellule = (i: number): number => {
		const d = new Date(debutSemaine(now));
		d.setDate(d.getDate() - 7 * (NB_SEMAINES - 1 - i));
		return d.getTime();
	};
	/* Horodatage situé DANS la semaine de la cellule `i` (`jour` : 0 = lundi). */
	const dans = (i: number, jour = 2, heure = 10, minute = 0): number =>
		lundiCellule(i) + jour * JOUR + heure * HEURE + minute * MINUTE;
	return { lundiCellule, dans };
}
const { lundiCellule, dans: dansSemaine } = grille(NOW);
const LUNDI = lundiCellule(NB_SEMAINES - 1); // lundi 00:00 de la semaine EN COURS

/* Frise ATTENDUE, exprimée en index de semaine : chaque cellule porte le cap le plus haut
   franchi au plus tard pendant sa semaine ; avant le premier cap, 'a-decouvrir' si
   l'historique est connu (première rencontre datée), 'inconnu' sinon. Un index `null` =
   cap jamais franchi ; un index négatif = cap antérieur à la fenêtre. */
function friseAttendue(
	idxEnCours: number | null,
	idxAcquis: number | null,
	connu: boolean,
): CelluleFrise[] {
	return Array.from({ length: NB_SEMAINES }, (_, i): CelluleFrise => {
		if (idxAcquis !== null && i >= idxAcquis) return 'acquis';
		if (idxEnCours !== null && i >= idxEnCours) return 'en-cours';
		return connu ? 'a-decouvrir' : 'inconnu';
	});
}

/* Compteur ATTENDU, dérivé des seules DATES de franchissement (le code, lui, relit les
   cellules) : une transition n'est visible que si le cap le plus HAUT — « acquis » s'il est
   daté, sinon « en cours » — tombe dans l'une des 11 dernières semaines. Plus tôt, la
   cellule 0 le porte déjà et la frise est plate, y compris quand le journal est incohérent
   (un « acquis » ancien sous un « en cours » récent : c'est « acquis » qui tient partout). */
function compteurAttendu(idxEnCours: number | null, idxAcquis: number | null): boolean {
	const plusHaut = idxAcquis ?? idxEnCours;
	return plusHaut !== null && plusHaut >= 1 && plusHaut <= NB_SEMAINES - 1;
}

/* Rangs de l'échelle, pour la monotonie. 'inconnu' et 'a-decouvrir' ne coexistent jamais
   dans une même frise (cf. contrat), leur ordre relatif est donc sans effet ici. */
const RANG: Record<CelluleFrise, number> = {
	inconnu: 0,
	'a-decouvrir': 1,
	'en-cours': 2,
	acquis: 3,
};

/* Donnée relue du STOCKAGE (JSON, non typée) : le cast est l'objet même du test — on
   éprouve la tolérance de la fonction à une valeur hors du type. */
const brut = <T>(v: unknown): T => v as T;

const FIRST_SEEN = dansSemaine(3); // date de première rencontre, quand on en fournit une

describe('prémisse du fichier — la grille de semaines du test est calendaire', () => {
	it('les 12 frontières sont des lundis 00:00, sur les deux repères temporels', () => {
		// Les attendus ci-dessous sont posés sur cette grille : on la vérifie plutôt que de
		// l'espérer, sous les deux repères — dont un à cheval sur un changement d'heure.
		for (const [quoi, g] of [
			['repère nominal', grille(NOW)],
			['repère à cheval sur un changement d’heure', grille(NOW_DST)],
		] as const)
			for (let i = 0; i < NB_SEMAINES; i++) {
				const d = new Date(g.lundiCellule(i));
				expect([d.getDay(), d.getHours(), d.getMinutes()], `${quoi}, cellule ${i}`).toEqual([
					1, 0, 0,
				]);
			}
	});
});

describe('friseNotion — rien à tracer', () => {
	it('aucun palier daté → null (l’état courant est déjà dit par la ligne)', () => {
		expect(friseNotion(undefined, undefined, NOW)).toBeNull();
		expect(friseNotion({}, undefined, NOW)).toBeNull();
	});

	it('une première rencontre SEULE ne fait pas une trajectoire → null', () => {
		// Connaître le début de l'historique ne crée aucun cap : il n'y a qu'un rang bas à
		// afficher, ce que la ligne dit déjà.
		expect(friseNotion({}, FIRST_SEEN, NOW)).toBeNull();
	});

	it('valeurs non numériques (journal corrompu) → traitées comme absentes', () => {
		const p = (v: unknown) => brut<PaliersNotion>(v);
		expect(friseNotion(p({ enCours: '1700000000000' }), undefined, NOW)).toBeNull();
		expect(friseNotion(p({ enCours: null, acquis: null }), undefined, NOW)).toBeNull();
		// Une seule valeur exploitable suffit à tracer, l'autre est ignorée.
		const f = friseNotion(p({ enCours: {}, acquis: dansSemaine(8) }), undefined, NOW);
		expect(f).not.toBeNull();
		expect(f!.enCoursDepuis).toBeNull();
		expect(f!.semaines).toEqual(friseAttendue(null, 8, false));
	});

	it('horodatage non FINI (NaN, ±Infinity) → traité comme absent', () => {
		// Injoignable via le stockage (`JSON.stringify` écrit `null`), mais sans ce garde un NaN
		// produirait une frise ENTIÈRE de cellules basses au lieu du `null` promis, et un
		// Infinity douze cellules « inconnu ».
		expect(friseNotion({ acquis: NaN }, undefined, NOW)).toBeNull();
		expect(friseNotion({ enCours: Infinity, acquis: -Infinity }, FIRST_SEEN, NOW)).toBeNull();
		// Une valeur exploitable à côté d'une valeur non finie continue de tracer.
		const f = friseNotion({ enCours: NaN, acquis: dansSemaine(6) }, undefined, NOW);
		expect(f!.enCoursDepuis).toBeNull();
		expect(f!.semaines).toEqual(friseAttendue(null, 6, false));
	});

	it('une première rencontre non numérique laisse l’historique INCONNU', () => {
		const f = friseNotion({ enCours: dansSemaine(6) }, brut<number>('hier'), NOW);
		expect(f!.semaines).toEqual(friseAttendue(6, null, false));
	});
});

describe('friseNotion — forme et bornes de semaine', () => {
	it('12 cellules, la DERNIÈRE est la semaine en cours', () => {
		const f = friseNotion({ acquis: dansSemaine(11) }, undefined, NOW);
		expect(f!.semaines).toHaveLength(NB_SEMAINES);
		// Le cap est tombé cette semaine : seule la dernière cellule le porte.
		expect(f!.semaines[NB_SEMAINES - 1]).toBe('acquis');
		expect(f!.semaines.slice(0, NB_SEMAINES - 1).every((c) => c === 'inconnu')).toBe(true);
	});

	it('un cap franchi le MERCREDI colore la semaine qui le contient, pas la suivante', () => {
		const f = friseNotion({ enCours: dansSemaine(4, 2, 14) }, FIRST_SEEN, NOW);
		expect(f!.semaines).toEqual(friseAttendue(4, null, true));
		expect(f!.semaines[4]).toBe('en-cours'); // la semaine du franchissement…
		expect(f!.semaines[3]).toBe('a-decouvrir'); // …et pas la précédente
	});

	it('dimanche soir, dernier millisecondes de la semaine passée → la semaine passée', () => {
		const f = friseNotion({ enCours: LUNDI - 1 }, undefined, NOW);
		expect(f!.semaines).toEqual(friseAttendue(10, null, false));
	});

	it('lundi 00:00:00.000 pile → la semaine qui OUVRE, pas celle qui se termine', () => {
		const f = friseNotion({ enCours: LUNDI }, undefined, NOW);
		expect(f!.semaines).toEqual(friseAttendue(11, null, false));
		expect(f!.semaines[10]).toBe('inconnu'); // rien n'était encore franchi dimanche soir
	});

	it('cap ANTÉRIEUR à la fenêtre → la cellule la plus ancienne porte déjà l’état', () => {
		const f = friseNotion({ enCours: dansSemaine(-4) }, undefined, NOW);
		expect(f!.semaines).toEqual(friseAttendue(-4, null, false)); // aucune cellule 'inconnu'
		expect(f!.semaines[0]).toBe('en-cours');
		expect(new Set(f!.semaines).size).toBe(1); // frise plate : « ça n'a pas bougé »
	});

	it('la première cellule ne distingue pas « tout début de fenêtre » et « avant »', () => {
		const debutFenetre = lundiCellule(0);
		// Premier instant de la fenêtre → la cellule 0 porte l'état…
		expect(friseNotion({ acquis: debutFenetre }, FIRST_SEEN, NOW)!.semaines).toEqual(
			friseAttendue(null, 0, true),
		);
		// …et un millième de seconde plus tôt, la frise est RIGOUREUSEMENT la même (la fenêtre
		// ne recule pas). C'est précisément pour ça que le compteur de changements récents
		// démarre à la deuxième cellule : ici, il n'y a rien à voir.
		expect(friseNotion({ acquis: debutFenetre - 1 }, FIRST_SEEN, NOW)!.semaines).toEqual(
			friseAttendue(null, 0, true),
		);
	});
});

describe('friseNotion — la grille tient à travers un changement d’heure', () => {
	// Régression : un pas hebdomadaire en millisecondes fixes (7 × 86 400 000) décale d'une
	// heure les frontières des semaines situées de l'autre côté d'une bascule, et fait alors
	// basculer dans la semaine SUIVANTE un cap franchi le dimanche soir.
	const g = grille(NOW_DST);

	it('un cap le dimanche à 23 h 30 reste dans SA semaine', () => {
		const f = friseNotion({ enCours: g.dans(3, 6, 23, 30) }, undefined, NOW_DST)!;
		expect(f.semaines).toEqual(friseAttendue(3, null, false));
	});

	it('le lundi 00 h 30 qui suit appartient bien à la semaine d’après', () => {
		const f = friseNotion({ enCours: g.dans(4, 0, 0, 30) }, undefined, NOW_DST)!;
		expect(f.semaines).toEqual(friseAttendue(4, null, false));
	});

	it('le compteur de changements hérite de la même grille', () => {
		// Un cap le dimanche soir de la semaine la plus ANCIENNE est invisible (cellule 0 déjà
		// peinte) ; 1 h plus tard, le lundi, il se voit. Une grille dérivant d'une heure
		// inverserait les deux réponses et ferait annoncer un changement introuvable.
		const frise = (t: number) => friseNotion({ acquis: t }, undefined, NOW_DST);
		expect(aChangeRecemment(frise(g.dans(0, 6, 23, 30)))).toBe(false);
		expect(aChangeRecemment(frise(g.dans(1, 0, 0, 30)))).toBe(true);
	});
});

describe('friseNotion — « inconnu » contre « à découvrir »', () => {
	const paliers: PaliersNotion = { enCours: dansSemaine(6), acquis: dansSemaine(9) };

	it('le MÊME journal produit deux frises selon que la 1re rencontre est datée', () => {
		const sans = friseNotion(paliers, undefined, NOW)!;
		const avec = friseNotion(paliers, FIRST_SEEN, NOW)!;
		expect(sans.semaines).toEqual(friseAttendue(6, 9, false));
		expect(avec.semaines).toEqual(friseAttendue(6, 9, true));
		expect(avec.semaines).not.toEqual(sans.semaines);
		// Seule la lecture du PASSÉ change : la substitution 'inconnu' → 'a-decouvrir' suffit
		// à passer d'une frise à l'autre. Dater la 1re rencontre n'invente aucun cap.
		expect(sans.semaines.map((c) => (c === 'inconnu' ? 'a-decouvrir' : c))).toEqual(avec.semaines);
		expect(sans.semaines).not.toContain('a-decouvrir');
		expect(avec.semaines).not.toContain('inconnu');
	});

	it('les semaines antérieures à la 1re rencontre valent « à découvrir », pas « inconnu »', () => {
		// Choix assumé : une fois l'historique connu, une leçon pas encore rencontrée est bien
		// « à découvrir » — c'est un état, pas une ignorance.
		const f = friseNotion({ enCours: dansSemaine(10) }, dansSemaine(8), NOW)!;
		expect(f.semaines).toEqual(friseAttendue(10, null, true));
		expect(f.semaines[0]).toBe('a-decouvrir'); // bien avant la 1re rencontre (semaine 8)
	});
});

describe('friseNotion — combinaisons de paliers', () => {
	it('« en cours » seul : jamais de cellule « acquis », et acquisDepuis reste null', () => {
		const f = friseNotion({ enCours: dansSemaine(5) }, FIRST_SEEN, NOW)!;
		expect(f.semaines).toEqual(friseAttendue(5, null, true));
		expect(f.semaines).not.toContain('acquis');
		expect(f.acquisDepuis).toBeNull();
		expect(f.enCoursDepuis).toBe(dansSemaine(5));
	});

	it('« acquis » seul (étoile au 1er coup) : aucune cellule « en cours » intermédiaire', () => {
		const f = friseNotion({ acquis: dansSemaine(7) }, FIRST_SEEN, NOW)!;
		expect(f.semaines).toEqual(friseAttendue(null, 7, true));
		expect(f.semaines).not.toContain('en-cours');
		expect(f.enCoursDepuis).toBeNull();
	});

	it('les deux caps la MÊME semaine : la cellule porte le plus haut (« acquis »)', () => {
		const t = dansSemaine(8);
		const f = friseNotion({ enCours: t, acquis: t }, FIRST_SEEN, NOW)!;
		expect(f.semaines).toEqual(friseAttendue(null, 8, true));
		expect(f.semaines).not.toContain('en-cours'); // pas de semaine « en cours » fabriquée
	});

	it('donnée INCOHÉRENTE (« acquis » antérieur à « en cours ») → « acquis » tient, frise monotone', () => {
		// Le journal ne peut normalement pas produire ça (une notion acquise ne redescend pas).
		// Rendu défendable : c'est le cap le plus HAUT atteint qui est affiché, donc « acquis »
		// dès sa date, et la frise ne redescend jamais. Les deux horodatages restent exposés
		// tels quels (l'UI date le cap le plus haut).
		const f = friseNotion({ enCours: dansSemaine(9), acquis: dansSemaine(4) }, FIRST_SEEN, NOW)!;
		expect(f.semaines).toEqual(friseAttendue(null, 4, true));
		expect(f.semaines).not.toContain('en-cours');
		expect(f.enCoursDepuis).toBe(dansSemaine(9));
		expect(f.acquisDepuis).toBe(dansSemaine(4));
	});
});

describe('friseNotion — INVARIANTS sur toutes les combinaisons de semaines', () => {
	// Énumération EXHAUSTIVE (déterministe, aucun tirage) : chaque cap posé sur l'une des
	// semaines repères — hors fenêtre, première, dernière, milieu — × jamais franchi ×
	// trois positions dans la semaine × historique connu ou non.
	const INDICES = [-2, -1, 0, 1, 4, 7, 10, 11];
	const POSITIONS = [
		{ jour: 0, heure: 2 }, // lundi, 2 h après l'ouverture de la semaine
		{ jour: 2, heure: 10 }, // mercredi, en plein milieu
		{ jour: 6, heure: 21 }, // dimanche soir, 3 h avant la bascule
	];

	it('la frise vaut ce que le contrat prédit, ne redescend jamais, et finit sur le cap le plus haut', () => {
		let cas = 0;
		for (const pos of POSITIONS)
			for (const idxEnCours of [...INDICES, null])
				for (const idxAcquis of [...INDICES, null]) {
					if (idxEnCours === null && idxAcquis === null) continue; // rien à tracer (testé à part)
					const ts = (i: number | null) =>
						i === null ? null : dansSemaine(i, pos.jour, pos.heure);
					const tEnCours = ts(idxEnCours);
					const tAcquis = ts(idxAcquis);
					if ((tEnCours ?? 0) > NOW || (tAcquis ?? 0) > NOW) continue; // pas de cap dans le futur
					const paliers: PaliersNotion = {};
					if (tEnCours !== null) paliers.enCours = tEnCours;
					if (tAcquis !== null) paliers.acquis = tAcquis;
					const etiquette = `enCours=${idxEnCours} acquis=${idxAcquis} j${pos.jour}h${pos.heure}`;

					const sans = friseNotion(paliers, undefined, NOW);
					const avec = friseNotion(paliers, FIRST_SEEN, NOW);
					expect(sans, etiquette).not.toBeNull();
					expect(avec, etiquette).not.toBeNull();
					for (const [connu, f] of [
						[false, sans!],
						[true, avec!],
					] as const) {
						// 1. Chaque cellule porte l'état prédit par le contrat.
						expect(f.semaines, `${etiquette} connu=${connu}`).toEqual(
							friseAttendue(idxEnCours, idxAcquis, connu),
						);
						expect(f.semaines, etiquette).toHaveLength(NB_SEMAINES);
						// 2. Monotonie : les paliers ne datant que les montées, aucune redescente.
						for (let i = 1; i < f.semaines.length; i++)
							expect(RANG[f.semaines[i]], `${etiquette} cellule ${i}`).toBeGreaterThanOrEqual(
								RANG[f.semaines[i - 1]],
							);
						// 3. La dernière cellule porte le cap le plus haut jamais franchi.
						expect(f.semaines[NB_SEMAINES - 1], etiquette).toBe(
							tAcquis !== null ? 'acquis' : 'en-cours',
						);
						// 4. Les deux lectures du passé ne se mélangent jamais.
						expect(f.semaines, etiquette).not.toContain(connu ? 'inconnu' : 'a-decouvrir');
						// 5. Les horodatages sont re-exposés tels quels (l'UI les date).
						expect(f.enCoursDepuis, etiquette).toBe(tEnCours);
						expect(f.acquisDepuis, etiquette).toBe(tAcquis);
						// 6. Le compteur par matière suit les franchissements DATÉS : allumé quand le cap
						//    le plus haut tombe dans les 11 dernières semaines, éteint sinon — et jamais
						//    influencé par la date de première rencontre, qui ne change aucun cap.
						expect(aChangeRecemment(f), etiquette).toBe(compteurAttendu(idxEnCours, idxAcquis));
					}
					// 7. Dater la 1re rencontre ne change QUE la lecture des semaines passées.
					expect(
						sans!.semaines.map((c) => (c === 'inconnu' ? 'a-decouvrir' : c)),
						etiquette,
					).toEqual(avec!.semaines);
					cas++;
				}
		expect(cas).toBeGreaterThan(200); // l'énumération n'a pas été vidée par les filtres
	});
});

describe('aChangeRecemment (compteur « N changements récents » par matière)', () => {
	const frise = (paliers: PaliersNotion) => friseNotion(paliers, undefined, NOW);
	const plate = (f: FriseNotion | null) => new Set(f!.semaines).size === 1;

	it('pas de frise (aucun cap daté) → false', () => {
		expect(aChangeRecemment(null)).toBe(false);
	});

	it('cap dans la semaine en cours → true', () => {
		expect(aChangeRecemment(frise({ enCours: dansSemaine(11) }))).toBe(true);
	});

	it('cap dans la semaine la plus ANCIENNE → éteint, la frise étant plate', () => {
		// Ce qu'on annonce doit se voir : la cellule 0 porte déjà l'état (son état est celui
		// atteint à la FIN de sa semaine), donc un parent qui déplie ne verrait rien bouger.
		const f = frise({ acquis: dansSemaine(0, 3, 12) });
		expect(f!.semaines).toEqual(friseAttendue(null, 0, false));
		expect(plate(f)).toBe(true);
		expect(aChangeRecemment(f)).toBe(false);
		// La semaine suivante, elle, se voit : la cellule 0 reste basse.
		expect(aChangeRecemment(frise({ acquis: dansSemaine(1, 3, 12) }))).toBe(true);
	});

	it('tous les caps hors fenêtre → false, alors que la frise existe bel et bien', () => {
		const f = frise({ enCours: dansSemaine(-6), acquis: dansSemaine(-3) });
		expect(f).not.toBeNull(); // il y a une trajectoire à tracer…
		expect(aChangeRecemment(f)).toBe(false); // …mais rien n'a bougé récemment
	});

	it('un seul cap récent suffit (l’ancien « en cours » n’annule pas le nouvel « acquis »)', () => {
		expect(aChangeRecemment(frise({ enCours: dansSemaine(-8), acquis: dansSemaine(5) }))).toBe(
			true,
		);
		// Symétrique : le cap récent peut être « en cours » et l'ancien… inexistant.
		expect(aChangeRecemment(frise({ enCours: dansSemaine(2) }))).toBe(true);
	});

	it('journal INCOHÉRENT (« acquis » ancien, « en cours » récent) → éteint', () => {
		// Forme que `recordMonteesPalier` ne produit pas (une notion acquise ne redescend pas),
		// mais qui ne doit pas allumer le compteur : « acquis » tient sur toute la frise, donc
		// elle est plate et il n'y a rien à annoncer.
		const f = frise({ enCours: dansSemaine(9), acquis: dansSemaine(-2) });
		expect(plate(f)).toBe(true);
		expect(aChangeRecemment(f)).toBe(false);
	});

	it('la date de 1re rencontre ne change PAS le compteur (elle ne crée aucun cap)', () => {
		const paliers: PaliersNotion = { enCours: dansSemaine(6) };
		expect(aChangeRecemment(friseNotion(paliers, undefined, NOW))).toBe(true);
		expect(aChangeRecemment(friseNotion(paliers, FIRST_SEEN, NOW))).toBe(true);
		// Idem quand il n'y a rien à signaler : la substitution du rang bas ne crée pas de
		// transition (la frise reste plate).
		const vieux: PaliersNotion = { acquis: dansSemaine(-3) };
		expect(aChangeRecemment(friseNotion(vieux, undefined, NOW))).toBe(false);
		expect(aChangeRecemment(friseNotion(vieux, FIRST_SEEN, NOW))).toBe(false);
	});
});

/* ---------- Branchement dans progressionProfil (lecture par UUID) ---------- */

function ecrire(uuid: string, key: string, valeur: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(valeur));
}
/* Catégorie non vide du récap, choisie DYNAMIQUEMENT (des ids en dur mentiraient au premier
   remaniement du catalogue). `mini` = nombre de leçons nécessaires au test. */
function categorie(
	recap: RecapProfil,
	subject: SubjectId,
	mini = 1,
	sauf?: string,
): RecapCategorie {
	const c = recap.parCategorie.find(
		(x) => x.subject === subject && x.categoryId !== sauf && x.lecons.length >= mini,
	);
	if (!c) throw new Error(`aucune catégorie ${subject} de ${mini} leçon(s) ou plus`);
	return c;
}
/* Clé de stockage d'une leçon pour le profil (stats/étoiles/paliers sont namespacés par
   niveau, cf. #225) : c'est ce que le récap va relire. */
function cle(p: Profile, cat: RecapCategorie, i: number): string {
	return cat.lecons[i].lessonId + '@' + niveauProfilMatiere(p, cat.subject);
}
function matiere(recap: RecapProfil, subject: SubjectId): RecapMatiere {
	const m = recap.parMatiere.find((x) => x.subject === subject);
	if (!m) throw new Error('matière absente du récap : ' + subject);
	return m;
}
function notion(recap: RecapProfil, lessonId: string) {
	const n = recap.parCategorie.flatMap((c) => c.lecons).find((l) => l.lessonId === lessonId);
	if (!n) throw new Error('leçon absente du récap : ' + lessonId);
	return n;
}

describe('progressionProfil — frise par leçon et changements récents', () => {
	it('journal vide → aucune frise, et 0 changement récent partout', () => {
		const p = activeProfile();
		const recap = progressionProfil(p, NOW);
		expect(recap.parCategorie.flatMap((c) => c.lecons).every((l) => l.frise === null)).toBe(true);
		expect(recap.parMatiere.every((m) => m.changementsRecents === 0)).toBe(true);
		expect(recap.parMatiere.length).toBeGreaterThan(0); // l'assertion n'est pas creuse
	});

	it('compte les leçons ayant bougé, par matière, en agrégeant les catégories', () => {
		const p = activeProfile();
		const base = progressionProfil(p, NOW);
		const mathA = categorie(base, 'math', 2);
		const mathB = categorie(base, 'math', 1, mathA.categoryId);
		const fr = categorie(base, 'francais', 1);
		ecrire(p.uuid, LESSON_PALIERS_KEY, {
			[cle(p, mathA, 0)]: { enCours: dansSemaine(9) },
			[cle(p, mathA, 1)]: { acquis: dansSemaine(11) },
			[cle(p, mathB, 0)]: { enCours: dansSemaine(2), acquis: dansSemaine(7) },
			[cle(p, fr, 0)]: { enCours: dansSemaine(5) },
		});

		const recap = progressionProfil(p, NOW);
		expect(matiere(recap, 'math').changementsRecents).toBe(3); // 2 catégories agrégées
		expect(matiere(recap, 'francais').changementsRecents).toBe(1);
		// Une leçon = un changement, même si elle a franchi DEUX caps dans la fenêtre.
		expect(notion(recap, mathB.lecons[0].lessonId).frise!.semaines).toEqual(
			friseAttendue(2, 7, false),
		);
		// Les leçons sans palier gardent une frise nulle (rien à tracer).
		expect(
			recap.parCategorie.flatMap((c) => c.lecons).filter((l) => l.frise !== null),
		).toHaveLength(4);
	});

	it('cap hors fenêtre : la frise est tracée, mais ne compte pas comme changement récent', () => {
		const p = activeProfile();
		const cat = categorie(progressionProfil(p, NOW), 'math', 1);
		ecrire(p.uuid, LESSON_PALIERS_KEY, { [cle(p, cat, 0)]: { acquis: dansSemaine(-5) } });
		const recap = progressionProfil(p, NOW);
		expect(notion(recap, cat.lecons[0].lessonId).frise).not.toBeNull();
		expect(matiere(recap, 'math').changementsRecents).toBe(0);
	});

	it('la date de 1re rencontre du MÊME profil est bien branchée (« à découvrir » au lieu d’« inconnu »)', () => {
		const p = activeProfile();
		const cat = categorie(progressionProfil(p, NOW), 'math', 1);
		const k = cle(p, cat, 0);
		ecrire(p.uuid, LESSON_PALIERS_KEY, { [k]: { enCours: dansSemaine(9) } });
		expect(notion(progressionProfil(p, NOW), cat.lecons[0].lessonId).frise!.semaines).toEqual(
			friseAttendue(9, null, false),
		);
		ecrire(p.uuid, LESSON_FIRST_SEEN_KEY, { [k]: dansSemaine(8) });
		expect(notion(progressionProfil(p, NOW), cat.lecons[0].lessonId).frise!.semaines).toEqual(
			friseAttendue(9, null, true),
		);
	});

	it('scoping par niveau : un palier @cm1 est ignoré pour un profil CE2', () => {
		const p = activeProfile(); // niveau par défaut = CE2
		const cat = categorie(progressionProfil(p, NOW), 'math', 1);
		const lessonId = cat.lecons[0].lessonId;
		expect(niveauProfilMatiere(p, 'math')).toBe('ce2'); // prémisse du test
		ecrire(p.uuid, LESSON_PALIERS_KEY, { [lessonId + '@cm1']: { acquis: dansSemaine(6) } });
		const recap = progressionProfil(p, NOW);
		expect(notion(recap, lessonId).frise).toBeNull();
		expect(matiere(recap, 'math').changementsRecents).toBe(0);
	});

	it('journal illisible / clé inconnue → aucune frise, aucun plantage', () => {
		const p = activeProfile();
		const cat = categorie(progressionProfil(p, NOW), 'math', 1);
		ecrire(p.uuid, LESSON_PALIERS_KEY, {
			[cle(p, cat, 0)]: { enCours: 'la semaine dernière' }, // valeur hors type
			'lecon-supprimee@ce2': { acquis: dansSemaine(4) }, // leçon absente du catalogue
		});
		const recap = progressionProfil(p, NOW);
		expect(notion(recap, cat.lecons[0].lessonId).frise).toBeNull();
		expect(matiere(recap, 'math').changementsRecents).toBe(0);
	});
});
