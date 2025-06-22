import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { WebsocketService } from '../../services/websocket.service';
import { Subscription, interval } from 'rxjs';
import { CommonModule } from '@angular/common';
import { SoundService } from '../../services/sound.service';

@Component({
  selector: 'app-room',
  templateUrl: './room.html',
  styleUrl: './room.scss',
  standalone: true,
  imports: [CommonModule]
})
export class Room implements OnInit, OnDestroy {
  ws = inject(WebsocketService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  sound = inject(SoundService);

  code = '';
  playerName = '';
  tournament: any = null;
  player: any = null; // Joueur courant
  leaderboard: any[] = [];
  eliminated = false;
  rank = 0;
  cashPrize = 0;
  averageStack = 0;
  timerSub: Subscription | null = null;
  wsSub: Subscription | null = null;
  timerDisplay = '--:--';
  timerPerc = 0;
  currentLevel: any = null;
  nextLevel: any = null;
  remainingPlayers = 0;
  lastTableId: number | null = null;
  tableChangedMsg = '';
  tableChangedTimeout: any = null;

  ngOnInit() {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    this.playerName = this.route.snapshot.queryParamMap.get('name') ?? '';
    if (!this.playerName) {
      this.router.navigate(['/']);
      return;
    }
  
    this.ws.connect('player', this.code);
  
    // Étape 1 : demande d’inscription/connexion joueur
    this.ws.insertPlayer(this.code, this.playerName);

    // Attente de la réponse du serveur
    this.ws.on<any>('playerJoinResult').subscribe(res => {
      if (res.error) {
        alert(res.error);
        this.router.navigate(['/']);
        return;
      }
      this.tournament = res.tournament;
      // On peut stocker l’id du player (utile si recave/élim)
      this.player = res.tournament.players.find(
        (p: any) => p.pseudo.toLowerCase() === this.playerName.toLowerCase()
      );
      this.remainingPlayers = (res.players ?? []).filter((p: any) => !p.is_out).length;

      // Leaderboard si out
      this.eliminated = !!this.player?.is_out;
      if (this.eliminated) {
        this.getLeaderboard();
      }

      // Actualise timer/blindes
      this.updateClockInfos();
      this.cashPrize = this.calculateCashPrize();
      this.averageStack = this.calculateAverageStack();
    });

    this.wsSub = this.ws.on<any>('tournamentStateUpdated').subscribe((data) => {
      this.tournament = data;
      // Détecte changement de table
      const prevTable = this.player?.tableId ?? null;
      this.player = (data.players ?? []).find((p: any) => p.pseudo.toLowerCase() === this.playerName.toLowerCase());
      if (this.player && this.player.tableId && this.player.tableId !== prevTable) {
        this.showTableChangedMsg(this.player.table?.numero ?? this.player.tableId);
      }
      this.remainingPlayers = (data.players ?? []).filter((p: any) => !p.is_out).length;

      // Leaderboard si out
      this.eliminated = !!this.player?.is_out;
      if (this.eliminated) {
        this.getLeaderboard();
      }

      // Actualise timer/blindes
      this.updateClockInfos();
      this.cashPrize = this.calculateCashPrize();
      this.averageStack = this.calculateAverageStack();
    });

    this.ws.on<any>('blindsUp').subscribe(level => {
      this.sound.play('blinds-up');
    });

    this.ws.on<any>('playerEliminated').subscribe(ev => {
      // Si c'est ce joueur qui est out, joue le son
      if (ev?.playerId && this.player?.id === ev.playerId) {
        this.sound.play('eliminated');
      }
    });

    // Actualise le timer toutes les 500ms
  this.timerSub = interval(500).subscribe(() => this.updateClockInfos());
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
    this.timerSub?.unsubscribe();
    this.ws.disconnect();
  }

  showTableChangedMsg(newTable: number) {
    this.tableChangedMsg = `Vous avez changé de table ! Rendez-vous à la table #${newTable}`;
    if (this.tableChangedTimeout) clearTimeout(this.tableChangedTimeout);
    this.tableChangedTimeout = setTimeout(() => this.tableChangedMsg = '', 8000);
  }

  updateClockInfos() {
    if (!this.tournament?.clock || !this.tournament?.blind_levels) {
      this.timerDisplay = '--:--';
      this.timerPerc = 0;
      this.currentLevel = null;
      this.nextLevel = null;
      return;
    }
    const { currentLevel, levelStartAt, elapsed, paused } = this.tournament.clock;
    const blinds = this.tournament.blind_levels;
    this.currentLevel = blinds[currentLevel];
    this.nextLevel = blinds[currentLevel + 1];

    let secondsElapsed = elapsed;
    if (!paused && this.tournament.etat === 'en_cours') {
      const now = Date.now();
      secondsElapsed += Math.floor((now - new Date(levelStartAt).getTime()) / 1000);
    }
    
    const duree = this.currentLevel?.duree || 1;
    const secondsLeft = Math.max(0, duree - secondsElapsed);

    this.timerDisplay = this.formatTimer(secondsLeft);
    this.timerPerc = Math.min(100, 100 * (duree - secondsLeft) / duree);
  }

  formatTimer(s: number): string {
    if (s <= 0) return '00:00';
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
  }

  // Calcul du prizepool : (nb joueurs x cave) et ajouter les recaves
  // Si recave_max > 0, on ajoute le montant des recaves
  // Si recave_max = 0, on ne compte pas les recaves
  calculateCashPrize(): number {
    if (!this.tournament?.players) return 0;
    const nbPlayers = this.tournament.players.length;
    const cave = this.tournament.valeur_cave || 0;
    const recaveMax = this.tournament.recave_max || 0;
    const recaveAmount = recaveMax > 0 ? (this.tournament.players.reduce((sum: number, p: any) => sum + (p.recaves || 0) * cave, 0)) : 0;
    return nbPlayers * cave + recaveAmount;
  }

  calculateAverageStack(): number {
    if (!this.tournament) return 0;
    const joueursEnJeu = (this.tournament.players ?? []).filter((p: any) => !p.is_out).length;
    const stack = this.tournament.stack_initial ?? 0;
    const recaves = (this.tournament.players ?? []).reduce((acc: any, p: { recaves: any; }) => acc + (p.recaves ?? 0), 0);
    if (!joueursEnJeu) return 0;
    return Math.floor(((this.tournament.players.length + recaves) * stack) / joueursEnJeu);
  }

  // Classement (par ordre d’élimination, 1er = last in)
  getLeaderboard() {
    if (!this.tournament?.players) return;
    // Le dernier survivant (pas is_out) est le 1er, puis le reste par ordre d’out
    let players = [...this.tournament.players];
    const stillIn = players.filter(p => !p.is_out);
    const out = players.filter(p => p.is_out)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    this.leaderboard = [...stillIn, ...out];
    // Rang joueur
    const index = this.leaderboard.findIndex(p => p.id === this.player.id);
    this.rank = index >= 0 ? index + 1 : 0;
  }

  // Helpers d’affichage pour structure poker
  handRanks = [
    { name: 'Quinte Flush Royale', short: 'Royal Flush', power: 10, desc: 'A-K-Q-J-10 même couleur' },
    { name: 'Quinte Flush', short: 'Straight Flush', power: 9, desc: '5 cartes qui se suivent même couleur' },
    { name: 'Carré', short: 'Four of a Kind', power: 8, desc: '4 cartes identiques' },
    { name: 'Full', short: 'Full House', power: 7, desc: 'Brelan + Paire' },
    { name: 'Couleur', short: 'Flush', power: 6, desc: '5 cartes même couleur' },
    { name: 'Suite', short: 'Straight', power: 5, desc: '5 cartes qui se suivent' },
    { name: 'Brelan', short: 'Three of a Kind', power: 4, desc: '3 cartes identiques' },
    { name: 'Double Paire', short: 'Two Pair', power: 3, desc: '2 paires différentes' },
    { name: 'Paire', short: 'One Pair', power: 2, desc: '2 cartes identiques' },
    { name: 'Hauteur', short: 'High Card', power: 1, desc: 'La carte la plus haute' },
  ];
}
