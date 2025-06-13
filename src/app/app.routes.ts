import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { TournamentForm } from './pages/tournament-form/tournament-form';
import { Room } from './pages/room/room';
import { AdminBoard } from './pages/admin-board/admin-board';
import { Screen } from './pages/screen/screen';

export const routes: Routes = [
    { path: '', component: Home },
    { path: 'tournament/new', component: TournamentForm },
    { path: 'tournament/:code/edit', component: TournamentForm },
    { path: 'room/:code', component: Room },
    { path: 'admin/:code', component: AdminBoard },
    { path: 'screen/:code', component: Screen },
    { path: '**', redirectTo: '' }
];
