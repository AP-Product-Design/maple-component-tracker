import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function renderedHtml() {
  return readFile(new URL("../dist/index.html", import.meta.url), "utf8");
}

test("builds the Maple tracker application shell", async () => {
  const html = await renderedHtml();
  assert.match(html, /<title>Maple Component Tracker<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /type="module"/);
});

test("includes tracker metadata and the social preview", async () => {
  const html = await renderedHtml();

  assert.match(html, /Review design readiness and platform delivery gaps across the Maple system\./);
  assert.match(html, /og\.png/);
  assert.match(html, /summary_large_image/);
});
