# FAILURE REPORT

Generated: 2026-07-27T12:18:59.608Z

**Simulations passed:** 15/15

| Kind | Passed | Expected Recovery |
| --- | --- | --- |
| provider_unavailable | true | Route to fallback provider via routing engine |
| provider_timeout | true | Retry with backoff then fallback |
| invalid_api_key | true | Fail closed; no secret echoed |
| http_429 | true | Rate limit respected; queue or backoff |
| http_500 | true | Retry then fallback provider |
| slow_response | true | Timeout budget enforced |
| rate_limit | true | Gateway rate limit 429 |
| network_interruption | true | Retry with circuit breaker |
| database_unavailable | true | Degraded persistence; execution may queue |
| redis_unavailable | true | Queue fallback to in-memory or fail safe |
| storage_unavailable | true | Artifact write retried or deferred |
| gateway_restart | true | Idempotent execution lookup |
| partial_execution_failure | true | Diagnostics + partial artifacts retained |
| execution_resume | true | Resume from checkpoint |
| provider_fallback | true | Secondary provider selected |
