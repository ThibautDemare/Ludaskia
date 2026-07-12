# Cache de référence — Adaptations « dys- » et TDAH

**But :** fournir à l'agent `specialiste-troubles-apprentissage` (et en appui
du `designer-ux-enfant` / `pedagogue-primaire`) les leviers concrets applicables
à **Ludaskia** (application web d'exercices auto-corrigés, cœur de cible CE2)
sans recherche en ligne systématique.

> ⚠️ **Statut du document — À VALIDER avant usage en production**
>
> Ce document est une **distillation d'expertise** synthétisée à partir de
> sources officielles et de bonnes pratiques reconnues. Il doit être relié
> par **`specialiste-troubles-apprentissage`** et **`pedagogue-primaire`**
> avant d'être utilisé comme référence stable. Toute recommandation marquée
> « bonne pratique générale » n'est pas adossée à une source officielle
> précisément citée : elle reflète le consensus professionnel (orthophonie,
> ergothérapie, éducation spécialisée) mais reste à confirmer.

**Sources principales :**
- Eduscol — [Enseigner à des élèves à besoins éducatifs particuliers (EBEP)](https://eduscol.education.gouv.fr/5481/enseigner-des-eleves-besoins-educatifs-particuliers)
- Eduscol / Primàbord — [Aménagements raisonnables](https://primabord.eduscol.education.fr/amenagements-raisonnables-des-fiches-outils-au-service-de-l-inclusion-a)
- HAS — [Guide parcours de santé — Troubles spécifiques du langage et des apprentissages (TSLA)](https://www.has-sante.fr/jcms/c_2822893/fr/comment-ameliorer-le-parcours-de-sante-d-un-enfant-avec-troubles-specifiques-du-langage-et-des-apprentissages) (2018)
- HAS — [Recommandation TDAH enfant 2024 (PDF)](https://www.has-sante.fr/upload/docs/application/pdf/2024-09/tdah_enfant_recommandations_mel.pdf)
- INSHEA/INSEI — [Ressources TSLA](https://www.inshea.fr/fr/ressource/moteur-lecture-pole-tsa)
- Mon Parcours Handicap (gouvernement) — [Troubles dys : aménagements scolaires](https://www.monparcourshandicap.gouv.fr/actualite/troubles-dys-quels-amenagements-pour-la-scolarite)

**Date de constitution :** 2026-06-25

---

## Convention : source locale d'abord

Avant de fetcher le web, consulter ce fichier. Compléter en ligne uniquement
si un trouble ou un levier n'est pas couvert ici.

---

## 1. Dyslexie / Dysorthographie

### Contexte

La **dyslexie** est un trouble persistant de l'acquisition de la lecture ; la
**dysorthographie** en est fréquemment associée (difficultés de transcription).
Ensemble, elles touchent environ 5 à 8 % des élèves scolarisés. *(Source :
HAS TSLA guide 2018 ; Primàbord/EBEP)*

### 1.1 Lisibilité typographique

| Paramètre | Recommandation | Statut |
|-----------|---------------|--------|
| Police | Sans empattement, chasse large, formes de lettres distinctives : **Verdana, Trebuchet MS, Calibri, Century Gothic** ; ou polices spécialisées (OpenDyslexic, Dyslexie Font — surtout si l'enfant les a adoptées). Éviter Arial / Helvetica (confusion « illi »). | Bonne pratique reconnue (consensus orthophonistes / ergothérapeutes) |
| Taille | Minimum **14–16 pt** (≈ 18–21 px) | Bonne pratique générale |
| Interlignage | **1,5 à 1,8** (150–180 %) | Bonne pratique générale |
| Espacement lettres | Légèrement augmenté (+0,3 pt / tracking positif) | Bonne pratique générale |
| Alignement | **Gauche strict** — pas de texte justifié | Bonne pratique générale |
| Longueur de ligne | Courte (≤ 60–70 caractères) | Bonne pratique générale |
| Style | Romain droit — éviter l'italique | Bonne pratique générale |
| Contraste | Fond clair / texte sombre (blanc ou crème, pas blanc pur si photosensibilité) | Bonne pratique générale |

> Note : les études sur l'avantage de polices « spéciales dyslexie » (OpenDyslexic)
> vs. polices standard larges sont **contradictoires**. Ce qui aide le mieux est
> la **macrotypographie** (mise en page aérée, contrastes, marges) plus que le
> choix de police seul. À valider avec `specialiste-troubles-apprentissage`.

### 1.2 Multimodalité — TTS en appui du texte

- **Toujours afficher le texte ET proposer le TTS** (bouton « Écouter ») — ne
  pas remplacer l'écrit par le seul audio.
- Le TTS décharge la mémoire de travail phonologique : les consignes et les
  énoncés peuvent être relus autant de fois que nécessaire.
- Formuler les énoncés pour être **intelligibles à l'oral** (cf. cache
  `accessibilite.md` §8 — pas « 2 × 3 » mais « deux fois trois »).
- *(Source : HAS TSLA guide 2018 — multimodalité comme levier de compensation)*

### 1.3 Évaluation — ne pas pénaliser la graphie / l'orthographe hors sujet

- Dans les exercices de **mathématiques, conjugaison (forme verbale), grandeurs**
  : corriger **uniquement ce qui est évalué**, pas les erreurs d'orthographe de
  la consigne ni les homophones.
- En orthographe/conjugaison : la correction automatique doit **normaliser la
  casse** avant de comparer (ne pas sanctionner majuscule/minuscule hors sens).
- Tolérance de saisie : si le moteur d'exercice accepte des variantes, les
  dyslexiques bénéficient de la même tolérance que les autres (espaces, apostrophes
  droites vs courbes...).
- *(Source : Primàbord EBEP — « adapter les modalités d'évaluation » ; HAS TSLA
  guide 2018)*

### 1.4 Présentation des consignes

- Consignes **courtes**, une instruction par phrase.
- Mettre en gras les **mots-clés** (verbe d'action, terme central).
- Listes à puces si plusieurs étapes.
- Éviter les blocs de texte compacts.
- *(Bonne pratique générale — consensus pédagogie inclusive)*

---

## 2. Dyscalculie

### Contexte

La **dyscalculie** est un trouble persistant de l'acquisition des concepts
numériques et du calcul, distinct des difficultés mathématiques ordinaires.
*(Source : HAS TSLA guide 2018)*

### 2.1 Présentation des nombres

| Levier | Application dans Ludaskia |
|--------|--------------------------|
| **Espace de milliers** | Toujours séparer par un espace insécable les groupes de 3 chiffres (ex. : 4 532, pas 4532) — déjà en place sur les leçons grands nombres CE2/CM1. |
| **Alignement vertical** | Dans les opérations posées, aligner les unités sur la même colonne ; ne pas mélanger opérandes de longueurs différentes sans repère visuel. |
| **Code couleur stable** | Si on colore les classes (milliers / centaines / dizaines / unités), utiliser **toujours la même palette** dans toute l'appli. Bonne pratique : vert = milliers, rouge = centaines, bleu = derniers chiffres (exemple non officiel — adapter si une convention nationale est retenue). |
| **Un seul calcul à la fois** | Ne pas afficher plusieurs expressions numériques simultanément ; isoler l'opération sur la ligne. |

*(Source : Primàbord EBEP — « documents aérés avec repères visuels » ; consensus
rééducateurs dyscalculie)*

### 2.2 Repères visuels et organisation spatiale

- **Éviter la surcharge** : peu d'éléments par écran, beaucoup d'espace blanc.
- Proposer des **représentations concrètes** quand possible (boulier virtuel,
  bâtonnets, ligne numérique) — pas obligatoire dans tous les exercices mais
  utile en renforcement.
- Présenter les opérations en **grille / tableau** plutôt qu'en flux de texte.
- Matérialiser les étapes d'un calcul (opérande 1 / signe / opérande 2 / résultat)
  en cases séparées.
- *(Bonne pratique générale — consensus rééducateurs dyscalculie ; Primàbord)*

### 2.3 Saisie et feedback

- Préférer la **saisie de chiffres** à la saisie d'expressions textuelles (moins
  d'erreurs de transcription).
- Le feedback doit être **explicatif** (pas seulement ✓ / ✗) : indiquer quelle
  étape est incorrecte si possible. (Bonne pratique générale)
- Ne pas pénaliser un **espace en trop** dans un nombre saisi (ex. : « 4 532 »
  et « 4532 » doivent être équivalents si l'espace de milliers est attendu).

---

## 3. Dyspraxie / Dysgraphie

### Contexte

La **dyspraxie** (TDC — Trouble Développemental de la Coordination) affecte la
planification et l'exécution des gestes. Elle entraîne une **dysgraphie**
(écriture manuelle difficile) et peut compliquer les gestes numériques
(glisser-déposer, pointage précis, géométrie).
*(Source : HAS TSLA guide 2018 ; Primàbord EBEP)*

### 3.1 Saisie et interaction

| Levier | Application dans Ludaskia |
|--------|--------------------------|
| **Préférer la frappe au clavier** | Le clavier supprime la surcharge motrice de l'écriture manuelle et libère des ressources cognitives. *(Source : dysmoi.fr — consensus ergothérapeutes)* |
| **Éviter le glisser-déposer** | Le glisser-déposer exige une coordination fine difficile sur tablette pour les dyspraxiques. Préférer clics/appuis simples ou sélection par bouton. *(Bonne pratique générale)* |
| **Grandes cibles tactiles** | ≥ 44 × 44 px CSS pour tous les boutons d'action (déjà cible Ludaskia, cf. `accessibilite.md` §4). Pour les dyspraxiques, viser 48–56 px et espacement généreux. *(Bonne pratique générale — consensus ergothérapeutes)* |
| **Tolérance de pointage** | Zones de clic plus larges que la zone visuelle (padding invisible). *(Bonne pratique générale)* |
| **Pas de double-tâche motrice** | Ne pas demander à l'enfant de lire ET de copier simultanément. *(Source : Primàbord EBEP — éviter la double-tâche)* |

### 3.2 Organisation spatiale

- Présentation **structurée et peu dense** : peu d'éléments par écran, alignements
  clairs, pas de mises en page complexes à « décoder » visuellement.
- Les figures géométriques SVG doivent être **lisibles sans zoom** (taille
  suffisante, pas de surcharge d'annotations).
- Éviter les saisies dans des tableaux à plusieurs colonnes (difficulté
  d'orientation spatiale), **sauf cas mitigé** : case active très visible
  (surbrillance nette, pas la seule bordure), **avance automatique** vers la case
  suivante après chaque saisie, et entrée exclusivement par un **pavé large**
  externe (jamais de tap direct dans une case étroite, ni de clavier natif qui
  demande de viser). Sous ces trois conditions réunies, le geste redevient un tap
  sur un gros bouton, pas un pointage fin dans une grille. Ce mitigé doit rester
  un **complément** à une saisie libre au clavier (jamais son seul mode d'accès à
  la notion).
- *(Bonne pratique générale — consensus ergothérapeutes ; Primàbord EBEP)*

### 3.3 Évaluation

- Ne pas pénaliser la **qualité graphique** d'un tracé (non applicable au
  numérique dans Ludaskia, mais à garder si on implémente un jour un champ de
  tracé libre).
- Accepter des **variantes de saisie** : un résultat correct avec une faute de
  frappe isolée (touche adjacente) mérite la tolérance. *(Bonne pratique générale)*

---

## 4. TDAH / Troubles de l'attention

### Contexte

Le **TDAH** (Trouble du Déficit de l'Attention avec ou sans Hyperactivité)
affecte l'attention soutenue, le contrôle inhibiteur et la mémoire de travail.
Il n'est pas un trouble des apprentissages à proprement parler, mais perturbe
fortement le contexte d'apprentissage et peut coexister avec des troubles dys.
*(Source : HAS Recommandation TDAH enfant 2024)*

### 4.1 Pression temporelle — chronomètre

- Le chronomètre visible **peut être anxiogène** et réduire les performances
  chez les enfants TDAH (cécité temporelle, distraction par l'horloge elle-même).
- **Recommandé** : rendre le chronomètre **optionnel** (désactivable) ou le
  remplacer par un **timer visuel dégressif** (moins anxiogène qu'un compteur
  montant). *(Source : consensus TDAH / ergothérapeutes ; Time Timer comme
  alternative — tdahfocus.com)*
- Ne jamais pénaliser un délai dépassé sur un exercice d'entraînement (le
  chronomètre de Ludaskia est un record personnel, pas une sanction — à
  rappeler dans l'UI). *(Bonne pratique générale)*

### 4.2 Charge de mémoire de travail

- **Consignes courtes et séquencées** : une instruction à la fois, pas de
  longues phrases imbriquées. *(Source : consensus HAS TDAH 2024 — adaptations
  scolaires)*
- **Informations persistantes** : ne pas forcer l'enfant à se souvenir d'un
  critère de la consigne pendant qu'il exécute (afficher la consigne en
  permanence sur l'écran d'exercice). *(Bonne pratique générale)*
- **Pas de double-consigne** : éviter « trouve le résultat ET explique pourquoi »
  dans le même champ de saisie. *(Bonne pratique générale)*
- Mots-clés en **gras** pour réduire le coût de lecture de la consigne.

### 4.3 Feedback immédiat

- La correction **instantanée** après chaque réponse est fondamentale :
  compense le déficit dopaminergique (récompense différée peu efficace).
  *(Source : HAS TDAH 2024 — « interventions comportementales » ; consensus
  pédagogie TDAH)*
- Micro-récompenses fréquentes (étoiles, XP, effets visuels) — les paliers
  rapprochés sont plus efficaces qu'une grosse récompense distante.
  *(Source : consensus gamification / TDAH)*
- Ne pas accumuler les erreurs sans feedback (pas de correction en lot à la fin
  seulement).

### 4.4 Distracteurs et environnement visuel

- **Interface épurée pendant l'exercice** : masquer ou minimiser tout ce qui
  n'est pas utile à la tâche en cours (animations de fond, badges non liés,
  notifications). *(Bonne pratique générale — consensus TDAH)*
- Éviter les **animations continues** non déclenchées par l'enfant pendant
  l'exercice.
- Les animations de récompense (confettis, mascotte) sont positives **après**
  validation, pas pendant la saisie. *(Bonne pratique générale)*

### 4.5 Découpage des séquences

- Exercices en **courtes sessions** (5–10 questions) plutôt qu'en longues suites.
  *(Bonne pratique générale — consensus TDAH pédagogie)*
- Afficher la **progression** dans la session (ex. : question 3/8) — ancre
  temporelle concrète qui aide l'enfant TDAH à se situer.
- Possibilité de **pause** sans perdre sa progression. *(Bonne pratique générale)*

---

## 5. Points transversaux (plusieurs troubles)

| Levier | Troubles concernés | Statut |
|--------|-------------------|--------|
| TTS / bouton « Écouter » | Dyslexie, TDAH, dyscalculie (lecture des consignes) | Recommandé — HAS TSLA 2018 |
| Consignes courtes, mots-clés en gras | Tous | Bonne pratique générale |
| Feedback immédiat | TDAH, dyscalculie, dyslexie | Recommandé — HAS TDAH 2024 ; consensus pédagogie |
| Interface épurée (peu d'éléments simultanés) | TDAH, dyscalculie, dyspraxie | Bonne pratique générale |
| Grandes cibles tactiles (≥ 44 px) | Dyspraxie, TDAH (impulsivité motrice) | WCAG 2.5.5 AAA — cible Ludaskia |
| Pas de double-tâche | Dyspraxie, TDAH | Eduscol EBEP |
| Tolérance de saisie | Dyslexie, dyspraxie | Bonne pratique générale |
| Pas de pénalisation hors sujet | Dyslexie, dysorthographie | Eduscol EBEP |
| Progression visible dans la session | TDAH, dyscalculie | Bonne pratique générale |

---

## 6. Ce qui relève de l'enseignant / du PAP — hors périmètre appli

Les adaptations suivantes **ne peuvent pas être activées par l'application**
elle-même (elles dépendent du contexte de classe ou du plan personnalisé) :

- Tiers-temps (allongement du temps d'examen) → Ludaskia n'est pas un examen.
- Usage d'une calculatrice pour un exercice de calcul posé.
- Lecture de l'énoncé par l'enseignant (remplacé partiellement par le TTS).
- Organisation spatiale de l'espace de travail physique.

---

## Note de maintenance

Ce document est **à compléter** au fil des retours de l'agent
`specialiste-troubles-apprentissage` et des évolutions de la littérature.

Re-vérifier si :
- une nouvelle recommandation HAS ou eduscol est publiée sur les TSLA ou le TDAH ;
- une leçon soulève un cas non couvert ici ;
- le `specialiste-troubles-apprentissage` signale une inexactitude.

En cas de mise à jour, conserver les en-têtes source + date et noter la date
de révision.
