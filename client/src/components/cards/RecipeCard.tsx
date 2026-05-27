import type { Item, RecipeData } from '@shared/types'
import { CardBase, CardTitle, CardFooter, TypeBadge, Muted } from './CardBase'

interface Props {
  item: Item
  onClick?: () => void
}

export default function RecipeCard({ item, onClick }: Props) {
  const s = item.structured as Partial<RecipeData>
  const ingredients = s.ingredients ?? []
  const steps = s.steps ?? []

  return (
    <CardBase onClick={onClick}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type="recipe" label={s.mealType ?? 'Recipe'} />
        <div className="flex items-center gap-2">
          {s.cookTime && <Muted>🕐 {s.cookTime}</Muted>}
          {s.servings && <Muted>👤 {s.servings}</Muted>}
        </div>
      </div>

      {/* Title */}
      <CardTitle>{item.title}</CardTitle>

      {/* Cuisine badge + ingredient preview */}
      <div className="flex flex-col gap-1.5">
        {s.cuisine && (
          <span
            className="self-start font-body text-xs px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(232,180,160,0.12)',
              color: '#E8B4A0',
              border: '1px solid rgba(232,180,160,0.2)',
            }}
          >
            {s.cuisine}
          </span>
        )}
        {ingredients.length > 0 && (
          <Muted>
            {ingredients.slice(0, 3).join(' · ')}
            {ingredients.length > 3 && ` +${ingredients.length - 3} more`}
          </Muted>
        )}
        {steps.length > 0 && (
          <Muted>{steps.length} step{steps.length !== 1 ? 's' : ''}</Muted>
        )}
      </div>

      {/* Prep time row */}
      {s.prepTime && (
        <Muted>Prep {s.prepTime}</Muted>
      )}

      <CardFooter tags={item.tags} />
    </CardBase>
  )
}
