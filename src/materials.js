import * as THREE from "three";

const TAU = Math.PI * 2;

function hashSeed(value) {
  const input = String(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvas(width = 512, height = width) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("Procedural theater textures require a browser canvas.");
}

function context2d(canvas) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Unable to create a 2D canvas context.");
  return context;
}

function resolveAnisotropy(renderer, requested = 8) {
  const maximum = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
  return Math.max(1, Math.min(requested, maximum));
}

function canvasTexture(canvas, options = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = options.name ?? "procedural-texture";
  texture.colorSpace = options.colorSpace === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.wrapS = options.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.wrapT = options.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.repeat.set(options.repeat?.[0] ?? 1, options.repeat?.[1] ?? 1);
  texture.anisotropy = options.anisotropy ?? 1;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function makeNoiseCanvas({ size = 256, seed, base = "#777777", spread = 24, density = 0.22 }) {
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom(seed);
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);

  const image = context.getImageData(0, 0, size, size);
  const data = image.data;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (random() > density) continue;
    const delta = Math.round((random() - 0.5) * spread);
    data[offset] = Math.max(0, Math.min(255, data[offset] + delta));
    data[offset + 1] = Math.max(0, Math.min(255, data[offset + 1] + delta));
    data[offset + 2] = Math.max(0, Math.min(255, data[offset + 2] + delta));
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function createCarpetCanvas() {
  const size = 512;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom("mililani-carpet-v1");

  context.fillStyle = "#15151a";
  context.fillRect(0, 0, size, size);

  for (let index = 0; index < 15000; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = 0.8 + random() * 2.4;
    const palette = ["#242532", "#31232d", "#101b25", "#3c2229", "#26282b"];
    context.strokeStyle = palette[Math.floor(random() * palette.length)];
    context.globalAlpha = 0.26 + random() * 0.42;
    context.lineWidth = 0.35 + random() * 0.7;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (random() - 0.5) * length, y + length);
    context.stroke();
  }

  context.globalAlpha = 0.32;
  context.lineWidth = 1.25;
  for (let band = -size; band < size * 2; band += 76) {
    context.strokeStyle = band % 152 === 0 ? "#742932" : "#243849";
    context.beginPath();
    context.moveTo(band, 0);
    context.bezierCurveTo(band + 76, 140, band - 18, 340, band + 82, size);
    context.stroke();
  }

  for (let index = 0; index < 190; index += 1) {
    context.fillStyle = random() > 0.48 ? "#a54043" : "#3d6271";
    context.globalAlpha = 0.16 + random() * 0.22;
    context.beginPath();
    context.arc(random() * size, random() * size, 0.35 + random() * 1.1, 0, TAU);
    context.fill();
  }
  context.globalAlpha = 1;
  return canvas;
}

function createTileCanvas() {
  const size = 512;
  const tileSize = 128;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom("lobby-porcelain-tile-v1");

  context.fillStyle = "#8d8a82";
  context.fillRect(0, 0, size, size);

  for (let row = 0; row < size / tileSize; row += 1) {
    for (let column = 0; column < size / tileSize; column += 1) {
      const x = column * tileSize + 3;
      const y = row * tileSize + 3;
      const shade = 199 + Math.floor(random() * 13);
      context.fillStyle = `rgb(${shade + 4}, ${shade + 2}, ${shade - 3})`;
      context.fillRect(x, y, tileSize - 6, tileSize - 6);

      context.save();
      context.beginPath();
      context.rect(x, y, tileSize - 6, tileSize - 6);
      context.clip();
      for (let vein = 0; vein < 10; vein += 1) {
        context.strokeStyle = random() > 0.5 ? "#aaa9a3" : "#e4e0d5";
        context.globalAlpha = 0.08 + random() * 0.12;
        context.lineWidth = 0.5 + random() * 1.2;
        const startY = y + random() * tileSize;
        context.beginPath();
        context.moveTo(x - 10, startY);
        context.bezierCurveTo(
          x + tileSize * 0.3,
          startY + (random() - 0.5) * 22,
          x + tileSize * 0.7,
          startY + (random() - 0.5) * 26,
          x + tileSize + 10,
          startY + (random() - 0.5) * 18,
        );
        context.stroke();
      }
      context.restore();
    }
  }
  context.globalAlpha = 1;
  return canvas;
}

function createCourtyardTileCanvas() {
  const size = 512;
  const tileSize = 128;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom("fountain-courtyard-charcoal-tile-v4");

  // A restrained charcoal tile: dark enough to distinguish the recessed
  // fountain court from the maroon hall carpet, without becoming a black
  // void under the theater lighting.
  context.fillStyle = "#17191b";
  context.fillRect(0, 0, size, size);
  for (let row = 0; row < size / tileSize; row += 1) {
    for (let column = 0; column < size / tileSize; column += 1) {
      const x = column * tileSize + 3;
      const y = row * tileSize + 3;
      const shade = 48 + Math.floor(random() * 12);
      const gradient = context.createLinearGradient(x, y, x + tileSize, y + tileSize);
      gradient.addColorStop(0, `rgb(${shade + 3}, ${shade + 4}, ${shade + 5})`);
      gradient.addColorStop(1, `rgb(${shade - 3}, ${shade - 2}, ${shade})`);
      context.fillStyle = gradient;
      context.fillRect(x, y, tileSize - 6, tileSize - 6);

      for (let fleck = 0; fleck < 260; fleck += 1) {
        const light = random() > 0.58;
        context.fillStyle = light ? "#777a7c" : "#202326";
        context.globalAlpha = 0.025 + random() * 0.07;
        context.fillRect(
          x + random() * (tileSize - 6),
          y + random() * (tileSize - 6),
          0.35 + random() * 0.9,
          0.35 + random() * 0.9,
        );
      }
    }
  }
  context.globalAlpha = 1;
  return canvas;
}

function createLobbyStoneCanvas() {
  const size = 512;
  const slabSize = size / 2;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom("mililani-cool-gray-honed-stone-v3");

  // The undercoat becomes a consistent grout line when the map repeats.
  context.fillStyle = "#656866";
  context.fillRect(0, 0, size, size);

  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      const x = column * slabSize + 3;
      const y = row * slabSize + 3;
      const width = slabSize - 6;
      const height = slabSize - 6;
      const warmth = Math.floor(random() * 5);
      const shade = 132 + Math.floor(random() * 14);
      const stoneGradient = context.createLinearGradient(x, y, x + width, y + height);
      stoneGradient.addColorStop(0, `rgb(${shade + warmth}, ${shade + warmth - 2}, ${shade + warmth - 7})`);
      stoneGradient.addColorStop(0.52, `rgb(${shade + 7}, ${shade + 5}, ${shade + 1})`);
      stoneGradient.addColorStop(1, `rgb(${shade + warmth - 3}, ${shade + warmth - 4}, ${shade + warmth - 8})`);
      context.fillStyle = stoneGradient;
      context.fillRect(x, y, width, height);

      context.save();
      context.beginPath();
      context.rect(x, y, width, height);
      context.clip();
      for (let fleck = 0; fleck < 1100; fleck += 1) {
        context.fillStyle = random() > 0.44 ? "#c5c6c2" : "#565a58";
        context.globalAlpha = 0.025 + random() * 0.07;
        context.fillRect(
          x + random() * width,
          y + random() * height,
          0.35 + random() * 1.1,
          0.35 + random() * 0.8,
        );
      }

      for (let vein = 0; vein < 13; vein += 1) {
        const startY = y + random() * height;
        context.strokeStyle = random() > 0.48 ? "#5e6260" : "#cfd0ca";
        context.globalAlpha = 0.04 + random() * 0.09;
        context.lineWidth = 0.45 + random() * 1.15;
        context.beginPath();
        context.moveTo(x - 14, startY);
        context.bezierCurveTo(
          x + width * 0.28,
          startY + (random() - 0.5) * 54,
          x + width * 0.68,
          startY + (random() - 0.5) * 48,
          x + width + 14,
          startY + (random() - 0.5) * 30,
        );
        context.stroke();
      }
      context.restore();
    }
  }

  context.globalAlpha = 0.2;
  context.strokeStyle = "#b5b7b3";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(slabSize + 2, 0);
  context.lineTo(slabSize + 2, size);
  context.moveTo(0, slabSize + 2);
  context.lineTo(size, slabSize + 2);
  context.stroke();
  context.globalAlpha = 1;
  return canvas;
}

function createCorridorCarpetCanvas() {
  const size = 512;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom("mililani-maroon-corridor-carpet-v2");
  const fiberPalette = ["#2a121a", "#491925", "#692535", "#321822", "#751f34", "#24222b", "#84604d"];

  context.fillStyle = "#4a1826";
  context.fillRect(0, 0, size, size);

  // Dense, mixed-value fibers deliberately hide tracked-in dirt and small debris.
  for (let index = 0; index < 22000; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = 0.55 + random() * 2.25;
    context.strokeStyle = fiberPalette[Math.floor(random() * fiberPalette.length)];
    context.globalAlpha = 0.2 + random() * 0.55;
    context.lineWidth = 0.32 + random() * 0.65;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (random() - 0.5) * 1.6, y + length);
    context.stroke();
  }

  // A fixed lattice makes a compact transit/cinema motif with matching tile edges.
  context.lineCap = "round";
  for (let row = -1; row <= 8; row += 1) {
    for (let column = -1; column <= 8; column += 1) {
      const x = column * 64 + (row % 2 ? 32 : 0);
      const y = row * 64;
      const patternRow = ((row % 8) + 8) % 8;
      const patternColumn = ((column % 8) + 8) % 8;
      const alternate = (patternRow + patternColumn) % 3 === 0;
      context.strokeStyle = alternate ? "#9d4b51" : "#263747";
      context.globalAlpha = alternate ? 0.22 : 0.27;
      context.lineWidth = alternate ? 2.4 : 1.8;
      context.beginPath();
      context.moveTo(x - 17, y);
      context.quadraticCurveTo(x, y - 13, x + 17, y);
      context.quadraticCurveTo(x, y + 13, x - 17, y);
      context.stroke();

      context.strokeStyle = "#b58a68";
      context.globalAlpha = 0.13;
      context.beginPath();
      context.moveTo(x - 8, y + 20);
      context.lineTo(x + 8, y + 28);
      context.stroke();
    }
  }

  for (let index = 0; index < 760; index += 1) {
    context.fillStyle = random() > 0.64 ? "#b97868" : "#17161b";
    context.globalAlpha = 0.08 + random() * 0.2;
    context.beginPath();
    context.arc(random() * size, random() * size, 0.35 + random() * 1.45, 0, TAU);
    context.fill();
  }

  context.globalAlpha = 1;
  context.lineCap = "butt";
  return canvas;
}

function createCounterStoneCanvas() {
  const size = 256;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom("charcoal-quartz-counter-v2");
  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#242527");
  gradient.addColorStop(0.5, "#363638");
  gradient.addColorStop(1, "#202124");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const aggregate = ["#8c8982", "#d1cec4", "#17181a", "#6b5550"];
  for (let index = 0; index < 4700; index += 1) {
    context.fillStyle = aggregate[Math.floor(random() * aggregate.length)];
    context.globalAlpha = 0.07 + random() * 0.2;
    context.beginPath();
    context.arc(random() * size, random() * size, 0.22 + random() * 1.1, 0, TAU);
    context.fill();
  }

  for (let vein = 0; vein < 7; vein += 1) {
    const startY = random() * size;
    context.strokeStyle = random() > 0.4 ? "#b8b5ad" : "#755b58";
    context.globalAlpha = 0.055 + random() * 0.075;
    context.lineWidth = 0.45 + random() * 0.8;
    context.beginPath();
    context.moveTo(-8, startY);
    context.bezierCurveTo(72, startY - 28 + random() * 56, 182, startY - 24 + random() * 48, size + 8, startY + (random() - 0.5) * 36);
    context.stroke();
  }

  context.globalAlpha = 1;
  return canvas;
}

function createAcousticCanvas(color = "#222126", seed = "acoustic-charcoal") {
  const size = 256;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom(seed);
  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 2) {
    const lightness = 34 + Math.floor(random() * 14);
    context.strokeStyle = `rgb(${lightness}, ${lightness - 1}, ${lightness + 4})`;
    context.globalAlpha = 0.3 + random() * 0.25;
    context.lineWidth = random() > 0.9 ? 1.1 : 0.45;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + (random() - 0.5) * 1.3, size);
    context.stroke();
  }

  context.globalAlpha = 0.2;
  for (let y = 1; y < size; y += 4) {
    context.fillStyle = y % 8 ? "#111116" : "#5c5962";
    context.fillRect(0, y, size, 0.45);
  }
  context.globalAlpha = 1;
  return canvas;
}

function createSeatCanvas() {
  const size = 256;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom("cinema-seat-brown-leather-v3");
  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#3b2418");
  gradient.addColorStop(0.46, "#6a422a");
  gradient.addColorStop(1, "#2d1b13");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  // Fine pores and irregular tonal variation read as leather at normal seat
  // distance without turning into the directional weave used by the old
  // burgundy fabric material. The fixed seed keeps every build deterministic.
  for (let index = 0; index < 10500; index += 1) {
    const x = random() * size;
    const y = random() * size;
    context.fillStyle = random() > 0.56 ? "#b07b50" : "#160e0a";
    context.globalAlpha = 0.025 + random() * 0.105;
    context.beginPath();
    context.ellipse(
      x,
      y,
      0.24 + random() * 0.72,
      0.18 + random() * 0.48,
      random() * Math.PI,
      0,
      TAU,
    );
    context.fill();
  }

  // Soft, wandering creases break up broad cushions while avoiding a fabric
  // stripe or tile-grid appearance.
  for (let crease = 0; crease < 34; crease += 1) {
    const startX = random() * size;
    const startY = random() * size;
    const length = 14 + random() * 42;
    context.strokeStyle = random() > 0.3 ? "#160e0a" : "#bc8457";
    context.globalAlpha = 0.025 + random() * 0.07;
    context.lineWidth = 0.35 + random() * 0.8;
    context.beginPath();
    context.moveTo(startX, startY);
    context.bezierCurveTo(
      startX + length * 0.28,
      startY + (random() - 0.5) * 9,
      startX + length * 0.7,
      startY + (random() - 0.5) * 13,
      startX + length,
      startY + (random() - 0.5) * 8,
    );
    context.stroke();
  }

  context.globalAlpha = 1;
  return canvas;
}

function createSeatLeatherBumpCanvas() {
  const size = 256;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom("cinema-seat-brown-leather-bump-v3");

  context.fillStyle = "#808080";
  context.fillRect(0, 0, size, size);

  for (let pore = 0; pore < 12000; pore += 1) {
    const shade = random() > 0.48 ? 93 + Math.floor(random() * 25) : 137 + Math.floor(random() * 24);
    context.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    context.globalAlpha = 0.16 + random() * 0.3;
    context.beginPath();
    context.ellipse(
      random() * size,
      random() * size,
      0.2 + random() * 0.62,
      0.16 + random() * 0.44,
      random() * Math.PI,
      0,
      TAU,
    );
    context.fill();
  }

  for (let crease = 0; crease < 30; crease += 1) {
    const startX = random() * size;
    const startY = random() * size;
    const length = 16 + random() * 38;
    context.strokeStyle = random() > 0.25 ? "#555555" : "#a7a7a7";
    context.globalAlpha = 0.18 + random() * 0.2;
    context.lineWidth = 0.45 + random() * 0.7;
    context.beginPath();
    context.moveTo(startX, startY);
    context.bezierCurveTo(
      startX + length * 0.3,
      startY + (random() - 0.5) * 10,
      startX + length * 0.72,
      startY + (random() - 0.5) * 12,
      startX + length,
      startY + (random() - 0.5) * 7,
    );
    context.stroke();
  }

  context.globalAlpha = 1;
  return canvas;
}

function createWoodCanvas() {
  const size = 512;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom("warm-walnut-laminate-v1");
  const gradient = context.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "#70442c");
  gradient.addColorStop(0.46, "#8b5b38");
  gradient.addColorStop(1, "#5d3725");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  for (let line = 0; line < 280; line += 1) {
    const y = random() * size;
    context.strokeStyle = random() > 0.54 ? "#2f1d16" : "#d49b64";
    context.globalAlpha = 0.035 + random() * 0.12;
    context.lineWidth = 0.25 + random() * 1.4;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(size * 0.28, y + (random() - 0.5) * 13, size * 0.7, y + (random() - 0.5) * 15, size, y);
    context.stroke();
  }

  for (let knot = 0; knot < 7; knot += 1) {
    const x = random() * size;
    const y = random() * size;
    context.strokeStyle = "#342018";
    context.globalAlpha = 0.12;
    context.lineWidth = 1;
    for (let ring = 1; ring <= 4; ring += 1) {
      context.beginPath();
      context.ellipse(x, y, ring * 7, ring * 2.4, (random() - 0.5) * 0.15, 0, TAU);
      context.stroke();
    }
  }
  context.globalAlpha = 1;
  return canvas;
}

function createBrushedMetalCanvas() {
  const size = 256;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);
  const random = seededRandom("brushed-stainless-v1");
  const gradient = context.createLinearGradient(0, 0, size, 0);
  gradient.addColorStop(0, "#9da1a2");
  gradient.addColorStop(0.46, "#e1e3e1");
  gradient.addColorStop(0.54, "#bcc0c0");
  gradient.addColorStop(1, "#8f9495");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 1) {
    const brightness = 118 + Math.floor(random() * 112);
    context.strokeStyle = `rgb(${brightness}, ${brightness + 1}, ${brightness + 1})`;
    context.globalAlpha = 0.07 + random() * 0.15;
    context.lineWidth = random() > 0.92 ? 0.8 : 0.28;
    context.beginPath();
    context.moveTo(0, y + random());
    context.lineTo(size, y + (random() - 0.5));
    context.stroke();
  }
  context.globalAlpha = 1;
  return canvas;
}

function createCeilingCanvas() {
  const size = 256;
  const canvas = makeNoiseCanvas({ size, seed: "ceiling-tile-v1", base: "#d4d1c8", spread: 13, density: 0.6 });
  const context = context2d(canvas);
  context.strokeStyle = "#898a87";
  context.globalAlpha = 0.7;
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, size - 3, size - 3);
  context.globalAlpha = 1;
  return canvas;
}

function createMaterialLibrary(renderer) {
  const anisotropy = resolveAnisotropy(renderer);
  const textures = new Set();
  const materials = new Set();

  const textureFrom = (canvas, options = {}) => {
    const texture = canvasTexture(canvas, { ...options, anisotropy });
    textures.add(texture);
    return texture;
  };

  const track = (material) => {
    materials.add(material);
    return material;
  };

  const microBump = textureFrom(
    makeNoiseCanvas({ size: 256, seed: "universal-micro-bump", base: "#7f7f7f", spread: 74, density: 0.74 }),
    { name: "micro-surface-bump", colorSpace: false, repeat: [7, 7] },
  );
  const wovenBump = textureFrom(createAcousticCanvas("#777777", "woven-bump-v1"), {
    name: "woven-fabric-bump",
    colorSpace: false,
    repeat: [8, 8],
  });
  const carpetMap = textureFrom(createCarpetCanvas(), { name: "cinema-carpet", repeat: [4, 4] });
  const tileMap = textureFrom(createTileCanvas(), { name: "lobby-tile", repeat: [4, 4] });
  const courtyardTileMap = textureFrom(createCourtyardTileCanvas(), { name: "fountain-courtyard-charcoal-tile", repeat: [4, 4] });
  const lobbyStoneMap = textureFrom(createLobbyStoneCanvas(), { name: "warm-honed-lobby-stone", repeat: [3, 3] });
  const corridorCarpetMap = textureFrom(createCorridorCarpetCanvas(), { name: "maroon-corridor-carpet", repeat: [4, 4] });
  const counterStoneMap = textureFrom(createCounterStoneCanvas(), { name: "charcoal-quartz-counter", repeat: [2, 2] });
  const wallMap = textureFrom(
    makeNoiseCanvas({ size: 256, seed: "warm-wall-v1", base: "#c8c3b9", spread: 19, density: 0.52 }),
    { name: "warm-painted-wall", repeat: [4, 4] },
  );
  const darkWallMap = textureFrom(
    makeNoiseCanvas({ size: 256, seed: "dark-wall-v1", base: "#2b292b", spread: 22, density: 0.56 }),
    { name: "charcoal-painted-wall", repeat: [5, 5] },
  );
  const acousticMap = textureFrom(createAcousticCanvas(), { name: "acoustic-fabric", repeat: [7, 7] });
  const seatMap = textureFrom(createSeatCanvas(), { name: "brown-seat-leather", repeat: [3, 3] });
  const seatLeatherBump = textureFrom(createSeatLeatherBumpCanvas(), {
    name: "brown-seat-leather-bump",
    colorSpace: false,
    repeat: [3, 3],
  });
  const woodMap = textureFrom(createWoodCanvas(), { name: "warm-walnut-laminate", repeat: [2, 3] });
  const stainlessMap = textureFrom(createBrushedMetalCanvas(), { name: "brushed-stainless", repeat: [2, 4] });
  const floorDarkMap = textureFrom(
    makeNoiseCanvas({ size: 512, seed: "dark-service-floor-v1", base: "#242628", spread: 24, density: 0.7 }),
    { name: "dark-service-floor", repeat: [7, 7] },
  );
  const ceilingMap = textureFrom(createCeilingCanvas(), { name: "acoustic-ceiling-tile", repeat: [8, 8] });

  const library = {
    carpet: track(new THREE.MeshStandardMaterial({
      name: "Carpet / patterned cinema",
      color: 0xffffff,
      map: carpetMap,
      bumpMap: microBump,
      bumpScale: 0.035,
      roughness: 0.96,
      metalness: 0,
    })),
    lobbyTile: track(new THREE.MeshPhysicalMaterial({
      name: "Tile / lobby porcelain",
      color: 0xffffff,
      map: tileMap,
      bumpMap: microBump,
      bumpScale: 0.018,
      roughness: 0.34,
      metalness: 0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.35,
    })),
    courtyardTile: track(new THREE.MeshPhysicalMaterial({
      name: "Tile / fountain courtyard charcoal",
      color: 0xffffff,
      map: courtyardTileMap,
      bumpMap: microBump,
      bumpScale: 0.015,
      roughness: 0.69,
      metalness: 0.015,
      clearcoat: 0.035,
      clearcoatRoughness: 0.78,
    })),
    lobbyStone: track(new THREE.MeshPhysicalMaterial({
      name: "Stone / warm gray honed lobby slabs",
      // The texture carries the slab variation; this multiplier keeps the
      // finished floor in the requested medium warm-gray range under lobby
      // lighting instead of reading as glossy white porcelain.
      color: 0xb8b4ad,
      map: lobbyStoneMap,
      bumpMap: microBump,
      bumpScale: 0.014,
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.025,
      clearcoatRoughness: 0.72,
    })),
    corridorCarpet: track(new THREE.MeshStandardMaterial({
      name: "Carpet / maroon dirt-hiding corridor pattern",
      color: 0xffffff,
      map: corridorCarpetMap,
      bumpMap: wovenBump,
      bumpScale: 0.041,
      roughness: 0.975,
      metalness: 0,
    })),
    wall: track(new THREE.MeshStandardMaterial({
      name: "Wall / warm neutral",
      color: 0xffffff,
      map: wallMap,
      bumpMap: microBump,
      bumpScale: 0.012,
      roughness: 0.86,
      metalness: 0,
    })),
    darkWall: track(new THREE.MeshStandardMaterial({
      name: "Wall / charcoal",
      color: 0xffffff,
      map: darkWallMap,
      bumpMap: microBump,
      bumpScale: 0.014,
      roughness: 0.91,
      metalness: 0,
    })),
    acoustic: track(new THREE.MeshStandardMaterial({
      name: "Acoustic wall fabric",
      color: 0xffffff,
      map: acousticMap,
      bumpMap: wovenBump,
      bumpScale: 0.028,
      roughness: 1,
      metalness: 0,
    })),
    seat: track(new THREE.MeshPhysicalMaterial({
      name: "Seat / warm brown leather",
      color: 0xffffff,
      map: seatMap,
      bumpMap: seatLeatherBump,
      bumpScale: 0.026,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.1,
      clearcoatRoughness: 0.66,
      sheen: 0.12,
      sheenRoughness: 0.78,
      sheenColor: new THREE.Color(0x6d432b),
    })),
    seatMetal: track(new THREE.MeshStandardMaterial({
      name: "Seat / powder-coated steel",
      color: 0x202124,
      roughness: 0.42,
      metalness: 0.72,
    })),
    trayTable: track(new THREE.MeshPhysicalMaterial({
      name: "Seat / dark espresso tray table",
      color: 0x211a17,
      roughness: 0.56,
      metalness: 0.02,
      clearcoat: 0.08,
      clearcoatRoughness: 0.62,
    })),
    floorDark: track(new THREE.MeshStandardMaterial({
      name: "Floor / dark service concrete",
      color: 0xffffff,
      map: floorDarkMap,
      bumpMap: microBump,
      bumpScale: 0.025,
      roughness: 0.84,
      metalness: 0.02,
    })),
    ceiling: track(new THREE.MeshStandardMaterial({
      name: "Ceiling / acoustic tile",
      color: 0xffffff,
      map: ceilingMap,
      bumpMap: microBump,
      bumpScale: 0.012,
      roughness: 0.93,
      metalness: 0,
      side: THREE.DoubleSide,
    })),
    screen: track(new THREE.MeshStandardMaterial({
      name: "Projection screen",
      color: 0xf5f3eb,
      emissive: 0xffffff,
      emissiveIntensity: 0.055,
      roughness: 0.78,
      metalness: 0,
      side: THREE.DoubleSide,
    })),
    red: track(new THREE.MeshPhysicalMaterial({
      name: "Accent / theater crimson",
      color: 0xaa202b,
      roughness: 0.3,
      metalness: 0.06,
      clearcoat: 0.35,
      clearcoatRoughness: 0.23,
    })),
    wood: track(new THREE.MeshStandardMaterial({
      name: "Laminate / warm walnut",
      color: 0xffffff,
      map: woodMap,
      bumpMap: microBump,
      bumpScale: 0.018,
      roughness: 0.46,
      metalness: 0,
    })),
    counterStone: track(new THREE.MeshPhysicalMaterial({
      name: "Stone / charcoal quartz counter",
      color: 0xffffff,
      map: counterStoneMap,
      bumpMap: microBump,
      bumpScale: 0.012,
      roughness: 0.32,
      metalness: 0.02,
      clearcoat: 0.24,
      clearcoatRoughness: 0.31,
    })),
    counterWhite: track(new THREE.MeshPhysicalMaterial({
      name: "Counter / satin white service and expo",
      color: 0xf0f1ed,
      roughness: 0.3,
      metalness: 0,
      clearcoat: 0.28,
      clearcoatRoughness: 0.25,
    })),
    concessionBlue: track(new THREE.MeshPhysicalMaterial({
      name: "Counter / deep blue concession",
      color: 0x243d78,
      roughness: 0.32,
      metalness: 0.02,
      clearcoat: 0.3,
      clearcoatRoughness: 0.27,
    })),
    stainless: track(new THREE.MeshStandardMaterial({
      name: "Metal / brushed stainless",
      color: 0xffffff,
      map: stainlessMap,
      bumpMap: microBump,
      bumpScale: 0.01,
      roughness: 0.3,
      metalness: 0.88,
    })),
    hvacDuct: track(new THREE.MeshStandardMaterial({
      name: "Mechanical / galvanized HVAC duct",
      color: 0x686d70,
      map: stainlessMap,
      bumpMap: microBump,
      bumpScale: 0.016,
      roughness: 0.58,
      metalness: 0.72,
    })),
    utilityPipe: track(new THREE.MeshStandardMaterial({
      name: "Mechanical / exposed utility pipe",
      color: 0x777b7d,
      map: stainlessMap,
      bumpMap: microBump,
      bumpScale: 0.012,
      roughness: 0.46,
      metalness: 0.8,
    })),
    porcelain: track(new THREE.MeshPhysicalMaterial({
      name: "Fixture / white porcelain",
      color: 0xf2f2ec,
      roughness: 0.19,
      metalness: 0,
      clearcoat: 0.72,
      clearcoatRoughness: 0.18,
    })),
    glass: track(new THREE.MeshPhysicalMaterial({
      name: "Glass / lightly tinted",
      color: 0xbad8dd,
      roughness: 0.12,
      metalness: 0,
      transmission: 0.38,
      thickness: 0.14,
      ior: 1.47,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
    })),
    black: track(new THREE.MeshStandardMaterial({
      name: "Metal / architectural black",
      color: 0x111316,
      roughness: 0.38,
      metalness: 0.68,
    })),
    concrete: track(new THREE.MeshStandardMaterial({
      name: "Exterior / honed concrete",
      color: 0x777b7c,
      bumpMap: microBump,
      bumpScale: 0.028,
      roughness: 0.94,
      metalness: 0,
    })),
    stall: track(new THREE.MeshPhysicalMaterial({
      name: "Restroom / green phenolic partition",
      color: 0x315e55,
      roughness: 0.42,
      metalness: 0.04,
      clearcoat: 0.16,
      clearcoatRoughness: 0.38,
    })),
    mirror: track(new THREE.MeshPhysicalMaterial({
      name: "Fixture / mirror",
      color: 0xc9d5d6,
      roughness: 0.08,
      metalness: 0.74,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    })),
    light: track(new THREE.MeshStandardMaterial({
      name: "Lighting / warm ceiling panel",
      color: 0xfff6e7,
      emissive: 0xffe7c7,
      emissiveIntensity: 3.1,
      roughness: 0.5,
      metalness: 0,
      toneMapped: false,
    })),
    display: track(new THREE.MeshStandardMaterial({
      name: "Display / subtle cool emissive",
      color: 0x122027,
      emissive: 0x5ba8bc,
      emissiveIntensity: 0.52,
      roughness: 0.24,
      metalness: 0.03,
    })),
    iceeRed: track(new THREE.MeshStandardMaterial({
      name: "Frozen drink / translucent cherry red",
      color: 0xd12c49,
      emissive: 0x761020,
      emissiveIntensity: 0.18,
      roughness: 0.4,
      metalness: 0,
      transparent: true,
      opacity: 0.84,
    })),
    iceeBlue: track(new THREE.MeshStandardMaterial({
      name: "Frozen drink / translucent electric blue",
      color: 0x268bd2,
      emissive: 0x0d416f,
      emissiveIntensity: 0.2,
      roughness: 0.38,
      metalness: 0,
      transparent: true,
      opacity: 0.84,
    })),
  };

  Object.defineProperties(library, {
    textures: { value: textures, enumerable: false },
    dispose: {
      enumerable: false,
      value() {
        for (const material of materials) material.dispose();
        for (const texture of textures) texture.dispose();
        materials.clear();
        textures.clear();
      },
    },
  });

  return library;
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fitText(context, text, maximumWidth, initialSize, minimumSize, family, weight) {
  let fontSize = initialSize;
  do {
    context.font = `${weight} ${fontSize}px ${family}`;
    if (context.measureText(text).width <= maximumWidth) break;
    fontSize -= 2;
  } while (fontSize > minimumSize);
  return fontSize;
}

function createSignTexture(text, options = {}) {
  const width = options.width ?? (options.small ? 256 : 512);
  const height = options.height ?? (options.small ? 128 : 256);
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  const background = options.background ?? "#171719";
  const foreground = options.foreground ?? "#f3eee5";
  const accent = options.accent ?? "#b82331";
  const family = options.fontFamily ?? "Arial, Helvetica, sans-serif";
  const inset = Math.max(10, width * 0.035);

  context.clearRect(0, 0, width, height);
  roundedRect(context, 2, 2, width - 4, height - 4, Math.min(width, height) * 0.065);
  context.fillStyle = background;
  context.fill();
  context.strokeStyle = options.border ?? "#494448";
  context.lineWidth = Math.max(2, width * 0.008);
  context.stroke();

  context.fillStyle = accent;
  roundedRect(context, inset, inset, width * 0.026, height - inset * 2, width * 0.013);
  context.fill();

  const lines = String(text).split("\n").slice(0, 3);
  const subtitle = options.subtitle ? String(options.subtitle).toUpperCase() : "";
  const textLeft = inset * 2 + width * 0.026;
  const textWidth = width - textLeft - inset;
  const primaryAreaHeight = subtitle ? height * 0.62 : height * 0.78;
  const startingSize = Math.floor((primaryAreaHeight / Math.max(lines.length, 1)) * 0.65);
  const smallestSize = Math.max(18, Math.floor(height * 0.12));
  const lineSizes = lines.map((line) => fitText(context, line, textWidth, startingSize, smallestSize, family, 700));
  const lineHeight = Math.min(...lineSizes) * 1.12;
  const blockHeight = lineHeight * lines.length;
  const centerY = subtitle ? height * 0.39 : height * 0.5;

  context.fillStyle = foreground;
  context.textAlign = "left";
  context.textBaseline = "middle";
  lines.forEach((line, index) => {
    context.font = `700 ${Math.min(...lineSizes)}px ${family}`;
    context.fillText(line, textLeft, centerY - blockHeight / 2 + lineHeight * (index + 0.5));
  });

  if (subtitle) {
    context.font = `600 ${Math.max(12, Math.floor(height * 0.075))}px ${family}`;
    context.fillStyle = options.subtitleColor ?? "#bdb6ad";
    context.letterSpacing = `${Math.max(1, width * 0.004)}px`;
    context.fillText(subtitle, textLeft, height * 0.78, textWidth);
  }

  return canvasTexture(canvas, {
    name: options.name ?? `sign-${String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    clamp: true,
    anisotropy: resolveAnisotropy(options.renderer, options.anisotropy ?? 8),
  });
}

function drawLeaf(context, x, y, length, width, angle, fill, stroke) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.beginPath();
  context.moveTo(0, 0);
  context.bezierCurveTo(length * 0.26, -width, length * 0.78, -width * 0.78, length, 0);
  context.bezierCurveTo(length * 0.72, width * 0.8, length * 0.25, width, 0, 0);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = 1.3;
  context.stroke();
  context.beginPath();
  context.moveTo(length * 0.06, 0);
  context.quadraticCurveTo(length * 0.53, -width * 0.05, length * 0.94, 0);
  context.stroke();
  context.restore();
}

function drawHalfBlossom(context, x, y, radius, angle, color) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  for (let petal = -2; petal <= 2; petal += 1) {
    context.save();
    context.rotate(petal * 0.42);
    context.beginPath();
    context.moveTo(0, 0);
    context.bezierCurveTo(radius * 0.32, -radius * 0.2, radius * 0.88, -radius * 0.3, radius, 0);
    context.bezierCurveTo(radius * 0.82, radius * 0.36, radius * 0.34, radius * 0.3, 0, 0);
    context.fillStyle = color;
    context.fill();
    context.strokeStyle = "#f4e7d2";
    context.lineWidth = 0.9;
    context.stroke();
    context.restore();
  }
  context.fillStyle = "#d7a23c";
  context.beginPath();
  context.arc(0, 0, radius * 0.14, 0, TAU);
  context.fill();
  context.restore();
}

function createBotanicalMuralTexture() {
  // A wide, original lobby composition that echoes the venue photograph's
  // face-and-foliage rhythm without reproducing the real artwork. The larger
  // canvas remains crisp when stretched across the elevated concession
  // fascia introduced for the V11 lobby.
  const width = 1024;
  const height = 384;
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  const random = seededRandom("original-island-botanical-mural-v2");

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#899194");
  background.addColorStop(0.2, "#56616a");
  background.addColorStop(0.8, "#647079");
  background.addColorStop(1, "#9da3a2");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  // Neutral end panels frame a deeper central field, matching the broad
  // architectural cadence of the reference rather than leaving the artwork
  // as an ungrounded rectangle.
  const field = context.createLinearGradient(188, 0, 860, height);
  field.addColorStop(0, "#315a72");
  field.addColorStop(0.42, "#172936");
  field.addColorStop(0.72, "#10231f");
  field.addColorStop(1, "#26362f");
  context.fillStyle = field;
  context.fillRect(188, 0, 672, height);

  context.strokeStyle = "#8dc3d0";
  context.globalAlpha = 0.16;
  context.lineWidth = 2.4;
  for (let wave = 0; wave < 8; wave += 1) {
    context.beginPath();
    context.moveTo(180, 270 + wave * 13);
    for (let x = 180; x <= 650; x += 40) {
      context.quadraticCurveTo(x + 10, 260 + wave * 13, x + 20, 270 + wave * 13);
      context.quadraticCurveTo(x + 30, 280 + wave * 13, x + 40, 270 + wave * 13);
    }
    context.stroke();
  }
  context.globalAlpha = 1;

  // An abstract cool-toned face anchors the composition. Deliberately loose
  // painterly bands keep this a procedural original rather than a traced
  // reproduction of the photograph.
  const face = context.createLinearGradient(250, 40, 560, 360);
  face.addColorStop(0, "#a8c1cb");
  face.addColorStop(0.42, "#6f9ab1");
  face.addColorStop(0.76, "#356e8e");
  face.addColorStop(1, "#1d425d");
  context.fillStyle = face;
  context.beginPath();
  context.moveTo(274, 0);
  context.bezierCurveTo(248, 86, 262, 183, 292, 274);
  context.bezierCurveTo(315, 342, 374, 386, 470, 384);
  context.bezierCurveTo(512, 313, 530, 242, 516, 174);
  context.bezierCurveTo(500, 98, 456, 35, 408, 0);
  context.closePath();
  context.fill();

  context.globalAlpha = 0.34;
  for (let stroke = 0; stroke < 42; stroke += 1) {
    const x = 270 + random() * 230;
    context.strokeStyle = random() > 0.5 ? "#d9e3df" : "#235f82";
    context.lineWidth = 2 + random() * 5;
    context.beginPath();
    context.moveTo(x, -10);
    context.bezierCurveTo(x - 28 + random() * 56, 120, x - 22 + random() * 44, 280, x + (random() - 0.5) * 34, 398);
    context.stroke();
  }
  context.globalAlpha = 1;

  // Single expressive eye and brow.
  context.fillStyle = "#e6e0d3";
  context.beginPath();
  context.moveTo(310, 126);
  context.quadraticCurveTo(364, 86, 430, 126);
  context.quadraticCurveTo(367, 166, 310, 126);
  context.fill();
  const iris = context.createRadialGradient(370, 126, 3, 370, 126, 28);
  iris.addColorStop(0, "#111317");
  iris.addColorStop(0.36, "#583d29");
  iris.addColorStop(0.72, "#91a789");
  iris.addColorStop(1, "#17211d");
  context.fillStyle = iris;
  context.beginPath();
  context.arc(370, 126, 27, 0, TAU);
  context.fill();
  context.fillStyle = "#090b0d";
  context.beginPath();
  context.arc(370, 126, 10, 0, TAU);
  context.fill();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(379, 116, 4, 0, TAU);
  context.fill();
  context.strokeStyle = "#10161b";
  context.lineWidth = 9;
  context.beginPath();
  context.moveTo(300, 119);
  context.quadraticCurveTo(367, 67, 442, 113);
  context.stroke();

  // Nose and cheek accents terminate beneath the foliage rather than fully
  // outlining a literal portrait.
  context.strokeStyle = "#d4dedb";
  context.globalAlpha = 0.55;
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(432, 142);
  context.bezierCurveTo(443, 198, 438, 232, 410, 264);
  context.quadraticCurveTo(435, 278, 461, 262);
  context.stroke();
  context.globalAlpha = 1;

  context.strokeStyle = "#254f48";
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(442, 370);
  context.bezierCurveTo(550, 300, 558, 172, 652, 196);
  context.bezierCurveTo(742, 222, 768, 80, 884, 18);
  context.stroke();

  const leafPalette = ["#24543f", "#377654", "#5b9368", "#89af7b", "#163f42", "#b2564c"];
  for (let index = 0; index < 64; index += 1) {
    const progress = index / 63;
    const x = 480 + progress * 430 + (random() - 0.5) * 38;
    const centerWave = 205 - Math.sin(progress * Math.PI * 2.3) * 116;
    const y = centerWave + (random() - 0.5) * 54;
    const upward = index % 2 ? -1 : 1;
    drawLeaf(
      context,
      x,
      y,
      28 + random() * 34,
      7 + random() * 10,
      upward * (0.46 + random() * 0.72),
      leafPalette[Math.floor(random() * leafPalette.length)],
      "#163c32",
    );
  }

  drawHalfBlossom(context, 584, 108, 28, -0.65, "#f2e5d7");
  drawHalfBlossom(context, 710, 260, 34, 0.32, "#f0d9cc");
  drawHalfBlossom(context, 824, 82, 29, 2.35, "#d06661");

  context.globalAlpha = 0.28;
  for (let dot = 0; dot < 220; dot += 1) {
    context.fillStyle = dot % 3 === 0 ? "#c8923e" : "#376b73";
    context.beginPath();
    context.arc(random() * width, random() * height, 0.5 + random() * 1.8, 0, TAU);
    context.fill();
  }
  context.globalAlpha = 1;

  const texture = canvasTexture(canvas, { name: "original-naupaka-inspired-botanical-mural-v2", clamp: true, anisotropy: 4 });
  texture.userData.credit = "Original procedural face-and-island-botanical composition";
  return texture;
}

function drawMenuScreenHeader(context, title, subtitle, accent) {
  context.fillStyle = "#09090d";
  context.fillRect(0, 0, 1280, 720);

  const glow = context.createLinearGradient(0, 0, 1280, 720);
  glow.addColorStop(0, "#18224a");
  glow.addColorStop(0.48, "#0e142b");
  glow.addColorStop(1, "#21131d");
  context.globalAlpha = 0.94;
  context.fillStyle = glow;
  context.fillRect(0, 0, 1280, 720);
  context.globalAlpha = 1;

  context.fillStyle = accent;
  context.fillRect(48, 45, 770, 82);
  context.fillStyle = "#11131b";
  context.font = "800 52px Arial, Helvetica, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(title, 78, 86);

  context.fillStyle = "#f5f1ee";
  context.font = "700 24px Arial, Helvetica, sans-serif";
  context.fillText(subtitle, 52, 159);
  context.strokeStyle = "#f5f1ee";
  context.globalAlpha = 0.4;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(52, 183);
  context.lineTo(810, 183);
  context.stroke();
  context.globalAlpha = 1;
}

function drawMenuRows(context, rows, options = {}) {
  const x = options.x ?? 64;
  const y = options.y ?? 226;
  const width = options.width ?? 730;
  const rowHeight = options.rowHeight ?? 70;
  const titleSize = options.titleSize ?? 34;
  const priceSize = options.priceSize ?? 25;

  rows.forEach((row, index) => {
    const rowY = y + index * rowHeight;
    context.fillStyle = index % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(109,131,220,0.055)";
    context.fillRect(x - 14, rowY - rowHeight * 0.42, width, rowHeight * 0.82);
    context.fillStyle = "#fbf9f5";
    context.font = `800 ${titleSize}px Arial, Helvetica, sans-serif`;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(row.label.toUpperCase(), x, rowY);
    context.fillStyle = "#d9dbe6";
    context.font = `500 ${priceSize}px Arial, Helvetica, sans-serif`;
    context.textAlign = "right";
    context.fillText(row.note, x + width - 30, rowY);
  });
}

function drawScreenPanel(context, x, y, width, height, fill = "#161824") {
  roundedRect(context, x, y, width, height, 24);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.2)";
  context.lineWidth = 3;
  context.stroke();
}

function drawBurgerIllustration(context, x, y, scale = 1) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);

  const bun = context.createLinearGradient(0, -105, 0, 100);
  bun.addColorStop(0, "#f7c66c");
  bun.addColorStop(1, "#b76624");
  context.fillStyle = bun;
  context.beginPath();
  context.moveTo(-154, -30);
  context.bezierCurveTo(-132, -146, 122, -154, 154, -30);
  context.quadraticCurveTo(0, 2, -154, -30);
  context.fill();

  context.fillStyle = "#f0e4be";
  for (let seed = 0; seed < 12; seed += 1) {
    const sx = -118 + (seed % 6) * 46 + (seed % 2) * 8;
    const sy = -84 + Math.floor(seed / 6) * 34;
    context.beginPath();
    context.ellipse(sx, sy, 8, 3, -0.4, 0, TAU);
    context.fill();
  }

  context.fillStyle = "#68a64c";
  context.beginPath();
  context.moveTo(-154, -20);
  context.bezierCurveTo(-105, 12, -65, -42, -16, -10);
  context.bezierCurveTo(35, 16, 96, -37, 154, -8);
  context.lineTo(144, 25);
  context.lineTo(-146, 28);
  context.closePath();
  context.fill();

  context.fillStyle = "#e7b941";
  context.beginPath();
  context.moveTo(-143, 20);
  context.lineTo(150, 18);
  context.lineTo(102, 66);
  context.lineTo(-122, 62);
  context.closePath();
  context.fill();
  context.fillStyle = "#603321";
  roundedRect(context, -145, 52, 290, 54, 24);
  context.fill();
  context.fillStyle = "#d98f3e";
  roundedRect(context, -154, 100, 308, 54, 25);
  context.fill();
  context.restore();
}

function drawFriesIllustration(context, x, y, scale = 1) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);

  const packet = context.createLinearGradient(-80, 80, 100, 220);
  packet.addColorStop(0, "#33479d");
  packet.addColorStop(1, "#121a4b");
  context.fillStyle = packet;
  context.beginPath();
  context.moveTo(-110, 16);
  context.lineTo(116, 16);
  context.lineTo(88, 202);
  context.quadraticCurveTo(0, 234, -88, 202);
  context.closePath();
  context.fill();

  const fryPalette = ["#f9d87a", "#edb84e", "#d99332"];
  for (let fry = 0; fry < 18; fry += 1) {
    context.save();
    context.translate(-92 + (fry % 10) * 20, 18 - (fry % 4) * 10);
    context.rotate(-0.22 + (fry % 5) * 0.11);
    context.fillStyle = fryPalette[fry % fryPalette.length];
    roundedRect(context, -6, -110 - (fry % 3) * 18, 14, 140 + (fry % 3) * 18, 5);
    context.fill();
    context.restore();
  }

  context.fillStyle = "#f7f4ec";
  context.font = "800 36px Arial, Helvetica, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("CRISP", 0, 134);
  context.restore();
}

function drawPlateIllustration(context, x, y, radius, palette) {
  context.save();
  context.translate(x, y);
  context.fillStyle = "rgba(255,255,255,0.13)";
  context.beginPath();
  context.arc(8, 12, radius * 1.08, 0, TAU);
  context.fill();
  context.fillStyle = "#ece9e1";
  context.beginPath();
  context.arc(0, 0, radius, 0, TAU);
  context.fill();
  context.fillStyle = "#c7c3bb";
  context.beginPath();
  context.arc(0, 0, radius * 0.78, 0, TAU);
  context.fill();
  palette.forEach((color, index) => {
    const angle = (index / palette.length) * TAU - Math.PI / 2;
    context.fillStyle = color;
    context.beginPath();
    context.arc(Math.cos(angle) * radius * 0.38, Math.sin(angle) * radius * 0.35, radius * (0.22 + (index % 2) * 0.04), 0, TAU);
    context.fill();
  });
  context.restore();
}

function createLobbyBarScreenTextures() {
  const width = 1280;
  const height = 720;
  const definitions = [
    {
      id: "island-grill",
      name: "lobby-bar-screen-slide-01-island-grill",
      draw(context) {
        drawMenuScreenHeader(context, "ISLAND GRILL", "BURGERS · BASKETS · SANDWICHES", "#e8cadc");
        drawMenuRows(context, [
          { label: "Crisp chicken stack", note: "HOUSE FAVORITE" },
          { label: "Garden grill burger", note: "CHARRED" },
          { label: "Teriyaki portobello", note: "PLANT-BASED" },
          { label: "Turkey club melt", note: "TOASTED" },
          { label: "Island fish basket", note: "SEA SALT" },
        ], { width: 770, titleSize: 31, priceSize: 18, rowHeight: 77 });
        drawScreenPanel(context, 858, 50, 372, 620, "#171421");
        drawBurgerIllustration(context, 1044, 342, 0.92);
        context.fillStyle = "#e8cadc";
        context.font = "800 26px Arial, Helvetica, sans-serif";
        context.textAlign = "center";
        context.fillText("BUILT FRESH", 1044, 604);
      },
    },
    {
      id: "garlic-fries-feature",
      name: "lobby-bar-screen-slide-02-garlic-fries",
      draw(context) {
        drawMenuScreenHeader(context, "FEATURED FRIES", "GARLIC · SCALLION · SEA SALT", "#f2d8e2");
        drawScreenPanel(context, 56, 205, 760, 453, "#17192a");
        drawFriesIllustration(context, 430, 377, 1.15);
        context.fillStyle = "#f5f1ee";
        context.font = "800 34px Arial, Helvetica, sans-serif";
        context.textAlign = "center";
        context.fillText("TOSSED TO ORDER", 430, 608);
        drawScreenPanel(context, 858, 50, 372, 608, "#15131d");
        context.fillStyle = "#f2d8e2";
        context.font = "800 29px Arial, Helvetica, sans-serif";
        context.textAlign = "left";
        context.fillText("PAIR IT WITH", 902, 126);
        context.fillStyle = "#f8f6f2";
        context.font = "700 34px Arial, Helvetica, sans-serif";
        ["CILANTRO AIOLI", "TANGY BBQ", "CHILI CREMA", "ROASTED GARLIC"].forEach((label, index) => {
          context.fillText(label, 902, 226 + index * 85);
        });
        context.fillStyle = "#839bdc";
        context.fillRect(902, 565, 275, 7);
      },
    },
    {
      id: "fries-and-rings",
      name: "lobby-bar-screen-slide-03-fries-and-rings",
      draw(context) {
        drawMenuScreenHeader(context, "FRIES & RINGS", "CRISP SIDES · SIGNATURE SAUCES", "#e5cbdc");
        drawMenuRows(context, [
          { label: "Sea salt fries", note: "CLASSIC" },
          { label: "Crispy onion rings", note: "GOLDEN" },
          { label: "Chili lime fries", note: "BRIGHT" },
          { label: "Green bean crunch", note: "SEASONED" },
          { label: "Loaded potato fries", note: "SHAREABLE" },
        ], { width: 785, titleSize: 31, priceSize: 18, rowHeight: 70 });
        drawScreenPanel(context, 876, 50, 346, 620, "#17131c");
        drawPlateIllustration(context, 1048, 294, 132, ["#d5a23b", "#91a64f", "#c95d45", "#e8cd77", "#764232"]);
        context.fillStyle = "#e5cbdc";
        context.font = "800 26px Arial, Helvetica, sans-serif";
        context.textAlign = "center";
        context.fillText("SAUCE FLIGHT", 1048, 532);
        context.fillStyle = "#d7d8df";
        context.font = "600 20px Arial, Helvetica, sans-serif";
        context.fillText("pick three house dips", 1048, 571);
      },
    },
    {
      id: "previews-and-morning",
      name: "lobby-bar-screen-slide-04-previews-morning",
      draw(context) {
        drawMenuScreenHeader(context, "PREVIEWS", "SNACKS BEFORE THE FEATURE", "#ead0df");
        drawMenuRows(context, [
          { label: "Pretzel bites", note: "WARM" },
          { label: "Loaded nachos", note: "SHAREABLE" },
          { label: "Classic hot dog", note: "GRILLED" },
          { label: "Mochi crunch mix", note: "LOCAL" },
        ], { width: 665, titleSize: 31, priceSize: 18, rowHeight: 73 });
        drawScreenPanel(context, 752, 50, 470, 620, "#151522");
        context.fillStyle = "#ead0df";
        context.fillRect(788, 82, 396, 70);
        context.fillStyle = "#17131c";
        context.font = "800 36px Arial, Helvetica, sans-serif";
        context.textAlign = "center";
        context.fillText("MORNING FEATURES", 986, 118);
        drawPlateIllustration(context, 986, 338, 130, ["#e9b744", "#bb6843", "#f2d58b", "#7ca253", "#dd8a54"]);
        context.fillStyle = "#f7f4ed";
        context.font = "700 28px Arial, Helvetica, sans-serif";
        context.fillText("WAFFLES · FRUIT · BREAKFAST", 986, 548);
        context.fillStyle = "#b9bdd2";
        context.font = "600 20px Arial, Helvetica, sans-serif";
        context.fillText("available during early shows", 986, 589);
      },
    },
  ];

  return definitions.map((definition, index) => {
    const canvas = createCanvas(width, height);
    const context = context2d(canvas);
    definition.draw(context);
    const texture = canvasTexture(canvas, { name: definition.name, clamp: true, anisotropy: 4 });
    texture.userData.slideId = definition.id;
    texture.userData.sequenceIndex = index;
    texture.userData.holdSeconds = 10;
    texture.userData.credit = "Original procedural lobby bar menu artwork";
    return texture;
  });
}

function createKioskShowtimeScreenTextures() {
  const width = 768;
  const height = 432;
  const definitions = [
    {
      id: "kiosk-showtime-screen-1",
      name: "kiosk-showtime-screen-01",
      zone: "SCREENS 1–5",
      accent: "#ef4763",
      listings: [
        { title: "THE STARLIT CURRENT", screen: "SCREEN 1 · PG", times: "12:10  ·  2:45  ·  5:20" },
        { title: "LANTERN CITY", screen: "SCREEN 3 · PG-13", times: "1:05  ·  3:50  ·  7:15" },
        { title: "PACIFIC AFTERGLOW", screen: "SCREEN 5 · PG", times: "4:30  ·  8:05  ·  10:35" },
      ],
    },
    {
      id: "kiosk-showtime-screen-2",
      name: "kiosk-showtime-screen-02",
      zone: "SCREENS 6–10",
      accent: "#55c6d2",
      listings: [
        { title: "NEON REEF", screen: "SCREEN 6 · PG-13", times: "12:40  ·  3:25  ·  6:10" },
        { title: "ORBITAL TIDE", screen: "SCREEN 8 · PG", times: "1:30  ·  4:15  ·  9:20" },
        { title: "THE QUIET VOLCANO", screen: "SCREEN 10 · R", times: "2:20  ·  5:45  ·  8:50" },
      ],
    },
    {
      id: "kiosk-showtime-screen-3",
      name: "kiosk-showtime-screen-03",
      zone: "SCREENS 11–14",
      accent: "#e7ba58",
      listings: [
        { title: "LAST TRAIN TO HILO", screen: "SCREEN 11 · PG", times: "12:25  ·  3:05  ·  6:35" },
        { title: "MANGO MOON", screen: "SCREEN 13 · PG", times: "1:50  ·  4:40  ·  7:30" },
        { title: "MIDNIGHT ON MAUNA", screen: "SCREEN 14 · PG-13", times: "5:10  ·  8:15  ·  10:45" },
      ],
    },
  ];

  return definitions.map((definition, index) => {
    const canvas = createCanvas(width, height);
    const context = context2d(canvas);
    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#070910");
    background.addColorStop(0.58, "#101524");
    background.addColorStop(1, "#080a12");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    context.fillStyle = definition.accent;
    context.fillRect(0, 0, 12, height);
    context.fillRect(30, 89, width - 60, 3);

    context.fillStyle = "#f7f4ef";
    context.font = "800 34px Arial, Helvetica, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText("SHOWTIMES", 34, 48);
    context.fillStyle = "#9ea8ba";
    context.font = "700 17px Arial, Helvetica, sans-serif";
    context.textAlign = "right";
    context.fillText(definition.zone, width - 34, 48);

    definition.listings.forEach((listing, listingIndex) => {
      const panelY = 108 + listingIndex * 101;
      drawScreenPanel(context, 28, panelY, width - 56, 84, listingIndex % 2 === 0 ? "#121827" : "#0e1421");

      context.fillStyle = definition.accent;
      context.fillRect(43, panelY + 15, 5, 54);
      context.fillStyle = "#f6f4f0";
      context.font = "800 24px Arial, Helvetica, sans-serif";
      context.textAlign = "left";
      context.fillText(listing.title, 64, panelY + 30, 360);
      context.fillStyle = "#8f9bad";
      context.font = "700 14px Arial, Helvetica, sans-serif";
      context.fillText(listing.screen, 64, panelY + 59);

      context.fillStyle = "#ffffff";
      context.font = "700 19px Arial, Helvetica, sans-serif";
      context.textAlign = "right";
      context.fillText(listing.times, width - 48, panelY + 43);
    });

    context.fillStyle = "#6f7888";
    context.font = "600 13px Arial, Helvetica, sans-serif";
    context.textAlign = "left";
    context.fillText("TIMES SUBJECT TO CHANGE", 34, 416);
    context.textAlign = "right";
    context.fillText("MILILANI CINEMA", width - 34, 416);

    const texture = canvasTexture(canvas, { name: definition.name, clamp: true, anisotropy: 4 });
    texture.userData.screenId = definition.id;
    texture.userData.sequenceIndex = index;
    texture.userData.credit = "Original procedural fictional cinema showtime artwork";
    return texture;
  });
}

function createOppositeLobbyMuralTexture() {
  // This is intentionally a second, independent lobby artwork. It faces the
  // stair/kiosk side of the room: dense foliage grows in from the left while
  // a warm portrait emerges into a cool blue field on the right. It does not
  // mirror or reuse the concession-side mural's composition.
  const width = 1152;
  const height = 432;
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  const random = seededRandom("opposite-lobby-warm-face-mural-v15");

  const sky = context.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, "#203d38");
  sky.addColorStop(0.4, "#182f31");
  sky.addColorStop(0.67, "#254f71");
  sky.addColorStop(1, "#6f7f94");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  // Layered blue brush bands keep the right side airy and distinct from the
  // dark concession mural's framed central field.
  context.globalAlpha = 0.28;
  for (let band = 0; band < 34; band += 1) {
    const x = 610 + random() * 570;
    context.strokeStyle = band % 3 === 0 ? "#b6d4df" : band % 3 === 1 ? "#37688e" : "#839bb0";
    context.lineWidth = 4 + random() * 14;
    context.beginPath();
    context.moveTo(x, -20);
    context.bezierCurveTo(x - 45 + random() * 90, 130, x - 35 + random() * 70, 302, x + (random() - 0.5) * 42, 452);
    context.stroke();
  }
  context.globalAlpha = 1;

  // A warm, angular face is placed right of center. Its silhouette and eye
  // placement deliberately differ from the concession artwork.
  const face = context.createLinearGradient(570, 20, 940, 420);
  face.addColorStop(0, "#d7aa75");
  face.addColorStop(0.42, "#b8734f");
  face.addColorStop(0.76, "#7b4a3f");
  face.addColorStop(1, "#273b55");
  context.fillStyle = face;
  context.beginPath();
  context.moveTo(650, -18);
  context.bezierCurveTo(760, 10, 918, 96, 945, 205);
  context.bezierCurveTo(927, 307, 849, 396, 730, 450);
  context.bezierCurveTo(652, 383, 622, 280, 635, 179);
  context.bezierCurveTo(642, 102, 628, 49, 650, -18);
  context.closePath();
  context.fill();

  context.globalAlpha = 0.3;
  for (let stroke = 0; stroke < 30; stroke += 1) {
    const x = 650 + random() * 285;
    context.strokeStyle = stroke % 2 === 0 ? "#f1c59a" : "#3a5e78";
    context.lineWidth = 2 + random() * 6;
    context.beginPath();
    context.moveTo(x, -8);
    context.bezierCurveTo(x + (random() - 0.5) * 44, 145, x - 35 + random() * 70, 285, x + (random() - 0.5) * 38, 445);
    context.stroke();
  }
  context.globalAlpha = 1;

  // Eye looking across the lobby toward the concession-side artwork.
  context.fillStyle = "#ede7d8";
  context.beginPath();
  context.moveTo(716, 137);
  context.quadraticCurveTo(780, 94, 855, 135);
  context.quadraticCurveTo(785, 172, 716, 137);
  context.fill();
  const iris = context.createRadialGradient(790, 135, 4, 790, 135, 29);
  iris.addColorStop(0, "#0d1012");
  iris.addColorStop(0.35, "#49798b");
  iris.addColorStop(0.72, "#9db8b6");
  iris.addColorStop(1, "#263e42");
  context.fillStyle = iris;
  context.beginPath();
  context.arc(790, 135, 28, 0, TAU);
  context.fill();
  context.fillStyle = "#111416";
  context.beginPath();
  context.arc(790, 135, 10, 0, TAU);
  context.fill();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(800, 124, 4.5, 0, TAU);
  context.fill();
  context.strokeStyle = "#352b29";
  context.lineWidth = 10;
  context.beginPath();
  context.moveTo(702, 128);
  context.quadraticCurveTo(782, 72, 873, 124);
  context.stroke();

  context.strokeStyle = "#edc8a4";
  context.globalAlpha = 0.58;
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(851, 158);
  context.bezierCurveTo(873, 224, 867, 271, 821, 308);
  context.quadraticCurveTo(858, 325, 889, 301);
  context.stroke();
  context.globalAlpha = 1;

  // A separate left-originating branch structure creates the leafy half of
  // the composition, with more fern-like tiers than the concession mural.
  context.strokeStyle = "#112e29";
  context.lineWidth = 12;
  context.beginPath();
  context.moveTo(-30, 374);
  context.bezierCurveTo(178, 315, 272, 150, 538, 95);
  context.bezierCurveTo(610, 80, 666, 51, 727, 8);
  context.stroke();

  const leafPalette = ["#163e33", "#245d43", "#3c7c51", "#65995f", "#91ae70", "#b5c183"];
  for (let index = 0; index < 88; index += 1) {
    const progress = index / 87;
    const x = -12 + progress * 676 + (random() - 0.5) * 48;
    const y = 314 - Math.sin(progress * Math.PI * 1.32) * 205 + (random() - 0.5) * 72;
    const direction = index % 2 === 0 ? -1 : 1;
    drawLeaf(
      context,
      x,
      y,
      30 + random() * 45,
      8 + random() * 12,
      direction * (0.58 + random() * 0.78),
      leafPalette[Math.floor(random() * leafPalette.length)],
      "#102f29",
    );
  }

  drawHalfBlossom(context, 166, 116, 30, -0.42, "#f0e8d7");
  drawHalfBlossom(context, 328, 276, 34, 0.58, "#e7d7c2");
  drawHalfBlossom(context, 512, 72, 27, 2.46, "#d9a968");

  context.globalAlpha = 0.24;
  for (let fleck = 0; fleck < 240; fleck += 1) {
    context.fillStyle = fleck % 4 === 0 ? "#d2a55e" : "#8fb9bb";
    context.beginPath();
    context.arc(random() * width, random() * height, 0.5 + random() * 1.7, 0, TAU);
    context.fill();
  }
  context.globalAlpha = 1;

  const texture = canvasTexture(canvas, { name: "original-opposite-lobby-botanical-mural-v15", clamp: true, anisotropy: 4 });
  texture.userData.credit = "Original procedural foliage-and-warm-portrait composition";
  texture.userData.muralSide = "stair-kiosk-lobby-wall";
  texture.userData.distinctArtwork = true;
  return texture;
}

export {
  createMaterialLibrary,
  createSignTexture,
  createBotanicalMuralTexture,
  createLobbyBarScreenTextures,
  createKioskShowtimeScreenTextures,
  createOppositeLobbyMuralTexture,
};
