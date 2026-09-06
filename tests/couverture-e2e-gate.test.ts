import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { getAllLessons } from '../src/core/catalog';
import { JEUX } from '../src/core/jeux/catalogue';

/* ============================================================
   Gate de couverture e2e par SURFACE DE RENDU (#598).

   « Pas de fonctionnalité visuelle sans sa spec Playwright » (CLAUDE.md) n'était tenu
   que par le réflexe de qui écrit le code. Un runner ou un mode livré sans spec ne fait
   rien rougir : CI verte, aucune erreur, et le trou ne se voit qu'à l'usage.

   ── Le choix de la MAILLE, qui décide de tout ─────────────────────────────────
   Mesure du 19/08/2026 : sur ~170 ids de leçon, 47 seulement apparaissent en dur dans
   un `gotoHash` de spec. Un gate « une spec par leçon » demanderait donc une centaine
   d'exceptions — il mourrait sur son propre critère. Et c'est la mauvaise unité : une
   172ᵉ leçon de vocabulaire sur un moteur déjà couvert ne risque rien ; un runner neuf,
   si.

   Les surfaces retenues sont énumérables, petites, et elles se recoupent :

   1. LES MODES (`type.modes`, #69) — 9 ids dans tout le catalogue, tous couverts
      aujourd'hui, zéro exception. C'est le trou que le CLAUDE.md nommait noir sur
      blanc : la table de #581 déclare UN mode par format, donc rien ne garantissait
      que le second mode d'un type soit joué un jour.
   2. LES RUNNERS (`src/ui/lecon-*.ts`) — 13 fichiers. Dix sont aiguillés par
      `navigation.ts` selon le type d'exercice ; les trois autres portent une signature
      CSS et une spec dédiée.
   3. LES TYPES d'exercice — DÉLÉGUÉS à la table de couverture du journal (#581), qui
      fait déjà mieux que ce qu'un scan de texte saurait faire : elle est typée
      `Record<Exercise['type'], …>` (donc un type neuf casse la compilation) et sa spec
      paramétrée JOUE réellement chaque entrée dans le navigateur. Ce gate ne la
      recopie pas, il vérifie que la délégation est réelle : chaque type aiguillé par
      `navigation.ts` doit y avoir son entrée. Rebâtir ici une couverture par type
      aurait produit une garde plus faible qui aurait donné l'illusion du contraire.

   ── Pourquoi les specs qui amorcent tout le programme ne faussent rien ────────
   Le critère de l'issue demandait d'exclure du calcul les specs qui amorcent le
   programme entier via `leconsDuNiveau()` (`e2e/helpers.ts`) : comptées comme
   couverture ciblée, elles masqueraient un vrai trou. Ici la question ne se pose pas
   par construction — AUCUN signal de couverture ne vient d'une énumération d'ids de
   leçon. Le signal est un clic sur `.mode-btn[data-mode="…"]`, une entrée de la table
   de #581, ou une signature CSS : des gestes ciblés, qu'une spec amorce ou non le
   programme. Un test le vérifie quand même plus bas, en exigeant qu'aucun mode ne soit
   couvert par ces quatre specs SEULEMENT.

   ── Ce que ce gate ne prouve pas ──────────────────────────────────────────────
   Que la spec soit bonne. Un `data-mode="qcm"` cliqué sans rien vérifier derrière
   satisfait le gate. On garde ici l'EXISTENCE d'un chemin e2e par surface ; la qualité
   de ce chemin reste affaire de relecture, et la profondeur du round-trip est, elle,
   tenue par `e2e/journal-couverture.spec.ts` (#581).
   ============================================================ */

/* ---------- Lecture des sources ---------- */

const SPECS = readdirSync('e2e')
	.filter((f) => f.endsWith('.spec.ts'))
	.map((f) => ({ nom: `e2e/${f}`, src: readFileSync(`e2e/${f}`, 'utf8') }));

const NAVIGATION = readFileSync('src/ui/navigation.ts', 'utf8');
const TABLE_JOURNAL = readFileSync('e2e/journal-couverture.ts', 'utf8');
const RUNNERS = readdirSync('src/ui').filter((f) => /^lecon-.*\.ts$/.test(f));

/** Specs qui amorcent le programme ENTIER (`leconsDuNiveau`) : elles traversent
 *  beaucoup de leçons sans les cibler. Voir l'en-tête — elles ne fabriquent aucun
 *  signal de couverture ici, on les identifie seulement pour pouvoir le vérifier. */
const SPECS_PROGRAMME = SPECS.filter((s) => s.src.includes('leconsDuNiveau')).map((s) => s.nom);

/* ============================================================
   Surface 1 — les modes
   ============================================================ */

/** Tous les ids de mode déclarés par le catalogue, avec les leçons qui les portent. */
const MODES = new Map<string, string[]>();
for (const l of getAllLessons())
	for (const m of l.exerciseType.modes ?? []) {
		if (!MODES.has(m.id)) MODES.set(m.id, []);
		MODES.get(m.id)!.push(l.id);
	}

/** Modes joués par une spec : un clic (ou une attente) sur le bouton de choix. */
function specsQuiJouent(mode: string): string[] {
	return SPECS.filter((s) => s.src.includes(`data-mode="${mode}"`)).map((s) => s.nom);
}

/** Modes déclarés par la table de couverture du journal (#581) : sa spec paramétrée
 *  les joue pour de vrai, c'est donc une couverture au même titre. */
const MODES_TABLE = new Set([...TABLE_JOURNAL.matchAll(/\bmode:\s*'([\w-]+)'/g)].map((m) => m[1]));

const CAS_MODES = [...MODES].map(([id, lecons]) => ({
	id,
	lecons: lecons.length,
	specs: specsQuiJouent(id),
	table: MODES_TABLE.has(id),
}));

describe('Couverture e2e des modes d’exercice (#598)', () => {
	it('l’inventaire des modes n’est pas vide (garde contre un gate à vide)', () => {
		// `type.modes` renommé ou plus déclaré rendrait tous les tests suivants verts
		// en n'examinant plus rien.
		expect(
			MODES.size,
			'aucun mode trouvé dans le catalogue : la détection a changé.',
		).toBeGreaterThanOrEqual(8);
		expect(SPECS.length).toBeGreaterThanOrEqual(100);
	});

	it.each(CAS_MODES)('le mode « $id » ($lecons leçons) est joué par une spec', (c) => {
		expect(
			c.specs.length > 0 || c.table,
			`Le mode « ${c.id} » est déclaré par ${c.lecons} leçon(s) et AUCUNE spec e2e ne le joue.\n` +
				`Règle CLAUDE.md : « pas de fonctionnalité visuelle sans sa spec » — un mode est un ` +
				`écran à part entière (bouton de choix, rendu, correction).\n` +
				`Deux façons de couvrir : cliquer « .mode-btn[data-mode="${c.id}"] » dans une spec, ou ` +
				`déclarer ce mode dans e2e/journal-couverture.ts (dont la spec paramétrée le joue).\n` +
				`Ne pas se contenter du mode par défaut du type : c'est exactement le trou que ce gate ferme.`,
		).toBe(true);
	});

	it('aucun mode n’est couvert par les seules specs qui amorcent tout le programme', () => {
		// Le critère explicite de l'issue. Une spec qui parcourt `leconsDuNiveau()`
		// traverse beaucoup de leçons sans cibler quoi que ce soit : si elle était le
		// seul « témoin » d'un mode, on croirait couvert un mode que personne ne joue.
		for (const c of CAS_MODES) {
			if (c.table || !c.specs.length) continue;
			expect(
				c.specs.some((s) => !SPECS_PROGRAMME.includes(s)),
				`Le mode « ${c.id} » n'est joué que par ${c.specs.join(', ')}, qui amorce(nt) le ` +
					`programme entier via leconsDuNiveau() : ce n'est pas une couverture ciblée.`,
			).toBe(true);
		}
	});
});

/* ============================================================
   Surface 2 — les runners
   ============================================================ */

/** Modules `lecon-*` importés par `navigation.ts`, par symbole exporté. */
const IMPORTS = new Map<string, string>();
for (const m of NAVIGATION.matchAll(/import \{([^}]*)\} from '\.\/(lecon-[\w-]+)'/g))
	for (const symbole of m[1]
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean))
		IMPORTS.set(symbole, `${m[2]}.ts`);

/** Aiguillage réel : `if (t === 'type') { runLeconXxx(` → type -> fichier de runner. */
const AIGUILLAGE = new Map<string, { symbole: string; fichier: string | undefined }>();
for (const m of NAVIGATION.matchAll(/t === '(\w+)'\)\s*\{\s*(run\w+)\(/g))
	AIGUILLAGE.set(m[1], { symbole: m[2], fichier: IMPORTS.get(m[2]) });

const FICHIERS_AIGUILLES = new Set(
	[...AIGUILLAGE.values()].map((v) => v.fichier).filter((f): f is string => Boolean(f)),
);

/** Runners que `navigation.ts` n'aiguille PAS par type d'exercice, avec la raison et
 *  une SIGNATURE : une classe CSS que ce module est seul à produire. Le test exige
 *  qu'elle soit présente à la fois dans le module (sinon la preuve ne prouve rien) et
 *  dans au moins une spec (sinon le module n'est pas exercé). */
const RUNNERS_HORS_AIGUILLAGE: Record<string, { raison: string; signature: string }> = {
	'lecon-du-jour.ts': {
		raison:
			"carte d'accueil : elle PROPOSE une leçon et la lance, elle ne rend pas d'exercice — donc aucun type ne l'aiguille.",
		signature: 'lj-title',
	},
	'lecon-passer.ts': {
		raison:
			'« Je ne sais pas, montre-moi » : surcouche de décision/révélation greffée sur les runners existants, pas un runner de type.',
		signature: 'lecon-reveal',
	},
	'lecon-runner-shared.ts': {
		raison:
			'squelette partagé (barre de progression, clôture, écran de résultat) : il est traversé par TOUS les runners un-par-un, jamais aiguillé pour lui-même.',
		signature: 'lqcm-progress-lab',
	},
};

/** Présence d'une classe CSS, au TOKEN près : `lqcm-progress` apparaîtrait sinon dans
 *  `lqcm-progress-lab`, si bien qu'un renommage de la classe cherchée serait « prouvé »
 *  par une classe voisine — la preuve ne prouverait plus rien (constaté en éprouvant ce
 *  gate par mutation, justement). */
const contientClasse = (texte: string, classe: string) =>
	new RegExp(`${classe}(?![\\w-])`).test(texte);

describe('Couverture e2e des runners de leçon (#598)', () => {
	it('l’aiguillage de navigation.ts est bien lu (garde contre un gate à vide)', () => {
		expect(RUNNERS.length, 'aucun src/ui/lecon-*.ts trouvé').toBeGreaterThanOrEqual(10);
		expect(
			AIGUILLAGE.size,
			'aucun aiguillage `t === …` lu dans navigation.ts : la forme du dispatch a changé, ' +
				'et ce gate ne verrait plus aucun runner.',
		).toBeGreaterThanOrEqual(8);
	});

	it.each([...AIGUILLAGE].map(([type, v]) => ({ type, ...v })))(
		'le type « $type » est aiguillé vers un module qui existe',
		({ type, symbole, fichier }) => {
			// Un runner renommé sans mettre à jour l'import ne compilerait pas ; mais un
			// symbole aiguillé qui viendrait d'ailleurs que d'un module `lecon-*` sortirait
			// silencieusement du périmètre de ce gate.
			expect(
				fichier,
				`navigation.ts aiguille le type « ${type} » vers ${symbole}, qui n'est pas importé ` +
					`depuis un module src/ui/lecon-*.ts : ce runner échapperait à ce gate.`,
			).toBeTruthy();
			expect(RUNNERS, `${fichier} est aiguillé mais absent de src/ui/`).toContain(fichier!);
		},
	);

	it.each(RUNNERS.map((f) => ({ fichier: f })))(
		'$fichier est exercé par une spec',
		({ fichier }) => {
			if (FICHIERS_AIGUILLES.has(fichier)) return; // couvert via son type (cf. surface 3)
			const exception = RUNNERS_HORS_AIGUILLAGE[fichier];
			expect(
				exception,
				`${fichier} n'est aiguillé par aucun type dans navigation.ts et n'est pas déclaré ` +
					`dans RUNNERS_HORS_AIGUILLAGE.\n` +
					`Règle CLAUDE.md : « pas de fonctionnalité visuelle sans sa spec ». Soit ce runner ` +
					`est branché sur un type (et sa couverture vient de e2e/journal-couverture.ts), soit ` +
					`il lui faut une spec dédiée ET une entrée ici, avec sa raison et une signature CSS.`,
			).toBeTruthy();
			const source = readFileSync(`src/ui/${fichier}`, 'utf8');
			expect(
				contientClasse(source, exception.signature),
				`La signature « ${exception.signature} » n'apparaît plus dans ${fichier} : la preuve ne ` +
					`prouve plus rien. Motif de l'exception : ${exception.raison}`,
			).toBe(true);
			const specs = SPECS.filter((s) => contientClasse(s.src, exception.signature)).map(
				(s) => s.nom,
			);
			expect(
				specs.length,
				`Aucune spec e2e ne contient « ${exception.signature} », la signature de ${fichier} : ` +
					`ce runner n'est plus exercé.\nMotif de l'exception : ${exception.raison}`,
			).toBeGreaterThan(0);
		},
	);

	it('aucune exception ne couvre un runner désormais aiguillé', () => {
		// Un runner branché sur un type après coup serait couvert deux fois, et son
		// exception (avec sa raison périmée) resterait à décrire un état révolu.
		for (const fichier of Object.keys(RUNNERS_HORS_AIGUILLAGE)) {
			expect(RUNNERS, `${fichier} n'existe plus : retirer son exception.`).toContain(fichier);
			expect(
				FICHIERS_AIGUILLES.has(fichier),
				`${fichier} est maintenant aiguillé par navigation.ts : retirer son exception, sa ` +
					`couverture passe désormais par son type.`,
			).toBe(false);
		}
	});
});

/* ============================================================
   Surface 3 — les types, par délégation à #581
   ============================================================ */

describe('Couverture e2e des types d’exercice, déléguée à #581 (#598)', () => {
	it.each([...AIGUILLAGE.keys()].map((type) => ({ type })))(
		'le type « $type » a son entrée dans la table de couverture du journal',
		({ type }) => {
			// La délégation doit être VÉRIFIÉE, pas supposée : c'est tout ce qui sépare
			// « couvert ailleurs » de « couvert nulle part ».
			expect(
				new RegExp(`^\\t${type}:`, 'm').test(TABLE_JOURNAL),
				`Le type « ${type} » est aiguillé vers un runner par navigation.ts, mais n'a pas ` +
					`d'entrée dans e2e/journal-couverture.ts : personne ne joue ce rendu en e2e.\n` +
					`Déclarer l'entrée (leçon, mode, geste) — la spec paramétrée de #581 s'en servira ` +
					`pour jouer le format et vérifier le round-trip complet.`,
			).toBe(true);
		},
	);

	it('les trois modes du mode Orthographe sont couverts par la même table', () => {
		// `ModeOrtho` (src/core/orthographe/types.ts) ne passe pas par `type.modes` : ces
		// activités ne sont pas des leçons du catalogue. Elles ont pourtant chacune leur
		// rendu et leur correction, donc leur place dans la couverture.
		for (const mode of ['motCache', 'tuiles', 'dictee'])
			expect(
				TABLE_JOURNAL.includes(`modeOrtho: '${mode}'`),
				`Le mode Orthographe « ${mode} » n'a plus d'entrée dans e2e/journal-couverture.ts.`,
			).toBe(true);
	});
});

/* ============================================================
   Surface 4 — les JEUX de l'étagère (#661, critère 19)
   ============================================================

   Les trois surfaces ci-dessus sont aveugles aux jeux, et par construction : un
   `src/ui/jeu-*.ts` n'est ni un mode de leçon, ni un `lecon-*.ts` aiguillé par
   `navigation.ts`, ni un type d'`Exercise`. Un jeu livré sans spec ne faisait donc
   rougir strictement rien — CI verte, aucune erreur, et le trou ne se voit qu'à
   l'usage, des semaines plus tard.

   Le signal de couverture est l'ID DU JEU, pas le nom du fichier : un runner
   s'enregistre par `enregistrerJeu('<id>', …)`, et une spec l'atteint soit par sa
   route (`jeu-<id>`), soit par le bouton de l'étagère (`data-jeu="<id>"`). Prendre
   l'id plutôt que le fichier évite qu'un renommage de module fasse silencieusement
   sauter la garde.

   Le second test ferme l'autre moitié : un jeu déclaré au catalogue sans runner est
   une entrée d'étagère qui n'ouvre rien. */

/* L'id d'un jeu se lit dans le NOM DU FICHIER, pas dans son code. Première
   version : un regex sur `enregistrerJeu('<id>', …)`. Deux défauts rencontrés dès
   les deux premiers runners — un en-tête qui citait le motif pour l'expliquer
   était pris pour l'appel, et un runner passant par une constante
   (`enregistrerJeu(ID_JEU, …)`) n'était pas reconnu du tout. Un gate qui impose
   une façon d'écrire l'appel garde le style, pas la couverture.

   La convention `src/ui/jeu-<id>.ts` est donc la source, et elle devient une
   règle vérifiée : le nom du fichier DIT quel jeu il sert. */
const JEUX_RUNNERS = readdirSync('src/ui')
	.filter((f) => /^jeu-.+\.ts$/.test(f))
	.map((f) => ({ fichier: f, id: f.slice('jeu-'.length, -'.ts'.length) }));

describe('Couverture e2e des jeux de l’étagère (#661)', () => {
	it('chaque runner de jeu porte l’id d’un jeu du catalogue, et l’enregistre', () => {
		expect(JEUX_RUNNERS.length, 'aucun src/ui/jeu-*.ts trouvé').toBeGreaterThan(0);
		const ids = new Set(JEUX.map((j) => j.id));
		for (const r of JEUX_RUNNERS) {
			expect(
				ids.has(r.id),
				`${r.fichier} nomme le jeu « ${r.id} », absent de JEUX (src/core/jeux/catalogue.ts). ` +
					`La convention src/ui/jeu-<id>.ts est ce qui rattache un runner à son jeu.`,
			).toBe(true);
			expect(
				readFileSync(`src/ui/${r.fichier}`, 'utf8').includes('enregistrerJeu('),
				`${r.fichier} n'appelle pas enregistrerJeu(...) : la fabrique n'est jamais posée, ` +
					`donc la route rend la main à l'accueil et le jeu est injouable en silence.`,
			).toBe(true);
		}
	});

	it.each(JEUX.map((j) => ({ id: j.id, label: j.label })))(
		'le jeu « $label » a son runner src/ui/jeu-$id.ts',
		({ id, label }) => {
			// Un jeu du catalogue sans runner s'affiche dans l'étagère et n'ouvre rien :
			// l'enfant clique, la route refuse, il retombe sur l'accueil sans explication.
			expect(
				JEUX_RUNNERS.some((r) => r.id === id),
				`Le jeu « ${label} » est au catalogue mais src/ui/jeu-${id}.ts n'existe pas : ` +
					`il apparaîtrait dans l'étagère sans être jouable.`,
			).toBe(true);
		},
	);

	it.each(JEUX_RUNNERS.map((r) => ({ fichier: r.fichier, id: r.id })))(
		'$fichier est joué par au moins une spec e2e',
		({ fichier, id }) => {
			const specs = SPECS.filter(
				(s) => s.src.includes(`jeu-${id}`) || s.src.includes(`data-jeu="${id}"`),
			).map((s) => s.nom);
			expect(
				specs.length,
				`Aucune spec e2e n'atteint le jeu « ${id} » (${fichier}), ni par sa route ` +
					`« jeu-${id} », ni par « data-jeu="${id}" ».
` +
					`« Pas de fonctionnalité visuelle sans sa spec » (CLAUDE.md) : un jeu est du ` +
					`visuel pur, et aucune autre surface de ce gate ne le voit.`,
			).toBeGreaterThan(0);
		},
	);
});
