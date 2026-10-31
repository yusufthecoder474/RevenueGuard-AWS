
const demoTransactions = [
  { id: "INV-101", type: "sale", amount: "500.00" },
  { id: "INV-102", type: "sale", amount: "750.00" },
  { id: "REF-103", type: "refund", amount: "125.00" }
];

// Convert decimal strings to integer cents without floating-point errors.
function toCents(value) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value)
  ) {
    return null;
  }

  const [whole, fraction = ""] = value.split(".");

  return BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));
}

function fromCents(cents) {
  const whole = cents / 100n;
  const fraction = (cents % 100n)
    .toString()
    .padStart(2, "0");

  return `${whole}.${fraction}`;
}

// Calculate trusted financial facts from synthetic transactions.
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
    refunds: refunds,
    net_sales: gross - refunds
  };
}

function respond(statusCode, result) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(result)
  };
}

export const handler = async (event) => {
  let input;

  // Support both Lambda console tests and HTTP Function URLs.
  try {
    if (typeof event?.body === "string") {
      input = JSON.parse(event.body);
    } else if (event?.body !== undefined) {
      input = event.body;
    } else {
      input = event;
    }
  } catch {
    return respond(400, {
      status: "REJECTED",
      reason: "Invalid JSON body"
    });
  }

  // Validate the incoming request.
  if (
    !input ||
    !Array.isArray(input.claims) ||
    input.claims.length < 1 ||
    input.claims.length > 20
  ) {
    return respond(400, {
      status: "REJECTED",
      reason: "Provide between 1 and 20 claims."
    });
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
