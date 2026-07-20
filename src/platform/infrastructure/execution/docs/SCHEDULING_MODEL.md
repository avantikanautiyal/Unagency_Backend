# Scheduling Model

Scheduled jobs carry `scheduledAt`. They land on the scheduled queue with a
due timestamp. `JobScheduler.promoteDue` moves due work to the immediate queue
during `tick()`.

Retries also use the scheduled queue for delayed re-entry.
