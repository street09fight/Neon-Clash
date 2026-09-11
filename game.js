(() => {
"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });

const startScreen = document.getElementById("startScreen");
const controlsScreen = document.getElementById("controlsScreen");
const hud = document.getElementById("hud");
const mobileControls = document.getElementById("mobileControls");
const desktopHelp = document.getElementById("desktopHelp");
const roundMessage = document.getElementById("roundMessage");
const menuBtn = document.getElementById("menuBtn");

const p1HealthEl = document.getElementById("p1Health");
const p2HealthEl = document.getElementById("p2Health");
const p1MeterEl = document.getElementById("p1Meter");
const p2MeterEl = document.getElementById("p2Meter");
const p1RoundsEl = document.getElementById("p1Rounds");
const p2RoundsEl = document.getElementById("p2Rounds");
const timerEl = document.getElementById("timer");

let W = innerWidth, H = innerHeight, DPR = 1;
let activeGame = false;
let gameMode = "title";

function resize() {
  W = innerWidth;
  H = innerHeight;
  DPR = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (p1 && p2) {
    p1.y = Math.min(p1.y, floorY());
    p2.y = Math.min(p2.y, floorY());
  }
}
addEventListener("resize", resize);
addEventListener("orientationchange", () => setTimeout(resize, 160));
resize();

const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const lerp = (a,b,t) => a + (b-a)*t;
const smooth = t => t*t*(3-2*t);
const floorY = () => H * 0.80;
const coarsePointer = () => matchMedia("(pointer: coarse)").matches || innerWidth < 901;

const ATTACKS = {
  light:  { startup: 4,  active: 4, recovery: 9,  damage: 5,  stun: 12, push: 105, range: 76,  height: "high" },
  medium: { startup: 7,  active: 4, recovery: 14, damage: 9,  stun: 16, push: 135, range: 95,  height: "high" },
  heavy:  { startup: 11, active: 5, recovery: 22, damage: 15, stun: 22, push: 185, range: 114, height: "high" },
  low:    { startup: 7,  active: 4, recovery: 16, damage: 8,  stun: 15, push: 120, range: 96,  height: "low" }
};

const keys = {
  left:false,right:false,up:false,down:false,
  light:false,medium:false,heavy:false,special:false,parry:false
};
const pressed = Object.create(null);

const keymap = {
  a:"left", d:"right", w:"up", s:"down",
  j:"light", k:"medium", l:"heavy", i:"special", u:"parry"
};

addEventListener("keydown", e => {
  const k = keymap[e.key.toLowerCase()];
  if (k) {
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
    e.preventDefault();
  }
  if (e.key === "Escape") showTitle();
});
addEventListener("keyup", e => {
  const k = keymap[e.key.toLowerCase()];
  if (k) {
    keys[k] = false;
    e.preventDefault();
  }
});

document.querySelectorAll("[data-input]").forEach(btn => {
  const k = btn.dataset.input;
  const down = e => {
    e.preventDefault();
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
    btn.classList.add("pressed");
    try { btn.setPointerCapture(e.pointerId); } catch {}
  };
  const up = e => {
    e.preventDefault();
    keys[k] = false;
    btn.classList.remove("pressed");
  };
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("lostpointercapture", up);
});

document.getElementById("startBtn").onclick = startGame;
document.getElementById("startFromControlsBtn").onclick = startGame;
document.getElementById("controlsBtn").onclick = () => {
  startScreen.classList.remove("active");
  controlsScreen.classList.add("active");
};
document.getElementById("backBtn").onclick = () => {
  controlsScreen.classList.remove("active");
  startScreen.classList.add("active");
};
menuBtn.onclick = showTitle;

function startGame() {
  startScreen.classList.remove("active");
  controlsScreen.classList.remove("active");
  hud.classList.remove("hidden");
  menuBtn.classList.remove("hidden");
  if (coarsePointer()) mobileControls.classList.remove("hidden");
  else desktopHelp.classList.remove("hidden");
  activeGame = true;
  gameMode = "fight";
  p1.rounds = 0; p2.rounds = 0;
  newRound();
}

function showTitle() {
  activeGame = false;
  gameMode = "title";
  hud.classList.add("hidden");
  mobileControls.classList.add("hidden");
  desktopHelp.classList.add("hidden");
  menuBtn.classList.add("hidden");
  roundMessage.classList.add("hidden");
  controlsScreen.classList.remove("active");
  startScreen.classList.add("active");
  Object.keys(keys).forEach(k => keys[k] = false);
}

const palettes = {
  KADE:  { skin:"#c98b63", skinDark:"#86543e", hair:"#10131d", cloth:"#28b9d4", clothDark:"#0d5367", accent:"#f1cc68", eye:"#d3fbff" },
  MIREI: { skin:"#e1b69f", skinDark:"#9b6b59", hair:"#f0f0fb", cloth:"#a557d8", clothDark:"#47245f", accent:"#83ffd0", eye:"#f3ffff" }
};

class Fighter {
  constructor(name, x, facing, ai=false) {
    this.name = name;
    this.ai = ai;
    this.palette = palettes[name];
    this.rounds = 0;
    this.reset(x, facing);
  }

  reset(x, facing) {
    this.x = x;
    this.y = floorY();
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.hp = 100;
    this.meter = 0;
    this.state = "idle";
    this.frame = 0;
    this.attack = null;
    this.hitDone = false;
    this.parryFrames = 0;
    this.invuln = 0;
    this.afterimages = [];
  }

  get grounded() {
    return this.y >= floorY() - 1;
  }

  canAct() {
    return !["hit","block","ko"].includes(this.state) && !this.attack;
  }

  startAttack(type) {
    if (!this.grounded || !this.canAct()) return;

    let a;
    if (type === "special") {
      if (this.name === "KADE") {
        a = { type:"special", startup:10, active:3, recovery:23, damage:12, stun:18, push:165, range:72, height:"high", projectile:true };
      } else {
        a = { type:"special", startup:8, active:8, recovery:18, damage:11, stun:18, push:130, range:128, height:"low", dash:true };
      }
    } else {
      a = { ...ATTACKS[type], type };
    }

    this.attack = a;
    this.state = type;
    this.frame = 0;
    this.hitDone = false;
  }

  takeHit(a, attacker, blocked) {
    if (this.invuln > 0) return "invuln";

    if (this.parryFrames > 0) {
      this.parryFrames = 0;
      this.state = "parry";
      this.frame = 0;
      this.meter = clamp(this.meter + 18, 0, 100);
      attacker.attack = null;
      attacker.state = "hit";
      attacker.frame = 0;
      attacker.vx = -attacker.facing * 120;
      freezeFrames = 8;
      shake = 8;
      burst(this.x, this.y - 95, "#8dffd0", 20, 310);
      return "parry";
    }

    if (blocked) {
      this.hp = clamp(this.hp - a.damage * 0.16, 0, 100);
      this.state = "block";
      this.frame = 0;
      this.vx = attacker.facing * a.push * 0.35;
      this.meter = clamp(this.meter + 4, 0, 100);
      freezeFrames = 4;
      burst(this.x, this.y - (a.height === "low" ? 52 : 98), "#9bc6ff", 8, 180);
      return "block";
    }

    this.hp = clamp(this.hp - a.damage, 0, 100);
    this.attack = null;
    this.state = this.hp <= 0 ? "ko" : "hit";
    this.frame = 0;
    this.vx = attacker.facing * a.push;
    if (a.type === "heavy") this.vy = -210;
    this.meter = clamp(this.meter + 8, 0, 100);
    freezeFrames = a.type === "heavy" ? 9 : 5;
    shake = Math.min(14, 4 + a.damage * 0.48);
    burst(this.x, this.y - (a.height === "low" ? 48 : 96), "#ffd0a6", 12 + a.damage, 250);
    return "hit";
  }

  update(opponent, control) {
    this.invuln = Math.max(0, this.invuln - 1);
    this.parryFrames = Math.max(0, this.parryFrames - 1);
    this.facing = opponent.x >= this.x ? 1 : -1;

    if (this.state === "ko") {
      this.frame++;
      this.vx *= .93;
      this.physics();
      return;
    }

    if (this.state === "hit") {
      this.frame++;
      this.vx *= .88;
      if (this.frame > 18) {
        this.state = "idle";
        this.frame = 0;
      }
      this.physics();
      return;
    }

    if (this.state === "block") {
      this.frame++;
      this.vx *= .76;
      if (this.frame > 9) {
        this.state = "idle";
        this.frame = 0;
      }
      this.physics();
      return;
    }

    if (this.state === "parry") {
      this.frame++;
      this.vx *= .80;
      if (this.frame > 13) {
        this.state = "idle";
        this.frame = 0;
      }
      this.physics();
      return;
    }

    if (this.attack) {
      this.frame++;

      if (this.attack.dash && this.frame >= this.attack.startup - 2 && this.frame <= this.attack.startup + this.attack.active) {
        this.vx = this.facing * 440;
        if (this.frame % 2 === 0) {
          this.afterimages.push({x:this.x, y:this.y, life:8});
        }
      }

      if (this.attack.projectile && this.frame === this.attack.startup) {
        spawnProjectile(this);
      }

      const total = this.attack.startup + this.attack.active + this.attack.recovery;
      if (this.frame > total) {
        this.attack = null;
        this.state = "idle";
        this.frame = 0;
      }

      this.physics();
      this.afterimages.forEach(a => a.life--);
      this.afterimages = this.afterimages.filter(a => a.life > 0);
      return;
    }

    const away = this.facing === 1 ? control.left : control.right;
    const distance = Math.abs(opponent.x - this.x);

    if (control.press_parry) {
      this.parryFrames = 9;
      this.state = "parry";
      this.frame = 0;
    } else if (control.press_special) {
      this.startAttack("special");
    } else if (control.press_heavy) {
      this.startAttack(control.down ? "low" : "heavy");
    } else if (control.press_medium) {
      this.startAttack(control.down ? "low" : "medium");
    } else if (control.press_light) {
      this.startAttack(control.down ? "low" : "light");
    } else if (control.down && this.grounded) {
      this.state = "crouch";
      this.vx *= .58;
    } else if (away && this.grounded && distance < 190) {
      this.state = "guard";
      this.vx += (this.facing === 1 ? -1 : 1) * 15;
      this.vx *= .72;
    } else {
      if (this.state === "guard" || this.state === "crouch") this.state = "idle";

      const move = (control.right ? 1 : 0) - (control.left ? 1 : 0);
      if (move) {
        this.vx += move * 54;
        this.vx = clamp(this.vx, -265, 265);
        if (this.grounded) this.state = "walk";
      } else {
        this.vx *= .76;
        if (this.grounded && Math.abs(this.vx) < 10) this.state = "idle";
      }

      if (control.up && this.grounded) {
        this.vy = -770;
        this.y -= 2;
        this.state = "jump";
      }
    }

    this.physics();
  }

  physics() {
    if (!this.grounded || this.vy < 0) {
      this.vy += 2420 / 60;
      this.y += this.vy / 60;
    }
    this.x += this.vx / 60;

    if (this.y >= floorY()) {
      this.y = floorY();
      this.vy = 0;
      if (this.state === "jump") this.state = "idle";
    }

    this.x = clamp(this.x, 48, W - 48);
  }
}

let p1 = new Fighter("KADE", W * .31, 1, false);
let p2 = new Fighter("MIREI", W * .69, -1, true);

let projectiles = [];
let particles = [];
let shake = 0;
let freezeFrames = 0;
let timerFrames = 99 * 60;
let roundState = "intro";
let introFrames = 110;
let betweenFrames = 0;
let aiCooldown = 0;

function newRound() {
  p1.reset(W * .31, 1);
  p2.reset(W * .69, -1);
  projectiles = [];
  particles = [];
  timerFrames = 99 * 60;
  roundState = "intro";
  introFrames = 110;
  betweenFrames = 0;
  showRoundMessage(`ROUND ${p1.rounds + p2.rounds + 1}`);
  updateHud();
}

function showRoundMessage(text) {
  roundMessage.textContent = text;
  roundMessage.classList.remove("hidden");
}

function hideRoundMessage() {
  roundMessage.classList.add("hidden");
}

function readPlayerControl() {
  return {
    left:keys.left, right:keys.right, up:keys.up, down:keys.down,
    press_light:!!pressed.light,
    press_medium:!!pressed.medium,
    press_heavy:!!pressed.heavy,
    press_special:!!pressed.special,
    press_parry:!!pressed.parry
  };
}

function getAIControl() {
  const c = {
    left:false,right:false,up:false,down:false,
    press_light:false,press_medium:false,press_heavy:false,press_special:false,press_parry:false
  };

  const dx = p1.x - p2.x;
  const dist = Math.abs(dx);
  aiCooldown--;

  if (p2.canAct()) {
    if (p1.attack && p1.frame >= Math.max(1, p1.attack.startup - 4) && dist < 145) {
      if (Math.random() < .28) {
        c.press_parry = true;
      } else {
        if (p2.facing === 1) c.left = true; else c.right = true;
        if (p1.attack.height === "low") c.down = true;
      }
    } else {
      if (dist > 150) {
        if (dx > 0) c.right = true; else c.left = true;
      } else if (dist < 72 && Math.random() < .22) {
        if (dx > 0) c.left = true; else c.right = true;
      }

      if (aiCooldown <= 0 && dist < 165) {
        const r = Math.random();
        if (r < .28) c.press_light = true;
        else if (r < .52) c.press_medium = true;
        else if (r < .69) c.press_heavy = true;
        else if (r < .83) { c.down = true; c.press_medium = true; }
        else c.press_special = true;
        aiCooldown = 22 + Math.floor(Math.random() * 34);
      } else if (aiCooldown <= 0 && dist >= 165 && Math.random() < .18) {
        c.press_special = true;
        aiCooldown = 45;
      }
    }
  }

  return c;
}

function isBlocking(defender, attacker, attack, control) {
  if (!defender.grounded) return false;
  const away = defender.facing === 1 ? control.left : control.right;
  if (!away) return false;
  if (attack.height === "low" && !control.down) return false;
  return true;
}

function resolveMelee(attacker, defender, defenderControl) {
  if (!attacker.attack || attacker.hitDone || attacker.attack.projectile) return;

  const a = attacker.attack;
  if (attacker.frame < a.startup || attacker.frame > a.startup + a.active) return;

  const dx = defender.x - attacker.x;
  const inFront = dx * attacker.facing > 0;
  const dist = Math.abs(dx);

  if (inFront && dist <= a.range) {
    const result = defender.takeHit(a, attacker, isBlocking(defender, attacker, a, defenderControl));
    attacker.hitDone = true;
    if (result === "hit") attacker.meter = clamp(attacker.meter + 7, 0, 100);
  }
}

function spawnProjectile(owner) {
  projectiles.push({
    x: owner.x + owner.facing * 52,
    y: owner.y - 94,
    vx: owner.facing * 490,
    owner,
    life: 140,
    radius: 17
  });
}

function updateProjectiles(playerControl, aiControl) {
  for (const q of projectiles) {
    q.x += q.vx / 60;
    q.life--;

    const defender = q.owner === p1 ? p2 : p1;
    const control = defender === p1 ? playerControl : aiControl;

    if (Math.abs(q.x - defender.x) < 34 && Math.abs(q.y - (defender.y - 90)) < 68) {
      const a = { type:"special", damage:12, stun:18, push:160, height:"high" };
      defender.takeHit(a, q.owner, isBlocking(defender, q.owner, a, control));
      q.life = 0;
    }
  }

  projectiles = projectiles.filter(q => q.life > 0 && q.x > -80 && q.x < W + 80);
}

function burst(x,y,color,count,speed) {
  for (let i=0; i<count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (.35 + Math.random() * .75);
    particles.push({
      x,y,
      vx:Math.cos(a)*s,
      vy:Math.sin(a)*s,
      life:18+Math.random()*20,
      max:38,
      color,
      r:1.5+Math.random()*4
    });
  }
}

function updateParticles() {
  for (const p of particles) {
    p.x += p.vx / 60;
    p.y += p.vy / 60;
    p.vx *= .94;
    p.vy *= .94;
    p.life--;
  }
  particles = particles.filter(p => p.life > 0);
}

function separateBodies() {
  const dx = p2.x - p1.x;
  const abs = Math.abs(dx);
  if (abs < 58) {
    const push = (58 - abs) * .5;
    const sign = Math.sign(dx || 1);
    p1.x -= push * sign;
    p2.x += push * sign;
  }
}

function updateHud() {
  p1HealthEl.style.width = clamp(p1.hp,0,100) + "%";
  p2HealthEl.style.width = clamp(p2.hp,0,100) + "%";
  p1MeterEl.style.width = clamp(p1.meter,0,100) + "%";
  p2MeterEl.style.width = clamp(p2.meter,0,100) + "%";
  timerEl.textContent = String(Math.max(0, Math.ceil(timerFrames / 60))).padStart(2,"0");

  [...p1RoundsEl.children].forEach((el,i) => el.classList.toggle("won", i < p1.rounds));
  [...p2RoundsEl.children].forEach((el,i) => el.classList.toggle("won", i < p2.rounds));

  p1HealthEl.style.background = p1.hp < 25 ? "linear-gradient(90deg,#ff4e72,#ff8b9f)" : "linear-gradient(90deg,#f4d35e,#ffec8a)";
  p2HealthEl.style.background = p2.hp < 25 ? "linear-gradient(90deg,#ff4e72,#ff8b9f)" : "linear-gradient(90deg,#f4d35e,#ffec8a)";
}

function clearPressed() {
  Object.keys(pressed).forEach(k => delete pressed[k]);
}

function updateGame() {
  if (!activeGame) {
    clearPressed();
    return;
  }

  if (freezeFrames > 0) {
    freezeFrames--;
    clearPressed();
    return;
  }

  if (roundState === "intro") {
    introFrames--;
    if (introFrames === 58) showRoundMessage("FIGHT!");
    if (introFrames <= 0) {
      hideRoundMessage();
      roundState = "fight";
    }
    updateParticles();
    clearPressed();
    return;
  }

  if (roundState === "between") {
    betweenFrames--;
    updateParticles();
    if (betweenFrames <= 0) {
      if (p1.rounds >= 2 || p2.rounds >= 2) {
        p1.rounds = 0;
        p2.rounds = 0;
      }
      newRound();
    }
    clearPressed();
    return;
  }

  const playerControl = readPlayerControl();
  const aiControl = getAIControl();

  p1.update(p2, playerControl);
  p2.update(p1, aiControl);
  separateBodies();

  resolveMelee(p1, p2, aiControl);
  resolveMelee(p2, p1, playerControl);
  updateProjectiles(playerControl, aiControl);
  updateParticles();

  timerFrames--;

  if (p1.hp <= 0 || p2.hp <= 0 || timerFrames <= 0) {
    roundState = "between";
    betweenFrames = 145;

    let winner = null;
    if (p1.hp > p2.hp) winner = p1;
    else if (p2.hp > p1.hp) winner = p2;

    if (winner) {
      winner.rounds++;
      if (winner.rounds >= 2) showRoundMessage(`${winner.name} WINS MATCH`);
      else showRoundMessage(`${winner.name} WINS`);
    } else {
      showRoundMessage("DRAW");
    }
  }

  updateHud();
  clearPressed();
  shake *= .84;
}

function line(x1,y1,x2,y2,w,color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.lineTo(x2,y2);
  ctx.stroke();
}
function circle(x,y,r,color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fill();
}
function polygon(points,color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0],points[0][1]);
  for (let i=1;i<points.length;i++) ctx.lineTo(points[i][0],points[i][1]);
  ctx.closePath();
  ctx.fill();
}

function getPose(f) {
  const t = performance.now() * .006;
  const crouch = f.state === "crouch" || f.state === "low";

  let torso = -88, hip = -54, head = -126, lean = 0;
  let armF = {sx:18,sy:-99,ex:35,ey:-77,hx:28,hy:-56};
  let armB = {sx:-18,sy:-98,ex:-28,ey:-76,hx:-17,hy:-57};
  let legF = {hx:13,hy:-52,kx:22,ky:-27,fx:27,fy:0};
  let legB = {hx:-12,hy:-52,kx:-20,ky:-27,fx:-23,fy:0};

  if (crouch) {
    torso=-66;hip=-39;head=-99;
    armF={sx:18,sy:-76,ex:34,ey:-59,hx:25,hy:-44};
    armB={sx:-18,sy:-76,ex:-28,ey:-57,hx:-16,hy:-43};
    legF={hx:13,hy:-38,kx:31,ky:-17,fx:48,fy:0};
    legB={hx:-12,hy:-38,kx:-29,ky:-16,fx:-44,fy:0};
  }

  if (f.state === "walk") {
    const s = Math.sin(t * 1.8) * 18;
    legF.kx += s; legF.fx += s*1.2;
    legB.kx -= s; legB.fx -= s*1.2;
    armF.ex -= s*.42; armB.ex += s*.42;
  }

  if (f.state === "jump") {
    legF={hx:13,hy:-52,kx:28,ky:-20,fx:8,fy:-7};
    legB={hx:-12,hy:-52,kx:-26,ky:-18,fx:-4,fy:-6};
    armF.ex=46;armF.ey=-100;armF.hx=55;armF.hy=-86;
    armB.ex=-42;armB.ey=-98;armB.hx=-50;armB.hy=-83;
  }

  if (f.state === "guard" || f.state === "block") {
    armF={sx:16,sy:torso-8,ex:30,ey:head+22,hx:17,hy:head+3};
    armB={sx:-16,sy:torso-5,ex:-3,ey:head+29,hx:8,hy:head+13};
    lean=-5;
  }

  if (f.state === "parry") {
    armF={sx:17,sy:torso-9,ex:39,ey:head+31,hx:50,hy:head+17};
    armB={sx:-17,sy:torso-6,ex:-1,ey:head+34,hx:10,hy:head+15};
    lean=4;
  }

  if (f.state === "hit" || f.state === "ko") {
    lean=-14;
    armF.ex=46;armF.ey=-74;armF.hx=58;armF.hy=-56;
    armB.ex=-40;armB.ey=-67;armB.hx=-48;armB.hy=-48;
  }

  if (f.attack) {
    const a = f.attack;
    let thrust;
    if (f.frame < a.startup) thrust = smooth(f.frame / Math.max(1,a.startup));
    else if (f.frame <= a.startup + a.active) thrust = 1;
    else thrust = smooth(1 - (f.frame - a.startup - a.active) / Math.max(1,a.recovery));
    thrust = clamp(thrust,0,1);

    if (a.type === "light") {
      armF.ex=38+42*thrust;armF.ey=-91;
      armF.hx=40+72*thrust;armF.hy=-92;lean=7*thrust;
    }
    if (a.type === "medium") {
      armF.ex=42+48*thrust;armF.ey=-86;
      armF.hx=45+86*thrust;armF.hy=-82;
      armB.ex=-20;armB.hx=-6;lean=10*thrust;
    }
    if (a.type === "heavy") {
      armF.ex=46+54*thrust;armF.ey=-74;
      armF.hx=50+100*thrust;armF.hy=-69;
      armB.ex=-25;armB.hx=-8;lean=14*thrust;
    }
    if (a.type === "low") {
      torso=-65;head=-98;
      legF.kx=34+40*thrust;legF.ky=-18;
      legF.fx=45+75*thrust;legF.fy=-8;
    }
    if (a.type === "special" && f.name === "KADE") {
      armF.ex=34+24*thrust;armF.ey=-86;
      armF.hx=38+50*thrust;armF.hy=-84;
      armB.ex=20;armB.ey=-83;armB.hx=31;armB.hy=-82;
      lean=6;
    }
    if (a.type === "special" && f.name === "MIREI") {
      torso=-65;head=-99;lean=14;
      legF.kx=38+35*thrust;legF.ky=-19;
      legF.fx=60+86*thrust;legF.fy=-10;
    }
  }

  return {torso,hip,head,lean,armF,armB,legF,legB};
}

function drawLimb(baseX,baseY,p1,p2,p3,width,c1,c2,face) {
  const X = v => baseX + v*face;
  const Y = v => baseY + v;
  line(X(p1.x),Y(p1.y),X(p2.x),Y(p2.y),width,c2);
  circle(X(p2.x),Y(p2.y),width*.48,c2);
  line(X(p2.x),Y(p2.y),X(p3.x),Y(p3.y),width*.86,c1);
  circle(X(p3.x),Y(p3.y),width*.52,c1);
}

function drawFighter(f, alpha=1, ghostX=null, ghostY=null) {
  const pose = getPose(f);
  const x = ghostX ?? f.x;
  const y = ghostY ?? f.y;
  const s = f.facing;
  const p = f.palette;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (alpha === 1) {
    ctx.globalAlpha=.26;
    ctx.fillStyle="#000";
    ctx.beginPath();
    ctx.ellipse(x,y+5,42,9,0,0,Math.PI*2);
    ctx.fill();
    ctx.globalAlpha=1;
  }

  drawLimb(x,y,{x:pose.legB.hx,y:pose.legB.hy},{x:pose.legB.kx,y:pose.legB.ky},{x:pose.legB.fx,y:pose.legB.fy},17,p.clothDark,p.skinDark,s);
  drawLimb(x,y,{x:pose.armB.sx,y:pose.armB.sy},{x:pose.armB.ex,y:pose.armB.ey},{x:pose.armB.hx,y:pose.armB.hy},15,p.skin,p.skinDark,s);

  polygon([
    [x-21*s,y+pose.hip-8],[x+20*s,y+pose.hip-8],
    [x+31*s,y-12],[x+5*s,y-25],[x-29*s,y-10]
  ],p.clothDark);

  ctx.save();
  ctx.translate(x,y+pose.torso);
  ctx.rotate(pose.lean*s*Math.PI/180);
  ctx.fillStyle=p.cloth;
  ctx.beginPath();
  ctx.moveTo(-24*s,-18);ctx.lineTo(25*s,-17);ctx.lineTo(30*s,35);ctx.lineTo(-28*s,35);ctx.closePath();ctx.fill();
  ctx.fillStyle=p.accent;ctx.fillRect(-26,-1,52,7);
  ctx.restore();

  line(x,y-107,x,y+pose.head+13,13,p.skinDark);
  circle(x,y+pose.head,22,p.skin);

  polygon([
    [x-20*s,y+pose.head-2],[x+22*s,y+pose.head-4],
    [x+16*s,y+pose.head+21],[x-9*s,y+pose.head+23]
  ],p.skin);

  if (f.name === "KADE") {
    polygon([
      [x-22*s,y+pose.head-9],[x-18*s,y+pose.head-28],
      [x-7*s,y+pose.head-19],[x+2*s,y+pose.head-35],
      [x+8*s,y+pose.head-18],[x+21*s,y+pose.head-25],
      [x+20*s,y+pose.head-5]
    ],p.hair);
  } else {
    polygon([
      [x-22*s,y+pose.head-10],[x-16*s,y+pose.head-31],
      [x+1*s,y+pose.head-37],[x+20*s,y+pose.head-24],
      [x+24*s,y+pose.head+10],[x+8*s,y+pose.head+20],
      [x-15*s,y+pose.head+7]
    ],p.hair);
  }

  circle(x+10*s,y+pose.head-2,2.3,p.eye);
  line(x+5*s,y+pose.head+10,x+15*s,y+pose.head+9,2,p.skinDark);

  drawLimb(x,y,{x:pose.legF.hx,y:pose.legF.hy},{x:pose.legF.kx,y:pose.legF.ky},{x:pose.legF.fx,y:pose.legF.fy},18,p.cloth,p.skin,s);
  drawLimb(x,y,{x:pose.armF.sx,y:pose.armF.sy},{x:pose.armF.ex,y:pose.armF.ey},{x:pose.armF.hx,y:pose.armF.hy},16,p.skin,p.skinDark,s);
  circle(x+pose.armF.hx*s,y+pose.armF.hy,9,p.accent);

  if (alpha === 1 && (f.parryFrames > 0 || f.state === "parry")) {
    ctx.strokeStyle="rgba(125,255,207,.84)";
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.arc(x,y-88,59+Math.sin(performance.now()*.02)*5,-1.2,1.3);
    ctx.stroke();
  }

  ctx.restore();
}

function drawStage() {
  const gy = floorY();

  const bg = ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,"#0a1022");
  bg.addColorStop(.60,"#182443");
  bg.addColorStop(1,"#070a12");
  ctx.fillStyle=bg;
  ctx.fillRect(0,0,W,H);

  const glow = ctx.createRadialGradient(W*.5,H*.20,10,W*.5,H*.20,H*.32);
  glow.addColorStop(0,"rgba(95,218,255,.30)");
  glow.addColorStop(1,"rgba(95,218,255,0)");
  ctx.fillStyle=glow;
  ctx.fillRect(0,0,W,H*.65);

  ctx.fillStyle="#0a0e19";
  const bw = W/18+2;
  for (let i=0;i<18;i++) {
    const bh = 45 + ((i*71)%160);
    ctx.fillRect(i*bw,gy-bh-46,bw-4,bh);
  }

  ctx.globalAlpha=.34;
  ctx.fillStyle="#5edcff";
  for (let i=0;i<42;i++) {
    const x=(i*83)%W, y=gy-80-((i*47)%150);
    ctx.fillRect(x,y,3,8);
  }
  ctx.globalAlpha=1;

  ctx.fillStyle="#101827";
  ctx.fillRect(0,gy,W,H-gy);

  ctx.strokeStyle="rgba(90,220,255,.16)";
  ctx.lineWidth=1;
  for (let i=0;i<11;i++) {
    const yy=gy+i*i*3.2;
    ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(W,yy);ctx.stroke();
  }
  for (let x=-W;x<W*2;x+=90) {
    ctx.beginPath();ctx.moveTo(W/2,gy);ctx.lineTo(x,H);ctx.stroke();
  }

  ctx.fillStyle="rgba(130,240,255,.45)";
  ctx.fillRect(0,gy-3,W,3);
}

function drawGame() {
  ctx.save();
  if (shake > 1) ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);

  drawStage();

  for (const a of p2.afterimages) {
    drawFighter(p2, Math.max(0,a.life/16), a.x, a.y);
  }

  drawFighter(p1);
  drawFighter(p2);

  for (const q of projectiles) {
    const g = ctx.createRadialGradient(q.x,q.y,2,q.x,q.y,30);
    g.addColorStop(0,"#ffffff");
    g.addColorStop(.24,"#76eaff");
    g.addColorStop(1,"rgba(35,125,255,0)");
    ctx.fillStyle=g;
    ctx.beginPath();ctx.arc(q.x,q.y,30,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="rgba(150,244,255,.65)";
    ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(q.x,q.y,16+Math.sin(performance.now()*.018)*3,0,Math.PI*2);ctx.stroke();
  }

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life/p.max,0,1);
    circle(p.x,p.y,p.r,p.color);
  }
  ctx.globalAlpha=1;

  ctx.restore();
}

let last = performance.now();
let accumulator = 0;
const STEP = 1/60;

function frame(now) {
  const delta = Math.min(.05,(now-last)/1000);
  last=now;
  accumulator += delta;

  while (accumulator >= STEP) {
    updateGame();
    accumulator -= STEP;
  }

  drawGame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
})();
