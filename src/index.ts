import assert from "assert";
import util from "util";

const time = Date.now() * 1e3;
const start = process.hrtime();
function microtime() {
  const diff = process.hrtime(start);
  return time + diff[0] * 1e6 + Math.round(diff[1] * 1e-3);
}

export interface IOpt {
  id?: string;
  max?: number;
  duration?: number;
}

export interface IOptions extends IOpt {
  namespace?: string;
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
  private namespace: string;

  constructor(db: any, opts: IOptions) {
    this.id = opts.id || "";
    this.db = db;
    assert(this.id, ".id required");
    assert(this.db, ".db required");
    this.max = opts.max || 3600;
    this.duration = opts.duration || 3600000;
    this.namespace = opts.namespace || "limit";
  }

  [util.inspect.custom]() {
    return `<Limiter id="${this.id}" duration=${this.duration} max=${this.max} />`;
  }

  get(id?: string): Promise<IResult>;
  get(opt?: IOpt): Promise<IResult>;
  get(arg: string | IOpt = {}): Promise<IResult> {
    const id = (typeof arg === "string" ? arg : arg.id) || this.id;
    const max = (typeof arg !== "string" && arg.max) || this.max;
    const duration = (typeof arg !== "string" && arg.duration) || this.duration;
    assert(id, "id required");
    assert(max, "max required");
    assert(duration, "duration required");
    const key = `${this.namespace}:${id}`;
    const now = microtime();
    const start = now - duration * 1000;
    return this.db
      .multi()
      .zremrangebyscore(key, 0, start)
      .zcard(key)
      .zadd(key, String(now), String(now))
      .zrange(key, 0, 0)
      .pexpire(key, duration)
      .exec()
      .then((res: any[]) => {
        const count = parseInt(res[1][1]);
        const oldest = parseInt(res[3][1]);
        return {
          count,
          remaining: count < max ? max - count : 0,
          reset: Math.floor((oldest + duration * 1000) / 1000000),
          resetMs: Math.floor((oldest + duration * 1000) / 1000),
          total: max,
        };
      });
  }
}
