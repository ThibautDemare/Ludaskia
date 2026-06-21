#!/usr/bin/env node
/*
 * Pré-génération de la bibliothèque de formes conjuguées (issue #261).
 *
 * Usage : node tools/verbs/generate-verbs.mjs [tailleShard]
 *   - tailleShard : nombre de verbes par shard (défaut 300).
 *
 * Lit le lexique LEFFF (devDependency `french-verbs-lefff`, ~7800 verbes) au
 * BUILD UNIQUEMENT et produit, dans `src/data/francais/verbs/` :
 *   - des shards JSON (~300 verbes chacun), format imbriqué par temps
 *     `{ "<cléVerbe>": { "present": [je,tu,il,nous,vous,ils] } }` ;
 *   - un `manifest.json` ordonné `[{ first: <1re clé du shard>, file }]` qui
 *     permet une recherche dichotomique du shard pertinent au runtime ;
 *   - `ATTRIBUTION.md` (notice LGPLLR du lexique dérivé).
 *
 * On ne livre JAMAIS `conjugations.json` brut (6,3 Mo) au client : seules ces
 * formes du présent (sous-ensemble dérivé) sont embarquées, en chunks chargés
 * paresseusement. Régénérer après une montée de version du lexique :
 * `npm run verbs:gen`.
 *
 * Licences : le CODE de `french-verbs`/`french-verbs-lefff` est Apache-2.0 ; les
 * DONNÉES de conjugaison (et donc les shards dérivés) restent sous LGPLLR
 * (Lesser General Public License For Linguistic Resources). Cf. ATTRIBUTION.md.
 *
 * ⚠ JUMELAGE : `normVerbKey` / `stripPronominal` ci-dessous DOIVENT rester
 * byte-identiques à leurs jumelles de `src/data/francais/verbs-lookup.ts`, et le
 * tri DOIT utiliser la même comparaison de chaînes NFC brute (jamais
 * `localeCompare`, non reproductible Node↔navigateur). Un test de cohérence
 * (`tests/verbs-lookup.test.ts`) vérifie que le manifeste est trié dans l'ordre
 * runtime.
 */
/* global process, console */ // script Node en ligne de commande
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lefff = require('french-verbs-lefff/dist/conjugations.json');
const { getConjugation } = require('french-verbs');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', '..', 'src', 'data', 'francais', 'verbs');
const SHARD_SIZE = Number(process.argv[2]) || 300;

/* ---------- Normalisation JUMELÉE (cf. verbs-lookup.ts) ---------- */

/* Retire le préfixe pronominal d'une saisie : « se laver » → « laver »,
   « s'enfuir » → « enfuir ». Les infinitifs LEFFF n'ont ni espace ni apostrophe,
   donc un vrai verbe (« semer », « séduire ») n'est jamais amputé. */
function stripPronominal(inf) {
	const s = inf.trimStart();
	if (/^se\s+/.test(s)) return s.replace(/^se\s+/, '');
	if (/^s['’]/.test(s)) return s.replace(/^s['’]/, '');
	return s;
}

/* Clé de recherche d'un verbe : NFC + minuscules (locale fr) + sans pronominal. */
function normVerbKey(inf) {
	return stripPronominal(inf.normalize('NFC').toLocaleLowerCase('fr')).trim();
}

/* Comparaison déterministe par code-points NFC (identique au runtime). */
function compareKeys(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}

/* ---------- Extraction des formes du présent ---------- */

function presentForms(verb) {
	const forms = [];
	for (let p = 0; p < 6; p++) {
		let f;
		try {
			f = getConjugation(lefff, verb, 'PRESENT', p, {}, false, undefined, undefined, 'Act');
		} catch {
			return null;
		}
		if (typeof f !== 'string' || f.length === 0) return null;
		forms.push(f);
	}
	return forms;
}

/* ---------- Construction de la bibliothèque ---------- */

const entries = []; // [{ key, present }]
let skipped = 0;
for (const verb of Object.keys(lefff)) {
	const key = normVerbKey(verb);
	if (!key) {
		skipped++;
		continue;
	}
	const present = presentForms(verb);
	if (!present) {
		skipped++; // verbe défectif / impersonnel (présent incomplet)
		continue;
	}
	entries.push({ key, present });
}

// Tri + déduplication des clés (au cas où deux entrées LEFFF normalisent pareil).
entries.sort((a, b) => compareKeys(a.key, b.key));
const deduped = [];
for (const e of entries) {
	if (deduped.length && deduped[deduped.length - 1].key === e.key) continue;
	deduped.push(e);
}

/* ---------- Écriture des shards + manifeste ---------- */

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const manifest = [];
const nbShards = Math.ceil(deduped.length / SHARD_SIZE);
const width = String(nbShards - 1).length;
for (let i = 0; i < nbShards; i++) {
	const slice = deduped.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE);
	const file = `verbs-${String(i).padStart(width, '0')}.json`;
	const shard = {};
	for (const e of slice) shard[e.key] = { present: e.present };
	writeFileSync(join(OUT_DIR, file), JSON.stringify(shard) + '\n');
	manifest.push({ first: slice[0].key, file });
}
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, '\t') + '\n');

writeFileSync(
	join(OUT_DIR, 'ATTRIBUTION.md'),
	`<!-- Fichier généré par tools/verbs/generate-verbs.mjs — ne pas éditer à la main. -->

# Formes conjuguées — attribution

Les fichiers \`verbs-*.json\` de ce dossier sont un **sous-ensemble dérivé** (formes
du présent de l'indicatif) du lexique **LEFFF** (Lexique des Formes Fléchies du
Français), via le package npm \`french-verbs-lefff\`.

- Données de conjugaison : **LGPLLR** (Lesser General Public License For
  Linguistic Resources) — <http://www.labri.fr/perso/clement/lefff/licence-LGPLLR.html>
- Outillage \`french-verbs\` / \`french-verbs-lefff\` : Apache-2.0, © Ludan Stoecklé.

Le dataset brut (\`conjugations.json\`, ~6,3 Mo) n'est pas livré au client : seules
ces formes pré-générées sont embarquées, et chargées paresseusement.
`,
);

console.log(
	`verbs:gen → ${deduped.length} verbes, ${nbShards} shards (taille ${SHARD_SIZE}), ` +
		`${skipped} ignorés (présent incomplet). Sortie : src/data/francais/verbs/`,
);
