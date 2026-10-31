import boto3
import json

client = boto3.client("lambda", region_name="ap-southeast-2")
function_name = "revenueguard-validation-api"

def claim(fact_id, value):
    return {"fact_id": fact_id, "value": value}

cases = [
    ("Valid three claims", [
        claim("gross_sales", "1250.00"),
        claim("refunds", "125.00"),
        claim("net_sales", "1125.00")
    ], "ACCEPTED"),

    ("Incorrect gross sales", [
        claim("gross_sales", "9999.00")
    ], "REJECTED"),

    ("Duplicate claim", [
        claim("gross_sales", "1250.00"),
        claim("gross_sales", "1250.00")
    ], "REJECTED"),

    ("Unsupported fact", [
        claim("profit", "100.00")
    ], "REJECTED"),

    ("Invalid decimal", [
        claim("gross_sales", "12.345")
    ], "REJECTED"),

    ("Negative amount", [
        claim("gross_sales", "-1250.00")
    ], "REJECTED"),

    ("Missing fact ID", [
        {"value": "1250.00"}
    ], "REJECTED"),

    ("Empty claims", [], "REJECTED"),

    ("Maximum 20 claims", [
        claim("gross_sales", "1250.00")
        for _ in range(20)
    ], "REJECTED"),

    ("More than 20 claims", [
        claim("gross_sales", "1250.00")
        for _ in range(21)
    ], "REJECTED"),

    ("Missing claims property", None, "REJECTED")
]

passed = 0

for name, claims, expected in cases:
    payload = {"claims": claims} if claims is not None else {}

    response = client.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(payload).encode()
    )

    raw = json.load(response["Payload"])
    result = json.loads(raw["body"]) if "body" in raw else raw

    actual = result.get("status")
    runtime_error = response.get("FunctionError")

    ok = actual == expected and not runtime_error
    passed += int(ok)

    print(
        f'{"PASS" if ok else "FAIL"} | '
        f'{name} | Expected: {expected} | Actual: {actual}'
    )

print(f"\nRESULT: {passed}/{len(cases)} tests passed")

if passed != len(cases):
    raise SystemExit(1)
