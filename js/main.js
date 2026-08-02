// ===== 친구 파이터 게임 엔진 =====

// 이미지 캐릭터 이미지 수정 후에도 브라우저 캐시 때문에 옛날 파일이 계속 보이는 문제 방지
const ASSET_VERSION = 3;

const STAGE_W = 960;
const STAGE_H = 540;
const GROUND_Y = 460;
const GRAVITY = 0.85;
const JUMP_V = -16;
const MOVE_SPEED = 4.2;
const FIGHTER_W = 160;
const FIGHTER_H = 240;
const MIN_GAP = 130;
const ROUND_TIME = 60;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// 창 크기에 맞춰 전체 화면을 축소/확대 (캔버스 해상도는 그대로 유지)
const stageEl = document.getElementById('stage');
function fitStage() {
  const scale = Math.min(window.innerWidth / 1020, window.innerHeight / 780, 1);
  stageEl.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitStage);
fitStage();

const selectScreen = document.getElementById('selectScreen');
const gameScreen = document.getElementById('gameScreen');
const resultScreen = document.getElementById('resultScreen');
const selectGrid = document.getElementById('selectGrid');
const resultText = document.getElementById('resultText');
const retryBtn = document.getElementById('retryBtn');
const timerEl = document.getElementById('timer');

const hud = {
  p1Portrait: document.getElementById('p1Portrait'),
  p2Portrait: document.getElementById('p2Portrait'),
  p1Name: document.getElementById('p1Name'),
  p2Name: document.getElementById('p2Name'),
  p1Hp: document.getElementById('p1Hp'),
  p2Hp: document.getElementById('p2Hp'),
  p1SpecialGauge: document.getElementById('p1SpecialGauge'),
  p2SpecialGauge: document.getElementById('p2SpecialGauge'),
  p1UltGauge: document.getElementById('p1UltGauge'),
  p2UltGauge: document.getElementById('p2UltGauge')
};

// ----- 이미지 로딩 -----
const imageCache = {};
function loadImage(src) {
  if (imageCache[src]) return imageCache[src];
  const img = new Image();
  img.src = src + '?v=' + ASSET_VERSION;
  imageCache[src] = img;
  return img;
}
CHARACTERS.forEach(c => {
  loadImage(c.sprite);
  loadImage(c.portrait);
  if (c.poseSprites) {
    Object.values(c.poseSprites).forEach(p => { p.img = loadImage(p.src); });
  }
  if (c.ultimateForm) {
    Object.values(c.ultimateForm).forEach(p => { p.img = loadImage(p.src); });
  }
});

// ----- 캐릭터 선택 화면 구성 -----
CHARACTERS.forEach(c => {
  const card = document.createElement('div');
  card.className = 'selectCard';
  const img = document.createElement('img');
  img.src = c.portrait;
  if (c.portraitCropTop) img.style.objectPosition = 'center 10%';
  const nameEl = document.createElement('div');
  nameEl.className = 'charName';
  nameEl.textContent = c.name;
  card.appendChild(img);
  card.appendChild(nameEl);
  card.addEventListener('click', () => startMatch(c.id));
  selectGrid.appendChild(card);
});

// ----- 입력 -----
const keys = {};
window.addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ----- Fighter 클래스 -----
class Fighter {
  constructor(data, startX, isCPU) {
    this.data = data;
    this.img = imageCache[data.sprite];
    this.x = startX;
    this.height = 0; // 지면 위 높이 (점프)
    this.vy = 0;
    this.facing = isCPU ? -1 : 1;
    this.state = 'idle';
    this.phase = null;
    this.stateTimer = 0;
    this.actionMove = null;
    this.actionFacing = this.facing;
    this.hasHitThisActive = false;
    this.hp = data.hp;
    this.specialGauge = 0;
    this.ultGauge = 0;
    this.guarding = false;
    this.isCPU = isCPU;
    this.hitFlash = 0;
    this.aiTimer = 0;
    this.aiIntent = null;
    this.speedMult = 1;
    this.dmgMult = 1;
    this.poison = null;
    this.auraTimer = 0;
    this.auraMove = null;
    this.auraTick = 0;
    this.transformTimer = 0;
    this.effectApplied = false;
    this.trail = [];
    this.lungeRemaining = 0;
    this.lungeSpeed = 0;
  }
  get isFree() {
    return ['idle','walk','jump','crouch','block'].includes(this.state);
  }
  get isGrounded() { return this.height <= 0; }
}

let p1, p2, projectiles, particles, strikes, matchOver, matchTimer, lastTs, running, shake;
let hitStop = 0;
let zoom = 1;

function startMatch(playerCharId) {
  const playerData = CHARACTERS.find(c => c.id === playerCharId);
  const cpuData = CHARACTERS.find(c => c.id !== playerCharId);

  p1 = new Fighter(playerData, 260, false);
  p2 = new Fighter(cpuData, 700, true);
  projectiles = [];
  particles = [];
  strikes = [];
  matchOver = false;
  matchTimer = ROUND_TIME;
  shake = { time: 0, mag: 0 };
  zoom = 1;

  hud.p1Portrait.src = playerData.portrait;
  hud.p1Portrait.style.objectPosition = playerData.portraitCropTop ? 'center 10%' : 'center center';
  hud.p2Portrait.src = cpuData.portrait;
  hud.p2Portrait.style.objectPosition = cpuData.portraitCropTop ? 'center 10%' : 'center center';
  hud.p1Name.textContent = playerData.name;
  hud.p2Name.textContent = cpuData.name;

  const m = playerData.moves;
  document.getElementById('mkP1').textContent = `Z ${m.punch1.name}`;
  document.getElementById('mkP2').textContent = `X ${m.punch2.name}`;
  document.getElementById('mkK1').textContent = `C ${m.kick1.name}`;
  document.getElementById('mkK2').textContent = `V ${m.kick2.name}`;
  document.getElementById('mkS1').textContent = `A ${m.specials[0].name}`;
  document.getElementById('mkS2').textContent = `S ${m.specials[1].name}`;
  document.getElementById('mkS3').textContent = `D ${m.specials[2].name}`;
  document.getElementById('mkUlt').textContent = `Space ${m.ultimate.name}`;

  selectScreen.classList.add('hidden');
  resultScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  timerEl.textContent = ROUND_TIME;

  lastTs = performance.now();
  running = true;
  requestAnimationFrame(loop);
}

retryBtn.addEventListener('click', () => {
  resultScreen.classList.add('hidden');
  selectScreen.classList.remove('hidden');
  running = false;
});

// ----- 메인 루프 -----
let secondAccum = 0;
function loop(ts) {
  if (!running) return;
  const dt = Math.min(ts - lastTs, 50);
  lastTs = ts;

  if (hitStop > 0) {
    hitStop--;
    draw();
    requestAnimationFrame(loop);
    return;
  }

  if (!matchOver) {
    secondAccum += dt;
    if (secondAccum >= 1000) {
      secondAccum -= 1000;
      matchTimer--;
      timerEl.textContent = Math.max(matchTimer, 0);
      if (matchTimer <= 0) endMatch(p1.hp === p2.hp ? null : (p1.hp > p2.hp ? p1 : p2));
    }
  }

  update();
  draw();
  requestAnimationFrame(loop);
}

// ----- 액션(기술) 시작 -----
function tryStartAction(f, key) {
  if (!f.isFree || !f.isGrounded) return;
  const moves = f.data.moves;
  let move = null;
  if (key === 'punch1') move = moves.punch1;
  else if (key === 'punch2') move = moves.punch2;
  else if (key === 'kick1') move = moves.kick1;
  else if (key === 'kick2') move = moves.kick2;
  else if (key === 'special1' || key === 'special2' || key === 'special3') {
    const idx = Number(key.slice(-1)) - 1;
    move = moves.specials[idx];
    if (f.specialGauge < move.gaugeCost) return;
  } else if (key === 'ultimate') {
    if (f.ultGauge < 100) return;
    move = moves.ultimate;
  }
  if (!move) return;

  f.state = key;
  f.actionMove = move;
  f.phase = 'startup';
  f.stateTimer = move.startup;
  f.hasHitThisActive = false;
  f.actionFacing = f.facing;
  if (key.startsWith('special')) f.specialGauge = Math.max(0, f.specialGauge - move.gaugeCost);
  else if (key === 'ultimate') f.ultGauge = 0;
}

// 필살기 게이지는 빨리, 궁극기 게이지는 천천히 찬다
const SPECIAL_GAUGE_RATE = 1;
const ULT_GAUGE_RATE = 0.32;
function gainGauge(f, amount) {
  f.specialGauge = Math.min(100, f.specialGauge + amount * SPECIAL_GAUGE_RATE);
  f.ultGauge = Math.min(100, f.ultGauge + amount * ULT_GAUGE_RATE);
}

// ----- 피격 처리 -----
function applyHit(attacker, defender, move, opts) {
  opts = opts || {};

  // 보험사기: 판정 중 피격당하면 대미지 무효화 + 반격
  if (defender.actionMove && defender.actionMove.type === 'counter' && defender.phase === 'active') {
    const counterDmg = defender.actionMove.counterDamage || 15;
    attacker.hp = Math.max(0, attacker.hp - counterDmg);
    attacker.hitFlash = 10;
    spawnParticles(attacker.x, GROUND_Y - 120, defender.actionMove.color || '#5b7fa6', 16, 'hit');
    shake.time = 10; shake.mag = 8;
    hitStop = 8; zoom = 1.12;
    gainGauge(defender, counterDmg * 1.2);
    if (attacker.hp <= 0) {
      attacker.state = 'ko';
      attacker.stateTimer = 9999;
      if (!matchOver) { matchOver = true; setTimeout(() => endMatch(defender), 900); }
    }
    return;
  }

  const facingCorrect = (attacker.x < defender.x && defender.facing === -1) || (attacker.x > defender.x && defender.facing === 1);
  const guardType = move.guardType || 'mid';
  const guardStanceOk =
    guardType === 'low' ? defender.state === 'crouch' :
    guardType === 'high' ? defender.state === 'block' :
    (defender.state === 'block' || defender.state === 'crouch');
  const blocking = defender.guarding && facingCorrect && guardStanceOk;

  let dmg = Math.round(move.damage * (attacker.dmgMult || 1));
  if (blocking) {
    dmg = Math.max(1, Math.round(dmg * 0.15));
    defender.hp = Math.max(0, defender.hp - dmg);
    spawnParticles(defender.x + (-defender.facing * 40), GROUND_Y - 120, '#3bd6ff', 8, 'spark');
    shake.time = 6; shake.mag = 3;
    hitStop = 3;
    gainGauge(defender, dmg * 1.5);
  } else {
    defender.hp = Math.max(0, defender.hp - dmg);
    defender.hitFlash = 10;
    defender.state = 'hitstun';
    defender.stateTimer = move.name === '궁극기' || move.type === 'ultimate' || attacker.state === 'ultimate' ? 34 : 18;
    const push = attacker.x < defender.x ? 1 : -1;
    defender.x += push * (opts.projectile ? 14 : 22);
    spawnParticles(defender.x, GROUND_Y - 120, move.color || '#ff5b3b', 14, 'hit');
    shake.time = 10; shake.mag = opts.big ? 12 : 6;
    hitStop = opts.big ? 12 : 6;
    zoom = opts.big ? 1.16 : 1.06;
    gainGauge(defender, dmg);

    if (move.dotDamage && move.dotTicks) {
      defender.poison = {
        ticksLeft: move.dotTicks,
        interval: move.dotInterval || 25,
        timer: 0,
        dmg: move.dotDamage,
        color: move.color || '#7a8b3a'
      };
    }
  }

  gainGauge(attacker, dmg * 1.5);

  if (defender.hp <= 0) {
    defender.state = 'ko';
    defender.stateTimer = 9999;
    if (!matchOver) {
      matchOver = true;
      setTimeout(() => endMatch(attacker), 900);
    }
  }
}

// ----- 상태이상 / 지속효과 처리 (독, 오라, 변신) -----
function processStatusEffects(f, opp) {
  if (f.state === 'ko') return;

  if (f.poison && f.poison.ticksLeft > 0) {
    f.poison.timer++;
    if (f.poison.timer >= f.poison.interval) {
      f.poison.timer = 0;
      f.poison.ticksLeft--;
      f.hp = Math.max(0, f.hp - f.poison.dmg);
      f.hitFlash = 6;
      spawnParticles(f.x, GROUND_Y - 120, f.poison.color, 6, 'spark');
      if (f.hp <= 0 && f.state !== 'ko') {
        f.state = 'ko'; f.stateTimer = 9999;
        if (!matchOver) { matchOver = true; setTimeout(() => endMatch(opp), 900); }
      }
    }
  }

  if (f.auraTimer > 0) {
    f.auraTimer--;
    f.auraTick++;
    if (f.auraTick % (f.auraMove.tickInterval || 25) === 0) {
      const dist = Math.abs(opp.x - f.x);
      if (dist <= (f.auraMove.range || 200) && opp.state !== 'ko') {
        opp.hp = Math.max(0, opp.hp - f.auraMove.tickDamage);
        opp.hitFlash = 6;
        spawnParticles(opp.x, GROUND_Y - 120, f.auraMove.color, 6, 'spark');
        gainGauge(f, 2);
        if (opp.hp <= 0 && opp.state !== 'ko') {
          opp.state = 'ko'; opp.stateTimer = 9999;
          if (!matchOver) { matchOver = true; setTimeout(() => endMatch(f), 900); }
        }
      }
    }
    if (Math.random() < 0.4) spawnParticles(f.x + (Math.random() - 0.5) * 60, GROUND_Y - 100 - Math.random() * 100, f.auraMove.color, 1, 'spark');
  }

  if (f.transformTimer > 0) {
    f.transformTimer--;
    if (Math.random() < 0.3) spawnParticles(f.x, GROUND_Y - 10, '#2b6fd6', 1, 'spark');
    if (f.transformTimer <= 0) { f.dmgMult = 1; f.speedMult = 1; }
  }
}

function endMatch(winner) {
  running = false;
  gameScreen.classList.add('hidden');
  resultScreen.classList.remove('hidden');
  if (!winner) {
    resultText.textContent = '무승부';
    resultText.style.color = '#ccc';
  } else if (winner === p1) {
    resultText.textContent = 'WIN';
    resultText.style.color = '#7CFC00';
  } else {
    resultText.textContent = 'LOSE';
    resultText.style.color = '#ff3b3b';
  }
}

// ----- 파티클 -----
function spawnParticles(x, y, color, count, type) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * (type === 'hit' ? 8 : 4),
      vy: (Math.random() - 0.5) * (type === 'hit' ? 8 : 4) - 2,
      life: 0, maxLife: 20 + Math.random() * 10,
      color, size: 3 + Math.random() * 5
    });
  }
}

// 필살기/궁극기 시전 순간(startup->active) 전용 연출. 종류별로 다르게 터진다.
function spawnCastEffect(f, move) {
  const color = move.color || f.data.color;
  const cy = GROUND_Y - 120;

  switch (move.type) {
    case 'dash':
      // 전방으로 쏘아지는 충격파
      for (let i = 0; i < 10; i++) {
        particles.push({
          x: f.x + f.actionFacing * 20, y: cy + (Math.random() - 0.5) * 30,
          vx: f.actionFacing * (6 + Math.random() * 4), vy: (Math.random() - 0.5) * 3,
          life: 0, maxLife: 16 + Math.random() * 6, color, size: 3 + Math.random() * 3
        });
      }
      break;
    case 'projectile':
      spawnParticles(f.x + f.actionFacing * 40, cy, color, 10, 'hit');
      break;
    case 'heal':
      for (let i = 0; i < 12; i++) {
        particles.push({
          x: f.x + (Math.random() - 0.5) * 50, y: GROUND_Y - 40,
          vx: (Math.random() - 0.5) * 1, vy: -2 - Math.random() * 2,
          life: 0, maxLife: 30 + Math.random() * 15, color, size: 3 + Math.random() * 3
        });
      }
      break;
    case 'counter':
      // 몸 주위를 도는 보호막 링
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        particles.push({
          x: f.x + Math.cos(ang) * 12, y: cy + Math.sin(ang) * 12,
          vx: Math.cos(ang) * 2.2, vy: Math.sin(ang) * 2.2,
          life: 0, maxLife: 22, color, size: 3
        });
      }
      break;
    case 'burst':
      if (move.ignoreFacing) {
        // 화면 양쪽 끝에서 몰려드는 여론(군중) 파티클
        for (let i = 0; i < 16; i++) {
          const fromLeft = i % 2 === 0;
          particles.push({
            x: fromLeft ? -10 : STAGE_W + 10, y: GROUND_Y - 40 - Math.random() * 160,
            vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 4), vy: (Math.random() - 0.5) * 2,
            life: 0, maxLife: 40, color, size: 3 + Math.random() * 3
          });
        }
      } else {
        spawnParticles(f.x, cy, color, 14, 'hit');
      }
      break;
    default:
      spawnParticles(f.x, cy, color, 10, 'hit');
  }
}

// ----- 업데이트 -----
function update() {
  handleFighterInput(p1, p2, false);
  handleFighterInput(p2, p1, true);

  updateFighter(p1, p2);
  updateFighter(p2, p1);

  processStatusEffects(p1, p2);
  processStatusEffects(p2, p1);

  resolvePositions(p1, p2);

  updateProjectiles();
  updateStrikes();
  updateParticles();

  if (shake.time > 0) shake.time--;
  zoom += (1 - zoom) * 0.18;

  updateHUD();
}

function handleFighterInput(f, opp, isCPU) {
  if (matchOver || f.state === 'ko') return;

  if (isCPU) {
    runAI(f, opp);
    return;
  }

  // 이동/점프/앉기/막기 (자유 상태일 때만)
  const shiftHeld = keys['ShiftLeft'] || keys['ShiftRight'];
  f.guarding = shiftHeld;
  if (f.isFree) {
    if (shiftHeld && keys['ArrowDown']) {
      if (f.isGrounded) f.state = 'crouch'; // 앉아 막기 (로우킥 방어)
    } else if (shiftHeld) {
      if (f.isGrounded) f.state = 'block'; // 서서 막기 (하이킥 방어)
    } else if (keys['ArrowUp']) {
      if (f.isGrounded) { f.vy = JUMP_V; f.state = 'jump'; }
    } else if (keys['ArrowDown']) {
      if (f.isGrounded) f.state = 'crouch';
    } else if (keys['ArrowLeft']) {
      f.x -= MOVE_SPEED * f.speedMult;
      if (f.isGrounded) f.state = 'walk';
    } else if (keys['ArrowRight']) {
      f.x += MOVE_SPEED * f.speedMult;
      if (f.isGrounded) f.state = 'walk';
    } else {
      if (f.isGrounded && (f.state === 'walk' || f.state === 'crouch' || f.state === 'block')) f.state = 'idle';
    }
  }

  if (keys['KeyZ']) tryStartAction(f, 'punch1');
  else if (keys['KeyX']) tryStartAction(f, 'punch2');
  else if (keys['KeyC']) tryStartAction(f, 'kick1');
  else if (keys['KeyV']) tryStartAction(f, 'kick2');
  else if (keys['KeyA']) tryStartAction(f, 'special1');
  else if (keys['KeyS']) tryStartAction(f, 'special2');
  else if (keys['KeyD']) tryStartAction(f, 'special3');
  else if (keys['Space']) tryStartAction(f, 'ultimate');
}

// ----- 아주 단순한 CPU AI -----
function runAI(f, opp) {
  if (f.aiTimer > 0) f.aiTimer--;
  const dist = Math.abs(opp.x - f.x);

  if (f.isFree && f.aiTimer <= 0) {
    f.aiTimer = 14 + Math.random() * 10;

    if (opp.state && opp.state.match(/punch|kick|special|ultimate/) && opp.phase === 'active' && dist < 230 && Math.random() < 0.5) {
      const incomingGuard = opp.actionMove && opp.actionMove.guardType;
      f.state = incomingGuard === 'low' ? 'crouch' : 'block';
      f.guarding = true;
      return;
    }

    if (dist > 220) {
      f.aiIntent = Math.random() < 0.15 ? 'jump' : 'approach';
    } else if (dist > 150) {
      f.aiIntent = Math.random() < 0.35 ? 'special' : 'approach';
    } else {
      const r = Math.random();
      if (f.ultGauge >= 100 && r < 0.25) f.aiIntent = 'ultimate';
      else if (r < 0.55) f.aiIntent = 'attack';
      else if (r < 0.75) f.aiIntent = 'special';
      else if (r < 0.85) f.aiIntent = 'block';
      else f.aiIntent = 'retreat';
    }
  }

  if (!f.isFree) return;

  if (f.aiIntent !== 'block') f.guarding = false;

  switch (f.aiIntent) {
    case 'approach':
      f.x += (opp.x > f.x ? 1 : -1) * MOVE_SPEED * f.speedMult;
      f.state = 'walk';
      break;
    case 'retreat':
      f.x += (opp.x > f.x ? -1 : 1) * MOVE_SPEED * f.speedMult;
      f.state = 'walk';
      break;
    case 'jump':
      if (f.isGrounded) { f.vy = JUMP_V; f.state = 'jump'; }
      break;
    case 'block':
      f.state = Math.random() < 0.4 ? 'crouch' : 'block';
      f.guarding = true;
      break;
    case 'attack':
      if (dist < 200) {
        const moves = ['punch1','punch1','punch2','kick1','kick2'];
        tryStartAction(f, moves[Math.floor(Math.random() * moves.length)]);
      } else {
        f.x += (opp.x > f.x ? 1 : -1) * MOVE_SPEED * f.speedMult;
        f.state = 'walk';
      }
      break;
    case 'special': {
      const specials = f.data.moves.specials;
      const options = ['special1', 'special2', 'special3'].filter((k, i) => f.specialGauge >= specials[i].gaugeCost);
      if (options.length) tryStartAction(f, options[Math.floor(Math.random() * options.length)]);
      else { f.x += (opp.x > f.x ? 1 : -1) * MOVE_SPEED * f.speedMult; f.state = 'walk'; }
      break;
    }
    case 'ultimate':
      tryStartAction(f, 'ultimate');
      break;
    default:
      f.state = 'idle';
  }
}

function updateFighter(f, opp) {
  if (f.state === 'ko') {
    if (f.hitFlash > 0) f.hitFlash--;
    return;
  }

  // 자유 상태일 때는 상대를 바라봄
  if (f.isFree) f.facing = opp.x >= f.x ? 1 : -1;

  // 중력 / 점프
  if (!f.isGrounded || f.vy !== 0) {
    f.height += -f.vy;
    f.vy += GRAVITY;
    if (f.height <= 0) {
      f.height = 0; f.vy = 0;
      if (f.state === 'jump') {
        f.state = 'idle';
        spawnParticles(f.x, GROUND_Y, '#8a8a9a', 6, 'spark');
      }
    }
  }

  if (f.hitFlash > 0) f.hitFlash--;

  // 히트스턴
  if (f.state === 'hitstun') {
    f.stateTimer--;
    if (f.stateTimer <= 0) f.state = 'idle';
    return;
  }

  // 액션(공격/필살기/궁극기) 진행
  const actionStates = ['punch1','punch2','kick1','kick2','special1','special2','special3','ultimate'];
  if (actionStates.includes(f.state)) {
    const move = f.actionMove;
    f.stateTimer--;

    if (f.phase === 'startup' && f.stateTimer <= 0) {
      f.phase = 'active';
      f.stateTimer = move.active;
      f.hasHitThisActive = false;
      f.effectApplied = false;

      if (move.type === 'projectile') {
        const count = move.projectileCount || 1;
        for (let i = 0; i < count; i++) {
          projectiles.push({
            x: f.x + f.actionFacing * 90,
            y: GROUND_Y - 130 + (i - (count - 1) / 2) * 26,
            vx: f.actionFacing * (8 + i * 0.6),
            owner: f,
            move,
            color: move.color || f.data.color,
            life: 90
          });
        }
      }
      if (move.type === 'dash') {
        f.dashRemaining = 10;
      }
      if (['special1', 'special2', 'special3', 'ultimate'].includes(f.state)) {
        spawnCastEffect(f, move);
      }
      if (['punch1', 'punch2', 'kick1', 'kick2'].includes(f.state)) {
        const big = f.state === 'punch2' || f.state === 'kick2';
        const isKick = f.state.startsWith('kick');
        f.lungeRemaining = big ? 7 : 4;
        f.lungeSpeed = big ? 5 : 3;
        strikes.push({
          x: f.x + f.actionFacing * (big ? 55 : 42),
          y: GROUND_Y - (isKick ? 95 : 130),
          facing: f.actionFacing,
          kind: isKick ? 'kick' : 'punch',
          life: 0,
          maxLife: move.active + 6,
          big
        });
      }
    } else if (f.phase === 'active') {
      if (move.type === 'dash' && f.dashRemaining > 0) {
        f.x += f.actionFacing * 6;
        f.dashRemaining--;
      }
      if (f.lungeRemaining > 0) {
        f.x += f.actionFacing * f.lungeSpeed;
        f.lungeRemaining--;
      }

      if (move.type === 'heal' && !f.effectApplied) {
        f.effectApplied = true;
        f.hp = Math.min(f.data.hp, f.hp + move.healAmount);
        spawnParticles(f.x, GROUND_Y - 120, move.color || '#ffd166', 12, 'hit');
      } else if (move.type === 'aura' && !f.effectApplied) {
        f.effectApplied = true;
        f.auraTimer = move.duration;
        f.auraMove = move;
        f.auraTick = 0;
        spawnParticles(f.x, GROUND_Y - 120, move.color || '#a8ff3b', 16, 'hit');
      } else if (move.type === 'transform' && !f.effectApplied) {
        f.effectApplied = true;
        f.transformTimer = move.duration;
        f.dmgMult = move.dmgMult || 1;
        f.speedMult = move.speedMult || 1;
        spawnParticles(f.x, GROUND_Y - 120, move.color || '#2b6fd6', 20, 'hit');
      } else if (!['projectile', 'counter', 'heal', 'aura', 'transform'].includes(move.type) && !f.hasHitThisActive) {
        const dist = Math.abs(opp.x - f.x);
        const facingCorrect = move.ignoreFacing || (opp.x - f.x) * f.actionFacing >= -10;
        if (dist <= move.range && facingCorrect && opp.state !== 'ko') {
          f.hasHitThisActive = true;
          applyHit(f, opp, move, { big: f.state === 'ultimate' });
        }
      }

      if (f.stateTimer <= 0) {
        f.phase = 'recovery';
        f.stateTimer = move.recovery;
      }
    } else if (f.phase === 'recovery') {
      if (f.stateTimer <= 0) {
        f.state = 'idle';
        f.phase = null;
        f.actionMove = null;
      }
    }
  }
}

function resolvePositions(f1, f2) {
  [f1, f2].forEach(f => {
    f.x = Math.max(70, Math.min(STAGE_W - 70, f.x));
  });
  if (Math.abs(f1.x - f2.x) < MIN_GAP) {
    const mid = (f1.x + f2.x) / 2;
    const dir = f1.x < f2.x ? -1 : 1;
    f1.x = mid + dir * MIN_GAP / 2;
    f2.x = mid - dir * MIN_GAP / 2;
  }
}

function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx;
    p.life--;
    const target = p.owner === p1 ? p2 : p1;
    const dist = Math.abs(target.x - p.x);
    let hit = false;
    if (target.state !== 'ko' && dist < 46) {
      applyHit(p.owner, target, p.move, { projectile: true });
      hit = true;
    }
    if (hit || p.life <= 0 || p.x < -20 || p.x > STAGE_W + 20) {
      projectiles.splice(i, 1);
    }
  }
}

function updateStrikes() {
  for (let i = strikes.length - 1; i >= 0; i--) {
    strikes[i].life++;
    if (strikes[i].life > strikes[i].maxLife) strikes.splice(i, 1);
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.2;
    pt.life++;
    if (pt.life > pt.maxLife) particles.splice(i, 1);
  }
}

function updateHUD() {
  hud.p1Hp.style.width = p1.hp + '%';
  hud.p2Hp.style.width = p2.hp + '%';
  hud.p1SpecialGauge.style.width = p1.specialGauge + '%';
  hud.p2SpecialGauge.style.width = p2.specialGauge + '%';
  hud.p1UltGauge.style.width = p1.ultGauge + '%';
  hud.p2UltGauge.style.width = p2.ultGauge + '%';
}

// ----- 렌더링 -----
// 배경을 제거한 캐릭터 컷아웃은 크롭 없이 원본 비율 그대로, 발밑(feet) 기준으로 그린다
function fighterWidth(img, targetH) {
  if (!img.complete || img.naturalWidth === 0) return FIGHTER_W;
  return targetH * (img.naturalWidth / img.naturalHeight);
}
function drawSprite(img, w, h) {
  if (!img.complete || img.naturalWidth === 0) return;
  ctx.drawImage(img, -w / 2, -h, w, h);
}

function draw() {
  ctx.save();
  if (shake.time > 0) {
    ctx.translate((Math.random() - 0.5) * shake.mag, (Math.random() - 0.5) * shake.mag);
  }
  if (Math.abs(zoom - 1) > 0.001) {
    ctx.translate(STAGE_W / 2, STAGE_H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-STAGE_W / 2, -STAGE_H / 2);
  }

  // 배경
  const grad = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  grad.addColorStop(0, '#2a2550');
  grad.addColorStop(1, '#171233');
  ctx.fillStyle = grad;
  ctx.fillRect(-20, -20, STAGE_W + 40, STAGE_H + 40);

  // 바닥
  ctx.fillStyle = '#0d0b1e';
  ctx.fillRect(-20, GROUND_Y, STAGE_W + 40, STAGE_H - GROUND_Y + 20);
  ctx.strokeStyle = '#3d3570';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-20, GROUND_Y);
  ctx.lineTo(STAGE_W + 20, GROUND_Y);
  ctx.stroke();

  drawFighter(p1);
  drawFighter(p2);
  projectiles.forEach(drawProjectile);
  strikes.forEach(drawStrike);
  particles.forEach(drawParticle);

  ctx.restore();
}

function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
function easeInQuad(t) { return t * t; }

function isUsable(img) { return !!(img && img.complete && img.naturalWidth); }

// 궁극기(변신) 지속 중에는 ultimateForm을 우선 사용, 없으면 idle로 대체.
// 그 외에는 상태별 실제 자세 사진(poseSprites)을, 없으면 기본 스프라이트를 사용한다.
function resolveFighterSprite(f) {
  if (f.transformTimer > 0 && f.data.ultimateForm) {
    const entry = f.data.ultimateForm[f.state] || f.data.ultimateForm.idle;
    if (isUsable(entry && entry.img)) return entry;
  }
  const poseEntry = f.data.poseSprites && f.data.poseSprites[f.state];
  if (isUsable(poseEntry && poseEntry.img)) return poseEntry;
  return null;
}

function drawFighter(f) {
  const t = performance.now() / 1000;
  const feetX = f.x;
  const feetY = GROUND_Y - f.height;

  const resolved = resolveFighterSprite(f);
  const usingPose = !!resolved;
  const img = usingPose ? resolved.img : f.img;
  const flipDir = usingPose ? f.facing * (resolved.dir || 1) : f.facing;

  const h = FIGHTER_H;
  const w = fighterWidth(img, h);
  let offsetX = 0, rotate = 0, scaleX = 1, scaleY = 1;
  let tint = null, glow = null;

  switch (f.state) {
    case 'idle':
      offsetX = Math.sin(t * 2) * 2;
      break;
    case 'walk':
      offsetX = Math.sin(t * 10) * 4;
      break;
    case 'jump':
      scaleX = 1.05; scaleY = 1.08;
      break;
    case 'crouch':
      scaleY = 0.72;
      break;
    case 'block':
      scaleX = 0.94;
      rotate = -f.facing * 4 * Math.PI / 180;
      tint = 'rgba(59,214,255,0.28)';
      break;
    case 'hitstun':
      offsetX = Math.sin(t * 40) * 5;
      tint = 'rgba(255,60,40,0.35)';
      break;
    case 'punch1':
    case 'punch2': {
      const power = f.state === 'punch2' ? 1.7 : 1.15;
      const mv = f.actionMove;
      if (usingPose) {
        // 실제 펀치 자세 사진: 자세 자체가 이미 타격 모양이므로 돌진과 임팩트 팝만 준다
        const pull = 5 * power;
        const lunge = 16 * power;
        if (f.phase === 'startup') {
          const p = 1 - Math.max(0, f.stateTimer) / mv.startup;
          offsetX = -f.actionFacing * lerp(0, pull, p);
          scaleX = lerp(1, 0.97, p); scaleY = lerp(1, 1.02, p);
        } else if (f.phase === 'active') {
          const p = easeOutQuad(1 - Math.max(0, f.stateTimer) / mv.active);
          offsetX = f.actionFacing * lerp(-pull, lunge, p);
          scaleX = lerp(0.97, 1 + 0.04 * power, p);
          scaleY = lerp(1.02, 1 - 0.02 * power, p);
        } else if (f.phase === 'recovery') {
          const p = easeInQuad(1 - Math.max(0, f.stateTimer) / mv.recovery);
          offsetX = f.actionFacing * lerp(lunge, 0, p);
          scaleX = lerp(1 + 0.04 * power, 1, p);
          scaleY = lerp(1 - 0.02 * power, 1, p);
        }
        break;
      }
      const pull = 9 * power;
      const lunge = 30 * power;
      if (f.phase === 'startup') {
        const p = 1 - Math.max(0, f.stateTimer) / mv.startup;
        offsetX = -f.actionFacing * lerp(0, pull, p);
        scaleX = lerp(1, 0.94, p); scaleY = lerp(1, 1.05, p);
      } else if (f.phase === 'active') {
        const p = easeOutQuad(1 - Math.max(0, f.stateTimer) / mv.active);
        offsetX = f.actionFacing * lerp(-pull, lunge, p);
        rotate = f.actionFacing * lerp(-2, 6 * power, p) * Math.PI / 180;
        scaleX = lerp(0.94, 1 + 0.1 * power, p);
        scaleY = lerp(1.05, 1 - 0.05 * power, p);
      } else if (f.phase === 'recovery') {
        const p = easeInQuad(1 - Math.max(0, f.stateTimer) / mv.recovery);
        offsetX = f.actionFacing * lerp(lunge, 0, p);
        rotate = f.actionFacing * lerp(6 * power, 0, p) * Math.PI / 180;
        scaleX = lerp(1 + 0.1 * power, 1, p);
        scaleY = lerp(1 - 0.05 * power, 1, p);
      }
      break;
    }
    case 'kick1':
    case 'kick2': {
      const power = f.state === 'kick2' ? 1.7 : 1.15;
      const mv = f.actionMove;
      if (usingPose) {
        const pull = 6 * power;
        const lunge = 14 * power;
        if (f.phase === 'startup') {
          const p = 1 - Math.max(0, f.stateTimer) / mv.startup;
          offsetX = -f.actionFacing * lerp(0, pull, p);
        } else if (f.phase === 'active') {
          const p = easeOutQuad(1 - Math.max(0, f.stateTimer) / mv.active);
          offsetX = f.actionFacing * lerp(-pull, lunge, p);
          scaleX = lerp(0.98, 1 + 0.03 * power, p);
          scaleY = lerp(1.01, 1 - 0.02 * power, p);
        } else if (f.phase === 'recovery') {
          const p = easeInQuad(1 - Math.max(0, f.stateTimer) / mv.recovery);
          offsetX = f.actionFacing * lerp(lunge, 0, p);
          scaleX = lerp(1 + 0.03 * power, 1, p);
          scaleY = lerp(1 - 0.02 * power, 1, p);
        }
        break;
      }
      const pull = 12 * power;
      const lunge = 26 * power;
      if (f.phase === 'startup') {
        const p = 1 - Math.max(0, f.stateTimer) / mv.startup;
        offsetX = -f.actionFacing * lerp(0, pull, p);
        rotate = f.actionFacing * lerp(0, 5, p) * Math.PI / 180;
      } else if (f.phase === 'active') {
        const p = easeOutQuad(1 - Math.max(0, f.stateTimer) / mv.active);
        offsetX = f.actionFacing * lerp(-pull, lunge, p);
        rotate = -f.actionFacing * lerp(4, 18 * power, p) * Math.PI / 180;
        scaleX = lerp(0.97, 1 + 0.08 * power, p);
        scaleY = lerp(1.02, 1 - 0.07 * power, p);
      } else if (f.phase === 'recovery') {
        const p = easeInQuad(1 - Math.max(0, f.stateTimer) / mv.recovery);
        offsetX = f.actionFacing * lerp(lunge, 0, p);
        rotate = -f.actionFacing * lerp(18 * power, 0, p) * Math.PI / 180;
        scaleX = lerp(1 + 0.08 * power, 1, p);
        scaleY = lerp(1 - 0.07 * power, 1, p);
      }
      break;
    }
    case 'special1':
    case 'special2':
    case 'special3':
    case 'ultimate': {
      const mv = f.actionMove;
      const mvType = mv ? mv.type : null;
      glow = (mv && mv.color) || f.data.color;

      if (usingPose) {
        // 실제 자세 사진이 있으면 과장된 가짜 모션 대신 살짝의 돌진/펌프만 준다
        const moving = mvType === 'dash';
        const pull = moving ? 6 : 3;
        const pump = mvType === 'transform' ? 0.1 : 0.05;
        if (f.phase === 'startup') {
          const p = 1 - Math.max(0, f.stateTimer) / mv.startup;
          offsetX = moving ? -f.actionFacing * lerp(0, pull, p) : 0;
          scaleX = lerp(1, 1 - pump * 0.4, p); scaleY = lerp(1, 1 + pump * 0.4, p);
        } else if (f.phase === 'active') {
          const p = easeOutQuad(1 - Math.max(0, f.stateTimer) / mv.active);
          offsetX = moving ? f.actionFacing * lerp(-pull, pull * 3, p) : 0;
          scaleX = lerp(1 - pump * 0.4, 1 + pump, p);
          scaleY = lerp(1 + pump * 0.4, 1 + pump, p);
        } else if (f.phase === 'recovery') {
          const p = easeInQuad(1 - Math.max(0, f.stateTimer) / mv.recovery);
          offsetX = moving ? f.actionFacing * lerp(pull * 3, 0, p) : 0;
          scaleX = lerp(1 + pump, 1, p);
          scaleY = lerp(1 + pump, 1, p);
        }
        break;
      }

      if (mvType === 'dash') {
        offsetX = f.actionFacing * 6;
        if (f.phase === 'active') scaleX = 1.1;
      } else if (mvType === 'projectile') {
        rotate = -f.actionFacing * 10 * Math.PI / 180;
      } else if (mvType === 'burst') {
        if (f.phase === 'active') { scaleX = 1.25; scaleY = 1.25; }
      } else if (mvType === 'heal') {
        offsetX = Math.sin(t * 6) * 3;
        if (f.phase === 'active') { scaleX = 1.08; scaleY = 1.08; }
      } else if (mvType === 'counter') {
        scaleX = 0.92;
        rotate = -f.facing * 6 * Math.PI / 180;
      } else if (mvType === 'aura') {
        if (f.phase === 'active') { scaleX = 1.2; scaleY = 1.2; }
      } else if (mvType === 'transform') {
        if (f.phase === 'startup') { scaleX = 0.85; scaleY = 0.85; }
        if (f.phase === 'active') { scaleX = 1.4; scaleY = 1.4; }
        glow = '#ffffff';
      } else {
        if (f.phase === 'active') { scaleX = 1.3; scaleY = 1.3; }
      }
      break;
    }
    case 'ko':
      rotate = f.facing * 80 * Math.PI / 180;
      break;
  }

  // 지속효과(오라/변신)는 상태와 무관하게 항상 표시
  if (f.auraTimer > 0) { glow = (f.auraMove && f.auraMove.color) || '#a8ff3b'; }
  if (f.transformTimer > 0) { glow = '#2b6fd6'; scaleX *= 1.12; scaleY *= 1.12; }

  // 잔상(모션 블러) - 강타/필살기/궁극기 판정 중에만 쌓임
  const trailWorthy = f.phase === 'active' &&
    ['punch2', 'kick2', 'special1', 'special2', 'special3', 'ultimate'].includes(f.state);
  for (let i = 0; i < f.trail.length; i++) {
    const g = f.trail[i];
    ctx.save();
    ctx.globalAlpha = 0.1 * (i + 1);
    ctx.translate(g.feetX + g.offsetX, g.feetY);
    ctx.rotate(g.rotate);
    ctx.scale(g.facing * g.scaleX, g.scaleY);
    drawSprite(img, w, h);
    ctx.restore();
  }
  if (trailWorthy) {
    f.trail.push({ feetX, feetY, offsetX, rotate, scaleX, scaleY, facing: flipDir });
    if (f.trail.length > 4) f.trail.shift();
  } else if (f.trail.length) {
    // 다른 동작으로 넘어가면 잔상이 새 동작까지 번지지 않도록 즉시 비운다
    f.trail.length = 0;
  }

  ctx.save();
  ctx.translate(feetX + offsetX, feetY);
  if (f.state === 'ko') ctx.translate(0, -h * 0.15);
  ctx.rotate(rotate);
  ctx.scale(flipDir * scaleX, scaleY);

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 30;
  }

  drawSprite(img, w, h);

  // source-atop: 투명 배경은 건드리지 않고 실루엣 위에만 틴트를 입힌다
  if (tint || f.hitFlash > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(-w / 2, -h, w, h);
    }
    if (f.hitFlash > 0) {
      ctx.globalAlpha = 0.5 * (f.hitFlash / 10);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-w / 2, -h, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  // 황산 오라 지속 링
  if (f.auraTimer > 0) {
    const pulse = 0.35 + Math.sin(t * 6) * 0.15;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = (f.auraMove && f.auraMove.color) || '#a8ff3b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(feetX, feetY - 90, (f.auraMove ? f.auraMove.range : 200) * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 스즈키 합체 변신 이펙트 링
  if (f.transformTimer > 0) {
    const pulse = 0.4 + Math.sin(t * 8) * 0.2;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#2b6fd6';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(feetX, feetY - 100, 110, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawProjectile(p) {
  ctx.save();
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 20;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStrike(s) {
  const p = s.life / s.maxLife;
  const alpha = Math.max(0, 1 - p * 1.3);
  const reach = (s.big ? 70 : 50) * Math.min(1, p * 4 + 0.3);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineWidth = s.big ? 5 : 3;
  const spread = s.kind === 'kick' ? 22 : 14;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(s.facing * reach * 0.35, i * spread * 0.6);
    ctx.lineTo(s.facing * reach, i * spread);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticle(pt) {
  const alpha = 1 - pt.life / pt.maxLife;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.fillStyle = pt.color;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
