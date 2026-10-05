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
  | 'SUSPENDIDA'
  | 'SIN_VINCULO'
  | 'YA_VINCULADO'
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
  | { ok: true; nombre: string; progreso: Progreso; clases: { id: string; dictada: boolean; suspendida?: boolean; marca: Metodo | null }[] }
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

export type AccionAuditoria =
  | 'presente_manual'
  | 'presente_quitado'
  | 'presente_cambiado'
  | 'celular_liberado'
  | 'cuenta_habilitada'
  | 'cuenta_confirmada'
  | 'cuenta_quitada'
  | 'rol_cambiado'
  | 'solicitud_rechazada'
  | 'cuenta_creada'
  | 'clave_cambiada'
  | 'clase_suspendida'
  | 'clase_reanudada'
  | 'celular_cambiado'
  | 'cambio_celular_rechazado'

export type Rol = 'admin' | 'docente'

/** Cuenta habilitada para la cátedra (puede estar habilitada por adelantado, antes de crearse). */
export interface Cuenta {
  email: string
  rol: Rol
  creada: boolean
  confirmada: boolean
  ultimoIngreso: number | null
  agregadoEn: number | null
  agregadoPor: string | null
}

/** Alguien creó su cuenta y espera que un administrador la apruebe. */
export interface Solicitud {
  email: string
  creadaEn: number
  confirmada: boolean
}

/** Un cambio hecho por la cátedra (lo registra la base con un trigger: no se puede omitir desde la app). */
export interface EventoAuditoria {
  en: number
  por: string | null
  accion: AccionAuditoria
  sesionId: string | null
  libreta: string | null
  /** En los cambios de cuentas: el email afectado. */
  cuenta?: string | null
  detalle: string | null
}

/** Un alumno pidió pasar su presente a otro celular sin tener el anterior (lo aprueba la cátedra). */
export interface PedidoCelular {
  libreta: string
  nombre: string
  pedidoEn: number
  /** Desde cuándo tiene vinculado el celular actual, y cuándo dio presente con él por última vez. */
  vinculadoDesde: number | null
  ultimoUso: number | null
}

export type EstadoCambio = 'APROBADO' | 'PENDIENTE' | 'SIN_PEDIDO'

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
  /**
   * Cambio de celular. Con el anterior en la mano: ese genera un código (iniciarTraspaso) y el nuevo lo ingresa
   * (completarTraspaso). Sin el anterior: el nuevo deja un pedido que aprueba la cátedra (pedirCambio, estadoCambio).
   */
  iniciarTraspaso(dni: string, huella: string): Promise<{ ok: true; codigo: string; vence: number } | Fallo>
  completarTraspaso(dni: string, codigo: string, huella: string, publicJwk: JsonWebKey): Promise<{ ok: true; nombre: string } | Fallo>
  pedirCambio(dni: string, huella: string, publicJwk: JsonWebKey): Promise<{ ok: true } | Fallo>
  estadoCambio(dni: string, huella: string): Promise<{ ok: true; estado: EstadoCambio } | Fallo>
}

/** Lo que usa la cátedra: proyector, póster y panel. Se carga recién al entrar con usuario. */
export interface AdminApi {
  modo: 'demo' | 'supabase'
  autenticado(): Promise<boolean>
  /** `recordar`: si es false la sesión dura lo que el navegador abierto (PC compartida del aula). */
  ingresar(email: string, clave: string, recordar?: boolean): Promise<{ ok: boolean; error?: string }>
  salir(): Promise<void>
  /** La persona con sesión cambia su propia contraseña (por ejemplo, la inicial que le dio un administrador). */
  cambiarMiClave(clave: string): Promise<void>
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
  /** Pedidos de cambio de celular de alumnos que no tienen el anterior. */
  pedidosCelular(): Promise<PedidoCelular[]>
  resolverCambio(libreta: string, aprobar: boolean): Promise<void>
  /** Borra los presentes y fallos de la clase de ensayo y la cierra. Devuelve cuántos presentes borró. */
  terminarEnsayo(): Promise<number>
  /** Errores que vieron los alumnos en una clase (sólo el código): de los últimos 10 minutos y en total. */
  fallos(sesionId: string): Promise<{ recientes: Record<string, number>; total: Record<string, number> }>
  /** Últimos cambios manuales: presentes cargados o quitados y celulares liberados. */
  auditoria(): Promise<EventoAuditoria[]>
  /** Gestión de cuentas: sólo para administradores (la base lo exige en cada función). */
  esAdmin(): Promise<boolean>
  cuentas(): Promise<{ yo: string; cuentas: Cuenta[]; solicitudes: Solicitud[] }>
  habilitar(email: string, rol: Rol, confirmar?: boolean): Promise<void>
  quitarCuenta(email: string): Promise<void>
  cambiarRol(email: string, rol: Rol): Promise<void>
  rechazar(email: string): Promise<void>
  /** Administradores: crear una cuenta ya confirmada con contraseña inicial, y cambiar una olvidada. */
  crearCuenta(email: string, rol: Rol, clave: string): Promise<void>
  cambiarClave(email: string, clave: string): Promise<void>
  /** Administradores: suspender una clase con un motivo (no cuenta para la regularidad), o reanudarla con null. */
  suspenderClase(sesionId: string, motivo: string | null): Promise<void>

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
