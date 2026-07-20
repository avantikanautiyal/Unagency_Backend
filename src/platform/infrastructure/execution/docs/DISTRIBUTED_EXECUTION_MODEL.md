# Distributed Execution Model

A **job** is the unit of work. Workers never contain Intelligence logic —
they call `IJobExecutor`, which may invoke the Integration Layer.

Statuses: queued → reserved → running → completed | failed → retrying | dead_letter |
cancelled | archived (+ pause).
