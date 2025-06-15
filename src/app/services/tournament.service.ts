import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TournamentService {
  private readonly api = environment.apiUrl + "/tournaments"; // adapter si besoin (préfixe api...)

  constructor(private http: HttpClient) {}

  createTournament(dto: any): Observable<any> {
    return this.http.post(this.api, dto);
  }

  getTournament(code: string, token: string): Observable<any> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
    return this.http.get(`${this.api}/${code}`, { headers });
  }

  updateTournament(code: string, dto: any, token: string): Observable<any> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
    return this.http.patch(`${this.api}/${code}`, dto, { headers });
  }

  removePlayer(code: string, playerId: number, token: string) {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.delete(`${this.api}/${code}/player/${playerId}`, { headers });
  }

  startTournament(code: string, token: string): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.api}/${code}/start`, {}, { headers });
  }

  pauseTournament(code: string, token: string): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.api}/${code}/pause`, {}, { headers });
  }

  resumeTournament(code: string, token: string): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.api}/${code}/resume`, {}, { headers });
  }

  nextLevel(code: string, token: string): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.api}/${code}/next-level`, {}, { headers });
  }

  resetClock(code: string, token: string): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.api}/${code}/reset-clock`, {}, { headers });
  }

  assignSeats(code: string, token: string) {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.api}/${code}/assign-seats`, {}, { headers });
  }

  eliminatePlayer(code: string, dto: any, token: string): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.api}/${code}/eliminate`, dto, { headers });
  }

  closeTableAndRedistribute(code: string, dto: any, token: string): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.api}/${code}/close-table`, dto, { headers });
  }

  fullRedistribute(code: string, dto: any, token: string): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.api}/${code}/full-redistribute`, dto, { headers });
  }

  finalRedistribute(code: string, dto: any, token: string): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.api}/${code}/final-redistribute`, dto, { headers });
  }

  seatChange(code: string, dto: any, token: string): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.api}/${code}/seat-change`, dto, { headers });
  }
}
