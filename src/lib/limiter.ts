import assert from "assert";
import util from "util";

const time = Date.now() * 1e3;
const start = process.hrtime();
function microtime() {
  const diff = process.hrtime(start);
  return time + diff[0] * 1e6 + Math.round(diff[1] * 1e-3);
}

export interface IOpt {
  /** 限流标识 */
  id?: string;
  /** 限流数量 */
  max?: number;
  /** 时间窗口（ms） */
  duration?: number;
  /** 是否需要重置时间信息 */
  reset?: boolean;
}

export interface IOptions extends IOpt {
  /** 限流标识 */
  id: string;
  /** 限流器前缀（默认 limit） */
  namespace?: string;
}

export interface IResult {
  /** 当前时间总数 */
  count: number;
  /** 剩余数量 */
  remaining: number;
  /** 重置时间（s） */
  reset?: number;
  /** 重置时间（ms */
  resetMs?: number;
  /** 总数量 */
  total: number;
}

/**
 * 分布式限流
 */
export default class ELimiter {
  private db: any;
  private id: string;
  private max: number;
  private duration: number;
  private namespace: string;

  /**
   * 初始化限流器
   * @param db IORedis 实例
   * @param opts 参数
   */
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

  /**
   * 获取限流参数
   * @param id 限流标识（用户id、ip地址...)
   */
  get(id?: string): Promise<IResult>;

  /**
   * 获取限流参数
   * @param opt 限流参数
   */
  get(opt?: IOpt): Promise<IResult>;

  get(arg: string | IOpt = {}): Promise<IResult> {
    const id = (typeof arg === "string" ? arg : arg.id) || this.id;
    const max = (typeof arg !== "string" && arg.max) || this.max;
    const duration = (typeof arg !== "string" && arg.duration) || this.duration;
    const reset = typeof arg !== "string" && arg.reset;
    assert(id, "id required");
    assert(max, "max required");
    assert(duration, "duration required");
    const key = `${this.namespace}:${id}`;
    const now = microtime();
    const start = now - duration * 1000;
    const req = this.db
      .multi()
      .zremrangebyscore(key, 0, start)
      .zcard(key)
      .zadd(key, String(now), String(now));
    if (reset) req.zrange(key, 0, 0);
    req.pexpire(key, duration);
    return req.exec().then((res: any[]) => {
      const count = parseInt(res[1][1]);
      const result: IResult = {
        count,
        remaining: count < max ? max - count : 0,
        total: max,
      };
      if (reset) {
        const oldest = parseInt(res[3][1]);
        result.reset = Math.floor((oldest + duration * 1000) / 1000000);
        result.resetMs = Math.floor((oldest + duration * 1000) / 1000);
      }
      return result;
    });
  }
}
