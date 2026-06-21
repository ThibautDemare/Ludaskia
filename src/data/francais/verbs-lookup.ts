/* ============================================================
   Lookup runtime des formes conjuguées (issue #261).
   ------------------------------------------------------------
   Les ~7800 verbes du lexique LEFFF sont pré-générés au build en shards JSON
   (tools/verbs/generate-verbs.mjs) dans `./verbs/`. Ce module en charge UN seul
   à la demande : recherche dichotomique du shard via le manifeste, puis
   `import()` paresseux (chunk Vite séparé, mis en cache après le 1er accès).
   Le dataset brut LEFFF (6,3 Mo) n'est jamais embarqué.

   ⚠ JUMELAGE : `stripPronominal` / `normVerbKey` DOIVENT rester byte-identiques
   à leurs jumelles de tools/verbs/generate-verbs.mjs, et la comparaison de clés
   DOIT être la même (chaînes NFC brutes, jamais `localeCompare`). Sinon la
   dichotomie échoue silencieusement. Couvert par tests/verbs-lookup.test.ts.
   ============================================================ */

import manifestRaw from './verbs/manifest.json';

/** Temps couverts par la bibliothèque (extensible : futur, imparfait…). */
export type VerbTense = 'present';

/** Formes d'un temps, dans l'ordre des personnes : je, tu, il, nous, vous, ils. */
export type FormesConjuguees = [string, string, string, string, string, string];

interface ShardEntry {
	present?: FormesConjuguees;
}
type Shard = Record<string, ShardEntry | undefined>;
interface ManifestEntry {
	first: string;
	file: string;
}

const MANIFEST = manifestRaw as ManifestEntry[];

/* Loaders paresseux des shards (chunks séparés). On exclut `manifest.json` du
   glob en ne ciblant que `verbs-*.json`. */
const SHARDS = import.meta.glob<{ default: Shard }>('./verbs/verbs-*.json');

const shardCache = new Map<string, Shard>();

/* ---------- Normalisation JUMELÉE (cf. generate-verbs.mjs) ---------- */

/* Retire le préfixe pronominal d'une saisie : « se laver » → « laver »,
   « s'enfuir » → « enfuir ». Les infinitifs LEFFF n'ont ni espace ni apostrophe,
   donc un vrai verbe (« semer », « séduire ») n'est jamais amputé. */
export function stripPronominal(inf: string): string {
	const s = inf.trimStart();
	if (/^se\s+/.test(s)) return s.replace(/^se\s+/, '');
	if (/^s['’]/.test(s)) return s.replace(/^s['’]/, '');
	return s;
}

/* Clé de recherche d'un verbe : NFC + minuscules (locale fr) + sans pronominal. */
export function normVerbKey(inf: string): string {
	return stripPronominal(inf.normalize('NFC').toLocaleLowerCase('fr')).trim();
}

/* ---------- Recherche du shard (dichotomie sur le manifeste) ---------- */

/* Renvoie le nom du shard susceptible de contenir `key` : le dernier shard dont
   la clé-frontière `first` est <= key. null si `key` précède tout le lexique. */
function shardFileFor(key: string): string | null {
	if (MANIFEST.length === 0 || key < MANIFEST[0].first) return null;
	let lo = 0;
	let hi = MANIFEST.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (MANIFEST[mid].first <= key) lo = mid;
		else hi = mid - 1;
	}
	return MANIFEST[lo].file;
}

async function loadShard(file: string): Promise<Shard> {
	const cached = shardCache.get(file);
	if (cached) return cached;
	const loader = SHARDS[`./verbs/${file}`];
	if (!loader) return {};
	const mod = await loader();
	const shard = mod.default ?? {};
	shardCache.set(file, shard);
	return shard;
}

/* ---------- API publique ---------- */

/* Formes conjuguées d'un verbe à un temps donné, ou null si le verbe est absent
   du lexique (= « ce n'est pas un verbe connu »). La requête est normalisée
   (casse, NFC, préfixe pronominal). Les formes viennent STRICTEMENT de LEFFF. */
export async function lookupConjugatedForms(
	infinitif: string,
	temps: VerbTense,
): Promise<FormesConjuguees | null> {
	const key = normVerbKey(infinitif);
	if (!key) return null;
	const file = shardFileFor(key);
	if (!file) return null;
	const shard = await loadShard(file);
	const forms = shard[key]?.[temps];
	return forms && forms.length === 6 ? forms : null;
}

/* Détection : la saisie correspond-elle à un verbe connu du lexique ? */
export async function estVerbe(infinitif: string): Promise<boolean> {
	return (await lookupConjugatedForms(infinitif, 'present')) !== null;
}
