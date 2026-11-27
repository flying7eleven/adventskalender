#!/bin/sh

set -eu

SCRIPT="$(cd "$(dirname "$0")" && pwd)/40-real-ip.sh"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT
OUTPUT="$WORKDIR/real-ip.conf"
failures=0
unset NGINX_TRUSTED_PROXIES

fail() {
    echo "FAIL: $1" >&2
    failures=$((failures + 1))
}

expect_config() {
    name=$1
    expected=$2
    shift 2
    rm -f "$OUTPUT"
    if ! env NGINX_REAL_IP_CONF="$OUTPUT" NGINX_ENTRYPOINT_QUIET_LOGS=1 "$@" sh "$SCRIPT" 2>"$WORKDIR/stderr"; then
        fail "$name: script exited with an error: $(cat "$WORKDIR/stderr")"
        return
    fi
    if [ ! -f "$OUTPUT" ]; then
        fail "$name: no config was written"
        return
    fi
    printf '%s' "$expected" >"$WORKDIR/expected"
    if ! cmp -s "$WORKDIR/expected" "$OUTPUT"; then
        fail "$name: unexpected config
--- expected
$(cat "$WORKDIR/expected")
--- actual
$(cat "$OUTPUT")"
        return
    fi
    echo "ok: $name"
}

expect_rejected() {
    entry=$1
    rm -f "$OUTPUT"
    if env NGINX_REAL_IP_CONF="$OUTPUT" NGINX_ENTRYPOINT_QUIET_LOGS=1 NGINX_TRUSTED_PROXIES="$entry" sh "$SCRIPT" 2>"$WORKDIR/stderr"; then
        fail "rejects '$entry': script succeeded"
        return
    fi
    if ! grep -qF "'$entry'" "$WORKDIR/stderr"; then
        fail "rejects '$entry': error does not name the entry: $(cat "$WORKDIR/stderr")"
        return
    fi
    if [ -e "$OUTPUT" ]; then
        fail "rejects '$entry': a config was written"
        return
    fi
    echo "ok: rejects '$entry'"
}

expect_config "unset uses the private network defaults" "set_real_ip_from 127.0.0.1;
set_real_ip_from ::1;
set_real_ip_from 10.0.0.0/8;
set_real_ip_from 172.16.0.0/12;
set_real_ip_from 192.168.0.0/16;
set_real_ip_from fc00::/7;
"

expect_config "explicitly empty trusts no peer" "" NGINX_TRUSTED_PROXIES=

expect_config "IPv4 address" "set_real_ip_from 203.0.113.7;
" NGINX_TRUSTED_PROXIES=203.0.113.7

expect_config "IPv6 address" "set_real_ip_from 2001:db8::1;
" NGINX_TRUSTED_PROXIES=2001:db8::1

expect_config "CIDR ranges" "set_real_ip_from 198.51.100.0/24;
set_real_ip_from 2001:DB8::/32;
" "NGINX_TRUSTED_PROXIES=198.51.100.0/24 2001:DB8::/32"

expect_config "comma and space separated list" "set_real_ip_from 10.1.2.3;
set_real_ip_from 10.0.0.0/8;
set_real_ip_from ::1;
set_real_ip_from 192.0.2.1;
" "NGINX_TRUSTED_PROXIES=10.1.2.3,10.0.0.0/8, ::1  192.0.2.1"

for entry in 1.2.3 1.2.3.4/ a/b/c '*' '10.0.0.0/8;evil' example.com; do
    expect_rejected "$entry"
done

if [ "$failures" -ne 0 ]; then
    echo "$failures test(s) failed" >&2
    exit 1
fi
echo "all tests passed"
