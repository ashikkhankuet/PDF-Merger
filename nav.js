/* ============================================================
   CONVERTPRO — shared nav data + header/footer renderer
   ============================================================ */

const ICONS = {
  merge: '<path d="M8 3v11a2 2 0 0 0 2 2h9"/><path d="M16 3v11a2 2 0 0 1-2 2H5"/><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/>',
  compress: '<path d="M8 3v4a1 1 0 0 1-1 1H3"/><path d="M21 8h-4a1 1 0 0 1-1-1V3"/><path d="M3 16h4a1 1 0 0 1 1 1v4"/><path d="M16 21v-4a1 1 0 0 1 1-1h4"/>',
  img2pdf: '<rect x="3" y="3" width="10" height="10" rx="1.6"/><circle cx="6.3" cy="6.3" r="1.1"/><path d="M4 11l2.4-2.4L9 11.5"/><path d="M16 5h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-1"/><path d="M15 3v4h4"/>',
  pdf2img: '<path d="M6 3h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M13 3v5h5"/><rect x="7" y="12" width="7" height="6" rx="1"/><circle cx="9" cy="14.3" r=".8"/>',
  jpg2pdf: '<rect x="3" y="4" width="9" height="9" rx="1.6"/><circle cx="6" cy="7" r="1"/><path d="M4 11.5l2-2 2.5 2.5L11 9.5"/><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-3"/>',
  split: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.5 15.5"/><path d="M14.5 14.5L20 20"/><path d="M8.5 8.5L11 11"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14h1v1h-1z"/><path d="M14 20h1v1h-1z"/><path d="M18 18h3v3h-3z"/>',
  img2text: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.4"/><path d="M4 16l4.5-4.5L12 15l3-3 5 5"/>'
};

const TOOLS = [
  { id: 'merge',    name: 'PDF Merger',       url: 'merge.html',        icon: 'merge',
    tag: 'PDF',   short: 'Combine multiple PDFs into one, in your chosen order.' },
  { id: 'compress', name: 'PDF Compressor',   url: 'compress.html',     icon: 'compress',
    tag: 'PDF',   short: 'Shrink PDF file size for email and uploads.' },
  { id: 'img2pdf',  name: 'Image to PDF',     url: 'image-to-pdf.html', icon: 'img2pdf',
    tag: 'IMAGE', short: 'Turn JPG, PNG, or WEBP photos into a PDF.' },
  { id: 'pdf2img',  name: 'PDF to Image',     url: 'pdf-to-image.html', icon: 'pdf2img',
    tag: 'PDF',   short: 'Export every PDF page as a PNG or JPG.' },
  { id: 'jpg2pdf',  name: 'JPG to PDF',       url: 'jpg-to-pdf.html',   icon: 'jpg2pdf',
    tag: 'IMAGE', short: 'Batch-convert JPG photos into a single PDF.' },
  { id: 'split',    name: 'PDF Splitter',     url: 'split.html',        icon: 'split',
    tag: 'PDF',   short: 'Pull out pages or split one PDF into many.' },
  { id: 'qr',       name: 'QR Code Generator',url: 'qr-generator.html', icon: 'qr',
    tag: 'CREATE',short: 'Make a scannable QR code for a link or text.' },
  { id: 'img2text', name: 'Image to Text',    url: 'image-to-text.html',icon: 'img2text',
    tag: 'OCR',   short: 'Pull editable text out of a photo or screenshot.' },
];

function svgIcon(key, extra) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra||''}>${ICONS[key]}</svg>`;
}

const TAG_TINT = {
  PDF:    { bg: 'var(--signal-tint)',      fg: 'var(--signal-dk)' },
  IMAGE:  { bg: 'var(--accent-blue-tint)', fg: 'var(--accent-blue)' },
  OCR:    { bg: 'var(--ok-tint)',          fg: 'var(--ok)' },
  CREATE: { bg: 'var(--accent-plum-tint)', fg: 'var(--accent-plum)' },
};
function tintStyle(tag) {
  const t = TAG_TINT[tag] || TAG_TINT.PDF;
  return `background:${t.bg};color:${t.fg};`;
}

function renderHeader(active) {
  const ddItems = TOOLS.map(t => `
    <a class="dd-item" href="${t.url}">
      <span class="ico" style="${tintStyle(t.tag)}">${svgIcon(t.icon)}</span>
      <span><strong>${t.name}</strong><span>${t.short}</span></span>
    </a>`).join('');

  const mobileToolLinks = TOOLS.map(t => `<a href="${t.url}">${t.name}</a>`).join('');

  document.getElementById('site-header').outerHTML = `
  <header class="site-header">
    <div class="container">
      <div class="nav-row">
        <a class="wordmark" href="index.html"><span class="brand-mark"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#181A14"/><path d="M13 11h10l6 6v11a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2z" fill="#F4F5F2"/><path d="M23 11l6 6h-6z" fill="#E5470B"/><rect x="14" y="22.5" width="10" height="2" rx="1" fill="#ADB19F"/><rect x="14" y="26.5" width="7" height="2" rx="1" fill="#ADB19F"/></svg></span>CONVERT<span class="slash">/</span>KORO</a>
        <nav class="nav-main">
          <a class="nav-link ${active==='home'?'active':''}" href="index.html">Home</a>
          <div class="nav-dd" id="toolsDD">
            <button type="button" aria-expanded="false">Tools
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="dd-panel">${ddItems}</div>
          </div>
          <a class="nav-link ${active==='about'?'active':''}" href="about.html">About</a>
          <a class="nav-link ${active==='faq'?'active':''}" href="faq.html">FAQ</a>
        </nav>
        <a class="nav-cta" href="index.html#tools">All tools &rarr;</a>
        <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">
          <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
          <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/></svg>
        </button>
        <button class="nav-toggle" id="mobToggle" aria-label="Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
        </button>
      </div>
      <div class="mobile-panel" id="mobPanel">
        <a href="index.html">Home</a>
        <div class="grp-label">Tools</div>
        ${mobileToolLinks}
        <div class="grp-label">More</div>
        <a href="about.html">About</a>
        <a href="faq.html">FAQ</a>
        <a href="privacy.html">Privacy</a>
        <a href="terms.html">Terms</a>
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
    });
    document.addEventListener('click', (e) => { if (!dd.contains(e.target)) dd.classList.remove('open'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dd.classList.remove('open'); });
  }
  const mobToggle = document.getElementById('mobToggle');
  const mobPanel = document.getElementById('mobPanel');
  if (mobToggle) mobToggle.addEventListener('click', () => mobPanel.classList.toggle('open'));

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('ck-theme', next);
  });
}

function applyStoredTheme() {
  const stored = localStorage.getItem('ck-theme');
  if (stored) document.documentElement.setAttribute('data-theme', stored);
}
applyStoredTheme();

function renderFooter() {
  const toolLinksA = TOOLS.slice(0,4).map(t => `<li><a href="${t.url}">${t.name}</a></li>`).join('');
  const toolLinksB = TOOLS.slice(4).map(t => `<li><a href="${t.url}">${t.name}</a></li>`).join('');
  document.getElementById('site-footer').outerHTML = `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-about">
          <a class="wordmark" href="index.html"><span class="brand-mark"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#181A14"/><path d="M13 11h10l6 6v11a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2z" fill="#F4F5F2"/><path d="M23 11l6 6h-6z" fill="#E5470B"/><rect x="14" y="22.5" width="10" height="2" rx="1" fill="#ADB19F"/><rect x="14" y="26.5" width="7" height="2" rx="1" fill="#ADB19F"/></svg></span>CONVERT<span class="slash">/</span>KORO</a>
          <p>A free, no-login toolkit for everyday PDF and image conversions. Every file is processed on your own device &mdash; nothing is ever uploaded.</p>
        </div>
        <div><h4>Tools</h4><ul>${toolLinksA}</ul></div>
        <div><h4>More tools</h4><ul>${toolLinksB}</ul></div>
        <div><h4>Company</h4><ul>
          <li><a href="about.html">About</a></li>
          <li><a href="faq.html">FAQ</a></li>
          <li><a href="privacy.html">Privacy Policy</a></li>
          <li><a href="terms.html">Terms of Service</a></li>
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
        <p>&copy; <span id="yr"></span> ConvertKoro. All rights reserved. ConvertKoro is an independent project and is not affiliated with Adobe, Microsoft, or Google. "PDF" refers to the Portable Document Format specification.</p>
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
