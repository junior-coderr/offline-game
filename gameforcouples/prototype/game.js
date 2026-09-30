(() => {
  const svg = document.querySelector("main > svg");
  const world = document.getElementById("world-camera");
  const stick = document.getElementById("move-stick");
  const knob = document.getElementById("stick-knob");
  const errorBox = document.getElementById("load-error");
  const ns = "http://www.w3.org/2000/svg";
  const input = { x: 0, y: 0, keys: new Set(), pointerId: null, destination: null };
  let mapData;
  let settings;
  let catalog;
  let player;
  let playerSprite;
  let playerState;
  let entities;
  let wallBack;
  let wallFront;
  let depthWalls = [];
  let lastWallDepthKey = "";
  let cameraX = 0;
  let cameraY = 0;
  let cameraReady = false;
  let previousTime = 0;
  let lastEntityOrder = "";

  const svgElement = (name, attributes = {}) => {
    const element = document.createElementNS(ns, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  };
  const rectElement = (rect, fill, extra = {}) => svgElement("rect", {
    x: rect.x, y: rect.y, width: rect.width, height: rect.height, fill, ...extra
  });
  function joinedWallLine(segment) {
    const points = [{ x: Number(segment.x1), y: Number(segment.y1) }, { x: Number(segment.x2), y: Number(segment.y2) }];
    const wx = points[1].x - points[0].x; const wy = points[1].y - points[0].y;
    const wallLength = Math.hypot(wx, wy) || 1;
    (mapData.wallSegments || []).forEach((other) => {
      if (other === segment || (other.id && segment.id && other.id === segment.id)) return;
      const ox = Number(other.x2) - Number(other.x1); const oy = Number(other.y2) - Number(other.y1);
      const otherLength = Math.hypot(ox, oy) || 1;
      const sinAngle = Math.abs((wx * oy - wy * ox) / (wallLength * otherLength));
      if (sinAngle > .22 && Math.abs(sinAngle - 1) > .22) return;
      const limit = ((Number(segment.width) || 26) + (Number(other.width) || 26)) / 2 + 3;
      [0, 1].forEach((index) => {
        const point = points[index];
        const t = ((point.x - other.x1) * ox + (point.y - other.y1) * oy) / (otherLength * otherLength);
        if (t < 0 || t > 1) return;
        const projection = { x: Number(other.x1) + t * ox, y: Number(other.y1) + t * oy };
        const distance = Math.hypot(point.x - projection.x, point.y - projection.y);
        if (distance <= limit && distance < (point.distance ?? Infinity)) points[index] = { ...projection, distance };
      });
    });
    return { x1: points[0].x, y1: points[0].y, x2: points[1].x, y2: points[1].y };
  }

  function drawWallArt(group, segment, width) {
    const { x1, y1, x2, y2 } = joinedWallLine(segment);
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / length; const ny = (x2 - x1) / length;
    const base = segment.stroke || "#672b38";
    const edge = segment.edgeStroke || mapData.style?.wallEdgeColor || "#d86a66";
    const line = (stroke, strokeWidth, extra = {}) => group.append(svgElement("line", {
      x1, y1, x2, y2, stroke, "stroke-width": strokeWidth, "stroke-linecap": "square", ...extra
    }));
    line("#17151b", width + 6);
    line(base, width);
    line("#17151b", Math.max(5, width * .42));
    const offset = width * .29;
    group.append(svgElement("line", {
      x1: x1 + nx * offset, y1: y1 + ny * offset, x2: x2 + nx * offset, y2: y2 + ny * offset,
      stroke: edge, "stroke-width": Math.max(1.5, width * .07), "stroke-linecap": "square", opacity: ".96"
    }));
  }
  const assetById = (id) => catalog.assets.find((asset) => asset.id === id);
  const colliderOf = (item) => item.collider || assetById(item.assetId)?.collider || null;
  const frameFor = (index) => settings.player.sprite.frames[index];

  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = "block";
  }

  async function getJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
    return response.json();
  }

  function fitViewport() {
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    if (!width || !height || !mapData) return;
    const worldHeight = mapData.viewport.worldHeight;
    const worldWidth = worldHeight * width / height;
    svg.setAttribute("viewBox", `${mapData.viewport.centerX - worldWidth / 2} ${mapData.viewport.centerY - worldHeight / 2} ${worldWidth} ${worldHeight}`);
    cameraReady = false;
  }

  function renderWorld() {
    world.replaceChildren();
    const floor = svgElement("g", { id: "room-floor" });
    if (Array.isArray(mapData.floor.regions)) {
      mapData.floor.regions.forEach((region) => {
        floor.append(rectElement(region, `url(#floor-${region.material || "hall"})`));
      });
    } else {
      floor.append(rectElement(mapData.floor, "url(#floor-hall)"));
    }
    const landscape = svgElement("g", { id: "campus-landscape", "aria-hidden": "true" });
    (mapData.landscape || []).forEach((item) => drawLandscape(landscape, item));
    entities = svgElement("g", { id: "world-entities" });
    wallBack = svgElement("g", { id: "world-walls-behind" });
    wallFront = svgElement("g", { id: "world-walls-in-front" });
    depthWalls = [];
    mapData.objects.forEach((item) => {
      const asset = assetById(item.assetId);
      if (!asset) return;
      const image = svgElement("image", {
        href: asset.src, x: item.x, y: item.y, width: item.width, height: item.height,
        preserveAspectRatio: "none", "data-object-id": item.id
      });
      const rotation = Number(item.rotation) || 0;
      if (rotation) image.setAttribute("transform", `rotate(${rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})`);
      const title = svgElement("title"); title.textContent = item.name || asset.name; image.append(title);
      item._node = image;
    });
    player = svgElement("g", { id: "player", "aria-label": "Explorer character" });
    player.append(svgElement("ellipse", { cx: 0, cy: -1, rx: 9, ry: 3.2, fill: "#1c2028", opacity: ".45" }));
    playerSprite = svgElement("svg", { id: "player-sprite", x: -14, y: -50, width: 28, height: 50, viewBox: "0 0 252 453", preserveAspectRatio: "none", overflow: "hidden" });
    const atlasWidth = Math.max(...settings.player.sprite.frames.map((frame) => frame.x + frame.width));
    playerSprite.append(svgElement("image", { href: settings.player.sprite.src, x: 0, y: 0, width: atlasWidth, height: 453, preserveAspectRatio: "none" }));
    player.append(playerSprite);
    if (Array.isArray(mapData.wallSegments) && mapData.wallSegments.length) {
      mapData.wallSegments.forEach((segment) => {
        const group = svgElement("g", { "aria-hidden": "true" });
        const line = { x1: segment.x1, y1: segment.y1, x2: segment.x2, y2: segment.y2 };
        const wallWidth = segment.width || mapData.style?.wallWidth || 26;
        drawWallArt(group, segment, wallWidth);
        // Walls stay on one stable top-down layer. Splitting individual segments
        // around the player caused their depth order to flicker while walking.
        depthWalls.push({ node: group, depthY: Number.NEGATIVE_INFINITY });
      });
    } else {
      mapData.walls.forEach((wall) => {
        const group = svgElement("g");
        group.append(svgElement("path", {
          d: wall.path, fill: "none", stroke: wall.stroke, "stroke-width": wall.width,
          "stroke-linecap": "round", "stroke-linejoin": "round",
          opacity: wall.opacity ?? 1, "stroke-dasharray": wall.dash || "none"
        }));
        depthWalls.push({ node: group, depthY: Number.NEGATIVE_INFINITY });
      });
    }
    (mapData.features || []).forEach((feature) => {
      const group = svgElement("g");
      if (feature.type === "window") drawWindow(group, feature);
      if (feature.type === "entry-door") drawEntryDoor(group, feature);
      if (feature.type === "swing-door") drawSwingDoor(group, feature);
      depthWalls.push({ node: group, depthY: Number.NEGATIVE_INFINITY });
    });
    world.append(floor, landscape, wallBack, entities, wallFront);
    playerState = { ...mapData.playerSpawn, vx: 0, vy: 0, face: 1, walking: false, frameIndex: 0, frameClock: 0 };
    sortEntities(true);
    setFrame(frameFor(settings.player.sprite.idleFrame));
    setPlayerTransform();
    sortWallDepth(true);
  }

  function sortWallDepth(force = false) {
    const behind = [];
    const inFront = [];
    depthWalls.forEach((wall, index) => {
      if (playerState.y < wall.depthY) inFront.push(index);
      else behind.push(index);
    });
    const key = `${behind.join(",")}|${inFront.join(",")}`;
    if (!force && key === lastWallDepthKey) return;
    wallBack.replaceChildren(...behind.map((index) => depthWalls[index].node));
    wallFront.replaceChildren(...inFront.map((index) => depthWalls[index].node));
    lastWallDepthKey = key;
  }

  function drawWindow(layer, feature) {
    const group = svgElement("g", { "aria-hidden": "true" });
    const { x, y, width, height } = feature;
    const wallColor = mapData.style?.wallColor || "#4a2434";
    group.append(rectElement(feature, wallColor, { rx: 4 }));
    group.append(rectElement({ x: x + 4, y: y + 4, width: width - 8, height: height - 8 }, "#78C3FB", { rx: 2 }));
    group.append(rectElement({ x: x + width * 0.48, y: y + 4, width: 4, height: height - 8 }, wallColor));
    group.append(svgElement("path", {
      d: `M${x + 8} ${y + 8}H${x + width * 0.45} M${x + 9} ${y + height - 8}H${x + width - 9}`,
      fill: "none", stroke: "#d2edf0", "stroke-width": 1.6, opacity: 0.68, "stroke-linecap": "round"
    }));
    layer.append(group);
  }

  function drawLandscape(layer, item) {
    const group = svgElement("g");
    if (item.type === "tree") {
      const r = item.size || 36;
      group.append(svgElement("ellipse", { cx: item.x + 4, cy: item.y + r * .58, rx: r * .72, ry: r * .28, fill: "#315b42", opacity: ".28" }));
      group.append(svgElement("path", { d: `M${item.x - r * .12} ${item.y + r * .42}h${r * .24}v${r * .52}h-${r * .24}z`, fill: "#805039", stroke: "#553b36", "stroke-width": 2 }));
      [[-.35,-.2,.68], [.25,-.28,.72], [0,.1,.82], [-.48,.18,.55], [.48,.16,.56]].forEach(([dx,dy,s], i) => {
        group.append(svgElement("circle", { cx: item.x + dx * r, cy: item.y + dy * r, r: r * s, fill: ["#37824b", "#459750", "#56a95b", "#3b9049", "#4b9e50"][i], stroke: "#285d3b", "stroke-width": 2 }));
      });
      group.append(svgElement("ellipse", { cx: item.x - r * .14, cy: item.y - r * .36, rx: r * .22, ry: r * .12, fill: "#89c96a", opacity: ".52" }));
    } else if (item.type === "hedge") {
      const h = item.height || 22;
      group.append(svgElement("rect", { x: item.x, y: item.y, width: item.width, height: h, rx: h / 2, fill: "#397e49", stroke: "#275d3b", "stroke-width": 2 }));
      for (let x = item.x + h * .45; x < item.x + item.width; x += h * .8) group.append(svgElement("circle", { cx: x, cy: item.y + h * .35, r: h * .37, fill: "#5eac58" }));
    } else if (item.type === "fence") {
      group.append(svgElement("line", { x1: item.x, y1: item.y + item.height / 2, x2: item.x + item.width, y2: item.y + item.height / 2, stroke: "#263944", "stroke-width": 3 }));
      for (let x = item.x; x <= item.x + item.width; x += 24) group.append(svgElement("line", { x1: x, y1: item.y, x2: x, y2: item.y + item.height, stroke: "#667d86", "stroke-width": 2 }));
    } else if (item.type === "bench") {
      group.append(rectElement({ x: item.x, y: item.y + 5, width: item.width, height: item.height - 10 }, "#8b6547", { rx: 3, stroke: "#433e43", "stroke-width": 3 }));
      group.append(svgElement("line", { x1: item.x + 8, y1: item.y + 2, x2: item.x + item.width - 8, y2: item.y + 2, stroke: "#c59a65", "stroke-width": 4, "stroke-linecap": "round" }));
    } else if (item.type === "sign") {
      group.append(rectElement(item, "#5f4050", { rx: 4, stroke: "#f0c765", "stroke-width": 3 }));
      const text = svgElement("text", { x: item.x + item.width / 2, y: item.y + item.height * .68, "text-anchor": "middle", fill: "#fff4d3", "font-size": 14, "font-family": "system-ui,sans-serif", "font-weight": 700 });
      text.textContent = item.text || "SCHOOL"; group.append(text);
    }
    layer.append(group);
  }

  function drawEntryDoor(layer, feature) {
    const group = svgElement("g", { "aria-hidden": "true" });
    const { x, y, width, height } = feature;
    if (feature.open) {
      group.append(rectElement({ x, y: y - 5, width: 9, height: height + 10 }, "#292d37", { rx: 2 }));
      group.append(rectElement({ x: x + width - 9, y: y - 5, width: 9, height: height + 10 }, "#292d37", { rx: 2 }));
      group.append(rectElement({ x: x + 12, y: y - height + 3, width: 12, height: height, fill: "#765b48" }, "#765b48", { stroke: "#c6ae85", "stroke-width": 2, rx: 2 }));
      group.append(svgElement("circle", { cx: x + 20, cy: y - height / 2, r: 1.8, fill: "#EF476F" }));
      group.append(rectElement({ x: x - 7, y: y + height + 5, width: width + 14, height: 8 }, "#bfc9d5", { stroke: "#7f91a6", "stroke-width": 2, rx: 2 }));
      layer.append(group);
      return;
    }
    group.append(rectElement({ x: x - 7, y: y - 4, width: width + 14, height: height + 11 }, "#292d37", { rx: 5 }));
    group.append(rectElement({ x, y, width, height }, "#765b48", { rx: 3, stroke: "#c6ae85", "stroke-width": 3 }));
    group.append(svgElement("path", { d: `M${x + width / 2} ${y + 3}V${y + height - 3}`, stroke: "#3b332f", "stroke-width": 2 }));
    group.append(svgElement("circle", { cx: x + width * 0.42, cy: y + height / 2, r: 2.8, fill: "#EF476F" }));
    group.append(rectElement({ x: x - 13, y: y + height + 7, width: width + 26, height: 15 }, "#777d87", { stroke: "#424750", "stroke-width": 3, rx: 2 }));
    layer.append(group);
  }

  function drawSwingDoor(layer, feature) {
    const group = svgElement("g", { "aria-hidden": "true" });
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
    const wall = mapData.style?.wallColor || "#4a2434";
    const wood = feature.color || "#bd784b";
    const jamb = 12;
    if (horizontal) {
      group.append(rectElement({ x: feature.x - jamb / 2, y: feature.y - 12, width: jamb, height: 24 }, wall, { rx: 2 }));
      group.append(rectElement({ x: feature.x + openingWidth - jamb / 2, y: feature.y - 12, width: jamb, height: 24 }, wall, { rx: 2 }));
    } else {
      const openingHeight = openingWidth;
      group.append(rectElement({ x: feature.x - 12, y: feature.y - jamb / 2, width: 24, height: jamb }, wall, { rx: 2 }));
      group.append(rectElement({ x: feature.x - 12, y: feature.y + openingHeight - jamb / 2, width: 24, height: jamb }, wall, { rx: 2 }));
    }
    group.append(svgElement("line", { x1: hinge.x, y1: hinge.y, x2: open.x, y2: open.y, stroke: wall, "stroke-width": 11, "stroke-linecap": "square" }));
    group.append(svgElement("line", { x1: hinge.x, y1: hinge.y, x2: open.x, y2: open.y, stroke: wood, "stroke-width": 7, "stroke-linecap": "square" }));
    const grainOffset = horizontal ? 2 : 2;
    group.append(svgElement("line", {
      x1: hinge.x + grainOffset, y1: hinge.y, x2: open.x + grainOffset, y2: open.y,
      stroke: "#e5b17b", "stroke-width": 1.1, opacity: ".85"
    }));
    group.append(svgElement("circle", { cx: hinge.x, cy: hinge.y, r: 3.5, fill: "#e7bf86", stroke: wall, "stroke-width": 1.2 }));
    layer.append(group);
  }

  function sortEntities(force = false) {
    const objects = mapData.objects.filter((item) => item._node).sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    let playerIndex = objects.findIndex((item) => {
      const asset = assetById(item.assetId);
      return playerState.y < (item.depth ?? item.y + item.height * (asset?.depthAnchor ?? 0.9));
    });
    if (playerIndex < 0) playerIndex = objects.length;
    objects.splice(playerIndex, 0, player);
    const ordered = objects;
    const key = ordered.map((item) => item === player ? "player" : item.id).join("|");
    if (force || key !== lastEntityOrder) {
      ordered.forEach((item) => entities.append(item === player ? player : item._node));
      lastEntityOrder = key;
    }
  }

  function setFrame(frame) {
    const scale = settings.player.sprite.displayHeight / 453;
    const width = frame.width * scale;
    const height = frame.height * scale;
    playerSprite.setAttribute("x", String(-width / 2));
    playerSprite.setAttribute("y", String(-height));
    playerSprite.setAttribute("width", String(width));
    playerSprite.setAttribute("height", String(height));
    playerSprite.setAttribute("viewBox", `${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
  }

  function setPlayerTransform() {
    player.setAttribute("transform", `translate(${playerState.x.toFixed(2)} ${playerState.y.toFixed(2)}) scale(${playerState.face} 1)`);
  }

  function transformColliderPoint(item, point) {
    const center = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
    const local = { x: item.x + point[0] * item.width, y: item.y + point[1] * item.height };
    const radians = (Number(item.rotation) || 0) * Math.PI / 180;
    const dx = local.x - center.x; const dy = local.y - center.y;
    return { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
  }

  function circleTouchesPolygon(cx, cy, radius, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]; const b = polygon[j];
      if ((a.y > cy) !== (b.y > cy) && cx < ((b.x - a.x) * (cy - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / lengthSquared)) : 0;
      const px = a.x + t * dx; const py = a.y + t * dy;
      if ((cx - px) ** 2 + (cy - py) ** 2 < radius ** 2) return true;
    }
    return inside;
  }

  function canOccupy(x, y) {
    const body = settings.player.collision;
    const bounds = mapData.bounds;
    const cy = y - body.footOffset;
    if (Array.isArray(mapData.walkable) && mapData.walkable.length) {
      const insideFloor = (px, py) => mapData.walkable.some((region) =>
        px >= region.x && px <= region.x + region.width && py >= region.y && py <= region.y + region.height
      );
      if (!insideFloor(x, cy)) return false;
      for (let sample = 0; sample < 64; sample += 1) {
        const angle = (sample / 64) * Math.PI * 2;
        if (!insideFloor(x + Math.cos(angle) * body.radius, cy + Math.sin(angle) * body.radius)) return false;
      }
      for (const wall of mapData.wallSegments || []) {
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared ? Math.max(0, Math.min(1, ((x - wall.x1) * dx + (cy - wall.y1) * dy) / lengthSquared)) : 0;
        const nearestX = wall.x1 + t * dx;
        const nearestY = wall.y1 + t * dy;
        const reach = body.radius + (wall.width || mapData.style?.wallWidth || 25) / 2;
        if ((x - nearestX) ** 2 + (cy - nearestY) ** 2 <= reach ** 2) return false;
      }
    } else {
      const door = mapData.doorway;
      const wallHalf = (mapData.walls[0]?.width || 0) / 2;
      if (x < bounds.left + wallHalf + body.radius || x > bounds.right - wallHalf - body.radius || cy < bounds.top + wallHalf + body.radius) return false;
      if (door && cy > door.top) {
        const withinDoor = x > door.left + body.radius + 2 && x < door.right - body.radius - 2;
        if (!withinDoor || cy > door.bottom) return false;
      }
    }
    for (const item of mapData.objects) {
      const collider = colliderOf(item);
      if (!collider || collider.type !== "polygon" || collider.points?.length < 3) continue;
      const polygon = collider.points.map((point) => transformColliderPoint(item, point));
      if (circleTouchesPolygon(x, cy, body.radius, polygon)) return false;
    }
    return true;
  }

  function updateCamera(dt) {
    const view = svg.viewBox.baseVal;
    const centerX = view.x + view.width / 2; const centerY = view.y + view.height / 2;
    const zoom = settings.camera.zoom; const bounds = mapData.bounds;
    let targetX = centerX - playerState.x * zoom; let targetY = centerY - playerState.y * zoom;
    const minX = view.x + view.width - bounds.right * zoom; const maxX = view.x - bounds.left * zoom;
    const minY = view.y + view.height - bounds.bottom * zoom; const maxY = view.y - bounds.top * zoom;
    targetX = minX > maxX ? centerX - (bounds.left + bounds.right) / 2 * zoom : Math.max(minX, Math.min(maxX, targetX));
    targetY = minY > maxY ? centerY - (bounds.top + bounds.bottom) / 2 * zoom : Math.max(minY, Math.min(maxY, targetY));
    if (!cameraReady) { cameraX = targetX; cameraY = targetY; cameraReady = true; }
    else {
      const follow = 1 - Math.exp(-settings.camera.ease * dt);
      cameraX += (targetX - cameraX) * follow; cameraY += (targetY - cameraY) * follow;
    }
    world.setAttribute("transform", `translate(${cameraX.toFixed(2)} ${cameraY.toFixed(2)}) scale(${zoom})`);
  }

  function keyboardVector() {
    let x = 0; let y = 0;
    if (input.keys.has("ArrowLeft") || input.keys.has("a")) x -= 1;
    if (input.keys.has("ArrowRight") || input.keys.has("d")) x += 1;
    if (input.keys.has("ArrowUp") || input.keys.has("w")) y -= 1;
    if (input.keys.has("ArrowDown") || input.keys.has("s")) y += 1;
    const length = Math.hypot(x, y);
    if (length) return { x: x / length, y: y / length };
    const stickLength = Math.hypot(input.x, input.y);
    if (stickLength > 0.06) return { x: input.x, y: input.y };
    if (input.destination) {
      const dx = input.destination.x - playerState.x; const dy = input.destination.y - playerState.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 4) { input.destination = null; return { x: 0, y: 0 }; }
      const intensity = Math.min(1, distance / 55);
      return { x: dx / distance * intensity, y: dy / distance * intensity };
    }
    return { x: 0, y: 0 };
  }

  function update(dt, timestamp) {
    const movement = settings.player.movement;
    const move = keyboardVector(); const length = Math.hypot(move.x, move.y);
    if (length > 0.06) {
      const intensity = Math.min(1, length); const nx = move.x / length; const ny = move.y / length;
      playerState.vx += nx * movement.acceleration * intensity * dt;
      playerState.vy += ny * movement.acceleration * intensity * dt;
      const speed = Math.hypot(playerState.vx, playerState.vy); const targetSpeed = movement.maximumSpeed * intensity;
      if (speed > targetSpeed) { const scale = targetSpeed / speed; playerState.vx *= scale; playerState.vy *= scale; }
    } else {
      const friction = Math.exp(-movement.drag * dt); playerState.vx *= friction; playerState.vy *= friction;
      if (Math.hypot(playerState.vx, playerState.vy) < 2) playerState.vx = playerState.vy = 0;
    }
    const oldX = playerState.x; const oldY = playerState.y;
    const nextX = oldX + playerState.vx * dt;
    if (canOccupy(nextX, oldY)) playerState.x = nextX;
    else { playerState.vx = 0; if (input.destination) input.destination = null; }
    const nextY = oldY + playerState.vy * dt;
    if (canOccupy(playerState.x, nextY)) playerState.y = nextY;
    else { playerState.vy = 0; if (input.destination) input.destination = null; }

    const velocity = Math.hypot(playerState.vx, playerState.vy); const walking = velocity > 7 && settings.player.sprite.walkingEnabled;
    if (Math.abs(playerState.vx) > 2) playerState.face = playerState.vx < 0 ? -1 : 1;
    if (walking !== playerState.walking) {
      playerState.walking = walking; playerState.frameIndex = 0; playerState.frameClock = timestamp;
      setFrame(frameFor(walking ? settings.player.sprite.walkFrames[0] : settings.player.sprite.idleFrame));
    }
    if (walking) {
      const duration = 1000 / settings.player.sprite.walkFps;
      if (timestamp - playerState.frameClock >= duration) {
        const steps = Math.floor((timestamp - playerState.frameClock) / duration);
        playerState.frameClock += steps * duration;
        playerState.frameIndex = (playerState.frameIndex + steps) % settings.player.sprite.walkFrames.length;
        setFrame(frameFor(settings.player.sprite.walkFrames[playerState.frameIndex]));
      }
    }
    setPlayerTransform(); sortEntities(); sortWallDepth(); updateCamera(dt);
  }

  function setStickFromEvent(event) {
    const rect = stick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2; const centerY = rect.top + rect.height / 2;
    const maxTravel = (rect.width - knob.offsetWidth) / 2;
    let dx = event.clientX - centerX; let dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance > maxTravel) { dx = dx / distance * maxTravel; dy = dy / distance * maxTravel; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`; input.x = dx / maxTravel; input.y = dy / maxTravel;
  }

  async function start() {
    [mapData, settings, catalog] = await Promise.all([
      getJson("maps/room-01/map.json"), getJson("game-settings.json"), getJson("assets/asset-manifest.json")
    ]);
    mapData.playerSpawn = settings.player.spawn;
    renderWorld(); fitViewport();
    window.addEventListener("resize", fitViewport, { passive: true });
    requestAnimationFrame(loop);
  }

  function loop(now) {
    const dt = Math.min((now - (previousTime || now)) / 1000, 0.04);
    previousTime = now; update(dt, now); requestAnimationFrame(loop);
  }

  stick.addEventListener("pointerdown", (event) => { input.pointerId = event.pointerId; input.destination = null; stick.setPointerCapture(event.pointerId); setStickFromEvent(event); event.preventDefault(); });
  stick.addEventListener("pointermove", (event) => { if (event.pointerId === input.pointerId) setStickFromEvent(event); });
  function resetStick(event) { if (event.pointerId !== input.pointerId) return; input.pointerId = null; input.x = 0; input.y = 0; knob.style.transform = "translate(0, 0)"; }
  stick.addEventListener("pointerup", resetStick); stick.addEventListener("pointercancel", resetStick);
  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !player) return;
    const matrix = world.getScreenCTM(); if (!matrix) return;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const destination = point.matrixTransform(matrix.inverse()); input.destination = { x: destination.x, y: destination.y };
    input.keys.clear(); event.preventDefault();
  });
  window.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"].includes(key)) { input.keys.add(key); input.destination = null; event.preventDefault(); }
  });
  window.addEventListener("keyup", (event) => { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; input.keys.delete(key); });
  window.addEventListener("blur", () => { input.keys.clear(); input.x = 0; input.y = 0; knob.style.transform = "translate(0, 0)"; });

  start().catch((error) => showError(`${error.message} Open the prototype through a local web server (for example, http://localhost:4173/gameforcouples/prototype/) so the JSON files can load.`));
})();
