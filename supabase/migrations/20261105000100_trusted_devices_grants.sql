-- La Edge Function (service role) no podía leer ni escribir trusted_devices / trusted_sessions:
-- las tablas se crearon sin GRANT explícito para service_role. La service role omite RLS,
-- pero sigue necesitando permisos de tabla. Los clientes (anon/authenticated) siguen sin acceso.
grant select, insert, update, delete on public.trusted_devices to service_role;
grant select, insert, update, delete on public.trusted_sessions to service_role;
grant insert on public.admin_audit_log to service_role;

-- Recarga la caché de esquema de la API REST por si aún no conocía las tablas nuevas.
notify pgrst, 'reload schema';
