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
const QUERY = process.env.NAVER_QUERY || 'GSX-S1000GX 중고';

const SEARCH_URL = 'https://search.naver.com/search.naver?' + new URLSearchParams({ query: QUERY });

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

async function fetchListings() {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ko-KR',
    });

    await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 30000 });
    // 카페 결과 섹션이 초기 로딩 이후에도 늦게 붙는 경우가 있어 조금 더 기다린다.
    await page.waitForTimeout(1500);

    // 앵커 자체의 텍스트(제목)와, 근처 조상 요소의 텍스트(스니펫/가격이
    // 보통 여기 있음)를 함께 가져온다. 조상을 너무 넓게 잡으면 옆 결과의
    // 텍스트까지 섞여 들어오므로, 부모를 2단계까지만 올라간다.
    const raw = await page.$$eval('a[href*="cafe.naver.com"]', (anchors) => {
      function scopedContext(el) {
        var node = el;
        for (var i = 0; i < 2 && node.parentElement; i++) node = node.parentElement;
        return (node.textContent || '').slice(0, 500);
      }
      return anchors.map(function (a) {
        return {
          href: a.href,
          title: (a.textContent || '').replace(/\s+/g, ' ').trim(),
          context: scopedContext(a).replace(/\s+/g, ' ').trim(),
        };
      });
    });

    const seen = new Set();
    const candidates = [];

    for (const { href, title, context } of raw) {
      if (!title || seen.has(href)) continue;
      if (!isTargetModel(title)) continue;
      if (isSoldOut(title) || isSoldOut(context)) continue;

      const price = parsePriceKRW(title) ?? parsePriceKRW(context);
      if (!Number.isFinite(price) || price < MIN_PRICE) continue;

      seen.add(href);
      candidates.push({ id: href, title, price, url: href, platform: '바튜매' });
    }

    console.log(`cafe.naver.com 링크 ${raw.length}개 발견, 모델/가격 조건 통과 ${candidates.length}건`);
    if (candidates.length === 0) {
      // 왜 0건인지 진단하기 위해 실제로 잡힌 링크의 제목/URL을 그대로 로그에 남긴다.
      console.log('--- 진단용: 발견된 링크 원본 (최대 15개) ---');
      for (const { href, title } of raw.slice(0, 15)) {
        console.log(JSON.stringify({ href, title }));
      }
    }

    const items = dropFarBelowMedian(candidates).sort((a, b) => a.price - b.price);

    if (items.length === 0) {
      throw new Error(
        `카페 글에서 가격을 파싱하지 못했습니다 (cafe.naver.com 링크 ${raw.length}개 중 매칭 0건). ` +
          '검색 결과 구조가 바뀌었거나, 접근이 차단됐거나, 검색어와 맞는 글이 없을 수 있습니다.'
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
    return { query: QUERY, items: [] };
  }
}

async function main() {
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  const previous = await loadPrevious();

  try {
    const items = await fetchListings();
    const payload = {
      query: QUERY,
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
      query: QUERY,
      lastError: { message: err.message, at: new Date().toISOString() },
    };
    await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    process.exitCode = 1;
  }
}

main();
