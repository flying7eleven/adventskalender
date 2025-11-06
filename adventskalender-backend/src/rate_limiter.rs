use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use std::sync::LazyLock;

#[derive(Clone)]
pub(crate) struct RateLimitEntry {
    attempts: u32,
    window_start: DateTime<Utc>,
}

pub(crate) static RATE_LIMITER: LazyLock<DashMap<String, RateLimitEntry>> =
    LazyLock::new(DashMap::new);

pub struct RateLimitConfig {
    pub max_attempts: u32,
    pub window_minutes: i64,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        RateLimitConfig {
            max_attempts: 5,
            window_minutes: 15,
        }
    }
}

pub fn is_rate_limited(key: &str, config: &RateLimitConfig) -> bool {
    let now = Utc::now();

    let mut entry = RATE_LIMITER
        .entry(key.to_string())
        .or_insert(RateLimitEntry {
            attempts: 0,
            window_start: now,
        });

    let window_duration = Duration::minutes(config.window_minutes);
    if now - entry.window_start > window_duration {
        // Reset window
        entry.attempts = 1;
        entry.window_start = now;
        return false;
    }

    if entry.attempts >= config.max_attempts {
        return true;
    }

    entry.attempts += 1;
    false
}

pub fn reset_rate_limit(key: &str) {
    RATE_LIMITER.remove(key);
}

pub fn cleanup_old_entries(config: &RateLimitConfig) {
    let now = Utc::now();
    let window_duration = Duration::minutes(config.window_minutes);

    RATE_LIMITER.retain(|_, entry| now - entry.window_start <= window_duration);
}
