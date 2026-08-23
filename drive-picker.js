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
      });
      gisInited = true;
    }
  }

  function requestAccessToken() {
    return new Promise((resolve, reject) => {
      tokenClient.callback = (response) => {
        if (response.error !== undefined) {
          reject(response);
          return;
        }
        accessToken = response.access_token;
        resolve(accessToken);
      };
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

    // Wires up the standard "browse" dropdown (From device / From Google
    // Drive) used across ConvertKoro's tool pages, so each tool only
    // needs to call this once with its own config rather than duplicate
    // the dropdown open/close/outside-click logic 30+ times.
    //
    // config:
    //   browseEl      - the clickable "browse" span/link that opens the menu
    //   fileInputEl    - the hidden <input type="file"> to trigger for device browsing
    //   mimeTypes      - comma-separated MIME filter string for the Picker (optional)
    //   onFiles(files) - called with an array of File objects, from either source
    wireBrowseMenu(config) {
      const { browseEl, fileInputEl, mimeTypes, multiSelect, onFiles } = config;
      if (!browseEl) return;

      const wrap = document.createElement('span');
      wrap.className = 'browse-wrap';
      browseEl.parentNode.insertBefore(wrap, browseEl);
      wrap.appendChild(browseEl);

      const menu = document.createElement('div');
      menu.className = 'browse-menu';
      menu.innerHTML = `
        <button type="button" class="browse-menu-item" data-src="device">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          From device
        </button>
        <button type="button" class="browse-menu-item" data-src="drive">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 19h20L12 2z"/></svg>
          From Google Drive
        </button>
      `;
      wrap.appendChild(menu);

      // Stop propagation for ANY click landing inside the menu - not just
      // the initial browse-span click. This was the actual bug: clicking
      // "From Google Drive" or "From device" inside the menu is itself a
      // click event that bubbles up through .browse-wrap to the dropzone's
      // own click-to-browse handler, silently firing fileInput.click() at
      // the same time as (or instead of) the intended action. A single
      // listener on the whole menu, registered before the more specific
      // per-button handlers below, closes this off completely regardless
      // of exactly which element inside the menu was clicked.
      menu.addEventListener('click', (e) => { e.stopPropagation(); });

      function closeMenu() { menu.classList.remove('open'); }
      function openMenu() { menu.classList.add('open'); }

      browseEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (menu.classList.contains('open')) closeMenu(); else openMenu();
      });
      document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) closeMenu();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
      });

      menu.querySelector('[data-src="device"]').addEventListener('click', () => {
        closeMenu();
        if (fileInputEl) fileInputEl.click();
      });

      menu.querySelector('[data-src="drive"]').addEventListener('click', async (e) => {
        closeMenu();
        const btn = e.currentTarget;
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Opening Drive&hellip;';
        try {
          const files = await window.ConvertKoroDrivePicker.pick(mimeTypes, multiSelect);
          if (files && files.length) onFiles(files);
        } catch (err) {
          console.warn('ConvertKoro Drive Picker: pick failed.', err);
        } finally {
          btn.disabled = false;
          btn.innerHTML = original;
        }
      });
    },
  };
})();
