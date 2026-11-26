import test from 'node:test';
import assert from 'node:assert/strict';
import {registry} from '../dist/widgets/index.js';
import {BoardStore} from '../dist/core/store.js';
import {savingsTotal,rebaseRates,parseDecimal,validateSavings,neededRateCodes} from '../dist/widgets/savings-data.js';
import {parseRateRows} from '../dist/widgets/savings-rates.js';

const savings = {
  totalCurrency:'EUR', rates:{USD:0.9}, accounts:[
    {id:'a',name:'Резерв',currency:'EUR',color:'#52754e',balances:[{date:'2026-11-14',amount:600},{date:'2026-11-10',amount:500}]},
    {id:'b',name:'Валютный',currency:'USD',color:'#577997',balances:[{date:'2026-11-12',amount:200},{date:'2026-12-01',amount:10000}]},
  ],
};

test('totals use the most recent balance as of the selected day, even with unordered history',()=>{
  assert.equal(savingsTotal(savings,'2026-11-09').amount,null);
  assert.equal(savingsTotal(savings,'2026-11-11').amount,500);
  assert.equal(savingsTotal(savings,'2026-11-12').amount,680);
  assert.equal(savingsTotal(savings,'2026-11-14').amount,780);
  assert.deepEqual(savingsTotal({...savings,rates:{}},'2026-11-14'),{amount:null,recorded:2,missing:['USD']});
});

test('changing the total currency rebases known rates and clears incompatible rates when the cross rate is missing',()=>{
  assert.deepEqual(rebaseRates({USD:0.8,GBP:1.2},'EUR','USD'),{EUR:1.25,GBP:1.5});
  assert.deepEqual(rebaseRates({GBP:1.2},'EUR','USD'),{});
  assert.equal(parseDecimal('1 234,56'),1234.56);
  assert.ok(Number.isNaN(parseDecimal('12abc')));
});

test('online quotes are inverted, never taken from after the valuation date, and manual rates fill gaps',()=>{
  const day='2026-11-14';
  const rates=parseRateRows([
    {date:'2026-11-12',base:'EUR',quote:'USD',rate:1.5},
    {date:'2026-11-13',base:'EUR',quote:'USD',rate:1.25},
    {date:'2026-11-15',base:'EUR',quote:'USD',rate:2},
    {date:'2026-11-14',base:'USD',quote:'RUB',rate:100},
    {date:'2026-11-14',base:'EUR',quote:'GBP',rate:0},
  ],'EUR',day);
  assert.deepEqual(rates,{USD:{date:'2026-11-13',rate:0.8}});
  assert.deepEqual(neededRateCodes(savings,'2026-11-11'),[]);
  assert.deepEqual(neededRateCodes(savings,day),['USD']);
  assert.equal(savingsTotal(savings,day,rates).amount,760);
  const withRoubles=structuredClone(savings);
  withRoubles.accounts.push({currency:'RUB',balances:[{date:day,amount:9000}]});
  withRoubles.rates.RUB=0.01;
  assert.equal(savingsTotal(withRoubles,day,rates).amount,850);
});

test('savings data survives board export and import, and invalid dates and duplicate entries are rejected',()=>{
  const empty={schemaVersion:1,nodes:[]};
  const first=new BoardStore(registry,empty,null);
  const id=first.add('savings');
  first.update(id,{data:savings});
  const second=new BoardStore(registry,empty,null);
  second.import(JSON.parse(first.export()));
  assert.deepEqual(second.get(id).data,savings);
  const invalid=structuredClone(savings);
  invalid.accounts[0].balances.push({date:'2026-02-30',amount:1});
  assert.equal(validateSavings(invalid),false);
  invalid.accounts[0].balances[2].date='2026-11-14';
  assert.equal(validateSavings(invalid),false);
});
