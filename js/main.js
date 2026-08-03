// ===== 라갤러파이트 게임 엔진 =====

// 이미지 캐릭터 이미지 수정 후에도 브라우저 캐시 때문에 옛날 파일이 계속 보이는 문제 방지
const ASSET_VERSION = 6;

const STAGE_W = 960;
const STAGE_H = 540;
const GROUND_Y = 460;
const GRAVITY = 0.85;
const JUMP_V = -16;
const MOVE_SPEED = 3.2;
const FIGHTER_W = 160;
const FIGHTER_H = 240;
const MIN_GAP = 130;
const ROUND_TIME = 60;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// 창 크기에 맞춰 전체 화면을 축소/확대 (캔버스 해상도는 그대로 유지)
const stageEl = document.getElementById('stage');
const IS_TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;
function fitStage() {
  // 터치 기기는 하단 키 안내 바를 숨기고 HUD도 줄여서 실제 필요한 세로 공간이 작으므로
  // 그만큼 기준 높이를 낮춰 캔버스(대전 화면)가 더 크게 보이도록 한다
  const heightRef = IS_TOUCH ? 610 : 780;
  const scale = Math.min(window.innerWidth / 1020, window.innerHeight / heightRef, 1);
  stageEl.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitStage);
window.addEventListener('orientationchange', fitStage);
fitStage();

const selectScreen = document.getElementById('selectScreen');
const mapScreen = document.getElementById('mapScreen');
const gameScreen = document.getElementById('gameScreen');
const resultScreen = document.getElementById('resultScreen');
const touchControlsEl = document.getElementById('touchControls');
const tcS1El = document.getElementById('tcS1');
const tcS2El = document.getElementById('tcS2');
const tcS3El = document.getElementById('tcS3');
const tcUltEl = document.querySelector('#touchControls .tcUltBtn');
const selectGrid = document.getElementById('selectGrid');
const mapGrid = document.getElementById('mapGrid');
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
// 전투 배경(맵) 목록 - 캐릭터 선택 다음에 고르게 된다
const STAGES = [
  { id: 'yangman', name: '양만장', bg: 'assets/characters/stage_bg.jpg' },
  { id: 'rsg', name: '알슥', bg: 'assets/characters/stage_bg2.jpg' }
];
STAGES.forEach(s => { s.img = loadImage(s.bg); });
let currentStage = STAGES[0];

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
// 캐릭터를 고르면 바로 시작하지 않고 맵 선택 화면으로 넘어간다
let pendingCharId = null;
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
  card.addEventListener('click', () => {
    pendingCharId = c.id;
    selectScreen.classList.add('hidden');
    mapScreen.classList.remove('hidden');
  });
  selectGrid.appendChild(card);
});

// 아직 실제로 구현되지 않은 예정 캐릭터 - 초상화만 미리 보여주고 선택은 막아둔다
const COMING_SOON_CHARACTERS = [
  { name: '옥킴', portrait: 'assets/characters/okkim_portrait.jpg' },
  { name: '골절기', portrait: 'assets/characters/hyungjun_portrait.jpg' }
];
COMING_SOON_CHARACTERS.forEach(c => {
  const card = document.createElement('div');
  card.className = 'selectCard locked';
  const img = document.createElement('img');
  img.src = c.portrait;
  const nameEl = document.createElement('div');
  nameEl.className = 'charName';
  nameEl.textContent = c.name;
  const lockedLabel = document.createElement('div');
  lockedLabel.className = 'lockedLabel';
  lockedLabel.textContent = '준비중';
  card.appendChild(img);
  card.appendChild(nameEl);
  card.appendChild(lockedLabel);
  // 클릭해도 아무 반응 없음 (아직 선택 불가)
  selectGrid.appendChild(card);
});

// ----- 맵 선택 화면 구성 -----
STAGES.forEach(s => {
  const card = document.createElement('div');
  card.className = 'selectCard';
  const img = document.createElement('img');
  img.src = s.bg;
  const nameEl = document.createElement('div');
  nameEl.className = 'charName';
  nameEl.textContent = s.name;
  card.appendChild(img);
  card.appendChild(nameEl);
  card.addEventListener('click', () => {
    currentStage = s;
    mapScreen.classList.add('hidden');
    startMatch(pendingCharId);
  });
  mapGrid.appendChild(card);
});

document.getElementById('mapBackBtn').addEventListener('click', () => {
  mapScreen.classList.add('hidden');
  selectScreen.classList.remove('hidden');
});

// ----- 입력 -----
const keys = {};
window.addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// 모바일 터치 컨트롤 - 버튼이 곧 키보드와 같은 keys[] 상태를 채워주므로
// 게임 로직(판정/이동) 쪽은 입력 수단을 신경 쓸 필요가 없다
document.querySelectorAll('#touchControls .tcBtn').forEach(btn => {
  const code = btn.dataset.key;
  const press = e => { e.preventDefault(); keys[code] = true; btn.classList.add('pressed'); };
  const release = e => { if (e) e.preventDefault(); keys[code] = false; btn.classList.remove('pressed'); };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
});

// 이동 가상 조이스틱 - 눌러서 끄는 방향으로 ArrowLeft/Right/Up/Down 키를 대신 채워준다
(function setupJoystick() {
  const base = document.getElementById('tcJoystick');
  const knob = document.getElementById('tcJoystickKnob');
  if (!base || !knob) return;

  const MAX_DIST = 40;
  const DEADZONE = 12;
  let activeId = null;
  let baseRect = null;

  function setDir(dx, dy) {
    keys['ArrowLeft'] = dx < -DEADZONE;
    keys['ArrowRight'] = dx > DEADZONE;
    keys['ArrowUp'] = dy < -DEADZONE;
    keys['ArrowDown'] = dy > DEADZONE;
  }

  function resetDir() {
    keys['ArrowLeft'] = false;
    keys['ArrowRight'] = false;
    keys['ArrowUp'] = false;
    keys['ArrowDown'] = false;
    knob.style.transform = 'translate(-50%, -50%)';
  }

  function moveKnob(clientX, clientY) {
    const cx = baseRect.left + baseRect.width / 2;
    const cy = baseRect.top + baseRect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_DIST) { dx = (dx / dist) * MAX_DIST; dy = (dy / dist) * MAX_DIST; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    setDir(dx, dy);
  }

  base.addEventListener('pointerdown', e => {
    e.preventDefault();
    activeId = e.pointerId;
    baseRect = base.getBoundingClientRect();
    moveKnob(e.clientX, e.clientY);
  });
  window.addEventListener('pointermove', e => {
    if (e.pointerId !== activeId) return;
    moveKnob(e.clientX, e.clientY);
  });
  function endDrag(e) {
    if (e.pointerId !== activeId) return;
    activeId = null;
    resetDir();
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
})();

// ----- Fighter 클래스 -----
class Fighter {
  constructor(data, startX, isCPU) {
    this.data = data;
    this.img = imageCache[data.sprite];
    this.x = startX;
    this.height = 0; // 지면 위 높이 (점프)
    this.vy = 0;
    this.facing = isCPU ? -1 : 1;
    this.walkDir = this.facing; // 걷기 자세는 상대 추적이 아니라 실제 이동 키 방향으로 좌우반전
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
    this.landSquash = 0;
    this.visual = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };
  }
  get isFree() {
    return ['idle','walk','jump','crouch','block'].includes(this.state);
  }
  get isGrounded() { return this.height <= 0; }
}

let p1, p2, projectiles, particles, strikes, props, floatingTexts, rings, impactLines, matchOver, matchTimer, lastTs, running, shake;
let hitStop = 0;
let zoom = 1;
let koBannerTimer = 0;
let introPhase = null; // 'ready' -> 'go' -> null(전투 시작)
let introTimer = 0;
let flashTime = 0, flashColor = '#fff';
let ultBannerTimer = 0, ultBannerText = '', ultBannerColor = '#fff';

// 상태 전환(공격류) 목록 - 판정 로직과 렌더 스무딩 강도 판단에 공용으로 사용
const ACTION_STATES = ['punch1','punch2','kick1','kick2','special1','special2','special3','ultimate'];

function startMatch(playerCharId) {
  const playerData = CHARACTERS.find(c => c.id === playerCharId);
  const cpuData = CHARACTERS.find(c => c.id !== playerCharId);

  p1 = new Fighter(playerData, 260, false);
  p2 = new Fighter(cpuData, 700, true);
  projectiles = [];
  particles = [];
  strikes = [];
  props = [];
  floatingTexts = [];
  rings = [];
  impactLines = [];
  matchOver = false;
  matchTimer = ROUND_TIME;
  shake = { time: 0, mag: 0 };
  zoom = 1;
  koBannerTimer = 0;
  flashTime = 0;
  ultBannerTimer = 0;
  introPhase = 'ready';
  introTimer = 700;

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

  // 모바일 터치 버튼도 실제 기술명으로 동기화 (필살기는 이름이 길어서 번호로 고정 표기)
  document.getElementById('tcP1').textContent = m.punch1.name;
  document.getElementById('tcP2').textContent = m.punch2.name;
  document.getElementById('tcK1').textContent = m.kick1.name;
  document.getElementById('tcK2').textContent = m.kick2.name;

  selectScreen.classList.add('hidden');
  resultScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  touchControlsEl.classList.remove('hidden');
  timerEl.textContent = ROUND_TIME;

  lastTs = performance.now();
  running = true;
  requestAnimationFrame(loop);
}

retryBtn.addEventListener('click', () => {
  resultScreen.classList.add('hidden');
  selectScreen.classList.remove('hidden');
  touchControlsEl.classList.add('hidden');
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

  if (introPhase) {
    introTimer -= dt;
    if (introTimer <= 0) {
      if (introPhase === 'ready') { introPhase = 'go'; introTimer = 500; }
      else introPhase = null;
    }
    draw();
    requestAnimationFrame(loop);
    return;
  }

  if (koBannerTimer > 0) koBannerTimer -= dt;

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

  // 방향 무시(ignoreFacing) 기술은 판정만 전방위일 뿐, 연출은 실제로 상대를 바라보며 시전해야 자연스럽다
  if (move.ignoreFacing) {
    const opp = f === p1 ? p2 : p1;
    f.facing = opp.x >= f.x ? 1 : -1;
  }

  f.state = key;
  f.actionMove = move;
  f.phase = 'startup';
  f.stateTimer = move.startup;
  f.hasHitThisActive = false;
  f.hasCountered = false;
  f.actionFacing = f.facing;
  if (key.startsWith('special')) f.specialGauge = Math.max(0, f.specialGauge - move.gaugeCost);
  else if (key === 'ultimate') f.ultGauge = 0;
}

// 필살기 게이지는 빨리, 궁극기 게이지는 천천히 찬다
// (예전 값은 라운드가 끝날 때까지 필살기 한 번 못 써보는 경우가 잦아 상향)
// 필살기/궁극기가 너무 자주 터져서 전투 템포가 정신없다는 피드백을 반영해 살짝 낮춤
// (그래도 라운드 안에 한 번은 쓸 수 있도록 최소 보장은 유지)
const SPECIAL_GAUGE_RATE = 2.4;
const ULT_GAUGE_RATE = 0.8;
const PASSIVE_SPECIAL_GAUGE_PER_FRAME = 0.03;
const PASSIVE_ULT_GAUGE_PER_FRAME = 0.02;
function gainGauge(f, amount) {
  f.specialGauge = Math.min(100, f.specialGauge + amount * SPECIAL_GAUGE_RATE);
  f.ultGauge = Math.min(100, f.ultGauge + amount * ULT_GAUGE_RATE);
}

// ----- 피격 처리 -----
function applyHit(attacker, defender, move, opts) {
  opts = opts || {};

  // 보험사기: 판정 중 피격당하면 대미지 무효화 + 반격
  if (defender.actionMove && defender.actionMove.type === 'counter' && defender.phase === 'active') {
    defender.hasCountered = true;
    const counterDmg = defender.actionMove.counterDamage || 15;
    attacker.hp = Math.max(0, attacker.hp - counterDmg);
    attacker.hitFlash = 10;
    spawnParticles(attacker.x, GROUND_Y - 120, defender.actionMove.color || '#5b7fa6', 16, 'hit');
    shake.time = 10; shake.mag = 8;
    hitStop = 8; zoom = 1.12;
    gainGauge(defender, counterDmg * 1.2);
    if (defender.data.id === 'gura' && defender.actionMove.key === 'special3') {
      spawnFloatingText(defender.x, GROUND_Y - 260, '고소 확정!', '#ff3b3b');
      spawnParticles(defender.x - 20, GROUND_Y - 260, '#ff3b3b', 6, 'spark');
      spawnParticles(defender.x + 20, GROUND_Y - 260, '#3b7bff', 6, 'spark');
    }
    if (attacker.hp <= 0) {
      attacker.state = 'ko';
      attacker.stateTimer = 9999;
      triggerKO(defender);
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
    spawnFloatingText(defender.x, GROUND_Y - 220, '방어함', '#3bd6ff');
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
    triggerKO(attacker);
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
        triggerKO(opp);
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
          triggerKO(f);
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

// HP가 0이 되는 순간 결과 화면으로 넘어가기 전 잠깐 "K.O." 배너를 띄운다
function triggerKO(winner) {
  if (matchOver) return;
  matchOver = true;
  koBannerTimer = 900;
  setTimeout(() => endMatch(winner), 900);
}

function endMatch(winner) {
  running = false;
  gameScreen.classList.add('hidden');
  resultScreen.classList.remove('hidden');
  touchControlsEl.classList.add('hidden');
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

// ----- 필살기/궁극기 공용 연출 부품 -----
// 화면 전체가 잠깐 번쩍이는 플래시 (궁극기 발동 등 결정적 순간에 사용)
function triggerFlash(color, duration) {
  flashColor = color;
  flashTime = Math.max(flashTime, duration);
}

// 타격점에서 퍼져나가는 충격파 링
function spawnRing(x, y, color, maxRadius, life) {
  rings.push({ x, y, color, maxRadius, life: 0, maxLife: life });
}

// 궁극기 발동 시 화면 중앙에서 사방으로 뻗는 KOF 스타일 집중선
function spawnImpactLines(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.15;
    impactLines.push({ x, y, ang, color, life: 0, maxLife: 20 + Math.random() * 10, len: 60 + Math.random() * 60 });
  }
}

function updateRings() {
  for (let i = rings.length - 1; i >= 0; i--) {
    rings[i].life++;
    if (rings[i].life > rings[i].maxLife) rings.splice(i, 1);
  }
}
function drawRing(r) {
  const p = r.life / r.maxLife;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - p);
  ctx.strokeStyle = r.color;
  ctx.lineWidth = 4 * (1 - p) + 1;
  ctx.beginPath();
  ctx.arc(r.x, r.y, r.maxRadius * p, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function updateImpactLines() {
  for (let i = impactLines.length - 1; i >= 0; i--) {
    impactLines[i].life++;
    if (impactLines[i].life > impactLines[i].maxLife) impactLines.splice(i, 1);
  }
}
function drawImpactLine(l) {
  const p = l.life / l.maxLife;
  const grow = Math.min(1, p * 2.5);
  const near = 20 + l.len * 0.3 * grow;
  const far = 20 + l.len * grow;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - p);
  ctx.strokeStyle = l.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(l.x + Math.cos(l.ang) * near, l.y + Math.sin(l.ang) * near);
  ctx.lineTo(l.x + Math.cos(l.ang) * far, l.y + Math.sin(l.ang) * far);
  ctx.stroke();
  ctx.restore();
}

// 필살기/궁극기 시전 순간(startup->active) 전용 연출. 종류별로 다르게 터진다.
function spawnCastEffect(f, move) {
  const color = move.color || f.data.color;
  const cy = GROUND_Y - 120;

  switch (move.type) {
    case 'dash':
      // 전방으로 쏘아지는 충격파
      for (let i = 0; i < 14; i++) {
        particles.push({
          x: f.x + f.actionFacing * 20, y: cy + (Math.random() - 0.5) * 30,
          vx: f.actionFacing * (6 + Math.random() * 4), vy: (Math.random() - 0.5) * 3,
          life: 0, maxLife: 16 + Math.random() * 6, color, size: 3 + Math.random() * 3
        });
      }
      // 법의 심판: 돌진과 함께 책이 회전하며 날아가는 연출
      if (f.data.id === 'gura' && move.key === 'special1') {
        props.push({
          type: 'book',
          x: f.x + f.actionFacing * 30, y: cy - 20,
          vx: f.actionFacing * 14, vy: -4,
          rot: 0, vrot: f.actionFacing * 0.9,
          life: 0, maxLife: 24, color
        });
      }
      break;
    case 'projectile':
      spawnParticles(f.x + f.actionFacing * 40, cy, color, 14, 'hit');
      break;
    case 'heal':
      for (let i = 0; i < 16; i++) {
        particles.push({
          x: f.x + (Math.random() - 0.5) * 50, y: GROUND_Y - 40,
          vx: (Math.random() - 0.5) * 1, vy: -2 - Math.random() * 2,
          life: 0, maxLife: 30 + Math.random() * 15, color, size: 3 + Math.random() * 3
        });
      }
      break;
    case 'counter':
      // 몸 주위를 도는 보호막 링
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2;
        particles.push({
          x: f.x + Math.cos(ang) * 12, y: cy + Math.sin(ang) * 12,
          vx: Math.cos(ang) * 2.2, vy: Math.sin(ang) * 2.2,
          life: 0, maxLife: 22, color, size: 3
        });
      }
      // 보험사기: 경찰이 출동한 듯 머리 위에서 빨강/파랑 경광등 불빛이 번갈아 반짝임
      if (f.data.id === 'gura' && move.key === 'special3') {
        for (let i = 0; i < 14; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          particles.push({
            x: f.x + side * (14 + Math.random() * 10), y: cy - 130 - Math.random() * 10,
            vx: side * 0.3, vy: -0.4,
            life: 0, maxLife: 26 + Math.random() * 10,
            color: side < 0 ? '#ff3b3b' : '#3b7bff', size: 5 + Math.random() * 3
          });
        }
      }
      break;
    case 'burst':
      if (move.ignoreFacing) {
        // 화면 양쪽 끝에서 몰려드는 여론(군중) 파티클
        for (let i = 0; i < 20; i++) {
          const fromLeft = i % 2 === 0;
          particles.push({
            x: fromLeft ? -10 : STAGE_W + 10, y: GROUND_Y - 40 - Math.random() * 160,
            vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 4), vy: (Math.random() - 0.5) * 2,
            life: 0, maxLife: 40, color, size: 3 + Math.random() * 3
          });
        }
        // 정치쑈: 입에서 상대를 향해 침을 튀기며 열변을 토하는 연출
        if (f.data.id === 'gura' && move.key === 'special2') {
          const mouthY = cy - 95;
          for (let i = 0; i < 18; i++) {
            particles.push({
              x: f.x + f.actionFacing * 24, y: mouthY + (Math.random() - 0.5) * 10,
              vx: f.actionFacing * (7 + Math.random() * 5), vy: (Math.random() - 0.5) * 3 - 1,
              life: 0, maxLife: 14 + Math.random() * 8, color: '#eef6d8', size: 1.5 + Math.random() * 2
            });
          }
        }
      } else {
        spawnParticles(f.x, cy, color, 18, 'hit');
      }
      break;
    default:
      spawnParticles(f.x, cy, color, 14, 'hit');
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
  updateProps();
  updateFloatingTexts();
  updateRings();
  updateImpactLines();

  if (shake.time > 0) shake.time--;
  zoom += (1 - zoom) * 0.18;
  if (flashTime > 0) flashTime--;
  if (ultBannerTimer > 0) ultBannerTimer--;

  if (!matchOver) {
    p1.specialGauge = Math.min(100, p1.specialGauge + PASSIVE_SPECIAL_GAUGE_PER_FRAME);
    p2.specialGauge = Math.min(100, p2.specialGauge + PASSIVE_SPECIAL_GAUGE_PER_FRAME);
    p1.ultGauge = Math.min(100, p1.ultGauge + PASSIVE_ULT_GAUGE_PER_FRAME);
    p2.ultGauge = Math.min(100, p2.ultGauge + PASSIVE_ULT_GAUGE_PER_FRAME);
  }

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
    } else {
      const wantLeft = keys['ArrowLeft'] && !keys['ArrowRight'];
      const wantRight = keys['ArrowRight'] && !keys['ArrowLeft'];

      // 점프 시작: 좌/우를 같이 눌러도(대각선 점프) 이 프레임에 바로 반영
      if (keys['ArrowUp'] && f.isGrounded) { f.vy = JUMP_V; f.state = 'jump'; }

      // 좌우 이동: 땅/공중 모두 적용 (공중에서는 대각선 점프 궤적 제어용 공중 이동)
      if (wantLeft) {
        f.x -= MOVE_SPEED * f.speedMult;
        f.walkDir = -1;
        if (f.isGrounded && f.state !== 'jump') f.state = 'walk';
      } else if (wantRight) {
        f.x += MOVE_SPEED * f.speedMult;
        f.walkDir = 1;
        if (f.isGrounded && f.state !== 'jump') f.state = 'walk';
      } else if (keys['ArrowDown']) {
        if (f.isGrounded) f.state = 'crouch';
      } else if (f.isGrounded && (f.state === 'walk' || f.state === 'crouch' || f.state === 'block')) {
        f.state = 'idle';
      }
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
      f.walkDir = opp.x > f.x ? 1 : -1;
      f.x += f.walkDir * MOVE_SPEED * f.speedMult;
      f.state = 'walk';
      break;
    case 'retreat':
      f.walkDir = opp.x > f.x ? -1 : 1;
      f.x += f.walkDir * MOVE_SPEED * f.speedMult;
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
        f.walkDir = opp.x > f.x ? 1 : -1;
        f.x += f.walkDir * MOVE_SPEED * f.speedMult;
        f.state = 'walk';
      }
      break;
    case 'special': {
      const specials = f.data.moves.specials;
      const options = ['special1', 'special2', 'special3'].filter((k, i) => f.specialGauge >= specials[i].gaugeCost);
      if (options.length) tryStartAction(f, options[Math.floor(Math.random() * options.length)]);
      else { f.walkDir = opp.x > f.x ? 1 : -1; f.x += f.walkDir * MOVE_SPEED * f.speedMult; f.state = 'walk'; }
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
        f.landSquash = 10;
      }
    }
  }

  if (f.hitFlash > 0) f.hitFlash--;
  if (f.landSquash > 0) f.landSquash--;

  // 히트스턴
  if (f.state === 'hitstun') {
    f.stateTimer--;
    if (f.stateTimer <= 0) f.state = 'idle';
    return;
  }

  // 액션(공격/필살기/궁극기) 진행
  if (ACTION_STATES.includes(f.state)) {
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
        const fxColor = move.color || f.data.color;
        if (f.state === 'ultimate') {
          // 궁극기는 킹오브파이터식 연출: 화면 정지+확대, 전체 플래시, 중앙 집중선, 큰 충격파 링
          if (move.castText) {
            ultBannerText = move.castText;
            ultBannerColor = fxColor;
            ultBannerTimer = 50;
          }
          triggerFlash(fxColor, 18);
          spawnImpactLines(STAGE_W / 2, STAGE_H / 2, fxColor, 18);
          spawnRing(f.x, GROUND_Y - 120, fxColor, 260, 36);
          hitStop = Math.max(hitStop, 14);
          zoom = 1.3;
          shake.time = Math.max(shake.time, 14);
          shake.mag = Math.max(shake.mag, 7);
        } else {
          if (move.castText) spawnFloatingText(f.x, GROUND_Y - 260, move.castText, fxColor);
          spawnRing(f.x, GROUND_Y - 120, fxColor, 100, 22);
        }
      }
      if (['punch1', 'punch2', 'kick1', 'kick2'].includes(f.state)) {
        const big = f.state === 'punch2' || f.state === 'kick2';
        const isKick = f.state.startsWith('kick');
        // 메카 변신 중엔 사진 자체가 팔을 뻗는 포즈가 아니라 상대를 안 보고 치는 것처럼
        // 보이기 쉬워서, 몸 전체가 상대 쪽으로 크게 파고들도록 돌진을 강하게 보정한다
        const mechaBoost = f.transformTimer > 0 ? 1.7 : 1;
        f.lungeRemaining = Math.round((big ? 7 : 4) * mechaBoost);
        f.lungeSpeed = (big ? 5 : 3) * mechaBoost;
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
        // 보험사기: 판정 중에 반격 성공을 못 했으면(=아무도 안 때렸으면) "합의금"이라도 챙긴다.
        // 완전히 허탕은 아니게 소량 회복 + 문구 연출을 보장해준다.
        if (move.type === 'counter' && !f.hasCountered && move.chipHeal) {
          f.hp = Math.min(f.data.hp, f.hp + move.chipHeal);
          spawnFloatingText(f.x, GROUND_Y - 220, move.chipCastText || '합의금 챙김', '#9ad24a');
          spawnParticles(f.x, GROUND_Y - 120, '#9ad24a', 8, 'hit');
        }
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

// 순전히 연출용 소품(예: 법의 심판 스킬의 던져지는 책) - 판정에는 관여하지 않는다
function updateProps() {
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.35;
    p.rot += p.vrot;
    p.life++;
    if (p.life > p.maxLife) props.splice(i, 1);
  }
}

function drawProp(p) {
  const t = Math.min(1, p.life / p.maxLife);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t * t);
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  if (p.type === 'book') {
    ctx.fillStyle = p.color || '#c9a227';
    ctx.fillRect(-13, -9, 26, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-11, -7, 22, 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 7);
    ctx.stroke();
  }
  ctx.restore();
}

// 대미지 텍스트 대신 짧은 상태 문구(예: "방어함")를 위로 떠오르며 표시
function spawnFloatingText(x, y, text, color) {
  floatingTexts.push({ x, y, text, color: color || '#ffffff', life: 0, maxLife: 42 });
}
function updateFloatingTexts() {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.life++;
    if (ft.life > ft.maxLife) floatingTexts.splice(i, 1);
  }
}
function drawFloatingText(ft) {
  const p = ft.life / ft.maxLife;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - p * p);
  ctx.translate(ft.x, ft.y - p * 36);
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText(ft.text, 0, 0);
  ctx.fillStyle = ft.color;
  ctx.fillText(ft.text, 0, 0);
  ctx.restore();
}

// 필살기 중 가장 싼 기술을 쓸 수 있으면(=하나라도 쓸 수 있으면) 게이지가 "찼다"고 본다
function minSpecialCost(f) {
  return Math.min(...f.data.moves.specials.map(s => s.gaugeCost));
}

function updateHUD() {
  hud.p1Hp.style.width = p1.hp + '%';
  hud.p2Hp.style.width = p2.hp + '%';
  hud.p1SpecialGauge.style.width = p1.specialGauge + '%';
  hud.p2SpecialGauge.style.width = p2.specialGauge + '%';
  hud.p1UltGauge.style.width = p1.ultGauge + '%';
  hud.p2UltGauge.style.width = p2.ultGauge + '%';

  hud.p1SpecialGauge.classList.toggle('ready', p1.specialGauge >= minSpecialCost(p1));
  hud.p2SpecialGauge.classList.toggle('ready', p2.specialGauge >= minSpecialCost(p2));
  hud.p1UltGauge.classList.toggle('ready', p1.ultGauge >= 100);
  hud.p2UltGauge.classList.toggle('ready', p2.ultGauge >= 100);

  // 모바일 터치 버튼도 게이지가 차면 반짝이도록 동기화 (플레이어=p1 기준)
  const p1Specials = p1.data.moves.specials;
  tcS1El.classList.toggle('ready', p1.specialGauge >= p1Specials[0].gaugeCost);
  tcS2El.classList.toggle('ready', p1.specialGauge >= p1Specials[1].gaugeCost);
  tcS3El.classList.toggle('ready', p1.specialGauge >= p1Specials[2].gaugeCost);
  tcUltEl.classList.toggle('ready', p1.ultGauge >= 100);
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

// 피격/블록 틴트를 캐릭터 실루엣에만 입히기 위한 오프스크린 버퍼.
// 메인 캔버스에 바로 source-atop을 적용하면 이미 그려진 배경까지 대상이 되어
// 실루엣이 아니라 네모 박스 전체가 칠해져버리므로, 여기서 캐릭터만 먼저 그려
// 투명한 배경 위에서 틴트를 합성한 뒤 그 결과만 메인 캔버스에 얹는다.
const tintCanvas = document.createElement('canvas');
const tintCtx = tintCanvas.getContext('2d');
function drawSpriteWithTint(img, w, h, tint, hitFlash) {
  if (!img.complete || img.naturalWidth === 0) return;
  if (!tint && !(hitFlash > 0)) { drawSprite(img, w, h); return; }

  const cw = Math.max(1, Math.ceil(w));
  const ch = Math.max(1, Math.ceil(h));
  tintCanvas.width = cw;
  tintCanvas.height = ch;
  tintCtx.drawImage(img, 0, 0, cw, ch);
  tintCtx.globalCompositeOperation = 'source-atop';
  if (tint) {
    tintCtx.fillStyle = tint;
    tintCtx.fillRect(0, 0, cw, ch);
  }
  if (hitFlash > 0) {
    tintCtx.globalAlpha = 0.5 * (hitFlash / 10);
    tintCtx.fillStyle = '#ffffff';
    tintCtx.fillRect(0, 0, cw, ch);
    tintCtx.globalAlpha = 1;
  }
  tintCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(tintCanvas, -w / 2, -h, w, h);
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

  // 배경 (선택한 맵 실사진, 로드 전이면 그라데이션으로 대체)
  if (isUsable(currentStage.img)) {
    ctx.drawImage(currentStage.img, -20, -20, STAGE_W + 40, STAGE_H + 40);
    ctx.fillStyle = 'rgba(10,8,30,0.4)';
    ctx.fillRect(-20, -20, STAGE_W + 40, STAGE_H + 40);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, STAGE_H);
    grad.addColorStop(0, '#2a2550');
    grad.addColorStop(1, '#171233');
    ctx.fillStyle = grad;
    ctx.fillRect(-20, -20, STAGE_W + 40, STAGE_H + 40);
  }

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
  props.forEach(drawProp);
  rings.forEach(drawRing);
  impactLines.forEach(drawImpactLine);
  floatingTexts.forEach(drawFloatingText);

  ctx.restore();

  // 궁극기 지속 중인 쪽이 있으면 화면 가장자리에 테마색 비네트를 살짝 깔아
  // "지금 궁극기 상태다"가 카메라 흔들림과 무관하게 항상 또렷이 보이게 한다
  const ultActiveFighter = [p1, p2].find(f => f.auraTimer > 0 || f.transformTimer > 0);
  if (ultActiveFighter) {
    const vColor = (ultActiveFighter.auraMove && ultActiveFighter.auraMove.color) || '#2b6fd6';
    drawVignette(vColor);
  }

  if (flashTime > 0) drawFlash();

  if (introPhase) drawBanner(introPhase === 'ready' ? 'READY' : 'GO!', introPhase === 'ready' ? '#ffffff' : '#ffd166');
  else if (koBannerTimer > 0) drawBanner('K.O.', '#ff3b3b');
  else if (ultBannerTimer > 0) drawBanner(ultBannerText, ultBannerColor);
}

// 궁극기 지속 중 화면 가장자리를 감싸는 테마색 비네트
function drawVignette(color) {
  const pulse = 0.28 + Math.sin(performance.now() / 1000 * 4) * 0.08;
  ctx.save();
  const grad = ctx.createRadialGradient(
    STAGE_W / 2, STAGE_H / 2, STAGE_H * 0.35,
    STAGE_W / 2, STAGE_H / 2, STAGE_H * 0.75
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, color);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.restore();
}

// 궁극기 발동 등 결정적 순간에 화면 전체가 잠깐 번쩍이는 플래시
function drawFlash() {
  ctx.save();
  ctx.globalAlpha = (flashTime / 18) * 0.55;
  ctx.fillStyle = flashColor;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.restore();
}

// 화면 중앙에 큼직하게 뜨는 배너(READY / GO! / K.O.)
function drawBanner(text, color) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 64px sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(text, STAGE_W / 2, STAGE_H / 2 - 40);
  ctx.fillStyle = color;
  ctx.fillText(text, STAGE_W / 2, STAGE_H / 2 - 40);
  ctx.restore();
}

function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
function easeInQuad(t) { return t * t; }

function isUsable(img) { return !!(img && img.complete && img.naturalWidth); }

// 궁극기(변신) 지속 중에는 ultimateForm을 우선 사용, 없으면 idle로 대체.
// 그 외에는 상태별 실제 자세 사진(poseSprites)을, 없으면 기본 스프라이트를 사용한다.
function resolveFighterSprite(f) {
  // 변신형(transform)이든 오라형(aura) 궁극기든, 지속 중이면 전용 이미지 세트로 교체
  if ((f.transformTimer > 0 || f.auraTimer > 0) && f.data.ultimateForm) {
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
  // 걷는 중에는 상대 추적용 facing이 아니라 실제 이동 키 방향(walkDir)으로 좌우반전
  const renderFacing = f.state === 'walk' ? f.walkDir : f.facing;
  const flipDir = usingPose ? renderFacing * (resolved.dir || 1) : renderFacing * (f.data.spriteDir || 1);

  const h = FIGHTER_H;
  const w = fighterWidth(img, h);
  let offsetX = 0, offsetY = 0, rotate = 0, scaleX = 1, scaleY = 1;
  let tint = null, glow = null;

  switch (f.state) {
    case 'idle':
      // 숨쉬기: 살짝 위아래로 들썩이며 좌우로 흔들림
      offsetX = Math.sin(t * 2) * 2;
      offsetY = -Math.abs(Math.sin(t * 2)) * 2;
      scaleY = 1 + Math.sin(t * 2) * 0.012;
      break;
    case 'walk': {
      // 걷는 보폭에 맞춰 통통 튀고, 진행 방향으로 살짝 기울어짐
      const walkCycle = Math.abs(Math.sin(t * 10));
      offsetX = Math.sin(t * 10) * 4;
      offsetY = -walkCycle * 6;
      rotate = renderFacing * Math.sin(t * 10) * 2.5 * Math.PI / 180;
      scaleY = 1 - walkCycle * 0.035;
      scaleX = 1 + walkCycle * 0.02;
      break;
    }
    case 'jump':
      // 상승 중엔 위로 늘어나고, 하강 중엔 눌리는 느낌으로 탄성을 준다
      if (f.vy < 0) { scaleY = 1.1 + Math.min(0.06, -f.vy * 0.004); scaleX = 0.95; }
      else { scaleY = 1.04; scaleX = 0.98 + Math.min(0.05, f.vy * 0.003); }
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
        // 로우킥/하이킥 사진이 같은 걸 재사용하는 경우(메카모드)에도 구분되어 보이도록
        // 하이킥은 몸을 더 크게 뒤로 젖히는 회전을 추가로 준다
        const tiltMax = f.state === 'kick2' ? 16 : 3;
        if (f.phase === 'startup') {
          const p = 1 - Math.max(0, f.stateTimer) / mv.startup;
          offsetX = -f.actionFacing * lerp(0, pull, p);
          rotate = -f.actionFacing * lerp(0, tiltMax * 0.3, p) * Math.PI / 180;
        } else if (f.phase === 'active') {
          const p = easeOutQuad(1 - Math.max(0, f.stateTimer) / mv.active);
          offsetX = f.actionFacing * lerp(-pull, lunge, p);
          scaleX = lerp(0.98, 1 + 0.03 * power, p);
          scaleY = lerp(1.01, 1 - 0.02 * power, p);
          rotate = -f.actionFacing * lerp(tiltMax * 0.3, tiltMax, p) * Math.PI / 180;
        } else if (f.phase === 'recovery') {
          const p = easeInQuad(1 - Math.max(0, f.stateTimer) / mv.recovery);
          offsetX = f.actionFacing * lerp(lunge, 0, p);
          scaleX = lerp(1 + 0.03 * power, 1, p);
          scaleY = lerp(1 - 0.02 * power, 1, p);
          rotate = -f.actionFacing * lerp(tiltMax, 0, p) * Math.PI / 180;
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

      // 보험사기: 경광등처럼 빨강/파랑이 빠르게 번갈아 번쩍이는 연출
      if (f.data.id === 'gura' && mv && mv.key === 'special3') {
        glow = Math.floor(t * 8) % 2 === 0 ? '#ff3b3b' : '#3b7bff';
      }

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

  // 착지 스쿼시: 점프에서 착지한 직후 잠깐 눌렸다 튀어오르는 탄성
  if (f.landSquash > 0) {
    const lp = f.landSquash / 10;
    scaleY *= 1 - 0.18 * lp;
    scaleX *= 1 + 0.12 * lp;
  }

  // 지속효과(오라/변신)는 상태와 무관하게 항상 표시
  if (f.auraTimer > 0) { glow = (f.auraMove && f.auraMove.color) || '#a8ff3b'; }
  if (f.transformTimer > 0) { glow = '#2b6fd6'; scaleX *= 1.12; scaleY *= 1.12; }

  // 상태 전환이 뚝뚝 끊기지 않도록 목표값을 향해 매 프레임 부드럽게 보간한다.
  // 액션(공격류)은 이미 startup/active/recovery 진행률로 곡선이 짜여 있으니 빠르게 따라가고,
  // 걷기/점프/앉기 등 자유 상태 전환은 스프링처럼 천천히 따라가게 해서 애니메이션처럼 보이게 한다.
  const smoothing = ACTION_STATES.includes(f.state) ? 0.6 : 0.25;
  f.visual.x = lerp(f.visual.x, offsetX, smoothing);
  f.visual.y = lerp(f.visual.y, offsetY, smoothing);
  f.visual.rot = lerp(f.visual.rot, rotate, smoothing);
  f.visual.sx = lerp(f.visual.sx, scaleX, smoothing);
  f.visual.sy = lerp(f.visual.sy, scaleY, smoothing);

  // 잔상(모션 블러) - 강타/필살기/궁극기 판정 중에만 쌓임
  const trailWorthy = f.phase === 'active' &&
    ['punch2', 'kick2', 'special1', 'special2', 'special3', 'ultimate'].includes(f.state);
  for (let i = 0; i < f.trail.length; i++) {
    const g = f.trail[i];
    ctx.save();
    ctx.globalAlpha = 0.1 * (i + 1);
    ctx.translate(g.feetX + g.x, g.feetY + g.y);
    ctx.rotate(g.rot);
    ctx.scale(g.facing * g.sx, g.sy);
    drawSprite(img, w, h);
    ctx.restore();
  }
  if (trailWorthy) {
    f.trail.push({ feetX, feetY, x: f.visual.x, y: f.visual.y, rot: f.visual.rot, sx: f.visual.sx, sy: f.visual.sy, facing: flipDir });
    if (f.trail.length > 4) f.trail.shift();
  } else if (f.trail.length) {
    // 다른 동작으로 넘어가면 잔상이 새 동작까지 번지지 않도록 즉시 비운다
    f.trail.length = 0;
  }

  ctx.save();
  ctx.translate(feetX + f.visual.x, feetY + f.visual.y);
  if (f.state === 'ko') ctx.translate(0, -h * 0.15);
  ctx.rotate(f.visual.rot);
  ctx.scale(flipDir * f.visual.sx, f.visual.sy);

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 30;
  }

  drawSpriteWithTint(img, w, h, tint, f.hitFlash);

  ctx.restore();

  // 황산 오라 지속 링 (실제 판정 범위는 사실상 전체 화면이라 시각적 링 크기는 고정값 사용)
  if (f.auraTimer > 0) {
    const pulse = 0.35 + Math.sin(t * 6) * 0.15;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = (f.auraMove && f.auraMove.color) || '#a8ff3b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(feetX, feetY - 90, 110, 0, Math.PI * 2);
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
