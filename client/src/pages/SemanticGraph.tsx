import { useState, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';
import { useResolvedTheme } from '../lib/theme'
import Sidebar from '../components/sidebar/Sidebar';
import { AppHeader } from '../components/AppHeader';
import { apiFetch } from '../lib/api';

interface GraphNode {
  id: string
  title: string
  type: string
  x?: number
  y?: number
  __bckgDimensions?: number[]
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  weight: number
}

// Canvas colours can't use CSS variables, so the graph keeps one palette per theme (deeper node colours on light).
const GRAPH_PALETTE = {
  dark: {
    background: '#080A0F',
    link: 'rgba(255,255,255,0.08)',
    labelBg: 'rgba(8,10,15,0.8)',
    nodes: { recipe: '#FBBF24', media: '#A78BFA', book: '#60A5FA', stock: '#34D399', spec: '#818CF8', link: '#F472B6', default: '#94A3B8' },
  },
  light: {
    background: '#EEF1F7',
    link: 'rgba(18,24,38,0.16)',
    labelBg: 'rgba(255,255,255,0.85)',
    nodes: { recipe: '#B45309', media: '#6D28D9', book: '#1D4ED8', stock: '#047857', spec: '#4338CA', link: '#BE185D', default: '#475569' },
  },
} as const;

export default function SemanticGraphPage() {
  const [nodeLimit, setNodeLimit] = useState(100);
  const [data, setData] = useState<{ nodes: GraphNode[], links: GraphLink[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadGraph();
  }, [nodeLimit]);

  const loadGraph = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ nodes: GraphNode[], links: GraphLink[] }>(`/search/graph?limit=${nodeLimit}`);
      setData(res);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load semantic graph');
    } finally {
      setLoading(false);
    }
  };

  const theme = useResolvedTheme();
  const pal = GRAPH_PALETTE[theme];
  const nodeColor = (node: GraphNode) => pal.nodes[node.type as keyof typeof pal.nodes] ?? pal.nodes.default;

  return (
    <div className="min-h-screen bg-bg flex">
      {!fullscreen && <Sidebar activeSection="dashboard" />}

      <main className="flex-1 flex flex-col relative overflow-hidden bg-bg-2">
        <AppHeader
          left={<div className="flex items-center gap-4"><button onClick={() => navigate(-1)} className="text-ink-muted hover:text-ink transition-colors"><ArrowLeft size={20} /></button><div className="flex items-center gap-2"><Sparkles className="text-accent" size={18} /><h1 className="font-display text-lg text-ink">Semantic Intelligence Map</h1></div></div>}
          actions={
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-muted hidden sm:inline">Nodes:</span>
              <select
                value={nodeLimit}
                onChange={(e) => setNodeLimit(Number(e.target.value))}
                className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-accent/50 transition-colors text-ink font-medium"
              >
                <option value={50}>50 nodes</option>
                <option value={100}>100 nodes</option>
                <option value={200}>200 nodes</option>
                <option value={500}>500 nodes</option>
              </select>
              <button onClick={() => setFullscreen(!fullscreen)} className="p-2 text-ink-muted hover:text-ink hover:bg-white/5 rounded-lg transition-all" title={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
              <button onClick={loadGraph} className="text-xs bg-white/5 hover:bg-white/10 text-ink px-4 py-2 rounded-lg transition-all font-medium">Refresh Map</button>
            </div>
          }
        />
        <AppHeader.Spacer />

        <div className="flex-1 relative">
           {loading ? (
             <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-ink-muted bg-bg/50 z-20">
                <Loader2 className="animate-spin text-accent" size={40} />
                <p className="font-mono text-sm uppercase tracking-widest">Mapping semantic clusters...</p>
             </div>
           ) : data.nodes.length > 0 ? (
             <ForceGraph2D
                graphData={data}
                nodeLabel="title"
                nodeColor={nodeColor}
                nodeRelSize={6}
                linkColor={() => pal.link}
                linkWidth={(link) => (link as GraphLink).weight * 2}
                backgroundColor={pal.background}
                onNodeClick={(node) => navigate(`/item/${(node as GraphNode).id}`)}
                nodeCanvasObject={(node, ctx, globalScale) => {
                   const gNode = node as GraphNode;
                   const label = gNode.title;
                   const fontSize = 12/globalScale;
                   ctx.font = `${fontSize}px DM Sans`;
                   const textWidth = ctx.measureText(label).width;
                   const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

                   ctx.fillStyle = pal.labelBg;
                   ctx.fillRect((gNode.x ?? 0) - bckgDimensions[0] / 2, (gNode.y ?? 0) - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

                   ctx.textAlign = 'center';
                   ctx.textBaseline = 'middle';
                   ctx.fillStyle = nodeColor(gNode);
                   ctx.fillText(label, gNode.x ?? 0, gNode.y ?? 0);

                   gNode.__bckgDimensions = bckgDimensions;
                }}
                nodePointerAreaPaint={(node, color, ctx) => {
                  const gNode = node as GraphNode;
                  ctx.fillStyle = color;
                  const bckgDimensions = gNode.__bckgDimensions;
                  if (bckgDimensions) {
                    ctx.fillRect((gNode.x ?? 0) - bckgDimensions[0] / 2, (gNode.y ?? 0) - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
                  }
                }}
             />
           ) : (
             <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center grayscale opacity-50">
                <Sparkles size={64} className="text-ink-muted mb-6" />
                <h3 className="font-display text-2xl text-ink">The map is dark</h3>
                <p className="text-ink-muted text-sm max-w-sm mt-2">
                   Add more items with AI classification to see how your knowledge clusters together.
                </p>
             </div>
           )}

           {/* Legend */}
           <div className="absolute bottom-8 left-8 p-4 bg-surface/80 backdrop-blur-md border border-white/5 rounded-2xl flex flex-col gap-2 z-10 pointer-events-none">
              <p className="text-[10px] text-ink-muted uppercase tracking-widest font-bold mb-2">Semantic Clusters</p>
              <LegendItem color={pal.nodes.recipe} label="Recipes" />
              <LegendItem color={pal.nodes.media} label="Media" />
              <LegendItem color={pal.nodes.book} label="Books" />
              <LegendItem color={pal.nodes.stock} label="Finance" />
              <LegendItem color={pal.nodes.link} label="Links" />
           </div>
        </div>
      </main>
    </div>
  );
}

function LegendItem({ color, label }: { color: string, label: string }) {
  return (
    <div className="flex items-center gap-2">
       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
       <span className="text-[10px] text-ink-muted font-medium">{label}</span>
    </div>
  );
}
