/* Ancient Echoes — Phaser 3 + Facebook Instant Games bootstrap */

let player;
let cursors;

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "game-container",
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scene: { preload, create, update },
};

function preload() {
  this.load.image("bg", "https://labs.phaser.io/assets/skies/space3.png");
  this.load.image("player", "https://labs.phaser.io/assets/sprites/phaser-dude.png");
}

function create() {
  this.add.image(400, 300, "bg");
  player = this.physics.add.sprite(400, 300, "player");
  player.setCollideWorldBounds(true);
  cursors = this.input.keyboard.createCursorKeys();

  // Notify FB Instant Games that gameplay has started
  if (window.FBInstant && FBInstant.startGameAsync) {
    FBInstant.startGameAsync().catch(() => {});
  }
}

function update() {
  if (!player) return;
  player.setVelocity(0);
  const speed = 200;
  if (cursors.left.isDown) player.setVelocityX(-speed);
  if (cursors.right.isDown) player.setVelocityX(speed);
  if (cursors.up.isDown) player.setVelocityY(-speed);
  if (cursors.down.isDown) player.setVelocityY(speed);
}

/* ------------------------------------------------------------------ */
/* Facebook Instant Games SDK bootstrap                                */
/* ------------------------------------------------------------------ */
function startGame() {
  new Phaser.Game(config);
}

if (window.FBInstant) {
  FBInstant.initializeAsync()
    .then(() => {
      // Fake loading progress (replace with real asset loader if needed)
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        FBInstant.setLoadingProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          startGame();
        }
      }, 100);
    })
    .catch((err) => {
      console.error("FBInstant init failed, starting standalone:", err);
      startGame();
    });
} else {
  // Running outside Facebook (local / web) — just start
  startGame();
}