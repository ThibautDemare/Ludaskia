/* ============================================================
   Étagère de jeux (#661) — le plafond quotidien de temps de jeu.
   Couvre les critères 10 (durée en minutes, défaut 10, réglable) et 11
   (quotidien, non cumulable, NON REPORTABLE).

   Le cas qui compte est celui que le critère 11 écrit noir sur blanc : « deux
   jours sans jouer permettent 30 minutes le troisième » est un échec. Un état
   daté d'hier ne reporte donc RIEN — il vaut zéro consommé aujourd'hui, pas un
   crédit. Le jour est injecté (`aujourdhui`), donc aucun test ne dépend de
   l'horloge de la machine.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { PLAFOND_DEFAUT_MINUTES, restantSecondes, consommer } from '../src/core/jeux/plafond';
import type { EtatPlafond } from '../src/core/jeux/plafond';

const AUJOURDHUI = '2026-09-06';
const HIER = '2026-09-05';
const AVANT_HIER = '2026-09-04';

describe('plafond — la valeur par défaut et le réglage (critère 10)', () => {
	it('vaut 10 minutes par défaut', () => {
		expect(PLAFOND_DEFAUT_MINUTES).toBe(10);
	});

	it('donne 10 minutes de jeu à un enfant qui n’a pas encore joué aujourd’hui', () => {
		expect(restantSecondes(null, PLAFOND_DEFAUT_MINUTES, AUJOURDHUI)).toBe(600);
	});

	it('suit le réglage de l’encadrant, à la hausse comme à la baisse', () => {
		expect(restantSecondes(null, 20, AUJOURDHUI)).toBe(1200);
		expect(restantSecondes(null, 5, AUJOURDHUI)).toBe(300);
	});

	it('à 0 minute, ne laisse aucun temps de jeu', () => {
		// Le réglage porte aussi l'extinction : un plafond nul ne « déborde » pas.
		expect(restantSecondes(null, 0, AUJOURDHUI)).toBe(0);
		expect(restantSecondes({ jour: AUJOURDHUI, secondes: 0 }, 0, AUJOURDHUI)).toBe(0);
	});
});

describe('plafond — décompte du jour (critère 10)', () => {
	it('retranche ce qui a déjà été joué aujourd’hui', () => {
		expect(restantSecondes({ jour: AUJOURDHUI, secondes: 120 }, 10, AUJOURDHUI)).toBe(480);
		expect(restantSecondes({ jour: AUJOURDHUI, secondes: 600 }, 10, AUJOURDHUI)).toBe(0);
	});

	it('ne rend jamais un restant négatif, même si la partie a débordé', () => {
		// Une partie qui se termine 30 s après le plafond doit rendre 0, pas -30 : un
		// restant négatif se propagerait en « temps dû » le lendemain.
		expect(restantSecondes({ jour: AUJOURDHUI, secondes: 1000 }, 10, AUJOURDHUI)).toBe(0);
	});
});

describe('plafond — quotidien, ni cumulable ni reportable (critère 11)', () => {
	it('ignore un état daté d’hier : le solde non consommé ne se reporte pas', () => {
		// Hier : rien joué. Aujourd'hui : 10 minutes, pas 20.
		expect(restantSecondes({ jour: HIER, secondes: 0 }, 10, AUJOURDHUI)).toBe(600);
	});

	it('deux jours sans jouer ne donnent pas 30 minutes le troisième', () => {
		// Le cas d'échec littéral du critère 11.
		expect(restantSecondes({ jour: AVANT_HIER, secondes: 0 }, 10, AUJOURDHUI)).toBe(600);
	});

	it('remet le compteur à zéro le lendemain, même après une journée pleine', () => {
		expect(restantSecondes({ jour: HIER, secondes: 600 }, 10, AUJOURDHUI)).toBe(600);
	});

	it('ne fait pas non plus déborder le plafond quand le réglage change de valeur', () => {
		// Passer de 20 à 10 minutes en cours de journée ne crée pas de dette : le
		// restant reste borné à [0, plafond].
		const etat: EtatPlafond = { jour: AUJOURDHUI, secondes: 900 };
		expect(restantSecondes(etat, 10, AUJOURDHUI)).toBe(0);
		expect(restantSecondes(etat, 20, AUJOURDHUI)).toBe(300);
	});
});

describe('consommer — l’état après avoir joué', () => {
	it('crée l’état du jour quand il n’y en avait pas', () => {
		expect(consommer(null, 30, AUJOURDHUI)).toEqual({ jour: AUJOURDHUI, secondes: 30 });
	});

	it('cumule les parties d’une même journée', () => {
		const apres = consommer({ jour: AUJOURDHUI, secondes: 30 }, 45, AUJOURDHUI);
		expect(apres).toEqual({ jour: AUJOURDHUI, secondes: 75 });
	});

	it('repart de zéro sur un état d’hier, sans reprendre ses secondes', () => {
		expect(consommer({ jour: HIER, secondes: 500 }, 30, AUJOURDHUI)).toEqual({
			jour: AUJOURDHUI,
			secondes: 30,
		});
	});

	it('ne change rien pour une durée nulle (partie ouverte puis quittée aussitôt)', () => {
		expect(consommer({ jour: AUJOURDHUI, secondes: 42 }, 0, AUJOURDHUI)).toEqual({
			jour: AUJOURDHUI,
			secondes: 42,
		});
	});

	it('est pure : ne mute pas l’état reçu et n’écrit rien dans le stockage', () => {
		const etat: EtatPlafond = { jour: AUJOURDHUI, secondes: 42 };
		const avant = localStorage.length;
		const apres = consommer(etat, 60, AUJOURDHUI);
		expect(etat).toEqual({ jour: AUJOURDHUI, secondes: 42 });
		expect(apres).not.toBe(etat);
		expect(localStorage.length).toBe(avant);
	});

	it('reste cohérente avec restantSecondes tout au long d’une journée', () => {
		let etat = consommer(null, 120, AUJOURDHUI);
		expect(restantSecondes(etat, 10, AUJOURDHUI)).toBe(480);
		etat = consommer(etat, 300, AUJOURDHUI);
		expect(restantSecondes(etat, 10, AUJOURDHUI)).toBe(180);
		etat = consommer(etat, 180, AUJOURDHUI);
		expect(restantSecondes(etat, 10, AUJOURDHUI)).toBe(0);
		// Minuit passe : la journée suivante redonne le plafond entier, pas plus.
		expect(restantSecondes(etat, 10, '2026-09-07')).toBe(600);
	});
});
