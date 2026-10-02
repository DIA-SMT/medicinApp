import { restPublico } from './rest'
import type { PublicoApi } from './types'

// `__DEMO__` se resuelve en build: en producción el modo local (y el padrón) no se empaquetan.
let api: Promise<PublicoApi> | null = null
export const publico = () => (api ??= __DEMO__ ? import('./local').then((m) => m.crearLocal()) : Promise.resolve(restPublico))
