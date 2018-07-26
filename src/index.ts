import assert from "assert";
import util from "util";

const time = Date.now() * 1e3;
const start = process.hrtime();
function microtime() {
  const diff = process.hrtime(start);
  return time + diff[0] * 1e6 + Math.round(diff[1] * 1e-3);
}

export interface IOptions {
  max?: number;
  duration?: number;
}

export interface IResult {
  count: number;
  remaining: number;
  reset: number;
  resetMs: number;
  total: number;
}

export default class ELimiter {
  private db: any;
  private id: string;
  private max: number;
  private duration: number;
  private key: string;

  constructor(db: any, id: string, opts: IOptions) {
    this.id = id;
    this.db = db;
    assert(this.id, ".id required");
    assert(this.db, ".db required");
    this.max = opts.max || 3600;
    this.duration = opts.duration || 3600000;
    this.key = "limit:" + this.id;
  }

  [util.inspect.custom]() {
    return `<Limiter id="${this.id}" duration=${this.duration} max=${this.max} />`;
  }

  get(): Promise<IResult> {
    const now = microtime();
    const start = now - this.duration * 1000;
    return this.db
      .multi()
      .zremrangebyscore(this.key, 0, start)
      .zcard(this.key)
      .zadd(this.key, String(now), String(now))
      .zrange(this.key, 0, 0)
      .pexpire(this.key, this.duration)
      .exec()
      .then((res: any[]) => {
        const count = parseInt(res[1][1]);
        const oldest = parseInt(res[3][1]);
        return {
          count,
          remaining: count < this.max ? this.max - count : 0,
          reset: Math.floor((oldest + this.duration * 1000) / 1000000),
          resetMs: Math.floor((oldest + this.duration * 1000) / 1000),
          total: this.max,
        };
      });
  }

  acquire() {
    const now = microtime();
    const start = now - this.duration * 1000;
    return this.db
      .multi()
      .zremrangebyscore(this.key, 0, start)
      .zcard(this.key)
      .zadd(this.key, String(now), String(now))
      .pexpire(this.key, this.duration)
      .exec()
      .then((res: any[]) => {
        const count = parseInt(res[1][1]);
        return this.max - count > 0;
      });
  }
}
