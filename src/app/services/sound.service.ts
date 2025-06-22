import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SoundService {
  play(sound: 'blinds-up' | 'eliminated') {
    let path = '';
    switch (sound) {
      case 'blinds-up': path = 'assets/blinds-up.mp3'; break;
      case 'eliminated': path = 'assets/eliminated.mp3'; break;
    }
    const audio = new Audio(path);
    audio.play();
  }
}
