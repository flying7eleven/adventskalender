#!/bin/sh

set -eu

ME=$(basename "$0")
OUTPUT=${NGINX_REAL_IP_CONF:-/etc/nginx/snippets/real-ip.conf}
DEFAULT_TRUSTED_PROXIES="127.0.0.1 ::1 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 fc00::/7"

entrypoint_log() {
    if [ -z "${NGINX_ENTRYPOINT_QUIET_LOGS:-}" ]; then
        echo "$@"
    fi
}

is_valid_entry() {
    case "$1" in
        "" | *[!0-9A-Fa-f:./]* | */*/* | */) return 1 ;;
    esac
    address=${1%%/*}
    case "$address" in
        *:*) ;;
        *[!0-9.]* | *..* | .* | *.) return 1 ;;
        *.*.*.*.*) return 1 ;;
        *.*.*.*) ;;
        *) return 1 ;;
    esac
    case "$1" in
        */*)
            case "${1#*/}" in
                [0-9] | [0-9][0-9] | [0-9][0-9][0-9]) ;;
                *) return 1 ;;
            esac
            ;;
    esac
}

trusted_proxies=${NGINX_TRUSTED_PROXIES-$DEFAULT_TRUSTED_PROXIES}

set -f
config=""
trusted=""
for entry in $(printf '%s' "$trusted_proxies" | tr ',' ' '); do
    if ! is_valid_entry "$entry"; then
        echo "$ME: error: NGINX_TRUSTED_PROXIES contains '$entry', which is neither an IP address nor a CIDR range" >&2
        exit 1
    fi
    config="${config}set_real_ip_from ${entry};
"
    trusted="${trusted} ${entry}"
done

printf '%s' "$config" > "$OUTPUT"
entrypoint_log "$ME: trusting X-Forwarded-For from:${trusted:- no peer}"
