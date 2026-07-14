## Parser

### Requirement: Reject malformed length-prefixed frames

The frame parser SHALL reject any frame whose declared length prefix does not
match the number of bytes that follow, and MUST NOT read beyond the buffer under
any input (REQ-SEC-1).

#### Scenario: Length prefix exceeds available bytes
- **WHEN** a frame declares length `100` but only `4` bytes follow
- **THEN** the parser rejects the frame with an error
- **AND** no read occurs past the end of the buffer

#### Scenario: Negative or overflowing length
- **WHEN** a frame declares a negative or integer-overflowing length
- **THEN** the parser rejects the frame with an error
