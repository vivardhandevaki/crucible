# Oracle Map — item-list

## Traceability Table

| REQ ID | Requirement (verbatim SHALL/MUST) | Oracle ID(s) | Oracle Type | Implementation Path | Status |
|--------|-----------------------------------|--------------|-------------|---------------------|--------|
| REQ-ITEML-1 | Listing items SHALL return each item once in insertion order; MUST NOT contain duplicates | ORA-ITEML-1a | property | oracles/properties/item_list_order.java | APPROVED |

## Unmapped / Downgraded Requirements

(none — ordering and no-duplicates are quantified over arbitrary insertion sequences by the property oracle)
