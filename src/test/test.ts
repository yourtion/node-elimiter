import Redis from "ioredis";
import Limiter, { IResult } from "../lib";

function sleep(time: number) {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

describe("Limiter", function() {
  const db = new Redis();

  beforeEach(async function() {
    const keys = await db.keys("limit:*");
    if (keys.length > 0) {
      await db.del(...keys);
    }
  });

  afterAll(() => {
    db.disconnect();
  });

  describe(".total", function() {
    it("should represent the total limit per reset period", async function() {
      expect.assertions(1);
      const limit = new Limiter(db, { id: "something", max: 5 });
      console.log(limit);
      const res = await limit.get();
      expect(res.total).toEqual(5);
    });
  });

  describe(".remaining", function() {
    it("should represent the number of requests remaining in the reset period", async function() {
      expect.assertions(3);
      const limit = new Limiter(db, { id: "something", max: 5, duration: 100000 });
      let res = await limit.get();
      expect(res.remaining).toEqual(5);

      res = await limit.get();
      expect(res.remaining).toEqual(4);

      res = await limit.get();
      expect(res.remaining).toEqual(3);
    });
  });

  describe(".reset", function() {
    it("should represent the next reset time in UTC epoch seconds", async function() {
      expect.assertions(2);
      const limit = new Limiter(db, { id: "something", max: 5, duration: 60000 });
      const res = await limit.get({ reset: true });
      const left = res.reset! - Date.now() / 1000;
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThan(60);
    });
  });

  describe(".resetMs", function() {
    it("should represent the next reset time in UTC epoch milliseconds", async function() {
      expect.assertions(4);
      const limit = new Limiter(db, { id: "something", max: 5, duration: 60000 });
      const res = await limit.get({ reset: true });
      const left = res.resetMs! - Date.now();
      expect(Number.isInteger(left)).toBe(true);
      expect(res.ok).toBeTruthy();
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThanOrEqual(60000);
    });
  });

  describe("when the limit is exceeded", function() {
    it("should retain .remaining at 0", async function() {
      expect.assertions(6);
      const limit = new Limiter(db, { id: "something", max: 2 });
      let res = await limit.get();
      expect(res.remaining).toEqual(2);
      expect(res.ok).toBeTruthy();
      res = await limit.get();
      expect(res.remaining).toEqual(1);
      expect(res.ok).toBeTruthy();
      res = await limit.get();
      // function caller should reject this call
      expect(res.remaining).toEqual(0);
      expect(res.ok).toBeFalsy();
    });
  });

  describe("when the duration is exceeded", function() {
    it("should reset", async function() {
      expect.assertions(4);
      const limit = new Limiter(db, { id: "something", max: 2, duration: 100 });

      let res = await limit.get();
      expect(res.remaining).toEqual(2);

      res = await limit.get();
      expect(res.remaining).toEqual(1);

      await sleep(110);
      res = await limit.get({ reset: true });
      expect(res.remaining).toEqual(2);
      var left = res.reset! - Date.now() / 1000;
      expect(left).toBeLessThan(2);
    });
  });

  describe("when multiple successive calls are made", function() {
    it("the next calls should not create again the limiter in Redis", async function() {
      expect.assertions(2);
      const limit = new Limiter(db, { id: "something", max: 2, duration: 10000 });
      const res1q = limit.get();
      const res2q = limit.get();
      const [res1, res2] = await Promise.all([res1q, res2q]);
      expect(res1.remaining).toEqual(2);
      expect(res2.remaining).toEqual(1);
    });

    it("updating the count should keep all TTLs in sync", async function() {
      expect.assertions(2);
      const limit = new Limiter(db, { id: "something", max: 2, duration: 10000 });
      limit.get(); // All good here.
      await limit.get();
      const res2 = await (db as any)
        .multi()
        .pttl(["limit:something:count"])
        .pttl(["limit:something:limit"])
        .pttl(["limit:something:reset"])
        .exec();
      var ttlCount = res2[0][1];
      var ttlLimit = res2[1][1];
      var ttlReset = res2[2][1];
      expect(ttlLimit).toEqual(ttlCount);
      expect(ttlReset).toEqual(ttlCount);
    });
  });

  describe("when trying to decrease before setting value", function() {
    it("should create with ttl when trying to decrease", async function() {
      expect.assertions(3);
      const limit = new Limiter(db, { id: "something", max: 2, duration: 10000 });
      await db.set("limit:something:count", 1);
      let res = await limit.get();
      expect(res.remaining).toEqual(2);
      res = await limit.get();
      expect(res.remaining).toEqual(1);
      res = await limit.get();
      expect(res.remaining).toEqual(0);
    });
  });

  describe("when multiple concurrent clients modify the limit", function() {
    const clientsCount = 7;
    const max = 5;
    let left = max;
    const limits: Limiter[] = [];
    const rediss: Redis.Redis[] = [];
    for (var i = 0; i < clientsCount; ++i) {
      const db2 = new Redis();
      rediss.push(db2);
      limits.push(new Limiter(db2, { id: "something", duration: 10000, max }));
    }

    it("should prevent race condition and properly set the expected value", function(done) {
      expect.assertions(2 * clientsCount - max + 2);

      const responses: IResult[] = [];

      function complete() {
        responses.push(arguments[0]);

        if (responses.length == clientsCount) {
          responses.sort((r1, r2) => {
            return r2.remaining - r1.remaining;
          });
          responses.forEach(res => {
            expect(res.remaining).toEqual(left < 0 ? 0 : left);
            left--;
          });

          for (var i = max - 1; i < clientsCount; ++i) {
            expect(responses[i].remaining).toEqual(0);
          }

          done();
        }
      }

      // Warm up and prepare the data.
      limits[0].get().then(res => {
        expect(res.remaining).toEqual(left--);
        // Simulate multiple concurrent requests.
        limits.forEach(function(limit) {
          limit.get().then(complete);
        });
        rediss.forEach(db => db.disconnect());
      });
    });
  });

  describe("when limiter is called in parallel by multiple clients", function() {
    let max = 6;
    const db2 = new Redis();
    const limiter = new Limiter(db2, { id: "asyncsomething", max, duration: 10000 });

    it("should set the count properly without race conditions", async function() {
      expect.assertions(max + 1);

      const arr = [];
      for (let i = 0; i <= max; i++) {
        arr.push(limiter.get());
      }
      const limits = await Promise.all(arr);
      limits.forEach(function(limit) {
        expect(limit.remaining).toEqual(max--);
      });
      db2.disconnect();
    });
  });

  describe("when get is called with max option", function() {
    it("should represent the custom total limit per reset period", async function() {
      expect.assertions(3);
      const limit = new Limiter(db, { id: "something" });

      let res;
      res = await limit.get({ max: 10 });
      expect(res.remaining).toEqual(10);
      res = await limit.get({ max: 10 });
      expect(res.remaining).toEqual(9);
      res = await limit.get({ max: 10 });
      expect(res.remaining).toEqual(8);
    });

    it("should take the default limit as fallback", async function() {
      expect.assertions(4);
      const limit = new Limiter(db, { id: "something", max: 5 });

      let res = await limit.get({ max: 10 });
      expect(res.remaining).toEqual(10);
      res = await limit.get({ max: 10 });
      expect(res.remaining).toEqual(9);
      res = await limit.get();
      expect(res.remaining).toEqual(3);
      res = await limit.get();
      expect(res.remaining).toEqual(2);
    });
  });

  describe("when get is called with id option", function() {
    it("should represent the custom total limit per reset period", async function() {
      expect.assertions(5);
      const limit = new Limiter(db, { id: "something", max: 5 });

      let res;
      res = await limit.get("other");
      expect(res.remaining).toEqual(5);
      res = await limit.get("other");
      expect(res.remaining).toEqual(4);
      res = await limit.get();
      expect(res.remaining).toEqual(5);
      res = await limit.get();
      expect(res.remaining).toEqual(4);
      res = await limit.get("other");
      expect(res.remaining).toEqual(3);
    });
  });

  describe("when get is called with duration", function() {
    it("should reset after custom duration", async function() {
      expect.assertions(2);
      const limit = new Limiter(db, { id: "something", max: 5 });

      const res = await limit.get({ duration: 10000, reset: true });
      expect(res.remaining).toEqual(5);
      const left = res.reset! - Date.now() / 1000;
      expect(left).toBeLessThan(10);
    });

    it("should take the default duration as fallback", async function() {
      expect.assertions(5);
      const limit = new Limiter(db, { id: "something", max: 5, duration: 25000 });

      let res = await limit.get({ duration: 10000, reset: true });
      expect(res.remaining).toEqual(5);
      let left = res.reset! - Date.now() / 1000;
      expect(left).toBeLessThan(10);

      res = await limit.get({ reset: true });
      expect(res.remaining).toEqual(4);
      left = res.reset! - Date.now() / 1000;
      expect(left).toBeLessThan(25);
      expect(left).toBeGreaterThan(10);
    });
  });

  describe("when having old data earlier then the duration ", function() {
    it("the old request data eariler then the duration time should be ignore", async function() {
      expect.assertions(7);
      const limit = new Limiter(db, { id: "something", max: 5, duration: 250 });
      let res = await limit.get();
      expect(res.remaining).toEqual(5);

      let times = 6;
      do {
        res = await limit.get();
        expect(res.remaining).toBeGreaterThan(0);
        await sleep(100);
        times--;
      } while (times > 0);
    });
  });
});
