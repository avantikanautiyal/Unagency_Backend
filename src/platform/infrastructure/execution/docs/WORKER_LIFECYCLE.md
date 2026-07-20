# Worker Lifecycle

Workers register with kind + capacity, heartbeat, and active job counts.

Kinds: execution, streaming, background, retry, recovery.

On crash (`failWorker`): running jobs return to `queued` for another healthy worker.
Workers execute jobs — they do not own Intelligence.
