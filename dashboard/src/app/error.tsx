'use client'

import { Button } from '@/components/ui/button'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center max-w-md">
        <p className="text-5xl mb-4">⚠️</p>
        <h2 className="text-xl font-semibold mb-2">Algo salió mal</h2>
        <p className="text-text-muted text-sm mb-6">
          {error.message || 'Error al cargar los datos. Verifica que el Hub esté corriendo.'}
        </p>
        <Button onClick={reset}>Reintentar</Button>
      </div>
    </div>
  )
}
