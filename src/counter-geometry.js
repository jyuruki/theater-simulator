import * as THREE from "three";
import { planToWorldX } from "./coordinates.js";

const EPS = 1e-7;
const point = (x, z) => ({ x, z });
const lerp = (a, b, t) => point(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);

/** Offset adjacent runs to their common miter, not two overlapping rectangles. */
export function buildCounterRibbon(points, depth) {
  const normals = points.slice(1).map((b, index) => {
    const a = points[index], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < EPS) throw new Error("Counter has a zero-length segment");
    return point(-(b.z - a.z) / length, (b.x - a.x) / length);
  });
  const left = [], right = [];
  points.forEach((p, index) => {
    const before = normals[Math.max(0, index - 1)], after = normals[Math.min(index, normals.length - 1)];
    const factor = depth / 2 / (1 + before.x * after.x + before.z * after.z);
    if (!Number.isFinite(factor) || factor > depth * 4) throw new Error("Counter turn is too sharp for a miter");
    const dx = (before.x + after.x) * factor, dz = (before.z + after.z) * factor;
    left.push(point(p.x + dx, p.z + dz));
    right.push(point(p.x - dx, p.z - dz));
  });
  return { contour: [...left, ...right.toReversed()], left, right,
    sections: points.slice(1).map((_, index) => [left[index], left[index + 1], right[index + 1], right[index]]) };
}

function clip(poly, axis, origin, distance, keepGreater) {
  const value = (p) => (p.x - origin.x) * axis.x + (p.z - origin.z) * axis.z - distance;
  const output = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], va = value(a), vb = value(b);
    const insideA = keepGreater ? va >= -EPS : va <= EPS;
    const insideB = keepGreater ? vb >= -EPS : vb <= EPS;
    if (insideA) output.push(a);
    if (insideA !== insideB) output.push(lerp(a, b, va / (va - vb)));
  }
  return output;
}

function polygonArea(poly) {
  return Math.abs(poly.reduce((sum, p, index) => {
    const q = poly[(index + 1) % poly.length];
    return sum + p.x * q.z - q.x * p.z;
  }, 0)) / 2;
}

function offsetPolygon(poly, distance) {
  const signed = poly.reduce((sum, p, i) => sum + p.x * poly[(i + 1) % poly.length].z - poly[(i + 1) % poly.length].x * p.z, 0);
  const normals = poly.map((p, index) => {
    const q = poly[(index + 1) % poly.length], length = Math.hypot(q.x - p.x, q.z - p.z), direction = signed > 0 ? 1 : -1;
    return point((q.z - p.z) / length * direction, -(q.x - p.x) / length * direction);
  });
  return poly.map((p, i) => {
    const a = normals[(i + poly.length - 1) % poly.length], b = normals[i];
    const scale = distance / (1 + a.x * b.x + a.z * b.z);
    return point(p.x + (a.x + b.x) * scale, p.z + (a.z + b.z) * scale);
  });
}

/** Small AABB slices follow a solid footprint without blocking diagonal aisles. */
function addPolygonColliders(colliders, id, polygon, bottom, top) {
  const minZ = Math.min(...polygon.map(p => p.z)), maxZ = Math.max(...polygon.map(p => p.z));
  const count = Math.max(1, Math.ceil((maxZ - minZ) / .14));
  for (let index = 0; index < count; index++) {
    const zMin = minZ + (maxZ - minZ) * index / count, zMax = minZ + (maxZ - minZ) * (index + 1) / count;
    let strip = clip(polygon, point(0, 1), point(0, 0), zMin, true);
    strip = clip(strip, point(0, 1), point(0, 0), zMax, false);
    if (strip.length < 3 || polygonArea(strip) < EPS) continue;
    const xs = strip.map(p => planToWorldX(p.x));
    colliders.push({ id: `${id}-collider-${index}`, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: zMin, maxZ: zMax, minY: bottom, maxY: top });
  }
}

export function createCounterBuilder({ root, colliders }) {
  const geometries = [];
  const meshes = [];
  function solid(id, polygon, bottomY, topY, material, surface) {
    if (polygon.length < 3 || polygonArea(polygon) < EPS) return null;
    const shape = new THREE.Shape(polygon.map(p => new THREE.Vector2(planToWorldX(p.x), p.z)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: topY - bottomY, bevelEnabled: false, steps: 1, curveSegments: 1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = id;
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = topY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.counterSurface = surface;
    mesh.userData.planPolygon = polygon.map(p => ({ ...p }));
    mesh.userData.bottomY = bottomY;
    mesh.userData.topY = topY;
    geometries.push(geometry);
    meshes.push(mesh);
    root.add(mesh);
    return mesh;
  }

  function customer(plan, serviceSequence, materials) {
    const points = plan.customerCounter;
    const base = buildCounterRibbon(points, 1.08), top = buildCounterRibbon(points, 1.3);
    solid("customer-counter-top", top.contour, 1.11, 1.21, materials.counterStone, "top");
    solid("customer-counter-plinth", base.contour, 0, .18, materials.stainless, "plinth");
    for (const section of plan.customerCounterSections) {
      const index = section.segmentIndex, start = points[index], end = points[index + 1];
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      const axis = point((end.x - start.x) / length, (end.z - start.z) / length);
      const cuts = section.role === "concession" ? serviceSequence.filter(p => p.type === "candy").map(p => {
        const center = (p.position[0] - start.x) * axis.x + (p.position[2] - start.z) * axis.z;
        return [center - p.footprint[0] / 2 - .025, center + p.footprint[0] / 2 + .025];
      }).sort((a, b) => a[0] - b[0]) : [];
      const ranges = [];
      let near = -Infinity;
      for (const [cutStart, cutEnd] of cuts) { ranges.push([near, cutStart]); near = cutEnd; }
      ranges.push([near, Infinity]);
      ranges.forEach(([lo, hi], piece) => {
        let polygon = base.sections[index];
        if (Number.isFinite(lo)) polygon = clip(polygon, axis, start, lo, true);
        if (Number.isFinite(hi)) polygon = clip(polygon, axis, start, hi, false);
        const mesh = solid(`${section.id}${ranges.length > 1 ? `-span-${piece}` : ""}`, polygon, .18, 1.11, materials[section.baseMaterialKey], "base");
        if (mesh) mesh.userData.counterSection = section.id;
      });
      addPolygonColliders(colliders, section.id, top.sections[index], 0, 1.21);
    }
    return { base, top };
  }

  function boxOffice(plan, materials) {
    const v = plan.boxOfficeVertical, h = plan.boxOfficeReturn;
    const corner = point(v.xMin, h.zMin), inside = point(v.xMax, h.zMax);
    const contour = [corner, point(h.xMax, h.zMin), point(h.xMax, h.zMax), inside, point(v.xMax, v.zMax), point(v.xMin, v.zMax)];
    const vertical = [corner, inside, point(v.xMax, v.zMax), point(v.xMin, v.zMax)];
    const horizontal = [corner, point(h.xMax, h.zMin), point(h.xMax, h.zMax), inside];
    solid("box-office-vertical", vertical, .14, 1.11, materials.counterWhite, "base");
    solid("box-office-return", horizontal, .14, 1.11, materials.wood, "base");
    solid("box-office-plinth", contour, 0, .14, materials.stainless, "plinth");
    solid("box-office-top", offsetPolygon(contour, .09), 1.11, 1.21, materials.counterStone, "top");
    addPolygonColliders(colliders, "box-office-vertical", vertical, 0, 1.21);
    addPolygonColliders(colliders, "box-office-return", horizontal, 0, 1.21);
    return { contour, vertical, horizontal };
  }

  return { customer, boxOffice, meshes, geometries };
}
