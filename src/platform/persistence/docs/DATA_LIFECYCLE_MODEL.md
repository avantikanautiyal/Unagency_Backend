# Data Lifecycle Model

1. **Create** — `save` without `expectedVersion` → version 1  
2. **Update** — `save` with `expectedVersion` → version++  
3. **Soft delete** — `delete` sets `deletedAt`  
4. **List** — excludes deleted unless `includeDeleted`  
5. **Encrypt** — optional field encryption on write; transparent decrypt on read  
6. **Index** — search indexer updated by consumers/composition (not coupled to OS)  
7. **Archive** — via backup/export snapshots  
8. **Restore** — restore points replay entity store state  

Retention policies are consumer concerns; persistence supplies primitives.
