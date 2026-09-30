(() => {
  const $ = (id) => document.getElementById(id);
  const svgNs = "http://www.w3.org/2000/svg";
  const state = { assets: [], objects: [], selectedId: null, selectedWallId: null, wallTool: "select", dirty: false, zoom: 1, drag: null, snap: true, lockRatio: true, projectDirectory: null, map: null };
  const ui = {
    map: $("designer-map"), room: $("fixed-room"), walls: $("room-walls"), placed: $("placed-assets"), selection: $("selection-layer"), grid: null, stage: $("stage-viewport"),
    projectInput: $("project-file"), assetList: $("asset-list"), assetCount: $("asset-count"),
    save: $("save-project"), saveToProject: $("save-to-project"), saveState: $("save-state"), open: $("open-project"), export: $("export-project"), toast: $("toast"),
    selectedTitle: $("selected-title"), emptyInspector: $("empty-inspector"), inspector: $("inspector-fields"),
    name: $("object-name"), x: $("object-x"), y: $("object-y"), width: $("object-width"), height: $("object-height"),
    rotation: $("object-rotation"), rotationValue: $("rotation-value"), lock: $("lock-ratio"), snap: $("snap-grid"),
    front: $("layer-front"), back: $("layer-back"), remove: $("delete-object"), dimensions: $("object-dimensions"),
    layerList: $("layer-list"), objectCount: $("object-count"), hint: $("canvas-hint"), zoomValue: $("zoom-value"),
    wallCount: $("wall-count"), wallStatus: $("wall-selection-status"), wallFields: $("wall-fields"),
    wallX1: $("wall-x1"), wallY1: $("wall-y1"), wallX2: $("wall-x2"), wallY2: $("wall-y2"), wallWidth: $("wall-width"), wallDimensions: $("wall-dimensions"),
    wallSelectTool: $("wall-select-tool"), wallDrawTool: $("wall-draw-tool"), deleteWall: $("delete-wall")
  };
  const makeId = () => window.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const objectById = (id) => state.objects.find((item) => item.id === id);
  const assetById = (id) => state.assets.find((item) => item.id === id);
  const selectedObject = () => objectById(state.selectedId);
  const wallSegments = () => state.map?.wallSegments || [];
  const selectedWall = () => wallSegments().find((wall) => wall.id === state.selectedWallId);

  function normalizeWalls() {
    state.map.wallSegments ||= (state.map.walls || []).map((wall) => {
      const match = wall.path?.match(/M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*L\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/i);
      return match ? { x1: Number(match[1]), y1: Number(match[2]), x2: Number(match[3]), y2: Number(match[4]), width: wall.width || 26, stroke: wall.stroke, edgeStroke: wall.edgeStroke } : null;
    }).filter(Boolean);
    state.map.wallSegments.forEach((wall) => { wall.id ||= makeId(); wall.width = Number(wall.width) || state.map.style?.wallWidth || 26; });
    syncWallData();
  }

  function syncWallData() {
    state.map.walls = wallSegments().map((wall) => ({
      path: `M${wall.x1} ${wall.y1}L${wall.x2} ${wall.y2}`,
      stroke: wall.stroke || "#672b38", edgeStroke: wall.edgeStroke || "#d86a66",
      width: Number(wall.width) || state.map.style?.wallWidth || 26,
      linecap: "square", linejoin: "miter"
    }));
  }

  function joinedWallLine(wall) {
    const points = [{ x: Number(wall.x1), y: Number(wall.y1) }, { x: Number(wall.x2), y: Number(wall.y2) }];
    const wx = points[1].x - points[0].x; const wy = points[1].y - points[0].y;
    const wallLength = Math.hypot(wx, wy) || 1;
    wallSegments().forEach((other) => {
      if (other === wall || (other.id && wall.id && other.id === wall.id)) return;
      const ox = Number(other.x2) - Number(other.x1); const oy = Number(other.y2) - Number(other.y1);
      const otherLength = Math.hypot(ox, oy) || 1;
      const sinAngle = Math.abs((wx * oy - wy * ox) / (wallLength * otherLength));
      if (sinAngle > .22 && Math.abs(sinAngle - 1) > .22) return;
      const limit = ((Number(wall.width) || 26) + (Number(other.width) || 26)) / 2 + 3;
      [0, 1].forEach((index) => {
        const point = points[index];
        const t = ((point.x - other.x1) * ox + (point.y - other.y1) * oy) / (otherLength * otherLength);
        if (t < 0 || t > 1) return;
        const projection = { x: Number(other.x1) + t * ox, y: Number(other.y1) + t * oy };
        const distance = Math.hypot(point.x - projection.x, point.y - projection.y);
        if (distance > limit) return;
        const previous = point.distance ?? Infinity;
        if (distance < previous) { points[index] = { ...projection, distance }; }
      });
    });
    return { x1: points[0].x, y1: points[0].y, x2: points[1].x, y2: points[1].y };
  }

  function renderWallArt(group, wall, width) {
    const { x1, y1, x2, y2 } = joinedWallLine(wall);
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / length; const ny = (x2 - x1) / length;
    const base = wall.stroke || "#672b38";
    const edge = wall.edgeStroke || state.map.style?.wallEdgeColor || "#d86a66";
    const appendStroke = (stroke, strokeWidth, extra = {}) => group.append(createSvg("line", {
      x1, y1, x2, y2, stroke, "stroke-width": strokeWidth, "stroke-linecap": "square", ...extra
    }));
    appendStroke("#17151b", width + 6);
    appendStroke(base, width);
    appendStroke("#17151b", Math.max(5, width * .42));
    const offset = width * .29;
    group.append(createSvg("line", {
      x1: x1 + nx * offset, y1: y1 + ny * offset, x2: x2 + nx * offset, y2: y2 + ny * offset,
      stroke: edge, "stroke-width": Math.max(1.5, width * .07), "stroke-linecap": "square", opacity: ".96"
    }));
  }

  function createWallNode(wall) {
    const width = Number(wall.width) || 26;
    const group = createSvg("g", { class: `wall-segment${wall.id === state.selectedWallId ? " selected" : ""}`, "data-wall-root-id": wall.id });
    renderWallArt(group, wall, width);
    const hitLine = joinedWallLine(wall);
    group.append(createSvg("line", { ...hitLine, stroke: "transparent", "stroke-width": width + 12, "stroke-linecap": "square", "pointer-events": "stroke", "data-wall-id": wall.id }));
    const title = createSvg("title"); title.textContent = `Wall · ${Math.round(Math.hypot(hitLine.x2 - hitLine.x1, hitLine.y2 - hitLine.y1))} × ${Math.round(width)} units`;
    group.append(title);
    return group;
  }

  function renderWallLayer() {
    ui.walls.replaceChildren(...wallSegments().map(createWallNode));
    renderWallSelection(); renderWallInspector();
  }

  function connectedWallIds(target) {
    const result = new Set([target.id]);
    wallSegments().forEach((wall) => {
      if (wall === target) return;
      const touches = (source, other) => {
        const sx = source.x2 - source.x1; const sy = source.y2 - source.y1;
        const ox = other.x2 - other.x1; const oy = other.y2 - other.y1;
        const sl = Math.hypot(sx, sy) || 1; const ol = Math.hypot(ox, oy) || 1;
        const angle = Math.abs((sx * oy - sy * ox) / (sl * ol));
        if (angle > .22 && Math.abs(angle - 1) > .22) return false;
        const limit = ((Number(source.width) || 26) + (Number(other.width) || 26)) / 2 + 3;
        return [[source.x1, source.y1], [source.x2, source.y2]].some(([px, py]) => {
          const t = ((px - other.x1) * ox + (py - other.y1) * oy) / (ol * ol);
          if (t < 0 || t > 1) return false;
          return Math.hypot(px - (other.x1 + t * ox), py - (other.y1 + t * oy)) <= limit;
        });
      };
      if (touches(target, wall) || touches(wall, target)) result.add(wall.id);
    });
    return result;
  }

  function refreshWallNodes(ids) {
    ids.forEach((id) => {
      const wall = wallSegments().find((item) => item.id === id);
      const oldNode = [...ui.walls.children].find((node) => node.getAttribute("data-wall-root-id") === id);
      if (!wall) { oldNode?.remove(); return; }
      const newNode = createWallNode(wall);
      if (oldNode) oldNode.replaceWith(newNode); else ui.walls.append(newNode);
    });
    renderWallSelection(); renderWallInspector();
  }

  function renderWallSelection() {
    ui.selection.querySelectorAll(".wall-selection").forEach((node) => node.remove());
    const wall = selectedWall();
    if (!wall) return;
    const joined = joinedWallLine(wall);
    const group = createSvg("g", { class: "wall-selection", "pointer-events": "none" });
    group.append(createSvg("line", { ...joined, class: "wall-selection-line", "pointer-events": "stroke", "data-wall-id": wall.id }));
    [["start", joined.x1, joined.y1], ["end", joined.x2, joined.y2]].forEach(([endpoint, x, y]) => {
      group.append(createSvg("circle", { cx: x, cy: y, r: 7, class: "wall-handle", "data-wall-handle": endpoint, "data-wall-id": wall.id, "pointer-events": "all" }));
    });
    ui.selection.append(group);
  }

  function renderWallInspector() {
    const wall = selectedWall();
    ui.wallCount.textContent = String(wallSegments().length);
    ui.wallFields.hidden = !wall;
    ui.wallStatus.textContent = state.wallTool === "draw" ? "Click the map to place one wall block." : wall ? "Selected wall · drag it to move, or drag an end handle to reshape." : "Choose a wall or add a new one.";
    if (!wall) return;
    const joined = joinedWallLine(wall);
    ui.wallX1.value = Math.round(joined.x1); ui.wallY1.value = Math.round(joined.y1);
    ui.wallX2.value = Math.round(joined.x2); ui.wallY2.value = Math.round(joined.y2);
    ui.wallWidth.value = Math.round(wall.width || 26);
    ui.wallDimensions.textContent = `${Math.round(Math.hypot(joined.x2 - joined.x1, joined.y2 - joined.y1))} units long · ${Math.round(wall.width || 26)} units thick`;
  }

  function toast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add("visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ui.toast.classList.remove("visible"), 2500);
  }

  function dirty(message = "Unsaved changes") {
    state.dirty = true;
    ui.saveState.textContent = message;
    ui.saveState.classList.remove("saved");
  }

  function createSvg(tag, attributes = {}) {
    const element = document.createElementNS(svgNs, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function renderRoom() {
    ui.room.replaceChildren(); ui.walls.replaceChildren();
    const { floor } = state.map;
    const regions = Array.isArray(floor.regions) ? floor.regions : [floor];
    regions.forEach((region) => {
      const material = region.material || "tile";
      ui.room.append(createSvg("rect", { x: region.x, y: region.y, width: region.width, height: region.height, fill: `url(#floor-${material})` }));
      if (["tile", "dirt", "wood", "blue"].includes(material)) {
        ui.room.append(createSvg("rect", { x: region.x, y: region.y, width: region.width, height: region.height, fill: "url(#designer-grid)", opacity: state.snap ? ".18" : "0", "pointer-events": "none" }));
      }
    });
    (state.map.landscape || []).forEach(drawCampusDecor);
    (state.map.features || []).filter((feature) => feature.type === "swing-door").forEach(drawSwingDoor);
    renderWallLayer();
  }

  function drawCampusDecor(item) {
    const group = createSvg("g", { "pointer-events": "none" });
    if (item.type === "tree") {
      const r = item.size || 36;
      group.append(createSvg("ellipse", { cx: item.x + 4, cy: item.y + r * .58, rx: r * .72, ry: r * .28, fill: "#315b42", opacity: ".28" }));
      group.append(createSvg("path", { d: `M${item.x - r * .12} ${item.y + r * .42}h${r * .24}v${r * .52}h-${r * .24}z`, fill: "#805039", stroke: "#553b36", "stroke-width": 2 }));
      [[-.35,-.2,.68], [.25,-.28,.72], [0,.1,.82], [-.48,.18,.55], [.48,.16,.56]].forEach(([dx,dy,s], i) => group.append(createSvg("circle", { cx: item.x + dx * r, cy: item.y + dy * r, r: r * s, fill: ["#37824b", "#459750", "#56a95b", "#3b9049", "#4b9e50"][i], stroke: "#285d3b", "stroke-width": 2 })));
      group.append(createSvg("ellipse", { cx: item.x - r * .14, cy: item.y - r * .36, rx: r * .22, ry: r * .12, fill: "#89c96a", opacity: ".52" }));
    } else if (item.type === "hedge") {
      const h = item.height || 22;
      group.append(createSvg("rect", { x: item.x, y: item.y, width: item.width, height: h, rx: h / 2, fill: "#397e49", stroke: "#275d3b", "stroke-width": 2 }));
      for (let x = item.x + h * .45; x < item.x + item.width; x += h * .8) group.append(createSvg("circle", { cx: x, cy: item.y + h * .35, r: h * .37, fill: "#5eac58" }));
    } else if (item.type === "fence") {
      group.append(createSvg("line", { x1: item.x, y1: item.y + item.height / 2, x2: item.x + item.width, y2: item.y + item.height / 2, stroke: "#263944", "stroke-width": 3 }));
      for (let x = item.x; x <= item.x + item.width; x += 24) group.append(createSvg("line", { x1: x, y1: item.y, x2: x, y2: item.y + item.height, stroke: "#667d86", "stroke-width": 2 }));
    } else if (item.type === "bench") {
      group.append(createSvg("rect", { x: item.x, y: item.y + 5, width: item.width, height: item.height - 10, rx: 3, fill: "#8b6547", stroke: "#433e43", "stroke-width": 3 }));
      group.append(createSvg("line", { x1: item.x + 8, y1: item.y + 2, x2: item.x + item.width - 8, y2: item.y + 2, stroke: "#c59a65", "stroke-width": 4, "stroke-linecap": "round" }));
    } else if (item.type === "sign") {
      group.append(createSvg("rect", { x: item.x, y: item.y, width: item.width, height: item.height, rx: 4, fill: "#5f4050", stroke: "#f0c765", "stroke-width": 3 }));
      const text = createSvg("text", { x: item.x + item.width / 2, y: item.y + item.height * .68, "text-anchor": "middle", fill: "#fff4d3", "font-size": 14, "font-family": "system-ui,sans-serif", "font-weight": 700 });
      text.textContent = item.text || "SCHOOL"; group.append(text);
    }
    ui.room.append(group);
  }

  function drawSwingDoor(feature) {
    const group = createSvg("g", { "pointer-events": "none" });
    const horizontal = feature.orientation !== "vertical";
    const hingeSide = feature.hingeSide || (horizontal ? "left" : "top");
    const direction = feature.direction || (horizontal ? "up" : "right");
    const openingWidth = feature.openingWidth || feature.length || 96;
    const length = Math.min(feature.length || openingWidth, Math.max(24, openingWidth - 16));
    const hinge = horizontal
      ? { x: feature.x + (hingeSide === "right" ? openingWidth : 0), y: feature.y }
      : { x: feature.x, y: feature.y + (hingeSide === "bottom" ? openingWidth : 0) };
    const radians = { up: -Math.PI / 2, right: 0, down: Math.PI / 2, left: Math.PI }[direction] ?? -Math.PI / 2;
    const open = { x: hinge.x + Math.cos(radians) * length, y: hinge.y + Math.sin(radians) * length };
    const wall = state.map.style?.wallColor || "#4a2434";
    const wood = feature.color || "#bd784b";
    const jamb = 12;
    if (horizontal) {
      group.append(createSvg("rect", { x: feature.x - jamb / 2, y: feature.y - 12, width: jamb, height: 24, rx: 2, fill: wall }));
      group.append(createSvg("rect", { x: feature.x + openingWidth - jamb / 2, y: feature.y - 12, width: jamb, height: 24, rx: 2, fill: wall }));
    } else {
      const openingHeight = openingWidth;
      group.append(createSvg("rect", { x: feature.x - 12, y: feature.y - jamb / 2, width: 24, height: jamb, fill: wall }));
      group.append(createSvg("rect", { x: feature.x - 12, y: feature.y + openingHeight - jamb / 2, width: 24, height: jamb, fill: wall }));
    }
    group.append(createSvg("line", { x1: hinge.x, y1: hinge.y, x2: open.x, y2: open.y, stroke: wall, "stroke-width": 11, "stroke-linecap": "square" }));
    group.append(createSvg("line", { x1: hinge.x, y1: hinge.y, x2: open.x, y2: open.y, stroke: wood, "stroke-width": 7, "stroke-linecap": "square" }));
    group.append(createSvg("line", { x1: hinge.x + 2, y1: hinge.y, x2: open.x + 2, y2: open.y, stroke: "#e5b17b", "stroke-width": 1.1, opacity: ".85" }));
    group.append(createSvg("circle", { cx: hinge.x, cy: hinge.y, r: 3.5, fill: "#e7bf86", stroke: wall, "stroke-width": 1.2 }));
    ui.room.append(group);
  }

  function renderAssets() {
    ui.assetList.replaceChildren();
    ui.assetCount.textContent = String(state.assets.length);
    state.assets.forEach((asset) => {
      const row = document.createElement("div"); row.className = "asset-row";
      const thumb = document.createElement("div"); thumb.className = "asset-thumb";
      const image = document.createElement("img"); image.src = asset.url; image.alt = ""; thumb.append(image);
      const info = document.createElement("div"); info.className = "asset-info";
      const name = document.createElement("div"); name.className = "asset-name"; name.textContent = asset.name;
      const dims = document.createElement("div"); dims.className = "asset-dims"; dims.textContent = `${asset.width} × ${asset.height}px`;
      const actions = document.createElement("div"); actions.className = "asset-buttons";
      const add = document.createElement("button"); add.type = "button"; add.textContent = "Add to room";
      add.addEventListener("click", () => addObject(asset.id));
      actions.append(add); info.append(name, dims, actions); row.append(thumb, info); ui.assetList.append(row);
    });
  }

  function renderScene() {
    ui.placed.replaceChildren(); ui.selection.replaceChildren();
    state.objects.forEach((item) => {
      const asset = assetById(item.assetId); if (!asset) return;
      const image = createSvg("image", {
        href: asset.url, x: item.x, y: item.y, width: item.width, height: item.height,
        preserveAspectRatio: "none", class: `map-item${item.id === state.selectedId ? " selected" : ""}`,
        "data-object-id": item.id, "aria-label": item.name, draggable: "false"
      });
      const angle = Number(item.rotation) || 0;
      if (angle) image.setAttribute("transform", `rotate(${angle} ${item.x + item.width / 2} ${item.y + item.height / 2})`);
      const title = createSvg("title"); title.textContent = `${item.name} · ${Math.round(item.width)} × ${Math.round(item.height)} · x ${Math.round(item.x)}, y ${Math.round(item.y)}`;
      image.append(title); ui.placed.append(image);
    });
    const item = selectedObject();
    if (item) {
      const group = createSvg("g", { transform: `rotate(${Number(item.rotation) || 0} ${item.x + item.width / 2} ${item.y + item.height / 2})`, "pointer-events": "none" });
      group.append(createSvg("rect", { x: item.x, y: item.y, width: item.width, height: item.height, class: "selection-box" }));
      const collider = item.collider || assetById(item.assetId)?.collider;
      if (collider?.type === "polygon" && collider.points?.length >= 3) {
        const points = collider.points.map(([px, py]) => `${item.x + px * item.width},${item.y + py * item.height}`).join(" ");
        group.append(createSvg("polygon", { points, class: "collision-polygon" }));
        collider.points.forEach(([px, py], index) => group.append(createSvg("circle", {
          cx: item.x + px * item.width, cy: item.y + py * item.height, r: 4,
          class: "collision-handle", "data-collider-index": index, "data-object-id": item.id, "pointer-events": "all"
        })));
      }
      [["nw", item.x, item.y], ["ne", item.x + item.width, item.y], ["sw", item.x, item.y + item.height], ["se", item.x + item.width, item.y + item.height]].forEach(([corner, x, y]) => {
        const handle = createSvg("rect", { x: Number(x) - 4, y: Number(y) - 4, width: 8, height: 8, rx: 1.5, class: "resize-handle", "data-resize": corner, "data-object-id": item.id, "pointer-events": "all" });
        group.append(handle);
      });
      ui.selection.append(group);
    }
    renderWallSelection(); renderWallInspector();
    renderLayers(); updateInspector();
  }

  function renderLayers() {
    ui.layerList.replaceChildren();
    ui.objectCount.textContent = String(state.objects.length);
    [...state.objects].reverse().forEach((item, reverseIndex) => {
      const index = state.objects.length - reverseIndex - 1;
      const row = document.createElement("div"); row.className = `layer-row${item.id === state.selectedId ? " active" : ""}`;
      row.addEventListener("click", () => selectObject(item.id));
      const swatch = document.createElement("span"); swatch.className = "layer-swatch";
      const label = document.createElement("span"); label.textContent = item.name;
      const front = document.createElement("button"); front.type = "button"; front.textContent = "↑"; front.title = "Bring forward"; front.disabled = index === state.objects.length - 1;
      front.addEventListener("click", (event) => { event.stopPropagation(); reorderObject(item.id, 1); });
      const back = document.createElement("button"); back.type = "button"; back.textContent = "↓"; back.title = "Send back"; back.disabled = index === 0;
      back.addEventListener("click", (event) => { event.stopPropagation(); reorderObject(item.id, -1); });
      row.append(swatch, label, front, back); ui.layerList.append(row);
    });
  }

  function updateInspector() {
    const item = selectedObject();
    const selected = Boolean(item);
    ui.emptyInspector.hidden = selected;
    ui.inspector.hidden = !selected;
    ui.selectedTitle.textContent = item ? item.name : "Nothing selected";
    ui.front.disabled = !item || state.objects.indexOf(item) === state.objects.length - 1;
    ui.back.disabled = !item || state.objects.indexOf(item) === 0;
    ui.remove.disabled = !item;
    if (!item) return;
    ui.name.value = item.name;
    ui.x.value = Math.round(item.x); ui.y.value = Math.round(item.y);
    ui.width.value = Math.round(item.width); ui.height.value = Math.round(item.height);
    ui.rotation.value = String(Math.round(item.rotation || 0));
    ui.rotationValue.textContent = `${Math.round(item.rotation || 0)}°`;
    ui.dimensions.textContent = `${Math.round(item.width)} × ${Math.round(item.height)} units · center ${Math.round(item.x + item.width / 2)}, ${Math.round(item.y + item.height / 2)}`;
  }

  function setZoom(value) {
    state.zoom = Math.max(.62, Math.min(1.5, value));
    const bounds = state.map.bounds;
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const width = (bounds.right - bounds.left + 100) / state.zoom;
    const height = (bounds.bottom - bounds.top + 100) / state.zoom;
    ui.map.setAttribute("viewBox", `${centerX - width / 2} ${centerY - height / 2} ${width} ${height}`);
    ui.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function selectObject(id) {
    state.selectedId = id;
    state.selectedWallId = null;
    renderScene();
    const item = selectedObject();
    ui.hint.textContent = item ? `${item.name} · move, resize, rotate, or drag the orange collision points` : "Select an asset or drag an item to arrange it.";
  }

  function addObject(assetId) {
    const asset = assetById(assetId); if (!asset) return;
    const scale = Math.min(112 / asset.width, 124 / asset.height, 1);
    const width = asset.defaultSize?.width || Math.max(8, asset.width * scale); const height = asset.defaultSize?.height || Math.max(8, asset.height * scale);
    const item = { id: makeId(), assetId, name: asset.name.replace(/\.[^.]+$/, ""), x: 450 - width / 2, y: 430 - height / 2, width, height, rotation: 0, z: state.objects.length, collider: null };
    state.objects.push(item); state.selectedId = item.id; dirty(); renderScene();
    toast(`${item.name} added to the room.`);
  }

  function mapPoint(event) {
    const matrix = ui.map.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = ui.map.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const mapped = point.matrixTransform(matrix.inverse());
    return { x: mapped.x, y: mapped.y };
  }

  function snap(value) { return state.snap ? Math.round(value / 16) * 16 : value; }
  function setWallTool(tool) {
    state.wallTool = tool;
    ui.wallSelectTool.classList.toggle("active", tool === "select"); ui.wallSelectTool.setAttribute("aria-pressed", String(tool === "select"));
    ui.wallDrawTool.classList.toggle("active", tool === "draw"); ui.wallDrawTool.setAttribute("aria-pressed", String(tool === "draw"));
    ui.map.classList.toggle("drawing-wall", tool === "draw");
    renderWallInspector();
  }

  function selectWall(id) {
    state.selectedId = null; state.selectedWallId = id;
    renderScene();
    ui.hint.textContent = id ? "Wall selected · adjust its endpoints or thickness in Wall design." : "Select an asset, wall, or draw a wall.";
  }

  function updateSelectedWall(field, value) {
    const wall = selectedWall(); const number = Number(value);
    if (!wall || !Number.isFinite(number)) return;
    wall[field] = field === "width" ? Math.max(4, Math.min(120, number)) : number;
    syncWallData(); dirty("Unsaved wall changes"); renderWallLayer();
  }

  function rotateToLocal(point, center, degrees) {
    const radians = -degrees * Math.PI / 180;
    const dx = point.x - center.x; const dy = point.y - center.y;
    return { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
  }

  function startDrag(event, mode, item, corner = "") {
    const point = mapPoint(event);
    const origin = { x: item.x, y: item.y, width: item.width, height: item.height, rotation: Number(item.rotation) || 0 };
    selectObject(item.id);
    state.drag = { pointerId: event.pointerId, mode, id: item.id, start: point, origin, corner, initial: rotateToLocal(point, { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 }, origin.rotation) };
    ui.map.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  ui.map.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const point = mapPoint(event);
    if (state.wallTool === "draw") {
      const centerX = snap(point.x); const centerY = snap(point.y); const length = 32;
      const wall = {
        id: makeId(), x1: centerX - length / 2, y1: centerY, x2: centerX + length / 2, y2: centerY,
        width: 22, stroke: "#672b38", edgeStroke: state.map.style?.wallEdgeColor || "#d86a66"
      };
      state.map.wallSegments.push(wall); syncWallData(); dirty("Unsaved wall changes");
      state.selectedId = null; state.selectedWallId = wall.id; setWallTool("select");
      renderWallLayer();
      ui.hint.textContent = "Wall block added · drag it to move or drag either end handle to reshape.";
      event.preventDefault(); return;
    }
    const wallHandle = event.target.closest?.("[data-wall-handle]");
    const wallTarget = event.target.closest?.("[data-wall-id]");
    const wallId = wallHandle?.getAttribute("data-wall-id") || wallTarget?.getAttribute("data-wall-id");
    const wall = wallSegments().find((item) => item.id === wallId);
    if (wall) {
      const endpoint = wallHandle?.getAttribute("data-wall-handle");
      selectWall(wall.id);
      state.drag = { pointerId: event.pointerId, mode: endpoint ? "wall-endpoint" : "wall-move", id: wall.id, endpoint, start: point, origin: { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 }, affectedIds: connectedWallIds(wall) };
      ui.map.setPointerCapture(event.pointerId); event.preventDefault(); return;
    }
    const colliderHandle = event.target.closest?.("[data-collider-index]");
    const handle = event.target.closest?.("[data-resize]");
    const image = event.target.closest?.("[data-object-id]");
    const itemId = colliderHandle?.getAttribute("data-object-id") || handle?.getAttribute("data-object-id") || image?.getAttribute("data-object-id");
    const item = objectById(itemId);
    if (item) { startDrag(event, colliderHandle ? "collider" : handle ? "resize" : "move", item, colliderHandle?.getAttribute("data-collider-index") || handle?.getAttribute("data-resize") || ""); return; }
    if (state.selectedWallId) { selectWall(null); return; }
    state.selectedId = null; renderScene(); ui.hint.textContent = "Select an asset, wall, or draw a wall.";
  });

  ui.map.addEventListener("pointermove", (event) => {
    const drag = state.drag; if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.mode.startsWith("wall-")) {
      const wall = wallSegments().find((item) => item.id === drag.id); if (!wall) return;
      const point = mapPoint(event);
      if (drag.mode === "wall-endpoint") {
        const x = snap(point.x); const y = snap(point.y);
        if (drag.endpoint === "start") { wall.x1 = x; wall.y1 = y; } else { wall.x2 = x; wall.y2 = y; }
      } else {
        const dx = point.x - drag.start.x; const dy = point.y - drag.start.y;
        wall.x1 = snap(drag.origin.x1 + dx); wall.y1 = snap(drag.origin.y1 + dy);
        wall.x2 = snap(drag.origin.x2 + dx); wall.y2 = snap(drag.origin.y2 + dy);
      }
      syncWallData();
      const affected = new Set([...drag.affectedIds, ...connectedWallIds(wall)]);
      refreshWallNodes(affected); return;
    }
    const item = objectById(drag.id); if (!item) return;
    const point = mapPoint(event); const original = drag.origin;
    if (drag.mode === "move") {
      item.x = snap(original.x + point.x - drag.start.x);
      item.y = snap(original.y + point.y - drag.start.y);
    } else if (drag.mode === "collider") {
      const asset = assetById(item.assetId);
      if (!item.collider) item.collider = JSON.parse(JSON.stringify(asset?.collider || { type: "polygon", points: [[0,0],[1,0],[1,1],[0,1]] }));
      const local = rotateToLocal(point, { x: original.x + original.width / 2, y: original.y + original.height / 2 }, original.rotation);
      const index = Number(drag.corner);
      item.collider.points[index] = [Math.max(0, Math.min(1, (local.x - original.x) / original.width)), Math.max(0, Math.min(1, (local.y - original.y) / original.height))];
    } else {
      const center = { x: original.x + original.width / 2, y: original.y + original.height / 2 };
      const local = rotateToLocal(point, center, original.rotation);
      const east = drag.corner.includes("e"); const south = drag.corner.includes("s");
      const anchor = { x: east ? original.x : original.x + original.width, y: south ? original.y : original.y + original.height };
      let width = Math.max(8, Math.abs(local.x - anchor.x)); let height = Math.max(8, Math.abs(local.y - anchor.y));
      if (state.lockRatio) {
        const ratio = original.width / original.height;
        if (width / height > ratio) height = width / ratio; else width = height * ratio;
      }
      if (state.snap) { width = Math.max(8, snap(width)); height = state.lockRatio ? width / (original.width / original.height) : Math.max(8, snap(height)); }
      item.width = width; item.height = height;
      item.x = east ? anchor.x : anchor.x - width;
      item.y = south ? anchor.y : anchor.y - height;
    }
    renderScene();
  });

  function endDrag(event) {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    const finishedDrag = state.drag;
    const wasWall = finishedDrag.mode.startsWith("wall-");
    state.drag = null; dirty(wasWall ? "Unsaved wall changes" : "Unsaved changes");
    if (wasWall) {
      syncWallData();
      const movedWall = wallSegments().find((wall) => wall.id === finishedDrag.id);
      const affected = new Set(finishedDrag.affectedIds);
      if (movedWall) connectedWallIds(movedWall).forEach((id) => affected.add(id));
      refreshWallNodes(affected);
    } else renderScene();
  }
  ui.map.addEventListener("pointerup", endDrag); ui.map.addEventListener("pointercancel", endDrag);

  function updateNumber(field, value) {
    const item = selectedObject(); if (!item) return;
    const number = Number(value); if (!Number.isFinite(number)) return;
    const ratio = item.width / item.height;
    if (field === "x") item.x = number;
    if (field === "y") item.y = number;
    if (field === "width") { item.width = Math.max(8, number); if (state.lockRatio) item.height = item.width / ratio; }
    if (field === "height") { item.height = Math.max(8, number); if (state.lockRatio) item.width = item.height * ratio; }
    if (field === "rotation") item.rotation = Math.max(-180, Math.min(180, number));
    dirty(); renderScene();
  }

  [[ui.x, "x"], [ui.y, "y"], [ui.width, "width"], [ui.height, "height"]].forEach(([input, field]) => input.addEventListener("change", () => updateNumber(field, input.value)));
  [[ui.wallX1, "x1"], [ui.wallY1, "y1"], [ui.wallX2, "x2"], [ui.wallY2, "y2"], [ui.wallWidth, "width"]].forEach(([input, field]) => input.addEventListener("change", () => updateSelectedWall(field, input.value)));
  ui.wallSelectTool.addEventListener("click", () => setWallTool("select"));
  ui.wallDrawTool.addEventListener("click", () => setWallTool("draw"));
  ui.deleteWall.addEventListener("click", () => {
    if (!state.selectedWallId) return;
    state.map.wallSegments = wallSegments().filter((wall) => wall.id !== state.selectedWallId);
    state.selectedWallId = null; syncWallData(); dirty("Unsaved wall changes"); renderWallLayer(); renderWallInspector();
  });
  ui.name.addEventListener("input", () => { const item = selectedObject(); if (!item) return; item.name = ui.name.value.trim() || "Room object"; ui.selectedTitle.textContent = item.name; dirty(); renderLayers(); });
  ui.rotation.addEventListener("input", () => { const item = selectedObject(); if (!item) return; item.rotation = Number(ui.rotation.value); ui.rotationValue.textContent = `${item.rotation}°`; dirty(); renderScene(); });
  ui.lock.addEventListener("change", () => { state.lockRatio = ui.lock.checked; });
  ui.snap.addEventListener("change", () => { state.snap = ui.snap.checked; ui.grid?.setAttribute("opacity", state.snap ? ".18" : "0"); });

  function reorderObject(id, delta) {
    const index = state.objects.findIndex((item) => item.id === id); const next = index + delta;
    if (index < 0 || next < 0 || next >= state.objects.length) return;
    [state.objects[index], state.objects[next]] = [state.objects[next], state.objects[index]];
    state.objects.forEach((item, layer) => { item.z = layer; });
    dirty(); renderScene();
  }
  ui.front.addEventListener("click", () => { if (state.selectedId) reorderObject(state.selectedId, 1); });
  ui.back.addEventListener("click", () => { if (state.selectedId) reorderObject(state.selectedId, -1); });
  ui.remove.addEventListener("click", () => {
    if (!state.selectedId) return;
    const index = state.objects.findIndex((item) => item.id === state.selectedId);
    state.objects.splice(index, 1); state.selectedId = null; dirty(); renderScene();
  });

  function openDatabase() {
    if (!("indexedDB" in window)) return Promise.reject(new Error("Browser storage is unavailable."));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("roomscape-map-designer", 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("projects")) request.result.createObjectStore("projects", { keyPath: "id" }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open browser storage."));
      request.onblocked = () => reject(new Error("Browser storage is busy in another tab."));
    });
  }

  async function saveRecord(record) {
    const db = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("projects", "readwrite");
        transaction.objectStore("projects").put(record);
        transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error || new Error("Save failed.")); transaction.onabort = () => reject(transaction.error || new Error("Save was canceled."));
      });
    } finally { db.close(); }
  }

  async function readRecord(id = "room-01") {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("projects", "readonly").objectStore("projects").get(id);
        request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error || new Error("Could not read the saved map."));
      });
    } finally { db.close(); }
  }

  function savedState(date) {
    state.dirty = false; ui.saveState.textContent = date ? `Saved locally · ${new Date(date).toLocaleDateString()}` : "Saved on this device"; ui.saveState.classList.add("saved");
  }

  async function saveLocally() {
    const record = {
      id: "room-01", map: serializableMap(),
      updatedAt: new Date().toISOString()
    };
    try { await saveRecord(record); savedState(record.updatedAt); toast("Room images and placements saved in this browser."); }
    catch (error) {
      ui.saveState.textContent = "Creating portable save…"; ui.saveState.classList.remove("saved");
      const exported = await exportProject("Browser storage was unavailable; a project file was downloaded instead.");
      if (!exported) {
        ui.saveState.textContent = "Save failed · use Export";
        toast(`${error.message} Select Export to download a portable project.`);
      }
    }
  }

  function serializableMap() {
    syncWallData();
    return { ...state.map, objects: state.objects.map(({ _node, ...item }) => item) };
  }
  function projectText() { return JSON.stringify(serializableMap(), null, 2); }

  async function saveToProject() {
    try {
      if (typeof window.showDirectoryPicker !== "function") throw new Error("This browser cannot write directly to a project folder. Use Export to download the JSON project.");
      let directory = state.projectDirectory;
      if (!directory) directory = await window.showDirectoryPicker({ id: "roomscape-project", mode: "readwrite" });
      let permission = await directory.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") permission = await directory.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") throw new Error("Folder access was not granted. Choose the prototype folder to save the map JSON.");

      const assetsFolder = await directory.getDirectoryHandle("assets");
      await assetsFolder.getFileHandle("asset-manifest.json");

      const maps = await directory.getDirectoryHandle("maps", { create: true });
      const room = await maps.getDirectoryHandle("room-01", { create: true });
      const fileHandle = await room.getFileHandle("map.json", { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(projectText());
      await writable.close();
      state.projectDirectory = directory;
      try { await saveRecord({ id: "project-folder", handle: directory }); } catch (_error) { /* Folder can still be used for this session. */ }
      state.dirty = false; ui.saveState.textContent = "Saved to project · maps/room-01/map.json"; ui.saveState.classList.add("saved");
      toast("Map layout and collision shapes saved. The play page now reads this map file.");
    } catch (error) {
      if (error.name === "AbortError") return;
      state.projectDirectory = null;
      const exported = await exportProject("Direct folder save was unavailable, so a portable map JSON was downloaded. You can place it in maps/room-01.");
      if (!exported) toast(error.message || "Could not save the project or download its JSON.");
    }
  }

  async function exportProject(successMessage = "Map project exported with all imported images and placements.") {
    try {
      const blob = new Blob([projectText()], { type: "application/json" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "map.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
      ui.saveState.textContent = "Portable project downloaded"; ui.saveState.classList.add("saved");
      toast(successMessage);
      return true;
    } catch (error) { toast(error.message || "Could not export the map project."); return false; }
  }

  async function importProject(file) {
    const project = JSON.parse(await file.text());
    if (project.format !== "roomscape-map" || !Array.isArray(project.objects)) throw new Error("That file is not a Roomscape map JSON.");
    const missing = project.objects.find((item) => !assetById(item.assetId));
    if (missing) throw new Error(`Asset “${missing.assetId}” is not in the current asset catalog.`);
    state.map = project; state.objects = project.objects; state.selectedId = null; state.selectedWallId = null; normalizeWalls(); renderRoom();
    dirty("Map opened · unsaved"); renderScene(); toast("Map opened. Save to project to make it the playable map.");
  }

  ui.save.addEventListener("click", saveLocally);
  ui.saveToProject.addEventListener("click", saveToProject);
  ui.export.addEventListener("click", exportProject);
  ui.open.addEventListener("click", () => ui.projectInput.click());
  ui.projectInput.addEventListener("change", async () => {
    const file = ui.projectInput.files?.[0]; if (!file) return;
    try { await importProject(file); } catch (error) { toast(error.message || "Could not open that project."); }
    ui.projectInput.value = "";
  });
  $("zoom-in").addEventListener("click", () => setZoom(state.zoom * 1.15));
  $("zoom-out").addEventListener("click", () => setZoom(state.zoom / 1.15));
  $("zoom-fit").addEventListener("click", () => setZoom(1));
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveLocally(); }
    if ((event.key === "Delete" || event.key === "Backspace") && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      if (state.selectedWallId) { event.preventDefault(); ui.deleteWall.click(); }
      else if (state.selectedId) { event.preventDefault(); ui.remove.click(); }
    }
  });

  async function restore() {
    try {
      const record = await readRecord(); if (!record) return;
      if (!record.map || !Array.isArray(record.map.objects)) return;
      state.map = record.map; state.objects = record.map.objects; state.selectedId = null; state.selectedWallId = null; normalizeWalls(); renderRoom(); renderScene(); savedState(record.updatedAt);
    } catch (_error) { /* Keep the built-in default room ready when browser storage is unavailable. */ }
  }

  async function initialize() {
    const [manifestResponse, mapResponse] = await Promise.all([fetch("assets/asset-manifest.json"), fetch("maps/room-01/map.json")]);
    if (!manifestResponse.ok || !mapResponse.ok) throw new Error("Could not load the asset catalog or room map.");
    const manifest = await manifestResponse.json();
    state.map = await mapResponse.json();
    normalizeWalls();
    renderRoom();
    state.assets = await Promise.all(manifest.assets.map(async (asset) => {
      const image = await new Promise((resolve, reject) => {
        const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error(`Unable to load asset: ${asset.src}`)); element.src = asset.src;
      });
      return { ...asset, width: asset.width || image.naturalWidth, height: asset.height || image.naturalHeight, url: asset.src };
    }));
    state.map.format = "roomscape-map";
    state.map.version = 1;
    state.map.objects ||= [];
    state.objects = state.map.objects;
    setZoom(1);
    renderAssets(); renderScene();
    await restore();
    try { state.projectDirectory = (await readRecord("project-folder"))?.handle || null; } catch (_error) { /* Folder access is optional. */ }
  }

  initialize().catch((error) => toast(`${error.message} Open this page through the local web server.`));
})();
