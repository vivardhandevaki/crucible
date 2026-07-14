## Items

### Requirement: List items in insertion order

Listing items SHALL return every persisted item exactly once, in the order they
were created (oldest first). The list MUST NOT contain duplicates (REQ-ITEML-1).

#### Scenario: Order is preserved
- **WHEN** items `"a"`, `"b"`, `"c"` are created in that order
- **THEN** listing returns them as `["a", "b", "c"]`

#### Scenario: No duplicates
- **WHEN** the same set of items has been created once
- **THEN** each item appears exactly once in the list
