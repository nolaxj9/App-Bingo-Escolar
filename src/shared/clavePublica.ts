// Clave pública de producción para verificar permisos sin Internet. La privada vive solo en Cloudflare
// (secreto LICENSE_PRIVATE_KEY). Se puede reemplazar en el build con VITE_LICENSE_PUBLIC_KEY (JSON del JWK).
export const CLAVE_PUBLICA_PRODUCCION: JsonWebKey = {"kty":"EC","x":"z2vofVlJCP_AQSuXo9SO9L5nlxdWGJXlUy8T6zIsc5s","y":"MSMcl42d6ti_g6whgY1-ztfFesFDRhQ0kBxm6Df0-Xk","crv":"P-256"};
