/* ============================================================
   Espace encadrant (#234, découpage #354) — PROFILS & sauvegarde.
   ------------------------------------------------------------
   Liste des profils en CONSULTATION (« Voir le suivi » → bascule le profil consulté,
   ≠ profil actif) et GESTION réservée à l'adulte (renommer, avatar, réinitialiser,
   supprimer, créer), plus l'export/import de tous les profils. Possède l'état de la
   palette d'avatar ouverte (`gestionEmojiFor`). Dépend de `encadrant-pin` uniquement
   pour refermer le sous-panneau « code » quand on change de profil consulté.
   ============================================================ */

import { icon } from './icon';
import {
	listProfiles,
	activeProfile,
	addProfile,
	renameProfile,
	setProfileEmoji,
	resetProfile,
	deleteProfile,
	exportProfiles,
	importProfiles,
	getXPFor,
	type Profile,
} from '../core/profiles';
import { emojiPaletteHTML } from './render';
import { niveauDepuisXP } from '../core/progress';
import { applyPreferences } from './preferences';
import { uiConfirm, uiPrompt, toast } from './ui-modal';
import { consulteUuid, setConsulteUuid, renderEspace, telechargerBlob } from './encadrant-commun';
import { resetPinPanel } from './encadrant-pin';
import { html, type SafeHtml, joindre, drapeau } from '../core/html';

/* ---------- État de la section (module) ---------- */
let gestionEmojiFor: string | null = null; // profil dont la palette d'avatar est ouverte (gestion)

/* Liste des profils : CONSULTER (« Voir le suivi » → recap ci-dessous) + GÉRER
   (renommer/avatar/réinitialiser/supprimer, replié). Action de gestion = encadrant
   UNIQUEMENT (un enfant ne touche pas aux profils des autres). Suppression désactivée
   s'il ne reste qu'un profil. La bascule du profil ACTIF reste au menu de la barre. */
export function profilsHTML(profiles: Profile[], consulte: Profile, actif: Profile): SafeHtml {
	const seul = profiles.length <= 1;
	const cartes = joindre(
		profiles.map((p) => {
			const courant = p.uuid === consulte.uuid;
			const joue = p.uuid === actif.uuid;
			const palette =
				gestionEmojiFor === p.uuid
					? emojiPaletteHTML(p.emoji, niveauDepuisXP(getXPFor(p.uuid)))
					: '';
			return html`<li class="enc-prof-card${courant ? ' current' : ''}">
        <div class="enc-prof-head">
          <span class="enc-profile-emoji" aria-hidden="true">${p.emoji}</span>
          <span class="enc-prof-id">
            <span class="enc-profile-name">${p.name}</span>
            ${joue ? '<span class="enc-profile-actif">joue en ce moment</span>' : ''}
          </span>
          <button type="button" class="enc-btn${courant ? '' : '-sec'}" data-act="voir" data-uuid="${p.uuid}"${courant ? ' aria-current="true"' : ''}>${courant ? `${icon('check')} Affiché` : `${icon('eye')} Voir le suivi`}</button>
        </div>
        <details class="enc-gerer"${gestionEmojiFor === p.uuid ? drapeau('open') : ''}>
          <summary>Gérer ce profil</summary>
          <div class="enc-gerer-actions">
            <button type="button" class="enc-btn-sec" data-act="enc-rename" data-uuid="${p.uuid}">${icon('pencil')} Renommer</button>
            <button type="button" class="enc-btn-sec" data-act="enc-emoji" data-uuid="${p.uuid}">${icon('palette')} Avatar</button>
            <button type="button" class="enc-btn-sec" data-act="enc-reset" data-uuid="${p.uuid}">${icon('reset')} Réinitialiser</button>
            <button type="button" class="enc-btn-sec enc-danger" data-act="enc-delete" data-uuid="${p.uuid}"${seul ? drapeau('disabled') : ''}>${icon('trash')} Supprimer</button>
          </div>
          ${palette}
        </details>
      </li>`;
		}),
	);
	return html`<section class="enc-section">
      <h2 class="enc-h2">Profils</h2>
      <p class="enc-hint">Choisissez « Voir le suivi » pour consulter un enfant ci-dessous, ou dépliez « Gérer » pour le modifier.</p>
      <ul class="enc-profiles">${cartes}</ul>
      <button type="button" class="enc-btn-sec enc-prof-add" id="encAdd" data-act="enc-add">${icon('plus')} Nouveau profil</button>
    </section>`;
}

/* Sauvegarde : export de TOUS les profils / import (fusion par UUID, par récence).
   Ici vit la version COMPLÈTE du message que l'encart de l'accueil ne fait qu'effleurer
   (#306 §7) : l'accueil est l'écran de l'enfant, il doit rester sobre et non anxiogène,
   alors qu'ici on s'adresse à un adulte venu de son plein gré — on peut donc tout
   expliquer, y compris ce qui fait vraiment perdre des données. */
export function sauvegardeHTML(): SafeHtml {
	return html`<section class="enc-section">
      <h2 class="enc-h2">Sauvegarde</h2>
      <p class="enc-hint">Exportez les profils (transfert vers un autre appareil) ou importez une sauvegarde. À l'import, un profil déjà présent n'est remplacé que s'il est plus récent.</p>
      <div class="enc-actions">
        <button type="button" class="enc-btn-sec" data-act="enc-export">${icon('export')} Exporter les profils</button>
        <button type="button" class="enc-btn-sec" data-act="enc-import">${icon('import')} Importer une sauvegarde</button>
      </div>
      <h3 class="enc-h3">Où vivent les données, et comment les mettre à l'abri</h3>
      <p class="enc-hint">Ludaskia n'a ni compte ni serveur : toute la progression est enregistrée dans <strong>ce navigateur, sur cet appareil</strong>. Rien n'est envoyé nulle part, et rien n'est récupérable ailleurs. Vider les données du navigateur, changer d'appareil ou réinstaller le système efface donc la progression.</p>
      <p class="enc-hint">Sur iPhone et iPad, il y a un cas de plus : si l'application <strong>n'est pas installée sur l'écran d'accueil</strong>, Safari efface de lui-même les données d'un site resté environ <strong>sept jours sans être ouvert</strong>. Chaque utilisation remet ce compteur à zéro, donc cela ne concerne qu'un usage très espacé — typiquement une dictée toutes les deux ou trois semaines.</p>
      <p class="enc-hint">Deux gestes suffisent, et ils sont complémentaires. <strong>Installer l'application</strong> lève complètement ce délai de sept jours (et rend l'application utilisable sans connexion) : le mode d'emploi appareil par appareil est dans le <a href="${import.meta.env.BASE_URL}guide.html#installer" target="_blank" rel="noopener">guide pour les parents</a>. <strong>Exporter une sauvegarde</strong> de temps en temps est le filet de secours : le fichier obtenu contient tous les profils et se réimporte ici même, sur n'importe quel appareil.</p>
    </section>`;
}

/* ---------- Handlers délégués (aiguillés par l'orchestrateur) ---------- */
export function profilsClick(act: string, el: HTMLElement): boolean {
	switch (act) {
		case 'voir':
			setConsulteUuid(el.dataset.uuid ?? consulteUuid());
			resetPinPanel(); // referme un éventuel sous-panneau « code » ouvert
			renderEspace();
			return true;
		case 'enc-rename':
			if (el.dataset.uuid) onEncRename(el.dataset.uuid);
			return true;
		case 'enc-emoji':
			gestionEmojiFor = gestionEmojiFor === el.dataset.uuid ? null : (el.dataset.uuid ?? null);
			renderEspace();
			return true;
		case 'set-emoji':
			if (gestionEmojiFor && el.dataset.emoji) {
				setProfileEmoji(gestionEmojiFor, el.dataset.emoji);
				gestionEmojiFor = null;
				renderEspace();
			}
			return true;
		case 'enc-reset':
			if (el.dataset.uuid) onEncReset(el.dataset.uuid);
			return true;
		case 'enc-delete':
			if (el.dataset.uuid) onEncDelete(el.dataset.uuid);
			return true;
		case 'enc-add':
			onEncAdd();
			return true;
		case 'enc-export':
			onEncExport();
			return true;
		case 'enc-import':
			onEncImport();
			return true;
	}
	return false;
}

/* ---------- Gestion des profils (encadrant uniquement) ---------- */
function onEncRename(uuid: string): void {
	const courant = listProfiles().find((p) => p.uuid === uuid)?.name ?? '';
	void uiPrompt({
		title: 'Nouveau prénom',
		okLabel: 'Renommer',
		defaultValue: courant,
		selectDefault: true,
	}).then((n) => {
		if (n) {
			renameProfile(uuid, n);
			renderEspace();
		}
	});
}

function onEncReset(uuid: string): void {
	const nom = listProfiles().find((p) => p.uuid === uuid)?.name ?? 'ce profil';
	void uiConfirm({
		title: `Réinitialiser la progression de ${nom} ?`,
		message: 'Toute sa progression repartira de zéro. C’est irréversible.',
		confirmLabel: 'Tout réinitialiser',
		destructive: true,
		confirmIcon: 'reset',
	}).then((ok) => {
		if (!ok) return;
		resetProfile(uuid);
		if (uuid === activeProfile()?.uuid) applyPreferences(); // l'XP repart à 0 → thème éventuel
		renderEspace();
	});
}

function onEncDelete(uuid: string): void {
	const nom = listProfiles().find((p) => p.uuid === uuid)?.name ?? 'ce profil';
	void uiConfirm({
		title: `Supprimer le profil de ${nom} ?`,
		message: 'Le profil et toute sa progression seront définitivement effacés.',
		confirmLabel: 'Supprimer',
		destructive: true,
		confirmIcon: 'trash',
	}).then((ok) => {
		if (!ok || !deleteProfile(uuid)) return;
		applyPreferences(); // le profil actif a pu changer
		if (consulteUuid() === uuid) setConsulteUuid(activeProfile()?.uuid ?? null);
		renderEspace();
	});
}

function onEncAdd(): void {
	void uiPrompt({
		title: 'Prénom du nouveau profil',
		okLabel: 'Créer le profil',
		placeholder: 'Prénom',
	}).then((n) => {
		if (!n) return;
		addProfile(n); // devient le profil actif
		applyPreferences();
		setConsulteUuid(activeProfile()?.uuid ?? null);
		renderEspace();
	});
}

function onEncExport(): void {
	const payload = exportProfiles(listProfiles().map((p) => p.uuid));
	if (!payload) return;
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
	telechargerBlob(`ludaskia-${payload.profiles.length}-profils.json`, blob);
}

function onEncImport(): void {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'application/json,.json';
	input.addEventListener('change', () => {
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const res = importProfiles(JSON.parse(String(reader.result)));
				if (!res) {
					toast('Fichier de sauvegarde non reconnu.');
					return;
				}
				setConsulteUuid(activeProfile()?.uuid ?? null);
				renderEspace();
				toast(
					`Import : ${res.added} ajouté(s), ${res.updated} mis à jour, ${res.skipped} ignoré(s).`,
				);
			} catch {
				toast('Fichier de sauvegarde illisible.');
			}
		};
		reader.readAsText(file);
	});
	input.click();
}
