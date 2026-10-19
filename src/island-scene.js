import * as THREE from "./vendor/three.module.js";

// Original, code-authored Balinese landscape diorama. Positions use the camera-facing ground basis.
// The DOM buttons remain the accessible, authoritative lesson controls.
const PALETTE = {
  sea: 0x3faab4,
  foam: 0xc0f5eb,
  sand: 0xffe9b8,
  earth: 0xdba66e,
  grass: 0x9db85c,
  lime: 0xb5ce63,
  green: 0x86ba72,
  teal: 0x497f5d,
  pink: 0xf28db8,
  blush: 0xffb9d4,
  purple: 0x9373c6,
  roof: 0x46534a,
  coral: 0xb77f65,
  stone: 0xd2b99b,
  dark: 0x35463e,
  gold: 0xedc26a,
  cream: 0xfff6dd,
  ink: 0x65516d,
  white: 0xfffdf4,
  yellow: 0xffdf68,
};
const LOCATIONS = [
  [-5.7, 2.4],
  [-6.8, -1.9, 1],
  [-3.8, -2.8, 2.3],
  [-3.25, 0.35],
  [-2.5, 4.4],
  [0.15, 5.1],
  [3.1, 4.3],
  [5.1, 2.4, 1.1],
  [5.4, -0.8, 2.7],
  [2.3, -3.7],
  [-0.15, -1.3, 3.7],
];
const DEFAULT_ANGLE = Math.atan2(10, 22);
const groundPoint = (u, v, y = 0.67) =>
  new THREE.Vector3(
    u * Math.cos(DEFAULT_ANGLE) + v * Math.sin(DEFAULT_ANGLE),
    y,
    -u * Math.sin(DEFAULT_ANGLE) + v * Math.cos(DEFAULT_ANGLE),
  );

export function mountIsland(
  container,
  {
    nodes = [],
    currentIndex = 0,
    reducedMotion = false,
    onSelect,
    onStatus,
  } = {},
) {
  if (!container) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "island-canvas";
  canvas.setAttribute("aria-hidden", "true");
  let renderer;
  try {
    const context = canvas.getContext("webgl2", {
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    if (!context) {
      onStatus?.("fallback");
      return null;
    }
    renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: true,
      alpha: true,
    });
  } catch {
    onStatus?.("fallback");
    return null;
  }
  const fallback = nodes.map((node) => ({
    left: node.style.left,
    top: node.style.top,
  }));
  let disposed = false,
    contextLost = false,
    paused = false,
    frame = 0,
    angle = DEFAULT_ANGLE,
    zoom = 1;
  let width = 1,
    height = 1;
  let observer;
  const scene = new THREE.Scene();
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  const camera = new THREE.OrthographicCamera(-11, 11, 8, -8, 0.1, 100);
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  // Small deterministic, original surface maps; no downloaded textures or assets.
  const surfaceTexture = (kind) => {
    const size = 128,
      data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const grain = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        const noise = grain - Math.floor(grain);
        let value = 224 + noise * 27;
        if (kind === "masonry") {
          const row = Math.floor(y / 16),
            column = (x + (row % 2) * 16) % 32;
          if (y % 16 < 1 || column < 1) value = 170 + noise * 16;
          else
            value -=
              Math.sin(row * 13 + Math.floor((x + (row % 2) * 16) / 32) * 7) *
              9;
        } else if (kind === "roof") {
          value =
            205 + noise * 32 - (x % 5 === 0 ? 35 : 0) + Math.sin(y * 0.8) * 6;
        } else if (kind === "rock") {
          value =
            205 + noise * 33 + Math.sin(y * 0.22 + Math.sin(x * 0.06) * 2) * 14;
        } else if (kind === "water") {
          value =
            190 +
            Math.sin(x * 0.26 + Math.sin(y * 0.13)) * 24 +
            Math.sin(y * 0.34 + x * 0.1) * 18;
        }
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = Math.min(255, Math.max(0, value));
        data[i + 3] = 255;
      }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    texture.repeat.set(kind === "masonry" ? 2 : 3, kind === "masonry" ? 2 : 3);
    textures.add(texture);
    return texture;
  };
  const masonryTexture = surfaceTexture("masonry");
  const roofTexture = surfaceTexture("roof");
  const rockTexture = surfaceTexture("rock");
  const waterTexture = surfaceTexture("water");
  const makeGeometry = (geometry) => (geometries.add(geometry), geometry);
  const materialCache = new Map();
  const mat = (color, extra = {}) => {
    const key = `${color}:${JSON.stringify(extra)}`;
    if (!materialCache.has(key)) {
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.86,
        metalness: 0,
        ...extra,
      });
      if ([PALETTE.coral, PALETTE.stone].includes(color)) {
        material.map = masonryTexture;
        material.bumpMap = masonryTexture;
        material.bumpScale = 0.035;
      } else if ([PALETTE.roof, PALETTE.dark].includes(color)) {
        material.map = roofTexture;
        material.bumpMap = roofTexture;
        material.bumpScale = 0.025;
      }
      materialCache.set(key, material);
      materials.add(material);
    }
    return materialCache.get(key);
  };
  const unitBox = makeGeometry(new THREE.BoxGeometry(1, 1, 1));
  const sphere = makeGeometry(new THREE.SphereGeometry(1, 12, 8));
  const cylinder = makeGeometry(new THREE.CylinderGeometry(1, 1, 1, 20));
  const cone = makeGeometry(new THREE.ConeGeometry(1, 1, 20));
  const mesh = (geo, color, position, scale, parent = scene, shadow = true) => {
    const object = new THREE.Mesh(geo, mat(color));
    object.position.set(...position);
    object.scale.set(...scale);
    object.castShadow = shadow;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const box = (color, pos, scale, parent, shadow) =>
    mesh(unitBox, color, pos, scale, parent, shadow);
  const ball = (color, pos, scale, parent, shadow) =>
    mesh(sphere, color, pos, scale, parent, shadow);
  const cyl = (color, pos, scale, parent, shadow) =>
    mesh(cylinder, color, pos, scale, parent, shadow);
  const roof = (color, pos, scale, parent) =>
    mesh(cone, color, pos, scale, parent);
  const groupAt = (x, z, y = 0.64) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    scene.add(g);
    return g;
  };
  const sky = new THREE.HemisphereLight(0xffffff, 0x8eab9a, 1.95);
  scene.add(sky);
  const sunlight = new THREE.DirectionalLight(0xfff5e8, 2.05);
  sunlight.position.set(-9, 17, 10);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1536, 1536);
  Object.assign(sunlight.shadow.camera, {
    left: -12,
    right: 12,
    top: 12,
    bottom: -12,
    near: 1,
    far: 45,
  });
  sunlight.shadow.bias = -0.0004;
  sunlight.shadow.normalBias = 0.035;
  sunlight.shadow.radius = 3;
  scene.add(sunlight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // A compact imaginary Bali, not a geographically accurate map. Each landmark is
  // authored from geometry: Candi Bentar, Meru, terraces and offshore temple rocks.
  const orientedGroup = (u, v, y = 0.75) => {
    const p = groundPoint(u, v, y);
    const g = groupAt(p.x, p.z, y);
    g.rotation.y = DEFAULT_ANGLE;
    return g;
  };
  const instanced = (geo, color, transforms, shadows = true) => {
    const inst = new THREE.InstancedMesh(geo, mat(color), transforms.length);
    const dummy = new THREE.Object3D();
    transforms.forEach((t, i) => {
      dummy.position.set(...t.p);
      dummy.scale.set(...t.s);
      dummy.rotation.set(...(t.r || [0, 0, 0]));
      if (t.q) dummy.quaternion.copy(t.q);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.castShadow = shadows;
    inst.receiveShadow = true;
    scene.add(inst);
    return inst;
  };
  const rockGeo = makeGeometry(new THREE.IcosahedronGeometry(1, 2));
  const rockPosition = rockGeo.getAttribute("position");
  for (let i = 0; i < rockPosition.count; i++) {
    const x = rockPosition.getX(i),
      y = rockPosition.getY(i),
      z = rockPosition.getZ(i);
    const uneven =
      1 +
      0.085 * Math.sin(x * 12 + z * 7) * Math.cos(y * 9) +
      0.05 * Math.sin(z * 15 - y * 4);
    rockPosition.setXYZ(i, x * uneven, y * uneven, z * uneven);
  }
  rockGeo.computeVertexNormals();
  // Many irregular sedimentary ledges replace the four giant pyramid-like facets.
  const floatingRock = (u, v, radius, depth, top = 0.18, stretch = 0.78) => {
    const p = groundPoint(u, v),
      count = 72,
      levels = 11,
      vertices = [],
      colors = [],
      uvs = [],
      indices = [];
    const radii = [
      1, 0.99, 0.94, 0.95, 0.86, 0.83, 0.73, 0.65, 0.48, 0.29, 0.13,
    ];
    for (let level = 0; level < levels; level++)
      for (let i = 0; i <= count; i++) {
        const a = ((i % count) / count) * Math.PI * 2,
          t = level / (levels - 1);
        const wobble =
          1 +
          0.045 * Math.sin(a * 5) +
          0.025 * Math.cos(a * 9) +
          0.018 * Math.sin(a * 19 + level * 0.7);
        const r = radius * radii[level] * wobble;
        const y =
          top - t * depth + (level ? Math.sin(a * 8 + level * 0.5) * 0.055 : 0);
        vertices.push(Math.cos(a) * r, y, Math.sin(a) * r * stretch);
        const shade =
          0.9 +
          0.06 * Math.sin(a * 9 + level * 0.5) +
          0.04 * Math.cos(level * 2.7);
        const color = new THREE.Color(
          level < 3 ? 0x879480 : level < 7 ? 0x75877d : 0x62796f,
        ).multiplyScalar(shade);
        colors.push(color.r, color.g, color.b);
        uvs.push((i / count) * 3, t * 2);
        if (level < levels - 1 && i < count) {
          const j = level * (count + 1) + i,
            k = j + count + 1;
          indices.push(j, k, j + 1, j + 1, k, k + 1);
        }
      }
    const geo = makeGeometry(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const material = mat(0xffffff, {
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    material.map = rockTexture;
    material.bumpMap = rockTexture;
    material.bumpScale = 0.09;
    const rock = new THREE.Mesh(geo, material);
    rock.position.set(p.x, 0, p.z);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    return rock;
  };
  floatingRock(0, 0, 7.1, 4.6, 0.3, 0.78);
  const coast = new THREE.Shape();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2,
      w =
        1 +
        0.055 * Math.sin(a * 5) +
        0.025 * Math.cos(a * 9) +
        0.012 * Math.sin(a * 17);
    const x = Math.cos(a) * 7.05 * w,
      z = Math.sin(a) * 5.5 * w;
    if (i === 0) coast.moveTo(x, z);
    else coast.lineTo(x, z);
  }
  coast.closePath();
  const slabGeo = makeGeometry(
    new THREE.ExtrudeGeometry(coast, {
      depth: 0.26,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.1,
      bevelThickness: 0.08,
    }),
  );
  const land = mesh(slabGeo, PALETTE.sand, [0, 0.3, 0], [1, 1, 1]);
  land.rotation.x = -Math.PI / 2;
  const groundVertices = [],
    groundColors = [],
    groundIndices = [];
  const groundSegments = 80,
    groundRings = 12;
  for (let ring = 0; ring <= groundRings; ring++)
    for (let i = 0; i <= groundSegments; i++) {
      const a = (i / groundSegments) * Math.PI * 2,
        t = ring / groundRings;
      const w =
        1 +
        0.055 * Math.sin(a * 5) +
        0.025 * Math.cos(a * 9) +
        0.012 * Math.sin(a * 17);
      const x = Math.cos(a) * 7.05 * w * t,
        z = Math.sin(a) * 5.5 * w * t;
      const elevation = 0.018 * Math.sin(x * 1.2) * Math.cos(z * 0.8);
      groundVertices.push(x, z, elevation);
      const shade =
        0.94 +
        0.055 * Math.sin(x * 0.9 + z * 0.7) +
        0.035 * Math.cos(z * 2 - x * 0.6);
      groundColors.push(shade, shade, shade * 0.98);
      if (ring < groundRings && i < groundSegments) {
        const j = ring * (groundSegments + 1) + i,
          k = j + groundSegments + 1;
        groundIndices.push(j, k, j + 1, j + 1, k, k + 1);
      }
    }
  const surfaceGeo = makeGeometry(new THREE.BufferGeometry());
  surfaceGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(groundVertices, 3),
  );
  surfaceGeo.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(groundColors, 3),
  );
  surfaceGeo.setIndex(groundIndices);
  surfaceGeo.computeVertexNormals();
  const turf = mesh(surfaceGeo, PALETTE.grass, [0, 0.705, 0], [0.95, 0.93, 1]);
  turf.material = mat(PALETTE.grass, { vertexColors: true });
  turf.rotation.x = -Math.PI / 2;
  const bottomRocks = [];
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996,
      r = 4.5 + (i % 3) * 0.7;
    bottomRocks.push({
      p: [Math.cos(a) * r, -0.7 - (i % 3) * 0.62, Math.sin(a) * r * 0.78],
      s: [0.6 + (i % 3) * 0.2, 0.6 + (i % 4) * 0.26, 0.6],
      r: [a, 0.3, a * 0.2],
    });
  }
  instanced(rockGeo, 0x72908a, bottomRocks);
  const driftingRocks = [];
  for (const [u, v, y, sz] of [
    [-7.6, 1, -2.6, 0.62],
    [6.9, 3.3, -2.8, 0.8],
    [-4, 6.2, -4.3, 0.42],
    [3.2, 5.6, -4.9, 0.6],
  ]) {
    const p = groundPoint(u, v, y);
    driftingRocks.push({
      p: [p.x, y, p.z],
      s: [sz, sz * 1.2, sz],
      r: [0.2, u, 0.4],
    });
  }
  instanced(rockGeo, 0x92aba0, driftingRocks);

  // Cream paths connect the chapter areas without drawing a UI route over the world.
  const pathPoints = LOCATIONS.map(([u, v]) =>
    groundPoint(u * 0.79, v * 0.79, 0.75),
  );
  const pathCurve = new THREE.CatmullRomCurve3(
    pathPoints,
    true,
    "catmullrom",
    0.35,
  );
  const pathGeo = makeGeometry(
    new THREE.TubeGeometry(pathCurve, 100, 0.16, 6, true),
  );
  mesh(pathGeo, PALETTE.cream, [0, 0.63, 0], [1, 0.16, 1], scene, false);
  const markerPoints = LOCATIONS.map(([u, v, y]) =>
    groundPoint(u, v, y ?? 0.93),
  );
  const markerTargets = [];
  markerPoints.forEach((p, i) => {
    const platform = cyl(
      i === currentIndex ? PALETTE.pink : PALETTE.cream,
      [p.x, p.y - 0.12, p.z],
      [0.24, 0.07, 0.24],
    );
    platform.userData.chapter = i;
    markerTargets.push(platform);
  });

  // Meru roofs are square, tiered and overhanging, with gold finials.
  // Concave thatch roof slopes, fine eaves and separate tiers instead of boxy pyramids.
  const roofPositions = [],
    roofUvs = [],
    roofIndices = [];
  const roofRows = 14,
    roofColumns = 12;
  for (let face = 0; face < 4; face++)
    for (let row = 0; row <= roofRows; row++)
      for (let column = 0; column <= roofColumns; column++) {
        const t = row / roofRows,
          q = (column / roofColumns) * 2 - 1,
          half = 0.707 * (0.22 + 0.78 * t);
        const y =
          0.34 * Math.pow(1 - t, 1.7) -
          0.19 +
          0.055 * Math.pow(t, 5) * Math.pow(Math.abs(q), 4);
        const x = q * half,
          z = half,
          a = (face * Math.PI) / 2;
        roofPositions.push(
          x * Math.cos(a) - z * Math.sin(a),
          y,
          x * Math.sin(a) + z * Math.cos(a),
        );
        roofUvs.push(column / roofColumns, t);
        if (row < roofRows && column < roofColumns) {
          const j =
              face * (roofRows + 1) * (roofColumns + 1) +
              row * (roofColumns + 1) +
              column,
            k = j + roofColumns + 1;
          roofIndices.push(j, k, j + 1, j + 1, k, k + 1);
        }
      }
  const meruRoofGeo = makeGeometry(new THREE.BufferGeometry());
  meruRoofGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(roofPositions, 3),
  );
  meruRoofGeo.setAttribute("uv", new THREE.Float32BufferAttribute(roofUvs, 2));
  meruRoofGeo.setIndex(roofIndices);
  meruRoofGeo.computeVertexNormals();
  const shrineGroups = [];
  const meru = (u, v, y, size = 1, tiers = 4) => {
    const g = orientedGroup(u, v, y);
    g.scale.setScalar(size);
    shrineGroups.push(g);
    box(PALETTE.stone, [0, 0.13, 0], [2.3, 0.26, 1.9], g);
    box(PALETTE.coral, [0, 0.36, 0], [1.9, 0.23, 1.55], g);
    box(PALETTE.stone, [0, 0.53, 0], [1.7, 0.13, 1.4], g);
    box(PALETTE.coral, [0, 1.05, 0], [1.1, 0.98, 1], g);
    box(PALETTE.dark, [0, 1.06, 0.515], [0.45, 0.7, 0.03], g, false);
    for (let i = 0; i < tiers; i++) {
      const w = 1.44 - i * 0.18,
        y = 1.68 + i * 0.59;
      mesh(
        meruRoofGeo,
        i % 2 ? PALETTE.roof : PALETTE.dark,
        [0, y, 0],
        [w, 1, w * 0.87],
        g,
      );
      box(
        PALETTE.earth,
        [0, y - 0.205, 0],
        [w * 1.42, 0.022, w * 1.24],
        g,
        false,
      );
      if (i < tiers - 1)
        box(PALETTE.coral, [0, y + 0.22, 0], [0.64, 0.32, 0.6], g);
    }
    const top = 1.68 + (tiers - 1) * 0.59;
    cyl(PALETTE.gold, [0, top + 0.54, 0], [0.047, 0.57, 0.047], g);
    ball(PALETTE.gold, [0, top + 0.85, 0], [0.1, 0.13, 0.1], g);
    for (let i = 0; i < 3; i++)
      box(
        PALETTE.stone,
        [0, 0.07 + i * 0.07, 1.2 - i * 0.16],
        [1.1, 0.12, 0.26],
        g,
      );
    return g;
  };
  meru(0.7, -1.55, 0.78, 1.12, 5);
  // Candi Bentar: two split sandstone silhouettes frame the processional path.
  const gate = orientedGroup(-0.35, 1.12, 0.75);
  for (const side of [-1, 1]) {
    const outline = new THREE.Shape();
    const points = [
      [0.43, 0],
      [1.55, 0],
      [1.55, 0.28],
      [1.4, 0.28],
      [1.4, 0.92],
      [1.24, 0.92],
      [1.24, 1.5],
      [1.06, 1.5],
      [1.06, 2.05],
      [0.88, 2.05],
      [0.88, 2.55],
      [0.68, 2.95],
      [0.43, 3.24],
    ];
    points.forEach(([x, y], i) =>
      i ? outline.lineTo(x * side, y) : outline.moveTo(x * side, y),
    );
    outline.closePath();
    const geo = makeGeometry(
      new THREE.ExtrudeGeometry(outline, {
        depth: 0.65,
        bevelEnabled: true,
        bevelSize: 0.045,
        bevelThickness: 0.04,
        bevelSegments: 2,
      }),
    );
    mesh(geo, PALETTE.coral, [0, 0, -0.3], [1, 1, 1], gate);
    for (let level = 0; level < 4; level++) {
      const w = 1.18 - level * 0.17;
      box(
        PALETTE.stone,
        [side * (0.43 + w / 2), 0.28 + level * 0.58, 0.04],
        [w + 0.1, 0.12, 0.84],
        gate,
      );
    }
    box(
      PALETTE.gold,
      [side * 0.58, 1.45, 0.39],
      [0.045, 2.4, 0.04],
      gate,
      false,
    );
    for (let j = 0; j < 3; j++)
      ball(
        PALETTE.gold,
        [side * (1.15 - j * 0.14), 0.59 + j * 0.65, 0.4],
        [0.1, 0.11, 0.06],
        gate,
        false,
      );
  }
  for (let i = 0; i < 4; i++)
    box(
      PALETTE.stone,
      [0, -0.01 + i * 0.055, 1.05 - i * 0.2],
      [3.5 - i * 0.17, 0.12, 0.27],
      gate,
    );
  // Small ceremonial umbrella at the gateway.
  cyl(PALETTE.coral, [-2.1, 1.24, 1.6], [0.04, 2.4, 0.04], gate, false);
  roof(PALETTE.cream, [-2.1, 2.48, 1.6], [0.67, 0.25, 0.67], gate);
  ball(PALETTE.gold, [-2.1, 2.65, 1.6], [0.07, 0.11, 0.07], gate);

  // Tegallalang-inspired stepped paddies: nested, bowed contours and bright crop rows.
  const terrace = orientedGroup(-3.8, -1.45, 0.73);
  terrace.rotation.y -= 0.25;
  const riceTufts = [];
  terrace.updateMatrixWorld(true);
  for (let level = 0; level < 5; level++) {
    const shape = new THREE.Shape(),
      rx = 2.5 - level * 0.34,
      rz = 1.8 - level * 0.23;
    for (let i = 0; i <= 44; i++) {
      const a = (i / 44) * Math.PI * 2,
        w = 1 + 0.1 * Math.sin(a * 3) + 0.035 * Math.cos(a * 5 + level * 0.15);
      const x = Math.cos(a) * rx * w,
        z = Math.sin(a) * rz * w;
      if (i === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }
    shape.closePath();
    const geo = makeGeometry(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.23,
        bevelEnabled: true,
        bevelThickness: 0.035,
        bevelSize: 0.04,
        bevelSegments: 1,
      }),
    );
    const bank = mesh(
      geo,
      level % 2 ? 0x66874c : 0x789553,
      [0, level * 0.28, -level * 0.13],
      [1, 1, 1],
      terrace,
    );
    bank.rotation.x = -Math.PI / 2;
    const top = mesh(
      makeGeometry(new THREE.ShapeGeometry(shape)),
      level % 2 ? 0xbed171 : 0xa1be62,
      [0, level * 0.28 + 0.272, -level * 0.13],
      [0.96, 0.94, 1],
      terrace,
      false,
    );
    top.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 78; i++) {
      const a = (i / 78) * Math.PI * 2,
        w = 1 + 0.1 * Math.sin(a * 3) + 0.035 * Math.cos(a * 5 + level * 0.15);
      const point = new THREE.Vector3(
        Math.cos(a) * rx * w * 0.9,
        level * 0.28 + 0.29,
        -Math.sin(a) * rz * w * 0.9 - level * 0.13,
      ).applyMatrix4(terrace.matrixWorld);
      riceTufts.push({
        p: point.toArray(),
        s: [0.8, 0.9 + (i % 4) * 0.15, 0.8],
        r: [0, a, 0],
      });
    }
  }
  const riceGeo = makeGeometry(new THREE.BufferGeometry());
  riceGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.025, 0, 0, 0, 0.17, 0.025, 0.02, 0, 0, 0, 0, -0.025, 0.03, 0.14, 0,
        0, 0, 0.025, -0.02, 0, -0.02, -0.04, 0.12, 0.035, 0.015, 0, 0.015,
      ],
      3,
    ),
  );
  riceGeo.computeVertexNormals();
  const rice = instanced(riceGeo, 0x527d35, riceTufts, false);
  rice.material = mat(0x527d35, { side: THREE.DoubleSide });

  // Detached Tanah Lot-inspired rock temple, joined only by a small ribbon of cloud.
  floatingRock(-6.8, -1.9, 1.55, 2.7, 0.5, 0.78);
  const satellite = orientedGroup(-6.8, -1.9, 0.52);
  cyl(PALETTE.grass, [0, 0.12, 0], [1.48, 0.22, 1.13], satellite);
  meru(-6.8, -1.9, 0.75, 0.6, 3);
  // Uluwatu-inspired elevated cliff and its small seaward shrine.
  const cliff = orientedGroup(4.35, -1.55, 0.7);
  mesh(rockGeo, 0x9cac83, [0, 0.75, 0], [1.7, 1.3, 1.5], cliff);
  cyl(PALETTE.grass, [0, 1.62, 0], [1.48, 0.18, 1.3], cliff);
  meru(4.35, -1.55, 2.45, 0.62, 3);
  // Broken Beach-inspired natural arch (not Kelingking, whose shape is a T-Rex cliff).
  const arch = orientedGroup(4.7, 2.9, 0.72);
  const archShape = new THREE.Shape();
  archShape.moveTo(-1.35, 0);
  archShape.lineTo(-1.35, 0.82);
  archShape.absarc(0, 0.82, 1.35, Math.PI, 0, true);
  archShape.lineTo(1.35, 0);
  archShape.lineTo(0.77, 0);
  archShape.lineTo(0.77, 0.7);
  archShape.absarc(0, 0.7, 0.77, 0, Math.PI, false);
  archShape.lineTo(-0.77, 0);
  archShape.closePath();
  const archGeo = makeGeometry(
    new THREE.ExtrudeGeometry(archShape, {
      depth: 0.8,
      bevelEnabled: true,
      bevelSize: 0.08,
      bevelThickness: 0.08,
      bevelSegments: 2,
    }),
  );
  mesh(archGeo, PALETTE.stone, [0, 0, -0.4], [1, 1, 1], arch);
  ball(PALETTE.grass, [0, 2.08, 0], [1.18, 0.16, 0.55], arch);

  // Tropical lagoon, white beach edge, and a little outrigger boat.
  const lagoon = orientedGroup(0.35, 3.9, 0.78);
  const lagoonShape = new THREE.Shape();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2,
      w = 1 + 0.055 * Math.sin(a * 3) + 0.025 * Math.cos(a * 5);
    const x = Math.cos(a) * 2.15 * w,
      z = Math.sin(a) * 1.1 * w;
    if (i) lagoonShape.lineTo(x, z);
    else lagoonShape.moveTo(x, z);
  }
  lagoonShape.closePath();
  const lagoonGeo = makeGeometry(new THREE.ShapeGeometry(lagoonShape, 48));
  const beach = mesh(
    lagoonGeo,
    PALETTE.cream,
    [0, -0.025, 0],
    [1.13, 1.15, 1],
    lagoon,
    false,
  );
  beach.rotation.x = -Math.PI / 2;
  const water = mesh(
    lagoonGeo,
    PALETTE.sea,
    [0, 0, 0],
    [1, 1, 1],
    lagoon,
    false,
  );
  water.rotation.x = -Math.PI / 2;
  water.material = mat(PALETTE.sea, {
    transparent: true,
    opacity: 0.76,
    roughness: 0.19,
    metalness: 0.06,
    depthWrite: false,
  });
  water.material.bumpMap = waterTexture;
  water.material.bumpScale = 0.025;
  const deepWater = mesh(
    lagoonGeo,
    0x369398,
    [0, -0.012, 0],
    [0.78, 0.7, 1],
    lagoon,
    false,
  );
  deepWater.rotation.x = -Math.PI / 2;
  deepWater.material = mat(0x369398, { roughness: 0.35 });
  const rippleGeo = makeGeometry(new THREE.TorusGeometry(0.53, 0.009, 4, 44));
  const ripples = [];
  for (const [x, z, scale] of [
    [-0.8, 0.2, 1],
    [0.7, -0.2, 0.8],
  ]) {
    const ring = mesh(
      rippleGeo,
      PALETTE.foam,
      [x, 0.025, z],
      [scale, scale * 0.45, scale],
      lagoon,
      false,
    );
    ring.rotation.x = -Math.PI / 2;
    ripples.push(ring);
  }
  const boat = orientedGroup(0.8, 3.85, 0.89);
  boat.rotation.y += 0.45;
  ball(PALETTE.coral, [0, 0, 0], [0.26, 0.17, 0.69], boat);
  box(PALETTE.cream, [0, 0.08, 0], [0.36, 0.07, 0.95], boat);
  for (const z of [-0.3, 0.3])
    box(PALETTE.stone, [0, 0.09, z], [1.15, 0.04, 0.04], boat, false);
  for (const x of [-0.55, 0.55])
    ball(PALETTE.cream, [x, 0.07, 0], [0.045, 0.055, 0.6], boat, false);
  cyl(PALETTE.dark, [0, 0.64, 0], [0.025, 1.1, 0.025], boat, false);
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0);
  sailShape.lineTo(0, 0.94);
  sailShape.lineTo(0.51, 0.08);
  sailShape.closePath();
  const sail = new THREE.Mesh(
    makeGeometry(new THREE.ShapeGeometry(sailShape)),
    mat(PALETTE.pink, { side: THREE.DoubleSide }),
  );
  sail.position.set(0.035, 0.25, 0);
  boat.add(sail);

  // Water falls from the lagoon over the hanging rock. Thin drifting droplets provide motion.
  const waterfall = orientedGroup(-1.05, 5.0, 0);
  const fallCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.79, -0.35),
    new THREE.Vector3(0, 0.68, 0.24),
    new THREE.Vector3(0, -0.35, 0.46),
    new THREE.Vector3(0.05, -2.3, 0.66),
    new THREE.Vector3(0.15, -4.8, 0.9),
  ]);
  const fallPositions = [],
    fallUvs = [],
    fallIndices = [];
  for (let i = 0; i <= 36; i++) {
    const t = i / 36,
      p = fallCurve.getPoint(t),
      w = 0.28 * (1 - t * 0.3);
    fallPositions.push(p.x - w, p.y, p.z, p.x + w, p.y, p.z);
    fallUvs.push(0, t * 3, 1, t * 3);
    if (i < 36) {
      const j = i * 2;
      fallIndices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
    }
  }
  const fallGeo = makeGeometry(new THREE.BufferGeometry());
  fallGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(fallPositions, 3),
  );
  fallGeo.setAttribute("uv", new THREE.Float32BufferAttribute(fallUvs, 2));
  fallGeo.setIndex(fallIndices);
  fallGeo.computeVertexNormals();
  const fallingWater = mesh(
    fallGeo,
    PALETTE.sea,
    [0, 0, 0],
    [1, 1, 1],
    waterfall,
    false,
  );
  fallingWater.material = mat(PALETTE.sea, {
    transparent: true,
    opacity: 0.7,
    roughness: 0.23,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  fallingWater.material.bumpMap = waterTexture;
  fallingWater.material.bumpScale = 0.025;
  const shineGeo = makeGeometry(
    new THREE.TubeGeometry(fallCurve, 28, 0.012, 5, false),
  );
  for (const x of [-0.2, 0.03, 0.22])
    mesh(shineGeo, PALETTE.foam, [x, 0, 0.11], [1, 1, 1], waterfall, false);
  const drops = [];
  for (let i = 0; i < 5; i++)
    drops.push(
      ball(
        PALETTE.foam,
        [((i % 3) - 1) * 0.18, -i, 0.77],
        [0.035, 0.17, 0.035],
        waterfall,
        false,
      ),
    );

  // Pavilion beside the paddies.
  const pavilion = orientedGroup(-3.5, 2.0, 0.76);
  box(PALETTE.stone, [0, 0.12, 0], [1.65, 0.24, 1.3], pavilion);
  for (const x of [-0.57, 0.57])
    for (const z of [-0.4, 0.4])
      box(PALETTE.coral, [x, 0.72, z], [0.1, 1.15, 0.1], pavilion);
  mesh(meruRoofGeo, PALETTE.coral, [0, 1.4, 0], [1.3, 1, 1.05], pavilion);
  box(PALETTE.gold, [0, 1.15, 0], [1.85, 0.05, 1.5], pavilion, false);

  // Carved stone panels and door surrounds share instance buffers.
  const reliefStone = [],
    reliefRecess = [];
  const relief = (list, parent, position, scale, zRotation = 0) => {
    parent.updateMatrixWorld(true);
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, zRotation)),
      new THREE.Vector3(...scale),
    );
    local.premultiply(parent.matrixWorld);
    const p = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      size = new THREE.Vector3();
    local.decompose(p, q, size);
    list.push({ p: p.toArray(), s: size.toArray(), q });
  };
  for (const side of [-1, 1])
    for (let level = 0; level < 3; level++) {
      const x = side * (1.08 - level * 0.14),
        y = 0.58 + level * 0.59;
      relief(reliefRecess, gate, [x, y, 0.375], [0.32, 0.27, 0.025]);
      relief(reliefStone, gate, [x, y, 0.41], [0.11, 0.11, 0.055], Math.PI / 4);
      for (const edge of [-1, 1])
        relief(
          reliefStone,
          gate,
          [x + edge * 0.17, y, 0.4],
          [0.035, 0.32, 0.05],
        );
      for (const edge of [-1, 1])
        relief(
          reliefStone,
          gate,
          [x, y + edge * 0.16, 0.4],
          [0.37, 0.035, 0.05],
        );
    }
  shrineGroups.forEach((g) => {
    for (const x of [-0.29, 0.29])
      relief(reliefStone, g, [x, 1.04, 0.55], [0.065, 0.8, 0.065]);
    relief(reliefStone, g, [0, 1.44, 0.55], [0.66, 0.07, 0.07]);
    for (let i = 0; i < 9; i++)
      relief(
        reliefStone,
        g,
        [-0.78 + i * 0.195, 0.37, 0.8],
        [0.1, 0.09, 0.05],
        Math.PI / 4,
      );
  });
  instanced(unitBox, PALETTE.stone, reliefStone);
  instanced(unitBox, 0x745f4d, reliefRecess, false);

  // Feathered coconut fronds: a curved rachis and narrow paired leaflets.
  const leafVertices = [],
    leafIndices = [];
  const leafTriangle = (a, b, c) => {
    const n = leafVertices.length / 3;
    leafVertices.push(...a, ...b, ...c);
    leafIndices.push(n, n + 1, n + 2);
  };
  const leafPoint = (t) => [
    t * 1.75,
    Math.sin(t * Math.PI) * 0.32 - t * t * 0.42,
    0,
  ];
  for (let i = 0; i < 14; i++) {
    const t = i / 14,
      next = (i + 1) / 14,
      a = leafPoint(t),
      b = leafPoint(next);
    leafTriangle([a[0], a[1], -0.012], [b[0], b[1], 0], [a[0], a[1], 0.012]);
    if (i < 2) continue;
    const spread = Math.sin(t * Math.PI) * 0.34;
    for (const side of [-1, 1]) {
      const tip = [a[0] + 0.22, a[1] - 0.09, side * spread];
      leafTriangle([a[0] - 0.035, a[1], side * 0.005], tip, [
        a[0] + 0.045,
        a[1] + 0.012,
        side * 0.02,
      ]);
      leafTriangle([a[0] + 0.045, a[1] + 0.012, side * 0.02], tip, [
        a[0] + 0.075,
        a[1] - 0.015,
        side * 0.035,
      ]);
    }
  }
  const leafGeo = makeGeometry(new THREE.BufferGeometry());
  leafGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(leafVertices, 3),
  );
  leafGeo.setIndex(leafIndices);
  leafGeo.computeVertexNormals();
  const palms = [
    [-5.2, 0.3, 1.5],
    [-4.8, 2.9, 1.25],
    [-2.8, 4.4, 1.4],
    [2.7, 4.25, 1.35],
    [5.7, 0.5, 1.5],
    [2.5, -3.9, 1.5],
    [-2.4, -3.8, 1.25],
    [0.1, -4.25, 1.1],
  ];
  const trunks = [],
    palmLeaves = [[], []],
    coconuts = [];
  palms.forEach(([u, v, sz], i) => {
    const p = groundPoint(u, v, 0.74),
      lean = (i % 2 ? 1 : -1) * 0.18;
    for (let j = 0; j < 5; j++) {
      const t = j / 5,
        a = new THREE.Vector3(p.x + lean * t * t, 0.74 + t * sz * 1.55, p.z),
        b = new THREE.Vector3(
          p.x + lean * (t + 0.2) ** 2,
          0.74 + (t + 0.2) * sz * 1.55,
          p.z,
        );
      const d = b.clone().sub(a);
      trunks.push({
        p: a.add(b).multiplyScalar(0.5).toArray(),
        s: [0.075 * sz, d.length(), 0.075 * sz],
        q: new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          d.normalize(),
        ),
      });
    }
    const crown = [p.x + lean, 0.74 + sz * 1.55, p.z];
    for (let j = 0; j < 7; j++)
      palmLeaves[j % 2].push({
        p: crown,
        s: [sz * 0.72, sz * 0.72, sz * 0.72],
        r: [0, (j / 7) * Math.PI * 2 + i * 0.4, -0.08],
      });
    for (let j = 0; j < 3; j++)
      coconuts.push({
        p: [
          crown[0] + Math.cos(j * 2.1) * 0.14,
          crown[1] - 0.1,
          crown[2] + Math.sin(j * 2.1) * 0.14,
        ],
        s: [0.1, 0.12, 0.1],
      });
  });
  instanced(cylinder, PALETTE.earth, trunks);
  palmLeaves.forEach((list, i) => {
    const leaves = instanced(leafGeo, i ? PALETTE.lime : PALETTE.teal, list);
    leaves.material = mat(i ? PALETTE.lime : PALETTE.teal, {
      side: THREE.DoubleSide,
    });
  });
  instanced(sphere, PALETTE.earth, coconuts);
  // Rounded jungle clusters, pink frangipani and small shoreline stones.
  const bushes = [],
    flowerPetals = [],
    flowerCentres = [],
    stones = [];
  for (let i = 0; i < 27; i++) {
    const a = i * 2.39996,
      r = 4.7 + (i % 3) * 0.45,
      p = groundPoint(Math.cos(a) * r, Math.sin(a) * r * 0.72, 0.82);
    bushes.push({
      p: [p.x, 0.96, p.z],
      s: [0.25 + (i % 3) * 0.08, 0.26, 0.28],
    });
    for (let lobe = 0; lobe < 2; lobe++)
      bushes.push({
        p: [
          p.x + Math.cos(a + lobe * 2) * 0.18,
          1.02 + lobe * 0.04,
          p.z + Math.sin(a + lobe * 2) * 0.17,
        ],
        s: [0.17, 0.19, 0.18],
      });
    if (i % 2 === 0) {
      flowerCentres.push({ p: [p.x, 1.2, p.z], s: [0.055, 0.04, 0.055] });
      for (let j = 0; j < 5; j++)
        flowerPetals.push({
          p: [
            p.x + Math.cos(j * 1.257) * 0.11,
            1.18,
            p.z + Math.sin(j * 1.257) * 0.11,
          ],
          s: [0.1, 0.045, 0.08],
        });
    }
  }
  instanced(sphere, PALETTE.teal, bushes);
  instanced(sphere, PALETTE.pink, flowerPetals, false);
  instanced(sphere, PALETTE.yellow, flowerCentres, false);
  for (let i = 0; i < 19; i++) {
    const a = i * 2.39996;
    stones.push({
      p: [Math.cos(a) * 6.7, 0.64, Math.sin(a) * 5.1],
      s: [0.18 + (i % 3) * 0.1, 0.14, 0.18],
      r: [0, a, 0],
    });
  }
  instanced(rockGeo, PALETTE.cream, stones);
  const clouds = [];
  for (const [u, v, y, sz] of [
    [-7.6, -4, 2.6, 0.9],
    [6.2, -4.5, 3.1, 0.8],
    [-6.8, 3.9, -1.2, 0.8],
    [4.7, 5.4, -3.9, 0.9],
    [-0.8, 5, -5.2, 0.7],
  ]) {
    const p = groundPoint(u, v);
    const cloud = groupAt(p.x, p.z, y);
    cloud.userData.baseX = p.x;
    ball(
      PALETTE.white,
      [0, 0, 0],
      [sz * 1.05, sz * 0.29, sz * 0.4],
      cloud,
      false,
    );
    ball(
      PALETTE.white,
      [-sz * 0.3, sz * 0.17, 0],
      [sz * 0.43, sz * 0.37, sz * 0.4],
      cloud,
      false,
    );
    ball(
      PALETTE.white,
      [sz * 0.28, sz * 0.13, 0],
      [sz * 0.38, sz * 0.3, sz * 0.36],
      cloud,
      false,
    );
    clouds.push(cloud);
  }

  const projected = new THREE.Vector3();
  const restoreNodes = () =>
    nodes.forEach((node, i) => {
      node.style.left = fallback[i].left;
      node.style.top = fallback[i].top;
    });
  const projectNodes = () => {
    const positions = markerPoints.map((p) => {
      projected.copy(p).project(camera);
      return {
        x: ((projected.x + 1) * width) / 2,
        y: ((1 - projected.y) * height) / 2,
      };
    });
    // Resolve complete icon + always-visible label rectangles, only on layout
    // changes. This preserves all eleven labels without per-frame DOM work.
    const footprints = nodes.map((node) => {
      const label = node.querySelector(".node-label");
      const badge = node.querySelector(".you-are-here");
      const labelWidth =
        label?.offsetWidth ||
        Math.max(54, (label?.textContent?.trim().length || 6) * 9 + 14);
      const labelHeight = label?.offsetHeight || 20;
      const labelTop = (label?.offsetTop || 42) - 22;
      return {
        halfWidth: Math.max(44, labelWidth) / 2 + 4,
        top: -(badge?.offsetHeight ? badge.offsetHeight + 27 : 22),
        bottom: Math.max(22, labelTop + labelHeight) + 4,
      };
    });
    const rect = container.getBoundingClientRect();
    const viewportWidth =
      document.documentElement.clientWidth || window.innerWidth;
    const intersectsViewport = rect.right > 0 && rect.left < viewportWidth;
    const leftBound = (intersectsViewport ? Math.max(0, -rect.left) : 0) + 5;
    const rightBound =
      (intersectsViewport
        ? Math.min(width, viewportWidth - rect.left)
        : width) - 5;
    for (let pass = 0; pass < 80; pass++) {
      let moved = false;
      for (let i = 0; i < positions.length; i++)
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i],
            b = positions[j],
            fa = footprints[i] || { halfWidth: 28, top: -22, bottom: 42 },
            fb = footprints[j] || { halfWidth: 28, top: -22, bottom: 42 };
          const dx = b.x - a.x,
            dy =
              b.y + (fb.top + fb.bottom) / 2 - (a.y + (fa.top + fa.bottom) / 2);
          const overlapX = fa.halfWidth + fb.halfWidth + 4 - Math.abs(dx);
          const overlapY =
            (fa.bottom - fa.top + fb.bottom - fb.top) / 2 + 6 - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;
          moved = true;
          if (overlapX < overlapY * 1.15) {
            const shift = ((overlapX + 0.1) / 2) * (dx < 0 ? -1 : 1);
            a.x -= shift;
            b.x += shift;
          } else {
            const shift = ((overlapY + 0.1) / 2) * (dy < 0 ? -1 : 1);
            a.y -= shift;
            b.y += shift;
          }
        }
      positions.forEach((p, i) => {
        const f = footprints[i] || { halfWidth: 28, top: -22, bottom: 42 };
        p.x = THREE.MathUtils.clamp(
          p.x,
          leftBound + f.halfWidth,
          Math.max(leftBound + f.halfWidth, rightBound - f.halfWidth),
        );
        p.y = THREE.MathUtils.clamp(p.y, 8 - f.top, height - f.bottom - 8);
      });
      if (!moved) break;
    }
    positions.forEach((p, i) => {
      if (nodes[i]) {
        nodes[i].style.left = `${(p.x / width) * 100}%`;
        nodes[i].style.top = `${(p.y / height) * 100}%`;
      }
    });
  };
  const updateCamera = () => {
    if (disposed || contextLost) return;
    // Frame the entire floating silhouette, including the lowest waterfall and rocks.
    // Narrow screens keep the whole island visible rather than requiring horizontal scrolling.
    const aspect = width / height;
    const viewportWidth =
      document.documentElement.clientWidth || window.innerWidth;
    const rect = container.getBoundingClientRect();
    const visibleWidth =
      Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
    // The mobile canvas bleeds beyond the viewport; fit the physical island to
    // its visible width so the offshore temple and floating rocks stay complete.
    const fitAspect =
      viewportWidth <= 700 && visibleWidth > 0
        ? Math.min(width, visibleWidth) / height
        : aspect;
    const halfHeight = Math.max(8.4, 9.5 / fitAspect) / zoom;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.position.set(Math.sin(angle) * 24, 17, Math.cos(angle) * 24);
    camera.lookAt(0, -0.45, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    projectNodes();
  };
  const draw = () => {
    if (disposed || contextLost || document.hidden) return;
    renderer.render(scene, camera);
  };
  const animate = (time) => {
    frame = 0;
    if (disposed || contextLost || paused || reducedMotion || document.hidden)
      return;
    const t = time * 0.001;
    clouds.forEach(
      (cloud, i) =>
        (cloud.position.x =
          cloud.userData.baseX + Math.sin(t * 0.22 + i) * 0.14),
    );
    boat.position.y = 0.89 + Math.sin(t * 1.2) * 0.025;
    boat.rotation.z = Math.sin(t * 1.2) * 0.012;
    drops.forEach((drop, i) => {
      drop.position.y = 0.5 - ((t * 0.7 + i * 0.91) % 5.1);
    });
    draw();
    frame = requestAnimationFrame(animate);
  };
  const schedule = () => {
    if (
      !frame &&
      !paused &&
      !reducedMotion &&
      !document.hidden &&
      !contextLost &&
      !disposed
    )
      frame = requestAnimationFrame(animate);
  };
  const resize = () => {
    if (disposed || contextLost) return;
    width = container.clientWidth || 900;
    height = container.clientHeight || 580;
    renderer.setSize(width, height, false);
    updateCamera();
    draw();
    schedule();
  };
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      draw();
      schedule();
    }
  };
  const releaseGpuBindings = () => {
    // Three r180 rebuilds renderer caches after context restoration, while the
    // old geometry/instance dispose listeners retain the previous GL handles.
    // Detach those bindings while the context is lost, before caches are rebuilt.
    // dispose() preserves the CPU vertex arrays, so restoration can upload them again.
    scene.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    sunlight.shadow.dispose();
    sunlight.shadow.map = null;
    sunlight.shadow.mapPass = null;
  };
  const loseContext = (event) => {
    event.preventDefault();
    if (disposed) return;
    contextLost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    container.classList.remove("scene-ready");
    restoreNodes();
    releaseGpuBindings();
    onStatus?.("fallback");
  };
  const restoreContext = () => {
    if (disposed) return;
    contextLost = false;
    renderer.shadowMap.needsUpdate = true;
    container.classList.add("scene-ready");
    resize();
    onStatus?.("ready");
  };
  const raycaster = new THREE.Raycaster();
  const select = (event) => {
    if (disposed || contextLost || !onSelect) return;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = raycaster.intersectObjects(markerTargets, false)[0];
    if (hit) onSelect(hit.object.userData.chapter);
  };
  canvas.addEventListener("webglcontextlost", loseContext);
  canvas.addEventListener("webglcontextrestored", restoreContext);
  canvas.addEventListener("click", select);
  document.addEventListener("visibilitychange", visibility);
  container.prepend(canvas);
  container.classList.add("scene-ready");
  observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  // Geometry does not move under the sun; reuse the shadow map after its first render.
  renderer.shadowMap.autoUpdate = false;
  onStatus?.("ready");
  return {
    diagnostics() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };
    },
    setPaused(value) {
      if (disposed) return;
      paused = Boolean(value);
      if (paused) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else {
        draw();
        schedule();
      }
    },
    setReducedMotion(value) {
      if (disposed) return;
      reducedMotion = Boolean(value);
      if (reducedMotion) {
        cancelAnimationFrame(frame);
        frame = 0;
        draw();
      } else schedule();
    },
    resetView() {
      if (disposed || contextLost) return;
      angle = DEFAULT_ANGLE;
      zoom = 1;
      updateCamera();
      draw();
    },
    rotate(delta) {
      if (disposed || contextLost) return;
      angle = THREE.MathUtils.clamp(
        angle + delta,
        DEFAULT_ANGLE - 0.35,
        DEFAULT_ANGLE + 0.35,
      );
      updateCamera();
      draw();
    },
    zoom(delta) {
      if (disposed || contextLost) return;
      zoom = THREE.MathUtils.clamp(zoom + delta, 0.85, 1.16);
      updateCamera();
      draw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", loseContext);
      canvas.removeEventListener("webglcontextrestored", restoreContext);
      canvas.removeEventListener("click", select);
      releaseGpuBindings();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      container.classList.remove("scene-ready");
      restoreNodes();
    },
  };
}
