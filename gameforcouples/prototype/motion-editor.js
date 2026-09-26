(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    image: null,
    imageBlob: null,
    objectUrl: null,
    imageName: "",
    frames: [],
    selectedId: null,
    zoom: 1,
    fps: 8,
    playing: false,
    playIndex: 0,
    playbackTimer: null,
    drag: null,
    dirty: false
  };

  const els = {
    upload: $("sheet-file"), projectInput: $("project-file"), openProject: $("open-project"),
    exportProject: $("export-project"), save: $("save-local"), saveState: $("save-state"),
    viewport: $("sheet-viewport"), empty: $("empty-state"), surface: $("sheet-surface"),
    image: $("sheet-image"), overlay: $("frame-overlay"), meta: $("sheet-meta"),
    zoomReadout: $("zoom-readout"), zoomOut: $("zoom-out"), zoomIn: $("zoom-in"), zoomFit: $("zoom-fit"),
    frameList: $("frame-list"), frameCount: $("frame-count"), fps: $("fps"), fpsValue: $("fps-value"),
    previous: $("previous-frame"), next: $("next-frame"), play: $("play-animation"),
    selectedNumber: $("selected-number"), selectedSize: $("selected-size"), noSelection: $("no-selection"),
    fields: $("frame-fields"), name: $("frame-name"), x: $("frame-x"), y: $("frame-y"), w: $("frame-w"), h: $("frame-h"),
    dimensionReadout: $("dimension-readout"), moveUp: $("move-up"), moveDown: $("move-down"), deleteFrame: $("delete-frame"),
    preview: $("preview-canvas"), previewNote: $("preview-note"), previewIndicator: $("preview-indicator"), toast: $("toast")
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const activeFrame = () => state.frames.find((frame) => frame.id === state.selectedId) || null;
  const indexOfFrame = (id) => state.frames.findIndex((frame) => frame.id === id);
  const frameNumber = (index) => String(index + 1).padStart(2, "0");
  const makeId = () => window.crypto?.randomUUID?.() || `frame-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove("visible"), 2300);
  }

  function setSaveState(message, saved = false) {
    els.saveState.textContent = message;
    els.saveState.classList.toggle("saved", saved);
  }

  function markDirty(message = "Unsaved edits") {
    state.dirty = true;
    setSaveState(message, false);
    els.save.disabled = !state.image;
  }

  function toggleReady(ready) {
    [els.save, els.exportProject, els.zoomOut, els.zoomIn, els.zoomFit, els.previous, els.next, els.play].forEach((button) => {
      button.disabled = !ready;
    });
  }

  function setZoom(nextZoom) {
    if (!state.image) return;
    state.zoom = clamp(nextZoom, 0.05, 4);
    const width = Math.max(1, Math.round(state.image.naturalWidth * state.zoom));
    const height = Math.max(1, Math.round(state.image.naturalHeight * state.zoom));
    els.surface.style.width = `${width}px`;
    els.surface.style.height = `${height}px`;
    els.image.style.width = `${width}px`;
    els.image.style.height = `${height}px`;
    els.overlay.setAttribute("width", String(width));
    els.overlay.setAttribute("height", String(height));
    els.overlay.setAttribute("viewBox", `0 0 ${state.image.naturalWidth} ${state.image.naturalHeight}`);
    els.zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`;
    renderFrameBoxes();
  }

  function fitZoom() {
    if (!state.image) return;
    const availableWidth = Math.max(150, els.viewport.clientWidth - 42);
    const availableHeight = Math.max(140, els.viewport.clientHeight - 38);
    setZoom(Math.min(1, availableWidth / state.image.naturalWidth, availableHeight / state.image.naturalHeight));
  }

  function addSvg(tag, attrs, parent) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (parent) parent.append(node);
    return node;
  }

  function renderFrameBoxes() {
    if (!state.image) return;
    const imageWidth = state.image.naturalWidth;
    const imageHeight = state.image.naturalHeight;
    const scale = Math.max(state.zoom, 0.01);
    const handle = 11 / scale;
    const badgeHeight = 21 / scale;
    els.overlay.replaceChildren();
    state.frames.forEach((frame, index) => {
      const group = addSvg("g", { "data-frame-id": frame.id }, els.overlay);
      addSvg("rect", {
        x: frame.x, y: frame.y, width: frame.w, height: frame.h,
        class: `frame-outline${frame.id === state.selectedId ? " selected" : ""}`,
        "data-action": "move", "data-frame-id": frame.id
      }, group);

      const badge = `#${frameNumber(index)} · ${frame.w}×${frame.h}px`;
      const badgeWidth = (badge.length * 6.5 + 15) / scale;
      const badgeX = clamp(frame.x, 0, Math.max(0, imageWidth - badgeWidth));
      const badgeY = frame.y >= badgeHeight + 3 / scale ? frame.y - badgeHeight - 2 / scale : frame.y + 2 / scale;
      const badgeGroup = addSvg("g", { "pointer-events": "none" }, group);
      addSvg("rect", { x: badgeX, y: badgeY, width: badgeWidth, height: badgeHeight, rx: 4 / scale, class: "frame-badge" }, badgeGroup);
      const text = addSvg("text", {
        x: badgeX + 7 / scale, y: badgeY + badgeHeight / 2,
        "font-size": 11 / scale, class: "frame-badge-text"
      }, badgeGroup);
      text.textContent = badge;

      const corners = [
        ["nw", frame.x, frame.y], ["ne", frame.x + frame.w, frame.y],
        ["sw", frame.x, frame.y + frame.h], ["se", frame.x + frame.w, frame.y + frame.h]
      ];
      corners.forEach(([corner, x, y]) => addSvg("rect", {
        x: Number(x) - handle / 2, y: Number(y) - handle / 2, width: handle, height: handle,
        rx: 2 / scale, class: "frame-handle", "data-action": "resize", "data-corner": corner, "data-frame-id": frame.id
      }, group));
    });
  }

  function updateInspector() {
    const frame = activeFrame();
    const index = frame ? indexOfFrame(frame.id) : -1;
    const selected = Boolean(frame);
    els.noSelection.hidden = selected;
    els.fields.hidden = !selected;
    els.selectedNumber.textContent = selected ? `#${frameNumber(index)}` : "—";
    els.selectedSize.textContent = selected ? `${frame.w} × ${frame.h} px` : "No crop selected";
    if (selected) {
      els.name.value = frame.name;
      els.x.value = frame.x;
      els.y.value = frame.y;
      els.w.value = frame.w;
      els.h.value = frame.h;
      els.dimensionReadout.textContent = `${frame.w} × ${frame.h} px  ·  x ${frame.x}, y ${frame.y}`;
      els.moveUp.disabled = index <= 0;
      els.moveDown.disabled = index >= state.frames.length - 1;
      els.deleteFrame.disabled = false;
    } else {
      els.moveUp.disabled = true;
      els.moveDown.disabled = true;
      els.deleteFrame.disabled = true;
    }
  }

  function renderFrameList() {
    els.frameList.replaceChildren();
    els.frameCount.textContent = String(state.frames.length);
    if (!state.frames.length) {
      const empty = document.createElement("span");
      empty.className = "sequence-empty";
      empty.textContent = "Your boxes will appear here in playback order.";
      els.frameList.append(empty);
    }
    state.frames.forEach((frame, index) => {
      const item = document.createElement("div");
      item.className = `frame-item${frame.id === state.selectedId ? " active" : ""}`;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", `Select frame ${index + 1}, ${frame.name}, ${frame.w} by ${frame.h} pixels`);
      item.addEventListener("click", (event) => {
        const move = event.target.closest("[data-reorder]");
        if (move) {
          event.stopPropagation();
          reorderFrame(frame.id, Number(move.dataset.reorder));
          return;
        }
        selectFrame(frame.id);
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectFrame(frame.id); }
      });
      const top = document.createElement("div"); top.className = "frame-item-top";
      const number = document.createElement("span"); number.className = "frame-order"; number.textContent = `#${frameNumber(index)}`;
      const name = document.createElement("span"); name.className = "frame-name-mini"; name.textContent = frame.name;
      top.append(number, name);
      const dims = document.createElement("span"); dims.className = "frame-dims"; dims.textContent = `${frame.w} × ${frame.h} px  ·  ${frame.x}, ${frame.y}`;
      const controls = document.createElement("div"); controls.className = "frame-item-controls";
      const earlier = document.createElement("button"); earlier.type = "button"; earlier.textContent = "↑"; earlier.title = "Move earlier"; earlier.dataset.reorder = "-1"; earlier.disabled = index === 0;
      const later = document.createElement("button"); later.type = "button"; later.textContent = "↓"; later.title = "Move later"; later.dataset.reorder = "1"; later.disabled = index === state.frames.length - 1;
      controls.append(earlier, later); item.append(top, dims, controls); els.frameList.append(item);
    });
    const ready = Boolean(state.image);
    [els.previous, els.next, els.play].forEach((button) => { button.disabled = !ready || state.frames.length === 0; });
  }

  function renderAll() {
    renderFrameBoxes();
    renderFrameList();
    updateInspector();
    renderPreview();
  }

  function selectFrame(id) {
    state.selectedId = id;
    if (!state.playing) state.playIndex = Math.max(0, indexOfFrame(id));
    renderAll();
  }

  function renderPreview() {
    const canvas = els.preview;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.image || !state.frames.length) {
      context.fillStyle = "#879087";
      context.font = "13px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText("Frame preview", canvas.width / 2, canvas.height / 2);
      els.previewNote.textContent = state.image ? "Draw a box to add the first pose." : "Load a sheet and mark frames to preview the animation.";
      return;
    }
    const frame = state.frames[clamp(state.playIndex, 0, state.frames.length - 1)];
    const maxWidth = Math.max(...state.frames.map((item) => item.w));
    const maxHeight = Math.max(...state.frames.map((item) => item.h));
    const scale = Math.min(1, 265 / maxWidth, 195 / maxHeight);
    const drawWidth = frame.w * scale;
    const drawHeight = frame.h * scale;
    const dx = (canvas.width - drawWidth) / 2;
    const dy = canvas.height - 23 - drawHeight;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(state.image, frame.x, frame.y, frame.w, frame.h, dx, dy, drawWidth, drawHeight);
    const index = indexOfFrame(frame.id);
    els.previewNote.textContent = `#${frameNumber(index)} · ${frame.name} · ${frame.w} × ${frame.h} px`;
  }

  function stopPlayback() {
    state.playing = false;
    clearInterval(state.playbackTimer);
    state.playbackTimer = null;
    els.play.textContent = "▶ Preview";
    els.previewIndicator.textContent = "Idle";
    els.previewIndicator.classList.remove("playing");
    const selectedIndex = indexOfFrame(state.selectedId);
    if (selectedIndex >= 0) state.playIndex = selectedIndex;
    renderPreview();
  }

  function startPlayback() {
    if (!state.frames.length) return;
    state.playing = true;
    const selectedIndex = indexOfFrame(state.selectedId);
    if (selectedIndex >= 0) state.playIndex = selectedIndex;
    els.play.textContent = "Ⅱ Pause";
    els.previewIndicator.textContent = "Playing";
    els.previewIndicator.classList.add("playing");
    renderPreview();
    clearInterval(state.playbackTimer);
    state.playbackTimer = setInterval(() => {
      state.playIndex = (state.playIndex + 1) % state.frames.length;
      renderPreview();
    }, 1000 / state.fps);
  }

  async function loadImageBlob(blob, name, savedFrames = null, savedFps = null) {
    if (!blob || !blob.type?.startsWith("image/")) throw new Error("Choose a PNG, WebP, JPEG, or other browser-supported image.");
    stopPlayback();
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.imageBlob = blob;
    state.imageName = name || "sprite-sheet";
    state.objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The selected image could not be opened."));
      image.src = state.objectUrl;
    });
    state.image = image;
    els.image.src = state.objectUrl;
    state.frames = Array.isArray(savedFrames) ? savedFrames.map((frame) => ({
      id: frame.id || makeId(), name: String(frame.name || "Frame"),
      x: clamp(Math.round(Number(frame.x) || 0), 0, image.naturalWidth - 1),
      y: clamp(Math.round(Number(frame.y) || 0), 0, image.naturalHeight - 1),
      w: clamp(Math.round(Number(frame.w) || 1), 1, image.naturalWidth),
      h: clamp(Math.round(Number(frame.h) || 1), 1, image.naturalHeight)
    })).map((frame) => ({ ...frame, w: Math.min(frame.w, image.naturalWidth - frame.x), h: Math.min(frame.h, image.naturalHeight - frame.y) })) : [];
    state.fps = clamp(Number(savedFps) || 8, 1, 24);
    state.selectedId = state.frames[0]?.id || null;
    els.fps.value = String(state.fps);
    els.fpsValue.textContent = `${state.fps} fps`;
    els.meta.textContent = `${state.imageName} · ${image.naturalWidth} × ${image.naturalHeight} px`;
    els.empty.hidden = true;
    els.surface.hidden = false;
    toggleReady(true);
    state.dirty = savedFrames === null;
    setSaveState(state.dirty ? "Unsaved sheet" : "Saved on this device", !state.dirty);
    els.save.disabled = false;
    els.exportProject.disabled = false;
    renderAll();
    requestAnimationFrame(fitZoom);
  }

  async function openDatabase() {
    if (!("indexedDB" in window)) throw new Error("Local browser storage is unavailable.");
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("roomscape-motion-editor", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("projects")) request.result.createObjectStore("projects", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open local storage."));
      request.onblocked = () => reject(new Error("Local storage is blocked by another editor tab."));
    });
  }

  async function putProject(record) {
    const db = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("projects", "readwrite");
        transaction.objectStore("projects").put(record);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Save failed."));
        transaction.onabort = () => reject(transaction.error || new Error("Save was canceled."));
      });
    } finally { db.close(); }
  }

  async function getProject() {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction("projects", "readonly");
        const request = transaction.objectStore("projects").get("current");
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("Could not read saved project."));
      });
    } finally { db.close(); }
  }

  async function saveLocally() {
    if (!state.imageBlob || !state.image) return;
    const record = {
      id: "current", imageBlob: state.imageBlob, imageName: state.imageName,
      width: state.image.naturalWidth, height: state.image.naturalHeight,
      frames: state.frames, fps: state.fps, updatedAt: new Date().toISOString()
    };
    try {
      await putProject(record);
      state.dirty = false;
      setSaveState("Saved on this device", true);
      toast("Sheet and frame sequence saved in this browser.");
    } catch (error) {
      setSaveState("Browser save unavailable", false);
      await exportProject(true);
      toast("Browser storage unavailable; downloaded a project backup instead.");
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not read image data."));
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [header, data] = String(dataUrl).split(",");
    const mime = header.match(/data:([^;]+)/)?.[1] || "image/png";
    const bytes = atob(data);
    const array = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
    return new Blob([array], { type: mime });
  }

  async function exportProject(isFallback = false) {
    if (!state.imageBlob) return;
    try {
      const project = {
        format: "roomscape-sprite-project", version: 1, imageName: state.imageName,
        imageDataUrl: await blobToDataUrl(state.imageBlob), frames: state.frames, fps: state.fps
      };
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${state.imageName.replace(/\.[^.]+$/, "") || "sprite-sheet"}-project.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (!isFallback) toast("Portable project file downloaded.");
    } catch (error) { toast(error.message || "Could not export the project."); }
  }

  async function importProjectFile(file) {
    const project = JSON.parse(await file.text());
    if (project.format !== "roomscape-sprite-project" || !project.imageDataUrl) throw new Error("That file is not a Roomscape sprite project.");
    const blob = dataUrlToBlob(project.imageDataUrl);
    await loadImageBlob(blob, project.imageName || "sprite-sheet", project.frames || [], project.fps || 8);
    markDirty("Imported project · save locally");
    toast("Project opened. Save locally to keep it on this device.");
  }

  function svgPoint(event) {
    const matrix = els.overlay.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: clamp(point.x, 0, state.image.naturalWidth), y: clamp(point.y, 0, state.image.naturalHeight) };
  }

  function selectFrameById(id) {
    if (!state.frames.some((frame) => frame.id === id)) return;
    selectFrame(id);
  }

  function startBoxDrag(event, mode, frame, corner = null) {
    const point = svgPoint(event);
    state.drag = {
      mode, pointerId: event.pointerId, frameId: frame?.id || null, corner,
      start: point, origin: frame ? { x: frame.x, y: frame.y, w: frame.w, h: frame.h } : null,
      current: point, ghost: null
    };
    els.overlay.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  els.overlay.addEventListener("pointerdown", (event) => {
    if (!state.image || event.button !== 0) return;
    const actionNode = event.target.closest?.("[data-action]");
    if (actionNode) {
      const frameId = actionNode.getAttribute("data-frame-id");
      const frame = state.frames.find((item) => item.id === frameId);
      if (!frame) return;
      selectFrameById(frameId);
      startBoxDrag(event, actionNode.getAttribute("data-action"), frame, actionNode.getAttribute("data-corner"));
      return;
    }
    startBoxDrag(event, "draw", null);
    const ghost = addSvg("rect", { class: "draft-outline", x: state.drag.start.x, y: state.drag.start.y, width: 0, height: 0 }, els.overlay);
    state.drag.ghost = ghost;
  });

  els.overlay.addEventListener("pointermove", (event) => {
    const drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = svgPoint(event);
    drag.current = point;
    if (drag.mode === "draw") {
      const x = Math.min(drag.start.x, point.x); const y = Math.min(drag.start.y, point.y);
      drag.ghost.setAttribute("x", String(x)); drag.ghost.setAttribute("y", String(y));
      drag.ghost.setAttribute("width", String(Math.abs(point.x - drag.start.x)));
      drag.ghost.setAttribute("height", String(Math.abs(point.y - drag.start.y)));
      return;
    }
    const frame = state.frames.find((item) => item.id === drag.frameId);
    if (!frame) return;
    if (drag.mode === "move") {
      frame.x = Math.round(clamp(drag.origin.x + point.x - drag.start.x, 0, state.image.naturalWidth - drag.origin.w));
      frame.y = Math.round(clamp(drag.origin.y + point.y - drag.start.y, 0, state.image.naturalHeight - drag.origin.h));
    } else {
      const original = drag.origin; const west = drag.corner.includes("w"); const north = drag.corner.includes("n");
      let left = original.x; let top = original.y; let right = original.x + original.w; let bottom = original.y + original.h;
      if (west) left = clamp(point.x, 0, right - 1); else right = clamp(point.x, left + 1, state.image.naturalWidth);
      if (north) top = clamp(point.y, 0, bottom - 1); else bottom = clamp(point.y, top + 1, state.image.naturalHeight);
      frame.x = Math.round(left); frame.y = Math.round(top);
      frame.w = Math.max(1, Math.round(right - left)); frame.h = Math.max(1, Math.round(bottom - top));
    }
    renderFrameBoxes(); updateInspector(); renderFrameList();
  });

  function endPointer(event) {
    const drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    state.drag = null;
    if (drag.mode === "draw") {
      drag.ghost?.remove();
      const left = Math.round(Math.min(drag.start.x, drag.current.x));
      const top = Math.round(Math.min(drag.start.y, drag.current.y));
      const width = Math.round(Math.abs(drag.current.x - drag.start.x));
      const height = Math.round(Math.abs(drag.current.y - drag.start.y));
      if (width >= 3 && height >= 3) {
        const number = state.frames.length + 1;
        const frame = { id: makeId(), name: `Frame ${frameNumber(number - 1)}`, x: left, y: top, w: width, h: height };
        state.frames.push(frame);
        state.selectedId = frame.id;
        markDirty();
      }
    } else {
      markDirty();
    }
    renderAll();
  }
  els.overlay.addEventListener("pointerup", endPointer);
  els.overlay.addEventListener("pointercancel", endPointer);

  function setNumericField(field, rawValue) {
    const frame = activeFrame();
    if (!frame || !state.image) return;
    const value = Math.round(Number(rawValue));
    if (!Number.isFinite(value)) return;
    if (field === "x") frame.x = clamp(value, 0, state.image.naturalWidth - frame.w);
    if (field === "y") frame.y = clamp(value, 0, state.image.naturalHeight - frame.h);
    if (field === "w") frame.w = clamp(value, 1, state.image.naturalWidth - frame.x);
    if (field === "h") frame.h = clamp(value, 1, state.image.naturalHeight - frame.y);
    renderFrameBoxes(); updateInspector(); renderFrameList(); renderPreview(); markDirty();
  }

  [ [els.x, "x"], [els.y, "y"], [els.w, "w"], [els.h, "h"] ].forEach(([input, field]) => input.addEventListener("change", () => setNumericField(field, input.value)));
  els.name.addEventListener("input", () => {
    const frame = activeFrame(); if (!frame) return;
    frame.name = els.name.value.trim() || `Frame ${frameNumber(indexOfFrame(frame.id))}`;
    renderFrameList(); markDirty();
  });

  function reorderFrame(id, delta) {
    const index = indexOfFrame(id); const next = index + delta;
    if (index < 0 || next < 0 || next >= state.frames.length) return;
    [state.frames[index], state.frames[next]] = [state.frames[next], state.frames[index]];
    markDirty(); renderAll();
  }
  els.moveUp.addEventListener("click", () => { if (state.selectedId) reorderFrame(state.selectedId, -1); });
  els.moveDown.addEventListener("click", () => { if (state.selectedId) reorderFrame(state.selectedId, 1); });
  els.deleteFrame.addEventListener("click", () => deleteSelectedFrame());
  function deleteSelectedFrame() {
    if (!state.selectedId) return;
    const index = indexOfFrame(state.selectedId);
    state.frames.splice(index, 1);
    state.selectedId = state.frames[Math.min(index, state.frames.length - 1)]?.id || null;
    if (!state.frames.length) stopPlayback();
    markDirty(); renderAll();
  }

  els.upload.addEventListener("change", async () => {
    const file = els.upload.files?.[0]; if (!file) return;
    try {
      await loadImageBlob(file, file.name);
      markDirty("Unsaved sheet");
      toast(`Loaded ${state.image.naturalWidth} × ${state.image.naturalHeight} px sheet. Drag to mark frames.`);
    } catch (error) { toast(error.message); }
    els.upload.value = "";
  });
  els.openProject.addEventListener("click", () => els.projectInput.click());
  els.projectInput.addEventListener("change", async () => {
    const file = els.projectInput.files?.[0]; if (!file) return;
    try { await importProjectFile(file); } catch (error) { toast(error.message || "Could not open project."); }
    els.projectInput.value = "";
  });
  els.save.addEventListener("click", saveLocally);
  els.exportProject.addEventListener("click", () => exportProject(false));

  ["dragenter", "dragover"].forEach((eventName) => els.viewport.addEventListener(eventName, (event) => {
    event.preventDefault(); els.viewport.classList.add("is-drop-target");
  }));
  ["dragleave", "drop"].forEach((eventName) => els.viewport.addEventListener(eventName, (event) => {
    event.preventDefault(); els.viewport.classList.remove("is-drop-target");
  }));
  els.viewport.addEventListener("drop", async (event) => {
    const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith("image/"));
    if (!file) return toast("Drop an image file to load a sheet.");
    try { await loadImageBlob(file, file.name); markDirty("Unsaved sheet"); toast("Sheet loaded. Drag to mark frames."); }
    catch (error) { toast(error.message); }
  });

  els.zoomIn.addEventListener("click", () => setZoom(state.zoom * 1.2));
  els.zoomOut.addEventListener("click", () => setZoom(state.zoom / 1.2));
  els.zoomFit.addEventListener("click", fitZoom);
  els.fps.addEventListener("input", () => {
    state.fps = Number(els.fps.value); els.fpsValue.textContent = `${state.fps} fps`; markDirty();
    if (state.playing) startPlayback();
  });
  els.play.addEventListener("click", () => state.playing ? stopPlayback() : startPlayback());
  els.previous.addEventListener("click", () => stepPreview(-1));
  els.next.addEventListener("click", () => stepPreview(1));
  function stepPreview(delta) {
    if (!state.frames.length) return;
    stopPlayback();
    const selectedIndex = indexOfFrame(state.selectedId);
    const start = selectedIndex >= 0 ? selectedIndex : state.playIndex;
    const next = (start + delta + state.frames.length) % state.frames.length;
    selectFrame(state.frames[next].id);
  }

  document.addEventListener("keydown", (event) => {
    const isInput = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault(); saveLocally();
    } else if (event.key === "Escape" && state.drag?.mode === "draw") {
      state.drag.ghost?.remove(); state.drag = null;
    } else if ((event.key === "Delete" || event.key === "Backspace") && !isInput && state.selectedId) {
      event.preventDefault(); deleteSelectedFrame();
    } else if (!isInput && event.key === "ArrowLeft" && state.frames.length) stepPreview(-1);
    else if (!isInput && event.key === "ArrowRight" && state.frames.length) stepPreview(1);
  });

  async function restoreLocalProject() {
    try {
      const record = await getProject();
      if (!record?.imageBlob) return;
      await loadImageBlob(record.imageBlob, record.imageName, record.frames || [], record.fps || 8);
      state.dirty = false;
      setSaveState(`Saved locally · ${new Date(record.updatedAt).toLocaleDateString()}`, true);
      toast("Restored your saved sprite project from this browser.");
    } catch (_error) {
      setSaveState("No local save found", false);
    }
  }

  els.image.addEventListener("load", () => { if (state.image) fitZoom(); });
  toggleReady(false);
  updateInspector();
  renderPreview();
  restoreLocalProject();
})();
