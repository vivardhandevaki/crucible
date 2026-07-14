// The target system module. PIT (mutation gate) runs here, scoped by the
// Gauntlet to changed code; threshold mirrors ci/gates.yml (ratchet 75→80→85).
plugins {
    id("info.solidsoft.pitest")
}

pitest {
    junit5PluginVersion = "1.2.3"
    pitestVersion = "1.25.7"
    threads = 2
    mutationThreshold = 75
    timestampedReports = false
    // Without an explicit target, PIT defaults to the (empty) project group and
    // finds 0 mutations -> PitHelpError. Scope it to the app package tree.
    targetClasses.set(listOf("app.*"))
    targetTests.set(listOf("app.*"))
}

dependencies {
    // Domain dependencies go here — every coordinate must appear in
    // ci/dependency-allowlist.yml (deps gate) before the build will pass CI.
}
