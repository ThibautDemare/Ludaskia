[← Architecture Ludaskia](../ARCHITECTURE.md)

# Piste d'évolution

La hiérarchie **Matière → Catégorie → Leçon**, les réponses **texte normalisées**
(+ variantes) et la gamification **agnostique de la matière** sont désormais en
place. Restent à explorer, en gardant le format « question courte → réponse
vérifiable » (filtre : **automatisme/mémorisation**) :

- **mode QCM** : disponible en **conjugaison**, **en sprint et depuis la leçon**
  (#69) via `conjugationType` (mode `qcm`, distracteurs dérivés du paradigme) ;
  piste pour la mémorisation (capitales/dates). *Écarté pour l'orthographe* (risque
  d'ancrage de la faute) ;
- d'autres contenus : **verbes irréguliers anglais** (pas encore de matière anglais
  dans `src/data/`) — les conversions d'unités, elles, sont **déjà livrées** (#89) ;
- **niveaux scolaires — V2** (#225) : mélange biaisé vers le bas dans les pools de
  tirage (sprint / révision : ≈ 80 % niveau actif / 15 % −1 / 2 % −2), **entretien des
  acquis du niveau inférieur** en révision espacée, et davantage de contenu CM1 (le
  filtrage, le namespacing `@niveau` et le calibrage par niveau sont déjà en place) ;
- **affiner** la révision espacée : réglage de l'escalier d'intervalles, et
  généralisation (la brique `revision.ts` est déjà agnostique du type d'élément).
- **corrigé imprimable** (page réponses) et **accessibilité/dys** de l'impression
  (police, contraste) — hors périmètre de #40, à explorer.
