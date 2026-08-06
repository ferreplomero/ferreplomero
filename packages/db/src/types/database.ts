/**
 * Tipos del esquema `public` de Supabase.
 *
 * Mantenidos a mano para la Fase 0 y alineados con las migraciones SQL.
 * Para regenerarlos contra el proyecto real cuando haya credenciales:
 *   pnpm db:types
 * (equivale a `supabase gen types typescript --project-id <id> --schema public`).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MembershipRole = "propietario" | "administrador" | "colaborador";
export type ProductStatus = "disponible" | "proximamente";
export type PlanInterval = "mensual" | "anual";
export type SubscriptionStatus = "prueba" | "activa" | "morosa" | "pausada" | "cancelada";
export type EntitlementStatus = "activo" | "suspendido" | "cancelado";
export type CountryCode = "VE" | "CO";
/** Estado de una solicitud de pago (comprobante del Plan Mensual, revisión manual). */
export type PaymentRequestStatus = "pendiente" | "aprobado" | "rechazado";
/** Tipo de un aviso publicado por el admin (colorea la tarjeta en el tablero). */
export type PlatformAvisoTipo = "informativo" | "mejora" | "mantenimiento" | "importante";

// --- Enums del vertical Minimarket (prefijo mm_) ------------------------------
/** Modulo del vertical sobre el que aplican los permisos de un rol (mm_permisos_rol.modulo, CHECK, no enum de Postgres). */
export type MmModulo =
  | "ventas"
  | "inventario"
  | "compras"
  | "proveedores"
  | "clientes"
  | "fiado"
  | "caja"
  | "tasa"
  | "reportes"
  | "finanzas"
  | "facturacion"
  | "configuracion"
  | "personal"
  | "deudas"
  | "bancos"
  | "presupuestos";
export type MmMovTipo = "entrada" | "salida" | "ajuste" | "merma";
export type MmCompraEstado = "borrador" | "recibida" | "anulada";
export type MmDocTipo = "recibo" | "fiscal";
export type MmVentaEstado = "completada" | "anulada";
export type MmMetodoPago =
  | "efectivo_bs"
  | "efectivo_usd"
  | "pago_movil"
  | "transferencia"
  | "zelle"
  | "tarjeta"
  | "fiado"
  | "cashea"
  | "credito_cliente"
  | "credito_proveedor";
export type MmCreditoClienteTipo = "otorgado" | "usado";
export type MmCajaEstado = "abierta" | "cerrada";
export type MmCajaMovTipo = "ingreso" | "egreso" | "retiro" | "venta";
export type MmTasaFuente = "auto" | "manual";
/** Cuál de las 3 tasas en paralelo es la fila (columna `tipo`, texto con CHECK, no enum de Postgres). */
export type MmTipoTasa = "bcv" | "euro" | "manual";
export type MmFiadoEstado = "abierto" | "pagado" | "anulado";
export type MmTipoVenta = "unidad" | "granel";
/** Estado de una deuda del dueno/negocio ("vencida" se calcula en la app, no se guarda). */
export type MmDeudaEstado = "pendiente" | "pagada";
/** Estado de un presupuesto ("vencido" se calcula en la app, no se guarda). */
export type MmPresupuestoEstado = "pendiente" | "convertido" | "rechazado";
export type MmGastoCategoria =
  "alquiler" | "servicios" | "sueldos" | "mantenimiento" | "impuestos_permisos" | "otros";
export type MmLimpiezaPruebaDecision = "borrado" | "conservado";

// --- Enums del vertical Servicio Técnico (prefijo st_) -----------------------
export type StOrdenEstado =
  | "recibido"
  | "diagnostico"
  | "presupuestado"
  | "en_reparacion"
  | "listo"
  | "entregado"
  | "cancelado";
export type StTipoEquipo =
  | "smartphone"
  | "tablet"
  | "laptop"
  | "pc_escritorio"
  | "consola"
  | "impresora"
  | "television"
  | "otro";
export type StLineaTipo = "diagnostico" | "mano_de_obra" | "repuesto" | "otro";
export type StMetodoPago =
  "efectivo_bs" | "efectivo_usd" | "pago_movil" | "transferencia" | "zelle" | "tarjeta";
export type StTasaFuente = "auto" | "manual";

// --- Enums del vertical Condominio (prefijo cnd_) -----------------------------
export type CndTipoCondominio = "edificio" | "conjunto_residencial" | "centro_comercial";
export type CndMetodoReparto = "alicuota" | "m2" | "partes_iguales" | "cuota_fija";
export type CndTipoUnidad = "apartamento" | "casa" | "local_comercial" | "oficina" | "deposito";
export type CndGastoCategoria =
  | "mantenimiento"
  | "limpieza"
  | "seguridad"
  | "nomina"
  | "servicios"
  | "administracion"
  | "seguros"
  | "otros";
export type CndMetodoPago =
  "efectivo_bs" | "efectivo_usd" | "pago_movil" | "transferencia" | "zelle" | "tarjeta";
export type CndTasaFuente = "auto" | "manual";
export type CndTipoDocumento = "acta_asamblea" | "reglamento_interno" | "otro";
export type CndTipoIdentificacion = "persona" | "negocio";
export type CndEstadoReportePago = "pendiente" | "confirmado" | "rechazado";
export type CndEstadoGastoEspecial = "pendiente" | "aplicado";
export type CndModoGastoEspecial = "redistribuir" | "fondo";
export type CndFondoTipo = "entrada" | "salida";
export type CndFondoOrigen = "excedente_mensual" | "gasto_especial_adelanto" | "reposicion";
export type CndRepartoEstado = "vigente" | "modificado" | "anterior";
export type CndRepartoAjusteTipo =
  "gasto_comun_adicional" | "gasto_especial_adicional" | "correccion_manual";
export type CndRepartoAjusteEfecto = "cargo" | "credito";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          whatsapp: string | null;
          is_super_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          whatsapp?: string | null;
          is_super_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          whatsapp?: string | null;
          is_super_admin?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          country: CountryCode;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          country?: CountryCode;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          country?: CountryCode;
          updated_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          tenant_id: string;
          profile_id: string;
          role: MembershipRole;
          created_at: string;
          onboarding_minimarket_completado_en: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          profile_id: string;
          role?: MembershipRole;
          created_at?: string;
          onboarding_minimarket_completado_en?: string | null;
        };
        Update: {
          role?: MembershipRole;
          onboarding_minimarket_completado_en?: string | null;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          slug: string;
          name: string;
          tagline: string;
          description: string;
          category: string;
          icon: string;
          accent_color: string;
          status: ProductStatus;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          tagline: string;
          description: string;
          category: string;
          icon?: string;
          accent_color?: string;
          status?: ProductStatus;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          name?: string;
          tagline?: string;
          description?: string;
          category?: string;
          icon?: string;
          accent_color?: string;
          status?: ProductStatus;
          sort_order?: number;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          product_id: string;
          slug: string;
          name: string;
          description: string;
          price_cents: number;
          currency: string;
          interval: PlanInterval;
          features_json: Json;
          is_featured: boolean;
          sort_order: number;
          duration_days: number;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          slug: string;
          name: string;
          description?: string;
          price_cents?: number;
          currency?: string;
          interval?: PlanInterval;
          features_json?: Json;
          is_featured?: boolean;
          sort_order?: number;
          duration_days?: number;
          activo?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          description?: string;
          price_cents?: number;
          currency?: string;
          interval?: PlanInterval;
          features_json?: Json;
          is_featured?: boolean;
          sort_order?: number;
          duration_days?: number;
          activo?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "plans_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          plan_id: string;
          status: SubscriptionStatus;
          current_period_start: string;
          current_period_end: string | null;
          provider: string;
          provider_subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          plan_id: string;
          status?: SubscriptionStatus;
          current_period_start?: string;
          current_period_end?: string | null;
          provider?: string;
          provider_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: SubscriptionStatus;
          current_period_end?: string | null;
          provider?: string;
          provider_subscription_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      entitlements: {
        Row: {
          id: string;
          tenant_id: string;
          product_id: string;
          plan_id: string | null;
          status: EntitlementStatus;
          source: string;
          granted_at: string;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          product_id: string;
          plan_id?: string | null;
          status?: EntitlementStatus;
          source?: string;
          granted_at?: string;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          plan_id?: string | null;
          status?: EntitlementStatus;
          source?: string;
          expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entitlements_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entitlements_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_methods: {
        Row: {
          id: string;
          key: string;
          label: string;
          datos: Json;
          activo: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          label: string;
          datos?: Json;
          activo?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          label?: string;
          datos?: Json;
          activo?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_requests: {
        Row: {
          id: string;
          tenant_id: string;
          product_id: string;
          plan_id: string | null;
          metodo_id: string | null;
          metodo_key: string;
          monto_usd: number;
          monto_bs: number;
          tasa_usada: number;
          comprobante_path: string;
          estado: PaymentRequestStatus;
          nota_admin: string | null;
          revisado_at: string | null;
          revisado_por: string | null;
          creado_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          product_id: string;
          plan_id?: string | null;
          metodo_id?: string | null;
          metodo_key: string;
          monto_usd: number;
          monto_bs: number;
          tasa_usada: number;
          comprobante_path: string;
          estado?: PaymentRequestStatus;
          nota_admin?: string | null;
          revisado_at?: string | null;
          revisado_por?: string | null;
          creado_por?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          estado?: PaymentRequestStatus;
          nota_admin?: string | null;
          revisado_at?: string | null;
          revisado_por?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_requests_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_requests_metodo_id_fkey";
            columns: ["metodo_id"];
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_requests_plan_id_fkey";
            columns: ["plan_id"];
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_audit_log: {
        Row: {
          id: string;
          admin_id: string | null;
          accion: string;
          objetivo_tipo: string;
          objetivo_id: string | null;
          detalle: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          accion: string;
          objetivo_tipo: string;
          objetivo_id?: string | null;
          detalle?: Json;
          created_at?: string;
        };
        Update: {
          detalle?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey";
            columns: ["admin_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_respaldo_limpieza_prueba: {
        Row: {
          id: string;
          tenant_id: string;
          admin_id: string | null;
          resumen: Json;
          snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          admin_id?: string | null;
          resumen?: Json;
          snapshot?: Json;
          created_at?: string;
        };
        Update: {
          resumen?: Json;
          snapshot?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "admin_respaldo_limpieza_prueba_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_respaldo_limpieza_prueba_admin_id_fkey";
            columns: ["admin_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_respaldo_eliminacion_cliente: {
        Row: {
          id: string;
          tenant_id: string;
          admin_id: string | null;
          tenant_nombre: string;
          tenant_slug: string;
          owner_email: string | null;
          resumen: Json;
          snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          admin_id?: string | null;
          tenant_nombre: string;
          tenant_slug: string;
          owner_email?: string | null;
          resumen?: Json;
          snapshot?: Json;
          created_at?: string;
        };
        Update: {
          resumen?: Json;
          snapshot?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "admin_respaldo_eliminacion_cliente_admin_id_fkey";
            columns: ["admin_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_avisos: {
        Row: {
          id: string;
          producto_slug: string;
          titulo: string;
          mensaje_corto: string;
          contenido: string;
          tipo: PlatformAvisoTipo;
          activo: boolean;
          vence_at: string;
          creado_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          producto_slug: string;
          titulo: string;
          mensaje_corto: string;
          contenido: string;
          tipo?: PlatformAvisoTipo;
          activo?: boolean;
          vence_at: string;
          creado_por?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          titulo?: string;
          mensaje_corto?: string;
          contenido?: string;
          tipo?: PlatformAvisoTipo;
          activo?: boolean;
          vence_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_avisos_producto_slug_fkey";
            columns: ["producto_slug"];
            referencedRelation: "products";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "platform_avisos_creado_por_fkey";
            columns: ["creado_por"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_avisos_descartados: {
        Row: {
          id: string;
          aviso_id: string;
          profile_id: string;
          descartado_at: string;
        };
        Insert: {
          id?: string;
          aviso_id: string;
          profile_id: string;
          descartado_at?: string;
        };
        Update: {
          descartado_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_avisos_descartados_aviso_id_fkey";
            columns: ["aviso_id"];
            referencedRelation: "platform_avisos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_avisos_descartados_profile_id_fkey";
            columns: ["profile_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_settings: {
        Row: {
          id: boolean;
          timezone: string;
          nombre_plataforma: string;
          soporte_email: string;
          soporte_telefono: string;
          soporte_whatsapp: string;
          plan_mensual_usd: number;
          plan_mensual_dias: number;
          demo_horas: number;
          tasa_preferida: string;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          timezone?: string;
          nombre_plataforma?: string;
          soporte_email?: string;
          soporte_telefono?: string;
          soporte_whatsapp?: string;
          plan_mensual_usd?: number;
          plan_mensual_dias?: number;
          demo_horas?: number;
          tasa_preferida?: string;
          updated_at?: string;
        };
        Update: {
          timezone?: string;
          nombre_plataforma?: string;
          soporte_email?: string;
          soporte_telefono?: string;
          soporte_whatsapp?: string;
          plan_mensual_usd?: number;
          plan_mensual_dias?: number;
          demo_horas?: number;
          tasa_preferida?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_tasas_cambio: {
        Row: {
          id: string;
          valor: number;
          fuente: string;
          tipo: string;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          valor: number;
          fuente: string;
          tipo: string;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      gastos_plataforma: {
        Row: {
          id: string;
          concepto: string;
          categoria: string;
          monto_usd: number;
          fecha: string;
          notas: string | null;
          creado_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          concepto: string;
          categoria?: string;
          monto_usd: number;
          fecha?: string;
          notas?: string | null;
          creado_por?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          concepto?: string;
          categoria?: string;
          monto_usd?: number;
          fecha?: string;
          notas?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      mm_sucursales: {
        Row: {
          id: string;
          tenant_id: string;
          nombre: string;
          direccion: string | null;
          telefono: string | null;
          activa: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          nombre: string;
          direccion?: string | null;
          telefono?: string | null;
          activa?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          nombre?: string;
          direccion?: string | null;
          telefono?: string | null;
          activa?: boolean;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_usuarios_sucursal: {
        Row: {
          id: string;
          tenant_id: string;
          profile_id: string;
          sucursal_id: string;
          rol_id: string;
          activo: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          profile_id: string;
          sucursal_id: string;
          rol_id: string;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          sucursal_id?: string;
          rol_id?: string;
          activo?: boolean;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_roles: {
        Row: {
          id: string;
          tenant_id: string | null;
          slug: string;
          nombre: string;
          es_sistema: boolean;
          descripcion: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          slug: string;
          nombre: string;
          es_sistema?: boolean;
          descripcion?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          nombre?: string;
          descripcion?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      mm_permisos_rol: {
        Row: {
          id: string;
          rol_id: string;
          modulo: MmModulo;
          ver: boolean;
          crear: boolean;
          editar: boolean;
          eliminar: boolean;
        };
        Insert: {
          id?: string;
          rol_id: string;
          modulo: MmModulo;
          ver?: boolean;
          crear?: boolean;
          editar?: boolean;
          eliminar?: boolean;
        };
        Update: {
          ver?: boolean;
          crear?: boolean;
          editar?: boolean;
          eliminar?: boolean;
        };
        Relationships: [];
      };
      mm_config_negocio: {
        Row: {
          id: string;
          tenant_id: string;
          nombre_comercial: string;
          rif: string | null;
          direccion: string | null;
          logo_url: string | null;
          datos_fiscales: Json;
          fuente_tasa: string;
          metodos_pago: Json;
          parametros: Json;
          tipo_negocio: string | null;
          datos_completados_en: string | null;
          aviso_caja_visto: boolean;
          aviso_fiscal_visto: boolean;
          aviso_pagos_visto: boolean;
          limpieza_prueba_pendiente_desde: string | null;
          limpieza_prueba_decidida_en: string | null;
          limpieza_prueba_decision: MmLimpiezaPruebaDecision | null;
          medios_saldos_completados_en: string | null;
          medios_saldos_aviso_visto_en: string | null;
          medios_saldos_es_legado: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          nombre_comercial?: string;
          rif?: string | null;
          direccion?: string | null;
          logo_url?: string | null;
          datos_fiscales?: Json;
          fuente_tasa?: string;
          metodos_pago?: Json;
          parametros?: Json;
          tipo_negocio?: string | null;
          datos_completados_en?: string | null;
          aviso_caja_visto?: boolean;
          aviso_fiscal_visto?: boolean;
          aviso_pagos_visto?: boolean;
          limpieza_prueba_pendiente_desde?: string | null;
          limpieza_prueba_decidida_en?: string | null;
          limpieza_prueba_decision?: MmLimpiezaPruebaDecision | null;
          medios_saldos_completados_en?: string | null;
          medios_saldos_aviso_visto_en?: string | null;
          medios_saldos_es_legado?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          nombre_comercial?: string;
          rif?: string | null;
          direccion?: string | null;
          logo_url?: string | null;
          datos_fiscales?: Json;
          fuente_tasa?: string;
          metodos_pago?: Json;
          parametros?: Json;
          tipo_negocio?: string | null;
          datos_completados_en?: string | null;
          aviso_caja_visto?: boolean;
          aviso_fiscal_visto?: boolean;
          aviso_pagos_visto?: boolean;
          limpieza_prueba_pendiente_desde?: string | null;
          limpieza_prueba_decidida_en?: string | null;
          limpieza_prueba_decision?: MmLimpiezaPruebaDecision | null;
          medios_saldos_completados_en?: string | null;
          medios_saldos_aviso_visto_en?: string | null;
          medios_saldos_es_legado?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      mm_categorias: {
        Row: {
          id: string;
          tenant_id: string;
          nombre: string;
          orden: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          nombre: string;
          orden?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          nombre?: string;
          orden?: number;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_productos: {
        Row: {
          id: string;
          tenant_id: string;
          codigo: string | null;
          codigo_barras: string | null;
          nombre: string;
          categoria_id: string | null;
          tipo_venta: MmTipoVenta;
          unidad: string;
          costo_usd: number;
          precio_usd: number;
          impuesto_id: string;
          aplica_igtf: boolean;
          proveedor_id: string | null;
          etiquetas: string[];
          imagen_url: string | null;
          activo: boolean;
          usa_margen_global: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          codigo?: string | null;
          codigo_barras?: string | null;
          nombre: string;
          categoria_id?: string | null;
          tipo_venta?: MmTipoVenta;
          unidad?: string;
          costo_usd?: number;
          precio_usd?: number;
          impuesto_id?: string;
          aplica_igtf?: boolean;
          proveedor_id?: string | null;
          etiquetas?: string[];
          imagen_url?: string | null;
          activo?: boolean;
          usa_margen_global?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          codigo?: string | null;
          codigo_barras?: string | null;
          nombre?: string;
          categoria_id?: string | null;
          tipo_venta?: MmTipoVenta;
          unidad?: string;
          costo_usd?: number;
          precio_usd?: number;
          impuesto_id?: string;
          aplica_igtf?: boolean;
          proveedor_id?: string | null;
          etiquetas?: string[];
          imagen_url?: string | null;
          activo?: boolean;
          usa_margen_global?: boolean;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_producto_codigos: {
        Row: {
          id: string;
          tenant_id: string;
          producto_id: string;
          codigo: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          producto_id: string;
          codigo: string;
          created_at?: string;
        };
        Update: {
          codigo?: string;
        };
        Relationships: [];
      };
      mm_precios: {
        Row: {
          id: string;
          tenant_id: string;
          producto_id: string;
          precio_usd: number;
          vigente_desde: string;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          producto_id: string;
          precio_usd: number;
          vigente_desde?: string;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      mm_inventario: {
        Row: {
          id: string;
          tenant_id: string;
          producto_id: string;
          sucursal_id: string;
          stock_minimo: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          producto_id: string;
          sucursal_id: string;
          stock_minimo?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          stock_minimo?: number;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_movimientos_inventario: {
        Row: {
          id: string;
          tenant_id: string;
          producto_id: string;
          sucursal_id: string;
          tipo: MmMovTipo;
          cantidad: number;
          motivo: string | null;
          referencia: string | null;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          producto_id: string;
          sucursal_id: string;
          tipo: MmMovTipo;
          cantidad: number;
          motivo?: string | null;
          referencia?: string | null;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      mm_proveedores: {
        Row: {
          id: string;
          tenant_id: string;
          nombre: string;
          contacto: string | null;
          telefono: string | null;
          whatsapp: string | null;
          notas: string | null;
          activo: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          nombre: string;
          contacto?: string | null;
          telefono?: string | null;
          whatsapp?: string | null;
          notas?: string | null;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          nombre?: string;
          contacto?: string | null;
          telefono?: string | null;
          whatsapp?: string | null;
          notas?: string | null;
          activo?: boolean;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_compras: {
        Row: {
          id: string;
          tenant_id: string;
          proveedor_id: string | null;
          sucursal_id: string;
          fecha: string;
          total_usd: number;
          iva_usd: number;
          igtf_usd: number;
          metodo_pago: MmMetodoPago | null;
          estado: MmCompraEstado;
          notas: string | null;
          usuario_id: string | null;
          cuenta_bancaria_id: string | null;
          pagada: boolean;
          fecha_pago: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          proveedor_id?: string | null;
          sucursal_id: string;
          fecha?: string;
          total_usd?: number;
          iva_usd?: number;
          igtf_usd?: number;
          metodo_pago?: MmMetodoPago | null;
          estado?: MmCompraEstado;
          notas?: string | null;
          usuario_id?: string | null;
          cuenta_bancaria_id?: string | null;
          pagada?: boolean;
          fecha_pago?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          proveedor_id?: string | null;
          fecha?: string;
          total_usd?: number;
          iva_usd?: number;
          igtf_usd?: number;
          metodo_pago?: MmMetodoPago | null;
          estado?: MmCompraEstado;
          notas?: string | null;
          cuenta_bancaria_id?: string | null;
          pagada?: boolean;
          fecha_pago?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_compras_items: {
        Row: {
          id: string;
          tenant_id: string;
          compra_id: string;
          producto_id: string | null;
          cantidad: number;
          costo_unitario_usd: number;
          actualizar_costo: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          compra_id: string;
          producto_id?: string | null;
          cantidad: number;
          costo_unitario_usd?: number;
          actualizar_costo?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          cantidad?: number;
          costo_unitario_usd?: number;
          actualizar_costo?: boolean;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_clientes: {
        Row: {
          id: string;
          tenant_id: string;
          nombre: string;
          cedula: string | null;
          telefono: string | null;
          whatsapp: string | null;
          direccion: string | null;
          limite_fiado_usd: number;
          notas: string | null;
          activo: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          nombre: string;
          cedula?: string | null;
          telefono?: string | null;
          whatsapp?: string | null;
          direccion?: string | null;
          limite_fiado_usd?: number;
          notas?: string | null;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          nombre?: string;
          cedula?: string | null;
          telefono?: string | null;
          whatsapp?: string | null;
          direccion?: string | null;
          limite_fiado_usd?: number;
          notas?: string | null;
          activo?: boolean;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_fiados: {
        Row: {
          id: string;
          tenant_id: string;
          cliente_id: string;
          venta_id: string | null;
          monto_usd: number;
          estado: MmFiadoEstado;
          nota: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          cliente_id: string;
          venta_id?: string | null;
          monto_usd: number;
          estado?: MmFiadoEstado;
          nota?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          estado?: MmFiadoEstado;
          monto_usd?: number;
          nota?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_abonos_fiado: {
        Row: {
          id: string;
          tenant_id: string;
          fiado_id: string;
          cliente_id: string;
          monto_usd: number;
          monto_bs: number | null;
          igtf_usd: number;
          tasa_usada: number | null;
          metodo: MmMetodoPago;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fiado_id: string;
          cliente_id: string;
          monto_usd: number;
          monto_bs?: number | null;
          igtf_usd?: number;
          tasa_usada?: number | null;
          metodo?: MmMetodoPago;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      mm_categorias_deuda: {
        Row: {
          id: string;
          tenant_id: string;
          nombre: string;
          es_gasto_operativo: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          nombre: string;
          es_gasto_operativo?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          nombre?: string;
          es_gasto_operativo?: boolean;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_gastos_operativos: {
        Row: {
          id: string;
          tenant_id: string;
          descripcion: string;
          categoria: MmGastoCategoria;
          monto_usd: number;
          fecha: string;
          notas: string | null;
          metodo_pago: MmMetodoPago | null;
          cuenta_bancaria_id: string | null;
          usuario_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          descripcion: string;
          categoria?: MmGastoCategoria;
          monto_usd: number;
          fecha: string;
          notas?: string | null;
          metodo_pago?: MmMetodoPago | null;
          cuenta_bancaria_id?: string | null;
          usuario_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          descripcion?: string;
          categoria?: MmGastoCategoria;
          monto_usd?: number;
          fecha?: string;
          notas?: string | null;
          metodo_pago?: MmMetodoPago | null;
          cuenta_bancaria_id?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_otros_ingresos: {
        Row: {
          id: string;
          tenant_id: string;
          descripcion: string;
          monto_usd: number;
          fecha: string;
          notas: string | null;
          metodo_pago: MmMetodoPago;
          cuenta_bancaria_id: string | null;
          usuario_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          descripcion: string;
          monto_usd: number;
          fecha: string;
          notas?: string | null;
          metodo_pago: MmMetodoPago;
          cuenta_bancaria_id?: string | null;
          usuario_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          descripcion?: string;
          monto_usd?: number;
          fecha?: string;
          notas?: string | null;
          metodo_pago?: MmMetodoPago;
          cuenta_bancaria_id?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_deudas: {
        Row: {
          id: string;
          tenant_id: string;
          categoria_id: string | null;
          descripcion: string;
          acreedor: string;
          monto_usd: number;
          fecha: string;
          vencimiento: string | null;
          estado: MmDeudaEstado;
          notas: string | null;
          usuario_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          categoria_id?: string | null;
          descripcion: string;
          acreedor: string;
          monto_usd: number;
          fecha: string;
          vencimiento?: string | null;
          estado?: MmDeudaEstado;
          notas?: string | null;
          usuario_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          categoria_id?: string | null;
          descripcion?: string;
          acreedor?: string;
          monto_usd?: number;
          fecha?: string;
          vencimiento?: string | null;
          estado?: MmDeudaEstado;
          notas?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_abonos_deuda: {
        Row: {
          id: string;
          tenant_id: string;
          deuda_id: string;
          monto_usd: number;
          monto_bs: number | null;
          tasa_usada: number | null;
          metodo: MmMetodoPago;
          notas: string | null;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          deuda_id: string;
          monto_usd: number;
          monto_bs?: number | null;
          tasa_usada?: number | null;
          metodo?: MmMetodoPago;
          notas?: string | null;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      mm_creditos_cliente: {
        Row: {
          id: string;
          tenant_id: string;
          cliente_id: string;
          tipo: MmCreditoClienteTipo;
          monto_usd: number;
          monto_bs: number;
          tasa_usada: number | null;
          referencia: string | null;
          motivo: string | null;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          cliente_id: string;
          tipo: MmCreditoClienteTipo;
          monto_usd: number;
          monto_bs?: number;
          tasa_usada?: number | null;
          referencia?: string | null;
          motivo?: string | null;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      mm_devoluciones_venta: {
        Row: {
          id: string;
          tenant_id: string;
          venta_id: string;
          usuario_id: string | null;
          metodo: MmMetodoPago;
          cuenta_bancaria_id: string | null;
          monto_usd: number;
          monto_bs: number;
          tasa_usada: number | null;
          motivo: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          venta_id: string;
          usuario_id?: string | null;
          metodo: MmMetodoPago;
          cuenta_bancaria_id?: string | null;
          monto_usd: number;
          monto_bs?: number;
          tasa_usada?: number | null;
          motivo: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      mm_ventas: {
        Row: {
          id: string;
          tenant_id: string;
          sucursal_id: string;
          usuario_id: string | null;
          cliente_id: string | null;
          fecha: string;
          tasa_usada: number;
          subtotal_usd: number;
          descuento_usd: number;
          igtf_usd: number;
          total_usd: number;
          total_bs: number;
          tipo_documento: MmDocTipo;
          numero_documento: string | null;
          estado: MmVentaEstado;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          sucursal_id: string;
          usuario_id?: string | null;
          cliente_id?: string | null;
          fecha?: string;
          tasa_usada: number;
          subtotal_usd?: number;
          descuento_usd?: number;
          igtf_usd?: number;
          total_usd?: number;
          total_bs?: number;
          tipo_documento?: MmDocTipo;
          numero_documento?: string | null;
          estado?: MmVentaEstado;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          estado?: MmVentaEstado;
          numero_documento?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_ventas_items: {
        Row: {
          id: string;
          tenant_id: string;
          venta_id: string;
          producto_id: string | null;
          descripcion: string;
          cantidad: number;
          precio_usd: number;
          impuesto_id: string;
          total_usd: number;
          precio_ajustado: boolean;
          motivo_ajuste_precio: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          venta_id: string;
          producto_id?: string | null;
          descripcion: string;
          cantidad: number;
          precio_usd: number;
          impuesto_id?: string;
          total_usd?: number;
          precio_ajustado?: boolean;
          motivo_ajuste_precio?: string | null;
          created_at?: string;
        };
        Update: {
          descripcion?: string;
          cantidad?: number;
          precio_usd?: number;
          total_usd?: number;
          precio_ajustado?: boolean;
          motivo_ajuste_precio?: string | null;
        };
        Relationships: [];
      };
      mm_presupuestos: {
        Row: {
          id: string;
          tenant_id: string;
          sucursal_id: string;
          numero: string;
          cliente_id: string | null;
          cliente_nombre_manual: string | null;
          cliente_cedula_manual: string | null;
          cliente_telefono_manual: string | null;
          fecha_emision: string;
          validez_hasta: string;
          tasa_tipo: MmTipoTasa;
          tasa_usada: number;
          subtotal_usd: number;
          iva_usd: number;
          total_usd: number;
          total_bs: number;
          estado: MmPresupuestoEstado;
          venta_id: string | null;
          notas: string | null;
          usuario_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          sucursal_id: string;
          numero: string;
          cliente_id?: string | null;
          cliente_nombre_manual?: string | null;
          cliente_cedula_manual?: string | null;
          cliente_telefono_manual?: string | null;
          fecha_emision?: string;
          validez_hasta: string;
          tasa_tipo?: MmTipoTasa;
          tasa_usada: number;
          subtotal_usd?: number;
          iva_usd?: number;
          total_usd?: number;
          total_bs?: number;
          estado?: MmPresupuestoEstado;
          venta_id?: string | null;
          notas?: string | null;
          usuario_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          sucursal_id?: string;
          cliente_id?: string | null;
          cliente_nombre_manual?: string | null;
          cliente_cedula_manual?: string | null;
          cliente_telefono_manual?: string | null;
          validez_hasta?: string;
          tasa_tipo?: MmTipoTasa;
          tasa_usada?: number;
          subtotal_usd?: number;
          iva_usd?: number;
          total_usd?: number;
          total_bs?: number;
          estado?: MmPresupuestoEstado;
          venta_id?: string | null;
          notas?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_presupuestos_items: {
        Row: {
          id: string;
          tenant_id: string;
          presupuesto_id: string;
          producto_id: string;
          descripcion: string;
          cantidad: number;
          precio_lista_usd: number;
          precio_unitario_usd: number;
          precio_ajustado: boolean;
          subtotal_usd: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          presupuesto_id: string;
          producto_id: string;
          descripcion: string;
          cantidad: number;
          precio_lista_usd: number;
          precio_unitario_usd: number;
          precio_ajustado?: boolean;
          subtotal_usd: number;
          created_at?: string;
        };
        Update: {
          cantidad?: number;
          precio_unitario_usd?: number;
          precio_ajustado?: boolean;
          subtotal_usd?: number;
        };
        Relationships: [];
      };
      mm_cuentas_bancarias: {
        Row: {
          id: string;
          tenant_id: string;
          metodo: MmMetodoPago;
          banco: string;
          titular: string;
          rif: string | null;
          telefono: string | null;
          cuenta: string | null;
          correo: string | null;
          predeterminada: boolean;
          activa: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          metodo: MmMetodoPago;
          banco: string;
          titular: string;
          rif?: string | null;
          telefono?: string | null;
          cuenta?: string | null;
          correo?: string | null;
          predeterminada?: boolean;
          activa?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          banco?: string;
          titular?: string;
          rif?: string | null;
          telefono?: string | null;
          cuenta?: string | null;
          correo?: string | null;
          predeterminada?: boolean;
          activa?: boolean;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_pagos_venta: {
        Row: {
          id: string;
          tenant_id: string;
          venta_id: string;
          metodo: MmMetodoPago;
          monto: number;
          moneda: string;
          tasa_usada: number | null;
          cuenta_bancaria_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          venta_id: string;
          metodo: MmMetodoPago;
          monto: number;
          moneda?: string;
          tasa_usada?: number | null;
          cuenta_bancaria_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      mm_ventas_pendientes: {
        Row: {
          id: string;
          tenant_id: string;
          sucursal_id: string;
          usuario_id: string | null;
          cliente_id: string | null;
          nota: string | null;
          carrito_json: Json;
          pagos_json: Json;
          descuento_pct: string;
          descuento_monto: string;
          tasa_tipo: string;
          subtotal_usd: number;
          articulos_count: number;
          estado: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          sucursal_id: string;
          usuario_id?: string | null;
          cliente_id?: string | null;
          nota?: string | null;
          carrito_json?: Json;
          pagos_json?: Json;
          descuento_pct?: string;
          descuento_monto?: string;
          tasa_tipo?: string;
          subtotal_usd?: number;
          articulos_count?: number;
          estado?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          cliente_id?: string | null;
          nota?: string | null;
          carrito_json?: Json;
          pagos_json?: Json;
          descuento_pct?: string;
          descuento_monto?: string;
          tasa_tipo?: string;
          subtotal_usd?: number;
          articulos_count?: number;
          estado?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mm_caja_sesiones: {
        Row: {
          id: string;
          tenant_id: string;
          sucursal_id: string;
          usuario_id: string | null;
          monto_inicial_usd: number;
          monto_inicial_bs: number;
          monto_final_usd: number | null;
          monto_final_bs: number | null;
          diferencia_usd: number | null;
          diferencia_bs: number | null;
          estado: MmCajaEstado;
          abierta_en: string;
          cerrada_en: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          sucursal_id: string;
          usuario_id?: string | null;
          monto_inicial_usd?: number;
          monto_inicial_bs?: number;
          monto_final_usd?: number | null;
          monto_final_bs?: number | null;
          diferencia_usd?: number | null;
          diferencia_bs?: number | null;
          estado?: MmCajaEstado;
          abierta_en?: string;
          cerrada_en?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          monto_final_usd?: number | null;
          monto_final_bs?: number | null;
          diferencia_usd?: number | null;
          diferencia_bs?: number | null;
          estado?: MmCajaEstado;
          cerrada_en?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      mm_caja_movimientos: {
        Row: {
          id: string;
          tenant_id: string;
          sesion_id: string;
          tipo: MmCajaMovTipo;
          monto: number;
          moneda: string;
          motivo: string | null;
          referencia: string | null;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          sesion_id: string;
          tipo: MmCajaMovTipo;
          monto: number;
          moneda?: string;
          motivo?: string | null;
          referencia?: string | null;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      mm_cuenta_movimientos: {
        Row: {
          id: string;
          tenant_id: string;
          cuenta_id: string;
          tipo: MmCajaMovTipo;
          monto_usd: number;
          monto_bs: number;
          tasa_usada: number | null;
          motivo: string | null;
          referencia: string | null;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          cuenta_id: string;
          tipo: MmCajaMovTipo;
          monto_usd: number;
          monto_bs?: number;
          tasa_usada?: number | null;
          motivo?: string | null;
          referencia?: string | null;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      mm_saldos_iniciales: {
        Row: {
          id: string;
          tenant_id: string;
          destino: "caja" | "cuenta_bancaria";
          cuenta_id: string | null;
          monto_usd: number;
          monto_bs: number;
          tasa_usada: number | null;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          destino: "caja" | "cuenta_bancaria";
          cuenta_id?: string | null;
          monto_usd?: number;
          monto_bs?: number;
          tasa_usada?: number | null;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      mm_tasas_cambio: {
        Row: {
          id: string;
          tenant_id: string;
          fecha: string;
          valor: number;
          fuente: MmTasaFuente;
          tipo: MmTipoTasa;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fecha?: string;
          valor: number;
          fuente: MmTasaFuente;
          tipo?: MmTipoTasa;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      // --- Vertical Servicio Técnico (st_) ------------------------------------
      st_config: {
        Row: {
          id: string;
          tenant_id: string;
          nombre_taller: string;
          rif: string | null;
          direccion: string | null;
          telefono: string | null;
          logo_url: string | null;
          garantia_dias: number;
          whatsapp_token: string | null;
          whatsapp_numero: string | null;
          metodos_pago: unknown;
          parametros: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          nombre_taller?: string;
          rif?: string | null;
          direccion?: string | null;
          telefono?: string | null;
          logo_url?: string | null;
          garantia_dias?: number;
          whatsapp_token?: string | null;
          whatsapp_numero?: string | null;
          metodos_pago?: unknown;
          parametros?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          nombre_taller?: string;
          rif?: string | null;
          direccion?: string | null;
          telefono?: string | null;
          logo_url?: string | null;
          garantia_dias?: number;
          whatsapp_token?: string | null;
          whatsapp_numero?: string | null;
          metodos_pago?: unknown;
          parametros?: unknown;
          updated_at?: string;
        };
        Relationships: [];
      };
      st_tasas_cambio: {
        Row: {
          id: string;
          tenant_id: string;
          valor: number;
          fuente: StTasaFuente;
          fecha: string;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          valor: number;
          fuente?: StTasaFuente;
          fecha?: string;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      st_clientes: {
        Row: {
          id: string;
          tenant_id: string;
          nombre: string;
          telefono: string | null;
          email: string | null;
          cedula: string | null;
          direccion: string | null;
          notas: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          nombre: string;
          telefono?: string | null;
          email?: string | null;
          cedula?: string | null;
          direccion?: string | null;
          notas?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          nombre?: string;
          telefono?: string | null;
          email?: string | null;
          cedula?: string | null;
          direccion?: string | null;
          notas?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      st_repuestos: {
        Row: {
          id: string;
          tenant_id: string;
          codigo: string | null;
          nombre: string;
          categoria: string | null;
          stock_actual: number;
          stock_minimo: number;
          costo_usd: number;
          precio_usd: number;
          ubicacion: string | null;
          notas: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          codigo?: string | null;
          nombre: string;
          categoria?: string | null;
          stock_actual?: number;
          stock_minimo?: number;
          costo_usd?: number;
          precio_usd?: number;
          ubicacion?: string | null;
          notas?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          codigo?: string | null;
          nombre?: string;
          categoria?: string | null;
          stock_actual?: number;
          stock_minimo?: number;
          costo_usd?: number;
          precio_usd?: number;
          ubicacion?: string | null;
          notas?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      st_equipos: {
        Row: {
          id: string;
          tenant_id: string;
          cliente_id: string | null;
          tipo: StTipoEquipo;
          marca: string | null;
          modelo: string | null;
          serial: string | null;
          descripcion_problema: string;
          accesorios: string | null;
          foto_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          cliente_id?: string | null;
          tipo?: StTipoEquipo;
          marca?: string | null;
          modelo?: string | null;
          serial?: string | null;
          descripcion_problema: string;
          accesorios?: string | null;
          foto_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          cliente_id?: string | null;
          tipo?: StTipoEquipo;
          marca?: string | null;
          modelo?: string | null;
          serial?: string | null;
          descripcion_problema?: string;
          accesorios?: string | null;
          foto_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      st_ordenes: {
        Row: {
          id: string;
          tenant_id: string;
          cliente_id: string | null;
          equipo_id: string | null;
          numero_orden: string;
          estado: StOrdenEstado;
          fecha_entrada: string;
          fecha_estimada: string | null;
          fecha_entrega: string | null;
          diagnostico: string | null;
          trabajo_realizado: string | null;
          total_usd: number | null;
          total_bs: number | null;
          tasa_usada: number | null;
          cajero_id: string | null;
          garantia_hasta: string | null;
          notas: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          cliente_id?: string | null;
          equipo_id?: string | null;
          numero_orden: string;
          estado?: StOrdenEstado;
          fecha_entrada?: string;
          fecha_estimada?: string | null;
          fecha_entrega?: string | null;
          diagnostico?: string | null;
          trabajo_realizado?: string | null;
          total_usd?: number | null;
          total_bs?: number | null;
          tasa_usada?: number | null;
          cajero_id?: string | null;
          garantia_hasta?: string | null;
          notas?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          cliente_id?: string | null;
          equipo_id?: string | null;
          estado?: StOrdenEstado;
          fecha_estimada?: string | null;
          fecha_entrega?: string | null;
          diagnostico?: string | null;
          trabajo_realizado?: string | null;
          total_usd?: number | null;
          total_bs?: number | null;
          tasa_usada?: number | null;
          cajero_id?: string | null;
          garantia_hasta?: string | null;
          notas?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      st_lineas_orden: {
        Row: {
          id: string;
          orden_id: string;
          tenant_id: string;
          tipo: StLineaTipo;
          descripcion: string;
          cantidad: number;
          precio_usd: number;
          subtotal_usd: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          orden_id: string;
          tenant_id: string;
          tipo?: StLineaTipo;
          descripcion: string;
          cantidad?: number;
          precio_usd?: number;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      st_pagos_orden: {
        Row: {
          id: string;
          orden_id: string;
          tenant_id: string;
          metodo: StMetodoPago;
          monto_usd: number;
          monto_bs: number;
          igtf: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          orden_id: string;
          tenant_id: string;
          metodo: StMetodoPago;
          monto_usd: number;
          monto_bs?: number;
          igtf?: number;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      cnd_condominios: {
        Row: {
          id: string;
          tenant_id: string;
          nombre: string;
          tipo: CndTipoCondominio;
          direccion: string;
          rif: string | null;
          telefono: string | null;
          correo: string | null;
          metodo_reparto: CndMetodoReparto;
          cuota_fija_usd: number | null;
          metodos_pago: Json;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          nombre: string;
          tipo?: CndTipoCondominio;
          direccion: string;
          rif?: string | null;
          telefono?: string | null;
          correo?: string | null;
          metodo_reparto?: CndMetodoReparto;
          cuota_fija_usd?: number | null;
          metodos_pago?: Json;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          nombre?: string;
          tipo?: CndTipoCondominio;
          direccion?: string;
          rif?: string | null;
          telefono?: string | null;
          correo?: string | null;
          metodo_reparto?: CndMetodoReparto;
          cuota_fija_usd?: number | null;
          metodos_pago?: Json;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      cnd_unidades: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          identificador: string;
          tipo: CndTipoUnidad;
          alicuota: number;
          m2: number | null;
          propietario_nombre: string;
          propietario_cedula: string | null;
          propietario_telefono: string | null;
          propietario_correo: string | null;
          activa: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          identificador: string;
          tipo?: CndTipoUnidad;
          alicuota?: number;
          m2?: number | null;
          propietario_nombre: string;
          propietario_cedula?: string | null;
          propietario_telefono?: string | null;
          propietario_correo?: string | null;
          activa?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          condominio_id?: string;
          identificador?: string;
          tipo?: CndTipoUnidad;
          alicuota?: number;
          m2?: number | null;
          propietario_nombre?: string;
          propietario_cedula?: string | null;
          propietario_telefono?: string | null;
          propietario_correo?: string | null;
          activa?: boolean;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      cnd_gastos_comunes: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          descripcion: string;
          categoria: CndGastoCategoria;
          monto_usd: number;
          fecha: string;
          notas: string | null;
          usuario_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          descripcion: string;
          categoria?: CndGastoCategoria;
          monto_usd: number;
          fecha: string;
          notas?: string | null;
          usuario_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          descripcion?: string;
          categoria?: CndGastoCategoria;
          monto_usd?: number;
          fecha?: string;
          notas?: string | null;
          usuario_id?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      cnd_cuotas: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          unidad_id: string;
          periodo: string;
          alicuota_aplicada: number;
          total_gastos_usd: number;
          monto_usd: number;
          cuota_fija_usd: number | null;
          gasto_especial_usd: number | null;
          reparto_id: string | null;
          generado_en: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          unidad_id: string;
          periodo: string;
          alicuota_aplicada: number;
          total_gastos_usd: number;
          monto_usd: number;
          cuota_fija_usd?: number | null;
          gasto_especial_usd?: number | null;
          reparto_id?: string | null;
          generado_en?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          reparto_id?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      cnd_pagos_cuota: {
        Row: {
          id: string;
          tenant_id: string;
          cuota_id: string;
          monto_usd: number;
          monto_bs: number | null;
          tasa_usada: number | null;
          tasa_tipo: string | null;
          metodo: CndMetodoPago;
          fecha_pago: string;
          notas: string | null;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          cuota_id: string;
          monto_usd: number;
          monto_bs?: number | null;
          tasa_usada?: number | null;
          tasa_tipo?: string | null;
          metodo: CndMetodoPago;
          fecha_pago: string;
          notas?: string | null;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      cnd_config: {
        Row: {
          id: string;
          tenant_id: string;
          fuente_tasa: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fuente_tasa?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          fuente_tasa?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cnd_tasas_cambio: {
        Row: {
          id: string;
          tenant_id: string;
          fecha: string;
          valor: number;
          fuente: CndTasaFuente;
          tipo: string;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fecha?: string;
          valor: number;
          fuente?: CndTasaFuente;
          tipo?: string;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      cnd_areas_comunes: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          nombre: string;
          descripcion: string | null;
          capacidad_personas: number | null;
          tarifa_usd: number;
          notas_reglas: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          nombre: string;
          descripcion?: string | null;
          capacidad_personas?: number | null;
          tarifa_usd?: number;
          notas_reglas?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          nombre?: string;
          descripcion?: string | null;
          capacidad_personas?: number | null;
          tarifa_usd?: number;
          notas_reglas?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      cnd_reservas: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          area_id: string;
          unidad_id: string;
          fecha: string;
          hora_inicio: string;
          hora_fin: string;
          monto_usd: number;
          notas: string | null;
          usuario_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          area_id: string;
          unidad_id: string;
          fecha: string;
          hora_inicio: string;
          hora_fin: string;
          monto_usd?: number;
          notas?: string | null;
          usuario_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          fecha?: string;
          hora_inicio?: string;
          hora_fin?: string;
          monto_usd?: number;
          notas?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      cnd_documentos: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          tipo: CndTipoDocumento;
          titulo: string;
          descripcion: string | null;
          fecha_documento: string | null;
          archivo_path: string;
          archivo_nombre_original: string;
          archivo_mime: string;
          archivo_size_bytes: number;
          usuario_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          tipo?: CndTipoDocumento;
          titulo: string;
          descripcion?: string | null;
          fecha_documento?: string | null;
          archivo_path: string;
          archivo_nombre_original: string;
          archivo_mime: string;
          archivo_size_bytes: number;
          usuario_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          tipo?: CndTipoDocumento;
          titulo?: string;
          descripcion?: string | null;
          fecha_documento?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      cnd_inquilinos: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          unidad_id: string;
          auth_user_id: string;
          nombre: string;
          apellido: string;
          tipo_identificacion: CndTipoIdentificacion;
          identificacion_prefijo: string;
          identificacion_numero: string;
          telefono_llamada: string | null;
          telefono_whatsapp: string | null;
          correo: string;
          activo: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          unidad_id: string;
          auth_user_id: string;
          nombre: string;
          apellido: string;
          tipo_identificacion?: CndTipoIdentificacion;
          identificacion_prefijo: string;
          identificacion_numero: string;
          telefono_llamada?: string | null;
          telefono_whatsapp?: string | null;
          correo: string;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          unidad_id?: string;
          nombre?: string;
          apellido?: string;
          tipo_identificacion?: CndTipoIdentificacion;
          identificacion_prefijo?: string;
          identificacion_numero?: string;
          telefono_llamada?: string | null;
          telefono_whatsapp?: string | null;
          activo?: boolean;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      cnd_reportes_pago: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          unidad_id: string;
          inquilino_id: string;
          cuota_id: string | null;
          periodo: string;
          monto_usd: number;
          fecha_pago: string;
          notas: string | null;
          estado: CndEstadoReportePago;
          motivo_rechazo: string | null;
          revisado_por: string | null;
          revisado_en: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          unidad_id: string;
          inquilino_id: string;
          cuota_id?: string | null;
          periodo: string;
          monto_usd: number;
          fecha_pago: string;
          notas?: string | null;
          estado?: CndEstadoReportePago;
          motivo_rechazo?: string | null;
          revisado_por?: string | null;
          revisado_en?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          estado?: CndEstadoReportePago;
          cuota_id?: string | null;
          motivo_rechazo?: string | null;
          revisado_por?: string | null;
          revisado_en?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      cnd_reportes_pago_partes: {
        Row: {
          id: string;
          tenant_id: string;
          reporte_pago_id: string;
          inquilino_id: string;
          metodo: CndMetodoPago;
          monto_usd: number;
          monto_moneda_nativa: number;
          tasa_snapshot: number | null;
          referencia_ultimos4: string | null;
          comprobante_path: string | null;
          comprobante_nombre_original: string | null;
          comprobante_mime: string | null;
          comprobante_size_bytes: number | null;
          pago_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          reporte_pago_id: string;
          inquilino_id: string;
          metodo: CndMetodoPago;
          monto_usd: number;
          monto_moneda_nativa: number;
          tasa_snapshot?: number | null;
          referencia_ultimos4?: string | null;
          comprobante_path?: string | null;
          comprobante_nombre_original?: string | null;
          comprobante_mime?: string | null;
          comprobante_size_bytes?: number | null;
          pago_id?: string | null;
          created_at?: string;
        };
        Update: {
          pago_id?: string | null;
        };
        Relationships: [];
      };
      cnd_gastos_especiales: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          descripcion: string;
          monto_usd: number;
          fecha: string;
          notas: string | null;
          estado: CndEstadoGastoEspecial;
          modo_aplicacion: CndModoGastoEspecial | null;
          usuario_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          descripcion: string;
          monto_usd: number;
          fecha: string;
          notas?: string | null;
          estado?: CndEstadoGastoEspecial;
          modo_aplicacion?: CndModoGastoEspecial | null;
          usuario_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          estado?: CndEstadoGastoEspecial;
          modo_aplicacion?: CndModoGastoEspecial | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      cnd_gasto_especial_partes: {
        Row: {
          id: string;
          tenant_id: string;
          gasto_especial_id: string;
          unidad_id: string;
          monto_usd: number;
          seleccionada: boolean;
          cubierto_fondo: boolean;
          cuota_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          gasto_especial_id: string;
          unidad_id: string;
          monto_usd: number;
          seleccionada: boolean;
          cubierto_fondo?: boolean;
          cuota_id?: string | null;
          created_at?: string;
        };
        Update: {
          cuota_id?: string | null;
        };
        Relationships: [];
      };
      cnd_fondo_movimientos: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          tipo: CndFondoTipo;
          origen: CndFondoOrigen;
          monto_usd: number;
          concepto: string;
          periodo: string | null;
          gasto_especial_id: string | null;
          unidad_id: string | null;
          fecha: string;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          tipo: CndFondoTipo;
          origen: CndFondoOrigen;
          monto_usd: number;
          concepto: string;
          periodo?: string | null;
          gasto_especial_id?: string | null;
          unidad_id?: string | null;
          fecha: string;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      cnd_repartos: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          periodo: string;
          version: number;
          metodo_reparto: CndMetodoReparto;
          total_gastos_usd: number;
          total_repartido_usd: number;
          num_unidades: number;
          estado: CndRepartoEstado;
          motivo_cambio: string | null;
          reparto_anterior_id: string | null;
          generado_por: string | null;
          generado_en: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          periodo: string;
          version: number;
          metodo_reparto: CndMetodoReparto;
          total_gastos_usd: number;
          total_repartido_usd: number;
          num_unidades: number;
          estado?: CndRepartoEstado;
          motivo_cambio?: string | null;
          reparto_anterior_id?: string | null;
          generado_por?: string | null;
          generado_en?: string;
          created_at?: string;
        };
        Update: {
          estado?: CndRepartoEstado;
          total_gastos_usd?: number;
          total_repartido_usd?: number;
          num_unidades?: number;
        };
        Relationships: [];
      };
      cnd_reparto_ajustes: {
        Row: {
          id: string;
          tenant_id: string;
          cuota_id: string;
          unidad_id: string;
          periodo: string;
          tipo: CndRepartoAjusteTipo;
          motivo: string;
          monto_usd: number;
          efecto: CndRepartoAjusteEfecto;
          reparto_id: string;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          cuota_id: string;
          unidad_id: string;
          periodo: string;
          tipo: CndRepartoAjusteTipo;
          motivo: string;
          monto_usd: number;
          efecto: CndRepartoAjusteEfecto;
          reparto_id: string;
          usuario_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      cnd_inventario_categorias: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          nombre: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          nombre: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          nombre?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      cnd_inventario_items: {
        Row: {
          id: string;
          tenant_id: string;
          condominio_id: string;
          categoria_id: string | null;
          nombre: string;
          ubicacion: string;
          descripcion: string | null;
          cantidad: number;
          imagen_url: string | null;
          usuario_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          condominio_id: string;
          categoria_id?: string | null;
          nombre: string;
          ubicacion: string;
          descripcion?: string | null;
          cantidad?: number;
          imagen_url?: string | null;
          usuario_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          categoria_id?: string | null;
          nombre?: string;
          ubicacion?: string;
          descripcion?: string | null;
          cantidad?: number;
          imagen_url?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      mm_v_stock: {
        Row: {
          tenant_id: string | null;
          producto_id: string | null;
          sucursal_id: string | null;
          stock_actual: number | null;
        };
        Relationships: [];
      };
      mm_v_saldo_cliente: {
        Row: {
          tenant_id: string | null;
          cliente_id: string | null;
          saldo_usd: number | null;
          primer_fiado_abierto_at: string | null;
        };
        Relationships: [];
      };
      mm_v_resumen_proveedor: {
        Row: {
          tenant_id: string | null;
          proveedor_id: string | null;
          num_compras: number | null;
          total_comprado_usd: number | null;
          ultima_compra: string | null;
        };
        Relationships: [];
      };
      mm_v_saldo_deuda: {
        Row: {
          tenant_id: string | null;
          deuda_id: string | null;
          pagado_usd: number | null;
          saldo_usd: number | null;
        };
        Relationships: [];
      };
      mm_v_saldo_cuenta_bancaria: {
        Row: {
          tenant_id: string | null;
          cuenta_id: string | null;
          saldo_usd: number | null;
          saldo_bs: number | null;
        };
        Relationships: [];
      };
      mm_v_saldo_credito_cliente: {
        Row: {
          tenant_id: string | null;
          cliente_id: string | null;
          saldo_usd: number | null;
        };
        Relationships: [];
      };
      st_v_resumen_cliente: {
        Row: {
          cliente_id: string | null;
          tenant_id: string | null;
          nombre: string | null;
          telefono: string | null;
          total_ordenes: number | null;
          ordenes_activas: number | null;
          total_pagado_usd: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      auth_tenant_ids: {
        Args: Record<never, never>;
        Returns: string[];
      };
      is_super_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      set_onboarding_minimarket: {
        Args: { p_tenant_id: string; p_completado: boolean };
        Returns: undefined;
      };
      limpiar_datos_prueba_tenant: {
        Args: { p_tenant_id: string };
        Returns: Json;
      };
      admin_vaciar_datos_prueba_tenant: {
        Args: { p_tenant_id: string; p_admin_id: string };
        Returns: Json;
      };
      admin_snapshot_tenant: {
        Args: { p_tenant_id: string };
        Returns: Json;
      };
      admin_previsualizar_eliminacion_tenant: {
        Args: { p_tenant_id: string };
        Returns: Json;
      };
      admin_eliminar_cliente_completo: {
        Args: { p_tenant_id: string; p_admin_id: string };
        Returns: Json;
      };
      admin_detectar_huerfanos: {
        Args: Record<never, never>;
        Returns: Json;
      };
    };
    Enums: {
      membership_role: MembershipRole;
      product_status: ProductStatus;
      plan_interval: PlanInterval;
      subscription_status: SubscriptionStatus;
      entitlement_status: EntitlementStatus;
      country_code: CountryCode;
      payment_request_status: PaymentRequestStatus;
      platform_aviso_tipo: PlatformAvisoTipo;
      mm_mov_tipo: MmMovTipo;
      mm_compra_estado: MmCompraEstado;
      mm_doc_tipo: MmDocTipo;
      mm_venta_estado: MmVentaEstado;
      mm_metodo_pago: MmMetodoPago;
      mm_caja_estado: MmCajaEstado;
      mm_caja_mov_tipo: MmCajaMovTipo;
      mm_tasa_fuente: MmTasaFuente;
      mm_fiado_estado: MmFiadoEstado;
      mm_tipo_venta: MmTipoVenta;
      mm_deuda_estado: MmDeudaEstado;
      mm_gasto_categoria: MmGastoCategoria;
      mm_limpieza_prueba_decision: MmLimpiezaPruebaDecision;
      st_orden_estado: StOrdenEstado;
      st_tipo_equipo: StTipoEquipo;
      st_linea_tipo: StLineaTipo;
      st_metodo_pago: StMetodoPago;
      st_tasa_fuente: StTasaFuente;
      cnd_tipo_condominio: CndTipoCondominio;
      cnd_metodo_reparto: CndMetodoReparto;
      cnd_tipo_unidad: CndTipoUnidad;
      cnd_gasto_categoria: CndGastoCategoria;
      cnd_metodo_pago: CndMetodoPago;
      cnd_tasa_fuente: CndTasaFuente;
      cnd_tipo_identificacion: CndTipoIdentificacion;
      cnd_estado_reporte_pago: CndEstadoReportePago;
    };
    CompositeTypes: Record<never, never>;
  };
}

// --- Atajos de tipo por tabla -------------------------------------------------
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Profile = Tables<"profiles">;
export type Tenant = Tables<"tenants">;
export type Membership = Tables<"memberships">;
export type Product = Tables<"products">;
export type Plan = Tables<"plans">;
export type Subscription = Tables<"subscriptions">;
export type Entitlement = Tables<"entitlements">;
export type PaymentMethod = Tables<"payment_methods">;
export type PaymentRequest = Tables<"payment_requests">;
export type AdminAuditLog = Tables<"admin_audit_log">;
export type PlatformAviso = Tables<"platform_avisos">;
export type PlatformAvisoDescartado = Tables<"platform_avisos_descartados">;

// --- Atajos de tipo del vertical Minimarket -----------------------------------
type PublicViews = PublicSchema["Views"];
export type ViewRow<T extends keyof PublicViews> = PublicViews[T]["Row"];

export type MmSucursal = Tables<"mm_sucursales">;
export type MmUsuarioSucursal = Tables<"mm_usuarios_sucursal">;
export type MmRol = Tables<"mm_roles">;
export type MmPermisoRol = Tables<"mm_permisos_rol">;
export type MmConfigNegocio = Tables<"mm_config_negocio">;
export type MmCategoria = Tables<"mm_categorias">;
export type MmProducto = Tables<"mm_productos">;
export type MmProductoCodigo = Tables<"mm_producto_codigos">;
export type MmPrecio = Tables<"mm_precios">;
export type MmInventario = Tables<"mm_inventario">;
export type MmMovimientoInventario = Tables<"mm_movimientos_inventario">;
export type MmProveedor = Tables<"mm_proveedores">;
export type MmCompra = Tables<"mm_compras">;
export type MmCompraItem = Tables<"mm_compras_items">;
export type MmCliente = Tables<"mm_clientes">;
export type MmFiado = Tables<"mm_fiados">;
export type MmAbonoFiado = Tables<"mm_abonos_fiado">;
export type MmVenta = Tables<"mm_ventas">;
export type MmVentaItem = Tables<"mm_ventas_items">;
export type MmPagoVenta = Tables<"mm_pagos_venta">;
export type MmVentaPendiente = Tables<"mm_ventas_pendientes">;
export type MmCajaSesion = Tables<"mm_caja_sesiones">;
export type MmCajaMovimiento = Tables<"mm_caja_movimientos">;
export type MmTasaCambio = Tables<"mm_tasas_cambio">;
export type MmCategoriaDeuda = Tables<"mm_categorias_deuda">;
export type MmDeuda = Tables<"mm_deudas">;
export type MmAbonoDeuda = Tables<"mm_abonos_deuda">;
export type MmGastoOperativo = Tables<"mm_gastos_operativos">;
export type MmOtroIngreso = Tables<"mm_otros_ingresos">;
export type MmCuentaBancaria = Tables<"mm_cuentas_bancarias">;
export type MmCuentaMovimiento = Tables<"mm_cuenta_movimientos">;
export type MmSaldoInicial = Tables<"mm_saldos_iniciales">;
export type MmCreditoCliente = Tables<"mm_creditos_cliente">;
export type MmDevolucionVenta = Tables<"mm_devoluciones_venta">;
export type MmPresupuesto = Tables<"mm_presupuestos">;
export type MmPresupuestoItem = Tables<"mm_presupuestos_items">;
export type MmStock = ViewRow<"mm_v_stock">;
export type MmSaldoCliente = ViewRow<"mm_v_saldo_cliente">;
export type MmResumenProveedor = ViewRow<"mm_v_resumen_proveedor">;
export type MmSaldoDeuda = ViewRow<"mm_v_saldo_deuda">;
export type MmSaldoCuentaBancaria = ViewRow<"mm_v_saldo_cuenta_bancaria">;
export type MmSaldoCreditoCliente = ViewRow<"mm_v_saldo_credito_cliente">;

// --- Atajos de tipo del vertical Servicio Técnico ----------------------------
export type StConfig = Tables<"st_config">;
export type StTasaCambio = Tables<"st_tasas_cambio">;
export type StCliente = Tables<"st_clientes">;
export type StRepuesto = Tables<"st_repuestos">;
export type StEquipo = Tables<"st_equipos">;
export type StOrden = Tables<"st_ordenes">;
export type StLineaOrden = Tables<"st_lineas_orden">;
export type StPagoOrden = Tables<"st_pagos_orden">;
export type StResumenCliente = ViewRow<"st_v_resumen_cliente">;

// --- Atajos de tipo del vertical Condominio -----------------------------------
export type CndCondominio = Tables<"cnd_condominios">;
export type CndUnidad = Tables<"cnd_unidades">;
export type CndGastoComun = Tables<"cnd_gastos_comunes">;
export type CndCuota = Tables<"cnd_cuotas">;
export type CndPagoCuota = Tables<"cnd_pagos_cuota">;
export type CndConfig = Tables<"cnd_config">;
export type CndTasaCambio = Tables<"cnd_tasas_cambio">;
export type CndAreaComun = Tables<"cnd_areas_comunes">;
export type CndReserva = Tables<"cnd_reservas">;
export type CndDocumento = Tables<"cnd_documentos">;
export type CndInquilino = Tables<"cnd_inquilinos">;
export type CndReportePago = Tables<"cnd_reportes_pago">;
export type CndReportePagoParte = Tables<"cnd_reportes_pago_partes">;
export type CndGastoEspecial = Tables<"cnd_gastos_especiales">;
export type CndGastoEspecialParte = Tables<"cnd_gasto_especial_partes">;
export type CndFondoMovimiento = Tables<"cnd_fondo_movimientos">;
export type CndReparto = Tables<"cnd_repartos">;
export type CndRepartoAjuste = Tables<"cnd_reparto_ajustes">;
export type CndInventarioCategoria = Tables<"cnd_inventario_categorias">;
export type CndInventarioItem = Tables<"cnd_inventario_items">;
