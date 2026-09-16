import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const TOKEN_FILE = fileURLToPath(new URL('../../.local/gmail-token.json', import.meta.url));

export function credentials() {
  const client_id = process.env.GMAIL_CLIENT_ID?.trim();
  const client_secret = process.env.GMAIL_CLIENT_SECRET?.trim();
  if (!client_id || !client_secret) {
    throw new Error('Configure GMAIL_CLIENT_ID e GMAIL_CLIENT_SECRET no .env.');
  }
  return { client_id, client_secret };
}

export async function exchangeToken(params) {
  const { client_id, client_secret } = credentials();

  const body = new URLSearchParams({
    ...params,
    client_id,
    client_secret,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const hints = {
      invalid_client: 'Confira o client ID e o client secret do mesmo cliente OAuth no Google Cloud.',
      invalid_grant: 'Código/token expirado, revogado ou já utilizado. Execute node scripts/gmail/authorize.mjs novamente.',
      redirect_uri_mismatch: 'Cadastre exatamente http://127.0.0.1:53682/oauth2/callback no cliente OAuth.',
      access_denied: 'Acesso recusado. Confira o consentimento e os usuários de teste.',
    };
    const code = Object.hasOwn(hints, data?.error ?? '') ? data.error : 'oauth_error';
    throw new Error(`OAuth falhou (HTTP ${response.status}, ${code}). ${hints[code] ?? 'Confira a configuração OAuth e tente novamente.'}`);
  }

  if (!data?.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new Error('Google retornou uma resposta de token inválida.');
  }
  return data;
}

/** Cliente REST oficial, somente leitura, com renovação automática do access token. */
export async function createGmailClient() {
  credentials();
  let saved;
  try {
    saved = JSON.parse(await readFile(TOKEN_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    throw new Error('Token Gmail ausente ou inválido. Execute node scripts/gmail/authorize.mjs e conclua a autorização no navegador.');
  }
  if (typeof saved?.refresh_token !== 'string' || !saved.refresh_token.trim()) {
    throw new Error('Refresh token ausente. Execute node scripts/gmail/authorize.mjs novamente.');
  }
  let token;
  let expires = 0;
  let lastRequest = 0;
  return async function get(path, query = {}) {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (Date.now() >= expires) {
        const result = await exchangeToken({ grant_type: 'refresh_token', refresh_token: saved.refresh_token });
        token = result.access_token;
        expires = Date.now() + Math.max(1, result.expires_in - 60) * 1000;
      }
      const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
      for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
      const delay = 650 - (Date.now() - lastRequest);
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      lastRequest = Date.now();
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response.json();
      const failure = await response.json().catch(() => null);
      const reason = failure?.error?.errors?.[0]?.reason;
      const rateLimited = response.status === 403 && ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason);
      if (response.status === 401) expires = 0;
      else if (!rateLimited && response.status !== 429 && response.status < 500) {
        const knownReason = ['dailyLimitExceeded', 'insufficientPermissions', 'accessNotConfigured', 'domainPolicy'].includes(reason) ? reason : 'forbidden';
        throw new Error(`Gmail HTTP ${response.status} (${knownReason}) em ${path}. Confira a configuração de acesso e cotas.`);
      }
      if (attempt === 3) throw new Error(`Gmail indisponível (HTTP ${response.status}).`);
      await new Promise(resolve => setTimeout(resolve, Math.max(2000 * 2 ** attempt, Math.min(60000, (Number(response.headers.get('retry-after')) || 0) * 1000))));
    }
  };
}

export async function listAlterationMessages(get, labelName = 'ALTERAÇÃO') {
  const { labels = [] } = await get('labels');
  const label = labels.find(item => item.name?.normalize('NFC') === labelName.normalize('NFC'));
  if (!label) throw new Error(`Marcador "${labelName}" não encontrado.`);
  const ids = new Set();
  let pageToken;
  do {
    const page = await get('messages', { labelIds: label.id, maxResults: '100', pageToken });
    for (const message of page.messages ?? []) ids.add(message.id);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return [...ids];
}

export function header(message, name) {
  return message.payload?.headers?.find(item => item.name.toLowerCase() === name.toLowerCase())?.value;
}

/** Lê HTML em MIME aninhado e attachmentId; ignora arquivos e e-mails anexados. */
export async function getHtmlBody(get, message) {
  return getMessageBody(get, message, 'text/html');
}

export async function getTextBody(get, message) {
  return getMessageBody(get, message, 'text/plain');
}

async function getMessageBody(get, message, mimeType) {
  const html = [];
  async function visit(part) {
    if (!part || part.filename || part.mimeType === 'message/rfc822') return;
    if (part.mimeType?.toLowerCase() === mimeType) {
      let data = part.body?.data;
      if (!data && part.body?.attachmentId) {
        const body = await get(`messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`);
        data = body.data;
      }
      if (!data) throw new Error(`Parte ${mimeType} sem conteúdo.`);
      const contentType = part.headers?.find(h => h.name.toLowerCase() === 'content-type')?.value ?? '';
      const charset = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] ?? 'utf-8';
      html.push(new TextDecoder(charset, { fatal: true }).decode(Buffer.from(data, 'base64url')));
      return;
    }
    for (const child of part.parts ?? []) await visit(child);
  }
  await visit(message.payload);
  if (html.length !== 1) throw new Error(`Esperado um corpo ${mimeType}; encontrados ${html.length}. Revisão necessária.`);
  return html[0];
}
