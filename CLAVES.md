# Dónde vive cada clave

No hay ni puede haber un `.env` en este proyecto: es un sitio estático, sin
paso de compilación. El navegador no puede leer un `.env`, y si el archivo
estuviera en el repo, Vercel lo publicaría y quedaría descargable. Por eso
las claves se dividen en dos grupos según quién tiene que verlas.

---

## Grupo 1 — Públicas: `config.js`

Están en el navegador de cualquiera que abra la página. **Esto no es un
descuido**: es la única forma de que un sitio estático hable con Supabase.
Lo que protege los datos no es esconder estas claves, es **RLS**.

| Clave | Para qué | Se cambia en |
|---|---|---|
| `SUPABASE_URL` | A qué proyecto apunta | `config.js` |
| `SUPABASE_ANON` | Identifica al proyecto. No da permisos por sí sola | `config.js` |
| `VAPID_PUBLIC` | Identifica al emisor de las notificaciones | `config.js` |
| `IMG_BASE` | De dónde salen las fotos de los platos | `config.js` |
| `TABLE`, `PUSH_TABLE`, `COBROS_TABLE`, `BUCKET` | Nombres de tablas y bucket | `config.js` |

Para apuntar el sitio a otro local, **`config.js` es el único archivo que se
toca**.

---

## Grupo 2 — Secretas: secretos de la Edge Function

Nunca salen del servidor. **Jamás poner ninguna de estas en `config.js`, en
el HTML ni en el repo.**

| Secreto | Para qué | Se carga en |
|---|---|---|
| `VAPID_PRIVATE_KEY` | Firma las notificaciones push | Supabase → Edge Functions → Secrets |
| `VAPID_PUBLIC_KEY` | Par de la anterior, del lado del servidor | Supabase → Edge Functions → Secrets |
| `VAPID_SUBJECT` | Contacto del emisor (`mailto:...`) | Supabase → Edge Functions → Secrets |
| `SUPABASE_SERVICE_ROLE_KEY` | Salta RLS. La inyecta Supabase sola | Automático, no se toca |

Se cargan acá:
`https://supabase.com/dashboard/project/<id>/settings/functions`

### Sobre el par VAPID

`VAPID_PUBLIC` (en `config.js`) y `VAPID_PRIVATE_KEY` (secreto) son **un par**.
Si se rota una hay que rotar la otra, y **todos los dispositivos tienen que
volver a activar los avisos**: las suscripciones viejas quedan muertas.

Rotar es gratis mientras `la_positiva_push_subs` esté vacía. Después, no.

Para generar un par nuevo:

```bash
node scripts/generar-vapid.js
```

---

## Qué hacer si se filtra algo

- **Una clave del grupo 1:** no pasa nada, ya eran públicas. Lo que hay que
  revisar es que las políticas RLS sean correctas.
- **`VAPID_PRIVATE_KEY`:** generar un par nuevo, cargarlo como secreto,
  actualizar `config.js` y re-suscribir los dispositivos.
- **`SUPABASE_SERVICE_ROLE_KEY`:** grave. Rotarla desde el panel de Supabase
  de inmediato: esa clave saltea RLS por completo.

---

## Aviso sobre esta demo

Las políticas RLS de las tablas `la_positiva_*` son abiertas a propósito
(`demo_public_all`), y las seis vistas no tienen login. Sirve para mostrar el
sistema sin usuarios ni claves. **Antes de usarlo con plata de verdad hay que
cerrar las políticas y poner autenticación.**
