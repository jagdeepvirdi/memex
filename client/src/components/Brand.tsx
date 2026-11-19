import type { CSSProperties } from 'react'
import { useResolvedTheme } from '../lib/theme'

interface BrandMarkProps {
  size?: number
  className?: string
}

export function BrandMark({ size = 32, className }: BrandMarkProps) {
  const theme = useResolvedTheme()
  const style: CSSProperties = { width: size, height: size }

  return (
    <img
      src={theme === 'light' ? '/brand/memex-mark-light.svg' : '/brand/memex-mark.svg'}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={className}
      style={style}
    />
  )
}

interface BrandLockupProps extends BrandMarkProps {
  wordmarkClassName?: string
}

export function BrandLockup({ size = 32, className, wordmarkClassName }: BrandLockupProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ''}`}>
      <BrandMark size={size} />
      <span className={`font-body font-semibold tracking-tight text-ink ${wordmarkClassName ?? ''}`}>Memex</span>
    </span>
  )
}
