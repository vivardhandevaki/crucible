// Crucible java-profile root build — every version pinned (no ranges, no latest).
// Gate plugins configured here so `./gradlew build spotlessCheck checkstyleMain
// pitest dependencyCheckAnalyze` are the Gauntlet's exact invocations.
import net.ltgt.gradle.errorprone.errorprone

plugins {
    java
    id("com.diffplug.spotless") version "8.8.0" apply false
    id("net.ltgt.errorprone") version "5.1.0" apply false
    id("info.solidsoft.pitest") version "1.19.0" apply false
    id("org.owasp.dependencycheck") version "12.2.2"
}

// deps gate: fail on known CVEs of high severity.
dependencyCheck {
    failBuildOnCVSS = 7.0f
    nvd { apiKey = System.getenv("NVD_API_KEY") ?: "" }
}

subprojects {
    apply(plugin = "java")
    apply(plugin = "checkstyle")
    apply(plugin = "com.diffplug.spotless")
    apply(plugin = "net.ltgt.errorprone")

    repositories { mavenCentral() }

    configure<JavaPluginExtension> {
        toolchain { languageVersion = JavaLanguageVersion.of(21) }
    }

    configure<CheckstyleExtension> {
        toolVersion = "13.8.0"
        configFile = rootProject.file("ci/checkstyle.xml")
        maxWarnings = 0
    }

    configure<com.diffplug.gradle.spotless.SpotlessExtension> {
        java {
            target("src/**/*.java", "properties/**/*.java", "contracts/**/*.java", "arch/**/*.java")
            trimTrailingWhitespace()
            endWithNewline()
            removeUnusedImports()
        }
    }

    dependencies {
        "errorprone"("com.google.errorprone:error_prone_core:2.50.0")
        "testImplementation"(platform("org.junit:junit-bom:5.14.4"))
        "testImplementation"("org.junit.jupiter:junit-jupiter")
        "testRuntimeOnly"("org.junit.platform:junit-platform-launcher")
        "testImplementation"("net.jqwik:jqwik:1.9.3")
    }

    tasks.withType<JavaCompile>().configureEach {
        options.compilerArgs.add("-Werror")
        options.errorprone.disableWarningsInGeneratedCode = true
    }

    tasks.withType<Test>().configureEach {
        useJUnitPlatform()
        // Repeatability: fixed property-test seed in CI; rotate locally/nightly.
        systemProperty("jqwik.seeds.whenFixed", "ALLOW")
        if (System.getenv("CI") != null) systemProperty("jqwik.random.seed", "42")
    }
}
