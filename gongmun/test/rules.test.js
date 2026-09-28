// 실행: node gongmun/test/rules.test.js
const assert = require('assert');
const R = require('../rules.js');
const fixed = s => R.fixAll({ receiver: '내부결재', title: '제목', body: s }).state.body;

assert.strictEqual(fixed('일시: 2026년 10월 15일 오후 2시 30분'), '일시: 2026. 10. 15. 14:30');
assert.strictEqual(fixed('관련 : 2026.09.01'), '관련: 2026. 9. 1.');
assert.strictEqual(fixed('참석할수있도록,협조 바랍니다'), '참석할 수 있도록, 협조 바랍니다');
assert.strictEqual(fixed('1. 가\n  1) 나\n  2) 다\n3. 라'), '1. 가\n  가. 나\n  나. 다\n2. 라');
assert.strictEqual(fixed('금액 1500000원'), '금액 1,500,000원');
// 요일 오류는 알려 주되 자동으로 고치지 않음
const r = R.check({ body: '2026. 10. 15.(수) 회의' });
assert.ok(r.issues.some(i => i.after === '(목)' && i.sev === 'error' && !i.bulk));
// 오탐 없음
for (const ok of ['그것은 이것과 다르다', '참석자가 3명일 경우', '민원에 시달리다', '14:30까지', '국민 및 기관']) {
  assert.strictEqual(fixed(ok), ok, ok);
}
// 끝 표시와 붙임
const doc = R.check({ title: 't', body: '1. 내용\n끝', attach: '계획서\n명단 1부' });
assert.ok(R.toPlainText(doc.doc).includes('붙임  1. 계획서\n      2. 명단 1부.  끝.'));
assert.ok(R.toPlainText(R.check({ title: 't', body: '1. 내용' }).doc).includes('1. 내용  끝.'));
// 본문에 적은 붙임도 '붙임' 다음 2타, 끝. 앞 2타로 정리
const inBody = { title: 't', receiver: 'x', body: '1. 내용입니다.\n붙임 1. 계획서 1부.\n2. 명단 1부. 끝.' };
assert.ok(R.toPlainText(R.check(inBody).doc).endsWith('붙임  1. 계획서 1부.\n      2. 명단 1부.  끝.'));
assert.strictEqual(R.fixAll(inBody).state.body, '1. 내용입니다.\n붙임  1. 계획서 1부.\n2. 명단 1부.  끝.');
assert.strictEqual(R.fixAll({ title: 't', receiver: 'x', body: '내용입니다. 끝' }).state.body, '내용입니다.  끝.');
console.log('모든 테스트 통과');
