#include <fcntl.h>
#include <signal.h>
#include <string.h>
#include <unistd.h>

#if !defined(PA_TESTING) || !defined(PA_GUI_BOOTSTRAP_OFFLINE_TEST) \
  || !defined(PA_IGNORED_SIGCHLD_MODE) || defined(PA_RELEASE_BUILD)
#error The inherited-SIGCHLD launcher is offline-test-only
#endif

int main(int argc, char *argv[]) {
  if (argc != 2) return 3;
  struct sigaction action;
  memset(&action, 0, sizeof(action));
  if (sigemptyset(&action.sa_mask) != 0) return 3;
#if PA_IGNORED_SIGCHLD_MODE == 1
  action.sa_handler = SIG_IGN;
  action.sa_flags = 0;
#elif PA_IGNORED_SIGCHLD_MODE == 2
  action.sa_handler = SIG_DFL;
  action.sa_flags = SA_NOCLDWAIT;
#else
#error Unsupported offline SIGCHLD mode
#endif
  if (sigaction(SIGCHLD, &action, NULL) != 0) return 3;
  if (fcntl(6, F_SETFD, 0) != 0) return 3;
  char *childArguments[] = { argv[1], NULL };
  execv(argv[1], childArguments);
  return 3;
}
