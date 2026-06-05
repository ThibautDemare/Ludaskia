/* ============================================================
   Items {text, answer}  (@ = emplacement du champ de réponse)
   et fabrique de champs / grilles / fiches.
   ============================================================ */
import { escapeHTML } from './utils';

export interface Item {
  text: string;
  answer: number;
  _lesson?: number;
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
let renderLesson: number | null = null;
export const getRenderLesson = () => renderLesson;
export const setRenderLesson = (v: number | null) => {
  renderLesson = v;
};
// Attribut data-lesson, ou rien si on ne rattache pas le champ à une leçon.
export const lessonAttr = () => (renderLesson != null ? ` data-lesson="${renderLesson}"` : '');

export function renderItem(it: Item, extra = '') {
  const id = nextInputId();
  sessionItems[id] = it;
  const field = `<input class="ans ${extra}" id="${id}" data-answer="${it.answer}"${lessonAttr()} inputmode="numeric" autocomplete="off"><span class="mark" data-for="${id}"></span>`;
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
