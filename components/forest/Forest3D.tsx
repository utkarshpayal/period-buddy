/* eslint-disable react/no-unknown-property -- React Three Fiber elements take three.js props (args, position, intensity…). */
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import * as THREE from "three";
import type { ForestGardenState, ForestVitality, GardenActionType } from "../../lib/api";
import { forestLayout, wildlifeFor, worldRadius, type TreeSpot, type Wildlife } from "../../lib/forestWorld";
import { buildTree, emptyPose, poseTree, rng, type Tree3 } from "../../lib/tree3d";
import { FiberCanvas, useFrame } from "../three/FiberCanvas";
import { radialTexture } from "../three/textures";
import { dayPartFor, type DayPart, type ForestHabitatProps } from "./ForestHabitat";
import { PALETTES } from "./LivingTree";

/**
 * The Wellness Forest in 3D (React Three Fiber on expo-gl; WebGL on web): a
 * floating meadow island with the person's tree (lib/tree3d.ts, grown from
 * its seed by `growth`), their past trees on the hill behind, and a sky that
 * follows the real clock. Same props as ForestHabitat, which stays the
 * fallback when 3D can't run (see app/(app)/forest.tsx).
 *
 * Drag sideways to look around (it eases back), tap to rustle the tree.
 * Watering brings a rain cloud, a new stage a burst of sparkles; butterflies
 * when it's thriving, fireflies at night, falling leaves when it's wilting.
 */

type Sky = {
  gradient: [string, string, string];
  sun: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemi: [string, string, number];
  fog: string;
  night: boolean;
};

const SKIES: Record<DayPart, Sky> = {
  dawn: { gradient: ["#F2A68F", "#F8D2B4", "#FBEBD9"], sun: "#FFC59A", sunIntensity: 1.5, sunPos: [-3, 1.4, 2], hemi: ["#FFE1CC", "#6E5A4E", 0.75], fog: "#F7DCC6", night: false },
  day: { gradient: ["#7DBCEB", "#B8E0F5", "#E6F5E8"], sun: "#FFF4DE", sunIntensity: 2, sunPos: [-2, 4, 2.5], hemi: ["#E4F3FF", "#5E7A4A", 0.85], fog: "#D8EEF0", night: false },
  dusk: { gradient: ["#5E4C93", "#DB8579", "#F4C394"], sun: "#FFB07A", sunIntensity: 1.3, sunPos: [3, 1.2, 1.5], hemi: ["#F2C2B0", "#4A3A52", 0.7], fog: "#E8B49A", night: false },
  night: { gradient: ["#0C1633", "#1D2A54", "#33396A"], sun: "#9FB4FF", sunIntensity: 0.7, sunPos: [2, 3, 2], hemi: ["#3B4A80", "#151A2E", 0.55], fog: "#2B3260", night: true },
};

/** Camera: a wider lens, a little from above, looking just below the crown so the tree sits above the dock. */
const FOV = 46;
const HOME_PITCH = 0.3;
const HOME_TY = 0.62;

const DROOP: Record<ForestVitality, number> = { new: 0, thriving: 0, thirsty: 0.15, wilting: 0.5, dry: 0.85 };
const GRASS: Record<ForestVitality, [string, string]> = {
  new: ["#7CC26A", "#5AA552"],
  thriving: ["#7CC26A", "#5AA552"],
  thirsty: ["#93BD62", "#73A04E"],
  wilting: ["#B5B467", "#949347"],
  dry: ["#C3A876", "#A38A5C"],
};
const BLOSSOM = new THREE.Color("#F7A8C4");
const DETAIL = {
  // Per square unit of meadow (capped), so a big forest isn't bare.
  full: { grass: 7, flowers: 1.6, fireflies: 8, falling: 6, trees: 40, nearTrees: 3 },
  low: { grass: 4, flowers: 1, fireflies: 4, falling: 3, trees: 18, nearTrees: 0 },
};

export const Forest3D = memo(function Forest3D({
  height,
  growth,
  vitality,
  treeSeed,
  grownSeeds,
  waterKey,
  celebrateKey,
  dayPart,
  onInteract,
  lowDetail = false,
  active = true,
  garden = null,
  pouring = false,
  onCare,
  explore = false,
}: ForestHabitatProps & {
  /** Walk round the whole forest instead of circling the current tree. */
  explore?: boolean;
  /** The care game's state; null draws the tree without it. */
  garden?: ForestGardenState | null;
  /** The watering can is pouring (the button is held). */
  pouring?: boolean;
  /** Tapped a weed (weed), bug (shoo) or dry leaf (prune). */
  onCare?: (type: GardenActionType, id: number) => void;
}) {
  const reduced = useReducedMotion();
  const [part, setPart] = useState<DayPart>(() => dayPart ?? dayPartFor());
  useEffect(() => {
    if (dayPart) return setPart(dayPart);
    const id = setInterval(() => setPart(dayPartFor()), 60_000);
    return () => clearInterval(id);
  }, [dayPart]);
  const sky = SKIES[part];

  // Growth arrives every frame of the page's tween; the scene reads it from
  // a ref so React doesn't re-render the canvas per frame.
  const growthRef = useRef(growth);
  growthRef.current = growth;
  const invalidateRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    invalidateRef.current?.();
  }, [growth, vitality, waterKey, celebrateKey]);

  // Full access: one finger orbits all the way round and tilts, two fingers
  // pinch to zoom. The camera eases towards `look` every frame.
  const look = useRef<Look>({
    yaw: 0,
    pitch: HOME_PITCH,
    dist: 4.6,
    ty: HOME_TY,
    target: { yaw: 0, pitch: HOME_PITCH, dist: 4.6, ty: HOME_TY },
    rustleAt: -10,
    walk: { x: 0, z: 2.6, heading: Math.PI },
    walkTarget: { x: 0, z: 2.6, heading: Math.PI },
    explore,
  });
  look.current.explore = explore;
  const maxDist = Math.max(6, worldRadius(grownSeeds.length) * 2.2);
  const walkStart = useRef<Walk>({ x: 0, z: 2.6, heading: Math.PI });
  const drag = useRef({ start: { yaw: 0, pitch: HOME_PITCH, dist: 4.6, ty: HOME_TY }, moved: 0, at: 0, pinch: 0 });
  // The opening distance fits the screen's shape: on a tall, narrow phone the
  // tree, its clearing and the nearest trees all fit across. Until the person
  // pinches, layout changes refit it.
  const fit = useRef({ dist: 4.6, pinched: false });
  const refit = (width: number, h: number) => {
    if (!width || !h) return;
    const halfH = Math.tan(((FOV / 2) * Math.PI) / 180) * (width / h);
    const dist = Math.max(4.2, Math.min(9, 1.35 / halfH));
    fit.current.dist = dist;
    if (!fit.current.pinched) {
      look.current.target = { ...look.current.target, dist };
      look.current.dist = dist;
      drag.current.start = { ...drag.current.start, dist };
    }
  };
  // Tappable things (weeds, bugs, dry leaves) and the camera, kept by the scene.
  const picks = useRef<Picks>({ camera: null, targets: new Map(), size: { width: 1, height: 1 } });
  const onCareRef = useRef(onCare);
  onCareRef.current = onCare;
  const [poofs, setPoofs] = useState<{ id: number; pos: THREE.Vector3; color: string; at: number }[]>([]);

  const tap = (x: number, y: number) => {
    const { camera, targets, size } = picks.current;
    let best: { type: GardenActionType; id: number; pos: THREE.Vector3 } | null = null;
    let bestD = 40;
    if (camera && onCareRef.current) {
      targets.forEach((t) => {
        const ndc = t.pos.clone().project(camera);
        if (ndc.z > 1) return;
        const d = Math.hypot(((ndc.x + 1) / 2) * size.width - x, ((1 - ndc.y) / 2) * size.height - y);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      });
    }
    if (best) {
      const b = best as { type: GardenActionType; id: number; pos: THREE.Vector3 };
      const color = b.type === "weed" ? "#7CC26A" : b.type === "shoo" ? "#FF6B5B" : "#D9A066";
      setPoofs((list) => [...list.filter((p) => performance.now() / 1000 - p.at < 1), { id: Date.now(), pos: b.pos.clone(), color, at: performance.now() / 1000 }]);
      onCareRef.current?.(b.type, b.id);
    } else {
      look.current.rustleAt = performance.now() / 1000;
    }
    invalidateRef.current?.();
  };

  // One finger sideways turns the tree; up/down is left to the page's scroll.
  // Two fingers pinch to zoom and slide up/down to tilt.
  const mode = useRef<"none" | "rotate" | "pinch">("none");
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (e, g) => (e.nativeEvent.touches?.length ?? 1) >= 2 || Math.hypot(g.dx, g.dy) > 8,
        // Let the page scroll take over until a rotate or pinch has started.
        onPanResponderTerminationRequest: () => mode.current === "none",
        onPanResponderGrant: () => {
          mode.current = "none";
          drag.current = { start: { ...look.current.target }, moved: 0, at: Date.now(), pinch: 0 };
        },
        onPanResponderMove: (e, g) => {
          const t = e.nativeEvent.touches ?? [];
          const d = drag.current;
          d.moved = Math.max(d.moved, Math.hypot(g.dx, g.dy));
          if (t.length >= 2) {
            const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
            const cy = (t[0].pageY + t[1].pageY) / 2;
            if (mode.current !== "pinch") {
              mode.current = "pinch";
              d.pinch = dist;
              d.at = cy;
              d.start = { ...look.current.target };
              return;
            }
            const zoom = Math.max(1.4, Math.min(maxDist, (d.start.dist * d.pinch) / Math.max(dist, 1)));
            fit.current.pinched = true;
            look.current.target = {
              ...d.start,
              dist: zoom,
              // Zooming in also lifts the view towards the crown.
              ty: Math.max(0.4, HOME_TY + Math.max(0, fit.current.dist - zoom) * 0.1),
              pitch: Math.max(-0.05, Math.min(1.1, d.start.pitch + (cy - d.at) * 0.006)),
            };
          } else if (mode.current !== "pinch" && (mode.current === "rotate" || Math.hypot(g.dx, g.dy) > 8)) {
            if (mode.current !== "rotate") walkStart.current = { ...look.current.walkTarget };
            mode.current = "rotate";
            if (look.current.explore) {
              // Walk: drag up to go forward, sideways to turn.
              const w = walkStart.current;
              const heading = w.heading - g.dx * 0.006;
              const step = -g.dy * 0.012;
              look.current.walkTarget = { heading, x: w.x + Math.sin(heading) * step, z: w.z + Math.cos(heading) * step };
            } else {
              look.current.target = {
                ...d.start,
                yaw: d.start.yaw - g.dx * 0.009,
                pitch: Math.max(-0.05, Math.min(1.25, d.start.pitch + g.dy * 0.005)),
              };
            }
          }
          invalidateRef.current?.();
        },
        onPanResponderRelease: (e) => {
          if (mode.current === "none" && drag.current.moved < 8) {
            tap(e.nativeEvent.locationX, e.nativeEvent.locationY);
          }
          mode.current = "none";
          onInteract?.();
        },
        onPanResponderTerminate: () => {
          mode.current = "none";
        },
      }),
    // `tap` reads refs only.
    [onInteract, maxDist],
  );

  return (
    <View
      style={{ height }}
      onLayout={(e) => {
        const { width, height: h } = e.nativeEvent.layout;
        picks.current.size = { width, height: h };
        refit(width, h);
      }}
      {...pan.panHandlers}
    >
      <LinearGradient colors={sky.gradient} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
      <FiberCanvas
        frameloop={!active ? "never" : reduced ? "demand" : "always"}
        camera={{ fov: FOV, near: 0.1, far: 60, position: [0, 1.6, 4.6] }}
        onCreated={(state: any) => {
          state.gl.setClearColor(0x000000, 0);
          state.gl.toneMapping = THREE.ACESFilmicToneMapping;
          state.gl.toneMappingExposure = 1.05;
          invalidateRef.current = state.invalidate;
        }}
        style={{ flex: 1, backgroundColor: "transparent" }}
      >
        <SceneContent
          sky={sky}
          growthRef={growthRef}
          vitality={vitality}
          treeSeed={treeSeed}
          grownSeeds={grownSeeds}
          waterKey={waterKey}
          celebrateKey={celebrateKey}
          lowDetail={lowDetail}
          still={reduced}
          look={look}
          garden={garden}
          pouring={pouring}
          picks={picks}
          poofs={poofs}
          wildlife={wildlifeFor(grownSeeds.length, vitality)}
        />
      </FiberCanvas>
    </View>
  );
});

type Orbit = { yaw: number; pitch: number; dist: number; ty: number };
type Walk = { x: number; z: number; heading: number };
type Look = Orbit & { target: Orbit; rustleAt: number; walk: Walk; walkTarget: Walk; explore: boolean };
type Pick = { type: GardenActionType; id: number; pos: THREE.Vector3 };
type Picks = { camera: THREE.Camera | null; targets: Map<string, Pick>; size: { width: number; height: number } };

type SceneProps = {
  sky: Sky;
  growthRef: React.MutableRefObject<number>;
  vitality: ForestVitality;
  treeSeed: number;
  grownSeeds: number[];
  waterKey: number;
  celebrateKey: number;
  lowDetail: boolean;
  still: boolean;
  look: React.MutableRefObject<Look>;
  garden: ForestGardenState | null;
  pouring: boolean;
  picks: React.MutableRefObject<Picks>;
  poofs: { id: number; pos: THREE.Vector3; color: string; at: number }[];
  wildlife: Wildlife;
};

function SceneContent(p: SceneProps) {
  const detail = p.lowDetail ? DETAIL.low : DETAIL.full;
  const textures = useMemo(() => ({ glow: radialTexture("glow"), shadow: radialTexture("shadow") }), []);
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);

  const R = worldRadius(p.grownSeeds.length);
  const spots = useMemo(() => forestLayout(p.grownSeeds, detail.trees), [p.grownSeeds, detail.trees]);
  // Camera: orbit the tree, or walk the forest (kept inside the meadow and
  // out of the trunks); both eased.
  useFrame(({ camera, clock }: { camera: THREE.Camera; clock: THREE.Clock }) => {
    const l = p.look.current;
    const t = clock.getElapsedTime();
    if (l.explore) {
      const w = l.walkTarget;
      const d = Math.hypot(w.x, w.z);
      if (d > R - 0.25) {
        w.x *= (R - 0.25) / d;
        w.z *= (R - 0.25) / d;
      }
      for (const s of [{ x: 0, z: 0, scale: 1.2 }, ...spots]) {
        const dx = w.x - s.x, dz = w.z - s.z, dd = Math.hypot(dx, dz), min = 0.28 * s.scale + 0.15;
        if (dd < min && dd > 1e-4) {
          w.x = s.x + (dx / dd) * min;
          w.z = s.z + (dz / dd) * min;
        }
      }
      const c = l.walk;
      c.x += (w.x - c.x) * 0.15;
      c.z += (w.z - c.z) * 0.15;
      c.heading += (w.heading - c.heading) * 0.15;
      const bob = p.still ? 0 : Math.sin(t * 6) * 0.004 * Math.min(1, Math.hypot(w.x - c.x, w.z - c.z) * 20);
      camera.position.set(c.x, 0.62 + bob, c.z);
      camera.lookAt(c.x + Math.sin(c.heading), 0.55, c.z + Math.cos(c.heading));
    } else {
      for (const k of ["yaw", "pitch", "dist", "ty"] as const) l[k] += (l.target[k] - l[k]) * 0.12;
      const yaw = l.yaw + (p.still ? 0 : Math.sin(t * 0.12) * 0.04);
      const cy = Math.cos(l.pitch);
      camera.position.set(Math.sin(yaw) * l.dist * cy, l.ty + Math.sin(l.pitch) * l.dist + 0.25, Math.cos(yaw) * l.dist * cy);
      camera.lookAt(0, l.ty, 0);
    }
    p.picks.current.camera = camera;
  });
  const g = p.garden;
  const droop = g ? Math.min(0.85, Math.max(0, (65 - g.health) / 65) + (g.moisture < 15 ? 0.2 : 0)) : DROOP[p.vitality];

  return (
    <>
      <fog attach="fog" args={[p.sky.fog, R * 1.6 + 4, R * 3 + 10]} />
      <hemisphereLight args={p.sky.hemi} />
      <directionalLight position={p.sky.sunPos} intensity={p.sky.sunIntensity} color={p.sky.sun} />
      <directionalLight position={[2, 1.5, -3]} intensity={0.35} color="#ffffff" />
      <SkyBody sky={p.sky} glow={textures.glow} />
      {p.sky.night ? <Stars count={p.lowDetail ? 40 : 90} /> : null}
      <Island vitality={p.vitality} detail={detail} shadow={textures.shadow} seed={p.treeSeed} radius={R} />
      {g ? <GardenGround garden={g} picks={p.picks} still={p.still} /> : null}
      {g ? <Decorations keys={g.decorations} night={p.sky.night} glow={textures.glow} /> : null}
      <WateringCan pouring={p.pouring} />
      {p.poofs.map((poof) => (
        <Poof key={poof.id} pos={poof.pos} color={poof.color} at={poof.at} glow={textures.glow} />
      ))}
      <ForestTrees spots={spots} near={detail.nearTrees} />
      <Animals wildlife={p.wildlife} spots={spots} radius={R} night={p.sky.night} still={p.still} lowDetail={p.lowDetail} />
      <LiveTree
        seed={p.treeSeed}
        growthRef={p.growthRef}
        vitality={p.vitality}
        lowDetail={p.lowDetail}
        still={p.still}
        look={p.look}
        droop={droop}
        garden={g}
        picks={p.picks}
      />
      <Rain waterKey={p.waterKey} lowDetail={p.lowDetail} />
      <Sparkles celebrateKey={p.celebrateKey} glow={textures.glow} />
      {p.sky.night ? <Fireflies count={detail.fireflies} glow={textures.glow} still={p.still} /> : null}
      {!p.sky.night && !p.still && p.wildlife.butterflies ? <Butterflies count={p.lowDetail ? Math.min(2, p.wildlife.butterflies) : p.wildlife.butterflies} /> : null}
      {(p.vitality === "wilting" || p.vitality === "dry") && !p.still ? (
        <FallingLeaves count={detail.falling} color={PALETTES[p.vitality].light} />
      ) : null}
    </>
  );
}

// ── Sky ───────────────────────────────────────────────────────────────────────
function SkyBody({ sky, glow }: { sky: Sky; glow: THREE.Texture }) {
  const pos: [number, number, number] = sky.night ? [1.9, 3.1, -5] : [sky.sunPos[0] * 0.9, 2.6 + sky.sunPos[1] * 0.15, -5];
  return (
    <group position={pos}>
      <sprite scale={[2.4, 2.4, 1]}>
        <spriteMaterial map={glow} color={sky.sun} transparent depthWrite={false} opacity={sky.night ? 0.5 : 0.85} fog={false} />
      </sprite>
      <mesh>
        <circleGeometry args={[sky.night ? 0.22 : 0.3, 32]} />
        <meshBasicMaterial color={sky.night ? "#F4F1E4" : "#FFF7E0"} fog={false} />
      </mesh>
    </group>
  );
}

function Stars({ count }: { count: number }) {
  const geometry = useMemo(() => {
    const r = rng(11);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (r() - 0.5) * 14;
      pos[i * 3 + 1] = 1.6 + r() * 4;
      pos[i * 3 + 2] = -6 - r() * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);
  return (
    <points geometry={geometry}>
      <pointsMaterial color="#ffffff" size={0.035} sizeAttenuation transparent opacity={0.85} fog={false} />
    </points>
  );
}

// ── Island ────────────────────────────────────────────────────────────────────
function Island({ vitality, detail, shadow, seed, radius: ISLAND_R }: { vitality: ForestVitality; detail: typeof DETAIL.full; shadow: THREE.Texture; seed: number; radius: number }) {
  const area = Math.PI * ISLAND_R * ISLAND_R;
  const grassCount = Math.min(220, Math.round(detail.grass * area));
  const [light, dark] = GRASS[vitality];
  const top = useMemo(() => {
    // Meadow top with patchy colour (vertex colours).
    const g = new THREE.CircleGeometry(ISLAND_R, 96, 0, Math.PI * 2);
    const r = rng(3);
    const a = new THREE.Color(light), b = new THREE.Color(dark), c = new THREE.Color();
    const colors: number[] = [];
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const n = 0.5 + 0.25 * Math.sin(x * 4.1 + y * 2.3) + 0.25 * Math.sin(y * 5.7 - x * 1.9) + (r() - 0.5) * 0.2;
      c.copy(a).lerp(b, Math.max(0, Math.min(1, n)));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.rotateX(-Math.PI / 2);
    return g;
  }, [light, dark, ISLAND_R]);

  const grass = useRef<THREE.InstancedMesh>(null);
  const flowers = useRef<THREE.InstancedMesh>(null);
  const flowerBase = Math.min(45, Math.round(detail.flowers * area));
  const flowerCount = vitality === "thriving" || vitality === "new" ? flowerBase : vitality === "thirsty" ? Math.round(flowerBase / 2) : 4;
  useEffect(() => {
    const r = rng(seed * 7 + 1);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    const spot = () => {
      for (;;) {
        const a = r() * Math.PI * 2, d = 0.95 + Math.sqrt(r()) * (ISLAND_R - 1.15);
        return [Math.cos(a) * d, Math.sin(a) * d];
      }
    };
    if (grass.current) {
      for (let i = 0; i < grassCount; i++) {
        const [x, z] = spot();
        q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4));
        m.compose(v.set(x, 0, z), q, s.set(1, 0.6 + r() * 0.9, 1));
        grass.current.setMatrixAt(i, m);
      }
      grass.current.instanceMatrix.needsUpdate = true;
    }
    if (flowers.current) {
      const palette = ["#F7A8C4", "#FFD86B", "#FFFFFF", "#C9A8F7", "#FF9E7A"].map((h) => new THREE.Color(h));
      for (let i = 0; i < flowerCount; i++) {
        const [x, z] = spot();
        m.compose(v.set(x, 0.05, z), q.identity(), s.setScalar(0.8 + r() * 0.6));
        flowers.current.setMatrixAt(i, m);
        flowers.current.setColorAt(i, palette[Math.floor(r() * palette.length)]);
      }
      flowers.current.instanceMatrix.needsUpdate = true;
      if (flowers.current.instanceColor) flowers.current.instanceColor.needsUpdate = true;
    }
  }, [grassCount, flowerCount, seed, ISLAND_R]);

  const stones = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 5 }, () => {
      const a = r() * Math.PI * 2, d = 0.6 + r() * (ISLAND_R - 0.8);
      return { p: [Math.cos(a) * d, 0.02, Math.sin(a) * d] as [number, number, number], s: 0.04 + r() * 0.05, rot: r() * 3 };
    });
  }, [ISLAND_R]);

  return (
    <group>
      {/* Soil body of the floating island */}
      <mesh position={[0, -0.32, 0]}>
        <cylinderGeometry args={[ISLAND_R, ISLAND_R * 0.62, 0.62, 64, 1]} />
        <meshStandardMaterial color="#8A6448" roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.75, 0]}>
        <coneGeometry args={[ISLAND_R * 0.62, 0.5, 48]} />
        <meshStandardMaterial color="#6E4E39" roughness={1} />
      </mesh>
      <mesh position={[0, -0.005, 0]}>
        <cylinderGeometry args={[ISLAND_R + 0.01, ISLAND_R + 0.01, 0.04, 64, 1, true]} />
        <meshStandardMaterial color={dark} roughness={0.9} />
      </mesh>
      <mesh geometry={top} position={[0, 0.015, 0]}>
        <meshStandardMaterial vertexColors roughness={0.95} />
      </mesh>
      {/* Soil round the trunk and the tree's soft shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.28, 32]} />
        <meshStandardMaterial color="#7A563D" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.08, 0.024, 0.05]}>
        <circleGeometry args={[0.85, 40]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} opacity={0.45} />
      </mesh>
      <instancedMesh key={`g${grassCount}`} ref={grass} args={[undefined, undefined, grassCount]}>
        <coneGeometry args={[0.018, 0.09, 4]} />
        <meshStandardMaterial color={dark} roughness={0.9} />
      </instancedMesh>
      {flowerCount > 0 ? (
        <instancedMesh key={flowerCount} ref={flowers} args={[undefined, undefined, flowerCount]}>
          <icosahedronGeometry args={[0.022, 0]} />
          <meshStandardMaterial roughness={0.6} />
        </instancedMesh>
      ) : null}
      {stones.map((s, i) => (
        <mesh key={i} position={s.p} rotation={[s.rot, s.rot * 2, 0]} scale={[s.s * 1.3, s.s, s.s]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#9B9690" roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}

// ── Trees ─────────────────────────────────────────────────────────────────────
const UP = new THREE.Vector3(0, 1, 0);
const branchGeometry = () => {
  const g = new THREE.CylinderGeometry(0.72, 1, 1, 8, 1);
  g.translate(0, 0.5, 0);
  return g;
};

/** A sprig of four curved, pointed leaves fanned round its stem (local +Y = outward). */
function sprigGeometry() {
  const pos: number[] = [];
  const SEG = 4;
  const leaf = (yaw: number, tilt: number, len: number) => {
    const rows: THREE.Vector3[][] = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const w = Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.24 * len; // pointed tip, round base
      const bend = -0.18 * t * t * len; // curls down towards the tip
      rows.push([-w, 0, w].map((x) => new THREE.Vector3(x, t * len, bend + (x === 0 ? 0.03 * len : 0))));
    }
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0, "YXZ"));
    for (let i = 0; i < SEG; i++) {
      for (let k = 0; k < 2; k++) {
        const a = rows[i][k], b = rows[i][k + 1], c = rows[i + 1][k], d = rows[i + 1][k + 1];
        for (const v of [a, c, b, b, c, d]) {
          const w = v.clone().applyQuaternion(rot);
          pos.push(w.x, w.y, w.z);
        }
      }
    }
  };
  leaf(0, 0.15, 1);
  leaf(Math.PI * 0.5, 0.75, 0.85);
  leaf(Math.PI * 1.05, 0.7, 0.9);
  leaf(Math.PI * 1.55, 0.8, 0.8);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A five-petal blossom (local +Y = facing out). */
function flowerGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const petal = new THREE.CircleGeometry(0.32, 10);
    petal.scale(0.75, 1, 1);
    petal.translate(0, 0.34, 0);
    petal.rotateZ((i / 5) * Math.PI * 2);
    petal.rotateX(-Math.PI / 2 + 0.25);
    parts.push(petal.toNonIndexed());
  }
  const centre = new THREE.SphereGeometry(0.12, 8, 6).toNonIndexed();
  centre.translate(0, 0.05, 0);
  const pos: number[] = [];
  for (const p of [...parts, centre]) pos.push(...(p.getAttribute("position").array as Float32Array));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

type TreeMeshes = {
  branches: THREE.InstancedMesh | null;
  leaves: THREE.InstancedMesh | null;
  flowers: THREE.InstancedMesh | null;
  canopy: THREE.InstancedMesh | null;
};
type TreeAssets = ReturnType<typeof useTreeAssets>;

/** Writes a posed tree into its instanced meshes (branches, leaf sprigs, blossoms, inner canopy). */
function writeTree(tree: Tree3, pose: ReturnType<typeof emptyPose>, meshes: TreeMeshes, a: TreeAssets) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), d = new THREE.Vector3();
  if (meshes.branches) {
    pose.branches.forEach((b, i) => {
      d.set(b.end[0] - b.start[0], b.end[1] - b.start[1], b.end[2] - b.start[2]);
      const len = d.length();
      if (!b.visible || len < 1e-5) {
        m.makeScale(0, 0, 0);
      } else {
        q.setFromUnitVectors(UP, d.normalize());
        m.compose(v.set(...b.start), q, s.set(b.radius, len, b.radius));
      }
      meshes.branches!.setMatrixAt(i, m);
    });
    meshes.branches.instanceMatrix.needsUpdate = true;
  }
  const writeLeaves = (mesh: THREE.InstancedMesh | null, ids: number[], scale: number) => {
    if (!mesh) return;
    ids.forEach((li, n) => {
      const l = pose.leaves[li];
      if (!l.visible) m.makeScale(0, 0, 0);
      else m.compose(v.set(...l.pos), a.leafQuats[li], s.setScalar(l.size * scale));
      mesh.setMatrixAt(n, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  writeLeaves(meshes.leaves, a.leafIds, 1.25);
  writeLeaves(meshes.flowers, a.flowerIds, 0.55);
  if (meshes.canopy) {
    a.canopyIds.forEach((bi, n) => {
      const b = pose.branches[bi];
      const full = tree.branches[bi].length;
      const grown = Math.hypot(b.end[0] - b.start[0], b.end[1] - b.start[1], b.end[2] - b.start[2]) / full;
      const r = 0.1 * Math.max(0, grown - 0.35) / 0.65;
      if (!b.visible || r <= 0.001) m.makeScale(0, 0, 0);
      else m.compose(v.set(b.end[0], b.end[1] + 0.02, b.end[2]), q.identity(), s.set(r * 1.15, r * 0.85, r * 1.15));
      meshes.canopy!.setMatrixAt(n, m);
    });
    meshes.canopy.instanceMatrix.needsUpdate = true;
  }
}

function useTreeAssets(tree: Tree3, vitality: ForestVitality) {
  const palette = PALETTES[vitality];
  // Each sprig faces outward from its cluster (with a random twist), so the
  // crown reads as leaves catching light, not random blobs.
  const leafQuats = useMemo(() => {
    const r = rng(tree.seed * 13 + 5);
    const out = new THREE.Vector3(), twist = new THREE.Quaternion();
    return tree.leaves.map((l) => {
      out.set(l.offset[0], l.offset[1] + 0.06, l.offset[2]).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(UP, out);
      twist.setFromAxisAngle(UP, r() * Math.PI * 2);
      return q.multiply(twist);
    });
  }, [tree]);
  const leafIds = useMemo(() => tree.leaves.map((l, i) => (l.blossom ? -1 : i)).filter((i) => i >= 0), [tree]);
  const flowerIds = useMemo(() => tree.leaves.map((l, i) => (l.blossom ? i : -1)).filter((i) => i >= 0), [tree]);
  const canopyIds = useMemo(() => {
    const minDepth = tree.branches.some((b) => b.depth >= 3) ? 2 : 1;
    return tree.branches.filter((b) => b.depth >= minDepth).map((b) => b.id);
  }, [tree]);
  const leafColors = useMemo(() => {
    const dark = new THREE.Color(palette.dark), mid = new THREE.Color(palette.mid), light = new THREE.Color(palette.light);
    return tree.leaves.map((l) => {
      if (l.blossom) return BLOSSOM;
      const c = new THREE.Color();
      return l.shade < 0.5 ? c.copy(dark).lerp(mid, l.shade * 2) : c.copy(mid).lerp(light, (l.shade - 0.5) * 2);
    });
  }, [tree, palette]);
  const canopyColor = useMemo(() => new THREE.Color(palette.dark).lerp(new THREE.Color(palette.mid), 0.35), [palette]);
  return useMemo(
    () => ({ palette, leafQuats, leafColors, leafIds, flowerIds, canopyIds, canopyColor }),
    [palette, leafQuats, leafColors, leafIds, flowerIds, canopyIds, canopyColor],
  );
}

/** Puts per-leaf colours onto the sprig mesh (blossoms keep their own colour). */
function paintLeaves(mesh: THREE.InstancedMesh | null, ids: number[], colors: THREE.Color[]) {
  if (!mesh) return;
  ids.forEach((li, n) => mesh.setColorAt(n, colors[li]));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** The meshes of one tree; `meshes` is filled in by ref. */
function TreeParts({ tree, assets, meshes, colors }: { tree: Tree3; assets: TreeAssets; meshes: React.MutableRefObject<TreeMeshes>; colors: THREE.Color[] }) {
  const branchGeo = useMemo(branchGeometry, []);
  const sprig = useMemo(sprigGeometry, []);
  const flower = useMemo(flowerGeometry, []);
  useEffect(() => () => [branchGeo, sprig, flower].forEach((g) => g.dispose()), [branchGeo, sprig, flower]);
  return (
    <>
      <instancedMesh ref={(m: THREE.InstancedMesh | null) => { meshes.current.branches = m; }} args={[branchGeo, undefined, tree.branches.length]}>
        <meshStandardMaterial color={assets.palette.trunk} roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={(m: THREE.InstancedMesh | null) => { meshes.current.canopy = m; }} args={[undefined, undefined, assets.canopyIds.length]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={assets.canopyColor} roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        key={`l${assets.leafIds.length}`}
        ref={(m: THREE.InstancedMesh | null) => {
          meshes.current.leaves = m;
          paintLeaves(m, assets.leafIds, colors);
        }}
        args={[sprig, undefined, assets.leafIds.length]}
      >
        <meshStandardMaterial side={THREE.DoubleSide} roughness={0.62} />
      </instancedMesh>
      {assets.flowerIds.length ? (
        <instancedMesh
          key={`f${assets.flowerIds.length}`}
          ref={(m: THREE.InstancedMesh | null) => { meshes.current.flowers = m; }}
          args={[flower, undefined, assets.flowerIds.length]}
        >
          <meshStandardMaterial color={BLOSSOM} side={THREE.DoubleSide} roughness={0.5} />
        </instancedMesh>
      ) : null}
    </>
  );
}

function LiveTree({
  seed,
  growthRef,
  vitality,
  lowDetail,
  still,
  look,
  droop,
  garden,
  picks,
}: {
  seed: number;
  growthRef: React.MutableRefObject<number>;
  vitality: ForestVitality;
  lowDetail: boolean;
  still: boolean;
  look: React.MutableRefObject<{ rustleAt: number }>;
  droop: number;
  garden: ForestGardenState | null;
  picks: React.MutableRefObject<Picks>;
}) {
  const tree = useMemo(() => buildTree(seed, { lowDetail }), [seed, lowDetail]);
  const pose = useMemo(() => emptyPose(tree), [tree]);
  const assets = useTreeAssets(tree, vitality);
  const baseColors = assets.leafColors;
  const meshes = useRef<TreeMeshes>({ branches: null, leaves: null, flowers: null, canopy: null });
  const seedRef = useRef<THREE.Mesh>(null);
  const pestRefs = useRef<(THREE.Group | null)[]>([]);
  // Crown leaves that a pest or dry leaf can sit on (not the sprout's, not blossoms).
  const crown = useMemo(() => tree.leaves.map((l, i) => (l.until == null && !l.blossom ? i : -1)).filter((i) => i >= 0), [tree]);
  const slotLeaf = (slot: number) => crown[slot % crown.length];
  const hunger = garden ? Math.max(0, Math.min(1, (40 - garden.nutrients) / 40)) * 0.55 : 0;
  const dead = useMemo(() => new Map((garden?.deadLeaves ?? []).map((d) => [slotLeaf(d.leaf), d.id])), [garden?.deadLeaves, crown]); // eslint-disable-line react-hooks/exhaustive-deps
  const leafColors = useMemo(() => {
    const yellow = new THREE.Color("#C9C25A"), brown = new THREE.Color("#9A6B3F");
    return baseColors.map((c, i) => (dead.has(i) ? brown : hunger ? c.clone().lerp(yellow, hunger) : c));
  }, [baseColors, dead, hunger]);

  useEffect(() => paintLeaves(meshes.current.leaves, assets.leafIds, leafColors), [leafColors, assets.leafIds]);

  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = clock.getElapsedTime();
    const now = performance.now() / 1000;
    const since = now - look.current.rustleAt;
    const rustle = since < 1.2 ? Math.exp(-since * 3.5) * 0.06 : 0;
    const wind = still ? 0 : Math.sin(t * 0.8) * 0.018 + Math.sin(t * 2.3 + 1) * 0.007;
    const g = growthRef.current;
    poseTree(tree, g, { wind, droop, time: t, rustle }, pose);
    writeTree(tree, pose, meshes.current, assets);
    // Where a leaf is now; the trunk top while the tree is too young for it.
    const leafPos = (i: number) => {
      const l = pose.leaves[i];
      const p = l?.visible ? l.pos : pose.branches[0].end;
      return new THREE.Vector3(p[0], Math.max(0.08, p[1]), p[2]);
    };
    const targets = picks.current.targets;
    for (const key of [...targets.keys()]) if (key.startsWith("shoo:") || key.startsWith("prune:")) targets.delete(key);
    dead.forEach((id, i) => targets.set(`prune:${id}`, { type: "prune", id, pos: leafPos(i) }));
    (garden?.pests ?? []).forEach((pest, n) => {
      const pos = leafPos(slotLeaf(pest.leaf)).add(new THREE.Vector3(Math.sin(t * 1.3 + n) * 0.03, 0.03, 0.03));
      const ref = pestRefs.current[n];
      if (ref) {
        ref.position.copy(pos);
        ref.rotation.y = t * 1.5 + n;
      }
      targets.set(`shoo:${pest.id}`, { type: "shoo", id: pest.id, pos });
    });
    if (seedRef.current) {
      const s = Math.max(0, 1 - g / 0.06);
      seedRef.current.scale.set(0.055 * s, 0.04 * s, 0.045 * s);
    }
  });

  return (
    <group>
      <mesh ref={seedRef} position={[0, 0.045, 0]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#8B5E3C" roughness={0.6} />
      </mesh>
      <TreeParts tree={tree} assets={assets} meshes={meshes} colors={leafColors} />
      {(garden?.pests ?? []).map((pest, n) => (
        <group key={pest.id} ref={(r: THREE.Group | null) => { pestRefs.current[n] = r; }}>
          {/* A ladybird: red shell, black head and spots */}
          <mesh scale={[0.032, 0.022, 0.04]}>
            <sphereGeometry args={[1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#E0302A" roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.004, 0.036]} scale={0.015}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#1B1B1B" />
          </mesh>
          {[[-0.012, 0.018, 0.005], [0.012, 0.018, -0.01], [0, 0.02, -0.022]].map((s, i) => (
            <mesh key={i} position={s as [number, number, number]} scale={0.006}>
              <sphereGeometry args={[1, 8, 6]} />
              <meshStandardMaterial color="#1B1B1B" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * The person's grown trees spread round the meadow (lib/forestWorld.ts). The
 * nearest few are full trees; the rest are lighter low-poly trees (trunk +
 * rounded crown), all in two instanced meshes, so a big forest stays cheap.
 */
function ForestTrees({ spots, near }: { spots: TreeSpot[]; near: number }) {
  const far = spots.slice(near);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const BLOBS = 4;
  useEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    const greens = ["#2E6B34", "#3F9447", "#4F9E46", "#6FB24F", "#2F7A3E"].map((h) => new THREE.Color(h));
    far.forEach((t, i) => {
      const r = rng(t.seed * 31 + 7);
      const h = 0.75 * t.scale * 1.35;
      trunks.current?.setMatrixAt(i, m.compose(v.set(t.x, 0, t.z), q.identity(), s.set(0.05 * t.scale * 1.4, h, 0.05 * t.scale * 1.4)));
      for (let b = 0; b < BLOBS; b++) {
        const a = t.rot + (b / BLOBS) * Math.PI * 2;
        const off = b === 0 ? 0 : 0.17 * t.scale * 1.3;
        const rad = (b === 0 ? 0.36 : 0.26 + r() * 0.06) * t.scale * 1.3;
        m.compose(v.set(t.x + Math.cos(a) * off, h + (b === 0 ? 0.12 : 0) * t.scale + r() * 0.06, t.z + Math.sin(a) * off), q.identity(), s.set(rad, rad * 0.88, rad));
        crowns.current?.setMatrixAt(i * BLOBS + b, m);
        crowns.current?.setColorAt(i * BLOBS + b, greens[Math.floor(r() * greens.length)]);
      }
    });
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
    if (crowns.current) {
      crowns.current.instanceMatrix.needsUpdate = true;
      if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
    }
  }, [far]);
  const trunkGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.75, 1, 1, 7);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  return (
    <>
      {spots.slice(0, near).map((t) => (
        <StaticTree key={t.seed} seed={t.seed} position={[t.x, 0, t.z]} scale={t.scale} />
      ))}
      {far.length ? (
        <>
          <instancedMesh key={`t${far.length}`} ref={trunks} args={[trunkGeo, undefined, far.length]}>
            <meshStandardMaterial color="#6E4B36" roughness={0.95} />
          </instancedMesh>
          <instancedMesh key={`c${far.length}`} ref={crowns} args={[undefined, undefined, far.length * BLOBS]}>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial roughness={0.85} flatShading />
          </instancedMesh>
        </>
      ) : null}
    </>
  );
}

function StaticTree({ seed, position, scale }: { seed: number; position: [number, number, number]; scale: number }) {
  const tree = useMemo(() => buildTree(seed, { lowDetail: true }), [seed]);
  const assets = useTreeAssets(tree, "thriving");
  const meshes = useRef<TreeMeshes>({ branches: null, leaves: null, flowers: null, canopy: null });
  useEffect(() => {
    writeTree(tree, poseTree(tree, 1, {}, emptyPose(tree)), meshes.current, assets);
    paintLeaves(meshes.current.leaves, assets.leafIds, assets.leafColors);
  }, [tree, assets]);
  return (
    <group position={position} scale={scale}>
      <TreeParts tree={tree} assets={assets} meshes={meshes} colors={assets.leafColors} />
    </group>
  );
}

// ── Effects ───────────────────────────────────────────────────────────────────
/** Starts a timed effect each time `key` changes (not on first mount). */
function useEffectClock(key: number) {
  const first = useRef(key);
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (key !== first.current) startedAt.current = performance.now() / 1000;
  }, [key]);
  return () => (startedAt.current == null ? Infinity : performance.now() / 1000 - startedAt.current);
}

const RAIN_SECONDS = 2.8;

function Rain({ waterKey, lowDetail }: { waterKey: number; lowDetail: boolean }) {
  const since = useEffectClock(waterKey);
  const count = lowDetail ? 40 : 90;
  const drops = useMemo(() => {
    const r = rng(17);
    return Array.from({ length: count }, () => ({ x: (r() - 0.5) * 1.1, z: (r() - 0.5) * 0.8, o: r(), sp: 2.2 + r() * 0.8 }));
  }, [count]);
  const cloud = useRef<THREE.Group>(null);
  const rain = useRef<THREE.InstancedMesh>(null);
  const wet = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = since();
    const on = t < RAIN_SECONDS + 1.5;
    const fade = t < 0.4 ? t / 0.4 : t > RAIN_SECONDS ? Math.max(0, 1 - (t - RAIN_SECONDS) / 1.2) : 1;
    if (cloud.current) {
      cloud.current.visible = on;
      cloud.current.position.set(0.05, 2.15 + (1 - fade) * 0.3, 0.1);
      cloud.current.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.95 * fade));
    }
    if (rain.current) {
      const m = new THREE.Matrix4();
      drops.forEach((d, i) => {
        const y = 2.05 - (((t * d.sp + d.o * 2) % 2.05));
        const visible = t < RAIN_SECONDS && t > 0.25;
        m.makeScale(visible ? 1 : 0, visible ? 1 : 0, visible ? 1 : 0).setPosition(d.x, y, d.z);
        rain.current!.setMatrixAt(i, m);
      });
      rain.current.instanceMatrix.needsUpdate = true;
    }
    if (wet.current) {
      const w = t < RAIN_SECONDS ? Math.min(1, t / 1.5) : Math.max(0, 1 - (t - RAIN_SECONDS) / 4);
      (wet.current.material as THREE.MeshStandardMaterial).opacity = 0.35 * w;
      wet.current.visible = w > 0.01;
    }
  });
  return (
    <>
      <group ref={cloud} visible={false}>
        {[[-0.32, 0, 0, 0.28], [0, 0.08, 0, 0.36], [0.33, 0, 0, 0.27], [0.12, -0.04, 0.18, 0.24], [-0.15, -0.04, -0.15, 0.24]].map(([x, y, z, s], i) => (
          <mesh key={i} position={[x, y, z]} scale={s}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color="#F4F7FB" roughness={1} transparent opacity={0} />
          </mesh>
        ))}
      </group>
      <instancedMesh ref={rain} args={[undefined, undefined, count]}>
        <boxGeometry args={[0.008, 0.09, 0.008]} />
        <meshBasicMaterial color="#8CC6F2" transparent opacity={0.8} />
      </instancedMesh>
      <mesh ref={wet} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.026, 0]} visible={false}>
        <circleGeometry args={[0.7, 40]} />
        <meshStandardMaterial color="#3E5A2C" transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}

function Sparkles({ celebrateKey, glow }: { celebrateKey: number; glow: THREE.Texture }) {
  const since = useEffectClock(celebrateKey);
  const parts = useMemo(() => {
    const r = rng(23);
    return Array.from({ length: 26 }, () => ({ a: r() * Math.PI * 2, sp: 0.4 + r() * 0.6, up: 0.6 + r() * 0.9, y: 0.6 + r() * 0.8, s: 0.06 + r() * 0.08 }));
  }, []);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = since();
    const g = group.current;
    if (!g) return;
    g.visible = t < 1.8;
    if (!g.visible) return;
    g.children.forEach((c, i) => {
      const p = parts[i];
      c.position.set(Math.cos(p.a) * p.sp * t, p.y + p.up * t - 0.4 * t * t, Math.sin(p.a) * p.sp * t);
      ((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - t / 1.8);
    });
  });
  return (
    <group ref={group} visible={false}>
      {parts.map((p, i) => (
        <sprite key={i} scale={[p.s, p.s, 1]}>
          <spriteMaterial map={glow} color="#FFE08A" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

function Fireflies({ count, glow, still }: { count: number; glow: THREE.Texture; still: boolean }) {
  const flies = useMemo(() => {
    const r = rng(31);
    return Array.from({ length: count }, () => ({ a: r() * 6, r: 0.5 + r() * 0.9, y: 0.25 + r() * 1, sp: 0.2 + r() * 0.3, ph: r() * 6 }));
  }, [count]);
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = still ? 0 : clock.getElapsedTime();
    group.current?.children.forEach((c, i) => {
      const f = flies[i];
      c.position.set(Math.cos(f.a + t * f.sp) * f.r, f.y + Math.sin(t * 1.3 + f.ph) * 0.08, Math.sin(f.a + t * f.sp) * f.r);
      ((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.5 + 0.5 * Math.sin(t * 2.5 + f.ph);
    });
  });
  return (
    <group ref={group}>
      {flies.map((_, i) => (
        <sprite key={i} scale={[0.09, 0.09, 1]}>
          <spriteMaterial map={glow} color="#E8FF8A" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

function Butterflies({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null);
  const colors = ["#F7A8C4", "#FFD86B"];
  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = clock.getElapsedTime();
    group.current?.children.forEach((b, i) => {
      const a = t * (0.45 + i * 0.12) + i * 2.5;
      b.position.set(Math.cos(a) * (0.75 + i * 0.2), 0.9 + Math.sin(t * 1.7 + i) * 0.18 + i * 0.25, Math.sin(a) * (0.6 + i * 0.15));
      b.rotation.y = -a;
      const flap = Math.sin(t * 18 + i) * 0.9;
      b.children[0].rotation.z = flap;
      b.children[1].rotation.z = -flap;
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: count }, (_, i) => (
        <group key={i}>
          {[1, -1].map((side) => (
            <mesh key={side} position={[0, 0, 0]}>
              <planeGeometry args={[0.07, 0.05]} />
              <meshStandardMaterial color={colors[i % 2]} side={THREE.DoubleSide} roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function FallingLeaves({ count, color }: { count: number; color: string }) {
  const leaves = useMemo(() => {
    const r = rng(41);
    return Array.from({ length: count }, () => ({ x: (r() - 0.5) * 1.2, z: (r() - 0.5) * 1, o: r() * 6, sp: 0.12 + r() * 0.1 }));
  }, [count]);
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = clock.getElapsedTime();
    group.current?.children.forEach((c, i) => {
      const l = leaves[i];
      const y = 1.7 - (((t + l.o) * l.sp * 3) % 1.7);
      c.position.set(l.x + Math.sin(t * 1.5 + l.o) * 0.12, y, l.z);
      c.rotation.set(t * 2 + l.o, t + l.o, 0);
    });
  });
  return (
    <group ref={group}>
      {leaves.map((_, i) => (
        <mesh key={i} scale={[0.035, 0.02, 0.035]}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      ))}
    </group>
  );
}

// ── Care game layer ──────────────────────────────────────────────────────────
/** Soil wetness, puddle when soggy, mulch ring, and the weeds (tappable). */
function GardenGround({ garden, picks, still }: { garden: ForestGardenState; picks: React.MutableRefObject<Picks>; still: boolean }) {
  const soil = useMemo(() => new THREE.Color("#B48C62").lerp(new THREE.Color("#4E3423"), Math.min(1, garden.moisture / 90)), [garden.moisture]);
  const chips = useMemo(() => {
    const r = rng(77);
    return Array.from({ length: 70 }, () => {
      const a = r() * Math.PI * 2, d = 0.2 + r() * 0.22;
      return { p: [Math.cos(a) * d, 0.03, Math.sin(a) * d] as [number, number, number], rot: r() * 3, s: 0.012 + r() * 0.012 };
    });
  }, []);
  const weedRefs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = still ? 0 : clock.getElapsedTime();
    const targets = picks.current.targets;
    for (const key of [...targets.keys()]) if (key.startsWith("weed:")) targets.delete(key);
    garden.weeds.forEach((w, i) => {
      const ref = weedRefs.current[i];
      if (ref) ref.rotation.z = Math.sin(t * 2 + i) * 0.12;
      targets.set(`weed:${w.id}`, { type: "weed", id: w.id, pos: new THREE.Vector3(w.x, 0.06, w.z) });
    });
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.021, 0]}>
        <circleGeometry args={[0.28, 32]} />
        <meshStandardMaterial color={soil} roughness={garden.moisture > 60 ? 0.5 : 1} />
      </mesh>
      {garden.soggy ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.1, 0.027, 0.12]}>
          <circleGeometry args={[0.32, 32]} />
          <meshStandardMaterial color="#6FA8D6" transparent opacity={0.55} roughness={0.1} />
        </mesh>
      ) : null}
      {garden.mulched
        ? chips.map((c, i) => (
            <mesh key={i} position={c.p} rotation={[0, c.rot, 0]} scale={[c.s * 2, c.s * 0.6, c.s]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color={i % 3 ? "#7B5236" : "#9A6A45"} roughness={1} />
            </mesh>
          ))
        : null}
      {garden.weeds.map((w, i) => (
        <group key={w.id} position={[w.x, 0.02, w.z]} ref={(r: THREE.Group | null) => { weedRefs.current[i] = r; }}>
          {[0, 2.1, 4.2].map((a) => (
            <mesh key={a} rotation={[Math.cos(a) * 0.5, a, Math.sin(a) * 0.5]} position={[0, 0.05, 0]}>
              <coneGeometry args={[0.018, 0.12, 4]} />
              <meshStandardMaterial color="#4E7A2E" roughness={0.8} flatShading />
            </mesh>
          ))}
          <mesh position={[0, 0.11, 0]} scale={0.018}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color="#E8E26A" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A watering can over the tree, tilting and pouring while the button is held. */
function WateringCan({ pouring }: { pouring: boolean }) {
  const group = useRef<THREE.Group>(null);
  const drops = useRef<THREE.InstancedMesh>(null);
  const tilt = useRef(0);
  const COUNT = 40;
  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = clock.getElapsedTime();
    tilt.current += ((pouring ? 1 : 0) - tilt.current) * 0.15;
    const g = group.current;
    if (g) {
      g.visible = tilt.current > 0.02;
      g.position.set(0.55, 1.15 + (1 - tilt.current) * 0.3, 0.35);
      g.rotation.set(0, -0.6, -tilt.current * 0.75);
    }
    if (drops.current) {
      const m = new THREE.Matrix4();
      for (let i = 0; i < COUNT; i++) {
        const f = (t * 1.6 + i / COUNT) % 1;
        const on = tilt.current > 0.6;
        // From the spout tip down to the soil round the trunk.
        const x = 0.28 - f * 0.2 + Math.sin(i * 7) * 0.02, y = 1.05 - f * 1.0, z = 0.2 - f * 0.12 + Math.cos(i * 5) * 0.02;
        m.makeScale(on ? 1 : 0, on ? 1 : 0, on ? 1 : 0).setPosition(x, Math.max(0.03, y), z);
        drops.current.setMatrixAt(i, m);
      }
      drops.current.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      <group ref={group} visible={false}>
        <mesh>
          <cylinderGeometry args={[0.1, 0.11, 0.18, 20]} />
          <meshStandardMaterial color="#4DA3C9" metalness={0.3} roughness={0.35} />
        </mesh>
        <mesh position={[-0.16, 0.04, 0]} rotation={[0, 0, Math.PI / 2.6]}>
          <cylinderGeometry args={[0.012, 0.02, 0.22, 10]} />
          <meshStandardMaterial color="#3E8EB3" metalness={0.3} roughness={0.35} />
        </mesh>
        <mesh position={[0.06, 0.12, 0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.07, 0.012, 8, 20, Math.PI]} />
          <meshStandardMaterial color="#3E8EB3" />
        </mesh>
      </group>
      <instancedMesh ref={drops} args={[undefined, undefined, COUNT]}>
        <sphereGeometry args={[0.012, 6, 4]} />
        <meshStandardMaterial color="#8CC6F2" transparent opacity={0.85} />
      </instancedMesh>
    </>
  );
}

/** A little burst where something was pulled, shooed or trimmed. */
function Poof({ pos, color, at, glow }: { pos: THREE.Vector3; color: string; at: number; glow: THREE.Texture }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = performance.now() / 1000 - at;
    const g = group.current;
    if (!g) return;
    g.visible = t < 0.9;
    g.children.forEach((c, i) => {
      const a = (i / g.children.length) * Math.PI * 2;
      c.position.set(Math.cos(a) * t * 0.3, t * 0.35 + Math.sin(a) * t * 0.1, Math.sin(a) * t * 0.3);
      ((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - t / 0.9);
    });
  });
  return (
    <group ref={group} position={pos}>
      {Array.from({ length: 8 }, (_, i) => (
        <sprite key={i} scale={[0.07, 0.07, 1]}>
          <spriteMaterial map={glow} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

/** Island decorations unlocked by care level. */
/** A spot on the ring between the clearing and the forest (a = 0 faces the camera). */
const ring = (a: number, r: number, y = 0): [number, number, number] => [Math.sin(a) * r, y, Math.cos(a) * r];

function Decorations({ keys, night, glow }: { keys: string[]; night: boolean; glow: THREE.Texture }) {
  const has = (k: string) => keys.includes(k);
  const wood = <meshStandardMaterial color="#8A5A3B" roughness={0.9} />;
  return (
    <group>
      {has("bench") ? (
        <group position={ring(0.9, 0.85)} rotation={[0, 0.9 + Math.PI, 0]}>
          <mesh position={[0, 0.12, 0]}><boxGeometry args={[0.36, 0.025, 0.12]} />{wood}</mesh>
          <mesh position={[0, 0.2, -0.055]}><boxGeometry args={[0.36, 0.1, 0.02]} />{wood}</mesh>
          {[-0.15, 0.15].map((x) => (
            <mesh key={x} position={[x, 0.06, 0]}><boxGeometry args={[0.025, 0.12, 0.1]} /><meshStandardMaterial color="#4A3A30" /></mesh>
          ))}
        </group>
      ) : null}
      {has("lantern") ? (
        <group position={ring(-0.9, 0.9)}>
          <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.012, 0.015, 0.4, 8]} /><meshStandardMaterial color="#3A3A3A" /></mesh>
          <mesh position={[0, 0.43, 0]}><boxGeometry args={[0.06, 0.08, 0.06]} /><meshStandardMaterial color="#FFE6A0" emissive="#FFC85A" emissiveIntensity={night ? 1.5 : 0.3} /></mesh>
          {night ? (
            <sprite position={[0, 0.43, 0]} scale={[0.5, 0.5, 1]}>
              <spriteMaterial map={glow} color="#FFC85A" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
          ) : null}
        </group>
      ) : null}
      {has("birdhouse") ? (
        <group position={ring(2.3, 0.95)}>
          <mesh position={[0, 0.22, 0]}><cylinderGeometry args={[0.012, 0.012, 0.44, 8]} />{wood}</mesh>
          <mesh position={[0, 0.48, 0]}><boxGeometry args={[0.1, 0.1, 0.1]} /><meshStandardMaterial color="#E7C58C" /></mesh>
          <mesh position={[0, 0.56, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.1, 0.07, 4]} /><meshStandardMaterial color="#B24A3A" /></mesh>
          <mesh position={[0, 0.49, 0.051]}><circleGeometry args={[0.018, 12]} /><meshStandardMaterial color="#2A1E18" /></mesh>
        </group>
      ) : null}
      {has("pond") ? (
        <group position={ring(-2.2, 0.95, 0.025)}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.28, 32]} /><meshStandardMaterial color="#5FA8D3" roughness={0.1} metalness={0.2} /></mesh>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.3, 0.01, Math.sin(a) * 0.3]} scale={[0.05, 0.03, 0.04]}>
                <dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#9B9690" flatShading />
              </mesh>
            );
          })}
        </group>
      ) : null}
      {has("fairyLights") && night
        ? Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2;
            return (
              <sprite key={i} position={[Math.cos(a) * 0.55, 1.05 + Math.sin(a * 3) * 0.08, Math.sin(a) * 0.55]} scale={[0.09, 0.09, 1]}>
                <spriteMaterial map={glow} color={["#FFE08A", "#FFB3C7", "#B8E0FF"][i % 3]} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={night ? 1 : 0.55} />
              </sprite>
            );
          })
        : null}
      {has("swing") ? (
        <group position={[0.35, 0, 0.3]}>
          {[-0.07, 0.07].map((x) => (
            <mesh key={x} position={[x, 0.55, 0]}><cylinderGeometry args={[0.004, 0.004, 0.7, 4]} /><meshStandardMaterial color="#D9C7A0" /></mesh>
          ))}
          <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.18, 0.02, 0.07]} />{wood}</mesh>
        </group>
      ) : null}
    </group>
  );
}

// ── Wildlife (lib/forestWorld.ts#wildlifeFor) ─────────────────────────────────
/**
 * A smooth wandering path inside the meadow (Lissajous curve), stop-and-go
 * when `rest` > 0: returns position and facing at time t.
 */
function wander(t: number, seed: number, radius: number, speed: number, rest = 0) {
  const r = rng(seed);
  const p1 = r() * 6, p2 = r() * 6, w1 = 0.6 + r() * 0.5, w2 = 0.5 + r() * 0.5;
  // Stop-and-go: time only advances during the "move" part of each cycle.
  let tt = t * speed;
  if (rest > 0) {
    const cycle = 1 + rest;
    tt = Math.floor(tt / cycle) + Math.min(1, (tt % cycle));
  }
  const x = Math.sin(w1 * tt + p1) * radius, z = Math.sin(w2 * tt + p2) * radius * 0.9;
  const dx = Math.cos(w1 * tt + p1) * w1, dz = Math.cos(w2 * tt + p2) * w2 * 0.9;
  const moving = rest > 0 ? (t * speed) % (1 + rest) < 1 : true;
  return { x, z, heading: Math.atan2(dx, dz), moving, phase: (t * speed) % (1 + rest) };
}

const mat = (color: string, rough = 0.8) => <meshStandardMaterial color={color} roughness={rough} flatShading />;

function Animals({ wildlife, spots, radius, night, still, lowDetail }: { wildlife: Wildlife; spots: TreeSpot[]; radius: number; night: boolean; still: boolean; lowDetail: boolean }) {
  const range = Math.max(0.9, radius - 0.5);
  // At most 4 in the air; the rest sit in the trees, which reads calmer.
  const perched = Math.min(spots.length, Math.max(Math.floor(wildlife.birds / 3), wildlife.birds - 4));
  return (
    <>
      {!night
        ? Array.from({ length: wildlife.birds - perched }, (_, i) => <Bird key={`b${i}`} index={i} radius={Math.max(1.2, radius * 0.7)} still={still} />)
        : null}
      {!night
        ? spots.slice(0, perched).map((s, i) => <PerchedBird key={`p${i}`} spot={s} index={i} still={still} />)
        : null}
      {Array.from({ length: wildlife.rabbits }, (_, i) => <Rabbit key={`r${i}`} seed={101 + i} range={range} still={still} />)}
      {spots.slice(0, wildlife.squirrels).map((s, i) => <Squirrel key={`s${i}`} spot={s} seed={201 + i} still={still} />)}
      {Array.from({ length: wildlife.deer }, (_, i) => <Deer key={`d${i}`} seed={301 + i} range={range} antlers={i % 2 === 0} still={still} lowDetail={lowDetail} />)}
      {Array.from({ length: wildlife.foxes }, (_, i) => <Fox key={`f${i}`} seed={401 + i} range={range} still={still} />)}
    </>
  );
}

const BIRD_COLORS = ["#3E6FB0", "#C0392B", "#E2A93B", "#5B4636", "#2C7A6B"];

/** A bird flying a wide loop over the forest, flapping, now and then gliding. */
function Bird({ index, radius, still }: { index: number; radius: number; still: boolean }) {
  const g = useRef<THREE.Group>(null);
  const l = useRef<THREE.Mesh>(null);
  const rw = useRef<THREE.Mesh>(null);
  const color = BIRD_COLORS[index % BIRD_COLORS.length];
  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = still ? index : clock.getElapsedTime();
    const speed = 0.32 + (index % 3) * 0.05;
    const a = t * speed + index * 1.9;
    const r = radius * (0.75 + 0.25 * Math.sin(t * 0.21 + index));
    const y = 1.7 + (index % 3) * 0.25 + Math.sin(t * 0.9 + index) * 0.15;
    if (g.current) {
      g.current.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      g.current.rotation.set(0, -a, Math.sin(t * 0.9 + index) * 0.25);
    }
    // Flap in bursts, glide between.
    const glide = Math.sin(t * 0.7 + index * 2) > 0.55;
    const flap = glide ? 0.25 : Math.sin(t * 16 + index) * 0.9;
    if (l.current) l.current.rotation.x = flap;
    if (rw.current) rw.current.rotation.x = -flap;
  });
  return (
    <group ref={g} scale={1.1}>
      <mesh scale={[0.03, 0.03, 0.065]}><sphereGeometry args={[1, 8, 6]} />{mat(color, 0.6)}</mesh>
      <mesh position={[0, 0.015, 0.06]} scale={0.022}><sphereGeometry args={[1, 8, 6]} />{mat(color, 0.6)}</mesh>
      <mesh position={[0, 0.012, 0.085]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.008, 0.025, 5]} />{mat("#F2B233")}</mesh>
      <group ref={l} position={[0.025, 0.01, 0]}>
        <mesh position={[0.05, 0, 0]} scale={[0.06, 0.006, 0.035]}><boxGeometry args={[1, 1, 1]} />{mat(color, 0.7)}</mesh>
      </group>
      <group ref={rw} position={[-0.025, 0.01, 0]}>
        <mesh position={[-0.05, 0, 0]} scale={[0.06, 0.006, 0.035]}><boxGeometry args={[1, 1, 1]} />{mat(color, 0.7)}</mesh>
      </group>
    </group>
  );
}

/** A bird sitting on a forest tree's crown, bobbing and looking about. */
function PerchedBird({ spot, index, still }: { spot: TreeSpot; index: number; still: boolean }) {
  const g = useRef<THREE.Group>(null);
  const color = BIRD_COLORS[(index + 2) % BIRD_COLORS.length];
  const top = 0.75 * spot.scale * 1.35 + 0.48 * spot.scale * 1.3;
  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = still ? 0 : clock.getElapsedTime();
    if (g.current) {
      g.current.position.y = top + Math.abs(Math.sin(t * 3 + index)) * 0.01;
      g.current.rotation.y = Math.round(Math.sin(t * 0.8 + index * 3) * 2) * 0.6;
    }
  });
  return (
    <group ref={g} position={[spot.x, top, spot.z]}>
      <mesh scale={[0.03, 0.035, 0.05]}><sphereGeometry args={[1, 8, 6]} />{mat(color, 0.6)}</mesh>
      <mesh position={[0, 0.035, 0.03]} scale={0.022}><sphereGeometry args={[1, 8, 6]} />{mat(color, 0.6)}</mesh>
      <mesh position={[0, 0.033, 0.055]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.007, 0.02, 5]} />{mat("#F2B233")}</mesh>
    </group>
  );
}

/** A rabbit hopping about the meadow: hop, stop, look around. */
function Rabbit({ seed, range, still }: { seed: number; range: number; still: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = still ? seed : clock.getElapsedTime();
    const w = wander(t, seed, range * 0.85, 0.22, 1.4);
    if (g.current) {
      const hop = w.moving ? Math.abs(Math.sin(t * 9)) * 0.05 : 0;
      g.current.position.set(w.x, hop, w.z);
      g.current.rotation.y = w.heading + (w.moving ? 0 : Math.sin(t * 2 + seed) * 0.6);
    }
  });
  const fur = "#B9A48C";
  return (
    <group ref={g}>
      <mesh position={[0, 0.045, 0]} scale={[0.045, 0.042, 0.06]}><sphereGeometry args={[1, 10, 8]} />{mat(fur)}</mesh>
      <mesh position={[0, 0.08, 0.05]} scale={0.03}><sphereGeometry args={[1, 10, 8]} />{mat(fur)}</mesh>
      {[-0.012, 0.012].map((x) => (
        <mesh key={x} position={[x, 0.12, 0.045]} rotation={[-0.2, 0, x * 8]} scale={[0.008, 0.035, 0.012]}><sphereGeometry args={[1, 6, 6]} />{mat("#C9B49C")}</mesh>
      ))}
      <mesh position={[0, 0.055, -0.06]} scale={0.016}><sphereGeometry args={[1, 6, 6]} />{mat("#F5F1EA")}</mesh>
    </group>
  );
}

/** A squirrel dashing round a tree's base and up the trunk. */
function Squirrel({ spot, seed, still }: { spot: TreeSpot; seed: number; still: boolean }) {
  const g = useRef<THREE.Group>(null);
  const trunk = 0.05 * spot.scale * 1.4 + 0.03;
  const h = 0.75 * spot.scale * 1.35;
  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = still ? 0 : clock.getElapsedTime() + seed;
    const cycle = t % 8;
    // 0–3 s run round the base, 3–5 up the trunk, 5–7 down, 7–8 pause.
    const climb = cycle < 3 ? 0 : cycle < 5 ? (cycle - 3) / 2 : cycle < 7 ? 1 - (cycle - 5) / 2 : 0;
    const a = cycle < 3 ? (t * 2.4) % (Math.PI * 2) : (Math.floor(t / 8) * 2.4) % (Math.PI * 2);
    const r = climb > 0 ? trunk : trunk + 0.12;
    if (g.current) {
      g.current.position.set(spot.x + Math.cos(a) * r, 0.02 + climb * h * 0.85, spot.z + Math.sin(a) * r);
      g.current.rotation.set(climb > 0 ? -Math.PI / 2 * (cycle < 5 ? 1 : -1) : 0, -a, 0);
    }
  });
  return (
    <group ref={g}>
      <mesh position={[0, 0.025, 0]} scale={[0.02, 0.022, 0.035]}><sphereGeometry args={[1, 8, 6]} />{mat("#A0522D")}</mesh>
      <mesh position={[0, 0.045, 0.03]} scale={0.016}><sphereGeometry args={[1, 8, 6]} />{mat("#A0522D")}</mesh>
      <mesh position={[0, 0.055, -0.035]} rotation={[0.6, 0, 0]} scale={[0.018, 0.045, 0.022]}><sphereGeometry args={[1, 8, 6]} />{mat("#B5653A")}</mesh>
    </group>
  );
}

/** A deer strolling the forest edge, stopping to graze. */
function Deer({ seed, range, antlers, still, lowDetail }: { seed: number; range: number; antlers: boolean; still: boolean; lowDetail: boolean }) {
  const g = useRef<THREE.Group>(null);
  const neck = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = still ? seed : clock.getElapsedTime();
    const w = wander(t, seed, range, 0.08, 1.2);
    if (g.current) {
      g.current.position.set(w.x, 0, w.z);
      g.current.rotation.y = w.heading;
    }
    const step = w.moving ? Math.sin(t * 5) * 0.4 : 0;
    legs.current.forEach((leg, i) => leg && (leg.rotation.x = (i % 2 ? 1 : -1) * step));
    // Grazing: head goes down while stopped.
    const graze = w.moving ? 0 : Math.min(1, (w.phase - 1) * 2);
    if (neck.current) neck.current.rotation.x = 0.2 + graze * 1.1;
  });
  const coat = "#A8743F";
  return (
    <group ref={g} scale={1.15}>
      <mesh position={[0, 0.2, 0]} scale={[0.06, 0.06, 0.13]}><sphereGeometry args={[1, 10, 8]} />{mat(coat)}</mesh>
      {[[-0.035, 0.08], [0.035, 0.08], [-0.035, -0.09], [0.035, -0.09]].map(([x, z], i) => (
        <mesh key={i} ref={(m: THREE.Mesh | null) => { legs.current[i] = m; }} position={[x, 0.15, z]}>
          <cylinderGeometry args={[0.009, 0.007, 0.16, 5]} />
          {mat("#7B5430")}
        </mesh>
      ))}
      <group ref={neck} position={[0, 0.24, 0.1]}>
        <mesh position={[0, 0.06, 0.02]} rotation={[0.5, 0, 0]} scale={[0.022, 0.07, 0.024]}><sphereGeometry args={[1, 8, 6]} />{mat(coat)}</mesh>
        <mesh position={[0, 0.12, 0.06]} scale={[0.028, 0.03, 0.05]}><sphereGeometry args={[1, 8, 6]} />{mat(coat)}</mesh>
        {[-0.022, 0.022].map((x) => (
          <mesh key={x} position={[x, 0.15, 0.04]} rotation={[0, 0, x * 20]} scale={[0.006, 0.02, 0.012]}><sphereGeometry args={[1, 6, 4]} />{mat(coat)}</mesh>
        ))}
        {antlers && !lowDetail
          ? [-0.015, 0.015].map((x) => (
              <mesh key={x} position={[x, 0.18, 0.04]} rotation={[0, 0, x * 25]}><coneGeometry args={[0.004, 0.07, 4]} />{mat("#E8DCC2")}</mesh>
            ))
          : null}
      </group>
      <mesh position={[0, 0.22, -0.13]} scale={0.018}><sphereGeometry args={[1, 6, 4]} />{mat("#F5F1EA")}</mesh>
    </group>
  );
}

/** A fox trotting round the forest. */
function Fox({ seed, range, still }: { seed: number; range: number; still: boolean }) {
  const g = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Mesh>(null);
  useFrame(({ clock }: { clock: THREE.Clock }) => {
    const t = still ? seed : clock.getElapsedTime();
    const w = wander(t, seed, range * 0.95, 0.12, 0.6);
    if (g.current) {
      g.current.position.set(w.x, w.moving ? Math.abs(Math.sin(t * 8)) * 0.008 : 0, w.z);
      g.current.rotation.y = w.heading;
    }
    if (tail.current) tail.current.rotation.y = Math.sin(t * 3) * 0.4;
  });
  return (
    <group ref={g}>
      <mesh position={[0, 0.08, 0]} scale={[0.04, 0.04, 0.09]}><sphereGeometry args={[1, 10, 8]} />{mat("#D9692B")}</mesh>
      <mesh position={[0, 0.11, 0.09]} scale={[0.032, 0.03, 0.04]}><sphereGeometry args={[1, 8, 6]} />{mat("#D9692B")}</mesh>
      <mesh position={[0, 0.1, 0.13]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.012, 0.035, 6]} />{mat("#F5F1EA")}</mesh>
      {[-0.016, 0.016].map((x) => (
        <mesh key={x} position={[x, 0.145, 0.09]}><coneGeometry args={[0.01, 0.03, 4]} />{mat("#B3501F")}</mesh>
      ))}
      {[[-0.022, 0.05], [0.022, 0.05], [-0.022, -0.05], [0.022, -0.05]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.03, z]}><cylinderGeometry args={[0.006, 0.006, 0.06, 5]} />{mat("#3A2A22")}</mesh>
      ))}
      <mesh ref={tail} position={[0, 0.09, -0.1]} rotation={[0.9, 0, 0]} scale={[0.022, 0.07, 0.022]}><sphereGeometry args={[1, 8, 6]} />{mat("#D9692B")}</mesh>
    </group>
  );
}
