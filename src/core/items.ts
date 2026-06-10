/* ============================================================
   Items {text, answer}  (@ = emplacement du champ de réponse)
   et fabrique de champs / grilles / fiches.
   ============================================================ */
import { escapeHTML, normalizeText } from './utils';

export interface Item {
	text: string;
	answer: number | string;
	answers?: string[]; // formes équivalentes acceptées (exercices texte)
	kind?: 'num' | 'text'; // 'num' par défaut (calcul) ; 'text' = saisie libre corrigée par chaîne
	_lesson?: string;
}

/* Vérifie la réponse saisie pour un item, selon son type.
   - texte : normalizeText (trim + espaces internes réduits + NFC), accents/apostrophes
     exigés (formes alternatives via answers)
   - calcul : comparaison numérique (virgule tolérée comme séparateur décimal) */
export function checkItemAnswer(it: Item, raw: string): boolean {
	if (it.kind === 'text') {
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
	return { text: `moitié de ${n} = @`, answer: n / 2 };
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

export function renderItem(it: Item, extra = '') {
	const id = nextInputId();
	sessionItems[id] = it;
	// Réponse exposée pour la révélation après correction (échappée pour les attributs).
	const ansAttr = String(it.answer).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
	const field =
		it.kind === 'text'
			? `<input class="ans ans-text ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr()} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><span class="mark" data-for="${id}"></span>`
			: `<input class="ans ${extra}" id="${id}" data-answer="${ansAttr}"${lessonAttr()} inputmode="numeric" autocomplete="off"><span class="mark" data-for="${id}"></span>`;
	return escapeHTML(it.text).replace('@', field);
}
export function gridHTML(items: Item[], cols: number) {
	const cls = cols === 3 ? 'c3' : 'c4';
	return `<div class="grid ${cls}">${items.map((it) => `<div class="op">${renderItem(it)}</div>`).join('')}</div>`;
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
    <p class="consigne-line">${consigne}</p>
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
    <p class="consigne-line">${consigne}</p>
    ${inner}
  </div>`;
}
