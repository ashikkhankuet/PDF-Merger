// ConvertKoro Google Drive Picker integration.
//
// This is a genuinely separate feature from the rest of ConvertKoro's
// "everything runs in your browser" design: picking a file from Drive
// means fetching that file's bytes from Google's servers into the
// browser first (the same way any embedded image or script on a page
// is fetched) before the chosen tool can process it locally as usual.
// The file is never sent to ConvertKoro's own servers at any point -
// this only ever talks to Google's Picker/Drive APIs directly from the
// visitor's browser, using their own Google sign-in.
//
// Scope used: drive.file - the picker-specific, non-sensitive scope
// that only grants access to files the user explicitly selects through
// this picker, not blanket access to their whole Drive. This is
// deliberate: it keeps ConvertKoro out of Google's stricter app-
// verification requirements that apply to broader scopes.

(function () {
  const CLIENT_ID = '606963353160-h3t7ibc1k1jg8eknehi7j8sm0ei3i0c2.apps.googleusercontent.com';
  const API_KEY = 'AIzaSyDzsFShogDkvS6x5BkA8EI_nt8wx5aJcVU';
  const APP_ID = '606963353160';
  const SCOPES = 'https://www.googleapis.com/auth/drive.file';

  let tokenClient = null;
  let accessToken = null;
  let pickerInited = false;
  let gisInited = false;
  let gapiScriptLoaded = false;
  let gisScriptLoaded = false;

  // Loaded lazily, only once the visitor actually clicks "From Google
  // Drive" - not on every page load, so tools that never use this
  // feature don't pay for it.
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureLibrariesLoaded() {
    if (!gapiScriptLoaded) {
      await loadScript('https://apis.google.com/js/api.js');
      gapiScriptLoaded = true;
    }
    if (!gisScriptLoaded) {
      await loadScript('https://accounts.google.com/gsi/client');
      gisScriptLoaded = true;
    }
    if (!pickerInited) {
      await new Promise((resolve) => {
        gapi.load('client:picker', async () => {
          await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
          pickerInited = true;
          resolve();
        });
      });
    }
    if (!gisInited) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // set per-call below
        error_callback: '', // set per-call below - see requestAccessToken()
      });
      gisInited = true;
    }
  }

  function requestAccessToken() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, arg) => { if (!settled) { settled = true; clearTimeout(safetyTimer); fn(arg); } };

      tokenClient.callback = (response) => {
        if (response.error !== undefined) {
          settle(reject, response);
          return;
        }
        accessToken = response.access_token;
        settle(resolve, accessToken);
      };
      // error_callback specifically covers the case the regular callback
      // above does NOT: the person closing the sign-in popup window (the
      // "X" icon) rather than actively denying access. This is a real,
      // documented gap in Google Identity Services' initTokenClient - the
      // main callback is simply never invoked when the popup is closed
      // this way, so without this, the calling button would stay stuck
      // on "Opening..." forever with no way to recover.
      tokenClient.error_callback = (err) => {
        settle(reject, err);
      };

      // Defense-in-depth: if neither callback fires within a reasonable
      // window (an edge case beyond the documented popup-closed gap
      // error_callback already covers above), don't leave the calling
      // button stuck indefinitely - time out and let it recover.
      const safetyTimer = setTimeout(() => {
        settle(reject, { error: 'timeout' });
      }, 60000);

      tokenClient.requestAccessToken({ prompt: accessToken === null ? 'consent' : '' });
    });
  }

  function showPicker(mimeTypes, multiSelect) {
    return new Promise((resolve, reject) => {
      const view = new google.picker.View(google.picker.ViewId.DOCS);
      if (mimeTypes) view.setMimeTypes(mimeTypes);

      const builder = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .setDeveloperKey(API_KEY)
        .setAppId(APP_ID)
        .setOAuthToken(accessToken)
        .addView(view)
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) {
            resolve(data[google.picker.Response.DOCUMENTS]);
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        });

      // Only enabled for tools that actually accept more than one file
      // (merge, image-to-pdf, jpg-to-pdf) - passed in per-call from
      // wireBrowseMenu's config below, not a blanket default, since a
      // single-file tool letting someone pick 5 files and silently using
      // only the first would be confusing, not a real feature.
      if (multiSelect) {
        builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
      }

      const picker = builder.build();
      picker.setVisible(true);
    });
  }

  // Handles a real keyboard paste event (Ctrl+V / Cmd+V). This is the
  // reliable path for a file copied from an OS file manager (Explorer,
  // Finder) - clipboardData.files carries the actual file with its real
  // name, type, and bytes, unlike the async clipboard.read() API used by
  // the Paste button, which is built mainly for images/text and often
  // can't see an OS-level file copy at all.
  function handlePasteEvent(e, pasteMimeCheck, onFiles) {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const item of items) {
      if (item.kind === 'file' && pasteMimeCheck({ type: item.type })) {
        const pastedFile = item.getAsFile();
        if (pastedFile) {
          e.preventDefault();
          onFiles([pastedFile]);
        }
        break;
      }
    }
  }

  // Downloads the actual file bytes for a picked Drive document and
  // returns a real browser File object, so callers can hand it straight
  // to the same setFile()/addFiles() functions already used for
  // drag-drop, browse, and paste on every tool page - Drive is just a
  // fourth way to get bytes into that same existing pipeline.
  async function downloadPickedFile(doc) {
    const fileId = doc[google.picker.Document.ID];
    const fileName = doc[google.picker.Document.NAME];
    const mimeType = doc[google.picker.Document.MIME_TYPE];

    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!resp.ok) {
      throw new Error(`Drive download failed (${resp.status})`);
    }
    const blob = await resp.blob();
    return new File([blob], fileName, { type: mimeType || blob.type });
  }

  // Public entry point. mimeTypes is an optional comma-separated string
  // (Picker's own filter format, e.g. 'application/pdf') to narrow what
  // the picker shows - matches each tool's accepted file type.
  // Returns an array of real File objects (usually just one, unless the
  // caller enables multi-select), or null if the user cancelled at any
  // step (auth prompt or picker itself).
  window.ConvertKoroDrivePicker = {
    async pick(mimeTypes, multiSelect) {
      await ensureLibrariesLoaded();
      try {
        await requestAccessToken();
      } catch (err) {
        console.warn('ConvertKoro Drive Picker: sign-in was cancelled or failed.', err);
        return null;
      }
      const docs = await showPicker(mimeTypes, multiSelect);
      if (!docs) return null;
      const files = [];
      for (const doc of docs) {
        try {
          files.push(await downloadPickedFile(doc));
        } catch (err) {
          console.warn('ConvertKoro Drive Picker: failed to download a picked file.', doc, err);
        }
      }
      return files.length ? files : null;
    },

    // Renders three always-visible source buttons (Device / Google Drive /
    // Paste) inside a tool's dropzone - replacing the earlier "click
    // browse to reveal a hidden menu" pattern, since all three sources
    // should be visible up front rather than discovered by clicking.
    //
    // config:
    //   containerEl    - element to render the buttons into (usually the dropzone)
    //   fileInputEl    - the hidden <input type="file"> to trigger for device browsing
    //   mimeTypes      - comma-separated MIME filter string for the Drive Picker (optional)
    //   pasteMimeCheck(item) - function(clipboard item) => boolean, decides
    //                    whether a given clipboard item matches this tool's
    //                    accepted file type. Required for the Paste button.
    //   multiSelect    - whether the Drive Picker allows selecting more than one file
    //   onFiles(files) - called with an array of File objects, from any of the three sources
    renderSourceButtons(config) {
      const { containerEl, fileInputEl, mimeTypes, pasteMimeCheck, multiSelect, onFiles } = config;
      if (!containerEl) return;

      const row = document.createElement('div');
      row.className = 'source-btn-row';
      row.innerHTML = `
        <button type="button" class="source-btn" data-src="device">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          Device
        </button>
        <button type="button" class="source-btn" data-src="drive">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 19h20L12 2z"/></svg>
          Google Drive
        </button>
        <button type="button" class="source-btn" data-src="paste">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/></svg>
          Paste
        </button>
      `;
      containerEl.appendChild(row);

      // Every button click must stop here - these buttons sit inside the
      // dropzone, which itself has its own "click anywhere = open device
      // picker" handler. Without this, clicking any of the three buttons
      // would also silently trigger that handler underneath.
      row.addEventListener('click', (e) => { e.stopPropagation(); });

      // Keyboard paste (Ctrl+V / Cmd+V) - this is the RELIABLE path for
      // anything copied from an OS file manager (Explorer, Finder): a
      // Ctrl+C on a PDF/.docx/audio/video file there puts a real file
      // handle on the clipboard, delivered here via the synchronous
      // paste event's clipboardData.files. This is fundamentally
      // different from (and more broadly supported than) the async
      // clipboard.read() API the Paste button below uses, which is
      // built mainly for images/text and often does NOT see an
      // OS-level file copy at all - confirmed the real cause of PDFs
      // failing through the button alone. Wiring both means: Ctrl+V
      // works for every file type (the main ask), and the button
      // remains as a click-based alternative that reliably covers
      // images specifically, with an honest fallback message for
      // anything it can't reach.
      containerEl.addEventListener('paste', (e) => handlePasteEvent(e, pasteMimeCheck, onFiles));
      document.addEventListener('paste', (e) => {
        // Also listen at the document level so Ctrl+V works even when
        // focus isn't literally inside the dropzone - matches how the
        // original keyboard-paste implementation behaved before this
        // button redesign, which is the behavior being restored here.
        if (!containerEl.isConnected) return;
        handlePasteEvent(e, pasteMimeCheck, onFiles);
      });

      row.querySelector('[data-src="device"]').addEventListener('click', () => {
        if (fileInputEl) fileInputEl.click();
      });

      row.querySelector('[data-src="drive"]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Opening&hellip;';
        try {
          const files = await window.ConvertKoroDrivePicker.pick(mimeTypes, multiSelect);
          if (files && files.length) onFiles(files);
        } catch (err) {
          console.warn('ConvertKoro Drive Picker: pick failed.', err);
        } finally {
          // Always restore the button, including when the person closes
          // the Google sign-in popup without picking anything - pick()
          // resolving to null/empty is exactly that case, not an error,
          // so this same finally block correctly covers it too.
          btn.disabled = false;
          btn.innerHTML = original;
        }
      });

      row.querySelector('[data-src="paste"]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const original = btn.innerHTML;

        // Safari does not support navigator.clipboard.read() (only the
        // narrower readText()), so this is a real, known gap - not a bug
        // to silently swallow. Tell the person plainly rather than have
        // the button do nothing with no explanation.
        if (!navigator.clipboard || !navigator.clipboard.read) {
          btn.innerHTML = 'Use Ctrl+V instead';
          setTimeout(() => { btn.innerHTML = original; }, 2200);
          return;
        }

        btn.disabled = true;
        btn.innerHTML = 'Reading clipboard&hellip;';
        try {
          const clipboardItems = await navigator.clipboard.read();
          const matched = [];
          for (const item of clipboardItems) {
            for (const type of item.types) {
              if (pasteMimeCheck({ type })) {
                const blob = await item.getType(type);
                const ext = type.split('/')[1] || 'bin';
                const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                matched.push(new File([blob], `clipboard-${stamp}.${ext}`, { type }));
                break;
              }
            }
          }
          if (matched.length) {
            btn.innerHTML = 'Pasted';
            setTimeout(() => { btn.innerHTML = original; }, 1200);
            onFiles(matched);
          } else {
            // A real, common case for non-image files (PDF, .docx, audio,
            // video): the async clipboard.read() API often cannot see an
            // OS file-manager copy at all, even though Ctrl+V (handled
            // above) can. Say so plainly instead of a generic "nothing to
            // paste" that would be misleading here.
            btn.innerHTML = 'Try Ctrl+V instead';
            setTimeout(() => { btn.innerHTML = original; }, 2400);
          }
        } catch (err) {
          console.warn('ConvertKoro paste button: clipboard read failed.', err);
          btn.innerHTML = 'Try Ctrl+V instead';
          setTimeout(() => { btn.innerHTML = original; }, 2400);
        } finally {
          btn.disabled = false;
        }
      });
    },
  };
})();

