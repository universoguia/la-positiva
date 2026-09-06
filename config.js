/* ==========================================================================
   La Positiva - configuracion del sitio
   ESTE ES EL UNICO ARCHIVO QUE HAY QUE TOCAR PARA APUNTAR A OTRO LOCAL.

   Todo lo que hay aca es PUBLICO a proposito: viaja al navegador de
   cualquiera que abra la pagina. No es un descuido y no se puede evitar
   en un sitio estatico. Lo que protege los datos es RLS en Supabase.

   NUNCA agregues aca:
     - la service_role de Supabase
     - la clave privada VAPID
     - contrasenias, tokens de API o claves de pasarelas de pago
   Todo eso va como secreto de la Edge Function:
   Supabase > Configuracion > Edge Functions > Secrets
   ========================================================================== */
window.LP_CONFIG = {

  /* --- Supabase ---------------------------------------------------------
     La clave anon esta disenada para ser publica: identifica al proyecto,
     no da permisos por si sola. Los permisos los define RLS.            */
  SUPABASE_URL: 'https://abjonztvstyieukmrikx.supabase.co',
  SUPABASE_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiam9uenR2c3R5aWV1a21yaWt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzUyNDksImV4cCI6MjEwMzM1MTI0OX0.bGpeGAFtBvy_I-np7N8mBmK59Yk_t60UEboei7QZ4rY',

  /* --- Tablas y almacenamiento ----------------------------------------- */
  TABLE: 'la_positiva_pedidos',
  PUSH_TABLE: 'la_positiva_push_subs',
  COBROS_TABLE: 'la_positiva_cobros',
  BUCKET: 'la-positiva',

  /* --- Fotos de los platos ---------------------------------------------
     Hoy salen del sitio viejo. Si algun dia se mudan, se cambia aca.   */
  IMG_BASE: 'https://la-positiva-phi.vercel.app/',

  /* --- Web Push ---------------------------------------------------------
     Tiene que ser el par de la VAPID_PRIVATE_KEY cargada como secreto de
     la Edge Function. Si se rota una, hay que rotar la otra y volver a
     suscribir todos los dispositivos.                                   */
  VAPID_PUBLIC: 'BNgN_0JBHeZH_kGqjSNBELQXFYOkgOjFjS3SxCG5AwuBaC12q2sPqyKRTp3UMnjEnS2H6m0TX7PjtZrxMqeF4Sk'
};
