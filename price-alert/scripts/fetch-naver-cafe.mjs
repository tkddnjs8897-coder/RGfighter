#!/usr/bin/env node
// 네이버 통합검색 결과 페이지에서 "바튜매" 카페 글(cafe.naver.com 링크)을
// 찾아 제목/스니펫에서 가격을 뽑아 저장합니다. 바튜매는 로그인해야 카페
// 검색 결과 화면 자체가 보이지만, 네이버 일반 검색에는 카페 글 제목/미리보기가
// 로그인 없이도 노출되는 경우가 많아 그걸 활용합니다.
//
// 첫 시도는 단순 HTTP 요청으로 페이지를 받아 파싱했는데, 실제 카페 글
// 목록은 자바스크립트로 나중에 로딩되는 부분이라 안 보였다(요청 자체는
// 성공했지만 매칭 0건). 그래서 Playwright로 실제 브라우저처럼 페이지를
// 열고 렌더링이 끝난 뒤 파싱한다.
//
// 공식 API가 아니라 검색 결과 페이지를 직접 렌더링/파싱하는 방식이라,
// 네이버가 페이지 구조를 바꾸거나 자동화 요청을 차단하면 언제든 깨질 수
// 있습니다. 실패해도 기존 결과는 덮어쓰지 않고 lastError만 기록합니다.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { MIN_PRICE, isTargetModel, isSoldOut, dropFarBelowMedian } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'data', 'naver-cafe-listings.json');

// 검색어 하나로는 실제 판매글이 안 잡히는 경우가 있어(질문글만 걸리는 등),
// 여러 검색어로 시도해서 합친다.
const QUERIES = process.env.NAVER_QUERY
  ? [process.env.NAVER_QUERY]
  : ['GSX-S1000GX 중고', 'GSX-S1000GX 판매', 'GSX-S1000GX 팝니다'];

function buildUrl(query) {
  return 'https://search.naver.com/search.naver?' + new URLSearchParams({ query });
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

async function fetchOne(browser, query) {
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });

  try {
    await page.goto(buildUrl(query), { waitUntil: 'networkidle', timeout: 30000 });
    // 카페 결과 섹션이 초기 로딩 이후에도 늦게 붙는 경우가 있어 조금 더 기다린다.
    await page.waitForTimeout(1500);

    // 앵커 자체의 텍스트(제목)와, 근처 조상 요소의 텍스트(스니펫/가격이
    // 보통 여기 있음)를 함께 가져온다. 조상을 너무 넓게 잡으면 옆 결과의
    // 텍스트까지 섞여 들어오므로, 부모를 2단계까지만 올라간다.
    return await page.$$eval('a[href*="cafe.naver.com"]', (anchors) => {
      function scopedContext(el) {
        var node = el;
        for (var i = 0; i < 2 && node.parentElement; i++) node = node.parentElement;
        return (node.textContent || '').slice(0, 500);
      }
      return anchors.map(function (a) {
        // "새 창 열림"은 스크린리더용 접근성 안내문구라 실제 제목이 아니다.
        var title = (a.textContent || '').replace(/\s+/g, ' ').trim().replace(/새\s*창\s*열림\s*$/, '').trim();
        return {
          href: a.href,
          title: title,
          context: scopedContext(a).replace(/\s+/g, ' ').trim(),
        };
      });
    });
  } finally {
    await page.close();
  }
}

// 같은 글이 검색어마다 다른 추적 토큰(?art=...)을 달고 나와서, 토큰을 뗀
// 기본 URL로 중복을 제거한다.
function baseUrl(href) {
  return href.split('?')[0];
}

async function fetchListings() {
  const browser = await chromium.launch();

  try {
    const seen = new Set();
    const candidates = [];
    let totalLinks = 0;
    const sampleForDiagnostics = [];

    for (const query of QUERIES) {
      const raw = await fetchOne(browser, query);
      totalLinks += raw.length;
      if (sampleForDiagnostics.length < 15) sampleForDiagnostics.push(...raw.slice(0, 15 - sampleForDiagnostics.length));

      for (const { href, title, context } of raw) {
        const key = baseUrl(href);
        if (!title || seen.has(key)) continue;
        if (!isTargetModel(title)) continue;
        if (isSoldOut(title) || isSoldOut(context)) continue;

        const price = parsePriceKRW(title) ?? parsePriceKRW(context);
        if (!Number.isFinite(price) || price < MIN_PRICE) continue;

        seen.add(key);
        candidates.push({ id: key, title, price, url: href, platform: '바튜매' });
      }
    }

    console.log(`cafe.naver.com 링크 ${totalLinks}개 발견(검색어 ${QUERIES.length}개 합산), 모델/가격 조건 통과 ${candidates.length}건`);
    if (candidates.length === 0) {
      // 왜 0건인지 진단하기 위해 실제로 잡힌 링크의 제목/URL을 그대로 로그에 남긴다.
      console.log('--- 진단용: 발견된 링크 원본 (최대 15개) ---');
      for (const { href, title } of sampleForDiagnostics) {
        console.log(JSON.stringify({ href, title }));
      }
    }

    const items = dropFarBelowMedian(candidates).sort((a, b) => a.price - b.price);

    if (items.length === 0) {
      throw new Error(
        `카페 글에서 가격을 파싱하지 못했습니다 (cafe.naver.com 링크 ${totalLinks}개 중 매칭 0건). ` +
          '검색 결과 구조가 바뀌었거나, 접근이 차단됐거나, 지금 시점에 조건에 맞는 판매글이 없을 수 있습니다.'
      );
    }

    return items;
  } finally {
    await browser.close();
  }
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
