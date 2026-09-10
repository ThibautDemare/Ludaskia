/* ============================================================
   Étagère de jeux — les deux gestes de rendu que tout plateau refait.

   Minuscule, et il doit le rester : ce n'est pas une boîte à outils, c'est
   l'endroit où atterrit ce que DEUX runners de jeux écrivaient déjà à
   l'identique. Le déclencheur avait été consigné à la fin de #664 — « la
   troisième occurrence sera le moment de factoriser plutôt que de figer le
   copier-coller en motif » — et #665 l'a atteint : `bascule` et `capitale`
   étaient copiées mot pour mot dans les mots à caser et les mots croisés.

   Ce qui N'A PAS sa place ici : tout ce qui touche à un jeu en particulier (une
   grille, un vivier, une règle), et tout ce qui est PUR — la logique de jeu vit
   dans `core/jeux/`, où elle est testable sans DOM. La clé d'une case, par
   exemple, est repartie dans `core/jeux/grille-mots.ts` (`cleCase`) : elle décrit
   une géométrie, pas un rendu.

   Rien ici ne connaît un jeu, et rien n'a d'effet à l'import.
   ============================================================ */

/** Pose ou retire un attribut d'état sur un élément.

    Un ATTRIBUT plutôt qu'une classe, et c'est la convention des plateaux (sudoku,
    mots à caser, mots croisés) : un sélecteur d'attribut se lit aussi bien dans
    la feuille de style que dans une spec Playwright, et il ne se mélange pas aux
    classes de mise en forme quand on relit le DOM à la main.

    La valeur posée est `'1'` et n'est jamais lue : ce qui porte l'information,
    c'est la PRÉSENCE de l'attribut. */
export function bascule(el: HTMLElement, nom: string, actif: boolean): void {
	if (actif) el.setAttribute(nom, '1');
	else el.removeAttribute(nom);
}

/** Une lettre en capitale, casse française.

    Les grilles affichent des capitales : dans une case isolée, sans appui
    sémantique, b/d/p/q se confondent bien plus que B/D/P/Q. Le passage par la
    casse `'fr'` plutôt que par `toUpperCase()` nu garde les accents à leur
    place — la majuscule accentuée est la forme correcte en français, et c'est
    justement ce que la grille est censée montrer. */
export const capitale = (lettre: string): string => lettre.toLocaleUpperCase('fr');
