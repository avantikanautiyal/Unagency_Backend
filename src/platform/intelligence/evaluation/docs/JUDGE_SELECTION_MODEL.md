# Judge Selection Model

`DefaultJudgeSelector` uses `PIPELINE_JUDGE_SEEDS` per family, e.g.:

- Marketing → marketing, creative, brand, grammar, accessibility, social_media, safety, human  
- Software → architecture, security, performance, testing, maintainability, code_quality, …  
- Healthcare → medical, factual, compliance, safety, hallucination, policy, human  

Elevated risk forces Safety; human approval forces Human Judge.
