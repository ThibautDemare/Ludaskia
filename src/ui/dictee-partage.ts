/* ============================================================
   Séance partagée (#734) — la DICTÉE reçue par lien, un mot à la fois.

   Le geste est celui de la dictée du jeu libre (`renderDictee`, `ortho-taches.ts`) :
   écouter, puis écrire, avec le clavier d'accents ; le mot est dicté dès l'arrivée et le
   champ prend le focus (#702). Ce qui change, comme pour les runners de leçon
   (`runner-partage.ts`) :
   - aucun verdict avant la fin (critère 17) : « Valider » note la réponse et passe au
     mot suivant, sans « Bravo », sans second essai ni correction guidée ;
   - « Je ne sais pas » est une case du bloc de décision (critère 9) ;
   - rien ne fait monter un mot de la banque du profil : l'envoi n'est pas une de ses
     listes, et l'XP de la séance est celle de la participation (critère 23).
   La correction reste celle du jeu libre (critère 11) : le même `checkAnswer`, sur
   l'exercice de dictée du mot.

   La voix EST l'exercice. Si elle se tait en cours de route (`onErreur` de la lecture),
   la séance s'arrête (`silence`) sans rien figer ni journaliser : une saisie faite dans le
   silence n'est pas une faute d'orthographe (#391), et le premier passage doit rester
   disponible pour le jour où le son marchera.
   ============================================================ */
import { checkAnswer, type Exercise } from '../core/exercise';
import { html } from '../core/html';
import { TEXT_ANSWER_INPUT_ATTRS } from '../core/items';
import { enonceJournalOrtho } from '../core/orthographe/exercise';
import type { MotDictee } from '../core/partage/envoi';
import { focaliserChamp } from './anti-suggestion';
import { rendreLaMainApresEcoute } from './consigne-tts';
import { icon } from './icon';
import { leconProgressHTML } from './lecon-runner-shared';
import { contexteHTML, ecouterCible, ecouterLabel, renderAccentKb } from './ortho-taches';
import {
	brancherDecisionPartage,
	decisionPartageHTML,
	AIDE_DECISION,
	enchainerPartage,
	erreurPassee,
	rangDit,
	type JeuSeance,
	type ReponseRunner,
} from './runner-partage';

/** La dictée qu'un envoi fait jouer à l'écran partagé. */
export interface SeanceDictee extends JeuSeance {
	mots: readonly MotDictee[];
	/** Leçon où ranger les erreurs : la source de l'envoi (cf. `preparerPassage`). */
	lecon: string;
	/** La voix s'est tue : l'écran partagé arrête la séance sans rien garder. */
	silence(): void;
}

const VALIDER_ID = 'partageValider';

/** Joue la dictée de l'envoi, du premier au dernier mot. */
export function jouerPartageDictee(s: SeanceDictee): void {
	// Les exercices du jeu libre, un par mot : c'est sur eux que `checkAnswer` corrige, et
	// leur nombre que l'enchaînement compte.
	const exercices: Exercise[] = s.mots.map((m) => ({
		type: 'dictee',
		answer: m.mot,
		commeDans: m.commeDans,
	}));
	rendreMot(s, exercices, 0);
}

const UNITE = 'Mot';

function rendreMot(s: SeanceDictee, exercices: Exercise[], index: number): void {
	const mot = s.mots[index];
	const verbe = !!mot.contexte;
	// Le focus va sur le champ, pas sur la carte : le rang, écrit dans la barre de
	// progression hors de la carte, est donc dit par la carte NOMMÉE (dès le premier mot) et
	// par le nom du champ lui-même, que le lecteur d'écran énonce à l'arrivée du focus.
	const rang = rangDit({ unite: UNITE }, index + 1, s.mots.length);
	s.scene.innerHTML = html`<div class="sprint sprint-lecon partage-dictee">
      ${leconProgressHTML(index, s.mots.length, UNITE)}
      <div class="sprint-stage ortho-run" role="group" tabindex="-1" aria-label="${rang}">
        <p class="ortho-run-consigne">${verbe ? 'Écoute la phrase, puis écris seulement le verbe.' : 'Écoute le mot, puis écris-le.'}</p>
        ${contexteHTML(mot)}
        <button type="button" class="btn-primary ortho-ecouter" id="btnEcouter">${icon('speaker')} ${ecouterLabel(mot)}</button>
        <div class="ortho-saisie">
          <input class="ortho-input" id="orthoInput" ${TEXT_ANSWER_INPUT_ATTRS}
                 aria-label="${rang} : ${verbe ? 'écris le verbe' : 'écris le mot'}" />
          <div class="accent-kb" id="accentKb"></div>
        </div>
        ${decisionPartageHTML(VALIDER_ID)}
      </div>
    </div>`.balisage;
	const input = s.scene.querySelector<HTMLInputElement>('#orthoInput')!;
	const clavier = s.scene.querySelector<HTMLElement>('#accentKb')!;
	renderAccentKb(clavier, input);

	let muette = false;
	const ecouter = () =>
		ecouterCible(mot, () => {
			if (muette) return;
			muette = true;
			s.silence();
		});
	const btnEcouter = s.scene.querySelector<HTMLButtonElement>('#btnEcouter')!;
	btnEcouter.addEventListener('click', ecouter);
	rendreLaMainApresEcoute(btnEcouter); // #702, comme la dictée du jeu libre

	const decision = brancherDecisionPartage(s.scene, {
		validerId: VALIDER_ID,
		repondu: () => input.value.trim() !== '',
		onValider: () => {
			const reponse = reponseDuMot(s, exercices[index], mot, input.value, decision.jnsp());
			enchainerPartage({ ...s, exercices, unite: UNITE }, index, reponse, () =>
				rendreMot(s, exercices, index + 1),
			);
		},
	});
	// Écrire décoche « Je ne sais pas ». Une touche d'accent écrit sans émettre `input` :
	// son clic, qui remonte au clavier APRÈS l'insertion, compte aussi.
	input.addEventListener('input', () => decision.widgetTouche());
	clavier.addEventListener('click', (e) => {
		if ((e.target as Element).closest('.accent-key')) decision.widgetTouche();
	});
	// Entrée valide, comme en jeu libre, mais par « Valider » : il ne note qu'une fois. Tant
	// qu'il n'y a rien à noter, Entrée dit pourquoi elle n'agit pas : l'aide est visible,
	// mais rien ne l'annonce à qui tape sans voir l'écran.
	const valider = s.scene.querySelector<HTMLButtonElement>(`#${VALIDER_ID}`)!;
	input.addEventListener('keydown', (e) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		e.stopPropagation();
		if (valider.disabled) s.annoncer(AIDE_DECISION);
		else valider.click();
	});

	// Lecture EN DERNIER, après le câblage : un échec immédiat appelle `silence`, qui
	// remplace tout l'écran (même ordre que `renderDictee`).
	ecouter();
	if (input.isConnected) focaliserChamp(input);
}

/* Ce que « Valider » note pour un mot. « Je ne sais pas » l'emporte sur ce que contient le
   champ (décision 17 de la séance en runner) ; sinon la correction du jeu libre. Une
   entrée de journal par mot raté, celle de la dictée du jeu libre (`journalErreurOrtho`). */
function reponseDuMot(
	s: SeanceDictee,
	ex: Exercise,
	mot: MotDictee,
	tape: string,
	jnsp: boolean,
): ReponseRunner {
	const text = enonceJournalOrtho(mot, 'dictee');
	if (jnsp)
		return {
			statut: 'jnsp',
			saisie: '',
			erreurs: [erreurPassee({ text, attendue: mot.mot, lessonId: s.lecon })],
		};
	const saisie = tape.trim();
	if (checkAnswer(ex, tape)) return { statut: 'juste', saisie, erreurs: [] };
	return {
		statut: 'faux',
		saisie,
		erreurs: [{ text, donnee: saisie, attendue: mot.mot, lessonId: s.lecon }],
	};
}
