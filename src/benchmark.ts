import Limiter from "./";

import Benchmark from "@leizm/benchmark";
import Redis from "ioredis";

const db = new Redis();
const limit = new Limiter(db, { id: "something", max: 110 });

const b = new Benchmark({ title: "Limiter" });
b.addAsync("preheat", async () => await limit.get())
  .addAsync("get with rest", async () => await limit.get({ reset: true }))
  .addAsync("get without rest", async () => await limit.get())
  .run()
  .then(r => b.print(r) && process.exit(0))
  .catch(console.log);
