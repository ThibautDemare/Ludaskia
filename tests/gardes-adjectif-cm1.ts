/* ============================================================
   Détecteurs de contenu — « Clique sur l'adjectif » au CM1 (#528).
   ------------------------------------------------------------
   Module NON COLLECTÉ (l'`include` de Vitest ne ramasse que les fichiers en `.test.ts` /
   `.spec.ts`), sur le patron de `tests/gardes-affixes.ts`. Il ne porte AUCUNE assertion :
   seulement les prédicats qui lisent une phrase annotée et disent ce qu'elle contient.

   Pourquoi un module à part alors qu'une seule banque les emploie : les tests de #528
   sont écrits AVANT la banque, donc rouges tant qu'elle n'existe pas — un détecteur qui
   ne mordrait pas serait invisible. Isolés ici, ils sont éprouvés DÈS AUJOURD'HUI par
   `gardes-adjectif-cm1.test.ts` sur des banques fabriquées portant exactement la
   violation annoncée (plus les témoins qui ne doivent PAS être signalés), sans dépendre
   d'une ligne de `src/` qui reste à écrire.

   Indépendance auteur ≠ code : les listes ci-dessous (participes passés adjectivaux,
   verbes d'état, déterminants) sont RÉ-ÉCRITES à la main depuis la grammaire et le
   programme CM1, jamais relues d'un module de `src/`. Un garde-fou applicatif dont
   l'ensemble interne serait incomplet est donc attrapé ici.
   ============================================================ */
/* Import par la FAÇADE `grammaire-clic-mot`, jamais par un module interne de la famille :
   son en-tête pose la règle (« le découpage est INTERNE : catalogue, UI et tests importent
   toujours d'ici »). Les tests de #528 l'avaient contournée en visant `-moteur` et `-cm1`
   directement, et l'extraction de la section adjectif vers `grammaire-clic-mot-adjectif.ts`
   les a cassés d'un coup — alors qu'aucun attendu n'avait bougé. */
import {
	estPonctuation,
	joindrePhrase,
	type PhraseClicMot,
} from '../src/data/francais/grammaire-clic-mot';

/** Les deux fonctions de l'adjectif demandées au CM1 (programme §5.1 : « distinguer les
    notions de nature et de fonction », « aborder la notion d'épithète »). Écrit ICI et
    pas importé de `src/` : c'est l'attendu, pas le reflet du code. */
export type FonctionAdjAttendue = 'epithete' | 'attribut';

/** Repli pour comparer des LIBELLÉS (accents indifférents) : « épithète » ⇒ « epithete ».
    Réservé aux libellés et consignes — surtout pas aux FORMES de la banque, où replier
    les accents confondrait « cassé » (participe passé interdit) et « casse » (verbe). */
export function pli(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '');
}

export function texteDe(p: PhraseClicMot): string {
	return joindrePhrase(p.tokens);
}

/** La fonction NOMMÉE par un texte (libellé de cible, consigne, étayage). `undefined` si
    aucune des deux n'est nommée — ou si les DEUX le sont, auquel cas le texte ne tranche
    pas (« clique sur l'adjectif épithète ou attribut » ne désigne pas une cible). */
export function fonctionCitee(texte: string): FonctionAdjAttendue | undefined {
	const t = pli(texte);
	const ep = t.includes('epithete');
	const at = t.includes('attribut');
	if (ep === at) return undefined;
	return ep ? 'epithete' : 'attribut';
}

/** La fonction qu'un item DÉCLARE, lue dans son `cibleLabel` (le contrat de donnée de
    #528 : chaque item porte son libellé de cible propre, qui contient « épithète » ou
    « attribut »). */
export function fonctionDeclaree(p: PhraseClicMot): FonctionAdjAttendue | undefined {
	return fonctionCitee(p.cibleLabel ?? '');
}

/** Indice du mot ciblé (le premier, quand la cible en compte plusieurs — un item de cette
    leçon doit n'en cibler qu'un, ce qu'un test vérifie à part). */
export function indexCible(p: PhraseClicMot): number {
	return p.cibleIndices[0] ?? -1;
}

/** Indice du dernier mot NON ponctuation de la phrase. */
export function indexDernierMot(p: PhraseClicMot): number {
	for (let i = p.tokens.length - 1; i >= 0; i--) {
		if (!estPonctuation(p.tokens[i])) return i;
	}
	return -1;
}

/** L'adjectif ciblé TERMINE-t-il la phrase (ponctuation finale mise à part) ? C'est la
    propriété du critère 4 : si elle est toujours vraie pour une fonction, « clique sur le
    dernier mot » suffit à réussir sans lire. */
export function termineLaPhrase(p: PhraseClicMot): boolean {
	const dernier = p.cibleIndices[p.cibleIndices.length - 1];
	return dernier !== undefined && dernier === indexDernierMot(p);
}

/* Participes passés à valeur adjectivale et formes nom/adjectif ambiguës (nationalités
   substantivables). Liste RÉ-ÉCRITE à la main : hors périmètre du CE2 (piège du passé
   composé sans auxiliaire visible) et, dit le critère 11, du CM1. Les participes des
   VERBES D'ÉTAT eux-mêmes (« devenu », « resté ») en sont volontairement absents : ils
   n'y sont pas adjectifs mais verbe. */
export const PARTICIPES_ET_AMBIGUS = new Set(
	(
		'fatigué fatiguée fatigués fatiguées cassé cassée cassés cassées ' +
		'fermé fermée fermés fermées ouvert ouverte ouverts ouvertes ' +
		'rempli remplie remplis remplies mouillé mouillée trempé trempée ' +
		'endormi endormie assis assise couché couchée allumé allumée ' +
		'éteint éteinte rangé rangée perdu perdue blessé blessée gelé gelée ' +
		'sucré sucrée salé salée coloré colorée doré dorée poli polie ' +
		'cuit cuite brûlé brûlée déchiré déchirée fané fanée ' +
		'français française anglais anglaise espagnol espagnole ' +
		'italien italienne chinois chinoise allemand allemande'
	).split(' '),
);

/** Les mots INTERDITS présents dans la phrase (ciblés ou non) : un participe passé
    adjectival, même simple distracteur, rouvre la confusion avec le passé composé. */
export function motsInterdits(p: PhraseClicMot): string[] {
	return p.tokens.filter((t) => PARTICIPES_ET_AMBIGUS.has(t.toLowerCase()));
}

/** Radical GROSSIER (minuscule, marque du pluriel puis du féminin retirées). Heuristique
    assumée : elle sert à rapprocher « lente » de « lentement », pas à analyser la
    morphologie. */
export function radicalAdj(mot: string): string {
	let r = mot.toLowerCase();
	if (r.endsWith('s')) r = r.slice(0, -1);
	if (r.endsWith('e')) r = r.slice(0, -1);
	return r;
}

/** Les adverbes en « -ment » de la même famille que l'adjectif ciblé (critère 13 : « lente »
    et « lentement » dans la même phrase font de l'exercice un piège de forme, pas de
    fonction). */
export function adverbesMemeFamille(p: PhraseClicMot): string[] {
	const i = indexCible(p);
	const rad = radicalAdj(p.tokens[i] ?? '');
	if (rad.length < 3) return [];
	return p.tokens.filter((t, k) => {
		if (k === i) return false;
		const b = t.toLowerCase();
		return b.endsWith('ment') && b.startsWith(rad);
	});
}

/** Lexique des FORMES d'adjectif attestées par une banque : chaque mot ciblé, plus son
    radical grossier (pour rapprocher « content » de « contente »). Les radicaux de moins
    de trois lettres sont écartés — « les » → « l » ferait un détecteur fou. */
export function lexiqueAdjectifs(banque: PhraseClicMot[]): Set<string> {
	const s = new Set<string>();
	for (const p of banque) {
		const m = p.tokens[indexCible(p)];
		if (!m) continue;
		s.add(m.toLowerCase());
		const rad = radicalAdj(m);
		if (rad.length >= 3) s.add(rad);
	}
	return s;
}

/** Les AUTRES adjectifs de la phrase (d'après le lexique de la banque) : les distracteurs
    dont le critère 3 exige la présence. Détecteur par lexique, donc faillible dans le sens
    PERMISSIF (un adjectif qui n'est jamais ciblé nulle part reste invisible). */
export function autresAdjectifs(p: PhraseClicMot, lexique: Set<string>): string[] {
	const i = indexCible(p);
	return p.tokens.filter((t, k) => {
		if (k === i || estPonctuation(t) || t.length < 3) return false;
		const b = t.toLowerCase();
		return lexique.has(b) || lexique.has(radicalAdj(b));
	});
}

/* Verbes d'ÉTAT, par lemme et par forme (présent, imparfait, futur — les temps du CM1).
   Liste ré-écrite à la main depuis la grammaire : ce sont les verbes qui introduisent un
   attribut du sujet. Le critère 5 exige que la banque n'emploie pas QUE « être ». */
export const VERBES_ETAT: Record<string, string[]> = {
	être: (
		'suis es est sommes êtes sont étais était étions étiez étaient ' +
		'serai seras sera serons serez seront serait seraient soit soient fut furent'
	).split(' '),
	sembler: (
		'semble sembles semblons semblez semblent semblait semblaient ' +
		'semblera sembleront semblerait'
	).split(' '),
	paraître: (
		'parais paraît parait paraissons paraissez paraissent ' +
		'paraissait paraissaient paraîtra paraitra paraîtront paraitront'
	).split(' '),
	rester: (
		'reste restes restons restez restent restait restaient ' + 'restera resteront resterait'
	).split(' '),
	devenir: (
		'deviens devient devenons devenez deviennent devenais devenait devenaient ' +
		'deviendra deviendront deviendrait'
	).split(' '),
	demeurer: 'demeure demeures demeurons demeurez demeurent demeurait demeuraient'.split(' '),
};

const FORME_VERS_LEMME = new Map<string, string>();
for (const [lemme, formes] of Object.entries(VERBES_ETAT)) {
	for (const f of formes) FORME_VERS_LEMME.set(f.toLowerCase(), lemme);
}

/* « avoir l'air » : locution, donc reconnue sur DEUX tokens. Sans la forme d'avoir qui la
   précède, « l'air » reste le nom commun (« il respire l'air frais ») — le détecteur dirait
   alors qu'un épithète suit un verbe d'état. */
const FORMES_AVOIR = new Set(
	'ai as a avons avez ont avais avait avions aviez avaient aura auront aurait'.split(' '),
);

/** Le lemme du verbe d'état porté par le token d'indice `k`, ou `undefined`. */
export function lemmeEtat(tokens: string[], k: number): string | undefined {
	const t = (tokens[k] ?? '').toLowerCase();
	if (t === "l'air" || t === 'air') {
		return FORMES_AVOIR.has((tokens[k - 1] ?? '').toLowerCase()) ? "avoir l'air" : undefined;
	}
	return FORME_VERS_LEMME.get(t);
}

/** Le verbe d'état le plus proche AVANT l'adjectif ciblé (son introducteur présumé), ou
    `undefined` s'il n'y en a aucun — auquel cas l'item ne peut pas être un attribut du
    sujet. */
export function verbeEtatAvant(p: PhraseClicMot): string | undefined {
	for (let k = indexCible(p) - 1; k >= 0; k--) {
		const l = lemmeEtat(p.tokens, k);
		if (l) return l;
	}
	return undefined;
}

/** L'adjectif ciblé est-il COLLÉ derrière un verbe d'état ? Un épithète ne l'est jamais :
    s'il l'est, l'item est mal étiqueté. */
export function colleApresVerbeEtat(p: PhraseClicMot): boolean {
	const i = indexCible(p);
	return i > 0 && lemmeEtat(p.tokens, i - 1) !== undefined;
}

/* Déterminants (articles, possessifs, démonstratifs, contractés et partitifs) : un
   attribut du sujet n'en est jamais précédé — s'il l'est, c'est un épithète dans un
   groupe nominal. Liste ré-écrite à la main. */
export const DETERMINANTS = new Set(
	(
		'le la les un une des du au aux ' +
		'mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs ' +
		'ce cet cette ces'
	).split(' '),
);

/** L'adjectif ciblé est-il collé derrière un déterminant (donc dans un groupe nominal) ? */
export function colleApresDeterminant(p: PhraseClicMot): boolean {
	const i = indexCible(p);
	return i > 0 && DETERMINANTS.has((p.tokens[i - 1] ?? '').toLowerCase());
}
