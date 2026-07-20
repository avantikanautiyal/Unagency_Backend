# Secret Lifecycle Model

```
created → validated → active ⇄ rotating
                ↓        ↓
             expired   revoked → archived → deleted
```

| State | Meaning |
|-------|---------|
| created | Stored, not yet validated |
| validated | Backend material confirmed |
| active | Ready for lease/use |
| rotating | Rotation in progress |
| expired | Past expiresAt |
| revoked | Explicitly disabled |
| deleted | Soft-deleted; backend material removed |
| archived | Retained metadata, no active use |
