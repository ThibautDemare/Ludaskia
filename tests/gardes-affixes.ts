/* ============================================================
   Harnais partagé — gardes de contenu des banques d'affixes (préfixes / suffixes).
   ------------------------------------------------------------
   Mutualise les gardes écrites pour les banques CE2 (#453) afin que les banques CM1
   (#500, critères 2 et 3) soient tenues par EXACTEMENT les mêmes règles, et non par
   une copie qui divergerait au premier ajustement. Chaque garde est une fonction
   PURE qui renvoie la LISTE des violations (diagnostic complet en un run) ; l'appelant
   se contente d'un `expect(violations).toEqual([])`, ce qui garde le message d'échec
   lisible et le nom du test dans le fichier de sa banque.

   Ce fichier n'est pas collecté par Vitest (son nom n'est ni en `.test.ts` ni en
   `.spec.ts`, cf. l'`include` de `vite.config.ts`) ; ses détecteurs sont éprouvés par
   `tests/gardes-affixes.test.ts` — sans quoi une garde pourrait cesser de détecter en
   silence et rendre vertes toutes ses banques.
   ============================================================ */
import type { ItemAffixe } from '../src/data/francais/familles';

export interface BanqueAffixes {
	nom: string;
	items: readonly ItemAffixe[];
	role: 'préfixe' | 'suffixe';
}

/* Marge tolérée, en CARACTÈRES, entre la bonne réponse et le PLUS LONG de ses deux
   distracteurs (garde « option qui se détache visuellement », #453 relecture langue).
   MÉTRIQUE : caractères, et référence = le plus long distracteur.
   - vs la MOYENNE des trois options : mauvaise référence. Une réponse peut dépasser la
     moyenne de 10 caractères tout en égalant le plus long distracteur (deux options
     longues, une courte) — aucun repère exploitable ; et inversement.
   - vs le nombre de MOTS : trop grossier, mesuré sur les banques réelles — « sous-titre »
     a 0 mot d'écart pour +7 caractères, « survêtement » 1 mot d'écart pour +10 (le mot
     « par-dessus » pèse à lui seul), alors que « facilement » avant correction avait
     +2 mots pour +10 caractères. La largeur rendue sur un bouton de QCM suit les
     caractères, pas les mots.
   MARGE = 10, mesurée sur l'état corrigé des banques CE2 : maximum observé +10
   (« survêtement »), puis +9 (« surnom ») ; la banque de suffixes plafonne à +2. Elle
   rattrape 8 des 9 items corrigés par la relecture (de +11 à +28 : récitation, surligner,
   voleur, franchement, rêveur, soustraction, correction, sérieusement) ; « facilement »
   (+10 avant correction) tombe pile sur la marge, tout comme « survêtement » qui, lui,
   est resté — AUCUN seuil de longueur ne sépare ces deux-là. C'est donc un plancher
   contre les repères FLAGRANTS, pas une preuve d'absence de repère : le jugement fin
   reste à la relecture langue. Garde volontairement à sens UNIQUE (un distracteur bien
   plus long que la réponse n'est pas exploitable : l'heuristique « la plus longue »
   mène alors à une erreur).
   Le seuil vaut pour TOUTES les banques d'affixes : une marge par niveau reviendrait à
   tolérer sur un CM1 le repère qu'on refuse à un CE2, alors que l'heuristique « je
   clique sur la plus longue » ne demande pas plus de connaissance à 9 ans qu'à 8. */
export const MARGE_LONGUEUR = 10;

/* Affixe annoncé par l'explication : « Le préfixe « re- » … » / « Le suffixe « -eur » … ».
   Renvoie le rôle annoncé et l'affixe nu (sans le tiret de position). */
export function affixeAnnonce(explication: string): { role: string; affixe: string } | null {
	const m = explication.match(/^Le (préfixe|suffixe)\s+«\s*-?([^»\s-]+)-?\s*»/);
	return m ? { role: m[1], affixe: m[2].toLowerCase() } : null;
}

/* Le mot porte-t-il le préfixe annoncé ? Tolérance d'ÉLISION pour les préfixes longs :
   « sous- » s'écrit « sou- » devant consonne (souterrain, souligner). Réservée aux
   préfixes de 4 lettres et plus, sinon la règle deviendrait vide de sens (« in- »
   accepterait tout mot commençant par « i »). */
export function porteLePrefixe(mot: string, prefixe: string): boolean {
	return mot.startsWith(prefixe) || (prefixe.length >= 4 && mot.startsWith(prefixe.slice(0, -1)));
}

/** Mots interrogés vides, à espace de bord, ou posés deux fois (dans une banque ou entre banques). */
export function anomaliesDuMotInterroge(banques: readonly BanqueAffixes[]): string[] {
	const anomalies: string[] = [];
	const vuDans = new Map<string, string[]>();
	for (const { nom, items } of banques) {
		const mots = items.map((a) => a.mot);
		for (const mot of mots) {
			if (mot.length === 0) anomalies.push(`${nom} : mot vide`);
			else if (mot !== mot.trim()) anomalies.push(`${nom} : « ${mot} » a une espace de bord`);
		}
		for (const mot of new Set(mots)) {
			const bancs = vuDans.get(mot) ?? [];
			bancs.push(nom);
			vuDans.set(mot, bancs);
		}
		for (const mot of mots.filter((m, i) => mots.indexOf(m) !== i)) {
			anomalies.push(`${nom} : « ${mot} » interrogé deux fois`);
		}
	}
	// Un même mot ne peut pas être interrogé une fois comme préfixé et une fois comme
	// suffixé : la question serait identique pour deux réponses différentes.
	for (const [mot, bancs] of vuDans) {
		if (bancs.length > 1) anomalies.push(`« ${mot} » interrogé dans ${bancs.join(' et ')}`);
	}
	return anomalies;
}

/** Options (bonne réponse ou leurre) qui contiennent le mot interrogé : la réponse fuit. */
export function fuitesDuMotInterroge(banques: readonly BanqueAffixes[]): string[] {
	const fuites: string[] = [];
	for (const { nom, items } of banques) {
		for (const a of items) {
			const mot = a.mot.toLowerCase();
			for (const opt of [a.sens, ...a.distracteurs]) {
				if (opt.toLowerCase().includes(mot)) fuites.push(`${nom} : « ${a.mot} » → « ${opt} »`);
			}
		}
	}
	return fuites;
}

/** Items dont la bonne réponse dépasse le plus long distracteur de plus de `MARGE_LONGUEUR`. */
export function reperesDeLongueur(banques: readonly BanqueAffixes[]): string[] {
	const repères: string[] = [];
	for (const { nom, items } of banques) {
		for (const a of items) {
			const plusLongDistracteur = Math.max(...a.distracteurs.map((d) => d.length));
			const écart = a.sens.length - plusLongDistracteur;
			if (écart > MARGE_LONGUEUR) {
				repères.push(
					`${nom} : « ${a.mot} » +${écart} car. — « ${a.sens} » vs [${a.distracteurs.join(' | ')}]`,
				);
			}
		}
	}
	return repères;
}

/** Explications qui n'annoncent aucun affixe, en annoncent un du mauvais type, ou un que le mot ne porte pas. */
export function affixesAnnoncesIncoherents(banques: readonly BanqueAffixes[]): string[] {
	const anomalies: string[] = [];
	for (const { nom, items, role } of banques) {
		for (const a of items) {
			const annonce = affixeAnnonce(a.explication);
			if (!annonce) {
				anomalies.push(`${nom} : « ${a.mot} » — aucun affixe annoncé (${a.explication})`);
				continue;
			}
			// Un item de préfixes ne peut pas expliquer un suffixe (copier-coller entre banques).
			if (annonce.role !== role) {
				anomalies.push(`${nom} : « ${a.mot} » — annoncé comme ${annonce.role}`);
				continue;
			}
			const mot = a.mot.toLowerCase();
			const porte =
				role === 'préfixe' ? porteLePrefixe(mot, annonce.affixe) : mot.endsWith(annonce.affixe);
			if (!porte) {
				anomalies.push(`${nom} : « ${a.mot} » ne porte pas le ${role} « ${annonce.affixe} »`);
			}
		}
	}
	return anomalies;
}

/** Explications qui ne citent pas le mot interrogé (explication recopiée d'un item voisin). */
export function explicationsSansLeMotInterroge(banques: readonly BanqueAffixes[]): string[] {
	const anomalies: string[] = [];
	for (const { nom, items } of banques) {
		for (const a of items) {
			if (!a.explication.toLowerCase().includes(a.mot.toLowerCase())) {
				anomalies.push(
					`${nom} : « ${a.mot} » — explication qui ne cite pas le mot → ${a.explication}`,
				);
			}
		}
	}
	return anomalies;
}
