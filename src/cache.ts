/**
 * Simple in-memory TTL cache for API responses
 */

import { CacheEntry, DEFAULT_CONFIG } from './types';

export class TtlCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number = DEFAULT_CONFIG.cacheTtlMs) {
    this.ttlMs = ttlMs;
  }

  /**
   * Generate a cache key from query parameters
   */
  static generateKey(params: Record<string, unknown>): string {
    const sorted = Object.keys(params)
      .sort()
      .map((key) => `${key}=${JSON.stringify(params[key])}`)
      .join('&');
    return sorted;
  }

  /**
   * Get a value from cache if it exists and hasn't expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      // Entry has expired, remove it
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set a value in the cache with TTL
   */
  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Remove a specific key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove all expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; ttlMs: number } {
    return {
      size: this.cache.size,
      ttlMs: this.ttlMs,
    };
  }
}

// Singleton caches for different data types
export const geocodeCache = new TtlCache<{ lat: number; lng: number; formattedAddress: string }>();
export const searchCache = new TtlCache<unknown>();
export const detailsCache = new TtlCache<unknown>();
