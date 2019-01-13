import Limiter from "../lib";

import Benchmark from "@leizm/benchmark";
import Redis from "ioredis";

const db = new Redis();
const limit = new Limiter(db, { id: "benchmark", max: 110 });

const b = new Benchmark({ title: "Limiter", seconds: 10, delay: 1 });
b.addAsync("preheat", async () => await limit.get())
  .addAsync("get with rest", async () => await limit.get({ reset: true }))
  .addAsync("get without rest", async () => await limit.get())
  .run()
  .then(r => b.print(r) && process.exit(0))
  .catch(console.log);
