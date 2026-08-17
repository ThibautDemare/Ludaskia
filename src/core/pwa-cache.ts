/* ============================================================
   Cache hors-ligne (#306) — arithmétique PURE du précache.
   ------------------------------------------------------------
   Le service worker (`src/sw.ts`) reçoit au build la liste COMPLÈTE des fichiers
   publiés (`self.__WB_MANIFEST`), mais ne les traite pas tous de la même façon :

   - une part est mise en cache DÈS L'INSTALLATION (la coquille : les trois pages,
     le bundle, la CSS, la police, les images) — c'est ce qui doit être servi vite
     au retour de l'enfant ;
   - le reste (les 26 shards de verbes, ~850 Ko chargés en `import()` paresseux)
     est RÉCHAUFFÉ PLUS TARD, par petites tranches, quand l'application est calme.
     L'y inclure à l'installation rendrait la première visite lourde pour un
     contenu dont on n'a pas encore besoin.

   Ce module ne porte que le calcul : clé de cache d'une entrée, partition
   immédiat/différé, ce qui MANQUE, ce qui est OBSOLÈTE. Aucune API navigateur, donc
   testable sans service worker — c'est l'intérêt de l'avoir sorti de `sw.ts`.

   Clé de cache : la plupart des fichiers de Vite portent un hachage dans leur nom
   (`app-a1b2c3.js`), donc leur URL suffit à les identifier et une entrée déjà en
   cache SURVIT à un déploiement qui ne la change pas — sans ça, chaque mise en
   ligne recoûterait les 850 Ko de verbes. Les fichiers à nom STABLE (les trois
   `.html`, les images de `public/`) n'ont pas cette propriété : Workbox leur
   associe une `revision`, qu'on incorpore à la clé pour qu'un nouveau contenu
   soit une nouvelle entrée (l'ancienne étant retirée par la purge).
   ============================================================ */

/** Une entrée du manifeste injecté au build (forme Workbox). */
export interface EntreePrecache {
	url: string;
	/** Hachage du contenu pour les fichiers à nom stable ; absent/null si le nom est déjà haché. */
	revision?: string | null;
}

/* Le manifeste tel qu'injecté n'est pas directement exploitable, pour deux raisons.

   1. Ses URL sont RELATIVES à la racine du site publié (`assets/app-x.js`,
      `index.html`), alors que le worker travaille sur des chemins absolus
      (`/Ludaskia/assets/app-x.js`). On les rebase une fois pour toutes.
   2. Il contient des DOUBLONS : les icônes du manifeste web y figurent deux fois
      (une fois ramassées dans `public/`, une fois déclarées comme icônes). Sans
      dédoublonnage, le réchauffement les télécharge deux fois et le décompte de
      couverture annonce plus d'entrées qu'il n'y a de fichiers.

   On identifie un doublon par sa CLÉ DE CACHE, pas par son URL : deux entrées de
   même URL mais de révisions différentes sont bien deux choses distinctes. */
export function normaliserManifeste(manifeste: EntreePrecache[], base: string): EntreePrecache[] {
	const prefixe = base.endsWith('/') ? base : `${base}/`;
	const vues = new Set<string>();
	const out: EntreePrecache[] = [];
	for (const e of manifeste) {
		const absolue = e.url.startsWith('/')
			? e
			: { ...e, url: prefixe + e.url.replace(/^\.?\//, '') };
		const cle = cleCache(absolue);
		if (vues.has(cle)) continue;
		vues.add(cle);
		out.push(absolue);
	}
	return out;
}

/* Marqueur de révision dans la clé de cache. Nom volontairement distinct de celui de
   Workbox (`__WB_REVISION__`) : ce cache est le nôtre, pas un précache Workbox, et une
   collision de convention ferait croire à tort qu'ils sont interchangeables. */
const PARAM_REVISION = '__lud_rev';

/** Reconnaît un shard de verbes (`assets/verbs-03-a1b2c3.js`), qu'il soit chunk JS ou JSON. */
const RE_VERBES = /\/verbs-[^/]*$/;

/** Clé de cache d'une entrée : son URL, plus sa révision quand son nom ne la porte pas. */
export function cleCache(e: EntreePrecache): string {
	if (!e.revision) return e.url;
	const sep = e.url.includes('?') ? '&' : '?';
	return `${e.url}${sep}${PARAM_REVISION}=${e.revision}`;
}

/* Le réchauffement différé, c'est le lexique des verbes : gros, nombreux, et
   inutiles tant qu'aucune liste de dictée ne demande un verbe. Tout le reste est
   la coquille de l'app, sans laquelle il n'y a rien à afficher. */
export function estDiffere(url: string): boolean {
	return RE_VERBES.test(url);
}

/** Sépare ce qu'on met en cache à l'installation de ce qu'on réchauffera plus tard. */
export function partitionner(manifeste: EntreePrecache[]): {
	immediat: EntreePrecache[];
	differe: EntreePrecache[];
} {
	const immediat: EntreePrecache[] = [];
	const differe: EntreePrecache[] = [];
	for (const e of manifeste) (estDiffere(e.url) ? differe : immediat).push(e);
	return { immediat, differe };
}

/** Entrées absentes du cache, dans l'ordre du manifeste (le réchauffement en prend une tranche). */
export function manques(
	entrees: EntreePrecache[],
	presentes: ReadonlySet<string>,
): EntreePrecache[] {
	return entrees.filter((e) => !presentes.has(cleCache(e)));
}

/* Clés en cache qui n'appartiennent plus au build courant : anciennes versions des
   pages HTML, chunks d'un déploiement précédent. À purger à l'activation — c'est ce
   qui garde le cache borné SANS lui imposer de durée de vie (arbitré : pas
   d'expiration, l'objectif étant la couverture complète). Les entrées récupérées
   « à la demande » qui ne sont pas au manifeste (rien d'autre n'est publié sous
   `base`) tombent dans le même filet, ce qui est voulu. */
export function obsoletes(manifeste: EntreePrecache[], presentes: Iterable<string>): string[] {
	const attendues = new Set(manifeste.map(cleCache));
	return [...presentes].filter((k) => !attendues.has(k));
}

/** Couverture hors-ligne : combien d'entrées du manifeste sont déjà en cache. */
export function couverture(
	manifeste: EntreePrecache[],
	presentes: ReadonlySet<string>,
): { present: number; total: number; complet: boolean } {
	const total = manifeste.length;
	const present = manifeste.filter((e) => presentes.has(cleCache(e))).length;
	return { present, total, complet: total > 0 && present === total };
}
