/* ============================================================
   Étayage (#490) — résolution GÉNÉRÉE d'une forme conjuguée.
   ------------------------------------------------------------
   Auteur des tests distinct de l'auteur du code, et ici c'est plus qu'une précaution : le
   module PRÉTEND ne raconter que ce qu'il a vérifié sur les six personnes. Cette
   prétention se teste, et elle se teste sur TOUT le corpus (13 verbes × 4 temps × 6
   personnes), parce qu'une découpe inventée ne se voit pas à la lecture du code — elle se
   voit en confrontant la phrase aux FORMES RÉELLES.

   Principe de dérivation : le corpus (data/francais/conjugaison.ts) est la vérité. Une
   phrase qui affirme un radical, une terminaison, un auxiliaire ou un groupe est jugée en
   recollant les morceaux et en comparant à la forme attendue — jamais en relisant la
   règle appliquée par le module.

   Ce qui est éprouvé :
   - l'ASSEMBLAGE : les deux morceaux annoncés, mis bout à bout, redonnent EXACTEMENT la
     forme du corpus (accents et espace de l'auxiliaire compris) ;
   - le RADICAL annoncé est bien commun aux six personnes, et son ORIGINE n'est affirmée
     que quand elle est vraie (« c'est l'infinitif », « je l'enlève du nous du présent ») ;
   - l'AUXILIAIRE nommé est celui qu'on lit dans les formes, et l'accord du participe n'est
     annoncé que lorsqu'il varie vraiment d'une personne à l'autre ;
   - le REFUS : présent irrégulier, découpage impossible, personne hors bornes → déroulé
     vide, donc aucun exemple à montrer — et, en face, une leçon qui ne déclare AUCUN
     exemple (le présent supplétif reçoit à la place un panneau rédigé, cf. §4) ;
   - la LANGUE : élision (« d'aller », « de finir ») et groupe annoncé conforme à celui que
     les données déclarent.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	CIBLE_MORCEAU_1,
	CIBLE_MORCEAU_2,
	CIBLE_PRONOM,
	decoupePasseCompose,
	derouleConjugaison,
	radicalCommun,
	type ConjugaisonSpec,
	type TempsConjugaison,
} from '../src/core/etayage-conjugaison';
import { PAS_MAX, derouleMontrable } from '../src/core/etayage-deroule';
import { etayagePour } from '../src/core/etayage';
import { getLessonById, type LessonDef } from '../src/core/catalog';
import {
	PRONOUNS,
	TENSES,
	VERBS,
	VERB_GROUPE,
	displayPronoun,
	type Tense,
	type VerbDef,
} from '../src/data/francais/conjugaison';

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
};

/* La spécification telle que la leçon la fabrique : le paradigme du temps demandé, plus
   celui du présent (dont l'imparfait tire son radical). */
function spec(verb: VerbDef, temps: Tense, personne: number): ConjugaisonSpec {
	const formes = verb.forms[temps];
	return {
		infinitif: verb.infinitif,
		temps: temps as TempsConjugaison,
		personne,
		pronom: displayPronoun(personne, formes[personne]),
		formes: [...formes],
		formesPresent: [...verb.forms.present],
	};
}

/* Tous les cas du corpus : 13 verbes × 4 temps × 6 personnes. */
const CORPUS: { verb: VerbDef; temps: Tense; personne: number; spec: ConjugaisonSpec }[] = [];
for (const verb of VERBS)
	for (const temps of TENSES)
		for (let personne = 0; personne < 6; personne++)
			CORPUS.push({ verb, temps, personne, spec: spec(verb, temps, personne) });

/* Le texte écrit dans une case donnée du déroulé (dernière écriture qui la vise). */
function ecrit(pas: { ecritures?: { cible: string; texte: string }[] }[], cible: string): string {
	let texte = '';
	for (const p of pas) for (const e of p.ecritures ?? []) if (e.cible === cible) texte = e.texte;
	return texte;
}

/* Un morceau annoncé, débarrassé du tiret qui signale la coupe (« aim- », « -ons »). */
const sansTiret = (morceau: string): string => morceau.replace(/^-|-$/g, '');

/* Les seuls verbes du corpus dont le PRÉSENT se reconstruit vraiment : radical constant +
   terminaisons régulières. Liste établie à la main, forme par forme :
   - aimer  : aim- + e/es/e/ons/ez/ent ;
   - finir  : fin- + is/is/it/issons/issez/issent.
   Tous les autres changent de radical d'une personne à l'autre (je vais / nous allons, je
   peux / nous pouvons, je prends / nous prenons…), ou n'ont pas ces terminaisons du tout
   (je suis, j'ai, il naît avec son accent circonflexe) : il n'y a rien d'honnête à y
   dérouler, et la forme s'apprend. */
const PRESENT_DEROULABLE = ['aimer', 'finir'];

/* Élision attendue devant l'infinitif (« le participe passé d'aller ») : voyelle ou h
   muet → « d' », sinon « de ». Établie sur les 13 infinitifs du corpus. */
const ELISION = ['être', 'avoir', 'aimer', 'aller'];

/* ============================================================
   1. LES DEUX GARDES-FOUS, ISOLÉS
   ============================================================ */
describe('radicalCommun — n’accepte un découpage que s’il tient sur les six formes', () => {
	const IMPARFAIT = ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'];

	it('un radical constant est rendu ; « être » à l’imparfait en a un (ét-)', () => {
		expect(
			radicalCommun(['étais', 'étais', 'était', 'étions', 'étiez', 'étaient'], IMPARFAIT),
		).toBe('ét');
		expect(
			radicalCommun(['aimais', 'aimais', 'aimait', 'aimions', 'aimiez', 'aimaient'], IMPARFAIT),
		).toBe('aim');
	});

	it('un radical qui BOUGE d’une personne à l’autre est refusé', () => {
		// « prendre » au présent : prend- au singulier, pren- puis prenn- au pluriel.
		expect(
			radicalCommun(
				['prends', 'prends', 'prend', 'prenons', 'prenez', 'prennent'],
				['s', 's', '', 'ons', 'ez', 'ent'],
			),
		).toBeUndefined();
	});

	it('une forme qui ne finit pas par sa terminaison est refusée', () => {
		// « vais » n'est pas « all » + quelque chose : c'est exactement le mensonge à éviter.
		expect(
			radicalCommun(
				['vais', 'vas', 'va', 'allons', 'allez', 'vont'],
				['is', 'is', 'it', 'issons', 'issez', 'issent'],
			),
		).toBeUndefined();
	});

	it('un radical VIDE est refusé (la forme entière serait la terminaison)', () => {
		// Le présent d'« avoir » lu avec les terminaisons du futur : « ai » = « ai », il ne
		// reste aucun radical. Sans cette garde, on annoncerait un morceau vide.
		expect(
			radicalCommun(
				['ai', 'as', 'a', 'avons', 'avez', 'ont'],
				['ai', 'as', 'a', 'ons', 'ez', 'ont'],
			),
		).toBeUndefined();
	});

	it('un paradigme incomplet est refusé', () => {
		expect(radicalCommun(['aimais', 'aimais'], IMPARFAIT)).toBeUndefined();
	});
});

describe('decoupePasseCompose — deux morceaux, ou rien', () => {
	it('sépare l’auxiliaire du participe, au premier espace', () => {
		const d = decoupePasseCompose([
			'ai été',
			'as été',
			'a été',
			'avons été',
			'avez été',
			'ont été',
		]);
		expect(d?.auxiliaires).toEqual(['ai', 'as', 'a', 'avons', 'avez', 'ont']);
		expect(d?.participes).toEqual(['été', 'été', 'été', 'été', 'été', 'été']);
	});

	it('garde l’accord du participe tel qu’il est écrit', () => {
		const d = decoupePasseCompose([
			'suis allé',
			'es allé',
			'est allé',
			'sommes allés',
			'êtes allés',
			'sont allés',
		]);
		expect(d?.participes[3]).toBe('allés');
	});

	it('une forme sans deux morceaux : rien à découper', () => {
		expect(decoupePasseCompose(['aimé', 'aimé', 'aimé', 'aimé', 'aimé', 'aimé'])).toBeUndefined();
		expect(decoupePasseCompose([' allé', 'x y', 'x y', 'x y', 'x y', 'x y'])).toBeUndefined();
		expect(decoupePasseCompose(['ai ', 'x y', 'x y', 'x y', 'x y', 'x y'])).toBeUndefined();
	});
});

/* ============================================================
   2. LE CORPUS ENTIER — ce qui est dit doit être vrai
   ============================================================ */
describe('derouleConjugaison — 13 verbes × 4 temps × 6 personnes', () => {
	it('le présent ne se déroule QUE pour les verbes dont le radical ne bouge pas', () => {
		for (const verb of VERBS) {
			const d = derouleConjugaison(spec(verb, 'present', 3));
			const attendu = PRESENT_DEROULABLE.includes(verb.infinitif);
			expect(d.pas.length > 0, `${verb.infinitif} au présent`).toBe(attendu);
		}
		// Les trois autres temps se déroulent pour TOUS les verbes du corpus : leurs
		// terminaisons sont invariables (futur, imparfait) ou le temps est composé.
		for (const verb of VERBS)
			for (const temps of ['futur', 'imparfait', 'passe_compose'] as Tense[])
				expect(
					derouleConjugaison(spec(verb, temps, 3)).pas.length,
					`${verb.infinitif}/${temps}`,
				).toBeGreaterThan(0);
	});

	it('les morceaux annoncés, recollés, redonnent EXACTEMENT la forme du corpus', () => {
		const fautes: string[] = [];
		for (const { verb, temps, personne, spec: s } of CORPUS) {
			const d = derouleConjugaison(s);
			if (!d.pas.length) continue;
			const ou = `${verb.infinitif}/${temps}/${PRONOUNS[personne]}`;
			const faute = (raison: string) => fautes.push(`${ou} — ${raison}`);
			const forme = verb.forms[temps][personne];
			const m1 = sansTiret(ecrit(d.pas, CIBLE_MORCEAU_1));
			const m2 = sansTiret(ecrit(d.pas, CIBLE_MORCEAU_2));
			const recolle = temps === 'passe_compose' ? `${m1} ${m2}` : `${m1}${m2}`;
			if (recolle !== forme) faute(`« ${m1} » + « ${m2} » = « ${recolle} » ≠ « ${forme} »`);
			// Le pronom écrit est celui de la personne demandée, sans son espace d'affichage.
			if (ecrit(d.pas, CIBLE_PRONOM) !== s.pronom.trim()) faute('pronom écrit inattendu');
			// Et la forme complète est ÉCRITE en toutes lettres au dernier pas : c'est la seule
			// chose que l'enfant recopiera.
			const dernier = d.pas[d.pas.length - 1].phrase;
			if (!dernier.includes(`« ${s.pronom}${forme} »`)) faute(`assemblage absent : « ${dernier} »`);
			// Rien d'indéfini, rien de vide, et un déroulé qui reste court.
			const texte = d.pas.map((p) => p.phrase).join(' ');
			if (texte.includes('undefined')) faute('« undefined » dans une phrase');
			if (d.pas.some((p) => !p.phrase.trim())) faute('phrase vide');
			if (!derouleMontrable(d)) faute(`${d.pas.length} pas (plafond ${PAS_MAX})`);
			if (!d.titre.includes(verb.infinitif)) faute(`titre sans l'infinitif : ${d.titre}`);
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('le radical annoncé est vraiment COMMUN aux six personnes du temps', () => {
		const fautes: string[] = [];
		for (const { verb, temps, personne, spec: s } of CORPUS) {
			if (temps === 'passe_compose') continue; // deux morceaux d'une autre nature
			const d = derouleConjugaison(s);
			if (!d.pas.length) continue;
			const radical = sansTiret(ecrit(d.pas, CIBLE_MORCEAU_1));
			const terminaison = sansTiret(ecrit(d.pas, CIBLE_MORCEAU_2));
			const ou = `${verb.infinitif}/${temps}`;
			// « Le radical ne bouge pas » : les six formes commencent par lui.
			for (const forme of verb.forms[temps])
				if (!forme.startsWith(radical))
					fautes.push(`${ou} — « ${forme} » ne commence pas par « ${radical} »`);
			// Et la terminaison annoncée est bien celle de la personne demandée.
			if (!verb.forms[temps][personne].endsWith(terminaison))
				fautes.push(`${ou}/${PRONOUNS[personne]} — terminaison « ${terminaison} » inexacte`);
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('l’ORIGINE du radical n’est affirmée que lorsqu’elle est vraie', () => {
		const fautes: string[] = [];
		for (const { verb, temps, spec: s } of CORPUS) {
			const d = derouleConjugaison(s);
			if (!d.pas.length) continue;
			const texte = d.pas.map((p) => p.phrase).join(' ');
			const radical = sansTiret(ecrit(d.pas, CIBLE_MORCEAU_1));
			const ou = `${verb.infinitif}/${temps}`;
			const nous = verb.forms.present[3];
			if (temps === 'imparfait') {
				// La règle enseignée : radical = « nous » du présent moins -ons. Le module ne peut
				// l'affirmer que si elle tient, et ne peut la nier que si elle ne tient pas.
				// EXACTEMENT une des deux choses est dite : sans ce compte, une reformulation qui
				// échapperait aux deux motifs ferait passer ce test à vide.
				const tient = nous.endsWith('ons') && nous.slice(0, -3) === radical;
				const dites = [/J'enlève -ons/, /ne finit pas par -ons/].filter((r) => r.test(texte));
				if (dites.length !== 1) fautes.push(`${ou} — ${dites.length} explications du radical`);
				if (/J'enlève -ons/.test(texte) && !tient) fautes.push(`${ou} — « j'enlève -ons » faux`);
				if (/ne finit pas par -ons/.test(texte) && nous.endsWith('ons'))
					fautes.push(`${ou} — « nous ${nous} » finit pourtant par -ons`);
				if (!texte.includes(nous)) fautes.push(`${ou} — le « nous » du présent n'est pas cité`);
			}
			if (temps === 'futur') {
				// Trois origines possibles, une seule affirmée — et seulement si elle est vraie.
				const origines = [/c'est l'infinitif, /, /sans son « e » final/, /s'apprend comme un mot/];
				const dites = origines.filter((r) => r.test(texte));
				if (dites.length !== 1) fautes.push(`${ou} — ${dites.length} origines du radical`);
				if (origines[0].test(texte) && radical !== verb.infinitif)
					fautes.push(`${ou} — « c'est l'infinitif » alors que le radical est « ${radical} »`);
				if (origines[1].test(texte) && `${radical}e` !== verb.infinitif)
					fautes.push(`${ou} — « infinitif sans e » faux (${radical} / ${verb.infinitif})`);
				// Le radical à connaître : on ne le dit que s'il n'est NI l'infinitif NI
				// l'infinitif sans son « e » — sinon on renoncerait devant une règle disponible.
				if (
					origines[2].test(texte) &&
					(radical === verb.infinitif || `${radical}e` === verb.infinitif)
				)
					fautes.push(`${ou} — renonce alors que le radical se déduit de l'infinitif`);
			}
			if (temps === 'present') {
				// Le groupe annoncé est celui que les données déclarent (VERB_GROUPE) : le module
				// le déduit des terminaisons, ce qui coïncide aujourd'hui — mais un verbe du 3e
				// groupe en -ir conjugué comme le 1er (ouvrir, offrir) ferait diverger les deux.
				const groupe = /du (1er groupe|2e groupe)/.exec(texte)?.[1];
				if (groupe && groupe !== VERB_GROUPE[verb.id])
					fautes.push(`${ou} — annoncé ${groupe}, déclaré ${VERB_GROUPE[verb.id] ?? '(aucun)'}`);
			}
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('l’auxiliaire nommé est celui des formes, et l’accord n’est annoncé que s’il a lieu', () => {
		const fautes: string[] = [];
		for (const { verb, personne, spec: s } of CORPUS.filter((c) => c.temps === 'passe_compose')) {
			const d = derouleConjugaison(s);
			const texte = d.pas.map((p) => p.phrase).join(' ');
			const ou = `${verb.infinitif}/${PRONOUNS[personne]}`;
			const formes = verb.forms.passe_compose;
			const auxiliaires = formes.map((f) => f.split(' ')[0]);
			const participes = formes.map((f) => f.slice(f.indexOf(' ') + 1));
			// Auxiliaire attendu, lu dans les formes : « suis/es/est… » c'est être, sinon avoir.
			// C'est le NOM cité qui compte, pas la tournure : on le lit là où le déroulé le
			// nomme, et il ne doit jamais y avoir l'autre.
			const attendu = auxiliaires[0] === 'suis' ? 'être' : 'avoir';
			const nomme = /auxiliaire (?:est )?« (avoir|être) »/.exec(texte)?.[1];
			if (nomme !== attendu) fautes.push(`${ou} — auxiliaire nommé « ${nomme} » ≠ ${attendu}`);
			if (!texte.includes(auxiliaires[personne])) fautes.push(`${ou} — auxiliaire conjugué absent`);
			if (!texte.includes(`« ${participes[personne]} »`)) fautes.push(`${ou} — participe absent`);
			// L'accord : annoncé si et seulement si le participe change d'une personne à l'autre.
			const varie = new Set(participes).size > 1;
			if (/s'accorde/.test(texte) !== varie)
				fautes.push(`${ou} — accord ${varie ? 'tu' : 'inventé'}`);
			if (varie && attendu !== 'être') fautes.push(`${ou} — accord annoncé sans l'auxiliaire être`);
		}
		expect({ nombre: fautes.length, premieres: fautes.slice(0, 3) }).toEqual({
			nombre: 0,
			premieres: [],
		});
	});

	it('l’élision de l’infinitif est correcte (« d’aller », « de finir »)', () => {
		const fautes: string[] = [];
		for (const { verb, temps, spec: s } of CORPUS) {
			const texte = derouleConjugaison(s)
				.pas.map((p) => p.phrase)
				.join(' ');
			if (!texte) continue;
			const elide = ELISION.includes(verb.infinitif);
			const faux = elide ? `de ${verb.infinitif}` : `d'${verb.infinitif}`;
			if (texte.includes(faux)) fautes.push(`${verb.infinitif}/${temps} — « ${faux} »`);
		}
		expect([...new Set(fautes)].slice(0, 3)).toEqual([]);
	});
});

/* ============================================================
   3. REFUS PROPRE
   ============================================================ */
describe('derouleConjugaison — plutôt pas de panneau qu’une méthode inventée', () => {
	const aller = VERBS.find((v) => v.id === 'aller') as VerbDef;

	it('un présent irrégulier ne se déroule pas', () => {
		expect(derouleConjugaison(spec(aller, 'present', 3)).pas).toEqual([]);
		expect(derouleMontrable(derouleConjugaison(spec(aller, 'present', 0)))).toBe(false);
	});

	it('une personne hors des six est refusée', () => {
		expect(derouleConjugaison({ ...spec(aller, 'futur', 0), personne: 6 }).pas).toEqual([]);
		expect(derouleConjugaison({ ...spec(aller, 'futur', 0), personne: -1 }).pas).toEqual([]);
	});

	it('un paradigme qui n’a pas six formes est refusé', () => {
		const s = spec(aller, 'futur', 0);
		expect(derouleConjugaison({ ...s, formes: s.formes.slice(0, 5) }).pas).toEqual([]);
	});

	it('un passé composé dont l’auxiliaire n’est ni avoir ni être est refusé', () => {
		// Découpage possible, mais l'auxiliaire n'est pas reconnu : on ne nomme pas au hasard.
		const s = spec(aller, 'passe_compose', 3);
		const bidon = [
			'vais aller',
			'vas aller',
			'va aller',
			'allons aller',
			'allez aller',
			'vont aller',
		];
		expect(derouleConjugaison({ ...s, formes: bidon }).pas).toEqual([]);
	});
});

/* ============================================================
   4. CATALOGUE — la FORME du panneau suit ce que le moteur sait faire
   ------------------------------------------------------------
   La règle a changé (#490, contenu rédigé du français) et le changement est le fond du
   sujet : le présent supplétif ne reste PLUS sans rien. Ce qui ne change pas, et que ces
   tests continuent de tenir, c'est l'ADOSSEMENT — chaque leçon reçoit la forme de
   panneau que sa notion autorise, jamais une autre :
   - déroulé possible → un exemple MÉCANISÉ, et il est montrable ;
   - présent supplétif → un texte RÉDIGÉ, sans exemple (rien à dérouler à montrer) ;
   - nulle part un panneau vide, nulle part un exemple là où le moteur se tait.

   Le second garde-fou déplace donc son objet : autrefois « aucune entrée sans exemple »,
   il devient « aucune entrée mécanisée sans exemple montrable » PLUS « aucun panneau
   rédigé qui récite le paradigme ». Le contenu du présent supplétif est fixé PAR LEÇON
   alors que la PERSONNE, elle, est tirée à chaque question : une forme citée dans ce
   texte serait donnée d'avance à une part des tirages — le même interdit que partout
   ailleurs, seulement plus facile à enfreindre ici, puisque le sujet du panneau EST le
   paradigme.
   ============================================================ */
/* Les (verbe × temps) sans déroulé possible : le présent des 11 verbes à radical
   supplétif. Dérivé de PRESENT_DEROULABLE ci-dessus (liste établie forme par forme), et
   des trois autres temps qui se déroulent tous. */
const PRESENT_SUPPLETIF = VERBS.filter((v) => !PRESENT_DEROULABLE.includes(v.infinitif));

/* Tout le texte lisible d'un panneau (titre + règle + étapes). */
const texteContenu = (c: { titre: string; regle?: string; etapes?: string[] }): string =>
	[c.titre, c.regle ?? '', ...(c.etapes ?? [])].join(' ');

/* `mot` apparaît-il comme MOT ENTIER ? Les bornes `\b` de JS ne connaissent pas les
   lettres accentuées (« être » collé à « peut-être » passerait) : on encadre par
   « pas une lettre », en Unicode. */
const citeLeMot = (texte: string, mot: string): boolean =>
	new RegExp(`(^|[^\\p{L}])${mot}([^\\p{L}]|$)`, 'iu').test(texte);

describe('les 52 leçons de conjugaison et leur étayage', () => {
	it('un panneau pour chaque (verbe × temps), mécanisé ou rédigé selon ce qui se déroule', () => {
		const mecanise: string[] = [];
		const redige: string[] = [];
		const sans: string[] = [];
		for (const verb of VERBS)
			for (const temps of TENSES) {
				const contenu = etayagePour(lecon(`fr-conj-${verb.id}-${temps}`), 'ce2');
				const cle = `${verb.id}/${temps}`;
				if (!contenu) sans.push(cle);
				else if (contenu.exemple) mecanise.push(cle);
				else redige.push(cle);
			}
		expect(mecanise.length + redige.length + sans.length).toBe(52);
		// Plus aucun trou : c'est ce que la PR revendique, et c'est ce qui se casserait
		// silencieusement (une leçon sans panneau ne lève rien, elle n'affiche rien).
		expect(sans).toEqual([]);
		// Le texte rédigé est exactement le présent des verbes à radical supplétif — ni un
		// temps de plus (les autres temps se déroulent : y trouver du texte signalerait un
		// déroulé perdu), ni un verbe de moins.
		expect(redige.sort()).toEqual(PRESENT_SUPPLETIF.map((v) => `${v.id}/present`).sort());
		expect(mecanise.length).toBe(41);
	});

	it('chaque entrée MÉCANISÉE déclare un exemple montrable, à la personne « nous »', () => {
		for (const verb of VERBS)
			for (const temps of TENSES) {
				const contenu = etayagePour(lecon(`fr-conj-${verb.id}-${temps}`), 'ce2');
				if (!contenu?.exemple) continue;
				const ou = `${verb.id}/${temps}`;
				expect(contenu.exemple.moteur, ou).toBe('conjugaison');
				if (contenu.exemple.moteur !== 'conjugaison') throw new Error(ou);
				const s = contenu.exemple.spec;
				// « nous » : jamais élidé, et la terminaison s'y entend (contrairement à
				// « j'aime » / « il aime », indistinguables à l'oreille).
				expect(s.personne, ou).toBe(3);
				expect(s.pronom.trim(), ou).toBe('nous');
				expect(s.formes, ou).toEqual([...verb.forms[temps]]);
				expect(derouleMontrable(derouleConjugaison(s)), ou).toBe(true);
				// Un exemple déroulé PORTE la méthode : des étapes en plus feraient lire deux
				// méthodes concurrentes au même endroit du panneau.
				expect(contenu.etapes, ou).toBeUndefined();
				// La règle affichée en permanence est une phrase, au niveau de l'enfant.
				expect(contenu.regle?.length, ou).toBeGreaterThan(0);
				expect(contenu.titre, ou).toContain(verb.infinitif);
			}
	});

	it('chaque panneau RÉDIGÉ du présent supplétif dit une méthode, sans exemple à dérouler', () => {
		for (const verb of PRESENT_SUPPLETIF) {
			const ou = `${verb.id}/present`;
			const contenu = etayagePour(lecon(`fr-conj-${verb.id}-present`), 'ce2');
			if (!contenu) throw new Error(`panneau attendu pour ${ou}`);
			// Pas d'exemple : le moteur ne sait rien dérouler ici, et un exemple sur une
			// notion sans déroulé enverrait le panneau chercher une résolution inexistante.
			expect(contenu.exemple, ou).toBeUndefined();
			// Une méthode, donc des étapes — sinon le panneau se réduit à sa règle et redit
			// la fiche. Plafond de trois (mémoire de travail, charte #272).
			expect(contenu.etapes?.length, ou).toBeGreaterThan(0);
			expect(contenu.etapes?.length, ou).toBeLessThanOrEqual(3);
			expect(contenu.regle?.length, ou).toBeGreaterThan(0);
			expect(contenu.titre, ou).toContain(verb.infinitif);
		}
	});

	it('un panneau rédigé ne récite AUCUNE forme du verbe qu’il explique', () => {
		/* Le texte est fixé par LEÇON, la personne est tirée à chaque question : citer
		   « nous allons » donnerait la réponse à un sixième des tirages de la leçon, pour
		   toujours. On éprouve les six formes du présent — celles que la leçon demande — et
		   pas seulement celles qu'on croirait tentantes. */
		const fautes: string[] = [];
		for (const verb of PRESENT_SUPPLETIF) {
			const contenu = etayagePour(lecon(`fr-conj-${verb.id}-present`), 'ce2');
			if (!contenu) continue;
			const texte = texteContenu(contenu);
			for (const forme of verb.forms.present)
				if (citeLeMot(texte, forme)) fautes.push(`${verb.id}/present — « ${forme} » cité`);
		}
		expect([...new Set(fautes)]).toEqual([]);
	});
});
