import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TournamentService } from '../../services/tournament.service';
import { WebsocketService } from '../../services/websocket.service';
import { Subscription, interval } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-admin-board',
  templateUrl: './admin-board.html',
  styleUrl: './admin-board.scss',
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class AdminBoard implements OnInit, OnDestroy {
  route = inject(ActivatedRoute);
  router = inject(Router);
  ws = inject(WebsocketService);
  tournamentService = inject(TournamentService);

  code = '';
  adminToken = '';
  tournament: any = null;
  wsSub: Subscription | null = null;
  timerSub: Subscription | null = null;
  rebalancing: any = null;
  leaderboard: any[] = [];
  loading = false;

  clockInfo: { level: any, elapsed: number, remaining: number } | null = null;
  seatChangeData: { player: any, fromTableId: number } | null = null;
  fullRedistributeMapping: { [playerId: number]: number } = {};
  confirmDialog: { message: string; confirm: () => void } | null = null;

  ngOnInit() {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    this.adminToken = localStorage.getItem(`adminToken:${this.code}`) ?? '';

    if (!this.adminToken) {
      alert('Token admin manquant');
      this.router.navigate(['/']);
      return;
    }

    this.tournamentService.getTournament(this.code, this.adminToken).subscribe({
      next: (data) => {
        this.tournament = data;
        this.updateClockInfo();
      }
    });

    this.ws.connect('admin', this.code);
    this.wsSub = this.ws.on<any>('tournamentStateUpdated').subscribe((data) => {
      this.tournament = data;
      this.updateClockInfo();
    });
    this.ws.on<any>('rebalancingNeeded').subscribe(ev => { this.rebalancing = ev; });
    this.ws.on<any>('leaderboardUpdated').subscribe(ev => { this.leaderboard = ev; });

    // Timer local (pour affichage, pas autorité)
    this.timerSub = interval(1000).subscribe(() => this.updateClockInfo());
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
    this.timerSub?.unsubscribe();
    this.ws.disconnect();
  }

  // --------- Méthodes clock ---------
  updateClockInfo() {
    if (!this.tournament?.clock || !this.tournament?.blind_levels) {
      this.clockInfo = null;
      return;
    }
    const clock = this.tournament.clock;
    const levels = this.tournament.blind_levels;
    const level = levels[clock.currentLevel];
    if (!level) {
      this.clockInfo = null;
      return;
    }
    const now = new Date();
    let elapsed = clock.elapsed;
    // AJOUT : ne compte que si pas en pause
    if (!clock.paused && this.tournament.etat === 'en_cours') {
      elapsed += Math.floor((now.getTime() - new Date(clock.levelStartAt).getTime()) / 1000);
    }
    // Sinon, le timer reste figé à clock.elapsed
    const remaining = Math.max(level.duree - elapsed, 0);
    this.clockInfo = { level, elapsed, remaining };
  }

  getTableById(id: number) {
    return this.tournament?.tables?.find((t: any) => t.id === id);
  }

  // --------- Actions admin ---------
  startTournament() { this.toggleLoading(this.tournamentService.startTournament(this.code, this.adminToken)); }
  pauseTournament() { this.toggleLoading(this.tournamentService.pauseTournament(this.code, this.adminToken)); }
  resumeTournament() { this.toggleLoading(this.tournamentService.resumeTournament(this.code, this.adminToken)); }
  nextLevel() { this.toggleLoading(this.tournamentService.nextLevel(this.code, this.adminToken)); }
  resetClock() {
    this.openConfirmDialog(
      "Réinitialiser le timer du tournoi ? Cette action ne peut pas être annulée.",
      () => this.toggleLoading(this.tournamentService.resetClock(this.code, this.adminToken))
    );
  }
  assignSeats() {
    this.loading = true;
    this.tournamentService.assignSeats(this.code, this.adminToken)
      .subscribe({
        next: () => this.loading = false,
        error: () => {
          this.loading = false;
          alert('Erreur lors de la répartition des joueurs.');
        }
      });
  }

  toggleLoading(obs: any) {
    this.loading = true;
    obs.subscribe({ complete: () => this.loading = false });
  }
  openSeatChange(table: any, player: any) {
    this.seatChangeData = { player, fromTableId: table.id };
  }
  
  hasFreeSeat(table: any): boolean {
    return this.freeSeatsCount(table) > 0;
  }
  freeSeatsCount(table: any): number {
    if (!table || !table.players) return 0;
    const occupied = new Set(table.players.map((p: any) => p.siege));
    const max = table.tournament?.joueurs_par_table ?? this.tournament.joueurs_par_table;
    let count = 0;
    for (let i = 1; i <= max; i++) if (!occupied.has(i)) count++;
    return count;
  }
  
  // Réassigner joueur à une nouvelle table (siège aléatoire)
  seatChange(player: any, toTable: any) {
    if (!toTable || !player) return;
    this.openConfirmDialog(
      `Confirmer le changement de table du joueur "${player.pseudo}" vers la table #${toTable.numero} ?`,
      () => {
        this.loading = true;
        this.tournamentService.seatChange(this.code, {
          fromTableId: player.tableId,
          toTableId: toTable.id,
          playerId: player.id
        }, this.adminToken).subscribe({
          complete: () => {
            this.loading = false;
            this.seatChangeData = null;
            this.rebalancing = null;
          }
        });
      }
    );
  }
  
  // Recave/Éliminer un joueur
  eliminatePlayer(player: any, recave: boolean) {
    this.openConfirmDialog(
      recave
        ? `Confirmer la recave du joueur "${player.pseudo}" ?`
        : `Confirmer l'élimination du joueur "${player.pseudo}" ?`,
      () => {
        this.loading = true;
        this.tournamentService.eliminatePlayer(this.code, {
          playerId: player.id,
          recave
        }, this.adminToken).subscribe({
          complete: () => this.loading = false
        });
      }
    );
  }
  
  // Vérifie si recave autorisé
  isRecavable(player: any): boolean {
    if (!this.tournament) return false;
    const level = this.tournament.clock?.currentLevel ?? 0;
    if (this.tournament.recave_max && player.recaves >= this.tournament.recave_max) return false;
    if (this.tournament.niveau_recave_max && level > this.tournament.niveau_recave_max) return false;
    return !player.is_out;
  }

  getPlayerPseudo(playerId: number): string {
    const player = this.tournament?.players?.find((p: any) => p.id === playerId);
    return player?.pseudo ?? playerId;
  }
  
  // Contrôle que chaque table n’accueille pas plus que freeSeats
  tableFull(table: any): boolean {
    const count = Object.values(this.fullRedistributeMapping).filter(id => id === table.id).length;
    return count >= table.freeSeats;
  }
  
  confirmFullRedistribute() {
    this.loading = true;
    // Compose le mapping
    const moves = Object.entries(this.fullRedistributeMapping)
      .map(([playerId, toTableId]) => ({ playerId: Number(playerId), toTableId: Number(toTableId) }));
    this.tournamentService.closeTableAndRedistribute(this.code, {
      fromTableId: this.rebalancing.fromTable,
      mapping: moves
    }, this.adminToken).subscribe({
      next: () => {
        this.loading = false;
        this.rebalancing = null;
        this.fullRedistributeMapping = {};
      },
      error: () => this.loading = false
    });
  }

  fullRedistribute() {
    this.loading = true;
    this.tournamentService.fullRedistribute(this.code, {
      fromTableId: this.rebalancing.fromTable
    }, this.adminToken).subscribe({
      next: () => {
        this.loading = false;
        this.rebalancing = null;
      },
      error: () => this.loading = false
    });
  }

  fullFinalRedistribute() {
    this.loading = true;
    this.tournamentService.finalRedistribute(this.code, {
      toTableId: this.rebalancing.targetTable
    }, this.adminToken).subscribe({
      next: () => {
        this.loading = false;
        this.rebalancing = null;
      },
      error: () => this.loading = false
    });
  }

  openConfirmDialog(message: string, onConfirm: () => void) {
    this.confirmDialog = { message, confirm: () => { onConfirm(); this.closeConfirmDialog(); } };
  }
  closeConfirmDialog() {
    this.confirmDialog = null;
  }
  
}
