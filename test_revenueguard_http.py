import boto3
import json

client = boto3.client("lambda", region_name="ap-southeast-2")
name = "revenueguard-validation-api"

tests = [
    ("Valid request", '{"claims":[{"fact_id":"gross_sales","value":"1250.00"}]}', 200, "ACCEPTED"),
    ("Malformed JSON", '{"claims": [', 400, "REJECTED"),
    ("Empty claims", '{"claims":[]}', 400, "REJECTED"),
]

passed = 0

for title, body, expected_code, expected_status in tests:
    event = {
        "version": "2.0",
        "requestContext": {"http": {"method": "POST"}},
        "body": body,
        "isBase64Encoded": False
    }

    response = client.invoke(
        FunctionName=name,
        Payload=json.dumps(event).encode()
    )

    raw = json.load(response["Payload"])
    actual_code = raw.get("statusCode")
    result = json.loads(raw["body"]) if isinstance(raw.get("body"), str) else raw

    ok = (
        not response.get("FunctionError")
        and actual_code == expected_code
        and result.get("status") == expected_status
    )
    passed += int(ok)

    print(
        f'{"PASS" if ok else "FAIL"} | {title} | '
        f'HTTP {actual_code} | {result.get("status")}'
    )

print(f"\nRESULT: {passed}/{len(tests)} HTTP handling tests passed")

if passed != len(tests):
    raise SystemExit(1)
