import { Client } from "pg";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ownershipStream } from "@/lib/ownership-stream";
import { ownershipListenerConnection } from "@/lib/ownership-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { active: true } });
  if (!account?.active) return new Response("Não autenticado", { status: 401 });

  const connectionString = ownershipListenerConnection(process.env);
  if (!connectionString) return new Response("Banco não configurado", { status: 503 });
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  let connectionFailed = false;
  const onSetupError = () => { connectionFailed = true; };
  client.on("error", onSetupError);
  try {
    await client.connect();
    await client.query("LISTEN ownership_updated");
    if (connectionFailed) throw new Error("Listener indisponível");
    const stream = ownershipStream(client, request.signal);
    client.removeListener("error", onSetupError);
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-cache, no-transform",
      "X-Accel-Buffering": "no",
    } });
  } catch {
    await client.end().catch(() => {});
    client.removeListener("error", onSetupError);
    return new Response("Sincronização temporariamente indisponível", { status: 503 });
  }
}
