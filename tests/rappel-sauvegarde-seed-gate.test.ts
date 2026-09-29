import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { MIN_ACTIVITES } from '../src/core/rappel-sauvegarde';

/* ============================================================
   Gate du SEMIS E2E DU RAPPEL DE SAUVEGARDE (#711, relecture du lot 4).

   `e2e/helpers.ts` amorce les trois verrous de l'encart « Pour les parents » (#306 §7).
   Le premier est un seuil d'engagement : `rappel-sauvegarde.ts` n'affiche rien tant que le
   profil n'a pas atteint `MIN_ACTIVITES` sessions terminées. Le harnais e2e doit franchir
   ce seuil, et il en RECOPIE la valeur — une spec n'importe pas `src/`.

   Une copie manuelle se périme, et ici l'échec serait muet : le seuil monte côté `src/`,
   la copie reste en dessous, l'encart ne s'affiche plus jamais, et
   `rappel-sauvegarde.spec.ts` comme `a11y-axe.spec.ts` échouent sur un élément
   « introuvable » sans dire pourquoi. Même famille et même remède que
   `aide-vue-seed-gate.test.ts` (la liste des aides déjà vues).

   ── Trois choses à tenir, pas une ───────────────────────────────────────────────
   Depuis que la valeur est une CONSTANTE EXPORTÉE (`SEUIL_RAPPEL_ACTIVITES`) et non plus
   un nombre enfoui dans un défaut de paramètre, la surveiller ne suffit plus :
   1. la constante doit valoir au moins le vrai seuil ;
   2. le semis doit S'EN SERVIR — une constante juste que plus personne n'emploie ne garde
      rien, et c'est le mode d'échec propre à la nouvelle forme : il suffit qu'un `?? 3`
      revienne à côté pour que la constante devienne décorative ;
   3. les specs doivent la DÉRIVER (`SEUIL_RAPPEL_ACTIVITES - 1`) plutôt que d'écrire un
      nombre. C'est le miroir le plus vicieux : un `2` nu « sous le seuil de 3 » devient
      silencieusement « à hauteur du seuil » si le seuil descend à 2, et le test NÉGATIF
      passe alors positif — il échouerait en prétendant l'inverse de ce qu'il vérifie.

   ── Ce qui est importé, ce qui est relu en texte, et pourquoi ────────────────────
   `MIN_ACTIVITES` est exportée (`src/core/rappel-sauvegarde.ts`) : le gate compare une
   VRAIE valeur à sa copie. Comparer deux textes ne garderait rien — c'est précisément le
   piège que ce fichier existe pour éviter. `e2e/` en revanche importe `@playwright/test`,
   qu'on ne charge pas dans Vitest : on le lit.

   ── Pourquoi un fichier à part d'`aide-vue-seed-gate.test.ts` ───────────────────
   Le nom du fichier est ce qu'on lit en premier quand `npm test` échoue : il doit nommer
   ce qui est cassé. Au TROISIÈME miroir de `e2e/helpers.ts`, les fondre dans un
   `e2e-helpers-miroirs-gate.test.ts` et extraire la lecture commune dans un module
   `gardes-*.ts` non collecté (patron maison, cf. `gardes-langue.ts`) ; à deux, le coût du
   partage dépasse encore celui de la répétition.
   ============================================================ */

const CHEMIN_HELPERS = 'e2e/helpers.ts';
const NOM_CONSTANTE = 'SEUIL_RAPPEL_ACTIVITES';
const FONCTION = 'seedRappelSauvegardeScript';

/** Corps d'une fonction de `e2e/helpers.ts`, lu en texte. `null` si elle est introuvable :
    un gate qui n'a rien lu doit le dire, pas conclure « tout va bien ». */
function corpsDe(source: string, nom: string): string | null {
	const debut = source.indexOf(`function ${nom}`);
	if (debut < 0) return null;
	const fin = source.indexOf('\n}', debut);
	return fin < 0 ? null : source.slice(debut, fin);
}

/** Valeur du seuil RECOPIÉE dans le harnais e2e. */
function seuilRecopie(source: string): number | null {
	const m = source.match(new RegExp(`const\\s+${NOM_CONSTANTE}\\s*=\\s*(\\d+)`));
	return m ? Number(m[1]) : null;
}

/** Expression dont le semis se sert par défaut : le `X` de `opts.activites ?? X`. Rendue
    telle quelle (et non évaluée) — ce qui compte ici n'est pas sa valeur mais le fait
    qu'elle DÉSIGNE la constante au lieu de la recopier une fois de plus. */
function defautDuSemis(source: string): string | null {
	const corps = corpsDe(source, FONCTION);
	if (!corps) return null;
	const m = corps.match(/opts\.activites\s*\?\?\s*([^;\n]+)/);
	return m ? m[1].trim() : null;
}

/* Les specs (et les modules du harnais) qui passent un nombre d'activités ÉCRIT EN CLAIR.
   Le zéro est excepté, et c'est raisonné, pas complaisant : « aucune activité » est sous
   tout seuil POSITIF — et le garde-fou ci-dessous exige justement que `MIN_ACTIVITES` le
   soit — donc ce littéral-là ne peut pas basculer de sens quand le seuil bouge. Exiger
   qu'il s'écrive `SEUIL_RAPPEL_ACTIVITES - 3` n'aurait aucun sens, et un gate qui réclame
   une absurdité finit désactivé. */
function litterauxDansLeHarnais(): string[] {
	const out: string[] = [];
	for (const nom of readdirSync('e2e').filter((f) => f.endsWith('.ts'))) {
		const src = readFileSync(`e2e/${nom}`, 'utf8');
		for (const m of src.matchAll(/activites:\s*(\d+)/g)) {
			if (Number(m[1]) === 0) continue;
			out.push(`e2e/${nom} — « ${m[0]} »`);
		}
	}
	return out;
}

/* Les mentions CHIFFRÉES du seuil dans la prose de `e2e/helpers.ts`. Un commentaire qui
   ment sur une constante de `src/` piège le prochain lecteur au moment précis où il vient
   vérifier. Contrôle CONDITIONNEL : si une tournure est reformulée sans son nombre, il n'y
   a plus rien à vérifier, et c'est très bien — ce qui ne doit jamais devenir muet, ce sont
   les trois contrôles de VALEUR ci-dessus, pas celui de la prose autour. */
const MENTIONS: { quoi: string; motif: RegExp }[] = [
	{ quoi: 'MIN_ACTIVITES = N', motif: /MIN_ACTIVITES\s*=\s*(\d+)/g },
	{ quoi: 'déf. N, le seuil', motif: /déf\.\s*(\d+),\s*le seuil/g },
];

function seuilsAnnoncesParLaProse(source: string): { quoi: string; valeur: number }[] {
	return MENTIONS.flatMap(({ quoi, motif }) =>
		[...source.matchAll(motif)].map((m) => ({ quoi, valeur: Number(m[1]) })),
	);
}

const SOURCE = readFileSync(CHEMIN_HELPERS, 'utf8');

describe('Gate — le semis e2e du rappel de sauvegarde suit le seuil du code (#711)', () => {
	it('le seuil importé est une vraie borne (garde contre un gate à vide)', () => {
		// Si `MIN_ACTIVITES` devenait 0 ou cessait d'être un nombre, les comparaisons
		// ci-dessous seraient toujours vraies et le gate n'examinerait plus rien. C'est aussi
		// ce qui fonde l'exception du zéro dans le balayage des littéraux.
		expect(Number.isInteger(MIN_ACTIVITES)).toBe(true);
		expect(MIN_ACTIVITES).toBeGreaterThan(0);
	});

	it(`la lecture de ${CHEMIN_HELPERS} trouve bien la constante ET le défaut du semis`, () => {
		// Second garde-fou : la lecture est textuelle, donc elle peut cesser de trouver sa
		// cible (constante renommée, fonction renommée, défaut écrit autrement).
		const repare =
			`Ce gate lit ${CHEMIN_HELPERS} en TEXTE (une spec importe @playwright/test, qu'on ne charge pas ici).\n` +
			`Si un nom a changé, mettre à jour l'extraction en tête de ce fichier — ne pas supprimer le gate.`;
		expect(seuilRecopie(SOURCE), `${NOM_CONSTANTE} introuvable.\n${repare}`).not.toBeNull();
		expect(
			defautDuSemis(SOURCE),
			`« opts.activites ?? … » introuvable dans ${FONCTION}.\n${repare}`,
		).not.toBeNull();
	});

	it('la copie du seuil vaut AU MOINS le seuil réel', () => {
		/* « Au moins », et non « exactement » : ce qui casse, c'est un semis SOUS le seuil
		   (l'encart ne s'affiche jamais). Un seuil abaissé côté `src/` ne casse rien — exiger
		   l'égalité ferait rougir le gate sur un changement inoffensif, et un gate qui crie à
		   tort finit désactivé. */
		const copie = seuilRecopie(SOURCE);
		expect(
			copie ?? -1,
			`${NOM_CONSTANTE} vaut ${copie} dans ${CHEMIN_HELPERS}, alors que l'encart ` +
				`« Pour les parents » n'apparaît qu'à partir de ${MIN_ACTIVITES} ` +
				`(MIN_ACTIVITES, src/core/rappel-sauvegarde.ts).\n` +
				`Conséquence, et elle est muette : l'encart ne s'affiche plus jamais dans les specs, ` +
				`et rappel-sauvegarde.spec.ts comme a11y-axe.spec.ts échouent sur un élément ` +
				`« introuvable » sans dire pourquoi.\n` +
				`À faire : porter ${NOM_CONSTANTE} à ${MIN_ACTIVITES} au moins, et corriger avec lui ` +
				`les commentaires qui citent le chiffre.`,
		).toBeGreaterThanOrEqual(MIN_ACTIVITES);
	});

	it('le semis se sert de la constante, il ne recopie pas le nombre une fois de plus', () => {
		/* Le mode d'échec PROPRE à la nouvelle forme : la constante peut rester juste pendant
		   qu'un littéral revient à côté d'elle. On garderait alors une valeur exacte que plus
		   personne n'emploie — un gate vert sur une pièce de musée. */
		const defaut = defautDuSemis(SOURCE);
		expect(
			defaut,
			`Le défaut de ${FONCTION} est « ${defaut} » et non « ${NOM_CONSTANTE} ».\n` +
				`La constante ne sert alors plus à rien : ce gate continuerait de la vérifier ` +
				`pendant que le semis, lui, emploierait autre chose.`,
		).toBe(NOM_CONSTANTE);
	});

	it('aucune spec n’écrit un nombre d’activités en clair : elles DÉRIVENT la constante', () => {
		/* Le miroir le plus vicieux, et celui qui a motivé l'export de la constante : un « 2 »
		   commenté « sous le seuil de 3 » devient « à hauteur du seuil » si le seuil descend à
		   2. Le test négatif passe alors positif et échoue en prétendant l'inverse de ce qu'il
		   vérifie. Écrire `SEUIL_RAPPEL_ACTIVITES - 1` rend le lien indéfectible. */
		const litteraux = litterauxDansLeHarnais();
		expect(
			litteraux,
			`Ces appels passent un nombre d'activités écrit en clair :\n${litteraux.join('\n')}\n` +
				`À faire : le DÉRIVER de la constante du harnais — « ${NOM_CONSTANTE} - 1 » pour se ` +
				`placer sous le seuil, « ${NOM_CONSTANTE} » pour l'atteindre.\n` +
				`Sans ça, un seuil qui bouge retourne le sens du test sans rien faire rougir.\n` +
				`Seul « activites: 0 » est admis : aucune activité est sous tout seuil positif, donc ` +
				`ce littéral-là ne peut pas changer de sens.`,
		).toEqual([]);
	});

	it('aucun commentaire de e2e/helpers.ts n’annonce un autre seuil que le vrai', () => {
		const fausses = seuilsAnnoncesParLaProse(SOURCE).filter((a) => a.valeur !== MIN_ACTIVITES);
		expect(
			fausses.map((a) => `${a.quoi} → ${a.valeur}`),
			`${CHEMIN_HELPERS} annonce un seuil qui n'est plus celui de ` +
				`src/core/rappel-sauvegarde.ts (${MIN_ACTIVITES}).`,
		).toEqual([]);
	});
});

/* ---------- Témoins : le détecteur sait-il échouer ? ----------
   Tout ce qui précède est vert tant que les copies sont à jour, c'est-à-dire la plupart du
   temps. On rejoue donc chaque extraction sur le VRAI fichier, modifié EN MÉMOIRE — le
   fichier sur disque n'est pas touché. C'est la seule façon de prouver que l'extraction
   lit bien CE texte-là, et pas une forme que j'aurais fabriquée à ma main : des témoins sur
   source inventée valident les prédicats, pas la prise sur le réel. */

const avecSeuil = (n: number) =>
	SOURCE.replace(
		new RegExp(`const\\s+${NOM_CONSTANTE}\\s*=\\s*\\d+`),
		`const ${NOM_CONSTANTE} = ${n}`,
	);

const avecDefaut = (expr: string) =>
	SOURCE.replace(/opts\.activites\s*\?\?\s*[^;\n]+/, `opts.activites ?? ${expr}`);

describe('Gate — témoins : une copie périmée fait bien réagir le détecteur', () => {
	it('le fichier réel se lit, et rend ce qu’on y écrit', () => {
		expect(seuilRecopie(SOURCE)).toBe(MIN_ACTIVITES);
		expect(seuilRecopie(avecSeuil(7))).toBe(7);
		expect(defautDuSemis(SOURCE)).toBe(NOM_CONSTANTE);
		expect(defautDuSemis(avecDefaut('42'))).toBe('42');
	});

	it('une copie SOUS le seuil est détectée ; à hauteur ou au-dessus, non', () => {
		expect(seuilRecopie(avecSeuil(MIN_ACTIVITES - 1))!).toBeLessThan(MIN_ACTIVITES);
		expect(seuilRecopie(avecSeuil(MIN_ACTIVITES))!).toBeGreaterThanOrEqual(MIN_ACTIVITES);
		expect(seuilRecopie(avecSeuil(MIN_ACTIVITES + 5))!).toBeGreaterThanOrEqual(MIN_ACTIVITES);
	});

	it('un défaut qui n’emploie plus la constante est détecté, MÊME s’il porte la bonne valeur', () => {
		// Le cas que la seule lecture de la constante raterait : la valeur est juste, la
		// constante est morte. C'est ce témoin qui justifie le quatrième test ci-dessus.
		expect(defautDuSemis(avecDefaut(String(MIN_ACTIVITES)))).not.toBe(NOM_CONSTANTE);
		expect(defautDuSemis(avecDefaut('AUTRE_CONSTANTE'))).not.toBe(NOM_CONSTANTE);
		expect(defautDuSemis(avecDefaut(NOM_CONSTANTE))).toBe(NOM_CONSTANTE);
	});

	it('un nombre d’activités écrit en clair dans une spec est détecté, et le zéro ne l’est pas', () => {
		// Joué sur la forme exacte que les specs emploient, plutôt qu'en relisant le dossier :
		// c'est le motif qu'il faut éprouver, et il doit distinguer les trois écritures.
		const enClair = (texte: string) =>
			[...texte.matchAll(/activites:\s*(\d+)/g)].filter((m) => Number(m[1]) !== 0);
		expect(enClair('seedRappelSauvegardeScript({ activites: 2 })')).toHaveLength(1);
		expect(enClair(`seedRappelSauvegardeScript({ activites: ${NOM_CONSTANTE} - 1 })`)).toEqual([]);
		expect(enClair('seedRappelSauvegardeScript({ activites: 0 })')).toEqual([]);
		// Et la déclaration du champ optionnel ne doit pas être prise pour un appel.
		expect(enClair('\tactivites?: number;')).toEqual([]);
	});

	/* Deux choses étaient mélangées ici, et les séparer a été imposé par le lot lui-même :
	   la prose « déf. N, le seuil » a été RETIRÉE d'`e2e/helpers.ts` (elle nomme désormais la
	   constante au lieu de recopier sa valeur), et ce témoin exigeait qu'elle existe. Exiger
	   la présence d'une prose ferait rougir le gate à chaque fois qu'on supprime un miroir,
	   c'est-à-dire à chaque fois qu'on lui donne raison. Ce qui ne doit jamais devenir muet,
	   c'est le DÉTECTEUR ; la prose qu'il surveille, elle, a le droit de disparaître. */
	it('le détecteur réagit à chacune des tournures surveillées (sur une source fabriquée)', () => {
		const faux = MIN_ACTIVITES + 4;
		const fabriquee = `
			// Seuil recopié de MIN_ACTIVITES = ${faux} côté src.
			/** Nombre d'activités (déf. ${faux}, le seuil). */
		`;
		const fausses = seuilsAnnoncesParLaProse(fabriquee).filter((a) => a.valeur !== MIN_ACTIVITES);
		expect(fausses.map((a) => a.quoi).sort()).toEqual(['MIN_ACTIVITES = N', 'déf. N, le seuil']);
	});

	it('le fichier réel ne ment sur aucune des tournures qu’il porte (zéro mention = état valide)', () => {
		expect(seuilsAnnoncesParLaProse(SOURCE).filter((a) => a.valeur !== MIN_ACTIVITES)).toEqual([]);
	});

	it('la lecture rend `null` — jamais une valeur inventée — quand elle ne trouve pas sa cible', () => {
		expect(seuilRecopie(SOURCE.replace(`const ${NOM_CONSTANTE}`, 'const AUTRE_NOM'))).toBeNull();
		expect(seuilRecopie('')).toBeNull();
		expect(defautDuSemis(SOURCE.replace(`function ${FONCTION}`, 'function autreNom'))).toBeNull();
		expect(
			defautDuSemis(SOURCE.replace(/opts\.activites\s*\?\?\s*[^;\n]+/, 'opts.activites')),
		).toBeNull();
		expect(corpsDe(`export function ${FONCTION}(`, FONCTION)).toBeNull();
	});
});
