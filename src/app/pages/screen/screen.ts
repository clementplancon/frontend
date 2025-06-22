import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { WebsocketService } from '../../services/websocket.service';
import { Subscription, interval } from 'rxjs';
import { CommonModule } from '@angular/common';
import { SoundService } from '../../services/sound.service';

@Component({
  selector: 'app-screen',
  templateUrl: './screen.html',
  styleUrl: './screen.scss',
  standalone: true,
  imports: [CommonModule]
})
export class Screen implements OnInit, OnDestroy {
  ws = inject(WebsocketService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  sound = inject(SoundService);

  code = '';
  tournament: any = null;
  players: any[] = [];
  timerSub: Subscription | null = null;
  wsSub: Subscription | null = null;

  // Timer & affichage blindes
  timerDisplay = '--:--';
  timerPerc = 0;
  currentLevel: any = null;
  nextLevel: any = null;

  tableChangeMsg: string = '';
  redistributionMsg: string = '';
  redistributionTimeout: any = null;

  eliminatedMsg: string = '';
  eliminatedTimeout: any = null;

  ngOnInit() {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    this.ws.connect('screen', this.code);

    this.wsSub = this.ws.on<any>('tournamentStateUpdated').subscribe(data => {
      this.tournament = data;
      this.players = data.players ?? [];
      this.updateClockInfos();
    });

    this.ws.on<any>('tableRedistributed').subscribe(ev => {
      this.showRedistributionMsg(`La table #${ev.table} a été dispatchée. Vérifiez votre nouvel emplacement.`);
    });

    this.ws.on<any>('finalTableRedistributed').subscribe(ev => {
      this.showRedistributionMsg(`Table finale ! Tous les sièges ont été réattribués. Vérifiez votre nouvelle place.`);
    });

    this.ws.on<any>('playerTableChange').subscribe(ev => {
      this.showTableChangeMsg(`${ev.pseudo} doit se rendre à la table #${ev.table} siège #${ev.siege}`);
    });

    this.ws.on<any>('blindsUp').subscribe(level => {
      this.sound.play('blinds-up');
    });

    this.ws.on<any>('playerEliminated').subscribe(ev => {
      this.sound.play('eliminated');
      // Affiche l'alerte "X est éliminé"
      if (ev?.pseudo) {
        this.showEliminatedMsg(`${ev.pseudo} a été éliminé !`);
      }
    });

    this.timerSub = interval(500).subscribe(() => this.updateClockInfos());
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
    this.timerSub?.unsubscribe();
    this.ws.disconnect();
    if (this.redistributionTimeout) clearTimeout(this.redistributionTimeout);
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

  showTableChangeMsg(msg: string) {
    this.tableChangeMsg = msg;
    setTimeout(() => this.tableChangeMsg = '', 7000);
  }
  showRedistributionMsg(msg: string) {
    this.redistributionMsg = msg;
    if (this.redistributionTimeout) clearTimeout(this.redistributionTimeout);
    this.redistributionTimeout = setTimeout(() => this.redistributionMsg = '', 9000);
  }
  showEliminatedMsg(msg: string) {
    this.eliminatedMsg = msg;
    if (this.eliminatedTimeout) clearTimeout(this.eliminatedTimeout);
    this.eliminatedTimeout = setTimeout(() => this.eliminatedMsg = '', 7000);
  }

  // Helpers
  playersByTable() {
    if (!this.tournament?.tables) return [];
    return this.tournament.tables.map((t: any) => ({
      ...t,
      players: t.players
        .filter((p: any) => !p.is_out)
        .sort((a: any, b: any) => (a.siege ?? 99) - (b.siege ?? 99))
    }));
  }
  stackMoyen() {
    if (!this.tournament) return 0;
    const joueursEnJeu = (this.tournament.players ?? []).filter((p: any) => !p.is_out).length;
    const stack = this.tournament.stack_initial ?? 0;
    const recaves = (this.tournament.players ?? []).reduce((acc: any, p: { recaves: any; }) => acc + (p.recaves ?? 0), 0);
    if (!joueursEnJeu) return 0;
    return Math.floor(((this.tournament.players.length + recaves) * stack) / joueursEnJeu);
  }
  joueursRestants() {
    return (this.tournament.players ?? []).filter((p: any) => !p.is_out).length;
  }
  cashPrize() {
    const cave = this.tournament.valeur_cave ?? 0;
    const recaves = (this.tournament.players ?? []).reduce((acc: any, p: { recaves: any; }) => acc + (p.recaves ?? 0), 0);
    return (this.tournament.players?.length ?? 0) * cave + recaves * cave;
  }
  joueursNonRepartis() {
    return (this.tournament.players ?? []).filter((p: any) => !p.is_out && (!p.tableId || !p.siege));
  }
  tousRepartis() {
    return this.joueursNonRepartis().length === 0;
  }
  isTournoiFini() {
    return this.tournament?.etat === 'finished';
  }
  classement() {
    // Joueurs non éliminés d’abord, puis par updated_at desc pour les autres
    const ps = [...(this.tournament?.players ?? [])];
    const stillIn = ps.filter(p => !p.is_out);
    const out = ps.filter(p => p.is_out).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return [...stillIn, ...out];
  }

  getGridVarsTables() {
    const nbTables = this.playersByTable().length;
    const fitCols = Math.ceil(Math.sqrt(nbTables));
    const fitRows = Math.ceil(nbTables / fitCols);
    const fontSize = `clamp(1vw, ${6 / fitRows}vw, 2.5vw)`;
    return {
      '--fit-rows': fitRows,
      '--fit-cols': fitCols,
      '--cell-font': fontSize
    };
  }
  getGridVarsLeaderboard() {
    const nbPlayers = this.classement().length;
    // On veut max 8 lignes visibles, sinon plus petit
    const fitRows = Math.min(nbPlayers, 8);
    const fitCols = Math.ceil(nbPlayers / fitRows);
    const fontSize = `clamp(1vw, ${7 / fitRows}vw, 2.5vw)`;
    return {
      '--fit-rows': fitRows,
      '--fit-cols': fitCols,
      '--cell-font': fontSize
    };
  }
  getGridVarsSeats(nbSeats: number) {
    // Pour chaque table : afficher tous les sièges sur 1 colonne, réduire si trop de joueurs
    const fitRows = nbSeats;
    const fontSize = `clamp(0.8vw, ${4.5 / fitRows}vw, 2vw)`;
    return {
      '--fit-rows': fitRows,
      '--cell-font': fontSize
    };
  }
}
