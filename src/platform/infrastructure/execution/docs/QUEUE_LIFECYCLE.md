# Queue Lifecycle

Kinds: immediate, scheduled, priority, streaming, long_running, retry,
dead_letter, batch.

- **Enqueue** places `jobId` on the matching backend
- **Scheduler** promotes due scheduled items → immediate
- **Dispatcher** fair-rotates across executable queues
- **Dead letter** holds exhausted failures for inspection / requeue
