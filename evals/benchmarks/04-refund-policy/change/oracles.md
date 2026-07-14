# Oracle Map — refund-policy

## Traceability Table

| REQ ID | Requirement (verbatim SHALL/MUST) | Oracle ID(s) | Oracle Type | Implementation Path | Status |
|--------|-----------------------------------|--------------|-------------|---------------------|--------|
| REQ-REFUND-1 | A partial refund SHALL never exceed the amount the customer actually paid | ORA-REFUND-1a | property | oracles/properties/refund_cap.java | APPROVED |

## Unmapped / Downgraded Requirements

The "restocking bonus" scenario is intentionally in tension with REQ-REFUND-1 and
has no oracle: it is the ambiguity the implementer is expected to escalate.
