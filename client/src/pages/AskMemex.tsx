import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Loader2, Send, Brain, Bot, User, ExternalLink, Bookmark, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar from '../components/sidebar/Sidebar'
import { AppHeader } from '../components/AppHeader'
import { askKnowledge } from '../lib/api'
import type { Item } from '../../../shared/types'

interface Message {
  id: string
  type: 'user' | 'ai'
  content: string
  sources?: Item[]
  /** The notes were found by keyword only (semantic search unavailable), so relevant ones may be missing. */
  keywordOnly?: boolean
  error?: boolean
  question?: string
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

  const submitQuestion = async (question: string) => {
    if (!question.trim() || loading) return
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: question.trim()
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
        sources: res.sources,
        keywordOnly: res.semantic === false,
        question: userMessage.content,
      }
      setMessages(prev => [...prev, aiMessage])
    } catch (err) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: "I'm sorry, I encountered an error while searching your knowledge. Please check that your AI provider is available (Settings › AI)."
      }
      errorMsg.error = true
      errorMsg.question = userMessage.content
      errorMsg.content = 'I couldn’t complete that search. Check your connection and AI provider settings, then retry.'
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleAsk = (e?: React.FormEvent) => {
    e?.preventDefault()
    const question = input.trim()
    if (!question || loading) return
    setInput('')
    void submitQuestion(question)
  }

  return (
    <div className="min-h-screen bg-bg flex text-ink">
      <Sidebar activeSection="ask" />
      
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col relative max-w-4xl mx-auto w-full border-x border-white/5">
        <AppHeader
          left={<div className="flex items-center gap-6"><button onClick={() => navigate('/')} className="text-ink-muted hover:text-ink transition-colors"><ArrowLeft size={20} /></button><h1 className="font-display text-lg flex items-center gap-2"><Brain size={20} className="text-accent" />Ask My Knowledge</h1></div>}
        />
        <AppHeader.Spacer />

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
                       onClick={() => { void submitQuestion(suggestion) }}
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
                <div role={msg.error ? 'alert' : undefined} className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.type === 'user' 
                    ? 'bg-accent text-bg font-medium' 
                    : 'bg-white/5 border border-white/10 text-ink'
                }`}>
                   <p className="whitespace-pre-wrap">{msg.content}</p>
                   {msg.error && msg.question && <button type="button" onClick={() => void submitQuestion(msg.question!)} disabled={loading} className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-accent hover:underline disabled:opacity-50"><RotateCcw size={13} />Retry question</button>}
                </div>

                {msg.keywordOnly && (
                  <p role="status" className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    These notes were found by keyword only: semantic search is unavailable right now, so relevant notes may be missing.
                    Check Settings › AI › Search &amp; embeddings.
                  </p>
                )}

                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-ink-muted flex items-center gap-2">
                      <Bookmark size={10} /> Sources ({msg.sources.length}) · open an item to read the original
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.map((source, i) => (
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
                {msg.sources && msg.sources.length === 0 && <p className="text-xs text-ink-muted">No matching notes were found for this question.</p>}
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
              role="status"
              aria-live="polite"
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
          <p className="text-[10px] text-center text-ink-muted mt-3">
            Answers use your configured AI provider; private notes may use local processing. This conversation stays in this page and isn’t saved.
          </p>
        </div>
      </main>
    </div>
  )
}
