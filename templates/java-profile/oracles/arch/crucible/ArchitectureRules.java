package crucible;

import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;

/**
 * Starter architecture oracles (plan §3.1.3) — the mechanical defense of
 * extensibility. Layer names are package-convention-based: put code under
 * {@code ..api..}, {@code ..service..}, {@code ..domain..}, {@code ..persistence..}.
 * Additions only; changing existing rules requires the owner (CODEOWNERS).
 */
@AnalyzeClasses(packages = "app")
public final class ArchitectureRules {

  @ArchTest
  static final ArchRule layers_are_respected =
      layeredArchitecture()
          .consideringOnlyDependenciesInLayers()
          // Optional: layers may be empty until the first real feature lands.
          .withOptionalLayers(true)
          .layer("Api").definedBy("..api..")
          .layer("Service").definedBy("..service..")
          .layer("Domain").definedBy("..domain..")
          .layer("Persistence").definedBy("..persistence..")
          .whereLayer("Api").mayNotBeAccessedByAnyLayer()
          .whereLayer("Service").mayOnlyBeAccessedByLayers("Api")
          .whereLayer("Domain").mayOnlyBeAccessedByLayers("Api", "Service", "Persistence")
          .whereLayer("Persistence").mayOnlyBeAccessedByLayers("Service");

  @ArchTest
  static final ArchRule no_field_injection =
      noFields().should().beAnnotatedWith("jakarta.inject.Inject")
          .orShould().beAnnotatedWith("org.springframework.beans.factory.annotation.Autowired")
          .because("constructor injection only (crucible-java-conventions)")
          .allowEmptyShould(true);

  @ArchTest
  static final ArchRule only_state_mutators_mutate_domain_state =
      classes().that().areAnnotatedWith("app.domain.StateMutator")
          .should().resideInAPackage("..domain..")
          .because("domain state mutation is confined to designated state-machine classes")
          .allowEmptyShould(true);

  @ArchTest
  static final ArchRule no_jdbc_outside_persistence =
      noClasses().that().resideOutsideOfPackage("..persistence..")
          .should().dependOnClassesThat().resideInAnyPackage("java.sql..", "javax.sql..")
          .because("data access is a persistence-layer concern");

  @ArchTest
  static final ArchRule no_legacy_date_time =
      noClasses().should().dependOnClassesThat()
          .haveFullyQualifiedName("java.util.Date")
          .orShould().dependOnClassesThat().haveFullyQualifiedName("java.util.Calendar")
          .because("java.time only");

  private ArchitectureRules() {}
}
