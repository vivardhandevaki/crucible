# Oracle Map — harden-parser

## Traceability Table

| REQ ID | Requirement (verbatim SHALL/MUST) | Oracle ID(s) | Oracle Type | Implementation Path | Status |
|--------|-----------------------------------|--------------|-------------|---------------------|--------|
| REQ-SEC-1 | The parser SHALL reject frames whose length prefix mismatches and MUST NOT read past the buffer | ORA-SEC-1a | property | oracles/properties/frame_bounds.java | APPROVED |

## Unmapped / Downgraded Requirements

(none — the bounds invariant is quantified over arbitrary byte inputs by the property oracle, which the implementer may NOT weaken)
