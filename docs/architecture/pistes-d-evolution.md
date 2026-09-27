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
- **niveaux scolaires — V2** (#225) : reste à faire, **davantage de contenu CM1** (le
  filtrage, le namespacing `@niveau` et le calibrage par niveau sont déjà en place). Le
  **mélange biaisé vers le bas dans les pools de tirage** envisagé ici est **livré** côté
  sprint (appoint borné à 15 %, #724, cf. [Niveaux scolaires](niveaux-scolaires.md)) ;
  l'**entretien des acquis du niveau inférieur en révision espacée l'est aussi** (#232,
  cf. [Logique pure](core.md)) ;
- **affiner** la révision espacée : réglage de l'escalier d'intervalles, et
  généralisation (la brique `revision.ts` est déjà agnostique du type d'élément).
- **corrigé imprimable** (page réponses) et **accessibilité/dys** de l'impression
  (police, contraste) — hors périmètre de #40, à explorer.
