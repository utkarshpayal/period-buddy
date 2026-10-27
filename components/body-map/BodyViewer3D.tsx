/* eslint-disable react/no-unknown-property -- React Three Fiber elements take three.js props (args, position, intensity…). */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PanResponder, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import * as THREE from "three";
import { BODY_ANCHORS, BODY_MODEL_HEIGHT, type BodyView } from "../../lib/bodyModel.generated";
import { nearestAnchor, type BodyMarker } from "../../lib/bodyRegions";
import type { GlbMesh } from "../../lib/glb";
import { FiberCanvas, useFrame } from "../three/FiberCanvas";
import { isLowDetailDevice } from "../three/deviceTier";
import { GlHealthy, useGl3dGuard } from "../three/GlGuard";
import { radialTexture } from "../three/textures";
import { loadBodyModel } from "./loadBodyModel";
import { PAIN_COLORS } from "./painColors";

/**
 * The Body Map's 3D view: React Three Fiber over expo-gl (web: WebGL).
 * Camera control is ours (one finger rotates, two fingers pinch-zoom and pan,
 * the buttons via the ref, `focus` flies to a marker), and taps are hit-tested
 * here in screen space, so R3F's pointer events are never used. Pain dots are
 * meshes on the model's region anchors, so they stay put at any angle; their
 * glow and ripple fade out when the spot faces away from the camera.
 */

export type BodyViewer3DHandle = {
  setView: (view: BodyView) => void;
  reset: () => void;
  zoom: (factor: number) => void;
  focus: (anchorKey: string) => void;
};

type Props = {
  markers: BodyMarker[];
  selectedKey: string | null;
  /** Pauses the render loop (screen covered or app in background). */
  active: boolean;
  reduceMotion: boolean;
  onTapAnchor: (anchorKey: string) => void;
  onError: (err: unknown) => void;
  onReady?: () => void;
};

type Orbit = { yaw: number; pitch: number; distance: number; tx: number; ty: number };

const FOV = 30;
const TARGET_Y = BODY_MODEL_HEIGHT * 0.52;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
/** Half the arm span of the A-pose model, in metres. */
const HALF_WIDTH = 0.52;

/**
 * The opening view for this screen shape: the whole body fits both ways (on
 * a tall phone the arms, not the height, set the distance), with room for
 * the controls on top and the chips at the bottom, nudged up above them.
 */
function homeFor(width: number, height: number): Orbit {
  const aspect = width > 0 && height > 0 ? width / height : 0.6;
  const byHeight = (BODY_MODEL_HEIGHT * 0.5 * 1.3) / TAN;
  const byWidth = (HALF_WIDTH * 1.15) / (TAN * aspect);
  const distance = Math.max(byHeight, byWidth);
  return { yaw: 0, pitch: 0.06, distance, tx: 0, ty: TARGET_Y - distance * TAN * 0.1 };
}
const MIN_DIST = 0.7;
const VIEW_YAW: Record<BodyView, number> = { front: 0, back: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
const MARKER_LIFT = 0.012;
const TAP_SLOP = 8;
const TAP_RADIUS_PX = 30;
/** The dots' pulse redraws at this rate, not 60 fps: half the GPU work and battery. */
const PULSE_FPS = 30;

const anchorPoint = (key: string) => {
  const a = BODY_ANCHORS[key];
  return new THREE.Vector3(a.p[0] + a.n[0] * MARKER_LIFT, a.p[1] + a.n[1] * MARKER_LIFT, a.p[2] + a.n[2] * MARKER_LIFT);
};
const anchorNormal = (key: string) => new THREE.Vector3(...BODY_ANCHORS[key].n).normalize();

export const BodyViewer3D = forwardRef<BodyViewer3DHandle, Props>(function BodyViewer3D(
  { markers, selectedKey, active, reduceMotion, onTapAnchor, onError, onReady },
  ref,
) {
  useGl3dGuard();
  // Old/low-memory phones: per-vertex lighting and one light fewer.
  const low = useMemo(isLowDetailDevice, []);
  const [meshes, setMeshes] = useState<GlbMesh[] | null>(null);
  const stateRef = useRef<{ camera: THREE.Camera; invalidate: () => void } | null>(null);
  const bodyRef = useRef<THREE.Object3D | null>(null);
  const home = useRef<Orbit>(homeFor(0, 0));
  const touched = useRef(false);
  const orbit = useRef<Orbit>({ ...home.current, yaw: reduceMotion ? 0 : -0.7 });
  const size = useRef({ width: 1, height: 1 });
  const anim = useRef<number | null>(null);
  const textures = useMemo(() => ({ glow: radialTexture("glow"), ring: radialTexture("ring"), shadow: radialTexture("shadow") }), []);

  useEffect(() => {
    let alive = true;
    loadBodyModel()
      .then((m) => alive && setMeshes(m))
      .catch((err) => alive && onError(err));
    return () => {
      alive = false;
      if (anim.current != null) cancelAnimationFrame(anim.current);
    };
  }, [onError]);

  const geometries = useMemo(
    () =>
      meshes?.map((m) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
        g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
        if (m.colors) g.setAttribute("color", new THREE.BufferAttribute(m.colors, 3));
        g.setIndex(new THREE.BufferAttribute(m.indices, 1));
        g.computeBoundingSphere();
        return { name: m.name, geometry: g, color: new THREE.Color(...m.color), vertexColors: !!m.colors };
      }) ?? null,
    [meshes],
  );
  useEffect(() => () => geometries?.forEach((g) => g.geometry.dispose()), [geometries]);
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);

  const applyCamera = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const { yaw, pitch, distance, tx, ty } = orbit.current;
    const cam = s.camera as THREE.PerspectiveCamera;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const target = new THREE.Vector3(0, ty, 0).addScaledVector(right, tx);
    cam.position.set(
      target.x + distance * Math.sin(yaw) * Math.cos(pitch),
      target.y + distance * Math.sin(pitch),
      target.z + distance * Math.cos(yaw) * Math.cos(pitch),
    );
    cam.lookAt(target);
    cam.updateMatrixWorld();
    s.invalidate();
  }, []);

  const animateTo = useCallback(
    (to: Partial<Orbit>, ms = 420) => {
      if (anim.current != null) cancelAnimationFrame(anim.current);
      const from = { ...orbit.current };
      const goal = { ...from, ...to };
      let dy = (goal.yaw - from.yaw) % (Math.PI * 2);
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      const start = Date.now();
      const duration = reduceMotion ? 0 : ms;
      const step = () => {
        const t = duration ? Math.min(1, (Date.now() - start) / duration) : 1;
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        orbit.current = {
          yaw: from.yaw + dy * e,
          pitch: from.pitch + (goal.pitch - from.pitch) * e,
          distance: from.distance + (goal.distance - from.distance) * e,
          tx: from.tx + (goal.tx - from.tx) * e,
          ty: from.ty + (goal.ty - from.ty) * e,
        };
        applyCamera();
        anim.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      step();
    },
    [applyCamera, reduceMotion],
  );

  useImperativeHandle(
    ref,
    () => ({
      setView: (view) => animateTo({ ...home.current, yaw: VIEW_YAW[view] }),
      reset: () => animateTo({ ...home.current }),
      zoom: (factor) => animateTo({ distance: clamp(orbit.current.distance * factor, MIN_DIST, home.current.distance * 1.35) }, 260),
      focus: (key) => {
        if (!BODY_ANCHORS[key]) return;
        const p = anchorPoint(key);
        const n = anchorNormal(key);
        // Face the spot: hips/arms are seen from the side, the rest straight on.
        const yaw = Math.atan2(n.x, n.z);
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        animateTo({
          yaw,
          pitch: clamp(n.y * 0.6, -0.3, 0.5),
          distance: home.current.distance * 0.45,
          tx: p.x * right.x + p.z * right.z,
          ty: p.y,
        }, 650);
      },
    }),
    [animateTo],
  );

  // ── Tap hit-testing ────────────────────────────────────────────────────────
  const handleTap = useCallback(
    (x: number, y: number) => {
      const s = stateRef.current;
      if (!s) return;
      const cam = s.camera;
      const { width, height } = size.current;
      const toScreen = (p: THREE.Vector3) => {
        const ndc = p.clone().project(cam);
        return [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height];
      };
      const facing = (key: string) => anchorNormal(key).dot(cam.position.clone().sub(anchorPoint(key)).normalize()) > 0.05;
      let best: string | null = null;
      let bestD = TAP_RADIUS_PX;
      for (const m of markers) {
        if (!facing(m.key)) continue;
        const [sx, sy] = toScreen(anchorPoint(m.key));
        const d = Math.hypot(sx - x, sy - y);
        if (d < bestD) {
          best = m.key;
          bestD = d;
        }
      }
      if (best) return onTapAnchor(best);
      const body = bodyRef.current;
      if (!body) return;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((x / width) * 2 - 1, -(y / height) * 2 + 1), cam);
      const hit = ray.intersectObject(body, true)[0];
      if (!hit) return;
      const anchors = Object.fromEntries(Object.entries(BODY_ANCHORS).map(([k, a]) => [k, new THREE.Vector3(...a.p)]));
      const region = nearestAnchor(hit.point, anchors, (a, b) => a.distanceTo(b), 0.16);
      if (region) onTapAnchor(region.key);
    },
    [markers, onTapAnchor],
  );

  // ── Gestures ───────────────────────────────────────────────────────────────
  const gesture = useRef({ start: { ...home.current }, startAt: 0, pinch: 0, cx: 0, cy: 0, moved: 0 });
  const touches = (e: GestureResponderEvent) => e.nativeEvent.touches ?? [];
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Vertical page scrolls still win when the drag is clearly vertical
        // and starts with one finger; rotation is horizontal.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          touched.current = true;
          if (anim.current != null) cancelAnimationFrame(anim.current);
          anim.current = null;
          gesture.current = { start: { ...orbit.current }, startAt: Date.now(), pinch: 0, cx: 0, cy: 0, moved: 0 };
        },
        onPanResponderMove: (e, g) => {
          const t = touches(e);
          const st = gesture.current;
          st.moved = Math.max(st.moved, Math.hypot(g.dx, g.dy));
          if (t.length >= 2) {
            const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
            const cx = (t[0].pageX + t[1].pageX) / 2;
            const cy = (t[0].pageY + t[1].pageY) / 2;
            if (!st.pinch) {
              Object.assign(st, { pinch: dist, cx, cy, start: { ...orbit.current } });
              return;
            }
            const scale = (orbit.current.distance / size.current.height) * 0.55;
            orbit.current = {
              ...st.start,
              distance: clamp((st.start.distance * st.pinch) / Math.max(dist, 1), MIN_DIST, home.current.distance * 1.35),
              tx: clamp(st.start.tx - (cx - st.cx) * scale, -0.5, 0.5),
              ty: clamp(st.start.ty + (cy - st.cy) * scale, 0.1, BODY_MODEL_HEIGHT),
            };
          } else if (!st.pinch) {
            orbit.current = {
              ...st.start,
              yaw: st.start.yaw - g.dx * 0.01,
              pitch: clamp(st.start.pitch + g.dy * 0.005, -0.5, 0.7),
            };
          }
          applyCamera();
        },
        onPanResponderRelease: (e) => {
          const st = gesture.current;
          if (!st.pinch && st.moved < TAP_SLOP && Date.now() - st.startAt < 400) {
            handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY);
          }
        },
      }),
    [applyCamera, handleTap],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
    // Fit the body to this screen until the person moves it themselves.
    home.current = homeFor(size.current.width, size.current.height);
    if (!touched.current) {
      orbit.current = { ...home.current, yaw: orbit.current.yaw };
      applyCamera();
    }
  };

  // The dots pulse, so redraw at PULSE_FPS while there are dots on screen;
  // otherwise only on demand (camera moves, prop changes).
  const animate = active && !reduceMotion && markers.length > 0;
  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => stateRef.current?.invalidate(), 1000 / PULSE_FPS);
    return () => clearInterval(id);
  }, [animate]);

  return (
    <View style={{ flex: 1 }} onLayout={onLayout} {...responder.panHandlers}>
      {geometries ? (
        <FiberCanvas
          frameloop={active ? "demand" : "never"}
          camera={{ fov: FOV, near: 0.05, far: 20, position: [0, TARGET_Y, home.current.distance] }}
          onCreated={(state: any) => {
            state.gl.setClearColor(0x000000, 0);
            state.gl.toneMapping = THREE.ACESFilmicToneMapping;
            state.gl.toneMappingExposure = 1.05;
            stateRef.current = { camera: state.camera, invalidate: state.invalidate };
            applyCamera();
            // A short turn into place on first show.
            if (!reduceMotion) setTimeout(() => animateTo({ yaw: 0 }, 900), 120);
            onReady?.();
          }}
          style={{ flex: 1, backgroundColor: "transparent" }}
        >
          <GlHealthy />
          <hemisphereLight args={["#fff4ee", "#8f7488", 0.9]} />
          <directionalLight position={[-1.4, 2.6, 3]} intensity={1.6} color="#fff1e6" />
          {low ? null : <directionalLight position={[2, 1.2, 1.5]} intensity={0.45} color="#f3e6ff" />}
          <directionalLight position={[0.5, 2, -3]} intensity={0.9} color="#ffd9cf" />
          <group ref={bodyRef as any}>
            {geometries.map((g) =>
              g.name === "Body" ? (
                <mesh key={g.name} geometry={g.geometry}>
                  {/* Standard, not physical: the sheen/clearcoat shader fails to
                      compile on many phone GPUs, and three.js then silently skips
                      the body (taps still hit it, nothing is drawn). */}
                  {low ? (
                    <meshLambertMaterial vertexColors={g.vertexColors} color={g.vertexColors ? "#ffffff" : g.color} />
                  ) : (
                    <meshStandardMaterial
                      vertexColors={g.vertexColors}
                      color={g.vertexColors ? "#ffffff" : g.color}
                      roughness={0.62}
                      metalness={0}
                    />
                  )}
                </mesh>
              ) : (
                <mesh key={g.name} geometry={g.geometry}>
                  {low ? (
                    <meshLambertMaterial vertexColors={g.vertexColors} color={g.vertexColors ? "#ffffff" : g.color} />
                  ) : (
                    <meshStandardMaterial vertexColors={g.vertexColors} color={g.vertexColors ? "#ffffff" : g.color} roughness={0.2} />
                  )}
                </mesh>
              ),
            )}
          </group>
          {/* Soft contact shadow under the feet. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
            <circleGeometry args={[0.36, 48]} />
            <meshBasicMaterial map={textures.shadow} transparent depthWrite={false} opacity={0.55} />
          </mesh>
          {markers.map((m) => (
            <PainDot
              key={m.key}
              marker={m}
              selected={m.key === selectedKey}
              glow={textures.glow}
              ring={textures.ring}
              still={reduceMotion}
            />
          ))}
        </FiberCanvas>
      ) : null}
    </View>
  );
});

/**
 * One pain dot: a glossy core, a soft glow and a ripple that keeps rolling
 * out (faster when logged today/yesterday). Glow and ripple fade when the
 * spot turns away from the camera, so they never show through the body.
 */
function PainDot({
  marker,
  selected,
  glow,
  ring,
  still,
}: {
  marker: BodyMarker;
  selected: boolean;
  glow: THREE.Texture;
  ring: THREE.Texture;
  still: boolean;
}) {
  const point = useMemo(() => anchorPoint(marker.key), [marker.key]);
  const normal = useMemo(() => anchorNormal(marker.key), [marker.key]);
  const color = PAIN_COLORS[marker.intensity];
  const glowRef = useRef<THREE.Sprite>(null);
  const rippleRef = useRef<THREE.Sprite>(null);
  const selRef = useRef<THREE.Sprite>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const base = 0.013 + marker.intensity * 0.0035 + (selected ? 0.004 : 0);
  const period = marker.recent ? 1.2 : 2;
  const phase = useMemo(() => (marker.key.length * 0.37) % 1, [marker.key]);

  useFrame(({ camera, clock }: { camera: THREE.Camera; clock: THREE.Clock }) => {
    const toCam = camera.position.clone().sub(point).normalize();
    const vis = Math.max(0, Math.min(1, (normal.dot(toCam) + 0.05) / 0.3));
    const t = still ? 0.35 : ((clock.getElapsedTime() / period + phase) % 1);
    if (glowRef.current) {
      const pulse = still ? 1 : 1 + Math.sin(t * Math.PI * 2) * 0.12;
      glowRef.current.scale.setScalar(base * 7.5 * pulse);
      (glowRef.current.material as THREE.SpriteMaterial).opacity = 0.55 * vis;
    }
    if (rippleRef.current) {
      rippleRef.current.scale.setScalar(base * (2.4 + t * 6));
      (rippleRef.current.material as THREE.SpriteMaterial).opacity = (1 - t) * 0.75 * vis;
    }
    if (selRef.current) {
      selRef.current.scale.setScalar(base * 4.2);
      (selRef.current.material as THREE.SpriteMaterial).opacity = vis;
    }
    if (coreRef.current) coreRef.current.visible = vis > 0.02;
  });

  return (
    <group position={point}>
      <sprite ref={glowRef} renderOrder={3}>
        <spriteMaterial map={glow} color={color} transparent depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite ref={rippleRef} renderOrder={4}>
        <spriteMaterial map={ring} color={color} transparent depthTest={false} depthWrite={false} />
      </sprite>
      {selected ? (
        <sprite ref={selRef} renderOrder={5}>
          <spriteMaterial map={ring} color="#ffffff" transparent depthTest={false} depthWrite={false} />
        </sprite>
      ) : null}
      <mesh ref={coreRef} renderOrder={6}>
        <sphereGeometry args={[base, 14, 10]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.55}
          roughness={0.25}
          depthTest={false}
          transparent
        />
      </mesh>
    </group>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
