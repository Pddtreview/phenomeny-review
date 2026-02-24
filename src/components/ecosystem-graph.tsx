"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./ecosystem-graph.module.css";

interface GraphNode {
  id: string;
  name: string;
  slug: string;
  type: "company" | "model" | "related_company";
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface EcosystemGraphProps {
  company: { id: string; name: string; slug: string };
  models: { id: string; name: string; slug: string }[];
  relatedCompanies: { id: string; name: string; slug: string }[];
}

function buildInitialNodes(
  company: EcosystemGraphProps["company"],
  models: EcosystemGraphProps["models"],
  relatedCompanies: EcosystemGraphProps["relatedCompanies"],
  width: number,
  height: number
): GraphNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const nodes: GraphNode[] = [];

  nodes.push({
    id: company.id, name: company.name, slug: company.slug,
    type: "company", x: cx, y: cy, vx: 0, vy: 0, radius: 24,
  });

  const mStep = models.length > 0 ? (2 * Math.PI) / models.length : 0;
  models.forEach((m, i) => {
    const angle = mStep * i - Math.PI / 2;
    const dist = 100 + Math.random() * 40;
    nodes.push({
      id: m.id, name: m.name, slug: m.slug, type: "model",
      x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist,
      vx: 0, vy: 0, radius: 14,
    });
  });

  const rStep = relatedCompanies.length > 0 ? (2 * Math.PI) / relatedCompanies.length : 0;
  relatedCompanies.forEach((rc, i) => {
    const angle = rStep * i;
    const dist = 180 + Math.random() * 40;
    nodes.push({
      id: rc.id, name: rc.name, slug: rc.slug, type: "related_company",
      x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist,
      vx: 0, vy: 0, radius: 10,
    });
  });

  return nodes;
}

function buildEdges(
  company: EcosystemGraphProps["company"],
  models: EcosystemGraphProps["models"],
  relatedCompanies: EcosystemGraphProps["relatedCompanies"]
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  models.forEach((m) => edges.push({ source: company.id, target: m.id }));
  relatedCompanies.forEach((rc) => edges.push({ source: company.id, target: rc.id }));
  return edges;
}

const COLOR_MAP: Record<string, string> = {
  company: "#1E0E6F",
  model: "#19C39C",
  related_company: "#0D9488",
};

export default function EcosystemGraph({ company, models, relatedCompanies }: EcosystemGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string } | null>(null);
  const [dims, setDims] = useState({ width: 600, height: 450 });
  const router = useRouter();

  const [nodes, setNodes] = useState<GraphNode[]>(() =>
    buildInitialNodes(company, models, relatedCompanies, 600, 450)
  );
  const [edges] = useState<GraphEdge[]>(() =>
    buildEdges(company, models, relatedCompanies)
  );

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDims({ width: containerRef.current.clientWidth, height: 450 });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const { width, height } = dims;
    const cx = width / 2;
    const cy = height / 2;

    const simNodes = buildInitialNodes(company, models, relatedCompanies, width, height);
    const simEdges = buildEdges(company, models, relatedCompanies);

    let alpha = 1.0;
    const alphaDecay = 0.97;
    const alphaMin = 0.005;

    const nodeMap = new Map<string, GraphNode>();
    for (const n of simNodes) nodeMap.set(n.id, n);

    const tick = () => {
      if (alpha < alphaMin) return;

      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const a = simNodes[i];
          const b = simNodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (2500 / (d * d)) * alpha;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }

      for (const e of simEdges) {
        const s = nodeMap.get(e.source)!;
        const t = nodeMap.get(e.target)!;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = t.type === "model" ? 120 : 190;
        const f = (d - ideal) * 0.006 * alpha;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        s.vx += fx; s.vy += fy;
        t.vx -= fx; t.vy -= fy;
      }

      const damping = 0.85 + (1 - alpha) * 0.13;

      for (const n of simNodes) {
        if (n.type === "company") {
          n.x = cx; n.y = cy;
          n.vx = 0; n.vy = 0;
          continue;
        }

        n.vx += (cx - n.x) * 0.001 * alpha;
        n.vy += (cy - n.y) * 0.001 * alpha;
        n.vx *= damping; n.vy *= damping;
        n.x += n.vx; n.y += n.vy;

        const dx = n.x - cx;
        const dy = n.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const [minR, maxR] = n.type === "model" ? [120, 160] : [200, 260];
        if (dist < minR || dist > maxR) {
          const clamped = Math.max(minR, Math.min(maxR, dist));
          n.x = cx + (dx / dist) * clamped;
          n.y = cy + (dy / dist) * clamped;
        }

        const pad = n.radius + 5;
        n.x = Math.max(pad, Math.min(width - pad, n.x));
        n.y = Math.max(pad, Math.min(height - pad, n.y));
      }

      setNodes(simNodes.map(n => ({ ...n })));

      alpha *= alphaDecay;
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [dims, company, models, relatedCompanies]);

  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  return (
    <div ref={containerRef} className={styles.container}>
      {tooltip && (
        <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.name}
        </div>
      )}
      <svg width={dims.width} height={dims.height} className={styles.svg}>
        <circle cx={dims.width / 2} cy={dims.height / 2} r={140} fill="none" stroke="#9CA3AF" strokeWidth={1} strokeDasharray="6,5" opacity={0.12} />
        <circle cx={dims.width / 2} cy={dims.height / 2} r={230} fill="none" stroke="#D1D5DB" strokeWidth={1} strokeDasharray="6,5" opacity={0.08} />
        {edges.map((e) => {
          const s = nodeMap.get(e.source);
          const t = nodeMap.get(e.target);
          if (!s || !t) return null;
          const isModel = t.type === "model";
          const isConnected = hovered !== null && (e.source === hovered || e.target === hovered);
          return (
            <line
              key={`${e.source}-${e.target}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={isModel ? "#19C39C" : "#0D9488"}
              strokeWidth={isConnected ? 2.5 : 1}
              strokeDasharray={isModel ? "none" : "5,4"}
              opacity={hovered === null ? 0.6 : isConnected ? 0.9 : 0.15}
              style={{ transition: "opacity 0.15s, stroke-width 0.15s" }}
            />
          );
        })}
        {nodes.map((node) => {
          const isHovered = hovered === node.id;
          const isConnected = hovered !== null && edges.some(
            e => (e.source === hovered && e.target === node.id) || (e.target === hovered && e.source === node.id)
          );
          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              style={{
                cursor: "pointer",
                transition: "transform 0.15s",
              }}
              onMouseEnter={(e) => {
                setHovered(node.id);
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                  setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, name: node.name });
                }
              }}
              onMouseMove={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                  setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, name: node.name });
                }
              }}
              onMouseLeave={() => { setHovered(null); setTooltip(null); }}
              onClick={() => router.push(`/entities/${node.slug}`)}
            >
              <circle
                r={node.radius}
                fill={COLOR_MAP[node.type]}
                opacity={hovered === null || isHovered || isConnected ? 1 : 0.25}
                style={{ transition: "opacity 0.15s" }}
              />
              {node.type === "company" && (
                <text
                  textAnchor="middle"
                  dy={node.radius + 15}
                  fill="#1E0E6F"
                  fontSize="12"
                  fontWeight="800"
                  opacity={0.8}
                >
                  {node.name}
                </text>
              )}
              {node.type === "model" && (
                <text
                  textAnchor="middle"
                  dy={node.radius + 12}
                  fill="#374151"
                  fontSize="9"
                  fontWeight="600"
                  opacity={hovered === null || isHovered || isConnected ? 0.8 : 0.25}
                  style={{ transition: "opacity 0.15s" }}
                >
                  {node.name.length > 16 ? node.name.slice(0, 14) + "…" : node.name}
                </text>
              )}
              {node.type === "related_company" && isHovered && (
                <text
                  textAnchor="middle"
                  dy={node.radius + 12}
                  fill="#0D9488"
                  fontSize="9"
                  fontWeight="600"
                  opacity={0.8}
                >
                  {node.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
