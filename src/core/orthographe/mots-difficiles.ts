/* ============================================================
   Mots qui ont résisté pendant une séance (#618) — ce que l'écran de fin NOMME.
   ------------------------------------------------------------
   Les écrans de fin d'orthographe annonçaient un DÉNOMBREMENT (« tu as bien
   travaillé les 10 mots de cette liste ») là où l'unité utile, en orthographe
   lexicale, est le MOT : c'est un mot précis qu'il faut remémoriser, pas « son
   score de dictée » qu'il faut améliorer.

   Ce module est la décision pure : à partir des mots passés par la correction
   guidée, il dit ce qui est nommé et avec quelle phrase. Il ne lit AUCUN stockage,
   ne connaît ni la banque ni les listes — on lui passe des FORMES CORRECTES déjà
   résolues, ce qui garantit le critère 5 (jamais la saisie fautive de l'enfant) à
   l'endroit même où la phrase se fabrique.

   Deux règles y vivent, toutes deux issues du cadrage :
   - au-delà de MAX_MOTS_NOMMES mots, on ne nomme PLUS RIEN individuellement et on
     bascule sur une phrase collective (critère 4) — pas « trois noms et un
     autre » : nommer trois mots sur cinq désigne arbitrairement les trois
     premiers rencontrés, ce qui n'est ni la liste des mots fragiles ni un
     échantillon utile ;
   - aucune QUANTITÉ, ni en chiffres ni en lettres (critère négatif 10) : un
     compteur de fin de séance fonctionne comme un score inversé, qu'un enfant
     compare d'une séance à l'autre de mémoire. D'où « Plusieurs mots » et jamais
     « 4 mots ». L'accord singulier/pluriel, lui, reste libre : c'est de la
     grammaire, pas un décompte.

   Le REGISTRE dépend de l'écran porteur, et c'est le seul rôle de
   `ContexteMotsDifficiles` (décision 4 du cadrage).
   ============================================================ */
import { enumererFr } from '../utils';

/** Écran qui porte le bloc.
    - `pause` : des mots sont encore EN TRAVAUX. Ton neutre qui soutient
      l'autonomie — « Continuer encore un peu » et « Revenir une autre fois »
      doivent rester deux options également valables, donc pas d'incitation
      déguisée à poursuivre. La NEUTRALITÉ y porte sur le registre autant que sur
      la syntaxe : « ce mot te résiste » n'a aucun impératif mais fait pencher le
      choix par sa seule charge affective. Et la difficulté s'attribue à la TÂCHE
      (« ce mot demande du travail »), jamais à l'enfant (« difficile pour toi »),
      qui personnalise un déficit là où le sentiment de compétence est le plus
      exposé. Formule confirmée telle quelle par le `pedagogue-primaire`.
    - `bilan` : la liste vient d'être étoilée, donc tous les mots nommés sont
      ACQUIS à cet instant (c'est la condition d'affichage de l'écran). On
      reconnaît l'effort fourni, jamais une fragilité qui n'existe plus.
    - `revision` : fin d'une révision espacée. Ni acquisition proclamée (le mot
      reviendra), ni travail en cours (la séance est finie) : on constate l'effort. */
export type ContexteMotsDifficiles = 'pause' | 'bilan' | 'revision';

/** Nombre maximum de mots NOMMÉS. Au-delà, formulation groupée non nominative.
    3 : borne du cadrage, délibérément plus basse que les 5 notions du récap de
    #537 — un échec ne se nomme pas comme une notion travaillée. */
export const MAX_MOTS_NOMMES = 3;

export interface ContenuMotsDifficiles {
	/** 'nommes' : chaque mot est nommé ; 'groupee' : aucun nom, phrase collective. */
	forme: 'nommes' | 'groupee';
	/** Mots nommés, dans l'ordre de rencontre. VIDE quand `forme` vaut 'groupee' :
	    la formulation groupée est non nominative, elle ne garde donc rien à dire. */
	mots: string[];
}

/** Décide ce que l'écran NOMME. `null` = rien à nommer, donc aucun bloc affiché
    (une séance sans mot difficile ne mérite pas une phrase vide).

    L'entrée peut contenir des DOUBLONS — un même mot peut résister deux fois dans
    la même séance, sur deux activités différentes — et le plafond porte sur les
    mots DISTINCTS : quatre échecs sur trois mots restent trois noms. L'ordre de
    rencontre est conservé, c'est le seul que l'enfant puisse reconnaître.

    Les entrées vides ou en espaces sont écartées : elles ne viendraient que d'une
    donnée abîmée, et « tu sais écrire :  et chemin » se lit comme un bug. */
export function contenuMotsDifficiles(mots: readonly string[]): ContenuMotsDifficiles | null {
	const distincts: string[] = [];
	for (const m of mots) {
		const mot = m?.trim();
		if (!mot || distincts.includes(mot)) continue;
		distincts.push(mot);
	}
	if (distincts.length === 0) return null;
	if (distincts.length > MAX_MOTS_NOMMES) return { forme: 'groupee', mots: [] };
	return { forme: 'nommes', mots: distincts };
}

/* Phrases, par contexte et par forme. Aucun participe ACCORDABLE (même contrainte
   que le récap de #537 : la phrase doit être juste sans connaître le genre de
   l'enfant) — « demandé » est ici invariable, son COD suit. */
const PHRASES: Record<
	ContexteMotsDifficiles,
	{ un: (liste: string) => string; plusieurs: (liste: string) => string; groupee: string }
> = {
	// « encore du travail » et non « encore UN PEU de travail » : la pause affiche déjà
	// « continuer encore un peu » dans sa phrase d'accueil ET sur son bouton principal.
	// Reprendre le même trigramme dans le texte censé rester neutre l'accole au bouton et
	// crée une incitation par simple voisinage — que ne voit aucune liste de mots interdits
	// (remontée `redacteur-contenu-francais`). Aligne au passage la charpente sur les deux
	// autres contextes, qui disent « du travail » tout court.
	pause: {
		un: (l) => `Ce mot te demande encore du travail : ${l}.`,
		plusieurs: (l) => `Ces mots te demandent encore du travail : ${l}.`,
		groupee: 'Plusieurs mots te demandent encore du travail.',
	},
	// DEUX phrases courtes, et la révélation du mot AVANT la résolution : une clause
	// unique (« Ce mot t'a demandé du travail, et maintenant tu sais l'écrire : bateau »)
	// fait porter le référent sur deux verbes avant que le deux-points ne le nomme enfin,
	// ce qui coûte cher à un lecteur CE2 fragile — soit exactement le public concerné
	// (remontée `redacteur-contenu-francais`).
	bilan: {
		un: (l) => `Ce mot t'a demandé du travail : ${l}. Maintenant, tu sais l'écrire !`,
		plusieurs: (l) => `Ces mots t'ont demandé du travail : ${l}. Maintenant, tu sais les écrire !`,
		groupee: "Plusieurs mots t'ont demandé du travail. Maintenant, tu sais les écrire !",
	},
	revision: {
		un: (l) => `Ce mot t'a demandé du travail : ${l}.`,
		plusieurs: (l) => `Ces mots t'ont demandé du travail : ${l}.`,
		groupee: "Plusieurs mots t'ont demandé du travail.",
	},
};

/** Phrase du bloc, selon l'écran porteur.

    Le plafond est REVÉRIFIÉ ici, et pas seulement dans `contenuMotsDifficiles` : un
    contenu construit à la main (`{forme:'nommes', mots:[...5]}`) énumérait sinon les
    cinq mots sans que rien ne l'arrête, et le critère 4 ne tenait qu'à la discipline
    des appelants. Remontée `auteur-tests-logique`. La borne vit ainsi à l'endroit où
    la phrase se fabrique, donc là où elle ne peut plus être contournée. */
export function phraseMotsDifficiles(
	contenu: ContenuMotsDifficiles,
	contexte: ContexteMotsDifficiles,
): string {
	const p = PHRASES[contexte];
	if (contenu.forme === 'groupee' || contenu.mots.length === 0) return p.groupee;
	if (contenu.mots.length > MAX_MOTS_NOMMES) return p.groupee;
	const liste = enumererFr(contenu.mots);
	return contenu.mots.length === 1 ? p.un(liste) : p.plusieurs(liste);
}
