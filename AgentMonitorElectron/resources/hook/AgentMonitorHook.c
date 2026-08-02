#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>

static void join_path(wchar_t *out, size_t capacity, const wchar_t *base, const wchar_t *name) {
  _snwprintf(out, capacity, L"%ls\\%ls", base, name);
  out[capacity - 1] = L'\0';
}

static int read_file(const wchar_t *path, char *buffer, DWORD capacity, FILETIME *modified) {
  HANDLE file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                            NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) return 0;
  DWORD size = GetFileSize(file, NULL);
  if (size == INVALID_FILE_SIZE || size >= capacity) { CloseHandle(file); return 0; }
  DWORD read = 0;
  int ok = ReadFile(file, buffer, size, &read, NULL) && read == size;
  if (ok && modified) ok = GetFileTime(file, NULL, NULL, modified);
  CloseHandle(file);
  if (!ok) return 0;
  buffer[read] = '\0';
  return 1;
}

static int json_string(const char *json, const char *key, char *out, size_t capacity) {
  char needle[96];
  _snprintf(needle, sizeof(needle), "\"%s\"", key);
  const char *cursor = strstr(json, needle);
  if (!cursor) return 0;
  cursor = strchr(cursor + strlen(needle), ':');
  if (!cursor) return 0;
  cursor++;
  while (*cursor == ' ' || *cursor == '\t' || *cursor == '\r' || *cursor == '\n') cursor++;
  if (*cursor++ != '"') return 0;
  size_t length = 0;
  while (*cursor && *cursor != '"') {
    if (*cursor == '\\') return 0;
    if (length + 1 >= capacity) return 0;
    out[length++] = *cursor++;
  }
  if (*cursor != '"') return 0;
  out[length] = '\0';
  return 1;
}

static uint64_t unix_millis(void) {
  FILETIME now;
  GetSystemTimeAsFileTime(&now);
  ULARGE_INTEGER value;
  value.LowPart = now.dwLowDateTime;
  value.HighPart = now.dwHighDateTime;
  return (value.QuadPart - 116444736000000000ULL) / 10000ULL;
}

typedef enum QueueResult {
  QUEUE_OK = 0,
  QUEUE_RUNTIME_READ_FAILED,
  QUEUE_RUNTIME_STALE,
  QUEUE_RUNTIME_VERSION_INVALID,
  QUEUE_RUNTIME_TRANSPORT_INVALID,
  QUEUE_RUNTIME_TOKEN_INVALID,
  QUEUE_INBOX_CREATE_FAILED,
  QUEUE_REQUEST_ENCODE_FAILED,
  QUEUE_EVENT_OPEN_FAILED,
  QUEUE_EVENT_WRITE_FAILED,
  QUEUE_EVENT_MOVE_FAILED
} QueueResult;

static const wchar_t *queue_result_code(QueueResult result) {
  switch (result) {
    case QUEUE_RUNTIME_READ_FAILED: return L"RUNTIME_READ_FAILED";
    case QUEUE_RUNTIME_STALE: return L"RUNTIME_STALE";
    case QUEUE_RUNTIME_VERSION_INVALID: return L"RUNTIME_VERSION_INVALID";
    case QUEUE_RUNTIME_TRANSPORT_INVALID: return L"RUNTIME_TRANSPORT_INVALID";
    case QUEUE_RUNTIME_TOKEN_INVALID: return L"RUNTIME_TOKEN_INVALID";
    case QUEUE_INBOX_CREATE_FAILED: return L"INBOX_CREATE_FAILED";
    case QUEUE_REQUEST_ENCODE_FAILED: return L"REQUEST_ENCODE_FAILED";
    case QUEUE_EVENT_OPEN_FAILED: return L"EVENT_OPEN_FAILED";
    case QUEUE_EVENT_WRITE_FAILED: return L"EVENT_WRITE_FAILED";
    case QUEUE_EVENT_MOVE_FAILED: return L"EVENT_MOVE_FAILED";
    default: return L"UNKNOWN";
  }
}

static void write_diagnostic(const wchar_t *ipc_dir, QueueResult result, const char *source,
                             DWORD windows_error) {
  wchar_t path[MAX_PATH];
  join_path(path, MAX_PATH, ipc_dir, L"hook-error.log");
  HANDLE file = CreateFileW(path, GENERIC_WRITE, FILE_SHARE_READ, NULL, OPEN_ALWAYS,
                            FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) return;
  LARGE_INTEGER size;
  if (GetFileSizeEx(file, &size) && size.QuadPart >= (100LL * 1024LL * 1024LL - 2048LL)) {
    SetFilePointer(file, 0, NULL, FILE_BEGIN);
    SetEndOfFile(file);
  } else {
    SetFilePointer(file, 0, NULL, FILE_END);
  }
  wchar_t message[512];
  _snwprintf(message, 512,
    L"[%llu] [error] component=hook event=queue_failed code=%ls source=%S pid=%lu windowsError=%lu\n",
    (unsigned long long)unix_millis(), queue_result_code(result), source,
    (unsigned long)GetCurrentProcessId(), (unsigned long)windows_error);
  message[511] = L'\0';
  char utf8[1024];
  int length = WideCharToMultiByte(CP_UTF8, 0, message, -1, utf8, sizeof(utf8), NULL, NULL);
  if (length > 1) {
    DWORD written;
    WriteFile(file, utf8, (DWORD)(length - 1), &written, NULL);
  }
  CloseHandle(file);
}

static QueueResult queue_event(const char *source, wchar_t *ipc_dir, DWORD *windows_error) {
  wchar_t runtime_path[MAX_PATH], inbox_dir[MAX_PATH], temporary[MAX_PATH], destination[MAX_PATH];
  join_path(runtime_path, MAX_PATH, ipc_dir, L"runtime.json");
  join_path(inbox_dir, MAX_PATH, ipc_dir, L"inbox");

  char runtime[8192], token[256];
  FILETIME modified, now;
  if (!read_file(runtime_path, runtime, sizeof(runtime), &modified)) {
    *windows_error = GetLastError();
    return QUEUE_RUNTIME_READ_FAILED;
  }
  GetSystemTimeAsFileTime(&now);
  ULARGE_INTEGER modified_value, now_value;
  modified_value.LowPart = modified.dwLowDateTime;
  modified_value.HighPart = modified.dwHighDateTime;
  now_value.LowPart = now.dwLowDateTime;
  now_value.HighPart = now.dwHighDateTime;
  if (now_value.QuadPart > modified_value.QuadPart + 100000000ULL) return QUEUE_RUNTIME_STALE;
  if (!strstr(runtime, "\"version\": 1") && !strstr(runtime, "\"version\":1"))
    return QUEUE_RUNTIME_VERSION_INVALID;
  if (!strstr(runtime, "\"transport\": \"file\"") && !strstr(runtime, "\"transport\":\"file\""))
    return QUEUE_RUNTIME_TRANSPORT_INVALID;
  if (!json_string(runtime, "token", token, sizeof(token)) || strlen(token) < 16)
    return QUEUE_RUNTIME_TOKEN_INVALID;

  if (!CreateDirectoryW(inbox_dir, NULL) && GetLastError() != ERROR_ALREADY_EXISTS) {
    *windows_error = GetLastError();
    return QUEUE_INBOX_CREATE_FAILED;
  }
  DWORD pid = GetCurrentProcessId();
  ULONGLONG tick = GetTickCount64();
  _snwprintf(temporary, MAX_PATH, L"%ls\\.%lu-%llu.tmp", inbox_dir, (unsigned long)pid, tick);
  _snwprintf(destination, MAX_PATH, L"%ls\\%lu-%llu.json", inbox_dir, (unsigned long)pid, tick);

  char request[2048];
  int length = _snprintf(request, sizeof(request),
    "{\"protocolVersion\":1,\"token\":\"%s\",\"event\":{\"version\":1,\"traceId\":\"evt-hook-%lu-%llu\",\"source\":\"%s\",\"eventType\":\"turnStopped\",\"sessionId\":null,\"turnId\":null,\"cwd\":null,\"timestamp\":%llu}}\n",
    token, (unsigned long)pid, tick, source, (unsigned long long)unix_millis());
  if (length <= 0 || length >= (int)sizeof(request)) return QUEUE_REQUEST_ENCODE_FAILED;

  HANDLE file = CreateFileW(temporary, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                            FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) {
    *windows_error = GetLastError();
    return QUEUE_EVENT_OPEN_FAILED;
  }
  DWORD written = 0;
  int ok = WriteFile(file, request, (DWORD)length, &written, NULL) && written == (DWORD)length;
  FlushFileBuffers(file);
  CloseHandle(file);
  if (!ok) {
    *windows_error = GetLastError();
    DeleteFileW(temporary);
    return QUEUE_EVENT_WRITE_FAILED;
  }
  if (!MoveFileExW(temporary, destination, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
    *windows_error = GetLastError();
    DeleteFileW(temporary);
    return QUEUE_EVENT_MOVE_FAILED;
  }
  return QUEUE_OK;
}

int main(int argc, char **argv) {
  wchar_t temp[MAX_PATH], ipc_dir[MAX_PATH];
  DWORD length = GetTempPathW(MAX_PATH, temp);
  const char *source = argc > 1 ? argv[1] : "";
  if (length == 0 || length >= MAX_PATH || (strcmp(source, "codex") && strcmp(source, "claude"))) {
    fputs("{\"continue\":true}\n", stdout);
    return 0;
  }
  while (length > 0 && (temp[length - 1] == L'\\' || temp[length - 1] == L'/')) temp[--length] = L'\0';
  join_path(ipc_dir, MAX_PATH, temp, L"agent-monitor-ipc");
  CreateDirectoryW(ipc_dir, NULL);

  /* Drain stdin so Codex can complete its normal hook protocol. */
  char drain[4096];
  while (fread(drain, 1, sizeof(drain), stdin) > 0) { }

  DWORD windows_error = ERROR_SUCCESS;
  QueueResult result = queue_event(source, ipc_dir, &windows_error);
  if (result != QUEUE_OK) write_diagnostic(ipc_dir, result, source, windows_error);
  /* Monitoring must never fail or block the user's Codex turn. */
  fputs("{\"continue\":true}\n", stdout);
  fflush(stdout);
  return 0;
}
