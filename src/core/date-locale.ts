/* ============================================================
   Date LOCALE de l'appareil : le jour tel que l'enfant le vit, pas le jour UTC.
   Module pur et sans dépendance : la vitrine l'importe (par `decor-saison.ts`), et elle
   ne charge ni profils ni stockage.

   Un seul format pour tout ce qui compte des jours : la série (`progress.ts:todayStr`) et
   les jours de travail de décembre (`jours-decembre.ts`, #785). S'ils divergeaient, le
   journal et le décompte de décembre ne parleraient plus du même jour.
   ============================================================ */

/** Décembre pour `Date.getMonth()`, qui compte les mois à partir de 0. */
export const DECEMBRE = 11;

/** Jour local `AAAA-MM-JJ`. */
export function jourLocal(d: Date): string {
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const jj = String(d.getDate()).padStart(2, '0');
	return `${d.getFullYear()}-${mm}-${jj}`;
}
