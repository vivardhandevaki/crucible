## Health

### Requirement: Health endpoint

The service SHALL expose `GET /health` that returns HTTP 200 with the JSON body
`{"status":"ok"}` whenever the process is running (REQ-HEALTH-1).

#### Scenario: Process is up
- **WHEN** a client issues `GET /health`
- **THEN** the response status is 200
- **AND** the response body is `{"status":"ok"}`
