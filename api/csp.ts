// Recibe los avisos de la política de seguridad de contenido (CSP) que manda el navegador cuando algo
// se habría bloqueado. Sólo los escribe en los registros de Vercel (tipo de recurso, origen bloqueado y
// página, sin parámetros) para revisar antes de pasar la CSP de «sólo informe» a obligatoria.

const recortar = (u: unknown) => {
  const t = String(u ?? '')
  try {
    const url = new URL(t)
    return `${url.origin}${url.pathname}` // sin query ni hash: no se registran datos de la URL
  } catch {
    return t.slice(0, 80) // 'inline', 'eval', 'data', etc.
  }
}

export async function POST(request: Request) {
  const texto = (await request.text().catch(() => '')).slice(0, 20_000)
  try {
    const cuerpo = JSON.parse(texto) as unknown
    // Formato viejo (report-uri): { "csp-report": {...} }; formato nuevo (Reporting API): [{ type, body }]
    const avisos = Array.isArray(cuerpo) ? cuerpo.map((x) => (x as { body?: unknown }).body) : [(cuerpo as { 'csp-report'?: unknown })['csp-report']]
    for (const a of avisos.slice(0, 20)) {
      const r = (a ?? {}) as Record<string, unknown>
      console.log(
        '[CSP]',
        JSON.stringify({
          directiva: r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'],
          bloqueado: recortar(r['blocked-uri'] ?? r.blockedURL),
          pagina: recortar(r['document-uri'] ?? r.documentURL),
          linea: r['line-number'] ?? r.lineNumber,
        }),
      )
    }
  } catch {
    /* cuerpo ilegible: se ignora */
  }
  return new Response(null, { status: 204 })
}
