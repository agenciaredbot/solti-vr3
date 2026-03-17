import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <p className="text-6xl font-bold text-text-muted/30 mb-4">404</p>
        <h2 className="text-xl font-semibold mb-2">Página no encontrada</h2>
        <p className="text-text-muted text-sm mb-6">
          La página que buscas no existe.
        </p>
        <Link href="/dashboard" className="text-primary hover:underline text-sm">
          Volver al Dashboard
        </Link>
      </div>
    </div>
  )
}
