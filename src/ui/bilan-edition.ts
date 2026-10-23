/* ============================================================
   Édition d'un bilan favori depuis l'espace encadrant (#778).
   ------------------------------------------------------------
   Le crayon d'une ligne « Bilans favoris de [prénom] » ouvre en pleine page (`#bilan-edit`)
   le composeur de l'enfant, pré-rempli (`renderBilanConfigScreen` en mode édition). Ce
   module tient le favori édité et l'écrit ; le composeur, lui, ne fait que pré-remplir et
   valider.

   Le favori édité vit EN MÉMOIRE, jamais dans l'URL : l'uuid du propriétaire est capturé
   au clic, avec l'id. Deux conséquences voulues :
   - l'enregistrement écrit chez CE propriétaire, même si le profil actif ou le profil
     consulté a changé entre-temps (critère 6) ;
   - `#bilan-edit` atteint autrement que par le crayon (lien direct, rechargement,
     Précédent) n'a rien à afficher (critère 14). Sinon l'historique rouvrirait un écran de
     l'espace encadrant sans repasser par son verrou. Même modèle que la relecture d'une
     sélection de mots (#618) : une mémoire consommée, que le routeur oublie dès qu'on
     quitte l'écran.
   ============================================================ */
import { listProfiles } from '../core/profiles';
import { loadBilansFor, modifierBilanFor, contenuFavoriChange } from '../core/bilans';
import type { BilanConfig } from '../core/catalog';
import { bilanFavoriKey, hasResumeFor, removeResumeFor } from '../core/resume';
import { renderBilanConfigScreen } from './bilan';
import { consulterALaProchaineEntree } from './encadrant-commun';
import { preparerRetourEdition } from './encadrant-favoris';
import { uiConfirm } from './ui-modal';

/** Hash de l'éditeur. Il ne porte aucun identifiant, à dessein (cf. en-tête). */
export const HASH_EDITION_FAVORI = 'bilan-edit';
/** Où renvoyer quand l'éditeur n'a rien à afficher : l'onglet qui porte les crayons. */
export const RETOUR_EDITION_FAVORI = 'encadrant/programme';

interface EditionEnCours {
	uuid: string; // propriétaire du favori, capturé au clic sur le crayon
	id: string;
	retour: string; // hash de l'espace encadrant d'où l'on vient (onglet compris)
}

let enCours: EditionEnCours | null = null;
/* Formulaire déjà rendu pour l'édition en cours. Le routeur re-rend la vue courante quand on
   change de profil depuis la barre (`main.ts`) : sans ce repère, ce que l'adulte a déjà
   modifié serait effacé par un nouveau pré-remplissage. */
let rendu: { edition: EditionEnCours; form: HTMLElement } | null = null;

/** Clic sur le crayon : retient le favori à éditer, puis mène à l'éditeur. */
export function ouvrirEditionFavori(uuid: string, id: string): void {
	if (!uuid || !id) return;
	const ici = location.hash.replace(/^#/, '');
	enCours = { uuid, id, retour: ici.startsWith('encadrant') ? ici : RETOUR_EDITION_FAVORI };
	location.hash = HASH_EDITION_FAVORI;
}

/** Le routeur l'appelle sur tout autre écran : l'édition ne survit pas à un départ. Le
    formulaire quitte aussi le DOM : simplement caché, il resterait un éditeur pré-rempli,
    boutons câblés, qu'un simple ré-affichage du conteneur remontrerait. */
export function oublierEditionFavori(): void {
	enCours = null;
	rendu?.form.remove();
	rendu = null;
}

/** Issue de `afficherEditionFavori` : formulaire rendu à neuf, formulaire déjà en place et
    gardé tel quel (changement de profil par la barre), ou rien à éditer. */
export type AffichageEdition = 'rendu' | 'conserve' | 'absent';

/** Rend l'éditeur du favori retenu dans `el`. `'absent'` s'il n'y a rien à éditer (pas de
    crayon cliqué, ou favori ou profil disparus entre-temps) : l'appelant redirige. */
export function afficherEditionFavori(el: HTMLElement): AffichageEdition {
	const edition = enCours;
	if (!edition) return 'absent';
	const proprietaire = listProfiles().find((p) => p.uuid === edition.uuid);
	const favori = proprietaire
		? loadBilansFor(edition.uuid).find((b) => b.id === edition.id)
		: undefined;
	if (!proprietaire || !favori) {
		oublierEditionFavori();
		return 'absent';
	}
	if (rendu?.edition === edition && rendu.form.isConnected && el.contains(rendu.form))
		return 'conserve';
	renderBilanConfigScreen(el, {
		edition: {
			favori,
			proprietaire: proprietaire.name,
			enregistrer: (config) => enregistrer(edition, config),
			annuler: () => revenir(edition, null),
		},
	});
	rendu = { edition, form: el.querySelector<HTMLElement>('#bilanConfigForm')! };
	// Le crayon cliqué a disparu avec l'espace encadrant, le focus irait sur `<body>` : le
	// titre, lui, dit au lecteur d'écran quel favori et quel enfant sont concernés. Au frame
	// suivant, car la vue n'affiche son conteneur qu'après ce rendu. Seulement sur un rendu
	// NEUF : un formulaire conservé garde le focus là où l'adulte l'avait laissé.
	const titre = el.querySelector<HTMLElement>('.bc-edit-title');
	requestAnimationFrame(() => {
		if (titre?.isConnected) titre.focus({ preventScroll: true });
	});
	return 'rendu';
}

const FAVORI_DISPARU = "Ce bilan favori n'existe plus : il a été supprimé entre-temps.";
/* L'écriture a été refusée par le navigateur (stockage plein, le plus souvent) : le favori
   existe toujours, inchangé. Phrase sans pronom : la page est celle de l'enfant (tutoiement),
   mais c'est l'adulte qui la lit ici. */
const ECRITURE_REFUSEE =
	"Le bilan n'a pas pu être enregistré : la mémoire de l'appareil est peut-être pleine.";

/* Écrit la nouvelle version chez le PROPRIÉTAIRE. Si le contenu change alors que l'enfant a
   commencé ce bilan, on le dit d'abord : sa partie sera abandonnée, pour qu'il démarre la
   nouvelle version au lancement suivant au lieu de reprendre l'ancienne (critère 9). Un
   simple renommage garde sa partie. */
async function enregistrer(edition: EditionEnCours, config: BilanConfig): Promise<string | null> {
	if (enCours !== edition) return null;
	// Comparé à la version STOCKÉE au moment d'enregistrer, pas à celle de l'ouverture.
	const avant = loadBilansFor(edition.uuid).find((b) => b.id === edition.id);
	if (!avant) return FAVORI_DISPARU;
	const cle = bilanFavoriKey(edition.id);
	const abandon = contenuFavoriChange(avant, config) && hasResumeFor(edition.uuid, cle, Date.now());
	if (abandon) {
		const prenom = listProfiles().find((p) => p.uuid === edition.uuid)?.name ?? '';
		const ok = await uiConfirm({
			title: `${prenom} a une partie en cours de « ${avant.label} »`,
			message: `Les réponses déjà données seront perdues : au prochain lancement, ${prenom} commencera la nouvelle version.`,
			confirmLabel: 'Enregistrer quand même',
			destructive: true,
		});
		// Refus, ou écran quitté pendant la question (Précédent) : rien n'est écrit.
		if (!ok || enCours !== edition) return null;
	}
	// `false` : rien n'a été écrit. Soit le favori a disparu pendant la confirmation, soit le
	// stockage a refusé l'écriture ; dans les deux cas on reste dans l'éditeur, sans annonce,
	// et la partie de l'enfant n'est PAS abandonnée.
	if (!modifierBilanFor(edition.uuid, config)) {
		const existe = loadBilansFor(edition.uuid).some((b) => b.id === edition.id);
		return existe ? ECRITURE_REFUSEE : FAVORI_DISPARU;
	}
	// Dans cet ordre : une reprise effacée pour un favori resté inchangé ferait perdre sa
	// partie à l'enfant pour rien.
	if (abandon) removeResumeFor(edition.uuid, cle);
	revenir(edition, `Bilan « ${config.label} » enregistré.`);
	return null;
}

/* Retour à l'espace encadrant, sur le profil PROPRIÉTAIRE (critères 6 et 10). `replace` et
   non une nouvelle entrée : l'éditeur ne reste pas dans l'historique, et « Précédent » ne
   ramène pas vers lui (critère 14). Le focus revient au crayon du favori édité, et
   l'enregistrement est annoncé ; « Annuler » n'annonce rien (`annonce` à `null`). */
function revenir(edition: EditionEnCours, annonce: string | null): void {
	if (enCours !== edition) return;
	// Consommée tout de suite (un second clic n'écrit plus rien) ; le formulaire, lui, part
	// quand le routeur traite le nouveau hash (`oublierEditionFavori`).
	enCours = null;
	consulterALaProchaineEntree(edition.uuid);
	preparerRetourEdition(edition.id, annonce);
	location.replace('#' + edition.retour);
}
