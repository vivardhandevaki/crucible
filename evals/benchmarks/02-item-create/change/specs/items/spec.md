## Items

### Requirement: Create an item

Creating an item with a non-empty name SHALL persist it and return a stable,
unique identifier. A subsequent lookup by that identifier MUST return the same
item (REQ-ITEMC-1).

#### Scenario: Create then read back
- **WHEN** an item is created with name `"widget"`
- **THEN** the call returns a non-empty identifier
- **AND** looking that identifier up returns an item whose name is `"widget"`

#### Scenario: Reject an empty name
- **WHEN** an item is created with an empty name
- **THEN** the call is rejected and nothing is persisted
