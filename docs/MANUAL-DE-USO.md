# Solti VR3 — Manual de Uso y Pruebas

## Entendiendo las 3 Capas

```
                    TU (Usuario)
                    /          \
                   v            v
        ┌──────────────┐  ┌──────────────┐
        │   PLUGIN     │  │  DASHBOARD   │
        │ (Claude Code)│  │   (Web App)  │
        │              │  │              │
        │ Hablas con   │  │ Ves datos,   │
        │ lenguaje     │  │ lanzas       │
        │ natural      │  │ acciones     │
        └──────┬───────┘  └──────┬───────┘
               │                 │
               │   MCP (tools)   │  REST API
               │                 │
               v                 v
        ┌─────────────────────────────┐
        │          HUB (Backend)       │
        │                              │
        │  Base de datos (PostgreSQL)  │
        │  APIs externas (Apify, etc)  │
        │  Credenciales encriptadas    │
        │  Jobs en background          │
        │  Webhooks                    │
        └─────────────────────────────┘
```

### Lo importante: Plugin y Dashboard son DOS PUERTAS al mismo Hub

- **Plugin** = Controlas todo con lenguaje natural ("busca 100 inmobiliarias en Bogota")
- **Dashboard** = Controlas todo con clicks (formularios, botones, tablas)
- **Hub** = Es el motor. Ambos hablan con el Hub. Los datos son los mismos.

**NO necesitas usar el Plugin para que funcione el Dashboard, ni viceversa.**
Son canales independientes al mismo backend.

---

## Flujo de Configuracion Inicial (Una sola vez)

### Paso 1: Cuenta de Supabase (YA HECHO)
- Usuario: agencia@theredbot.com
- Esto te da acceso al Dashboard y autenticacion JWT para el Hub

### Paso 2: Tenant y Creditos (YA HECHO)
- Tenant: "RedBot Agency" con plan full_access (999,999 creditos)
- API Key del Hub: sk_solti_d8b50141c2be30446f32abaa664da6caeda75dc71b602b50

### Paso 3: Configurar credenciales de servicios externos
Esto se hace desde **cualquiera** de los dos canales:

**Via Dashboard** (mas facil):
1. Ir a /settings
2. Agregar API keys: Apify, Brevo, Evolution, getLate, etc.
3. Las keys se encriptan y guardan en el Hub

**Via Plugin** (alternativa):
1. Ejecutar `/connect`
2. El wizard te pide las keys una por una

### Paso 4: Configurar contexto de negocio (Solo Plugin)
Esto SI es exclusivo del Plugin porque son archivos de texto que Claude lee:
1. `context/my-business.md` — Info de tu empresa
2. `context/my-voice.md` — Tu tono de comunicacion
3. `context/my-icp.md` — Tu cliente ideal
4. `context/my-offer.md` — Tu propuesta de valor

El Dashboard NO necesita estos archivos. Son para que Claude (Plugin) sepa COMO escribir emails, COMO calificar leads, etc.

---

## Que puedes hacer desde CADA canal

### Desde el Dashboard (Web)

| Accion | Pagina | Estado |
|--------|--------|--------|
| Ver contactos/leads | /contacts | Funcional |
| Buscar prospectos (scraping) | /scraping | NUEVO - Funcional |
| Ver campanas de email | /campaigns | Funcional |
| Gestionar WhatsApp | /whatsapp | Funcional |
| Publicar en redes | /social | Funcional |
| Ver analytics | /analytics | Funcional |
| Configurar API keys | /settings | Funcional |
| Gestionar facturacion | /billing | Funcional |
| Gestionar listas | /lists | Funcional |

### Desde el Plugin (Claude Code)

| Accion | Comando | Descripcion |
|--------|---------|-------------|
| Buscar prospectos | `/prospect` | Scraping + enriquecimiento + scoring + importacion |
| Enviar outreach | `/outreach` | Secuencias de email, DM, WhatsApp |
| Publicar contenido | `/publish` | Crear y programar posts |
| Lanzar campana | `/deploy` | Pre-flight checks + lanzamiento |
| Gestionar WhatsApp | `/whatsapp` | Crear instancias, configurar |
| Ver CRM | `/crm` | Buscar, crear, actualizar contactos |
| Conectar servicios | `/connect` | Configurar API keys |
| Estrategia | `/strategy` | Planificacion de crecimiento |
| Auditoria | `/audit` | Revision de salud del sistema |
| Reporte semanal | `/retro` | Metricas y tendencias |
| Pipeline completo | `/pipeline` | Prospect -> Outreach -> Nurture automatico |

### Ventajas de cada canal

**Dashboard es mejor para:**
- Ver datos de un vistazo (tablas, graficos)
- Acciones puntuales con clicks (lanzar un scraping, ver resultados)
- Usuarios no-tecnicos
- Monitoreo visual

**Plugin es mejor para:**
- Tareas complejas ("busca leads, enriquecelos, califica contra mi ICP, y crea una secuencia de emails")
- Automatizacion encadenada (pipeline completo)
- Personalizacion con contexto de negocio (usa my-voice.md, my-icp.md)
- Cuando necesitas que la IA tome decisiones

---

## Como hacer pruebas

### Prueba 1: Scraping desde Dashboard (MAS RAPIDO)

1. Ir a https://dashboard-nine-iota-21.vercel.app/scraping
2. Login con agencia@theredbot.com
3. Seleccionar "Google Maps"
4. Busqueda: "Inmobiliarias en Villavicencio"
5. Ubicacion: "Villavicencio Colombia"
6. Max resultados: 20 (para prueba rapida)
7. Verificar que muestra el costo estimado (5 creditos)
8. Click "Iniciar Busqueda"
9. Esperar ~1-3 minutos (la barra de progreso avanza)
10. Ver resultados en tabla
11. Seleccionar los que quieras importar
12. Click "Importar"
13. Ir a /contacts para ver los nuevos contactos

**Requisito:** Que la API key de Apify este configurada en /settings

### Prueba 2: Scraping desde Plugin (MAS PODEROSO)

1. Abrir Claude Code en la carpeta solti-plugin/
2. Decir: "Busca 20 inmobiliarias en Villavicencio en Google Maps"
3. Claude ejecutara `/prospect` automaticamente
4. Te pedira confirmacion antes de gastar
5. Scrapeara, enriquecera, calificara contra tu ICP
6. Importara al CRM
7. Te dara un reporte completo

### Prueba 3: Verificar que ambos canales ven los mismos datos

1. Importa leads desde el Dashboard (/scraping)
2. Ve a /contacts — deberias ver los leads
3. Abre el Plugin y di "/crm buscar contactos"
4. Deberias ver los MISMOS leads (ambos usan la misma DB)

---

## Prerequisitos para que TODO funcione

| Que | Donde se configura | Estado actual |
|-----|-------------------|---------------|
| Cuenta Supabase | supabase.com | OK |
| Tenant + Creditos | Base de datos | OK (full_access) |
| Hub corriendo | Railway | OK |
| Dashboard corriendo | Vercel | OK |
| API Key de Apify | Dashboard /settings O Plugin /connect | VERIFICAR |
| API Key de Brevo | Dashboard /settings O Plugin /connect | Pendiente |
| Evolution API | Dashboard /settings O Plugin /connect | Pendiente |
| getLate API | Dashboard /settings O Plugin /connect | Pendiente |
| Contexto de negocio | Plugin context/*.md | Solo si usas Plugin |

### Lo PRIMERO que debes verificar:

**Tienes la API key de Apify configurada en el Hub?**

Puedes verificarlo asi:
- Dashboard: Ir a /settings → ver si Apify aparece como "configurado"
- O via curl:
```bash
curl https://solti-vr3-production.up.railway.app/api/v1/credentials \
  -H "X-Api-Key: sk_solti_d8b50141c2be30446f32abaa664da6caeda75dc71b602b50"
```

Si NO esta configurada, el scraping no funcionara ni desde Dashboard ni desde Plugin.

---

## Resumen ejecutivo

1. **Plugin y Dashboard son independientes** — No necesitas uno para usar el otro
2. **Ambos hablan con el mismo Hub** — Los datos son compartidos
3. **Las credenciales de APIs se configuran UNA vez** — Desde cualquier canal
4. **El contexto de negocio es solo para el Plugin** — El Dashboard no lo necesita
5. **Para probar scraping:** Solo necesitas Supabase login + API key de Apify configurada
