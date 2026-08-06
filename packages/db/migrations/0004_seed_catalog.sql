-- =============================================================================
-- 0004 · Semilla del catálogo (datos reales, sin placeholders)
-- Idempotente: se puede ejecutar varias veces sin duplicar.
-- =============================================================================

-- --- Productos (SaaS verticales) ----------------------------------------------
insert into public.products (slug, name, tagline, description, category, icon, accent_color, status, sort_order)
values
  (
    'minimarket',
    'Minimarket',
    'Punto de venta e inventario para abastos y bodegas.',
    'Cobra rápido, controla el inventario en tiempo real, gestiona el fiado de tus clientes y trabaja sin conexión cuando se va la luz. Pensado para minimarkets, abastos y bodegas en Venezuela.',
    'Comercio',
    'store',
    '#4E9E91',
    'disponible',
    1
  ),
  (
    'tecnico',
    'Servicio Técnico',
    'Órdenes de reparación y seguimiento de equipos.',
    'Registra equipos, genera órdenes de servicio, notifica al cliente por WhatsApp cuando su reparación está lista y lleva el control de repuestos y garantías.',
    'Servicios',
    'wrench',
    '#3F7CAC',
    'proximamente',
    2
  ),
  (
    'medico',
    'Consultorio Médico',
    'Agenda, historias clínicas y recordatorios.',
    'Administra citas, mantén historias clínicas seguras y reduce las inasistencias con recordatorios automáticos. Cumple con el resguardo de datos de tus pacientes.',
    'Salud',
    'stethoscope',
    '#5B8C7B',
    'proximamente',
    3
  ),
  (
    'bodega',
    'Bodega y Almacén',
    'Control de stock, entradas y despachos.',
    'Gestiona ubicaciones, lotes y vencimientos; controla entradas y despachos y mantén tu inventario cuadrado entre varias sucursales.',
    'Logística',
    'warehouse',
    '#7C6FB0',
    'proximamente',
    4
  )
on conflict (slug) do update set
  name        = excluded.name,
  tagline     = excluded.tagline,
  description = excluded.description,
  category    = excluded.category,
  icon        = excluded.icon,
  accent_color = excluded.accent_color,
  status      = excluded.status,
  sort_order  = excluded.sort_order;
