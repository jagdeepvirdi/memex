import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Brain, ArrowRight, CheckCircle2, Rocket, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, fetchInsights } from '../lib/api';
import type { Insight } from '../../../shared/types';

type Persona = 'productivity' | 'creative';

export default function WelcomePage() {
  const [step, setStep] = useState(1);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Start fetching insights in the background for step 3
    if (step === 2) {
      setLoadingInsights(true);
      fetchInsights()
        .then(setInsights)
        .catch(console.error)
        .finally(() => setLoadingInsights(false));
    }
  }, [step]);

  const handleComplete = async () => {
    // Save persona selection to settings
    if (persona) {
      try {
        await apiFetch('/settings', {
          method: 'PUT',
          body: JSON.stringify({ ai_persona: persona }),
        });
      } catch (err) {
        console.error('Failed to save persona:', err);
      }
    }
    navigate('/');
    toast.success('Welcome to Memex!');
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />

      <div className="w-full max-w-2xl relative z-10">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-surface p-10 rounded-3xl border border-white/5 shadow-2xl text-center space-y-6"
            >
              <div className="w-20 h-20 bg-accent rounded-3xl flex items-center justify-center text-bg font-bold text-4xl mx-auto shadow-2xl shadow-accent/20">
                M
              </div>
              <div className="space-y-4">
                <h1 className="font-display text-5xl text-ink">Hello, World.</h1>
                <p className="text-lg text-ink-muted leading-relaxed max-w-lg mx-auto">
                  I am Memex, your personal knowledge OS. I've connected to your data and am ready to help you organize, explore, and discover.
                </p>
              </div>
              <button
                onClick={() => setStep(2)}
                className="mt-8 bg-accent hover:bg-accent-dark text-bg font-bold py-3 px-8 rounded-xl inline-flex items-center justify-center gap-3 shadow-lg shadow-accent/10 transition-all active:scale-95"
              >
                Let's get started <ArrowRight size={18} />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-surface p-10 rounded-3xl border border-white/5 shadow-2xl space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="font-display text-3xl text-ink">Choose My Persona</h2>
                <p className="text-ink-muted">How would you like me to assist you?</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setPersona('productivity')}
                  className={`p-6 rounded-2xl border text-left transition-all flex flex-col gap-4 ${
                    persona === 'productivity' 
                      ? 'bg-accent/10 border-accent text-accent' 
                      : 'bg-white/5 border-white/5 hover:border-white/20 text-ink-muted hover:text-ink'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${persona === 'productivity' ? 'bg-accent text-bg' : 'bg-white/10'}`}>
                    <Rocket size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1">Helpful Productivity Partner</h3>
                    <p className="text-xs opacity-80 leading-relaxed">Focused on logistics, events, and getting things done. I'll highlight upcoming deadlines and structural connections.</p>
                  </div>
                </button>

                <button
                  onClick={() => setPersona('creative')}
                  className={`p-6 rounded-2xl border text-left transition-all flex flex-col gap-4 ${
                    persona === 'creative' 
                      ? 'bg-purple-500/10 border-purple-500 text-purple-400' 
                      : 'bg-white/5 border-white/5 hover:border-white/20 text-ink-muted hover:text-ink'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${persona === 'creative' ? 'bg-purple-500 text-white' : 'bg-white/10'}`}>
                    <Palette size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1">Inspirational Creative Muse</h3>
                    <p className="text-xs opacity-80 leading-relaxed">Focused on passion and serendipity. I'll surface obscure connections, hobbies, and random inspirations.</p>
                  </div>
                </button>
              </div>

              <div className="flex justify-between items-center pt-6 border-t border-white/5">
                <button onClick={() => setStep(1)} className="text-ink-muted hover:text-ink px-4 py-2">Back</button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!persona}
                  className="bg-ink text-bg font-bold py-2 px-6 rounded-xl inline-flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-surface p-10 rounded-3xl border border-white/5 shadow-2xl space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-accent">
                  <Brain size={32} className={loadingInsights ? "animate-pulse" : ""} />
                </div>
                <h2 className="font-display text-3xl text-ink">
                  {loadingInsights ? 'Analyzing Your Brain...' : 'I found some things.'}
                </h2>
                <p className="text-ink-muted text-sm">
                  {loadingInsights 
                    ? 'Running initial embedding sweeps and discovering connections...' 
                    : 'Here is a glimpse of what I can surface from your data.'}
                </p>
              </div>

              <div className="min-h-[150px] flex flex-col justify-center gap-4">
                {loadingInsights ? (
                   <div className="space-y-3">
                      <div className="h-12 bg-white/5 rounded-xl animate-pulse" />
                      <div className="h-12 bg-white/5 rounded-xl animate-pulse delay-75" />
                   </div>
                ) : insights.length > 0 ? (
                  <div className="space-y-3">
                    {insights.slice(0, 2).map((insight, idx) => (
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.2 }}
                        key={idx}
                        className="bg-accent/5 border border-accent/20 p-4 rounded-xl flex items-start gap-4"
                      >
                        <Sparkles size={20} className="text-accent shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-sm text-ink">{insight.title}</h4>
                          <p className="text-xs text-ink-muted mt-1">{insight.description}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-ink-muted">
                    <CheckCircle2 size={32} className="mx-auto text-green-500 mb-2" />
                    <p>Database indexed and ready.</p>
                  </div>
                )}
              </div>

              <div className="flex justify-center pt-6 border-t border-white/5">
                <button
                  onClick={handleComplete}
                  className="bg-accent hover:bg-accent-dark text-bg font-bold py-3 px-12 rounded-xl inline-flex items-center gap-3 shadow-lg shadow-accent/10 transition-all active:scale-95 w-full justify-center"
                >
                  Enter My Memex <ArrowRight size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
