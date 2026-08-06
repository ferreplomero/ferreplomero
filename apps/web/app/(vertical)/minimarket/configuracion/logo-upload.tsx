"use client";

import React, { useRef, useState, useTransition } from "react";
import { Building2, CheckCircle, ImagePlus, Trash2 } from "lucide-react";
import { Button, Card } from "@arkiteq/ui";
import { subirLogoNegocio } from "./actions";

interface LogoUploadProps {
  logoUrl: string | null;
  /**
   * Server action que guarda el logo. Por defecto la de Configuración
   * (`subirLogoNegocio`, exige acceso operativo vigente); el asistente de
   * bienvenida pasa `subirLogoBienvenidaAction` en su lugar, que guarda lo
   * mismo pero SIN bloquear por pago en revisión.
   */
  action?: (
    prev: { ok?: boolean; error?: string },
    formData: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
}

export function LogoUpload({ logoUrl, action = subirLogoNegocio }: LogoUploadProps) {
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(false);
    setPreview(URL.createObjectURL(file));

    const fd = new FormData();
    fd.append("logo", file);
    startTransition(async () => {
      const result = await action({}, fd);
      if (result.error) {
        setError(result.error);
        setPreview(logoUrl);
      } else {
        setSuccess(true);
      }
    });

    e.target.value = "";
  }

  function handleQuitar() {
    setError(null);
    setSuccess(false);
    setPreview(null);

    const fd = new FormData();
    fd.append("logo_remove", "1");
    startTransition(async () => {
      const result = await action({}, fd);
      if (result.error) {
        setError(result.error);
        setPreview(logoUrl);
      } else {
        setSuccess(true);
      }
    });
  }

  return (
    <Card className="p-6">
      <p className="text-muted-foreground mb-4 text-xs font-medium uppercase tracking-wide">
        Logo del negocio
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="shrink-0">
          {preview ? (
            <img
              src={preview}
              alt="Logo del negocio"
              className="size-20 rounded-xl object-cover ring-1 ring-black/10"
            />
          ) : (
            <span className="bg-surface-2 text-muted-foreground inline-flex size-20 items-center justify-center rounded-xl">
              <Building2 className="size-8" aria-hidden />
            </span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              {preview ? "Cambiar logo" : "Subir logo"}
            </Button>
            {preview ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={handleQuitar}
              >
                <Trash2 className="size-4" />
                Quitar
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">PNG, JPG o WEBP · máx. 2 MB</p>
          {isPending ? (
            <p className="text-muted-foreground text-xs">Guardando…</p>
          ) : success ? (
            <p className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="size-3.5" />
              Logo guardado.
            </p>
          ) : error ? (
            <p className="text-danger text-xs">{error}</p>
          ) : null}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handlePick}
      />
    </Card>
  );
}
