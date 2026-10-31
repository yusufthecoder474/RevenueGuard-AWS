
const demoTransactions = [
  { id: "INV-101", type: "sale", amount: "500.00" },
  { id: "INV-102", type: "sale", amount: "750.00" },
  { id: "REF-103", type: "refund", amount: "125.00" }
];

const MAX_BODY_BYTES = 16 * 1024;

// Convert decimal strings into integer cents.
function toCents(value) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value)
  ) {
    return null;
  }

  const [whole, fraction = ""] = value.split(".");

  return (
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"))
  );
}

function fromCents(cents) {
  const whole = cents / 100n;
  const fraction = (cents % 100n)
    .toString()
    .padStart(2, "0");

  return `${whole}.${fraction}`;
}

// Trusted calculations from synthetic transactions.
function calculateFacts() {
  const total = (type) =>
    demoTransactions
      .filter((item) => item.type === type)
      .reduce(
        (sum, item) => sum + toCents(item.amount),
        0n
      );

  const gross = total("sale");
  const refunds = total("refund");

  return {
    gross_sales: gross,
    refunds,
    net_sales: gross - refunds
  };
}

// Standard Lambda HTTP response.
function respond(statusCode, result, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify(result)
  };
}

function reject(statusCode, reason, headers = {}) {
  return respond(
    statusCode,
    { status: "REJECTED", reason },
    headers
  );
}

// Validate HTTP request boundaries.
function validateHttpRequest(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const method = event.requestContext?.http?.method;

  if (method !== undefined && method !== "POST") {
    return {
      statusCode: 405,
      reason: "Only POST requests are allowed",
      headers: { Allow: "POST" }
    };
  }

  if (event.body === undefined) {
    return null;
  }

  if (typeof event.body !== "string") {
    return {
      statusCode: 400,
      reason: "Invalid HTTP request body"
    };
  }

  let bodyBytes;

  if (event.isBase64Encoded === true) {
    const validBase64 =
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

    if (!validBase64.test(event.body)) {
      return {
        statusCode: 400,
        reason: "Invalid Base64 body"
      };
    }

    bodyBytes = Buffer.from(event.body, "base64");

    if (bodyBytes.toString("base64") !== event.body) {
      return {
        statusCode: 400,
        reason: "Invalid Base64 body"
      };
    }
  } else {
    bodyBytes = Buffer.from(event.body, "utf8");
  }

  if (bodyBytes.length > MAX_BODY_BYTES) {
    return {
      statusCode: 413,
      reason: "Request body exceeds 16 KB"
    };
  }

  try {
    new TextDecoder("utf-8", { fatal: true })
      .decode(bodyBytes);
  } catch {
    return {
      statusCode: 400,
      reason: "Invalid UTF-8 body"
    };
  }

  return null;
}

// AWS Lambda entry point.
export const handler = async (event) => {
  const requestError = validateHttpRequest(event);

  if (requestError) {
    return reject(
      requestError.statusCode,
      requestError.reason,
      requestError.headers
    );
  }

  let input;

  // Support Lambda console and HTTP Function URL events.
  try {
    if (typeof event?.body === "string") {
      const rawBody = event.isBase64Encoded === true
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;

      input = JSON.parse(rawBody);
    } else if (event?.body !== undefined) {
      input = event.body;
    } else {
      input = event;
    }
  } catch {
    return reject(400, "Invalid JSON body");
  }

  // Validate claim count and structure.
  if (
    !input ||
    !Array.isArray(input.claims) ||
    input.claims.length < 1 ||
    input.claims.length > 20
  ) {
    return reject(
      400,
      "Provide between 1 and 20 claims."
    );
  }

  const facts = calculateFacts();
  const seen = new Set();

  const checks = input.claims.map((claim) => {
    const factId = claim?.fact_id;

    if (typeof factId !== "string") {
      return {
        fact_id: null,
        verdict: "REJECTED",
        reason: "Missing fact identifier"
      };
    }

    if (seen.has(factId)) {
      return {
        fact_id: factId,
        verdict: "REJECTED",
        reason: "Duplicate claim"
      };
    }

    seen.add(factId);

    if (!Object.hasOwn(facts, factId)) {
      return {
        fact_id: factId,
        verdict: "REJECTED",
        reason: "Unsupported fact"
      };
    }

    const submittedValue = toCents(claim.value);

    if (submittedValue === null) {
      return {
        fact_id: factId,
        verdict: "REJECTED",
        reason: "Invalid decimal amount"
      };
    }

    if (submittedValue !== facts[factId]) {
      return {
        fact_id: factId,
        verdict: "REJECTED",
        reason: `Expected ${fromCents(facts[factId])}`
      };
    }

    return {
      fact_id: factId,
      verdict: "ACCEPTED",
      reason: "Matches trusted source calculation"
    };
  });

  const status = checks.every(
    (check) => check.verdict === "ACCEPTED"
  )
    ? "ACCEPTED"
    : "REJECTED";

  console.log("Validation completed:", {
    status,
    claimCount: checks.length
  });

  return respond(200, {
    status,
    dataset: "synthetic-demo-v1",
    checks
  });
};
