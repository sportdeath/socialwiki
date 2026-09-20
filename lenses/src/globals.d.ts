// These globals are installed before lens modules run.
import "../../kernel/src/bridges/graffiti/child";
import "../../kernel/src/bridges/events/child";
import "../../kernel/src/bridges/navigation/shared";
import "../../kernel/src/bridges/peripherals/child";

declare global {
  interface Window {
    /** The stable base URL recorded by the lens distribution's locator. */
    socialWikiLensesUrl: string;
  }
}
