import * as React from "react";
import { cn } from "../lib/cn";

interface Node {
  cx: number;
  cy: number;
  r: number;
}

const NODES: Node[] = [
  { cx: 80, cy: 120, r: 3 },
  { cx: 220, cy: 60, r: 2.5 },
  { cx: 360, cy: 160, r: 3.5 },
  { cx: 520, cy: 90, r: 2.5 },
  { cx: 640, cy: 200, r: 3 },
  { cx: 180, cy: 240, r: 2.5 },
  { cx: 420, cy: 300, r: 3 },
  { cx: 600, cy: 340, r: 2.5 },
  { cx: 300, cy: 420, r: 3.5 },
  { cx: 720, cy: 120, r: 2.5 },
];

const EDGES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [2, 6],
  [6, 7],
  [4, 7],
  [6, 8],
  [3, 9],
  [4, 9],
];

/**
 * Fondo decorativo de nodos/grafo (motivo del logo). Puramente estético:
 * `aria-hidden`, sin foco y con animación que respeta prefers-reduced-motion.
 */
function NodeGraphBackdrop({
  className,
  animated = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { animated?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      {...props}
    >
      <svg
        viewBox="0 0 800 480"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
      >
        <g stroke="var(--node-line)" strokeWidth="1">
          {EDGES.map(([a, b], i) => {
            const from = NODES[a];
            const to = NODES[b];
            if (!from || !to) return null;
            return <line key={i} x1={from.cx} y1={from.cy} x2={to.cx} y2={to.cy} />;
          })}
        </g>
        <g fill="var(--node-dot)">
          {NODES.map((node, i) => (
            <circle
              key={i}
              cx={node.cx}
              cy={node.cy}
              r={node.r}
              className={animated ? "animate-node-pulse" : undefined}
              style={animated ? { animationDelay: `${i * 0.35}s` } : undefined}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export { NodeGraphBackdrop };
