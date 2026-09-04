import * as THREE from "three";

// World-space finishes keep grout, dado and accent bands at physical heights
// across differently sized walls, including instanced BoxGeometry walls.
function finishMaterial(name, fragment, roughness) {
  const material = new THREE.MeshStandardMaterial({
    name,
    color: 0xffffff,
    roughness,
  });
  material.customProgramCacheKey = () => `mililani-v18-${name}`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vFinishWorld;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `
      #include <project_vertex>
      vec4 finishPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        finishPosition = instanceMatrix * finishPosition;
      #endif
      vFinishWorld = (modelMatrix * finishPosition).xyz;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vFinishWorld;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>\n${fragment}`,
    );
  };
  return material;
}

const rgb = (hex) =>
  `vec3(${new THREE.Color(hex)
    .toArray()
    .map((v) => v.toFixed(5))
    .join(",")})`;

export function createPhotoFinishMaterials() {
  const hallWall = finishMaterial(
    "Wall / gray above charcoal dado",
    `
    float y = vFinishWorld.y;
    vec3 finishColor = mix(${rgb("#303136")}, ${rgb("#b8b6b2")}, smoothstep(1.12,1.14,y));
    float chairRail = step(1.08,y) * (1.0-step(1.17,y));
    finishColor = mix(finishColor, ${rgb("#17191c")}, chairRail);
    finishColor = mix(finishColor, ${rgb("#191a1d")}, 1.0-step(0.13,y));
    diffuseColor.rgb *= finishColor;
  `,
    0.86,
  );
  const restroomWall = finishMaterial(
    "Restroom / white tile and red accent band",
    `
    float y = vFinishWorld.y;
    float along = vFinishWorld.x + vFinishWorld.z;
    vec2 grid = vec2(along,y) / 0.1524;
    vec2 edge = min(fract(grid),1.0-fract(grid));
    vec2 aa = max(fwidth(grid),vec2(0.002));
    float tile = smoothstep(0.018-aa.x,0.018+aa.x,edge.x) * smoothstep(0.018-aa.y,0.018+aa.y,edge.y);
    vec3 finishColor = mix(${rgb("#888d8d")}, ${rgb("#e5e3dc")}, step(1.10,y));
    float stripe = step(1.10,y)*(1.0-step(1.17,y));
    finishColor = mix(finishColor,${rgb("#a73b3f")},stripe);
    float blackAccent = step(0.88,fract(along/1.22))*step(1.17,y)*(1.0-step(1.32,y));
    finishColor = mix(finishColor,${rgb("#282b2c")},blackAccent);
    float diamond = abs(fract(along/1.83)-0.5)*1.83 + abs(y-2.12);
    finishColor = mix(finishColor,${rgb("#c9aa53")},1.0-smoothstep(0.105,0.115,diamond));
    finishColor = mix(finishColor,${rgb("#202426")},1.0-smoothstep(0.067,0.075,diamond));
    diffuseColor.rgb *= mix(${rgb("#adafac")},finishColor,tile);
  `,
    0.36,
  );
  const mosaicWall = finishMaterial(
    "Concession / white mosaic backsplash",
    `
    vec2 grid = vec2(vFinishWorld.x+vFinishWorld.z,vFinishWorld.y) / vec2(0.095,0.048);
    vec2 edge = min(fract(grid),1.0-fract(grid));
    vec2 aa = max(fwidth(grid),vec2(0.002));
    float tile = smoothstep(0.025-aa.x,0.025+aa.x,edge.x)*smoothstep(0.035-aa.y,0.035+aa.y,edge.y);
    float variation = fract(sin(dot(floor(grid),vec2(12.9898,78.233)))*43758.5453);
    vec3 ceramic = ${rgb("#e2e4df")} * (0.94+variation*0.06);
    diffuseColor.rgb *= mix(${rgb("#9da5a3")},ceramic,tile);
  `,
    0.3,
  );
  return { hallWall, restroomWall, mosaicWall };
}
