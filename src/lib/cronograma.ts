// Cronograma de clases teóricas — Cátedra de Ginecología, 4º Cursado 2026 (30/09 a 06/11).
// Una sesión por fecha: el 09/10 se dictan dos temas en la misma mañana y comparten QR.

export type Area =
  | 'endocrino'
  | 'obstetricia'
  | 'infecto'
  | 'salud-sexual'
  | 'reproduccion'
  | 'climaterio'
  | 'oncologia'
  | 'mastologia'

export const AREAS: Record<Area, { label: string; color: string }> = {
  endocrino: { label: 'Endocrinología', color: '#e0246f' },
  obstetricia: { label: 'Obstetricia', color: '#7457f0' },
  infecto: { label: 'Infectología', color: '#0e9f68' },
  'salud-sexual': { label: 'Salud sexual', color: '#0b84c6' },
  reproduccion: { label: 'Reproducción', color: '#e2620b' },
  climaterio: { label: 'Climaterio', color: '#c27c03' },
  oncologia: { label: 'Oncología', color: '#0a93ad' },
  mastologia: { label: 'Mastología', color: '#d02a8a' },
}

export interface Tema {
  titulo: string
  detalle?: string
  docente: string
  area: Area
}

export interface Sesion {
  id: string // fecha ISO, YYYY-MM-DD
  n: number
  fecha: string
  temas: Tema[]
  parcial?: string
  /** Clase de prueba: no cuenta para la regularidad (ver SESION_ENSAYO). */
  ensayo?: boolean
}

export const CRONOGRAMA: Sesion[] = [
  {
    id: '2026-09-30', n: 1, fecha: '2026-09-30',
    temas: [{ titulo: 'Eje hipotálamo-hipófiso-ovárico', detalle: 'Ciclo sexual', docente: 'Prof. Dra. Rossana Chahla', area: 'endocrino' }],
  },
  {
    id: '2026-10-02', n: 2, fecha: '2026-10-02',
    temas: [{ titulo: 'Amenorrea primaria y secundaria', docente: 'Dr. Juan P. Monteros Alvi', area: 'endocrino' }],
  },
  {
    id: '2026-10-07', n: 3, fecha: '2026-10-07',
    temas: [{ titulo: 'Síndrome ovárico metabólico poliendócrino', detalle: 'SOMP', docente: 'Prof. Dra. Rossana Chahla', area: 'endocrino' }],
  },
  {
    id: '2026-10-09', n: 4, fecha: '2026-10-09',
    temas: [
      { titulo: 'Embarazo patológico del 1° trimestre', detalle: 'Aborto · Embarazo ectópico · Enfermedad trofoblástica gestacional', docente: 'Dr. Pablo De Chazal', area: 'obstetricia' },
      { titulo: 'Infecciones ginecológicas', detalle: 'ITS · EPI', docente: 'Dra. Beatriz Chehuan', area: 'infecto' },
    ],
  },
  {
    id: '2026-10-14', n: 5, fecha: '2026-10-14',
    temas: [{ titulo: 'Salud sexual y reproductiva', detalle: 'Anticoncepción', docente: 'Dra. Cecilia Delgado', area: 'salud-sexual' }],
  },
  {
    id: '2026-10-16', n: 6, fecha: '2026-10-16',
    temas: [{ titulo: 'Enfoque actual de la pareja infértil', detalle: 'Endometriosis', docente: 'Dr. Darío Quinteros', area: 'reproduccion' }],
  },
  {
    id: '2026-10-21', n: 7, fecha: '2026-10-21', parcial: '1° Parcial',
    temas: [{ titulo: 'Climaterio', detalle: 'Factores de riesgo · Esquemas terapéuticos · SUA', docente: 'Prof. Dra. Nelly E. Capua', area: 'climaterio' }],
  },
  {
    id: '2026-10-23', n: 8, fecha: '2026-10-23',
    temas: [{ titulo: 'Patología ovárica benigna y maligna', detalle: 'Diagnóstico clínico, imagenológico y anatomopatológico · Estadificación · Tratamiento', docente: 'Dr. Gerardo Perdiguero', area: 'oncologia' }],
  },
  {
    id: '2026-10-28', n: 9, fecha: '2026-10-28',
    temas: [{ titulo: 'Patología mamaria benigna', docente: 'Dra. Carolina Paíz', area: 'mastologia' }],
  },
  {
    id: '2026-10-30', n: 10, fecha: '2026-10-30',
    temas: [{ titulo: 'Patología mamaria maligna', detalle: 'Cáncer de mama · Diagnóstico clínico, imagenológico y anatomopatológico · Tratamiento', docente: 'Dra. Valeria Cagna', area: 'mastologia' }],
  },
  {
    id: '2026-11-04', n: 11, fecha: '2026-11-04',
    temas: [{ titulo: 'Patología cervical preinvasora', detalle: 'Lesiones intraepiteliales escamosas de bajo y alto grado · Programa Nacional de Prevención de Cáncer Cérvico-Uterino', docente: 'Prof. Dra. Jacqueline Charubi', area: 'oncologia' }],
  },
  {
    id: '2026-11-06', n: 12, fecha: '2026-11-06', parcial: '2° Parcial',
    temas: [{ titulo: 'Patología cervical invasora (CCU)', detalle: 'Cáncer de endometrio', docente: 'Prof. Dra. Jacqueline Charubi', area: 'oncologia' }],
  },
]

/**
 * Clase de ensayo: para probar el circuito completo (proyector, celulares, panel) antes de una clase real.
 * Se abre a mano desde el proyector; no cuenta para la regularidad y se borra con «Terminar ensayo».
 */
export const SESION_ENSAYO: Sesion = {
  id: 'ensayo',
  n: 0,
  fecha: '2026-01-01',
  ensayo: true,
  temas: [{ titulo: 'Clase de ensayo', detalle: 'No cuenta para la regularidad', docente: 'Cátedra de Ginecología', area: 'endocrino' }],
}
/** DNIs de prueba para el ensayo: no vinculan el celular y sólo funcionan en la clase de ensayo. */
export const DNIS_ENSAYO = ['1.000.001', '1.000.002', '1.000.003', '1.000.004', '1.000.005']

export const sesionPorId = (id: string) => (id === SESION_ENSAYO.id ? SESION_ENSAYO : CRONOGRAMA.find((s) => s.id === id))
export const tituloSesion = (s: Sesion) => s.temas.map((t) => t.titulo).join(' · ')
export const docentesSesion = (s: Sesion) => [...new Set(s.temas.map((t) => t.docente))].join(' · ')
