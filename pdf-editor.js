// ConvertKoro PDF Editor - V1
//
// Architecture: PDF.js renders each page to a <canvas> for viewing.
// Every added object (text, image, highlight, shape, note, signature)
// lives as a plain JS object in an in-memory model, positioned in PDF
// point-space (not pixel-space) so it survives zoom changes and page
// navigation correctly. An absolutely-positioned HTML overlay div per
// object gives interactive drag/resize/select on top of the canvas.
// On Download, pdf-lib loads the ORIGINAL file bytes fresh and draws
// every object from the model directly into the real PDF page content
// - so the saved file is a genuine PDF with real embedded content, not
// a screenshot or a separate overlay layer bolted on top.
//
// True editing of text that already exists in the PDF is intentionally
// out of scope for V1 - see the FAQ on the page for why.

(function () {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const { PDFDocument, rgb, StandardFonts, degrees } = PDFLib;

  let originalBytes = null;
  let pdfDoc = null;
  let pageCount = 0;
  let pageRotations = [];
  let pageOrder = [];
  let currentPageIdx = 0;
  let zoom = 1.0;
  let mode = 'select';
  let subTool = null;
  let objects = [];
  let nextObjId = 1;
  let selectedObjId = null;
  let history = [];
  let historyIdx = -1;
  let signatureDataUrl = null;
  let thumbCache = {};

  const uploadWrap = document.getElementById('peUploadWrap');
  const shell = document.getElementById('peShell');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const errBox = document.getElementById('errBox');
  const errText = document.getElementById('errText');
  const infoSection = document.getElementById('peInfoSection');

  const toolbar = document.getElementById('peToolbar');
  const subtoolbar = document.getElementById('peSubtoolbar');
  const sidebar = document.getElementById('peSidebar');
  const canvasWrap = document.getElementById('peCanvasWrap');
  const pageStage = document.getElementById('pePageStage');
  const pageCanvas = document.getElementById('pePageCanvas');
  const overlay = document.getElementById('peOverlay');
  const rightbar = document.getElementById('peRightbar');
  const propsBody = document.getElementById('pePropsBody');
  const zoomLabel = document.getElementById('peZoomLabel');
  const pageJump = document.getElementById('pePageJump');
  const undoBtn = document.getElementById('peUndoBtn');
  const redoBtn = document.getElementById('peRedoBtn');

  function showError(msg) { errText.textContent = msg; errBox.style.display = 'block'; }
  function clearError() { errBox.style.display = 'none'; }

  async function loadFile(file) {
    if (!file || file.type !== 'application/pdf') { showError('Please choose a PDF file.'); return; }
    clearError();
    try {
      originalBytes = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: originalBytes.slice(0) });
      pdfDoc = await loadingTask.promise;
      pageCount = pdfDoc.numPages;
      pageOrder = Array.from({ length: pageCount }, (_, i) => i);
      pageRotations = Array.from({ length: pageCount }, () => 0);
      objects = [];
      history = []; historyIdx = -1;
      currentPageIdx = 0;
      thumbCache = {};
      pushHistory();

      uploadWrap.style.display = 'none';
      infoSection.style.display = 'none';
      shell.classList.add('active');
      await renderSidebarThumbs();
      await renderCurrentPage();
      setMode('select');
    } catch (e) {
      console.error('ConvertKoro PDF Editor: failed to open PDF.', e);
      if (String(e && e.message || '').toLowerCase().includes('password') || String(e && e.name || '') === 'PasswordException') {
        showError('This PDF is password-protected. Remove the password first, then try again.');
      } else {
        showError('Couldn\u2019t open this PDF. It may be corrupted or in an unsupported format.');
      }
    }
  }

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => loadFile(e.target.files[0]));
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('drag'); if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]); });

  if (window.ConvertKoroDrivePicker) {
    window.ConvertKoroDrivePicker.renderSourceButtons({
      containerEl: dropzone,
      fileInputEl: fileInput,
      mimeTypes: 'application/pdf',
      pasteMimeCheck: (item) => item.type === 'application/pdf',
      onFiles: (files) => { loadFile(files[0]); },
    });
  }
  window.addEventListener('paste', (e) => {
    if (shell.classList.contains('active')) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const item of items) {
      if (item.kind === 'file' && item.type === 'application/pdf') {
        const f = item.getAsFile();
        if (f) { e.preventDefault(); loadFile(f); }
        break;
      }
    }
  });

  function snapshot() {
    return { objects: JSON.parse(JSON.stringify(objects)), pageOrder: [...pageOrder], pageRotations: [...pageRotations] };
  }
  function pushHistory() {
    history = history.slice(0, historyIdx + 1);
    history.push(snapshot());
    historyIdx = history.length - 1;
    updateUndoRedoButtons();
  }
  function applySnapshot(snap) {
    objects = JSON.parse(JSON.stringify(snap.objects));
    pageOrder = [...snap.pageOrder];
    pageRotations = [...snap.pageRotations];
    thumbCache = {};
    if (currentPageIdx >= pageOrder.length) currentPageIdx = Math.max(0, pageOrder.length - 1);
  }
  function undo() {
    if (historyIdx <= 0) return;
    historyIdx--;
    applySnapshot(history[historyIdx]);
    selectedObjId = null;
    renderSidebarThumbs(); renderCurrentPage(); updatePropsPanel(); updateUndoRedoButtons();
  }
  function redo() {
    if (historyIdx >= history.length - 1) return;
    historyIdx++;
    applySnapshot(history[historyIdx]);
    selectedObjId = null;
    renderSidebarThumbs(); renderCurrentPage(); updatePropsPanel(); updateUndoRedoButtons();
  }
  function updateUndoRedoButtons() {
    undoBtn.disabled = historyIdx <= 0;
    redoBtn.disabled = historyIdx >= history.length - 1;
  }
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  window.addEventListener('keydown', (e) => {
    if (!shell.classList.contains('active')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjId && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault(); deleteSelectedObject();
    }
  });

  // Guards against the real, confirmed race condition where two
  // renderCurrentPage() calls overlap (e.g. two rapid rotate clicks, or
  // undo/redo fired quickly) - PDF.js throws if a second render() starts
  // on the same canvas before the first finishes. Cancelling any
  // in-flight render before starting a new one is the documented fix.
  let currentRenderTask = null;

  async function renderCurrentPage() {
    if (!pdfDoc || pageOrder.length === 0) return;
    const origPageIdx = pageOrder[currentPageIdx];
    if (origPageIdx <= -1000) { renderBlankStagePage(); return; }
    const origPageNum = origPageIdx + 1;
    const page = await pdfDoc.getPage(origPageNum);
    const extraRotation = pageRotations[origPageIdx] || 0;
    const viewport = page.getViewport({ scale: zoom * 1.5, rotation: (page.rotate + extraRotation) % 360 });

    pageCanvas.width = viewport.width;
    pageCanvas.height = viewport.height;
    pageStage.style.width = viewport.width + 'px';
    pageStage.style.height = viewport.height + 'px';
    overlay.style.width = viewport.width + 'px';
    overlay.style.height = viewport.height + 'px';

    if (currentRenderTask) {
      currentRenderTask.cancel();
    }
    const ctx = pageCanvas.getContext('2d');
    const task = page.render({ canvasContext: ctx, viewport });
    currentRenderTask = task;
    try {
      await task.promise;
    } catch (err) {
      // A cancelled render throws RenderingCancelledException by design
      // (per PDF.js docs) - that's expected and fine, since a newer
      // render call is already in flight, and only that error name
      // should be swallowed silently, not any real failure.
      if (err && err.name === 'RenderingCancelledException') return;
      throw err;
    } finally {
      if (currentRenderTask === task) currentRenderTask = null;
    }

    renderOverlayObjects(viewport);
    pageJump.textContent = `Page ${currentPageIdx + 1} / ${pageOrder.length}`;
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
    highlightActiveThumb();
  }

  function renderBlankStagePage() {
    const w = 612 * zoom, h = 792 * zoom;
    pageCanvas.width = w; pageCanvas.height = h;
    pageStage.style.width = w + 'px'; pageStage.style.height = h + 'px';
    overlay.style.width = w + 'px'; overlay.style.height = h + 'px';
    const ctx = pageCanvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const viewport = { width: w, height: h,
      convertToViewportPoint: (x, y) => [x * zoom, h - y * zoom],
      convertToPdfPoint: (sx, sy) => [sx / zoom, (h - sy) / zoom] };
    renderOverlayObjects(viewport);
    pageJump.textContent = `Page ${currentPageIdx + 1} / ${pageOrder.length}`;
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
    highlightActiveThumb();
  }

  function pdfPointToScreen(xPt, yPt, viewport) {
    const [sx, sy] = viewport.convertToViewportPoint(xPt, yPt);
    return { x: sx, y: sy };
  }
  function screenToPdfPoint(sx, sy, viewport) {
    const [x, y] = viewport.convertToPdfPoint(sx, sy);
    return { x, y };
  }

  function renderOverlayObjects(viewport) {
    overlay.innerHTML = '';
    const origPageIdx = pageOrder[currentPageIdx];
    const pageObjects = objects.filter((o) => o.pageIdx === origPageIdx);
    for (const obj of pageObjects) overlay.appendChild(buildObjectElement(obj, viewport));
  }

  function buildObjectElement(obj, viewport) {
    const el = document.createElement('div');
    el.className = 'pe-obj';
    el.dataset.id = obj.id;
    el.dataset.type = obj.type;
    if (obj.id === selectedObjId) el.classList.add('selected');

    const topLeft = pdfPointToScreen(obj.xPt, obj.yPt + obj.hPt, viewport);
    const bottomRight = pdfPointToScreen(obj.xPt + obj.wPt, obj.yPt, viewport);
    const wPx = bottomRight.x - topLeft.x;
    const hPx = bottomRight.y - topLeft.y;

    el.style.left = topLeft.x + 'px';
    el.style.top = topLeft.y + 'px';
    el.style.width = Math.max(4, wPx) + 'px';
    el.style.height = Math.max(4, hPx) + 'px';

    if (obj.type === 'text') {
      el.textContent = obj.text;
      el.style.fontSize = (obj.fontSizePt * zoom * 1.5) + 'px';
      el.style.color = obj.color;
      el.style.fontWeight = obj.bold ? '700' : '400';
      el.style.fontStyle = obj.italic ? 'italic' : 'normal';
      el.style.fontFamily = 'Helvetica, Arial, sans-serif';
    } else if (obj.type === 'image' || obj.type === 'signature') {
      const img = document.createElement('img');
      img.src = obj.dataUrl;
      img.style.width = '100%'; img.style.height = '100%'; img.style.display = 'block'; img.style.pointerEvents = 'none';
      el.appendChild(img);
    } else if (obj.type === 'highlight') {
      el.style.background = hexToRgba(obj.color, 0.4);
    } else if (obj.type === 'rect') {
      el.style.border = `${Math.max(1, obj.strokeWidth * zoom)}px solid ${obj.color}`;
      if (obj.filled) el.style.background = hexToRgba(obj.color, 0.25);
    } else if (obj.type === 'circle') {
      el.style.border = `${Math.max(1, obj.strokeWidth * zoom)}px solid ${obj.color}`;
      el.style.borderRadius = '50%';
      if (obj.filled) el.style.background = hexToRgba(obj.color, 0.25);
    } else if (obj.type === 'line') {
      el.style.borderTop = `${Math.max(1, obj.strokeWidth * zoom)}px solid ${obj.color}`;
      el.style.height = '0';
    } else if (obj.type === 'note') {
      el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
      el.title = obj.note || '';
    } else if (obj.type === 'draw') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${obj.wPt} ${obj.hPt}`);
      svg.style.width = '100%'; svg.style.height = '100%'; svg.style.overflow = 'visible';
      svg.style.pointerEvents = 'none';
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', obj.points.map((p) => `${p.x},${obj.hPt - p.y}`).join(' '));
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', obj.color);
      poly.setAttribute('stroke-width', obj.strokeWidth);
      poly.setAttribute('stroke-linecap', 'round');
      poly.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(poly);
      el.appendChild(svg);
    }

    if (obj.type !== 'note') {
      const handle = document.createElement('div');
      handle.className = 'pe-handle';
      handle.addEventListener('mousedown', (e) => startResize(e, obj));
      handle.addEventListener('touchstart', (e) => startResize(e, obj), { passive: false });
      el.appendChild(handle);
    }

    el.addEventListener('mousedown', (e) => { if (e.target === el || el.contains(e.target)) startDrag(e, obj, viewport); });
    el.addEventListener('touchstart', (e) => startDrag(e, obj, viewport), { passive: false });
    el.addEventListener('click', (e) => { e.stopPropagation(); selectObject(obj.id); });
    if (obj.type === 'text') el.addEventListener('dblclick', () => editTextInline(obj, el));
    return el;
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function eventXY(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function startDrag(e, obj, viewport) {
    if (e.target.classList.contains('pe-handle')) return;
    e.preventDefault();
    selectObject(obj.id);
    const start = eventXY(e);
    const origScreen = pdfPointToScreen(obj.xPt, obj.yPt + obj.hPt, viewport);

    function onMove(ev) {
      const cur = eventXY(ev);
      const dx = cur.x - start.x, dy = cur.y - start.y;
      const pdfTopLeft = screenToPdfPoint(origScreen.x + dx, origScreen.y + dy, viewport);
      obj.xPt = pdfTopLeft.x;
      obj.yPt = pdfTopLeft.y - obj.hPt;
      renderCurrentPage();
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      pushHistory();
      invalidateThumb(pageOrder[currentPageIdx]);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  function startResize(e, obj) {
    e.preventDefault(); e.stopPropagation();
    const start = eventXY(e);
    const startW = obj.wPt, startH = obj.hPt;
    function onMove(ev) {
      const cur = eventXY(ev);
      const dxPt = (cur.x - start.x) / (zoom * 1.5);
      const dyPt = (cur.y - start.y) / (zoom * 1.5);
      obj.wPt = Math.max(8, startW + dxPt);
      obj.hPt = Math.max(8, startH - dyPt);
      renderCurrentPage();
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      pushHistory();
      invalidateThumb(pageOrder[currentPageIdx]);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  function selectObject(id) { selectedObjId = id; renderCurrentPage(); updatePropsPanel(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { selectedObjId = null; renderCurrentPage(); updatePropsPanel(); } });

  function deleteSelectedObject() {
    if (!selectedObjId) return;
    objects = objects.filter((o) => o.id !== selectedObjId);
    selectedObjId = null;
    invalidateThumb(pageOrder[currentPageIdx]);
    pushHistory();
    renderCurrentPage(); updatePropsPanel(); renderSidebarThumbs();
  }

  function editTextInline(obj, el) {
    const ta = document.createElement('textarea');
    ta.value = obj.text;
    ta.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;border:none;outline:2px solid var(--signal);
      font-size:${obj.fontSizePt * zoom * 1.5}px;color:${obj.color};font-family:Helvetica,Arial,sans-serif;
      font-weight:${obj.bold ? '700' : '400'};font-style:${obj.italic ? 'italic' : 'normal'};resize:none;background:#fff;padding:2px 4px;`;
    el.innerHTML = '';
    el.appendChild(ta);
    ta.focus(); ta.select();
    function commit() {
      obj.text = ta.value || ' ';
      invalidateThumb(pageOrder[currentPageIdx]);
      pushHistory();
      renderCurrentPage();
    }
    ta.addEventListener('blur', commit);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); } });
  }

  function setMode(m) {
    mode = m; subTool = null;
    [...toolbar.children].forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    renderSubtoolbar();
  }
  toolbar.addEventListener('click', (e) => { const b = e.target.closest('.pe-tab'); if (b) setMode(b.dataset.mode); });

  const SUBTOOLS = {
    select: [],
    edit: [
      { id: 'text', label: 'Text', icon: '<path d="M4 6h16M4 12h10M4 18h7"/>' },
      { id: 'image', label: 'Image', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>' },
    ],
    annotate: [
      { id: 'highlight', label: 'Highlight', icon: '<path d="M9 11l6-6 4 4-6 6H9z"/><path d="M4 20l3-3"/>' },
      { id: 'draw', label: 'Draw', icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>' },
      { id: 'rect', label: 'Rectangle', icon: '<rect x="3" y="6" width="18" height="12" rx="1"/>' },
      { id: 'circle', label: 'Circle', icon: '<circle cx="12" cy="12" r="9"/>' },
      { id: 'line', label: 'Line', icon: '<path d="M5 19L19 5"/>' },
      { id: 'note', label: 'Note', icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
    ],
    sign: [
      { id: 'sig-draw', label: 'Draw signature', icon: '<path d="M3 17c3-1 5-4 7-4s2 3 4 3 3-4 6-1"/>' },
      { id: 'sig-type', label: 'Type signature', icon: '<path d="M4 7V5h16v2"/><path d="M9 5v14M15 5v14"/>' },
    ],
  };

  function renderSubtoolbar() {
    subtoolbar.innerHTML = '';
    const tools = SUBTOOLS[mode] || [];
    if (tools.length === 0) {
      subtoolbar.innerHTML = '<span class="pe-empty-hint" style="padding:4px 0;">Click any item on the page to select, move or resize it.</span>';
      return;
    }
    for (const t of tools) {
      const btn = document.createElement('button');
      btn.className = 'pe-subbtn';
      btn.dataset.tool = t.id;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg>${t.label}`;
      btn.addEventListener('click', () => {
        subTool = subTool === t.id ? null : t.id;
        [...subtoolbar.children].forEach((b) => b.classList.toggle('active', b.dataset.tool === subTool));
        if (subTool === 'image') triggerImagePicker();
        if (subTool === 'sig-draw') openSignaturePad('draw');
        if (subTool === 'sig-type') openSignaturePad('type');
      });
      subtoolbar.appendChild(btn);
    }
  }

  pageStage.addEventListener('click', (e) => {
    if (!subTool || e.target !== overlay) return;
    if (['image', 'sig-draw', 'sig-type', 'draw'].includes(subTool)) return;
    placeObjectAt(e);
  });

  async function currentViewportForCurrentPage() {
    const origPageIdx = pageOrder[currentPageIdx];
    if (origPageIdx <= -1000) {
      const w = 612 * zoom, h = 792 * zoom;
      return { width: w, height: h,
        convertToViewportPoint: (x, y) => [x * zoom, h - y * zoom],
        convertToPdfPoint: (sx, sy) => [sx / zoom, (h - sy) / zoom] };
    }
    const page = await pdfDoc.getPage(origPageIdx + 1);
    const extraRotation = pageRotations[origPageIdx] || 0;
    return page.getViewport({ scale: zoom * 1.5, rotation: (page.rotate + extraRotation) % 360 });
  }

  async function placeObjectAt(e) {
    const rect = overlay.getBoundingClientRect();
    const xy = eventXY(e);
    const sx = xy.x - rect.left, sy = xy.y - rect.top;
    const viewport = await currentViewportForCurrentPage();
    const pdfPt = screenToPdfPoint(sx, sy, viewport);
    const origPageIdx = pageOrder[currentPageIdx];

    let obj = null;
    const id = nextObjId++;
    if (subTool === 'text') obj = { id, pageIdx: origPageIdx, type: 'text', xPt: pdfPt.x, yPt: pdfPt.y - 10, wPt: 140, hPt: 22, text: 'Text', fontSizePt: 14, color: '#111111', bold: false, italic: false };
    else if (subTool === 'highlight') obj = { id, pageIdx: origPageIdx, type: 'highlight', xPt: pdfPt.x, yPt: pdfPt.y - 10, wPt: 120, hPt: 20, color: '#FFEB3B' };
    else if (subTool === 'rect') obj = { id, pageIdx: origPageIdx, type: 'rect', xPt: pdfPt.x, yPt: pdfPt.y - 40, wPt: 100, hPt: 60, color: '#E53935', strokeWidth: 2, filled: false };
    else if (subTool === 'circle') obj = { id, pageIdx: origPageIdx, type: 'circle', xPt: pdfPt.x, yPt: pdfPt.y - 40, wPt: 70, hPt: 70, color: '#1E88E5', strokeWidth: 2, filled: false };
    else if (subTool === 'line') obj = { id, pageIdx: origPageIdx, type: 'line', xPt: pdfPt.x, yPt: pdfPt.y, wPt: 100, hPt: 2, color: '#111111', strokeWidth: 2 };
    else if (subTool === 'note') obj = { id, pageIdx: origPageIdx, type: 'note', xPt: pdfPt.x, yPt: pdfPt.y - 16, wPt: 17, hPt: 16, note: '' };
    if (!obj) return;
    objects.push(obj);
    invalidateThumb(origPageIdx);
    pushHistory();
    selectObject(id);
    renderSidebarThumbs();
  }

  const imgFileInput = document.createElement('input');
  imgFileInput.type = 'file'; imgFileInput.accept = 'image/png,image/jpeg'; imgFileInput.hidden = true;
  document.body.appendChild(imgFileInput);
  function triggerImagePicker() { imgFileInput.click(); }
  imgFileInput.addEventListener('change', async () => {
    const f = imgFileInput.files[0];
    imgFileInput.value = '';
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    const dims = await imageDims(dataUrl);
    const viewport = await currentViewportForCurrentPage();
    const origPageIdx = pageOrder[currentPageIdx];
    const pageW = viewport.width / (zoom * 1.5), pageH = viewport.height / (zoom * 1.5);
    let wPt = dims.w * 0.75, hPt = dims.h * 0.75;
    const maxW = pageW * 0.6, maxH = pageH * 0.6;
    if (wPt > maxW || hPt > maxH) {
      const scale = Math.min(maxW / wPt, maxH / hPt);
      wPt *= scale; hPt *= scale;
    }
    const xPt = (pageW - wPt) / 2, yPt = (pageH - hPt) / 2;
    const id = nextObjId++;
    objects.push({ id, pageIdx: origPageIdx, type: 'image', xPt, yPt, wPt, hPt, dataUrl, mimeType: f.type });
    invalidateThumb(origPageIdx);
    pushHistory();
    selectObject(id);
    renderSidebarThumbs();
  });
  function fileToDataUrl(f) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(f);
    });
  }
  function imageDims(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth * 0.75, h: img.naturalHeight * 0.75 });
      img.src = dataUrl;
    });
  }

  let drawing = false, drawPoints = [];
  overlay.addEventListener('mousedown', (e) => { if (subTool === 'draw' && e.target === overlay) startFreehand(e); });
  overlay.addEventListener('touchstart', (e) => { if (subTool === 'draw' && e.target === overlay) startFreehand(e); }, { passive: false });

  async function startFreehand(e) {
    e.preventDefault();
    drawing = true; drawPoints = [];
    const viewport = await currentViewportForCurrentPage();
    const rect = overlay.getBoundingClientRect();
    function addPoint(ev) {
      const xy = eventXY(ev);
      const pdfPt = screenToPdfPoint(xy.x - rect.left, xy.y - rect.top, viewport);
      drawPoints.push(pdfPt);
    }
    addPoint(e);
    function onMove(ev) { if (drawing) addPoint(ev); }
    function onUp() {
      drawing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      finalizeFreehand();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  function finalizeFreehand() {
    if (drawPoints.length < 2) { drawPoints = []; return; }
    const xs = drawPoints.map((p) => p.x), ys = drawPoints.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const wPt = Math.max(4, maxX - minX), hPt = Math.max(4, maxY - minY);
    const relPoints = drawPoints.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    const origPageIdx = pageOrder[currentPageIdx];
    const id = nextObjId++;
    objects.push({ id, pageIdx: origPageIdx, type: 'draw', xPt: minX, yPt: minY, wPt, hPt, points: relPoints, color: '#E53935', strokeWidth: 2.5 });
    drawPoints = [];
    invalidateThumb(origPageIdx);
    pushHistory();
    renderCurrentPage();
    renderSidebarThumbs();
  }

  function openSignaturePad(kind) {
    const overlayDiv = document.createElement('div');
    overlayDiv.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--paper);border-radius:14px;padding:24px;max-width:420px;width:92%;';
    if (kind === 'draw') {
      box.innerHTML = `
        <h3 style="margin:0 0 12px;font-size:16px;">Draw your signature</h3>
        <div class="pe-sig-pad-wrap"><canvas id="peSigCanvas" class="pe-sig-canvas" width="360" height="140"></canvas></div>
        <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">
          <button class="pe-btn" id="peSigClear">Clear</button>
          <button class="pe-btn" id="peSigCancel">Cancel</button>
          <button class="pe-btn primary" id="peSigUse">Use signature</button>
        </div>`;
    } else {
      box.innerHTML = `
        <h3 style="margin:0 0 12px;font-size:16px;">Type your signature</h3>
        <input type="text" id="peSigTypeInput" placeholder="Your name" style="width:100%;padding:12px;font-size:28px;font-family:'Space Grotesk',cursive;border:1px solid var(--line-strong);border-radius:8px;box-sizing:border-box;" />
        <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">
          <button class="pe-btn" id="peSigCancel">Cancel</button>
          <button class="pe-btn primary" id="peSigUse">Use signature</button>
        </div>`;
    }
    overlayDiv.appendChild(box);
    document.body.appendChild(overlayDiv);

    let sigCanvas, sigCtx, sigDrawing = false;
    if (kind === 'draw') {
      sigCanvas = box.querySelector('#peSigCanvas');
      sigCtx = sigCanvas.getContext('2d');
      sigCtx.lineWidth = 2.5; sigCtx.lineCap = 'round'; sigCtx.strokeStyle = '#111';
      const startSig = (e) => { sigDrawing = true; const p = sigPos(e, sigCanvas); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); };
      const moveSig = (e) => { if (!sigDrawing) return; e.preventDefault(); const p = sigPos(e, sigCanvas); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); };
      const endSig = () => { sigDrawing = false; };
      sigCanvas.addEventListener('mousedown', startSig);
      sigCanvas.addEventListener('mousemove', moveSig);
      window.addEventListener('mouseup', endSig);
      sigCanvas.addEventListener('touchstart', startSig, { passive: false });
      sigCanvas.addEventListener('touchmove', moveSig, { passive: false });
      sigCanvas.addEventListener('touchend', endSig);
      box.querySelector('#peSigClear').addEventListener('click', () => sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height));
    }
    function sigPos(e, canvas) {
      const rect = canvas.getBoundingClientRect();
      const xy = eventXY(e);
      return { x: xy.x - rect.left, y: xy.y - rect.top };
    }

    box.querySelector('#peSigCancel').addEventListener('click', () => { overlayDiv.remove(); subTool = null; renderSubtoolbar(); });

    box.querySelector('#peSigUse').addEventListener('click', async () => {
      let dataUrl;
      if (kind === 'draw') {
        dataUrl = sigCanvas.toDataURL('image/png');
      } else {
        const input = box.querySelector('#peSigTypeInput');
        const name = input.value.trim();
        if (!name) { input.focus(); return; }
        const c = document.createElement('canvas');
        c.width = 500; c.height = 140;
        const cx = c.getContext('2d');
        cx.font = "56px 'Space Grotesk', cursive";
        cx.fillStyle = '#111';
        cx.textBaseline = 'middle';
        cx.fillText(name, 10, 70);
        dataUrl = c.toDataURL('image/png');
      }
      signatureDataUrl = dataUrl;
      overlayDiv.remove();
      subTool = null;
      renderSubtoolbar();
      await placeSignature(dataUrl);
    });
  }

  async function placeSignature(dataUrl) {
    const viewport = await currentViewportForCurrentPage();
    const pageW = viewport.width / (zoom * 1.5), pageH = viewport.height / (zoom * 1.5);
    const wPt = 130, hPt = 45;
    const xPt = pageW - wPt - 40, yPt = 40;
    const origPageIdx = pageOrder[currentPageIdx];
    const id = nextObjId++;
    objects.push({ id, pageIdx: origPageIdx, type: 'signature', xPt, yPt, wPt, hPt, dataUrl });
    invalidateThumb(origPageIdx);
    pushHistory();
    selectObject(id);
    renderSidebarThumbs();
  }

  function updatePropsPanel() {
    const obj = objects.find((o) => o.id === selectedObjId);
    if (!obj) {
      propsBody.innerHTML = '<p class="pe-empty-hint">Select an item on the page, or choose a tool above, to see its options here.</p>';
      return;
    }
    let html = '';
    if (obj.type === 'text') {
      html = `
        <div class="pe-field"><label>Font size</label><input type="number" id="pfSize" min="6" max="120" value="${obj.fontSizePt}" /></div>
        <div class="pe-field"><label>Color</label><input type="color" id="pfColor" value="${obj.color}" /></div>
        <div class="pe-field"><label>Style</label>
          <div style="display:flex;gap:6px;">
            <button class="pe-btn" id="pfBold" style="flex:1;${obj.bold ? 'background:var(--signal-tint);' : ''}"><b>B</b></button>
            <button class="pe-btn" id="pfItalic" style="flex:1;${obj.italic ? 'background:var(--signal-tint);' : ''}"><i>I</i></button>
          </div>
        </div>`;
    } else if (['rect', 'circle', 'line', 'draw'].includes(obj.type)) {
      html = `
        <div class="pe-field"><label>Color</label><input type="color" id="pfColor" value="${obj.color}" /></div>
        <div class="pe-field"><label>Thickness</label><input type="number" id="pfStroke" min="1" max="20" value="${obj.strokeWidth}" /></div>
        ${obj.type === 'rect' || obj.type === 'circle' ? `<div class="pe-field"><label>Fill</label><input type="checkbox" id="pfFilled" ${obj.filled ? 'checked' : ''} /></div>` : ''}`;
    } else if (obj.type === 'highlight') {
      html = `<div class="pe-field"><label>Color</label><input type="color" id="pfColor" value="${obj.color}" /></div>`;
    } else if (obj.type === 'note') {
      html = `<div class="pe-field"><label>Note text</label><textarea id="pfNoteText" rows="4" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--line-strong);border-radius:6px;">${obj.note || ''}</textarea></div>`;
    } else if (obj.type === 'image' || obj.type === 'signature') {
      html = `<p class="pe-empty-hint">Drag the corner handle to resize, or drag the ${obj.type} to move it.</p>`;
    }
    html += `<button class="pe-btn" id="pfDelete" style="width:100%;margin-top:6px;color:#c0392b;border-color:#c0392b;">Delete</button>`;
    propsBody.innerHTML = html;

    const sizeIn = document.getElementById('pfSize');
    if (sizeIn) sizeIn.addEventListener('input', () => { obj.fontSizePt = parseFloat(sizeIn.value) || 14; renderCurrentPage(); });
    const colorIn = document.getElementById('pfColor');
    if (colorIn) colorIn.addEventListener('input', () => { obj.color = colorIn.value; renderCurrentPage(); });
    const boldBtn = document.getElementById('pfBold');
    if (boldBtn) boldBtn.addEventListener('click', () => { obj.bold = !obj.bold; renderCurrentPage(); updatePropsPanel(); });
    const italicBtn = document.getElementById('pfItalic');
    if (italicBtn) italicBtn.addEventListener('click', () => { obj.italic = !obj.italic; renderCurrentPage(); updatePropsPanel(); });
    const strokeIn = document.getElementById('pfStroke');
    if (strokeIn) strokeIn.addEventListener('input', () => { obj.strokeWidth = parseFloat(strokeIn.value) || 2; renderCurrentPage(); });
    const filledIn = document.getElementById('pfFilled');
    if (filledIn) filledIn.addEventListener('change', () => { obj.filled = filledIn.checked; renderCurrentPage(); });
    const noteText = document.getElementById('pfNoteText');
    if (noteText) noteText.addEventListener('input', () => { obj.note = noteText.value; });
    document.getElementById('pfDelete').addEventListener('click', () => deleteSelectedObject());

    [colorIn, strokeIn, filledIn, noteText].forEach((el) => {
      if (el) el.addEventListener('change', () => { invalidateThumb(pageOrder[currentPageIdx]); pushHistory(); });
    });
  }

  function invalidateThumb(origPageIdx) { delete thumbCache[origPageIdx]; }

  async function renderThumbDataUrl(origPageIdx) {
    if (thumbCache[origPageIdx]) return thumbCache[origPageIdx];
    if (origPageIdx <= -1000) {
      const c = document.createElement('canvas');
      c.width = 135; c.height = 175;
      const cx = c.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
      cx.strokeStyle = '#ddd'; cx.strokeRect(0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.8);
      thumbCache[origPageIdx] = url;
      return url;
    }
    const page = await pdfDoc.getPage(origPageIdx + 1);
    const extraRotation = pageRotations[origPageIdx] || 0;
    const viewport = page.getViewport({ scale: 0.22, rotation: (page.rotate + extraRotation) % 360 });
    const c = document.createElement('canvas');
    c.width = viewport.width; c.height = viewport.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport }).promise;
    const url = c.toDataURL('image/jpeg', 0.7);
    thumbCache[origPageIdx] = url;
    return url;
  }

  async function renderSidebarThumbs() {
    sidebar.innerHTML = '';
    for (let i = 0; i < pageOrder.length; i++) {
      const origIdx = pageOrder[i];
      const thumb = document.createElement('div');
      thumb.className = 'pe-thumb' + (i === currentPageIdx ? ' active' : '');
      thumb.draggable = true;
      thumb.dataset.idx = i;
      const dataUrl = await renderThumbDataUrl(origIdx);
      thumb.innerHTML = `
        <img src="${dataUrl}" alt="Page ${i + 1}" />
        <span class="pe-thumb-num">${i + 1}</span>
        <button class="pe-thumb-menu-btn" title="Page options">
          <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
        </button>
        <div class="pe-thumb-menu">
          <button data-act="rotate"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>Rotate</button>
          <button data-act="duplicate"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>Duplicate</button>
          <button data-act="delete" style="color:#c0392b;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>Delete</button>
        </div>`;
      thumb.addEventListener('click', (e) => {
        if (e.target.closest('.pe-thumb-menu-btn') || e.target.closest('.pe-thumb-menu')) return;
        currentPageIdx = i;
        selectedObjId = null;
        renderCurrentPage(); updatePropsPanel(); renderSidebarThumbs();
      });
      const menuBtn = thumb.querySelector('.pe-thumb-menu-btn');
      const menu = thumb.querySelector('.pe-thumb-menu');
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.pe-thumb-menu.open').forEach((m) => { if (m !== menu) m.classList.remove('open'); });
        menu.classList.toggle('open');
      });
      menu.querySelector('[data-act="rotate"]').addEventListener('click', (e) => { e.stopPropagation(); rotatePage(i); menu.classList.remove('open'); });
      menu.querySelector('[data-act="duplicate"]').addEventListener('click', (e) => { e.stopPropagation(); duplicatePage(i); menu.classList.remove('open'); });
      menu.querySelector('[data-act="delete"]').addEventListener('click', (e) => { e.stopPropagation(); deletePage(i); menu.classList.remove('open'); });

      thumb.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); });
      thumb.addEventListener('dragover', (e) => e.preventDefault());
      thumb.addEventListener('drop', (e) => {
        e.preventDefault();
        reorderPage(parseInt(e.dataTransfer.getData('text/plain'), 10), i);
      });
      sidebar.appendChild(thumb);
    }
    const addBtn = document.createElement('button');
    addBtn.className = 'pe-add-page-btn';
    addBtn.textContent = '+ Add blank page';
    addBtn.addEventListener('click', addBlankPage);
    sidebar.appendChild(addBtn);
    document.addEventListener('click', () => document.querySelectorAll('.pe-thumb-menu.open').forEach((m) => m.classList.remove('open')), { once: true });
  }

  function highlightActiveThumb() {
    [...sidebar.querySelectorAll('.pe-thumb')].forEach((t, i) => t.classList.toggle('active', i === currentPageIdx));
  }

  function rotatePage(i) {
    const origIdx = pageOrder[i];
    pageRotations[origIdx] = ((pageRotations[origIdx] || 0) + 90) % 360;
    invalidateThumb(origIdx);
    pushHistory();
    if (i === currentPageIdx) renderCurrentPage();
    renderSidebarThumbs();
  }

  function deletePage(i) {
    if (pageOrder.length <= 1) { showError('A PDF needs at least one page.'); setTimeout(clearError, 2500); return; }
    const origIdx = pageOrder[i];
    objects = objects.filter((o) => o.pageIdx !== origIdx);
    pageOrder.splice(i, 1);
    if (currentPageIdx >= pageOrder.length) currentPageIdx = pageOrder.length - 1;
    pushHistory();
    renderCurrentPage();
    renderSidebarThumbs();
  }

  function duplicatePage(i) {
    const origIdx = pageOrder[i];
    pageOrder.splice(i + 1, 0, origIdx);
    pushHistory();
    renderSidebarThumbs();
  }

  function addBlankPage() {
    const blankMarker = -1000 - pageOrder.filter((p) => p <= -1000).length;
    pageOrder.splice(currentPageIdx + 1, 0, blankMarker);
    pageRotations[blankMarker] = 0;
    currentPageIdx += 1;
    pushHistory();
    renderCurrentPage();
    renderSidebarThumbs();
  }

  function reorderPage(fromIdx, toIdx) {
    if (fromIdx === toIdx || isNaN(fromIdx)) return;
    const [moved] = pageOrder.splice(fromIdx, 1);
    pageOrder.splice(toIdx, 0, moved);
    if (currentPageIdx === fromIdx) currentPageIdx = toIdx;
    pushHistory();
    renderSidebarThumbs();
    renderCurrentPage();
  }

  document.getElementById('peZoomIn').addEventListener('click', () => { zoom = Math.min(3, zoom + 0.15); renderCurrentPage(); });
  document.getElementById('peZoomOut').addEventListener('click', () => { zoom = Math.max(0.3, zoom - 0.15); renderCurrentPage(); });

  document.getElementById('peDownloadBtn').addEventListener('click', async () => {
    const btn = document.getElementById('peDownloadBtn');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Preparing&hellip;';
    try {
      const bytes = await buildFinalPdf();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'edited.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      console.error('ConvertKoro PDF Editor: save failed.', e);
      showError('Couldn\u2019t save the PDF. Please try again.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  async function buildFinalPdf() {
    const srcDoc = await PDFDocument.load(originalBytes.slice(0));
    const outDoc = await PDFDocument.create();
    const helv = await outDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await outDoc.embedFont(StandardFonts.HelveticaBold);
    const helvOblique = await outDoc.embedFont(StandardFonts.HelveticaOblique);
    const helvBoldOblique = await outDoc.embedFont(StandardFonts.HelveticaBoldOblique);
    const imageCache = {};

    for (let i = 0; i < pageOrder.length; i++) {
      const origIdx = pageOrder[i];
      let newPage;
      if (origIdx <= -1000) {
        newPage = outDoc.addPage([612, 792]);
      } else {
        const [copiedPage] = await outDoc.copyPages(srcDoc, [origIdx]);
        newPage = outDoc.addPage(copiedPage);
        const extraRotation = pageRotations[origIdx] || 0;
        if (extraRotation) {
          const current = newPage.getRotation().angle || 0;
          newPage.setRotation(degrees((current + extraRotation) % 360));
        }
      }
      const pageObjects = objects.filter((o) => o.pageIdx === origIdx);
      for (const obj of pageObjects) {
        await drawObjectOnPage(newPage, obj, { helv, helvBold, helvOblique, helvBoldOblique, imageCache, outDoc });
      }
    }
    return outDoc.save();
  }

  async function getEmbeddedImage(dataUrl, mimeType, outDoc, cache) {
    if (cache[dataUrl]) return cache[dataUrl];
    const base64 = dataUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const isPng = dataUrl.startsWith('data:image/png') || (mimeType && mimeType.includes('png'));
    const embedded = isPng ? await outDoc.embedPng(bytes) : await outDoc.embedJpg(bytes);
    cache[dataUrl] = embedded;
    return embedded;
  }

  async function drawObjectOnPage(page, obj, ctx) {
    const { helv, helvBold, helvOblique, helvBoldOblique, imageCache, outDoc } = ctx;
    if (obj.type === 'text') {
      const font = obj.bold && obj.italic ? helvBoldOblique : obj.bold ? helvBold : obj.italic ? helvOblique : helv;
      const color = hexToRgbLib(obj.color);
      page.drawText(obj.text, {
        x: obj.xPt, y: obj.yPt + obj.hPt - obj.fontSizePt * 0.85,
        size: obj.fontSizePt, font, color: rgb(color.r, color.g, color.b),
        maxWidth: obj.wPt, lineHeight: obj.fontSizePt * 1.15,
      });
    } else if (obj.type === 'image' || obj.type === 'signature') {
      const embedded = await getEmbeddedImage(obj.dataUrl, obj.mimeType, outDoc, imageCache);
      page.drawImage(embedded, { x: obj.xPt, y: obj.yPt, width: obj.wPt, height: obj.hPt });
    } else if (obj.type === 'highlight') {
      const color = hexToRgbLib(obj.color);
      page.drawRectangle({ x: obj.xPt, y: obj.yPt, width: obj.wPt, height: obj.hPt, color: rgb(color.r, color.g, color.b), opacity: 0.4 });
    } else if (obj.type === 'rect') {
      const color = hexToRgbLib(obj.color);
      page.drawRectangle({
        x: obj.xPt, y: obj.yPt, width: obj.wPt, height: obj.hPt,
        borderColor: rgb(color.r, color.g, color.b), borderWidth: obj.strokeWidth,
        color: obj.filled ? rgb(color.r, color.g, color.b) : undefined, opacity: obj.filled ? 0.25 : 1,
      });
    } else if (obj.type === 'circle') {
      const color = hexToRgbLib(obj.color);
      page.drawEllipse({
        x: obj.xPt + obj.wPt / 2, y: obj.yPt + obj.hPt / 2, xScale: obj.wPt / 2, yScale: obj.hPt / 2,
        borderColor: rgb(color.r, color.g, color.b), borderWidth: obj.strokeWidth,
        color: obj.filled ? rgb(color.r, color.g, color.b) : undefined, opacity: obj.filled ? 0.25 : 1,
      });
    } else if (obj.type === 'line') {
      const color = hexToRgbLib(obj.color);
      page.drawLine({
        start: { x: obj.xPt, y: obj.yPt }, end: { x: obj.xPt + obj.wPt, y: obj.yPt - obj.hPt },
        thickness: obj.strokeWidth, color: rgb(color.r, color.g, color.b),
      });
    } else if (obj.type === 'draw') {
      const color = hexToRgbLib(obj.color);
      for (let i = 0; i < obj.points.length - 1; i++) {
        const p1 = obj.points[i], p2 = obj.points[i + 1];
        page.drawLine({
          start: { x: obj.xPt + p1.x, y: obj.yPt + p1.y }, end: { x: obj.xPt + p2.x, y: obj.yPt + p2.y },
          thickness: obj.strokeWidth, color: rgb(color.r, color.g, color.b),
        });
      }
    } else if (obj.type === 'note') {
      const color = hexToRgbLib('#FFD54A');
      page.drawRectangle({ x: obj.xPt, y: obj.yPt, width: obj.wPt, height: obj.hPt, color: rgb(color.r, color.g, color.b) });
    }
  }

  function hexToRgbLib(hex) {
    const h = hex.replace('#', '');
    return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
  }
})();
