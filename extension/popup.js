const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const errorEl = document.getElementById('error');
const badgeEl = document.getElementById('badge');

chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
  const tab = tabs[0];
  if (!tab.url || !tab.url.includes('shopee.vn')) {
    statusEl.textContent = 'Hay mo trang san pham Shopee truoc!';
    return;
  }

  try {
    const [{result}] = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: grabShopeeData
    });

    if (!result || result.error) {
      showError(result?.error || 'Khong lay duoc du lieu. Hay mo trang san pham cu the.');
      return;
    }

    statusEl.style.display = 'none';
    renderResult(result);
  } catch (e) {
    showError('Loi: ' + e.message);
  }
});

function grabShopeeData() {
  try {
    const data = {images: [], videos: [], name: '', price: '', sold: '', shop: '', url: location.href};

    // Try getting from page's script data
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const t = s.textContent;
      if (t.includes('item_basic') || t.includes('"name"') && t.includes('"images"')) {
        try {
          // Look for JSON data in scripts
          const match = t.match(/"images"\s*:\s*\[([^\]]+)\]/);
          if (match) {
            const hashes = match[1].match(/"([a-f0-9]{32})"/g);
            if (hashes) {
              data.images = hashes.map(h => 'https://down-vn.img.susercontent.com/file/' + h.replace(/"/g, ''));
            }
          }
        } catch (e) {}
      }
    }

    // Get product name
    const nameEl = document.querySelector('[class*="product-title"], [class*="item-name"], h1[class*="title"]');
    if (nameEl) data.name = nameEl.textContent.trim();
    if (!data.name) {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) data.name = ogTitle.content;
    }
    if (!data.name) {
      // Try from breadcrumb or page title
      const h1 = document.querySelector('h1');
      if (h1) data.name = h1.textContent.trim();
    }

    // Get price
    const priceEl = document.querySelector('[class*="price"], [class*="Price"]');
    if (priceEl) data.price = priceEl.textContent.trim();

    // Get sold count
    const soldEl = document.querySelector('[class*="sold"], [class*="Sold"]');
    if (soldEl) data.sold = soldEl.textContent.trim();

    // Get shop name
    const shopEl = document.querySelector('[class*="shop-name"], [class*="ShopName"]');
    if (shopEl) data.shop = shopEl.textContent.trim();

    // Get images from product image carousel/gallery
    if (data.images.length === 0) {
      const allImgs = document.querySelectorAll('img[src*="susercontent.com"], img[src*="shopee"]');
      const seen = new Set();
      for (const img of allImgs) {
        let src = img.src || img.dataset?.src || '';
        if (!src || src.includes('icon') || src.includes('logo')) continue;
        // Get high-res version
        src = src.replace(/_tn$/, '').replace(/\?.*/, '');
        if (img.width < 50 && img.height < 50) continue;
        if (!seen.has(src)) {
          seen.add(src);
          data.images.push(src);
        }
      }
    }

    // Get videos
    const videoEls = document.querySelectorAll('video source, video[src]');
    for (const v of videoEls) {
      const src = v.src || v.getAttribute('src');
      if (src) data.videos.push(src);
    }

    // Also check for video thumbnails / video data in page
    const videoContainers = document.querySelectorAll('[class*="video"], [class*="Video"]');
    for (const vc of videoContainers) {
      const poster = vc.querySelector('video')?.poster;
      if (poster && !data.videos.includes(poster)) {
        const videoSrc = vc.querySelector('video')?.src || vc.querySelector('source')?.src;
        if (videoSrc && !data.videos.includes(videoSrc)) data.videos.push(videoSrc);
      }
    }

    return data;
  } catch (e) {
    return {error: e.message};
  }
}

function showError(msg) {
  statusEl.style.display = 'none';
  errorEl.style.display = 'block';
  errorEl.textContent = msg;
}

function renderResult(data) {
  resultEl.style.display = 'block';
  badgeEl.style.display = 'inline';
  badgeEl.textContent = data.images.length + ' anh' + (data.videos.length ? ', ' + data.videos.length + ' video' : '');

  let html = '';
  if (data.name) html += '<div class="product-name">' + escHtml(data.name) + '</div>';
  if (data.price) html += '<div class="product-price">' + escHtml(data.price) + '</div>';
  if (data.sold || data.shop) html += '<div class="product-info">' + (data.sold ? 'Da ban: ' + escHtml(data.sold) : '') + (data.shop ? ' | Shop: ' + escHtml(data.shop) : '') + '</div>';

  if (data.images.length > 0) {
    html += '<div class="section-title">Hinh anh (' + data.images.length + ')</div>';
    html += '<div class="select-bar"><button onclick="selectAll()">Chon tat ca</button><button onclick="deselectAll()">Bo chon</button></div>';
    html += '<div class="images-grid">';
    data.images.forEach((img, i) => {
      html += '<img src="' + escHtml(img) + '" class="selected" data-index="' + i + '" onclick="toggleImg(this)" title="' + (i + 1) + '">';
    });
    html += '</div>';
  }

  if (data.videos.length > 0) {
    html += '<div class="section-title">Video (' + data.videos.length + ')</div>';
    data.videos.forEach((v, i) => {
      html += '<div class="video-item" onclick="window.open(\'' + escHtml(v) + '\')"><span class="video-icon">🎬</span><span class="video-info">Video ' + (i + 1) + '</span></div>';
    });
  }

  html += '<button class="btn btn-primary" onclick="copyData()">Copy du lieu</button>';
  html += '<button class="btn btn-secondary" onclick="downloadImages()">Tai anh da chon</button>';

  resultEl.innerHTML = html;
  window._shopeeData = data;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function toggleImg(el) {
  el.classList.toggle('selected');
}

function selectAll() {
  document.querySelectorAll('.images-grid img').forEach(i => i.classList.add('selected'));
}

function deselectAll() {
  document.querySelectorAll('.images-grid img').forEach(i => i.classList.remove('selected'));
}

function copyData() {
  const d = window._shopeeData;
  const selectedImgs = [...document.querySelectorAll('.images-grid img.selected')].map(i => i.src);
  const text = [
    d.name,
    d.price,
    d.sold ? 'Da ban: ' + d.sold : '',
    d.shop ? 'Shop: ' + d.shop : '',
    '',
    'Hinh anh:',
    ...selectedImgs,
    '',
    d.videos.length ? 'Video:\n' + d.videos.join('\n') : '',
    '',
    'Link: ' + d.url
  ].filter(Boolean).join('\n');

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.btn-primary');
    btn.textContent = 'Da copy!';
    btn.style.background = '#38a169';
    setTimeout(() => { btn.textContent = 'Copy du lieu'; btn.style.background = '#ee4d2d'; }, 2000);
  });
}

function downloadImages() {
  const selected = [...document.querySelectorAll('.images-grid img.selected')].map(i => i.src);
  if (!selected.length) { alert('Chua chon anh nao!'); return; }
  selected.forEach((url, i) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shopee_' + (i + 1) + '.jpg';
    a.click();
  });
}
