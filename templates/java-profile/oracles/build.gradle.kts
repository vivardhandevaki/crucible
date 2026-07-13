// The oracles module — human-owned executable judges (CODEOWNERS-protected).
// Test-source dirs mirror the documented oracle layout: properties/, contracts/,
// arch/ hold test code; constraints/ holds Liquibase changesets (not compiled).
sourceSets {
    test {
        java.setSrcDirs(listOf("properties", "contracts", "arch"))
    }
}

dependencies {
    testImplementation(project(":app"))
    testImplementation("com.tngtech.archunit:archunit-junit5:1.4.1")
}
