# Design — Extension multi-matières

> Document de conception **cible** (pas encore implémenté). Décrit les décisions
> d'architecture prises lors de la réflexion initiale. L'implémentation réelle peut
> s'en écarter à la marge ; `ARCHITECTURE.md` sera mis à jour une fois les issues
> mergées.

## Objectif

Étendre Ludaskia au-delà du calcul mental pour supporter plusieurs matières
(Français, Anglais, Maths étendus…), plusieurs types d'exercices (saisie libre,
QCM), et une gamification multi-niveaux (XP global, trophées par matière).

---

## Hiérarchie des contenus

```
Subject         ex : "Français"
  └── Category  ex : "Conjugaison", "Orthographe"
        └── Lesson   ex : "L'auxiliaire être au présent"
```

Chaque `Lesson` porte un **niveau scolaire** (`cp | ce1 | ce2 | cm1 | cm2 | 6e…`)
pour filtrer les contenus selon le profil de l'enfant (futur).

```typescript
type SubjectId  = string   // 'math' | 'français' | 'anglais' | …
type CategoryId = string   // 'conjugaison' | 'orthographe' | …
type SchoolLevel = 'cp' | 'ce1' | 'ce2' | 'cm1' | 'cm2' | '6e'

interface LessonDef {
  id: string           // string unique, ex : 'fr-conj-etre-present'
  label: string
  subject: SubjectId
  category: CategoryId
  level: SchoolLevel
  exerciseType: ExerciseType
}
```

Les leçons math existantes migrent vers des string IDs (`math-add-1digit`, …).
Les stats/étoiles existantes sont remises à zéro (pas de migration de données).

---

## Modèle d'exercice

### Type `Exercise`

```typescript
type Exercise =
  | { type: 'text'; question: string; answer: string; answers?: string[] }
  | { type: 'qcm';  question: string; answer: string; choices: string[] }
```

- `answers` (text) : liste de réponses toutes correctes (formes équivalentes).
- Normalisation : `trim()` + NFC Unicode uniquement. **Accents et apostrophes
  sont exigés** — aucune tolérance supplémentaire.

### Interface `ExerciseType`

Chaque type d'exercice implémente cette interface dans `src/core/` :

```typescript
interface ExerciseType {
  generate(): Exercise
  check(exercise: Exercise, input: string): boolean
}
```

Implémentations prévues :
- `MathExerciseType` — génération algorithmique (actuel, refactorisé)
- `ConjugationExerciseType` — data-driven (verbe × temps × personne)
- `QCMExerciseType` — générique, paramétré par une banque de questions

---

## Système de bilan

### `BilanConfig`

```typescript
interface BilanConfig {
  id: string                   // uuid
  label: string                // nom donné par l'utilisateur
  lessonIds: string[]
  questionsPerLesson: number | 'all'
  // 'all' → bilan complet (toutes les questions de la leçon)
  // 3     → bilan express (raccourci UI)
  // N     → bilan personnalisé
}
```

Stocké dans le profil : `ludaskia_bilans → BilanConfig[]`.

### Points d'entrée UI

| Mode | Comportement |
|------|-------------|
| **Bilan express** | Raccourci UI → `BilanConfig` avec `questionsPerLesson: 3` sur les leçons d'une catégorie |
| **Bilan de catégorie** | `questionsPerLesson: 'all'` sur toutes les leçons d'une catégorie |
| **Bilan personnalisé** | Sélection libre de leçons (multi-sujet/catégorie), `questionsPerLesson` au choix |
| **Bilan favori** | Relance d'un `BilanConfig` sauvegardé dans le profil |

---

## Sprint

Filtrable à trois niveaux :
- **Global** — pioche dans toutes les leçons de toutes les matières
- **Par matière** — toutes les leçons d'une matière
- **Par catégorie** — toutes les leçons d'une catégorie

---

## Gamification

### XP

- **1 point par bonne réponse**, tous modes confondus (bilan, sprint, leçon).
- Stocké dans le profil : `ludaskia_xp → number`.
- Base pour un système de niveaux RPG futur.

### Trophées

Trois groupes distincts, même mécanique `tiers()` existante :
- **Globaux** — métriques toutes matières
- **Par sujet** — métriques sur un sujet donné
- **Par catégorie** — métriques sur une catégorie donnée

---

## Navigation

```
Accueil
  └── Choisir une matière
        └── Choisir une catégorie
              └── Liste des leçons
```

Bilan et sprint accessibles à chaque niveau de la hiérarchie.

---

## Données statiques

Stockées en TypeScript (`as const`) dans `src/data/` :

```
src/data/
  math/          (refacto des leçons existantes)
  français/
    conjugaison.ts
    orthographe.ts   (issue séparée — intégration avec coloration)
  anglais/
    vocabulaire.ts
```

---

## Ce qui ne change pas

Profils, `storage.ts` (`lsGet/lsSet`), `progress.ts` (stars, records, série),
`rewards.ts` (défis, trophées — étendu mais pas refactorisé), chronomètre,
confettis, export/import de profils.

---

## Issues à créer

| # | Titre | Périmètre |
|---|-------|-----------|
| 1 | Refacto core multi-matières | `ExerciseType`, `LessonDef` + `level`, hiérarchie, string IDs, `BilanConfig`, XP |
| 2 | Bilan — sélection libre et favoris | Nouveau sélecteur de leçons, sauvegarde `BilanConfig` dans profil |
| 3 | Sprint filtrable | Paramètre sujet/catégorie/global |
| 4 | Navigation multi-matières | Écran sujet → catégorie → leçons |
| 5 | Trophées et XP multi-matières | Groupes sujet/catégorie, compteur XP |
| 6 | Français — Conjugaison | Données + `ConjugationExerciseType` + premières leçons |
