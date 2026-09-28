(function () {
  'use strict';
  const R = window.GongmunRules;
  const $ = s => document.querySelector(s);

  const FIELDS = ['org', 'sender', 'receiver', 'via', 'title', 'body', 'attach'];
  const FIELD_LABEL = { org: '기관명', sender: '발신명의', receiver: '수신', via: '경유', title: '제목', body: '본문', attach: '붙임' };
  const CATS = ['항목', '표기', '띄어쓰기', '문장부호', '붙임', '구조', '쉬운말', '문장'];
  const SEV_LABEL = { error: '꼭 고치기', warn: '고치기 권장', info: '참고' };

  const FONTS = {
    hmj: '"휴먼명조", "HYMyeongJo", "HCR Batang", "함초롬바탕", "Nanum Myeongjo", serif',
    hcr: '"함초롬바탕", "HCR Batang", "Nanum Myeongjo", serif',
    batang: '"바탕", "Batang", "Nanum Myeongjo", serif',
    malgun: '"맑은 고딕", "Malgun Gothic", "Noto Sans KR", sans-serif',
    dotum: '"돋움", "Dotum", "Noto Sans KR", sans-serif',
  };
  const PRESETS = {
    basic: { font: 'hmj', size: 15, line: 160, spacing: 0 },
    compact: { font: 'hmj', size: 13, line: 150, spacing: 0 },
    gothic: { font: 'malgun', size: 12, line: 160, spacing: 0 },
  };
  const DEFAULT_SETTINGS = Object.assign({ preset: 'basic', auto: true }, PRESETS.basic);

  const SAMPLE = {
    org: '○○시',
    sender: '○○시장',
    receiver: '',
    via: '',
    title: '2026년 하반기 청렴교육 실시 알림.',
    body: [
      '1. 관련 : ○○과-1234(2026.09.01.)',
      '2. 2026년 하반기 청렴교육을 아래와 같이 실시하오니,각 부서에서는 소속 직원이 빠짐없이 참석할수있도록 협조하여 주시기 바랍니다.',
      '  1) 일시 : 2026년 10월 15일(수) 오후 2시 ~ 오후 4시',
      '  2) 장소 : 시청 대회의실',
      '  3) 대상 : 전 직원(약 300명)',
      '3. 참석자 명단은 명일까지 유첨 서식에 따라 제출하여 주시기 바랍니다.',
    ].join('\n'),
    attach: '참석자 명단 서식\n청렴 서약서 1부',
  };
  const EMPTY = { org: '', sender: '', receiver: '', via: '', title: '', body: '', attach: '' };

  // ───── 저장 (이 브라우저에만 보관) ─────
  function load(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function save(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ }
  }

  let state = Object.assign({}, EMPTY, load('gongmun.draft') || SAMPLE);
  let settings = Object.assign({}, DEFAULT_SETTINGS, load('gongmun.settings') || {});
  let result = null;
  const hiddenCats = new Set();

  const el = f => $('#f-' + f);

  // ───── 입력 ─────
  function readFields() {
    FIELDS.forEach(f => { state[f] = el(f).value; });
  }
  function writeFields() {
    FIELDS.forEach(f => { if (el(f).value !== state[f]) el(f).value = state[f]; });
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(update, 180);
  }

  function update() {
    readFields();
    save('gongmun.draft', state);
    result = R.check(state, { autoNumber: settings.auto });
    renderIssues();
    renderDoc();
  }

  // ───── 고칠 곳 목록 ─────
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const showSpaces = s => esc(s).replace(/ /g, '<span class="sp">␣</span>');

  function renderFilter() {
    const counts = {};
    result.issues.forEach(i => { counts[i.cat] = (counts[i.cat] || 0) + 1; });
    $('#catFilter').innerHTML = CATS.filter(c => counts[c]).map(c =>
      `<button class="chip${hiddenCats.has(c) ? ' off' : ''}" data-cat="${c}" aria-pressed="${!hiddenCats.has(c)}">${c} <b>${counts[c]}</b></button>`
    ).join('');
  }

  function renderIssues() {
    renderFilter();
    const list = result.issues.filter(i => !hiddenCats.has(i.cat));
    const fixable = result.issues.filter(i => i.after !== null && i.bulk && !hiddenCats.has(i.cat)).length;
    const errors = result.issues.filter(i => i.sev === 'error').length;
    $('#issueCount').textContent = result.issues.length ? `${result.issues.length}건${errors ? ` · 꼭 고치기 ${errors}` : ''}` : '';
    $('#btnFixAll').disabled = !fixable;
    $('#btnFixAll').textContent = fixable ? `한 번에 고치기 (${fixable})` : '한 번에 고치기';

    if (!list.length) {
      $('#issueList').innerHTML = `<li class="empty">${result.issues.length ? '선택한 분류에 해당하는 항목이 없습니다.' : '고칠 곳이 없습니다. 👍'}</li>`;
      return;
    }
    $('#issueList').innerHTML = list.map(i => {
      const text = state[i.field] || '';
      let snippet = '';
      if (i.from !== undefined && (i.before || i.after)) {
        const pre = text.slice(Math.max(0, i.from - 10), i.from).replace(/\n/g, ' ');
        const post = text.slice(i.to, i.to + 10).replace(/\n/g, ' ');
        snippet = `<div class="snippet">${i.from > 10 ? '…' : ''}${esc(pre)}` +
          (i.before ? `<del>${showSpaces(i.before)}</del>` : '') +
          (i.after !== null && i.after !== '' ? `<ins>${showSpaces(i.after)}</ins>` : i.after === '' ? '<ins class="rm">삭제</ins>' : '') +
          `${esc(post)}${i.to + 10 < text.length ? '…' : ''}</div>`;
      }
      const btns = [];
      if (i.from !== undefined) btns.push(`<button class="small ghost" data-act="goto" data-id="${i.id}">위치</button>`);
      if (i.after !== null) btns.push(`<button class="small" data-act="fix" data-id="${i.id}">고치기</button>`);
      return `<li class="issue ${i.sev}">
        <div class="issueHead"><span class="sev">${i.auto ? '자동 처리' : SEV_LABEL[i.sev]}</span><span class="tag">${i.cat}</span><span class="where">${FIELD_LABEL[i.field]}</span></div>
        <p>${esc(i.msg)}</p>${snippet}
        ${btns.length ? `<div class="issueBtns">${btns.join('')}</div>` : ''}
      </li>`;
    }).join('');
  }

  function findIssue(id) { return result.issues.find(i => i.id === +id); }

  function gotoIssue(i) {
    const input = el(i.field);
    input.focus();
    if (i.from !== undefined) {
      input.setSelectionRange(i.from, Math.max(i.to, i.from));
      if (input.tagName === 'TEXTAREA') {
        // 선택한 줄이 보이도록 대략 스크롤
        const lineNo = input.value.slice(0, i.from).split('\n').length - 1;
        const lh = parseFloat(getComputedStyle(input).lineHeight) || 20;
        input.scrollTop = Math.max(0, lineNo * lh - input.clientHeight / 3);
      }
    }
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function fixIssue(i) {
    readFields();
    state[i.field] = R.applyFix(state[i.field], i);
    writeFields();
    update();
  }

  // ───── 완성본 ─────
  function styleVars() {
    return {
      font: FONTS[settings.font] || FONTS.hmj,
      size: +settings.size || 15,
      line: +settings.line || 160,
      spacing: +settings.spacing || 0,
    };
  }

  // inline: 복사용(다른 프로그램에 붙여 넣을 때 서식이 유지되도록 pt 단위 인라인 스타일)
  function docHtml(doc, inline) {
    const v = styleVars();
    const u = em => (inline ? `${(em * v.size).toFixed(1)}pt` : `${em}em`);
    const P = (css, html) => `<p style="margin:0;${css}">${html}</p>`;
    const endMark = '&nbsp;&nbsp;끝.';
    const parts = [];

    if (doc.org) parts.push(P(`text-align:center;font-weight:bold;font-size:${inline ? (v.size * 1.4).toFixed(1) + 'pt' : '1.4em'};margin-bottom:${u(0.8)}`, esc(doc.org)));

    const head = (label, value, extra) => {
      const w = R.textWidth(label) / 2 + 1; // 라벨 + 2타
      return P(`padding-left:${u(w)};text-indent:-${u(w)};${extra || ''}`,
        `<span style="display:inline-block;width:${u(w)};text-indent:0">${label}</span>${esc(value)}`);
    };
    parts.push(head('수신', doc.receiver));
    if (doc.via) parts.push(head('(경유)', doc.via));
    parts.push(head('제목', doc.title, `font-weight:bold;padding-bottom:${u(0.3)};border-bottom:1px solid #000;margin-bottom:${u(0.6)}`));

    const blocks = doc.blocks;
    blocks.forEach((b, idx) => {
      const isLast = idx === blocks.length - 1;
      const tail = isLast && doc.hasBody && !doc.attach.length ? endMark : '';
      if (b.type === 'item') {
        const mw = R.markerSpan(b) / 2;
        const left = (b.level - 1) + mw;
        parts.push(P(`padding-left:${u(left)};text-indent:-${u(mw)}`,
          `<span style="display:inline-block;width:${u(mw)};text-indent:0">${esc(b.marker)}</span>${esc(b.content)}${tail}`));
      } else {
        const left = b.level === 0 ? 0 : (b.level - 1) + R.markerSpan(b) / 2;
        parts.push(P(`padding-left:${u(left)}`, esc(b.content) + tail));
      }
    });

    if (doc.attach.length) {
      const lw = 3; // '붙임' 2글자 + 2타
      const multi = doc.attach.length > 1;
      const mw = multi ? 1.5 : 0;
      doc.attach.forEach((a, i) => {
        const tail = i === doc.attach.length - 1 && doc.hasBody ? endMark : '';
        const label = i === 0 ? '붙임' : '';
        parts.push(P(`padding-left:${u(lw + mw)};text-indent:-${u(lw + mw)};${i === 0 ? `margin-top:${u(0.6)}` : ''}`,
          `<span style="display:inline-block;width:${u(lw)};text-indent:0">${label}</span>` +
          (multi ? `<span style="display:inline-block;width:${u(mw)};text-indent:0">${i + 1}.</span>` : '') +
          esc(a) + tail));
      });
    }

    if (doc.sender) {
      parts.push(P(`text-align:center;font-weight:bold;font-size:${inline ? (v.size * 1.4).toFixed(1) + 'pt' : '1.4em'};margin-top:${u(3)}`, esc(doc.sender)));
    }

    const wrap = `font-family:${v.font.replace(/"/g, "'")};font-size:${v.size}pt;line-height:${v.line}%;letter-spacing:${v.spacing / 100}em;color:#000`;
    return inline ? `<div style="${wrap}">${parts.join('')}</div>` : parts.join('');
  }

  function renderDoc() {
    const v = styleVars();
    const d = $('#doc');
    d.style.fontFamily = v.font;
    d.style.fontSize = v.size + 'pt';
    d.style.lineHeight = v.line + '%';
    d.style.letterSpacing = v.spacing / 100 + 'em';
    d.innerHTML = docHtml(result.doc, false);
    fitPage();
  }

  // A4 용지를 화면 폭에 맞게 축소해서 보여 줍니다.
  function fitPage() {
    const wrap = $('#pageWrap');
    const page = $('#page');
    page.style.transform = 'none';
    const scale = Math.min(1, wrap.clientWidth / page.offsetWidth);
    page.style.transform = `scale(${scale})`;
    wrap.style.height = page.offsetHeight * scale + 'px';
  }

  // ───── 설정 ─────
  function writeSettings() {
    $('#s-preset').value = settings.preset;
    $('#s-font').value = settings.font;
    $('#s-size').value = settings.size;
    $('#s-line').value = settings.line;
    $('#s-spacing').value = settings.spacing;
    $('#s-auto').checked = settings.auto;
  }
  function onSetting(e) {
    if (e.target.id === 's-preset') {
      const p = PRESETS[e.target.value];
      settings.preset = e.target.value;
      if (p) Object.assign(settings, p);
    } else {
      settings.font = $('#s-font').value;
      settings.size = +$('#s-size').value || 15;
      settings.line = +$('#s-line').value || 160;
      settings.spacing = +$('#s-spacing').value || 0;
      settings.auto = $('#s-auto').checked;
      const match = Object.keys(PRESETS).find(k => ['font', 'size', 'line', 'spacing'].every(x => PRESETS[k][x] === settings[x]));
      settings.preset = match || 'custom';
    }
    writeSettings();
    save('gongmun.settings', settings);
    update();
  }

  // ───── 복사 · 인쇄 ─────
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function copyText() {
    const text = R.toPlainText(result.doc);
    try {
      await navigator.clipboard.writeText(text);
      toast('텍스트를 복사했습니다.');
    } catch (e) {
      fallbackCopy(text, null);
    }
  }

  async function copyRich() {
    const html = docHtml(result.doc, true);
    const text = R.toPlainText(result.doc);
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      toast('서식을 포함해 복사했습니다. 한글·워드에 붙여 넣으세요.');
    } catch (e) {
      fallbackCopy(text, html);
    }
  }

  function fallbackCopy(text, html) {
    const box = document.createElement('div');
    box.contentEditable = 'true';
    box.style.cssText = 'position:fixed;left:-9999px;top:0';
    if (html) box.innerHTML = html; else box.textContent = text;
    document.body.appendChild(box);
    const range = document.createRange();
    range.selectNodeContents(box);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    sel.removeAllRanges();
    box.remove();
    toast(ok ? '복사했습니다.' : '복사하지 못했습니다. 완성본을 직접 선택해 복사하세요.');
  }

  // ───── 연결 ─────
  function init() {
    writeFields();
    writeSettings();

    FIELDS.forEach(f => el(f).addEventListener('input', schedule));
    ['#s-preset', '#s-font', '#s-size', '#s-line', '#s-spacing', '#s-auto'].forEach(id =>
      $(id).addEventListener('change', onSetting));

    $('#issueList').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const i = findIssue(b.dataset.id);
      if (!i) return;
      if (b.dataset.act === 'fix') fixIssue(i); else gotoIssue(i);
    });
    $('#catFilter').addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b) return;
      const c = b.dataset.cat;
      if (hiddenCats.has(c)) hiddenCats.delete(c); else hiddenCats.add(c);
      renderIssues();
    });
    $('#btnFixAll').addEventListener('click', () => {
      readFields();
      const cats = new Set(CATS.filter(c => !hiddenCats.has(c)));
      const r = R.fixAll(state, { autoNumber: settings.auto }, cats);
      state = r.state;
      writeFields();
      update();
      toast(r.count ? `${r.count}곳을 고쳤습니다.` : '한 번에 고칠 항목이 없습니다.');
    });
    $('#btnSample').addEventListener('click', () => {
      state = Object.assign({}, SAMPLE);
      writeFields();
      update();
    });
    $('#btnClear').addEventListener('click', () => {
      // 브라우저 확인 창 대신 버튼을 한 번 더 누르게 합니다.
      const btn = $('#btnClear');
      if (Object.values(state).some(v => v.trim()) && !btn.dataset.armed) {
        btn.dataset.armed = '1';
        btn.textContent = '한 번 더 누르면 지워집니다';
        setTimeout(() => { delete btn.dataset.armed; btn.textContent = '새로 쓰기'; }, 3000);
        return;
      }
      delete btn.dataset.armed;
      btn.textContent = '새로 쓰기';
      state = Object.assign({}, EMPTY);
      writeFields();
      update();
      el('title').focus();
    });
    $('#btnCopyText').addEventListener('click', copyText);
    $('#btnCopyRich').addEventListener('click', copyRich);
    if ($('#btnPrint')) $('#btnPrint').addEventListener('click', () => window.print());
    window.addEventListener('resize', fitPage);
    window.addEventListener('beforeprint', () => { $('#page').style.transform = 'none'; });
    window.addEventListener('afterprint', fitPage);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPage);

    update();
  }

  init();
})();
