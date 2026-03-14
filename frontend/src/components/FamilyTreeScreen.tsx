import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, GitBranch, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import type { LineageGraph, GraphNode } from '../types/api';
import { getLineageGraph } from '../lib/api';

interface FamilyTreeScreenProps {
  mint: string;
  onNavigateToken: (mint: string) => void;
  onBack: () => void;
}

const RISK_COLORS: Record<string, string> = {
  critical: '#FF3366', high: '#FF9933', medium: '#FFD700', low: '#00FF88',
};

function NodeCard({ node, onClick, isRoot }: { node: GraphNode; isRoot: boolean; onClick: () => void }) {
  const rc = RISK_COLORS[node.risk_level ?? 'low'];
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="flex-shrink-0 rounded-2xl p-3 text-left w-36"
      style={{
        background: isRoot ? `${rc}15` : 'rgba(255,255,255,0.04)',
        border: isRoot ? `1.5px solid ${rc}40` : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 font-bold text-small" style={{ background: `${rc}15`, color: rc }}>
        {node.image_uri
          ? <img src={node.image_uri} alt="" className="w-full h-full rounded-xl object-cover" />
          : (node.symbol ?? '?').slice(0, 2)
        }
      </div>
      <div className="text-small font-bold text-white truncate">{node.symbol ?? node.mint.slice(0, 6)}</div>
      <div className="text-[10px] font-mono text-white/25 truncate">{node.mint.slice(0, 10)}…</div>
      {node.risk_score != null && (
        <div className="text-tiny font-black mt-1" style={{ color: rc }}>{Math.round(node.risk_score)}</div>
      )}
    </motion.button>
  );
}

export function FamilyTreeScreen({ mint, onNavigateToken, onBack }: FamilyTreeScreenProps) {
  const [graph, setGraph] = useState<LineageGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([mint]));

  useEffect(() => {
    setLoading(true);
    getLineageGraph(mint)
      .then(setGraph)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [mint]);

  const rootNode = graph?.nodes.find((n) => n.mint === mint);

  // Build adjacency map: parent → children
  const childrenOf = (parentMint: string): GraphNode[] => {
    if (!graph) return [];
    const childMints = graph.edges
      .filter((e) => e.source === parentMint)
      .map((e) => e.target);
    return graph.nodes.filter((n) => childMints.includes(n.mint));
  };

  const toggleExpand = (nodeMint: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeMint)) next.delete(nodeMint);
      else next.add(nodeMint);
      return next;
    });
  };

  function TreeLevel({ parentMint, depth = 0 }: { parentMint: string; depth?: number }) {
    const children = childrenOf(parentMint);
    if (children.length === 0) return null;
    return (
      <div className="ml-4 border-l border-white/8 pl-3 mt-2 space-y-2">
        {children.map((child) => (
          <div key={child.mint}>
            <div className="flex items-center gap-2">
              <NodeCard node={child} isRoot={false} onClick={() => onNavigateToken(child.mint)} />
              {childrenOf(child.mint).length > 0 && (
                <button
                  onClick={() => toggleExpand(child.mint)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <ChevronRight size={11} className={`transition-transform ${expandedNodes.has(child.mint) ? 'rotate-90' : ''}`} />
                </button>
              )}
            </div>
            {expandedNodes.has(child.mint) && depth < 3 && (
              <TreeLevel parentMint={child.mint} depth={depth + 1} />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-4 flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <ArrowLeft size={16} className="text-white/70" />
        </button>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(111,106,207,0.15)' }}>
          <GitBranch size={15} style={{ color: '#ADCEFF' }} />
        </div>
        <div>
          <h2 className="text-small font-bold text-white">FAMILY TREE</h2>
          <p className="text-tiny text-white/40 font-mono">{mint.slice(0, 16)}…</p>
        </div>
        {graph && (
          <div className="ml-auto text-right">
            <div className="text-small font-bold text-white">{graph.nodes.length}</div>
            <div className="text-tiny text-white/30">nodes</div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-hide">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="bg-glass rounded-2xl h-16 animate-pulse" />)}
          </div>
        )}

        {error && (
          <div className="bg-glass rounded-2xl p-4 text-center" style={{ border: '1px solid rgba(255,51,102,0.2)' }}>
            <p className="text-small text-white/50">{error}</p>
          </div>
        )}

        {graph && !loading && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-glass rounded-xl p-2.5 text-center">
                <div className="text-small font-black text-white">{graph.nodes.length}</div>
                <div className="text-tiny text-white/30">Nodes</div>
              </div>
              <div className="bg-glass rounded-xl p-2.5 text-center">
                <div className="text-small font-black text-white">{graph.edges.length}</div>
                <div className="text-tiny text-white/30">Edges</div>
              </div>
              <div className="bg-glass rounded-xl p-2.5 text-center">
                <div className="text-small font-black" style={{ color: '#FF3366' }}>
                  {graph.nodes.filter((n) => n.risk_level === 'critical' || n.risk_level === 'high').length}
                </div>
                <div className="text-tiny text-white/30">High Risk</div>
              </div>
            </div>

            {/* Tree */}
            {rootNode && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <NodeCard node={rootNode} isRoot onClick={() => {}} />
                  {childrenOf(mint).length > 0 && (
                    <button
                      onClick={() => toggleExpand(mint)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-white/30"
                      style={{ background: 'rgba(255,255,255,0.05)' }}
                    >
                      <ChevronRight size={11} className={`transition-transform ${expandedNodes.has(mint) ? 'rotate-90' : ''}`} />
                    </button>
                  )}
                </div>
                {expandedNodes.has(mint) && <TreeLevel parentMint={mint} />}
              </div>
            )}

            {/* Flat list fallback if no tree structure */}
            {!rootNode && graph.nodes.length > 0 && (
              <div className="space-y-2">
                <p className="text-tiny text-white/30 mb-2">Related tokens</p>
                {graph.nodes.map((node) => (
                  <button
                    key={node.mint}
                    onClick={() => onNavigateToken(node.mint)}
                    className="w-full bg-glass rounded-xl p-2.5 flex items-center gap-2.5 text-left"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-tiny font-bold" style={{ background: `${RISK_COLORS[node.risk_level ?? 'low']}15`, color: RISK_COLORS[node.risk_level ?? 'low'] }}>
                      {(node.symbol ?? '?').slice(0, 2)}
                    </div>
                    <div className="flex-1">
                      <div className="text-small text-white font-semibold">{node.symbol ?? node.mint.slice(0, 8)}</div>
                      <div className="text-tiny text-white/30 font-mono">{node.mint.slice(0, 14)}…</div>
                    </div>
                    <ChevronRight size={12} className="text-white/20" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
