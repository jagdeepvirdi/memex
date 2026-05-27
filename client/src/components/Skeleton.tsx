import { motion } from 'framer-motion'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <motion.div
      initial={{ opacity: 0.3 }}
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      className={`bg-white/5 rounded-lg ${className}`}
      {...props}
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="bg-surface/30 border border-white/5 p-6 rounded-xl space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Skeleton className="h-7 w-3/4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-6 w-12 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  )
}
