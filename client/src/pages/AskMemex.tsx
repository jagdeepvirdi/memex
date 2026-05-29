import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Loader2, Send, Brain, Bot, User, Sparkles, ExternalLink, Bookmark } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar from '../components/sidebar/Sidebar'
import { askKnowledge } from '../lib/api'
import type { Item } from '../../../shared/types'

interface Message {
  id: string
  type: 'user' | 'ai'
  content: string
  sources?: Item[]
}

export default function AskMemexPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const handleAsk = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await askKnowledge(userMessage.content)
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: res.answer,
        sources: res.sources
      }
      setMessages(prev => [...prev, aiMessage])
    } catch (err) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: "I'm sorry, I encountered an error while searching your knowledge. Please make sure Ollama is running."
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex text-ink">
      <Sidebar activeSection="dashboard" />
      
      <main className="flex-1 flex flex-col relative max-w-4xl mx-auto w-full border-x border-white/5">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-bg/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/')} className="text-ink-muted hover:text-ink transition-colors">
              <ArrowLeft size={20} />
            </button>
            <h1 className="font-display text-lg flex items-center gap-2">
              <Brain size={20} className="text-accent" />
              Ask My Knowledge
            </h1>
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-ink-muted bg-white/5 px-2 py-1 rounded">
             <Sparkles size={10} className="text-accent" />
             Local RAG Mode
          </div>
        </header>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 custom-scrollbar">
          {messages.length === 0 && (
             <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 animate-in fade-in duration-700">
                <div className="w-16 h-16 bg-accent/10 rounded-3xl flex items-center justify-center text-accent">
                   <Bot size={32} />
                </div>
                <div className="space-y-2">
                   <h2 className="font-display text-2xl text-ink">Hello, I'm Memex.</h2>
                   <p className="text-ink-muted max-w-sm mx-auto text-sm leading-relaxed">
                      Ask me anything about your saved notes, recipes, movies, or research. 
                      I'll synthesize an answer using your data.
                   </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mt-4">
                   {[
                     "What are my top Thai restaurant recommendations?",
                     "Summarize my recent research on AI agents.",
                     "Do I have any notes about baking sourdough?",
                     "Who are the directors of the movies I've saved?"
                   ].map(suggestion => (
                     <button 
                       key={suggestion}
                       onClick={() => { setInput(suggestion); setTimeout(() => handleAsk(), 0); }}
                       className="p-4 bg-white/5 border border-white/5 rounded-2xl text-xs text-ink-muted hover:text-accent hover:border-accent/30 transition-all text-left"
                     >
                       {suggestion}
                     </button>
                   ))}
                </div>
             </div>
          )}

          {messages.map(msg => (
            <motion.div 
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-4 ${msg.type === 'user' ? 'justify-end' : ''}`}
            >
              {msg.type === 'ai' && (
                <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent shrink-0">
                  <Bot size={18} />
                </div>
              )}
              
              <div className={`max-w-[80%] space-y-4`}>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.type === 'user' 
                    ? 'bg-accent text-bg font-medium' 
                    : 'bg-white/5 border border-white/10 text-ink'
                }`}>
                   <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-ink-muted flex items-center gap-2">
                      <Bookmark size={10} /> Sources Found
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.slice(0, 4).map((source, i) => (
                        <button 
                          key={source.id}
                          onClick={() => navigate(`/item/${source.id}`)}
                          className="flex items-center gap-2 bg-white/5 border border-white/10 hover:border-accent/30 px-3 py-1.5 rounded-lg text-[11px] text-ink-muted hover:text-accent transition-all group"
                        >
                          <span className="opacity-50">[{i+1}]</span>
                          <span className="truncate max-w-[150px]">{source.title}</span>
                          <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {msg.type === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-ink-muted shrink-0">
                  <User size={18} />
                </div>
              )}
            </motion.div>
          ))}

          {loading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-4"
            >
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent shrink-0">
                <Bot size={18} />
              </div>
              <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-3">
                <Loader2 size={16} className="animate-spin text-accent" />
                <span className="text-xs text-ink-muted animate-pulse">Consulting your library...</span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-8 pt-0 shrink-0 bg-bg/80 backdrop-blur-md">
          <form 
            onSubmit={handleAsk}
            className="relative flex items-center gap-2 bg-surface p-2 pr-3 rounded-2xl border border-white/10 focus-within:border-accent/50 transition-all shadow-xl shadow-black/20"
          >
            <input 
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything about your data..."
              className="flex-1 bg-transparent border-none outline-none py-3 px-4 text-sm text-ink placeholder:text-ink-muted/30"
              disabled={loading}
            />
            <button 
              type="submit"
              disabled={!input.trim() || loading}
              className="w-10 h-10 bg-accent hover:bg-accent-dark disabled:opacity-30 disabled:hover:bg-accent rounded-xl flex items-center justify-center text-bg shadow-lg transition-all active:scale-95"
            >
              <Send size={18} />
            </button>
          </form>
          <p className="text-[9px] text-center text-ink-muted mt-4 uppercase tracking-tighter opacity-50">
            Synthesized answer using local Ollama. Citations refer to your actual notes.
          </p>
        </div>
      </main>
    </div>
  )
}
