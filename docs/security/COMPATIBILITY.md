# Cambios de comportamiento autorizados

El usuario autorizó explícitamente los puntos 1 y 2 el 19 de octubre de 2026. Están activados en el código y en 0003_sales_gate.sql; ninguna migración se ha desplegado a servicios remotos.

1. Backend real: purchase_tickets rechazará tipos con price > 0 con `PAYMENTS_NOT_CONFIGURED`; no se emiten entradas y toda la transacción se revierte. Entradas gratuitas siguen funcionando. Demo local conserva simulación de precios. No se añade ni cambia proveedor.
2. NEXT_PUBLIC_DEMO_MODE=true con NODE_ENV=production detendrá el arranque/build con mensaje de configuración, sin revelar variables. Demo sigue disponible en npm run dev; nunca se cambia silenciosamente a una base real.
3. Nueva BD multi-organización autorizada por el usuario: organizaciones, una membresía por usuario (organizador/controlador), asignaciones de evento para controladores y administradores globales separados. Membresía provisionada por operador de confianza, nunca por formulario público. MFA AAL2 obligatorio en BD para cuentas privilegiadas. Filas antiguas sin organización quedan en cuarentena, solo accesibles por administrador global; sin borrado ni atribución automática.
4. Mantener la anulación y reactivación, comprobando capacidad incluso al reactivar. Mantener el restablecimiento manual de una entrada usada por organizador como excepción administrativa auditada; el personal de puerta no puede restablecerla.

No se ejecutará ninguna migración contra un servicio remoto. Las pruebas usarán un clúster PostgreSQL local desechable con fixtures sintéticos. Cambios de esquema son aditivos; conservar 0001 y añadir 0002. Reversión de código posible con `.audit-original.zip` (sin .env); no revertir políticas de seguridad en una base pública.
