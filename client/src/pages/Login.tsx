import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Mail, Lock, Sparkles, UserPlus, Brain, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [aiStatus, setAiStatus] = useState<'checking' | 'ready' | 'missing_models' | 'offline'>('checking');
  
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (isSetup) {
      checkAI();
    }
  }, [isSetup]);

  const checkAI = async () => {
    setAiStatus('checking');
    try {
      // We check native Ollama via the proxy health check
      const res = await apiFetch<any>('/health/ollama');
      if (res.status === 'ok') {
        setAiStatus('ready');
      } else {
        setAiStatus('offline');
      }
    } catch {
      setAiStatus('offline');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      const endpoint = isSetup ? '/auth/setup' : '/auth/login';
      const data = await apiFetch<any>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      login(data.user, data.token);
      toast.success(isSetup ? 'Account created' : 'Welcome back');
      navigate(isSetup ? '/welcome' : '/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />

      <div className="w-full max-w-md space-y-12 relative z-10">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-bg font-bold text-3xl mx-auto shadow-2xl shadow-accent/20">
            M
          </div>
          <div>
            <h1 className="font-display text-4xl text-ink">Memex</h1>
            <p className="text-ink-muted text-sm mt-2 uppercase tracking-widest font-mono">Personal Knowledge OS</p>
          </div>
        </div>

        <div className="bg-surface p-8 rounded-2xl border border-white/5 shadow-2xl space-y-8">
          <div className="space-y-2">
            <h2 className="text-xl text-ink font-display">{isSetup ? 'Setup Workspace' : 'Sign In'}</h2>
            <p className="text-xs text-ink-muted">
              {isSetup 
                ? 'Create your single-user master account.' 
                : 'Enter your credentials to access your memex.'}
            </p>
          </div>

          {isSetup && (
             <div className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${
                aiStatus === 'ready' ? 'bg-green-500/5 border-green-500/10' :
                aiStatus === 'checking' ? 'bg-white/5 border-white/5' :
                'bg-red-500/5 border-red-500/10'
             }`}>
                <div className="shrink-0">
                   {aiStatus === 'ready' && <Check className="text-green-500" size={18} />}
                   {aiStatus === 'checking' && <Loader2 className="text-ink-muted animate-spin" size={18} />}
                   {aiStatus === 'offline' && <AlertCircle className="text-red-500" size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                   <p className="text-[10px] uppercase tracking-widest font-bold text-ink-muted mb-0.5">Local AI Verification</p>
                   <p className="text-xs text-ink truncate">
                      {aiStatus === 'ready' ? 'Ollama connection successful' : 
                       aiStatus === 'checking' ? 'Testing local intelligence engine...' :
                       'Ollama offline or models missing'}
                   </p>
                </div>
                {aiStatus === 'offline' && (
                  <button onClick={checkAI} className="p-1.5 hover:bg-white/5 rounded text-ink-muted"><Sparkles size={14}/></button>
                )}
             </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted group-focus-within:text-accent transition-colors" size={18} />
                <input
                  type="email"
                  placeholder="Email Address"
                  className="w-full bg-bg border border-white/10 rounded-xl py-3 pl-10 pr-4 text-ink outline-none focus:border-accent/50 transition-all placeholder:text-ink-muted/30"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted group-focus-within:text-accent transition-colors" size={18} />
                <input
                  type="password"
                  placeholder="Password"
                  className="w-full bg-bg border border-white/10 rounded-xl py-3 pl-10 pr-4 text-ink outline-none focus:border-accent/50 transition-all placeholder:text-ink-muted/30"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || (isSetup && aiStatus !== 'ready')}
              className="w-full bg-accent hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed text-bg font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-accent/10 transition-all active:scale-95"
            >
              {loading ? <Loader2 className="animate-spin" /> : (
                <>
                  {isSetup ? <UserPlus size={18} /> : <Sparkles size={18} />}
                  {isSetup ? 'Initialize Memex' : 'Enter Workspace'}
                </>
              )}
            </button>
          </form>

          <div className="pt-6 border-t border-white/5 text-center">
            <button 
              onClick={() => setIsSetup(!isSetup)}
              className="text-[10px] text-ink-muted hover:text-accent uppercase tracking-widest transition-colors"
            >
              {isSetup ? 'Already have an account? Login' : 'Is this a new installation? Setup here'}
            </button>
          </div>
        </div>

        {isSetup && aiStatus === 'offline' && (
           <div className="bg-white/5 border border-white/5 p-4 rounded-xl space-y-2 animate-in slide-in-from-bottom-4">
              <p className="text-xs text-ink font-medium flex items-center gap-2"><Brain size={14} className="text-accent" /> How to fix AI offline:</p>
              <ol className="text-[10px] text-ink-muted space-y-1 list-decimal list-inside px-1">
                 <li>Ensure Ollama is running natively.</li>
                 <li>Run: <code className="bg-bg px-1 rounded">ollama pull llama3.2</code></li>
                 <li>Run: <code className="bg-bg px-1 rounded">ollama pull nomic-embed-text</code></li>
              </ol>
           </div>
        )}

        <p className="text-[10px] text-ink-muted text-center max-w-[300px] mx-auto leading-relaxed">
          Memex is private and local. Your credentials never leave your machine unless you've configured cloud synchronization.
        </p>
      </div>
    </div>
  );
}
