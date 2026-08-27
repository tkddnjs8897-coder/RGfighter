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

export function parsePriceKRW(text) {
  const manMatch = text.match(/([\d,]+)\s*만\s*원/);
  if (manMatch) {
    const value = Number(manMatch[1].replace(/,/g, '')) * 10000;
    if (Number.isFinite(value)) return value;
  }
  const wonMatch = text.match(/([\d,]{7,})\s*원/);
  if (wonMatch) {
    const value = Number(wonMatch[1].replace(/,/g, ''));
    if (Number.isFinite(value)) return value;
  }
  return null;
}
