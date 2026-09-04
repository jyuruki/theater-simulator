import * as THREE from "three";
import { AUDITORIUMS, HALL_PLAN, PUBLIC_SPACES } from "./layout-data.js";
import { planToWorldX } from "./coordinates.js";
import { SHOWS } from "./showtimes.js";
import { createSignTexture } from "./materials.js";

function surface(width, height) {
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function createCinemaMedia({ scene, world, materials }) {
  const root = new THREE.Group();
  root.name = "V18 movie information";
  scene.add(root);
  const plane = new THREE.PlaneGeometry(1, 1),
    box = new THREE.BoxGeometry(1, 1, 1);
  const textures = [],
    ownedMaterials = [];
  const card = (name, texture, x, y, z, width, height, yaw = 0) => {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      toneMapped: false,
    });
    textures.push(texture);
    ownedMaterials.push(material);
    const mesh = new THREE.Mesh(plane, material);
    mesh.name = name;
    mesh.position.set(planToWorldX(x), y, z);
    mesh.rotation.y = yaw;
    mesh.scale.set(width, height, 1);
    root.add(mesh);
    return mesh;
  };
  // Each hanging placard has two independent front faces: no mirrored text
  // on the back, and a 3.1m underside safely above the walking camera.
  for (const room of AUDITORIUMS) {
    const show = SHOWS[room.number - 1];
    const hall =
      room.entry.center < HALL_PLAN.narrow.xMax
        ? HALL_PLAN.narrow
        : HALL_PLAN.wide;
    const z = room.screenSide === "south" ? hall.zMin + 0.9 : hall.zMax - 0.9;
    const x = room.entry.center;
    const texture = createSignTexture(
      `${room.number}  ${show.title.toUpperCase()}`,
      {
        width: 768,
        height: 320,
        subtitle: `${show.rating}   ${show.times.join("   ")}`,
        accent: show.accent,
        background: "#091326",
      },
    );
    card(
      `${room.id}-hanging-show-east`,
      texture,
      x + 0.047,
      3.58,
      z,
      1.7,
      0.8,
      -Math.PI / 2,
    );
    card(
      `${room.id}-hanging-show-west`,
      texture,
      x - 0.047,
      3.58,
      z,
      1.7,
      0.8,
      Math.PI / 2,
    );
    const housing = new THREE.Mesh(box, materials.black);
    housing.name = `${room.id}-show-housing`;
    housing.position.set(planToWorldX(x), 3.58, z);
    housing.scale.set(0.075, 0.86, 1.76);
    root.add(housing);
    for (const offset of [-0.56, 0.56]) {
      const hanger = new THREE.Mesh(box, materials.black);
      hanger.position.set(planToWorldX(x), 4.06, z + offset);
      hanger.scale.set(0.028, 0.11, 0.028);
      root.add(hanger);
      // A slim extension meets the underside of the existing 4.6m hall roof.
      const stem = new THREE.Mesh(box, materials.black);
      stem.position.set(planToWorldX(x), 4.335, z + offset);
      stem.scale.set(0.028, 0.44, 0.028);
      root.add(stem);
    }
  }

  const alcove = PUBLIC_SPACES.find(
    (space) => space.id === "ticket-poster-alcove",
  ).bounds;
  for (let index = 0; index < 3; index++) {
    const show = SHOWS[index * 5],
      canvas = surface(512, 768),
      ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b1423";
    ctx.fillRect(0, 0, 512, 768);
    const glow = ctx.createRadialGradient(260, 305, 8, 260, 305, 370);
    glow.addColorStop(0, show.accent);
    glow.addColorStop(1, "#08111f");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 680);
    ctx.fillStyle = "#091322";
    for (let ridge = 0; ridge < 5; ridge++) {
      ctx.globalAlpha = 0.45 + ridge * 0.1;
      ctx.beginPath();
      ctx.moveTo(0, 520 + ridge * 30);
      for (let x = 0; x <= 512; x += 8)
        ctx.lineTo(x, 490 + ridge * 34 + Math.sin(x / 95 + ridge) * 45);
      ctx.lineTo(512, 768);
      ctx.lineTo(0, 768);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#eadfbd";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(264, 294, 94, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#f4ecd8";
    ctx.textAlign = "center";
    ctx.font = "700 19px Arial";
    ctx.fillText("A MILILANI SCREEN STORY", 256, 65);
    const words = show.title.toUpperCase().split(" ");
    ctx.font = "700 47px Georgia";
    words.forEach((word, line) =>
      ctx.fillText(word, 256, 552 + line * 49, 460),
    );
    ctx.font = "18px Arial";
    ctx.fillText(`THEATER ${show.auditorium}   ·   ${show.rating}`, 256, 725);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const z = alcove.zMin + ((index + 0.5) * (alcove.zMax - alcove.zMin)) / 3;
    card(
      `approach-movie-poster-${index + 1}`,
      texture,
      alcove.xMin + 0.117,
      2.16,
      z,
      1.03,
      1.55,
      -Math.PI / 2,
    );
    const frame = new THREE.Mesh(box, materials.black);
    frame.position.set(planToWorldX(alcove.xMin + 0.096), 2.16, z);
    frame.scale.set(0.027, 1.64, 1.12);
    root.add(frame);
  }

  // A modest original animated pre-show, uploaded only while inside a bowl.
  const projectionCanvas = surface(1024, 512),
    ctx = projectionCanvas.getContext("2d");
  const projection = new THREE.CanvasTexture(projectionCanvas);
  projection.colorSpace = THREE.SRGBColorSpace;
  projection.generateMipmaps = false;
  projection.minFilter = THREE.LinearFilter;
  const projectionMaterial = new THREE.MeshBasicMaterial({
    map: projection,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  textures.push(projection);
  ownedMaterials.push(projectionMaterial);
  for (const room of AUDITORIUMS) {
    const screen = world.root.getObjectByName(`${room.id}-screen`);
    if (screen) screen.material = projectionMaterial;
  }
  let elapsed = 0,
    lastFrame = -1,
    lastRoom = "";
  function paint(roomId) {
    const number = Number(roomId?.replace("theater-", "")) || 1,
      show = SHOWS[number - 1] ?? SHOWS[0];
    const gradient = ctx.createLinearGradient(0, 0, 1024, 512);
    gradient.addColorStop(0, "#081329");
    gradient.addColorStop(0.55, "#123548");
    gradient.addColorStop(1, "#100f24");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 512);
    for (let star = 0; star < 95; star++) {
      const x =
          ((star * 137.13 + elapsed * ((star % 3) + 1) * 0.7) % 1080) - 28,
        y = (star * 81.71) % 490;
      ctx.globalAlpha = 0.22 + (Math.sin(elapsed * 0.5 + star) + 1) * 0.18;
      ctx.fillStyle = "#d8eef0";
      ctx.fillRect(x, y, star % 7 === 0 ? 2.5 : 1.2, 1.2);
    }
    ctx.globalAlpha = 0.36;
    ctx.strokeStyle = show.accent;
    ctx.lineWidth = 1.5;
    for (let ring = 0; ring < 12; ring++) {
      ctx.beginPath();
      ctx.ellipse(
        735,
        244,
        85 + ring * 10,
        85 + ring * 5,
        elapsed * 0.035 + ring * 0.02,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f1efde";
    ctx.textAlign = "left";
    ctx.font = "700 18px Arial";
    ctx.fillText(`MILILANI 14  /  THEATER ${number}`, 65, 113);
    ctx.font = "50px Georgia";
    ctx.fillText(show.title, 65, 200, 790);
    ctx.font = "21px Arial";
    const lines = [
      "Make yourself comfortable. Your story begins here.",
      "Please silence your phone and enjoy the show.",
      "Thank you for spending a little time at the movies.",
    ];
    ctx.fillText(lines[Math.floor(elapsed / 12) % lines.length], 65, 255, 890);
    ctx.fillStyle = "#819ea9";
    ctx.font = "16px Arial";
    ctx.fillText("ORIGINAL SIMULATOR PRE-SHOW", 65, 446);
    projection.needsUpdate = true;
  }
  paint("theater-1");
  return {
    update(delta, zone, active) {
      if (!active || !/^theater-\d+$/.test(zone)) return;
      elapsed += Math.min(delta, 0.1);
      const frame = Math.floor(elapsed * 6);
      if (frame !== lastFrame || zone !== lastRoom) {
        paint(zone);
        lastFrame = frame;
        lastRoom = zone;
      }
    },
    dispose() {
      root.removeFromParent();
      plane.dispose();
      box.dispose();
      new Set(textures).forEach((t) => t.dispose());
      ownedMaterials.forEach((m) => m.dispose());
    },
  };
}
