# CICLO · Asistencia criptográfica — Cátedra de Ginecología, FM-UNT

Webapp para las clases teóricas de Ginecología (4º Cursado 2026, 30/09 → 06/11, miércoles y viernes).
El alumno escanea un QR en el aula, pone su DNI **sólo la primera vez**, y queda asentado en la planilla de regularidad.

| Ruta | Para quién | Qué hace |
|---|---|---|
| `/` | todos | Portada: próxima clase con cuenta regresiva, monitor hormonal del eje H-H-O, protocolo |
| `/#/cronograma` | todos | Las 12 clases con docente, área y parciales |
| `/p/` | alumno | Registro liviano (~16 KB, sin React): código manual o destino del QR |
| `/#/aula/:clase` | cátedra | Proyector: QR que rota cada 20 s, ventana horaria, presentes en vivo |
| `/#/poster/:clase` | cátedra | Póster A4 imprimible con QR fijo, válido sólo en la ventana de esa fecha |
| `/#/panel` | cátedra | Regularidad, **presente manual**, detalle por clase, dispositivos, exportación CSV |

## Registro del alumno: lo mínimo

- **Primera vez:** escanea → escribe el DNI → «Sí, dar presente». El celular queda vinculado.
- **Siguientes clases:** escanea y listo, sin tocar nada.
- No se pide ubicación ni se instala nada. La página `/p/` pesa ~16 KB comprimida (HTML + CSS + JS), usa la tipografía
  del sistema y habla con Supabase con `fetch` directo: carga al instante aunque 195 alumnos escaneen a la vez con datos móviles.

## Presente manual (cátedra)

Panel → **Presente manual** (o desde el proyector, botón «Presente manual»):
elegí la clase, marcá alumnos del padrón (búsqueda por nombre, libreta o DNI, o pegando una lista), elegí el motivo
(sin celular, problema técnico, ausencia justificada…) y confirmá. Queda registrado quién lo cargó y por qué; se puede
cargar por adelantado para una clase futura y deshacer en cualquier momento. En la planilla exportada figura como `PM`.

## Cómo se valida un presente

1. **QR dinámico** — `TOTP = Truncar(HMAC-SHA256(K, ⌊T/20⌋))`, tolerancia ±1 paso. Una captura reenviada llega vencida.
2. **Pase de 180 s** — al escanear un código válido el servidor emite un pase firmado; el alumno tiene 3 minutos para completar.
3. **Ventana horaria** — por defecto 07:30 → 08:10 (hora de Tucumán). El docente puede abrir, extender o cerrar a mano.
4. **Dispositivo vinculado** — el navegador genera una llave ECDSA P-256 no exportable (IndexedDB). Un celular ↔ un alumno.
5. **Idempotencia** — `UNIQUE (sesion_id, libreta)`: reintentar nunca duplica.
6. **Límite de intentos** — 120 fallos por minuto por IP.
7. **Ubicación (opcional, apagada)** — `ajustes.geo_modo` = `off` | `registrar` | `exigir` (y `GEO_MODO` en `src/lib/config.ts`).

Todas las reglas viven en las funciones SQL (`supabase/schema.sql`). `npm run test:sql` las prueba contra un Postgres
embebido (PGlite): 34 casos, incluida la paridad exacta del TOTP entre JavaScript y SQL y la carga manual.

## Desarrollo

```bash
npm install
npm run dev              # usa .env.local (Supabase real)
VITE_DEMO=1 npm run dev  # modo demo: datos en el navegador, DNI ficticio 10000001
```

En modo demo: aula → «Abrir ahora · 10 min» → «Abrir como alumno». «Simular 25 llegadas» y, en el panel,
«Datos de ejemplo» muestran el tablero con movimiento.

`npm run build` termina con `scripts/verificar-pii.mjs`, que falla si algún DNI o libreta del padrón aparece en el
código o en lo que se publica.

## Producción

- **Frontend:** Vercel, conectado a este repo (cada push a `main` despliega). Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Base:** Supabase. Una sola vez:
  1. SQL Editor → pegar y ejecutar `supabase/schema.sql`.
  2. Cargar sesiones y padrón: `npm run seed` genera `supabase/seed.sql` (o se cargan por API con la service role, que **nunca** va al repo ni a Vercel).
  3. Authentication → Users → crear la cuenta de la cátedra y habilitarla: `insert into public.docentes (email) values ('…');`
  4. Authentication → Providers → Email: desactivar «Allow new users to sign up».

La anon key es pública por diseño (viaja en el navegador); todo lo sensible está protegido por RLS y por las funciones SQL.
Los DNIs sólo están en la base y nunca se devuelven al alumno (ve su nombre enmascarado: «Pérez, A.»).

## Checklist para cada clase

- [ ] La noche anterior (si se usa póster): `/#/poster/AAAA-MM-DD` → imprimir y pegar.
- [ ] 07:25: `/#/aula` en la computadora del aula → «Pantalla completa». La pantalla no se apaga mientras el registro está abierto.
- [ ] 07:30–08:10: el QR rota solo. Si el docente se demora, «+5 min».
- [ ] 08:10: el registro se cierra solo. Retirar el póster.
- [ ] Eventualidades (sin celular, cambió de teléfono): «Presente manual» y, si hace falta, Panel → Dispositivos → Liberar.

## Datos personales

`data/alumnos.json`, `supabase/seed.sql` y los PDF de las planillas contienen DNI y libreta de los 195 alumnos: están en
`.gitignore`. No los subas a ningún repositorio.

## Límites conocidos

- En Supabase se valida que la huella del dispositivo corresponda a la clave pública presentada y se guarda la firma;
  verificar criptográficamente la firma ECDSA requeriría una Edge Function.
- El póster impreso es un QR fijo: dentro de los 40 minutos de ventana alguien podría fotografiarlo y reenviarlo. El vínculo
  de dispositivo lo limita a un alumno por celular; para máxima seguridad, proyectar el QR dinámico.
