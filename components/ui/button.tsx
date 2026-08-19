import * as React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<Variant, string> = {
  primary:   'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
  ghost:     'text-slate-600 hover:bg-slate-100',
  danger:    'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  success:   'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
}

const SIZES: Record<Size, string> = {
  sm:   'h-8 px-3 text-sm gap-1.5',
  md:   'h-10 px-4 text-sm gap-2',
  lg:   'h-11 px-5 text-base gap-2',
  icon: 'h-9 w-9 justify-center',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-lg font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
