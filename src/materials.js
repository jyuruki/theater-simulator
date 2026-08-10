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
  const random = seededRandom("cinema-seat-burgundy-v1");
  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#611d27");
  gradient.addColorStop(0.5, "#841f2a");
  gradient.addColorStop(1, "#4a1820");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  for (let index = 0; index < 8000; index += 1) {
    const x = random() * size;
    const y = random() * size;
    context.fillStyle = random() > 0.5 ? "#c85a62" : "#2c0d13";
    context.globalAlpha = 0.05 + random() * 0.16;
    context.fillRect(x, y, 0.45 + random() * 0.8, 0.45 + random() * 1.4);
  }

  context.globalAlpha = 0.16;
  context.strokeStyle = "#e27779";
  context.lineWidth = 0.6;
  for (let x = 0; x < size; x += 12) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, size);
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
  const wallMap = textureFrom(
    makeNoiseCanvas({ size: 256, seed: "warm-wall-v1", base: "#c8c3b9", spread: 19, density: 0.52 }),
    { name: "warm-painted-wall", repeat: [4, 4] },
  );
  const darkWallMap = textureFrom(
    makeNoiseCanvas({ size: 256, seed: "dark-wall-v1", base: "#2b292b", spread: 22, density: 0.56 }),
    { name: "charcoal-painted-wall", repeat: [5, 5] },
  );
  const acousticMap = textureFrom(createAcousticCanvas(), { name: "acoustic-fabric", repeat: [7, 7] });
  const seatMap = textureFrom(createSeatCanvas(), { name: "burgundy-seat-fabric", repeat: [3, 3] });
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
    seat: track(new THREE.MeshStandardMaterial({
      name: "Seat / burgundy woven fabric",
      color: 0xffffff,
      map: seatMap,
      bumpMap: wovenBump,
      bumpScale: 0.045,
      roughness: 0.91,
      metalness: 0,
    })),
    seatMetal: track(new THREE.MeshStandardMaterial({
      name: "Seat / powder-coated steel",
      color: 0x202124,
      roughness: 0.42,
      metalness: 0.72,
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
    stainless: track(new THREE.MeshStandardMaterial({
      name: "Metal / brushed stainless",
      color: 0xffffff,
      map: stainlessMap,
      bumpMap: microBump,
      bumpScale: 0.01,
      roughness: 0.3,
      metalness: 0.88,
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
  const width = options.width ?? 256;
  const height = options.height ?? 128;
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
  const width = 512;
  const height = 256;
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  const random = seededRandom("original-island-botanical-mural-v1");

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#efe3cf");
  background.addColorStop(0.52, "#d9d8c4");
  background.addColorStop(1, "#c9d6cf");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "#235461";
  context.globalAlpha = 0.18;
  context.lineWidth = 2;
  for (let wave = 0; wave < 7; wave += 1) {
    context.beginPath();
    context.moveTo(-20, 171 + wave * 11);
    for (let x = -20; x <= width + 20; x += 32) {
      context.quadraticCurveTo(x + 8, 163 + wave * 11, x + 16, 171 + wave * 11);
      context.quadraticCurveTo(x + 24, 179 + wave * 11, x + 32, 171 + wave * 11);
    }
    context.stroke();
  }
  context.globalAlpha = 1;

  context.strokeStyle = "#254f48";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(-12, 229);
  context.bezierCurveTo(97, 187, 113, 76, 235, 131);
  context.bezierCurveTo(329, 174, 366, 54, 530, 22);
  context.stroke();

  const leafPalette = ["#2f6b59", "#4d8170", "#76947b", "#235e69", "#a34b3f"];
  for (let index = 0; index < 39; index += 1) {
    const progress = index / 38;
    const x = -5 + progress * 530 + (random() - 0.5) * 22;
    const centerWave = 142 - Math.sin(progress * Math.PI * 2.1) * 70;
    const y = centerWave + (random() - 0.5) * 30;
    const upward = index % 2 ? -1 : 1;
    drawLeaf(
      context,
      x,
      y,
      24 + random() * 21,
      6 + random() * 7,
      upward * (0.46 + random() * 0.72),
      leafPalette[Math.floor(random() * leafPalette.length)],
      "#244942",
    );
  }

  drawHalfBlossom(context, 92, 112, 27, -0.65, "#d3685e");
  drawHalfBlossom(context, 258, 146, 31, 0.32, "#f2d9c5");
  drawHalfBlossom(context, 414, 69, 26, 2.35, "#ca5960");

  context.globalAlpha = 0.33;
  for (let dot = 0; dot < 115; dot += 1) {
    context.fillStyle = dot % 3 === 0 ? "#c8923e" : "#376b73";
    context.beginPath();
    context.arc(random() * width, random() * height, 0.5 + random() * 1.8, 0, TAU);
    context.fill();
  }
  context.globalAlpha = 1;

  const texture = canvasTexture(canvas, { name: "original-naupaka-inspired-botanical-mural", clamp: true, anisotropy: 4 });
  texture.userData.credit = "Original procedural island-botanical composition";
  return texture;
}

export { createMaterialLibrary, createSignTexture, createBotanicalMuralTexture };
