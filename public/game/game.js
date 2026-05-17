/* Ancient Echoes — Phaser 3 + Facebook Instant Games bootstrap */

/* ---- Lovable backend (Ancient Echoes app) ---- */
const APP_BASE_URL = "https://ancient-echoes-api.lovable.app";
const PERSONAS_ENDPOINT = APP_BASE_URL + "/api/public/hooks/game-personas?limit=12";

let player;
let cursors;
let personas = []; // fetched from Lovable app

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

  // Load persona portraits fetched from the Lovable app
  personas.forEach((p, i) => {
    if (p.image_url) this.load.image("persona_" + i, p.image_url);
  });
}

function create() {
  this.add.image(400, 300, "bg");

  // Render persona names + portraits along the top
  personas.slice(0, 6).forEach((p, i) => {
    const x = 80 + i * 120;
    if (this.textures.exists("persona_" + i)) {
      const img = this.add.image(x, 70, "persona_" + i);
      img.setDisplaySize(80, 80);
    }
    this.add
      .text(x, 120, p.name || "?", {
        fontSize: "12px",
        color: "#ffd166",
        align: "center",
      })
      .setOrigin(0.5);
  });

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

/* Fetch personas from Lovable app, then boot Phaser */
async function loadPersonasThenStart() {
  try {
    const res = await fetch(PERSONAS_ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      personas = Array.isArray(data.personas) ? data.personas : [];
      console.log("Loaded " + personas.length + " personas from Lovable app");
    } else {
      console.warn("Persona endpoint returned", res.status);
    }
  } catch (err) {
    console.error("Failed to fetch personas:", err);
  }
  startGame();
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
          loadPersonasThenStart();
        }
      }, 100);
    })
    .catch((err) => {
      console.error("FBInstant init failed, starting standalone:", err);
      loadPersonasThenStart();
    });
} else {
  // Running outside Facebook (local / web) — just start
  loadPersonasThenStart();
}