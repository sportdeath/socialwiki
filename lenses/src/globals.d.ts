// These globals are installed by the kernel before lens modules run.
import "../../kernel/src/bridges/graffiti/child";
import "../../kernel/src/bridges/events/child";
import "../../kernel/src/bridges/navigation/shared";

declare global {
  const MONACO_WORKER_BASE_URL: string;
}
