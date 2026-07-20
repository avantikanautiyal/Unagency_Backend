# Retry Model

Strategies: immediate, linear, exponential.

After failure classification (`transient` / `timeout` / `provider` retryable;
`validation` / `fatal` not):

1. Status → `retrying`
2. Delay computed from policy
3. Enqueued on scheduled queue
4. On due → `queued` → execute again
5. If attempts exhausted → dead letter
