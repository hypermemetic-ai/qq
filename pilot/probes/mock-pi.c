#define _GNU_SOURCE

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

struct attempt {
  bool ok;
  int error_number;
};

static const char *env_or_empty(const char *name) {
  const char *value = getenv(name);
  return value == NULL ? "" : value;
}

static void print_json_string(const char *value) {
  const unsigned char *cursor = (const unsigned char *)value;
  putchar('"');
  while (*cursor != '\0') {
    switch (*cursor) {
      case '"': fputs("\\\"", stdout); break;
      case '\\': fputs("\\\\", stdout); break;
      case '\b': fputs("\\b", stdout); break;
      case '\f': fputs("\\f", stdout); break;
      case '\n': fputs("\\n", stdout); break;
      case '\r': fputs("\\r", stdout); break;
      case '\t': fputs("\\t", stdout); break;
      default:
        if (*cursor < 0x20) printf("\\u%04x", *cursor);
        else putchar(*cursor);
    }
    cursor++;
  }
  putchar('"');
}

static void print_attempt(const char *name, struct attempt value, bool trailing) {
  print_json_string(name);
  printf(":{\"ok\":%s,\"errno\":%d}%s", value.ok ? "true" : "false", value.error_number,
         trailing ? "," : "");
}

static struct attempt try_write(const char *path) {
  struct attempt result = { .ok = false, .error_number = EINVAL };
  if (path == NULL || path[0] == '\0') return result;
  errno = 0;
  int descriptor = open(path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
  if (descriptor < 0) {
    result.error_number = errno;
    return result;
  }
  ssize_t written = write(descriptor, "pilot\n", 6);
  int write_error = written == 6 ? 0 : errno;
  close(descriptor);
  if (written != 6) {
    result.error_number = write_error;
    unlink(path);
    return result;
  }
  result.ok = true;
  result.error_number = 0;
  unlink(path);
  return result;
}

static struct attempt try_loopback(void) {
  struct attempt result = { .ok = false, .error_number = EINVAL };
  const char *port_value = getenv("QQ_PILOT_LOOPBACK_PORT");
  if (port_value == NULL || port_value[0] == '\0') return result;
  char *end = NULL;
  long port = strtol(port_value, &end, 10);
  if (end == port_value || *end != '\0' || port < 1 || port > 65535) return result;

  int descriptor = socket(AF_INET, SOCK_STREAM | SOCK_CLOEXEC, 0);
  if (descriptor < 0) {
    result.error_number = errno;
    return result;
  }
  struct sockaddr_in address;
  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_port = htons((unsigned short)port);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  errno = 0;
  int connected = connect(descriptor, (struct sockaddr *)&address, sizeof(address));
  result.ok = connected == 0;
  result.error_number = connected == 0 ? 0 : errno;
  close(descriptor);
  return result;
}

static char *joined_path(const char *directory, const char *leaf) {
  if (directory == NULL || directory[0] == '\0') return NULL;
  size_t length = strlen(directory) + strlen(leaf) + 2;
  char *result = calloc(length, 1);
  if (result == NULL) return NULL;
  snprintf(result, length, "%s/%s", directory, leaf);
  return result;
}

static void emit_final(const char *text) {
  fputs("{\"type\":\"message_end\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":", stdout);
  print_json_string(text);
  fputs("}],\"stopReason\":\"stop\",\"usage\":{\"input\":1,\"output\":1,\"cacheRead\":0,\"cacheWrite\":0,\"cost\":{\"total\":0}}}}\n", stdout);
  fputs("{\"type\":\"agent_settled\"}\n", stdout);
  fflush(stdout);
}

static void boundary_report(bool implementer) {
  char leaf[96];
  snprintf(leaf, sizeof(leaf), "qq-pilot-probe-%ld", (long)getpid());
  char *repository_path = joined_path(getenv("QQ_PILOT_WORKTREE"), leaf);
  char *common_git_path = joined_path(getenv("QQ_PILOT_GIT_COMMON_DIR"), leaf);
  char *worktree_git_path = joined_path(getenv("QQ_PILOT_GIT_WORKTREE_DIR"), leaf);
  char *runtime_path = joined_path(getenv("QQ_PILOT_RUN_DIR"), leaf);

  struct attempt repository = try_write(repository_path);
  struct attempt common_git = try_write(common_git_path);
  struct attempt worktree_git = try_write(worktree_git_path);
  struct attempt runtime = try_write(runtime_path);
  struct attempt escape = try_write(getenv("QQ_PILOT_ESCAPE_PATH"));
  struct attempt decoy = try_write(getenv("QQ_PILOT_DECOY_PATH"));
  struct attempt network = try_loopback();

  fputs("{\"type\":\"qq_pilot_report\",\"scenario\":", stdout);
  print_json_string(implementer ? "boundary-implementer" : "boundary-readonly");
  putchar(',');
  print_attempt("repositoryWrite", repository, true);
  print_attempt("gitCommonWrite", common_git, true);
  print_attempt("gitWorktreeWrite", worktree_git, true);
  print_attempt("runtimeWrite", runtime, true);
  print_attempt("escapeWrite", escape, true);
  print_attempt("decoyWrite", decoy, true);
  print_attempt("loopbackConnect", network, false);
  fputs("}\n", stdout);
  fflush(stdout);

  free(repository_path);
  free(common_git_path);
  free(worktree_git_path);
  free(runtime_path);
  emit_final("pilot boundary probe complete");
}

static void launch_report(int argc, char **argv) {
  fputs("{\"type\":\"qq_pilot_report\",\"scenario\":\"launch-record\",\"argv\":[", stdout);
  for (int index = 1; index < argc; index++) {
    if (index > 1) putchar(',');
    print_json_string(argv[index]);
  }
  fputs("],\"role\":", stdout);
  print_json_string(env_or_empty("PI_SUBAGENT_CHILD_AGENT"));
  fputs(",\"inheritProjectContext\":", stdout);
  print_json_string(env_or_empty("PI_SUBAGENT_INHERIT_PROJECT_CONTEXT"));
  fputs(",\"inheritSkills\":", stdout);
  print_json_string(env_or_empty("PI_SUBAGENT_INHERIT_SKILLS"));
  fputs(",\"policyIdentity\":", stdout);
  print_json_string(env_or_empty("QQ_PILOT_POLICY_IDENTITY"));
  fputs("}\n", stdout);
  fflush(stdout);
  emit_final("pilot launch record complete");
}

static struct attempt write_payload(const char *payload) {
  struct attempt result = { .ok = false, .error_number = EINVAL };
  const char *path = getenv("PI_SUBAGENT_STRUCTURED_OUTPUT_CAPTURE");
  if (path == NULL || path[0] == '\0') return result;
  errno = 0;
  int descriptor = open(path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
  if (descriptor < 0) {
    result.error_number = errno;
    return result;
  }
  size_t length = strlen(payload);
  ssize_t written = write(descriptor, payload, length);
  result.ok = written == (ssize_t)length;
  result.error_number = result.ok ? 0 : errno;
  close(descriptor);
  return result;
}

static void schema_scenario(const char *scenario) {
  bool attempted = true;
  struct attempt capture = { .ok = false, .error_number = EINVAL };
  if (strcmp(scenario, "schema-valid") == 0) {
    capture = write_payload("{\"status\":\"complete\",\"summary\":\"done\","
                            "\"commits\":[\"deadbeef pilot fixture\"],"
                            "\"checks\":[{\"name\":\"probe\",\"result\":\"pass\"}],"
                            "\"filesChanged\":[\"pilot/example\"],\"contestableDecisions\":[],"
                            "\"openQuestions\":[],\"unresolvedRisks\":[],"
                            "\"branch\":\"feat/pilot-fixture\",\"worktree\":\"/assigned/worktree\"}");
  } else if (strcmp(scenario, "schema-invalid-json") == 0) {
    capture = write_payload("not-json");
  } else if (strcmp(scenario, "schema-missing-commits") == 0) {
    capture = write_payload("{\"status\":\"complete\",\"summary\":\"done\","
                            "\"checks\":[{\"name\":\"probe\",\"result\":\"pass\"}],"
                            "\"filesChanged\":[],\"contestableDecisions\":[],"
                            "\"openQuestions\":[],\"unresolvedRisks\":[],"
                            "\"branch\":\"feat/pilot-fixture\",\"worktree\":\"/assigned/worktree\"}");
  } else if (strcmp(scenario, "schema-empty-object") == 0) {
    capture = write_payload("{}");
  } else if (strcmp(scenario, "schema-empty-fields") == 0) {
    capture = write_payload("{\"status\":\"complete\",\"summary\":\"\",\"commits\":[],"
                            "\"checks\":[],\"filesChanged\":[],\"contestableDecisions\":[],"
                            "\"openQuestions\":[],\"unresolvedRisks\":[],\"branch\":\"\",\"worktree\":\"\"}");
  } else {
    attempted = false;
  }
  fputs("{\"type\":\"qq_pilot_report\",\"scenario\":\"structured-output-capture\",\"attempted\":", stdout);
  fputs(attempted ? "true," : "false,", stdout);
  print_attempt("captureWrite", capture, false);
  fputs("}\n", stdout);
  fflush(stdout);
  emit_final("pilot schema probe complete");
}

static void ignore_cleanup_signals(void) {
  signal(SIGINT, SIG_IGN);
  signal(SIGTERM, SIG_IGN);
  signal(SIGHUP, SIG_IGN);
}

static void emit_process(const char *name) {
  fputs("{\"type\":\"qq_pilot_process\",\"name\":", stdout);
  print_json_string(name);
  printf(",\"pid\":%ld}\n", (long)getpid());
  fflush(stdout);
}

static void wait_forever(void) {
  for (;;) pause();
}

static void spawn_direct_descendant(const char *name) {
  pid_t child = fork();
  if (child < 0) _exit(90);
  if (child == 0) {
    emit_process(name);
    wait_forever();
  }
}

static void spawn_orphan(void) {
  pid_t launcher = fork();
  if (launcher < 0) _exit(91);
  if (launcher == 0) {
    if (setsid() < 0) _exit(92);
    pid_t orphan = fork();
    if (orphan < 0) _exit(93);
    if (orphan > 0) _exit(0);
    emit_process("orphan");
    wait_forever();
  }
  waitpid(launcher, NULL, 0);
}

static void tree_scenario(void) {
  ignore_cleanup_signals();
  emit_process("pi");
  spawn_direct_descendant("tool");
  spawn_direct_descendant("mcp");
  spawn_orphan();
  wait_forever();
}

int main(int argc, char **argv) {
  setvbuf(stdout, NULL, _IOLBF, 0);
  const char *scenario = env_or_empty("QQ_PILOT_SCENARIO");
  if (strcmp(scenario, "boundary-readonly") == 0) {
    boundary_report(false);
  } else if (strcmp(scenario, "boundary-implementer") == 0) {
    boundary_report(true);
  } else if (strcmp(scenario, "launch-record") == 0) {
    launch_report(argc, argv);
  } else if (strncmp(scenario, "schema-", 7) == 0) {
    schema_scenario(scenario);
  } else if (strcmp(scenario, "tree") == 0) {
    tree_scenario();
  } else {
    emit_final("pilot child complete");
  }
  return 0;
}
