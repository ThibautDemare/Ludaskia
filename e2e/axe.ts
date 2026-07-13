/* ============================================================
   Helper de scan d'accessibilité automatique (axe-core) pour les
   smoke tests e2e (#411).

   Complète — sans le remplacer — l'agent-conseil `relecteur-accessibilite`
   (jugement sémantique, qualité du TTS, pertinence contextuelle) par un
   signal AUTOMATISÉ : `@axe-core/playwright` injecte axe-core dans la page
   pilotée par Playwright et remonte les violations WCAG mesurables
   (contraste, libellés ARIA, `<title>`/`<desc>` des figures SVG, ordre des
   titres, rôles…).

   Périmètre du scan : WCAG 2.0/2.1 niveaux A + AA (les tags ci-dessous).
   On ÉCARTE délibérément les règles « best-practice » d'axe (bruit non
   normatif) pour garder un rapport exploitable ; la référence reste WCAG AA,
   cible d'une app enfant sur tablette.
   ============================================================ */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { AxeResults, Result, NodeResult } from 'axe-core';

/* Tags axe correspondant à WCAG 2.0/2.1 niveaux A et AA. */
export const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

/* Lance axe-core sur la page COURANTE (telle qu'elle est rendue à l'instant de
   l'appel : la vue doit déjà être stable — cf. attente d'un élément repère dans
   la spec). `include` restreint le scan à un sous-arbre (ex. une modale ouverte).
   Ne juge pas : renvoie le résultat brut, la spec décide quoi en faire. */
export async function scanA11y(
	page: Page,
	opts: { tags?: readonly string[]; include?: string } = {},
): Promise<AxeResults> {
	const builder = new AxeBuilder({ page }).withTags([...(opts.tags ?? WCAG_AA_TAGS)]);
	if (opts.include) builder.include(opts.include);
	return builder.analyze();
}

/* Sévérité → poids, pour trier le rapport du plus grave au plus léger. */
const IMPACT_WEIGHT: Record<string, number> = { critical: 4, serious: 3, moderate: 2, minor: 1 };
const impactOf = (r: { impact?: string | null }): string => r.impact ?? 'n/a';

/* Rend une cible axe (chaîne de sélecteurs, éventuellement multi-frame) en une
   seule chaîne lisible. */
function renderTarget(target: NodeResult['target']): string {
	return (target as unknown[])
		.map((t) => (typeof t === 'string' ? t : JSON.stringify(t)))
		.join(' ');
}

/* Résumé compact des impacts d'une liste de violations (ex. « critical×1 serious×3 »). */
function impactSummary(violations: Result[]): string {
	const counts: Record<string, number> = {};
	for (const v of violations) counts[impactOf(v)] = (counts[impactOf(v)] ?? 0) + 1;
	return (
		Object.entries(counts)
			.sort((a, b) => (IMPACT_WEIGHT[b[0]] ?? 0) - (IMPACT_WEIGHT[a[0]] ?? 0))
			.map(([imp, n]) => `${imp}×${n}`)
			.join(' ') || '—'
	);
}

const MAX_ELEMENTS_PAR_REGLE = 10; // borne d'affichage console (le JSON attaché reste complet)

/* Formate les violations d'UNE vue en un bloc texte lisible, REGROUPÉ PAR RÈGLE
   puis par élément (critère #411). Trié par sévérité décroissante. Destiné à être
   lu tel quel dans les logs CI par un humain OU un agent — sans décorticage. */
export function formatA11yReport(view: string, hash: string, results: AxeResults): string {
	const violations = [...results.violations].sort(
		(a, b) => (IMPACT_WEIGHT[impactOf(b)] ?? 0) - (IMPACT_WEIGHT[impactOf(a)] ?? 0),
	);
	const header = `[axe] ${view} (#${hash}) — ${violations.length} violation(s)`;
	if (violations.length === 0) {
		return `${header}\n  OK : aucune violation WCAG A/AA détectée.`;
	}

	const lines = [`${header} · ${impactSummary(violations)}`];
	for (const v of violations) {
		lines.push(`  ● [${impactOf(v)}] ${v.id} — ${v.help}`);
		lines.push(`      doc : ${v.helpUrl}`);
		lines.push(`      ${v.nodes.length} élément(s) :`);
		for (const node of v.nodes.slice(0, MAX_ELEMENTS_PAR_REGLE)) {
			lines.push(`        - ${renderTarget(node.target)}`);
		}
		if (v.nodes.length > MAX_ELEMENTS_PAR_REGLE) {
			lines.push(`        … (+${v.nodes.length - MAX_ELEMENTS_PAR_REGLE} autre(s))`);
		}
	}
	return lines.join('\n');
}
