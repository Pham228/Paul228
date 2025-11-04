/* Space Invaders — vanilla JS canvas
 * Player helmet with eyes, skull enemies (cached sprites), speech bubbles that alternate & fade,
 * bombs, shields, levels, score, lives, high score (localStorage), pause/mute/reset,
 * keyboard + touch controls, simple WebAudio bleeps, pixelated backdrop.
 */

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W = canvas.width, H = canvas.height;

  // === Pixelated backdrop ===
  const bgImg = new Image();
  bgImg.src = "images/malevalon creek2.jpg";   // <-- your file path
  let bgReady = false;
  bgImg.onload = () => { bgReady = true; rebuildPixelBG(true); };

  // Pixelation settings: bigger = chunkier pixels (try 5–12)
  let PIXEL_SIZE = 8;

  // Offscreen background buffer (downscaled once per size change)
  const bgSmall = document.createElement("canvas");
  const bgSmallCtx = bgSmall.getContext("2d");

  function rebuildPixelBG(force = false) {
    if (!bgReady) return;
    const sW = Math.max(1, Math.floor(W / PIXEL_SIZE));
    const sH = Math.max(1, Math.floor(H / PIXEL_SIZE));
    if (!force && bgSmall.width === sW && bgSmall.height === sH) return;

    bgSmall.width = sW;
    bgSmall.height = sH;

    // Cover crop
    const ir = bgImg.width / bgImg.height;
    const cr = W / H;
    let sx, sy, sw, sh;
    if (cr > ir) {
      sw = bgImg.width;
      sh = bgImg.width / cr;
      sx = 0;
      sy = (bgImg.height - sh) * 0.5;
    } else {
      sw = bgImg.height * cr;
      sh = bgImg.height;
      sx = (bgImg.width - sw) * 0.5;
      sy = 0;
    }

    bgSmallCtx.imageSmoothingEnabled = true;
    bgSmallCtx.clearRect(0, 0, sW, sH);
    bgSmallCtx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, sW, sH);
  }

  function drawPixelatedBackground() {
    if (!bgReady) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bgSmall, 0, 0, bgSmall.width, bgSmall.height, 0, 0, W, H);
    ctx.restore();
    return true;
  }

  // Rebuild on window resize (once)
  window.addEventListener("resize", () => {
    // If your canvas is responsive, update W/H here; otherwise remove this section.
    W = canvas.width;
    H = canvas.height;
    rebuildPixelBG(true);
  });

  // === UI elements
  const elScore = document.getElementById("score");
  const elHigh  = document.getElementById("highscore");
  const elLives = document.getElementById("lives");
  const elLevel = document.getElementById("level");
  const btnPause = document.getElementById("btn-pause");
  const btnMute  = document.getElementById("btn-mute");
  const btnReset = document.getElementById("btn-reset");
  const tLeft  = document.getElementById("t-left");
  const tRight = document.getElementById("t-right");
  const tFire  = document.getElementById("t-fire");
// === Background music (from <audio id="bg-music"> in game.html)
const bgMusic = document.getElementById("bg-music");
if (bgMusic) {
  bgMusic.loop = true;     // make sure it loops
  bgMusic.volume = 0.4;    // start at a comfortable level
  // Start muted if you prefer (uncomment):
  // bgMusic.muted = true;
}

// Unlock autoplay after first user interaction (mobile/desktop friendly)
function unlockAudio() {
  // Create or resume WebAudio for beeps
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}

  // Kick the music if present
  if (bgMusic && bgMusic.paused) {
    bgMusic.play().catch(() => {});
  }
}
document.addEventListener("pointerdown", unlockAudio, { once: true });
document.addEventListener("keydown",     unlockAudio, { once: true });

  // === Helpers
  const HS_KEY = "si_highscore_v1";
  const clamp  = (n, a, b) => Math.max(a, Math.min(b, n));
  const rand   = (a, b) => a + Math.random() * (b - a);

  // === Sounds
  let audioCtx = null;
  let muted = false;
  function beep({freq=440, type="square", dur=0.08, vol=0.03} = {}) {
    if (muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch {}
  }

  // === Input
  const keys = { left:false, right:false, fire:false };
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "ArrowLeft"  || e.code === "KeyA") keys.left  = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
    if (e.code === "Enter") keys.fire = true;
    if (e.code === "KeyP") togglePause();
    if (e.code === "KeyM") toggleMute();
    if (e.code === "KeyR") resetGame();
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft"  || e.code === "KeyA") keys.left  = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
    if (e.code === "Enter") keys.fire = false;
  });

  // Touch controls
  let touchLeft=false, touchRight=false;
  tLeft?.addEventListener("touchstart", e=>{e.preventDefault(); touchLeft=true;});
  tLeft?.addEventListener("touchend",   e=>{e.preventDefault(); touchLeft=false;});
  tRight?.addEventListener("touchstart",e=>{e.preventDefault(); touchRight=true;});
  tRight?.addEventListener("touchend",  e=>{e.preventDefault(); touchRight=false;});
  tFire?.addEventListener("touchstart", e=>{
    e.preventDefault();
    playerTryFire();
    beep({freq:700, dur:.05, vol:.025});
  });

  btnPause?.addEventListener("click", () => togglePause());
  btnMute?.addEventListener("click",  () => toggleMute());
  btnReset?.addEventListener("click", () => resetGame());

  // ==== Speech bubble helper (with alpha, cached widths) ====
  const bubbleWidthCache = new Map();
  function measureTextCached(text, font) {
    const key = font + "|" + text;
    if (bubbleWidthCache.has(key)) return bubbleWidthCache.get(key);
    ctx.save();
    ctx.font = font;
    const w = ctx.measureText(text).width;
    ctx.restore();
    bubbleWidthCache.set(key, w);
    return w;
  }

  function drawSpeechBubble(ctx, x, y, text, alpha=1) {
    ctx.save();
    const font = "bold 14px system-ui, sans-serif";
    ctx.globalAlpha = alpha;
    ctx.font = font;
    const padX = 8;
    const tw = measureTextCached(text, font);
    const w = Math.min(Math.max(tw + padX*2, 80), 260);
    const h = 28;

    ctx.fillStyle = "#111";
    roundRect(ctx, x - w/2, y - h - 8, w, h, 6); ctx.fill();
    ctx.strokeStyle = "#b9a70a";
    ctx.lineWidth = 2;
    roundRect(ctx, x - w/2, y - h - 8, w, h, 6); ctx.stroke();

    // Tail
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 8);
    ctx.lineTo(x, y + 2);
    ctx.lineTo(x + 8, y - 8);
    ctx.closePath();
    ctx.fillStyle = "#111"; ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = "#f5f5f5";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y - h/2 - 8);
    ctx.restore();
  }

  // ==== Entities base ====
  class Entity {
    constructor(x,y,w,h){ this.x=x; this.y=y; this.w=w; this.h=h; this.dead=false; }
    get rect(){ return {x:this.x, y:this.y, w:this.w, h:this.h}; }
    intersects(o){
      return !(this.x+this.w<o.x || this.x>o.x+o.w || this.y+this.h<o.y || this.y>o.y+o.h);
    }
  }

  // ==== Player (helmet, eyes) ====
  class Player extends Entity {
    constructor(){
      super(W/2 - 22, H - 84, 44, 44); // square to avoid squash
      this.speed = 280;
      this.cooldown = 0;
      this.lives = 3;
    }
    update(dt) {
      const movingLeft  = keys.left  || touchLeft;
      const movingRight = keys.right || touchRight;
      if (movingLeft) this.x -= this.speed*dt;
      if (movingRight) this.x += this.speed*dt;
      this.x = clamp(this.x, 10, W-10-this.w);

      if (this.cooldown>0) this.cooldown -= dt;
      if (keys.fire) playerTryFire();
    }
    draw() {
      ctx.save();

      // Normalize to 48×48 design space
      const N = 48;
      ctx.translate(this.x + this.w/2, this.y + this.h/2);
      ctx.scale(this.w / N, this.h / N);
      ctx.translate(-N/2, -N/2);

      // Colors
      const shell = "#2f2f2f";
      const ridge = "#3a3a3a";
      const stripe= "#b9a70a";
      const visorF= "#111";

      // Helmet shell
      ctx.fillStyle = shell;  roundRect(ctx, 4, 4, 40, 40, 6); ctx.fill();
      // Center ridge
      ctx.fillStyle = ridge;  ctx.fillRect(21, 4, 6, 40);
      // Stripes
      ctx.fillStyle = stripe; ctx.fillRect(8, 4, 5, 40); ctx.fillRect(35, 4, 5, 40);
      // Visor frame
      ctx.fillStyle = visorF; roundRect(ctx, 8, 16, 32, 16, 4); ctx.fill();
      // Visor glass
      const g = ctx.createLinearGradient(0, 16, 0, 32);
      g.addColorStop(0, "#1b1b1b"); g.addColorStop(1, "#2a2a2a");
      ctx.fillStyle = g;      roundRect(ctx, 10, 18, 28, 12, 3); ctx.fill();

      // Eyes
      const leftX = 18, rightX = 30, cy = 24, scl = 6.8;
      const drawEye = (cx, cy, s) => {
        ctx.fillStyle = "#e3e3e3";
        ctx.beginPath(); ctx.ellipse(cx, cy, s, s*0.88, 0, 0, Math.PI*2); ctx.fill();
        const irisR = s*0.62;
        const irisGrad = ctx.createRadialGradient(cx, cy, irisR*0.2, cx, cy, irisR);
        irisGrad.addColorStop(0, "#6e6a64");
        irisGrad.addColorStop(1, "#3c3a36");
        ctx.fillStyle = irisGrad;
        ctx.beginPath(); ctx.arc(cx, cy, irisR, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "#121212";
        ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(cx, cy, irisR, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = "#0b0b0b";
        ctx.beginPath(); ctx.arc(cx, cy, irisR*0.45, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath(); ctx.arc(cx - irisR*0.25, cy - irisR*0.25, irisR*0.14, 0, Math.PI*2); ctx.fill();
      };
      drawEye(leftX,  cy, scl);
      drawEye(rightX, cy, scl);

      // Lower vents
      ctx.fillStyle = ridge;
      roundRect(ctx, 6, 34, 10, 8, 2); ctx.fill();
      roundRect(ctx, 32, 34, 10, 8, 2); ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(7 + i*2.5, 36, 1.5, 4.5);
        ctx.fillRect(33 + i*2.5, 36, 1.5, 4.5);
      }

      ctx.restore();
    }
  }

  class Bullet extends Entity {
    constructor(x,y,vy=-520){
      super(x-2, y, 4, 12);
      this.vy = vy;
    }
    update(dt){
      this.y += this.vy*dt;
      if (this.y < -20 || this.y > H+20) this.dead = true;
    }
    draw(){
      ctx.fillStyle = "#00ecfdff";
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }
  }

  class Bomb extends Entity {
    constructor(x,y){
      super(x-3,y,6,10);
      this.vy = rand(140, 220);
    }
    update(dt){
      this.y += this.vy*dt;
      if (this.y > H+20) this.dead = true;
    }
    draw(){
      ctx.fillStyle = "#ff0e0eff";
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }
  }

  // ==== Enemy (skull) as cached sprites ====

  // Build two offscreen sprites (frame 0 / frame 1) once.
  const ENEMY_BASE_W = 30, ENEMY_BASE_H = 26; // slightly taller than 22
  const enemySprites = [makeEnemySprite(0), makeEnemySprite(1)];

  function makeEnemySprite(frame) {
    const sW = ENEMY_BASE_W * 2; // render at 2x for nicer scaling
    const sH = ENEMY_BASE_H * 2;
    const c = document.createElement("canvas");
    c.width = sW; c.height = sH;
    const g = c.getContext("2d");

    // draw centered in this offscreen
    g.translate(sW / 2, sH / 2);

    const s = Math.min(ENEMY_BASE_W, ENEMY_BASE_H) * 2;
    const bone = "#d7d1c2";
    const rim  = "#7a7263";
    const metal= "#2a2a2a";
    const glowMid = "rgba(255,40,40,0.75)";
    const glowHot = "rgba(255,85,85,0.95)";
    const f = frame ? 1 : 0;

    // Cranium
    g.fillStyle = bone;
    g.strokeStyle = rim;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-0.34 * s, -0.30 * s);
    g.quadraticCurveTo(-0.40 * s, -0.52 * s, 0, -0.52 * s);
    g.quadraticCurveTo( 0.40 * s, -0.52 * s, 0.34 * s, -0.30 * s);
    g.lineTo( 0.28 * s, -0.02 * s);
    g.lineTo( 0.18 * s,  0.02 * s);
    g.lineTo( 0.10 * s,  0.08 * s);
    g.lineTo(-0.10 * s,  0.08 * s);
    g.lineTo(-0.18 * s,  0.02 * s);
    g.lineTo(-0.28 * s, -0.02 * s);
    g.closePath();
    g.fill();
    g.stroke();

    // Eyes
    const ex = 0.18 * s, ey = -0.10 * s;
    const rBase = 0.125 * s;
    const rPulse = rBase + (f ? 0.018 * s : 0);

    g.fillStyle = "#1b1b1b";
    g.beginPath(); g.arc(-ex, ey, rBase * 0.95, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc( ex, ey, rBase * 0.95, 0, Math.PI * 2); g.fill();

    g.save();
    g.globalCompositeOperation = "lighter";
    g.shadowColor = glowMid;
    g.shadowBlur = 14 + 10 * f;

    g.fillStyle = glowMid;
    g.beginPath(); g.arc(-ex, ey, rPulse, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc( ex, ey, rPulse, 0, Math.PI * 2); g.fill();

    g.shadowBlur = 0;
    g.fillStyle = glowHot;
    g.beginPath(); g.arc(-ex, ey, rPulse * 0.55, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc( ex, ey, rPulse * 0.55, 0, Math.PI * 2); g.fill();
    g.restore();

    // Mech jaw
    g.fillStyle = metal;
    g.beginPath();
    g.moveTo(-0.12 * s, 0.08 * s);
    g.lineTo( 0.12 * s, 0.08 * s);
    g.lineTo( 0.06 * s, 0.30 * s);
    g.lineTo(-0.06 * s, 0.30 * s);
    g.closePath();
    g.fill();

    g.strokeStyle = "#681212ff";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-0.10 * s, 0.10 * s);
    g.lineTo( 0.10 * s, 0.10 * s);
    g.stroke();

    g.fillStyle = "#8e1313ff";
    const ventW = 0.01 * s, ventH = 0.10 * s;
    for (let i = -2; i <= 2; i++) {
      g.fillRect(i * 0.03 * s - ventW / 2, 0.14 * s, ventW, ventH);
    }

    return c;
  }

  class Enemy extends Entity {
    constructor(x,y,type=0){
      super(x,y, ENEMY_BASE_W, ENEMY_BASE_H);
      this.type = type;
      this.frame = 0; // toggled by fleet timer
    }
    draw(){
      // Bob a single pixel with frame for life
      const bob = this.frame ? -1 : 1;
      const sprite = enemySprites[this.frame ? 1 : 0];
      ctx.drawImage(
        sprite,
        this.x + (this.w - ENEMY_BASE_W) / 2,
        this.y + (this.h - ENEMY_BASE_H) / 2 + bob,
        ENEMY_BASE_W, ENEMY_BASE_H
      );
    }
  }

  // helper: rounded-rect path
  function roundRect(ctx, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  class ShieldBlock extends Entity {
    constructor(x,y){ super(x,y, 8, 8); this.hp = 3; }
    hit(){ this.hp--; if (this.hp<=0) this.dead=true; }
    draw(){
      ctx.fillStyle = ["rgba(255, 238, 131, 1)", "rgba(255, 225, 76, 1)", "rgba(238, 190, 0, 1)"][clamp(this.hp-1,0,2)];
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }
  }

  // Particles
  class Particle {
    constructor(x,y){
      this.x=x; this.y=y;
      this.vx = rand(-60,60);
      this.vy = rand(-140,-40);
      this.life = rand(.25,.6);
      this.age = 0;
    }
    update(dt){ this.age+=dt; this.x+=this.vx*dt; this.y+=this.vy*dt; this.vy+=280*dt; }
    draw(){
      const t = 1 - this.age/this.life;
      if (t<=0) return;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle="#fff";
      ctx.fillRect(this.x, this.y, 2, 2);
      ctx.globalAlpha = 1;
    }
    get dead(){ return this.age>=this.life; }
  }

  // ==== Speech state ====
  const SHOUTS = ["FOR SUPEREARTHH!!", "GET SOMEEEE!!!", "CLANKER SCUM!!!"];
  let lastShoutIdx = -1;
  let shout = null; // {text, t, dur, fade}
  function triggerShout(prob=1, force=false){
    if (!force && Math.random() >= prob) return;
    if (shout && shout.t < shout.dur + shout.fade) return; // let previous finish

    let idx;
    do { idx = Math.floor(Math.random()*SHOUTS.length); } while (SHOUTS.length>1 && idx === lastShoutIdx);
    lastShoutIdx = idx;

    shout = { text: SHOUTS[idx], t: 0, dur: 1.2, fade: 0.35 };
  }

  // Game state
  const bullets = [];
  const bombs   = [];
  const enemies = [];
  const shields = [];
  const particles = [];

  const player = new Player();
  let fleet = {
    vx: 45,
    dir: 1,
    stepDown: 20,
    left: Infinity, right: -Infinity, bottom: -Infinity,
    fireTimer: 0,
  };

  let score = 0;
  let high  = parseInt(localStorage.getItem(HS_KEY) || "0", 10) || 0;
  elHigh.textContent = high;
  let level = 1;
  let paused = false;
  let gameOver = false;
  let justWon = false;

  function setHUD(){
    elScore.textContent = score;
    elLives.textContent = player.lives;
    elLevel.textContent = level;
    elHigh.textContent  = Math.max(high, score);
  }

  function makeShields() {
    shields.length = 0;
    const groups = 4, blocksX = 6, blocksY = 4, gap = W/(groups+1);
    for (let g=1; g<=groups; g++){
      const gx = g*gap - 30;
      const gy = H-160;
      for (let r=0; r<blocksY; r++){
        for (let c=0; c<blocksX; c++){
          shields.push(new ShieldBlock(gx + c*9, gy + r*9));
        }
      }
    }
  }

  function makeEnemies() {
    enemies.length = 0;
    const rows = 5, cols = 11;
    const startX = 80, startY = 70, cellW = 52, cellH = 38;
    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
        const type = (r<1?2 : r<3?1 : 0);
        enemies.push(new Enemy(startX + c*cellW, startY + r*cellH, type));
      }
    }
    fleet.vx = 35 + level*6;
    fleet.dir = 1;
    fleet.stepDown = 18 + Math.min(12, level*2);
  }

  function resetGame(hard=true){
    score = 0;
    level = 1;
    player.lives = 3;
    gameOver = false; justWon = false;
    bullets.length = bombs.length = enemies.length = shields.length = particles.length = 0;
    shout = null; lastShoutIdx = -1;
    makeShields(); makeEnemies(); setHUD();
    if (!hard) return;
  }

  // Fire logic
  function playerTryFire(){
    if (gameOver || paused) return;
    if (player.cooldown<=0){
      bullets.push(new Bullet(player.x + player.w/2, player.y-8, -520));
      player.cooldown = .25;
      beep({freq: 900, dur:.05, vol:.02});
      triggerShout(0.05); // ~5% on shot
    }
  }

  // Enemy fire logic (more frequent than stock)
  function enemyRandomFire(dt){
    const alive = enemies.length;
    if (!alive) return;
    fleet.fireTimer -= dt;

    const base = clamp(0.70 - level * 0.06, 0.18, 0.90);
    if (fleet.fireTimer <= 0){
      // bottom-most enemy per column
      const byCol = new Map();
      for (const e of enemies) {
        const col = Math.round((e.x - 80) / 52);
        const cur = byCol.get(col);
        if (!cur || e.y > cur.y) byCol.set(col, e);
      }
      const shooters = [...byCol.values()];

      const pick = () => shooters[Math.floor(Math.random()*shooters.length)];
      const shootFrom = (enemy) => {
        bombs.push(new Bomb(enemy.x + enemy.w/2, enemy.y + enemy.h));
        beep({freq:200, type:"sawtooth", dur:.04, vol:.02});
      };

      shootFrom(pick());

      // extra shots in a volley
      const extra = Math.min(2, Math.floor(alive/18)) + (level >= 3 ? 1 : 0);
      const extraCount = clamp(extra, 0, 2);
      for (let i=0;i<extraCount;i++){
        if (Math.random() < 0.55) shootFrom(pick());
      }

      fleet.fireTimer = base * (0.5 + Math.random()*0.7);
    }
  }

  // Collisions
  function hitShield(rect){
    for (const s of shields){
      if (s.dead) continue;
      if (!(rect.x+rect.w<s.x || rect.x>s.x+s.w || rect.y+rect.h<s.y || rect.y>s.y+s.h)){
        s.hit();
        return true;
      }
    }
    return false;
  }

  function killEnemy(e){
    e.dead = true;
    score += (e.type===2? 30 : e.type===1? 20 : 10);
    for (let i=0;i<8;i++) particles.push(new Particle(e.x+e.w/2, e.y+e.h/2));
    beep({freq: 500 + e.type*120, type:"triangle", dur:.07, vol:.03});
    triggerShout(0.05); // ~5% on kill
  }

  function loseLife(){
    player.lives--;
    beep({freq: 120, type:"sawtooth", dur:.25, vol:.05});
    for (let i=0;i<16;i++) particles.push(new Particle(player.x+player.w/2, player.y+player.h/2));
    triggerShout(1, true); // always on life lost
    if (player.lives<=0){
      gameOver = true;
      if (score>high){ high = score; localStorage.setItem(HS_KEY, String(high)); }
    } else {
      bullets.length = 0; bombs.length = 0;
      player.x = W/2 - player.w/2;
    }
  }

  // Update fleet / march
  let animTimer = 0;
  function updateFleet(dt){
    fleet.left = Infinity; fleet.right = -Infinity; fleet.bottom = -Infinity;
    for (const e of enemies){
      fleet.left = Math.min(fleet.left, e.x);
      fleet.right = Math.max(fleet.right, e.x + e.w);
      fleet.bottom = Math.max(fleet.bottom, e.y + e.h);
    }
    const hitWallRight = fleet.right >= W - 20;
    const hitWallLeft  = fleet.left  <= 20;

    const speedFactor = 1 + (1 - enemies.length / 55) * 0.9 + (level-1)*0.1;
    const vx = fleet.vx * fleet.dir * speedFactor;

    if (hitWallRight && fleet.dir>0){
      for (const e of enemies) e.y += fleet.stepDown;
      fleet.dir = -1;
    } else if (hitWallLeft && fleet.dir<0){
      for (const e of enemies) e.y += fleet.stepDown;
      fleet.dir = 1;
    } else {
      for (const e of enemies) e.x += vx*dt;
    }

    // March animation toggle
    animTimer += dt;
    if (animTimer >= 0.28 / speedFactor){
      for (const e of enemies) e.frame = e.frame?0:1;
      animTimer = 0;
      beep({freq: 90 + Math.random()*30, type:"square", dur:.03, vol:.008});
    }

    // Bottom reached
    if (fleet.bottom >= H - 110) {
      loseLife();
      for (const e of enemies) e.y -= 40;
    }
  }

  function togglePause(){
    paused = !paused;
    btnPause.textContent = paused ? "Resume" : "Pause";
  }
  function toggleMute(){
    muted = !muted;
    btnMute.textContent = muted ? "Unmute" : "Mute";
  }

  // Main loop
  let last = performance.now();
  function loop(now){
    requestAnimationFrame(loop);
    const dt = Math.min((now - last)/1000, 0.033);
    last = now;
    if (paused) { draw(); return; }
    update(dt);
    draw();
  }

  function update(dt){
    if (gameOver) return;

    player.update(dt);

    for (const b of bullets) b.update(dt);
    for (const k of bombs)   k.update(dt);
    if (enemies.length) {
      updateFleet(dt);
      enemyRandomFire(dt);
    }

    // Bullets vs enemies / shields
    for (const b of bullets){
      if (b.dead) continue;
      if (hitShield(b.rect)) { b.dead = true; continue; }
      for (const e of enemies){
        if (e.dead) continue;
        if (b.intersects(e)){
          b.dead = true;
          killEnemy(e);
          break;
        }
      }
    }

    // Bombs vs shields / player
    for (const k of bombs){
      if (k.dead) continue;
      if (hitShield(k.rect)) { k.dead = true; continue; }
      if (k.intersects(player)) { k.dead = true; loseLife(); }
    }

    // Bullets vs bombs
    for (const b of bullets){
      if (b.dead) continue;
      for (const k of bombs){
        if (k.dead) continue;
        if (b.intersects(k)){ b.dead=true; k.dead=true; beep({freq:300, dur:.04, vol:.02}); break; }
      }
    }

    // Cleanup
    for (let i=bullets.length-1;i>=0;i--) if (bullets[i].dead) bullets.splice(i,1);
    for (let i=bombs.length-1;i>=0;i--)   if (bombs[i].dead) bombs.splice(i,1);
    for (let i=enemies.length-1;i>=0;i--) if (enemies[i].dead) enemies.splice(i,1);
    for (let i=shields.length-1;i>=0;i--) if (shields[i].dead) shields.splice(i,1);

    // Particles
    for (const p of particles) p.update(dt);
    for (let i=particles.length-1;i>=0;i--) if (particles[i].dead) particles.splice(i,1);

    // Speech timer (for fade)
    if (shout) {
      shout.t += dt;
      if (shout.t > shout.dur + shout.fade) shout = null;
    }

    // Next level?
    if (!enemies.length && !gameOver){
      justWon = true;
      level++;
      beep({freq: 880, type:"triangle", dur:.25, vol:.05});
      bullets.length = bombs.length = 0;
      makeEnemies();
      setHUD();
    }

    if (score>high){ high = score; localStorage.setItem(HS_KEY, String(high)); }
    setHUD();
  }

  function draw(){
    // Background: pixelated image fallback to simple starfield
    if (!drawPixelatedBackground()) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#0c0c18";
      for (let i = 0; i < 60; i++) {
        const x = (i * 131) % W, y = (i * 97) % H;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Entities
    for (const s of shields) s.draw();
    for (const e of enemies) e.draw();
    for (const b of bullets) b.draw();
    for (const k of bombs)   k.draw();
    player.draw();
    for (const p of particles) p.draw();

    // Speech bubble above player (if active) with fade
    if (shout) {
      const px = player.x + player.w/2;
      const py = player.y - 10;
      const a = (shout.t <= shout.dur)
        ? 1
        : clamp(1 - (shout.t - shout.dur) / shout.fade, 0, 1);
      if (a > 0) drawSpeechBubble(ctx, px, py, shout.text, a);
    }

    // Overlays
    if (paused){
      drawBanner("PAUSED — P to Resume");
    } else if (gameOver){
      drawBanner("GAME OVER — R to Restart");
    } else if (justWon){
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(W/2-180, H/2-50, 360, 100);
      ctx.globalAlpha = 1;
      ctx.strokeStyle="#444"; ctx.strokeRect(W/2-180, H/2-50, 360, 100);
      ctx.fillStyle="#eaff86"; ctx.font="24px system-ui, sans-serif";
      ctx.textAlign="center";
      ctx.fillText(`Level ${level-1} Cleared!`, W/2, H/2-8);
      ctx.fillStyle="#fff";
      ctx.font="16px system-ui, sans-serif";
      ctx.fillText(`Get ready for Level ${level}`, W/2, H/2+20);
      ctx.restore();
      justWon = false;
    }
  }

  function drawBanner(text){
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(W/2-220, H/2-60, 440, 120);
    ctx.globalAlpha = 1;
    ctx.strokeStyle="#444"; ctx.strokeRect(W/2-220, H/2-60, 440, 120);
    ctx.fillStyle="#fff"; ctx.font="24px system-ui, sans-serif";
    ctx.textAlign="center";
    ctx.fillText(text, W/2, H/2+8);
    ctx.restore();
  }

  // Init
  function init(){
    makeShields();
    makeEnemies();
    setHUD();
    requestAnimationFrame(loop);
  }

  function togglePause(){ paused = !paused; btnPause.textContent = paused ? "Resume" : "Pause"; }
  function toggleMute() {
  muted = !muted;
  btnMute.textContent = muted ? "Unmute" : "Mute";

  // Mute/unmute the WebAudio beeps
  // (already respected via the `muted` flag checked in beep())

  // Also apply to the background music element
  if (bgMusic) {
    bgMusic.muted = muted;
    // If unmuting and it hasn't started due to autoplay policy, try to play now
    if (!muted && bgMusic.paused) {
      bgMusic.play().catch(() => {});
    }
  }

  // Resume the AudioContext if needed (some browsers suspend on gesture/mute)
  if (!muted && audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}


  resetGame(false);
  init();
})();

