// Términos y condiciones que el alumno acepta antes de su primer presente (y cuando cambie la versión).
// Texto redactado para la cátedra; conviene que lo revise el área legal de la Facultad.
import { CATEDRA, UMBRAL_REGULARIDAD } from './config'

/** Al cambiar el texto, cambiar la versión: todos lo vuelven a aceptar en su próximo presente. */
export const TERMINOS_VERSION = '2026-10-07'

/** Lo esencial, a la vista en la pantalla «¿Sos vos?». */
export const TERMINOS_RESUMEN = [
  'Soy el titular de este DNI y estoy presente en el aula.',
  'El registro es personal: dar presente por otro o desde afuera es una falta y se anula.',
  'Si la app falla, aviso a la cátedra en la misma clase. La planilla oficial la lleva la cátedra.',
]

export const TERMINOS_TITULO = 'Términos y condiciones de uso de Ginecoapp'

export const TERMINOS: { titulo: string; texto: string }[] = [
  {
    titulo: 'Qué es',
    texto: `Ginecoapp es una herramienta de la Cátedra de ${CATEDRA.materia} (${CATEDRA.facultad}, ${CATEDRA.universidad}; ${CATEDRA.titularCompleta}) para registrar la asistencia a las clases teóricas. El registro oficial de asistencia y la condición de regularidad (${UMBRAL_REGULARIDAD}% de asistencia) los determina la cátedra: ante cualquier diferencia entre la app y lo que la cátedra registre o resuelva, prevalece lo resuelto por la cátedra.`,
  },
  {
    titulo: 'Uso personal',
    texto: 'Al dar presente declarás que sos el titular del DNI ingresado y que estás presente en el aula en ese momento. El registro es personal e intransferible. Dar presente por otra persona, desde fuera del aula, o con un enlace o código recibido sin estar presente, es una falta: la cátedra puede anular esos presentes y comunicar la situación a las autoridades de la Facultad según la normativa vigente.',
  },
  {
    titulo: 'Tu celular',
    texto: 'El primer presente vincula tu celular a tu libreta. Sos responsable de su uso y de no prestarlo para dar presente por otras personas.',
  },
  {
    titulo: 'Datos que se registran',
    texto: 'Tu DNI (sólo para encontrarte en el padrón de la materia), tu nombre, la fecha y hora del presente, el método (QR, póster o enlace, o manual), un identificador técnico del celular, la dirección IP con fines de seguridad y, si lo permitís, la distancia aproximada al aula (nunca tu ubicación exacta). Se usan exclusivamente para el control de asistencia y la seguridad del registro, no se ceden a terceros y se conservan mientras sean necesarios para acreditar la regularidad. Podés ejercer tus derechos de acceso, rectificación y supresión (Ley 25.326 de Protección de los Datos Personales) ante la cátedra.',
  },
  {
    titulo: 'Disponibilidad y fallas técnicas',
    texto: 'La app se ofrece como una facilidad y puede tener interrupciones. La cátedra no se responsabiliza por fallas o falta de conectividad, de datos móviles, de batería o del dispositivo, ni por fallas de servicios de terceros. Si no pudiste registrarte por un problema técnico, tenés que avisar a la cátedra durante la misma clase para que evalúe el presente manual; los reclamos posteriores quedan a criterio de la cátedra.',
  },
  {
    titulo: 'Asistente',
    texto: 'Las respuestas de Elena, la asistente de la app, son orientativas y no reemplazan las indicaciones de la cátedra.',
  },
  {
    titulo: 'Cambios',
    texto: 'La cátedra puede modificar estos términos, el cronograma y el funcionamiento de la app. La versión vigente está siempre publicada en la app; si cambia, se te pide aceptarla de nuevo.',
  },
]
