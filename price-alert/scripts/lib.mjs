// fetch-bunjang.mjs / fetch-naver-cafe.mjs가 공유하는 필터링 로직.

export const MIN_PRICE = 1_000_000;

export function isTargetModel(text) {
  const normalized = text.toUpperCase().replace(/[\s\-_]/g, '');
  return normalized.includes('1000GX');
}

const SOLD_OUT_PATTERN = /(판매|거래|계약)\s*(완료|됨)|예약\s*중|판매\s*됨|sold\s*out/i;

export function isSoldOut(text) {
  return SOLD_OUT_PATTERN.test(text);
}

export function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 판매완료 후 방치된 매물은 실제 시세와 동떨어진 헐값으로 남아있는 경우가
// 있다. 중간값의 절반보다 싼 매물은 정상 매물이 아닐 가능성이 높아 제외한다.
export function dropFarBelowMedian(items) {
  if (items.length < 3) return items;
  const mid = median(items.map((item) => item.price));
  return items.filter((item) => item.price >= mid * 0.5);
}
