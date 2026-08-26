const SEARCH_URLS = {
  daangn: (q) => `https://www.daangn.com/search/${encodeURIComponent(q)}`,
  bunjang: (q) => `https://m.bunjang.co.kr/search/products?order=score&q=${encodeURIComponent(q)}`,
  naver: (q) => `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}`,
};

document.querySelectorAll('#quick-search button[data-site]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const q = document.getElementById('search-keyword').value.trim();
    if (!q) return;
    const builder = SEARCH_URLS[btn.dataset.site];
    window.open(builder(q), '_blank', 'noopener');
  });
});

const listingForm = document.getElementById('listing-form');
const formError = document.getElementById('form-error');
const listingsList = document.getElementById('listings-list');
const listingCount = document.getElementById('listing-count');

function won(n) {
  return Number(n).toLocaleString('ko-KR') + '원';
}

function dateLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return '오늘자';
  return `${d.getMonth() + 1}/${d.getDate()} 등록`;
}

function summaryLine(item) {
  const mileage = Number(item.mileage).toLocaleString('ko-KR');
  const marks = [
    `탑박스${item.topBox ? 'O' : 'X'}`,
    `블박${item.blackBox ? 'O' : 'X'}`,
    `엔진가드${item.engineGuard ? 'O' : 'X'}`,
    `사고${item.crashHistory ? 'O' : 'X'}`,
    `꿍${item.tipOver ? 'O' : 'X'}`,
  ].join(' ');
  return `${dateLabel(item.createdAt)} ${item.year}년식, ${mileage}km, 가격은 ${won(item.price)}입니다 (${marks})`;
}

async function fetchListings() {
  const res = await fetch('/api/listings');
  const listings = await res.json();
  renderListings(listings);
}

function renderListings(listings) {
  listingCount.textContent = listings.length;
  listingsList.innerHTML = '';

  if (listings.length === 0) {
    listingsList.innerHTML = '<p class="hint">아직 등록된 매물이 없습니다.</p>';
    return;
  }

  listings
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((item) => {
      const row = document.createElement('div');
      row.className = 'listing-row';
      row.innerHTML = `
        <div class="listing-main">
          <span class="platform-badge">${escapeHtml(item.platform)}</span>
          <span class="summary">${escapeHtml(summaryLine(item))}</span>
          ${item.tuned ? `<span class="tag tuned">튜닝: ${escapeHtml(item.tuningNote || '내용 없음')}</span>` : ''}
          ${item.crashHistory ? '<span class="tag warning">사고이력</span>' : ''}
          ${item.tipOver ? '<span class="tag warning">꿍(전도)</span>' : ''}
          ${item.note ? `<span class="tag note">${escapeHtml(item.note)}</span>` : ''}
          ${item.url ? `<a class="tag link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">원문보기</a>` : ''}
        </div>
        <button class="del-btn" data-id="${item.id}">삭제</button>
      `;
      listingsList.appendChild(row);
    });

  listingsList.querySelectorAll('.del-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/listings/${btn.dataset.id}`, { method: 'DELETE' });
      fetchListings();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

listingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.textContent = '';
  const fd = new FormData(listingForm);
  const payload = {
    platform: fd.get('platform'),
    price: fd.get('price'),
    year: fd.get('year'),
    mileage: fd.get('mileage'),
    tuned: fd.get('tuned') === 'on',
    tuningNote: fd.get('tuningNote'),
    topBox: fd.get('topBox') === 'on',
    blackBox: fd.get('blackBox') === 'on',
    engineGuard: fd.get('engineGuard') === 'on',
    crashHistory: fd.get('crashHistory') === 'on',
    tipOver: fd.get('tipOver') === 'on',
    url: fd.get('url'),
    note: fd.get('note'),
  };

  const res = await fetch('/api/listings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json();
    formError.textContent = (data.errors || [data.error]).join(', ');
    return;
  }

  listingForm.reset();
  fetchListings();
});

const estimateForm = document.getElementById('estimate-form');
const estimateResult = document.getElementById('estimate-result');

estimateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(estimateForm);
  const payload = {
    year: fd.get('year'),
    mileage: fd.get('mileage'),
    tuned: fd.get('tuned') === 'on',
    candidatePrice: fd.get('candidatePrice') || undefined,
  };

  const res = await fetch('/api/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  if (data.estimated === null) {
    estimateResult.innerHTML = `<p class="hint">${data.message}</p>`;
    return;
  }

  let html = `
    <div class="estimate-price">추정 시세: ${won(data.estimated)}</div>
    <p class="hint">비교 매물 ${data.sampleSize}건 기반 가중평균 추정치입니다.</p>
  `;

  if (data.verdict) {
    const labels = {
      cheap: `👍 저렴한 매물 (${data.diffPercent.toFixed(1)}%)`,
      fair: `⚖️ 적정가 (${data.diffPercent.toFixed(1)}%)`,
      expensive: `⚠️ 비싼 편 (${data.diffPercent.toFixed(1)}%)`,
    };
    html += `<div class="verdict ${data.verdict}">${labels[data.verdict]}</div>`;
  }

  estimateResult.innerHTML = html;
});

fetchListings();
