import { useState, useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';
import Sidebar from '../components/sidebar/Sidebar';
import { apiFetch } from '../lib/api';

export default function SemanticGraphPage() {
  const [data, setData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const navigate = useNavigate();
  const graphRef = useRef<any>();

  useEffect(() => {
    loadGraph();
  }, []);

  const loadGraph = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any>('/search/graph');
      setData(res);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load semantic graph');
    } finally {
      setLoading(false);
    }
  };

  const nodeColor = (node: any) => {
    switch (node.type) {
      case 'recipe': return '#F59E0B'; // Amber
      case 'media': return '#8B5CF6'; // Purple
      case 'book': return '#3B82F6'; // Blue
      case 'stock': return '#10B981'; // Green
      case 'spec': return '#6366F1'; // Indigo
      case 'link': return '#EC4899'; // Pink
      default: return '#94A3B8'; // Gray
    }
  };

  return (
    <div className="min-h-screen bg-bg flex">
      {!fullscreen && <Sidebar activeSection="dashboard" />}

      <main className="flex-1 flex flex-col relative overflow-hidden bg-[#050505]">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-bg/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)}
              className="text-ink-muted hover:text-ink transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
               <Sparkles className="text-accent" size={18} />
               <h1 className="font-display text-lg text-ink">Semantic Intelligence Map</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <button 
               onClick={() => setFullscreen(!fullscreen)}
               className="p-2 text-ink-muted hover:text-ink hover:bg-white/5 rounded-lg transition-all"
               title={fullscreen ? "Exit Fullscreen" : "Fullscreen"}
             >
               {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
             </button>
             <button 
               onClick={loadGraph}
               className="text-xs bg-white/5 hover:bg-white/10 text-ink px-4 py-2 rounded-lg transition-all font-medium"
             >
               Refresh Map
             </button>
          </div>
        </header>

        <div className="flex-1 relative">
           {loading ? (
             <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-ink-muted bg-bg/50 z-20">
                <Loader2 className="animate-spin text-accent" size={40} />
                <p className="font-mono text-sm uppercase tracking-widest">Mapping semantic clusters...</p>
             </div>
           ) : data.nodes.length > 0 ? (
             <ForceGraph2D
                ref={graphRef}
                graphData={data}
                nodeLabel="title"
                nodeColor={nodeColor}
                nodeRelSize={6}
                linkColor={() => 'rgba(255,255,255,0.05)'}
                linkWidth={node => (node as any).weight * 2}
                backgroundColor="#050505"
                onNodeClick={(node: any) => navigate(`/item/${node.id}`)}
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                   const label = node.title;
                   const fontSize = 12/globalScale;
                   ctx.font = `${fontSize}px DM Sans`;
                   const textWidth = ctx.measureText(label).width;
                   const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

                   ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                   ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0] as number, bckgDimensions[1] as number);

                   ctx.textAlign = 'center';
                   ctx.textBaseline = 'middle';
                   ctx.fillStyle = nodeColor(node);
                   ctx.fillText(label, node.x, node.y);

                   node.__bckgDimensions = bckgDimensions; // toerance for pointer events
                }}
                nodePointerAreaPaint={(node: any, color, ctx) => {
                  ctx.fillStyle = color;
                  const bckgDimensions = node.__bckgDimensions;
                  bckgDimensions && ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
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
              <LegendItem color="#F59E0B" label="Recipes" />
              <LegendItem color="#8B5CF6" label="Media" />
              <LegendItem color="#3B82F6" label="Books" />
              <LegendItem color="#10B981" label="Finance" />
              <LegendItem color="#EC4899" label="Links" />
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
