/* ============================================================
   Étayage de la notion (#490) — leçons de CALCUL MENTAL du moteur historique.
   ------------------------------------------------------------
   Exception assumée à la règle « l'entrée vit dans le module de données de sa leçon » :
   ces 17 leçons (15 CE2 + 2 CM1, #241) n'ONT pas de module de données. Elles sont des
   `LessonDef` littéraux de `core/catalog.ts` posés sur le moteur `bilanQ`
   (`core/lessons.ts`), et y écrire 17 blocs de prose noierait le catalogue, qui est un
   index. On les regroupe donc ici, au plus près qu'on puisse : un fichier de données de
   `src/data/maths/`, importé par le catalogue et appliqué par id.

   Ce que ces étayages ne sont PAS : un rappel de la table à réciter. Le calcul mental du
   programme est « réfléchi » (attendus CE2/CM1, cf. docs/reference/programmes/) — il
   s'appuie sur des procédures : passer par 10, s'appuyer sur un résultat connu, arrondir
   puis compenser, doubler deux fois. C'est cette PROCÉDURE que le panneau montre, parce
   que c'est la seule chose qu'un enfant bloqué puisse encore mobiliser : « apprends ta
   table » n'aide pas au moment précis où l'on est bloqué.

   ⚠ La procédure enseignée doit couvrir TOUTE la plage tirée par `bilanQ`, pas seulement
   le cas qui donne son nom à la leçon. « Ajouter 9, 19, 29 » tire aussi 8, 18 et 28
   (cas 5) : une aide qui n'enseignerait que « +10 puis −1 » ferait rater la moitié de la
   leçon, avec une erreur d'exactement 1 — invisible pour l'enfant, qui a pourtant suivi
   la seule aide qu'on lui donnait (constat du `pedagogue-primaire`). Même exigence pour
   « Décomposer 60 », dont le facteur tiré descend à 2 : y compter de 2 en 2 jusqu'à 60,
   c'est trente bonds de tête.

   Les exemples chiffrés sont pris DANS la plage de la leçon, pour que l'enfant reconnaisse
   ses propres questions, mais restent les mêmes d'une ouverture à l'autre (jamais un
   tirage : l'aléatoire donnerait tantôt un cas trop facile pour rien montrer, tantôt le
   pire cas au pire moment).

   Deux contraintes d'ÉCRITURE, parce que ces phrases sont LUES à voix haute (`texteParle`,
   core/tts-text.ts) autant que lues à l'œil :
   - les milliers se séparent par une espace fine insécable U+202F, la seule que le moteur
     vocal recolle : séparés par une espace ordinaire, ils s'entendent « un, cent » ;
   - pas de flèche « → » : `texteParle` la rend SILENCIEUSE (elle sert à marquer un trou
     dans « X → @ »), ce qui transformerait « 12 × 8 → 12 + 12 = 24 » en deux phrases
     juxtaposées sans lien. On écrit le connecteur en toutes lettres.
   ============================================================ */
import type { EtayageEntree } from '../../core/etayage';
import { etayageRedige } from '../_shared';

export const ETAYAGES_CALCUL_MENTAL: Record<string, EtayageEntree[]> = {
	'math-tables-addition': [
		etayageRedige(
			"Les tables d'addition",
			"Quand un résultat ne vient pas tout seul, on passe par 10 : c'est le nombre le plus facile à franchir.",
			[
				'Regarde ce qui manque au plus grand pour faire 10 : 8 + 2 = 10.',
				"Coupe l'autre nombre pour lui donner ces 2 : 7 = 2 + 5.",
				'Il reste à ajouter le morceau : 10 + 5 = 15.',
			],
		),
	],
	'math-complements': [
		etayageRedige(
			'Le complément à 10, 100, 1 000',
			"Le complément, c'est ce qui manque pour arriver PILE au nombre rond.",
			[
				'Repère la cible : 10, 100 ou 1 000 ?',
				'Compte ce qui manque : de 800 à 1 000, il manque 200.',
				'Vérifie en additionnant : 800 + 200 = 1 000.',
			],
		),
	],
	'math-doubles': [
		etayageRedige('Les doubles', "Le double, c'est deux fois le même nombre : 19 + 19.", [
			'Coupe le nombre en dizaines et unités : 19 = 10 + 9.',
			'Double chaque morceau : 10 + 10 = 20, et 9 + 9 = 18.',
			'Rassemble : 20 + 18 = 38.',
		]),
	],
	'math-moities': [
		etayageRedige('Les moitiés', "La moitié, c'est le nombre partagé en deux parts égales.", [
			'Garde en tête la moitié de 10, qui est 5 : elle sert tout le temps.',
			'Coupe en dizaines faciles : 30 = 20 + 10.',
			'Moitié de 20 = 10, moitié de 10 = 5, donc la moitié de 30 est 15.',
		]),
	],
	// Deux familles dans une seule leçon (cas 5 : 8·18·28 ET 9·19·28) : la compensation est
	// la même, seul le nombre à rendre change. Le 3ᵉ pas les donne toutes les deux — c'est
	// le pas sans lequel l'aide serait fausse une fois sur deux.
	'math-ajouter-9-19-29': [
		etayageRedige(
			'Ajouter 9, 19, 29 (et 8, 18, 28)',
			"Ajouter 9, c'est ajouter 10 puis enlever 1 : le nombre rond est bien plus facile.",
			[
				'Monte au nombre rond juste au-dessus : 19 devient 20, et 18 devient 20 aussi.',
				'Ajoute ce nombre rond : 47 + 20 = 67.',
				'Rends ce que tu as ajouté en trop : 1 de trop pour 9, 19, 29 ; 2 de trop pour 8, 18, 28. Donc 67 - 1 = 66.',
			],
		),
	],
	'math-soustraire-9-19-29': [
		etayageRedige(
			'Soustraire 9, 19, 29',
			"Enlever 9, c'est enlever 10 puis en rendre 1 : on en a enlevé un de trop.",
			[
				'Monte au nombre rond juste au-dessus : 19 devient 20.',
				'Enlève ce nombre rond : 46 - 20 = 26.',
				'Rends ce que tu as enlevé en trop : 26 + 1 = 27.',
			],
		),
	],
	// La règle porte la stratégie que les pas déroulent (repartir d'un résultat connu), et
	// non la commutativité : à un enfant qui a oublié 4 × 9, savoir qu'il peut le lire
	// 9 × 4 ne sert à rien, il ne connaît ni l'un ni l'autre (constat du pédagogue).
	'math-tables-multiplication': [
		etayageRedige(
			'Les tables de multiplication',
			"Un résultat oublié se retrouve en repartant d'un résultat facile, comme la table de 10.",
			[
				'Cherche un résultat voisin que tu sais déjà : 4 × 10 = 40.',
				"Compte les paquets d'écart : 4 × 9, c'est un paquet de 4 en moins.",
				'Ajuste : 40 - 4 = 36. Et souviens-toi que 4 × 9 et 9 × 4 donnent la même chose.',
			],
		),
	],
	'math-moitie-pair': [
		etayageRedige(
			"La moitié d'un nombre pair",
			'Couper le nombre en deux morceaux faciles rend la moitié calculable de tête.',
			[
				'Coupe en dizaines et unités : 64 = 60 + 4.',
				'Prends la moitié de chaque morceau : 30 et 2, donc 32.',
				'Dizaines impaires ? Coupe autrement : 54 = 40 + 14, donc 20 + 7 = 27.',
			],
		),
	],
	'math-multiples-25': [
		etayageRedige(
			'Les multiples de 25',
			"Quatre fois 25 font 100 : on s'appuie sur les centaines, comme avec les pièces de 25 centimes.",
			[
				'Découpe en paquets de 4 : 7 = 4 + 3.',
				'4 × 25 = 100, et 3 × 25 = 75.',
				'Rassemble : 100 + 75 = 175.',
			],
		),
	],
	// Les couples sont DANS les pas, pas seulement dans la règle : le facteur tiré descend
	// à 2, et « compte de 2 en 2 jusqu'à 60 » ne s'exécute pas de tête (30 bonds).
	'math-decompo-60': [
		etayageRedige(
			'Décomposer 60',
			"60 se partage en paquets égaux de plein de façons : c'est ce qui rend l'heure si pratique.",
			[
				'Lis ce qui est donné : 12 × ? = 60.',
				'Retiens les couples qui font 60 : 2 et 30, 3 et 20, 4 et 15, 5 et 12, 6 et 10.',
				'Cherche le couple où se trouve ton nombre : 12 va avec 5, donc 12 × 5 = 60.',
			],
		),
	],
	// Le 3ᵉ pas couvre les DEUX débordements, parce que le générateur tire aussi bien
	// 385 + 40 (12 dizaines) que 214 - 40 (1 dizaine qui ne suffit pas).
	'math-dizaines-centaines': [
		etayageRedige(
			'Ajouter ou enlever des dizaines, des centaines',
			"On n'ajoute des dizaines qu'aux dizaines, et des centaines qu'aux centaines.",
			[
				'Repère le rang : 40, ce sont 4 dizaines ; 200, ce sont 2 centaines.',
				'Calcule sur ce rang seulement : dans 426 + 40, 2 dizaines et 4 dizaines font 6 dizaines, donc 466.',
				'Si le rang déborde ou ne suffit pas, échange avec le rang voisin : 385 + 40 = 425, et 214 - 40 = 174.',
			],
		),
	],
	// La règle explique le zéro au lieu de contredire l'astuce « j'ajoute un zéro » affichée
	// sur la fiche de la même leçon (`sub`, core/lessons.ts) : deux consignes opposées sur
	// le même écran perdraient l'enfant. Elle reste vraie quand les décimaux arriveront,
	// où l'astuce, elle, tombe en panne.
	'math-multiplier-10-100': [
		etayageRedige(
			'Multiplier par 10, par 100',
			"Multiplier par 10, c'est faire monter chaque chiffre d'un rang : les unités deviennent des dizaines.",
			[
				'13 × 10 : les 3 unités deviennent 3 dizaines, et la dizaine devient une centaine.',
				"Le rang des unités est vide : on y écrit 0 pour qu'il garde sa place, donc 130.",
				'Par 100, chaque chiffre monte de DEUX rangs : 34 × 100 = 3 400.',
			],
		),
	],
	'math-multiplier-4-8': [
		etayageRedige(
			'Multiplier par 4, par 8',
			"Multiplier par 4, c'est doubler deux fois ; par 8, c'est doubler trois fois.",
			[
				'Double une première fois : pour 12 × 8, calcule 12 + 12 = 24.',
				'Double encore : 48 (tu viens de faire 12 × 4).',
				'Double une dernière fois : 96.',
			],
		),
	],
	'math-multiplier-20-30-40': [
		etayageRedige(
			'Multiplier par 20, 30, 40',
			"30, c'est 3 × 10 : on multiplie par le chiffre, puis par 10.",
			[
				'Mets le zéro de côté : 8 × 3 = 24.',
				'Remets le rang que tu avais mis de côté : × 10.',
				'24 × 10 = 240.',
			],
		),
	],
	'math-decomposer-multiplication': [
		etayageRedige(
			'Décomposer pour multiplier',
			'Un nombre trop grand pour la table se coupe en deux morceaux faciles : 13 = 10 + 3.',
			[
				'Coupe le nombre en dizaines et unités : 13 = 10 + 3.',
				'Multiplie chaque morceau : 9 × 10 = 90, et 9 × 3 = 27.',
				'Additionne les deux : 90 + 27 = 117.',
			],
		),
	],
	// ---- CM1 (#241) ----
	'math-multiples-50': [
		etayageRedige(
			'Les multiples de 50',
			"50, c'est la moitié de 100 : deux paquets de 50 font toujours une centaine.",
			[
				"Multiplie d'abord par 100 : 11 × 100 = 1 100.",
				'Prends la moitié du résultat : 1 100 ÷ 2 = 550.',
				'Vérifie la fin du nombre : un multiple de 50 finit par 50 ou par 00.',
			],
		),
	],
	'math-diviser-10-100': [
		etayageRedige(
			'Diviser par 10, par 100',
			"Diviser par 10, c'est faire descendre chaque chiffre d'un rang : les dizaines deviennent des unités.",
			[
				'960 ÷ 10 : les 6 dizaines deviennent 6 unités, et les 9 centaines deviennent 9 dizaines.',
				"Le 0 des unités n'a plus de rang où aller : il reste 96.",
				'Par 100, chaque chiffre descend de DEUX rangs : 6 400 ÷ 100 = 64.',
			],
		),
	],
};
