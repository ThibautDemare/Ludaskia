import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { contraste, melange, SEUIL_TEXTE_AA } from '../tools/contrast/wcag.js';
import { FLOCONS, type FloconSpec } from '../src/core/decor-saison';
import { declarations, decrire, sansCommentairesScss, sujet, type Declaration } from './aide-scss';
import {
	FOND_VERT_VITRINE,
	fondVertDe,
	PALETTES,
	THEMES_NOMS,
	VITRINE_SCSS,
} from './aide-couleurs';

/* ============================================================
   Contraste du décor de saison (#785) : les flocons de Noël sur les fonds où ils passent,
   et le texte de la vitrine sur le verre dépoli qui le protège en décembre.

   Extrait de `contraste-tokens.test.ts`, dont il partage la lecture des palettes et du fond
   vert de la vitrine (`aide-couleurs.ts`), celle des déclarations SCSS (`aide-scss.ts`) et
   la formule (`tools/contrast/wcag.js`). Ce qui lui est propre : la couleur de chaque plan
   de flocon lue dans decor-saison.scss, les voiles des panneaux `.v-texte`, et la déduction
   des couleurs de texte depuis index.html.
   ============================================================ */

/* ============================================================
   #785 — le flocon du décor de Noël (critère 15)
   ============================================================ */

/* Le flocon est DÉCORATIF : WCAG 1.4.11 ne le vise pas (cf. l'en-tête de
   contraste-tokens.test.ts), et ces bornes ne sont pas des seuils WCAG. Elles viennent de
   l'avis `designer-ux-enfant` du 09/11/2026 :
   - PLANCHER : chaque flocon doit se voir sur une tablette, sinon le décor n'existe pas ;
   - PLAFOND : aucun ne doit être pris pour un bouton. 3:1 est le seuil d'un composant
     d'interface (1.4.11) ; au-delà, un rond net sur le fond se lit comme une pastille à
     toucher.
   Mesuré là où les flocons passent : `--page-bg` sur les six thèmes et, sur la vitrine, le
   vert de ses sections (palette par défaut seule : la vitrine n'a pas de thèmes). Cartes,
   barre d'outils et en-têtes les masquent.
   Chaque flocon est mesuré dans la couleur de SON plan (rédaction du 11/11/2026 : les
   plans de devant prennent `--flocon-proche`), composée sur le fond à SON opacité de pic
   (`opacite`, lue dans `FLOCONS`) : c'est la couleur que le navigateur rend, pas celle du
   token. La couleur de chaque plan est LUE dans decor-saison.scss (`.decor-saison` pour
   le défaut, `.decor-flocon--<plan>` pour les autres), pas recopiée ici.
   Ordres de grandeur, pour qui choisit la couleur : un flocon BLANC sur les fonds clairs
   reste vers 1,1:1 (invisible) ; un flocon clair sur le fond de Nuit dépasse 3:1 dès la
   demi-opacité. D'où des tokens par palette, `:root` et `nuit-palette`. */
const PLANCHER_FLOCON = 1.5;
const PLAFOND_FLOCON = 3;
const HEXA = /^#[0-9a-f]{6}$/;

const DECOR_SAISON = sansCommentairesScss(readFileSync('src/styles/decor-saison.scss', 'utf8'));

/** Token de couleur de chaque plan, lu dans les règles `color: var(--…)` de la feuille du
 *  décor : `.decor-saison` donne le défaut, `.decor-flocon--<plan>` le remplace. */
const COULEUR_DES_PLANS = (() => {
	let defaut: string | undefined;
	const parPlan: Record<string, string> = {};
	for (const [, selecteurs, corps] of DECOR_SAISON.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const token = corps.match(/(?:^|[;\s])color:\s*var\((--[\w-]+)\)/)?.[1];
		if (!token) continue;
		for (const s of selecteurs.split(',')) {
			const plan = s.match(/\.decor-flocon--([\w-]+)\s*$/)?.[1];
			if (plan) parPlan[plan] = token;
			else if (/^\s*\.decor-saison\s*$/.test(s)) defaut = token;
		}
	}
	return { defaut, parPlan };
})();
const tokenDuFlocon = (f: FloconSpec): string | undefined =>
	COULEUR_DES_PLANS.parPlan[f.plan] ?? COULEUR_DES_PLANS.defaut;
/** Tokens de flocon nommés n'importe où dans la feuille du décor (`var(--flocon…)`). */
const TOKENS_FLOCON_FEUILLE = [
	...new Set([...DECOR_SAISON.matchAll(/var\((--flocon[\w-]*)\)/g)].map((m) => m[1])),
];

/** Chaque flocon, dans la couleur de son plan composée à son opacité de pic, sur `fond`. */
function mesuresFlocons(palette: Record<string, string>, fond: string) {
	return FLOCONS.map((f) => {
		const token = tokenDuFlocon(f) ?? '(couleur introuvable)';
		const couleur = palette[token];
		const compose = melange(couleur, fond, f.opacite);
		const r = contraste(compose, fond);
		return {
			r,
			texte:
				`${f.plan} (graine ${f.graine}) : ${token} (${couleur}) à l'opacité ${f.opacite} ` +
				`se compose en ${compose}, soit ${r.toFixed(2)}:1`,
		};
	});
}

describe('Flocon du décor de Noël sur le fond de page, tous thèmes (#785, critère 15)', () => {
	it('garde contre un test à vide : couleur de chaque plan lue dans la feuille, puis sur les six thèmes', () => {
		expect(THEMES_NOMS.length).toBeGreaterThanOrEqual(6);
		expect(FLOCONS.length, 'FLOCONS est vide : aucun flocon à mesurer').toBeGreaterThanOrEqual(6);
		expect(
			COULEUR_DES_PLANS.defaut,
			'Couleur des flocons (`color: var(--…)` de `.decor-saison`) introuvable dans ' +
				'src/styles/decor-saison.scss : corriger la lecture, sinon le gate ne mesure rien.',
		).toBeTruthy();
		const mesures = new Set(FLOCONS.map(tokenDuFlocon));
		expect(TOKENS_FLOCON_FEUILLE.length).toBeGreaterThan(0);
		expect(
			TOKENS_FLOCON_FEUILLE.filter((t) => !mesures.has(t)),
			'Couleurs de flocon nommées dans decor-saison.scss mais portées par aucun flocon ' +
				'mesuré : règle que ce test ne sait pas lire (imbrication, autre sélecteur, autre ' +
				'propriété) ou plan sans flocon. Le gate mesurerait une autre couleur que celle rendue.',
		).toEqual([]);
		for (const token of mesures)
			for (const theme of THEMES_NOMS)
				expect(
					PALETTES[theme][token ?? ''],
					`Thème « ${theme} » : ${token} n'a pas été lu. Le déclarer en hexadécimal écrit en ` +
						`dur dans :root (base.scss) et dans @mixin nuit-palette (themes.scss).`,
				).toMatch(HEXA);
	});

	it.each(THEMES_NOMS)(
		'%s : chaque flocon, dans la couleur de son plan, se voit encore (≥ 1,5:1)',
		(theme) => {
			const p = PALETTES[theme];
			expect(FLOCONS.length).toBeGreaterThanOrEqual(6);
			const pales = mesuresFlocons(p, p['--page-bg']).filter((m) => !(m.r >= PLANCHER_FLOCON));
			expect(
				pales.map((m) => m.texte),
				`Thème « ${theme} », sur --page-bg (${p['--page-bg']}) : sous le plancher de ` +
					`${PLANCHER_FLOCON}:1, le flocon disparaît sur une tablette.`,
			).toEqual([]);
		},
	);

	it.each(THEMES_NOMS)(
		'%s : aucun flocon, dans la couleur de son plan, ne passe pour un bouton (≤ 3:1)',
		(theme) => {
			const p = PALETTES[theme];
			expect(FLOCONS.length).toBeGreaterThanOrEqual(6);
			const marques = mesuresFlocons(p, p['--page-bg']).filter((m) => !(m.r <= PLAFOND_FLOCON));
			expect(
				marques.map((m) => m.texte),
				`Thème « ${theme} », sur --page-bg (${p['--page-bg']}) : au-dessus du plafond de ` +
					`${PLAFOND_FLOCON}:1, un rond aussi net se lit comme une pastille à toucher.`,
			).toEqual([]);
		},
	);
});

describe('Flocon du décor de Noël sur les sections vertes de la vitrine (#785, critère 15)', () => {
	/* Le `::before` de `.v-section--soft` est peint SOUS le calque des flocons : ils passent
	   sur ce vert, plus foncé que --page-bg. Palette par défaut seule (pas de thèmes). */
	const p = PALETTES.defaut;
	const fond = FOND_VERT_VITRINE ?? '';

	it('garde contre un test à vide : fond vert et couleurs des plans lus', () => {
		expect(
			FOND_VERT_VITRINE,
			'Fond de `.v-section--soft::before` introuvable dans vitrine.scss : rien à mesurer.',
		).toMatch(/^#[0-9a-fA-F]{6}$/);
		expect(FLOCONS.length).toBeGreaterThanOrEqual(6);
		for (const f of FLOCONS)
			expect(p[tokenDuFlocon(f) ?? ''], `${f.plan} : couleur non lue (palette par défaut)`).toMatch(
				HEXA,
			);
	});

	it('chaque flocon, dans la couleur de son plan, se voit encore sur le vert (≥ 1,5:1)', () => {
		expect(fond).not.toBe('');
		expect(FLOCONS.length).toBeGreaterThanOrEqual(6);
		const pales = mesuresFlocons(p, fond).filter((m) => !(m.r >= PLANCHER_FLOCON));
		expect(
			pales.map((m) => m.texte),
			`Vitrine, sur le vert des sections (${fond}) : sous le plancher de ${PLANCHER_FLOCON}:1, ` +
				`le flocon disparaît en passant sur la section.`,
		).toEqual([]);
	});

	it('aucun flocon, dans la couleur de son plan, ne passe pour un bouton sur le vert (≤ 3:1)', () => {
		expect(fond).not.toBe('');
		expect(FLOCONS.length).toBeGreaterThanOrEqual(6);
		const marques = mesuresFlocons(p, fond).filter((m) => !(m.r <= PLAFOND_FLOCON));
		expect(
			marques.map((m) => m.texte),
			`Vitrine, sur le vert des sections (${fond}) : au-dessus du plafond de ${PLAFOND_FLOCON}:1, ` +
				`un rond aussi net se lit comme une pastille à toucher.`,
		).toEqual([]);
	});
});

/* ============================================================
   #785 — le verre dépoli sous le texte de la vitrine (critère 14, précisé le 12/11/2026)
   ============================================================ */

/* Les flocons passent SOUS le contenu, et presque tout le texte de la vitrine est posé à même
   le fond. En décembre, chaque bloc de texte (`.v-texte`) prend un voile de la couleur de son
   fond. L'exigence (commentaire du 12/11/2026 sur #785) : « même au pire, flocon le plus foncé
   à pleine opacité et sans compter le flou, le texte garde au moins 4,5:1 avec ce qui est
   peint derrière lui ».
   Ce qui est peint derrière une lettre, de bas en haut :
     1. le fond : celui de `body.vitrine`, ou le vert (opaque) du `::before` des sections
        `--soft` ;
     2. un flocon, dans la couleur de son plan à son opacité de pic (`FLOCONS`) ;
     3. le voile du panneau, `color-mix(in srgb, C N%, transparent)` : la couleur C à N %
        d'opacité.
   Chaque flocon est essayé, plus l'absence de flocon, et le pire est retenu : on ne suppose
   pas lequel est le plus foncé. Le flou n'est PAS compté : il étale le flocon sans l'assombrir,
   et le critère exige que le voile seul suffise.
   Les couleurs de texte ne sont pas listées ici : elles sont DÉDUITES de index.html et des
   feuilles que charge la vitrine (imports de src/vitrine.ts). Pour chaque élément qui porte du
   texte dans un panneau : toutes les règles `color` qui le visent, survol et focus compris, sans
   arbitrer la spécificité (on mesure plus de couleurs que n'en rend le navigateur, jamais
   moins) ; l'héritage sinon ; la couleur du navigateur pour un lien ou un bouton qu'aucune
   règle ne colore. Un sous-arbre posé sur sa propre surface (le bouton plein « Commencer ») est
   écarté : son texte n'est pas sur le verre.
   Palette par défaut seule : la vitrine n'a jamais de `data-theme`. */

type SurfaceVerre = 'défaut' | 'vert';
type Voile = { couleur: string; alpha: number; source: string };
type RegleLue = { selecteur: string; valeur: string; source: string };
type TexteSurLeVerre = { surface: SurfaceVerre; couleur: string; ou: string };

/** `color-mix(in srgb, C N%, transparent)` : C, en token ou en hexadécimal, et N. */
const VOILE_COLOR_MIX =
	/^color-mix\(\s*in\s+srgb\s*,\s*(?:var\(\s*(--[\w-]+)\s*\)|(#[0-9a-fA-F]{6}))\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)$/;
const NOMME_UN_PANNEAU = /\.v-texte(?![\w-])/;
const SECTION_VERTE = /\.v-section--soft(?![\w-])/;
/** Préludes sous lesquels une règle ne vaut pas pour l'écran ordinaire mesuré ici. */
const HORS_ECRAN_ORDINAIRE = /\bprint\b|forced-colors/;
/** États d'interaction retirés d'un sélecteur avant de l'évaluer : la couleur de survol d'un
 *  lien est posée sur le verre aussi bien que sa couleur de repos. */
const ETATS_INTERACTION =
	/:(?:hover|focus-visible|focus-within|focus|active|visited|link)(?![\w-])/g;
/** Couleur du navigateur, faute de règle : lien (non visité, visité) et bouton, schéma clair
 *  de Chrome comme de Firefox. */
const COULEURS_DU_NAVIGATEUR = { lien: ['#0000ee', '#551a8b'], bouton: ['#000000'] };

/** Les voiles des panneaux, lus dans la feuille : par défaut, et dans les sections vertes. */
function voilesDe(scss: string, palette: Record<string, string>) {
	const lus = { défaut: [] as Voile[], vert: [] as Voile[], illisibles: [] as string[] };
	for (const d of declarations('vitrine.scss', scss)) {
		if (!/^background(?:-color)?$/.test(d.propriete)) continue;
		const panneaux = d.selecteurs.filter((s) => NOMME_UN_PANNEAU.test(sujet(s)));
		if (!panneaux.length) continue;
		const m = d.valeur.match(VOILE_COLOR_MIX);
		const couleur = m && (m[1] ? palette[m[1]] : m[2].toLowerCase());
		if (!m || !couleur) {
			lus.illisibles.push(decrire(d));
			continue;
		}
		const voile = { couleur, alpha: Number(m[3]) / 100, source: decrire(d) };
		lus[panneaux.some((s) => SECTION_VERTE.test(s)) ? 'vert' : 'défaut'].push(voile);
	}
	return lus;
}

/** Fond de `body.vitrine`, résolu dans la palette. */
function fondDePageDe(scss: string, palette: Record<string, string>): string | undefined {
	const d = declarations('vitrine.scss', scss).find(
		(x) => /^background(?:-color)?$/.test(x.propriete) && x.selecteurs.includes('body.vitrine'),
	);
	const token = d?.valeur.match(/^var\(\s*(--[\w-]+)\s*\)$/)?.[1];
	return token ? palette[token] : d?.valeur.match(/^#[0-9a-fA-F]{6}$/)?.[0].toLowerCase();
}

/** Le pire contraste de `texte` sur le verre : le voile posé sur chaque flocon (couleur de son
 *  plan, opacité de pic), lui-même posé sur `fond` ; et le voile sur le fond nu. */
function pireSousLeVerre(
	texte: string,
	fond: string,
	voile: Voile,
	palette: Record<string, string>,
) {
	const derriere = [
		{ quoi: 'sans flocon', couleur: fond },
		...FLOCONS.map((f) => {
			const token = tokenDuFlocon(f) ?? '(couleur introuvable)';
			return {
				quoi: `flocon ${f.plan} (graine ${f.graine}), ${token} à ${f.opacite}`,
				couleur: melange(palette[token], fond, f.opacite),
			};
		}),
	];
	return derriere
		.map(({ quoi, couleur }) => {
			const compose = melange(voile.couleur, couleur, voile.alpha);
			return { r: contraste(texte, compose), quoi, compose };
		})
		.reduce((pire, m) => (m.r < pire.r ? m : pire));
}

/** Verts du voile des sections `--soft` qui ne sont pas le vert de leur `::before`. */
function vertsDivergents(scss: string, palette: Record<string, string>): string[] {
	const dessous = fondVertDe(scss)?.toLowerCase();
	if (!dessous) return ['vert du `::before` introuvable'];
	return voilesDe(scss, palette)
		.vert.filter((v) => v.couleur !== dessous)
		.map((v) => `${v.source} : ${v.couleur} sur un ::before ${dessous}`);
}

/** Règles qui nomment un panneau, ne remettent pas une propriété à `none`, et ne sont pas
 *  enveloppées dans un `@media screen` : elles s'imprimeraient. */
function reglesDuVerreHorsEcran(scss: string): string[] {
	return declarations('vitrine.scss', scss)
		.filter((d) => d.selecteurs.some((s) => NOMME_UN_PANNEAU.test(s)))
		.filter((d) => d.valeur !== 'none')
		.filter((d) => !d.conditions.some((c) => /^@media\s+(?:only\s+)?screen\b/.test(c)))
		.map(decrire);
}

/** Règles d'une propriété, à l'écran ordinaire, hors pseudo-éléments. */
function reglesLues(decls: Declaration[], propriete: RegExp, sansEtats: boolean): RegleLue[] {
	return decls
		.filter((d) => propriete.test(d.propriete))
		.filter((d) => !d.conditions.some((c) => HORS_ECRAN_ORDINAIRE.test(c)))
		.flatMap((d) =>
			d.selecteurs
				.filter((s) => !s.includes('::'))
				.map((s) => ({
					selecteur: sansEtats ? s.replace(ETATS_INTERACTION, '') || '*' : s,
					valeur: d.valeur.replace(/\s*!important$/, '').trim(),
					source: `${d.fichier}:${d.ligne}`,
				})),
		);
}

/** Texte de chaque panneau `.v-texte` de `doc`, avec la (les) couleur(s) que les feuilles lui
 *  donnent, et la surface du panneau (sur le fond de page ou dans une section verte). */
function textesSurLeVerre(doc: Document, decls: Declaration[], palette: Record<string, string>) {
	const illisibles = new Set<string>();
	const vise = (el: Element, r: RegleLue) => {
		try {
			return el.matches(r.selecteur);
		} catch {
			illisibles.add(`${r.source} : sélecteur non évaluable « ${r.selecteur} »`);
			return false;
		}
	};
	const couleurs = reglesLues(decls, /^color$/, true);
	const surfaces = reglesLues(decls, /^background(?:-color)?$/, false).filter(
		(r) => !/^(?:none|transparent)$/i.test(r.valeur) && !NOMME_UN_PANNEAU.test(sujet(r.selecteur)),
	);
	const couleursDe = (el: Element): string[] => {
		const propres = couleurs.filter((r) => vise(el, r));
		const parent = () => (el.parentElement ? couleursDe(el.parentElement) : ['#000000']);
		if (!propres.length) {
			if (el.tagName === 'A' && el.hasAttribute('href')) return COULEURS_DU_NAVIGATEUR.lien;
			if (el.tagName === 'BUTTON') return COULEURS_DU_NAVIGATEUR.bouton;
			return parent();
		}
		return propres.flatMap((r) => {
			if (/^(?:inherit|currentcolor)$/i.test(r.valeur)) return parent();
			const token = r.valeur.match(/^var\(\s*(--[\w-]+)\s*\)$/)?.[1];
			const hexa = token ? palette[token] : r.valeur.match(/^#[0-9a-fA-F]{6}$/)?.[0];
			if (!hexa) illisibles.add(`${r.source} : couleur non résolue « ${r.valeur} »`);
			return hexa ? [hexa.toLowerCase()] : [];
		});
	};
	const surSaSurface = (el: Element, jusqua: Element | null) => {
		for (let x: Element | null = el; x && x !== jusqua; x = x.parentElement)
			if (surfaces.some((r) => vise(x!, r))) return true;
		return false;
	};
	const portentDuTexte = (el: Element) =>
		Array.from(el.childNodes).some(
			(n) => n.nodeType === Node.TEXT_NODE && /\S/.test(n.textContent ?? ''),
		);
	const decrireEl = (el: Element) =>
		`${el.tagName.toLowerCase()}${Array.from(el.classList, (c) => `.${c}`).join('')} ` +
		`« ${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)} »`;

	const panneaux = Array.from(doc.querySelectorAll('.v-texte'));
	const textes: TexteSurLeVerre[] = [];
	for (const panneau of panneaux) {
		const surface: SurfaceVerre = panneau.closest('.v-section--soft') ? 'vert' : 'défaut';
		// Le modèle ne connaît que deux fonds : celui de la page et le vert des sections.
		if (panneau.parentElement && surSaSurface(panneau.parentElement, doc.body))
			illisibles.add(`${decrireEl(panneau)} : panneau posé sur une autre surface`);
		for (const el of [panneau, ...Array.from(panneau.querySelectorAll('*'))]) {
			if (!portentDuTexte(el) || el.closest('svg')) continue;
			if (el !== panneau && surSaSurface(el, panneau)) continue;
			for (const couleur of new Set(couleursDe(el)))
				textes.push({ surface, couleur, ou: decrireEl(el) });
		}
	}
	return { panneaux, textes, illisibles: [...illisibles] };
}

/** Feuilles chargées par la vitrine, lues dans les imports de son entrée. */
const FEUILLES_DE_LA_VITRINE = [
	...readFileSync('src/vitrine.ts', 'utf8').matchAll(/^import\s+'\.\/styles\/([\w/-]+\.scss)'/gm),
].map((m) => m[1]);

describe('Texte sur le verre dépoli de la vitrine, en décembre (#785, critère 14)', () => {
	const p = PALETTES.defaut;
	const voiles = voilesDe(VITRINE_SCSS, p);
	const fonds: Record<SurfaceVerre, string | undefined> = {
		défaut: fondDePageDe(VITRINE_SCSS, p),
		vert: FOND_VERT_VITRINE?.toLowerCase(),
	};
	const lecture = textesSurLeVerre(
		new DOMParser().parseFromString(readFileSync('index.html', 'utf8'), 'text/html'),
		FEUILLES_DE_LA_VITRINE.flatMap((f) => declarations(f, readFileSync(`src/styles/${f}`, 'utf8'))),
		p,
	);
	const SURFACES_VERRE: SurfaceVerre[] = ['défaut', 'vert'];

	it('garde contre un test à vide : feuilles, voiles, fonds, panneaux et textes lus', () => {
		expect(FEUILLES_DE_LA_VITRINE).toContain('vitrine.scss');
		expect(FEUILLES_DE_LA_VITRINE).toContain('decor-saison.scss');
		expect(
			voiles.illisibles,
			'Voile de panneau que ce test ne sait pas lire : il attend ' +
				'`color-mix(in srgb, <token ou #rrggbb> N%, transparent)`.',
		).toEqual([]);
		for (const s of SURFACES_VERRE) {
			expect(voiles[s].length, `aucun voile lu pour les panneaux « ${s} »`).toBeGreaterThan(0);
			expect(fonds[s], `fond des panneaux « ${s} » non lu`).toMatch(HEXA);
			expect(
				lecture.panneaux.filter((el) => (el.closest('.v-section--soft') ? 'vert' : 'défaut') === s)
					.length,
				`aucun panneau .v-texte « ${s} » dans index.html`,
			).toBeGreaterThan(0);
			expect(
				lecture.textes.filter((t) => t.surface === s).length,
				`aucun texte lu dans les panneaux « ${s} »`,
			).toBeGreaterThan(0);
		}
		expect(
			lecture.illisibles,
			"La déduction des couleurs de texte a buté : un sélecteur ou une valeur qu'elle ne " +
				'sait pas évaluer pourrait cacher une couleur posée sur le verre.',
		).toEqual([]);
	});

	it('garde : la déduction retrouve les couleurs relevées à la main (--ink, --grey, --accent-dark)', () => {
		// Borne basse, pas la liste : une lecture qui perdrait des règles en silence échoue ici.
		const lues = [...new Set(lecture.textes.map((t) => t.couleur))];
		for (const token of ['--ink', '--grey', '--accent-dark'])
			expect(lues, `${token} (${p[token]}) n'est plus vu sur le verre`).toContain(p[token]);
	});

	it.each(SURFACES_VERRE)(
		'panneaux « %s » : chaque couleur de texte garde 4,5:1 au pire (flocon le plus foncé, sans le flou)',
		(surface) => {
			const fond = fonds[surface] ?? '';
			const couleurs = [
				...new Set(lecture.textes.filter((t) => t.surface === surface).map((t) => t.couleur)),
			];
			expect(couleurs.length).toBeGreaterThan(0);
			expect(voiles[surface].length).toBeGreaterThan(0);
			const echecs = couleurs.flatMap((couleur) =>
				voiles[surface].flatMap((voile) => {
					const pire = pireSousLeVerre(couleur, fond, voile, p);
					if (pire.r >= SEUIL_TEXTE_AA) return [];
					const ou = lecture.textes.find((t) => t.surface === surface && t.couleur === couleur)?.ou;
					return [
						`${couleur} (${ou}) : ${pire.r.toFixed(2)}:1 sur ${pire.compose}, ` +
							`${pire.quoi} sous le voile ${voile.source}`,
					];
				}),
			);
			expect(
				echecs,
				`Vitrine, panneaux « ${surface} » (fond ${fond}) : texte sous ${SEUIL_TEXTE_AA}:1 sur le ` +
					`verre au pire. Épaissir le voile dans vitrine.scss, sans compter sur le flou.`,
			).toEqual([]);
		},
	);

	it('une seule source pour le vert : le voile des sections vertes est le vert de leur ::before', () => {
		expect(voiles.vert.length).toBeGreaterThan(0);
		expect(
			vertsDivergents(VITRINE_SCSS, p),
			'Le voile des panneaux des sections vertes doit être le vert peint sous eux : un autre ' +
				'vert se verrait en rectangle, et le contraste mesuré ne serait plus le bon.',
		).toEqual([]);
	});

	it('écran seulement : aucune règle du verre hors de `@media screen`', () => {
		// Garde : les règles du verre sont bien lues, sinon « aucune hors écran » ne dit rien.
		expect(
			declarations('vitrine.scss', VITRINE_SCSS).filter(
				(d) =>
					d.selecteurs.some((s) => NOMME_UN_PANNEAU.test(s)) &&
					d.conditions.some((c) => /^@media\s+screen\b/.test(c)),
			).length,
		).toBeGreaterThan(0);
		expect(
			reglesDuVerreHorsEcran(VITRINE_SCSS),
			"Règle de panneau `.v-texte` hors de `@media screen` : le décor n'est jamais imprimé, " +
				"mais il reste dans le DOM, et ce panneau s'imprimerait.",
		).toEqual([]);
	});
});

describe("Le gate du verre de la vitrine voit ce qu'il doit voir (extraits fabriqués, #785)", () => {
	const p = PALETTES.defaut;
	const extrait = (voileFond: string, voileVert: string, vertDessous = '#c7e2ce') => `
body.vitrine { background: var(--page-bg); }
.v-section--soft::before { content: ''; background: ${vertDessous}; }
@media screen {
	body.vitrine:has(.decor-saison) .v-texte { background: color-mix(in srgb, ${voileFond}, transparent); }
	body.vitrine:has(.decor-saison) .v-section--soft .v-texte { background: color-mix(in srgb, ${voileVert}, transparent); }
}`;

	it('un voile à 50 % sur le fond de page laisse --grey sous 4,5:1', () => {
		const scss = extrait('var(--page-bg) 50%', '#c7e2ce 75%');
		const [voile] = voilesDe(scss, p).défaut;
		expect(voile).toEqual(expect.objectContaining({ couleur: p['--page-bg'], alpha: 0.5 }));
		const pire = pireSousLeVerre(p['--grey'], fondDePageDe(scss, p) ?? '', voile, p);
		expect(pire.r).toBeLessThan(SEUIL_TEXTE_AA);
	});

	it('un vert de voile différent de celui du ::before est signalé', () => {
		expect(vertsDivergents(extrait('var(--page-bg) 55%', '#c7e2ce 75%'), p)).toEqual([]);
		expect(vertsDivergents(extrait('var(--page-bg) 55%', '#c8e2ce 75%'), p)).toHaveLength(1);
	});

	it('une règle du verre hors de `@media screen` est signalée, une remise à `none` non', () => {
		const regle =
			'body.vitrine:has(.decor-saison) .v-texte { background: color-mix(in srgb, var(--page-bg) 55%, transparent); }';
		expect(reglesDuVerreHorsEcran(`@media screen { ${regle} }`)).toEqual([]);
		expect(reglesDuVerreHorsEcran(`@media screen and (min-width: 768px) { ${regle} }`)).toEqual([]);
		expect(reglesDuVerreHorsEcran(regle)).toHaveLength(1);
		expect(reglesDuVerreHorsEcran(`@media print { ${regle} }`)).toHaveLength(1);
		expect(
			reglesDuVerreHorsEcran(
				'@media (forced-colors: active) { body.vitrine .v-texte { backdrop-filter: none; } }',
			),
		).toEqual([]);
	});

	it("la déduction voit une couleur qu'on ne lui a pas nommée, et écarte un bouton plein", () => {
		const doc = new DOMParser().parseFromString(
			`<body class="vitrine"><section class="v-section"><div class="v-texte">
				<p class="x">Texte <a href="#">lien sans règle</a></p>
				<a class="v-cta" href="#">Commencer</a>
			</div></section></body>`,
			'text/html',
		);
		const decls = declarations(
			'x.scss',
			'body { color: var(--ink); } .x { color: #999999; } ' +
				'.v-cta { background: var(--accent); color: var(--on-accent); }',
		);
		const { textes, illisibles } = textesSurLeVerre(doc, decls, p);
		expect(illisibles).toEqual([]);
		const lues = textes.map((t) => t.couleur);
		expect(lues).toEqual(expect.arrayContaining(['#999999', '#0000ee', '#551a8b']));
		expect(lues).not.toContain(p['--on-accent']);
		const [voile] = voilesDe(extrait('var(--page-bg) 55%', '#c7e2ce 75%'), p).défaut;
		expect(pireSousLeVerre('#999999', p['--page-bg'], voile, p).r).toBeLessThan(SEUIL_TEXTE_AA);
	});
});
