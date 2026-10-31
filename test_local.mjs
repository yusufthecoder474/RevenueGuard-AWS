import assert from 'node:assert/strict';
import { handler } from './source/index.mjs';
const cases = [
 ['valid', {claims:[{fact_id:'gross_sales',value:'1250.00'},{fact_id:'refunds',value:'125.00'},{fact_id:'net_sales',value:'1125.00'}]},200,'ACCEPTED'],
 ['incorrect', {claims:[{fact_id:'gross_sales',value:'1.00'}]},200,'REJECTED'],
 ['duplicate', {claims:[{fact_id:'gross_sales',value:'1250.00'},{fact_id:'gross_sales',value:'1250.00'}]},200,'REJECTED'],
 ['unsupported', {claims:[{fact_id:'unknown',value:'1.00'}]},200,'REJECTED'],
 ['invalid decimal', {claims:[{fact_id:'refunds',value:'1.234'}]},200,'REJECTED'],
 ['negative', {claims:[{fact_id:'refunds',value:'-1.00'}]},200,'REJECTED'],
 ['missing id', {claims:[{value:'1.00'}]},200,'REJECTED'],
 ['empty', {claims:[]},400,'REJECTED'],
 ['missing claims', {},400,'REJECTED'],
 ['malformed JSON', {body:'{"claims":['},400,'REJECTED'],
 ['HTTP wrapped', {body:JSON.stringify({claims:[{fact_id:'net_sales',value:'1125.00'}]})},200,'ACCEPTED']
];
for(const [name,event,code,status] of cases){const response=await handler(event);assert.equal(response.statusCode,code,name);assert.equal(JSON.parse(response.body).status,status,name);console.log('PASS',name)}
console.log(`${cases.length}/${cases.length} local tests passed`);
