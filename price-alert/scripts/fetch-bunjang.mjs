#!/usr/bin/env node
// 번개장터 공개 검색 결과에서 "GSX-S1000GX" 매물을 가져와 JSON으로 저장합니다.
// 로그인이 필요 없는 공개 검색만 사용합니다 (바튜매/당근마켓은 대상에서 제외).
//
// 이 스크립트는 GitHub Actions에서 주기적으로 실행됩니다. 번개장터는 공식
// 오픈 API가 없어 이 요청 형식은 비공식이며, 사이트 구조가 바뀌면 언제든
// 깨질 수 있습니다. 실패해도 기존에 저장된 결과는 덮어쓰지 않고 lastError만
// 기록해, 페이지는 마지막 성공 데이터를 계속 보여줍니다.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_PRICE, isTargetModel, isSoldOut, dropFarBelowMedian } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'data', 'bunjang-listings.json');

// 검색어를 여러 개 시도해서 합친다 (하나만 쓰면 매칭이 느슨/과하게 갈릴 수 있음).
const QUERIES = process.env.SEARCH_QUERY ? [process.env.SEARCH_QUERY] : ['스즈키 GSX-S1000GX', 'GSX-S1000GX'];

function buildUrl(query) {
  return (
    'https://api.bunjang.co.kr/api/1/find_v2.json?' +
    new URLSearchParams({ q: query, order: 'score', page: '0', n: '100', stat_device: 'w' })
  );
}

async function fetchOne(query) {
  const res = await fetch(buildUrl(query), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; personal-price-tracker/1.0; +https://github.com/)',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`번개장터 요청 실패(${query}): HTTP ${res.status}`);
  }

  const data = await res.json();
  const rawList = data.list || data.items || data.data || [];

  if (!Array.isArray(rawList)) {
    throw new Error(`예상하지 못한 응답 형식(${query}): ` + JSON.stringify(data).slice(0, 500));
  }

  return rawList;
}

async function fetchListings() {
  const seen = new Set();
  const merged = [];

  for (const query of QUERIES) {
    const rawList = await fetchOne(query);
    for (const item of rawList) {
      const price = Number(item.price ?? item.productPrice ?? item?.priceInfo?.price);
      const id = item.pid ?? item.id ?? item.productId;
      const title = item.name ?? item.title ?? item.productName ?? '';
      if (!Number.isFinite(price) || price < MIN_PRICE || !id) continue;
      if (!isTargetModel(title)) continue;
      // 제목뿐 아니라 응답 필드 전체를 훑어 판매완료/거래완료 표시가 있으면 제외
      if (isSoldOut(JSON.stringify(item))) continue;
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        id: key,
        title: String(title),
        price,
        url: `https://m.bunjang.co.kr/products/${id}`,
        platform: '번개장터',
      });
    }
  }

  const items = dropFarBelowMedian(merged).sort((a, b) => a.price - b.price);

  if (items.length === 0) {
    throw new Error('검색 결과를 0건 파싱했습니다. 응답 형식이 바뀌었을 수 있습니다.');
  }

  return items;
}

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(OUT_PATH, 'utf8'));
  } catch {
    return { query: QUERIES.join(' / '), items: [] };
  }
}

async function main() {
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  const previous = await loadPrevious();

  try {
    const items = await fetchListings();
    const payload = {
      query: QUERIES.join(' / '),
      source: 'bunjang',
      fetchedAt: new Date().toISOString(),
      items,
    };
    await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(`매물 ${items.length}건 저장 완료`);
  } catch (err) {
    console.error('수집 실패:', err.message);
    const payload = {
      ...previous,
      lastError: { message: err.message, at: new Date().toISOString() },
    };
    await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    process.exitCode = 1;
  }
}

main();
