/* ============================================================
   Espace encadrant (#234, découpage #354) — RÉGLAGES.
   ------------------------------------------------------------
   Réglages posés par l'adulte sur le profil CONSULTÉ (écrits par UUID via setXxxFor,
   sans changer le profil/niveau actif) : classe de référence + niveau par matière,
   et aménagements « dys »/attention. Le bloc « Code d'accès » (verrou PIN) est rendu
   par `encadrant-pin` et injecté ici par l'orchestrateur (`pinBlock`), car il vit dans
   la même section « Réglages ».
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { icon } from './icon';
import {
	setNiveauReferenceFor,
	setNiveauMatiereFor,
	setPrefFor,
	type Profile,
} from '../core/profiles';
import { getAllLessons, SUBJECTS, type SchoolLevel } from '../core/catalog';
import { availableLevels, LEVEL_LABEL } from '../core/levels';
import { REVISION_PLAFOND, REVISION_PLAFOND_CHOIX } from '../core/revision';
import { dicteeDisponible } from './tts';
import { consulteUuid, renderEspace } from './encadrant-commun';

/* La section « Réglages » : classe + aménagements + bloc PIN (rendu par le module pin
   et passé en `pinBlock` par l'orchestrateur). */
export function reglagesHTML(consulte: Profile, pinBlock: string): string {
	return `<section class="enc-section">
      <h2 class="enc-h2">Réglages</h2>
      ${classeHTML(consulte)}
      ${amenagementsHTML(consulte)}
      ${plafondRevisionHTML(consulte)}
      ${pinBlock}
    </section>`;
}

/* Longueur d'une séance de Révision (#439), réglée par l'adulte sur le profil CONSULTÉ
   (setPrefFor, sans changer le profil actif). Menu à paliers fixes (REVISION_PLAFOND_CHOIX,
   déjà bornés côté programme) : pas de saisie libre, donc pas de valeur extrême possible.
   Le défaut (REVISION_PLAFOND) est marqué et reste sélectionné pour un profil non réglé. */
function plafondRevisionHTML(consulte: Profile): string {
	const actuel = consulte.prefs?.revisionPlafond ?? REVISION_PLAFOND;
	// Valeur affichée : le palier stocké s'il fait partie de la liste, sinon on retombe
	// sur le défaut (donnée importée hors paliers → pas d'option « fantôme » à afficher).
	const sel = REVISION_PLAFOND_CHOIX.includes(actuel) ? actuel : REVISION_PLAFOND;
	const opts = REVISION_PLAFOND_CHOIX.map(
		(n) =>
			`<option value="${n}"${n === sel ? ' selected' : ''}>${n}${n === REVISION_PLAFOND ? ' (par défaut)' : ''}</option>`,
	).join('');
	return `<div class="enc-block">
      <h3 class="enc-h3">Séance de révision</h3>
      <label class="enc-row"><span>Nombre de questions par séance</span>
        <select class="enc-select-niveau" data-act="set-revision-plafond">${opts}</select></label>
      <p class="enc-hint">Ajustez la longueur d'une séance de révision selon l'attention de l'enfant (par défaut ${REVISION_PLAFOND}).</p>
    </div>`;
}

/* Aménagements « dys »/attention posés par l'adulte (avis specialiste-troubles-
   apprentissage) : masquer le minuteur (pression temporelle) + lecture auto des
   consignes. Stables (l'enfant ne les bascule pas par jeu) ; l'écoute À LA DEMANDE
   reste toujours dispo côté enfant. Écrits sur le profil CONSULTÉ (setPrefFor). */
function amenagementsHTML(consulte: Profile): string {
	const prefs = consulte.prefs ?? {};
	const voix = dicteeDisponible();
	return `<div class="enc-block">
      <h3 class="enc-h3">Aménagements</h3>
      <p class="enc-hint">Réglages d'accompagnement posés par l'adulte (l'enfant ne peut pas les changer).</p>
      <label class="enc-toggle">
        <input type="checkbox" data-act="set-amenagement" data-pref="sansPressionTemporelle"${prefs.sansPressionTemporelle ? ' checked' : ''} />
        <span>Masquer le minuteur pendant les sprints <small class="enc-hint">(moins de pression ; le score s'affiche à la fin)</small></span>
      </label>
      <label class="enc-toggle${voix ? '' : ' enc-toggle-off'}">
        <input type="checkbox" data-act="set-amenagement" data-pref="lectureConsigneAuto"${prefs.lectureConsigneAuto ? ' checked' : ''}${voix ? '' : ' disabled'} />
        <span>Lire la consigne à voix haute automatiquement</span>
      </label>
      <p class="enc-hint">${
				voix
					? `${icon('speaker')} Lecture vocale disponible sur cet appareil.`
					: `${icon('speaker')} Lecture vocale indisponible sur cet appareil (aucune voix française).`
			}</p>
      <label class="enc-toggle">
        <input type="checkbox" data-act="set-amenagement" data-pref="sansApparitionsSurprises"${prefs.sansApparitionsSurprises ? ' checked' : ''} />
        <span>Désactiver les apparitions surprises <small class="enc-hint">(petites surprises qui passent parfois à l'écran, ex. une luciole — à couper pour un enfant qu'un mouvement inattendu déconcentre)</small></span>
      </label>
    </div>`;
}

function classeHTML(consulte: Profile): string {
	const niveaux = availableLevels(getAllLessons());
	if (niveaux.length < 2) return ''; // un seul niveau au catalogue → aucun choix utile
	const ref = consulte.niveauReference ?? niveaux[0];
	const parMat = consulte.niveauParMatiere ?? {};
	const opts = (sel: string | undefined) =>
		niveaux
			.map(
				(lv) => `<option value="${lv}"${lv === sel ? ' selected' : ''}>${LEVEL_LABEL[lv]}</option>`,
			)
			.join('');
	const matieres = SUBJECTS.map(
		(s) => `<label class="enc-row">
          <span>${escapeHTML(s.label)}</span>
          <select class="enc-select-niveau" data-act="set-niveau-mat" data-subject="${s.id}">
            <option value=""${parMat[s.id] ? '' : ' selected'}>Comme la classe</option>
            ${opts(parMat[s.id])}
          </select>
        </label>`,
	).join('');
	return `<div class="enc-block">
      <h3 class="enc-h3">Classe de ${escapeHTML(consulte.name)}</h3>
      <div class="enc-niveau">
        <label class="enc-row"><span><strong>Classe</strong></span>
          <select class="enc-select-niveau" data-act="set-niveau-ref">${opts(ref)}</select></label>
        ${matieres}
      </div>
      <p class="enc-hint">« Comme la classe » suit la classe choisie ; ajustez une matière au besoin.</p>
    </div>`;
}

/* ---------- Handlers délégués (aiguillés par l'orchestrateur) ---------- */
export function reglagesChange(act: string, t: HTMLInputElement | HTMLSelectElement): boolean {
	const uuid = consulteUuid();
	if (act === 'set-niveau-ref' && uuid) {
		setNiveauReferenceFor(uuid, t.value as SchoolLevel);
		renderEspace();
		return true;
	}
	if (act === 'set-niveau-mat' && uuid) {
		setNiveauMatiereFor(
			uuid,
			(t as HTMLElement).dataset.subject ?? '',
			(t.value || undefined) as SchoolLevel | undefined,
		);
		renderEspace();
		return true;
	}
	if (act === 'set-revision-plafond' && uuid) {
		// Le bornage/fallback est fait à la LECTURE (getRevisionPlafond) : ici on écrit
		// simplement le palier choisi (toujours une valeur de REVISION_PLAFOND_CHOIX).
		// Pas de renderEspace() : rien d'autre à l'écran ne dépend de ce réglage, et un
		// re-rendu détruirait le <select> → perte du focus clavier pour rien (avis a11y).
		setPrefFor(uuid, 'revisionPlafond', Number(t.value));
		return true;
	}
	if (act === 'set-amenagement' && uuid) {
		const pref = (t as HTMLElement).dataset.pref as
			'sansPressionTemporelle' | 'lectureConsigneAuto' | 'sansApparitionsSurprises';
		setPrefFor(uuid, pref, (t as HTMLInputElement).checked);
		renderEspace();
		return true;
	}
	return false;
}
