import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { contraste, melange, SEUIL_NON_TEXTE_AA, SEUIL_TEXTE_AA } from '../tools/contrast/wcag.js';

/* ============================================================
   Contraste WCAG AA des tokens de couleur, thème par thème (#576 puis #582).

   ── Pourquoi ce fichier existe (#576) ──────────────────────────────────────────
   Le token `--muted` a vécu des années sous AA (#9aa1ac ≈ 2,6:1 sur blanc). Le
   défaut ne s'est pas vu parce qu'il n'échoue nulle part bruyamment : le texte
   s'affiche, il est juste illisible pour qui a une vue moyenne au soleil. Il a été
   contourné À LA MAIN dans quatre feuilles (chacune redécouvrant le problème et
   écrivant son propre commentaire) avant d'être corrigé à la source.

   Ce test empêche la rechute et, surtout, la rechute PAR UN AUTRE CHEMIN : un thème
   ajouté demain avec un `--accent-soft` un peu plus sombre suffirait à refaire passer
   `--muted` sous 4,5:1 sans que personne ne touche au token. Il lit donc les tokens
   dans les feuilles et éprouve CHAQUE couple (texte, surface) de CHAQUE thème.

   Pourquoi ici et pas seulement dans le scan axe : axe ne visite que 9 vues, ne voit
   qu'un thème à la fois (celui rendu), et il est NON BLOQUANT par défaut. Ce test
   couvre les 6 thèmes en quelques millisecondes et fait échouer `npm test`.

   ── Ce que #582 y ajoute ───────────────────────────────────────────────────────
   La rampe de gris n'était qu'un couple parmi d'autres. On déclare maintenant une
   TABLE de paires (texte, fond) et une table de paires non-textuelles, chacune
   accompagnée de l'endroit où le couple existe VRAIMENT dans les feuilles. C'est la
   règle de construction de ces tables : on ne teste pas les couples plausibles, on
   teste ceux qu'on peut montrer du doigt. Un couple inventé produit soit une garde
   qui ne garde rien, soit une dérogation de plus à justifier — dans les deux cas du
   bruit qui décrédibilise le gate. Deux exemples de couples ÉCARTÉS pour cette
   raison : `--on-accent` sur `--admin-fill` — les boutons de l'espace encadrant écrivent
   `#fff` en dur, pas `--on-accent`, donc le couple mesuré n'existe pas.
   ERREUR CORRIGÉE (#583) : `--accent` sur `--page-bg` avait été écarté de la même façon,
   au motif que « l'accent en texte est toujours posé sur une carte ». C'était faux. Le
   scan axe l'a trouvé sur cinq éléments réels (titre de filtre du sprint, boutons de
   retour, titres de rubrique du catalogue). La leçon vaut d'être gardée : écarter un
   couple parce qu'on n'a pas su le trouver n'est pas la même chose que l'écarter parce
   qu'il n'existe pas — dans le doute, chercher plus, ou l'inclure.

   La formule vient de `tools/contrast/wcag.js`, partagé avec l'outil interactif
   `tools/contrast/contrast.mjs` : celui qu'on lance pour CHOISIR une couleur et celui
   qui fait échouer `npm test` mesurent la même chose par construction, au lieu de
   deux copies qui divergent en silence.

   ── Ce qui est HORS PÉRIMÈTRE, et pourquoi ────────────────────────────────────
   WCAG 1.4.11 (non-texte) ne vise que les COMPOSANTS d'interface et les objets
   graphiques PORTEURS d'information. Les éléments purement décoratifs en sont
   explicitement exemptés, et le dépôt en est plein :
     • `--line` sur `--paper` (1,23:1) et `--track` sur `--paper` (1,20:1) : filets,
       séparateurs, fond de jauge. Les soumettre aux 3:1 obligerait à redessiner tous
       les traits de l'application — un gate qu'on dérogerait partout ne garde rien.
     • `--warn-bd` sur `--warn-bg` (1,28:1) : liseré décoratif. Le dépôt a déjà tranché
       (encadrant.scss, `.enc-revoir-signal`) en prenant `--warn` PLEIN quand la puce
       doit réellement se voir.
     • `--warn` comme TEXTE : le seul usage restant (`.enc-tendance-glyphe`) est
       `aria-hidden` et doublé par le mot en clair → objet graphique décoratif, pas du
       texte. Partout ailleurs le dépôt évite déjà `--warn` en texte (#8a5200 écrit à
       la main). Le couple est donc gardé au seuil non-texte, pas au seuil texte.
   ============================================================ */

/** Tokens `--x: #rrggbb;` d'un bloc de déclarations. Volontairement limité aux
 *  littéraux hexadécimaux : un token défini par `var(--autre)` serait invisible ici,
 *  et le test « les palettes sont bien lues » échouerait bruyamment plutôt que de
 *  mesurer du vide. D'où la consigne, dans themes.scss, d'écrire la valeur en dur. */
function tokens(bloc: string): Record<string, string> {
	const t: Record<string, string> = {};
	for (const m of bloc.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g))
		t[m[1]] = m[2].toLowerCase();
	return t;
}

const BASE = readFileSync('src/styles/base.scss', 'utf8');
const THEMES = readFileSync('src/styles/themes.scss', 'utf8');

const debutRacine = BASE.indexOf(':root {');
const RACINE = tokens(BASE.slice(debutRacine, BASE.indexOf('\n}', debutRacine)));

/** Palette effective de chaque thème : la racine, écrasée par ses propres tokens. */
function palettes(): Record<string, Record<string, string>> {
	const p: Record<string, Record<string, string>> = { defaut: { ...RACINE } };
	for (const m of THEMES.matchAll(/:root\[data-theme='([\w-]+)'\]\s*\{([\s\S]*?)\n\}/g)) {
		// « auto » ne déclare aucun token : il inclut le mixin Nuit derrière une media
		// query, non résolue en JS. L'ajouter produirait un doublon exact de « defaut »
		// (donc 6 cas de plus qui ne testent rien de neuf) alors que sa vraie palette
		// est celle de « nuit », déjà couverte ci-dessous.
		if (m[1] === 'auto') continue;
		p[m[1]] = { ...RACINE, ...tokens(m[2]) };
	}
	const nuit = THEMES.match(/@mixin nuit-palette\s*\{([\s\S]*?)\n\}/);
	if (nuit) p.nuit = { ...RACINE, ...tokens(nuit[1]) };
	return p;
}

const PALETTES = palettes();
const THEMES_NOMS = Object.keys(PALETTES);

/* ============================================================
   #576 — la rampe de gris
   ============================================================ */

/* Les trois niveaux de la rampe de gris, tous employés comme TEXTE. */
const TEXTES = ['--ink', '--grey', '--muted'];
/* Les surfaces sur lesquelles ce texte se pose réellement. `--accent-soft` est dans la
   liste parce que c'est la plus SERRÉE des trois, et celle qu'on oublie : le défaut
   corrigé en #576 échouait justement dessus alors qu'il passait déjà sur `--paper`. */
const SURFACES = ['--paper', '--page-bg', '--accent-soft'];

const CAS = Object.entries(PALETTES).flatMap(([theme, p]) =>
	TEXTES.flatMap((texte) => SURFACES.map((surface) => ({ theme, texte, surface, p }))),
);

describe('Contraste AA de la rampe de gris (#576)', () => {
	it('les palettes sont bien lues (garde contre un test à vide)', () => {
		// 5 thèmes clairs (défaut + 4 déblocables) + Nuit.
		expect(THEMES_NOMS.length).toBeGreaterThanOrEqual(6);
		expect(CAS.length).toBeGreaterThanOrEqual(54);
		for (const { p, texte, surface } of CAS) {
			expect(p[texte], `token ${texte} illisible dans les feuilles`).toMatch(/^#[0-9a-f]{6}$/);
			expect(p[surface], `token ${surface} illisible dans les feuilles`).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it.each(CAS)('$theme : $texte sur $surface atteint AA', ({ theme, texte, surface, p }) => {
		const r = contraste(p[texte], p[surface]);
		expect(
			r,
			`Thème « ${theme} » : ${texte} (${p[texte]}) sur ${surface} (${p[surface]}) = ` +
				`${r.toFixed(2)}:1, sous les ${SEUIL_TEXTE_AA}:1 exigés par WCAG AA pour du texte courant.\n` +
				`Le texte s'affichera quand même — c'est ce qui rend ce défaut invisible en relecture.\n` +
				`Assombrir le token, ou éclaircir la surface ; ne pas contourner feuille par feuille.`,
		).toBeGreaterThanOrEqual(SEUIL_TEXTE_AA);
	});

	/* L'autre moitié de #576, et la plus retorse : une OPACITÉ sur un conteneur dilue
	   tout ce qu'il contient vers le fond. La carte d'un trophée verrouillé était à
	   `opacity: 0.55`, ce qui faisait tomber son titre à 3,9:1 et sa description à
	   2,6:1 — axe rapportait un « #a1a1a1 » qui n'est écrit nulle part, puisque c'est
	   --grey vu à travers l'opacité. Aucun choix de token ne peut corriger ça (même
	   --ink, à 17:1, retombe à 3,9:1) : c'est l'opacité qu'il faut relever. D'où ce
	   test, qui recalcule la couleur COMPOSÉE au lieu de figer un nombre magique. */
	it('un trophée verrouillé reste lisible malgré son estompage', () => {
		const css = readFileSync('src/styles/gamification.scss', 'utf8');
		const m = css.match(/\.trophy\.off\s*\{[^}]*opacity:\s*([\d.]+)/);
		expect(
			m,
			'.trophy.off introuvable : la règle a changé de nom, ce test ne garde plus rien',
		).toBeTruthy();
		const alpha = Number(m![1]);
		for (const [theme, p] of Object.entries(PALETTES)) {
			for (const texte of ['--ink', '--grey']) {
				const compose = melange(p[texte], p['--paper'], alpha);
				const r = contraste(compose, p['--paper']);
				expect(
					r,
					`Thème « ${theme} » : à opacity ${alpha}, ${texte} d'un trophée verrouillé se compose ` +
						`en ${compose} sur ${p['--paper']}, soit ${r.toFixed(2)}:1 — sous AA.\n` +
						`Remonter l'opacité (la désaturation porte déjà le signal « pas encore débloqué »), ` +
						`pas la couleur : l'opacité rediluerait tout token qu'on mettrait dessous.`,
				).toBeGreaterThanOrEqual(SEUIL_TEXTE_AA);
			}
		}
	});

	it('--muted reste VISIBLEMENT plus clair que --grey (hiérarchie à trois niveaux)', () => {
		// Sans cette garde, la façon la plus simple de faire passer le test ci-dessus
		// serait d'aligner --muted sur --grey — ce qui supprimerait un niveau de
		// hiérarchie visuelle au lieu de corriger le contraste.
		for (const [theme, p] of Object.entries(PALETTES)) {
			const muted = contraste(p['--muted'], p['--paper']);
			const grey = contraste(p['--grey'], p['--paper']);
			expect(
				grey - muted,
				`Thème « ${theme} » : --muted (${muted.toFixed(2)}:1) et --grey (${grey.toFixed(2)}:1) ` +
					`sont devenus presque identiques — le niveau « discret » a disparu.`,
			).toBeGreaterThan(1);
		}
	});
});

/* ============================================================
   #582 — la table de paires de tokens
   ============================================================ */

/** Un même couple peut relever des DEUX régimes : `--accent` sur `--paper` est du
 *  texte (4,5:1) quand c'est un libellé, et un composant d'interface (3:1) quand
 *  c'est la bordure d'un bouton. Les deux cas coexistent donc dans les tables, et la
 *  nature fait partie de l'identité d'un cas — sinon une dérogation posée sur l'un
 *  déborde silencieusement sur l'autre. */
type Nature = 'texte' | 'non-texte';

type Paire = {
	/** Token posé DEVANT (couleur de texte, de glyphe, de bordure). */
	avant: string;
	/** Token posé DERRIÈRE (surface). */
	arriere: string;
	/** Où le couple existe vraiment. Sert de preuve, et de point de départ pour qui
	 *  doit corriger : sans ça, on ne sait pas quel écran regarder. */
	ou: string;
};

/** Couples employés comme TEXTE COURANT → 4,5:1 (WCAG 1.4.3).
 *  La rampe de gris (--ink/--grey/--muted sur --paper/--page-bg/--accent-soft) est
 *  déjà couverte plus haut ; on ne la redéclare pas ici. */
const PAIRES_TEXTE: Paire[] = [
	{ avant: '--on-accent', arriere: '--accent', ou: 'bilan.scss .bilan-cta, aide-exercice.scss' },
	{ avant: '--on-accent', arriere: '--accent-dark', ou: 'survol des mêmes boutons (bilan.scss)' },
	{ avant: '--on-accent', arriere: '--ok', ou: 'lecon-mode.scss .lord-cell.correct .lord-mark' },
	{ avant: '--on-accent', arriere: '--ko', ou: 'lecon-mode.scss .lord-cell.wrong .lord-mark' },
	{ avant: '--accent-dark', arriere: '--paper', ou: 'accessibility.scss, aide-exercice.scss' },
	{ avant: '--accent', arriere: '--paper', ou: 'sprint.scss, titres et libellés dans une carte' },
	{
		avant: '--accent',
		arriere: '--page-bg',
		ou: 'sprint-config (#scFilterTitle), boutons de retour, titres de rubrique du catalogue',
	},
	{
		avant: '--accent',
		arriere: '--accent-soft',
		ou: 'revision.scss .rev-cat, lecon-mode.scss .ltri-col-titre',
	},
	{
		avant: '--ok',
		arriere: '--ok-soft',
		ou: 'lecon-mode.scss .mode-btn-badge, .sprint-choice.correct',
	},
	{ avant: '--ok', arriere: '--paper', ou: 'encadrant.scss (mise en avant positive)' },
	{ avant: '--ko', arriere: '--ko-soft', ou: 'lecon-mode.scss .sprint-choice.wrong' },
	{ avant: '--ko', arriere: '--paper', ou: 'encadrant.scss (alerte de suppression)' },
	{ avant: '--ink', arriere: '--track', ou: 'surface neutre pleine : jauge, bouton « fantôme »' },
	{ avant: '--grey', arriere: '--track', ou: 'idem, texte secondaire' },
	// Espace encadrant : surface ADULTE, absente de la rampe #576 (qui ne connaît que
	// --paper et --page-bg) alors que c'est un fond de page à part entière.
	{ avant: '--ink', arriere: '--admin-bg', ou: 'encadrant.scss .enc-wrap' },
	{ avant: '--grey', arriere: '--admin-bg', ou: 'encadrant.scss (texte secondaire)' },
	{ avant: '--muted', arriere: '--admin-bg', ou: 'encadrant.scss (texte discret)' },
	{ avant: '--admin-accent', arriere: '--admin-bg', ou: 'encadrant.scss (titres)' },
	{ avant: '--admin-accent', arriere: '--paper', ou: 'encadrant.scss .enc-btn-sec' },
];

/** Couples de COMPOSANTS D'INTERFACE ou d'objets graphiques porteurs de sens
 *  → 3:1 (WCAG 1.4.11). Voir l'en-tête pour ce qui en est délibérément exclu. */
const PAIRES_NON_TEXTE: Paire[] = [
	{
		avant: '--field-line',
		arriere: '--paper',
		ou: 'sheets.scss .ans — la ligne qui dit OÙ écrire',
	},
	{
		avant: '--accent-soft',
		arriere: '--paper',
		ou: 'sprint.scss .sprint-choice, pave-signes.scss .pave-signe (bordure au repos)',
	},
	{
		avant: '--accent',
		arriere: '--paper',
		ou: 'bordure des mêmes boutons une fois survolés/pressés, remplissage de jauge',
	},
	{
		avant: '--warn',
		arriere: '--paper',
		ou: 'encadrant.scss .enc-revoir-signal (liseré « ça bloque »)',
	},
];

/** Dérogation = défaut CONNU, tracé, et pas corrigé ici.
 *
 *  Le test correspondant est inversé : il exige que le couple soit ENCORE en échec.
 *  Autrement dit une dérogation s'auto-périme — le jour où quelqu'un corrige la
 *  couleur, `npm test` échoue tant qu'il n'a pas retiré l'entrée. Sans ça, une
 *  allow-list survit à ce qu'elle justifiait et finit par masquer une vraie
 *  régression : c'est exactement le travers que ce chantier de gates cherche à
 *  supprimer. Le prix est un échec « inutile » au moment de la correction ; il est
 *  volontaire, et le message dit quoi faire. */
type Derogation = Paire & { nature: Nature; themes: string[]; issue: string; motif: string };

const DEROGATIONS: Derogation[] = [
	{
		avant: '--accent',
		arriere: '--accent-soft',
		ou: '',
		nature: 'texte',
		themes: ['defaut', 'ciel', 'automne', 'lagon', 'fruit-rouge'],
		issue: '#600',
		motif:
			'3,59:1 à 4,50:1 selon le thème. Corriger veut dire déplacer CINQ couleurs de ' +
			'marque (ou leurs surfaces douces) : décision de design, pas réglage de token.',
	},
	{
		avant: '--accent',
		arriere: '--page-bg',
		ou: '',
		nature: 'texte',
		themes: ['defaut', 'automne', 'lagon'],
		issue: '#600',
		motif:
			'4,48 / 4,27 / 3,80:1 — même cause que le couple ci-dessus, sur le fond de page. ' +
			'Trouvé par le scan axe en basculant le gate a11y (#583), après avoir été écarté à tort.',
	},
	{
		avant: '--accent',
		arriere: '--paper',
		ou: '',
		nature: 'texte',
		themes: ['lagon'],
		issue: '#438',
		motif:
			"4,16:1 — l'accent Lagon (#0a8a8f) est simplement trop clair ; même cause que " +
			"l'échec de --on-accent sur --accent ci-dessous, une seule correction règle les deux.",
	},
	{
		avant: '--on-accent',
		arriere: '--accent',
		ou: '',
		nature: 'texte',
		themes: ['lagon'],
		issue: '#438',
		motif: '4,16:1 sur les états sélectionnés (QCM multiple, tri, appariement, tuiles).',
	},
	{
		avant: '--ok',
		arriere: '--ok-soft',
		ou: '',
		nature: 'texte',
		themes: ['defaut', 'ciel', 'automne', 'lagon', 'fruit-rouge'],
		issue: '#601',
		motif:
			"4,41:1 — ni --ok ni --ok-soft ne sont réécrits par les thèmes clairs, d'où le " +
			'même écart partout. Nuit est conforme (7,07:1).',
	},
	{
		avant: '--accent-soft',
		arriere: '--paper',
		ou: '',
		nature: 'non-texte',
		themes: THEMES_NOMS,
		issue: '#385',
		motif:
			'1,15 à 1,26:1 — --accent-soft est une teinte de SURFACE employée comme bordure. ' +
			'Les états survol / pressé / focus sont conformes ; seul le repos échoue.',
	},
];

const cle = (p: { avant: string; arriere: string }, nature: Nature, theme: string) =>
	`${p.avant} sur ${p.arriere} [${nature}] @ ${theme}`;

const PAR_CLE = new Map<string, Derogation>();
for (const d of DEROGATIONS) for (const t of d.themes) PAR_CLE.set(cle(d, d.nature, t), d);

type Cas = {
	theme: string;
	avant: string;
	arriere: string;
	ou: string;
	nature: Nature;
	seuil: number;
	issue: string;
	motif: string;
	derogee: boolean;
};

const CAS_PAIRES: Cas[] = [
	...PAIRES_TEXTE.map((p) => [p, 'texte' as Nature, SEUIL_TEXTE_AA] as const),
	...PAIRES_NON_TEXTE.map((p) => [p, 'non-texte' as Nature, SEUIL_NON_TEXTE_AA] as const),
].flatMap(([p, nature, seuil]) =>
	THEMES_NOMS.map((theme) => {
		const d = PAR_CLE.get(cle(p, nature, theme));
		return {
			theme,
			avant: p.avant,
			arriere: p.arriere,
			ou: p.ou,
			nature,
			seuil,
			issue: d?.issue ?? '',
			motif: d?.motif ?? '',
			derogee: Boolean(d),
		};
	}),
);

const CONFORMES = CAS_PAIRES.filter((c) => !c.derogee);
const DEROGES = CAS_PAIRES.filter((c) => c.derogee);

function mesure(c: Cas): number {
	const p = PALETTES[c.theme];
	return contraste(p[c.avant], p[c.arriere]);
}

describe('Contraste des paires de tokens, tous thèmes (#582)', () => {
	it('la table couvre bien tous les thèmes et tous les tokens cités', () => {
		expect(THEMES_NOMS.length).toBeGreaterThanOrEqual(6);
		expect(CAS_PAIRES.length).toBe(
			(PAIRES_TEXTE.length + PAIRES_NON_TEXTE.length) * THEMES_NOMS.length,
		);
		for (const c of CAS_PAIRES) {
			const p = PALETTES[c.theme];
			for (const token of [c.avant, c.arriere])
				expect(
					p[token],
					`Thème « ${c.theme} » : le token ${token} n'a pas été lu dans les feuilles. ` +
						`Soit il a été renommé ou supprimé, soit il est défini par un var(--autre) ` +
						`que ce test ne résout pas (écrire la valeur en dur, cf. --field-line).`,
				).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it.each(CONFORMES)('$theme : $avant sur $arriere ≥ $seuil:1', (c) => {
		const p = PALETTES[c.theme];
		const r = mesure(c);
		expect(
			r,
			`Thème « ${c.theme} » : ${c.avant} (${p[c.avant]}) sur ${c.arriere} (${p[c.arriere]}) = ` +
				`${r.toFixed(2)}:1, sous les ${c.seuil}:1 exigés.\n` +
				`Où ce couple existe : ${c.ou}.\n` +
				`Rien ne « cassera » à l'écran — c'est ce qui rend ces défauts invisibles en ` +
				`relecture, et pourquoi ils sont tenus par un test plutôt que par un avis.`,
		).toBeGreaterThanOrEqual(c.seuil);
	});

	it.each(DEROGES)('$theme : $avant sur $arriere — dérogation $issue encore justifiée', (c) => {
		const r = mesure(c);
		expect(
			r,
			`Thème « ${c.theme} » : ${c.avant} sur ${c.arriere} atteint maintenant ${r.toFixed(2)}:1, ` +
				`donc le seuil de ${c.seuil}:1 est tenu — bonne nouvelle, mais la dérogation ${c.issue} ` +
				`est devenue fausse.\n` +
				`RETIRER l'entrée correspondante de DEROGATIONS (et fermer ${c.issue}) : le couple ` +
				`repassera alors dans les cas conformes, où il sera gardé pour de bon.\n` +
				`Motif d'origine : ${c.motif}`,
		).toBeLessThan(c.seuil);
	});

	it('aucune dérogation ne vise un couple absent de la table', () => {
		// Une dérogation dont le couple a disparu (token renommé, paire retirée) ne
		// déclencherait plus rien : elle resterait là à décrire une dette imaginaire.
		const couples = new Set([
			...PAIRES_TEXTE.map((p) => `${p.avant} sur ${p.arriere} [texte]`),
			...PAIRES_NON_TEXTE.map((p) => `${p.avant} sur ${p.arriere} [non-texte]`),
		]);
		for (const d of DEROGATIONS) {
			expect(
				couples.has(`${d.avant} sur ${d.arriere} [${d.nature}]`),
				`La dérogation ${d.issue} vise « ${d.avant} sur ${d.arriere} » en ${d.nature}, qui ne ` +
					`fait plus partie des paires testées : la retirer, ou remettre la paire dans la table.`,
			).toBe(true);
			for (const t of d.themes)
				expect(
					THEMES_NOMS,
					`La dérogation ${d.issue} vise le thème « ${t} », qui n'existe plus.`,
				).toContain(t);
		}
	});
});

/* ============================================================
   Le module partagé lui-même (#582)
   ============================================================ */

describe('Formule de contraste partagée (tools/contrast/wcag.js)', () => {
	it('retrouve les ancres WCAG connues', () => {
		expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
		expect(contraste('#123456', '#123456')).toBeCloseTo(1, 5);
		// Les deux gris qui encadrent le seuil AA à un cran près : si la formule dérive,
		// c'est là que ça se voit d'abord.
		expect(contraste('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
		expect(contraste('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
		expect(contraste('#595959', '#ffffff')).toBeCloseTo(7.0, 2);
	});

	it('accepte les formats courts et rgb(), et refuse le reste', () => {
		expect(contraste('#fff', '#000')).toBeCloseTo(21, 5);
		expect(contraste('rgb(255, 255, 255)', '000000')).toBeCloseTo(21, 5);
		// Un format non reconnu doit LEVER : renvoyer NaN ferait passer silencieusement
		// n'importe quelle comparaison `>= seuil` pour un échec, ou l'inverse.
		expect(() => contraste('bleu', '#fff')).toThrow();
	});

	it('compose une opacité comme le ferait le navigateur', () => {
		expect(melange('#ffffff', '#000000', 0.5)).toBe('#808080');
		expect(melange('#ffffff', '#000000', 1)).toBe('#ffffff');
		expect(melange('#ffffff', '#000000', 0)).toBe('#000000');
	});
});
