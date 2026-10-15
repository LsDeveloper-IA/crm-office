import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Client } from "pg";
import { ownershipStream } from "../lib/ownership-stream";
import { mergeOwnershipRows, ownershipRowKey } from "../lib/ownership-row-sync";
import { ownershipListenerConnection } from "../lib/ownership-connection";

test("listener uses direct Neon endpoint while preserving TLS and explicit overrides", () => {
  const pooled = "postgresql://user:example@ep-test-pooler.region.aws.neon.tech/db?sslmode=require";
  const result = new URL(ownershipListenerConnection({ DATABASE_URL: pooled })!);
  assert.equal(result.hostname, "ep-test.region.aws.neon.tech");
  assert.equal(result.searchParams.get("sslmode"), "require");
  assert.equal(result.password, "example");
  assert.equal(ownershipListenerConnection({ DATABASE_URL: pooled, DIRECT_DATABASE_URL: "explicit" }), "explicit");
});

test("live refresh adds partners, replaces obsolete QSA rows, and preserves edits", () => {
  const partner = { companyCnpj: "company", partnerId: 1, amount: 17, observation: "unsaved", ownershipValueCents: "100" };
  const obsolete = { ...partner, partnerId: -1 };
  const local = { ...partner, partnerId: 3 };
  const incoming = [{ ...partner, amount: 0, observation: "saved", ownershipValueCents: "200" },
    { ...partner, partnerId: 2 }];
  const result = mergeOwnershipRows([partner, obsolete, local], incoming,
    new Set([partner, obsolete].map(ownershipRowKey)));
  assert.deepEqual(result.map(row => row.partnerId), [1, 2, 3]);
  assert.equal(result[0].ownershipValueCents, "200");
  assert.equal(result[0].amount, 17);
  assert.equal(result[0].observation, "unsaved");
});

test("SSE sends ready/updates without personal payload and releases connection on abort", async () => {
  const client = new EventEmitter() as EventEmitter & { end: () => Promise<void> };
  let ended = 0;
  client.end = async () => { ended++; };
  const abort = new AbortController();
  const reader = ownershipStream(client as unknown as Client, abort.signal).getReader();
  const decode = (value?: Uint8Array) => new TextDecoder().decode(value);
  assert.match(decode((await reader.read()).value), /retry: 3000/);
  assert.match(decode((await reader.read()).value), /event: ready/);
  client.emit("notification", { channel: "other", payload: "ignored" });
  client.emit("notification", { channel: "ownership_updated", payload: "private" });
  const event = decode((await reader.read()).value);
  assert.match(event, /event: ownership-updated/);
  assert.doesNotMatch(event, /private/);
  abort.abort();
  assert.equal((await reader.read()).done, true);
  assert.equal(ended, 1);
});

test("SSE releases its PostgreSQL connection when browser cancels", async () => {
  const client = new EventEmitter() as EventEmitter & { end: () => Promise<void> };
  let ended = 0;
  client.end = async () => { ended++; };
  const stream = ownershipStream(client as unknown as Client, new AbortController().signal);
  await stream.cancel();
  assert.equal(ended, 1);
  assert.equal(client.listenerCount("notification"), 0);
});

test("SSE closes when PostgreSQL disconnects so the browser can reconnect", async () => {
  const client = new EventEmitter() as EventEmitter & { end: () => Promise<void> };
  client.end = async () => {};
  const reader = ownershipStream(client as unknown as Client, new AbortController().signal).getReader();
  await reader.read();
  await reader.read();
  client.emit("end");
  assert.equal((await reader.read()).done, true);
});
