// Parámetros operativos de la cátedra. Todo lo que el docente puede querer ajustar vive acá.

/** Tucumán no tiene horario de verano: UTC-3 todo el año. */
export const TZ_OFFSET = '-03:00'

/** Ventana de registro por defecto para las teóricas de miércoles y viernes. */
export const APERTURA_DEFAULT = '07:30'
export const CIERRE_DEFAULT = '08:10'

/** Rotación del QR proyectado (RFC 6238 con HMAC-SHA256). */
export const TOTP_PASO_S = 20
export const TOTP_TOLERANCIA = 1 // ± pasos aceptados para absorber desfase de reloj/red

/** Tiempo que tiene el alumno, desde que escaneó, para completar el registro. */
export const PASE_TTL_S = 180

/** Porcentaje mínimo de asistencia a teóricas para quedar "Regular". */
export const UMBRAL_REGULARIDAD = 75

/**
 * Geocercado: 'off' no pide ubicación, 'registrar' guarda sólo la distancia a la sede y el panel marca a
 * quien estaba lejos (nunca frena el presente), 'exigir' sólo acepta el presente desde el aula (descontando
 * el margen de error del GPS). Debe coincidir con la tabla `ajustes` en Supabase, que es la que manda.
 */
export type ModoGeo = 'off' | 'registrar' | 'exigir'

/**
 * Dominio donde los alumnos dan presente. La llave de cada celular queda guardada en el navegador para ESE
 * dominio: si el QR apuntara a otro (p. ej. ginecoapp.com.ar), todos los celulares aparecerían como nuevos.
 * Este cursado empezó en medicinapp.vercel.app y ahí se queda; ginecoapp.com.ar/p/ redirige acá (vercel.json).
 * Para un cursado nuevo (celulares nuevos) se puede pasar a ginecoapp.com.ar cambiando esto y el redirect.
 */
export const ORIGEN_ALUMNOS = 'https://medicinapp.vercel.app'
export const GEO_MODO = 'exigir' as ModoGeo
export const SEDE = {
  nombre: 'Facultad de Medicina · UNT',
  direccion: 'Lamadrid 875, San Miguel de Tucumán',
  // Punto de referencia del aula (hoy: Instituto de Maternidad, Av. Mate de Luna 1535). El que vale es el de `ajustes`.
  lat: -26.8270577,
  lng: -65.2208282,
  radioM: 150,
}

/** Nombre visible de la app (las claves internas de almacenamiento siguen con el prefijo «ciclo»). */
export const APP = 'Ginecoapp'

export const CATEDRA = {
  materia: 'Ginecología',
  /** Profesora Titular: va en la portada y en cada encabezado donde se nombra a la cátedra. */
  titular: 'Dra. Rossana E. Chahla',
  titularCompleta: 'Profesora Titular Dra. Rossana E. Chahla',
  titularCorta: 'Prof. Titular Dra. Rossana E. Chahla',
  codigo: 'I54(39)',
  facultad: 'Facultad de Medicina',
  universidad: 'Universidad Nacional de Tucumán',
  cursado: '4º Cursado 2026',
  periodo: '30/09 — 06/11',
  inscriptos: 195,
}

/** Motivos sugeridos para la carga manual de presentes desde el panel. */
export const MOTIVOS_MANUALES = ['Sin celular o sin batería', 'Problema técnico', 'Ausencia justificada', 'Actividad de la cátedra', 'Llegó con aviso']
