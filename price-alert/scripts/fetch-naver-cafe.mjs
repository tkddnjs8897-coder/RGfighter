#!/usr/bin/env node
// 네이버 통합검색 결과 페이지에서 "바튜매" 카페 글(cafe.naver.com 링크)을
// 찾아 제목/스니펫에서 가격을 뽑아 저장합니다. 바튜매는 로그인해야 카페
// 검색 결과 화면 자체가 보이지만, 네이버 일반 검색에는 카페 글 제목/미리보기가
// 로그인 없이도 노출되는 경우가 많아 그걸 활용합니다.
//
// 공식 API가 아니라 검색 결과 페이지 HTML을 직접 파싱하는 방식이라,
// 네이버가 페이지 구조를 바꾸거나 자동화 요청을 차단하면 언제든 깨질 수
// 있습니다. 실패해도 기존 결과는 덮어쓰지 않고 lastError만 기록합니다.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_PRICE, isTargetModel, isSoldOut, dropFarBelowMedian } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'data', 'naver-cafe-listings.json');
// "바튜매 GSX-S1000GX 판매"처럼 너무 좁게 쓰면 실제로 뜨는 카페 글과 매칭이
// 안 될 수 있어, 사용자가 실제로 검색해서 결과가 나온다고 확인해준 문구로 맞춤.
const QUERY = process.env.NAVER_QUERY || 'GSX-S1000GX 중고';

const SEARCH_URL = 'https://search.naver.com/search.naver?' + new URLSearchParams({ query: QUERY });

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
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

async function fetchListings() {
  const res = await fetch(SEARCH_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`네이버 검색 요청 실패: HTTP ${res.status}`);
  }

  const html = await res.text();

  // cafe.naver.com으로 가는 링크만 뽑는다. CSS 클래스명은 자주 바뀌지만
  // 이 도메인 패턴은 상대적으로 안정적이다.
  const linkRegex = /<a[^>]+href="(https?:\/\/cafe\.naver\.com[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const seen = new Set();
  const candidates = [];
  let match;
  let linkCount = 0;

  while ((match = linkRegex.exec(html)) !== null) {
    linkCount += 1;
    const url = match[1];
    if (seen.has(url)) continue;

    const title = stripTags(match[2]);
    // 모델 판별은 제목만으로 한다(문맥 창을 쓰면 다음 링크의 텍스트까지
    // 섞여 들어와 다른 모델을 오매칭할 수 있다 - 테스트로 확인함).
    if (!title || !isTargetModel(title)) continue;
    if (isSoldOut(title)) continue;

    // 가격은 제목에 없으면, 이 링크 뒤부터 다음 <a 태그가 나오기 전까지의
    // 스니펫 구간(최대 300자)에서 찾는다.
    const afterLinkStart = match.index + match[0].length;
    const nextAnchorIdx = html.indexOf('<a ', afterLinkStart);
    const contextEnd = nextAnchorIdx === -1 ? afterLinkStart + 300 : Math.min(nextAnchorIdx, afterLinkStart + 300);
    const context = stripTags(html.slice(afterLinkStart, contextEnd));
    if (isSoldOut(context)) continue;

    const price = parsePriceKRW(title) ?? parsePriceKRW(context);
    if (!Number.isFinite(price) || price < MIN_PRICE) continue;

    seen.add(url);
    candidates.push({
      id: url,
      title,
      price,
      url,
      platform: '바튜매',
    });
  }

  console.log(`cafe.naver.com 링크 ${linkCount}개 발견, 모델/가격 조건 통과 ${candidates.length}건`);

  const items = dropFarBelowMedian(candidates).sort((a, b) => a.price - b.price);

  if (items.length === 0) {
    throw new Error(
      `카페 글에서 가격을 파싱하지 못했습니다 (cafe.naver.com 링크 ${linkCount}개 중 매칭 0건). ` +
        '검색 결과 구조가 바뀌었거나, 접근이 차단됐거나, 검색어와 맞는 글이 없을 수 있습니다.'
    );
  }

  return items;
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
      lastError: { message: err.message, at: new Date().toISOString() },
    };
    await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    process.exitCode = 1;
  }
}

main();
