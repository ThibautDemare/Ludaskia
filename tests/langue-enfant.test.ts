/* ============================================================
   LA LANGUE DE CE QUE L'ENFANT LIT — inventaire structurel.

   Deux règles de rédaction du projet, appliquées le plus largement possible :
   l'apostrophe droite `'` (jamais `’`), et le tutoiement (l'appli parle À l'enfant,
   cf. convention #278, `docs/architecture/conventions-redaction.md`).

   ── Pourquoi un fichier de plus, alors que deux gates existent ──────────────────
   Les deux gates en place tiennent chacun un MORCEAU, et le trou est entre les deux.
   - `catalogue-invariants.test.ts` (#578) interdit `’` dans les RÉPONSES ATTENDUES,
     parce que là il casse la correction (`normalizeText` ne replie pas U+2019). Rien
     d'autre.
   - `voix-libelles-gate.test.ts` (#586) traque le vouvoiement dans les LITTÉRAUX de
     `src/ui` et `src/core`. Il écarte `src/data/` en bloc, mesure à l'appui — 47 « vous »
     y sont du CONTENU d'exercice, parfaitement légitimes (« vous aimez », « Votre chien
     aboie ») — et il ne regarde pas du tout l'apostrophe.
   - `etayage-redige.test.ts` (#490) applique bien les DEUX règles, mais seulement aux
     panneaux d'étayage.
   Résultat : la consigne d'une fiche, le libellé d'un mode, le nom d'une leçon, la
   phrase d'aide au geste, la règle nommée après une erreur — tout ce qu'un enfant lit
   AUTOUR de l'exercice — n'était tenu par rien. C'est propre aujourd'hui parce que des
   relecteurs l'ont lu ; ça ne le restera pas tout seul.

   ── Ce que ce gate fait, et que le balayage lexical de #586 ne peut pas faire ────
   Il ne cherche pas des chaînes dans des fichiers : il INTERROGE le catalogue et les
   tables de texte par leurs entrées publiques, et ne retient que les champs dont la
   FONCTION est d'être du vocabulaire d'interface. C'est ce qui lui permet d'entrer dans
   `src/data/` là où #586 devait renoncer : le `label` d'une leçon et la `phrase` d'un
   item de grammaire vivent dans le même fichier, mais l'un s'adresse à l'enfant et
   l'autre est la matière de l'exercice. Aucune heuristique lexicale ne les sépare ; le
   champ, lui, le dit sans ambiguïté.

   ── Hors périmètre, et c'est un refus motivé, pas un oubli ──────────────────────
   1. Le CONTENU des exercices — corps d'énoncé, phrases à lire, définitions,
      explications, distracteurs. Pour l'apostrophe : `src/data/` en compte 280, déclarées
      légitimes par #578 (« des centaines de `’` dans du texte AFFICHÉ, où ils sont
      légitimes ») ; les balayer ici reviendrait à rouvrir seul une décision écrite.
      Pour le tutoiement : c'est la mesure de #586 (47 occurrences légitimes), et un gate
      à 47 exceptions ne garde plus rien.
   2. Les surfaces ADULTES — espace encadrant, guide parents, « Un mot pour les parents »
      (#330). Elles vouvoient À RAISON : c'est le principal signal de rupture « on a
      quitté l'espace de l'enfant ». Aucune d'elles n'entre dans l'inventaire ci-dessous,
      qui n'est construit que de champs lus DANS l'application par l'enfant ; #586 tient
      déjà l'autre sens (pas de tutoiement dans l'espace encadrant).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { CATEGORIES, SUBJECTS, getAllLessons } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { checkAnswer, consignePourNiveau } from '../src/core/exercise';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import { emptyOrthoState } from '../src/core/orthographe/store';
import { motsDeLecon } from '../src/core/orthographe/lessons';
import { genExerciseOrtho } from '../src/core/orthographe/exercise';
import { MODES_ORTHO } from '../src/core/orthographe/types';
import { AIDES } from '../src/core/aide';
import type { TypeAide } from '../src/core/aide';
import { libelleRegleRomaine } from '../src/core/chiffres-romains';
import type { RegleRomaine } from '../src/core/chiffres-romains';
import { TROPHIES } from '../src/core/rewards';
import { withSeed } from '../src/core/utils';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { vouvoiements, apostrophesCourbes, signesCites } from './gardes-langue';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/** Un texte lu par l'enfant, et l'endroit d'où il vient. `ou` doit suffire à ouvrir le
    bon fichier : un échec qui ne dit pas QUEL texte pèche ne sert à rien. */
type Texte = { ou: string; texte: string };

const ajouter = (out: Texte[], ou: string, texte: string | undefined): void => {
	if (texte && texte.trim()) out.push({ ou, texte });
};

/* ------------------------------------------------------------------
   1. Le vocabulaire du CATALOGUE
   ------------------------------------------------------------------
   Matières, catégories, noms de leçons, consignes de fiche, libellés de mode, lexique
   du runner « problème ». Tous ces champs NOMMENT une tâche ou un rayon à l'enfant ;
   aucun ne porte de matière d'exercice. Ils sont lus par les entrées publiques
   (`getAllLessons`, `consignePourNiveau`) plutôt que dans les fabriques, de sorte
   qu'une leçon ajoutée demain entre dans le filet sans que personne y pense. */
function vocabulaireCatalogue(): Texte[] {
	const out: Texte[] = [];
	for (const s of SUBJECTS) ajouter(out, `matière « ${s.id} ».label`, s.label);
	for (const c of CATEGORIES) ajouter(out, `catégorie « ${c.id} ».label`, c.label);
	for (const l of getAllLessons()) {
		ajouter(out, `${l.id}.label`, l.label);
		for (const niveau of Object.keys(l.labelNiveau ?? {}) as SchoolLevel[])
			ajouter(out, `${l.id}.labelNiveau.${niveau}`, l.labelNiveau?.[niveau]);
		ajouter(out, `${l.id}.rubrique`, l.rubrique);
		// La consigne se RÉSOUT par niveau (#436) : sous sa forme fonction, la lire en
		// direct ne montrerait qu'un `[object Function]`, et la déclinaison CM1 d'une leçon
		// multi-niveaux échapperait au balayage. On passe donc par le point d'entrée
		// unique, à chaque niveau déclaré — et sans niveau, l'appel des sites qui n'en ont
		// pas sous la main.
		for (const niveau of [undefined, ...l.levels])
			ajouter(
				out,
				`${l.id}.consigne[${niveau ?? 'sans niveau'}]`,
				consignePourNiveau(l.exerciseType, niveau),
			);
		for (const m of l.exerciseType.modes ?? []) {
			ajouter(out, `${l.id}.mode « ${m.id} ».label`, m.label);
			ajouter(out, `${l.id}.mode « ${m.id} ».hint`, m.hint);
		}
		const lexique = l.exerciseType.probLexique;
		if (lexique) {
			ajouter(out, `${l.id}.probLexique.nom`, lexique.nom);
			ajouter(out, `${l.id}.probLexique.nomPluriel`, lexique.nomPluriel);
		}
	}
	return out;
}

/* ------------------------------------------------------------------
   2. Les textes d'AIDE et de RETOUR sur erreur
   ------------------------------------------------------------------
   Ce que l'enfant lit au moment précis où il bute : l'aide au geste (#272) et la règle
   nommée après une écriture romaine fautive (#717). Deux tables EXHAUSTIVES par
   construction — `Record<TypeAide, …>` d'un côté, union fermée de l'autre — donc un type
   d'aide ou une classe de faute ajoutée demain entre dans le filet d'elle-même.

   C'est cette famille qui a motivé le gate : les six phrases de `libelleRegleRomaine`
   sont propres parce qu'un relecteur les a lues, et le prochain générateur de retour
   d'erreur naîtrait au même endroit — hors de tout filet. */
const CLASSES_DE_REGLE: Record<RegleRomaine, true> = {
	'signe-inconnu': true,
	'repetition-quadruple': true,
	'repetition-interdite': true,
	'soustraction-interdite': true,
	'ordre-des-signes': true,
	'autre-nombre': true,
};

function aidesEtRetours(): Texte[] {
	const out: Texte[] = [];
	for (const type of Object.keys(AIDES) as TypeAide[]) {
		const aide = AIDES[type];
		ajouter(out, `AIDES.${type}.titre`, aide.titre);
		aide.etapes.forEach((e, i) => ajouter(out, `AIDES.${type}.etapes[${i}]`, e));
		ajouter(out, `AIDES.${type}.alternative`, aide.alternative);
		ajouter(out, `AIDES.${type}.reparation`, aide.reparation);
	}
	for (const regle of Object.keys(CLASSES_DE_REGLE) as RegleRomaine[])
		ajouter(out, `libelleRegleRomaine('${regle}')`, libelleRegleRomaine(regle));
	return out;
}

/* ------------------------------------------------------------------
   3. Le vocabulaire des RÉCOMPENSES
   ------------------------------------------------------------------
   Titres et descriptions de trophées : de la prose, lue par l'enfant dans sa vitrine, et
   écrite par vagues (une famille de paliers à la fois) — le régime exact où une règle de
   rédaction se relâche sans que personne le voie. */
function vocabulaireRecompenses(): Texte[] {
	const out: Texte[] = [];
	for (const t of TROPHIES) {
		ajouter(out, `TROPHIES « ${t.id} ».title`, t.title);
		ajouter(out, `TROPHIES « ${t.id} ».desc`, t.desc);
	}
	return out;
}

/* ------------------------------------------------------------------
   4. Les consignes d'action PRODUITES par les générateurs (#265)
   ------------------------------------------------------------------
   `Exercise.consigne` est la question-consigne affichée en gras au-dessus d'un énoncé
   télégraphique (« Est-ce un nom, un verbe ou un adjectif ? »). Elle n'existe qu'une fois
   l'exercice TIRÉ : ni le catalogue ni un balayage de littéraux ne la donnent telle
   qu'elle s'affiche, puisqu'elle est portée par l'item de banque. C'est le seul champ
   d'un exercice généré que ce gate lit — les autres (énoncé, choix, explication) sont de
   la matière d'exercice, hors périmètre (cf. en-tête).

   Échantillonnage à GRAINE FIXE : reproductible, aucun re-run « en espérant ».

   Ce qui est examiné n'est pas la consigne tirée mais son GABARIT — la phrase une fois
   retirés les nombres et le contenu cité entre guillemets. Deux raisons, et la seconde
   n'est apparue qu'en mesurant :
   - c'est la frontière annoncée en en-tête. « Place le nombre 711 sur la droite graduée »
     est une phrase d'interface ; « 711 » est la matière de l'exercice, et un mot de banque
     glissé entre guillemets dans une consigne le serait tout autant.
   - sans ça, l'inventaire ne converge JAMAIS : les consignes qui interpolent leur valeur
     produisent une chaîne neuve à chaque tirage (67 consignes distinctes en 12 tirages par
     leçon, 766 en 300). On aurait cru échantillonner des formulations, on aurait compté
     des nombres — et le plancher du garde-fou d'inventaire n'aurait plus rien voulu dire.
   Sur le gabarit, le compte se stabilise : ce qu'on balaie, ce sont bien les tournures. */
const GRAINE = 20260927;
const TIRAGES = 12;

/** La phrase sans sa matière : nombres et citations remplacés par un jeton. */
const gabarit = (consigne: string): string =>
	// `\s` en mode Unicode couvre les deux séparateurs de milliers du projet (espace fine
	// insécable U+202F, insécable U+00A0) sans les écrire en clair — invisibles en littéral,
	// donc impossibles à relire et faciles à écraser d'un copier-coller.
	consigne.replace(/«[^»]*»/gu, '« … »').replace(/\d+(?:[.,\s]\d+)*/gu, 'N');

/* Deux formes tirées du MÊME passage (la génération est la partie coûteuse du fichier) :
   le GABARIT, que balaient les règles de langue ci-dessus, et la consigne BRUTE. La
   seconde n'existe que pour la règle du signe cité (#711) : `gabarit` remplace justement
   tout ce qui est entre guillemets par « … », donc un bouton désigné par son glyphe y
   devient invisible. Et c'est dans une consigne de maths que le cas est le plus probable
   (« Écris le signe « < » » — le pavé de signes de #380). */
function consignesGenerees(lessons: LessonDef[]): { gabarits: Texte[]; brutes: Texte[] } {
	const vues = new Map<string, string>(); // gabarit -> premier endroit où on l'a vu
	const brutes = new Map<string, string>(); // consigne telle quelle -> premier endroit
	withSeed(GRAINE, () => {
		for (const l of lessons)
			for (const niveau of l.levels) {
				const modes = l.exerciseType.modes?.map((m) => m.id) ?? [undefined];
				for (const mode of modes)
					for (let i = 0; i < TIRAGES; i++) {
						const ex = l.exerciseType.generate({ level: niveau, mode });
						const consigne = 'consigne' in ex ? ex.consigne : undefined;
						if (!consigne) continue;
						const ou = `${l.id}@${niveau}/${mode ?? 'défaut'} — consigne d'item`;
						if (!brutes.has(consigne)) brutes.set(consigne, ou);
						const cle = gabarit(consigne);
						if (!vues.has(cle))
							vues.set(cle, `${l.id}@${niveau}/${mode ?? 'défaut'} — consigne d'item`);
					}
			}
	});
	const liste = (m: Map<string, string>): Texte[] => [...m].map(([texte, ou]) => ({ ou, texte }));
	return { gabarits: liste(vues), brutes: liste(brutes) };
}

/* ------------------------------------------------------------------
   L'inventaire complet
   ------------------------------------------------------------------ */
const LECONS = getAllLessons();
const CATALOGUE = vocabulaireCatalogue();
const AIDES_ET_RETOURS = aidesEtRetours();
const RECOMPENSES = vocabulaireRecompenses();
const { gabarits: CONSIGNES, brutes: CONSIGNES_BRUTES } = consignesGenerees(LECONS);
const INVENTAIRE: Texte[] = [...CATALOGUE, ...AIDES_ET_RETOURS, ...RECOMPENSES, ...CONSIGNES];

/** Rend les fautes d'un détecteur sur tout l'inventaire, chacune nommée par son endroit. */
const releve = (detecteur: (t: string) => string[]): string[] =>
	INVENTAIRE.flatMap(({ ou, texte }) => detecteur(texte).map((f) => `${ou} — « ${f} »`));

describe('Inventaire — le filet couvre bien ce qu’il prétend couvrir', () => {
	/* Le mode d'échec silencieux d'un gate par inventaire : une source se tarit (un export
	   renommé, un champ déplacé, une boucle qui ne tourne plus), les balayages passent en
	   n'ayant rien regardé, et rien ne le dit. Le garde-fou évident — un plancher chiffré —
	   ne tient pas : posé sur la mesure du jour, il ne dit plus « cette source doit rester
	   riche » mais « elle vaut ce qu'elle vaut », et il resterait vert avec la moitié des
	   leçons perdues pourvu que les autres compensent. On vérifie donc une COUVERTURE, que
	   la structure définit elle-même : chaque leçon, chaque type d'aide, chaque classe de
	   faute, chaque trophée doit apporter son texte. Un objet ajouté demain élève le
	   plancher tout seul, et un objet qui cesse d'être lu est nommé. */

	it('le vocabulaire du catalogue couvre CHAQUE leçon, catégorie et matière', () => {
		const manquants = [
			...LECONS.filter((l) => !CATALOGUE.some((t) => t.ou.startsWith(`${l.id}.`))).map(
				(l) => `leçon ${l.id}`,
			),
			...CATEGORIES.filter((c) => !CATALOGUE.some((t) => t.ou.includes(`« ${c.id} »`))).map(
				(c) => `catégorie ${c.id}`,
			),
			...SUBJECTS.filter((s) => !CATALOGUE.some((t) => t.ou.includes(`« ${s.id} »`))).map(
				(s) => `matière ${s.id}`,
			),
		];
		expect(manquants, 'ces entrées du catalogue n’apportent plus aucun texte').toEqual([]);
	});

	it('les aides et les retours sur erreur couvrent CHAQUE type d’aide et CHAQUE classe de faute', () => {
		const manquants = [
			...Object.keys(AIDES).filter(
				(t) => !AIDES_ET_RETOURS.some((x) => x.ou === `AIDES.${t}.titre`),
			),
			...Object.keys(CLASSES_DE_REGLE).filter(
				(r) => !AIDES_ET_RETOURS.some((x) => x.ou === `libelleRegleRomaine('${r}')`),
			),
		];
		expect(manquants, 'ces aides / classes de faute ne sont plus lues').toEqual([]);
	});

	it('le vocabulaire des récompenses couvre CHAQUE trophée, titre ET description', () => {
		const manquants = TROPHIES.flatMap((t) =>
			['title', 'desc']
				.filter((champ) => !RECOMPENSES.some((x) => x.ou === `TROPHIES « ${t.id} ».${champ}`))
				.map((champ) => `${t.id}.${champ}`),
		);
		expect(manquants, 'ces trophées n’apportent plus leur texte').toEqual([]);
	});

	it('les consignes d’action générées ramènent bien les tournures de #265', () => {
		/* Pas un compte : les gabarits attendus sont ceux que `consignes-265.test.ts`
		   verrouille déjà DANS LES BANQUES, item par item. Les exiger ici prouve que le
		   chemin complet fonctionne — tirage, champ `consigne` de l'exercice, réduction au
		   gabarit — et il devient impossible de rendre cette source muette sans qu'un test
		   le dise. Le lien est volontaire : si #265 change ses formulations, les deux tests
		   tombent ensemble plutôt qu'un seul en silence. */
		const attendus = [
			'Est-ce un nom, un verbe ou un adjectif ?',
			'Quel petit mot va devant : le, la ou les ?',
			'Quel mot est de la même famille ?',
			'Que veut dire ce mot ?',
		];
		const vus = new Set(CONSIGNES.map((t) => t.texte));
		expect(attendus.filter((a) => !vus.has(a))).toEqual([]);
	});

	it('une consigne déclinée par niveau est RÉSOLUE, pas lue en bloc', () => {
		/* La forme fonction (#436) est le cas que l'écriture naïve `type.consigne` raterait :
		   elle ne rendrait qu'une fonction, jamais une phrase, et la version CM1 d'une leçon
		   servie aux deux classes n'entrerait jamais dans le filet. On exige donc les DEUX
		   versions, et qu'elles DIFFÈRENT — c'est ce qui prouve que le niveau est honoré, et
		   non qu'on a lu deux fois la même. */
		const parNiveau = (niveau: SchoolLevel) =>
			CATALOGUE.find((t) => t.ou === `fr-gram-clic-det.consigne[${niveau}]`)?.texte;
		expect(parNiveau('ce2')).toBeTruthy();
		expect(parNiveau('cm1')).toBeTruthy();
		expect(parNiveau('cm1')).not.toBe(parNiveau('ce2'));
	});

	it('chaque source apporte de la PROSE, pas seulement des étiquettes d’un mot', () => {
		/* Les deux règles ne peuvent rien attraper sur des libellés d'un mot : une source
		   dégradée en étiquettes resterait verte en n'ayant plus rien à examiner. Exigé
		   SOURCE PAR SOURCE — globalement, les 500 libellés du catalogue masqueraient la
		   disparition complète des phrases d'aide. */
		const phrase = (t: Texte) => t.texte.split(/\s+/).length >= 6;
		const sansProse = [
			['vocabulaire du catalogue', CATALOGUE],
			['aides et retours sur erreur', AIDES_ET_RETOURS],
			['vocabulaire des récompenses', RECOMPENSES],
			["consignes d'action générées", CONSIGNES],
		]
			.filter(([, textes]) => !(textes as Texte[]).some(phrase))
			.map(([nom]) => nom);
		expect(sansProse, 'ces sources ne rapportent plus de phrases').toEqual([]);
		// Et de la prose ADRESSÉE : les aides au geste tutoient par contrat (« Touche la
		// bonne tuile »). Si plus aucune ne le fait, cette source a cessé de lire du texte
		// parlé à l'enfant, et la règle de tutoiement n'y garde plus rien.
		expect(AIDES_ET_RETOURS.some((t) => /\b(tu|ton|ta|tes|toi)\b/i.test(t.texte))).toBe(true);
	});
});

/* ============================================================
   L'APOSTROPHE — deux règles qui se ressemblent et ne pèsent pas pareil
   ------------------------------------------------------------
   Le même caractère, deux surfaces, deux enjeux d'ordres différents. La confusion est
   facile et coûteuse, d'où cette note : sans elle, le prochain lecteur croira que les
   deux ont le même poids, et sacrifiera la mauvaise le jour où l'une le gênera.

   1. SUR UN TEXTE LU (le describe ci-dessous) — enjeu COSMÉTIQUE. Un libellé, une
      consigne, une phrase d'aide : l'enfant les lit, il ne les retape pas. La forme du
      caractère n'a aucune conséquence, ni sur la correction, ni sur le TTS. Ce qui se
      voit, c'est le MÉLANGE : deux apostrophes différentes dans un même écran. La règle
      vaut d'être tenue — elle a déjà rattrapé un libellé de leçon et deux cadres
      d'énoncé — mais elle est négociable, et c'est celle-ci qu'on lâcherait.

   2. SUR UNE RÉPONSE ATTENDUE (le describe suivant) — enjeu de CORRECTION. Là, la règle
      n'est pas une préférence : la correction en dépend. `normalizeText`
      (`src/core/utils.ts`) trime, réduit les blancs et compose en NFC — il ne replie PAS
      `’` (U+2019) vers `'`. Une réponse attendue écrite avec l'apostrophe typographique
      est donc INCORRIGIBLE : l'enfant tape celle de son clavier — la droite, la seule
      qu'il ait — sa réponse est JUSTE, elle est comptée FAUSSE, et rien à l'écran ne lui
      permet de comprendre pourquoi. C'est un défaut qu'on ne diagnostique pas depuis la
      chaise de l'enfant.

   L'ordre de sacrifice est donc écrit : la 1 est négociable, la 2 ne l'est pas. Le
   premier test du second describe ne l'énonce d'ailleurs pas, il le MESURE sur le moteur
   de correction — le jour où `normalizeText` replierait les deux formes, il rougirait, et
   ce serait le signal que la règle 2 peut être relâchée.
   ============================================================ */
describe('Ce que l’enfant LIT s’écrit avec l’apostrophe droite (cohérence de forme)', () => {
	it('aucun « ’ » dans le vocabulaire d’interface, les aides, les retours d’erreur', () => {
		const fautes = releve(apostrophesCourbes);
		expect(
			fautes,
			`L'apostrophe du projet est la droite « ' », celle du clavier de l'enfant ` +
				`(CLAUDE.md).\n` +
				`Ces textes portent l'apostrophe typographique « ’ » :\n${fautes.join('\n')}\n` +
				`Le caractère est invisible en relecture — c'est pour ça qu'il se teste.\n` +
				`Enjeu : la COHÉRENCE DE FORME, pas la correction (ces textes se lisent, ils ne ` +
				`se retapent pas) — à ne pas confondre avec la règle des réponses attendues, ` +
				`plus bas, dont dépend la correction.\n` +
				`Hors périmètre volontaire : le CONTENU des exercices (énoncés, phrases, ` +
				`définitions, explications), où #578 les déclare légitimes.`,
		).toEqual([]);
	});
});

/* ------------------------------------------------------------------
   Ce que l'enfant TAPE — la moitié que le catalogue ne couvre pas
   ------------------------------------------------------------------
   Réparti sur deux gates, et il faut savoir lequel tient quoi.

   - Les leçons du CATALOGUE sont déjà tenues par #578
     (`catalogue-invariants.test.ts`, `REGLES_TYPO`) : `Exercise.answer`/`answers` et
     `Item.answer`/`answers`, à chaque niveau, dans chaque mode déclaré, sur 100 graines
     par leçon. Ce fichier ne le REFAIT PAS — un même contrôle écrit deux fois finit par
     diverger, et on se retrouverait à corriger un faux positif d'un côté pendant que
     l'autre continue de signaler.
   - L'ORTHOGRAPHE échappe à #578 par construction, pas par oubli : ses leçons sont
     dynamiques (leçons prédéfinies + listes du profil) et « ne passent pas par le
     pipeline LessonDef/generate » (`core/catalog.ts`, `ORTHO_CATEGORY_ID`). Or c'est,
     de toutes les surfaces de l'appli, celle où l'enfant tape le plus : un mot de dictée
     se reproduit lettre à lettre, apostrophe comprise (« aujourd'hui », « jusqu'à »,
     « s'enfuir »). C'est cette moitié-là qui n'était tenue par rien.

   La prise est le PIPELINE lui-même, de bout en bout — `ORTHO_PREDEF` → `motsDeLecon`
   → `genExerciseOrtho(mot, mode)` → `answer` — et non la donnée lue en direct : c'est
   ce qui garantit qu'on examine la chaîne réellement comparée à la saisie, dans les
   trois modes, y compris si un mode se met un jour à transformer le mot.

   Hors périmètre, et c'est motivé : `commeDans` (phrase d'exemple LUE en dictée, jamais
   tapée), les formes fléchies `FormesAccord` et les cibles verbe — voir le compte rendu. */
function reponsesTapees(): Texte[] {
	const state = emptyOrthoState();
	const out: Texte[] = [];
	for (const lecon of ORTHO_PREDEF)
		for (const mot of motsDeLecon(state, lecon.id))
			for (const mode of MODES_ORTHO) {
				const ex = genExerciseOrtho(mot, mode);
				const ou = `${lecon.id}/${mode} — mot « ${mot.mot} »`;
				if ('answer' in ex) ajouter(out, ou, String(ex.answer));
				if ('answers' in ex)
					(ex.answers ?? []).forEach((a, i) => ajouter(out, `${ou} (forme acceptée ${i})`, a));
			}
	return out;
}

describe('Ce que l’enfant TAPE : l’apostrophe droite y décide de la correction', () => {
	it('le moteur de correction ne replie PAS les deux apostrophes', () => {
		/* La prémisse de tout le describe, MESURÉE et non affirmée. On ne recopie pas la
		   règle depuis `normalizeText` : on constate sa conséquence par la porte que le
		   runner emprunte vraiment (`checkAnswer` sur un exercice de dictée). Le jour où le
		   moteur replierait les deux formes, ce test rougit — et c'est le signal, pas une
		   régression : la règle ci-dessous n'aurait alors plus lieu d'être. */
		const attendu = (mot: string) => ({ type: 'dictee' as const, answer: mot });
		expect(checkAnswer(attendu('aujourd’hui'), "aujourd'hui")).toBe(false);
		// Et le sens inverse, pour prouver que l'échec ci-dessus tient bien à l'apostrophe
		// et non à autre chose dans la comparaison.
		expect(checkAnswer(attendu("aujourd'hui"), "aujourd'hui")).toBe(true);
		expect(checkAnswer(attendu('aujourd’hui'), 'aujourd’hui')).toBe(true);
	});

	it('le balayage voit bien chaque leçon prédéfinie, dans les trois modes', () => {
		/* Anti-gate-à-vide, en COUVERTURE plutôt qu'en compte : une leçon qui cesserait de
		   rendre ses mots (id renommé, `motsDeLecon` qui retombe sur []) laisserait le test
		   suivant vert en n'ayant rien examiné, et le nommer est la seule façon de le voir. */
		const attendues = reponsesTapees();
		const muettes = ORTHO_PREDEF.filter(
			(l) => !attendues.some((t) => t.ou.startsWith(`${l.id}/`)),
		).map((l) => l.id);
		expect(muettes, 'ces leçons prédéfinies ne rendent plus aucun mot à taper').toEqual([]);
		const modesVus = new Set(
			attendues.map((t) => t.ou.split(' — ')[0].split('/')[1]).filter(Boolean),
		);
		expect([...modesVus].sort()).toEqual([...MODES_ORTHO].sort());
	});

	it('aucune réponse attendue du parcours orthographe ne porte « ’ »', () => {
		const fautes = reponsesTapees().flatMap(({ ou, texte }) =>
			apostrophesCourbes(texte).map(() => `${ou} → réponse attendue « ${texte} »`),
		);
		expect(
			fautes,
			`Ces mots sont ce que l'enfant doit TAPER, et ils portent l'apostrophe ` +
				`typographique « ’ » :\n${fautes.join('\n')}\n` +
				`Conséquence, et elle est grave : normalizeText (src/core/utils.ts) ne replie pas ` +
				`« ’ » vers « ' ». L'enfant tape l'apostrophe de son clavier — la droite, la seule ` +
				`qu'il ait —, sa réponse est JUSTE, elle est comptée FAUSSE, et rien à l'écran ne ` +
				`lui dit pourquoi. Il ne peut ni le voir ni le corriger.\n` +
				`Convention rappelée en tête de src/data/francais/orthographe.ts : « Apostrophe ` +
				`DROITE (') = celle tapée au clavier ».`,
		).toEqual([]);
	});
});

/* ============================================================
   UN BOUTON SE NOMME, IL NE SE CITE PAS PAR SON GLYPHE (#711)
   ------------------------------------------------------------
   Règle écrite dans `docs/architecture/conventions-redaction.md`. Le détecteur et son
   raisonnement vivent dans `gardes-langue.ts` ; ce qui se décide ICI, comme pour les deux
   autres règles, c'est la SURFACE.

   ── Pourquoi tout l'inventaire, et pas seulement ce qui passe au TTS ────────────
   Le tort a deux moitiés. L'une est sonore (« touche le bouton, la virgule se pose » :
   la voix ne dit jamais lequel) et ne concerne que le texte parlé. L'autre est visuelle
   (un glyphe seul entre deux guillemets est la plus petite chose de la phrase, encadrée
   de deux marques plus grosses) et concerne TOUT ce que l'enfant lit. Restreindre au TTS
   n'aurait donc couvert que la moitié du tort.

   Et surtout : « ce qui passe au TTS » n'est pas une frontière que la structure donne.
   Les aides sont lues (`texteTtsAide`), les consignes de fiche aussi, les titres de
   trophées non — il aurait fallu tenir à la main la liste des sources parlées,
   c'est-à-dire créer un troisième miroir manuel, exactement le mode d'échec que deux
   gates de cette PR viennent de fermer.

   Le coût de la règle large est nul, et c'est mesuré : l'inventaire entier n'en porte
   aucune occurrence aujourd'hui. Les seules citations d'un signe seul du dépôt sont dans
   des COMMENTAIRES de code (47 fois « ? », 10 fois « = »…), qui n'entrent dans aucun
   inventaire. Une règle qui couvre plus et ne coûte aucune exception est à prendre large.

   ── Les consignes d'item entrent ici sous leur forme BRUTE ──────────────────────
   Les deux autres règles balaient le GABARIT (la phrase moins sa matière) ; cette
   règle-ci ne le peut pas, puisque `gabarit` remplace tout ce qui est entre guillemets
   par « … » — donc effacerait précisément ce qu'elle cherche. D'où `CONSIGNES_BRUTES`,
   tirées du même passage. Ce n'est pas une précaution théorique : le pavé de signes de
   #380 (`<`, `>`, `=`) est exactement le genre d'endroit où une consigne serait tentée de
   citer le bouton plutôt que de le nommer.
   ============================================================ */
/* Tout l'inventaire SAUF les gabarits de consigne, remplacés par leur forme brute. Ce
   n'est pas un choix de confort : `gabarit` écrit « … » à la place du contenu cité, et
   « … » est précisément un caractère seul, non alphanumérique, entre guillemets — le
   gabarit déclenchait donc la règle sur son propre marqueur. Mesuré à la première
   exécution, sur `fr-gram-groupe-nominal` (« le mot « … » »). */
const SURFACE_GLYPHE: Texte[] = [
	...CATALOGUE,
	...AIDES_ET_RETOURS,
	...RECOMPENSES,
	...CONSIGNES_BRUTES,
];

describe('Un bouton se NOMME dans ce que l’enfant lit et entend', () => {
	it('les consignes d’item entrent aussi sous leur forme brute (le gabarit effacerait la citation)', () => {
		/* Anti-gate-à-vide propre à cette surface : si `CONSIGNES_BRUTES` se tarissait, la
		   règle resterait verte en n'examinant plus la source la plus exposée. Deux exigences
		   que la structure garantit — il y a au moins autant de consignes brutes que de
		   gabarits (un gabarit regroupe plusieurs consignes), et le gabarit efface bien la
		   citation, ce qui est la raison d'être de cette seconde forme. */
		expect(CONSIGNES_BRUTES.length).toBeGreaterThanOrEqual(CONSIGNES.length);
		expect(CONSIGNES_BRUTES.length).toBeGreaterThan(0);
		expect(gabarit('Écris le signe « < » entre les deux nombres.')).not.toContain('<');
		expect(signesCites('Écris le signe « < » entre les deux nombres.')).not.toEqual([]);
	});

	it('aucun signe isolé cité entre guillemets dans le vocabulaire, les aides et les consignes', () => {
		const fautes = SURFACE_GLYPHE.flatMap(({ ou, texte }) =>
			signesCites(texte).map((f) => `${ou} — « ${f} »`),
		);
		expect(
			fautes,
			`Ces textes DÉSIGNENT un bouton par le signe qu'il porte :\n${fautes.join('\n')}\n` +
				`Au TTS, c'est muet : ni la ponctuation ni les symboles ne sont prononcés — la voix ` +
				`dit « touche le bouton, la virgule se pose », sans jamais dire lequel. À l'écran, le ` +
				`glyphe est la plus petite chose de la phrase, encadrée de deux marques plus grosses ` +
				`que lui.\n` +
				`À faire : NOMMER le bouton (« le bouton virgule du pavé », « le bouton égal »), ` +
				`quitte à ce que le bouton, lui, n'affiche que son signe.\n` +
				`Règle : docs/architecture/conventions-redaction.md, « Un bouton se NOMME dans un ` +
				`texte lu à voix haute, il ne se cite pas par son glyphe » (#711).\n` +
				`Non signalé, et c'est voulu : une citation de plusieurs caractères (« Vérifier ») ` +
				`ou d'un seul caractère alphanumérique (« a », « y », « 5 ») — ce sont des mots, ` +
				`pas des glyphes de bouton.`,
		).toEqual([]);
	});
});

describe('Ce que l’enfant lit le TUTOIE', () => {
	it('aucun vouvoiement dans le vocabulaire d’interface, les aides, les retours d’erreur', () => {
		const fautes = releve(vouvoiements);
		expect(
			fautes,
			`Ces textes s'adressent à l'ENFANT : ils tutoient (convention #278, ` +
				`docs/architecture/conventions-redaction.md).\n${fautes.join('\n')}\n` +
				`Le vouvoiement est réservé aux surfaces ADULTES (espace encadrant, « Un mot ` +
				`pour les parents »), qui ne sont pas dans cet inventaire.\n` +
				`« vous » CITÉ comme personne grammaticale — entre guillemets, ou dans une ` +
				`énumération de personnes — n'est pas du vouvoiement et n'est pas signalé.`,
		).toEqual([]);
	});
});
