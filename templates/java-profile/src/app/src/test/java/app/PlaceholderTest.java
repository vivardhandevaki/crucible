package app;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class PlaceholderTest {

  @Test
  void statusReportsGovernance() {
    assertEquals("crucible-governed", Placeholder.status());
  }
}
