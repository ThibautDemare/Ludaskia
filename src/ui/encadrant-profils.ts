/* ============================================================
   Espace encadrant (#234, découpage #354) — PROFILS & sauvegarde.
   ------------------------------------------------------------
   Liste des profils en CONSULTATION (« Voir le suivi » → bascule le profil consulté,
   ≠ profil actif) et GESTION réservée à l'adulte (renommer, avatar, réinitialiser,
   supprimer, créer), plus l'export/import de tous les profils. Possède l'état de la
   palette d'avatar ouverte (`gestionEmojiFor`). Dépend de `encadrant-pin` uniquement
   pour refermer le sous-panneau « code » quand on change de profil consulté.
   ============================================================ */
import { escapeHTML } from '../core/utils';
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
import { consulteUuid, setConsulteUuid, renderEspace, telechargerBlob } from './encadrant-etat';
import { resetPinPanel } from './encadrant-pin';

/* ---------- État de la section (module) ---------- */
let gestionEmojiFor: string | null = null; // profil dont la palette d'avatar est ouverte (gestion)

/* Liste des profils : CONSULTER (« Voir le suivi » → recap ci-dessous) + GÉRER
   (renommer/avatar/réinitialiser/supprimer, replié). Action de gestion = encadrant
   UNIQUEMENT (un enfant ne touche pas aux profils des autres). Suppression désactivée
   s'il ne reste qu'un profil. La bascule du profil ACTIF reste au menu de la barre. */
export function profilsHTML(profiles: Profile[], consulte: Profile, actif: Profile): string {
	const seul = profiles.length <= 1;
	const cartes = profiles
		.map((p) => {
			const courant = p.uuid === consulte.uuid;
			const joue = p.uuid === actif.uuid;
			const palette =
				gestionEmojiFor === p.uuid
					? emojiPaletteHTML(p.emoji, niveauDepuisXP(getXPFor(p.uuid)))
					: '';
			return `<li class="enc-prof-card${courant ? ' current' : ''}">
        <div class="enc-prof-head">
          <span class="enc-profile-emoji" aria-hidden="true">${escapeHTML(p.emoji)}</span>
          <span class="enc-prof-id">
            <span class="enc-profile-name">${escapeHTML(p.name)}</span>
            ${joue ? '<span class="enc-profile-actif">joue en ce moment</span>' : ''}
          </span>
          <button type="button" class="enc-btn${courant ? '' : '-sec'}" data-act="voir" data-uuid="${p.uuid}"${courant ? ' aria-current="true"' : ''}>${courant ? `${icon('check')} Affiché` : `${icon('eye')} Voir le suivi`}</button>
        </div>
        <details class="enc-gerer"${gestionEmojiFor === p.uuid ? ' open' : ''}>
          <summary>Gérer ce profil</summary>
          <div class="enc-gerer-actions">
            <button type="button" class="enc-btn-sec" data-act="enc-rename" data-uuid="${p.uuid}">${icon('pencil')} Renommer</button>
            <button type="button" class="enc-btn-sec" data-act="enc-emoji" data-uuid="${p.uuid}">${icon('palette')} Avatar</button>
            <button type="button" class="enc-btn-sec" data-act="enc-reset" data-uuid="${p.uuid}">${icon('reset')} Réinitialiser</button>
            <button type="button" class="enc-btn-sec enc-danger" data-act="enc-delete" data-uuid="${p.uuid}"${seul ? ' disabled' : ''}>${icon('trash')} Supprimer</button>
          </div>
          ${palette}
        </details>
      </li>`;
		})
		.join('');
	return `<section class="enc-section">
      <h2 class="enc-h2">Profils</h2>
      <p class="enc-hint">Choisissez « Voir le suivi » pour consulter un enfant ci-dessous, ou dépliez « Gérer » pour le modifier.</p>
      <ul class="enc-profiles">${cartes}</ul>
      <button type="button" class="enc-btn-sec enc-prof-add" id="encAdd" data-act="enc-add">${icon('plus')} Nouveau profil</button>
    </section>`;
}

/* Sauvegarde : export de TOUS les profils / import (fusion par UUID, par récence). */
export function sauvegardeHTML(): string {
	return `<section class="enc-section">
      <h2 class="enc-h2">Sauvegarde</h2>
      <p class="enc-hint">Exportez les profils (transfert vers un autre appareil) ou importez une sauvegarde. À l'import, un profil déjà présent n'est remplacé que s'il est plus récent.</p>
      <div class="enc-actions">
        <button type="button" class="enc-btn-sec" data-act="enc-export">${icon('export')} Exporter les profils</button>
        <button type="button" class="enc-btn-sec" data-act="enc-import">${icon('import')} Importer une sauvegarde</button>
      </div>
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
