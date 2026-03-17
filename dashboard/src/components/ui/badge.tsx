interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary'
  className?: string
}

const variants = {
  default: 'bg-surface-lighter text-text-muted',
  success: 'bg-accent-green/15 text-accent-green',
  warning: 'bg-accent-yellow/15 text-accent-yellow',
  danger: 'bg-red-500/15 text-red-400',
  info: 'bg-accent-blue/15 text-accent-blue',
  primary: 'bg-primary/15 text-primary',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}
