#import "provider_attestor_private.h"

#import <CommonCrypto/CommonDigest.h>
#import <Foundation/Foundation.h>
#include <mach/machine.h>
#include <mach-o/loader.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static NSData *SyntheticImage(uint32_t commandKind, const char *dependencyName) {
  struct mach_header_64 header;
  memset(&header, 0, sizeof(header));
  header.magic = MH_MAGIC_64;
#if defined(__arm64__)
  header.cputype = CPU_TYPE_ARM64;
#elif defined(__x86_64__)
  header.cputype = CPU_TYPE_X86_64;
#else
#error Unsupported host architecture for trusted-loader tests
#endif
  header.filetype = MH_BUNDLE;
  header.ncmds = 1U;
  NSMutableData *commands = nil;
  if (commandKind == LC_LOAD_DYLIB && dependencyName != NULL) {
    struct dylib_command dependency;
    memset(&dependency, 0, sizeof(dependency));
    dependency.cmd = LC_LOAD_DYLIB;
    dependency.cmdsize = (uint32_t)((sizeof(dependency)
      + strlen(dependencyName) + 1U + 7U) & ~(size_t)7U);
    dependency.dylib.name.offset = (uint32_t)sizeof(dependency);
    commands = [NSMutableData dataWithLength:dependency.cmdsize];
    memcpy(commands.mutableBytes, &dependency, sizeof(dependency));
    memcpy((uint8_t *)commands.mutableBytes + sizeof(dependency),
           dependencyName, strlen(dependencyName) + 1U);
  } else {
    struct load_command command = { commandKind, sizeof(struct load_command) };
    commands = [NSMutableData dataWithBytes:&command length:sizeof(command)];
  }
  header.sizeofcmds = (uint32_t)commands.length;
  NSMutableData *image = [NSMutableData dataWithBytes:&header length:sizeof(header)];
  [image appendData:commands];
  return image;
}

static NSString *ImageDigest(NSData *data) {
  uint8_t digest[CC_SHA256_DIGEST_LENGTH];
  if (CC_SHA256(data.bytes, (CC_LONG)data.length, digest) == NULL) return nil;
  char hex[(CC_SHA256_DIGEST_LENGTH * 2U) + 1U];
  static const char alphabet[] = "0123456789abcdef";
  for (size_t index = 0U; index < CC_SHA256_DIGEST_LENGTH; index += 1U) {
    hex[index * 2U] = alphabet[digest[index] >> 4U];
    hex[(index * 2U) + 1U] = alphabet[digest[index] & 15U];
  }
  hex[CC_SHA256_DIGEST_LENGTH * 2U] = '\0';
  return [@"sha256:" stringByAppendingString:[NSString stringWithUTF8String:hex]];
}

static BOOL WriteImage(NSString *path, NSData *image) {
  return [image writeToFile:path options:NSDataWritingAtomic error:NULL]
    && chmod(path.fileSystemRepresentation, 0644U) == 0;
}

static BOOL Check(const char *name, BOOL condition) {
  fprintf(stderr, "%s %s\n", condition ? "PASS" : "FAIL", name);
  return condition;
}

int main(void) {
  @autoreleasepool {
    if (getuid() == 0U) return Check("non-root test process", NO) ? 0 : 1;
    const char *temporary = NSTemporaryDirectory().fileSystemRepresentation;
    char canonical[PATH_MAX];
    if (temporary == NULL || realpath(temporary, canonical) == NULL) {
      return Check("private temporary directory", NO) ? 0 : 1;
    }
    NSString *template = [[NSString stringWithUTF8String:canonical]
      stringByAppendingPathComponent:@"trusted-loader-XXXXXX"];
    char *mutableTemplate = strdup(template.fileSystemRepresentation);
    if (mutableTemplate == NULL || mkdtemp(mutableTemplate) == NULL) {
      free(mutableTemplate);
      return Check("private fixture creation", NO) ? 0 : 1;
    }
    NSString *root = [NSString stringWithUTF8String:mutableTemplate];
    free(mutableTemplate);
    NSString *validDirectory = [root stringByAppendingPathComponent:@"images"];
    NSString *imagePath = [validDirectory stringByAppendingPathComponent:@"image.dylib"];
    NSFileManager *manager = [NSFileManager defaultManager];
    BOOL setup = chmod(root.fileSystemRepresentation, 0700U) == 0
      && [manager createDirectoryAtPath:validDirectory
               withIntermediateDirectories:NO attributes:@{ NSFilePosixPermissions: @0700 }
                                error:NULL];
    NSData *good = SyntheticImage(LC_LOAD_DYLIB, "/usr/lib/libSystem.B.dylib");
    NSString *goodDigest = ImageDigest(good);
    setup = setup && goodDigest != nil && WriteImage(imagePath, good);
    BOOL passed = Check("synthetic setup", setup);
    if (setup) {
      uid_t owner = getuid();
      passed &= Check("mocked-owner positive image",
        PAValidatePinnedImageForTesting(imagePath, goodDigest,
                                        validDirectory, owner, nil));
      passed &= Check("production policy rejects test-owned image",
        !PAValidatePinnedRegularFile(imagePath, goodDigest, owner, NULL));

      NSString *leafLink = [validDirectory stringByAppendingPathComponent:@"leaf-link.dylib"];
      BOOL leafCreated = symlink(imagePath.fileSystemRepresentation,
                                 leafLink.fileSystemRepresentation) == 0;
      passed &= Check("symlink leaf rejected", leafCreated
        && !PAValidatePinnedImageForTesting(leafLink, goodDigest,
                                            validDirectory, owner, nil));

      NSString *parentLink = [root stringByAppendingPathComponent:@"linked-images"];
      BOOL parentCreated = symlink(validDirectory.fileSystemRepresentation,
                                   parentLink.fileSystemRepresentation) == 0;
      passed &= Check("symlink parent rejected", parentCreated
        && !PAValidatePinnedImageForTesting(
          [parentLink stringByAppendingPathComponent:@"image.dylib"], goodDigest,
          parentLink, owner, nil));

      BOOL writableParent = chmod(validDirectory.fileSystemRepresentation, 0770U) == 0;
      passed &= Check("writable parent rejected", writableParent
        && !PAValidatePinnedImageForTesting(imagePath, goodDigest,
                                            validDirectory, owner, nil));
      passed &= Check("parent mode restored",
        chmod(validDirectory.fileSystemRepresentation, 0700U) == 0);

      passed &= Check("wrong owner rejected",
        !PAValidatePinnedImageForTesting(imagePath, goodDigest,
                                         validDirectory, owner + 1U, nil));
      BOOL writableImage = chmod(imagePath.fileSystemRepresentation, 0666U) == 0;
      passed &= Check("writable image rejected", writableImage
        && !PAValidatePinnedImageForTesting(imagePath, goodDigest,
                                            validDirectory, owner, nil));
      passed &= Check("image mode restored",
        chmod(imagePath.fileSystemRepresentation, 0644U) == 0);

      NSString *wrongDigest = [goodDigest stringByReplacingCharactersInRange:NSMakeRange(7U, 1U)
                                                                    withString:@"f"];
      if ([wrongDigest isEqualToString:goodDigest]) {
        wrongDigest = [goodDigest stringByReplacingCharactersInRange:NSMakeRange(7U, 1U)
                                                            withString:@"0"];
      }
      passed &= Check("digest mismatch rejected",
        !PAValidatePinnedImageForTesting(imagePath, wrongDigest,
                                         validDirectory, owner, nil));

      NSData *unexpectedCommand = SyntheticImage(LC_RPATH, NULL);
      NSString *commandPath = [validDirectory stringByAppendingPathComponent:@"rpath.dylib"];
      passed &= Check("unexpected load command rejected",
        WriteImage(commandPath, unexpectedCommand)
        && !PAValidatePinnedImageForTesting(commandPath, ImageDigest(unexpectedCommand),
                                            validDirectory, owner, nil));

      NSData *unexpectedDependency = SyntheticImage(LC_LOAD_DYLIB,
                                                     "/untrusted/libcrypto.dylib");
      NSString *dependencyPath = [validDirectory stringByAppendingPathComponent:@"import.dylib"];
      passed &= Check("non-system dependency rejected",
        WriteImage(dependencyPath, unexpectedDependency)
        && !PAValidatePinnedImageForTesting(dependencyPath, ImageDigest(unexpectedDependency),
                                            validDirectory, owner, nil));

      NSData *traversalDependency = SyntheticImage(LC_LOAD_DYLIB,
                                                   "/usr/lib/../../untrusted.dylib");
      NSString *traversalPath = [validDirectory stringByAppendingPathComponent:@"traversal.dylib"];
      passed &= Check("system-prefix traversal rejected",
        WriteImage(traversalPath, traversalDependency)
        && !PAValidatePinnedImageForTesting(traversalPath, ImageDigest(traversalDependency),
                                            validDirectory, owner, nil));

      NSString *oldPath = [validDirectory stringByAppendingPathComponent:@"old-image.dylib"];
      __block BOOL replacementSucceeded = NO;
      BOOL replacementAccepted = PAValidatePinnedImageForTesting(
        imagePath, goodDigest, validDirectory, owner, ^{
          replacementSucceeded = rename(imagePath.fileSystemRepresentation,
                                        oldPath.fileSystemRepresentation) == 0
            && WriteImage(imagePath, good);
        });
      passed &= Check("same-digest module replacement rejected",
        replacementSucceeded && !replacementAccepted);
    }
    [manager removeItemAtPath:root error:NULL];
    return passed ? 0 : 1;
  }
}
