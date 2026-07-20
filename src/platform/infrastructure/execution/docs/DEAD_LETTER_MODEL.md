# Dead Letter Model

Jobs that exhaust retries (or fail fatally) move to:

- status `dead_letter`
- `DeadLetterStore` record (reason, attempts, payload metadata — no secrets)
- dead_letter queue

`requeueDeadLetter` resets attempts and returns the job to the immediate queue.
