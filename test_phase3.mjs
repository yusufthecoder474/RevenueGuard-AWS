
import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "./source/index.mjs";

const validPayload = {
  claims: [
    { fact_id: "gross_sales", value: "1250.00" },
    { fact_id: "refunds", value: "125.00" },
    { fact_id: "net_sales", value: "1125.00" }
  ]
};

function httpEvent(body, method = "POST", encoded = false) {
  return {
    version: "2.0",
    requestContext: {
      http: { method }
    },
    body,
    isBase64Encoded: encoded
  };
}

async function verify(event, expectedCode, expectedStatus) {
  const response = await handler(event);
  const result = JSON.parse(response.body);

  assert.equal(response.statusCode, expectedCode);
  assert.equal(result.status, expectedStatus);

  return { response, result };
}

test("POST accepts valid financial claims", async () => {
  await verify(
    httpEvent(JSON.stringify(validPayload)),
    200,
    "ACCEPTED"
  );
});

test("GET requests are rejected", async () => {
  const { response } = await verify(
    httpEvent(JSON.stringify(validPayload), "GET"),
    405,
    "REJECTED"
  );
  assert.equal(response.headers.Allow, "POST");
});

test("PUT requests are rejected", async () => {
  await verify(
    httpEvent(JSON.stringify(validPayload), "PUT"),
    405,
    "REJECTED"
  );
});

test("DELETE requests are rejected", async () => {
  await verify(
    httpEvent(JSON.stringify(validPayload), "DELETE"),
    405,
    "REJECTED"
  );
});

test("Oversized request is rejected", async () => {
  const oversized = JSON.stringify({
    ...validPayload,
    padding: "X".repeat(17000)
  });

  await verify(httpEvent(oversized), 413, "REJECTED");
});

test("Exactly 16 KB body passes size validation", async () => {
  const base = JSON.stringify(validPayload);
  const exactBody = JSON.stringify({
    ...validPayload,
    padding: "X".repeat(16384 - base.length - 13)
  });

  assert.equal(Buffer.byteLength(exactBody), 16384);

  await verify(httpEvent(exactBody), 200, "ACCEPTED");
});

test("Valid Base64 JSON is accepted", async () => {
  const encoded = Buffer.from(
    JSON.stringify(validPayload)
  ).toString("base64");

  await verify(
    httpEvent(encoded, "POST", true),
    200,
    "ACCEPTED"
  );
});

test("Invalid Base64 is rejected", async () => {
  await verify(
    httpEvent("%%%INVALID%%%", "POST", true),
    400,
    "REJECTED"
  );
});

test("Noncanonical Base64 is rejected", async () => {
  await verify(
    httpEvent("Zh==", "POST", true),
    400,
    "REJECTED"
  );
});

test("Invalid UTF-8 bytes are rejected", async () => {
  const invalidUtf8 = Buffer.from([
    0xff, 0xfe, 0xfd
  ]).toString("base64");

  await verify(
    httpEvent(invalidUtf8, "POST", true),
    400,
    "REJECTED"
  );
});

test("Malformed JSON is rejected", async () => {
  await verify(
    httpEvent('{"claims":['),
    400,
    "REJECTED"
  );
});

test("Empty claims are rejected", async () => {
  await verify(
    httpEvent(JSON.stringify({ claims: [] })),
    400,
    "REJECTED"
  );
});

test("Non-string HTTP body is rejected", async () => {
  await verify(
    httpEvent(validPayload),
    400,
    "REJECTED"
  );
});

test("Lambda console event remains supported", async () => {
  await verify(validPayload, 200, "ACCEPTED");
});
