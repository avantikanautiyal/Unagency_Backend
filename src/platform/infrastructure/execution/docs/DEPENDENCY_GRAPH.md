# Dependency Graph

```
DistributedExecutionPlatform
 └─ DistributedExecutionEngine
     ├─ IJobStore (in-memory → Redis later)
     ├─ QueueRegistry (8 queue kinds)
     ├─ JobScheduler / JobDispatcher
     ├─ WorkerRegistry + Lease/Reservation
     ├─ Retry / DeadLetter / Cancellation
     ├─ Concurrency + Throttle + Progress + Monitor
     └─ IJobExecutor
         ├─ StubJobExecutor (tests)
         ├─ IntegrationLayerJobExecutor → Intelligence OS Integration
         └─ ProductionValidationJobExecutor → Production Validation
```

Intelligence modules are **callees**, not dependencies inside the engine core.
