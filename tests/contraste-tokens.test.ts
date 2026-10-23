import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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
     • `--warn` comme TEXTE : l'ambre est trop clair pour du texte courant (4,24:1 sur
       `--paper`, 3,84:1 sur `--warn-bg` en thème clair). Le texte d'alerte a son propre
       token, `--warn-text` (décision du 10 octobre 2026), réécrit par la palette Nuit et
       mesuré au seuil TEXTE sur ses deux surfaces dans PAIRES_TEXTE. Le gate « Texte
       d'alerte », plus bas, interdit `color: var(--warn)` hors d'une liste blanche dont
       chaque entrée porte sa raison (aujourd'hui le seul `.enc-tendance-glyphe`, glyphe
       `aria-hidden` doublé par le mot en clair, donc objet graphique et non texte), et
       tout `#8a5200` écrit à la main hors de la définition du token (base.scss, et sa
       palette miroir d'impression print.scss).
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
	// Bandeau d'alerte de l'espace encadrant. Couple ancien, mis sous garde par #657, qui
	// lui donne deux émetteurs de plus (les refus de l'étape « Une dictée ») : le message y
	// devient un texte qu'on lit vraiment, pas un cas de bord. `themes.scss` signale déjà
	// qu'en thème Nuit cette surface a fait échouer un AUTRE texte (l'ambre #8a5200, #253) —
	// preuve que `--warn-bg` bouge sans prévenir, donc qu'aucun des textes qu'elle porte ne
	// devrait rester hors table.
	{
		avant: '--ink',
		arriere: '--warn-bg',
		ou: 'encadrant.scss .enc-warn (alerte de carte), .enc-envoi-aide-refus ; sheets.scss .rb-warn (alerte du bilan de fiche) ; partage.scss .partage-encart-alerte (dictée sans voix)',
	},
	{
		avant: '--on-accent',
		arriere: '--accent',
		ou: 'bilan.scss .bilan-cta, aide-exercice.scss ; catalog.scss .classe-choix .enc-act-mode.on (classe cochée, #772) ; bilan-parcours.scss .bp-valider (#777)',
	},
	{ avant: '--on-accent', arriere: '--accent-dark', ou: 'survol des mêmes boutons (bilan.scss)' },
	{
		avant: '--on-accent',
		arriere: '--ok',
		ou: 'lecon-mode.scss .lord-cell.correct .lord-mark ; tableau-conversion.scss .tc-cell.correct::after, .tc-fente--juste::before',
	},
	{
		avant: '--on-accent',
		arriere: '--ko',
		ou: 'lecon-mode.scss .lord-cell.wrong .lord-mark ; tableau-conversion.scss .tc-cell.wrong::after, .tc-fente--fausse::before',
	},
	{
		avant: '--accent-dark',
		arriere: '--paper',
		ou: 'accessibility.scss, aide-exercice.scss, mots-difficiles.scss .mots-difficiles-relire',
	},
	{
		avant: '--accent',
		arriere: '--paper',
		ou: 'sprint.scss, titres et libellés dans une carte ; bilan-parcours.scss .bp-consigne-titre, .bp-fin-titre, .bp-recap-titre (#777)',
	},
	{
		avant: '--accent',
		arriere: '--page-bg',
		ou: 'sprint-config (#scFilterTitle), boutons de retour, titres de rubrique du catalogue',
	},
	{
		avant: '--accent',
		arriere: '--accent-soft',
		ou: 'revision.scss .rev-cat, lecon-mode.scss .ltri-col-titre ; bilan-parcours.scss .bp-partie-nom (#777)',
	},
	{
		avant: '--ok',
		arriere: '--ok-soft',
		ou: 'lecon-mode.scss .mode-btn-badge, .sprint-choice.correct ; lessons.scss .posee-input.correct (fiche, et révision depuis #503) ; bilan-parcours.scss .bp-verdict--reussi (verdict « Réussi » du récapitulatif, #777)',
	},
	// Bandeau des réussites en fin de partie du parcours de bilan (#777) : texte NOIR sur le
	// vert pâle, la pastille verte n'étant que l'icône. Surface nouvelle pour `--ink`, absente
	// de la rampe #576 (qui ne connaît que --paper, --page-bg et --accent-soft).
	{
		avant: '--ink',
		arriere: '--ok-soft',
		ou: 'bilan-parcours.scss .bp-reussites (« 7 réussites », fin de partie, #777)',
	},
	{
		avant: '--ok',
		arriere: '--paper',
		ou: 'encadrant.scss (mise en avant positive) ; bilan-parcours.scss .bp-erreur-attendue strong (bonne réponse en fin de partie) et .bp-recap-total (« Tu as réussi 6 leçons sur 9. »), sur la carte .bp-carte (#777)',
	},
	{
		avant: '--ko',
		arriere: '--ko-soft',
		ou: 'lecon-mode.scss .sprint-choice.wrong ; lessons.scss .posee-input.wrong (fiche, et révision depuis #503)',
	},
	{
		avant: '--ko',
		arriere: '--paper',
		ou: 'encadrant.scss (alerte de suppression) ; réponse donnée rappelée après une erreur (#503) : revision.scss .rev-donnee strong et marque .rev-marque-ko, sprint.scss .sprint-correction .sprint-donnee strong ; bilan-parcours.scss .bp-erreur-donnee strong (réponse donnée en fin de partie, #777)',
	},
	{
		avant: '--ink',
		arriere: '--track',
		ou: 'surface neutre pleine : jauge, bouton « fantôme » ; recherche-lecon.scss .rech-classe (pastille de classe, #772) ; bilan-parcours.scss .bp-verdict--a-retravailler (verdict « À retravailler », #777)',
	},
	{ avant: '--grey', arriere: '--track', ou: 'idem, texte secondaire' },
	// Espace encadrant : surface ADULTE, absente de la rampe #576 (qui ne connaît que
	// --paper et --page-bg) alors que c'est un fond de page à part entière.
	{ avant: '--ink', arriere: '--admin-bg', ou: 'encadrant.scss .enc-wrap' },
	{ avant: '--grey', arriere: '--admin-bg', ou: 'encadrant.scss (texte secondaire)' },
	{ avant: '--muted', arriere: '--admin-bg', ou: 'encadrant.scss (texte discret)' },
	{ avant: '--admin-accent', arriere: '--admin-bg', ou: 'encadrant.scss (titres)' },
	{ avant: '--admin-accent', arriere: '--paper', ou: 'encadrant.scss .enc-btn-sec' },
	// Texte d'alerte (décision du 10 octobre 2026) : `--warn` est réservé aux liserés et aux
	// glyphes, le TEXTE ambre passe par `--warn-text`. Ses deux surfaces réelles ci-dessous ;
	// le gate « Texte d'alerte » plus bas empêche qu'un texte reparte sur `--warn`.
	{
		avant: '--warn-text',
		arriere: '--paper',
		ou: 'sheets.scss .rb-record, .rb-trophies, .cover .cover-warn (couverture imprimée) ; orthographe.scss .fb-xp',
	},
	{
		avant: '--warn-text',
		arriere: '--warn-bg',
		ou: 'lessons.scss .lz-level ; lecon-mode.scss .lqcm-multi-choice.is-missed, .lqm-badge--revoir ; guide.scss .g-badge--renforcer ; vitrine.scss .v-enc-badge--encours ; bilan-parcours.scss .bp-verdict--presque (verdict « Presque ») et .bp-seuil (règle des 60 %), #777',
	},
];

/** Couples de COMPOSANTS D'INTERFACE ou d'objets graphiques porteurs de sens
 *  → 3:1 (WCAG 1.4.11). Voir l'en-tête pour ce qui en est délibérément exclu. */
const PAIRES_NON_TEXTE: Paire[] = [
	{
		avant: '--cat-partage',
		arriere: '--paper',
		ou: 'encadrant.scss .enc-act-partage — segment « séance partagée » du graphe d’activité (#734)',
	},
	{
		avant: '--field-line',
		arriere: '--paper',
		ou: 'sheets.scss .ans — la ligne qui dit OÙ écrire ; encadrant.scss .enc-input, .enc-select-niveau — le contour des champs de l’espace (#734) ; bilan-parcours.scss .bp-input (#777)',
	},
	{
		avant: '--admin-accent',
		arriere: '--paper',
		ou: 'encadrant.scss .enc-envoi-cree, .enc-envoi-mention — cadre du lien prêt et filet de la mention (#734)',
	},
	// `--accent-soft` comme BORDURE a disparu du dépôt avec #385 : c'était une teinte de
	// surface employée comme trait (1,15 à 1,26:1). Les cinq boutons de choix qui la
	// portaient tirent désormais leur contour de repos du token ci-dessous. Le couple
	// n'est donc plus dans la table — on ne teste que les couples qu'on peut montrer du
	// doigt — et sa dérogation est tombée avec lui.
	{
		avant: '--control-line',
		arriere: '--paper',
		ou: 'sprint.scss .sprint-choice, pave-signes.scss .pave-signe, lecon-mode.scss .etude-btn, .lqcm-multi-choice et .mode-btn[data-epuise="1"] (bordure au repos) ; bilan-parcours.scss .bp-choice (#777)',
	},
	{
		avant: '--accent',
		arriere: '--paper',
		ou: 'bordure des mêmes boutons une fois survolés/pressés, remplissage de jauge ; partage.scss, choix de QCM sélectionné en séance partagée (#734) ; bilan-parcours.scss .bp-choice survolé ou choisi, .bp-trou (#777)',
	},
	// Curseur SUR sa piste, et non sur le papier : c'est le couple qu'on voit réellement dès
	// qu'une jauge est partiellement remplie. Posé par #711 (jauge de défilement du tableau de
	// conversion, `tableau-conversion.scss .tc-jauge-curseur`), mais il existait déjà sans être
	// mesuré — `.lz-bar-fill` sur `.lz-bar` (lessons.scss) est exactement le même empilement.
	// Il porte du SENS ici : c'est le seul indice qu'il reste des colonnes hors du cadre.
	{
		avant: '--accent',
		arriere: '--track',
		ou: 'tableau-conversion.scss .tc-jauge-curseur sur .tc-jauge ; lessons.scss .lz-bar-fill sur .lz-bar',
	},
	{
		avant: '--warn',
		arriere: '--paper',
		ou: 'encadrant.scss .enc-revoir-signal (liseré « ça bloque »)',
	},
	// Anneau de focus du champ de recherche enfant (#718) : il se dessine HORS du cadre du
	// champ, donc sur le fond de page, pas sur le papier. Posé en `--accent-dark` après que
	// la relecture a11y a mesuré `--accent-soft` à 1,04:1 au même endroit — la variante
	// « box-shadow » du motif que #385 avait retiré comme bordure.
	{
		avant: '--accent-dark',
		arriere: '--page-bg',
		ou: 'recherche-lecon.scss .recherche-champ:focus-within (anneau de focus)',
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
   Texte d'alerte : `--warn-text`, jamais `--warn` (décision du 10 octobre 2026)

   `--warn` (#b26a00) ne tient pas AA en texte courant. Le dépôt l'avait contourné à la
   main, feuille par feuille, en écrivant #8a5200 : le motif exact de `--muted` (#576).
   Une valeur en dur ne suit pas le thème, et c'est en Nuit qu'elle a cassé (#253, ~2:1
   sur `--warn-bg` sombre). PAIRES_TEXTE mesure le token ; ce gate-ci tient l'autre
   moitié, que les feuilles s'en servent :
     (a) aucun #8a5200 écrit à la main, hors de la définition du token (base.scss,
         print.scss) ;
     (b) aucun `color: var(--warn)` hors de la liste blanche ci-dessous.
   Les commentaires ne comptent pas : ils ne colorent rien.
   ============================================================ */

type ToleranceWarn = {
	/** Feuille, relative à src/styles. */
	fichier: string;
	/** SUJET du sélecteur : son dernier composé, l'élément réellement coloré. */
	sujet: string;
	/** Pourquoi l'élément n'est pas du texte lu. Sans raison, pas d'entrée. */
	raison: string;
};

/** Seuls endroits où `color: var(--warn)` est permis. Ajouter une entrée, c'est affirmer
 *  que l'élément coloré n'est pas un texte qu'on lit ; sinon, `var(--warn-text)`. */
const WARN_EN_COULEUR_TOLEREE: ToleranceWarn[] = [
	{
		fichier: 'encadrant.scss',
		sujet: '.enc-tendance-glyphe',
		raison:
			'glyphe de tendance `aria-hidden`, doublé par le mot en clair : objet graphique, ' +
			'tenu au seuil non-texte (cf. en-tête), pas du texte',
	},
];

type Declaration = {
	fichier: string;
	ligne: number;
	/** Sélecteurs complets de la règle (imbrication et `&` résolus, at-rules ignorées). */
	selecteurs: string[];
	propriete: string;
	valeur: string;
};

/** Retire les commentaires `/* … *\/` et `// …` sans toucher aux chaînes, et en gardant
 *  les sauts de ligne : les numéros de ligne des messages d'échec restent justes. */
function sansCommentaires(scss: string): string {
	let sortie = '';
	let guillemet = '';
	for (let i = 0; i < scss.length; i++) {
		const c = scss[i];
		if (guillemet) {
			sortie += c;
			if (c === '\\') {
				sortie += scss.charAt(i + 1);
				i++;
			} else if (c === guillemet) guillemet = '';
		} else if (c === '"' || c === "'") {
			guillemet = c;
			sortie += c;
		} else if (c === '/' && scss[i + 1] === '*') {
			const fin = scss.indexOf('*/', i + 2);
			const bout = fin === -1 ? scss.length : fin + 2;
			sortie += scss.slice(i, bout).replace(/[^\n]/g, ' ');
			i = bout - 1;
		} else if (c === '/' && scss[i + 1] === '/' && scss[i - 1] !== ':') {
			// `scss[i - 1] !== ':'` : épargne le `//` d'une URL (`https://…`).
			const fin = scss.indexOf('\n', i);
			const bout = fin === -1 ? scss.length : fin;
			sortie += ' '.repeat(bout - i);
			i = bout - 1;
		} else sortie += c;
	}
	return sortie;
}

/** Liste de sélecteurs coupée aux virgules de premier niveau (pas celles d'un `:is(…)`). */
function listeSelecteurs(brut: string): string[] {
	const parts: string[] = [];
	let profondeur = 0;
	let courant = '';
	for (const c of brut) {
		if (c === '(' || c === '[') profondeur++;
		else if (c === ')' || c === ']') profondeur--;
		if (c === ',' && profondeur === 0) {
			parts.push(courant);
			courant = '';
		} else courant += c;
	}
	parts.push(courant);
	return parts.map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

function resoudre(pile: string[]): string[] {
	let courants = [''];
	for (const brut of pile) {
		if (brut.startsWith('@')) continue; // @media, @mixin, @supports… : pas un sélecteur
		const enfants = listeSelecteurs(brut);
		courants = courants.flatMap((parent) =>
			enfants.map((e) =>
				e.includes('&') ? e.split('&').join(parent) : parent ? `${parent} ${e}` : e,
			),
		);
	}
	return courants;
}

/** Déclarations `propriété: valeur` d'une feuille, avec la règle qui les porte. */
function declarations(fichier: string, scss: string): Declaration[] {
	const src = sansCommentaires(scss);
	const pile: string[] = [];
	const trouvees: Declaration[] = [];
	let tampon = '';
	let ligne = 1;
	let ligneTampon = 1;
	let guillemet = '';
	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (c === '\n') ligne++;
		if (!tampon.trim() && /\S/.test(c)) ligneTampon = ligne;
		if (guillemet) {
			tampon += c;
			if (c === guillemet) guillemet = '';
		} else if (c === '"' || c === "'") {
			guillemet = c;
			tampon += c;
		} else if (c === '#' && src[i + 1] === '{') {
			// Interpolation SCSS `#{…}` : ses accolades ne sont pas celles d'une règle.
			const fin = src.indexOf('}', i);
			tampon += src.slice(i, fin + 1);
			i = fin;
		} else if (c === '{') {
			pile.push(tampon.trim());
			tampon = '';
		} else if (c === ';' || c === '}') {
			const m = tampon.trim().match(/^([\w-]+)\s*:([\s\S]*)$/);
			if (m)
				trouvees.push({
					fichier,
					ligne: ligneTampon,
					selecteurs: resoudre(pile),
					propriete: m[1].toLowerCase(),
					valeur: m[2].trim(),
				});
			tampon = '';
			if (c === '}') pile.pop();
		} else tampon += c;
	}
	return trouvees;
}

/** `color: var(--warn)` au sens strict : la propriété `color` exactement (donc ni
 *  `border-left-color` ni `outline-color`), et le token `--warn` lui-même (ni
 *  `--warn-text` ni `--warn-bg`), avec ou sans valeur de repli. */
const estTexteEnWarn = (d: Declaration) =>
	d.propriete === 'color' && /var\(\s*--warn\s*[,)]/.test(d.valeur);

/** Dernier composé d'un sélecteur : l'élément que la règle colore. */
const sujet = (selecteur: string) => selecteur.split(/\s*[>+~]\s*|\s+/).pop() ?? '';

const tolereePar = (t: ToleranceWarn, d: Declaration) =>
	d.fichier === t.fichier && d.selecteurs.every((s) => sujet(s) === t.sujet);

/** Détecteur (b). */
function texteEnWarnHorsListe(fichier: string, scss: string): Declaration[] {
	return declarations(fichier, scss).filter(
		(d) => estTexteEnWarn(d) && !WARN_EN_COULEUR_TOLEREE.some((t) => tolereePar(t, d)),
	);
}

/** Feuilles qui DÉFINISSENT `--warn-text` : la source (base.scss) et la palette miroir
 *  d'impression (print.scss, #601), qui rétablit la valeur claire sur papier. Définir le
 *  token y est permis ; écrire la valeur comme couleur d'un composant reste interdit. */
const DEFINISSENT_WARN_TEXT = ['base.scss', 'print.scss'];

/** Détecteur (a) : #8a5200 hors commentaires (toute forme, alpha `#8a5200cc` compris),
 *  sauf la déclaration `--warn-text: #8a5200` dans les feuilles qui définissent le token. */
function ambreEcritALaMain(fichier: string, scss: string): { ligne: number; texte: string }[] {
	return sansCommentaires(scss)
		.split('\n')
		.flatMap((l, i) => {
			const reste = DEFINISSENT_WARN_TEXT.includes(fichier)
				? l.replace(/--warn-text\s*:\s*#8a5200\s*(?:!important\s*)?;?/i, '')
				: l;
			return /#8a5200/i.test(reste) ? [{ ligne: i + 1, texte: l.trim() }] : [];
		});
}

const DOSSIER_STYLES = 'src/styles';
const FEUILLES = readdirSync(DOSSIER_STYLES, { recursive: true, encoding: 'utf8' })
	.map((f) => f.replace(/\\/g, '/'))
	.filter((f) => f.endsWith('.scss'))
	.sort();
const SOURCES = FEUILLES.map((fichier) => ({
	fichier,
	scss: readFileSync(`${DOSSIER_STYLES}/${fichier}`, 'utf8'),
}));

const lignesDe = (ds: { ligne: number }[]) => ds.map((d) => d.ligne);
const decrire = (d: Declaration) =>
	`${d.fichier}:${d.ligne}  ${d.selecteurs.join(', ')} { ${d.propriete}: ${d.valeur} }`;

describe("Texte d'alerte : --warn-text, jamais --warn en texte (décision du 10 octobre 2026)", () => {
	it('les feuilles sont bien lues et le lecteur de déclarations voit le vrai code', () => {
		// Sans cette garde, un lecteur cassé (zéro déclaration) rendrait (a) et (b) verts.
		expect(FEUILLES).toContain('base.scss');
		expect(FEUILLES).toContain('encadrant.scss');
		expect(
			declarations('base.scss', BASE).some(
				(d) => d.propriete === '--warn' && d.selecteurs.includes(':root'),
			),
		).toBe(true);
	});

	it('la palette Nuit écrit sa propre valeur de --warn-text, en hexadécimal', () => {
		const nuit = THEMES.match(/@mixin nuit-palette\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
		expect(
			tokens(nuit)['--warn-text'],
			`themes.scss, @mixin nuit-palette : --warn-text doit y avoir sa valeur, écrite en ` +
				`#rrggbb. Sans elle, l'ambre sombre du thème clair s'affiche sur la carte Nuit ` +
				`(~2:1) ; et un var(--autre) ne serait pas mesuré par PAIRES_TEXTE.`,
		).toMatch(/^#[0-9a-f]{6}$/);
	});

	it('(a) aucun #8a5200 écrit à la main hors de la définition de --warn-text', () => {
		const trouves = SOURCES.flatMap(({ fichier, scss }) =>
			ambreEcritALaMain(fichier, scss).map((o) => `${fichier}:${o.ligne}  ${o.texte}`),
		);
		expect(
			trouves,
			`Ambre d'alerte écrit en dur dans src/styles : il ne suit pas le thème (en Nuit, ` +
				`#8a5200 tombe à ~2:1 sur --warn-bg). Utilisez var(--warn-text) pour un texte, ` +
				`var(--warn) pour un liseré ou un glyphe. Seule la définition du token ` +
				`(--warn-text: …, dans ${DEFINISSENT_WARN_TEXT.join(' ou ')}) écrit cette valeur.`,
		).toEqual([]);
	});

	it('(b) color: var(--warn) seulement aux sélecteurs de la liste blanche', () => {
		const trouves = SOURCES.flatMap(({ fichier, scss }) =>
			texteEnWarnHorsListe(fichier, scss).map(decrire),
		);
		expect(
			trouves,
			`Texte posé en var(--warn), sous AA en petite taille (4,24:1 sur --paper, 3,84:1 sur ` +
				`--warn-bg en thème clair) : utilisez var(--warn-text). Si l'élément n'est PAS un ` +
				`texte qu'on lit (glyphe aria-hidden doublé en clair…), ajoutez-le à ` +
				`WARN_EN_COULEUR_TOLEREE avec sa raison.`,
		).toEqual([]);
	});

	it('chaque entrée de la liste blanche sert encore', () => {
		// Même règle que DEROGATIONS : une exception qui ne sert plus est une porte ouverte.
		const enWarn = SOURCES.flatMap(({ fichier, scss }) =>
			declarations(fichier, scss).filter(estTexteEnWarn),
		);
		for (const t of WARN_EN_COULEUR_TOLEREE)
			expect(
				enWarn.some((d) => tolereePar(t, d)),
				`WARN_EN_COULEUR_TOLEREE : ${t.fichier} ${t.sujet} ne porte plus de color: var(--warn). ` +
					`Retirer l'entrée.`,
			).toBe(true);
	});

	it('détecteur (b) : seule la propriété color compte, et pas dans un commentaire', () => {
		const scss = `
.a { border-left-color: var(--warn); }
.b { border-color: var(--warn); outline-color: var(--warn); --k: var(--warn); }
.c { /* color: var(--warn) */ color: var(--ink); }
.d { /* ancien ; color: var(--warn); */ color: var(--warn-text); background: var(--warn-bg); }
// ancien ; color: var(--warn);
.e { color: var(--warn); }
.f {
	&.g { color: var( --warn , #b26a00) !important; }
}
.h { /* note */ color: var(--warn); }
`;
		expect(texteEnWarnHorsListe('x.scss', scss).map(decrire)).toEqual([
			'x.scss:7  .e { color: var(--warn) }',
			'x.scss:9  .f.g { color: var( --warn , #b26a00) !important }',
			'x.scss:11  .h { color: var(--warn) }',
		]);
	});

	it('détecteur (b) : la liste blanche vise le SUJET du sélecteur, dans son fichier', () => {
		const scss = `
.enc-tendance-a-relancer .enc-tendance-glyphe { color: var(--warn); }
.enc-tendance-a-relancer {
	.enc-tendance-glyphe { color: var(--warn); }
}
.enc-tendance-glyphe-texte { color: var(--warn); }
.enc-tendance-glyphe, .enc-tendance-mot { color: var(--warn); }
.enc-tendance-glyphe .enc-libelle { color: var(--warn); }
`;
		expect(lignesDe(texteEnWarnHorsListe('encadrant.scss', scss))).toEqual([6, 7, 8]);
		expect(lignesDe(texteEnWarnHorsListe('sheets.scss', scss))).toEqual([2, 4, 6, 7, 8]);
	});

	it("détecteur (a) : n'exempte que la définition du token, dans base.scss et print.scss", () => {
		const scss = `
:root {
	--warn-text: #8a5200;
	/* #8a5200 ≈ 5,8:1 sur --warn-bg */
}
.x { color: #8A5200; }
.y { border-left-color: #8a5200; } // #8a5200
$ambre: #8a5200cc;
`;
		expect(lignesDe(ambreEcritALaMain('base.scss', scss))).toEqual([6, 7, 8]);
		expect(lignesDe(ambreEcritALaMain('lessons.scss', scss))).toEqual([3, 6, 7, 8]);
		// Palette miroir d'impression : la définition passe, une couleur de composant non.
		const impression = `
@media print {
	:root {
		--warn-text: #8a5200 !important;
	}
	.z { color: #8a5200 !important; }
	.w { border-color: #8a5200; }
}
`;
		expect(lignesDe(ambreEcritALaMain('print.scss', impression))).toEqual([6, 7]);
		expect(lignesDe(ambreEcritALaMain('themes.scss', impression))).toEqual([4, 6, 7]);
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

	it('--warn-text y est rétabli à sa valeur claire (décision du 10 octobre 2026)', () => {
		// Le test ci-dessus ne vérifie que les tokens PRÉSENTS dans la liste ; un token oublié
		// lui échappe. C'est arrivé à --warn lui-même (cf. print.scss). --warn-text est réécrit
		// par la palette Nuit et porte un texte imprimé (.cover-warn, print-only) : sans entrée
		// ici, imprimer en Nuit pose l'ambre clair du thème sombre sur du papier blanc.
		const valeur = PALETTE_IMPRESSION['--warn-text'];
		const message =
			`print.scss, @media print :root : ajouter --warn-text à sa valeur claire ` +
			`(${RACINE['--warn-text'] ?? 'celle de base.scss'}) !important.`;
		expect(valeur, message).toMatch(/^#[0-9a-f]{6}$/);
		expect(valeur, message).toBe(RACINE['--warn-text']);
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
   Le fond vert des sections de la vitrine, écrit en dur
   ============================================================ */

describe('Texte sur les sections vertes de la vitrine (index.html)', () => {
	/* `.v-section--soft` pose un littéral (#c7e2ce), pas un token : les tables de paires
	   ne le voient pas, et un `--grey` ou un `--ink` retouché demain pourrait passer sous AA
	   sur ces bandes sans qu'aucun gate ne bouge — le scénario de `--muted` (#576). Relevé
	   par la relecture a11y de la section « partage par lien » (2026-10-20).
	   Palette « defaut » seule : la vitrine n'importe pas themes.scss (src/vitrine.ts),
	   aucun thème ne s'y applique. Couples montrés du doigt dans vitrine.scss : `--ink`
	   (`.v-section h2`, `.v-partage-note strong`) et `--grey` (`.v-gamif-text p`,
	   `.v-partage-lead`, `.v-partage-note`). ÉCARTÉ : la flèche `--accent-dark` entre deux
	   étapes du partage, décorative (l'ordre est porté par la liste et les numéros), donc
	   exemptée par WCAG 1.4.11. */
	const VITRINE = readFileSync('src/styles/vitrine.scss', 'utf8');
	const fond = VITRINE.match(/\.v-section--soft \{[^}]*?background: (#[0-9a-fA-F]{6})/)?.[1];

	it('le fond est bien lu (garde contre un test à vide)', () => {
		expect(
			fond,
			'Fond de `.v-section--soft` introuvable dans src/styles/vitrine.scss : la règle a ' +
				'changé de forme (token, dégradé…), ce test ne garde plus rien. Corriger le motif.',
		).toBeTruthy();
	});

	it.each(['--ink', '--grey'])('%s reste AA sur le fond vert', (texte) => {
		const couleur = PALETTES.defaut[texte];
		const r = contraste(couleur, fond!);
		expect(
			r,
			`${texte} (${couleur}) sur le fond des sections vertes de la vitrine (${fond}) : ` +
				`${r.toFixed(2)}:1, sous les ${SEUIL_TEXTE_AA}:1 du texte courant (WCAG 1.4.3).\n` +
				`Éclaircir le fond dans vitrine.scss plutôt que de surcharger la couleur du texte ` +
				`section par section.`,
		).toBeGreaterThanOrEqual(SEUIL_TEXTE_AA);
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
