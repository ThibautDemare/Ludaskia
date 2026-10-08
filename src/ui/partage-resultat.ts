/* ============================================================
   Séance partagée (#734) — LIRE un résultat reçu (`#resultat/<code>`), et l'ajouter au
   suivi d'un profil.

   Pour un ADULTE (vouvoiement), sans code d'accès pour LIRE (critère 18) : le lien est
   déjà la trace complète. La vue ne montre rien du profil actif (ni XP, ni avatar : la
   barre d'outils les masque) et ni pourcentage ni note (critère 33).

   Ouvrir la vue n'écrit RIEN (critère 43). Seul l'import écrit, et seulement :
   - derrière le code d'accès s'il y en a un, le même que celui de l'espace encadrant ;
   - après que l'encadrant a confirmé le profil cible (critère 19) : le profil dont le nom
     est le pseudo est coché d'avance, rien de plus.

   Tout texte du résultat vient d'un lien qu'on a pu forger : il passe par `html`, qui
   l'échappe (critère 30).
   ============================================================ */
import { getAllLessons, getLessonById } from '../core/catalog';
import { verifierPin } from '../core/encadrant-lock';
import { attribut, drapeau, html, joindre, VIDE, type SafeHtml } from '../core/html';
import type { IconName } from '../core/icon-names';
import { availableLevels, LEVEL_LABEL, labelLecon } from '../core/levels';
import type { RaisonRefus } from '../core/partage/codec';
import {
	creerProfilImporte,
	importerResultat,
	profilCorrespondant,
	type Import,
} from '../core/partage/import';
import {
	decoderResultat,
	score,
	type Resultat,
	type StatutReponse,
} from '../core/partage/resultat';
import { deleteProfile, listProfiles, type Profile } from '../core/profiles';
import { elisionDe } from '../core/utils';
import { consulterALaProchaineEntree } from './encadrant-commun';
import { accesVerrouille, marquerDeverrouille } from './encadrant-pin';
import { icon } from './icon';
import { annoncer, causeRefus } from './lien-partage';
import { goHome } from './navigation';

/* Un décodage arrivé après qu'on a quitté l'écran ne doit rien afficher. */
let jeton = 0;

/** Oublie la vue (appelé à chaque changement d'écran). */
export function resultatCleanup(): void {
	jeton++;
}

const STATUTS: Record<StatutReponse, { mot: string; icone: IconName }> = {
	juste: { mot: 'Juste', icone: 'check-circle' },
	faux: { mot: 'Faux', icone: 'x' },
	jnsp: { mot: 'Je ne sais pas', icone: 'question' },
	vide: { mot: 'Sans réponse', icone: 'square' },
};

/** Décode le code et affiche la vue de lecture, ou le refus. Ne lève jamais : un échec
 *  devient l'écran de refus, jamais un écran blanc. */
export async function afficherResultat(code: string, el: HTMLElement): Promise<void> {
	const mien = ++jeton;
	let lu: Awaited<ReturnType<typeof decoderResultat>>;
	try {
		lu = await decoderResultat(code);
	} catch {
		lu = { ok: false, raison: 'illisible' };
	}
	if (mien !== jeton) return;
	try {
		if (lu.ok) afficherLecture(el, lu.valeur);
		else afficherRefus(el, lu.raison);
	} catch {
		afficherRefus(el, 'schema');
	}
}

function afficherRefus(el: HTMLElement, raison: RaisonRefus): void {
	el.innerHTML = html`<section id="resultatRefus" class="partage-ecran partage-refus">
      <h1 class="partage-titre" tabindex="-1">${icon('question')} Ce lien de résultat ne s'ouvre pas.</h1>
      <p class="partage-texte">${causeRefus(raison, 'resultat')}</p>
      <p class="partage-texte">Le plus simple : demandez à l'enfant de vous renvoyer son lien. Il le retrouve en rouvrant l'exercice, avec « Recopier mon résultat ».</p>
      <button type="button" id="resultatRetour" class="partage-btn partage-btn-principal">${icon('house')} Retour à l'accueil</button>
    </section>`.balisage;
	el.querySelector('#resultatRetour')!.addEventListener('click', goHome);
	focusTitre(el);
}

/* ---------- Lecture ---------- */

function dateLongue(t: number): string {
	const d = new Date(t);
	const jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
	const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
	return `${jour} à ${heure}`;
}

function titreLecon(id: string, r: Resultat): string {
	const lesson = getLessonById(id);
	return lesson ? labelLecon(lesson, r.envoi.niveau) : id;
}

function scoreHTML(r: Resultat): SafeHtml {
	const { justes, total } = score(r);
	const compte = (statut: StatutReponse) => r.reponses.filter((x) => x.statut === statut).length;
	const autres = [
		[compte('faux'), 'fausse', 'fausses'],
		[compte('jnsp'), '« je ne sais pas »', '« je ne sais pas »'],
		[compte('vide'), 'sans réponse', 'sans réponse'],
	]
		.filter(([n]) => (n as number) > 0)
		.map(([n, un, plusieurs]) => `${n} ${(n as number) > 1 ? plusieurs : un}`);
	return html`<p class="resultat-score" id="resultatScore"><strong>${justes}</strong> réponse${justes > 1 ? 's' : ''} juste${justes > 1 ? 's' : ''} sur <strong>${total}</strong></p>
      ${autres.length ? html`<p class="partage-texte resultat-detail">Et ${autres.join(', ')}.</p>` : VIDE}`;
}

function itemsHTML(r: Resultat): SafeHtml {
	let leconPrecedente = '';
	const multi = new Set(r.reponses.map((x) => x.lecon)).size > 1;
	return joindre(
		r.reponses.map((x) => {
			const lecon =
				multi && x.lecon !== leconPrecedente
					? html`<p class="resultat-lecon">${titreLecon(x.lecon, r)}</p>`
					: VIDE;
			leconPrecedente = x.lecon;
			const s = STATUTS[x.statut];
			const saisie = x.saisie || 'aucune';
			return html`<li class="resultat-item" data-statut="${x.statut}">
          ${lecon}
          <p class="resultat-enonce">${x.enonce}</p>
          <p class="resultat-ligne"><span class="resultat-cle">Réponse de l'enfant :</span> <span class="resultat-saisie${x.saisie ? '' : ' resultat-aucune'}">${saisie}</span></p>
          <p class="resultat-ligne"><span class="resultat-cle">Réponse attendue :</span> <span class="resultat-attendue">${x.attendue}</span></p>
          <p class="resultat-statut resultat-statut-${x.statut}">${icon(s.icone)} <span>${s.mot}</span></p>
        </li>`;
		}),
	);
}

function afficherLecture(el: HTMLElement, r: Resultat): void {
	const seule = new Set(r.reponses.map((x) => x.lecon)).size === 1;
	const lecon = seule && r.reponses.length ? titreLecon(r.reponses[0].lecon, r) : '';
	el.innerHTML = html`<section id="partageResultat" class="partage-ecran resultat-ecran">
      <p class="partage-surtitre">${icon('paper-plane')} Résultat d'un exercice envoyé</p>
      <h1 class="partage-titre" id="resultatTitre" tabindex="-1">Résultat de ${r.pseudo}</h1>
      <dl class="resultat-infos">
        <div><dt>Exercice :</dt><dd id="resultatLibelle">${r.envoi.libelle}</dd></div>
        ${lecon ? html`<div><dt>Leçon :</dt><dd>${lecon}</dd></div>` : VIDE}
        ${r.envoi.niveau ? html`<div><dt>Niveau :</dt><dd id="resultatNiveau">${LEVEL_LABEL[r.envoi.niveau]}</dd></div>` : VIDE}
        <div><dt>Fait le :</dt><dd id="resultatDate">${dateLongue(r.date)}</dd></div>
      </dl>
      ${scoreHTML(r)}
      <div class="resultat-import" id="resultatImportZone">
        <button type="button" id="resultatImporter" class="partage-btn partage-btn-secondaire" aria-expanded="false" aria-controls="resultatImportCorps">${icon('import')} Ajouter au suivi d'un profil</button>
        <p class="partage-aide">Les erreurs iront dans le journal du profil choisi, et la séance dans son activité. Rien d'autre ne change dans ce profil.</p>
        <div id="resultatImportCorps"></div>
      </div>
      <h2 class="resultat-h2">Les réponses</h2>
      <ol class="resultat-items" id="resultatItems">${itemsHTML(r)}</ol>
    </section>`.balisage;
	const bouton = el.querySelector<HTMLButtonElement>('#resultatImporter')!;
	const corps = el.querySelector<HTMLElement>('#resultatImportCorps')!;
	bouton.addEventListener('click', () => {
		const ouvrir = bouton.getAttribute('aria-expanded') !== 'true';
		bouton.setAttribute('aria-expanded', String(ouvrir));
		if (!ouvrir) corps.replaceChildren();
		else if (accesVerrouille()) afficherPin(corps, r);
		else afficherImport(corps, r);
	});
	focusTitre(el);
}

/* ---------- Code d'accès ---------- */

function afficherPin(corps: HTMLElement, r: Resultat): void {
	corps.innerHTML = html`<form id="resultatPin" class="resultat-pin">
      <label class="resultat-label" for="resultatPinCode">Code d'accès de l'espace encadrants</label>
      <input type="password" id="resultatPinCode" class="partage-pseudo resultat-pin-code" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="resultatPinErreur" />
      <button type="submit" id="resultatPinValider" class="partage-btn partage-btn-principal">Valider</button>
      <p id="resultatPinErreur" class="partage-aide resultat-erreur" role="alert"></p>
    </form>`.balisage;
	const form = corps.querySelector<HTMLFormElement>('#resultatPin')!;
	const champ = corps.querySelector<HTMLInputElement>('#resultatPinCode')!;
	const erreur = corps.querySelector<HTMLElement>('#resultatPinErreur')!;
	form.addEventListener('submit', (e) => {
		e.preventDefault();
		void verifierPin(champ.value).then((ok) => {
			if (!corps.isConnected) return;
			if (!ok) {
				champ.setAttribute('aria-invalid', 'true');
				champ.value = '';
				champ.focus();
				annoncer(erreur, "Ce n'est pas le bon code.");
				return;
			}
			marquerDeverrouille();
			afficherImport(corps, r);
		});
	});
	champ.focus();
}

/* ---------- Choix du profil, puis import ---------- */

const NOUVEAU = 'nouveau';

function afficherImport(corps: HTMLElement, r: Resultat, coche?: string): void {
	const apresImport = coche !== undefined;
	const profils = listProfiles();
	const choisi = coche ?? profilCorrespondant(r.pseudo, profils)?.uuid ?? '';
	const radio = (val: string, contenu: SafeHtml) =>
		html`<label class="resultat-cible"><input type="radio" name="resultatCible" value="${val}"${val === choisi ? drapeau('checked') : VIDE} /> <span>${contenu}</span></label>`;
	const options = joindre([
		...profils.map((p) =>
			radio(p.uuid, html`<span aria-hidden="true">${p.emoji}</span> ${p.name}`),
		),
		radio(NOUVEAU, html`Créer le profil ${r.pseudo}`),
	]);
	const niveaux = availableLevels(getAllLessons());
	const prerempli = r.envoi.niveau && niveaux.includes(r.envoi.niveau) ? r.envoi.niveau : '';
	const classes = joindre([
		html`<option value=""${prerempli === '' ? drapeau('selected') : VIDE}>Pas de classe pour l'instant</option>`,
		...niveaux.map(
			(n) =>
				html`<option value="${n}"${n === prerempli ? drapeau('selected') : VIDE}>${LEVEL_LABEL[n]}</option>`,
		),
	]);
	corps.innerHTML = html`<div id="resultatImport" class="resultat-import-panneau">
      <fieldset class="resultat-cibles">
        <legend class="resultat-label">Dans le suivi de quel profil ?</legend>
        ${options}
      </fieldset>
      <div id="resultatNouveau" class="resultat-nouveau"${choisi === NOUVEAU ? VIDE : attribut('hidden', '')}>
        <label class="resultat-label" for="resultatClasse">Classe du nouveau profil</label>
        <select id="resultatClasse" class="partage-pseudo">${classes}</select>
      </div>
      <button type="button" id="resultatConfirmer" class="partage-btn partage-btn-principal"></button>
      <p id="resultatImportStatut" class="partage-aide resultat-statut-import" role="status" aria-live="polite"></p>
    </div>`.balisage;
	const confirmer = corps.querySelector<HTMLButtonElement>('#resultatConfirmer')!;
	const nouveau = corps.querySelector<HTMLElement>('#resultatNouveau')!;
	const cible = (): string =>
		corps.querySelector<HTMLInputElement>('input[name="resultatCible"]:checked')?.value ?? '';
	const majBouton = () => {
		const c = cible();
		nouveau.hidden = c !== NOUVEAU;
		const p = profils.find((x) => x.uuid === c);
		confirmer.textContent = p
			? `Ajouter au suivi ${elisionDe(p.name)}`
			: c === NOUVEAU
				? `Créer le profil ${r.pseudo} et ajouter`
				: 'Ajouter au suivi';
	};
	corps.querySelector('fieldset')!.addEventListener('change', majBouton);
	confirmer.addEventListener('click', () => importer(corps, r, cible()));
	majBouton();
	if (apresImport) confirmer.focus();
	else
		corps
			.querySelector<HTMLElement>(
				'input[name="resultatCible"]:checked, input[name="resultatCible"]',
			)
			?.focus();
}

function importer(corps: HTMLElement, r: Resultat, cible: string): void {
	const statut = corps.querySelector<HTMLElement>('#resultatImportStatut')!;
	if (!cible) {
		annoncer(statut, "Choisissez d'abord un profil.");
		return;
	}
	let profil: Profile | undefined;
	if (cible === NOUVEAU) {
		const classe = corps.querySelector<HTMLSelectElement>('#resultatClasse')!.value;
		const niveau = availableLevels(getAllLessons()).find((n) => n === classe);
		profil = creerProfilImporte(r.pseudo, niveau);
	} else profil = listProfiles().find((p) => p.uuid === cible);
	if (!profil) {
		annoncer(statut, "Ce profil n'existe plus sur cet appareil.");
		return;
	}
	// Création refusée par le stockage : le profil n'est pas dans la liste.
	if (!listProfiles().some((p) => p.uuid === profil.uuid)) {
		annoncer(statut, MESSAGE_STOCKAGE);
		return;
	}
	const issue = importerResultat(r, profil.uuid);
	// Un profil créé pour cet import n'a pas de raison d'exister si l'import échoue
	// (stockage plein) : on le retire, sinon un profil vide resterait dans le sélecteur.
	const cree = cible === NOUVEAU;
	if (cree && !issue.ok) deleteProfile(profil.uuid);
	// Le panneau est refait sur le profil cible : un nouveau profil y apparaît, et un
	// second clic sur la confirmation dit « déjà fait » au lieu de recréer un profil.
	afficherImport(corps, r, cree && !issue.ok ? NOUVEAU : profil.uuid);
	const region = corps.querySelector<HTMLElement>('#resultatImportStatut')!;
	annoncer(region, cree && !issue.ok ? MESSAGE_STOCKAGE : messageImport(issue, profil.name));
	if (issue.ok) ajouterLienSuivi(corps, profil);
}

const MESSAGE_STOCKAGE =
	"Le résultat n'a pas pu être enregistré : la mémoire de l'appareil est peut-être pleine. Rien n'a été ajouté.";

function messageImport(issue: Import, nom: string): string {
	if (issue.ok)
		return issue.erreurs === 0
			? `C'est fait. Aucune erreur à ajouter : la séance est notée dans l'activité ${elisionDe(nom)}.`
			: `C'est fait : ${issue.erreurs} erreur${issue.erreurs > 1 ? 's' : ''} dans le journal ${elisionDe(nom)}, et la séance dans son activité.`;
	if (issue.raison === 'deja')
		return `Ce résultat est déjà dans le suivi ${elisionDe(nom)}. Rien n'a été ajouté.`;
	if (issue.raison === 'profil') return "Ce profil n'existe plus sur cet appareil.";
	return MESSAGE_STOCKAGE;
}

function ajouterLienSuivi(corps: HTMLElement, profil: Profile): void {
	const panneau = corps.querySelector<HTMLElement>('#resultatImport')!;
	panneau.insertAdjacentHTML(
		'beforeend',
		html`<a id="resultatVoirSuivi" class="partage-btn partage-btn-lien" href="#encadrant">Voir le suivi ${elisionDe(profil.name)}</a>`
			.balisage,
	);
	panneau.querySelector('#resultatVoirSuivi')!.addEventListener('click', () => {
		consulterALaProchaineEntree(profil.uuid);
	});
}

function focusTitre(racine: ParentNode): void {
	racine.querySelector<HTMLElement>('.partage-titre')?.focus({ preventScroll: true });
}
