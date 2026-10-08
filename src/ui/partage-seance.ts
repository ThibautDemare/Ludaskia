/* ============================================================
   Séance partagée (#734) — les écrans ENFANT d'un envoi reçu par lien.

   Accueil → séance (une fiche, ou les fiches d'un bilan) → fin. Le premier passage
   terminé est FIGÉ et produit le lien de résultat ; le même lien rouvert sur le même
   profil propose de recopier ce résultat ou de s'entraîner sans rien envoyer.

   Partis pris de rendu (avis designer-ux-enfant et specialiste-troubles-apprentissage,
   cadrage du lot) :
   - un seul bouton principal par écran ;
   - « Je ne sais pas » est une CASE À COCHER par question, pas un bouton d'action : c'est
     un état de la question, visible et réversible. Taper dans le champ la décoche ;
   - l'écran de fin REMPLACE la fiche : transmettre d'abord, la correction ensuite, à la
     demande. Une correction lue d'abord fait oublier de renvoyer ;
   - le lien de résultat n'est pas affiché comme texte à lire : un champ d'une ligne,
     sélectionné en entier au toucher, repli du copier-coller quand le presse-papiers
     n'est pas accessible.

   Ce que l'écran garantit, et où :
   - aucune exception ne finit en écran blanc : tout échec devient l'écran de refus
     (critère 29) ;
   - la correction n'est posée qu'APRÈS que le résultat est figé (critère 17) ;
   - pas de chrono, pas de modale de récompense (critères 8 et 23) ;
   - la correction passe par les mêmes fonctions que la fiche ordinaire (critère 11).
   ============================================================ */
import { decoderEnvoi, type Envoi } from '../core/partage/envoi';
import { encoderResultat, type Resultat } from '../core/partage/resultat';
import {
	figerResultat,
	nouvelleCapture,
	noterReponse,
	type Capture,
} from '../core/partage/capture';
import { nouvelIdentifiant } from '../core/partage/liens';
import type { RaisonRefus } from '../core/partage/codec';
import {
	changerPseudo,
	MODE_PARTAGE,
	passageTermine,
	premierPassage,
	preparerPassage,
	normaliserPseudo,
	pseudoParDefaut,
	pseudoValide,
	statutItem,
	terminerPremierPassage,
	type BlocPassage,
	type ChampCorrige,
	type ItemPassage,
	type Passage,
	type RaisonInjouable,
} from '../core/partage/passage';
import type { StatutReponse } from '../core/partage/resultat';
import {
	createRenderContext,
	enonceTexte,
	figureBlock,
	lessonAttr,
	nextInputId,
	nomChampReponse,
	renderItem,
	withLessonId,
	type Item,
	type RenderContext,
} from '../core/items';
import { ttsAttr } from '../core/tts-text';
import { formatReponseRevelee } from '../core/nombres';
import { attribut, html, joindre, VIDE, type SafeHtml } from '../core/html';
import { scoreItems } from '../core/scoring';
import { activeProfile } from '../core/profiles';
import { icon } from './icon';
import { capterErreur, libelleChoix } from './erreur-capture';
import { bindConsigneTts } from './consigne-tts';
import { annoncer, causeRefus, copierTexte, urlDuLien } from './lien-partage';
import { champsIllisibles, lireSaisies, marquerChamps, signalerSaisiesIllisibles } from './session';
import { goHome, setCurrentLessonId, setCurrentMode, setRenderCtx, setToolbar } from './navigation';

type PassageOk = Extract<Passage, { ok: true }>;

interface SeanceEnCours {
	envoi: Envoi;
	blocs: BlocPassage[];
	/** Rejeu après un premier passage : rien n'est figé ni envoyé (critère 15). */
	entrainement: boolean;
	ctx: RenderContext;
	capture: Capture;
	finie: boolean;
}

let seance: SeanceEnCours | null = null;

/* Jeton du décodage en cours : le décodage est asynchrone, et l'enfant peut avoir changé
   d'écran avant qu'il aboutisse. Un résultat arrivé après coup est jeté. */
let jeton = 0;

/** Une séance est-elle en cours, non terminée ? La quitter perd ce qui a été répondu
 *  (rien n'est repris) : `main.ts` demande alors confirmation, comme pour le sprint. */
export const partageEnCours = (): boolean => !!seance && !seance.finie;

/** Oublie la séance et annule un décodage en vol (appelé à chaque changement d'écran). */
export function partageCleanup(): void {
	jeton++;
	seance = null;
}

/* ---------- Entrée : décodage, puis accueil, « déjà fait » ou refus ---------- */

export async function afficherEnvoi(code: string, el: HTMLElement): Promise<void> {
	const mien = ++jeton;
	el.innerHTML = html`<section class="partage-ecran" aria-busy="true">
      <p class="partage-texte">Ouverture de l'exercice…</p>
    </section>`.balisage;
	const dec = await decoderEnvoi(code).catch(() => ({
		ok: false as const,
		raison: 'illisible' as const,
	}));
	if (mien !== jeton) return;
	if (!dec.ok) {
		afficherRefus(el, dec.raison);
		return;
	}
	try {
		const passage = preparerPassage(dec.valeur);
		if (!passage.ok) {
			afficherRefus(el, passage.raison);
			return;
		}
		const deja = premierPassage(passage.envoi.id);
		if (deja) afficherDejaFait(el, passage, deja);
		else afficherAccueil(el, passage);
	} catch {
		// Un envoi conforme au schéma qui fait lever le rendu : refus propre plutôt qu'un
		// écran à moitié rempli (critère 29).
		afficherRefus(el, 'schema');
	}
}

/* Cause du refus, pour l'adulte (repliée sous « Pour l'adulte ») : l'enfant n'y peut
   rien, l'adulte doit pouvoir diagnostiquer — le plus souvent un lien coupé par une
   messagerie. */
const CAUSES_PASSAGE: Record<RaisonInjouable, string> = {
	lecon:
		"Une leçon de cet exercice n'existe pas dans cette version de Ludaskia. Mettez l'application à jour.",
	format: "Ce type d'exercice ne peut pas encore être joué depuis un lien.",
};

function cause(raison: RaisonRefus | RaisonInjouable): string {
	return raison === 'lecon' || raison === 'format'
		? CAUSES_PASSAGE[raison]
		: causeRefus(raison, 'envoi');
}

function afficherRefus(el: HTMLElement, raison: RaisonRefus | RaisonInjouable): void {
	seance = null;
	el.innerHTML = html`<section id="partageRefus" class="partage-ecran partage-refus">
      <h2 class="partage-titre" tabindex="-1">${icon('question')} Ce lien ne marche pas.</h2>
      <p class="partage-texte">Ce n'est pas de ta faute. Demande à la personne qui te l'a envoyé de te le renvoyer.</p>
      <details class="partage-adulte">
        <summary>Pour l'adulte</summary>
        <p>${cause(raison)}</p>
      </details>
      <button type="button" id="partageRetour" class="partage-btn partage-btn-principal">${icon('house')} Retour à l'accueil</button>
    </section>`.balisage;
	el.querySelector('#partageRetour')!.addEventListener('click', goHome);
	focusTitre(el);
}

function afficherAccueil(el: HTMLElement, p: PassageOk): void {
	el.innerHTML = html`<section id="partageAccueil" class="partage-ecran">
      <p class="partage-surtitre">${icon('bookmark')} Exercice envoyé</p>
      <h2 class="partage-titre" tabindex="-1">${p.envoi.libelle}</h2>
      <p class="partage-encart">${icon('eye')}<span>La personne qui t'a envoyé cet exercice verra tes réponses.</span></p>
      <p class="partage-texte">Réponds comme tu peux. Si tu ne sais pas, coche « Je ne sais pas » : c'est une vraie réponse.</p>
      <button type="button" id="partageCommencer" class="partage-btn partage-btn-principal">Commencer</button>
    </section>`.balisage;
	el.querySelector('#partageCommencer')!.addEventListener('click', () => demarrer(el, p, false));
	focusTitre(el);
}

function afficherDejaFait(el: HTMLElement, p: PassageOk, resultat: Resultat): void {
	el.innerHTML = html`<section id="partageDejaFait" class="partage-ecran">
      <p class="partage-surtitre">${icon('bookmark')} Exercice envoyé</p>
      <h2 class="partage-titre" tabindex="-1">${p.envoi.libelle}</h2>
      <p class="partage-texte">Tu as déjà fait cet exercice.</p>
      <div class="partage-pile">
        <button type="button" id="partageRecopier" class="partage-btn partage-btn-principal">
          <span>Recopier mon résultat</span>
          <span class="partage-btn-sous">Pour le redonner à la personne qui t'a envoyé cet exercice.</span>
        </button>
        <button type="button" id="partageEntrainer" class="partage-btn partage-btn-secondaire">
          <span>M'entraîner</span>
          <span class="partage-btn-sous">Rien n'est envoyé.</span>
        </button>
      </div>
    </section>`.balisage;
	el.querySelector('#partageRecopier')!.addEventListener('click', () => {
		el.innerHTML = repereHTML(p.envoi, false).balisage;
		afficherFin(el, resultat, null);
	});
	el.querySelector('#partageEntrainer')!.addEventListener('click', () => demarrer(el, p, true));
	focusTitre(el);
}

/* ---------- La séance ---------- */

/* Repère de séance (critère 7) : seul élément qui change par rapport au jeu libre, avec
   l'ABSENCE du chrono. Icône + texte, jamais la couleur seule. En entraînement, il dit
   que rien ne part : l'enfant ne cherche pas un lien qui ne viendra pas. Focalisable : il
   reçoit le focus au début de la séance (cf. `demarrer`). */
function repereHTML(envoi: Envoi, entrainement: boolean): SafeHtml {
	const quoi = entrainement ? "Entraînement : rien n'est envoyé" : 'Exercice envoyé';
	return html`<p id="partageRepere" tabindex="-1" class="partage-repere${entrainement ? ' partage-repere-entrainement' : ''}">${icon('bookmark')}<span class="partage-repere-quoi">${quoi}</span><span class="partage-repere-libelle">${envoi.libelle}</span></p>`;
}

function demarrer(el: HTMLElement, p: PassageOk, entrainement: boolean): void {
	const ctx = createRenderContext();
	setRenderCtx(ctx);
	setCurrentMode(MODE_PARTAGE);
	setCurrentLessonId(null);
	// Après la pose du mode : `setToolbar` en dérive `session-active` (pied de page masqué).
	setToolbar({ verify: false, home: true, profile: false });
	const items = p.blocs.flatMap((b) => b.items);
	seance = {
		envoi: p.envoi,
		blocs: p.blocs,
		entrainement,
		ctx,
		capture: nouvelleCapture(items.map((i) => i.capture)),
		finie: false,
	};
	let rang = 0;
	const fiches = joindre(
		p.blocs.map((b) => {
			const lignes = withLessonId(ctx, b.lecon.id, () =>
				joindre(b.items.map((ip) => itemHTML(ip, rang++, ctx))),
			);
			// Titre de bloc annoncé comme un titre : un bilan enchaîne plusieurs fiches, et la
			// navigation par titres est le seul repère d'un lecteur d'écran entre elles.
			return html`<div class="fiche partage-fiche">
          <div class="fiche-head"><p class="fiche-title partage-bloc-titre" role="heading" aria-level="3">${b.titre}</p></div>
          <p class="consigne-line"${ttsAttr(b.consigne)}>${b.consigne}</p>
          <div class="conj-list">${lignes}</div>
        </div>`;
		}),
	);
	// L'astuce de la fiche ordinaire (« tu peux laisser vide ») serait fausse ici : un champ
	// vide et « je ne sais pas » ne disent pas la même chose à l'encadrant (critère 9).
	el.innerHTML = html`${repereHTML(p.envoi, entrainement)}
    <div id="partageFiche">
      <p class="astuce-vide partage-astuce">${icon('feather')}<span>Tu ne sais pas ? Coche « Je ne sais pas ».</span></p>
      <div class="page">${fiches}</div>
      <div class="partage-actions">
        <p id="partageSeuil" class="partage-seuil" role="status" aria-live="polite"></p>
        <button type="button" id="partageFini" class="partage-btn partage-btn-principal">J'ai fini</button>
      </div>
    </div>`.balisage;
	brancherQuestions(el);
	el.querySelector('#partageFini')!.addEventListener('click', () => terminer(el));
	bindConsigneTts(el);
	// Focus sur le repère, pas sur le premier champ (relecture a11y) : sur tablette, un champ
	// focalisé ouvre le clavier virtuel avant que l'enfant ait lu la consigne, et une fiche
	// qui commence par un QCM n'a pas de champ à viser.
	el.querySelector<HTMLElement>('#partageRepere')?.focus({ preventScroll: true });
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function itemHTML(ip: ItemPassage, rang: number, ctx: RenderContext): SafeHtml {
	const corps = ip.item.choices?.length ? choixHTML(ip.item, ctx) : renderItem(ip.item, ctx);
	// Nom de la case : l'énoncé, pas un numéro que rien n'affiche. Sur un bilan, un lecteur
	// d'écran entendrait sinon trente fois « Je ne sais pas » sans savoir de quelle question.
	const nom = `Je ne sais pas : ${ip.capture.enonce || `question ${rang + 1}`}`;
	return html`<div class="conj-op partage-item"${attribut('data-index', rang)}>
      ${corps}
      <label class="partage-jnsp"><input type="checkbox"${attribut('aria-label', nom)}><span>Je ne sais pas</span></label>
    </div>`;
}

/* Un QCM dans une fiche (#734). Le bilan ordinaire ne sait pas le jouer à l'écran : son
   item n'a pas de champ (cf. `renderItem`, limite préexistante), si bien qu'une leçon
   dont le mode par défaut est un QCM n'y laisse rien à répondre. Ici, l'enfant DOIT
   pouvoir répondre à chaque question : les choix deviennent des boutons radio, dont la
   valeur alimente un champ `.ans` caché — corrigé, marqué et révélé exactement comme les
   autres (même `checkItemAnswer`, critère 11). Réservé à la séance partagée : le bilan
   ordinaire ne change pas (critère 27). */
function choixHTML(it: Item, ctx: RenderContext): SafeHtml {
	const id = nextInputId(ctx);
	ctx.items[id] = it;
	const options = joindre(
		(it.choices ?? []).map((valeur, i) => {
			const vue = it.choicesView?.[i];
			return html`<label class="partage-choix-opt"><input type="radio"${attribut('name', `${id}-choix`)}${attribut('value', valeur)}${vue ? attribut('aria-label', vue.label) : VIDE}><span class="partage-choix-vue">${vue ? vue.html : valeur}</span></label>`;
		}),
	);
	return html`${figureBlock(it.figure)}<p class="partage-question">${enonceTexte(it.text)}</p>
    <fieldset class="partage-choix"${attribut('data-for', id)}><legend class="sr-only">${nomChampReponse(it)}</legend>${options}</fieldset>
    <input type="hidden" class="ans"${attribut('id', id)}${attribut('data-answer', String(it.answer))}${lessonAttr(ctx)}><span class="mark"${attribut('data-for', id)}></span>`;
}

const PLACEHOLDER_JNSP = 'Je ne sais pas';

/* « Je ne sais pas » et les choix de QCM, question par question.
   Cocher met la saisie DE CÔTÉ et vide les champs (une seule réponse par question) ;
   décocher la restitue. Taper dans un champ décoche : un enfant de 8 ans ne fera pas le
   lien « il faut d'abord décocher », et un champ désactivé qui ne réagit pas au doigt le
   ferait se croire bloqué (avis designer). */
function brancherQuestions(el: HTMLElement): void {
	el.querySelectorAll<HTMLElement>('.partage-item').forEach((question) => {
		const caseJnsp = question.querySelector<HTMLInputElement>('.partage-jnsp input')!;
		const champs = () => [
			...question.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])'),
		];
		const visibles = () =>
			[...question.querySelectorAll<HTMLInputElement>('input.ans')].filter(
				(c) => c.type !== 'hidden' && !c.classList.contains('posee-cell'),
			);
		let deCote: { valeur: string; coche: boolean }[] | null = null;
		const quitterJnsp = () => {
			question.classList.remove('partage-item-jnsp');
			for (const c of visibles()) c.removeAttribute('placeholder');
		};
		caseJnsp.addEventListener('change', () => {
			if (caseJnsp.checked) {
				deCote = champs().map((c) => ({ valeur: c.value, coche: c.checked }));
				for (const c of champs()) {
					if (c.type === 'radio') c.checked = false;
					else c.value = '';
				}
				question.classList.add('partage-item-jnsp');
				for (const c of visibles()) c.placeholder = PLACEHOLDER_JNSP;
				return;
			}
			const gardes = deCote;
			deCote = null;
			if (gardes)
				champs().forEach((c, i) => {
					if (c.type === 'radio') c.checked = gardes[i]?.coche ?? false;
					else c.value = gardes[i]?.valeur ?? '';
				});
			quitterJnsp();
		});
		question.addEventListener('input', (e) => {
			if (e.target === caseJnsp || !caseJnsp.checked) return;
			caseJnsp.checked = false;
			deCote = null;
			quitterJnsp();
		});
		const cache = question.querySelector<HTMLInputElement>('input.ans[type="hidden"]');
		question.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((r) =>
			r.addEventListener('change', () => {
				if (cache && r.checked) cache.value = r.value;
			}),
		);
	});
}

/* La saisie telle que l'encadrant la lira : le LIBELLÉ d'un choix de QCM, pas sa valeur
   brute (même règle que le journal d'erreurs). */
function saisieLisible(it: Item, saisie: string): string {
	return it.choices?.length ? libelleChoix(it.choices, it.choicesView, saisie) : saisie;
}

const MESSAGE_SEUIL =
	'Il reste des questions sans réponse. Réponds-y, ou coche « Je ne sais pas ».';

type Verdict = { statut: StatutReponse; saisie: string };

function terminer(el: HTMLElement): void {
	const s = seance;
	if (!s || s.finie) return;
	const inputs = [...el.querySelectorAll<HTMLInputElement>('#partageFiche input.ans')];
	// Même refus que la fiche ordinaire pour une saisie qui n'est pas un nombre (critère 11).
	const illisibles = champsIllisibles(inputs, s.ctx.items);
	if (illisibles.length) {
		signalerSaisiesIllisibles(illisibles);
		return;
	}
	const scored = lireSaisies(inputs, s.ctx.items);
	const { statuses } = scoreItems(scored);
	const parId = new Map(scored.map((x) => [x.id, x]));
	const questions = [...el.querySelectorAll<HTMLElement>('.partage-item')];
	const verdicts = questions.map((question): Verdict => {
		const jnsp = question.querySelector<HTMLInputElement>('.partage-jnsp input')!.checked;
		const champs = [...question.querySelectorAll<HTMLInputElement>('input.ans')].map(
			(inp): ChampCorrige => {
				const lu = parId.get(inp.id);
				const pos = lu?.item?.posedResult?.pos;
				return {
					saisie: lu?.saisie ?? '',
					correct: statuses[inp.id] === 'correct',
					...(pos !== undefined ? { pos } : {}),
				};
			},
		);
		return statutItem(champs, jnsp);
	});
	if (!passageTermine(verdicts.map((v) => v.statut))) {
		// Rien n'est figé, la fiche reste : le premier passage n'est pas consommé. L'enfant est
		// mené à la première question sans réponse — le message ne dit pas laquelle.
		annoncer(el.querySelector<HTMLElement>('#partageSeuil')!, MESSAGE_SEUIL);
		const premiere = questions[verdicts.findIndex((v) => v.statut === 'vide')];
		premiere
			?.querySelector<HTMLInputElement>('input:not([type="hidden"])')
			?.focus({ preventScroll: true });
		premiere?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		return;
	}
	const items = s.blocs.flatMap((b) => b.items);
	verdicts.forEach((v, i) => {
		if (v.statut !== 'vide')
			noterReponse(s.capture, i, {
				statut: v.statut,
				saisie: saisieLisible(items[i].item, v.saisie),
			});
	});
	// Le résultat est figé AVANT que la correction soit posée (critère 17).
	const resultat = s.entrainement ? null : figerPremierPassage(s);
	s.finie = true;
	const fiche = el.querySelector<HTMLElement>('#partageFiche');
	try {
		journaliser(items, verdicts);
		marquerChamps(inputs, statuses, s.ctx.items);
		revelerQuestions(questions, verdicts);
		figerFiche(el);
	} catch {
		// La correction est un confort ; le lien de résultat, lui, doit sortir quoi qu'il
		// arrive : on passe à l'écran de fin sans fiche corrigée.
		fiche?.remove();
		if (resultat) afficherFin(el, resultat, null);
		else afficherFinEntrainement(el, null);
		return;
	}
	if (resultat) afficherFin(el, resultat, fiche);
	else afficherFinEntrainement(el, fiche);
}

function figerPremierPassage(s: SeanceEnCours): Resultat {
	const o = {
		pseudo: pseudoParDefaut(activeProfile().name),
		date: Date.now(),
		id: nouvelIdentifiant(),
	};
	try {
		return terminerPremierPassage(s.envoi, s.capture, o);
	} catch {
		// Stockage indisponible : l'enfant a fini, son lien doit sortir quand même.
		return figerResultat(s.capture, { envoi: s.envoi, ...o });
	}
}

/* Journal d'erreurs (#391, critère 25) : une entrée par question fausse ou passée par
   « je ne sais pas » (marquée « n'a pas essayé », comme #467). Entraînement compris :
   tout chemin qui corrige une réponse d'enfant journalise. */
function journaliser(items: ItemPassage[], verdicts: Verdict[]): void {
	verdicts.forEach((v, i) => {
		if (v.statut !== 'faux' && v.statut !== 'jnsp') return;
		const ip = items[i];
		capterErreur({
			text: ip.capture.enonce,
			donnee: v.statut === 'jnsp' ? '' : saisieLisible(ip.item, v.saisie),
			attendue: ip.capture.attendue,
			lessonId: ip.capture.lecon,
			mode: MODE_PARTAGE,
			sansTentative: v.statut === 'jnsp',
		});
	});
}

/* Ce que `marquerChamps` ne fait pas, parce que la fiche ordinaire n'en a pas besoin :
   - une question passée par « je ne sais pas » a ses champs VIDES, donc ni marque ni
     réponse révélée ; or c'est précisément là que l'enfant a demandé à savoir. On révèle
     la réponse, sans croix : ce n'est pas une faute (même ton que #467) ;
   - le champ d'un QCM est caché : la marque est rattachée au GROUPE de choix
     (`aria-describedby`), sans quoi un lecteur d'écran ne l'entendrait jamais. */
function revelerQuestions(questions: HTMLElement[], verdicts: Verdict[]): void {
	questions.forEach((question, i) => {
		if (verdicts[i].statut === 'jnsp') {
			for (const inp of question.querySelectorAll<HTMLInputElement>('input.ans')) {
				const mark = question.querySelector<HTMLElement>(`.mark[data-for="${inp.id}"]`);
				if (!mark) continue;
				const revelee = formatReponseRevelee(inp.dataset.attendue ?? inp.dataset.answer ?? '');
				mark.className = 'mark revelee';
				mark.id = `${inp.id}-mark`;
				mark.innerHTML = html`<span class="sol">→ ${revelee}</span>`.balisage;
				if (inp.type !== 'hidden') inp.setAttribute('aria-describedby', mark.id);
			}
		}
		const groupe = question.querySelector<HTMLElement>('fieldset.partage-choix');
		const idChamp = groupe?.dataset.for;
		const mark = idChamp
			? question.querySelector<HTMLElement>(`.mark[data-for="${idChamp}"]`)
			: null;
		if (groupe && mark?.textContent) {
			mark.id ||= `${idChamp}-mark`;
			groupe.setAttribute('aria-describedby', mark.id);
		}
	});
}

/* La fiche corrigée ne se modifie plus : le résultat est figé, et une saisie retouchée
   effacerait la marque qu'on vient de poser. Cases et choix restent ATTEIGNABLES au
   clavier (`aria-disabled` plutôt que `disabled`) : l'enfant au lecteur d'écran doit
   pouvoir relire ce qu'il avait coché. */
function figerFiche(el: HTMLElement): void {
	const fiche = el.querySelector<HTMLElement>('#partageFiche');
	if (!fiche) return;
	fiche.querySelectorAll<HTMLInputElement>('input').forEach((c) => {
		if (c.type === 'checkbox' || c.type === 'radio') c.setAttribute('aria-disabled', 'true');
		else c.readOnly = true;
	});
	const bloquer = (e: Event) => {
		const cible = e.target;
		if (cible instanceof HTMLElement && cible.getAttribute('aria-disabled') === 'true')
			e.preventDefault();
	};
	fiche.addEventListener('click', bloquer, true);
	fiche.addEventListener(
		'keydown',
		(e) => {
			if (e.key.startsWith('Arrow')) bloquer(e);
		},
		true,
	);
	fiche.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = true));
	fiche.querySelector('.partage-actions')?.remove();
	fiche.querySelector('.partage-astuce')?.remove();
	// Titre de la correction, focalisé quand elle s'affiche (« Voir ma correction ») : le
	// bouton qui la révèle disparaît, et le focus ne doit pas retomber sur la page.
	const entete = document.createElement('div');
	entete.className = 'partage-correction-entete';
	entete.innerHTML =
		html`<h2 id="partageCorrection" class="partage-titre" tabindex="-1">Ta correction</h2>
      <p class="partage-texte">La réponse attendue est écrite à côté de chaque erreur et de chaque « Je ne sais pas ».</p>`.balisage;
	fiche.prepend(entete);
}

/* ---------- Fin ---------- */

/* Insère un écran de fin au-dessus de la fiche (ou à la suite, sans fiche) et y met le
   focus. */
function insererEcran(
	el: HTMLElement,
	id: string,
	contenu: SafeHtml,
	fiche: HTMLElement | null,
): HTMLElement {
	const section = document.createElement('section');
	section.id = id;
	section.className = 'partage-ecran';
	section.innerHTML = contenu.balisage;
	el.insertBefore(section, fiche);
	section.querySelector('#partageAccueilFin')?.addEventListener('click', goHome);
	focusTitre(section);
	window.scrollTo({ top: 0, behavior: 'smooth' });
	return section;
}

/* Écran de fin d'un premier passage (critère 13), ou de sa recopie (critère 15, sans
   fiche ni correction). `fiche` : la fiche corrigée, masquée jusqu'à « Voir ma
   correction ». */
function afficherFin(el: HTMLElement, resultat: Resultat, fiche: HTMLElement | null): void {
	if (fiche) fiche.hidden = true;
	const natif = typeof navigator.share === 'function';
	const section = insererEcran(
		el,
		'partageFin',
		html`<h2 class="partage-titre" tabindex="-1">${icon('check-circle')} Bravo, tu as fini !</h2>
      <p class="partage-texte">Il reste une chose à faire : renvoyer ton lien à la personne qui t'a donné cet exercice.</p>
      <label class="partage-label" for="partagePseudo">Ton prénom ou ton pseudo</label>
      <input id="partagePseudo" class="partage-pseudo" maxlength="30" autocomplete="off" spellcheck="false" aria-describedby="partagePseudoAide"${attribut('value', resultat.pseudo)}>
      <p id="partagePseudoAide" class="partage-aide" aria-live="polite">${AIDE_PSEUDO}</p>
      <label class="partage-label" for="partageLien">Ton lien de résultat</label>
      <input id="partageLien" class="partage-lien" readonly>
      <div class="partage-boutons">
        ${natif ? html`<button type="button" id="partagePartager" class="partage-btn partage-btn-principal" disabled>${icon('export')} Partager</button>` : VIDE}
        <button type="button" id="partageCopier" class="partage-btn ${natif ? 'partage-btn-secondaire' : 'partage-btn-principal'}" disabled>Copier le lien</button>
      </div>
      <p id="partageCopie" class="partage-copie" role="status" aria-live="polite"></p>
      ${fiche ? html`<button type="button" id="partageVoirCorrection" class="partage-btn partage-btn-secondaire">${icon('eye')} Voir ma correction</button>` : VIDE}
      <button type="button" id="partageAccueilFin" class="partage-btn partage-btn-lien">${icon('house')} Retour à l'accueil</button>`,
		fiche,
	);
	brancherLien(section, resultat);
	section.querySelector('#partageVoirCorrection')?.addEventListener('click', (e) => {
		if (!fiche) return;
		fiche.hidden = false;
		(e.currentTarget as HTMLElement).remove();
		fiche.querySelector<HTMLElement>('#partageCorrection')?.focus({ preventScroll: true });
		fiche.scrollIntoView({ behavior: 'smooth', block: 'start' });
	});
}

const AIDE_PSEUDO =
	'Tu peux écrire des lettres, des chiffres, des espaces, des apostrophes et des tirets.';
const AIDE_PSEUDO_VIDE = 'Écris ton prénom ou ton pseudo pour fabriquer ton lien.';
const AIDE_PSEUDO_REFUSE =
	"Ce caractère n'est pas permis. Tu peux écrire des lettres, des chiffres, des espaces, des apostrophes et des tirets.";

/* Le lien de résultat suit le pseudo : il est refait à chaque frappe, sinon l'enfant
   copierait un lien qui porte l'ancien nom. Un pseudo hors liste blanche (critère 39)
   désactive la copie et le partage, et l'aide le dit en mots, pas par la couleur. Un champ
   VIDE n'est pas une erreur : quand le prénom du profil n'a pas pu être prérempli,
   l'écran ne s'ouvre pas sur un reproche, il demande. */
function brancherLien(section: HTMLElement, resultat: Resultat): void {
	const champ = section.querySelector<HTMLInputElement>('#partagePseudo')!;
	const lien = section.querySelector<HTMLInputElement>('#partageLien')!;
	const copier = section.querySelector<HTMLButtonElement>('#partageCopier')!;
	const partager = section.querySelector<HTMLButtonElement>('#partagePartager');
	const copie = section.querySelector<HTMLElement>('#partageCopie')!;
	const aide = section.querySelector<HTMLElement>('#partagePseudoAide')!;
	let url = '';
	let version = 0;
	const activer = (oui: boolean) => {
		copier.disabled = !oui;
		if (partager) partager.disabled = !oui;
	};
	const refaire = async () => {
		const mienne = ++version;
		const pseudo = normaliserPseudo(champ.value);
		const valide = pseudoValide(pseudo);
		const refuse = !valide && pseudo !== '';
		champ.setAttribute('aria-invalid', String(refuse));
		aide.classList.toggle('partage-aide-erreur', refuse);
		const texteAide = refuse ? AIDE_PSEUDO_REFUSE : pseudo === '' ? AIDE_PSEUDO_VIDE : AIDE_PSEUDO;
		if (aide.textContent !== texteAide) aide.textContent = texteAide;
		copie.textContent = '';
		url = '';
		lien.value = '';
		activer(false);
		if (!valide) return;
		const r = changerPseudo(resultat.envoi.id, pseudo) ?? { ...resultat, pseudo };
		try {
			const code = await encoderResultat(r);
			if (mienne !== version) return;
			url = urlDuLien('resultat', code);
			lien.value = url;
			activer(true);
		} catch {
			if (mienne === version) annoncer(copie, 'Cet appareil ne sait pas fabriquer le lien.');
		}
	};
	champ.addEventListener('input', () => void refaire());
	lien.addEventListener('focus', () => lien.select());
	copier.addEventListener('click', () => void copierLien(url, lien, copie));
	partager?.addEventListener('click', () => {
		if (!url) return;
		navigator.share({ title: `Mes réponses : ${resultat.envoi.libelle}`, url }).catch(() => {
			// Feuille de partage refermée sans choisir : rien à dire.
		});
	});
	void refaire();
}

/* Copie du lien. Faute de presse-papiers, la consigne d'appui long. La confirmation RESTE
   affichée : un message qui s'efface en deux secondes, un enfant ne le voit pas. */
async function copierLien(url: string, lien: HTMLInputElement, copie: HTMLElement): Promise<void> {
	if (!url) return;
	const ok = await copierTexte(url, lien);
	annoncer(
		copie,
		ok
			? 'Lien copié ! Tu peux le coller dans un message.'
			: 'Appuie longuement sur le lien pour le copier.',
	);
}

function afficherFinEntrainement(el: HTMLElement, fiche: HTMLElement | null): void {
	insererEcran(
		el,
		'partageFinEntrainement',
		html`<h2 class="partage-titre" tabindex="-1">${icon('check-circle')} Bravo, tu as fini l'entraînement !</h2>
      <p class="partage-texte">Rien n'a été envoyé. Ta correction est juste en dessous.</p>
      <button type="button" id="partageAccueilFin" class="partage-btn partage-btn-secondaire">${icon('house')} Retour à l'accueil</button>`,
		fiche,
	);
}

/* ---------- Utilitaires ---------- */

/* Focus sur le titre de chaque écran : un lecteur d'écran annonce où l'on est arrivé. */
function focusTitre(racine: ParentNode): void {
	racine.querySelector<HTMLElement>('.partage-titre')?.focus({ preventScroll: true });
}
