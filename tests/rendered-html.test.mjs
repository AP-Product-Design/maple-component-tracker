import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the authenticated Maple entry shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Maple Component Tracker<\/title>/i);
  assert.match(html, /<h1>Connecting to Maple<\/h1>/);
  assert.match(html, /Checking your AP account/);
  assert.match(html, /AP News design system/);
  assert.doesNotMatch(html, /Grooming workspace|Component priorities/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("includes tracker metadata and the social preview", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Review design readiness and platform delivery gaps across the Maple system\./);
  assert.match(html, /og\.png/);
  assert.match(html, /summary_large_image/);
});
