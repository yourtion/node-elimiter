[![NPM version][npm-image]][npm-url]
[![build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![David deps][david-image]][david-url]
[![node version][node-image]][node-url]
[![npm download][download-image]][download-url]
[![npm license][license-image]][download-url]

[npm-image]: https://img.shields.io/npm/v/elimiter.svg?style=flat-square
[npm-url]: https://npmjs.org/package/elimiter
[travis-image]: https://img.shields.io/travis/yourtion/node-elimiter.svg?style=flat-square
[travis-url]: https://travis-ci.org/yourtion/node-elimiter
[coveralls-image]: https://img.shields.io/coveralls/yourtion/node-elimiter.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/yourtion/node-elimiter?branch=master
[david-image]: https://img.shields.io/david/yourtion/node-elimiter.svg?style=flat-square
[david-url]: https://david-dm.org/yourtion/node-elimiter
[node-image]: https://img.shields.io/badge/node.js-%3E=_8-green.svg?style=flat-square
[node-url]: http://nodejs.org/download/
[download-image]: https://img.shields.io/npm/dm/elimiter.svg?style=flat-square
[download-url]: https://npmjs.org/package/elimiter
[license-image]: https://img.shields.io/npm/l/elimiter.svg

# node-elimiter

Easy rate limiter.

## Install

```bash
$ npm install elimiter --save
```

## How to use

```typescript
import Limiter from "elimiter";

const db = new Redis();

// limit 5 call in 60s (60*1000ms)
const limiter = new Limiter(db, { id: "ip", max: 5, duration: 60 * 1000 });

const res = await limit.get(); // limit.get(req.ip), limit(userid)
if(res.remaining < 1) throw new Errror("out of limit");
// continue
```

```typescript
// Get with reset and resetMs
const res = await limit.get({ reset: true });
console.log(res)
// { count: 0, remaining: 5, total: 5, reset: 1546438588, resetMs: 1546438588062 }
if(res.remaining < 1) throw new Errror("out of limit");
// continue
```
