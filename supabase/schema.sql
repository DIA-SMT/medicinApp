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

-- ── RLS: el anónimo sólo lee el calendario; el resto pasa por funciones ─────

alter table public.alumnos           enable row level security;
alter table public.sesiones          enable row level security;
alter table public.sesion_secretos   enable row level security;
alter table public.dispositivos      enable row level security;
alter table public.asistencias       enable row level security;
alter table public.docentes          enable row level security;
alter table public.ajustes           enable row level security;
alter table public.intentos_fallidos enable row level security;

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
  public.docentes, public.ajustes, public.intentos_fallidos from anon, authenticated;

grant select on public.sesiones, public.ajustes to anon, authenticated;
grant update on public.sesiones to authenticated;
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

create or replace function public._fallo(codigo text, detalle text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if codigo in ('CODIGO_INVALIDO', 'DNI_DESCONOCIDO', 'FIRMA_INVALIDA') then
    insert into intentos_fallidos (ip) values (public._ip());
    delete from intentos_fallidos where en < now() - interval '10 minutes';
  end if;
  return jsonb_build_object('ok', false, 'error', codigo, 'detalle', detalle);
end $$;

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
  if not found then return public._fallo('SESION_INEXISTENTE'); end if;
  if public._estado(s) = 'programada' then return public._fallo('PROGRAMADA', public._ms(public._abre(s))::text); end if;
  if public._estado(s) = 'cerrada' then return public._fallo('CERRADA', public._ms(public._cierra(s))::text); end if;

  select secreto into sec from sesion_secretos where sesion_id = p_sesion;
  c := public._contador();
  if p_codigo ~ '^\d{6}$' then
    if p_codigo in (public._totp(sec, c - 1), public._totp(sec, c), public._totp(sec, c + 1)) then m := 'q'; end if;
  elsif upper(p_codigo) = public._clave_poster(sec, p_sesion) then
    m := 'p';
  end if;
  if m is null then return public._fallo('CODIGO_INVALIDO'); end if;

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
  if v is null then return public._fallo('CODIGO_INVALIDO'); end if;
  if v = 'vencido' then return public._fallo('PASE_VENCIDO'); end if;
  select * into a from alumnos where dni = regexp_replace(p_dni, '\D', '', 'g');
  if not found then return public._fallo('DNI_DESCONOCIDO'); end if;
  select libreta into ocupado from dispositivos where huella = p_huella;
  if ocupado is not null and ocupado <> a.libreta then return public._fallo('DISPOSITIVO_OCUPADO'); end if;
  select huella into propio from dispositivos where libreta = a.libreta;
  return jsonb_build_object(
    'ok', true,
    'nombre', public._nombre_corto(a.nombre),
    'libreta', left(a.libreta, 4) || '•••' || right(a.libreta, 2),
    'vinculo', case when propio is null then 'libre' when propio = p_huella then 'este' else 'otro' end
  );
end $$;

/** Progreso del alumno hacia la regularidad, con la misma regla que el panel: cuentan las clases ya
    dictadas en las que se tomó asistencia (y la que se está dictando, aunque el docente la haya abierto otro día);
    "restantes" son las de hoy en adelante que todavía no. */
create or replace function public._progreso(p_libreta text, p_sesion text) returns jsonb
language sql stable set search_path = public as $$
  with hoy as (select (now() at time zone 'America/Argentina/Tucuman')::date d),
  dictadas as (
    select distinct a.sesion_id from asistencias a join sesiones s on s.id = a.sesion_id, hoy where s.fecha <= hoy.d or s.id = p_sesion
  )
  select jsonb_build_object(
    'presentes', (select count(*) from dictadas d where exists (select 1 from asistencias x where x.sesion_id = d.sesion_id and x.libreta = p_libreta)),
    'dictadas', (select count(*) from dictadas),
    'restantes', (select count(*) from sesiones s, hoy where s.fecha >= hoy.d and s.id not in (select sesion_id from dictadas))
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
  if v is null then return public._fallo('CODIGO_INVALIDO'); end if;
  if v = 'vencido' then return public._fallo('PASE_VENCIDO'); end if;

  select * into a from alumnos where dni = regexp_replace(p_dni, '\D', '', 'g');
  if not found then return public._fallo('DNI_DESCONOCIDO'); end if;

  -- La huella tiene que ser la de la clave pública presentada; el timestamp, reciente.
  if p_huella <> encode(digest((p_public_jwk ->> 'x') || '.' || (p_public_jwk ->> 'y'), 'sha256'), 'hex')
     or p_firma is null or abs(public._ms(now()) - p_ts) > 300000 then
    return public._fallo('FIRMA_INVALIDA');
  end if;

  select libreta into ocupado from dispositivos where huella = p_huella;
  if ocupado is not null and ocupado <> a.libreta then return public._fallo('DISPOSITIVO_OCUPADO'); end if;
  select huella into propio from dispositivos where libreta = a.libreta;
  if propio is not null and propio <> p_huella then return public._fallo('DISPOSITIVO_AJENO'); end if;

  select * into aj from ajustes limit 1;
  if p_lat is not null and p_lng is not null then
    dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(aj.sede_lat - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(aj.sede_lat)) * power(sin(radians(aj.sede_lng - p_lng) / 2), 2)));
  end if;
  if aj.geo_modo = 'exigir' and (dist is null or dist > aj.radio_m) then
    return public._fallo('FUERA_DE_RANGO', coalesce(round(dist)::text, ''));
  end if;

  if propio is null then
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
        -- dictada = ya pasó y se tomó asistencia (misma regla que el panel)
        'dictada', s.fecha <= hoy and exists (select 1 from asistencias t where t.sesion_id = s.id),
        'marca', x.metodo
      ) order by s.fecha)
      from sesiones s left join asistencias x on x.sesion_id = s.id and x.libreta = a.libreta
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
    'total', (select count(*) from alumnos),
    'ultimos', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', public._nombre_corto(al.nombre), 'marcadoEn', public._ms(x.marcado_en)) order by x.marcado_en desc)
      from (select * from asistencias where sesion_id = p_sesion order by marcado_en desc limit 8) x
      join alumnos al using (libreta)), '[]'::jsonb)
  );
end $$;

-- Las funciones internas no se exponen por la API, y las de cátedra no las ejecuta el anónimo
-- (Postgres concede EXECUTE a PUBLIC por defecto: se revoca y se concede explícitamente abajo).
revoke execute on function
  public._contador(), public._totp(text, bigint), public._hmac_hex(text, text), public._clave_poster(text, text),
  public._firma_pase(text, text, bigint, text), public._validar_pase(text, text), public._fallo(text, text),
  public._bloqueado(), public._ip(), public._ms(timestamptz), public._abre(public.sesiones),
  public._cierra(public.sesiones), public._estado(public.sesiones), public._nombre_corto(text), public._progreso(text, text)
from public, anon, authenticated;
revoke execute on function public.docente_secreto(text), public.docente_resumen(text), public.es_docente()
from public, anon;

grant execute on function public.hora_servidor(), public.abrir_pase(text, text), public.identificar(text, text, text, text), public.mi_asistencia(text, text),
  public.marcar_presente(text, text, text, text, jsonb, text, bigint, double precision, double precision, double precision)
to anon, authenticated;
grant execute on function public.docente_secreto(text), public.docente_resumen(text), public.es_docente() to authenticated;

-- ── Auditoría: quién cargó, quitó o cambió presentes y quién liberó celulares ──
-- Los presentes por QR no se registran acá (ya tienen hora, método y huella en asistencias): sólo lo manual.

create table if not exists public.auditoria (
  id        bigint generated always as identity primary key,
  en        timestamptz not null default now(),
  por       text default (auth.jwt() ->> 'email'),
  accion    text not null check (accion in ('presente_manual', 'presente_quitado', 'presente_cambiado', 'celular_liberado')),
  sesion_id text,
  libreta   text not null,
  detalle   text,
  previo    jsonb
);
create index if not exists idx_auditoria_en on public.auditoria (en desc);
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

-- Tiempo real para el contador del proyector.
do $$ begin
  alter publication supabase_realtime add table public.asistencias;
exception when others then null; -- ya agregada, o proyecto sin Realtime
end $$;
