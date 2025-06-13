import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [FormsModule, RouterModule],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  code = '';
  playerCode = '';
  playerName = '';

  constructor(private router: Router) {}

  onJoinTournament() {
    if (this.code) {
      this.router.navigate(['/tournament', this.code, 'edit']);
    }
  }

  onJoinAsPlayer() {
    if (this.playerCode && this.playerName) {
      // Naviguer vers la room joueur, à toi d’ajuster le routing cible !
      // Par exemple : /tournament/:code/join?name=:playerName
      this.router.navigate(['/room', this.playerCode], { queryParams: { name: this.playerName } });
    }
  }
}
