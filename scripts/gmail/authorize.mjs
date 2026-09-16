import 'dotenv/config';

import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  credentials,
  exchangeToken,
  SCOPE,
  TOKEN_FILE,
} from './gmail.mjs';

const redirectUri = 'http://127.0.0.1:53682/oauth2/callback';

const creds = credentials();

if (!creds.client_id || !creds.client_secret) {
  console.error(
    'GMAIL_CLIENT_ID ou GMAIL_CLIENT_SECRET não configurados no .env.'
  );
  process.exit(1);
}

const state = randomBytes(32).toString('hex');

const verifier = randomBytes(48).toString('base64url');

const challenge = createHash('sha256')
  .update(verifier)
  .digest('base64url');

const url = new URL(
  'https://accounts.google.com/o/oauth2/v2/auth'
);

url.search = new URLSearchParams({
  client_id: creds.client_id,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent',
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
}).toString();

let processing = false;

const server = createServer(async (request, response) => {
  const callback = new URL(
    request.url ?? '/',
    'http://127.0.0.1:53682'
  );

  if (callback.pathname !== '/oauth2/callback') {
    response.writeHead(404);
    response.end('Rota nao encontrada.');
    return;
  }

  if (callback.searchParams.get('state') !== state) {
    response.writeHead(400);
    response.end('State OAuth invalido.');
    return;
  }

  if (processing) {
    response.writeHead(400);
    response.end('Autorizacao ja esta sendo processada.');
    return;
  }

  processing = true;

  try {
    const oauthError = callback.searchParams.get('error');

    if (oauthError) {
      throw new Error(
        `Google recusou a autorização: ${oauthError}`
      );
    }

    const code = callback.searchParams.get('code');

    if (!code) {
      throw new Error(
        'Google não retornou o código de autorização.'
      );
    }

    const token = await exchangeToken({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });

    if (!token.refresh_token) {
      throw new Error(
        'Google não retornou refresh_token. Revogue a autorização anterior e autorize novamente.'
      );
    }

    await mkdir(dirname(TOKEN_FILE), {
      recursive: true,
    });

    await writeFile(
      TOKEN_FILE,
      JSON.stringify(
        {
          refresh_token: token.refresh_token,
        },
        null,
        2
      ),
      {
        mode: 0o600,
      }
    );

    response.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
    });

    response.end(
      'Autorizado com sucesso. Pode fechar esta janela.'
    );

    console.log('');
    console.log('OAuth autorizado com sucesso.');
    console.log(`Credencial salva em: ${TOKEN_FILE}`);
    console.log('Não compartilhe esse arquivo.');
  } catch (error) {
    response.writeHead(400, {
      'Content-Type': 'text/plain; charset=utf-8',
    });

    response.end(
      'Falha na autorização. Veja o terminal.'
    );

    console.error('');
    console.error('Erro OAuth:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    server.close();
  }
});

const timeout = setTimeout(() => {
  console.error('Tempo de autorização esgotado.');

  server.close();

  process.exitCode = 1;
}, 300000);

server.on('error', (error) => {
  clearTimeout(timeout);

  console.error('Erro no servidor OAuth:');
  console.error(error);

  process.exitCode = 1;
});

server.listen(53682, '127.0.0.1', () => {
  console.log('');
  console.log('Abra esta URL no navegador:');
  console.log('');
  console.log(url.toString());
  console.log('');
});
