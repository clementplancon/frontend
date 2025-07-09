import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Form, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TournamentService } from '../../services/tournament.service';
import { WebsocketService } from '../../services/websocket.service';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tournament-form',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './tournament-form.html',
  styleUrl: './tournament-form.scss'
})
export class TournamentForm implements OnInit, OnDestroy {
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);
  tournamentService = inject(TournamentService);
  ws = inject(WebsocketService);

  form: FormGroup;
  isEditMode = false;
  code: string | null = null;
  adminToken: string | null = null;
  loading = false;

  // Liste des joueurs pour la config (mise à jour live)
  players: any[] = [];
  wsSub: Subscription | null = null;

  constructor() {
    // Form init inchangée...
    this.form = this.fb.group({
      nom: ['', Validators.required],
      stack_initial: [20000, Validators.required],
      valeur_cave: [50, Validators.required],
      nb_tables: [4, Validators.required],
      joueurs_par_table: [8, Validators.required],
      recave_max: [2],
      niveau_recave_max: [6],
      jetons: this.fb.array([
        this.createJetonGroup('#808080', 50),
        this.createJetonGroup('#ff0000', 100)
      ]),
      blindes: this.fb.array([
        this.createBlindeGroup(undefined, 1, 50, 100, 720, false),
        this.createPauseGroup(undefined, 2, 300)
      ])
    });
  }

  ngOnInit() {
    this.code = this.route.snapshot.paramMap.get('code');
    this.isEditMode = !!this.code;

    if (this.isEditMode && this.code) {
      this.adminToken = localStorage.getItem(`adminToken:${this.code}`);
      if (!this.adminToken) {
        alert('Token admin manquant.');
        this.router.navigate(['/']);
        return;
      }
      this.loading = true;
      this.tournamentService.getTournament(this.code, this.adminToken).subscribe({
        next: (data) => {
          this.loading = false;
          this.patchForm(data);
          this.players = (data.players ?? []).filter((p: any) => !p.is_out); // affichage des joueurs
        },
        error: () => {
          this.loading = false;
          alert('Erreur lors du chargement du tournoi');
          this.router.navigate(['/']);
        }
      });

      // WS : abonne la page aux updates du tournoi (pour refresh joueurs en direct)
      this.ws.connect('admin', this.code);
      this.wsSub = this.ws.on<any>('tournamentStateUpdated').subscribe((data) => {
        // On ne repatch pas le form pour éviter d’écraser les modifs courantes
        this.players = (data.players ?? []).filter((p: any) => !p.is_out);
      });
    }
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
    this.ws.disconnect();
  }

  removePlayer(player: any) {
    if (!this.code || !this.adminToken) return;
    if (!confirm(`Supprimer ${player.pseudo} (${player.nom}) du tournoi ?`)) return;
    this.loading = true;
    this.tournamentService.removePlayer(this.code, player.id, this.adminToken)
      .subscribe({ complete: () => this.loading = false });
  }

  goToAdminBoard() {
    if (this.code) {
      this.router.navigate(['/admin', this.code]);
    }
  }

  // Helpers FormArray Jetons
  get jetons() {
    return this.form.get('jetons') as FormArray;
  }
  createJetonGroup(couleur = '#808080', valeur = 0, label = ''): FormGroup {
    return this.fb.group({
      couleur: [couleur, Validators.required],
      valeur: [valeur, Validators.required],
      label: [label]
    });
  }
  addJeton() {
    this.jetons.push(this.createJetonGroup());
  }
  removeJeton(index: number) {
    if (this.jetons.length > 1) this.jetons.removeAt(index);
  }

  // Helpers FormArray Blindes
  get blindes() {
    return this.form.get('blindes') as FormArray;
  }
  createBlindeGroup(id: number | undefined, niveau = 1, sb = 100, bb = 200, duree = 600, is_pause = false, ante?: number): FormGroup {
    return this.fb.group({
      id: [id],
      niveau: [niveau, Validators.required],
      sb: [is_pause ? null : sb],
      bb: [is_pause ? null : bb],
      ante: [is_pause ? null : ante],
      duree: [duree, Validators.required],
      is_pause: [is_pause]
    });
  }
  createPauseGroup(id:  number | undefined, niveau = 2, duree = 300): FormGroup {
    return this.createBlindeGroup(id, niveau, undefined, undefined, duree, true);
  }
  addBlinde() {
    const niveau = this.blindes.length + 1;
    this.blindes.push(this.createBlindeGroup(niveau));
  }
  addPause() {
    const niveau = this.blindes.length + 1;
    this.blindes.push(this.createPauseGroup(niveau));
  }
  removeBlinde(index: number) {
    if (this.blindes.length > 1) this.blindes.removeAt(index);
  }

  patchForm(data: any) {
    console.log('Patching form with data:', data);
    // Patch les champs simples
    this.form.patchValue({
      nom: data.nom,
      stack_initial: data.stack_initial,
      valeur_cave: data.valeur_cave,
      nb_tables: data.nb_tables,
      joueurs_par_table: data.joueurs_par_table,
      recave_max: data.recave_max,
      niveau_recave_max: data.niveau_recave_max
    });
    // Patch les jetons
    this.jetons.clear();
    if (data.jetons && data.jetons.length) {
      data.jetons.forEach((jeton: any) => this.jetons.push(this.createJetonGroup(jeton.couleur, jeton.valeur, jeton.label)));
    }
    // Patch les blindes
    this.blindes.clear();
    if (data.blind_levels && data.blind_levels.length) {
      data.blind_levels.forEach((b: any) => {
        console.log('Processing blinde:', b);
        if (b.is_pause) {
          this.blindes.push(this.createPauseGroup(b.id, b.niveau, b.duree));
        } else {
          this.blindes.push(this.createBlindeGroup(b.id, b.niveau, b.sb, b.bb, b.duree, false, b.ante));
        }
      });
    }
  }

  onSubmit() {
    this.form.markAllAsTouched();
    console.log('Form submitted with value:', this.form.value);
    console.log('Valide ? :', this.form.valid);
    if (this.form.invalid) return;
    this.loading = true;

    const value = {
      ...this.form.value,
      jetons: this.jetons.value,
      blind_levels: this.blindes.value
    };

    if (this.isEditMode && this.code) {
      this.tournamentService.updateTournament(this.code, value, this.adminToken!)
        .subscribe({
          next: () => {
            this.loading = false;
            alert('Tournoi modifié !');
          },
          error: () => {
            this.loading = false;
            alert('Erreur lors de la modification');
          }
        });
    } else {
      this.tournamentService.createTournament(value).subscribe({
        next: (res) => {
          this.loading = false;
          localStorage.setItem(`adminToken:${res.code}`, res.adminToken);
          this.router.navigate(['/tournament', res.code, 'edit']);
        },
        error: () => {
          this.loading = false;
          alert('Erreur lors de la création du tournoi');
        }
      });
    }
  }
}
