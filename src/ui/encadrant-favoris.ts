/* ============================================================
   Espace encadrant (#636) — les BILANS FAVORIS d'un profil.
   ------------------------------------------------------------
   Tout ce que l'espace encadrant fait des « bilans favoris » d'un profil consulté, en un
   seul endroit : les cases à cocher d'une étape « Un bilan favori » du programme du jour,
   et la section qui les liste et les supprime.

   Pourquoi un module à part : `encadrant-seance.ts` compose le programme du jour et passait
   les 1000 lignes en accueillant ce bloc, qui est une sous-vue autonome (son propre rendu,
   sa propre confirmation, son propre nettoyage). Même arbitrage que #641 sur les runners.

   La SUPPRESSION d'un favori vit ici, et plus sur l'écran de l'enfant (#636) : dès qu'une
   étape de programme peut viser un favori, laisser la corbeille sous sa main revient à lui
   laisser effacer une consigne de l'adulte sans que personne ne le sache. La CRÉATION, elle,
   lui reste : il compose et enregistre depuis son écran. Asymétrie assumée au cadrage.

   Ce module ne porte AUCUN état : le re-rendu et le message d'alerte de la carte restent à
   `encadrant-seance.ts`, qui décide quoi faire du booléen que `supprimerFavori` renvoie.
   ============================================================ */
import { icon } from './icon';
import type { Profile } from '../core/profiles';
import { loadBilansFor, deleteBilanFor } from '../core/bilans';
import { bilanMode, type BilanConfig } from '../core/catalog';
import {
	ciblesEtape,
	chargerSeancesFor,
	enregistrerSeancesFor,
	type FavoriDispo,
	type SeanceDef,
	type SeanceEtape,
} from '../core/seance';
import { uiConfirm } from './ui-modal';
import { html, type SafeHtml, joindre, drapeau, VIDE } from '../core/html';

/* Bilans favoris du profil CONSULTÉ (#636), dans l'ordre d'enregistrement. Lus par UUID :
   l'espace encadrant ne bascule jamais le profil actif. */
export function favorisProfil(uuid: string): BilanConfig[] {
	return loadBilansFor(uuid);
}

/* Repère sous la liste à cocher des favoris (#636). Même grammaire que `hintDictees` : on
   compte ce qui est ATTEIGNABLE, et on prévient quand l'activité ne paraîtra pas. Le cas
   « ce profil n'a aucun favori » est le plus important des trois : c'est le seul où l'adulte
   ne peut rien faire depuis cet écran, et où un cadre vide et muet le laisserait chercher. */
export function hintFavoris(atteignables: number, coches: number, total: number): string {
	if (total === 0)
		return "Ce profil n'a pas encore de bilan favori : il s'enregistre depuis l'écran de l'enfant, en composant une sélection de leçons.";
	if (coches === 0) return 'Choisissez au moins un bilan favori.';
	if (atteignables === 0)
		return "Tant qu'aucun bilan favori coché n'est disponible, cette activité n'apparaîtra pas dans le programme.";
	if (atteignables === 1) return 'Un seul bilan : toujours celui-ci.';
	return `${atteignables} bilans : un au hasard à chaque lancement.`;
}

/* Un favori, tel qu'il se lit dans le composeur : son nom, et de quoi il est fait. Le MODE
   est dit en toutes lettres (#636, critère 3) — « Sprint 5 min » et « Bilan » ne se font pas
   la même promesse de durée, et rien d'autre à l'écran ne les distinguerait. */
export function detailFavori(b: BilanConfig): string {
	const n = b.lessonIds.length;
	const lecons = `${n} leçon${n > 1 ? 's' : ''}`;
	return bilanMode(b) === 'sprint' ? `Sprint 5 min · ${lecons}` : `Bilan · ${lecons}`;
}

/* Cases à cocher des bilans favoris visés par une étape « Un bilan favori » (#636). Même
   forme que le pool de dictées : 1 coché ⇒ toujours celui-là, 2+ ⇒ un au hasard au
   lancement. Pas de garde « au moins un coché » ici, contrairement aux dictées (#657) : le
   critère 18 admet le pool vidé comme un état légitime, que le cœur escamote proprement. */
export function checkboxesFavorisHTML(
	def: SeanceDef,
	etape: SeanceEtape,
	favoris: BilanConfig[],
): SafeHtml {
	const selected = ciblesEtape(etape);
	const dispo = new Set(favoris.map((b) => b.id));
	const hintId = `favori-hint-${def.id}-${etape.id}`;
	const cases = joindre(
		favoris.map((b) => {
			const on = selected.includes(b.id);
			return html`<label class="enc-seance-favori${on ? ' on' : ''}"><input type="checkbox" data-act="seance-favori-toggle" data-def="${def.id}" data-etape="${etape.id}" data-ref="${b.id}" aria-describedby="${hintId}"${on ? drapeau('checked') : ''} /><span class="enc-seance-favori-nom">${b.label}</span><span class="enc-seance-favori-detail">${detailFavori(b)}</span></label>`;
		}),
	);
	const hint = hintFavoris(
		selected.filter((id) => dispo.has(id)).length,
		selected.length,
		favoris.length,
	);
	return html`<fieldset class="enc-seance-favoris" data-def="${def.id}" data-etape="${etape.id}">
      <legend class="sr-only">Bilans favoris visés (un ou plusieurs)</legend>
      ${cases}
      <p id="${hintId}" class="enc-seance-favoris-hint">${hint}</p>
    </fieldset>`;
}

/* ---------- Gestion des bilans favoris (#636) ---------- */
/* La SUPPRESSION d'un favori vit ici, et plus sur l'écran de l'enfant. Dès qu'une étape de
   programme peut viser un favori, laisser la corbeille sous sa main revient à lui laisser
   effacer une consigne de l'adulte sans que personne ne le sache. La CRÉATION, elle, lui
   reste : il compose et enregistre depuis son écran. Asymétrie assumée au cadrage. */

/* Programmes du profil dont une étape vise ce favori. Sert à prévenir AVANT de supprimer :
   sans ça, l'adulte défait sa propre consigne sans le savoir. */
export function programmesVisant(defs: SeanceDef[], favoriId: string): SeanceDef[] {
	return defs.filter((d) =>
		d.etapes.some((e) => e.kind === 'favori' && ciblesEtape(e).includes(favoriId)),
	);
}

/* Retire un favori supprimé des pools qui le visaient, chez CE profil seulement. Sans ce
   nettoyage, l'étape garderait une cible fantôme : invisible côté enfant (le cœur l'écarte),
   mais toujours cochée côté adulte, qui la croirait active. */
export function retirerFavoriDesEtapes(uuid: string, favoriId: string): void {
	const defs = chargerSeancesFor(uuid);
	let touche = false;
	for (const d of defs)
		for (const e of d.etapes) {
			if (e.kind !== 'favori') continue;
			const restants = ciblesEtape(e).filter((id) => id !== favoriId);
			if (restants.length === ciblesEtape(e).length) continue;
			e.refs = restants;
			delete e.ref;
			touche = true;
		}
	if (touche) enregistrerSeancesFor(uuid, defs);
}

export function gestionFavorisHTML(consulte: Profile, defs: SeanceDef[]): SafeHtml {
	const favoris = favorisProfil(consulte.uuid);
	const titre = html`<h3 class="enc-h3">${icon('cards')} Bilans favoris de ${consulte.name}</h3>`;
	if (!favoris.length)
		return html`<div class="enc-block enc-seance-favoris-gestion">
      ${titre}
      <p class="enc-hint">${consulte.name} n'a pas encore enregistré de bilan favori. Ils se composent depuis son écran, et vous pouvez les supprimer ici.</p>
    </div>`;
	const lignes = joindre(
		favoris.map((b) => {
			const vise = programmesVisant(defs, b.id).length;
			const repere = vise
				? html`<span class="enc-favori-gere-vise">${icon('calendar')} utilisé par ${vise} programme${vise > 1 ? 's' : ''}</span>`
				: VIDE;
			return html`<div class="enc-favori-gere" data-id="${b.id}">
          <div class="enc-favori-gere-info">
            <span class="enc-favori-gere-nom">${b.label}</span>
            <span class="enc-favori-gere-detail">${detailFavori(b)}</span>
            ${repere}
          </div>
          <button type="button" class="enc-btn-sec enc-danger" data-act="seance-favori-del" data-id="${b.id}" aria-label="Supprimer le bilan favori ${b.label}">${icon('trash')} Supprimer</button>
        </div>`;
		}),
	);
	return html`<div class="enc-block enc-seance-favoris-gestion">
      ${titre}
      <p class="enc-hint">${consulte.name} compose ses bilans favoris depuis son écran ; c'est ici que vous les supprimez, pour qu'une activité du programme ne disparaisse pas d'un clic.</p>
      ${lignes}
    </div>`;
}

/* Désigne les programmes qui visent un favori, DANS une phrase (« ce bilan est une activité
   … »). On ne réutilise pas `nomProgramme` ici : il rend « Un autre programme » pour un
   programme sans nom, ce qui donnait « une activité de Un autre programme ». On compte donc,
   et on ne nomme que si TOUS les programmes concernés ont un nom — un nom sur deux serait
   plus déroutant qu'un simple compte. */
export function designationProgrammes(defs: SeanceDef[]): string {
	const nommes = defs.map((d) => d.nom).filter((n): n is string => !!n);
	const liste =
		nommes.length === defs.length ? ` (${nommes.map((n) => `« ${n} »`).join(', ')})` : '';
	return defs.length === 1
		? `d'un programme du jour${liste}`
		: `de ${defs.length} programmes du jour${liste}`;
}

/* Supprime un bilan favori du profil consulté (#636). Confirmation NOMMÉE (« Supprimer
   « X » ? »), comme le faisait l'écran de l'enfant : on désigne l'objet par son nom plutôt
   que par le mot « bilan », et l'adulte hérite du même repère. Quand des programmes le
   visent, le message le DIT avant d'agir — c'est la seule information que l'adulte n'a pas
   sous les yeux au moment de cliquer, et sans elle il défait sa propre consigne. */
export async function supprimerFavori(consulte: Profile, id: string): Promise<boolean> {
	if (!id) return false;
	const favori = favorisProfil(consulte.uuid).find((b) => b.id === id);
	if (!favori) return false;
	const vise = programmesVisant(chargerSeancesFor(consulte.uuid), id);
	const ok = await uiConfirm({
		title: `Supprimer « ${favori.label} » ?`,
		message: vise.length
			? `Ce bilan est une activité ${designationProgrammes(vise)}. Il en sera retiré, et ${consulte.name} ne pourra plus le lancer.`
			: `${consulte.name} ne pourra plus le lancer.`,
		confirmLabel: 'Supprimer',
		cancelLabel: 'Annuler',
		destructive: true,
		confirmIcon: 'trash',
		emoji: '🗑️',
	});
	if (!ok) return false;
	deleteBilanFor(consulte.uuid, id);
	// Ordre voulu : on supprime d'abord, on nettoie ensuite. L'inverse laisserait, si la
	// suppression échouait, des étapes amputées d'une cible qui existe encore.
	retirerFavoriDesEtapes(consulte.uuid, id);
	return true;
}

/** Favoris d'un profil sous la forme que le cœur attend (#636) : de quoi savoir si une étape
    a encore une cible, et de quoi estimer sa durée. Ni libellé ni liste de leçons — ils
    n'appartiennent qu'au rendu, juste au-dessus. */
export function favorisDispo(uuid: string): FavoriDispo[] {
	return favorisProfil(uuid).map((b) => ({
		id: b.id,
		nbLecons: b.lessonIds.length,
		mode: bilanMode(b),
	}));
}
