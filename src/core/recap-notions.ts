/* ============================================================
   Récap éphémère de fin de séance (#537) — ce que le récap NOMME.
   ------------------------------------------------------------
   Une séance qui a mélangé plusieurs activités ne laisse rien de nommable à
   l'enfant : le retour existant est GLOBAL (un pourcentage, une étoile) là où ce
   qui nourrit le sentiment de compétence à cet âge est SPÉCIFIQUE — pouvoir dire
   ce qu'on a travaillé, avec des mots.

   Ce module est la décision pure : à partir des notions rencontrées, il dit ce
   qui est nommé et avec quelle phrase. Il ne lit AUCUN stockage et ne connaît
   PAS le catalogue : les libellés lui sont fournis déjà résolus (`NotionRecap`),
   ce qui le rend testable sans profil ni niveau actif — et garantit le critère
   « aucune lecture de stockage persistant » à l'endroit où la décision se prend.

   Deux règles y vivent, toutes deux issues du cadrage :
   - au-delà de MAX_NOTIONS_NOMMEES notions, on AGRÈGE par catégorie plutôt que
     d'énumérer (une liste de douze leçons ne se retient pas, et se lit comme un
     relevé de suivi) ;
   - le récap AUTONOME d'un sprint / d'une révision s'efface quand le programme du
     jour va déjà le nommer (cf. `recapAutonomeMasque`).

   Ce que ce module NE porte PAS, volontairement : aucun compte, aucun
   pourcentage, aucune comparaison. `NotionRecap` n'a ni `ok` ni `total` — le
   récap dit ce qui a été travaillé, jamais comment ça s'est passé.
   ============================================================ */
import { enumererFr } from './utils';
import type { SeanceModeKind } from './seance';

/** Une notion travaillée pendant la séance, déjà résolue en libellés par l'appelant.
    `id` sert au dédoublonnage (une même leçon revue trois fois n'est nommée qu'une). */
export interface NotionRecap {
	id: string; // id de dédoublonnage (leçon, liste d'orthographe…)
	label: string; // libellé lisible de la notion, résolu au niveau joué
	categorie: string; // libellé de la catégorie — support de l'agrégation
}

/** Nombre maximum de choses que le récap NOMME, quelle que soit la forme : au-delà de
    5 notions distinctes il agrège par catégorie, et l'agrégat lui-même est plafonné là.
    5 : borne du cadrage. Au-dessus, l'enfant ne lit plus une phrase mais une liste. */
export const MAX_NOTIONS_NOMMEES = 5;

export interface ContenuRecap {
	/** 'notions' : chaque leçon est nommée ; 'categories' : agrégation au-delà de la borne. */
	forme: 'notions' | 'categories';
	labels: string[];
}

/** Décide ce que le récap NOMME. `null` = rien à nommer, donc aucun récap affiché
    (une séance sans notion identifiable ne mérite pas une phrase vide).
    L'ordre de rencontre est conservé : c'est l'ordre dans lequel l'enfant vient de
    travailler, le seul qu'il puisse reconnaître. */
export function contenuRecap(notions: readonly NotionRecap[]): ContenuRecap | null {
	const vues = new Set<string>();
	const distinctes: NotionRecap[] = [];
	for (const n of notions) {
		if (vues.has(n.id)) continue;
		vues.add(n.id);
		distinctes.push(n);
	}
	if (distinctes.length === 0) return null;
	if (distinctes.length <= MAX_NOTIONS_NOMMEES) {
		// Dédoublonnage des LIBELLÉS en plus des ids : deux leçons d'ids différents peuvent
		// porter le même libellé (variantes de niveau d'une même notion), et « Tu as
		// travaillé : Additionner et Additionner » se lit comme un bug. L'id reste la clé de
		// l'agrégation par catégorie ci-dessous ; ici on ne nomme jamais deux fois la même
		// chose (remontée `auteur-tests-logique`).
		const labels: string[] = [];
		for (const n of distinctes) if (!labels.includes(n.label)) labels.push(n.label);
		return { forme: 'notions', labels };
	}
	const cats: string[] = [];
	for (const n of distinctes) if (!cats.includes(n.categorie)) cats.push(n.categorie);
	// Même plafond sur les catégories que sur les notions. Le cadrage ne le demandait pas —
	// il ne bornait que les notions — mais un bilan complet de maths traverse jusqu'à SEPT
	// catégories, soit une phrase de ~130 caractères, quatre lignes sur un téléphone : au-delà
	// de quatre ou cinq items, l'enfant ne repart plus avec des mots mais avec une liste qu'il
	// ne peut pas restituer (empan mnésique à 8-9 ans, avis `pedagogue-primaire`). Le récap ne
	// nomme donc JAMAIS plus de MAX_NOTIONS_NOMMEES choses, quelle que soit la forme.
	// Arbitrage du mainteneur, tracé en commentaire daté sur #537.
	return { forme: 'categories', labels: cats.slice(0, MAX_NOTIONS_NOMMEES) };
}

/** Gabarits de phrase du récap. TROIS au minimum, alternés (cf. `phraseRecap`) : un bloc
    identique à chaque fin de séance s'apprend à sauter, et le récap ne vaut que s'il est
    encore lu.

    Deux contraintes de langue, toutes deux issues d'avis rendus sur #537 :
    - aucun participe ACCORDABLE (« entraînée ») : la phrase doit être juste pour tous les
      enfants sans connaître leur genre ;
    - la variation porte sur l'INCIPIT, pas sur la charpente : les trois gabarits gardent
      `tu` + verbe + deux-points + liste. Trois architectures syntaxiques différentes
      obligeraient l'enfant à re-analyser la phrase à chaque lecture, et détourneraient
      justement le budget de lecture qu'on veut consacrer aux NOMS des notions (avis
      `pedagogue-primaire`). Écarté pour la même raison : « Ce que tu viens de faire : … »
      (relative substantivée — syntaxe de phrase complexe, hors attendus CE2).

    Les gabarits 2 et 3 partagent le verbe « fait », faute de troisième verbe juste : ce qui
    les distingue est la POSITION du sujet (les deux premiers ouvrent sur « Tu », le
    troisième non), et c'est elle que l'oreille entend d'abord. « Tu as revu » a été écarté —
    il affirme que la notion avait déjà été vue, ce qui est faux à la première séance
    (avis `redacteur-contenu-francais`). */
export const GABARITS_RECAP: readonly ((liste: string) => string)[] = [
	(liste) => `Tu as travaillé : ${liste}.`,
	(liste) => `Tu viens de faire : ${liste}.`,
	(liste) => `Cette séance, tu as fait : ${liste}.`,
];

/** Phrase du récap. `tour` (entier ≥ 0) choisit le gabarit par rotation : deux récaps
    consécutifs ne se ressemblent donc jamais. Rotation DÉTERMINISTE et non aléatoire —
    un tirage pouvait répéter deux fois le même gabarit, soit exactement le bloc
    qu'on cherche à éviter. */
export function phraseRecap(contenu: ContenuRecap, tour: number): string {
	const i = ((tour % GABARITS_RECAP.length) + GABARITS_RECAP.length) % GABARITS_RECAP.length;
	return GABARITS_RECAP[i](enumererFr(contenu.labels));
}

/** Le récap AUTONOME d'un sprint / d'une révision est-il masqué ?

    Oui quand un programme du jour ACTIF et NON COMPLET contient une étape du même
    `kind` : ce sprint comptera très probablement pour cette étape, et le récap du
    programme le nommera. Deux récaps pour la même activité, à deux écrans d'écart,
    se contrediraient sur la forme sans rien apporter.

    Règle grossière ASSUMÉE (cadrage) plutôt qu'une pré-vérification fine :
    l'attribution au programme est RÉTROSPECTIVE (`rafraichirProgramme` tourne à la
    navigation), donc à la fin du sprint l'application ne sait pas encore si ce sprint
    comptera. Dupliquer la logique d'appariement a été écarté.

    `'aRevoir'` ne compte pas comme une étape de révision : cette étape se satisfait
    d'une leçon ou d'une dictée selon la cible épinglée (cf. `etapeSatisfaite`), pas
    d'une révision espacée. */
export function recapAutonomeMasque(
	kind: 'sprint' | 'revision',
	programme: { complete: boolean; kinds: readonly SeanceModeKind[] } | null,
): boolean {
	if (!programme || programme.complete) return false;
	return programme.kinds.includes(kind);
}
