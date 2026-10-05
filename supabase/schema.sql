-- ════════════════════════════════════════════════════════════════════════════
--  CICLO · Asistencia criptográfica — Cátedra de Ginecología, FM-UNT
--  Ejecutar completo en Supabase → SQL Editor. Luego ejecutar seed.sql.
--
--  Reglas que se resuelven en la base (no dependen del frontend):
--   · ventana horaria por sesión (America/Argentina/Tucuman) + apertura/cierre manual
--   · TOTP HMAC-SHA256, Δt = 20 s, tolerancia ±1 paso; clave fija para el póster impreso
--   · pase de 180 s para completar el registro después de escanear
--   · un dispositivo ↔ un alumno (huella de clave pública ECDSA P-256)
--   · presentes manuales de la cátedra con motivo y autor
--   · UNIQUE (sesion_id, libreta): reintentos idempotentes
--   · límite de intentos fallidos por IP
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── Tablas ──────────────────────────────────────────────────────────────────

create table if not exists public.alumnos (
  libreta text primary key,
  nombre  text not null,
  dni     text not null unique,
  folio   text,
  orden   int
);

create table if not exists public.sesiones (
  id           text primary key,              -- YYYY-MM-DD
  n            int  not null,
  fecha        date not null,
  titulo       text not null,
  apertura     time not null default '07:30',
  cierre       time not null default '08:10',
  manual_desde timestamptz,
  manual_hasta timestamptz,
  cerrada_en   timestamptz
);

-- Ensayos: una clase de prueba (no cuenta para la regularidad) y DNIs de prueba que nunca vinculan un celular
-- ni figuran en la planilla, para probar el circuito completo sin dejar rastros en lo real.
alter table public.alumnos add column if not exists ficticio boolean not null default false;
alter table public.sesiones add column if not exists ensayo boolean not null default false;

-- Clase suspendida (paro, feriado, asueto): no se puede dar presente y no cuenta para la regularidad, ni como
-- dictada ni como restante. Es reversible: los presentes que ya hubiera se conservan y vuelven a contar al reanudarla.
alter table public.sesiones add column if not exists suspendida boolean not null default false;
alter table public.sesiones add column if not exists motivo_suspension text;

create table if not exists public.sesion_secretos (
  sesion_id text primary key references public.sesiones(id) on delete cascade,
  secreto   text not null default encode(extensions.gen_random_bytes(20), 'hex')
);

create table if not exists public.dispositivos (
  huella     text primary key,
  libreta    text not null unique references public.alumnos(libreta) on delete cascade,
  public_jwk jsonb not null,
  creado_en  timestamptz not null default now()
);

create table if not exists public.asistencias (
  id          bigint generated always as identity primary key,
  sesion_id   text not null references public.sesiones(id) on delete cascade,
  libreta     text not null references public.alumnos(libreta) on delete cascade,
  marcado_en  timestamptz not null default now(),
  metodo      text not null check (metodo in ('qr', 'poster', 'manual')),
  lat         double precision,
  lng         double precision,
  precision_m double precision,
  distancia_m double precision,
  huella      text,
  firma       text,
  ip          text,
  motivo      text,                                          -- cargas manuales: por qué se dio el presente
  cargado_por text default (auth.jwt() ->> 'email'),          -- y quién lo cargó
  constraint uq_alumno_sesion unique (sesion_id, libreta)
);
create index if not exists idx_asistencias_sesion on public.asistencias (sesion_id, marcado_en desc);

create table if not exists public.docentes (
  email text primary key
);
-- Roles: 'admin' además gestiona las cuentas de la cátedra desde el panel (pestaña «Cuentas»).
alter table public.docentes add column if not exists rol text not null default 'docente' check (rol in ('admin', 'docente'));
alter table public.docentes add column if not exists agregado_en timestamptz not null default now();
alter table public.docentes add column if not exists agregado_por text;

create table if not exists public.ajustes (
  id       boolean primary key default true check (id),
  geo_modo text not null default 'off' check (geo_modo in ('off', 'registrar', 'exigir')),
  sede_lat double precision not null default -26.8364465,
  sede_lng double precision not null default -65.2120858,
  radio_m  int not null default 150
);
insert into public.ajustes default values on conflict do nothing;

create table if not exists public.intentos_fallidos (
  ip text not null,
  en timestamptz not null default now()
);
create index if not exists idx_intentos_ip on public.intentos_fallidos (ip, en desc);

-- Errores que vieron los alumnos, por clase: sólo el código (sin DNI ni IP). La cátedra los ve en vivo.
create table if not exists public.fallos (
  sesion_id text not null,
  codigo    text not null,
  en        timestamptz not null default now()
);
create index if not exists idx_fallos on public.fallos (sesion_id, en desc);

-- ── RLS: el anónimo sólo lee el calendario; el resto pasa por funciones ─────

alter table public.alumnos           enable row level security;
alter table public.sesiones          enable row level security;
alter table public.sesion_secretos   enable row level security;
alter table public.dispositivos      enable row level security;
alter table public.asistencias       enable row level security;
alter table public.docentes          enable row level security;
alter table public.ajustes           enable row level security;
alter table public.intentos_fallidos enable row level security;
alter table public.fallos            enable row level security;

-- Docente = usuario autenticado (por su id, no por un claim del token) cuyo email está confirmado
-- y figura en la tabla docentes. Una cuenta creada con el email de un docente pero sin confirmar no entra.
create or replace function public.es_docente() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from docentes d join auth.users u on lower(u.email) = lower(d.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  )
$$;

drop policy if exists sesiones_lectura on public.sesiones;
create policy sesiones_lectura on public.sesiones for select using (true);
drop policy if exists sesiones_docente on public.sesiones;
create policy sesiones_docente on public.sesiones for update using (public.es_docente()) with check (public.es_docente());

drop policy if exists alumnos_docente on public.alumnos;
create policy alumnos_docente on public.alumnos for select using (public.es_docente());

drop policy if exists asistencias_docente on public.asistencias;
create policy asistencias_docente on public.asistencias for all using (public.es_docente()) with check (public.es_docente());

drop policy if exists dispositivos_docente on public.dispositivos;
create policy dispositivos_docente on public.dispositivos for all using (public.es_docente()) with check (public.es_docente());

drop policy if exists ajustes_lectura on public.ajustes;
create policy ajustes_lectura on public.ajustes for select using (true);

-- Supabase concede por defecto todos los permisos de tabla a anon y authenticated; se parte de cero
-- para que RLS sea la segunda barrera y no la única.
revoke all on public.alumnos, public.sesiones, public.sesion_secretos, public.dispositivos, public.asistencias,
  public.docentes, public.ajustes, public.intentos_fallidos, public.fallos from anon, authenticated;

grant select on public.sesiones, public.ajustes to anon, authenticated;
-- Sólo los horarios: suspender una clase pasa por admin_suspender (administradores, con auditoría).
revoke update on public.sesiones from authenticated;
grant update (apertura, cierre, manual_desde, manual_hasta, cerrada_en) on public.sesiones to authenticated;
grant select on public.alumnos to authenticated;
grant select, insert, update, delete on public.asistencias, public.dispositivos to authenticated;

-- ── Núcleo criptográfico ────────────────────────────────────────────────────

create or replace function public._contador() returns bigint
language sql stable set search_path = public as $$ select floor(extract(epoch from now()) / 20)::bigint $$;

create or replace function public._totp(secreto text, c bigint) returns text
language plpgsql immutable set search_path = public, extensions as $$
declare h bytea; o int; bin bigint;
begin
  h := hmac(int8send(c), decode(secreto, 'hex'), 'sha256');
  o := get_byte(h, 31) & 15;
  bin := ((get_byte(h, o) & 127)::bigint << 24) | (get_byte(h, o + 1)::bigint << 16)
       | (get_byte(h, o + 2)::bigint << 8) | get_byte(h, o + 3)::bigint;
  return lpad((bin % 1000000)::text, 6, '0');
end $$;

create or replace function public._hmac_hex(secreto text, msg text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(hmac(convert_to(msg, 'UTF8'), decode(secreto, 'hex'), 'sha256'), 'hex')
$$;

create or replace function public._clave_poster(secreto text, sid text) returns text
language sql immutable set search_path = public as $$ select upper(substr(public._hmac_hex(secreto, 'poster:' || sid), 1, 10)) $$;

create or replace function public._firma_pase(secreto text, sid text, c bigint, m text) returns text
language sql immutable set search_path = public as $$ select substr(public._hmac_hex(secreto, 'pase:' || sid || ':' || c || ':' || m), 1, 16) $$;

create or replace function public._ms(t timestamptz) returns bigint
language sql immutable set search_path = public as $$ select (extract(epoch from t) * 1000)::bigint $$;

create or replace function public._abre(s public.sesiones) returns timestamptz
language sql stable set search_path = public as $$ select (s.fecha + s.apertura) at time zone 'America/Argentina/Tucuman' $$;

create or replace function public._cierra(s public.sesiones) returns timestamptz
language sql stable set search_path = public as $$
  select case
    when s.manual_hasta is not null and now() < s.manual_hasta then s.manual_hasta
    when s.cerrada_en is not null and now() >= s.cerrada_en then s.cerrada_en
    else (s.fecha + s.cierre) at time zone 'America/Argentina/Tucuman' end
$$;

create or replace function public._estado(s public.sesiones) returns text
language sql stable set search_path = public as $$
  select case
    when s.manual_hasta is not null and now() < s.manual_hasta then 'abierta'
    when s.cerrada_en is not null and now() >= s.cerrada_en then 'cerrada'
    when now() < public._abre(s) then 'programada'
    when now() <= public._cierra(s) then 'abierta'
    else 'cerrada' end
$$;

create or replace function public._ip() returns text
language sql stable set search_path = public as $$
  select coalesce(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1), 'desconocida')
$$;

create or replace function public._bloqueado() returns boolean
language sql security definer set search_path = public as $$
  -- 300 fallos/min por IP: toda el aula sale por el mismo NAT del Wi-Fi de la facultad (195 alumnos, algunos con
  -- códigos vencidos por demoras de red); para fuerza bruta sigue siendo inútil (3 códigos válidos en 10⁶ cada 20 s).
  select count(*) >= 300 from intentos_fallidos where ip = public._ip() and en > now() - interval '1 minute'
$$;

drop function if exists public._fallo(text, text);
create or replace function public._fallo(codigo text, detalle text default null, p_sesion text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if codigo in ('CODIGO_INVALIDO', 'DNI_DESCONOCIDO', 'FIRMA_INVALIDA') then
    insert into intentos_fallidos (ip) values (public._ip());
    delete from intentos_fallidos where en < now() - interval '10 minutes';
  end if;
  if p_sesion is not null and exists (select 1 from sesiones where id = p_sesion) then
    insert into fallos (sesion_id, codigo) values (p_sesion, codigo);
    delete from fallos where en < now() - interval '30 days';
  end if;
  return jsonb_build_object('ok', false, 'error', codigo, 'detalle', detalle);
end $$;

create or replace function public._es_ensayo(sid text) returns boolean
language sql stable set search_path = public as $$ select coalesce((select ensayo from sesiones where id = sid), false) $$;

/** Devuelve 'qr' | 'poster' si el pase es auténtico y vigente, o null. */
create or replace function public._validar_pase(sid text, pase text) returns text
language plpgsql stable security definer set search_path = public as $$
declare c bigint; m text; firma text; sec text;
begin
  c := nullif(split_part(pase, '.', 1), '')::bigint;
  m := split_part(pase, '.', 2);
  firma := split_part(pase, '.', 3);
  select secreto into sec from sesion_secretos where sesion_id = sid;
  if sec is null or m not in ('q', 'p') or firma <> public._firma_pase(sec, sid, c, m) then return null; end if;
  if public._contador() - c > 9 then return 'vencido'; end if; -- 9 pasos × 20 s = 180 s
  return case m when 'q' then 'qr' else 'poster' end;
exception when others then return null;
end $$;

-- ── API pública (alumno) ────────────────────────────────────────────────────

/** Hora del servidor (epoch ms). El proyector la usa para generar el QR aunque el reloj de la PC del aula esté mal. */
create or replace function public.hora_servidor() returns bigint
language sql volatile set search_path = public as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function public.abrir_pase(p_sesion text, p_codigo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sesiones; sec text; c bigint; m text;
begin
  if public._bloqueado() then return jsonb_build_object('ok', false, 'error', 'RED', 'detalle', 'Demasiados intentos. Esperá un minuto.'); end if;
  select * into s from sesiones where id = p_sesion;
  if not found then return public._fallo('SESION_INEXISTENTE', null, p_sesion); end if;
  if s.suspendida then return public._fallo('SUSPENDIDA', s.motivo_suspension, p_sesion); end if;
  if public._estado(s) = 'programada' then return public._fallo('PROGRAMADA', public._ms(public._abre(s))::text, p_sesion); end if;
  if public._estado(s) = 'cerrada' then return public._fallo('CERRADA', public._ms(public._cierra(s))::text, p_sesion); end if;

  select secreto into sec from sesion_secretos where sesion_id = p_sesion;
  c := public._contador();
  if p_codigo ~ '^\d{6}$' then
    if p_codigo in (public._totp(sec, c - 1), public._totp(sec, c), public._totp(sec, c + 1)) then m := 'q'; end if;
  elsif upper(p_codigo) = public._clave_poster(sec, p_sesion) then
    m := 'p';
  end if;
  if m is null then return public._fallo('CODIGO_INVALIDO', null, p_sesion); end if;

  return jsonb_build_object(
    'ok', true,
    'pase', c || '.' || m || '.' || public._firma_pase(sec, p_sesion, c, m),
    'metodo', case m when 'q' then 'qr' else 'poster' end,
    'expiraEn', (c * 20 + 180) * 1000,
    'ahora', public._ms(now())  -- el celular corrige su reloj con esto (la firma lleva un timestamp que se valida)
  );
end $$;

create or replace function public._nombre_corto(nombre text) returns text
language sql immutable set search_path = public as $$
  select trim(split_part(nombre, ',', 1)) || ', ' || left(trim(split_part(nombre, ',', 2)), 1) || '.'
$$;

create or replace function public.identificar(p_sesion text, p_pase text, p_dni text, p_huella text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text; a alumnos; ocupado text; propio text;
begin
  if public._bloqueado() then return jsonb_build_object('ok', false, 'error', 'RED', 'detalle', 'Demasiados intentos. Esperá un minuto.'); end if;
  v := public._validar_pase(p_sesion, p_pase);
  if v is null then return public._fallo('CODIGO_INVALIDO', null, p_sesion); end if;
  if v = 'vencido' then return public._fallo('PASE_VENCIDO', null, p_sesion); end if;
  select * into a from alumnos where dni = regexp_replace(p_dni, '\D', '', 'g');
  if not found or (a.ficticio and not public._es_ensayo(p_sesion)) then return public._fallo('DNI_DESCONOCIDO', null, p_sesion); end if;
  -- DNI de prueba (ensayo): varios celulares lo comparten y ninguno queda vinculado.
  if not a.ficticio then
    select libreta into ocupado from dispositivos where huella = p_huella;
    if ocupado is not null and ocupado <> a.libreta then return public._fallo('DISPOSITIVO_OCUPADO', null, p_sesion); end if;
    select huella into propio from dispositivos where libreta = a.libreta;
  end if;
  return jsonb_build_object(
    'ok', true,
    'nombre', public._nombre_corto(a.nombre),
    'libreta', left(a.libreta, 4) || '•••' || right(a.libreta, 2),
    'vinculo', case when propio is null then 'libre' when propio = p_huella then 'este' else 'otro' end
  );
end $$;

/** Progreso del alumno hacia la regularidad, con la misma regla que el panel: cuentan las clases ya
    dictadas en las que se tomó asistencia (y la que se está dictando, aunque el docente la haya abierto otro día);
    "restantes" son las de hoy en adelante que todavía no. Las suspendidas no cuentan para nada. */
create or replace function public._progreso(p_libreta text, p_sesion text) returns jsonb
language sql stable set search_path = public as $$
  with hoy as (select (now() at time zone 'America/Argentina/Tucuman')::date d),
  dictadas as (
    select distinct a.sesion_id from asistencias a join sesiones s on s.id = a.sesion_id, hoy
    where not s.ensayo and not s.suspendida and (s.fecha <= hoy.d or s.id = p_sesion)
  )
  select jsonb_build_object(
    'presentes', (select count(*) from dictadas d where exists (select 1 from asistencias x where x.sesion_id = d.sesion_id and x.libreta = p_libreta)),
    'dictadas', (select count(*) from dictadas),
    'restantes', (select count(*) from sesiones s, hoy where not s.ensayo and not s.suspendida and s.fecha >= hoy.d and s.id not in (select sesion_id from dictadas))
  )
$$;

create or replace function public.marcar_presente(
  p_sesion text, p_pase text, p_dni text, p_huella text, p_public_jwk jsonb, p_firma text, p_ts bigint,
  p_lat double precision default null, p_lng double precision default null, p_precision double precision default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v text; a alumnos; ocupado text; propio text; aj ajustes; dist double precision; t timestamptz; nuevo boolean := true;
begin
  if public._bloqueado() then return jsonb_build_object('ok', false, 'error', 'RED', 'detalle', 'Demasiados intentos. Esperá un minuto.'); end if;
  v := public._validar_pase(p_sesion, p_pase);
  if v is null then return public._fallo('CODIGO_INVALIDO', null, p_sesion); end if;
  if v = 'vencido' then return public._fallo('PASE_VENCIDO', null, p_sesion); end if;
  -- Un pase pedido justo antes de suspender la clase ya no sirve.
  if (select suspendida from sesiones where id = p_sesion) then
    return public._fallo('SUSPENDIDA', (select motivo_suspension from sesiones where id = p_sesion), p_sesion);
  end if;

  select * into a from alumnos where dni = regexp_replace(p_dni, '\D', '', 'g');
  if not found or (a.ficticio and not public._es_ensayo(p_sesion)) then return public._fallo('DNI_DESCONOCIDO', null, p_sesion); end if;

  -- La huella tiene que ser la de la clave pública presentada; el timestamp, reciente.
  if p_huella <> encode(digest((p_public_jwk ->> 'x') || '.' || (p_public_jwk ->> 'y'), 'sha256'), 'hex')
     or p_firma is null or abs(public._ms(now()) - p_ts) > 300000 then
    return public._fallo('FIRMA_INVALIDA', null, p_sesion);
  end if;

  -- Un DNI de prueba no controla ni vincula el celular: así un ensayo no bloquea el teléfono de nadie.
  if not a.ficticio then
    select libreta into ocupado from dispositivos where huella = p_huella;
    if ocupado is not null and ocupado <> a.libreta then return public._fallo('DISPOSITIVO_OCUPADO', null, p_sesion); end if;
    select huella into propio from dispositivos where libreta = a.libreta;
    if propio is not null and propio <> p_huella then return public._fallo('DISPOSITIVO_AJENO', null, p_sesion); end if;
  end if;

  select * into aj from ajustes limit 1;
  if p_lat is not null and p_lng is not null then
    dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(aj.sede_lat - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(aj.sede_lat)) * power(sin(radians(aj.sede_lng - p_lng) / 2), 2)));
  end if;
  if aj.geo_modo = 'exigir' and (dist is null or dist > aj.radio_m) then
    return public._fallo('FUERA_DE_RANGO', coalesce(round(dist)::text, ''), p_sesion);
  end if;

  if propio is null and not a.ficticio then
    insert into dispositivos (huella, libreta, public_jwk) values (p_huella, a.libreta, p_public_jwk)
    on conflict do nothing;
  end if;

  insert into asistencias (sesion_id, libreta, metodo, lat, lng, precision_m, distancia_m, huella, firma, ip)
  values (p_sesion, a.libreta, v, p_lat, p_lng, p_precision, round(dist::numeric, 1), p_huella, p_firma, public._ip())
  on conflict on constraint uq_alumno_sesion do nothing
  returning marcado_en into t;

  if t is null then
    nuevo := false;
    select marcado_en, distancia_m into t, dist from asistencias where sesion_id = p_sesion and libreta = a.libreta;
  end if;

  return jsonb_build_object(
    'ok', true,
    'estado', case when nuevo then 'REGISTRADO' else 'YA_REGISTRADO' end,
    'marcadoEn', public._ms(t),
    'nombre', public._nombre_corto(a.nombre),
    'distanciaM', round(dist),
    'progreso', public._progreso(a.libreta, p_sesion),
    'comprobante', (select upper(substr(h, 1, 4) || '-' || substr(h, 5, 4))
                    from (select encode(digest(p_sesion || '|' || a.libreta || '|' || public._ms(t), 'sha256'), 'hex') h) x)
  );
end $$;

/**
 * «Mi asistencia»: el alumno consulta sus clases desde el celular vinculado. Exige el DNI y la huella del
 * dispositivo registrado para esa libreta (que sólo conoce ese celular): saber un DNI no alcanza para ver
 * la asistencia de otra persona. Sin celular vinculado todavía, no hay nada que mostrar.
 */
create or replace function public.mi_asistencia(p_dni text, p_huella text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a alumnos; hoy date := (now() at time zone 'America/Argentina/Tucuman')::date;
begin
  if public._bloqueado() then return jsonb_build_object('ok', false, 'error', 'RED', 'detalle', 'Demasiados intentos. Esperá un minuto.'); end if;
  select * into a from alumnos where dni = regexp_replace(p_dni, '\D', '', 'g');
  if not found then return public._fallo('DNI_DESCONOCIDO'); end if;
  if not exists (select 1 from dispositivos where libreta = a.libreta and huella = p_huella) then
    return public._fallo('DISPOSITIVO_AJENO');
  end if;
  return jsonb_build_object(
    'ok', true,
    'nombre', public._nombre_corto(a.nombre),
    'progreso', public._progreso(a.libreta, null),
    'clases', (
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        -- dictada = ya pasó y se tomó asistencia (misma regla que el panel); una suspendida nunca cuenta
        'dictada', not s.suspendida and s.fecha <= hoy and exists (select 1 from asistencias t where t.sesion_id = s.id),
        'suspendida', s.suspendida,
        'marca', x.metodo
      ) order by s.fecha)
      from sesiones s left join asistencias x on x.sesion_id = s.id and x.libreta = a.libreta
      where not s.ensayo
    )
  );
end $$;

-- ── API de cátedra (requiere usuario en la tabla docentes) ──────────────────

create or replace function public.docente_secreto(p_sesion text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_docente() then raise exception 'NO_AUTORIZADO' using errcode = '42501'; end if;
  insert into sesion_secretos (sesion_id) values (p_sesion) on conflict do nothing;
  return (select secreto from sesion_secretos where sesion_id = p_sesion);
end $$;

create or replace function public.docente_resumen(p_sesion text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_docente() then raise exception 'NO_AUTORIZADO' using errcode = '42501'; end if;
  return jsonb_build_object(
    'presentes', (select count(*) from asistencias where sesion_id = p_sesion),
    'total', (select count(*) from alumnos where not ficticio),
    'ultimos', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', public._nombre_corto(al.nombre), 'marcadoEn', public._ms(x.marcado_en)) order by x.marcado_en desc)
      from (select * from asistencias where sesion_id = p_sesion order by marcado_en desc limit 8) x
      join alumnos al using (libreta)), '[]'::jsonb)
  );
end $$;

/** Borra lo hecho en la clase de ensayo (presentes y fallos) y la deja cerrada. */
create or replace function public.docente_terminar_ensayo() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.es_docente() then raise exception 'NO_AUTORIZADO' using errcode = '42501'; end if;
  delete from asistencias where sesion_id in (select id from sesiones where ensayo);
  get diagnostics n = row_count;
  delete from fallos where sesion_id in (select id from sesiones where ensayo);
  update sesiones set manual_desde = null, manual_hasta = null, cerrada_en = null where ensayo;
  return n;
end $$;

/** Errores que vieron los alumnos en una clase: los de los últimos minutos y el total, por código. */
create or replace function public.docente_fallos(p_sesion text, p_minutos int default 10) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_docente() then raise exception 'NO_AUTORIZADO' using errcode = '42501'; end if;
  return jsonb_build_object(
    'recientes', coalesce((select jsonb_object_agg(codigo, n) from (select codigo, count(*) n from fallos where sesion_id = p_sesion and en > now() - make_interval(mins => p_minutos) group by codigo) x), '{}'::jsonb),
    'total', coalesce((select jsonb_object_agg(codigo, n) from (select codigo, count(*) n from fallos where sesion_id = p_sesion group by codigo) x), '{}'::jsonb)
  );
end $$;

-- ── Cuentas de la cátedra (sólo administradores) ─────────────────────────────

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from docentes d join auth.users u on lower(u.email) = lower(d.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null and d.rol = 'admin'
  )
$$;

/** ¿Queda algún administrador con cuenta activa además de p_email? (nunca se puede dejar la cátedra sin administrador) */
create or replace function public._otro_admin_activo(p_email text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from docentes d join auth.users u on lower(u.email) = lower(d.email)
    where d.rol = 'admin' and u.email_confirmed_at is not null and lower(d.email) <> lower(p_email)
  )
$$;

/** Corta si quien llama no es administrador; si lo es, devuelve su email. */
create or replace function public._exigir_admin() returns text
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.es_admin() then raise exception 'NO_AUTORIZADO' using errcode = '42501'; end if;
  return (select lower(email) from auth.users where id = auth.uid());
end $$;

/** Cuentas habilitadas (con su estado) y pedidos de acceso: quien creó su cuenta pero todavía no está habilitado. */
create or replace function public.admin_cuentas() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare yo text := public._exigir_admin();
begin
  return jsonb_build_object(
    'yo', yo,
    'cuentas', (select coalesce(jsonb_agg(jsonb_build_object(
        'email', d.email, 'rol', d.rol, 'creada', u.id is not null, 'confirmada', u.email_confirmed_at is not null,
        'ultimoIngreso', public._ms(u.last_sign_in_at), 'agregadoEn', public._ms(d.agregado_en), 'agregadoPor', d.agregado_por
      ) order by d.rol, d.email), '[]'::jsonb)
      from docentes d left join auth.users u on lower(u.email) = lower(d.email)),
    'solicitudes', (select coalesce(jsonb_agg(jsonb_build_object(
        'email', lower(u.email), 'creadaEn', public._ms(u.created_at), 'confirmada', u.email_confirmed_at is not null
      ) order by u.created_at desc), '[]'::jsonb)
      from auth.users u where not exists (select 1 from docentes d where lower(d.email) = lower(u.email)))
  );
end $$;

/**
 * Habilita un email (también por adelantado, antes de que cree la cuenta) con un rol.
 * p_confirmar: confirma la cuenta sin el correo (sólo si el administrador sabe que la creó esa persona).
 */
create or replace function public.admin_habilitar(p_email text, p_rol text default 'docente', p_confirmar boolean default false) returns void
language plpgsql security definer set search_path = public, auth as $$
declare yo text := public._exigir_admin(); e text := lower(trim(p_email)); n int;
begin
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'EMAIL_INVALIDO'; end if;
  if p_rol not in ('admin', 'docente') then raise exception 'ROL_INVALIDO'; end if;
  if not exists (select 1 from docentes where lower(email) = e) then
    insert into docentes (email, rol, agregado_por) values (e, p_rol, yo);
    insert into auditoria (accion, cuenta, detalle) values ('cuenta_habilitada', e, p_rol);
  end if;
  if p_confirmar then
    update auth.users set email_confirmed_at = now() where lower(email) = e and email_confirmed_at is null;
    get diagnostics n = row_count;
    if n > 0 then insert into auditoria (accion, cuenta) values ('cuenta_confirmada', e); end if;
  end if;
end $$;

create or replace function public.admin_quitar(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare yo text := public._exigir_admin(); e text := lower(trim(p_email));
begin
  if e = yo then raise exception 'NO_A_VOS_MISMO'; end if;
  if (select rol from docentes where lower(email) = e) = 'admin' and not public._otro_admin_activo(e) then
    raise exception 'ULTIMO_ADMIN';
  end if;
  delete from docentes where lower(email) = e;
  if found then insert into auditoria (accion, cuenta) values ('cuenta_quitada', e); end if;
end $$;

create or replace function public.admin_rol(p_email text, p_rol text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare yo text := public._exigir_admin(); e text := lower(trim(p_email));
begin
  if p_rol not in ('admin', 'docente') then raise exception 'ROL_INVALIDO'; end if;
  if p_rol = 'docente' and (select rol from docentes where lower(email) = e) = 'admin' and not public._otro_admin_activo(e) then
    raise exception 'ULTIMO_ADMIN';
  end if;
  update docentes set rol = p_rol where lower(email) = e and rol <> p_rol;
  if found then insert into auditoria (accion, cuenta, detalle) values ('rol_cambiado', e, p_rol); end if;
end $$;

/** Rechaza un pedido de acceso: borra la cuenta creada (la persona puede volver a pedirla). */
create or replace function public.admin_rechazar(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare yo text := public._exigir_admin(); e text := lower(trim(p_email));
begin
  if exists (select 1 from docentes where lower(email) = e) then raise exception 'YA_HABILITADA'; end if;
  delete from auth.users where lower(email) = e;
  if found then insert into auditoria (accion, cuenta) values ('solicitud_rechazada', e); end if;
end $$;

/**
 * Suspende una clase (p_motivo obligatorio) o la reanuda (p_motivo null). Sólo administradores: cambia la
 * regularidad de todo el curso. Al suspenderla se cierra el registro si estaba abierto.
 */
create or replace function public.admin_suspender(p_sesion text, p_motivo text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare yo text := public._exigir_admin(); s sesiones; m text := nullif(left(trim(coalesce(p_motivo, '')), 200), '');
begin
  select * into s from sesiones where id = p_sesion;
  if not found or s.ensayo then raise exception 'SESION_INEXISTENTE'; end if;
  if p_motivo is not null and m is null then raise exception 'FALTA_MOTIVO'; end if;
  if m is not null then
    update sesiones set suspendida = true, motivo_suspension = m, manual_desde = null, manual_hasta = null where id = p_sesion;
    insert into auditoria (accion, sesion_id, detalle) values ('clase_suspendida', p_sesion, m);
  elsif s.suspendida then
    update sesiones set suspendida = false, motivo_suspension = null where id = p_sesion;
    insert into auditoria (accion, sesion_id, detalle) values ('clase_reanudada', p_sesion, s.motivo_suspension);
  end if;
end $$;

-- Las funciones internas no se exponen por la API, y las de cátedra no las ejecuta el anónimo
-- (Postgres concede EXECUTE a PUBLIC por defecto: se revoca y se concede explícitamente abajo).
revoke execute on function
  public._contador(), public._totp(text, bigint), public._hmac_hex(text, text), public._clave_poster(text, text),
  public._firma_pase(text, text, bigint, text), public._validar_pase(text, text), public._fallo(text, text, text), public._es_ensayo(text), public._exigir_admin(), public._otro_admin_activo(text),
  public._bloqueado(), public._ip(), public._ms(timestamptz), public._abre(public.sesiones),
  public._cierra(public.sesiones), public._estado(public.sesiones), public._nombre_corto(text), public._progreso(text, text)
from public, anon, authenticated;
revoke execute on function public.docente_secreto(text), public.docente_resumen(text), public.es_docente(),
  public.docente_terminar_ensayo(), public.docente_fallos(text, int),
  public.es_admin(), public.admin_cuentas(), public.admin_habilitar(text, text, boolean), public.admin_quitar(text),
  public.admin_rol(text, text), public.admin_rechazar(text), public.admin_suspender(text, text)
from public, anon;

grant execute on function public.hora_servidor(), public.abrir_pase(text, text), public.identificar(text, text, text, text), public.mi_asistencia(text, text),
  public.marcar_presente(text, text, text, text, jsonb, text, bigint, double precision, double precision, double precision)
to anon, authenticated;
grant execute on function public.docente_secreto(text), public.docente_resumen(text), public.es_docente(),
  public.docente_terminar_ensayo(), public.docente_fallos(text, int),
  public.es_admin(), public.admin_cuentas(), public.admin_habilitar(text, text, boolean), public.admin_quitar(text),
  public.admin_rol(text, text), public.admin_rechazar(text), public.admin_suspender(text, text) to authenticated;

-- ── Auditoría: quién cargó, quitó o cambió presentes y quién liberó celulares ──
-- Los presentes por QR no se registran acá (ya tienen hora, método y huella en asistencias): sólo lo manual.

create table if not exists public.auditoria (
  id        bigint generated always as identity primary key,
  en        timestamptz not null default now(),
  por       text default (auth.jwt() ->> 'email'),
  accion    text not null,
  sesion_id text,
  libreta   text,
  detalle   text,
  previo    jsonb
);
create index if not exists idx_auditoria_en on public.auditoria (en desc);
-- Cambios de cuentas de la cátedra: van con el email en «cuenta» (libreta vacía).
alter table public.auditoria add column if not exists cuenta text;
alter table public.auditoria alter column libreta drop not null;
alter table public.auditoria drop constraint if exists auditoria_accion_check;
alter table public.auditoria add constraint auditoria_accion_check check (accion in (
  'presente_manual', 'presente_quitado', 'presente_cambiado', 'celular_liberado',
  'cuenta_habilitada', 'cuenta_confirmada', 'cuenta_quitada', 'rol_cambiado', 'solicitud_rechazada', 'cuenta_creada', 'clave_cambiada',
  'clase_suspendida', 'clase_reanudada'));
alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;
drop policy if exists auditoria_docente on public.auditoria;
create policy auditoria_docente on public.auditoria for select using (public.es_docente());

create or replace function public._auditar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'dispositivos' then
    insert into auditoria (accion, libreta, previo) values ('celular_liberado', old.libreta, jsonb_build_object('desde', old.creado_en));
    return old;
  end if;
  -- Lo que pasa en la clase de ensayo no deja rastro.
  if tg_op = 'DELETE' then
    if public._es_ensayo(old.sesion_id) then return old; end if;
  elsif public._es_ensayo(new.sesion_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.metodo = 'manual' then
      insert into auditoria (accion, sesion_id, libreta, detalle) values ('presente_manual', new.sesion_id, new.libreta, new.motivo);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into auditoria (accion, sesion_id, libreta, detalle, previo)
    values ('presente_quitado', old.sesion_id, old.libreta, old.motivo, to_jsonb(old) - 'firma' - 'ip');
    return old;
  else
    insert into auditoria (accion, sesion_id, libreta, detalle, previo)
    values ('presente_cambiado', new.sesion_id, new.libreta, new.motivo, to_jsonb(old) - 'firma' - 'ip');
    return new;
  end if;
end $$;

drop trigger if exists trg_auditar_asistencias on public.asistencias;
create trigger trg_auditar_asistencias after insert or update or delete on public.asistencias
  for each row execute function public._auditar();
drop trigger if exists trg_auditar_dispositivos on public.dispositivos;
create trigger trg_auditar_dispositivos after delete on public.dispositivos
  for each row execute function public._auditar();
revoke execute on function public._auditar() from public, anon, authenticated;

-- ── Elena (asistente de la app): cupo de uso para acotar el costo del modelo ──
-- La función de Vercel /api/elena la consulta antes de cada respuesta. Se guarda la IP con hash, nunca en claro.

create table if not exists public.elena_uso (
  ip_hash text not null,
  en      timestamptz not null default now()
);
create index if not exists idx_elena_uso on public.elena_uso (ip_hash, en desc);
alter table public.elena_uso enable row level security;
revoke all on public.elena_uso from anon, authenticated;

create or replace function public.elena_cupo(p_ip text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text := encode(digest(coalesce(p_ip, ''), 'sha256'), 'hex');
begin
  -- 20 preguntas cada 10 min por IP y 1.500 por día en total
  if (select count(*) from elena_uso where en > now() - interval '1 day') >= 1500 then return false; end if;
  if (select count(*) from elena_uso where ip_hash = h and en > now() - interval '10 minutes') >= 20 then return false; end if;
  insert into elena_uso (ip_hash) values (h);
  delete from elena_uso where en < now() - interval '2 days';
  return true;
end $$;
revoke execute on function public.elena_cupo(text) from public;
grant execute on function public.elena_cupo(text) to anon, authenticated;

-- ── Clase de ensayo y DNIs de prueba (1.000.001 a 1.000.005) ──
insert into public.sesiones (id, n, fecha, titulo, ensayo) values ('ensayo', 0, '2026-01-01', 'Clase de ensayo', true)
  on conflict (id) do update set ensayo = true;
insert into public.sesion_secretos (sesion_id) values ('ensayo') on conflict do nothing;
insert into public.alumnos (libreta, nombre, dni, folio, orden, ficticio) values
  ('ENSAYO01', 'Ensayo, Alumno Uno', '1000001', null, null, true),
  ('ENSAYO02', 'Ensayo, Alumna Dos', '1000002', null, null, true),
  ('ENSAYO03', 'Ensayo, Alumno Tres', '1000003', null, null, true),
  ('ENSAYO04', 'Ensayo, Alumna Cuatro', '1000004', null, null, true),
  ('ENSAYO05', 'Ensayo, Alumno Cinco', '1000005', null, null, true)
  on conflict (libreta) do update set ficticio = true;

-- Tiempo real para el contador del proyector.
do $$ begin
  alter publication supabase_realtime add table public.asistencias;
exception when others then null; -- ya agregada, o proyecto sin Realtime
end $$;
