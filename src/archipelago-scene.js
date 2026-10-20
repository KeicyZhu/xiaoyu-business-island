import * as THREE from "./vendor/three.module.js";

// Original procedural scenery, inspired by Bali's terraces, Penida limestone
// headlands and Batur's caldera. This is an imaginary teaching archipelago.
export function mountArchipelago(
  container,
  { reducedMotion = false, onStatus = () => {}, onProject = () => {} } = {},
) {
  if (!container) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "archipelago-canvas";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
  });
  let renderer;
  try {
    const context = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!context) {
      onStatus("fallback");
      return null;
    }
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
  } catch {
    onStatus("fallback");
    return null;
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x75ccda);
  const camera = new THREE.OrthographicCamera(-15, 15, 10, -10, 0.1, 100);
  let disposed = false,
    lost = false,
    paused = false,
    frame = 0,
    width = 1,
    height = 1;
  const geometries = new Set(),
    materials = new Set(),
    materialCache = new Map();
  const geometry = (g) => (geometries.add(g), g);
  const material = (color, extra = {}) => {
    const key = `${color}:${JSON.stringify(extra)}`;
    if (!materialCache.has(key)) {
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        ...extra,
      });
      materials.add(m);
      materialCache.set(key, m);
    }
    return materialCache.get(key);
  };
  const boxGeo = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphereGeo = geometry(new THREE.SphereGeometry(1, 12, 8));
  const cylinderGeo = geometry(new THREE.CylinderGeometry(1, 1, 1, 16));
  const coneGeo = geometry(new THREE.ConeGeometry(1, 1, 4));
  coneGeo.rotateY(Math.PI / 4);
  const rockGeo = geometry(new THREE.IcosahedronGeometry(1, 2));
  const rockPositions = rockGeo.attributes.position;
  for (let i = 0; i < rockPositions.count; i++) {
    const x = rockPositions.getX(i),
      y = rockPositions.getY(i),
      z = rockPositions.getZ(i);
    const s = 1 + 0.06 * Math.sin(x * 12 + z * 8) * Math.cos(y * 9);
    rockPositions.setXYZ(i, x * s, y * s, z * s);
  }
  rockGeo.computeVertexNormals();
  const mesh = (geo, color, p, s, parent = scene, extra) => {
    const o = new THREE.Mesh(geo, material(color, extra));
    o.position.set(...p);
    o.scale.set(...s);
    parent.add(o);
    return o;
  };
  const box = (color, p, s, parent) => mesh(boxGeo, color, p, s, parent);
  const ball = (color, p, s, parent) => mesh(sphereGeo, color, p, s, parent);
  const cyl = (color, p, s, parent) => mesh(cylinderGeo, color, p, s, parent);
  const group = (parent = scene) => {
    const g = new THREE.Group();
    parent.add(g);
    return g;
  };
  const instanced = (geo, color, transforms, parent, extra) => {
    const m = new THREE.InstancedMesh(
        geo,
        material(color, extra),
        transforms.length,
      ),
      dummy = new THREE.Object3D();
    transforms.forEach((t, i) => {
      dummy.position.set(...t.p);
      dummy.scale.set(...t.s);
      dummy.rotation.set(...(t.r || [0, 0, 0]));
      if (t.q) dummy.quaternion.copy(t.q);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    parent.add(m);
    return m;
  };
  scene.add(new THREE.HemisphereLight(0xf3fcff, 0x689a7b, 2.3));
  const sun = new THREE.DirectionalLight(0xffefce, 2.1);
  sun.position.set(-12, 20, 12);
  scene.add(sun);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;

  // One inexpensive water shader: crossed ripples, moving sunlight and restrained
  // Fresnel reflection. Shallows around every island supply the depth gradient.
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      deep: { value: new THREE.Color(0x188caf) },
      light: { value: new THREE.Color(0x87ded9) },
    },
    vertexShader: `varying vec3 world; void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `uniform float time;uniform vec3 deep;uniform vec3 light;varying vec3 world;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){vec2 p=world.xz;vec2 drift=vec2(time*.08,-time*.045);
      float broad=noise(p*.19+drift*.3);float warp=noise(p*.75+drift);
      float fine=noise(p*3.4+vec2(warp*.9)+drift);float detail=noise(p*7.3-vec2(warp*.7)+drift*.7);
      float brokenRipple=smoothstep(.76,.92,fine)*smoothstep(.62,.83,detail);
      float caustic=pow(max(0.,1.-abs(fine-.51)*18.),5.)*.006;
      vec3 color=mix(deep,light,.16+broad*.17+warp*.035)+brokenRipple*.018+caustic;
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  // Shader chunks require preprocessor directives to begin on their own line.
  waterMaterial.fragmentShader = waterMaterial.fragmentShader.replace(
    " #include",
    "\n#include",
  );
  materials.add(waterMaterial);
  const ocean = new THREE.Mesh(
    geometry(new THREE.PlaneGeometry(180, 180)),
    waterMaterial,
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.28;
  scene.add(ocean);

  const islands = { learning: group(), double11: group(), brand: group() };
  const curves = {};
  const makeCoast = (key, points) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      "catmullrom",
      0.35,
    );
    curves[key] = curve;
    return curve;
  };
  makeCoast("learning", [
    [-4, -1],
    [-3.7, -2.8],
    [-1.6, -3.5],
    [0.3, -3.1],
    [2.5, -2.4],
    [3.4, -0.9],
    [3, 1],
    [1.9, 1.2],
    [1, 2.6],
    [-0.3, 3.2],
    [-1.5, 2.5],
    [-2.7, 2.7],
    [-4, 1.2],
  ]);
  makeCoast("double11", [
    [-3.2, -1.4],
    [-1.75, -2.05],
    [-0.25, -1.55],
    [1.5, -1.3],
    [3.35, -0.5],
    [4.15, 0.45],
    [4.35, 1.35],
    [3.8, 1.9],
    [3.25, 1.35],
    [2.7, 0.65],
    [1.65, 0.15],
    [0.7, 0.1],
    [0.25, 1.3],
    [-0.65, 2.1],
    [-2.6, 1.25],
  ]);
  makeCoast("brand", [
    [-3.1, -0.5],
    [-2.1, -2.4],
    [0.1, -3],
    [2.6, -2.2],
    [3.3, -0.2],
    [2.7, 1.8],
    [1.6, 2.6],
    [0.4, 1.9],
    [0.1, 0.8],
    [-1, 0.9],
    [-2.2, 2],
    [-3.1, 1.3],
  ]);
  const foamObjects = [];
  const islandBody = (key, top) => {
    const parent = islands[key],
      curve = curves[key],
      count = 96,
      positions = [],
      colors = [],
      indices = [];
    const layers = [
      { s: 0.94, y: -0.4, c: 0x7faaa1 },
      { s: 1.02, y: 0.02, c: 0xc9c4a5 },
      { s: 1, y: top * 0.3, c: 0xd9c6a4 },
      { s: 0.98, y: top * 0.66, c: 0xc9b28b },
      { s: 0.93, y: top, c: 0xc5b58d },
    ];
    layers.forEach((l, j) => {
      for (let i = 0; i <= count; i++) {
        const p = curve.getPoint(i / count),
          w = 1 + 0.01 * Math.sin(i * 0.9 + j * 0.4);
        positions.push(
          p.x * l.s * w,
          l.y + (j > 1 ? 0.03 * Math.sin(i * 0.4) : 0),
          p.z * l.s * w,
        );
        const c = new THREE.Color(l.c).multiplyScalar(
          0.94 + 0.045 * Math.sin(i * 0.7 + j),
        );
        colors.push(c.r, c.g, c.b);
        if (j < layers.length - 1 && i < count) {
          const a = j * (count + 1) + i,
            b = a + count + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    });
    const g = geometry(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    mesh(g, 0xffffff, [0, 0, 0], [1, 1, 1], parent, {
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    const shape = new THREE.Shape();
    curve
      .getPoints(128)
      .forEach((p, i) =>
        i ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z),
      );
    shape.closePath();
    const surfaceGeo = geometry(new THREE.ShapeGeometry(shape));
    const beach = mesh(
      surfaceGeo,
      0xf1ddad,
      [0, top - 0.01, 0],
      [0.955, 0.955, 1],
      parent,
    );
    beach.rotation.x = -Math.PI / 2;
    const turf = mesh(
      surfaceGeo,
      key === "double11" ? 0x80aa4c : 0x8eb655,
      [0, top + 0.015, 0],
      [0.88, 0.88, 1],
      parent,
    );
    turf.rotation.x = -Math.PI / 2;
    for (const [scale, color, opacity, y] of [
      [1.27, 0x67d7ce, 0.4, -0.22],
      [1.15, 0x90e9d8, 0.48, -0.2],
      [1.065, 0xd1f6dd, 0.4, -0.18],
    ]) {
      const shallow = mesh(
        surfaceGeo,
        color,
        [0, y, 0],
        [scale, scale, 1],
        parent,
        { transparent: true, opacity, depthWrite: false, roughness: 0.24 },
      );
      shallow.rotation.x = -Math.PI / 2;
    }
    const foamCurve = new THREE.CatmullRomCurve3(
      curve
        .getPoints(128)
        .slice(0, -1)
        .map((p) => new THREE.Vector3(p.x * 1.06, -0.12, p.z * 1.06)),
      true,
    );
    const foam = mesh(
      geometry(new THREE.TubeGeometry(foamCurve, 128, 0.026, 4, true)),
      0xebfff2,
      [0, 0, 0],
      [1, 1, 1],
      parent,
      { transparent: true, opacity: 0.63 },
    );
    foamObjects.push(foam);
    return top;
  };
  const levels = {
    learning: islandBody("learning", 0.9),
    double11: islandBody("double11", 1.45),
    brand: islandBody("brand", 0.65),
  };

  // Shared curved roof profile, avoiding block-like stacks.
  const roofP = [],
    roofI = [];
  for (let f = 0; f < 4; f++)
    for (let r = 0; r <= 8; r++)
      for (let c = 0; c <= 8; c++) {
        const t = r / 8,
          q = (c / 8) * 2 - 1,
          h = 0.7 * (0.2 + 0.8 * t),
          a = (f * Math.PI) / 2,
          x = q * h,
          z = h,
          y = 0.36 * (1 - t) ** 1.6 + 0.04 * t ** 5 * Math.abs(q) ** 4;
        roofP.push(
          x * Math.cos(a) - z * Math.sin(a),
          y,
          x * Math.sin(a) + z * Math.cos(a),
        );
        if (r < 8 && c < 8) {
          const j = f * 81 + r * 9 + c,
            k = j + 9;
          roofI.push(j, k, j + 1, j + 1, k, k + 1);
        }
      }
  const roofGeo = geometry(new THREE.BufferGeometry());
  roofGeo.setAttribute("position", new THREE.Float32BufferAttribute(roofP, 3));
  roofGeo.setIndex(roofI);
  roofGeo.computeVertexNormals();
  const temple = (parent, x, z, y, size = 1) => {
    const g = group(parent);
    g.position.set(x, y, z);
    g.scale.setScalar(size);
    box(0xcfa67b, [0, 0.1, 0], [1.6, 0.2, 1.4], g);
    box(0xb78969, [0, 0.55, 0], [0.85, 0.9, 0.8], g);
    box(0x465c50, [0, 0.5, 0.41], [0.3, 0.55, 0.025], g);
    for (let i = 0; i < 3; i++) {
      const s = 1.25 - i * 0.22;
      mesh(roofGeo, 0x39584f, [0, 0.98 + i * 0.45, 0], [s, 1, s], g, {
        side: THREE.DoubleSide,
      });
      if (i < 2) box(0xa77b5c, [0, 1.3 + i * 0.45, 0], [0.45, 0.2, 0.45], g);
    }
    cyl(0xcfbb74, [0, 2.45, 0], [0.035, 0.45, 0.035], g);
    ball(0xdfc678, [0, 2.7, 0], [0.07, 0.1, 0.07], g);
    for (let i = 0; i < 3; i++)
      box(
        0xdfc09a,
        [0, 0.02 + i * 0.06, 0.95 - i * 0.13],
        [0.9, 0.12, 0.22],
        g,
      );
  };
  temple(islands.learning, 0.7, -0.85, 0.93, 0.9);
  temple(islands.double11, -1.9, -0.8, 1.48, 0.5);

  // Learning island: terraced valley, waterfall and a sandstone split gateway.
  const terraces = group(islands.learning);
  terraces.position.set(-1.65, 0.92, -0.8);
  terraces.rotation.y = -0.3;
  const rice = [];
  for (let level = 0; level < 5; level++) {
    const outline = new THREE.Shape(),
      rx = 1.8 - level * 0.23,
      rz = 1.37 - level * 0.19;
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2,
        w = 1 + 0.08 * Math.sin(a * 3);
      const x = Math.cos(a) * rx * w,
        z = Math.sin(a) * rz * w;
      i ? outline.lineTo(x, z) : outline.moveTo(x, z);
    }
    outline.closePath();
    const geo = geometry(
      new THREE.ExtrudeGeometry(outline, {
        depth: 0.16,
        bevelEnabled: true,
        bevelSize: 0.045,
        bevelThickness: 0.04,
        bevelSegments: 2,
      }),
    );
    const field = mesh(
      geo,
      level % 2 ? 0x94b84a : 0xaec85a,
      [0, level * 0.21, -level * 0.1],
      [1, 1, 1],
      terraces,
    );
    field.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2,
        w = 1 + 0.08 * Math.sin(a * 3);
      rice.push({
        p: [
          Math.cos(a) * rx * w * 0.91,
          level * 0.21 + 0.2,
          -Math.sin(a) * rz * w * 0.91 - level * 0.1,
        ],
        s: [0.025, 0.1, 0.025],
      });
    }
  }
  instanced(coneGeo, 0x638e3b, rice, terraces);
  const gate = group(islands.learning);
  gate.position.set(0.35, 0.94, 1.05);
  for (const side of [-1, 1]) {
    for (let level = 0; level < 4; level++) {
      const w = 0.54 - level * 0.08;
      box(
        0xc69b76,
        [side * (0.3 + w / 2), level * 0.32 + 0.18, 0],
        [w, 0.36, 0.45],
        gate,
      );
      box(
        0xe2c298,
        [side * (0.3 + w / 2), level * 0.32 + 0.04, 0],
        [w + 0.09, 0.065, 0.53],
        gate,
      );
    }
  }
  // A small mountain spring falls from the terraces, with a continuous water ribbon.
  const streamCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.7, 1.1, 1),
    new THREE.Vector3(-1.5, 0.98, 1.9),
    new THREE.Vector3(-1.2, 0.8, 2.65),
    new THREE.Vector3(-1.15, 0.05, 2.9),
  ]);
  mesh(
    geometry(new THREE.TubeGeometry(streamCurve, 32, 0.12, 8, false)),
    0x78cdd0,
    [0, 0, 0],
    [1, 1, 1],
    islands.learning,
    { roughness: 0.18, transparent: true, opacity: 0.66, depthWrite: false },
  );
  mesh(
    geometry(new THREE.TubeGeometry(streamCurve, 32, 0.025, 4, false)),
    0xdbfff1,
    [0.04, 0.025, 0.03],
    [1, 1, 1],
    islands.learning,
  );

  // Penida island: a high, narrow green headland and low working harbour.
  const headland = group(islands.double11);
  headland.position.set(2.1, 1.48, -0.2);
  headland.rotation.y = -0.5;
  for (let i = 0; i < 4; i++) {
    mesh(
      rockGeo,
      0xc3bd9e,
      [i * 0.37, 0.3 + i * 0.03, 0],
      [0.68, 0.52, 0.65 - i * 0.08],
      headland,
    );
    ball(
      0x90ad62,
      [i * 0.37, 0.68 + i * 0.03, 0],
      [0.65, 0.15, 0.58 - i * 0.07],
      headland,
    );
  }
  const warehouse = group(islands.double11);
  warehouse.position.set(-0.7, 1.48, 0.45);
  box(0xe1d3b8, [0, 0.36, 0], [1.4, 0.72, 1], warehouse);
  mesh(roofGeo, 0x467f87, [0, 0.75, 0], [1.2, 0.75, 1.03], warehouse, {
    side: THREE.DoubleSide,
  });
  for (const x of [-0.36, 0.36])
    box(0x4b787e, [x, 0.29, 0.505], [0.42, 0.5, 0.025], warehouse);
  const parcels = [];
  for (let i = 0; i < 7; i++)
    parcels.push({
      p: [-0.95 + (i % 4) * 0.24, 1.58 + Math.floor(i / 4) * 0.2, 1.45],
      s: [0.2, 0.2, 0.2],
    });
  instanced(boxGeo, 0xbc9469, parcels, islands.double11);
  const pier = group(islands.double11);
  pier.position.set(-0.75, 0.35, 2.2);
  box(0xb99670, [0, 0, 0], [0.85, 0.13, 2.3], pier);
  const dockPosts = [];
  for (const x of [-0.4, 0.4])
    for (let i = 0; i < 4; i++)
      dockPosts.push({ p: [x, 0.05, -0.9 + i * 0.6], s: [0.045, 0.7, 0.045] });
  instanced(cylinderGeo, 0xd4bc91, dockPosts, pier);
  // Two slim campaign flags suggest an active commerce festival without company marks.
  for (const x of [-1.5, 0.1]) {
    cyl(0xa48b6d, [x, 2.12, 1.4], [0.025, 1.3, 0.025], islands.double11);
    box(0xe694b0, [x + 0.13, 2.5, 1.4], [0.26, 0.4, 0.025], islands.double11);
  }

  // Brand island: a rounded volcanic caldera with a sheltered lake and amber market.
  const volcano = group(islands.brand);
  volcano.position.set(0.25, 0.68, -0.85);
  const mountainP = [],
    mountainC = [],
    mountainI = [],
    rings = 18,
    segs = 80;
  for (let r = 0; r <= rings; r++)
    for (let i = 0; i <= segs; i++) {
      const t = r / rings,
        a = (i / segs) * Math.PI * 2,
        rad = 0.48 + t * 1.7;
      const ridge = 1.9 * Math.exp(-(((t - 0.3) / 0.24) ** 2)) + 0.07;
      const undulation = 1 + 0.045 * Math.sin(a * 5) + 0.025 * Math.cos(a * 9);
      const y =
        ridge * (1 + 0.055 * Math.sin(a * 3)) +
        0.035 * Math.sin(a * 13) * Math.sin(t * Math.PI);
      mountainP.push(
        Math.cos(a) * rad * undulation,
        y,
        Math.sin(a) * rad * 0.83 * undulation,
      );
      const color = new THREE.Color(
        t < 0.43 ? 0x819080 : t < 0.68 ? 0x82975c : 0x9bb669,
      ).multiplyScalar(0.94 + 0.05 * Math.cos(a * 6));
      mountainC.push(color.r, color.g, color.b);
      if (r < rings && i < segs) {
        const j = r * (segs + 1) + i,
          k = j + segs + 1;
        mountainI.push(j, k, j + 1, j + 1, k, k + 1);
      }
    }
  const mountainGeo = geometry(new THREE.BufferGeometry());
  mountainGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(mountainP, 3),
  );
  mountainGeo.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(mountainC, 3),
  );
  mountainGeo.setIndex(mountainI);
  mountainGeo.computeVertexNormals();
  mesh(mountainGeo, 0xffffff, [0, 0, 0], [1, 1, 1], volcano, {
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  cyl(0x63bac0, [0, 0.55, 0], [0.54, 0.035, 0.45], volcano);
  const market = group(islands.brand);
  market.position.set(-1.1, 0.7, 1.1);
  box(0xc7a17a, [0, 0.1, 0], [1.65, 0.2, 0.85], market);
  for (const x of [-0.66, 0.66])
    box(0xab8968, [x, 0.67, 0], [0.07, 1.2, 0.07], market);
  mesh(roofGeo, 0xd39d5c, [0, 1.24, 0], [1.45, 0.7, 0.95], market, {
    side: THREE.DoubleSide,
  });
  box(0xd8ba8d, [0, 0.55, 0.05], [1.45, 0.1, 0.55], market);
  const jars = [],
    caps = [];
  for (let i = 0; i < 5; i++) {
    jars.push({ p: [-0.51 + i * 0.25, 0.72, 0.12], s: [0.09, 0.23, 0.09] });
    caps.push({ p: [-0.51 + i * 0.25, 0.86, 0.12], s: [0.097, 0.04, 0.097] });
  }
  instanced(cylinderGeo, 0xcc9649, jars, market);
  instanced(cylinderGeo, 0x6d7552, caps, market);

  // Shared feathered palm geometry, with all fronds in two draw calls per island.
  const leafP = [];
  for (let i = 1; i < 13; i++) {
    const t = i / 13,
      x = t * 1.5,
      y = Math.sin(t * Math.PI) * 0.29 - t * t * 0.3,
      w = Math.sin(t * Math.PI) * 0.25;
    for (const side of [-1, 1])
      leafP.push(
        x - 0.03,
        y,
        0,
        x + 0.22,
        y - 0.08,
        side * w,
        x + 0.05,
        y + 0.015,
        side * 0.015,
      );
  }
  const leafGeo = geometry(new THREE.BufferGeometry());
  leafGeo.setAttribute("position", new THREE.Float32BufferAttribute(leafP, 3));
  leafGeo.computeVertexNormals();
  const foliage = {
    learning: [
      [-2.9, 0.6, 1.05],
      [-2.7, -1.9, 0.85],
      [1.85, -1.7, 0.95],
      [2.1, 0.6, 1.1],
      [0.1, 2.15, 0.8],
    ],
    double11: [
      [-2.1, 0.9, 0.8],
      [-2.2, -1.4, 0.7],
      [0.55, -1.2, 0.85],
      [1.7, -0.7, 0.75],
    ],
    brand: [
      [-2.2, -0.4, 0.9],
      [2, -0.5, 0.9],
      [1.9, 1.3, 1],
      [0.55, 1.8, 0.8],
    ],
  };
  for (const [key, locations] of Object.entries(foliage)) {
    const parent = islands[key],
      trunks = [],
      leaves = [[], []],
      bushes = [],
      rocks = [];
    locations.forEach(([x, z, s], i) => {
      trunks.push({
        p: [x, levels[key] + s * 0.65, z],
        s: [0.06 * s, 1.3 * s, 0.06 * s],
        r: [0, 0, (i % 2 ? 1 : -1) * 0.08],
      });
      for (let j = 0; j < 7; j++)
        leaves[j % 2].push({
          p: [x, levels[key] + s * 1.29, z],
          s: [s * 0.7, s * 0.7, s * 0.7],
          r: [0, (j / 7) * Math.PI * 2 + i * 0.3, 0],
        });
    });
    for (let i = 0; i < 24; i++) {
      const p = curves[key].getPoint(i / 24);
      bushes.push({
        p: [p.x * 0.76, levels[key] + 0.13, p.z * 0.76],
        s: [0.17 + (i % 3) * 0.035, 0.19, 0.18],
      });
      if (i % 3 === 0)
        rocks.push({
          p: [p.x * 0.98, 0.08, p.z * 0.98],
          s: [0.19, 0.16, 0.23],
          r: [0, i, 0],
        });
    }
    instanced(cylinderGeo, 0xb99b73, trunks, parent);
    leaves.forEach((items, i) =>
      instanced(leafGeo, i ? 0x9bb75a : 0x548e62, items, parent, {
        side: THREE.DoubleSide,
      }),
    );
    instanced(sphereGeo, 0x4e8650, bushes, parent);
    instanced(rockGeo, 0xc1c9b0, rocks, parent);
  }
  // Rounded tropical woodland fills the broad land masses, with layered crowns
  // rather than a sparse collection of isolated props.
  const woodland = {
    learning: [
      [-3.1, -1.25],
      [-2.8, 1.15],
      [1.65, -2],
      [2.25, -0.75],
      [1.25, 1.9],
    ],
    double11: [
      [-1.2, -1.45],
      [0.35, -1.2],
      [2.35, 0.3],
    ],
    brand: [
      [-2.2, 0.25],
      [2.3, 0.35],
      [-1.8, -1.4],
    ],
  };
  for (const [key, locations] of Object.entries(woodland)) {
    const crowns = [[], []],
      stems = [];
    locations.forEach(([x, z], i) => {
      const y = levels[key],
        size = 0.4 + (i % 3) * 0.055;
      stems.push({ p: [x, y + 0.28, z], s: [0.06, 0.56, 0.06] });
      crowns[i % 2].push({ p: [x, y + 0.76, z], s: [size, 0.47, size] });
      crowns[i % 2].push({
        p: [x + 0.2, y + 0.61, z + 0.12],
        s: [size * 0.75, 0.32, size * 0.7],
      });
    });
    instanced(cylinderGeo, 0xa7906b, stems, islands[key]);
    crowns.forEach((items, i) =>
      instanced(sphereGeo, i ? 0x6e9e45 : 0x3e7b4c, items, islands[key]),
    );
  }
  // Boats and their wakes identify trade routes without drawing a dashboard diagram.
  const boats = [];
  const boat = (parent, x, z, color, size = 1) => {
    const g = group(parent);
    g.position.set(x, -0.03, z);
    g.scale.setScalar(size);
    g.rotation.y = -0.35;
    ball(color, [0, 0.09, 0], [0.22, 0.15, 0.65], g);
    box(0xf4e4c8, [0, 0.18, 0], [0.32, 0.05, 0.9], g);
    box(0xf1e7d5, [0, 0.34, -0.14], [0.28, 0.28, 0.37], g);
    box(color, [0, 0.5, -0.14], [0.34, 0.05, 0.43], g);
    const wakeGeo = geometry(
      new THREE.TorusGeometry(0.48, 0.014, 4, 32, Math.PI),
    );
    const wake = mesh(wakeGeo, 0xd5f6eb, [0, -0.08, 0.65], [0.8, 1.4, 1], g, {
      transparent: true,
      opacity: 0.6,
    });
    wake.rotation.x = -Math.PI / 2;
    boats.push(g);
  };
  boat(islands.double11, -1.5, 3.5, 0x628ea0, 0.85);
  boat(islands.brand, -0.2, 2.65, 0xc7965f, 0.75);
  boat(islands.learning, -2.8, 3.2, 0xd2aaa2, 0.55);
  // A few white gull strokes, not billboard particles.
  const gullP = [];
  for (let i = 0; i < 7; i++) {
    const x = -4 + i * 1.5,
      z = -3 + (i % 3) * 2,
      y = 3.5 + (i % 2) * 0.3;
    gullP.push(
      x - 0.16,
      y,
      z,
      x,
      y - 0.055,
      z,
      x,
      y - 0.055,
      z,
      x + 0.16,
      y,
      z,
    );
  }
  const gullGeo = geometry(new THREE.BufferGeometry());
  gullGeo.setAttribute("position", new THREE.Float32BufferAttribute(gullP, 3));
  const gullMat = new THREE.LineBasicMaterial({
    color: 0xf1ffed,
    transparent: true,
    opacity: 0.75,
  });
  materials.add(gullMat);
  scene.add(new THREE.LineSegments(gullGeo, gullMat));

  const project = () => {
    const result = {};
    for (const [key, island] of Object.entries(islands)) {
      const portrait = width / height < 1.05;
      const anchor =
        key === "brand"
          ? portrait
            ? [0, 0.08, 3.8]
            : [5.25, 0.08, 0.7]
          : [0, 0.08, key === "learning" ? 3.9 : 4.2];
      const v = new THREE.Vector3(...anchor)
        .applyMatrix4(island.matrixWorld)
        .project(camera);
      result[key] = { x: (v.x + 1) * 50, y: (1 - v.y) * 50 };
    }
    onProject(result);
  };
  const draw = () => {
    if (!disposed && !lost && !document.hidden) renderer.render(scene, camera);
  };
  const resize = () => {
    if (disposed || lost) return;
    width = container.clientWidth || 1000;
    height = container.clientHeight || 650;
    renderer.setSize(width, height, false);
    const portrait = width / height < 1.05;
    if (portrait) {
      islands.learning.position.set(0.2, 0, -10);
      islands.double11.position.set(-0.3, 0, 0);
      islands.brand.position.set(0.2, 0, 10);
    } else {
      islands.learning.position.set(-5.6, 0, 0.7);
      islands.brand.position.set(4.2, 0, -4.4);
      islands.double11.position.set(4.5, 0, 4.15);
    }
    islands.learning.rotation.y = 0.12;
    islands.double11.rotation.y = -0.15;
    islands.brand.rotation.y = 0.16;
    const aspect = width / height,
      halfHeight = portrait
        ? Math.max(15, 5.1 / aspect)
        : Math.max(7.8, 12 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.position.set(0, portrait ? 34 : 23, portrait ? 16 : 28);
    camera.lookAt(0, 0, portrait ? 1 : 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    project();
    draw();
    schedule();
  };
  const animate = (time) => {
    frame = 0;
    if (disposed || lost || paused || reducedMotion || document.hidden) return;
    const t = time * 0.001;
    waterMaterial.uniforms.time.value = t;
    foamObjects.forEach(
      (o, i) => (o.material.opacity = 0.55 + Math.sin(t * 0.65 + i) * 0.1),
    );
    boats.forEach((o, i) => {
      o.position.y = -0.03 + Math.sin(t * 0.9 + i) * 0.024;
      o.rotation.z = Math.sin(t * 0.8 + i) * 0.014;
    });
    draw();
    frame = requestAnimationFrame(animate);
  };
  const schedule = () => {
    if (
      !frame &&
      !disposed &&
      !lost &&
      !paused &&
      !reducedMotion &&
      !document.hidden
    )
      frame = requestAnimationFrame(animate);
  };
  const release = () => {
    scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  };
  const lose = (e) => {
    e.preventDefault();
    if (disposed) return;
    lost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    release();
    canvas.style.visibility = "hidden";
    container.classList.remove("archipelago-ready");
    onStatus("fallback");
  };
  const restore = () => {
    if (disposed) return;
    lost = false;
    canvas.style.visibility = "";
    container.classList.add("archipelago-ready");
    resize();
    onStatus("ready");
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
  canvas.addEventListener("webglcontextlost", lose);
  canvas.addEventListener("webglcontextrestored", restore);
  document.addEventListener("visibilitychange", visibility);
  container.prepend(canvas);
  container.classList.add("archipelago-ready");
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  onStatus("ready");
  return {
    setReducedMotion(value) {
      if (disposed) return;
      reducedMotion = Boolean(value);
      if (reducedMotion) {
        cancelAnimationFrame(frame);
        frame = 0;
        draw();
      } else schedule();
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
    diagnostics() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", lose);
      canvas.removeEventListener("webglcontextrestored", restore);
      document.removeEventListener("visibilitychange", visibility);
      release();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      container.classList.remove("archipelago-ready");
    },
  };
}
