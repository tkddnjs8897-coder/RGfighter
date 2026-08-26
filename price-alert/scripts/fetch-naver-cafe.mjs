#!/usr/bin/env node
// 네이버 오픈 API(카페글 검색)로 "바튜매" 등 카페 글에서 GSX-S1000GX 매물을
// 찾아 가격을 뽑아 저장합니다. https://developers.naver.com 에서 발급받은
// Client ID/Secret이 필요합니다 (NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
// 환경변수 = GitHub Actions Secrets).
//
// 이전에는 헤드리스 브라우저(Playwright)로 검색 결과 페이지를 직접 렌더링/
// 파싱했는데, 공식 API가 있으면 그게 훨씬 안정적이고 빠르다 (로그인 불필요,
// 페이지 구조 변경에 영향 없음, 공식 지원).
//
// 실패해도 기존 결과는 덮어쓰지 않고 lastError만 기록해, 페이지는 마지막
// 성공 데이터를 계속 보여줍니다.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_PRICE, isTargetModel, isSoldOut, dropFarBelowMedian } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'data', 'naver-cafe-listings.json');

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// 검색어 하나로는 실제 판매글이 안 잡히는 경우가 있어(질문글만 걸리는 등),
// 여러 검색어로 시도해서 합친다.
const QUERIES = process.env.NAVER_QUERY
  ? [process.env.NAVER_QUERY]
  : ['GSX-S1000GX 중고', 'GSX-S1000GX 판매', 'GSX-S1000GX 팝니다'];

function buildUrl(query) {
  return (
    'https://openapi.naver.com/v1/search/cafearticle.json?' +
    new URLSearchParams({ query, display: '100', sort: 'sim' })
  );
}

function cleanText(html) {
  return (html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim();
}

function parsePriceKRW(text) {
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

async function fetchOne(query) {
  const res = await fetch(buildUrl(query), {
    headers: {
      'X-Naver-Client-Id': CLIENT_ID,
      'X-Naver-Client-Secret': CLIENT_SECRET,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`네이버 API 요청 실패(${query}): HTTP ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

async function fetchListings() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 설정되지 않았습니다. ' +
        'developers.naver.com에서 발급받아 저장소 Settings → Secrets and variables → Actions에 추가해주세요.'
    );
  }

  const seen = new Set();
  const candidates = [];
  let totalItems = 0;

  for (const query of QUERIES) {
    const items = await fetchOne(query);
    totalItems += items.length;

    for (const raw of items) {
      const title = cleanText(raw.title);
      const description = cleanText(raw.description);
      const link = raw.link;
      if (!title || !link || seen.has(link)) continue;
      if (!isTargetModel(title)) continue;
      if (isSoldOut(title) || isSoldOut(description)) continue;

      const price = parsePriceKRW(title) ?? parsePriceKRW(description);
      if (!Number.isFinite(price) || price < MIN_PRICE) continue;

      seen.add(link);
      candidates.push({ id: link, title, price, url: link, platform: '바튜매' });
    }
  }

  console.log(`네이버 카페글 검색 API 결과 ${totalItems}건(검색어 ${QUERIES.length}개 합산), 모델/가격 조건 통과 ${candidates.length}건`);

  const items = dropFarBelowMedian(candidates).sort((a, b) => a.price - b.price);

  if (items.length === 0) {
    throw new Error(`카페 글 ${totalItems}건 중 조건(모델명/가격/판매완료 제외)에 맞는 매물이 없습니다. 지금 시점에 실제 판매글이 없을 수 있습니다.`);
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
      source: 'naver-cafe',
      fetchedAt: new Date().toISOString(),
      items,
    };
    await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(`매물 ${items.length}건 저장 완료`);
  } catch (err) {
    console.error('수집 실패:', err.message);
    const payload = {
      ...previous,
      query: QUERIES.join(' / '),
      lastError: { message: err.message, at: new Date().toISOString() },
    };
    await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    process.exitCode = 1;
  }
}

main();
