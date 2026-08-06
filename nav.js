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

function renderHeader(active) {
  const ddItems = TOOLS.map(t => `
    <a class="dd-item" href="${t.url}">
      <span class="ico">${svgIcon(t.icon)}</span>
      <span><strong>${t.name}</strong><span>${t.short}</span></span>
    </a>`).join('');

  const mobileToolLinks = TOOLS.map(t => `<a href="${t.url}">${t.name}</a>`).join('');

  document.getElementById('site-header').outerHTML = `
  <header class="site-header">
    <div class="container">
      <div class="nav-row">
        <a class="wordmark" href="index.html">CONVERT<span class="slash">/</span>PRO</a>
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
}

function renderFooter() {
  const toolLinksA = TOOLS.slice(0,4).map(t => `<li><a href="${t.url}">${t.name}</a></li>`).join('');
  const toolLinksB = TOOLS.slice(4).map(t => `<li><a href="${t.url}">${t.name}</a></li>`).join('');
  document.getElementById('site-footer').outerHTML = `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-about">
          <a class="wordmark" href="index.html">CONVERT<span class="slash">/</span>PRO</a>
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
      </div>
      <div class="footer-bottom">
        <p>&copy; <span id="yr"></span> ConvertPro. All rights reserved. ConvertPro is an independent project and is not affiliated with Adobe, Microsoft, or Google. "PDF" refers to the Portable Document Format specification.</p>
        <p class="mono" style="font-size:11.5px;">Built for people who'd rather not upload their files.</p>
      </div>
    </div>
  </footer>`;
  const yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.getAttribute('data-page') || '';
  renderHeader(page);
  renderFooter();
});
