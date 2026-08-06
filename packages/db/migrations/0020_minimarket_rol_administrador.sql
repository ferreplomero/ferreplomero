-- =============================================================================
-- 0020 · Rol operativo "administrador" (segundo al mando, distinto del dueño)
-- Plan §6.9: los 4 roles operativos son propietario, administrador, cajero y
-- almacén. El enum solo tenía dueno/cajero/almacen; falta administrador.
-- =============================================================================
alter type public.mm_rol_operativo add value if not exists 'administrador';
