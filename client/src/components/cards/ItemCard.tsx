import type { Item } from '@shared/types'
import { Check } from 'lucide-react'
import RecipeCard from './RecipeCard'
import MediaCard from './MediaCard'
import BookCard from './BookCard'
import NoteCard from './NoteCard'
import LinkCard from './LinkCard'
import StockCard from './StockCard'
import SpecCard from './SpecCard'
import VaultCard from './VaultCard'
import { apiFetch } from '../../lib/api'
import { toast } from 'sonner'

interface Props {
  item: Item
  onClick?: () => void
  selectable?: boolean
  selected?: boolean
  onToggleSelection?: (id: string) => void
}

export default function ItemCard({ item, onClick, selectable, selected, onToggleSelection }: Props) {
  const handleReview = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await apiFetch(`/items/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ reviewed: true })
      })
      toast.success('Classification confirmed')
      // Note: In a real app we'd refresh the list or use a context/store update
      window.location.reload() 
    } catch (err) {
      toast.error('Failed to confirm')
    }
  }

  const renderCard = () => {
    switch (item.type) {
      case 'recipe':   return <RecipeCard  item={item} onClick={onClick} />
      case 'media':    return <MediaCard   item={item} onClick={onClick} />
      case 'book':     return <BookCard    item={item} onClick={onClick} />
      case 'link':     return <LinkCard    item={item} onClick={onClick} />
      case 'stock':    return <StockCard   item={item} onClick={onClick} />
      case 'spec':     return <SpecCard    item={item} onClick={onClick} />
      case 'note':
      default:         return <NoteCard    item={item} onClick={onClick} />
    }
  }

  return (
    <div className={`relative group transition-all ${selected ? 'ring-2 ring-accent ring-offset-4 ring-offset-bg rounded-xl' : ''}`}>
      {renderCard()}
      
      {selectable && (
        <div className="absolute top-2 right-2 z-10">
          <input 
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelection?.(item.id)}
            className="w-4 h-4 rounded bg-surface border-white/20 text-accent focus:ring-accent cursor-pointer transition-all accent-accent"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {!item.reviewed && item.id !== 'preview' && (
        <div className="absolute top-2 left-2 z-10">
           <button 
             onClick={handleReview}
             className="bg-accent/90 hover:bg-accent text-bg text-[9px] font-bold px-2 py-0.5 rounded shadow-lg flex items-center gap-1 animate-pulse hover:animate-none transition-all"
             title="AI classification needs review. Click to confirm."
           >
              <Check size={10} /> REVIEW
           </button>
        </div>
      )}
    </div>
  )
}
