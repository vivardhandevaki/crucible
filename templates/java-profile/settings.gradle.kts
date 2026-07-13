// Crucible java-profile scaffold — emitted by `crucible init --lang java`.
rootProject.name = "{{PROJECT_NAME}}"

include(":app")
project(":app").projectDir = file("src/app")

// The oracles module: human-owned executable judges (protected path).
// Its test-source dirs mirror the documented oracle layout.
include(":oracles")
