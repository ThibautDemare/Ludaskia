/* ============================================================
   Récap éphémère de fin de séance (#537) — couche UI.
   ------------------------------------------------------------
   Trois responsabilités, toutes ÉPHÉMÈRES par construction :
   - résoudre des ids de leçon en notions nommables (libellé au niveau joué +
     catégorie), seul endroit qui connaisse le catalogue ;
   - garder EN MÉMOIRE ce que la séance en cours vient de travailler, par mode, pour
     que le récap du programme du jour puisse nommer ce qu'une tuile laisse générique
     (« Sprint 5 min » ne dit pas quelles leçons ont été tirées) ;
   - rendre la phrase de récap.

   AUCUNE persistance, volontairement (critère 11 de #537) : pas de clé de stockage,
   pas de cumul consultable, rien qui survive au rechargement de la page. Le récap est
   un épilogue de séance, pas un carnet de devoirs. Un rechargement le perd, et le
   récap du programme du jour retombe alors sur son affichage d'avant — enrichi quand
   on peut, jamais faux.

   La DÉCISION (ce qui est nommé, avec quelle phrase) vit dans `core/recap-notions.ts`,
   pure et testée. Ici, seule la résolution et le HTML.
   ============================================================ */
import { html, VIDE, type SafeHtml } from '../core/html';
import { CATEGORIES, getLessonById } from '../core/catalog';
import { labelLecon } from '../core/levels';
import { niveauLecon } from '../core/niveau-actif';
import { activeProfile } from '../core/profiles';
import {
	contenuRecap,
	phraseRecap,
	recapAutonomeMasque,
	type NotionRecap,
} from '../core/recap-notions';
import { vueProgramme } from './seance';

/** Modes dont le récap autonome peut être repris par le programme du jour. */
export type KindRecap = 'sprint' | 'revision';

/* ---------- Résolution catalogue ---------- */

const LABEL_CATEGORIES: Record<string, string> = Object.fromEntries(
	CATEGORIES.map((c) => [c.id, c.label]),
);

/** Notions nommables pour un agrégat `perLesson` (id de leçon → réussis/total), tel que
    le produisent le bilan (`scoreItems`), le sprint et la révision espacée.

    Une leçon dont AUCUNE réponse n'a été donnée est écartée : `scoreItems` crée son seau
    dès qu'un champ la référence, même laissé vide, et « tu as travaillé X » serait alors
    faux pour la seule leçon que l'enfant a justement sautée.

    L'ordre d'insertion de l'objet est conservé : c'est l'ordre de rencontre, le seul que
    l'enfant puisse reconnaître. Une leçon inconnue du catalogue (donnée héritée, niveau
    retiré) est ignorée plutôt que nommée par son id. */
export function notionsDepuisPerLesson(
	perLesson: Record<string, { ok: number; total: number }>,
): NotionRecap[] {
	const out: NotionRecap[] = [];
	for (const id in perLesson) {
		if (!perLesson[id]?.total) continue;
		const n = notionLecon(id);
		if (n) out.push(n);
	}
	return out;
}

/** Notion nommable d'une leçon du catalogue, `null` si l'id est inconnu. */
export function notionLecon(lessonId: string): NotionRecap | null {
	const l = getLessonById(lessonId);
	if (!l) return null;
	return {
		id: lessonId,
		// Libellé résolu au niveau JOUÉ (#436) : le récap nomme la leçon comme l'écran
		// que l'enfant avait sous les yeux, pas comme le libellé générique du catalogue.
		label: labelLecon(l, niveauLecon(l)),
		categorie: LABEL_CATEGORIES[l.category] ?? l.category,
	};
}

/** Notion nommable d'un groupe de révision qui n'est pas une leçon du catalogue — les MOTS
    d'orthographe, regroupés par catégorie (`groupLabel`). Sans elle, une révision composée
    uniquement de mots n'aurait rien à nommer, alors que c'est le cas le plus courant. */
export function notionGroupe(groupLabel: string): NotionRecap {
	return { id: `groupe:${groupLabel}`, label: groupLabel, categorie: groupLabel };
}

/* ---------- Journal éphémère (mémoire de la page, jamais persistée) ---------- */

/* Rangé PAR PROFIL, et pas en une seule paire de listes. Changer de profil ne recharge
   pas la page (`setActiveProfile` puis `route()`, cf. `main.ts`) : une mémoire globale
   aurait accolé les notions du sprint d'un enfant à l'étape « Sprint » du programme de
   son frère, ce qui retourne la promesse même du récap — dire ce que TU viens de faire.
   Le classement par profil vaut mieux qu'un effacement branché sur le changement de
   profil actif : celui-ci a quatre points d'entrée (`initProfiles`, `setActiveProfile`,
   `addProfile`, `deleteProfile`), et il aurait suffi d'en oublier un. */
const notionsParProfil = new Map<string, Record<KindRecap, NotionRecap[]>>();

function seauProfil(): Record<KindRecap, NotionRecap[]> {
	const uuid = activeProfile()?.uuid ?? '';
	let seau = notionsParProfil.get(uuid);
	if (!seau) {
		seau = { sprint: [], revision: [] };
		notionsParProfil.set(uuid, seau);
	}
	return seau;
}

/** Mémorise ce qu'un sprint / une révision vient de travailler, pour le récap du
    programme du jour. Cumulatif dans la page (deux sprints d'affilée ⇒ l'union), ce qui
    correspond à l'étape « Sprint ×2 » du programme. */
export function noterNotions(kind: KindRecap, notions: readonly NotionRecap[]): void {
	seauProfil()[kind].push(...notions);
}

/** Ce que le profil ACTIF a travaillé dans ce mode depuis le chargement de la page
    (vide au démarrage, et vide pour un profil qui n'a rien fait dans cet onglet). */
export function notionsNotees(kind: KindRecap): NotionRecap[] {
	return seauProfil()[kind].slice();
}

/** Remise à zéro de tous les profils — réservée aux tests. */
export function oublierNotions(): void {
	notionsParProfil.clear();
}

/* ---------- Rendu ---------- */

/* Rotation des gabarits (critère 6), sur DEUX sources, aucune persistée :
   - un compteur de page, qui fait varier la phrase d'une activité à la suivante dans la
     même séance ;
   - le JOUR du mois, ajouté au compteur. Sans lui, un compteur nu repartant de zéro à
     chaque chargement de page ferait lire le MÊME premier gabarit à chaque première
     activité de la journée — soit exactement le bloc figé que le critère 6 combat, dans
     le cas le plus fréquent (une séance par jour). Lire l'horloge n'est pas créer un état :
     rien n'est écrit, le critère 11 tient.
   Déterministe dans les deux cas : un tirage aléatoire pouvait répéter deux fois de suite
   le même gabarit. */
let tour = 0;

/** Phrase de récap prête à insérer, `''` s'il n'y a rien à nommer (jamais de bloc vide).

    UNE phrase, sans puce, sans icône et sans encadré : c'est la structure en carte ou en
    ligne (bordure + libellé + méta) qui fait « relevé pour les parents », pas la couleur —
    d'où le parti pris de prose continue (critère 15, avis `designer-ux-enfant`).

    `classe` est fournie par l'écran porteur (`rb-recap`, `sprint-recap`, `rev-recap`) :
    chacun a déjà sa famille de styles, et une classe transversale aurait dû lutter contre
    trois contextes de mise en page différents. */
export function recapHTML(notions: readonly NotionRecap[], classe: string): SafeHtml {
	const contenu = contenuRecap(notions);
	if (!contenu) return VIDE;
	const jour = new Date(Date.now()).getDate();
	return html`<p class="${classe}">${phraseRecap(contenu, jour + tour++)}</p>`;
}

/** Phrase de récap d'un sprint / d'une révision, `''` s'il n'y a rien à nommer OU si le
    programme du jour va déjà nommer cette activité (critère 3 de #537) : deux récaps pour
    la même séance, à deux écrans d'écart, se contrediraient sur la forme sans rien
    apporter. Le compteur de gabarits n'avance que quand une phrase est réellement rendue.

    Import de `vueProgramme` : la vue du programme ne peut se lire que d'ici (elle a besoin
    du contexte des épinglées, cf. `ui/seance.ts`). Le cycle d'imports qui en résulte est
    celui, déjà en place, de `navigation` ↔ `seance` — aucun usage au chargement du module,
    tout se joue à l'appel. */
export function recapAutonomeHTML(
	kind: KindRecap,
	notions: readonly NotionRecap[],
	classe: string,
): SafeHtml {
	const vue = vueProgramme();
	const masque = recapAutonomeMasque(
		kind,
		vue ? { complete: vue.complete, kinds: vue.etapes.map((v) => v.etape.kind) } : null,
	);
	return masque ? VIDE : recapHTML(notions, classe);
}
