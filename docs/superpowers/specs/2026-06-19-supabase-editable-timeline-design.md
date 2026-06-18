# Diseño — Timeline de campaña editable (Supabase)

**Fecha:** 2026-06-19
**Estado:** Diseño aprobado verbalmente; pendiente de revisión escrita.
**Proyecto:** repo nuevo (limpio), provisionalmente `dndtimeline-editor`. **No** se toca el
repo actual `dndtimeline`.

---

## 1. Resumen

Evolucionar el visor estático de la cronología «Tierras perdidas, sueños encontrados»
para que, además de consultarse, se pueda **editar** desde el móvil u ordenador por un
grupo pequeño de confianza (los compañeros de campaña), sin montar ni mantener un backend
propio.

Es un **singleton**: una única cronología, no un producto multi-timeline. No hay registro
de usuarios, ni creación de otras líneas temporales, ni panel de administración.

## 2. Objetivos / No-objetivos

**Objetivos**
- Vista pública de **solo lectura por defecto**, sin ningún control de edición a la vista
  (queda más bonito para quien solo consulta).
- Modo edición que aparece **solo tras introducir una clave de campaña compartida**.
- Edición cómoda desde el móvil: añadir / editar / borrar eventos.
- **Subida de imágenes desde la galería del móvil**, alojadas en almacenamiento propio
  (sin hosts de terceros, sin link rot).
- Conservar la estética arcana actual.
- Sin servidor propio que mantener.

**No-objetivos (YAGNI)**
- Edición colaborativa en tiempo real (varios a la vez). Se asume edición asíncrona,
  "el último que guarda gana".
- Cuentas individuales / saber quién editó cada cosa.
- Crear más cronologías o convertirlo en producto.
- Historial de cambios / deshacer (más allá del backup periódico).

## 3. Arquitectura

```
   Navegador (web estática en GitHub Pages, repo dndtimeline-editor)
        │
        │  lectura: clave pública "anon" (segura de exponer) + supabase-js
        ▼
   Supabase (gestionado, plan free)
        ├─ Postgres: tabla "events"
        │     └─ RLS: SELECT = público (anon);  INSERT/UPDATE/DELETE = solo autenticado
        ├─ Auth: una única cuenta compartida ("editor de campaña")
        └─ Storage: bucket "event-images"
              └─ leer = público;  subir/borrar = solo autenticado
        ▲
        │  (semanal) ping + descarga de backup
   GitHub Actions (keep-alive + snapshot a JSON/imágenes en el repo)
```

No hay backend propio. El frontend sigue siendo estático en GitHub Pages. Supabase aporta
base de datos, almacenamiento de imágenes y autenticación, todo gestionado.

## 4. La "contraseña compartida" sin escribir backend

En lugar de programar una verificación de contraseña (que requeriría una función de
servidor), se crea **una sola cuenta de Supabase Auth** (email + contraseña). Esa
contraseña **es** la clave de campaña, compartida con el grupo.

- En la web: punto de entrada discreto (candado) → formulario de login → `supabase.auth
  .signInWithPassword({ email, password })`. La sesión se guarda en el navegador (se
  recuerda en cada móvil).
- Como es una sesión de auth normal de Supabase, **las políticas RLS protegen los datos
  automáticamente**: sin sesión solo se lee; con sesión se puede escribir.
- El email de la cuenta puede ir "pre-rellenado" en el formulario (no es secreto); lo único
  que el grupo teclea es la contraseña.
- Rotar la clave = cambiar la contraseña de esa cuenta en Supabase.
- Consecuencia aceptada: cualquiera con la clave puede escribir y no se distingue autoría
  (es justo el modelo pedido).

**Seguridad:** la clave `anon` del cliente solo permite leer (por RLS). Las escrituras
exigen la sesión de la cuenta compartida. Si la clave se filtra, se rota. La web ya es
pública de lectura, así que no se expone nada nuevo al exponer la `anon`.

## 5. Modelo de datos

Tabla `events` (columnas legibles también desde el panel de Supabase):

| columna       | tipo        | notas                                                            |
|---------------|-------------|------------------------------------------------------------------|
| `id`          | uuid (PK)   | autogenerado                                                     |
| `name`        | text        | nombre del evento                                                |
| `event_date`  | date        | **fecha humana** (no el entero de minutos). Soporta BCE vía año. |
| `color`       | text        | hex, por defecto `#0079CC`                                       |
| `image_path`  | text (null) | ruta dentro del bucket de Storage, o null                        |
| `sort_order`  | int / text  | orden de desempate cuando coinciden fechas                       |
| `created_at`  | timestamptz | autogenerado                                                     |

- El cálculo de fechas mostradas y de etiquetas relativas ("N years later", "N days
  later") se hace en el **JS del cliente** al renderizar, replicando la lógica actual de
  `build.py` (algoritmo proléptico Gregoriano con soporte BCE).
- **Años antes de Cristo:** `event_date` (tipo `date`) cubre años negativos en Postgres.
  Si surgiera limitación, alternativa: guardar el año como entero aparte. (Pregunta abierta
  menor, ver §11.)

## 6. Imágenes

- Bucket de Storage `event-images`: lectura pública, subida/borrado solo autenticado.
- En el editor, el campo de imagen usa un `<input type="file" accept="image/*">`: el
  compañero elige una foto de la galería y **se sube directamente** a Storage; se guarda su
  ruta en `events.image_path`.
- Optimización: al subir, se redimensiona en el cliente (canvas → WebP/JPEG, ~1200px máx)
  antes de mandarla, para no almacenar PNGs de 1–2 MB. (Mantiene el bucket pequeño dentro
  del free tier.)
- Las imágenes se muestran como fondo de tarjeta (igual que ahora) y a tamaño completo en
  el lightbox.

## 7. Vista y edición (UX)

**Por defecto (no logueado):** la cronología arcana tal cual, **sin ningún control de
edición**. Solo lectura, limpia.

**Entrada a edición:** un **candado discreto** en una esquina (p. ej. el footer). Al
pulsarlo, formulario de clave. (Además, opcionalmente, la URL `#editar` abre el mismo
formulario.)

**Modo edición (logueado):**
- Cada tarjeta muestra **lápiz** (editar) y **papelera** (borrar, con confirmación).
- Botón **"+"** flotante para añadir evento.
- Formulario (modal) con: nombre, **selector de fecha nativo**, **subir foto**, color
  (opcional). Guardar escribe en Supabase; la vista se refresca.
- Botón **"Salir"** que cierra sesión y vuelve a la vista limpia.

## 8. Lectura y render (en vivo)

- Al cargar, la web pide los eventos a Supabase con `supabase-js` (clave `anon`) y los
  pinta. Los cambios guardados se ven al instante / al recargar.
- La fuente de verdad pasa a ser **Supabase**. En el proyecto nuevo desaparece el flujo
  `build.py` → `data.js` para los datos (sí se conserva la lógica de fechas, portada a JS
  de cliente).

## 9. Permanencia y anti-pausa (plan free)

El plan gratuito de Supabase **pausa** un proyecto tras ~7 días sin actividad. Mitigación:
un **GitHub Action programado (semanal)** que:
1. Hace una petición de lectura a Supabase → mantiene el proyecto activo.
2. Descarga un **backup**: vuelca los eventos a un JSON y las imágenes a una carpeta,
   commiteándolos al repo nuevo. Esto da un **archivo durable** de la crónica (resistente a
   que algún día se abandone Supabase) y un fallback.

(Opcional futuro: que la web pueda caer a ese JSON de backup si Supabase no responde.)

## 10. Migración inicial

Script de una sola vez que lee el export actual
(`Tierras perdidas, sueños encontrados.json`) y:
- inserta los 55 eventos en la tabla `events` (convirtiendo el entero de minutos a
  `event_date`),
- sube las 31 imágenes al bucket y rellena `image_path`.

## 11. Supuestos y preguntas abiertas

- **Asíncrono, último-que-guarda-gana.** Sin tiempo real ni resolución de conflictos.
- Grupo pequeño (3–8) y de confianza.
- Lectura pública (sin cambios respecto a hoy).
- *Pregunta abierta menor:* representación de años BCE en `event_date` (tipo `date` de
  Postgres vs. año entero aparte). Se decide en implementación; no afecta al diseño.
- *Pregunta abierta menor:* nombre definitivo del repo (`dndtimeline-editor` provisional).

## 12. División de tareas para el setup de Supabase

**Decisión:** el usuario opta por **control total** (Personal Access Token a nivel de
cuenta) por comodidad — el asistente crea incluso el proyecto.

- **Usuario:** tener cuenta en Supabase (registro interactivo, su identidad) y generar un
  **Personal Access Token** para entregarlo de forma puntual.
- **Asistente:** con ese token, vía CLI/API de Supabase, crear **proyecto**, tabla,
  políticas RLS, bucket, cuenta compartida y ejecutar la migración. El token se usa en local
  (variable de entorno), **nunca se commitea**, y el usuario lo **revoca** al terminar.

## 13. Fuera de alcance

Auth por persona, roles, multi-timeline, edición en tiempo real, historial/undo,
moderación, y cualquier cosa orientada a "producto para terceros".
