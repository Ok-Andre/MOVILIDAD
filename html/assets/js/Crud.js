/*
 * ELECTRA - CRUD de electrolineras sobre localStorage.
 *
 * Debe cargarse DESPUÉS de Leaflet y ANTES de main.js, porque:
 *  1) engancha la creación del mapa de Leaflet para poder dibujar/editar puntos, y
 *  2) intercepta fetch('...all_chargers_geo.json') para que el resto de la página
 *     (mapa principal, gráficas) lea los datos guardados en localStorage.
 *
 * Datos: FeatureCollection GeoJSON guardada en localStorage["electra.chargers.v1"].
 * Cada feature: properties { nombre, red, n_puertos } y geometry Point [lng, lat].
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'electra.chargers.cdmx.v2';
  const SEED_URLS = [
    'all_chargers_geo.json',
    'data/all_chargers_geo.json',
    'assets/data/all_chargers_geo.json',
    'assets/js/all_chargers_geo.json'
  ];
  const DATA_URL_RE = /all_chargers_geo\.json(?:[?#]|$)/;
  const PAGE_SIZE = 25;
  const DEFAULT_REDES = ['PlugShare', 'Tesla', 'Evergo'];
  const RED_COLORS = { PlugShare: '#6b4fd3', Tesla: '#d6322e', Evergo: '#1f9d6b' };
  const FALLBACK_COLOR = '#5b6470';
  const DEFAULT_CRS = { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } };

  const $ = (id) => document.getElementById(id);
  const realFetch = window.fetch ? window.fetch.bind(window) : null;

  let collection = emptyCollection();
  let seeded = false;   // true cuando hay datos válidos (localStorage o archivo original)
  let loading = true;
  let idSeq = 0;
  let map = null;
  let dotsLayer = null;
  let draft = null;
  let toastTimer = null;
  const dots = new Map();
  const state = { editingId: null, picking: false, q: '', red: '', shown: PAGE_SIZE, showDots: true };

  /* ---------------------------------------------------------------- datos */

  function emptyCollection() {
    return { type: 'FeatureCollection', name: 'all_chargers_geo', crs: DEFAULT_CRS, features: [] };
  }

  function newId() {
    return 'c' + Date.now().toString(36) + (idSeq++).toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function sanitizeFeature(f) {
    if (!f || !f.geometry || f.geometry.type !== 'Point' || !Array.isArray(f.geometry.coordinates)) return null;
    const lng = Number(f.geometry.coordinates[0]);
    const lat = Number(f.geometry.coordinates[1]);
    if (!isFinite(lng) || !isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const p = f.properties || {};
    const nombre = String(p.nombre == null ? '' : p.nombre).trim();
    if (!nombre) return null;
    const red = String(p.red == null ? '' : p.red).trim() || 'Sin red';
    const n = parseInt(p.n_puertos, 10);
    return {
      type: 'Feature',
      id: f.id || newId(),
      properties: Object.assign({}, p, { nombre, red, n_puertos: n > 0 ? n : 1 }),
      geometry: { type: 'Point', coordinates: [lng, lat] }
    };
  }

  function sanitizeCollection(json) {
    const raw = Array.isArray(json) ? json : json && Array.isArray(json.features) ? json.features : null;
    if (!raw) return null;
    const features = [];
    let skipped = 0;
    raw.forEach((f) => {
      const ok = sanitizeFeature(f);
      if (ok) features.push(ok); else skipped++;
    });
    const c = emptyCollection();
    if (json && !Array.isArray(json)) {
      if (json.name) c.name = json.name;
      if (json.crs) c.crs = json.crs;
    }
    c.features = features;
    return { collection: c, skipped };
  }

  // Copia limpia (sin ids internos) con el mismo esquema que el archivo original.
  function exportCollection() {
    return {
      type: 'FeatureCollection',
      name: collection.name,
      crs: collection.crs,
      features: collection.features.map((f) => ({
        type: 'Feature',
        properties: Object.assign({}, f.properties),
        geometry: { type: 'Point', coordinates: f.geometry.coordinates.slice() }
      }))
    };
  }

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const res = sanitizeCollection(JSON.parse(raw));
      return res && res.collection.features.length ? res.collection : null;
    } catch (e) {
      return null;
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
      return true;
    } catch (e) {
      toast('No se pudo guardar: el almacenamiento del navegador está lleno o bloqueado.', { error: true });
      return false;
    }
  }

  function seedFromFile() {
    if (!realFetch) return Promise.resolve(null);
    let i = 0;
    const next = () => {
      if (i >= SEED_URLS.length) return Promise.resolve(null);
      const url = SEED_URLS[i++];
      return realFetch(url, { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error('http'); return r.json(); })
        .then((json) => {
          const res = sanitizeCollection(json);
          return res && res.collection.features.length ? res.collection : next();
        })
        .catch(next);
    };
    return next();
  }

  const ready = (() => {
    const stored = readStorage();
    if (stored) {
      collection = stored;
      seeded = true;
      loading = false;
      return Promise.resolve();
    }
    return seedFromFile().then((c) => {
      if (c) { collection = c; seeded = true; persist(); }
      loading = false;
    });
  })();

  // Para que main.js (mapa y gráficas) lea los datos del CRUD en vez del archivo.
  if (realFetch) {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      if (DATA_URL_RE.test(url)) {
        return ready.then(() => {
          if (seeded) {
            return new Response(JSON.stringify(exportCollection()), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return realFetch(input, init);
        });
      }
      return realFetch(input, init);
    };
  }

  window.ElectraChargers = { storageKey: STORAGE_KEY, getAll: exportCollection };

  /* ------------------------------------------------------------ utilidades */

  const find = (id) => collection.features.find((f) => f.id === id);
  const colorFor = (red) => RED_COLORS[red] || FALLBACK_COLOR;
  const plural = (n) => (n === 1 ? '1 puerto' : n + ' puertos');
  const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const round6 = (n) => String(Number(n.toFixed(6)));

  function parseCoord(s) {
    const t = String(s).trim().replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
  }

  function filtered() {
    const q = norm(state.q.trim());
    return collection.features
      .filter((f) => (!state.red || f.properties.red === state.red) && (!q || norm(f.properties.nombre).includes(q)))
      .sort((a, b) => a.properties.nombre.localeCompare(b.properties.nombre, 'es'));
  }

  /* ------------------------------------------------------------------- UI */

  const panel = $('crud-panel');
  if (!panel) return; // el HTML del panel no está en la página

  const form = $('crud-form');
  const F = {
    nombre: $('crud-nombre'),
    red: $('crud-red'),
    puertos: $('crud-puertos'),
    lat: $('crud-lat'),
    lng: $('crud-lng')
  };
  const toggleBtn = $('crud-toggle');
  const pickBtn = $('crud-pick');
  const isOpen = () => panel.classList.contains('is-open');

  function toast(msg, opts = {}) {
    const t = $('crud-toast');
    t.replaceChildren();
    t.classList.toggle('is-error', !!opts.error);
    const s = document.createElement('span');
    s.textContent = msg;
    t.append(s);
    if (opts.action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opts.action;
      b.addEventListener('click', () => { hideToast(); opts.onAction(); });
      t.append(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts.ms || 4500);
  }

  function hideToast() {
    $('crud-toast').hidden = true;
  }

  function markDirty() {
    $('crud-note').hidden = false;
  }

  function renderRedOptions() {
    const redes = Array.from(new Set(DEFAULT_REDES.concat(collection.features.map((f) => f.properties.red)))).sort();
    const list = $('crud-redes');
    list.replaceChildren();
    redes.forEach((r) => { const o = document.createElement('option'); o.value = r; list.append(o); });

    const sel = $('crud-filter-red');
    const current = state.red;
    sel.replaceChildren();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'Todas las redes';
    sel.append(all);
    redes.forEach((r) => { const o = document.createElement('option'); o.value = r; o.textContent = r; sel.append(o); });
    sel.value = redes.includes(current) ? current : '';
    state.red = sel.value;
  }

  function itemEl(f) {
    const li = document.createElement('li');
    li.className = 'crud-item';
    li.dataset.id = f.id;

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'crud-item-main';
    main.dataset.act = 'locate';
    main.title = 'Ver en el mapa';
    const dot = document.createElement('span');
    dot.className = 'crud-dot';
    dot.style.background = colorFor(f.properties.red);
    const txt = document.createElement('span');
    txt.className = 'crud-item-text';
    const name = document.createElement('span');
    name.className = 'crud-item-name';
    name.textContent = f.properties.nombre;
    const meta = document.createElement('span');
    meta.className = 'crud-item-meta';
    meta.textContent = f.properties.red + ', ' + plural(f.properties.n_puertos);
    txt.append(name, meta);
    main.append(dot, txt);

    const edit = iconBtn('edit', 'fa-pen', 'Editar ' + f.properties.nombre);
    const del = iconBtn('delete', 'fa-trash', 'Eliminar ' + f.properties.nombre);
    li.append(main, edit, del);
    return li;
  }

  function iconBtn(act, icon, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'crud-icon-btn' + (act === 'delete' ? ' is-danger' : '');
    b.dataset.act = act;
    b.setAttribute('aria-label', label);
    b.title = label;
    const i = document.createElement('i');
    i.className = 'fa-solid ' + icon;
    i.setAttribute('aria-hidden', 'true');
    b.append(i);
    return b;
  }

  function renderList(items) {
    const ul = $('crud-list');
    ul.replaceChildren();
    const total = collection.features.length;

    if (loading || !items.length) {
      const li = document.createElement('li');
      li.className = 'crud-empty';
      li.textContent = loading
        ? 'Cargando datos...'
        : total
          ? 'Ningún registro coincide con la búsqueda.'
          : 'Aún no hay electrolineras. Agrega la primera con el formulario.';
      ul.append(li);
    } else {
      items.slice(0, state.shown).forEach((f) => ul.append(itemEl(f)));
    }

    const more = $('crud-more');
    const remaining = items.length - state.shown;
    more.hidden = remaining <= 0;
    more.textContent = 'Ver ' + Math.min(remaining, PAGE_SIZE) + ' más (' + remaining + ' restantes)';

    $('crud-count').textContent = loading
      ? ''
      : items.length === total ? total + ' registros' : items.length + ' de ' + total + ' registros';
  }

  function render() {
    renderRedOptions();
    const items = filtered();
    renderList(items);
    renderDots(items);
  }

  /* ------------------------------------------------------------- formulario */

  function updateFormMode() {
    const editing = !!state.editingId;
    $('crud-form-title').textContent = editing ? 'Editar electrolinera' : 'Agregar electrolinera';
    $('crud-save').textContent = editing ? 'Guardar cambios' : 'Agregar';
    $('crud-cancel').textContent = editing ? 'Cancelar edición' : 'Limpiar';
  }

  function clearErrors() {
    Object.keys(F).forEach((k) => {
      F[k].removeAttribute('aria-invalid');
      $('crud-err-' + k).textContent = '';
    });
  }

  function showErrors(errs) {
    clearErrors();
    Object.keys(errs).forEach((k) => {
      F[k].setAttribute('aria-invalid', 'true');
      $('crud-err-' + k).textContent = errs[k];
    });
  }

  function readForm() {
    const errs = {};
    const nombre = F.nombre.value.trim();
    if (!nombre) errs.nombre = 'Escribe el nombre de la electrolinera.';
    else if (nombre.length > 120) errs.nombre = 'Usa 120 caracteres o menos.';

    const red = F.red.value.trim();
    if (!red) errs.red = 'Indica la red, por ejemplo Tesla.';
    else if (red.length > 40) errs.red = 'Usa 40 caracteres o menos.';

    const ptxt = F.puertos.value.trim();
    const puertos = Number(ptxt);
    if (!/^\d+$/.test(ptxt) || puertos < 1 || puertos > 200) errs.puertos = 'Usa un número entero de 1 a 200.';

    const lat = parseCoord(F.lat.value);
    if (lat == null || lat < -90 || lat > 90) errs.lat = 'Latitud entre -90 y 90.';
    const lng = parseCoord(F.lng.value);
    if (lng == null || lng < -180 || lng > 180) errs.lng = 'Longitud entre -180 y 180.';

    return { errs, values: { nombre, red, n_puertos: puertos, lat, lng } };
  }

  function resetForm() {
    state.editingId = null;
    F.nombre.value = '';
    F.red.value = '';
    F.puertos.value = '1';
    F.lat.value = '';
    F.lng.value = '';
    clearErrors();
    setPicking(false);
    updateFormMode();
    syncDraft();
  }

  function startEdit(id) {
    const f = find(id);
    if (!f) return;
    openPanel();
    state.editingId = id;
    F.nombre.value = f.properties.nombre;
    F.red.value = f.properties.red;
    F.puertos.value = String(f.properties.n_puertos);
    F.lng.value = round6(f.geometry.coordinates[0]);
    F.lat.value = round6(f.geometry.coordinates[1]);
    clearErrors();
    setPicking(false);
    updateFormMode();
    syncDraft();
    if (map) map.setView([f.geometry.coordinates[1], f.geometry.coordinates[0]], Math.max(map.getZoom(), 16));
    $('crud-body').scrollTop = 0;
    F.nombre.focus({ preventScroll: true });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (loading) { toast('Espera a que terminen de cargar los datos.'); return; }
    const { errs, values } = readForm();
    showErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) { F[first].focus(); return; }

    const coords = [values.lng, values.lat];
    let saved;
    if (state.editingId) {
      saved = find(state.editingId);
      saved.properties = Object.assign({}, saved.properties, {
        nombre: values.nombre, red: values.red, n_puertos: values.n_puertos
      });
      saved.geometry = { type: 'Point', coordinates: coords };
    } else {
      saved = {
        type: 'Feature',
        id: newId(),
        properties: { nombre: values.nombre, red: values.red, n_puertos: values.n_puertos },
        geometry: { type: 'Point', coordinates: coords }
      };
      collection.features.push(saved);
    }
    const wasEditing = !!state.editingId;
    if (persist()) toast(wasEditing ? 'Cambios guardados.' : 'Electrolinera agregada.');
    markDirty();
    seeded = true;
    resetForm();
    render();
    focusFeature(saved);
  }

  function removeFeature(id) {
    const i = collection.features.findIndex((f) => f.id === id);
    if (i < 0) return;
    const [f] = collection.features.splice(i, 1);
    if (state.editingId === id) resetForm();
    persist();
    markDirty();
    render();
    if (map) map.closePopup();
    toast('Eliminada: ' + f.properties.nombre, {
      action: 'Deshacer',
      ms: 8000,
      onAction: () => {
        collection.features.splice(Math.min(i, collection.features.length), 0, f);
        persist();
        render();
        toast('Eliminación deshecha.');
      }
    });
  }

  /* ------------------------------------------------------------------ mapa */

  function popupFor(f) {
    const box = document.createElement('div');
    box.className = 'crud-popup';
    const t = document.createElement('strong');
    t.textContent = f.properties.nombre;
    const m = document.createElement('div');
    m.textContent = f.properties.red + ', ' + plural(f.properties.n_puertos);
    const row = document.createElement('div');
    row.className = 'crud-popup-actions';
    const e = document.createElement('button');
    e.type = 'button';
    e.textContent = 'Editar';
    e.addEventListener('click', () => startEdit(f.id));
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'is-danger';
    d.textContent = 'Eliminar';
    d.addEventListener('click', () => removeFeature(f.id));
    row.append(e, d);
    box.append(t, m, row);
    return box;
  }

  function renderDots(items) {
    if (!map || !dotsLayer) return;
    dotsLayer.clearLayers();
    dots.clear();
    if (!isOpen() || !state.showDots) {
      if (map.hasLayer(dotsLayer)) map.removeLayer(dotsLayer);
      return;
    }
    (items || filtered()).forEach((f) => {
      const [lng, lat] = f.geometry.coordinates;
      const m = L.circleMarker([lat, lng], {
        pane: 'crud', radius: 7, weight: 2, color: '#ffffff',
        fillColor: colorFor(f.properties.red), fillOpacity: 0.95
      });
      m.bindPopup(() => popupFor(f));
      m.bindTooltip(f.properties.nombre, { direction: 'top', offset: [0, -6] });
      dotsLayer.addLayer(m);
      dots.set(f.id, m);
    });
    if (!map.hasLayer(dotsLayer)) dotsLayer.addTo(map);
  }

  function focusFeature(f) {
    if (!map) return;
    const [lng, lat] = f.geometry.coordinates;
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
    const m = dots.get(f.id);
    if (m && isOpen()) m.openPopup();
  }

  function removeDraft() {
    if (draft) { draft.remove(); draft = null; }
  }

  // Marcador arrastrable que representa la ubicación escrita en el formulario.
  function syncDraft() {
    if (!map || !isOpen()) { removeDraft(); return; }
    const lat = parseCoord(F.lat.value);
    const lng = parseCoord(F.lng.value);
    if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) { removeDraft(); return; }
    if (!draft) {
      draft = L.marker([lat, lng], {
        draggable: true,
        keyboard: false,
        zIndexOffset: 1000,
        title: 'Arrastra para ajustar la ubicación',
        icon: L.divIcon({ className: 'crud-pin', iconSize: [22, 22], iconAnchor: [11, 11], html: '<span></span>' })
      });
      draft.on('dragend', () => {
        const p = draft.getLatLng();
        F.lat.value = round6(p.lat);
        F.lng.value = round6(p.lng);
        ['lat', 'lng'].forEach((k) => { F[k].removeAttribute('aria-invalid'); $('crud-err-' + k).textContent = ''; });
      });
      draft.addTo(map);
    } else {
      draft.setLatLng([lat, lng]);
    }
  }

  function setPicking(on) {
    state.picking = on;
    pickBtn.setAttribute('aria-pressed', String(on));
    pickBtn.querySelector('span').textContent = on ? 'Haz clic en el mapa...' : 'Elegir en el mapa';
    document.body.classList.toggle('crud-picking', on);
    if (map) map.getContainer().classList.toggle('crud-picking-cursor', on);
  }

  function onMapClick(e) {
    if (!state.picking) return;
    F.lat.value = round6(e.latlng.lat);
    F.lng.value = round6(e.latlng.lng);
    ['lat', 'lng'].forEach((k) => { F[k].removeAttribute('aria-invalid'); $('crud-err-' + k).textContent = ''; });
    setPicking(false);
    syncDraft();
    (F.nombre.value.trim() ? $('crud-save') : F.nombre).focus({ preventScroll: true });
  }

  function setupMap() {
    map.createPane('crud').style.zIndex = 640;
    dotsLayer = L.layerGroup();
    map.on('click', onMapClick);
    renderDots();
    syncDraft();
  }

  // Captura la instancia del mapa que cree main.js.
  if (window.L && L.Map && L.Map.addInitHook) {
    L.Map.addInitHook(function () {
      if (map) return;
      map = this;
      setupMap();
    });
  }

  /* ----------------------------------------------------------------- panel */

  function openPanel() {
    panel.classList.add('is-open');
    document.body.classList.add('crud-open');
    toggleBtn.setAttribute('aria-expanded', 'true');
    renderDots();
    syncDraft();
  }

  function closePanel() {
    setPicking(false);
    panel.classList.remove('is-open');
    document.body.classList.remove('crud-open');
    toggleBtn.setAttribute('aria-expanded', 'false');
    renderDots();
    syncDraft();
  }

  function togglePanel() {
    if (isOpen()) closePanel();
    else {
      openPanel();
      F.nombre.focus({ preventScroll: true });
    }
  }

  /* ---------------------------------------------- importar / exportar / reset */

  function download() {
    const blob = new Blob([JSON.stringify(exportCollection(), null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'all_chargers_geo.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importFile(file) {
    if (!file) return;
    file.text().then((text) => {
      let res = null;
      try { res = sanitizeCollection(JSON.parse(text)); } catch (e) { res = null; }
      if (!res || !res.collection.features.length) {
        toast('El archivo no es un GeoJSON válido con puntos y nombre.', { error: true });
        return;
      }
      const extra = res.skipped ? ' (' + res.skipped + ' se omiten por datos inválidos)' : '';
      const msg = 'Se reemplazarán los ' + collection.features.length + ' registros actuales por ' +
        res.collection.features.length + ' del archivo' + extra + '. ¿Continuar?';
      if (!window.confirm(msg)) return;
      collection = res.collection;
      seeded = true;
      resetForm();
      state.shown = PAGE_SIZE;
      if (persist()) toast('Importados ' + collection.features.length + ' registros.');
      markDirty();
      render();
    }).catch(() => toast('No se pudo leer el archivo.', { error: true }));
  }

  function restore() {
    if (!window.confirm('Se descartarán todos los cambios y se restaurarán los datos del archivo original. ¿Continuar?')) return;
    seedFromFile().then((c) => {
      if (!c) {
        toast('No encontré all_chargers_geo.json junto al index.html. Usa Importar.', { error: true });
        return;
      }
      collection = c;
      seeded = true;
      resetForm();
      state.shown = PAGE_SIZE;
      persist();
      markDirty();
      render();
      toast('Datos originales restaurados.');
    });
  }

  /* ---------------------------------------------------------------- eventos */

  form.addEventListener('submit', onSubmit);
  $('crud-cancel').addEventListener('click', resetForm);
  pickBtn.addEventListener('click', () => setPicking(!state.picking));
  ['lat', 'lng'].forEach((k) => F[k].addEventListener('input', syncDraft));

  $('crud-search').addEventListener('input', (e) => {
    state.q = e.target.value;
    state.shown = PAGE_SIZE;
    const items = filtered();
    renderList(items);
    renderDots(items);
  });
  $('crud-filter-red').addEventListener('change', (e) => {
    state.red = e.target.value;
    state.shown = PAGE_SIZE;
    const items = filtered();
    renderList(items);
    renderDots(items);
  });
  $('crud-show-dots').addEventListener('change', (e) => {
    state.showDots = e.target.checked;
    renderDots();
  });
  $('crud-more').addEventListener('click', () => {
    state.shown += PAGE_SIZE;
    renderList(filtered());
  });

  $('crud-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.crud-item').dataset.id;
    const f = find(id);
    if (!f) return;
    if (btn.dataset.act === 'edit') startEdit(id);
    else if (btn.dataset.act === 'delete') removeFeature(id);
    else if (btn.dataset.act === 'locate') {
      if (window.matchMedia('(max-width: 560px)').matches) {
        closePanel();
        if (map) map.setView([f.geometry.coordinates[1], f.geometry.coordinates[0]], Math.max(map.getZoom(), 16));
      } else {
        focusFeature(f);
      }
    }
  });

  $('crud-export').addEventListener('click', download);
  $('crud-import').addEventListener('click', () => $('crud-import-file').click());
  $('crud-import-file').addEventListener('change', (e) => {
    importFile(e.target.files[0]);
    e.target.value = '';
  });
  $('crud-restore').addEventListener('click', restore);
  $('crud-reload').addEventListener('click', () => window.location.reload());

  toggleBtn.addEventListener('click', togglePanel);
  $('crud-close').addEventListener('click', closePanel);
  const navLink = $('nav-crud');
  if (navLink) navLink.addEventListener('click', (e) => { e.preventDefault(); togglePanel(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (state.picking) { setPicking(false); return; }
    if (isOpen() && panel.contains(document.activeElement)) { closePanel(); toggleBtn.focus(); }
  });

  /* ----------------------------------------------------------------- inicio */

  updateFormMode();
  render();
  ready.then(() => {
    render();
    if (!seeded) {
      toast('No encontré all_chargers_geo.json junto al index.html. Usa Importar para cargar tus datos.', { error: true, ms: 9000 });
    }
  });
})();