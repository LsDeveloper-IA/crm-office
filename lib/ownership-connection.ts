export function ownershipListenerConnection(env: Record<string, string | undefined>): string | undefined {
  const explicit = env.DIRECT_DATABASE_URL || env.DATABASE_URL_UNPOOLED;
  if (explicit) return explicit;
  if (!env.DATABASE_URL) return undefined;
  const url = new URL(env.DATABASE_URL);
  // Neon documents this mapping between pooled and direct endpoints.
  // Retain credentials, database and TLS options; change only the endpoint label.
  if (url.hostname.endsWith(".neon.tech")) {
    url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
  }
  return url.toString();
}
