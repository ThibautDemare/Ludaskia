/* ============================================================
   Déblocages par niveau (issue #28) : rangs (titres) aujourd'hui ;
   mascotte, avatars et thèmes à venir. Module PUR (aucun accès DOM),
   entièrement dérivé du niveau — lui-même dérivé de l'XP. Rien à
   stocker, aucune migration : testable comme niveauDepuisXP.

   Garde-fou : on ne débloque que du cosmétique (fierté/personnalisation),
   jamais du contenu d'apprentissage.
   ============================================================ */
import { NIVEAU_MAX } from './progress';

/* ---------- Rangs (titre + icône selon le niveau) ----------
   Thème Nature/forêt, titres épicènes (pas de marquage de genre).
   Paliers croissants ; le dernier (niv 100) couronne le parcours. */
export interface Rang {
  seuil: number; // niveau minimal pour porter ce rang
  titre: string;
  icone: string;
}
export const RANGS: Rang[] = [
  { seuil: 1, titre: 'Graine', icone: '🌱' },
  { seuil: 10, titre: 'Pousse', icone: '🌿' },
  { seuil: 25, titre: 'Arbuste', icone: '🪴' },
  { seuil: 45, titre: 'Jeune arbre', icone: '🌳' },
  { seuil: 65, titre: 'Grand chêne', icone: '🌲' },
  { seuil: 85, titre: 'Forêt', icone: '🌲🌲' },
  { seuil: NIVEAU_MAX, titre: 'Légende de la forêt', icone: '🧝' },
];

// Rang courant : le plus haut palier dont le seuil est atteint.
export function titreDuNiveau(niveau: number): Rang {
  let rang = RANGS[0];
  for (const r of RANGS) {
    if (niveau >= r.seuil) rang = r;
    else break;
  }
  return rang;
}

/* ---------- Mascotte évolutive (compagnon qui grandit) ----------
   Forme dérivée du niveau. Début densifié (éclosion dès le niv 3) et moitié
   haute étoffée pour ne pas figer le compagnon de 50 à 100 (avis pédagogique).
   `forme` pilote l'animation (œuf qui se balance, oisillon qui sautille, oiseau
   qui « respire ») — voir styles. */
export type FormeMascotte = 'oeuf' | 'oisillon' | 'oiseau';
export interface Mascotte {
  seuil: number; // niveau minimal pour cette forme
  emoji: string;
  forme: FormeMascotte;
}
export const MASCOTTE: Mascotte[] = [
  { seuil: 1, emoji: '🥚', forme: 'oeuf' },
  { seuil: 3, emoji: '🐣', forme: 'oisillon' },
  { seuil: 10, emoji: '🐥', forme: 'oisillon' },
  { seuil: 25, emoji: '🐤', forme: 'oisillon' },
  { seuil: 50, emoji: '🦉', forme: 'oiseau' },
  { seuil: 65, emoji: '🦜', forme: 'oiseau' },
  { seuil: 80, emoji: '🦢', forme: 'oiseau' },
  { seuil: 90, emoji: '🦚', forme: 'oiseau' },
  { seuil: NIVEAU_MAX, emoji: '🦅', forme: 'oiseau' },
];

// Forme courante : la plus haute dont le seuil est atteint.
export function mascotteDuNiveau(niveau: number): Mascotte {
  let m = MASCOTTE[0];
  for (const f of MASCOTTE) {
    if (niveau >= f.seuil) m = f;
    else break;
  }
  return m;
}

/* ---------- Récompenses débloquées à un palier ---------- */
export type TypeRecompense = 'rang' | 'mascotte' | 'avatar' | 'theme';
export interface Recompense {
  type: TypeRecompense;
  icone: string;
  texte: string;
}

// Ce qui se débloque PILE au niveau `niveau` (vide si ce n'est pas un palier).
// Couvre rangs et mascotte (avatars/thèmes ajoutés en phase 3). Le niveau 1
// (rang et œuf de départ) n'est pas un déblocage « vécu » : on l'ignore.
export function recompensesNiveau(niveau: number): Recompense[] {
  const out: Recompense[] = [];
  const rang = RANGS.find((r) => r.seuil === niveau && r.seuil > 1);
  if (rang) out.push({ type: 'rang', icone: rang.icone, texte: `Nouveau rang : ${rang.titre}` });
  const masc = MASCOTTE.find((m) => m.seuil === niveau && m.seuil > 1);
  if (masc) out.push({ type: 'mascotte', icone: masc.emoji, texte: 'Ton compagnon grandit !' });
  return out;
}

// Tous les déblocages obtenus en passant de `avant` (exclu) à `apres` (inclus).
// Couvre le saut de plusieurs niveaux en une seule session.
export function recompensesEntre(avant: number, apres: number): Recompense[] {
  const out: Recompense[] = [];
  for (let n = avant + 1; n <= apres; n++) out.push(...recompensesNiveau(n));
  return out;
}
