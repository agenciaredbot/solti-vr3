# Solti VR3 — Deployment Log

> Registro de despliegue, configuraciones, fixes y pruebas realizadas.
> Fecha de inicio: 2026-03-17

---

## 1. Infraestructura Desplegada

| Servicio | Plataforma | URL |
|----------|-----------|-----|
| **Hub (API)** | Railway | `https://solti-vr3-production.up.railway.app` |
| **Dashboard** | Vercel | `https://dashboard-nine-iota-21.vercel.app` |
| **Base de Datos** | Supabase (PostgreSQL) | `db.akbmuieaxehylenorags.supabase.co` |
| **Redis** | Railway (deshabilitado temp.) | — |
| **Auth** | Supabase Auth | ECC P-256 JWT |

### Conexion a BD (resuelto)
- Puerto 5432 (directo): **bloqueado desde Railway** — Supabase no permite conexiones directas desde IPs externas
- Puerto 6543 (pooler `db.*`): **tambien bloqueado**
- **Solucion**: Activar IPv4 Shared Pooler en Supabase → usa `aws-1-us-east-1.pooler.supabase.com:6543`
- `DATABASE_URL` final: `postgresql://postgres.akbmuieaxehylenorags:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
- `DIRECT_URL`: `postgresql://postgres:[PASSWORD]@db.akbmuieaxehylenorags.supabase.co:5432/postgres` (solo para migraciones locales)

---

## 2. Variables de Entorno (Railway)

### Requeridas (Hub core)
| Variable | Configurada | Notas |
|----------|-------------|-------|
| `DATABASE_URL` | ✅ | IPv4 pooler + pgbouncer=true |
| `DIRECT_URL` | ✅ | Puerto 5432 directo |
| `SUPABASE_URL` | ✅ | `https://akbmuieaxehylenorags.supabase.co` |
| `SUPABASE_ANON_KEY` | ✅ | Clave publica |
| `SUPABASE_SERVICE_KEY` | ✅ | Clave de servicio |
| `VAULT_MASTER_KEY` | ✅ | AES-256-GCM para credenciales |
| `NODE_ENV` | ✅ | `production` |
| `PORT` | ✅ | `4000` |
| `LOG_LEVEL` | ✅ | `info` |

### Servicios Externos
| Variable | Configurada | Servicio |
|----------|-------------|----------|
| `PLATFORM_APIFY_KEY` | ✅ | Scraping Google Maps, LinkedIn, Instagram |
| `PLATFORM_BREVO_KEY` | ✅ | Email marketing (Brevo/Sendinblue) |
| `EVOLUTION_API_URL` | ✅ | WhatsApp API base URL |
| `EVOLUTION_API_KEY` | ✅ | WhatsApp API authentication |
| `PLATFORM_GETLATE_KEY` | ✅ | Social media scheduling |
| `ANTHROPIC_API_KEY` | ✅ | Claude AI auto-reply |
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot @solti_agent_bot |
| `TELEGRAM_WEBHOOK_SECRET` | ✅ | Webhook signature validation |
| `DASHBOARD_URL` | ✅ | Redirect URL para Stripe |

### Pendientes
| Variable | Estado | Notas |
|----------|--------|-------|
| `STRIPE_SECRET_KEY` | ⏸️ Pendiente | Para cuando se activen pagos |
| `STRIPE_WEBHOOK_SECRET` | ⏸️ Pendiente | Firma de webhooks |
| `STRIPE_PRICE_PRO` | ⏸️ Pendiente | Price ID del plan Pro |
| `STRIPE_PRICE_GROWTH` | ⏸️ Pendiente | Price ID del plan Growth |
| `REDIS_URL` | ⏸️ Deshabilitado | BullMQ workers deshabilitados temporalmente |

### Variables Dashboard (Vercel)
| Variable | Configurada |
|----------|-------------|
| `NEXT_PUBLIC_HUB_URL` | ✅ `https://solti-vr3-production.up.railway.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ |
| `SOLTI_API_KEY` | ✅ |

---

## 3. Cuenta Admin

| Campo | Valor |
|-------|-------|
| Email | `agencia@theredbot.com` |
| User ID | `df479c38-b2f0-425e-ab63-9a565beda70f` |
| Tenant ID | `ad6eaea7-95fe-444d-8a17-9954a27a8e52` |
| Tenant Name | RedBot Agency |
| Tenant Slug | `redbot` |
| Plan | `full_access` (999,999 creditos) |
| Role | `owner` |
| API Key | `sk_solti_d8b50141c2be30446f32abaa664da6caeda75dc71b602b50` |

---

## 4. Fixes de Seguridad Aplicados (2026-03-17)

| # | Fix | Severidad | Commit |
|---|-----|-----------|--------|
| 1 | `full_access` removido del signup publico | 🔴 Critico | `fb089b3` |
| 2 | XSS `dangerouslySetInnerHTML` → texto plano seguro | 🔴 Critico | `fb089b3` |
| 3 | Open redirects bloqueados (login + callback) | 🟡 Alto | `fb089b3` |
| 4 | `.gitignore` protege archivos `.env` | 🟡 Alto | `fb089b3` |
| 5 | JWT verificacion via JWKS (ECC P-256) | 🔴 Critico | `71be472` |
| 6 | Stripe webhook requiere firma en produccion | 🟡 Alto | `fb089b3` |
| 7 | Error messages sanitizados (no exponen internals) | 🟡 Alto | `fb089b3` |

---

## 5. Pruebas de Servicios

### ✅ Apify (Google Maps Scraping)
- **Fecha**: 2026-03-18
- **Test**: Buscar 15 inmobiliarias en Cartago, Valle del Cauca
- **Actor**: `compass~crawler-google-places`
- **Run ID**: `N6TeMXylDN2ruWziu`
- **Dataset ID**: `ovHOzpfl5hnk46IK3`
- **Resultado**: 15/15 leads encontrados y scrapeados
- **Datos obtenidos**: nombre, telefono, website, direccion, rating, reviews, categoria
- **Importados al CRM**: ✅ 15/15 contactos creados exitosamente
- **Costo**: ~$0.06 USD (15 places × $0.004/place)

### ⏳ Brevo (Email Marketing)
- Pendiente de prueba

### ⏳ Evolution API (WhatsApp)
- Conexion verificada: ✅ instancia `redbot-romero-bienes` activa
- Pendiente enviar mensaje de prueba

### ⏳ Telegram Bot
- Conexion verificada: ✅ bot @solti_agent_bot respondiendo
- Pendiente enviar notificacion de prueba

### ⏳ GetLate (Redes Sociales)
- API key configurada
- Pendiente prueba de publicacion

### ⏳ Stripe (Pagos)
- Pendiente configuracion completa

---

## 6. Bugs Encontrados y Resueltos

### BUG-001: Dashboard muestra "Hub: Desconectado"
- **Causa**: Sidebar hacia health check via `/api/hub/analytics/dashboard` (requiere auth)
- **Fix**: Nuevo proxy `/api/hub-health` → Hub `/health` (sin auth)
- **Commit**: `ab14bf5`

### BUG-002: Hub no conecta a Supabase desde Railway
- **Causa**: Supabase bloquea conexiones directas (puerto 5432) desde IPs externas de Railway
- **Fix**: Activar IPv4 Shared Pooler → `aws-1-us-east-1.pooler.supabase.com:6543` con `?pgbouncer=true`
- **Status**: Resuelto

### BUG-003: Todos los endpoints del Hub retornan 500
- **Causa**: Mismo que BUG-002 — Prisma no podia conectar a la BD
- **Fix**: Cambiar DATABASE_URL al pooler IPv4
- **Status**: Resuelto

---

## 7. Supabase Auth Config
- Email provider: habilitado
- Confirm email: deshabilitado (para desarrollo)
- Google OAuth: habilitado (pendiente config)
- JWT signing: ECC P-256 (key ID: `ae3b4615-9d7b-4343-8294-fe49bedf5c02`)
- Site URL: `https://dashboard-nine-iota-21.vercel.app`

---

## 8. Proximos Pasos

1. [ ] Probar Brevo — enviar email de prueba
2. [ ] Probar Evolution — enviar WhatsApp de prueba
3. [ ] Probar Telegram — enviar notificacion de prueba
4. [ ] Probar GetLate — publicar contenido de prueba
5. [ ] Configurar Stripe — crear productos y price IDs
6. [ ] Configurar dominio propio en Vercel
7. [ ] Re-habilitar Redis para BullMQ workers
8. [ ] Activar confirmacion de email para usuarios reales
