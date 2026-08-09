// 캐릭터 데이터 정의
//
// move.type 종류
//   'dash'       -> 앞으로 돌진하며 강타
//   'projectile' -> 원거리 투사체 (projectileCount 로 다연발 가능)
//   'burst'      -> 제자리 폭발형 타격 (ignoreFacing: true 면 사방 판정)
//   'heal'       -> 자가 회복 (상대에게 데미지 없음)
//   'aura'       -> 시전 후 일정 시간(duration, 프레임) 동안 주변에 지속 도트뎀
//   'counter'    -> 판정 중 피격 시 대미지를 무효화하고 반격
//   'transform'  -> 일정 시간(duration) 동안 공격력/이동속도 버프
//
// move.guardType (기본 punch1/punch2 = 'mid')
//   'mid'  -> 서서 막기/앉아 막기 둘 다 방어 가능
//   'low'  -> 앉아서 막아야만 방어됨 (서서 막으면 그대로 맞음)
//   'high' -> 서서 막아야만 방어됨 (앉아서 막으면 그대로 맞음)
//
// 필살기는 gaugeCost 만큼 "필살기 게이지"를 소모해서 사용 (쿨다운 없음, 게이지가 곧 자원).
// 궁극기는 "궁극기 게이지"가 100 차야 사용, 사용 시 게이지 전부 소모.

const CHARACTERS = [
  {
    id: 'yang',
    name: '양주완',
    color: '#3b82f6',
    sprite: 'assets/characters/yangjuwan_cut.png',
    portrait: 'assets/characters/yangjuwan.jpg',
    portraitCropTop: true,
    // 실제 동작 사진 (dir: 이 사진 속 타격/동작이 향하는 방향, 1=오른쪽 -1=왼쪽)
    poseSprites: {
      // 옆모습 사진이라 원본이 오른쪽을 보고 걷는 중이라 dir: 1
      // 정면 사진보다 옆모습이 더 자연스러워서 걷기(walk)에도 동일 사진 사용
      idle: { src: 'assets/characters/yang2_idle_full.png', dir: 1 },
      walk: { src: 'assets/characters/yang2_idle_full.png', dir: 1 },
      punch1: { src: 'assets/characters/yang2_punch1_full.png', dir: 1 },
      punch2: { src: 'assets/characters/yang2_punch2.png', dir: 1 },
      kick1: { src: 'assets/characters/yang2_kick1.png', dir: -1 },
      kick2: { src: 'assets/characters/yang2_kick2.png', dir: 1 },
      block: { src: 'assets/characters/yang2_block_full.png', dir: 1 },
      crouch: { src: 'assets/characters/yang2_crouch.png', dir: 1 },
      jump: { src: 'assets/characters/yang2_jump.png', dir: 1 },
      hitstun: { src: 'assets/characters/yang2_hit.png', dir: -1 },
      special1: { src: 'assets/characters/yang2_special1.png', dir: 1 },
      special2: { src: 'assets/characters/yang2_special2_full.png', dir: 1 },
      special3: { src: 'assets/characters/yang2_special3_full.png', dir: 1 },
      ultimate: { src: 'assets/characters/yang2_ultimate_full.png', dir: 1 }
    },
    // 신지드-모드(황산 분사) 지속 중에는 이 이미지들로 전부 교체된다. 없는 상태는 idle로 대체.
    ultimateForm: {
      punch1: { src: 'assets/characters/yang_ult_punch1.png', dir: 1 },
      punch2: { src: 'assets/characters/yang_ult_punch2.png', dir: 1 },
      kick1: { src: 'assets/characters/yang_ult_kick1.png', dir: -1 },
      kick2: { src: 'assets/characters/yang_ult_kick2.png', dir: 1 },
      block: { src: 'assets/characters/yang_ult_block.png', dir: 1 },
      jump: { src: 'assets/characters/yang_ult_jump.png', dir: 1 },
      crouch: { src: 'assets/characters/yang_ult_crouch.png', dir: 1 }
    },
    // 라운드가 너무 빨리 끝난다는 피드백으로 전 캐릭터 체력 100 -> 130 상향 (게임 진행을 좀 더 길게)
    hp: 130,
    moves: {
      punch1: { name: '잽', damage: 2, range: 150, startup: 5, active: 4, recovery: 9 },
      punch2: { name: '스트레이트', damage: 5, range: 190, startup: 9, active: 5, recovery: 15 },
      kick1: { name: '로우킥', damage: 3, range: 160, startup: 7, active: 5, recovery: 11, guardType: 'low' },
      kick2: { name: '하이킥', damage: 6, range: 220, startup: 13, active: 6, recovery: 19, guardType: 'high' },
      specials: [
        {
          key: 'special1', name: '모자 다량 던지기', castText: '모자 투척', type: 'projectile',
          damage: 6, projectileCount: 3, range: 999,
          startup: 14, active: 30, recovery: 20,
          gaugeCost: 35, color: '#e0c25a',
          // 필살기 연타 방지: 게이지가 차 있어도 쓰고 나면 일정 시간 재사용 불가
          cooldown: 260
        },
        {
          key: 'special2', name: '오물 뿌리기', castText: '오물 투척', type: 'burst',
          damage: 10, range: 140,
          dotDamage: 3, dotTicks: 5, dotInterval: 25,
          startup: 13, active: 8, recovery: 20,
          gaugeCost: 40, color: '#7a8b3a',
          cooldown: 320
        },
        {
          key: 'special3', name: '편의점 음식 먹고 회복', castText: 'HP회복', type: 'heal',
          healAmount: 18, damage: 0,
          startup: 20, active: 6, recovery: 14,
          gaugeCost: 35, color: '#ffd166',
          cooldown: 320
        }
      ],
      ultimate: {
        // 상대가 멀리 있어도 지속시간 내내 확실하게 맞도록 사실상 화면 전체 범위로 설정
        name: '황산 분사', castText: '신지드-모드', type: 'aura',
        // 이제 막으면 경감되긴 하지만, 안 막았을 때 총딜(7*15=105)이 세 궁극기 중
        // 가장 셌어서 6으로 낮춤 (총 90딜)
        duration: 300, tickDamage: 6, tickInterval: 20, range: 999,
        startup: 16, active: 10, recovery: 20,
        color: '#a8ff3b',
        // 변신(신지드-모드) 발동 시 소량 체력 회복
        healOnActivate: 20,
        // 발동 순간 머리 위에 한 번 뜨는 대사
        activationText: '뿡-꺾'
      }
    }
  },
  {
    id: 'gura',
    name: '김구라',
    color: '#f59e0b',
    sprite: 'assets/characters/kimgura_body_cut.png',
    // 원본 사진 자체가 왼쪽을 보고 있어서, 대기 자세(전용 포즈 사진이 없는 idle 등)에서
    // 기본 방향(오른쪽) 가정과 반대이므로 -1로 뒤집어 상대를 바라보게 보정
    spriteDir: -1,
    portrait: 'assets/characters/kimgura_face.jpg',
    portraitCropTop: false,
    poseSprites: {
      punch1: { src: 'assets/characters/gura2_punch1_full.png', dir: 1 },
      punch2: { src: 'assets/characters/gura2_punch2.png', dir: 1 },
      kick1: { src: 'assets/characters/gura2_kick1.png', dir: -1 },
      kick2: { src: 'assets/characters/gura2_kick2.png', dir: -1 },
      block: { src: 'assets/characters/gura2_block.png', dir: 1 },
      crouch: { src: 'assets/characters/gura2_crouch.png', dir: 1 },
      jump: { src: 'assets/characters/gura2_jump.png', dir: 1 },
      hitstun: { src: 'assets/characters/gura2_hit.png', dir: 1 },
      special1: { src: 'assets/characters/gura2_special1.png', dir: 1 },
      // 정치쑈 원본 사진도 왼쪽을 보고 있어서 -1로 보정
      special2: { src: 'assets/characters/gura2_special2.png', dir: -1 }
      // special3(보험사기) 원본 사진은 몸통 쪽에 사각형으로 데이터가 지워져 있어(누끼 원본부터 결손,
      // 복구 불가) 전용 포즈를 쓰지 않고 기본 스프라이트로 대체
    },
    // 궁극기(스즈키와 합체) 지속 중에는 이 이미지들로 전부 교체된다. 없는 상태는 idle로 대체.
    // 원본 사진들 전부 오토바이 앞바퀴/헤드라이트가 왼쪽을 향하고 있어서(=원본이 왼쪽을 봄)
    // 기본 스프라이트와 같은 이유로 dir을 전부 반대로(-1 기준) 보정
    ultimateForm: {
      idle: { src: 'assets/characters/gura_ult_idle.png', dir: -1 },
      punch1: { src: 'assets/characters/gura_ult_punch1.png', dir: -1 },
      punch2: { src: 'assets/characters/gura_ult_punch2.png', dir: -1 },
      kick1: { src: 'assets/characters/gura_ult_kick1.png', dir: -1 },
      // kick2 원본 사진은 다리 한쪽이 통째로 잘려서 나와 있어(누끼 원본부터 결손) 사용 불가.
      // idle로 대체하면 하이킥을 써도 아예 안 나가는 것처럼 보여서, 그나마 동작이 있는
      // kick1 사진을 재사용해 최소한의 타격 동작은 보이게 한다
      kick2: { src: 'assets/characters/gura_ult_kick1.png', dir: -1 },
      jump: { src: 'assets/characters/gura_ult_jump.png', dir: -1 },
      block: { src: 'assets/characters/gura_ult_block.png', dir: -1 }
    },
    // 다른 캐릭터들에 비해 전반적으로 약하다는 피드백으로 소폭 버프 - 체력을 살짝
    // 올리고(130 -> 145) 방어력도 약간 단단하게(defenseMult 0.9)
    hp: 145,
    defenseMult: 0.9,
    moves: {
      punch1: { name: '잽', damage: 2, range: 150, startup: 5, active: 4, recovery: 9 },
      punch2: { name: '스트레이트', damage: 5, range: 190, startup: 10, active: 5, recovery: 16 },
      kick1: { name: '로우킥', damage: 3, range: 160, startup: 7, active: 5, recovery: 11, guardType: 'low' },
      kick2: { name: '하이킥', damage: 6, range: 220, startup: 14, active: 6, recovery: 20, guardType: 'high' },
      specials: [
        {
          // 데미지 18 -> 21로 소폭 상향
          key: 'special1', name: '법의 심판', castText: '법의 심판', type: 'dash',
          damage: 21, range: 140,
          startup: 12, active: 6, recovery: 18,
          gaugeCost: 35, color: '#c9a227',
          cooldown: 260
        },
        {
          key: 'special2', name: '정치쑈', castText: '마타도어 입니다', type: 'burst', ignoreFacing: true,
          // 같은 게이지 비용(40)인 양주완의 오물 뿌리기(10+도트15=25)보다 총딜이 한참 낮았어서 상향
          damage: 16, range: 999,
          startup: 20, active: 10, recovery: 22,
          gaugeCost: 40, color: '#d63b3b',
          cooldown: 320
        },
        {
          key: 'special3', name: '보험사기', castText: '너-고소', type: 'counter',
          damage: 0, counterDamage: 30, range: 0,
          // 판정 중에 안 맞아도(상대가 안 때려도) 그냥 넘어가지 않도록,
          // "합의금"을 챙기는 개념으로 소량 회복 + 게이지 보전을 보장해준다.
          // 진짜로 반격에 성공하면 그보다 훨씬 큰 데미지+연출로 보상.
          chipHeal: 10, chipCastText: '합의금 챙김',
          startup: 10, active: 20, recovery: 20,
          gaugeCost: 35, color: '#5b7fa6',
          cooldown: 320
        }
      ],
      ultimate: {
        name: '스즈키와 합체', castText: '메카-모드', type: 'transform',
        duration: 480, dmgMult: 1.6, speedMult: 1.35,
        startup: 20, active: 10, recovery: 16,
        color: '#2b6fd6',
        // 변신(메카-모드) 발동 시 소량 체력 회복
        healOnActivate: 20
      }
    }
  },
  {
    id: 'ok',
    name: '옥킴',
    color: '#22c55e',
    sprite: 'assets/characters/ok_cut.png',
    // 전투자세 원본 사진이 이미 오른쪽(기본 방향)을 보고 있으므로 spriteDir 보정 불필요
    // (기존에 -1로 잘못 넣어놨던 게 pose 사진들과 반대 방향이라 idle<->공격 전환마다
    // 좌우가 뒤집혀 보이던 원인이었음)
    portrait: 'assets/characters/옥킴.jpg',
    portraitCropTop: false,
    poseSprites: {
      punch1: { src: 'assets/characters/ok2_punch1.png', dir: 1 },
      punch2: { src: 'assets/characters/ok2_punch2.png', dir: 1 },
      kick1: { src: 'assets/characters/ok2_kick1.png', dir: -1 },
      kick2: { src: 'assets/characters/ok2_kick2.png', dir: 1 },
      block: { src: 'assets/characters/ok2_block.png', dir: 1 },
      crouch: { src: 'assets/characters/ok2_crouch.png', dir: 1 },
      jump: { src: 'assets/characters/ok2_jump.png', dir: 1 },
      special1: { src: 'assets/characters/ok2_special1.png', dir: 1 },
      special2: { src: 'assets/characters/ok2_special2.png', dir: 1 },
      special3: { src: 'assets/characters/ok2_special3.png', dir: 1 },
      // 피자먹기(special2) 부작용으로 빠지는 무방비 상태 전용 자세. state 이름만 맞으면
      // resolveFighterSprite 의 범용 조회로 자동으로 쓰인다.
      groggy: { src: 'assets/characters/ok_groggy.png', dir: 1 }
    },
    // 궁극기(일본-좆킴) 지속 중에는 이 이미지들로 전부 교체된다. 없는 상태는 idle로 대체.
    ultimateForm: {
      idle: { src: 'assets/characters/ok_ult_idle.png', dir: -1 },
      punch1: { src: 'assets/characters/ok_ult_punch1.png', dir: 1 },
      punch2: { src: 'assets/characters/ok_ult_punch2.png', dir: 1 },
      // 로우킥 전용 사진이 idle과 동일해 정지된 것처럼 보였던 문제 - 베기(punch2) 사진을 재사용해
      // 최소한 칼을 휘두르는 동작으로는 보이게 한다
      kick1: { src: 'assets/characters/ok_ult_punch2.png', dir: 1 },
      kick2: { src: 'assets/characters/ok_ult_kick2.png', dir: -1 }
      // block(ok_ult_block.png) 원본 사진은 다리 쪽에 검은 사각형으로 데이터가 지워져 있어
      // (누끼 원본부터 결손, 복구 불가) 사용하지 않고 평상시 방어 자세(poseSprites.block)로
      // 자동 대체되게 둔다
    },
    // 예전에는 HP/기본기/궁극기 배율까지 세 캐릭터 중 전부 가장 높게 잡혀 있어서
    // 명백히 사기 캐릭터였음 - 다른 두 캐릭터 기준에 맞춰 전반적으로 하향
    hp: 130,
    moves: {
      punch1: { name: '잽', damage: 2, range: 150, startup: 5, active: 4, recovery: 8 },
      punch2: { name: '스트레이트', damage: 5, range: 190, startup: 9, active: 5, recovery: 13 },
      kick1: { name: '로우킥', damage: 3, range: 160, startup: 7, active: 5, recovery: 10, guardType: 'low' },
      kick2: { name: '하이킥', damage: 6, range: 220, startup: 13, active: 6, recovery: 17, guardType: 'high' },
      specials: [
        {
          key: 'special1', name: '샤드탑박스 던지기', castText: '샤드탑박스!', type: 'projectile',
          damage: 13, range: 999,
          startup: 14, active: 26, recovery: 20,
          gaugeCost: 50, color: '#2a2a2a', textColor: '#ffd23b',
          projectileShape: 'box', knockback: 46,
          cooldown: 300
        },
        {
          key: 'special2', name: '피자 먹기', castText: '피자먹기', type: 'heal',
          healAmount: 999, damage: 0,
          startup: 20, active: 10, recovery: 14,
          gaugeCost: 50, color: '#ffb703',
          groggyDuration: 210, groggyText: '혈당스파이크',
          // 전체 회복이 너무 자주 나오지 않도록 게이지와 별개로 15초 쿨타임을 둔다
          cooldown: 900
        },
        {
          key: 'special3', name: '옥북이 변신 돌진', castText: '갸아아악! 구와악!', type: 'dash',
          damage: 17, range: 150,
          startup: 12, active: 9, recovery: 16,
          gaugeCost: 40, color: '#3b5d3b',
          dashSpeed: 11, dashFrames: 9, returnToStart: true, unblockable: true,
          // 돌진 중 상대방과 겹쳐도 밀어내지 않고 그대로 뚫고 지나간다
          pierce: true,
          cooldown: 280
        }
      ],
      ultimate: {
        name: '일본-좆킴', castText: '일본-좆킴', type: 'transform',
        duration: 480, dmgMult: 1.65, speedMult: 1.15,
        startup: 20, active: 10, recovery: 16,
        color: '#ff2b2b', bloodOnHit: true,
        // 변신 중 공격 판정에 들어가 있을 때 맞아도 경직/넉백 없이 공격을 계속 이어간다
        hyperArmor: true,
        // 변신(일본-좆킴) 발동 시 소량 체력 회복
        healOnActivate: 20,
        // 발동 순간 머리 위에 한 번 뜨는 대사
        activationText: '역시 조선은 ♥'
      }
    }
  },
  {
    id: 'hyungjun',
    name: '안형준',
    // 캐릭터 선택 화면 카드에만 쓰는 별명 표시 (실제 대결 중 HUD 이름은 그대로 안형준)
    selectName: '골절기',
    color: '#8b5cf6',
    // 궁극기가 즉발이 아니라 스택형(게이지를 3번 채워야 최종 변신)이라 다른 캐릭터와 같은
    // 속도로 차면 한 판 안에 3스택을 다 채우기 사실상 불가능함 - 형준만 궁극기 게이지가
    // 더 빠르게 차게 보정 (1.6배 -> 2.2배로 추가 상향)
    ultGaugeMult: 2.2,
    // 아직 전용 기본 컷아웃 사진이 없어서, 정면을 보고 서 있는 막기 자세를
    // idle/walk 등 전용 포즈가 없는 상태의 기본 대체 이미지로 사용
    sprite: 'assets/characters/hyungjun_block.png',
    portrait: 'assets/characters/hyungjun_portrait.jpg',
    portraitCropTop: true,
    // 동작 사진들이 전부 오른쪽을 보고 있는 구도라 기본 방향(오른쪽)과 일치, 보정 불필요.
    // idle/walk 전용 격투자세 사진은 왼쪽을 보는 구도라 dir: -1
    poseSprites: {
      idle: { src: 'assets/characters/hyungjun_idle.png', dir: -1 },
      walk: { src: 'assets/characters/hyungjun_idle.png', dir: -1 },
      punch1: { src: 'assets/characters/hyungjun_punch1.png', dir: 1 },
      punch2: { src: 'assets/characters/hyungjun_punch2.png', dir: 1 },
      kick1: { src: 'assets/characters/hyungjun_kick1.png', dir: -1 },
      kick2: { src: 'assets/characters/hyungjun_kick2.png', dir: 1 },
      block: { src: 'assets/characters/hyungjun_block.png', dir: 1 },
      crouch: { src: 'assets/characters/hyungjun_crouch.png', dir: 1 },
      jump: { src: 'assets/characters/hyungjun_jump.png', dir: 1 },
      hitstun: { src: 'assets/characters/hyungjun_hitstun.png', dir: -1 },
      special1: { src: 'assets/characters/hyungjun_bike_throw.png', dir: -1 },
      special2: { src: 'assets/characters/hyungjun_special2_heal.png', dir: 1 },
      // 전용 그로기(숨고르기 직후 무방비 상태) 사진이 없으면 기본 스프라이트(방어 자세 사진)로
      // 대체돼서 그로기 중인데 막기 자세로 보이는 문제가 있었음 - 엎드린 회복 사진을 그대로 재사용
      groggy: { src: 'assets/characters/hyungjun_special2_heal.png', dir: 1 }
    },
    // 궁극기(마운자로 모드) 지속 중에는 이 이미지들로 전부 교체된다. 없는 상태(crouch 등)는 idle로 대체.
    ultimateForm: {
      idle: { src: 'assets/characters/hyungjun_mj_idle.png', dir: 1 },
      punch1: { src: 'assets/characters/hyungjun_mj_punch1.png', dir: 1 },
      punch2: { src: 'assets/characters/hyungjun_mj_punch2.png', dir: 1 },
      kick1: { src: 'assets/characters/hyungjun_mj_kick1.png', dir: -1 },
      kick2: { src: 'assets/characters/hyungjun_mj_kick2.png', dir: -1 },
      jump: { src: 'assets/characters/hyungjun_mj_jump.png', dir: 1 },
      block: { src: 'assets/characters/hyungjun_mj_block.png', dir: 1 },
      hitstun: { src: 'assets/characters/hyungjun_mj_hitstun.png', dir: 1 }
    },
    // 마운자로 모드가 끝난 뒤 이어지는 요요현상(10초) 동안 이 이미지들로 교체된다.
    // 전용 block 사진은 없어서 그쪽만 punch1 사진으로 대체
    yoyoForm: {
      idle: { src: 'assets/characters/hyungjun_yy_idle.png', dir: -1 },
      punch1: { src: 'assets/characters/hyungjun_yy_punch1.png', dir: 1 },
      punch2: { src: 'assets/characters/hyungjun_yy_punch2.png', dir: 1 },
      kick1: { src: 'assets/characters/hyungjun_yy_kick1.png', dir: 1 },
      kick2: { src: 'assets/characters/hyungjun_yy_kick2.png', dir: -1 },
      jump: { src: 'assets/characters/hyungjun_yy_jump.png', dir: 1 },
      crouch: { src: 'assets/characters/hyungjun_yy_crouch.png', dir: 1 },
      hitstun: { src: 'assets/characters/hyungjun_yy_hitstun.png', dir: 1 }
    },
    // 궁극기(꿈1/꿈2 스택)가 3스택에 도달해 "빛의용사 형준" 모드로 변신하면 쓰이는 전용 이미지.
    // walk/jump/crouch/hitstun 전용 사진은 없어서(기본자세+공격/막기 5장만 받음), resolveFighterSprite가
    // 자동으로 idle 사진으로 대체해서 보여준다 (나중에 추가 사진이 오면 그때 채우면 됨)
    lightForm: {
      // 기본자세 사진은 다른 공격/막기 사진들과 달리 원본이 왼쪽을 보고 있어서 dir: -1로 보정
      // (그대로 두면 대기<->공격 전환마다 좌우가 뒤집혀 보이는 버그가 있었음)
      idle: { src: 'assets/characters/hyungjun_light_idle.png', dir: -1 },
      punch1: { src: 'assets/characters/hyungjun_light_thrust.png', dir: 1 },
      punch2: { src: 'assets/characters/hyungjun_light_swing_a.png', dir: 1 },
      kick1: { src: 'assets/characters/hyungjun_light_sprawl.png', dir: 1 },
      kick2: { src: 'assets/characters/hyungjun_light_swing_b.png', dir: 1 },
      block: { src: 'assets/characters/hyungjun_light_blocks.png', dir: 1 },
      // 빛의용사 형준 모드 중 궁극기(Space)를 다시 쓰면 나가는 즉사기(궁극포) 전용 시전 자세 -
      // 좌우가 반대로 나온다는 피드백으로 방향(dir) 반전
      ultimate: { src: 'assets/characters/hyungjun_light_cannon_pose.png', dir: -1 }
    },
    hp: 130,
    moves: {
      // 기본기(잽/스트레이트/로우킥/하이킥) 수치는 다른 캐릭터들과 동일하게 맞춤
      punch1: { name: '잽', damage: 2, range: 150, startup: 5, active: 4, recovery: 9 },
      punch2: { name: '스트레이트', damage: 5, range: 190, startup: 9, active: 5, recovery: 15 },
      kick1: { name: '로우킥', damage: 3, range: 160, startup: 7, active: 5, recovery: 11, guardType: 'low' },
      kick2: { name: '하이킥', damage: 6, range: 220, startup: 13, active: 6, recovery: 19, guardType: 'high' },
      specials: [
        {
          // 안형준은 그 자리에서 "내 골드윙 돌아와~" 하며 부르는 동작만 하고,
          // 골드윙이 혼자 날아가서 상대를 들이받는(맞아도 안 멈추고 계속 뚫고 날아감) 스킬.
          // armor: 부르는 동작 중 몇 대 맞아도 끊기지 않도록(피드백 반영)
          key: 'special1', name: '골드윙 돌진', castText: '내 골드윙 돌아와~', type: 'projectile',
          // 데미지 20 -> 16 하향 (형준 전반적인 데미지가 세다는 피드백 반영)
          damage: 16,
          startup: 14, active: 10, recovery: 20,
          gaugeCost: 40, color: '#22543d',
          cooldown: 320,
          armor: true, unblockable: true, pierce: true, knockback: 32,
          projectileShape: 'sprite', projectileImage: 'assets/characters/hyungjun_bike_solo.png',
          projectileWidth: 240, projectileSpeed: 15, projectileLife: 75
        },
        {
          // 힘들어서 잠깐 엎드려 숨고르는 회복기. "낑,,낑" 앓는 소리를 내며 체력 35% 회복.
          // 회복 즉시 잠깐(80프레임≈1.3초) 그로기 상태가 되어 무방비해지는 대가가 있다.
          // (예전엔 시전 중 맞아도 안 풀리는 armor가 있었는데, 무적 회복기가 너무 후하다는
          // 피드백으로 제거 - 이제 시전 중 맞으면 다른 필살기처럼 그냥 끊긴다)
          key: 'special2', name: '숨고르기', castText: '낑,,낑', type: 'heal',
          healAmount: 35, damage: 0,
          startup: 18, active: 8, recovery: 16,
          gaugeCost: 35, color: '#ffb703',
          groggyDuration: 80, groggyText: '낑낑...',
          cooldown: 420
        },
        {
          // 마운자로(비만치료제) 맞고 뼈밖에 안 남을 정도로 급격히 마른 상태가 되는 컨셉.
          // 원래는 궁극기였다가 필살기3으로 이동 - 근력은 확 빠졌지만(데미지 1/3) 대신
          // 미친듯이 날렵해짐(이동속도 2.5배, 공격속도 1.6배)
          key: 'special3', name: '마운자로 모드', castText: '마운자로!', type: 'transform',
          // 지속시간 7.2초 -> 5초로 재조정 (300프레임)
          // 데미지 배율 1/3 -> 1/4로 추가 하향 (마운자로 모드 데미지가 세다는 피드백 반영)
          duration: 300, dmgMult: 1 / 4, speedMult: 2.5, atkSpeedMult: 1.6,
          startup: 20, active: 10, recovery: 16,
          gaugeCost: 50, color: '#ff3b6b',
          // 쿨타임 600 -> 900으로 늘림 (변신 지속시간 300 + 요요현상 360 = 660보다 넉넉하게 길게
          // 잡아서, 이전 요요현상이 채 안 끝난 상태로 재시전할 수 있는 상황 자체를 줄임)
          cooldown: 900,
          // 마운자로 모드가 끝나면 자동으로 이어지는 요요현상: 원래보다 더 부풀어서
          // 데미지는 세지지만, 몸이 무거워져서 이동속도/공격속도 둘 다 2.5배 느려진다.
          // 지속시간 10초 -> 6초로 재조정 (360프레임)
          // (예전 데미지 2배 -> 1.5배로 하향했다가, 형준 전반 데미지 너프 피드백으로 1.3배로 재하향)
          yoyo: {
            duration: 360, dmgMult: 1.3, speedMult: 1 / 2.5, atkSpeedMult: 1 / 2.5,
            text: '요요현상...', color: '#e07b1a'
          }
        }
      ],
      // 궁극기는 즉발이 아니라 스택형: 게이지가 찰 때마다(총 3번) 한 번씩 써야 하고,
      // 1/2번째는 "꿈1"/"꿈2"(예전 오토바이 여행 사진) 회상 연출만 나올 뿐 아무 효과가 없다.
      // 3번째(마지막 스택)에서만 실제로 "빛의용사 형준" 모드로 변신한다.
      ultimate: {
        // 궁극기 버튼 표시 이름은 그냥 "궁극기"로 고정 (스택을 쌓아도 바뀌지 않음,
        // 빛의용사 형준 모드일 때만 HUD에서 "초궁극기"로 별도 표시됨)
        name: '궁극기', castText: '...', type: 'stackTransform',
        startup: 16, active: 6, recovery: 14,
        color: '#ffd23b',
        stacks: [
          { name: '꿈1', castText: '꿈(1스택)', color: '#7fd9ff', image: 'assets/characters/hyungjun_dream1.png' },
          { name: '꿈2', castText: '꿈(2스택)', color: '#ff9ecf', image: 'assets/characters/hyungjun_dream2.png' }
        ],
        finalForm: {
          // 빛의용사 형준: 날아다니며 싸우는 최종 변신. 공격력/방어력 전부 큰 폭으로 강화되고,
          // 막기에 성공하면 아예 대미지가 들어가지 않는다(카운터). 전용 공격/막기 사진 4장 사용.
          // 변신 순간 체력을 완전히 회복하고(fullHealOnActivate), 방어력도 더 단단해짐(0.6 -> 0.45)
          name: '빛의용사 형준', castText: '빛의용사 형준', type: 'transform', visualForm: 'lightForm',
          // 데미지 배율 1.8 -> 1.5로 하향 (형준 전반 데미지 너프 피드백 반영)
          // 지속시간 480 -> 720으로 연장
          duration: 720, dmgMult: 1.5, speedMult: 1.2, atkSpeedMult: 1.15, defenseMult: 0.45,
          blockNoDamage: true, canFly: true, fullHealOnActivate: true,
          // 빛의용사 형준 모드 중에는 마운자로(특3)를 다시 못 쓰게 막아서, 실수로 변신이
          // 풀리는(마운자로가 자기 자신을 새 변신으로 덮어써버리는) 상황을 원천 차단
          lockedMoves: ['special3'],
          // 타격 성공 시 하양/노랑이 섞인 화려한 이펙트가 나오도록
          hitEffectColor: '#ffffff', hitEffectColor2: '#ffe066',
          color: '#ffe08a',
          // 빛의용사 형준 상태에서 궁극기(Space)를 또 쓰면 나가는 필살의 마무리기.
          // 필살기1(골드윙 돌진)과 같은 방식 - 시전 자세만 취하고 투사체가 혼자 날아가
          // 상대를 관통한다. 맞으면 사실상 즉사(데미지 999) + 막기 불가.
          followUp: {
            key: 'ultimate', name: '궁극포', castText: '할카스포', type: 'projectile',
            damage: 999, faceOpponentOnCast: true,
            startup: 20, active: 12, recovery: 24,
            color: '#3bd6ff',
            // 즉사기라 텍스트를 더 크게 강조 표시
            bannerBig: true,
            unblockable: true, pierce: true, knockback: 46,
            // 투사체 자체가 사진(sprite)이라 원래도 빙글빙글 돌지 않고 일직선으로만 날아감(회전 없음).
            // 아주 천천히 날아가게(속도 18 -> 5) 하고, 점프로 넘어가면(50 이상 높이) 피할 수 있게 함 -
            // 대신 느려진 만큼 화면을 완전히 가로지를 때까지 살아있도록 지속시간을 넉넉히 늘림
            jumpDodge: true, jumpDodgeHeight: 50,
            projectileShape: 'sprite', projectileImage: 'assets/characters/hyungjun_light_cannon_projectile.png',
            projectileWidth: 150, projectileSpeed: 5, projectileLife: 220
          }
        }
      }
    }
  },
  {
    id: 'mac',
    name: '맥',
    // 맥은 일반 캐릭터 선택 목록/랜덤 풀/CPU 상대 풀에 안 나오는 전용 보스 - 오직
    // "맥에게 도전" 카드를 통해서만(항상 CPU로) 만날 수 있다
    hidden: true,
    color: '#dc2626',
    // 전용 포즈 사진들이 전부 있어서 기본 스프라이트는 사실상 idle의 대체용으로만 쓰임
    sprite: 'assets/characters/mac_idle.png',
    spriteDir: 1,
    portrait: 'assets/characters/mac_challenge.jpg',
    portraitCropTop: true,
    poseSprites: {
      // 실제 플레이 화면에서 계속 반대로 보인다는 피드백이 반복돼서, 판단 대신
      // 그냥 반전(dir)을 뒤집음 - 대기/걷기/막기가 전부 이 사진 하나를 같이 씀
      idle: { src: 'assets/characters/mac_idle.png', dir: 1 },
      walk: { src: 'assets/characters/mac_idle.png', dir: 1 },
      // 전용 막기 사진이 없어서 기본 가드 자세(idle)로 대체
      block: { src: 'assets/characters/mac_idle.png', dir: 1 },
      punch1: { src: 'assets/characters/mac_punch1.png', dir: -1 },
      punch2: { src: 'assets/characters/mac_punch2.png', dir: -1 },
      kick1: { src: 'assets/characters/mac_kick1.png', dir: -1 },
      kick2: { src: 'assets/characters/mac_kick2.png', dir: 1 },
      jump: { src: 'assets/characters/mac_jump.png', dir: -1 },
      crouch: { src: 'assets/characters/mac_crouch.png', dir: -1 },
      hitstun: { src: 'assets/characters/mac_hitstun.png', dir: 1 },
      // 필살기1은 전용 사진이 없어서 기존 사진 중 느낌이 맞는 걸 재사용
      special1: { src: 'assets/characters/mac_punch1.png', dir: -1 },
      // 총장 소환(마법진 캐스팅 포즈)
      special2: { src: 'assets/characters/mac_special2_summon.png', dir: -1 },
      // 입-벌구(발사체를 가리키며 시전하는 포즈)
      special3: { src: 'assets/characters/mac_special3_seal.png', dir: 1 }
    },
    // 궁극기(라이더 모드) 지속 중에는 이 이미지들로 전부 교체된다. block/hitstun 등
    // 전용 사진이 없는 상태는 resolveFighterSprite가 idle로 자동 대체한다.
    // special2/special3는 라이더 모드 중 전용 시전 사진(총장 소환/입-벌구)으로 따로 교체된다
    riderForm: {
      // 실제 플레이 화면에서 계속 반대로 보인다는 피드백이 반복돼서, 판단 대신 반전(dir)을 뒤집음
      idle: { src: 'assets/characters/mac_rider_idle.png', dir: -1 },
      // 대기 자세는 정상인데 걷기만 반대로 보인다는 피드백 - 같은 사진을 걷기 상태 전용으로
      // 한 번 더 넣어서 idle과 반대 방향(dir)으로 표시되게 함
      walk: { src: 'assets/characters/mac_rider_idle.png', dir: 1 },
      // 펀치(잽/스트레이트 공용) 사진은 주먹이 오른쪽으로 뻗어 있어 dir: 1
      punch1: { src: 'assets/characters/mac_rider_punch1.png', dir: 1 },
      punch2: { src: 'assets/characters/mac_rider_punch2.png', dir: 1 },
      // 로우킥은 다리가 오른쪽으로 뻗는 사진으로, 하이킥은 다리가 왼쪽으로 뻗는 사진으로 배정
      kick1: { src: 'assets/characters/mac_rider_kick1.png', dir: 1 },
      kick2: { src: 'assets/characters/mac_rider_kick2.png', dir: -1 },
      // 막기 전용 사진이 없어서 가드 자세에 가까운 사진으로 대체
      block: { src: 'assets/characters/mac_rider_block.png', dir: 1 },
      // 점프/앉기 사진도 idle과 같은 촬영분이라 함께 반전
      jump: { src: 'assets/characters/mac_rider_jump.png', dir: -1 },
      crouch: { src: 'assets/characters/mac_rider_crouch.png', dir: -1 },
      // 총장 소환(마법진 대신 오토바이 홀로그램을 부르는 포즈) - 손이 오른쪽으로 뻗어있어 dir: 1
      special2: { src: 'assets/characters/mac_rider_summon.png', dir: 1 },
      // 입-벌구(오른쪽을 가리키는 포즈) - dir: 1
      special3: { src: 'assets/characters/mac_rider_seal.png', dir: 1 },
      // 피격(맞고 움츠러드는 자세) - 앞다리(왼쪽)를 축으로 웅크려서 기존 맥 피격 사진과
      // 같은 다리 배치라 동일하게 dir: 1
      hitstun: { src: 'assets/characters/mac_rider_hitstun.png', dir: 1 }
    },
    // 2페이즈("철거오야지 맥") - 처음 체력이 0이 되는 순간 KO 대신 이 설정으로 부활한다.
    // 시간제 변신이 아니라 이번 판이 끝날 때까지 계속 유지되며, 딱 한 번만 발동된다
    // (main.js의 triggerPhase2Revival 참고). 궁극기는 이미 다 쓴 걸로 치고 이 모드
    // 동안에는 아예 못 쓰게 막는다(main.js tryStartAction의 phase2Active 체크)
    phase2: {
      castText: '철거오야지 맥(페이즈2)', color: '#eab308',
      bannerSlowFade: true, bannerFadeFrames: 300,
      lockUltimate: true,
      // 2페이즈 지속 중 약 2.5초(150프레임)마다 대사가 떠오른다 (배너 색과 달리 빨간색으로 표시)
      periodicText: '형들 패고 시마이 치자..', periodicTextInterval: 150, periodicTextColor: '#ff3b3b'
    },
    phase2Form: {
      // 대기/걷기/막기는 빠루를 방어적으로 든 자세 하나를 같이 씀 - 얼굴이 오른쪽을 보고 있어 dir: 1
      idle: { src: 'assets/characters/mac_phase2_idle.png', dir: 1 },
      walk: { src: 'assets/characters/mac_phase2_idle.png', dir: 1 },
      block: { src: 'assets/characters/mac_phase2_idle.png', dir: 1 },
      // 빠루를 위에서 내려찍는 스윙 두 종류를 잽/스트레이트에 배정
      punch1: { src: 'assets/characters/mac_phase2_punch1.png', dir: 1 },
      punch2: { src: 'assets/characters/mac_phase2_punch2.png', dir: -1 },
      // 넓게 휘두르는 스윙(일본좆킴모드와 유사) 하나를 로우킥/하이킥 공용으로 사용
      kick1: { src: 'assets/characters/mac_phase2_kick.png', dir: -1 },
      kick2: { src: 'assets/characters/mac_phase2_kick.png', dir: -1 },
      crouch: { src: 'assets/characters/mac_phase2_crouch.png', dir: 1 },
      jump: { src: 'assets/characters/mac_phase2_jump.png', dir: -1 },
      hitstun: { src: 'assets/characters/mac_phase2_hitstun.png', dir: -1 }
    },
    // 보스몹답게 다른 캐릭터(130)보다 체력이 훨씬 많고(260 -> 320), 맞아도 대미지가
    // 덜 들어가며(방어력 0.65 -> 0.55), 이동속도도 기본적으로 더 빠르다.
    // 맞아도 계속 얻어맞고만 있지 않도록 히트스턴도 다른 캐릭터의 절반만 받는다
    // 공격속도는 너무 세다는 피드백으로 1.15 -> 1.05로 너프 (그래도 보스는 보스답게 유지)
    hp: 320,
    defenseMult: 0.55,
    speedMult: 1.15,
    atkSpeedMult: 1.05,
    hitstunMult: 0.5,
    moves: {
      punch1: { name: '잽', damage: 2, range: 150, startup: 5, active: 4, recovery: 9 },
      punch2: { name: '스트레이트', damage: 5, range: 190, startup: 9, active: 5, recovery: 15 },
      kick1: { name: '로우킥', damage: 3, range: 160, startup: 7, active: 5, recovery: 11, guardType: 'low' },
      kick2: { name: '하이킥', damage: 6, range: 220, startup: 13, active: 6, recovery: 19, guardType: 'high' },
      specials: [
        {
          // 피규어 토템 - 소품(오토바이)이 맥 뒤쪽 하늘에서 떨어져 10초간 토템처럼 서 있으며,
          // 그동안 맥에게만 HP회복 + 공격력/이동속도/공격속도 증가 + 방어력 강화 버프를 준다.
          // 3번 맞거나 지속시간이 다 되면 사라진다 (main.js의 'totem' 타입 처리 참고)
          key: 'special1', name: '피규어 토템', castText: '피규어 토템', type: 'totem',
          damage: 0, faceOpponentOnCast: true,
          totemImage: 'assets/characters/mac_totem_ducati.png',
          // 지속시간 10초 -> 15초로 연장 (900프레임), 기본 공격 3번으로 부술 수 있는 내구도는 유지
          totemDuration: 900, totemHits: 3,
          totemDmgMult: 1.3, totemSpeedMult: 1.25, totemAtkSpeedMult: 1.2, totemDefenseMult: 0.8,
          // HP 회복량이 너무 세다는 피드백으로 초당 6 -> 초당 3으로 너프 (원래 값으로 복귀)
          totemHealPerTick: 3, totemHealInterval: 60,
          totemBuffText: 'HP,이속,공속,방어력 증가',
          startup: 16, active: 8, recovery: 16,
          gaugeCost: 40, color: '#dc2626',
          cooldown: 480
        },
        {
          // 총장(양주완) 소환 - 지속시간 동안 소환수가 상대를 주기적으로 공격한다.
          // 소환수 체력은 양주완 실제 최대체력의 35%만 (summonHpRatio) - 화면에 초록 체력바로 표시
          key: 'special2', name: '총장 소환', castText: '총장 소환', type: 'summon',
          damage: 0, faceOpponentOnCast: true,
          summonId: 'yang', summonHpRatio: 0.35, summonDuration: 320,
          tickDamage: 5, tickInterval: 40,
          startup: 22, active: 10, recovery: 20,
          gaugeCost: 45, color: '#fbbf24',
          cooldown: 520
        },
        {
          // 입-벌구 - 대미지는 없는 아주 느린 투사체. 맞으면 상대의 필살기/궁극기 중
          // 하나가 23초(1380프레임, 기존 20초에서 살짝 버프)간 봉인된다
          // (자물쇠 표시, applyHit의 sealOnHit 처리)
          key: 'special3', name: '입-벌구', castText: '입-벌구', type: 'projectile',
          damage: 0, unblockable: true, faceOpponentOnCast: true,
          sealOnHit: true, sealDuration: 1380,
          startup: 18, active: 10, recovery: 22,
          gaugeCost: 40, color: '#a855f7',
          projectileShape: 'orb', projectileSpeed: 4, projectileLife: 240,
          // 너무 자주 나온다는 피드백으로 쿨타임 420(7초) -> 600(10초)으로 늘림
          cooldown: 600
        }
      ],
      // 라이더 모드 - 라이더 슈트(헬멧+재킷) 차림으로 변신해 60초간 싸운다. 지속시간 내내
      // 기본기/필살기2(총장 소환)/필살기3(입-벌구)의 모습이 전부 라이더 전용 사진(riderForm)으로
      // 바뀐다. 시전 즉시 상대를 정확히 바라보도록(faceOpponentOnCast) 하고, 텍스트도 뚝
      // 끊기지 않고 서서히 사라지게(bannerSlowFade) 한다
      ultimate: {
        name: '라이더 모드', castText: '진짜 라이더 맥(페이즈1)', type: 'transform', visualForm: 'riderForm',
        faceOpponentOnCast: true,
        // 문구가 길어서 bannerBig(96px)을 쓰면 화면 밖으로 잘려 나가므로 기본 크기(64px) 유지
        bannerSlowFade: true, bannerFadeFrames: 300,
        duration: 3600, // 60초
        dmgMult: 1.25, speedMult: 1.1, atkSpeedMult: 1.15, defenseMult: 0.85,
        startup: 16, active: 10, recovery: 20,
        color: '#ff3b3b',
        // 변신(라이더 모드) 발동 시 소량 체력 회복
        healOnActivate: 25,
        // 라이더 모드 지속 중 약 2.5초(150프레임)마다 대사가 떠오른다
        periodicText: '형들 뚜드려패주마..', periodicTextInterval: 150
      }
    }
  }
];
