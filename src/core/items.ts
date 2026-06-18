/* ============================================================
   Items {text, answer}  (@ = emplacement du champ de réponse)
   et fabrique de champs / grilles / fiches.
   ============================================================ */
import { escapeHTML, normalizeText } from './utils';
import { ttsAttr } from './tts-text';
import { stackFractions } from './fraction-text';
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
	_lesson?: string;
}

/* Enveloppe d'affichage d'une figure SVG (#88), placée AVANT la question.
   Centralisé ici pour que tous les rendus (fiche, QCM, sprint, révision)
   affichent la figure de la même façon — appelée par renderItem et par les
   runners « une question à la fois ». Le fragment SVG n'est PAS échappé. */
export function figureBlock(figure?: string): string {
	return figure ? `<div class="figure">${figure}</div>` : '';
}

/* Énoncé d'un item, échappé puis enrichi : GRAS léger via `**…**` (#199 : question
   finale d'un problème) et fractions « num/den » rendues empilées (#200, barre
   horizontale attendue au CE2). On échappe d'abord (sécurité), donc les balises
   injectées ensuite sont sûres. Seuls les énoncés de fractions contiennent « n/m »
   à l'exécution : transformation sans effet de bord ailleurs. */
export function enonceTexte(text: string): string {
	return stackFractions(escapeHTML(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
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
	return Number(raw.replace(',', '.')) === Number(it.answer);
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

// État partagé de génération. En modules ES, les bindings importés ne sont
// pas réassignables depuis l'extérieur : on expose des accesseurs dédiés.
let inputCounter = 0;
export const getInputCounter = () => inputCounter;
export const setInputCounter = (v: number) => {
	inputCounter = v;
};
export const nextInputId = () => 'a' + inputCounter++;
// Mémorise les items {text, answer} de la session courante, par id de champ,
// pour pouvoir reconstruire « mes erreurs » lors d'une révision.
let sessionItems: Record<string, Item> = {};
export const getSessionItems = () => sessionItems;
export const setSessionItems = (v: Record<string, Item>) => {
	sessionItems = v;
};
// Numéro de la leçon en cours de génération (pour taguer les champs et
// agréger les stats par leçon, y compris dans les bilans). null = non rattaché.
let renderLesson: string | null = null;
export const getRenderLesson = () => renderLesson;
export const setRenderLesson = (v: string | null) => {
	renderLesson = v;
};
// Attribut data-lesson, ou rien si on ne rattache pas le champ à une leçon.
export const lessonAttr = () => (renderLesson != null ? ` data-lesson="${renderLesson}"` : '');

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

export function renderItem(it: Item, extra = '') {
	// Opération posée : déployée en grille de colonnes (plusieurs champs .ans).
	if (it.kind === 'posed' && it.posed) return posedGridHTML(it.posed);
	const id = nextInputId();
	sessionItems[id] = it;
	// Réponse exposée pour la révélation après correction (échappée pour les attributs).
	const ansAttr = String(it.answer).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
	// Saisie de l'heure (#88) : DEUX champs « [heures] h [minutes] », le « h » en dur.
	// Seul le champ des heures est `.ans` (noté) et porte la réponse canonique ; il
	// référence le champ des minutes (`data-min-field`) que session.verify fusionne en
	// « H h MM » avant correction → checkItemAnswer inchangé (comparaison texte).
	if (it.kind === 'heure') {
		const mid = nextInputId();
		const group =
			`<span class="heure-input">` +
			`<input class="ans heure-h ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr()} data-min-field="${mid}" inputmode="numeric" autocomplete="off" maxlength="2" aria-label="heures">` +
			`<span class="heure-sep" aria-hidden="true">h</span>` +
			`<input class="heure-min" id="${mid}" inputmode="numeric" autocomplete="off" maxlength="2" aria-label="minutes">` +
			`</span><span class="mark" data-for="${id}"></span>`;
		return figureBlock(it.figure) + enonceTexte(it.text).replace('@', group);
	}
	const field =
		it.kind === 'text'
			? `<input class="ans ans-text ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr()} ${TEXT_ANSWER_INPUT_ATTRS}><span class="mark" data-for="${id}"></span>`
			: `<input class="ans ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr()} inputmode="numeric" autocomplete="off"><span class="mark" data-for="${id}"></span>`;
	return figureBlock(it.figure) + enonceTexte(it.text).replace('@', field);
}
export function gridHTML(items: Item[], cols: number) {
	const cls = cols === 3 ? 'c3' : 'c4';
	return `<div class="grid ${cls}">${items.map((it) => `<div class="op">${renderItem(it)}</div>`).join('')}</div>`;
}

/* Grille d'une opération posée (#97) : grille CSS de C+1 colonnes (1 pour le signe
   + C colonnes de chiffres alignées à droite). Les chiffres du résultat (et des
   produits partiels en ×2 chiffres) sont des champs `.ans` NOTÉS un par un ; une
   rangée de retenues `.ans-free` (non notée) sert d'aide visible. verify() corrige
   chaque cellule via son data-answer ; un sans-faute = toutes les cellules justes. */
function posedGridHTML(spec: PosedSpec): string {
	const { op, a, b } = spec;
	const result = op === '+' ? a + b : op === '-' ? a - b : a * b;
	const sign = op === '+' ? '+' : op === '-' ? '−' : '×';
	const digits = (n: number) => String(n).split('');

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
	const inputCell = (d: string) => {
		const id = nextInputId();
		sessionItems[id] = { text: '', answer: Number(d), kind: 'num' };
		return `<input class="ans posee-cell posee-input" id="${id}" data-answer="${d}"${lessonAttr()} maxlength="1" inputmode="numeric" autocomplete="off" aria-label="chiffre du résultat">`;
	};

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
		// Multiplication à 2 chiffres : deux produits partiels + somme finale.
		// Retenues des produits partiels « dans la tête » (multiplicateurs doux, cf.
		// posee.ts) ; SEULE l'addition finale, qui est une vraie addition à retenues,
		// reçoit une rangée d'aide — comme l'addition posée (#154, avis pédagogique).
		const pp1 = a * (b % 10);
		const pp2 = a * Math.floor(b / 10);
		parts.push(row(C, empty(), digits(a).map(digitCell)));
		parts.push(row(C, opCell(sign), digits(b).map(digitCell)));
		parts.push(rule(C));
		parts.push(row(C, empty(), digits(pp1).map(inputCell)));
		// 2ᵉ produit partiel suivi de son 0 fourni (× dizaines) : le décalage est
		// porté par ce 0, plus besoin de `shift` spatial → la ligne s'aligne sur la somme.
		parts.push(row(C, empty(), [...digits(pp2).map(inputCell), zeroCell()]));
		parts.push(rule(C));
		parts.push(row(C, empty(), Array.from({ length: C }, carryCell))); // retenues de la somme
		parts.push(row(C, empty(), digits(result).map(inputCell)));
	} else {
		// Addition, soustraction, multiplication ×1 chiffre.
		parts.push(row(C, empty(), Array.from({ length: C }, carryCell))); // retenues (aide)
		parts.push(row(C, empty(), digits(a).map(digitCell)));
		parts.push(row(C, opCell(sign), digits(b).map(digitCell)));
		parts.push(rule(C));
		parts.push(row(C, empty(), digits(result).map(inputCell)));
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
