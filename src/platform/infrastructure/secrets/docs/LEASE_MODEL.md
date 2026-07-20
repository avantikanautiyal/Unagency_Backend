# Lease Model

```
leaseSecret → active
     ↓
  renewLease → renewed (extends TTL)
     ↓
  expire (time) → expired
     ↓
  revokeLease → revoked
```

`revealLeasedSecret` allowed only for `active` | `renewed` leases.
Designed for short-lived tokens and future temporary cloud credentials.
