# Place TLS material here (not committed).

# tls.crt
# tls.key

# Generate local self-signed (dev/staging only):
# openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
#   -keyout tls.key -out tls.crt -subj "/CN=localhost"
