/* ============================================================
   Résolution GÉNÉRÉE d'une forme conjuguée (#490) — logique pure.
   ------------------------------------------------------------
   Ici, plus qu'ailleurs, le risque n'est pas de mal expliquer : c'est de MENTIR. Le
   corpus (data/francais/conjugaison.ts) ne stocke que des formes pleines (« viendrons »),
   jamais leur découpage. Découper au jugé produirait des radicaux inventés — « pouvoir »
   en a trois au présent (peux / pouvons / peuvent), « aller » aussi (vais / allons /
   vont) — et l'appli enseignerait une régularité qui n'existe pas.

   D'où la règle de ce module : on ne raconte QUE ce qu'on a vérifié sur les données. Chaque
   analyse teste la régularité sur les six personnes ; si elle ne tient pas, elle rend
   `undefined`, le déroulé est vide et il n'y a pas de panneau (dégradation propre). Aucune
   liste de verbes en dur : c'est le corpus qui décide, donc un verbe ajouté demain sera
   traité selon ce qu'il est vraiment.

   Ce que la vérification autorise, temps par temps (avis `pedagogue-primaire`, appuyé sur
   les attendus CE2/CM1) :
   - PASSÉ COMPOSÉ : uniforme sur tout le corpus (auxiliaire conjugué + participe passé) ;
     le participe qui change de forme signale l'accord avec « être », qu'on nomme ;
   - IMPARFAIT : terminaisons communes à TOUS les verbes, et radical retrouvé par le
     « nous » du présent moins -ons. « Être » sort de la règle sans être une exception
     arbitraire (« nous sommes » ne finit pas par -ons) : on le dit ;
   - FUTUR : terminaisons invariables, mais radical non dérivable pour une partie du 3ᵉ
     groupe (viendr-, verr-, pourr-…). On dit alors « celui-là s'apprend », plutôt que
     d'inventer une règle qui marcherait pour prendre et pas pour voir ;
   - PRÉSENT : rien à dérouler hors 1er et 2ᵉ groupes réguliers. Pour les irréguliers, la
     variation du radical n'obéit à aucune règle transférable à ce niveau : la forme
     s'apprend, et le prétendre calculable serait le mensonge le plus coûteux du lot.
   ============================================================ */
import type { DerouleEtayage, PasEtayage } from './etayage-deroule';

/** Les quatre temps du corpus. */
export type TempsConjugaison = 'present' | 'futur' | 'imparfait' | 'passe_compose';

/** La forme à dérouler. Le module ne va rien chercher : la leçon lui donne le paradigme
    (les six formes du temps, plus celles du présent, dont l'imparfait tire son radical),
    ce qui le garde pur et testable sans le corpus. */
export interface ConjugaisonSpec {
	infinitif: string;
	temps: TempsConjugaison;
	personne: number; // 0..5 (je, tu, il, nous, vous, ils)
	pronom: string; // pronom AFFICHÉ, élision comprise (« nous », « j' »)
	formes: string[]; // les six formes du temps demandé
	formesPresent: string[]; // les six formes du présent (radical de l'imparfait)
}

/* Clés des cases de la démonstration : le pronom, puis les DEUX morceaux qu'on assemble
   (radical + terminaison, ou auxiliaire + participe passé — c'est le même geste à l'écran). */
export const CIBLE_PRONOM = 'pronom';
export const CIBLE_MORCEAU_1 = 'morceau1';
export const CIBLE_MORCEAU_2 = 'morceau2';

/** Terminaisons INVARIABLES d'un verbe à ce temps, ou `undefined` si le temps n'en a pas
    d'uniques (présent : elles dépendent du groupe). */
const TERMINAISONS: Partial<Record<TempsConjugaison, string[]>> = {
	imparfait: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
	futur: ['ai', 'as', 'a', 'ons', 'ez', 'ont'],
};

/* Terminaisons du présent, par groupe régulier. On ne les APPLIQUE jamais sans avoir
   vérifié qu'elles décrivent bien les six formes du verbe (cf. `radicalCommun`). */
const PRESENT_1ER = ['e', 'es', 'e', 'ons', 'ez', 'ent'];
const PRESENT_2E = ['is', 'is', 'it', 'issons', 'issez', 'issent'];

/** Radical partagé par les six formes, si et seulement si chacune est bien « radical +
    sa terminaison » et que ce radical est le MÊME partout. `undefined` sinon : c'est la
    garde qui empêche d'inventer un découpage (« vais » n'est pas « all » + quelque chose). */
export function radicalCommun(formes: string[], terminaisons: string[]): string | undefined {
	if (formes.length !== terminaisons.length) return undefined;
	let radical: string | undefined;
	for (let i = 0; i < formes.length; i++) {
		const fin = terminaisons[i];
		if (!formes[i].endsWith(fin)) return undefined;
		const debut = formes[i].slice(0, formes[i].length - fin.length);
		if (!debut) return undefined;
		if (radical === undefined) radical = debut;
		else if (radical !== debut) return undefined;
	}
	return radical;
}

/* Personnes du corpus, pour les phrases qui nomment la personne demandée. */
const PERSONNES = ['je', 'tu', 'il', 'nous', 'vous', 'ils'];

/* « d'aller », « de venir » : l'élision, sans quoi la phrase lue à voix haute écorche le
   français qu'on est justement en train d'enseigner. */
function de(infinitif: string): string {
	return /^[aeiouâêîôûéèh]/i.test(infinitif) ? `d'${infinitif}` : `de ${infinitif}`;
}

/* Formes du présent des deux auxiliaires : reconnaître LEQUEL porte un passé composé se
   fait sur la forme écrite, pas sur une liste de verbes (le corpus peut grandir). */
const AVOIR_PRESENT = ['ai', 'as', 'a', 'avons', 'avez', 'ont'];
const ETRE_PRESENT = ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'];

/** Découpage d'un passé composé : l'auxiliaire (premier mot) et le participe passé (le
    reste). `undefined` si une forme n'a pas ces deux morceaux — le temps ne serait alors
    pas composé, et il n'y aurait rien à raconter. */
export function decoupePasseCompose(
	formes: string[],
): { auxiliaires: string[]; participes: string[] } | undefined {
	const auxiliaires: string[] = [];
	const participes: string[] = [];
	for (const forme of formes) {
		const i = forme.indexOf(' ');
		if (i <= 0 || i === forme.length - 1) return undefined;
		auxiliaires.push(forme.slice(0, i));
		participes.push(forme.slice(i + 1));
	}
	return { auxiliaires, participes };
}

/* Nom de l'auxiliaire employé, reconnu sur ses six formes. `undefined` = ni l'un ni
   l'autre (impossible avec le corpus actuel, mais on ne devine pas). */
function nomAuxiliaire(auxiliaires: string[]): string | undefined {
	const memeQue = (ref: string[]) => auxiliaires.every((a, i) => a === ref[i]);
	if (memeQue(AVOIR_PRESENT)) return 'avoir';
	if (memeQue(ETRE_PRESENT)) return 'être';
	return undefined;
}

/* Ce qu'on peut dire du radical du FUTUR sans mentir : l'infinitif, l'infinitif sans son
   « e » final, ou un radical à connaître. Les trois cas sont constatés, jamais supposés. */
function origineRadicalFutur(radical: string, infinitif: string): string {
	if (radical === infinitif) return `c'est l'infinitif, ${infinitif}`;
	if (radical === infinitif.slice(0, -1) && infinitif.endsWith('e')) {
		return `c'est l'infinitif sans son « e » final`;
	}
	return `celui-là ne se devine pas, il s'apprend comme un mot`;
}

/* Premier pas, commun aux quatre temps : ce qu'on cherche exactement. Le temps et la
   personne sont DONNÉS par l'énoncé — les redire n'est pas du remplissage, c'est le geste
   que l'enfant saute quand il conjugue au hasard. */
function pasDepart(spec: ConjugaisonSpec, temps: string): PasEtayage {
	return {
		phrase: `On me demande le verbe ${spec.infinitif} ${temps}, avec « ${PERSONNES[spec.personne]} ».`,
		ecritures: [{ cible: CIBLE_PRONOM, texte: spec.pronom.trim() }],
		actifs: [CIBLE_PRONOM],
	};
}

/* Dernier pas : l'assemblage, avec la forme complète telle qu'on l'écrit. */
function pasAssemblage(spec: ConjugaisonSpec, a: string, b: string): PasEtayage {
	return {
		phrase: `Je mets les deux morceaux bout à bout : ${a} et ${b}. Ça donne « ${spec.pronom}${spec.formes[spec.personne]} ».`,
		ecritures: [
			{ cible: CIBLE_MORCEAU_1, texte: a },
			{ cible: CIBLE_MORCEAU_2, texte: b },
		],
		actifs: [CIBLE_MORCEAU_1, CIBLE_MORCEAU_2],
	};
}

const LIBELLE_TEMPS: Record<TempsConjugaison, string> = {
	present: 'au présent',
	futur: 'au futur',
	imparfait: "à l'imparfait",
	passe_compose: 'au passé composé',
};

/** Déroulé d'une forme conjuguée, ou déroulé VIDE quand la régularité ne tient pas sur les
    données (présent irrégulier, découpage impossible) : il n'y a alors pas de panneau,
    plutôt qu'une méthode fausse. */
export function derouleConjugaison(spec: ConjugaisonSpec): DerouleEtayage {
	const vide = { titre: '', pas: [] };
	if (spec.formes.length !== 6 || spec.personne < 0 || spec.personne > 5) return vide;
	const temps = LIBELLE_TEMPS[spec.temps];
	const titre = `${spec.infinitif} ${temps}`;
	const pas: PasEtayage[] = [pasDepart(spec, temps)];

	if (spec.temps === 'passe_compose') {
		const decoupe = decoupePasseCompose(spec.formes);
		const auxiliaire = decoupe && nomAuxiliaire(decoupe.auxiliaires);
		if (!decoupe || !auxiliaire) return vide;
		const participe = decoupe.participes[spec.personne];
		// Participe qui varie d'une personne à l'autre = accord avec « être ». C'est une
		// notion à part entière : on la nomme au lieu de laisser croire à une irrégularité.
		const varie = new Set(decoupe.participes).size > 1;
		// Pas d'étape « le passé composé s'écrit en deux morceaux » : c'est mot pour mot la
		// règle affichée en permanence au-dessus (cf. data/francais/conjugaison.ts). La répéter
		// coûtait un clic pour zéro information neuve — contrairement à l'imparfait et au
		// futur, dont l'étape équivalente APPLIQUE la règle à la personne demandée.
		pas.push({
			phrase: `L'auxiliaire est « ${auxiliaire} », conjugué au présent avec « ${PERSONNES[spec.personne]} » : ${decoupe.auxiliaires[spec.personne]}.`,
			ecritures: [{ cible: CIBLE_MORCEAU_1, texte: decoupe.auxiliaires[spec.personne] }],
			actifs: [CIBLE_MORCEAU_1],
		});
		pas.push({
			phrase: varie
				? `Le participe passé ${de(spec.infinitif)}, c'est « ${participe} » : avec l'auxiliaire être, il s'accorde avec celui qui fait l'action.`
				: `Le participe passé ${de(spec.infinitif)}, c'est « ${participe} ». Avec l'auxiliaire avoir, il ne bouge pas.`,
			ecritures: [{ cible: CIBLE_MORCEAU_2, texte: participe }],
			actifs: [CIBLE_MORCEAU_2],
		});
		pas.push(pasAssemblage(spec, decoupe.auxiliaires[spec.personne], participe));
		return { titre, pas };
	}

	if (spec.temps === 'imparfait') {
		const fins = TERMINAISONS.imparfait!;
		const radical = radicalCommun(spec.formes, fins);
		if (!radical) return vide;
		pas.push({
			phrase: `À l'imparfait, tous les verbes prennent les mêmes terminaisons : -${fins.join(', -')}. Avec « ${PERSONNES[spec.personne]} », c'est -${fins[spec.personne]}.`,
			ecritures: [{ cible: CIBLE_MORCEAU_2, texte: `-${fins[spec.personne]}` }],
			actifs: [CIBLE_MORCEAU_2],
		});
		// Le radical se TROUVE avec le « nous » du présent : c'est la règle enseignée, et elle
		// tient sur tout le corpus sauf « être » — dont le « nous sommes » ne finit même pas
		// par -ons, ce qui se dit à un enfant sans en faire une exception mystérieuse.
		const nous = spec.formesPresent[3] ?? '';
		const derive = nous.endsWith('ons') && nous.slice(0, -3) === radical;
		pas.push({
			phrase: derive
				? `Le radical, je le trouve avec le « nous » du présent : « nous ${nous} ». J'enlève -ons, il reste ${radical}-.`
				: `Le radical ${de(spec.infinitif)} à l'imparfait, c'est ${radical}-. Il ne se trouve pas avec le « nous » du présent (« nous ${nous} » ne finit pas par -ons) : celui-là s'apprend.`,
			ecritures: [{ cible: CIBLE_MORCEAU_1, texte: `${radical}-` }],
			actifs: [CIBLE_MORCEAU_1],
		});
		pas.push(pasAssemblage(spec, `${radical}-`, `-${fins[spec.personne]}`));
		return { titre, pas };
	}

	if (spec.temps === 'futur') {
		const fins = TERMINAISONS.futur!;
		const radical = radicalCommun(spec.formes, fins);
		if (!radical) return vide;
		pas.push({
			phrase: `Au futur, la terminaison est la même pour tous les verbes : -${fins.join(', -')}. Avec « ${PERSONNES[spec.personne]} », c'est -${fins[spec.personne]}.`,
			ecritures: [{ cible: CIBLE_MORCEAU_2, texte: `-${fins[spec.personne]}` }],
			actifs: [CIBLE_MORCEAU_2],
		});
		pas.push({
			phrase: `Le radical du futur ${de(spec.infinitif)}, c'est ${radical}- : ${origineRadicalFutur(radical, spec.infinitif)}.`,
			ecritures: [{ cible: CIBLE_MORCEAU_1, texte: `${radical}-` }],
			actifs: [CIBLE_MORCEAU_1],
		});
		pas.push(pasAssemblage(spec, `${radical}-`, `-${fins[spec.personne]}`));
		return { titre, pas };
	}

	// PRÉSENT : on ne déroule que ce qui se reconstruit vraiment (1er et 2ᵉ groupes
	// réguliers). Partout ailleurs, la forme est à connaître, et aucune méthode ne
	// l'engendre — mieux vaut pas de panneau qu'une règle inventée.
	// La régularité des SIX FORMES ne suffit pas à nommer un groupe : « ouvrir » suit le
	// patron du 1er groupe au présent (j'ouvre, nous ouvrons) tout en étant du 3ᵉ. On croise
	// donc avec la terminaison de l'INFINITIF — et « aller », en -er mais irrégulier, est
	// écarté avant par le patron lui-même (vais / allons). Absent du corpus aujourd'hui, mais
	// c'est exactement la promesse de ce module : ce qu'on affirme, on l'a vérifié.
	const groupe = [
		{ fins: PRESENT_1ER, nom: '1er groupe', infinitifEn: 'er' },
		{ fins: PRESENT_2E, nom: '2e groupe', infinitifEn: 'ir' },
	]
		.filter((g) => spec.infinitif.endsWith(g.infinitifEn))
		.map((g) => ({ ...g, radical: radicalCommun(spec.formes, g.fins) }))
		.find((g) => g.radical);
	if (!groupe?.radical) return vide;
	pas.push({
		phrase: `Le verbe ${spec.infinitif} est du ${groupe.nom} : au présent, son radical ne bouge pas, c'est ${groupe.radical}-.`,
		ecritures: [{ cible: CIBLE_MORCEAU_1, texte: `${groupe.radical}-` }],
		actifs: [CIBLE_MORCEAU_1],
	});
	pas.push({
		phrase: `Les verbes du ${groupe.nom} prennent -${groupe.fins.join(', -')}. Avec « ${PERSONNES[spec.personne]} », c'est -${groupe.fins[spec.personne]}.`,
		ecritures: [{ cible: CIBLE_MORCEAU_2, texte: `-${groupe.fins[spec.personne]}` }],
		actifs: [CIBLE_MORCEAU_2],
	});
	pas.push(pasAssemblage(spec, `${groupe.radical}-`, `-${groupe.fins[spec.personne]}`));
	return { titre, pas };
}
