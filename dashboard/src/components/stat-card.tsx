interface StatCardProps {
  label: string
  value: string | number
  icon: string
  trend?: string
  trendColor?: string
}

export function StatCard({ label, value, icon, trend, trendColor = 'text-accent-green' }: StatCardProps) {
  return (
    <div className="bg-surface-light border border-border rounded-xl p-6 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-text-muted text-sm">{label}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
          {trend && (
            <p className={`text-sm mt-1 ${trendColor}`}>{trend}</p>
          )}
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  )
}
