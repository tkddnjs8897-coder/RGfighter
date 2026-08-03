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
    hp: 100,
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
          gaugeCost: 35, color: '#e0c25a'
        },
        {
          key: 'special2', name: '오물 뿌리기', castText: '오물 투척', type: 'burst',
          damage: 10, range: 140,
          dotDamage: 3, dotTicks: 5, dotInterval: 25,
          startup: 13, active: 8, recovery: 20,
          gaugeCost: 40, color: '#7a8b3a'
        },
        {
          key: 'special3', name: '편의점 음식 먹고 회복', castText: 'HP회복', type: 'heal',
          healAmount: 18, damage: 0,
          startup: 20, active: 6, recovery: 14,
          gaugeCost: 35, color: '#ffd166'
        }
      ],
      ultimate: {
        // 상대가 멀리 있어도 지속시간 내내 확실하게 맞도록 사실상 화면 전체 범위로 설정
        name: '황산 분사', castText: '신지드-모드', type: 'aura',
        duration: 300, tickDamage: 7, tickInterval: 20, range: 999,
        startup: 16, active: 10, recovery: 20,
        color: '#a8ff3b'
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
      // 정치쑈/보험사기 원본 사진도 왼쪽을 보고 있어서(보험사기는 왼쪽을 손가락질하는 포즈) -1로 보정
      special2: { src: 'assets/characters/gura2_special2.png', dir: -1 },
      special3: { src: 'assets/characters/gura2_special3.png', dir: -1 }
    },
    // 궁극기(스즈키와 합체) 지속 중에는 이 이미지들로 전부 교체된다. 없는 상태는 idle로 대체.
    // 원본 사진들 전부 오토바이 앞바퀴/헤드라이트가 왼쪽을 향하고 있어서(=원본이 왼쪽을 봄)
    // 기본 스프라이트와 같은 이유로 dir을 전부 반대로(-1 기준) 보정
    ultimateForm: {
      idle: { src: 'assets/characters/gura_ult_idle.png', dir: -1 },
      punch1: { src: 'assets/characters/gura_ult_punch1.png', dir: -1 },
      punch2: { src: 'assets/characters/gura_ult_punch2.png', dir: -1 },
      kick1: { src: 'assets/characters/gura_ult_kick1.png', dir: -1 },
      kick2: { src: 'assets/characters/gura_ult_kick2.png', dir: 1 },
      jump: { src: 'assets/characters/gura_ult_jump.png', dir: -1 },
      block: { src: 'assets/characters/gura_ult_block.png', dir: -1 }
    },
    hp: 100,
    moves: {
      punch1: { name: '잽', damage: 2, range: 150, startup: 5, active: 4, recovery: 9 },
      punch2: { name: '스트레이트', damage: 5, range: 190, startup: 10, active: 5, recovery: 16 },
      kick1: { name: '로우킥', damage: 3, range: 160, startup: 7, active: 5, recovery: 11, guardType: 'low' },
      kick2: { name: '하이킥', damage: 6, range: 220, startup: 14, active: 6, recovery: 20, guardType: 'high' },
      specials: [
        {
          key: 'special1', name: '법의 심판', castText: '법의 심판', type: 'dash',
          damage: 18, range: 140,
          startup: 12, active: 6, recovery: 18,
          gaugeCost: 35, color: '#c9a227'
        },
        {
          key: 'special2', name: '정치쑈', castText: '마타도어 입니다', type: 'burst', ignoreFacing: true,
          damage: 14, range: 999,
          startup: 20, active: 10, recovery: 22,
          gaugeCost: 40, color: '#d63b3b'
        },
        {
          key: 'special3', name: '보험사기', castText: '너-고소', type: 'counter',
          damage: 0, counterDamage: 24, range: 0,
          startup: 10, active: 16, recovery: 20,
          gaugeCost: 35, color: '#5b7fa6'
        }
      ],
      ultimate: {
        name: '스즈키와 합체', castText: '메카-모드', type: 'transform',
        duration: 480, dmgMult: 1.6, speedMult: 1.35,
        startup: 20, active: 10, recovery: 16,
        color: '#2b6fd6'
      }
    }
  }
];
