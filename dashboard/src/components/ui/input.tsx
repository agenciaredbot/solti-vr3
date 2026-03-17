interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-text-muted mb-1">{label}</label>}
      <input
        className={`
          w-full bg-surface border border-border rounded-lg px-4 py-2 text-sm text-text
          placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20
          transition-colors ${error ? 'border-red-500' : ''} ${className}
        `}
        {...props}
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

export function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-text-muted mb-1">{label}</label>}
      <select
        className={`
          w-full bg-surface border border-border rounded-lg px-4 py-2 text-sm text-text
          focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20
          transition-colors ${className}
        `}
        {...props}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({ label, className = '', ...props }: TextareaProps) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-text-muted mb-1">{label}</label>}
      <textarea
        className={`
          w-full bg-surface border border-border rounded-lg px-4 py-2 text-sm text-text
          placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20
          transition-colors resize-none ${className}
        `}
        {...props}
      />
    </div>
  )
}
