/* ============================================================
   CONVERTPRO — shared nav data + header/footer renderer
   ============================================================ */

const ICONS = {
  pdfedit: '<path d="M6 3h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M15 3v5h5"/><path d="M15.5 13.5a1.7 1.7 0 0 1 2.4 2.4L11 22l-3.3.7L8.4 19.4z"/>',
  merge: '<path d="M8 3v11a2 2 0 0 0 2 2h9"/><path d="M16 3v11a2 2 0 0 1-2 2H5"/><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/>',
  compress: '<path d="M8 3v4a1 1 0 0 1-1 1H3"/><path d="M21 8h-4a1 1 0 0 1-1-1V3"/><path d="M3 16h4a1 1 0 0 1 1 1v4"/><path d="M16 21v-4a1 1 0 0 1 1-1h4"/>',
  img2pdf: '<rect x="3" y="3" width="10" height="10" rx="1.6"/><circle cx="6.3" cy="6.3" r="1.1"/><path d="M4 11l2.4-2.4L9 11.5"/><path d="M16 5h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-1"/><path d="M15 3v4h4"/>',
  pdf2img: '<path d="M6 3h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M13 3v5h5"/><rect x="7" y="12" width="7" height="6" rx="1"/><circle cx="9" cy="14.3" r=".8"/>',
  jpg2pdf: '<rect x="3" y="4" width="9" height="9" rx="1.6"/><circle cx="6" cy="7" r="1"/><path d="M4 11.5l2-2 2.5 2.5L11 9.5"/><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-3"/>',
  pdf2word: '<path d="M6 3h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M13 3v5h5"/><path d="M7.5 13l1.2 5 1.3-4 1.3 4 1.2-5"/>',
  split: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.5 15.5"/><path d="M14.5 14.5L20 20"/><path d="M8.5 8.5L11 11"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14h1v1h-1z"/><path d="M14 20h1v1h-1z"/><path d="M18 18h3v3h-3z"/>',
  img2text: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.4"/><path d="M4 16l4.5-4.5L12 15l3-3 5 5"/>',
  bgremove: '<rect x="3" y="4" width="18" height="16" rx="2" stroke-dasharray="3 2.5"/><circle cx="9.5" cy="10" r="2.3"/><path d="M6 17l4-4.5 3 3 2-2 3 3.5"/>',
  docscan: '<path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M20 8V5a1 1 0 0 0-1-1h-3"/><path d="M4 16v3a1 1 0 0 0 1 1h3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 10.5l1.5-2 3 3.5 1.5-1.5 2.5 3" stroke-linecap="round"/>',
  passport: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17c0-2 1.5-3 4-3s4 1 4 3" stroke-linecap="round"/>',
  text2doc: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5" stroke-linecap="round"/>',
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
  markdown: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 15V9l3 3 3-3v6"/><path d="M16 9v6M13.5 12.5L16 15l2.5-2.5"/>',
  svgpen: '<path d="M4 20L20 4"/><circle cx="4" cy="20" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="4" r="2"/>',
  camera: '<rect x="5" y="2" width="14" height="20" rx="2.5"/><circle cx="12" cy="17.5" r="2"/><path d="M9.5 5.5h5"/>',
  swap: '<path d="M17 3l4 4-4 4"/><path d="M21 7H9"/><path d="M7 21l-4-4 4-4"/><path d="M3 17h12"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  slides: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M9 8.5l4.5 2.5L9 13.5z"/>',
  textlines: '<path d="M4 5h16M4 10h16M4 15h11M4 20h14"/>',
  regexicon: '<path d="M6 4l4 16M14 4l4 16"/><circle cx="20" cy="19" r="1.3"/>',
  xmltag: '<path d="M8 8L4 12l4 4"/><path d="M13 4l-2 16"/><path d="M16 8l4 4-4 4"/>',
  convertdoc: '<path d="M6 3h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M15 3v5h5"/><path d="M9 14l3-3 3 3M12 11v7"/>',
  trim: '<path d="M2 12h4l2-7 3 14 2-7h4"/><path d="M18 5l4 4M22 5l-4 4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  percent: '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M19 5L5 19"/>',
  ruler: '<path d="M3 8h18v8H3z"/><path d="M7 8v3M11 8v3M15 8v3M19 8v3"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M9 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5"/><path d="M8 12h8"/><line x1="12" y1="15" x2="12" y2="15"/>',
  bank: '<path d="M3 21h18"/><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/><path d="M4 9h16"/>',
  scale: '<path d="M12 3v18"/><path d="M6 8h12"/><path d="M4 8l2-4 2 4"/><path d="M16 8l2-4 2 4"/><path d="M3 8a3 3 0 0 0 6 0"/><path d="M15 8a3 3 0 0 0 6 0"/><path d="M8 21h8"/>'
};

const CATEGORIES = [
  { key: 'PDF',      label: 'PDF Tools',      icon: 'merge',  pageUrl: '/pdf-tools' },
  { key: 'IMAGE',    label: 'Image Tools',    icon: 'img2pdf', pageUrl: '/image-tools' },
  { key: 'OCR',      label: 'Text & OCR',     icon: 'img2text', pageUrl: '/text-ocr-tools' },
  { key: 'DEV',      label: 'Developer Tools',icon: 'code',   pageUrl: '/developer-tools' },
  { key: 'DOCUMENT', label: 'Document Tools', icon: 'doc',    pageUrl: '/document-tools' },
  { key: 'CREATE',   label: 'Create',         icon: 'qr',     pageUrl: '/create-tools' },
  { key: 'CALC',     label: 'Calculators',    icon: 'percent', pageUrl: '/calculators' },
  { key: 'AUDIO',    label: 'Audio Tools',    icon: 'audio',  pageUrl: '/audio-tools' },
  { key: 'VIDEO',    label: 'Video Tools',    icon: 'video',  pageUrl: '/video-tools' },
];

const TOOLS = [
  { id: 'pdfedit',  name: 'PDF Editor',       url: '/pdf-editor',   icon: 'pdfedit',
    tag: 'PDF',   short: 'Add text, images, highlights, shapes and a signature, then organize pages.', badge: 'New' },
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

  { id: 'pdf2text',    name: 'PDF to Text',        url: '/pdf-to-text',        icon: 'textlines',
    tag: 'PDF',   short: 'Extract every word of a PDF as plain .txt.' },
  { id: 'img-compress',name: 'Image Compressor',   url: '/image-compressor',   icon: 'compress',
    tag: 'IMAGE', short: 'Shrink JPG/PNG file size with a quality slider.' },
  { id: 'bg-remove',   name: 'Background Remover', url: '/background-remover', icon: 'bgremove',
    tag: 'IMAGE', short: 'Remove or replace a photo\u2019s background \u2014 white, transparent, or any color.', badge: 'New' },
  { id: 'passport-photo', name: 'Passport Photo Maker', url: '/passport-photo-maker', icon: 'passport',
    tag: 'IMAGE', short: 'Crop and format a passport photo to your country\u2019s real size requirements.', badge: 'New' },
  { id: 'text2doc', name: 'Text to PDF / Word', url: '/text-to-pdf-word', icon: 'text2doc', tag: 'DOCUMENT',
    short: 'Paste or upload plain text, translate if needed, and export as PDF or Word.', badge: 'New' },
  { id: 'svg2png',     name: 'SVG to PNG',         url: '/svg-to-png',         icon: 'svgpen',
    tag: 'IMAGE', short: 'Rasterize an SVG into a PNG at any size.' },
  { id: 'json-format', name: 'JSON Formatter',     url: '/json-formatter',     icon: 'code',
    tag: 'DEV',   short: 'Format, validate, and minify JSON.' },
  { id: 'base64',      name: 'Base64 Encoder',     url: '/base64-encoder',     icon: 'hash',
    tag: 'DEV',   short: 'Encode or decode text and files as Base64.' },
  { id: 'regex',       name: 'Regex Tester',       url: '/regex-tester',       icon: 'regexicon',
    tag: 'DEV',   short: 'Test a regular expression against sample text live.' },
  { id: 'color',       name: 'Color Converter',    url: '/color-converter',    icon: 'palette',
    tag: 'DEV',   short: 'Convert between HEX, RGB, and HSL instantly.' },
  { id: 'timestamp',   name: 'Timestamp Converter',url: '/timestamp-converter',icon: 'clock',
    tag: 'DEV',   short: 'Convert Unix timestamps to and from readable dates.' },

  { id: 'word2pdf', name: 'Word to PDF',    url: '/word-to-pdf', icon: 'doc',    tag: 'PDF',
    short: 'Convert a .docx file into a PDF.' },
  { id: 'pdf2excel', name: 'PDF to Excel',  url: '/pdf-to-excel', icon: 'csv',    tag: 'PDF',
    short: 'Pull tables out of a PDF into .xlsx.' },
  { id: 'pdf2ppt',   name: 'PDF to PowerPoint', url: '/pdf-to-powerpoint', icon: 'slides', tag: 'PDF',
    short: 'Turn each PDF page into an image slide.' },
  { id: 'heic2jpg',  name: 'HEIC to JPG',   url: '/heic-to-jpg', icon: 'camera', tag: 'IMAGE',
    short: 'Convert iPhone HEIC photos to JPG.' },
  { id: 'heic2png',  name: 'HEIC to PNG',   url: '/heic-to-png', icon: 'camera', tag: 'IMAGE',
    short: 'Convert iPhone HEIC photos to PNG.' },
  { id: 'jpg2webp',  name: 'JPG to WebP',   url: '/jpg-to-webp', icon: 'swap', tag: 'IMAGE',
    short: 'Convert JPG images to the smaller WebP format.' },
  { id: 'png2webp',  name: 'PNG to WebP',   url: '/png-to-webp', icon: 'layers', tag: 'IMAGE',
    short: 'Convert PNG images to the smaller WebP format.' },
  { id: 'webp2jpg',  name: 'WebP to JPG',   url: '/webp-to-jpg', icon: 'refresh', tag: 'IMAGE',
    short: 'Convert WebP images back to standard JPG.' },
  { id: 'pdf-ocr',   name: 'PDF OCR',       url: '/pdf-ocr', icon: 'img2text', tag: 'OCR',
    short: 'Extract text from a scanned (image-only) PDF.' },
  { id: 'doc-scan',  name: 'Document Scanner', url: '/document-scanner', icon: 'docscan', tag: 'PDF',
    short: 'Turn a phone photo into a clean, straightened PDF or Word document.', badge: 'New' },
  { id: 'img-resize',name: 'Image Resizer', url: '/image-resizer', icon: 'resize',  tag: 'IMAGE',
    short: 'Resize an image to exact pixel dimensions.' },
  { id: 'img-crop',  name: 'Image Cropper', url: '/image-cropper', icon: 'crop',    tag: 'IMAGE',
    short: 'Crop an image to the area you select.' },
  { id: 'exif',      name: 'Remove EXIF Data', url: '/remove-exif', icon: 'eraser', tag: 'IMAGE',
    short: 'Strip location and camera metadata from photos.' },
  { id: 'json2csv',  name: 'JSON to CSV',   url: '/json-to-csv', icon: 'csv',     tag: 'DEV',
    short: 'Convert a JSON array into a CSV spreadsheet.' },
  { id: 'xml2json',  name: 'XML to JSON',   url: '/xml-to-json', icon: 'xmltag',    tag: 'DEV',
    short: 'Convert XML documents to JSON, and back.' },
  { id: 'url-short', name: 'URL Shortener', url: '/url-shortener', icon: 'link',    tag: 'DEV',
    short: 'Create a serverless short link — no backend needed.' },
  { id: 'pdf2md',    name: 'PDF to Markdown', url: '/pdf-to-markdown', icon: 'convertdoc', tag: 'DOCUMENT',
    short: 'Convert PDF text into Markdown formatting.' },
  { id: 'md2html',   name: 'Markdown to HTML', url: '/markdown-to-html', icon: 'markdown', tag: 'DOCUMENT',
    short: 'Render Markdown into clean HTML.' },
  { id: 'md2pdf',    name: 'Markdown to PDF', url: '/markdown-to-pdf', icon: 'doc', tag: 'DOCUMENT',
    short: 'Turn a Markdown file into a formatted PDF.' },

  { id: 'audio-conv', name: 'Audio Converter', url: '/audio-converter', icon: 'audio', tag: 'AUDIO',
    short: 'Convert audio between MP3 and WAV.' },
  { id: 'audio-trim', name: 'Audio Trimmer',   url: '/audio-trimmer',   icon: 'trim',  tag: 'AUDIO',
    short: 'Cut an audio file down to the section you need.' },
  { id: 'audio-compress', name: 'Audio Compressor', url: '/audio-compressor', icon: 'compress', tag: 'AUDIO',
    short: 'Re-encode audio at a lower bitrate to shrink file size.' },

  { id: 'video-conv',  name: 'Video Converter',  url: '/video-converter',  icon: 'refresh', tag: 'VIDEO',
    short: 'Convert between MP4, WebM, and MOV.' },
  { id: 'video-compress', name: 'Video Compressor', url: '/video-compressor', icon: 'compress', tag: 'VIDEO',
    short: "Shrink a video's file size with a quality slider." },
  { id: 'video2mp3',   name: 'Video to MP3',     url: '/video-to-mp3',     icon: 'swap', tag: 'VIDEO',
    short: 'Extract the audio track from a video as MP3.' },
  { id: 'video2gif',   name: 'Video to GIF',     url: '/video-to-gif',     icon: 'layers', tag: 'VIDEO',
    short: 'Turn a short video clip into a looping GIF.' },
  { id: 'video-resize',name: 'Video Resizer',    url: '/video-resizer',    icon: 'resize', tag: 'VIDEO',
    short: 'Resize a video to exact pixel dimensions.' },
  { id: 'video-trim',  name: 'Video Trimmer',    url: '/video-trimmer',    icon: 'trim', tag: 'VIDEO',
    short: 'Cut a video down to the clip you need.' },

  { id: 'pct-calc',  name: 'Percentage Calculator', url: '/percentage-calculator', icon: 'percent', tag: 'CALC',
    short: 'Percent of a number, percent change, and more.' },
  { id: 'age-calc',  name: 'Age Calculator',    url: '/age-calculator',    icon: 'clock',   tag: 'CALC',
    short: 'Exact age in years, months, and days.' },
  { id: 'bmi-calc',  name: 'BMI Calculator',    url: '/bmi-calculator',    icon: 'scale', tag: 'CALC',
    short: 'Body Mass Index from height and weight.' },
  { id: 'unit-conv', name: 'Unit Converter',    url: '/unit-converter',    icon: 'ruler',   tag: 'CALC',
    short: 'Convert length, weight, and temperature.' },
  { id: 'currency-conv', name: 'Currency Converter', url: '/currency-converter', icon: 'money', tag: 'CALC',
    short: 'Live exchange rates, including BDT.' },
  { id: 'emi-calc',  name: 'EMI / Loan Calculator', url: '/emi-calculator', icon: 'bank',   tag: 'CALC',
    short: 'Monthly payment, interest, and total repayment.' },
  { id: 'date-calc', name: 'Date Calculator',   url: '/date-calculator',   icon: 'calendar', tag: 'CALC',
    short: 'Days between two dates, or add/subtract days.' },
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
  AUDIO:    'var(--grad-media)',
  VIDEO:    'var(--grad-media)',
  CALC:     'var(--grad-calc)',
};
function tintStyle(tag) {
  const grad = TAG_GRADIENT[tag] || TAG_GRADIENT.PDF;
  return `background:${grad};color:#fff;`;
}

function catNavDropdown(key, label, id) {
  const catTools = TOOLS.filter(t => t.tag === key && !t.soon);
  const cat = CATEGORIES.find(c => c.key === key);
  const items = catTools.map(t => `<a href="${t.url}">${t.name}</a>`).join('');
  return `
          <div class="nav-dd nav-dd-media" id="${id}">
            <button type="button" aria-expanded="false">${label}
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="dd-panel-cat">
              <a class="dd-panel-cat-all" href="${cat.pageUrl}"><strong>All ${label} Tools</strong><span>See all ${catTools.length} \u2192</span></a>
              <div class="dd-panel-cat-list">${items}</div>
            </div>
          </div>`;
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

  const mobCatBlocks = CATEGORIES.map(c => {
    const catTools = TOOLS.filter(t => t.tag === c.key);
    if (!catTools.length) return '';
    const liveCount = catTools.filter(t => !t.soon).length;
    const links = catTools.map(t => t.soon
      ? `<span class="mob-tool-link mob-tool-soon"><span class="mob-tool-ico" style="${tintStyle(t.tag)}">${svgIcon(t.icon)}</span>${t.name} <em>Soon</em></span>`
      : `<a class="mob-tool-link" href="${t.url}" data-name="${t.name.toLowerCase()}"><span class="mob-tool-ico" style="${tintStyle(t.tag)}">${svgIcon(t.icon)}</span>${t.name}</a>`
    ).join('');
    return `
      <div class="mob-cat" data-catkey="${c.key}">
        <button type="button" class="mob-cat-head">
          <span class="mob-cat-ico" style="${tintStyle(c.key)}">${svgIcon(c.icon)}</span>
          <span class="mob-cat-label">${c.label}</span>
          <span class="mob-cat-count">${liveCount}</span>
          <svg class="mob-cat-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="mob-cat-body">${links}</div>
      </div>`;
  }).join('');

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
                  <input type="text" id="ddSearch" placeholder="Search all tools&hellip;" autocomplete="off" />
                </div>
                <div class="dd-items" id="ddItems">${ddItemsAll}</div>
                <div class="dd-empty" id="ddEmpty">No tools match that search.</div>
                <div class="dd-soon" id="ddSoon">More tools in this category are on the way.</div>
              </div>
            </div>
          </div>
          ${catNavDropdown('PDF', 'PDF', 'pdfDD')}
          ${catNavDropdown('IMAGE', 'Image', 'imageDD')}
          <div class="nav-dd nav-dd-media" id="mediaDD">
            <button type="button" aria-expanded="false">Media
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="dd-panel-cat dd-panel-media">
              <a class="dd-panel-cat-all" href="/media-tools"><strong>All Media Tools</strong><span>Audio + video \u2192</span></a>
              <div class="dd-media-group">
                <div class="dd-media-group-head"><span class="ico" style="${tintStyle('AUDIO')}">${svgIcon('audio')}</span><strong>Audio Tools</strong><a href="/audio-tools">See all &rarr;</a></div>
                <div class="dd-panel-cat-list">${TOOLS.filter(t => t.tag === 'AUDIO' && !t.soon).map(t => `<a href="${t.url}">${t.name}</a>`).join('')}</div>
              </div>
              <div class="dd-media-group">
                <div class="dd-media-group-head"><span class="ico" style="${tintStyle('VIDEO')}">${svgIcon('video')}</span><strong>Video Tools</strong><a href="/video-tools">See all &rarr;</a></div>
                <div class="dd-panel-cat-list">${TOOLS.filter(t => t.tag === 'VIDEO' && !t.soon).map(t => `<a href="${t.url}">${t.name}</a>`).join('')}</div>
              </div>
            </div>
          </div>
          ${catNavDropdown('DEV', 'Developer', 'devDD')}
          <a class="nav-link ${active==='about'?'active':''}" href="/about">About</a>
        </nav>
        <div class="nav-search-inline" id="navSearchDD">
          <svg class="nav-search-inline-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="navSearchInput" placeholder="What are you looking for?" autocomplete="off" />
          <div class="qs-results" id="navSearchResults"></div>
        </div>
        <button class="mob-search-toggle" id="mobSearchToggle" aria-label="Search tools">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">
          <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
          <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/></svg>
        </button>
        <button class="nav-toggle" id="mobToggle" aria-label="Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
        </button>
      </div>
    </div>
  </header>
  <div class="mobile-panel" id="mobPanel">
    <div class="mob-panel-inner">
      <div class="mob-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="mobSearch" placeholder="Search all tools&hellip;" autocomplete="off" />
      </div>
      <a class="mob-toplink ${active==='home'?'active':''}" href="/">Home</a>
      <div class="mob-cats" id="mobCats">${mobCatBlocks}</div>
      <div class="mob-empty" id="mobEmpty">No tools match that search.</div>
      <div class="mob-more">
        <a class="mob-toplink ${active==='about'?'active':''}" href="/about">About</a>
        <a class="mob-toplink" href="/faq">FAQ</a>
        <a class="mob-toplink" href="/privacy">Privacy</a>
        <a class="mob-toplink" href="/terms">Terms</a>
      </div>
    </div>
  </div>`;


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

    var ddHoverTimer = null;
    dd.addEventListener('mouseenter', () => {
      clearTimeout(ddHoverTimer);
      dd.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    });
    dd.addEventListener('mouseleave', () => {
      ddHoverTimer = setTimeout(() => {
        dd.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }, 250);
    });

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

    window.openToolCategory = function(key, isHover) {
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
      if (!isHover) {
        dd.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => ddSearch.focus(), 300);
      }
    };

    var catLinks = document.querySelectorAll('.nav-cat-link');
    for (var n = 0; n < catLinks.length; n++) {
      (function(link) {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          window.openToolCategory(link.getAttribute('data-open-cat'));
        });
        link.addEventListener('mouseenter', function() {
          clearTimeout(ddHoverTimer);
          window.openToolCategory(link.getAttribute('data-open-cat'), true);
        });
        link.addEventListener('mouseleave', function() {
          ddHoverTimer = setTimeout(function() {
            dd.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
          }, 250);
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
  }

  ['mediaDD', 'pdfDD', 'imageDD', 'devDD'].forEach(ddId => {
    const smallDD = document.getElementById(ddId);
    if (!smallDD) return;
    const sBtn = smallDD.querySelector('button');
    let sHoverTimer = null;
    sBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      smallDD.classList.toggle('open');
      sBtn.setAttribute('aria-expanded', smallDD.classList.contains('open'));
    });
    smallDD.addEventListener('mouseenter', () => {
      clearTimeout(sHoverTimer);
      smallDD.classList.add('open');
      sBtn.setAttribute('aria-expanded', 'true');
    });
    smallDD.addEventListener('mouseleave', () => {
      sHoverTimer = setTimeout(() => {
        smallDD.classList.remove('open');
        sBtn.setAttribute('aria-expanded', 'false');
      }, 250);
    });
    document.addEventListener('click', (e) => { if (!smallDD.contains(e.target)) smallDD.classList.remove('open'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') smallDD.classList.remove('open'); });
  });

  const navSearchDD = document.getElementById('navSearchDD');
  if (navSearchDD) {
    const nsInput = document.getElementById('navSearchInput');
    const nsResults = document.getElementById('navSearchResults');
    function renderNavSearch(query) {
      const q = query.trim().toLowerCase();
      if (!q) { nsResults.classList.remove('open'); nsResults.innerHTML = ''; return; }
      const matches = TOOLS.filter(t => !t.soon && (t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)));
      nsResults.innerHTML = matches.length
        ? matches.map(t => `<a href="${t.url}" class="qs-result-item"><span class="ico" style="${tintStyle(t.tag)}">${svgIcon(t.icon)}</span><span class="qs-result-text"><strong>${t.name}</strong><span>${t.tag}</span></span></a>`).join('')
        : `<div class="qs-no-match">No tools match "${query}"</div>`;
      nsResults.classList.add('open');
    }
    nsInput.addEventListener('input', () => renderNavSearch(nsInput.value));
    nsInput.addEventListener('focus', () => { if (nsInput.value.trim()) renderNavSearch(nsInput.value); });
    nsInput.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', (e) => { if (!navSearchDD.contains(e.target)) nsResults.classList.remove('open'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { nsResults.classList.remove('open'); nsInput.blur(); } });
  }

  const mobToggle = document.getElementById('mobToggle');
  const mobPanel = document.getElementById('mobPanel');
  function closeMobPanel() {
    mobPanel.classList.remove('open');
    document.body.classList.remove('mob-panel-open');
    mobToggle.setAttribute('aria-expanded', 'false');
  }
  function openMobPanel() {
    mobPanel.classList.add('open');
    document.body.classList.add('mob-panel-open');
    mobToggle.setAttribute('aria-expanded', 'true');
  }
  if (mobToggle) {
    mobToggle.addEventListener('click', () => {
      if (mobPanel.classList.contains('open')) closeMobPanel(); else openMobPanel();
    });
  }
  const mobSearchToggle = document.getElementById('mobSearchToggle');
  if (mobSearchToggle) {
    // Opens the same mobile panel used by the hamburger menu, but jumps
    // straight to the search field and focuses it — a one-tap path to
    // searching on mobile, instead of open menu -> scroll -> find search.
    mobSearchToggle.addEventListener('click', () => {
      openMobPanel();
      const field = document.getElementById('mobSearch');
      if (field) setTimeout(() => field.focus(), 50);
    });
  }
  if (mobPanel) {
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMobPanel(); });
    mobPanel.querySelectorAll('.mob-toplink, a.mob-tool-link').forEach(a => {
      a.addEventListener('click', closeMobPanel);
    });

    const mobCatHeads = Array.prototype.slice.call(mobPanel.querySelectorAll('.mob-cat-head'));
    mobCatHeads.forEach(head => {
      head.addEventListener('click', () => {
        const cat = head.closest('.mob-cat');
        const wasOpen = cat.classList.contains('open');
        mobCatHeads.forEach(h => h.closest('.mob-cat').classList.remove('open'));
        if (!wasOpen) cat.classList.add('open');
      });
    });

    const mobSearch = document.getElementById('mobSearch');
    const mobEmpty = document.getElementById('mobEmpty');
    const mobCatsWrap = document.getElementById('mobCats');
    if (mobSearch) {
      mobSearch.addEventListener('input', () => {
        const q = mobSearch.value.trim().toLowerCase();
        const searching = q.length > 0;
        let anyVisible = false;
        mobCatsWrap.querySelectorAll('.mob-cat').forEach(cat => {
          let catHasMatch = false;
          cat.querySelectorAll('.mob-tool-link[data-name]').forEach(link => {
            const match = !searching || link.getAttribute('data-name').indexOf(q) !== -1;
            link.style.display = match ? '' : 'none';
            if (match) catHasMatch = true;
          });
          cat.style.display = catHasMatch ? '' : 'none';
          if (searching) cat.classList.toggle('open', catHasMatch);
          else cat.classList.remove('open');
          if (catHasMatch) anyVisible = true;
        });
        mobEmpty.style.display = (searching && !anyVisible) ? 'block' : 'none';
      });
    }
  }

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
          <p>A free, no-login toolkit for everyday PDF and image conversions. Most tools process files right on your own device.</p>
        </div>
        <div><h4>PDF Tools</h4><ul>${toolLinksA}</ul></div>
        <div><h4>More Tools</h4><ul>${toolLinksB}</ul></div>
        <div><h4>Company</h4><ul>
          <li><a href="/about">About</a></li>
          <li><a href="/faq">FAQ</a></li>
          <li><a href="/contact">Contact</a></li>
          <li><a href="/privacy">Privacy Policy</a></li>
          <li><a href="/terms">Terms of Service</a></li>
        </ul></div>
        <div>
          <h4>Stay updated</h4>
          <p style="font-size:14.5px;color:#FFFFFF;margin:0 0 12px;line-height:1.5;">Get notified when new tools launch.</p>
          <div class="newsletter-row">
            <input type="email" id="newsEmail" placeholder="you@email.com" />
            <button id="newsBtn" type="button">Notify me</button>
          </div>
          <div class="newsletter-msg" id="newsMsg"></div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; <span id="yr"></span> ConvertKoro. All rights reserved. Independently built for everyone, everywhere.</p>
        <div class="footer-social" aria-label="ConvertKoro on social media">
          <a href="https://www.youtube.com/@convertkoro" target="_blank" rel="noopener" aria-label="ConvertKoro on YouTube" class="social-ico social-youtube">
            <svg viewBox="0 0 24 24" fill="none"><rect x="1" y="4" width="22" height="16" rx="5" fill="#FF0000"/><path d="M10 8.5L16 12L10 15.5V8.5Z" fill="#fff"/></svg>
          </a>
          <a href="https://www.instagram.com/convertkoro/?hl=en" target="_blank" rel="noopener" aria-label="ConvertKoro on Instagram" class="social-ico social-instagram">
            <svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#FEE411"/><stop offset="25%" stop-color="#FD5949"/><stop offset="55%" stop-color="#D6249F"/><stop offset="100%" stop-color="#285AEB"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#igGrad)"/><rect x="6.5" y="6.5" width="11" height="11" rx="4" stroke="#fff" stroke-width="1.6" fill="none"/><circle cx="12" cy="12" r="3" stroke="#fff" stroke-width="1.6" fill="none"/><circle cx="17.2" cy="6.8" r="1.1" fill="#fff"/></svg>
          </a>
          <a href="https://www.facebook.com/share/1BeCs9LXAm/" target="_blank" rel="noopener" aria-label="ConvertKoro on Facebook" class="social-ico social-facebook">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#1877F2"/><path d="M14.5 8.5H16V5.8C15.7 5.76 14.7 5.67 13.55 5.67C11.14 5.67 9.5 7.17 9.5 9.9V12.1H6.9V15.1H9.5V22H12.6V15.1H15.1L15.5 12.1H12.6V10.22C12.6 9.35 12.84 8.5 14.5 8.5Z" fill="#fff"/></svg>
          </a>
          <a href="https://www.linkedin.com/company/convertkoro/" target="_blank" rel="noopener" aria-label="ConvertKoro on LinkedIn" class="social-ico social-linkedin">
            <svg viewBox="0 0 24 24" fill="none"><rect x="1" y="1" width="22" height="22" rx="4.5" fill="#0A66C2"/><path d="M8.4 9.7H5.6V18.3H8.4V9.7Z" fill="#fff"/><circle cx="7" cy="6.7" r="1.6" fill="#fff"/><path d="M11 9.7H13.7V10.9H13.74C14.12 10.19 15.02 9.44 16.37 9.44C19.2 9.44 19.72 11.28 19.72 13.68V18.3H16.94V14.23C16.94 13.25 16.92 11.98 15.55 11.98C14.16 11.98 13.95 13.05 13.95 14.16V18.3H11.17L11 9.7Z" fill="#fff"/></svg>
          </a>
        </div>
        <p>Simple tools. Better file work.</p>
      </div>
    </div>
  </footer>`;
  const yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  const newsBtn = document.getElementById('newsBtn');
  const newsEmail = document.getElementById('newsEmail');
  const newsMsg = document.getElementById('newsMsg');
  function setNewsMsg(text, kind) {
    newsMsg.textContent = text;
    newsMsg.classList.remove('is-success', 'is-error', 'is-neutral');
    if (kind) newsMsg.classList.add(kind);
  }
  if (newsBtn) newsBtn.addEventListener('click', async () => {
    const v = newsEmail.value.trim();
    if (!v || !v.includes('@')) { setNewsMsg('Enter a valid email address.', 'is-error'); return; }

    newsBtn.disabled = true;
    const originalLabel = newsBtn.textContent;
    newsBtn.textContent = 'Adding\u2026';
    setNewsMsg('', null);

    try {
      const resp = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: v }),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setNewsMsg(data.error || 'Something went wrong. Please try again.', 'is-error');
      } else {
        setNewsMsg(
          data.status === 'already-subscribed'
            ? 'Already subscribed \u2014 you\u2019re all set, no action needed.'
            : 'You\u2019re subscribed \u2014 we\u2019ll keep you posted on everything new.',
          'is-success'
        );
        newsEmail.value = '';
      }
    } catch (err) {
      console.warn('ConvertKoro newsletter signup failed.', err);
      setNewsMsg('Couldn\u2019t reach the server right now. Please try again in a bit.', 'is-error');
    } finally {
      newsBtn.disabled = false;
      newsBtn.textContent = originalLabel;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.getAttribute('data-page') || '';
  renderHeader(page);
  renderFooter();
});
