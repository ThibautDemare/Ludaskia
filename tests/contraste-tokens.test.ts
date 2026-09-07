import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import {
	contraste,
	melange,
	SEUIL_GRAND_TEXTE_AA,
	SEUIL_NON_TEXTE_AA,
	SEUIL_TEXTE_AA,
} from '../tools/contrast/wcag.js';

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

   ── Ce que #661 y ajoute ───────────────────────────────────────────────────────
   Deux invariants qui échappaient à la lecture par tokens, tous deux repérés en
   relecture d'accessibilité et tous deux écrits nulle part ailleurs qu'en commentaire :
     • la palette du plateau du 2048, faite de LITTÉRAUX (une aire de jeu garde la même
       rampe sur les six thèmes, donc elle ne peut pas être tokenisée). Ses ratios
       étaient mesurés à la main dans l'en-tête de sa feuille ; ils sont désormais relus
       et recalculés ici ;
     • un couple dont la conformité tient à la TAILLE du texte et non à sa couleur
       (`--on-accent` sur `--warn`, 4,24:1). D'où une troisième nature de cas, et le
       contrôle des planchers de police qui la justifient.
   Dans les deux cas, le motif est celui de #576 : un constat juste, écrit une fois,
   sans test, ne tient rien. Une section « auto-contrôle » en fin de fichier rejoue ces
   contrôles sur des feuilles mutées en mémoire, pour vérifier qu'ils savent dire NON.
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
	for (const m of bloc.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*(?:!important)?\s*;/g))
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

/** Opacité des arêtes de profondeur des solides (#387), lue dans le module de figures :
 *  c'est du TypeScript et non une feuille, mais la couleur qui en résulte est composée
 *  par le navigateur exactement comme celle d'un voile CSS. */
const SOLIDES = readFileSync('src/core/figures/solides.ts', 'utf8');
const OPACITE_DEPTH = Number(
	SOLIDES.match(/const DEPTH = \{[\s\S]*?opacity:\s*([\d.]+)/)?.[1] ?? 0,
);

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

	/* Même piège que le trophée ci-dessus, dans l'autre sens (#609) : les pastilles
	   translucides de la barre d'outils — chrono, bouton profil, boutons fantômes —
	   sont des VOILES posés sur la barre, donc leur fond n'est écrit dans aucune
	   feuille, c'est une composition. Un voile BLANC éclaircit l'accent, ce qui fait
	   BAISSER le contraste du texte blanc posé dessus : le défaut est arrivé par là,
	   entre 3,25 et 4,50:1 selon le thème, sur le chiffre que l'enfant lit sous
	   pression de temps et sur son propre prénom.
	   Le test lit le voile et son alpha DANS les feuilles au lieu de figer un nombre :
	   revenir à un voile clair sur les thèmes clairs, ou monter l'alpha du blanc de
	   Nuit, le fait échouer. Les trois pastilles partagent `--voile-barre` (une seule
	   déclaration, cf. toolbar.scss) — c'est justement la recopie de ce `rgba` dans
	   quatre règles qui avait dispersé le défaut, donc le test mesure le TOKEN.
	   Aucune ne qualifie comme « grand texte » (chrono 18px gras = 13,5pt, les boutons
	   14px gras = 10,5pt ; le seuil est à 14pt gras) → seuil texte courant. */
	const voileBarre = (bloc: string) =>
		bloc.match(/--voile-barre:\s*rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/);

	it('le texte des pastilles de la barre reste lisible sur leur fond composé (#609)', () => {
		const toolbar = readFileSync('src/styles/toolbar.scss', 'utf8');
		const clair = voileBarre(toolbar.slice(toolbar.indexOf('.toolbar {')));
		expect(
			clair,
			'`--voile-barre` introuvable dans la règle `.toolbar` : la déclaration a changé de forme, ce test ne garde plus rien',
		).toBeTruthy();
		// Nuit garde un voile à lui, redéclaré dans `nuit-overrides` (barre sombre : un
		// voile sombre y effacerait les pastilles). Sans cette lecture, le test mesurerait
		// le voile clair sur la barre Nuit, qui n'est pas ce que le navigateur rend.
		const blocNuit = THEMES.slice(THEMES.indexOf('@mixin nuit-overrides'));
		const nuit = voileBarre(blocNuit);
		expect(nuit, '`--voile-barre` de `nuit-overrides` introuvable').toBeTruthy();
		const barreNuit = blocNuit.match(/\.toolbar \{\s*background: (#[0-9a-fA-F]{6})/);
		expect(barreNuit, 'fond de `.toolbar` en Nuit introuvable').toBeTruthy();

		for (const [theme, p] of Object.entries(PALETTES)) {
			const estNuit = theme === 'nuit';
			// La barre porte `--accent`, SAUF en Nuit où `nuit-overrides` lui donne la sienne.
			const barre = estNuit ? barreNuit![1].toLowerCase() : p['--accent'];
			const m = estNuit ? nuit! : clair!;
			const voile = `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
			const fond = melange(voile, barre, Number(m[4]));
			const r = contraste('#ffffff', fond);
			expect(
				r,
				`Thème « ${theme} » : le voile ${voile} à ${m[4]} posé sur la barre ${barre} ` +
					`compose ${fond} ; le texte blanc des pastilles y fait ${r.toFixed(2)}:1, sous ` +
					`les ${SEUIL_TEXTE_AA}:1 exigés.\n` +
					`La couleur fautive n'est écrite nulle part — seul ce calcul, ou axe, la voit.\n` +
					`Un voile sombre relève le contraste sur les six thèmes d'un coup ; un voile ` +
					`clair le dégrade d'autant plus que la barre est sombre.`,
			).toBeGreaterThanOrEqual(SEUIL_TEXTE_AA);
		}
	});

	/* L'autre moitié de #609, et celle qu'on perdrait en optimisant le test ci-dessus :
	   un voile assez opaque passe le contraste du texte, mais peut noyer la pastille
	   dans la barre. Or la pastille EST le repère que l'enfant vise du coin de l'œil.
	   Le plancher est calé sur ce que rendait le voile blanc historique (1,27 au plus
	   serré, en fruit rouge) : la correction ne doit pas faire moins bien que ce qu'elle
	   remplace. Rien à voir avec un seuil WCAG — c'est un repère de forme, pas un
	   composant porteur d'information (le texte l'est, et il est tenu ci-dessus).
	   Nuit est EXCLU : ses pastilles y sont sous ce plancher depuis toujours (1,66 pour
	   le chrono, mais 1,06 pour le bouton fantôme, dont c'est le liseré qui porte la
	   forme). Un plancher qu'on devrait déroger dès le premier thème ne garderait rien. */
	it('les pastilles de la barre restent détachées du fond (#609)', () => {
		const toolbar = readFileSync('src/styles/toolbar.scss', 'utf8');
		const m = voileBarre(toolbar.slice(toolbar.indexOf('.toolbar {')))!;
		const PLANCHER = 1.27;
		for (const [theme, p] of Object.entries(PALETTES)) {
			if (theme === 'nuit') continue;
			const barre = p['--accent'];
			const fond = melange(`rgb(${m[1]}, ${m[2]}, ${m[3]})`, barre, Number(m[4]));
			const r = contraste(fond, barre);
			expect(
				r,
				`Thème « ${theme} » : la pastille (${fond}) ne se détache plus de la barre ` +
					`(${barre}) — ${r.toFixed(2)}:1, sous le plancher de ${PLANCHER} que rendait déjà ` +
					`le voile d'avant #609.\nUn voile trop discret rend le texte lisible mais fait ` +
					`disparaître le repère que l'enfant cherche du coin de l'œil.`,
			).toBeGreaterThanOrEqual(PLANCHER);
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
 *  déborde silencieusement sur l'autre.
 *
 *  Et une TROISIÈME nature depuis #661 : du texte dont la conformité vient de sa TAILLE
 *  (WCAG 1.4.3 accorde 3:1 au « grand texte »). Elle est à part parce que la contrepartie
 *  l'est aussi — un plancher de corps à tenir dans la feuille, cf. PAIRES_GRAND_TEXTE. */
type Nature = 'texte' | 'non-texte' | 'grand-texte';

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
	// Troisième état du code du Motus (#661) : « lettre absente du mot ». Les deux autres
	// (--ok, et --warn au régime « grand texte ») sont ailleurs dans ces tables ; celui-ci
	// passe le seuil du texte courant, donc il est gardé au plus strict des deux.
	{
		avant: '--on-accent',
		arriere: '--grey',
		ou: "jeu-motus.scss .motus-case / .motus-touche [data-etat='absente']",
	},
	{
		avant: '--accent-dark',
		arriere: '--paper',
		ou: 'accessibility.scss, aide-exercice.scss, mots-difficiles.scss .mots-difficiles-relire',
	},
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
	// `--accent-soft` comme BORDURE a disparu du dépôt avec #385 : c'était une teinte de
	// surface employée comme trait (1,15 à 1,26:1). Les cinq boutons de choix qui la
	// portaient tirent désormais leur contour de repos du token ci-dessous. Le couple
	// n'est donc plus dans la table — on ne teste que les couples qu'on peut montrer du
	// doigt — et sa dérogation est tombée avec lui.
	{
		avant: '--control-line',
		arriere: '--paper',
		ou: 'sprint.scss .sprint-choice, pave-signes.scss .pave-signe, lecon-mode.scss .etude-btn, .lqcm-multi-choice et .mode-btn[data-epuise="1"] (bordure au repos), jeu-sudoku.scss les bords de RÉGION de la grille (#666, critère 9)',
	},
	{
		avant: '--accent',
		arriere: '--paper',
		ou: 'bordure des mêmes boutons une fois survolés/pressés, remplissage de jauge',
	},
	{
		avant: '--warn',
		arriere: '--paper',
		ou: 'encadrant.scss .enc-revoir-signal (liseré « ça bloque »), jeu-sudoku.scss .sudoku-case[data-conflit] (les formes en double, #666, critère 15)',
	},
	// Décompte gelé pendant l'écoute d'un énoncé (#630) : un liseré pointillé cerne le
	// minuteur, en `currentColor` — donc `--accent` au repos, `--ko` dans les 30
	// dernières secondes. `outline-offset` le pose HORS de la carte du minuteur, donc
	// sur le fond de page et non sur `--paper`. C'est bien un objet porteur d'état :
	// c'est le seul signal, avec le badge, que le temps ne court plus.
	{ avant: '--accent', arriere: '--page-bg', ou: 'sprint.scss .sprint-time.en-pause' },
	{ avant: '--ko', arriere: '--page-bg', ou: 'sprint.scss .sprint-time.en-pause.low' },
	// Bouton CONTOURÉ : la bordure est la seule chose qui dit « c'est cliquable », donc un
	// composant d'interface au sens de 1.4.11, pas un filet décoratif. Même couple que son
	// texte, déclaré à part parce que la nature fait partie de l'identité d'un cas (#582).
	{
		avant: '--accent-dark',
		arriere: '--paper',
		ou: 'mots-difficiles.scss .mots-difficiles-relire (bordure et anneau de focus)',
	},
	// Rampe des étapes de dictée (#545) : segments de la frise de composition, posés sur la
	// carte. Ce sont bien des objets graphiques PORTEURS de sens — la longueur d'un segment
	// EST le nombre de mots à cette étape — donc le seuil non-texte s'applique à chacun.
	// Ce qui n'est PAS testé ici, et ne peut pas l'être : l'écart entre deux rangs VOISINS de
	// la rampe. Il est sous 3:1 par construction, comme celui des états voisins de la frise
	// d'à côté, et c'est assumé : ce sont l'ordre constant des segments, le filet qui les
	// sépare et les dénombrements écrits qui portent l'information.
	// Les deux frontières les plus serrées, écrites en toutes lettres parce qu'une dérogation
	// vague se relit comme une dérogation confortable : 1,01:1 (gris du bas contre premier
	// rose, en Nuit) et 1,24:1 (rang sous le sommet contre --ok, en Nuit). La seconde est celle
	// qui compte, deux teintes claires qu'un œil deutan ne départage pas ; le récit affiché en
	// texte visible dans le repli est ce qui la rend non porteuse d'information.
	{
		avant: '--compo-atelier',
		arriere: '--paper',
		ou: 'encadrant.scss .enc-compo-seg / .enc-compo-part (mots découverts)',
	},
	{
		avant: '--compo-tuiles',
		arriere: '--paper',
		ou: 'encadrant.scss (mots ayant réussi les tuiles)',
	},
	{
		avant: '--compo-cache',
		arriere: '--paper',
		ou: 'encadrant.scss (mots ayant réussi le mot caché)',
	},
	// Le SOMMET de l'escalier prend --ok, déjà couvert plus haut comme TEXTE sur --paper ;
	// il l'est ici comme objet graphique, les deux régimes étant distincts (cf. Nature).
	{
		avant: '--ok',
		arriere: '--paper',
		ou: 'encadrant.scss (segment des mots maîtrisés, frise de composition #545)',
	},
];

/** Une règle de feuille dont le CORPS DE TEXTE fonde le seuil accordé à un couple. */
type Regle = { fichier: string; selecteur: string };

/** Un couple de grand texte, avec les règles qui le rendent GRAND. Les deux sont
 *  inséparables : le seuil vient de la taille, donc la taille est vérifiée. */
type PaireGrandTexte = Paire & { regles: Regle[] };

/** Couples de TEXTE dont la conformité repose sur la TAILLE → 3:1 (WCAG 1.4.3,
 *  exception « grand texte » : au moins 18 pt, ou 14 pt en gras).
 *
 *  Troisième catégorie (#661), et la seule des trois qu'une PR peut casser SANS
 *  TOUCHER UNE COULEUR. `--on-accent` sur `--warn` plafonne à 4,24:1 dans les cinq
 *  thèmes clairs : au-dessus des 3:1 du grand texte, sous les 4,5:1 du texte courant.
 *  Le ranger dans PAIRES_TEXTE le ferait échouer ; le ranger dans PAIRES_NON_TEXTE
 *  (même seuil, mais au titre de 1.4.11) travestirait sa nature — ce sont des LETTRES,
 *  pas des objets graphiques, et ce qui les sauve est leur corps, pas leur rôle.
 *
 *  D'où la contrepartie, sans laquelle cette table serait une porte de sortie pour
 *  n'importe quel couple en échec : chaque entrée DÉSIGNE les règles qui rendent son
 *  texte grand, et ces règles sont éprouvées (§ « Le seuil grand texte est mérité, pas
 *  décrété »). Une entrée dont on ne peut pas montrer le plancher n'est pas un cas de
 *  grand texte : c'est une dérogation, qui a sa propre table et qui s'auto-périme. */
const PAIRES_GRAND_TEXTE: PaireGrandTexte[] = [
	{
		avant: '--on-accent',
		arriere: '--warn',
		ou: "jeu-motus.scss — l'état « lettre présente ailleurs dans le mot », dans la grille (.motus-case) et sur la touche correspondante du clavier-résumé (.motus-touche)",
		regles: [
			{ fichier: 'src/styles/jeu-motus.scss', selecteur: '.motus-case' },
			{ fichier: 'src/styles/jeu-motus.scss', selecteur: '.motus-touche' },
		],
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
	// RETIRÉES en corrigeant #600 et #438 : les quatre couples d'accent (accent sur
	// accent-soft, accent sur page-bg, accent sur paper en Lagon, on-accent sur accent
	// en Lagon) étaient la MÊME cause mesurée quatre fois — un accent trop clair. Les
	// cinq accents clairs ont été assombris d'un bloc, calés sur --accent-soft (la
	// surface la plus serrée) ; voir base.scss et themes.scss. Ces couples sont
	// désormais dans PAIRES_TEXTE, sans dérogation.
	// RETIRÉE en corrigeant #385 (`--accent-soft` sur `--paper` en bordure, 1,15 à
	// 1,26:1) : le couple lui-même a disparu, les cinq boutons de choix tirant leur
	// contour de repos de `--control-line`.
];

/* La table est VIDE, et c'est l'état visé — pas un oubli. Elle a porté sept entrées
   (#600 ×2, #438 ×2, #385, plus le chrono côté axe) ; toutes sont tombées avec leur
   correctif, comme le mécanisme l'exige. Une entrée ajoutée ici doit porter son couple,
   sa nature, ses thèmes, son issue et son motif — et le test correspondant, inversé,
   exigera qu'elle serve ENCORE. */

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
	...PAIRES_GRAND_TEXTE.map((p) => [p, 'grand-texte' as Nature, SEUIL_GRAND_TEXTE_AA] as const),
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

/** La comparaison que fait le gate, isolée pour être rejouée sur une palette MUTÉE
 *  (§ auto-contrôle) : sans ça, on saurait que la table est bien remplie, pas que le
 *  seuil est réellement opposé aux couleurs. */
function controlerCas(c: Cas, p: Record<string, string>): void {
	const r = contraste(p[c.avant], p[c.arriere]);
	expect(
		r,
		`Thème « ${c.theme} » : ${c.avant} (${p[c.avant]}) sur ${c.arriere} (${p[c.arriere]}) = ` +
			`${r.toFixed(2)}:1, sous les ${c.seuil}:1 exigés.\n` +
			`Où ce couple existe : ${c.ou}.\n` +
			`Rien ne « cassera » à l'écran — c'est ce qui rend ces défauts invisibles en ` +
			`relecture, et pourquoi ils sont tenus par un test plutôt que par un avis.`,
	).toBeGreaterThanOrEqual(c.seuil);
}

describe('Contraste des paires de tokens, tous thèmes (#582)', () => {
	it('la table couvre bien tous les thèmes et tous les tokens cités', () => {
		expect(THEMES_NOMS.length).toBeGreaterThanOrEqual(6);
		expect(CAS_PAIRES.length).toBe(
			(PAIRES_TEXTE.length + PAIRES_NON_TEXTE.length + PAIRES_GRAND_TEXTE.length) *
				THEMES_NOMS.length,
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

	it.each(CONFORMES)('$theme : $avant sur $arriere [$nature] ≥ $seuil:1', (c) => {
		controlerCas(c, PALETTES[c.theme]);
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
			...PAIRES_GRAND_TEXTE.map((p) => `${p.avant} sur ${p.arriere} [grand-texte]`),
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
   La palette d'IMPRESSION doit refléter la palette claire (#601)
   ============================================================ */

const PRINT = readFileSync('src/styles/print.scss', 'utf8');

/** Tokens forcés dans `@media print { :root { … !important } }`. */
const PALETTE_IMPRESSION = (() => {
	const m = PRINT.match(/@media print \{[\s\S]*?:root \{([\s\S]*?)\n\t\}/);
	return m ? tokens(m[1]) : {};
})();

/** Tokens que l'impression diverge VOLONTAIREMENT, avec la raison. */
const DIVERGENCES_ASSUMEES: Record<string, string> = {
	'--page-bg':
		"le papier est blanc : imprimer le fond de page teinté gâcherait de l'encre pour un aplat que personne ne veut.",
};

describe("Palette d'impression, miroir de la palette claire (#601)", () => {
	/* Pourquoi ce test existe : cette liste est une COPIE À LA MAIN de la palette claire,
	   écrite pour rétablir les couleurs d'écran clair quel que soit le thème d'affichage
	   (le Nuit rendrait un corrigé illisible sur papier). Une copie ne suit pas sa source.
	   Constaté en corrigeant #601 : elle forçait encore `--muted: #9aa1ac`, la valeur
	   d'AVANT #576 — celle qui plafonnait à 2,6:1. Le token avait été corrigé à la source
	   huit mois plus tard, sa copie non, et rien ne pouvait le voir : le gate de contraste
	   ne lisait que base.scss et themes.scss. Le papier n'est pas moins exigeant que
	   l'écran ; c'est même là que le parent lit le corrigé. */
	it("la liste d'impression est bien lue (garde contre un test à vide)", () => {
		expect(
			Object.keys(PALETTE_IMPRESSION).length,
			'aucun token forcé trouvé dans le bloc @media print : sa forme a changé, ce test ne garde plus rien.',
		).toBeGreaterThanOrEqual(10);
	});

	it.each(Object.entries(PALETTE_IMPRESSION))('%s vaut la valeur claire', (nom, valeur) => {
		const assumee = DIVERGENCES_ASSUMEES[nom];
		if (assumee) {
			expect(
				valeur === RACINE[nom],
				`${nom} est déclaré comme divergeant volontairement (${assumee}), mais il vaut ` +
					`maintenant la même chose qu'à l'écran : retirer l'entrée de DIVERGENCES_ASSUMEES.`,
			).toBe(false);
			return;
		}
		expect(
			valeur,
			`print.scss force ${nom} = ${valeur}, alors que base.scss vaut ${RACINE[nom]}.\n` +
				`Cette liste rétablit la palette CLAIRE sur papier : elle doit suivre la source. Une ` +
				`valeur figée ici survit à la correction du token, sans que rien ne le signale — c'est ` +
				`exactement ce qui est arrivé à --muted entre #576 et #601.\n` +
				`Si la divergence est voulue, l'écrire dans DIVERGENCES_ASSUMEES avec sa raison.`,
		).toBe(RACINE[nom]);
	});
});

/* ============================================================
   Les arêtes de PROFONDEUR des solides, diluées par leur opacité (#387)
   ============================================================ */

describe('Arêtes de profondeur des solides en perspective (#387)', () => {
	/* Troisième variante du même piège que `.trophy.off` (#576) et la pastille du chrono
	   (#609) : une couleur qu'aucune feuille n'écrit. Ici c'est un trait `--accent` posé
	   à opacité réduite sur le fond de la figure — le navigateur le dilue vers ce fond, et
	   ce que l'œil reçoit n'est ni `--accent` ni `--paper`. À 0,55, l'opacité d'origine, ça
	   donnait 2,30 à 3,11:1 selon le thème : les six échouaient le seuil de 3:1.
	   Seuil NON-TEXTE, pas texte : ce sont des objets graphiques, mais bien PORTEURS
	   d'information (sans arêtes de fuite un cube est un carré, sans équateur une sphère
	   est un disque, et l'exercice demande justement de reconnaître le solide) — donc pas
	   de l'ornement exempté par 1.4.11.
	   Le test relit l'opacité DANS le module plutôt que de figer un nombre : la rebaisser
	   le fait échouer. Il mesure les DEUX fonds sur lesquels une figure peut atterrir,
	   `--paper` (la carte, cas courant) et `--page-bg` (le plus serré des deux). */
	it("l'opacité de DEPTH est bien lue (garde contre un test à vide)", () => {
		expect(
			OPACITE_DEPTH,
			'constante DEPTH introuvable dans src/core/figures/solides.ts, ou son `opacity` a ' +
				'changé de forme : ce test ne garde plus rien.',
		).toBeGreaterThan(0);
	});

	it.each(Object.entries(PALETTES))('%s : arête lisible sur le fond de figure', (theme, p) => {
		for (const fond of ['--paper', '--page-bg']) {
			const compose = melange(p['--accent'], p[fond], OPACITE_DEPTH);
			const r = contraste(compose, p[fond]);
			expect(
				r,
				`Thème « ${theme} » : à opacity ${OPACITE_DEPTH}, une arête de profondeur ` +
					`(--accent ${p['--accent']}) se compose en ${compose} sur ${fond} (${p[fond]}), ` +
					`soit ${r.toFixed(2)}:1 — sous les ${SEUIL_NON_TEXTE_AA}:1 exigés pour un objet ` +
					`graphique porteur d'information (WCAG 1.4.11).\n` +
					`Remonter l'opacité, pas la couleur : l'opacité rediluerait tout token qu'on ` +
					`mettrait dessous. La distinction avec la face avant ne tient pas à la pâleur ` +
					`seule — celle-ci garde son remplissage et un trait plus épais.`,
			).toBeGreaterThanOrEqual(SEUIL_NON_TEXTE_AA);
		}
	});

	it('aucune figure ne recopie DEPTH à la main', () => {
		// C'est par là que le défaut s'était aggravé : l'équateur de la boule dupliquait
		// DEPTH avec une opacité de 0,5 au lieu de 0,55, donc échouait un cran plus bas,
		// et le corriger dans la constante ne l'aurait pas touché. Une seule source.
		const autres = [...SOLIDES.matchAll(/opacity:\s*([\d.]+)/g)].map((m) => m[1]);
		expect(
			autres,
			`src/core/figures/solides.ts déclare ${autres.length} opacités (${autres.join(', ')}) ` +
				`alors que seule celle de DEPTH doit exister.\nUne arête atténuée écrite à la main ` +
				`échappe à la constante ET au test ci-dessus : passer par DEPTH.`,
		).toHaveLength(1);
	});
});

/* ============================================================
   Les RECOPIES de `--accent` hors des feuilles de thème (#600)
   ============================================================ */

/** Un endroit du dépôt qui réécrit à la main une couleur d'accent. `theme` sert à
 *  retrouver la palette de référence, `role` à dire ce que la copie casse si elle ment. */
type Recopie = { fichier: string; motif: RegExp; theme: string; role: string };

/* Ce qui rend ces copies dangereuses, et différentes des tokens : elles restent
   PARFAITEMENT LISIBLES quand elles mentent. Une pastille d'aperçu qui affiche l'ancien
   vert ne déclenche aucun gate de contraste — elle annonce simplement une couleur que le
   thème ne rend plus, et personne ne s'en aperçoit avant des mois. Même classe de défaut
   que la palette d'impression de #601 (une copie à la main qui avait cessé de suivre sa
   source) ; #600 en a trouvé six familles d'un coup en déplaçant les accents. */
const RECOPIES: Recopie[] = [
	{
		fichier: 'src/styles/themes.scss',
		motif: /\.theme-defaut \.theme-dot \{\s*background: (#[0-9a-fA-F]{6})/,
		theme: 'defaut',
		role: "pastille d'aperçu du sélecteur de thèmes",
	},
	{
		fichier: 'src/styles/themes.scss',
		motif: /\.theme-ciel \.theme-dot \{\s*background: (#[0-9a-fA-F]{6})/,
		theme: 'ciel',
		role: "pastille d'aperçu du sélecteur de thèmes",
	},
	{
		fichier: 'src/styles/themes.scss',
		motif: /\.theme-automne \.theme-dot \{\s*background: (#[0-9a-fA-F]{6})/,
		theme: 'automne',
		role: "pastille d'aperçu du sélecteur de thèmes",
	},
	{
		fichier: 'src/styles/themes.scss',
		motif: /\.theme-lagon \.theme-dot \{\s*background: (#[0-9a-fA-F]{6})/,
		theme: 'lagon',
		role: "pastille d'aperçu du sélecteur de thèmes",
	},
	{
		fichier: 'src/styles/themes.scss',
		motif: /\.theme-fruit-rouge \.theme-dot \{\s*background: (#[0-9a-fA-F]{6})/,
		theme: 'fruit-rouge',
		role: "pastille d'aperçu du sélecteur de thèmes",
	},
	// La barre d'outils porte `--accent` : `theme-color` teinte le chrome du navigateur
	// juste au-dessus d'elle. Une valeur périmée s'y voit comme une COUTURE entre les deux.
	{
		fichier: 'app.html',
		motif: /<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/,
		theme: 'defaut',
		role: 'couleur du chrome du navigateur',
	},
	{
		fichier: 'index.html',
		motif: /<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/,
		theme: 'defaut',
		role: 'couleur du chrome du navigateur',
	},
	{
		fichier: 'guide.html',
		motif: /<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/,
		theme: 'defaut',
		role: 'couleur du chrome du navigateur',
	},
	{
		fichier: 'vite.config.ts',
		motif: /theme_color: '(#[0-9a-fA-F]{6})'/,
		theme: 'defaut',
		role: 'manifeste PWA (écran de démarrage, application installée)',
	},
	// Les deux générateurs tournent HORS du bundle (node + navigateur headless) : ils ne
	// peuvent pas lire une variable CSS, d'où la copie. Seul le PREMIER stop du dégradé est
	// `--accent` ; le second est un vert choisi à la main, non tenu ici (dit sur place).
	{
		fichier: 'tools/pwa-icons/generate.mjs',
		motif: /linear-gradient\(160deg,(#[0-9a-fA-F]{6}) 0%/,
		theme: 'defaut',
		role: "icônes de l'application installée",
	},
	{
		fichier: 'tools/og-image/generate.mjs',
		motif: /linear-gradient\(160deg,(#[0-9a-fA-F]{6}) 0%/,
		theme: 'defaut',
		role: 'bannière de partage (og:image)',
	},
];

describe('Les recopies de --accent suivent leur source (#600)', () => {
	it.each(RECOPIES)('$fichier — $role ($theme)', ({ fichier, motif, theme, role }) => {
		const m = readFileSync(fichier, 'utf8').match(motif);
		expect(
			m,
			`Rien ne correspond à ${motif} dans ${fichier} : la déclaration a changé de forme, ` +
				`ce test ne garde plus rien. Corriger le motif plutôt que retirer l'entrée.`,
		).toBeTruthy();
		const attendu = PALETTES[theme]['--accent'];
		expect(
			m![1].toLowerCase(),
			`${fichier} écrit ${m![1]} pour « ${role} », alors que --accent du thème ` +
				`« ${theme} » vaut ${attendu}.\n` +
				`Cette valeur est une COPIE À LA MAIN du token : elle ne suit pas sa source, et ` +
				`rien d'autre ne peut le voir — une couleur périmée reste parfaitement lisible, ` +
				`elle annonce juste une couleur que l'application ne rend plus.\n` +
				`Pour les deux générateurs d'images, corriger le littéral ne suffit pas : il faut ` +
				`aussi RÉGÉNÉRER les PNG (npm run pwa:icons, npm run og:gen).`,
		).toBe(attendu);
	});

	it('la liste couvre bien les familles de recopie connues', () => {
		// Garde contre un test qui se viderait : si quelqu'un retire des entrées au lieu de
		// corriger les copies, l'échec doit venir d'ici plutôt que d'un silence.
		expect(RECOPIES.length).toBeGreaterThanOrEqual(11);
		expect(new Set(RECOPIES.map((r) => r.fichier)).size).toBeGreaterThanOrEqual(6);
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

/* ============================================================
   Le seuil « grand texte » est MÉRITÉ, pas décrété (#661)
   ============================================================ */

/* WCAG 2.1 n'exprime pas le « grand texte » en pixels mais en POINTS : le glossaire le
   définit par « au moins 18 points, ou 14 points en gras ». La bascule en px se DÉDUIT
   des unités absolues CSS — 1 in = 96 px et 1 in = 72 pt, donc 1 pt = 96/72 px — au
   lieu d'être recopiée d'un mémo. Même raison que la formule de contraste dans son
   module partagé : un nombre recopié ne dit pas d'où il vient, donc personne ne le
   rectifie. La déduction donne 18,66 px pour le gras et 24 px sinon. */
const PX_PAR_PT = 96 / 72;
const GRAND_TEXTE_GRAS_PX = 14 * PX_PAR_PT;
const GRAND_TEXTE_NORMAL_PX = 18 * PX_PAR_PT;
/** WCAG dit « gras » sans donner de chiffre ; en CSS, `font-weight: bold` vaut 700. */
const POIDS_GRAS = 700;
/** Poids d'un texte dont aucune règle ne déclare le poids (valeur initiale CSS). */
const POIDS_NORMAL = 400;

/* 1 rem = la taille de police de la RACINE, et c'est là qu'un gate naïf se trompe :
   supposer 16 px, c'est supposer que personne ne fixera jamais `html { font-size }`.
   Aucune feuille ne la fixe aujourd'hui (tenu par un test ci-dessous), donc elle vaut
   le défaut de l'agent utilisateur — 16 px sur tous les navigateurs courants. Le seul
   réglage du dépôt qui y touche, `html.confort-lecture`, la fait MONTER de 15 % :
   16 px est donc le PLANCHER de conversion, et non une moyenne. */
const RACINE_PX = 16;

type Feuille = { fichier: string; css: string };

/** Toutes les feuilles du dépôt, lues une fois. Passées en PARAMÈTRE aux contrôles
 *  plutôt que relues dedans : c'est ce qui permet de les rejouer sur une copie mutée
 *  en mémoire (§ auto-contrôle) sans écrire un octet sur le disque. */
const FEUILLES: Feuille[] = readdirSync('src/styles')
	.filter((f) => f.endsWith('.scss'))
	.map((f) => ({ fichier: `src/styles/${f}`, css: readFileSync(`src/styles/${f}`, 'utf8') }));

const feuille = (fichier: string): Feuille =>
	FEUILLES.find((f) => f.fichier === fichier) ?? { fichier, css: '' };

function echappeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type DeclPolice = { selecteur: string; taille: string; poids: number | null };

/** Toutes les déclarations `font-size` d'une feuille, avec le sélecteur qui les porte
 *  et le poids déclaré dans le même bloc. On remonte de la déclaration vers son
 *  accolade ouvrante plutôt que de découper la feuille en blocs : ça survit à
 *  l'imbrication SCSS, aux media queries et aux listes de sélecteurs sur plusieurs
 *  lignes — trois formes présentes dans ces feuilles, et trois façons pour un
 *  découpage naïf de rater une règle EN SILENCE, le pire des deux échecs. */
function declarationsPolice(css: string): DeclPolice[] {
	const out: DeclPolice[] = [];
	for (const m of css.matchAll(/font-size:\s*([^;}]+)/g)) {
		if (m.index === undefined) continue;
		const ouvre = css.lastIndexOf('{', m.index);
		if (ouvre < 0) continue;
		const avant = css.slice(0, ouvre);
		const apres = (s: string): number => {
			const i = avant.lastIndexOf(s);
			return i < 0 ? 0 : i + s.length;
		};
		const debut = Math.max(apres('}'), apres('{'), apres(';'), apres('*/'));
		const bloc = css.slice(ouvre + 1, css.indexOf('}', ouvre));
		const poids = bloc.match(/font-weight:\s*(\d+)/);
		out.push({
			selecteur: avant.slice(debut).trim().replace(/\s+/g, ' '),
			taille: m[1].trim(),
			poids: poids ? Number(poids[1]) : null,
		});
	}
	return out;
}

/** Le plus PETIT corps que cette valeur puisse rendre, en px. Un `clamp(a, b, c)` rend
 *  au moins `a` par définition : c'est `a` qui compte, pas la valeur préférée. `null`
 *  si l'unité ne se résout pas hors du navigateur (`em` et `%` dépendent du parent) —
 *  mieux vaut un test qui échoue en le disant qu'un test qui devine. */
function plancherPx(valeur: string): number | null {
	const clamp = valeur.match(/^clamp\(\s*([^,]+),/);
	const m = (clamp ? clamp[1] : valeur).trim().match(/^([\d.]+)(rem|px)$/);
	return m ? Number(m[1]) * (m[2] === 'rem' ? RACINE_PX : 1) : null;
}

/** La règle WCAG 1.4.3 elle-même : ce corps relève-t-il du « grand texte » ? */
function estGrandTexte(px: number, poids: number): boolean {
	return px >= (poids >= POIDS_GRAS ? GRAND_TEXTE_GRAS_PX : GRAND_TEXTE_NORMAL_PX);
}

/** La liste de sélecteurs `liste` porte-t-elle l'élément `cible` ? Couvre la règle de
 *  base, ses variantes d'état et ses formes en descendance — `.motus-case`,
 *  `.motus-case[data-etat='x']`, `html.anim-reduced .motus-touche` — sans confondre
 *  avec un voisin dont le nom commencerait pareil. */
function porte(liste: string, cible: string): boolean {
	const motif = new RegExp(`${echappeRegex(cible)}(?![\\w-])`);
	return liste.split(',').some((s) => motif.test(s));
}

/** Un sélecteur qui vise la RACINE (`html`, `html.x`, `:root`, `:root[data-theme=x]`)
 *  et non un descendant : c'est lui, et lui seul, qui définit la valeur du rem. */
function viseRacine(liste: string): boolean {
	return liste.split(',').some((s) => /^(html|:root)[\w.:[\]='"()-]*$/.test(s.trim()));
}

/** Contrôle qu'une règle citée par PAIRES_GRAND_TEXTE mérite son seuil : TOUTES les
 *  déclarations de corps qui la visent — la règle de base comme ses variantes d'état —
 *  restent au-dessus de la bascule WCAG. Ne pas se limiter à la règle de base est
 *  l'essentiel : une variante d'état qui rétrécirait son texte serait invisible. */
function controlerGrandTexte(css: string, regle: Regle): void {
	const toutes = declarationsPolice(css);
	const base = toutes.find((d) => d.selecteur === regle.selecteur);
	const visees = toutes.filter((d) => porte(d.selecteur, regle.selecteur));
	expect(
		visees.length,
		`Aucune déclaration \`font-size\` ne vise \`${regle.selecteur}\` dans ${regle.fichier} : ` +
			`le sélecteur a été renommé, ou sa règle a disparu, et ce gate ne garde plus rien.\n` +
			`Corriger la table PAIRES_GRAND_TEXTE plutôt que la vider : sans plancher de taille, ` +
			`le couple qu'elle couvre repasse au seuil du texte courant, qu'il n'atteint pas.`,
	).toBeGreaterThan(0);
	for (const d of visees) {
		const px = plancherPx(d.taille);
		expect(
			px,
			`${regle.fichier} — \`${d.selecteur}\` déclare \`font-size: ${d.taille}\`, que ce test ` +
				`ne sait pas convertir en px hors du navigateur (\`em\` et \`%\` dépendent du parent).\n` +
				`Exprimer le plancher en rem ou en px, ou étendre plancherPx().`,
		).not.toBeNull();
		if (px === null) return;
		const poids = d.poids ?? base?.poids ?? POIDS_NORMAL;
		expect(
			estGrandTexte(px, poids),
			`${regle.fichier} — \`${d.selecteur}\` peut rendre son texte à ${px.toFixed(1)} px ` +
				`(poids ${poids}), sous la bascule « grand texte » de WCAG 1.4.3 ` +
				`(${GRAND_TEXTE_GRAS_PX.toFixed(2)} px en gras, ${GRAND_TEXTE_NORMAL_PX} px sinon).\n` +
				`Ce n'est pas un réglage de confort : c'est CE PLANCHER qui rend conforme le texte ` +
				`posé sur \`--warn\`, qui n'atteint pas les ${SEUIL_TEXTE_AA}:1 du texte courant. Le ` +
				`resserrer pour gagner de la place casse l'accessibilité sans toucher une seule ` +
				`couleur — et sans que rien d'autre ne le signale.`,
		).toBe(true);
	}
}

/** Contrôle que rien ne fait DESCENDRE la taille de la racine : c'est l'hypothèse dont
 *  dépend toute conversion rem → px ci-dessus. Une racine à 87,5 % (le vieux réflexe
 *  « 1 rem = 14 px ») ferait passer les touches du Motus de 20 à 17,5 px, donc sous la
 *  bascule, sans qu'une seule règle de la feuille du jeu ait bougé. */
function controlerRacine(feuilles: Feuille[]): void {
	const decls = feuilles.flatMap((f) =>
		declarationsPolice(f.css)
			.filter((d) => viseRacine(d.selecteur))
			.map((d) => ({ ...d, fichier: f.fichier })),
	);
	expect(
		decls.length,
		'aucune déclaration de corps sur la racine trouvée dans src/styles : le réglage ' +
			'« confort de lecture » a changé de forme, et ce contrôle ne garde plus rien.',
	).toBeGreaterThan(0);
	for (const d of decls) {
		const pct = d.taille.match(/^([\d.]+)%$/);
		expect(
			pct,
			`${d.fichier} — \`${d.selecteur}\` fixe \`font-size: ${d.taille}\` sur la racine. Ce ` +
				`gate ne sait comparer que des pourcentages, parce que c'est la seule forme qui ` +
				`RESPECTE la taille de police choisie par l'utilisateur dans son navigateur.\n` +
				`Une valeur absolue l'écrase, et invalide au passage la conversion rem → px de ce ` +
				`fichier (RACINE_PX).`,
		).toBeTruthy();
		if (!pct) return;
		expect(
			Number(pct[1]),
			`${d.fichier} — \`${d.selecteur}\` descend la racine à ${d.taille}, donc 1 rem sous ` +
				`${RACINE_PX} px. Tous les planchers exprimés en rem rétrécissent d'autant, dont ceux ` +
				`qui tiennent la conformité du Motus (§ ci-dessus) — sans qu'aucune de ces règles ` +
				`n'ait changé.`,
		).toBeGreaterThanOrEqual(100);
	}
}

/** Les règles citées par la table, dédoublonnées. */
const REGLES_GRAND_TEXTE: Regle[] = [
	...new Map(
		PAIRES_GRAND_TEXTE.flatMap((p) => p.regles).map((r) => [`${r.fichier} ${r.selecteur}`, r]),
	).values(),
];

describe('Le seuil « grand texte » est mérité, pas décrété (#661)', () => {
	it('la bascule WCAG est déduite des points, pas recopiée', () => {
		expect(GRAND_TEXTE_GRAS_PX).toBeCloseTo(18.67, 2);
		expect(GRAND_TEXTE_NORMAL_PX).toBe(24);
		// Les quatre cas qui comptent, dont celui du Motus : 20 px ne qualifie QUE gras.
		expect(estGrandTexte(20, 800)).toBe(true);
		expect(estGrandTexte(20, POIDS_NORMAL)).toBe(false);
		expect(estGrandTexte(18, 800)).toBe(false);
		expect(estGrandTexte(24, POIDS_NORMAL)).toBe(true);
	});

	it('la conversion rem → px repose sur une racine qui ne descend jamais', () => {
		controlerRacine(FEUILLES);
	});

	it('plancherPx prend le plancher d’un clamp, et refuse ce qu’il ne sait pas convertir', () => {
		expect(plancherPx('1.25rem')).toBe(20);
		expect(plancherPx('clamp(1.5rem, 6vw, 2rem)')).toBe(24);
		expect(plancherPx('30px')).toBe(30);
		// Une valeur relative au parent ne se résout pas ici : `null`, donc échec bruyant
		// côté contrôle, plutôt qu'un plancher inventé qui passerait tout seul.
		expect(plancherPx('1.05em')).toBeNull();
		expect(plancherPx('115%')).toBeNull();
	});

	it.each(REGLES_GRAND_TEXTE)('$fichier — $selecteur reste du grand texte', (regle) => {
		controlerGrandTexte(feuille(regle.fichier).css, regle);
	});

	it('chaque couple au régime « grand texte » en a encore besoin', () => {
		/* Le régime n'est pas gratuit : il impose au rendu des PLANCHERS DE TAILLE (ci-dessus).
		   Le jour où le couple atteindra 4,5:1 sur les six thèmes, ces planchers ne tiendront
		   plus rien, et la prochaine PR qui voudra resserrer les touches lira une justification
		   devenue fausse. Même mécanique que DEROGATIONS : l'entrée s'auto-périme. */
		for (const p of PAIRES_GRAND_TEXTE) {
			const pire = Math.min(
				...THEMES_NOMS.map((t) => contraste(PALETTES[t][p.avant], PALETTES[t][p.arriere])),
			);
			expect(
				pire,
				`${p.avant} sur ${p.arriere} atteint maintenant ${pire.toFixed(2)}:1 sur les six ` +
					`thèmes, donc les ${SEUIL_TEXTE_AA}:1 du texte courant — bonne nouvelle, mais le ` +
					`régime « grand texte » est devenu inutile pour ce couple.\n` +
					`Le DÉPLACER dans PAIRES_TEXTE : il y sera gardé plus strictement, et les planchers ` +
					`de taille qu'il justifie (${p.regles.map((r) => r.selecteur).join(', ')}) ` +
					`redeviendront un choix de rendu, libre de bouger.`,
			).toBeLessThan(SEUIL_TEXTE_AA);
		}
	});
});

/* ============================================================
   La palette EN DUR du plateau 2048 (#661)
   ============================================================ */

/* Jusqu'ici ce fichier ne lisait que base.scss et themes.scss : les couleurs du plateau
   du 2048 n'y étaient donc pas. Elles sont écrites en littéraux, et c'est délibéré —
   une aire de jeu doit garder la MÊME rampe sur les six thèmes, sinon la progression
   2 → 4 → 8 change de sens d'un thème à l'autre. Leurs ratios avaient été mesurés à la
   main et consignés dans l'en-tête de la feuille.

   Un constat juste, écrit une fois, sans test, ne tient rien : c'est mot pour mot
   l'histoire de `--muted` (#576), dont le défaut était écrit dans TROIS feuilles
   pendant qu'il survivait dans le token. Ce gate relit donc les hex DANS la feuille et
   RECALCULE les trois seuils, pour que retoucher une teinte de la rampe fasse échouer
   `npm test` au lieu de périmer un commentaire.

   Ce qui n'est pas ici, faute d'être un seuil : l'écart entre deux tuiles VOISINES
   (1,15:1 au plus serré). Il est assumé sur la feuille, et à raison — ce qui distingue
   une tuile d'une autre est le NOMBRE écrit dessus, pas sa teinte. */

const JEU_2048 = feuille('src/styles/jeu-2048.scss').css;

/** Une règle de tuile : son sélecteur, son fond, et le palier qu'elle habille — `null`
 *  pour la règle générique, celle qui prend le relais AU-DELÀ de 2048. */
type Tuile = { selecteur: string; fond: string; palier: number | null };

type Palette2048 = {
	cadre: string | null;
	vide: string | null;
	chiffre: string | null;
	tuiles: Tuile[];
};

/** Première déclaration hexadécimale de `propriete` dans le bloc dont le sélecteur est
 *  EXACTEMENT `sel`. `null` si le sélecteur a disparu : les contrôles le disent alors,
 *  au lieu de mesurer du vide. */
function couleur(css: string, sel: string, propriete: string): string | null {
	const bloc = new RegExp(`(?:^|\\n)${echappeRegex(sel)}\\s*\\{([^}]*)\\}`).exec(css);
	if (!bloc) return null;
	const m = bloc[1].match(new RegExp(`${propriete}:\\s*(#[0-9a-fA-F]{6})`));
	return m ? m[1].toLowerCase() : null;
}

/** Toute la palette du plateau, lue dans la feuille. Prend `css` en paramètre pour être
 *  rejouable sur une copie mutée (§ auto-contrôle). */
function palette2048(css: string): Palette2048 {
	const tuiles: Tuile[] = [];
	for (const m of css.matchAll(/\.g2048-case([^{]*)\{([^}]*)\}/g)) {
		if (!m[1].includes('data-valeur')) continue;
		const fond = m[2].match(/background:\s*(#[0-9a-fA-F]{6})/);
		if (!fond) continue;
		// La règle générique porte son `data-valeur` DANS un `:not()` — c'est une exclusion,
		// pas un palier. La confondre avec un palier « 0 » ferait mesurer la case vide deux
		// fois et manquer les valeurs au-delà de 2048, qui sont justement ce qu'elle habille.
		const palier = m[1].includes(':not(') ? null : m[1].match(/data-valeur='(\d+)'/);
		tuiles.push({
			selecteur: `.g2048-case${m[1].trim()}`,
			fond: fond[1].toLowerCase(),
			palier: palier ? Number(palier[1]) : null,
		});
	}
	return {
		cadre: couleur(css, '.g2048-grille', 'background'),
		vide: couleur(css, '.g2048-case', 'background'),
		chiffre: couleur(css, '.g2048-case', 'color'),
		tuiles,
	};
}

/** Exige un hexadécimal lu dans la feuille, en nommant le rôle : un sélecteur renommé
 *  doit dire LEQUEL, sinon le gate échoue sans dire quoi corriger. */
function hex(valeur: string | null, role: string, ou: string): string {
	expect(
		valeur,
		`${role} est introuvable dans jeu-2048.scss (attendu dans ${ou}) : le sélecteur ou la ` +
			`propriété a changé de nom, et ce gate mesurerait du vide.`,
	).not.toBeNull();
	if (valeur === null) throw new Error(role);
	expect(valeur, `${role} : « ${valeur} » n'est pas un hexadécimal à six chiffres.`).toMatch(
		/^#[0-9a-f]{6}$/,
	);
	return valeur;
}

/* --- Les trois seuils, un par contrôle, chacun rejouable sur une feuille mutée --- */

function controlerLecture2048(p: Palette2048): void {
	hex(p.cadre, 'le cadre du plateau', '.g2048-grille { background }');
	hex(p.vide, "le fond d'une case vide", '.g2048-case { background }');
	hex(p.chiffre, 'la couleur du chiffre', '.g2048-case { color }');
	/* Les paliers du jeu sont les puissances de deux jusqu'à la tuile qui lui donne son
	   nom : ça vient de la RÈGLE DU 2048, pas d'une lecture de la feuille. C'est pour ça
	   que le contrôle exige la liste et non « au moins n fonds trouvés » — un sélecteur
	   renommé ou un palier perdu viderait le gate sans que rien ne rougisse. */
	const paliers = p.tuiles
		.flatMap((t) => (t.palier === null ? [] : [t.palier]))
		.sort((a, b) => a - b);
	expect(
		paliers,
		`Les fonds de tuile lus dans jeu-2048.scss ne couvrent plus les onze paliers du jeu.\n` +
			`Trouvés : ${paliers.join(', ') || '(aucun)'}.\n` +
			`Un sélecteur renommé vide ce gate EN SILENCE : corriger la lecture (palette2048) ` +
			`plutôt que la liste attendue, qui est la règle du jeu.`,
	).toEqual([2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]);
	expect(
		p.tuiles.filter((t) => t.palier === null),
		`La règle générique (\`.g2048-case:not([data-valeur='0'])\`) n'a pas été trouvée, ou ` +
			`elle est en double. C'est elle qui habille les valeurs AU-DELÀ de 2048 — celles ` +
			`qu'un enfant finit par atteindre, et qui repasseraient en « case vide » sans elle.`,
	).toHaveLength(1);
}

function verifieChiffreSurTuile(chiffre: string, t: Tuile): void {
	const r = contraste(chiffre, t.fond);
	expect(
		r,
		`Le chiffre (${chiffre}) sur la tuile \`${t.selecteur}\` (${t.fond}) fait ` +
			`${r.toFixed(2)}:1, sous les ${SEUIL_TEXTE_AA}:1 exigés pour du texte courant ` +
			`(WCAG 1.4.3).\n` +
			`Seuil du texte COURANT et non du grand texte : le corps du chiffre descend à 16 px ` +
			`pour un nombre à cinq chiffres (\`.g2048-case[data-chiffres='5']\`), donc sous la ` +
			`bascule de ${GRAND_TEXTE_GRAS_PX.toFixed(2)} px.\n` +
			`Toute la rampe est CLAIRE à chiffre sombre, et c'est ce qui la tient : la rampe ` +
			`classique du 2048 fonce jusqu'au rouge en écrivant en blanc dessus, ce qui fait ` +
			`tomber ses tuiles moyennes autour de 2:1. Faire porter la progression par la ` +
			`TEINTE, pas par l'assombrissement.`,
	).toBeGreaterThanOrEqual(SEUIL_TEXTE_AA);
}

function verifieTuileSurCadre(cadre: string, t: Tuile): void {
	const r = contraste(t.fond, cadre);
	expect(
		r,
		`La tuile \`${t.selecteur}\` (${t.fond}) sur le cadre (${cadre}) fait ${r.toFixed(2)}:1, ` +
			`sous les ${SEUIL_NON_TEXTE_AA}:1 exigés pour un objet graphique porteur ` +
			`d'information (WCAG 1.4.11).\n` +
			`Le cadre est ce qui DÉCOUPE la grille : sans cet écart, les cases cessent de se lire ` +
			`comme des cases et le plateau devient un aplat. Ce n'est pas un filet décoratif, ` +
			`donc pas un cas exempté.`,
	).toBeGreaterThanOrEqual(SEUIL_NON_TEXTE_AA);
}

function controlerChiffres2048(p: Palette2048): void {
	const chiffre = hex(p.chiffre, 'la couleur du chiffre', '.g2048-case { color }');
	for (const t of p.tuiles) verifieChiffreSurTuile(chiffre, t);
}

function controlerTuilesSurCadre2048(p: Palette2048): void {
	const cadre = hex(p.cadre, 'le cadre du plateau', '.g2048-grille { background }');
	for (const t of p.tuiles) verifieTuileSurCadre(cadre, t);
}

function controlerVideSurCadre2048(p: Palette2048): void {
	const cadre = hex(p.cadre, 'le cadre du plateau', '.g2048-grille { background }');
	const vide = hex(p.vide, "le fond d'une case vide", '.g2048-case { background }');
	const r = contraste(vide, cadre);
	expect(
		r,
		`La case VIDE (${vide}) sur le cadre (${cadre}) fait ${r.toFixed(2)}:1, sous les ` +
			`${SEUIL_NON_TEXTE_AA}:1 exigés (WCAG 1.4.11).\n` +
			`« Cette case est libre » est une information de JEU — c'est ce que l'enfant lit pour ` +
			`choisir son coup — et non une décoration exemptée.\n` +
			`La marge est mince par construction : le cadre et la case vide sont deux beiges ` +
			`voisins. Retoucher l'un des deux, c'est retoucher ce seuil.`,
	).toBeGreaterThanOrEqual(SEUIL_NON_TEXTE_AA);
}

const PALETTE_2048 = palette2048(JEU_2048);

describe('Palette en dur du plateau 2048 (#661)', () => {
	it('la rampe est bien lue (garde contre un gate qui se vide)', () => {
		controlerLecture2048(PALETTE_2048);
	});

	it.each(PALETTE_2048.tuiles)('le chiffre reste lisible sur $selecteur', (t) => {
		verifieChiffreSurTuile(hex(PALETTE_2048.chiffre, 'le chiffre', '.g2048-case { color }'), t);
	});

	it.each(PALETTE_2048.tuiles)('$selecteur se détache du cadre', (t) => {
		verifieTuileSurCadre(hex(PALETTE_2048.cadre, 'le cadre', '.g2048-grille { background }'), t);
	});

	it('une case vide se distingue du cadre', () => {
		controlerVideSurCadre2048(PALETTE_2048);
	});
});

/* ============================================================
   Auto-contrôle : ces deux gates savent-ils rougir ? (#661)
   ============================================================ */

/* Un gate vert le jour où on l'écrit ne prouve rien tant qu'on ne l'a pas vu dire NON.
   On rejoue donc les CONTRÔLES EUX-MÊMES sur des feuilles MUTÉES en mémoire — aucun
   fichier n'est écrit — en reproduisant les défauts qu'ils sont censés attraper. Chaque
   cas doit LEVER. Sans cette section, un contrôle qui ne trouve plus rien à mesurer
   (sélecteur renommé, motif périmé) passerait pour un contrôle satisfait, ce qui est la
   façon la plus courante dont un gate meurt. */

describe('auto-contrôle : le gate du plateau 2048 sait rougir', () => {
	/** Une copie de la feuille avec UNE mutation. Vérifie au passage que la mutation
	 *  s'applique encore : une chaîne cherchée qui a disparu rendrait l'auto-contrôle
	 *  vide, donc rassurant à tort.
	 *
	 *  Les mutations visent `background: #xxxxxx` et non le seul hexadécimal : l'en-tête de
	 *  la feuille CITE deux de ces valeurs en prose, et une mutation par hex seul frappait
	 *  le commentaire — laissant la déclaration intacte et l'auto-contrôle satisfait. */
	const mute = (cherche: string | RegExp, remplace: string): Palette2048 => {
		const css = JEU_2048.replace(cherche, remplace);
		expect(
			css,
			`la mutation « ${String(cherche)} » ne s'applique plus à jeu-2048.scss : cet ` +
				`auto-contrôle ne prouve plus rien tant qu'on ne l'a pas recalé.`,
		).not.toBe(JEU_2048);
		return palette2048(css);
	};

	it('rougit si la rampe se met à foncer (le défaut classique du 2048)', () => {
		expect(() =>
			controlerChiffres2048(mute('background: #f0e6d8', 'background: #6b5f4e')),
		).toThrow();
	});

	it('rougit si une tuile se rapproche du cadre', () => {
		// Gris choisi pour ne casser QUE ce seuil : le chiffre y reste à 6,66:1, donc
		// l'échec ne peut venir que du contrôle éprouvé ici.
		expect(() =>
			controlerTuilesSurCadre2048(mute('background: #ff9b9b', 'background: #a0a0a0')),
		).toThrow();
	});

	it('rougit si la case vide se noie dans le cadre', () => {
		expect(() =>
			controlerVideSurCadre2048(mute('background: #b3a99b', 'background: #9a8f80')),
		).toThrow();
	});

	it('rougit si un palier de la rampe disparaît', () => {
		expect(() =>
			controlerLecture2048(mute("[data-valeur='512']", "[data-valeur='511']")),
		).toThrow();
	});

	it('rougit si le cadre change de sélecteur', () => {
		expect(() => controlerLecture2048(mute('.g2048-grille {', '.g2048-plateau {'))).toThrow();
	});
});

describe('auto-contrôle : le gate du grand texte sait rougir', () => {
	const CHEMIN_MOTUS = 'src/styles/jeu-motus.scss';
	const MOTUS = feuille(CHEMIN_MOTUS).css;
	const regle = (selecteur: string): Regle => {
		const r = REGLES_GRAND_TEXTE.find((x) => x.selecteur === selecteur);
		if (!r) throw new Error(`règle non citée par PAIRES_GRAND_TEXTE : ${selecteur}`);
		return r;
	};

	const muteMotus = (cherche: string | RegExp, remplace: string): string => {
		const css = MOTUS.replace(cherche, remplace);
		expect(
			css,
			`la mutation « ${String(cherche)} » ne s'applique plus à jeu-motus.scss : cet ` +
				`auto-contrôle ne prouve plus rien tant qu'on ne l'a pas recalé.`,
		).not.toBe(MOTUS);
		return css;
	};

	it('rougit si les touches sont resserrées sous la bascule', () => {
		// 1,1 rem = 17,6 px : la perte de place gagnée coûte la conformité du couple.
		const css = muteMotus('font-size: 1.25rem', 'font-size: 1.1rem');
		expect(() => controlerGrandTexte(css, regle('.motus-touche'))).toThrow();
	});

	it('rougit si les touches perdent leur gras (20 px maigre ne qualifie plus)', () => {
		const css = muteMotus(/(\.motus-touche \{[\s\S]*?)font-weight: 800/, '$1font-weight: 500');
		expect(() => controlerGrandTexte(css, regle('.motus-touche'))).toThrow();
	});

	it('rougit si une variante d’état rétrécit le texte', () => {
		// Le défaut que la seule lecture de la règle de base ne montrerait pas : c'est
		// précisément l'état posé sur `--warn` qui perdrait sa taille.
		const css = muteMotus(
			".motus-case[data-etat='ailleurs'] {",
			".motus-case[data-etat='ailleurs'] {\n\tfont-size: 1rem;",
		);
		expect(() => controlerGrandTexte(css, regle('.motus-case'))).toThrow();
	});

	it('rougit si la règle citée par la table disparaît', () => {
		const css = muteMotus('.motus-touche {', '.motus-bouton-lettre {');
		expect(() => controlerGrandTexte(css, regle('.motus-touche'))).toThrow();
	});

	/** Les feuilles avec UNE mutation dans celle qui porte le réglage de confort. */
	const muteRacine = (cherche: string, remplace: string): Feuille[] => {
		const cible = 'src/styles/accessibility.scss';
		const out = FEUILLES.map((f) =>
			f.fichier === cible ? { ...f, css: f.css.replace(cherche, remplace) } : f,
		);
		expect(
			out.find((f) => f.fichier === cible)?.css,
			`la mutation « ${cherche} » ne s'applique plus à ${cible} : cet auto-contrôle ne ` +
				`prouve plus rien tant qu'on ne l'a pas recalé.`,
		).not.toBe(feuille(cible).css);
		return out;
	};

	it('rougit si une feuille descend la racine sous 100 %', () => {
		expect(() => controlerRacine(muteRacine('115%', '87.5%'))).toThrow();
	});

	it('rougit si la racine passe à une taille absolue', () => {
		expect(() => controlerRacine(muteRacine('font-size: 115%', 'font-size: 14px'))).toThrow();
	});

	it('rougit si --warn s’éclaircit sous le seuil du grand texte', () => {
		/* L'autre moitié du même gate : le couple n'est pas seulement INSCRIT dans la
		   troisième table, il est bien confronté à son seuil. On rejoue donc la mesure du
		   § #582 sur une palette mutée en mémoire — un ambre plus clair, la retouche la plus
		   probable puisque `--warn` sert aussi de fond de pastille. */
		const cas = CAS_PAIRES.find((c) => c.nature === 'grand-texte' && c.theme === 'defaut');
		expect(cas, 'aucun cas « grand texte » dans la table : ce gate ne garde rien').toBeTruthy();
		if (!cas) return;
		expect(() => controlerCas(cas, { ...PALETTES.defaut, '--warn': '#e8b96a' })).toThrow();
	});
});
