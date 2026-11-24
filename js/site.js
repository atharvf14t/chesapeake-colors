(() => {
  const HOLD = [1.1, 0.5, 0.5, 0.5, 0.5, 0.55, 0.9, 0.6, 0.6, 1];
  const MOVE = [1.4, 1.7, 1.7, 1.7, 1.5, 1.4, 1.5, 1.4, 1.5];
  const LABELS = ["Day", "Crew", "Install", "Gutters", "Peaks", "Trim", "Lights on", "Detail", "Color", "Yours"];
  const LAST = HOLD.length - 1;
  const segments = [];
  HOLD.forEach((len, k) => {
    segments.push({ kind: "hold", k, len });
    if (k < MOVE.length) segments.push({ kind: "move", k, len: MOVE[k] });
  });
  const TOTAL = segments.reduce((sum, seg) => sum + seg.len, 0);

  const VARIANTS = {
    lg: { frames: 673, stops: [0, 78, 157, 244, 331, 410, 471, 532, 594, 672], w: 1440, h: 810, dir: "lg" },
    sm: { frames: 690, stops: [0, 78, 157, 244, 331, 410, 471, 550, 611, 689], w: 720, h: 1280, dir: "sm" },
  };

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const smooth = (t) => t * t * (3 - 2 * t);
  const near = (value, target) => clamp(1 - Math.abs(value - target) / 0.28);

  const section = document.getElementById("top");
  const canvas = document.getElementById("hero-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const title = document.getElementById("hero-title");
  const watchMobile = document.getElementById("watch-mobile");
  const shadeMobile = document.getElementById("shade-mobile");
  const glowLine = document.getElementById("glow-line");
  const finale = document.getElementById("finale");
  const snow = document.getElementById("snow");
  const frameNum = document.getElementById("frame-num");
  const caps = [...document.querySelectorAll("[data-cap]")];

  const bulbHost = document.getElementById("bulbs");
  const labelHost = document.getElementById("scrub-labels");
  const bulbEls = [];
  const bulbFrac = [];
  for (let s = 0; s < 28; s++) {
    const frac = Math.round((s / 27) * 10000) / 10000;
    const wave = 2 + 5 * Math.sin(4 * frac * Math.PI) ** 2;
    const top = Math.round((1.6 * wave + 2) * 100) / 100;
    const el = document.createElement("span");
    el.className = "bulb";
    el.style.left = `calc(${100 * frac}% - 5.5px)`;
    el.style.top = `${top}px`;
    bulbHost.appendChild(el);
    bulbEls.push(el);
    bulbFrac.push(frac);
  }
  const labelEls = LABELS.map((name, index) => {
    const el = document.createElement("span");
    el.textContent = name;
    el.className = index === 0 ? "start" : index === LAST ? "end" : "mid";
    labelHost.appendChild(el);
    return el;
  });

  const rand = (n, salt) => {
    const x = Math.sin(12.9898 * n + 78.233 * salt) * 43758.5453;
    return ((x % 1) + 1) % 1;
  };
  for (let n = 0; n < 46; n++) {
    const flake = document.createElement("span");
    flake.className = "flake";
    const size = Math.round((1.2 + 2.6 * rand(n, 2)) * 100) / 100;
    flake.style.left = `${Math.round(100 * rand(n, 1) * 100) / 100}%`;
    flake.style.width = `${size}px`;
    flake.style.height = `${size}px`;
    flake.style.opacity = String(Math.round((0.35 + 0.5 * rand(n, 6)) * 100) / 100);
    flake.style.setProperty("--t", `${Math.round((9 + 9 * rand(n, 3)) * 100) / 100}s`);
    flake.style.setProperty("--d", `${Math.round(-18 * rand(n, 4) * 100) / 100}s`);
    flake.style.setProperty("--dx", `${Math.round((rand(n, 5) - 0.5) * 80 * 100) / 100}px`);
    snow.appendChild(flake);
  }

  const caches = { lg: [], sm: [] };
  let variant = null;
  let images = [];
  let loaded = false;
  let targetFrame = 0;
  let shownFrame = 0;
  let drawn = -1;
  let playing = null;
  let lastTime = 0;

  function loadOrder(count, stops) {
    const seen = new Set(stops);
    const order = [...stops];
    for (const step of [8, 4, 2, 1]) {
      for (let i = 0; i < count; i += step) {
        if (!seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      }
    }
    return order;
  }

  function ensureVariant(next) {
    if (variant === next && loaded) return;
    variant = next;
    images = caches[next.dir];
    if (!images.length) images.length = next.frames;
    caches[next.dir] = images;
    loaded = true;
    drawn = -1;
    const order = loadOrder(next.frames, next.stops);
    let cursor = 0;
    const pump = () => {
      if (variant !== next) return;
      while (cursor < order.length && activeLoads < 6) {
        const index = order[cursor++];
        if (images[index]) continue;
        activeLoads++;
        const img = new Image();
        img.decoding = "async";
        const finish = () => {
          activeLoads--;
          if (variant === next) {
            images[index] = img.naturalWidth ? img : images[index];
            drawn = -1;
          }
          pump();
        };
        img.onload = finish;
        img.onerror = () => {
          activeLoads--;
          pump();
        };
        img.src = `build/hero/${next.dir}/${String(index + 1).padStart(4, "0")}.webp`;
      }
    };
    pump();
  }
  let activeLoads = 0;

  function resizeCanvas() {
    const spec = variant || VARIANTS.lg;
    const dpr = window.devicePixelRatio || 1;
    const cover = Math.max(canvas.clientWidth / spec.w, canvas.clientHeight / spec.h);
    const scale = Math.min(dpr, cover > 0 ? 1 / cover : dpr);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
    ctx.imageSmoothingQuality = "high";
    drawn = -1;
  }

  function posFromUnits(units) {
    const value = clamp(units, 0, TOTAL);
    let cursor = 0;
    for (const seg of segments) {
      if (value <= cursor + seg.len) {
        if (seg.kind === "hold") return seg.k;
        return seg.k + smooth((value - cursor) / seg.len);
      }
      cursor += seg.len;
    }
    return LAST;
  }

  function frameFromPos(pos, stops) {
    const index = Math.min(Math.floor(pos), stops.length - 2);
    return stops[index] + (stops[index + 1] - stops[index]) * (pos - index);
  }

  function posFromFrame(frame, stops) {
    let index = 0;
    while (index < stops.length - 2 && frame >= stops[index + 1]) index++;
    return Math.min(LAST, index + (frame - stops[index]) / Math.max(1, stops[index + 1] - stops[index]));
  }

  function unitsForPos(pos) {
    const chapter = Math.min(Math.floor(pos), LAST);
    let cursor = 0;
    for (const seg of segments) {
      if (seg.kind === "hold" && seg.k === chapter && pos === chapter) return cursor + seg.len * 0.5;
      if (seg.kind === "move" && seg.k === chapter) {
        const target = pos - chapter;
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) / 2;
          if (smooth(mid) < target) lo = mid;
          else hi = mid;
        }
        return cursor + seg.len * lo;
      }
      cursor += seg.len;
    }
    return TOTAL;
  }

  function nearestImage(index) {
    if (images[index]) return images[index];
    for (let step = 1; step < images.length; step++) {
      if (images[index - step]) return images[index - step];
      if (images[index + step]) return images[index + step];
    }
    return null;
  }

  function drawFrame(frame) {
    const rounded = Math.round(frame);
    if (rounded === drawn) return;
    const base = Math.floor(frame);
    const img = frame - base > 0.5 && images[base + 1] ? images[base + 1] : nearestImage(base);
    if (!img) return;
    drawn = rounded;
    const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }

  function paint(pos, text) {
    const open = near(text, 0);
    title.style.opacity = open;
    title.style.transform = `translateY(${-(1 - open) * 24}px)`;
    title.style.pointerEvents = open > 0.5 ? "auto" : "none";
    watchMobile.style.opacity = open;
    watchMobile.style.pointerEvents = open > 0.5 ? "auto" : "none";
    shadeMobile.style.opacity = open;

    const glow = clamp(1 - Math.abs(text - 6) / 0.4);
    glowLine.style.opacity = glow;
    glowLine.style.transform = `scale(${0.96 + 0.04 * glow})`;

    const end = clamp((text - 8.55) / 0.45);
    finale.style.opacity = end;
    finale.style.transform = `translateY(${(1 - end) * 20}px)`;
    finale.style.pointerEvents = end > 0.6 ? "auto" : "none";

    caps.forEach((cap) => {
      const amount = near(text, Number(cap.dataset.cap));
      cap.style.opacity = amount;
      cap.style.transform = `translateY(${(1 - amount) * 18}px)`;
    });

    const flurry = clamp((pos - 5.4) / 0.6) * clamp((7.2 - pos) / 0.5);
    snow.style.opacity = flurry;

    const along = pos / LAST;
    const colorMix = clamp((pos - 7.1) / 0.9);
    const palette = ["#ff3b3b", "#2fd36b", "#3b7bff", "#ffb13b"];
    const rounded = Math.round(pos);
    bulbEls.forEach((el, index) => {
      const frac = bulbFrac[index];
      el.classList.toggle("off", frac > along + 0.001);
      el.style.setProperty("--c", frac < colorMix ? palette[index % 4] : "#ffc978");
    });
    labelEls.forEach((el, index) => el.classList.toggle("on", index === rounded));
    frameNum.textContent = String(rounded).padStart(2, "0");
  }

  function stopPlay() {
    playing = null;
  }

  function startPlay() {
    const spec = variant || VARIANTS.lg;
    let frame = Math.round(Math.max(0, shownFrame));
    if (frame >= spec.frames - 2) frame = 0;
    playing = { f: frame };
    const cancel = () => {
      stopPlay();
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("keydown", cancel);
    };
    setTimeout(() => {
      window.addEventListener("wheel", cancel, { once: true, passive: true });
      window.addEventListener("touchstart", cancel, { once: true, passive: true });
      window.addEventListener("keydown", cancel, { once: true });
    }, 0);
  }

  document.querySelectorAll("[data-play]").forEach((button) => {
    button.addEventListener("click", startPlay);
  });

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = lastTime ? Math.min(64, now - lastTime) : 16.7;
    lastTime = now;

    const next = window.innerWidth / window.innerHeight < 0.9 ? VARIANTS.sm : VARIANTS.lg;
    if (!variant || variant.dir !== next.dir) {
      ensureVariant(next);
      resizeCanvas();
    }

    const top = section.getBoundingClientRect().top + window.scrollY;
    const unit = section.offsetHeight / (TOTAL + 1);
    let pos;
    let text;

    if (playing) {
      playing.f = Math.min(variant.frames - 1, playing.f + (dt / 1000) * 18);
      targetFrame = shownFrame = playing.f;
      pos = posFromFrame(playing.f, variant.stops);
      const chapter = Math.floor(pos);
      const frac = pos - chapter;
      text = frac < 0.7 ? chapter : chapter + smooth((frac - 0.7) / 0.3);
      const y = top + unitsForPos(pos) * unit;
      window.scrollTo(0, y);
      if (playing.f >= variant.frames - 1) playing = null;
    } else {
      const units = clamp((window.scrollY - top) / unit, 0, TOTAL);
      pos = posFromUnits(units);
      text = pos;
      targetFrame = frameFromPos(pos, variant.stops);
      const blend = 1 - Math.exp(-dt / 28);
      shownFrame += (targetFrame - shownFrame) * blend;
      if (Math.abs(targetFrame - shownFrame) < 0.002) shownFrame = targetFrame;
    }

    drawFrame(clamp(shownFrame, 0, variant.frames - 1));
    paint(pos, text);
  }

  let width = window.innerWidth;
  let height = window.innerHeight;
  window.addEventListener("resize", () => {
    if (window.innerWidth === width && Math.abs(window.innerHeight - height) < 120) return;
    width = window.innerWidth;
    height = window.innerHeight;
    resizeCanvas();
  });

  ensureVariant(window.innerWidth / window.innerHeight < 0.9 ? VARIANTS.sm : VARIANTS.lg);
  resizeCanvas();
  paint(0, 0);
  requestAnimationFrame(tick);

  const LOOKS = [
    { id: "warm", name: "Classic Warm", note: "2700K, the timeless candlelight look.", bulbs: ["#ffc978"], img: "warm" },
    { id: "multi", name: "Retro Multi", note: "Red, green, blue, amber: the one you grew up with.", bulbs: ["#ff3b3b", "#2fd36b", "#3b7bff", "#ffb13b"], img: "multi" },
    { id: "cool", name: "Winter White", note: "Crisp 5000K pure white, icy and modern.", bulbs: ["#e9f3ff"], img: "cool" },
    { id: "candy", name: "Candy Cane", note: "Alternating red and white.", bulbs: ["#ff3040", "#fff4ea"], img: "candy" },
    { id: "gameday", name: "Game Day", note: "Purple and gold. Sundays in Baltimore.", bulbs: ["#8a3dff", "#ffc23b"], img: "gameday" },
    { id: "bay", name: "Chesapeake Blue", note: "Cool blue and white, like the Bay after dark.", bulbs: ["#2f7bff", "#e9f3ff"], img: "bay" },
  ];

  const stage = document.getElementById("stage");
  const lookName = document.getElementById("look-name");
  const lookNote = document.getElementById("look-note");
  const lookCount = document.getElementById("look-count");
  const phonePhoto = document.getElementById("phone-photo");
  const lookButtons = [];
  const sceneButtons = [];
  LOOKS.forEach((look, index) => {
    const img = document.createElement("img");
    img.src = `looks/${look.img}.webp`;
    img.alt = `The house lit in ${look.name}`;
    if (index === 0) img.className = "on";
    stage.appendChild(img);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "look" + (index === 0 ? " on" : "");
    button.setAttribute("aria-pressed", index === 0 ? "true" : "false");
    const bulbs = document.createElement("span");
    bulbs.className = "look-bulbs";
    for (let n = 0; n < 4; n++) {
      const bulb = document.createElement("span");
      bulb.className = "bulb";
      bulb.style.setProperty("--c", look.bulbs[n % look.bulbs.length]);
      bulbs.appendChild(bulb);
    }
    const label = document.createElement("span");
    label.className = "spec";
    label.textContent = look.name;
    button.append(bulbs, label);
    button.addEventListener("click", () => choose(index, true));
    document.getElementById("looks").appendChild(button);
    lookButtons.push(button);

    const scene = document.createElement("button");
    scene.type = "button";
    scene.className = "scene" + (index === 0 ? " on" : "");
    const dots = document.createElement("span");
    dots.className = "scene-dots";
    look.bulbs.slice(0, 4).forEach((color) => {
      const dot = document.createElement("i");
      dot.style.background = color;
      dot.style.boxShadow = `0 0 6px ${color}`;
      dots.appendChild(dot);
    });
    scene.append(look.name, dots);
    scene.addEventListener("click", () => choose(index, true));
    document.getElementById("scenes").appendChild(scene);
    sceneButtons.push(scene);
  });

  const stageImages = [...stage.querySelectorAll("img")];
  let lookIndex = 0;
  let autoLooks = true;
  function choose(index, manual) {
    if (manual) autoLooks = false;
    lookIndex = index;
    const look = LOOKS[index];
    stageImages.forEach((img, i) => img.classList.toggle("on", i === index));
    lookButtons.forEach((button, i) => {
      button.classList.toggle("on", i === index);
      button.setAttribute("aria-pressed", i === index ? "true" : "false");
    });
    sceneButtons.forEach((button, i) => button.classList.toggle("on", i === index));
    lookName.textContent = look.name;
    lookNote.textContent = look.note;
    lookCount.textContent = `${String(index + 1).padStart(2, "0")} / 06`;
    phonePhoto.src = `looks/${look.img}.webp`;
  }
  setInterval(() => {
    if (autoLooks) choose((lookIndex + 1) % LOOKS.length, false);
  }, 3200);

  const faqItems = [...document.querySelectorAll(".faq-item")];
  function setFaq(open) {
    faqItems.forEach((item, index) => {
      const on = index === open;
      const body = item.querySelector(".faq-body");
      const bulb = item.querySelector(".bulb");
      body.style.gridTemplateRows = on ? "1fr" : "0fr";
      body.querySelector("p").style.paddingBottom = on ? "20px" : "0";
      bulb.classList.toggle("off", !on);
    });
  }
  setFaq(0);
  faqItems.forEach((item, index) => {
    item.querySelector("button").addEventListener("click", () => {
      const open = item.querySelector(".faq-body").style.gridTemplateRows === "1fr";
      setFaq(open ? -1 : index);
    });
  });

  const form = document.getElementById("quote-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const thanks = document.createElement("div");
    thanks.className = "thanks";
    thanks.innerHTML = '<span class="bulb" style="--c:#ffc978"></span><h3 class="display">You\'re on the list.</h3><p>We\'ll be in touch within one business day with your design and quote.</p>';
    form.replaceWith(thanks);
  });
})();
