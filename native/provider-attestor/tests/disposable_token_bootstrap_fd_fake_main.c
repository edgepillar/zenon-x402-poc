#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>

extern char **environ;

#if !defined(PA_TESTING) || !defined(PA_GUI_BOOTSTRAP_OFFLINE_TEST) \
  || !defined(PA_FAKE_BOOTSTRAP_MODE) || defined(PA_RELEASE_BUILD)
#error The bootstrap FD fixture is offline-test-only
#endif

#if PA_FAKE_BOOTSTRAP_MODE < 3 || PA_FAKE_BOOTSTRAP_MODE == 5
static int PAWrite(int descriptor, const uint8_t *bytes, size_t length) {
  size_t offset = 0U;
  while (offset < length) {
    ssize_t count = write(descriptor, bytes + offset, length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return 0;
    offset += (size_t)count;
  }
  return 1;
}
#endif

int main(int argc, const char *argv[]) {
  (void)argv;
  if (argc != 4 || environ == NULL || environ[0] != NULL
      || fcntl(6, F_GETFD) != -1 || errno != EBADF) return 3;
  (void)write(1, "FIXTURE_STDOUT", 14U);
  (void)write(2, "FIXTURE_STDERR", 14U);
  uint8_t pin[16];
  size_t offset = 0U;
  while (offset < sizeof(pin)) {
    ssize_t count = read(5, pin + offset, sizeof(pin) - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return 3;
    offset += (size_t)count;
  }
  uint8_t extra = 0U;
  ssize_t trailing = read(5, &extra, 1U);
  int valid = trailing == 0;
  for (size_t index = 0U; index < sizeof(pin); index += 1U) {
    if (pin[index] < '0' || pin[index] > '9') valid = 0;
  }
  memset(pin, 0, sizeof(pin));
  if (!valid) return 3;
#if PA_FAKE_BOOTSTRAP_MODE == 4
  sleep(3);
  return 3;
#elif PA_FAKE_BOOTSTRAP_MODE == 3
  return 3;
#else
  uint8_t metadata[65] = { 0 };
#if PA_FAKE_BOOTSTRAP_MODE == 1
  size_t length = 63U;
#elif PA_FAKE_BOOTSTRAP_MODE == 2
  size_t length = 65U;
#else
  size_t length = 64U;
#endif
  int written = PAWrite(4, metadata, length);
#if PA_FAKE_BOOTSTRAP_MODE == 5
  (void)written;
  return 3;
#else
  return written ? 0 : 3;
#endif
#endif
}
