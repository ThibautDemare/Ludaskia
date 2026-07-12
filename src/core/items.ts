/* ============================================================
   Items {text, answer}  (@ = emplacement du champ de réponse)
   et fabrique de champs / grilles / fiches.
   ============================================================ */
import { escapeHTML, normalizeText } from './utils';
import { ttsAttr } from './tts-text';
import { stackFractions } from './fraction-text';
import { wrapGrandsNombres, parseNombreFr } from './nombres';
import { estSigneComparaison, paveSignesHTML } from './signes';
import type { ChoiceView } from './exercise';

/* Opération posée (#97) : décrite par ses opérandes et son opérateur ; le rendu
   (grille de colonnes, cellules de résultat, produits partiels) est calculé par
   posedGridHTML. `kind: 'posed'` est un item « conteneur » : renderItem le déploie
   en PLUSIEURS champs `.ans` (un par chiffre de résultat), corrigés indépendamment
   par verify(). Multiplicateur `b` à 2 chiffres → produits partiels. */
export interface PosedSpec {
	op: '+' | '-' | 'x';
	a: number;
	b: number;
}

export interface Item {
	text: string;
	answer: number | string;
	answers?: string[]; // formes équivalentes acceptées (exercices texte)
	kind?: 'num' | 'text' | 'posed' | 'heure'; // 'num' (calcul) ; 'text' (chaîne) ; 'posed' (grille) ; 'heure' (2 champs H h MM, #88)
	posed?: PosedSpec; // présent si kind === 'posed'
	figure?: string; // fragment SVG (moteur core/figures.ts), affiché au-dessus de la question (#88)
	parle?: string; // texte LU à voix haute si l'énoncé est télégraphique (#42 ; cf. tts-text)
	// QCM (#289) : choix conservés pour le rendu PAPIER en cases à cocher. À l'écran, le
	// QCM est joué par son runner interactif (qui lit l'Exercise, pas l'Item) ; ces champs
	// ne servent qu'au chemin fiche/bilan IMPRIMÉ. `choicesView` (vue riche) est aligné
	// par index sur `choices` (la valeur). Voir genLessonItem et renderItem.
	choices?: string[];
	choicesView?: ChoiceView[];
	_lesson?: string;
	// Journal d'erreurs (#391) : posé sur les cellules-CHIFFRES du RÉSULTAT d'une
	// opération posée. Permet à session.verify d'agréger les cellules d'une même grille
	// en UNE entrée d'erreur (l'opération et son résultat attendu) plutôt qu'une par
	// chiffre. `groupe` identifie la grille (chaîne stable, sérialisable pour la reprise).
	posedResult?: { groupe: string; operation: string; attendue: string; pos: number };
}

/* Un item est-il un QCM ? (source unique #289 : rendu PAPIER en cases à cocher dans
   renderItem, et consigne d'action « Coche… » de la fiche/du bloc de bilan). */
export const estItemQcm = (it: Item): boolean => !!(it.choices && it.choices.length);

/* Enveloppe d'affichage d'une figure SVG (#88), placée AVANT la question.
   Centralisé ici pour que tous les rendus (fiche, QCM, sprint, révision)
   affichent la figure de la même façon — appelée par renderItem et par les
   runners « une question à la fois ». Le fragment SVG n'est PAS échappé. */
export function figureBlock(figure?: string): string {
	return figure ? `<div class="figure">${figure}</div>` : '';
}

/* Énoncé d'un item, échappé puis enrichi : GRAS léger via `**…**` (#199 : question
   finale d'un problème), fractions « num/den » rendues empilées (#200, barre
   horizontale attendue au CE2) et grands nombres groupés enveloppés en .bignum
   (#240, numération « millions » : tabular-nums + nowrap + clamp, rendu identique
   partout). On échappe d'abord (sécurité), donc les balises injectées ensuite sont
   sûres. Les transformations sont disjointes (fractions = « n/m » ; grands nombres =
   classes séparées par U+202F, caractère introduit seulement par formatNombre) :
   sans effet de bord ailleurs. */
export function enonceTexte(text: string): string {
	return wrapGrandsNombres(
		stackFractions(escapeHTML(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')),
	);
}

/* Un bouton-choix de QCM (#200), partagé par le runner leçon et le sprint.
   `value` est la VALEUR comparée (rendue échappée par défaut) ; si une `view` riche
   est fournie, on rend son HTML/SVG de confiance avec un `aria-label` verbal (le
   lecteur d'écran lit le libellé, jamais le balisage ni « num slash den »). */
export function choiceButtonHTML(value: string, index: number, view?: ChoiceView): string {
	const inner = view ? view.html : escapeHTML(value);
	const aria = view ? ` aria-label="${escapeHTML(view.label)}"` : '';
	return `<button class="sprint-choice" data-i="${index}"${aria}>${inner}</button>`;
}

/* Vérifie la réponse saisie pour un item, selon son type.
   - texte : normalizeText (trim + espaces internes réduits + NFC), accents/apostrophes
     exigés (formes alternatives via answers)
   - calcul : comparaison numérique (virgule tolérée comme séparateur décimal) */
export function checkItemAnswer(it: Item, raw: string): boolean {
	// 'heure' (#88) : saisie en 2 champs, déjà fusionnée en « H h MM » par l'appelant
	// (session.verify) ; on la compare comme du texte (forme canonique + variantes).
	if (it.kind === 'text' || it.kind === 'heure') {
		const v = normalizeText(raw);
		if (v === normalizeText(String(it.answer))) return true;
		return (it.answers ?? []).some((a) => normalizeText(a) === v);
	}
	// Comparaison numérique tolérante (via parseNombreFr) appliquée SYMÉTRIQUEMENT à la
	// saisie ET à la réponse stockée : neutralise les séparateurs de milliers d'un grand
	// nombre recopié (« 1 002 050 », #240) et accepte la virgule décimale des deux côtés —
	// une réponse stockée en virgule (« 4,56 », conversions décimales #248) se valide, et
	// « 4,50 » == « 4,5 » découle de l'égalité numérique.
	return parseNombreFr(raw) === parseNombreFr(String(it.answer));
}

export function add(a: number, b: number): Item {
	return { text: `${a} + ${b} = @`, answer: a + b };
}
export function sub(a: number, b: number): Item {
	return { text: `${a} - ${b} = @`, answer: a - b };
}
export function mul(a: number, b: number): Item {
	return { text: `${a} × ${b} = @`, answer: a * b };
}
export function div(a: number, b: number): Item {
	// Division EXACTE (quotient entier) du calcul mental : l'appelant garantit que
	// `a` est un multiple de `b` (jamais de reste ni de virgule au CM1, cf. ÷10/÷100).
	return { text: `${a} ÷ ${b} = @`, answer: a / b };
}
export function dbl(n: number): Item {
	return { text: `double de ${n} = @`, answer: 2 * n };
}
export function half(n: number): Item {
	// « La moitié de » (article) : aligné sur la leçon « Division par le sens » (#104).
	return { text: `La moitié de ${n} = @`, answer: n / 2 };
}
export function comp(a: number, total: number): Item {
	return { text: `${a} + @ = ${total}`, answer: total - a };
}
export function facteur(a: number, total: number): Item {
	return { text: `${a} × @ = ${total}`, answer: total / a };
}

/* Contexte de rendu (#352) : regroupe l'état AUTREFOIS porté par des variables de
   module (compteur d'id, table id→Item, leçon courante, modes impression/corrigé).
   Il est passé EXPLICITEMENT aux fonctions de rendu (renderItem, gridHTML,
   posedGridHTML) — plus d'état global implicite, donc plus de fuite entre tests ni
   de chemins d'écriture parallèles. Chaque rendu possède le sien : buildPrintableDOM
   crée un contexte d'impression frais, le lancement d'une session interactive crée
   le sien (conservé côté UI pour la correction/reprise). */
export interface RenderContext {
	// Prochain id de champ (« a0 », « a1 »…), incrémenté par nextInputId au fil du rendu.
	counter: number;
	// Items {text, answer} rendus, par id de champ : sert à corriger la saisie (scoring)
	// et à reconstruire « mes erreurs » en révision. Rempli pendant le rendu.
	items: Record<string, Item>;
	// Leçon en cours de rendu (attribut data-lesson des champs, agrégat de stats par
	// leçon), ou null si les champs ne sont rattachés à aucune leçon.
	lessonId: string | null;
	// Mode IMPRESSION (#289) : QCM rendus en cases à cocher, zone-réponse garantie pour
	// tout item. À l'écran (false), sprint et bilan interactif sont inchangés.
	printMode: boolean;
	// Mode CORRIGÉ (#41) : sous-mode d'impression qui RÉVÈLE les réponses (ligne remplie,
	// case cochée ☑, cellules posées complétées). N'a d'effet que si printMode est actif.
	corrigeMode: boolean;
}

/* Crée un contexte de rendu neuf. Sans argument : session interactive à l'écran
   (compteur à 0, table vide, hors impression). `init` surcharge à la création
   (ex. { printMode: true } pour l'impression, { items, counter } pour une reprise). */
export function createRenderContext(init: Partial<RenderContext> = {}): RenderContext {
	return { counter: 0, items: {}, lessonId: null, printMode: false, corrigeMode: false, ...init };
}

// Id de champ unique dans le contexte (« a0 », « a1 »…).
export const nextInputId = (ctx: RenderContext) => 'a' + ctx.counter++;
// Attribut data-lesson, ou rien si le champ n'est rattaché à aucune leçon.
export const lessonAttr = (ctx: RenderContext) =>
	ctx.lessonId != null ? ` data-lesson="${ctx.lessonId}"` : '';

/* Rend un fragment en rattachant ses champs à `lessonId` (attribut data-lesson), puis
   détache — sans toucher au compteur d'id ni à la table `items`, qui persistent pour
   garder des ids uniques dans un document multi-bloc. Centralise le motif tag→rendu→
   détache partagé par les bilans et les fiches (#352) ; le try/finally garantit le
   détachement même si le rendu lève. */
export function withLessonId<T>(ctx: RenderContext, lessonId: string, render: () => T): T {
	ctx.lessonId = lessonId;
	try {
		return render();
	} finally {
		ctx.lessonId = null;
	}
}

/* Attributs des champs de réponse TEXTE (conjugaison, etc.) — issues #67/#123/#139.
   Sur tablette, la barre de suggestions prédictive des claviers (Gboard, Samsung,
   iOS…) ignore autocomplete/autocorrect/spellcheck et « souffle » la bonne forme.
   Parade : on rend le champ en `type="password"` (aucun clavier ne propose de
   suggestion sur un password), MAIS on le démasque en `type="text"` dès l'insertion
   via `data-unmask` (cf. `ui/anti-suggestion.ts`). Né password puis basculé en texte
   AVANT tout focus, Android le traite en « mot de passe visible » (textVisiblePassword) :
   le texte saisi reste lisible ET le clavier ne propose toujours pas de suggestions.
   (`-webkit-text-security: none` ne démasque PAS un vrai password — vérifié Chrome/FF.)
   N'affecte QUE le texte ; la saisie numérique du calcul garde `type` texte +
   `inputmode="numeric"`. La valeur saisie (`input.value`) demeure le texte tapé →
   correction (`checkItemAnswer`) inchangée. */
export const TEXT_ANSWER_INPUT_ATTRS =
	'type="password" data-unmask autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"';

/* Rendu PAPIER d'un QCM (#289) : la question, puis chaque choix précédé d'une case à
   cocher ☐. Le libellé est le texte échappé, ou la vue riche `choicesView` de confiance
   (fraction empilée, terminaison surlignée, image de symétrie), alignée par index. La
   consigne d'action « Coche… » est portée par la fiche / le bloc de bilan, pas répétée
   ici. Réservé à l'impression : à l'écran, le QCM est joué par son runner interactif. */
function qcmCheckboxHTML(it: Item, ctx: RenderContext): string {
	const answer = String(it.answer);
	const lis = (it.choices ?? [])
		.map((c, i) => {
			const view = it.choicesView?.[i];
			const label = view ? view.html : escapeHTML(c);
			const aria = view ? ` aria-label="${escapeHTML(view.label)}"` : '';
			// Corrigé (#41) : la case du bon choix est cochée ☑ et le libellé mis en gras
			// (le ✓ ET la graisse — deux indices, pas la couleur seule). `answer` est
			// toujours l'une des valeurs de `choices` (par construction du générateur).
			const correct = ctx.corrigeMode && c === answer;
			const liCls = correct ? 'qcm-print-choice qcm-print-choice--correct' : 'qcm-print-choice';
			const boxCls = correct ? 'qcm-print-box qcm-print-box--checked' : 'qcm-print-box';
			return `<li class="${liCls}"><span class="${boxCls}" aria-hidden="true"></span><span class="qcm-print-label"${aria}>${label}</span></li>`;
		})
		.join('');
	// Le `@` (emplacement de la réponse dans les QCM à trou : homophones, m/b/p…) ne doit
	// pas s'imprimer tel quel — incompris d'un enfant. On le rend par un rectangle vide
	// qui matérialise « le mot/la lettre va ici » (#41 suivi de #289).
	const question = enonceTexte(it.text).replace(
		'@',
		'<span class="cloze-box" aria-hidden="true"></span>',
	);
	return `${figureBlock(it.figure)}<p class="qcm-print-q">${question}</p><ul class="qcm-print-choices">${lis}</ul>`;
}

export function renderItem(it: Item, ctx: RenderContext, extra = '') {
	// Opération posée : déployée en grille de colonnes (plusieurs champs .ans).
	if (it.kind === 'posed' && it.posed) return posedGridHTML(it.posed, ctx);
	// QCM imprimable (#289) : un item porteur de `choices` (sa question n'a pas de `@`)
	// est rendu en cases à cocher, UNIQUEMENT en impression. À l'écran, ce chemin
	// (fiche/bilan interactif) laisse le QCM sans champ de saisie — limite préexistante,
	// hors périmètre #289 (le QCM interactif vit dans son propre runner, pas ici).
	if (ctx.printMode && estItemQcm(it)) return qcmCheckboxHTML(it, ctx);
	const id = nextInputId(ctx);
	ctx.items[id] = it;
	// Réponse exposée pour la révélation après correction (échappée pour les attributs).
	const ansAttr = String(it.answer).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
	// Saisie de l'heure (#88) : DEUX champs « [heures] h [minutes] », le « h » en dur.
	// Seul le champ des heures est `.ans` (noté) et porte la réponse canonique ; il
	// référence le champ des minutes (`data-min-field`) que session.verify fusionne en
	// « H h MM » avant correction → checkItemAnswer inchangé (comparaison texte).
	if (it.kind === 'heure') {
		// Corrigé (#41) : l'heure complète révélée à la place des deux champs « h ».
		if (ctx.corrigeMode) {
			const rev = `<span class="ans-corrige">${escapeHTML(String(it.answer))}</span>`;
			return figureBlock(it.figure) + enonceTexte(it.text).replace('@', rev);
		}
		const mid = nextInputId(ctx);
		const group =
			`<span class="heure-input">` +
			`<input class="ans heure-h ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr(ctx)} data-min-field="${mid}" inputmode="numeric" autocomplete="off" maxlength="2" aria-label="heures">` +
			`<span class="heure-sep" aria-hidden="true">h</span>` +
			`<input class="heure-min" id="${mid}" inputmode="numeric" autocomplete="off" maxlength="2" aria-label="minutes">` +
			`</span><span class="mark" data-for="${id}"></span>`;
		return figureBlock(it.figure) + enonceTexte(it.text).replace('@', group);
	}
	const texte = enonceTexte(it.text);
	// Fraction à trou (#247) : un « @ » AU NUMÉRATEUR d'une fraction (« @/10 » / « @/100 »)
	// se rend EMPILÉ — homogène avec les fractions montrées de l'énoncé (déjà empilées par
	// `stackFractions`). À l'écran : un champ noté (`.ans` + `.frac-num-input`) DANS le
	// numérateur (réponse = UN chiffre, dixième/centième) + la marque ✓/✗ après la fraction.
	// À l'impression : une case vide `.cloze-box` (comme les QCM imprimés) — ou le chiffre
	// révélé en corrigé —, pour rester cohérent avec le terme voisin empilé. Seule la
	// décomposition décimale (#247) produit ce motif ; le trou de la partie entière
	// (« @ + … », sans « / ») passe par le champ générique ci-dessous.
	const fracTrou = texte.match(/@\/(\d+)/);
	if (fracTrou) {
		let numHTML: string;
		let markHTML = '';
		if (ctx.corrigeMode) {
			numHTML = `<span class="ans-corrige">${escapeHTML(String(it.answer))}</span>`;
		} else if (ctx.printMode) {
			numHTML = `<span class="cloze-box" aria-hidden="true"></span>`;
		} else {
			numHTML =
				`<input class="ans frac-num-input ${extra}" id="${id}" data-answer="${ansAttr}"` +
				`${lessonAttr(ctx)} inputmode="numeric" maxlength="1" autocomplete="off" aria-label="chiffre manquant">`;
			markHTML = `<span class="mark" data-for="${id}"></span>`;
		}
		const fracHTML =
			`<span class="frac"><span class="frac-num">${numHTML}</span>` +
			`<span class="frac-den">${fracTrou[1]}</span></span>${markHTML}`;
		return figureBlock(it.figure) + texte.replace(/@\/\d+/, fracHTML);
	}
	// Corrigé (#41) : la réponse écrite sur la ligne, à la place du champ vide. Pas de
	// classe `.ans` (que l'impression rend transparente pour cacher la saisie) — on
	// utilise `.ans-corrige`, visible. Pas de `mark` (le corrigé n'est pas corrigé).
	// Champ « grand nombre » : une réponse numérique à ≥ 5 chiffres (encadrement au
	// million, « combien en tout », décomposition #240) déborde du champ standard (58px)
	// → variante `.ans-grand` plus large, à chiffres tabulaires.
	// `parseNombreFr` (et non `Number` brut) pour rester cohérent avec une réponse stockée en
	// virgule : « 12345,67 » → 12345.67 (et non NaN), donc correctement classé « grand ». Sans
	// effet sur les leçons actuelles (aucun décimal ≥ 10 000), mais évite un piège futur.
	const valeurNum = parseNombreFr(String(it.answer));
	const grand =
		it.kind !== 'text' && Number.isFinite(valeurNum) && Math.abs(valeurNum) >= 10000
			? ' ans-grand'
			: '';
	// Réponse = signe de comparaison (#380) : champ dédié `.ans-signe`, SANS clavier
	// virtuel (`inputmode="none"` — le pavé de boutons le remplace au doigt ; la frappe
	// au clavier PHYSIQUE reste possible, inputmode n'affecte pas le desktop). Pas
	// d'attributs anti-suggestion (#139) : rien à « souffler » pour un signe. Le pavé
	// est ajouté APRÈS l'énoncé (sa propre rangée), jamais à l'impression.
	const signe = it.kind === 'text' && estSigneComparaison(it.answer);
	// Réponse DÉCIMALE (virgule dans la valeur stockée, ex. « 4,56 » : conversions #248) →
	// clavier `decimal` (qui propose la virgule/point) plutôt que `numeric` (chiffres seuls,
	// pas de virgule sur mobile). N'affecte que les champs numériques dont la réponse a une
	// virgule ; les entiers gardent `numeric`.
	const inputMode = String(it.answer).includes(',') ? 'decimal' : 'numeric';
	const field = ctx.corrigeMode
		? `<span class="ans-corrige ${extra}">${escapeHTML(String(it.answer))}</span>`
		: signe
			? `<input class="ans ans-signe ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr(ctx)} type="text" inputmode="none" autocomplete="off" spellcheck="false" maxlength="1" aria-label="signe de comparaison"><span class="mark" data-for="${id}"></span>`
			: it.kind === 'text'
				? `<input class="ans ans-text ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr(ctx)} ${TEXT_ANSWER_INPUT_ATTRS}><span class="mark" data-for="${id}"></span>`
				: `<input class="ans${grand} ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr(ctx)} inputmode="${inputMode}" autocomplete="off"><span class="mark" data-for="${id}"></span>`;
	// Zone-réponse garantie à l'impression (#289) : un item sans `@` (ni posé, ni QCM)
	// ne doit jamais s'imprimer « en l'air » → on ajoute une ligne d'écriture finale.
	const place = texte.includes('@') ? texte : ctx.printMode ? `${texte} @` : texte;
	const pave = signe && !ctx.printMode && !ctx.corrigeMode ? paveSignesHTML(id) : '';
	return figureBlock(it.figure) + place.replace('@', field) + pave;
}
export function gridHTML(items: Item[], cols: number, ctx: RenderContext) {
	const cls = cols === 3 ? 'c3' : 'c4';
	return `<div class="grid ${cls}">${items.map((it) => `<div class="op">${renderItem(it, ctx)}</div>`).join('')}</div>`;
}

/* Grille d'une opération posée (#97) : grille CSS de C+1 colonnes (1 pour le signe
   + C colonnes de chiffres alignées à droite). Les chiffres du résultat (et des
   produits partiels en ×2 chiffres) sont des champs `.ans` NOTÉS un par un ; une
   rangée de retenues `.ans-free` (non notée) sert d'aide visible. verify() corrige
   chaque cellule via son data-answer ; un sans-faute = toutes les cellules justes. */
function posedGridHTML(spec: PosedSpec, ctx: RenderContext): string {
	const { op, a, b } = spec;
	const result = op === '+' ? a + b : op === '-' ? a - b : a * b;
	const sign = op === '+' ? '+' : op === '-' ? '−' : '×';
	const digits = (n: number) => String(n).split('');
	// Journal d'erreurs (#391) : descripteur partagé par les cellules-chiffres du RÉSULTAT
	// (agrégées en UNE entrée par opération dans session.verify, cf. erreur-representation).
	// `groupe` = id unique de la grille dans le contexte (compteur figé AVANT tout champ,
	// donc stable pour la reprise) ; `pos` = rang du chiffre dans le résultat.
	const groupe = 'posee-' + ctx.counter;
	const operation = `${a} ${sign} ${b}`;
	const attendue = String(result);

	const empty = () => `<span class="posee-cell"></span>`;
	const opCell = (s: string) => `<span class="posee-cell posee-op">${s}</span>`;
	const digitCell = (d: string) => `<span class="posee-cell posee-digit">${d}</span>`;
	// Zéro FOURNI (grisé, non saisi) du 2ᵉ produit partiel : on multiplie par les
	// dizaines, donc le produit se termine par 0 — ce 0 explique le décalage et
	// réaligne la ligne sous la somme (#154, avis pedagogue-primaire).
	const zeroCell = () =>
		`<span class="posee-cell posee-digit posee-zero" aria-label="zéro du décalage">0</span>`;
	const carryCell = () =>
		`<input class="ans-free posee-cell posee-carry" maxlength="1" inputmode="numeric" autocomplete="off" aria-label="retenue">`;
	const inputCell = (d: string, posed?: Item['posedResult']) => {
		// Corrigé (#41) : le chiffre du résultat révélé dans la cellule (au lieu du champ).
		if (ctx.corrigeMode) return `<span class="posee-cell posee-input posee-corrige">${d}</span>`;
		const id = nextInputId(ctx);
		const item: Item = { text: '', answer: Number(d), kind: 'num' };
		if (posed) item.posedResult = posed; // seules les cellules du RÉSULTAT sont taguées (#391)
		ctx.items[id] = item;
		return `<input class="ans posee-cell posee-input" id="${id}" data-answer="${d}"${lessonAttr(ctx)} maxlength="1" inputmode="numeric" autocomplete="off" aria-label="chiffre du résultat">`;
	};
	// Cellule d'un chiffre du RÉSULTAT : porte le descripteur d'agrégation (#391).
	const resultCell = (d: string, pos: number) => inputCell(d, { groupe, operation, attendue, pos });

	// Une rangée = signe (ou vide) + C cellules alignées à droite, décalées de `shift`.
	const rule = (C: number) => `<span class="posee-rule" style="grid-column: 1 / ${C + 2}"></span>`;
	const row = (C: number, signHTML: string, cells: string[], shift = 0): string => {
		const slots = Array.from({ length: C }, empty);
		const start = C - shift - cells.length;
		for (let i = 0; i < cells.length; i++) slots[start + i] = cells[i];
		return signHTML + slots.join('');
	};

	const C =
		op === 'x' && b >= 10
			? digits(result).length
			: Math.max(digits(a).length, digits(b).length, digits(result).length);

	const parts: string[] = [];
	if (op === 'x' && b >= 10) {
		// Multiplication à 2 chiffres : deux produits partiels + addition finale.
		// Retenues des produits partiels « dans la tête » (multiplicateurs doux, cf.
		// posee.ts) ; SEULE l'addition finale, qui est une vraie addition à retenues,
		// reçoit une rangée d'aide (#154, avis pédagogique). Cette rangée est posée
		// AU-DESSUS des produits partiels — les opérandes de cette addition —, conforme
		// à la convention « retenues au-dessus des nombres qu'on additionne » ; un
		// marqueur « + » devant le 2ᵉ produit partiel signale l'addition (#300/#307).
		const pp1 = a * (b % 10);
		const pp2 = a * Math.floor(b / 10);
		parts.push(row(C, empty(), digits(a).map(digitCell)));
		parts.push(row(C, opCell(sign), digits(b).map(digitCell)));
		parts.push(rule(C));
		// Retenues de l'addition finale, au-dessus de ses opérandes (les produits partiels).
		parts.push(row(C, empty(), Array.from({ length: C }, carryCell)));
		// Produits partiels : cellules NOTÉES mais NON taguées (#391) — seul le résultat final
		// est agrégé en erreur (« dont le résultat est faux »).
		parts.push(
			row(
				C,
				empty(),
				digits(pp1).map((d) => inputCell(d)),
			),
		);
		// 2ᵉ produit partiel suivi de son 0 fourni (× dizaines) : le décalage est
		// porté par ce 0, plus besoin de `shift` spatial → la ligne s'aligne sur la somme.
		// Le « + » marque l'addition des deux produits partiels.
		parts.push(row(C, opCell('+'), [...digits(pp2).map((d) => inputCell(d)), zeroCell()]));
		parts.push(rule(C));
		parts.push(row(C, empty(), digits(result).map(resultCell)));
	} else {
		// Addition, soustraction, multiplication ×1 chiffre.
		parts.push(row(C, empty(), Array.from({ length: C }, carryCell))); // retenues (aide)
		parts.push(row(C, empty(), digits(a).map(digitCell)));
		parts.push(row(C, opCell(sign), digits(b).map(digitCell)));
		parts.push(rule(C));
		parts.push(row(C, empty(), digits(result).map(resultCell)));
	}
	return `<div class="posee" style="grid-template-columns: repeat(${C + 1}, var(--posee-col, 2.1rem))">${parts.join('')}</div>`;
}
/* L'en-tête de fiche : le champ "Temps : ___ min" est print-only */
export function ficheHTML(
	num: number,
	titre: string,
	sous: string,
	consigne: string,
	inner: string,
) {
	return `<div class="fiche">
    <div class="fiche-head">
      <p class="fiche-title">MENTAL ${num} — ${titre}</p>
      <span class="temps print-only">Temps : ______ min</span>
    </div>
    <p class="fiche-sub">${sous}</p>
    <p class="consigne-line"${ttsAttr(consigne)}>${consigne}</p>
    ${inner}
  </div>`;
}
/* En-tête de fiche générique (sans préfixe « MENTAL ») pour les matières
   autres que le calcul mental. */
export function ficheHTMLGeneric(titre: string, sous: string, consigne: string, inner: string) {
	return `<div class="fiche">
    <div class="fiche-head">
      <p class="fiche-title">${titre}</p>
      <span class="temps print-only">Temps : ______ min</span>
    </div>
    ${sous ? `<p class="fiche-sub">${sous}</p>` : ''}
    <p class="consigne-line"${ttsAttr(consigne)}>${consigne}</p>
    ${inner}
  </div>`;
}
