/* ============================================================
   Grammaire — « Clique sur le mot » (#259, #437).
   ------------------------------------------------------------
   Brique d'interaction « clique sur le mot » : l'enfant lit une phrase rendue MOT
   PAR MOT et sélectionne le(s) mot(s) répondant à la consigne. Le runner d'écran
   (ui/lecon-clic-mot.ts) est AGNOSTIQUE de la notation grammaticale ciblée : il
   consomme `consigne`, `explication`, `cibleIndices` (et le libellé `cibleLabel`)
   et corrige par ÉGALITÉ D'ENSEMBLES exacte (cibles multi-mots, y compris NON
   adjacentes).

   Leçons branchées ici :
   - « Clique sur le verbe » (#259) — verbe conjugué (CE2 + CM1) ; 1 mot aux temps
     simples, 2 mots adjacents au passé composé (auxiliaire + participe).
   - « Clique sur le déterminant » (#437, CM1) — article / possessif / démonstratif
     (consigne et cibleLabel PAR ITEM).
   - « Clique sur la conjonction » (#437, CM1) — conjonction de coordination
     (mais / ou / et / donc / or / ni / car ; ni…ni = cible DOUBLE non adjacente).
   - « Clique sur le pronom » (#437, CM1) — pronom personnel sujet vs complément
     (consigne et cibleLabel PAR ITEM).
   - « Clique sur le nom noyau » (#437, CM1) — nom noyau d'un GN développé.
   - « Clique sur le sujet » (#437, CM1) — noyau(x) du groupe sujet, sujet composé
     de deux noms propres compris (cible DOUBLE non adjacente, « Paul … Léa »).

   Modèle de données : chaque phrase est AUTORÉE (texte + mot(s)-cible) puis découpée
   en TOKENS (mots + ponctuation) ; l'ensemble des indices-cibles est CALCULÉ UNE FOIS
   À LA CONSTRUCTION de la banque. L'item généré porte ces indices STOCKÉS ; le runner
   ne recalcule rien. Garde-fous d'unicité : chaque mot-cible doit apparaître le bon
   nombre de fois (sinon erreur de construction) — un cran contre les cibles ambiguës.

   Garde-fous pédagogiques (design arrêté 2025 §5.1, relus par le rédacteur FR) :
   - UNE seule réponse indiscutable par phrase ;
   - lexique et longueur CM1 (6-10 mots), phrases naturelles, apostrophe DROITE `'` ;
   - interdits d'ambiguïté propres à chaque leçon (homographes/homophones exclus)
     documentés au fil des banques ci-dessous.
   ============================================================ */
import type { Exercise, ExerciseType, GenerateOpts, ModeOption } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { choice } from '../../core/utils';
import type { LessonInput } from '../_shared';

/** Une phrase annotée prête à jouer. `tokens` = la phrase mot à mot (mots +
    ponctuation) ; `cibleIndices` = l'ensemble EXACT des indices attendus (1, 2 ou
    plus — adjacents ou non) ; `explication` = justification courte affichée après
    « Vérifier ». `consigne`/`cibleLabel` (#437) surchargent, PAR PHRASE, les valeurs
    par défaut du type d'exercice (leçons « déterminant »/« pronom » où la tâche varie
    d'un item à l'autre). Absents ⇒ valeurs par défaut du type. */
export interface PhraseClicMot {
	tokens: string[];
	cibleIndices: number[];
	explication: string;
	consigne?: string;
	cibleLabel?: string;
}

/* Découpage : une suite de lettres/chiffres (avec apostrophe droite ou trait
   d'union internes : « l'oiseau », « grand-mère ») OU un signe de ponctuation
   isolé. L'apostrophe retenue est la DROITE (choix d'accessibilité clavier). */
const TOKEN_RE = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*|[.,;:!?…«»]/gu;
const PONCT_RE = /^[.,;:!?…«»]+$/u;
/* Ponctuation « haute » précédée d'une espace en typographie française. */
const PONCT_ESPACE_AVANT = new Set([';', ':', '!', '?']);

/** Un token est-il de la ponctuation (donc NON cliquable dans le runner) ? */
export function estPonctuation(token: string): boolean {
	return PONCT_RE.test(token);
}

/** Recompose la phrase lisible depuis ses tokens (colle la ponctuation au mot qui
    précède, espace française avant « ; : ! ? »). Sert au texte LU (TTS) et au repli
    non interactif (bilan/révision). */
export function joindrePhrase(tokens: string[]): string {
	let out = '';
	for (const t of tokens) {
		if (out === '') out = t;
		else if (estPonctuation(t)) out += (PONCT_ESPACE_AVANT.has(t) ? ' ' : '') + t;
		else out += ' ' + t;
	}
	return out;
}

function tokeniser(texte: string): string[] {
	return texte.match(TOKEN_RE) ?? [];
}

/** Libellé LU / RECOPIÉ des mots-cibles d'un item (joint les tokens ciblés). Cible
    CONTIGUË (verbe « a mangé ») → espace ; cible NON contiguë (sujet composé
    « Paul … Léa », « ni … ni ») → « et », pour ne pas produire « Paul Léa » ni
    « ni ni ». SOURCE UNIQUE de cette jointure, partagée par le runner (annonce live)
    et le repli non interactif du catalogue (réponse STOCKÉE du bilan/fiche/révision) :
    les deux consommateurs de `cibleIndices` doivent énoncer la même chose. */
export function libelleCible(tokens: string[], cibleIndices: number[]): string {
	const contigu = cibleIndices.every((v, k) => k === 0 || v === cibleIndices[k - 1] + 1);
	return cibleIndices.map((i) => tokens[i]).join(contigu ? ' ' : ' et ');
}

/* Toutes les positions de départ où la suite `mots` apparaît dans `tokens`
   (comparaison insensible à la casse — le mot-cible peut ouvrir la phrase en
   majuscule, ex. un impératif ou un nom propre). Sert au garde-fou d'unicité. */
function positionsSuite(tokens: string[], mots: string[]): number[] {
	const out: number[] = [];
	for (let i = 0; i + mots.length <= tokens.length; i++) {
		let ok = true;
		for (let k = 0; k < mots.length; k++) {
			if (tokens[i + k].toLowerCase() !== mots[k].toLowerCase()) {
				ok = false;
				break;
			}
		}
		if (ok) out.push(i);
	}
	return out;
}

/* Construit une phrase annotée depuis (texte, verbe) — cible CONTIGUË (1 mot aux
   temps simples, 2 au passé composé). L'explication est dérivée du nombre de mots.
   Erreur de construction si le verbe ne se trouve PAS exactement une fois : garde-fou
   contre une cible ambiguë (deux occurrences) ou une faute de frappe (zéro).
   Exportée (comme `phraseMots`/`det`/`pron`) pour tester DIRECTEMENT son chemin `throw`. */
export function phrase(texte: string, verbe: string): PhraseClicMot {
	const tokens = tokeniser(texte);
	const motsVerbe = tokeniser(verbe);
	const positions = positionsSuite(tokens, motsVerbe);
	if (positions.length !== 1) {
		throw new Error(
			`grammaire-clic-mot : « ${verbe} » doit apparaître exactement une fois dans ` +
				`« ${texte} » (trouvé ${positions.length}×).`,
		);
	}
	const start = positions[0];
	const cibleIndices = motsVerbe.map((_, k) => start + k);
	const texteVerbe = cibleIndices.map((i) => tokens[i]).join(' ');
	const explication =
		cibleIndices.length > 1
			? `Le verbe conjugué est en deux mots : « ${texteVerbe} » (l'auxiliaire et le participe passé).`
			: `Le verbe, c'est le mot qui dit l'action ou l'état : ici « ${texteVerbe} ».`;
	return { tokens, cibleIndices, explication };
}

/** Construit une phrase annotée en ciblant un ENSEMBLE de mots ISOLÉS, éventuellement
    NON ADJACENTS (sujet composé « Paul … Léa » en sautant « et » ; « ni … ni »). Chaque
    entrée de `cibles` est UN mot (un token) ; un même mot répété volontairement dans
    `cibles` (« ni », « ni ») cible TOUTES ses occurrences (autant que de répétitions).
    Garde-fou d'unicité : chaque mot doit apparaître EXACTEMENT autant de fois qu'il est
    listé (sinon erreur de construction — cible ambiguë). L'ensemble d'indices peut
    « sauter » un mot (le runner corrige par égalité d'ensembles, pas par contiguïté). */
export function phraseMots(
	texte: string,
	cibles: string[],
	opts: { explication: string; consigne?: string; cibleLabel?: string },
): PhraseClicMot {
	const tokens = tokeniser(texte);
	// Multiplicité attendue par mot (insensible à la casse).
	const attendu = new Map<string, number>();
	for (const c of cibles) {
		const mots = tokeniser(c);
		if (mots.length !== 1) {
			throw new Error(
				`grammaire-clic-mot : « ${c} » doit être UN seul mot (phraseMots cible des mots isolés).`,
			);
		}
		const cle = mots[0].toLowerCase();
		attendu.set(cle, (attendu.get(cle) ?? 0) + 1);
	}
	const cibleIndices: number[] = [];
	for (const [mot, n] of attendu) {
		const positions: number[] = [];
		tokens.forEach((t, i) => {
			if (t.toLowerCase() === mot) positions.push(i);
		});
		if (positions.length !== n) {
			throw new Error(
				`grammaire-clic-mot : « ${mot} » doit apparaître exactement ${n} fois dans ` +
					`« ${texte} » (trouvé ${positions.length}).`,
			);
		}
		cibleIndices.push(...positions);
	}
	cibleIndices.sort((a, b) => a - b);
	return {
		tokens,
		cibleIndices,
		explication: opts.explication,
		consigne: opts.consigne,
		cibleLabel: opts.cibleLabel,
	};
}

/* Fabrique l'Exercise « clique sur le mot » depuis une phrase annotée. `consigne` et
   `cibleLabel` de la PHRASE priment sur les valeurs par défaut du type (leçons à tâche
   variable). Partagé par toutes les fabriques ci-dessous (verbe + 5 natures #437). */
function itemClicMot(
	p: PhraseClicMot,
	consigneDefaut: string,
	cibleLabelDefaut?: string,
): Exercise {
	return {
		type: 'clicMot',
		tokens: [...p.tokens],
		cibleIndices: [...p.cibleIndices],
		consigne: p.consigne ?? consigneDefaut,
		explication: p.explication,
		parle: joindrePhrase(p.tokens),
		cibleLabel: p.cibleLabel ?? cibleLabelDefaut,
	};
}

/* ============================================================
   Leçon « Clique sur le verbe » (#259) — verbe conjugué, CE2 + CM1.
   ============================================================ */

/* ---------- Banque CE2 : temps simples uniquement (cible = 1 mot) ----------
   Sujets variés (pronom, nom propre, GN simple), lexique CE2, position du verbe
   volontairement dispersée (impératif en tête, verbe en fin, etc.). */
export const PHRASES_CE2: PhraseClicMot[] = [
	// Présent
	phrase('Le chat dort tranquillement sur le canapé.', 'dort'),
	phrase('Les oiseaux chantent dans le grand jardin.', 'chantent'),
	phrase('Ma sœur dessine un joli bateau bleu.', 'dessine'),
	phrase('Le boulanger prépare de bons croissants chauds.', 'prépare'),
	phrase('Nous jouons au ballon dans la cour.', 'jouons'),
	phrase('Tu ranges tes affaires dans le tiroir.', 'ranges'),
	phrase('Le vent souffle très fort ce soir.', 'souffle'),
	phrase('Les élèves écoutent bien la maîtresse.', 'écoutent'),
	phrase('Papa lave la voiture devant la maison.', 'lave'),
	phrase('Le train arrive enfin à la gare.', 'arrive'),
	phrase('Mon petit frère pleure dans sa chambre.', 'pleure'),
	phrase('Le ciel est tout gris ce matin.', 'est'),
	phrase('La maîtresse écrit la date au tableau.', 'écrit'),
	phrase('Les poissons nagent dans le grand aquarium.', 'nagent'),
	phrase('Le facteur apporte une lettre très importante.', 'apporte'),
	phrase('Le chat du gardien miaule à la fenêtre.', 'miaule'),
	phrase('Le grand chien noir du voisin aboie.', 'aboie'),
	phrase('La petite fille aux cheveux blonds sourit.', 'sourit'),
	phrase('Chaque joueur de cette équipe court vite.', 'court'),
	// Imparfait
	phrase('Le petit garçon jouait dans le sable.', 'jouait'),
	phrase('Les enfants regardaient un beau film hier.', 'regardaient'),
	phrase('Grand-mère tricotait un pull bien chaud.', 'tricotait'),
	phrase('Le chien aboyait très fort hier soir.', 'aboyait'),
	phrase('Nous marchions vite vers la vieille école.', 'marchions'),
	phrase("Tu chantais une jolie chanson tout l'été.", 'chantais'),
	phrase('La rivière coulait au fond de la vallée.', 'coulait'),
	phrase('Le vieux marin racontait de belles histoires.', 'racontait'),
	// Futur
	phrase('Nous irons à la piscine demain matin.', 'irons'),
	phrase('Les grandes vacances commenceront dans deux jours.', 'commenceront'),
	phrase('Tu grandiras très vite cette année.', 'grandiras'),
	phrase('Le soleil brillera bientôt sur la plage.', 'brillera'),
	phrase('Mes amis viendront à mon anniversaire.', 'viendront'),
	phrase('Je finirai bientôt mon très beau dessin.', 'finirai'),
	phrase('Le fermier plantera des salades au printemps.', 'plantera'),
	phrase('Les feuilles tomberont bientôt des grands arbres.', 'tomberont'),
	// Impératif (verbe en tête)
	phrase('Range ta chambre avant le dîner.', 'Range'),
	phrase('Ferme doucement la porte du salon.', 'Ferme'),
	phrase('Écoute bien la consigne de la maîtresse.', 'Écoute'),
	phrase('Regarde ce magnifique château de sable.', 'Regarde'),
	phrase('Mange tes légumes avant le bon dessert.', 'Mange'),
	phrase("Prends ton manteau bleu dans l'armoire.", 'Prends'),
	phrase('Ouvre ton cahier à la bonne page.', 'Ouvre'),
	phrase('Ferme le robinet après le brossage des dents.', 'Ferme'),
	// Interrogative (intonation, ordre sujet-verbe)
	phrase('Tu pars en vacances la semaine prochaine ?', 'pars'),
	phrase('Vous aimez les fraises du jardin ?', 'aimez'),
	phrase('Le spectacle commence à quelle heure ?', 'commence'),
	phrase('Elle habite dans ce grand immeuble ?', 'habite'),
];

/* ---------- Banque CM1 : temps simples (revus) + passé composé + structures
   plus riches ----------
   La banque CM1 REPREND les phrases CE2 (temps simples, tous revus au CM1) et y
   AJOUTE : le passé composé (cible = 2 mots : auxiliaire + participe), l'inversion
   nominale du sujet (interrogative sans trait d'union) et le complément
   circonstanciel en tête (verbe rejeté plus loin). */
const CM1_EXTRAS: PhraseClicMot[] = [
	// Passé composé — cible = 2 mots (auxiliaire + participe, adjacents)
	phrase('Léa a mangé une pomme bien mûre.', 'a mangé'),
	phrase('Les enfants ont fini tous leurs devoirs.', 'ont fini'),
	phrase('Le chat a attrapé une petite souris grise.', 'a attrapé'),
	phrase('Nous avons visité un très beau château fort.', 'avons visité'),
	phrase('Tu as trouvé la bonne réponse tout seul.', 'as trouvé'),
	phrase('Elle est partie très tôt ce matin.', 'est partie'),
	phrase("Mon grand frère est tombé dans l'escalier.", 'est tombé'),
	phrase('Les oiseaux sont revenus au début du printemps.', 'sont revenus'),
	phrase('Le maître a expliqué la nouvelle leçon.', 'a expliqué'),
	phrase('Paul et Léa ont gagné le grand match.', 'ont gagné'),
	phrase('Le vent a cassé une grosse branche.', 'a cassé'),
	phrase('La cuisinière a préparé un très bon gâteau.', 'a préparé'),
	phrase('Les pompiers ont éteint le grand feu.', 'ont éteint'),
	// Interrogative à inversion nominale du sujet (verbe en position 1, sans trait d'union)
	phrase('Que mange le petit lapin gris ?', 'mange'),
	phrase('Où va ce train de marchandises ?', 'va'),
	phrase('Quand part le bus pour la ville ?', 'part'),
	phrase('Comment vont les enfants ce matin ?', 'vont'),
	phrase('Que dessine cette petite fille ?', 'dessine'),
	// Complément circonstanciel en tête (verbe rejeté plus loin dans la phrase)
	phrase('Chaque matin, le chat boit du lait.', 'boit'),
	phrase('Pendant les vacances, nous visiterons Paris.', 'visiterons'),
	phrase('Le soir, les étoiles brillent dans le ciel.', 'brillent'),
	phrase('Autrefois, les chevaliers portaient une lourde armure.', 'portaient'),
	phrase('Dès le matin, le coq chante très fort.', 'chante'),
	// Sujets plus étoffés (verbe au milieu / en fin)
	phrase("Les joueurs de l'équipe adverse courent très vite.", 'courent'),
	phrase('Mon oncle et ma tante habitent à Lyon.', 'habitent'),
	phrase('La lumière du vieux phare guidait les bateaux.', 'guidait'),
	phrase('Le champion de la course franchit la ligne.', 'franchit'),
];

export const PHRASES_CM1: PhraseClicMot[] = [...PHRASES_CE2, ...CM1_EXTRAS];

/* Consignes PERSISTANTES (affichées pendant toute la recherche). Au CM1, un
   micro-indice signale que le verbe peut être en plusieurs mots (passé composé). */
const CONSIGNE_CE2 = 'Clique sur le verbe conjugué de la phrase.';
const CONSIGNE_CM1 =
	'Clique sur le verbe conjugué. Au passé composé, il est en deux mots (exemple : a mangé) : clique sur les deux !';

/* Mode unique (comme l'appariement / le tri) : lancement direct du runner dédié,
   pas d'écran de choix de mode (#69). Le libellé du mode reste invisible (mono-mode :
   pas d'écran de choix) — il est neutre pour être réutilisé par les 5 natures. */
const MODE_CLIC: ModeOption[] = [{ id: 'clic', label: 'Clique sur le mot', recommended: true }];

/* Fabrique de la leçon « verbe ». `generate` se branche sur `opts.level` (banque CE2
   ou CM1) et STOCKE l'ensemble cible ; `check` renvoie toujours false (le runner
   ui/lecon-clic-mot.ts corrige lui-même par égalité d'ensembles). */
export function clicVerbeType(): ExerciseType {
	return {
		modes: MODE_CLIC,
		consigne: CONSIGNE_CE2,
		exerciseKind: 'clicMot',
		levels: ['ce2', 'cm1'],
		generate(opts?: GenerateOpts): Exercise {
			const niveau: SchoolLevel = opts?.level === 'cm1' ? 'cm1' : 'ce2';
			const banque = niveau === 'cm1' ? PHRASES_CM1 : PHRASES_CE2;
			const consigne = niveau === 'cm1' ? CONSIGNE_CM1 : CONSIGNE_CE2;
			return itemClicMot(choice(banque), consigne, 'le verbe conjugué');
		},
		check: () => false,
	};
}

/* ---------- Fabrique GÉNÉRIQUE des natures « clique sur le mot » (#437) ----------
   Une banque MONO-NIVEAU (CM1 par défaut) + une `consigne`/`cibleLabel` par défaut,
   chaque phrase pouvant les surcharger. Paramétrise proprement les 5 leçons de
   natures (déterminant, conjonction, pronom, nom noyau, sujet) sans dupliquer la
   mécanique. `check` renvoie toujours false (le runner corrige). */
export function clicMotType(opts: {
	banque: PhraseClicMot[];
	consigne: string;
	cibleLabel?: string;
	levels?: SchoolLevel[];
}): ExerciseType {
	const { banque, consigne, cibleLabel, levels = ['cm1'] } = opts;
	return {
		modes: MODE_CLIC,
		consigne,
		exerciseKind: 'clicMot',
		levels,
		generate(): Exercise {
			return itemClicMot(choice(banque), consigne, cibleLabel);
		},
		check: () => false,
	};
}

/* ============================================================
   Leçon A — Conjonctions de coordination (#437, CM1).
   ------------------------------------------------------------
   Cible = la conjonction de coordination (mais / ou / et / donc / or / ni / car).
   Interdits d'ambiguïté (garde-fous, pas des détails) :
   - jamais « car » (le bus) ni « or » (le métal) comme NOM dans cette banque —
     seuls les emplois CONJONCTION apparaissent ;
   - « ou » ne côtoie jamais « où » (homophones fragiles en TTS) : « où » est ABSENT ;
   - « ni » s'emploie en PAIRE → cible DOUBLE non adjacente (les deux « ni ») ;
   - « or » (le plus abstrait) : peu de phrases, contextes limpides.
   ============================================================ */
const CONSIGNE_CONJ = 'Clique sur la conjonction de coordination de la phrase.';
const CIBLE_CONJ = 'la conjonction de coordination';

function conj(texte: string, conjonction: string): PhraseClicMot {
	return phraseMots(texte, [conjonction], {
		explication: `« ${conjonction} » relie deux mots, deux groupes ou deux phrases : c'est une conjonction de coordination.`,
	});
}
/* ni…ni : les DEUX « ni » forment la cible (non adjacente). */
function conjNi(texte: string): PhraseClicMot {
	return phraseMots(texte, ['ni', 'ni'], {
		explication:
			"« ni … ni » relie deux mots ou deux groupes en les niant : c'est une conjonction de coordination.",
	});
}

export const PHRASES_CONJ: PhraseClicMot[] = [
	// mais (opposition)
	conj('Il pleut, mais nous sortons quand même.', 'mais'),
	conj('Le gâteau est petit, mais il est délicieux.', 'mais'),
	conj('Je suis fatigué, mais je termine mon travail.', 'mais'),
	conj('Elle court vite, mais son frère court plus vite.', 'mais'),
	conj('Ce livre est ancien, mais il reste passionnant.', 'mais'),
	conj('Nous voulions partir, mais la voiture est cassée.', 'mais'),
	conj('Le film était long, mais vraiment intéressant.', 'mais'),
	// et (addition)
	conj('Paul mange une pomme et une banane.', 'et'),
	conj('Le chat et le chien dorment près du feu.', 'et'),
	conj('Nous chantons et nous dansons à la fête.', 'et'),
	conj('Elle range sa chambre et fait ses devoirs.', 'et'),
	conj('Le ciel est bleu et le soleil brille.', 'et'),
	conj('Il achète du pain et des fruits au marché.', 'et'),
	conj('Les enfants rient et jouent dans la cour.', 'et'),
	// ou (choix)
	conj('Tu préfères le thé ou le café ?', 'ou'),
	conj('Nous irons à la mer ou à la montagne.', 'ou'),
	conj('Veux-tu une glace ou un gâteau ?', 'ou'),
	conj('Il viendra samedi ou dimanche prochain.', 'ou'),
	conj('On peut jouer dehors ou rester au chaud.', 'ou'),
	conj('Elle prendra le train ou le bus.', 'ou'),
	// donc (conséquence)
	conj('Il est tard, donc nous rentrons.', 'donc'),
	conj('Il a beaucoup plu, donc le jardin est trempé.', 'donc'),
	conj('Tu as bien travaillé, donc tu peux te reposer.', 'donc'),
	conj('La route est fermée, donc nous faisons un détour.', 'donc'),
	conj("Je n'ai plus faim, donc je m'arrête de manger.", 'donc'),
	conj('Le magasin est fermé, donc nous reviendrons demain.', 'donc'),
	// car (cause)
	conj('Elle est fatiguée, car elle a couru longtemps.', 'car'),
	conj('Nous restons à la maison, car il neige beaucoup.', 'car'),
	conj('Le bébé pleure, car il a très faim.', 'car'),
	conj("J'allume la lampe, car la nuit tombe.", 'car'),
	conj('Il met son manteau, car il fait très froid.', 'car'),
	conj('Les fleurs se fanent, car personne ne les arrose.', 'car'),
	// or (opposition abstraite, contextes limpides)
	conj('Je croyais avoir raison, or je me trompais.', 'or'),
	conj("Il promettait de venir, or il n'est jamais arrivé.", 'or'),
	conj("Tout semblait calme, or l'orage approchait.", 'or'),
	conj('Elle cherchait ses clés, or elles étaient sur la table.', 'or'),
	// ni…ni (cible double non adjacente)
	conjNi('Il ne mange ni viande ni poisson.'),
	conjNi('Je ne veux ni pleurer ni me plaindre.'),
	conjNi("Elle n'aime ni le froid ni la pluie."),
	conjNi("Ce chien n'est ni méchant ni bruyant."),
	conjNi("Nous n'avons ni faim ni soif."),
];

/* ============================================================
   Leçon B — Sous-catégories de déterminant (#437, CM1).
   ------------------------------------------------------------
   Distinguer article / possessif / démonstratif. Consigne + cibleLabel PAR ITEM.
   Idée forte (pédagogue) : une même phrase réunit les sous-catégories comme
   distracteurs mutuels, la consigne variant d'un item à l'autre (banque PLATE :
   plusieurs items d'une même phrase, un par sous-catégorie visée).
   Interdits d'ambiguïté :
   - « ce » seulement IMMÉDIATEMENT devant un nom (jamais pronom « Ce sont… », « C'est… ») ;
   - « leur/leurs » seulement devant un nom (jamais pronom « Je leur parle ») ;
   - PAS de partitifs (du / de la) ni de contractés (au / aux / du) — ambigus/hors périmètre ;
   - PAS d'article élidé « l' » (soudé au nom → non cliquable séparément).
   Garde-fou de construction : la phrase doit contenir EXACTEMENT un déterminant de la
   sous-catégorie visée, et ce doit être la cible (sinon erreur — cible ambiguë).
   ============================================================ */
export type SousCatDet = 'article' | 'possessif' | 'demonstratif';

const DET_SETS: Record<SousCatDet, Set<string>> = {
	article: new Set(['le', 'la', 'les', 'un', 'une', 'des']),
	possessif: new Set([
		'mon',
		'ma',
		'mes',
		'ton',
		'ta',
		'tes',
		'son',
		'sa',
		'ses',
		'notre',
		'nos',
		'votre',
		'vos',
		'leur',
		'leurs',
	]),
	demonstratif: new Set(['ce', 'cet', 'cette', 'ces']),
};
const DET_LABEL: Record<SousCatDet, string> = {
	article: "l'article",
	possessif: 'le déterminant possessif',
	demonstratif: 'le déterminant démonstratif',
};
const DET_CONSIGNE: Record<SousCatDet, string> = {
	article: "Clique sur l'article de la phrase.",
	possessif: 'Clique sur le déterminant possessif de la phrase.',
	demonstratif: 'Clique sur le déterminant démonstratif de la phrase.',
};
const DET_EXPL: Record<SousCatDet, (m: string) => string> = {
	article: (m) => `« ${m} » accompagne le nom sans dire à qui c'est : c'est un article.`,
	possessif: (m) => `« ${m} » montre à qui c'est : c'est un déterminant possessif.`,
	demonstratif: (m) =>
		`« ${m} » sert à montrer de quel nom on parle : c'est un déterminant démonstratif.`,
};

export function det(texte: string, cible: string, cat: SousCatDet): PhraseClicMot {
	const tokens = tokeniser(texte);
	const membres = tokens.filter((t) => DET_SETS[cat].has(t.toLowerCase()));
	if (membres.length !== 1 || membres[0].toLowerCase() !== cible.toLowerCase()) {
		throw new Error(
			`grammaire-clic-mot (det ${cat}) : « ${texte} » doit contenir exactement un ${cat} ` +
				`et ce doit être « ${cible} » (trouvé ${membres.length} : ${membres.join(', ')}).`,
		);
	}
	return phraseMots(texte, [cible], {
		explication: DET_EXPL[cat](cible),
		consigne: DET_CONSIGNE[cat],
		cibleLabel: DET_LABEL[cat],
	});
}
/* Expanse une phrase en plusieurs items (un par sous-catégorie ciblée). */
function detItems(texte: string, specs: [string, SousCatDet][]): PhraseClicMot[] {
	return specs.map(([cible, cat]) => det(texte, cible, cat));
}

const CONSIGNE_DET = 'Clique sur le déterminant demandé.';

export const PHRASES_DET: PhraseClicMot[] = [
	// Phrases « riches » : les 3 sous-catégories se font distracteurs mutuels.
	...detItems('Ce chien mange sa gamelle et un os.', [
		['Ce', 'demonstratif'],
		['sa', 'possessif'],
		['un', 'article'],
	]),
	...detItems('Cette fille montre son dessin à des amis.', [
		['Cette', 'demonstratif'],
		['son', 'possessif'],
		['des', 'article'],
	]),
	...detItems('Ces enfants rangent leurs jouets dans une boîte.', [
		['Ces', 'demonstratif'],
		['leurs', 'possessif'],
		['une', 'article'],
	]),
	...detItems('Mon frère répare ce vélo avec les outils.', [
		['Mon', 'possessif'],
		['ce', 'demonstratif'],
		['les', 'article'],
	]),
	...detItems('Cet oiseau protège ses petits dans le nid.', [
		['Cet', 'demonstratif'],
		['ses', 'possessif'],
		['le', 'article'],
	]),
	...detItems('Ta sœur dessine cette maison avec un crayon.', [
		['Ta', 'possessif'],
		['cette', 'demonstratif'],
		['un', 'article'],
	]),
	// Phrases à deux sous-catégories.
	...detItems('Les oiseaux quittent leur nid en automne.', [
		['Les', 'article'],
		['leur', 'possessif'],
	]),
	...detItems('Mon voisin répare cette barrière.', [
		['Mon', 'possessif'],
		['cette', 'demonstratif'],
	]),
	...detItems('Ces montagnes cachent le soleil.', [
		['Ces', 'demonstratif'],
		['le', 'article'],
	]),
	...detItems('Cette histoire raconte une belle aventure.', [
		['Cette', 'demonstratif'],
		['une', 'article'],
	]),
	...detItems('Tes amis apportent des cadeaux.', [
		['Tes', 'possessif'],
		['des', 'article'],
	]),
	...detItems('Notre équipe gagne le match.', [
		['Notre', 'possessif'],
		['le', 'article'],
	]),
	...detItems('Votre chien aboie dans le jardin.', [
		['Votre', 'possessif'],
		['le', 'article'],
	]),
	...detItems('Ce boulanger prépare des croissants.', [
		['Ce', 'demonstratif'],
		['des', 'article'],
	]),
	...detItems('Nos cousins visitent cette ville.', [
		['Nos', 'possessif'],
		['cette', 'demonstratif'],
	]),
	...detItems('Cet acteur joue un rôle important.', [
		['Cet', 'demonstratif'],
		['un', 'article'],
	]),
	...detItems('Cette chanson me rappelle mes vacances.', [
		['Cette', 'demonstratif'],
		['mes', 'possessif'],
	]),
	...detItems('Range tes affaires dans ce tiroir.', [
		['tes', 'possessif'],
		['ce', 'demonstratif'],
	]),
	...detItems('Notre maîtresse corrige ce cahier.', [
		['Notre', 'possessif'],
		['ce', 'demonstratif'],
	]),
];

/* ============================================================
   Leçon C — Pronom personnel sujet vs complément (#437, CM1).
   ------------------------------------------------------------
   Consigne + cibleLabel PAR ITEM (sujet / complément).
   Sujets = je/tu/il/elle/on/nous/vous/ils/elles.
   Compléments = me/te/lui/leur/se/nous/vous.
   Interdits d'ambiguïté :
   - EXCLURE le/la/les comme compléments (homographes d'articles — leçon plus avancée) ;
   - JAMAIS la même forme (nous/vous) à la fois en sujet et en complément dans une phrase.
   Garde-fou de construction : un seul pronom du rôle visé est cliquable (formes non
   ambiguës comptées ; nous/vous gérés par leur unique occurrence — cf. interdit).
   ============================================================ */
export type RolePron = 'sujet' | 'complement';

const PRON_SUJET = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles']);
const PRON_COMPL = new Set(['me', 'te', 'lui', 'leur', 'se', 'nous', 'vous']);
/* Formes NON ambiguës (un seul rôle) — nous/vous exclus (partagés par les deux rôles). */
const PRON_SUJET_STRICT = new Set(['je', 'tu', 'il', 'elle', 'on', 'ils', 'elles']);
const PRON_COMPL_STRICT = new Set(['me', 'te', 'lui', 'leur', 'se']);
const PRON_LABEL: Record<RolePron, string> = {
	sujet: 'le pronom personnel sujet',
	complement: 'le pronom personnel complément',
};
const PRON_CONSIGNE: Record<RolePron, string> = {
	sujet: 'Clique sur le pronom personnel sujet de la phrase.',
	complement: 'Clique sur le pronom personnel complément de la phrase.',
};
const PRON_EXPL: Record<RolePron, (m: string) => string> = {
	sujet: (m) => `« ${m} » fait l'action : c'est un pronom personnel sujet.`,
	complement: (m) => `« ${m} » reçoit l'action : c'est un pronom personnel complément.`,
};

export function pron(texte: string, cible: string, role: RolePron): PhraseClicMot {
	const setRole = role === 'sujet' ? PRON_SUJET : PRON_COMPL;
	const strict = role === 'sujet' ? PRON_SUJET_STRICT : PRON_COMPL_STRICT;
	const cl = cible.toLowerCase();
	if (!setRole.has(cl)) {
		throw new Error(
			`grammaire-clic-mot (pron ${role}) : « ${cible} » n'est pas un pronom ${role}.`,
		);
	}
	const tokens = tokeniser(texte);
	// Un seul pronom du rôle visé doit être cliquable : les formes strictes de CE rôle,
	// plus l'occurrence de la cible (couvre nous/vous ciblés), doivent totaliser 1.
	const memes = tokens.filter((t) => {
		const b = t.toLowerCase();
		return strict.has(b) || b === cl;
	});
	if (memes.length !== 1) {
		throw new Error(
			`grammaire-clic-mot (pron ${role}) : « ${texte} » doit contenir un seul pronom ${role} ` +
				`(« ${cible} » ; trouvé ${memes.length} : ${memes.join(', ')}).`,
		);
	}
	return phraseMots(texte, [cible], {
		explication: PRON_EXPL[role](cible),
		consigne: PRON_CONSIGNE[role],
		cibleLabel: PRON_LABEL[role],
	});
}
function pronItems(texte: string, specs: [string, RolePron][]): PhraseClicMot[] {
	return specs.map(([cible, role]) => pron(texte, cible, role));
}

const CONSIGNE_PRON = 'Clique sur le pronom personnel demandé.';

export const PHRASES_PRON: PhraseClicMot[] = [
	// Paires sujet + complément (formes différentes).
	...pronItems('Il lui offre un joli cadeau.', [
		['Il', 'sujet'],
		['lui', 'complement'],
	]),
	...pronItems('Nous leur envoyons une longue lettre.', [
		['Nous', 'sujet'],
		['leur', 'complement'],
	]),
	...pronItems('Tu me racontes une belle histoire.', [
		['Tu', 'sujet'],
		['me', 'complement'],
	]),
	...pronItems('Elle te prête son beau vélo.', [
		['Elle', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems("Ils nous attendent devant l'école.", [
		['Ils', 'sujet'],
		['nous', 'complement'],
	]),
	...pronItems('Vous me montrez le chemin.', [
		['Vous', 'sujet'],
		['me', 'complement'],
	]),
	...pronItems('Je te donne ma part de gâteau.', [
		['Je', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems('On lui propose un nouveau jeu.', [
		['On', 'sujet'],
		['lui', 'complement'],
	]),
	...pronItems('Elles se cachent derrière le rideau.', [
		['Elles', 'sujet'],
		['se', 'complement'],
	]),
	...pronItems('Il se lave soigneusement avant le repas.', [
		['Il', 'sujet'],
		['se', 'complement'],
	]),
	...pronItems('Nous vous remercions pour votre aide.', [
		['Nous', 'sujet'],
		['vous', 'complement'],
	]),
	...pronItems('Tu nous expliques la règle du jeu.', [
		['Tu', 'sujet'],
		['nous', 'complement'],
	]),
	...pronItems('Ils te suivent dans le couloir.', [
		['Ils', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems('Elle leur lit une histoire du soir.', [
		['Elle', 'sujet'],
		['leur', 'complement'],
	]),
	...pronItems('Je vous invite à mon anniversaire.', [
		['Je', 'sujet'],
		['vous', 'complement'],
	]),
	...pronItems('Elle te répond gentiment.', [
		['Elle', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems('Vous nous aidez souvent.', [
		['Vous', 'sujet'],
		['nous', 'complement'],
	]),
	// Sujet seul (aucun pronom complément).
	...pronItems('Demain, nous partirons à la campagne.', [['nous', 'sujet']]),
	...pronItems('Chaque matin, elle arrose ses fleurs.', [['elle', 'sujet']]),
	...pronItems("Pendant l'été, ils voyagent en train.", [['ils', 'sujet']]),
	// Complément seul (sujet = groupe nominal).
	...pronItems('Ma grande sœur me coiffe doucement.', [['me', 'complement']]),
	...pronItems('Le professeur lui explique la leçon.', [['lui', 'complement']]),
	...pronItems('Les parents leur préparent un goûter.', [['leur', 'complement']]),
	...pronItems('Le chien nous suit partout.', [['nous', 'complement']]),
];

/* ============================================================
   Leçon D — Nom noyau du groupe nominal (#437, CM1).
   ------------------------------------------------------------
   Cible = le nom principal du GN ; distracteurs = son déterminant + son/ses adjectif(s).
   Contrainte STRUCTURELLE ABSOLUE (garde-fou d'ambiguïté) : UN SEUL groupe nominal
   développé par phrase ; tout le reste = pronom sujet, verbe, adverbe — JAMAIS un
   deuxième nom (pas de CC nominal, pas de complément du nom, pas d'apposition, pas de
   nom propre cible). Patrons variés : Dét+Nom, Dét+Nom+Adj, Dét+Adj+Nom.
   ============================================================ */
const CONSIGNE_NOYAU = 'Clique sur le nom noyau du groupe nominal.';
const CIBLE_NOYAU = 'le nom noyau';

function noyau(texte: string, nom: string): PhraseClicMot {
	return phraseMots(texte, [nom], {
		explication: `Le nom noyau, c'est le nom principal du groupe : ici « ${nom} » (les autres mots le complètent).`,
	});
}

export const PHRASES_NOYAU: PhraseClicMot[] = [
	// Dét + Nom
	noyau('Le chien aboie bruyamment.', 'chien'),
	noyau('Elle observe les étoiles.', 'étoiles'),
	noyau('Nous écoutons la musique.', 'musique'),
	noyau('Le clown danse joyeusement.', 'clown'),
	noyau('La lune brille faiblement.', 'lune'),
	noyau('Le train roule vite.', 'train'),
	noyau('Le savant explique calmement.', 'savant'),
	noyau('Le boulanger travaille tôt.', 'boulanger'),
	// Dét + Nom + Adj
	noyau('Le petit chat noir dort profondément.', 'chat'),
	noyau('Elle regarde un grand oiseau bleu.', 'oiseau'),
	noyau('Il conduit une voiture rouge.', 'voiture'),
	noyau('Tu portes un manteau chaud.', 'manteau'),
	noyau('Nous admirons un château immense.', 'château'),
	noyau('Le gâteau délicieux refroidit doucement.', 'gâteau'),
	noyau('Il répare le vélo cassé.', 'vélo'),
	noyau('Nous regardons un film passionnant.', 'film'),
	noyau('Il mange une pomme mûre.', 'pomme'),
	noyau('Elle range un tiroir profond.', 'tiroir'),
	noyau('Elle chante une jolie mélodie.', 'mélodie'),
	noyau('Elle porte une robe légère.', 'robe'),
	noyau('Il pousse un chariot rempli.', 'chariot'),
	noyau('La rivière tranquille coule lentement.', 'rivière'),
	noyau('Nous suivons un chemin étroit.', 'chemin'),
	noyau('Elle observe un papillon coloré.', 'papillon'),
	// Dét + Adj + Nom
	noyau('Tu admires ce grand tableau ancien.', 'tableau'),
	noyau('La petite fille sourit gentiment.', 'fille'),
	noyau('Le vieux pont tremble légèrement.', 'pont'),
	noyau('Elle caresse un joli chaton.', 'chaton'),
	noyau('Il escalade une haute montagne.', 'montagne'),
	noyau('Elle cueille une belle fleur.', 'fleur'),
	noyau('Le grand arbre grandit lentement.', 'arbre'),
	noyau('Elle achète un joli chapeau.', 'chapeau'),
	noyau('Tu dessines une belle princesse.', 'princesse'),
	noyau('La lune ronde brille faiblement.', 'lune'),
	noyau('Le nageur courageux plonge rapidement.', 'nageur'),
	noyau('Tu construis une belle cabane.', 'cabane'),
	noyau('Il attrape un gros ballon.', 'ballon'),
	noyau('La vieille horloge sonne bruyamment.', 'horloge'),
	noyau('Nous plantons un jeune arbre.', 'arbre'),
	noyau('Tu ouvres une lourde porte.', 'porte'),
	noyau('Le petit lapin bondit joyeusement.', 'lapin'),
];

/* ============================================================
   Leçon E — Sujet = nom noyau du groupe sujet, composé compris (#437, CM1).
   ------------------------------------------------------------
   Deux formes :
   - sujet SIMPLE : un GN au nom noyau unique (mêmes contraintes que D — pas d'autre
     nom ailleurs) → cible 1 mot ;
   - sujet COMPOSÉ : NOMS PROPRES uniquement (« Paul et Léa ») → cible = les deux noms,
     en SAUTANT « et » (cible double non adjacente).
   Interdits : PAS de sujet composé de deux GN à déterminant (« le chat et le chien »,
   différé) ; PAS de mixte pronom + nom (« Toi et ton frère ») ; PAS de sujet à 3 éléments.
   ============================================================ */
const CONSIGNE_SUJET =
	'Clique sur le nom noyau du sujet. Parfois, le sujet est composé de deux noms : clique sur les deux !';
const CIBLE_SUJET = 'le nom noyau du sujet';

function sujetSimple(texte: string, nom: string): PhraseClicMot {
	return phraseMots(texte, [nom], {
		explication: `Le nom noyau du sujet, c'est qui fait l'action : « ${nom} » (les autres mots le complètent).`,
	});
}
function sujetCompose(texte: string, nom1: string, nom2: string): PhraseClicMot {
	return phraseMots(texte, [nom1, nom2], {
		explication: `Le sujet est composé de deux noms : « ${nom1} » et « ${nom2} ».`,
	});
}

export const PHRASES_SUJET: PhraseClicMot[] = [
	// Sujet simple (GN au nom noyau unique).
	sujetSimple('Le petit chien aboie joyeusement.', 'chien'),
	sujetSimple('La grande girafe mange lentement.', 'girafe'),
	sujetSimple('Le vieux pêcheur dort tranquillement.', 'pêcheur'),
	sujetSimple('Une jolie fleur pousse doucement.', 'fleur'),
	sujetSimple('Le gros nuage avance lentement.', 'nuage'),
	sujetSimple('La petite souris court vite.', 'souris'),
	sujetSimple('Le champion fatigué respire fortement.', 'champion'),
	sujetSimple('Mon frère travaille sérieusement.', 'frère'),
	sujetSimple('Cette chanteuse chante merveilleusement.', 'chanteuse'),
	sujetSimple('Le brave pompier intervient rapidement.', 'pompier'),
	sujetSimple('Une abeille butine tranquillement.', 'abeille'),
	sujetSimple('Le clown maladroit tombe souvent.', 'clown'),
	sujetSimple('Le gros ours dort paisiblement.', 'ours'),
	sujetSimple('Le boulanger commence tôt.', 'boulanger'),
	sujetSimple('Ma petite sœur dessine joliment.', 'sœur'),
	sujetSimple('Le petit écureuil grimpe rapidement.', 'écureuil'),
	sujetSimple('La vieille dame marche prudemment.', 'dame'),
	sujetSimple('Un grand cheval galope librement.', 'cheval'),
	sujetSimple('Le facteur pressé roule rapidement.', 'facteur'),
	sujetSimple('Cette élève répond poliment.', 'élève'),
	// Sujet composé (deux noms propres, « et » sauté).
	sujetCompose('Paul et Léa jouent ensemble.', 'Paul', 'Léa'),
	sujetCompose('Tom et Lucas courent vite.', 'Tom', 'Lucas'),
	sujetCompose('Emma et Chloé chantent gaiement.', 'Emma', 'Chloé'),
	sujetCompose('Nina et Sacha dansent joyeusement.', 'Nina', 'Sacha'),
	sujetCompose('Léo et Marie rient beaucoup.', 'Léo', 'Marie'),
	sujetCompose('Hugo et Jules travaillent sérieusement.', 'Hugo', 'Jules'),
	sujetCompose('Alice et Sarah nagent rapidement.', 'Alice', 'Sarah'),
	sujetCompose('Adam et Noé dessinent tranquillement.', 'Adam', 'Noé'),
	sujetCompose('Zoé et Manon sautent partout.', 'Zoé', 'Manon'),
	sujetCompose('Théo et Lina applaudissent fort.', 'Théo', 'Lina'),
];

export const CLIC_MOT_LESSONS: LessonInput[] = [
	{ id: 'fr-gram-clic-verbe', label: 'Clique sur le verbe', exerciseType: clicVerbeType() },
	{
		id: 'fr-gram-clic-det',
		label: 'Clique sur le déterminant',
		exerciseType: clicMotType({ banque: PHRASES_DET, consigne: CONSIGNE_DET }),
	},
	{
		id: 'fr-gram-clic-conj',
		label: 'Clique sur la conjonction',
		exerciseType: clicMotType({
			banque: PHRASES_CONJ,
			consigne: CONSIGNE_CONJ,
			cibleLabel: CIBLE_CONJ,
		}),
	},
	{
		id: 'fr-gram-clic-pron',
		label: 'Clique sur le pronom',
		exerciseType: clicMotType({ banque: PHRASES_PRON, consigne: CONSIGNE_PRON }),
	},
	{
		id: 'fr-gram-clic-noyau',
		label: 'Clique sur le nom noyau',
		exerciseType: clicMotType({
			banque: PHRASES_NOYAU,
			consigne: CONSIGNE_NOYAU,
			cibleLabel: CIBLE_NOYAU,
		}),
	},
	{
		id: 'fr-gram-clic-sujet',
		label: 'Clique sur le sujet',
		exerciseType: clicMotType({
			banque: PHRASES_SUJET,
			consigne: CONSIGNE_SUJET,
			cibleLabel: CIBLE_SUJET,
		}),
	},
];
