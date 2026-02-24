"use client";

import { useEffect, useRef, useState } from "react";
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

function buildGraph(
  company: EcosystemGraphProps["company"],
  models: EcosystemGraphProps["models"],
  relatedCompanies: EcosystemGraphProps["relatedCompanies"],
  width: number,
  height: number
) {
  const cx = width / 2;
  const cy = height / 2;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

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
    edges.push({ source: company.id, target: m.id });
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
    edges.push({ source: company.id, target: rc.id });
  });

  return { nodes, edges };
}

const COLOR_MAP: Record<string, string> = {
  company: "#1E0E6F",
  model: "#19C39C",
  related_company: "#0D9488",
};

export default function EcosystemGraph({ company, models, relatedCompanies }: EcosystemGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const graphRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const animRef = useRef<number>(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [dims, setDims] = useState({ width: 600, height: 450 });
  const router = useRouter();

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
    const graph = buildGraph(company, models, relatedCompanies, width, height);
    graphRef.current = graph;
    setReady(true);

    let iteration = 0;
    const maxIter = 250;

    const tick = () => {
      const ns = graph.nodes;
      if (iteration >= maxIter) return;

      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x;
          const dy = ns[j].y - ns[i].y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = 2500 / (d * d);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          ns[i].vx -= fx; ns[i].vy -= fy;
          ns[j].vx += fx; ns[j].vy += fy;
        }
      }

      for (const e of graph.edges) {
        const s = ns.find(n => n.id === e.source)!;
        const t = ns.find(n => n.id === e.target)!;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = t.type === "model" ? 120 : 190;
        const f = (d - ideal) * 0.006;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        s.vx += fx; s.vy += fy;
        t.vx -= fx; t.vy -= fy;
      }

      for (const n of ns) {
        n.vx += (cx - n.x) * 0.001;
        n.vy += (cy - n.y) * 0.001;
        n.vx *= 0.9; n.vy *= 0.9;
        n.x += n.vx; n.y += n.vy;
        const pad = n.radius + 5;
        n.x = Math.max(pad, Math.min(width - pad, n.x));
        n.y = Math.max(pad, Math.min(height - pad, n.y));
      }

      const svg = svgRef.current;
      if (svg) {
        for (const e of graph.edges) {
          const el = svg.querySelector(`[data-edge="${e.source}-${e.target}"]`) as SVGLineElement;
          const s = ns.find(n => n.id === e.source);
          const t = ns.find(n => n.id === e.target);
          if (el && s && t) {
            el.setAttribute("x1", String(s.x));
            el.setAttribute("y1", String(s.y));
            el.setAttribute("x2", String(t.x));
            el.setAttribute("y2", String(t.y));
          }
        }
        for (const n of ns) {
          const g = svg.querySelector(`[data-node="${n.id}"]`) as SVGGElement;
          if (g) g.setAttribute("transform", `translate(${n.x},${n.y})`);
        }
      }

      iteration++;
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [dims, company, models, relatedCompanies]);

  const graph = graphRef.current;

  return (
    <div ref={containerRef} className={styles.container}>
      {tooltip && (
        <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.name}
        </div>
      )}
      <svg ref={svgRef} width={dims.width} height={dims.height} className={styles.svg}>
        {ready && graph && graph.edges.map((e) => (
          <line
            key={`${e.source}-${e.target}`}
            data-edge={`${e.source}-${e.target}`}
            stroke="#E5E7EB"
            strokeWidth={1}
          />
        ))}
        {ready && graph && graph.nodes.map((node) => (
          <g
            key={node.id}
            data-node={node.id}
            style={{ cursor: "pointer" }}
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
              opacity={hovered === null || hovered === node.id ? 1 : 0.35}
              style={{ transition: "opacity 0.15s" }}
            />
            {node.type === "company" && (
              <text textAnchor="middle" dy={node.radius + 14} fill="#1E0E6F" fontSize="11" fontWeight="700">
                {node.name}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
