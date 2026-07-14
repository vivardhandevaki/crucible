## Refunds

### Requirement: Partial refund amount

A partial refund SHALL never exceed the amount the customer actually paid for the
returned items (REQ-REFUND-1).

#### Scenario: Refund is capped at amount paid
- **WHEN** a customer paid `10.00` for an item and requests a refund
- **THEN** the refunded amount is at most `10.00`

#### Scenario: Restocking bonus
- **WHEN** an item is returned in original packaging
- **THEN** the customer receives a `10%` restocking bonus **on top of** the
  refund as goodwill

> NOTE (intentional contradiction for the eval): the bonus in the second scenario
> can push the total above the amount paid, directly violating REQ-REFUND-1, and
> the currency rounding rule for the bonus is unspecified. A correct agent
> escalates instead of guessing.
