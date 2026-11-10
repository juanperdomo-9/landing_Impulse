# Configurar Impulsa Studio para vender

Sigue estos pasos en orden. Necesitas tres cuentas gratuitas: **Supabase** (usuarios y datos),
**Mercado Pago** (cobros) y **Vercel** (donde está publicada la web). Al final, todo se pega como
variables en Vercel.

Mientras no completes la parte de Supabase, la web funciona en "modo abierto": cualquiera abre el editor
y el asistente IA queda desactivado (para que nadie gaste tu saldo de Claude).

---

## 1. Supabase — cuentas con código al mail

1. Entra en <https://supabase.com>, crea una cuenta y pulsa **New project**.
   Ponle un nombre (ej. `impulsa`), una contraseña de base de datos (guárdala) y la región **South America (São Paulo)**.
2. Cuando termine de crearse, ve a **SQL Editor → New query**, pega todo el contenido del archivo
   [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**. Debe decir "Success". (Se puede volver a
   ejecutar sin problema cuando el archivo se actualice: por ejemplo, para agregar la tabla del kit de marca.)
3. **Mail de acceso.** Sin configurar nada, Supabase manda un mail con un **enlace** ("Sign in") y la web ya
   funciona con ese enlace. Si además quieres que llegue un **código de 6 dígitos**, primero configura un correo
   propio (paso 5); recién entonces Supabase deja editar **Authentication → Emails → Magic Link** y
   **Confirm signup**. Agrega al mensaje la línea `<p style="font-size:28px;font-weight:bold">{{ .Token }}</p>`.
4. Ve a **Authentication → URL Configuration**:
   - **Site URL:** la dirección de tu web (ej. `https://impulsa-studiodigital.vercel.app`).
   - **Redirect URLs → Add URL:** `https://impulsa-studiodigital.vercel.app/**` (con tu dirección).
5. **Importante para vender:** el servidor de correo incluido en Supabase solo envía unos pocos mails por hora.
   Para clientes reales configura un correo propio en **Authentication → Emails → SMTP Settings**.
   Una opción gratuita es [Resend](https://resend.com) (3.000 mails/mes): crea una cuenta, verifica tu dominio y
   copia sus datos SMTP en Supabase.
6. Ve a **Project Settings → API Keys** (o **API**) y copia:
   - **Project URL** → variable `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable key** → variable `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret key** → variable `SUPABASE_SERVICE_ROLE_KEY` (¡no la compartas con nadie!)

## 2. Mercado Pago — suscripción mensual

1. Entra en <https://www.mercadopago.com.ar/developers> con tu cuenta de Mercado Pago (la que recibirá el dinero).
2. **Tus integraciones → Crear aplicación**. Nombre: `Impulsa Studio`. Producto: **Suscripciones**.
3. En la aplicación, ve a **Credenciales de producción** y copia el **Access Token** → variable `MP_ACCESS_TOKEN`.
   (Puede que te pida completar datos de tu negocio para activar las credenciales de producción.)
4. Ve a **Webhooks → Configurar notificaciones**:
   - **URL de producción:** `https://TU-WEB/api/mp/webhook` (ej. `https://impulsa-studiodigital.vercel.app/api/mp/webhook`)
   - **Eventos:** marca **Planes y suscripciones**.
   - Guarda y copia la **clave secreta** → variable `MP_WEBHOOK_SECRET` (**obligatoria**: sin ella no se verifica que los avisos vengan de Mercado Pago; el panel `/admin` avisa si falta).

Para probar sin cobrar dinero real, Mercado Pago ofrece **credenciales y usuarios de prueba** en la misma sección.

## 3. Vercel — pegar las variables

En tu proyecto de Vercel: **Settings → Environment Variables**. Agrega cada una (Key = nombre, Value = valor):

| Variable | Qué poner |
|---|---|
| `ANTHROPIC_API_KEY` | Tu clave de Claude (`sk-ant-…`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Paso 1.6 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Paso 1.6 |
| `SUPABASE_SERVICE_ROLE_KEY` | Paso 1.6 |
| `MP_ACCESS_TOKEN` | Paso 2.3 |
| `MP_WEBHOOK_SECRET` | Paso 2.4 |
| `PLAN_PRICE` | Precio mensual, solo el número (ej. `25000`) |
| `PLAN_CURRENCY` | `ARS` (u otra moneda de tu cuenta de Mercado Pago) |
| `AI_MONTHLY_LIMIT` | Instrucciones a la IA por cliente por mes (ej. `200`) |
| `TRIAL_DAYS` | Días de prueba gratis desde que se registran (por defecto `3`; `0` = sin prueba) |
| `TRIAL_AI_LIMIT` | Créditos de IA durante la prueba (por defecto `20`) |
| `ADMIN_EMAILS` | Tu mail (para entrar al panel `/admin`). Varios, separados por coma |
| `NEXT_PUBLIC_SITE_URL` | La dirección de tu web (ej. `https://impulsa-studiodigital.vercel.app`) |

Después ve a **Deployments → … → Redeploy** para que tome los cambios.

## 4. Probar

1. Abre tu web y pulsa **Ingresar**. Pon tu mail (el de `ADMIN_EMAILS`), recibe el código y entra.
2. Como administrador tienes acceso completo y verás **Panel de administración** en **Mi cuenta** (`/cuenta`).
3. En `/admin` ves todos los usuarios, quién paga, cuánto usó la IA este mes, y puedes **dar acceso a mano**
   a alguien que te pagó por transferencia o a quien quieras regalarle acceso.
4. Prueba una suscripción con otro mail (ideal con usuarios de prueba de Mercado Pago): al pagar, la cuenta se
   activa sola y, si el cliente cancela o deja de pagar, se desactiva sola.

## Cuánto cuesta mantenerla

- **Vercel, Supabase y Resend**: gratis en sus planes iniciales (alcanzan para empezar).
- **Claude (la IA)**: con el modelo Haiku, cada instrucción cuesta una fracción de centavo de dólar; con el
  límite de 200 instrucciones por cliente por mes, un cliente que use todo su límite te cuesta como máximo unos 2 dólares al mes (medio centavo a 1 centavo por instrucción).
- **Mercado Pago**: cobra su comisión habitual por cada pago recibido.
