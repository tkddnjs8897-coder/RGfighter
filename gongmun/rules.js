/*
 * 공문서 작성 규칙 검사기
 * 기준: 「행정업무운영 편람」의 기안문 작성 방법, 「한글 맞춤법」 띄어쓰기·문장부호 규정,
 *       국립국어원 공공언어 다듬은 말.
 * 브라우저(window.GongmunRules)와 Node(require) 양쪽에서 쓸 수 있습니다.
 */
(function (root) {
  'use strict';

  // ───────────────────────── 항목 기호 ─────────────────────────
  const HAN = '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허'.split('');
  const HAN_CLASS = '[' + HAN.join('') + ']';
  const han = n => HAN[n - 1] || String(n);
  const circledNum = n => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : '(' + n + ')');
  const circledHan = n => (n >= 1 && n <= 14 ? String.fromCharCode(0x326e + n - 1) : '(' + han(n) + ')');

  // 편람: 1. → 가. → 1) → 가) → (1) → (가) → ① → ㉮
  const MARKER_GEN = [
    null,
    n => n + '.',
    n => han(n) + '.',
    n => n + ')',
    n => han(n) + ')',
    n => '(' + n + ')',
    n => '(' + han(n) + ')',
    circledNum,
    circledHan,
  ];
  const LEVEL_EXAMPLE = ['', '1.', '가.', '1)', '가)', '(1)', '(가)', '①', '㉮'];

  const MARKER_RE = [
    { level: 5, re: /^\((\d{1,2})\)/ },
    { level: 6, re: new RegExp('^\\((' + HAN_CLASS + ')\\)') },
    { level: 1, re: /^(\d{1,2})\.(?!\d)/ },
    { level: 2, re: new RegExp('^(' + HAN_CLASS + ')\\.') },
    { level: 3, re: /^(\d{1,2})\)/ },
    { level: 4, re: new RegExp('^(' + HAN_CLASS + ')\\)') },
    { level: 7, re: /^([①-⑳])/ },
    { level: 8, re: /^([㉮-㉻])/ },
  ];
  // 필요할 때 쓰는 특수 기호(□, ○, -, ·). 번호를 매기지 않고 들여쓰기만 맞춥니다.
  const BULLET_RE = /^([□■○●◦\-–*•·ㆍ])[ \t　]+/;
  const BULLET_NORMAL = { '■': '□', '●': '○', '◦': '○', '–': '-', '*': '-', '•': '-', 'ㆍ': '·' };


  function parseLine(raw) {
    const indent = raw.match(/^[ \t　]*/)[0].length;
    const rest = raw.slice(indent);
    for (const m of MARKER_RE) {
      const mm = rest.match(m.re);
      if (!mm) continue;
      const after = rest.slice(mm[0].length);
      const sp = after.match(/^[ \t　]*/)[0];
      return {
        kind: 'item',
        level: m.level,
        marker: mm[0],
        spacing: sp,
        markerStart: indent,
        markerEnd: indent + mm[0].length + sp.length,
        content: after.slice(sp.length).replace(/[ \t　]+$/, ''),
      };
    }
    const b = rest.match(BULLET_RE);
    if (b) {
      return {
        kind: 'bullet',
        marker: BULLET_NORMAL[b[1]] || b[1],
        markerStart: indent,
        markerEnd: indent + b[0].length,
        content: rest.slice(b[0].length).replace(/[ \t　]+$/, ''),
      };
    }
    if (!rest.trim()) return { kind: 'blank' };
    return { kind: 'text', content: rest.replace(/[ \t　]+$/, '') };
  }

  // ───────────────────────── 글자 폭 ─────────────────────────
  // 한글 글꼴 기준: 한글·한자·전각 기호는 2타, 영문·숫자·반각 기호는 1타
  const WIDE_RE = /[ᄀ-ᇿ①-⓿■-◿　-〿㄰-㆏㈀-㋿가-힣一-鿿＀-￯·]/;
  const textWidth = s => [...s].reduce((w, ch) => w + (WIDE_RE.test(ch) ? 2 : 1), 0);

  // ───────────────────────── 날짜 ─────────────────────────
  const WEEK = '일월화수목금토';
  function weekdayOf(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return WEEK[dt.getUTCDay()];
  }
  const validDate = (y, m, d) => weekdayOf(+y, +m, +d) !== null;
  const pad2 = n => String(n).padStart(2, '0');

  // 받침 검사
  const jong = ch => {
    const c = ch.charCodeAt(0);
    return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : -1;
  };
  const hasRieul = ch => jong(ch) === 8; // ㄹ
  const hasNieunOrRieul = ch => jong(ch) === 4 || jong(ch) === 8;

  // ───────────────────────── 텍스트 규칙 ─────────────────────────
  // fix(match) → 바꿀 문자열 (null이면 이 경우는 건너뜀). 원문과 같으면 문제 없음.
  // bulk: false 이면 '전체 수정'에서 제외(사람이 판단해야 하는 항목).
  const B = '(?<![가-힣A-Za-z0-9])'; // 단어 시작 경계

  const TEXT_RULES = [
    // ── 표기: 날짜·시간·숫자 ──
    {
      cat: '표기', sev: 'error',
      re: /(\d{4})[ \t]*년[ \t]*(\d{1,2})[ \t]*월[ \t]*(\d{1,2})[ \t]*일/g,
      fix: m => (validDate(m[1], m[2], m[3]) ? `${+m[1]}. ${+m[2]}. ${+m[3]}.` : null),
      msg: () => "날짜는 연·월·일 글자를 생략하고 온점(.)으로 표시합니다. 예) 2026. 9. 28.",
    },
    {
      cat: '표기', sev: 'error',
      re: /(?<![\d.])(\d{4})[ \t]*([.\-/])[ \t]*(\d{1,2})[ \t]*\2[ \t]*(\d{1,2})(?!\d)\.?/g,
      fix: m => (validDate(m[1], m[3], m[4]) ? `${+m[1]}. ${+m[3]}. ${+m[4]}.` : null),
      msg: () => "날짜는 '2026. 9. 28.'처럼 숫자 뒤마다 온점을 찍고 한 칸 띄우며, 앞의 0은 쓰지 않습니다.",
    },
    {
      cat: '표기', sev: 'error', bulk: false,
      re: /(\d{4})(?:[ \t]*년[ \t]*|[ \t]*[.\-/][ \t]*)(\d{1,2})(?:[ \t]*월[ \t]*|[ \t]*[.\-/][ \t]*)(\d{1,2})(?:[ \t]*일|\.)?([ \t]*\(([월화수목금토일])(?:요일)?\))/g,
      range: m => {
        const start = m.index + m[0].length - m[4].length;
        return [start, start + m[4].length];
      },
      fix: m => {
        const wd = weekdayOf(+m[1], +m[2], +m[3]);
        return wd ? `(${wd})` : null;
      },
      msg: m => {
        const wd = weekdayOf(+m[1], +m[2], +m[3]);
        if (wd && wd !== m[5]) return `요일이 틀렸습니다. ${+m[1]}. ${+m[2]}. ${+m[3]}.은 ${wd}요일입니다. 날짜가 맞는지도 확인하세요.`;
        return "요일은 날짜 바로 뒤에 붙여 '(월)'처럼 한 글자로 씁니다.";
      },
      sevOf: m => (weekdayOf(+m[1], +m[2], +m[3]) !== m[5] ? 'error' : 'warn'),
    },
    {
      cat: '표기', sev: 'error',
      re: /(오전|오후)[ \t]*(\d{1,2})[ \t]*시(?!간)(?:[ \t]*(\d{1,2})[ \t]*분|[ \t]*(반))?/g,
      fix: m => {
        let h = +m[2];
        if (h > 12) return null;
        if (m[1] === '오후' && h < 12) h += 12;
        if (m[1] === '오전' && h === 12) h = 0;
        const min = m[4] ? 30 : m[3] ? +m[3] : 0;
        if (min > 59) return null;
        return `${pad2(h)}:${pad2(min)}`;
      },
      msg: () => "시간은 24시각제로 쓰고 시·분 사이에 쌍점(:)을 찍습니다. 예) 14:30",
    },
    {
      cat: '표기', sev: 'error',
      re: /(?<![\d:])(\d{1,2})[ \t]*시[ \t]*(\d{1,2})[ \t]*분/g,
      fix: m => (+m[1] <= 24 && +m[2] <= 59 ? `${pad2(m[1])}:${pad2(m[2])}` : null),
      msg: () => "시간은 '14:30'처럼 시·분 글자 대신 쌍점(:)으로 씁니다.",
    },
    {
      cat: '표기', sev: 'warn',
      re: /(?<![\d:오전후])(1[3-9]|2[0-4])[ \t]*시(?!간|[ \t]*\d)/g,
      fix: m => `${m[1]}:00`,
      msg: () => "시간은 '14:00'처럼 24시각제와 쌍점(:)으로 씁니다.",
    },
    {
      cat: '표기', sev: 'warn',
      re: /(?<![\d,.])(\d{4,})(?=[ \t]*(?:원|천원|만원|백만원|억원))/g,
      fix: m => Number(m[1]).toLocaleString('en-US'),
      msg: () => '금액은 세 자리마다 쉼표(,)를 찍습니다.',
    },

    // ── 문장부호 ──
    {
      cat: '문장부호', sev: 'warn',
      re: /([가-힣A-Za-z)\]])[ \t]*:[ \t]*(?=[^\s/])/g,
      fix: m => `${m[1]}: `,
      msg: () => "쌍점(:)은 앞말에 붙여 쓰고 뒤는 한 칸 띄웁니다. 예) 관련: ○○과-123",
    },
    {
      cat: '문장부호', sev: 'warn',
      re: /[ \t]+,/g,
      fix: () => ',',
      msg: () => '쉼표(,) 앞은 띄우지 않습니다.',
    },
    {
      cat: '문장부호', sev: 'warn',
      re: /,(?=[^\s\d,)\]'"”’])/g,
      fix: () => ', ',
      msg: () => '쉼표(,) 뒤는 한 칸 띄웁니다.',
    },
    {
      cat: '문장부호', sev: 'warn',
      re: /\([ \t]+|[ \t]+\)/g,
      fix: m => m[0].trim(),
      msg: () => '괄호 안쪽은 띄우지 않습니다.',
    },

    // ── 띄어쓰기 ──
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /(?<=\S)(?<!붙임)[ \t]{2,}(?=\S)(?!끝)/g,
      fix: () => ' ',
      msg: () => '낱말 사이는 한 칸만 띄웁니다.',
    },
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /([가-힣A-Za-z0-9)])?및([가-힣A-Za-z0-9(])?/g,
      fix: m => (m[1] || m[2] ? `${m[1] ? m[1] + ' ' : ''}및${m[2] ? ' ' + m[2] : ''}` : null),
      msg: () => "'및'은 앞뒤를 띄어 씁니다.",
    },
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /(에|을|를|으로|로)(따라|대한|대하여|대해|관한|관하여|관해|위한|위하여|위해|의한|의하여|의해|인한|인하여|인해|있어서)/g,
      fix: m => `${m[1]} ${m[2]}`,
      msg: m => `'${m[2]}'은(는) 앞말과 띄어 씁니다.`,
    },
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /([가-힣])([ \t]?)수([ \t]?)(있|없)/g,
      fix: m => (hasRieul(m[1]) ? `${m[1]} 수 ${m[4]}` : null),
      msg: () => "'~ㄹ 수 있다/없다'의 '수'는 의존 명사이므로 띄어 씁니다.",
    },
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /([가-힣])것(?=[이을은도과만으에]|[ \t.,]|$)/gm,
      fix: m => (hasNieunOrRieul(m[1]) && !'그이저'.includes(m[1]) ? `${m[1]} 것` : null),
      msg: () => "'것'은 의존 명사이므로 앞말과 띄어 씁니다.",
    },
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /것같/g,
      fix: () => '것 같',
      msg: () => "'것 같다'는 띄어 씁니다.",
    },
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /([가-힣])때(?=[에는도까부의]|[ \t.,]|$)/gm,
      fix: m => (hasRieul(m[1]) ? `${m[1]} 때` : null),
      msg: () => "'~ㄹ 때'의 '때'는 앞말과 띄어 씁니다.",
    },
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /([가-힣])지(않|못)(?=[가-힣])/g,
      fix: m => (m[1] === '마' ? null : `${m[1]}지 ${m[2]}`),
      msg: m => `'~지 ${m[2] === '않' ? '않다' : '못하다'}'는 띄어 씁니다.`,
    },
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /([가-힣])고있(?=[가-힣])/g,
      fix: m => `${m[1]}고 있`,
      msg: () => "'~고 있다'는 띄어 씁니다.",
    },
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /(해|어|아|워|와|봐|줘|져)야(한다|합니다|하며|할|함|하고|하는|하나|하므로)/g,
      fix: m => `${m[1]}야 ${m[2]}`,
      msg: () => "'~해야 한다'는 띄어 씁니다.",
    },
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /뿐(만)?아니라/g,
      fix: m => `뿐${m[1] || ''} 아니라`,
      msg: () => "'뿐만 아니라'는 띄어 씁니다.",
    },
    {
      cat: '띄어쓰기', sev: 'warn',
      re: /제[ \t]+(\d+)[ \t]*(조|항|호|차|회|기|장|절)/g,
      fix: m => `제${m[1]}${m[2]}`,
      msg: () => "차례를 나타내는 '제'는 뒤의 숫자에 붙여 씁니다. 예) 제1조",
    },
  ];

  // ── 쉬운 우리말(공공언어 다듬은 말) ──
  // [찾을 표현, 바꿀 말(null이면 제안만), 설명]
  const PLAIN_WORDS = [
    [B + '금일', '오늘'],
    [B + '명일', '내일'],
    [B + '익일', '다음 날'],
    [B + '익월', '다음 달'],
    [B + '익년', '다음 해'],
    [B + '금번', '이번'],
    [B + '차기(?=[ \\t])', '다음'],
    [B + '상기(?=[ \\t]|의|와|과)', '위'],
    [B + '기[ \\t]+(?=제출|시행|통보|배부|지급|발송|요청|안내|보고)', '이미 '],
    [B + '(?:유첨|별첨)', '붙임'],
    [B + '당해(?=[ \\t]|연도|년도|기관|사업)', '해당'],
    ['(\\d+)[ \\t]?개소', m => `${m[1]}곳`],
    [B + '요망(?![가-힣])', '바람'],
    [B + '수범[ \\t]?사례', '모범 사례'],
    [B + '적의[ \\t]?조치', '적절히 조치'],
    [B + '만전을[ \\t]?기하', '철저히 하'],
    [B + '만전을[ \\t]?기해', '철저히 해'],
    [B + '필히', '반드시'],
    [B + '미연에', '미리'],
    [B + '시건[ \\t]?장치', '잠금장치'],
    [B + '가료', '치료'],
    [B + '노견', '갓길'],
    [B + '불입', '납입'],
    [B + '견양', '서식'],
    [B + '제반', '여러'],
    [B + '(?:시달|하달)(?![리려렸린])', '전달'],
    [B + '송부', null, "'보냄', '보내다'로 쉽게 쓸 수 있습니다."],
    [B + '통보', null, "'알림', '알리다'로 쉽게 쓸 수 있습니다."],
    [B + '득하', null, "'받다', '얻다'로 쉽게 쓸 수 있습니다."],
    [B + '첨부(?=하|한|된|와|과|의|[ \\t])', null, "공문에서는 '붙임'이라는 말을 씁니다."],
    [
      '([가-힣]{2,})토록',
      m => (/(평생|영원|일생|종일|오래|한평생)$/.test(m[1]) ? null : `${m[1]}하도록`),
      "'~토록'은 '~하도록'으로 풀어 씁니다.",
    ],
  ];
  for (const [pat, rep, note] of PLAIN_WORDS) {
    TEXT_RULES.push({
      cat: '쉬운말', sev: 'info',
      re: new RegExp(pat, 'g'),
      fix: typeof rep === 'function' ? rep : rep === null ? () => null : () => rep,
      suggestOnly: rep === null,
      msg: m => note || `'${m[0].trim()}' 대신 '${typeof rep === 'function' ? rep(m) : rep}'처럼 쉬운 말을 권장합니다.`,
    });
  }

  // 외국어 약어: 처음 나올 때 우리말을 먼저 쓰고 괄호 안에 원어를 씁니다.
  const ACRONYMS = { MOU: '업무 협약', TF: '전담팀', 'R&D': '연구 개발', SNS: '누리 소통망', ICT: '정보 통신 기술' };
  TEXT_RULES.push({
    cat: '쉬운말', sev: 'info', bulk: false, firstOnly: true,
    re: /(?<![A-Za-z(])(MOU|TF|R&D|SNS|ICT)(?![A-Za-z)])/g,
    fix: m => `${ACRONYMS[m[1]]}(${m[1]})`,
    msg: m => `외국어 약어는 처음 쓸 때 '${ACRONYMS[m[1]]}(${m[1]})'처럼 우리말과 함께 씁니다.`,
  });

  function runTextRules(field, text) {
    const out = [];
    for (const rule of TEXT_RULES) {
      rule.re.lastIndex = 0;
      let m;
      let seen = false;
      while ((m = rule.re.exec(text)) !== null) {
        if (m[0].length === 0) { rule.re.lastIndex++; continue; }
        if (rule.firstOnly && seen) break;
        seen = true;
        const [from, to] = rule.range ? rule.range(m) : [m.index, m.index + m[0].length];
        const before = text.slice(from, to);
        const after = rule.fix(m);
        if (after === null && !rule.suggestOnly) continue;
        if (after !== null && after === before) continue;
        out.push({
          field, cat: rule.cat,
          sev: rule.sevOf ? rule.sevOf(m) : rule.sev,
          msg: rule.msg(m),
          from, to, before,
          after: rule.suggestOnly ? null : after,
          bulk: rule.bulk !== false,
        });
      }
    }
    return out;
  }

  // 긴 문장 안내
  function longSentences(field, text, limit) {
    const out = [];
    const re = /[^.?!\n]+[.?!]?/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const s = m[0].trim();
      if (s.length > limit) {
        const from = m.index + m[0].indexOf(s);
        out.push({
          field, cat: '문장', sev: 'info', from, to: from + s.length, before: s, after: null,
          msg: `문장이 ${s.length}자로 깁니다. 두세 문장으로 나누거나 항목으로 정리하면 읽기 쉽습니다.`,
        });
      }
    }
    return out;
  }

  // ───────────────────────── 본문 구조 ─────────────────────────
  const END_RE = /[ \t　]*(?:-[ \t]*끝[ \t]*-|\(끝\)|끝\.?)[ \t　]*$/;

  function buildBody(body, opts) {
    const issues = [];
    const blocks = [];
    const lines = body.split('\n');
    const counters = new Array(10).fill(0);
    let numLevel = 0; // 직전 번호 항목의 단계
    const stack = []; // 상위 항목들: { raw: 입력한 기호의 단계, eff: 실제 단계 }
    let bulletSeq = []; // 번호 항목 아래에서 쓰인 특수 기호 순서
    let lastItem = null;
    let offset = 0;
    let hadEnd = false;

    // 본문 안에 '붙임'을 적었다면 그 줄부터 끝까지를 붙임으로 떼어 냅니다.
    let attachLine = lines.findIndex(l => ATTACH_LABEL_RE.test(l));
    if (attachLine < 0) attachLine = lines.length;
    let attachOffset = 0;
    for (let i = 0; i < attachLine; i++) attachOffset += lines[i].length + 1;

    // 마지막 줄의 '끝' 표시는 떼어 두었다가 규격대로 다시 붙입니다.
    let lastIdx = -1;
    for (let i = attachLine - 1; i >= 0; i--) if (lines[i].trim()) { lastIdx = i; break; }

    lines.forEach((line, i) => {
      if (i >= attachLine) return;
      let raw = line;
      if (i === lastIdx && END_RE.test(raw)) {
        hadEnd = true;
        raw = raw.replace(END_RE, '');
      }
      const p = parseLine(raw);

      if (p.kind === 'item') {
        let level = p.level;
        let marker = p.marker;
        if (opts.autoNumber) {
          // 입력한 기호의 상하 관계만 보고 실제 단계를 정합니다.
          // 예) '1.' 바로 아래 '1)', '2)'를 썼다면 둘 다 2단계('가.', '나.')로 봅니다.
          while (stack.length && stack[stack.length - 1].raw >= p.level) stack.pop();
          level = Math.min(8, (stack.length ? stack[stack.length - 1].eff : 0) + 1);
          stack.push({ raw: p.level, eff: level });
          counters[level]++;
          for (let k = level + 1; k < counters.length; k++) counters[k] = 0;
          marker = MARKER_GEN[level](counters[level]);
        }
        if (marker !== p.marker || p.spacing !== ' ') {
          let msg;
          let sev = 'error';
          if (level !== p.level) {
            msg = `'${p.marker}'는 ${p.level}단계 기호입니다. 상위 항목 바로 아래에는 ${level}단계 기호 '${LEVEL_EXAMPLE[level]}'를 씁니다.`;
          } else if (marker !== p.marker) {
            msg = `항목 번호가 차례에 맞지 않습니다. '${p.marker}' 대신 '${marker}'가 와야 합니다.`;
          } else {
            msg = '항목 기호와 내용 사이는 한 칸(1타) 띄웁니다.';
            sev = 'warn';
          }
          issues.push({
            field: 'body', cat: '항목', sev, msg,
            from: offset + p.markerStart, to: offset + p.markerEnd,
            before: line.slice(p.markerStart, p.markerEnd), after: marker + ' ', bulk: true,
          });
        }
        numLevel = level;
        bulletSeq = [];
        lastItem = { type: 'item', level, marker, content: p.content, line: i };
        blocks.push(lastItem);
      } else if (p.kind === 'bullet') {
        let idx = bulletSeq.indexOf(p.marker);
        if (idx < 0) { bulletSeq.push(p.marker); idx = bulletSeq.length - 1; }
        else bulletSeq.length = idx + 1;
        const level = Math.min(8, numLevel + idx + 1);
        if (p.markerEnd - p.markerStart !== p.marker.length + 1 || line[p.markerStart] !== p.marker) {
          const orig = line.slice(p.markerStart, p.markerEnd);
          if (orig !== p.marker + ' ') {
            issues.push({
              field: 'body', cat: '항목', sev: 'warn',
              msg: '항목 기호와 내용 사이는 한 칸(1타) 띄웁니다.',
              from: offset + p.markerStart, to: offset + p.markerEnd,
              before: orig, after: p.marker + ' ', bulk: true,
            });
          }
        }
        lastItem = { type: 'item', level, marker: p.marker, content: p.content, line: i, bullet: true };
        blocks.push(lastItem);
      } else if (p.kind === 'text') {
        blocks.push(lastItem
          ? { type: 'text', level: lastItem.level, marker: lastItem.marker, content: p.content, line: i }
          : { type: 'text', level: 0, marker: '', content: p.content.trim(), line: i });
      }
      offset += line.length + 1;
    });

    return {
      blocks, issues, hadEnd,
      attachText: lines.slice(attachLine).join('\n'),
      attachOffset: Math.min(attachOffset, body.length),
    };
  }

  // ───────────────────────── 붙임 ─────────────────────────
  const QTY_RE = /(\d+|한|두|세)[ \t]*(부|매|권|개|종|장|건|식|점|철)\.?$/;
  const ATTACH_LABEL_RE = /^[ \t\u3000]*붙[ \t]*임(?![가-힣])/;

  // field: 붙임을 적은 칸, base: 그 칸 안에서 붙임이 시작하는 위치
  function buildAttach(text, field, base) {
    field = field || 'attach';
    base = base || 0;
    const issues = [];
    const items = [];
    const lines = text.split('\n');
    let offset = 0;
    let lastIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim()) { lastIdx = i; break; }
    let hadEnd = false;

    lines.forEach((line, i) => {
      let body = line;
      if (i === lastIdx && END_RE.test(body)) {
        hadEnd = true;
        body = body.replace(END_RE, '');
      }
      // 편람: '붙임' 다음은 2타(스페이스 두 번) 띄웁니다.
      const label = body.match(/^([ \t\u3000]*)(붙[ \t]*임)([ \t\u3000]*)(?=\S)/);
      if (label && field === 'body' && (label[2] !== '붙임' || label[3] !== '  ')) {
        const from = base + offset + label[1].length;
        issues.push({
          field, cat: '붙임', sev: 'error',
          msg: "'붙임' 다음에는 스페이스를 두 번(2타) 띄웁니다. 예) 붙임  계획서 1부.  끝.",
          from, to: from + label[2].length + label[3].length,
          before: label[2] + label[3], after: '붙임  ', bulk: true,
        });
      }
      const lead = body.match(/^[ \t　]*(?:붙[ \t]*임[ \t　]*)?(?:\d{1,2}[.)][ \t　]*)?/)[0];
      const content = body.slice(lead.length).replace(/[ \t　]+$/, '');
      if (content) {
        const endPos = base + offset + lead.length + content.length;
        if (!QTY_RE.test(content)) {
          const dot = content.endsWith('.');
          issues.push({
            field, cat: '붙임', sev: 'warn',
            msg: "붙임물 이름 뒤에는 수량을 '1부.'처럼 적습니다.",
            from: dot ? endPos - 1 : endPos, to: endPos,
            before: dot ? '.' : '', after: ' 1부.', bulk: true,
          });
        } else if (!content.endsWith('.')) {
          issues.push({
            field, cat: '붙임', sev: 'warn',
            msg: "붙임물 수량 뒤에는 온점(.)을 찍습니다. 예) 계획서 1부.",
            from: endPos, to: endPos, before: '', after: '.', bulk: true,
          });
        }
        // 완성본에는 수량 뒤 온점까지 규격대로 넣습니다.
        items.push(QTY_RE.test(content) && !content.endsWith('.') ? content + '.' : content);
      }
      offset += line.length + 1;
    });
    return { items, issues, hadEnd };
  }

  // ───────────────────────── 전체 검사 ─────────────────────────
  const SEV_ORDER = { error: 0, warn: 1, info: 2 };

  function check(state, opts) {
    opts = Object.assign({ autoNumber: true, sentenceLimit: 120 }, opts || {});
    const s = Object.assign({ org: '', receiver: '', via: '', title: '', body: '', attach: '', sender: '' }, state);
    let issues = [];

    // 두문
    const title = s.title.trim();
    if (!title) {
      issues.push({ field: 'title', cat: '구조', sev: 'error', msg: '제목이 없습니다. 내용을 한눈에 알 수 있게 간결하게 적습니다.' });
    } else {
      const tm = s.title.match(/[ \t]*[.。][ \t]*$/);
      if (tm) {
        issues.push({
          field: 'title', cat: '구조', sev: 'warn', msg: '제목 끝에는 온점(.)을 찍지 않습니다.',
          from: tm.index, to: s.title.length, before: tm[0], after: '', bulk: true,
        });
      }
      if (title.length > 40) {
        issues.push({ field: 'title', cat: '구조', sev: 'info', msg: `제목이 ${title.length}자입니다. 핵심만 간결하게 줄이면 좋습니다.` });
      }
    }
    if (!s.receiver.trim()) {
      issues.push({
        field: 'receiver', cat: '구조', sev: 'warn',
        msg: "수신자가 없습니다. 내부 결재 문서라면 '내부결재'라고 적습니다.",
        from: 0, to: s.receiver.length, before: '', after: '내부결재', bulk: false,
      });
    }

    // 본문
    if (!s.body.trim()) {
      issues.push({ field: 'body', cat: '구조', sev: 'error', msg: '본문이 비어 있습니다.' });
    }
    const body = buildBody(s.body, opts);
    const inBody = buildAttach(body.attachText, 'body', body.attachOffset);
    const attach = buildAttach(s.attach);
    const attachItems = inBody.items.concat(attach.items);
    issues = issues.concat(body.issues, inBody.issues, attach.issues);

    for (const f of ['title', 'body', 'attach']) {
      issues = issues.concat(runTextRules(f, s[f]));
    }
    issues = issues.concat(longSentences('body', s.body, opts.sentenceLimit));

    // 원문에 적은 '끝' 표시가 규격('  끝.')과 다르면 알려 줍니다.
    const TAIL_END = /(\S)([ \t\u3000\n]*)(-[ \t]*끝[ \t]*-|\(끝\)|끝\.?)[ \t\u3000\n]*$/;
    const endOwner = attach.items.length ? 'attach' : 'body';
    for (const f of ['body', 'attach']) {
      const m = s[f].match(TAIL_END);
      if (!m) continue;
      const from = m.index + 1;
      const before = s[f].slice(from);
      if (f !== endOwner) {
        issues.push({ field: f, cat: '붙임', sev: 'warn', from, to: s[f].length, before, after: '', bulk: true,
          msg: "붙임이 있으면 '끝.'은 본문이 아니라 마지막 붙임 뒤에 붙입니다." });
      } else if (before !== '  끝.') {
        issues.push({ field: f, cat: '구조', sev: 'warn', from, to: s[f].length, before, after: '  끝.', bulk: true,
          msg: "'끝.'은 마지막 글자 뒤에 스페이스를 두 번(2타) 띄우고 씁니다. 예) ...바랍니다.  끝." });
      }
    }

    const hasBody = body.blocks.length > 0;
    if (hasBody) {
      if (attachItems.length) {
        issues.push({ field: inBody.items.length ? 'body' : 'attach', cat: '붙임', sev: 'info', auto: true,
          msg: "완성본에는 '붙임' 다음 2타 띄우고, 마지막 붙임 뒤에 2타 띄워 '끝.'을 붙였습니다." });
      } else if (!body.hadEnd) {
        issues.push({ field: 'body', cat: '구조', sev: 'info', auto: true,
          msg: "완성본에는 본문 마지막 글자 뒤에 2타 띄우고 '끝.'을 붙였습니다." });
      }
    }

    // 같은 칸에서 겹치는 수정은 앞의 것만 남깁니다.
    const ranged = issues.filter(x => x.from !== undefined).sort((a, b) =>
      a.field === b.field ? a.from - b.from || SEV_ORDER[a.sev] - SEV_ORDER[b.sev] : a.field < b.field ? -1 : 1);
    const kept = [];
    const lastTo = {};
    for (const it of ranged) {
      const lt = lastTo[it.field];
      if (lt !== undefined && it.from < lt && it.after !== null) continue;
      kept.push(it);
      if (it.after !== null) lastTo[it.field] = Math.max(lt || 0, it.to);
    }
    const final = issues.filter(x => x.from === undefined).concat(kept);
    final.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
    final.forEach((it, i) => { it.id = i; if (it.after === undefined) it.after = null; });

    const doc = {
      org: s.org.trim(),
      receiver: s.receiver.trim(),
      via: s.via.trim(),
      title: title.replace(/[ \t]*[.。]$/, ''),
      blocks: body.blocks,
      attach: attachItems,
      sender: s.sender.trim(),
      hasBody,
    };
    return { issues: final, doc };
  }

  function applyFix(text, issue) {
    return text.slice(0, issue.from) + issue.after + text.slice(issue.to);
  }

  // 고칠 수 있는 항목을 모두 반영합니다(연쇄 수정이 있을 수 있어 몇 번 반복).
  function fixAll(state, opts, cats) {
    const s = Object.assign({}, state);
    let count = 0;
    for (let pass = 0; pass < 6; pass++) {
      const { issues } = check(s, opts);
      const todo = issues.filter(x => x.after !== null && x.bulk && (!cats || cats.has(x.cat)));
      if (!todo.length) break;
      const byField = {};
      todo.forEach(x => (byField[x.field] = byField[x.field] || []).push(x));
      let changed = false;
      for (const f of Object.keys(byField)) {
        const list = byField[f].sort((a, b) => b.from - a.from);
        let t = s[f];
        let lastFrom = Infinity;
        for (const it of list) {
          if (it.to > lastFrom) continue;
          t = applyFix(t, it);
          lastFrom = it.from;
          count++;
        }
        if (t !== s[f]) { s[f] = t; changed = true; }
      }
      if (!changed) break;
    }
    return { state: s, count };
  }

  // ───────────────────────── 출력 ─────────────────────────
  const markerSpan = b => textWidth(b.marker) + 1; // 기호 + 1타

  function toPlainText(doc) {
    const out = [];
    if (doc.org) out.push(doc.org, '');
    out.push('수신  ' + (doc.receiver || ''));
    if (doc.via) out.push('(경유)  ' + doc.via);
    out.push('제목  ' + doc.title, '');
    const body = doc.blocks.map(b => {
      if (b.type === 'item') return ' '.repeat(2 * (b.level - 1)) + b.marker + ' ' + b.content;
      if (b.level === 0) return b.content;
      return ' '.repeat(2 * (b.level - 1) + markerSpan(b)) + b.content;
    });
    if (doc.hasBody && !doc.attach.length && body.length) body[body.length - 1] += '  끝.';
    out.push(...body);
    if (doc.attach.length) {
      out.push('');
      if (doc.attach.length === 1) {
        out.push('붙임  ' + doc.attach[0] + (doc.hasBody ? '  끝.' : ''));
      } else {
        doc.attach.forEach((a, i) => {
          const last = i === doc.attach.length - 1;
          out.push((i === 0 ? '붙임  ' : '      ') + (i + 1) + '. ' + a + (last && doc.hasBody ? '  끝.' : ''));
        });
      }
    }
    if (doc.sender) out.push('', '', doc.sender);
    return out.join('\n');
  }

  const api = {
    check, fixAll, applyFix, toPlainText, parseLine, textWidth, weekdayOf,
    markerSpan, LEVEL_EXAMPLE, MARKER_GEN,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GongmunRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
