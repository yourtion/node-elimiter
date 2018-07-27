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
