import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { AIDES, AIDE_VUE_KEY } from '../src/core/aide';

/* ============================================================
   Gate du SEMIS D'AIDES des specs e2e (#711).

   `e2e/helpers.ts` expose `seedAideVueScript`, qui marque toutes les bulles d'aide comme
   « déjà vues » avant qu'une spec n'ouvre un écran. Cette liste est une chaîne JSON écrite
   À LA MAIN : une spec e2e n'importe pas `src/`, donc elle ne peut pas dériver `TypeAide`.
   C'est une COPIE, et une copie manuelle se périme.

   Pourquoi la mécaniser plutôt que de compter sur le réflexe : l'oubli ne casse rien
   bruyamment. Il ouvre un overlay bloquant au premier lancement du mode concerné, et la
   spec échoue ensuite sur un clic intercepté, loin de la cause. Mesuré à l'ajout de
   `tableauVirgule` (#711 lot 4) : la liste était déjà périmée de DEUX entrées
   (`segmentMot`, `droiteGraduee`), donc la règle du lot précédent n'avait pas survécu à
   deux runners neufs.

   Pourquoi un fichier à part, et pas dans `e2e-navigation-gate.test.ts` (même famille :
   « la page n'est pas dans l'état que la spec croit ») ni dans `couverture-e2e-gate.test.ts` :
   quand `npm test` échoue, la première chose lue est le NOM DU FICHIER. Il doit nommer ce
   qui est cassé. « e2e-navigation » enverrait chercher un problème de `goto`/`waitFor`, et
   l'en-tête de ce fichier-là argumente précisément ses DEUX pièges — y en ajouter un
   troisième, sans rapport, dissout le raisonnement qui le rend lisible.

   Lecture par TEXTE, comme `couverture-e2e-gate.test.ts` : `e2e/helpers.ts` importe
   `@playwright/test`, qu'on ne charge pas dans Vitest. Le prix de cette lecture est qu'elle
   peut cesser de trouver ce qu'elle cherche — d'où `lireSemis`, qui rend `null` au lieu de
   conclure « tout va bien », et les deux gardes anti-gate-à-vide plus bas.
   ============================================================ */

const CHEMIN_HELPERS = 'e2e/helpers.ts';
const FONCTION = 'seedAideVueScript';

interface Semis {
	/** Clé de `localStorage` écrite par le semis (doit être celle que lit `src/core/aide.ts`). */
	cle: string;
	/** Contenu semé, tel qu'il sera relu : type d'aide → valeur. */
	aides: Record<string, unknown>;
}

/** Extrait le semis d'un texte source façon `e2e/helpers.ts`. Rend `null` dès qu'une pièce
    manque (fonction introuvable, chaîne absente, JSON illisible) : un gate qui n'a RIEN lu
    doit le dire, pas passer au vert. */
function lireSemis(source: string): Semis | null {
	const debut = source.indexOf(`function ${FONCTION}`);
	if (debut < 0) return null;
	const fin = source.indexOf('\n}', debut);
	if (fin < 0) return null;
	const corps = source.slice(debut, fin);
	// La clé est préfixée du profil (`${uuid}/…`) ; seule la partie applicative nous intéresse,
	// et toute clé du projet commence par `ludaskia_` (convention CLAUDE.md, tenue par
	// `cles-stockage-gate.test.ts`).
	const cle = corps.match(/ludaskia_[a-z0-9_]+/)?.[0];
	const json = corps.match(/'(\{[^']*\})'/)?.[1];
	if (!cle || !json) return null;
	try {
		const aides: unknown = JSON.parse(json);
		if (!aides || typeof aides !== 'object') return null;
		return { cle, aides: aides as Record<string, unknown> };
	} catch {
		return null;
	}
}

/* ---------- Prédicats (joués sur des sources fabriquées en fin de fichier) ---------- */

const TYPES_AIDE = Object.keys(AIDES);

/** Aides que le semis ne marque PAS comme vues : absentes, ou présentes mais à `false` —
    les deux laissent l'overlay s'ouvrir, donc les deux comptent comme un oubli. */
const nonSemees = (semis: Semis) => TYPES_AIDE.filter((t) => semis.aides[t] !== true);

/** Aides semées qui n'existent plus dans le code : pas bloquant, mais c'est du bruit qui
    fait croire à une couverture, et le prochain lecteur ne saura pas si c'est un oubli de
    ménage ou une faute de frappe. */
const inconnues = (semis: Semis) => Object.keys(semis.aides).filter((t) => !TYPES_AIDE.includes(t));

const SOURCE = readFileSync(CHEMIN_HELPERS, 'utf8');
const SEMIS = lireSemis(SOURCE);

describe('Gate — le semis d’aides des specs e2e suit les types d’aide du code (#711)', () => {
	it('l’inventaire des aides n’est pas vide (garde contre un gate à vide)', () => {
		// `AIDES` est un `Record<TypeAide, …>`, donc exhaustif par construction — mais si un jour
		// il change de forme, tous les tests suivants deviendraient verts en n'examinant plus
		// rien. Plancher volontairement bas : il attrape un effondrement, pas un retrait.
		expect(
			TYPES_AIDE.length,
			'aucun type d’aide trouvé dans src/core/aide.ts : la détection a changé.',
		).toBeGreaterThanOrEqual(10);
	});

	it(`la lecture de ${CHEMIN_HELPERS} trouve bien ${FONCTION} et sa chaîne semée`, () => {
		// Second garde-fou : la lecture est textuelle, donc elle peut cesser de trouver sa cible
		// (fonction renommée, chaîne construite autrement). Sans ce test, le gate se tairait.
		expect(
			SEMIS,
			`${FONCTION} introuvable dans ${CHEMIN_HELPERS}, ou sa chaîne JSON ne se lit plus.\n` +
				`Ce gate lit le fichier en TEXTE (une spec e2e importe @playwright/test, qu'on ne charge pas ici).\n` +
				`Si la fonction a été renommée ou sa chaîne construite autrement, mettre à jour l'extraction ci-dessus — ne pas supprimer le gate.`,
		).not.toBeNull();
		expect(Object.keys(SEMIS?.aides ?? {}).length).toBeGreaterThan(0);
	});

	it('chaque type d’aide du code est semé « déjà vue » par le harnais e2e', () => {
		const manque = SEMIS ? nonSemees(SEMIS) : TYPES_AIDE;
		expect(
			manque,
			`Aide(s) non semée(s) par ${CHEMIN_HELPERS} : ${manque.join(', ')}.\n` +
				`La liste de ${FONCTION} est une copie MANUELLE de TypeAide (src/core/aide.ts) : une spec e2e n'importe pas src/.\n` +
				`À faire : ajouter ${manque.map((t) => `"${t}":true`).join(', ')} dans la chaîne JSON de ${FONCTION}.\n` +
				`Sans ça, la première spec qui ouvre cet écran reçoit l'overlay d'aide, qui intercepte le clic suivant — et la spec échoue loin de la cause.`,
		).toEqual([]);
	});

	it('le semis ne déclare aucune aide qui n’existe plus dans le code', () => {
		const orphelines = SEMIS ? inconnues(SEMIS) : [];
		expect(
			orphelines,
			`Aide(s) semée(s) par ${CHEMIN_HELPERS} mais absente(s) de TypeAide : ${orphelines.join(', ')}.\n` +
				`Soit c'est un reste à retirer de la chaîne JSON de ${FONCTION}, soit c'est une FAUTE DE FRAPPE — auquel cas l'aide réelle n'est pas semée du tout.`,
		).toEqual([]);
	});

	it('le semis écrit la clé de stockage que le code relit', () => {
		// L'autre moitié du miroir, et le même mode d'échec : renommer `AIDE_VUE_KEY` dans `src/`
		// laisserait le semis écrire dans une clé que plus personne ne lit. Overlay de retour,
		// toujours sans message.
		expect(
			SEMIS?.cle,
			`${FONCTION} sème « ${SEMIS?.cle} » alors que src/core/aide.ts relit « ${AIDE_VUE_KEY} ».`,
		).toBe(AIDE_VUE_KEY);
	});
});

/* ---------- Témoins : le détecteur sait-il échouer ? ----------
   Tout ce qui précède est VERT quand la copie est à jour, c'est-à-dire la plupart du temps.
   Un gate vert ne prouve rien tant qu'on ne l'a pas vu rougir : on rejoue donc l'extraction
   et les prédicats sur des sources FABRIQUÉES portant exactement la faute annoncée. */

/** Reconstruit un `seedAideVueScript` plausible autour d'une chaîne JSON donnée. */
const sourceFabriquee = (json: string, cle = AIDE_VUE_KEY, nom = FONCTION) =>
	[
		`export function ${nom}(uuid = 'e2e'): string {`,
		`\treturn \`localStorage.setItem('\${uuid}/${cle}', '${json}');\`;`,
		'}',
		'',
	].join('\n');

const jsonComplet = () => `{${TYPES_AIDE.map((t) => `"${t}":true`).join(',')}}`;

describe('Gate — témoins : le semis fabriqué fait bien réagir le détecteur', () => {
	it('une copie complète ne signale rien', () => {
		const semis = lireSemis(sourceFabriquee(jsonComplet()));
		expect(semis).not.toBeNull();
		expect(nonSemees(semis!)).toEqual([]);
		expect(inconnues(semis!)).toEqual([]);
		expect(semis!.cle).toBe(AIDE_VUE_KEY);
	});

	it('une aide MANQUANTE est signalée, et nommée', () => {
		const ampute = `{${TYPES_AIDE.slice(1)
			.map((t) => `"${t}":true`)
			.join(',')}}`;
		const semis = lireSemis(sourceFabriquee(ampute));
		expect(nonSemees(semis!)).toEqual([TYPES_AIDE[0]]);
	});

	it('une aide semée à `false` compte comme non semée (l’overlay s’ouvrirait quand même)', () => {
		const eteinte = jsonComplet().replace(`"${TYPES_AIDE[0]}":true`, `"${TYPES_AIDE[0]}":false`);
		const semis = lireSemis(sourceFabriquee(eteinte));
		expect(nonSemees(semis!)).toEqual([TYPES_AIDE[0]]);
	});

	it('une faute de frappe se voit des DEUX côtés : l’aide réelle manque, la clé tapée est inconnue', () => {
		// Le cas le plus traître : la chaîne « a l'air » complète, et pourtant rien n'est semé
		// pour ce type. Sans le test des orphelines, seul le premier signal existerait.
		const faute = jsonComplet().replace(`"${TYPES_AIDE[0]}":`, `"${TYPES_AIDE[0]}X":`);
		const semis = lireSemis(sourceFabriquee(faute));
		expect(nonSemees(semis!)).toEqual([TYPES_AIDE[0]]);
		expect(inconnues(semis!)).toEqual([`${TYPES_AIDE[0]}X`]);
	});

	it('une clé de stockage divergente est signalée', () => {
		const semis = lireSemis(sourceFabriquee(jsonComplet(), 'ludaskia_aide_vue_ancienne'));
		expect(semis!.cle).not.toBe(AIDE_VUE_KEY);
	});

	it('joué sur le VRAI fichier amputé d’une entrée, le gate rougit', () => {
		// La preuve qui manque aux témoins ci-dessus : ils valident les prédicats sur une source
		// que J'AI écrite, pas l'extraction sur le texte réel — une chaîne construite autrement
		// dans `e2e/helpers.ts` les laisserait tous verts pendant que le gate ne lit rien.
		// On ampute donc la copie lue EN MÉMOIRE (le fichier sur disque n'est pas touché) et on
		// vérifie que le gate nomme l'entrée retirée. C'est exactement l'état dans lequel
		// `e2e/helpers.ts` se trouvait avant #711 lot 4.
		const cible = TYPES_AIDE[TYPES_AIDE.length - 1];
		expect(
			SEMIS?.aides[cible],
			`« ${cible} » n'est pas dans le vrai semis : témoin sans objet`,
		).toBe(true);
		const ampute = SOURCE.replace(`,"${cible}":true`, '').replace(`"${cible}":true,`, '');
		const semis = lireSemis(ampute);
		expect(semis, 'le fichier amputé ne se lit plus : le témoin ne prouverait rien').not.toBeNull();
		expect(nonSemees(semis!)).toEqual([cible]);
	});

	it('la lecture rend `null` — jamais un semis vide — quand elle ne trouve pas sa cible', () => {
		// Ces trois cas sont la raison d'être du second garde-fou : s'ils rendaient un objet
		// vide, `inconnues` serait vide et le gate n'aurait plus qu'un seul signal.
		expect(lireSemis(sourceFabriquee(jsonComplet(), AIDE_VUE_KEY, 'autreNom'))).toBeNull();
		expect(
			lireSemis('export function seedAideVueScript(): string {\n\treturn ``;\n}\n'),
		).toBeNull();
		expect(lireSemis(sourceFabriquee('{pas du json}'))).toBeNull();
		expect(lireSemis('')).toBeNull();
	});
});
