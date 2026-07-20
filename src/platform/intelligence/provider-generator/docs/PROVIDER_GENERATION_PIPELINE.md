# Provider Generation Pipeline

1. Validate manifest  
2. Build template context (classPrefix, constants, packageRoot)  
3. Render required + optional artifact kinds  
4. Attach capability / resolver / certification plans  
5. Emit `ProviderGenerationReport` with diagnostics  

Modes: `dry_run` (default) · `materialize` (advisory warning only).
