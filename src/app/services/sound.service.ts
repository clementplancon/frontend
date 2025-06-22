import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SoundService {
  play(sound: 'blinds-up' | 'eliminated') {
    let path = '';
    switch (sound) {
      case 'blinds-up': path = 'assets/sounds/blinds-up.mp3'; break;
      case 'eliminated': path = 'assets/sounds/eliminated.mp3'; break;
    }
    const audio = new Audio(path);
    audio.play();
  }
}
