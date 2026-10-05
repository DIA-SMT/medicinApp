import type { Ventana } from '../lib/time'

export interface Alumno {
  libreta: string
  nombre: string
  dni: string
  folio: string
  orden: number
}

export type Metodo = 'qr' | 'poster' | 'manual'

export interface Registro {
  sesionId: string
  libreta: string
  nombre: string
  marcadoEn: number
  metodo: Metodo
  distanciaM?: number | null
  precisionM?: number | null
  huella?: string | null
  /** Sólo en cargas manuales: por qué se dio el presente y quién lo cargó. */
  motivo?: string | null
  cargadoPor?: string | null
}

export interface ResumenSesion {
  sesionId: string
  presentes: number
  total: number
  ultimos: { nombre: string; marcadoEn: number }[]
}

export type CodigoError =
  | 'SESION_INEXISTENTE'
  | 'PROGRAMADA'
  | 'CERRADA'
  | 'CODIGO_INVALIDO'
  | 'PASE_VENCIDO'
  | 'DNI_DESCONOCIDO'
  | 'DISPOSITIVO_AJENO'
  | 'DISPOSITIVO_OCUPADO'
  | 'FIRMA_INVALIDA'
  | 'FUERA_DE_RANGO'
  | 'SIN_CRYPTO'
  | 'NO_AUTORIZADO'
  | 'RED'

export type Fallo = { ok: false; error: CodigoError; detalle?: string }

/** `ahora`: hora del servidor (epoch ms), para que el celular corrija su reloj. */
export type ResultadoPase = { ok: true; pase: string; metodo: Metodo; expiraEn: number; ahora?: number } | Fallo

export type ResultadoIdentificacion =
  | { ok: true; nombre: string; libreta: string; vinculo: 'este' | 'libre' | 'otro' }
  | Fallo

export type ResultadoMarca =
  | { ok: true; estado: 'REGISTRADO' | 'YA_REGISTRADO'; marcadoEn: number; comprobante: string; nombre: string; distanciaM: number | null; progreso?: Progreso }
  | Fallo

/** Avance del alumno hacia la regularidad (misma regla que el panel). */
export interface Progreso {
  presentes: number
  /** Clases ya dictadas en las que se tomó asistencia. */
  dictadas: number
  /** Clases de hoy en adelante que todavía no se tomaron. */
  restantes: number
}

/** Lo que ve el alumno en «Mi asistencia»: sus clases y su avance hacia la regularidad. */
export type ResultadoMiAsistencia =
  | { ok: true; nombre: string; progreso: Progreso; clases: { id: string; dictada: boolean; marca: Metodo | null }[] }
  | Fallo

export interface PedidoMarca {
  sesionId: string
  pase: string
  dni: string
  huella: string
  publicJwk: JsonWebKey
  firma: string
  ts: number
  ubicacion: { lat: number; lng: number; precision: number } | null
}

export type AccionAuditoria = 'presente_manual' | 'presente_quitado' | 'presente_cambiado' | 'celular_liberado'

/** Un cambio hecho por la cátedra (lo registra la base con un trigger: no se puede omitir desde la app). */
export interface EventoAuditoria {
  en: number
  por: string | null
  accion: AccionAuditoria
  sesionId: string | null
  libreta: string
  detalle: string | null
}

export interface DispositivoVinculado {
  libreta: string
  huella: string
  creadoEn: number
}

/** Lo que usa el celular del alumno y las páginas públicas: pocas llamadas, sin dependencias. */
export interface PublicoApi {
  ventanas(): Promise<Record<string, Ventana>>
  /** Diferencia entre el reloj del servidor y el de este equipo, en ms (servidor − local). */
  desfase(): Promise<number>
  abrirPase(sesionId: string, codigo: string): Promise<ResultadoPase>
  identificar(sesionId: string, pase: string, dni: string, huella: string): Promise<ResultadoIdentificacion>
  marcar(p: PedidoMarca): Promise<ResultadoMarca>
  /** Sólo responde al celular vinculado a ese DNI. */
  miAsistencia(dni: string, huella: string): Promise<ResultadoMiAsistencia>
}

/** Lo que usa la cátedra: proyector, póster y panel. Se carga recién al entrar con usuario. */
export interface AdminApi {
  modo: 'demo' | 'supabase'
  autenticado(): Promise<boolean>
  /** `recordar`: si es false la sesión dura lo que el navegador abierto (PC compartida del aula). */
  ingresar(email: string, clave: string, recordar?: boolean): Promise<{ ok: boolean; error?: string }>
  salir(): Promise<void>
  /**
   * Crea la cuenta de un docente (email + contraseña elegidos por él). No da acceso por sí sola:
   * el administrador tiene que agregar el email a la tabla docentes.
   */
  registrar(email: string, clave: string): Promise<{ ok: boolean; error?: string }>
  ventanas(): Promise<Record<string, Ventana>>
  secreto(sesionId: string): Promise<string>
  guardarVentana(sesionId: string, v: Ventana): Promise<void>
  resumen(sesionId: string): Promise<ResumenSesion>
  /** Llama a `cb` cada vez que cambian los registros. Devuelve la función para desuscribirse. */
  suscribir(cb: () => void): () => void
  alumnos(): Promise<Alumno[]>
  registros(): Promise<Registro[]>
  /** Presente manual para varios alumnos a la vez (también antes de la clase). */
  marcarManual(sesionId: string, libretas: string[], motivo: string): Promise<number>
  quitarPresente(sesionId: string, libretas: string[]): Promise<void>
  dispositivos(): Promise<DispositivoVinculado[]>
  liberarDispositivo(libreta: string): Promise<void>
  /** Últimos cambios manuales: presentes cargados o quitados y celulares liberados. */
  auditoria(): Promise<EventoAuditoria[]>

  /** Herramientas sólo disponibles en modo demostración. */
  demo?: {
    simularLlegadas(sesionId: string, cantidad: number): Promise<void>
    poblarHistorico(): Promise<void>
    reiniciar(): Promise<void>
  }
}

declare global {
  const __DEMO__: boolean
}
