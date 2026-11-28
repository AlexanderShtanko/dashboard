import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCamera,parseZoom} from '../dist/core/geometry.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≈ ${b}`);
test('fit shows all cards with only the given padding and may zoom past 100%',()=>{
  const b={left:0,right:400,top:0,bottom:200};
  const c=fitCamera(b,{w:1000,h:600,pad:20});
  close(c.z,Math.min(960/400,560/200,2)); // 2.4 → capped at 2
  const d=fitCamera({left:0,right:2000,top:0,bottom:1000},{w:1000,h:600,pad:20});
  close(d.z,.48);close(d.x,20);close(d.y+500*.48,300); // edge sits exactly at the padding
});
test('fit keeps cards clear of the dock and breadcrumbs',()=>{
  const c=fitCamera({left:-500,right:500,top:-300,bottom:300},{w:1100,h:800,top:40,bottom:80,pad:24});
  close(c.z,Math.min(1052/1000,632/600));
  close(c.y+(-300)*c.z,40+24+(632-600*c.z)/2);
});
test('typed zoom accepts percents and factors and clamps to the range',()=>{
  assert.equal(parseZoom('150'),1.5);assert.equal(parseZoom(' 75 % '),.75);assert.equal(parseZoom('1,5x'),1.5);
  assert.equal(parseZoom('5'),.2);assert.equal(parseZoom('900%'),2);assert.equal(parseZoom('abc'),null);assert.equal(parseZoom(''),null);
});
