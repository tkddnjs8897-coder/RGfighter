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
import { chromium } from 'playwright';
import { MIN_PRICE, isTargetModel, isSoldOut, dropFarBelowMedian, parsePriceKRW } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'data', 'bunjang-listings.json');

// 검색어를 여러 개 시도해서 합친다 (하나만 쓰면 매칭이 느슨/과하게 갈릴 수 있음).
// "GSX-S1000GX" 형태로만 검색하면, 제목에 "s1000gx"처럼 GSX- 접두어나
// 하이픈 없이 적힌 매물이 번개장터 자체 검색 순위에서 밀려 100건 안에
// 안 잡히는 경우가 있어 표기 변형도 검색어에 추가한다.
const QUERIES = process.env.SEARCH_QUERY
  ? [process.env.SEARCH_QUERY]
  : ['스즈키 GSX-S1000GX', 'GSX-S1000GX', 's1000gx', 'gsx s1000gx'];

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

// 검색 API가 명목가(999, 1111원 등)를 돌려주는 매물의 실제 가격을
// 상품 상세 페이지에서 가져온다. "가격제안" 류 매물로 추정되며, 상세
// 페이지에는 실제 가격이 텍스트로 노출된다.
async function lookupRealPrice(browser, pid) {
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  try {
    await page.goto(`https://m.bunjang.co.kr/products/${pid}`, { waitUntil: 'networkidle', timeout: 20000 });

    // 1순위: 구조화 데이터(JSON-LD)에 있는 가격을 쓴다. 이 값은 이 상품에만
    // 해당하는 값이라 페이지 안의 다른(추천/관련) 상품과 섞일 위험이 없다.
    const ldPrice = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          const list = Array.isArray(data) ? data : [data];
          for (const entry of list) {
            const price = entry?.offers?.price ?? entry?.price;
            if (price) return Number(price);
          }
        } catch {
          // 무시하고 다음 스크립트 계속 확인
        }
      }
      return null;
    });
    if (Number.isFinite(ldPrice) && ldPrice > 0) return ldPrice;

    // 2순위: JSON-LD가 없으면 페이지 텍스트를 쓰되, "함께 보면 좋은 상품" 같은
    // 추천/관련 상품 섹션이 시작되기 전까지만 잘라서 찾는다. 그 섹션부터는
    // 다른 상품의 가격이 섞여 있어 전체 텍스트를 그대로 쓰면 오탐이 난다.
    const text = await page.evaluate(() => document.body.innerText);
    const cutIndex = text.search(/함께\s*보면|추천\s*상품|비슷한\s*상품|관련\s*상품|다른\s*상품/);
    const scoped = cutIndex > 0 ? text.slice(0, cutIndex) : text;
    return parsePriceKRW(scoped);
  } catch (err) {
    console.log(`상세 페이지 조회 실패(pid=${pid}): ${err.message}`);
    return null;
  } finally {
    await page.close();
  }
}

async function fetchListings() {
  const seen = new Set();
  const merged = [];
  const rawSample = [];
  const lowPriceCandidates = new Map();
  let totalRaw = 0;

  for (const query of QUERIES) {
    const rawList = await fetchOne(query);
    totalRaw += rawList.length;

    for (const item of rawList) {
      const price = Number(item.price ?? item.productPrice ?? item?.priceInfo?.price);
      const id = item.pid ?? item.id ?? item.productId;
      const title = item.name ?? item.title ?? item.productName ?? '';

      if (rawSample.length < 30) rawSample.push({ id, title, price });

      // 진단용: 사용자가 제보한 "무사고 무꿍" 매물이 검색 응답 자체에
      // 존재하는지(순위 밖으로 밀려서 안 잡히는 것인지) 확인한다.
      if (/무사고|무꿍/.test(title)) {
        console.log(`[진단] "무사고/무꿍" 포함 매물 발견: ${JSON.stringify({ query, id, title, price })}`);
      }

      // 가격이 비정상적으로 낮으면(명목가로 추정) 상세 페이지에서 실제 가격을
      // 다시 확인할 후보로 남겨둔다 (검색 API 응답에는 진짜 가격이 없었음 - 확인됨).
      if (Number.isFinite(price) && price > 0 && price < 10000 && isTargetModel(title) && id && !isSoldOut(JSON.stringify(item))) {
        lowPriceCandidates.set(String(id), String(title));
      }

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

  console.log(`번개장터 원본 매물 ${totalRaw}건(검색어 ${QUERIES.length}개 합산), 필터 통과 ${merged.length}건`);
  console.log('--- 진단용: 원본 매물 샘플 (최대 30개) ---');
  for (const s of rawSample) {
    console.log(JSON.stringify(s));
  }

  const toLookup = [...lowPriceCandidates].filter(([id]) => !seen.has(id)).slice(0, 5);
  if (toLookup.length > 0) {
    console.log(`명목가 의심 매물 ${toLookup.length}건, 상세 페이지에서 실제 가격 조회 시도`);
    const browser = await chromium.launch();
    try {
      for (const [id, title] of toLookup) {
        const realPrice = await lookupRealPrice(browser, id);
        console.log(`상세 페이지 조회: id=${id} title=${title} 실제가격=${realPrice}`);
        if (Number.isFinite(realPrice) && realPrice >= MIN_PRICE && !seen.has(id)) {
          seen.add(id);
          merged.push({ id, title, price: realPrice, url: `https://m.bunjang.co.kr/products/${id}`, platform: '번개장터' });
        }
      }
    } finally {
      await browser.close();
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
