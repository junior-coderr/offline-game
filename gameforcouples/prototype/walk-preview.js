(() => {
  const animation = {
    imagePath: "assets/explorer-walk-atlas.webp",
    fps: 6,
    frames: [
      { name: "Frame 01", x: 0, y: 0, width: 252, height: 453 },
      { name: "Frame 03", x: 252, y: 0, width: 252, height: 453 },
      { name: "Frame 03", x: 504, y: 0, width: 252, height: 453 },
      { name: "Frame 04", x: 756, y: 0, width: 259, height: 453 },
      { name: "Frame 05", x: 1015, y: 0, width: 256, height: 450 }
    ]
  };
  const canvas = document.getElementById("character");
  const context = canvas.getContext("2d");
  const image = new Image();
  const strip = document.getElementById("frame-strip");
  const caption = document.getElementById("frame-caption");
  const playButton = document.getElementById("play");
  const speed = document.getElementById("speed");
  const speedValue = document.getElementById("speed-value");
  let index = 0;
  let fps = animation.fps;
  let playing = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastStep = 0;

  function draw() {
    const frame = animation.frames[index];
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(49,57,49,.12)";
    context.beginPath();
    context.ellipse(canvas.width / 2, 418, 78, 13, 0, 0, Math.PI * 2);
    context.fill();
    const maxWidth = Math.max(...animation.frames.map((item) => item.width));
    const maxHeight = Math.max(...animation.frames.map((item) => item.height));
    const scale = Math.min(0.82, 280 / maxWidth, 360 / maxHeight);
    const width = frame.width * scale;
    const height = frame.height * scale;
    const x = (canvas.width - width) / 2;
    const y = 400 - height;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, frame.x, frame.y, frame.width, frame.height, x, y, width, height);
    caption.textContent = `Pose ${String(index + 1).padStart(2, "0")} of ${animation.frames.length} · ${frame.name} · ${frame.width} × ${frame.height} px`;
    [...strip.children].forEach((chip, chipIndex) => chip.classList.toggle("active", chipIndex === index));
    playButton.textContent = playing ? "Ⅱ Pause" : "▶ Play";
  }

  function tick(time) {
    if (playing && time - lastStep >= 1000 / fps) {
      index = (index + 1) % animation.frames.length;
      lastStep = time;
      draw();
    }
    requestAnimationFrame(tick);
  }

  animation.frames.forEach((frame, frameIndex) => {
    const button = document.createElement("button");
    button.className = "frame-chip";
    button.type = "button";
    button.textContent = `#${frameIndex + 1}`;
    button.title = `${frame.name}: ${frame.width} × ${frame.height}px`;
    button.setAttribute("aria-label", `Show frame ${frameIndex + 1}, ${frame.name}`);
    button.addEventListener("click", () => { index = frameIndex; playing = false; draw(); });
    strip.append(button);
  });
  document.getElementById("previous").addEventListener("click", () => { index = (index + animation.frames.length - 1) % animation.frames.length; draw(); });
  document.getElementById("next").addEventListener("click", () => { index = (index + 1) % animation.frames.length; draw(); });
  playButton.addEventListener("click", () => { playing = !playing; lastStep = 0; draw(); });
  speed.addEventListener("input", () => { fps = Number(speed.value); speedValue.textContent = `${fps} fps`; });
  speed.value = String(fps);
  speedValue.textContent = `${fps} fps`;
  image.onload = () => { draw(); requestAnimationFrame(tick); };
  image.onerror = () => { caption.textContent = "Could not load the packed character frames."; };
  image.src = animation.imagePath;
})();
