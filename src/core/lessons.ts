/* ============================================================
   Les 15 leçons — chaque entrée est constructible isolément,
   ce qui permet de jouer une leçon seule OU le bilan complet.
   build() régénère des items frais à chaque appel.
   ============================================================ */
import { rnd, choice, sample, commKey, escapeHTML } from './utils';
import { uniqueComm, uniqueExact } from './utils';
import {
  add,
  sub,
  mul,
  dbl,
  half,
  comp,
  facteur,
  renderItem,
  gridHTML,
  ficheHTML,
  lessonAttr,
  setRenderLesson,
  setInputCounter,
  nextInputId,
  getSessionItems,
} from './items';
import type { Item } from './items';
// Import « tardif » (utilisé seulement dans des corps de fonction) du pipeline
// générique : dépendance circulaire build ↔ lessons sans effet de bord au chargement.
import { buildLessonFiche, bilanBlocksForIds } from './build';

export const LESSONS = [
  {
    num: 1,
    id: 'math-tables-addition',
    title: "Les tables d'addition",
    sub: 'Additionner deux nombres de 1 à 9.',
    consigne: 'Calcule chaque addition.',
    build() {
      const items = uniqueComm(() => {
        let a = rnd(2, 9),
          b = rnd(2, 9);
        [a, b] = [Math.min(a, b), Math.max(a, b)];
        return add(a, b);
      }, 12);
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 4));
    },
  },

  {
    num: 2,
    id: 'math-complements',
    title: 'Les compléments',
    sub: 'Trouver le nombre qui complète à 10 ou à 100.',
    consigne: 'Complète chaque égalité.',
    build() {
      const pool10 = [];
      for (let a = 1; a <= 9; a++) pool10.push(comp(a, 10));
      const pool100 = [10, 20, 30, 40, 50, 60, 70, 80, 90].map((a) => comp(a, 100));
      const items = sample([...sample(pool10, 6), ...sample(pool100, 6)], 12);
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3));
    },
  },

  {
    num: 3,
    id: 'math-doubles',
    title: 'Les doubles',
    sub: "Le double, c'est deux fois le nombre.",
    consigne: 'Écris le double.',
    build() {
      const items = sample(
        [...Array(39).keys()].map((i) => i + 1),
        12,
      ).map(dbl);
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3));
    },
  },

  {
    num: 4,
    id: 'math-moities',
    title: 'Les moitiés',
    sub: "La moitié, c'est le nombre partagé en deux.",
    consigne: 'Écris la moitié.',
    build() {
      const items = sample([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 30, 40, 50, 60, 80, 100], 12).map(
        half,
      );
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3));
    },
  },

  {
    num: 5,
    id: 'math-ajouter-9-19-29',
    title: 'Ajouter 9, 19, 29 / 8, 18, 28',
    sub: 'Astuce : +9 = +10 puis -1 · +8 = +10 puis -2.',
    consigne: "Calcule en utilisant l'astuce.",
    build() {
      const items = uniqueExact(() => add(rnd(20, 70), choice([8, 9, 18, 19, 28, 29])), 12);
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 4));
    },
  },

  {
    num: 6,
    id: 'math-soustraire-9-19-29',
    title: 'Soustraire 9, 19, 29, 39 et un petit nombre',
    sub: 'Astuce : -9 = -10 puis +1.',
    consigne: 'Calcule chaque soustraction.',
    build() {
      const items = uniqueExact(() => sub(rnd(40, 90), choice([9, 19, 29, 39])), 8).concat(
        uniqueExact(() => sub(rnd(11, 20), rnd(2, 8)), 4),
      );
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 4));
    },
  },

  {
    num: 7,
    id: 'math-tables-multiplication',
    title: 'Les tables de multiplication',
    sub: 'Tables de 2 à 9.',
    consigne: 'Calcule chaque produit.',
    build() {
      const items = uniqueComm(() => {
        let a = rnd(2, 9),
          b = rnd(2, 9);
        [a, b] = [Math.min(a, b), Math.max(a, b)];
        return mul(a, b);
      }, 12);
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 4));
    },
  },

  {
    num: 8,
    id: 'math-moitie-pair',
    title: "La moitié d'un nombre pair",
    sub: 'Je sépare les dizaines et les unités si besoin.',
    consigne: 'Écris la moitié.',
    build() {
      const items = sample([24, 36, 48, 52, 64, 28, 46, 82, 38, 56, 74, 98, 66, 84], 12).map(half);
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3));
    },
  },

  {
    num: 9,
    id: 'math-multiples-25',
    title: 'Les multiples de 25',
    sub: '25, 50, 75, 100... de 25 en 25.',
    consigne: 'Calcule.',
    build() {
      const items = sample([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 11).map((a) => mul(a, 25));
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3));
    },
  },

  {
    num: 10,
    id: 'math-decompo-60',
    title: 'Décompositions multiplicatives de 60',
    sub: 'Quel nombre multiplié donne 60 ?',
    consigne: 'Complète.',
    build() {
      const fac = [
        [2, 30],
        [3, 20],
        [4, 15],
        [5, 12],
        [6, 10],
        [12, 5],
        [15, 4],
        [20, 3],
        [10, 6],
        [30, 2],
        [60, 1],
        [1, 60],
      ];
      const items = sample(fac, 12).map(([a]) => facteur(a, 60));
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3));
    },
  },

  {
    num: 11,
    id: 'math-dizaines-centaines',
    title: 'Ajouter, soustraire des dizaines et des centaines',
    sub: "J'ajoute ou je retire des paquets entiers.",
    consigne: 'Calcule.',
    build() {
      const items = uniqueExact(() => {
        const a = rnd(120, 500),
          op = choice(['+', '-']),
          b = choice([10, 20, 30, 40, 50]);
        return op === '+' ? add(a, b) : sub(a, b);
      }, 6)
        // Soustraction : le premier nombre doit rester ≥ au second (pas de résultat négatif au CE2).
        .concat(
          uniqueExact(() => {
            const b = choice([100, 200, 300]),
              op = choice(['+', '-']);
            const a = op === '-' ? rnd(b + 20, 640) : rnd(150, 600);
            return op === '+' ? add(a, b) : sub(a, b);
          }, 6),
        );
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3));
    },
  },

  {
    num: 12,
    id: 'math-multiplier-10-100',
    title: 'Multiplier par 10, par 100',
    sub: "×10 j'ajoute un zéro · ×100 j'ajoute deux zéros.",
    consigne: 'Calcule.',
    build() {
      const items = sample(
        [...Array(98).keys()].map((i) => i + 2),
        6,
      )
        .map((a) => mul(a, 10))
        .concat(
          sample(
            [...Array(39).keys()].map((i) => i + 2),
            6,
          ).map((a) => mul(a, 100)),
        );
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3));
    },
  },

  {
    num: 13,
    id: 'math-multiplier-4-8',
    title: 'Multiplier par 4, par 8',
    sub: '×4 = double du double · ×8 = double du double du double.',
    consigne: 'Calcule.',
    build() {
      const items = sample(
        [...Array(23).keys()].map((i) => i + 3).filter((x) => x !== 8),
        6,
      )
        .map((a) => mul(a, 4))
        .concat(
          sample(
            [...Array(13).keys()].map((i) => i + 3).filter((x) => x !== 4),
            6,
          ).map((a) => mul(a, 8)),
        );
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3));
    },
  },

  {
    num: 14,
    id: 'math-multiplier-20-30-40',
    title: 'Multiplier par 20, 30, 40',
    sub: 'Astuce : je multiplie par le chiffre, puis par 10.',
    consigne: 'Calcule.',
    build() {
      const items = uniqueComm(() => mul(rnd(2, 12), choice([20, 30, 40])), 12);
      return ficheHTML(this.num, this.title, this.sub, this.consigne, gridHTML(items, 3));
    },
  },

  {
    num: 15,
    id: 'math-decomposer-multiplication',
    title: 'Décomposer pour calculer une multiplication',
    sub: 'Ex : 6 × 14 = (6×10) + (6×4) = 60 + 24 = 84.',
    consigne: 'Décompose puis calcule. Écris les étapes.',
    build() {
      const seen = new Set();
      const d = [];
      while (d.length < 6) {
        const a = rnd(3, 8),
          b = choice([12, 13, 14, 15, 16, 21, 23, 24]);
        const k = a + 'x' + b;
        if (!seen.has(k)) {
          seen.add(k);
          d.push([a, b]);
        }
      }
      const lines = d
        .map(([a, b]) => {
          const free = () => `<input class="ans-free" inputmode="numeric" autocomplete="off">`;
          const finalId = nextInputId();
          getSessionItems()[finalId] = { text: `${a} × ${b} = @`, answer: a * b };
          const finalField = `<input class="ans" id="${finalId}" data-answer="${a * b}"${lessonAttr()} inputmode="numeric" autocomplete="off"><span class="mark" data-for="${finalId}"></span>`;
          return `<div class="op">${a} × ${b} = (${free()} × ${free()}) + (${free()} × ${free()}) = ${free()} + ${free()} = ${finalField}</div>`;
        })
        .join('');
      return ficheHTML(
        this.num,
        this.title,
        this.sub,
        this.consigne,
        `<div class="deco">${lines}</div>`,
      );
    },
  },
];
export function buildFiches() {
  return LESSONS.map((l) => {
    setRenderLesson(l.id);
    const html = l.build();
    setRenderLesson(null);
    return html;
  });
}

/* ============================================================
   Bilans express (3 calculs par leçon)
   ============================================================ */
export const THEMES: Record<number, string> = {
  1: "Table d'addition",
  2: 'Complément à 10/100',
  3: 'Doubles',
  4: 'Moitiés',
  5: 'Ajouter 9, 19...',
  6: 'Soustraire 9, 19...',
  7: 'Table de ×',
  8: 'Moitié (pair)',
  9: 'Multiples de 25',
  10: 'Décompo. de 60',
  11: 'Dizaines/centaines',
  12: '× 10, × 100',
  13: '× 4, × 8',
  14: '× 20, 30, 40',
  15: 'Décomposer',
};
export function bilanQ(k: number): Item | undefined {
  switch (k) {
    case 1: {
      let a = rnd(2, 9),
        b = rnd(2, 9);
      [a, b] = [Math.min(a, b), Math.max(a, b)];
      return add(a, b);
    }
    case 2:
      return Math.random() < 0.5
        ? comp(rnd(1, 9), 10)
        : comp(choice([10, 20, 30, 40, 60, 70, 80, 90]), 100);
    case 3:
      return dbl(rnd(5, 35));
    case 4:
      return half(choice([8, 12, 16, 20, 30, 40, 50, 60, 80, 100]));
    case 5:
      return add(rnd(20, 60), choice([8, 9, 18, 19, 28, 29]));
    case 6:
      return sub(rnd(40, 85), choice([9, 19, 29, 39]));
    case 7: {
      let a = rnd(2, 9),
        b = rnd(2, 9);
      [a, b] = [Math.min(a, b), Math.max(a, b)];
      return mul(a, b);
    }
    case 8:
      return half(choice([24, 36, 48, 52, 64, 28, 46, 82, 56, 74, 66, 84]));
    case 9:
      return mul(rnd(2, 12), 25);
    case 10:
      return facteur(choice([2, 3, 4, 5, 6, 10, 12, 15, 20, 30]), 60);
    case 11: {
      const b = choice([10, 20, 30, 40, 100, 200, 300]),
        op = choice(['+', '-']);
      const a = op === '-' ? rnd(b + 20, 600) : rnd(120, 500);
      return op === '+' ? add(a, b) : sub(a, b);
    }
    case 12:
      return mul(rnd(2, 40), choice([10, 100]));
    case 13:
      return mul(rnd(3, 15), choice([4, 8]));
    case 14:
      return mul(rnd(2, 12), choice([20, 30, 40]));
    case 15:
      return mul(rnd(3, 8), choice([12, 13, 14, 15, 16, 21, 23, 24]));
  }
}
export function bilanBlocks(nbQ: number) {
  const blocks: { num: number; id: string; theme: string; ops: Item[] }[] = [];
  for (const lesson of LESSONS) {
    const k: string[] = [],
      ops: Item[] = [];
    let t = 0;
    while (ops.length < nbQ && t < 300) {
      const o = bilanQ(lesson.num)!,
        key = commKey(o.text);
      if (!k.includes(key)) {
        k.push(key);
        ops.push(o);
      }
      t++;
    }
    blocks.push({ num: lesson.num, id: lesson.id, theme: THEMES[lesson.num], ops });
  }
  return blocks;
}
/* Les bilans personnalisés multi-matières (sélection libre de leçons) sont
   construits par src/core/build.ts (bilanBlocksForIds / buildFichesForIds),
   qui aiguille math vs autres matières. */
/* numero = libellé ; le bloc temps total est print-only */
export function bilanHTML(numero: number) {
  const blocks = bilanBlocks(3);
  const cells = blocks
    .map((b) => {
      setRenderLesson(b.id);
      const ops = b.ops.map((o) => `<div class="bop">${renderItem(o)}</div>`).join('');
      setRenderLesson(null);
      return `<div class="bloc"><span class="blab">M${b.num}.</span> <span class="btheme">${b.theme}</span>${ops}</div>`;
    })
    .join('');
  return `<div class="page">
    <p class="bilan-title">Bilan express ${numero} — toutes les leçons</p>
    <p class="bilan-sub">3 calculs par leçon · objectif : environ 15 minutes.
       <span class="print-only">Prénom : __________   Date : ________</span></p>
    <p class="bilan-temps print-only">Temps total : ______ min</p>
    <div class="bilan-grid">${cells}</div>
    <p class="foot print-only">Ludaskia</p>
  </div>`;
}

/* Pagination « écran » d'un ensemble de fiches (3 par bloc), utilisée par le
   bilan personnalisé interactif. L'impression a sa propre pagination
   (fichesPagesForIds, 2 par A4). */
export function fichesPagesHTML(fiches: string[]) {
  const perPage = 3;
  const pages = [];
  for (let i = 0; i < fiches.length; i += perPage) {
    pages.push(
      `<div class="page">${fiches.slice(i, i + perPage).join('')}<p class="foot print-only">Ludaskia</p></div>`,
    );
  }
  return pages.join('');
}

/* ============================================================
   Impression CONTEXTUELLE (issue #40)
   Un PrintScope décrit quoi imprimer ; buildPrintableDOM s'appuie sur le
   pipeline générique (buildLessonFiche / bilanBlocksForIds), donc TOUTES les
   matières (maths + conjugaison), pas seulement le calcul mental.
   ============================================================ */
export interface PrintScope {
  title: string; // titre de la page de garde
  lessonIds: string[]; // leçons à imprimer (toutes matières)
  kind: 'fiches' | 'bilan'; // entraînement vs évaluation
  nbQ?: number; // questions par leçon pour un bilan (défaut 3)
}

// Au-delà de ce volume, on prévient (gros PDF) et on suggère l'impression par catégorie.
const PRINT_PAGES_WARN = 20;
// Leçons à lignes longues : elles occupent leur propre page à l'impression.
const LONG_FICHE_LESSONS = new Set(['math-decompo-60', 'math-decomposer-multiplication']);

/* Page de garde dynamique : titre du périmètre, nombre réel de fiches/leçons,
   consigne générique (« je prends le temps qu'il me faut »). Pas de « 15
   ateliers » ni « je calcule de tête » codés en dur. */
export function coverHTML(scope: PrintScope): string {
  const n = scope.lessonIds.length;
  const sousTitre =
    scope.kind === 'bilan'
      ? `Bilan · ${n} leçon${n > 1 ? 's' : ''}`
      : `Fiches d'entraînement · ${n} fiche${n > 1 ? 's' : ''}`;
  const warn =
    n >= PRINT_PAGES_WARN
      ? `<p class="cover-warn">Beaucoup de pages : tu peux aussi imprimer une catégorie à la fois.</p>`
      : '';
  return `<div class="page cover print-only">
    <div class="big">Ludaskia</div>
    <div class="tagline">${escapeHTML(scope.title)}</div>
    <div class="cover-sub">${sousTitre}</div>
    <div class="idbox"><div>Prénom : ______________________</div><div>Date : ______________________</div></div>
    <p class="consigne">Je prends le temps qu'il me faut. Si je bloque, je passe et j'y reviens à la fin. Bon travail !</p>
    ${warn}
  </div>`;
}

/* Fiches paginées pour l'impression : 2 par A4, les leçons « longues » seules. */
function fichesPagesForIds(lessonIds: string[]): string {
  const pages: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length) {
      pages.push(`<div class="page">${cur.join('')}<p class="foot print-only">Ludaskia</p></div>`);
      cur = [];
    }
  };
  for (const id of lessonIds) {
    const fiche = buildLessonFiche(id);
    if (LONG_FICHE_LESSONS.has(id)) {
      flush();
      pages.push(`<div class="page">${fiche}<p class="foot print-only">Ludaskia</p></div>`);
      continue;
    }
    cur.push(fiche);
    if (cur.length >= 2) flush();
  }
  flush();
  return pages.join('');
}

/* Bilan imprimable multi-matières : nbQ questions par leçon, mise en page grille. */
function bilanPrintHTML(scope: PrintScope): string {
  const nbQ = scope.nbQ ?? 3;
  const blocks = bilanBlocksForIds(scope.lessonIds, nbQ);
  const cells = blocks
    .map((b) => {
      setRenderLesson(b.id);
      const ops = b.ops.map((o) => `<div class="bop">${renderItem(o)}</div>`).join('');
      setRenderLesson(null);
      return `<div class="bloc"><span class="btheme">${escapeHTML(b.theme)}</span>${ops}</div>`;
    })
    .join('');
  return `<div class="page">
    <p class="bilan-title">${escapeHTML(scope.title)}</p>
    <p class="bilan-sub">${nbQ} question${nbQ > 1 ? 's' : ''} par leçon · ${blocks.length} leçon${blocks.length > 1 ? 's' : ''}
       <span class="print-only">Prénom : __________   Date : ________</span></p>
    <div class="bilan-grid">${cells}</div>
    <p class="foot print-only">Ludaskia</p>
  </div>`;
}

/* Document imprimable pour un périmètre donné. Page de garde dynamique, sauf
   pour une fiche d'une seule leçon. Jamais de bilan récap collé aux fiches :
   « fiches » et « bilan » sont deux documents distincts (kind). */
export function buildPrintableDOM(scope: PrintScope): string {
  setInputCounter(0);
  const single = scope.lessonIds.length === 1;
  const cover = single ? '' : coverHTML(scope);
  const body = scope.kind === 'bilan' ? bilanPrintHTML(scope) : fichesPagesForIds(scope.lessonIds);
  return cover + body;
}
