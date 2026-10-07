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
 * quien estaba lejos (nunca frena el presente), 'exigir' rechaza fuera del radio.
 * Debe coincidir con la tabla `ajustes` en Supabase.
 */
export type ModoGeo = 'off' | 'registrar' | 'exigir'
export const GEO_MODO = 'registrar' as ModoGeo
export const SEDE = {
  nombre: 'Facultad de Medicina · UNT',
  direccion: 'Lamadrid 875, San Miguel de Tucumán',
  lat: -26.8364465,
  lng: -65.2120858,
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
