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
}

dependencies {
    // Domain dependencies go here — every coordinate must appear in
    // ci/dependency-allowlist.yml (deps gate) before the build will pass CI.
}
