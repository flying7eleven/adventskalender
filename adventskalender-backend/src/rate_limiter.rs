use dashmap::DashMap;
use std::net::IpAddr;
use std::sync::LazyLock;
use std::time::{Duration, SystemTime};

/// The number of keys the process-wide limiter tracks at most. Every key is bounded (an IP
/// address, a prefix or a username of at most 64 bytes), so this caps the memory of the limiter.
const MAX_TRACKED_KEYS: usize = 100_000;

#[derive(Clone)]
pub(crate) struct RateLimitEntry {
    attempts: u32,
    window_start: SystemTime,
}

/// Counts attempts per key within a fixed window. The number of tracked keys is capped: when a
/// new key would exceed the cap, expired entries are dropped first, and if the limiter is still
/// full, the new key is refused (rate limited) instead of tracked. Already tracked keys keep
/// working, so a flood of new keys cannot reset the counters of the keys under attack.
pub(crate) struct RateLimiter {
    entries: DashMap<String, RateLimitEntry>,
    capacity: usize,
}

pub(crate) static RATE_LIMITER: LazyLock<RateLimiter> =
    LazyLock::new(|| RateLimiter::with_capacity(MAX_TRACKED_KEYS));

pub struct RateLimitConfig {
    pub max_attempts: u32,
    pub window_minutes: u64,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        RateLimitConfig {
            max_attempts: 5,
            window_minutes: 15,
        }
    }
}

/// The login attempts allowed per client IP (or IPv6 /64 prefix).
pub const LOGIN_ATTEMPTS_PER_IP: RateLimitConfig = RateLimitConfig {
    max_attempts: 5,
    window_minutes: 15,
};

/// The login attempts allowed per username, across all client IPs.
pub const LOGIN_ATTEMPTS_PER_USERNAME: RateLimitConfig = RateLimitConfig {
    max_attempts: 20,
    window_minutes: 15,
};

#[derive(Debug, PartialEq, Eq)]
pub enum RateLimitDecision {
    Allowed,
    RateLimited { retry_after_seconds: u64 },
}

/// The rate limit key of a client IP: IPv4 addresses (also IPv4-mapped IPv6 addresses) are keyed
/// by the full address, IPv6 addresses by their /64 prefix, since a single client usually
/// controls a whole /64.
pub fn client_ip_key(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(ipv4) => format!("ip:{ipv4}"),
        IpAddr::V6(ipv6) => match ipv6.to_ipv4_mapped() {
            Some(ipv4) => format!("ip:{ipv4}"),
            None => {
                let prefix = std::net::Ipv6Addr::from(ipv6.to_bits() & (u128::MAX << 64));
                format!("ip:{prefix}/64")
            }
        },
    }
}

impl RateLimiter {
    pub(crate) fn with_capacity(capacity: usize) -> RateLimiter {
        RateLimiter {
            entries: DashMap::new(),
            capacity,
        }
    }

    pub(crate) fn check(&self, key: &str, config: &RateLimitConfig) -> RateLimitDecision {
        let now = SystemTime::now();
        let window_duration = config.window();

        if !self.entries.contains_key(key) && self.entries.len() >= self.capacity {
            self.remove_expired(window_duration);
            if self.entries.len() >= self.capacity {
                return RateLimitDecision::RateLimited {
                    retry_after_seconds: window_duration.as_secs().max(1),
                };
            }
        }

        let mut entry = self
            .entries
            .entry(key.to_string())
            .or_insert(RateLimitEntry {
                attempts: 0,
                window_start: now,
            });

        let elapsed = elapsed_since(entry.window_start, now);
        if elapsed > window_duration {
            entry.attempts = 1;
            entry.window_start = now;
            return RateLimitDecision::Allowed;
        }

        if entry.attempts >= config.max_attempts {
            let retry_after = window_duration.saturating_sub(elapsed);
            let retry_after_seconds =
                retry_after.as_secs() + u64::from(retry_after.subsec_millis() > 0);
            return RateLimitDecision::RateLimited {
                retry_after_seconds: retry_after_seconds.max(1),
            };
        }

        entry.attempts += 1;
        RateLimitDecision::Allowed
    }

    pub(crate) fn reset(&self, key: &str) {
        self.entries.remove(key);
    }

    fn remove_expired(&self, window_duration: Duration) {
        let now = SystemTime::now();
        self.entries
            .retain(|_, entry| elapsed_since(entry.window_start, now) <= window_duration);
    }
}

impl RateLimitConfig {
    fn window(&self) -> Duration {
        Duration::from_secs(self.window_minutes * 60)
    }
}

/// A window start in the future (the wall clock was set back) counts as just started.
fn elapsed_since(start: SystemTime, now: SystemTime) -> Duration {
    now.duration_since(start).unwrap_or(Duration::ZERO)
}

pub fn check_rate_limit(key: &str, config: &RateLimitConfig) -> RateLimitDecision {
    RATE_LIMITER.check(key, config)
}

pub fn reset_rate_limit(key: &str) {
    RATE_LIMITER.reset(key);
}

pub fn cleanup_old_entries(config: &RateLimitConfig) {
    RATE_LIMITER.remove_expired(config.window());
}

#[cfg(test)]
mod tests {
    use super::{
        RATE_LIMITER, RateLimitConfig, RateLimitDecision, RateLimiter, check_rate_limit,
        client_ip_key, reset_rate_limit,
    };
    use std::time::{Duration, SystemTime};

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
        let half_a_second_ago = SystemTime::now() - Duration::from_millis(500);
        if let Some(mut entry) = RATE_LIMITER.entries.get_mut(key) {
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

    fn key_of(address: &str) -> String {
        client_ip_key(address.parse().unwrap())
    }

    #[test]
    fn ipv6_addresses_are_grouped_by_their_64_prefix() {
        assert_eq!(key_of("2001:db8:1:2:aaaa::1"), "ip:2001:db8:1:2::/64");
        assert_eq!(
            key_of("2001:db8:1:2:aaaa::1"),
            key_of("2001:db8:1:2:ffff:ffff:ffff:ffff")
        );
        assert_ne!(key_of("2001:db8:1:2::1"), key_of("2001:db8:1:3::1"));
    }

    #[test]
    fn ipv4_addresses_are_keyed_by_the_full_address() {
        assert_eq!(key_of("192.0.2.1"), "ip:192.0.2.1");
        assert_ne!(key_of("192.0.2.1"), key_of("192.0.2.2"));
        assert_eq!(key_of("::ffff:192.0.2.1"), key_of("192.0.2.1"));
    }

    #[test]
    fn a_full_limiter_refuses_new_keys_but_keeps_counting_tracked_ones() {
        let limiter = RateLimiter::with_capacity(2);
        let config = RateLimitConfig {
            max_attempts: 2,
            window_minutes: 15,
        };
        assert_eq!(limiter.check("a", &config), RateLimitDecision::Allowed);
        assert_eq!(limiter.check("b", &config), RateLimitDecision::Allowed);

        assert_eq!(
            limiter.check("c", &config),
            RateLimitDecision::RateLimited {
                retry_after_seconds: 900
            }
        );
        assert_eq!(limiter.entries.len(), 2);
        assert_eq!(limiter.check("a", &config), RateLimitDecision::Allowed);
        assert!(matches!(
            limiter.check("a", &config),
            RateLimitDecision::RateLimited { .. }
        ));
    }

    #[test]
    fn a_full_limiter_drops_expired_entries_to_make_room_for_a_new_key() {
        let limiter = RateLimiter::with_capacity(2);
        let config = RateLimitConfig::default();
        limiter.check("a", &config);
        limiter.check("b", &config);
        if let Some(mut entry) = limiter.entries.get_mut("a") {
            entry.window_start = SystemTime::now() - Duration::from_secs(16 * 60);
        }

        assert_eq!(limiter.check("c", &config), RateLimitDecision::Allowed);
        assert!(!limiter.entries.contains_key("a"));
        assert!(limiter.entries.contains_key("b"));
    }
}
