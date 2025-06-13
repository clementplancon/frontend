// services/websocket.service.ts
import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WebsocketService {
  private socket: Socket | null = null;

  connect(type: 'admin' | 'player' | 'screen', code: string): void {
    if (!this.socket) {
      this.socket = io('http://localhost:3000', { transports: ['websocket'] });
      this.socket.emit('joinTournamentRoom', { code, type });
    }
  }
  insertPlayer(code: string, pseudo: string): void {
    if (!this.socket) return;
    this.socket.emit('playerJoin', { code, pseudo });
  }

  on<T>(event: string): Observable<T> {
    return new Observable(sub => {
      if (!this.socket) return;
      this.socket.on(event, (data: T) => sub.next(data));
    });
  }
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
