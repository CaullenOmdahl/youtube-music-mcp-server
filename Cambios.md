# Cambios

## 2026-02-26 — Correcciones de seguridad

### Problema 1: Dominio OAuth hardcodeado (CRÍTICO)
**Archivos:** `src/auth/smithery-oauth-provider.ts` (líneas 101 y 156)

El código tenía un dominio externo (`ytmusic.dumawtf.com`) como fallback para el redirect URI de OAuth. Si `GOOGLE_REDIRECT_URI` no estaba configurado, Google enviaba los tokens OAuth a ese dominio externo en lugar del servidor propio.

**Cambio:** Se eliminó el fallback. Ahora se lanza un error explícito:
```
Error: GOOGLE_REDIRECT_URI environment variable is required for OAuth
```

---

### Problema 2: Clave de cifrado insegura por defecto (ALTO)
**Archivos:** `src/auth/token-store.ts` (línea 197), `src/config.ts`

El token store usaba `'default-insecure-key-32-bytes!'` como clave AES-256-GCM cuando `ENCRYPTION_KEY` no estaba configurada. Esto hacía que el cifrado de los tokens OAuth guardados en disco fuera trivialmente reversible (la clave es pública).

**Cambio en `token-store.ts`:** Se eliminó la clave por defecto. Ahora lanza un error:
```
Error: ENCRYPTION_KEY environment variable is required for token storage
```

**Cambio en `config.ts`:** `encryptionKey` ya no es `.optional()` en el schema Zod — el servidor falla en startup con un mensaje claro si la variable no está configurada. En modo `BYPASS_AUTH_FOR_TESTING=true` se usa un valor placeholder que indica explícitamente que no es para producción.

---

### Variables de entorno requeridas (producción)
| Variable | Descripción |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID de Google OAuth |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client Secret de Google OAuth |
| `GOOGLE_REDIRECT_URI` | URI de callback OAuth (tu dominio) |
| `ENCRYPTION_KEY` | Clave base64 de 32 bytes para AES-256-GCM |
