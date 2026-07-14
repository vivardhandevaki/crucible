# Oracle Map — item-create

## Traceability Table

| REQ ID | Requirement (verbatim SHALL/MUST) | Oracle ID(s) | Oracle Type | Implementation Path | Status |
|--------|-----------------------------------|--------------|-------------|---------------------|--------|
| REQ-ITEMC-1 | Creating an item SHALL persist it and return a stable unique id; lookup MUST return the same item | ORA-ITEMC-1a | property | oracles/properties/item_create_roundtrip.java | APPROVED |

## Unmapped / Downgraded Requirements

(none — the create/read-back invariant is quantified over arbitrary valid names by the property oracle)
