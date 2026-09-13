#ifndef PA_PROVIDER_ATTESTOR_PRIVATE_ACL_H
#define PA_PROVIDER_ATTESTOR_PRIVATE_ACL_H

#include <errno.h>
#include <sys/acl.h>
#include <sys/types.h>

// A private object may carry no extended ACL entries, including inherited
// entries. Retrieval, conversion, or release uncertainty fails closed.
static inline int PAHasNoExtendedACL(int descriptor) {
  errno = 0;
  acl_t acl = acl_get_fd_np(descriptor, ACL_TYPE_EXTENDED);
  if (acl == NULL) return errno == ENOENT;
  acl_entry_t first;
  errno = 0;
  int found = acl_get_entry(acl, ACL_FIRST_ENTRY, &first);
  int empty = found == -1 && errno == EINVAL;
  if (acl_free(acl) != 0) empty = 0;
  return empty;
}

#endif
