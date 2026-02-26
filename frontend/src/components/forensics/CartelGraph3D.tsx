"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type { CartelEdge } from "@/lib/api";

// ─── Signal palette ────────────────────────────────────────────────────────
export const SIGNAL_COLORS: Record<string, { hex: string; label: string }> = {
  dna_match:     { hex: "#a855f7", label: "DNA match" },
  sol_transfer:  { hex: "#f97316", label: "SOL transfer" },
  timing_sync:   { hex: "#eab308", label: "Timing sync" },
  phash_cluster: { hex: "#14b8a6", label: "Image cluster" },
  cross_holding: { hex: "#3b82f6", label: "Cross-holding" },
  funding_link:  { hex: "#ef4444", label: "💸 Funding link" },
  shared_lp:     { hex: "#fb923c", label: "🏊 Shared LP" },
  sniper_ring:   { hex: "#f43f5e", label: "🎯 Sniper ring" },
};

const DEFAULT_HEX = "#888888";

// ─── Force-directed 3D layout ──────────────────────────────────────────────
interface Vec3 { x: number; y: number; z: number }

function computeLayout(wallets: string[], edges: CartelEdge[], iterations = 250): Map<string, Vec3> {
  // Initial random sphere placement
  const pos = new Map<string, Vec3>();
  wallets.forEach((w, i) => {
    const phi   = Math.acos(1 - 2 * (i + 0.5) / wallets.length);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r     = 80 + Math.random() * 20;
    pos.set(w, {
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
    });
  });

  // Aggregate edge strength per pair
  const strengthMap = new Map<string, number>();
  edges.forEach((e) => {
    const key = [e.wallet_a, e.wallet_b].sort().join("::");
    const prev = strengthMap.get(key) ?? 0;
    if (e.signal_strength > prev) strengthMap.set(key, e.signal_strength);
  });

  const vel = new Map<string, Vec3>();
  wallets.forEach((w) => vel.set(w, { x: 0, y: 0, z: 0 }));

  const REPULSION  = 3500;
  const SPRING_L   = 30;   // rest length for strongest edge
  const DAMPING    = 0.82;
  const dt         = 0.6;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all pairs
    for (let i = 0; i < wallets.length; i++) {
      for (let j = i + 1; j < wallets.length; j++) {
        const a = pos.get(wallets[i])!;
        const b = pos.get(wallets[j])!;
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        const dist2 = dx * dx + dy * dy + dz * dz + 0.01;
        const f = REPULSION / dist2;
        const va = vel.get(wallets[i])!;
        const vb = vel.get(wallets[j])!;
        va.x += f * dx; va.y += f * dy; va.z += f * dz;
        vb.x -= f * dx; vb.y -= f * dy; vb.z -= f * dz;
      }
    }
    // Spring attraction along edges
    strengthMap.forEach((strength, key) => {
      const [wa, wb] = key.split("::");
      const a = pos.get(wa), b = pos.get(wb);
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      // Stronger edge → shorter rest length → nodes pulled closer
      const restLen = SPRING_L + (1 - strength) * 80;
      const f = (dist - restLen) * 0.08 * strength;
      const nx = dx / dist, ny = dy / dist, nz = dz / dist;
      const va = vel.get(wa)!, vb = vel.get(wb)!;
      va.x += f * nx; va.y += f * ny; va.z += f * nz;
      vb.x -= f * nx; vb.y -= f * ny; vb.z -= f * nz;
    });
    // Integrate + dampen
    wallets.forEach((w) => {
      const p = pos.get(w)!, v = vel.get(w)!;
      v.x *= DAMPING; v.y *= DAMPING; v.z *= DAMPING;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    });
  }
  return pos;
}

// ─── Node sphere ──────────────────────────────────────────────────────────
function WalletNode({
  wallet,
  position,
  radius,
  isHovered,
  isSelected,
  onHover,
  onSelect,
}: {
  wallet: string;
  position: Vec3;
  radius: number;
  isHovered: boolean;
  isSelected: boolean;
  onHover: (w: string | null) => void;
  onSelect: (w: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.4;
    }
  });

  const color = isSelected ? "#facc15" : isHovered ? "#a78bfa" : "#4f46e5";
  const emissive = isHovered || isSelected ? color : "#1e1b4b";

  return (
    <mesh
      ref={meshRef}
      position={[position.x, position.y, position.z]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(wallet); }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => { e.stopPropagation(); onSelect(wallet); }}
    >
      <sphereGeometry args={[radius, 20, 20]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={isHovered || isSelected ? 0.6 : 0.2}
        roughness={0.3}
        metalness={0.4}
      />
      {/* Floating label */}
      <Html
        position={[0, radius + 3, 0]}
        center
        style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
      >
        <div
          style={{
            fontSize: "9px",
            fontFamily: "monospace",
            color: isSelected ? "#facc15" : isHovered ? "#c4b5fd" : "#94a3b8",
            background: "rgba(0,0,0,0.55)",
            padding: "1px 4px",
            borderRadius: "3px",
            letterSpacing: "0.02em",
          }}
        >
          {wallet.slice(0, 4)}…{wallet.slice(-4)}
        </div>
      </Html>
    </mesh>
  );
}

// ─── Edge tube ───────────────────────────────────────────────────────────
function EdgeLine({
  from,
  to,
  color,
  strength,
  animated,
}: {
  from: Vec3;
  to: Vec3;
  color: string;
  strength: number;
  animated: boolean;
}) {
  const points = useMemo(
    () => [
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ],
    [from, to]
  );

  return (
    <Line
      points={points}
      color={color}
      lineWidth={0.5 + strength * 2.5}
      transparent
      opacity={0.35 + strength * 0.45}
      dashed={animated}
      dashSize={animated ? 4 : undefined}
      dashOffset={animated ? 0 : undefined}
      gapSize={animated ? 2 : undefined}
    />
  );
}

// ─── Scene ───────────────────────────────────────────────────────────────
function Scene({
  wallets,
  edges,
  positions,
  degrees,
  onSelectWallet,
}: {
  wallets: string[];
  edges: Array<{ wa: string; wb: string; color: string; strength: number; animated: boolean }>;
  positions: Map<string, Vec3>;
  degrees: Map<string, number>;
  onSelectWallet: (w: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 40, 200);
  }, [camera]);

  const maxDeg = Math.max(...Array.from(degrees.values()), 1);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[100, 100, 100]} intensity={1.2} />
      <pointLight position={[-100, -50, -100]} intensity={0.6} color="#6366f1" />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />

      {/* Edges */}
      {edges.map((e, i) => {
        const from = positions.get(e.wa);
        const to   = positions.get(e.wb);
        if (!from || !to) return null;
        return (
          <EdgeLine
            key={i}
            from={from}
            to={to}
            color={e.color}
            strength={e.strength}
            animated={e.animated}
          />
        );
      })}

      {/* Nodes */}
      {wallets.map((w) => {
        const pos = positions.get(w);
        if (!pos) return null;
        const deg    = degrees.get(w) ?? 0;
        const radius = 4 + (deg / maxDeg) * 10;
        return (
          <WalletNode
            key={w}
            wallet={w}
            position={pos}
            radius={radius}
            isHovered={hovered === w}
            isSelected={selected === w}
            onHover={setHovered}
            onSelect={(ww) => {
              setSelected(ww);
              onSelectWallet(ww);
            }}
          />
        );
      })}
    </>
  );
}

// ─── Public component ────────────────────────────────────────────────────
export default function CartelGraph3D({
  wallets,
  edges: rawEdges,
}: {
  wallets: string[];
  edges: CartelEdge[];
}) {
  // Deduplicate edges keep strongest per pair
  const edges = useMemo(() => {
    const map = new Map<string, CartelEdge>();
    rawEdges.forEach((e) => {
      const key = [e.wallet_a, e.wallet_b].sort().join("::");
      if (!map.has(key) || e.signal_strength > map.get(key)!.signal_strength) {
        map.set(key, e);
      }
    });
    return Array.from(map.values()).map((e) => ({
      wa: e.wallet_a,
      wb: e.wallet_b,
      color: SIGNAL_COLORS[e.signal_type]?.hex ?? DEFAULT_HEX,
      strength: e.signal_strength,
      animated: e.signal_strength > 0.7,
    }));
  }, [rawEdges]);

  // Node degree (connection count)
  const degrees = useMemo(() => {
    const d = new Map<string, number>();
    wallets.forEach((w) => d.set(w, 0));
    edges.forEach((e) => {
      d.set(e.wa, (d.get(e.wa) ?? 0) + 1);
      d.set(e.wb, (d.get(e.wb) ?? 0) + 1);
    });
    return d;
  }, [wallets, edges]);

  // Force layout (computed once)
  const positions = useMemo(() => computeLayout(wallets, rawEdges), [wallets, rawEdges]);

  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const signalTypes = useMemo(
    () => [...new Set(rawEdges.map((e) => e.signal_type))],
    [rawEdges]
  );

  return (
    <div className="relative w-full rounded-xl border border-border overflow-hidden bg-[#09090b]" style={{ height: "580px" }}>
      {/* Signal legend */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2">
        {signalTypes.map((sig) => {
          const c = SIGNAL_COLORS[sig];
          if (!c) return null;
          return (
            <span
              key={sig}
              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm"
              style={{ borderColor: `${c.hex}60`, color: c.hex, background: `${c.hex}18` }}
            >
              <span className="inline-block h-1.5 w-3 rounded-full" style={{ background: c.hex }} />
              {c.label}
            </span>
          );
        })}
      </div>

      {/* Hint */}
      <div className="absolute bottom-3 left-3 z-10 text-[10px] text-zinc-600 select-none">
        Drag to orbit · Scroll to zoom · Click a node to inspect
      </div>

      {/* Selected wallet tooltip */}
      {selectedWallet && (
        <div className="absolute top-3 right-3 z-10 rounded-lg border border-indigo-500/40 bg-black/70 backdrop-blur-sm px-3 py-2 text-xs max-w-[220px]">
          <p className="text-zinc-400 mb-1 text-[10px] uppercase tracking-wider">Selected wallet</p>
          <code className="font-mono text-yellow-300 break-all text-[10px]">{selectedWallet}</code>
          <div className="mt-2 flex gap-2">
            <a
              href={`/deployer/${selectedWallet}`}
              className="text-indigo-400 hover:text-indigo-300 text-[10px] underline"
            >
              Deployer profile →
            </a>
            <a
              href={`https://solscan.io/account/${selectedWallet}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-300 text-[10px] underline"
            >
              Solscan ↗
            </a>
          </div>
          <button
            onClick={() => setSelectedWallet(null)}
            className="absolute top-1.5 right-2 text-zinc-600 hover:text-zinc-300 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Wallet count badge */}
      <div className="absolute bottom-3 right-3 z-10 rounded-full border border-indigo-500/30 bg-black/60 px-2.5 py-1 text-[10px] text-indigo-400 select-none">
        {wallets.length} wallets · {edges.length} edges
      </div>

      <Canvas
        camera={{ position: [0, 40, 200], fov: 55 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#09090b" }}
      >
        <Scene
          wallets={wallets}
          edges={edges}
          positions={positions}
          degrees={degrees}
          onSelectWallet={setSelectedWallet}
        />
      </Canvas>
    </div>
  );
}
