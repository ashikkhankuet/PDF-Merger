/* ============================================================
   CONVERTPRO — shared nav data + header/footer renderer
   ============================================================ */

const ICONS = {
  merge: '<path d="M8 3v11a2 2 0 0 0 2 2h9"/><path d="M16 3v11a2 2 0 0 1-2 2H5"/><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/>',
  compress: '<path d="M8 3v4a1 1 0 0 1-1 1H3"/><path d="M21 8h-4a1 1 0 0 1-1-1V3"/><path d="M3 16h4a1 1 0 0 1 1 1v4"/><path d="M16 21v-4a1 1 0 0 1 1-1h4"/>',
  img2pdf: '<rect x="3" y="3" width="10" height="10" rx="1.6"/><circle cx="6.3" cy="6.3" r="1.1"/><path d="M4 11l2.4-2.4L9 11.5"/><path d="M16 5h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-1"/><path d="M15 3v4h4"/>',
  pdf2img: '<path d="M6 3h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M13 3v5h5"/><rect x="7" y="12" width="7" height="6" rx="1"/><circle cx="9" cy="14.3" r=".8"/>',
  jpg2pdf: '<rect x="3" y="4" width="9" height="9" rx="1.6"/><circle cx="6" cy="7" r="1"/><path d="M4 11.5l2-2 2.5 2.5L11 9.5"/><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-3"/>',
  pdf2word: '<path d="M6 3h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M13 3v5h5"/><path d="M7.5 13l1.2 5 1.3-4 1.3 4 1.2-5"/>',
  split: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.5 15.5"/><path d="M14.5 14.5L20 20"/><path d="M8.5 8.5L11 11"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14h1v1h-1z"/><path d="M14 20h1v1h-1z"/><path d="M18 18h3v3h-3z"/>',
  img2text: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.4"/><path d="M4 16l4.5-4.5L12 15l3-3 5 5"/>',
  video: '<rect x="2.5" y="5" width="14" height="14" rx="2"/><path d="M16.5 10l5-3v10l-5-3z"/>',
  audio: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  doc: '<path d="M6 3h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M15 3v5h5"/><path d="M8 13h8M8 17h5"/>',
  code: '<path d="M8 5l-5 7 5 7"/><path d="M16 5l5 7-5 7"/>',
  hash: '<path d="M9 3L7 21M17 3l-2 18M4 9h17M3 15h17"/>',
  palette: '<path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H16a4 4 0 0 0 4-4c0-5-3.6-9.7-8-9.7z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="11" cy="7" r="1.2"/><circle cx="15.5" cy="9" r="1.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  link: '<path d="M9 15l6-6"/><path d="M13 5.5l1.5-1.5a3.5 3.5 0 0 1 5 5L18 10.5"/><path d="M11 18.5L9.5 20a3.5 3.5 0 0 1-5-5L6 13.5"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  resize: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  eraser: '<path d="M20 20H8l-6-6a2 2 0 0 1 0-2.8L13 2.4a2 2 0 0 1 2.8 0l5.8 5.8a2 2 0 0 1 0 2.8L14 18.5"/><path d="M8.5 13.5L15 20"/>',
  csv: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M4 15h16M9 4v16M15 4v16"/>',
  markdown: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 15V9l3 3 3-3v6"/><path d="M16 9v6M13.5 12.5L16 15l2.5-2.5"/>'
};

const CATEGORIES = [
  { key: 'PDF',      label: 'PDF Tools',      icon: 'merge',  pageUrl: '/pdf-tools' },
  { key: 'IMAGE',    label: 'Image Tools',    icon: 'img2pdf', pageUrl: '/image-tools' },
  { key: 'OCR',      label: 'Text & OCR',     icon: 'img2text', pageUrl: '/text-ocr-tools' },
  { key: 'DEV',      label: 'Developer Tools',icon: 'code',   pageUrl: '/developer-tools' },
  { key: 'DOCUMENT', label: 'Document Tools', icon: 'doc',    pageUrl: '/document-tools' },
  { key: 'CREATE',   label: 'Create',         icon: 'qr',     pageUrl: '/create-tools' },
  { key: 'VIDEO',    label: 'Video Tools',    icon: 'video',  soon: true },
  { key: 'AUDIO',    label: 'Audio Tools',    icon: 'audio',  soon: true },
];

const TOOLS = [
  { id: 'merge',    name: 'PDF Merger',       url: '/merge',        icon: 'merge',
    tag: 'PDF',   short: 'Combine multiple PDFs into one, in your chosen order.' },
  { id: 'compress', name: 'PDF Compressor',   url: '/compress',     icon: 'compress',
    tag: 'PDF',   short: 'Shrink PDF file size for email and uploads.' },
  { id: 'img2pdf',  name: 'Image to PDF',     url: '/image-to-pdf', icon: 'img2pdf',
    tag: 'IMAGE', short: 'Turn JPG, PNG, or WEBP photos into a PDF.' },
  { id: 'pdf2img',  name: 'PDF to Image',     url: '/pdf-to-image', icon: 'pdf2img',
    tag: 'PDF',   short: 'Export every PDF page as a PNG or JPG.' },
  { id: 'jpg2pdf',  name: 'JPG to PDF',       url: '/jpg-to-pdf',   icon: 'jpg2pdf',
    tag: 'IMAGE', short: 'Batch-convert JPG photos into a single PDF.' },
  { id: 'pdf2word', name: 'PDF to Word',      url: '/pdf-to-word',  icon: 'pdf2word',
    tag: 'PDF',   short: 'Extract PDF text into an editable .docx file.' },
  { id: 'split',    name: 'PDF Splitter',     url: '/split',        icon: 'split',
    tag: 'PDF',   short: 'Pull out pages or split one PDF into many.' },
  { id: 'qr',       name: 'QR Code Generator',url: '/qr-generator', icon: 'qr',
    tag: 'CREATE',short: 'Make a scannable QR code for a link or text.' },
  { id: 'img2text', name: 'Image to Text',    url: '/image-to-text',icon: 'img2text',
    tag: 'OCR',   short: 'Pull editable text out of a photo or screenshot.' },

  { id: 'pdf2text',    name: 'PDF to Text',        url: '/pdf-to-text',        icon: 'doc',
    tag: 'PDF',   short: 'Extract every word of a PDF as plain .txt.' },
  { id: 'img-compress',name: 'Image Compressor',   url: '/image-compressor',   icon: 'compress',
    tag: 'IMAGE', short: 'Shrink JPG/PNG file size with a quality slider.' },
  { id: 'svg2png',     name: 'SVG to PNG',         url: '/svg-to-png',         icon: 'img2pdf',
    tag: 'IMAGE', short: 'Rasterize an SVG into a PNG at any size.' },
  { id: 'json-format', name: 'JSON Formatter',     url: '/json-formatter',     icon: 'code',
    tag: 'DEV',   short: 'Format, validate, and minify JSON.' },
  { id: 'base64',      name: 'Base64 Encoder',     url: '/base64-encoder',     icon: 'hash',
    tag: 'DEV',   short: 'Encode or decode text and files as Base64.' },
  { id: 'regex',       name: 'Regex Tester',       url: '/regex-tester',       icon: 'code',
    tag: 'DEV',   short: 'Test a regular expression against sample text live.' },
  { id: 'color',       name: 'Color Converter',    url: '/color-converter',    icon: 'palette',
    tag: 'DEV',   short: 'Convert between HEX, RGB, and HSL instantly.' },
  { id: 'timestamp',   name: 'Timestamp Converter',url: '/timestamp-converter',icon: 'clock',
    tag: 'DEV',   short: 'Convert Unix timestamps to and from readable dates.' },

  { id: 'word2pdf', name: 'Word to PDF',    url: '/word-to-pdf', icon: 'doc',    tag: 'PDF',
    short: 'Convert a .docx file into a PDF.' },
  { id: 'pdf2excel', name: 'PDF to Excel',  url: '/pdf-to-excel', icon: 'csv',    tag: 'PDF',
    short: 'Pull tables out of a PDF into .xlsx.' },
  { id: 'pdf2ppt',   name: 'PDF to PowerPoint', url: '/pdf-to-powerpoint', icon: 'doc', tag: 'PDF',
    short: 'Turn each PDF page into an image slide.' },
  { id: 'heic2jpg',  name: 'HEIC to JPG',   url: '/heic-to-jpg', icon: 'img2pdf', tag: 'IMAGE',
    short: 'Convert iPhone HEIC photos to JPG.' },
  { id: 'heic2png',  name: 'HEIC to PNG',   url: '/heic-to-png', icon: 'img2pdf', tag: 'IMAGE',
    short: 'Convert iPhone HEIC photos to PNG.' },
  { id: 'jpg2webp',  name: 'JPG to WebP',   url: '/jpg-to-webp', icon: 'jpg2pdf', tag: 'IMAGE',
    short: 'Convert JPG images to the smaller WebP format.' },
  { id: 'png2webp',  name: 'PNG to WebP',   url: '/png-to-webp', icon: 'jpg2pdf', tag: 'IMAGE',
    short: 'Convert PNG images to the smaller WebP format.' },
  { id: 'webp2jpg',  name: 'WebP to JPG',   url: '/webp-to-jpg', icon: 'jpg2pdf', tag: 'IMAGE',
    short: 'Convert WebP images back to standard JPG.' },
  { id: 'pdf-ocr',   name: 'PDF OCR',       url: '/pdf-ocr', icon: 'img2text', tag: 'OCR',
    short: 'Extract text from a scanned (image-only) PDF.' },
  { id: 'img-resize',name: 'Image Resizer', url: '/image-resizer', icon: 'resize',  tag: 'IMAGE',
    short: 'Resize an image to exact pixel dimensions.' },
  { id: 'img-crop',  name: 'Image Cropper', url: '/image-cropper', icon: 'crop',    tag: 'IMAGE',
    short: 'Crop an image to the area you select.' },
  { id: 'exif',      name: 'Remove EXIF Data', url: '/remove-exif', icon: 'eraser', tag: 'IMAGE',
    short: 'Strip location and camera metadata from photos.' },
  { id: 'json2csv',  name: 'JSON to CSV',   url: '/json-to-csv', icon: 'csv',     tag: 'DEV',
    short: 'Convert a JSON array into a CSV spreadsheet.' },
  { id: 'xml2json',  name: 'XML to JSON',   url: '/xml-to-json', icon: 'code',    tag: 'DEV',
    short: 'Convert XML documents to JSON, and back.' },
  { id: 'url-short', name: 'URL Shortener', url: '/url-shortener', icon: 'link',    tag: 'DEV',
    short: 'Create a serverless short link — no backend needed.' },
  { id: 'pdf2md',    name: 'PDF to Markdown', url: '/pdf-to-markdown', icon: 'markdown', tag: 'DOCUMENT',
    short: 'Convert PDF text into Markdown formatting.' },
  { id: 'md2html',   name: 'Markdown to HTML', url: '/markdown-to-html', icon: 'markdown', tag: 'DOCUMENT',
    short: 'Render Markdown into clean HTML.' },
  { id: 'md2pdf',    name: 'Markdown to PDF', url: '/markdown-to-pdf', icon: 'markdown', tag: 'DOCUMENT',
    short: 'Turn a Markdown file into a formatted PDF.' },
];

function svgIcon(key, extra) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra||''}>${ICONS[key]}</svg>`;
}

const BRAND_IMG = '<span class="brand-mark"><img src="logo-mark.png" alt="ConvertKoro" /></span>';

const TAG_GRADIENT = {
  PDF:      'var(--grad-pdf)',
  IMAGE:    'var(--grad-image)',
  OCR:      'var(--grad-ocr)',
  DEV:      'var(--grad-dev)',
  DOCUMENT: 'var(--grad-document)',
  CREATE:   'var(--grad-create)',
};
function tintStyle(tag) {
  const grad = TAG_GRADIENT[tag] || TAG_GRADIENT.PDF;
  return `background:${grad};color:#fff;`;
}

function renderHeader(active) {
  const ddItemsAll = TOOLS.map(t => t.soon ? `
    <span class="dd-item dd-item-soon" data-name="${t.name.toLowerCase()}" data-cat="${t.tag}">
      <span class="ico" style="${tintStyle(t.tag)}">${svgIcon(t.icon)}</span>
      <span><strong>${t.name} <em>Soon</em></strong><span>${t.short}</span></span>
    </span>` : `
    <a class="dd-item" href="${t.url}" data-name="${t.name.toLowerCase()}" data-cat="${t.tag}">
      <span class="ico" style="${tintStyle(t.tag)}">${svgIcon(t.icon)}</span>
      <span><strong>${t.name}</strong><span>${t.short}</span></span>
    </a>`).join('');

  const catCounts = {};
  TOOLS.forEach(t => { catCounts[t.tag] = (catCounts[t.tag] || 0) + 1; });

  const catList = CATEGORIES.map((c, i) => {
    const count = catCounts[c.key] || 0;
    return `
    <button type="button" class="dd-cat ${i===0?'active':''}" data-cat="${c.key}" data-soon="${c.soon?1:0}">
      <span class="ico" style="${tintStyle(c.key)}">${svgIcon(c.icon)}</span>
      <span class="dd-cat-label">${c.label}</span>
      ${c.soon ? '<span class="dd-cat-soon">Soon</span>' : `<span class="dd-cat-count">${count}</span>`}
    </button>`;
  }).join('');

  const mobileToolLinks = TOOLS.map(t => t.soon
    ? `<span class="mob-soon">${t.name} <em>Soon</em></span>`
    : `<a href="${t.url}">${t.name}</a>`).join('');

  document.getElementById('site-header').outerHTML = `
  <header class="site-header">
    <div class="container">
      <div class="nav-row">
        <a class="wordmark" href="/">`+BRAND_IMG+`<span class="wordmark-text">Convert<span class="koro">Koro</span></span></a>
        <nav class="nav-main">
          <a class="nav-link ${active==='home'?'active':''}" href="/">Home</a>
          <div class="nav-dd" id="toolsDD">
            <button type="button" aria-expanded="false">All Tools
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="dd-panel">
              <div class="dd-sidebar">${catList}</div>
              <div class="dd-main">
                <div class="dd-search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input type="text" id="ddSearch" placeholder="Search ${TOOLS.length} tools&hellip;" autocomplete="off" />
                </div>
                <div class="dd-items" id="ddItems">${ddItemsAll}</div>
                <div class="dd-empty" id="ddEmpty">No tools match that search.</div>
                <div class="dd-soon" id="ddSoon">More tools in this category are on the way.</div>
              </div>
            </div>
          </div>
          <a class="nav-link ${active==='pdf-tools'?'active':''}" href="/pdf-tools">PDF</a>
          <a class="nav-link ${active==='image-tools'?'active':''}" href="/image-tools">Image</a>
          <button type="button" class="nav-link nav-cat-link" data-open-cat="VIDEO">Video
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <a class="nav-link ${active==='dev-tools'?'active':''}" href="/developer-tools">Developer</a>
          <a class="nav-link ${active==='about'?'active':''}" href="/about">About</a>
        </nav>
        <a class="nav-cta" href="/#tools">All tools &rarr;</a>
        <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">
          <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
          <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/></svg>
        </button>
        <button class="nav-toggle" id="mobToggle" aria-label="Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
        </button>
      </div>
      <div class="mobile-panel" id="mobPanel">
        <a href="/">Home</a>
        <div class="grp-label">Tools</div>
        ${mobileToolLinks}
        <div class="grp-label">More</div>
        <a href="/about">About</a>
        <a href="/faq">FAQ</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </div>
    </div>
  </header>`;

  const dd = document.getElementById('toolsDD');
  if (dd) {
    const btn = dd.querySelector('button');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dd.classList.toggle('open');
      btn.setAttribute('aria-expanded', dd.classList.contains('open'));
      if (dd.classList.contains('open')) setTimeout(() => document.getElementById('ddSearch').focus(), 50);
    });
    document.addEventListener('click', (e) => { if (!dd.contains(e.target)) dd.classList.remove('open'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dd.classList.remove('open'); });

    var ddSearch = document.getElementById('ddSearch');
    var ddItemsEl = document.getElementById('ddItems');
    var ddEmpty = document.getElementById('ddEmpty');
    var ddSoon = document.getElementById('ddSoon');
    var ddCats = Array.prototype.slice.call(dd.querySelectorAll('.dd-cat'));
    var activeCat = ddCats.length ? ddCats[0].getAttribute('data-cat') : null;

    function applyFilter() {
      var q = ddSearch.value.trim().toLowerCase();
      var searching = q.length > 0;
      var cat = null;
      for (var i = 0; i < ddCats.length; i++) { if (ddCats[i].classList.contains('active')) { cat = ddCats[i]; break; } }
      var isSoon = cat && cat.getAttribute('data-soon') === '1';

      if (isSoon && !searching) {
        ddItemsEl.style.display = 'none';
        ddEmpty.style.display = 'none';
        ddSoon.style.display = 'block';
        return;
      }
      ddSoon.style.display = 'none';
      ddItemsEl.style.display = 'grid';

      var visible = 0;
      var items = ddItemsEl.querySelectorAll('.dd-item');
      for (var j = 0; j < items.length; j++) {
        var item = items[j];
        var nameMatch = item.getAttribute('data-name').indexOf(q) !== -1;
        var catMatch = searching ? true : item.getAttribute('data-cat') === activeCat;
        var show = nameMatch && catMatch;
        item.style.display = show ? '' : 'none';
        if (show) visible++;
      }
      ddEmpty.style.display = visible === 0 ? 'block' : 'none';
    }

    for (var k = 0; k < ddCats.length; k++) {
      (function(catBtn) {
        catBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          for (var m = 0; m < ddCats.length; m++) { ddCats[m].classList.remove('active'); }
          catBtn.classList.add('active');
          activeCat = catBtn.getAttribute('data-cat');
          ddSearch.value = '';
          applyFilter();
        });
      })(ddCats[k]);
    }
    ddSearch.addEventListener('input', applyFilter);
    applyFilter();
    ddSearch.addEventListener('click', (e) => e.stopPropagation());

    window.openToolCategory = function(key) {
      if (key && key !== 'ALL') {
        for (var p = 0; p < ddCats.length; p++) {
          var isMatch = ddCats[p].getAttribute('data-cat') === key;
          ddCats[p].classList.toggle('active', isMatch);
          if (isMatch) activeCat = key;
        }
      }
      ddSearch.value = '';
      applyFilter();
      dd.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      dd.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => ddSearch.focus(), 300);
    };

    var catLinks = document.querySelectorAll('.nav-cat-link');
    for (var n = 0; n < catLinks.length; n++) {
      (function(link) {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          window.openToolCategory(link.getAttribute('data-open-cat'));
        });
      })(catLinks[n]);
    }
  }
  // Delegated so it also catches [data-open-cat] elements rendered later
  // (homepage category cards, footer links) regardless of render order.
  if (!window.__ckCatDelegated) {
    window.__ckCatDelegated = true;
    document.addEventListener('click', function(e) {
      var el = e.target.closest && e.target.closest('[data-open-cat]');
      if (!el || el.classList.contains('nav-cat-link')) return;
      e.preventDefault();
      if (typeof window.openToolCategory === 'function') {
        window.openToolCategory(el.getAttribute('data-open-cat'));
      }
    });
  }  const mobToggle = document.getElementById('mobToggle');
  const mobPanel = document.getElementById('mobPanel');
  if (mobToggle) mobToggle.addEventListener('click', () => mobPanel.classList.toggle('open'));

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('ck-theme', next); } catch (e) {}
  });
}

function applyStoredTheme() {
  let stored = null;
  try { stored = localStorage.getItem('ck-theme'); } catch (e) {}
  if (stored) document.documentElement.setAttribute('data-theme', stored);
}
applyStoredTheme();

function renderFooter() {
  const liveTools = TOOLS.filter(t => !t.soon);
  const pdfTools = liveTools.filter(t => t.tag === 'PDF').slice(0, 4);
  const otherTools = liveTools.filter(t => t.tag !== 'PDF').slice(0, 4);
  const toolLinksA = pdfTools.map(t => `<li><a href="${t.url}">${t.name}</a></li>`).join('')
    + `<li><a href="/pdf-tools">All PDF tools &rarr;</a></li>`;
  const toolLinksB = otherTools.map(t => `<li><a href="${t.url}">${t.name}</a></li>`).join('')
    + `<li><a href="/#tools">All ${liveTools.length} tools &rarr;</a></li>`;
  document.getElementById('site-footer').outerHTML = `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-about">
          <a class="wordmark" href="/">`+BRAND_IMG+`<span class="wordmark-text">Convert<span class="koro">Koro</span></span></a>
          <p>A free, no-login toolkit for everyday PDF and image conversions. Every file is processed on your own device &mdash; nothing is ever uploaded.</p>
        </div>
        <div><h4>PDF Tools</h4><ul>${toolLinksA}</ul></div>
        <div><h4>More Tools</h4><ul>${toolLinksB}</ul></div>
        <div><h4>Company</h4><ul>
          <li><a href="/about">About</a></li>
          <li><a href="/faq">FAQ</a></li>
          <li><a href="/privacy">Privacy Policy</a></li>
          <li><a href="/terms">Terms of Service</a></li>
        </ul></div>
        <div>
          <h4>Stay updated</h4>
          <p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 12px;line-height:1.5;">Get notified when new tools launch.</p>
          <div class="newsletter-row">
            <input type="email" id="newsEmail" placeholder="you@email.com" />
            <button id="newsBtn" type="button">Notify me</button>
          </div>
          <div class="newsletter-msg" id="newsMsg"></div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; <span id="yr"></span> ConvertKoro. All rights reserved. ConvertKoro is built independently and has no affiliation with Adobe, Microsoft, or Google.</p>
        <p class="mono" style="font-size:11.5px;">Built for people who'd rather not upload their files.</p>
      </div>
    </div>
  </footer>`;
  const yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  const newsBtn = document.getElementById('newsBtn');
  const newsEmail = document.getElementById('newsEmail');
  const newsMsg = document.getElementById('newsMsg');
  if (newsBtn) newsBtn.addEventListener('click', () => {
    const v = newsEmail.value.trim();
    if (!v || !v.includes('@')) { newsMsg.style.color = 'var(--err)'; newsMsg.textContent = 'Enter a valid email address.'; return; }
    newsMsg.style.color = 'var(--ok)'; newsMsg.textContent = 'Thanks! This list isn\u2019t active yet, but we\u2019ll have it ready soon.';
    newsEmail.value = '';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.getAttribute('data-page') || '';
  renderHeader(page);
  renderFooter();
});
