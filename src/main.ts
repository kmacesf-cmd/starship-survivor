import Phaser from 'phaser';
import './style.css';
import { GAME_HEIGHT, GAME_WIDTH } from './config/GameConfig';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { UIScene } from './scenes/UIScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#d8b676',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  fps: {
    target: 60,
    smoothStep: true,
  },
  render: {
    antialias: true,
    powerPreference: 'high-performance',
  },
  input: {
    activePointers: 3,
    keyboard: true,
  },
  disableContextMenu: true,
  scene: [BootScene, MenuScene, GameScene, UIScene],
});

if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

window.addEventListener('beforeunload', () => game.destroy(true));

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
