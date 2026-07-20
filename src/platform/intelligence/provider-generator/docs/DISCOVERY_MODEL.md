# Discovery Model

Every generated provider implements:

`discoverModels(force?)` → inventory (`live|simulated|cache`) → capability detection → cache

Discovery endpoint + base URL come from the manifest.
Model IDs are never hard-coded in generator output for business use.
