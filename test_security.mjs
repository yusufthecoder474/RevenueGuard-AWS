import assert from 'node:assert/strict';
import test from 'node:test';
import { handler } from './source/index.mjs';

const claim = (fact_id, value) => ({ fact_id, value });
const cases = [
  ['valid all three', { claims: [claim('gross_sales','1250.00'), claim('refunds','125.00'), claim('net_sales','1125.00')] }, 200, 'ACCEPTED'],
  ['incorrect gross', { claims: [claim('gross_sales','1250.01')] }, 200, 'REJECTED'],
  ['duplicate identifier', { claims: [claim('refunds','125.00'), claim('refunds','125.00')] }, 200, 'REJECTED'],
  ['unsupported identifier', { claims: [claim('private_key','1.00')] }, 200, 'REJECTED'],
  ['missing identifier', { claims: [{value:'125.00'}] }, 200, 'REJECTED'],
  ['null claim', { claims: [null] }, 200, 'REJECTED'],
  ['invalid decimal precision', { claims: [claim('refunds','125.001')] }, 200, 'REJECTED'],
  ['negative amount', { claims: [claim('refunds','-125.00')] }, 200, 'REJECTED'],
  ['number rather than string', { claims: [claim('refunds',125)] }, 200, 'REJECTED'],
  ['empty claims', { claims: [] }, 400, 'REJECTED'],
  ['missing claims', {}, 400, 'REJECTED'],
  ['21 claims', { claims: Array.from({length:21},()=>claim('refunds','125.00')) }, 400, 'REJECTED'],
  ['malformed JSON', {body:'{"claims":['}, 400, 'REJECTED'],
  ['HTTP wrapped valid', {body:JSON.stringify({claims:[claim('net_sales','1125.00')]})}, 200, 'ACCEPTED'],
  ['HTTP wrapped empty', {body:JSON.stringify({claims:[]})}, 400, 'REJECTED'],
];

for (const [name,event,expectedCode,expectedStatus] of cases) {
  test(name, async () => {
    const response = await handler(event);
    assert.equal(response.statusCode, expectedCode);
    const payload = JSON.parse(response.body);
    assert.equal(payload.status, expectedStatus);
  });
}
