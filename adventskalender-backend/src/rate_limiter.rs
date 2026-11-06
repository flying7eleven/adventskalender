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

#[derive(Debug, PartialEq, Eq)]
pub enum RateLimitDecision {
    Allowed,
    RateLimited { retry_after_seconds: u64 },
}

pub fn check_rate_limit(key: &str, config: &RateLimitConfig) -> RateLimitDecision {
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
        return RateLimitDecision::Allowed;
    }

    if entry.attempts >= config.max_attempts {
        let retry_after = window_duration - (now - entry.window_start);
        let retry_after_seconds =
            retry_after.num_seconds() + i64::from(retry_after.subsec_millis() > 0);
        return RateLimitDecision::RateLimited {
            retry_after_seconds: retry_after_seconds.max(1) as u64,
        };
    }

    entry.attempts += 1;
    RateLimitDecision::Allowed
}

pub fn reset_rate_limit(key: &str) {
    RATE_LIMITER.remove(key);
}

pub fn cleanup_old_entries(config: &RateLimitConfig) {
    let now = Utc::now();
    let window_duration = Duration::minutes(config.window_minutes);

    RATE_LIMITER.retain(|_, entry| now - entry.window_start <= window_duration);
}

#[cfg(test)]
mod tests {
    use super::{
        check_rate_limit, reset_rate_limit, RateLimitConfig, RateLimitDecision, RATE_LIMITER,
    };
    use chrono::{Duration, Utc};

    #[test]
    fn the_retry_after_seconds_round_up_the_remaining_window() {
        let key = "test:retry-after-rounding";
        reset_rate_limit(key);
        let config = RateLimitConfig {
            max_attempts: 1,
            window_minutes: 15,
        };
        assert_eq!(check_rate_limit(key, &config), RateLimitDecision::Allowed);

        // simulate that the rate limited window started half a second ago, so that the
        // remaining window is not a whole number of seconds
        let half_a_second_ago = Utc::now() - Duration::milliseconds(500);
        if let Some(mut entry) = RATE_LIMITER.get_mut(key) {
            entry.window_start = half_a_second_ago;
        }

        let decision = check_rate_limit(key, &config);
        reset_rate_limit(key);

        let RateLimitDecision::RateLimited {
            retry_after_seconds,
        } = decision
        else {
            panic!("the second attempt must be rate limited, got {decision:?}")
        };
        assert_eq!(
            retry_after_seconds, 900,
            "the retry-after must round up the remaining window of 899.5 seconds"
        );
    }
}
