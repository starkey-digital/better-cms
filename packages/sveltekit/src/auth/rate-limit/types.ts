export interface RateLimitHit {
	count: number;
	resetAt: number;
}

export interface RateLimitStore {
	incr(key: string, windowSec: number): Promise<RateLimitHit>;
	reset(key: string): Promise<void>;
}
