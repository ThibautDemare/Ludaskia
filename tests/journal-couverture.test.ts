import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COUVERTURE_JOURNAL } from '../e2e/journal-couverture';
import type { EntreeCouverture } from '../e2e/journal-couverture';
import { getLessonById } from '../src/core/catalog';
import { hasMode } from '../src/core/exercise';
import { genExerciseOrtho } from '../src/core/orthographe/exercise';
import type { MotOrtho } from '../src/core/orthographe/types';
import { withSeed } from '../src/core/utils';

/* ============================================================
   Gate de COUVERTURE du journal d'erreurs (#581, règle #391).

   Le gate statique (#580) vérifie qu'un module correctif importe `capterErreur` ;
   il travaille au niveau MODULE et ne dit rien des formats. Celui-ci travaille au
   niveau FORMAT D'EXERCICE : `src/core/exercise.ts` en déclare une union fermée, et
   chacun doit avoir dans `e2e/journal-couverture.ts` un couple (leçon, geste) —
   sinon un format ajouté demain se corrigerait sans se journaliser, et rien ne le
   dirait. La preuve par l'usage est jouée par `e2e/journal-couverture.spec.ts` ;
   ce fichier-ci est le gate, en quelques millisecondes.

   DEUX FILETS pour la complétude, volontairement redondants :
   - le TYPAGE de la table (`Record<Exercise['type'], …>`) casse `npm run typecheck`
     dès qu'un format est ajouté à l'union sans entrée ici. C'est le filet le plus
     précoce, et il fonctionne bien que `e2e/` ne soit PAS dans `tsconfig.include` :
     l'import ci-dessus tire le fichier dans le programme TypeScript des tests ;
   - la lecture du SOURCE en texte, ci-dessous, redit la même chose à l'exécution.
     Redondant tant que le typage tient, mais c'est lui qui donne le message
     explicite et qui survit à un `as`, un `Partial<>` ou un `// @ts-expect-error`
     posé sur la table.

   CE QU'IL NE PROUVE PAS : que le geste déclaré produit VRAIMENT une erreur
   journalisée — ça, c'est le rôle de la spec e2e, et elle échoue si la carte
   n'apparaît pas. Ici on vérifie que la table ne ment pas sur le catalogue (leçon
   existante, mode déclaré, format réellement produit) : sans ça, une leçon renommée
   laisserait une entrée qui rassure sans rien couvrir.
   ============================================================ */

const SOURCE_EXERCISE = 'src/core/exercise.ts';
const SPEC_E2E = 'e2e/journal-couverture.spec.ts';

/** Formats déclarés par l'union `Exercise`, lus dans le SOURCE. On borne la lecture
 *  à l'union elle-même (de `export type Exercise =` au premier `;` en début de ligne)
 *  pour ne pas ramasser les `type: '…'` des autres interfaces du fichier. */
function formatsDeclares(): string[] {
	const source = readFileSync(SOURCE_EXERCISE, 'utf8');
	const debut = source.indexOf('export type Exercise =');
	expect(debut, `union Exercise introuvable dans ${SOURCE_EXERCISE}`).toBeGreaterThan(-1);
	const fin = source.indexOf('\n\n', source.indexOf('type: ', debut));
	const union = source.slice(debut, fin > debut ? fin : undefined);
	return [...new Set([...union.matchAll(/\btype:\s*'([A-Za-z]+)'/g)].map((m) => m[1]))];
}

const DECLARES = formatsDeclares();
const NB_TIRAGES = 24; // graines par entrée : le format ne doit dépendre d'aucun tirage

/** Mot fictif pour éprouver le générateur de l'atelier d'orthographe : les trois
 *  formats `motCache`/`tuiles`/`dictee` ne viennent PAS d'une leçon du catalogue
 *  (l'atelier travaille des mots), donc rien à confronter à `getLessonById`. */
const MOT_TEST: MotOrtho = {
	id: 'gate',
	mot: 'bonjour',
	entourage: [],
	atelierFait: true,
	validation: { motCache: false, tuiles: false, dictee: false },
	revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
	origine: 'liste',
};

const COUVERTS = Object.entries(COUVERTURE_JOURNAL).filter(([, c]) => c.couvert);
const ENTREES: { format: string; entree: EntreeCouverture }[] = COUVERTS.flatMap(([format, c]) =>
	c.couvert ? c.entrees.map((entree) => ({ format, entree })) : [],
);

describe('Couverture du journal d’erreurs par format (#581)', () => {
	it('la table couvre exactement les formats déclarés dans core/exercise.ts', () => {
		expect(DECLARES.length, `lecture du source cassée : ${DECLARES.join(', ')}`).toBeGreaterThan(
			10,
		);
		const inscrits = Object.keys(COUVERTURE_JOURNAL);
		const manquants = DECLARES.filter((f) => !inscrits.includes(f));
		expect(
			manquants,
			`format(s) d'exercice sans entrée dans e2e/journal-couverture.ts : ${manquants.join(', ')}.\n` +
				`Un format qui corrige une réponse d'enfant doit journaliser ses erreurs (#391) — ` +
				`déclarer une leçon d'exemple et le geste qui produit l'erreur, ou l'inscrire ` +
				`explicitement en { couvert: false, raison: … }.`,
		).toEqual([]);
		const fantomes = inscrits.filter((f) => !DECLARES.includes(f));
		expect(
			fantomes,
			`format(s) inscrits dans la table mais absents de l'union Exercise : ${fantomes.join(', ')}. ` +
				`Entrée périmée (format supprimé ou renommé) : la retirer.`,
		).toEqual([]);
	});

	it('couvre bien la quasi-totalité des formats (garde contre une table vidée)', () => {
		expect(ENTREES.length).toBeGreaterThanOrEqual(DECLARES.length);
	});

	it.each(ENTREES)('$format / $entree.titre : entrée renseignée', ({ entree }) => {
		expect(entree.titre.trim()).not.toBe('');
		// Le geste EN FRANÇAIS n'est pas décoratif : c'est ce qu'un mainteneur lit pour
		// savoir si la couverture annoncée a encore un sens après un changement d'UI.
		expect(entree.geste.trim().length, `geste non décrit pour « ${entree.titre} »`).toBeGreaterThan(
			20,
		);
		expect(typeof entree.jouer).toBe('function');
	});

	it.each(ENTREES)(
		'$format / $entree.titre : la leçon citée existe et produit ce format',
		({ format, entree }) => {
			const src = entree.source;
			if (src.origine === 'ortho') {
				// Pas de LessonDef à confronter : on éprouve le générateur de l'atelier.
				const ex = genExerciseOrtho(MOT_TEST, src.modeOrtho);
				expect(
					ex.type,
					`mode d'atelier « ${src.modeOrtho} » : produit ${ex.type}, pas ${format}`,
				).toBe(format);
				return;
			}
			const lesson = getLessonById(src.lecon);
			expect(
				lesson,
				`leçon « ${src.lecon} » inconnue du catalogue : entrée périmée (leçon renommée ou ` +
					`supprimée). Une couverture qui cite une leçon inexistante ne couvre rien.`,
			).toBeTruthy();
			const type = lesson!.exerciseType;
			if (src.mode) {
				expect(
					hasMode(type, src.mode),
					`« ${src.lecon} » ne déclare plus le mode « ${src.mode} » : la spec e2e jouerait ` +
						`un AUTRE chemin de correction que celui annoncé.`,
				).toBe(true);
			}
			if (src.niveau) {
				expect(
					lesson!.levels,
					`« ${src.lecon} » n'est plus servie au niveau ${src.niveau}`,
				).toContain(src.niveau);
			}
			// Le format doit être celui annoncé, quel que soit le tirage : c'est l'hypothèse
			// sur laquelle repose aussi l'aiguillage de `runLecon` (un seul `generate()` pour
			// choisir le runner). Une leçon devenue polymorphe casserait les deux.
			for (let s = 0; s < NB_TIRAGES; s++) {
				const obtenu = withSeed(
					s * 7919 + 13,
					() => type.generate({ mode: src.mode, level: src.niveau }).type,
				);
				expect(
					obtenu,
					`« ${src.lecon} »${src.mode ? ` (mode ${src.mode})` : ''} produit « ${obtenu} » et non ` +
						`« ${format} » (graine ${s}) : la table annonce une couverture qu'elle ne fournit pas.`,
				).toBe(format);
			}
		},
	);

	it('toute exception porte une raison écrite', () => {
		for (const [format, c] of Object.entries(COUVERTURE_JOURNAL)) {
			if (c.couvert) continue;
			expect(
				c.raison.trim().length,
				`« ${format} » est exempté sans raison lisible. Une exception est une dette ` +
					`assumée et relue : écrire POURQUOI ce format ne peut pas être joué en e2e.`,
			).toBeGreaterThan(40);
		}
	});

	it('la spec e2e lit bien cette table (au lieu de tests écrits à la main à côté)', () => {
		const spec = readFileSync(SPEC_E2E, 'utf8');
		expect(
			/import\s*\{[^}]*\bCOUVERTURE_JOURNAL\b[^}]*\}\s*from\s*'\.\/journal-couverture'/.test(spec),
			`${SPEC_E2E} n'importe plus la table : la couverture déclarée ici ne serait plus ` +
				`jouée nulle part, et ce gate ne vérifierait qu'une liste morte.`,
		).toBe(true);
	});
});
